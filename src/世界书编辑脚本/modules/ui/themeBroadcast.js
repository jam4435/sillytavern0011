/**
 * 主题动态广播微型模块 (PoC 实验)
 * 职责：将计算好的主题 CSS 变量直接以 <style> 标签形式注入到 parentDoc.head 中，
 * 作用于主面板及挂载在 body 下的独立弹窗，避免 DOM 嵌套引起的移动端绘制图层丢失。
 * 随时可安全卸载，零副作用。
 */

export const THEME_BROADCAST_STYLE_ID = 'lorebook-theme-dynamic-styles';

// 广播目标选择器列表：精准限定在插件自身的面板与弹窗 ID 上，绝不污染酒馆宿主网页
export const THEME_BROADCAST_SELECTORS = [
  '#character-lorebook-panel',
  '#lorebook-optimize-modal',
  '#theme-settings-modal',
  '#lorebook-import-modal',
  '#lorebook-copy-modal',
  '#lorebook-position-modal',
  '#lorebook-reorder-modal',
  '#search-preview-modal',
  '#lorebook-compare-modal',
  '#lorebook-entry-editor',
  '#content-editor-modal',
  '#compare-editor-modal',
  '#ai-action-dialog-modal',
  '#rollback-preview-modal',
  '#character-lorebook-floating-bubble',
  '.lorebook-theme-scope',
];

/**
 * 将 CSS 变量对象编译为 CSS 规则字符串
 */
export function buildThemeBroadcastCss(variables = {}, colorScheme = 'dark', selectors = THEME_BROADCAST_SELECTORS) {
  const declarations = Object.entries(variables)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([prop, value]) => `  ${prop}: ${value};`)
    .join('\n');

  const colorSchemeDecl = colorScheme ? `  color-scheme: ${colorScheme};\n` : '';
  const selectorList = selectors.join(',\n');

  return `/* 世界书编辑助手 - 动态主题广播样式表 (自动维护，请勿手动编辑) */\n${selectorList} {\n${declarations}\n${colorSchemeDecl}}`;
}

/**
 * 广播同步主题变量到 parentDoc.head
 */
export function syncThemeBroadcast(parentDoc, variables = {}, colorScheme = 'dark', selectors = THEME_BROADCAST_SELECTORS) {
  if (!parentDoc?.head) {
    return;
  }

  const cssText = buildThemeBroadcastCss(variables, colorScheme, selectors);
  let styleElement = parentDoc.getElementById(THEME_BROADCAST_STYLE_ID);

  if (styleElement) {
    if (styleElement.textContent !== cssText) {
      styleElement.textContent = cssText;
    }
  } else {
    styleElement = parentDoc.createElement('style');
    styleElement.id = THEME_BROADCAST_STYLE_ID;
    styleElement.textContent = cssText;
    parentDoc.head.appendChild(styleElement);
  }
}

/**
 * 彻底移除主题广播样式表（用于快速复原或卸载）
 */
export function removeThemeBroadcast(parentDoc) {
  if (!parentDoc) return;
  const styleElement = parentDoc.getElementById(THEME_BROADCAST_STYLE_ID);
  if (styleElement) {
    styleElement.remove();
  }
}
