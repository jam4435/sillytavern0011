import { LOREBOOK_PANEL_ID } from '../config.js';
import {
  getFullscreenModeSetting,
  getHighlightActiveEntriesSetting,
  getPcLayoutModeSetting,
  getShowSearchBarSetting,
  setFullscreenModeSetting,
  setHighlightActiveEntriesSetting,
  setPcLayoutModeSetting,
  setShowSearchBarSetting,
} from '../settings.js';
import { rgbaToHex } from '../utils.js';
import { syncPanelLayoutMode } from './detail.js';
import { refreshAiWorkspace } from './aiWorkspace.js';
import { toggleLorebookPanel } from './panel.js';

const LOREBOOK_THEME_KEY = 'enhanced-lorebook-theme';

function applyTheme(theme) {
  try {
    const parentDoc = window.parent.document;
    const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
    if ($panel.length) {
      $panel.css({
        '--panel-bg-color': theme.bgColor,
        '--panel-text-color': theme.textColor,
        '--panel-accent-color': theme.accentColor,
        '--panel-entry-bg-color': theme.entryBgColor,
        '--search-input-bg-color': theme.searchInputBgColor,
        '--yaml-input-bg-color': theme.yamlInputBgColor,
        '--panel-border-color': '#555',
      });
    }
    // 应用主题到主题设置模态框本身
    const $modal = $('#theme-settings-modal', parentDoc);
    if ($modal.length) {
      $modal.css({
        '--modal-bg-color': theme.bgColor,
        '--modal-text-color': theme.textColor,
        '--modal-accent-color': theme.accentColor,
        '--panel-border-color': '#555',
      });
    }
    // 应用主题到YAML导入模态框
    const $importModal = $('#lorebook-import-modal', parentDoc);
    if ($importModal.length) {
      $importModal.css({
        '--yaml-input-bg-color': theme.yamlInputBgColor,
        '--panel-text-color': theme.textColor,
        '--panel-accent-color': theme.accentColor,
        '--panel-bg-color': theme.bgColor,
        '--panel-entry-bg-color': theme.entryBgColor,
        '--panel-border-color': '#555',
      });
    }
  } catch (error) {
    console.error('角色世界书: applyTheme 函数执行出错', error);
  }
}

function saveTheme(theme) {
  localStorage.setItem(LOREBOOK_THEME_KEY, JSON.stringify(theme));
}

export function loadTheme() {
  const savedTheme = localStorage.getItem(LOREBOOK_THEME_KEY);
  if (savedTheme) {
    return JSON.parse(savedTheme);
  }
  return {
    bgColor: 'rgba(40, 40, 40, 0.95)',
    textColor: '#eeeeee',
    accentColor: '#9a7ace',
    entryBgColor: '#333333',
    searchInputBgColor: '#333333',
    yamlInputBgColor: '#333333',
    showTopbarButton: false,
  };
}


// --- 最终解决方案：“事件劫持”法 ---
// --- 最终解决方案：在捕获阶段进行精确事件劫持 ---

// 需要一个持久的引用来保存我们的处理函数，以便之后可以移除它
let hijackHandler = null;

function updateButtonBehavior(settings) {
  const parentDoc = window.parent.document;
  // 使用原生 querySelector 获取 DOM 元素，而不是 jQuery 对象
  const toggleButton = parentDoc.querySelector('#WI-SP-button .drawer-toggle');

  if (!toggleButton) {
    return; // 找不到目标则不执行任何操作
  }

  // 总是先尝试移除旧的监听器，防止重复绑定
  if (hijackHandler) {
    toggleButton.removeEventListener('click', hijackHandler, true); // 必须同样在捕获阶段移除
    hijackHandler = null;
  }

  if (settings.showTopbarButton) {
    // 定义我们的劫持处理函数
    hijackHandler = function (event) {
      // 这是最关键的一步：立即阻止事件链中的任何其他监听器被调用
      event.stopImmediatePropagation();
      event.preventDefault();
      event.stopPropagation();

      // 执行我们自己的功能
      toggleLorebookPanel();
    };

    // 将我们的监听器添加到“捕获阶段”(第三个参数为 true)
    // 这确保了我们的代码会在原生代码之前或在同一阶段运行
    toggleButton.addEventListener('click', hijackHandler, true);
  }
}

export function initTheme() {
  const currentTheme = loadTheme();
  applyTheme(currentTheme);
  updateButtonBehavior(currentTheme); // 初始化时根据设置更新按钮行为

  const parentDoc = window.parent.document;
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
  const $modal = $('#theme-settings-modal', parentDoc);
  
  // 初始化全屏模式
  if (getFullscreenModeSetting()) {
    $panel.addClass('fullscreen-mode');
  }
  syncPanelLayoutMode();

  if ($modal.find('#topbar-button-toggle-group').length === 0) {
    const toggleHtml = `
           <div id="topbar-button-toggle-group" class="form-group">
               <label for="topbar-button-toggle">覆盖世界书图标</label>
               <label class="switch">
                   <input type="checkbox" id="topbar-button-toggle">
                   <span class="slider round"></span>
               </label>
           </div>
           <div id="highlight-active-toggle-group" class="form-group">
               <label for="highlight-active-toggle">高亮显示激活的条目</label>
               <label class="switch">
                   <input type="checkbox" id="highlight-active-toggle">
                   <span class="slider round"></span>
               </label>
           </div>
           <div id="show-search-bar-toggle-group" class="form-group">
               <label for="show-search-bar-toggle">显示搜索栏</label>
               <label class="switch">
                   <input type="checkbox" id="show-search-bar-toggle">
                   <span class="slider round"></span>
               </label>
           </div>
           <div id="fullscreen-mode-toggle-group" class="form-group">
               <label for="fullscreen-mode-toggle">全屏模式</label>
               <label class="switch">
                   <input type="checkbox" id="fullscreen-mode-toggle">
                   <span class="slider round"></span>
               </label>
           </div>
            <div id="pc-layout-mode-group" class="form-group">
                <label for="pc-layout-mode-select">PC 布局</label>
                <select id="pc-layout-mode-select" class="form-control">
                    <option value="master-detail">Master-Detail</option>
                    <option value="drawer">Drawer</option>
                </select>
            </div>
        `;
    $modal.find('.modal-body').append(toggleHtml);
  }

  $panel.on('click', '.theme-settings-button', function () {
    const modalElement = $modal[0];
    if (!modalElement) {
      console.error('角色世界书: 无法找到主题设置模态框。');
      return;
    }

    const currentTheme = loadTheme();
    $modal.find('#panel-bg-color-picker').val(rgbaToHex(currentTheme.bgColor));
    $modal.find('#panel-text-color-picker').val(rgbaToHex(currentTheme.textColor));
    $modal.find('#panel-accent-color-picker').val(rgbaToHex(currentTheme.accentColor));
    $modal.find('#panel-entry-bg-color-picker').val(rgbaToHex(currentTheme.entryBgColor));
    $modal.find('#search-input-bg-color-picker').val(rgbaToHex(currentTheme.searchInputBgColor));
    $modal.find('#yaml-input-bg-color-picker').val(rgbaToHex(currentTheme.yamlInputBgColor));
    $modal.find('#topbar-button-toggle').prop('checked', currentTheme.showTopbarButton);
    $modal.find('#highlight-active-toggle').prop('checked', getHighlightActiveEntriesSetting());
    $modal.find('#show-search-bar-toggle').prop('checked', getShowSearchBarSetting());
    $modal.find('#fullscreen-mode-toggle').prop('checked', getFullscreenModeSetting());
    $modal.find('#pc-layout-mode-select').val(getPcLayoutModeSetting());

    if (typeof modalElement.showModal === 'function') {
      modalElement.showModal();
    } else {
      $modal.show();
    }
  });

  const handleSettingsChange = () => {
    const currentSettings = loadTheme();
    const newSettings = {
      ...currentSettings,
      bgColor: $('#panel-bg-color-picker', parentDoc).val(),
      textColor: $('#panel-text-color-picker', parentDoc).val(),
      accentColor: $('#panel-accent-color-picker', parentDoc).val(),
      entryBgColor: $('#panel-entry-bg-color-picker', parentDoc).val(),
      searchInputBgColor: $('#search-input-bg-color-picker', parentDoc).val(),
      yamlInputBgColor: $('#yaml-input-bg-color-picker', parentDoc).val(),
      showTopbarButton: $('#topbar-button-toggle', parentDoc).is(':checked'),
    };
    applyTheme(newSettings);
    saveTheme(newSettings);
    updateButtonBehavior(newSettings);
  };

  $modal.on('input', 'input[type="color"]', handleSettingsChange);
  $modal.on('change', '#topbar-button-toggle', handleSettingsChange);
  
  // 高亮激活条目开关的事件处理
  $modal.on('change', '#highlight-active-toggle', function() {
    const isEnabled = $(this).is(':checked');
    setHighlightActiveEntriesSetting(isEnabled);
    
    // 通知主模块更新事件监听器
    if (window.toggleActivationListeners) {
      window.toggleActivationListeners();
    }
  });
  
  // 搜索栏显示开关的事件处理
  $modal.on('change', '#show-search-bar-toggle', function() {
    const isEnabled = $(this).is(':checked');
    setShowSearchBarSetting(isEnabled);
    
    // 立即更新世界书搜索栏的显示状态
    const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
    const $worldbookSearchBar = $panel.find('.global-lorebook-adder');
    if (isEnabled) {
      $worldbookSearchBar.show();
    } else {
      $worldbookSearchBar.hide();
    }
  });
  
  // 全屏模式开关的事件处理
  $modal.on('change', '#fullscreen-mode-toggle', function() {
    const isEnabled = $(this).is(':checked');
    setFullscreenModeSetting(isEnabled);
    
    // 立即切换全屏模式
    const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
    if (isEnabled) {
      $panel.addClass('fullscreen-mode');
    } else {
      $panel.removeClass('fullscreen-mode');
    }
  });

  $modal.on('change', '#pc-layout-mode-select', function () {
    setPcLayoutModeSetting($(this).val());
    syncPanelLayoutMode();
    void refreshAiWorkspace();
  });

  $modal.on('click', '#reset-theme-button', function () {
    const defaultTheme = {
      bgColor: 'rgba(40, 40, 40, 0.95)',
      textColor: '#eeeeee',
      accentColor: '#9a7ace',
      entryBgColor: '#333333',
      searchInputBgColor: '#333333',
      yamlInputBgColor: '#333333',
      showTopbarButton: false,
    };
    applyTheme(defaultTheme);
    saveTheme(defaultTheme);
    updateButtonBehavior(defaultTheme);

    $modal.find('#panel-bg-color-picker').val(rgbaToHex(defaultTheme.bgColor));
    $modal.find('#panel-text-color-picker').val(rgbaToHex(defaultTheme.textColor));
    $modal.find('#panel-accent-color-picker').val(rgbaToHex(defaultTheme.accentColor));
    $modal.find('#panel-entry-bg-color-picker').val(rgbaToHex(defaultTheme.entryBgColor));
    $modal.find('#search-input-bg-color-picker').val(rgbaToHex(defaultTheme.searchInputBgColor));
    $modal.find('#yaml-input-bg-color-picker').val(rgbaToHex(defaultTheme.yamlInputBgColor));
    $modal.find('#topbar-button-toggle').prop('checked', defaultTheme.showTopbarButton);
    
    // 重置高亮激活条目设置为默认值（关闭）
    setHighlightActiveEntriesSetting(false);
    $modal.find('#highlight-active-toggle').prop('checked', false);
    if (window.toggleActivationListeners) {
      window.toggleActivationListeners();
    }
    
    // 重置搜索栏显示设置为默认值（显示）
    setShowSearchBarSetting(true);
    $modal.find('#show-search-bar-toggle').prop('checked', true);
    const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
    $panel.find('.global-lorebook-adder').show();
    
    // 重置全屏模式设置为默认值（关闭）
    setFullscreenModeSetting(false);
    $modal.find('#fullscreen-mode-toggle').prop('checked', false);
    $panel.removeClass('fullscreen-mode');
    setPcLayoutModeSetting('master-detail');
    $modal.find('#pc-layout-mode-select').val('master-detail');
    syncPanelLayoutMode();
    void refreshAiWorkspace();
  });
}
