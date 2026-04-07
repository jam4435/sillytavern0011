import { getWorldbookSafe, updateWorldbookEntries } from '../api.js';
import { ensureNumericUID } from '../utils.js';

export const FOLDER_META_ENTRY_PREFIX = '__WI_META_FOLDERS__';

export function isFolderMetaEntry(entry) {
  const entryName = `${entry?.name || ''}`.trim();
  return entryName === FOLDER_META_ENTRY_PREFIX || entryName.startsWith(`${FOLDER_META_ENTRY_PREFIX}:`);
}

function normalizeFolderMeta(rawMeta) {
  const folderList = Array.isArray(rawMeta?.folders) ? rawMeta.folders : [];
  const folders = folderList
    .map(folder => {
      const id = `${folder?.id || ''}`.trim();
      const name = `${folder?.name || ''}`.trim();
      if (!id || !name) {
        return null;
      }
      return { id, name };
    })
    .filter(Boolean);

  const validFolderIds = new Set(folders.map(folder => folder.id));
  const rawMap = rawMeta?.entryFolderMap && typeof rawMeta.entryFolderMap === 'object' ? rawMeta.entryFolderMap : {};
  const entryFolderMap = {};

  Object.entries(rawMap).forEach(([uidKey, folderId]) => {
    const normalizedUid = ensureNumericUID(uidKey);
    const normalizedFolderId = `${folderId || ''}`.trim();
    if (!Number.isFinite(normalizedUid) || !normalizedFolderId || !validFolderIds.has(normalizedFolderId)) {
      return;
    }
    entryFolderMap[String(normalizedUid)] = normalizedFolderId;
  });

  return {
    version: rawMeta?.version || 1,
    folders,
    entryFolderMap,
  };
}

function createEmptyFolderMeta() {
  return {
    version: 1,
    folders: [],
    entryFolderMap: {},
  };
}

export function extractFolderMeta(entries) {
  const metaEntry = (entries || []).find(entry => isFolderMetaEntry(entry));
  if (!metaEntry) {
    return {
      metaEntry: null,
      meta: createEmptyFolderMeta(),
    };
  }

  try {
    const parsedMeta = JSON.parse(metaEntry.content || '{}');
    return {
      metaEntry,
      meta: normalizeFolderMeta(parsedMeta),
    };
  } catch (error) {
    console.warn('[FolderMeta] 文件夹元数据解析失败，已忽略该元数据条目', error);
    return {
      metaEntry,
      meta: createEmptyFolderMeta(),
    };
  }
}

export function getRenderableEntriesWithoutFolderMeta(entries) {
  return (entries || []).filter(entry => !isFolderMetaEntry(entry));
}

function buildFolderMetaEntry(entries, meta) {
  const maxUid = (entries || []).reduce((currentMax, entry) => Math.max(currentMax, ensureNumericUID(entry.uid) || 0), 0);
  const firstOrder =
    (entries || []).reduce((minOrder, entry) => {
      const entryOrder = _.get(entry, 'position.order', 0);
      return Math.min(minOrder, Number.isFinite(entryOrder) ? entryOrder : 0);
    }, 0) - 1;

  return {
    uid: maxUid + 1,
    name: FOLDER_META_ENTRY_PREFIX,
    content: JSON.stringify(meta),
    enabled: false,
    probability: 100,
    strategy: {
      type: 'selective',
      keys: [],
    },
    position: {
      type: 'after_character_definition',
      depth: 4,
      order: firstOrder,
    },
  };
}

function isFolderMetaEmpty(meta) {
  return (!meta?.folders || meta.folders.length === 0) && Object.keys(meta?.entryFolderMap || {}).length === 0;
}

function generateFolderId() {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getFolderByName(meta, folderName) {
  const normalizedName = `${folderName || ''}`.trim();
  return (meta?.folders || []).find(folder => folder.name === normalizedName) || null;
}

async function mutateFolderMeta(lorebookName, mutator, options = {}) {
  const result = await updateWorldbookEntries(
    lorebookName,
    entries => {
      const clonedEntries = _.cloneDeep(entries || []);
      const { metaEntry, meta } = extractFolderMeta(clonedEntries);
      const nextMeta = normalizeFolderMeta(mutator(_.cloneDeep(meta), { metaEntry, entries: clonedEntries }) || meta);
      const metaIndex = clonedEntries.findIndex(entry => isFolderMetaEntry(entry));

      if (isFolderMetaEmpty(nextMeta)) {
        if (metaIndex >= 0) {
          clonedEntries.splice(metaIndex, 1);
        }
        return clonedEntries;
      }

      if (metaIndex >= 0) {
        clonedEntries[metaIndex].name = FOLDER_META_ENTRY_PREFIX;
        clonedEntries[metaIndex].enabled = false;
        clonedEntries[metaIndex].strategy = { type: 'selective', keys: [] };
        clonedEntries[metaIndex].content = JSON.stringify(nextMeta);
      } else {
        clonedEntries.push(buildFolderMetaEntry(clonedEntries, nextMeta));
      }

      return clonedEntries;
    },
    {
      trackHistory: true,
      transactionType: options.transactionType || 'folder-meta',
      transactionMeta: {
        folderAction: options.folderAction || 'update',
      },
    },
  );

  return result;
}

export async function getFolderMetaForLorebook(lorebookName) {
  const result = await getWorldbookSafe(lorebookName);
  if (!result.success) {
    throw result.error || new Error('读取世界书失败');
  }
  return extractFolderMeta(result.data || []).meta;
}

export async function createFolder(lorebookName, folderName) {
  const normalizedName = `${folderName || ''}`.trim();
  if (!normalizedName) {
    throw new Error('文件夹名称不能为空');
  }

  return mutateFolderMeta(
    lorebookName,
    meta => {
      if (getFolderByName(meta, normalizedName)) {
        throw new Error('已存在同名文件夹');
      }
      meta.folders.push({
        id: generateFolderId(),
        name: normalizedName,
      });
      return meta;
    },
    {
      transactionType: 'folder-create',
      folderAction: 'create',
    },
  );
}

export async function renameFolder(lorebookName, folderId, folderName) {
  const normalizedName = `${folderName || ''}`.trim();
  if (!folderId) {
    throw new Error('未指定文件夹');
  }
  if (!normalizedName) {
    throw new Error('文件夹名称不能为空');
  }

  return mutateFolderMeta(
    lorebookName,
    meta => {
      const targetFolder = (meta.folders || []).find(folder => folder.id === folderId);
      if (!targetFolder) {
        throw new Error('文件夹不存在');
      }
      const conflictFolder = (meta.folders || []).find(folder => folder.name === normalizedName && folder.id !== folderId);
      if (conflictFolder) {
        throw new Error('已存在同名文件夹');
      }
      targetFolder.name = normalizedName;
      return meta;
    },
    {
      transactionType: 'folder-rename',
      folderAction: 'rename',
    },
  );
}

export async function deleteFolder(lorebookName, folderId) {
  if (!folderId) {
    throw new Error('未指定文件夹');
  }

  return mutateFolderMeta(
    lorebookName,
    meta => {
      meta.folders = (meta.folders || []).filter(folder => folder.id !== folderId);
      Object.keys(meta.entryFolderMap || {}).forEach(entryUid => {
        if (meta.entryFolderMap[entryUid] === folderId) {
          delete meta.entryFolderMap[entryUid];
        }
      });
      return meta;
    },
    {
      transactionType: 'folder-delete',
      folderAction: 'delete',
    },
  );
}

export async function assignEntriesToFolder(lorebookName, entryUids, folderName) {
  const normalizedName = `${folderName || ''}`.trim();
  const normalizedUids = (entryUids || []).map(uid => ensureNumericUID(uid)).filter(uid => Number.isFinite(uid));
  if (!normalizedName) {
    throw new Error('文件夹名称不能为空');
  }
  if (normalizedUids.length === 0) {
    throw new Error('未选择条目');
  }

  return mutateFolderMeta(
    lorebookName,
    meta => {
      let targetFolder = getFolderByName(meta, normalizedName);
      if (!targetFolder) {
        targetFolder = {
          id: generateFolderId(),
          name: normalizedName,
        };
        meta.folders.push(targetFolder);
      }
      normalizedUids.forEach(uid => {
        meta.entryFolderMap[String(uid)] = targetFolder.id;
      });
      return meta;
    },
    {
      transactionType: 'folder-assign',
      folderAction: 'assign',
    },
  );
}

export async function removeEntriesFromFolder(lorebookName, entryUids) {
  const normalizedUids = (entryUids || []).map(uid => ensureNumericUID(uid)).filter(uid => Number.isFinite(uid));
  if (normalizedUids.length === 0) {
    throw new Error('未选择条目');
  }

  return mutateFolderMeta(
    lorebookName,
    meta => {
      normalizedUids.forEach(uid => {
        delete meta.entryFolderMap[String(uid)];
      });
      return meta;
    },
    {
      transactionType: 'folder-unassign',
      folderAction: 'unassign',
    },
  );
}
