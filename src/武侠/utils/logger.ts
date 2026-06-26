/**
 * 分类日志工具
 * 生产环境自动禁用所有日志，开发环境可按类别控制
 */

export type LogCategory = 'init' | 'message' | 'event' | 'game' | 'api' | 'ui' | 'data';

// 开发环境下各类别的默认日志开关。默认关闭，避免酒馆 iframe 初始化时打印大量变量和长文本。
const DEBUG_CATEGORIES: Record<LogCategory, boolean> = {
  init: false,      // 初始化流程
  message: false,   // 消息处理
  event: false,     // 事件监听
  game: false,      // 游戏状态
  api: false,       // API 调用
  ui: false,        // UI 组件
  data: false,      // 数据读取/解析
};

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

// 类别前缀样式
const CATEGORY_STYLES: Record<LogCategory, string> = {
  init: '🎮',
  message: '💬',
  event: '📡',
  game: '🎯',
  api: '🌐',
  ui: '🖼️',
  data: '📊',
};

function getDebugOverride(category: LogCategory): boolean {
  if (!isDev || typeof localStorage === 'undefined') {
    return false;
  }

  try {
    const enabled = localStorage.getItem('wuxia_debug_categories') || localStorage.getItem('wuxia_debug');
    if (!enabled) {
      return DEBUG_CATEGORIES[category];
    }

    if (enabled === 'true' || enabled === 'all') {
      return true;
    }

    const categories = enabled.split(',').map(item => item.trim().toLowerCase());
    return categories.includes(category);
  } catch {
    return DEBUG_CATEGORIES[category];
  }
}

export interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  group: (label: string) => void;
  groupEnd: () => void;
}

export interface RuntimeDebugInfo {
  runtimeId: string;
  iframeName: string;
  href: string;
  createdAt: number;
  readyState: string;
  visibilityState: string;
}

// 空操作函数
const noop = () => {};

const safeGetIframeName = (): string => {
  try {
    if (typeof getIframeName === 'function') {
      const iframeName = getIframeName();
      if (typeof iframeName === 'string' && iframeName.trim()) {
        return iframeName.trim();
      }
    }
  } catch {
    // ignore
  }

  try {
    const frameId = window.frameElement?.id;
    if (typeof frameId === 'string' && frameId.trim()) {
      return frameId.trim();
    }
  } catch {
    // ignore
  }

  return 'unknown';
};

const RUNTIME_CREATED_AT = Date.now();
const RUNTIME_ID = `${RUNTIME_CREATED_AT.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function getRuntimeDebugInfo(): RuntimeDebugInfo {
  return {
    runtimeId: RUNTIME_ID,
    iframeName: safeGetIframeName(),
    href: typeof window !== 'undefined' ? window.location.href : '',
    createdAt: RUNTIME_CREATED_AT,
    readyState: typeof document !== 'undefined' ? document.readyState : 'unknown',
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
  };
}

/**
 * 创建分类日志器
 * @param category 日志类别
 * @returns Logger 对象
 */
export function createLogger(category: LogCategory): Logger {
  const enabled = getDebugOverride(category);
  const prefix = `${CATEGORY_STYLES[category]} [${category.toUpperCase()}]`;

  if (!enabled) {
    return {
      log: noop,
      error: noop,
      warn: noop,
      group: noop,
      groupEnd: noop,
    };
  }

  return {
    log: (...args: unknown[]) => console.log(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    group: (label: string) => console.group(`${prefix} ${label}`),
    groupEnd: () => console.groupEnd(),
  };
}

export function createForcedLogger(prefix: string): Logger {
  const runtimePrefix = `${prefix}#${RUNTIME_ID}`;
  return {
    log: (...args: unknown[]) => console.log(runtimePrefix, ...args),
    error: (...args: unknown[]) => console.error(runtimePrefix, ...args),
    warn: (...args: unknown[]) => console.warn(runtimePrefix, ...args),
    group: (label: string) => console.group(`${runtimePrefix} ${label}`),
    groupEnd: () => console.groupEnd(),
  };
}

// 预创建的常用日志器
export const initLogger = createLogger('init');
export const messageLogger = createLogger('message');
export const eventLogger = createLogger('event');
export const gameLogger = createLogger('game');
export const apiLogger = createLogger('api');
export const uiLogger = createLogger('ui');
export const dataLogger = createLogger('data');
export const variableTraceLogger = createForcedLogger('[wuxia-variable-trace]');
export const variableBarLogger = createForcedLogger('[wuxia-variable-bar]');

// 简单的全局日志器（用于不需要分类的场景）
const globalLoggerEnabled = getDebugOverride('game');
export const logger: Logger = {
  log: globalLoggerEnabled ? console.log.bind(console) : noop,
  error: globalLoggerEnabled ? console.error.bind(console) : noop,
  warn: globalLoggerEnabled ? console.warn.bind(console) : noop,
  group: globalLoggerEnabled ? console.group.bind(console) : noop,
  groupEnd: globalLoggerEnabled ? console.groupEnd.bind(console) : noop,
};
