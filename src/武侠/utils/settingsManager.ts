/**
 * 设置管理工具
 * 用于管理前端显示设置的持久化存储
 */

import { dataLogger } from './logger';

// =========================================
// 类型定义
// =========================================

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
  regexRules: RegexRule[];

  // 自动总结设置
  summarySettings: SummarySettings;
}

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

export const DEFAULT_SETTINGS: DisplaySettings = {
  fontSize: 16,
  fontColor: '#e7e5e4', // stone-200
  lineHeight: 1.8,

  backgroundColor: '#0c0a09', // stone-950
  backgroundOpacity: 0.85,
  backgroundImage: null,
  backgroundBlur: 0,

  regexRules: [ERA_BASE_REGEX_RULE],

  summarySettings: DEFAULT_SUMMARY_SETTINGS,
};

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
export const DEFAULT_REGEX_SETTINGS = {
  regexRules: DEFAULT_SETTINGS.regexRules,
} as const;

/** 自动总结设置的默认值 */
export const DEFAULT_SUMMARY_TAB_SETTINGS = {
  summarySettings: DEFAULT_SUMMARY_SETTINGS,
} as const;

// =========================================
// 本地存储键名
// =========================================

const STORAGE_KEY = 'wuxia_display_settings';

// =========================================
// 设置管理函数
// =========================================

/**
 * 从本地存储加载设置
 */
export function loadSettings(): DisplaySettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DisplaySettings>;
      // 合并默认设置，确保所有字段都存在
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      // 确保 summarySettings 完整（处理旧设置迁移）
      if (!parsed.summarySettings) {
        merged.summarySettings = DEFAULT_SUMMARY_SETTINGS;
      } else {
        merged.summarySettings = {
          ...DEFAULT_SUMMARY_SETTINGS,
          ...parsed.summarySettings,
          apiConfig: {
            ...DEFAULT_SUMMARY_SETTINGS.apiConfig,
            ...parsed.summarySettings.apiConfig,
          },
          thresholds: {
            ...DEFAULT_SUMMARY_SETTINGS.thresholds,
            ...parsed.summarySettings.thresholds,
          },
        };
      }
      return merged;
    }
  } catch (error) {
    dataLogger.warn('加载设置失败，使用默认设置:', error);
  }
  return { ...DEFAULT_SETTINGS };
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
  return { ...DEFAULT_SETTINGS };
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
export function createRegexRule(pattern: string = '', replacement: string = '', description: string = ''): RegexRule {
  return {
    id: generateId(),
    pattern,
    replacement,
    enabled: true,
    description,
  };
}

/**
 * 从正则表达式字符串中解析出模式和标志
 * 支持格式: "/pattern/flags" 或 "pattern"
 * @returns { pattern: string, flags: string }
 */
function parseRegexString(input: string): { pattern: string; flags: string } {
  // 检查是否是 /pattern/flags 格式
  const regexLiteralMatch = input.match(/^\/(.*)\/([gimsuy]*)$/s);
  if (regexLiteralMatch) {
    return {
      pattern: regexLiteralMatch[1],
      flags: regexLiteralMatch[2] || 'g',
    };
  }
  // 普通字符串格式，默认使用 'g' 标志
  return {
    pattern: input,
    flags: 'g',
  };
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
      // 确保至少有 'g' 标志用于全局替换
      const finalFlags = flags.includes('g') ? flags : 'g' + flags;
      const regex = new RegExp(pattern, finalFlags);
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
 * 从酒馆正则导入符合条件的正则规则
 * 筛选条件：
 * - 已启用（enabled: true）
 * - 无最小深度（min_depth: null）
 * - 有 AI 输出（source.ai_output: true）
 * - 仅格式显示（destination.display: true）
 * - 名称不为"游戏页面"（排除游戏页面专用正则）
 *
 * 只导入：正则名称（description）、正则表达式（pattern）、替换内容（replacement）
 * 注意：导入后的正则默认关闭，需要用户手动启用
 *
 * @returns 转换后的 RegexRule 数组
 */
export function importTavernRegexes(): RegexRule[] {
  try {
    // 获取所有已启用的酒馆正则
    const tavernRegexes = getTavernRegexes({ enable_state: 'enabled' });

    // 筛选符合条件的正则：
    // - 无最小深度 (min_depth === null)
    // - 有 AI 输出 (source.ai_output === true)
    // - 仅格式显示 (destination.display === true)
    // - 名称不为"游戏页面"（排除游戏页面专用正则）
    const filteredRegexes = tavernRegexes.filter(
      regex =>
        regex.min_depth === null &&
        regex.source.ai_output === true &&
        regex.destination.display === true &&
        regex.script_name !== '游戏页面',
    );

    // 转换为 RegexRule 格式
    // 只导入：正则名称、正则表达式、替换内容
    // 导入后默认关闭，需要用户手动启用
    const regexRules: RegexRule[] = filteredRegexes.map(regex => ({
      id: generateId(),
      pattern: regex.find_regex,
      replacement: regex.replace_string,
      enabled: false,
      description: regex.script_name,
    }));

    return regexRules;
  } catch (error) {
    dataLogger.error('导入酒馆正则失败:', error);
    return [];
  }
}

/**
 * 获取可导入的酒馆正则数量（预览用）
 * 使用相同的筛选条件（包括排除"游戏页面"正则）
 *
 * @returns 符合条件的正则数量
 */
export function getImportableTavernRegexCount(): number {
  try {
    const tavernRegexes = getTavernRegexes({ enable_state: 'enabled' });

    const filteredCount = tavernRegexes.filter(
      regex =>
        regex.min_depth === null &&
        regex.source.ai_output === true &&
        regex.destination.display === true &&
        regex.script_name !== '游戏页面',
    ).length;

    return filteredCount;
  } catch (error) {
    dataLogger.error('获取酒馆正则数量失败:', error);
    return 0;
  }
}
