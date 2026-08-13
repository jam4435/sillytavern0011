import { LOREBOOK_ENTRY_CLASS, LOREBOOK_SORT_PREF_KEY, LOREBOOK_UI_SORT_KEY } from '../config.js';
import { lorebookSorts, setLorebookSorts } from '../state.js';
import { ensureNumericUID, getLocalStorageItem, setLocalStorageItem } from '../utils.js';
import { POSITION_TYPE_TO_NATIVE, normalizePositionRole } from '../position.js';

// --- UI Drag-and-Drop Sorting ---

export function enableDragSort($container, clusterize = null) {
  // 使用 jQuery UI sortable 实现拖拽
  if (!$container.hasClass('ui-sortable')) {
    $container.sortable({
      handle: '.drag-handle', // 只能通过拖动手柄触发
      axis: 'y', // 只允许垂直方向拖动
      containment: 'parent', // 限制在父容器内
      tolerance: 'pointer', // 鼠标指针碰到即可触发交换
      update: function (event, ui) {
        // 拖动结束后的回调
        const $item = ui.item;

        // 获取当前世界书名称
        const lorebookName = $item.attr('data-entry-lorebook');

        // 收集所有条目的 UID 顺序
        const uiSortOrder = $container
          .find(`.${LOREBOOK_ENTRY_CLASS}`)
          .map(function () {
            return $(this).attr('data-entry-uid');
          })
          .get();

        if (uiSortOrder.length > 0) {
          // 保存到 localStorage
          saveUISort(lorebookName, uiSortOrder);

          // 如果使用虚拟滚动，需要同步更新数据
          if (clusterize) {
            syncVirtualScrollData(lorebookName, uiSortOrder, clusterize);
          }
        }
      },
    });
  }
}

// 同步虚拟滚动数据（当使用 jQuery UI Sortable 时）
async function syncVirtualScrollData(lorebookName, sortedUids, clusterize) {
  console.log('[拖拽] 开始同步虚拟滚动数据...', { lorebookName, sortedUids });

  try {
    // 从 allEntriesData 获取当前数据
    const { allEntriesData, setAllEntriesData } = await import('../state.js');
    const entries = allEntriesData[lorebookName];

    if (!entries) {
      console.error('[拖拽] 找不到世界书数据:', lorebookName);
      return;
    }

    // 创建 UID -> Entry 的映射
    const entryMap = new Map();
    entries.forEach(entry => {
      entryMap.set(String(ensureNumericUID(entry.uid)), entry);
    });

    // 按新的 UID 顺序重新排列条目
    const sortedEntries = [];
    sortedUids.forEach(uid => {
      const entry = entryMap.get(String(uid));
      if (entry) {
        sortedEntries.push(entry);
      }
    });

    console.log('[拖拽] 重新排列后的条目数:', sortedEntries.length);

    // 更新状态
    const currentAllEntries = { ...allEntriesData };
    currentAllEntries[lorebookName] = sortedEntries;
    setAllEntriesData(currentAllEntries);

    console.log('[拖拽] 状态已更新');

    // 同步新的顺序到酒馆原生世界书
    await syncOrderToNativeWorldbook(lorebookName, sortedEntries);

    // 重新渲染 Clusterize
    const { createEntryHtml } = await import('../ui/entry.js');
    const newRows = sortedEntries.map(entry => `<li>${createEntryHtml(entry, lorebookName)}</li>`);
    clusterize.update(newRows);

    console.log('[拖拽] Clusterize 已更新');
  } catch (error) {
    console.error('[拖拽] syncVirtualScrollData 错误:', error);
  }
}

// 将新的排序顺序同步到酒馆原生世界书
async function syncOrderToNativeWorldbook(lorebookName, sortedEntries) {
  try {
    const { updateWorldbookEntries } = await import('../api.js');

    console.log('[拖拽] 开始同步排序到原生世界书...');

    const result = await updateWorldbookEntries(lorebookName, entries => {
      // 创建 UID 到新 order 的映射
      const uidToOrderMap = new Map();
      sortedEntries.forEach((entry, index) => {
        uidToOrderMap.set(ensureNumericUID(entry.uid), index);
      });

      // 更新每个条目的 position.order
      const updatedEntries = entries.map(entry => {
        const numericUid = ensureNumericUID(entry.uid);
        const newOrder = uidToOrderMap.get(numericUid);

        if (newOrder !== undefined) {
          // 深拷贝条目并更新 order
          const updatedEntry = _.cloneDeep(entry);
          _.set(updatedEntry, 'position.order', newOrder);
          _.set(updatedEntry, 'order', newOrder); // 兼容旧字段
          return updatedEntry;
        }

        return entry;
      });

      return updatedEntries;
    });

    if (!result.success) {
      throw result.error || new Error('拖拽排序同步失败');
    }

    console.log('[拖拽] 排序已成功同步到原生世界书');
  } catch (error) {
    console.error('[拖拽] 同步排序到原生世界书失败:', error);
  }
}

// 保存 UI 排序顺序到 localStorage
export function saveUISort(lorebookName, sortedIds) {
  try {
    // 以世界书名为键保存顺序
    const allSortData = JSON.parse(getLocalStorageItem(LOREBOOK_UI_SORT_KEY) || '{}');
    allSortData[lorebookName] = sortedIds;
    setLocalStorageItem(LOREBOOK_UI_SORT_KEY, JSON.stringify(allSortData));
    console.log('[排序] 已保存 UI 排序到 localStorage:', lorebookName, sortedIds.length, '个条目');
  } catch (error) {
    console.error('角色世界书: 保存UI排序到本地存储失败', error);
  }
}

function getUid(entry) {
  return ensureNumericUID(entry?.uid);
}

function getPlacementBucket(entry) {
  const position = entry?.position || {};
  const type = position.type || 'after_character_definition';
  if (type !== 'at_depth') {
    return type;
  }
  const depth = Number.isFinite(Number(position.depth)) ? Number(position.depth) : 0;
  return `${type}:${normalizePositionRole(position.role)}:${depth}`;
}

function clonePosition(position) {
  const cloned = _.cloneDeep(position || {});
  cloned.type = cloned.type || 'after_character_definition';
  if (cloned.type === 'at_depth') {
    cloned.role = normalizePositionRole(cloned.role);
    cloned.depth = Number.isFinite(Number(cloned.depth)) ? Number(cloned.depth) : 0;
  } else {
    delete cloned.role;
  }
  return cloned;
}

function getPriorityPositionRank(entry) {
  const type = entry?.position?.type || 'after_character_definition';
  return POSITION_TYPE_TO_NATIVE[type] ?? POSITION_TYPE_TO_NATIVE.after_character_definition;
}

function getAscendingBucketEntries(entries, bucket, sourceUid) {
  return entries
    .filter(entry => getPlacementBucket(entry) === bucket && getUid(entry) !== sourceUid)
    .sort((a, b) => {
      const orderA = Number(a?.position?.order);
      const orderB = Number(b?.position?.order);
      if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
        return orderA - orderB;
      }
      return getUid(a) - getUid(b);
    });
}

function hasUsableUniqueOrders(entries) {
  const seen = new Set();
  return entries.every(entry => {
    const order = Number(entry?.position?.order);
    if (!Number.isInteger(order) || seen.has(order)) return false;
    seen.add(order);
    return true;
  });
}

function makePriorityPatches(entries, source, target, direction, sortDir) {
  const sourceUid = getUid(source);
  const targetUid = getUid(target);
  const targetPosition = clonePosition(target.position);
  const targetBucket = getPlacementBucket({ position: targetPosition });
  const originalBucketEntries = entries.filter(entry => getPlacementBucket(entry) === targetBucket);
  const bucketEntries = getAscendingBucketEntries(entries, targetBucket, sourceUid);
  const targetIndex = bucketEntries.findIndex(entry => getUid(entry) === targetUid);
  if (targetIndex < 0) return null;

  // The bucket is always persisted in ascending order; desc only reverses its display.
  const insertAfterTarget = (direction === 'down') !== (sortDir === 'desc');
  const insertionIndex = targetIndex + (insertAfterTarget ? 1 : 0);
  const nextBucket = [...bucketEntries];
  const plannedSource = { ...source, position: targetPosition };
  nextBucket.splice(insertionIndex, 0, plannedSource);

  const needsRenumber = !hasUsableUniqueOrders(originalBucketEntries);
  const previous = nextBucket[insertionIndex - 1];
  const following = nextBucket[insertionIndex + 1];
  const previousOrder = Number(previous?.position?.order);
  const followingOrder = Number(following?.position?.order);
  let sourceOrder = null;

  if (!needsRenumber) {
    if (!previous) {
      sourceOrder = followingOrder - 10;
    } else if (!following) {
      sourceOrder = previousOrder + 10;
    } else if (followingOrder - previousOrder > 1) {
      sourceOrder = Math.floor((previousOrder + followingOrder) / 2);
    }
  }

  const patches = new Map();
  if (Number.isInteger(sourceOrder)) {
    patches.set(sourceUid, { position: { ...targetPosition, order: sourceOrder }, order: sourceOrder });
  } else {
    nextBucket.forEach((entry, index) => {
      const uid = getUid(entry);
      const order = (index + 1) * 10;
      patches.set(uid, {
        position: uid === sourceUid ? { ...targetPosition, order } : { ...clonePosition(entry.position), order },
        order,
      });
    });
  }

  return { patches, placementBucket: targetBucket };
}

/**
 * Build a data-only mobile move operation. The returned patches never mutate entries.
 */
export function planEntryMove({
  entries = [],
  visibleUids = [],
  entryUid,
  direction,
  sortPreference = {},
  regionByUid = {},
  pinnedUids = [],
  customOrder = [],
}) {
  const normalizedDirection = direction === 'down' ? 'down' : 'up';
  const sortBy = sortPreference.by || 'priority';
  const sortDir = sortPreference.dir === 'desc' ? 'desc' : 'asc';
  const sourceUid = ensureNumericUID(entryUid);
  const pinned = new Set([...pinnedUids].map(ensureNumericUID));
  if (!['priority', 'custom'].includes(sortBy)) {
    return { movable: false, reason: '当前排序方式不支持上下移动' };
  }
  if (pinned.has(sourceUid)) {
    return { movable: false, reason: '置顶条目不能通过上下移动调整' };
  }

  const entryMap = new Map(entries.map(entry => [getUid(entry), entry]));
  const source = entryMap.get(sourceUid);
  if (!source) return { movable: false, reason: '找不到要移动的条目' };

  const visible = visibleUids.map(ensureNumericUID).filter(uid => entryMap.has(uid));
  const sourceIndex = visible.indexOf(sourceUid);
  const targetUid = visible[sourceIndex + (normalizedDirection === 'up' ? -1 : 1)];
  if (sourceIndex < 0 || targetUid === undefined) {
    return { movable: false, reason: normalizedDirection === 'up' ? '已经是当前区域第一项' : '已经是当前区域最后一项' };
  }
  const target = entryMap.get(targetUid);
  if (!target || pinned.has(targetUid)) {
    return { movable: false, reason: '不能跨越置顶条目边界' };
  }
  if ((regionByUid[sourceUid] || '__root__') !== (regionByUid[targetUid] || '__root__')) {
    return { movable: false, reason: '不能跨文件夹移动条目' };
  }

  if (sortBy === 'custom') {
    const allUids = entries.map(getUid);
    const seen = new Set();
    const normalizedOrder = [...customOrder, ...allUids]
      .map(ensureNumericUID)
      .filter(uid => entryMap.has(uid) && !seen.has(uid) && seen.add(uid));
    const sourceOrderIndex = normalizedOrder.indexOf(sourceUid);
    const targetOrderIndex = normalizedOrder.indexOf(targetUid);
    if (sourceOrderIndex < 0 || targetOrderIndex < 0) return { movable: false, reason: '自定义排序数据无效' };
    const nextCustomOrder = [...normalizedOrder];
    nextCustomOrder.splice(sourceOrderIndex, 1);
    nextCustomOrder.splice(targetOrderIndex, 0, sourceUid);
    const patches = new Map();
    nextCustomOrder.forEach((uid, index) => patches.set(uid, { position: { ...clonePosition(entryMap.get(uid).position), order: index }, order: index }));
    return { movable: true, sourceUid, targetUid, patches, nextCustomOrder };
  }

  const priorityPlan = makePriorityPatches(entries, source, target, normalizedDirection, sortDir);
  if (!priorityPlan) return { movable: false, reason: '无法计算新的插入顺序' };
  return { movable: true, sourceUid, targetUid, ...priorityPlan };
}

// 从 localStorage 加载保存的排序顺序
export function loadUISort(lorebookName) {
  try {
    const storedData = getLocalStorageItem(LOREBOOK_UI_SORT_KEY);
    if (!storedData) return null;

    const allSortData = JSON.parse(storedData);
    if (!allSortData[lorebookName]) return null;

    const savedSort = allSortData[lorebookName].map(uid => ensureNumericUID(uid));
    console.log('[排序] 已加载保存的 UI 排序:', lorebookName, savedSort.length, '个条目');
    return savedSort;
  } catch (error) {
    console.error('角色世界书: 从本地存储加载UI排序失败', error);
    return null;
  }
}

export function getEntriesInCustomOrder(entries, customOrder) {
  const entryMap = new Map((entries || []).map(entry => [getUid(entry), entry]));
  const ordered = [];
  (customOrder || []).forEach(uid => {
    const entry = entryMap.get(ensureNumericUID(uid));
    if (entry) {
      ordered.push(entry);
      entryMap.delete(getUid(entry));
    }
  });
  entryMap.forEach(entry => ordered.push(entry));
  return ordered;
}

export function getEntriesForSortPreference(entries, sortPreference = {}, customOrder = null) {
  const sortBy = sortPreference.by || 'priority';
  const sortDir = sortPreference.dir === 'desc' ? 'desc' : 'asc';
  const initial = sortBy === 'custom' ? getEntriesInCustomOrder(entries, customOrder || []) : [...(entries || [])];
  return getSortedEntries(initial, sortBy, sortDir);
}

// 应用保存的 UI 排序顺序（重新排列 DOM 元素）
export function applySavedUISort($container, lorebookName) {
  const savedSort = loadUISort(lorebookName);
  if (!savedSort || savedSort.length === 0) return;

  // 创建 UID -> jQuery元素 的映射
  const entryMap = new Map();
  $container.children(`.${LOREBOOK_ENTRY_CLASS}`).each(function () {
    const uid = $(this).attr('data-entry-uid');
    entryMap.set(uid, $(this));
  });

  // 按保存的顺序重新追加到容器
  savedSort.forEach(uid => {
    const $entry = entryMap.get(String(uid));
    if ($entry) {
      $container.append($entry);
    }
  });

  console.log('[排序] 已应用保存的 UI 排序:', lorebookName);
}

// --- Data-Based Sorting ---

export function saveSortPreference() {
  try {
    setLocalStorageItem(LOREBOOK_SORT_PREF_KEY, JSON.stringify(lorebookSorts));
  } catch (error) {
    console.error('角色世界书: 保存排序偏好失败', error);
  }
}

export function loadSortPreference() {
  try {
    const savedSorts = getLocalStorageItem(LOREBOOK_SORT_PREF_KEY);
    if (savedSorts) {
      setLorebookSorts(JSON.parse(savedSorts));
    }
  } catch (error) {
    console.error('角色世界书: 加载排序偏好失败', error);
  }
}

export function getSortedEntries(entries, sortBy, sortDir) {
  const sorted = [...entries];
  const requestedSortBy = sortBy;
  const normalizeText = value => {
    if (typeof value === 'string') {
      return value;
    }
    if (value == null) {
      return '';
    }
    return String(value);
  };

  sorted.sort((a, b) => {
    // 1. 主要排序：置顶状态
    const aIsPinned = a.pinned === true;
    const bIsPinned = b.pinned === true;
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    if (aIsPinned && bIsPinned) {
      const pinOrderA = Number.isFinite(a.__pinOrder) ? a.__pinOrder : Number.MAX_SAFE_INTEGER;
      const pinOrderB = Number.isFinite(b.__pinOrder) ? b.__pinOrder : Number.MAX_SAFE_INTEGER;
      if (pinOrderA !== pinOrderB) {
        return pinOrderA - pinOrderB;
      }
    }

    // 如果置顶状态相同，则应用次要排序

    // '自定义' 排序，保持预先排定的顺序
    if (requestedSortBy === 'custom') {
      return 0;
    }

    // '优先级' 排序，应用多级比较
    let effectiveSortBy = requestedSortBy;
    if (effectiveSortBy === 'enabled_priority') {
      const aEnabled = a.enabled !== false;
      const bEnabled = b.enabled !== false;
      if (aEnabled && !bEnabled) return -1;
      if (!aEnabled && bEnabled) return 1;
      effectiveSortBy = 'priority';
    }

    if (effectiveSortBy === 'priority') {
      const posA = _.get(a, 'position.type', 'after_character_definition');
      const posB = _.get(b, 'position.type', 'after_character_definition');
      const priorityA = getPriorityPositionRank(a);
      const priorityB = getPriorityPositionRank(b);

      let result = priorityA - priorityB;

      if (result === 0 && posA === 'at_depth') {
        const depthA = _.get(a, 'position.depth', 0);
        const depthB = _.get(b, 'position.depth', 0);
        result = depthB - depthA; // 深度总是降序
        if (result === 0) {
          const roleOrder = { system: 0, user: 1, assistant: 2 };
          result =
            (roleOrder[normalizePositionRole(_.get(a, 'position.role'))] ?? 0) -
            (roleOrder[normalizePositionRole(_.get(b, 'position.role'))] ?? 0);
        }
      }

      if (result === 0) {
        const orderA = _.get(a, 'position.order', 0);
        const orderB = _.get(b, 'position.order', 0);
        result = orderA - orderB; // 顺序是升序
      }

      // 在最后应用排序方向
      return sortDir === 'desc' ? -result : result;
    }

    // 其他简单排序
    else {
      let valA, valB;
      switch (effectiveSortBy) {
        case 'name':
          valA = normalizeText(a.name).toLowerCase();
          valB = normalizeText(b.name).toLowerCase();
          return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'tokens':
          valA = (a.content || '').length;
          valB = (b.content || '').length;
          break;
        // 'order' 和 'probability' case 已被移除
        case 'uid':
        default:
          valA = ensureNumericUID(a.uid);
          valB = ensureNumericUID(b.uid);
          break;
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    }
  });

  return sorted;
}
