import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activeFilters,
  clearFilteredEntries,
  clearSelectedEntries,
  getSelectableEntries,
  getSelectAllControlState,
  isSelectAllRemembered,
  setActiveFilter,
  setAllEntriesData,
  setEntrySearchQuery,
  setSelectAllMemory,
  setSelectedEntries,
  toggleEntrySelection,
} from './state.js';

const LOREBOOK = 'selection-state-test';
const entries = [
  { uid: 1, name: 'Alpha 标题', content: '第一条', enabled: true, strategy: { keys: ['one'] } },
  { uid: 2, name: '第二条', content: 'alpha 内容', enabled: false, strategy: { keys: ['two'] } },
  { uid: 3, name: '第三条', content: '第三条', enabled: true, strategy: { keys: ['beta-key'] } },
];

describe('世界书顶部全选状态', () => {
  beforeEach(() => {
    setAllEntriesData({ [LOREBOOK]: entries });
  });

  afterEach(() => {
    clearFilteredEntries(LOREBOOK);
    clearSelectedEntries(LOREBOOK);
    delete activeFilters[LOREBOOK];
    setAllEntriesData({});
  });

  it('将普通筛选和最新搜索关键词取交集', () => {
    setActiveFilter(LOREBOOK, 'isEnabled', true);
    setEntrySearchQuery(LOREBOOK, ' ALPHA ');

    expect(getSelectableEntries(LOREBOOK).map(entry => entry.uid)).toEqual([1]);

    setEntrySearchQuery(LOREBOOK, 'beta-key');
    expect(getSelectableEntries(LOREBOOK).map(entry => entry.uid)).toEqual([3]);
  });

  it('将搜索零结果保留为空作用域，不回退到全部条目', () => {
    setEntrySearchQuery(LOREBOOK, '不存在的关键词');

    expect(getSelectableEntries(LOREBOOK)).toEqual([]);
    expect(getSelectAllControlState(LOREBOOK)).toMatchObject({
      disabled: true,
      nextAction: 'none',
      selectableCount: 0,
    });
  });

  it('搜索全选后清空关键词仍保持记忆和勾选状态', () => {
    setEntrySearchQuery(LOREBOOK, 'alpha');
    const selectedUids = getSelectableEntries(LOREBOOK).map(entry => entry.uid);
    setSelectedEntries(LOREBOOK, selectedUids);
    setSelectAllMemory(LOREBOOK, true);

    expect(getSelectAllControlState(LOREBOOK)).toMatchObject({
      checked: true,
      indeterminate: false,
      nextAction: 'clear',
      selectedCount: 2,
    });

    clearFilteredEntries(LOREBOOK);
    expect(getSelectAllControlState(LOREBOOK)).toMatchObject({
      checked: true,
      indeterminate: false,
      nextAction: 'clear',
      selectedCount: 2,
      selectableCount: 3,
    });
  });

  it('手动更改单条选择会解除全选记忆并恢复半选状态', () => {
    setSelectedEntries(LOREBOOK, [1, 2]);
    setSelectAllMemory(LOREBOOK, true);

    toggleEntrySelection(LOREBOOK, 2, false);

    expect(isSelectAllRemembered(LOREBOOK)).toBe(false);
    expect(getSelectAllControlState(LOREBOOK)).toMatchObject({
      checked: false,
      indeterminate: true,
      nextAction: 'select',
      selectedCount: 1,
    });
  });

  it('刷新裁剪 UID 时保留记忆，但空集合会自动解除', () => {
    setSelectedEntries(LOREBOOK, [1, 2]);
    setSelectAllMemory(LOREBOOK, true);

    setSelectedEntries(LOREBOOK, [1], { preserveSelectAllMemory: true });
    expect(isSelectAllRemembered(LOREBOOK)).toBe(true);

    setSelectedEntries(LOREBOOK, [], { preserveSelectAllMemory: true });
    expect(isSelectAllRemembered(LOREBOOK)).toBe(false);
  });

  it('零搜索结果下仍允许清除已有的隐藏选择', () => {
    setSelectedEntries(LOREBOOK, [1]);
    setEntrySearchQuery(LOREBOOK, '不存在的关键词');

    expect(getSelectAllControlState(LOREBOOK)).toMatchObject({
      checked: false,
      indeterminate: true,
      disabled: false,
      nextAction: 'clear',
    });
  });
});
