// Import necessary modules and constants
import Clusterize from 'clusterize.js';
import 'clusterize.js/clusterize.css';
import {
  GLOBAL_LOREBOOK_LIST_CONTAINER_ID,
  LOREBOOK_BUTTON_ID,
  LOREBOOK_BUTTON_TOOLTIP,
  LOREBOOK_LIST_CONTAINER_ID,
  LOREBOOK_PANEL_ID,
} from './modules/config.js';
import { bindEventListeners, bindSearchEvents } from './modules/events.js';
import { clearActiveEntries, updateActiveEntries } from './modules/features/activationTracker.js';
import { initBulkImport } from './modules/features/bulkImport.js';
import { initOptimizer } from './modules/features/optimizer.js';
import { loadSortPreference } from './modules/features/sorting.js';
import { getHighlightActiveEntriesSetting } from './modules/settings.js';
import { initContentEditor } from './modules/ui/contentEditor.js';
import { initDetailView } from './modules/ui/detail.js';
import { createEditorPanel } from './modules/ui/editor.js';
import { loadLorebookEntries, updateBoundLorebooksList, updateGlobalLorebooksList } from './modules/ui/list.js';
import { initPanel } from './modules/ui/panel.js';
import { initTheme } from './modules/ui/theme.js';

// Global state variable from original script
let hasInitializedLorebooks = false;

// 标记是否已经注册过监听器（避免重复注册）
let listenersRegistered = false;

// Main initialization function
function initialize() {
  const initStartTime = performance.now();
  const parentDoc = window.parent.document;

  // 1. Load preferences
  loadSortPreference();

  // 2. Make Clusterize globally available for other modules
  window.Clusterize = Clusterize;

  // 3. Initialize UI components
  initPanel(); // Creates main panel and button
  initTheme(); // Applies saved theme and creates the theme modal
  createEditorPanel(); // Pre-initializes editor panel
  initOptimizer(); // Pre-initializes optimizer modal
  initBulkImport(); // Pre-initializes bulk import modal
  initContentEditor(); // Pre-initializes content editor modal
  initDetailView(); // Initializes desktop detail layout and styles

  // 4. Bind all event listeners
  bindEventListeners();
  bindSearchEvents();

  // 5. Set up Tavern integration
  if (window.eventOn && window.tavern_events) {
    // Handle chat/character changes
    window.eventOn(window.tavern_events.CHAT_CHANGED, function () {
      console.log('角色世界书: 检测到聊天/角色变更，检查是否需要刷新...');
      const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
      if ($panel.is(':visible')) {
        console.log('角色世界书: 面板已打开，刷新世界书数据...');
        const $list = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
        updateBoundLorebooksList($list, true);
        setTimeout(bindSearchEvents, 500);
      } else {
        console.log('角色世界书: 面板未打开，不刷新数据');
        hasInitializedLorebooks = false;
      }
    });

    // Handle app ready state
    window.eventOn(window.tavern_events.APP_READY, function () {
      console.log('角色世界书: SillyTavern应用已准备就绪，API已解锁！');
      window.isApiReady = true; // Set global flag
      const $button = $(`#${LOREBOOK_BUTTON_ID}`, parentDoc);
      if ($button.length) {
        $button.css('pointer-events', 'auto').css('opacity', '1');
        $button.attr('title', LOREBOOK_BUTTON_TOOLTIP);
      }

      // 在应用准备就绪后初始化激活追踪功能
      toggleActivationListeners();
    });
  } else {
    console.log('角色世界书: 事件系统不可用，无法监听角色切换事件');
  }

  const initEndTime = performance.now();
  console.log(`角色世界书: 初始化完成。总耗时: ${(initEndTime - initStartTime).toFixed(2)} ms`);

  // 如果事件系统已经可用，立即初始化激活追踪功能
  // 否则等待 APP_READY 事件
  if (window.eventOn && window.tavern_events) {
    toggleActivationListeners();
  }
}

// 切换激活条目追踪的事件监听器
function toggleActivationListeners() {
  const isEnabled = getHighlightActiveEntriesSetting();

  if (!window.eventOn || !window.tavern_events) {
    console.log('角色世界书: 激活追踪 - 事件系统尚未准备就绪，将在APP_READY后初始化');
    return;
  }

  // 注意：eventOn 会自动处理重复监听，不需要手动移除
  // 根据文档："如果 listener 已经在监听 event_type, 则调用本函数不会有任何效果"

  if (isEnabled && !listenersRegistered) {
    console.log('角色世界书: ✅ 启用激活条目追踪功能');

    // 监听世界书激活事件
    window.eventOn(window.tavern_events.WORLD_INFO_ACTIVATED, function (entries) {
      console.log('角色世界书: 🎯 检测到世界书激活事件！');
      updateActiveEntries(entries);

      // 刷新UI显示
      const parentDoc = window.parent.document;
      const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
      if ($panel.is(':visible')) {
        // 刷新角色世界书列表
        const $characterList = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
        if ($characterList.length) {
          updateBoundLorebooksList($characterList, false);
          const $globalList = $panel.find(`#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`);
          if ($globalList.length) {
            updateGlobalLorebooksList($globalList, false);
          }
        }

        // 刷新已展开的全局世界书条目
        const $expandedGlobalLorebooks = $panel.find('.lorebook-title-clickable[data-expanded="true"]');
        if ($expandedGlobalLorebooks.length > 0) {
          $expandedGlobalLorebooks.each(function () {
            const lorebookName = $(this).attr('data-lorebook-name');
            const $entriesWrapper = $(
              `.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"][data-is-global="true"]`,
              parentDoc,
            );
            if ($entriesWrapper.length && $entriesWrapper.is(':visible')) {
              loadLorebookEntries(lorebookName, $entriesWrapper, true);
            }
          });
        }
      }
    });

    // 生成完成后清除高亮
    window.eventOn(window.tavern_events.GENERATION_FINISHED, function () {
      console.log('角色世界书: 检测到生成完成事件，清除激活状态...');
      clearActiveEntries();

      // 刷新UI显示
      const parentDoc = window.parent.document;
      const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
      if ($panel.is(':visible')) {
        // 刷新角色世界书列表
        const $characterList = $panel.find(`#${LOREBOOK_LIST_CONTAINER_ID}`);
        if ($characterList.length) {
          updateBoundLorebooksList($characterList, false);
          const $globalList = $panel.find(`#${GLOBAL_LOREBOOK_LIST_CONTAINER_ID}`);
          if ($globalList.length) {
            updateGlobalLorebooksList($globalList, false);
          }
        }

        // 刷新已展开的全局世界书条目
        const $expandedGlobalLorebooks = $panel.find('.lorebook-title-clickable[data-expanded="true"]');
        if ($expandedGlobalLorebooks.length > 0) {
          $expandedGlobalLorebooks.each(function () {
            const lorebookName = $(this).attr('data-lorebook-name');
            const $entriesWrapper = $(
              `.lorebook-entries-wrapper[data-lorebook-name="${lorebookName}"][data-is-global="true"]`,
              parentDoc,
            );
            if ($entriesWrapper.length && $entriesWrapper.is(':visible')) {
              loadLorebookEntries(lorebookName, $entriesWrapper, true);
            }
          });
        }
      }
    });

    listenersRegistered = true;
    console.log('角色世界书: ✅ 所有事件监听器注册完成！');
  } else if (isEnabled && listenersRegistered) {
    console.log('角色世界书: ℹ️ 监听器已经注册过了，跳过重复注册');
  } else {
    console.log('角色世界书: ⚠️ 禁用激活条目追踪功能（开关未启用）');
  }
}

// 将函数暴露到全局，供theme.js调用
window.toggleActivationListeners = toggleActivationListeners;

// Run initialization when document is ready
$(() => {
  initialize();
});
