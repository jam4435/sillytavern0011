/**
 * 分类日志工具
 * 生产环境自动禁用所有日志，开发环境可按类别控制
 */

export type LogCategory = 'init' | 'message' | 'event' | 'game' | 'api' | 'ui' | 'data';

// 开发环境下各类别的日志开关
const DEBUG_CATEGORIES: Record<LogCategory, boolean> = {
  init: true,      // 初始化流程
  message: true,   // 消息处理
  event: true,     // 事件监听
  game: true,      // 游戏状态
  api: true,       // API 调用
  ui: true,        // UI 组件
  data: true,      // 数据读取/解析
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

export interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  group: (label: string) => void;
  groupEnd: () => void;
}

// 空操作函数
const noop = () => {};

/**
 * 创建分类日志器
 * @param category 日志类别
 * @returns Logger 对象
 */
export function createLogger(category: LogCategory): Logger {
  const enabled = isDev && DEBUG_CATEGORIES[category];
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

// 预创建的常用日志器
export const initLogger = createLogger('init');
export const messageLogger = createLogger('message');
export const eventLogger = createLogger('event');
export const gameLogger = createLogger('game');
export const apiLogger = createLogger('api');
export const uiLogger = createLogger('ui');
export const dataLogger = createLogger('data');

// 简单的全局日志器（用于不需要分类的场景）
export const logger: Logger = {
  log: isDev ? console.log.bind(console) : noop,
  error: isDev ? console.error.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : noop,
  group: isDev ? console.group.bind(console) : noop,
  groupEnd: isDev ? console.groupEnd.bind(console) : noop,
};
