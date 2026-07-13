import {
  initDesktopAiWorkspace,
  refreshDesktopAiWorkspace,
  resetDesktopAiWorkspace,
} from './aiWorkspaceDesktop.js';

/**
 * AI 修改页的稳定入口。
 *
 * 工作台现在只有一套响应式实现；保留这三个导出，避免 panel.js 和其他
 * 调用方依赖具体的视图模块名称。
 */
export function initAiWorkspace() {
  return initDesktopAiWorkspace();
}

export function resetAiWorkspace() {
  return resetDesktopAiWorkspace();
}

export const refreshAiWorkspace = refreshDesktopAiWorkspace;
