import { describe, expect, it } from 'vitest';

import {
  buildCompareAddedEntryPlan,
  buildCompareContentOverwritePlan,
  buildLorebookCompareResult,
  getCompareItemsForFilter,
} from './optimizerCompare.js';

function entry(uid: number, name: string, content: string, extra: Record<string, unknown> = {}) {
  return {
    uid,
    name,
    content,
    enabled: true,
    probability: 100,
    strategy: { type: 'selective', keys: [] },
    position: { type: 'after_character_definition', depth: 4, order: 0 },
    ...extra,
  };
}

describe('世界书全本比对 helper', () => {
  it('构建新增、删除、修改三类比对结果', () => {
    const result = buildLorebookCompareResult(
      '当前',
      '对比',
      [entry(1, '修改条目', '旧正文'), entry(2, '删除条目', '仅当前有')],
      [entry(10, '修改条目', '新正文'), entry(11, '新增条目', '仅对比有')],
    );

    expect(result.summary).toEqual({ added: 1, removed: 1, modified: 1 });
    expect(result.items.map(item => item.type)).toEqual(['modified', 'added', 'removed']);
    expect(result.items[0]).toMatchObject({
      type: 'modified',
      baseUid: 1,
      targetUid: 10,
      hasContentDiff: true,
      targetContent: '新正文',
    });
  });

  it('筛选后保留原始 result.items 下标', () => {
    const result = buildLorebookCompareResult(
      '当前',
      '对比',
      [entry(1, '修改条目', '旧正文'), entry(2, '删除条目', '仅当前有')],
      [entry(10, '修改条目', '新正文'), entry(11, '新增条目', '仅对比有')],
    );

    const added = getCompareItemsForFilter(result, 'added');

    expect(added).toHaveLength(1);
    expect(added[0].item.title).toBe('新增条目');
    expect(added[0].originalIndex).toBe(result.items.findIndex(item => item.type === 'added'));
    expect(added[0].originalIndex).not.toBe(0);
  });

  it('正文覆盖计划只包含正文差异，不处理纯元数据差异', () => {
    const result = buildLorebookCompareResult(
      '当前',
      '对比',
      [
        entry(1, '正文变化', '旧正文'),
        entry(2, '只改关键词', '正文不变', { strategy: { type: 'selective', keys: ['旧关键词'] } }),
      ],
      [
        entry(10, '正文变化', '新正文'),
        entry(20, '只改关键词', '正文不变', { strategy: { type: 'selective', keys: ['新关键词'] } }),
      ],
    );

    const plan = buildCompareContentOverwritePlan(result, [
      entry(1, '正文变化', '旧正文'),
      entry(2, '只改关键词', '正文不变', { strategy: { type: 'selective', keys: ['旧关键词'] } }),
    ]);

    expect(result.summary.modified).toBe(2);
    expect(plan.updates).toEqual([{ uid: 1, title: '正文变化', nextContent: '新正文' }]);
  });

  it('新增计划重新分配 UID、跳过文件夹 meta，并避免重复添加', () => {
    const folderMeta = entry(50, '__WI_META_FOLDERS__', '{}');
    const result = buildLorebookCompareResult(
      '当前',
      '对比',
      [entry(1, '已有条目', '正文'), folderMeta],
      [entry(10, '已有条目', '正文'), entry(20, '新增条目', '目标正文'), entry(99, '__WI_META_FOLDERS__', '{}')],
    );

    const firstPlan = buildCompareAddedEntryPlan(result, [entry(1, '已有条目', '正文'), folderMeta]);
    const secondPlan = buildCompareAddedEntryPlan(result, [
      entry(1, '已有条目', '正文'),
      folderMeta,
      ...firstPlan.entriesToCreate,
    ]);

    expect(result.summary.added).toBe(1);
    expect(firstPlan.entriesToCreate).toMatchObject([{ uid: 51, name: '新增条目', content: '目标正文' }]);
    expect(firstPlan.entriesToCreate.some(item => item.name === '__WI_META_FOLDERS__')).toBe(false);
    expect(secondPlan.createdCount).toBe(0);
  });
});
