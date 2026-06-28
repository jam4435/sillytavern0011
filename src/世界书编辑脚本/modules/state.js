// This module holds the shared state for the script.

import { DEBUG_MODE } from './config.js';

// ============ 异步锁机制 ============
// 带超时的锁，防止操作失败后永久阻塞

/**
 * 创建带超时的异步锁
 * @param {number} timeoutMs - 超时时间（毫秒），默认10秒
 */
function createAsyncLock(timeoutMs = 10000) {
  let locked = false;
  let lockTime = 0;

  return {
    acquire() {
      // 超时自动释放，防止死锁
      if (locked && Date.now() - lockTime > timeoutMs) {
        console.warn('[AsyncLock] 锁超时自动释放');
        locked = false;
      }
      if (locked) return false;
      locked = true;
      lockTime = Date.now();
      return true;
    },
    release() {
      locked = false;
    },
    isLocked() {
      return locked && Date.now() - lockTime <= timeoutMs;
    },
  };
}

// 替换世界书操作的锁（用于阻止并发的 updateBoundLorebooksList 调用）
export const replacingLorebookLock = createAsyncLock(10000);

// 兼容旧代码的接口
export let isReplacingCharacterLorebook = false;

export function setIsReplacingCharacterLorebook(value) {
  isReplacingCharacterLorebook = value;
  if (value) {
    replacingLorebookLock.acquire();
  } else {
    replacingLorebookLock.release();
  }
}

// e.g., { 'lorebookName': { by: 'uid', dir: 'desc' } }
export let lorebookSorts = {};
export let allEntriesData = {};
export let virtualScrollers = {};

const TAB_KEYS = ['character', 'global'];
function normalizeTabKey(tabKeyOrGlobal) {
  if (tabKeyOrGlobal === 'character' || tabKeyOrGlobal === 'global') {
    return tabKeyOrGlobal;
  }
  return tabKeyOrGlobal ? 'global' : 'character';
}

// Planned state containers for upcoming features.
export const detailEntryState = {
  character: {
    context: null,
    activeLorebook: null,
    recentEntries: {},
  },
  global: {
    context: null,
    activeLorebook: null,
    recentEntries: {},
  },
};
export const folderSessionState = {};
export let compareSessionState = null;
export const mutationHistoryState = {
  lastTransactions: {},
  undoStackByLorebook: {},
  redoStackByLorebook: {},
};
export const layoutModeState = {
  pc: 'auto',
};

// Filter state management: { lorebookName: { filterType: true } }
export const activeFilters = {};

// Import activation tracker for filter functionality
import { isEntryActive } from './features/activationTracker.js';

// Selection state management: { lorebookName: Set<uid> }
export const selectedEntries = {};

// Remembers that the current selection was created by the top-level select-all control.
// This is deliberately separate from selectedEntries so batch consumers can keep using Set<uid>.
export const selectAllMemory = {};

// Search query state: { lorebookName: normalizedQuery }
// Results are derived from the latest entries and filters to avoid stale debounced snapshots.
export const entrySearchQueries = {};

// Expanded state management: { lorebookName: Set<uid> }
export let expandedEntries = {};

export function setLorebookSorts(newSorts) {
  lorebookSorts = newSorts;
}

export function setAllEntriesData(newData) {
  allEntriesData = newData;
}

export function setVirtualScrollers(newScrollers) {
  virtualScrollers = newScrollers;
}

export function setDetailEntry(tabKeyOrGlobal, detailContext) {
  const tabKey = normalizeTabKey(tabKeyOrGlobal);
  const nextContext = detailContext ? { ...detailContext } : null;
  detailEntryState[tabKey].context = nextContext;

  if (nextContext?.lorebookName) {
    detailEntryState[tabKey].activeLorebook = nextContext.lorebookName;
    detailEntryState[tabKey].recentEntries[nextContext.lorebookName] = nextContext.entryUid ?? null;
  }
}

export function getDetailEntry(tabKeyOrGlobal) {
  const tabKey = normalizeTabKey(tabKeyOrGlobal);
  return detailEntryState[tabKey].context ? { ...detailEntryState[tabKey].context } : null;
}

export function clearDetailEntry(tabKeyOrGlobal) {
  const tabKey = normalizeTabKey(tabKeyOrGlobal);
  detailEntryState[tabKey].context = null;
}

export function setActiveLorebookGroup(tabKeyOrGlobal, lorebookName) {
  const tabKey = normalizeTabKey(tabKeyOrGlobal);
  detailEntryState[tabKey].activeLorebook = lorebookName || null;
}

export function getActiveLorebookGroup(tabKeyOrGlobal) {
  const tabKey = normalizeTabKey(tabKeyOrGlobal);
  return detailEntryState[tabKey].activeLorebook || null;
}

export function getRememberedDetailEntry(tabKeyOrGlobal, lorebookName) {
  const tabKey = normalizeTabKey(tabKeyOrGlobal);
  if (!lorebookName) {
    return null;
  }
  return detailEntryState[tabKey].recentEntries[lorebookName] ?? null;
}

export function clearDetailSessionState() {
  TAB_KEYS.forEach(tabKey => {
    detailEntryState[tabKey].context = null;
    detailEntryState[tabKey].activeLorebook = null;
    detailEntryState[tabKey].recentEntries = {};
  });
}

export function isEntryCurrentDetail(lorebookName, uid, isGlobal = false) {
  const context = getDetailEntry(isGlobal);
  return !!context && context.lorebookName === lorebookName && context.entryUid === uid;
}

export function setFolderSession(lorebookName, sessionState) {
  folderSessionState[lorebookName] = sessionState;
}

export function getFolderSession(lorebookName) {
  return folderSessionState[lorebookName] || null;
}

export function clearFolderSession(lorebookName) {
  delete folderSessionState[lorebookName];
}

function ensureFolderSessionState(lorebookName) {
  if (!folderSessionState[lorebookName] || typeof folderSessionState[lorebookName] !== 'object') {
    folderSessionState[lorebookName] = {};
  }
  if (!folderSessionState[lorebookName].collapsedFolders) {
    folderSessionState[lorebookName].collapsedFolders = {};
  }
  if (!folderSessionState[lorebookName].meta) {
    folderSessionState[lorebookName].meta = null;
  }
  return folderSessionState[lorebookName];
}

export function getFolderMetaSession(lorebookName) {
  return folderSessionState[lorebookName]?.meta || null;
}

export function setFolderMetaSession(lorebookName, meta) {
  const session = ensureFolderSessionState(lorebookName);
  session.meta = meta ? _.cloneDeep(meta) : null;
}

export function getFolderCollapsedState(lorebookName, folderId) {
  if (!lorebookName || !folderId) {
    return false;
  }
  return folderSessionState[lorebookName]?.collapsedFolders?.[folderId] ?? true;
}

export function setFolderCollapsedState(lorebookName, folderId, collapsed) {
  if (!lorebookName || !folderId) {
    return false;
  }
  const session = ensureFolderSessionState(lorebookName);
  session.collapsedFolders[folderId] = !!collapsed;
  return session.collapsedFolders[folderId];
}

export function toggleFolderCollapsedState(lorebookName, folderId) {
  const nextCollapsed = !getFolderCollapsedState(lorebookName, folderId);
  setFolderCollapsedState(lorebookName, folderId, nextCollapsed);
  return nextCollapsed;
}

export function setCompareSession(sessionState) {
  compareSessionState = sessionState ? _.cloneDeep(sessionState) : null;
}

export function getCompareSession() {
  return compareSessionState ? _.cloneDeep(compareSessionState) : null;
}

export function setLayoutMode(mode) {
  layoutModeState.pc = mode || 'auto';
}

export function getLayoutMode() {
  return layoutModeState.pc || 'auto';
}

export function setLastMutationTransaction(lorebookName, transaction) {
  mutationHistoryState.lastTransactions[lorebookName] = transaction ? _.cloneDeep(transaction) : null;
}

export function getLastMutationTransaction(lorebookName) {
  return mutationHistoryState.lastTransactions[lorebookName]
    ? _.cloneDeep(mutationHistoryState.lastTransactions[lorebookName])
    : null;
}

export function clearLastMutationTransaction(lorebookName) {
  delete mutationHistoryState.lastTransactions[lorebookName];
}

/**
 * Initialize or replace selection state for a lorebook
 * @param {string} lorebookName - The name of the lorebook
 * @param {number[]} uids - Array of numeric UIDs to select
 */
export function setSelectedEntries(lorebookName, uids, { preserveSelectAllMemory = false } = {}) {
  selectedEntries[lorebookName] = new Set(uids);
  if (selectedEntries[lorebookName].size === 0 || !preserveSelectAllMemory) {
    delete selectAllMemory[lorebookName];
  }
}

export function setSelectAllMemory(lorebookName, remembered) {
  if (remembered && getSelectedEntriesCount(lorebookName) > 0) {
    selectAllMemory[lorebookName] = true;
  } else {
    delete selectAllMemory[lorebookName];
  }
}

export function isSelectAllRemembered(lorebookName) {
  return selectAllMemory[lorebookName] === true && getSelectedEntriesCount(lorebookName) > 0;
}

/**
 * Toggle a single entry's selection state
 * @param {string} lorebookName - The name of the lorebook
 * @param {number} uid - The numeric UID of the entry
 * @param {boolean} selected - Whether the entry should be selected
 */
export function toggleEntrySelection(lorebookName, uid, selected) {
  if (!selectedEntries[lorebookName]) {
    selectedEntries[lorebookName] = new Set();
  }
  if (selected) {
    selectedEntries[lorebookName].add(uid);
  } else {
    selectedEntries[lorebookName].delete(uid);
  }
  delete selectAllMemory[lorebookName];
}

/**
 * Check if an entry is selected
 * @param {string} lorebookName - The name of the lorebook
 * @param {number} uid - The numeric UID of the entry
 * @returns {boolean} True if the entry is selected
 */
export function isEntrySelected(lorebookName, uid) {
  return selectedEntries[lorebookName]?.has(uid) || false;
}

/**
 * Get all selected entry UIDs for a lorebook
 * @param {string} lorebookName - The name of the lorebook
 * @returns {number[]} Array of selected numeric UIDs
 */
export function getSelectedEntries(lorebookName) {
  return Array.from(selectedEntries[lorebookName] || []);
}

/**
 * Get count of selected entries for a lorebook
 * @param {string} lorebookName - The name of the lorebook
 * @returns {number} Count of selected entries
 */
export function getSelectedEntriesCount(lorebookName) {
  return selectedEntries[lorebookName]?.size || 0;
}

/**
 * Clear selection state for a lorebook
 * @param {string} lorebookName - The name of the lorebook
 */
export function clearSelectedEntries(lorebookName) {
  if (selectedEntries[lorebookName]) {
    selectedEntries[lorebookName].clear();
  }
  delete selectAllMemory[lorebookName];
}

/**
 * Toggle a single entry's expanded state
 * @param {string} lorebookName - The name of the lorebook
 * @param {number} uid - The numeric UID of the entry
 * @param {boolean} expanded - Whether the entry should be expanded
 */
export function toggleEntryExpanded(lorebookName, uid, expanded) {
  if (DEBUG_MODE) {
    console.log(`[展开调试] toggleEntryExpanded`, { lorebookName, uid, expanded });
  }

  if (!expandedEntries[lorebookName]) {
    expandedEntries[lorebookName] = new Set();
  }
  if (expanded) {
    expandedEntries[lorebookName].add(uid);
  } else {
    expandedEntries[lorebookName].delete(uid);
  }

  if (DEBUG_MODE) {
    console.log(`[展开调试] 新状态:`, Array.from(expandedEntries[lorebookName]));
  }
}

/**
 * Check if an entry is expanded
 * @param {string} lorebookName - The name of the lorebook
 * @param {number} uid - The numeric UID of the entry
 * @returns {boolean} True if the entry is expanded
 */
export function isEntryExpanded(lorebookName, uid) {
  const result = expandedEntries[lorebookName]?.has(uid) || false;
  // 【调试】仅在查询展开状态时记录（减少日志量，只在需要时启用）
  // console.log(`[展开调试] isEntryExpanded: ${lorebookName}/${uid} => ${result}`);
  return result;
}

/**
 * Clear expanded state for a lorebook
 * @param {string} lorebookName - The name of the lorebook
 */
export function clearExpandedEntries(lorebookName) {
  if (expandedEntries[lorebookName]) {
    expandedEntries[lorebookName].clear();
  }
}

/**
 * Clear expanded state for ALL lorebooks.
 * Used when closing the panel to prevent state pollution.
 */
export function clearAllExpandedEntries() {
  expandedEntries = {};
}

/**
 * Get active filters for a lorebook
 * @param {string} lorebookName - The name of the lorebook
 * @returns {Object} Active filters object
 */
export function getActiveFilters(lorebookName) {
  return activeFilters[lorebookName] || {};
}

/**
 * Set or remove a filter for a lorebook
 * @param {string} lorebookName - The name of the lorebook
 * @param {string} filterType - The type of filter
 * @param {boolean} value - Whether to enable or disable the filter
 */
export function setActiveFilter(lorebookName, filterType, value) {
  if (!activeFilters[lorebookName]) {
    activeFilters[lorebookName] = {};
  }
  if (value) {
    activeFilters[lorebookName][filterType] = true;
  } else {
    delete activeFilters[lorebookName][filterType];
  }
  // Handle mutually exclusive filters
  if (value) {
    if (filterType === 'isEnabled') delete activeFilters[lorebookName]['isNotEnabled'];
    if (filterType === 'isNotEnabled') delete activeFilters[lorebookName]['isEnabled'];
    if (filterType === 'isActivated') delete activeFilters[lorebookName]['isNotActivated'];
    if (filterType === 'isNotActivated') delete activeFilters[lorebookName]['isActivated'];
    if (filterType === 'isConstant') delete activeFilters[lorebookName]['isSelective'];
    if (filterType === 'isSelective') delete activeFilters[lorebookName]['isConstant'];
  }
  if (DEBUG_MODE) {
    console.log('  - 更新后的 activeFilters:', JSON.parse(JSON.stringify(activeFilters)));
  }
}

/**
 * Get filtered entries for a lorebook based on active filters
 * @param {string} lorebookName - The name of the lorebook
 * @returns {Array} Filtered entries array
 */
export function getFilteredEntries(lorebookName) {
  const allEntries = allEntriesData[lorebookName] || [];
  const filters = getActiveFilters(lorebookName);

  if (DEBUG_MODE) {
    console.log(`[Filter] Lorebook: ${lorebookName}, 总条目: ${allEntries.length}, 筛选器:`, filters);
  }

  if (Object.keys(filters).length === 0) {
    return allEntries;
  }
  const filtered = allEntries.filter(entry => {
    for (const filterType in filters) {
      switch (filterType) {
        case 'isEnabled':
          // 【修复1】使用正确的属性名 `entry.enabled`
          if (!entry.enabled) return false;
          break;
        case 'isNotEnabled':
          // 【修复1】使用正确的属性名 `entry.enabled`
          if (entry.enabled) return false;
          break;
        case 'isActivated':
          // 【修复2】修正 isEntryActive 的参数顺序
          if (!isEntryActive(entry.uid, lorebookName)) return false;
          break;
        case 'isNotActivated':
          // 【修复2】修正 isEntryActive 的参数顺序
          if (isEntryActive(entry.uid, lorebookName)) return false;
          break;
        case 'isConstant':
          if (entry.strategy?.type !== 'constant') return false;
          break;
        case 'isSelective':
          if (entry.strategy?.type !== 'selective') return false;
          break;
      }
    }
    return true;
  });
  if (DEBUG_MODE) {
    console.log(`[Filter] 筛选后剩余 ${filtered.length} 条`);
  }
  return filtered;
}

/**
 * Store the active search query synchronously. Rendering may remain debounced,
 * but selection always reads this latest value.
 * @param {string} lorebookName - The name of the lorebook
 * @param {string} query - The current search query
 */
export function setEntrySearchQuery(lorebookName, query) {
  const normalizedQuery = `${query || ''}`.trim().toLowerCase();
  if (normalizedQuery) {
    entrySearchQueries[lorebookName] = normalizedQuery;
  } else {
    delete entrySearchQueries[lorebookName];
  }
}

export function getEntrySearchQuery(lorebookName) {
  return entrySearchQueries[lorebookName] || '';
}

export function hasActiveEntrySearch(lorebookName) {
  return !!getEntrySearchQuery(lorebookName);
}

/**
 * Get the entries targeted by the top-level select-all control.
 * Active filters are applied first, followed by the current search query.
 */
export function getSelectableEntries(lorebookName) {
  const filteredEntries = getFilteredEntries(lorebookName);
  const searchQuery = getEntrySearchQuery(lorebookName);
  if (!searchQuery) {
    return filteredEntries;
  }

  return filteredEntries.filter(
    entry =>
      (entry.name || '').toLowerCase().includes(searchQuery) ||
      (entry.content || '').toLowerCase().includes(searchQuery) ||
      (Array.isArray(entry.strategy?.keys) && entry.strategy.keys.join(',').toLowerCase().includes(searchQuery)),
  );
}

/**
 * Calculate the shared state and next action for every top-level select-all control.
 */
export function getSelectAllControlState(lorebookName) {
  const selectableEntries = getSelectableEntries(lorebookName);
  const selectedUids = new Set(getSelectedEntries(lorebookName));
  const selectedInScope = selectableEntries.filter(entry => selectedUids.has(Number(entry.uid))).length;
  const selectedCount = selectedUids.size;
  const remembered = isSelectAllRemembered(lorebookName);

  if (remembered) {
    return {
      checked: true,
      indeterminate: false,
      disabled: false,
      nextAction: 'clear',
      selectedCount,
      selectedInScope,
      selectableCount: selectableEntries.length,
    };
  }

  if (selectableEntries.length === 0) {
    return {
      checked: false,
      indeterminate: selectedCount > 0,
      disabled: selectedCount === 0,
      nextAction: selectedCount > 0 ? 'clear' : 'none',
      selectedCount,
      selectedInScope,
      selectableCount: 0,
    };
  }

  if (selectedInScope === selectableEntries.length) {
    return {
      checked: true,
      indeterminate: false,
      disabled: false,
      nextAction: 'clear',
      selectedCount,
      selectedInScope,
      selectableCount: selectableEntries.length,
    };
  }

  return {
    checked: false,
    indeterminate: selectedCount > 0,
    disabled: false,
    nextAction: 'select',
    selectedCount,
    selectedInScope,
    selectableCount: selectableEntries.length,
  };
}

/**
 * Clear filtered entries for a lorebook
 * @param {string} lorebookName - The name of the lorebook
 */
export function clearFilteredEntries(lorebookName) {
  delete entrySearchQueries[lorebookName];
}

/**
 * Clear all filtered entries for all lorebooks
 */
export function clearAllFilteredEntries() {
  Object.keys(entrySearchQueries).forEach(key => delete entrySearchQueries[key]);
}

/**
 * Clear all active filters for all lorebooks.
 * Used when closing the panel to prevent state pollution.
 */
export function clearAllActiveFilters() {
  // 直接将 activeFilters 重置为空对象
  Object.keys(activeFilters).forEach(key => delete activeFilters[key]);
}
