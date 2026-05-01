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
import { getLocalStorageItem, isMobile, rgbaToHex, setLocalStorageItem } from '../utils.js';
import { refreshAiWorkspace } from './aiWorkspace.js';
import { syncPanelLayoutMode } from './detail.js';
import { switchTab, toggleLorebookPanel } from './panel.js';

const LOREBOOK_THEME_KEY = 'enhanced-lorebook-theme';
const THEME_VERSION = 3;
const DEFAULT_LAYOUT_MODE = 'master-detail';
const VALID_LAYOUT_MODES = new Set(['drawer', 'master-detail']);
const MAX_BACKGROUND_IMAGE_DATA_URL_LENGTH = 2 * 1024 * 1024;
const BACKGROUND_IMAGE_SURFACE_REVEAL_RATIO = 0.45;

function normalizeLayoutMode(mode) {
  return VALID_LAYOUT_MODES.has(mode) ? mode : DEFAULT_LAYOUT_MODE;
}

function getEffectiveThemeLayoutMode(mode = getPcLayoutModeSetting()) {
  return isMobile() ? 'drawer' : normalizeLayoutMode(mode);
}

function getDefaultLayoutTheme(mode = DEFAULT_LAYOUT_MODE) {
  const baseTheme = {
    bgColor: 'rgba(40, 40, 40, 0.95)',
    textColor: '#eeeeee',
    accentColor: '#9a7ace',
    entryBgColor: '#333333',
    inputBgColor: '#333333',
    backgroundImageUrl: '',
    backgroundImageOpacity: 0.35,
    panelOpacity: 1,
    iconBgColor: '#666666',
  };

  if (normalizeLayoutMode(mode) === 'master-detail') {
    return {
      ...baseTheme,
      bgColor: 'rgba(20, 20, 20, 0.95)',
      entryBgColor: '#141414',
      inputBgColor: '#282828',
    };
  }

  return baseTheme;
}

function getDefaultDrawerTheme() {
  return getDefaultLayoutTheme('drawer');
}

function getDefaultMasterDetailTheme() {
  return getDefaultLayoutTheme('master-detail');
}

function getDefaultSharedTheme() {
  return {
    showTopbarButton: false,
    truncateLongNames: true,
    invertButtonMode: 'invert',
    unifiedIconButtons: false,
  };
}

function getDefaultThemeStore() {
  return {
    version: THEME_VERSION,
    shared: getDefaultSharedTheme(),
    layouts: {
      drawer: getDefaultDrawerTheme(),
      'master-detail': getDefaultMasterDetailTheme(),
    },
  };
}

function pickColor(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function pickBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function pickString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function pickOpacity(value, fallback) {
  const numericValue = Number.parseFloat(value);
  return Number.isFinite(numericValue) ? Math.min(1, Math.max(0, numericValue)) : fallback;
}

function normalizeSharedTheme(shared = {}, fallback = getDefaultSharedTheme()) {
  return {
    showTopbarButton: pickBoolean(shared.showTopbarButton, fallback.showTopbarButton),
    truncateLongNames: pickBoolean(shared.truncateLongNames, fallback.truncateLongNames),
    invertButtonMode: typeof shared.invertButtonMode === 'string' ? shared.invertButtonMode : fallback.invertButtonMode,
    unifiedIconButtons: pickBoolean(shared.unifiedIconButtons, fallback.unifiedIconButtons),
  };
}

function normalizeLayoutTheme(theme = {}, fallback = getDefaultMasterDetailTheme()) {
  const inputBgColor = theme.inputBgColor || theme.searchInputBgColor || theme.yamlInputBgColor;
  return {
    bgColor: pickColor(theme.bgColor, fallback.bgColor),
    textColor: pickColor(theme.textColor, fallback.textColor),
    accentColor: pickColor(theme.accentColor, fallback.accentColor),
    entryBgColor: pickColor(theme.entryBgColor, fallback.entryBgColor),
    inputBgColor: pickColor(inputBgColor, fallback.inputBgColor),
    backgroundImageUrl: pickString(theme.backgroundImageUrl, fallback.backgroundImageUrl),
    backgroundImageOpacity: pickOpacity(theme.backgroundImageOpacity, fallback.backgroundImageOpacity),
    panelOpacity: pickOpacity(theme.panelOpacity, fallback.panelOpacity),
    iconBgColor: pickColor(theme.iconBgColor, fallback.iconBgColor),
  };
}

function buildThemeForLayout(store, layoutMode = getPcLayoutModeSetting()) {
  const mode = normalizeLayoutMode(layoutMode);
  const layoutTheme = normalizeLayoutTheme(
    store?.layouts?.[mode],
    mode === 'drawer' ? getDefaultDrawerTheme() : getDefaultMasterDetailTheme(),
  );
  const sharedTheme = normalizeSharedTheme(store?.shared, getDefaultSharedTheme());
  return {
    ...layoutTheme,
    ...sharedTheme,
    // Compatibility aliases for existing modules/styles that still reference these names.
    searchInputBgColor: layoutTheme.inputBgColor,
    yamlInputBgColor: layoutTheme.inputBgColor,
  };
}

function normalizeThemeStore(rawTheme) {
  const defaultStore = getDefaultThemeStore();
  if (!rawTheme || typeof rawTheme !== 'object') {
    return { store: defaultStore, shouldPersist: false };
  }

  if (rawTheme.layouts && typeof rawTheme.layouts === 'object') {
    const store = {
      version: THEME_VERSION,
      shared: normalizeSharedTheme(rawTheme.shared, defaultStore.shared),
      layouts: {
        drawer: normalizeLayoutTheme(rawTheme.layouts.drawer, defaultStore.layouts.drawer),
        'master-detail': normalizeLayoutTheme(rawTheme.layouts['master-detail'], defaultStore.layouts['master-detail']),
      },
    };
    return { store, shouldPersist: rawTheme.version !== THEME_VERSION };
  }

  // Legacy v1 stored one flat theme. Copy it into both PC layout buckets.
  const legacyLayout = normalizeLayoutTheme(rawTheme, defaultStore.layouts.drawer);
  const legacyShared = normalizeSharedTheme(rawTheme, defaultStore.shared);
  return {
    store: {
      version: THEME_VERSION,
      shared: legacyShared,
      layouts: {
        drawer: { ...legacyLayout },
        'master-detail': { ...legacyLayout },
      },
    },
    shouldPersist: true,
  };
}

function saveThemeStore(store) {
  setLocalStorageItem(LOREBOOK_THEME_KEY, JSON.stringify(store), { throwOnError: true });
}

function loadThemeStore() {
  const savedTheme = getLocalStorageItem(LOREBOOK_THEME_KEY);
  if (!savedTheme) {
    return getDefaultThemeStore();
  }

  try {
    const { store, shouldPersist } = normalizeThemeStore(JSON.parse(savedTheme));
    if (shouldPersist) {
      try {
        saveThemeStore(store);
      } catch (persistError) {
        console.warn('角色世界书: 主题设置已在内存中迁移，但写入 localStorage 失败。', persistError);
      }
    }
    return store;
  } catch (error) {
    console.warn('角色世界书: 解析主题设置失败，已回退到默认值。', error);
    return getDefaultThemeStore();
  }
}

function colorMix(baseColor, basePercent, mixedColor) {
  return `color-mix(in srgb, ${baseColor} ${basePercent}%, ${mixedColor})`;
}

function colorWithOpacity(color, opacity) {
  const percent = Math.round(pickOpacity(opacity, 1) * 100);
  return percent >= 100 ? color : `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

function getInteriorSurfaceOpacity(layoutTheme) {
  const panelOpacity = pickOpacity(layoutTheme.panelOpacity, 1);
  if (!pickString(layoutTheme.backgroundImageUrl, '')) {
    return panelOpacity;
  }

  const imageOpacity = pickOpacity(layoutTheme.backgroundImageOpacity, 0);
  return Math.min(1, Math.max(0, panelOpacity * (1 - imageOpacity * BACKGROUND_IMAGE_SURFACE_REVEAL_RATIO)));
}

function toCssBackgroundImage(imageUrl) {
  const normalizedUrl = pickString(imageUrl, '');
  return normalizedUrl ? `url(${JSON.stringify(normalizedUrl)})` : 'none';
}

function applyTheme(theme) {
  try {
    const layoutTheme = normalizeLayoutTheme(
      theme,
      getEffectiveThemeLayoutMode() === 'drawer' ? getDefaultDrawerTheme() : getDefaultMasterDetailTheme(),
    );
    const sharedTheme = normalizeSharedTheme(theme, getDefaultSharedTheme());
    const parentDoc = window.parent.document;
    const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
    const truncateLongNames = sharedTheme.truncateLongNames !== false;
    const panelBgColor = colorWithOpacity(layoutTheme.bgColor, layoutTheme.panelOpacity);
    const interiorSurfaceOpacity = getInteriorSurfaceOpacity(layoutTheme);
    const entryBgColor = colorWithOpacity(layoutTheme.entryBgColor, interiorSurfaceOpacity);
    const inputBgColor = colorWithOpacity(layoutTheme.inputBgColor, interiorSurfaceOpacity);
    const inputFocusBgColor = colorWithOpacity(
      colorMix(layoutTheme.inputBgColor, 82, layoutTheme.accentColor),
      interiorSurfaceOpacity,
    );
    const entryHoverBgColor = colorWithOpacity(
      colorMix(layoutTheme.entryBgColor, 88, layoutTheme.accentColor),
      interiorSurfaceOpacity,
    );
    const selectedBgColor = colorWithOpacity(
      colorMix(layoutTheme.entryBgColor, 84, layoutTheme.accentColor),
      interiorSurfaceOpacity,
    );
    const dropdownActiveBgColor = colorWithOpacity(
      colorMix(layoutTheme.inputBgColor, 70, layoutTheme.accentColor),
      interiorSurfaceOpacity,
    );
    const iconHoverBgColor = colorMix(layoutTheme.iconBgColor, 82, '#ffffff');

    if ($panel.length) {
      $panel.attr('data-unified-icon-buttons', sharedTheme.unifiedIconButtons ? 'true' : 'false');
      $panel.css({
        '--panel-bg-color': panelBgColor,
        '--panel-text-color': layoutTheme.textColor,
        '--panel-accent-color': layoutTheme.accentColor,
        '--panel-entry-bg-color': entryBgColor,
        '--panel-input-bg-color': inputBgColor,
        '--panel-field-bg-color': inputBgColor,
        '--panel-input-focus-bg-color': inputFocusBgColor,
        '--panel-field-focus-bg-color': inputFocusBgColor,
        '--panel-dropdown-bg-color': inputBgColor,
        '--panel-dropdown-hover-bg-color': layoutTheme.accentColor,
        '--panel-dropdown-active-bg-color': dropdownActiveBgColor,
        '--panel-entry-hover-bg-color': entryHoverBgColor,
        '--panel-selected-bg-color': selectedBgColor,
        '--panel-md-entry-bg-color': entryBgColor,
        '--panel-md-entry-current-bg-color': selectedBgColor,
        '--search-input-bg-color': inputBgColor,
        '--yaml-input-bg-color': inputBgColor,
        '--panel-background-image': toCssBackgroundImage(layoutTheme.backgroundImageUrl),
        '--panel-background-image-opacity': layoutTheme.backgroundImageUrl
          ? String(layoutTheme.backgroundImageOpacity)
          : '0',
        '--panel-surface-opacity': '1',
        '--panel-icon-bg-color': layoutTheme.iconBgColor,
        '--panel-icon-hover-bg-color': iconHoverBgColor,
        '--panel-border-color': '#555',
        '--lorebook-name-white-space': truncateLongNames ? 'nowrap' : 'normal',
        '--lorebook-name-text-overflow': truncateLongNames ? 'ellipsis' : 'clip',
        '--lorebook-name-overflow-wrap': truncateLongNames ? 'normal' : 'anywhere',
        '--lorebook-name-word-break': truncateLongNames ? 'normal' : 'break-word',
        '--lorebook-title-align-items': truncateLongNames ? 'center' : 'flex-start',
      });
    }

    const $modal = $('#theme-settings-modal', parentDoc);
    if ($modal.length) {
      $modal.css({
        '--modal-bg-color': layoutTheme.bgColor,
        '--modal-text-color': layoutTheme.textColor,
        '--modal-accent-color': layoutTheme.accentColor,
        '--panel-input-bg-color': layoutTheme.inputBgColor,
        '--panel-input-focus-bg-color': inputFocusBgColor,
        '--panel-icon-bg-color': layoutTheme.iconBgColor,
        '--panel-icon-hover-bg-color': iconHoverBgColor,
        '--panel-border-color': '#555',
      });
    }

    const $importModal = $('#lorebook-import-modal', parentDoc);
    if ($importModal.length) {
      $importModal.css({
        '--yaml-input-bg-color': layoutTheme.inputBgColor,
        '--panel-input-bg-color': layoutTheme.inputBgColor,
        '--panel-text-color': layoutTheme.textColor,
        '--panel-accent-color': layoutTheme.accentColor,
        '--panel-bg-color': layoutTheme.bgColor,
        '--panel-entry-bg-color': layoutTheme.entryBgColor,
        '--panel-border-color': '#555',
      });
    }
  } catch (error) {
    console.error('角色世界书: applyTheme 函数执行出错', error);
  }
}

function saveTheme(theme, layoutMode = getPcLayoutModeSetting()) {
  const mode = normalizeLayoutMode(layoutMode);
  const store = loadThemeStore();
  store.shared = normalizeSharedTheme(theme, store.shared);
  store.layouts[mode] = normalizeLayoutTheme(
    theme,
    mode === 'drawer' ? getDefaultDrawerTheme() : getDefaultMasterDetailTheme(),
  );
  saveThemeStore(store);
  return buildThemeForLayout(store, mode);
}

export function loadTheme(layoutMode = getPcLayoutModeSetting()) {
  return buildThemeForLayout(loadThemeStore(), getEffectiveThemeLayoutMode(layoutMode));
}

function getParentDoc() {
  return window.parent.document;
}

function getModalColorValue(parentDoc, selector, fallback) {
  const value = $(selector, parentDoc).val();
  return typeof value === 'string' && value ? value : fallback;
}

function getModalStringValue(parentDoc, selector, fallback = '') {
  const value = $(selector, parentDoc).val();
  return typeof value === 'string' ? value.trim() : fallback;
}

function getModalPercentValue(parentDoc, selector, fallback) {
  const value = Number.parseFloat($(selector, parentDoc).val());
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value / 100)) : fallback;
}

function setRangePercent(parentDoc, sliderSelector, labelSelector, value) {
  const percent = Math.round(pickOpacity(value, 0) * 100);
  $(sliderSelector, parentDoc).val(String(percent));
  $(labelSelector, parentDoc).text(`${percent}%`);
}

function syncIconColorGroup(parentDoc, isEnabled) {
  $('#icon-bg-color-group', parentDoc).toggleClass('theme-hidden', !isEnabled);
}

function readThemeFromModal(layoutMode = getPcLayoutModeSetting()) {
  const parentDoc = getParentDoc();
  const currentTheme = loadTheme(layoutMode);
  return {
    ...currentTheme,
    bgColor: getModalColorValue(parentDoc, '#panel-bg-color-picker', currentTheme.bgColor),
    textColor: getModalColorValue(parentDoc, '#panel-text-color-picker', currentTheme.textColor),
    accentColor: getModalColorValue(parentDoc, '#panel-accent-color-picker', currentTheme.accentColor),
    entryBgColor: getModalColorValue(parentDoc, '#panel-entry-bg-color-picker', currentTheme.entryBgColor),
    inputBgColor: getModalColorValue(parentDoc, '#search-input-bg-color-picker', currentTheme.inputBgColor),
    backgroundImageUrl: getModalStringValue(
      parentDoc,
      '#panel-background-image-url-input',
      currentTheme.backgroundImageUrl,
    ),
    backgroundImageOpacity: getModalPercentValue(
      parentDoc,
      '#panel-background-opacity-slider',
      currentTheme.backgroundImageOpacity,
    ),
    panelOpacity: getModalPercentValue(parentDoc, '#panel-opacity-slider', currentTheme.panelOpacity),
    iconBgColor: getModalColorValue(parentDoc, '#panel-icon-bg-color-picker', currentTheme.iconBgColor),
    showTopbarButton: $('#topbar-button-toggle', parentDoc).length
      ? $('#topbar-button-toggle', parentDoc).is(':checked')
      : currentTheme.showTopbarButton,
    truncateLongNames: $('#truncate-long-names-toggle', parentDoc).length
      ? $('#truncate-long-names-toggle', parentDoc).is(':checked')
      : currentTheme.truncateLongNames,
    unifiedIconButtons: $('#unified-icon-toggle', parentDoc).length
      ? $('#unified-icon-toggle', parentDoc).is(':checked')
      : currentTheme.unifiedIconButtons,
  };
}

function fillThemeModal(theme, layoutMode = getPcLayoutModeSetting()) {
  const parentDoc = getParentDoc();
  const inputBgColor = theme.inputBgColor || theme.searchInputBgColor || theme.yamlInputBgColor;
  $('#panel-bg-color-picker', parentDoc).val(rgbaToHex(theme.bgColor));
  $('#panel-text-color-picker', parentDoc).val(rgbaToHex(theme.textColor));
  $('#panel-accent-color-picker', parentDoc).val(rgbaToHex(theme.accentColor));
  $('#panel-entry-bg-color-picker', parentDoc).val(rgbaToHex(theme.entryBgColor));
  $('#search-input-bg-color-picker', parentDoc).val(rgbaToHex(inputBgColor));
  $('#yaml-input-bg-color-picker', parentDoc).val(rgbaToHex(inputBgColor));
  $('#panel-background-image-url-input', parentDoc).val(theme.backgroundImageUrl || '');
  setRangePercent(
    parentDoc,
    '#panel-background-opacity-slider',
    '#panel-background-opacity-value',
    theme.backgroundImageOpacity,
  );
  setRangePercent(parentDoc, '#panel-opacity-slider', '#panel-opacity-value', theme.panelOpacity);
  $('#panel-icon-bg-color-picker', parentDoc).val(rgbaToHex(theme.iconBgColor));
  $('#topbar-button-toggle', parentDoc).prop('checked', theme.showTopbarButton);
  $('#highlight-active-toggle', parentDoc).prop('checked', getHighlightActiveEntriesSetting());
  $('#show-search-bar-toggle', parentDoc).prop('checked', getShowSearchBarSetting());
  $('#fullscreen-mode-toggle', parentDoc).prop('checked', getFullscreenModeSetting());
  $('#truncate-long-names-toggle', parentDoc).prop('checked', theme.truncateLongNames !== false);
  $('#unified-icon-toggle', parentDoc).prop('checked', theme.unifiedIconButtons === true);
  $('#pc-layout-mode-select', parentDoc).val(normalizeLayoutMode(layoutMode));
  syncIconColorGroup(parentDoc, theme.unifiedIconButtons === true);
}

function setSliderLabel($modal, labelSelector, labelText, valueSelector) {
  const $label = $modal.find(labelSelector);
  const $value = $label.find(valueSelector).detach();
  if (!$label.length) {
    return;
  }

  $label.text(`${labelText} `);
  if ($value.length) {
    $label.append($value);
  }
}

function ensureThemeModalShape($modal) {
  if (!$modal.length) {
    return;
  }

  const $inputBgLabel = $modal.find('label[for="search-input-bg-color-picker"]');
  if ($inputBgLabel.length) {
    $inputBgLabel.text('输入栏背景色');
  }
  $modal.find('#yaml-input-bg-color-picker').closest('.form-group').remove();
  $modal.find('#reset-theme-button').text('恢复当前布局默认颜色');
  setSliderLabel(
    $modal,
    'label[for="panel-background-opacity-slider"]',
    '背景图不透明度',
    '#panel-background-opacity-value',
  );
  setSliderLabel($modal, 'label[for="panel-opacity-slider"]', '插件页面不透明度', '#panel-opacity-value');

  if ($modal.find('#panel-background-image-url-group').length === 0) {
    const backgroundControlsHtml = `
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
    `;
    const $inputColorGroup = $modal.find('#search-input-bg-color-picker').closest('.form-group');
    if ($inputColorGroup.length) {
      $inputColorGroup.after(backgroundControlsHtml);
    } else {
      const $actions = $modal.find('.form-actions');
      if ($actions.length) {
        $actions.before(backgroundControlsHtml);
      } else {
        $modal.find('.modal-body').append(backgroundControlsHtml);
      }
    }
  }

  if ($modal.find('#topbar-button-toggle-group').length && $modal.find('#unified-icon-toggle-group').length === 0) {
    const iconControlsHtml = `
      <div id="unified-icon-toggle-group" class="form-group">
        <label for="unified-icon-toggle">统一图标样式</label>
        <label class="switch">
          <input type="checkbox" id="unified-icon-toggle">
          <span class="slider round"></span>
        </label>
      </div>
      <div id="icon-bg-color-group" class="form-group theme-hidden">
        <label for="panel-icon-bg-color-picker">图标颜色</label>
        <input type="color" id="panel-icon-bg-color-picker" class="form-control">
      </div>
    `;
    const $truncateGroup = $modal.find('#truncate-long-names-toggle-group');
    if ($truncateGroup.length) {
      $truncateGroup.after(iconControlsHtml);
    } else {
      const $pcLayoutGroup = $modal.find('#pc-layout-mode-group');
      if ($pcLayoutGroup.length) {
        $pcLayoutGroup.before(iconControlsHtml);
      } else {
        $modal.find('.modal-body').append(iconControlsHtml);
      }
    }
  }
}

async function refreshCurrentTabForLayoutChange() {
  try {
    const parentDoc = getParentDoc();
    const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
    if (!$panel.length || !$panel.is(':visible')) {
      return;
    }

    const activeTabId = $panel.find('.tab-button.active-tab').attr('id');
    if (activeTabId) {
      await switchTab(activeTabId);
    }
  } catch (error) {
    console.warn('角色世界书: 切换布局后刷新当前页失败', error);
  }
}

// 需要一个持久的引用来保存我们的处理函数，以便之后可以移除它
let hijackHandler = null;

function updateButtonBehavior(settings) {
  const parentDoc = window.parent.document;
  const toggleButton = parentDoc.querySelector('#WI-SP-button .drawer-toggle');

  if (!toggleButton) {
    return;
  }

  if (hijackHandler) {
    toggleButton.removeEventListener('click', hijackHandler, true);
    hijackHandler = null;
  }

  if (settings.showTopbarButton) {
    hijackHandler = function (event) {
      event.stopImmediatePropagation();
      event.preventDefault();
      event.stopPropagation();
      toggleLorebookPanel();
    };

    toggleButton.addEventListener('click', hijackHandler, true);
  }
}

export function initTheme() {
  const currentTheme = loadTheme();
  applyTheme(currentTheme);
  updateButtonBehavior(currentTheme);

  const parentDoc = window.parent.document;
  const parentWin = parentDoc.defaultView || window.parent || window;
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
  const $modal = $('#theme-settings-modal', parentDoc);
  let appliedThemeLayoutMode = getEffectiveThemeLayoutMode();
  let themeViewportTimer = null;

  if (getFullscreenModeSetting()) {
    $panel.addClass('fullscreen-mode');
  }
  syncPanelLayoutMode();

  ensureThemeModalShape($modal);

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
           <div id="truncate-long-names-toggle-group" class="form-group">
               <label for="truncate-long-names-toggle">过长名称省略</label>
               <label class="switch">
                   <input type="checkbox" id="truncate-long-names-toggle">
                   <span class="slider round"></span>
               </label>
           </div>
           <div id="unified-icon-toggle-group" class="form-group">
               <label for="unified-icon-toggle">统一图标样式</label>
               <label class="switch">
                   <input type="checkbox" id="unified-icon-toggle">
                   <span class="slider round"></span>
               </label>
           </div>
           <div id="icon-bg-color-group" class="form-group theme-hidden">
               <label for="panel-icon-bg-color-picker">图标颜色</label>
               <input type="color" id="panel-icon-bg-color-picker" class="form-control">
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

    ensureThemeModalShape($modal);
    const pcLayoutMode = getPcLayoutModeSetting();
    const themeLayoutMode = getEffectiveThemeLayoutMode(pcLayoutMode);
    fillThemeModal(loadTheme(themeLayoutMode), pcLayoutMode);

    if (typeof modalElement.showModal === 'function') {
      modalElement.showModal();
    } else {
      $modal.show();
    }
  });

  const handleSettingsChange = () => {
    const layoutMode = getEffectiveThemeLayoutMode();
    try {
      const themeFromModal = readThemeFromModal(layoutMode);
      setRangePercent(
        parentDoc,
        '#panel-background-opacity-slider',
        '#panel-background-opacity-value',
        themeFromModal.backgroundImageOpacity,
      );
      setRangePercent(parentDoc, '#panel-opacity-slider', '#panel-opacity-value', themeFromModal.panelOpacity);
      syncIconColorGroup(parentDoc, themeFromModal.unifiedIconButtons === true);

      const newSettings = saveTheme(themeFromModal, layoutMode);
      applyTheme(newSettings);
      updateButtonBehavior(newSettings);
    } catch (error) {
      console.error('角色世界书: 保存主题设置失败', error);
      alert('主题设置保存失败。背景图可能过大，请换用更小的图片或图片 URL。');
      fillThemeModal(loadTheme(layoutMode), getPcLayoutModeSetting());
    }
  };

  $modal.on('input', 'input[type="color"], input[type="range"]', handleSettingsChange);
  $modal.on('change', '#panel-background-image-url-input', handleSettingsChange);
  $modal.on('change', '#topbar-button-toggle', handleSettingsChange);
  $modal.on('change', '#truncate-long-names-toggle', handleSettingsChange);
  $modal.on('change', '#unified-icon-toggle', handleSettingsChange);

  $modal.on('click', '#panel-background-image-clear-button', function () {
    $('#panel-background-image-url-input', parentDoc).val('');
    $('#panel-background-image-file-input', parentDoc).val('');
    handleSettingsChange();
  });

  $modal.on('click', '#panel-background-image-upload-button', function () {
    $('#panel-background-image-file-input', parentDoc).trigger('click');
  });

  $modal.on('change', '#panel-background-image-file-input', function () {
    const file = this.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type?.startsWith('image/')) {
      alert('请选择图片文件。');
      $(this).val('');
      return;
    }

    if (file.size > MAX_BACKGROUND_IMAGE_DATA_URL_LENGTH) {
      alert('背景图超过约 2MB，未保存。请换用更小的图片或图片 URL。');
      $(this).val('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl || dataUrl.length > MAX_BACKGROUND_IMAGE_DATA_URL_LENGTH) {
        alert('背景图数据超过约 2MB，未保存。请换用更小的图片或图片 URL。');
        $(this).val('');
        return;
      }

      $('#panel-background-image-url-input', parentDoc).val(dataUrl);
      handleSettingsChange();
    };
    reader.onerror = () => {
      alert('读取背景图失败。');
      $(this).val('');
    };
    reader.readAsDataURL(file);
  });

  $modal.on('change', '#highlight-active-toggle', function () {
    const isEnabled = $(this).is(':checked');
    setHighlightActiveEntriesSetting(isEnabled);

    if (window.toggleActivationListeners) {
      window.toggleActivationListeners();
    }
  });

  $modal.on('change', '#show-search-bar-toggle', function () {
    const isEnabled = $(this).is(':checked');
    setShowSearchBarSetting(isEnabled);

    const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
    const $worldbookSearchBar = $panel.find('.global-lorebook-adder');
    if (isEnabled) {
      $worldbookSearchBar.show();
    } else {
      $worldbookSearchBar.hide();
    }
  });

  $modal.on('change', '#fullscreen-mode-toggle', function () {
    const isEnabled = $(this).is(':checked');
    setFullscreenModeSetting(isEnabled);

    const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
    if (isEnabled) {
      $panel.addClass('fullscreen-mode');
    } else {
      $panel.removeClass('fullscreen-mode');
    }
  });

  $modal.on('change', '#pc-layout-mode-select', async function () {
    const previousLayoutMode = getPcLayoutModeSetting();
    const previousThemeLayoutMode = getEffectiveThemeLayoutMode(previousLayoutMode);
    saveTheme(readThemeFromModal(previousThemeLayoutMode), previousThemeLayoutMode);

    const nextLayoutMode = normalizeLayoutMode($(this).val());
    setPcLayoutModeSetting(nextLayoutMode);
    const nextThemeLayoutMode = getEffectiveThemeLayoutMode(nextLayoutMode);
    appliedThemeLayoutMode = nextThemeLayoutMode;
    const nextTheme = loadTheme(nextThemeLayoutMode);
    fillThemeModal(nextTheme, nextLayoutMode);
    applyTheme(nextTheme);
    updateButtonBehavior(nextTheme);
    syncPanelLayoutMode();
    await refreshCurrentTabForLayoutChange();
    void refreshAiWorkspace();
  });

  $modal.on('click', '#reset-theme-button', function () {
    const pcLayoutMode = getPcLayoutModeSetting();
    const layoutMode = getEffectiveThemeLayoutMode(pcLayoutMode);
    const currentTheme = loadTheme(layoutMode);
    const defaultLayoutTheme = layoutMode === 'drawer' ? getDefaultDrawerTheme() : getDefaultMasterDetailTheme();
    const defaultTheme = {
      ...currentTheme,
      ...defaultLayoutTheme,
      searchInputBgColor: defaultLayoutTheme.inputBgColor,
      yamlInputBgColor: defaultLayoutTheme.inputBgColor,
    };
    const savedTheme = saveTheme(defaultTheme, layoutMode);
    applyTheme(savedTheme);
    updateButtonBehavior(savedTheme);
    fillThemeModal(savedTheme, pcLayoutMode);
  });

  $(parentWin)
    .off('resize.lorebookThemeLayout orientationchange.lorebookThemeLayout')
    .on('resize.lorebookThemeLayout orientationchange.lorebookThemeLayout', () => {
      if (themeViewportTimer) {
        clearTimeout(themeViewportTimer);
      }

      themeViewportTimer = window.setTimeout(() => {
        const nextThemeLayoutMode = getEffectiveThemeLayoutMode();
        if (nextThemeLayoutMode === appliedThemeLayoutMode) {
          return;
        }

        appliedThemeLayoutMode = nextThemeLayoutMode;
        const pcLayoutMode = getPcLayoutModeSetting();
        const nextTheme = loadTheme(nextThemeLayoutMode);
        applyTheme(nextTheme);
        updateButtonBehavior(nextTheme);

        const modalElement = $modal[0];
        if (modalElement?.open || $modal.is(':visible')) {
          fillThemeModal(nextTheme, pcLayoutMode);
        }
      }, 120);
    });
}
