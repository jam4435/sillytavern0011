/**
 * 用户设定脚本 - 事件处理和 Persona 操作
 */

import {
  BINDING_PLUS_THEME_STORAGE_KEY,
  BindingGroup,
  BindingPlusBackupFile,
  BindingPlusBackupImportSummary,
  BindingPlusPersonaBackup,
  BindingPlusThemePreset,
  BindingPlusThemePresetId,
  BindingPlusThemeState,
  BindingPlusThemeTokens,
  CompatibilityCheckItem,
  CompatibilityCheckReport,
  PERSONA_ADVANCED_STORAGE_PREFIX,
  PERSONA_BASE_DESC_STORAGE_PREFIX,
  PERSONA_BINDING_GROUPS_STORAGE_KEY,
  PERSONA_CONTEXT_BINDINGS_STORAGE_KEY,
  PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY,
  PERSONA_DEFAULT_WORLDBOOK_ENTRIES_STORAGE_KEY,
  PERSONA_PLUS_APPLIED_STORAGE_PREFIX,
  PERSONA_SNAPSHOT_STORAGE_PREFIX,
  PERSONA_TRAITS_STORAGE_PREFIX,
  PERSONA_TRAIT_SEPARATOR,
  PersonaActivationState,
  PersonaAdvancedConfig,
  PersonaAutoRule,
  PersonaContextBinding,
  PersonaContextBindingResources,
  PersonaInfo,
  PersonaPlusApiConfigTestItem,
  PersonaPlusApiConfigTestReport,
  PersonaPlusBindingConfig,
  PersonaPlusExtensionSettingBinding,
  PersonaPlusBindingWorldbookEntry,
  PersonaPlusInterfaceProbeItem,
  PersonaPlusProbeReport,
  PersonaProfile,
  PersonaRuntimeContext,
  PersonaSnapshot,
  PersonaTrait,
} from './types';

declare const toastr: any;
declare function triggerSlash(command: string): Promise<string>;

const PERSONA_ADVANCED_CONFIG_VERSION = 1;
const SNAPSHOT_MAX_COUNT = 3;
const SNAPSHOT_MIN_INTERVAL_MS = 4000;
const PERSONA_DEFAULT_PRESET_STORAGE_KEY = 'tavern_helper_default_preset_v1';
const BINDING_PLUS_BACKUP_APP = 'bindingplus';
const BINDING_PLUS_BACKUP_VERSION = 1;
const DEFAULT_BINDING_PLUS_THEME_PRESET_ID: BindingPlusThemePresetId = 'midnight_cyan';

const FOLLOW_SMART_THEME_TOKENS: BindingPlusThemeTokens = {
  panelBg: 'var(--SmartThemeBlurTintColor, rgba(26, 26, 46, 0.98))',
  panelBgSecondary: 'rgba(0, 0, 0, 0.22)',
  cardBg: 'rgba(9, 14, 24, 0.78)',
  cardBgStrong: 'rgba(6, 10, 18, 0.9)',
  textPrimary: 'var(--SmartThemeBodyColor, #e0e0e0)',
  textSecondary: 'rgba(226, 232, 240, 0.72)',
  accent: 'var(--SmartThemeEmColor, #7a7aff)',
  accentHover: 'rgba(125, 211, 252, 0.18)',
  border: 'var(--SmartThemeBorderColor, #4a4a6a)',
  inputBg: 'rgba(7, 12, 22, 0.92)',
  inputBorder: 'rgba(80, 110, 160, 0.24)',
  buttonBg: 'rgba(8, 13, 24, 0.96)',
  buttonBorder: 'rgba(80, 110, 160, 0.24)',
  buttonText: 'var(--SmartThemeBodyColor, #e0e0e0)',
  buttonHoverBg: 'rgba(25, 42, 70, 0.92)',
  buttonHoverBorder: 'rgba(125, 211, 252, 0.32)',
  selectedBg: 'rgba(125, 211, 252, 0.12)',
  selectedBorder: 'rgba(125, 211, 252, 0.42)',
  hoverBg: 'rgba(255, 255, 255, 0.06)',
  success: '#86efac',
  warning: '#fbbf24',
  danger: '#fca5a5',
  overlayBg: 'rgba(0, 0, 0, 0.7)',
  codeBg: 'rgba(3, 7, 18, 0.45)',
  codeBorder: 'rgba(148, 163, 184, 0.14)',
};

const BINDING_PLUS_THEME_PRESETS: BindingPlusThemePreset[] = [
  {
    id: 'follow_smart_theme',
    label: '跟随酒馆',
    tone: 'system',
    description: '沿用酒馆当前主题变量。',
    tokens: FOLLOW_SMART_THEME_TOKENS,
  },
  {
    id: 'midnight_cyan',
    label: '午夜青辉',
    tone: 'dark',
    description: '冷色深夜面板，适合默认使用。',
    tokens: {
      panelBg: '#0f172a',
      panelBgSecondary: '#131f34',
      cardBg: '#162338',
      cardBgStrong: '#0c1524',
      textPrimary: '#e6eef8',
      textSecondary: '#9db0c8',
      accent: '#5cc8ff',
      accentHover: '#8edcff',
      border: '#29405d',
      inputBg: '#0d1828',
      inputBorder: '#345274',
      buttonBg: '#132238',
      buttonBorder: '#36567a',
      buttonText: '#edf5ff',
      buttonHoverBg: '#18304e',
      buttonHoverBorder: '#5cc8ff',
      selectedBg: '#17324f',
      selectedBorder: '#66d0ff',
      hoverBg: '#17263b',
      success: '#7bd88f',
      warning: '#f4c96b',
      danger: '#ff8f8f',
      overlayBg: 'rgba(3, 8, 16, 0.76)',
      codeBg: '#0a1422',
      codeBorder: '#2b425f',
    },
  },
  {
    id: 'ember_glow',
    label: '余烬铜焰',
    tone: 'dark',
    description: '暖色金铜调，强调感更强。',
    tokens: {
      panelBg: '#19120f',
      panelBgSecondary: '#231914',
      cardBg: '#2a1f18',
      cardBgStrong: '#130d0a',
      textPrimary: '#f7eee7',
      textSecondary: '#c7ae9e',
      accent: '#f59e66',
      accentHover: '#ffbe8d',
      border: '#5b4032',
      inputBg: '#170f0c',
      inputBorder: '#6d4a37',
      buttonBg: '#241712',
      buttonBorder: '#7a533e',
      buttonText: '#fff6f0',
      buttonHoverBg: '#352118',
      buttonHoverBorder: '#f59e66',
      selectedBg: '#3a2419',
      selectedBorder: '#ffb27b',
      hoverBg: '#2c1c15',
      success: '#86d39d',
      warning: '#f6c46b',
      danger: '#ff9d8f',
      overlayBg: 'rgba(10, 5, 3, 0.76)',
      codeBg: '#120c09',
      codeBorder: '#694833',
    },
  },
  {
    id: 'graphite_mist',
    label: '石墨雾面',
    tone: 'dark',
    description: '低饱和灰蓝，适合长时间阅读。',
    tokens: {
      panelBg: '#15181d',
      panelBgSecondary: '#1d232a',
      cardBg: '#202833',
      cardBgStrong: '#12161b',
      textPrimary: '#eef2f7',
      textSecondary: '#a1adbc',
      accent: '#87a8d8',
      accentHover: '#a8c3ea',
      border: '#394556',
      inputBg: '#11161d',
      inputBorder: '#435162',
      buttonBg: '#1b232d',
      buttonBorder: '#48576a',
      buttonText: '#edf3fb',
      buttonHoverBg: '#25303d',
      buttonHoverBorder: '#87a8d8',
      selectedBg: '#2a3341',
      selectedBorder: '#9ab6de',
      hoverBg: '#242c37',
      success: '#97d3aa',
      warning: '#e8c277',
      danger: '#f0a0a0',
      overlayBg: 'rgba(8, 10, 13, 0.74)',
      codeBg: '#10141a',
      codeBorder: '#3c4859',
    },
  },
  {
    id: 'neon_night',
    label: '霓虹夜航',
    tone: 'dark',
    description: '高对比深色，强调色更亮。',
    tokens: {
      panelBg: '#0a1020',
      panelBgSecondary: '#0f1830',
      cardBg: '#121f3d',
      cardBgStrong: '#070c16',
      textPrimary: '#eef6ff',
      textSecondary: '#96acd6',
      accent: '#4ff0ff',
      accentHover: '#8df8ff',
      border: '#274b78',
      inputBg: '#091224',
      inputBorder: '#2d5e95',
      buttonBg: '#10203d',
      buttonBorder: '#3576b6',
      buttonText: '#f4fbff',
      buttonHoverBg: '#17315a',
      buttonHoverBorder: '#4ff0ff',
      selectedBg: '#123968',
      selectedBorder: '#73f4ff',
      hoverBg: '#122543',
      success: '#74f0b2',
      warning: '#ffd36f',
      danger: '#ff8aa8',
      overlayBg: 'rgba(2, 6, 14, 0.8)',
      codeBg: '#08111f',
      codeBorder: '#2d5a88',
    },
  },
  {
    id: 'frost_paper',
    label: '霜蓝纸页',
    tone: 'light',
    description: '清冷浅色，层次偏蓝。',
    tokens: {
      panelBg: '#edf4fb',
      panelBgSecondary: '#dfeaf5',
      cardBg: '#f8fbff',
      cardBgStrong: '#d8e7f5',
      textPrimary: '#18263a',
      textSecondary: '#5a6d84',
      accent: '#2f7fd6',
      accentHover: '#5498e8',
      border: '#b7c9db',
      inputBg: '#ffffff',
      inputBorder: '#9fb7d0',
      buttonBg: '#eef4fb',
      buttonBorder: '#97b1cc',
      buttonText: '#1b2e47',
      buttonHoverBg: '#deebf8',
      buttonHoverBorder: '#2f7fd6',
      selectedBg: '#d7e9fa',
      selectedBorder: '#3f88dd',
      hoverBg: '#ebf3fb',
      success: '#2f8f5a',
      warning: '#c98916',
      danger: '#d35b6c',
      overlayBg: 'rgba(14, 23, 38, 0.36)',
      codeBg: '#f4f9ff',
      codeBorder: '#c0d3e6',
    },
  },
  {
    id: 'warm_canvas',
    label: '暖沙画布',
    tone: 'light',
    description: '暖调浅色，适合文字密集场景。',
    tokens: {
      panelBg: '#f6efe6',
      panelBgSecondary: '#ede2d3',
      cardBg: '#fffaf3',
      cardBgStrong: '#e8d8c3',
      textPrimary: '#3a2617',
      textSecondary: '#7b624f',
      accent: '#b46a2a',
      accentHover: '#cb864b',
      border: '#d4bca7',
      inputBg: '#fffdf9',
      inputBorder: '#c9ab92',
      buttonBg: '#f6ecdf',
      buttonBorder: '#c39b7d',
      buttonText: '#432b1c',
      buttonHoverBg: '#efdfcc',
      buttonHoverBorder: '#b46a2a',
      selectedBg: '#f0dcc3',
      selectedBorder: '#bf7636',
      hoverBg: '#f7ecdf',
      success: '#3e8d64',
      warning: '#c57d12',
      danger: '#c95f63',
      overlayBg: 'rgba(35, 20, 10, 0.28)',
      codeBg: '#fff9f0',
      codeBorder: '#d8c1a7',
    },
  },
  {
    id: 'rice_sheet',
    label: '米纸墨痕',
    tone: 'light',
    description: '纸张感更强，低刺激浅色。',
    tokens: {
      panelBg: '#f7f2e8',
      panelBgSecondary: '#efe7d8',
      cardBg: '#fffdf8',
      cardBgStrong: '#e7ddce',
      textPrimary: '#2a2b2d',
      textSecondary: '#69645b',
      accent: '#5f7f6f',
      accentHover: '#769886',
      border: '#d1c7b7',
      inputBg: '#fffdfa',
      inputBorder: '#c4b8a6',
      buttonBg: '#f2ebdf',
      buttonBorder: '#bfb29f',
      buttonText: '#313233',
      buttonHoverBg: '#e8ded1',
      buttonHoverBorder: '#5f7f6f',
      selectedBg: '#e4dccf',
      selectedBorder: '#6b8d79',
      hoverBg: '#f0e7da',
      success: '#4d8e5e',
      warning: '#b88a2e',
      danger: '#bf6666',
      overlayBg: 'rgba(24, 20, 15, 0.24)',
      codeBg: '#fbf7ef',
      codeBorder: '#d3c8b5',
    },
  },
  {
    id: 'contrast_day',
    label: '高对比白昼',
    tone: 'light',
    description: '亮背景下保留更强边界和强调色。',
    tokens: {
      panelBg: '#f8fbff',
      panelBgSecondary: '#e6eef9',
      cardBg: '#ffffff',
      cardBgStrong: '#dbe8f7',
      textPrimary: '#101317',
      textSecondary: '#4d5a6b',
      accent: '#005fd1',
      accentHover: '#2680eb',
      border: '#9bb0c9',
      inputBg: '#ffffff',
      inputBorder: '#829ab6',
      buttonBg: '#e9f0fb',
      buttonBorder: '#7d97b7',
      buttonText: '#0f1d31',
      buttonHoverBg: '#d8e7fb',
      buttonHoverBorder: '#005fd1',
      selectedBg: '#d2e5ff',
      selectedBorder: '#0a6adf',
      hoverBg: '#edf4ff',
      success: '#1f8a53',
      warning: '#af7200',
      danger: '#c54a5d',
      overlayBg: 'rgba(12, 18, 28, 0.34)',
      codeBg: '#f4f8fd',
      codeBorder: '#b3c6df',
    },
  },
];

type PersonaPlusAppliedState = {
  userPersonaAvatarId?: string;
  userPersonaProfileId?: string;
  userPersonaEnabledTraitIds?: string[];
  connectionProfileName?: string;
  connectionProfileBaseline?: string | null;
  presetName?: string;
  presetEnabledPromptIds?: string[];
  scripts: {
    global: string[];
    preset: string[];
    character: string[];
  };
  regexes: {
    global: string[];
    preset: string[];
    character: string[];
  };
  worldbooks: {
    global: string[];
    characterPrimary?: string;
    characterAdditional: string[];
    chat?: string;
  };
  worldbookEntries: PersonaPlusBindingWorldbookEntry[];
  extensions: PersonaPlusExtensionSettingBinding[];
  personaTraitBaselines: Record<string, string[]>;
  presetPromptBaselines: Record<string, string[]>;
  worldbookEntryBaselines: Record<string, number[]>;
};

function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getBindingPlusThemePresetById(presetId: string): BindingPlusThemePreset {
  return (
    BINDING_PLUS_THEME_PRESETS.find(preset => preset.id === presetId) ||
    BINDING_PLUS_THEME_PRESETS.find(preset => preset.id === DEFAULT_BINDING_PLUS_THEME_PRESET_ID) ||
    BINDING_PLUS_THEME_PRESETS[0]
  );
}

function normalizeBindingPlusThemeCustomTokens(value: unknown): Partial<BindingPlusThemeTokens> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const next: Partial<BindingPlusThemeTokens> = {};
  (
    [
      'panelBg',
      'panelBgSecondary',
      'cardBg',
      'cardBgStrong',
      'textPrimary',
      'textSecondary',
      'accent',
      'accentHover',
      'border',
      'inputBg',
      'inputBorder',
      'buttonBg',
      'buttonBorder',
      'buttonText',
      'buttonHoverBg',
      'buttonHoverBorder',
      'selectedBg',
      'selectedBorder',
      'hoverBg',
      'success',
      'warning',
      'danger',
      'overlayBg',
      'codeBg',
      'codeBorder',
    ] as Array<keyof BindingPlusThemeTokens>
  ).forEach(key => {
    const normalized = ensureStringLike(source[key]).trim();
    if (normalized) {
      next[key] = normalized;
    }
  });
  return next;
}

function normalizeBindingPlusThemeState(value: unknown): BindingPlusThemeState {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const presetId = ensureString(source.presetId).trim() as BindingPlusThemePresetId;
  return {
    presetId: (getBindingPlusThemePresetById(presetId).id ||
      DEFAULT_BINDING_PLUS_THEME_PRESET_ID) as BindingPlusThemePresetId,
    customTokens: normalizeBindingPlusThemeCustomTokens(source.customTokens),
    useCustomOverrides: Boolean(source.useCustomOverrides),
  };
}

export function getBindingPlusThemePresets(): BindingPlusThemePreset[] {
  return deepClone(BINDING_PLUS_THEME_PRESETS);
}

export function getDefaultBindingPlusThemeState(): BindingPlusThemeState {
  return {
    presetId: DEFAULT_BINDING_PLUS_THEME_PRESET_ID,
    customTokens: {},
    useCustomOverrides: false,
  };
}

export function loadBindingPlusTheme(): BindingPlusThemeState {
  try {
    const raw = localStorage.getItem(BINDING_PLUS_THEME_STORAGE_KEY);
    if (!raw) {
      return getDefaultBindingPlusThemeState();
    }
    return normalizeBindingPlusThemeState(JSON.parse(raw));
  } catch (error) {
    console.warn('鐢ㄦ埛璁惧畾鑴氭湰: 璇诲彇 BindingPlus 涓婚澶辫触', error);
    return getDefaultBindingPlusThemeState();
  }
}

export function saveBindingPlusTheme(state: BindingPlusThemeState): boolean {
  try {
    const safeState = normalizeBindingPlusThemeState(state);
    localStorage.setItem(BINDING_PLUS_THEME_STORAGE_KEY, JSON.stringify(safeState));
    return true;
  } catch (error) {
    console.error('鐢ㄦ埛璁惧畾鑴氭湰: 淇濆瓨 BindingPlus 涓婚澶辫触', error);
    return false;
  }
}

export function resetBindingPlusTheme(): boolean {
  return saveBindingPlusTheme(getDefaultBindingPlusThemeState());
}

export function resolveBindingPlusThemeTokens(
  state: BindingPlusThemeState = loadBindingPlusTheme(),
): BindingPlusThemeTokens {
  const safeState = normalizeBindingPlusThemeState(state);
  const preset = getBindingPlusThemePresetById(safeState.presetId);
  const useCustomOverrides = safeState.useCustomOverrides && safeState.presetId !== 'follow_smart_theme';
  return useCustomOverrides
    ? {
        ...preset.tokens,
        ...safeState.customTokens,
      }
    : deepClone(preset.tokens);
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getParentDoc(): Document {
  return window.parent.document;
}

function ensureString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function ensureStringLike(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function uniqueStrings(values: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of safeArray<unknown>(values)) {
    const normalized = ensureString(value).trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function hasOwn(source: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeOptionalStringArrayField(source: object, key: string): string[] | undefined {
  return hasOwn(source, key) ? uniqueStrings((source as Record<string, unknown>)[key]) : undefined;
}

function clonePersonaTraitBaselines(baselines: Record<string, string[]> | undefined): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  if (!baselines || typeof baselines !== 'object') {
    return next;
  }

  Object.entries(baselines).forEach(([avatarId, traitIds]) => {
    const normalizedAvatarId = ensureString(avatarId).trim();
    if (!normalizedAvatarId) {
      return;
    }
    next[normalizedAvatarId] = uniqueStrings(traitIds);
  });
  return next;
}

function cloneStringArrayRecord(source: Record<string, string[]> | undefined): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  if (!source || typeof source !== 'object') {
    return next;
  }

  Object.entries(source).forEach(([key, values]) => {
    const normalizedKey = ensureString(key).trim();
    if (!normalizedKey) {
      return;
    }
    next[normalizedKey] = uniqueStrings(values);
  });
  return next;
}

function cloneNumberArrayRecord(source: Record<string, number[]> | undefined): Record<string, number[]> {
  const next: Record<string, number[]> = {};
  if (!source || typeof source !== 'object') {
    return next;
  }

  Object.entries(source).forEach(([key, values]) => {
    const normalizedKey = ensureString(key).trim();
    if (!normalizedKey) {
      return;
    }
    next[normalizedKey] = uniqueNumbers(values);
  });
  return next;
}

export type BindingPlusStorageReportItem = {
  key: string;
  label: string;
  category: string;
  bytes: number;
};

export type BindingPlusStorageCategoryReport = {
  category: string;
  keyCount: number;
  bytes: number;
};

export type BindingPlusStorageReport = {
  totalBytes: number;
  keyCount: number;
  topItems: BindingPlusStorageReportItem[];
  categories: BindingPlusStorageCategoryReport[];
};

export type PersonaSnapshotPruneSummary = {
  scannedKeys: number;
  prunedKeys: number;
  removedSnapshots: number;
  freedBytes: number;
};

function limitPersonaSnapshots<T>(snapshots: T[]): T[] {
  return snapshots.length > SNAPSHOT_MAX_COUNT ? snapshots.slice(-SNAPSHOT_MAX_COUNT) : snapshots;
}

function estimateLocalStorageBytes(key: string, value: string): number {
  return (key.length + value.length) * 2;
}

function isBindingPlusStorageKey(key: string): boolean {
  return (
    key.startsWith('tavern_helper_persona_') ||
    key === PERSONA_CONTEXT_BINDINGS_STORAGE_KEY ||
    key === PERSONA_BINDING_GROUPS_STORAGE_KEY ||
    key === PERSONA_DEFAULT_PRESET_STORAGE_KEY ||
    key === PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY ||
    key === PERSONA_DEFAULT_WORLDBOOK_ENTRIES_STORAGE_KEY ||
    key === BINDING_PLUS_THEME_STORAGE_KEY
  );
}

function getBindingPlusStorageKeyInfo(key: string): { label: string; category: string } {
  if (key.startsWith(PERSONA_SNAPSHOT_STORAGE_PREFIX)) {
    return {
      label: `变更保护快照 · ${key.slice(PERSONA_SNAPSHOT_STORAGE_PREFIX.length) || 'unknown'}`,
      category: '变更保护快照',
    };
  }
  if (key.startsWith(PERSONA_BASE_DESC_STORAGE_PREFIX)) {
    return {
      label: `基础描述 · ${key.slice(PERSONA_BASE_DESC_STORAGE_PREFIX.length) || 'unknown'}`,
      category: '基础描述',
    };
  }
  if (key.startsWith(PERSONA_TRAITS_STORAGE_PREFIX)) {
    return {
      label: `条目列表 · ${key.slice(PERSONA_TRAITS_STORAGE_PREFIX.length) || 'unknown'}`,
      category: '条目列表',
    };
  }
  if (key.startsWith(PERSONA_ADVANCED_STORAGE_PREFIX)) {
    return {
      label: `高级配置 · ${key.slice(PERSONA_ADVANCED_STORAGE_PREFIX.length) || 'unknown'}`,
      category: '高级配置',
    };
  }
  if (key.startsWith(PERSONA_PLUS_APPLIED_STORAGE_PREFIX)) {
    return {
      label: `已应用状态 · ${key.slice(PERSONA_PLUS_APPLIED_STORAGE_PREFIX.length) || 'global'}`,
      category: '已应用状态',
    };
  }
  if (key === PERSONA_CONTEXT_BINDINGS_STORAGE_KEY) {
    return { label: '聊天/角色绑定', category: '聊天/角色绑定' };
  }
  if (key === PERSONA_BINDING_GROUPS_STORAGE_KEY) {
    return { label: '绑定组', category: '绑定组' };
  }
  if (key === PERSONA_DEFAULT_PRESET_STORAGE_KEY) {
    return { label: '默认预设', category: '默认预设' };
  }
  if (key === PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY) {
    return { label: '默认预设条目', category: '默认预设条目' };
  }
  if (key === PERSONA_DEFAULT_WORLDBOOK_ENTRIES_STORAGE_KEY) {
    return { label: '默认世界书条目', category: '默认世界书条目' };
  }
  if (key === BINDING_PLUS_THEME_STORAGE_KEY) {
    return { label: '主题配置', category: '主题配置' };
  }
  return { label: key, category: 'user 人设其他数据' };
}

export function getBindingPlusStorageReport(topItemCount: number = 8): BindingPlusStorageReport {
  const items: BindingPlusStorageReportItem[] = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !isBindingPlusStorageKey(key)) {
        continue;
      }

      const value = localStorage.getItem(key);
      if (value === null) {
        continue;
      }

      const info = getBindingPlusStorageKeyInfo(key);
      items.push({
        key,
        ...info,
        bytes: estimateLocalStorageBytes(key, value),
      });
    }
  } catch (error) {
    console.warn('绑定plus: 统计本地存储占用失败', error);
  }

  items.sort((a, b) => b.bytes - a.bytes);
  const categoryMap = new Map<string, BindingPlusStorageCategoryReport>();
  items.forEach(item => {
    const current = categoryMap.get(item.category) || {
      category: item.category,
      keyCount: 0,
      bytes: 0,
    };
    current.keyCount += 1;
    current.bytes += item.bytes;
    categoryMap.set(item.category, current);
  });

  return {
    totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
    keyCount: items.length,
    topItems: items.slice(0, Math.max(0, topItemCount)),
    categories: Array.from(categoryMap.values()).sort((a, b) => b.bytes - a.bytes),
  };
}

export function pruneLegacyPersonaSnapshots(): PersonaSnapshotPruneSummary {
  const summary: PersonaSnapshotPruneSummary = {
    scannedKeys: 0,
    prunedKeys: 0,
    removedSnapshots: 0,
    freedBytes: 0,
  };

  const snapshotKeys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PERSONA_SNAPSHOT_STORAGE_PREFIX)) {
        snapshotKeys.push(key);
      }
    }
  } catch (error) {
    console.warn('绑定plus: 扫描旧快照失败', error);
    return summary;
  }

  for (const key of snapshotKeys) {
    summary.scannedKeys += 1;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }

      const snapshots = safeArray<PersonaSnapshot>(JSON.parse(raw));
      if (snapshots.length <= SNAPSHOT_MAX_COUNT) {
        continue;
      }

      const limited = limitPersonaSnapshots(snapshots);
      const nextRaw = JSON.stringify(limited);
      localStorage.setItem(key, nextRaw);
      summary.prunedKeys += 1;
      summary.removedSnapshots += snapshots.length - limited.length;
      summary.freedBytes += Math.max(0, estimateLocalStorageBytes(key, raw) - estimateLocalStorageBytes(key, nextRaw));
    } catch (error) {
      console.warn(`绑定plus: 清理旧快照失败 (${key})`, error);
    }
  }

  return summary;
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

function getEnabledTraitIdsFromTraits(traits: PersonaTrait[]): string[] {
  return traits.filter(trait => trait.enabled).map(trait => trait.id);
}

export function getPresetPromptStableId(prompt: PresetPrompt): string {
  const id = ensureString(prompt.id).trim();
  if (id) {
    return `id:${id}`;
  }

  const role = ensureString(prompt.role).trim() || 'unknown';
  const positionType = ensureString(prompt.position?.type).trim() || 'relative';
  const positionDepth =
    prompt.position?.type === 'in_chat' ? `${prompt.position.depth ?? ''}/${prompt.position.order ?? ''}` : '';
  const name = ensureString(prompt.name).trim();
  const content = ensureString(prompt.content).trim().slice(0, 120);
  return `sig:${name}::${role}::${positionType}::${positionDepth}::${content}`;
}

function getEnabledPresetPromptIdsFromPreset(preset: Preset): string[] {
  return safeArray<PresetPrompt>(preset.prompts)
    .filter(prompt => prompt.enabled)
    .map(prompt => getPresetPromptStableId(prompt));
}

export function getEnabledPresetPromptIds(presetName: string): string[] {
  const normalizedName = ensureString(presetName).trim();
  if (!normalizedName) {
    return [];
  }

  const readablePresetName = getReadablePresetName(normalizedName);
  if (!readablePresetName) {
    return [];
  }

  try {
    return getEnabledPresetPromptIdsFromPreset(getPreset(readablePresetName));
  } catch (error) {
    console.warn('绑定plus: 读取预设启用 prompt 失败', { presetName: normalizedName, error });
    return [];
  }
}

export function isPresetNameAvailable(presetName: string): boolean {
  const normalizedName = ensureString(presetName).trim();
  if (!normalizedName) {
    return false;
  }
  if (normalizedName === 'in_use') {
    return true;
  }

  try {
    return getPresetNames().includes(normalizedName);
  } catch (error) {
    console.warn('绑定plus: 读取预设列表失败', error);
    return false;
  }
}

function getReadablePresetName(presetName: string): string | undefined {
  const normalizedName = ensureString(presetName).trim();
  if (!normalizedName) {
    return undefined;
  }
  if (isPresetNameAvailable(normalizedName)) {
    return normalizedName;
  }

  const loadedPresetName = ensureString(getLoadedPresetName()).trim();
  return loadedPresetName && loadedPresetName === normalizedName ? 'in_use' : undefined;
}

export async function ensurePresetExistsForBinding(
  presetName: string,
): Promise<{ ok: boolean; created: boolean; presetName: string; reason?: string }> {
  const normalizedName = ensureString(presetName).trim();
  if (!normalizedName) {
    return { ok: false, created: false, presetName: '', reason: '请先选择一个预设' };
  }
  if (normalizedName === 'in_use') {
    return { ok: false, created: false, presetName: normalizedName, reason: 'in_use 不能直接作为绑定预设名' };
  }
  if (isPresetNameAvailable(normalizedName)) {
    return { ok: true, created: false, presetName: normalizedName };
  }

  const loadedPresetName = ensureString(getLoadedPresetName()).trim();
  if (loadedPresetName !== normalizedName) {
    return {
      ok: false,
      created: false,
      presetName: normalizedName,
      reason: `预设「${normalizedName}」不存在，请先在酒馆中保存该预设或重新选择已有预设`,
    };
  }

  try {
    await createOrReplacePreset(normalizedName, getPreset('in_use'), { render: 'immediate' });
    return { ok: true, created: true, presetName: normalizedName };
  } catch (error) {
    return {
      ok: false,
      created: false,
      presetName: normalizedName,
      reason: `保存当前 in_use 为预设「${normalizedName}」失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function getWorldbookEnabledEntryUids(entries: Array<{ uid: number; enabled: boolean }>): number[] {
  return uniqueNumbers(entries.filter(entry => entry.enabled).map(entry => entry.uid));
}

function getBindingWorldbookEnabledEntryUids(
  entries: PersonaPlusBindingWorldbookEntry[] | undefined,
  worldbookName: string,
): number[] | undefined {
  const normalizedName = ensureString(worldbookName).trim();
  if (!normalizedName) {
    return undefined;
  }

  const matchedEntries = normalizePlusBindingWorldbookEntries(entries).filter(
    entry => entry.worldbookName === normalizedName,
  );
  if (matchedEntries.length === 0) {
    return undefined;
  }

  return uniqueNumbers(matchedEntries.filter(entry => entry.enabled !== false).flatMap(entry => entry.entryUids));
}

function hasWorldbookEntrySnapshot(
  entries: PersonaPlusBindingWorldbookEntry[] | undefined,
  worldbookName: string,
): boolean {
  const normalizedName = ensureString(worldbookName).trim();
  if (!normalizedName) {
    return false;
  }
  return normalizePlusBindingWorldbookEntries(entries).some(entry => entry.worldbookName === normalizedName);
}

function uniqueNumbers(values: unknown): number[] {
  const result: number[] = [];
  const seen = new Set<number>();

  for (const value of safeArray<unknown>(values)) {
    const normalized = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeDescription(description: string): string {
  return description.replace(/\r\n/g, '\n').trim();
}

// ==================== Persona 数据获取函数 ====================

function getPersonaListFromVisibleDOM(): PersonaInfo[] {
  const parentDoc = getParentDoc();
  const personas: PersonaInfo[] = [];
  const $avatarBlock = $('#user_avatar_block', parentDoc);

  if ($avatarBlock.length === 0) {
    console.warn('用户设定脚本: 找不到 #user_avatar_block 容器');
    return personas;
  }

  $avatarBlock.find('.avatar-container').each(function () {
    const $container = $(this);
    const avatarId = $container.attr('data-avatar-id') || '';
    const name = $container.find('.ch_name').text().trim();

    const $descriptionElement = $container.find('.ch_description');
    let description = $descriptionElement.text().trim();
    description = description.replace(/ +/g, ' ').trim();

    const isDefault = $container.hasClass('default_persona');
    const isSelected = $container.hasClass('selected');
    const $lockedToChatBtn = $container.find('.locked_to_chat_label');
    const $lockedToCharBtn = $container.find('.locked_to_character_label');
    const isLockedToChat = $lockedToChatBtn.length > 0 && !$lockedToChatBtn.hasClass('disabled');
    const isLockedToCharacter = $lockedToCharBtn.length > 0 && !$lockedToCharBtn.hasClass('disabled');

    personas.push({
      name,
      description: description || undefined,
      avatarId,
      isDefault,
      isSelected,
      isLockedToChat,
      isLockedToCharacter,
    });
  });

  return personas;
}

function getCurrentPersonaAvatarIdSafe(): string {
  try {
    return typeof getCurrentPersonaId === 'function' ? ensureString(getCurrentPersonaId()).trim() : '';
  } catch (error) {
    console.warn('用户设定脚本: 读取当前 Persona avatarId 失败', error);
    return '';
  }
}

function getPersonaListFromHelperApi(): PersonaInfo[] {
  if (typeof getPersonaIds !== 'function' || typeof getPersona !== 'function') {
    return [];
  }

  const currentAvatarId = getCurrentPersonaAvatarIdSafe();
  return safeArray<string>(getPersonaIds())
    .map(avatarId => ensureString(avatarId).trim())
    .filter(Boolean)
    .map(avatarId => {
      try {
        const persona = getPersona(avatarId);
        const resolvedAvatarId = ensureString(persona.avatar_id).trim() || avatarId;
        return {
          name: ensureString(persona.name || persona.title).trim() || resolvedAvatarId,
          description: normalizeDescription(ensureString(persona.description)),
          avatarId: resolvedAvatarId,
          isDefault: Boolean(persona.is_default),
          isSelected: currentAvatarId === resolvedAvatarId,
        };
      } catch (error) {
        console.warn('用户设定脚本: 读取 Persona 数据失败', { avatarId, error });
        return {
          name: avatarId,
          avatarId,
          isSelected: currentAvatarId === avatarId,
        };
      }
    });
}

/**
 * 获取所有已存在的 Persona 列表.
 *
 * 优先使用酒馆助手 Persona API 读取全量列表; 当前页 DOM 只作为锁定/选中状态的补充。
 * 这样分页外的人设也能被绑定plus看见和切换。
 */
export function getPersonaListFromDOM(): PersonaInfo[] {
  const domPersonas = getPersonaListFromVisibleDOM();
  const apiPersonas = getPersonaListFromHelperApi();
  if (apiPersonas.length === 0) {
    return domPersonas;
  }

  const domByAvatarId = new Map(
    domPersonas.filter(persona => Boolean(persona.avatarId)).map(persona => [persona.avatarId as string, persona]),
  );
  const merged = apiPersonas.map(persona => {
    const domPersona = persona.avatarId ? domByAvatarId.get(persona.avatarId) : undefined;
    return {
      ...persona,
      description: persona.description || domPersona?.description,
      isDefault: Boolean(persona.isDefault || domPersona?.isDefault),
      isSelected: Boolean(persona.isSelected || domPersona?.isSelected),
      isLockedToChat: Boolean(domPersona?.isLockedToChat),
      isLockedToCharacter: Boolean(domPersona?.isLockedToCharacter),
    };
  });

  const apiAvatarIds = new Set(merged.map(persona => persona.avatarId).filter(Boolean));
  domPersonas.forEach(persona => {
    if (persona.avatarId && !apiAvatarIds.has(persona.avatarId)) {
      merged.push(persona);
    }
  });

  return merged;
}

/**
 * 获取当前选中的 Persona
 */
export function getCurrentPersonaFromDOM(): PersonaInfo | null {
  const personas = getPersonaListFromDOM();
  return personas.find(p => p.isSelected) || null;
}

/**
 * 根据 avatarId 查找 Persona
 */
export function findPersonaByAvatarId(avatarId: string): PersonaInfo | null {
  const personas = getPersonaListFromDOM();
  return personas.find(p => p.avatarId === avatarId) || null;
}

/**
 * 根据名称查找 Persona
 * @deprecated 建议使用 findPersonaByAvatarId
 */
export function findPersonaByName(name: string): PersonaInfo | null {
  const personas = getPersonaListFromDOM();
  return personas.find(p => p.name === name) || null;
}

/**
 * 获取默认用户人设
 */
export function getDefaultPersona(): PersonaInfo | null {
  const personas = getPersonaListFromDOM();
  return personas.find(p => p.isDefault) || null;
}

export function getDefaultPresetName(): string {
  try {
    return ensureString(localStorage.getItem(PERSONA_DEFAULT_PRESET_STORAGE_KEY)).trim();
  } catch (error) {
    console.warn('用户设定脚本: 读取默认预设失败', error);
    return '';
  }
}

export function setDefaultPresetName(name?: string): boolean {
  const normalized = ensureString(name).trim();
  try {
    if (normalized) {
      localStorage.setItem(PERSONA_DEFAULT_PRESET_STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(PERSONA_DEFAULT_PRESET_STORAGE_KEY);
    }
    return true;
  } catch (error) {
    console.error('用户设定脚本: 保存默认预设失败', error);
    return false;
  }
}

// ==================== UI 辅助函数 ====================

/**
 * 获取输入框中的 Persona 名称
 */
function loadStringArraySnapshotMap(storageKey: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, string[]> = {};
    Object.entries(parsed || {}).forEach(([key, value]) => {
      const normalizedKey = ensureString(key).trim();
      if (!normalizedKey) {
        return;
      }
      next[normalizedKey] = uniqueStrings(value);
    });
    return next;
  } catch (error) {
    console.warn('绑定plus: 读取字符串快照映射失败', error);
    return {};
  }
}

function saveStringArraySnapshotMap(storageKey: string, value: Record<string, string[]>): boolean {
  try {
    const safeValue = cloneStringArrayRecord(value);
    if (Object.keys(safeValue).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(safeValue));
    } else {
      localStorage.removeItem(storageKey);
    }
    return true;
  } catch (error) {
    console.error('绑定plus: 保存字符串快照映射失败', error);
    return false;
  }
}

function loadNumberArraySnapshotMap(storageKey: string): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, number[]> = {};
    Object.entries(parsed || {}).forEach(([key, value]) => {
      const normalizedKey = ensureString(key).trim();
      if (!normalizedKey) {
        return;
      }
      next[normalizedKey] = uniqueNumbers(value);
    });
    return next;
  } catch (error) {
    console.warn('绑定plus: 读取数字快照映射失败', error);
    return {};
  }
}

function saveNumberArraySnapshotMap(storageKey: string, value: Record<string, number[]>): boolean {
  try {
    const safeValue = cloneNumberArrayRecord(value);
    if (Object.keys(safeValue).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(safeValue));
    } else {
      localStorage.removeItem(storageKey);
    }
    return true;
  } catch (error) {
    console.error('绑定plus: 保存数字快照映射失败', error);
    return false;
  }
}

export function loadDefaultPresetPromptIds(presetName: string): string[] | undefined {
  const normalizedName = ensureString(presetName).trim();
  if (!normalizedName) {
    return undefined;
  }
  const map = loadStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY);
  return hasOwn(map, normalizedName) ? uniqueStrings(map[normalizedName]) : undefined;
}

export function saveDefaultPresetPromptIds(presetName: string, promptIds: string[]): boolean {
  const normalizedName = ensureString(presetName).trim();
  if (!normalizedName) {
    return false;
  }
  const map = loadStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY);
  map[normalizedName] = uniqueStrings(promptIds);
  return saveStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY, map);
}

export function savePresetPromptIdsAsDefaultSnapshot(
  presetName: string,
  promptIds: string[],
): { ok: boolean; changed: boolean; count: number; presetName: string } {
  const normalizedName = ensureString(presetName).trim();
  const normalizedPromptIds = uniqueStrings(promptIds);
  if (!normalizedName) {
    return { ok: false, changed: false, count: normalizedPromptIds.length, presetName: '' };
  }

  const savedPromptIds = loadDefaultPresetPromptIds(normalizedName);
  const changed = !areOptionalStringArraysEqual(savedPromptIds, normalizedPromptIds);
  if (!changed) {
    return { ok: true, changed: false, count: normalizedPromptIds.length, presetName: normalizedName };
  }

  if (!saveDefaultPresetPromptIds(normalizedName, normalizedPromptIds)) {
    return { ok: false, changed: true, count: normalizedPromptIds.length, presetName: normalizedName };
  }

  return { ok: true, changed: true, count: normalizedPromptIds.length, presetName: normalizedName };
}

export function saveCurrentLoadedPresetPromptsAsDefaultSnapshot(): {
  ok: boolean;
  changed: boolean;
  count: number;
  presetName: string;
} {
  const presetName = ensureString(getLoadedPresetName()).trim();
  if (!presetName) {
    return { ok: false, changed: false, count: 0, presetName: '' };
  }

  return savePresetPromptIdsAsDefaultSnapshot(presetName, getEnabledPresetPromptIds('in_use'));
}

export function renameDefaultPresetPromptSnapshot(
  previousPresetName: string,
  nextPresetName: string,
): { ok: boolean; changed: boolean; snapshotChanged: boolean; defaultPresetChanged: boolean } {
  const previousName = ensureString(previousPresetName).trim();
  const nextName = ensureString(nextPresetName).trim();
  if (!previousName || !nextName || previousName === nextName) {
    return { ok: true, changed: false, snapshotChanged: false, defaultPresetChanged: false };
  }

  let snapshotChanged = false;
  const snapshotMap = loadStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY);
  if (hasOwn(snapshotMap, previousName)) {
    const nextSnapshotMap = cloneStringArrayRecord(snapshotMap);
    nextSnapshotMap[nextName] = uniqueStrings(nextSnapshotMap[previousName]);
    delete nextSnapshotMap[previousName];
    if (!saveStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY, nextSnapshotMap)) {
      return { ok: false, changed: false, snapshotChanged: false, defaultPresetChanged: false };
    }
    snapshotChanged = true;
  }

  let defaultPresetChanged = false;
  if (getDefaultPresetName() === previousName) {
    if (!setDefaultPresetName(nextName)) {
      return { ok: false, changed: snapshotChanged, snapshotChanged, defaultPresetChanged: false };
    }
    defaultPresetChanged = true;
  }

  return {
    ok: true,
    changed: snapshotChanged || defaultPresetChanged,
    snapshotChanged,
    defaultPresetChanged,
  };
}

export function deletePresetDefaultSnapshotState(
  presetName: string,
): { ok: boolean; changed: boolean; snapshotChanged: boolean; defaultPresetChanged: boolean } {
  const normalizedName = ensureString(presetName).trim();
  if (!normalizedName) {
    return { ok: true, changed: false, snapshotChanged: false, defaultPresetChanged: false };
  }

  let snapshotChanged = false;
  const snapshotMap = loadStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY);
  if (hasOwn(snapshotMap, normalizedName)) {
    const nextSnapshotMap = cloneStringArrayRecord(snapshotMap);
    delete nextSnapshotMap[normalizedName];
    if (!saveStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY, nextSnapshotMap)) {
      return { ok: false, changed: false, snapshotChanged: false, defaultPresetChanged: false };
    }
    snapshotChanged = true;
  }

  let defaultPresetChanged = false;
  if (getDefaultPresetName() === normalizedName) {
    if (!setDefaultPresetName('')) {
      return { ok: false, changed: snapshotChanged, snapshotChanged, defaultPresetChanged: false };
    }
    defaultPresetChanged = true;
  }

  return {
    ok: true,
    changed: snapshotChanged || defaultPresetChanged,
    snapshotChanged,
    defaultPresetChanged,
  };
}

function hasContextBindingResourceValue(resources: PersonaContextBindingResources | undefined): boolean {
  const normalized = normalizeContextBindingResources(resources);
  return Boolean(
    normalized.userPersonaAvatarId ||
      normalized.userPersonaEnabledTraitIds?.length ||
      normalized.connectionProfileName ||
      normalized.presetName ||
      normalized.presetEnabledPromptIds?.length ||
      normalized.scripts?.global?.length ||
      normalized.scripts?.preset?.length ||
      normalized.scripts?.character?.length ||
      normalized.regexes?.global?.length ||
      normalized.regexes?.preset?.length ||
      normalized.regexes?.character?.length ||
      normalized.worldbooks?.global?.length ||
      normalized.worldbooks?.characterPrimary ||
      normalized.worldbooks?.characterAdditional?.length ||
      normalized.worldbooks?.chat ||
      normalized.worldbookEntries?.length ||
      normalized.extensions?.length,
  );
}

export function renamePresetBindingReferences(
  previousPresetName: string,
  nextPresetName: string,
): { ok: boolean; changed: boolean; contextBindings: number; bindingGroups: number } {
  const previousName = ensureString(previousPresetName).trim();
  const nextName = ensureString(nextPresetName).trim();
  if (!previousName || !nextName || previousName === nextName) {
    return { ok: true, changed: false, contextBindings: 0, bindingGroups: 0 };
  }

  const now = Date.now();
  let contextBindings = 0;
  const nextBindings = loadContextBindings().map(binding => {
    if (binding.resources.presetName !== previousName) {
      return binding;
    }
    contextBindings += 1;
    return {
      ...binding,
      resources: {
        ...binding.resources,
        presetName: nextName,
      },
      updatedAt: now,
    };
  });

  let bindingGroups = 0;
  const nextGroups = loadBindingGroups().map(group => {
    if (group.resources.presetName !== previousName) {
      return group;
    }
    bindingGroups += 1;
    return {
      ...group,
      resources: {
        ...group.resources,
        presetName: nextName,
      },
      updatedAt: now,
    };
  });

  const bindingsOk = contextBindings === 0 || saveContextBindings(nextBindings);
  const groupsOk = bindingGroups === 0 || saveBindingGroups(nextGroups);
  return {
    ok: bindingsOk && groupsOk,
    changed: contextBindings > 0 || bindingGroups > 0,
    contextBindings,
    bindingGroups,
  };
}

export function deletePresetBindingReferences(
  presetName: string,
): { ok: boolean; changed: boolean; contextBindings: number; bindingGroups: number; removedEmptyBindings: number } {
  const normalizedName = ensureString(presetName).trim();
  if (!normalizedName) {
    return { ok: true, changed: false, contextBindings: 0, bindingGroups: 0, removedEmptyBindings: 0 };
  }

  const now = Date.now();
  let contextBindings = 0;
  let removedEmptyBindings = 0;
  const nextBindings = loadContextBindings().flatMap(binding => {
    if (binding.resources.presetName !== normalizedName) {
      return [binding];
    }
    contextBindings += 1;
    const resources = normalizeContextBindingResources({
      ...binding.resources,
      presetName: undefined,
      presetEnabledPromptIds: undefined,
    });
    if (!hasContextBindingResourceValue(resources)) {
      removedEmptyBindings += 1;
      return [];
    }
    return [
      {
        ...binding,
        resources,
        updatedAt: now,
      },
    ];
  });

  let bindingGroups = 0;
  const nextGroups = loadBindingGroups().map(group => {
    if (group.resources.presetName !== normalizedName) {
      return group;
    }
    bindingGroups += 1;
    return {
      ...group,
      resources: normalizeContextBindingResources({
        ...group.resources,
        presetName: undefined,
        presetEnabledPromptIds: undefined,
      }),
      updatedAt: now,
    };
  });

  const bindingsOk = contextBindings === 0 || saveContextBindings(nextBindings);
  const groupsOk = bindingGroups === 0 || saveBindingGroups(nextGroups);
  return {
    ok: bindingsOk && groupsOk,
    changed: contextBindings > 0 || bindingGroups > 0,
    contextBindings,
    bindingGroups,
    removedEmptyBindings,
  };
}

function loadDefaultWorldbookEntrySnapshotMap(): Record<string, number[]> {
  return loadNumberArraySnapshotMap(PERSONA_DEFAULT_WORLDBOOK_ENTRIES_STORAGE_KEY);
}

export function loadDefaultWorldbookEnabledEntryUids(worldbookName: string): number[] | undefined {
  const normalizedName = ensureString(worldbookName).trim();
  if (!normalizedName) {
    return undefined;
  }
  const map = loadDefaultWorldbookEntrySnapshotMap();
  return hasOwn(map, normalizedName) ? uniqueNumbers(map[normalizedName]) : undefined;
}

export function saveDefaultWorldbookEnabledEntryUids(worldbookName: string, entryUids: number[]): boolean {
  const normalizedName = ensureString(worldbookName).trim();
  if (!normalizedName) {
    return false;
  }
  const map = loadDefaultWorldbookEntrySnapshotMap();
  map[normalizedName] = uniqueNumbers(entryUids);
  return saveNumberArraySnapshotMap(PERSONA_DEFAULT_WORLDBOOK_ENTRIES_STORAGE_KEY, map);
}

function getLocalStorageKeysByPrefix(prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
  } catch (error) {
    console.warn(`绑定plus: 枚举本地存储键 ${prefix} 失败`, error);
  }
  return keys;
}

function hasLocalStorageItem(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch (error) {
    console.warn(`绑定plus: 检查本地存储键 ${key} 失败`, error);
    return false;
  }
}

function getLocalStorageString(key: string): string | undefined {
  try {
    const value = localStorage.getItem(key);
    return value === null ? undefined : value;
  } catch (error) {
    console.warn(`绑定plus: 读取本地存储键 ${key} 失败`, error);
    return undefined;
  }
}

function getStoredPersonaAvatarIds(): string[] {
  const avatarIds = new Set<string>();
  [
    PERSONA_TRAITS_STORAGE_PREFIX,
    PERSONA_ADVANCED_STORAGE_PREFIX,
    PERSONA_BASE_DESC_STORAGE_PREFIX,
    PERSONA_SNAPSHOT_STORAGE_PREFIX,
  ].forEach(prefix => {
    getLocalStorageKeysByPrefix(prefix).forEach(key => {
      const avatarId = key.slice(prefix.length).trim();
      if (avatarId) {
        avatarIds.add(avatarId);
      }
    });
  });
  return Array.from(avatarIds).sort((left, right) => left.localeCompare(right));
}

function normalizeSnapshotStringRecord(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return cloneStringArrayRecord(value as Record<string, string[]>);
}

function normalizeSnapshotNumberRecord(value: unknown): Record<string, number[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return cloneNumberArrayRecord(value as Record<string, number[]>);
}

function normalizePersonaTraitsForBackup(value: unknown): PersonaTrait[] {
  return safeArray<Partial<PersonaTrait>>(value).map(trait => ({
    id: ensureString(trait.id) || createId(),
    name: ensureString(trait.name) || '未命名设定',
    description: ensureString(trait.description),
    enabled: Boolean(trait.enabled),
    createdAt: typeof trait.createdAt === 'number' ? trait.createdAt : Date.now(),
    updatedAt: typeof trait.updatedAt === 'number' ? trait.updatedAt : Date.now(),
  }));
}

function normalizePersonaAdvancedConfigForBackup(value: unknown): PersonaAdvancedConfig {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<PersonaAdvancedConfig>) : {};
  const profiles = normalizeProfiles(safeArray<PersonaProfile>(source.profiles));
  const rules = normalizeRules(safeArray<PersonaAutoRule>(source.rules));
  const profileIds = new Set(profiles.map(profile => profile.id));
  const activeProfileId = ensureString(source.activeProfileId);

  return {
    version: PERSONA_ADVANCED_CONFIG_VERSION,
    activeProfileId: activeProfileId && profileIds.has(activeProfileId) ? activeProfileId : '',
    defaultEnabledTraitIds: normalizeOptionalStringArrayField(source as object, 'defaultEnabledTraitIds'),
    profiles,
    rules,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : Date.now(),
  };
}

function normalizePersonaSnapshotsForBackup(value: unknown): PersonaSnapshot[] {
  return safeArray<Partial<PersonaSnapshot>>(value).map(snapshot => ({
    id: ensureString(snapshot.id) || createId(),
    timestamp: typeof snapshot.timestamp === 'number' ? snapshot.timestamp : Date.now(),
    reason: ensureString(snapshot.reason) || '导入配置',
    description: normalizeDescription(ensureString(snapshot.description)),
    baseDescription: normalizeDescription(ensureString(snapshot.baseDescription)),
    traits: normalizePersonaTraitsForBackup(snapshot.traits),
    config: normalizePersonaAdvancedConfigForBackup(snapshot.config),
  }));
}

function collectPersonaBackups(): BindingPlusPersonaBackup[] {
  return getStoredPersonaAvatarIds()
    .map(avatarId => {
      const backup: BindingPlusPersonaBackup = { avatarId };
      if (hasLocalStorageItem(getPersonaTraitStorageKey(avatarId))) {
        backup.traits = loadPersonaTraits(avatarId);
      }
      if (hasLocalStorageItem(getPersonaAdvancedStorageKey(avatarId))) {
        backup.advancedConfig = loadPersonaAdvancedConfig(avatarId);
      }
      const baseDescription = getLocalStorageString(getPersonaBaseDescriptionStorageKey(avatarId));
      if (baseDescription !== undefined) {
        backup.baseDescription = baseDescription;
      }
      if (hasLocalStorageItem(getPersonaSnapshotStorageKey(avatarId))) {
        backup.snapshots = loadPersonaSnapshots(avatarId);
      }
      return backup;
    })
    .filter(
      backup =>
        backup.traits !== undefined ||
        backup.advancedConfig !== undefined ||
        backup.baseDescription !== undefined ||
        backup.snapshots !== undefined,
    );
}

function normalizeBindingPlusBackupPersonas(value: unknown): BindingPlusPersonaBackup[] {
  const result: BindingPlusPersonaBackup[] = [];
  const seenAvatarIds = new Set<string>();

  safeArray<Partial<BindingPlusPersonaBackup>>(value).forEach(source => {
    const avatarId = ensureString(source.avatarId).trim();
    if (!avatarId || seenAvatarIds.has(avatarId)) {
      return;
    }

    const backup: BindingPlusPersonaBackup = { avatarId };
    if (hasOwn(source, 'traits')) {
      backup.traits = normalizePersonaTraitsForBackup(source.traits);
    }
    if (hasOwn(source, 'advancedConfig')) {
      backup.advancedConfig = normalizePersonaAdvancedConfigForBackup(source.advancedConfig);
    }
    if (hasOwn(source, 'baseDescription')) {
      backup.baseDescription = normalizeDescription(ensureString(source.baseDescription));
    }
    if (hasOwn(source, 'snapshots')) {
      backup.snapshots = normalizePersonaSnapshotsForBackup(source.snapshots);
    }

    seenAvatarIds.add(avatarId);
    result.push(backup);
  });

  return result;
}

function normalizeBindingPlusBackupFile(input: unknown): BindingPlusBackupFile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('不是有效的绑定plus配置文件');
  }

  const source = input as Record<string, unknown>;
  if (source.app !== BINDING_PLUS_BACKUP_APP || source.version !== BINDING_PLUS_BACKUP_VERSION) {
    throw new Error('不是支持的绑定plus配置文件版本');
  }

  const rawData = source.data;
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    throw new Error('绑定plus配置文件缺少 data 数据');
  }

  const data = rawData as Record<string, unknown>;
  const normalizedData: BindingPlusBackupFile['data'] = {
    contextBindings: normalizeContextBindings(data.contextBindings),
    bindingGroups: normalizeBindingGroups(data.bindingGroups),
    defaultPresetPromptIds: normalizeSnapshotStringRecord(data.defaultPresetPromptIds),
    defaultWorldbookEntryUids: normalizeSnapshotNumberRecord(data.defaultWorldbookEntryUids),
    personas: normalizeBindingPlusBackupPersonas(data.personas),
    theme: hasOwn(data, 'theme') ? normalizeBindingPlusThemeState(data.theme) : undefined,
  };

  if (hasOwn(data, 'defaultPresetName')) {
    normalizedData.defaultPresetName = ensureString(data.defaultPresetName).trim();
  }

  return {
    app: BINDING_PLUS_BACKUP_APP,
    version: BINDING_PLUS_BACKUP_VERSION,
    exportedAt: typeof source.exportedAt === 'number' ? source.exportedAt : Date.now(),
    data: normalizedData,
  };
}

function mergeContextBindingsForBackupImport(
  existingBindings: PersonaContextBinding[],
  importedBindings: PersonaContextBinding[],
): PersonaContextBinding[] {
  let nextBindings = normalizeContextBindings(existingBindings);
  normalizeContextBindings(importedBindings).forEach(importedBinding => {
    const importedTargetKey = `${importedBinding.scope}:${importedBinding.targetId}`;
    nextBindings = nextBindings.filter(binding => {
      const bindingTargetKey = `${binding.scope}:${binding.targetId}`;
      return binding.id !== importedBinding.id && bindingTargetKey !== importedTargetKey;
    });
    nextBindings.push(importedBinding);
  });
  return normalizeContextBindings(nextBindings);
}

function mergeBindingGroupsForBackupImport(existingGroups: BindingGroup[], importedGroups: BindingGroup[]): BindingGroup[] {
  let nextGroups = normalizeBindingGroups(existingGroups);
  normalizeBindingGroups(importedGroups).forEach(importedGroup => {
    const importedName = importedGroup.name.trim();
    nextGroups = nextGroups.filter(group => group.id !== importedGroup.id && group.name.trim() !== importedName);
    nextGroups.push(importedGroup);
  });
  return normalizeBindingGroups(nextGroups);
}

export function createBindingPlusBackupFile(): BindingPlusBackupFile {
  return {
    app: BINDING_PLUS_BACKUP_APP,
    version: BINDING_PLUS_BACKUP_VERSION,
    exportedAt: Date.now(),
    data: {
      contextBindings: loadContextBindings(),
      bindingGroups: loadBindingGroups(),
      defaultPresetName: getDefaultPresetName(),
      defaultPresetPromptIds: loadStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY),
      defaultWorldbookEntryUids: loadDefaultWorldbookEntrySnapshotMap(),
      personas: collectPersonaBackups(),
      theme: loadBindingPlusTheme(),
    },
  };
}

export function importBindingPlusBackupFile(input: unknown): BindingPlusBackupImportSummary {
  const backup = normalizeBindingPlusBackupFile(input);
  const summary: BindingPlusBackupImportSummary = {
    contextBindings: backup.data.contextBindings.length,
    bindingGroups: backup.data.bindingGroups.length,
    defaultPresetName: hasOwn(backup.data, 'defaultPresetName'),
    defaultPresetPromptSnapshots: Object.keys(backup.data.defaultPresetPromptIds).length,
    defaultWorldbookEntrySnapshots: Object.keys(backup.data.defaultWorldbookEntryUids).length,
    personas: backup.data.personas.length,
    personaTraits: backup.data.personas.filter(persona => persona.traits !== undefined).length,
    personaAdvancedConfigs: backup.data.personas.filter(persona => persona.advancedConfig !== undefined).length,
    personaBaseDescriptions: backup.data.personas.filter(persona => persona.baseDescription !== undefined).length,
    personaSnapshots: backup.data.personas.filter(persona => persona.snapshots !== undefined).length,
    theme: backup.data.theme !== undefined,
  };

  if (backup.data.contextBindings.length > 0) {
    const mergedBindings = mergeContextBindingsForBackupImport(loadContextBindings(), backup.data.contextBindings);
    if (!saveContextBindings(mergedBindings)) {
      throw new Error('恢复聊天/角色绑定失败');
    }
  }

  if (backup.data.bindingGroups.length > 0) {
    const mergedGroups = mergeBindingGroupsForBackupImport(loadBindingGroups(), backup.data.bindingGroups);
    if (!saveBindingGroups(mergedGroups)) {
      throw new Error('恢复绑定组失败');
    }
  }

  if (hasOwn(backup.data, 'defaultPresetName') && !setDefaultPresetName(backup.data.defaultPresetName)) {
    throw new Error('恢复默认预设失败');
  }

  if (summary.defaultPresetPromptSnapshots > 0) {
    const nextPromptSnapshots = {
      ...loadStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY),
      ...backup.data.defaultPresetPromptIds,
    };
    if (!saveStringArraySnapshotMap(PERSONA_DEFAULT_PRESET_PROMPTS_STORAGE_KEY, nextPromptSnapshots)) {
      throw new Error('恢复默认预设条目状态失败');
    }
  }

  if (summary.defaultWorldbookEntrySnapshots > 0) {
    const nextWorldbookSnapshots = {
      ...loadDefaultWorldbookEntrySnapshotMap(),
      ...backup.data.defaultWorldbookEntryUids,
    };
    if (!saveNumberArraySnapshotMap(PERSONA_DEFAULT_WORLDBOOK_ENTRIES_STORAGE_KEY, nextWorldbookSnapshots)) {
      throw new Error('恢复默认世界书条目状态失败');
    }
  }

  backup.data.personas.forEach(persona => {
    if (persona.traits !== undefined && !savePersonaTraits(persona.avatarId, persona.traits)) {
      throw new Error(`恢复 user 人设「${persona.avatarId}」条目失败`);
    }
    if (persona.advancedConfig !== undefined && !savePersonaAdvancedConfig(persona.avatarId, persona.advancedConfig)) {
      throw new Error(`恢复 user 人设「${persona.avatarId}」高级配置失败`);
    }
    if (persona.baseDescription !== undefined && !savePersonaBaseDescription(persona.avatarId, persona.baseDescription)) {
      throw new Error(`恢复 user 人设「${persona.avatarId}」基础描述失败`);
    }
    if (persona.snapshots !== undefined && !savePersonaSnapshots(persona.avatarId, persona.snapshots)) {
      throw new Error(`恢复 user 人设「${persona.avatarId}」快照失败`);
    }
  });

  if (backup.data.theme !== undefined && !saveBindingPlusTheme(backup.data.theme)) {
    throw new Error('恢复绑定plus主题失败');
  }

  return summary;
}

export function summarizeBindingPlusBackupImport(summary: BindingPlusBackupImportSummary): string {
  const parts: string[] = [];
  if (summary.contextBindings > 0) {
    parts.push(`聊天/角色绑定 ${summary.contextBindings} 条`);
  }
  if (summary.bindingGroups > 0) {
    parts.push(`绑定组 ${summary.bindingGroups} 个`);
  }
  if (summary.defaultPresetName) {
    parts.push('默认预设');
  }
  if (summary.defaultPresetPromptSnapshots > 0) {
    parts.push(`默认预设条目 ${summary.defaultPresetPromptSnapshots} 组`);
  }
  if (summary.defaultWorldbookEntrySnapshots > 0) {
    parts.push(`默认世界书条目 ${summary.defaultWorldbookEntrySnapshots} 组`);
  }
  if (summary.personas > 0) {
    parts.push(`user 人设配置 ${summary.personas} 个`);
  }
  if (summary.theme) {
    parts.push('主题');
  }
  return parts.join('，') || '没有发现可恢复的数据';
}

export function getInputPersonaName(): string {
  const parentDoc = getParentDoc();
  return ($('#persona-name-input', parentDoc).val() as string | undefined)?.trim() || '';
}

/**
 * 更新当前 Persona 显示
 */
export async function updateCurrentPersonaDisplay(): Promise<void> {
  const parentDoc = getParentDoc();
  const $display = $('#current-persona-name', parentDoc);
  try {
    const currentPersona = getCurrentPersonaFromDOM();
    if (currentPersona) {
      $display.text(currentPersona.name || '未设置');
    } else {
      $display.text('未设置');
    }
  } catch (error) {
    console.error('用户设定脚本: 获取当前 Persona 失败', error);
    $display.text('获取失败');
  }
}

// ==================== Persona 操作处理函数 ====================

/**
 * 切换 Persona
 */
export async function handleSwitchPersona(): Promise<void> {
  const name = getInputPersonaName();
  if (!name) {
    toastr.warning('请输入要切换的角色名称');
    return;
  }
  try {
    await triggerSlash(`/persona ${name}`);
    toastr.success(`已切换到角色: ${name}`);
    await updateCurrentPersonaDisplay();
  } catch (error) {
    console.error('用户设定脚本: 切换 Persona 失败', error);
    toastr.error('切换失败，请检查角色名称是否正确');
  }
}

/**
 * 临时切换 Persona
 */
export async function handleTempSwitchPersona(): Promise<void> {
  const name = getInputPersonaName();
  if (!name) {
    toastr.warning('请输入要临时使用的名称');
    return;
  }
  try {
    await triggerSlash(`/persona mode=temp ${name}`);
    toastr.success(`已临时切换到: ${name}`);
    await updateCurrentPersonaDisplay();
  } catch (error) {
    console.error('用户设定脚本: 临时切换 Persona 失败', error);
    toastr.error('临时切换失败');
  }
}

/**
 * 锁定到当前聊天
 */
export async function handleLockToChat(): Promise<void> {
  try {
    await triggerSlash('/persona-lock type=chat on');
    toastr.success('已锁定到当前聊天');
  } catch (error) {
    console.error('用户设定脚本: 锁定到聊天失败', error);
    toastr.error('锁定失败');
  }
}

/**
 * 锁定到当前角色
 */
export async function handleLockToCharacter(): Promise<void> {
  try {
    await triggerSlash('/persona-lock type=character on');
    toastr.success('已锁定到当前角色');
  } catch (error) {
    console.error('用户设定脚本: 锁定到角色失败', error);
    toastr.error('锁定失败');
  }
}

/**
 * 解除锁定
 */
export async function handleUnlock(): Promise<void> {
  try {
    await triggerSlash('/persona-lock type=none');
    toastr.success('已解除锁定');
  } catch (error) {
    console.error('用户设定脚本: 解除锁定失败', error);
    toastr.error('解除锁定失败');
  }
}

/**
 * 同步消息到当前 Persona
 */
export async function handleSyncMessages(): Promise<void> {
  try {
    await triggerSlash('/persona-sync');
    toastr.success('已同步所有消息到当前角色');
  } catch (error) {
    console.error('用户设定脚本: 同步消息失败', error);
    toastr.error('同步失败');
  }
}

/**
 * 在父 UI 中通过点击事件选中指定的 Persona
 */
export async function selectPersonaInParentUI(avatarId: string): Promise<boolean> {
  const normalizedAvatarId = ensureString(avatarId).trim();
  if (!normalizedAvatarId) {
    return false;
  }

  console.log(`用户设定脚本: 尝试选中 Persona (avatarId: ${normalizedAvatarId})`);
  const parentDoc = getParentDoc();
  const $personaCard = $(`#user_avatar_block .avatar-container[data-avatar-id="${normalizedAvatarId}"]`, parentDoc);

  const isSelected = () =>
    getCurrentPersonaAvatarIdSafe() === normalizedAvatarId ||
    $(`#user_avatar_block .avatar-container[data-avatar-id="${normalizedAvatarId}"]`, parentDoc).hasClass('selected');

  if (isSelected()) {
    return true;
  }

  const persona = findPersonaByAvatarId(normalizedAvatarId);
  const slashCandidates = uniqueStrings([normalizedAvatarId, persona?.name]);
  for (const candidate of slashCandidates) {
    try {
      await triggerSlash(`/persona-set mode=lookup ${quoteSlashCommandArgument(candidate)}`);
      await new Promise(resolve => setTimeout(resolve, 180));
      if (isSelected()) {
        return true;
      }
    } catch (error) {
      console.warn('用户设定脚本: 通过 persona-set 切换 Persona 失败，准备尝试其他候选或 DOM 兜底', {
        avatarId: normalizedAvatarId,
        candidate,
        error,
      });
    }
  }

  if ($personaCard.length === 0) {
    console.error(`用户设定脚本: 找不到 avatarId 为 ${normalizedAvatarId} 的 Persona 卡片，persona-set 也未能切换`);
    toastr.error('切换 Persona 失败：未能通过酒馆接口选中对应 user 人设');
    return false;
  }

  if (!$personaCard.hasClass('selected')) {
    $personaCard.trigger('click');
    await new Promise(resolve => setTimeout(resolve, 120));

    if (!isSelected()) {
      console.error(`用户设定脚本: 点击后，Persona (avatarId: ${normalizedAvatarId}) 仍未选中`);
      toastr.error('切换 Persona 失败，无法继续保存');
      return false;
    }
  }

  return true;
}

/**
 * 保存 Persona 信息
 */
export async function savePersona(originalAvatarId: string, newName: string, newDescription: string): Promise<boolean> {
  try {
    const parentDoc = getParentDoc();

    const selectionSuccess = await selectPersonaInParentUI(originalAvatarId);
    if (!selectionSuccess) {
      return false;
    }

    savePersonaBaseDescription(originalAvatarId, newDescription);
    recordPersonaSnapshot(originalAvatarId, '手动保存 Persona', newDescription);

    const fullDescription = await composePersonaDescription(originalAvatarId, newDescription);

    const $personaDescription = $('#persona_description', parentDoc);
    if ($personaDescription.length > 0) {
      $personaDescription.val(fullDescription).trigger('input').trigger('blur');
    } else {
      console.warn('用户设定脚本: 找不到 #persona_description 元素');
    }

    const $personaName = $('#your_name', parentDoc);
    const currentName = $personaName.text().trim();

    if (newName !== currentName) {
      const $renameBtn = $('#persona_rename_button', parentDoc);
      if ($renameBtn.length > 0) {
        $renameBtn.trigger('click');
        await handlePersonaRenameModal(newName);
      } else {
        console.warn('用户设定脚本: 找不到重命名按钮，跳过名称更新');
      }
    }

    await new Promise(resolve => setTimeout(resolve, 400));
    toastr.success(`Persona "${newName}" 已成功保存`);
    return true;
  } catch (error) {
    console.error('用户设定脚本: 保存 Persona 时发生意外错误', error);
    toastr.error('保存过程中发生意外错误');
    return false;
  }
}

async function handlePersonaRenameModal(newName: string): Promise<boolean> {
  const parentDoc = getParentDoc();
  await new Promise(resolve => setTimeout(resolve, 300));

  const $modalInput = $('.popup .wide100p input[type="text"]', parentDoc);
  if ($modalInput.length > 0) {
    $modalInput.val(newName).trigger('input');
    const $confirmBtn = $('.popup-menu_buttons .menu_button:contains("OK")', parentDoc);
    if ($confirmBtn.length > 0) {
      $confirmBtn.trigger('click');
      await new Promise(resolve => setTimeout(resolve, 300));
      return true;
    }
  }
  return false;
}

// ==================== 角色设定存储管理 ====================

function getPersonaTraitStorageKey(avatarId: string): string {
  return `${PERSONA_TRAITS_STORAGE_PREFIX}${avatarId}`;
}

export function loadPersonaTraits(avatarId: string): PersonaTrait[] {
  try {
    const key = getPersonaTraitStorageKey(avatarId);
    const data = localStorage.getItem(key);
    if (data) {
      const parsed = JSON.parse(data);
      return safeArray<PersonaTrait>(parsed).map(trait => ({
        id: ensureString(trait.id),
        name: ensureString(trait.name) || '未命名设定',
        description: ensureString(trait.description),
        enabled: Boolean(trait.enabled),
        createdAt: typeof trait.createdAt === 'number' ? trait.createdAt : Date.now(),
        updatedAt: typeof trait.updatedAt === 'number' ? trait.updatedAt : Date.now(),
      }));
    }
  } catch (error) {
    console.error('用户设定脚本: 加载角色设定失败', error);
  }
  return [];
}

export function savePersonaTraits(avatarId: string, traits: PersonaTrait[]): boolean {
  try {
    const key = getPersonaTraitStorageKey(avatarId);
    localStorage.setItem(key, JSON.stringify(traits));
    return true;
  } catch (error) {
    console.error('用户设定脚本: 保存角色设定失败', error);
    toastr.error('保存角色设定失败');
    return false;
  }
}

// ==================== 基础描述存储 ====================

function getPersonaBaseDescriptionStorageKey(avatarId: string): string {
  return `${PERSONA_BASE_DESC_STORAGE_PREFIX}${avatarId}`;
}

export function extractBaseDescriptionFromComposed(description: string): string {
  const normalized = normalizeDescription(description);
  const markerIndex = normalized.indexOf(PERSONA_TRAIT_SEPARATOR);
  if (markerIndex === -1) {
    return normalized;
  }
  return normalized.slice(0, markerIndex).trim();
}

export function loadPersonaBaseDescription(avatarId: string, fallbackDescription: string = ''): string {
  try {
    const key = getPersonaBaseDescriptionStorageKey(avatarId);
    const cached = localStorage.getItem(key);
    if (cached !== null) {
      return cached;
    }
  } catch (error) {
    console.error('用户设定脚本: 读取基础描述失败', error);
  }

  const extracted = extractBaseDescriptionFromComposed(fallbackDescription);
  if (avatarId) {
    savePersonaBaseDescription(avatarId, extracted);
  }
  return extracted;
}

export function savePersonaBaseDescription(avatarId: string, baseDescription: string): boolean {
  try {
    const key = getPersonaBaseDescriptionStorageKey(avatarId);
    localStorage.setItem(key, normalizeDescription(baseDescription));
    return true;
  } catch (error) {
    console.error('用户设定脚本: 保存基础描述失败', error);
    return false;
  }
}

// ==================== 高级配置（Profile + Rule） ====================

function getPersonaAdvancedStorageKey(avatarId: string): string {
  return `${PERSONA_ADVANCED_STORAGE_PREFIX}${avatarId}`;
}

function getDefaultAdvancedConfig(): PersonaAdvancedConfig {
  return {
    version: PERSONA_ADVANCED_CONFIG_VERSION,
    activeProfileId: '',
    defaultEnabledTraitIds: undefined,
    profiles: [],
    rules: [],
    updatedAt: Date.now(),
  };
}

function normalizePlusBindingWorldbookEntries(
  entries: PersonaPlusBindingWorldbookEntry[] | unknown,
): PersonaPlusBindingWorldbookEntry[] {
  return safeArray<PersonaPlusBindingWorldbookEntry>(entries)
    .map(entry => ({
      worldbookName: ensureString(entry.worldbookName).trim(),
      entryUids: uniqueNumbers(entry.entryUids),
      enabled: entry.enabled !== false,
    }))
    .filter(entry => entry.worldbookName && entry.entryUids.length > 0);
}

function normalizePlusExtensionBindings(
  extensions: PersonaPlusExtensionSettingBinding[] | unknown,
): PersonaPlusExtensionSettingBinding[] {
  return safeArray<PersonaPlusExtensionSettingBinding>(extensions)
    .map(binding => ({
      extensionId: ensureString(binding.extensionId).trim(),
      settingsPatch:
        binding.settingsPatch && typeof binding.settingsPatch === 'object' && !Array.isArray(binding.settingsPatch)
          ? (binding.settingsPatch as Record<string, unknown>)
          : {},
    }))
    .filter(binding => binding.extensionId && Object.keys(binding.settingsPatch).length > 0);
}

function normalizePlusBindingConfig(config: PersonaPlusBindingConfig | unknown): PersonaPlusBindingConfig | undefined {
  if (!config || typeof config !== 'object') {
    return undefined;
  }

  const source = config as PersonaPlusBindingConfig;
  const normalized: PersonaPlusBindingConfig = {
    connectionProfileName: ensureString(source.connectionProfileName).trim() || undefined,
    presetName: ensureString(source.presetName).trim() || undefined,
    scripts: {
      global: uniqueStrings(source.scripts?.global),
      preset: uniqueStrings(source.scripts?.preset),
      character: uniqueStrings(source.scripts?.character),
    },
    regexes: {
      global: uniqueStrings(source.regexes?.global),
      preset: uniqueStrings(source.regexes?.preset),
      character: uniqueStrings(source.regexes?.character),
    },
    worldbooks: {
      global: uniqueStrings(source.worldbooks?.global),
      characterPrimary: ensureString(source.worldbooks?.characterPrimary).trim() || undefined,
      characterAdditional: uniqueStrings(source.worldbooks?.characterAdditional),
      chat: ensureString(source.worldbooks?.chat).trim() || undefined,
    },
    worldbookEntries: normalizePlusBindingWorldbookEntries(source.worldbookEntries),
    extensions: normalizePlusExtensionBindings(source.extensions),
  };

  const hasValue = Boolean(
    normalized.connectionProfileName ||
    normalized.presetName ||
    normalized.scripts?.global?.length ||
    normalized.scripts?.preset?.length ||
    normalized.scripts?.character?.length ||
    normalized.regexes?.global?.length ||
    normalized.regexes?.preset?.length ||
    normalized.regexes?.character?.length ||
    normalized.worldbooks?.global?.length ||
    normalized.worldbooks?.characterPrimary ||
    normalized.worldbooks?.characterAdditional?.length ||
    normalized.worldbooks?.chat ||
    normalized.worldbookEntries?.length ||
    normalized.extensions?.length,
  );

  return hasValue ? normalized : undefined;
}

function normalizeContextBindingResources(
  resources: PersonaContextBindingResources | unknown,
): PersonaContextBindingResources {
  const source = (
    resources && typeof resources === 'object' ? (resources as PersonaContextBindingResources) : {}
  ) as PersonaContextBindingResources;
  const plusBinding = normalizePlusBindingConfig(source) || {};
  const userPersonaAvatarId = ensureString(source.userPersonaAvatarId).trim() || undefined;
  const presetName = ensureString(plusBinding.presetName).trim() || undefined;
  return {
    userPersonaAvatarId,
    userPersonaProfileId: userPersonaAvatarId ? ensureString(source.userPersonaProfileId).trim() || undefined : undefined,
    userPersonaEnabledTraitIds: userPersonaAvatarId
      ? normalizeOptionalStringArrayField(source, 'userPersonaEnabledTraitIds')
      : undefined,
    presetEnabledPromptIds: presetName ? normalizeOptionalStringArrayField(source, 'presetEnabledPromptIds') : undefined,
    ...plusBinding,
  };
}

function normalizeContextBindings(bindings: PersonaContextBinding[] | unknown): PersonaContextBinding[] {
  return safeArray<PersonaContextBinding>(bindings)
    .map<PersonaContextBinding>(binding => ({
      id: ensureString(binding.id) || createId(),
      scope: binding.scope === 'character' ? 'character' : 'chat',
      targetId: ensureString(binding.targetId).trim(),
      targetName: ensureString(binding.targetName).trim(),
      resources: normalizeContextBindingResources(binding.resources),
      createdAt: typeof binding.createdAt === 'number' ? binding.createdAt : Date.now(),
      updatedAt: typeof binding.updatedAt === 'number' ? binding.updatedAt : Date.now(),
    }))
    .filter(binding => binding.targetId);
}

function normalizeBindingGroups(groups: BindingGroup[] | unknown): BindingGroup[] {
  return safeArray<BindingGroup>(groups)
    .map<BindingGroup>(group => ({
      id: ensureString(group.id) || createId(),
      name: ensureString(group.name).trim() || '未命名绑定组',
      resources: normalizeContextBindingResources(group.resources),
      createdAt: typeof group.createdAt === 'number' ? group.createdAt : Date.now(),
      updatedAt: typeof group.updatedAt === 'number' ? group.updatedAt : Date.now(),
    }))
    .filter(group => Boolean(group.id));
}

function getDefaultPlusAppliedState(): PersonaPlusAppliedState {
  return {
    userPersonaAvatarId: undefined,
    userPersonaProfileId: undefined,
    userPersonaEnabledTraitIds: undefined,
    connectionProfileName: undefined,
    connectionProfileBaseline: undefined,
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
      characterAdditional: [],
    },
    worldbookEntries: [],
    extensions: [],
    personaTraitBaselines: {},
    presetPromptBaselines: {},
    worldbookEntryBaselines: {},
  };
}

function normalizeProfiles(profiles: PersonaProfile[]): PersonaProfile[] {
  return profiles.map(profile => ({
    id: ensureString(profile.id) || createId(),
    name: ensureString(profile.name) || '未命名预设',
    traitIds: safeArray<string>(profile.traitIds).filter(Boolean),
    plusBinding: normalizePlusBindingConfig(profile.plusBinding),
    createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : Date.now(),
    updatedAt: typeof profile.updatedAt === 'number' ? profile.updatedAt : Date.now(),
  }));
}

function normalizeRules(rules: PersonaAutoRule[]): PersonaAutoRule[] {
  return rules.map(rule => ({
    id: ensureString(rule.id) || createId(),
    name: ensureString(rule.name) || '未命名规则',
    enabled: Boolean(rule.enabled),
    scope: rule.scope === 'character' ? 'character' : 'chat',
    matchMode: rule.matchMode === 'equals' || rule.matchMode === 'regex' ? rule.matchMode : 'includes',
    pattern: ensureString(rule.pattern),
    traitIds: safeArray<string>(rule.traitIds).filter(Boolean),
    profileIds: safeArray<string>(rule.profileIds).filter(Boolean),
    profileId: ensureString(rule.profileId) || undefined,
    createdAt: typeof rule.createdAt === 'number' ? rule.createdAt : Date.now(),
    updatedAt: typeof rule.updatedAt === 'number' ? rule.updatedAt : Date.now(),
  }));
}

export function loadPersonaAdvancedConfig(avatarId: string): PersonaAdvancedConfig {
  const defaultConfig = getDefaultAdvancedConfig();
  if (!avatarId) {
    return defaultConfig;
  }

  try {
    const key = getPersonaAdvancedStorageKey(avatarId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return defaultConfig;
    }

    const parsed = JSON.parse(raw) as Partial<PersonaAdvancedConfig>;
    const profiles = normalizeProfiles(safeArray<PersonaProfile>(parsed.profiles));
    const rules = normalizeRules(safeArray<PersonaAutoRule>(parsed.rules));
    const profileIds = new Set(profiles.map(p => p.id));
    const activeProfileId = ensureString(parsed.activeProfileId);

    return {
      version: PERSONA_ADVANCED_CONFIG_VERSION,
      activeProfileId: activeProfileId && profileIds.has(activeProfileId) ? activeProfileId : '',
      defaultEnabledTraitIds: normalizeOptionalStringArrayField(parsed as object, 'defaultEnabledTraitIds'),
      profiles,
      rules,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch (error) {
    console.error('用户设定脚本: 加载高级配置失败', error);
    return defaultConfig;
  }
}

export function savePersonaAdvancedConfig(avatarId: string, config: PersonaAdvancedConfig): boolean {
  if (!avatarId) {
    return false;
  }
  try {
    const safeConfig: PersonaAdvancedConfig = {
      version: PERSONA_ADVANCED_CONFIG_VERSION,
      activeProfileId: ensureString(config.activeProfileId),
      defaultEnabledTraitIds:
        config.defaultEnabledTraitIds === undefined ? undefined : uniqueStrings(config.defaultEnabledTraitIds),
      profiles: normalizeProfiles(config.profiles),
      rules: normalizeRules(config.rules),
      updatedAt: Date.now(),
    };
    const key = getPersonaAdvancedStorageKey(avatarId);
    localStorage.setItem(key, JSON.stringify(safeConfig));
    return true;
  } catch (error) {
    console.error('用户设定脚本: 保存高级配置失败', error);
    toastr.error('保存规则/预设失败');
    return false;
  }
}

export function getPersonaDefaultEnabledTraitIds(avatarId: string): string[] | undefined {
  const config = loadPersonaAdvancedConfig(avatarId);
  return config.defaultEnabledTraitIds === undefined ? undefined : uniqueStrings(config.defaultEnabledTraitIds);
}

export function savePersonaDefaultEnabledTraitIds(avatarId: string, traitIds: string[]): boolean {
  if (!avatarId) {
    return false;
  }
  const config = loadPersonaAdvancedConfig(avatarId);
  config.defaultEnabledTraitIds = uniqueStrings(traitIds);
  return savePersonaAdvancedConfig(avatarId, config);
}

function buildLegacyContextBindingTargetId(
  scope: 'chat' | 'character',
  context: PersonaRuntimeContext = getRuntimeContext(),
): string {
  return scope === 'character'
    ? `${context.characterId} ${context.characterName}`.trim()
    : `${context.chatId} ${context.chatName}`.trim();
}

function buildStableContextBindingTargetId(
  scope: 'chat' | 'character',
  context: PersonaRuntimeContext = getRuntimeContext(),
): string {
  const rawId = ensureString(scope === 'character' ? context.characterId : context.chatId).trim();
  const rawName = ensureString(scope === 'character' ? context.characterName : context.chatName).trim();
  if (rawId) {
    return `${scope}:id:${rawId}`;
  }
  if (rawName) {
    return `${scope}:name:${rawName}`;
  }
  return '';
}

function isMatchingContextBindingTarget(
  binding: PersonaContextBinding,
  scope: 'chat' | 'character',
  context: PersonaRuntimeContext = getRuntimeContext(),
): boolean {
  const stableTargetId = buildStableContextBindingTargetId(scope, context);
  const legacyTargetId = buildLegacyContextBindingTargetId(scope, context);
  const currentTargetName = ensureString(scope === 'character' ? context.characterName : context.chatName).trim();
  if (!stableTargetId && !legacyTargetId) {
    return false;
  }
  if (
    binding.scope === scope &&
    currentTargetName &&
    !binding.targetId.startsWith(`${scope}:id:`) &&
    !binding.targetId.startsWith(`${scope}:name:`) &&
    binding.targetName === currentTargetName
  ) {
    return true;
  }
  return (
    binding.scope === scope &&
    Boolean(binding.targetId) &&
    (binding.targetId === stableTargetId || binding.targetId === legacyTargetId)
  );
}

export function buildContextBindingTarget(
  scope: 'chat' | 'character',
  context: PersonaRuntimeContext = getRuntimeContext(),
): { targetId: string; targetName: string } {
  if (scope === 'character') {
    const targetId = `${context.characterId} ${context.characterName}`.trim();
    return {
      targetId,
      targetName: context.characterName || context.characterId || '当前角色',
    };
  }

  const targetId = `${context.chatId} ${context.chatName}`.trim();
  return {
    targetId,
    targetName: context.chatName || context.chatId || '当前聊天',
  };
}

export function loadContextBindings(): PersonaContextBinding[] {
  try {
    const raw = localStorage.getItem(PERSONA_CONTEXT_BINDINGS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return normalizeContextBindings(parsed);
  } catch (error) {
    console.error('用户设定脚本: 读取聊天/角色绑定失败', error);
    return [];
  }
}

export function saveContextBindings(bindings: PersonaContextBinding[]): boolean {
  try {
    localStorage.setItem(
      PERSONA_CONTEXT_BINDINGS_STORAGE_KEY,
      JSON.stringify(normalizeContextBindings(bindings).sort((a, b) => b.updatedAt - a.updatedAt)),
    );
    return true;
  } catch (error) {
    console.error('用户设定脚本: 保存聊天/角色绑定失败', error);
    toastr.error('保存聊天/角色绑定失败');
    return false;
  }
}

export function findContextBinding(
  scope: 'chat' | 'character',
  context: PersonaRuntimeContext = getRuntimeContext(),
  bindings: PersonaContextBinding[] = loadContextBindings(),
): PersonaContextBinding | null {
  const stableTargetId = buildStableContextBindingTargetId(scope, context);
  const legacyTargetId = buildLegacyContextBindingTargetId(scope, context);
  if (!stableTargetId && !legacyTargetId) {
    return null;
  }
  return bindings.find(binding => isMatchingContextBindingTarget(binding, scope, context)) || null;
}

export function upsertContextBinding(
  scope: 'chat' | 'character',
  resources: PersonaContextBindingResources,
  context: PersonaRuntimeContext = getRuntimeContext(),
): PersonaContextBinding | null {
  const { targetName } = buildContextBindingTarget(scope, context);
  const targetId = buildStableContextBindingTargetId(scope, context);
  const legacyTargetId = buildLegacyContextBindingTargetId(scope, context);
  if (!targetId && !legacyTargetId) {
    return null;
  }

  const bindings = loadContextBindings();
  const normalizedResources = normalizeContextBindingResources(resources);
  const now = Date.now();
  const index = bindings.findIndex(binding => isMatchingContextBindingTarget(binding, scope, context));

  if (index !== -1) {
    const nextBinding: PersonaContextBinding = {
      ...bindings[index],
      targetId: targetId || legacyTargetId,
      targetName,
      resources: normalizedResources,
      updatedAt: now,
    };
    bindings[index] = nextBinding;
    return saveContextBindings(bindings) ? nextBinding : null;
  }

  const binding: PersonaContextBinding = {
    id: createId(),
    scope,
    targetId: targetId || legacyTargetId,
    targetName,
    resources: normalizedResources,
    createdAt: now,
    updatedAt: now,
  };
  bindings.push(binding);
  return saveContextBindings(bindings) ? binding : null;
}

export function deleteContextBinding(
  scope: 'chat' | 'character',
  context: PersonaRuntimeContext = getRuntimeContext(),
): boolean {
  const stableTargetId = buildStableContextBindingTargetId(scope, context);
  const legacyTargetId = buildLegacyContextBindingTargetId(scope, context);
  if (!stableTargetId && !legacyTargetId) {
    return false;
  }

  const bindings = loadContextBindings();
  const nextBindings = bindings.filter(binding => !isMatchingContextBindingTarget(binding, scope, context));
  if (nextBindings.length === bindings.length) {
    return false;
  }
  return saveContextBindings(nextBindings);
}

export function deleteContextBindingById(bindingId: string): boolean {
  const normalizedId = ensureString(bindingId).trim();
  if (!normalizedId) {
    return false;
  }

  const bindings = loadContextBindings();
  const nextBindings = bindings.filter(binding => binding.id !== normalizedId);
  if (nextBindings.length === bindings.length) {
    return false;
  }
  return saveContextBindings(nextBindings);
}

function isChatContextBindingMatchedByFileName(binding: PersonaContextBinding, chatFileName: string): boolean {
  const normalizedChatFileName = ensureString(chatFileName).trim();
  if (binding.scope !== 'chat' || !normalizedChatFileName) {
    return false;
  }

  const targetId = ensureString(binding.targetId).trim();
  const targetName = ensureString(binding.targetName).trim();
  const stableIdTarget = `chat:id:${normalizedChatFileName}`;
  const stableNameTarget = `chat:name:${normalizedChatFileName}`;
  const legacyTarget = `${normalizedChatFileName} ${targetName}`.trim();

  return (
    targetId === stableIdTarget ||
    targetId === stableNameTarget ||
    targetId === normalizedChatFileName ||
    targetId === legacyTarget ||
    targetName === normalizedChatFileName ||
    targetId.startsWith(`${normalizedChatFileName} `)
  );
}

export function deleteChatContextBindingsByFileName(chatFileName: string): PersonaContextBinding[] {
  const normalizedChatFileName = ensureString(chatFileName).trim();
  if (!normalizedChatFileName) {
    return [];
  }

  const bindings = loadContextBindings();
  const removedBindings = bindings.filter(binding => isChatContextBindingMatchedByFileName(binding, normalizedChatFileName));
  if (removedBindings.length === 0) {
    return [];
  }

  const nextBindings = bindings.filter(binding => !isChatContextBindingMatchedByFileName(binding, normalizedChatFileName));
  return saveContextBindings(nextBindings) ? removedBindings : [];
}

export function loadBindingGroups(): BindingGroup[] {
  try {
    const raw = localStorage.getItem(PERSONA_BINDING_GROUPS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return normalizeBindingGroups(parsed).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error('用户设定脚本: 读取绑定组失败', error);
    return [];
  }
}

export function saveBindingGroups(groups: BindingGroup[]): boolean {
  try {
    localStorage.setItem(
      PERSONA_BINDING_GROUPS_STORAGE_KEY,
      JSON.stringify(normalizeBindingGroups(groups).sort((a, b) => b.updatedAt - a.updatedAt)),
    );
    return true;
  } catch (error) {
    console.error('用户设定脚本: 保存绑定组失败', error);
    toastr.error('保存绑定组失败');
    return false;
  }
}

export function upsertBindingGroup(input: {
  id?: string;
  name: string;
  resources: PersonaContextBindingResources;
}): BindingGroup | null {
  const name = ensureString(input.name).trim();
  if (!name) {
    return null;
  }

  const groups = loadBindingGroups();
  const normalizedResources = normalizeContextBindingResources(input.resources);
  const now = Date.now();
  const existingIndex = groups.findIndex(group => group.id === ensureString(input.id).trim());

  if (existingIndex !== -1) {
    groups[existingIndex] = {
      ...groups[existingIndex],
      name,
      resources: normalizedResources,
      updatedAt: now,
    };
    saveBindingGroups(groups);
    return groups[existingIndex];
  }

  const nextGroup: BindingGroup = {
    id: createId(),
    name,
    resources: normalizedResources,
    createdAt: now,
    updatedAt: now,
  };
  groups.push(nextGroup);
  saveBindingGroups(groups);
  return nextGroup;
}

export function deleteBindingGroup(groupId: string): boolean {
  const normalizedId = ensureString(groupId).trim();
  if (!normalizedId) {
    return false;
  }
  const groups = loadBindingGroups();
  const nextGroups = groups.filter(group => group.id !== normalizedId);
  if (nextGroups.length === groups.length) {
    return false;
  }
  return saveBindingGroups(nextGroups);
}

export function loadPersonaProfiles(avatarId: string): PersonaProfile[] {
  return loadPersonaAdvancedConfig(avatarId).profiles;
}

export function savePersonaProfiles(avatarId: string, profiles: PersonaProfile[]): boolean {
  const config = loadPersonaAdvancedConfig(avatarId);
  config.profiles = profiles;
  const validIds = new Set(profiles.map(p => p.id));
  if (config.activeProfileId && !validIds.has(config.activeProfileId)) {
    config.activeProfileId = '';
  }
  return savePersonaAdvancedConfig(avatarId, config);
}

export function loadPersonaRules(avatarId: string): PersonaAutoRule[] {
  return loadPersonaAdvancedConfig(avatarId).rules;
}

export function savePersonaRules(avatarId: string, rules: PersonaAutoRule[]): boolean {
  const config = loadPersonaAdvancedConfig(avatarId);
  config.rules = rules;
  return savePersonaAdvancedConfig(avatarId, config);
}

export function getActiveProfileId(avatarId: string): string {
  return loadPersonaAdvancedConfig(avatarId).activeProfileId || '';
}

export function setActiveProfileId(avatarId: string, profileId: string): boolean {
  const config = loadPersonaAdvancedConfig(avatarId);
  const validProfileIds = new Set(config.profiles.map(p => p.id));
  config.activeProfileId = profileId && validProfileIds.has(profileId) ? profileId : '';
  return savePersonaAdvancedConfig(avatarId, config);
}

// ==================== 规则匹配和激活计算 ====================

function getFirstTextBySelector(selectors: string[], doc: Document): string {
  for (const selector of selectors) {
    const text = $(selector, doc).first().text().trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function getFirstAttrBySelector(selectors: string[], attr: string, doc: Document): string {
  for (const selector of selectors) {
    const value = $(selector, doc).first().attr(attr);
    if (value) {
      return value;
    }
  }
  return '';
}

type RuntimeContextDebugInfo = {
  context: PersonaRuntimeContext;
  source: {
    chatId: string;
    chatName: string;
    characterId: string;
    characterName: string;
  };
};

function resolveRuntimeContextDebugInfo(): RuntimeContextDebugInfo {
  const parentDoc = getParentDoc();
  const parentWindow = window.parent as unknown as Record<string, unknown>;
  const maybeSillyTavern = (parentWindow.SillyTavern || (window as unknown as Record<string, unknown>).SillyTavern) as
    | undefined
    | {
        getCurrentChatId?: () => string | number;
        getContext?: () => Record<string, unknown>;
      };

  let chatId = '';
  let chatName = '';
  let characterId = '';
  let characterName = '';
  let domChatFilename = '';
  let chatIdSource = 'unknown';
  let chatNameSource = 'unknown';
  let characterIdSource = 'unknown';
  let characterNameSource = 'unknown';

  try {
    if (maybeSillyTavern?.getCurrentChatId) {
      const id = maybeSillyTavern.getCurrentChatId();
      const value = id !== undefined && id !== null ? String(id) : '';
      if (value) {
        chatId = value;
        chatIdSource = 'sillytavern.getCurrentChatId';
      }
    }

    const ctx = maybeSillyTavern?.getContext?.() || {};
    const ctxChatId = ensureStringLike(ctx.chatId) || ensureStringLike(ctx.chat_id);
    const ctxChatFile = ensureStringLike(ctx.chatFile);
    const ctxCharacterId =
      ensureStringLike(ctx.characterId) || ensureStringLike(ctx.chid) || ensureStringLike(ctx.this_chid);
    const ctxCharacterName = ensureStringLike(ctx.characterName) || ensureStringLike(ctx.name2);
    const ctxGroupId = ensureStringLike(ctx.groupId);

    domChatFilename = getFirstTextBySelector(
      [
        '.select_chat_block.selected .select_chat_block_filename.select_chat_block_filename_item',
        '.select_chat_block.active .select_chat_block_filename.select_chat_block_filename_item',
        '.select_chat_block_filename.select_chat_block_filename_item',
      ],
      parentDoc,
    );

    // 优先使用前端可见的 chat 文件名，便于绑定规则可读且稳定
    if (domChatFilename) {
      chatId = domChatFilename;
      chatIdSource = 'dom.select_chat_block_filename';
    } else if (!chatId && ctxChatId) {
      chatId = ctxChatId;
      chatIdSource = 'sillytavern.context.chatId/chat_id';
    } else if (!chatId && ctxChatFile) {
      chatId = ctxChatFile;
      chatIdSource = 'sillytavern.context.chatFile';
    }

    if (chatIdSource === 'dom.select_chat_block_filename') {
      if (ctxChatId) {
        chatId = ctxChatId;
        chatIdSource = 'sillytavern.context.chatId/chat_id';
      } else if (ctxChatFile) {
        chatId = ctxChatFile;
        chatIdSource = 'sillytavern.context.chatFile';
      }
    }

    if (ctxCharacterId) {
      characterId = ctxCharacterId;
      characterIdSource = 'sillytavern.context.characterId/chid/this_chid';
    } else if (ctxGroupId) {
      characterId = `group:${ctxGroupId}`;
      characterIdSource = 'sillytavern.context.groupId';
    }

    if (ctxCharacterName) {
      characterName = ctxCharacterName;
      characterNameSource = 'sillytavern.context.characterName/name2';
    }
  } catch (error) {
    console.warn('用户设定脚本: 获取当前聊天/角色信息失败', error);
  }

  if (!chatName) {
    chatName = getFirstTextBySelector(
      [
        '#select_chat option:selected',
        '#chat_select option:selected',
        '#chat_name',
        '.chat_name',
        '#chat_header .name_text',
      ],
      parentDoc,
    );
    if (chatName) {
      chatNameSource = 'dom.chat_selectors';
    }
  }
  if (!chatName && domChatFilename) {
    chatName = domChatFilename;
    chatNameSource = 'dom.select_chat_block_filename';
  }

  if (!characterName) {
    characterName = getFirstTextBySelector(
      [
        '#rm_print_characters_block .character_select.selected .ch_name',
        '#character_name_pole',
        '#rm_info_block .ch_name',
      ],
      parentDoc,
    );
    if (characterName) {
      characterNameSource = 'dom.character_name_selectors';
    }
  }

  if (!characterId) {
    characterId = getFirstAttrBySelector(
      ['#rm_print_characters_block .character_select.selected'],
      'data-chid',
      parentDoc,
    );
    if (characterId) {
      characterIdSource = 'dom.selected_character_data_chid';
    }
  }

  if (!chatIdSource || chatIdSource === 'unknown') {
    chatIdSource = 'not_found';
  }
  if (!chatNameSource || chatNameSource === 'unknown') {
    chatNameSource = 'not_found';
  }
  if (!characterIdSource || characterIdSource === 'unknown') {
    characterIdSource = 'not_found';
  }
  if (!characterNameSource || characterNameSource === 'unknown') {
    characterNameSource = 'not_found';
  }

  return {
    context: {
      chatId,
      chatName,
      characterId,
      characterName,
    },
    source: {
      chatId: chatIdSource,
      chatName: chatNameSource,
      characterId: characterIdSource,
      characterName: characterNameSource,
    },
  };
}

export function getRuntimeContext(): PersonaRuntimeContext {
  return resolveRuntimeContextDebugInfo().context;
}

export function getRuntimeContextDebugInfo(): RuntimeContextDebugInfo {
  return resolveRuntimeContextDebugInfo();
}

function isRuleMatched(rule: PersonaAutoRule, context: PersonaRuntimeContext): boolean {
  if (!rule.enabled || !rule.pattern.trim()) {
    return false;
  }

  const target =
    rule.scope === 'character'
      ? `${context.characterId} ${context.characterName}`.trim()
      : `${context.chatId} ${context.chatName}`.trim();
  const source = target.toLowerCase();
  const pattern = rule.pattern.trim();

  if (!source) {
    return false;
  }

  switch (rule.matchMode) {
    case 'equals':
      return source === pattern.toLowerCase();
    case 'regex':
      try {
        return new RegExp(pattern, 'i').test(target);
      } catch (error) {
        console.warn(`用户设定脚本: 规则正则无效 "${rule.name}" -> ${pattern}`, error);
        return false;
      }
    case 'includes':
    default:
      return source.includes(pattern.toLowerCase());
  }
}

export function getPersonaActivationState(
  avatarId: string,
  context: PersonaRuntimeContext = getRuntimeContext(),
): PersonaActivationState {
  const traits = loadPersonaTraits(avatarId);
  const config = loadPersonaAdvancedConfig(avatarId);
  const traitById = new Map(traits.map(t => [t.id, t]));

  const matchedRuleIds: string[] = [];
  const effectiveTraitIds = new Set<string>();

  for (const trait of traits) {
    if (trait.enabled) {
      effectiveTraitIds.add(trait.id);
    }
  }

  for (const rule of config.rules) {
    if (!isRuleMatched(rule, context)) {
      continue;
    }
    const validTraitIds = rule.traitIds.filter(traitId => traitById.has(traitId));
    if (validTraitIds.length === 0) {
      continue;
    }
    matchedRuleIds.push(rule.id);
    for (const traitId of validTraitIds) {
      if (traitById.has(traitId)) {
        effectiveTraitIds.add(traitId);
      }
    }
  }

  return {
    effectiveTraitIds: Array.from(effectiveTraitIds),
    activeProfileIds: [],
    matchedRuleIds,
  };
}

function getPersonaPlusAppliedStorageKey(_avatarId: string): string {
  return `${PERSONA_PLUS_APPLIED_STORAGE_PREFIX}global`;
}

function loadPersonaPlusAppliedState(avatarId: string): PersonaPlusAppliedState {
  if (!avatarId) {
    return getDefaultPlusAppliedState();
  }

  try {
    const raw = localStorage.getItem(getPersonaPlusAppliedStorageKey(avatarId));
    if (!raw) {
      return getDefaultPlusAppliedState();
    }

    const parsed = JSON.parse(raw) as Partial<PersonaPlusAppliedState>;
    return {
      userPersonaAvatarId: ensureString(parsed.userPersonaAvatarId).trim() || undefined,
      userPersonaProfileId: ensureString(parsed.userPersonaProfileId).trim() || undefined,
      userPersonaEnabledTraitIds: normalizeOptionalStringArrayField(parsed as object, 'userPersonaEnabledTraitIds'),
      connectionProfileName: ensureString(parsed.connectionProfileName).trim() || undefined,
      connectionProfileBaseline:
        parsed.connectionProfileBaseline === null
          ? null
          : ensureString(parsed.connectionProfileBaseline).trim() || undefined,
      presetName: ensureString(parsed.presetName).trim() || undefined,
      presetEnabledPromptIds: normalizeOptionalStringArrayField(parsed as object, 'presetEnabledPromptIds'),
      scripts: {
        global: uniqueStrings(parsed.scripts?.global),
        preset: uniqueStrings(parsed.scripts?.preset),
        character: uniqueStrings(parsed.scripts?.character),
      },
      regexes: {
        global: uniqueStrings(parsed.regexes?.global),
        preset: uniqueStrings(parsed.regexes?.preset),
        character: uniqueStrings(parsed.regexes?.character),
      },
      worldbooks: {
        global: uniqueStrings(parsed.worldbooks?.global),
        characterPrimary: ensureString(parsed.worldbooks?.characterPrimary).trim() || undefined,
        characterAdditional: uniqueStrings(parsed.worldbooks?.characterAdditional),
        chat: ensureString(parsed.worldbooks?.chat).trim() || undefined,
      },
      worldbookEntries: normalizePlusBindingWorldbookEntries(parsed.worldbookEntries),
      extensions: normalizePlusExtensionBindings(parsed.extensions),
      personaTraitBaselines: clonePersonaTraitBaselines(
        parsed.personaTraitBaselines as Record<string, string[]> | undefined,
      ),
      presetPromptBaselines: cloneStringArrayRecord(
        parsed.presetPromptBaselines as Record<string, string[]> | undefined,
      ),
      worldbookEntryBaselines: cloneNumberArrayRecord(
        parsed.worldbookEntryBaselines as Record<string, number[]> | undefined,
      ),
    };
  } catch (error) {
    console.warn('用户设定脚本: 读取 Plus 绑定应用状态失败', error);
    return getDefaultPlusAppliedState();
  }
}

function savePersonaPlusAppliedState(avatarId: string, state: PersonaPlusAppliedState): boolean {
  if (!avatarId) {
    return false;
  }

  try {
    localStorage.setItem(getPersonaPlusAppliedStorageKey(avatarId), JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn('用户设定脚本: 保存 Plus 绑定应用状态失败', error);
    return false;
  }
}

function isSamePlusAppliedTarget(left: PersonaPlusAppliedState, right: PersonaPlusAppliedState): boolean {
  return (
    left.userPersonaAvatarId === right.userPersonaAvatarId &&
    left.userPersonaProfileId === right.userPersonaProfileId &&
    areOptionalStringArraysEqual(left.userPersonaEnabledTraitIds, right.userPersonaEnabledTraitIds) &&
    left.connectionProfileName === right.connectionProfileName &&
    left.presetName === right.presetName &&
    areOptionalStringArraysEqual(left.presetEnabledPromptIds, right.presetEnabledPromptIds) &&
    JSON.stringify(left.scripts) === JSON.stringify(right.scripts) &&
    JSON.stringify(left.regexes) === JSON.stringify(right.regexes) &&
    JSON.stringify(left.worldbooks) === JSON.stringify(right.worldbooks) &&
    JSON.stringify(left.worldbookEntries) === JSON.stringify(right.worldbookEntries) &&
    JSON.stringify(left.extensions) === JSON.stringify(right.extensions)
  );
}

function applyPersonaTraitEnabledSnapshot(avatarId: string, enabledTraitIds: string[]): boolean {
  if (!avatarId) {
    return false;
  }

  const traits = loadPersonaTraits(avatarId);
  if (traits.length === 0) {
    return false;
  }

  const enabledSet = new Set(uniqueStrings(enabledTraitIds));
  let changed = false;
  const updatedTraits = traits.map(trait => {
    const nextEnabled = enabledSet.has(trait.id);
    if (trait.enabled === nextEnabled) {
      return trait;
    }
    changed = true;
    return {
      ...trait,
      enabled: nextEnabled,
      updatedAt: Date.now(),
    };
  });

  if (!changed) {
    return false;
  }
  return savePersonaTraits(avatarId, updatedTraits);
}

function getPersonaRestoreTraitIds(avatarId: string, baselines: Record<string, string[]>): string[] | undefined {
  const savedDefaultTraitIds = getPersonaDefaultEnabledTraitIds(avatarId);
  if (savedDefaultTraitIds !== undefined) {
    return savedDefaultTraitIds;
  }
  return hasOwn(baselines, avatarId) ? uniqueStrings(baselines[avatarId]) : undefined;
}

function mergeContextWorldbookEntries(
  currentEntries: PersonaPlusBindingWorldbookEntry[],
  nextEntries: PersonaPlusBindingWorldbookEntry[],
): PersonaPlusBindingWorldbookEntry[] {
  const normalizedCurrent = normalizePlusBindingWorldbookEntries(currentEntries);
  const normalizedNext = normalizePlusBindingWorldbookEntries(nextEntries);
  if (normalizedNext.length === 0) {
    return normalizedCurrent;
  }

  const overriddenWorldbookNames = new Set(normalizedNext.map(entry => entry.worldbookName));
  return normalizePlusBindingWorldbookEntries([
    ...normalizedCurrent.filter(entry => !overriddenWorldbookNames.has(entry.worldbookName)),
    ...normalizedNext,
  ]);
}

export function getActivePersonaProfiles(
  avatarId: string,
  context: PersonaRuntimeContext = getRuntimeContext(),
): PersonaProfile[] {
  const activation = getPersonaActivationState(avatarId, context);
  const activeProfileIdSet = new Set(activation.activeProfileIds);
  return loadPersonaAdvancedConfig(avatarId).profiles.filter(profile => activeProfileIdSet.has(profile.id));
}

function mergeContextBindingResources(
  base: PersonaContextBindingResources,
  next?: PersonaContextBindingResources,
): PersonaContextBindingResources {
  if (!next) {
    return base;
  }

  const merged: PersonaContextBindingResources = {
    userPersonaAvatarId: next.userPersonaAvatarId || base.userPersonaAvatarId,
    userPersonaProfileId: undefined,
    userPersonaEnabledTraitIds: next.userPersonaAvatarId
      ? next.userPersonaEnabledTraitIds
      : base.userPersonaEnabledTraitIds,
    connectionProfileName: next.connectionProfileName || base.connectionProfileName,
    presetEnabledPromptIds: next.presetName ? next.presetEnabledPromptIds : base.presetEnabledPromptIds,
    presetName: next.presetName || base.presetName,
    scripts: {
      global: uniqueStrings([...(base.scripts?.global || []), ...(next.scripts?.global || [])]),
      preset: uniqueStrings([...(base.scripts?.preset || []), ...(next.scripts?.preset || [])]),
      character: uniqueStrings([...(base.scripts?.character || []), ...(next.scripts?.character || [])]),
    },
    regexes: {
      global: uniqueStrings([...(base.regexes?.global || []), ...(next.regexes?.global || [])]),
      preset: uniqueStrings([...(base.regexes?.preset || []), ...(next.regexes?.preset || [])]),
      character: uniqueStrings([...(base.regexes?.character || []), ...(next.regexes?.character || [])]),
    },
    worldbooks: {
      global: uniqueStrings([...(base.worldbooks?.global || []), ...(next.worldbooks?.global || [])]),
      characterPrimary: next.worldbooks?.characterPrimary || base.worldbooks?.characterPrimary,
      characterAdditional: uniqueStrings([
        ...(base.worldbooks?.characterAdditional || []),
        ...(next.worldbooks?.characterAdditional || []),
      ]),
      chat: next.worldbooks?.chat || base.worldbooks?.chat,
    },
    worldbookEntries: mergeContextWorldbookEntries(base.worldbookEntries || [], next.worldbookEntries || []),
    extensions: normalizePlusExtensionBindings([...(base.extensions || []), ...(next.extensions || [])]),
  };

  return normalizeContextBindingResources(merged);
}

export function mergeBindingGroupResources(
  base: PersonaContextBindingResources,
  next?: PersonaContextBindingResources,
): PersonaContextBindingResources {
  return mergeContextBindingResources(base, next);
}

function buildDesiredPlusAppliedState(
  _avatarId: string,
  context: PersonaRuntimeContext = getRuntimeContext(),
): PersonaPlusAppliedState {
  const desired = getDefaultPlusAppliedState();
  const bindings = loadContextBindings();
  const characterBinding = findContextBinding('character', context, bindings);
  const chatBinding = findContextBinding('chat', context, bindings);
  const merged = mergeContextBindingResources(
    normalizeContextBindingResources(characterBinding?.resources),
    chatBinding?.resources,
  );

  desired.userPersonaAvatarId = merged.userPersonaAvatarId;
  desired.userPersonaProfileId = undefined;
  desired.userPersonaEnabledTraitIds = merged.userPersonaAvatarId ? merged.userPersonaEnabledTraitIds : undefined;
  desired.connectionProfileName = ensureString(merged.connectionProfileName).trim() || undefined;
  desired.presetName = merged.presetName || getDefaultPresetName() || getLoadedPresetName() || undefined;
  desired.presetEnabledPromptIds = merged.presetName ? merged.presetEnabledPromptIds : undefined;
  desired.scripts.global = uniqueStrings(merged.scripts?.global);
  desired.scripts.preset = uniqueStrings(merged.scripts?.preset);
  desired.scripts.character = uniqueStrings(merged.scripts?.character);
  desired.regexes.global = uniqueStrings(merged.regexes?.global);
  desired.regexes.preset = uniqueStrings(merged.regexes?.preset);
  desired.regexes.character = uniqueStrings(merged.regexes?.character);
  desired.worldbooks.global = uniqueStrings(merged.worldbooks?.global);
  desired.worldbooks.characterPrimary = ensureString(merged.worldbooks?.characterPrimary).trim() || undefined;
  desired.worldbooks.characterAdditional = uniqueStrings(merged.worldbooks?.characterAdditional);
  desired.worldbooks.chat = ensureString(merged.worldbooks?.chat).trim() || undefined;
  desired.worldbookEntries = normalizePlusBindingWorldbookEntries(merged.worldbookEntries);
  desired.extensions = normalizePlusExtensionBindings(merged.extensions);

  return desired;
}

export function summarizePersonaPlusBinding(binding?: PersonaPlusBindingConfig): string {
  const normalized = normalizePlusBindingConfig(binding);
  if (!normalized) {
    return '无 Plus 绑定';
  }

  const summaryParts: string[] = [];
  if (normalized.connectionProfileName) {
    summaryParts.push(`连接:${normalized.connectionProfileName}`);
  }
  if (normalized.presetName) {
    summaryParts.push(`预设:${normalized.presetName}`);
  }

  const scriptCount =
    (normalized.scripts?.global?.length || 0) +
    (normalized.scripts?.preset?.length || 0) +
    (normalized.scripts?.character?.length || 0);
  if (scriptCount > 0) {
    summaryParts.push(`脚本:${scriptCount}`);
  }

  const regexCount =
    (normalized.regexes?.global?.length || 0) +
    (normalized.regexes?.preset?.length || 0) +
    (normalized.regexes?.character?.length || 0);
  if (regexCount > 0) {
    summaryParts.push(`正则:${regexCount}`);
  }

  const worldbookCount =
    (normalized.worldbooks?.global?.length || 0) +
    (normalized.worldbooks?.characterPrimary ? 1 : 0) +
    (normalized.worldbooks?.characterAdditional?.length || 0) +
    (normalized.worldbooks?.chat ? 1 : 0);
  if (worldbookCount > 0) {
    summaryParts.push(`世界书:${worldbookCount}`);
  }

  if (normalized.worldbookEntries?.length) {
    summaryParts.push(`条目:${normalized.worldbookEntries.length}`);
  }

  if (normalized.extensions?.length) {
    summaryParts.push(`插件:${normalized.extensions.length}`);
  }

  return summaryParts.join(' | ') || '无 Plus 绑定';
}

export function summarizeContextBindingResources(resources?: PersonaContextBindingResources): string {
  const hasResourceContainer = Boolean(resources && typeof resources === 'object');
  const normalized = normalizeContextBindingResources(resources);
  const summaryParts: string[] = [];

  if (normalized.userPersonaAvatarId) {
    const persona = findPersonaByAvatarId(normalized.userPersonaAvatarId);
    const personaName = persona?.name || normalized.userPersonaAvatarId;
    summaryParts.push(`user人设:${personaName}`);
    if (normalized.userPersonaEnabledTraitIds !== undefined) {
      summaryParts.push(`条目:${normalized.userPersonaEnabledTraitIds.length}条`);
    }
  }

  if (normalized.presetName && normalized.presetEnabledPromptIds !== undefined) {
    summaryParts.push(`预设条目:${normalized.presetEnabledPromptIds.length}条`);
  }

  const worldbookEntryWorldbookNames = uniqueStrings(normalized.worldbookEntries?.map(entry => entry.worldbookName));
  if (worldbookEntryWorldbookNames.length > 0) {
    const enabledEntryCount = uniqueNumbers(
      normalized.worldbookEntries?.filter(entry => entry.enabled !== false).flatMap(entry => entry.entryUids) || [],
    ).length;
    summaryParts.push(`世界书条目:${worldbookEntryWorldbookNames.join('、')} / ${enabledEntryCount}条`);
  }

  const plusSummary = summarizePersonaPlusBinding(normalized);
  if (plusSummary !== '无 Plus 绑定') {
    summaryParts.push(plusSummary);
  }

  return summaryParts.join(' | ') || (hasResourceContainer ? '空绑定' : '未绑定');
}

type NamedOption = {
  id: string;
  label: string;
};

const CONNECTION_PROFILE_CACHE_TTL_MS = 5000;
let connectionProfileCatalogCache: NamedOption[] = [];
let connectionProfileCatalogPending: Promise<NamedOption[]> | null = null;
let currentConnectionProfileCache: { value?: string; loadedAt: number } = {
  value: undefined,
  loadedAt: 0,
};

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'") || (first === '`' && last === '`')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeConnectionProfileName(value: unknown): string | undefined {
  const normalized = stripWrappingQuotes(ensureStringLike(value)).trim();
  if (!normalized) {
    return undefined;
  }

  const lowered = normalized.toLowerCase();
  if (
    [
      '<none>',
      'none',
      '(none)',
      'null',
      'undefined',
      'no profile',
      '未绑定',
      '未设置',
      '未选择',
      '无',
    ].includes(lowered)
  ) {
    return undefined;
  }

  return normalized;
}

function parseConnectionProfileListResult(raw: string): string[] {
  const trimmed = ensureString(raw).trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return uniqueStrings(parsed.map(item => normalizeConnectionProfileName(item)).filter(Boolean));
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const candidateKeys = ['profiles', 'names', 'list', 'items', 'data'];
      for (const key of candidateKeys) {
        if (Array.isArray(record[key])) {
          return uniqueStrings(
            safeArray<unknown>(record[key])
              .map(item => normalizeConnectionProfileName(item))
              .filter(Boolean),
          );
        }
      }
    }
  } catch {
    // noop
  }

  return uniqueStrings(
    trimmed
      .split(/[\r\n,]+/)
      .map(line =>
        normalizeConnectionProfileName(
          line
            .replace(/^[\s\-*•]+/, '')
            .replace(/^\d+\.\s*/, '')
            .trim(),
        ),
      )
      .filter(Boolean),
  );
}

function parseCurrentConnectionProfileResult(raw: string): string | undefined {
  const trimmed = ensureString(raw).trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string' || parsed === null) {
      return normalizeConnectionProfileName(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const candidateKeys = ['name', 'profile', 'current', 'selected', 'value'];
      for (const key of candidateKeys) {
        const value = normalizeConnectionProfileName(record[key]);
        if (value !== undefined) {
          return value;
        }
      }
    }
  } catch {
    // noop
  }

  const firstLine = trimmed.split(/\r?\n/).map(line => line.trim()).find(Boolean) || trimmed;
  const matched =
    firstLine.match(/^(?:current|selected)?\s*profile\s*:?\s*(.+)$/i) ||
    firstLine.match(/^(?:current|selected)\s*:\s*(.+)$/i);
  return normalizeConnectionProfileName(matched ? matched[1] : firstLine);
}

function summarizeProbeText(raw: string, maxLength: number = 120): string {
  const normalized = ensureString(raw).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '空返回';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function formatJsonLikeText(raw: string): string {
  const normalized = ensureString(raw).trim();
  if (!normalized) {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(normalized), null, 2);
  } catch {
    return normalized;
  }
}

function parseSlashApiName(raw: string): string | undefined {
  const firstLine = ensureString(raw).split(/\r?\n/).map(line => line.trim()).find(Boolean) || ensureString(raw).trim();
  if (!firstLine) {
    return undefined;
  }
  const matched =
    firstLine.match(/^(?:current\s+)?api\s*:?\s*(.+)$/i) || firstLine.match(/^(?:source|main_api)\s*:?\s*(.+)$/i);
  const candidate = stripWrappingQuotes(matched ? matched[1] : firstLine).trim();
  return candidate || undefined;
}

function parseSlashModelName(raw: string): string | undefined {
  const firstLine = ensureString(raw).split(/\r?\n/).map(line => line.trim()).find(Boolean) || ensureString(raw).trim();
  if (!firstLine) {
    return undefined;
  }
  const matched =
    firstLine.match(/^(?:current\s+)?model\s*:?\s*(.+)$/i) || firstLine.match(/^(?:name)\s*:?\s*(.+)$/i);
  const candidate = stripWrappingQuotes(matched ? matched[1] : firstLine).trim();
  return candidate || undefined;
}

function updateConnectionProfileCatalogCache(profileNames: string[]): NamedOption[] {
  const next = uniqueStrings(profileNames)
    .map(name => normalizeConnectionProfileName(name))
    .filter((name): name is string => Boolean(name))
    .sort((left, right) => left.localeCompare(right))
    .map(name => ({ id: name, label: name }));
  connectionProfileCatalogCache = next;
  return connectionProfileCatalogCache;
}

function quoteSlashCommandArgument(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function readCurrentConnectionProfileName(forceRefresh: boolean = false): Promise<string | undefined> {
  const now = Date.now();
  if (!forceRefresh && now - currentConnectionProfileCache.loadedAt < CONNECTION_PROFILE_CACHE_TTL_MS) {
    return currentConnectionProfileCache.value;
  }

  const currentProfile = parseCurrentConnectionProfileResult(await triggerSlash('/profile'));
  currentConnectionProfileCache = {
    value: currentProfile,
    loadedAt: Date.now(),
  };
  return currentProfile;
}

export function getCachedCurrentConnectionProfileName(): string | undefined {
  return currentConnectionProfileCache.value;
}

export async function getApiConnectionDisplayState(profileName?: string): Promise<{
  currentProfile?: string;
  currentProfileError?: string;
  currentApi?: string;
  currentApiError?: string;
  currentModel?: string;
  currentModelError?: string;
  detailProfileName?: string;
  detailProfileRaw?: string;
  detailProfileFormatted?: string;
  detailProfileError?: string;
}> {
  const result: {
    currentProfile?: string;
    currentProfileError?: string;
    currentApi?: string;
    currentApiError?: string;
    currentModel?: string;
    currentModelError?: string;
    detailProfileName?: string;
    detailProfileRaw?: string;
    detailProfileFormatted?: string;
    detailProfileError?: string;
  } = {};

  const [currentProfileResult, currentApiResult, currentModelResult] = await Promise.allSettled([
    readCurrentConnectionProfileName(true),
    triggerSlash('/api'),
    triggerSlash('/model'),
  ]);

  if (currentProfileResult.status === 'fulfilled') {
    result.currentProfile = currentProfileResult.value;
  } else {
    result.currentProfileError = formatProbeError(currentProfileResult.reason);
  }

  if (currentApiResult.status === 'fulfilled') {
    result.currentApi = parseSlashApiName(currentApiResult.value) || summarizeProbeText(currentApiResult.value);
  } else {
    result.currentApiError = formatProbeError(currentApiResult.reason);
  }

  if (currentModelResult.status === 'fulfilled') {
    result.currentModel = parseSlashModelName(currentModelResult.value) || summarizeProbeText(currentModelResult.value);
  } else {
    result.currentModelError = formatProbeError(currentModelResult.reason);
  }

  const detailProfileName = normalizeConnectionProfileName(profileName) || result.currentProfile;
  result.detailProfileName = detailProfileName;
  if (!detailProfileName) {
    return result;
  }

  try {
    const profileGetResult = await triggerSlash(`/profile-get ${quoteSlashCommandArgument(detailProfileName)}`);
    result.detailProfileRaw = ensureString(profileGetResult).trim();
    result.detailProfileFormatted = formatJsonLikeText(profileGetResult);
  } catch (error) {
    result.detailProfileError = formatProbeError(error);
  }

  return result;
}

function createApiConfigTestItem(
  key: string,
  label: string,
  ok: boolean,
  detail: string,
  options: {
    rawContent?: string;
    rawContentLabel?: string;
  } = {},
): PersonaPlusApiConfigTestItem {
  return {
    key,
    label,
    ok,
    detail,
    rawContent: options.rawContent,
    rawContentLabel: options.rawContentLabel,
  };
}

export async function refreshConnectionProfileCatalog(forceProfileRefresh: boolean = true): Promise<NamedOption[]> {
  if (connectionProfileCatalogPending) {
    return connectionProfileCatalogPending;
  }

  connectionProfileCatalogPending = (async () => {
    const currentProfile = forceProfileRefresh
      ? await readCurrentConnectionProfileName(true)
      : getCachedCurrentConnectionProfileName();
    const listedProfiles = parseConnectionProfileListResult(await triggerSlash('/profile-list'));
    const boundProfiles = uniqueStrings(loadContextBindings().map(binding => binding.resources.connectionProfileName));
    return updateConnectionProfileCatalogCache([...(currentProfile ? [currentProfile] : []), ...listedProfiles, ...boundProfiles]);
  })();

  try {
    return await connectionProfileCatalogPending;
  } finally {
    connectionProfileCatalogPending = null;
  }
}

async function applyConnectionProfileSelection(profileName?: string): Promise<boolean> {
  const normalizedProfileName = normalizeConnectionProfileName(profileName);
  const currentProfile = await readCurrentConnectionProfileName(true);
  if (currentProfile === normalizedProfileName) {
    return false;
  }

  await triggerSlash(
    normalizedProfileName ? `/profile ${quoteSlashCommandArgument(normalizedProfileName)}` : '/profile <None>',
  );
  currentConnectionProfileCache = {
    value: normalizedProfileName,
    loadedAt: Date.now(),
  };
  updateConnectionProfileCatalogCache([
    ...connectionProfileCatalogCache.map(item => item.id),
    ...(normalizedProfileName ? [normalizedProfileName] : []),
  ]);
  return true;
}

function flattenScriptTreeOptions(nodes: ScriptTree[], prefix: string = ''): NamedOption[] {
  const result: NamedOption[] = [];
  for (const node of nodes) {
    if (node.type === 'folder') {
      result.push(...flattenScriptTreeOptions(node.scripts, `${prefix}${node.name} / `));
    } else {
      result.push({
        id: node.id,
        label: `${prefix}${node.name}${node.enabled ? ' [on]' : ''}`,
      });
    }
  }
  return result;
}

export function getPlusBindingCatalog(): {
  connectionProfiles: NamedOption[];
  presets: NamedOption[];
  scripts: {
    global: NamedOption[];
    preset: NamedOption[];
    character: NamedOption[];
  };
  regexes: {
    global: NamedOption[];
    preset: NamedOption[];
    character: NamedOption[];
  };
  worldbooks: NamedOption[];
  extensions: NamedOption[];
} {
  const extensionSettingsRoot =
    ((window.parent as Window & typeof globalThis & { SillyTavern?: { extensionSettings?: Record<string, unknown> } })
      .SillyTavern?.extensionSettings as Record<string, unknown> | undefined) ||
    (SillyTavern?.extensionSettings as Record<string, unknown> | undefined) ||
    {};
  const boundConnectionProfiles = uniqueStrings(loadContextBindings().map(binding => binding.resources.connectionProfileName));
  let savedPresetNames: string[] = [];
  try {
    savedPresetNames = uniqueStrings(getPresetNames());
  } catch (error) {
    console.warn('绑定plus: 读取预设目录失败', error);
  }
  const savedPresetNameSet = new Set(savedPresetNames);
  let loadedPresetName = '';
  try {
    loadedPresetName = ensureString(getLoadedPresetName()).trim();
  } catch (error) {
    console.warn('绑定plus: 读取当前加载预设名失败', error);
  }
  const referencedPresetNames = uniqueStrings([
    getDefaultPresetName(),
    ...loadContextBindings().map(binding => binding.resources.presetName),
    ...loadBindingGroups().map(group => group.resources.presetName),
  ]);
  const presetNames = uniqueStrings([loadedPresetName, ...savedPresetNames, ...referencedPresetNames]);

  return {
    connectionProfiles: updateConnectionProfileCatalogCache([
      ...connectionProfileCatalogCache.map(item => item.id),
      ...boundConnectionProfiles,
    ]),
    presets: presetNames.map(name => ({
      id: name,
      label: savedPresetNameSet.has(name) ? name : loadedPresetName === name ? `${name}（当前未保存）` : `${name}（缺失）`,
    })),
    scripts: {
      global: flattenScriptTreeOptions(getScriptTrees({ type: 'global' })),
      preset: flattenScriptTreeOptions(getScriptTrees({ type: 'preset' })),
      character: flattenScriptTreeOptions(getScriptTrees({ type: 'character' })),
    },
    regexes: {
      global: getTavernRegexes({ type: 'global' }).map(regex => ({ id: regex.id, label: regex.script_name })),
      preset: getTavernRegexes({ type: 'preset', name: 'in_use' }).map(regex => ({
        id: regex.id,
        label: regex.script_name,
      })),
      character: getTavernRegexes({ type: 'character', name: 'current' }).map(regex => ({
        id: regex.id,
        label: regex.script_name,
      })),
    },
    worldbooks: getWorldbookNames().map(name => ({ id: name, label: name })),
    extensions: Object.keys(extensionSettingsRoot)
      .sort((a, b) => a.localeCompare(b))
      .map(key => ({ id: key, label: key })),
  };
}

export async function getWorldbookEntryCatalog(worldbookName: string): Promise<
  Array<{
    uid: number;
    label: string;
    enabled: boolean;
    comment: string;
    content: string;
    keys: string[];
    secondaryKeys: string[];
  }>
> {
  const name = ensureString(worldbookName).trim();
  if (!name) {
    return [];
  }
  const worldbook = await getWorldbook(name);
  return (Array.isArray(worldbook) ? worldbook : []).map(entry => ({
    uid: entry.uid,
    label: entry.name || `uid:${entry.uid}`,
    enabled: entry.enabled,
    comment: ensureString((entry as { comment?: string }).comment ?? entry.name).trim(),
    content: ensureString(entry.content).trim(),
    keys: uniqueStrings(entry.strategy?.keys),
    secondaryKeys: uniqueStrings(entry.strategy?.keys_secondary?.keys),
  }));
}

function deepMergeRecords(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = result[key];
    if (
      patchValue &&
      typeof patchValue === 'object' &&
      !Array.isArray(patchValue) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMergeRecords(baseValue as Record<string, unknown>, patchValue as Record<string, unknown>);
    } else {
      result[key] = patchValue;
    }
  }
  return result;
}

async function applyManagedExtensionSettings(
  desiredExtensions: PersonaPlusExtensionSettingBinding[],
  previousExtensions: PersonaPlusExtensionSettingBinding[],
): Promise<boolean> {
  const managedExtensionIds = uniqueStrings([
    ...desiredExtensions.map(item => item.extensionId),
    ...previousExtensions.map(item => item.extensionId),
  ]);
  if (managedExtensionIds.length === 0) {
    return false;
  }

  const parentWindow = window.parent as Window &
    typeof globalThis & {
      SillyTavern?: {
        extensionSettings?: Record<string, unknown>;
        saveSettingsDebounced?: () => Promise<void> | void;
      };
    };
  const extensionSettingsRoot =
    parentWindow.SillyTavern?.extensionSettings ||
    (SillyTavern?.extensionSettings as Record<string, unknown> | undefined);
  if (!extensionSettingsRoot) {
    console.warn('用户设定脚本: extensionSettings 不可用，跳过插件设置绑定');
    return false;
  }

  const previousMap = new Map(previousExtensions.map(item => [item.extensionId, item.settingsPatch]));
  const desiredMap = new Map(desiredExtensions.map(item => [item.extensionId, item.settingsPatch]));

  for (const extensionId of managedExtensionIds) {
    const currentValue =
      extensionSettingsRoot[extensionId] && typeof extensionSettingsRoot[extensionId] === 'object'
        ? (extensionSettingsRoot[extensionId] as Record<string, unknown>)
        : {};
    const desiredPatch = desiredMap.get(extensionId);
    if (desiredPatch) {
      extensionSettingsRoot[extensionId] = deepMergeRecords(currentValue, desiredPatch);
    } else if (previousMap.has(extensionId)) {
      console.info(`用户设定脚本: 插件 ${extensionId} 先前受 Persona 管理，但当前无新 patch，保留现值`);
    }
  }

  if (typeof parentWindow.SillyTavern?.saveSettingsDebounced === 'function') {
    await parentWindow.SillyTavern.saveSettingsDebounced();
  } else if (typeof SillyTavern?.saveSettingsDebounced === 'function') {
    await SillyTavern.saveSettingsDebounced();
  }

  if (typeof eventEmit === 'function' && typeof tavern_events !== 'undefined') {
    await eventEmit(tavern_events.SETTINGS_UPDATED);
  }

  return true;
}

function patchScriptTreesManaged(nodes: ScriptTree[], managedIds: Set<string>, desiredIds: Set<string>): ScriptTree[] {
  return nodes.map(node => {
    if (node.type === 'folder') {
      return {
        ...node,
        enabled: managedIds.has(node.id) ? desiredIds.has(node.id) : node.enabled,
        scripts: patchScriptTreesManaged(node.scripts, managedIds, desiredIds) as Script[],
      };
    }

    return {
      ...node,
      enabled: managedIds.has(node.id) ? desiredIds.has(node.id) : node.enabled,
    };
  });
}

async function applyManagedScriptScope(
  scope: 'global' | 'preset' | 'character',
  desiredIds: string[],
  previousIds: string[],
): Promise<boolean> {
  const managedIds = new Set(uniqueStrings([...desiredIds, ...previousIds]));
  if (managedIds.size === 0) {
    return false;
  }

  const desiredIdSet = new Set(desiredIds);
  await updateScriptTreesWith(trees => patchScriptTreesManaged(trees, managedIds, desiredIdSet), { type: scope });
  return true;
}

async function applyManagedRegexScope(
  option: { type: 'global' } | { type: 'preset'; name: 'in_use' } | { type: 'character'; name: 'current' },
  desiredIds: string[],
  previousIds: string[],
): Promise<boolean> {
  const managedIds = new Set(uniqueStrings([...desiredIds, ...previousIds]));
  if (managedIds.size === 0) {
    return false;
  }

  const desiredIdSet = new Set(desiredIds);
  await updateTavernRegexesWith(
    regexes =>
      regexes.map(regex =>
        managedIds.has(regex.id)
          ? {
              ...regex,
              enabled: desiredIdSet.has(regex.id),
            }
          : regex,
      ),
    option,
  );
  return true;
}

async function applyManagedGlobalWorldbooks(desiredNames: string[], previousNames: string[]): Promise<boolean> {
  const managedNames = uniqueStrings([...desiredNames, ...previousNames]);
  if (managedNames.length === 0) {
    return false;
  }

  const managedNameSet = new Set(managedNames);
  const currentGlobalNames = getGlobalWorldbookNames();
  const nextNames = uniqueStrings([...currentGlobalNames.filter(name => !managedNameSet.has(name)), ...desiredNames]);
  await rebindGlobalWorldbooks(nextNames);
  return true;
}

async function applyManagedCharacterWorldbooks(
  desired: PersonaPlusAppliedState['worldbooks'],
  previous: PersonaPlusAppliedState['worldbooks'],
): Promise<boolean> {
  const managedAdditionalNames = uniqueStrings([
    ...(desired.characterAdditional || []),
    ...(previous.characterAdditional || []),
  ]);
  const shouldTouchPrimary = Boolean(desired.characterPrimary || previous.characterPrimary);
  if (!shouldTouchPrimary && managedAdditionalNames.length === 0) {
    return false;
  }

  const currentWorldbooks = getCharWorldbookNames('current');
  const managedAdditionalSet = new Set(managedAdditionalNames);
  const nextAdditional = uniqueStrings([
    ...currentWorldbooks.additional.filter(name => !managedAdditionalSet.has(name)),
    ...(desired.characterAdditional || []),
  ]);

  let nextPrimary = currentWorldbooks.primary;
  if (desired.characterPrimary) {
    nextPrimary = desired.characterPrimary;
  } else if (previous.characterPrimary && currentWorldbooks.primary === previous.characterPrimary) {
    nextPrimary = null;
  }

  await rebindCharWorldbooks('current', {
    primary: nextPrimary,
    additional: nextAdditional,
  });
  return true;
}

async function applyManagedChatWorldbook(
  desiredChatWorldbook: string | undefined,
  previousChatWorldbook: string | undefined,
): Promise<boolean> {
  if (!desiredChatWorldbook && !previousChatWorldbook) {
    return false;
  }

  const currentChatWorldbook = getChatWorldbookName('current');
  if (!desiredChatWorldbook && previousChatWorldbook && currentChatWorldbook !== previousChatWorldbook) {
    return false;
  }

  await rebindChatWorldbook('current', desiredChatWorldbook || '');
  return true;
}

export async function applyPresetPromptEnabledSnapshot(
  presetName: string,
  enabledPromptIds: string[],
): Promise<boolean> {
  const normalizedPresetName = ensureString(presetName).trim();
  if (!normalizedPresetName) {
    return false;
  }

  const loadedPresetName = ensureString(getLoadedPresetName()).trim();
  if (loadedPresetName !== normalizedPresetName) {
    return false;
  }

  const enabledIdSet = new Set(uniqueStrings(enabledPromptIds));
  let changed = false;

  await updatePresetWith(
    'in_use',
    preset => {
      const currentPrompts = safeArray<PresetPrompt>(preset.prompts);
      const currentUnusedPrompts = safeArray<PresetPrompt>(preset.prompts_unused);
      const nextPrompts = currentPrompts.map(prompt => ({
        ...prompt,
        enabled: enabledIdSet.has(getPresetPromptStableId(prompt)),
      }));
      const nextUnusedPrompts = currentUnusedPrompts.map(prompt => ({
        ...prompt,
      }));

      const currentPromptIds = currentPrompts.map(prompt => getPresetPromptStableId(prompt));
      const currentUnusedPromptIds = currentUnusedPrompts.map(prompt => getPresetPromptStableId(prompt));
      const nextPromptIds = nextPrompts.map(prompt => getPresetPromptStableId(prompt));
      const nextUnusedPromptIds = nextUnusedPrompts.map(prompt => getPresetPromptStableId(prompt));
      const currentEnabledIds = getEnabledPresetPromptIdsFromPreset(preset);
      if (
        !areOptionalStringArraysEqual(currentEnabledIds, Array.from(enabledIdSet)) ||
        JSON.stringify(currentPromptIds) !== JSON.stringify(nextPromptIds) ||
        JSON.stringify(currentUnusedPromptIds) !== JSON.stringify(nextUnusedPromptIds)
      ) {
        changed = true;
      }

      return {
        ...preset,
        prompts: nextPrompts,
        prompts_unused: nextUnusedPrompts,
      };
    },
    { render: 'immediate' },
  );

  return changed;
}

async function applyManagedConnectionProfile(
  desiredProfileName: string | undefined,
  previous: PersonaPlusAppliedState,
): Promise<{ changed: boolean; connectionProfileName?: string; connectionProfileBaseline?: string | null }> {
  const normalizedDesiredProfileName = normalizeConnectionProfileName(desiredProfileName);
  const previousProfileName = normalizeConnectionProfileName(previous.connectionProfileName);
  const hadPreviousManagedProfile = previousProfileName !== undefined;

  if (normalizedDesiredProfileName === undefined && !hadPreviousManagedProfile) {
    return {
      changed: false,
      connectionProfileName: undefined,
      connectionProfileBaseline: undefined,
    };
  }

  const currentProfileName = await readCurrentConnectionProfileName(true);
  const previousBaseline =
    previous.connectionProfileBaseline === null
      ? null
      : normalizeConnectionProfileName(previous.connectionProfileBaseline);
  const connectionProfileBaseline =
    normalizedDesiredProfileName !== undefined
      ? previousBaseline !== undefined
        ? previousBaseline
        : currentProfileName ?? null
      : undefined;
  const targetProfileName =
    normalizedDesiredProfileName !== undefined
      ? normalizedDesiredProfileName
      : previousBaseline === null
        ? undefined
        : previousBaseline;
  const changed = await applyConnectionProfileSelection(targetProfileName);

  return {
    changed,
    connectionProfileName: normalizedDesiredProfileName,
    connectionProfileBaseline,
  };
}

async function applyManagedPresetPromptSelection(
  desiredPresetName: string | undefined,
  desiredPromptIds: string[] | undefined,
  previous: PersonaPlusAppliedState,
): Promise<{
  changed: boolean;
  presetName?: string;
  presetEnabledPromptIds?: string[];
  presetPromptBaselines: Record<string, string[]>;
}> {
  let changed = false;
  const previousBaselines = cloneStringArrayRecord(previous.presetPromptBaselines);
  const loadedPresetName = ensureString(getLoadedPresetName()).trim();
  const resolvedPresetName =
    desiredPresetName && loadedPresetName === desiredPresetName
      ? desiredPresetName
      : loadedPresetName || desiredPresetName || undefined;

  if (!resolvedPresetName) {
    return {
      changed,
      presetName: desiredPresetName,
      presetEnabledPromptIds: desiredPromptIds,
      presetPromptBaselines: previousBaselines,
    };
  }

  const defaultPromptIds = loadDefaultPresetPromptIds(resolvedPresetName);
  const baselinePromptIds = hasOwn(previousBaselines, resolvedPresetName)
    ? uniqueStrings(previousBaselines[resolvedPresetName])
    : undefined;
  const shouldUseDesiredSnapshot = desiredPresetName === resolvedPresetName && desiredPromptIds !== undefined;
  const targetPromptIds = shouldUseDesiredSnapshot
    ? uniqueStrings(desiredPromptIds)
    : defaultPromptIds !== undefined
      ? uniqueStrings(defaultPromptIds)
      : baselinePromptIds;

  if (targetPromptIds === undefined) {
    return {
      changed,
      presetName: resolvedPresetName,
      presetEnabledPromptIds: undefined,
      presetPromptBaselines: previousBaselines,
    };
  }

  const nextBaselines = cloneStringArrayRecord(previousBaselines);
  if (!hasOwn(nextBaselines, resolvedPresetName)) {
    nextBaselines[resolvedPresetName] = getEnabledPresetPromptIdsFromPreset(getPreset('in_use'));
  }

  if (await applyPresetPromptEnabledSnapshot(resolvedPresetName, targetPromptIds)) {
    changed = true;
  }

  return {
    changed,
    presetName: resolvedPresetName,
    presetEnabledPromptIds: targetPromptIds,
    presetPromptBaselines: nextBaselines,
  };
}

function getActiveWorldbookNames(): string[] {
  const names = [
    ...getGlobalWorldbookNames(),
    getCharWorldbookNames('current').primary || '',
    ...(getCharWorldbookNames('current').additional || []),
    getChatWorldbookName('current') || '',
  ];
  return uniqueStrings(names);
}

async function applyWorldbookEnabledEntrySnapshot(worldbookName: string, enabledEntryUids: number[]): Promise<boolean> {
  const normalizedName = ensureString(worldbookName).trim();
  if (!normalizedName) {
    return false;
  }

  const enabledSet = new Set(uniqueNumbers(enabledEntryUids));
  let changed = false;
  await updateWorldbookWith(normalizedName, worldbook =>
    worldbook.map(entry => {
      const nextEnabled = enabledSet.has(entry.uid);
      if (entry.enabled !== nextEnabled) {
        changed = true;
        return {
          ...entry,
          enabled: nextEnabled,
        };
      }
      return entry;
    }),
  );
  return changed;
}

async function applyManagedWorldbookEntries(
  desiredEntries: PersonaPlusBindingWorldbookEntry[],
  previousEntries: PersonaPlusBindingWorldbookEntry[],
  previousBaselines: Record<string, number[]>,
): Promise<{ changed: boolean; worldbookEntryBaselines: Record<string, number[]> }> {
  const nextBaselines = cloneNumberArrayRecord(previousBaselines);
  const defaultSnapshotMap = loadDefaultWorldbookEntrySnapshotMap();
  const worldbookNames = uniqueStrings([
    ...desiredEntries.map(entry => entry.worldbookName),
    ...previousEntries.map(entry => entry.worldbookName),
    ...Object.keys(nextBaselines),
    ...getActiveWorldbookNames().filter(name => hasOwn(defaultSnapshotMap, name)),
  ]);
  if (worldbookNames.length === 0) {
    return {
      changed: false,
      worldbookEntryBaselines: {},
    };
  }

  let changed = false;
  for (const worldbookName of worldbookNames) {
    const hasDesiredSnapshot = hasWorldbookEntrySnapshot(desiredEntries, worldbookName);
    const desiredEnabledEntryUids = getBindingWorldbookEnabledEntryUids(desiredEntries, worldbookName);
    const defaultEnabledEntryUids = hasOwn(defaultSnapshotMap, worldbookName)
      ? uniqueNumbers(defaultSnapshotMap[worldbookName])
      : undefined;
    const baselineEntryUids = hasOwn(nextBaselines, worldbookName)
      ? uniqueNumbers(nextBaselines[worldbookName])
      : undefined;
    const targetEnabledEntryUids = hasDesiredSnapshot
      ? desiredEnabledEntryUids || []
      : defaultEnabledEntryUids !== undefined
        ? defaultEnabledEntryUids
        : baselineEntryUids;

    if (targetEnabledEntryUids === undefined) {
      continue;
    }

    if (!hasOwn(nextBaselines, worldbookName)) {
      try {
        const baselineEntries = await getWorldbook(worldbookName);
        nextBaselines[worldbookName] = getWorldbookEnabledEntryUids(
          Array.isArray(baselineEntries) ? baselineEntries : [],
        );
      } catch (error) {
        console.warn(`绑定plus: 读取世界书「${worldbookName}」条目基线失败`, error);
        nextBaselines[worldbookName] = [];
      }
    }

    if (await applyWorldbookEnabledEntrySnapshot(worldbookName, targetEnabledEntryUids)) {
      changed = true;
    }

    if (!hasDesiredSnapshot && defaultEnabledEntryUids === undefined) {
      delete nextBaselines[worldbookName];
    }
  }

  return {
    changed,
    worldbookEntryBaselines: nextBaselines,
  };
}

async function applyManagedUserPersonaSelection(
  desiredAvatarId: string | undefined,
  desiredTraitIds: string[] | undefined,
  previous: PersonaPlusAppliedState,
): Promise<{ changed: boolean; personaTraitBaselines: Record<string, string[]> }> {
  let changed = false;
  const baselines = clonePersonaTraitBaselines(previous.personaTraitBaselines);
  const desiredHasTraitSnapshot = desiredAvatarId !== undefined && desiredTraitIds !== undefined;

  if (desiredAvatarId && desiredHasTraitSnapshot && !hasOwn(baselines, desiredAvatarId)) {
    baselines[desiredAvatarId] = getEnabledTraitIdsFromTraits(loadPersonaTraits(desiredAvatarId));
  }

  if (desiredAvatarId && desiredTraitIds !== undefined) {
    if (applyPersonaTraitEnabledSnapshot(desiredAvatarId, desiredTraitIds)) {
      changed = true;
    }
  }

  const keptAvatarId = desiredHasTraitSnapshot ? desiredAvatarId : '';
  Object.keys(baselines).forEach(avatarId => {
    if (avatarId === keptAvatarId) {
      return;
    }
    const restoreTraitIds = getPersonaRestoreTraitIds(avatarId, baselines);
    if (restoreTraitIds !== undefined && applyPersonaTraitEnabledSnapshot(avatarId, restoreTraitIds)) {
      changed = true;
    }
    delete baselines[avatarId];
  });

  if (desiredAvatarId) {
    const currentPersona = getCurrentPersonaFromDOM();
    if (currentPersona?.avatarId !== desiredAvatarId) {
      const switched = await selectPersonaInParentUI(desiredAvatarId);
      if (switched) {
        changed = true;
      }
    }
  }

  if (!desiredHasTraitSnapshot) {
    const currentPersonaAvatarId = desiredAvatarId || getCurrentPersonaFromDOM()?.avatarId || '';
    const defaultTraitIds = currentPersonaAvatarId
      ? getPersonaDefaultEnabledTraitIds(currentPersonaAvatarId)
      : undefined;
    if (currentPersonaAvatarId && defaultTraitIds !== undefined) {
      if (applyPersonaTraitEnabledSnapshot(currentPersonaAvatarId, defaultTraitIds)) {
        changed = true;
      }
    }
  }

  return { changed, personaTraitBaselines: baselines };
}

export async function applyPersonaPlusBindings(
  avatarId: string,
  context: PersonaRuntimeContext = getRuntimeContext(),
  force: boolean = false,
): Promise<{ changed: boolean; summary: string[] }> {
  const desired = buildDesiredPlusAppliedState(avatarId, context);
  const previous = loadPersonaPlusAppliedState(avatarId);
  if (!force && isSamePlusAppliedTarget(desired, previous)) {
    return { changed: false, summary: [] };
  }
  const summary: string[] = [];
  let changed = false;
  const personaResult = await applyManagedUserPersonaSelection(
    desired.userPersonaAvatarId,
    desired.userPersonaEnabledTraitIds,
    previous,
  );

  if (personaResult.changed) {
    changed = true;
    summary.push(
      desired.userPersonaAvatarId
        ? `user人设 -> ${findPersonaByAvatarId(desired.userPersonaAvatarId)?.name || desired.userPersonaAvatarId}${desired.userPersonaEnabledTraitIds !== undefined ? ` (${desired.userPersonaEnabledTraitIds.length} 条)` : ''}`
        : 'user人设保持当前',
    );
  }

  const connectionProfileResult = await applyManagedConnectionProfile(desired.connectionProfileName, previous);
  if (connectionProfileResult.changed) {
    changed = true;
    summary.push(
      connectionProfileResult.connectionProfileName
        ? `连接profile -> ${connectionProfileResult.connectionProfileName}`
        : '连接profile已恢复',
    );
  }

  let presetLoadFailed = false;
  if (desired.presetName && desired.presetName !== getLoadedPresetName()) {
    let presetLoaded = false;
    try {
      presetLoaded = loadPreset(desired.presetName);
    } catch (error) {
      console.warn('绑定plus: 加载绑定预设失败', { presetName: desired.presetName, error });
    }

    if (presetLoaded) {
      changed = true;
      summary.push(`预设 -> ${desired.presetName}`);
    } else {
      presetLoadFailed = true;
      summary.push(`预设加载失败 -> ${desired.presetName}`);
    }
  }

  const presetPromptResult = await applyManagedPresetPromptSelection(
    presetLoadFailed ? undefined : desired.presetName,
    presetLoadFailed ? undefined : desired.presetEnabledPromptIds,
    previous,
  );

  if (presetPromptResult.changed) {
    changed = true;
    summary.push(
      presetPromptResult.presetName
        ? `预设条目 -> ${presetPromptResult.presetName} (${presetPromptResult.presetEnabledPromptIds?.length || 0} 条)`
        : '预设条目已同步',
    );
  }

  if (await applyManagedScriptScope('global', desired.scripts.global, previous.scripts.global)) {
    changed = true;
    summary.push(`全局脚本 ${desired.scripts.global.length} 项`);
  }
  if (await applyManagedScriptScope('preset', desired.scripts.preset, previous.scripts.preset)) {
    changed = true;
    summary.push(`预设脚本 ${desired.scripts.preset.length} 项`);
  }
  if (await applyManagedScriptScope('character', desired.scripts.character, previous.scripts.character)) {
    changed = true;
    summary.push(`角色脚本 ${desired.scripts.character.length} 项`);
  }

  if (await applyManagedRegexScope({ type: 'global' }, desired.regexes.global, previous.regexes.global)) {
    changed = true;
    summary.push(`全局正则 ${desired.regexes.global.length} 项`);
  }
  if (
    await applyManagedRegexScope({ type: 'preset', name: 'in_use' }, desired.regexes.preset, previous.regexes.preset)
  ) {
    changed = true;
    summary.push(`预设正则 ${desired.regexes.preset.length} 项`);
  }
  if (
    await applyManagedRegexScope(
      { type: 'character', name: 'current' },
      desired.regexes.character,
      previous.regexes.character,
    )
  ) {
    changed = true;
    summary.push(`角色正则 ${desired.regexes.character.length} 项`);
  }

  if (await applyManagedGlobalWorldbooks(desired.worldbooks.global, previous.worldbooks.global)) {
    changed = true;
    summary.push(`全局世界书 ${desired.worldbooks.global.length} 本`);
  }
  if (await applyManagedCharacterWorldbooks(desired.worldbooks, previous.worldbooks)) {
    changed = true;
    summary.push('角色世界书已同步');
  }
  if (await applyManagedChatWorldbook(desired.worldbooks.chat, previous.worldbooks.chat)) {
    changed = true;
    summary.push(`聊天世界书 -> ${desired.worldbooks.chat || '清空'}`);
  }
  const worldbookEntryResult = await applyManagedWorldbookEntries(
    desired.worldbookEntries,
    previous.worldbookEntries,
    previous.worldbookEntryBaselines,
  );
  if (worldbookEntryResult.changed) {
    changed = true;
    summary.push(`世界书条目 ${desired.worldbookEntries.length} 组`);
  }

  if (await applyManagedExtensionSettings(desired.extensions, previous.extensions)) {
    changed = true;
    summary.push(`插件设置 ${desired.extensions.length} 项`);
  }

  const nextState: PersonaPlusAppliedState = {
    ...desired,
    connectionProfileName: connectionProfileResult.connectionProfileName,
    connectionProfileBaseline: connectionProfileResult.connectionProfileBaseline,
    presetName: presetPromptResult.presetName,
    presetEnabledPromptIds: presetPromptResult.presetEnabledPromptIds,
    personaTraitBaselines: personaResult.personaTraitBaselines,
    presetPromptBaselines: presetPromptResult.presetPromptBaselines,
    worldbookEntryBaselines: worldbookEntryResult.worldbookEntryBaselines,
  };

  savePersonaPlusAppliedState(avatarId, nextState);
  return { changed, summary };
}

function buildComposedDescription(baseDescription: string, lines: string[]): string {
  const base = normalizeDescription(baseDescription);
  if (lines.length === 0) {
    return base;
  }
  if (!base) {
    return `${PERSONA_TRAIT_SEPARATOR}\n${lines.join('\n')}`;
  }
  return `${base}\n\n${PERSONA_TRAIT_SEPARATOR}\n${lines.join('\n')}`;
}

// ==================== 描述拼装逻辑 ====================

/**
 * 拼装最终的用户描述（基础描述 + 生效设定）
 */
export async function composePersonaDescription(avatarId: string, baseDescription: string): Promise<string> {
  const traits = loadPersonaTraits(avatarId);
  if (traits.length === 0) {
    return normalizeDescription(baseDescription);
  }

  const activation = getPersonaActivationState(avatarId);
  const enabledTraitIdSet = new Set(activation.effectiveTraitIds);

  const traitLines = traits
    .filter(trait => enabledTraitIdSet.has(trait.id))
    .map(trait => trait.description.trim())
    .filter(Boolean)
    .map(desc => `- ${desc}`);

  return buildComposedDescription(baseDescription, traitLines);
}

/**
 * 获取当前应用的完整描述
 */
export async function getCurrentPersonaFullDescription(): Promise<string> {
  const currentPersona = getCurrentPersonaFromDOM();
  if (!currentPersona || !currentPersona.avatarId) {
    return '';
  }
  const fallbackDescription = currentPersona.description || '';
  const baseDescription = loadPersonaBaseDescription(currentPersona.avatarId, fallbackDescription);
  return composePersonaDescription(currentPersona.avatarId, baseDescription);
}

// ==================== 变更保护（快照） ====================

function getPersonaSnapshotStorageKey(avatarId: string): string {
  return `${PERSONA_SNAPSHOT_STORAGE_PREFIX}${avatarId}`;
}

export function loadPersonaSnapshots(avatarId: string): PersonaSnapshot[] {
  try {
    const key = getPersonaSnapshotStorageKey(avatarId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return limitPersonaSnapshots(safeArray<PersonaSnapshot>(parsed));
  } catch (error) {
    console.error('用户设定脚本: 加载快照失败', error);
    return [];
  }
}

function savePersonaSnapshots(avatarId: string, snapshots: PersonaSnapshot[]): boolean {
  try {
    const key = getPersonaSnapshotStorageKey(avatarId);
    localStorage.setItem(key, JSON.stringify(limitPersonaSnapshots(snapshots)));
    return true;
  } catch (error) {
    console.error('用户设定脚本: 保存快照失败', error);
    return false;
  }
}

/**
 * 记录当前 Persona 的快照，用于回滚
 */
export function recordPersonaSnapshot(avatarId: string, reason: string, fallbackBaseDescription: string = ''): boolean {
  if (!avatarId) {
    return false;
  }

  const parentDoc = getParentDoc();
  const currentPersona = findPersonaByAvatarId(avatarId);
  const personaDescriptionInput = ($('#persona_description', parentDoc).val() as string | undefined) || '';
  const currentDescription = normalizeDescription(currentPersona?.description || personaDescriptionInput || '');
  const baseDescription = loadPersonaBaseDescription(avatarId, fallbackBaseDescription || currentDescription);
  const traits = loadPersonaTraits(avatarId);
  const config = loadPersonaAdvancedConfig(avatarId);
  const snapshots = loadPersonaSnapshots(avatarId);
  const lastSnapshot = snapshots[snapshots.length - 1];
  const now = Date.now();

  if (lastSnapshot) {
    const sameState =
      lastSnapshot.description === currentDescription && lastSnapshot.baseDescription === baseDescription;
    if (sameState) {
      return false;
    }
    if (now - lastSnapshot.timestamp < SNAPSHOT_MIN_INTERVAL_MS && lastSnapshot.reason === reason) {
      return false;
    }
  }

  const snapshot: PersonaSnapshot = {
    id: createId(),
    timestamp: now,
    reason,
    description: currentDescription,
    baseDescription,
    traits: deepClone(traits),
    config: deepClone(config),
  };

  snapshots.push(snapshot);
  while (snapshots.length > SNAPSHOT_MAX_COUNT) {
    snapshots.shift();
  }

  return savePersonaSnapshots(avatarId, snapshots);
}

/**
 * 回滚到最近一次快照
 */
export function restoreLastPersonaSnapshot(avatarId: string): PersonaSnapshot | null {
  if (!avatarId) {
    return null;
  }

  const snapshots = loadPersonaSnapshots(avatarId);
  if (snapshots.length === 0) {
    return null;
  }

  const lastSnapshot = snapshots.pop() || null;
  if (!lastSnapshot) {
    return null;
  }

  savePersonaTraits(avatarId, lastSnapshot.traits);
  savePersonaAdvancedConfig(avatarId, lastSnapshot.config);
  savePersonaBaseDescription(avatarId, lastSnapshot.baseDescription);
  savePersonaSnapshots(avatarId, snapshots);

  return lastSnapshot;
}

// ==================== 兼容性自检 ====================

function createCheck(key: string, ok: boolean, required: boolean, message: string): CompatibilityCheckItem {
  return { key, ok, required, message };
}

export function runCompatibilitySelfCheck(): CompatibilityCheckReport {
  const parentDoc = getParentDoc();
  const checks: CompatibilityCheckItem[] = [];

  checks.push(createCheck('jquery', typeof $ !== 'undefined', true, '$ (jQuery) 可用'));
  checks.push(createCheck('parent_document', Boolean(parentDoc), true, '可访问父页面 document'));
  checks.push(
    createCheck('extensions_menu', $('#extensionsMenu', parentDoc).length > 0, true, '扩展菜单 #extensionsMenu 存在'),
  );
  checks.push(
    createCheck(
      'persona_list',
      $('#user_avatar_block', parentDoc).length > 0,
      true,
      'Persona 列表 #user_avatar_block 存在',
    ),
  );
  checks.push(createCheck('trigger_slash', typeof triggerSlash === 'function', true, 'triggerSlash 可用'));
  checks.push(
    createCheck(
      'persona_description',
      $('#persona_description', parentDoc).length > 0,
      false,
      '可访问 #persona_description（用于同步描述）',
    ),
  );
  checks.push(
    createCheck(
      'rename_button',
      $('#persona_rename_button', parentDoc).length > 0,
      false,
      '可访问 #persona_rename_button（用于改名）',
    ),
  );

  return {
    ok: checks.every(item => (item.required ? item.ok : true)),
    checkedAt: Date.now(),
    items: checks,
  };
}

function formatProbeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function pushPlusProbeItem(
  items: PersonaPlusInterfaceProbeItem[],
  key: string,
  label: string,
  available: boolean,
  detail: string,
): void {
  items.push({ key, label, available, detail });
}

function countScriptTrees(scriptTrees: ScriptTree[]): { scripts: number; folders: number; enabled: number } {
  const summary = { scripts: 0, folders: 0, enabled: 0 };

  const walk = (nodes: ScriptTree[]) => {
    for (const node of nodes) {
      if (node.type === 'folder') {
        summary.folders += 1;
        if (node.enabled) {
          summary.enabled += 1;
        }
        walk(node.scripts);
      } else {
        summary.scripts += 1;
        if (node.enabled) {
          summary.enabled += 1;
        }
      }
    }
  };

  walk(scriptTrees);
  return summary;
}

function pickPreferredWorldbookName(
  chatWorldbookName: string | null,
  charWorldbooks: { primary: string | null; additional: string[] } | null,
  worldbookNames: string[],
): string | null {
  if (chatWorldbookName) {
    return chatWorldbookName;
  }
  if (charWorldbooks?.primary) {
    return charWorldbooks.primary;
  }
  if (charWorldbooks?.additional?.length) {
    return charWorldbooks.additional[0];
  }
  return worldbookNames[0] || null;
}

export async function probePlusBindingInterfaces(): Promise<PersonaPlusProbeReport> {
  const items: PersonaPlusInterfaceProbeItem[] = [];
  const notes: string[] = [];
  const currentContext = getRuntimeContext();

  if (
    typeof getPresetNames === 'function' &&
    typeof getLoadedPresetName === 'function' &&
    typeof getPreset === 'function' &&
    typeof updatePresetWith === 'function'
  ) {
    try {
      const presetNames = getPresetNames();
      const loadedPresetName = getLoadedPresetName();
      const inUsePreset = getPreset('in_use');
      pushPlusProbeItem(
        items,
        'preset',
        '预设接口',
        true,
        `已发现 ${presetNames.length} 个预设；当前加载 ${loadedPresetName || '未知'}；in_use 含 ${inUsePreset.prompts.length} 条 prompts，可直接 updatePresetWith/replacePreset。`,
      );
    } catch (error) {
      pushPlusProbeItem(items, 'preset', '预设接口', false, `调用失败: ${formatProbeError(error)}`);
    }
  } else {
    pushPlusProbeItem(
      items,
      'preset',
      '预设接口',
      false,
      '缺少 getPresetNames/getPreset/updatePresetWith 等高层接口。',
    );
  }

  try {
    const connectionProfiles = await refreshConnectionProfileCatalog();
    const currentConnectionProfile = await readCurrentConnectionProfileName(true);
    pushPlusProbeItem(
      items,
      'connection_profile',
      'API连接 profile',
      true,
      `已发现 ${connectionProfiles.length} 个 connection profile；当前=${currentConnectionProfile || '<None>'}；可通过 /profile 切换。`,
    );
  } catch (error) {
    pushPlusProbeItem(items, 'connection_profile', 'API连接 profile', false, `调用失败: ${formatProbeError(error)}`);
  }

  try {
    const currentConnectionProfile = await readCurrentConnectionProfileName(true);
    const profileGetResult = await triggerSlash(
      currentConnectionProfile ? `/profile-get ${quoteSlashCommandArgument(currentConnectionProfile)}` : '/profile-get',
    );
    pushPlusProbeItem(
      items,
      'slash_profile_get',
      'Slash /profile-get',
      true,
      `可读；当前 profile=${currentConnectionProfile || '<None>'}；返回=${summarizeProbeText(profileGetResult)}`,
    );
  } catch (error) {
    pushPlusProbeItem(items, 'slash_profile_get', 'Slash /profile-get', false, `调用失败: ${formatProbeError(error)}`);
  }

  try {
    const apiResult = await triggerSlash('/api');
    const currentApi = parseSlashApiName(apiResult);
    pushPlusProbeItem(
      items,
      'slash_api',
      'Slash /api',
      true,
      `可读；当前源=${currentApi || '未知'}；返回=${summarizeProbeText(apiResult)}；命令本身支持带参数切换。`,
    );
  } catch (error) {
    pushPlusProbeItem(items, 'slash_api', 'Slash /api', false, `调用失败: ${formatProbeError(error)}`);
  }

  try {
    const modelResult = await triggerSlash('/model');
    const currentModel = parseSlashModelName(modelResult);
    pushPlusProbeItem(
      items,
      'slash_model',
      'Slash /model',
      true,
      `可读；当前模型=${currentModel || '未知'}；返回=${summarizeProbeText(modelResult)}；命令本身支持带参数切换。`,
    );
  } catch (error) {
    pushPlusProbeItem(items, 'slash_model', 'Slash /model', false, `调用失败: ${formatProbeError(error)}`);
  }

  const parentWindowForApi = window.parent as Window &
    typeof globalThis & {
      SillyTavern?: {
        mainApi?: unknown;
        chatCompletionSettings?: Record<string, unknown>;
        saveSettingsDebounced?: () => Promise<void> | void;
      };
    };
  const sillyTavernApiRoot = parentWindowForApi.SillyTavern || SillyTavern;
  const mainApiDescriptor = sillyTavernApiRoot ? Object.getOwnPropertyDescriptor(sillyTavernApiRoot, 'mainApi') : undefined;
  const mainApiValue = sillyTavernApiRoot?.mainApi;
  pushPlusProbeItem(
    items,
    'main_api_object',
    'SillyTavern.mainApi',
    mainApiValue !== undefined && mainApiValue !== null,
    `可读=${mainApiValue !== undefined && mainApiValue !== null ? '是' : '否'}；当前值=${ensureStringLike(mainApiValue) || '空'}；writable=${Boolean(mainApiDescriptor?.writable)}；setter=${typeof mainApiDescriptor?.set === 'function' ? '有' : '无'}。`,
  );

  const chatCompletionSettings = sillyTavernApiRoot?.chatCompletionSettings;
  const chatCompletionSettingKeys =
    chatCompletionSettings && typeof chatCompletionSettings === 'object' ? Object.keys(chatCompletionSettings) : [];
  pushPlusProbeItem(
    items,
    'chat_completion_settings_object',
    'SillyTavern.chatCompletionSettings',
    Boolean(chatCompletionSettings && typeof chatCompletionSettings === 'object'),
    `可读=${chatCompletionSettings && typeof chatCompletionSettings === 'object' ? '是' : '否'}；键数=${chatCompletionSettingKeys.length}；frozen=${Boolean(chatCompletionSettings && Object.isFrozen(chatCompletionSettings))}；saveSettingsDebounced=${typeof sillyTavernApiRoot?.saveSettingsDebounced === 'function' ? '可用' : '不可用'}。`,
  );

  if (
    typeof getScriptTrees === 'function' &&
    typeof replaceScriptTrees === 'function' &&
    typeof updateScriptTreesWith === 'function'
  ) {
    try {
      const globalTrees = getScriptTrees({ type: 'global' });
      const presetTrees = getScriptTrees({ type: 'preset' });
      const characterTrees = getScriptTrees({ type: 'character' });
      const globalSummary = countScriptTrees(globalTrees);
      const presetSummary = countScriptTrees(presetTrees);
      const characterSummary = countScriptTrees(characterTrees);
      pushPlusProbeItem(
        items,
        'script_trees',
        '酒馆助手脚本接口',
        true,
        `global ${globalSummary.scripts} 脚本/${globalSummary.folders} 文件夹；preset ${presetSummary.scripts}/${presetSummary.folders}；character ${characterSummary.scripts}/${characterSummary.folders}，可直接 updateScriptTreesWith。`,
      );
    } catch (error) {
      pushPlusProbeItem(items, 'script_trees', '酒馆助手脚本接口', false, `调用失败: ${formatProbeError(error)}`);
    }
  } else {
    pushPlusProbeItem(
      items,
      'script_trees',
      '酒馆助手脚本接口',
      false,
      '缺少 getScriptTrees/updateScriptTreesWith 接口。',
    );
  }

  if (
    typeof getTavernRegexes === 'function' &&
    typeof updateTavernRegexesWith === 'function' &&
    typeof replaceTavernRegexes === 'function'
  ) {
    try {
      const globalRegexes = getTavernRegexes({ type: 'global' });
      const presetRegexes = getTavernRegexes({ type: 'preset', name: 'in_use' });
      const characterRegexes = getTavernRegexes({ type: 'character', name: 'current' });
      pushPlusProbeItem(
        items,
        'tavern_regex',
        '酒馆正则接口',
        true,
        `global ${globalRegexes.length} 条；preset(in_use) ${presetRegexes.length} 条；character(current) ${characterRegexes.length} 条，可直接 updateTavernRegexesWith。`,
      );
    } catch (error) {
      pushPlusProbeItem(items, 'tavern_regex', '酒馆正则接口', false, `调用失败: ${formatProbeError(error)}`);
    }
  } else {
    pushPlusProbeItem(
      items,
      'tavern_regex',
      '酒馆正则接口',
      false,
      '缺少 getTavernRegexes/updateTavernRegexesWith 接口。',
    );
  }

  let worldbookNames: string[] = [];
  let chatWorldbookName: string | null = null;
  let charWorldbooks: { primary: string | null; additional: string[] } | null = null;
  if (
    typeof getWorldbookNames === 'function' &&
    typeof getGlobalWorldbookNames === 'function' &&
    typeof getCharWorldbookNames === 'function' &&
    typeof getChatWorldbookName === 'function' &&
    typeof rebindGlobalWorldbooks === 'function' &&
    typeof rebindCharWorldbooks === 'function' &&
    typeof rebindChatWorldbook === 'function'
  ) {
    try {
      worldbookNames = getWorldbookNames();
      const globalWorldbooks = getGlobalWorldbookNames();
      charWorldbooks = getCharWorldbookNames('current');
      chatWorldbookName = getChatWorldbookName('current');
      pushPlusProbeItem(
        items,
        'worldbook_binding',
        '酒馆世界书接口',
        true,
        `世界书 ${worldbookNames.length} 本；全局启用 ${globalWorldbooks.length} 本；当前角色 primary=${charWorldbooks.primary || '无'} additional=${charWorldbooks.additional.length}；当前聊天绑定=${chatWorldbookName || '无'}。`,
      );
    } catch (error) {
      pushPlusProbeItem(items, 'worldbook_binding', '酒馆世界书接口', false, `调用失败: ${formatProbeError(error)}`);
    }
  } else {
    pushPlusProbeItem(
      items,
      'worldbook_binding',
      '酒馆世界书接口',
      false,
      '缺少 getWorldbookNames/rebindGlobalWorldbooks/rebindCharWorldbooks/rebindChatWorldbook 等接口。',
    );
  }

  if (
    typeof getWorldbook === 'function' &&
    typeof updateWorldbookWith === 'function' &&
    typeof createWorldbookEntries === 'function' &&
    typeof deleteWorldbookEntries === 'function'
  ) {
    try {
      const sampleWorldbookName = pickPreferredWorldbookName(chatWorldbookName, charWorldbooks, worldbookNames);
      if (sampleWorldbookName) {
        const rawEntries = await getWorldbook(sampleWorldbookName);
        const entries = Array.isArray(rawEntries) ? rawEntries : [];
        const firstEntry = entries[0];
        pushPlusProbeItem(
          items,
          'worldbook_entry',
          '世界书条目接口',
          true,
          `样本世界书 ${sampleWorldbookName} 共 ${entries.length} 条；首条 uid=${firstEntry?.uid ?? '无'}，可直接 updateWorldbookWith/createWorldbookEntries/deleteWorldbookEntries。`,
        );
      } else {
        pushPlusProbeItem(
          items,
          'worldbook_entry',
          '世界书条目接口',
          true,
          '已发现 getWorldbook/updateWorldbookWith/createWorldbookEntries/deleteWorldbookEntries，但当前没有可抽样的世界书。',
        );
      }
    } catch (error) {
      pushPlusProbeItem(items, 'worldbook_entry', '世界书条目接口', false, `调用失败: ${formatProbeError(error)}`);
    }
  } else {
    pushPlusProbeItem(
      items,
      'worldbook_entry',
      '世界书条目接口',
      false,
      '缺少 getWorldbook/updateWorldbookWith/createWorldbookEntries/deleteWorldbookEntries 接口。',
    );
  }

  const parentWindow = window.parent as Window &
    typeof globalThis & {
      SillyTavern?: {
        extensionSettings?: Record<string, unknown>;
      };
    };
  const currentWindowRecord = window as unknown as Record<string, unknown>;
  const parentWindowRecord = window.parent as unknown as Record<string, unknown>;
  const extensionSettings = parentWindow.SillyTavern?.extensionSettings ?? SillyTavern?.extensionSettings;
  const extensionFunctionNames = [
    'getExtensionType',
    'getExtensionInstallationInfo',
    'isInstalledExtension',
    'installExtension',
    'uninstallExtension',
    'reinstallExtension',
    'updateExtension',
  ] as const;
  const availableExtensionFunctions = extensionFunctionNames.filter(
    name => typeof currentWindowRecord[name] === 'function' || typeof parentWindowRecord[name] === 'function',
  );
  const tavernHelperExtensionId =
    typeof getTavernHelperExtensionId === 'function' ? getTavernHelperExtensionId() : 'unknown-extension-id';
  const tavernHelperExtensionType =
    typeof getExtensionType === 'function' ? getExtensionType(tavernHelperExtensionId) : null;
  pushPlusProbeItem(
    items,
    'extension',
    '酒馆插件接口',
    Boolean(extensionSettings) || availableExtensionFunctions.length > 0,
    `extensionSettings ${extensionSettings ? `可读(${Object.keys(extensionSettings).length} 项)` : '不可读'}；管理接口 ${availableExtensionFunctions.length}/${extensionFunctionNames.length}；Tavern Helper 类型=${tavernHelperExtensionType || '未知'}。`,
  );
  notes.push(
    '未在类型声明里发现“按插件名直接启用/停用某个扩展”的高层切换接口，目前只确认有 extensionSettings 低层对象和安装/更新类接口。',
  );
  notes.push('API 连接配置适合走 /profile /profile-list 这一套 connection profile 命令，不建议直接改 mainApi/chatCompletionSettings。');

  const currentCharacterName = typeof getCurrentCharacterName === 'function' ? getCurrentCharacterName() : null;
  if (typeof getCharacter === 'function' && currentCharacterName) {
    try {
      const currentCharacter = await getCharacter('current');
      pushPlusProbeItem(
        items,
        'character_extensions',
        '当前角色卡扩展槽',
        true,
        `当前角色 ${currentCharacterName} 已暴露 extensions；regex_scripts=${currentCharacter.extensions?.regex_scripts?.length ?? 0}，tavern_helper.scripts=${currentCharacter.extensions?.tavern_helper?.scripts?.length ?? 0}。`,
      );
    } catch (error) {
      pushPlusProbeItem(
        items,
        'character_extensions',
        '当前角色卡扩展槽',
        false,
        `调用失败: ${formatProbeError(error)}`,
      );
    }
  } else {
    pushPlusProbeItem(
      items,
      'character_extensions',
      '当前角色卡扩展槽',
      false,
      '当前没有打开的角色卡，或缺少 getCharacter 接口。',
    );
  }

  notes.push(
    '官方事件里已确认有 CHAT_CHANGED；未发现同级的 CHARACTER_CHANGED，高层角色切换建议使用 CHARACTER_PAGE_LOADED + 聊天/角色差分 + 自定义事件桥。',
  );

  return {
    checkedAt: Date.now(),
    currentContext,
    interfaceItems: items,
    notes,
  };
}

export async function runApiConfigSelfTest(): Promise<PersonaPlusApiConfigTestReport> {
  const items: PersonaPlusApiConfigTestItem[] = [];
  const notes: string[] = [];
  const parentWindow = window.parent as Window &
    typeof globalThis & {
      SillyTavern?: {
        mainApi?: unknown;
        chatCompletionSettings?: Record<string, unknown>;
        saveSettingsDebounced?: () => Promise<void> | void;
      };
    };
  const sillyTavernApiRoot = parentWindow.SillyTavern || SillyTavern;

  try {
    const currentProfile = await readCurrentConnectionProfileName(true);
    const profileGetResult = await triggerSlash(
      currentProfile ? `/profile-get ${quoteSlashCommandArgument(currentProfile)}` : '/profile-get',
    );
    items.push(
      createApiConfigTestItem(
        'profile_get_read',
        '/profile-get 读取测试',
        true,
        `当前 profile=${currentProfile || '<None>'}；返回=${summarizeProbeText(profileGetResult)}`,
        {
          rawContent: formatJsonLikeText(profileGetResult),
          rawContentLabel: '/profile-get 完整返回',
        },
      ),
    );
  } catch (error) {
    items.push(
      createApiConfigTestItem('profile_get_read', '/profile-get 读取测试', false, `调用失败: ${formatProbeError(error)}`),
    );
  }

  try {
    const apiResult = await triggerSlash('/api');
    const currentApi = parseSlashApiName(apiResult);
    if (!currentApi) {
      throw new Error(`无法解析当前 API 源: ${summarizeProbeText(apiResult)}`);
    }
    await triggerSlash(`/api ${currentApi}`);
    items.push(
      createApiConfigTestItem(
        'api_read_writeback',
        '/api 回写当前值',
        true,
        `读取到当前源=${currentApi}；已成功回写同值。`,
      ),
    );
  } catch (error) {
    items.push(
      createApiConfigTestItem('api_read_writeback', '/api 回写当前值', false, `调用失败: ${formatProbeError(error)}`),
    );
  }

  try {
    const modelResult = await triggerSlash('/model');
    const currentModel = parseSlashModelName(modelResult);
    if (!currentModel) {
      throw new Error(`无法解析当前模型: ${summarizeProbeText(modelResult)}`);
    }
    await triggerSlash(`/model ${quoteSlashCommandArgument(currentModel)}`);
    items.push(
      createApiConfigTestItem(
        'model_read_writeback',
        '/model 回写当前值',
        true,
        `读取到当前模型=${currentModel}；已成功回写同值。`,
      ),
    );
  } catch (error) {
    items.push(
      createApiConfigTestItem(
        'model_read_writeback',
        '/model 回写当前值',
        false,
        `调用失败: ${formatProbeError(error)}`,
      ),
    );
  }

  const mainApiDescriptor = sillyTavernApiRoot ? Object.getOwnPropertyDescriptor(sillyTavernApiRoot, 'mainApi') : undefined;
  const mainApiValue = sillyTavernApiRoot?.mainApi;
  items.push(
    createApiConfigTestItem(
      'main_api_direct',
      'mainApi 直读状态',
      mainApiValue !== undefined && mainApiValue !== null,
      `当前值=${ensureStringLike(mainApiValue) || '空'}；writable=${Boolean(mainApiDescriptor?.writable)}；setter=${typeof mainApiDescriptor?.set === 'function' ? '有' : '无'}；未执行直接写入。`,
    ),
  );

  const chatCompletionSettings = sillyTavernApiRoot?.chatCompletionSettings;
  const chatCompletionSettingKeys =
    chatCompletionSettings && typeof chatCompletionSettings === 'object' ? Object.keys(chatCompletionSettings) : [];
  items.push(
    createApiConfigTestItem(
      'chat_completion_settings_direct',
      'chatCompletionSettings 直读状态',
      Boolean(chatCompletionSettings && typeof chatCompletionSettings === 'object'),
      `键数=${chatCompletionSettingKeys.length}；frozen=${Boolean(chatCompletionSettings && Object.isFrozen(chatCompletionSettings))}；saveSettingsDebounced=${typeof sillyTavernApiRoot?.saveSettingsDebounced === 'function' ? '可用' : '不可用'}；未执行直接写入。`,
    ),
  );

  notes.push('写入测试只对 /api 和 /model 做“回写当前值”验证，尽量避免改变当前连接状态。');
  notes.push('mainApi / chatCompletionSettings 只做直读和可写性判断，未直接改写低层对象。');
  notes.push('如果后续要真的修改整套连接配置，优先考虑 /profile 或 /api+/model 组合，而不是直接写 mainApi。');

  return {
    checkedAt: Date.now(),
    items,
    notes,
  };
}
