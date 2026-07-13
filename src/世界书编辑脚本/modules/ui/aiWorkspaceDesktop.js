import { getWorldbookNamesSafe } from '../api.js';
import { AI_CONTENT_ID } from '../config.js';
import {
  applyAiPreview,
  collectAiTargetEntries,
  generateAiPlan,
  generateAiPreview,
} from '../features/aiActionsBatch.js';
import { getRollbackPreview, rollbackLastTransaction } from '../features/history.js';
import { cancelLlmGeneration, requestLlmText } from '../features/llmClient.js';
import { flushAiWorkspaceSettings, getAiWorkspaceSettings, setAiWorkspaceSettings } from '../settings.js';
import { errorCatched } from '../utils.js';
import { canEnterAiWorkflowPhase, deriveAiWorkflowCapabilities } from './aiWorkflowState.js';

const ROOT_ID = 'lorebook-ai-workspace';
const MODEL_LIST_ID = 'lorebook-ai-model-list';
const STRATEGIES = [
  { key: 'direct', label: '直接修改', icon: 'fa-solid fa-wand-magic-sparkles' },
  { key: 'plan', label: '先规划', icon: 'fa-solid fa-route' },
];
const SOURCES = [
  ['openai', 'OpenAI'],
  ['openrouter', 'OpenRouter'],
  ['claude', 'Claude'],
  ['google', 'Gemini'],
  ['groq', 'Groq'],
  ['mistral', 'Mistral'],
  ['deepseek', 'DeepSeek'],
  ['custom', '自定义(OpenAI兼容)'],
];
const MODE_STEPS = {
  direct: ['prepare', 'review', 'complete'],
  plan: ['prepare', 'planReview', 'review', 'complete'],
};
const STEP_LABELS = {
  prepare: '准备',
  planReview: '计划审阅',
  review: '修改审阅',
  complete: '完成',
};
const STEP_DESCRIPTIONS = {
  prepare: '设定目标、修改范围和指令。所有输入变化都会使旧结果失效。',
  planReview: '检查 AI 提议的目标、规则与条目分组，再生成实际修改。',
  review: '逐条核对差异、编辑或排除结果，然后显式应用。',
  complete: '本次应用已完成；可撤销最近事务或开始下一次修改。',
};
const AI_WORKSPACE_SURFACE = 'rgba(0,0,0,.68)';
const EMPTY_PREVIEW_TEXT = '尚未生成预览。';
const EMPTY_PLAN_TEXT = '尚未生成改造方案。';
const MANUAL_CHAT_CONTEXT_NAME = '__ai_workspace_manual_chat_context__';

function createEmptyModeState() {
  return {
    lorebookName: '',
    searchText: '',
    instruction: '',
    currentStep: 'prepare',
    editableFields: {
      title: true,
      content: true,
      prompt: true,
    },
    promptSettings: {
      jailbreakPromptTemplate: '',
      builtinPromptTemplate: '',
      planningPromptTemplate: '',
    },
    selectedEntryUids: new Set(),
    readonlyEntryUids: new Set(),
    planningResult: null,
    previewResult: null,
    debugInfo: {},
    statusText: '',
    planEditorError: '',
    lastApplyResult: null,
    entries: [],
    loadedLorebookName: '',
  };
}

function buildEntryPromptSnapshot(entry = {}) {
  return {
    primary: Array.isArray(entry?.strategy?.keys) ? [...entry.strategy.keys] : [],
    secondaryLogic: entry?.strategy?.keys_secondary?.logic || 'and_any',
    secondary: Array.isArray(entry?.strategy?.keys_secondary?.keys) ? [...entry.strategy.keys_secondary.keys] : [],
  };
}

function mapWorkspaceEntry(entry = {}) {
  return {
    uid: Number(entry.uid),
    name: entry.name || '',
    content: entry.content || '',
    promptSnapshot: buildEntryPromptSnapshot(entry),
  };
}

function areWorkspaceEntriesEqual(previousEntries = [], nextEntries = []) {
  if (previousEntries.length !== nextEntries.length) {
    return false;
  }

  return previousEntries.every((entry, index) => {
    const nextEntry = nextEntries[index];
    return (
      Number(entry?.uid) === Number(nextEntry?.uid) &&
      (entry?.name || '') === (nextEntry?.name || '') &&
      (entry?.content || '') === (nextEntry?.content || '') &&
      _.isEqual(entry?.promptSnapshot || {}, nextEntry?.promptSnapshot || {})
    );
  });
}

const state = {
  worldbookNames: [],
  modelOptions: [],
  modelStatusText: '',
  sharedStatusText: '',
  currentNav: 'direct',
  isGenerating: false,
  isAssistantGenerating: false,
  activeGenerationId: '',
  stopRequested: false,
  previewRunId: 0,
  initialized: false,
  hydrated: false,
  chatContext: { enabled: false, messageCount: 10 },
  chatMessages: [],
  chatContextManual: false,
  chatContextManualText: '',
  referenceMaterial: '',
  assistantChatHistory: [],
  assistantModalTab: 'chat',
  assistantSelectedText: '',
  lastFocusedElement: null,
  persistTimer: null,
  entryCluster: null,
  resizeObserver: null,
  modes: {
    direct: createEmptyModeState(),
    plan: createEmptyModeState(),
  },
};

const parentDoc = () => window.parent.document;
const container = () => $(`#${AI_CONTENT_ID} .ai-workspace-list-container`, parentDoc());
const root = () => $(`#${ROOT_ID}`, parentDoc());
const settings = () => getAiWorkspaceSettings();
const currentModeKey = () => (state.currentNav === 'plan' ? 'plan' : 'direct');
const currentModeState = () => state.modes[currentModeKey()];

function workflowSnapshot(modeKey = currentModeKey()) {
  const mode = state.modes[modeKey];
  return {
    strategy: modeKey,
    phase: mode.currentStep,
    draft: {
      instruction: mode.instruction || '',
      selectedEntryUids: Array.from(mode.selectedEntryUids),
      readonlyEntryUids: Array.from(mode.readonlyEntryUids),
      excludedEntryUids: [],
    },
    planningResult: mode.planningResult,
    planIsValid: !mode.planEditorError,
    previewResult: mode.previewResult ? { ...mode.previewResult, entries: mode.previewResult.items || [] } : null,
    generation: {
      status: state.isGenerating ? (state.stopRequested ? 'stopping' : 'running') : 'idle',
      kind: null,
      runId: state.previewRunId,
      generationId: state.activeGenerationId || 0,
    },
    application: {
      status: mode.currentStep === 'complete' ? 'complete' : 'idle',
      result: mode.lastApplyResult,
    },
    error: null,
  };
}

function getNavItemLabel(navKey = state.currentNav) {
  return STRATEGIES.find(item => item.key === navKey)?.label || '直接修改';
}

function getStepDescription(step) {
  return STEP_DESCRIPTIONS[step] || '';
}

function normalizeChatContextCount(value) {
  const parsed = Number.parseInt(`${value ?? 10}`, 10);
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return Math.min(50, Math.max(0, parsed));
}

function currentChatContextSettings() {
  const $enabled = $('#ai-workspace-chat-context-enabled', parentDoc());
  return {
    enabled: $enabled.length ? $enabled.prop('checked') === true : state.chatContext.enabled === true,
    messageCount: normalizeChatContextCount($('#ai-workspace-chat-context-count', parentDoc()).val()),
  };
}

function buildManualChatContextMessages(text = '') {
  const content = `${text || ''}`.trim();
  if (!content) {
    return [];
  }
  return [
    {
      message_id: -1,
      name: MANUAL_CHAT_CONTEXT_NAME,
      role: 'system',
      message: content,
    },
  ];
}

function isManualChatContextMessages(chatMessages = []) {
  return Array.isArray(chatMessages) && chatMessages.length === 1 && chatMessages[0]?.name === MANUAL_CHAT_CONTEXT_NAME;
}

function currentChatContextText() {
  const $preview = $('#ai-workspace-chat-context-preview', parentDoc());
  if ($preview.length) {
    return ($preview.val() || '').toString();
  }
  return formatChatContextPreview(state.chatMessages);
}

function currentChatMessagesForRequest() {
  if (state.chatContext.enabled !== true) {
    return [];
  }
  if (state.chatContextManual) {
    return buildManualChatContextMessages(currentChatContextText());
  }
  return _.cloneDeep(state.chatMessages);
}

export function isDesktopAiWorkspace() {
  return true;
}

function normalizeNavMode(mode) {
  return STRATEGIES.some(item => item.key === mode) ? mode : 'direct';
}

function normalizeStep(modeKey, step) {
  return MODE_STEPS[modeKey]?.includes(step) ? step : 'prepare';
}

function createModeState(saved = {}, fallback = {}) {
  return {
    ...createEmptyModeState(),
    ...fallback,
    ...saved,
    currentStep: normalizeStep(fallback.modeKey || 'direct', saved?.currentStep || fallback?.currentStep),
    editableFields: {
      ...createEmptyModeState().editableFields,
      ...(fallback?.editableFields || {}),
      ...(saved?.editableFields || {}),
    },
    promptSettings: {
      ...createEmptyModeState().promptSettings,
      ...(fallback?.promptSettings || {}),
      ...(saved?.promptSettings || {}),
    },
    selectedEntryUids: new Set(saved?.selectedEntryUids || fallback?.selectedEntryUids || []),
    readonlyEntryUids: new Set(saved?.readonlyEntryUids || fallback?.readonlyEntryUids || []),
    planningResult: saved?.planningResult || null,
    previewResult: saved?.previewResult || null,
    debugInfo: saved?.debugInfo || saved?.previewResult?.debug || {},
    entries: [],
    loadedLorebookName: '',
  };
}

function hydrateStateFromSettings() {
  const saved = settings();
  const fallback = {
    lorebookName: saved.lorebookName || '',
    editableFields: saved.editableFields || {},
    promptSettings: saved.promptSettings || {},
    instruction: '',
    searchText: '',
    selectedEntryUids: [],
    readonlyEntryUids: [],
    planningResult: null,
    previewResult: null,
    debugInfo: {},
    statusText: '',
  };

  const savedDraft = saved.draft || {};
  state.currentNav = normalizeNavMode(savedDraft.strategy || saved.navMode || 'direct');
  state.modelStatusText = '';
  state.sharedStatusText = '';
  state.chatContext = {
    enabled: saved.chatContext?.enabled === true,
    messageCount: normalizeChatContextCount(saved.chatContext?.messageCount),
  };
  state.chatMessages = _.cloneDeep(saved.chatMessages || []);
  state.chatContextManual = saved.chatContext?.mode === 'manual';
  state.chatContextManualText = typeof saved.chatContext?.manualText === 'string' ? saved.chatContext.manualText : '';
  state.referenceMaterial = saved.referenceMaterial || '';
  state.assistantChatHistory = _.cloneDeep(saved.assistantChatHistory || []);
  const legacyMode = state.currentNav === 'plan' ? saved.plan : saved.direct;
  const task = createModeState(savedDraft, {
    ...fallback,
    ...(legacyMode || {}),
    modeKey: state.currentNav,
    currentStep: 'prepare',
    planningResult: null,
    previewResult: null,
    debugInfo: {},
    statusText: '',
  });
  task.currentStep = 'prepare';
  task.planningResult = null;
  task.previewResult = null;
  task.debugInfo = {};
  task.lastApplyResult = null;
  state.modes.direct = task;
  state.modes.plan = task;
  state.hydrated = true;
}

function serializeModeState(modeKey) {
  const mode = state.modes[modeKey];
  return {
    lorebookName: mode.lorebookName,
    searchText: mode.searchText,
    instruction: mode.instruction,
    currentStep: mode.currentStep,
    editableFields: { ...mode.editableFields },
    promptSettings: { ...mode.promptSettings },
    selectedEntryUids: Array.from(mode.selectedEntryUids),
    readonlyEntryUids: Array.from(mode.readonlyEntryUids),
    planningResult: mode.planningResult,
    previewResult: mode.previewResult,
    debugInfo: mode.debugInfo,
    statusText: mode.statusText,
  };
}

function currentApiSettings() {
  const saved = settings();
  return {
    apiurl: ($('#ai-workspace-apiurl', parentDoc()).val() || saved.customApi?.apiurl || '').trim(),
    key: ($('#ai-workspace-apikey', parentDoc()).val() || saved.customApi?.key || '').trim(),
    model: ($('#ai-workspace-model', parentDoc()).val() || saved.customApi?.model || '').trim(),
    source: ($('#ai-workspace-source-select', parentDoc()).val() || saved.customApi?.source || 'openai').trim(),
  };
}

function getApiMode() {
  return ($('input[name="ai-workspace-api-mode"]:checked', parentDoc()).val() || settings().apiMode || 'preset').trim();
}

function isStreamEnabled() {
  const $toggle = $('#ai-workspace-stream', parentDoc());
  if ($toggle.length) {
    return $toggle.prop('checked');
  }
  return settings().stream === true;
}

function currentContextBudget() {
  const saved = settings();
  const savedBudget = saved.contextBudget || {};
  const $enabled = $('#ai-workspace-budget-enabled', parentDoc());
  if (!$enabled.length) {
    return {
      enabled: savedBudget.enabled !== false,
      maxInputTokens: Number(savedBudget.maxInputTokens) || 12000,
      reserveOutputTokens: Number(savedBudget.reserveOutputTokens) || 4096,
    };
  }

  const maxInputTokens = Number.parseInt($('#ai-workspace-budget-max-input', parentDoc()).val(), 10);
  const reserveOutputTokens = Number.parseInt($('#ai-workspace-budget-reserve-output', parentDoc()).val(), 10);
  return {
    enabled: $enabled.prop('checked'),
    maxInputTokens: Number.isFinite(maxInputTokens) ? maxInputTokens : 12000,
    reserveOutputTokens: Number.isFinite(reserveOutputTokens) ? reserveOutputTokens : 4096,
  };
}

function persistSettings({ mirrorModeKey = currentModeKey() } = {}) {
  const saved = settings();
  const mirrorMode = state.modes[mirrorModeKey] || state.modes.direct;
  if ($('#ai-workspace-chat-context-count', parentDoc()).length) {
    state.chatContext = currentChatContextSettings();
  }
  setAiWorkspaceSettings({
    ...saved,
    schemaVersion: 2,
    strategy: state.currentNav,
    navMode: state.currentNav,
    draft: {
      ...serializeModeState(mirrorModeKey),
      strategy: state.currentNav,
      chatContext: {
        ...state.chatContext,
        mode: state.chatContextManual ? 'manual' : 'structured',
        manualText: state.chatContextManual ? currentChatContextText() : '',
      },
      chatMessages: state.chatMessages,
      referenceMaterial: state.referenceMaterial,
      assistantChatHistory: state.assistantChatHistory,
      currentStep: undefined,
      planningResult: undefined,
      previewResult: undefined,
      debugInfo: undefined,
      statusText: undefined,
      lastApplyResult: undefined,
    },
    lorebookName: mirrorMode.lorebookName,
    editableFields: { ...mirrorMode.editableFields },
    promptSettings: { ...mirrorMode.promptSettings },
    apiMode: getApiMode(),
    stream: isStreamEnabled(),
    contextBudget: currentContextBudget(),
    customApi: currentApiSettings(),
    chatContext: {
      ...state.chatContext,
      mode: state.chatContextManual ? 'manual' : 'structured',
      manualText: state.chatContextManual ? currentChatContextText() : '',
    },
    chatMessages: state.chatMessages,
    referenceMaterial: state.referenceMaterial,
    assistantChatHistory: state.assistantChatHistory,
  });
}

function schedulePersist(modeKey = currentModeKey()) {
  if (state.persistTimer) {
    clearTimeout(state.persistTimer);
  }
  state.persistTimer = setTimeout(() => {
    state.persistTimer = null;
    persistSettings({ mirrorModeKey: modeKey });
  }, 300);
}

function selectedFields(modeKey = currentModeKey()) {
  const mode = state.modes[modeKey];
  const $title = $('#ai-workspace-field-title', parentDoc());
  if (!$title.length) {
    return { ...mode.editableFields };
  }
  return {
    title: $title.prop('checked'),
    content: $('#ai-workspace-field-content', parentDoc()).prop('checked'),
    prompt: $('#ai-workspace-field-prompt', parentDoc()).prop('checked'),
  };
}

function currentPromptSettings(modeKey = currentModeKey()) {
  const mode = state.modes[modeKey];
  const $jailbreak = $('#ai-workspace-jailbreak-prompt-template', parentDoc());
  const $planning = $('#ai-workspace-planning-prompt-template', parentDoc());
  if (!$jailbreak.length) {
    return { ...mode.promptSettings };
  }
  return {
    jailbreakPromptTemplate: ($jailbreak.val() || '').trim(),
    builtinPromptTemplate: ($('#ai-workspace-builtin-prompt-template', parentDoc()).val() || '').trim(),
    planningPromptTemplate: $planning.length
      ? ($planning.val() || '').trim()
      : mode.promptSettings.planningPromptTemplate || '',
  };
}

function captureModeInputs(modeKey = currentModeKey()) {
  const mode = state.modes[modeKey];
  const $lorebook = $('#ai-workspace-lorebook', parentDoc());
  const $search = $('#ai-workspace-search', parentDoc());
  const $instruction = $('#ai-workspace-instruction', parentDoc());

  if ($lorebook.length) {
    mode.lorebookName = ($lorebook.val() || '').trim();
  }
  if ($search.length) {
    mode.searchText = ($search.val() || '').trim();
  }
  if ($instruction.length) {
    mode.instruction = ($instruction.val() || '').trim();
  }
  if ($('#ai-workspace-field-title', parentDoc()).length) {
    mode.editableFields = selectedFields(modeKey);
  }
  if ($('#ai-workspace-jailbreak-prompt-template', parentDoc()).length) {
    mode.promptSettings = currentPromptSettings(modeKey);
  }
}

function setModeStatus(modeKey, text) {
  state.modes[modeKey].statusText = text || '';
  if (state.currentNav === modeKey) {
    $('#ai-workspace-status', parentDoc()).text(state.modes[modeKey].statusText);
  }
}

function setSharedStatus(text) {
  state.sharedStatusText = text || '';
  $('#ai-workspace-shared-status', parentDoc()).text(state.sharedStatusText);
}

function setModelStatus(text) {
  state.modelStatusText = text || '';
  $('#ai-workspace-models-status', parentDoc()).text(state.modelStatusText);
}

function setGeneratingState(isGenerating) {
  state.isGenerating = Boolean(isGenerating);
  $('#ai-workspace-plan', parentDoc()).prop('disabled', state.isGenerating);
  $('#ai-workspace-preview', parentDoc()).prop('disabled', state.isGenerating);
  $('#ai-workspace-stop', parentDoc()).prop('disabled', !state.isGenerating);
  $('.ai-strategy-button', parentDoc()).prop('disabled', state.isGenerating);
  root().attr('data-run-state', state.isGenerating ? 'running' : 'idle');
  if (!state.isGenerating) {
    state.activeGenerationId = '';
  }
}

function setMobileNavExpanded(expanded) {
  const isExpanded = Boolean(expanded);
  $('#ai-workspace-mobile-nav-list', parentDoc()).toggleClass('is-open', isExpanded);
  $('.ai-mobile-nav-toggle', parentDoc()).attr('aria-expanded', isExpanded ? 'true' : 'false');
}

function syncNavigationState({ collapseMobile = false } = {}) {
  const $buttons = $('.ai-strategy-button', parentDoc());
  $buttons.removeClass('is-active').removeAttr('aria-current');
  $(`.ai-strategy-button[data-ai-strategy="${state.currentNav}"]`, parentDoc())
    .addClass('is-active')
    .attr('aria-pressed', 'true');
  $buttons.not('.is-active').attr('aria-pressed', 'false');
  if (collapseMobile) {
    setMobileNavExpanded(false);
  }
}

function formatChatContextPreview(chatMessages = []) {
  if (!Array.isArray(chatMessages) || !chatMessages.length) {
    return '';
  }
  if (isManualChatContextMessages(chatMessages)) {
    return chatMessages[0]?.message || '';
  }

  return chatMessages
    .map(message => {
      const role = message?.role || 'system';
      const roleLabel = role === 'assistant' ? '助手' : role === 'user' ? '用户' : '系统';
      const name = message?.name ? ` / ${message.name}` : '';
      const messageId = Number.isFinite(Number(message?.message_id)) ? ` #${message.message_id}` : '';
      return `[${roleLabel}${name}${messageId}]\n${message?.message || ''}`;
    })
    .join('\n\n');
}

function renderChatContextPreview() {
  const previewText = state.chatContextManual
    ? state.chatContextManualText
    : formatChatContextPreview(state.chatMessages);
  $('#ai-workspace-chat-context-count', parentDoc()).val(state.chatContext.messageCount);
  $('#ai-workspace-chat-context-enabled', parentDoc()).prop('checked', state.chatContext.enabled === true);
  $('#ai-workspace-chat-context-preview', parentDoc()).val(previewText);
  $('#ai-workspace-chat-context-preview', parentDoc()).prop('disabled', state.chatContext.enabled !== true);
  const summary =
    state.chatContext.enabled !== true
      ? '未开启：生成计划或预览时不会注入聊天上下文。'
      : previewText.trim()
        ? `${state.chatContextManual ? '手工文本' : `结构化消息 ${state.chatMessages.length} 条`}，共 ${previewText.trim().length} 个字符。`
        : '已开启，但尚未获取聊天消息。';
  $('#ai-workspace-chat-context-status', parentDoc()).text(summary);
  $('#ai-workspace-chat-context-mode', parentDoc()).text(state.chatContextManual ? '手工编辑' : '结构化消息');
  if (root().length) {
    updateWorkbenchHeader();
  }
}

function renderReferenceMaterial() {
  $('#ai-workspace-reference-material', parentDoc()).val(state.referenceMaterial || '');
  syncReferenceMaterialStatus();
}

function syncReferenceMaterialStatus() {
  const trimmed = (state.referenceMaterial || '').trim();
  const statusText = trimmed ? `资料区已填写 ${trimmed.length} 个字符，将注入到 <参考资料>。` : '资料区为空。';
  const assistantStatusText = trimmed ? `${trimmed.length} 字资料` : '资料为空';
  $('#ai-workspace-reference-material-status', parentDoc())
    .text(statusText)
    .attr('data-empty', trimmed ? 'false' : 'true');
  $('#ai-workspace-assistant-reference-status', parentDoc()).text(assistantStatusText);
  if (root().length) {
    updateWorkbenchHeader();
  }
}

function renderAssistantHistory() {
  const $history = $('#ai-workspace-assistant-history', parentDoc());
  if (!$history.length) {
    return;
  }

  $history.empty();
  if (!state.assistantChatHistory.length) {
    $history.append('<div class="ai-empty">还没有对话内容。</div>');
    return;
  }

  state.assistantChatHistory.forEach((item, index) => {
    const isAssistant = item.role === 'assistant';
    $history.append(`
      <div class="ai-assistant-message${isAssistant ? ' is-assistant' : ' is-user'}">
        <div class="ai-assistant-message-meta">${isAssistant ? 'AI 助手' : '用户'}</div>
        <div class="ai-assistant-message-body">${_.escape(item.content || '')}</div>
        <div class="ai-assistant-actions">
          ${isAssistant ? `<button type="button" class="ai-assistant-pick ai-button-secondary" data-history-index="${index}">选取到资料区</button>` : ''}
          <button type="button" class="ai-assistant-delete ai-button-danger" data-history-index="${index}">删除</button>
        </div>
      </div>
    `);
  });
}

function setAssistantStatus(text) {
  $('#ai-workspace-assistant-status', parentDoc()).text(text || '');
}

function setAssistantGeneratingState(isGenerating) {
  state.isAssistantGenerating = Boolean(isGenerating);
  $('#ai-workspace-assistant-send', parentDoc()).prop('disabled', state.isAssistantGenerating);
}

function switchAssistantTab(tab = 'chat') {
  const nextTab = tab === 'reference' ? 'reference' : 'chat';
  state.assistantModalTab = nextTab;
  $('.ai-assistant-tab', parentDoc()).each(function () {
    const isActive = ($(this).attr('data-assistant-tab') || 'chat') === nextTab;
    $(this)
      .toggleClass('is-active', isActive)
      .attr('aria-selected', isActive ? 'true' : 'false');
  });
  $('.ai-assistant-tab-panel', parentDoc()).each(function () {
    const isActive = ($(this).attr('data-assistant-panel') || 'chat') === nextTab;
    $(this).css('display', isActive ? 'flex' : 'none');
  });
  hideAssistantSelectionToolbar();
}

function openAssistantModal(tab = state.assistantModalTab || 'chat') {
  state.lastFocusedElement = parentDoc().activeElement;
  renderReferenceMaterial();
  renderAssistantHistory();
  switchAssistantTab(tab);
  $('#ai-workspace-assistant-modal', parentDoc()).css('display', 'flex').attr('aria-hidden', 'false');
  setTimeout(() => $('#ai-workspace-assistant-close', parentDoc()).trigger('focus'), 0);
}

function closeAssistantModal() {
  $('#ai-workspace-assistant-modal', parentDoc()).hide().attr('aria-hidden', 'true');
  hideAssistantSelectionToolbar();
  state.lastFocusedElement?.focus?.();
  state.lastFocusedElement = null;
}

function openSettingsDrawer() {
  state.lastFocusedElement = parentDoc().activeElement;
  syncApiForm();
  $('#ai-workspace-settings-modal', parentDoc()).css('display', 'flex').attr('aria-hidden', 'false');
  setTimeout(() => $('#ai-workspace-settings-close', parentDoc()).trigger('focus'), 0);
}

function closeSettingsDrawer() {
  $('#ai-workspace-settings-modal', parentDoc()).hide().attr('aria-hidden', 'true');
  updateWorkbenchHeader();
  state.lastFocusedElement?.focus?.();
  state.lastFocusedElement = null;
}

function hideAssistantSelectionToolbar() {
  state.assistantSelectedText = '';
  $('#ai-workspace-assistant-selection-toolbar', parentDoc()).hide();
}

function appendTextToReferenceMaterial(text, toastText = '已追加到资料区') {
  const content = `${text || ''}`.trim();
  if (!content) {
    return;
  }

  const nextValue = state.referenceMaterial.trim() ? `${state.referenceMaterial.trim()}\n\n${content}` : content;
  setReferenceMaterial(nextValue, { invalidateOutputs: true });
  window.toastr?.success(toastText);
}

function updateAssistantSelectionToolbar() {
  const selection = parentDoc().getSelection?.();
  const $history = $('#ai-workspace-assistant-history', parentDoc());
  const historyElement = $history.get(0);

  if (!selection || !historyElement || !selection.rangeCount || selection.isCollapsed) {
    hideAssistantSelectionToolbar();
    return;
  }

  const selectedText = selection.toString().trim();
  const range = selection.getRangeAt(0);
  const startNode = range.startContainer;
  const endNode = range.endContainer;
  if (!selectedText || !historyElement.contains(startNode) || !historyElement.contains(endNode)) {
    hideAssistantSelectionToolbar();
    return;
  }

  const phoneElement = $('.ai-assistant-phone', parentDoc()).get(0);
  const toolbar = $('#ai-workspace-assistant-selection-toolbar', parentDoc());
  if (!phoneElement || !toolbar.length) {
    return;
  }

  const rangeRect = range.getBoundingClientRect();
  const phoneRect = phoneElement.getBoundingClientRect();
  const left = Math.max(74, Math.min(phoneRect.width - 74, rangeRect.left - phoneRect.left + rangeRect.width / 2));
  const top = Math.max(52, rangeRect.top - phoneRect.top - 8);
  state.assistantSelectedText = selectedText;
  toolbar.css({ display: 'flex', left: `${left}px`, top: `${top}px` });
}

function appendSelectedAssistantTextToReferenceMaterial() {
  const text = state.assistantSelectedText || parentDoc().getSelection?.()?.toString()?.trim() || '';
  appendTextToReferenceMaterial(text, '已将选中内容追加到资料区');
  parentDoc().getSelection?.()?.removeAllRanges?.();
  hideAssistantSelectionToolbar();
}

function invalidateModeOutputs(modeKey, { clearPlan = modeKey === 'plan' } = {}) {
  const mode = state.modes[modeKey];
  mode.previewResult = null;
  mode.debugInfo = {};
  mode.lastApplyResult = null;
  if (clearPlan) {
    mode.planningResult = null;
    mode.planEditorError = '';
    if (mode.currentStep !== 'prepare') {
      mode.currentStep = 'prepare';
    }
  } else if (mode.currentStep === 'review' || mode.currentStep === 'complete') {
    mode.currentStep = 'prepare';
  }
}

function getFilteredEntries(modeKey) {
  const mode = state.modes[modeKey];
  const keyword = (mode.searchText || '').trim().toLowerCase();
  return keyword
    ? mode.entries.filter(entry =>
        [entry.name, entry.content, entry.uid]
          .map(value => `${value ?? ''}`.toLowerCase())
          .some(value => value.includes(keyword)),
      )
    : mode.entries;
}

function getEntryMode(modeKey, uid) {
  const mode = state.modes[modeKey];
  if (mode.selectedEntryUids.has(uid)) return 'editable';
  if (mode.readonlyEntryUids.has(uid)) return 'readonly';
  return 'none';
}

function setEntryMode(modeKey, uid, entryMode) {
  const mode = state.modes[modeKey];
  mode.selectedEntryUids.delete(uid);
  mode.readonlyEntryUids.delete(uid);
  if (entryMode === 'editable') {
    mode.selectedEntryUids.add(uid);
  } else if (entryMode === 'readonly') {
    mode.readonlyEntryUids.add(uid);
  }
}

function renderSelectionSummary(modeKey) {
  const mode = state.modes[modeKey];
  const entries = getFilteredEntries(modeKey);
  $('#ai-workspace-selection-summary', parentDoc()).text(
    `可修改 ${mode.selectedEntryUids.size} 条，只读 ${mode.readonlyEntryUids.size} 条，可见 ${entries.length} 条，总计 ${mode.entries.length} 条`,
  );
  if (modeKey === currentModeKey()) {
    syncWorkflowCapabilities(modeKey);
  }
}

function renderEntryList(modeKey) {
  const $list = $('#ai-workspace-entry-list', parentDoc());
  if (!$list.length) {
    return;
  }

  const entries = getFilteredEntries(modeKey);
  if (state.entryCluster) {
    state.entryCluster.destroy(true);
    state.entryCluster = null;
  }
  if (!entries.length) {
    $list.html('<div class="ai-empty">没有匹配的条目。</div>');
    renderSelectionSummary(modeKey);
    return;
  }

  const rows = entries.map(entry => {
    const uid = Number(entry.uid);
    const entryMode = getEntryMode(modeKey, uid);
    return `
      <div class="ai-entry-item" data-entry-uid="${uid}">
        <div class="ai-entry-main">
          <div class="ai-entry-item-title">${_.escape(entry.name || `UID ${uid}`)}</div>
          <div class="ai-entry-item-meta">UID ${uid}</div>
        </div>
        <div class="ai-entry-mode-group" role="group" aria-label="${_.escape(entry.name || `UID ${uid}`)} 的参与方式">
          <button type="button" class="ai-entry-mode-button${entryMode === 'editable' ? ' is-active is-editable' : ''}" data-entry-uid="${uid}" data-entry-mode="editable" aria-pressed="${entryMode === 'editable'}">修改</button>
          <button type="button" class="ai-entry-mode-button${entryMode === 'readonly' ? ' is-active is-readonly' : ''}" data-entry-uid="${uid}" data-entry-mode="readonly" aria-pressed="${entryMode === 'readonly'}">只读</button>
          <button type="button" class="ai-entry-mode-button${entryMode === 'none' ? ' is-active is-none' : ''}" data-entry-uid="${uid}" data-entry-mode="none" aria-pressed="${entryMode === 'none'}">排除</button>
        </div>
      </div>
    `;
  });

  $list.html('<div id="ai-workspace-entry-scroll" class="clusterize-scroll ai-entry-scroll"><div id="ai-workspace-entry-content" class="clusterize-content"></div></div>');
  if (typeof window.Clusterize === 'function') {
    state.entryCluster = new window.Clusterize({
      rows,
      scrollId: 'ai-workspace-entry-scroll',
      contentId: 'ai-workspace-entry-content',
      no_data_text: '没有匹配的条目。',
    });
  } else {
    $('#ai-workspace-entry-content', parentDoc()).html(rows.join(''));
  }

  renderSelectionSummary(modeKey);
}

function summarizePreviewError(errorText = '') {
  if (typeof errorText !== 'string') {
    return '未知错误';
  }

  const lines = errorText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return lines.slice(0, 3).join(' | ') || '未知错误';
}

function describeResolvedConfig(previewResult) {
  const resolvedConfig = previewResult?.resolvedConfig || {};
  const model = resolvedConfig.model || '当前模型';
  return `${model} / 流式${resolvedConfig.shouldStream ? '开' : '关'}`;
}

function buildPreviewSummaryText(previewResult) {
  const summary = previewResult?.summary || { total: 0, succeeded: 0, failed: 0, changed: 0, unchanged: 0 };
  const diagnostics = summary.diagnostics;
  const batching = summary.batching;
  const lines = [
    `总计 ${summary.total} 条，成功 ${summary.succeeded} 条，失败 ${summary.failed} 条，有变更 ${summary.changed} 条，无变更 ${summary.unchanged} 条。`,
  ];

  if (batching?.totalBatches > 1) {
    lines.push(`本次已按 ${batching.totalBatches} 批发送，条目内容总计约 ${batching.totalEntryTokens} tokens。`);
  }

  if (diagnostics?.triggered) {
    lines.push(
      `兼容诊断 ${diagnostics.totalAttempts} 组，成功 ${diagnostics.succeededAttempts} 组，失败 ${diagnostics.failedAttempts} 组。`,
    );
    if (diagnostics.foundWorkingConfig) {
      lines.push(`当前预览采用：${describeResolvedConfig(previewResult)}。`);
    }
  }

  return lines.join(' ');
}

function buildDiagnosticsErrorSummary(previewResult) {
  const diagnostics = previewResult?.summary?.diagnostics;
  if (!diagnostics?.triggered) {
    return '';
  }

  const lines = [];
  if (diagnostics.initialErrorSummary) {
    lines.push(`初始失败：${diagnostics.initialErrorSummary}`);
  }
  lines.push(
    `诊断统计：共 ${diagnostics.totalAttempts} 组，成功 ${diagnostics.succeededAttempts} 组，失败 ${diagnostics.failedAttempts} 组。`,
  );
  lines.push(
    diagnostics.foundWorkingConfig ? `已采用可用组合：${describeResolvedConfig(previewResult)}` : '未找到可用组合。',
  );
  if (diagnostics.stopped) {
    lines.push('诊断过程已手动停止。');
  }
  return lines.join('\n');
}

function buildPreviewWarningsSummary(previewResult) {
  const warnings = Array.isArray(previewResult?.warnings) ? previewResult.warnings : [];
  if (!warnings.length) {
    return '';
  }

  return warnings.map(item => `${item.title || '警告'}: ${summarizePreviewError(item.warning || '')}`).join('\n');
}

function getPreviewStatusText(previewResult) {
  const diagnostics = previewResult?.summary?.diagnostics;
  if (diagnostics?.stopped) {
    return '已停止生成，已返回当前可用诊断结果。';
  }
  if (diagnostics?.triggered) {
    return diagnostics.foundWorkingConfig
      ? `兼容诊断完成，已采用 ${describeResolvedConfig(previewResult)}。`
      : '兼容诊断完成，未找到可用组合。';
  }
  if ((previewResult?.summary?.succeeded || 0) === 0) {
    return '预览生成失败，没有可用结果。';
  }
  return '预览生成完成。';
}

function renderPreviewDiff(diff) {
  if (diff?.type === 'content-snippets' && Array.isArray(diff.snippets) && diff.snippets.length) {
    return diff.snippets
      .map(
        (snippet, index) => `
      <div class="ai-preview-diff">
        <div class="ai-preview-diff-label">${_.escape(diff.label)}${diff.snippets.length > 1 ? ` #${index + 1}` : ''}</div>
        <div class="ai-preview-diff-before">当前: ${_.escape(snippet.before || '')}</div>
        <div class="ai-preview-diff-after">预览: ${_.escape(snippet.after || '')}</div>
      </div>
    `,
      )
      .join('');
  }

  return `
    <div class="ai-preview-diff">
      <div class="ai-preview-diff-label">${_.escape(diff.label)}</div>
      <div class="ai-preview-diff-before">当前: ${_.escape(JSON.stringify(diff.before, null, 2))}</div>
      <div class="ai-preview-diff-after">预览: ${_.escape(JSON.stringify(diff.after, null, 2))}</div>
    </div>
  `;
}

function formatPreviewModalValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return JSON.stringify(value, null, 2);
  }
  return value == null ? '' : String(value);
}

function normalizePlanEditorValue(rawValue, validUids = null) {
  const parsed = JSON.parse(rawValue || '{}');
  const readonlyUids = _.uniq(
    (Array.isArray(parsed?.readonly_uids) ? parsed.readonly_uids : [])
      .map(uid => Number(uid))
      .filter(uid => Number.isFinite(uid)),
  );
  const editableUids = _.uniq(
    (Array.isArray(parsed?.editable_uids) ? parsed.editable_uids : [])
      .map(uid => Number(uid))
      .filter(uid => Number.isFinite(uid)),
  );
  const overlap = readonlyUids.filter(uid => editableUids.includes(uid));
  if (overlap.length) {
    throw new Error(`readonly_uids 与 editable_uids 不能重叠: ${overlap.join(', ')}`);
  }
  if (validUids instanceof Set) {
    const unknown = [...readonlyUids, ...editableUids].filter(uid => !validUids.has(uid));
    if (unknown.length) {
      throw new Error(`规划包含当前世界书不存在的 UID: ${_.uniq(unknown).join(', ')}`);
    }
  }

  return {
    readonly_uids: readonlyUids,
    editable_uids: editableUids,
    locked_editable_uids: Array.isArray(parsed?.locked_editable_uids)
      ? parsed.locked_editable_uids.map(uid => Number(uid)).filter(uid => Number.isFinite(uid))
      : [],
    locked_readonly_uids: Array.isArray(parsed?.locked_readonly_uids)
      ? parsed.locked_readonly_uids.map(uid => Number(uid)).filter(uid => Number.isFinite(uid))
      : [],
    planned_editable_uids: Array.isArray(parsed?.planned_editable_uids)
      ? parsed.planned_editable_uids.map(uid => Number(uid)).filter(uid => Number.isFinite(uid))
      : [],
    planned_readonly_uids: Array.isArray(parsed?.planned_readonly_uids)
      ? parsed.planned_readonly_uids.map(uid => Number(uid)).filter(uid => Number.isFinite(uid))
      : [],
    plan: {
      goal: typeof parsed?.plan?.goal === 'string' ? parsed.plan.goal.trim() : '',
      must_keep: Array.isArray(parsed?.plan?.must_keep)
        ? parsed.plan.must_keep.map(item => `${item || ''}`.trim()).filter(Boolean)
        : [],
      rewrite_rules: Array.isArray(parsed?.plan?.rewrite_rules)
        ? parsed.plan.rewrite_rules.map(item => `${item || ''}`.trim()).filter(Boolean)
        : [],
      consistency_notes: Array.isArray(parsed?.plan?.consistency_notes)
        ? parsed.plan.consistency_notes.map(item => `${item || ''}`.trim()).filter(Boolean)
        : [],
    },
  };
}

function planListFromTextarea(selector) {
  return (($(`${selector}`, parentDoc()).val() || '').toString())
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function updatePlanningResultFromStructuredForm(modeKey) {
  const mode = state.modes[modeKey];
  if (!mode.planningResult) {
    return;
  }
  mode.planningResult.plan = {
    goal: ($('#ai-workspace-plan-goal', parentDoc()).val() || '').toString().trim(),
    must_keep: planListFromTextarea('#ai-workspace-plan-must-keep'),
    rewrite_rules: planListFromTextarea('#ai-workspace-plan-rewrite-rules'),
    consistency_notes: planListFromTextarea('#ai-workspace-plan-consistency-notes'),
  };
  mode.planEditorError = '';
  mode.previewResult = null;
}

function renderPlanScope(modeKey) {
  const mode = state.modes[modeKey];
  const $scope = $('#ai-workspace-plan-scope-list', parentDoc());
  if (!$scope.length || !mode.planningResult) {
    return;
  }
  const byUid = new Map(mode.entries.map(entry => [Number(entry.uid), entry]));
  const rows = [
    ...(mode.planningResult.editable_uids || []).map(uid => ({ uid: Number(uid), type: 'editable', label: '修改' })),
    ...(mode.planningResult.readonly_uids || []).map(uid => ({ uid: Number(uid), type: 'readonly', label: '只读' })),
  ];
  if (!rows.length) {
    $scope.html('<div class="ai-empty">规划没有选择任何条目，请调整范围或重新生成。</div>');
    return;
  }
  $scope.html(
    rows
      .map(({ uid, type, label }) => {
        const entry = byUid.get(uid);
        return `<div class="ai-plan-scope-row">
          <div><strong>${_.escape(entry?.name || `UID ${uid}`)}</strong><span>UID ${uid}</span></div>
          <div class="ai-entry-mode-group" role="group" aria-label="调整 ${_.escape(entry?.name || `UID ${uid}`)} 的规划范围">
            <button type="button" class="ai-entry-mode-button${type === 'editable' ? ' is-active is-editable' : ''}" data-entry-uid="${uid}" data-entry-mode="editable" aria-pressed="${type === 'editable'}">修改</button>
            <button type="button" class="ai-entry-mode-button${type === 'readonly' ? ' is-active is-readonly' : ''}" data-entry-uid="${uid}" data-entry-mode="readonly" aria-pressed="${type === 'readonly'}">只读</button>
            <button type="button" class="ai-entry-mode-button" data-entry-uid="${uid}" data-entry-mode="none" aria-pressed="false">排除</button>
          </div>
        </div>`;
      })
      .join(''),
  );
}

function syncPlanSelectionFromPlanningResult(modeKey) {
  const mode = state.modes[modeKey];
  const validUidSet = new Set(
    (mode.entries || []).map(entry => Number(entry?.uid)).filter(uid => Number.isFinite(uid)),
  );
  const readonlyUids = _.uniq(
    (Array.isArray(mode.planningResult?.readonly_uids) ? mode.planningResult.readonly_uids : [])
      .map(uid => Number(uid))
      .filter(uid => validUidSet.has(uid)),
  );
  const editableUids = _.uniq(
    (Array.isArray(mode.planningResult?.editable_uids) ? mode.planningResult.editable_uids : [])
      .map(uid => Number(uid))
      .filter(uid => validUidSet.has(uid) && !readonlyUids.includes(uid)),
  );

  mode.planningResult = {
    readonly_uids: readonlyUids,
    editable_uids: editableUids,
    locked_editable_uids: mode.planningResult?.locked_editable_uids || [],
    locked_readonly_uids: mode.planningResult?.locked_readonly_uids || [],
    planned_editable_uids: mode.planningResult?.planned_editable_uids || [],
    planned_readonly_uids: mode.planningResult?.planned_readonly_uids || [],
    plan: mode.planningResult?.plan || {},
  };
  mode.selectedEntryUids = new Set(editableUids);
  mode.readonlyEntryUids = new Set(readonlyUids);
}

function parseKeywordsEditorValue(rawValue) {
  const normalized = `${rawValue || ''}`.trim();
  if (!normalized) {
    return [];
  }
  if (normalized.startsWith('[')) {
    const parsed = JSON.parse(normalized);
    if (!Array.isArray(parsed)) {
      throw new Error('关键词必须是 JSON 数组或逗号分隔文本');
    }
    return parsed.map(item => `${item || ''}`.trim()).filter(Boolean);
  }
  return normalized
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function buildManualPreviewDiffs(beforeEntry, afterEntry, fieldOptions = {}) {
  const diffs = [];
  const pushDiff = (label, beforeValue, afterValue) => {
    if (!_.isEqual(beforeValue, afterValue)) {
      diffs.push({ label, before: beforeValue, after: afterValue });
    }
  };

  if (fieldOptions.title) {
    pushDiff('标题', beforeEntry?.name || '', afterEntry?.name || '');
  }

  if (fieldOptions.content) {
    const beforeContent = beforeEntry?.content || '';
    const afterContent = afterEntry?.content || '';
    if (!_.isEqual(beforeContent, afterContent)) {
      diffs.push({
        label: '内容差异',
        type: 'content-snippets',
        snippets: [
          {
            before: beforeContent,
            after: afterContent,
          },
        ],
        before: beforeContent,
        after: afterContent,
      });
    }
  }

  if (fieldOptions.prompt) {
    pushDiff(
      '关键词',
      Array.isArray(beforeEntry?.strategy?.keys) ? beforeEntry.strategy.keys : [],
      Array.isArray(afterEntry?.strategy?.keys) ? afterEntry.strategy.keys : [],
    );
    pushDiff(
      '次级关键词逻辑',
      beforeEntry?.strategy?.keys_secondary?.logic || 'and_any',
      afterEntry?.strategy?.keys_secondary?.logic || 'and_any',
    );
    pushDiff(
      '次级关键词',
      Array.isArray(beforeEntry?.strategy?.keys_secondary?.keys) ? beforeEntry.strategy.keys_secondary.keys : [],
      Array.isArray(afterEntry?.strategy?.keys_secondary?.keys) ? afterEntry.strategy.keys_secondary.keys : [],
    );
  }

  return diffs;
}

function rebuildPreviewResult(modeKey) {
  const mode = state.modes[modeKey];
  const items = Array.isArray(mode.previewResult?.items) ? mode.previewResult.items : [];
  items.forEach(item => {
    item.title = item?.afterEntry?.name || item?.beforeEntry?.name || item.title || `UID ${item.uid}`;
    item.diffs = buildManualPreviewDiffs(item.beforeEntry, item.afterEntry, mode.editableFields);
    item.changed = item.diffs.length > 0;
  });

  const total = items.length;
  const changed = items.filter(item => item.changed).length;
  const unchanged = total - changed;
  const existingSummary = mode.previewResult?.summary || {};
  mode.previewResult.summary = {
    ...existingSummary,
    total,
    succeeded: total,
    failed: Array.isArray(mode.previewResult?.errors) ? mode.previewResult.errors.length : 0,
    changed,
    unchanged,
  };
}

function excludePreviewItem(modeKey, uid) {
  const mode = state.modes[modeKey];
  if (!mode.previewResult || !Array.isArray(mode.previewResult.items)) {
    return;
  }

  const numericUid = Number(uid);
  const beforeCount = mode.previewResult.items.length;
  mode.previewResult.items = mode.previewResult.items.filter(item => Number(item?.uid) !== numericUid);
  if (mode.previewResult.items.length === beforeCount) {
    return;
  }

  rebuildPreviewResult(modeKey);
  renderPreview(modeKey);
  persistSettings({ mirrorModeKey: modeKey });
  setModeStatus(modeKey, `已从本次预览中排除 UID ${numericUid}，不会应用该项。`);
}

function buildPreviewModalSections(item, mode) {
  const beforeEntry = item?.beforeEntry || {};
  const afterEntry = item?.afterEntry || {};
  const beforeKeywords = Array.isArray(beforeEntry?.strategy?.keys) ? beforeEntry.strategy.keys : [];
  const afterKeywords = Array.isArray(afterEntry?.strategy?.keys) ? afterEntry.strategy.keys : [];
  const beforeSecondaryKeywords = Array.isArray(beforeEntry?.strategy?.keys_secondary?.keys)
    ? beforeEntry.strategy.keys_secondary.keys
    : [];
  const afterSecondaryKeywords = Array.isArray(afterEntry?.strategy?.keys_secondary?.keys)
    ? afterEntry.strategy.keys_secondary.keys
    : [];
  const sections = [];

  if (mode?.editableFields?.title) {
    sections.push({ key: 'title', title: '标题', before: beforeEntry?.name || '', after: afterEntry?.name || '' });
  }
  if (mode?.editableFields?.content) {
    sections.push({
      key: 'content',
      title: '内容',
      before: beforeEntry?.content || '',
      after: afterEntry?.content || '',
    });
  }
  if (mode?.editableFields?.prompt) {
    sections.push({ key: 'keywords', title: '关键词', before: beforeKeywords, after: afterKeywords });
    sections.push({
      key: 'secondary_logic',
      title: '次级关键词逻辑',
      before: beforeEntry?.strategy?.keys_secondary?.logic || 'and_any',
      after: afterEntry?.strategy?.keys_secondary?.logic || 'and_any',
    });
    sections.push({
      key: 'secondary_keywords',
      title: '次级关键词',
      before: beforeSecondaryKeywords,
      after: afterSecondaryKeywords,
    });
  }
  if (!sections.length) {
    sections.push({
      key: 'content',
      title: '当前条目',
      before: beforeEntry?.content || '',
      after: afterEntry?.content || '',
    });
  }
  return sections;
}

function applyPreviewModalEdits(modeKey) {
  const mode = state.modes[modeKey];
  const uid = Number($('#ai-workspace-preview-modal', parentDoc()).attr('data-preview-uid'));
  return applyPreviewEditsFromFields(modeKey, uid, '#ai-workspace-preview-modal-content textarea[data-preview-field]');
}

function applyPreviewDetailEdits(modeKey) {
  const uid = Number($('#ai-workspace-preview-detail', parentDoc()).attr('data-preview-uid'));
  return applyPreviewEditsFromFields(modeKey, uid, '#ai-workspace-preview-detail textarea[data-preview-field]');
}

function applyPreviewEditsFromFields(modeKey, uid, fieldsSelector) {
  const mode = state.modes[modeKey];
  const item = mode.previewResult?.items?.find(previewItem => Number(previewItem?.uid) === uid);
  if (!item) {
    return null;
  }

  item.afterEntry = _.cloneDeep(item.afterEntry || item.beforeEntry || {});
  item.afterEntry.strategy = item.afterEntry.strategy || {};

  $(fieldsSelector, parentDoc()).each(function () {
    const field = ($(this).attr('data-preview-field') || '').trim();
    const value = $(this).val() || '';
    if (field === 'title') {
      item.afterEntry.name = `${value}`.trim();
    } else if (field === 'content') {
      item.afterEntry.content = `${value}`;
    } else if (field === 'keywords') {
      item.afterEntry.strategy.keys = parseKeywordsEditorValue(value);
    } else if (field === 'secondary_logic') {
      item.afterEntry.strategy.keys_secondary = item.afterEntry.strategy.keys_secondary || {};
      item.afterEntry.strategy.keys_secondary.logic = `${value}`.trim() || 'and_any';
    } else if (field === 'secondary_keywords') {
      item.afterEntry.strategy.keys_secondary = item.afterEntry.strategy.keys_secondary || {};
      item.afterEntry.strategy.keys_secondary.keys = parseKeywordsEditorValue(value);
    }
  });

  rebuildPreviewResult(modeKey);
  renderPreview(modeKey);
  persistSettings({ mirrorModeKey: modeKey });
  return item;
}

function renderPreviewDetail(modeKey, uid = null) {
  const mode = state.modes[modeKey];
  const $detail = $('#ai-workspace-preview-detail', parentDoc());
  if (!$detail.length) {
    return;
  }

  const items = Array.isArray(mode.previewResult?.items) ? mode.previewResult.items : [];
  const item = items.find(previewItem => Number(previewItem?.uid) === Number(uid)) || items[0];
  if (!item) {
    $detail.removeAttr('data-preview-uid').html('<div class="ai-empty">选择左侧条目后查看完整修改。</div>');
    return;
  }

  $detail.attr('data-preview-uid', item.uid);
  $detail.html(`
    <div class="ai-preview-detail-header">
      <div>
        <div class="ai-preview-item-title">${_.escape(item.afterEntry?.name || item.beforeEntry?.name || item.title || '条目')} (UID: ${item.uid})</div>
        <div class="ai-text">${item.changed ? '可直接编辑预览内容。' : '当前无实际变更，可手动编辑后应用。'}</div>
      </div>
      <div class="ai-preview-detail-actions">
        <button type="button" id="ai-workspace-preview-detail-regenerate" class="ai-button-primary">重新生成此条</button>
        <button type="button" class="ai-preview-exclude" data-preview-uid="${item.uid}">排除此项</button>
      </div>
    </div>
    <div class="ai-preview-modal-content-inline">
      ${buildPreviewModalSections(item, mode)
        .map(
          section => `
        <div class="ai-preview-modal-section" data-field-key="${section.key}">
          <div class="ai-preview-modal-section-title">${_.escape(section.title)}${_.isEqual(section.before, section.after) ? '' : ' <span class="ai-changed-badge">已变更</span>'}</div>
          <div class="ai-preview-modal-panel">
            <div class="ai-preview-modal-field">
              <label>当前</label>
              <textarea readonly>${_.escape(formatPreviewModalValue(section.before))}</textarea>
            </div>
            <div class="ai-preview-modal-field">
              <label>预览</label>
              <textarea data-preview-field="${section.key}">${_.escape(formatPreviewModalValue(section.after))}</textarea>
            </div>
          </div>
        </div>
      `,
        )
        .join('')}
    </div>
  `);
}

function renderDebugInfo(modeKey, debug = null) {
  const mode = state.modes[modeKey];
  mode.debugInfo = debug || mode.debugInfo || {};

  const fields = {
    request: $('#ai-workspace-debug-request', parentDoc()),
    response: $('#ai-workspace-debug-response', parentDoc()),
    json: $('#ai-workspace-debug-json', parentDoc()),
    error: $('#ai-workspace-debug-error', parentDoc()),
    diagnostics: $('#ai-workspace-debug-diagnostics', parentDoc()),
  };

  if (!fields.request.length) {
    return;
  }

  fields.request.val(mode.debugInfo.requestPrompt || '');
  fields.response.val(mode.debugInfo.rawResponse || '');
  fields.json.val(mode.debugInfo.parsedJsonCandidate || '');
  fields.error.val(mode.debugInfo.errorDetails || '');
  fields.diagnostics.val(mode.debugInfo.diagnosticsReport || '');

  const hasFailure = Boolean(mode.debugInfo.errorDetails);
  const hasAnySuccessDebug = Boolean(
    mode.debugInfo.requestPrompt || mode.debugInfo.rawResponse || mode.debugInfo.parsedJsonCandidate,
  );
  const visibility = hasFailure
    ? {
        request: false,
        response: false,
        json: false,
        error: true,
        diagnostics: Boolean(mode.debugInfo.diagnosticsReport),
      }
    : {
        request: hasAnySuccessDebug,
        response: hasAnySuccessDebug,
        json: hasAnySuccessDebug,
        error: false,
        diagnostics: false,
      };

  Object.entries(fields).forEach(([key, $field]) => {
    const $block = $field.closest('.ai-debug-block');
    $block.toggle(Boolean(visibility[key]));
    if (!visibility[key]) {
      $block.prop('open', false);
    }
  });
}

function renderPlanningResult(modeKey, planningResult = null) {
  const mode = state.modes[modeKey];
  mode.planningResult = planningResult || mode.planningResult;
  const $summary = $('#ai-workspace-plan-summary', parentDoc());
  const $json = $('#ai-workspace-plan-json', parentDoc());
  if (!$summary.length) {
    return;
  }

  if (!mode.planningResult) {
    $summary.text(EMPTY_PLAN_TEXT);
    $json.val('');
    return;
  }

  const plan = mode.planningResult.plan || {};
  const lines = [
    `只读 ${mode.planningResult.readonly_uids?.length || 0} 条，可修改 ${mode.planningResult.editable_uids?.length || 0} 条`,
  ];
  if (mode.planningResult.locked_editable_uids?.length || 0 || mode.planningResult.locked_readonly_uids?.length || 0) {
    lines.push(
      `手动锁定：可修改 ${mode.planningResult.locked_editable_uids?.length || 0} 条，只读 ${mode.planningResult.locked_readonly_uids?.length || 0} 条`,
    );
  }
  if (
    mode.planningResult.planned_editable_uids?.length ||
    0 ||
    mode.planningResult.planned_readonly_uids?.length ||
    0
  ) {
    lines.push(
      `AI规划：可修改 ${mode.planningResult.planned_editable_uids?.length || 0} 条，只读 ${mode.planningResult.planned_readonly_uids?.length || 0} 条`,
    );
  }
  if (plan.goal) {
    lines.push(`目标：${plan.goal}`);
  }

  $summary.text(lines.join(' | '));
  $('#ai-workspace-plan-goal', parentDoc()).val(plan.goal || '');
  $('#ai-workspace-plan-must-keep', parentDoc()).val((plan.must_keep || []).join('\n'));
  $('#ai-workspace-plan-rewrite-rules', parentDoc()).val((plan.rewrite_rules || []).join('\n'));
  $('#ai-workspace-plan-consistency-notes', parentDoc()).val((plan.consistency_notes || []).join('\n'));
  $json.val(
    JSON.stringify(
      {
        readonly_uids: mode.planningResult.readonly_uids || [],
        editable_uids: mode.planningResult.editable_uids || [],
        locked_editable_uids: mode.planningResult.locked_editable_uids || [],
        locked_readonly_uids: mode.planningResult.locked_readonly_uids || [],
        planned_editable_uids: mode.planningResult.planned_editable_uids || [],
        planned_readonly_uids: mode.planningResult.planned_readonly_uids || [],
        plan: mode.planningResult.plan || {},
      },
      null,
      2,
    ),
  );
  renderPlanScope(modeKey);
  $('#ai-workspace-plan-error', parentDoc())
    .toggleClass('is-visible', Boolean(mode.planEditorError))
    .text(mode.planEditorError || '');
  $('#ai-workspace-preview', parentDoc()).prop(
    'disabled',
    Boolean(mode.planEditorError) || mode.selectedEntryUids.size === 0 || state.isGenerating,
  );
}

function clearPreview(modeKey, text = EMPTY_PREVIEW_TEXT) {
  const mode = state.modes[modeKey];
  mode.previewResult = null;
  mode.debugInfo = {};
  closePreviewModal();

  const $summary = $('#ai-workspace-preview-summary', parentDoc());
  if (!$summary.length) {
    return;
  }

  $summary.text(text);
  $('#ai-workspace-preview-errors', parentDoc()).removeClass('has-errors').empty();
  $('#ai-workspace-preview-list', parentDoc()).empty();
  renderPreviewDetail(modeKey, null);
  $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
  renderDebugInfo(modeKey, {});
}

function renderPreview(modeKey, previewResult = null) {
  const mode = state.modes[modeKey];
  mode.previewResult = previewResult || mode.previewResult;
  const $summary = $('#ai-workspace-preview-summary', parentDoc());
  if (!$summary.length) {
    return;
  }

  const summary = mode.previewResult?.summary || { total: 0, succeeded: 0, failed: 0, changed: 0, unchanged: 0 };
  $summary.text(buildPreviewSummaryText(mode.previewResult));
  $summary.attr('data-outcome', mode.previewResult?.outcome || (summary.failed ? 'partial' : 'complete'));
  $('#ai-workspace-apply span', parentDoc()).text(`应用 ${summary.changed || 0} 条修改`);

  const $errors = $('#ai-workspace-preview-errors', parentDoc());
  const diagnosticsSummary = buildDiagnosticsErrorSummary(mode.previewResult);
  const warningsSummary = buildPreviewWarningsSummary(mode.previewResult);
  if (diagnosticsSummary) {
    $errors.addClass('has-errors').text([diagnosticsSummary, warningsSummary].filter(Boolean).join('\n'));
  } else if (Array.isArray(mode.previewResult?.errors) && mode.previewResult.errors.length) {
    const errorText = mode.previewResult.errors
      .map(item => {
        const summaryText = /Got response status 503|response status 503|\b503\b/i.test(item.error || '')
          ? 'OpenAI兼容后端返回 503，请优先检查 URL / 模型 / 流式支持 / 上游服务状态。'
          : summarizePreviewError(item.error);
        return `${item.title}: ${summaryText}`;
      })
      .join('\n');
    $errors.addClass('has-errors').text([warningsSummary, errorText].filter(Boolean).join('\n'));
  } else if (warningsSummary) {
    $errors.addClass('has-errors').text(warningsSummary);
  } else {
    $errors.removeClass('has-errors').empty();
  }

  const $list = $('#ai-workspace-preview-list', parentDoc());
  $list.empty();
  if (!Array.isArray(mode.previewResult?.items) || !mode.previewResult.items.length) {
    $list.append('<div class="ai-empty">没有可展示的预览结果。</div>');
    renderPreviewDetail(modeKey, null);
    $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
    renderDebugInfo(modeKey, mode.previewResult?.debug || {});
    return;
  }

  const currentUid = Number($('#ai-workspace-preview-detail', parentDoc()).attr('data-preview-uid'));
  const activeUid = mode.previewResult.items.some(item => Number(item?.uid) === currentUid)
    ? currentUid
    : Number(mode.previewResult.items[0]?.uid);
  mode.previewResult.items.forEach(item => {
    const diffs = item.diffs.length
      ? item.diffs.map(diff => renderPreviewDiff(diff)).join('')
      : '<div class="ai-preview-diff-after">无实际变更。</div>';
    $list.append(`
      <div class="ai-preview-item${Number(item.uid) === activeUid ? ' is-active' : ''}" data-preview-uid="${item.uid}" role="button" tabindex="0" title="点击查看完整修改">
        <div class="ai-preview-item-header">
          <div class="ai-preview-item-title">${_.escape(item.title)} (UID: ${item.uid})</div>
          <button type="button" class="ai-preview-exclude" data-preview-uid="${item.uid}">排除</button>
        </div>
        ${diffs}
      </div>
    `);
  });

  renderPreviewDetail(modeKey, activeUid);
  renderDebugInfo(modeKey, mode.previewResult?.debug || {});
  $('#ai-workspace-apply', parentDoc()).prop('disabled', summary.changed === 0);
  void refreshRollbackPanel(modeKey);
}

async function refreshRollbackPanel(modeKey) {
  const mode = state.modes[modeKey];
  const $panel = $('#ai-workspace-rollback-panel', parentDoc());
  if (!$panel.length || !mode?.lorebookName) {
    return;
  }

  try {
    const preview = await getRollbackPreview(mode.lorebookName);
    const available = Boolean(preview?.available);
    $('#ai-workspace-rollback-preview', parentDoc()).prop('disabled', !available);
    $('#ai-workspace-rollback-execute', parentDoc()).prop('disabled', !available);
    if (!available) {
      $panel.empty();
      return;
    }
    const operationType = preview.meta?.operationType || 'mutation';
    const isAiTransaction = ['ai-edit-entry', 'ai-edit-selected'].includes(operationType);
    $panel.html(
      `<strong>${isAiTransaction ? '最近一次 AI 修改' : `最近一次世界书操作（${_.escape(operationType)}）`}</strong><span>撤销后将恢复 ${preview.summary.restoreCount} 条、移除 ${preview.summary.removeCount} 条、还原 ${preview.summary.modifyCount} 条。</span>`,
    );
  } catch {
    $panel.empty();
    $('#ai-workspace-rollback-preview', parentDoc()).prop('disabled', true);
    $('#ai-workspace-rollback-execute', parentDoc()).prop('disabled', true);
  }
}

async function handleRollbackPreview() {
  const modeKey = currentModeKey();
  const mode = state.modes[modeKey];
  const preview = await getRollbackPreview(mode.lorebookName);
  if (!preview?.available) {
    setModeStatus(modeKey, '当前没有可回滚的 AI 应用。');
    return;
  }
  const lines = preview.items.slice(0, 20).map(item => `${item.type} UID ${item.uid}: ${item.title}`);
  $('#ai-workspace-rollback-dialog-summary', parentDoc()).text(
    `将恢复 ${preview.summary.restoreCount} 条，移除 ${preview.summary.removeCount} 条，还原 ${preview.summary.modifyCount} 条。事务类型：${preview.meta?.operationType || 'mutation'}。`,
  );
  $('#ai-workspace-rollback-dialog-items', parentDoc()).html(
    [...lines, preview.items.length > 20 ? `另有 ${preview.items.length - 20} 条未显示。` : '']
      .filter(Boolean)
      .map(line => `<div>${_.escape(line)}</div>`)
      .join(''),
  );
  $('#ai-workspace-rollback-dialog', parentDoc()).get(0)?.showModal?.();
}

async function handleRollbackExecute() {
  const modeKey = currentModeKey();
  const mode = state.modes[modeKey];
  const preview = await getRollbackPreview(mode.lorebookName);
  if (!preview?.available) {
    setModeStatus(modeKey, '当前没有可回滚的 AI 应用。');
    return;
  }
  const result = await rollbackLastTransaction(mode.lorebookName);
  if (!result.success) {
    setModeStatus(modeKey, result.error?.message || '回滚失败。');
    return;
  }
  await loadEntriesForMode(modeKey, { force: true, resetSelection: false, clearOutputs: true });
  mode.currentStep = 'prepare';
  mode.lastApplyResult = null;
  clearPreview(modeKey, '最近一次世界书操作已回滚。');
  await refreshRollbackPanel(modeKey);
  setModeStatus(modeKey, '回滚完成。');
  $('#ai-workspace-rollback-dialog', parentDoc()).get(0)?.close?.();
  renderCurrentPanel();
}

function closePreviewModal() {
  $('#ai-workspace-preview-modal', parentDoc()).hide();
}

function invalidateSharedInfoOutputs(message = '信息区已变化，请重新生成改造方案或预览。') {
  ['direct', 'plan'].forEach(modeKey => {
    const mode = state.modes[modeKey];
    const hadPreview = Boolean(mode.previewResult);
    const hadPlan = Boolean(mode.planningResult);
    if (!hadPreview && !hadPlan) {
      return;
    }

    invalidateModeOutputs(modeKey, { clearPlan: true });
    if (state.currentNav === modeKey) {
      if (hadPreview) {
        clearPreview(modeKey, message);
      }
      if (hadPlan) {
        renderPlanningResult(modeKey, null);
      }
      setModeStatus(modeKey, message);
    }
  });

  persistSettings({ mirrorModeKey: currentModeKey() });
}

function setReferenceMaterial(nextValue, { invalidateOutputs = false, syncTextarea = true } = {}) {
  state.referenceMaterial = typeof nextValue === 'string' ? nextValue : '';
  if (syncTextarea) {
    renderReferenceMaterial();
  } else {
    syncReferenceMaterialStatus();
  }
  persistSettings({ mirrorModeKey: currentModeKey() });
  if (invalidateOutputs) {
    invalidateSharedInfoOutputs('参考资料已更新，请重新生成改造方案或预览。');
  }
}

async function refreshChatContext() {
  state.chatContext = { ...currentChatContextSettings(), enabled: true };
  const messageCount = state.chatContext.messageCount;

  if (messageCount <= 0) {
    state.chatContext.enabled = false;
    state.chatMessages = [];
    renderChatContextPreview();
    persistSettings({ mirrorModeKey: currentModeKey() });
    invalidateSharedInfoOutputs('聊天上下文已清空，请重新生成计划或预览。');
    setModeStatus(currentModeKey(), '聊天上下文已清空。');
    return;
  }

  if (typeof getChatMessages !== 'function') {
    throw new Error('当前环境没有可用的 getChatMessages()');
  }

  const allMessages = getChatMessages('0-{{lastMessageId}}', { hide_state: 'unhidden' }) || [];
  state.chatMessages = allMessages
    .slice(-messageCount)
    .map(message => ({
      message_id: Number(message?.message_id),
      name: typeof message?.name === 'string' ? message.name : '',
      role: ['system', 'assistant', 'user'].includes(message?.role) ? message.role : 'system',
      message: typeof message?.message === 'string' ? message.message : '',
    }))
    .filter(message => message.message.trim());
  state.chatContextManual = false;
  state.chatContextManualText = '';

  const loadedCount = state.chatMessages.length;
  renderChatContextPreview();
  persistSettings({ mirrorModeKey: currentModeKey() });
  invalidateSharedInfoOutputs('聊天上下文已更新，请重新生成计划或预览。');
  setModeStatus(currentModeKey(), `已刷新聊天上下文，共载入 ${loadedCount} 条消息。`);
}

function handleChatContextEdited() {
  const text = currentChatContextText().trim();
  state.chatContext = { ...currentChatContextSettings(), enabled: Boolean(text) };
  state.chatContextManual = Boolean(text);
  state.chatContextManualText = text;
  renderChatContextPreview();
  persistSettings({ mirrorModeKey: currentModeKey() });
  invalidateSharedInfoOutputs('聊天上下文已修改，请重新生成计划或预览。');
  setModeStatus(currentModeKey(), text ? '聊天上下文已修改并开启。' : '聊天上下文已清空并关闭。');
}

function handleChatContextClear() {
  state.chatContext = { ...state.chatContext, enabled: false };
  state.chatMessages = [];
  state.chatContextManual = false;
  state.chatContextManualText = '';
  renderChatContextPreview();
  persistSettings({ mirrorModeKey: currentModeKey() });
  invalidateSharedInfoOutputs('聊天上下文已清空，请重新生成计划或预览。');
  setModeStatus(currentModeKey(), '聊天上下文已清空。');
}

function buildAssistantPrompt(userInput, saved = settings(), chatHistory = state.assistantChatHistory) {
  const jailbreakPrompt =
    currentPromptSettings(currentModeKey()).jailbreakPromptTemplate ||
    saved.promptSettings?.jailbreakPromptTemplate ||
    '';
  const referenceMaterial = (state.referenceMaterial || '').trim();
  const history = (Array.isArray(chatHistory) ? chatHistory : [])
    .map(item => `<${item.role}>${item.content || ''}</${item.role}>`)
    .join('\n');

  return [
    jailbreakPrompt.trim(),
    '<任务>',
    '你是世界书 AI 工作区里的资料整理助手。',
    '你的任务是帮助用户整理设定、提炼要点，并生成适合放入<参考资料>的文本。',
    '不要改写世界书条目，不要返回 JSON，不要假装看见未提供的世界书内容。',
    '</任务>',
    referenceMaterial ? `<当前参考资料>\n${referenceMaterial}\n</当前参考资料>` : '',
    history ? `<对话历史>\n${history}\n</对话历史>` : '',
    '<用户问题>',
    userInput,
    '</用户问题>',
    '请用简洁中文回答；如果合适，直接给出可粘贴进资料区的整理内容。',
  ]
    .filter(Boolean)
    .join('\n');
}

async function handleAssistantSend() {
  const userInput = ($('#ai-workspace-assistant-input', parentDoc()).val() || '').trim();
  const saved = settings();
  const modeKey = currentModeKey();

  if (!userInput) {
    setAssistantStatus('请输入要发送给 AI 助手的内容。');
    return;
  }
  if (saved.apiMode === 'custom') {
    const validationMessage = validateCustomApiConfig(saved.customApi, { requireModel: true });
    if (validationMessage) {
      setAssistantStatus(validationMessage);
      return;
    }
  }

  const previousHistory = state.assistantChatHistory;
  const assistantPrompt = buildAssistantPrompt(userInput, saved, previousHistory);
  state.assistantChatHistory = previousHistory.concat({ role: 'user', content: userInput });
  renderAssistantHistory();
  persistSettings({ mirrorModeKey: modeKey });
  setAssistantGeneratingState(true);
  setAssistantStatus('AI 助手正在整理资料...');

  try {
    const response = await requestLlmText({
      prompt: assistantPrompt,
      promptSettings: currentPromptSettings(modeKey),
      customApi: saved.apiMode === 'custom' ? saved.customApi : null,
      shouldStream: saved.stream === true,
    });

    state.assistantChatHistory = state.assistantChatHistory.concat({ role: 'assistant', content: response });
    $('#ai-workspace-assistant-input', parentDoc()).val('');
    renderAssistantHistory();
    persistSettings({ mirrorModeKey: modeKey });
    setAssistantStatus('AI 助手回复完成。');
  } catch (error) {
    setAssistantStatus(error?.message || 'AI 助手请求失败。');
  } finally {
    setAssistantGeneratingState(false);
  }
}

function appendAssistantReplyToReferenceMaterial(index) {
  const historyItem = state.assistantChatHistory[Number(index)];
  if (!historyItem || historyItem.role !== 'assistant') {
    return;
  }

  appendTextToReferenceMaterial(historyItem.content, '已追加到资料区');
}

function deleteAssistantHistoryItem(index) {
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.assistantChatHistory.length) {
    return;
  }

  state.assistantChatHistory.splice(numericIndex, 1);
  renderAssistantHistory();
  persistSettings({ mirrorModeKey: currentModeKey() });
  setAssistantStatus('已删除该条助手历史。');
}

function clearAssistantHistory() {
  if (!state.assistantChatHistory.length) {
    setAssistantStatus('助手历史已经为空。');
    return;
  }

  state.assistantChatHistory = [];
  renderAssistantHistory();
  persistSettings({ mirrorModeKey: currentModeKey() });
  setAssistantStatus('助手历史已清空。');
}

function handlePreviewModalSave() {
  const modeKey = currentModeKey();
  const item = applyPreviewModalEdits(modeKey);
  if (!item) {
    return;
  }

  $('#ai-workspace-preview-modal-title', parentDoc()).text(
    `${item.afterEntry.name || item.beforeEntry?.name || item.title || '条目'} (UID: ${item.uid})`,
  );
  $('#ai-workspace-preview-modal-summary', parentDoc()).text(
    item.changed ? '预览修改已保存，可继续编辑或直接应用。' : '当前无实际变更，但修改内容已保存。',
  );
  setModeStatus(modeKey, '改造结果已更新，可直接应用。');
  window.toastr?.success('预览修改已保存');
}

async function handlePreviewModalRegenerate() {
  const modeKey = currentModeKey();
  const mode = state.modes[modeKey];
  const saved = settings();
  const uid = Number($('#ai-workspace-preview-modal', parentDoc()).attr('data-preview-uid'));
  const item = mode.previewResult?.items?.find(previewItem => Number(previewItem?.uid) === uid);
  const runId = ++state.previewRunId;
  if (!item) {
    return;
  }

  $('#ai-workspace-preview-modal-regenerate', parentDoc()).prop('disabled', true).text('正在重新生成...');
  $('#ai-workspace-preview-modal-save', parentDoc()).prop('disabled', true);
  state.stopRequested = false;
  setGeneratingState(true);

  try {
    const previewResult = await generateAiPreview({
      lorebookName: mode.lorebookName,
      entryUids: [uid],
      readonlyEntryUids: Array.from(mode.readonlyEntryUids),
      planningResult: mode.planningResult,
      instruction: mode.instruction,
      chatMessages: currentChatMessagesForRequest(),
      referenceMaterial: state.referenceMaterial,
      fieldOptions: mode.editableFields,
      promptSettings: mode.promptSettings,
      contextBudget: saved.contextBudget,
      sourceMode: modeKey,
      customApi: saved.apiMode === 'custom' ? saved.customApi : null,
      shouldStream: saved.stream === true,
      onGenerationStart: generationId => {
        if (runId === state.previewRunId) {
          state.activeGenerationId = generationId;
        }
      },
      shouldStop: () => state.stopRequested === true,
    });

    if (runId !== state.previewRunId) {
      return;
    }
    const newItem = previewResult?.items?.[0];
    if (!newItem) {
      throw new Error(previewResult?.errors?.[0]?.error || '重新生成失败');
    }

    const index = mode.previewResult.items.findIndex(previewItem => Number(previewItem.uid) === uid);
    if (index >= 0) {
      mode.previewResult.items[index] = newItem;
    }
    rebuildPreviewResult(modeKey);
    renderPreview(modeKey);
    persistSettings({ mirrorModeKey: modeKey });
    openPreviewModal(uid);
    setModeStatus(modeKey, '已重新生成该条目。');
    window.toastr?.success('已重新生成该条目');
  } catch (error) {
    setModeStatus(modeKey, error?.message || '重新生成失败。');
    window.toastr?.error(error?.message || '重新生成失败');
  } finally {
    if (runId === state.previewRunId) {
      state.stopRequested = false;
      setGeneratingState(false);
      $('#ai-workspace-preview-modal-regenerate', parentDoc()).prop('disabled', false).text('重新生成此条');
      $('#ai-workspace-preview-modal-save', parentDoc()).prop('disabled', false);
    }
  }
}

function openPreviewModal(uid) {
  const mode = currentModeState();
  const item = mode.previewResult?.items?.find(previewItem => Number(previewItem?.uid) === Number(uid));
  if (!item) {
    return;
  }

  const sections = buildPreviewModalSections(item, mode);
  $('#ai-workspace-preview-modal', parentDoc()).attr('data-preview-uid', uid);
  $('#ai-workspace-preview-modal-title', parentDoc()).text(`${item.title || '条目'} (UID: ${item.uid})`);
  $('#ai-workspace-preview-modal-summary', parentDoc()).text(
    item.changed ? '你可以直接编辑右侧预览内容。' : '当前无实际变更，但你仍可直接编辑右侧预览内容。',
  );
  $('#ai-workspace-preview-modal-content', parentDoc()).html(
    sections
      .map(
        section => `
      <div class="ai-preview-modal-section">
        <div class="ai-preview-modal-section-title">${_.escape(section.title)}</div>
        <div class="ai-preview-modal-panel">
          <div class="ai-preview-modal-field">
            <label>当前</label>
            <textarea readonly>${_.escape(formatPreviewModalValue(section.before))}</textarea>
          </div>
          <div class="ai-preview-modal-field">
            <label>预览</label>
            <textarea data-preview-uid="${item.uid}" data-preview-field="${section.key}">${_.escape(formatPreviewModalValue(section.after))}</textarea>
          </div>
        </div>
      </div>
    `,
      )
      .join(''),
  );
  $('#ai-workspace-preview-modal-save', parentDoc()).prop('disabled', false);
  $('#ai-workspace-preview-modal-regenerate', parentDoc()).prop('disabled', state.isGenerating);
  $('#ai-workspace-preview-modal', parentDoc()).css('display', 'block');
}

function getSillyTavernApi() {
  const parentWin = typeof window.parent !== 'undefined' ? window.parent : window;
  return (typeof SillyTavern !== 'undefined' ? SillyTavern : parentWin.SillyTavern) || null;
}

function isKnownSource(source) {
  return SOURCES.some(([value]) => value === source);
}

function isCustomSource(source) {
  return (source || '').trim() === 'custom';
}

function parseModelListPayload(data) {
  const modelsList = Array.isArray(data?.models)
    ? data.models
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : [];

  return modelsList
    .map(model => (typeof model === 'string' ? model : model?.id || model?.name || model?.model || ''))
    .filter(Boolean);
}

function buildStatusApiRequestBodies(apiConfig) {
  const source = (apiConfig?.source || 'openai').trim() || 'openai';
  if (isCustomSource(source)) {
    return [
      {
        label: 'custom-status',
        body: {
          reverse_proxy: apiConfig.apiurl,
          proxy_password: '',
          chat_completion_source: 'custom',
          custom_url: apiConfig.apiurl,
          custom_include_headers: apiConfig.key ? `Authorization: Bearer ${apiConfig.key}` : '',
        },
      },
    ];
  }

  return [
    { label: 'official-status-minimal', body: { chat_completion_source: source } },
    {
      label: 'official-status-with-credentials',
      body: {
        chat_completion_source: source,
        source,
        model: apiConfig.model || '',
        key: apiConfig.key || '',
        api_key: apiConfig.key || '',
      },
    },
  ];
}

async function loadModelListViaStatusApiWithFallback(apiConfig) {
  const stApi = getSillyTavernApi();
  if (!stApi || typeof stApi.getRequestHeaders !== 'function') {
    throw new Error('当前环境没有可用的 SillyTavern.getRequestHeaders()');
  }

  const attempts = buildStatusApiRequestBodies(apiConfig);
  const errors = [];

  for (const attempt of attempts) {
    const response = await fetch('/api/backends/chat-completions/status', {
      method: 'POST',
      headers: { ...stApi.getRequestHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt.body),
    });

    if (!response.ok) {
      errors.push(`${attempt.label}: ${response.status} ${response.statusText} ${await response.text()}`.trim());
      continue;
    }

    const models = parseModelListPayload(await response.json());
    if (models.length > 0) {
      return models;
    }
    errors.push(`${attempt.label}: status endpoint returned no parsable models`);
  }

  throw new Error(errors.join(' | ') || '状态接口未返回可用模型列表。');
}

function validateCustomApiConfig(apiConfig, { requireModel = true } = {}) {
  const source = apiConfig.source || 'openai';
  if (!apiConfig.key) {
    return '覆盖当前预设 API 配置时必须填写 API Key。';
  }
  if (requireModel && !apiConfig.model) {
    return '覆盖当前预设 API 配置时必须填写 Model。';
  }
  if (isCustomSource(source) && !apiConfig.apiurl) {
    return 'OpenAI兼容渠道必须填写 API URL。';
  }
  return '';
}

async function handleLoadModels() {
  if (getApiMode() !== 'custom') {
    setModelStatus('“使用当前预设”模式下不单独读取覆盖模型列表。');
    setSharedStatus('“使用当前预设”模式下不单独读取覆盖模型列表。');
    return;
  }

  const customApiConfig = currentApiSettings();
  const validationMessage = validateCustomApiConfig(customApiConfig, { requireModel: false });
  if (validationMessage) {
    setModelStatus(validationMessage);
    setSharedStatus(validationMessage);
    return;
  }

  $('#ai-workspace-load-models', parentDoc()).prop('disabled', true);
  setModelStatus('正在读取模型列表...');
  setSharedStatus('正在读取模型列表...');

  try {
    let models = [];
    if (typeof getModelList === 'function') {
      models = parseModelListPayload(
        await getModelList({
          apiurl: isCustomSource(customApiConfig.source) ? customApiConfig.apiurl : '',
          key: customApiConfig.key,
          source: isCustomSource(customApiConfig.source) ? 'openai' : customApiConfig.source,
        }),
      );
    } else {
      models = await loadModelListViaStatusApiWithFallback(customApiConfig);
    }

    state.modelOptions = models;
    if (!state.modelOptions.length) {
      throw new Error('未能解析模型列表或列表为空。');
    }

    renderModelOptions();
    setModelStatus(`已读取 ${state.modelOptions.length} 个模型。`);
    setSharedStatus(`已读取 ${state.modelOptions.length} 个模型。`);
    window.toastr?.success(`已读取 ${state.modelOptions.length} 个模型。`);
  } catch (error) {
    const message = error?.message || '读取模型列表失败';
    setModelStatus(message);
    setSharedStatus(message);
    window.toastr?.error(message);
  } finally {
    $('#ai-workspace-load-models', parentDoc()).prop('disabled', false);
  }
}
function buildSourceOptions() {
  return SOURCES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
}

function buildPreviewModalMarkup() {
  return `
    <div id="ai-workspace-preview-modal" class="ai-preview-modal" style="display:none;">
      <div class="ai-preview-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-workspace-preview-modal-title">
        <div class="ai-preview-modal-header">
          <h4 id="ai-workspace-preview-modal-title">条目完整预览</h4>
          <button type="button" class="ai-preview-modal-close ai-icon-button" aria-label="关闭预览"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="ai-preview-modal-body">
          <div id="ai-workspace-preview-modal-summary" class="ai-text"></div>
          <div id="ai-workspace-preview-modal-content"></div>
        </div>
        <div class="ai-preview-modal-footer">
          <button type="button" id="ai-workspace-preview-modal-regenerate" class="ai-button-primary">重新生成此条</button>
          <button type="button" id="ai-workspace-preview-modal-save" class="ai-button-primary">保存修改</button>
          <button type="button" id="ai-workspace-preview-modal-close-button" class="ai-button-secondary">关闭</button>
        </div>
      </div>
    </div>
  `;
}

function buildAssistantModalMarkup() {
  return `
    <div id="ai-workspace-assistant-modal" class="ai-assistant-modal" style="display:none;" aria-hidden="true">
      <div class="ai-assistant-phone" role="dialog" aria-modal="true" aria-labelledby="ai-workspace-assistant-title">
        <div class="ai-assistant-phone-header">
          <div>
            <div id="ai-workspace-assistant-title" class="ai-assistant-phone-title">AI 助手</div>
            <div id="ai-workspace-assistant-reference-status" class="ai-assistant-phone-subtitle">资料为空</div>
          </div>
          <button type="button" id="ai-workspace-assistant-close" class="ai-icon-button" aria-label="关闭 AI 助手">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="ai-assistant-tabs" role="tablist" aria-label="AI 助手视图">
          <button type="button" class="ai-assistant-tab is-active" data-assistant-tab="chat" role="tab" aria-selected="true">聊天</button>
          <button type="button" class="ai-assistant-tab" data-assistant-tab="reference" role="tab" aria-selected="false">资料</button>
        </div>
        <div class="ai-assistant-phone-body">
          <section class="ai-assistant-tab-panel" data-assistant-panel="chat">
            <div class="ai-assistant-chat-area">
              <div id="ai-workspace-assistant-history" class="ai-scroll ai-assistant-history"></div>
              <div id="ai-workspace-assistant-selection-toolbar" class="ai-assistant-selection-toolbar" style="display:none;">
                <button type="button" id="ai-workspace-assistant-selection-add">加入资料区</button>
              </div>
            </div>
            <div class="ai-assistant-footer">
              <div class="ai-assistant-actions-row">
                <button type="button" id="ai-workspace-assistant-clear" class="ai-button-secondary">清空历史</button>
                <span id="ai-workspace-assistant-status" class="ai-text"></span>
              </div>
              <div class="ai-assistant-composer">
                <textarea id="ai-workspace-assistant-input" class="ai-assistant-input" placeholder="让助手整理设定、提炼要点或生成可放入资料区的文本。"></textarea>
                <button type="button" id="ai-workspace-assistant-send" class="ai-send-button" aria-label="发送给 AI 助手">
                  <i class="fa-solid fa-paper-plane"></i>
                </button>
              </div>
            </div>
          </section>
          <section class="ai-assistant-tab-panel" data-assistant-panel="reference" style="display:none;">
            <div class="ai-field ai-reference-editor-field">
              <label for="ai-workspace-reference-material">参考资料</label>
              <textarea id="ai-workspace-reference-material" class="ai-reference-material" placeholder="粘贴设定、百科、剧情摘要、风格约束等补充资料。"></textarea>
            </div>
            <div class="ai-note">这里的内容会注入到 &lt;参考资料&gt;。聊天中选中的文本会追加到这里。</div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function buildInfoResourcesMarkup() {
  return `
    <div class="ai-info-panel">
      <details class="ai-prompt-settings ai-context-panel">
        <summary><span>聊天上下文</span><small id="ai-workspace-chat-context-mode">结构化消息</small></summary>
        <div class="ai-prompt-settings-body">
          <label class="ai-toggle-line">
            <input type="checkbox" id="ai-workspace-chat-context-enabled">
            开启聊天上下文
          </label>
          <div class="ai-row">
            <div class="ai-field">
              <label for="ai-workspace-chat-context-count">最近消息条数</label>
              <input id="ai-workspace-chat-context-count" type="number" min="0" max="50" value="10">
            </div>
            <div class="ai-field ai-btn-field">
              <label>&nbsp;</label>
              <button type="button" id="ai-workspace-chat-context-refresh" class="ai-button-secondary">刷新聊天上下文</button>
            </div>
            <div class="ai-field ai-btn-field">
              <label>&nbsp;</label>
              <button type="button" id="ai-workspace-chat-context-clear" class="ai-button-secondary">清空上下文</button>
            </div>
          </div>
          <div id="ai-workspace-chat-context-status" class="ai-text">未开启：生成计划或预览时不会注入聊天上下文。</div>
          <textarea id="ai-workspace-chat-context-preview" class="ai-chat-context-textarea" placeholder="刷新最近消息后，可直接删掉不想作为参考的内容。"></textarea>
        </div>
      </details>
      <div class="ai-reference-compact">
        <div>
          <div class="ai-reference-title">资料区</div>
          <div id="ai-workspace-reference-material-status" class="ai-text">资料区为空。</div>
        </div>
        <button type="button" class="ai-phone-inline-button" data-ai-open-assistant-tab="reference">
          <i class="fa-solid fa-mobile-screen-button"></i>
          打开 AI 助手
        </button>
      </div>
    </div>
  `;
}

function buildApiSettingsMarkup() {
  return `
    <div class="ai-page modern-page">
      <div class="ai-panel modern-card">
        <div class="ai-toolbar">
          <label><input type="radio" name="ai-workspace-api-mode" value="preset"> 使用当前预设</label>
          <label><input type="radio" name="ai-workspace-api-mode" value="custom"> 覆盖当前预设 API 配置</label>
        </div>
        <div id="ai-workspace-custom-api">
          <div id="ai-workspace-custom-api-fields">
            <div class="ai-row">
              <div class="ai-field">
                <label for="ai-workspace-source-select">API 渠道</label>
                <select id="ai-workspace-source-select">${buildSourceOptions()}</select>
              </div>
              <div class="ai-field ai-grow" id="ai-workspace-apiurl-field">
                <label for="ai-workspace-apiurl">API URL</label>
                <input id="ai-workspace-apiurl" type="text" placeholder="https://...">
              </div>
            </div>
            <div class="ai-row">
              <div class="ai-field ai-grow">
                <label for="ai-workspace-apikey">API Key</label>
                <input id="ai-workspace-apikey" type="password" placeholder="覆盖模式下必填">
              </div>
              <div class="ai-field ai-grow">
                <label for="ai-workspace-model">Model</label>
                <input id="ai-workspace-model" type="text" list="${MODEL_LIST_ID}" placeholder="模型名称">
                <datalist id="${MODEL_LIST_ID}"></datalist>
              </div>
              <div class="ai-field ai-btn-field">
                <label>&nbsp;</label>
                <button type="button" id="ai-workspace-load-models" class="ai-button-secondary">读取模型列表</button>
              </div>
            </div>
          </div>
          <div class="ai-toolbar ai-api-toolbar">
            <label><input type="checkbox" id="ai-workspace-stream"> 流式生成</label>
            <span id="ai-workspace-models-status" class="ai-text"></span>
          </div>
          <div id="ai-workspace-api-hint" class="ai-note"></div>
          <div class="ai-budget-panel">
            <label><input type="checkbox" id="ai-workspace-budget-enabled"> 启用上下文预算</label>
            <div class="ai-row">
              <div class="ai-field">
                <label for="ai-workspace-budget-max-input">最大输入 tokens</label>
                <input id="ai-workspace-budget-max-input" type="number" min="1000" max="200000" step="500">
              </div>
              <div class="ai-field">
                <label for="ai-workspace-budget-reserve-output">预留输出 tokens</label>
                <input id="ai-workspace-budget-reserve-output" type="number" min="256" max="64000" step="256">
              </div>
            </div>
          </div>
          <div class="ai-status-line">
            <span id="ai-workspace-status" class="ai-text"></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildStepIndicator(modeKey) {
  const mode = state.modes[modeKey];
  const steps = MODE_STEPS[modeKey];
  const currentIndex = steps.indexOf(mode.currentStep);
  const workflow = workflowSnapshot(modeKey);
  return `
    <div class="ai-workflow-progress">
      <div class="ai-stepper" aria-label="AI 修改步骤">
      ${steps
        .map((step, index) => {
          const isActive = step === mode.currentStep;
          const isComplete = index < currentIndex;
          const canEnter = isActive || canEnterAiWorkflowPhase(workflow, step);
          return `
          <button
            type="button"
            class="ai-step-button${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}"
            data-ai-step="${step}"
            aria-label="${STEP_LABELS[step]}"
            ${isActive ? 'aria-current="step"' : ''}
            ${canEnter ? '' : 'disabled'}
          >
            <span class="ai-step-index">${index + 1}</span>
            <span class="ai-step-label">${STEP_LABELS[step]}</span>
          </button>
          ${index < steps.length - 1 ? `<span class="ai-step-connector${index < currentIndex ? ' is-complete' : ''}"></span>` : ''}
        `;
        })
        .join('')}
      </div>
      <div class="ai-step-description">${getStepDescription(mode.currentStep)}</div>
    </div>
  `;
}

function buildSelectionMarkup(modeKey) {
  const note =
    modeKey === 'plan'
      ? '<div class="ai-note">计划修改会基于整本世界书自动分析。生成计划后，当前条目分组会被计划结果覆盖。</div>'
      : '';
  return `
    <div class="ai-panel modern-card">
      ${note}
      <div class="ai-row ai-worldbook-row">
        <div class="ai-field ai-grow">
          <label for="ai-workspace-lorebook-search">目标世界书</label>
          <input id="ai-workspace-lorebook" type="hidden">
          <div class="global-lorebook-adder ai-worldbook-adder">
            <div class="global-lorebook-search-wrapper">
              <i class="fa-solid fa-search"></i>
              <input id="ai-workspace-lorebook-search" type="text" placeholder="搜索并选择目标世界书...">
            </div>
            <div id="ai-workspace-lorebook-search-results" class="add-worldbook-results"></div>
          </div>
          <div id="ai-workspace-current-lorebook" class="ai-current-lorebook" data-empty="true">
            当前目标世界书：<strong id="ai-workspace-current-lorebook-name">未选择</strong>
          </div>
        </div>
        <div class="ai-field ai-btn-field">
          <label>&nbsp;</label>
          <button type="button" id="ai-workspace-refresh-entries" class="ai-button-secondary">刷新条目</button>
        </div>
      </div>
      <div class="ai-row">
        <div class="ai-field ai-grow">
          <label for="ai-workspace-search">搜索条目</label>
          <input id="ai-workspace-search" type="text" placeholder="按标题筛选当前世界书条目">
        </div>
      </div>
      <div class="ai-toolbar">
        <button type="button" id="ai-workspace-select-visible" class="ai-button-secondary">当前筛选设为可修改</button>
        <button type="button" id="ai-workspace-mark-visible-readonly" class="ai-button-secondary">当前筛选设为只读</button>
        <button type="button" id="ai-workspace-clear-selection" class="ai-button-secondary">清空选择</button>
        <span id="ai-workspace-selection-summary" class="ai-text">尚未加载条目</span>
      </div>
      <div id="ai-workspace-entry-list" class="ai-scroll ai-entry-list"></div>
      <div class="ai-step-actions">
        <button type="button" class="ai-secondary-button ai-button-secondary" data-ai-step-target="instruction">下一步：指令设定</button>
        <span id="ai-workspace-status" class="ai-text"></span>
      </div>
    </div>
  `;
}

function buildInstructionMarkup(modeKey) {
  const planningPromptField =
    modeKey === 'plan'
      ? `
      <div class="ai-field">
        <label for="ai-workspace-planning-prompt-template">计划提示词</label>
        <textarea id="ai-workspace-planning-prompt-template" class="ai-prompt-template"></textarea>
      </div>
    `
      : '';
  return `
    <div class="ai-panel modern-card">
      <div class="ai-toolbar">
        <label><input type="checkbox" id="ai-workspace-field-title"> 条目标题</label>
        <label><input type="checkbox" id="ai-workspace-field-content"> 条目内容</label>
        <label><input type="checkbox" id="ai-workspace-field-prompt"> 条目提示词</label>
      </div>
      <div class="ai-field">
        <label for="ai-workspace-instruction">发送给 AI 的指令</label>
        <textarea id="ai-workspace-instruction" placeholder="例如：保留原意，但压缩内容，统一语气，并补全更明确的提示词。"></textarea>
      </div>
      <div class="ai-note">这里将 AI 指令、可编辑字段和提示词设置合并到同一步骤，不再散落在多个抽屉中。</div>
      ${buildInfoResourcesMarkup()}
      <details class="ai-prompt-settings">
        <summary>提示词设置</summary>
        <div class="ai-prompt-settings-body">
          <div class="ai-field">
            <label for="ai-workspace-jailbreak-prompt-template">破限提示词</label>
            <textarea id="ai-workspace-jailbreak-prompt-template" class="ai-prompt-template"></textarea>
          </div>
          <div class="ai-field">
            <label for="ai-workspace-builtin-prompt-template">指导提示词</label>
            <textarea id="ai-workspace-builtin-prompt-template" class="ai-prompt-template"></textarea>
          </div>
          ${planningPromptField}
        </div>
      </details>
      <div class="ai-step-actions">
        <button type="button" class="ai-secondary-button ai-button-secondary" data-ai-step-target="selection">返回条目选择</button>
        ${
          modeKey === 'plan'
            ? '<button type="button" id="ai-workspace-plan" class="ai-button-primary">生成改造方案</button>'
            : '<button type="button" id="ai-workspace-preview" class="ai-button-primary">生成修改结果</button>'
        }
        <button type="button" id="ai-workspace-stop" class="ai-button-danger" disabled>停止生成</button>
        <span id="ai-workspace-status" class="ai-text"></span>
      </div>
    </div>
  `;
}

function buildPrepareMarkup(modeKey) {
  const isPlan = modeKey === 'plan';
  return `
    <div class="ai-prepare-grid">
      <section class="ai-workbench-panel ai-scope-panel" aria-labelledby="ai-scope-title">
        <div class="ai-section-heading">
          <div><span class="ai-section-kicker">01 / 范围</span><h2 id="ai-scope-title">选择世界书与条目</h2></div>
          <button type="button" id="ai-workspace-refresh-entries" class="ai-icon-text-button"><i class="fa-solid fa-rotate"></i><span>刷新</span></button>
        </div>
        <div class="ai-field">
          <label for="ai-workspace-lorebook-search">目标世界书</label>
          <input id="ai-workspace-lorebook" type="hidden">
          <div class="global-lorebook-adder ai-worldbook-adder">
            <div class="global-lorebook-search-wrapper">
              <i class="fa-solid fa-search"></i>
              <input id="ai-workspace-lorebook-search" type="text" role="combobox" aria-autocomplete="list" aria-controls="ai-workspace-lorebook-search-results" aria-expanded="false" placeholder="搜索并选择目标世界书…">
            </div>
            <div id="ai-workspace-lorebook-search-results" class="add-worldbook-results" role="listbox"></div>
          </div>
          <div id="ai-workspace-current-lorebook" class="ai-current-lorebook" data-empty="true">
            <span>当前目标</span><strong id="ai-workspace-current-lorebook-name">未选择</strong>
          </div>
        </div>
        <div class="ai-scope-search-row">
          <div class="ai-field ai-grow">
            <label for="ai-workspace-search">筛选条目</label>
            <input id="ai-workspace-search" type="search" placeholder="搜索标题、UID 或正文">
          </div>
          <div id="ai-workspace-selection-summary" class="ai-selection-counts" aria-live="polite">尚未加载条目</div>
        </div>
        <div class="ai-bulk-toolbar" aria-label="批量设置当前筛选结果">
          <span>当前筛选：</span>
          <button type="button" id="ai-workspace-select-visible">设为修改</button>
          <button type="button" id="ai-workspace-mark-visible-readonly">设为只读</button>
          <button type="button" id="ai-workspace-clear-selection">全部排除</button>
        </div>
        <div id="ai-workspace-entry-list" class="ai-entry-list" aria-label="世界书条目范围"></div>
        <div class="ai-inline-note ${isPlan ? 'is-plan' : ''}">
          <i class="fa-solid ${isPlan ? 'fa-route' : 'fa-circle-check'}"></i>
          <span>${isPlan ? '手工选择会成为硬约束；不选择条目时，AI 将分析整本世界书并提出范围。' : '直接修改至少需要一条“修改”条目；“只读”条目只作为上下文。'}</span>
        </div>
      </section>

      <section class="ai-workbench-panel ai-instruction-panel" aria-labelledby="ai-instruction-title">
        <div class="ai-section-heading">
          <div><span class="ai-section-kicker">02 / 指令</span><h2 id="ai-instruction-title">说明本次修改目标</h2></div>
          <div class="ai-field-toggles" aria-label="允许修改的字段">
            <label><input type="checkbox" id="ai-workspace-field-title"><span>标题</span></label>
            <label><input type="checkbox" id="ai-workspace-field-content"><span>正文</span></label>
            <label><input type="checkbox" id="ai-workspace-field-prompt"><span>关键词</span></label>
          </div>
        </div>
        <div class="ai-field ai-instruction-field">
          <label for="ai-workspace-instruction">发送给 AI 的指令</label>
          <textarea id="ai-workspace-instruction" placeholder="例如：保留原意，压缩冗余描述，统一叙述语气，并补全准确关键词。"></textarea>
        </div>
        ${buildInfoResourcesMarkup()}
        <details class="ai-prompt-settings ai-advanced-settings">
          <summary><span>高级提示词</span><small>通常无需修改</small></summary>
          <div class="ai-prompt-settings-body">
            <div class="ai-field"><label for="ai-workspace-jailbreak-prompt-template">破限提示词</label><textarea id="ai-workspace-jailbreak-prompt-template" class="ai-prompt-template"></textarea></div>
            <div class="ai-field"><label for="ai-workspace-builtin-prompt-template">指导提示词</label><textarea id="ai-workspace-builtin-prompt-template" class="ai-prompt-template"></textarea></div>
            ${isPlan ? '<div class="ai-field"><label for="ai-workspace-planning-prompt-template">规划提示词</label><textarea id="ai-workspace-planning-prompt-template" class="ai-prompt-template"></textarea></div>' : ''}
          </div>
        </details>
      </section>
    </div>
    <div class="ai-command-bar">
      <div class="ai-command-status"><span class="ai-status-dot"></span><span id="ai-workspace-status" role="status" aria-live="polite"></span></div>
      <div class="ai-command-actions">
        <button type="button" id="ai-workspace-stop" class="ai-button-danger" disabled><i class="fa-solid fa-stop"></i>停止</button>
        ${isPlan
          ? '<button type="button" id="ai-workspace-plan" class="ai-button-primary"><span>生成修改计划</span><i class="fa-solid fa-arrow-right"></i></button>'
          : '<button type="button" id="ai-workspace-preview" class="ai-button-primary"><span>生成修改预览</span><i class="fa-solid fa-arrow-right"></i></button>'}
      </div>
    </div>
  `;
}

function buildPlanningMarkup() {
  return `
    <div class="ai-plan-review-grid">
      <section class="ai-workbench-panel ai-plan-editor" aria-labelledby="ai-plan-editor-title">
        <div class="ai-section-heading"><div><span class="ai-section-kicker">计划审阅</span><h2 id="ai-plan-editor-title">把方案调整到可执行</h2></div></div>
        <div id="ai-workspace-plan-summary" class="ai-plan-summary" aria-live="polite">${EMPTY_PLAN_TEXT}</div>
        <div class="ai-field"><label for="ai-workspace-plan-goal">总体目标</label><textarea id="ai-workspace-plan-goal" rows="3"></textarea></div>
        <div class="ai-plan-fields-grid">
          <div class="ai-field"><label for="ai-workspace-plan-must-keep">必须保留 <small>每行一项</small></label><textarea id="ai-workspace-plan-must-keep"></textarea></div>
          <div class="ai-field"><label for="ai-workspace-plan-rewrite-rules">改写规则 <small>每行一项</small></label><textarea id="ai-workspace-plan-rewrite-rules"></textarea></div>
          <div class="ai-field"><label for="ai-workspace-plan-consistency-notes">一致性注意 <small>每行一项</small></label><textarea id="ai-workspace-plan-consistency-notes"></textarea></div>
        </div>
        <details class="ai-prompt-settings ai-advanced-settings">
          <summary><span>原始计划 JSON</span><small>高级编辑</small></summary>
          <div class="ai-prompt-settings-body"><textarea id="ai-workspace-plan-json" class="ai-code-textarea"></textarea></div>
        </details>
        <div id="ai-workspace-plan-error" class="ai-form-error" role="alert"></div>
      </section>
      <section class="ai-workbench-panel ai-plan-scope" aria-labelledby="ai-plan-scope-title">
        <div class="ai-section-heading"><div><span class="ai-section-kicker">条目分组</span><h2 id="ai-plan-scope-title">确认修改与只读范围</h2></div></div>
        <div id="ai-workspace-plan-scope-list" class="ai-plan-scope-list"></div>
      </section>
    </div>
    <div class="ai-command-bar">
      <div class="ai-command-status"><span class="ai-status-dot"></span><span id="ai-workspace-status" role="status" aria-live="polite"></span></div>
      <div class="ai-command-actions">
        <button type="button" class="ai-button-secondary" data-ai-step-target="prepare"><i class="fa-solid fa-arrow-left"></i>返回准备</button>
        <button type="button" id="ai-workspace-stop" class="ai-button-danger" disabled><i class="fa-solid fa-stop"></i>停止</button>
        <button type="button" id="ai-workspace-preview" class="ai-button-primary"><span>按此计划生成预览</span><i class="fa-solid fa-arrow-right"></i></button>
      </div>
    </div>
  `;
}

function buildResultMarkup(modeKey) {
  const backStep = modeKey === 'plan' && state.modes.plan.planningResult ? 'planReview' : 'prepare';
  const changedCount = state.modes[modeKey].previewResult?.summary?.changed || 0;
  return `
    <div class="ai-review-layout">
      <section class="ai-workbench-panel ai-review-list-panel">
        <div class="ai-section-heading"><div><span class="ai-section-kicker">修改审阅</span><h2>逐条检查结果</h2></div></div>
        <div id="ai-workspace-preview-summary" class="ai-preview-summary" aria-live="polite">${EMPTY_PREVIEW_TEXT}</div>
      <div id="ai-workspace-preview-errors" class="ai-preview-errors"></div>
        <div id="ai-workspace-preview-list" class="ai-scroll ai-preview-list"></div>
      </section>
      <section class="ai-workbench-panel ai-review-detail-panel">
        <div id="ai-workspace-preview-detail" class="ai-preview-detail"></div>
      </section>
    </div>
    <details class="ai-diagnostics-drawer">
      <summary><i class="fa-solid fa-stethoscope"></i><span>请求诊断与原始数据</span></summary>
      <div class="ai-debug-grid">
        <details class="ai-debug-block">
          <summary>发送给 AI 的完整内容</summary>
          <textarea id="ai-workspace-debug-request" readonly></textarea>
        </details>
        <details class="ai-debug-block">
          <summary>AI 返回的完整内容</summary>
          <textarea id="ai-workspace-debug-response" readonly></textarea>
        </details>
        <details class="ai-debug-block">
          <summary>解析出的 JSON</summary>
          <textarea id="ai-workspace-debug-json" readonly></textarea>
        </details>
        <details class="ai-debug-block">
          <summary>请求失败的完整报错</summary>
          <textarea id="ai-workspace-debug-error" readonly></textarea>
        </details>
        <details class="ai-debug-block">
          <summary>兼容诊断报告</summary>
          <textarea id="ai-workspace-debug-diagnostics" readonly></textarea>
        </details>
      </div>
    </details>
    <div class="ai-command-bar">
      <div class="ai-command-status"><span class="ai-status-dot"></span><span id="ai-workspace-status" role="status" aria-live="polite"></span></div>
      <div class="ai-command-actions">
        <button type="button" class="ai-button-secondary" data-ai-step-target="${backStep}"><i class="fa-solid fa-arrow-left"></i>返回</button>
        <button type="button" id="ai-workspace-preview" class="ai-button-secondary"><i class="fa-solid fa-rotate"></i>重新生成</button>
        <button type="button" id="ai-workspace-stop" class="ai-button-danger" disabled><i class="fa-solid fa-stop"></i>停止</button>
        <button type="button" id="ai-workspace-apply" class="ai-button-primary" disabled><span>应用 ${changedCount} 条修改</span><i class="fa-solid fa-check"></i></button>
      </div>
    </div>
  `;
}

function buildCompleteMarkup(modeKey) {
  const result = state.modes[modeKey].lastApplyResult || {};
  const applied = Number(result.appliedCount || result.appliedUids?.length || 0);
  const skipped = Number(result.skippedCount || result.skipped?.length || 0);
  return `
    <section class="ai-complete-panel" aria-labelledby="ai-complete-title">
      <div class="ai-complete-mark"><i class="fa-solid fa-check"></i></div>
      <span class="ai-section-kicker">任务完成</span>
      <h2 id="ai-complete-title">修改已经安全写回</h2>
      <p>成功应用 ${applied} 条${skipped ? `，另有 ${skipped} 条因冲突或缺失未写入` : ''}。写回已记录事务快照。</p>
      <div class="ai-complete-actions"><button type="button" id="ai-workspace-start-new" class="ai-button-primary">开始下一次修改</button></div>
      <div id="ai-workspace-rollback-panel" class="ai-rollback-card"></div>
      <div class="ai-rollback-actions">
        <button type="button" id="ai-workspace-rollback-preview" class="ai-button-secondary" disabled>查看最近事务</button>
        <button type="button" id="ai-workspace-rollback-execute" class="ai-button-danger" disabled>撤销最近事务</button>
      </div>
      <span id="ai-workspace-status" role="status" aria-live="polite"></span>
    </section>
  `;
}

function buildModeWorkspace(modeKey) {
  const mode = state.modes[modeKey];
  let bodyMarkup = '';
  switch (mode.currentStep) {
    case 'prepare':
      bodyMarkup = buildPrepareMarkup(modeKey);
      break;
    case 'planReview':
      bodyMarkup = buildPlanningMarkup();
      break;
    case 'review':
      bodyMarkup = buildResultMarkup(modeKey);
      break;
    case 'complete':
      bodyMarkup = buildCompleteMarkup(modeKey);
      break;
    default:
      bodyMarkup = buildPrepareMarkup(modeKey);
      break;
  }

  return `
    <div class="ai-workflow-page" data-stage="${mode.currentStep}">
      ${buildStepIndicator(modeKey)}
      ${bodyMarkup}
    </div>
  `;
}

function buildDesktopShellMarkup() {
  const saved = settings();
  const modelLabel = saved.apiMode === 'custom' ? saved.customApi?.model || '自定义模型待配置' : '当前酒馆预设';
  const referenceLength = (state.referenceMaterial || '').trim().length;
  return `
    <div id="${ROOT_ID}" data-layout="wide" class="ai-workbench-root">
      <header class="ai-workbench-header">
        <div class="ai-workbench-brand">
          <span class="ai-brand-mark"><i class="fa-solid fa-feather-pointed"></i></span>
          <div><h1>AI 修改</h1><p>先定义边界，再审阅每一处写回</p></div>
        </div>
        <div class="ai-strategy-switch" role="group" aria-label="修改策略">
          ${STRATEGIES.map(item => `<button type="button" class="ai-strategy-button${state.currentNav === item.key ? ' is-active' : ''}" data-ai-strategy="${item.key}" aria-pressed="${state.currentNav === item.key}"><i class="${item.icon}"></i><span>${item.label}</span></button>`).join('')}
        </div>
        <div class="ai-context-chips">
          <button type="button" class="ai-context-chip" data-ai-open-settings><i class="fa-solid fa-microchip"></i><span>${_.escape(modelLabel)}</span></button>
          <button type="button" class="ai-context-chip" data-ai-focus-context><i class="fa-regular fa-comments"></i><span>${state.chatContext.enabled ? `${state.chatMessages.length || 1} 条上下文` : '上下文关闭'}</span></button>
          <button type="button" class="ai-context-chip" data-ai-open-assistant-tab="reference"><i class="fa-regular fa-folder-open"></i><span>${referenceLength ? `${referenceLength} 字资料` : '添加资料'}</span></button>
          <button type="button" class="ai-icon-button" data-ai-open-assistant-tab="chat" aria-label="打开 AI 助手"><i class="fa-solid fa-sparkles"></i></button>
        </div>
        <span id="ai-workspace-shared-status" class="ai-visually-hidden" aria-live="polite">${_.escape(state.sharedStatusText || '')}</span>
      </header>
      <main class="ai-workbench-main">
        <div id="ai-workspace-desktop-panel"></div>
      </main>
      <div id="ai-workspace-settings-modal" class="ai-tool-backdrop" style="display:none" aria-hidden="true">
        <aside class="ai-tool-drawer" role="dialog" aria-modal="true" aria-labelledby="ai-workspace-settings-title">
          <header><div><span class="ai-section-kicker">工作台设置</span><h2 id="ai-workspace-settings-title">模型与上下文预算</h2></div><button type="button" id="ai-workspace-settings-close" class="ai-icon-button" aria-label="关闭设置"><i class="fa-solid fa-xmark"></i></button></header>
          <div class="ai-tool-drawer-body">${buildApiSettingsMarkup()}</div>
        </aside>
      </div>
      <dialog id="ai-workspace-rollback-dialog" class="ai-confirm-dialog" aria-labelledby="ai-workspace-rollback-dialog-title">
        <div class="ai-confirm-dialog-body">
          <div class="ai-confirm-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
          <h2 id="ai-workspace-rollback-dialog-title">撤销最近一次世界书操作</h2>
          <p id="ai-workspace-rollback-dialog-summary"></p>
          <div id="ai-workspace-rollback-dialog-items" class="ai-rollback-dialog-items"></div>
          <div class="ai-confirm-actions"><button type="button" id="ai-workspace-rollback-dialog-cancel" class="ai-button-secondary">取消</button><button type="button" id="ai-workspace-rollback-dialog-confirm" class="ai-button-danger">确认撤销</button></div>
        </div>
      </dialog>
      ${buildPreviewModalMarkup()}
      ${buildAssistantModalMarkup()}
    </div>
  `;
}

function ensureMarkup() {
  const $container = container();
  if (!$container.length) {
    return;
  }

  if (!root().length) {
    $container.empty().html(buildDesktopShellMarkup());
  }
}

function ensureStyles() {
  if ($('#lorebook-ai-workspace-desktop-styles', parentDoc()).length) {
    return;
  }

  $('head', parentDoc()).append(`
    <style id="lorebook-ai-workspace-desktop-styles">
      #${AI_CONTENT_ID}{overflow:hidden!important;padding-right:0;box-sizing:border-box}
      #${AI_CONTENT_ID} .ai-workspace-list-container{overflow:hidden;flex-grow:1}
      #${ROOT_ID}.ai-desktop-root{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;height:100%;min-height:0;color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-desktop-nav{border:1px solid rgba(255,255,255,.12);border-radius:8px;background:${AI_WORKSPACE_SURFACE};padding:16px;display:flex;flex-direction:column;gap:12px}
      #${ROOT_ID} .ai-mobile-nav-bar{display:none}
      #${ROOT_ID} .ai-mobile-nav-toggle{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-mobile-nav-toggle:hover{background:rgba(255,255,255,.08)}
      #${ROOT_ID} .ai-mobile-nav-menu-header{display:none}
      #${ROOT_ID} .ai-mobile-nav-current{min-width:0;font-size:13px;font-weight:600;color:var(--panel-text-color,#eee);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ROOT_ID} .ai-nav-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;font-weight:700;letter-spacing:0;color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-phone-title-button{width:32px;height:32px;min-width:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-phone-title-button:hover{background:rgba(255,255,255,.12)}
      #${ROOT_ID} .ai-mobile-menu-title{display:flex;align-items:center;justify-content:space-between;gap:8px}
      #${ROOT_ID} .ai-nav-list{display:flex;flex-direction:column;gap:8px}
      #${ROOT_ID} .ai-mode-nav-button{display:flex;flex-direction:column;align-items:flex-start;gap:4px;border:1px solid var(--panel-border-color,#555);border-radius:8px;background:rgba(255,255,255,.02);color:var(--panel-text-color,#eee);padding:12px 14px;cursor:pointer;text-align:left}
      #${ROOT_ID} .ai-mode-nav-button.is-active{border-color:var(--panel-accent-color,#9a7ace);background:rgba(154,122,206,.18);box-shadow:inset 0 0 0 1px rgba(154,122,206,.18)}
      #${ROOT_ID} .ai-mode-nav-button.is-disabled{opacity:.78}
      #${ROOT_ID} .ai-mode-nav-button small{font-size:12px;opacity:.7}
      #${ROOT_ID} .ai-desktop-main{min-width:0;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:${AI_WORKSPACE_SURFACE};padding:12px}
      #${ROOT_ID} #ai-workspace-desktop-panel{height:100%;overflow-y:auto;padding-right:4px}
      #${ROOT_ID} .ai-page{display:flex;flex-direction:column;gap:14px;min-height:100%}
      #${ROOT_ID} .ai-workflow-progress{position:sticky;top:0;z-index:4;border:1px solid var(--panel-border-color,#555);border-radius:8px;background:var(--panel-bg-color,rgba(42,42,42,.95));padding:12px;display:flex;flex-direction:column;gap:8px}
      #${ROOT_ID} .ai-stepper{display:flex;align-items:center;gap:8px;min-width:0}
      #${ROOT_ID} .ai-step-button{position:relative;display:inline-flex;align-items:center;gap:8px;border:0;border-radius:0;background:transparent;color:var(--panel-text-color,#cfd8dc);padding:0;cursor:pointer;min-width:0}
      #${ROOT_ID} .ai-step-button:hover{background:transparent}
      #${ROOT_ID} .ai-step-button.is-active{color:var(--panel-text-color,#fff)}
      #${ROOT_ID} .ai-step-index{width:28px;height:28px;flex:0 0 28px;border-radius:999px;border:1px solid var(--panel-border-color,#555);background:var(--panel-entry-bg-color,#242424);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
      #${ROOT_ID} .ai-step-button.is-complete .ai-step-index{border-color:#4a9a7c;background:rgba(74,154,124,.2);color:#dff5e8}
      #${ROOT_ID} .ai-step-button.is-active .ai-step-index{border-color:var(--panel-accent-color,#9a7ace);background:rgba(154,122,206,.28);box-shadow:0 0 0 3px rgba(154,122,206,.16)}
      #${ROOT_ID} .ai-step-label{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${ROOT_ID} .ai-step-connector{height:2px;min-width:28px;flex:1 1 28px;background:var(--panel-border-color,#555);opacity:.8}
      #${ROOT_ID} .ai-step-connector.is-complete{background:#4a9a7c}
      #${ROOT_ID} .ai-step-description{color:var(--panel-text-color,#cfd8dc);font-size:13px;line-height:1.45}
      #${ROOT_ID} .ai-panel{border:1px solid var(--panel-border-color,#555);border-radius:8px;background:var(--panel-bg-color,rgba(42,42,42,.95));padding:16px;display:flex;flex-direction:column;gap:12px}
      #${ROOT_ID} .ai-row{display:flex;gap:12px;align-items:flex-end}
      #${ROOT_ID} .ai-worldbook-row{align-items:flex-start}
      #${ROOT_ID} .ai-field{display:flex;flex-direction:column;gap:6px;min-width:160px}
      #${ROOT_ID} .ai-grow{flex:1 1 auto}
      #${ROOT_ID} .ai-btn-field{flex:0 0 auto;min-width:140px}
      #${ROOT_ID} label{font-size:13px;color:var(--panel-text-color,#ddd)}
      #${ROOT_ID} input[type='text'],#${ROOT_ID} input[type='password'],#${ROOT_ID} select,#${ROOT_ID} textarea{width:100%;box-sizing:border-box;border:1px solid var(--panel-border-color,#555);border-radius:6px;background:var(--search-input-bg-color,#222);color:var(--panel-text-color,#eee);padding:9px 10px}
      #${ROOT_ID} textarea{min-height:120px;resize:vertical}
      #${ROOT_ID} .ai-readonly-textarea{min-height:180px;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} .ai-chat-context-textarea{min-height:180px;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} .ai-reference-material{min-height:220px}
      #${ROOT_ID} .ai-assistant-input{min-height:120px}
      #${ROOT_ID} .ai-prompt-template{min-height:220px;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} .ai-prompt-settings{border:1px solid var(--panel-border-color,#444);border-radius:6px;background:var(--panel-entry-bg-color,#242424)}
      #${ROOT_ID} .ai-prompt-settings summary{cursor:pointer;padding:10px 12px;font-size:13px;font-weight:600;color:var(--panel-text-color,#ddd);background:rgba(255,255,255,.03)}
      #${ROOT_ID} .ai-prompt-settings-body{display:flex;flex-direction:column;gap:12px;padding:12px}
      #${ROOT_ID} .ai-info-panel{display:grid;gap:12px}
      #${ROOT_ID} .ai-subpanel{border:1px solid var(--panel-border-color,#444);border-radius:6px;background:var(--panel-entry-bg-color,#242424);padding:12px;display:flex;flex-direction:column;gap:12px}
      #${ROOT_ID} .ai-subpanel-header h5{margin:0 0 4px 0;font-size:14px}
      #${ROOT_ID} .ai-subpanel-header p{margin:0;color:var(--panel-text-color,#cfd8dc);font-size:12px;line-height:1.5}
      #${ROOT_ID} .ai-toggle-line{display:inline-flex;align-items:center;gap:8px}
      #${ROOT_ID} .ai-context-panel:not([open]){background:var(--panel-entry-bg-color,#242424)}
      #${ROOT_ID} .ai-reference-compact{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--panel-border-color,#444);border-radius:8px;background:var(--panel-entry-bg-color,#242424);padding:12px}
      #${ROOT_ID} .ai-reference-title{font-size:13px;font-weight:700;margin-bottom:4px}
      #${ROOT_ID} #ai-workspace-reference-material-status[data-empty='true']{opacity:.74}
      #${ROOT_ID} .ai-phone-inline-button{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;background:transparent;border-color:rgba(255,255,255,.18)}
      #${ROOT_ID} .ai-budget-panel{border:1px solid var(--panel-border-color,#444);border-radius:6px;background:var(--panel-entry-bg-color,#242424);padding:12px;display:flex;flex-direction:column;gap:10px}
      #${ROOT_ID} button{border:1px solid var(--panel-border-color,#666);border-radius:6px;background:var(--panel-accent-color,#4a6a8a);color:var(--panel-text-color,#fff);padding:9px 12px;cursor:pointer}
      #${ROOT_ID} button[disabled]{opacity:.6;cursor:not-allowed}
      #${ROOT_ID} .ai-secondary-button{background:transparent}
      #${ROOT_ID} .ai-button-primary{background:var(--panel-accent-color,#4a6a8a);border-color:rgba(159,200,228,.45);font-weight:600}
      #${ROOT_ID} .ai-button-secondary{background:transparent;border-color:rgba(255,255,255,.18)}
      #${ROOT_ID} .ai-button-danger{background:rgba(164,68,68,.22);border-color:rgba(230,120,120,.45);color:#ffd7d7}
      #${ROOT_ID} .ai-toolbar,#${ROOT_ID} .ai-step-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      #${ROOT_ID} .ai-api-toolbar{justify-content:space-between}
      #${ROOT_ID} .ai-status-line{display:flex;align-items:center;gap:10px}
      #${ROOT_ID} .ai-text{color:var(--panel-text-color,#cfd8dc);line-height:1.4;font-size:13px}
      #${ROOT_ID} .ai-note{font-size:13px;line-height:1.5;color:var(--panel-text-color,#cfd8dc);opacity:.9}
      #${ROOT_ID} .ai-scroll{overflow-y:auto;border:1px solid var(--panel-border-color,#444);border-radius:6px;background:var(--panel-entry-bg-color,#242424)}
      #${ROOT_ID} .ai-entry-list{min-height:320px;max-height:460px}
      #${ROOT_ID} .ai-preview-list{min-height:220px;max-height:420px}
      #${ROOT_ID} .ai-result-grid{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,1.2fr);gap:12px;min-height:360px}
      #${ROOT_ID} .ai-preview-detail{border:1px solid var(--panel-border-color,#444);border-radius:6px;background:var(--panel-entry-bg-color,#242424);padding:12px;overflow:auto;min-height:320px}
      #${ROOT_ID} .ai-preview-detail-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
      #${ROOT_ID} .ai-preview-modal-content-inline{display:flex;flex-direction:column;gap:12px}
      #${ROOT_ID} .ai-rollback-panel{display:none;border:1px solid rgba(111,180,140,.55);border-radius:6px;background:rgba(111,180,140,.1);padding:10px 12px;color:var(--panel-text-color,#e8f5ee)}
      #${ROOT_ID} .ai-rollback-panel:not(:empty){display:block}
      #${ROOT_ID} .ai-entry-item{display:flex;gap:10px;align-items:flex-start;padding:12px;border-bottom:1px solid var(--panel-border-color,#3e3e3e)}
      #${ROOT_ID} .ai-entry-item:last-child,#${ROOT_ID} .ai-preview-item:last-child{border-bottom:0}
      #${ROOT_ID} .ai-entry-main{min-width:0;flex:1 1 auto}
      #${ROOT_ID} .ai-entry-mode{width:150px;flex:0 0 150px}
      #${ROOT_ID} .ai-entry-item-title,#${ROOT_ID} .ai-preview-item-title{font-weight:600;margin-bottom:4px;color:var(--panel-text-color,#eee);overflow:hidden;text-overflow:var(--lorebook-name-text-overflow);white-space:var(--lorebook-name-white-space);overflow-wrap:var(--lorebook-name-overflow-wrap);word-break:var(--lorebook-name-word-break)}
      #${ROOT_ID} .ai-entry-item-meta,#${ROOT_ID} .ai-entry-item-snippet{color:var(--panel-text-color,#ccc);font-size:13px;line-height:1.5}
      #${ROOT_ID} .ai-entry-item-snippet{margin-top:4px}
      #${ROOT_ID} .ai-preview-errors{display:none;color:#ffb4b4;white-space:pre-wrap}
      #${ROOT_ID} .ai-preview-errors.has-errors{display:block}
      #${ROOT_ID} .ai-assistant-history{min-height:180px;max-height:320px;padding:12px}
      #${ROOT_ID} .ai-assistant-message{padding:10px 12px;border:1px solid var(--panel-border-color,#3d3d3d);border-radius:6px;background:rgba(255,255,255,.03)}
      #${ROOT_ID} .ai-assistant-message + .ai-assistant-message{margin-top:10px}
      #${ROOT_ID} .ai-assistant-message.is-assistant{border-color:rgba(159,200,228,.45);background:rgba(159,200,228,.08)}
      #${ROOT_ID} .ai-assistant-message-meta{font-size:12px;color:var(--panel-text-color,#bbb);margin-bottom:6px}
      #${ROOT_ID} .ai-assistant-message-body{white-space:pre-wrap;word-break:break-word;line-height:1.5}
      #${ROOT_ID} .ai-assistant-actions{margin-top:8px}
      #${ROOT_ID} .ai-assistant-actions button{padding:6px 10px;font-size:12px}
      #${ROOT_ID} .ai-assistant-modal{position:fixed;inset:0;z-index:10007;background:rgba(0,0,0,.58);display:none;align-items:center;justify-content:flex-end;padding:24px max(24px,5vw);box-sizing:border-box}
      #${ROOT_ID} .ai-assistant-phone{width:min(420px,calc(100vw - 48px));height:min(720px,calc(100vh - 48px));min-height:520px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:var(--panel-bg-color,#252525);box-shadow:0 20px 60px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;position:relative}
      #${ROOT_ID} .ai-assistant-phone-header{padding:12px 14px;background:var(--panel-entry-bg-color,#2f2f2f);border-bottom:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:space-between;gap:12px}
      #${ROOT_ID} .ai-assistant-phone-title{font-size:15px;font-weight:700}
      #${ROOT_ID} .ai-assistant-phone-subtitle{font-size:12px;color:var(--panel-text-color,#cfd8dc);margin-top:2px}
      #${ROOT_ID} .ai-icon-button{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:transparent;border-color:rgba(255,255,255,.16)}
      #${ROOT_ID} .ai-assistant-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px;background:var(--panel-entry-bg-color,#2a2a2a);border-bottom:1px solid rgba(255,255,255,.08)}
      #${ROOT_ID} .ai-assistant-tab{padding:7px 8px;border-radius:8px;background:transparent;border-color:transparent;color:var(--panel-text-color,#d9d9d9)}
      #${ROOT_ID} .ai-assistant-tab.is-active{background:rgba(159,200,228,.18);border-color:rgba(159,200,228,.35);color:var(--panel-text-color,#fff)}
      #${ROOT_ID} .ai-assistant-phone-body{min-height:0;flex:1 1 auto;display:flex;flex-direction:column;background:rgba(255,255,255,.02)}
      #${ROOT_ID} .ai-assistant-tab-panel{min-height:0;flex:1 1 auto;display:flex;flex-direction:column;gap:0}
      #${ROOT_ID} .ai-assistant-chat-area{position:relative;min-height:0;flex:1 1 auto;display:flex;flex-direction:column}
      #${ROOT_ID} .ai-assistant-history{min-height:0;max-height:none;flex:1 1 auto;padding:12px;display:flex;flex-direction:column;gap:10px;border:0;border-radius:0;background:transparent;user-select:text;-webkit-user-select:text}
      #${ROOT_ID} .ai-assistant-message{max-width:86%;padding:9px 11px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.07);box-shadow:none}
      #${ROOT_ID} .ai-assistant-message + .ai-assistant-message{margin-top:0}
      #${ROOT_ID} .ai-assistant-message.is-assistant{align-self:flex-start;border-color:rgba(159,200,228,.25);background:rgba(159,200,228,.12)}
      #${ROOT_ID} .ai-assistant-message.is-user{align-self:flex-end;background:rgba(111,180,140,.18);border-color:rgba(111,180,140,.28)}
      #${ROOT_ID} .ai-assistant-message-meta{font-size:11px;opacity:.72;margin-bottom:4px}
      #${ROOT_ID} .ai-assistant-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      #${ROOT_ID} .ai-assistant-actions button{border-radius:6px;padding:5px 8px;font-size:12px}
      #${ROOT_ID} .ai-assistant-footer{border-top:1px solid rgba(255,255,255,.08);background:var(--panel-entry-bg-color,#292929);padding:8px;display:flex;flex-direction:column;gap:8px}
      #${ROOT_ID} .ai-assistant-actions-row{display:flex;align-items:center;gap:8px;min-height:30px}
      #${ROOT_ID} .ai-assistant-composer{display:grid;grid-template-columns:minmax(0,1fr) 38px;gap:8px;align-items:end}
      #${ROOT_ID} .ai-assistant-input{min-height:44px;max-height:120px;resize:vertical;border-radius:8px}
      #${ROOT_ID} .ai-send-button{width:38px;height:38px;padding:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center}
      #${ROOT_ID} .ai-reference-editor-field{min-height:0;flex:1 1 auto;padding:12px}
      #${ROOT_ID} .ai-reference-editor-field .ai-reference-material{min-height:360px;flex:1 1 auto;border-radius:8px;background:#151f1c;border-color:rgba(255,255,255,.12)}
      #${ROOT_ID} .ai-assistant-selection-toolbar{position:absolute;z-index:3;transform:translate(-50%,-100%);background:var(--panel-bg-color,#242424);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:5px;box-shadow:0 8px 24px rgba(0,0,0,.45)}
      #${ROOT_ID} .ai-assistant-selection-toolbar button{padding:6px 10px;border-radius:6px;background:rgba(159,200,228,.18);border-color:rgba(159,200,228,.35);white-space:nowrap}
      #${ROOT_ID} .ai-preview-item{padding:12px;border-bottom:1px solid var(--panel-border-color,#3e3e3e);cursor:pointer}
      #${ROOT_ID} .ai-preview-item:hover{background:rgba(255,255,255,.04)}
      #${ROOT_ID} .ai-preview-item.is-active{background:rgba(154,122,206,.18)}
      #${ROOT_ID} .ai-preview-item-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      #${ROOT_ID} .ai-preview-item-header .ai-preview-item-title{min-width:0;flex:1 1 auto}
      #${ROOT_ID} .ai-preview-exclude{flex:0 0 auto;padding:4px 8px;font-size:12px;border-color:rgba(220,120,120,.5);color:#f0c6c6;background:rgba(220,120,120,.08)}
      #${ROOT_ID} .ai-preview-exclude:hover{background:rgba(220,120,120,.16)}
      #${ROOT_ID} .ai-preview-detail-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      #${ROOT_ID} .ai-preview-diff + .ai-preview-diff{margin-top:8px}
      #${ROOT_ID} .ai-preview-diff-label{color:var(--panel-accent-color,#9fc8e4);margin-bottom:2px}
      #${ROOT_ID} .ai-preview-diff-before,#${ROOT_ID} .ai-preview-diff-after{font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      #${ROOT_ID} .ai-preview-diff-before{color:var(--panel-text-color,#b8b8b8);opacity:.8}
      #${ROOT_ID} .ai-preview-diff-after{color:var(--panel-text-color,#f3df94)}
      #${ROOT_ID} .ai-preview-modal{position:fixed;z-index:10006;left:0;top:0;width:100vw;height:100vh;background-color:rgba(0,0,0,.7);overflow-y:auto;box-sizing:border-box}
      #${ROOT_ID} .ai-preview-modal-dialog{background:var(--panel-bg-color,#2c2c2c);color:var(--panel-text-color,#eee);border:1px solid var(--panel-border-color,#555);width:90%;max-width:900px;border-radius:8px;box-shadow:0 5px 15px rgba(0,0,0,.5);display:flex;flex-direction:column;max-height:calc(100vh - 150px);margin:80px auto 50px auto}
      #${ROOT_ID} .ai-preview-modal-header{padding:10px 15px;background:var(--panel-accent-color,#3a6a8e);color:#fff;border-top-left-radius:8px;border-top-right-radius:8px;display:flex;justify-content:space-between;align-items:center}
      #${ROOT_ID} .ai-preview-modal-header h4{margin:0;font-size:16px}
      #${ROOT_ID} .ai-preview-modal-close{font-size:28px;font-weight:700;cursor:pointer;line-height:1}
      #${ROOT_ID} .ai-preview-modal-body{padding:15px;max-height:70vh;overflow-y:auto}
      #${ROOT_ID} .ai-preview-modal-section + .ai-preview-modal-section{margin-top:14px}
      #${ROOT_ID} .ai-preview-modal-section-title{font-weight:600;margin-bottom:6px;color:var(--panel-accent-color,#9fc8e4)}
      #${ROOT_ID} .ai-preview-modal-panel{display:grid;gap:10px}
      #${ROOT_ID} .ai-preview-modal-field textarea{min-height:180px;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} .ai-preview-modal-footer{padding:10px 15px;text-align:right;border-top:1px solid var(--panel-border-color,#444)}
      #${ROOT_ID} .ai-empty{padding:12px;color:var(--panel-text-color,#bbb);opacity:.8}
      #${ROOT_ID} .ai-worldbook-adder{position:relative}
      #${ROOT_ID} .ai-worldbook-adder .global-lorebook-search-wrapper{margin-bottom:0}
      #${ROOT_ID} .ai-worldbook-adder .fa-search{position:absolute;top:50%;left:10px;transform:translateY(-50%);color:#888}
      #${ROOT_ID} #ai-workspace-lorebook-search{padding:8px 12px 8px 35px}
      #${ROOT_ID} #ai-workspace-lorebook-search-results{position:absolute;top:calc(100% + 4px);left:0;right:0;display:none;max-height:320px;overflow-y:auto;box-sizing:border-box;z-index:320}
      #${ROOT_ID} #ai-workspace-lorebook-search-results .add-worldbook-result-item.is-active{background:rgba(255,255,255,.08)}
      #${ROOT_ID} .ai-current-lorebook{padding:8px 10px;border:1px solid var(--panel-border-color,#555);border-radius:6px;background:var(--panel-entry-bg-color,#2a2a2a);color:var(--panel-text-color,#d7d7d7);font-size:13px;line-height:1.4}
      #${ROOT_ID} .ai-current-lorebook[data-empty='true'] strong{font-weight:500;opacity:.75}
      #${ROOT_ID} .ai-debug-grid{display:grid;gap:10px}
      #${ROOT_ID} .ai-debug-block{border:1px solid var(--panel-border-color,#444);border-radius:6px;background:var(--panel-entry-bg-color,#242424);overflow:hidden}
      #${ROOT_ID} .ai-debug-block summary{cursor:pointer;padding:10px 12px;font-size:13px;font-weight:600;color:var(--panel-text-color,#ddd);background:rgba(255,255,255,.03)}
      #${ROOT_ID} .ai-debug-block textarea{border:0;border-top:1px solid var(--panel-border-color,#444);border-radius:0;min-height:180px;background:transparent;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} .ai-coming-soon{font-size:28px;font-weight:700;letter-spacing:.08em}
      @media (max-width:900px){
        #${ROOT_ID}.ai-desktop-root{position:relative;grid-template-columns:1fr;grid-template-rows:minmax(0,1fr);gap:0;min-width:0;overflow-y:auto}
        #${ROOT_ID} .ai-desktop-nav{position:absolute;top:8px;right:8px;z-index:6;width:0;height:0;min-height:0;border:0;border-radius:0;background:transparent;padding:0;gap:0;overflow:visible}
        #${ROOT_ID} .ai-mobile-nav-bar{position:absolute;top:0;right:0;display:block;min-width:0}
        #${ROOT_ID} .ai-mobile-nav-toggle{width:26px;height:26px;border-radius:999px;font-size:14px}
        #${ROOT_ID} .ai-mobile-nav-toggle:active,#${ROOT_ID} .ai-mobile-nav-toggle:focus-visible{background:rgba(255,255,255,.1);outline:0}
        #${ROOT_ID} .ai-nav-title{display:none}
        #${ROOT_ID} .ai-nav-list{position:absolute;top:32px;right:0;left:auto;width:min(260px,calc(100vw - 32px));display:none;flex-direction:column;gap:6px;overflow:visible;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:${AI_WORKSPACE_SURFACE};padding:8px;box-shadow:0 10px 24px rgba(0,0,0,.42);z-index:8}
        #${ROOT_ID} .ai-nav-list.is-open{display:flex}
        #${ROOT_ID} .ai-mobile-nav-menu-header{display:flex;flex-direction:column;gap:3px;padding:4px 4px 8px 4px;border-bottom:1px solid rgba(255,255,255,.12);color:var(--panel-text-color,#eee)}
        #${ROOT_ID} .ai-mobile-nav-menu-header span{font-size:12px;opacity:.72}
        #${ROOT_ID} .ai-mobile-nav-current{font-size:13px;text-align:left}
        #${ROOT_ID} .ai-mode-nav-button{width:100%;min-width:0;padding:10px 12px;border-radius:6px}
        #${ROOT_ID} .ai-desktop-main{min-height:0;padding:8px;overflow:visible}
        #${ROOT_ID} #ai-workspace-desktop-panel{height:auto;overflow:visible;padding-right:0}
        #${ROOT_ID} .ai-workflow-progress{top:0;z-index:4;padding:10px;gap:8px}
        #${ROOT_ID} .ai-stepper{gap:6px;width:100%;min-width:0}
        #${ROOT_ID} .ai-step-button{flex:0 0 28px;gap:6px}
        #${ROOT_ID} .ai-step-button.is-active{flex:1 1 auto;min-width:0}
        #${ROOT_ID} .ai-step-button:not(.is-active) .ai-step-label{display:none}
        #${ROOT_ID} .ai-step-label{min-width:0;font-size:12px}
        #${ROOT_ID} .ai-step-connector{min-width:8px;flex:1 1 8px}
        #${ROOT_ID} .ai-step-description{font-size:12px}
        #${ROOT_ID} .ai-row{flex-direction:column;align-items:stretch}
        #${ROOT_ID} .ai-field,#${ROOT_ID} .ai-btn-field{min-width:0;width:100%}
        #${ROOT_ID} .ai-entry-item{flex-direction:column}
        #${ROOT_ID} .ai-entry-mode{width:100%;flex:0 0 auto}
        #${ROOT_ID} .ai-result-grid{grid-template-columns:1fr}
        #${ROOT_ID} .ai-preview-detail-header{flex-direction:column}
        #${ROOT_ID} .ai-preview-detail-actions{width:100%;justify-content:flex-start}
        #${ROOT_ID} .ai-reference-compact{align-items:stretch;flex-direction:column}
        #${ROOT_ID} .ai-phone-inline-button{justify-content:center;width:100%}
        #${ROOT_ID} .ai-assistant-modal{padding:0;align-items:stretch;justify-content:stretch}
        #${ROOT_ID} .ai-assistant-phone{width:100vw;height:100dvh;max-width:none;min-height:0;border-radius:0;border:0}
        #${ROOT_ID} .ai-assistant-phone-header{padding-top:max(12px,env(safe-area-inset-top))}
        #${ROOT_ID} .ai-assistant-footer{padding-bottom:max(8px,env(safe-area-inset-bottom))}
        #${ROOT_ID} .ai-assistant-message{max-width:90%}
        #${ROOT_ID} .ai-reference-editor-field .ai-reference-material{min-height:260px}
      }
    </style>
  `);

  // 现代化样式（modern-* 前缀，与原有样式共存，不破坏现有选择器）
  if ($('#lorebook-ai-workspace-desktop-modern-styles', parentDoc()).length) {
    return;
  }

  $('head', parentDoc()).append(`
    <style id="lorebook-ai-workspace-desktop-modern-styles">
      /* ===== 侧边栏现代化 ===== */
      #${ROOT_ID} .modern-sidebar{
        border:1px solid var(--panel-border-color,rgba(255,255,255,.12));
        border-radius:10px;
        background:var(--ai-surface-color,rgba(255,255,255,.03));
        box-shadow:0 2px 8px var(--ai-shadow-color,rgba(0,0,0,.08));
        padding:14px;
        display:flex;flex-direction:column;gap:10px;
      }
      #${ROOT_ID} .modern-sidebar-header{
        display:flex;align-items:center;gap:8px;
        font-size:15px;font-weight:700;
        color:var(--panel-text-color,#eee);
        padding-bottom:10px;
        border-bottom:1px solid var(--panel-border-color,rgba(255,255,255,.08));
      }
      #${ROOT_ID} .modern-sidebar-header i{
        color:var(--panel-accent-color,#9a7ace);
        font-size:16px;
      }
      #${ROOT_ID} .modern-sidebar-nav-list{
        flex:1 1 auto;overflow-y:auto;
        display:flex;flex-direction:column;gap:6px;
      }
      #${ROOT_ID} .modern-sidebar-footer{
        padding-top:10px;
        border-top:1px solid var(--panel-border-color,rgba(255,255,255,.08));
        display:flex;justify-content:center;
      }
      #${ROOT_ID} .modern-sidebar-assistant-btn{
        width:100%;justify-content:center;gap:8px;
        border-radius:8px;padding:9px 12px;
        background:var(--panel-accent-color,#4a6a8a);
        color:var(--panel-accent-text-color,#fff);
        border:1px solid rgba(255,255,255,.16);
        font-size:13px;font-weight:600;
        cursor:pointer;
        display:inline-flex;align-items:center;
      }
      #${ROOT_ID} .modern-sidebar-assistant-btn:hover{
        opacity:.88;
      }

      /* ===== 导航按钮现代化 ===== */
      #${ROOT_ID} .ai-mode-nav-button{
        flex-direction:row!important;align-items:center!important;gap:10px!important;
        border-radius:8px;padding:10px 12px;
        transition:background .15s ease,border-color .15s ease;
      }
      #${ROOT_ID} .ai-mode-nav-button i{
        font-size:14px;width:18px;text-align:center;flex:0 0 18px;
        color:var(--ai-text-color-secondary,var(--panel-text-color,#cfd8dc));
      }
      #${ROOT_ID} .ai-mode-nav-button span{
        font-size:13px;font-weight:600;
      }
      #${ROOT_ID} .ai-mode-nav-button.is-active i{
        color:var(--panel-accent-color,#9a7ace);
      }
      #${ROOT_ID} .ai-mode-nav-button:hover{
        background:rgba(255,255,255,.06);
      }

      /* ===== 主内容区现代化 ===== */
      #${ROOT_ID} .modern-main-content{
        display:flex;flex-direction:column;
        min-width:0;overflow:hidden;
        border:1px solid var(--panel-border-color,rgba(255,255,255,.12));
        border-radius:10px;
        background:var(--ai-surface-color,rgba(255,255,255,.02));
        box-shadow:0 2px 8px var(--ai-shadow-color,rgba(0,0,0,.08));
      }
      #${ROOT_ID} .modern-main-header{
        flex:0 0 auto;
        padding:14px 16px;
        border-bottom:1px solid var(--panel-border-color,rgba(255,255,255,.08));
        background:rgba(255,255,255,.02);
      }
      #${ROOT_ID} .modern-main-header h1{
        margin:0 0 4px 0;font-size:18px;font-weight:700;
        color:var(--panel-text-color,#eee);
      }
      #${ROOT_ID} .modern-main-header p{
        margin:0;font-size:13px;line-height:1.5;
        color:var(--ai-text-color-secondary,var(--panel-text-color,#cfd8dc));
      }
      #${ROOT_ID} #ai-workspace-desktop-panel{
        flex:1 1 auto;min-height:0;
      }

      /* ===== 卡片现代化 ===== */
      #${ROOT_ID} .modern-card{
        border-radius:10px;
        box-shadow:0 1px 4px var(--ai-shadow-color,rgba(0,0,0,.08));
      }
      #${ROOT_ID} .modern-page{
        gap:12px;
      }

      /* ===== 预览布局：窄屏单列 ===== */
      #${ROOT_ID} .ai-preview-layout{
        display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,1.2fr);gap:12px;
      }
      @media (max-width:900px){
        #${ROOT_ID} .ai-preview-layout{
          grid-template-columns:1fr;
        }
      }

      /* ===== 条目列表：使用非 vh 的 max-height ===== */
      #${ROOT_ID} .ai-entry-list{
        max-height:480px;
      }
      #${ROOT_ID} .ai-preview-list{
        max-height:440px;
      }

      /* ===== 窄屏侧边栏适配 ===== */
      @media (max-width:900px){
        #${ROOT_ID} .modern-sidebar{
          border:0;border-radius:0;background:transparent;box-shadow:none;padding:0;gap:0;
        }
        #${ROOT_ID} .modern-sidebar-header{display:none}
        #${ROOT_ID} .modern-sidebar-footer{display:none}
        #${ROOT_ID} .modern-main-content{
          border:0;border-radius:0;background:transparent;box-shadow:none;
        }
        #${ROOT_ID} .modern-main-header{display:none}
      }
    </style>
  `);
}

function ensureUnifiedStyles() {
  if ($('#lorebook-ai-workspace-unified-styles', parentDoc()).length) {
    return;
  }
  $('head', parentDoc()).append(`
    <style id="lorebook-ai-workspace-unified-styles">
      #${AI_CONTENT_ID}{overflow:hidden!important;padding:0!important}
      #${AI_CONTENT_ID} .ai-workspace-list-container{height:100%;min-height:0;overflow:hidden;container-type:inline-size;container-name:ai-workspace}
      #${ROOT_ID}.ai-workbench-root{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;color:var(--panel-text-color,#eee);background:var(--ai-surface-muted-color,rgba(0,0,0,.18));font-family:inherit}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} button,#${ROOT_ID} input,#${ROOT_ID} select,#${ROOT_ID} textarea{font:inherit}
      #${ROOT_ID} button{min-height:36px}
      #${ROOT_ID} button:focus-visible,#${ROOT_ID} input:focus-visible,#${ROOT_ID} select:focus-visible,#${ROOT_ID} textarea:focus-visible,#${ROOT_ID} summary:focus-visible{outline:var(--ai-focus-ring,2px solid var(--ai-focus-ring-color,#9fc8e4));outline-offset:2px}
      #${ROOT_ID} .ai-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      #${ROOT_ID} .ai-workbench-header{flex:0 0 auto;display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid var(--ai-border-color,var(--panel-border-color,#555));background:var(--ai-surface-raised-color,var(--panel-bg-color,#242424));box-shadow:0 6px 20px var(--ai-shadow-color,rgba(0,0,0,.18));z-index:12}
      #${ROOT_ID} .ai-workbench-brand{display:flex;align-items:center;gap:10px;min-width:max-content}
      #${ROOT_ID} .ai-brand-mark{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:var(--panel-accent-text-color,#111);background:var(--panel-accent-color,#9fc8e4);box-shadow:0 6px 18px color-mix(in srgb,var(--panel-accent-color,#9fc8e4) 28%,transparent)}
      #${ROOT_ID} .ai-workbench-brand h1{margin:0;font-family:Georgia,'Noto Serif SC',serif;font-size:18px;line-height:1.1;letter-spacing:.02em;color:var(--panel-text-color,#fff)}
      #${ROOT_ID} .ai-workbench-brand p{margin:3px 0 0;color:var(--ai-text-color-secondary,#aaa);font-size:11px}
      #${ROOT_ID} .ai-strategy-switch{display:flex;padding:3px;border:1px solid var(--ai-border-color,#555);border-radius:10px;background:var(--ai-surface-muted-color,rgba(0,0,0,.2))}
      #${ROOT_ID} .ai-strategy-button{display:flex;align-items:center;gap:7px;min-height:32px;padding:5px 10px;border:0;border-radius:7px;background:transparent;color:var(--ai-text-color-secondary,#bbb);cursor:pointer}
      #${ROOT_ID} .ai-strategy-button.is-active{background:var(--ai-surface-raised-color,#333);color:var(--panel-text-color,#fff);box-shadow:0 2px 10px var(--ai-shadow-color,rgba(0,0,0,.2))}
      #${ROOT_ID} .ai-context-chips{display:flex;align-items:center;justify-content:flex-end;gap:7px;min-width:0}
      #${ROOT_ID} .ai-context-chip,#${ROOT_ID} .ai-icon-button,#${ROOT_ID} .ai-icon-text-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--ai-border-color,#555);border-radius:9px;background:var(--ai-surface-color,#2b2b2b);color:var(--panel-text-color,#eee);cursor:pointer}
      #${ROOT_ID} .ai-context-chip{min-width:0;max-width:190px;padding:6px 9px}
      #${ROOT_ID} .ai-context-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
      #${ROOT_ID} .ai-icon-button{width:36px;padding:0;flex:0 0 36px}
      #${ROOT_ID} .ai-icon-text-button{padding:6px 10px}
      #${ROOT_ID} .ai-workbench-main{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-gutter:stable}
      #${ROOT_ID} #ai-workspace-desktop-panel{min-height:100%}
      #${ROOT_ID} .ai-workflow-page{min-height:100%;display:flex;flex-direction:column;gap:12px;padding:12px 12px 0}
      #${ROOT_ID} .ai-workflow-progress{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:9px 12px;border:1px solid var(--ai-border-color,#555);border-radius:11px;background:color-mix(in srgb,var(--ai-surface-raised-color,#282828) 94%,transparent);backdrop-filter:blur(12px);box-shadow:0 6px 18px var(--ai-shadow-color,rgba(0,0,0,.16))}
      #${ROOT_ID} .ai-stepper{display:flex;align-items:center;min-width:0}
      #${ROOT_ID} .ai-step-button{display:flex;align-items:center;gap:7px;padding:0;border:0;background:transparent;color:var(--ai-text-color-secondary,#aaa);cursor:pointer}
      #${ROOT_ID} .ai-step-button:disabled{cursor:default;opacity:.55}
      #${ROOT_ID} .ai-step-index{width:24px;height:24px;display:grid;place-items:center;border:1px solid var(--ai-border-color,#555);border-radius:50%;font-size:11px;background:var(--ai-surface-color,#222)}
      #${ROOT_ID} .ai-step-button.is-active{color:var(--panel-text-color,#fff)}
      #${ROOT_ID} .ai-step-button.is-active .ai-step-index{color:var(--panel-accent-text-color,#111);border-color:var(--panel-accent-color,#9fc8e4);background:var(--panel-accent-color,#9fc8e4)}
      #${ROOT_ID} .ai-step-button.is-complete .ai-step-index{border-color:var(--ai-success-color,#72d3a5);color:var(--ai-success-color,#72d3a5);background:var(--ai-success-bg-color,rgba(78,180,126,.14))}
      #${ROOT_ID} .ai-step-label{font-size:12px;font-weight:650;white-space:nowrap}
      #${ROOT_ID} .ai-step-connector{height:1px;min-width:22px;flex:1 1 44px;margin:0 8px;background:var(--ai-border-color,#555)}
      #${ROOT_ID} .ai-step-connector.is-complete{background:var(--ai-success-color,#72d3a5)}
      #${ROOT_ID} .ai-step-description{max-width:430px;color:var(--ai-text-color-secondary,#aaa);font-size:11px;line-height:1.35;text-align:right}
      #${ROOT_ID} .ai-prepare-grid{display:grid;grid-template-columns:minmax(360px,42%) minmax(420px,1fr);gap:12px;align-items:start;min-height:0}
      #${ROOT_ID} .ai-workbench-panel{min-width:0;border:1px solid var(--ai-border-color,#555);border-radius:12px;background:var(--ai-surface-color,var(--panel-bg-color,#242424));padding:14px;box-shadow:0 8px 26px var(--ai-shadow-color,rgba(0,0,0,.14))}
      #${ROOT_ID} .ai-section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      #${ROOT_ID} .ai-section-heading h2,#${ROOT_ID} .ai-tool-drawer h2{margin:2px 0 0;font-size:16px;line-height:1.25;color:var(--panel-text-color,#fff)}
      #${ROOT_ID} .ai-section-kicker{display:block;color:var(--panel-accent-color,#9fc8e4);font-size:10px;font-weight:750;letter-spacing:.13em;text-transform:uppercase}
      #${ROOT_ID} .ai-field{display:flex;flex-direction:column;gap:6px;min-width:0}
      #${ROOT_ID} .ai-field>label{font-size:11px;font-weight:650;color:var(--ai-text-color-secondary,#bbb)}
      #${ROOT_ID} .ai-field small{font-weight:400;opacity:.72}
      #${ROOT_ID} input,#${ROOT_ID} select,#${ROOT_ID} textarea{width:100%;border:1px solid var(--ai-border-color,var(--panel-border-color,#555));border-radius:8px;background:var(--panel-input-bg-color,#181818);color:var(--panel-text-color,#eee);padding:9px 10px}
      #${ROOT_ID} textarea{resize:vertical;line-height:1.5}
      #${ROOT_ID} .ai-instruction-field textarea{min-height:150px}
      #${ROOT_ID} .ai-current-lorebook{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;padding:7px 9px;border-radius:8px;background:var(--ai-surface-muted-color,rgba(0,0,0,.18));font-size:11px;color:var(--ai-text-color-secondary,#aaa)}
      #${ROOT_ID} .ai-current-lorebook strong{color:var(--panel-text-color,#fff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ROOT_ID} .ai-scope-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:10px;margin-top:12px}
      #${ROOT_ID} .ai-selection-counts{padding-bottom:8px;color:var(--ai-text-color-secondary,#aaa);font-size:11px;white-space:nowrap}
      #${ROOT_ID} .ai-bulk-toolbar{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:10px 0 8px;padding:6px 7px;border-radius:8px;background:var(--ai-surface-muted-color,rgba(0,0,0,.18));font-size:11px;color:var(--ai-text-color-secondary,#aaa)}
      #${ROOT_ID} .ai-bulk-toolbar button{min-height:28px;padding:3px 8px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--panel-text-color,#eee);cursor:pointer}
      #${ROOT_ID} .ai-bulk-toolbar button:hover{border-color:var(--ai-border-color,#555);background:var(--ai-surface-raised-color,#333)}
      #${ROOT_ID} .ai-entry-list{height:390px;min-height:0;overflow:hidden;border:1px solid var(--ai-border-color,#555);border-radius:9px;background:var(--ai-surface-muted-color,rgba(0,0,0,.12))}
      #${ROOT_ID} .ai-entry-scroll{height:100%;overflow:auto}
      #${ROOT_ID} .ai-entry-item{min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 9px;border-bottom:1px solid color-mix(in srgb,var(--ai-border-color,#555) 70%,transparent);background:transparent}
      #${ROOT_ID} .ai-entry-item:hover{background:var(--panel-entry-hover-bg-color,rgba(255,255,255,.04))}
      #${ROOT_ID} .ai-entry-main{min-width:0;flex:1 1 auto}
      #${ROOT_ID} .ai-entry-item-title{font-size:12px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ROOT_ID} .ai-entry-item-meta{margin-top:3px;color:var(--ai-text-color-secondary,#999);font:10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace}
      #${ROOT_ID} .ai-entry-mode-group{display:flex;flex:0 0 auto;padding:2px;border:1px solid var(--ai-border-color,#555);border-radius:8px;background:var(--ai-surface-color,#222)}
      #${ROOT_ID} .ai-entry-mode-button{min-height:28px!important;padding:3px 7px;border:0;border-radius:6px;background:transparent;color:var(--ai-text-color-secondary,#aaa);font-size:10px;cursor:pointer}
      #${ROOT_ID} .ai-entry-mode-button.is-editable{color:var(--ai-success-color,#72d3a5);background:var(--ai-success-bg-color,rgba(78,180,126,.14))}
      #${ROOT_ID} .ai-entry-mode-button.is-readonly{color:var(--ai-warning-color,#f1c26d);background:var(--ai-warning-bg-color,rgba(210,151,51,.14))}
      #${ROOT_ID} .ai-entry-mode-button.is-none{color:var(--ai-text-color-secondary,#aaa);background:var(--ai-surface-muted-color,rgba(0,0,0,.2))}
      #${ROOT_ID} .ai-inline-note{display:flex;gap:8px;align-items:flex-start;margin-top:9px;padding:9px;border-radius:8px;color:var(--ai-text-color-secondary,#aaa);background:var(--ai-success-bg-color,rgba(78,180,126,.1));font-size:11px;line-height:1.45}
      #${ROOT_ID} .ai-inline-note.is-plan{background:var(--ai-warning-bg-color,rgba(210,151,51,.1))}
      #${ROOT_ID} .ai-field-toggles{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
      #${ROOT_ID} .ai-field-toggles label{cursor:pointer}
      #${ROOT_ID} .ai-field-toggles input{position:absolute;opacity:0;pointer-events:none}
      #${ROOT_ID} .ai-field-toggles span{display:block;padding:5px 8px;border:1px solid var(--ai-border-color,#555);border-radius:999px;color:var(--ai-text-color-secondary,#aaa);font-size:10px}
      #${ROOT_ID} .ai-field-toggles input:checked+span{border-color:var(--panel-accent-color,#9fc8e4);color:var(--panel-text-color,#fff);background:color-mix(in srgb,var(--panel-accent-color,#9fc8e4) 17%,transparent)}
      #${ROOT_ID} .ai-info-panel{display:grid;gap:9px;margin-top:12px}
      #${ROOT_ID} .ai-prompt-settings{border:1px solid var(--ai-border-color,#555);border-radius:9px;background:var(--ai-surface-muted-color,rgba(0,0,0,.14));overflow:hidden}
      #${ROOT_ID} .ai-prompt-settings>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;cursor:pointer;font-size:11px;font-weight:650}
      #${ROOT_ID} .ai-prompt-settings>summary small{color:var(--ai-text-color-secondary,#aaa);font-weight:400}
      #${ROOT_ID} .ai-prompt-settings-body{display:grid;gap:10px;padding:0 11px 11px}
      #${ROOT_ID} .ai-chat-context-textarea{min-height:120px}
      #${ROOT_ID} .ai-reference-compact{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border:1px solid var(--ai-border-color,#555);border-radius:9px;background:var(--ai-surface-muted-color,rgba(0,0,0,.14))}
      #${ROOT_ID} .ai-reference-title{font-size:11px;font-weight:700}
      #${ROOT_ID} .ai-command-bar{position:sticky;bottom:0;z-index:9;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 -12px;padding:10px 14px;border-top:1px solid var(--ai-border-color,#555);background:color-mix(in srgb,var(--ai-surface-raised-color,#242424) 96%,transparent);backdrop-filter:blur(14px);box-shadow:0 -8px 26px var(--ai-shadow-color,rgba(0,0,0,.16))}
      #${ROOT_ID} .ai-command-status{display:flex;align-items:center;gap:8px;min-width:0;color:var(--ai-text-color-secondary,#aaa);font-size:11px}
      #${ROOT_ID} .ai-command-status span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ROOT_ID} .ai-status-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:var(--ai-success-color,#72d3a5);box-shadow:0 0 0 4px var(--ai-success-bg-color,rgba(78,180,126,.12))}
      #${ROOT_ID}[data-run-state="running"] .ai-status-dot{background:var(--ai-warning-color,#f1c26d);animation:ai-workspace-pulse 1.3s ease-in-out infinite}
      #${ROOT_ID} .ai-command-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
      #${ROOT_ID} .ai-button-primary,#${ROOT_ID} .ai-button-secondary,#${ROOT_ID} .ai-button-danger{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:7px 12px;border-radius:8px;cursor:pointer}
      #${ROOT_ID} .ai-button-primary{border:1px solid var(--panel-accent-color,#9fc8e4);background:var(--panel-accent-color,#9fc8e4);color:var(--panel-accent-text-color,#111);font-weight:700}
      #${ROOT_ID} .ai-button-secondary{border:1px solid var(--ai-border-color,#555);background:var(--ai-surface-color,#2a2a2a);color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-button-danger{border:1px solid color-mix(in srgb,var(--ai-danger-color,#ef8e8e) 48%,transparent);background:var(--ai-danger-bg-color,rgba(200,70,70,.12));color:var(--ai-danger-color,#ef8e8e)}
      #${ROOT_ID} button:disabled{cursor:not-allowed;opacity:.45;filter:saturate(.5)}
      #${ROOT_ID} .ai-plan-review-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,34%);gap:12px;align-items:start}
      #${ROOT_ID} .ai-plan-summary{margin-bottom:12px;padding:10px;border-left:3px solid var(--panel-accent-color,#9fc8e4);border-radius:7px;background:var(--ai-surface-muted-color,rgba(0,0,0,.15));color:var(--ai-text-color-secondary,#bbb);font-size:11px;line-height:1.5}
      #${ROOT_ID} .ai-plan-fields-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px}
      #${ROOT_ID} .ai-plan-fields-grid textarea{min-height:150px}
      #${ROOT_ID} .ai-code-textarea{min-height:260px;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
      #${ROOT_ID} .ai-plan-scope-list{max-height:540px;overflow:auto;display:grid;gap:5px}
      #${ROOT_ID} .ai-plan-scope-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid var(--ai-border-color,#555);border-radius:8px;background:var(--ai-surface-muted-color,rgba(0,0,0,.12))}
      #${ROOT_ID} .ai-plan-scope-row>div:first-child{min-width:0}
      #${ROOT_ID} .ai-plan-scope-row strong{display:block;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ROOT_ID} .ai-plan-scope-row span{display:block;margin-top:2px;color:var(--ai-text-color-secondary,#999);font:9px ui-monospace,SFMono-Regular,Consolas,monospace}
      #${ROOT_ID} .ai-form-error{display:none;margin-top:9px;padding:9px;border-radius:8px;color:var(--ai-danger-color,#ef8e8e);background:var(--ai-danger-bg-color,rgba(200,70,70,.12));font-size:11px}
      #${ROOT_ID} .ai-form-error.is-visible{display:block}
      #${ROOT_ID} .ai-review-layout{display:grid;grid-template-columns:minmax(280px,32%) minmax(0,1fr);gap:12px;min-height:520px}
      #${ROOT_ID} .ai-review-list-panel,#${ROOT_ID} .ai-review-detail-panel{min-height:0}
      #${ROOT_ID} .ai-preview-summary{padding:9px;border-radius:8px;background:var(--ai-surface-muted-color,rgba(0,0,0,.15));color:var(--ai-text-color-secondary,#aaa);font-size:11px;line-height:1.45}
      #${ROOT_ID} .ai-preview-list{max-height:560px;overflow:auto;margin-top:8px;border:1px solid var(--ai-border-color,#555);border-radius:9px}
      #${ROOT_ID} .ai-preview-item{padding:10px;border-bottom:1px solid var(--ai-border-color,#555);cursor:pointer}
      #${ROOT_ID} .ai-preview-item.is-active{background:color-mix(in srgb,var(--panel-accent-color,#9fc8e4) 12%,transparent)}
      #${ROOT_ID} .ai-preview-detail{min-height:100%;padding:0;border:0;background:transparent;overflow:visible}
      #${ROOT_ID} .ai-preview-modal-section{border:1px solid var(--ai-border-color,#555);border-radius:9px;overflow:hidden}
      #${ROOT_ID} .ai-preview-modal-section-title{padding:8px 10px;background:var(--ai-surface-muted-color,rgba(0,0,0,.15));font-size:11px;font-weight:700}
      #${ROOT_ID} .ai-preview-modal-panel{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--ai-border-color,#555)}
      #${ROOT_ID} .ai-preview-modal-field{padding:9px;background:var(--ai-surface-color,#222)}
      #${ROOT_ID} .ai-preview-modal-field textarea{min-height:180px;border:0;border-radius:6px;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
      #${ROOT_ID} .ai-changed-badge{padding:2px 5px;border-radius:999px;color:var(--ai-success-color,#72d3a5);background:var(--ai-success-bg-color,rgba(78,180,126,.13));font-size:9px}
      #${ROOT_ID} .ai-diagnostics-drawer{margin-bottom:12px;border:1px solid var(--ai-border-color,#555);border-radius:9px;background:var(--ai-surface-color,#222)}
      #${ROOT_ID} .ai-diagnostics-drawer>summary{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;color:var(--ai-text-color-secondary,#aaa);font-size:11px}
      #${ROOT_ID} .ai-debug-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 10px 10px}
      #${ROOT_ID} .ai-debug-block textarea{min-height:220px;font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
      #${ROOT_ID} .ai-complete-panel{max-width:720px;margin:34px auto;padding:28px;border:1px solid var(--ai-border-color,#555);border-radius:16px;background:var(--ai-surface-color,#242424);text-align:center;box-shadow:0 16px 50px var(--ai-shadow-color,rgba(0,0,0,.2))}
      #${ROOT_ID} .ai-complete-mark{width:56px;height:56px;margin:0 auto 14px;display:grid;place-items:center;border-radius:50%;color:var(--ai-success-color,#72d3a5);background:var(--ai-success-bg-color,rgba(78,180,126,.14));font-size:22px}
      #${ROOT_ID} .ai-complete-panel h2{margin:5px 0 8px;font:700 25px/1.2 Georgia,'Noto Serif SC',serif}
      #${ROOT_ID} .ai-complete-panel p{color:var(--ai-text-color-secondary,#aaa);line-height:1.6}
      #${ROOT_ID} .ai-complete-actions,#${ROOT_ID} .ai-rollback-actions{display:flex;justify-content:center;gap:8px;margin-top:14px}
      #${ROOT_ID} .ai-rollback-card{margin-top:22px;padding:11px;border:1px solid var(--ai-border-color,#555);border-radius:9px;background:var(--ai-surface-muted-color,rgba(0,0,0,.14));font-size:11px;color:var(--ai-text-color-secondary,#aaa)}
      #${ROOT_ID} .ai-tool-backdrop,#${ROOT_ID} .ai-assistant-modal{position:fixed;inset:0;z-index:10007;display:none;align-items:stretch;justify-content:flex-end;padding:0;background:rgba(0,0,0,.52);backdrop-filter:blur(4px)}
      #${ROOT_ID} .ai-tool-drawer,#${ROOT_ID} .ai-assistant-phone{width:min(460px,100%);height:100%;max-width:100%;max-height:none;margin:0;border:0;border-left:1px solid var(--ai-border-color,#555);border-radius:0;background:var(--ai-surface-raised-color,var(--panel-bg-color,#242424));box-shadow:-18px 0 50px var(--ai-shadow-color,rgba(0,0,0,.28));display:flex;flex-direction:column}
      #${ROOT_ID} .ai-tool-drawer>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border-bottom:1px solid var(--ai-border-color,#555)}
      #${ROOT_ID} .ai-tool-drawer-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px}
      #${ROOT_ID} .ai-tool-drawer .ai-page{min-height:0}
      #${ROOT_ID} .ai-assistant-phone-header{border-radius:0}
      #${ROOT_ID} .ai-preview-modal{position:fixed;inset:0;width:auto;height:auto;overflow:auto}
      #${ROOT_ID} .ai-preview-modal-dialog{max-height:calc(100% - 48px);margin:24px auto}
      #${ROOT_ID} .ai-confirm-dialog{width:min(560px,calc(100% - 24px));padding:0;border:1px solid var(--ai-border-color,#555);border-radius:14px;background:var(--ai-surface-raised-color,#242424);color:var(--panel-text-color,#eee);box-shadow:0 24px 70px var(--ai-shadow-color,rgba(0,0,0,.35))}
      #${ROOT_ID} .ai-confirm-dialog::backdrop{background:rgba(0,0,0,.58);backdrop-filter:blur(4px)}
      #${ROOT_ID} .ai-confirm-dialog-body{padding:22px;text-align:center}
      #${ROOT_ID} .ai-confirm-icon{width:46px;height:46px;margin:0 auto 10px;display:grid;place-items:center;border-radius:50%;color:var(--ai-warning-color,#f1c26d);background:var(--ai-warning-bg-color,rgba(210,151,51,.13))}
      #${ROOT_ID} .ai-confirm-dialog h2{margin:6px 0;font-size:18px}
      #${ROOT_ID} .ai-confirm-dialog p{color:var(--ai-text-color-secondary,#aaa);font-size:12px;line-height:1.5}
      #${ROOT_ID} .ai-rollback-dialog-items{max-height:240px;overflow:auto;margin:12px 0;padding:8px;border:1px solid var(--ai-border-color,#555);border-radius:8px;text-align:left;font-size:11px;background:var(--ai-surface-muted-color,rgba(0,0,0,.14))}
      #${ROOT_ID} .ai-confirm-actions{display:flex;justify-content:center;gap:8px;margin-top:14px}
      @keyframes ai-workspace-pulse{50%{opacity:.35;transform:scale(.78)}}

      @container ai-workspace (max-width:959px){
        #${ROOT_ID} .ai-workbench-header{grid-template-columns:auto 1fr auto;gap:10px}
        #${ROOT_ID} .ai-workbench-brand p{display:none}
        #${ROOT_ID} .ai-context-chip span{display:none}
        #${ROOT_ID} .ai-context-chip{width:36px;padding:0}
        #${ROOT_ID} .ai-prepare-grid,#${ROOT_ID} .ai-plan-review-grid,#${ROOT_ID} .ai-review-layout{grid-template-columns:1fr}
        #${ROOT_ID} .ai-entry-list{height:330px}
        #${ROOT_ID} .ai-plan-fields-grid{grid-template-columns:1fr}
        #${ROOT_ID} .ai-review-layout{min-height:0}
        #${ROOT_ID} .ai-review-detail-panel{display:none}
        #${ROOT_ID} .ai-preview-list{max-height:none}
        #${ROOT_ID} .ai-preview-item{min-height:54px}
        #${ROOT_ID} .ai-preview-modal-panel{grid-template-columns:1fr}
        #${ROOT_ID} .ai-step-description{display:none}
      }
      @container ai-workspace (max-width:639px){
        #${ROOT_ID} .ai-workbench-header{grid-template-columns:1fr auto;padding:9px 10px}
        #${ROOT_ID} .ai-workbench-brand{display:none}
        #${ROOT_ID} .ai-strategy-switch{justify-self:start}
        #${ROOT_ID} .ai-strategy-button{min-height:38px;padding:6px 9px}
        #${ROOT_ID} .ai-context-chips .ai-context-chip:nth-child(2){display:none}
        #${ROOT_ID} .ai-workflow-page{padding:8px 8px 0;gap:8px}
        #${ROOT_ID} .ai-workflow-progress{grid-template-columns:1fr;padding:8px;top:0}
        #${ROOT_ID} .ai-step-label{display:none}
        #${ROOT_ID} .ai-step-button.is-active .ai-step-label{display:block}
        #${ROOT_ID} .ai-workbench-panel{padding:11px;border-radius:10px}
        #${ROOT_ID} .ai-section-heading{align-items:center}
        #${ROOT_ID} .ai-field-toggles{width:100%;justify-content:flex-start}
        #${ROOT_ID} .ai-scope-search-row{grid-template-columns:1fr}
        #${ROOT_ID} .ai-selection-counts{padding:0}
        #${ROOT_ID} .ai-entry-list{height:300px}
        #${ROOT_ID} .ai-entry-item{min-height:66px;align-items:flex-start;flex-direction:column;gap:6px}
        #${ROOT_ID} .ai-entry-mode-group{width:100%}
        #${ROOT_ID} .ai-entry-mode-button{flex:1 1 0;min-height:34px!important}
        #${ROOT_ID} .ai-command-bar{margin:0 -8px;padding:8px;align-items:stretch;flex-direction:column}
        #${ROOT_ID} .ai-command-status{min-height:20px}
        #${ROOT_ID} .ai-command-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
        #${ROOT_ID} .ai-command-actions .ai-button-primary{grid-column:1/-1;min-height:44px;order:-1}
        #${ROOT_ID} .ai-command-actions button{min-height:44px}
        #${ROOT_ID} .ai-tool-drawer,#${ROOT_ID} .ai-assistant-phone{width:100%;border-left:0}
        #${ROOT_ID} .ai-preview-modal-dialog{width:100%;min-height:100%;max-height:none;margin:0;border-radius:0}
        #${ROOT_ID} .ai-complete-panel{margin:12px auto;padding:20px 14px}
        #${ROOT_ID} .ai-debug-grid{grid-template-columns:1fr}
      }
    </style>
  `);
}

function syncSource(source) {
  $('#ai-workspace-source-select', parentDoc()).val(isKnownSource(source) ? source : 'custom');
}

function toggleCustomApi() {
  const apiMode = getApiMode();
  const source = (
    $('#ai-workspace-source-select', parentDoc()).val() ||
    settings().customApi?.source ||
    'openai'
  ).trim();
  const isCustomMode = apiMode === 'custom';
  const showApiUrl = isCustomMode && isCustomSource(source);

  $('#ai-workspace-custom-api', parentDoc()).show();
  $('#ai-workspace-custom-api-fields', parentDoc()).toggle(isCustomMode);
  $('#ai-workspace-apiurl-field', parentDoc()).toggle(showApiUrl);

  const hint = !isCustomMode
    ? '完全沿用酒馆当前预设，不覆盖 URL、Key、Model。'
    : showApiUrl
      ? 'OpenAI兼容渠道需要填写 URL、Key 和 Model。'
      : '官方渠道只需要填写 Key 和 Model，不强制填写 URL。';
  $('#ai-workspace-api-hint', parentDoc()).text(hint);
}

function renderModelOptions() {
  const $datalist = $(`#${MODEL_LIST_ID}`, parentDoc());
  if (!$datalist.length) {
    return;
  }
  $datalist.empty();
  state.modelOptions.forEach(model => $datalist.append(`<option value="${_.escape(model)}"></option>`));
}

function syncApiForm() {
  const saved = settings();
  $(`input[name="ai-workspace-api-mode"][value="${saved.apiMode || 'preset'}"]`, parentDoc()).prop('checked', true);
  $('#ai-workspace-apiurl', parentDoc()).val(saved.customApi?.apiurl || '');
  $('#ai-workspace-apikey', parentDoc()).val(saved.customApi?.key || '');
  $('#ai-workspace-model', parentDoc()).val(saved.customApi?.model || '');
  $('#ai-workspace-stream', parentDoc()).prop('checked', saved.stream === true);
  $('#ai-workspace-budget-enabled', parentDoc()).prop('checked', saved.contextBudget?.enabled !== false);
  $('#ai-workspace-budget-max-input', parentDoc()).val(saved.contextBudget?.maxInputTokens || 12000);
  $('#ai-workspace-budget-reserve-output', parentDoc()).val(saved.contextBudget?.reserveOutputTokens || 4096);
  syncSource(saved.customApi?.source || 'openai');
  toggleCustomApi();
  renderModelOptions();
  setModelStatus(state.modelStatusText);
  setSharedStatus(state.sharedStatusText);
}

function syncCurrentLorebookDisplay(modeKey) {
  const mode = state.modes[modeKey];
  $('#ai-workspace-lorebook', parentDoc()).val(mode.lorebookName || '');
  $('#ai-workspace-current-lorebook', parentDoc()).attr('data-empty', mode.lorebookName ? 'false' : 'true');
  $('#ai-workspace-current-lorebook-name', parentDoc()).text(mode.lorebookName || '未选择');
}

function syncModeForm(modeKey) {
  const mode = state.modes[modeKey];
  syncCurrentLorebookDisplay(modeKey);
  $('#ai-workspace-search', parentDoc()).val(mode.searchText || '');
  $('#ai-workspace-field-title', parentDoc()).prop('checked', mode.editableFields.title !== false);
  $('#ai-workspace-field-content', parentDoc()).prop('checked', mode.editableFields.content !== false);
  $('#ai-workspace-field-prompt', parentDoc()).prop('checked', mode.editableFields.prompt !== false);
  $('#ai-workspace-instruction', parentDoc()).val(mode.instruction || '');
  $('#ai-workspace-jailbreak-prompt-template', parentDoc()).val(mode.promptSettings.jailbreakPromptTemplate || '');
  $('#ai-workspace-builtin-prompt-template', parentDoc()).val(mode.promptSettings.builtinPromptTemplate || '');
  $('#ai-workspace-planning-prompt-template', parentDoc()).val(mode.promptSettings.planningPromptTemplate || '');
  renderChatContextPreview();
  renderReferenceMaterial();
  renderAssistantHistory();
  setAssistantStatus('');
  setAssistantGeneratingState(false);
}

function updateWorkbenchHeader() {
  const saved = settings();
  const modelLabel = saved.apiMode === 'custom' ? saved.customApi?.model || '模型待配置' : '当前酒馆预设';
  const referenceLength = (state.referenceMaterial || '').trim().length;
  const contextLabel = state.chatContext.enabled
    ? state.chatContextManual
      ? '手工上下文'
      : `${state.chatMessages.length} 条上下文`
    : '上下文关闭';
  $('[data-ai-open-settings] span', parentDoc()).text(modelLabel);
  $('[data-ai-focus-context] span', parentDoc()).text(contextLabel);
  $('[data-ai-open-assistant-tab="reference"] span', parentDoc()).text(referenceLength ? `${referenceLength} 字资料` : '添加资料');
  syncNavigationState();
}

function syncWorkflowCapabilities(modeKey = currentModeKey()) {
  const capabilities = deriveAiWorkflowCapabilities(workflowSnapshot(modeKey));
  $('#ai-workspace-plan', parentDoc()).prop('disabled', !capabilities.canStartPlanning);
  const canPreview = state.modes[modeKey].currentStep === 'review'
    ? capabilities.canRegenerate
    : capabilities.canGeneratePreview;
  $('#ai-workspace-preview', parentDoc()).prop('disabled', !canPreview);
  $('#ai-workspace-apply', parentDoc()).prop('disabled', !capabilities.canApply);
  $('#ai-workspace-stop', parentDoc()).prop('disabled', !capabilities.canStop);
  $('.ai-strategy-button', parentDoc()).prop('disabled', !capabilities.canSwitchStrategy);
}

function renderCurrentPanel() {
  const $panel = $('#ai-workspace-desktop-panel', parentDoc());
  if (!$panel.length) {
    return;
  }

  const modeKey = currentModeKey();
  const mode = state.modes[modeKey];
  $panel.html(buildModeWorkspace(modeKey));
  updateWorkbenchHeader();
  syncApiForm();
  syncModeForm(modeKey);

  if (mode.currentStep === 'prepare') {
    renderEntryList(modeKey);
    renderSelectionSummary(modeKey);
  } else if (mode.currentStep === 'planReview') {
    renderPlanningResult(modeKey, mode.planningResult);
  } else if (mode.currentStep === 'review') {
    if (mode.previewResult) {
      renderPreview(modeKey, mode.previewResult);
    } else {
      clearPreview(modeKey);
      renderDebugInfo(modeKey, mode.debugInfo || {});
    }
  } else if (mode.currentStep === 'complete') {
    void refreshRollbackPanel(modeKey);
  }
  renderAssistantHistory();
  renderReferenceMaterial();
  setModeStatus(modeKey, mode.statusText);
  setGeneratingState(state.isGenerating);
  syncWorkflowCapabilities(modeKey);
}

function hideLorebookSearchResults() {
  $('#ai-workspace-lorebook-search-results', parentDoc()).empty().hide();
  $('#ai-workspace-lorebook-search', parentDoc()).attr('aria-expanded', 'false');
}

function filteredLorebookNames(searchText = '') {
  const normalizedSearch = (searchText || '').trim().toLowerCase();
  return normalizedSearch
    ? state.worldbookNames.filter(name => name.toLowerCase().includes(normalizedSearch))
    : [...state.worldbookNames];
}

function renderLorebookSearchResults(searchText = '') {
  const $results = $('#ai-workspace-lorebook-search-results', parentDoc());
  if (!$results.length) {
    return;
  }

  const names = filteredLorebookNames(searchText);
  const activeLorebook = currentModeState().lorebookName;
  if (!state.worldbookNames.length) {
    $results.html('<div class="add-worldbook-no-results">没有可用世界书</div>').show();
    return;
  }
  if (!names.length) {
    $results.html('<div class="add-worldbook-no-results">没有找到匹配的世界书</div>').show();
    return;
  }

  $results
    .html(
      names
        .map(
          name => `
      <div class="add-worldbook-result-item${name === activeLorebook ? ' is-active' : ''}" data-lorebook-name="${_.escape(name)}" role="option" tabindex="0" aria-selected="${name === activeLorebook}">
        ${_.escape(name)}
      </div>
    `,
        )
        .join(''),
    )
    .show();
  $('#ai-workspace-lorebook-search', parentDoc()).attr('aria-expanded', 'true');
}

async function populateLorebooks() {
  state.worldbookNames = await getWorldbookNamesSafe();
}

function ensureModeLorebook(modeKey) {
  const mode = state.modes[modeKey];
  if (state.worldbookNames.includes(mode.lorebookName)) {
    return;
  }
  mode.lorebookName = state.worldbookNames[0] || '';
}

async function loadEntriesForMode(
  modeKey,
  { force = false, resetSelection = false, clearOutputs = false, invalidateOutputsOnChange = false } = {},
) {
  const mode = state.modes[modeKey];

  if (!mode.lorebookName) {
    mode.entries = [];
    mode.loadedLorebookName = '';
    if (resetSelection) {
      mode.selectedEntryUids.clear();
      mode.readonlyEntryUids.clear();
    }
    if (clearOutputs) {
      invalidateModeOutputs(modeKey);
    }
    if (state.currentNav === modeKey) {
      renderEntryList(modeKey);
      renderSelectionSummary(modeKey);
    }
    return;
  }

  if (!force && mode.entries.length && mode.loadedLorebookName === mode.lorebookName) {
    return;
  }

  if (resetSelection) {
    mode.selectedEntryUids.clear();
    mode.readonlyEntryUids.clear();
  }
  if (clearOutputs) {
    invalidateModeOutputs(modeKey);
  }

  const previousEntries = Array.isArray(mode.entries) ? mode.entries : [];
  const hadOutputs = Boolean(mode.previewResult || mode.planningResult);
  setModeStatus(modeKey, `正在加载世界书“${mode.lorebookName}”的条目...`);
  const entries = await collectAiTargetEntries(mode.lorebookName, []);
  const nextEntries = entries.map(entry => mapWorkspaceEntry(entry));
  const entriesChanged = !areWorkspaceEntriesEqual(previousEntries, nextEntries);
  mode.entries = nextEntries;
  mode.loadedLorebookName = mode.lorebookName;

  let outputsInvalidated = false;
  if (invalidateOutputsOnChange && entriesChanged && hadOutputs) {
    invalidateModeOutputs(modeKey);
    outputsInvalidated = true;
    persistSettings({ mirrorModeKey: modeKey });
  }

  const validUidSet = new Set(mode.entries.map(entry => Number(entry.uid)));
  mode.selectedEntryUids = new Set(Array.from(mode.selectedEntryUids).filter(uid => validUidSet.has(Number(uid))));
  mode.readonlyEntryUids = new Set(Array.from(mode.readonlyEntryUids).filter(uid => validUidSet.has(Number(uid))));

  if (state.currentNav === modeKey) {
    renderEntryList(modeKey);
    renderSelectionSummary(modeKey);
  }
  setModeStatus(
    modeKey,
    outputsInvalidated
      ? `已加载 ${mode.entries.length} 条可处理条目。检测到世界书内容已变化，已自动清空旧的规划/预览结果。`
      : `已加载 ${mode.entries.length} 条可处理条目。`,
  );
}

function goToStep(modeKey, targetStep) {
  const mode = state.modes[modeKey];
  if (!MODE_STEPS[modeKey].includes(targetStep)) {
    return;
  }
  if (state.isGenerating) {
    setModeStatus(modeKey, '生成进行中，停止后才能切换阶段。');
    return;
  }
  const snapshot = workflowSnapshot(modeKey);
  if (!canEnterAiWorkflowPhase(snapshot, targetStep)) {
    setModeStatus(modeKey, '当前阶段尚未完成，不能直接跳到后续步骤。');
    return;
  }
  mode.currentStep = targetStep;
  renderCurrentPanel();
}

function hasEditableSelection(modeKey) {
  return state.modes[modeKey].selectedEntryUids.size > 0;
}
async function handlePlan() {
  const modeKey = 'plan';
  captureModeInputs(modeKey);
  persistSettings({ mirrorModeKey: modeKey });

  const mode = state.modes[modeKey];
  const saved = settings();
  const runId = ++state.previewRunId;
  if (!mode.lorebookName) return setModeStatus(modeKey, '请先选择目标世界书。');
  if (!mode.instruction.trim()) return setModeStatus(modeKey, '请输入 AI 指令。');
  if (saved.apiMode === 'custom') {
    const validationMessage = validateCustomApiConfig(saved.customApi, { requireModel: true });
    if (validationMessage) {
      return setModeStatus(modeKey, validationMessage);
    }
  }

  state.stopRequested = false;
  setGeneratingState(true);
  mode.planningResult = null;
  setModeStatus(modeKey, '正在生成改造方案...');
  renderPlanningResult(modeKey, null);

  try {
    const planningResult = await generateAiPlan({
      lorebookName: mode.lorebookName,
      instruction: mode.instruction,
      chatMessages: currentChatMessagesForRequest(),
      referenceMaterial: state.referenceMaterial,
      lockedEditableUids: Array.from(mode.selectedEntryUids),
      lockedReadonlyUids: Array.from(mode.readonlyEntryUids),
      promptSettings: mode.promptSettings,
      customApi: saved.apiMode === 'custom' ? saved.customApi : null,
      shouldStream: saved.stream === true,
      onGenerationStart: generationId => {
        if (runId === state.previewRunId) {
          state.activeGenerationId = generationId;
        }
      },
    });

    if (runId !== state.previewRunId) {
      return;
    }

    mode.planningResult = planningResult;
    mode.selectedEntryUids = new Set(planningResult.editable_uids || []);
    mode.readonlyEntryUids = new Set(planningResult.readonly_uids || []);
    mode.currentStep = 'planReview';
    setModeStatus(modeKey, '改造方案生成完成，已自动填充条目分组。');
    persistSettings({ mirrorModeKey: modeKey });
    renderCurrentPanel();
  } catch (error) {
    if (runId === state.previewRunId) {
      mode.planningResult = null;
      setModeStatus(modeKey, error?.message || '生成改造方案失败。');
      persistSettings({ mirrorModeKey: modeKey });
      renderCurrentPanel();
    }
  } finally {
    if (runId === state.previewRunId) {
      state.stopRequested = false;
      setGeneratingState(false);
    }
  }
}

async function handlePreview() {
  const modeKey = currentModeKey();
  captureModeInputs(modeKey);
  persistSettings({ mirrorModeKey: modeKey });

  const mode = state.modes[modeKey];
  const saved = settings();
  const runId = ++state.previewRunId;
  if (!mode.lorebookName) return setModeStatus(modeKey, '请先选择目标世界书。');
  if (!hasEditableSelection(modeKey)) return setModeStatus(modeKey, '请至少选择一条“本批可修改”条目。');
  if (!mode.instruction.trim()) return setModeStatus(modeKey, '请输入 AI 指令。');
  if (saved.apiMode === 'custom') {
    const validationMessage = validateCustomApiConfig(saved.customApi, { requireModel: true });
    if (validationMessage) {
      return setModeStatus(modeKey, validationMessage);
    }
  }

  state.stopRequested = false;
  setGeneratingState(true);
  clearPreview(modeKey, '正在生成预览...');
  setModeStatus(modeKey, '正在生成预览...');

  try {
    const previewResult = await generateAiPreview({
      lorebookName: mode.lorebookName,
      entryUids: Array.from(mode.selectedEntryUids),
      readonlyEntryUids: Array.from(mode.readonlyEntryUids),
      planningResult: mode.planningResult,
      instruction: mode.instruction,
      chatMessages: currentChatMessagesForRequest(),
      referenceMaterial: state.referenceMaterial,
      fieldOptions: mode.editableFields,
      promptSettings: mode.promptSettings,
      contextBudget: saved.contextBudget,
      sourceMode: modeKey,
      customApi: saved.apiMode === 'custom' ? saved.customApi : null,
      shouldStream: saved.stream === true,
      onGenerationStart: generationId => {
        if (runId === state.previewRunId) {
          state.activeGenerationId = generationId;
        }
      },
      shouldStop: () => state.stopRequested === true,
      onProgress: progress => {
        if (runId !== state.previewRunId) return;
        const prefix = progress?.title ? `${progress.title}：` : '';
        setModeStatus(modeKey, `${prefix}成功 ${progress.succeeded} 条，失败 ${progress.failed} 条`);
      },
    });

    if (runId !== state.previewRunId) {
      return;
    }

    mode.previewResult = previewResult;
    mode.debugInfo = previewResult?.debug || {};
    mode.currentStep = Array.isArray(previewResult?.items) && previewResult.items.length ? 'review' : mode.currentStep;
    setModeStatus(modeKey, getPreviewStatusText(previewResult));
    persistSettings({ mirrorModeKey: modeKey });
    renderCurrentPanel();
  } catch (error) {
    if (runId === state.previewRunId) {
      const message = error?.message || '生成预览失败。';
      mode.previewResult = null;
      mode.debugInfo = { errorDetails: error?.stack || message };
      setModeStatus(modeKey, message);
      persistSettings({ mirrorModeKey: modeKey });
      renderCurrentPanel();
    }
  } finally {
    if (runId === state.previewRunId) {
      state.stopRequested = false;
      setGeneratingState(false);
    }
  }
}

function handleStop() {
  const modeKey = currentModeKey();
  if (!state.isGenerating) {
    return setModeStatus(modeKey, '当前没有进行中的生成。');
  }

  state.stopRequested = true;
  if (!state.activeGenerationId) {
    return setModeStatus(modeKey, '已请求停止生成，等待当前步骤结束。');
  }

  const stopped = cancelLlmGeneration(state.activeGenerationId);
  setModeStatus(modeKey, stopped ? '已请求停止生成，等待当前步骤结束。' : '已标记停止，但当前环境可能不会立即中断。');
}

async function handleApply() {
  const modeKey = currentModeKey();
  const mode = state.modes[modeKey];
  if (!mode.previewResult) {
    return setModeStatus(modeKey, '当前没有可应用的预览。');
  }

  $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
  setModeStatus(modeKey, '正在应用 AI 预览...');

  try {
    const result = await applyAiPreview({ lorebookName: mode.lorebookName, previewItems: mode.previewResult.items });
    if (result.changed) {
      window.toastr?.success(
        `AI 修改已应用：${result.appliedCount} 条${result.skippedCount ? `，跳过冲突 ${result.skippedCount} 条` : ''}`,
      );
    } else {
      window.toastr?.warning(
        result.skippedCount ? `没有可应用的无冲突变更，跳过 ${result.skippedCount} 条` : '没有可应用的 AI 变更',
      );
    }

    mode.lastApplyResult = result;
    const skippedUids = new Set((result.skipped || []).map(item => Number(item.uid)));
    if (skippedUids.size > 0) {
      mode.previewResult.items = (mode.previewResult.items || []).filter(item => skippedUids.has(Number(item.uid)));
      rebuildPreviewResult(modeKey);
      mode.currentStep = 'review';
      setModeStatus(modeKey, `已应用 ${result.appliedCount} 条，保留 ${skippedUids.size} 条冲突结果供处理。`);
    } else {
      mode.previewResult = null;
      mode.debugInfo = {};
      mode.currentStep = 'complete';
      setModeStatus(modeKey, 'AI 修改已应用完成。');
    }
    await loadEntriesForMode(modeKey, { force: true, resetSelection: false, clearOutputs: false });
    persistSettings({ mirrorModeKey: modeKey });
    renderCurrentPanel();
  } catch (error) {
    setModeStatus(modeKey, error?.message || '应用 AI 预览失败。');
    $('#ai-workspace-apply', parentDoc()).prop('disabled', false);
  }
}

function ensureSelectionReady(modeKey) {
  const mode = state.modes[modeKey];
  captureModeInputs(modeKey);
  if (!mode.lorebookName) {
    setModeStatus(modeKey, '请先选择目标世界书。');
    return false;
  }
  if (!mode.entries.length) {
    setModeStatus(modeKey, '当前世界书没有可用条目。');
    return false;
  }
  if (modeKey === 'direct' && mode.selectedEntryUids.size === 0) {
    setModeStatus(modeKey, '直接修改至少需要一条“修改”条目。');
    return false;
  }
  return true;
}

function bindEvents() {
  $(parentDoc())
    .off('.aiWorkspaceDesktop')
    .on('click.aiWorkspaceDesktop', '.ai-strategy-button', function () {
      const targetStrategy = normalizeNavMode(($(this).attr('data-ai-strategy') || '').trim());
      if (!targetStrategy || targetStrategy === state.currentNav || state.isGenerating) {
        return;
      }
      captureModeInputs(currentModeKey());
      state.currentNav = targetStrategy;
      invalidateModeOutputs(targetStrategy, { clearPlan: true });
      state.modes[targetStrategy].currentStep = 'prepare';
      schedulePersist(targetStrategy);
      renderCurrentPanel();
    })
    .on('click.aiWorkspaceDesktop', '[data-ai-step]', function () {
      if (state.currentNav !== 'direct' && state.currentNav !== 'plan') {
        return;
      }
      captureModeInputs(currentModeKey());
      goToStep(currentModeKey(), ($(this).attr('data-ai-step') || '').trim());
    })
    .on('click.aiWorkspaceDesktop', '[data-ai-step-target]', function () {
      if (state.currentNav !== 'direct' && state.currentNav !== 'plan') {
        return;
      }
      captureModeInputs(currentModeKey());
      const targetStep = ($(this).attr('data-ai-step-target') || '').trim();
      goToStep(currentModeKey(), normalizeStep(currentModeKey(), targetStep));
    })
    .on('focus.aiWorkspaceDesktop input.aiWorkspaceDesktop', '#ai-workspace-lorebook-search', function () {
      renderLorebookSearchResults($(this).val() || '');
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-lorebook-search', function () {
      renderLorebookSearchResults($(this).val() || '');
    })
    .on('blur.aiWorkspaceDesktop', '#ai-workspace-lorebook-search', () => {
      setTimeout(() => hideLorebookSearchResults(), 200);
    })
    .on('mousedown.aiWorkspaceDesktop', '#ai-workspace-lorebook-search-results .add-worldbook-result-item', event => {
      event.preventDefault();
    })
    .on(
      'click.aiWorkspaceDesktop',
      '#ai-workspace-lorebook-search-results .add-worldbook-result-item',
      async function () {
        const modeKey = currentModeKey();
        const mode = state.modes[modeKey];
        mode.lorebookName = ($(this).attr('data-lorebook-name') || '').trim();
        mode.loadedLorebookName = '';
        mode.searchText = '';
        mode.selectedEntryUids.clear();
        mode.readonlyEntryUids.clear();
        invalidateModeOutputs(modeKey);
        mode.currentStep = 'prepare';
        hideLorebookSearchResults();
        persistSettings({ mirrorModeKey: modeKey });
        await loadEntriesForMode(modeKey, { force: true, resetSelection: true, clearOutputs: false });
        renderCurrentPanel();
      },
    )
    .on('keydown.aiWorkspaceDesktop', '#ai-workspace-lorebook-search-results .add-worldbook-result-item', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      $(this).trigger('click');
    })
    .on('change.aiWorkspaceDesktop input.aiWorkspaceDesktop', '#ai-workspace-chat-context-count', () => {
      state.chatContext = currentChatContextSettings();
      renderChatContextPreview();
      persistSettings({ mirrorModeKey: currentModeKey() });
      setModeStatus(currentModeKey(), '聊天上下文条数已更新，点击“刷新聊天上下文”后生效。');
    })
    .on('change.aiWorkspaceDesktop', '#ai-workspace-chat-context-enabled', () => {
      state.chatContext = currentChatContextSettings();
      if (!state.chatContext.enabled) {
        state.chatMessages = [];
      }
      renderChatContextPreview();
      persistSettings({ mirrorModeKey: currentModeKey() });
      invalidateSharedInfoOutputs(
        state.chatContext.enabled
          ? '聊天上下文已开启，请刷新后重新生成计划或预览。'
          : '聊天上下文已关闭并清空，请重新生成计划或预览。',
      );
      setModeStatus(
        currentModeKey(),
        state.chatContext.enabled ? '聊天上下文已开启，请刷新后使用。' : '聊天上下文已关闭并清空。',
      );
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-chat-context-refresh', async () => {
      try {
        await refreshChatContext();
      } catch (error) {
        setModeStatus(currentModeKey(), error?.message || '刷新聊天上下文失败。');
      }
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-chat-context-clear', () => {
      handleChatContextClear();
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-chat-context-preview', () => {
      handleChatContextEdited();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-refresh-entries', async () => {
      await loadEntriesForMode(currentModeKey(), {
        force: true,
        resetSelection: false,
        clearOutputs: false,
        invalidateOutputsOnChange: true,
      });
      renderCurrentPanel();
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-search', function () {
      const modeKey = currentModeKey();
      state.modes[modeKey].searchText = ($(this).val() || '').trim();
      renderEntryList(modeKey);
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-reference-material', function () {
      state.referenceMaterial = ($(this).val() || '').toString();
      syncReferenceMaterialStatus();
      persistSettings({ mirrorModeKey: currentModeKey() });
      invalidateSharedInfoOutputs('参考资料已更新，请重新生成改造方案或预览。');
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-select-visible', () => {
      const modeKey = currentModeKey();
      getFilteredEntries(modeKey).forEach(entry => setEntryMode(modeKey, Number(entry.uid), 'editable'));
      invalidateModeOutputs(modeKey);
      persistSettings({ mirrorModeKey: modeKey });
      renderEntryList(modeKey);
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-mark-visible-readonly', () => {
      const modeKey = currentModeKey();
      getFilteredEntries(modeKey).forEach(entry => setEntryMode(modeKey, Number(entry.uid), 'readonly'));
      invalidateModeOutputs(modeKey);
      persistSettings({ mirrorModeKey: modeKey });
      renderEntryList(modeKey);
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-clear-selection', () => {
      const modeKey = currentModeKey();
      getFilteredEntries(modeKey).forEach(entry => setEntryMode(modeKey, Number(entry.uid), 'none'));
      invalidateModeOutputs(modeKey);
      persistSettings({ mirrorModeKey: modeKey });
      renderEntryList(modeKey);
    })
    .on('click.aiWorkspaceDesktop', '.ai-entry-mode-button', function () {
      const modeKey = currentModeKey();
      const mode = state.modes[modeKey];
      const isPlanReview = modeKey === 'plan' && mode.currentStep === 'planReview' && Boolean(mode.planningResult);
      setEntryMode(modeKey, Number($(this).attr('data-entry-uid')), ($(this).attr('data-entry-mode') || 'none').trim());
      if (isPlanReview) {
        mode.previewResult = null;
        mode.debugInfo = {};
      } else {
        invalidateModeOutputs(modeKey);
      }
      persistSettings({ mirrorModeKey: modeKey });
      if (isPlanReview) {
        mode.planningResult.editable_uids = Array.from(mode.selectedEntryUids);
        mode.planningResult.readonly_uids = Array.from(mode.readonlyEntryUids);
        renderPlanningResult(modeKey);
      } else {
        renderEntryList(modeKey);
      }
    })
    .on(
      'input.aiWorkspaceDesktop change.aiWorkspaceDesktop',
      '#ai-workspace-field-title, #ai-workspace-field-content, #ai-workspace-field-prompt, #ai-workspace-instruction, #ai-workspace-jailbreak-prompt-template, #ai-workspace-builtin-prompt-template, #ai-workspace-planning-prompt-template',
      () => {
        const modeKey = currentModeKey();
        captureModeInputs(modeKey);
        invalidateModeOutputs(modeKey);
        schedulePersist(modeKey);
        syncWorkflowCapabilities(modeKey);
      },
    )
    .on('change.aiWorkspaceDesktop', '#ai-workspace-plan-goal, #ai-workspace-plan-must-keep, #ai-workspace-plan-rewrite-rules, #ai-workspace-plan-consistency-notes', () => {
      if (state.currentNav !== 'plan') return;
      const modeKey = currentModeKey();
      updatePlanningResultFromStructuredForm(modeKey);
      renderPlanningResult(modeKey);
      setModeStatus(modeKey, '规划已更新，可继续生成修改预览。');
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-plan-json', function () {
      if (state.currentNav !== 'plan') {
        return;
      }
      const modeKey = currentModeKey();
      try {
        const validUids = new Set(state.modes[modeKey].entries.map(entry => Number(entry.uid)));
        state.modes[modeKey].planningResult = normalizePlanEditorValue($(this).val() || '{}', validUids);
        state.modes[modeKey].planEditorError = '';
        syncPlanSelectionFromPlanningResult(modeKey);
        state.modes[modeKey].previewResult = null;
        const plan = state.modes[modeKey].planningResult.plan || {};
        $('#ai-workspace-plan-goal', parentDoc()).val(plan.goal || '');
        $('#ai-workspace-plan-must-keep', parentDoc()).val((plan.must_keep || []).join('\n'));
        $('#ai-workspace-plan-rewrite-rules', parentDoc()).val((plan.rewrite_rules || []).join('\n'));
        $('#ai-workspace-plan-consistency-notes', parentDoc()).val((plan.consistency_notes || []).join('\n'));
        renderPlanScope(modeKey);
        $('#ai-workspace-plan-error', parentDoc()).removeClass('is-visible').empty();
        $('#ai-workspace-preview', parentDoc()).prop('disabled', state.modes[modeKey].selectedEntryUids.size === 0);
        setModeStatus(modeKey, '规划已更新，可继续确认并生成修改结果。');
      } catch (error) {
        state.modes[modeKey].planEditorError = error.message;
        $('#ai-workspace-plan-error', parentDoc()).addClass('is-visible').text(`规划 JSON 无法解析：${error.message}`);
        $('#ai-workspace-preview', parentDoc()).prop('disabled', true);
        setModeStatus(modeKey, '请先修正规划 JSON。');
      }
    })
    .on(
      'change.aiWorkspaceDesktop input.aiWorkspaceDesktop',
      '#ai-workspace-apiurl, #ai-workspace-apikey, #ai-workspace-model, #ai-workspace-stream, #ai-workspace-budget-enabled, #ai-workspace-budget-max-input, #ai-workspace-budget-reserve-output',
      () => {
        persistSettings({ mirrorModeKey: currentModeKey() });
        invalidateModeOutputs(currentModeKey(), { clearPlan: true });
        setSharedStatus('API 配置已变化，后续结果请重新生成。');
      },
    )
    .on('change.aiWorkspaceDesktop', '#ai-workspace-source-select', () => {
      toggleCustomApi();
      persistSettings({ mirrorModeKey: currentModeKey() });
      invalidateModeOutputs(currentModeKey(), { clearPlan: true });
      setSharedStatus('API 配置已变化，后续结果请重新生成。');
    })
    .on('change.aiWorkspaceDesktop', 'input[name="ai-workspace-api-mode"]', () => {
      toggleCustomApi();
      persistSettings({ mirrorModeKey: currentModeKey() });
      invalidateModeOutputs(currentModeKey(), { clearPlan: true });
      setSharedStatus('API 配置已变化，后续结果请重新生成。');
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-load-models', event => {
      event.preventDefault();
      event.stopPropagation();
      void handleLoadModels();
    })
    .on('click.aiWorkspaceDesktop', '[data-ai-open-settings]', () => {
      openSettingsDrawer();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-settings-close', () => {
      flushAiWorkspaceSettings();
      closeSettingsDrawer();
      renderCurrentPanel();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-settings-modal', function (event) {
      if (event.target === this) {
        flushAiWorkspaceSettings();
        closeSettingsDrawer();
        renderCurrentPanel();
      }
    })
    .on('click.aiWorkspaceDesktop', '[data-ai-focus-context]', () => {
      const mode = currentModeState();
      if (mode.currentStep !== 'prepare') {
        mode.currentStep = 'prepare';
        renderCurrentPanel();
      }
      const details = $('.ai-context-panel', parentDoc()).get(0);
      if (details) details.open = true;
      $('#ai-workspace-chat-context-enabled', parentDoc()).trigger('focus');
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-plan', async () => {
      await handlePlan();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-preview', async () => {
      await handlePreview();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-stop', () => {
      handleStop();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-apply', async () => {
      await handleApply();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-rollback-preview', async () => {
      await handleRollbackPreview();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-rollback-execute', async () => {
      await handleRollbackPreview();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-rollback-dialog-cancel', () => {
      $('#ai-workspace-rollback-dialog', parentDoc()).get(0)?.close?.();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-rollback-dialog-confirm', async () => {
      await handleRollbackExecute();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-start-new', () => {
      const modeKey = currentModeKey();
      const mode = state.modes[modeKey];
      mode.currentStep = 'prepare';
      mode.instruction = '';
      mode.selectedEntryUids.clear();
      mode.readonlyEntryUids.clear();
      mode.planningResult = null;
      mode.previewResult = null;
      mode.debugInfo = {};
      mode.lastApplyResult = null;
      persistSettings({ mirrorModeKey: modeKey });
      renderCurrentPanel();
    })
    .on('click.aiWorkspaceDesktop', '.ai-preview-exclude', function (event) {
      event.preventDefault();
      event.stopPropagation();
      excludePreviewItem(currentModeKey(), Number($(this).attr('data-preview-uid')));
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-preview-list .ai-preview-item', function () {
      const uid = Number($(this).attr('data-preview-uid'));
      if ((root().width() || 0) < 960) {
        openPreviewModal(uid);
      } else {
        renderPreviewDetail(currentModeKey(), uid);
      }
      $('#ai-workspace-preview-list .ai-preview-item', parentDoc()).removeClass('is-active');
      $(this).addClass('is-active');
    })
    .on('keydown.aiWorkspaceDesktop', '#ai-workspace-preview-list .ai-preview-item', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      $(this).trigger('click');
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-preview-detail-regenerate', async () => {
      const uid = Number($('#ai-workspace-preview-detail', parentDoc()).attr('data-preview-uid'));
      if (!uid) return;
      $('#ai-workspace-preview-modal', parentDoc()).attr('data-preview-uid', uid);
      await handlePreviewModalRegenerate();
      closePreviewModal();
      renderPreviewDetail(currentModeKey(), uid);
    })
    .on(
      'click.aiWorkspaceDesktop',
      '#ai-workspace-preview-modal-close-button, #ai-workspace-preview-modal .ai-preview-modal-close',
      () => {
        closePreviewModal();
      },
    )
    .on('click.aiWorkspaceDesktop', '#ai-workspace-preview-modal-save', () => {
      handlePreviewModalSave();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-preview-modal-regenerate', async () => {
      await handlePreviewModalRegenerate();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-open-assistant, [data-ai-open-assistant-tab]', function () {
      openAssistantModal($(this).attr('data-ai-open-assistant-tab') || 'chat');
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-assistant-close', () => {
      closeAssistantModal();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-assistant-modal', function (event) {
      if (event.target === this) {
        closeAssistantModal();
      }
    })
    .on('keydown.aiWorkspaceDesktop', event => {
      if (event.key === 'Escape' && $('#ai-workspace-assistant-modal', parentDoc()).is(':visible')) {
        closeAssistantModal();
      } else if (event.key === 'Escape' && $('#ai-workspace-settings-modal', parentDoc()).is(':visible')) {
        flushAiWorkspaceSettings();
        closeSettingsDrawer();
        renderCurrentPanel();
      }
    })
    .on('click.aiWorkspaceDesktop', '.ai-assistant-tab', function () {
      switchAssistantTab($(this).attr('data-assistant-tab') || 'chat');
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-preview-modal-content textarea[data-preview-field]', () => {
      if (state.currentNav !== 'direct' && state.currentNav !== 'plan') {
        return;
      }
      setModeStatus(currentModeKey(), '改造结果已修改，离开输入框后保存。');
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-preview-detail textarea[data-preview-field]', () => {
      if (state.currentNav !== 'direct' && state.currentNav !== 'plan') {
        return;
      }
      setModeStatus(currentModeKey(), '改造结果已修改，离开输入框后保存。');
    })
    .on('change.aiWorkspaceDesktop', '#ai-workspace-preview-detail textarea[data-preview-field]', () => {
      if (state.currentNav !== 'direct' && state.currentNav !== 'plan') {
        return;
      }
      try {
        const modeKey = currentModeKey();
        const item = applyPreviewDetailEdits(modeKey);
        if (!item) return;
        renderPreviewDetail(modeKey, item.uid);
        setModeStatus(modeKey, '改造结果已更新，可直接应用。');
      } catch (error) {
        setModeStatus(currentModeKey(), `改造结果无法解析：${error.message}`);
      }
    })
    .on('change.aiWorkspaceDesktop', '#ai-workspace-preview-modal-content textarea[data-preview-field]', function () {
      if (state.currentNav !== 'direct' && state.currentNav !== 'plan') {
        return;
      }

      try {
        const modeKey = currentModeKey();
        const item = applyPreviewModalEdits(modeKey);
        if (!item) {
          return;
        }
        $('#ai-workspace-preview-modal-title', parentDoc()).text(
          `${item.afterEntry.name || item.beforeEntry?.name || item.title || '条目'} (UID: ${item.uid})`,
        );
        $('#ai-workspace-preview-modal-summary', parentDoc()).text(
          item.changed ? '你可以直接编辑右侧预览内容。' : '当前无实际变更，但你仍可直接编辑右侧预览内容。',
        );
        setModeStatus(modeKey, '改造结果已更新，可直接应用。');
      } catch (error) {
        setModeStatus(modeKey, `改造结果无法解析：${error.message}`);
      }
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-assistant-send', async () => {
      await handleAssistantSend();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-assistant-clear', () => {
      clearAssistantHistory();
    })
    .on('keydown.aiWorkspaceDesktop', '#ai-workspace-assistant-input', async event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        await handleAssistantSend();
      }
    })
    .on('click.aiWorkspaceDesktop', '.ai-assistant-pick', function () {
      appendAssistantReplyToReferenceMaterial($(this).attr('data-history-index'));
    })
    .on('click.aiWorkspaceDesktop', '.ai-assistant-delete', function () {
      deleteAssistantHistoryItem($(this).attr('data-history-index'));
    })
    .on(
      'mouseup.aiWorkspaceDesktop touchend.aiWorkspaceDesktop keyup.aiWorkspaceDesktop',
      '#ai-workspace-assistant-history',
      () => {
        setTimeout(updateAssistantSelectionToolbar, 0);
      },
    )
    .on('selectionchange.aiWorkspaceDesktop', () => {
      if ($('#ai-workspace-assistant-modal', parentDoc()).is(':visible')) {
        setTimeout(updateAssistantSelectionToolbar, 0);
      }
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-assistant-selection-add', () => {
      appendSelectedAssistantTextToReferenceMaterial();
    })
    .on('keydown.aiWorkspaceDesktop', '#ai-workspace-preview-modal .ai-preview-modal-close', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        closePreviewModal();
      }
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-preview-modal', function (event) {
      if (event.target === this) {
        closePreviewModal();
      }
    })
    .on('click.aiWorkspaceDesktop', event => {
      if (!$(event.target).closest('.ai-worldbook-adder').length) {
        hideLorebookSearchResults();
      }
    });
}

export function initDesktopAiWorkspace() {
  ensureStyles();
  ensureUnifiedStyles();
  ensureMarkup();
  if (!state.hydrated) {
    hydrateStateFromSettings();
  }
  renderCurrentPanel();
  if (state.initialized) {
    return;
  }
  bindEvents();
  const workbenchContainer = container().get(0);
  if (workbenchContainer && typeof ResizeObserver === 'function') {
    state.resizeObserver?.disconnect?.();
    state.resizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect?.width || root().width() || 0;
      root().attr('data-layout', width >= 960 ? 'wide' : width >= 640 ? 'compact' : 'narrow');
    });
    state.resizeObserver.observe(workbenchContainer);
  }
  $(window).off('pagehide.aiWorkspaceDesktop').on('pagehide.aiWorkspaceDesktop', () => {
    flushAiWorkspaceSettings();
  });
  state.initialized = true;
}

export function resetDesktopAiWorkspace() {
  hydrateStateFromSettings();
  state.worldbookNames = [];
  state.modelOptions = [];
  state.modelStatusText = '';
  state.sharedStatusText = '';
  state.isGenerating = false;
  state.isAssistantGenerating = false;
  state.activeGenerationId = '';
  state.stopRequested = false;
  state.previewRunId += 1;
  ensureMarkup();
  renderCurrentPanel();
}

export const refreshDesktopAiWorkspace = errorCatched(async () => {
  if (!state.hydrated) {
    hydrateStateFromSettings();
  }

  ensureStyles();
  ensureUnifiedStyles();
  ensureMarkup();
  renderCurrentPanel();

  await populateLorebooks();
  ensureModeLorebook(currentModeKey());

  const modeKey = currentModeKey();
  await loadEntriesForMode(modeKey, {
    force: true,
    resetSelection: false,
    clearOutputs: false,
    invalidateOutputsOnChange: true,
  });

  persistSettings({ mirrorModeKey: currentModeKey() });
  renderCurrentPanel();
}, 'refreshDesktopAiWorkspace');
