/**
 * 主题动态广播微型模块
 * 职责：将计算好的主题 CSS 变量与表单控件统一样式直接以 <style> 标签形式注入到 parentDoc.head 中，
 * 作用于主面板及挂载在 body 下的独立弹窗，避免 DOM 嵌套引起的移动端绘制图层丢失，
 * 同时使用 !important 彻底抵御酒馆原生全局样式对 input/select/textarea 的覆盖。
 */

import { LOREBOOK_FLOATING_BUBBLE_ID, LOREBOOK_PANEL_ID } from '../config.js';

export const THEME_BROADCAST_STYLE_ID = 'lorebook-theme-dynamic-styles';

// 广播目标选择器列表：精准限定在插件自身的面板与弹窗 ID 上，绝不污染酒馆宿主网页
export const THEME_BROADCAST_SELECTORS = [
  `#${LOREBOOK_PANEL_ID}`,
  `#${LOREBOOK_FLOATING_BUBBLE_ID}`,
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
  '#mobile-tooltip',
  '.lorebook-theme-scope',
];

// 需要统一表单控件样式的容器列表
export const THEME_FORM_CONTAINER_SELECTORS = [
  `#${LOREBOOK_PANEL_ID}`,
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
  '.lorebook-theme-scope',
];

const TEXT_INPUT_EXCLUSIONS =
  ':not(.entry-item-title):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"])';

/**
 * 将 CSS 变量对象与表单控件规则编译为 CSS 规则字符串
 */
export function buildThemeBroadcastCss(
  variables = {},
  colorScheme = 'dark',
  selectors = THEME_BROADCAST_SELECTORS,
  formContainers = THEME_FORM_CONTAINER_SELECTORS,
) {
  const declarations = Object.entries(variables)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([prop, value]) => `  ${prop}: ${value};`)
    .join('\n');

  const colorSchemeDecl = colorScheme ? `  color-scheme: ${colorScheme};\n` : '';
  const containerRule = `${selectors.join(',\n')} {\n${declarations}\n${colorSchemeDecl}}`;

  // 构建可编辑表单控件（文本/数字/搜索输入框、文本域、下拉选择框）的统一覆盖规则
  const inputs = formContainers.map(s => `${s} input${TEXT_INPUT_EXCLUSIONS}`).join(',\n');
  const textareas = formContainers.map(s => `${s} textarea`).join(',\n');
  const selects = formContainers.map(s => `${s} select`).join(',\n');

  const inputsFocus = formContainers.map(s => `${s} input${TEXT_INPUT_EXCLUSIONS}:focus`).join(',\n');
  const textareasFocus = formContainers.map(s => `${s} textarea:focus`).join(',\n');
  const selectsFocus = formContainers.map(s => `${s} select:focus`).join(',\n');

  const options = formContainers.map(s => `${s} option`).join(',\n');
  const placeholdersInput = formContainers.map(s => `${s} input::placeholder`).join(',\n');
  const placeholdersTextarea = formContainers.map(s => `${s} textarea::placeholder`).join(',\n');

  const formControlsRule = `
/* 表单控件常规态：应用主题设置的输入栏背景色，抵抗宿主主题覆盖 */
${inputs},
${textareas},
${selects} {
  background-color: var(--panel-input-bg-color) !important;
  color: var(--panel-text-color) !important;
  border-color: var(--panel-border-color, #555) !important;
}

/* 表单控件聚焦态 */
${inputsFocus},
${textareasFocus},
${selectsFocus} {
  background-color: var(--panel-input-focus-bg-color) !important;
  border-color: var(--panel-accent-color) !important;
}

/* 下拉菜单选项 */
${options} {
  background-color: var(--panel-dropdown-bg-color, var(--panel-input-bg-color, #333)) !important;
  color: var(--panel-text-color, #eee) !important;
}

/* 占位文本 */
${placeholdersInput},
${placeholdersTextarea} {
  color: var(--panel-muted-text-color, #aaa) !important;
}`;

  return `/* 世界书编辑助手 - 动态主题广播样式表 (自动维护，请勿手动编辑) */\n${containerRule}\n${formControlsRule}`;
}

/**
 * 广播同步主题变量与表单控件规则到 parentDoc.head
 */
export function syncThemeBroadcast(
  parentDoc,
  variables = {},
  colorScheme = 'dark',
  selectors = THEME_BROADCAST_SELECTORS,
  formContainers = THEME_FORM_CONTAINER_SELECTORS,
) {
  if (!parentDoc?.head) {
    return;
  }

  const cssText = buildThemeBroadcastCss(variables, colorScheme, selectors, formContainers);
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
