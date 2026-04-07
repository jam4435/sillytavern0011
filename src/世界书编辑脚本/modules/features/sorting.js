import { LOREBOOK_ENTRY_CLASS, LOREBOOK_SORT_PREF_KEY, LOREBOOK_UI_SORT_KEY } from '../config.js';
import { lorebookSorts, setLorebookSorts } from '../state.js';
import { ensureNumericUID } from '../utils.js';

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
function saveUISort(lorebookName, sortedIds) {
  try {
    // 以世界书名为键保存顺序
    const allSortData = JSON.parse(localStorage.getItem(LOREBOOK_UI_SORT_KEY) || '{}');
    allSortData[lorebookName] = sortedIds;
    localStorage.setItem(LOREBOOK_UI_SORT_KEY, JSON.stringify(allSortData));
    console.log('[排序] 已保存 UI 排序到 localStorage:', lorebookName, sortedIds.length, '个条目');
  } catch (error) {
    console.error('角色世界书: 保存UI排序到本地存储失败', error);
  }
}

// 从 localStorage 加载保存的排序顺序
export function loadUISort(lorebookName) {
  try {
    const storedData = localStorage.getItem(LOREBOOK_UI_SORT_KEY);
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
    localStorage.setItem(LOREBOOK_SORT_PREF_KEY, JSON.stringify(lorebookSorts));
  } catch (error) {
    console.error('角色世界书: 保存排序偏好失败', error);
  }
}

export function loadSortPreference() {
  try {
    const savedSorts = localStorage.getItem(LOREBOOK_SORT_PREF_KEY);
    if (savedSorts) {
      setLorebookSorts(JSON.parse(savedSorts));
    }
  } catch (error) {
    console.error('角色世界书: 加载排序偏好失败', error);
  }
}

export function getSortedEntries(entries, sortBy, sortDir) {
  const sorted = [...entries];
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
    if (sortBy === 'custom') {
      return 0;
    }

    // '优先级' 排序，应用多级比较
    if (sortBy === 'enabled_priority') {
      const aEnabled = a.enabled !== false;
      const bEnabled = b.enabled !== false;
      if (aEnabled && !bEnabled) return -1;
      if (!aEnabled && bEnabled) return 1;
      sortBy = 'priority';
    }

    if (sortBy === 'priority') {
      const positionPriority = {
        before_character_definition: 1,
        after_character_definition: 2,
        at_depth: 3,
      };
      const posA = _.get(a, 'position.type', 'after_character_definition');
      const posB = _.get(b, 'position.type', 'after_character_definition');
      const priorityA = positionPriority[posA] || 99;
      const priorityB = positionPriority[posB] || 99;

      let result = priorityA - priorityB;

      if (result === 0 && posA === 'at_depth') {
        const depthA = _.get(a, 'position.depth', 0);
        const depthB = _.get(b, 'position.depth', 0);
        result = depthB - depthA; // 深度总是降序
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
      switch (sortBy) {
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
