/**
 * 设置管理工具
 * 用于管理前端显示设置的持久化存储
 */

import { dataLogger } from './logger';
import inkWashBackgroundUrl from '../wuxia-sprites/水墨背景.jpg?url';
import inkWashBrushBarMdUrl from '../wuxia-sprites/brush/brush-bar-md.png?url';
import inkWashCircleFrameInkUrl from '../wuxia-sprites/circle/circle-frame-ink.png?url';
import inkWashIconCircleInkUrl from '../wuxia-sprites/icon/icon-circle-ink.png?url';
import inkWashIconSquareDarkUrl from '../wuxia-sprites/icon/icon-square-dark.png?url';
import inkWashPanelBarMdUrl from '../wuxia-sprites/panel/panel-bar-md.png?url';
import inkWashPanelRectLgUrl from '../wuxia-sprites/panel/panel-rect-lg.png?url';
import inkWashPanelRectXlUrl from '../wuxia-sprites/panel/panel-rect-xl.png?url';

// =========================================
// 类型定义
// =========================================

export type RegexRuleOriginScope = 'manual' | 'global' | 'preset';
export type WuxiaUiTheme = 'dark-gold' | 'ink-wash';

/** 正则替换规则 */
export interface RegexRule {
  id: string;
  /** 正则表达式模式 */
  pattern: string;
  /** 替换文本 */
  replacement: string;
  /** 是否启用 */
  enabled: boolean;
  /** 规则描述 */
  description?: string;
  /** 规则来源 */
  originScope: RegexRuleOriginScope;
}

/** 自定义API配置（用于自动总结） */
export interface SummaryApiConfig {
  /** API地址 */
  apiurl: string;
  /** API密钥 */
  key: string;
  /** 模型名称 */
  model: string;
  /** API源，默认为 'openai' */
  source: string;
}

/** 自动总结 API 使用模式 */
export type SummaryApiMode = 'preset' | 'custom';

/** 额外模型 API 保存项 */
export interface SummaryApiProfile {
  id: string;
  name: string;
  apiConfig: SummaryApiConfig;
  createdAt: number;
  updatedAt: number;
}

/** 额外模型 API 选择 */
export type SummaryApiSelection = { type: 'preset' } | { type: 'profile'; profileId: string };

/** 变量更新模式：正文伴随或额外模型 */
export type SummaryVariableUpdateMode = 'inline' | 'extra';

/** 额外变量更新读取的前序完整对话轮数 */
export type VariableContextRounds = 1 | 2;

/** 阈值设置 */
export interface SummaryThresholds {
  /** 待处理队列角色数阈值 (默认5) */
  pendingQueueThreshold: number;
  /** 总条目数阈值 (默认50) */
  totalEntriesThreshold: number;
  /** 单角色条目阈值 (默认10) */
  perCharacterEntriesThreshold: number;
}

/** 待总结角色信息 */
export interface PendingCharacterSummary {
  /** 角色标识：'user' 或 NPC名称 */
  characterId: string;
  /** 显示名称 */
  displayName: string;
  /** 经历条目数 */
  entriesCount: number;
  /** 人物经历数据 */
  biography: Record<string, string>;
}

/** 自动总结设置 */
export interface SummarySettings {
  /** 是否启用自动总结 */
  enabled: boolean;
  /** 变量更新模式：正文伴随或额外模型 */
  variableUpdateMode: SummaryVariableUpdateMode;
  /** 是否启用流式生成 */
  stream: boolean;
  /** 已保存的额外模型 API */
  apiProfiles: SummaryApiProfile[];
  /** 自动总结使用的 API */
  summaryApiSelection: SummaryApiSelection;
  /** 额外变量更新使用的 API */
  variableApiSelection: SummaryApiSelection;
  /** 提示词模板 */
  promptTemplate: string;
  /** 额外变量更新提示词模板 */
  variablePromptTemplate: string;
  /** 最新正文之前作为只读上下文发送的完整 user + assistant 轮数 */
  variableContextRounds: VariableContextRounds;
  /** 触发阈值 */
  thresholds: SummaryThresholds;
}

export type RegexRulesByPreset = Record<string, RegexRule[]>;

export interface RegexRuleDebugSummary {
  id: string;
  description: string;
  enabled: boolean;
  originScope?: RegexRuleOriginScope;
  pattern: string;
  replacement: string;
}

export interface TavernRegexDebugSummary {
  id: string;
  script_name: string;
  enabled: boolean;
  source_ai_output: boolean;
  destination_display: boolean;
  destination_prompt: boolean;
  min_depth: number | null;
  max_depth: number | null;
  find_regex: string;
  replace_string: string;
}

export interface RegexDebugSnapshot {
  currentPresetName: string;
  counts: {
    localRegexRules: number;
    currentPresetRegexRules: number;
    displayRegexRules: number;
    presetBuckets: number;
    tavernGlobalApi: number;
    tavernPresetApi: number;
    tavernRawPreset: number;
    importableGlobal: number;
    importablePreset: number;
  };
  duplicates: {
    globalApiMatchingRawPreset: string[];
  };
  frontend: {
    localRegexRules: RegexRuleDebugSummary[];
    currentPresetRegexRules: RegexRuleDebugSummary[];
    displayRegexRules: RegexRuleDebugSummary[];
    presetRegexBuckets: Record<string, RegexRuleDebugSummary[]>;
  };
  tavern: {
    globalApi: TavernRegexDebugSummary[];
    presetApi: TavernRegexDebugSummary[];
    rawPreset: TavernRegexDebugSummary[];
    importableGlobal: RegexRuleDebugSummary[];
    importablePreset: RegexRuleDebugSummary[];
  };
}

export interface WuxiaRegexDebugTools {
  dump: (reason?: string) => void;
  getSnapshot: () => RegexDebugSnapshot;
}

declare global {
  interface Window {
    WuxiaRegexDebug?: WuxiaRegexDebugTools;
  }
}

/** 显示设置 */
export interface DisplaySettings {
  // UI整体主题
  uiTheme: WuxiaUiTheme;

  // 正文字体设置
  fontSize: number; // 字体大小 (px)
  fontColor: string; // 字体颜色 (hex)
  lineHeight: number; // 行高倍数

  // 背景设置
  backgroundColor: string; // 背景颜色 (hex)
  backgroundOpacity: number; // 背景透明度 (0-1)
  backgroundImage: string | null; // 背景图片 (base64 或 URL)
  backgroundBlur: number; // 背景模糊度 (px)
  chromeOpacity: number; // 周边栏目不透明度 (0-1)
  modalOpacity: number; // 弹窗不透明度 (0-1)
  themeAppearanceByTheme: ThemeAppearanceByTheme; // 按主题分别保存的外观配置

  // 正则替换规则
  localRegexRules: RegexRule[];
  presetRegexRulesByPreset: RegexRulesByPreset;

  // 自动总结设置
  summarySettings: SummarySettings;
}

export interface ThemeAppearanceDefaults {
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundBlur: number;
  chromeOpacity: number;
  modalOpacity: number;
}

export interface ThemeAppearanceSettings extends ThemeAppearanceDefaults {
  backgroundImage: string | null;
}

export type ThemeAppearanceByTheme = Record<WuxiaUiTheme, ThemeAppearanceSettings>;

type StoredThemeAppearanceByTheme = Partial<Record<WuxiaUiTheme, Partial<ThemeAppearanceSettings>>>;

type StoredSummarySettings = Partial<SummarySettings> & {
  apiMode?: SummaryApiMode;
  apiConfig?: Partial<SummaryApiConfig>;
};

type StoredDisplaySettings = Partial<
  Omit<DisplaySettings, 'localRegexRules' | 'presetRegexRulesByPreset' | 'summarySettings' | 'themeAppearanceByTheme'>
> & {
  regexRules?: Partial<RegexRule>[];
  localRegexRules?: Partial<RegexRule>[];
  presetRegexRulesByPreset?: Record<string, Partial<RegexRule>[]>;
  summarySettings?: StoredSummarySettings;
  themeAppearanceByTheme?: StoredThemeAppearanceByTheme;
};

// =========================================
// 默认设置
// =========================================

/** ERA基础正则规则 - 用于移除ERA框架的变量标签 */
export const ERA_BASE_REGEX_RULE: RegexRule = {
  id: 'era-base-regex',
  pattern: '/<era_data>{.*?}<\\/era_data>|<Variable(Think|Insert|Edit|Delete)>[\\s\\S]*?<\\/Variable\\1>/gi',
  replacement: '',
  enabled: true,
  description: 'ERA基础正则',
  originScope: 'manual',
};

/** 默认总结提示词模板 */
export const DEFAULT_SUMMARY_PROMPT_TEMPLATE = `你是一个专业的文学编辑。请将以下角色的人物经历进行总结和精炼，保留关键事件和重要信息，去除冗余描述。

角色名称：{{characterName}}
当前经历条目：
{{biographyEntries}}

请输出精炼后的经历总结，格式为：
<summary>
[总结内容，按时间顺序，每个关键事件一行]
</summary>`;

/** 默认额外变量更新提示词模板 */
export const DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE = `你是《金庸群侠传》ERA 变量更新模型。你的任务是根据最新正文和当前变量上下文，补充正文造成的变量变化。

严格规则：
- 不要续写正文，不要解释，不要输出寒暄。
- 只允许输出 <VariableThink>、<VariableInsert>、<VariableEdit>、<VariableDelete> 块。
- <VariableInsert>、<VariableEdit>、<VariableDelete> 内必须是严格 JSON 对象；不要注释、不要尾随逗号、不要 JSON5。
- JSON 根路径必须使用实际 ERA 键名，并且只允许修改：世界信息.时间、user数据、角色数据、当前上下文中已经存在的参与事件快照。不要输出“玩家数据”或“同场景角色”这类说明别名。
- 事件系统、世界事件、前端变量、附近传闻、后续事件线索、后续事件线索计数由前端或事件脚本维护，只可作为参考，禁止对它们输出 Insert/Edit/Delete。
- 如果没有需要写入的变量变化，可以不输出 Insert/Edit/Delete 块。

【正文上下文；最新 assistant 正文是唯一变化来源，前序完整轮次只读】
{{recentBodies}}

【当前变量上下文；专用严格 JSON 投影】
{{variableContext}}

【变量指导】
{{variableGuidance}}

{{locationContext}}`;

export const DEFAULT_SUMMARY_API_CONFIG: SummaryApiConfig = {
  apiurl: '',
  key: '',
  model: '',
  source: 'openai',
};

export const PRESET_SUMMARY_API_SELECTION: SummaryApiSelection = { type: 'preset' };
export const DEFAULT_UI_THEME: WuxiaUiTheme = 'dark-gold';

export const UI_THEME_LABELS: Record<WuxiaUiTheme, string> = {
  'dark-gold': '黑金',
  'ink-wash': '水墨',
};

export const THEME_APPEARANCE_SETTING_KEYS = [
  'fontColor',
  'backgroundColor',
  'backgroundOpacity',
  'backgroundImage',
  'backgroundBlur',
  'chromeOpacity',
  'modalOpacity',
] as const;

export type ThemeAppearanceSettingKey = (typeof THEME_APPEARANCE_SETTING_KEYS)[number];

export const THEME_APPEARANCE_DEFAULTS: Record<WuxiaUiTheme, ThemeAppearanceDefaults> = {
  'dark-gold': {
    fontColor: '#e7e5e4',
    backgroundColor: '#0c0a09',
    backgroundOpacity: 0.85,
    backgroundBlur: 0,
    chromeOpacity: 0.58,
    modalOpacity: 0.72,
  },
  'ink-wash': {
    fontColor: '#1a1410',
    backgroundColor: '#e8e2d6',
    backgroundOpacity: 0.72,
    backgroundBlur: 0,
    chromeOpacity: 0.42,
    modalOpacity: 0.58,
  },
};

function createThemeAppearanceSettings(
  theme: WuxiaUiTheme,
  overrides: Partial<ThemeAppearanceSettings> = {},
): ThemeAppearanceSettings {
  return {
    ...THEME_APPEARANCE_DEFAULTS[theme],
    backgroundImage: null,
    ...overrides,
  };
}

function cloneThemeAppearanceSettings(appearance: ThemeAppearanceSettings): ThemeAppearanceSettings {
  return { ...appearance };
}

export function createDefaultThemeAppearanceByTheme(): ThemeAppearanceByTheme {
  return {
    'dark-gold': createThemeAppearanceSettings('dark-gold'),
    'ink-wash': createThemeAppearanceSettings('ink-wash'),
  };
}

export const WUXIA_UI_THEMES: { value: WuxiaUiTheme; label: string; description: string }[] = [
  {
    value: 'dark-gold',
    label: UI_THEME_LABELS['dark-gold'],
    description: '现有黑色金边界面',
  },
  {
    value: 'ink-wash',
    label: UI_THEME_LABELS['ink-wash'],
    description: '宣纸水墨界面',
  },
];

/** 默认自动总结设置 */
export const DEFAULT_SUMMARY_SETTINGS: SummarySettings = {
  enabled: false,
  variableUpdateMode: 'inline',
  stream: false,
  apiProfiles: [],
  summaryApiSelection: PRESET_SUMMARY_API_SELECTION,
  variableApiSelection: PRESET_SUMMARY_API_SELECTION,
  promptTemplate: DEFAULT_SUMMARY_PROMPT_TEMPLATE,
  variablePromptTemplate: DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE,
  variableContextRounds: 1,
  thresholds: {
    pendingQueueThreshold: 5,
    totalEntriesThreshold: 50,
    perCharacterEntriesThreshold: 10,
  },
};

function cloneSummaryApiConfig(apiConfig: SummaryApiConfig): SummaryApiConfig {
  return { ...apiConfig };
}

function cloneSummaryApiSelection(selection: SummaryApiSelection): SummaryApiSelection {
  return selection.type === 'profile' ? { type: 'profile', profileId: selection.profileId } : { type: 'preset' };
}

function cloneSummaryApiProfile(profile: SummaryApiProfile): SummaryApiProfile {
  return {
    ...profile,
    apiConfig: cloneSummaryApiConfig(profile.apiConfig),
  };
}

export function createDefaultSummarySettings(): SummarySettings {
  return {
    ...DEFAULT_SUMMARY_SETTINGS,
    apiProfiles: [],
    summaryApiSelection: { type: 'preset' },
    variableApiSelection: { type: 'preset' },
    thresholds: { ...DEFAULT_SUMMARY_SETTINGS.thresholds },
  };
}

function cloneRegexRule(rule: RegexRule): RegexRule {
  return { ...rule };
}

export function createDefaultRegexSettings(): Pick<DisplaySettings, 'localRegexRules' | 'presetRegexRulesByPreset'> {
  return {
    localRegexRules: [cloneRegexRule(ERA_BASE_REGEX_RULE)],
    presetRegexRulesByPreset: {},
  };
}

export function createDefaultDisplaySettings(): DisplaySettings {
  const themeAppearanceByTheme = createDefaultThemeAppearanceByTheme();
  const defaultAppearance = themeAppearanceByTheme[DEFAULT_UI_THEME];
  return {
    uiTheme: DEFAULT_UI_THEME,

    fontSize: 16,
    fontColor: defaultAppearance.fontColor,
    lineHeight: 1.8,

    backgroundColor: defaultAppearance.backgroundColor,
    backgroundOpacity: defaultAppearance.backgroundOpacity,
    backgroundImage: null,
    backgroundBlur: defaultAppearance.backgroundBlur,
    chromeOpacity: defaultAppearance.chromeOpacity,
    modalOpacity: defaultAppearance.modalOpacity,
    themeAppearanceByTheme,

    ...createDefaultRegexSettings(),

    summarySettings: createDefaultSummarySettings(),
  };
}

export const DEFAULT_SETTINGS: DisplaySettings = createDefaultDisplaySettings();

/** 正文显示设置的默认值 */
export const DEFAULT_DISPLAY_SETTINGS = {
  uiTheme: DEFAULT_SETTINGS.uiTheme,
  fontSize: DEFAULT_SETTINGS.fontSize,
  fontColor: DEFAULT_SETTINGS.fontColor,
  lineHeight: DEFAULT_SETTINGS.lineHeight,
} as const;

/** 背景设置的默认值 */
export const DEFAULT_BACKGROUND_SETTINGS = {
  backgroundColor: DEFAULT_SETTINGS.backgroundColor,
  backgroundOpacity: DEFAULT_SETTINGS.backgroundOpacity,
  backgroundImage: DEFAULT_SETTINGS.backgroundImage,
  backgroundBlur: DEFAULT_SETTINGS.backgroundBlur,
  chromeOpacity: DEFAULT_SETTINGS.chromeOpacity,
  modalOpacity: DEFAULT_SETTINGS.modalOpacity,
} as const;

/** 正则替换设置的默认值 */
export const DEFAULT_REGEX_SETTINGS = createDefaultRegexSettings();

/** 自动总结设置的默认值 */
export const DEFAULT_SUMMARY_TAB_SETTINGS = {
  summarySettings: createDefaultSummarySettings(),
} as const;

// =========================================
// 本地存储键名
// =========================================

const STORAGE_KEY = 'wuxia_display_settings';

// =========================================
// 内部工具函数
// =========================================

function normalizeOriginScope(originScope: unknown, fallbackScope: RegexRuleOriginScope): RegexRuleOriginScope {
  if (originScope === 'manual' || originScope === 'global' || originScope === 'preset') {
    return originScope;
  }
  return fallbackScope;
}

function normalizeRegexRule(rule: Partial<RegexRule> | undefined, fallbackScope: RegexRuleOriginScope): RegexRule {
  return {
    id: typeof rule?.id === 'string' && rule.id.trim() ? rule.id : generateId(),
    pattern: typeof rule?.pattern === 'string' ? rule.pattern : '',
    replacement: typeof rule?.replacement === 'string' ? rule.replacement : '',
    enabled: typeof rule?.enabled === 'boolean' ? rule.enabled : true,
    description: typeof rule?.description === 'string' ? rule.description : '',
    originScope: normalizeOriginScope(rule?.originScope, fallbackScope),
  };
}

function normalizeLocalRegexRules(rules: Partial<RegexRule>[] | undefined): RegexRule[] {
  const normalizedRules = Array.isArray(rules) ? rules.map(rule => normalizeRegexRule(rule, 'manual')) : [];
  const nextRules: RegexRule[] = [];
  let hasEraBaseRule = false;

  normalizedRules.forEach(rule => {
    if (rule.id === ERA_BASE_REGEX_RULE.id) {
      if (hasEraBaseRule) {
        return;
      }
      hasEraBaseRule = true;
    }
    nextRules.push(rule);
  });

  if (!hasEraBaseRule) {
    nextRules.unshift(cloneRegexRule(ERA_BASE_REGEX_RULE));
  }

  return nextRules;
}

function getRegexRuleSignature(rule: RegexRule): string {
  return [rule.originScope, rule.description || '', rule.pattern, rule.replacement].join('\u001f');
}

export function getRegexRuleContentSignature(rule: Pick<RegexRule, 'description' | 'pattern' | 'replacement'>): string {
  return [rule.description || '', rule.pattern, rule.replacement].join('\u001f');
}

function truncateDebugText(value: string, maxLength: number = 120): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function summarizeRegexRuleForDebug(rule: RegexRule): RegexRuleDebugSummary {
  return {
    id: rule.id,
    description: rule.description || '',
    enabled: rule.enabled,
    originScope: rule.originScope,
    pattern: truncateDebugText(rule.pattern),
    replacement: truncateDebugText(rule.replacement),
  };
}

function summarizeTavernRegexForDebug(regex: TavernRegex): TavernRegexDebugSummary {
  return {
    id: regex.id,
    script_name: regex.script_name,
    enabled: regex.enabled,
    source_ai_output: regex.source.ai_output === true,
    destination_display: regex.destination.display === true,
    destination_prompt: regex.destination.prompt === true,
    min_depth: regex.min_depth,
    max_depth: regex.max_depth,
    find_regex: truncateDebugText(regex.find_regex),
    replace_string: truncateDebugText(regex.replace_string),
  };
}

function mergeExtractedGlobalRules(localRegexRules: RegexRule[], extractedGlobalRules: RegexRule[]): RegexRule[] {
  if (extractedGlobalRules.length === 0) {
    return localRegexRules;
  }

  const knownSignatures = new Set(localRegexRules.map(getRegexRuleSignature));
  const nextRules = [...localRegexRules];
  extractedGlobalRules.forEach(rule => {
    const signature = getRegexRuleSignature(rule);
    if (knownSignatures.has(signature)) {
      return;
    }
    knownSignatures.add(signature);
    nextRules.push(rule);
  });
  return nextRules;
}

function normalizePresetRegexRulesByPreset(
  presetRegexRulesByPreset: Record<string, Partial<RegexRule>[]> | undefined,
): { presetRegexRulesByPreset: RegexRulesByPreset; extractedGlobalRules: RegexRule[] } {
  if (!presetRegexRulesByPreset || typeof presetRegexRulesByPreset !== 'object') {
    return {
      presetRegexRulesByPreset: {},
      extractedGlobalRules: [],
    };
  }

  const extractedGlobalRules: RegexRule[] = [];
  const nextPresetRegexRulesByPreset = Object.entries(presetRegexRulesByPreset).reduce<RegexRulesByPreset>(
    (result, [presetName, rules]) => {
      const normalizedPresetName = presetName.trim();
      if (!normalizedPresetName || !Array.isArray(rules)) {
        return result;
      }

      const nextRules = rules
        .map(rule => normalizeRegexRule(rule, normalizeOriginScope(rule?.originScope, 'preset')))
        .filter(rule => {
          if (rule.originScope === 'global') {
            extractedGlobalRules.push(rule);
            return false;
          }
          return true;
        });

      if (nextRules.length > 0) {
        result[normalizedPresetName] = nextRules;
      }
      return result;
    },
    {},
  );

  return {
    presetRegexRulesByPreset: nextPresetRegexRulesByPreset,
    extractedGlobalRules,
  };
}

function removePresetRulesDuplicatedWithGlobalRules(
  presetRegexRulesByPreset: RegexRulesByPreset,
  globalRules: RegexRule[],
): RegexRulesByPreset {
  if (globalRules.length === 0 || Object.keys(presetRegexRulesByPreset).length === 0) {
    return presetRegexRulesByPreset;
  }

  const globalSignatures = new Set(globalRules.map(getRegexRuleContentSignature));
  return Object.entries(presetRegexRulesByPreset).reduce<RegexRulesByPreset>((result, [presetName, rules]) => {
    const nextRules = rules.filter(rule => !globalSignatures.has(getRegexRuleContentSignature(rule)));
    if (nextRules.length > 0) {
      result[presetName] = nextRules;
    }
    return result;
  }, {});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSummaryApiConfig(apiConfig: Partial<SummaryApiConfig> | undefined): SummaryApiConfig {
  const normalizedSource =
    typeof apiConfig?.source === 'string' && apiConfig.source.trim()
      ? apiConfig.source.trim()
      : DEFAULT_SUMMARY_API_CONFIG.source;
  return {
    apiurl: typeof apiConfig?.apiurl === 'string' ? apiConfig.apiurl : DEFAULT_SUMMARY_API_CONFIG.apiurl,
    key: typeof apiConfig?.key === 'string' ? apiConfig.key : DEFAULT_SUMMARY_API_CONFIG.key,
    model: typeof apiConfig?.model === 'string' ? apiConfig.model : DEFAULT_SUMMARY_API_CONFIG.model,
    source: normalizedSource,
  };
}

function hasSummaryApiConfigContent(apiConfig: SummaryApiConfig): boolean {
  return Boolean(apiConfig.apiurl.trim() || apiConfig.key.trim() || apiConfig.model.trim());
}

function normalizeSummaryApiProfile(
  profile: unknown,
  fallbackIndex: number,
  seenIds: Set<string>,
): SummaryApiProfile | null {
  if (!isRecord(profile)) {
    return null;
  }

  const normalizedApiConfig = normalizeSummaryApiConfig(isRecord(profile.apiConfig) ? profile.apiConfig : undefined);
  const now = Date.now();
  let id =
    typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : `summary-api-${now}-${fallbackIndex}`;
  if (seenIds.has(id)) {
    id = `${id}-${fallbackIndex}`;
  }
  seenIds.add(id);

  return {
    id,
    name:
      typeof profile.name === 'string' && profile.name.trim()
        ? profile.name.trim()
        : `额外模型 API ${fallbackIndex + 1}`,
    apiConfig: normalizedApiConfig,
    createdAt: typeof profile.createdAt === 'number' && Number.isFinite(profile.createdAt) ? profile.createdAt : now,
    updatedAt: typeof profile.updatedAt === 'number' && Number.isFinite(profile.updatedAt) ? profile.updatedAt : now,
  };
}

function normalizeSummaryApiProfiles(apiProfiles: unknown): SummaryApiProfile[] {
  if (!Array.isArray(apiProfiles)) {
    return [];
  }

  const seenIds = new Set<string>();
  return apiProfiles
    .map((profile, index) => normalizeSummaryApiProfile(profile, index, seenIds))
    .filter((profile): profile is SummaryApiProfile => profile !== null);
}

function normalizeSummaryApiSelection(
  selection: unknown,
  profileIds: Set<string>,
  fallback: SummaryApiSelection = PRESET_SUMMARY_API_SELECTION,
): SummaryApiSelection {
  if (isRecord(selection) && selection.type === 'profile') {
    const profileId = typeof selection.profileId === 'string' ? selection.profileId.trim() : '';
    if (profileId && profileIds.has(profileId)) {
      return { type: 'profile', profileId };
    }
  }
  if (isRecord(selection) && selection.type === 'preset') {
    return { type: 'preset' };
  }
  return cloneSummaryApiSelection(fallback);
}

function normalizeSummarySettings(summarySettings: StoredSummarySettings | undefined): SummarySettings {
  const defaults = createDefaultSummarySettings();
  if (!summarySettings) {
    return defaults;
  }

  const apiProfiles = normalizeSummaryApiProfiles(summarySettings.apiProfiles);
  const legacyApiConfig = normalizeSummaryApiConfig(summarySettings.apiConfig);
  const legacySource =
    legacyApiConfig.source === 'openai' && legacyApiConfig.apiurl.trim() ? 'custom' : legacyApiConfig.source;
  const normalizedLegacyApiConfig = {
    ...legacyApiConfig,
    source: legacySource || DEFAULT_SUMMARY_API_CONFIG.source,
  };
  const shouldMigrateLegacyApi =
    summarySettings.apiMode === 'custom' || hasSummaryApiConfigContent(normalizedLegacyApiConfig);
  const hasLegacyProfile = apiProfiles.some(profile => profile.id === 'legacy-custom-api');

  if (shouldMigrateLegacyApi && !hasLegacyProfile) {
    apiProfiles.unshift({
      id: 'legacy-custom-api',
      name: '旧额外模型 API',
      apiConfig: normalizedLegacyApiConfig,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const profileIds = new Set(apiProfiles.map(profile => profile.id));
  const legacySelection: SummaryApiSelection =
    shouldMigrateLegacyApi && profileIds.has('legacy-custom-api')
      ? { type: 'profile', profileId: 'legacy-custom-api' }
      : { type: 'preset' };

  return {
    ...defaults,
    enabled: typeof summarySettings.enabled === 'boolean' ? summarySettings.enabled : defaults.enabled,
    variableUpdateMode:
      summarySettings.variableUpdateMode === 'extra' || summarySettings.variableUpdateMode === 'inline'
        ? summarySettings.variableUpdateMode
        : defaults.variableUpdateMode,
    stream: typeof summarySettings.stream === 'boolean' ? summarySettings.stream : defaults.stream,
    apiProfiles: apiProfiles.map(cloneSummaryApiProfile),
    summaryApiSelection: normalizeSummaryApiSelection(summarySettings.summaryApiSelection, profileIds, legacySelection),
    variableApiSelection: normalizeSummaryApiSelection(
      summarySettings.variableApiSelection,
      profileIds,
      legacySelection,
    ),
    promptTemplate:
      typeof summarySettings.promptTemplate === 'string' ? summarySettings.promptTemplate : defaults.promptTemplate,
    variablePromptTemplate:
      typeof summarySettings.variablePromptTemplate === 'string'
        ? summarySettings.variablePromptTemplate
            .replace(
              '【最近 5 层正文，已剥离旧 ERA 变量块，按旧到新排列】',
              '【正文上下文；最新 assistant 正文是唯一变化来源，前序完整轮次只读】',
            )
            .replace(
              '【当前变量上下文，来自输出提示词渲染结果或等价快照】',
              '【当前变量上下文；专用严格 JSON 投影】',
            )
        : defaults.variablePromptTemplate,
    variableContextRounds: summarySettings.variableContextRounds === 2 ? 2 : 1,
    thresholds: {
      ...defaults.thresholds,
      ...summarySettings.thresholds,
    },
  };
}

function getStringSetting(value: unknown, fallbackValue: string): string {
  return typeof value === 'string' ? value : fallbackValue;
}

function getNumberSetting(value: unknown, fallbackValue: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function getNullableStringSetting(value: unknown, fallbackValue: string | null): string | null {
  if (value === null) {
    return null;
  }
  return typeof value === 'string' ? value : fallbackValue;
}

function normalizeUiTheme(value: unknown): WuxiaUiTheme {
  return value === 'ink-wash' || value === 'dark-gold' ? value : DEFAULT_UI_THEME;
}

export function getThemeAppearanceDefaults(theme: WuxiaUiTheme): ThemeAppearanceDefaults {
  return THEME_APPEARANCE_DEFAULTS[theme];
}

function normalizeThemeAppearanceSettings(
  theme: WuxiaUiTheme,
  appearance: Partial<ThemeAppearanceSettings> | undefined,
  fallback: ThemeAppearanceSettings,
): ThemeAppearanceSettings {
  return createThemeAppearanceSettings(theme, {
    fontColor: getStringSetting(appearance?.fontColor, fallback.fontColor),
    backgroundColor: getStringSetting(appearance?.backgroundColor, fallback.backgroundColor),
    backgroundOpacity: getNumberSetting(appearance?.backgroundOpacity, fallback.backgroundOpacity),
    backgroundImage: getNullableStringSetting(appearance?.backgroundImage, fallback.backgroundImage),
    backgroundBlur: getNumberSetting(appearance?.backgroundBlur, fallback.backgroundBlur),
    chromeOpacity: getNumberSetting(appearance?.chromeOpacity, fallback.chromeOpacity),
    modalOpacity: getNumberSetting(appearance?.modalOpacity, fallback.modalOpacity),
  });
}

function cloneThemeAppearanceByTheme(themeAppearanceByTheme: ThemeAppearanceByTheme): ThemeAppearanceByTheme {
  return {
    'dark-gold': cloneThemeAppearanceSettings(themeAppearanceByTheme['dark-gold']),
    'ink-wash': cloneThemeAppearanceSettings(themeAppearanceByTheme['ink-wash']),
  };
}

function buildLegacyThemeAppearance(
  parsed: StoredDisplaySettings,
  theme: WuxiaUiTheme,
  defaults: ThemeAppearanceByTheme,
): ThemeAppearanceSettings {
  const fallback = defaults[theme];
  return createThemeAppearanceSettings(theme, {
    fontColor: getStringSetting(parsed.fontColor, fallback.fontColor),
    backgroundColor: getStringSetting(parsed.backgroundColor, fallback.backgroundColor),
    backgroundOpacity: getNumberSetting(parsed.backgroundOpacity, fallback.backgroundOpacity),
    backgroundImage: getNullableStringSetting(parsed.backgroundImage, fallback.backgroundImage),
    backgroundBlur: getNumberSetting(parsed.backgroundBlur, fallback.backgroundBlur),
    chromeOpacity: getNumberSetting(parsed.chromeOpacity, fallback.chromeOpacity),
    modalOpacity: getNumberSetting(parsed.modalOpacity, fallback.modalOpacity),
  });
}

function normalizeThemeAppearanceByTheme(
  storedThemeAppearanceByTheme: StoredThemeAppearanceByTheme | undefined,
  parsed: StoredDisplaySettings,
  activeTheme: WuxiaUiTheme,
): ThemeAppearanceByTheme {
  const defaultThemeAppearanceByTheme = createDefaultThemeAppearanceByTheme();
  const legacyActiveAppearance = buildLegacyThemeAppearance(parsed, activeTheme, defaultThemeAppearanceByTheme);

  return {
    'dark-gold': normalizeThemeAppearanceSettings(
      'dark-gold',
      storedThemeAppearanceByTheme?.['dark-gold'],
      activeTheme === 'dark-gold' ? legacyActiveAppearance : defaultThemeAppearanceByTheme['dark-gold'],
    ),
    'ink-wash': normalizeThemeAppearanceSettings(
      'ink-wash',
      storedThemeAppearanceByTheme?.['ink-wash'],
      activeTheme === 'ink-wash' ? legacyActiveAppearance : defaultThemeAppearanceByTheme['ink-wash'],
    ),
  };
}

function getActiveThemeAppearance(settings: DisplaySettings): ThemeAppearanceSettings {
  return {
    fontColor: settings.fontColor,
    backgroundColor: settings.backgroundColor,
    backgroundOpacity: settings.backgroundOpacity,
    backgroundImage: settings.backgroundImage,
    backgroundBlur: settings.backgroundBlur,
    chromeOpacity: settings.chromeOpacity,
    modalOpacity: settings.modalOpacity,
  };
}

export function syncThemeAppearanceSettings(settings: DisplaySettings): DisplaySettings {
  const nextThemeAppearanceByTheme = cloneThemeAppearanceByTheme(settings.themeAppearanceByTheme);
  nextThemeAppearanceByTheme[settings.uiTheme] = getActiveThemeAppearance(settings);

  return {
    ...settings,
    themeAppearanceByTheme: nextThemeAppearanceByTheme,
  };
}

export function updateThemeAppearanceSetting<K extends ThemeAppearanceSettingKey>(
  settings: DisplaySettings,
  key: K,
  value: ThemeAppearanceSettings[K],
): DisplaySettings {
  const nextThemeAppearanceByTheme = cloneThemeAppearanceByTheme(settings.themeAppearanceByTheme);
  nextThemeAppearanceByTheme[settings.uiTheme] = {
    ...nextThemeAppearanceByTheme[settings.uiTheme],
    [key]: value,
  };

  return {
    ...settings,
    [key]: value,
    themeAppearanceByTheme: nextThemeAppearanceByTheme,
  };
}

export function switchDisplayTheme(settings: DisplaySettings, nextTheme: WuxiaUiTheme): DisplaySettings {
  if (nextTheme === settings.uiTheme) {
    return settings;
  }

  const syncedSettings = syncThemeAppearanceSettings(settings);
  const nextAppearance = syncedSettings.themeAppearanceByTheme[nextTheme];

  return {
    ...syncedSettings,
    uiTheme: nextTheme,
    fontColor: nextAppearance.fontColor,
    backgroundColor: nextAppearance.backgroundColor,
    backgroundOpacity: nextAppearance.backgroundOpacity,
    backgroundImage: nextAppearance.backgroundImage,
    backgroundBlur: nextAppearance.backgroundBlur,
    chromeOpacity: nextAppearance.chromeOpacity,
    modalOpacity: nextAppearance.modalOpacity,
  };
}

function getImportableTavernRegexes(regexes: TavernRegex[], originScope: RegexRuleOriginScope): RegexRule[] {
  return regexes
    .filter(
      regex =>
        regex.enabled &&
        regex.min_depth === null &&
        regex.source.ai_output === true &&
        regex.destination.display === true &&
        regex.script_name !== '游戏页面',
    )
    .map(regex => ({
      id: generateId(),
      pattern: regex.find_regex,
      replacement: regex.replace_string,
      enabled: true,
      description: regex.script_name,
      originScope,
    }));
}

function getImportableTavernRegexesFromScope(
  scope: { type: 'global' } | { type: 'preset'; name: 'in_use' },
  originScope: RegexRuleOriginScope,
): RegexRule[] {
  return getImportableTavernRegexes(getTavernRegexes(scope), originScope);
}

function getRawPresetRegexesFromInUsePreset(): TavernRegex[] {
  try {
    if (typeof getPreset !== 'function') {
      return [];
    }

    const preset = getPreset('in_use');
    return Array.isArray(preset?.extensions?.regex_scripts) ? preset.extensions.regex_scripts : [];
  } catch (error) {
    dataLogger.error('从 in_use 预设读取酒馆正则失败:', error);
    return [];
  }
}

function getImportablePresetRegexesFromInUsePreset(): RegexRule[] {
  return getImportableTavernRegexes(getRawPresetRegexesFromInUsePreset(), 'preset');
}

function getRawTavernRegexesFromScope(scope: { type: 'global' } | { type: 'preset'; name: 'in_use' }): TavernRegex[] {
  try {
    if (typeof getTavernRegexes !== 'function') {
      return [];
    }
    return getTavernRegexes(scope);
  } catch (error) {
    dataLogger.error('读取酒馆正则失败:', error);
    return [];
  }
}

function filterPresetDerivedRegexesFromGlobalApi(regexes: TavernRegex[]): TavernRegex[] {
  if (regexes.length === 0) {
    return regexes;
  }

  const rawPresetIds = new Set(getRawPresetRegexesFromInUsePreset().map(regex => regex.id));
  return regexes.filter(regex => {
    if (!regex.id.startsWith('preset_')) {
      return true;
    }

    const normalizedId = regex.id.slice('preset_'.length);
    return rawPresetIds.size > 0 ? !rawPresetIds.has(normalizedId) : false;
  });
}

// =========================================
// 设置管理函数
// =========================================

/**
 * 从本地存储加载设置
 */
export function loadSettings(): DisplaySettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultDisplaySettings();
    }

    const parsed = JSON.parse(stored) as StoredDisplaySettings;
    const defaultSettings = createDefaultDisplaySettings();
    const legacyRegexRules = Array.isArray(parsed.regexRules) ? parsed.regexRules : undefined;
    const presetRegexRuleState = normalizePresetRegexRulesByPreset(parsed.presetRegexRulesByPreset);
    const importedGlobalRegexRules = importGlobalTavernRegexes();
    const uiTheme = normalizeUiTheme(parsed.uiTheme);
    const themeAppearanceByTheme = normalizeThemeAppearanceByTheme(parsed.themeAppearanceByTheme, parsed, uiTheme);
    const activeThemeAppearance = themeAppearanceByTheme[uiTheme];
    const localRegexRules = mergeExtractedGlobalRules(
      normalizeLocalRegexRules(Array.isArray(parsed.localRegexRules) ? parsed.localRegexRules : legacyRegexRules),
      presetRegexRuleState.extractedGlobalRules,
    );

    return {
      uiTheme,
      fontSize: getNumberSetting(parsed.fontSize, defaultSettings.fontSize),
      fontColor: activeThemeAppearance.fontColor,
      lineHeight: getNumberSetting(parsed.lineHeight, defaultSettings.lineHeight),
      backgroundColor: activeThemeAppearance.backgroundColor,
      backgroundOpacity: activeThemeAppearance.backgroundOpacity,
      backgroundImage: activeThemeAppearance.backgroundImage,
      backgroundBlur: activeThemeAppearance.backgroundBlur,
      chromeOpacity: activeThemeAppearance.chromeOpacity,
      modalOpacity: activeThemeAppearance.modalOpacity,
      themeAppearanceByTheme,
      localRegexRules,
      presetRegexRulesByPreset: removePresetRulesDuplicatedWithGlobalRules(
        presetRegexRuleState.presetRegexRulesByPreset,
        importedGlobalRegexRules,
      ),
      summarySettings: normalizeSummarySettings(parsed.summarySettings),
    };
  } catch (error) {
    dataLogger.warn('加载设置失败，使用默认设置:', error);
  }
  return createDefaultDisplaySettings();
}

/**
 * 保存设置到本地存储
 */
export function saveSettings(settings: DisplaySettings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(syncThemeAppearanceSettings(settings)));
    return true;
  } catch (error) {
    dataLogger.error('保存设置失败:', error);
    return false;
  }
}

/**
 * 重置设置为默认值
 */
export function resetSettings(): DisplaySettings {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    dataLogger.warn('清除设置失败:', error);
  }
  return createDefaultDisplaySettings();
}

/**
 * 获取当前加载的预设名称
 */
export function getLoadedPresetNameSafe(): string {
  try {
    if (typeof getLoadedPresetName !== 'function') {
      return '';
    }
    return (getLoadedPresetName() || '').trim();
  } catch (error) {
    dataLogger.warn('获取当前预设名称失败:', error);
    return '';
  }
}

/**
 * 获取当前预设对应的正则规则
 */
export function getCurrentPresetRegexRules(settings: DisplaySettings, currentPresetName: string): RegexRule[] {
  const normalizedPresetName = currentPresetName.trim();
  if (!normalizedPresetName) {
    return [];
  }
  return settings.presetRegexRulesByPreset[normalizedPresetName] || [];
}

/**
 * 获取用于正文显示的正则规则顺序
 * 顺序固定为：ERA 基础全局 -> 当前预设 -> 其它全局
 */
export function getRegexRulesForDisplay(settings: DisplaySettings, currentPresetName: string): RegexRule[] {
  const eraBaseRules = settings.localRegexRules.filter(rule => rule.id === ERA_BASE_REGEX_RULE.id);
  const otherLocalRules = settings.localRegexRules.filter(rule => rule.id !== ERA_BASE_REGEX_RULE.id);
  const currentPresetRules = getCurrentPresetRegexRules(settings, currentPresetName);
  return [...eraBaseRules, ...currentPresetRules, ...otherLocalRules];
}

export function getRegexDebugSnapshot(settings: DisplaySettings, currentPresetName: string): RegexDebugSnapshot {
  const normalizedCurrentPresetName = currentPresetName.trim();
  const localRegexRules = settings.localRegexRules.map(summarizeRegexRuleForDebug);
  const currentPresetRegexRules = getCurrentPresetRegexRules(settings, normalizedCurrentPresetName).map(
    summarizeRegexRuleForDebug,
  );
  const displayRegexRules = getRegexRulesForDisplay(settings, normalizedCurrentPresetName).map(
    summarizeRegexRuleForDebug,
  );
  const presetRegexBuckets = Object.fromEntries(
    Object.entries(settings.presetRegexRulesByPreset).map(([presetName, rules]) => [
      presetName,
      rules.map(summarizeRegexRuleForDebug),
    ]),
  );

  const rawGlobalApi = getRawTavernRegexesFromScope({ type: 'global' });
  const rawPresetApi = getRawTavernRegexesFromScope({ type: 'preset', name: 'in_use' });
  const rawPreset = getRawPresetRegexesFromInUsePreset();
  const importableGlobal = importGlobalTavernRegexes().map(summarizeRegexRuleForDebug);
  const importablePreset = importPresetTavernRegexes().map(summarizeRegexRuleForDebug);

  const rawPresetSignatures = new Set(
    rawPreset.map(regex =>
      getRegexRuleContentSignature({
        description: regex.script_name,
        pattern: regex.find_regex,
        replacement: regex.replace_string,
      }),
    ),
  );

  const globalApiMatchingRawPreset = rawGlobalApi
    .filter(regex =>
      rawPresetSignatures.has(
        getRegexRuleContentSignature({
          description: regex.script_name,
          pattern: regex.find_regex,
          replacement: regex.replace_string,
        }),
      ),
    )
    .map(regex => regex.script_name);

  return {
    currentPresetName: normalizedCurrentPresetName,
    counts: {
      localRegexRules: localRegexRules.length,
      currentPresetRegexRules: currentPresetRegexRules.length,
      displayRegexRules: displayRegexRules.length,
      presetBuckets: Object.keys(presetRegexBuckets).length,
      tavernGlobalApi: rawGlobalApi.length,
      tavernPresetApi: rawPresetApi.length,
      tavernRawPreset: rawPreset.length,
      importableGlobal: importableGlobal.length,
      importablePreset: importablePreset.length,
    },
    duplicates: {
      globalApiMatchingRawPreset,
    },
    frontend: {
      localRegexRules,
      currentPresetRegexRules,
      displayRegexRules,
      presetRegexBuckets,
    },
    tavern: {
      globalApi: rawGlobalApi.map(summarizeTavernRegexForDebug),
      presetApi: rawPresetApi.map(summarizeTavernRegexForDebug),
      rawPreset: rawPreset.map(summarizeTavernRegexForDebug),
      importableGlobal,
      importablePreset,
    },
  };
}

export function logRegexDebugSnapshot(
  settings: DisplaySettings,
  currentPresetName: string,
  reason: string = '手动调试',
): void {
  const snapshot = getRegexDebugSnapshot(settings, currentPresetName);
  console.groupCollapsed(`[武侠正则调试] ${reason}`);
  console.log('当前预设:', snapshot.currentPresetName || '(空)');
  console.log('数量概览:', snapshot.counts);
  console.log('global API 与 raw preset 的重复项:', snapshot.duplicates.globalApiMatchingRawPreset);
  console.log('前端预设桶:', Object.keys(snapshot.frontend.presetRegexBuckets));
  console.table(snapshot.frontend.localRegexRules);
  console.table(snapshot.frontend.currentPresetRegexRules);
  console.table(snapshot.frontend.displayRegexRules);
  console.table(snapshot.tavern.importableGlobal);
  console.table(snapshot.tavern.importablePreset);
  console.table(snapshot.tavern.globalApi);
  console.table(snapshot.tavern.presetApi);
  console.table(snapshot.tavern.rawPreset);
  console.log('完整快照对象:', snapshot);
  console.groupEnd();
}

export function scheduleRegexDebugDump(reason: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.setTimeout(() => {
    window.WuxiaRegexDebug?.dump(reason);
  }, 0);
}

/**
 * 设置当前预设的正则规则桶
 */
export function setPresetRegexRulesForPreset(
  settings: DisplaySettings,
  presetName: string,
  rules: RegexRule[],
): DisplaySettings {
  const normalizedPresetName = presetName.trim();
  if (!normalizedPresetName) {
    return settings;
  }

  const nextPresetRegexRulesByPreset = { ...settings.presetRegexRulesByPreset };
  if (rules.length === 0) {
    delete nextPresetRegexRulesByPreset[normalizedPresetName];
  } else {
    nextPresetRegexRulesByPreset[normalizedPresetName] = rules.map(rule =>
      normalizeRegexRule(rule, normalizeOriginScope(rule.originScope, 'preset')),
    );
  }

  return {
    ...settings,
    presetRegexRulesByPreset: nextPresetRegexRulesByPreset,
  };
}

/**
 * 将某个预设桶重命名为新的预设名
 */
export function renamePresetRegexBucket(settings: DisplaySettings, oldName: string, newName: string): DisplaySettings {
  const normalizedOldName = oldName.trim();
  const normalizedNewName = newName.trim();
  if (!normalizedOldName || !normalizedNewName || normalizedOldName === normalizedNewName) {
    return settings;
  }

  const currentRules = settings.presetRegexRulesByPreset[normalizedOldName];
  if (!currentRules) {
    return settings;
  }

  const nextPresetRegexRulesByPreset = { ...settings.presetRegexRulesByPreset };
  delete nextPresetRegexRulesByPreset[normalizedOldName];
  nextPresetRegexRulesByPreset[normalizedNewName] = currentRules;

  return {
    ...settings,
    presetRegexRulesByPreset: nextPresetRegexRulesByPreset,
  };
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建新的正则规则
 */
export function createRegexRule(
  pattern: string = '',
  replacement: string = '',
  description: string = '',
  originScope: RegexRuleOriginScope = 'manual',
): RegexRule {
  return {
    id: generateId(),
    pattern,
    replacement,
    enabled: true,
    description,
    originScope,
  };
}

/**
 * 从正则表达式字符串中解析出模式和标志
 * 支持格式: "/pattern/flags" 或 "pattern"
 * @returns { pattern: string, flags: string }
 */
function parseRegexString(input: string): { pattern: string; flags: string } {
  const regexLiteralMatch = input.match(/^\/(.*)\/([gimsuy]*)$/s);
  if (regexLiteralMatch) {
    return {
      pattern: regexLiteralMatch[1],
      flags: regexLiteralMatch[2] || 'g',
    };
  }
  return {
    pattern: input,
    flags: 'g',
  };
}

const regexCache = new Map<string, RegExp>();

function getCachedRegex(pattern: string, flags: string): RegExp {
  const finalFlags = flags.includes('g') ? flags : 'g' + flags;
  const cacheKey = `${finalFlags}\n${pattern}`;
  const cached = regexCache.get(cacheKey);
  if (cached) {
    cached.lastIndex = 0;
    return cached;
  }

  const regex = new RegExp(pattern, finalFlags);
  regexCache.set(cacheKey, regex);
  return regex;
}

/**
 * 应用正则替换规则到文本
 * 支持用户在 pattern 中使用 /pattern/flags 格式指定标志
 * 例如: /(<think>.*?<\/think>)/gs 会使用 gs 标志
 */
export function applyRegexRules(text: string, rules: RegexRule[]): string {
  let result = text;
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      const { pattern, flags } = parseRegexString(rule.pattern);
      const regex = getCachedRegex(pattern, flags);
      result = result.replace(regex, rule.replacement);
    } catch (error) {
      dataLogger.warn(`正则规则 "${rule.pattern}" 无效:`, error);
    }
  }
  return result;
}

/**
 * 验证正则表达式是否有效
 * 支持格式: "/pattern/flags" 或 "pattern"
 */
export function validateRegex(pattern: string): { valid: boolean; error?: string } {
  if (!pattern) {
    return { valid: true };
  }
  try {
    const { pattern: regexPattern, flags } = parseRegexString(pattern);
    new RegExp(regexPattern, flags);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

/**
 * 将图片文件转换为 base64
 */
export function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('读取文件失败'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * 生成 CSS 变量对象，用于应用设置到样式
 */
export function generateCSSVariables(settings: DisplaySettings): Record<string, string> {
  const themeDefaults = THEME_APPEARANCE_DEFAULTS[settings.uiTheme];
  const cssUrl = (url: string) => `url("${url}")`;
  const clampUnit = (value: number) => Math.min(1, Math.max(0, value));
  const buildOpacitySegments = (value: number, defaultValue: number) => {
    const safeDefault = Math.min(0.95, Math.max(0.05, defaultValue));
    const clampedValue = clampUnit(value);
    const low = clampedValue <= safeDefault ? clampedValue / safeDefault : 1;
    const high = clampedValue > safeDefault ? (clampedValue - safeDefault) / (1 - safeDefault) : 0;
    return {
      value: clampedValue,
      defaultValue: safeDefault,
      low,
      high,
    };
  };
  const chromeOpacity = buildOpacitySegments(settings.chromeOpacity, themeDefaults.chromeOpacity);
  const modalOpacity = buildOpacitySegments(settings.modalOpacity, themeDefaults.modalOpacity);

  return {
    '--content-font-size': `${settings.fontSize}px`,
    '--content-font-color': settings.fontColor,
    '--content-line-height': `${settings.lineHeight}`,
    '--content-bg-color': settings.backgroundColor,
    '--content-bg-opacity': `${settings.backgroundOpacity}`,
    '--content-bg-blur': `${settings.backgroundBlur}px`,
    '--wuxia-chrome-opacity': `${chromeOpacity.value}`,
    '--wuxia-chrome-opacity-default': `${chromeOpacity.defaultValue}`,
    '--wuxia-chrome-opacity-low': `${chromeOpacity.low}`,
    '--wuxia-chrome-opacity-high': `${chromeOpacity.high}`,
    '--wuxia-modal-opacity': `${modalOpacity.value}`,
    '--wuxia-modal-opacity-default': `${modalOpacity.defaultValue}`,
    '--wuxia-modal-opacity-low': `${modalOpacity.low}`,
    '--wuxia-modal-opacity-high': `${modalOpacity.high}`,
    '--wuxia-ink-bg-image': cssUrl(inkWashBackgroundUrl),
    '--wuxia-ink-panel-rect-lg': cssUrl(inkWashPanelRectLgUrl),
    '--wuxia-ink-panel-rect-xl': cssUrl(inkWashPanelRectXlUrl),
    '--wuxia-ink-panel-bar-md': cssUrl(inkWashPanelBarMdUrl),
    '--wuxia-ink-brush-bar-md': cssUrl(inkWashBrushBarMdUrl),
    '--wuxia-ink-circle-frame': cssUrl(inkWashCircleFrameInkUrl),
    '--wuxia-ink-icon-circle': cssUrl(inkWashIconCircleInkUrl),
    '--wuxia-ink-icon-square-dark': cssUrl(inkWashIconSquareDarkUrl),
  };
}

/**
 * 应用设置到文档根元素
 */
export function applySettingsToDOM(settings: DisplaySettings): void {
  const root = document.documentElement;
  const cssVars = generateCSSVariables(settings);

  root.dataset.uiTheme = settings.uiTheme;
  root.style.colorScheme = settings.uiTheme === 'ink-wash' ? 'light' : 'dark';

  Object.entries(cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

// =========================================
// 酒馆正则导入功能
// =========================================

/**
 * 从全局酒馆正则导入符合条件的规则
 */
export function importGlobalTavernRegexes(): RegexRule[] {
  try {
    const rawGlobalRegexes = getRawTavernRegexesFromScope({ type: 'global' });
    const globalRules = getImportableTavernRegexes(filterPresetDerivedRegexesFromGlobalApi(rawGlobalRegexes), 'global');
    const presetRules = getImportablePresetRegexesFromInUsePreset();
    if (presetRules.length === 0) {
      return globalRules;
    }

    const presetSignatures = new Set(presetRules.map(getRegexRuleContentSignature));
    return globalRules.filter(rule => !presetSignatures.has(getRegexRuleContentSignature(rule)));
  } catch (error) {
    dataLogger.error('导入全局酒馆正则失败:', error);
    return [];
  }
}

/**
 * 从当前预设酒馆正则导入符合条件的规则
 */
export function importPresetTavernRegexes(): RegexRule[] {
  try {
    return getImportablePresetRegexesFromInUsePreset();
  } catch (error) {
    dataLogger.error('导入当前预设酒馆正则失败:', error);
    return [];
  }
}

/**
 * 从酒馆正则导入符合条件的正则规则
 * 导入来源：
 * - global
 * - preset(in_use)
 *
 * 筛选条件：
 * - 已启用（enabled: true）
 * - 无最小深度（min_depth: null）
 * - 有 AI 输出（source.ai_output: true）
 * - 有格式显示作用（destination.display: true）
 * - 名称不为"游戏页面"（排除游戏页面专用正则）
 *
 * 注意：导入后的正则默认开启，沿用酒馆中已启用的筛选结果
 */
export function importTavernRegexes(): RegexRule[] {
  try {
    const globalRegexRules = importGlobalTavernRegexes();
    const presetRegexRules = importPresetTavernRegexes();
    return [...globalRegexRules, ...presetRegexRules];
  } catch (error) {
    dataLogger.error('导入酒馆正则失败:', error);
    return [];
  }
}

/**
 * 获取可导入的酒馆正则数量（预览用）
 */
export function getImportableTavernRegexCount(): number {
  return importTavernRegexes().length;
}
