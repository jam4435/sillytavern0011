/**
 * 命令注册中心
 * 使用命令模式管理所有 data-action 处理器
 */

/** @type {Map<string, (context: CommandContext) => Promise<void> | void>} */
const commandHandlers = new Map();

/**
 * 命令执行上下文
 * @typedef {Object} CommandContext
 * @property {JQuery.TriggeredEvent} event - 原始事件对象
 * @property {JQuery} $target - 事件目标元素 $(e.target)
 * @property {JQuery} $actionTarget - 带有 data-action 的元素
 * @property {JQuery} $panel - 主面板元素
 * @property {Document} parentDoc - 父文档
 * @property {string} [lorebookName] - 世界书名称（如果适用）
 * @property {boolean} [isGlobal] - 是否为全局世界书（如果适用）
 * @property {number} [numericUid] - 条目UID（如果适用）
 * @property {JQuery} [$item] - 条目元素（如果适用）
 * @property {JQuery} [$title] - 标题元素（如果适用）
 * @property {Function} refreshList - 刷新列表的函数
 */

/**
 * 注册命令处理器
 * @param {string} action - 命令名称（对应 data-action 属性值）
 * @param {(context: CommandContext) => Promise<void> | void} handler - 处理函数
 */
export function registerCommand(action, handler) {
  if (commandHandlers.has(action)) {
    console.warn(`[Commands] 命令 "${action}" 已存在，将被覆盖`);
  }
  commandHandlers.set(action, handler);
}

/**
 * 批量注册命令
 * @param {Record<string, (context: CommandContext) => Promise<void> | void>} commands - 命令映射对象
 */
export function registerCommands(commands) {
  for (const [action, handler] of Object.entries(commands)) {
    registerCommand(action, handler);
  }
}

/**
 * 分发命令到对应的处理器
 * @param {string} action - 命令名称
 * @param {CommandContext} context - 命令上下文
 * @returns {Promise<boolean>} - 是否找到并执行了处理器
 */
export async function dispatchCommand(action, context) {
  const handler = commandHandlers.get(action);
  if (!handler) {
    return false;
  }

  try {
    await handler(context);
    return true;
  } catch (error) {
    console.error(`[Commands] 执行命令 "${action}" 时出错:`, error);
    throw error;
  }
}

/**
 * 检查命令是否已注册
 * @param {string} action - 命令名称
 * @returns {boolean}
 */
export function hasCommand(action) {
  return commandHandlers.has(action);
}

/**
 * 获取所有已注册的命令名称
 * @returns {string[]}
 */
export function getRegisteredCommands() {
  return Array.from(commandHandlers.keys());
}
