import {
  ACTIVE_CONTENT_CLASS,
  ACTIVE_TAB_CLASS,
  AI_CONTENT_ID,
  AI_TAB_ID,
  CHARACTER_CONTENT_ID,
  CHARACTER_DETAIL_CONTAINER_ID,
  CHARACTER_TAB_ID,
  GLOBAL_CONTENT_ID,
  GLOBAL_DETAIL_CONTAINER_ID,
  GLOBAL_LOREBOOK_LIST_CONTAINER_ID,
  GLOBAL_TAB_ID,
  LOREBOOK_BUTTON_ICON,
  LOREBOOK_BUTTON_ID,
  LOREBOOK_BUTTON_TEXT_IN_MENU,
  LOREBOOK_BUTTON_TOOLTIP,
  LOREBOOK_FLOATING_BUBBLE_ID,
  LOREBOOK_EDITOR_PANEL_ID,
  LOREBOOK_ENTRY_CLASS,
  LOREBOOK_LIST_CONTAINER_ID,
  LOREBOOK_MINIMIZE_BUTTON_CLASS,
  LOREBOOK_PANEL_ID,
  LOREBOOK_TOGGLE_SWITCH_CLASS,
  MOBILE_TOOLTIP_ID,
} from '../config.js';
import { clearAllActiveFilters, clearAllExpandedEntries, clearAllFilteredEntries } from '../state.js';
import { getFloatingBubblePositionSetting, setFloatingBubblePositionSetting } from '../settings.js';
import { errorCatched, isMobile } from '../utils.js';
import { updateBoundLorebooksList, updateGlobalLorebooksList } from './list.js';
import { initAiWorkspace, refreshAiWorkspace, resetAiWorkspace } from './aiWorkspace.js';

// 切换面板显示状态
const toggleLorebookPanelLegacy = errorCatched(async () => {
  console.log('角色世界书: 切换面板显示状态');
  const parentDoc = window.parent.document;
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
  const $button = $(`#${LOREBOOK_BUTTON_ID}`, parentDoc);

  if (!$panel.length) {
    console.error('角色世界书: 找不到面板元素');
    return;
  }

  if ($panel.is(':visible')) {
    console.log('角色世界书: 关闭面板');
    $panel.hide();
    if ($button.length) $button.removeClass('active');
    resetAiWorkspace();

    // 【FIX】Reset the expanded state here
    clearAllExpandedEntries();
    console.log('角色世界书: 已清空所有条目展开状态。');

    // 【BUGFIX】Reset the search filter state here
    clearAllActiveFilters(); // 清空筛选条件
    clearAllFilteredEntries(); // 清空筛选结果
    console.log('角色世界书: 已清空所有筛选条件和搜索过滤状态。');
  } else {
    console.log('角色世界书: 打开面板');

    // 确保角色标签页处于激活状态
    $panel.find('.tab-button').removeClass(ACTIVE_TAB_CLASS);
    $panel.find(`#${CHARACTER_TAB_ID}`).addClass(ACTIVE_TAB_CLASS);

    // 确保显示角色内容区域
    $panel.find('.tab-content').removeClass(ACTIVE_CONTENT_CLASS);
    $panel.find(`#${CHARACTER_CONTENT_ID}`).addClass(ACTIVE_CONTENT_CLASS);

    // 加载角色世界书列表
    const $list = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
    await updateBoundLorebooksList($list, true);

    $panel.css('display', 'flex');
    if ($button.length) $button.addClass('active');
  }
}, 'toggleLorebookPanelLegacy');

let lorebookPanelMinimized = false;

const FLOATING_BUBBLE_MARGIN_DESKTOP = 16;
const FLOATING_BUBBLE_MARGIN_MOBILE = 12;
const FLOATING_BUBBLE_SIZE_DESKTOP = 52;
const FLOATING_BUBBLE_SIZE_MOBILE = 56;

function getParentDoc() {
  return window.parent.document;
}

function getParentWin() {
  return getParentDoc().defaultView || window.parent || window;
}

function getPanelRefs(parentDoc = getParentDoc()) {
  return {
    parentDoc,
    $panel: $(`#${LOREBOOK_PANEL_ID}`, parentDoc),
    $button: $(`#${LOREBOOK_BUTTON_ID}`, parentDoc),
    $bubble: $(`#${LOREBOOK_FLOATING_BUBBLE_ID}`, parentDoc),
  };
}

function setPanelButtonActive($button, active) {
  if ($button.length) {
    $button.toggleClass('active', Boolean(active));
  }
}

function setPanelMinimizedState($panel, minimized) {
  if (!$panel.length) {
    return;
  }

  if (minimized) {
    $panel.addClass('panel-minimized');
    return;
  }

  $panel.removeClass('panel-minimized');
}

function getFloatingBubbleFallbackSize() {
  return isMobile() ? FLOATING_BUBBLE_SIZE_MOBILE : FLOATING_BUBBLE_SIZE_DESKTOP;
}

function getFloatingBubbleMargin() {
  return isMobile() ? FLOATING_BUBBLE_MARGIN_MOBILE : FLOATING_BUBBLE_MARGIN_DESKTOP;
}

function getDefaultFloatingBubblePosition(parentDoc = getParentDoc()) {
  const parentWin = parentDoc.defaultView || window.parent || window;
  const margin = getFloatingBubbleMargin();
  const bubbleSize = getFloatingBubbleFallbackSize();
  return {
    x: Math.max(margin, (parentWin.innerWidth || 0) - bubbleSize - margin),
    y: Math.max(margin, (parentWin.innerHeight || 0) - bubbleSize - margin),
  };
}

function clampFloatingBubblePosition(position = {}, parentDoc = getParentDoc()) {
  const parentWin = parentDoc.defaultView || window.parent || window;
  const margin = getFloatingBubbleMargin();
  const fallbackSize = getFloatingBubbleFallbackSize();
  const bubbleWidth = fallbackSize;
  const bubbleHeight = fallbackSize;
  const width = parentWin.innerWidth || bubbleWidth + margin * 2;
  const height = parentWin.innerHeight || bubbleHeight + margin * 2;
  const x = Number.parseFloat(position?.x);
  const y = Number.parseFloat(position?.y);
  const defaultPosition = getDefaultFloatingBubblePosition(parentDoc);

  return {
    x: Math.min(
      Math.max(margin, Number.isFinite(x) ? x : defaultPosition.x),
      Math.max(margin, width - bubbleWidth - margin),
    ),
    y: Math.min(
      Math.max(margin, Number.isFinite(y) ? y : defaultPosition.y),
      Math.max(margin, height - bubbleHeight - margin),
    ),
  };
}

export function setFloatingBubbleViewportPosition(position = {}, { persist = true } = {}) {
  const { parentDoc, $bubble } = getPanelRefs();
  if (!$bubble.length) {
    return null;
  }

  const clamped = clampFloatingBubblePosition(position, parentDoc);
  $bubble.css({
    left: `${clamped.x}px`,
    top: `${clamped.y}px`,
    right: 'auto',
    bottom: 'auto',
  });

  if (persist) {
    setFloatingBubblePositionSetting(clamped, isMobile());
  }

  return clamped;
}

function hideFloatingBubble() {
  const { $bubble } = getPanelRefs();
  if ($bubble.length) {
    $bubble.hide().attr('data-visible', 'false');
  }
}

function showFloatingBubble() {
  const { $bubble } = getPanelRefs();
  if (!$bubble.length) {
    return;
  }

  const savedPosition = getFloatingBubblePositionSetting(isMobile()) || getDefaultFloatingBubblePosition();
  $bubble.css('display', 'flex').attr('data-visible', 'true');
  setFloatingBubbleViewportPosition(savedPosition, { persist: false });
}

export function ensureFloatingBubbleInViewport({ persist = true } = {}) {
  const { $bubble } = getPanelRefs();
  if (!$bubble.length) {
    return null;
  }

  const currentPosition = {
    x: Number.parseFloat($bubble.get(0)?.style.left || ''),
    y: Number.parseFloat($bubble.get(0)?.style.top || ''),
  };
  const fallbackPosition = getFloatingBubblePositionSetting(isMobile()) || getDefaultFloatingBubblePosition();
  const nextPosition =
    Number.isFinite(currentPosition.x) && Number.isFinite(currentPosition.y) ? currentPosition : fallbackPosition;

  return setFloatingBubbleViewportPosition(nextPosition, { persist });
}

export function isLorebookPanelMinimized() {
  return lorebookPanelMinimized;
}

async function openLorebookPanelDefault() {
  const { $panel, $button } = getPanelRefs();
  if (!$panel.length) {
    return;
  }

  lorebookPanelMinimized = false;
  hideFloatingBubble();

  $panel.find('.tab-button').removeClass(ACTIVE_TAB_CLASS);
  $panel.find(`#${CHARACTER_TAB_ID}`).addClass(ACTIVE_TAB_CLASS);
  $panel.find('.tab-content').removeClass(ACTIVE_CONTENT_CLASS);
  $panel.find(`#${CHARACTER_CONTENT_ID}`).addClass(ACTIVE_CONTENT_CLASS);

  const $list = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
  await updateBoundLorebooksList($list, true);

  $panel.css('display', 'flex');
  setPanelMinimizedState($panel, false);
  setPanelButtonActive($button, true);
}

export const restoreLorebookPanel = errorCatched(async () => {
  const { $panel, $button } = getPanelRefs();
  if (!$panel.length) {
    return;
  }

  lorebookPanelMinimized = false;
  hideFloatingBubble();
  $panel.css('display', 'flex');
  setPanelMinimizedState($panel, false);
  setPanelButtonActive($button, true);
}, 'restoreLorebookPanel');

export const minimizeLorebookPanel = errorCatched(async () => {
  const { $panel, $button } = getPanelRefs();
  if (!$panel.length || !$panel.is(':visible')) {
    return;
  }

  lorebookPanelMinimized = true;
  setPanelMinimizedState($panel, true);
  setPanelButtonActive($button, true);
  showFloatingBubble();
}, 'minimizeLorebookPanel');

export const closeLorebookPanel = errorCatched(async () => {
  const { $panel, $button } = getPanelRefs();
  if (!$panel.length) {
    return;
  }

  lorebookPanelMinimized = false;
  setPanelMinimizedState($panel, false);
  $panel.hide();
  hideFloatingBubble();
  setPanelButtonActive($button, false);
  resetAiWorkspace();
  clearAllExpandedEntries();
  clearAllActiveFilters();
  clearAllFilteredEntries();
}, 'closeLorebookPanel');

export const toggleLorebookPanel = errorCatched(async () => {
  const { $panel } = getPanelRefs();
  if (!$panel.length) {
    return;
  }

  if (lorebookPanelMinimized) {
    await restoreLorebookPanel();
    return;
  }

  if ($panel.is(':visible')) {
    await closeLorebookPanel();
    return;
  }

  await openLorebookPanelDefault();
}, 'toggleLorebookPanel');

// 切换标签页
export const switchTab = errorCatched(async tabId => {
  console.log(`角色世界书: 切换标签页至 ${tabId}`);
  const parentDoc = window.parent.document;
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);

  if (!$panel.length) {
    console.error('角色世界书: 找不到面板元素');
    return;
  }

  $panel.find('.tab-button').removeClass(ACTIVE_TAB_CLASS);
  $panel.find(`#${tabId}`).addClass(ACTIVE_TAB_CLASS);

  $panel.find('.tab-content').removeClass(ACTIVE_CONTENT_CLASS);
  const contentId =
    tabId === CHARACTER_TAB_ID ? CHARACTER_CONTENT_ID : tabId === GLOBAL_TAB_ID ? GLOBAL_CONTENT_ID : AI_CONTENT_ID;
  const $contentToShow = $panel.find(`#${contentId}`);
  $contentToShow.addClass(ACTIVE_CONTENT_CLASS);

  if (tabId === CHARACTER_TAB_ID) {
    const $list = $contentToShow.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
    await updateBoundLorebooksList($list, true);
  } else if (tabId === GLOBAL_TAB_ID) {
    const $list = $contentToShow.find(`#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`);
    await updateGlobalLorebooksList($list, true);
  } else if (tabId === AI_TAB_ID) {
    await refreshAiWorkspace();
  }
}, 'switchTab');

export function initPanel() {
  const parentDoc = window.parent.document;
  initAiWorkspace();

  if ($('#enhanced-lorebook-styles', parentDoc).length === 0) {
    const panelStyles = `
            <style id="enhanced-lorebook-styles">
                /* --- 面板 --- */
                #${LOREBOOK_PANEL_ID} {
                    /* CSS变量定义 */
                    --panel-bg-color: rgba(40, 40, 40, 0.95);
                    --panel-text-color: #eee;
                    --panel-border-color: #555;
                    --panel-accent-color: #9a7ace; /* 新增：强调颜色变量 */
                    --panel-entry-bg-color: #333; /* 新增：条目背景颜色变量 */
                    --panel-input-bg-color: #333;
                    --panel-field-bg-color: #333;
                    --panel-input-focus-bg-color: #3a3a3a;
                    --panel-field-focus-bg-color: #3a3a3a;
                    --panel-dropdown-bg-color: #333;
                    --panel-dropdown-hover-bg-color: #9a7ace;
                    --panel-dropdown-active-bg-color: #4a4a9a;
                    --panel-entry-hover-bg-color: #3a3a3a;
                    --panel-selected-bg-color: rgba(154, 122, 206, 0.1);
                    --panel-md-entry-bg-color: #333;
                    --panel-md-entry-current-bg-color: rgba(154, 122, 206, 0.1);
                    --panel-background-image: none;
                    --panel-background-image-opacity: 0;
                    --panel-surface-opacity: 1;
                    --panel-icon-bg-color: #666;
                    --panel-icon-hover-bg-color: #777;
                    --lorebook-name-white-space: nowrap;
                    --lorebook-name-text-overflow: ellipsis;
                    --lorebook-name-overflow-wrap: normal;
                    --lorebook-name-word-break: normal;
                    --lorebook-title-align-items: center;

                    display: none;
                    position: fixed;
                    top: 50px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 95%;
                    max-width: 1100px; /* 增加最大宽度 */
                    max-height: 80vh;
                    background-color: transparent;
                    color: var(--panel-text-color);
                    border: 1px solid var(--panel-border-color);
                    border-radius: 8px;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
                    z-index: 9998;
                    padding: 0;
                    box-sizing: border-box;
                    flex-direction: column;
                    margin: 0;
                    isolation: isolate;
                }

                #${LOREBOOK_PANEL_ID}::before,
                #${LOREBOOK_PANEL_ID}::after {
                    content: "";
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    pointer-events: none;
                }
                #${LOREBOOK_PANEL_ID}::before {
                    z-index: -2;
                    background-color: var(--panel-bg-color);
                    opacity: var(--panel-surface-opacity, 1);
                }
                #${LOREBOOK_PANEL_ID}::after {
                    z-index: -1;
                    background-image: var(--panel-background-image, none);
                    background-position: center;
                    background-size: cover;
                    background-repeat: no-repeat;
                    opacity: var(--panel-background-image-opacity, 0);
                }

                /* --- 全屏模式 --- */
                #${LOREBOOK_PANEL_ID}.fullscreen-mode {
                    top: 0 !important;
                    left: 0 !important;
                    transform: none !important;
                    width: 100vw !important;
                    max-width: 100vw !important;
                    height: 100vh !important;
                    max-height: 100vh !important;
                    border-radius: 0 !important;
                    border: none !important;
                    margin: 0 !important;
                }

                @media (max-width: 768px) {
                    #${LOREBOOK_PANEL_ID} {
                        width: 95%;
                        max-width: 480px;
                        max-height: 85vh;
                        top: 45px;
                    }
                    #${LOREBOOK_FLOATING_BUBBLE_ID} {
                        width: ${FLOATING_BUBBLE_SIZE_MOBILE}px;
                        height: ${FLOATING_BUBBLE_SIZE_MOBILE}px;
                    }
                }

                /* --- 头部 --- */
                #${LOREBOOK_PANEL_ID} .panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 15px;
                    border-bottom: 1px solid #555;
                    flex-shrink: 0;
                }
                #${LOREBOOK_PANEL_ID}.panel-minimized {
                    opacity: 0;
                    visibility: hidden;
                    pointer-events: none;
                }
                #${LOREBOOK_PANEL_ID} .panel-header h4 { margin: 0; font-size: 1.1em; flex-grow: 1; }
                #${LOREBOOK_PANEL_ID} .theme-settings-button {
                    background: none;
                    border: 1px solid #666;
                    color: var(--panel-text-color);
                    opacity: 0.8;
                    font-size: 0.8em;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 4px;
                    margin-right: 15px;
                    transition: background-color 0.2s, color 0.2s;
                }
                #${LOREBOOK_PANEL_ID} .theme-settings-button:hover {
                    background-color: #555;
                    color: #fff;
                }
                #${LOREBOOK_PANEL_ID} .close-button {
                    background: none;
                    border: none;
                    color: var(--panel-text-color);
                    opacity: 0.8;
                    font-size: 1.15em;
                    cursor: pointer;
                    width: 28px;
                    height: 28px;
                    padding: 0;
                    line-height: 1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: background-color 0.2s, opacity 0.2s;
                }
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_MINIMIZE_BUTTON_CLASS} {
                    background: none;
                    border: none;
                    color: var(--panel-text-color);
                    opacity: 0.8;
                    font-size: 1.15em;
                    cursor: pointer;
                    width: 28px;
                    height: 28px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    margin-left: auto;
                    margin-right: 6px;
                    transition: background-color 0.2s, opacity 0.2s;
                }
                #${LOREBOOK_PANEL_ID} .close-button:hover,
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_MINIMIZE_BUTTON_CLASS}:hover {
                    opacity: 1;
                    background-color: rgba(255, 255, 255, 0.08);
                }
                #${LOREBOOK_PANEL_ID} .large-content-preview-card,
                #${LOREBOOK_EDITOR_PANEL_ID} .large-content-preview-card {
                    border: 1px solid #555;
                    border-radius: 8px;
                    background: rgba(0, 0, 0, 0.18);
                    padding: 10px 12px;
                    margin-top: 8px;
                }
                #${LOREBOOK_PANEL_ID} .large-content-preview-text,
                #${LOREBOOK_EDITOR_PANEL_ID} .large-content-preview-text {
                    white-space: pre-wrap;
                    word-break: break-word;
                    color: #ddd;
                    font-size: 0.92em;
                    line-height: 1.45;
                    max-height: 10.5em;
                    overflow: hidden;
                }
                 #${LOREBOOK_PANEL_ID} .large-content-preview-actions,
                 #${LOREBOOK_EDITOR_PANEL_ID} .large-content-preview-actions {
                      display: flex;
                      flex-wrap: wrap;
                      gap: 8px;
                      margin-top: 10px;
                  }
                 #${LOREBOOK_PANEL_ID} .large-content-preview-hint,
                 #${LOREBOOK_EDITOR_PANEL_ID} .large-content-preview-hint {
                      color: rgba(255, 255, 255, 0.68);
                      font-size: 0.84em;
                      line-height: 1.4;
                      margin-right: auto;
                 }
                 #${LOREBOOK_PANEL_ID} .large-content-preview-open,
                 #${LOREBOOK_EDITOR_PANEL_ID} .large-content-preview-open {
                      padding: 4px 10px;
                    border: 1px solid #666;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.04);
                    color: var(--panel-text-color);
                    cursor: pointer;
                    font-size: 0.86em;
                }
                #${LOREBOOK_PANEL_ID} .large-content-preview-open:hover,
                #${LOREBOOK_EDITOR_PANEL_ID} .large-content-preview-open:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
                #${LOREBOOK_FLOATING_BUBBLE_ID} {
                    display: none;
                    position: fixed;
                    left: 0;
                    top: 0;
                    width: ${FLOATING_BUBBLE_SIZE_DESKTOP}px;
                    height: ${FLOATING_BUBBLE_SIZE_DESKTOP}px;
                    border: none;
                    border-radius: 999px;
                    background: var(--panel-accent-color, #9a7ace);
                    color: #fff;
                    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
                    z-index: 10000;
                    align-items: center;
                    justify-content: center;
                    cursor: grab;
                    user-select: none;
                    touch-action: none;
                    opacity: 0.96;
                }
                #${LOREBOOK_FLOATING_BUBBLE_ID}:hover {
                    filter: brightness(1.08);
                }
                #${LOREBOOK_FLOATING_BUBBLE_ID}.is-dragging {
                    cursor: grabbing;
                    opacity: 1;
                    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.4);
                }
                #${LOREBOOK_FLOATING_BUBBLE_ID} i {
                    font-size: 1.05em;
                    pointer-events: none;
                }
                #theme-settings-modal .close-button {
                    color: var(--modal-text-color, #fff);
                    background-color: transparent;
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-size: 16px;
                    line-height: 1;
                    opacity: 0.7;
                    transition: opacity 0.2s, background-color 0.2s;
                }
                #theme-settings-modal .close-button:hover {
                    opacity: 1;
                    background-color: rgba(255, 255, 255, 0.1);
                }
                
                /* --- 标签页 --- */
                #${LOREBOOK_PANEL_ID} .tab-container {
                    display: flex;
                    border-bottom: 1px solid var(--panel-border-color, #555);
                    flex-shrink: 0;
                    background-color: var(--panel-entry-bg-color, #2a2a2a);
                }
                #${LOREBOOK_PANEL_ID} .tab-button {
                    flex: 1;
                    padding: 10px 15px;
                    background: none;
                    border: none;
                    border-bottom: 3px solid transparent;
                    color: var(--panel-text-color);
                    opacity: 0.7;
                    font-size: 1em;
                    cursor: pointer;
                    text-align: center;
                    transition: color 0.2s, border-color 0.2s;
                }
                #${LOREBOOK_PANEL_ID} .tab-button:hover { opacity: 1; }
                #${LOREBOOK_PANEL_ID} .tab-button.${ACTIVE_TAB_CLASS} {
                    color: var(--panel-text-color);
                    opacity: 1;
                    border-bottom-color: var(--panel-accent-color);
                    font-weight: bold;
                }

                /* --- 内容区域 --- */
                #${LOREBOOK_PANEL_ID} .content-container {
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-sizing: border-box;
                }
                #${LOREBOOK_PANEL_ID} .entry-header,
                #${LOREBOOK_PANEL_ID} .entry-header button,
                #${LOREBOOK_PANEL_ID} .entry-header input,
                #${LOREBOOK_PANEL_ID} .entry-header select,
                #${LOREBOOK_PANEL_ID} .entry-expand-area button,
                #${LOREBOOK_PANEL_ID} .entry-expand-area input,
                #${LOREBOOK_PANEL_ID} .entry-expand-area textarea,
                #${LOREBOOK_PANEL_ID} .entry-expand-area select {
                    -webkit-tap-highlight-color: transparent;
                }
                #${LOREBOOK_PANEL_ID} select option,
                #theme-settings-modal select option,
                #lorebook-copy-modal select option {
                    background-color: var(--panel-dropdown-bg-color, var(--panel-input-bg-color, #333));
                    color: var(--panel-text-color, #eee);
                }
                #${LOREBOOK_PANEL_ID} .tab-content {
                    display: none;
                    flex-direction: column;
                    width: 100%;
                    flex-grow: 1;
                    overflow: hidden;
                    padding: 15px;
                    box-sizing: border-box;
                }
                #${LOREBOOK_PANEL_ID} .tab-content.${ACTIVE_CONTENT_CLASS} {
                    display: flex;
                }

                /* --- 列表容器 --- */
                #${LOREBOOK_PANEL_ID} .list-container {
                    overflow-y: auto;
                    flex-grow: 1;
                    padding-right: 5px;
                    margin-right: -5px;
                }
                #${LOREBOOK_PANEL_ID} .list-container p {
                    text-align: center;
                    color: var(--panel-text-color);
                    opacity: 0.7;
                    margin-top: 20px;
                }
                
                /* --- 拖拽样式 --- */
                #${LOREBOOK_PANEL_ID} .drag-handle {
                    cursor: move;
                    color: var(--panel-text-color);
                    opacity: 0.6;
                    padding: 0 8px;
                    border-radius: 3px;
                    margin-right: 5px;
                    font-size: 14px;
                }
                #${LOREBOOK_PANEL_ID} .drag-handle:hover {
                    color: var(--panel-text-color);
                    opacity: 1;
                    background-color: var(--panel-field-focus-bg-color, #444);
                }
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS}.ui-sortable-helper {
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
                    opacity: 0.9;
                }
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS}.ui-sortable-placeholder {
                    border: 1px dashed #666;
                    background-color: var(--panel-entry-bg-color, #2a2a2a);
                    visibility: visible !important;
                    height: 40px;
                }
                
                /* 自定义拖拽样式（用于虚拟滚动） */
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS}.dragging {
                    opacity: 0.8;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
                    z-index: 1000;
                    position: relative;
                }
                #${LOREBOOK_PANEL_ID} li.drag-placeholder-li {
                    border: 2px dashed #666 !important;
                    background-color: var(--panel-entry-bg-color, #2a2a2a) !important;
                    opacity: 0.5 !important;
                    list-style: none !important;
                }
                #${LOREBOOK_PANEL_ID} .drag-handle {
                    cursor: grab;
                    user-select: none;
                }
                #${LOREBOOK_PANEL_ID} .drag-handle:active {
                    cursor: grabbing;
                }
                #${LOREBOOK_PANEL_ID} .dragging .drag-handle {
                    cursor: grabbing !important;
                }
                
                /* --- 世界书标题 --- */
                #${LOREBOOK_PANEL_ID} .lorebook-title {
                    font-size: 1.1em;
                    font-weight: bold;
                    color: var(--panel-accent-color);
                    margin: 10px 0 5px 0;
                    padding: 5px;
                    border-bottom: 1px solid #555;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap; /* 允许在小屏幕上换行 */
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-title-text {
                    flex: 1 1 auto;
                    min-width: 0;
                    display: flex;
                    align-items: var(--lorebook-title-align-items);
                    overflow: hidden;
                    text-overflow: var(--lorebook-name-text-overflow);
                    white-space: var(--lorebook-name-white-space);
                    overflow-wrap: var(--lorebook-name-overflow-wrap);
                    word-break: var(--lorebook-name-word-break);
                }
                
                /* 世界书标题展开/折叠相关样式 */
                #${LOREBOOK_PANEL_ID} .lorebook-title-clickable {
                    transition: background-color 0.2s ease;
                    position: relative;
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-title-clickable:hover {
                    background-color: var(--panel-selected-bg-color, rgba(154, 122, 206, 0.1));
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-title-clickable[data-expanded="true"] {
                    border-bottom-color: var(--panel-accent-color);
                    background-color: var(--panel-selected-bg-color, rgba(154, 122, 206, 0.1));
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-expand-icon {
                    transition: transform 0.2s ease; /* 缩短过渡时间 */
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-title-clickable[data-expanded="true"] .lorebook-expand-icon {
                    transform: rotate(180deg); /* 直接180度翻转，不使用过渡动画绕圈 */
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-entries-wrapper {
                    margin-left: 15px;
                    padding-left: 10px;
                    border-left: 2px solid var(--panel-accent-color);
                    margin-bottom: 15px;
                    display: flex;
                    flex-direction: column;
                    flex-grow: 1;
                }
  		/* Clusterize.js specific styles */
  		.clusterize-scroll {
  			/* 优化：使用 flex-grow 替代固定高度，让滚动容器自适应 */
  			flex-grow: 1;
  			min-height: 200px; /* 减小最小高度 */
  			max-height: 65vh;  /* 增加最大高度，确保能滚动到底 */
  			overflow-y: auto;
  			overflow-x: hidden;
  			/* 性能优化：GPU 硬件加速（轻量级，移动端友好） */
  			-webkit-overflow-scrolling: touch;
  			transform: translateZ(0); /* 启用 GPU 加速，资源消耗低 */
  			/* 移除 smooth scroll，避免快速拖动时卡顿 */
  			/* scroll-behavior: smooth; */
  			/* 优化渲染性能：限制重绘范围 */
  			contain: layout style paint;
  		}
                .clusterize-content {
                    margin: 0;
                    padding: 0;
                }
                .clusterize-content li {
                    list-style: none; /* 移除 <li> 的默认项目符号 */
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-add-entry-button {
                    background-color: #5a3a8e !important; /* 固定颜色，不随主题变化 */
                    border: none;
                    color: #fff;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    transition: background-color 0.2s ease;
                    margin-left: 10px;
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-add-entry-button:hover {
                    filter: brightness(1.2);
                }
                
                /* 搜索框样式 */
                #${LOREBOOK_PANEL_ID} .lorebook-search-container {
                    position: relative;
                    margin-left: 10px;
                    min-width: 160px;
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-search-input {
                    background-color: var(--panel-input-bg-color, var(--search-input-bg-color, #333));
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 15px;
                    color: var(--panel-text-color, #eee);
                    padding: 4px 10px 4px 28px;
                    font-size: 0.85em;
                    width: 100%;
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-search-input:focus {
                    outline: none;
                    border-color: var(--panel-accent-color, #7a4abe);
                    background-color: var(--panel-input-focus-bg-color, #3a3a3a);
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-search-icon {
                    position: absolute;
                    left: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #888;
                    font-size: 0.85em;
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-search-clear {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #888;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                    font-size: 0.85em;
                    display: none; /* 默认隐藏 */
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-search-clear:hover {
                    color: #ccc;
                }
                
                /* 搜索结果为空提示 */
                #${LOREBOOK_PANEL_ID} .no-search-results {
                    color: #888;
                    font-style: italic;
                    padding: 10px;
                    text-align: center;
                    font-size: 0.9em;
                    margin: 10px 0;
                    background-color: var(--panel-input-bg-color, rgba(80, 80, 80, 0.2));
                    border-radius: 4px;
                }
                #${LOREBOOK_PANEL_ID} .current-bound-books {
                    background-color: var(--panel-entry-bg-color, rgba(42, 42, 42, 0.65)) !important;
                    border: 1px solid var(--panel-border-color, #555);
                    color: var(--panel-text-color);
                }
                
                /* --- 排序下拉菜单 --- */
                #${LOREBOOK_PANEL_ID} .lorebook-sort-container {
                    position: relative;
                    margin-left: 10px;
                }
                #${LOREBOOK_PANEL_ID} .sort-display-button {
                    background-color: var(--panel-input-bg-color, #3a3a3a);
                    border: 1px solid var(--panel-border-color, #555);
                    color: var(--panel-text-color, #ccc);
                    padding: 4px 10px;
                    border-radius: 15px;
                    cursor: pointer;
                    font-size: 0.85em;
                    min-width: 120px;
                    text-align: left;
                }
                #${LOREBOOK_PANEL_ID} .sort-display-button:hover {
                    background-color: #444;
                }
                #${LOREBOOK_PANEL_ID} .sort-display-button i {
                    float: right;
                    margin-top: 3px;
                }
                #${LOREBOOK_PANEL_ID} .sort-dropdown {
                    display: none;
                    position: absolute;
                    background-color: var(--panel-dropdown-bg-color, #282828);
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 4px;
                    list-style: none;
                    padding: 5px 0;
                    margin: 2px 0 0 0;
                    min-width: 160px;
                    z-index: 1000;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.5);
                }
                #${LOREBOOK_PANEL_ID} .sort-dropdown li {
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 0.9em;
                }
                #${LOREBOOK_PANEL_ID} .sort-dropdown li:hover {
                    background-color: var(--panel-dropdown-hover-bg-color, var(--panel-accent-color));
                    color: #fff;
                }
                #${LOREBOOK_PANEL_ID} .sort-dropdown li.active {
                    background-color: var(--panel-dropdown-active-bg-color, #4a4a9a);
                    font-weight: bold;
                }

                /* --- 世界书分隔线 --- */
                #${LOREBOOK_PANEL_ID} .lorebook-divider {
                    height: 1px;
                    background-color: var(--panel-border-color, #444);
                    margin: 15px 0;
                }
                
                /* --- 无条目提示 --- */
                #${LOREBOOK_PANEL_ID} .no-entries-message {
                    color: #888;
                    font-style: italic;
                    text-align: center;
                    margin: 10px 0;
                    font-size: 0.9em;
                }

                /* --- 条目项目 --- */
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS} {
                    margin-bottom: 8px;
                    border: 1px solid #444;
                    border-radius: 4px;
                    background-color: var(--panel-entry-bg-color);
                    font-size: 0.95em;
                    user-select: none;
                    overflow: hidden;
                    transition: border-color 0.2s ease;
                    /* 性能优化：限制重排范围 */
                    contain: layout style;
                    /* GPU 加速 */
                    transform: translateZ(0);
                }
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS}:hover {
                    border-color: var(--panel-accent-color, #666);
                }
                
                /* --- 激活条目高亮样式 --- */
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS}.entry-active {
                    border-left: 4px solid #4CAF50;
                    background-color: rgba(76, 175, 80, 0.08);
                    box-shadow: 0 0 8px rgba(76, 175, 80, 0.2);
                }
                #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS}.entry-active:hover {
                    border-left-color: #66BB6A;
                    background-color: rgba(76, 175, 80, 0.12);
                }
                
                #${LOREBOOK_PANEL_ID} .entry-header {
                    padding: 8px 10px; 
                    display: flex;
                    align-items: center;
                    background-color: var(--panel-entry-bg-color);
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                    flex-direction: row; /* 确保PC端默认为水平布局 */
                }
                #${LOREBOOK_PANEL_ID} .entry-header:hover {
                    background-color: var(--panel-entry-hover-bg-color, #3a3a3a);
                }
                
                /* 拖拽样式 */
                #${LOREBOOK_PANEL_ID} .drag-handle {
                    cursor: move;
                    color: #888;
                    padding: 0 8px;
                    border-radius: 3px;
                    margin-right: 5px;
                    font-size: 14px;
                }
                #${LOREBOOK_PANEL_ID} .drag-handle:hover {
                    color: #fff;
                    background-color: var(--panel-field-focus-bg-color, #444);
                }
                
                
                /* --- 入口文本编辑框 */
                #${LOREBOOK_PANEL_ID} .entry-item-title {
                    flex-grow: 1;
                    margin: 0 8px;
                    background: transparent;
                    border: 1px solid transparent;
                    color: var(--panel-text-color);
                    font-weight: bold;
                    padding: 4px 6px;
                    font-size: 0.95em;
                    transition: border-color 0.2s;
                    min-width: 80px;
                    width: 150px;
                    overflow: hidden;
                    text-overflow: var(--lorebook-name-text-overflow);
                    white-space: var(--lorebook-name-white-space);
                    overflow-wrap: var(--lorebook-name-overflow-wrap);
                    word-break: var(--lorebook-name-word-break);
                }
                #${LOREBOOK_PANEL_ID} .entry-item-title:hover,
                #${LOREBOOK_PANEL_ID} .entry-item-title:focus {
                    border-color: var(--panel-accent-color, #666);
                    background-color: var(--panel-field-focus-bg-color, #444);
                    outline: none;
                }
                
                /* 小展开按钮 */
                #${LOREBOOK_PANEL_ID} .small-expand-button {
                    background: none;
                    border: none;
                    color: var(--panel-text-color);
                    opacity: 0.7;
                    cursor: pointer;
                    padding: 2px 4px;
                    border-radius: 3px;
                    margin-right: 5px;
                    font-size: 14px;
                }
                #${LOREBOOK_PANEL_ID} .small-expand-button:hover {
                    color: var(--panel-text-color);
                    opacity: 1;
                    background-color: var(--panel-field-focus-bg-color, #444);
                }
                
                /* --- 迷你常量开关 --- */
                #${LOREBOOK_PANEL_ID} .mini-constant-toggle {
                    display: flex;
                    align-items: center;
                    white-space: nowrap;
                    margin: 0 8px;
                    width: 45px;
                }
                #${LOREBOOK_PANEL_ID} .mini-toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 40px;
                    height: 22px;
                }
                #${LOREBOOK_PANEL_ID} .mini-toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                #${LOREBOOK_PANEL_ID} .mini-toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border-radius: 22px;
                    transition: .3s;
                }
                #${LOREBOOK_PANEL_ID} .mini-toggle-slider.keyword {
                    background-color: #4CAF50; /* 绿色表示关键词 */
                }
                #${LOREBOOK_PANEL_ID} .mini-toggle-slider.constant {
                    background-color: #2196F3; /* 蓝色表示常量 */
                }
                #${LOREBOOK_PANEL_ID} .mini-toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 16px;
                    width: 16px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    border-radius: 50%;
                    transition: .3s;
                }
                #${LOREBOOK_PANEL_ID} .mini-toggle-switch input:checked + .mini-toggle-slider:before {
                    transform: translateX(18px);
                }
                
                /* 位置选择器 */
                #${LOREBOOK_PANEL_ID} .mini-position-select {
                    margin: 0 8px;
                    padding: 3px 6px;
                    background-color: var(--panel-input-bg-color, #444);
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 3px;
                    color: var(--panel-text-color);
                    font-size: 0.85em;
                    width: 120px;
                }
                #${LOREBOOK_PANEL_ID} .mini-position-select:focus {
                    outline: none;
                    border-color: var(--panel-accent-color, #777);
                    background-color: var(--panel-input-focus-bg-color, #3a3a3a);
                }
                
                /* 深度、顺序和概率输入 */
                #${LOREBOOK_PANEL_ID} .depth-input-container,
                #${LOREBOOK_PANEL_ID} .order-input-container,
                #${LOREBOOK_PANEL_ID} .prob-input-container {
                    display: inline-flex;
                    align-items: center;
                    white-space: nowrap;
                    margin: 0 8px;
                }
                #${LOREBOOK_PANEL_ID} .mini-number-input {
                    width: 40px;
                    padding: 3px 5px;
                    background-color: var(--panel-input-bg-color, #3a3a3a);
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 3px;
                    color: var(--panel-text-color);
                    font-size: 0.85em;
                    text-align: center;
                }
                /* 调整顺序和概率输入框宽度 */
                #${LOREBOOK_PANEL_ID} .order-input,
                #${LOREBOOK_PANEL_ID} .prob-input {
                    width: 60px; /* 进一步增加宽度以确保显示3位数字 */
                }
                #${LOREBOOK_PANEL_ID} .mini-number-input:focus {
                    outline: none;
                    border-color: #777;
                }
                
                /* 操作按钮 */
                #${LOREBOOK_PANEL_ID} .entry-actions {
                    display: flex;
                    align-items: center;
                    margin-left: 8px;
                }
                #${LOREBOOK_PANEL_ID} .action-button {
                    background: none;
                    border: none;
                    color: #aaa;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 3px;
                    transition: background-color 0.2s ease;
                    font-size: 14px;
                }
                #${LOREBOOK_PANEL_ID} .copy-button:hover {
                    color: #fff;
                    background-color: #2a6496;
                }
                #${LOREBOOK_PANEL_ID} .delete-button {
                    margin-left: 5px;
                }
                #${LOREBOOK_PANEL_ID} .delete-button:hover {
                    color: #fff;
                    background-color: #d9534f;
                }
                
                /* --- 展开/折叠按钮 --- */
                #${LOREBOOK_PANEL_ID} .expand-button {
                    background: none;
                    border: none;
                    color: #aaa;
                    cursor: pointer;
                    padding: 2px 6px;
                    border-radius: 3px;
                    transition: background-color 0.2s;
                    margin-left: auto;
                }
                #${LOREBOOK_PANEL_ID} .expand-button:hover {
                    background-color: #555;
                    color: #fff;
                }
                
                /* 展开区域 */
                #${LOREBOOK_PANEL_ID} .entry-expand-area {
                    padding: 12px;
                    border-top: 1px solid var(--panel-border-color, #444);
                    background-color: var(--panel-entry-bg-color, #2a2a2a);
                }
                
                /* --- UID显示区域 --- */
                #${LOREBOOK_PANEL_ID} .uid-display-area {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                    padding: 5px;
                    background-color: var(--panel-input-bg-color, #333);
                    border-radius: 4px;
                }
                #${LOREBOOK_PANEL_ID} .uid-display-area label {
                    font-weight: bold;
                    margin-right: 8px;
                    color: #aaa;
                }
                #${LOREBOOK_PANEL_ID} .uid-value {
                    font-family: monospace;
                    font-size: 0.9em;
                    color: #f0ad4e;
                }
                
                /* --- Token计数器 --- */
                /* 控制内容区域头部的整体布局 */
                #${LOREBOOK_PANEL_ID} .content-header {
                    display: flex;
                    justify-content: space-between; /* 两端对齐 */
                    align-items: center;
                    margin-bottom: 4px;
                }

                /* 控制左侧容器（标签+按钮） */
                #${LOREBOOK_PANEL_ID} .content-header-left {
                    display: flex;
                    align-items: center;
                    gap: 1px; /* 在 "内容:" 和按钮之间添加一些间距 */
                }
                #${LOREBOOK_PANEL_ID} .token-counter {
                    font-size: 0.85em;
                    color: #8a5fbd;
                    background-color: var(--panel-input-bg-color, #333);
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-weight: bold;
                }
                
                /* --- 内容编辑器按钮样式 --- */
                #${LOREBOOK_PANEL_ID} .content-edit-button {
                    background: none;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    padding: 4px 6px;
                    border-radius: 3px;
                    margin-left: 8px;
                    font-size: 14px;
                    transition: color 0.2s ease, background-color 0.2s ease;
                }
                #${LOREBOOK_PANEL_ID} .content-edit-button:hover {
                    color: var(--panel-text-color);
                    background-color: var(--panel-field-focus-bg-color, #444);
                }
                
                /* --- 递归选项区域 --- */
                #${LOREBOOK_PANEL_ID} .recursion-options-area {
                    margin: 10px 0;
                    padding: 10px;
                    background-color: var(--panel-input-bg-color, #333);
                    border-radius: 4px;
                    border: 1px solid var(--panel-border-color, #444);
                }
                #${LOREBOOK_PANEL_ID} .recursion-label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: bold;
                    color: var(--panel-text-color);
                    opacity: 0.8;
                }
                #${LOREBOOK_PANEL_ID} .checkbox-wrapper {
                    display: flex;
                    align-items: center;
                    margin-bottom: 6px;
                    margin-left: 10px;
                }
                #${LOREBOOK_PANEL_ID} .checkbox-wrapper input[type="checkbox"] {
                    margin-right: 8px;
                    cursor: pointer;
                }
                #${LOREBOOK_PANEL_ID} .checkbox-wrapper label {
                    cursor: pointer;
                    font-size: 0.9em;
                    color: var(--panel-text-color);
                }
                
                /* 内容编辑区 */
                #${LOREBOOK_PANEL_ID} .content-edit-area,
                #${LOREBOOK_PANEL_ID} .keywords-edit-area {
                    margin-bottom: 10px;
                }
                #${LOREBOOK_PANEL_ID} .content-edit-area label,
                #${LOREBOOK_PANEL_ID} .keywords-edit-area label {
                    display: block;
                    margin-bottom: 5px;
                    color: var(--panel-text-color);
                    opacity: 0.8;
                    font-size: 0.9em;
                }
                #${LOREBOOK_PANEL_ID} .content-textarea {
                    width: 100%;
                    padding: 8px;
                    background-color: var(--panel-input-bg-color, #333);
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 4px;
                    color: var(--panel-text-color);
                    font-size: 0.9em;
                    resize: vertical;
                    min-height: 100px;
                    box-sizing: border-box;
                }
                #${LOREBOOK_PANEL_ID} .content-textarea:focus {
                    outline: none;
                    border-color: var(--panel-accent-color, #777);
                    background-color: var(--panel-input-focus-bg-color, #3a3a3a);
                }
                #${LOREBOOK_PANEL_ID} .keywords-input {
                    width: 100%;
                    padding: 8px;
                    background-color: var(--panel-input-bg-color, #333);
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 4px;
                    color: var(--panel-text-color);
                    font-size: 0.9em;
                    box-sizing: border-box;
                }
                #${LOREBOOK_PANEL_ID} .keywords-input:focus,
                #${LOREBOOK_PANEL_ID} .secondary-keywords-input:focus,
                #${LOREBOOK_PANEL_ID} .secondary-keys-logic-select:focus {
                    outline: none;
                    border-color: var(--panel-accent-color, #777);
                    background-color: var(--panel-input-focus-bg-color, #3a3a3a);
                }

               #${LOREBOOK_PANEL_ID} .keywords-edit-area {
                   display: flex;
                   gap: 10px;
                   align-items: flex-end; /* Align items to the bottom */
               }

               #${LOREBOOK_PANEL_ID} .keyword-group {
                   display: flex;
                   flex-direction: column;
                   flex: 1; /* Allow flexible width */
               }

               #${LOREBOOK_PANEL_ID} .keyword-group.logic-group {
                   flex: 0 0 120px; /* Fixed width for the logic dropdown */
               }

               #${LOREBOOK_PANEL_ID} .keyword-group label {
                   margin-bottom: 5px;
                   font-size: 0.9em;
                   color: #ccc;
               }

               #${LOREBOOK_PANEL_ID} .keywords-input,
               #${LOREBOOK_PANEL_ID} .secondary-keywords-input,
               #${LOREBOOK_PANEL_ID} .secondary-keys-logic-select {
                   width: 100%;
                   padding: 8px;
                   background-color: var(--panel-input-bg-color, #333);
                   border: 1px solid var(--panel-border-color, #555);
                   border-radius: 4px;
                   color: var(--panel-text-color);
                   font-size: 0.9em;
                   box-sizing: border-box;
               }

               #${LOREBOOK_PANEL_ID} .secondary-keys-logic-select {
                   padding: 7px 8px; /* Minor adjustment for select height */
               }
                
                /* --- 开关样式 --- */
                .${LOREBOOK_TOGGLE_SWITCH_CLASS} {
                    position: relative;
                    display: inline-block;
                    width: 40px;
                    height: 22px;
                    flex-shrink: 0;
                    margin-right: 4px;
                }
                .${LOREBOOK_TOGGLE_SWITCH_CLASS} input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .${LOREBOOK_TOGGLE_SWITCH_CLASS} .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #555;
                    border-radius: 22px;
                    transition: .4s;
                }
                .${LOREBOOK_TOGGLE_SWITCH_CLASS} .toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 16px;
                    width: 16px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    border-radius: 50%;
                    transition: .4s;
                }
                .${LOREBOOK_TOGGLE_SWITCH_CLASS} input:checked + .toggle-slider {
                    background-color: var(--panel-accent-color);
                }
                .${LOREBOOK_TOGGLE_SWITCH_CLASS} input:checked + .toggle-slider:before {
                    transform: translateX(18px);
                }
                .${LOREBOOK_TOGGLE_SWITCH_CLASS} input:disabled + .toggle-slider {
                    background-color: var(--panel-input-bg-color, #333);
                    cursor: not-allowed;
                }
                
                /* --- 按钮 --- */
                #${LOREBOOK_BUTTON_ID} {
                    cursor: pointer;
                }
                #${LOREBOOK_BUTTON_ID}.active {
                    background-color: #6a4a7e !important;
                    color: #fff !important;
                }
                #${LOREBOOK_BUTTON_ID}.active i {
                    color: #fff !important;
                }
                
                /* --- 表头 --- */
                .lorebook-table-header {
                    display: flex;
                    padding: 5px 10px;
                    border-bottom: 1px solid var(--panel-border-color, #555);
                    font-weight: bold;
                    font-size: 0.85em;
                    color: var(--panel-text-color);
                    opacity: 0.7;
                    background-color: var(--panel-entry-bg-color, #2a2a2a);
                    margin-bottom: 8px;
                    align-items: center;
                }
                
                .lorebook-table-header .header-drag {
                    width: 30px;
                }
                
                .lorebook-table-header .header-expand {
                    width: 26px;
                }
                
                .lorebook-table-header .header-toggle {
                    width: 44px;
                }
                
                .lorebook-table-header .header-title {
                    flex-grow: 1;
                    margin: 0 8px;
                    width: 150px;
                }
                
                .lorebook-table-header .header-constant {
                    width: 45px;
                    text-align: center;
                    margin: 0 8px;
                }
                
                .lorebook-table-header .header-position {
                    width: 120px;
                    margin: 0 8px;
                }
                
                .lorebook-table-header .header-depth,
                .lorebook-table-header .header-order,
                .lorebook-table-header .header-probability {
                    width: 60px; /* 与输入框宽度保持一致 */
                    text-align: center;
                    margin: 0 8px;
                }
                
                .lorebook-table-header .header-actions {
                    width: 35px;
                    text-align: center;
                }
                
                /* 深度禁用状态样式 */
                .depth-disabled {
                    opacity: 0.5;
                }
                .depth-disabled input {
                    background-color: var(--panel-input-bg-color, #2a2a2a);
                    cursor: not-allowed;
                }
                
                /* 重新排序消息样式 */
                .reordering-message {
                    background-color: rgba(138, 95, 189, 0.2);
                    color: #8a5fbd;
                    text-align: center;
                    padding: 8px;
                    margin: 8px 0;
                    border-radius: 4px;
                    font-weight: bold;
                    border: 1px solid #8a5fbd;
                }
                
                /* 移动箭头按钮样式 */
                .move-buttons-container {
                    display: none; /* PC上默认隐藏 */
                }
                
                .move-button {
                    background-color: #444;
                    border: 1px solid #555;
                    color: #eee;
                    cursor: pointer;
                    padding: 3px 0;
                    font-size: 14px;
                    line-height: 1;
                    width: 24px;
                    height: 24px;
                    border-radius: 3px;
                    margin: 2px 0;
                    text-align: center;
                }
                
                .move-button:hover {
                    color: #fff;
                    background-color: #555;
                }
                
                
                
                /* 删除按钮样式 */
                #${LOREBOOK_PANEL_ID} .lorebook-delete-entries-button {
                    background-color: #993333;
                    border: none;
                    color: #fff;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    transition: background-color 0.2s ease;
                    margin-left: 5px;
                    margin-right: 5px;
                }
                /* 【新功能】批量操作按钮的通用样式 */
                #${LOREBOOK_PANEL_ID} .lorebook-batch-action-button {
                    background-color: #4a4a9a; /* 一个紫色/蓝色调 */
                    border: none;
                    color: #fff;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    transition: background-color 0.2s ease;
                    margin-left: 5px;
                }

                #${LOREBOOK_PANEL_ID} .lorebook-batch-action-button:hover {
                    background-color: #6a6ad1; /* 悬停时变亮 */
                }

                /* 全选按钮的激活状态 */
                #${LOREBOOK_PANEL_ID} .lorebook-batch-action-button[data-action="select-all"].active {
                    background-color: #4488cc !important;
                    box-shadow: 0 0 8px rgba(68, 136, 204, 0.6);
                }

                #${LOREBOOK_PANEL_ID} .lorebook-batch-action-button[data-action="select-all"].active.partial {
                    background-color: #5599dd !important;
                    box-shadow: 0 0 8px rgba(85, 153, 221, 0.6);
                }

                /* 批量操作下拉容器样式 */
                #${LOREBOOK_PANEL_ID} .lorebook-batch-toggle-container {
                    position: relative;
                    display: inline-block;
                    margin-left: 5px;
                }

                #${LOREBOOK_PANEL_ID} .lorebook-floating-dropdown-layer {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    z-index: 10030;
                    overflow: visible;
                }
                
                #${LOREBOOK_PANEL_ID} .batch-toggle-dropdown {
                    display: none;
                    position: absolute;
                    top: 100%;
                    left: 0;
                    background-color: var(--panel-dropdown-bg-color, #2a2a2a);
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 4px;
                    padding: 12px;
                    min-width: 150px;
                    z-index: 10000;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                    margin-top: 5px;
                }

                #${LOREBOOK_PANEL_ID} .batch-toggle-dropdown.floating-batch-dropdown {
                    margin-top: 0;
                    pointer-events: auto;
                    z-index: 10031;
                }
                
                #${LOREBOOK_PANEL_ID} .lorebook-batch-toggle-container.active .batch-toggle-dropdown {
                    display: block;
                }
                
                #${LOREBOOK_PANEL_ID} .batch-toggle-section {
                    margin-bottom: 12px;
                }
                
                #${LOREBOOK_PANEL_ID} .batch-toggle-label {
                    color: var(--panel-accent-color, #9a7ace);
                    font-size: 13px;
                    font-weight: bold;
                    margin-bottom: 8px;
                }
                
                #${LOREBOOK_PANEL_ID} .batch-toggle-radio-group,
                #${LOREBOOK_PANEL_ID} .batch-toggle-checkbox-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                
                #${LOREBOOK_PANEL_ID} .batch-toggle-radio-group label,
                #${LOREBOOK_PANEL_ID} .batch-toggle-checkbox-group label {
                    display: flex;
                    align-items: center;
                    color: #ddd;
                    font-size: 12px;
                    cursor: pointer;
                    user-select: none;
                }
                
                #${LOREBOOK_PANEL_ID} .batch-toggle-radio-group input,
                #${LOREBOOK_PANEL_ID} .batch-toggle-checkbox-group input {
                    margin-right: 6px;
                    cursor: pointer;
                }
                
                #${LOREBOOK_PANEL_ID} .batch-toggle-execute-btn {
                    width: 100%;
                    padding: 6px 12px;
                    background-color: #8e6ab8;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: bold;
                    margin-top: 8px;
                }
                
                #${LOREBOOK_PANEL_ID} .batch-toggle-execute-btn:hover {
                    background-color: #a87ad8;
                }

                /* 筛选器下拉菜单样式 */
                #${LOREBOOK_PANEL_ID} .filter-dropdown .filter-group {
                    margin-bottom: 8px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #444;
                }
                #${LOREBOOK_PANEL_ID} .filter-dropdown .filter-group:last-child {
                    border-bottom: none;
                    margin-bottom: 0;
                    padding-bottom: 0;
                }
                #${LOREBOOK_PANEL_ID} .filter-dropdown label {
                    display: flex;
                    align-items: center;
                    color: #ddd;
                    font-size: 12px;
                    cursor: pointer;
                    user-select: none;
                    margin: 4px 0;
                }
                #${LOREBOOK_PANEL_ID} .filter-dropdown input[type="checkbox"] {
                    margin-right: 6px;
                    cursor: pointer;
                }

                #${LOREBOOK_PANEL_ID} .lorebook-delete-entries-button:hover {
                    background-color: #cc3333;
                }
                #${LOREBOOK_PANEL_ID} .lorebook-rollback-button:hover {
                    background-color: #cc3333;
                }

                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-batch-action-button,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-delete-entries-button,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-add-entry-button,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .sort-display-button.master-sort-button,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .character-lorebook-actions .lorebook-batch-action-button {
                    width: 28px !important;
                    height: 28px !important;
                    min-width: 28px !important;
                    padding: 0 !important;
                    border-radius: 8px !important;
                    border: 1px solid color-mix(in srgb, var(--panel-icon-bg-color, #666) 78%, #fff) !important;
                    background-color: var(--panel-icon-bg-color, #666) !important;
                    color: #fff !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    text-align: center !important;
                    line-height: 1 !important;
                    box-shadow: none !important;
                    filter: none;
                }
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .sort-display-button.master-sort-button {
                    margin-left: 0;
                }
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-batch-action-button i,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-delete-entries-button i,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-add-entry-button i,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .sort-display-button.master-sort-button i,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .character-lorebook-actions .lorebook-batch-action-button i {
                    color: #fff !important;
                    float: none !important;
                    margin: 0 !important;
                    font-size: 0.9em;
                }
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-batch-action-button:hover,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-delete-entries-button:hover,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .lorebook-add-entry-button:hover,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .lorebook-title .sort-display-button.master-sort-button:hover,
                #${LOREBOOK_PANEL_ID}[data-unified-icon-buttons="true"] .character-lorebook-actions .lorebook-batch-action-button:hover {
                    background-color: var(--panel-icon-hover-bg-color, #777) !important;
                    color: #fff !important;
                }
                
                /* 选择复选框容器样式 */
                #${LOREBOOK_PANEL_ID} .select-checkbox-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-left: 8px;
                    width: 35px;
                }
                
                #${LOREBOOK_PANEL_ID} .entry-select-checkbox {
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    accent-color: var(--panel-accent-color);
                }
                
                /* 表头复选框样式 */
                #${LOREBOOK_PANEL_ID} .header-checkbox {
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    accent-color: var(--panel-accent-color);
                }
                
                /* 修改表头样式以包含复选框 */
                #${LOREBOOK_PANEL_ID} .lorebook-table-header .header-actions {
                    width: 35px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                
                /* 添加一个工具栏样式 */
                #${LOREBOOK_PANEL_ID} .entries-toolbar {
                    display: flex;
                    justify-content: flex-end;
                    padding: 5px 10px;
                    background-color: var(--panel-entry-bg-color, #2a2a2a);
                    border-bottom: 1px solid var(--panel-border-color, #444);
                    margin-top: 5px;
                }
                
                #${LOREBOOK_PANEL_ID} .toolbar-button {
                    background-color: #444;
                    border: 1px solid #555;
                    color: #eee;
                    padding: 4px 8px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-left: 5px;
                }
                
                #${LOREBOOK_PANEL_ID} .toolbar-button:hover {
                    background-color: #555;
                }
                
                #${LOREBOOK_PANEL_ID} .toolbar-button.select-all {
                    background-color: #336699;
                }
                
                #${LOREBOOK_PANEL_ID} .toolbar-button.select-all:hover {
                    background-color: #4477aa;
                }
                
                #${LOREBOOK_PANEL_ID} .toolbar-button.deselect-all {
                    background-color: #666;
                }
                
                #${LOREBOOK_PANEL_ID} .toolbar-button.deselect-all:hover {
                    background-color: #777;
                }

                /* --- 全局世界书选择器 --- */
                #global-lorebook-selector {
                    padding-bottom: 15px;
                    margin-bottom: 15px;
                    border-bottom: 1px solid var(--panel-border-color);
                }
                .global-lorebook-selector-header {
                    font-weight: bold;
                    color: var(--panel-text-color);
                    margin-bottom: 10px;
                }
                .global-lorebook-search-wrapper {
                    position: relative;
                    margin-bottom: 10px;
                }
                .global-lorebook-search-wrapper .fa-search {
                    position: absolute;
                    top: 50%;
                    left: 10px;
                    transform: translateY(-50%);
                    color: #888;
                }
                #global-lorebook-search, #character-worldbook-search-input, #add-worldbook-search-input, #optimize-compare-search-input {
                    width: 100%;
                    padding: 8px 12px 8px 35px;
                    background-color: var(--panel-input-bg-color, var(--search-input-bg-color, #2a2a2a));
                    border: 1px solid var(--panel-border-color);
                    border-radius: 4px;
                    color: var(--panel-text-color);
                }
                #global-lorebook-search:focus,
                #character-worldbook-search-input:focus,
                #add-worldbook-search-input:focus,
                #optimize-compare-search-input:focus {
                    outline: none;
                    border-color: var(--panel-accent-color);
                    background-color: var(--panel-input-focus-bg-color, #3a3a3a);
                }
                #${LOREBOOK_PANEL_ID} .character-lorebook-actions {
                    gap: 6px !important;
                    margin-left: 8px !important;
                }
                #${LOREBOOK_PANEL_ID} .character-lorebook-actions .lorebook-batch-action-button {
                    width: 26px;
                    height: 26px;
                    min-width: 26px;
                    margin: 0;
                    padding: 0;
                    border-radius: 50%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .global-lorebook-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    max-height: 150px;
                    overflow-y: auto;
                }
                .lorebook-tag {
                    background-color: var(--panel-input-bg-color, #444);
                    color: #ccc;
                    padding: 5px 10px;
                    border-radius: 15px;
                    cursor: pointer;
                    transition: background-color 0.2s, color 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 0.9em;
                }
                .lorebook-tag:hover {
                    background-color: var(--panel-field-focus-bg-color, #555);
                }
                .lorebook-tag.active {
                    background-color: var(--panel-accent-color);
                    color: #fff;
                    font-weight: bold;
                }
                .lorebook-tag .fa-times-circle {
                    display: none;
                }
                .lorebook-tag.active .fa-times-circle {
                    display: inline-block;
                }

                .lorebook-tag.active .fa-times-circle {
                    display: inline-block;
                    opacity: 0.7;
                }
                .lorebook-tag.active .fa-times-circle:hover {
                   opacity: 1;
                   color: #ffdddd;
                }

                /* 预设下拉菜单样式 */
                .preset-dropdown-container {
                    position: relative;
                    display: inline-block;
                    margin-left: 10px;
                }
                .preset-dropdown-menu {
                    display: none;
                    position: absolute;
                    top: 100%;
                    right: 0;
                    background-color: var(--panel-dropdown-bg-color, #2a2a2a);
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 4px;
                    padding: 5px 0;
                    min-width: 180px;
                    z-index: 1000;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                }
                .preset-item {
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 0.9em;
                    color: var(--panel-text-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .preset-item-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    cursor: pointer;
                }
                .preset-name {
                    flex-grow: 1;
                }
                .preset-delete-btn {
                    color: #999;
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                .preset-delete-btn:hover {
                    color: #ff6b6b;
                    background-color: rgba(255, 107, 107, 0.1);
                }
                .preset-divider {
                    height: 1px;
                    background-color: var(--panel-border-color, #444);
                    margin: 5px 0;
                }

                .preset-dropdown-button:hover {
                    color: var(--panel-accent-color) !important;
                }
                .preset-item:hover, .preset-item-row:hover {
                    background-color: var(--panel-field-focus-bg-color, rgba(255, 255, 255, 0.1));
                }
                .preset-name:hover {
                    color: var(--panel-accent-color);
                }

                /* --- 新增：常驻世界书添加器 --- */
                .global-lorebook-adder {
                    position: relative;
                    margin-bottom: 15px;
                }
                /* This style is now merged with the one above */
                .add-worldbook-results {
                   display: none;
                   position: absolute;
                   top: 100%;
                   left: 0;
                   right: 0;
                   background-color: var(--panel-dropdown-bg-color, #333);
                   border: 1px solid var(--panel-border-color, #555);
                   border-top: none;
                   border-radius: 0 0 4px 4px;
                   max-height: 400px;
                   overflow-y: auto;
                   z-index: 100;
                }
                .add-worldbook-result-item {
                   padding: 8px 12px;
                   cursor: pointer;
                   font-size: 0.9em;
                }
                .add-worldbook-result-item:hover {
                   background-color: var(--panel-dropdown-hover-bg-color, var(--panel-accent-color));
                   color: #fff;
                }
                .add-worldbook-no-results {
                   padding: 8px 12px;
                   color: #888;
                   font-style: italic;
                }

/* 【新功能】复制条目模态框的样式 */
#lorebook-copy-modal {
    display: flex;
    justify-content: center;
    align-items: center;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    z-index: 10000; /* 确保在最顶层 */
}

#lorebook-copy-modal-content {
    background-color: var(--panel-bg-color, #282828);
    color: var(--panel-text-color, #eee);
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #555;
    box-shadow: 0 5px 15px rgba(0,0,0,0.5);
    width: 90%;
    max-width: 400px;
    text-align: center;
}

#lorebook-copy-modal-content h4 {
    margin-top: 0;
    margin-bottom: 15px;
    color: var(--panel-accent-color);
}

#lorebook-destination-select {
    width: 100%;
    padding: 10px;
    margin-bottom: 20px;
    background-color: var(--panel-input-bg-color, #333);
    color: var(--panel-text-color, #eee);
    border: 1px solid var(--panel-border-color, #555);
    border-radius: 4px;
    font-size: 1em;
}

#lorebook-copy-modal-actions button {
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    margin: 0 5px;
    min-width: 80px;
}

.lorebook-copy-confirm-btn {
    background-color: var(--panel-accent-color);
    color: white;
}
.lorebook-copy-confirm-btn:hover {
    filter: brightness(1.2);
}

.lorebook-copy-cancel-btn {
    background-color: #555;
    color: white;
}
.lorebook-copy-cancel-btn:hover {
    background-color: #666;
}

                /* --- Theme Modal (using <dialog>) --- */
                #theme-settings-modal {
                    padding: 0;
                    border: 1px solid #555;
                    background-color: transparent; /* 外部容器透明，由内部容器处理背景 */
                    color: var(--modal-text-color, var(--panel-text-color, #eeeeee));
                    border-radius: 8px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.5);
                }
                #theme-settings-modal .lorebook-modal-content {
                    background-color: var(--modal-bg-color, #2c2c2c);
                    border-radius: 7px; /* 略小于父容器以避免边框冲突 */
                    overflow: hidden; /* 确保子元素（如header）不会溢出圆角 */
                    display: flex;
                    flex-direction: column;
                    max-height: calc(100vh - 80px);
                }
                #theme-settings-modal::backdrop {
                    background-color: rgba(0,0,0,0.8);
                }
                #theme-settings-modal .modal-header {
                    background-color: var(--modal-bg-color, #2c2c2c);
                    border-bottom: 2px solid var(--modal-accent-color, #9a7ace);
                    padding: 8px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                #theme-settings-modal .modal-header h4 {
                    margin: 0;
                    color: var(--modal-accent-color, #9a7ace);
                    font-weight: bold;
                    font-size: 1.05em;
                }
                #theme-settings-modal .modal-body {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 15px;
                    background-color: var(--modal-bg-color, #2c2c2c);
                    overflow-y: auto;
                }
                #theme-settings-modal .form-group {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 2px;
                }
                #theme-settings-modal .theme-hidden {
                    display: none !important;
                }
                #theme-settings-modal .theme-form-group-stacked {
                    align-items: stretch;
                    flex-direction: column;
                    gap: 6px;
                }
                #theme-settings-modal label {
                    color: var(--modal-text-color, var(--panel-text-color, #eeeeee));
                    opacity: 0.9;
                    font-size: 0.95em;
                }
                #theme-settings-modal input[type="color"] {
                    -webkit-appearance: none !important;
                    -moz-appearance: none !important;
                    appearance: none !important;
                    width: 120px !important;
                    height: 36px !important;
                    background-color: transparent !important;
                    border: 2px solid var(--panel-border-color) !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    padding: 2px !important;
                }
                #theme-settings-modal input[type="text"].form-control {
                    min-width: 0;
                    flex: 1 1 auto;
                    background-color: var(--panel-input-bg-color, #333);
                    color: var(--modal-text-color, var(--panel-text-color, #eeeeee));
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 6px;
                    padding: 7px 8px;
                    box-sizing: border-box;
                }
                #theme-settings-modal input[type="text"].form-control:focus {
                    outline: none;
                    border-color: var(--modal-accent-color, #9a7ace);
                    background-color: var(--panel-input-focus-bg-color, #3a3a3a);
                }
                #theme-settings-modal input[type="range"] {
                    width: 100%;
                    accent-color: var(--modal-accent-color, #9a7ace);
                }
                #theme-settings-modal .theme-background-image-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                #theme-settings-modal #panel-background-image-file-input {
                    display: none;
                }
                #theme-settings-modal #panel-background-image-upload-button,
                #theme-settings-modal #panel-background-image-clear-button {
                    flex: 0 0 auto;
                    background-color: var(--panel-input-bg-color, #333);
                    color: var(--modal-text-color, var(--panel-text-color, #eeeeee));
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 6px;
                    padding: 7px 10px;
                    cursor: pointer;
                }
                #theme-settings-modal #panel-background-image-upload-button:hover,
                #theme-settings-modal #panel-background-image-clear-button:hover {
                    background-color: var(--panel-input-focus-bg-color, #3a3a3a);
                }
                #theme-settings-modal select.form-control {
                    min-width: 120px;
                    background-color: var(--panel-input-bg-color, #333);
                    color: var(--modal-text-color, var(--panel-text-color, #eeeeee));
                    border: 1px solid var(--panel-border-color, #555);
                    border-radius: 6px;
                    padding: 6px 8px;
                }
                #theme-settings-modal select.form-control:focus {
                    outline: none;
                    border-color: var(--modal-accent-color, #9a7ace);
                    background-color: var(--panel-input-focus-bg-color, #3a3a3a);
                }
                #theme-settings-modal input[type="color"]::-webkit-color-swatch-wrapper {
                    padding: 0;
                }
                #theme-settings-modal input[type="color"]::-webkit-color-swatch {
                    border-radius: 4px;
                    border: none;
                }
                #theme-settings-modal input[type="color"]::-moz-color-swatch {
                    border-radius: 4px;
                    border: none;
                }
                #theme-settings-modal .form-actions {
                    text-align: right;
                    margin-top: 5px;
                    padding-top: 8px;
                    border-top: 1px solid var(--panel-border-color, #555);
                }
                #theme-settings-modal #reset-theme-button {
                    background-color: var(--modal-accent-color, #9a7ace);
                    color: var(--modal-text-color, #eeeeee);
                    border: none;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: filter 0.2s;
                }
                #theme-settings-modal #reset-theme-button:hover {
                    filter: brightness(1.2);
                }

                #theme-settings-modal .switch {
                   position: relative;
                   display: inline-block;
                   width: 46px;
                   height: 24px;
                }
                #theme-settings-modal .switch input {
                   opacity: 0;
                   width: 0;
                   height: 0;
                }
                #theme-settings-modal .slider {
                   position: absolute;
                   cursor: pointer;
                   top: 0;
                   left: 0;
                   right: 0;
                   bottom: 0;
                   background-color: var(--panel-entry-bg-color, #555);
                   transition: .4s;
                }
                #theme-settings-modal .slider:before {
                   position: absolute;
                   content: "";
                   height: 18px;
                   width: 18px;
                   left: 3px;
                   bottom: 3px;
                   background-color: white;
                   transition: .4s;
                }
                #theme-settings-modal input:checked + .slider {
                   background-color: var(--panel-accent-color);
                }
                #theme-settings-modal input:checked + .slider:before {
                   transform: translateX(22px);
                }
                #theme-settings-modal .slider.round {
                   border-radius: 24px;
                }
                #theme-settings-modal .slider.round:before {
                   border-radius: 50%;
                }

                /* --- 【新功能】优化模态框样式 --- */
                #lorebook-optimize-modal {
                    display: none;
                    position: fixed;
                    z-index: 10002; /* 比导入模态框更高 */
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.7);
                    justify-content: center;
                    align-items: center;
                }
                #lorebook-optimize-modal-content {
                    background-color: #2c2c2c;
                    color: #eee;
                    padding: 0;
                    border: 1px solid #555;
                    width: 90%;
                    max-width: 600px; /* 减小最大宽度 */
                    border-radius: 8px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                }
                #lorebook-optimize-modal-header {
                    padding: 10px 15px;
                    background-color: #3a6a8e;
                    color: white;
                    border-top-left-radius: 8px;
                    border-top-right-radius: 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                #lorebook-optimize-modal-header h4 { margin: 0; }
                #lorebook-optimize-modal .close-button { font-size: 28px; font-weight: bold; cursor: pointer; }
                #lorebook-optimize-modal-body {
                    padding: 15px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    max-height: 70vh; /* 添加最大高度 */
                    overflow-y: auto; /* 超出部分显示滚动条 */
                }
                .optimize-section {
                    background-color: var(--panel-entry-bg-color, #333);
                    border: 1px solid var(--panel-border-color, #444);
                    border-radius: 6px;
                    padding: 15px;
                }
                .optimize-section h5 {
                    margin-top: 0;
                    margin-bottom: 10px;
                    color: var(--panel-accent-color);
                    border-bottom: 1px solid #555;
                    padding-bottom: 5px;
                }
                .optimize-section .description {
                    font-size: 0.9em;
                    color: #ccc;
                    margin-bottom: 15px;
                }
                .optimize-section .action-area {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .optimize-section .action-area button {
                    padding: 8px 12px;
                    background-color: #5a3a8e;
                    border: none;
                    color: white;
                    cursor: pointer;
                    border-radius: 4px;
                }
                .optimize-section .action-area button:hover {
                    filter: brightness(1.2);
                }
                #optimize-cliche-words-textarea {
                    width: 100%;
                    min-height: 80px;
                    background-color: #222;
                    color: #eee;
                    border: 1px solid #555;
                    border-radius: 4px;
                    resize: vertical;
                    box-sizing: border-box;
                    padding: 8px;
                }
                #global-search-replace-area input {
                    flex-grow: 1;
                    background-color: #222;
                    color: #eee;
                    border: 1px solid #555;
                    padding: 8px;
                    border-radius: 4px;
                }
 
                 /* --- 统一的移动端媒体查询 --- */
                 @media (max-width: 768px) {
                     /* 面板 */
                    #${LOREBOOK_PANEL_ID} {
                        width: 95%;
                        max-width: 480px;
                        max-height: 85vh;
                        top: 45px;
                    }

                    /* 世界书标题 */
                    #${LOREBOOK_PANEL_ID} .lorebook-title {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 8px;
                        padding-bottom: 10px;
                    }
                    #${LOREBOOK_PANEL_ID} .lorebook-title-info-wrapper {
                        display: flex;
                        flex-direction: column;
                        align-items: flex-start;
                        flex-basis: 100%;
                        order: 1;
                    }
                    #${LOREBOOK_PANEL_ID} .lorebook-actions-wrapper {
                        display: flex;
                        width: 100%;
                        align-items: center;
                        gap: 8px;
                        order: 2;
                        flex-wrap: wrap; /* 改为允许换行 */
                        justify-content: flex-start;
                    }
                    #${LOREBOOK_PANEL_ID} .lorebook-actions-wrapper > * {
                        flex-shrink: 0; /* 防止按钮被压缩 */
                    }
                    #${LOREBOOK_PANEL_ID} .lorebook-search-sort-wrapper {
                        display: flex;
                        flex: 1 1 auto; /* 允许搜索排序容器伸缩 */
                        gap: 8px;
                        align-items: center;
                        min-width: 200px; /* 设置最小宽度 */
                    }
                    #${LOREBOOK_PANEL_ID} .lorebook-search-container {
                        flex: 1 1 auto; /* 允许搜索框伸缩但保持最小宽度 */
                        margin-left: 0;
                        min-width: 120px; /* 设置最小宽度 */
                    }
                    #${LOREBOOK_PANEL_ID} .lorebook-sort-container {
                        flex-shrink: 0; /* 排序按钮不压缩 */
                        margin-left: 0;
                    }
                    #${LOREBOOK_PANEL_ID} .lorebook-batch-action-button,
                    #${LOREBOOK_PANEL_ID} .lorebook-delete-entries-button,
                    #${LOREBOOK_PANEL_ID} .lorebook-add-entry-button {
                        flex-shrink: 0;
                        margin-left: 0;
                        width: 28px; /* 确保按钮宽度固定 */
                        height: 28px; /* 确保按钮高度固定 */
                    }
                    
                    /* 批量操作下拉容器在移动端样式 */
                    #${LOREBOOK_PANEL_ID} .lorebook-batch-toggle-container {
                        flex-shrink: 0;
                        margin-left: 0;
                    }

                    /* 条目头部 */
                    #${LOREBOOK_PANEL_ID} .entry-header {
                        flex-direction: column;
                        align-items: stretch;
                        padding: 10px;
                    }
                    #${LOREBOOK_PANEL_ID} .entry-header-right-actions {
                        display: flex;
                        align-items: center;
                        margin-left: auto;
                        flex-shrink: 0;
                    }
                    #${LOREBOOK_PANEL_ID} .mobile-row-1 {
                        display: flex;
                        align-items: center;
                        width: 100%;
                        margin-bottom: 8px;
                    }
                    #${LOREBOOK_PANEL_ID} .mobile-row-2 {
                        display: flex;
                        flex-wrap: wrap;
                        width: 100%;
                        align-items: center;
                        gap: 8px;
                    }
                    #${LOREBOOK_PANEL_ID} .drag-handle {
                        display: none;
                    }
                    #${LOREBOOK_PANEL_ID} .move-buttons-container {
                        display: flex !important;
                        flex-direction: column;
                        margin: 0 8px 0 0;
                    }
                    #${LOREBOOK_PANEL_ID} .entry-item-title {
                        flex-grow: 1;
                        margin: 0 8px 0 0;
                        min-width: 50px;
                        width: auto;
                        overflow: hidden;
                        text-overflow: var(--lorebook-name-text-overflow);
                        white-space: var(--lorebook-name-white-space);
                        overflow-wrap: var(--lorebook-name-overflow-wrap);
                        word-break: var(--lorebook-name-word-break);
                    }
                    #${LOREBOOK_PANEL_ID} .select-checkbox-container {
                        padding-left: 8px;
                    }
                    #${LOREBOOK_PANEL_ID} .mini-position-select {
                        flex-grow: 1;
                        min-width: 120px;
                        margin: 0;
                    }
                    #${LOREBOOK_PANEL_ID} .depth-input-container,
                    #${LOREBOOK_PANEL_ID} .order-input-container,
                    #${LOREBOOK_PANEL_ID} .prob-input-container {
                        margin: 0;
                        flex-shrink: 0;
                    }
                    #${LOREBOOK_PANEL_ID} .mini-constant-toggle {
                        margin: 0;
                    }
                    #${LOREBOOK_PANEL_ID} .lorebook-table-header {
                        display: none; /* 恢复在移动端隐藏表头 */
                    }

                    /* 移动端 WebView 在滚动虚拟列表时容易把合成层刷成黑块，这里关闭条目级 GPU/contain 优化。 */
                    #${LOREBOOK_PANEL_ID} .clusterize-scroll,
                    #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS} {
                        contain: none;
                        transform: none;
                    }

                    /* 触摸设备上不保留 hover 高亮，避免滚动途中条目头部或按钮停留在发黑状态。 */
                    #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS}:hover {
                        border-color: #444;
                    }
                    #${LOREBOOK_PANEL_ID} .${LOREBOOK_ENTRY_CLASS}.entry-active:hover {
                        border-left-color: #4CAF50;
                        background-color: rgba(76, 175, 80, 0.08);
                    }
                    #${LOREBOOK_PANEL_ID} .entry-header:hover {
                        background-color: var(--panel-entry-bg-color);
                    }
                    #${LOREBOOK_PANEL_ID} .entry-item-title:hover {
                        border-color: transparent;
                        background-color: transparent;
                    }
                    #${LOREBOOK_PANEL_ID} .small-expand-button:hover,
                    #${LOREBOOK_PANEL_ID} .content-edit-button:hover {
                        opacity: 0.7;
                        color: inherit;
                        background-color: transparent;
                    }
                    #${LOREBOOK_PANEL_ID} .move-button:hover {
                        color: #eee;
                        background-color: #444;
                    }

                    /* 为移动端控件添加标签的样式 */
                    #${LOREBOOK_PANEL_ID} .mobile-control-group {
                        display: flex;
                        align-items: center;
                        gap: 5px; /* 标签和控件之间的间距 */
                    }
                    #${LOREBOOK_PANEL_ID} .mobile-label {
                        font-size: 0.85em;
                        color: #ccc;
                        white-space: nowrap;
                    }

                    /* 编辑器面板 */
                    #${LOREBOOK_EDITOR_PANEL_ID} .lorebook-modal-content {
                        width: 95%;
                        max-width: 480px;
                    }
                    #${LOREBOOK_EDITOR_PANEL_ID} .form-row {
                        flex-direction: column;
                    }
                    #${LOREBOOK_EDITOR_PANEL_ID} .form-group.half {
                        width: 100%;
                        margin-right: 0;
                    }
                    #${LOREBOOK_EDITOR_PANEL_ID} .form-group.half + .form-group.half {
                        margin-top: 10px;
                    }

                    /* 移动端关键字输入优化 */
                    #${LOREBOOK_PANEL_ID} .keywords-edit-area {
                        position: relative;
                        flex-wrap: wrap;
                    }

                    /* 为关键字输入框添加聚焦状态类 */
                    #${LOREBOOK_PANEL_ID} .keywords-edit-area.keyword-focused .keyword-group {
                        display: none;
                    }
                    
                    #${LOREBOOK_PANEL_ID} .keywords-edit-area.keyword-focused .keyword-group.focused {
                        display: flex;
                        flex: 1 1 100%;
                        width: 100%;
                    }
                }
                
                /* --- 移动端长按提示 --- */
               #${MOBILE_TOOLTIP_ID} {
                   position: fixed;
                   display: none;
                   padding: 8px 12px;
                   background-color: rgba(0, 0, 0, 0.85);
                   color: #fff;
                   border-radius: 6px;
                   font-size: 0.9em;
                   z-index: 10005; /* Must be on top of everything */
                   pointer-events: none; /* Prevent tooltip from blocking other interactions */
                   max-width: 200px;
                   text-align: center;
               }
            </style>
        `;
    $('head', parentDoc).append(panelStyles);
  }

  // Add mobile tooltip element
  if ($(`#${MOBILE_TOOLTIP_ID}`, parentDoc).length === 0) {
    $('body', parentDoc).append(`<div id="${MOBILE_TOOLTIP_ID}"></div>`);
  }

  if ($(`#${LOREBOOK_FLOATING_BUBBLE_ID}`, parentDoc).length === 0) {
    $('body', parentDoc).append(
      `<button id="${LOREBOOK_FLOATING_BUBBLE_ID}" type="button" title="恢复世界书面板" aria-label="恢复世界书面板"><i class="${LOREBOOK_BUTTON_ICON}"></i></button>`,
    );
  }

  $(`#${LOREBOOK_FLOATING_BUBBLE_ID}`, parentDoc).attr({
    title: '恢复世界书面板',
    'aria-label': '恢复世界书面板',
  });

  $(`#${LOREBOOK_FLOATING_BUBBLE_ID}`, parentDoc).attr({
    title: 'Restore Lorebook Panel',
    'aria-label': 'Restore Lorebook Panel',
  });

  if ($(`#${LOREBOOK_PANEL_ID}`, parentDoc).length === 0) {
    const panelHtml = `
            <div id="${LOREBOOK_PANEL_ID}">
                <div class="panel-header">
                    <h4>世界书编辑面板</h4>
                    <button class="theme-settings-button"><i class="fa-solid fa-palette"></i> 主题</button>
                    <!-- <button id="layout-debugger-button" style="background-color: #c53a3a; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 10px;">布局调试</button> -->
                    <button class="${LOREBOOK_MINIMIZE_BUTTON_CLASS}" title="最小化">−</button>
                    <button class="close-button" title="关闭">×</button>
                </div>
                <div class="tab-container">
                    <button id="${CHARACTER_TAB_ID}" class="tab-button ${ACTIVE_TAB_CLASS}">角色世界书</button>
                    <button id="${GLOBAL_TAB_ID}" class="tab-button">全局世界书</button>
                    <button id="${AI_TAB_ID}" class="tab-button">AI 修改</button>
                </div>
                <div class="content-container">
                    <div id="${CHARACTER_CONTENT_ID}" class="tab-content ${ACTIVE_CONTENT_CLASS}">
                        <div class="tab-workspace" data-tab-key="character">
                        <div class="workspace-master">
                        <div class="list-container" id="${LOREBOOK_LIST_CONTAINER_ID}">
                            <p>加载中...</p>
                        </div>
                        </div>
                        <div class="workspace-resizer" aria-hidden="true"></div>
                        <div class="workspace-detail" id="${CHARACTER_DETAIL_CONTAINER_ID}"></div>
                        </div>
                    </div>
                    <div id="${GLOBAL_CONTENT_ID}" class="tab-content">
                        <div class="tab-workspace" data-tab-key="global">
                        <div class="workspace-master">
                        <div class="list-container" id="${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}">
                           <div id="global-lorebook-selector"></div>
                            <p>加载中...</p>
                        </div>
                        </div>
                            <div class="workspace-resizer" aria-hidden="true"></div>
                            <div class="workspace-detail" id="${GLOBAL_DETAIL_CONTAINER_ID}"></div>
                        </div>
                    </div>
                    <div id="${AI_CONTENT_ID}" class="tab-content">
                        <div class="list-container ai-workspace-list-container"></div>
                    </div>
                    <div class="debug-info" style="display:none;"></div>
                </div>
            </div>
        `;
    $('body', parentDoc).append(panelHtml);

    // Re-add the missing theme modal HTML
    if ($('#theme-settings-modal', parentDoc).length === 0) {
      const themeModalHtml = `
            <dialog id="theme-settings-modal">
                <div class="lorebook-modal-content">
                    <div class="modal-header">
                        <h4>主题颜色设置</h4>
                        <button class="close-button" title="关闭" onclick="this.closest('dialog').close()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="panel-bg-color-picker">面板背景色</label>
                            <input type="color" id="panel-bg-color-picker" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="panel-text-color-picker">面板字体颜色</label>
                            <input type="color" id="panel-text-color-picker" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="panel-accent-color-picker">强调/主题颜色</label>
                            <input type="color" id="panel-accent-color-picker" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="panel-entry-bg-color-picker">条目背景颜色</label>
                            <input type="color" id="panel-entry-bg-color-picker" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="search-input-bg-color-picker">输入栏背景色</label>
                            <input type="color" id="search-input-bg-color-picker" class="form-control">
                        </div>
                        <div id="panel-background-image-url-group" class="form-group theme-form-group-stacked">
                            <label for="panel-background-image-url-input">背景图</label>
                            <div class="theme-background-image-row">
                                <input type="text" id="panel-background-image-url-input" class="form-control" placeholder="粘贴图片 URL 或上传图片">
                                <button type="button" id="panel-background-image-upload-button">上传</button>
                                <button type="button" id="panel-background-image-clear-button">清除</button>
                                <input type="file" id="panel-background-image-file-input" accept="image/*">
                            </div>
                        </div>
                        <div id="panel-background-opacity-group" class="form-group theme-form-group-stacked">
                            <label for="panel-background-opacity-slider">背景图不透明度 <span id="panel-background-opacity-value">35%</span></label>
                            <input type="range" id="panel-background-opacity-slider" min="0" max="100" step="1">
                        </div>
                        <div id="panel-opacity-group" class="form-group theme-form-group-stacked">
                            <label for="panel-opacity-slider">插件页面不透明度 <span id="panel-opacity-value">100%</span></label>
                            <input type="range" id="panel-opacity-slider" min="0" max="100" step="1">
                        </div>
                        <div class="form-actions">
                            <button type="button" id="reset-theme-button">恢复当前布局默认颜色</button>
                        </div>
                    </div>
                </div>
            </dialog>
        `;
      $('body', parentDoc).append(themeModalHtml);
    }
  }

  // The creation of other modals (editor, optimizer, etc.) will be handled by their respective modules.

  const $button = $(`#${LOREBOOK_BUTTON_ID}`, parentDoc);
  if ($button.length > 0 && !$button.closest('#extensionsMenu').length) {
    $button.remove();
  }
  if ($button.length === 0) {
    const buttonHtml = `
            <div id="${LOREBOOK_BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" title="${LOREBOOK_BUTTON_TOOLTIP}" tabIndex="0">
                <i class="${LOREBOOK_BUTTON_ICON}"></i>
                <span>${LOREBOOK_BUTTON_TEXT_IN_MENU}</span>
            </div>
        `;
    $('#extensionsMenu', parentDoc).append(buttonHtml);
  }

  lorebookPanelMinimized = false;
  hideFloatingBubble();
  ensureFloatingBubbleInViewport({ persist: false });
}
