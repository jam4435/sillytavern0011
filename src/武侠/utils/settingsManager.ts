/**
 * 设置管理工具
 * 用于管理前端显示设置的持久化存储
 */

import { dataLogger } from './logger';

// =========================================
// 类型定义
// =========================================

export type RegexRuleOriginScope = 'manual' | 'global' | 'preset';

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
  source?: string;
}

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
  /** API配置 */
  apiConfig: SummaryApiConfig;
  /** 提示词模板 */
  promptTemplate: string;
  /** 触发阈值 */
  thresholds: SummaryThresholds;
}

export type RegexRulesByPreset = Record<string, RegexRule[]>;

/** 显示设置 */
export interface DisplaySettings {
  // 正文字体设置
  fontSize: number; // 字体大小 (px)
  fontColor: string; // 字体颜色 (hex)
  lineHeight: number; // 行高倍数

  // 背景设置
  backgroundColor: string; // 背景颜色 (hex)
  backgroundOpacity: number; // 背景透明度 (0-1)
  backgroundImage: string | null; // 背景图片 (base64 或 URL)
  backgroundBlur: number; // 背景模糊度 (px)

  // 正则替换规则
  localRegexRules: RegexRule[];
  presetRegexRulesByPreset: RegexRulesByPreset;

  // 自动总结设置
  summarySettings: SummarySettings;
}

type StoredDisplaySettings = Partial<Omit<DisplaySettings, 'localRegexRules' | 'presetRegexRulesByPreset'>> & {
  regexRules?: Partial<RegexRule>[];
  localRegexRules?: Partial<RegexRule>[];
  presetRegexRulesByPreset?: Record<string, Partial<RegexRule>[]>;
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

/** 默认自动总结设置 */
export const DEFAULT_SUMMARY_SETTINGS: SummarySettings = {
  enabled: false,
  apiConfig: {
    apiurl: '',
    key: '',
    model: '',
    source: 'openai',
  },
  promptTemplate: DEFAULT_SUMMARY_PROMPT_TEMPLATE,
  thresholds: {
    pendingQueueThreshold: 5,
    totalEntriesThreshold: 50,
    perCharacterEntriesThreshold: 10,
  },
};

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
  return {
    fontSize: 16,
    fontColor: '#e7e5e4', // stone-200
    lineHeight: 1.8,

    backgroundColor: '#0c0a09', // stone-950
    backgroundOpacity: 0.85,
    backgroundImage: null,
    backgroundBlur: 0,

    ...createDefaultRegexSettings(),

    summarySettings: DEFAULT_SUMMARY_SETTINGS,
  };
}

export const DEFAULT_SETTINGS: DisplaySettings = createDefaultDisplaySettings();

/** 正文显示设置的默认值 */
export const DEFAULT_DISPLAY_SETTINGS = {
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
} as const;

/** 正则替换设置的默认值 */
export const DEFAULT_REGEX_SETTINGS = createDefaultRegexSettings();

/** 自动总结设置的默认值 */
export const DEFAULT_SUMMARY_TAB_SETTINGS = {
  summarySettings: DEFAULT_SUMMARY_SETTINGS,
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
  const nextPresetRegexRulesByPreset = Object.entries(presetRegexRulesByPreset).reduce<RegexRulesByPreset>((result, [presetName, rules]) => {
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
  }, {});

  return {
    presetRegexRulesByPreset: nextPresetRegexRulesByPreset,
    extractedGlobalRules,
  };
}

function normalizeSummarySettings(summarySettings: Partial<SummarySettings> | undefined): SummarySettings {
  if (!summarySettings) {
    return DEFAULT_SUMMARY_SETTINGS;
  }

  return {
    ...DEFAULT_SUMMARY_SETTINGS,
    ...summarySettings,
    apiConfig: {
      ...DEFAULT_SUMMARY_SETTINGS.apiConfig,
      ...summarySettings.apiConfig,
    },
    thresholds: {
      ...DEFAULT_SUMMARY_SETTINGS.thresholds,
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

function getImportableTavernRegexesFromScope(
  scope: { type: 'global' } | { type: 'preset'; name: 'in_use' },
  originScope: RegexRuleOriginScope,
): RegexRule[] {
  const regexes = getTavernRegexes(scope);

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
    const localRegexRules = mergeExtractedGlobalRules(
      normalizeLocalRegexRules(
      Array.isArray(parsed.localRegexRules) ? parsed.localRegexRules : legacyRegexRules,
      ),
      presetRegexRuleState.extractedGlobalRules,
    );

    return {
      fontSize: getNumberSetting(parsed.fontSize, defaultSettings.fontSize),
      fontColor: getStringSetting(parsed.fontColor, defaultSettings.fontColor),
      lineHeight: getNumberSetting(parsed.lineHeight, defaultSettings.lineHeight),
      backgroundColor: getStringSetting(parsed.backgroundColor, defaultSettings.backgroundColor),
      backgroundOpacity: getNumberSetting(parsed.backgroundOpacity, defaultSettings.backgroundOpacity),
      backgroundImage: getNullableStringSetting(parsed.backgroundImage, defaultSettings.backgroundImage),
      backgroundBlur: getNumberSetting(parsed.backgroundBlur, defaultSettings.backgroundBlur),
      localRegexRules,
      presetRegexRulesByPreset: presetRegexRuleState.presetRegexRulesByPreset,
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
  return {
    '--content-font-size': `${settings.fontSize}px`,
    '--content-font-color': settings.fontColor,
    '--content-line-height': `${settings.lineHeight}`,
    '--content-bg-color': settings.backgroundColor,
    '--content-bg-opacity': `${settings.backgroundOpacity}`,
    '--content-bg-blur': `${settings.backgroundBlur}px`,
  };
}

/**
 * 应用设置到文档根元素
 */
export function applySettingsToDOM(settings: DisplaySettings): void {
  const root = document.documentElement;
  const cssVars = generateCSSVariables(settings);

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
    return getImportableTavernRegexesFromScope({ type: 'global' }, 'global');
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
    return getImportableTavernRegexesFromScope({ type: 'preset', name: 'in_use' }, 'preset');
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
 * - 仅格式显示（destination.display: true）
 * - 名称不为"游戏页面"（排除游戏页面专用正则）
 *
 * 注意：导入后的正则默认关闭，需要用户手动启用
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
