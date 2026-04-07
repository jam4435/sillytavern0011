import { getWorldbookNamesSafe } from '../api.js';
import { applyAiPreview, collectAiTargetEntries, generateAiPlan, generateAiPreview } from '../features/aiActionsBatch.js';
import { cancelLlmGeneration } from '../features/llmClient.js';
import { AI_CONTENT_ID } from '../config.js';
import { getAiWorkspaceSettings, getPcLayoutModeSetting, setAiWorkspaceSettings } from '../settings.js';
import { errorCatched, isMobile } from '../utils.js';

const ROOT_ID = 'lorebook-ai-workspace';
const MODEL_LIST_ID = 'lorebook-ai-model-list';
const NAV_ITEMS = [
  { key: 'api', label: 'API设置' },
  { key: 'direct', label: '直接修改' },
  { key: 'plan', label: '计划修改' },
  { key: 'generate', label: '世界书生成' },
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
  direct: ['selection', 'instruction', 'result'],
  plan: ['selection', 'instruction', 'planning', 'result'],
};
const STEP_LABELS = {
  selection: '条目选择',
  instruction: '指令设定',
  planning: '计划页面',
  result: '修改结果',
};
const EMPTY_PREVIEW_TEXT = '尚未生成预览。';
const EMPTY_PLAN_TEXT = '尚未生成改造方案。';

function createEmptyModeState() {
  return {
    lorebookName: '',
    searchText: '',
    instruction: '',
    currentStep: 'selection',
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
    entries: [],
    loadedLorebookName: '',
  };
}

const state = {
  worldbookNames: [],
  modelOptions: [],
  modelStatusText: '',
  sharedStatusText: '',
  currentNav: 'direct',
  isGenerating: false,
  activeGenerationId: '',
  stopRequested: false,
  previewRunId: 0,
  initialized: false,
  hydrated: false,
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

export function isDesktopAiWorkspace() {
  return !isMobile() && getPcLayoutModeSetting() === 'master-detail';
}

function normalizeNavMode(mode) {
  return NAV_ITEMS.some(item => item.key === mode) ? mode : 'direct';
}

function normalizeStep(modeKey, step) {
  return MODE_STEPS[modeKey]?.includes(step) ? step : 'selection';
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

  state.currentNav = normalizeNavMode(saved.navMode || 'direct');
  state.modelStatusText = '';
  state.sharedStatusText = '';
  state.modes.direct = createModeState(saved.direct, { ...fallback, modeKey: 'direct' });
  state.modes.plan = createModeState(saved.plan, { ...fallback, modeKey: 'plan' });
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

function persistSettings({ mirrorModeKey = currentModeKey() } = {}) {
  const saved = settings();
  const mirrorMode = state.modes[mirrorModeKey] || state.modes.direct;
  setAiWorkspaceSettings({
    ...saved,
    navMode: state.currentNav,
    direct: serializeModeState('direct'),
    plan: serializeModeState('plan'),
    lorebookName: mirrorMode.lorebookName,
    editableFields: { ...mirrorMode.editableFields },
    promptSettings: { ...mirrorMode.promptSettings },
    apiMode: getApiMode(),
    stream: isStreamEnabled(),
    customApi: currentApiSettings(),
  });
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
      : (mode.promptSettings.planningPromptTemplate || ''),
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
  if (state.currentNav === 'api' || state.currentNav === 'generate') {
    $('#ai-workspace-status', parentDoc()).text(state.sharedStatusText);
  }
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
  $('.ai-mode-nav-button', parentDoc()).prop('disabled', state.isGenerating);
  if (!state.isGenerating) {
    state.activeGenerationId = '';
  }
}

function invalidateModeOutputs(modeKey, { clearPlan = modeKey === 'plan' } = {}) {
  const mode = state.modes[modeKey];
  mode.previewResult = null;
  mode.debugInfo = {};
  if (clearPlan) {
    mode.planningResult = null;
    if (mode.currentStep === 'planning' || mode.currentStep === 'result') {
      mode.currentStep = 'instruction';
    }
  } else if (mode.currentStep === 'result') {
    mode.currentStep = 'instruction';
  }
}

function getFilteredEntries(modeKey) {
  const mode = state.modes[modeKey];
  const keyword = (mode.searchText || '').trim().toLowerCase();
  return keyword
    ? mode.entries.filter(entry => (entry.name || '').toLowerCase().includes(keyword))
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
}

function renderEntryList(modeKey) {
  const $list = $('#ai-workspace-entry-list', parentDoc());
  if (!$list.length) {
    return;
  }

  const entries = getFilteredEntries(modeKey);
  $list.empty();
  if (!entries.length) {
    $list.append('<div class="ai-empty">没有匹配的条目。</div>');
    renderSelectionSummary(modeKey);
    return;
  }

  entries.forEach(entry => {
    const uid = Number(entry.uid);
    const entryMode = getEntryMode(modeKey, uid);
    const snippet = (entry.content || '').replace(/\s+/g, ' ').trim();
    $list.append(`
      <div class="ai-entry-item">
        <select class="ai-entry-mode" data-entry-uid="${uid}">
          <option value="none" ${entryMode === 'none' ? 'selected' : ''}>不参与</option>
          <option value="editable" ${entryMode === 'editable' ? 'selected' : ''}>本批可修改</option>
          <option value="readonly" ${entryMode === 'readonly' ? 'selected' : ''}>只读参考</option>
        </select>
        <div class="ai-entry-main">
          <div class="ai-entry-item-title">${_.escape(entry.name || `UID ${uid}`)}</div>
          <div class="ai-entry-item-meta">UID: ${uid}</div>
          <div class="ai-entry-item-snippet">${_.escape(snippet.slice(0, 180) || '无内容摘要')}</div>
        </div>
      </div>
    `);
  });

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
    lines.push(`兼容诊断 ${diagnostics.totalAttempts} 组，成功 ${diagnostics.succeededAttempts} 组，失败 ${diagnostics.failedAttempts} 组。`);
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
  lines.push(`诊断统计：共 ${diagnostics.totalAttempts} 组，成功 ${diagnostics.succeededAttempts} 组，失败 ${diagnostics.failedAttempts} 组。`);
  lines.push(
    diagnostics.foundWorkingConfig
      ? `已采用可用组合：${describeResolvedConfig(previewResult)}`
      : '未找到可用组合。',
  );
  if (diagnostics.stopped) {
    lines.push('诊断过程已手动停止。');
  }
  return lines.join('\n');
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
    return diff.snippets.map((snippet, index) => `
      <div class="ai-preview-diff">
        <div class="ai-preview-diff-label">${_.escape(diff.label)}${diff.snippets.length > 1 ? ` #${index + 1}` : ''}</div>
        <div class="ai-preview-diff-before">当前: ${_.escape(snippet.before || '')}</div>
        <div class="ai-preview-diff-after">预览: ${_.escape(snippet.after || '')}</div>
      </div>
    `).join('');
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

function normalizePlanEditorValue(rawValue) {
  const parsed = JSON.parse(rawValue || '{}');
  const readonlyUids = _.uniq((Array.isArray(parsed?.readonly_uids) ? parsed.readonly_uids : [])
    .map(uid => Number(uid))
    .filter(uid => Number.isFinite(uid)));
  const editableUids = _.uniq((Array.isArray(parsed?.editable_uids) ? parsed.editable_uids : [])
    .map(uid => Number(uid))
    .filter(uid => Number.isFinite(uid)));
  const overlap = readonlyUids.filter(uid => editableUids.includes(uid));
  if (overlap.length) {
    throw new Error(`readonly_uids 与 editable_uids 不能重叠: ${overlap.join(', ')}`);
  }

  return {
    readonly_uids: readonlyUids,
    editable_uids: editableUids,
    plan: {
      goal: typeof parsed?.plan?.goal === 'string' ? parsed.plan.goal.trim() : '',
      must_keep: Array.isArray(parsed?.plan?.must_keep) ? parsed.plan.must_keep.map(item => `${item || ''}`.trim()).filter(Boolean) : [],
      rewrite_rules: Array.isArray(parsed?.plan?.rewrite_rules)
        ? parsed.plan.rewrite_rules.map(item => `${item || ''}`.trim()).filter(Boolean)
        : [],
      consistency_notes: Array.isArray(parsed?.plan?.consistency_notes)
        ? parsed.plan.consistency_notes.map(item => `${item || ''}`.trim()).filter(Boolean)
        : [],
    },
  };
}

function syncPlanSelectionFromPlanningResult(modeKey) {
  const mode = state.modes[modeKey];
  const validUidSet = new Set(
    (mode.entries || [])
      .map(entry => Number(entry?.uid))
      .filter(uid => Number.isFinite(uid)),
  );
  const readonlyUids = _.uniq((Array.isArray(mode.planningResult?.readonly_uids) ? mode.planningResult.readonly_uids : [])
    .map(uid => Number(uid))
    .filter(uid => validUidSet.has(uid)));
  const editableUids = _.uniq((Array.isArray(mode.planningResult?.editable_uids) ? mode.planningResult.editable_uids : [])
    .map(uid => Number(uid))
    .filter(uid => validUidSet.has(uid) && !readonlyUids.includes(uid)));

  mode.planningResult = {
    readonly_uids: readonlyUids,
    editable_uids: editableUids,
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
        snippets: [{
          before: beforeContent,
          after: afterContent,
        }],
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

function buildPreviewModalSections(item, mode) {
  const beforeEntry = item?.beforeEntry || {};
  const afterEntry = item?.afterEntry || {};
  const beforeKeywords = Array.isArray(beforeEntry?.strategy?.keys) ? beforeEntry.strategy.keys : [];
  const afterKeywords = Array.isArray(afterEntry?.strategy?.keys) ? afterEntry.strategy.keys : [];
  const sections = [];

  if (mode?.editableFields?.title) {
    sections.push({ key: 'title', title: '标题', before: beforeEntry?.name || '', after: afterEntry?.name || '' });
  }
  if (mode?.editableFields?.content) {
    sections.push({ key: 'content', title: '内容', before: beforeEntry?.content || '', after: afterEntry?.content || '' });
  }
  if (mode?.editableFields?.prompt) {
    sections.push({ key: 'keywords', title: '关键词', before: beforeKeywords, after: afterKeywords });
  }
  if (!sections.length) {
    sections.push({ key: 'content', title: '当前条目', before: beforeEntry?.content || '', after: afterEntry?.content || '' });
  }
  return sections;
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
  const hasAnySuccessDebug = Boolean(mode.debugInfo.requestPrompt || mode.debugInfo.rawResponse || mode.debugInfo.parsedJsonCandidate);
  const visibility = hasFailure
    ? { request: false, response: false, json: false, error: true, diagnostics: Boolean(mode.debugInfo.diagnosticsReport) }
    : { request: hasAnySuccessDebug, response: hasAnySuccessDebug, json: hasAnySuccessDebug, error: false, diagnostics: false };

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
  if (plan.goal) {
    lines.push(`目标：${plan.goal}`);
  }

  $summary.text(lines.join(' | '));
  $json.val(JSON.stringify({
    readonly_uids: mode.planningResult.readonly_uids || [],
    editable_uids: mode.planningResult.editable_uids || [],
    plan: mode.planningResult.plan || {},
  }, null, 2));
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

  const $errors = $('#ai-workspace-preview-errors', parentDoc());
  const diagnosticsSummary = buildDiagnosticsErrorSummary(mode.previewResult);
  if (diagnosticsSummary) {
    $errors.addClass('has-errors').text(diagnosticsSummary);
  } else if (Array.isArray(mode.previewResult?.errors) && mode.previewResult.errors.length) {
    $errors
      .addClass('has-errors')
      .text(
        mode.previewResult.errors
          .map(item => {
            const summaryText = /Got response status 503|response status 503|\b503\b/i.test(item.error || '')
              ? 'OpenAI兼容后端返回 503，请优先检查 URL / 模型 / 流式支持 / 上游服务状态。'
              : summarizePreviewError(item.error);
            return `${item.title}: ${summaryText}`;
          })
          .join('\n'),
      );
  } else {
    $errors.removeClass('has-errors').empty();
  }

  const $list = $('#ai-workspace-preview-list', parentDoc());
  $list.empty();
  if (!Array.isArray(mode.previewResult?.items) || !mode.previewResult.items.length) {
    $list.append('<div class="ai-empty">没有可展示的预览结果。</div>');
    $('#ai-workspace-apply', parentDoc()).prop('disabled', true);
    renderDebugInfo(modeKey, mode.previewResult?.debug || {});
    return;
  }

  mode.previewResult.items.forEach(item => {
    const diffs = item.diffs.length
      ? item.diffs.map(diff => renderPreviewDiff(diff)).join('')
      : '<div class="ai-preview-diff-after">无实际变更。</div>';
    $list.append(`
      <div class="ai-preview-item" data-preview-uid="${item.uid}" title="点击查看完整修改">
        <div class="ai-preview-item-title">${_.escape(item.title)} (UID: ${item.uid})</div>
        ${diffs}
      </div>
    `);
  });

  renderDebugInfo(modeKey, mode.previewResult?.debug || {});
  $('#ai-workspace-apply', parentDoc()).prop('disabled', summary.changed === 0);
}

function closePreviewModal() {
  $('#ai-workspace-preview-modal', parentDoc()).hide();
}

function openPreviewModal(uid) {
  const mode = currentModeState();
  const item = mode.previewResult?.items?.find(previewItem => Number(previewItem?.uid) === Number(uid));
  if (!item) {
    return;
  }

  const sections = buildPreviewModalSections(item, mode);
  $('#ai-workspace-preview-modal-title', parentDoc()).text(`${item.title || '条目'} (UID: ${item.uid})`);
  $('#ai-workspace-preview-modal-summary', parentDoc()).text(item.changed ? '你可以直接编辑右侧预览内容。' : '当前无实际变更，但你仍可直接编辑右侧预览内容。');
  $('#ai-workspace-preview-modal-content', parentDoc()).html(
    sections.map(section => `
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
    `).join(''),
  );
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
    return [{
      label: 'custom-status',
      body: {
        reverse_proxy: apiConfig.apiurl,
        proxy_password: '',
        chat_completion_source: 'custom',
        custom_url: apiConfig.apiurl,
        custom_include_headers: apiConfig.key ? `Authorization: Bearer ${apiConfig.key}` : '',
      },
    }];
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
      models = parseModelListPayload(await getModelList({
        apiurl: isCustomSource(customApiConfig.source) ? customApiConfig.apiurl : '',
        key: customApiConfig.key,
        source: isCustomSource(customApiConfig.source) ? 'openai' : customApiConfig.source,
      }));
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
      <div class="ai-preview-modal-dialog">
        <div class="ai-preview-modal-header">
          <h4 id="ai-workspace-preview-modal-title">条目完整预览</h4>
          <span class="ai-preview-modal-close" tabindex="0">&times;</span>
        </div>
        <div class="ai-preview-modal-body">
          <div id="ai-workspace-preview-modal-summary" class="ai-text"></div>
          <div id="ai-workspace-preview-modal-content"></div>
        </div>
        <div class="ai-preview-modal-footer">
          <button type="button" id="ai-workspace-preview-modal-close-button">关闭</button>
        </div>
      </div>
    </div>
  `;
}

function buildApiSettingsMarkup() {
  return `
    <div class="ai-page">
      <div class="ai-page-header">
        <div>
          <h4>API设置</h4>
          <p>共享给“直接修改”和“计划修改”的模型与调用配置。</p>
        </div>
      </div>
      <div class="ai-panel">
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
                <button type="button" id="ai-workspace-load-models">读取模型列表</button>
              </div>
            </div>
          </div>
          <div class="ai-toolbar ai-api-toolbar">
            <label><input type="checkbox" id="ai-workspace-stream"> 流式生成</label>
            <span id="ai-workspace-models-status" class="ai-text"></span>
          </div>
          <div id="ai-workspace-api-hint" class="ai-note"></div>
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
  return `
    <div class="ai-stepper">
      ${steps.map((step, index) => {
        const isActive = step === mode.currentStep;
        const isComplete = index < currentIndex;
        const isUnlocked = isComplete || isActive;
        return `
          <button
            type="button"
            class="ai-step-button${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}"
            data-ai-step="${step}"
            ${isUnlocked ? '' : 'disabled'}
          >
            <span class="ai-step-index">${index + 1}</span>
            <span>${STEP_LABELS[step]}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function buildSelectionMarkup(modeKey) {
  const note = modeKey === 'plan'
    ? '<div class="ai-note">计划修改会基于整本世界书自动分析。生成计划后，当前条目分组会被计划结果覆盖。</div>'
    : '';
  return `
    <div class="ai-panel">
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
          <button type="button" id="ai-workspace-refresh-entries">刷新条目</button>
        </div>
      </div>
      <div class="ai-row">
        <div class="ai-field ai-grow">
          <label for="ai-workspace-search">搜索条目</label>
          <input id="ai-workspace-search" type="text" placeholder="按标题筛选当前世界书条目">
        </div>
      </div>
      <div class="ai-toolbar">
        <button type="button" id="ai-workspace-select-visible">当前筛选设为可修改</button>
        <button type="button" id="ai-workspace-mark-visible-readonly">当前筛选设为只读</button>
        <button type="button" id="ai-workspace-clear-selection">清空选择</button>
        <span id="ai-workspace-selection-summary" class="ai-text">尚未加载条目</span>
      </div>
      <div id="ai-workspace-entry-list" class="ai-scroll ai-entry-list"></div>
      <div class="ai-step-actions">
        <button type="button" class="ai-secondary-button" data-ai-step-target="instruction">下一步：指令设定</button>
        <span id="ai-workspace-status" class="ai-text"></span>
      </div>
    </div>
  `;
}

function buildInstructionMarkup(modeKey) {
  const planningPromptField = modeKey === 'plan'
    ? `
      <div class="ai-field">
        <label for="ai-workspace-planning-prompt-template">计划提示词</label>
        <textarea id="ai-workspace-planning-prompt-template" class="ai-prompt-template"></textarea>
      </div>
    `
    : '';
  return `
    <div class="ai-panel">
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
        <button type="button" class="ai-secondary-button" data-ai-step-target="selection">返回条目选择</button>
        ${modeKey === 'plan'
          ? '<button type="button" id="ai-workspace-plan">生成改造方案</button>'
          : '<button type="button" id="ai-workspace-preview">生成修改结果</button>'}
        <button type="button" id="ai-workspace-stop" disabled>停止生成</button>
        <span id="ai-workspace-status" class="ai-text"></span>
      </div>
    </div>
  `;
}

function buildPlanningMarkup() {
  return `
    <div class="ai-panel">
      <div class="ai-note">计划页面承载当前“生成改造方案”的结果。确认后将基于该方案生成最终修改预览。</div>
      <div id="ai-workspace-plan-summary" class="ai-text">${EMPTY_PLAN_TEXT}</div>
      <div class="ai-debug-grid">
        <details class="ai-debug-block" open>
          <summary>改造方案 JSON</summary>
          <textarea id="ai-workspace-plan-json"></textarea>
        </details>
      </div>
      <div class="ai-step-actions">
        <button type="button" class="ai-secondary-button" data-ai-step-target="instruction">返回指令设定</button>
        <button type="button" id="ai-workspace-preview">确认方案并生成修改结果</button>
        <button type="button" id="ai-workspace-stop" disabled>停止生成</button>
        <span id="ai-workspace-status" class="ai-text"></span>
      </div>
    </div>
  `;
}

function buildResultMarkup(modeKey) {
  const backStep = modeKey === 'plan' && state.modes.plan.planningResult ? 'planning' : 'instruction';
  return `
    <div class="ai-panel">
      <div id="ai-workspace-preview-summary" class="ai-text">${EMPTY_PREVIEW_TEXT}</div>
      <div id="ai-workspace-preview-errors" class="ai-preview-errors"></div>
      <div id="ai-workspace-preview-list" class="ai-scroll ai-preview-list"></div>
      <div class="ai-step-actions">
        <button type="button" class="ai-secondary-button" data-ai-step-target="${backStep}">返回上一步</button>
        <button type="button" id="ai-workspace-preview">重新生成修改结果</button>
        <button type="button" id="ai-workspace-stop" disabled>停止生成</button>
        <button type="button" id="ai-workspace-apply" disabled>应用预览</button>
        <span id="ai-workspace-status" class="ai-text"></span>
      </div>
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
    </div>
  `;
}

function buildModeWorkspace(modeKey) {
  const title = modeKey === 'plan' ? '计划修改' : '直接修改';
  const description = modeKey === 'plan'
    ? '先生成改造方案，再由你确认后进入修改结果。'
    : '直接选择条目、设定指令并生成修改结果。';
  const mode = state.modes[modeKey];
  let bodyMarkup = '';
  switch (mode.currentStep) {
    case 'selection':
      bodyMarkup = buildSelectionMarkup(modeKey);
      break;
    case 'instruction':
      bodyMarkup = buildInstructionMarkup(modeKey);
      break;
    case 'planning':
      bodyMarkup = buildPlanningMarkup();
      break;
    case 'result':
      bodyMarkup = buildResultMarkup(modeKey);
      break;
    default:
      bodyMarkup = buildSelectionMarkup(modeKey);
      break;
  }

  return `
    <div class="ai-page">
      <div class="ai-page-header">
        <div>
          <h4>${title}</h4>
          <p>${description}</p>
        </div>
      </div>
      ${buildStepIndicator(modeKey)}
      ${bodyMarkup}
    </div>
  `;
}

function buildGeneratorMarkup() {
  return `
    <div class="ai-page">
      <div class="ai-page-header">
        <div>
          <h4>世界书生成</h4>
          <p>本轮只提供占位，不接入具体功能。</p>
        </div>
      </div>
      <div class="ai-panel ai-placeholder-panel">
        <div class="ai-coming-soon">敬请期待</div>
        <div class="ai-note">该入口将在后续迭代中接入完整生成工作流。</div>
        <div class="ai-status-line">
          <span id="ai-workspace-status" class="ai-text">${state.sharedStatusText || ''}</span>
        </div>
      </div>
    </div>
  `;
}

function buildDesktopShellMarkup() {
  return `
    <div id="${ROOT_ID}" data-layout="desktop" class="ai-desktop-root">
      <aside class="ai-desktop-nav">
        <div class="ai-nav-title">AI 工作台</div>
        <div class="ai-nav-list">
          ${NAV_ITEMS.map(item => `
            <button
              type="button"
              class="ai-mode-nav-button${state.currentNav === item.key ? ' is-active' : ''}${item.key === 'generate' ? ' is-disabled' : ''}"
              data-ai-nav="${item.key}"
            >
              <span>${item.label}</span>
              ${item.key === 'generate' ? '<small>敬请期待</small>' : ''}
            </button>
          `).join('')}
        </div>
      </aside>
      <section class="ai-desktop-main">
        <div id="ai-workspace-desktop-panel"></div>
      </section>
      ${buildPreviewModalMarkup()}
    </div>
  `;
}

function ensureMarkup() {
  const $container = container();
  if (!$container.length) {
    return;
  }

  if (root().attr('data-layout') !== 'desktop') {
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
      #${ROOT_ID} .ai-desktop-nav{border:1px solid var(--panel-border-color,#555);border-radius:8px;background:var(--panel-entry-bg-color,#2f2f2f);padding:16px;display:flex;flex-direction:column;gap:12px}
      #${ROOT_ID} .ai-nav-title{font-size:14px;font-weight:700;letter-spacing:.04em;color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-nav-list{display:flex;flex-direction:column;gap:8px}
      #${ROOT_ID} .ai-mode-nav-button{display:flex;flex-direction:column;align-items:flex-start;gap:4px;border:1px solid var(--panel-border-color,#555);border-radius:8px;background:rgba(255,255,255,.02);color:var(--panel-text-color,#eee);padding:12px 14px;cursor:pointer;text-align:left}
      #${ROOT_ID} .ai-mode-nav-button.is-active{border-color:var(--panel-accent-color,#9a7ace);background:rgba(154,122,206,.18);box-shadow:inset 0 0 0 1px rgba(154,122,206,.18)}
      #${ROOT_ID} .ai-mode-nav-button.is-disabled{opacity:.78}
      #${ROOT_ID} .ai-mode-nav-button small{font-size:12px;opacity:.7}
      #${ROOT_ID} .ai-desktop-main{min-width:0;overflow:hidden}
      #${ROOT_ID} #ai-workspace-desktop-panel{height:100%;overflow-y:auto;padding-right:4px}
      #${ROOT_ID} .ai-page{display:flex;flex-direction:column;gap:14px;min-height:100%}
      #${ROOT_ID} .ai-page-header h4{margin:0 0 4px 0;font-size:18px}
      #${ROOT_ID} .ai-page-header p{margin:0;color:var(--panel-text-color,#cfd8dc);font-size:13px;line-height:1.5}
      #${ROOT_ID} .ai-stepper{display:flex;gap:10px;flex-wrap:wrap}
      #${ROOT_ID} .ai-step-button{display:flex;align-items:center;gap:10px;border:1px solid var(--panel-border-color,#555);border-radius:999px;background:rgba(255,255,255,.03);color:var(--panel-text-color,#ddd);padding:10px 14px;cursor:pointer}
      #${ROOT_ID} .ai-step-button.is-active{background:rgba(154,122,206,.22);border-color:var(--panel-accent-color,#9a7ace);color:var(--panel-text-color,#fff)}
      #${ROOT_ID} .ai-step-button.is-complete{background:rgba(74,122,112,.18);border-color:#4a9a7c}
      #${ROOT_ID} .ai-step-button[disabled]{opacity:.5;cursor:not-allowed}
      #${ROOT_ID} .ai-step-index{width:24px;height:24px;border-radius:999px;background:rgba(255,255,255,.1);display:inline-flex;align-items:center;justify-content:center;font-size:12px}
      #${ROOT_ID} .ai-panel{border:1px solid var(--panel-border-color,#555);border-radius:8px;background:var(--panel-bg-color,rgba(42,42,42,.95));padding:16px;display:flex;flex-direction:column;gap:12px}
      #${ROOT_ID} .ai-row{display:flex;gap:12px;align-items:flex-end}
      #${ROOT_ID} .ai-worldbook-row{align-items:flex-start}
      #${ROOT_ID} .ai-field{display:flex;flex-direction:column;gap:6px;min-width:160px}
      #${ROOT_ID} .ai-grow{flex:1 1 auto}
      #${ROOT_ID} .ai-btn-field{flex:0 0 auto;min-width:140px}
      #${ROOT_ID} label{font-size:13px;color:var(--panel-text-color,#ddd)}
      #${ROOT_ID} input[type='text'],#${ROOT_ID} input[type='password'],#${ROOT_ID} select,#${ROOT_ID} textarea{width:100%;box-sizing:border-box;border:1px solid var(--panel-border-color,#555);border-radius:6px;background:var(--search-input-bg-color,#222);color:var(--panel-text-color,#eee);padding:9px 10px}
      #${ROOT_ID} textarea{min-height:120px;resize:vertical}
      #${ROOT_ID} .ai-prompt-template{min-height:220px;font-family:Consolas,Monaco,monospace}
      #${ROOT_ID} .ai-prompt-settings{border:1px solid var(--panel-border-color,#444);border-radius:6px;background:var(--panel-entry-bg-color,#242424)}
      #${ROOT_ID} .ai-prompt-settings summary{cursor:pointer;padding:10px 12px;font-size:13px;font-weight:600;color:var(--panel-text-color,#ddd);background:rgba(255,255,255,.03)}
      #${ROOT_ID} .ai-prompt-settings-body{display:flex;flex-direction:column;gap:12px;padding:12px}
      #${ROOT_ID} button{border:1px solid var(--panel-border-color,#666);border-radius:6px;background:var(--panel-accent-color,#4a6a8a);color:var(--panel-text-color,#fff);padding:9px 12px;cursor:pointer}
      #${ROOT_ID} button[disabled]{opacity:.6;cursor:not-allowed}
      #${ROOT_ID} .ai-secondary-button{background:transparent}
      #${ROOT_ID} .ai-toolbar,#${ROOT_ID} .ai-step-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      #${ROOT_ID} .ai-api-toolbar{justify-content:space-between}
      #${ROOT_ID} .ai-status-line{display:flex;align-items:center;gap:10px}
      #${ROOT_ID} .ai-text{color:var(--panel-text-color,#cfd8dc);line-height:1.4;font-size:13px}
      #${ROOT_ID} .ai-note{font-size:13px;line-height:1.5;color:var(--panel-text-color,#cfd8dc);opacity:.9}
      #${ROOT_ID} .ai-scroll{overflow-y:auto;border:1px solid var(--panel-border-color,#444);border-radius:6px;background:var(--panel-entry-bg-color,#242424)}
      #${ROOT_ID} .ai-entry-list{min-height:320px;max-height:460px}
      #${ROOT_ID} .ai-preview-list{min-height:220px;max-height:420px}
      #${ROOT_ID} .ai-entry-item{display:flex;gap:10px;align-items:flex-start;padding:12px;border-bottom:1px solid var(--panel-border-color,#3e3e3e)}
      #${ROOT_ID} .ai-entry-item:last-child,#${ROOT_ID} .ai-preview-item:last-child{border-bottom:0}
      #${ROOT_ID} .ai-entry-main{min-width:0;flex:1 1 auto}
      #${ROOT_ID} .ai-entry-mode{width:150px;flex:0 0 150px}
      #${ROOT_ID} .ai-entry-item-title,#${ROOT_ID} .ai-preview-item-title{font-weight:600;margin-bottom:4px;color:var(--panel-text-color,#eee)}
      #${ROOT_ID} .ai-entry-item-meta,#${ROOT_ID} .ai-entry-item-snippet{color:var(--panel-text-color,#ccc);font-size:13px;line-height:1.5}
      #${ROOT_ID} .ai-entry-item-snippet{margin-top:4px}
      #${ROOT_ID} .ai-preview-errors{display:none;color:#ffb4b4;white-space:pre-wrap}
      #${ROOT_ID} .ai-preview-errors.has-errors{display:block}
      #${ROOT_ID} .ai-preview-item{padding:12px;border-bottom:1px solid var(--panel-border-color,#3e3e3e);cursor:pointer}
      #${ROOT_ID} .ai-preview-item:hover{background:rgba(255,255,255,.04)}
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
    </style>
  `);
}

function syncSource(source) {
  $('#ai-workspace-source-select', parentDoc()).val(isKnownSource(source) ? source : 'custom');
}

function toggleCustomApi() {
  const apiMode = getApiMode();
  const source = ($('#ai-workspace-source-select', parentDoc()).val() || settings().customApi?.source || 'openai').trim();
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
}

function renderCurrentPanel() {
  const $panel = $('#ai-workspace-desktop-panel', parentDoc());
  if (!$panel.length) {
    return;
  }

  let markup = '';
  if (state.currentNav === 'api') {
    markup = buildApiSettingsMarkup();
  } else if (state.currentNav === 'generate') {
    markup = buildGeneratorMarkup();
  } else {
    markup = buildModeWorkspace(currentModeKey());
  }
  $panel.html(markup);

  $('.ai-mode-nav-button', parentDoc()).removeClass('is-active');
  $(`.ai-mode-nav-button[data-ai-nav="${state.currentNav}"]`, parentDoc()).addClass('is-active');

  if (state.currentNav === 'api') {
    syncApiForm();
  } else if (state.currentNav === 'generate') {
    setSharedStatus(state.sharedStatusText);
  } else {
    const modeKey = currentModeKey();
    syncModeForm(modeKey);
    renderEntryList(modeKey);
    renderSelectionSummary(modeKey);
    renderPlanningResult(modeKey, state.modes[modeKey].planningResult);
    if (state.modes[modeKey].previewResult) {
      renderPreview(modeKey, state.modes[modeKey].previewResult);
    } else {
      clearPreview(modeKey);
      renderDebugInfo(modeKey, state.modes[modeKey].debugInfo || {});
    }
    setModeStatus(modeKey, state.modes[modeKey].statusText);
  }

  setGeneratingState(state.isGenerating);
}

function hideLorebookSearchResults() {
  $('#ai-workspace-lorebook-search-results', parentDoc()).empty().hide();
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

  $results.html(
    names.map(name => `
      <div class="add-worldbook-result-item${name === activeLorebook ? ' is-active' : ''}" data-lorebook-name="${_.escape(name)}">
        ${_.escape(name)}
      </div>
    `).join(''),
  ).show();
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

async function loadEntriesForMode(modeKey, { force = false, resetSelection = false, clearOutputs = false } = {}) {
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

  setModeStatus(modeKey, `正在加载世界书“${mode.lorebookName}”的条目...`);
  const entries = await collectAiTargetEntries(mode.lorebookName, []);
  mode.entries = entries.map(entry => ({ uid: Number(entry.uid), name: entry.name || '', content: entry.content || '' }));
  mode.loadedLorebookName = mode.lorebookName;

  const validUidSet = new Set(mode.entries.map(entry => Number(entry.uid)));
  mode.selectedEntryUids = new Set(Array.from(mode.selectedEntryUids).filter(uid => validUidSet.has(Number(uid))));
  mode.readonlyEntryUids = new Set(Array.from(mode.readonlyEntryUids).filter(uid => validUidSet.has(Number(uid))));

  if (state.currentNav === modeKey) {
    renderEntryList(modeKey);
    renderSelectionSummary(modeKey);
  }
  setModeStatus(modeKey, `已加载 ${mode.entries.length} 条可处理条目。`);
}

function goToStep(modeKey, targetStep) {
  const mode = state.modes[modeKey];
  if (!MODE_STEPS[modeKey].includes(targetStep)) {
    return;
  }
  const currentIndex = MODE_STEPS[modeKey].indexOf(mode.currentStep);
  const targetIndex = MODE_STEPS[modeKey].indexOf(targetStep);
  const canAdvance = targetIndex <= currentIndex
    || (targetStep === 'planning' && Boolean(mode.planningResult))
    || (targetStep === 'result' && Boolean(mode.previewResult))
    || targetStep === 'instruction';
  if (!canAdvance) {
    return;
  }
  mode.currentStep = targetStep;
  persistSettings({ mirrorModeKey: modeKey });
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
    mode.currentStep = 'planning';
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
      fieldOptions: mode.editableFields,
      promptSettings: mode.promptSettings,
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
    mode.currentStep = 'result';
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
      window.toastr?.success(`AI 修改已应用：${result.appliedCount} 条`);
    } else {
      window.toastr?.warning('没有可应用的 AI 变更');
    }

    await loadEntriesForMode(modeKey, { force: true, resetSelection: false, clearOutputs: false });
    clearPreview(modeKey, '本次预览已应用。');
    setModeStatus(modeKey, 'AI 修改已应用完成。');
    persistSettings({ mirrorModeKey: modeKey });
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
  return true;
}

function bindEvents() {
  $(parentDoc())
    .off('.aiWorkspaceDesktop')
    .on('click.aiWorkspaceDesktop', '.ai-mode-nav-button', async function () {
      const targetNav = ($(this).attr('data-ai-nav') || '').trim();
      if (!targetNav || targetNav === state.currentNav || state.isGenerating) {
        return;
      }
      if (state.currentNav === 'direct' || state.currentNav === 'plan') {
        captureModeInputs(currentModeKey());
        persistSettings({ mirrorModeKey: currentModeKey() });
      }
      state.currentNav = normalizeNavMode(targetNav);
      persistSettings({ mirrorModeKey: currentModeKey() });
      renderCurrentPanel();
      if (state.currentNav === 'direct' || state.currentNav === 'plan') {
        ensureModeLorebook(currentModeKey());
        if (!state.modes[currentModeKey()].entries.length || state.modes[currentModeKey()].loadedLorebookName !== state.modes[currentModeKey()].lorebookName) {
          await loadEntriesForMode(currentModeKey(), { force: true, resetSelection: false, clearOutputs: false });
          renderCurrentPanel();
        }
      }
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
      if (targetStep === 'instruction' && !ensureSelectionReady(currentModeKey())) {
        return;
      }
      state.modes[currentModeKey()].currentStep = normalizeStep(currentModeKey(), targetStep);
      persistSettings({ mirrorModeKey: currentModeKey() });
      renderCurrentPanel();
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
    .on('click.aiWorkspaceDesktop', '#ai-workspace-lorebook-search-results .add-worldbook-result-item', async function () {
      const modeKey = currentModeKey();
      const mode = state.modes[modeKey];
      mode.lorebookName = ($(this).attr('data-lorebook-name') || '').trim();
      mode.loadedLorebookName = '';
      mode.searchText = '';
      mode.selectedEntryUids.clear();
      mode.readonlyEntryUids.clear();
      invalidateModeOutputs(modeKey);
      mode.currentStep = 'selection';
      hideLorebookSearchResults();
      persistSettings({ mirrorModeKey: modeKey });
      await loadEntriesForMode(modeKey, { force: true, resetSelection: true, clearOutputs: false });
      renderCurrentPanel();
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-refresh-entries', async () => {
      await loadEntriesForMode(currentModeKey(), { force: true, resetSelection: false, clearOutputs: false });
      renderCurrentPanel();
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-search', function () {
      const modeKey = currentModeKey();
      state.modes[modeKey].searchText = ($(this).val() || '').trim();
      renderEntryList(modeKey);
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
      state.modes[modeKey].selectedEntryUids.clear();
      state.modes[modeKey].readonlyEntryUids.clear();
      invalidateModeOutputs(modeKey);
      persistSettings({ mirrorModeKey: modeKey });
      renderEntryList(modeKey);
    })
    .on('change.aiWorkspaceDesktop', '.ai-entry-mode', function () {
      const modeKey = currentModeKey();
      setEntryMode(modeKey, Number($(this).attr('data-entry-uid')), ($(this).val() || 'none').trim());
      invalidateModeOutputs(modeKey);
      persistSettings({ mirrorModeKey: modeKey });
      renderSelectionSummary(modeKey);
    })
    .on('change.aiWorkspaceDesktop input.aiWorkspaceDesktop', '#ai-workspace-field-title, #ai-workspace-field-content, #ai-workspace-field-prompt, #ai-workspace-instruction, #ai-workspace-jailbreak-prompt-template, #ai-workspace-builtin-prompt-template, #ai-workspace-planning-prompt-template', () => {
      const modeKey = currentModeKey();
      captureModeInputs(modeKey);
      invalidateModeOutputs(modeKey);
      persistSettings({ mirrorModeKey: modeKey });
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-plan-json', () => {
      if (state.currentNav !== 'plan') {
        return;
      }
      setModeStatus('plan', '规划已修改，离开输入框后保存。');
    })
    .on('change.aiWorkspaceDesktop', '#ai-workspace-plan-json', function () {
      if (state.currentNav !== 'plan') {
        return;
      }
      const modeKey = currentModeKey();
      try {
        state.modes[modeKey].planningResult = normalizePlanEditorValue($(this).val() || '{}');
        syncPlanSelectionFromPlanningResult(modeKey);
        clearPreview(modeKey, '规划已修改，请重新生成修改结果。');
        renderPlanningResult(modeKey);
        persistSettings({ mirrorModeKey: modeKey });
        setModeStatus(modeKey, '规划已更新，可继续确认并生成修改结果。');
      } catch (error) {
        setModeStatus(modeKey, `规划 JSON 无法解析：${error.message}`);
      }
    })
    .on('change.aiWorkspaceDesktop input.aiWorkspaceDesktop', '#ai-workspace-apiurl, #ai-workspace-apikey, #ai-workspace-model, #ai-workspace-stream', () => {
      persistSettings({ mirrorModeKey: currentModeKey() });
      ['direct', 'plan'].forEach(modeKey => {
        state.modes[modeKey].previewResult = null;
        state.modes[modeKey].debugInfo = {};
      });
      setSharedStatus('API 配置已变化，后续结果请重新生成。');
    })
    .on('change.aiWorkspaceDesktop', '#ai-workspace-source-select', () => {
      toggleCustomApi();
      persistSettings({ mirrorModeKey: currentModeKey() });
      setSharedStatus('API 配置已变化，后续结果请重新生成。');
    })
    .on('change.aiWorkspaceDesktop', 'input[name="ai-workspace-api-mode"]', () => {
      toggleCustomApi();
      persistSettings({ mirrorModeKey: currentModeKey() });
      setSharedStatus('API 配置已变化，后续结果请重新生成。');
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-load-models', event => {
      event.preventDefault();
      event.stopPropagation();
      void handleLoadModels();
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
    .on('click.aiWorkspaceDesktop', '#ai-workspace-preview-list .ai-preview-item', function () {
      openPreviewModal(Number($(this).attr('data-preview-uid')));
    })
    .on('click.aiWorkspaceDesktop', '#ai-workspace-preview-modal-close-button, #ai-workspace-preview-modal .ai-preview-modal-close', () => {
      closePreviewModal();
    })
    .on('input.aiWorkspaceDesktop', '#ai-workspace-preview-modal-content textarea[data-preview-field]', () => {
      if (state.currentNav !== 'direct' && state.currentNav !== 'plan') {
        return;
      }
      setModeStatus(currentModeKey(), '改造结果已修改，离开输入框后保存。');
    })
    .on('change.aiWorkspaceDesktop', '#ai-workspace-preview-modal-content textarea[data-preview-field]', function () {
      if (state.currentNav !== 'direct' && state.currentNav !== 'plan') {
        return;
      }

      const modeKey = currentModeKey();
      const mode = state.modes[modeKey];
      const uid = Number($(this).attr('data-preview-uid'));
      const field = ($(this).attr('data-preview-field') || '').trim();
      const item = mode.previewResult?.items?.find(previewItem => Number(previewItem?.uid) === uid);
      if (!item) {
        return;
      }

      item.afterEntry = _.cloneDeep(item.afterEntry || item.beforeEntry || {});
      item.afterEntry.strategy = item.afterEntry.strategy || {};

      try {
        const value = $(this).val() || '';
        if (field === 'title') {
          item.afterEntry.name = `${value}`.trim();
        } else if (field === 'content') {
          item.afterEntry.content = `${value}`;
        } else if (field === 'keywords') {
          item.afterEntry.strategy.keys = parseKeywordsEditorValue(value);
        }

        rebuildPreviewResult(modeKey);
        renderPreview(modeKey);
        $('#ai-workspace-preview-modal-title', parentDoc()).text(`${item.afterEntry.name || item.beforeEntry?.name || item.title || '条目'} (UID: ${item.uid})`);
        $('#ai-workspace-preview-modal-summary', parentDoc()).text(item.changed ? '你可以直接编辑右侧预览内容。' : '当前无实际变更，但你仍可直接编辑右侧预览内容。');
        persistSettings({ mirrorModeKey: modeKey });
        setModeStatus(modeKey, '改造结果已更新，可直接应用。');
      } catch (error) {
        setModeStatus(modeKey, `改造结果无法解析：${error.message}`);
      }
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
  ensureMarkup();
  if (!state.hydrated) {
    hydrateStateFromSettings();
  }
  renderCurrentPanel();
  if (state.initialized) {
    return;
  }
  bindEvents();
  state.initialized = true;
}

export function resetDesktopAiWorkspace() {
  hydrateStateFromSettings();
  state.worldbookNames = [];
  state.modelOptions = [];
  state.modelStatusText = '';
  state.sharedStatusText = '';
  state.isGenerating = false;
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
  ensureMarkup();
  renderCurrentPanel();

  await populateLorebooks();
  ensureModeLorebook('direct');
  ensureModeLorebook('plan');

  if (state.currentNav === 'direct' || state.currentNav === 'plan') {
    const modeKey = currentModeKey();
    await loadEntriesForMode(modeKey, {
      force: !state.modes[modeKey].entries.length || state.modes[modeKey].loadedLorebookName !== state.modes[modeKey].lorebookName,
      resetSelection: false,
      clearOutputs: false,
    });
  }

  persistSettings({ mirrorModeKey: currentModeKey() });
  renderCurrentPanel();
}, 'refreshDesktopAiWorkspace');
