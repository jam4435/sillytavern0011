/**
 * 用户设定脚本 - Persona 管理助手
 *
 * 功能：
 * - 快速切换用户角色 (Persona)
 * - 一键锁定 Persona 到当前聊天/角色
 * - 同步所有消息到当前 Persona
 * - 显示当前 Persona 状态
 * - 每个角色独立的设定列表，开启后自动拼接到人设描述中
 */

import { bindEventListeners, initPanel, injectStylesToIframe } from './ui';

// ==================== 初始化 ====================

/**
 * 初始化脚本
 */
function initialize(): void {
  console.log('用户设定脚本: 开始初始化...');

  // 1. 注入样式到当前 iframe
  injectStylesToIframe();

  // 2. 创建 UI，包括主面板样式和扩展栏按钮
  initPanel();

  // 3. 绑定事件，让点击按钮能触发相应功能
  bindEventListeners();

  console.log('用户设定脚本: 初始化完成');
}

// 启动脚本
$(() => {
  initialize();
});
