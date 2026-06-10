import { getWorldbookSafe, updateWorldbookEntries } from '../api.js';
import { ENTRY_TOGGLE_PRESETS_KEY } from '../config.js';
import { getRenderableEntriesWithoutFolderMeta, isFolderMetaEntry } from './folderMeta.js';
import { ensureNumericUID, errorCatched, getLocalStorageItem, setLocalStorageItem } from '../utils.js';

function normalizePresetName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLorebookName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeUidList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value
    .map(uid => ensureNumericUID(uid))
    .filter(uid => Number.isFinite(uid) && uid >= 0)
    .filter(uid => {
      if (seen.has(uid)) {
        return false;
      }
      seen.add(uid);
      return true;
    });
}

function sanitizePresetMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([lorebookName, presets]) => {
        const normalizedLorebookName = normalizeLorebookName(lorebookName);
        if (!normalizedLorebookName || !presets || typeof presets !== 'object' || Array.isArray(presets)) {
          return null;
        }

        const sanitizedPresets = Object.fromEntries(
          Object.entries(presets)
            .map(([presetName, preset]) => {
              const normalizedPresetName = normalizePresetName(presetName || preset?.name);
              if (!normalizedPresetName || !preset || typeof preset !== 'object' || Array.isArray(preset)) {
                return null;
              }

              const uids = sanitizeUidList(preset.uids);
              const uidSet = new Set(uids);
              const enabled = sanitizeUidList(preset.enabled).filter(uid => uidSet.has(uid));
              const updatedAt = Number.isFinite(Number(preset.updatedAt)) ? Number(preset.updatedAt) : 0;

              return [
                normalizedPresetName,
                {
                  name: normalizedPresetName,
                  uids,
                  enabled,
                  updatedAt,
                },
              ];
            })
            .filter(Boolean),
        );

        return [normalizedLorebookName, sanitizedPresets];
      })
      .filter(Boolean),
  );
}

export function getEntryTogglePresetMap() {
  try {
    const raw = getLocalStorageItem(ENTRY_TOGGLE_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const sanitized = sanitizePresetMap(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      setLocalStorageItem(ENTRY_TOGGLE_PRESETS_KEY, JSON.stringify(sanitized));
      console.warn('Sanitized invalid entry toggle presets from localStorage.');
    }
    return sanitized;
  } catch (error) {
    console.error('Error reading entry toggle presets from localStorage', error);
    return {};
  }
}

export function saveEntryTogglePresetMap(presets) {
  try {
    setLocalStorageItem(ENTRY_TOGGLE_PRESETS_KEY, JSON.stringify(sanitizePresetMap(presets)));
    return true;
  } catch (error) {
    console.error('Error saving entry toggle presets to localStorage', error);
    return false;
  }
}

export function getEntryTogglePresetsForLorebook(lorebookName) {
  const normalizedLorebookName = normalizeLorebookName(lorebookName);
  if (!normalizedLorebookName) {
    return {};
  }
  return getEntryTogglePresetMap()[normalizedLorebookName] || {};
}

export function getEntryTogglePresetNames(lorebookName) {
  return Object.keys(getEntryTogglePresetsForLorebook(lorebookName)).sort((left, right) =>
    left.localeCompare(right, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }),
  );
}

export const createEntryTogglePresetFromCurrentState = errorCatched(async (lorebookName, presetName) => {
  const normalizedLorebookName = normalizeLorebookName(lorebookName);
  const normalizedPresetName = normalizePresetName(presetName);
  if (!normalizedLorebookName || !normalizedPresetName) {
    return false;
  }

  const result = await getWorldbookSafe(normalizedLorebookName);
  if (!result.success) {
    throw result.error || new Error('读取世界书失败');
  }

  const entries = getRenderableEntriesWithoutFolderMeta(result.data || []);
  const uids = entries.map(entry => ensureNumericUID(entry.uid)).filter(uid => Number.isFinite(uid) && uid >= 0);
  const enabled = entries
    .filter(entry => entry.enabled === true)
    .map(entry => ensureNumericUID(entry.uid))
    .filter(uid => Number.isFinite(uid) && uid >= 0);

  const presets = getEntryTogglePresetMap();
  presets[normalizedLorebookName] = {
    ...(presets[normalizedLorebookName] || {}),
    [normalizedPresetName]: {
      name: normalizedPresetName,
      uids: sanitizeUidList(uids),
      enabled: sanitizeUidList(enabled),
      updatedAt: Date.now(),
    },
  };

  return saveEntryTogglePresetMap(presets);
}, 'createEntryTogglePresetFromCurrentState');

export const applyEntryTogglePreset = errorCatched(async (lorebookName, presetName) => {
  const normalizedLorebookName = normalizeLorebookName(lorebookName);
  const normalizedPresetName = normalizePresetName(presetName);
  const preset = getEntryTogglePresetsForLorebook(normalizedLorebookName)[normalizedPresetName];
  if (!preset) {
    throw new Error(`未找到条目组预设：${normalizedPresetName}`);
  }

  const recordedUidSet = new Set(sanitizeUidList(preset.uids));
  const enabledUidSet = new Set(sanitizeUidList(preset.enabled).filter(uid => recordedUidSet.has(uid)));
  let modifiedCount = 0;

  const result = await updateWorldbookEntries(
    normalizedLorebookName,
    entries => {
      let hasChanges = false;
      const nextEntries = (entries || []).map(entry => {
        if (isFolderMetaEntry(entry)) {
          return entry;
        }

        const uid = ensureNumericUID(entry.uid);
        if (!recordedUidSet.has(uid)) {
          return entry;
        }

        const nextEnabled = enabledUidSet.has(uid);
        if (entry.enabled === nextEnabled) {
          return entry;
        }

        hasChanges = true;
        modifiedCount++;
        return {
          ...entry,
          enabled: nextEnabled,
        };
      });

      return hasChanges ? nextEntries : entries;
    },
    {
      trackHistory: true,
      transactionType: 'entry-toggle-preset',
      transactionMeta: {
        presetName: normalizedPresetName,
        recordedCount: recordedUidSet.size,
        enabledCount: enabledUidSet.size,
      },
    },
  );

  return {
    ...result,
    modifiedCount,
  };
}, 'applyEntryTogglePreset');

export const deleteEntryTogglePreset = errorCatched(async (lorebookName, presetName) => {
  const normalizedLorebookName = normalizeLorebookName(lorebookName);
  const normalizedPresetName = normalizePresetName(presetName);
  if (!normalizedLorebookName || !normalizedPresetName) {
    return false;
  }

  const presets = getEntryTogglePresetMap();
  if (!presets[normalizedLorebookName]?.[normalizedPresetName]) {
    return false;
  }

  delete presets[normalizedLorebookName][normalizedPresetName];
  if (Object.keys(presets[normalizedLorebookName]).length === 0) {
    delete presets[normalizedLorebookName];
  }

  return saveEntryTogglePresetMap(presets);
}, 'deleteEntryTogglePreset');
