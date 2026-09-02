import { LOREBOOK_PANEL_ID, LOREBOOK_THEME_KEY } from '../config.js';
import { exportBrowserSettings, importBrowserSettings } from '../features/browserSettingsBackup.js';
import { loadSortPreference } from '../features/sorting.js';
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
import { getLocalStorageItem, isMobile, rgbaToHex, setLocalStorageItem, triggerDownload } from '../utils.js';
import { refreshAiWorkspace } from './aiWorkspace.js';
import { syncPanelLayoutMode } from './detail.js';
import { switchTab, toggleLorebookPanel } from './panel.js';

const THEME_VERSION = 4;
const DEFAULT_LAYOUT_MODE = 'master-detail';
const VALID_LAYOUT_MODES = new Set(['drawer', 'master-detail']);
const MAX_BACKGROUND_IMAGE_DATA_URL_LENGTH = 2 * 1024 * 1024;
const BACKGROUND_IMAGE_SURFACE_REVEAL_RATIO = 0.45;
const MIN_PANEL_OPACITY = 0.35;
const COLOR_HEX_INPUT_SUFFIX = '-hex';
const HEX_COLOR_PATTERN = /^#?([\da-f]{3}|[\da-f]{6})$/i;

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
    inputBgColor: '#4F4F4F',
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
    mobileExpandButtonUnderCheckbox: false,
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

function pickPanelOpacity(value, fallback) {
  return Math.max(MIN_PANEL_OPACITY, pickOpacity(value, fallback));
}

function normalizeSharedTheme(shared = {}, fallback = getDefaultSharedTheme()) {
  return {
    showTopbarButton: pickBoolean(shared.showTopbarButton, fallback.showTopbarButton),
    truncateLongNames: pickBoolean(shared.truncateLongNames, fallback.truncateLongNames),
    mobileExpandButtonUnderCheckbox: pickBoolean(
      shared.mobileExpandButtonUnderCheckbox,
      fallback.mobileExpandButtonUnderCheckbox,
    ),
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
    panelOpacity: pickPanelOpacity(theme.panelOpacity, fallback.panelOpacity),
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

function isColorDark(color) {
  if (typeof color !== 'string' || !color) {
    return true;
  }
  const hex = rgbaToHex(color);
  if (!hex || hex.length < 7) {
    return true;
  }
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return true;
  }
  // 相对亮度公式 (W3C)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

function colorWithOpacity(color, opacity) {
  const percent = Math.round(pickOpacity(opacity, 1) * 100);
  return percent >= 100 ? color : `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

function getInteriorSurfaceOpacity(layoutTheme) {
  const panelOpacity = pickPanelOpacity(layoutTheme.panelOpacity, 1);
  if (!pickString(layoutTheme.backgroundImageUrl, '')) {
    return panelOpacity;
  }

  const imageOpacity = pickOpacity(layoutTheme.backgroundImageOpacity, 0);
  return Math.min(1, Math.max(0, panelOpacity * (1 - imageOpacity * BACKGROUND_IMAGE_SURFACE_REVEAL_RATIO)));
}

function buildSemanticThemeTokens(layoutTheme, surfaceOpacity = 1) {
  const isDark = isColorDark(layoutTheme.bgColor);
  const contrastColor = isDark ? '#ffffff' : '#000000';
  const surfaceColor = colorWithOpacity(layoutTheme.entryBgColor, surfaceOpacity);
  const surfaceRaisedColor = colorWithOpacity(
    colorMix(layoutTheme.entryBgColor, isDark ? 88 : 96, contrastColor),
    surfaceOpacity,
  );
  const surfaceMutedColor = colorWithOpacity(
    colorMix(layoutTheme.entryBgColor, isDark ? 96 : 98, contrastColor),
    surfaceOpacity,
  );
  const mutedTextColor = colorMix(layoutTheme.textColor, isDark ? 72 : 68, layoutTheme.bgColor);
  const borderColor = colorMix(layoutTheme.textColor, isDark ? 22 : 18, layoutTheme.bgColor);
  const focusRingColor = colorMix(layoutTheme.accentColor, isDark ? 76 : 82, contrastColor);
  const focusRing = `0 0 0 3px ${colorMix(focusRingColor, 36, 'transparent')}`;
  const successColor = isDark ? '#76d7a0' : '#167545';
  const warningColor = isDark ? '#f0c66d' : '#8a6100';
  const dangerColor = isDark ? '#ff9292' : '#b4232c';
  const shadowColor = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)';

  return {
    '--panel-surface-raised-color': surfaceRaisedColor,
    '--panel-surface-muted-color': surfaceMutedColor,
    '--panel-muted-text-color': mutedTextColor,
    '--panel-border-color': borderColor,
    '--panel-success-color': successColor,
    '--panel-success-bg-color': colorMix(surfaceRaisedColor, 86, successColor),
    '--panel-warning-color': warningColor,
    '--panel-warning-bg-color': colorMix(surfaceRaisedColor, 84, warningColor),
    '--panel-danger-color': dangerColor,
    '--panel-danger-bg-color': colorMix(surfaceRaisedColor, 86, dangerColor),
    '--panel-focus-ring-color': focusRingColor,
    '--panel-focus-ring': focusRing,
    // AI workspace names are intentionally stable so detached drawers/dialogs can share this contract.
    '--ai-surface-color': surfaceColor,
    '--ai-surface-raised-color': surfaceRaisedColor,
    '--ai-surface-muted-color': surfaceMutedColor,
    '--ai-text-color-secondary': mutedTextColor,
    '--ai-border-color': borderColor,
    '--ai-success-color': successColor,
    '--ai-success-bg-color': colorMix(surfaceRaisedColor, 86, successColor),
    '--ai-warning-color': warningColor,
    '--ai-warning-bg-color': colorMix(surfaceRaisedColor, 84, warningColor),
    '--ai-danger-color': dangerColor,
    '--ai-danger-bg-color': colorMix(surfaceRaisedColor, 86, dangerColor),
    '--ai-focus-ring-color': focusRingColor,
    '--ai-focus-ring': focusRing,
    '--ai-shadow-color': shadowColor,
  };
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
    const semanticThemeTokens = buildSemanticThemeTokens(layoutTheme, interiorSurfaceOpacity);
    const panelAccentTextColor = isColorDark(layoutTheme.accentColor) ? '#ffffff' : '#1a1a1a';

    if ($panel.length) {
      $panel.attr('data-unified-icon-buttons', sharedTheme.unifiedIconButtons ? 'true' : 'false');
      $panel.attr('data-mobile-entry-title-mode', truncateLongNames ? 'single-line' : 'two-line');
      $panel.attr(
        'data-mobile-expand-placement',
        sharedTheme.mobileExpandButtonUnderCheckbox ? 'under-checkbox' : 'inline',
      );
      $panel.css({
        ...semanticThemeTokens,
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
        '--lorebook-name-white-space': truncateLongNames ? 'nowrap' : 'normal',
        '--lorebook-name-text-overflow': truncateLongNames ? 'ellipsis' : 'clip',
        '--lorebook-name-overflow-wrap': truncateLongNames ? 'normal' : 'anywhere',
        '--lorebook-name-word-break': truncateLongNames ? 'normal' : 'break-word',
        '--lorebook-title-align-items': truncateLongNames ? 'center' : 'flex-start',
        '--panel-accent-text-color': panelAccentTextColor,
      });
    }

    const $modal = $('#theme-settings-modal', parentDoc);
    if ($modal.length) {
      $modal.css({
        ...semanticThemeTokens,
        '--modal-bg-color': layoutTheme.bgColor,
        '--modal-text-color': layoutTheme.textColor,
        '--panel-text-color': layoutTheme.textColor,
        '--panel-accent-text-color': panelAccentTextColor,
        '--modal-accent-color': layoutTheme.accentColor,
        '--panel-accent-color': layoutTheme.accentColor,
        '--panel-input-bg-color': layoutTheme.inputBgColor,
        '--panel-input-focus-bg-color': inputFocusBgColor,
        '--panel-icon-bg-color': layoutTheme.iconBgColor,
        '--panel-icon-hover-bg-color': iconHoverBgColor,
        'color-scheme': isColorDark(layoutTheme.bgColor) ? 'dark' : 'light',
      });
    }

    const $importModal = $('#lorebook-import-modal', parentDoc);
    if ($importModal.length) {
      $importModal.css({
        ...semanticThemeTokens,
        '--yaml-input-bg-color': layoutTheme.inputBgColor,
        '--panel-input-bg-color': layoutTheme.inputBgColor,
        '--panel-text-color': layoutTheme.textColor,
        '--panel-accent-color': layoutTheme.accentColor,
        '--panel-bg-color': layoutTheme.bgColor,
        '--panel-entry-bg-color': layoutTheme.entryBgColor,
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

export function normalizeHexColor(value, { allowShort = true } = {}) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(HEX_COLOR_PATTERN);
  if (!match || (!allowShort && match[1].length !== 6)) {
    return null;
  }

  const hex = match[1].toLowerCase();
  const expandedHex = hex.length === 3 ? [...hex].map(char => `${char}${char}`).join('') : hex;
  return `#${expandedHex}`;
}

function getColorHexInputSelector(colorPickerSelector) {
  return `${colorPickerSelector}${COLOR_HEX_INPUT_SUFFIX}`;
}

function setModalColorValue(parentDoc, selector, color) {
  const normalizedColor = normalizeHexColor(color) || '#000000';
  $(selector, parentDoc).val(normalizedColor);
  $(getColorHexInputSelector(selector), parentDoc).val(normalizedColor).removeClass('theme-color-hex-input-invalid');
}

function getModalColorValue(parentDoc, selector, fallback) {
  const hexInputValue = $(getColorHexInputSelector(selector), parentDoc).val();
  const colorInputValue = $(selector, parentDoc).val();
  return (
    normalizeHexColor(hexInputValue) ||
    normalizeHexColor(colorInputValue) ||
    normalizeHexColor(rgbaToHex(fallback)) ||
    fallback
  );
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

function supportsNativeColorInput(parentDoc) {
  const input = parentDoc.createElement('input');
  input.setAttribute('type', 'color');
  return input.type === 'color';
}

function ensureThemeColorInputFallbacks($modal) {
  if (!$modal.length) {
    return;
  }

  const parentDoc = $modal[0].ownerDocument;
  $modal.toggleClass('theme-native-color-input-unsupported', !supportsNativeColorInput(parentDoc));

  $modal.find('input[type="color"]').each(function () {
    if (!this.id) {
      return;
    }

    this.classList.add('theme-native-color-picker');
    let colorControl = this.closest('.theme-color-control');
    if (!colorControl) {
      colorControl = parentDoc.createElement('div');
      colorControl.className = 'theme-color-control';
      this.parentNode?.insertBefore(colorControl, this);
      colorControl.appendChild(this);
    }

    const hexInputId = `${this.id}${COLOR_HEX_INPUT_SUFFIX}`;
    if (parentDoc.getElementById(hexInputId)) {
      return;
    }

    const hexInput = parentDoc.createElement('input');
    hexInput.type = 'text';
    hexInput.id = hexInputId;
    hexInput.className = 'form-control theme-color-hex-input';
    hexInput.inputMode = 'text';
    hexInput.autocomplete = 'off';
    hexInput.autocapitalize = 'characters';
    hexInput.spellcheck = false;
    hexInput.maxLength = 7;
    hexInput.placeholder = '#RRGGBB';
    hexInput.setAttribute('aria-label', '十六进制颜色值');
    colorControl.appendChild(hexInput);
  });
}

function syncColorHexInputFromPicker(parentDoc, colorPicker) {
  if (!colorPicker?.id) {
    return;
  }

  const normalizedColor = normalizeHexColor(colorPicker.value);
  if (!normalizedColor) {
    return;
  }

  $(`#${colorPicker.id}${COLOR_HEX_INPUT_SUFFIX}`, parentDoc)
    .val(normalizedColor)
    .removeClass('theme-color-hex-input-invalid');
}

function applyColorHexInput(parentDoc, hexInput, { allowShort = false } = {}) {
  if (!hexInput?.id || !hexInput.id.endsWith(COLOR_HEX_INPUT_SUFFIX)) {
    return false;
  }

  const value = hexInput.value;
  const normalizedColor = normalizeHexColor(value, { allowShort });
  const isEmpty = value.trim().length === 0;
  $(hexInput).toggleClass('theme-color-hex-input-invalid', !isEmpty && !normalizedColor);
  if (!normalizedColor) {
    return false;
  }

  const colorInputId = hexInput.id.slice(0, -COLOR_HEX_INPUT_SUFFIX.length);
  const colorInput = parentDoc.getElementById(colorInputId);
  if (colorInput) {
    colorInput.value = normalizedColor;
  }
  hexInput.value = normalizedColor;
  return true;
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
    mobileExpandButtonUnderCheckbox: $('#mobile-expand-under-checkbox-toggle', parentDoc).length
      ? $('#mobile-expand-under-checkbox-toggle', parentDoc).is(':checked')
      : currentTheme.mobileExpandButtonUnderCheckbox,
    unifiedIconButtons: $('#unified-icon-toggle', parentDoc).length
      ? $('#unified-icon-toggle', parentDoc).is(':checked')
      : currentTheme.unifiedIconButtons,
  };
}

function fillThemeModal(theme, layoutMode = getPcLayoutModeSetting()) {
  const parentDoc = getParentDoc();
  const inputBgColor = theme.inputBgColor || theme.searchInputBgColor || theme.yamlInputBgColor;
  setModalColorValue(parentDoc, '#panel-bg-color-picker', rgbaToHex(theme.bgColor));
  setModalColorValue(parentDoc, '#panel-text-color-picker', rgbaToHex(theme.textColor));
  setModalColorValue(parentDoc, '#panel-accent-color-picker', rgbaToHex(theme.accentColor));
  setModalColorValue(parentDoc, '#panel-entry-bg-color-picker', rgbaToHex(theme.entryBgColor));
  setModalColorValue(parentDoc, '#search-input-bg-color-picker', rgbaToHex(inputBgColor));
  setModalColorValue(parentDoc, '#yaml-input-bg-color-picker', rgbaToHex(inputBgColor));
  $('#panel-background-image-url-input', parentDoc).val(theme.backgroundImageUrl || '');
  setRangePercent(
    parentDoc,
    '#panel-background-opacity-slider',
    '#panel-background-opacity-value',
    theme.backgroundImageOpacity,
  );
  $('#panel-opacity-slider', parentDoc).attr('min', String(Math.round(MIN_PANEL_OPACITY * 100)));
  setRangePercent(parentDoc, '#panel-opacity-slider', '#panel-opacity-value', theme.panelOpacity);
  setModalColorValue(parentDoc, '#panel-icon-bg-color-picker', rgbaToHex(theme.iconBgColor));
  $('#topbar-button-toggle', parentDoc).prop('checked', theme.showTopbarButton);
  $('#highlight-active-toggle', parentDoc).prop('checked', getHighlightActiveEntriesSetting());
  $('#show-search-bar-toggle', parentDoc).prop('checked', getShowSearchBarSetting());
  $('#fullscreen-mode-toggle', parentDoc).prop('checked', getFullscreenModeSetting());
  $('#truncate-long-names-toggle', parentDoc).prop('checked', theme.truncateLongNames !== false);
  $('#mobile-expand-under-checkbox-toggle', parentDoc).prop('checked', theme.mobileExpandButtonUnderCheckbox === true);
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

  if ($modal.find('#theme-color-input-hint').length === 0) {
    $modal.find('.modal-body').prepend(`
      <p id="theme-color-input-hint" class="theme-color-input-hint">
        可点击色块取色；若浏览器不支持取色器，请在右侧直接输入 <code>#RRGGBB</code>。
      </p>
    `);
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
        <input type="range" id="panel-opacity-slider" min="35" max="100" step="1">
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
        <div class="theme-color-control">
          <input type="color" id="panel-icon-bg-color-picker" class="form-control theme-native-color-picker">
          <input type="text" id="panel-icon-bg-color-picker-hex" class="form-control theme-color-hex-input" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="7" placeholder="#RRGGBB" aria-label="图标颜色，十六进制颜色值">
        </div>
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

  if (
    $modal.find('#topbar-button-toggle-group').length &&
    $modal.find('#mobile-expand-under-checkbox-toggle-group').length === 0
  ) {
    const mobileExpandToggleHtml = `
      <div id="mobile-expand-under-checkbox-toggle-group" class="form-group">
        <label for="mobile-expand-under-checkbox-toggle">手机端展开箭头下置</label>
        <label class="switch">
          <input type="checkbox" id="mobile-expand-under-checkbox-toggle">
          <span class="slider round"></span>
        </label>
      </div>
    `;
    const $truncateGroup = $modal.find('#truncate-long-names-toggle-group');
    if ($truncateGroup.length) {
      $truncateGroup.after(mobileExpandToggleHtml);
    } else {
      const $iconGroup = $modal.find('#unified-icon-toggle-group');
      const $pcLayoutGroup = $modal.find('#pc-layout-mode-group');
      if ($iconGroup.length) {
        $iconGroup.before(mobileExpandToggleHtml);
      } else if ($pcLayoutGroup.length) {
        $pcLayoutGroup.before(mobileExpandToggleHtml);
      } else {
        $modal.find('.modal-body').append(mobileExpandToggleHtml);
      }
    }
  }

  if ($modal.find('#browser-settings-transfer-group').length === 0) {
    const browserSettingsHtml = `
      <div id="browser-settings-transfer-group" class="form-group theme-form-group-stacked">
        <label>浏览器设置</label>
        <div class="theme-browser-settings-actions">
          <button type="button" id="browser-settings-export-button">
            <i class="fa-solid fa-file-export"></i>
            <span>导出浏览器设置</span>
          </button>
          <button type="button" id="browser-settings-import-button">
            <i class="fa-solid fa-file-import"></i>
            <span>导入浏览器设置</span>
          </button>
          <input type="file" id="browser-settings-import-file-input" accept=".json,application/json">
        </div>
      </div>
    `;
    const $actions = $modal.find('.form-actions');
    if ($actions.length) {
      $actions.before(browserSettingsHtml);
    } else {
      $modal.find('.modal-body').append(browserSettingsHtml);
    }
  }

  ensureThemeColorInputFallbacks($modal);
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

function buildBrowserSettingsBackupFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `enhanced-lorebook-browser-settings-${timestamp}.json`;
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => reject(new Error('读取浏览器设置备份失败。'));
    reader.readAsText(file, 'UTF-8');
  });
}

function notifyBrowserSettings(type, message) {
  const toastr = window.toastr || window.parent?.toastr;
  if (toastr && typeof toastr[type] === 'function') {
    toastr[type](message);
    return;
  }

  alert(message);
}

async function applyImportedBrowserSettingsToUi() {
  loadSortPreference();

  const parentDoc = getParentDoc();
  const $panel = $(`#${LOREBOOK_PANEL_ID}`, parentDoc);
  const pcLayoutMode = getPcLayoutModeSetting();
  const themeLayoutMode = getEffectiveThemeLayoutMode(pcLayoutMode);
  const theme = loadTheme(themeLayoutMode);

  applyTheme(theme);
  updateButtonBehavior(theme);
  fillThemeModal(theme, pcLayoutMode);
  syncPanelLayoutMode();

  $panel.toggleClass('fullscreen-mode', getFullscreenModeSetting());
  $panel.find('.global-lorebook-adder').toggle(getShowSearchBarSetting());

  if (window.toggleActivationListeners) {
    window.toggleActivationListeners();
  }

  await refreshCurrentTabForLayoutChange();
  void refreshAiWorkspace();

  return themeLayoutMode;
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
           <div id="mobile-expand-under-checkbox-toggle-group" class="form-group">
               <label for="mobile-expand-under-checkbox-toggle">手机端展开箭头下置</label>
               <label class="switch">
                   <input type="checkbox" id="mobile-expand-under-checkbox-toggle">
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
  ensureThemeModalShape($modal);

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
      const previousTheme = loadTheme(layoutMode);
      const previousTruncateLongNames = previousTheme.truncateLongNames !== false;
      const previousMobileExpandPlacement = previousTheme.mobileExpandButtonUnderCheckbox === true;
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

      const nextTruncateLongNames = themeFromModal.truncateLongNames !== false;
      const nextMobileExpandPlacement = themeFromModal.mobileExpandButtonUnderCheckbox === true;
      if (
        isMobile() &&
        (previousTruncateLongNames !== nextTruncateLongNames ||
          previousMobileExpandPlacement !== nextMobileExpandPlacement)
      ) {
        void refreshCurrentTabForLayoutChange();
      }
    } catch (error) {
      console.error('角色世界书: 保存主题设置失败', error);
      alert('主题设置保存失败。背景图可能过大，请换用更小的图片或图片 URL。');
      fillThemeModal(loadTheme(layoutMode), getPcLayoutModeSetting());
    }
  };

  $modal.on('input', 'input[type="color"]', function () {
    syncColorHexInputFromPicker(parentDoc, this);
    handleSettingsChange();
  });
  $modal.on('input', '.theme-color-hex-input', function () {
    if (applyColorHexInput(parentDoc, this)) {
      handleSettingsChange();
    }
  });
  $modal.on('change', '.theme-color-hex-input', function () {
    if (applyColorHexInput(parentDoc, this, { allowShort: true })) {
      handleSettingsChange();
    }
  });
  $modal.on('input', 'input[type="range"]', handleSettingsChange);
  $modal.on('change', '#panel-background-image-url-input', handleSettingsChange);
  $modal.on('change', '#topbar-button-toggle', handleSettingsChange);
  $modal.on('change', '#truncate-long-names-toggle', handleSettingsChange);
  $modal.on('change', '#mobile-expand-under-checkbox-toggle', handleSettingsChange);
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

  $modal.on('click', '#browser-settings-export-button', function () {
    try {
      const payload = exportBrowserSettings({ redactSecrets: true, redactUploadedImages: true });
      const content = JSON.stringify(payload, null, 2);
      triggerDownload(buildBrowserSettingsBackupFilename(), content);
      notifyBrowserSettings(
        'success',
        `已导出 ${Object.keys(payload.items).length} 个浏览器设置，API Key 和上传背景图已脱敏。`,
      );
    } catch (error) {
      console.error('角色世界书: 导出浏览器设置失败', error);
      notifyBrowserSettings('error', `导出浏览器设置失败：${error.message}`);
    }
  });

  $modal.on('click', '#browser-settings-import-button', function () {
    $('#browser-settings-import-file-input', parentDoc).val('').trigger('click');
  });

  $modal.on('change', '#browser-settings-import-file-input', async function () {
    const file = this.files?.[0];
    if (!file) {
      return;
    }

    if (file.type && file.type !== 'application/json' && !/\.json$/i.test(file.name)) {
      notifyBrowserSettings('error', '请选择 JSON 格式的浏览器设置备份。');
      $(this).val('');
      return;
    }

    try {
      const content = await readTextFile(file);
      const result = importBrowserSettings(content);
      appliedThemeLayoutMode = await applyImportedBrowserSettingsToUi();

      const skippedParts = [];
      if (result.skippedUnknownCount > 0) {
        skippedParts.push(`跳过 ${result.skippedUnknownCount} 个未知项`);
      }
      if (result.skippedInvalidCount > 0) {
        skippedParts.push(`跳过 ${result.skippedInvalidCount} 个无效项`);
      }
      const suffix = skippedParts.length ? `，${skippedParts.join('，')}` : '';
      notifyBrowserSettings('success', `已导入 ${result.importedCount} 个浏览器设置${suffix}。`);
    } catch (error) {
      console.error('角色世界书: 导入浏览器设置失败', error);
      notifyBrowserSettings('error', `导入浏览器设置失败：${error.message}`);
    } finally {
      $(this).val('');
    }
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
