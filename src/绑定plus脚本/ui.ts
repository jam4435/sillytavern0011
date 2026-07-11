/**
 * 用户设定脚本 - UI 创建和面板控制
 */

import YAML from 'yaml';
import { createScriptIdDiv, teleportStyle } from '../../util/script';
import {
  applyPersonaPlusBindings,
  applyPresetPromptEnabledSnapshot,
  buildContextBindingTarget,
  composePersonaDescription,
  createBindingPlusBackupFile,
  deleteBindingGroup,
  deleteChatContextBindingsByFileName,
  deleteContextBinding,
  deleteContextBindingById,
  deletePresetBindingReferences,
  extractBaseDescriptionFromComposed,
  ensurePresetExistsForBinding,
  findContextBinding,
  findPersonaByAvatarId,
  getBindingPlusStorageReport,
  getBindingPlusThemePresets,
  getApiConnectionDisplayState,
  getCachedCurrentConnectionProfileName,
  getCurrentPersonaFromDOM,
  getDefaultPresetName,
  getEnabledPresetPromptIds,
  getPersonaDefaultEnabledSharedTraitIds,
  getPersonaActivationState,
  getPersonaDefaultEnabledTraitIds,
  getPersonaListFromDOM,
  getPlusBindingCatalog,
  getPresetPromptStableId,
  getRuntimeContext,
  getRuntimeContextDebugInfo,
  getWorldbookEntryCatalog,
  importBindingPlusBackupFile,
  isPresetNameAvailable,
  loadBindingGroups,
  loadBindingPlusTheme,
  loadContextBindings,
  loadDefaultPresetPromptIds,
  loadDefaultWorldbookEnabledEntryUids,
  loadPersonaAdvancedConfig,
  loadPersonaBaseDescription,
  loadEnabledSharedTraitIds,
  loadPersonaSnapshots,
  loadPersonaTraits,
  loadSharedPersonaTraitsConfig,
  mergeBindingGroupResources,
  probePlusBindingInterfaces,
  pruneLegacyPersonaSnapshots,
  recordPersonaSnapshot,
  resetBindingPlusTheme,
  refreshConnectionProfileCatalog,
  runApiConfigSelfTest,
  resolveBindingPlusThemeTokens,
  restoreLastPersonaSnapshot,
  runCompatibilitySelfCheck,
  saveBindingPlusTheme,
  saveCurrentLoadedPresetPromptsAsDefaultSnapshot,
  savePresetPromptIdsAsDefaultSnapshot,
  saveDefaultWorldbookEnabledEntryUids,
  savePersonaAdvancedConfig,
  savePersonaBaseDescription,
  saveEnabledSharedTraitIds,
  savePersonaDefaultEnabledSharedTraitIds,
  savePersonaDefaultEnabledTraitIds,
  savePersonaTraits,
  saveSharedPersonaTraitsConfig,
  selectPersonaInParentUI,
  setDefaultPresetName,
  summarizeBindingPlusBackupImport,
  summarizeContextBindingResources,
  renameDefaultPresetPromptSnapshot,
  renamePresetBindingReferences,
  deletePresetDefaultSnapshotState,
  upsertBindingGroup,
  upsertContextBinding,
} from './handlers';
import {
  createLoadedPresetPromptMonitorState,
  LoadedPresetPromptMonitorState,
  shouldSyncLoadedPresetPromptDefaultSnapshot,
} from './presetPromptSync';
import { injectStyles, styles } from './styles';
import {
  BindingGroup,
  BindingPlusThemePreset,
  BindingPlusThemePresetId,
  BindingPlusThemeState,
  BindingPlusThemeTokens,
  CompatibilityCheckReport,
  PersonaPlusApiConfigTestReport,
  PERSONA_BUTTON_ICON,
  PERSONA_BUTTON_ID,
  PERSONA_BUTTON_TEXT_IN_MENU,
  PERSONA_BUTTON_TOOLTIP,
  PERSONA_PANEL_ID,
  PERSONA_PLUS_CHARACTER_CHANGED_EVENT,
  PERSONA_PLUS_CHAT_CHANGED_EVENT,
  PERSONA_PLUS_CONTEXT_CHANGED_EVENT,
  PersonaAutoRule,
  PersonaContextBinding,
  PersonaContextBindingResources,
  PersonaInfo,
  PersonaPlusBindingWorldbookEntry,
  PersonaPlusContextChangePayload,
  PersonaPlusEventState,
  PersonaPlusProbeReport,
  PersonaProfile,
  PersonaRuntimeContext,
  PersonaSharedFolder,
  PersonaSharedTrait,
  PersonaTrait,
} from './types';

const PANEL_EVENT_NAMESPACE = '.persona-panel-events';
let contextWatcherTimer: ReturnType<typeof setInterval> | null = null;
let lastContextSignature = '';
let baseDescDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastCompatibilityReport: CompatibilityCheckReport | null = null;
let lastPlusProbeReport: PersonaPlusProbeReport | null = null;
let lastApiConfigTestReport: PersonaPlusApiConfigTestReport | null = null;
let lastSnapshotPruneSummary: ReturnType<typeof pruneLegacyPersonaSnapshots> | null = null;
let plusEventBridgeStarted = false;
let lastObservedContext: PersonaRuntimeContext | null = null;
let loadedPresetPromptMonitorState: LoadedPresetPromptMonitorState | null = null;
let pendingOfficialPresetSave:
  | {
      presetName: string;
      startedAt: number;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  | null = null;
let officialPresetSaveStatus: {
  kind: 'idle' | 'pending' | 'synced' | 'unchanged' | 'timeout' | 'failed';
  presetName: string;
  detail: string;
  source: string;
  updatedAt: number;
} = {
  kind: 'idle',
  presetName: '',
  detail: '等待酒馆“更新当前预设”按钮触发。',
  source: '',
  updatedAt: 0,
};
let panelStyleDestroy: (() => void) | null = null;
let $panelContainer: JQuery<HTMLDivElement> | null = null;
let activeDetailPage: DetailPageKey = 'persona';
let personaSearchKeyword = '';
let activeBindingScope: 'chat' | 'character' = 'character';
let bindingPlusDeviceMode: BindingPlusDeviceMode = 'desktop';
let bindingPlusDrawerOpen = false;
let personaFolderDrawerOpen = false;
let activePersonaTraitScope: PersonaTraitScope = 'local';
const activeResourceSelection: Partial<Record<DetailPageKey, string>> = {};
const activePersonaFolderIdByAvatar = new Map<string, string>();
const PERSONA_UNGROUPED_FOLDER_ID = '__ungrouped__';
const BINDINGPLUS_THEME_SCOPE_CLASS = 'bindingplus-theme-scope';
const OFFICIAL_PRESET_SAVE_WAIT_MS = 12000;

const BINDINGPLUS_THEME_VAR_MAP: Record<keyof BindingPlusThemeTokens, string> = {
  panelBg: '--bp-panel-bg',
  panelBgSecondary: '--bp-panel-bg-secondary',
  cardBg: '--bp-card-bg',
  cardBgStrong: '--bp-card-bg-strong',
  textPrimary: '--bp-text-primary',
  textSecondary: '--bp-text-secondary',
  accent: '--bp-accent',
  accentHover: '--bp-accent-hover',
  border: '--bp-border',
  inputBg: '--bp-input-bg',
  inputBorder: '--bp-input-border',
  buttonBg: '--bp-button-bg',
  buttonBorder: '--bp-button-border',
  buttonText: '--bp-button-text',
  buttonHoverBg: '--bp-button-hover-bg',
  buttonHoverBorder: '--bp-button-hover-border',
  selectedBg: '--bp-selected-bg',
  selectedBorder: '--bp-selected-border',
  hoverBg: '--bp-hover-bg',
  success: '--bp-success',
  warning: '--bp-warning',
  danger: '--bp-danger',
  overlayBg: '--bp-overlay-bg',
  codeBg: '--bp-code-bg',
  codeBorder: '--bp-code-border',
};

const BINDINGPLUS_THEME_EDITABLE_TOKENS: Array<{
  key: keyof BindingPlusThemeTokens;
  label: string;
}> = [
  { key: 'panelBg', label: '面板背景' },
  { key: 'panelBgSecondary', label: '二级背景' },
  { key: 'cardBg', label: '卡片背景' },
  { key: 'textPrimary', label: '正文文字' },
  { key: 'textSecondary', label: '次级文字' },
  { key: 'accent', label: '强调色' },
  { key: 'border', label: '边框色' },
  { key: 'inputBg', label: '输入框背景' },
  { key: 'buttonBg', label: '按钮背景' },
];

type DetailPageKey =
  | 'persona'
  | 'preset'
  | 'api'
  | 'scripts'
  | 'regexes'
  | 'worldbooks'
  | 'groups'
  | 'extensions'
  | 'events';
type ScopedSelectionScope = 'global' | 'preset' | 'character';
type BindingPlusDeviceMode = 'desktop' | 'mobile';
type PersonaTraitScope = 'local' | 'shared';

const DETAIL_PAGE_DEFINITIONS: Array<{ key: DetailPageKey; label: string }> = [
  { key: 'persona', label: '用户人设' },
  { key: 'preset', label: '预设' },
  { key: 'api', label: 'API连接' },
  { key: 'scripts', label: '酒馆助手脚本' },
  { key: 'regexes', label: '酒馆正则' },
  { key: 'worldbooks', label: '世界书与条目' },
  { key: 'groups', label: '绑定组' },
  { key: 'events', label: '测试页' },
];

const PLUS_EVENT_DEFINITIONS: Array<Pick<PersonaPlusEventState, 'key' | 'label' | 'available' | 'detail'>> = [
  {
    key: 'official_chat_changed',
    label: '官方事件 CHAT_CHANGED',
    available:
      typeof eventOn === 'function' && typeof tavern_events !== 'undefined' && Boolean(tavern_events.CHAT_CHANGED),
    detail: '聊天切换的正式事件。',
  },
  {
    key: 'official_chat_deleted',
    label: '官方事件 CHAT_DELETED',
    available:
      typeof eventOn === 'function' && typeof tavern_events !== 'undefined' && Boolean(tavern_events.CHAT_DELETED),
    detail: '聊天删除后清理绑定plus里的聊天绑定。',
  },
  {
    key: 'official_character_page_loaded',
    label: '官方事件 CHARACTER_PAGE_LOADED',
    available:
      typeof eventOn === 'function' &&
      typeof tavern_events !== 'undefined' &&
      Boolean(tavern_events.CHARACTER_PAGE_LOADED),
    detail: '角色页加载事件，可作为角色切换候选信号。',
  },
  {
    key: 'official_character_edited',
    label: '官方事件 CHARACTER_EDITED',
    available:
      typeof eventOn === 'function' && typeof tavern_events !== 'undefined' && Boolean(tavern_events.CHARACTER_EDITED),
    detail: '角色编辑事件，不等于切换，但可辅助确认当前角色已刷新。',
  },
  {
    key: 'fallback_context_watcher',
    label: '后备聊天/角色差分',
    available: true,
    detail: '轮询对比 chatId/characterId，补足缺失的角色切换事件。',
  },
  {
    key: 'custom_context_changed',
    label: '自定义事件 persona_plus:context_changed',
    available: typeof eventOn === 'function' && typeof eventEmit === 'function',
    detail: '本插件统一派发的聊天/角色切换事件。',
  },
  {
    key: 'custom_chat_changed',
    label: '自定义事件 persona_plus:chat_changed',
    available: typeof eventOn === 'function' && typeof eventEmit === 'function',
    detail: '本插件统一派发的聊天切换事件。',
  },
  {
    key: 'custom_character_changed',
    label: '自定义事件 persona_plus:character_changed',
    available: typeof eventOn === 'function' && typeof eventEmit === 'function',
    detail: '本插件统一派发的角色切换事件。',
  },
];

const plusEventStates: Record<string, PersonaPlusEventState> = createInitialPlusEventStates();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getUiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message || '').trim() || '未知错误';
}

function showUiErrorToast(title: string, error: unknown): void {
  toastr.error(`${title}：${getUiErrorMessage(error)}`);
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const min = `${d.getMinutes()}`.padStart(2, '0');
  const ss = `${d.getSeconds()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function formatBackupFileTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  const hh = `${date.getHours()}`.padStart(2, '0');
  const min = `${date.getMinutes()}`.padStart(2, '0');
  const ss = `${date.getSeconds()}`.padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function formatStorageSize(bytes: number): string {
  const safeBytes = Math.max(0, bytes);
  if (safeBytes >= 1024 * 1024) {
    return `${(safeBytes / 1024 / 1024).toFixed(2)} MiB`;
  }
  if (safeBytes >= 1024) {
    return `${(safeBytes / 1024).toFixed(1)} KiB`;
  }
  return `${safeBytes} B`;
}

function getOfficialPresetSaveStatusLabel(
  kind: 'idle' | 'pending' | 'synced' | 'unchanged' | 'timeout' | 'failed',
): string {
  switch (kind) {
    case 'pending':
      return '等待宿主保存完成';
    case 'synced':
      return '已同步到默认快照';
    case 'unchanged':
      return '已确认与默认快照一致';
    case 'timeout':
      return '等待宿主保存超时';
    case 'failed':
      return '同步默认快照失败';
    case 'idle':
    default:
      return '待触发';
  }
}

function getOfficialPresetSaveStatusLevel(
  kind: 'idle' | 'pending' | 'synced' | 'unchanged' | 'timeout' | 'failed',
): 'ok' | 'warn' | 'danger' {
  switch (kind) {
    case 'synced':
    case 'unchanged':
      return 'ok';
    case 'pending':
    case 'idle':
    case 'timeout':
      return 'warn';
    case 'failed':
    default:
      return 'danger';
  }
}

function setOfficialPresetSaveStatus(
  kind: 'idle' | 'pending' | 'synced' | 'unchanged' | 'timeout' | 'failed',
  options: {
    presetName?: string;
    detail: string;
    source?: string;
  },
): void {
  officialPresetSaveStatus = {
    kind,
    presetName: (options.presetName || '').trim(),
    detail: options.detail,
    source: (options.source || '').trim(),
    updatedAt: Date.now(),
  };
  renderOfficialPresetSaveStatus();
  if ($panelContainer && activeDetailPage === 'events') {
    renderSidebarSecondaryList();
  }
}

function renderOfficialPresetSaveStatus(): void {
  const parentDoc = window.parent.document;
  const $summary = $('#persona-plus-preset-save-summary', parentDoc);
  const $details = $('#persona-plus-preset-save-details', parentDoc);
  if (!$summary.length || !$details.length) {
    return;
  }

  const label = getOfficialPresetSaveStatusLabel(officialPresetSaveStatus.kind);
  const level = getOfficialPresetSaveStatusLevel(officialPresetSaveStatus.kind);
  const icon = level === 'ok' ? '✅' : level === 'danger' ? '❌' : '⚠️';
  const metaParts = [label];
  if (officialPresetSaveStatus.presetName) {
    metaParts.push(`预设: ${officialPresetSaveStatus.presetName}`);
  }
  if (officialPresetSaveStatus.updatedAt > 0) {
    metaParts.push(`最近: ${formatTime(officialPresetSaveStatus.updatedAt)}`);
  }
  $summary.text(`官方保存同步: ${metaParts.join(' | ')}`);

  const sourceHtml = officialPresetSaveStatus.source
    ? `<div class="plus-probe-meta">${escapeHtml(`来源: ${officialPresetSaveStatus.source}`)}</div>`
    : '';
  $details.html(`
    <div class="plus-probe-item ${level}">
      <div>${icon} ${escapeHtml(label)}</div>
      <div class="plus-probe-meta">${escapeHtml(officialPresetSaveStatus.detail)}</div>
      ${sourceHtml}
    </div>
  `);
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error || new Error('读取文件失败'));
    };
    reader.readAsText(file, 'utf-8');
  });
}

function exportBindingPlusBackup(): void {
  try {
    const parentDoc = window.parent.document;
    const backup = createBindingPlusBackupFile();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = parentDoc.createElement('a');
    link.href = url;
    link.download = `bindingplus-backup-${formatBackupFileTimestamp(new Date(backup.exportedAt))}.json`;
    link.style.display = 'none';
    parentDoc.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toastr.success('绑定plus配置已导出');
  } catch (error) {
    showUiErrorToast('导出绑定plus配置失败', error);
  }
}

async function importBindingPlusBackupFromFile(file: File): Promise<void> {
  try {
    const text = await readTextFile(file);
    const parsed = JSON.parse(text) as unknown;
    const summary = importBindingPlusBackupFile(parsed);
    const summaryText = summarizeBindingPlusBackupImport(summary);

    renderSidebarSecondaryList();
    renderToolbarSelectionSummary();
    renderResourceDetailPages();
    renderBindingPlusThemeSection();
    applyBindingPlusThemeToDom(window.parent.document);
    renderPlusBindingSection();

    await applyPersonaPlusBindingsWithToast(
      getCurrentPersonaFromDOM()?.avatarId || getEditingAvatarId() || 'bindingplus',
      getRuntimeContext(),
      true,
      '导入配置后应用当前绑定失败',
    );
    renderBindingPlusStorageSection();

    toastr.success(`导入绑定plus配置完成：${summaryText}`);
  } catch (error) {
    showUiErrorToast('导入绑定plus配置失败', error);
  }
}

function isBindingPlusFollowSmartThemePreset(presetId: BindingPlusThemePresetId): boolean {
  return presetId === 'follow_smart_theme';
}

function isHexColorTokenValue(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test((value || '').trim());
}

function getBindingPlusThemePresetOptions(): BindingPlusThemePreset[] {
  return getBindingPlusThemePresets();
}

function getBindingPlusThemePresetByIdFromUi(presetId: string): BindingPlusThemePreset {
  return (
    getBindingPlusThemePresetOptions().find(preset => preset.id === presetId) || getBindingPlusThemePresetOptions()[0]
  );
}

function getBindingPlusThemeColorInputValue(
  preset: BindingPlusThemePreset,
  state: BindingPlusThemeState,
  tokenKey: keyof BindingPlusThemeTokens,
): string {
  const value =
    (state.useCustomOverrides ? state.customTokens[tokenKey] : undefined) || preset.tokens[tokenKey] || '#000000';
  return isHexColorTokenValue(value) ? value : '#000000';
}

function applyBindingPlusThemeToElement(
  $element: JQuery<HTMLElement>,
  tokens: BindingPlusThemeTokens = resolveBindingPlusThemeTokens(loadBindingPlusTheme()),
): void {
  if (!$element.length) {
    return;
  }

  (Object.entries(BINDINGPLUS_THEME_VAR_MAP) as Array<[keyof BindingPlusThemeTokens, string]>).forEach(
    ([key, cssVar]) => {
      $element.css(cssVar, tokens[key]);
    },
  );
}

function applyBindingPlusThemeToDom(doc: Document = window.parent.document): void {
  const tokens = resolveBindingPlusThemeTokens(loadBindingPlusTheme());
  applyBindingPlusThemeToElement($(`#${PERSONA_PANEL_ID}`, doc), tokens);
  $(`.${BINDINGPLUS_THEME_SCOPE_CLASS}`, doc).each(function () {
    applyBindingPlusThemeToElement($(this) as JQuery<HTMLElement>, tokens);
  });
}

function applyBindingPlusModalPresentation($modal: JQuery<HTMLElement>): void {
  $modal.toggleClass('bindingplus-mobile-modal', isBindingPlusMobileLayout());
}

function isBindingPlusMobileLayout(): boolean {
  const parentWindow = window.parent;
  const viewportWidth = parentWindow.innerWidth || window.innerWidth || screen.width || 0;
  const viewportHeight = parentWindow.innerHeight || window.innerHeight || screen.height || 0;

  if (viewportHeight >= viewportWidth) {
    return true;
  }

  if (viewportHeight < 650) {
    return true;
  }

  return viewportWidth <= 900;
}

function applyBindingPlusLayoutState(): void {
  const parentDoc = window.parent.document;
  const $panel = $(`#${PERSONA_PANEL_ID}`, parentDoc);
  if (!$panel.length) {
    return;
  }

  $panel.attr('data-device-mode', bindingPlusDeviceMode);
  $panel.toggleClass('drawer-open', bindingPlusDeviceMode === 'mobile' && bindingPlusDrawerOpen);
  $panel.toggleClass('folder-drawer-open', bindingPlusDeviceMode === 'mobile' && personaFolderDrawerOpen);

  const $drawerButton = $('#persona-mobile-drawer-toggle-btn', parentDoc);
  $drawerButton
    .attr('aria-expanded', bindingPlusDeviceMode === 'mobile' && bindingPlusDrawerOpen ? 'true' : 'false')
    .text(bindingPlusDeviceMode === 'mobile' && bindingPlusDrawerOpen ? '关闭资源' : '资源');

  const $folderButton = $('#persona-mobile-folder-toggle-btn', parentDoc);
  $folderButton
    .attr('aria-expanded', bindingPlusDeviceMode === 'mobile' && personaFolderDrawerOpen ? 'true' : 'false')
    .text(bindingPlusDeviceMode === 'mobile' && personaFolderDrawerOpen ? '关闭文件夹' : '切换文件夹');
}

function toggleBindingPlusDrawer(open?: boolean): void {
  bindingPlusDrawerOpen = typeof open === 'boolean' ? open : !bindingPlusDrawerOpen;
  if (bindingPlusDeviceMode !== 'mobile') {
    bindingPlusDrawerOpen = false;
  }
  applyBindingPlusLayoutState();
}

function togglePersonaFolderDrawer(open?: boolean): void {
  personaFolderDrawerOpen = typeof open === 'boolean' ? open : !personaFolderDrawerOpen;
  if (bindingPlusDeviceMode !== 'mobile' || activeDetailPage !== 'persona') {
    personaFolderDrawerOpen = false;
  }
  applyBindingPlusLayoutState();
}

function syncBindingPlusLayoutMode(): void {
  bindingPlusDeviceMode = isBindingPlusMobileLayout() ? 'mobile' : 'desktop';
  if (bindingPlusDeviceMode !== 'mobile') {
    bindingPlusDrawerOpen = false;
    personaFolderDrawerOpen = false;
  }
  if (activeDetailPage !== 'persona') {
    personaFolderDrawerOpen = false;
  }
  applyBindingPlusLayoutState();
  $('.pool-edit-modal.bindingplus-theme-scope', window.parent.document).each(function () {
    $(this).toggleClass('bindingplus-mobile-modal', bindingPlusDeviceMode === 'mobile');
  });
}

function saveAndApplyBindingPlusThemeState(
  nextState: BindingPlusThemeState,
  options: { rerender?: boolean; successMessage?: string } = {},
): boolean {
  if (!saveBindingPlusTheme(nextState)) {
    toastr.error('保存绑定plus 主题失败');
    return false;
  }

  applyBindingPlusThemeToDom(window.parent.document);
  if (options.rerender !== false) {
    renderBindingPlusThemeSection();
  }
  if (options.successMessage) {
    toastr.success(options.successMessage);
  }
  return true;
}

function createInitialPlusEventStates(): Record<string, PersonaPlusEventState> {
  return Object.fromEntries(
    PLUS_EVENT_DEFINITIONS.map(item => [
      item.key,
      {
        ...item,
        triggerCount: 0,
        lastTriggeredAt: null,
      },
    ]),
  );
}

function buildContextSignature(context: PersonaRuntimeContext = getRuntimeContext()): string {
  return `${context.chatId}|${context.chatName}|${context.characterId}|${context.characterName}`;
}

function getEditingAvatarId(): string {
  const parentDoc = window.parent.document;
  return ($('#edit-persona-avatar', parentDoc).val() as string | undefined) || '';
}

function getCurrentContextBinding(
  scope: 'chat' | 'character',
  context = getRuntimeContext(),
): PersonaContextBinding | null {
  return findContextBinding(scope, context, loadContextBindings());
}

function getActiveEditingBinding(context = getRuntimeContext()): PersonaContextBinding | null {
  return getCurrentContextBinding(activeBindingScope, context);
}

function ensureCurrentContextBinding(
  scope: 'chat' | 'character',
  context = getRuntimeContext(),
): PersonaContextBinding | null {
  const existing = getCurrentContextBinding(scope, context);
  if (existing) {
    return existing;
  }

  const binding = upsertContextBinding(scope, {}, context);
  return binding;
}

function getBindingTargetDisplay(scope: 'chat' | 'character', context = getRuntimeContext()): string {
  return buildContextBindingTarget(scope, context).targetName;
}

function syncActiveBindingScope(): void {
  const runtime = getRuntimeContext();
  const hasActiveScopeBinding = Boolean(getCurrentContextBinding(activeBindingScope, runtime));
  if (hasActiveScopeBinding) {
    return;
  }
  activeBindingScope = getCurrentContextBinding('chat', runtime) ? 'chat' : 'character';
}

function getContextChangeFlags(
  previous: PersonaRuntimeContext,
  current: PersonaRuntimeContext,
): { chat: boolean; character: boolean } {
  return {
    chat: previous.chatId !== current.chatId || previous.chatName !== current.chatName,
    character: previous.characterId !== current.characterId || previous.characterName !== current.characterName,
  };
}

function markPlusEventTriggered(key: string, detail: string): void {
  const state = plusEventStates[key];
  if (!state) {
    return;
  }

  state.triggerCount += 1;
  state.lastTriggeredAt = Date.now();
  state.detail = detail;
  renderPlusBindingSection();
}

function getContextBindingDisplayLabel(binding: PersonaContextBinding): string {
  const scopeLabel = binding.scope === 'chat' ? '聊天' : '角色';
  return `${scopeLabel}「${binding.targetName || binding.targetId || binding.id}」`;
}

async function refreshAfterContextBindingDeleted(reason: string): Promise<void> {
  syncActiveBindingScope();
  renderToolbarSelectionSummary();
  renderResourceDetailPages();
  renderPlusBindingSection();

  const currentContext = getRuntimeContext();
  const applied = await applyPersonaPlusBindingsWithToast(
    getCurrentPersonaFromDOM()?.avatarId || getEditingAvatarId() || '',
    currentContext,
    true,
    `${reason}后应用当前绑定失败`,
  );
  if (!applied) {
    return;
  }

  const currentPersona = getCurrentPersonaFromDOM();
  if (currentPersona?.avatarId) {
    await applyComposedDescriptionForAvatar(currentPersona.avatarId, `${reason}后自动同步`, {
      errorToastTitle: `${reason}后同步 user人设失败`,
    });
  }
  renderBindingPlusStorageSection();
}

async function deleteContextBindingFromUi(bindingId: string): Promise<void> {
  const normalizedId = (bindingId || '').trim();
  const binding = loadContextBindings().find(item => item.id === normalizedId);
  if (!binding) {
    toastr.warning('未找到目标绑定，可能已经被清理');
    renderPlusBindingSection();
    renderResourceDetailPages();
    return;
  }

  const label = getContextBindingDisplayLabel(binding);
  if (!confirm(`确定删除${label}的绑定吗？`)) {
    return;
  }

  if (!deleteContextBindingById(binding.id)) {
    toastr.error('删除绑定失败');
    return;
  }

  await refreshAfterContextBindingDeleted('删除绑定');
  toastr.success(`已删除${label}的绑定`);
}

function scheduleContextRefresh(source: string, delayMs: number = 120): void {
  window.setTimeout(() => {
    void handleContextChanged(source);
  }, delayMs);
}

function schedulePresetPromptMonitorRefresh(source: string, delayMs: number = 60): void {
  window.setTimeout(() => {
    syncLoadedPresetPromptDefaultSnapshot(source);
  }, delayMs);
}

function readLoadedPresetPromptMonitorState(): LoadedPresetPromptMonitorState | null {
  const loadedPresetName = getLoadedPresetNameSafe();
  if (!loadedPresetName) {
    return null;
  }

  try {
    return createLoadedPresetPromptMonitorState({
      loadedPresetName,
      livePromptIds: getEnabledPresetPromptIds('in_use'),
      savedPromptIds: getEnabledPresetPromptIds(loadedPresetName),
    });
  } catch (error) {
    console.warn('绑定plus: 读取当前预设保存监视器状态失败', error);
    return null;
  }
}

function refreshPresetUiAfterStorageMutation(): void {
  if (!$panelContainer) {
    return;
  }

  invalidatePlusBindingCatalogCache();
  renderSidebarSecondaryList();
  renderResourceDetailPages();
}

function clearPendingOfficialPresetSave(): void {
  if (pendingOfficialPresetSave?.timeoutId) {
    window.clearTimeout(pendingOfficialPresetSave.timeoutId);
  }
  pendingOfficialPresetSave = null;
}

function markPendingOfficialPresetSave(source: string): void {
  const presetName = getLoadedPresetNameSafe();
  if (!presetName) {
    return;
  }

  clearPendingOfficialPresetSave();
  setOfficialPresetSaveStatus('pending', {
    presetName,
    detail: '已点击酒馆“更新当前预设”，正在等待宿主保存完成并回到前端事件链。',
    source,
  });
  pendingOfficialPresetSave = {
    presetName,
    startedAt: Date.now(),
    timeoutId: window.setTimeout(() => {
      if (!pendingOfficialPresetSave || pendingOfficialPresetSave.presetName !== presetName) {
        return;
      }

      console.info('绑定plus: 等待宿主更新当前预设完成超时，放弃本次默认条目快照同步', {
        source,
        presetName,
      });
      setOfficialPresetSaveStatus('timeout', {
        presetName,
        detail: `已点击酒馆“更新当前预设”，但 ${OFFICIAL_PRESET_SAVE_WAIT_MS / 1000} 秒内未等到宿主 PRESET_CHANGED(openai) 完成信号。`,
        source,
      });
      pendingOfficialPresetSave = null;
    }, OFFICIAL_PRESET_SAVE_WAIT_MS),
  };
}

function finalizePendingOfficialPresetSave(source: string, presetNameFromEvent?: string): void {
  const pendingSave = pendingOfficialPresetSave;
  if (!pendingSave) {
    return;
  }

  const eventPresetName = (presetNameFromEvent || '').trim();
  if (eventPresetName && eventPresetName !== pendingSave.presetName) {
    return;
  }

  clearPendingOfficialPresetSave();

  const syncResult = savePresetPromptIdsAsDefaultSnapshot(pendingSave.presetName, getEnabledPresetPromptIds('in_use'));
  loadedPresetPromptMonitorState = readLoadedPresetPromptMonitorState();
  if (!syncResult.ok || !syncResult.presetName) {
    console.warn('绑定plus: 宿主更新当前预设后同步默认条目快照失败', {
      source,
      presetName: pendingSave.presetName,
    });
    setOfficialPresetSaveStatus('failed', {
      presetName: pendingSave.presetName,
      detail: '已收到宿主保存完成信号，但绑定plus 写入默认预设条目快照失败。',
      source,
    });
    return;
  }

  console.info('绑定plus: 已根据宿主更新当前预设操作同步默认条目快照', {
    source,
    presetName: syncResult.presetName,
    changed: syncResult.changed,
    count: syncResult.count,
  });
  setOfficialPresetSaveStatus(syncResult.changed ? 'synced' : 'unchanged', {
    presetName: syncResult.presetName,
    detail: syncResult.changed
      ? `已把当前 in_use 的 ${syncResult.count} 条启用 prompt 同步到绑定plus 默认预设条目快照。`
      : `宿主保存完成，当前预设的 ${syncResult.count} 条启用 prompt 与绑定plus 默认快照本来就一致。`,
    source,
  });

  if (
    $panelContainer &&
    activeDetailPage === 'preset' &&
    (activeResourceSelection.preset || '').trim() === syncResult.presetName
  ) {
    renderPresetPromptDefaultSnapshotState();
    syncPresetPromptControlsFromLoadedPreset();
  }
}

function syncLoadedPresetPromptDefaultSnapshot(source: string): void {
  const currentState = readLoadedPresetPromptMonitorState();
  const shouldSync = shouldSyncLoadedPresetPromptDefaultSnapshot(loadedPresetPromptMonitorState, currentState);
  loadedPresetPromptMonitorState = currentState;
  if (!shouldSync) {
    return;
  }

  const syncResult = saveCurrentLoadedPresetPromptsAsDefaultSnapshot();
  if (!syncResult.ok || !syncResult.presetName) {
    console.warn('绑定plus: 同步酒馆已保存预设的默认条目快照失败', {
      source,
      presetName: syncResult.presetName,
      count: syncResult.count,
    });
    return;
  }

  console.info('绑定plus: 已同步酒馆保存后的默认预设条目快照', {
    source,
    presetName: syncResult.presetName,
    changed: syncResult.changed,
    count: syncResult.count,
  });

  if (
    $panelContainer &&
    activeDetailPage === 'preset' &&
    (activeResourceSelection.preset || '').trim() === syncResult.presetName
  ) {
    renderPresetPromptDefaultSnapshotState();
    syncPresetPromptControlsFromLoadedPreset();
  }
}

async function emitPlusContextEvents(
  previous: PersonaRuntimeContext,
  current: PersonaRuntimeContext,
  source: string,
): Promise<void> {
  if (typeof eventEmit !== 'function') {
    return;
  }

  const changed = getContextChangeFlags(previous, current);
  const payload: PersonaPlusContextChangePayload = {
    source,
    observedAt: Date.now(),
    previous,
    current,
    changed,
  };

  await eventEmit(PERSONA_PLUS_CONTEXT_CHANGED_EVENT, payload);
  if (changed.chat) {
    await eventEmit(PERSONA_PLUS_CHAT_CHANGED_EVENT, payload);
  }
  if (changed.character) {
    await eventEmit(PERSONA_PLUS_CHARACTER_CHANGED_EVENT, payload);
  }
}

function startPlusEventBridge(): void {
  if (plusEventBridgeStarted || typeof eventOn !== 'function') {
    return;
  }

  plusEventBridgeStarted = true;
  lastObservedContext = getRuntimeContext();
  lastContextSignature = buildContextSignature(lastObservedContext);
  loadedPresetPromptMonitorState = readLoadedPresetPromptMonitorState();

  if (typeof tavern_events !== 'undefined') {
    eventOn(tavern_events.CHAT_CHANGED, chatFileName => {
      markPlusEventTriggered('official_chat_changed', `收到 chat_id_changed: ${String(chatFileName || '空')}`);
      scheduleContextRefresh('tavern_events.CHAT_CHANGED');
    });

    if (tavern_events.CHAT_DELETED) {
      eventOn(tavern_events.CHAT_DELETED, chatFileName => {
        const deletedChatFileName = String(chatFileName || '').trim();
        const removedBindings = deleteChatContextBindingsByFileName(deletedChatFileName);
        const detail = removedBindings.length
          ? `收到 chat_deleted: ${deletedChatFileName || '空'}，已清理 ${removedBindings.length} 个聊天绑定`
          : `收到 chat_deleted: ${deletedChatFileName || '空'}，未找到匹配聊天绑定`;
        markPlusEventTriggered('official_chat_deleted', detail);

        if (removedBindings.length > 0) {
          console.info(
            '绑定plus: 聊天删除后已清理聊天绑定',
            removedBindings.map(binding => ({
              id: binding.id,
              targetId: binding.targetId,
              targetName: binding.targetName,
            })),
          );
          toastr.info(`已清理 ${removedBindings.length} 个已删除聊天的绑定`);
          void refreshAfterContextBindingDeleted('清理已删除聊天绑定');
        }

        scheduleContextRefresh('tavern_events.CHAT_DELETED');
      });
    }

    eventOn(tavern_events.CHARACTER_PAGE_LOADED, () => {
      markPlusEventTriggered('official_character_page_loaded', '收到 character_page_loaded。');
      scheduleContextRefresh('tavern_events.CHARACTER_PAGE_LOADED', 180);
    });

    eventOn(tavern_events.CHARACTER_EDITED, result => {
      const characterName = result?.detail?.character?.name || result?.detail?.id || 'unknown';
      markPlusEventTriggered('official_character_edited', `收到 character_edited: ${String(characterName)}`);
      scheduleContextRefresh('tavern_events.CHARACTER_EDITED', 200);
    });

    if (tavern_events.SETTINGS_UPDATED) {
      eventOn(tavern_events.SETTINGS_UPDATED, () => {
        schedulePresetPromptMonitorRefresh('tavern_events.SETTINGS_UPDATED', 100);
      });
    }

    if (tavern_events.PRESET_CHANGED) {
      eventOn(tavern_events.PRESET_CHANGED, data => {
        if (String(data?.apiId || '').trim() === 'openai') {
          finalizePendingOfficialPresetSave('tavern_events.PRESET_CHANGED', String(data?.name || ''));
        }
        schedulePresetPromptMonitorRefresh('tavern_events.PRESET_CHANGED', 60);
      });
    }

    if (tavern_events.OAI_PRESET_CHANGED_AFTER) {
      eventOn(tavern_events.OAI_PRESET_CHANGED_AFTER, () => {
        schedulePresetPromptMonitorRefresh('tavern_events.OAI_PRESET_CHANGED_AFTER', 60);
      });
    }

    if (tavern_events.PRESET_RENAMED) {
      eventOn(tavern_events.PRESET_RENAMED, data => {
        const previousName = String(data?.oldName || '').trim();
        const nextName = String(data?.newName || '').trim();
        if (!previousName || !nextName || previousName === nextName) {
          return;
        }

        const renameResult = renameDefaultPresetPromptSnapshot(previousName, nextName);
        if (!renameResult.ok) {
          console.warn('绑定plus: 预设重命名后同步默认快照失败', { previousName, nextName });
        }
        const referenceRenameResult = renamePresetBindingReferences(previousName, nextName);
        if (!referenceRenameResult.ok) {
          console.warn('绑定plus: 预设重命名后同步绑定引用失败', { previousName, nextName });
        }

        if ((activeResourceSelection.preset || '').trim() === previousName) {
          activeResourceSelection.preset = nextName;
        }

        loadedPresetPromptMonitorState = readLoadedPresetPromptMonitorState();
        refreshPresetUiAfterStorageMutation();
      });
    }

    if (tavern_events.PRESET_DELETED) {
      eventOn(tavern_events.PRESET_DELETED, data => {
        const presetName = String(data?.name || '').trim();
        if (!presetName) {
          return;
        }

        const deleteResult = deletePresetDefaultSnapshotState(presetName);
        if (!deleteResult.ok) {
          console.warn('绑定plus: 预设删除后清理默认快照失败', { presetName });
        }
        const referenceDeleteResult = deletePresetBindingReferences(presetName);
        if (!referenceDeleteResult.ok) {
          console.warn('绑定plus: 预设删除后清理绑定引用失败', { presetName });
        }

        if ((activeResourceSelection.preset || '').trim() === presetName) {
          activeResourceSelection.preset = '';
        }

        loadedPresetPromptMonitorState = readLoadedPresetPromptMonitorState();
        refreshPresetUiAfterStorageMutation();
      });
    }
  }

  eventOn(PERSONA_PLUS_CONTEXT_CHANGED_EVENT, (payload: PersonaPlusContextChangePayload) => {
    const detail = `source=${payload.source} | chat=${payload.current.chatId || payload.current.chatName || '空'} | character=${payload.current.characterId || payload.current.characterName || '空'}`;
    markPlusEventTriggered('custom_context_changed', detail);
  });

  eventOn(PERSONA_PLUS_CHAT_CHANGED_EVENT, (payload: PersonaPlusContextChangePayload) => {
    const detail = `source=${payload.source} | ${payload.previous.chatId || payload.previous.chatName || '空'} -> ${payload.current.chatId || payload.current.chatName || '空'}`;
    markPlusEventTriggered('custom_chat_changed', detail);
  });

  eventOn(PERSONA_PLUS_CHARACTER_CHANGED_EVENT, (payload: PersonaPlusContextChangePayload) => {
    const detail = `source=${payload.source} | ${payload.previous.characterId || payload.previous.characterName || '空'} -> ${payload.current.characterId || payload.current.characterName || '空'}`;
    markPlusEventTriggered('custom_character_changed', detail);
  });
}

function createPanelHtml(): string {
  const resourceNavHtml = DETAIL_PAGE_DEFINITIONS.map(
    page => `
      <button class="persona-resource-nav-item ${page.key === activeDetailPage ? 'active' : ''}" data-page="${page.key}">
        ${escapeHtml(page.label)}
      </button>
    `,
  ).join('');

  return `
    <div class="persona-overlay ${BINDINGPLUS_THEME_SCOPE_CLASS}" id="persona-overlay"></div>
    <div id="${PERSONA_PANEL_ID}" class="${BINDINGPLUS_THEME_SCOPE_CLASS}" data-device-mode="${bindingPlusDeviceMode}">
      <button type="button" class="persona-drawer-backdrop" id="persona-drawer-backdrop" aria-label="关闭资源抽屉"></button>
      <div class="persona-content-wrapper">
        <div class="persona-list-panel">
            <div class="persona-sidebar-header">
              <div>
              <div class="persona-sidebar-title">绑定plus</div>
              <div class="persona-sidebar-subtitle">把 user 人设、预设、API连接、脚本、正则、世界书等资源绑定到当前聊天 / 当前 char。</div>
              </div>
            <button class="close-btn" id="persona-close-btn" title="关闭">×</button>
          </div>
          <div class="persona-sidebar-body">
            <div class="persona-resource-nav">${resourceNavHtml}</div>
            <div class="persona-sidebar-secondary">
              <div class="panel-title" id="persona-sidebar-section-title">用户人设</div>
              <div class="persona-sidebar-section-note" id="persona-sidebar-section-note">点击资源后，在这里查看对应的二级列表。</div>
              <div class="persona-sidebar-tools">
                <input
                  type="search"
                  class="persona-input persona-search-input"
                  id="persona-search-bar"
                  placeholder="搜索 user人设..."
                  value="${escapeHtml(personaSearchKeyword)}"
                >
                <button class="persona-btn" id="persona-refresh-btn" title="刷新当前资源列表">刷新</button>
              </div>
              <div id="persona-list-container" class="persona-list-container"></div>
            </div>
          </div>
        </div>

        <div class="persona-edit-panel">
          <input type="hidden" id="edit-persona-original-name">
          <input type="hidden" id="edit-persona-avatar">
          <input type="hidden" id="edit-persona-base-desc">
          <input type="hidden" id="persona-name-input">
          <div class="persona-detail-shell">
            <div class="persona-detail-toolbar">
              <div class="persona-detail-toolbar-primary">
                <button class="persona-btn persona-mobile-drawer-toggle-btn" id="persona-mobile-drawer-toggle-btn" type="button" aria-expanded="false">资源</button>
                <div class="persona-toolbar-selection" id="persona-toolbar-selection"></div>
              </div>
              <div class="persona-detail-actions">
                <button class="persona-btn" id="persona-lock-chat-btn" title="将当前选中项绑定到当前聊天；没有绑定时会自动创建">绑定到当前聊天</button>
                <button class="persona-btn" id="persona-lock-char-btn" title="将当前选中项绑定到当前角色；没有绑定时会自动创建">绑定到当前角色</button>
                <button class="persona-btn" id="binding-group-export-chat-btn" type="button" style="display:none;">把聊天绑定内容导出为绑定组</button>
                <button class="persona-btn" id="binding-group-export-character-btn" type="button" style="display:none;">把角色绑定内容导出为绑定组</button>
                <button class="persona-btn" id="persona-default-persona-btn" disabled>设为默认人设</button>
                <button class="persona-btn" id="persona-default-preset-btn" disabled>设为默认预设</button>
              </div>
            </div>

            <div id="persona-binding-pages-root" class="persona-page-bodies">
                <section id="persona-page-persona" class="persona-page-panel ${activeDetailPage === 'persona' ? 'active' : ''}">
                  <div class="persona-page-card">
                    <div class="panel-title compact">用户人设</div>
                    <div class="edit-form">
                      <div class="form-group">
                        <label for="edit-persona-name">名称</label>
                        <input type="text" class="persona-input" id="edit-persona-name" placeholder="角色名称">
                      </div>

                      <div class="form-group">
                        <label for="edit-persona-desc">基础设定（自动规则和预设会追加到最终描述）</label>
                        <textarea class="persona-textarea" id="edit-persona-desc" placeholder="输入角色基础设定..."></textarea>
                        <div class="persona-hint-row">
                          <span id="persona-auto-status">自动拼装状态: -</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="persona-page-card">
                    <div class="panel-title">
                      <span>条目与文件夹</span>
                      <div class="inline-actions">
                        <button class="persona-btn" id="persona-save-default-traits-btn" disabled>保存为默认条目状态</button>
                        <button class="persona-btn" id="persona-yaml-import-btn" title="通过 YAML 或 JSON 批量导入文件夹和条目">批量导入</button>
                        <button class="persona-btn" id="persona-folder-add-btn" title="添加文件夹">添加文件夹</button>
                        <button class="persona-btn" id="persona-trait-add-btn" title="添加新设定">添加条目</button>
                      </div>
                    </div>
                    <div class="persona-trait-scope-tabs" role="tablist" aria-label="条目范围">
                      <button type="button" class="persona-trait-scope-tab ${activePersonaTraitScope === 'local' ? 'active' : ''}" data-trait-scope="local">当前人设条目</button>
                      <button type="button" class="persona-trait-scope-tab ${activePersonaTraitScope === 'shared' ? 'active' : ''}" data-trait-scope="shared">通用条目</button>
                    </div>
                    <div class="persona-hint-row" id="persona-default-traits-status">默认条目状态：-</div>
                    <div id="persona-traits-container" class="persona-traits-container"></div>
                  </div>
                </section>

                <section id="persona-page-preset" class="persona-page-panel ${activeDetailPage === 'preset' ? 'active' : ''}">
                  <div id="persona-preset-page-body"></div>
                </section>

                <section id="persona-page-api" class="persona-page-panel ${activeDetailPage === 'api' ? 'active' : ''}">
                  <div id="persona-api-page-body"></div>
                </section>

                <section id="persona-page-scripts" class="persona-page-panel ${activeDetailPage === 'scripts' ? 'active' : ''}">
                  <div id="persona-scripts-page-body"></div>
                </section>

                <section id="persona-page-regexes" class="persona-page-panel ${activeDetailPage === 'regexes' ? 'active' : ''}">
                  <div id="persona-regexes-page-body"></div>
                </section>

                <section id="persona-page-worldbooks" class="persona-page-panel ${activeDetailPage === 'worldbooks' ? 'active' : ''}">
                  <div id="persona-worldbooks-page-body"></div>
                </section>

                <section id="persona-page-groups" class="persona-page-panel ${activeDetailPage === 'groups' ? 'active' : ''}">
                  <div id="persona-groups-page-body"></div>
                </section>

                <section id="persona-page-events" class="persona-page-panel ${activeDetailPage === 'events' ? 'active' : ''}">
                  <div class="persona-page-card bindingplus-theme-card">
                    <div class="panel-title compact">主题</div>
                    <div id="bindingplus-theme-card-body"></div>
                  </div>

                  <div class="persona-page-card">
                    <div class="panel-title">
                      <span>测试与诊断</span>
                      <div class="inline-actions">
                        <button class="persona-btn" id="persona-plus-refresh-btn" title="刷新 Plus 接口探测">刷新探测</button>
                        <button class="persona-btn" id="persona-plus-api-test-btn" title="测试 API 读取与回写当前值">测试API读写</button>
                        <button class="persona-btn" id="persona-plus-test-btn" title="测试切换事件桥">测试事件</button>
                      </div>
                    </div>
                    <div id="persona-plus-context-summary" class="text-note">当前聊天 / 当前角色: 未检测</div>
                    <div id="persona-plus-preset-save-summary" class="text-note">官方保存同步: 待触发</div>
                    <div id="persona-plus-probe-summary" class="text-note">接口: 未检测</div>
                    <div>
                      <div class="plus-probe-title">官方保存同步</div>
                      <div id="persona-plus-preset-save-details" class="persona-plus-list"></div>
                    </div>
                    <div class="persona-plus-grid">
                      <div>
                        <div class="plus-probe-title">切换事件</div>
                        <div id="persona-plus-event-details" class="persona-plus-list"></div>
                      </div>
                      <div>
                        <div class="plus-probe-title">目标接口</div>
                        <div id="persona-plus-interface-details" class="persona-plus-list"></div>
                      </div>
                    </div>
                    <div>
                      <div class="plus-probe-title">结论</div>
                      <div id="persona-plus-notes" class="persona-plus-list"></div>
                    </div>
                    <div>
                      <div class="plus-probe-title">API读写测试</div>
                      <div id="persona-plus-api-test-summary" class="text-note">未测试</div>
                      <div id="persona-plus-api-test-details" class="persona-plus-list"></div>
                      <div id="persona-plus-api-test-notes" class="persona-plus-list"></div>
                    </div>
                    <div>
                      <div class="plus-probe-title">绑定存储管理</div>
                      <div class="text-note">这里列出绑定plus保存的全部聊天/角色绑定。用于删除已经不存在的聊天残留绑定，也可以把绑定plus配置导出为 JSON 配置文件后再导入恢复。</div>
                      <div id="bindingplus-storage-size-summary" class="persona-plus-list"></div>
                      <div class="edit-actions-bar compact-toolbar">
                        <button class="persona-btn" id="bindingplus-backup-export-btn" type="button">导出配置</button>
                        <button class="persona-btn" id="bindingplus-backup-import-btn" type="button">导入配置</button>
                        <input id="bindingplus-backup-import-input" type="file" accept=".json,application/json" style="display:none;">
                      </div>
                      <div id="persona-context-binding-storage-list" class="persona-plus-list"></div>
                    </div>
                  </div>

                  <div class="persona-page-grid">
                    <div class="persona-page-card">
                      <div class="panel-title compact">变更保护</div>
                      <div id="persona-snapshot-info" class="text-note">请先在左侧选择一个 user 人设</div>
                      <div class="profile-toolbar compact-toolbar">
                        <button class="persona-btn" id="persona-rollback-btn">回滚上一版</button>
                        <button class="persona-btn" id="persona-snapshot-list-btn">查看快照</button>
                      </div>
                    </div>

                    <div class="persona-page-card">
                      <div class="panel-title">
                        <span>兼容性自检</span>
                        <button class="persona-btn" id="persona-compat-refresh-btn">重新检测</button>
                      </div>
                      <div id="persona-compat-summary" class="text-note">未检测</div>
                      <div id="persona-compat-details" class="persona-compat-details"></div>
                    </div>
                  </div>
                </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function createPersonaItemHtml(persona: PersonaInfo): string {
  const activeClass = persona.isSelected ? 'active' : '';
  const lockIcon = persona.isLockedToChat ? '🔒' : persona.isLockedToCharacter ? '🔗' : '';
  const defaultBadge = persona.isDefault ? '<span class="persona-default-badge">👑</span>' : '';
  const avatarSrc = persona.avatarId ? `/thumbnail?type=persona&file=${encodeURIComponent(persona.avatarId)}` : '';
  const defaultBadgeClass = persona.isDefault ? 'has-default-badge' : '';
  const safeName = escapeHtml(persona.name || '未命名');
  const safeDesc = escapeHtml(persona.description ? `${persona.description.slice(0, 24)}...` : '无描述');

  return `
    <div class="persona-list-item ${activeClass}" data-avatar-id="${escapeHtml(persona.avatarId || '')}">
      <div class="item-avatar-wrapper ${defaultBadgeClass}">
        ${persona.isDefault ? '<div class="default-avatar-ring"></div>' : ''}
        <img class="item-avatar" src="${avatarSrc}" alt="${safeName}" onerror="this.src='/public/logo.png'">
      </div>
      <div class="item-info">
        <div class="item-name">${safeName} ${lockIcon} ${defaultBadge}</div>
        <div class="item-desc">${safeDesc}</div>
      </div>
    </div>
  `;
}

function createPersonaTraitHtml(
  trait: PersonaTrait,
  effectiveTraitIds: Set<string>,
  options?: {
    scope?: PersonaTraitScope;
    extraClass?: string;
    isRuleMatched?: boolean;
    isBoundToCurrentChat?: boolean;
    isBoundToCurrentCharacter?: boolean;
  },
): string {
  const scope = options?.scope || 'local';
  const isManualEnabled = trait.enabled;
  const isEffectiveEnabled = effectiveTraitIds.has(trait.id);
  const isAutoEnabled = isEffectiveEnabled && !isManualEnabled;
  const enabledClass = isEffectiveEnabled ? 'enabled' : 'disabled';
  const autoBoundClass = options?.isRuleMatched ? ' auto-bound' : '';
  const sharedClass = scope === 'shared' ? ' shared-trait' : '';
  const extraClass = options?.extraClass ? ` ${options.extraClass}` : '';
  const stateTag = isAutoEnabled
    ? '<span class="state-tag auto">自动</span>'
    : isManualEnabled
      ? '<span class="state-tag manual">手动</span>'
      : '<span class="state-tag off">关闭</span>';
  const scopeTag = scope === 'shared' ? '<span class="state-tag shared">通用</span>' : '';
  const safeName = escapeHtml(trait.name);
  const safeDesc = escapeHtml(truncatePreviewText(trait.description || '', 180)) || '无描述';

  return `
    <div class="persona-trait-item ${enabledClass}${autoBoundClass}${sharedClass}${extraClass}" data-id="${escapeHtml(trait.id)}" data-trait-scope="${scope}">
      <div class="trait-item-main">
        <div class="trait-item-header">
          <div class="trait-item-name">${safeName}</div>
          <div class="trait-item-state">
            ${scopeTag}
            ${stateTag}
            <input type="checkbox" class="trait-toggle-checkbox" ${isManualEnabled ? 'checked' : ''} title="手动启用/禁用">
          </div>
        </div>
        <div class="trait-item-desc">${safeDesc}</div>
      </div>
      <div class="trait-item-actions">
        <button class="trait-btn edit" data-id="${escapeHtml(trait.id)}" data-trait-scope="${scope}" title="编辑">✏️</button>
        <button class="trait-btn delete" data-id="${escapeHtml(trait.id)}" data-trait-scope="${scope}" title="删除">🗑️</button>
      </div>
    </div>
  `;
}

function findTraitRule(config: ReturnType<typeof loadPersonaAdvancedConfig>, traitId: string): PersonaAutoRule | null {
  return (
    config.rules.find(
      rule => rule.traitIds.length === 1 && rule.traitIds[0] === traitId && rule.profileIds.length === 0,
    ) || null
  );
}

function buildContextBindingPattern(scope: 'chat' | 'character', context = getRuntimeContext()): string {
  return scope === 'character'
    ? `${context.characterId} ${context.characterName}`.trim()
    : `${context.chatId} ${context.chatName}`.trim();
}

function normalizeProfileDisplayName(name: string): string {
  const normalized = (name || '').trim();
  if (!normalized) {
    return '未命名文件夹';
  }
  if (normalized.startsWith('聊天联动方案')) {
    return normalized.replace(/^聊天联动方案/, '聊天文件夹');
  }
  if (normalized.startsWith('角色联动方案')) {
    return normalized.replace(/^角色联动方案/, '角色文件夹');
  }
  return normalized;
}

type PersonaFolderView = {
  id: string;
  name: string;
  traitIds: string[];
  isUngrouped: boolean;
  source?: PersonaProfile | PersonaSharedFolder;
};

function getPersonaFolderStateKey(avatarId: string, scope: PersonaTraitScope = activePersonaTraitScope): string {
  return scope === 'shared' ? '__shared_persona_traits__' : avatarId;
}

function buildPersonaFolderViews(
  traits: Array<Pick<PersonaTrait | PersonaSharedTrait, 'id'>>,
  folders: Array<Pick<PersonaProfile | PersonaSharedFolder, 'id' | 'name' | 'traitIds'>>,
): PersonaFolderView[] {
  const validTraitIdSet = new Set(traits.map(trait => trait.id));
  const groupedTraitIds = new Set(folders.flatMap(folder => folder.traitIds));
  const ungroupedTraitIds = traits.filter(trait => !groupedTraitIds.has(trait.id)).map(trait => trait.id);
  return [
    {
      id: PERSONA_UNGROUPED_FOLDER_ID,
      name: '未分组条目',
      traitIds: ungroupedTraitIds,
      isUngrouped: true,
    },
    ...folders.map(folder => ({
      id: folder.id,
      name: normalizeProfileDisplayName(folder.name),
      traitIds: folder.traitIds.filter(traitId => validTraitIdSet.has(traitId)),
      isUngrouped: false,
      source: folder,
    })),
  ];
}

function ensureActivePersonaFolderId(
  avatarId: string,
  folders: PersonaFolderView[],
  scope: PersonaTraitScope = activePersonaTraitScope,
): string {
  const stateKey = getPersonaFolderStateKey(avatarId, scope);
  const currentFolderId = (activePersonaFolderIdByAvatar.get(stateKey) || '').trim();
  if (folders.some(folder => folder.id === currentFolderId)) {
    return currentFolderId;
  }

  const preferredFolder =
    folders.find(folder => !folder.isUngrouped && folder.traitIds.length > 0) ||
    folders.find(folder => folder.traitIds.length > 0) ||
    folders[0];
  const nextFolderId = preferredFolder?.id || PERSONA_UNGROUPED_FOLDER_ID;
  activePersonaFolderIdByAvatar.set(stateKey, nextFolderId);
  return nextFolderId;
}

function setActivePersonaFolderId(
  avatarId: string,
  folderId: string,
  scope: PersonaTraitScope = activePersonaTraitScope,
): void {
  if (!avatarId) {
    return;
  }
  activePersonaFolderIdByAvatar.set(getPersonaFolderStateKey(avatarId, scope), folderId || PERSONA_UNGROUPED_FOLDER_ID);
}

function createPersonaFolderNavItemHtml(folder: PersonaFolderView, selected: boolean, scope: PersonaTraitScope): string {
  return `
    <div class="persona-folder-nav-row ${selected ? 'selected' : ''}" data-folder-id="${escapeHtml(folder.id)}" data-trait-scope="${scope}">
      <button type="button" class="persona-folder-nav-item" data-folder-id="${escapeHtml(folder.id)}" data-trait-scope="${scope}">
        <span class="persona-folder-nav-name">${escapeHtml(folder.name)}</span>
        <span class="persona-folder-nav-meta">${folder.traitIds.length} 条</span>
      </button>
      ${
        folder.isUngrouped
          ? ''
          : `
            <div class="persona-folder-nav-actions">
              <button type="button" class="trait-btn persona-folder-nav-action" data-action="edit" data-profile-id="${escapeHtml(folder.id)}" data-trait-scope="${scope}" title="编辑文件夹">✏️</button>
              <button type="button" class="trait-btn persona-folder-nav-action" data-action="delete" data-profile-id="${escapeHtml(folder.id)}" data-trait-scope="${scope}" title="删除文件夹">🗑️</button>
            </div>
          `
      }
    </div>
  `;
}

function getPersonaManualEnabledTraitIds(avatarId: string): string[] {
  return loadPersonaTraits(avatarId)
    .filter(trait => trait.enabled)
    .map(trait => trait.id);
}

function getPersonaEnabledSharedTraitIds(avatarId: string): string[] {
  return loadEnabledSharedTraitIds(avatarId);
}

function isTraitRuleBoundToCurrentContext(
  traitRule: PersonaAutoRule | null,
  scope: 'chat' | 'character',
  context = getRuntimeContext(),
): boolean {
  const pattern = buildContextBindingPattern(scope, context);
  if (!traitRule?.enabled || traitRule.scope !== scope || traitRule.matchMode !== 'equals' || !pattern) {
    return false;
  }
  return traitRule.pattern.trim().toLowerCase() === pattern.toLowerCase();
}

function getSidebarSectionMeta(): { title: string; note: string; placeholder: string } {
  switch (activeDetailPage) {
    case 'persona':
      return {
        title: '用户人设',
        note: '点击一个 user 人设后，右侧直接显示该人设详情和对应文件夹。',
        placeholder: '搜索 user人设...',
      };
    case 'preset':
      return {
        title: '预设',
        note: '点击具体预设后，右侧显示哪些聊天/角色绑定在使用它。',
        placeholder: '搜索预设...',
      };
    case 'api':
      return {
        title: 'API连接',
        note: '这里绑定的是酒馆 connection profile。请先在酒馆里创建 profile，再在这里选择并绑定。',
        placeholder: '搜索 connection profile...',
      };
    case 'scripts':
      return {
        title: '酒馆助手脚本',
        note: '点击脚本后，右侧显示哪些聊天/角色绑定在使用它。',
        placeholder: '搜索脚本...',
      };
    case 'regexes':
      return {
        title: '酒馆正则',
        note: '点击正则后，右侧显示哪些聊天/角色绑定在使用它。',
        placeholder: '搜索正则...',
      };
    case 'worldbooks':
      return {
        title: '世界书与条目',
        note: '先选世界书，再在右侧查看条目详情和绑定情况。',
        placeholder: '搜索世界书...',
      };
    case 'groups':
      return {
        title: '绑定组',
        note: '这里保存可复用的整套绑定资源快照，可导出当前聊天/角色绑定，也可再应用回去。',
        placeholder: '搜索绑定组...',
      };
    case 'events':
      return {
        title: '测试页',
        note: '这里集中放主题、保存同步显示、切换检测、接口探测、兼容性自检、变更保护。',
        placeholder: '搜索测试项...',
      };
    default:
      return {
        title: '用户人设',
        note: '点击一个 user 人设后，右侧直接显示该人设详情和对应文件夹。',
        placeholder: '搜索 user人设...',
      };
  }
}

function createSidebarIndexItemHtml(
  label: string,
  meta: string,
  options?: {
    selected?: boolean;
    interactive?: boolean;
    action?: string;
    value?: string;
  },
): string {
  const action = options?.action ? ` data-action="${escapeHtml(options.action)}"` : '';
  const value = options?.value ? ` data-value="${escapeHtml(options.value)}"` : '';
  const selectedClass = options?.selected ? ' selected' : '';
  const interactiveClass = options?.interactive ? ' interactive' : '';
  return `
    <div class="persona-index-item${selectedClass}${interactiveClass}"${action}${value}>
      <div class="persona-index-item-title">${escapeHtml(label)}</div>
      <div class="persona-index-item-meta">${escapeHtml(meta)}</div>
    </div>
  `;
}

function filterNamedOptions(
  options: Array<{ id: string; label: string; meta?: string; selected?: boolean; action?: string }>,
): Array<{ id: string; label: string; meta?: string; selected?: boolean; action?: string }> {
  const keyword = personaSearchKeyword.trim().toLowerCase();
  if (!keyword) {
    return options;
  }
  return options.filter(option => `${option.label}\n${option.meta || ''}`.toLowerCase().includes(keyword));
}

function buildScopedSelectionValue(scope: ScopedSelectionScope, id: string): string {
  return `${scope}:${id}`;
}

function parseScopedSelectionValue(value: string): { scope: ScopedSelectionScope; id: string } {
  const separatorIndex = value.indexOf(':');
  if (separatorIndex === -1) {
    return { scope: 'global', id: value };
  }

  const scope = value.slice(0, separatorIndex) as ScopedSelectionScope;
  const id = value.slice(separatorIndex + 1);
  return {
    scope: scope === 'preset' || scope === 'character' ? scope : 'global',
    id,
  };
}

function contextBindingReferencesResource(
  binding: PersonaContextBinding,
  page: DetailPageKey,
  selectionId: string,
): boolean {
  const resources = binding.resources;
  if (!selectionId) {
    return false;
  }

  if (page === 'preset') {
    return resources.presetName === selectionId;
  }

  if (page === 'api') {
    return resources.connectionProfileName === selectionId;
  }

  if (page === 'scripts') {
    const { scope, id } = parseScopedSelectionValue(selectionId);
    return Boolean(resources.scripts?.[scope]?.includes(id));
  }

  if (page === 'regexes') {
    const { scope, id } = parseScopedSelectionValue(selectionId);
    return Boolean(resources.regexes?.[scope]?.includes(id));
  }

  if (page === 'worldbooks') {
    return Boolean(
      resources.worldbooks?.global?.includes(selectionId) ||
      resources.worldbooks?.characterPrimary === selectionId ||
      resources.worldbooks?.characterAdditional?.includes(selectionId) ||
      resources.worldbooks?.chat === selectionId ||
      resources.worldbookEntries?.some(entry => entry.worldbookName === selectionId),
    );
  }

  if (page === 'extensions') {
    return Boolean(resources.extensions?.some(item => item.extensionId === selectionId));
  }

  if (page === 'persona') {
    return resources.userPersonaAvatarId === selectionId;
  }

  return false;
}

function getReferencedBindings(page: DetailPageKey, selectionId: string): PersonaContextBinding[] {
  if (!selectionId) {
    return [];
  }
  return loadContextBindings().filter(binding => contextBindingReferencesResource(binding, page, selectionId));
}

function ensureActiveResourceSelection(page: DetailPageKey, values: string[]): string {
  const nextValue = values.includes(activeResourceSelection[page] || '')
    ? activeResourceSelection[page] || ''
    : values[0] || '';
  activeResourceSelection[page] = nextValue;
  return nextValue;
}

function renderToolbarSelectionSummary(): void {
  const parentDoc = window.parent.document;
  const $target = $('#persona-toolbar-selection', parentDoc);
  if (!$target.length) {
    return;
  }

  const runtime = getRuntimeContext();
  const characterBinding = getCurrentContextBinding('character', runtime);
  const chatBinding = getCurrentContextBinding('chat', runtime);
  const characterValue = summarizeContextBindingResources(characterBinding?.resources);
  const chatValue = summarizeContextBindingResources(chatBinding?.resources);

  $target
    .html(
      `
      <div class="persona-toolbar-binding-lines active">
        <button class="persona-toolbar-binding-line ${activeBindingScope === 'character' ? 'selected' : ''}" data-binding-scope="character" type="button">
          <span class="persona-toolbar-binding-key">当前角色</span>
          <span class="persona-toolbar-binding-value">${escapeHtml(characterValue)}</span>
        </button>
        <button class="persona-toolbar-binding-line ${activeBindingScope === 'chat' ? 'selected' : ''}" data-binding-scope="chat" type="button">
          <span class="persona-toolbar-binding-key">当前聊天</span>
          <span class="persona-toolbar-binding-value">${escapeHtml(chatValue)}</span>
        </button>
      </div>
    `,
    )
    .addClass('active');

  renderToolbarActionButtons();
}

function renderSidebarSecondaryList(): void {
  const parentDoc = window.parent.document;
  const $title = $('#persona-sidebar-section-title', parentDoc);
  const $note = $('#persona-sidebar-section-note', parentDoc);
  const $search = $('#persona-search-bar', parentDoc);
  const $container = $('#persona-list-container', parentDoc);
  const meta = getSidebarSectionMeta();

  $title.text(meta.title);
  $note.text(meta.note);
  $search.attr('placeholder', meta.placeholder);
  $container.empty();

  if (activeDetailPage === 'persona') {
    void renderPersonaList(!getEditingAvatarId());
    return;
  }

  const catalog = getCachedPlusBindingCatalog();
  let items: Array<{ id: string; label: string; meta: string }> = [];

  if (activeDetailPage === 'preset') {
    items = catalog.presets.map(option => ({
      id: option.id,
      label: option.label,
      meta: `${getReferencedBindings('preset', option.id).length} 个绑定使用`,
    }));
  } else if (activeDetailPage === 'api') {
    items = catalog.connectionProfiles.map(option => ({
      id: option.id,
      label: option.label,
      meta: `${getReferencedBindings('api', option.id).length} 个绑定使用`,
    }));
  } else if (activeDetailPage === 'scripts') {
    items = [
      ...catalog.scripts.global.map(option => ({
        id: buildScopedSelectionValue('global', option.id),
        label: option.label,
        meta: `global · ${getReferencedBindings('scripts', buildScopedSelectionValue('global', option.id)).length} 个绑定使用`,
      })),
      ...catalog.scripts.preset.map(option => ({
        id: buildScopedSelectionValue('preset', option.id),
        label: option.label,
        meta: `preset · ${getReferencedBindings('scripts', buildScopedSelectionValue('preset', option.id)).length} 个绑定使用`,
      })),
      ...catalog.scripts.character.map(option => ({
        id: buildScopedSelectionValue('character', option.id),
        label: option.label,
        meta: `character · ${getReferencedBindings('scripts', buildScopedSelectionValue('character', option.id)).length} 个绑定使用`,
      })),
    ];
  } else if (activeDetailPage === 'regexes') {
    items = [
      ...catalog.regexes.global.map(option => ({
        id: buildScopedSelectionValue('global', option.id),
        label: option.label,
        meta: `global · ${getReferencedBindings('regexes', buildScopedSelectionValue('global', option.id)).length} 个绑定使用`,
      })),
      ...catalog.regexes.preset.map(option => ({
        id: buildScopedSelectionValue('preset', option.id),
        label: option.label,
        meta: `preset · ${getReferencedBindings('regexes', buildScopedSelectionValue('preset', option.id)).length} 个绑定使用`,
      })),
      ...catalog.regexes.character.map(option => ({
        id: buildScopedSelectionValue('character', option.id),
        label: option.label,
        meta: `character · ${getReferencedBindings('regexes', buildScopedSelectionValue('character', option.id)).length} 个绑定使用`,
      })),
    ];
  } else if (activeDetailPage === 'worldbooks') {
    items = catalog.worldbooks.map(option => ({
      id: option.id,
      label: option.label,
      meta: `${getReferencedBindings('worldbooks', option.id).length} 个绑定使用`,
    }));
  } else if (activeDetailPage === 'groups') {
    items = loadBindingGroups().map(group => ({
      id: group.id,
      label: group.name,
      meta: summarizeContextBindingResources(group.resources),
    }));
  } else if (activeDetailPage === 'events') {
    const avatarId = getEditingAvatarId();
    const snapshots = avatarId ? loadPersonaSnapshots(avatarId) : [];
    items = [
      {
        id: 'preset_save_sync',
        label: '预设保存同步',
        meta: getOfficialPresetSaveStatusLabel(officialPresetSaveStatus.kind),
      },
      {
        id: 'context_events',
        label: '切换事件',
        meta: `${Object.values(plusEventStates).filter(item => item.available).length}/${Object.values(plusEventStates).length} 可用`,
      },
      {
        id: 'interface_probe',
        label: '接口探测',
        meta: lastPlusProbeReport
          ? `${lastPlusProbeReport.interfaceItems.filter(item => item.available).length}/${lastPlusProbeReport.interfaceItems.length} 可用`
          : '未检测',
      },
      {
        id: 'compatibility',
        label: '兼容性自检',
        meta: lastCompatibilityReport ? (lastCompatibilityReport.ok ? '通过' : '存在风险') : '未检测',
      },
      {
        id: 'snapshot_guard',
        label: '变更保护',
        meta: avatarId ? `当前 user 人设快照 ${snapshots.length} 条` : '请先选择一个 user 人设',
      },
    ];
  }

  const selectedId = ensureActiveResourceSelection(
    activeDetailPage,
    items.map(item => item.id),
  );
  const filtered = filterNamedOptions(items);
  if (filtered.length === 0) {
    $container.html(`<div class="empty-list">${personaSearchKeyword.trim() ? '没有匹配项' : '当前没有可用资源'}</div>`);
    return;
  }

  filtered.forEach(item => {
    $container.append(
      createSidebarIndexItemHtml(item.label, item.meta || '', {
        selected: item.id === selectedId,
        interactive: true,
        action: 'select-resource',
        value: item.id,
      }),
    );
  });
}

function syncActiveDetailPageUi(): void {
  const parentDoc = window.parent.document;
  syncActiveBindingScope();
  if (activeDetailPage !== 'persona') {
    personaFolderDrawerOpen = false;
  }
  $('.persona-resource-nav-item', parentDoc).each(function () {
    const page = (($(this).attr('data-page') as string | undefined) || '') as DetailPageKey;
    $(this).toggleClass('active', page === activeDetailPage);
  });

  DETAIL_PAGE_DEFINITIONS.forEach(page => {
    $(`#persona-page-${page.key}`, parentDoc).toggleClass('active', page.key === activeDetailPage);
  });

  renderSidebarSecondaryList();
  renderToolbarSelectionSummary();
  renderResourceDetailPages();
  renderPersonaDefaultTraitSnapshotState(getEditingAvatarId());
  applyBindingPlusLayoutState();

  if (activeDetailPage === 'api') {
    void refreshApiConnectionCatalog({ quiet: true, rerender: true });
  }

  if (activeDetailPage === 'events') {
    renderPlusBindingSection();
  }
}

function renderRuntimeContextHeader(): void {
  return;
}

function renderPersonaDefaultButtonState(avatarId: string): void {
  const parentDoc = window.parent.document;
  const $button = $('#persona-default-persona-btn', parentDoc);
  if (!$button.length) {
    return;
  }

  const persona = avatarId ? findPersonaByAvatarId(avatarId) : null;
  if (!avatarId || !persona) {
    $button.prop('disabled', true).text('设为默认人设').attr('title', '请先在左侧选择一个 user 人设');
    return;
  }

  const isDefault = Boolean(persona.isDefault);
  $button
    .prop('disabled', false)
    .text(isDefault ? '取消默认人设' : '设为默认人设')
    .attr('title', isDefault ? '取消当前 user 人设的默认状态' : '将当前 user 人设设为新聊天的默认人设');
}

function renderPersonaDefaultTraitSnapshotState(avatarId: string): void {
  const parentDoc = window.parent.document;
  const $button = $('#persona-save-default-traits-btn', parentDoc);
  const $status = $('#persona-default-traits-status', parentDoc);
  if (!$button.length || !$status.length) {
    return;
  }

  if (!avatarId) {
    $button.prop('disabled', true).text('保存为默认条目状态').attr('title', '请先在左侧选择一个 user 人设');
    $status.text('默认条目状态：请先在左侧选择一个 user 人设');
    return;
  }

  const currentTraitIds = getPersonaManualEnabledTraitIds(avatarId);
  const currentSharedTraitIds = loadEnabledSharedTraitIds(avatarId);
  const savedDefaultTraitIds = getPersonaDefaultEnabledTraitIds(avatarId);
  const savedDefaultSharedTraitIds = getPersonaDefaultEnabledSharedTraitIds(avatarId);
  const hasSavedSnapshot = savedDefaultTraitIds !== undefined || savedDefaultSharedTraitIds !== undefined;
  const hasUnsavedChanges =
    hasSavedSnapshot &&
    (!areOptionalStringArraysEqual(savedDefaultTraitIds ?? [], currentTraitIds) ||
      !areOptionalStringArraysEqual(savedDefaultSharedTraitIds ?? [], currentSharedTraitIds));
  const nextTitle =
    hasSavedSnapshot && !hasUnsavedChanges
      ? '当前勾选已是未绑定时的默认条目状态'
      : `将当前勾选的本地 ${currentTraitIds.length} 条、通用 ${currentSharedTraitIds.length} 条保存为未绑定时的默认状态`;

  $button.prop('disabled', false).text('保存为默认条目状态').attr('title', nextTitle);

  if (!hasSavedSnapshot) {
    $status.text('默认条目状态：未保存，当前沿用手动勾选');
    return;
  }

  $status.text(
    hasUnsavedChanges
      ? `默认条目状态：本地 ${savedDefaultTraitIds?.length || 0} 条、通用 ${savedDefaultSharedTraitIds?.length || 0} 条已保存，当前有未保存改动`
      : `默认条目状态：本地 ${savedDefaultTraitIds?.length || 0} 条、通用 ${savedDefaultSharedTraitIds?.length || 0} 条已保存`,
  );
}

function saveCurrentPersonaTraitsAsDefaultSnapshot(
  avatarId: string,
  options: {
    announceSuccess?: boolean;
    announceUnchanged?: boolean;
  } = {},
): { ok: boolean; changed: boolean; count: number } {
  const currentTraitIds = getPersonaManualEnabledTraitIds(avatarId);
  const currentSharedTraitIds = loadEnabledSharedTraitIds(avatarId);
  const savedDefaultTraitIds = getPersonaDefaultEnabledTraitIds(avatarId);
  const savedDefaultSharedTraitIds = getPersonaDefaultEnabledSharedTraitIds(avatarId);
  const localChanged = !areOptionalStringArraysEqual(savedDefaultTraitIds, currentTraitIds);
  const sharedChanged = !areOptionalStringArraysEqual(savedDefaultSharedTraitIds, currentSharedTraitIds);
  const changed = localChanged || sharedChanged;
  if (!changed) {
    renderPersonaDefaultTraitSnapshotState(avatarId);
    if (options.announceUnchanged) {
      toastr.info('当前勾选已是默认条目状态');
    }
    return { ok: true, changed: false, count: currentTraitIds.length + currentSharedTraitIds.length };
  }

  if (
    !savePersonaDefaultEnabledTraitIds(avatarId, currentTraitIds) ||
    !savePersonaDefaultEnabledSharedTraitIds(avatarId, currentSharedTraitIds)
  ) {
    return { ok: false, changed: true, count: currentTraitIds.length + currentSharedTraitIds.length };
  }

  renderPersonaDefaultTraitSnapshotState(avatarId);
  if (options.announceSuccess) {
    toastr.success(
      `已保存「${findPersonaByAvatarId(avatarId)?.name || avatarId}」的默认条目状态（本地 ${currentTraitIds.length} 条，通用 ${currentSharedTraitIds.length} 条）`,
    );
  }
  return { ok: true, changed: true, count: currentTraitIds.length + currentSharedTraitIds.length };
}

function renderPresetDefaultButtonState(): void {
  const parentDoc = window.parent.document;
  const $button = $('#persona-default-preset-btn', parentDoc);
  if (!$button.length) {
    return;
  }

  const presetName = (activeResourceSelection.preset || '').trim();
  const currentDefaultPreset = getDefaultPresetName();
  if (!presetName) {
    $button.prop('disabled', true).text('设为默认预设').attr('title', '请先在左侧选择一个预设');
    return;
  }

  const isDefaultPreset = currentDefaultPreset === presetName;
  $button
    .prop('disabled', false)
    .text(isDefaultPreset ? '取消默认预设' : '设为默认预设')
    .attr('title', isDefaultPreset ? '取消当前预设的默认状态' : '将当前预设设为未绑定时的默认预设');
}

function renderPresetPromptDefaultSnapshotState(): void {
  const parentDoc = window.parent.document;
  const presetName = (activeResourceSelection.preset || '').trim();
  const $button = $('#persona-save-default-preset-prompts-btn', parentDoc);
  const $status = $('#persona-default-preset-prompts-status', parentDoc);
  if (!$button.length || !$status.length) {
    return;
  }

  if (!presetName) {
    $button.prop('disabled', true).text('保存为默认预设条目状态').attr('title', '请先在左侧选择一个预设');
    $status.text('默认预设条目状态：请先在左侧选择一个预设');
    return;
  }

  const currentPromptIds = getCurrentPresetPromptSelectionIds(presetName) || [];
  const savedPromptIds = loadDefaultPresetPromptIds(presetName);
  const hasUnsavedChanges =
    savedPromptIds !== undefined && !areOptionalStringArraysEqual(savedPromptIds, currentPromptIds);
  const nextTitle =
    savedPromptIds !== undefined && !hasUnsavedChanges
      ? '当前勾选已是未绑定时的默认预设条目状态'
      : `将当前勾选的 ${currentPromptIds.length} 条保存为未绑定时的默认预设条目状态`;

  $button.prop('disabled', false).text('保存为默认预设条目状态').attr('title', nextTitle);

  if (savedPromptIds === undefined) {
    $status.text('默认预设条目状态：未保存，当前沿用手动勾选');
    return;
  }

  $status.text(
    hasUnsavedChanges
      ? `默认预设条目状态：${savedPromptIds.length} 条已保存，当前有未保存改动`
      : `默认预设条目状态：${savedPromptIds.length} 条已保存`,
  );
}

function saveCurrentPresetPromptsAsDefaultSnapshot(
  presetName: string,
  options: {
    announceSuccess?: boolean;
    announceUnchanged?: boolean;
  } = {},
): { ok: boolean; changed: boolean; count: number } {
  const snapshotResult = savePresetPromptIdsAsDefaultSnapshot(
    presetName,
    getCurrentPresetPromptSelectionIds(presetName) || [],
  );
  if (!snapshotResult.changed) {
    renderPresetPromptDefaultSnapshotState();
    if (options.announceUnchanged) {
      toastr.info('当前勾选已是默认预设条目状态');
    }
    return { ok: snapshotResult.ok, changed: false, count: snapshotResult.count };
  }

  if (!snapshotResult.ok) {
    return { ok: false, changed: true, count: snapshotResult.count };
  }

  renderPresetPromptDefaultSnapshotState();
  if (options.announceSuccess) {
    toastr.success(`已保存预设「${presetName}」的默认条目状态（${snapshotResult.count} 条）`);
  }
  return { ok: true, changed: true, count: snapshotResult.count };
}

function applyPresetPromptFilter(): void {
  const parentDoc = window.parent.document;
  const keyword = (($('#persona-preset-prompt-search', parentDoc).val() as string | undefined) || '')
    .trim()
    .toLowerCase();
  let visibleCount = 0;
  $('.persona-prompt-check-card', parentDoc).each(function () {
    const haystack = (($(this).attr('data-filter-text') as string | undefined) || '').toLowerCase();
    const matched = !keyword || haystack.includes(keyword);
    $(this).toggle(matched);
    if (matched) {
      visibleCount += 1;
    }
  });
  $('#persona-preset-prompt-empty', parentDoc).toggle(
    $('.persona-prompt-check-card', parentDoc).length > 0 && visibleCount === 0,
  );
}

function renderWorldbookEntryDefaultSnapshotState(): void {
  const parentDoc = window.parent.document;
  const worldbookName = (activeResourceSelection.worldbooks || '').trim();
  const $button = $('#persona-save-default-worldbook-entries-btn', parentDoc);
  const $status = $('#persona-default-worldbook-entries-status', parentDoc);
  if (!$button.length || !$status.length) {
    return;
  }

  if (!worldbookName) {
    $button.prop('disabled', true).text('保存为默认世界书条目状态').attr('title', '请先在左侧选择一个世界书');
    $status.text('默认世界书条目状态：请先在左侧选择一个世界书');
    return;
  }

  const currentEntryUids = getCurrentWorldbookEnabledEntryUids(worldbookName) || [];
  const savedEntryUids = loadDefaultWorldbookEnabledEntryUids(worldbookName);
  const hasUnsavedChanges =
    savedEntryUids !== undefined && !areOptionalNumberArraysEqual(savedEntryUids, currentEntryUids);
  const nextTitle =
    savedEntryUids !== undefined && !hasUnsavedChanges
      ? '当前勾选已是未绑定时的默认世界书条目状态'
      : `将当前勾选的 ${currentEntryUids.length} 条保存为未绑定时的默认世界书条目状态`;

  $button.prop('disabled', false).text('保存为默认世界书条目状态').attr('title', nextTitle);

  if (savedEntryUids === undefined) {
    $status.text('默认世界书条目状态：未保存，当前沿用手动勾选');
    return;
  }

  $status.text(
    hasUnsavedChanges
      ? `默认世界书条目状态：${savedEntryUids.length} 条已保存，当前有未保存改动`
      : `默认世界书条目状态：${savedEntryUids.length} 条已保存`,
  );
}

function applyWorldbookEntryFilter(): void {
  const parentDoc = window.parent.document;
  const keyword = (($('#persona-worldbook-entry-search', parentDoc).val() as string | undefined) || '')
    .trim()
    .toLowerCase();
  let visibleCount = 0;
  $('.persona-worldbook-entry-check-card', parentDoc).each(function () {
    const haystack = (($(this).attr('data-filter-text') as string | undefined) || '').toLowerCase();
    const matched = !keyword || haystack.includes(keyword);
    $(this).toggle(matched);
    if (matched) {
      visibleCount += 1;
    }
  });
  $('#persona-worldbook-entry-empty', parentDoc).toggle(
    $('.persona-worldbook-entry-check-card', parentDoc).length > 0 && visibleCount === 0,
  );
}

function renderToolbarActionButtons(): void {
  const parentDoc = window.parent.document;
  const $chatBindingButton = $('#persona-lock-chat-btn', parentDoc);
  const $characterBindingButton = $('#persona-lock-char-btn', parentDoc);
  const $exportChatButton = $('#binding-group-export-chat-btn', parentDoc);
  const $exportCharacterButton = $('#binding-group-export-character-btn', parentDoc);
  const $personaButton = $('#persona-default-persona-btn', parentDoc);
  const $presetButton = $('#persona-default-preset-btn', parentDoc);

  const showPersonaButton = activeDetailPage === 'persona';
  const showPresetButton = activeDetailPage === 'preset';
  const isGroupsPage = activeDetailPage === 'groups';
  const selectedGroup = isGroupsPage ? getSelectedBindingGroup() : null;
  const runtime = isGroupsPage ? getRuntimeContext() : null;
  const canExportChat = Boolean(isGroupsPage && runtime && getCurrentContextBinding('chat', runtime));
  const canExportCharacter = Boolean(isGroupsPage && runtime && getCurrentContextBinding('character', runtime));

  $chatBindingButton
    .prop('disabled', isGroupsPage && !selectedGroup)
    .attr(
      'title',
      isGroupsPage
        ? selectedGroup
          ? '将当前绑定组应用到当前聊天'
          : '请先在左侧选择一个绑定组'
        : '将当前选中项绑定到当前聊天；没有绑定时会自动创建',
    );
  $characterBindingButton
    .prop('disabled', isGroupsPage && !selectedGroup)
    .attr(
      'title',
      isGroupsPage
        ? selectedGroup
          ? '将当前绑定组应用到当前角色'
          : '请先在左侧选择一个绑定组'
        : '将当前选中项绑定到当前角色；没有绑定时会自动创建',
    );

  $exportChatButton
    .toggle(isGroupsPage)
    .prop('disabled', !canExportChat)
    .attr(
      'title',
      canExportChat ? '把当前聊天的绑定内容导出到当前绑定组；未选组时会自动新建' : '当前聊天还没有可导出的绑定',
    );
  $exportCharacterButton
    .toggle(isGroupsPage)
    .prop('disabled', !canExportCharacter)
    .attr(
      'title',
      canExportCharacter ? '把当前角色的绑定内容导出到当前绑定组；未选组时会自动新建' : '当前角色还没有可导出的绑定',
    );

  $personaButton.toggle(showPersonaButton);
  $presetButton.toggle(showPresetButton);

  if (showPersonaButton) {
    renderPersonaDefaultButtonState(getEditingAvatarId());
  }
  if (showPresetButton) {
    renderPresetDefaultButtonState();
  }
}

type ImportedPersonaTraitDraft = {
  name: string;
  description: string;
  enabled?: boolean;
};

type ImportedPersonaFolderDraft = {
  name: string;
  traits: ImportedPersonaTraitDraft[];
};

type ImportedPersonaYamlPayload = {
  traits: ImportedPersonaTraitDraft[];
  folders: ImportedPersonaFolderDraft[];
};

function getYamlRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getYamlValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function hasYamlKey(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(key => Object.prototype.hasOwnProperty.call(record, key));
}

function getYamlString(record: Record<string, unknown>, keys: string[]): string {
  const value = getYamlValue(record, keys);
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function stringifyYamlLikeValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  try {
    return YAML.stringify(value)
      .replace(/^\s*---\s*\n?/u, '')
      .replace(/\n\.\.\.\s*$/u, '')
      .trim();
  } catch {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value).trim();
    }
  }
}

function dedentLooseYamlBlock(lines: string[]): string {
  const normalizedLines = lines.map(line => line.replace(/\r/g, ''));
  const meaningful = normalizedLines.filter(line => line.trim().length > 0);
  if (meaningful.length === 0) {
    return '';
  }
  const minIndent = meaningful.reduce((indent, line) => {
    const currentIndent = (line.match(/^\s*/) || [''])[0].length;
    return Math.min(indent, currentIndent);
  }, Number.MAX_SAFE_INTEGER);
  return normalizedLines
    .map(line => (line.trim().length === 0 ? '' : line.slice(Math.min(minIndent, line.length))))
    .join('\n')
    .trim();
}

function normalizeLooseTopLevelTraitBlock(name: string, blockLines: string[]): ImportedPersonaTraitDraft {
  const dedented = dedentLooseYamlBlock(blockLines);
  if (!dedented) {
    return {
      name,
      description: '',
      enabled: undefined,
    };
  }

  const lines = dedented.split('\n');
  let description = '';
  let enabled: boolean | undefined;
  let consumedStructuredFields = false;

  lines.forEach(rawLine => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      description = description ? `${description}\n` : description;
      return;
    }

    const descMatch = trimmed.match(/^(描述|description|内容|content|设定)\s*:\s*(.*?)\s*$/);
    if (descMatch) {
      consumedStructuredFields = true;
      description = descMatch[2].trim();
      return;
    }

    const enabledMatch = trimmed.match(/^(启用|enabled|开启)\s*:\s*(.*?)\s*$/);
    if (enabledMatch) {
      consumedStructuredFields = true;
      enabled = parseLooseYamlBoolean(enabledMatch[2]);
      return;
    }

    if (consumedStructuredFields) {
      description = description ? `${description}\n${trimmed}` : trimmed;
      return;
    }

    description = dedented;
  });

  return {
    name,
    description: description.trim(),
    enabled,
  };
}

function getYamlBoolean(record: Record<string, unknown>, keys: string[], fallback: boolean = true): boolean {
  const value = getYamlValue(record, keys);
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'on', '1', '是', '启用', '开启'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'off', '0', '否', '禁用', '关闭'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeYamlArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
}

function parseLooseYamlBoolean(value: string): boolean | undefined {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (['true', 'yes', 'on', '1', '是', '启用', '开启'].includes(normalized)) {
    return true;
  }
  if (['false', 'no', 'off', '0', '否', '禁用', '关闭'].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseLoosePersonaFolderTraits(lines: string[]): ImportedPersonaTraitDraft[] {
  const traits: ImportedPersonaTraitDraft[] = [];
  let pendingTrait: ImportedPersonaTraitDraft | null = null;

  const flushPendingTrait = () => {
    if (!pendingTrait || !pendingTrait.name.trim()) {
      pendingTrait = null;
      return;
    }
    traits.push({
      name: pendingTrait.name.trim(),
      description: pendingTrait.description.trim(),
      enabled: pendingTrait.enabled,
    });
    pendingTrait = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const listInlineMatch = line.match(/^\s*-\s*([^:]+?)\s*:\s*(.+?)\s*$/);
    if (listInlineMatch) {
      flushPendingTrait();
      traits.push({
        name: listInlineMatch[1].trim(),
        description: listInlineMatch[2].trim(),
        enabled: undefined,
      });
      continue;
    }

    const listStartMatch = line.match(/^\s*-\s*([^:]+?)\s*:\s*$/);
    if (listStartMatch) {
      flushPendingTrait();
      pendingTrait = {
        name: listStartMatch[1].trim(),
        description: '',
        enabled: undefined,
      };
      continue;
    }

    const nestedDescMatch = line.match(/^\s*(描述|description|内容|content|设定)\s*:\s*(.*?)\s*$/);
    if (pendingTrait && nestedDescMatch) {
      pendingTrait.description = nestedDescMatch[2].trim();
      continue;
    }

    const nestedEnabledMatch = line.match(/^\s*(启用|enabled|开启)\s*:\s*(.*?)\s*$/);
    if (pendingTrait && nestedEnabledMatch) {
      pendingTrait.enabled = parseLooseYamlBoolean(nestedEnabledMatch[2]);
      continue;
    }

    const nestedInlineMatch = line.match(/^\s*([^:\-\s][^:]*?)\s*:\s*(.+?)\s*$/);
    if (nestedInlineMatch && !pendingTrait) {
      traits.push({
        name: nestedInlineMatch[1].trim(),
        description: nestedInlineMatch[2].trim(),
        enabled: undefined,
      });
      continue;
    }

    const nestedStartMatch = line.match(/^\s*([^:\-\s][^:]*?)\s*:\s*$/);
    if (nestedStartMatch && !pendingTrait) {
      flushPendingTrait();
      pendingTrait = {
        name: nestedStartMatch[1].trim(),
        description: '',
        enabled: undefined,
      };
      continue;
    }

    if (pendingTrait) {
      pendingTrait.description = pendingTrait.description ? `${pendingTrait.description}\n${trimmed}` : trimmed;
    }
  }

  flushPendingTrait();
  return traits.filter(trait => trait.name.trim().length > 0);
}

function parseLoosePersonaYaml(normalizedText: string): ImportedPersonaYamlPayload {
  const payload: ImportedPersonaYamlPayload = {
    traits: [],
    folders: [],
  };
  const lines = normalizedText.split('\n');
  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index].replace(/\r/g, '');
    const trimmed = currentLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      index += 1;
      continue;
    }

    const topLevelMatch = currentLine.match(/^([^-\s][^:]*?)\s*:\s*(.*?)\s*$/);
    if (!topLevelMatch) {
      index += 1;
      continue;
    }

    const key = topLevelMatch[1].trim();
    const inlineValue = topLevelMatch[2].trim();

    if (inlineValue) {
      payload.traits.push({
        name: key,
        description: inlineValue,
        enabled: undefined,
      });
      index += 1;
      continue;
    }

    const blockLines: string[] = [];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index].replace(/\r/g, '');
      if (nextLine.trim() === '') {
        blockLines.push(nextLine);
        index += 1;
        continue;
      }
      if (!/^\s/.test(nextLine)) {
        break;
      }
      blockLines.push(nextLine);
      index += 1;
    }

    if (['条目', 'traits', 'items'].includes(key)) {
      const blockTraits = parseLoosePersonaFolderTraits(blockLines);
      if (blockTraits.length === 0) {
        continue;
      }
      payload.traits.push(...blockTraits);
      continue;
    }

    const firstMeaningfulLine = blockLines.find(line => line.trim().length > 0)?.trim() || '';
    const isFolderBlock = firstMeaningfulLine.startsWith('-');
    if (isFolderBlock) {
      const blockTraits = parseLoosePersonaFolderTraits(blockLines);
      if (blockTraits.length === 0) {
        continue;
      }
      payload.folders.push({
        name: key,
        traits: blockTraits,
      });
      continue;
    }

    payload.traits.push(normalizeLooseTopLevelTraitBlock(key, blockLines));
  }

  if (payload.traits.length === 0 && payload.folders.length === 0) {
    throw new Error('没有解析到任何可导入的文件夹或条目');
  }

  return payload;
}

function normalizeImportedNamedTraitDraft(name: string, value: unknown): ImportedPersonaTraitDraft | null {
  const normalizedName = (name || '').trim();
  if (!normalizedName) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return {
      name: normalizedName,
      description: String(value).trim(),
      enabled: undefined,
    };
  }

  if (Array.isArray(value)) {
    return {
      name: normalizedName,
      description: stringifyYamlLikeValue(value),
      enabled: undefined,
    };
  }

  const record = getYamlRecord(value);
  if (!record) {
    return null;
  }

  const traitLikeKeys = ['描述', 'description', '内容', 'content', '设定', '启用', 'enabled', '开启'];
  if (!hasYamlKey(record, traitLikeKeys)) {
    return {
      name: normalizedName,
      description: stringifyYamlLikeValue(value),
      enabled: undefined,
    };
  }

  return {
    name: normalizedName,
    description: getYamlString(record, ['描述', 'description', '内容', 'content', '设定']),
    enabled: hasYamlKey(record, ['启用', 'enabled', '开启'])
      ? getYamlBoolean(record, ['启用', 'enabled', '开启'], true)
      : undefined,
  };
}

function normalizeImportedTraitDraft(value: unknown): ImportedPersonaTraitDraft | null {
  if (typeof value === 'string') {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return null;
    }
    const inlineTraitMatch = normalizedValue.match(/^([^:：]+?)\s*[：:]\s*(.+)$/);
    if (inlineTraitMatch) {
      return {
        name: inlineTraitMatch[1].trim(),
        description: inlineTraitMatch[2].trim(),
        enabled: undefined,
      };
    }
    return {
      name: normalizedValue,
      description: '',
      enabled: undefined,
    };
  }

  const record = getYamlRecord(value);
  if (!record) {
    return null;
  }

  const name = getYamlString(record, ['名称', 'name', '标题', 'title']);
  const description = getYamlString(record, ['描述', 'description', '内容', 'content', '设定']);
  if (!name) {
    const entries = Object.entries(record);
    if (entries.length === 1) {
      const [entryName, entryValue] = entries[0];
      return normalizeImportedNamedTraitDraft(entryName, entryValue);
    }
    return null;
  }

  return {
    name,
    description,
    enabled: hasYamlKey(record, ['启用', 'enabled', '开启'])
      ? getYamlBoolean(record, ['启用', 'enabled', '开启'], true)
      : undefined,
  };
}

function normalizeImportedNamedFolderDraft(name: string, value: unknown): ImportedPersonaFolderDraft | null {
  const folderName = (name || '').trim();
  if (!folderName) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return null;
  }

  if (Array.isArray(value)) {
    const traits = value
      .map(item => normalizeImportedTraitDraft(item))
      .filter((item): item is ImportedPersonaTraitDraft => Boolean(item));
    if (traits.length === 0) {
      return null;
    }
    return {
      name: folderName,
      traits,
    };
  }

  let traitSource: unknown = undefined;
  const record = getYamlRecord(value);
  if (record) {
    const traitLikeKeys = ['描述', 'description', '内容', 'content', '设定', '启用', 'enabled', '开启'];
    if (hasYamlKey(record, traitLikeKeys)) {
      return null;
    }

    const explicitTraitSource = getYamlValue(record, ['条目', 'traits', 'items']);
    if (explicitTraitSource !== undefined) {
      traitSource = explicitTraitSource;
    } else {
      return null;
    }
  }

  if (traitSource === undefined) {
    return null;
  }

  const traits = normalizeYamlArray(traitSource)
    .map(item => normalizeImportedTraitDraft(item))
    .filter((item): item is ImportedPersonaTraitDraft => Boolean(item));
  if (traits.length === 0) {
    return null;
  }

  return {
    name: folderName,
    traits,
  };
}

function normalizeImportedFolderDraft(value: unknown): ImportedPersonaFolderDraft | null {
  const record = getYamlRecord(value);
  if (!record) {
    return null;
  }

  const name = getYamlString(record, ['文件夹名称', '名称', 'folderName', 'name']);
  const traitSource = getYamlValue(record, ['条目', 'traits', 'items']);
  if (!name || traitSource === undefined) {
    return null;
  }

  const traits = normalizeYamlArray(traitSource)
    .map(item => normalizeImportedTraitDraft(item))
    .filter((item): item is ImportedPersonaTraitDraft => Boolean(item));
  if (traits.length === 0) {
    return null;
  }

  return {
    name,
    traits,
  };
}

function collectImportedPersonaYamlNode(value: unknown, payload: ImportedPersonaYamlPayload): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectImportedPersonaYamlNode(item, payload));
    return;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const traitDraft = normalizeImportedTraitDraft(value);
    if (traitDraft) {
      payload.traits.push(traitDraft);
    }
    return;
  }

  const folderDraft = normalizeImportedFolderDraft(value);
  if (folderDraft) {
    payload.folders.push(folderDraft);
    return;
  }

  const record = getYamlRecord(value);
  if (!record) {
    return;
  }

  const folderContainer = getYamlValue(record, ['文件夹', 'folders', 'folderList']);
  const traitContainer = getYamlValue(record, ['条目', 'traits', 'items']);
  const hasExplicitContainers = folderContainer !== undefined || traitContainer !== undefined;
  if (hasExplicitContainers) {
    normalizeYamlArray(folderContainer).forEach(item => collectImportedPersonaYamlNode(item, payload));
    normalizeYamlArray(traitContainer).forEach(item => collectImportedPersonaYamlNode(item, payload));
  }

  for (const [entryName, entryValue] of Object.entries(record)) {
    if (['文件夹', 'folders', 'folderList', '条目', 'traits', 'items'].includes(entryName)) {
      continue;
    }

    if (Array.isArray(entryValue)) {
      const folderEntry = normalizeImportedNamedFolderDraft(entryName, entryValue);
      if (folderEntry) {
        payload.folders.push(folderEntry);
        continue;
      }
    }

    const traitEntry = normalizeImportedNamedTraitDraft(entryName, entryValue);
    if (traitEntry) {
      payload.traits.push(traitEntry);
    }
  }
}

function parsePersonaYamlImport(text: string): ImportedPersonaYamlPayload {
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\t/g, '  ').trim();
  if (!normalizedText) {
    throw new Error('请先粘贴 YAML 内容');
  }

  try {
    const documents = YAML.parseAllDocuments(normalizedText);
    const errors = documents.flatMap(document => document.errors || []);
    if (errors.length > 0) {
      throw new Error(String(errors[0]));
    }

    const payload: ImportedPersonaYamlPayload = {
      traits: [],
      folders: [],
    };
    documents.forEach(document => {
      collectImportedPersonaYamlNode(document.toJSON(), payload);
    });

    if (payload.traits.length === 0 && payload.folders.length === 0) {
      throw new Error('没有解析到任何可导入的文件夹或条目');
    }

    return payload;
  } catch (error) {
    try {
      return parseLoosePersonaYaml(normalizedText);
    } catch {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}

function stripStructuredImportCodeFence(text: string): string {
  return text
    .replace(/^\s*```(?:json|ya?ml)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function parsePersonaJsonImport(text: string): ImportedPersonaYamlPayload {
  const normalizedText = stripStructuredImportCodeFence(text).replace(/\r\n/g, '\n').trim();
  if (!normalizedText) {
    throw new Error('请先粘贴 JSON 内容');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedText);
  } catch (error) {
    throw new Error(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const payload: ImportedPersonaYamlPayload = {
    traits: [],
    folders: [],
  };
  collectImportedPersonaYamlNode(parsed, payload);
  if (payload.traits.length === 0 && payload.folders.length === 0) {
    throw new Error('没有解析到任何可导入的文件夹或条目');
  }
  return payload;
}

function parsePersonaBatchImport(text: string): ImportedPersonaYamlPayload {
  const normalizedText = stripStructuredImportCodeFence(text).replace(/\r\n/g, '\n').replace(/\t/g, '  ').trim();
  if (!normalizedText) {
    throw new Error('请先粘贴 YAML 或 JSON 内容');
  }

  const looksLikeJson = /^[[{]/.test(normalizedText);
  if (looksLikeJson) {
    try {
      return parsePersonaJsonImport(normalizedText);
    } catch (jsonError) {
      try {
        return parsePersonaYamlImport(normalizedText);
      } catch {
        throw jsonError instanceof Error ? jsonError : new Error(String(jsonError));
      }
    }
  }

  try {
    return parsePersonaYamlImport(normalizedText);
  } catch (yamlError) {
    try {
      return parsePersonaJsonImport(normalizedText);
    } catch {
      throw yamlError instanceof Error ? yamlError : new Error(String(yamlError));
    }
  }
}

function summarizePersonaYamlPayload(payload: ImportedPersonaYamlPayload): string {
  const folderTraitCount = payload.folders.reduce((sum, folder) => sum + folder.traits.length, 0);
  return `文件夹 ${payload.folders.length} 个 · 条目 ${payload.traits.length + folderTraitCount} 条`;
}

function createPersonaLocalId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeImportNameKey(value: string): string {
  return (value || '').trim().toLowerCase();
}

function createPersonaYamlPreviewHtml(payload: ImportedPersonaYamlPayload): string {
  const traitRows = payload.traits
    .slice(0, 6)
    .map(
      trait => `
        <div class="persona-detail-list-item">
          <div class="persona-detail-list-title">${escapeHtml(trait.name)}</div>
          <div class="persona-detail-list-meta">${escapeHtml(
            trait.description ? truncatePreviewText(trait.description, 96) : '顶层条目',
          )}</div>
        </div>
      `,
    )
    .join('');

  const folderRows = payload.folders
    .slice(0, 6)
    .map(
      folder => `
        <div class="persona-detail-list-item">
          <div class="persona-detail-list-title">${escapeHtml(folder.name)}</div>
          <div class="persona-detail-list-meta">${escapeHtml(`包含 ${folder.traits.length} 条条目`)}</div>
        </div>
      `,
    )
    .join('');

  return `
    <div class="persona-detail-section-title">导入预览</div>
    <div class="persona-detail-list">
      ${
        folderRows ||
        '<div class="persona-detail-list-item"><div class="persona-detail-list-meta">这次没有解析到文件夹。</div></div>'
      }
      ${
        traitRows ||
        '<div class="persona-detail-list-item"><div class="persona-detail-list-meta">这次没有解析到顶层条目。</div></div>'
      }
    </div>
  `;
}

async function importPersonaYamlPayload(avatarId: string, payload: ImportedPersonaYamlPayload): Promise<void> {
  if (activePersonaTraitScope === 'shared') {
    await importSharedPersonaYamlPayload(avatarId, payload);
    return;
  }

  const traits = loadPersonaTraits(avatarId);
  const config = loadPersonaAdvancedConfig(avatarId);
  const stats = {
    createdTraits: 0,
    updatedTraits: 0,
    createdFolders: 0,
    updatedFolders: 0,
  };
  let changed = false;

  const upsertTrait = (draft: ImportedPersonaTraitDraft): string => {
    const name = draft.name.trim();
    if (!name) {
      return '';
    }

    const index = traits.findIndex(trait => normalizeImportNameKey(trait.name) === normalizeImportNameKey(name));
    const nextDescription = draft.description.trim();
    const nextEnabled = typeof draft.enabled === 'boolean' ? draft.enabled : false;
    const now = Date.now();

    if (index !== -1) {
      const current = traits[index];
      const mergedDescription = nextDescription || current.description;
      const mergedEnabled = nextEnabled;
      const nextTrait: PersonaTrait = {
        ...current,
        name,
        description: mergedDescription,
        enabled: mergedEnabled,
        updatedAt: now,
      };
      if (
        nextTrait.name !== current.name ||
        nextTrait.description !== current.description ||
        nextTrait.enabled !== current.enabled
      ) {
        traits[index] = nextTrait;
        stats.updatedTraits += 1;
        changed = true;
      }
      return current.id;
    }

    traits.push({
      id: createPersonaLocalId(),
      name,
      description: nextDescription,
      enabled: nextEnabled,
      createdAt: now,
      updatedAt: now,
    });
    stats.createdTraits += 1;
    changed = true;
    return traits[traits.length - 1].id;
  };

  payload.traits.forEach(draft => {
    upsertTrait(draft);
  });

  payload.folders.forEach(folder => {
    const folderName = folder.name.trim();
    const importedTraitIds = folder.traits.map(upsertTrait).filter(Boolean);
    if (!folderName || importedTraitIds.length === 0) {
      return;
    }

    const index = config.profiles.findIndex(
      profile => normalizeImportNameKey(profile.name) === normalizeImportNameKey(folderName),
    );
    const now = Date.now();

    if (index !== -1) {
      const current = config.profiles[index];
      const mergedTraitIds = Array.from(new Set([...(current.traitIds || []), ...importedTraitIds]));
      const isChanged =
        current.name !== folderName ||
        current.plusBinding !== undefined ||
        mergedTraitIds.length !== current.traitIds.length ||
        mergedTraitIds.some((traitId, order) => current.traitIds[order] !== traitId);

      if (isChanged) {
        config.profiles[index] = {
          ...current,
          name: folderName,
          traitIds: mergedTraitIds,
          plusBinding: undefined,
          updatedAt: now,
        };
        stats.updatedFolders += 1;
        changed = true;
      }
      return;
    }

    config.profiles.push({
      id: createPersonaLocalId(),
      name: folderName,
      traitIds: Array.from(new Set(importedTraitIds)),
      plusBinding: undefined,
      createdAt: now,
      updatedAt: now,
    });
    stats.createdFolders += 1;
    changed = true;
  });

  if (!changed) {
    toastr.info('导入内容与当前文件夹/条目一致，没有需要导入的改动');
    return;
  }

  recordPersonaSnapshot(avatarId, '批量导入文件夹与条目');
  const traitsSaved = savePersonaTraits(avatarId, traits);
  const configSaved = savePersonaAdvancedConfig(avatarId, config);
  if (!traitsSaved || !configSaved) {
    toastr.error('批量导入保存失败');
    return;
  }

  renderPersonaTraits(avatarId);
  renderSnapshotSection(avatarId);
  renderResourceDetailPages();
  await applyComposedDescriptionForAvatar(avatarId, '批量导入后自动同步', {
    applyPlusBindings: false,
    errorToastTitle: '批量导入后同步 user人设失败',
  });
  toastr.success(
    `批量导入完成：新增条目 ${stats.createdTraits} 条，更新条目 ${stats.updatedTraits} 条，新增文件夹 ${stats.createdFolders} 个，更新文件夹 ${stats.updatedFolders} 个`,
  );
}

async function importSharedPersonaYamlPayload(avatarId: string, payload: ImportedPersonaYamlPayload): Promise<void> {
  const sharedConfig = loadSharedPersonaTraitsConfig();
  const enabledSharedTraitIds = new Set(loadEnabledSharedTraitIds(avatarId));
  const stats = {
    createdTraits: 0,
    updatedTraits: 0,
    createdFolders: 0,
    updatedFolders: 0,
  };
  let changed = false;
  let enabledChanged = false;

  const upsertTrait = (draft: ImportedPersonaTraitDraft): string => {
    const name = draft.name.trim();
    if (!name) {
      return '';
    }

    const index = sharedConfig.traits.findIndex(
      trait => normalizeImportNameKey(trait.name) === normalizeImportNameKey(name),
    );
    const nextDescription = draft.description.trim();
    const now = Date.now();

    if (index !== -1) {
      const current = sharedConfig.traits[index];
      const mergedDescription = nextDescription || current.description;
      const nextTrait: PersonaSharedTrait = {
        ...current,
        name,
        description: mergedDescription,
        updatedAt: now,
      };
      if (nextTrait.name !== current.name || nextTrait.description !== current.description) {
        sharedConfig.traits[index] = nextTrait;
        stats.updatedTraits += 1;
        changed = true;
      }
      if (draft.enabled === true && !enabledSharedTraitIds.has(current.id)) {
        enabledSharedTraitIds.add(current.id);
        enabledChanged = true;
      }
      return current.id;
    }

    sharedConfig.traits.push({
      id: createPersonaLocalId(),
      name,
      description: nextDescription,
      createdAt: now,
      updatedAt: now,
    });
    const createdId = sharedConfig.traits[sharedConfig.traits.length - 1].id;
    if (draft.enabled === true) {
      enabledSharedTraitIds.add(createdId);
      enabledChanged = true;
    }
    stats.createdTraits += 1;
    changed = true;
    return createdId;
  };

  payload.traits.forEach(draft => {
    upsertTrait(draft);
  });

  payload.folders.forEach(folder => {
    const folderName = folder.name.trim();
    const importedTraitIds = folder.traits.map(upsertTrait).filter(Boolean);
    if (!folderName || importedTraitIds.length === 0) {
      return;
    }

    const index = sharedConfig.folders.findIndex(
      item => normalizeImportNameKey(item.name) === normalizeImportNameKey(folderName),
    );
    const now = Date.now();

    if (index !== -1) {
      const current = sharedConfig.folders[index];
      const mergedTraitIds = Array.from(new Set([...(current.traitIds || []), ...importedTraitIds]));
      const isChanged =
        current.name !== folderName ||
        mergedTraitIds.length !== current.traitIds.length ||
        mergedTraitIds.some((traitId, order) => current.traitIds[order] !== traitId);

      if (isChanged) {
        sharedConfig.folders[index] = {
          ...current,
          name: folderName,
          traitIds: mergedTraitIds,
          updatedAt: now,
        };
        stats.updatedFolders += 1;
        changed = true;
      }
      return;
    }

    sharedConfig.folders.push({
      id: createPersonaLocalId(),
      name: folderName,
      traitIds: Array.from(new Set(importedTraitIds)),
      createdAt: now,
      updatedAt: now,
    });
    stats.createdFolders += 1;
    changed = true;
  });

  if (!changed && !enabledChanged) {
    toastr.info('导入内容与当前通用文件夹/条目一致，没有需要导入的改动');
    return;
  }

  recordPersonaSnapshot(avatarId, '批量导入通用文件夹与条目');
  const sharedSaved = changed ? saveSharedPersonaTraitsConfig(sharedConfig) : true;
  const enabledSaved = enabledChanged ? saveEnabledSharedTraitIds(avatarId, Array.from(enabledSharedTraitIds)) : true;
  if (!sharedSaved || !enabledSaved) {
    toastr.error('批量导入通用条目保存失败');
    return;
  }

  renderPersonaTraits(avatarId);
  renderSnapshotSection(avatarId);
  renderResourceDetailPages();
  await applyComposedDescriptionForAvatar(avatarId, '批量导入通用条目后自动同步', {
    applyPlusBindings: false,
    errorToastTitle: '批量导入通用条目后同步 user人设失败',
  });
  toastr.success(
    `批量导入通用条目完成：新增条目 ${stats.createdTraits} 条，更新条目 ${stats.updatedTraits} 条，新增文件夹 ${stats.createdFolders} 个，更新文件夹 ${stats.updatedFolders} 个`,
  );
}

function showPersonaYamlImportModal(avatarId: string): void {
  const parentDoc = window.parent.document;
  const persona = findPersonaByAvatarId(avatarId);
  const importingShared = activePersonaTraitScope === 'shared';
  const exampleYaml = `性格:
  - 傲娇: 嘴上不承认在意，但会用行动偷偷照顾对方。
  - 慢热:
      描述: 熟悉之前会克制表达，建立信任后才逐渐主动。

外挂:
  - 学霸: 学习能力极强，能快速掌握陌生知识。
  - 可怜光环: 天生惹人怜爱，更容易激发保护欲。

通用备注: 默认保持第一人称，不主动替 char 做决定。`;
  const exampleJson = `{
  "性格": [
    {
      "傲娇": "嘴上不承认在意，但会用行动偷偷照顾对方。"
    },
    {
      "慢热": {
        "描述": "熟悉之前会克制表达，建立信任后才逐渐主动。"
      }
    }
  ],
  "外挂": [
    {
      "学霸": "学习能力极强，能快速掌握陌生知识。"
    },
    {
      "可怜光环": "天生惹人怜爱，更容易激发保护欲。"
    }
  ],
  "通用备注": "默认保持第一人称，不主动替 char 做决定。"
}`;

  const modalHtml = `
    <div class="pool-edit-modal ${BINDINGPLUS_THEME_SCOPE_CLASS}">
      <div class="pool-edit-content persona-modal-content persona-import-content">
        <div class="persona-modal-header">
          <div>
            <div class="persona-modal-eyebrow">批量导入</div>
            <h3>导入文件夹和条目</h3>
            <div class="persona-modal-subtitle">${importingShared ? '把 AI 生成的中文 YAML 或 JSON 粘贴进来，批量导入到全局通用条目池。各 user 人设的勾选状态仍然独立。' : '把 AI 生成的中文 YAML 或 JSON 粘贴进来，批量导入到当前 user 人设。相同名称会优先更新，不会盲目重复新增。'}</div>
          </div>
          <div class="persona-modal-stat">
            <span>${importingShared ? '导入范围' : '当前人设'}</span>
            <strong>${escapeHtml(importingShared ? '通用条目' : persona?.name || avatarId)}</strong>
          </div>
        </div>
        <div class="persona-modal-grid persona-import-grid">
          <section class="persona-modal-main">
            <div class="persona-modal-toolbar">
              <div class="persona-modal-toolbar-copy">
                <div class="persona-modal-section-title">粘贴 YAML / JSON</div>
                <div class="persona-modal-section-note">解析规则：顶层“键: 值”为单独条目；顶层“键: 数组”为文件夹；数组里的每项按“条目名: 条目描述”解析；也兼容显式“文件夹 / 条目”包装结构。</div>
              </div>
            </div>
            <textarea class="persona-textarea persona-import-textarea" id="persona-yaml-import-text" placeholder="把 YAML 或 JSON 内容粘贴到这里..."></textarea>
            <div class="persona-import-status" id="persona-yaml-import-status">等待粘贴 YAML 或 JSON 内容。</div>
            <div class="persona-import-preview persona-detail-list" id="persona-yaml-import-preview"></div>
          </section>
          <aside class="persona-modal-sidebar">
            <div class="persona-modal-tip-card">
              <div class="persona-modal-tip-title">导入规则</div>
              <div class="persona-modal-tip-copy">同名条目会优先更新；同名文件夹会把新条目并入原文件夹。${importingShared ? '导入到通用池后，所有 user 人设都能看到这些内容。' : '文件夹只负责折叠整理，不承担聊天/角色绑定。'}</div>
            </div>
            <div class="persona-modal-tip-card">
              <div class="persona-modal-tip-title">示例 YAML</div>
              <pre class="persona-modal-code">${escapeHtml(exampleYaml)}</pre>
            </div>
            <div class="persona-modal-tip-card">
              <div class="persona-modal-tip-title">示例 JSON</div>
              <pre class="persona-modal-code">${escapeHtml(exampleJson)}</pre>
            </div>
          </aside>
        </div>
        <div class="edit-actions-bar">
          <button class="persona-btn" id="persona-yaml-preview-btn">解析预览</button>
          <button class="persona-btn" id="persona-yaml-import-confirm-btn">开始导入</button>
          <button class="persona-btn" id="persona-yaml-import-close-btn">关闭</button>
        </div>
      </div>
      <div class="pool-edit-overlay"></div>
    </div>
  `;

  const $modal = $(modalHtml).appendTo($('body', parentDoc));
  applyBindingPlusModalPresentation($modal);
  const $textarea = $('#persona-yaml-import-text', $modal);
  const $status = $('#persona-yaml-import-status', $modal);
  const $preview = $('#persona-yaml-import-preview', $modal);
  const closeModal = () => $modal.remove();

  const parseCurrent = (): ImportedPersonaYamlPayload | null => {
    const text = ($textarea.val() as string | undefined) || '';
    try {
      const payload = parsePersonaBatchImport(text);
      $status
        .text(`解析成功：${summarizePersonaYamlPayload(payload)}`)
        .removeClass('error')
        .addClass('success');
      $preview.html(createPersonaYamlPreviewHtml(payload));
      return payload;
    } catch (error) {
      $status
        .text(`解析失败：${error instanceof Error ? error.message : String(error)}`)
        .removeClass('success')
        .addClass('error');
      $preview.empty();
      return null;
    }
  };

  $('#persona-yaml-import-close-btn', $modal).on('click', closeModal);
  $('.pool-edit-overlay', $modal).on('click', closeModal);
  $('#persona-yaml-preview-btn', $modal).on('click', () => {
    parseCurrent();
  });
  $textarea.on('input', () => {
    $status.text('内容已修改，点击“解析预览”检查格式。').removeClass('success error');
  });
  $('#persona-yaml-import-confirm-btn', $modal).on('click', async () => {
    const payload = parseCurrent();
    if (!payload) {
      return;
    }
    await importPersonaYamlPayload(avatarId, payload);
    closeModal();
  });

  $textarea.trigger('focus');
}

function renderEmptyBindingPage(
  $container: JQuery<HTMLElement>,
  title: string,
  description: string,
  actionLabel: string = '请先点击顶部“绑定到当前角色”或“绑定到当前聊天”',
): void {
  $container.html(`
    <div class="persona-page-card persona-empty-card">
      <div class="panel-title compact">${escapeHtml(title)}</div>
      <div class="text-note">${escapeHtml(description)}</div>
      <div class="edit-actions-bar">
        <div class="persona-hint-row">${escapeHtml(actionLabel)}</div>
      </div>
    </div>
  `);
}

function truncatePreviewText(value: string, maxLength: number = 220): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function createEmbeddedResourceDetailHtml(name: string, metaLines: string[], extraHtml: string = ''): string {
  const rows = metaLines
    .filter(Boolean)
    .map(line => `<div class="persona-resource-meta-line">${escapeHtml(line)}</div>`)
    .join('');

  return `
    <div class="persona-embedded-detail">
      <div class="persona-resource-name persona-resource-name-compact">${escapeHtml(name || '未选中资源')}</div>
      <div class="persona-resource-meta">${rows || '<div class="persona-resource-meta-line">暂无更多信息</div>'}</div>
      ${extraHtml}
    </div>
  `;
}

function getScopeLabel(scope: ScopedSelectionScope): string {
  switch (scope) {
    case 'preset':
      return 'preset';
    case 'character':
      return 'character';
    default:
      return 'global';
  }
}

function describePresetPromptKind(prompt: PresetPrompt): string {
  const id = String(prompt.id || '');
  if (['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'].includes(id)) {
    return '系统';
  }
  if (
    [
      'worldInfoBefore',
      'personaDescription',
      'charDescription',
      'charPersonality',
      'scenario',
      'worldInfoAfter',
      'dialogueExamples',
      'chatHistory',
    ].includes(id)
  ) {
    return '占位';
  }
  return '普通';
}

function describePresetPromptPosition(prompt: PresetPrompt): string {
  if (!prompt.position) {
    return '固定位置';
  }
  if (prompt.position.type === 'in_chat') {
    return `聊天深度 ${prompt.position.depth} / 顺序 ${prompt.position.order}`;
  }
  return '相对位置';
}

function areOptionalNumberArraysEqual(left?: number[], right?: number[]): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every(value => rightSet.has(value));
}

function getLoadedPresetNameSafe(): string {
  try {
    return ((getLoadedPresetName() as string | undefined) || '').trim();
  } catch (error) {
    console.warn('绑定plus: 读取当前加载预设名失败', error);
    return '';
  }
}

function getPresetForUiSelection(presetName: string): {
  preset: Preset | null;
  source: 'saved' | 'loaded_in_use' | 'missing';
} {
  const normalizedName = (presetName || '').trim();
  if (!normalizedName) {
    return { preset: null, source: 'missing' };
  }

  try {
    if (isPresetNameAvailable(normalizedName)) {
      return { preset: getPreset(normalizedName), source: 'saved' };
    }
    if (getLoadedPresetNameSafe() === normalizedName) {
      return { preset: getPreset('in_use'), source: 'loaded_in_use' };
    }
  } catch (error) {
    console.warn('绑定plus: 读取预设详情失败', { presetName: normalizedName, error });
  }

  return { preset: null, source: 'missing' };
}

function getPresetPromptRows(presetName: string): Array<{
  key: string;
  prompt: PresetPrompt;
  source: 'prompts' | 'prompts_unused';
}> {
  const { preset } = getPresetForUiSelection(presetName);
  if (!preset) {
    return [];
  }

  return [
    ...preset.prompts.map(prompt => ({
      key: getPresetPromptStableId(prompt),
      prompt,
      source: 'prompts' as const,
    })),
    ...preset.prompts_unused.map(prompt => ({
      key: getPresetPromptStableId(prompt),
      prompt,
      source: 'prompts_unused' as const,
    })),
  ];
}

function getBindingWorldbookEnabledEntryUidsForUi(
  resources: PersonaContextBindingResources | undefined,
  worldbookName: string,
): number[] | undefined {
  const normalizedName = (worldbookName || '').trim();
  if (!normalizedName) {
    return undefined;
  }
  const matchedEntries = (resources?.worldbookEntries || []).filter(entry => entry.worldbookName === normalizedName);
  if (!matchedEntries.length) {
    return undefined;
  }
  return Array.from(
    new Set(matchedEntries.filter(entry => entry.enabled !== false).flatMap(entry => entry.entryUids || [])),
  );
}

function buildWorldbookEntrySnapshotBindings(
  worldbookName: string,
  enabledEntryUids: number[],
  allEntryUids: number[],
): PersonaPlusBindingWorldbookEntry[] {
  const normalizedName = (worldbookName || '').trim();
  if (!normalizedName) {
    return [];
  }

  const enabled = Array.from(new Set(enabledEntryUids.filter(uid => Number.isFinite(uid))));
  const all = Array.from(new Set(allEntryUids.filter(uid => Number.isFinite(uid))));
  const disabled = all.filter(uid => !enabled.includes(uid));
  const rows: PersonaPlusBindingWorldbookEntry[] = [];
  if (enabled.length > 0) {
    rows.push({
      worldbookName: normalizedName,
      entryUids: enabled,
      enabled: true,
    });
  }
  if (disabled.length > 0) {
    rows.push({
      worldbookName: normalizedName,
      entryUids: disabled,
      enabled: false,
    });
  }
  return rows;
}

function replaceWorldbookEntrySnapshotForWorldbook(
  entries: PersonaPlusBindingWorldbookEntry[] | undefined,
  worldbookName: string,
  nextEntries: PersonaPlusBindingWorldbookEntry[],
): PersonaPlusBindingWorldbookEntry[] {
  const normalizedName = (worldbookName || '').trim();
  const baseEntries = (entries || []).filter(entry => entry.worldbookName !== normalizedName);
  return [...baseEntries, ...nextEntries];
}

function getCurrentPresetPromptSelectionIds(
  presetName: string,
  binding?: PersonaContextBindingResources,
): string[] | undefined {
  const normalizedName = (presetName || '').trim();
  if (!normalizedName) {
    return undefined;
  }

  const parentDoc = window.parent.document;
  const $checkboxes = $('.plus-preset-prompt-checkbox', parentDoc);
  if ($checkboxes.length) {
    return $checkboxes
      .filter(':checked')
      .map((_, el) => (($(el).val() as string | undefined) || '').trim())
      .get()
      .filter(Boolean);
  }

  if (binding?.presetName === normalizedName && binding.presetEnabledPromptIds !== undefined) {
    return [...binding.presetEnabledPromptIds];
  }

  const { preset } = getPresetForUiSelection(normalizedName);
  if (!preset) {
    return [];
  }

  return preset.prompts
    .filter(prompt => prompt.enabled)
    .map(prompt => getPresetPromptStableId(prompt));
}

function syncPresetPromptControlsFromLoadedPreset(): void {
  const parentDoc = window.parent.document;
  if (activeDetailPage !== 'preset') {
    return;
  }

  const presetName = (activeResourceSelection.preset || '').trim();
  if (!presetName) {
    return;
  }

  const $checkboxes = $('.plus-preset-prompt-checkbox', parentDoc);
  if (!$checkboxes.length) {
    return;
  }

  const loadedPresetName = getLoadedPresetNameSafe();
  if (!loadedPresetName || loadedPresetName !== presetName) {
    return;
  }

  const activeBinding = getActiveEditingBinding();
  const hasBindingSnapshot =
    activeBinding?.resources.presetName === presetName && activeBinding.resources.presetEnabledPromptIds !== undefined;
  if (hasBindingSnapshot) {
    return;
  }

  const { preset } = getPresetForUiSelection(presetName);
  if (!preset) {
    return;
  }

  const livePromptIds = preset.prompts
    .filter((prompt: PresetPrompt) => prompt.enabled)
    .map((prompt: PresetPrompt) => getPresetPromptStableId(prompt));
  const checkedPromptIds = $checkboxes
    .filter(':checked')
    .map((_, el) => (($(el).val() as string | undefined) || '').trim())
    .get()
    .filter(Boolean);
  if (areOptionalStringArraysEqual(livePromptIds, checkedPromptIds)) {
    renderPresetPromptDefaultSnapshotState();
    return;
  }

  const livePromptIdSet = new Set(livePromptIds);
  $checkboxes.each(function () {
    const promptId = (($(this).val() as string | undefined) || '').trim();
    $(this).prop('checked', livePromptIdSet.has(promptId));
  });
  renderPresetPromptDefaultSnapshotState();
}

function getCurrentWorldbookEnabledEntryUids(
  worldbookName: string,
  binding?: PersonaContextBindingResources,
): number[] | undefined {
  const normalizedName = (worldbookName || '').trim();
  if (!normalizedName) {
    return undefined;
  }

  const parentDoc = window.parent.document;
  const $checkboxes = $('.plus-worldbook-entry-checkbox', parentDoc);
  if ($checkboxes.length) {
    return $checkboxes
      .filter(':checked')
      .map((_, el) => Number($(el).val()))
      .get()
      .filter(uid => Number.isFinite(uid));
  }

  const bindingSnapshot = getBindingWorldbookEnabledEntryUidsForUi(binding, normalizedName);
  if (bindingSnapshot !== undefined) {
    return bindingSnapshot;
  }

  return undefined;
}

function createApiConnectionSelectionDetailHtml(selectionId: string): string {
  if (!selectionId) {
    return createEmbeddedResourceDetailHtml('未选中 connection profile', [
      '请从左侧选择一个 connection profile',
      '这里绑定的是酒馆 connection profile，而不是直接写裸 API URL / Key / 模型。',
    ]);
  }

  const currentProfile = getCachedCurrentConnectionProfileName();
  return createEmbeddedResourceDetailHtml(selectionId, [
    `被 ${getReferencedBindings('api', selectionId).length} 个绑定使用`,
    currentProfile
      ? currentProfile === selectionId
        ? '当前酒馆正在使用这个 connection profile'
        : `当前酒馆正在使用 ${currentProfile}`
      : '当前酒馆未选 connection profile，或尚未刷新到最新状态',
  ]);
}

function renderApiLiveSummaryHtml(state: Awaited<ReturnType<typeof getApiConnectionDisplayState>>): string {
  const lines = [
    `当前 live profile: ${state.currentProfile || '<None>'}`,
    `当前 live API源: ${state.currentApi || (state.currentApiError ? `读取失败: ${state.currentApiError}` : '未知')}`,
    `当前 live 模型: ${state.currentModel || (state.currentModelError ? `读取失败: ${state.currentModelError}` : '未知')}`,
  ];

  if (state.currentProfileError) {
    lines.push(`当前 live profile 读取失败: ${state.currentProfileError}`);
  }

  return lines.map(line => `<div class="persona-hint-row">${escapeHtml(line)}</div>`).join('');
}

async function hydrateApiBindingPage(selectionId: string): Promise<void> {
  const parentDoc = window.parent.document;
  const $liveSummary = $('#persona-api-live-summary', parentDoc);
  const $profileSummary = $('#persona-api-profile-summary', parentDoc);
  const $profileJson = $('#persona-api-profile-json', parentDoc);

  if (!$liveSummary.length || !$profileSummary.length || !$profileJson.length) {
    return;
  }

  $liveSummary.html('<div class="text-note">正在读取当前 API 连接...</div>');
  $profileSummary.text('正在读取 profile 详情...');
  $profileJson.text('正在读取 profile 内容...');

  try {
    const state = await getApiConnectionDisplayState(selectionId || undefined);
    if (activeDetailPage !== 'api' || (activeResourceSelection.api || '') !== selectionId) {
      return;
    }

    $liveSummary.html(renderApiLiveSummaryHtml(state));

    if (!state.detailProfileName) {
      $profileSummary.text('当前没有可读取的 connection profile。');
      $profileJson.text('请选择左侧 profile，或先在酒馆里保存并切换到某个 connection profile。');
      return;
    }

    const detailSource =
      selectionId && selectionId === state.detailProfileName
        ? '当前选中 profile'
        : state.currentProfile && state.currentProfile === state.detailProfileName
          ? '当前 live profile'
          : '当前展示 profile';
    $profileSummary.text(`${detailSource}: ${state.detailProfileName}`);

    if (state.detailProfileError) {
      $profileJson.text(`读取 /profile-get 失败: ${state.detailProfileError}`);
      return;
    }

    $profileJson.text(state.detailProfileFormatted || state.detailProfileRaw || '该 profile 没有返回可展示的内容。');
  } catch (error) {
    if (activeDetailPage !== 'api' || (activeResourceSelection.api || '') !== selectionId) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    $liveSummary.html(`<div class="text-note">${escapeHtml(`读取当前 API 连接失败: ${message}`)}</div>`);
    $profileSummary.text('读取 profile 详情失败');
    $profileJson.text(message);
  }
}

function createPresetSelectionDetailHtml(selectionId: string): string {
  if (!selectionId) {
    return createEmbeddedResourceDetailHtml('未选中预设', ['请从左侧选择一个预设']);
  }

  const { preset, source } = getPresetForUiSelection(selectionId);
  if (!preset) {
    return createEmbeddedResourceDetailHtml(selectionId, [
      '当前酒馆中不存在这个预设',
      '如果这是旧绑定，请重新选择一个已有预设或删除该绑定里的预设项',
    ]);
  }

  const sourceLine = source === 'loaded_in_use' ? '当前加载的 in_use 尚未保存为真实预设，绑定时会先保存同名预设' : '';
  return createEmbeddedResourceDetailHtml(
    selectionId,
    [
      `被 ${getReferencedBindings('preset', selectionId).length} 个绑定使用`,
      sourceLine,
      `prompts ${preset.prompts.length} 条 · 未使用 ${preset.prompts_unused.length} 条`,
      `max_context ${preset.settings.max_context} · max_completion ${preset.settings.max_completion_tokens}`,
      `temperature ${preset.settings.temperature} · top_p ${preset.settings.top_p} · stream ${preset.settings.should_stream ? '开' : '关'}`,
    ].filter(Boolean),
  );
}

function showPresetPromptPreviewModal(presetName: string, promptKey: string): void {
  const normalizedPresetName = (presetName || '').trim();
  const normalizedPromptKey = (promptKey || '').trim();
  if (!normalizedPresetName || !normalizedPromptKey) {
    toastr.warning('未找到要查看的预设条目');
    return;
  }

  const row = getPresetPromptRows(normalizedPresetName).find(item => item.key === normalizedPromptKey);
  if (!row) {
    toastr.warning('找不到对应的预设条目内容');
    return;
  }

  const { prompt, source } = row;
  const title = prompt.name || String(prompt.id) || '未命名 prompt';
  const meta = `${describePresetPromptKind(prompt)} · ${prompt.role} · ${describePresetPromptPosition(prompt)}${source === 'prompts_unused' ? ' · 未加入预设' : ''}`;
  const parentDoc = window.parent.document;
  const modalHtml = `
    <div class="pool-edit-modal ${BINDINGPLUS_THEME_SCOPE_CLASS}">
      <div class="pool-edit-content persona-modal-content persona-prompt-preview-content">
        <div class="persona-modal-header">
          <div>
            <div class="persona-modal-eyebrow">预设条目内容</div>
            <h3>${escapeHtml(title)}</h3>
            <div class="persona-modal-subtitle">${escapeHtml(meta)}</div>
          </div>
        </div>
        <div class="form-group">
          <label>内容</label>
          <textarea class="persona-textarea" rows="14" readonly>${escapeHtml(prompt.content || '')}</textarea>
        </div>
        <div class="edit-actions-bar">
          <button class="persona-btn" id="preset-prompt-preview-close-btn" type="button">关闭</button>
        </div>
      </div>
      <div class="pool-edit-overlay"></div>
    </div>
  `;

  const $modal = $(modalHtml).appendTo($('body', parentDoc));
  applyBindingPlusModalPresentation($modal);
  const closeModal = () => $modal.remove();
  $('#preset-prompt-preview-close-btn', $modal).on('click', closeModal);
  $('.pool-edit-overlay', $modal).on('click', closeModal);
}

function showWorldbookEntryPreviewModal(worldbookName: string, entryUid: number): void {
  const normalizedWorldbookName = (worldbookName || '').trim();
  const normalizedUid = Number(entryUid);
  if (!normalizedWorldbookName || !Number.isFinite(normalizedUid)) {
    toastr.warning('未找到要查看的世界书条目');
    return;
  }

  void (async () => {
    try {
      const entries = await getWorldbookEntryCatalog(normalizedWorldbookName);
      const entry = entries.find(item => item.uid === normalizedUid);
      if (!entry) {
        toastr.warning('找不到对应的世界书条目内容');
        return;
      }

      const metaLines = [
        `uid ${entry.uid}`,
        entry.enabled ? '当前已启用' : '当前已关闭',
        entry.keys.length ? `主关键词：${entry.keys.join('、')}` : '',
        entry.secondaryKeys.length ? `次关键词：${entry.secondaryKeys.join('、')}` : '',
      ].filter(Boolean);
      const contentText = entry.content || entry.comment || '';
      const parentDoc = window.parent.document;
      const modalHtml = `
        <div class="pool-edit-modal ${BINDINGPLUS_THEME_SCOPE_CLASS}">
          <div class="pool-edit-content persona-modal-content persona-prompt-preview-content">
            <div class="persona-modal-header">
              <div>
                <div class="persona-modal-eyebrow">世界书条目内容</div>
                <h3>${escapeHtml(entry.label)}</h3>
                <div class="persona-modal-subtitle">${escapeHtml(metaLines.join(' · '))}</div>
              </div>
            </div>
            <div class="form-group">
              <label>内容</label>
              <textarea class="persona-textarea" rows="14" readonly>${escapeHtml(contentText)}</textarea>
            </div>
            <div class="edit-actions-bar">
              <button class="persona-btn" id="worldbook-entry-preview-close-btn" type="button">关闭</button>
            </div>
          </div>
          <div class="pool-edit-overlay"></div>
        </div>
      `;

      const $modal = $(modalHtml).appendTo($('body', parentDoc));
      applyBindingPlusModalPresentation($modal);
      const closeModal = () => $modal.remove();
      $('#worldbook-entry-preview-close-btn', $modal).on('click', closeModal);
      $('.pool-edit-overlay', $modal).on('click', closeModal);
    } catch (error) {
      toastr.error(error instanceof Error ? error.message : String(error));
    }
  })();
}

function findScriptById(nodes: ScriptTree[], scriptId: string): Script | null {
  for (const node of nodes) {
    if (node.type === 'folder') {
      const nested = findScriptById(node.scripts, scriptId);
      if (nested) {
        return nested;
      }
      continue;
    }
    if (node.id === scriptId) {
      return node;
    }
  }
  return null;
}

function createScriptSelectionDetailHtml(selectionId: string): string {
  if (!selectionId) {
    return createEmbeddedResourceDetailHtml('未选中脚本', ['请从左侧选择一个脚本']);
  }

  const { scope, id } = parseScopedSelectionValue(selectionId);
  const script = findScriptById(getScriptTrees({ type: scope }), id);
  if (!script) {
    return createEmbeddedResourceDetailHtml(id, [
      `作用域 ${getScopeLabel(scope)}`,
      '找不到对应脚本详情，可能已被移动或删除',
    ]);
  }

  const infoPreview = truncatePreviewText(script.info || '', 180);
  const contentPreview = truncatePreviewText(script.content || '', 360);
  const buttonCount = script.button?.buttons?.length || 0;
  const enabledButtonCount = script.button?.buttons?.filter(button => button.visible).length || 0;
  const dataKeys = script.data && typeof script.data === 'object' ? Object.keys(script.data).length : 0;

  return createEmbeddedResourceDetailHtml(
    script.name || id,
    [
      `作用域 ${getScopeLabel(scope)} · ${script.enabled ? '已启用' : '未启用'}`,
      `被 ${getReferencedBindings('scripts', selectionId).length} 个绑定使用`,
      `脚本按钮 ${buttonCount} 个 · 可见 ${enabledButtonCount} 个 · data 字段 ${dataKeys} 个`,
    ],
    `
      ${infoPreview ? `<div class="persona-detail-section-title">说明</div><div class="persona-detail-list-preview">${escapeHtml(infoPreview)}</div>` : ''}
      <div class="persona-detail-section-title">脚本内容预览</div>
      <pre class="persona-json-preview">${escapeHtml(contentPreview || '当前脚本没有内容。')}</pre>
    `,
  );
}

function createRegexSelectionDetailHtml(selectionId: string): string {
  if (!selectionId) {
    return createEmbeddedResourceDetailHtml('未选中正则', ['请从左侧选择一个正则']);
  }

  const { scope, id } = parseScopedSelectionValue(selectionId);
  const option =
    scope === 'preset'
      ? ({ type: 'preset', name: 'in_use' } as const)
      : scope === 'character'
        ? ({ type: 'character', name: 'current' } as const)
        : ({ type: 'global' } as const);
  const regex = getTavernRegexes(option).find(item => item.id === id);
  if (!regex) {
    return createEmbeddedResourceDetailHtml(id, [
      `作用域 ${getScopeLabel(scope)}`,
      '找不到对应正则详情，可能已被移动或删除',
    ]);
  }

  const sourceSummary = Object.entries(regex.source)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key)
    .join(', ');
  const destinationSummary = Object.entries(regex.destination)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key)
    .join(', ');

  return createEmbeddedResourceDetailHtml(
    regex.script_name || id,
    [
      `作用域 ${getScopeLabel(scope)} · ${regex.enabled ? '已启用' : '未启用'}`,
      `被 ${getReferencedBindings('regexes', selectionId).length} 个绑定使用`,
      `source ${sourceSummary || '无'} · destination ${destinationSummary || '无'}`,
      `run_on_edit ${regex.run_on_edit ? '开' : '关'} · depth ${regex.min_depth ?? '-'} ~ ${regex.max_depth ?? '-'}`,
    ],
    `
      <div class="persona-detail-section-title">查找</div>
      <pre class="persona-json-preview">${escapeHtml(regex.find_regex || '(空)')}</pre>
      <div class="persona-detail-section-title">替换</div>
      <pre class="persona-json-preview">${escapeHtml(regex.replace_string || '(空)')}</pre>
    `,
  );
}

function createContextBindingStorageItemHtml(binding: PersonaContextBinding): string {
  return `
    <div class="plus-probe-item persona-context-binding-storage-item" data-binding-id="${escapeHtml(binding.id)}">
      <div class="persona-context-binding-storage-head">
        <div>
          <div class="persona-context-binding-storage-title">${escapeHtml(getContextBindingDisplayLabel(binding))}</div>
          <div class="plus-probe-meta">${escapeHtml(summarizeContextBindingResources(binding.resources))}</div>
        </div>
        <button type="button" class="persona-btn small persona-context-binding-delete-btn" data-binding-id="${escapeHtml(binding.id)}">删除绑定</button>
      </div>
      <div class="plus-probe-meta">${escapeHtml(`targetId: ${binding.targetId || '空'}`)}</div>
      <div class="plus-probe-meta">${escapeHtml(`bindingId: ${binding.id}`)}</div>
      <div class="plus-probe-meta">${escapeHtml(`更新时间: ${formatTime(binding.updatedAt)}`)}</div>
    </div>
  `;
}

function createBindingItemSectionHtml(
  page: DetailPageKey,
  selectionId: string,
  options: {
    detailHtml?: string;
    contentHtml?: string;
    compactReferences?: boolean;
    showSaveButton?: boolean;
  } = {},
): string {
  const runtime = getRuntimeContext();
  const activeBinding = getActiveEditingBinding(runtime);
  const referencedBindings = getReferencedBindings(page, selectionId);
  const selectionHint = activeBinding
    ? `正在编辑${activeBindingScope === 'chat' ? '当前聊天' : '当前角色'}绑定 · ${getBindingTargetDisplay(activeBindingScope, runtime)}`
    : '请先点击顶部“绑定到当前角色”或“绑定到当前聊天”';

  const listHtml = referencedBindings.length
    ? referencedBindings
        .map(
          binding => `
          <div class="persona-binding-item ${binding.scope === activeBindingScope && binding.targetId === activeBinding?.targetId ? 'active' : ''}">
            <div class="persona-binding-item-title-row">
              <div class="persona-binding-item-title">${escapeHtml(binding.scope === 'chat' ? `聊天 · ${binding.targetName}` : `角色 · ${binding.targetName}`)}</div>
              <button type="button" class="persona-btn small persona-context-binding-delete-btn" data-binding-id="${escapeHtml(binding.id)}">删除绑定</button>
            </div>
            <div class="persona-binding-item-meta">${escapeHtml(summarizeContextBindingResources(binding.resources))}</div>
          </div>
        `,
        )
        .join('')
    : '<div class="empty-list">当前资源还没有被任何聊天/角色绑定使用。</div>';

  return `
    <div class="persona-page-card">
      <div class="panel-title">
        <span>当前编辑目标</span>
        <div class="inline-actions">
          ${options.showSaveButton === false ? '' : `<button class="persona-btn persona-binding-save-btn" ${activeBinding ? '' : 'disabled'}>保存到当前绑定</button>`}
        </div>
      </div>
      <div class="persona-resource-meta-line">${escapeHtml(selectionHint)}</div>
      ${activeBinding ? `<div class="persona-resource-meta-line">${escapeHtml(summarizeContextBindingResources(activeBinding.resources))}</div>` : ''}
      ${options.detailHtml || ''}
      ${options.contentHtml || ''}
      <div class="persona-binding-item-list${options.compactReferences ? ' compact' : ''}">${listHtml}</div>
    </div>
  `;
}

function renderApiBindingPage(
  $container: JQuery<HTMLElement>,
  _avatarId: string,
  _catalog: PlusBindingCatalog,
  _binding: PersonaContextBindingResources | undefined,
): void {
  const selectionId = activeResourceSelection.api || '';
  const currentProfile = getCachedCurrentConnectionProfileName();

  $container.html(`
    ${createBindingItemSectionHtml('api', selectionId, {
      detailHtml: createApiConnectionSelectionDetailHtml(selectionId),
      compactReferences: true,
      showSaveButton: false,
      contentHtml: `
      <div class="text-note">这里绑定的是酒馆 connection profile，会通过 <code>/profile</code> 切换；不直接写裸 API URL / Key / 模型。</div>
      <div class="text-note">如果你想让整套 API 连接配置随聊天 / 角色切换，请先在酒馆里把当前连接保存成 connection profile，再在这里绑定。</div>
      <div class="text-note"><code>/profile-get</code> 展示的是已保存的 profile 内容；当前 live API 源和模型以下方实时读取结果为准。</div>
      <div id="persona-api-live-summary">${currentProfile ? `<div class="persona-hint-row">${escapeHtml(`当前 live profile: ${currentProfile}`)}</div>` : '<div class="text-note">正在读取当前 API 连接...</div>'}</div>
      <div class="persona-detail-section-title">Profile 详情</div>
      <div class="persona-hint-row" id="persona-api-profile-summary">${selectionId ? `正在读取 ${escapeHtml(selectionId)} ...` : '未选中 profile，将尝试读取当前 live profile。'}</div>
      <pre id="persona-api-profile-json" class="persona-json-preview">正在读取 profile 内容...</pre>
      <div class="text-note">使用顶部“绑定到当前聊天 / 绑定到当前角色”来添加或移除当前选中的 connection profile。</div>
    `,
    })}
  `);

  void hydrateApiBindingPage(selectionId);
}

function renderPresetBindingPage(
  $container: JQuery<HTMLElement>,
  _avatarId: string,
  _catalog: PlusBindingCatalog,
  binding: PersonaContextBindingResources | undefined,
): void {
  const selectionId = activeResourceSelection.preset || '';
  const defaultPresetName = getDefaultPresetName();
  const { preset, source } = getPresetForUiSelection(selectionId);
  const promptRows =
    selectionId && preset
      ? preset.prompts.map((prompt: PresetPrompt) => ({
          key: getPresetPromptStableId(prompt),
          prompt,
          source: 'prompts' as const,
        }))
      : [];
  const selectedPromptIds = new Set(
    getCurrentPresetPromptSelectionIds(selectionId, binding) ||
      promptRows.filter(item => item.prompt.enabled).map(item => item.key),
  );
  const missingPresetNote =
    selectionId && !preset
      ? '<div class="persona-hint-row">当前绑定指向的预设不存在。请在左侧选择已有预设，或删除这个旧绑定中的预设项。</div>'
      : '';
  const unsavedLoadedPresetNote =
    selectionId && source === 'loaded_in_use'
      ? '<div class="persona-hint-row">当前加载预设尚未保存为真实预设；点击绑定时会先保存当前 in_use。</div>'
      : '';
  const promptListHtml = promptRows.length
    ? promptRows
        .map(item => {
          const title = item.prompt.name || String(item.prompt.id) || '未命名 prompt';
          const meta = `${describePresetPromptKind(item.prompt)} · ${item.prompt.role} · ${describePresetPromptPosition(item.prompt)}`;
          return `
            <label class="persona-modal-check-card persona-prompt-check-card" data-filter-text="${escapeHtml(`${title} ${meta} ${item.prompt.content || ''}`.toLowerCase())}">
              <div class="persona-modal-check-copy">
                <div class="persona-prompt-check-header">
                  <div class="persona-check-title-block">
                    <div class="persona-check-title-row">
                      <input type="checkbox" class="plus-preset-prompt-checkbox" value="${escapeHtml(item.key)}" ${selectedPromptIds.has(item.key) ? 'checked' : ''}>
                      <div class="persona-modal-check-title">${escapeHtml(title)}</div>
                    </div>
                    <div class="persona-detail-list-meta">${escapeHtml(meta)}</div>
                  </div>
                  <button
                    type="button"
                    class="persona-btn small persona-prompt-preview-btn"
                    data-preset-name="${escapeHtml(selectionId)}"
                    data-prompt-key="${escapeHtml(item.key)}"
                  >查看内容</button>
                </div>
              </div>
            </label>
          `;
        })
        .join('')
    : '<div class="text-note">当前预设没有可编辑的 prompt。</div>';

  $container.html(`
    ${createBindingItemSectionHtml('preset', selectionId, {
      detailHtml: createPresetSelectionDetailHtml(selectionId),
      compactReferences: true,
      contentHtml: `
      <div class="persona-hint-row">${defaultPresetName ? `当前默认预设: ${escapeHtml(defaultPresetName)}` : '当前还没有默认预设。可在顶栏设置。'}</div>
      <div class="text-note">顶部“绑定到当前聊天 / 绑定到当前角色”会把当前预设和下面这组 prompt 开关快照一起写入绑定。</div>
      ${missingPresetNote}
      ${unsavedLoadedPresetNote}
      <div class="edit-actions-bar">
        <input type="text" class="persona-input persona-inline-search" id="persona-preset-prompt-search" placeholder="搜索预设条目名称、角色或内容">
        <button class="persona-btn" id="persona-save-default-preset-prompts-btn" type="button" ${selectionId ? '' : 'disabled'}>保存为默认预设条目状态</button>
      </div>
      <div class="persona-hint-row" id="persona-default-preset-prompts-status">默认预设条目状态：-</div>
      <div class="persona-detail-section-title">Prompt 条目开关</div>
      <div class="persona-modal-checkbox-list persona-prompt-checkbox-list">${promptListHtml}</div>
      <div class="empty-list persona-modal-empty" id="persona-preset-prompt-empty" style="display:none;">没有匹配的预设条目</div>
    `,
    })}
  `);

  renderPresetPromptDefaultSnapshotState();
  applyPresetPromptFilter();
  syncPresetPromptControlsFromLoadedPreset();
}

function renderScriptsBindingPage(
  $container: JQuery<HTMLElement>,
  _avatarId: string,
  _catalog: PlusBindingCatalog,
  _binding: PersonaContextBindingResources | undefined,
): void {
  const selectionId = activeResourceSelection.scripts || '';

  $container.html(`
    ${createBindingItemSectionHtml('scripts', selectionId, {
      detailHtml: createScriptSelectionDetailHtml(selectionId),
      compactReferences: true,
      showSaveButton: false,
      contentHtml: `
      <div class="text-note">使用顶部“绑定到当前聊天 / 绑定到当前角色”来添加或移除当前选中的脚本。</div>
    `,
    })}
  `);
}

function renderRegexBindingPage(
  $container: JQuery<HTMLElement>,
  _avatarId: string,
  _catalog: PlusBindingCatalog,
  _binding: PersonaContextBindingResources | undefined,
): void {
  const selectionId = activeResourceSelection.regexes || '';

  $container.html(`
    ${createBindingItemSectionHtml('regexes', selectionId, {
      detailHtml: createRegexSelectionDetailHtml(selectionId),
      compactReferences: true,
      showSaveButton: false,
      contentHtml: `
      <div class="text-note">使用顶部“绑定到当前聊天 / 绑定到当前角色”来添加或移除当前选中的正则。</div>
    `,
    })}
  `);
}

function appendWorldbookEntryBindingRow(
  $container: JQuery<HTMLElement>,
  catalog: PlusBindingCatalog,
  binding?: PersonaPlusBindingWorldbookEntry,
): void {
  const rowId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const $row = $(createWorldbookEntryBindingRowHtml(rowId, catalog, binding)).appendTo($container);
  void hydrateWorldbookEntryBindingRow($row, binding);
}

function renderWorldbookBindingPage(
  $container: JQuery<HTMLElement>,
  _avatarId: string,
  catalog: PlusBindingCatalog,
  binding: PersonaContextBindingResources | undefined,
): void {
  const selectionId = activeResourceSelection.worldbooks || '';
  const selectedOption = catalog.worldbooks.find(option => option.id === selectionId);
  const referencedBindings = getReferencedBindings('worldbooks', selectionId);

  $container.html(`
    ${createBindingItemSectionHtml('worldbooks', selectionId, {
      detailHtml: createEmbeddedResourceDetailHtml(selectedOption?.label || '未选中世界书', [
        `被 ${referencedBindings.length} 个绑定使用`,
        selectionId ? `世界书名 ${selectionId}` : '请从左侧选择一个世界书',
      ]),
      compactReferences: true,
      showSaveButton: true,
      contentHtml: `
      <div class="text-note">顶部“绑定到当前聊天 / 绑定到当前角色”会把当前世界书本体和下面这组条目开关快照一起写入绑定。</div>
      <div class="edit-actions-bar">
        <input type="text" class="persona-input persona-inline-search" id="persona-worldbook-entry-search" placeholder="搜索世界书条目名称、uid、关键词">
        <button class="persona-btn" id="persona-save-default-worldbook-entries-btn" type="button" ${selectionId ? '' : 'disabled'}>保存为默认世界书条目状态</button>
      </div>
      <div class="persona-hint-row" id="persona-default-worldbook-entries-status">默认世界书条目状态：-</div>
      <div class="persona-detail-section-title">世界书条目开关</div>
      <div id="persona-worldbook-entry-checkboxes" class="persona-modal-checkbox-list"><div class="text-note">请选择世界书后加载条目</div></div>
      <div class="empty-list persona-modal-empty" id="persona-worldbook-entry-empty" style="display:none;">没有匹配的世界书条目</div>
    `,
    })}
  `);

  void hydrateSelectedWorldbookDetail(selectionId, binding);
}

async function hydrateSelectedWorldbookDetail(
  worldbookName: string,
  binding?: PersonaContextBindingResources,
): Promise<void> {
  const parentDoc = window.parent.document;
  const $checkboxes = $('#persona-worldbook-entry-checkboxes', parentDoc);
  if (!$checkboxes.length) {
    return;
  }

  if (!worldbookName) {
    $checkboxes.html('<div class="text-note">请选择世界书后加载条目</div>');
    renderWorldbookEntryDefaultSnapshotState();
    return;
  }

  $checkboxes.html('<div class="text-note">正在加载条目开关...</div>');
  try {
    const entries = await getWorldbookEntryCatalog(worldbookName);
    const selectedEntryUids =
      getBindingWorldbookEnabledEntryUidsForUi(binding, worldbookName) ||
      entries.filter(entry => entry.enabled).map(entry => entry.uid);
    if (entries.length === 0) {
      $checkboxes.html('<div class="text-note">该世界书没有条目。</div>');
      renderWorldbookEntryDefaultSnapshotState();
      return;
    }
    const selectedSet = new Set(selectedEntryUids);
    $checkboxes.html(
      entries
        .map(
          entry => `
            <label class="persona-modal-check-card persona-worldbook-entry-check-card" data-filter-text="${escapeHtml(`${entry.label} ${entry.uid} ${entry.keys.join(' ')} ${entry.secondaryKeys.join(' ')} ${entry.comment} ${entry.content}`.toLowerCase())}">
              <div class="persona-modal-check-copy">
                <div class="persona-prompt-check-header">
                  <div class="persona-check-title-block">
                    <div class="persona-check-title-row">
                      <input type="checkbox" class="plus-worldbook-entry-checkbox" value="${entry.uid}" ${selectedSet.has(entry.uid) ? 'checked' : ''}>
                      <div class="persona-modal-check-title">${escapeHtml(entry.label)}</div>
                    </div>
                    <div class="persona-detail-list-meta">${escapeHtml(`uid ${entry.uid} · 当前${entry.enabled ? '已启用' : '已关闭'}${entry.keys.length ? ` · 关键词 ${entry.keys.slice(0, 3).join(' / ')}` : ''}`)}</div>
                  </div>
                  <button
                    type="button"
                    class="persona-btn small persona-worldbook-entry-preview-btn"
                    data-worldbook-name="${escapeHtml(worldbookName)}"
                    data-entry-uid="${entry.uid}"
                  >查看内容</button>
                </div>
              </div>
            </label>
          `,
        )
        .join(''),
    );
    renderWorldbookEntryDefaultSnapshotState();
    applyWorldbookEntryFilter();
  } catch (error) {
    $checkboxes.html(
      `<div class="text-note">加载失败: ${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`,
    );
    renderWorldbookEntryDefaultSnapshotState();
    applyWorldbookEntryFilter();
  }
}

function renderBindingGroupEmptyStateHtml(): string {
  return `
    <div class="persona-page-card">
      <div class="panel-title">
        <span>绑定组</span>
        <div class="inline-actions binding-group-top-actions">
          <button class="persona-btn" id="binding-group-new-btn" type="button">新建绑定组</button>
        </div>
      </div>
      <div class="binding-group-empty-state">
        <div class="empty-list">还没有绑定组。可使用右上角把当前聊天/角色绑定内容导出为绑定组。</div>
      </div>
    </div>
  `;
}

function renderBindingGroupPage($container: JQuery<HTMLElement>): void {
  const selectedGroup = getSelectedBindingGroup();

  if (!selectedGroup) {
    $container.html(renderBindingGroupEmptyStateHtml());
    return;
  }

  const catalog = getCachedPlusBindingCatalog();
  const resources = cloneBindingResources(selectedGroup.resources);
  const personas = getPersonaListFromDOM().map(persona => ({
    id: persona.avatarId || '',
    label: persona.name || persona.avatarId || '未命名 user 人设',
  }));
  const selectedPersonaAvatarId = resources.userPersonaAvatarId || '';

  $container.html(`
    <div class="persona-page-card">
      <div class="panel-title">
        <span>绑定组</span>
        <div class="inline-actions binding-group-top-actions">
          <button class="persona-btn" id="binding-group-new-btn" type="button">新建</button>
          <button class="persona-btn" id="binding-group-save-btn" type="button">保存</button>
          <button class="persona-btn" id="binding-group-delete-btn" type="button">删除</button>
        </div>
      </div>
      <div class="binding-group-header-meta">${escapeHtml(`当前组：${selectedGroup.name}`)}</div>
      <div class="binding-group-header-meta">${escapeHtml(summarizeContextBindingResources(resources))}</div>
      <div class="text-note">应用和导出请使用右上角按钮；这里编辑的是绑定组自己的资源快照。</div>
      <div class="binding-group-sections">
        <div class="form-group">
          <label for="binding-group-name-input">绑定组名称</label>
          <input type="text" class="persona-input" id="binding-group-name-input" value="${escapeHtml(selectedGroup.name)}">
        </div>

        <div class="form-group">
          <div class="persona-detail-section-title">user 人设</div>
          <select class="persona-input" id="binding-group-persona-select">
            ${renderSelectOptions(personas, selectedPersonaAvatarId, '不绑定 user 人设')}
          </select>
        </div>
        <div class="two-col-grid">
          <div class="form-group">
            <div class="persona-detail-section-title">当前人设条目快照</div>
            <div class="checkbox-list" id="binding-group-persona-traits">
              ${buildBindingGroupPersonaTraitListHtml(selectedPersonaAvatarId, resources.userPersonaEnabledTraitIds || [])}
            </div>
          </div>
          <div class="form-group">
            <div class="persona-detail-section-title">通用条目快照</div>
            <div class="checkbox-list" id="binding-group-persona-shared-traits">
              ${buildBindingGroupSharedTraitListHtml(resources.userPersonaEnabledSharedTraitIds || [])}
            </div>
          </div>
        </div>

        <div class="two-col-grid">
          <div class="form-group">
            <label for="binding-group-connection-profile-select">API 连接</label>
            <select class="persona-input" id="binding-group-connection-profile-select">
              ${renderSelectOptions(catalog.connectionProfiles, resources.connectionProfileName, '不绑定 connection profile')}
            </select>
          </div>
          <div class="form-group">
            <label for="binding-group-preset-select">预设</label>
            <select class="persona-input" id="binding-group-preset-select">
              ${renderSelectOptions(catalog.presets, resources.presetName, '不绑定预设')}
            </select>
            <div class="text-note">${escapeHtml(resources.presetEnabledPromptIds !== undefined ? `已记录预设条目快照 ${resources.presetEnabledPromptIds.length} 条` : '未记录预设条目快照')}</div>
          </div>
        </div>

        <div class="two-col-grid">
          <div class="form-group">
            <div class="persona-detail-section-title">酒馆助手脚本</div>
            <div class="persona-detail-list-meta">global</div>
            ${createBindingGroupCheckboxRowsHtml(catalog.scripts.global, resources.scripts?.global, 'plus-script-global-checkbox', '没有 global 脚本')}
            <div class="persona-detail-list-meta">preset</div>
            ${createBindingGroupCheckboxRowsHtml(catalog.scripts.preset, resources.scripts?.preset, 'plus-script-preset-checkbox', '没有 preset 脚本')}
            <div class="persona-detail-list-meta">character</div>
            ${createBindingGroupCheckboxRowsHtml(catalog.scripts.character, resources.scripts?.character, 'plus-script-character-checkbox', '没有 character 脚本')}
          </div>
          <div class="form-group">
            <div class="persona-detail-section-title">酒馆正则</div>
            <div class="persona-detail-list-meta">global</div>
            ${createBindingGroupCheckboxRowsHtml(catalog.regexes.global, resources.regexes?.global, 'plus-regex-global-checkbox', '没有 global 正则')}
            <div class="persona-detail-list-meta">preset</div>
            ${createBindingGroupCheckboxRowsHtml(catalog.regexes.preset, resources.regexes?.preset, 'plus-regex-preset-checkbox', '没有 preset 正则')}
            <div class="persona-detail-list-meta">character</div>
            ${createBindingGroupCheckboxRowsHtml(catalog.regexes.character, resources.regexes?.character, 'plus-regex-character-checkbox', '没有 character 正则')}
          </div>
        </div>

        <div class="form-group">
          <div class="persona-detail-section-title">世界书</div>
          <div class="two-col-grid">
            <div>
              <div class="persona-detail-list-meta">全局世界书</div>
              ${createBindingGroupCheckboxRowsHtml(catalog.worldbooks, resources.worldbooks?.global, 'plus-worldbook-global-checkbox', '没有可选世界书')}
            </div>
            <div>
              <label for="binding-group-worldbook-character-primary-select">角色主世界书</label>
              <select class="persona-input" id="binding-group-worldbook-character-primary-select">
                ${renderSelectOptions(catalog.worldbooks, resources.worldbooks?.characterPrimary, '不绑定角色主世界书')}
              </select>
              <label for="binding-group-worldbook-chat-select">聊天世界书</label>
              <select class="persona-input" id="binding-group-worldbook-chat-select">
                ${renderSelectOptions(catalog.worldbooks, resources.worldbooks?.chat, '不绑定聊天世界书')}
              </select>
              <div class="persona-detail-list-meta">角色附加世界书</div>
              ${createBindingGroupCheckboxRowsHtml(catalog.worldbooks, resources.worldbooks?.characterAdditional, 'plus-worldbook-character-additional-checkbox', '没有可选世界书')}
            </div>
          </div>
        </div>

        <div class="form-group">
          <div class="panel-title compact">
            <span>世界书条目</span>
            <div class="inline-actions">
              <button class="persona-btn" id="persona-worldbook-entry-add-btn" type="button">添加条目组</button>
            </div>
          </div>
          <div class="plus-entry-bindings-container" id="persona-worldbook-entry-groups">
            <div class="text-note">未记录世界书条目快照。</div>
          </div>
        </div>
      </div>
    </div>
  `);

  const $entryContainer = $('#persona-worldbook-entry-groups', window.parent.document);
  if (resources.worldbookEntries?.length) {
    $entryContainer.empty();
    resources.worldbookEntries.forEach(entry => {
      appendWorldbookEntryBindingRow($entryContainer, catalog, entry);
    });
  }
}

function getBindingGroupEditorRoot(): JQuery<HTMLElement> {
  return $('#persona-groups-page-body', window.parent.document);
}

async function applyBindingGroupToCurrentScope(scope: 'chat' | 'character'): Promise<void> {
  try {
    const selectedGroup = getSelectedBindingGroup();
    if (!selectedGroup) {
      toastr.warning('请先在左侧选择一个绑定组');
      return;
    }

    const runtime = getRuntimeContext();
    const currentBinding = getCurrentContextBinding(scope, runtime);
    const mergedResources = mergeBindingGroupResources(
      cloneBindingResources(currentBinding?.resources),
      selectedGroup.resources,
    );
    const saved = upsertContextBinding(scope, mergedResources, runtime);
    if (!saved) {
      toastr.error(`应用到当前${scope === 'chat' ? '聊天' : '角色'}失败`);
      return;
    }

    activeBindingScope = scope;
    renderToolbarSelectionSummary();
    renderResourceDetailPages();
    const applied = await applyPersonaPlusBindingsWithToast(
      getCurrentPersonaFromDOM()?.avatarId || getEditingAvatarId() || '',
      runtime,
      true,
      `应用当前${scope === 'chat' ? '聊天' : '角色'}绑定组失败`,
    );
    if (!applied) {
      return;
    }
    const currentPersona = getCurrentPersonaFromDOM();
    if (currentPersona?.avatarId) {
      const synced = await applyComposedDescriptionForAvatar(
        currentPersona.avatarId,
        `应用绑定组到当前${scope === 'chat' ? '聊天' : '角色'}后自动同步`,
        {
          errorToastTitle: `同步当前${scope === 'chat' ? '聊天' : '角色'}绑定组后的 user人设失败`,
        },
      );
      if (!synced) {
        return;
      }
    }
    toastr.success(`已把绑定组「${selectedGroup.name}」应用到当前${scope === 'chat' ? '聊天' : '角色'}`);
  } catch (error) {
    showUiErrorToast(`应用当前${scope === 'chat' ? '聊天' : '角色'}绑定组失败`, error);
  }
}

async function exportCurrentBindingToGroup(scope: 'chat' | 'character'): Promise<void> {
  const runtime = getRuntimeContext();
  const currentBinding = getCurrentContextBinding(scope, runtime);
  if (!currentBinding) {
    toastr.warning(`当前${scope === 'chat' ? '聊天' : '角色'}还没有可导出的绑定`);
    return;
  }

  const selectedGroup = getSelectedBindingGroup();
  const nextName = selectedGroup
    ? selectedGroup.name
    : buildUniqueBindingGroupName(`${scope === 'chat' ? '聊天绑定组' : '角色绑定组'} · ${currentBinding.targetName}`);
  const saved = upsertBindingGroup({
    id: selectedGroup?.id,
    name: nextName,
    resources: cloneBindingResources(currentBinding.resources),
  });
  if (!saved) {
    toastr.error('导出绑定组失败');
    return;
  }

  activeResourceSelection.groups = saved.id;
  renderSidebarSecondaryList();
  renderToolbarSelectionSummary();
  renderResourceDetailPages();
  toastr.success(
    selectedGroup
      ? `已用当前${scope === 'chat' ? '聊天' : '角色'}绑定覆盖绑定组「${saved.name}」`
      : `已从当前${scope === 'chat' ? '聊天' : '角色'}绑定新建绑定组「${saved.name}」`,
  );
}

function createNewBindingGroup(): void {
  const nextGroup = upsertBindingGroup({
    name: buildUniqueBindingGroupName('新绑定组'),
    resources: createEmptyBindingResources(),
  });
  if (!nextGroup) {
    toastr.error('新建绑定组失败');
    return;
  }

  activeResourceSelection.groups = nextGroup.id;
  renderSidebarSecondaryList();
  renderToolbarSelectionSummary();
  renderResourceDetailPages();
  toastr.success(`已创建绑定组「${nextGroup.name}」`);
}

function saveActiveBindingGroupFromPage(): void {
  const selectedGroup = getSelectedBindingGroup();
  if (!selectedGroup) {
    toastr.warning('请先在左侧选择一个绑定组');
    return;
  }

  const $root = getBindingGroupEditorRoot();
  const groupName = (($root.find('#binding-group-name-input').val() as string | undefined) || '').trim();
  if (!groupName) {
    toastr.warning('请输入绑定组名称');
    return;
  }

  const saved = upsertBindingGroup({
    id: selectedGroup.id,
    name: buildUniqueBindingGroupName(groupName, selectedGroup.id),
    resources: collectBindingGroupResourcesFromRoot($root, selectedGroup.resources),
  });
  if (!saved) {
    toastr.error('保存绑定组失败');
    return;
  }

  activeResourceSelection.groups = saved.id;
  renderSidebarSecondaryList();
  renderToolbarSelectionSummary();
  renderResourceDetailPages();
  toastr.success(`已保存绑定组「${saved.name}」`);
}

function deleteActiveBindingGroup(): void {
  const selectedGroup = getSelectedBindingGroup();
  if (!selectedGroup) {
    toastr.warning('请先在左侧选择一个绑定组');
    return;
  }

  if (!deleteBindingGroup(selectedGroup.id)) {
    toastr.error('删除绑定组失败');
    return;
  }

  const nextGroup = loadBindingGroups()[0];
  activeResourceSelection.groups = nextGroup?.id || '';
  renderSidebarSecondaryList();
  renderToolbarSelectionSummary();
  renderResourceDetailPages();
  toastr.success(`已删除绑定组「${selectedGroup.name}」`);
}

function renderBindingPages(binding: PersonaContextBinding | null, page: DetailPageKey = activeDetailPage): void {
  const parentDoc = window.parent.document;
  const $api = $('#persona-api-page-body', parentDoc);
  const $preset = $('#persona-preset-page-body', parentDoc);
  const $scripts = $('#persona-scripts-page-body', parentDoc);
  const $regexes = $('#persona-regexes-page-body', parentDoc);
  const $worldbooks = $('#persona-worldbooks-page-body', parentDoc);
  const $groups = $('#persona-groups-page-body', parentDoc);
  const bindingResources = binding?.resources;

  if (page === 'groups') {
    renderBindingGroupPage($groups);
    return;
  }

  if (!['api', 'preset', 'scripts', 'regexes', 'worldbooks'].includes(page)) {
    return;
  }

  if (!binding) {
    if (page === 'api') {
      const catalog = getCachedPlusBindingCatalog();
      renderApiBindingPage($api, '', catalog, undefined);
      return;
    } else if (page === 'preset') {
      const catalog = getCachedPlusBindingCatalog();
      renderPresetBindingPage($preset, '', catalog, undefined);
      return;
    } else if (page === 'scripts') {
      renderEmptyBindingPage($scripts, '酒馆助手脚本', '请先点击顶部“绑定到当前角色”或“绑定到当前聊天”。');
    } else if (page === 'regexes') {
      renderEmptyBindingPage($regexes, '酒馆正则', '请先点击顶部“绑定到当前角色”或“绑定到当前聊天”。');
    } else if (page === 'worldbooks') {
      const catalog = getCachedPlusBindingCatalog();
      renderWorldbookBindingPage($worldbooks, '', catalog, undefined);
      return;
    }
    return;
  }

  const catalog = getCachedPlusBindingCatalog();
  if (page === 'api') {
    renderApiBindingPage($api, '', catalog, bindingResources);
    return;
  }
  if (page === 'preset') {
    renderPresetBindingPage($preset, '', catalog, bindingResources);
    return;
  }
  if (page === 'scripts') {
    renderScriptsBindingPage($scripts, '', catalog, bindingResources);
    return;
  }
  if (page === 'regexes') {
    renderRegexBindingPage($regexes, '', catalog, bindingResources);
    return;
  }
  if (page === 'worldbooks') {
    renderWorldbookBindingPage($worldbooks, '', catalog, bindingResources);
  }
}

function renderProfileWorkspace(avatarId: string): void {
  void avatarId;
  renderSidebarSecondaryList();
}

function renderResourceDetailPages(): void {
  if (activeDetailPage === 'persona') {
    renderSnapshotSection(getEditingAvatarId());
    return;
  }

  renderBindingPages(getActiveEditingBinding(), activeDetailPage);
}

// ==================== 面板控制函数 ====================

export function showPanel(): void {
  const parentDoc = window.parent.document;
  bindingPlusDrawerOpen = false;
  personaFolderDrawerOpen = false;

  panelStyleDestroy?.();
  panelStyleDestroy = teleportStyle().destroy;

  $panelContainer?.remove();
  $panelContainer = createScriptIdDiv();
  $panelContainer.html(createPanelHtml());
  $('body', parentDoc).append($panelContainer);

  bindPanelEvents();
  renderBindingPlusThemeSection();
  applyBindingPlusThemeToDom(parentDoc);
  syncBindingPlusLayoutMode();
  syncActiveDetailPageUi();
  renderRuntimeContextHeader();
  refreshCompatibilitySection();
  renderPlusBindingSection();
  renderApiConfigSelfTestSection();
  void refreshPlusBindingSection();
  void refreshApiConnectionCatalog({ quiet: true, rerender: activeDetailPage === 'api' });
  lastContextSignature = buildContextSignature();

  console.log('用户设定脚本: 面板已显示');
}

export function hidePanel(): void {
  const parentDoc = window.parent.document;
  const $button = $(`#${PERSONA_BUTTON_ID}`, parentDoc);
  bindingPlusDrawerOpen = false;
  personaFolderDrawerOpen = false;

  $(window.parent).off(PANEL_EVENT_NAMESPACE);

  $panelContainer?.remove();
  $panelContainer = null;
  panelStyleDestroy?.();
  panelStyleDestroy = null;

  if ($button.length) {
    $button.removeClass('active');
  }
}

export function togglePanel(): void {
  const parentDoc = window.parent.document;
  const $panel = $(`#${PERSONA_PANEL_ID}`, parentDoc);
  const $button = $(`#${PERSONA_BUTTON_ID}`, parentDoc);

  if ($panel.length > 0) {
    hidePanel();
    if ($button.length) {
      $button.removeClass('active');
    }
  } else {
    showPanel();
    if ($button.length) {
      $button.addClass('active');
    }
  }
}

async function renderPersonaList(autoSelectCurrent: boolean = false): Promise<void> {
  if (activeDetailPage !== 'persona') {
    return;
  }

  const parentDoc = window.parent.document;
  const listContainer = $('#persona-list-container', parentDoc);
  const keyword = personaSearchKeyword.trim().toLowerCase();
  const personas = getPersonaListFromDOM().filter(persona => {
    if (!keyword) {
      return true;
    }
    const haystack = `${persona.name || ''}\n${persona.description || ''}`.toLowerCase();
    return haystack.includes(keyword);
  });

  listContainer.empty();

  if (personas.length === 0) {
    listContainer.html(`<div class="empty-list">${keyword ? '没有匹配的 user 人设' : '未找到 user 人设信息'}</div>`);
    return;
  }

  personas.forEach(persona => listContainer.append(createPersonaItemHtml(persona)));

  $('.persona-list-item', listContainer)
    .off(`click${PANEL_EVENT_NAMESPACE}`)
    .on(`click${PANEL_EVENT_NAMESPACE}`, async function () {
      const avatarId = ($(this).attr('data-avatar-id') || '').trim();
      const persona = findPersonaByAvatarId(avatarId);
      if (!persona || !avatarId) {
        return;
      }

      if (!persona.isSelected) {
        const switched = await selectPersonaInParentUI(avatarId);
        if (!switched) {
          return;
        }
      }

      $('.persona-list-item', listContainer).removeClass('active');
      $(`.persona-list-item[data-avatar-id="${avatarId}"]`, listContainer).addClass('active');

      renderRuntimeContextHeader();
      await selectPersonaForEdit(avatarId);
      toggleBindingPlusDrawer(false);
    });

  if (autoSelectCurrent) {
    const current = personas.find(p => p.isSelected);
    if (current?.avatarId) {
      await selectPersonaForEdit(current.avatarId);
      $(`.persona-list-item[data-avatar-id="${current.avatarId}"]`, listContainer).addClass('active');
    } else if (personas[0]?.avatarId) {
      await selectPersonaForEdit(personas[0].avatarId);
      $(`.persona-list-item[data-avatar-id="${personas[0].avatarId}"]`, listContainer).addClass('active');
    }
  }
}

async function selectPersonaForEdit(avatarId: string): Promise<void> {
  const parentDoc = window.parent.document;
  const persona = findPersonaByAvatarId(avatarId);
  if (!persona || !avatarId) {
    return;
  }

  const fallbackDescription = persona.description || '';
  const baseDescription = loadPersonaBaseDescription(avatarId, extractBaseDescriptionFromComposed(fallbackDescription));

  $('#edit-persona-name', parentDoc).val(persona.name);
  $('#edit-persona-desc', parentDoc).val(baseDescription);
  $('#edit-persona-base-desc', parentDoc).val(baseDescription);
  $('#edit-persona-original-name', parentDoc).val(persona.name);
  $('#edit-persona-avatar', parentDoc).val(avatarId);
  $('#persona-name-input', parentDoc).val(persona.name);
  renderPersonaDefaultButtonState(avatarId);
  renderPersonaDefaultTraitSnapshotState(avatarId);
  renderRuntimeContextHeader();

  renderPersonaTraits(avatarId);
  renderSnapshotSection(avatarId);
  renderResourceDetailPages();
  await applyComposedDescriptionForAvatar(avatarId, '切换角色编辑时同步描述');
}

function renderPersonaTraits(avatarId: string): void {
  const parentDoc = window.parent.document;
  const container = $('#persona-traits-container', parentDoc);
  if (!container.length) {
    return;
  }

  const scope = activePersonaTraitScope;
  const localTraits = loadPersonaTraits(avatarId);
  const config = loadPersonaAdvancedConfig(avatarId);
  const sharedConfig = loadSharedPersonaTraitsConfig();
  const enabledSharedTraitIds = new Set(loadEnabledSharedTraitIds(avatarId));
  const traits: PersonaTrait[] =
    scope === 'shared'
      ? sharedConfig.traits.map(trait => ({
          ...trait,
          enabled: enabledSharedTraitIds.has(trait.id),
        }))
      : localTraits;
  const folders = scope === 'shared' ? sharedConfig.folders : config.profiles;
  const activation = getPersonaActivationState(avatarId);
  const context = getRuntimeContext();
  const effectiveTraitIds =
    scope === 'shared' ? new Set(loadEnabledSharedTraitIds(avatarId)) : new Set(activation.effectiveTraitIds);
  const matchedRuleIds = new Set(activation.matchedRuleIds);
  const folderViews = buildPersonaFolderViews(traits, folders);

  $('.persona-trait-scope-tab', parentDoc).removeClass('active');
  $(`.persona-trait-scope-tab[data-trait-scope="${scope}"]`, parentDoc).addClass('active');

  container.empty();
  if (traits.length === 0 && folders.length === 0) {
    container.html(
      `<div class="empty-list">${scope === 'shared' ? '暂无通用条目或通用文件夹' : '暂无条目或文件夹'}</div>`,
    );
    updateAutoStatusText(avatarId);
    renderPersonaDefaultTraitSnapshotState(avatarId);
    renderProfileWorkspace(avatarId);
    return;
  }

  const activeFolderId = ensureActivePersonaFolderId(avatarId, folderViews, scope);
  const activeFolder = folderViews.find(folder => folder.id === activeFolderId) ||
    folderViews[0] || {
      id: PERSONA_UNGROUPED_FOLDER_ID,
      name: '未分组条目',
      traitIds: [],
      isUngrouped: true,
    };
  const traitById = new Map(traits.map(trait => [trait.id, trait]));
  const visibleTraits = activeFolder.traitIds
    .map(traitId => traitById.get(traitId))
    .filter((trait): trait is PersonaTrait => Boolean(trait));
  const navHtml = folderViews
    .map(folder => createPersonaFolderNavItemHtml(folder, folder.id === activeFolder.id, scope))
    .join('');
  const mobileFolderDrawerHtml = `
    <div class="persona-folder-mobile-drawer-backdrop"></div>
    <div class="persona-folder-mobile-drawer">
      <div class="persona-folder-mobile-drawer-header">
        <div class="persona-folder-mobile-drawer-title">文件夹</div>
        <button type="button" class="persona-btn small persona-mobile-folder-close-btn" id="persona-mobile-folder-close-btn">关闭</button>
      </div>
      <div class="persona-folder-mobile-drawer-list">${navHtml}</div>
    </div>
  `;
  const traitListHtml = visibleTraits.length
    ? visibleTraits
        .map(trait => {
          const traitRule = findTraitRule(config, trait.id);
          const isTraitRuleMatched = scope === 'local' && Boolean(traitRule?.id && matchedRuleIds.has(traitRule.id));
          return createPersonaTraitHtml(trait, effectiveTraitIds, {
            scope,
            isRuleMatched: isTraitRuleMatched,
            isBoundToCurrentChat: scope === 'local' && isTraitRuleBoundToCurrentContext(traitRule, 'chat', context),
            isBoundToCurrentCharacter:
              scope === 'local' && isTraitRuleBoundToCurrentContext(traitRule, 'character', context),
          });
        })
        .join('')
    : '<div class="empty-list">当前分组下还没有条目</div>';

  container.html(`
    <div class="persona-traits-md">
      <aside class="persona-folder-nav-panel">
        <div class="persona-folder-nav-title">文件夹</div>
        <div class="persona-folder-nav-list">${navHtml}</div>
      </aside>
      <section class="persona-folder-detail-panel">
        ${mobileFolderDrawerHtml}
        <div class="persona-folder-detail-header">
          <div>
            <div class="persona-folder-detail-eyebrow">${scope === 'shared' ? '通用条目' : activeFolder.isUngrouped ? '未分组条目' : '当前文件夹'}</div>
            <div class="persona-folder-detail-title">${escapeHtml(activeFolder.name)}</div>
          </div>
          <div class="persona-folder-detail-tools">
            <button type="button" class="persona-btn small persona-mobile-folder-toggle-btn" id="persona-mobile-folder-toggle-btn" aria-expanded="false">切换文件夹</button>
            <div class="persona-folder-detail-meta">${visibleTraits.length} / ${traits.length} 条</div>
          </div>
        </div>
        <div class="persona-folder-detail-list">${traitListHtml}</div>
      </section>
    </div>
  `);

  updateAutoStatusText(avatarId);
  renderPersonaDefaultTraitSnapshotState(avatarId);
  renderProfileWorkspace(avatarId);
  applyBindingPlusLayoutState();
}

function renderSnapshotSection(avatarId: string): void {
  const parentDoc = window.parent.document;
  const $info = $('#persona-snapshot-info', parentDoc);
  const $rollbackBtn = $('#persona-rollback-btn', parentDoc);
  const $snapshotListBtn = $('#persona-snapshot-list-btn', parentDoc);

  if (!avatarId) {
    $info.text('请先在左侧选择一个 user 人设');
    $rollbackBtn.prop('disabled', true);
    $snapshotListBtn.prop('disabled', true);
    return;
  }

  $rollbackBtn.prop('disabled', false);
  $snapshotListBtn.prop('disabled', false);
  const snapshots = loadPersonaSnapshots(avatarId);

  if (snapshots.length === 0) {
    $info.text('快照: 0');
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  $info.text(`快照: ${snapshots.length} | 最近: ${formatTime(latest.timestamp)} (${latest.reason})`);
}

function renderBindingPlusThemeSection(): void {
  const parentDoc = window.parent.document;
  const $container = $('#bindingplus-theme-card-body', parentDoc);
  if (!$container.length) {
    return;
  }

  const state = loadBindingPlusTheme();
  const presets = getBindingPlusThemePresetOptions();
  const currentPreset = getBindingPlusThemePresetByIdFromUi(state.presetId);
  const isFollowSmartTheme = isBindingPlusFollowSmartThemePreset(currentPreset.id);
  const darkPresets = presets.filter(preset => preset.tone === 'dark');
  const lightPresets = presets.filter(preset => preset.tone === 'light');
  const systemPreset = presets.find(preset => preset.tone === 'system');

  const renderPresetOptions = (items: BindingPlusThemePreset[]): string =>
    items
      .map(
        preset =>
          `<option value="${escapeHtml(preset.id)}" ${preset.id === currentPreset.id ? 'selected' : ''}>${escapeHtml(preset.label)}</option>`,
      )
      .join('');

  const renderPresetChip = (preset: BindingPlusThemePreset): string => `
    <button
      type="button"
      class="bindingplus-theme-preset-chip ${preset.id === currentPreset.id ? 'active' : ''}"
      data-preset-id="${escapeHtml(preset.id)}"
    >
      <span class="bindingplus-theme-swatch" style="background:${escapeHtml(preset.tokens.accent)};"></span>
      <span>${escapeHtml(preset.label)}</span>
    </button>
  `;

  const colorInputsHtml = BINDINGPLUS_THEME_EDITABLE_TOKENS.map(({ key, label }) => {
    const value = getBindingPlusThemeColorInputValue(currentPreset, state, key);
    return `
      <label class="bindingplus-theme-color-field">
        <span>${escapeHtml(label)}</span>
        <input
          type="color"
          class="bindingplus-theme-color-input"
          data-token-key="${escapeHtml(key)}"
          value="${escapeHtml(value)}"
          ${isFollowSmartTheme ? 'disabled' : ''}
        >
      </label>
    `;
  }).join('');

  $container.html(`
    <div class="bindingplus-theme-summary">
      <div class="bindingplus-theme-current">
        <div class="bindingplus-theme-current-title">当前主题：${escapeHtml(currentPreset.label)}</div>
        <div class="bindingplus-theme-current-note">${escapeHtml(currentPreset.description)}</div>
      </div>
      <div class="bindingplus-theme-toggle">
        <label class="inline-check-row">
          <input type="checkbox" id="bindingplus-theme-custom-toggle" ${state.useCustomOverrides && !isFollowSmartTheme ? 'checked' : ''} ${isFollowSmartTheme ? 'disabled' : ''}>
          <span>启用颜色微调</span>
        </label>
      </div>
    </div>

    <div class="two-col-grid bindingplus-theme-top-grid">
      <div class="form-group">
        <label for="bindingplus-theme-preset-select">主题预设</label>
        <select class="persona-input" id="bindingplus-theme-preset-select">
          ${systemPreset ? `<optgroup label="系统">${renderPresetOptions([systemPreset])}</optgroup>` : ''}
          <optgroup label="深色">${renderPresetOptions(darkPresets)}</optgroup>
          <optgroup label="浅色">${renderPresetOptions(lightPresets)}</optgroup>
        </select>
      </div>
      <div class="form-group">
        <label>主题操作</label>
        <div class="edit-actions-bar bindingplus-theme-actions">
          <button type="button" class="persona-btn" id="bindingplus-theme-restore-preset-btn" ${isFollowSmartTheme ? 'disabled' : ''}>恢复当前预设默认值</button>
          <button type="button" class="persona-btn" id="bindingplus-theme-reset-default-btn">重置为默认主题</button>
        </div>
      </div>
    </div>

    <div class="bindingplus-theme-group">
      <div class="bindingplus-theme-group-title">跟随酒馆</div>
      <div class="bindingplus-theme-chip-row">
        ${systemPreset ? renderPresetChip(systemPreset) : ''}
      </div>
    </div>
    <div class="bindingplus-theme-group">
      <div class="bindingplus-theme-group-title">深色预设</div>
      <div class="bindingplus-theme-chip-row">
        ${darkPresets.map(renderPresetChip).join('')}
      </div>
    </div>
    <div class="bindingplus-theme-group">
      <div class="bindingplus-theme-group-title">浅色预设</div>
      <div class="bindingplus-theme-chip-row">
        ${lightPresets.map(renderPresetChip).join('')}
      </div>
    </div>

    <div class="form-group">
      <label>常用颜色微调</label>
      <div class="bindingplus-theme-color-grid">
        ${colorInputsHtml}
      </div>
      <div class="text-note bindingplus-theme-help">
        ${
          isFollowSmartTheme
            ? '当前是“跟随酒馆”模式，颜色微调已禁用。切到内置预设后即可单独调整绑定plus 颜色。'
            : state.useCustomOverrides
              ? '当前正在使用预设 + 自定义颜色覆盖。'
              : '当前使用纯预设颜色；开启“颜色微调”后会只覆盖绑定plus 自己的配色。'
        }
      </div>
    </div>
  `);
}

function renderCompatibilitySection(report: CompatibilityCheckReport): void {
  const parentDoc = window.parent.document;
  const $summary = $('#persona-compat-summary', parentDoc);
  const $details = $('#persona-compat-details', parentDoc);
  const $miniStatus = $('#persona-compat-mini-status', parentDoc);

  const statusText = report.ok ? '通过' : '存在兼容性风险';
  $summary.text(`状态: ${statusText} | 检测时间: ${formatTime(report.checkedAt)}`);
  $miniStatus.text(`自检: ${statusText}`).toggleClass('ok', report.ok).toggleClass('warn', !report.ok);

  $details.empty();
  report.items.forEach(item => {
    const icon = item.ok ? '✅' : item.required ? '❌' : '⚠️';
    const level = item.ok ? 'ok' : item.required ? 'danger' : 'warn';
    $details.append(`<div class="compat-item ${level}">${icon} ${escapeHtml(item.message)}</div>`);
  });
}

function refreshCompatibilitySection(): void {
  const report = runCompatibilitySelfCheck();
  lastCompatibilityReport = report;
  renderCompatibilitySection(report);
  if (!report.ok) {
    toastr.warning('检测到兼容性风险，部分功能可能不可用');
  }
}

function renderContextBindingStorageSection(): void {
  const parentDoc = window.parent.document;
  const $storageList = $('#persona-context-binding-storage-list', parentDoc);
  if (!$storageList.length) {
    return;
  }

  const bindings = loadContextBindings();
  if (!bindings.length) {
    $storageList.html('<div class="empty-list">当前没有保存任何聊天/角色绑定。</div>');
    return;
  }

  $storageList.html(bindings.map(binding => createContextBindingStorageItemHtml(binding)).join(''));
}

function renderBindingPlusStorageSection(): void {
  const parentDoc = window.parent.document;
  const $summary = $('#bindingplus-storage-size-summary', parentDoc);
  if (!$summary.length) {
    return;
  }

  const report = getBindingPlusStorageReport(6);
  const categoryText = report.categories
    .slice(0, 6)
    .map(category => `${category.category} ${formatStorageSize(category.bytes)} / ${category.keyCount} key`)
    .join('；');
  const cleanupHtml =
    lastSnapshotPruneSummary && lastSnapshotPruneSummary.removedSnapshots > 0
      ? `<div class="plus-probe-item ok">
          <div>已自动清理旧快照</div>
          <div class="plus-probe-meta">${escapeHtml(
            `删除 ${lastSnapshotPruneSummary.removedSnapshots} 份，释放约 ${formatStorageSize(lastSnapshotPruneSummary.freedBytes)}`,
          )}</div>
        </div>`
      : '';
  const topItemsHtml = report.topItems
    .map(
      item => `
        <div class="plus-probe-item">
          <div>${escapeHtml(item.label)}</div>
          <div class="plus-probe-meta">${escapeHtml(`${formatStorageSize(item.bytes)} · ${item.key}`)}</div>
        </div>
      `,
    )
    .join('');

  $summary.html(`
    <div class="plus-probe-item ok">
      <div>绑定plus存储占用</div>
      <div class="plus-probe-meta">${escapeHtml(`总计 ${formatStorageSize(report.totalBytes)} · ${report.keyCount} 个 key`)}</div>
    </div>
    ${cleanupHtml}
    ${
      categoryText
        ? `<div class="plus-probe-item">
            <div>模块占用 Top</div>
            <div class="plus-probe-meta">${escapeHtml(categoryText)}</div>
          </div>`
        : '<div class="empty-list">绑定plus当前没有保存本地数据。</div>'
    }
    ${topItemsHtml}
  `);
}

function renderPlusBindingSection(report: PersonaPlusProbeReport | null = lastPlusProbeReport): void {
  const parentDoc = window.parent.document;
  const $contextSummary = $('#persona-plus-context-summary', parentDoc);
  const $probeSummary = $('#persona-plus-probe-summary', parentDoc);
  const $eventDetails = $('#persona-plus-event-details', parentDoc);
  const $interfaceDetails = $('#persona-plus-interface-details', parentDoc);
  const $notes = $('#persona-plus-notes', parentDoc);

  if (!$contextSummary.length) {
    return;
  }

  renderContextBindingStorageSection();
  renderBindingPlusStorageSection();
  renderOfficialPresetSaveStatus();

  const debugInfo = getRuntimeContextDebugInfo();
  const currentContext = report?.currentContext || debugInfo.context;
  $contextSummary.text(
    `当前聊天: ${currentContext.chatId || currentContext.chatName || '空'} [${debugInfo.source.chatId}] | 当前角色: ${currentContext.characterId || currentContext.characterName || '空'} [${debugInfo.source.characterId}]`,
  );

  if (report) {
    const availableCount = report.interfaceItems.filter(item => item.available).length;
    $probeSummary.text(
      `接口: ${availableCount}/${report.interfaceItems.length} 可用 | 检测时间: ${formatTime(report.checkedAt)}`,
    );
  } else {
    $probeSummary.text('接口: 未检测');
  }

  $eventDetails.empty();
  Object.values(plusEventStates).forEach(item => {
    const level = item.available ? 'ok' : 'warn';
    const icon = item.available ? '✅' : '⚠️';
    const meta = `触发 ${item.triggerCount} 次${item.lastTriggeredAt ? ` | 最近 ${formatTime(item.lastTriggeredAt)}` : ''}`;
    $eventDetails.append(
      `<div class="plus-probe-item ${level}">
        <div>${icon} ${escapeHtml(item.label)}</div>
        <div class="plus-probe-meta">${escapeHtml(meta)}</div>
        <div class="plus-probe-meta">${escapeHtml(item.detail)}</div>
      </div>`,
    );
  });

  $interfaceDetails.empty();
  if (report) {
    report.interfaceItems.forEach(item => {
      const level = item.available ? 'ok' : 'warn';
      const icon = item.available ? '✅' : '⚠️';
      $interfaceDetails.append(
        `<div class="plus-probe-item ${level}">
          <div>${icon} ${escapeHtml(item.label)}</div>
          <div class="plus-probe-meta">${escapeHtml(item.detail)}</div>
        </div>`,
      );
    });
  }

  $notes.empty();
  if (report?.notes.length) {
    report.notes.forEach(note => {
      $notes.append(
        `<div class="plus-probe-item warn">
          <div>📝 说明</div>
          <div class="plus-probe-meta">${escapeHtml(note)}</div>
        </div>`,
      );
    });
  }
}

function renderApiConfigSelfTestSection(report: PersonaPlusApiConfigTestReport | null = lastApiConfigTestReport): void {
  const parentDoc = window.parent.document;
  const $summary = $('#persona-plus-api-test-summary', parentDoc);
  const $details = $('#persona-plus-api-test-details', parentDoc);
  const $notes = $('#persona-plus-api-test-notes', parentDoc);

  if (!$summary.length) {
    return;
  }

  if (!report) {
    $summary.text('未测试');
    $details.empty();
    $notes.empty();
    return;
  }

  const okCount = report.items.filter(item => item.ok).length;
  $summary.text(`结果: ${okCount}/${report.items.length} 通过 | 检测时间: ${formatTime(report.checkedAt)}`);

  $details.empty();
  report.items.forEach(item => {
    const level = item.ok ? 'ok' : 'warn';
    const icon = item.ok ? '✅' : '⚠️';
    const rawContentHtml = item.rawContent
      ? `
        <div class="plus-probe-meta">${escapeHtml(item.rawContentLabel || '完整返回')}</div>
        <pre class="persona-json-preview">${escapeHtml(item.rawContent)}</pre>
      `
      : '';
    $details.append(
      `<div class="plus-probe-item ${level}">
        <div>${icon} ${escapeHtml(item.label)}</div>
        <div class="plus-probe-meta">${escapeHtml(item.detail)}</div>
        ${rawContentHtml}
      </div>`,
    );
  });

  $notes.empty();
  report.notes.forEach(note => {
    $notes.append(
      `<div class="plus-probe-item warn">
        <div>📝 说明</div>
        <div class="plus-probe-meta">${escapeHtml(note)}</div>
      </div>`,
    );
  });
}

async function refreshPlusBindingSection(showToast: boolean = false): Promise<void> {
  const report = await probePlusBindingInterfaces();
  lastPlusProbeReport = report;
  renderPlusBindingSection(report);
  if (showToast) {
    toastr.success('Plus 接口探测已刷新');
  }
}

async function refreshApiConfigSelfTestSection(showToast: boolean = false): Promise<void> {
  const report = await runApiConfigSelfTest();
  lastApiConfigTestReport = report;
  renderApiConfigSelfTestSection(report);
  if (showToast) {
    const okCount = report.items.filter(item => item.ok).length;
    toastr.success(`API读写测试完成 ${okCount}/${report.items.length}`);
  }
}

async function triggerPlusEventSelfTest(): Promise<void> {
  if (typeof eventEmit !== 'function') {
    toastr.warning('eventEmit 不可用，无法测试自定义事件');
    return;
  }

  const current = getRuntimeContext();
  const previous = lastObservedContext || current;
  const payload: PersonaPlusContextChangePayload = {
    source: 'manual_test',
    observedAt: Date.now(),
    previous,
    current,
    changed: {
      chat: true,
      character: true,
    },
  };

  await eventEmit(PERSONA_PLUS_CONTEXT_CHANGED_EVENT, payload);
  await eventEmit(PERSONA_PLUS_CHAT_CHANGED_EVENT, payload);
  await eventEmit(PERSONA_PLUS_CHARACTER_CHANGED_EVENT, payload);
  renderPlusBindingSection();
  toastr.success('已触发自定义 Plus 事件测试');
}

async function applyPersonaPlusBindingsWithToast(
  avatarId: string,
  context: PersonaRuntimeContext,
  force: boolean,
  title: string,
): Promise<boolean> {
  try {
    await applyPersonaPlusBindings(avatarId, context, force);
    return true;
  } catch (error) {
    console.error(`用户设定脚本: ${title}失败`, error);
    showUiErrorToast(title, error);
    return false;
  }
}

async function applyComposedDescriptionForAvatar(
  avatarId: string,
  reason: string,
  options: {
    applyPlusBindings?: boolean;
    errorToastTitle?: string;
  } = {},
): Promise<boolean> {
  if (!avatarId) {
    return true;
  }
  const { applyPlusBindings = true, errorToastTitle = '同步 user人设内容失败' } = options;

  try {
    const parentDoc = window.parent.document;
    const currentEditingAvatarId = getEditingAvatarId();

    let baseDescription = '';
    if (currentEditingAvatarId === avatarId) {
      baseDescription = ($('#edit-persona-base-desc', parentDoc).val() as string | undefined) || '';
    } else {
      const persona = findPersonaByAvatarId(avatarId);
      baseDescription = loadPersonaBaseDescription(avatarId, persona?.description || '');
    }

    savePersonaBaseDescription(avatarId, baseDescription);
    const composed = await composePersonaDescription(avatarId, baseDescription);
    await syncDescriptionToTavern(avatarId, composed, reason);

    if (applyPlusBindings) {
      const plusResult = await applyPersonaPlusBindings(avatarId);
      if (plusResult.changed) {
        console.info('用户设定脚本: Plus 绑定已应用', plusResult.summary);
      }
    }

    updateAutoStatusText(avatarId);
    return true;
  } catch (error) {
    console.error(`用户设定脚本: ${reason}失败`, error);
    showUiErrorToast(errorToastTitle, error);
    updateAutoStatusText(avatarId);
    return false;
  }
}

function updateAutoStatusText(avatarId: string): void {
  const parentDoc = window.parent.document;
  const $status = $('#persona-auto-status', parentDoc);
  if (!$status.length || !avatarId) {
    return;
  }
  const activation = getPersonaActivationState(avatarId);
  const totalTraits = loadPersonaTraits(avatarId).length;
  const sharedConfig = loadSharedPersonaTraitsConfig();
  const enabledSharedTraitCount = loadEnabledSharedTraitIds(avatarId).length;
  $status.text(
    `自动拼装状态: 生效条目 ${activation.effectiveTraitIds.length}/${totalTraits}，通用条目 ${enabledSharedTraitCount}/${sharedConfig.traits.length}，触发规则 ${activation.matchedRuleIds.length}`,
  );
}

async function syncDescriptionToTavern(avatarId: string, description: string, reason: string): Promise<void> {
  const parentDoc = window.parent.document;
  const $personaDescription = $('#persona_description', parentDoc);
  if ($personaDescription.length === 0) {
    return;
  }

  const nextValue = description.replace(/\r\n/g, '\n').trim();
  const currentValue = (($personaDescription.val() as string | undefined) || '').replace(/\r\n/g, '\n').trim();

  if (nextValue === currentValue) {
    return;
  }

  const baseDescription = ($('#edit-persona-base-desc', parentDoc).val() as string | undefined) || '';
  recordPersonaSnapshot(avatarId, reason, baseDescription);
  $personaDescription.val(nextValue).trigger('input').trigger('blur');
}

// ==================== 角色设定管理 ====================

async function addPersonaTrait(avatarId: string): Promise<void> {
  if (activePersonaTraitScope === 'shared') {
    await addSharedPersonaTrait(avatarId);
    return;
  }

  const traits = loadPersonaTraits(avatarId);
  const config = loadPersonaAdvancedConfig(avatarId);
  const folders = buildPersonaFolderViews(traits, config.profiles);
  const activeFolderId = ensureActivePersonaFolderId(avatarId, folders, 'local');
  const now = Date.now();

  const newTrait: PersonaTrait = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    name: '新设定',
    description: '',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  recordPersonaSnapshot(avatarId, '新增 trait');
  traits.push(newTrait);
  if (savePersonaTraits(avatarId, traits)) {
    if (activeFolderId && activeFolderId !== PERSONA_UNGROUPED_FOLDER_ID) {
      const profileIndex = config.profiles.findIndex(profile => profile.id === activeFolderId);
      if (profileIndex !== -1 && !config.profiles[profileIndex].traitIds.includes(newTrait.id)) {
        config.profiles[profileIndex] = {
          ...config.profiles[profileIndex],
          traitIds: [...config.profiles[profileIndex].traitIds, newTrait.id],
          updatedAt: Date.now(),
        };
        savePersonaAdvancedConfig(avatarId, config);
      }
    }
    renderPersonaTraits(avatarId);
    await editPersonaTrait(avatarId, newTrait.id);
    await applyComposedDescriptionForAvatar(avatarId, '新增 trait 后自动同步', {
      applyPlusBindings: false,
      errorToastTitle: '新增条目后同步 user人设失败',
    });
    renderSnapshotSection(avatarId);
    toastr.success('设定已添加');
  }
}

async function addSharedPersonaTrait(avatarId: string): Promise<void> {
  const sharedConfig = loadSharedPersonaTraitsConfig();
  const folders = buildPersonaFolderViews(sharedConfig.traits, sharedConfig.folders);
  const activeFolderId = ensureActivePersonaFolderId(avatarId, folders, 'shared');
  const now = Date.now();

  const newTrait: PersonaSharedTrait = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    name: '新通用设定',
    description: '',
    createdAt: now,
    updatedAt: now,
  };

  recordPersonaSnapshot(avatarId, '新增通用 trait');
  sharedConfig.traits.push(newTrait);
  if (activeFolderId && activeFolderId !== PERSONA_UNGROUPED_FOLDER_ID) {
    const folderIndex = sharedConfig.folders.findIndex(folder => folder.id === activeFolderId);
    if (folderIndex !== -1 && !sharedConfig.folders[folderIndex].traitIds.includes(newTrait.id)) {
      sharedConfig.folders[folderIndex] = {
        ...sharedConfig.folders[folderIndex],
        traitIds: [...sharedConfig.folders[folderIndex].traitIds, newTrait.id],
        updatedAt: Date.now(),
      };
    }
  }

  if (!saveSharedPersonaTraitsConfig(sharedConfig)) {
    return;
  }
  const enabledSharedTraitIds = [...loadEnabledSharedTraitIds(avatarId), newTrait.id];
  saveEnabledSharedTraitIds(avatarId, enabledSharedTraitIds);
  renderPersonaTraits(avatarId);
  await editPersonaTrait(avatarId, newTrait.id, 'shared');
  await applyComposedDescriptionForAvatar(avatarId, '新增通用 trait 后自动同步', {
    applyPlusBindings: false,
    errorToastTitle: '新增通用条目后同步 user人设失败',
  });
  renderSnapshotSection(avatarId);
  toastr.success('通用设定已添加');
}

async function togglePersonaTrait(
  avatarId: string,
  traitId: string,
  enabled: boolean,
  scope: PersonaTraitScope = 'local',
): Promise<void> {
  if (scope === 'shared') {
    const currentTraitIds = loadEnabledSharedTraitIds(avatarId);
    const nextTraitIds = enabled
      ? Array.from(new Set([...currentTraitIds, traitId]))
      : currentTraitIds.filter(id => id !== traitId);
    recordPersonaSnapshot(avatarId, `切换通用 trait: ${traitId}`);
    if (saveEnabledSharedTraitIds(avatarId, nextTraitIds)) {
      renderPersonaTraits(avatarId);
      await applyComposedDescriptionForAvatar(avatarId, '切换通用 trait 后自动同步', {
        applyPlusBindings: false,
        errorToastTitle: '切换通用条目后同步 user人设失败',
      });
      renderSnapshotSection(avatarId);
    }
    return;
  }

  const traits = loadPersonaTraits(avatarId);
  const index = traits.findIndex(t => t.id === traitId);
  if (index === -1) {
    return;
  }

  recordPersonaSnapshot(avatarId, `切换 trait: ${traits[index].name}`);
  traits[index].enabled = enabled;
  traits[index].updatedAt = Date.now();

  if (savePersonaTraits(avatarId, traits)) {
    renderPersonaTraits(avatarId);
    await applyComposedDescriptionForAvatar(avatarId, '切换 trait 后自动同步', {
      applyPlusBindings: false,
      errorToastTitle: '切换条目后同步 user人设失败',
    });
    renderSnapshotSection(avatarId);
  }
}

async function editPersonaTrait(
  avatarId: string,
  traitId: string,
  scope: PersonaTraitScope = 'local',
): Promise<void> {
  const sharedConfig = loadSharedPersonaTraitsConfig();
  const traits =
    scope === 'shared'
      ? sharedConfig.traits.map(trait => ({
          ...trait,
          enabled: loadEnabledSharedTraitIds(avatarId).includes(trait.id),
        }))
      : loadPersonaTraits(avatarId);
  const trait = traits.find(t => t.id === traitId);
  if (!trait) {
    toastr.error('找不到指定的设定');
    return;
  }

  const modalHtml = `
    <div class="pool-edit-modal ${BINDINGPLUS_THEME_SCOPE_CLASS}">
      <div class="pool-edit-content">
        <h3>编辑设定</h3>
        <div class="form-group">
          <label>名称</label>
          <input type="text" class="persona-input" id="trait-edit-name" value="${escapeHtml(trait.name)}">
        </div>
        <div class="form-group">
          <label>描述（将拼接到人设描述中）</label>
          <textarea class="persona-textarea" id="trait-edit-desc" rows="10">${escapeHtml(trait.description)}</textarea>
        </div>
        <div class="edit-actions-bar">
          <button class="persona-btn" id="trait-edit-save">💾 保存</button>
          <button class="persona-btn" id="trait-edit-close">✖ 关闭</button>
        </div>
      </div>
      <div class="pool-edit-overlay"></div>
    </div>
  `;

  const parentDoc = window.parent.document;
  const $modal = $(modalHtml).appendTo($('body', parentDoc));
  applyBindingPlusModalPresentation($modal);

  const closeModal = () => {
    $modal.remove();
  };

  $('#trait-edit-close', $modal).on('click', closeModal);
  $('.pool-edit-overlay', $modal).on('click', closeModal);

  $('#trait-edit-save', $modal).on('click', async () => {
    const newName = ($('#trait-edit-name', $modal).val() as string | undefined)?.trim() || trait.name;
    const newDesc = ($('#trait-edit-desc', $modal).val() as string | undefined) || '';
    const index = traits.findIndex(t => t.id === traitId);
    if (index === -1) {
      closeModal();
      return;
    }

    recordPersonaSnapshot(avatarId, `${scope === 'shared' ? '编辑通用 trait' : '编辑 trait'}: ${traits[index].name}`);
    if (scope === 'shared') {
      const sharedIndex = sharedConfig.traits.findIndex(item => item.id === traitId);
      if (sharedIndex !== -1) {
        sharedConfig.traits[sharedIndex] = {
          ...sharedConfig.traits[sharedIndex],
          name: newName,
          description: newDesc,
          updatedAt: Date.now(),
        };
        saveSharedPersonaTraitsConfig(sharedConfig);
      }
    } else {
      traits[index].name = newName;
      traits[index].description = newDesc;
      traits[index].updatedAt = Date.now();
      savePersonaTraits(avatarId, traits);
    }
    renderPersonaTraits(avatarId);
    await applyComposedDescriptionForAvatar(avatarId, `${scope === 'shared' ? '编辑通用 trait' : '编辑 trait'} 后自动同步`, {
      applyPlusBindings: false,
      errorToastTitle: scope === 'shared' ? '编辑通用条目后同步 user人设失败' : '编辑条目后同步 user人设失败',
    });
    renderSnapshotSection(avatarId);
    toastr.success(scope === 'shared' ? '通用设定已保存' : '设定已保存');
    closeModal();
  });
}

async function deletePersonaTrait(
  avatarId: string,
  traitId: string,
  scope: PersonaTraitScope = 'local',
): Promise<void> {
  if (scope === 'shared') {
    const sharedConfig = loadSharedPersonaTraitsConfig();
    const target = sharedConfig.traits.find(t => t.id === traitId);
    if (!target) {
      return;
    }

    recordPersonaSnapshot(avatarId, `删除通用 trait: ${target.name}`);
    sharedConfig.traits = sharedConfig.traits.filter(t => t.id !== traitId);
    sharedConfig.folders = sharedConfig.folders
      .map(folder => ({
        ...folder,
        traitIds: folder.traitIds.filter(id => id !== traitId),
        updatedAt: Date.now(),
      }))
      .filter(folder => folder.traitIds.length > 0);
    if (saveSharedPersonaTraitsConfig(sharedConfig)) {
      saveEnabledSharedTraitIds(
        avatarId,
        loadEnabledSharedTraitIds(avatarId).filter(id => id !== traitId),
      );
      renderPersonaTraits(avatarId);
      await applyComposedDescriptionForAvatar(avatarId, '删除通用 trait 后自动同步', {
        applyPlusBindings: false,
        errorToastTitle: '删除通用条目后同步 user人设失败',
      });
      renderSnapshotSection(avatarId);
      toastr.success('通用设定已删除');
    }
    return;
  }

  const traits = loadPersonaTraits(avatarId);
  const target = traits.find(t => t.id === traitId);
  if (!target) {
    return;
  }

  recordPersonaSnapshot(avatarId, `删除 trait: ${target.name}`);
  const filtered = traits.filter(t => t.id !== traitId);
  if (savePersonaTraits(avatarId, filtered)) {
    const config = loadPersonaAdvancedConfig(avatarId);
    config.profiles = config.profiles.map(profile => ({
      ...profile,
      traitIds: profile.traitIds.filter(id => id !== traitId),
      updatedAt: Date.now(),
    }));
    config.rules = config.rules.map(rule => ({
      ...rule,
      traitIds: rule.traitIds.filter(id => id !== traitId),
      updatedAt: Date.now(),
    }));
    savePersonaAdvancedConfig(avatarId, config);

    renderPersonaTraits(avatarId);
    await applyComposedDescriptionForAvatar(avatarId, '删除 trait 后自动同步', {
      applyPlusBindings: false,
      errorToastTitle: '删除条目后同步 user人设失败',
    });
    renderSnapshotSection(avatarId);
    toastr.success('设定已删除');
  }
}

// ==================== Profile 管理 ====================

type PlusBindingCatalog = ReturnType<typeof getPlusBindingCatalog>;
const PLUS_BINDING_CATALOG_CACHE_TTL_MS = 800;
let plusBindingCatalogCache: { value: PlusBindingCatalog; expiresAt: number } | null = null;

function invalidatePlusBindingCatalogCache(): void {
  plusBindingCatalogCache = null;
}

function getCachedPlusBindingCatalog(): PlusBindingCatalog {
  const now = Date.now();
  if (plusBindingCatalogCache && plusBindingCatalogCache.expiresAt > now) {
    return plusBindingCatalogCache.value;
  }

  const value = getPlusBindingCatalog();
  plusBindingCatalogCache = {
    value,
    expiresAt: now + PLUS_BINDING_CATALOG_CACHE_TTL_MS,
  };
  return value;
}

async function refreshApiConnectionCatalog(options: { quiet?: boolean; rerender?: boolean } = {}): Promise<boolean> {
  try {
    await refreshConnectionProfileCatalog();
    invalidatePlusBindingCatalogCache();
    if (options.rerender && activeDetailPage === 'api') {
      renderSidebarSecondaryList();
      renderResourceDetailPages();
    }
    return true;
  } catch (error) {
    if (!options.quiet) {
      toastr.error(error instanceof Error ? error.message : String(error));
    }
    return false;
  }
}

function renderSelectOptions(
  options: Array<{ id: string; label: string }>,
  selectedId: string | undefined,
  emptyLabel: string = '不绑定',
): string {
  const rows = [`<option value="">${escapeHtml(emptyLabel)}</option>`];
  for (const option of options) {
    rows.push(
      `<option value="${escapeHtml(option.id)}" ${selectedId === option.id ? 'selected' : ''}>${escapeHtml(option.label)}</option>`,
    );
  }
  return rows.join('');
}

function createBindingGroupCheckboxRowsHtml(
  options: Array<{ id: string; label: string }>,
  selectedIds: string[] | undefined,
  checkboxClass: string,
  emptyText: string,
): string {
  if (options.length === 0) {
    return `<div class="text-note">${escapeHtml(emptyText)}</div>`;
  }

  const selectedSet = new Set(selectedIds || []);
  return options
    .map(
      option => `
        <label class="inline-check-row">
          <input type="checkbox" class="${checkboxClass}" value="${escapeHtml(option.id)}" ${selectedSet.has(option.id) ? 'checked' : ''}>
          <span>${escapeHtml(option.label)}</span>
        </label>
      `,
    )
    .join('');
}

function createEmptyBindingResources(): PersonaContextBindingResources {
  return {
    userPersonaAvatarId: undefined,
    userPersonaProfileId: undefined,
    userPersonaEnabledTraitIds: undefined,
    userPersonaEnabledSharedTraitIds: undefined,
    connectionProfileName: undefined,
    presetName: undefined,
    presetEnabledPromptIds: undefined,
    scripts: {
      global: [],
      preset: [],
      character: [],
    },
    regexes: {
      global: [],
      preset: [],
      character: [],
    },
    worldbooks: {
      global: [],
      characterPrimary: undefined,
      characterAdditional: [],
      chat: undefined,
    },
    worldbookEntries: [],
    extensions: [],
  };
}

function cloneBindingResources(resources?: PersonaContextBindingResources): PersonaContextBindingResources {
  return mergeBindingGroupResources(createEmptyBindingResources(), resources);
}

function getSelectedBindingGroup(): BindingGroup | null {
  const selectedId = (activeResourceSelection.groups || '').trim();
  if (!selectedId) {
    return null;
  }
  return loadBindingGroups().find(group => group.id === selectedId) || null;
}

function buildUniqueBindingGroupName(baseName: string, excludeId: string = ''): string {
  const normalizedBaseName = (baseName || '').trim() || '未命名绑定组';
  const groups = loadBindingGroups();
  const existingNames = new Set(
    groups
      .filter(group => group.id !== excludeId)
      .map(group => (group.name || '').trim())
      .filter(Boolean),
  );
  if (!existingNames.has(normalizedBaseName)) {
    return normalizedBaseName;
  }

  let index = 2;
  while (existingNames.has(`${normalizedBaseName} ${index}`)) {
    index += 1;
  }
  return `${normalizedBaseName} ${index}`;
}

function buildBindingGroupPersonaTraitListHtml(
  avatarId: string,
  selectedTraitIds: string[],
  emptyText: string = '请选择 user 人设后编辑条目快照。',
): string {
  if (!avatarId) {
    return `<div class="text-note">${escapeHtml(emptyText)}</div>`;
  }

  const traits = loadPersonaTraits(avatarId);
  const sharedTraits = loadSharedPersonaTraitsConfig().traits;
  if (!traits.length) {
    return sharedTraits.length
      ? '<div class="text-note">该 user 人设还没有本地条目。下方仍可编辑通用条目快照。</div>'
      : '<div class="text-note">该 user 人设还没有条目。</div>';
  }

  const selectedSet = new Set(selectedTraitIds);
  return traits
    .map(
      trait => `
        <label class="inline-check-row">
          <input type="checkbox" class="binding-group-persona-trait-checkbox" value="${escapeHtml(trait.id)}" ${selectedSet.has(trait.id) ? 'checked' : ''}>
          <span>${escapeHtml(trait.name)}</span>
        </label>
      `,
    )
    .join('');
}

function buildBindingGroupSharedTraitListHtml(selectedTraitIds: string[]): string {
  const traits = loadSharedPersonaTraitsConfig().traits;
  if (!traits.length) {
    return '<div class="text-note">当前还没有通用条目。</div>';
  }

  const selectedSet = new Set(selectedTraitIds);
  return traits
    .map(
      trait => `
        <label class="inline-check-row">
          <input type="checkbox" class="binding-group-persona-shared-trait-checkbox" value="${escapeHtml(trait.id)}" ${selectedSet.has(trait.id) ? 'checked' : ''}>
          <span>${escapeHtml(trait.name)}</span>
        </label>
      `,
    )
    .join('');
}

function createWorldbookEntryBindingRowHtml(
  rowId: string,
  catalog: PlusBindingCatalog,
  binding?: PersonaPlusBindingWorldbookEntry,
): string {
  return `
    <div class="plus-binding-row" data-row-id="${escapeHtml(rowId)}">
      <div class="two-col-grid">
        <div>
          <label>世界书</label>
          <select class="persona-input plus-entry-worldbook-select">
            ${renderSelectOptions(catalog.worldbooks, binding?.worldbookName, '选择世界书')}
          </select>
        </div>
        <div>
          <label class="inline-check-row">
            <input type="checkbox" class="plus-entry-enabled-checkbox" ${binding?.enabled !== false ? 'checked' : ''}>
            <span>触发时启用这些条目</span>
          </label>
        </div>
      </div>
      <div class="checkbox-list plus-entry-checkbox-list">
        <div class="text-note">请选择世界书后加载条目</div>
      </div>
      <div class="edit-actions-bar">
        <button type="button" class="persona-btn plus-entry-refresh-btn">刷新条目</button>
        <button type="button" class="persona-btn plus-row-delete-btn">删除这一组</button>
      </div>
    </div>
  `;
}

function getCheckedValues($root: JQuery<HTMLElement>, selector: string): string[] {
  return $root
    .find(selector)
    .map((_, el) => ($(el).val() as string | undefined)?.trim() || '')
    .get()
    .filter(Boolean);
}

async function hydrateWorldbookEntryBindingRow(
  $row: JQuery<HTMLElement>,
  binding?: PersonaPlusBindingWorldbookEntry,
): Promise<void> {
  const worldbookName = (($row.find('.plus-entry-worldbook-select').val() as string | undefined) || '').trim();
  const $container = $row.find('.plus-entry-checkbox-list');

  if (!worldbookName) {
    $container.html('<div class="text-note">请选择世界书后加载条目</div>');
    return;
  }

  $container.html('<div class="text-note">加载中...</div>');
  try {
    const entries = await getWorldbookEntryCatalog(worldbookName);
    const selectedUids = new Set<number>(binding?.entryUids || []);
    const html = entries.length
      ? entries
          .map(
            entry => `
              <label class="inline-check-row">
                <input type="checkbox" class="plus-entry-uid-checkbox" value="${entry.uid}" ${selectedUids.has(entry.uid) ? 'checked' : ''}>
                <span>${escapeHtml(entry.label)}${entry.enabled ? ' [on]' : ''}</span>
              </label>
            `,
          )
          .join('')
      : '<div class="text-note">该世界书没有条目</div>';
    $container.html(html);
  } catch (error) {
    $container.html(
      `<div class="text-note">加载失败: ${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`,
    );
  }
}

function collectWorldbookEntryBindingsFromRoot($root: JQuery<HTMLElement>): PersonaPlusBindingWorldbookEntry[] {
  const bindings: PersonaPlusBindingWorldbookEntry[] = [];

  $('.plus-binding-row', $root)
    .filter((_, el) => $(el).closest('.plus-entry-bindings-container, #persona-worldbook-entry-groups').length > 0)
    .each(function () {
      const $row = $(this);
      const worldbookName = (($row.find('.plus-entry-worldbook-select').val() as string | undefined) || '').trim();
      if (!worldbookName) {
        return;
      }

      const entryUids = $row
        .find('.plus-entry-uid-checkbox:checked')
        .map((_, el) => Number($(el).val()))
        .get()
        .filter(uid => Number.isFinite(uid));

      if (entryUids.length === 0) {
        return;
      }

      bindings.push({
        worldbookName,
        entryUids,
        enabled: Boolean($row.find('.plus-entry-enabled-checkbox').prop('checked')),
      });
    });

  return bindings;
}

function collectBindingGroupResourcesFromRoot(
  $root: JQuery<HTMLElement>,
  currentResources?: PersonaContextBindingResources,
): PersonaContextBindingResources {
  const nextResources = cloneBindingResources(currentResources);
  const personaAvatarId = (($root.find('#binding-group-persona-select').val() as string | undefined) || '').trim();
  const personaTraitIds = getCheckedValues($root, '.binding-group-persona-trait-checkbox:checked');
  const sharedTraitIds = getCheckedValues($root, '.binding-group-persona-shared-trait-checkbox:checked');
  const hasPersonaControl = $root.find('#binding-group-persona-select').length > 0;
  const hasConnectionProfileControl = $root.find('#binding-group-connection-profile-select').length > 0;
  const hasPresetControl = $root.find('#binding-group-preset-select').length > 0;
  const hasScriptControls =
    $root.find('.plus-script-global-checkbox, .plus-script-preset-checkbox, .plus-script-character-checkbox').length > 0;
  const hasRegexControls =
    $root.find('.plus-regex-global-checkbox, .plus-regex-preset-checkbox, .plus-regex-character-checkbox').length > 0;
  const hasWorldbookControls =
    $root.find(
      '.plus-worldbook-global-checkbox, .plus-worldbook-character-additional-checkbox, #binding-group-worldbook-character-primary-select, #binding-group-worldbook-chat-select',
    ).length > 0;
  const hasWorldbookEntryControls = $root.find('#persona-worldbook-entry-groups, .plus-entry-bindings-container').length > 0;

  if (hasPersonaControl) {
    nextResources.userPersonaAvatarId = personaAvatarId || undefined;
    nextResources.userPersonaProfileId = undefined;
    nextResources.userPersonaEnabledTraitIds = personaAvatarId ? personaTraitIds : undefined;
    nextResources.userPersonaEnabledSharedTraitIds = personaAvatarId ? sharedTraitIds : undefined;
  }
  if (hasConnectionProfileControl) {
    nextResources.connectionProfileName =
      (($root.find('#binding-group-connection-profile-select').val() as string | undefined) || '').trim() || undefined;
  }
  if (hasPresetControl) {
    const nextPresetName =
      (($root.find('#binding-group-preset-select').val() as string | undefined) || '').trim() || undefined;
    nextResources.presetName = nextPresetName;
    if (!nextPresetName || nextPresetName !== currentResources?.presetName) {
      nextResources.presetEnabledPromptIds = undefined;
    }
  }
  if (hasScriptControls) {
    nextResources.scripts = {
      global: getCheckedValues($root, '.plus-script-global-checkbox:checked'),
      preset: getCheckedValues($root, '.plus-script-preset-checkbox:checked'),
      character: getCheckedValues($root, '.plus-script-character-checkbox:checked'),
    };
  }
  if (hasRegexControls) {
    nextResources.regexes = {
      global: getCheckedValues($root, '.plus-regex-global-checkbox:checked'),
      preset: getCheckedValues($root, '.plus-regex-preset-checkbox:checked'),
      character: getCheckedValues($root, '.plus-regex-character-checkbox:checked'),
    };
  }
  if (hasWorldbookControls) {
    nextResources.worldbooks = {
      global: getCheckedValues($root, '.plus-worldbook-global-checkbox:checked'),
      characterPrimary:
        (($root.find('#binding-group-worldbook-character-primary-select').val() as string | undefined) || '').trim() ||
        undefined,
      characterAdditional: getCheckedValues($root, '.plus-worldbook-character-additional-checkbox:checked'),
      chat: (($root.find('#binding-group-worldbook-chat-select').val() as string | undefined) || '').trim() || undefined,
    };
  }
  if (hasWorldbookEntryControls) {
    nextResources.worldbookEntries = collectWorldbookEntryBindingsFromRoot($root);
  }
  nextResources.extensions = [...(currentResources?.extensions || [])];
  return nextResources;
}

function seedBindingResourcesFromCurrentSelection(
  resources: PersonaContextBindingResources,
): PersonaContextBindingResources {
  const nextResources: PersonaContextBindingResources = {
    userPersonaAvatarId: resources.userPersonaAvatarId,
    userPersonaProfileId: resources.userPersonaProfileId,
    userPersonaEnabledTraitIds:
      resources.userPersonaEnabledTraitIds === undefined ? undefined : [...resources.userPersonaEnabledTraitIds],
    userPersonaEnabledSharedTraitIds:
      resources.userPersonaEnabledSharedTraitIds === undefined
        ? undefined
        : [...resources.userPersonaEnabledSharedTraitIds],
    connectionProfileName: resources.connectionProfileName,
    presetEnabledPromptIds:
      resources.presetEnabledPromptIds === undefined ? undefined : [...resources.presetEnabledPromptIds],
    presetName: resources.presetName,
    scripts: {
      global: [...(resources.scripts?.global || [])],
      preset: [...(resources.scripts?.preset || [])],
      character: [...(resources.scripts?.character || [])],
    },
    regexes: {
      global: [...(resources.regexes?.global || [])],
      preset: [...(resources.regexes?.preset || [])],
      character: [...(resources.regexes?.character || [])],
    },
    worldbooks: {
      global: [...(resources.worldbooks?.global || [])],
      characterPrimary: resources.worldbooks?.characterPrimary,
      characterAdditional: [...(resources.worldbooks?.characterAdditional || [])],
      chat: resources.worldbooks?.chat,
    },
    worldbookEntries: [...(resources.worldbookEntries || [])],
    extensions: [...(resources.extensions || [])],
  };

  if (activeDetailPage === 'persona') {
    const avatarId = getEditingAvatarId();
    if (avatarId) {
      nextResources.userPersonaAvatarId = avatarId;
      nextResources.userPersonaProfileId = undefined;
      nextResources.userPersonaEnabledTraitIds = getPersonaManualEnabledTraitIds(avatarId);
      nextResources.userPersonaEnabledSharedTraitIds = getPersonaEnabledSharedTraitIds(avatarId);
    }
    return nextResources;
  }

  if (activeDetailPage === 'preset') {
    const presetId = activeResourceSelection.preset || '';
    if (presetId) {
      nextResources.presetName = presetId;
      nextResources.presetEnabledPromptIds = getCurrentPresetPromptSelectionIds(presetId, resources) || [];
    }
    return nextResources;
  }

  if (activeDetailPage === 'api') {
    const connectionProfileName = (activeResourceSelection.api || '').trim();
    if (connectionProfileName) {
      nextResources.connectionProfileName = connectionProfileName;
    }
    return nextResources;
  }

  if (activeDetailPage === 'scripts') {
    const selection = activeResourceSelection.scripts || '';
    if (selection) {
      const { scope, id } = parseScopedSelectionValue(selection);
      const list = new Set(nextResources.scripts?.[scope] || []);
      list.add(id);
      nextResources.scripts = {
        ...nextResources.scripts,
        [scope]: Array.from(list),
      };
    }
    return nextResources;
  }

  if (activeDetailPage === 'regexes') {
    const selection = activeResourceSelection.regexes || '';
    if (selection) {
      const { scope, id } = parseScopedSelectionValue(selection);
      const list = new Set(nextResources.regexes?.[scope] || []);
      list.add(id);
      nextResources.regexes = {
        ...nextResources.regexes,
        [scope]: Array.from(list),
      };
    }
    return nextResources;
  }

  if (activeDetailPage === 'worldbooks') {
    const worldbookName = activeResourceSelection.worldbooks || '';
    if (worldbookName) {
      const list = new Set(nextResources.worldbooks?.global || []);
      list.add(worldbookName);
      nextResources.worldbooks = {
        ...nextResources.worldbooks,
        global: Array.from(list),
      };
    }
  }

  return nextResources;
}

function hasBindingResources(resources: PersonaContextBindingResources | undefined): boolean {
  if (!resources) {
    return false;
  }
  return Boolean(
    resources.userPersonaAvatarId ||
    resources.userPersonaEnabledSharedTraitIds?.length ||
    resources.connectionProfileName ||
    resources.presetName ||
    resources.presetEnabledPromptIds?.length ||
    resources.scripts?.global?.length ||
    resources.scripts?.preset?.length ||
    resources.scripts?.character?.length ||
    resources.regexes?.global?.length ||
    resources.regexes?.preset?.length ||
    resources.regexes?.character?.length ||
    resources.worldbooks?.global?.length ||
    resources.worldbooks?.characterPrimary ||
    resources.worldbooks?.characterAdditional?.length ||
    resources.worldbooks?.chat ||
    resources.worldbookEntries?.length ||
    resources.extensions?.length,
  );
}

function truncateBindingToastLabel(value: string, maxLength: number = 26): string {
  const normalized = (value || '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function areOptionalStringArraysEqual(left?: string[], right?: string[]): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every(value => rightSet.has(value));
}

function getCurrentSelectionDisplayLabel(): string {
  if (activeDetailPage === 'persona') {
    const avatarId = getEditingAvatarId();
    const persona = avatarId ? findPersonaByAvatarId(avatarId) : null;
    const personaLabel = persona?.name || avatarId || '当前 user 人设';
    const enabledTraitCount = avatarId ? getPersonaManualEnabledTraitIds(avatarId).length : 0;
    const enabledSharedTraitCount = avatarId ? getPersonaEnabledSharedTraitIds(avatarId).length : 0;
    return `user人设 ${personaLabel}${avatarId ? ` + 条目 ${enabledTraitCount} 条 + 通用 ${enabledSharedTraitCount} 条` : ''}`;
  }

  const catalog = getCachedPlusBindingCatalog();
  if (activeDetailPage === 'preset') {
    const selectionId = activeResourceSelection.preset || '';
    const option = catalog.presets.find(item => item.id === selectionId);
    const promptCount = (getCurrentPresetPromptSelectionIds(selectionId) || []).length;
    return `${option?.label || selectionId || '当前预设'}${selectionId ? ` + 条目 ${promptCount} 条` : ''}`;
  }

  if (activeDetailPage === 'scripts') {
    const selectionId = activeResourceSelection.scripts || '';
    const option = [
      ...catalog.scripts.global.map(item => ({
        id: buildScopedSelectionValue('global', item.id),
        label: `脚本 ${item.label}`,
      })),
      ...catalog.scripts.preset.map(item => ({
        id: buildScopedSelectionValue('preset', item.id),
        label: `脚本 ${item.label}`,
      })),
      ...catalog.scripts.character.map(item => ({
        id: buildScopedSelectionValue('character', item.id),
        label: `脚本 ${item.label}`,
      })),
    ].find(item => item.id === selectionId);
    return option?.label || selectionId || '当前脚本';
  }

  if (activeDetailPage === 'regexes') {
    const selectionId = activeResourceSelection.regexes || '';
    const option = [
      ...catalog.regexes.global.map(item => ({
        id: buildScopedSelectionValue('global', item.id),
        label: `正则 ${item.label}`,
      })),
      ...catalog.regexes.preset.map(item => ({
        id: buildScopedSelectionValue('preset', item.id),
        label: `正则 ${item.label}`,
      })),
      ...catalog.regexes.character.map(item => ({
        id: buildScopedSelectionValue('character', item.id),
        label: `正则 ${item.label}`,
      })),
    ].find(item => item.id === selectionId);
    return option?.label || selectionId || '当前正则';
  }

  if (activeDetailPage === 'worldbooks') {
    const selectionId = activeResourceSelection.worldbooks || '';
    const option = catalog.worldbooks.find(item => item.id === selectionId);
    const entryCount = (getCurrentWorldbookEnabledEntryUids(selectionId) || []).length;
    return `${option?.label || selectionId || '当前世界书'}${selectionId ? ` + 条目 ${entryCount} 条` : ''}`;
  }

  if (activeDetailPage === 'groups') {
    const group = getSelectedBindingGroup();
    return group ? `绑定组 ${group.name}` : '当前绑定组';
  }

  if (activeDetailPage === 'api') {
    const selectionId = activeResourceSelection.api || '';
    const option = catalog.connectionProfiles.find(item => item.id === selectionId);
    return option?.label || selectionId || '当前API连接';
  }

  if (activeDetailPage === 'extensions') {
    const selectionId = activeResourceSelection.extensions || '';
    const option = catalog.extensions.find(item => item.id === selectionId);
    return option?.label || selectionId || '当前插件设置';
  }

  return '当前资源';
}

async function ensureCurrentPresetSelectionBindable(): Promise<boolean> {
  if (activeDetailPage !== 'preset') {
    return true;
  }

  const presetName = (activeResourceSelection.preset || '').trim();
  const result = await ensurePresetExistsForBinding(presetName);
  if (!result.ok) {
    toastr.error(result.reason || '当前预设不可绑定');
    return false;
  }

  if (result.created) {
    invalidatePlusBindingCatalogCache();
    renderSidebarSecondaryList();
    renderResourceDetailPages();
    toastr.info(`已先把当前 in_use 保存为预设「${result.presetName}」`);
  }
  return true;
}

function toggleBindingResourceFromCurrentSelection(resources: PersonaContextBindingResources): {
  resources: PersonaContextBindingResources;
  changed: boolean;
  removed: boolean;
} {
  const nextResources = seedBindingResourcesFromCurrentSelection(resources);

  if (activeDetailPage === 'persona') {
    const avatarId = getEditingAvatarId();
    const currentTraitIds = avatarId ? getPersonaManualEnabledTraitIds(avatarId) : undefined;
    const currentSharedTraitIds = avatarId ? getPersonaEnabledSharedTraitIds(avatarId) : undefined;
    const isSamePersona = avatarId && resources.userPersonaAvatarId === avatarId;
    const isSameTraitSnapshot =
      avatarId && areOptionalStringArraysEqual(resources.userPersonaEnabledTraitIds, currentTraitIds);
    const isSameSharedTraitSnapshot =
      avatarId && areOptionalStringArraysEqual(resources.userPersonaEnabledSharedTraitIds, currentSharedTraitIds);
    if (isSamePersona && isSameTraitSnapshot && isSameSharedTraitSnapshot) {
      return {
        resources: {
          ...resources,
          userPersonaAvatarId: undefined,
          userPersonaProfileId: undefined,
          userPersonaEnabledTraitIds: undefined,
          userPersonaEnabledSharedTraitIds: undefined,
        },
        changed: true,
        removed: true,
      };
    }
    return { resources: nextResources, changed: Boolean(avatarId), removed: false };
  }

  if (activeDetailPage === 'preset') {
    const presetId = activeResourceSelection.preset || '';
    if (!presetId) {
      return { resources, changed: false, removed: false };
    }
    const currentPromptIds = getCurrentPresetPromptSelectionIds(presetId, resources);
    const isSamePromptSnapshot =
      resources.presetEnabledPromptIds !== undefined &&
      areOptionalStringArraysEqual(resources.presetEnabledPromptIds, currentPromptIds);
    if (resources.presetName === presetId && isSamePromptSnapshot) {
      return {
        resources: {
          ...resources,
          presetName: undefined,
          presetEnabledPromptIds: undefined,
        },
        changed: true,
        removed: true,
      };
    }
    return { resources: nextResources, changed: true, removed: false };
  }

  if (activeDetailPage === 'api') {
    const connectionProfileName = (activeResourceSelection.api || '').trim();
    if (!connectionProfileName) {
      return { resources, changed: false, removed: false };
    }
    if (resources.connectionProfileName === connectionProfileName) {
      return {
        resources: {
          ...resources,
          connectionProfileName: undefined,
        },
        changed: true,
        removed: true,
      };
    }
    return { resources: nextResources, changed: true, removed: false };
  }

  if (activeDetailPage === 'scripts') {
    const selection = activeResourceSelection.scripts || '';
    if (!selection) {
      return { resources, changed: false, removed: false };
    }
    const { scope, id } = parseScopedSelectionValue(selection);
    const current = new Set(resources.scripts?.[scope] || []);
    const exists = current.has(id);
    if (exists) {
      current.delete(id);
    } else {
      current.add(id);
    }
    return {
      resources: {
        ...resources,
        scripts: {
          global: [...(resources.scripts?.global || [])],
          preset: [...(resources.scripts?.preset || [])],
          character: [...(resources.scripts?.character || [])],
          [scope]: Array.from(current),
        },
      },
      changed: true,
      removed: exists,
    };
  }

  if (activeDetailPage === 'regexes') {
    const selection = activeResourceSelection.regexes || '';
    if (!selection) {
      return { resources, changed: false, removed: false };
    }
    const { scope, id } = parseScopedSelectionValue(selection);
    const current = new Set(resources.regexes?.[scope] || []);
    const exists = current.has(id);
    if (exists) {
      current.delete(id);
    } else {
      current.add(id);
    }
    return {
      resources: {
        ...resources,
        regexes: {
          global: [...(resources.regexes?.global || [])],
          preset: [...(resources.regexes?.preset || [])],
          character: [...(resources.regexes?.character || [])],
          [scope]: Array.from(current),
        },
      },
      changed: true,
      removed: exists,
    };
  }

  if (activeDetailPage === 'worldbooks') {
    const worldbookName = activeResourceSelection.worldbooks || '';
    if (!worldbookName) {
      return { resources, changed: false, removed: false };
    }
    const currentEntryUids = getCurrentWorldbookEnabledEntryUids(worldbookName, resources);
    const existingEntrySnapshot = getBindingWorldbookEnabledEntryUidsForUi(resources, worldbookName);
    const targetField = activeBindingScope === 'chat' ? 'chat' : 'characterPrimary';
    const isSameWorldbook =
      targetField === 'chat'
        ? resources.worldbooks?.chat === worldbookName
        : resources.worldbooks?.characterPrimary === worldbookName;
    const isSameEntrySnapshot =
      existingEntrySnapshot !== undefined && areOptionalNumberArraysEqual(existingEntrySnapshot, currentEntryUids);
    if (isSameWorldbook && isSameEntrySnapshot) {
      const nextWorldbooks = {
        global: [...(resources.worldbooks?.global || [])],
        characterPrimary: resources.worldbooks?.characterPrimary,
        characterAdditional: [...(resources.worldbooks?.characterAdditional || [])],
        chat: resources.worldbooks?.chat,
      };
      if (targetField === 'chat') {
        nextWorldbooks.chat = undefined;
      } else {
        nextWorldbooks.characterPrimary = undefined;
      }
      return {
        resources: {
          ...resources,
          worldbooks: nextWorldbooks,
          worldbookEntries: replaceWorldbookEntrySnapshotForWorldbook(resources.worldbookEntries, worldbookName, []),
        },
        changed: true,
        removed: true,
      };
    }
    const nextWorldbooks = {
      global: [...(resources.worldbooks?.global || [])],
      characterPrimary: resources.worldbooks?.characterPrimary,
      characterAdditional: [...(resources.worldbooks?.characterAdditional || [])],
      chat: resources.worldbooks?.chat,
    };
    if (targetField === 'chat') {
      nextWorldbooks.chat = worldbookName;
    } else {
      nextWorldbooks.characterPrimary = worldbookName;
    }
    const allEntryUids = $('.plus-worldbook-entry-checkbox', window.parent.document)
      .map((_, el) => Number($(el).val()))
      .get()
      .filter(uid => Number.isFinite(uid));
    return {
      resources: {
        ...resources,
        worldbooks: nextWorldbooks,
        worldbookEntries: replaceWorldbookEntrySnapshotForWorldbook(
          resources.worldbookEntries,
          worldbookName,
          buildWorldbookEntrySnapshotBindings(worldbookName, currentEntryUids || [], allEntryUids),
        ),
      },
      changed: true,
      removed: false,
    };
  }

  return { resources, changed: false, removed: false };
}

async function saveSelectedProfileBinding(_avatarId: string): Promise<void> {
  const parentDoc = window.parent.document;
  const currentContext = getRuntimeContext();
  const currentBinding = ensureCurrentContextBinding(activeBindingScope, currentContext);
  if (!currentBinding) {
    toastr.warning('请先点击顶部绑定到当前角色或当前聊天');
    return;
  }

  const $root = $('#persona-binding-pages-root', parentDoc);
  const $activePage = $root.find('.persona-page-panel.active');
  const $scopeRoot = $activePage.length ? $activePage : $root;
  let resources: PersonaContextBindingResources | undefined;
  try {
    const selectedPresetName = (activeResourceSelection.preset || '').trim();
    const selectedWorldbookName = (activeResourceSelection.worldbooks || '').trim();
    const hasScriptControls =
      $scopeRoot.find('.plus-script-global-checkbox, .plus-script-preset-checkbox, .plus-script-character-checkbox')
        .length > 0;
    const hasRegexControls =
      $scopeRoot.find('.plus-regex-global-checkbox, .plus-regex-preset-checkbox, .plus-regex-character-checkbox')
        .length > 0;
    const hasWorldbookControls =
      $scopeRoot.find(
        '.plus-worldbook-global-checkbox, .plus-worldbook-character-additional-checkbox, #plus-worldbook-character-primary-select, #plus-worldbook-chat-select',
      ).length > 0;
    const hasPresetPromptControls = $scopeRoot.find('.plus-preset-prompt-checkbox').length > 0;
    const hasWorldbookEntryControls = $scopeRoot.find('.plus-worldbook-entry-checkbox').length > 0;
    const currentWorldbookEntryUids = hasWorldbookEntryControls
      ? $scopeRoot
          .find('.plus-worldbook-entry-checkbox:checked')
          .map((_, el) => Number($(el).val()))
          .get()
          .filter(uid => Number.isFinite(uid))
      : undefined;
    const allWorldbookEntryUids = hasWorldbookEntryControls
      ? $scopeRoot
          .find('.plus-worldbook-entry-checkbox')
          .map((_, el) => Number($(el).val()))
          .get()
          .filter(uid => Number.isFinite(uid))
      : undefined;

    resources = {
      userPersonaAvatarId: currentBinding.resources.userPersonaAvatarId,
      userPersonaProfileId: undefined,
      userPersonaEnabledTraitIds:
        currentBinding.resources.userPersonaEnabledTraitIds === undefined
          ? undefined
          : [...currentBinding.resources.userPersonaEnabledTraitIds],
      userPersonaEnabledSharedTraitIds:
        currentBinding.resources.userPersonaEnabledSharedTraitIds === undefined
          ? undefined
          : [...currentBinding.resources.userPersonaEnabledSharedTraitIds],
      connectionProfileName:
        activeDetailPage === 'api'
          ? (activeResourceSelection.api || '').trim() || undefined
          : currentBinding.resources.connectionProfileName,
      presetName: activeDetailPage === 'preset' ? selectedPresetName || undefined : currentBinding.resources.presetName,
      presetEnabledPromptIds:
        hasPresetPromptControls && activeDetailPage === 'preset'
          ? getCurrentPresetPromptSelectionIds(selectedPresetName, currentBinding.resources) || []
          : currentBinding.resources.presetEnabledPromptIds === undefined
            ? undefined
            : [...currentBinding.resources.presetEnabledPromptIds],
      scripts: hasScriptControls
        ? {
            global: getCheckedValues($scopeRoot, '.plus-script-global-checkbox:checked'),
            preset: getCheckedValues($scopeRoot, '.plus-script-preset-checkbox:checked'),
            character: getCheckedValues($scopeRoot, '.plus-script-character-checkbox:checked'),
          }
        : {
            global: [...(currentBinding.resources.scripts?.global || [])],
            preset: [...(currentBinding.resources.scripts?.preset || [])],
            character: [...(currentBinding.resources.scripts?.character || [])],
          },
      regexes: hasRegexControls
        ? {
            global: getCheckedValues($scopeRoot, '.plus-regex-global-checkbox:checked'),
            preset: getCheckedValues($scopeRoot, '.plus-regex-preset-checkbox:checked'),
            character: getCheckedValues($scopeRoot, '.plus-regex-character-checkbox:checked'),
          }
        : {
            global: [...(currentBinding.resources.regexes?.global || [])],
            preset: [...(currentBinding.resources.regexes?.preset || [])],
            character: [...(currentBinding.resources.regexes?.character || [])],
          },
      worldbooks: hasWorldbookControls
        ? {
            global: getCheckedValues($scopeRoot, '.plus-worldbook-global-checkbox:checked'),
            characterPrimary:
              (($('#plus-worldbook-character-primary-select', parentDoc).val() as string | undefined) || '').trim() ||
              undefined,
            characterAdditional: getCheckedValues($scopeRoot, '.plus-worldbook-character-additional-checkbox:checked'),
            chat: (($('#plus-worldbook-chat-select', parentDoc).val() as string | undefined) || '').trim() || undefined,
          }
        : {
            global: [...(currentBinding.resources.worldbooks?.global || [])],
            characterPrimary: currentBinding.resources.worldbooks?.characterPrimary,
            characterAdditional: [...(currentBinding.resources.worldbooks?.characterAdditional || [])],
            chat: currentBinding.resources.worldbooks?.chat,
          },
      worldbookEntries: hasWorldbookEntryControls
        ? replaceWorldbookEntrySnapshotForWorldbook(
            currentBinding.resources.worldbookEntries,
            selectedWorldbookName,
            buildWorldbookEntrySnapshotBindings(
              selectedWorldbookName,
              currentWorldbookEntryUids || [],
              allWorldbookEntryUids || [],
            ),
          )
        : [...(currentBinding.resources.worldbookEntries || [])],
      extensions: [...(currentBinding.resources.extensions || [])],
    };

    if (activeDetailPage === 'worldbooks' && selectedWorldbookName) {
      resources.worldbooks = {
        global: [...(currentBinding.resources.worldbooks?.global || [])],
        characterPrimary:
          activeBindingScope === 'character'
            ? selectedWorldbookName
            : currentBinding.resources.worldbooks?.characterPrimary,
        characterAdditional: [...(currentBinding.resources.worldbooks?.characterAdditional || [])],
        chat: activeBindingScope === 'chat' ? selectedWorldbookName : currentBinding.resources.worldbooks?.chat,
      };
    }
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : String(error));
    return;
  }

  const saved = upsertContextBinding(activeBindingScope, resources, currentContext);
  if (!saved) {
    toastr.error('保存当前绑定失败');
    return;
  }

  renderToolbarSelectionSummary();
  renderResourceDetailPages();
  const applied = await applyPersonaPlusBindingsWithToast(
    getEditingAvatarId() || getCurrentPersonaFromDOM()?.avatarId || '',
    currentContext,
    true,
    '应用当前绑定失败',
  );
  if (!applied) {
    return;
  }
  const currentPersona = getCurrentPersonaFromDOM();
  if (currentPersona?.avatarId) {
    const synced = await applyComposedDescriptionForAvatar(currentPersona.avatarId, '保存聊天/角色绑定后自动同步', {
      errorToastTitle: '保存当前绑定后同步 user人设失败',
    });
    if (!synced) {
      return;
    }
  }
  toastr.success(`已保存${activeBindingScope === 'chat' ? '当前聊天' : '当前角色'}绑定`);
}

async function upsertProfile(avatarId: string, existingProfile?: PersonaProfile): Promise<void> {
  if (activePersonaTraitScope === 'shared') {
    await upsertSharedFolder(avatarId);
    return;
  }

  const parentDoc = window.parent.document;
  const traits = loadPersonaTraits(avatarId);

  if (traits.length === 0) {
    toastr.warning('请先创建至少一个条目，再新建文件夹');
    return;
  }

  const title = existingProfile ? '编辑文件夹' : '新建文件夹';
  const selectedIds = new Set(existingProfile?.traitIds || []);
  const traitCards = traits
    .map(trait => {
      const preview = truncatePreviewText(trait.description || '', 120) || '暂无描述';
      return `
        <label class="persona-modal-check-card" data-filter-text="${escapeHtml(
          `${trait.name} ${trait.description}`.toLowerCase(),
        )}">
          <input type="checkbox" class="profile-trait-checkbox" value="${escapeHtml(trait.id)}" ${selectedIds.has(trait.id) ? 'checked' : ''}>
          <div class="persona-modal-check-copy">
            <div class="persona-modal-check-title">${escapeHtml(trait.name)}</div>
            <div class="persona-modal-check-desc">${escapeHtml(preview)}</div>
          </div>
        </label>
      `;
    })
    .join('');

  const modalHtml = `
    <div class="pool-edit-modal ${BINDINGPLUS_THEME_SCOPE_CLASS}">
      <div class="pool-edit-content persona-modal-content persona-folder-edit-content">
        <div class="persona-modal-header">
          <div>
            <div class="persona-modal-eyebrow">文件夹整理</div>
            <h3>${title}</h3>
            <div class="persona-modal-subtitle">文件夹只负责折叠和整理大量条目，不参与聊天/角色绑定。</div>
          </div>
          <div class="persona-modal-stat">
            <span>已选条目</span>
            <strong id="profile-selected-trait-count">${selectedIds.size} / ${traits.length}</strong>
          </div>
        </div>
        <div class="persona-modal-grid">
          <aside class="persona-modal-sidebar">
            <div class="form-group">
              <label>文件夹名称</label>
              <input type="text" class="persona-input" id="profile-edit-name" value="${escapeHtml(existingProfile?.name || '')}" placeholder="例如：长期设定 / 世界观补充">
            </div>
            <div class="persona-modal-tip-card">
              <div class="persona-modal-tip-title">使用建议</div>
              <div class="persona-modal-tip-copy">把经常一起查看的条目收进同一个文件夹。文件夹只改变展示层级，不会替你绑定聊天或角色。</div>
            </div>
            <div class="persona-modal-tip-card">
              <div class="persona-modal-tip-title">当前范围</div>
              <div class="persona-modal-tip-copy">共 ${traits.length} 条条目。右侧可以搜索条目名称和描述，再对当前可见条目批量勾选。</div>
            </div>
          </aside>
          <section class="persona-modal-main">
            <div class="persona-modal-toolbar">
              <div class="persona-modal-toolbar-copy">
                <div class="persona-modal-section-title">包含条目</div>
                <div class="persona-modal-section-note">按名称或描述搜索，然后勾选要收进文件夹的条目。</div>
              </div>
              <div class="persona-modal-toolbar-actions">
                <button type="button" class="persona-btn" id="profile-select-visible-btn">全选可见</button>
                <button type="button" class="persona-btn" id="profile-clear-visible-btn">清空可见</button>
              </div>
            </div>
            <div class="form-group">
              <input type="text" class="persona-input persona-modal-search" id="profile-trait-search" placeholder="搜索条目名称或描述">
            </div>
            <div class="persona-modal-checkbox-list" id="profile-trait-list">${traitCards}</div>
            <div class="empty-list persona-modal-empty" id="profile-trait-empty" style="display:none;">没有匹配的条目</div>
          </section>
        </div>
        <div class="edit-actions-bar">
          <button class="persona-btn" id="profile-save-btn">💾 保存</button>
          <button class="persona-btn" id="profile-close-btn">✖ 关闭</button>
        </div>
      </div>
      <div class="pool-edit-overlay"></div>
    </div>
  `;

  const $modal = $(modalHtml).appendTo($('body', parentDoc));
  applyBindingPlusModalPresentation($modal);
  const closeModal = () => $modal.remove();
  const updateSelectedCount = () => {
    const checkedCount = $('.profile-trait-checkbox:checked', $modal).length;
    $('#profile-selected-trait-count', $modal).text(`${checkedCount} / ${traits.length}`);
  };
  const applyTraitFilter = () => {
    const keyword = (($('#profile-trait-search', $modal).val() as string | undefined) || '').trim().toLowerCase();
    let visibleCount = 0;
    $('.persona-modal-check-card', $modal).each(function () {
      const haystack = (($(this).attr('data-filter-text') as string | undefined) || '').toLowerCase();
      const matched = !keyword || haystack.includes(keyword);
      $(this).toggle(matched);
      if (matched) {
        visibleCount += 1;
      }
    });
    $('#profile-trait-empty', $modal).toggle(visibleCount === 0);
  };

  $('#profile-close-btn', $modal).on('click', closeModal);
  $('.pool-edit-overlay', $modal).on('click', closeModal);
  $('#profile-trait-search', $modal).on('input', applyTraitFilter);
  $('.profile-trait-checkbox', $modal).on('change', updateSelectedCount);
  $('#profile-select-visible-btn', $modal).on('click', () => {
    $('.persona-modal-check-card:visible .profile-trait-checkbox', $modal).prop('checked', true);
    updateSelectedCount();
  });
  $('#profile-clear-visible-btn', $modal).on('click', () => {
    $('.persona-modal-check-card:visible .profile-trait-checkbox', $modal).prop('checked', false);
    updateSelectedCount();
  });
  applyTraitFilter();
  updateSelectedCount();
  $('#profile-edit-name', $modal).trigger('focus');

  $('#profile-save-btn', $modal).on('click', async () => {
    const config = loadPersonaAdvancedConfig(avatarId);
    const name = ($('#profile-edit-name', $modal).val() as string | undefined)?.trim();
    if (!name) {
      toastr.warning('请输入文件夹名称');
      return;
    }

    const traitIds = $('.profile-trait-checkbox:checked', $modal)
      .map((_, el) => ($(el).val() as string | undefined) || '')
      .get()
      .filter(Boolean);

    if (traitIds.length === 0) {
      toastr.warning('文件夹里至少选择一个条目');
      return;
    }

    let profileId = existingProfile?.id || '';
    if (existingProfile) {
      recordPersonaSnapshot(avatarId, `编辑文件夹: ${normalizeProfileDisplayName(existingProfile.name)}`);
      const index = config.profiles.findIndex(p => p.id === existingProfile.id);
      if (index !== -1) {
        config.profiles[index] = {
          ...config.profiles[index],
          name,
          traitIds,
          plusBinding: undefined,
          updatedAt: Date.now(),
        };
        profileId = config.profiles[index].id;
      }
    } else {
      recordPersonaSnapshot(avatarId, '新增文件夹');
      profileId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      config.profiles.push({
        id: profileId,
        name,
        traitIds,
        plusBinding: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    savePersonaAdvancedConfig(avatarId, config);
    setActivePersonaFolderId(avatarId, profileId);
    renderPersonaTraits(avatarId);
    renderSnapshotSection(avatarId);
    await applyComposedDescriptionForAvatar(avatarId, '更新文件夹后自动同步');
    toastr.success('文件夹已保存');
    closeModal();
  });
}

async function upsertSharedFolder(avatarId: string, existingFolder?: PersonaSharedFolder): Promise<void> {
  const parentDoc = window.parent.document;
  const sharedConfig = loadSharedPersonaTraitsConfig();
  const traits = sharedConfig.traits;

  if (traits.length === 0) {
    toastr.warning('请先创建至少一个通用条目，再新建通用文件夹');
    return;
  }

  const title = existingFolder ? '编辑通用文件夹' : '新建通用文件夹';
  const selectedIds = new Set(existingFolder?.traitIds || []);
  const traitCards = traits
    .map(trait => {
      const preview = truncatePreviewText(trait.description || '', 120) || '暂无描述';
      return `
        <label class="persona-modal-check-card" data-filter-text="${escapeHtml(
          `${trait.name} ${trait.description}`.toLowerCase(),
        )}">
          <input type="checkbox" class="profile-trait-checkbox" value="${escapeHtml(trait.id)}" ${selectedIds.has(trait.id) ? 'checked' : ''}>
          <div class="persona-modal-check-copy">
            <div class="persona-modal-check-title">${escapeHtml(trait.name)}</div>
            <div class="persona-modal-check-desc">${escapeHtml(preview)}</div>
          </div>
        </label>
      `;
    })
    .join('');

  const modalHtml = `
    <div class="pool-edit-modal ${BINDINGPLUS_THEME_SCOPE_CLASS}">
      <div class="pool-edit-content persona-modal-content persona-folder-edit-content">
        <div class="persona-modal-header">
          <div>
            <div class="persona-modal-eyebrow">通用文件夹</div>
            <h3>${title}</h3>
            <div class="persona-modal-subtitle">通用文件夹在所有 user 人设里共享；每个 user 人设仍然独立保存勾选状态。</div>
          </div>
          <div class="persona-modal-stat">
            <span>已选条目</span>
            <strong id="profile-selected-trait-count">${selectedIds.size} / ${traits.length}</strong>
          </div>
        </div>
        <div class="persona-modal-grid">
          <aside class="persona-modal-sidebar">
            <div class="form-group">
              <label>文件夹名称</label>
              <input type="text" class="persona-input" id="profile-edit-name" value="${escapeHtml(existingFolder?.name || '')}" placeholder="例如：性格 / 爱好 / 长期习惯">
            </div>
            <div class="persona-modal-tip-card">
              <div class="persona-modal-tip-title">当前范围</div>
              <div class="persona-modal-tip-copy">共 ${traits.length} 条通用条目。这里编辑的是全局共享文件夹，不会改变各 user 人设的勾选。</div>
            </div>
          </aside>
          <section class="persona-modal-main">
            <div class="persona-modal-toolbar">
              <div class="persona-modal-toolbar-copy">
                <div class="persona-modal-section-title">包含通用条目</div>
                <div class="persona-modal-section-note">按名称或描述搜索，然后勾选要收进文件夹的通用条目。</div>
              </div>
              <div class="persona-modal-toolbar-actions">
                <button type="button" class="persona-btn" id="profile-select-visible-btn">全选可见</button>
                <button type="button" class="persona-btn" id="profile-clear-visible-btn">清空可见</button>
              </div>
            </div>
            <div class="form-group">
              <input type="text" class="persona-input persona-modal-search" id="profile-trait-search" placeholder="搜索条目名称或描述">
            </div>
            <div class="persona-modal-checkbox-list" id="profile-trait-list">${traitCards}</div>
            <div class="empty-list persona-modal-empty" id="profile-trait-empty" style="display:none;">没有匹配的条目</div>
          </section>
        </div>
        <div class="edit-actions-bar">
          <button class="persona-btn" id="profile-save-btn">💾 保存</button>
          <button class="persona-btn" id="profile-close-btn">✖ 关闭</button>
        </div>
      </div>
      <div class="pool-edit-overlay"></div>
    </div>
  `;

  const $modal = $(modalHtml).appendTo($('body', parentDoc));
  applyBindingPlusModalPresentation($modal);
  const closeModal = () => $modal.remove();
  const updateSelectedCount = () => {
    const checkedCount = $('.profile-trait-checkbox:checked', $modal).length;
    $('#profile-selected-trait-count', $modal).text(`${checkedCount} / ${traits.length}`);
  };
  const applyTraitFilter = () => {
    const keyword = (($('#profile-trait-search', $modal).val() as string | undefined) || '').trim().toLowerCase();
    let visibleCount = 0;
    $('.persona-modal-check-card', $modal).each(function () {
      const haystack = (($(this).attr('data-filter-text') as string | undefined) || '').toLowerCase();
      const matched = !keyword || haystack.includes(keyword);
      $(this).toggle(matched);
      if (matched) {
        visibleCount += 1;
      }
    });
    $('#profile-trait-empty', $modal).toggle(visibleCount === 0);
  };

  $('#profile-close-btn', $modal).on('click', closeModal);
  $('.pool-edit-overlay', $modal).on('click', closeModal);
  $('#profile-trait-search', $modal).on('input', applyTraitFilter);
  $('.profile-trait-checkbox', $modal).on('change', updateSelectedCount);
  $('#profile-select-visible-btn', $modal).on('click', () => {
    $('.persona-modal-check-card:visible .profile-trait-checkbox', $modal).prop('checked', true);
    updateSelectedCount();
  });
  $('#profile-clear-visible-btn', $modal).on('click', () => {
    $('.persona-modal-check-card:visible .profile-trait-checkbox', $modal).prop('checked', false);
    updateSelectedCount();
  });
  applyTraitFilter();
  updateSelectedCount();
  $('#profile-edit-name', $modal).trigger('focus');

  $('#profile-save-btn', $modal).on('click', async () => {
    const latestSharedConfig = loadSharedPersonaTraitsConfig();
    const name = ($('#profile-edit-name', $modal).val() as string | undefined)?.trim();
    if (!name) {
      toastr.warning('请输入文件夹名称');
      return;
    }

    const traitIds = $('.profile-trait-checkbox:checked', $modal)
      .map((_, el) => ($(el).val() as string | undefined) || '')
      .get()
      .filter(Boolean);

    if (traitIds.length === 0) {
      toastr.warning('文件夹里至少选择一个通用条目');
      return;
    }

    let folderId = existingFolder?.id || '';
    if (existingFolder) {
      recordPersonaSnapshot(avatarId, `编辑通用文件夹: ${normalizeProfileDisplayName(existingFolder.name)}`);
      const index = latestSharedConfig.folders.findIndex(folder => folder.id === existingFolder.id);
      if (index !== -1) {
        latestSharedConfig.folders[index] = {
          ...latestSharedConfig.folders[index],
          name,
          traitIds,
          updatedAt: Date.now(),
        };
        folderId = latestSharedConfig.folders[index].id;
      }
    } else {
      recordPersonaSnapshot(avatarId, '新增通用文件夹');
      folderId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      latestSharedConfig.folders.push({
        id: folderId,
        name,
        traitIds: Array.from(new Set(traitIds)),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    saveSharedPersonaTraitsConfig(latestSharedConfig);
    setActivePersonaFolderId(avatarId, folderId, 'shared');
    renderPersonaTraits(avatarId);
    renderSnapshotSection(avatarId);
    await applyComposedDescriptionForAvatar(avatarId, '更新通用文件夹后自动同步');
    toastr.success('通用文件夹已保存');
    closeModal();
  });
}

async function deleteActiveProfile(avatarId: string, profileIdInput?: string): Promise<void> {
  if (activePersonaTraitScope === 'shared') {
    await deleteSharedFolder(avatarId, profileIdInput);
    return;
  }

  const profileId = (profileIdInput || '').trim();
  if (!profileId) {
    toastr.warning('未指定要删除的文件夹');
    return;
  }

  const config = loadPersonaAdvancedConfig(avatarId);
  const target = config.profiles.find(p => p.id === profileId);
  if (!target) {
    toastr.warning('未找到目标文件夹');
    return;
  }

  if (!confirm(`确定删除文件夹「${normalizeProfileDisplayName(target.name)}」吗？`)) {
    return;
  }

  recordPersonaSnapshot(avatarId, `删除文件夹: ${normalizeProfileDisplayName(target.name)}`);
  config.profiles = config.profiles.filter(p => p.id !== profileId);
  config.rules = config.rules.filter(
    rule =>
      rule.profileId !== profileId &&
      !(rule.profileIds.length === 1 && rule.profileIds[0] === profileId && rule.traitIds.length === 0),
  );
  if (config.activeProfileId === profileId) {
    config.activeProfileId = '';
  }
  if (activePersonaFolderIdByAvatar.get(avatarId) === profileId) {
    setActivePersonaFolderId(avatarId, PERSONA_UNGROUPED_FOLDER_ID);
  }
  savePersonaAdvancedConfig(avatarId, config);
  renderPersonaTraits(avatarId);
  renderSnapshotSection(avatarId);
  await applyComposedDescriptionForAvatar(avatarId, '删除文件夹后自动同步');
  toastr.success('文件夹已删除');
}

async function deleteSharedFolder(avatarId: string, folderIdInput?: string): Promise<void> {
  const folderId = (folderIdInput || '').trim();
  if (!folderId) {
    toastr.warning('未指定要删除的通用文件夹');
    return;
  }

  const sharedConfig = loadSharedPersonaTraitsConfig();
  const target = sharedConfig.folders.find(folder => folder.id === folderId);
  if (!target) {
    toastr.warning('未找到目标通用文件夹');
    return;
  }

  if (!confirm(`确定删除通用文件夹「${normalizeProfileDisplayName(target.name)}」吗？`)) {
    return;
  }

  recordPersonaSnapshot(avatarId, `删除通用文件夹: ${normalizeProfileDisplayName(target.name)}`);
  sharedConfig.folders = sharedConfig.folders.filter(folder => folder.id !== folderId);
  if (activePersonaFolderIdByAvatar.get(getPersonaFolderStateKey(avatarId, 'shared')) === folderId) {
    setActivePersonaFolderId(avatarId, PERSONA_UNGROUPED_FOLDER_ID, 'shared');
  }
  saveSharedPersonaTraitsConfig(sharedConfig);
  renderPersonaTraits(avatarId);
  renderSnapshotSection(avatarId);
  await applyComposedDescriptionForAvatar(avatarId, '删除通用文件夹后自动同步');
  toastr.success('通用文件夹已删除');
}

// ==================== 快照回滚 ====================

function showSnapshotList(avatarId: string): void {
  const parentDoc = window.parent.document;
  const snapshots = loadPersonaSnapshots(avatarId);
  const list = snapshots
    .slice(-20)
    .reverse()
    .map(snapshot => `<li>${escapeHtml(formatTime(snapshot.timestamp))} - ${escapeHtml(snapshot.reason)}</li>`)
    .join('');

  const modalHtml = `
    <div class="pool-edit-modal ${BINDINGPLUS_THEME_SCOPE_CLASS}">
      <div class="pool-edit-content">
        <h3>最近快照</h3>
        <ul class="snapshot-list">${list || '<li>暂无快照</li>'}</ul>
        <div class="edit-actions-bar">
          <button class="persona-btn" id="snapshot-close-btn">关闭</button>
        </div>
      </div>
      <div class="pool-edit-overlay"></div>
    </div>
  `;

  const $modal = $(modalHtml).appendTo($('body', parentDoc));
  applyBindingPlusModalPresentation($modal);
  const closeModal = () => $modal.remove();
  $('#snapshot-close-btn', $modal).on('click', closeModal);
  $('.pool-edit-overlay', $modal).on('click', closeModal);
}

async function rollbackLastSnapshot(avatarId: string): Promise<void> {
  const restored = restoreLastPersonaSnapshot(avatarId);
  if (!restored) {
    toastr.warning('没有可回滚的快照');
    return;
  }

  const parentDoc = window.parent.document;
  $('#edit-persona-base-desc', parentDoc).val(restored.baseDescription);
  $('#edit-persona-desc', parentDoc).val(restored.baseDescription);
  savePersonaBaseDescription(avatarId, restored.baseDescription);

  renderPersonaTraits(avatarId);
  renderSnapshotSection(avatarId);
  renderBindingPlusStorageSection();
  await applyComposedDescriptionForAvatar(avatarId, '回滚快照后自动同步', {
    applyPlusBindings: false,
    errorToastTitle: '回滚快照后同步 user人设失败',
  });
  toastr.success(`已回滚到 ${formatTime(restored.timestamp)} 的版本`);
}

// ==================== 事件绑定 ====================

function bindPanelEvents(): void {
  const parentDoc = window.parent.document;

  $('#persona-close-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, hidePanel);
  $('#persona-overlay', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, hidePanel);
  $(window.parent)
    .off(`resize${PANEL_EVENT_NAMESPACE} orientationchange${PANEL_EVENT_NAMESPACE}`)
    .on(`resize${PANEL_EVENT_NAMESPACE} orientationchange${PANEL_EVENT_NAMESPACE}`, () => {
      syncBindingPlusLayoutMode();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-mobile-drawer-toggle-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-mobile-drawer-toggle-btn', () => {
      toggleBindingPlusDrawer();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-drawer-backdrop')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-drawer-backdrop', () => {
      toggleBindingPlusDrawer(false);
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-mobile-folder-toggle-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-mobile-folder-toggle-btn', () => {
      togglePersonaFolderDrawer();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-mobile-folder-close-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-mobile-folder-close-btn', () => {
      togglePersonaFolderDrawer(false);
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-folder-mobile-drawer-backdrop')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-folder-mobile-drawer-backdrop', () => {
      togglePersonaFolderDrawer(false);
    });

  $('#persona-refresh-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, async () => {
    if (activeDetailPage === 'api') {
      if (await refreshApiConnectionCatalog({ quiet: false, rerender: true })) {
        toastr.success('API连接索引已刷新');
      }
      return;
    }
    invalidatePlusBindingCatalogCache();
    renderSidebarSecondaryList();
    renderResourceDetailPages();
    toastr.success('当前资源索引已刷新');
  });

  $('#persona-default-persona-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, async () => {
    try {
      const avatarId = getEditingAvatarId();
      if (!avatarId) {
        toastr.warning('请先在左侧选择一个 user 人设');
        return;
      }

      const before = findPersonaByAvatarId(avatarId);
      if (!before) {
        toastr.warning('未找到当前 user 人设');
        return;
      }

      if (!before.isSelected) {
        const switched = await selectPersonaInParentUI(avatarId);
        if (!switched) {
          toastr.warning('切换到目标 user 人设失败，无法调用酒馆默认人设按钮');
          return;
        }
      }

      const $defaultButton = $('#lock_persona_default', parentDoc);
      if (!$defaultButton.length) {
        toastr.warning('找不到酒馆默认人设按钮');
        return;
      }

      $defaultButton.trigger('click');
      await new Promise(resolve => window.setTimeout(resolve, 180));
      await renderPersonaList(true);
      renderPersonaDefaultButtonState(avatarId);

      const after = findPersonaByAvatarId(avatarId);
      if (after?.isDefault) {
        const snapshotResult = saveCurrentPersonaTraitsAsDefaultSnapshot(avatarId);
        if (!snapshotResult.ok) {
          toastr.error(`已将「${after.name || avatarId}」设为默认人设，但保存默认条目状态失败`);
          return;
        }
        toastr.success(`已将「${after.name || avatarId}」设为默认人设，并同步默认条目状态（${snapshotResult.count} 条）`);
        return;
      }

      toastr.success(`已取消「${before.name || avatarId}」的默认人设`);
    } catch (error) {
      showUiErrorToast('设置默认 user人设失败', error);
    }
  });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-save-default-traits-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-save-default-traits-btn', () => {
      const avatarId = getEditingAvatarId();
      if (!avatarId) {
        toastr.warning('请先在左侧选择一个 user 人设');
        return;
      }

      recordPersonaSnapshot(avatarId, '保存默认条目状态');
      const snapshotResult = saveCurrentPersonaTraitsAsDefaultSnapshot(avatarId, {
        announceSuccess: true,
        announceUnchanged: true,
      });
      if (!snapshotResult.ok) {
        toastr.error('保存默认条目状态失败');
      }
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-default-preset-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-default-preset-btn', async () => {
      try {
        const presetName = (activeResourceSelection.preset || '').trim();
        if (!presetName) {
          toastr.warning('请先在左侧选择一个预设');
          return;
        }
        if (!(await ensureCurrentPresetSelectionBindable())) {
          return;
        }

        const currentDefaultPreset = getDefaultPresetName();
        const nextDefaultPreset = currentDefaultPreset === presetName ? '' : presetName;
        if (!setDefaultPresetName(nextDefaultPreset)) {
          toastr.error('保存默认预设失败');
          return;
        }

        let snapshotResult: { ok: boolean; changed: boolean; count: number } | null = null;
        if (nextDefaultPreset) {
          snapshotResult = saveCurrentPresetPromptsAsDefaultSnapshot(presetName);
          if (!snapshotResult.ok) {
            toastr.error(`已将「${presetName}」设为默认预设，但保存默认预设条目状态失败`);
            return;
          }
        }

        renderResourceDetailPages();
        const applied = await applyPersonaPlusBindingsWithToast(
          getCurrentPersonaFromDOM()?.avatarId || getEditingAvatarId() || '',
          getRuntimeContext(),
          true,
          '应用默认预设失败',
        );
        if (!applied) {
          return;
        }

        toastr.success(
          nextDefaultPreset
            ? `已将「${presetName}」设为默认预设，并同步默认预设条目状态（${snapshotResult?.count || 0} 条）`
            : `已取消默认预设「${presetName}」`,
        );
      } catch (error) {
        showUiErrorToast('设置默认预设失败', error);
      }
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-save-default-preset-prompts-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-save-default-preset-prompts-btn', async () => {
      const presetName = (activeResourceSelection.preset || '').trim();
      if (!presetName) {
        toastr.warning('请先在左侧选择一个预设');
        return;
      }
      if (!(await ensureCurrentPresetSelectionBindable())) {
        return;
      }

      const snapshotResult = saveCurrentPresetPromptsAsDefaultSnapshot(presetName, {
        announceSuccess: true,
        announceUnchanged: true,
      });
      if (!snapshotResult.ok) {
        toastr.error('保存默认预设条目状态失败');
      }
    });

  $(parentDoc)
    .off(`change${PANEL_EVENT_NAMESPACE}`, '.plus-preset-prompt-checkbox')
    .on(`change${PANEL_EVENT_NAMESPACE}`, '.plus-preset-prompt-checkbox', async () => {
      renderPresetPromptDefaultSnapshotState();
      const presetName = (activeResourceSelection.preset || '').trim();
      if (!presetName) {
        return;
      }

      const loadedPresetName = getLoadedPresetNameSafe();
      if (!loadedPresetName || loadedPresetName !== presetName) {
        return;
      }

      const activeBinding = getActiveEditingBinding();
      const hasBindingSnapshot =
        activeBinding?.resources.presetName === presetName &&
        activeBinding.resources.presetEnabledPromptIds !== undefined;
      if (hasBindingSnapshot) {
        return;
      }

      try {
        await applyPresetPromptEnabledSnapshot(presetName, getCurrentPresetPromptSelectionIds(presetName) || []);
      } catch (error) {
        console.error('绑定plus: 同步当前加载预设条目状态失败', error);
      }
      syncLoadedPresetPromptDefaultSnapshot('preset_prompt_checkbox_changed');
      syncPresetPromptControlsFromLoadedPreset();
    });

  $(parentDoc)
    .off(`input${PANEL_EVENT_NAMESPACE}`, '#persona-preset-prompt-search')
    .on(`input${PANEL_EVENT_NAMESPACE}`, '#persona-preset-prompt-search', () => {
      applyPresetPromptFilter();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-prompt-preview-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-prompt-preview-btn', function (event) {
      event.preventDefault();
      event.stopPropagation();
      const presetName = (($(this).attr('data-preset-name') as string | undefined) || '').trim();
      const promptKey = (($(this).attr('data-prompt-key') as string | undefined) || '').trim();
      showPresetPromptPreviewModal(presetName, promptKey);
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-worldbook-entry-preview-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-worldbook-entry-preview-btn', function (event) {
      event.preventDefault();
      event.stopPropagation();
      const worldbookName = (($(this).attr('data-worldbook-name') as string | undefined) || '').trim();
      const entryUid = Number($(this).attr('data-entry-uid'));
      showWorldbookEntryPreviewModal(worldbookName, entryUid);
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-save-default-worldbook-entries-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-save-default-worldbook-entries-btn', () => {
      const worldbookName = (activeResourceSelection.worldbooks || '').trim();
      if (!worldbookName) {
        toastr.warning('请先在左侧选择一个世界书');
        return;
      }

      const currentEntryUids = getCurrentWorldbookEnabledEntryUids(worldbookName) || [];
      const savedEntryUids = loadDefaultWorldbookEnabledEntryUids(worldbookName);
      if (areOptionalNumberArraysEqual(savedEntryUids, currentEntryUids)) {
        renderWorldbookEntryDefaultSnapshotState();
        toastr.info('当前勾选已是默认世界书条目状态');
        return;
      }

      if (!saveDefaultWorldbookEnabledEntryUids(worldbookName, currentEntryUids)) {
        toastr.error('保存默认世界书条目状态失败');
        return;
      }

      renderWorldbookEntryDefaultSnapshotState();
      toastr.success(`已保存世界书「${worldbookName}」的默认条目状态（${currentEntryUids.length} 条）`);
    });

  $(parentDoc)
    .off(`change${PANEL_EVENT_NAMESPACE}`, '.plus-worldbook-entry-checkbox')
    .on(`change${PANEL_EVENT_NAMESPACE}`, '.plus-worldbook-entry-checkbox', () => {
      renderWorldbookEntryDefaultSnapshotState();
    });

  $(parentDoc)
    .off(`input${PANEL_EVENT_NAMESPACE}`, '#persona-worldbook-entry-search')
    .on(`input${PANEL_EVENT_NAMESPACE}`, '#persona-worldbook-entry-search', () => {
      applyWorldbookEntryFilter();
    });

  $('#persona-lock-chat-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, async () => {
    try {
      if (activeDetailPage === 'groups') {
        await applyBindingGroupToCurrentScope('chat');
        return;
      }

      if (!(await ensureCurrentPresetSelectionBindable())) {
        return;
      }

      const binding = ensureCurrentContextBinding('chat');
      if (!binding) {
        toastr.warning('无法创建当前聊天绑定');
        return;
      }
      const selectionLabel = truncateBindingToastLabel(getCurrentSelectionDisplayLabel());
      const targetLabel = truncateBindingToastLabel(binding.targetName || getBindingTargetDisplay('chat'));
      const toggleResult = toggleBindingResourceFromCurrentSelection(binding.resources);
      if (toggleResult.changed) {
        if (hasBindingResources(toggleResult.resources)) {
          const savedBinding = upsertContextBinding('chat', toggleResult.resources);
          if (!savedBinding) {
            toastr.error('保存当前聊天绑定失败');
            return;
          }
        } else if (!deleteContextBinding('chat')) {
          toastr.error('移除当前聊天绑定失败');
          return;
        }
      }
      activeBindingScope = 'chat';
      renderToolbarSelectionSummary();
      renderResourceDetailPages();
      const applied = await applyPersonaPlusBindingsWithToast(
        getCurrentPersonaFromDOM()?.avatarId || getEditingAvatarId() || '',
        getRuntimeContext(),
        true,
        '应用当前聊天绑定失败',
      );
      if (!applied) {
        return;
      }
      const currentPersona = getCurrentPersonaFromDOM();
      if (currentPersona?.avatarId) {
        const synced = await applyComposedDescriptionForAvatar(currentPersona.avatarId, '切换到当前聊天绑定后自动同步', {
          errorToastTitle: '同步当前聊天绑定后的 user人设失败',
        });
        if (!synced) {
          return;
        }
      }
      if (toggleResult.changed && toggleResult.removed) {
        toastr.success(`已从聊天「${targetLabel}」解绑「${selectionLabel}」`);
        return;
      }
      if (toggleResult.changed) {
        toastr.success(`已把「${selectionLabel}」绑定到聊天「${targetLabel}」`);
        return;
      }
      toastr.success(`正在编辑聊天「${targetLabel}」的绑定`);
    } catch (error) {
      showUiErrorToast('绑定到当前聊天失败', error);
    }
  });

  $('#persona-lock-char-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, async () => {
    try {
      if (activeDetailPage === 'groups') {
        await applyBindingGroupToCurrentScope('character');
        return;
      }

      if (!(await ensureCurrentPresetSelectionBindable())) {
        return;
      }

      const binding = ensureCurrentContextBinding('character');
      if (!binding) {
        toastr.warning('无法创建当前角色绑定');
        return;
      }
      const selectionLabel = truncateBindingToastLabel(getCurrentSelectionDisplayLabel());
      const targetLabel = truncateBindingToastLabel(binding.targetName || getBindingTargetDisplay('character'));
      const toggleResult = toggleBindingResourceFromCurrentSelection(binding.resources);
      if (toggleResult.changed) {
        if (hasBindingResources(toggleResult.resources)) {
          const savedBinding = upsertContextBinding('character', toggleResult.resources);
          if (!savedBinding) {
            toastr.error('保存当前角色绑定失败');
            return;
          }
        } else if (!deleteContextBinding('character')) {
          toastr.error('移除当前角色绑定失败');
          return;
        }
      }
      activeBindingScope = 'character';
      renderToolbarSelectionSummary();
      renderResourceDetailPages();
      const applied = await applyPersonaPlusBindingsWithToast(
        getCurrentPersonaFromDOM()?.avatarId || getEditingAvatarId() || '',
        getRuntimeContext(),
        true,
        '应用当前角色绑定失败',
      );
      if (!applied) {
        return;
      }
      const currentPersona = getCurrentPersonaFromDOM();
      if (currentPersona?.avatarId) {
        const synced = await applyComposedDescriptionForAvatar(currentPersona.avatarId, '切换到当前角色绑定后自动同步', {
          errorToastTitle: '同步当前角色绑定后的 user人设失败',
        });
        if (!synced) {
          return;
        }
      }
      if (toggleResult.changed && toggleResult.removed) {
        toastr.success(`已从角色「${targetLabel}」解绑「${selectionLabel}」`);
        return;
      }
      if (toggleResult.changed) {
        toastr.success(`已把「${selectionLabel}」绑定到角色「${targetLabel}」`);
        return;
      }
      toastr.success(`正在编辑角色「${targetLabel}」的绑定`);
    } catch (error) {
      showUiErrorToast('绑定到当前角色失败', error);
    }
  });

  $('#persona-search-bar', parentDoc).on(`input${PANEL_EVENT_NAMESPACE}`, function () {
    personaSearchKeyword = (($(this).val() as string | undefined) || '').trim();
    renderSidebarSecondaryList();
  });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-resource-nav-item')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-resource-nav-item', function () {
      const page = (($(this).attr('data-page') as string | undefined) || 'persona') as DetailPageKey;
      activeDetailPage = page;
      syncActiveDetailPageUi();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-toolbar-binding-line')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-toolbar-binding-line', function () {
      const scope = (($(this).attr('data-binding-scope') as string | undefined) || 'character') as 'chat' | 'character';
      activeBindingScope = scope === 'chat' ? 'chat' : 'character';
      ensureCurrentContextBinding(activeBindingScope);
      renderToolbarSelectionSummary();
      renderResourceDetailPages();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-yaml-import-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-yaml-import-btn', () => {
      const avatarId = getEditingAvatarId();
      if (!avatarId) {
        toastr.warning('请先在左侧选择一个 user 人设');
        return;
      }
      showPersonaYamlImportModal(avatarId);
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-folder-add-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-folder-add-btn', async () => {
      const avatarId = getEditingAvatarId();
      if (!avatarId) {
        toastr.warning('请先在左侧选择一个 user 人设');
        return;
      }
      await upsertProfile(avatarId);
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-binding-save-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-binding-save-btn', async () => {
      await saveSelectedProfileBinding('');
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-new-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-new-btn', () => {
      createNewBindingGroup();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-save-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-save-btn', () => {
      saveActiveBindingGroupFromPage();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-delete-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-delete-btn', () => {
      deleteActiveBindingGroup();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-context-binding-delete-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-context-binding-delete-btn', event => {
      event.preventDefault();
      event.stopPropagation();
      const bindingId = (($(event.currentTarget).attr('data-binding-id') as string | undefined) || '').trim();
      void deleteContextBindingFromUi(bindingId);
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#bindingplus-backup-export-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#bindingplus-backup-export-btn', () => {
      exportBindingPlusBackup();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#bindingplus-backup-import-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#bindingplus-backup-import-btn', () => {
      $('#bindingplus-backup-import-input', parentDoc).trigger('click');
    });

  $(parentDoc)
    .off(`change${PANEL_EVENT_NAMESPACE}`, '#bindingplus-backup-import-input')
    .on(`change${PANEL_EVENT_NAMESPACE}`, '#bindingplus-backup-import-input', function () {
      const input = this as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) {
        return;
      }
      void importBindingPlusBackupFromFile(file);
    });

  $(parentDoc)
    .off(`change${PANEL_EVENT_NAMESPACE}`, '#bindingplus-theme-preset-select')
    .on(`change${PANEL_EVENT_NAMESPACE}`, '#bindingplus-theme-preset-select', function () {
      const presetId = (($(this).val() as string | undefined) || '').trim() as BindingPlusThemePresetId;
      const currentState = loadBindingPlusTheme();
      saveAndApplyBindingPlusThemeState({
        ...currentState,
        presetId,
      });
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.bindingplus-theme-preset-chip')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.bindingplus-theme-preset-chip', function () {
      const presetId = (
        ($(this).attr('data-preset-id') as string | undefined) || ''
      ).trim() as BindingPlusThemePresetId;
      if (!presetId) {
        return;
      }
      const currentState = loadBindingPlusTheme();
      saveAndApplyBindingPlusThemeState({
        ...currentState,
        presetId,
      });
    });

  $(parentDoc)
    .off(`change${PANEL_EVENT_NAMESPACE}`, '#bindingplus-theme-custom-toggle')
    .on(`change${PANEL_EVENT_NAMESPACE}`, '#bindingplus-theme-custom-toggle', function () {
      const currentState = loadBindingPlusTheme();
      saveAndApplyBindingPlusThemeState({
        ...currentState,
        useCustomOverrides: Boolean($(this).prop('checked')),
      });
    });

  $(parentDoc)
    .off(`input${PANEL_EVENT_NAMESPACE}`, '.bindingplus-theme-color-input')
    .on(`input${PANEL_EVENT_NAMESPACE}`, '.bindingplus-theme-color-input', function () {
      const tokenKey = (
        ($(this).attr('data-token-key') as string | undefined) || ''
      ).trim() as keyof BindingPlusThemeTokens;
      const value = (($(this).val() as string | undefined) || '').trim();
      if (!tokenKey || !isHexColorTokenValue(value)) {
        return;
      }
      const currentState = loadBindingPlusTheme();
      saveAndApplyBindingPlusThemeState(
        {
          ...currentState,
          useCustomOverrides: true,
          customTokens: {
            ...currentState.customTokens,
            [tokenKey]: value,
          },
        },
        { rerender: false },
      );
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#bindingplus-theme-restore-preset-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#bindingplus-theme-restore-preset-btn', () => {
      const currentState = loadBindingPlusTheme();
      if (isBindingPlusFollowSmartThemePreset(currentState.presetId)) {
        return;
      }
      saveAndApplyBindingPlusThemeState(
        {
          ...currentState,
          customTokens: {},
          useCustomOverrides: false,
        },
        { successMessage: '已恢复当前预设默认值' },
      );
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#bindingplus-theme-reset-default-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#bindingplus-theme-reset-default-btn', () => {
      if (!resetBindingPlusTheme()) {
        toastr.error('重置默认主题失败');
        return;
      }
      applyBindingPlusThemeToDom(parentDoc);
      renderBindingPlusThemeSection();
      toastr.success('已重置为默认主题');
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-export-chat-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-export-chat-btn', async () => {
      await exportCurrentBindingToGroup('chat');
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-export-character-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#binding-group-export-character-btn', async () => {
      await exportCurrentBindingToGroup('character');
    });

  $(parentDoc)
    .off(`change${PANEL_EVENT_NAMESPACE}`, '#binding-group-persona-select')
    .on(`change${PANEL_EVENT_NAMESPACE}`, '#binding-group-persona-select', function () {
      const avatarId = (($(this).val() as string | undefined) || '').trim();
      const selectedGroup = getSelectedBindingGroup();
      const selectedTraitIds =
        selectedGroup?.resources.userPersonaAvatarId === avatarId
          ? selectedGroup.resources.userPersonaEnabledTraitIds || []
          : [];
      const selectedSharedTraitIds =
        selectedGroup?.resources.userPersonaAvatarId === avatarId
          ? selectedGroup.resources.userPersonaEnabledSharedTraitIds || []
          : [];
      $('#binding-group-persona-traits', parentDoc).html(
        buildBindingGroupPersonaTraitListHtml(avatarId, selectedTraitIds),
      );
      $('#binding-group-persona-shared-traits', parentDoc).html(
        buildBindingGroupSharedTraitListHtml(selectedSharedTraitIds),
      );
    });

  $('#edit-persona-name', parentDoc).on(`input${PANEL_EVENT_NAMESPACE}`, function () {
    $('#persona-name-input', parentDoc).val($(this).val() as string);
  });

  $('#edit-persona-desc', parentDoc).on(`input${PANEL_EVENT_NAMESPACE}`, function () {
    const avatarId = getEditingAvatarId();
    if (!avatarId) {
      return;
    }

    const baseDescription = ($(this).val() as string | undefined) || '';
    $('#edit-persona-base-desc', parentDoc).val(baseDescription);
    savePersonaBaseDescription(avatarId, baseDescription);

    if (baseDescDebounceTimer) {
      clearTimeout(baseDescDebounceTimer);
    }
    baseDescDebounceTimer = setTimeout(() => {
      void applyComposedDescriptionForAvatar(avatarId, '编辑基础描述后自动同步', {
        applyPlusBindings: false,
        errorToastTitle: '编辑基础描述后同步 user人设失败',
      });
    }, 450);
  });

  $('#persona-trait-add-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, async () => {
    const avatarId = getEditingAvatarId();
    if (!avatarId) {
      toastr.warning('请先在左侧选择一个 user 人设');
      return;
    }
    await addPersonaTrait(avatarId);
  });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-trait-scope-tab')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-trait-scope-tab', function () {
      const scope = (($(this).attr('data-trait-scope') as string | undefined) || 'local') as PersonaTraitScope;
      activePersonaTraitScope = scope === 'shared' ? 'shared' : 'local';
      const avatarId = getEditingAvatarId();
      if (avatarId) {
        renderPersonaTraits(avatarId);
        renderPersonaDefaultTraitSnapshotState(avatarId);
      }
    });

  $(parentDoc)
    .off(`change${PANEL_EVENT_NAMESPACE}`, '.trait-toggle-checkbox')
    .on(`change${PANEL_EVENT_NAMESPACE}`, '.trait-toggle-checkbox', async function () {
      const avatarId = getEditingAvatarId();
      const $item = $(this).closest('.persona-trait-item');
      const traitId = ($item.attr('data-id') || '').trim();
      const scope = (($item.attr('data-trait-scope') as string | undefined) || 'local') as PersonaTraitScope;
      const enabled = Boolean($(this).prop('checked'));
      if (!avatarId || !traitId) {
        return;
      }
      await togglePersonaTrait(avatarId, traitId, enabled, scope === 'shared' ? 'shared' : 'local');
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.trait-btn.edit')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.trait-btn.edit', async function () {
      const avatarId = getEditingAvatarId();
      const traitId = (($(this).attr('data-id') as string | undefined) || '').trim();
      const scope = (($(this).attr('data-trait-scope') as string | undefined) || 'local') as PersonaTraitScope;
      if (!avatarId || !traitId) {
        return;
      }
      await editPersonaTrait(avatarId, traitId, scope === 'shared' ? 'shared' : 'local');
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.trait-btn.delete')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.trait-btn.delete', async function () {
      const avatarId = getEditingAvatarId();
      const traitId = (($(this).attr('data-id') as string | undefined) || '').trim();
      const scope = (($(this).attr('data-trait-scope') as string | undefined) || 'local') as PersonaTraitScope;
      if (!avatarId || !traitId) {
        return;
      }
      if (confirm('确定要删除此设定吗？')) {
        await deletePersonaTrait(avatarId, traitId, scope === 'shared' ? 'shared' : 'local');
      }
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-folder-nav-item')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-folder-nav-item', function () {
      const avatarId = getEditingAvatarId();
      const folderId = (($(this).attr('data-folder-id') as string | undefined) || '').trim();
      const scope = (($(this).attr('data-trait-scope') as string | undefined) || 'local') as PersonaTraitScope;
      if (!avatarId || !folderId) {
        return;
      }
      setActivePersonaFolderId(avatarId, folderId, scope === 'shared' ? 'shared' : 'local');
      renderPersonaTraits(avatarId);
      togglePersonaFolderDrawer(false);
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-folder-nav-action')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-folder-nav-action', async function (event) {
      event.preventDefault();
      event.stopPropagation();
      const avatarId = getEditingAvatarId();
      const profileId = (($(this).attr('data-profile-id') as string | undefined) || '').trim();
      const action = ($(this).attr('data-action') || '').trim();
      const scope = (($(this).attr('data-trait-scope') as string | undefined) || 'local') as PersonaTraitScope;
      if (!avatarId || !profileId) {
        return;
      }

      if (action === 'edit') {
        if (scope === 'shared') {
          const folder = loadSharedPersonaTraitsConfig().folders.find(item => item.id === profileId);
          if (folder) {
            await upsertSharedFolder(avatarId, folder);
          }
        } else {
          const profile = loadPersonaAdvancedConfig(avatarId).profiles.find(item => item.id === profileId);
          if (profile) {
            await upsertProfile(avatarId, profile);
          }
        }
      } else if (action === 'delete') {
        if (scope === 'shared') {
          await deleteSharedFolder(avatarId, profileId);
        } else {
          await deleteActiveProfile(avatarId, profileId);
        }
      }
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '#persona-worldbook-entry-add-btn')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '#persona-worldbook-entry-add-btn', function () {
      const $container = $('#persona-worldbook-entry-groups', parentDoc);
      if (!$container.length) {
        return;
      }
      if ($container.find('.plus-binding-row').length === 0) {
        $container.empty();
      }
      appendWorldbookEntryBindingRow($container, getCachedPlusBindingCatalog());
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, '.persona-index-item.interactive')
    .on(`click${PANEL_EVENT_NAMESPACE}`, '.persona-index-item.interactive', function () {
      const action = (($(this).attr('data-action') as string | undefined) || '').trim();
      const value = (($(this).attr('data-value') as string | undefined) || '').trim();
      if (action === 'select-resource') {
        activeResourceSelection[activeDetailPage] = value;
        renderSidebarSecondaryList();
        renderToolbarSelectionSummary();
        renderResourceDetailPages();
        toggleBindingPlusDrawer(false);
      }
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, `#${PERSONA_PANEL_ID} .plus-row-delete-btn`)
    .on(`click${PANEL_EVENT_NAMESPACE}`, `#${PERSONA_PANEL_ID} .plus-row-delete-btn`, function () {
      $(this).closest('.plus-binding-row').remove();
    });

  $(parentDoc)
    .off(`click${PANEL_EVENT_NAMESPACE}`, `#${PERSONA_PANEL_ID} .plus-entry-refresh-btn`)
    .on(`click${PANEL_EVENT_NAMESPACE}`, `#${PERSONA_PANEL_ID} .plus-entry-refresh-btn`, function () {
      void hydrateWorldbookEntryBindingRow($(this).closest('.plus-binding-row'));
    });

  $(parentDoc)
    .off(`change${PANEL_EVENT_NAMESPACE}`, `#${PERSONA_PANEL_ID} .plus-entry-worldbook-select`)
    .on(`change${PANEL_EVENT_NAMESPACE}`, `#${PERSONA_PANEL_ID} .plus-entry-worldbook-select`, function () {
      void hydrateWorldbookEntryBindingRow($(this).closest('.plus-binding-row'));
    });

  $('#persona-rollback-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, async () => {
    const avatarId = getEditingAvatarId();
    if (!avatarId) {
      return;
    }
    await rollbackLastSnapshot(avatarId);
  });

  $('#persona-snapshot-list-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, () => {
    const avatarId = getEditingAvatarId();
    if (!avatarId) {
      return;
    }
    showSnapshotList(avatarId);
  });

  $('#persona-compat-refresh-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, () => {
    refreshCompatibilitySection();
    toastr.success('兼容性检测已刷新');
  });

  $('#persona-plus-refresh-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, () => {
    void refreshPlusBindingSection(true);
  });

  $('#persona-plus-api-test-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, () => {
    void refreshApiConfigSelfTestSection(true);
  });

  $('#persona-plus-test-btn', parentDoc).on(`click${PANEL_EVENT_NAMESPACE}`, () => {
    void triggerPlusEventSelfTest();
  });
}

// ==================== 初始化函数 ====================

export function initPanel(): void {
  const parentDoc = window.parent.document;

  lastSnapshotPruneSummary = pruneLegacyPersonaSnapshots();
  if (lastSnapshotPruneSummary.removedSnapshots > 0) {
    console.info(
      `绑定plus: 已自动清理旧快照 ${lastSnapshotPruneSummary.removedSnapshots} 份，释放约 ${formatStorageSize(lastSnapshotPruneSummary.freedBytes)}`,
    );
  }

  injectStyles(parentDoc);
  const $existingButton = $(`#${PERSONA_BUTTON_ID}`, parentDoc);

  if ($existingButton.length > 0 && !$existingButton.closest('#extensionsMenu').length) {
    $existingButton.remove();
  }

  if ($(`#${PERSONA_BUTTON_ID}`, parentDoc).length === 0) {
    const $extensionsMenu = $('#extensionsMenu', parentDoc);
    if ($extensionsMenu.length > 0) {
      const buttonHtml = `
        <div id="${PERSONA_BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" title="${PERSONA_BUTTON_TOOLTIP}" tabIndex="0">
          <i class="${PERSONA_BUTTON_ICON}"></i>
          <span>${PERSONA_BUTTON_TEXT_IN_MENU}</span>
        </div>
      `;
      $extensionsMenu.append(buttonHtml);
      console.log('用户设定脚本: 扩展栏按钮已创建');
    } else {
      console.warn('用户设定脚本: 找不到扩展菜单容器 (#extensionsMenu)');
    }
  }

  lastCompatibilityReport = runCompatibilitySelfCheck();
  if (!lastCompatibilityReport.ok) {
    toastr.warning('用户设定脚本兼容性自检未通过，可在面板中查看详情');
  }
}

async function handleContextChanged(source: string = 'context_watcher'): Promise<void> {
  const currentContext = getRuntimeContext();
  const signature = buildContextSignature(currentContext);
  if (signature === lastContextSignature) {
    return;
  }

  const previousContext = lastObservedContext || currentContext;
  lastContextSignature = signature;
  lastObservedContext = currentContext;
  syncActiveBindingScope();
  markPlusEventTriggered(
    'fallback_context_watcher',
    `source=${source} | ${previousContext.chatId || previousContext.chatName || '空'} -> ${currentContext.chatId || currentContext.chatName || '空'} / ${previousContext.characterId || previousContext.characterName || '空'} -> ${currentContext.characterId || currentContext.characterName || '空'}`,
  );
  await emitPlusContextEvents(previousContext, currentContext, source);

  renderRuntimeContextHeader();
  renderToolbarSelectionSummary();
  try {
    await applyPersonaPlusBindings(
      getCurrentPersonaFromDOM()?.avatarId || getEditingAvatarId() || '',
      currentContext,
      true,
    );
  } catch (error) {
    console.error('用户设定脚本: 聊天/角色切换后应用当前绑定失败', error);
  }

  const currentPersona = getCurrentPersonaFromDOM();
  if (!currentPersona?.avatarId) {
    renderPlusBindingSection();
    return;
  }

  await applyComposedDescriptionForAvatar(currentPersona.avatarId, '聊天或角色切换后触发自动规则');

  const editingAvatarId = getEditingAvatarId();
  if (editingAvatarId && editingAvatarId === currentPersona.avatarId) {
    renderPersonaTraits(editingAvatarId);
  }
  renderResourceDetailPages();
  renderPlusBindingSection();
}

function startContextWatcher(): void {
  if (contextWatcherTimer) {
    return;
  }

  const currentContext = getRuntimeContext();
  lastObservedContext = currentContext;
  lastContextSignature = buildContextSignature(currentContext);
  contextWatcherTimer = setInterval(() => {
    void handleContextChanged('context_watcher');
    syncLoadedPresetPromptDefaultSnapshot('context_watcher');
    syncPresetPromptControlsFromLoadedPreset();
  }, 1800);
}

export function bindEventListeners(): void {
  const parentDoc = window.parent.document;

  $(parentDoc)
    .off(`click.${PERSONA_BUTTON_ID}`)
    .on(`click.${PERSONA_BUTTON_ID}`, `#${PERSONA_BUTTON_ID}`, event => {
      event.preventDefault();
      togglePanel();
    });

  $(parentDoc)
    .off('click.bindingplus-official-preset-save', '#update_oai_preset')
    .on('click.bindingplus-official-preset-save', '#update_oai_preset', () => {
      markPendingOfficialPresetSave('host_button_click');
    });

  startPlusEventBridge();
  startContextWatcher();
}

export function injectStylesToIframe(): void {
  $('head').append(styles);
}
