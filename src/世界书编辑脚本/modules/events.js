/**
 * 事件处理中心
 * 负责绑定事件监听器并分发到对应的命令处理器
 */

import { updateWorldbookEntries } from './api.js';
import { dispatchCommand, hasCommand } from './commands/index.js';
// 导入命令模块以触发注册
import './commands/selectorCommands.js';
import './commands/worldbookCommands.js';
import './commands/titleBarCommands.js';
import './commands/entryCommands.js';
import './commands/folderCommands.js';

import {
  ACTIVE_TAB_CLASS,
  DEBUG_MODE,
  GLOBAL_LOREBOOK_LIST_CONTAINER_ID,
  GLOBAL_WORLDBOOK_SEARCH_ID,
  GLOBAL_WORLDBOOK_TAGS_CONTAINER_ID,
  LOREBOOK_BUTTON_ID,
  LOREBOOK_EDITOR_PANEL_ID,
  LOREBOOK_ENTRY_CHECKBOX_CLASS,
  LOREBOOK_ENTRY_CLASS,
  LOREBOOK_FLOATING_BUBBLE_ID,
  LOREBOOK_LIST_CONTAINER_ID,
  LOREBOOK_MINIMIZE_BUTTON_CLASS,
  LOREBOOK_PANEL_ID,
  MOBILE_TOOLTIP_ID,
} from './config.js';
import {
  executeGlobalSearchAndReplace,
  previewLorebookCompare,
  previewGlobalSearchAndReplace,
  runClicheCleanup,
  runDepthOptimization,
  runFormatCleanup,
  runKeywordFix,
} from './features/optimizer.js';
import { saveSortPreference } from './features/sorting.js';
import {
  allEntriesData,
  getSelectableEntries,
  setSelectedEntries,
  setActiveLorebookGroup,
  getSelectedEntries,
  lorebookSorts,
  toggleFolderCollapsedState,
  setEntrySearchQuery,
  virtualScrollers,
} from './state.js';
import { toggleAllEntries } from './features/batchActions.js';
import { createEntryHtml } from './ui/entry.js';
import {
  getTabKey,
  isMasterDetailLayout,
  renderDetailPane,
  selectDetailEntry,
  syncPanelLayoutMode,
} from './ui/detail.js';
import {
  closeFloatingBatchToggleDropdowns,
  repositionFloatingBatchToggleDropdowns,
  toggleFloatingBatchToggleDropdown,
} from './ui/floatingBatchDropdown.js';
import { loadLorebookEntries, updateHeaderCheckboxState } from './ui/list.js';
import {
  closeLorebookPanel,
  ensureFloatingBubbleInViewport,
  minimizeLorebookPanel,
  restoreLorebookPanel,
  setFloatingBubbleViewportPosition,
  switchTab,
  toggleLorebookPanel,
} from './ui/panel.js';
import { ensureNumericUID, isMobile } from './utils.js';
import { isDepthPositionValue } from './position.js';

/**
 * 刷新条目列表
 */
async function refreshList(lorebookName, isGlobal) {
  const selectedUids = getSelectedEntries(lorebookName);

  const parentDoc = window.parent.document;
  const $entriesWrapper = $(`.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"]`, parentDoc);
  if ($entriesWrapper.is(':visible')) {
    await loadLorebookEntries(lorebookName, $entriesWrapper, isGlobal);
    const existingUidSet = new Set(
      (Array.isArray(allEntriesData[lorebookName]) ? allEntriesData[lorebookName] : []).map(entry => ensureNumericUID(entry.uid)),
    );
    setSelectedEntries(
      lorebookName,
      selectedUids.filter(uid => existingUidSet.has(ensureNumericUID(uid))),
      { preserveSelectAllMemory: true },
    );
    updateHeaderCheckboxState(lorebookName, isGlobal);
  }
}

/**
 * 绑定所有事件监听器
 */
export function bindEventListeners() {
  const parentDoc = window.parent.document;
  const parentWin = parentDoc.defaultView || window.parent || window;
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
  const $editorPanel = $(`#${LOREBOOK_EDITOR_PANEL_ID}`, parentDoc);
  const floatingBubbleSelector = `#${LOREBOOK_FLOATING_BUBBLE_ID}`;
  const BUBBLE_DRAG_THRESHOLD = 4;
  let bubbleDragState = null;
  let suppressBubbleClickUntil = 0;
  let suppressLongPressClickUntil = 0;
  let lastViewportIsMobile = isMobile();
  let pendingViewportModeRefresh = false;

  const refreshCurrentTabForViewportMode = async force => {
    const currentIsMobile = isMobile();
    if (currentIsMobile !== lastViewportIsMobile) {
      pendingViewportModeRefresh = true;
    }

    if (!force && !pendingViewportModeRefresh) {
      return;
    }

    if (!$panel.length || !$panel.is(':visible')) {
      return;
    }

    lastViewportIsMobile = currentIsMobile;
    pendingViewportModeRefresh = false;
    syncPanelLayoutMode();
    const activeTabId = $panel.find('.tab-button.active-tab').attr('id');
    if (activeTabId) {
      await switchTab(activeTabId);
    }
  };

  const getPointerPoint = event => {
    const originalEvent = event?.originalEvent || event;
    const touch = originalEvent?.touches?.[0] || originalEvent?.changedTouches?.[0];
    if (touch) {
      return { x: touch.clientX, y: touch.clientY };
    }
    return {
      x: originalEvent?.clientX,
      y: originalEvent?.clientY,
    };
  };

  const startBubbleDrag = (event, pointerType = 'mouse') => {
    const $bubble = $(event.currentTarget);
    if (!$bubble.length) {
      return;
    }

    const point = getPointerPoint(event);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }

    const bubbleNode = $bubble.get(0);
    const originalEvent = event?.originalEvent;
    if (pointerType === 'mouse' && originalEvent?.button != null && originalEvent.button !== 0) {
      return;
    }

    const rect = bubbleNode.getBoundingClientRect();
    bubbleDragState = {
      pointerType,
      pointerId: originalEvent?.pointerId ?? null,
      startX: point.x,
      startY: point.y,
      startLeft: rect.left,
      startTop: rect.top,
      didMove: false,
    };

    suppressBubbleClickUntil = 0;
    $bubble.addClass('is-dragging');

    if (originalEvent?.pointerId != null && typeof bubbleNode.setPointerCapture === 'function') {
      try {
        bubbleNode.setPointerCapture(originalEvent.pointerId);
      } catch (error) {
        // Ignore pointer capture failures in cross-document contexts.
      }
    }

    if (pointerType !== 'mouse') {
      event.preventDefault();
    }
  };

  const moveBubbleDrag = event => {
    if (!bubbleDragState) {
      return;
    }

    const point = getPointerPoint(event);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }

    const deltaX = point.x - bubbleDragState.startX;
    const deltaY = point.y - bubbleDragState.startY;
    if (Math.abs(deltaX) >= BUBBLE_DRAG_THRESHOLD || Math.abs(deltaY) >= BUBBLE_DRAG_THRESHOLD) {
      bubbleDragState.didMove = true;
    }

    setFloatingBubbleViewportPosition(
      {
        x: bubbleDragState.startLeft + deltaX,
        y: bubbleDragState.startTop + deltaY,
      },
      { persist: false },
    );

    if (bubbleDragState.pointerType !== 'mouse') {
      event.preventDefault();
    }
  };

  const stopBubbleDrag = event => {
    if (!bubbleDragState) {
      return;
    }

    const { didMove } = bubbleDragState;
    bubbleDragState = null;
    $(floatingBubbleSelector, parentDoc).removeClass('is-dragging');

    if (didMove) {
      ensureFloatingBubbleInViewport({ persist: true });
      suppressBubbleClickUntil = Date.now() + 250;
      if (event?.preventDefault) {
        event.preventDefault();
      }
    }
  };

  // --- Layout Debugger ---
  $(parentDoc).on('click', '#layout-debugger-button', () => {
    console.clear();
    console.log('%c--- Layout Debugger Initialized ---', 'color: #ff4d4d; font-weight: bold; font-size: 1.2em;');

    const $modal = $('#lorebook-import-modal', parentDoc);
    const $mainPanel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);

    if (!$modal.length) {
      console.error('DEBUGGER: Import modal (#lorebook-import-modal) not found in DOM.');
      return;
    }
    if (!$mainPanel.length) {
      console.error('DEBUGGER: Main panel (#enhanced-lorebook-panel) not found in DOM.');
      return;
    }

    console.log('%c1. Modal Parent Hierarchy Trace:', 'color: #4d94ff; font-weight: bold;');
    let current = $modal.get(0);
    const path = [];
    while (current && current.tagName !== 'BODY') {
      const { tagName, id, className } = current;
      const style = window.getComputedStyle(current);
      const position = style.getPropertyValue('position');
      const transform = style.getPropertyValue('transform');
      const filter = style.getPropertyValue('filter');
      const perspective = style.getPropertyValue('perspective');

      path.push({
        element: tagName.toLowerCase() + (id ? `#${id}` : '') + (className ? `.${className.split(' ').join('.')}` : ''),
        position,
        transform: transform !== 'none' ? transform : 'default',
        filter: filter !== 'none' ? filter : 'default',
        perspective: perspective !== 'none' ? perspective : 'default',
      });
      current = current.parentElement;
    }
    console.table(path);
    if (path.some(p => p.transform !== 'default' || p.filter !== 'default' || p.perspective !== 'default')) {
      console.warn(
        'DEBUGGER: Found a parent with transform, filter, or perspective. This is likely trapping the `position: fixed` modal and causing the layout issue.',
      );
    } else {
      console.log(
        'DEBUGGER: No parent element seems to be creating a new stacking context. The issue might be elsewhere.',
      );
    }

    console.log('%c2. Computed Styles Comparison:', 'color: #4d94ff; font-weight: bold;');
    const getStyles = (elem, name) => {
      const style = window.getComputedStyle(elem);
      return {
        element: name,
        display: style.getPropertyValue('display'),
        position: style.getPropertyValue('position'),
        top: style.getPropertyValue('top'),
        left: style.getPropertyValue('left'),
        width: style.getPropertyValue('width'),
        height: style.getPropertyValue('height'),
        zIndex: style.getPropertyValue('z-index'),
        overflow: style.getPropertyValue('overflow'),
      };
    };
    console.table([
      getStyles($modal.get(0), '#lorebook-import-modal'),
      getStyles($mainPanel.get(0), '#enhanced-lorebook-panel'),
    ]);

    console.log('%c--- Debug Report Complete ---', 'color: #ff4d4d; font-weight: bold; font-size: 1.2em;');
    alert('调试报告已输出到浏览器开发者控制台 (按 F12 打开)。请将Console标签页下的内容截图或复制给开发者。');
  });

  // Mobile long-press tooltip logic
  if (isMobile()) {
    let pressTimer;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let longPressTriggered = false;

    $panel.on('touchstart', '[title]', function (e) {
      const $target = $(this);
      const title = $target.attr('title');
      if (!title) return;

      const touch = e.originalEvent.touches?.[0] || e.originalEvent.changedTouches?.[0];
      if (!touch) return;

      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      longPressTriggered = false;

      pressTimer = setTimeout(() => {
        longPressTriggered = true;
        const $tooltip = $(`#${MOBILE_TOOLTIP_ID}`, parentDoc);
        $tooltip.text(title).css({ top: '-9999px', left: '-9999px' }).show();

        const targetRect = $target.get(0).getBoundingClientRect();
        const tooltipNode = $tooltip.get(0);
        const tooltipWidth = tooltipNode.offsetWidth;
        const tooltipHeight = tooltipNode.offsetHeight;
        const windowWidth = window.parent.innerWidth;

        let top = targetRect.top - tooltipHeight - 10;
        let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;

        if (top < 5) {
          top = targetRect.bottom + 10;
        }
        if (left < 5) {
          left = 5;
        }
        if (left + tooltipWidth > windowWidth - 5) {
          left = windowWidth - tooltipWidth - 5;
        }

        $tooltip.css({
          top: `${top}px`,
          left: `${left}px`,
          transform: 'none',
        });
      }, 500);
    });

    $panel.on('touchend touchcancel', '[title]', function () {
      clearTimeout(pressTimer);
      if (longPressTriggered) {
        suppressLongPressClickUntil = Date.now() + 250;
      }
      $(`#${MOBILE_TOOLTIP_ID}`, parentDoc).hide();
    });

    $panel.on('touchmove', '[title]', function (e) {
      const touch = e.originalEvent.touches?.[0] || e.originalEvent.changedTouches?.[0];
      if (!touch) return;

      if (Math.abs(touch.clientX - lastTouchX) > 10 || Math.abs(touch.clientY - lastTouchY) > 10) {
        clearTimeout(pressTimer);
        $(`#${MOBILE_TOOLTIP_ID}`, parentDoc).hide();
      }
    });
  }

  // Double-click header to show debug info
  const toggleDebug = $elem => {
    $elem.find('.debug-info').toggle();
  };
  $panel.find('.panel-header h4').on('dblclick', () => toggleDebug($panel));
  $editorPanel.find('.modal-header h4').on('dblclick', function () {
    toggleDebug($(this).closest('.lorebook-modal-content'));
  });

  // Main panel button and close button
  $(parentDoc)
    .off(`click.${LOREBOOK_BUTTON_ID}`)
    .on(`click.${LOREBOOK_BUTTON_ID}`, `#${LOREBOOK_BUTTON_ID}`, async event => {
      event.preventDefault();
      await toggleLorebookPanel();
      await refreshCurrentTabForViewportMode(false);
    });
  $panel
    .off('click.lorebookClose')
    .on('click.lorebookClose', '.close-button', async event => {
      event.preventDefault();
      await closeLorebookPanel();
    });
  $panel
    .off('click.lorebookMinimize')
    .on('click.lorebookMinimize', `.${LOREBOOK_MINIMIZE_BUTTON_CLASS}`, async event => {
      event.preventDefault();
      event.stopPropagation();
      await minimizeLorebookPanel();
    });
  $(parentDoc)
    .off('click.lorebookBubbleRestore')
    .on('click.lorebookBubbleRestore', floatingBubbleSelector, async event => {
      if (Date.now() < suppressBubbleClickUntil) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      await restoreLorebookPanel();
      await refreshCurrentTabForViewportMode(false);
    });

  $(parentDoc).off('.lorebookBubbleDrag');
  $(parentWin).off('.lorebookBubbleViewport');

  if (typeof parentWin.PointerEvent === 'function') {
    $(parentDoc)
      .on('pointerdown.lorebookBubbleDrag', floatingBubbleSelector, event => startBubbleDrag(event, 'pointer'))
      .on('pointermove.lorebookBubbleDrag', moveBubbleDrag)
      .on('pointerup.lorebookBubbleDrag pointercancel.lorebookBubbleDrag', stopBubbleDrag);
  } else {
    $(parentDoc)
      .on('mousedown.lorebookBubbleDrag', floatingBubbleSelector, event => startBubbleDrag(event, 'mouse'))
      .on('touchstart.lorebookBubbleDrag', floatingBubbleSelector, event => startBubbleDrag(event, 'touch'))
      .on('mousemove.lorebookBubbleDrag touchmove.lorebookBubbleDrag', moveBubbleDrag)
      .on('mouseup.lorebookBubbleDrag touchend.lorebookBubbleDrag touchcancel.lorebookBubbleDrag', stopBubbleDrag);
  }

  $(parentWin)
    .on('resize.lorebookBubbleViewport orientationchange.lorebookBubbleViewport', async () => {
      ensureFloatingBubbleInViewport({ persist: true });
      await refreshCurrentTabForViewportMode(false);
    });

  // Tab switching
  $panel.off('click.lorebookTabs').on('click.lorebookTabs', '.tab-button', function () {
    const tabId = $(this).attr('id');
    if (tabId && !$(this).hasClass(ACTIVE_TAB_CLASS)) {
      switchTab(tabId);
    }
  });

  // 【调试】事件计数器，用于追踪展开事件
  let expandEventCounter = 0;

  // Event delegation for all entry and title bar interactions
  $panel
    .off('click.lorebookAction change.lorebookAction input.lorebookAction')
    .on('click.lorebookAction change.lorebookAction input.lorebookAction', `[data-action]`, async function (e) {
      e.stopPropagation();
      const $target = $(e.target);
      const $actionTarget = $target.closest('[data-action]');
      if (!$actionTarget.length) return;
      if (isMobile() && e.type === 'click' && Date.now() < suppressLongPressClickUntil) {
        e.preventDefault();
        return;
      }

      const action = $actionTarget.data('action');

      // 调试：记录 expand action 的事件触发
      if (DEBUG_MODE && action === 'expand') {
        expandEventCounter++;
        const $entryItem = $target.closest(`.${LOREBOOK_ENTRY_CLASS}`);
        const entryUid = ensureNumericUID($entryItem.data('entry-uid'));
        const entryLorebookName = $entryItem.data('entry-lorebook');
        console.log(`[Events] expand action #${expandEventCounter}`, { entryUid, lorebookName: entryLorebookName });
      }

      let $title = $target.closest('.lorebook-title');
      if (!$title.length) {
        const $floatingDropdown = $target.closest('.batch-toggle-dropdown');
        const $floatingOwner = $floatingDropdown.data('floating-owner-container');
        if ($floatingOwner?.length) {
          $title = $floatingOwner.closest('.lorebook-title');
        }
      }
      const $folder = $target.closest('.lorebook-folder-item, .master-folder-item');
      const $item = $target.closest(`.${LOREBOOK_ENTRY_CLASS}`);

      const isTitleAction = $title.length > 0 && !$item.length;
      const isFolderAction = $folder.length > 0 && !$item.length && !$title.length;
      const isSelectorAction = $target.closest('#global-lorebook-selector').length > 0;

      // 构建命令上下文
      const context = {
        event: e,
        $target,
        $actionTarget,
        $panel,
        parentDoc,
        refreshList,
      };

      const globalModalActions = new Set(['ai-preview-apply']);
      if (globalModalActions.has(action)) {
        if (hasCommand(action)) {
          await dispatchCommand(action, context);
        }
        return;
      }

      // 处理选择器操作
      if (isSelectorAction) {
        if (hasCommand(action)) {
          await dispatchCommand(action, context);
        }
        return;
      }

      // 处理世界书管理操作（不需要 lorebookName 的操作）
      const worldbookActions = [
        'import-worldbook',
        'export-worldbook',
        'create-worldbook',
        'delete-worldbook',
        'rename-worldbook',
        'replace-character-lorebook',
        'select-optimizer-compare-lorebook',
        'set-as-char-lorebook',
        'set-as-chat-lorebook',
      ];
      if (worldbookActions.includes(action)) {
        if (hasCommand(action)) {
          await dispatchCommand(action, context);
        }
        return;
      }

      if (isFolderAction) {
        context.lorebookName = $folder.attr('data-lorebook-name');
        context.isGlobal = $folder.attr('data-is-global') === 'true';
        context.folderId = $folder.attr('data-folder-id');
        context.folderName = $folder.attr('data-folder-name');
        context.$folder = $folder;

        if (hasCommand(action)) {
          await dispatchCommand(action, context);
        }
        return;
      }

      // 处理标题栏操作
      if (isTitleAction) {
        const lorebookName = $title.data('lorebook-name');
        const isGlobal = $title.data('is-global');

        context.lorebookName = lorebookName;
        context.isGlobal = isGlobal;
        context.$title = $title;

        if (hasCommand(action)) {
          await dispatchCommand(action, context);
        }
        return;
      }

      // 处理条目操作
      if (!$item.length || !action) return;

      const lorebookName = $item.data('entry-lorebook');
      const numericUid = ensureNumericUID($item.data('entry-uid'));
      const isGlobal = $item.closest('.lorebook-entries-container').attr('data-is-global') === 'true';

      context.lorebookName = lorebookName;
      context.numericUid = numericUid;
      context.isGlobal = isGlobal;
      context.$item = $item;

      if (hasCommand(action)) {
        await dispatchCommand(action, context);
      }
    });

  $(parentDoc)
    .off('click.aiDialogAction')
    .on('click.aiDialogAction', '#lorebook-ai-action-modal [data-action]', async function (e) {
      e.stopPropagation();
      const $target = $(e.target);
      const $actionTarget = $target.closest('[data-action]');
      if (!$actionTarget.length) return;

      const action = $actionTarget.data('action');
      if (!hasCommand(action)) {
        return;
      }

      await dispatchCommand(action, {
        event: e,
        $target,
        $actionTarget,
        $panel,
        parentDoc,
        refreshList,
      });
    });

  // Header checkbox
  $panel.off('change.headerCheckbox').on('change', '.header-checkbox', function (e) {
    e.stopPropagation();
    const $headerCheckbox = $(this);
    const lorebookName = $headerCheckbox.data('lorebook-name');
    // 【修复】确保 isGlobal 是布尔值，处理字符串 "true"/"false" 的情况
    const isGlobalAttr = $headerCheckbox.data('is-global');
    const isGlobal = isGlobalAttr === true || isGlobalAttr === 'true';
    toggleAllEntries(lorebookName, isGlobal);
  });

  $panel.off('click.folderToggle').on('click.folderToggle', '.lorebook-folder-toggle, .master-folder-toggle', function (e) {
    e.preventDefault();
    e.stopPropagation();

    const $toggle = $(this);
    const $folderItem = $toggle.closest('.lorebook-folder-item, .master-folder-item');
    const lorebookName = $folderItem.attr('data-lorebook-name');
    const folderId = $folderItem.attr('data-folder-id');
    const nextCollapsed = toggleFolderCollapsedState(lorebookName, folderId);
    const $folderEntries = $folderItem.next('.lorebook-folder-entries, .master-folder-entries');

    $folderItem.toggleClass('is-collapsed', nextCollapsed);
    $toggle.attr('title', nextCollapsed ? '展开文件夹' : '折叠文件夹');
    $toggle
      .find('.lorebook-folder-chevron, .master-folder-chevron')
      .toggleClass('fa-chevron-right', nextCollapsed)
      .toggleClass('fa-chevron-down', !nextCollapsed);
    $toggle
      .find('.lorebook-folder-icon, .master-folder-icon')
      .toggleClass('fa-folder', nextCollapsed)
      .toggleClass('fa-folder-open', !nextCollapsed);
    $folderEntries.toggle(!nextCollapsed);
  });

  $panel.off('change.folderSelect').on('change.folderSelect', '.lorebook-folder-checkbox, .master-folder-checkbox', function (e) {
    e.stopPropagation();

    const $checkbox = $(this);
    const $folderItem = $checkbox.closest('.lorebook-folder-item, .master-folder-item');
    const lorebookName = $folderItem.attr('data-lorebook-name');
    const isGlobal = $folderItem.attr('data-is-global') === 'true';
    const shouldSelect = $checkbox.prop('checked');
    const folderUids = ($folderItem.attr('data-folder-uids') || '')
      .split(',')
      .map(uid => Number(uid))
      .filter(uid => Number.isFinite(uid));

    const nextSelected = new Set(getSelectedEntries(lorebookName));
    folderUids.forEach(uid => {
      if (shouldSelect) {
        nextSelected.add(uid);
      } else {
        nextSelected.delete(uid);
      }
    });
    setSelectedEntries(lorebookName, [...nextSelected]);

    const $entriesWrapper = $(
      `.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"][data-is-global="${isGlobal ? 'true' : 'false'}"]`,
      parentDoc,
    );
    folderUids.forEach(uid => {
      $entriesWrapper.find(`.${LOREBOOK_ENTRY_CHECKBOX_CLASS}[data-entry-uid="${uid}"]`).prop('checked', shouldSelect);
    });

    updateHeaderCheckboxState(lorebookName, isGlobal);
  });

  // Lorebook title click to expand/collapse
  $panel.off('click.lorebookTitleClick').on('click.lorebookTitleClick', '.lorebook-title-clickable', function (e) {
    e.stopPropagation();
    const $title = $(this);
    if (
      $(e.target).closest(
        '.lorebook-search-container, .lorebook-search-input, .lorebook-batch-action-button, .lorebook-delete-entries-button, .lorebook-add-entry-button, .sort-display-button, .lorebook-batch-toggle-container, .preset-dropdown-container, .preset-dropdown-menu, .lorebook-title-menu-button, .lorebook-title-menu, .lorebook-title-select-all, .header-checkbox',
      ).length > 0
    ) {
      return;
    }
    const lorebookName = $title.attr('data-lorebook-name');
    const isLoaded = $title.attr('data-loaded') === 'true';
    const isExpanded = $title.attr('data-expanded') === 'true';
    const isGlobal = $title.attr('data-is-global') === 'true';
    const tabKey = getTabKey(isGlobal);
    const $entriesWrapper = $(`.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"]`);
    const $content = $title.closest('.tab-content');

    const toggleUI = state => {
      $title.attr('data-expanded', state);
      $title.find('.lorebook-expand-icon').toggleClass('fa-chevron-up', state).toggleClass('fa-chevron-down', !state);
      $entriesWrapper[state ? 'slideDown' : 'slideUp'](200);
    };

    if (isMasterDetailLayout()) {
      if (isExpanded) {
        $title.attr('data-expanded', 'false');
        $title.find('.lorebook-expand-icon').removeClass('fa-chevron-up').addClass('fa-chevron-down');
        $entriesWrapper.hide();
        return;
      }

      const closeOthers = () => {
        $content
          .find('.lorebook-title-clickable')
          .not($title)
          .each(function () {
            const $otherTitle = $(this);
            $otherTitle.attr('data-expanded', 'false');
            $otherTitle.find('.lorebook-expand-icon').removeClass('fa-chevron-up').addClass('fa-chevron-down');
          });
        $content.find('.lorebook-entries-wrapper').not($entriesWrapper).hide();
      };

      closeOthers();
      if (!isLoaded) {
        loadLorebookEntries(lorebookName, $entriesWrapper, isGlobal).then(success => {
          if (success) {
            $title.attr('data-loaded', 'true');
            $title.attr('data-expanded', 'true');
            $entriesWrapper.show();
            setActiveLorebookGroup(tabKey, lorebookName);
            renderDetailPane(tabKey);
          }
        });
      } else {
        $title.attr('data-expanded', 'true');
        $entriesWrapper.show();
        setActiveLorebookGroup(tabKey, lorebookName);
        renderDetailPane(tabKey);
      }
      return;
    }

    if (isExpanded) {
      toggleUI(false);
    } else if (!isLoaded) {
      loadLorebookEntries(lorebookName, $entriesWrapper, isGlobal).then(success => {
        if (success) {
          $title.attr('data-loaded', 'true');
          toggleUI(true);
        } else {
          $entriesWrapper.html('<div class="no-entries-message">加载失败，请查看控制台</div>').show();
        }
      });
    } else {
      toggleUI(true);
    }
  });

  $panel
    .off('mousedown.searchFocus click.searchFocus')
    .on('mousedown.searchFocus', '.lorebook-search-container, .lorebook-search-icon', function (e) {
      e.stopPropagation();
      e.preventDefault();
      const $input = $(this).closest('.lorebook-search-container').find('.lorebook-search-input').first();
      if ($input.length) {
        $input.trigger('focus');
      }
    })
    .on('click.searchFocus', '.lorebook-search-container, .lorebook-search-icon', function (e) {
      e.stopPropagation();
      const $input = $(this).closest('.lorebook-search-container').find('.lorebook-search-input').first();
      if ($input.length) {
        $input.trigger('focus');
      }
    })
    .on('mousedown.searchFocus click.searchFocus', '.lorebook-search-input', function (e) {
      e.stopPropagation();
    });

  // Sort dropdown
  $panel.on('click', '.sort-display-button', function (e) {
    e.stopPropagation();
    $('.sort-dropdown', parentDoc).not($(this).siblings('.sort-dropdown')).hide();
    $(this).siblings('.sort-dropdown').toggle();
  });
  $panel.on('click', '.sort-dropdown li', function (e) {
    e.stopPropagation();
    const $li = $(this);
    const $container = $li.closest('.lorebook-title');
    const lorebookName = $container.find('.lorebook-search-input').data('lorebook-name');
    const isGlobal = $container.find('.lorebook-search-input').data('is-global');
    const sortBy = $li.data('sort-by');
    const sortDir = $li.data('sort-dir');

    lorebookSorts[lorebookName] = { by: sortBy, dir: sortDir };
    saveSortPreference();

    const $sortButton = $container.find('.sort-display-button');
    $sortButton.html(`${$li.text()} <i class="fa-solid fa-caret-down"></i>`);
    $li.siblings().removeClass('active');
    $li.addClass('active').closest('.sort-dropdown').hide();

    const $entriesWrapper = $(`.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"]`, parentDoc);
    if ($entriesWrapper.is(':visible')) {
      loadLorebookEntries(lorebookName, $entriesWrapper, isGlobal);
    }
  });
  $(parentDoc).on('click', () => {
    $panel.find('.sort-dropdown').hide();
    closeFloatingBatchToggleDropdowns(parentDoc);
  });

  // 点击外部关闭预设下拉菜单
  $(parentDoc).on('click', function (e) {
    if (!$(e.target).closest('.preset-dropdown-container').length) {
      $panel.find('.preset-dropdown-menu').hide();
    }
  });

  // Preset dropdown toggle
  $panel.on('click', '.preset-dropdown-button', function (e) {
    e.stopPropagation();
    const $menu = $(this).siblings('.preset-dropdown-menu');
    $('.preset-dropdown-menu', parentDoc).not($menu).hide();
    $menu.toggle();
  });

  // Batch toggle dropdown
  $panel.on('click', '.batch-toggle-button', function (e) {
    e.stopPropagation();
    toggleFloatingBatchToggleDropdown($(this), parentDoc);
  });
  $panel.on('click', '.batch-toggle-dropdown', function (e) {
    e.stopPropagation();
  });
  $(parentDoc.defaultView || window.parent || window)
    .off('resize.lorebookBatchDropdown')
    .on('resize.lorebookBatchDropdown', () => {
      repositionFloatingBatchToggleDropdowns(parentDoc);
    });

  $panel
    .off('keydown.masterTitleEdit')
    .on('keydown.masterTitleEdit', '.master-entry-title-input', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        const $input = $(this);
        const originalTitle = $input.closest(`.${LOREBOOK_ENTRY_CLASS}`).find('.master-entry-title').text();
        $input.val(originalTitle);
        $input.closest('.master-entry-item').removeClass('is-editing-title');
        this.blur();
      }
    })
    .off('focusout.masterTitleEdit')
    .on('focusout.masterTitleEdit', '.master-entry-title-input', function () {
      $(this).closest('.master-entry-item').removeClass('is-editing-title');
    });

  $panel
    .off('keydown.mobileTitleEdit')
    .on('keydown.mobileTitleEdit', '.mobile-entry-title-input', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        const $input = $(this);
        const originalTitle = $input.closest(`.${LOREBOOK_ENTRY_CLASS}`).find('.mobile-entry-title-display').text();
        $input.val(originalTitle);
        $input.closest(`.${LOREBOOK_ENTRY_CLASS}`).removeClass('is-editing-title-mobile');
        this.blur();
      }
    })
    .off('focusout.mobileTitleEdit')
    .on('focusout.mobileTitleEdit', '.mobile-entry-title-input', function () {
      $(this).closest(`.${LOREBOOK_ENTRY_CLASS}`).removeClass('is-editing-title-mobile');
    });

  $panel.off('click.masterEntryDetail').on('click.masterEntryDetail', '.master-entry-item', async function (e) {
    if (!isMasterDetailLayout()) {
      return;
    }

    const $target = $(e.target);
    if (
      $target.closest(
        '.master-entry-controls, .select-checkbox-container, .master-entry-title-edit-button, .master-entry-title-input, [data-action]:not([data-action="open-editor"]), input:not(.master-entry-title-input), label, .mini-toggle-switch, .toggle-slider, .mini-toggle-slider',
      ).length > 0
    ) {
      return;
    }

    const $item = $(this);
    const lorebookName = $item.data('entry-lorebook');
    const numericUid = ensureNumericUID($item.data('entry-uid'));
    const isGlobal = $item.closest('.lorebook-entries-container').attr('data-is-global') === 'true';

    if (!hasCommand('open-editor')) {
      return;
    }

    await dispatchCommand('open-editor', {
      event: e,
      $target,
      $actionTarget: $item,
      $panel,
      parentDoc,
      refreshList,
      lorebookName,
      numericUid,
      isGlobal,
      $item,
    });
  });

  // Editor panel events
  $editorPanel.off('click.lorebookEditorClose').on('click', '.close-button, .cancel-button', function () {
    $editorPanel.find('#entry-edit-form').trigger('reset');
    $editorPanel.find('#entry-edit-form').removeData('deferred-content');
    $editorPanel.find('#entry-content').prop('disabled', false).prop('required', true).show();
    $editorPanel.find('#entry-content-preview').empty().hide();
    $editorPanel.find('.save-button').text('保存').prop('disabled', false);
    $editorPanel.find('.debug-info').hide();
    $editorPanel.hide();
  });
  $editorPanel.off('click.lorebookEditorOpenContent').on('click', '[data-editor-action="open-content-editor"]', async function (e) {
    e.preventDefault();
    e.stopPropagation();

    const $form = $(this).closest('#entry-edit-form');
    const lorebookName = `${$form.find('#entry-lorebook').val() || ''}`;
    const entryUid = ensureNumericUID($form.find('#entry-uid').val());
    if (!lorebookName || !Number.isFinite(entryUid)) {
      return;
    }

    const { showContentEditor } = await import('./ui/contentEditor.js');
    await showContentEditor(lorebookName, entryUid);
  });
  $editorPanel.off('submit.lorebookEditorForm').on('submit', '#entry-edit-form', async function (e) {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(this));
    if (formData.content === undefined) {
      const deferredContent = $(this).data('deferred-content');
      if (typeof deferredContent === 'string') {
        formData.content = deferredContent;
      }
    }
    formData.uid = ensureNumericUID(formData.uid);

    const $saveBtn = $(this).find('.save-button');
    $saveBtn.text('保存中...').prop('disabled', true);

    const { saveEditedEntry } = await import('./ui/editor.js');
    saveEditedEntry(formData)
      .then(result => {
        if (result.success) {
          $editorPanel.hide();
          const listContainerId = result.isGlobal
            ? `#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`
            : `#${LOREBOOK_LIST_CONTAINER_ID}`;
          const $list = $panel.find(listContainerId);
          if (result.isGlobal) {
            const $wrapper = $(`.lorebook-entries-wrapper[data-lorebook-name="${formData.lorebook}"]`);
            loadLorebookEntries(formData.lorebook, $wrapper, true);
          } else {
            import('./ui/list.js').then(({ updateBoundLorebooksList }) => {
              updateBoundLorebooksList($list, true);
            });
          }
        } else {
          alert(`保存失败: ${result.message}`);
        }
      })
      .finally(() => {
        $saveBtn.text('保存').prop('disabled', false);
      });
  });
  $editorPanel.off('change.positionChange').on('change', '#entry-position', function () {
    toggleDepthFieldVisibility($(this).val());
  });
  $editorPanel.off('change.constantToggle').on('change', '#entry-constant', function () {
    const isChecked = $(this).prop('checked');
    const $slider = $(this).next('.constant-toggle-slider');
    $slider.css('background-color', isChecked ? '#2196F3' : '#4CAF50');
    const $container = $(this).closest('.constant-toggle-container');
    $container
      .find('.label-left')
      .css({ color: isChecked ? '#aaa' : '#fff', 'font-weight': isChecked ? 'normal' : 'bold' });
    $container
      .find('.label-right')
      .css({ color: isChecked ? '#fff' : '#aaa', 'font-weight': isChecked ? 'bold' : 'normal' });
  });
  $editorPanel.off('click.labelToggle').on('click', '.label-left, .label-right', function () {
    const $checkbox = $(this).closest('.constant-toggle-container').find('#entry-constant');
    $checkbox.prop('checked', $(this).hasClass('label-right')).trigger('change');
  });

  // Optimizer modal events
  $(parentDoc).on('click', '#lorebook-optimize-modal .close-button', () => {
    $('#lorebook-optimize-modal', parentDoc).hide();
  });
  $(parentDoc).on('click', '#lorebook-reorder-modal .close-button', () => {
    $('#lorebook-reorder-modal', parentDoc).hide();
  });
  $(parentDoc).on('click', '#search-preview-modal .close-button', () => {
    $('#search-preview-modal', parentDoc).hide();
  });

  $(parentDoc).on('click', '#lorebook-optimize-modal [data-action]', async e => {
    const $target = $(e.currentTarget);
    const action = $target.data('action');
    const $optimizeModal = $('#lorebook-optimize-modal', parentDoc);
    const lorebookName = $optimizeModal.data('lorebook-name');
    const isGlobal = $optimizeModal.data('is-global');
    let needsRefresh = false;

    switch (action) {
      case 'select-optimizer-compare-lorebook':
        if (hasCommand(action)) {
          await dispatchCommand(action, {
            event: e,
            $target,
            $actionTarget: $target,
            $panel,
            parentDoc,
            refreshList,
          });
        }
        break;
      case 'run-format-cleanup':
        needsRefresh = await runFormatCleanup(lorebookName, isGlobal);
        break;
      case 'run-keyword-fix':
        needsRefresh = await runKeywordFix(lorebookName, isGlobal);
        break;
      case 'run-reorder-entries-interactive':
        {
          const selectedUids = new Set(getSelectedEntries(lorebookName));
          if (selectedUids.size < 2) {
            alert('请至少选择两个条目进行排序。');
            break;
          }

          const uidsInOrder = (allEntriesData[lorebookName] || [])
            .map(entry => ensureNumericUID(entry.uid))
            .filter(uid => selectedUids.has(uid));

          if (uidsInOrder.length < 2) {
            alert('请至少选择两个条目进行排序。');
            break;
          }
          const $reorderModal = $('#lorebook-reorder-modal', parentDoc);
          $reorderModal.css('display', 'flex');

          $reorderModal
            .find('#confirm-reorder-button')
            .off('click')
            .on('click', async () => {
              const start = parseInt($('#reorder-start-number', $reorderModal).val(), 10);
              const step = parseInt($('#reorder-step-number', $reorderModal).val(), 10);
              let modifiedCount = 0;
              const result = await updateWorldbookEntries(lorebookName, entries => {
                let hasChanges = false;
                const updatedEntries = [...entries];
                let currentOrder = start;
                uidsInOrder.forEach(uid => {
                  const entryIndex = updatedEntries.findIndex(entry => ensureNumericUID(entry.uid) === uid);
                  if (entryIndex !== -1) {
                    const originalEntry = updatedEntries[entryIndex];
                    if (_.get(originalEntry, 'position.order') !== currentOrder) {
                      const entryToUpdate = _.cloneDeep(originalEntry);
                      _.set(entryToUpdate, 'position.order', currentOrder);
                      updatedEntries[entryIndex] = entryToUpdate;
                      hasChanges = true;
                      modifiedCount++;
                    }
                    currentOrder += step;
                  }
                });
                return hasChanges ? updatedEntries : entries;
              });
              if (!result.success) {
                throw result.error || new Error('交互式顺序重排失败');
              }
              if (modifiedCount > 0) {
                alert(`成功为 ${modifiedCount} 个条目重新排序！`);
                refreshList(lorebookName, isGlobal);
              } else {
                alert('没有需要更新顺序的条目。');
              }
              $reorderModal.hide();
            });
        }
        break;
      case 'run-depth-optimization':
        needsRefresh = await runDepthOptimization(lorebookName, isGlobal);
        break;
      case 'run-cliche-cleanup':
        needsRefresh = await runClicheCleanup(lorebookName, isGlobal);
        break;
      case 'preview-global-search-replace':
        await previewGlobalSearchAndReplace(lorebookName, isGlobal);
        break;
      case 'preview-lorebook-compare':
        await previewLorebookCompare(lorebookName, isGlobal);
        break;
      case 'execute-global-search-replace':
        needsRefresh = await executeGlobalSearchAndReplace(lorebookName, isGlobal);
        break;
    }

    if (needsRefresh) {
      await refreshList(lorebookName, isGlobal);
    }
  });
}

export function bindSearchEvents() {
  const parentDoc = window.parent.document;
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
  if (!$panel.length) return;

  // 筛选常驻世界书
  $panel.on('input', `#${GLOBAL_WORLDBOOK_SEARCH_ID}`, function () {
    const searchTerm = $(this).val().toLowerCase();
    const $tags = $(`#${GLOBAL_WORLDBOOK_TAGS_CONTAINER_ID} .lorebook-tag`, parentDoc);
    $tags.each(function () {
      const $tag = $(this);
      const lorebookName = $tag.data('lorebook-name').toLowerCase();
      $tag.toggle(lorebookName.includes(searchTerm));
    });
  });

  // 搜索并添加常驻世界书
  const debounceSearch = _.debounce(async (searchTerm, $input) => {
    const inputId = $input.attr('id');
    const isCharacterSearch = inputId === 'character-worldbook-search-input';
    const isOptimizeCompareSearch = inputId === 'optimize-compare-search-input';
    const $resultsContainer = isCharacterSearch
      ? $('#character-worldbook-search-results', parentDoc)
      : isOptimizeCompareSearch
        ? $('#optimize-compare-search-results', parentDoc)
        : $('.add-worldbook-results', parentDoc);

    if (searchTerm === null) {
      $resultsContainer.empty().hide();
      return;
    }

    const { getWorldbookNamesSafe } = await import('./api.js');
    const { getPinnedBooks } = await import('./ui/list.js');

    const allBooks = await getWorldbookNamesSafe();
    let filteredBooks;

    if (isCharacterSearch) {
      filteredBooks = searchTerm ? allBooks.filter(b => b.toLowerCase().includes(searchTerm)) : allBooks;
    } else if (isOptimizeCompareSearch) {
      const $optimizeModal = $('#lorebook-optimize-modal', parentDoc);
      const baseLorebookName = ($optimizeModal.data('compare-base-lorebook') || '').toString().trim();
      filteredBooks = allBooks.filter(
        b => b !== baseLorebookName && (searchTerm === '' || b.toLowerCase().includes(searchTerm)),
      );
    } else {
      const pinnedBooks = getPinnedBooks();
      filteredBooks = allBooks.filter(
        b => !pinnedBooks.includes(b) && (searchTerm === '' || b.toLowerCase().includes(searchTerm)),
      );
    }

    if (filteredBooks.length === 0) {
      $resultsContainer.html('<div class="add-worldbook-no-results">没有找到匹配的世界书</div>').show();
      return;
    }

    const action = isCharacterSearch
      ? 'replace-character-lorebook'
      : isOptimizeCompareSearch
        ? 'select-optimizer-compare-lorebook'
        : 'pin-global-lorebook';
    const resultsHtml = filteredBooks
      .map(
        name => `
          <div class="add-worldbook-result-item" data-action="${action}" data-lorebook-name="${name}">
              ${name}
          </div>
      `,
      )
      .join('');
    $resultsContainer.html(resultsHtml).show();
  }, 300);

  $panel.on('focus', '#add-worldbook-search-input, #character-worldbook-search-input, #optimize-compare-search-input', function () {
    const $input = $(this);
    const searchTerm = $input.val().toLowerCase();
    debounceSearch(searchTerm, $input);
  });

  $panel.on('input', '#add-worldbook-search-input, #character-worldbook-search-input, #optimize-compare-search-input', function () {
    const $input = $(this);
    if ($input.attr('id') === 'optimize-compare-search-input') {
      const $optimizeModal = $('#lorebook-optimize-modal', parentDoc);
      $optimizeModal.data('compare-target-lorebook', '');
      $input.removeAttr('data-selected-lorebook-name');
      $('#preview-lorebook-compare-button', $optimizeModal).prop('disabled', true);
    }
    const searchTerm = $input.val().toLowerCase();
    debounceSearch(searchTerm, $input);
  });

  $panel.on('blur', '#add-worldbook-search-input, #character-worldbook-search-input, #optimize-compare-search-input', function () {
    const $input = $(this);
    setTimeout(() => {
      debounceSearch(null, $input);
    }, 200);
  });

  $(parentDoc)
    .off('focus.optimizeCompareSearch input.optimizeCompareSearch blur.optimizeCompareSearch')
    .on('focus.optimizeCompareSearch', '#optimize-compare-search-input', function () {
      const $input = $(this);
      const searchTerm = $input.val().toLowerCase();
      debounceSearch(searchTerm, $input);
    })
    .on('input.optimizeCompareSearch', '#optimize-compare-search-input', function () {
      const $input = $(this);
      const $optimizeModal = $('#lorebook-optimize-modal', parentDoc);
      $optimizeModal.data('compare-target-lorebook', '');
      $input.removeAttr('data-selected-lorebook-name');
      $('#preview-lorebook-compare-button', $optimizeModal).prop('disabled', true);
      const searchTerm = $input.val().toLowerCase();
      debounceSearch(searchTerm, $input);
    })
    .on('blur.optimizeCompareSearch', '#optimize-compare-search-input', function () {
      const $input = $(this);
      setTimeout(() => {
        debounceSearch(null, $input);
      }, 200);
    });

  // 点击外部隐藏结果
  $(parentDoc).on('click', function (e) {
    if (!$(e.target).closest('.global-lorebook-adder').length) {
      $('.add-worldbook-results', parentDoc).hide();
    }
  });

  const syncLorebookSearchWidth = $input => {
    if (
      !$input.length ||
      $input.closest('.lorebook-title.is-master-layout').length === 0 ||
      $input.attr('data-auto-width') !== 'true'
    ) {
      return;
    }

    const valueLength = `${$input.val() || ''}`.length;
    const nextWidth = Math.max(5, Math.min(18, valueLength + 1));
    $input.css('width', `${nextWidth}ch`);
  };

  const debouncedFilter = _.debounce((lorebookName, isGlobal) => {
    const matchedEntries = getSelectableEntries(lorebookName);
    if (isMasterDetailLayout()) {
      const $wrapper = $(`.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"]`, parentDoc).first();
      if ($wrapper.length) {
        loadLorebookEntries(lorebookName, $wrapper, isGlobal).then(() => {
          renderDetailPane(getTabKey(isGlobal));
        });
      }
      return;
    }

    const clusterize = virtualScrollers[lorebookName];
    if (!clusterize) {
      const $wrapper = $(`.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"]`, parentDoc).first();
      if ($wrapper.length) {
        loadLorebookEntries(lorebookName, $wrapper, isGlobal);
      }
      return;
    }

    const newRows = matchedEntries.map(entry => `<li>${createEntryHtml(entry, lorebookName, isGlobal)}</li>`);

    clusterize.update(newRows);

    setTimeout(() => updateHeaderCheckboxState(lorebookName, isGlobal), 50);
  }, 300);

  $panel
    .off('input.search keydown.search')
    .on('input.search', '.lorebook-search-input', function () {
      const $input = $(this);
      const searchText = $input.val();
      syncLorebookSearchWidth($input);
      const lorebookName = $input.attr('data-lorebook-name');
      const isGlobal = $input.data('is-global');
      setEntrySearchQuery(lorebookName, searchText);
      updateHeaderCheckboxState(lorebookName, isGlobal);
      debouncedFilter(lorebookName, isGlobal);
    })
    .on('focus.search blur.search', '.lorebook-search-input', function () {
      syncLorebookSearchWidth($(this));
    })
    .on('keydown.search', '.lorebook-search-input', function (e) {
      if (e.key === 'Escape') {
        $(this).val('').trigger('input.search');
      }
    });

  $('.lorebook-title.is-master-layout .lorebook-search-input', $panel).each(function () {
    syncLorebookSearchWidth($(this));
  });

  // 移动端关键字输入优化
  if (isMobile()) {
    $panel.on('focus', '.keywords-input, .secondary-keywords-input', function () {
      const $input = $(this);
      const $keywordsArea = $input.closest('.keywords-edit-area');
      const $keywordGroup = $input.closest('.keyword-group');

      $keywordsArea.addClass('keyword-focused');
      $keywordGroup.addClass('focused');
    });

    $panel.on('blur', '.keywords-input, .secondary-keywords-input', function () {
      const $input = $(this);
      const $keywordsArea = $input.closest('.keywords-edit-area');

      setTimeout(() => {
        const hasOtherFocused = $keywordsArea.find('.keywords-input:focus, .secondary-keywords-input:focus').length > 0;
        if (!hasOtherFocused) {
          $keywordsArea.removeClass('keyword-focused');
          $keywordsArea.find('.keyword-group').removeClass('focused');
        }
      }, 100);
    });
  }
}

/**
 * 切换深度字段可见性
 */
function toggleDepthFieldVisibility(position) {
  const parentDoc = window.parent.document;
  const $depthGroup = $('#entry-depth', parentDoc).closest('.form-group');
  if (isDepthPositionValue(position)) {
    $depthGroup.show();
  } else {
    $depthGroup.hide();
  }
}
