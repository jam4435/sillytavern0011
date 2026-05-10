import {
  GLOBAL_WORLDBOOK_PRESETS_KEY,
  HIGHLIGHT_ACTIVE_ENTRIES_KEY,
  LOREBOOK_SORT_PREF_KEY,
  LOREBOOK_THEME_KEY,
  LOREBOOK_UI_SORT_KEY,
  PINNED_ENTRIES_KEY,
  PINNED_GLOBAL_WORLDBOOKS_KEY,
} from '../config.js';
import { getLocalStorageItem, setLocalStorageItem } from '../utils.js';

export const BROWSER_SETTINGS_BACKUP_SCHEMA = 'enhanced-lorebook-browser-settings';
export const BROWSER_SETTINGS_BACKUP_VERSION = 1;

const AI_WORKSPACE_SETTINGS_KEY = 'lorebook-ai-workspace-settings';
const DEFAULT_COPY_CONFLICT_STRATEGY_KEY = 'lorebook-default-copy-conflict-strategy';
const FLOATING_BUBBLE_POSITION_DESKTOP_KEY = 'lorebook-floating-bubble-position-desktop';
const FLOATING_BUBBLE_POSITION_MOBILE_KEY = 'lorebook-floating-bubble-position-mobile';
const FULLSCREEN_MODE_KEY = 'lorebook-fullscreen-mode';
const PC_LAYOUT_MODE_KEY = 'lorebook-pc-layout-mode';
const PC_MASTER_DETAIL_SPLIT_KEY = 'lorebook-pc-master-detail-split';
const SHOW_SEARCH_BAR_KEY = 'lorebook-show-search-bar';

export const BROWSER_SETTINGS_STORAGE_KEYS = Object.freeze([
  LOREBOOK_THEME_KEY,
  HIGHLIGHT_ACTIVE_ENTRIES_KEY,
  SHOW_SEARCH_BAR_KEY,
  FULLSCREEN_MODE_KEY,
  PC_LAYOUT_MODE_KEY,
  PC_MASTER_DETAIL_SPLIT_KEY,
  FLOATING_BUBBLE_POSITION_DESKTOP_KEY,
  FLOATING_BUBBLE_POSITION_MOBILE_KEY,
  DEFAULT_COPY_CONFLICT_STRATEGY_KEY,
  AI_WORKSPACE_SETTINGS_KEY,
  PINNED_ENTRIES_KEY,
  PINNED_GLOBAL_WORLDBOOKS_KEY,
  GLOBAL_WORLDBOOK_PRESETS_KEY,
  LOREBOOK_SORT_PREF_KEY,
  LOREBOOK_UI_SORT_KEY,
]);

const BROWSER_SETTINGS_STORAGE_KEY_SET = new Set(BROWSER_SETTINGS_STORAGE_KEYS);

function redactCustomApiKeys(value) {
  if (Array.isArray(value)) {
    return value.map(redactCustomApiKeys);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === 'customApi' && item && typeof item === 'object' && !Array.isArray(item)) {
        return [
          key,
          {
            ...redactCustomApiKeys(item),
            key: '',
          },
        ];
      }

      return [key, redactCustomApiKeys(item)];
    }),
  );
}

function redactAiWorkspaceSettings(rawValue) {
  try {
    return JSON.stringify(redactCustomApiKeys(JSON.parse(rawValue)));
  } catch (error) {
    console.warn('角色世界书: AI 工作区设置解析失败，导出时已跳过该设置。', error);
    return null;
  }
}

function normalizePayload(payload) {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (error) {
      throw new Error(`导入文件不是有效 JSON：${error.message}`);
    }
  }

  return payload;
}

export function exportBrowserSettings({ redactSecrets = true } = {}) {
  const items = {};

  for (const key of BROWSER_SETTINGS_STORAGE_KEYS) {
    const value = getLocalStorageItem(key);
    if (value === null) {
      continue;
    }

    if (key === AI_WORKSPACE_SETTINGS_KEY && redactSecrets) {
      const redactedValue = redactAiWorkspaceSettings(value);
      if (redactedValue === null) {
        continue;
      }
      items[key] = redactedValue;
      continue;
    }

    items[key] = value;
  }

  return {
    schema: BROWSER_SETTINGS_BACKUP_SCHEMA,
    version: BROWSER_SETTINGS_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    redactions: {
      aiWorkspaceCustomApiKey: redactSecrets,
    },
    items,
  };
}

export function importBrowserSettings(payload) {
  const parsedPayload = normalizePayload(payload);

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new Error('导入文件格式无效。');
  }

  if (parsedPayload.schema !== BROWSER_SETTINGS_BACKUP_SCHEMA) {
    throw new Error('导入文件不是世界书编辑助手的浏览器设置备份。');
  }

  if (parsedPayload.version !== BROWSER_SETTINGS_BACKUP_VERSION) {
    throw new Error(`不支持的浏览器设置备份版本：${parsedPayload.version}`);
  }

  if (!parsedPayload.items || typeof parsedPayload.items !== 'object' || Array.isArray(parsedPayload.items)) {
    throw new Error('导入文件缺少有效的设置项。');
  }

  const importedKeys = [];
  let skippedInvalidCount = 0;
  let skippedUnknownCount = 0;

  for (const [key, value] of Object.entries(parsedPayload.items)) {
    if (!BROWSER_SETTINGS_STORAGE_KEY_SET.has(key)) {
      skippedUnknownCount += 1;
      continue;
    }

    if (typeof value !== 'string') {
      skippedInvalidCount += 1;
      continue;
    }

    setLocalStorageItem(key, value);
    importedKeys.push(key);
  }

  return {
    importedCount: importedKeys.length,
    importedKeys,
    skippedInvalidCount,
    skippedUnknownCount,
  };
}
