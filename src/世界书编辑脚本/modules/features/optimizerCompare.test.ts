import { describe, expect, it } from 'vitest';

import {
  applyCompareEntryOverwritePlan,
  applyCompareEntrySettingsOverwritePlan,
  applyCompareKeywordOverwritePlan,
  buildCompareAddedEntryPlan,
  buildCompareContentOverwritePlan,
  buildCompareEntryOverwritePlan,
  buildCompareEntrySettingsOverwritePlan,
  buildCompareKeywordOverwritePlan,
  buildLorebookCompareResult,
  buildCompareRemovedEntryDeletePlan,
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

    const modified = getCompareItemsForFilter(result, 'modified');
    const added = getCompareItemsForFilter(result, 'added');

    expect(modified).toHaveLength(1);
    expect(modified[0].item.title).toBe('修改条目');
    expect(modified[0].originalIndex).toBe(result.items.findIndex(item => item.type === 'modified'));
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

  it('关键词覆盖计划只覆盖主关键词和次关键词', () => {
    const baseEntry = entry(1, '关键词变化', '正文', {
      strategy: { type: 'selective', keys: ['旧主'], keys_secondary: { logic: 'and_any', keys: ['旧次'] } },
      probability: 20,
    });
    const targetEntry = entry(10, '关键词变化', '正文', {
      strategy: { type: 'constant', keys: ['新主'], keys_secondary: { logic: 'not_any', keys: ['新次'] } },
      probability: 90,
    });
    const result = buildLorebookCompareResult('当前', '对比', [baseEntry], [targetEntry]);

    const plan = buildCompareKeywordOverwritePlan(result, [baseEntry]);
    const applied = applyCompareKeywordOverwritePlan([baseEntry], plan);

    expect(plan.updateCount).toBe(1);
    expect(applied.changedCount).toBe(1);
    expect(applied.entries[0].content).toBe('正文');
    expect(applied.entries[0].probability).toBe(20);
    expect(applied.entries[0].strategy).toMatchObject({
      type: 'selective',
      keys: ['新主'],
      keys_secondary: { logic: 'not_any', keys: ['新次'] },
    });
  });

  it('条目设置覆盖保留 UID、正文和关键词', () => {
    const baseEntry = entry(1, '设置变化', '旧正文', {
      enabled: true,
      probability: 20,
      strategy: { type: 'selective', keys: ['旧主'], keys_secondary: { logic: 'and_any', keys: ['旧次'] } },
      position: { type: 'after_character_definition', depth: 4, order: 1 },
    });
    const targetEntry = entry(10, '设置变化', '新正文', {
      enabled: false,
      probability: 80,
      strategy: { type: 'constant', keys: ['新主'], keys_secondary: { logic: 'not_any', keys: ['新次'] } },
      position: { type: 'at_depth', role: 'assistant', depth: 2, order: 9 },
    });
    const result = buildLorebookCompareResult('当前', '对比', [baseEntry], [targetEntry]);

    const plan = buildCompareEntrySettingsOverwritePlan(result, [baseEntry]);
    const applied = applyCompareEntrySettingsOverwritePlan([baseEntry], plan);

    expect(plan.updateCount).toBe(1);
    expect(applied.entries[0]).toMatchObject({
      uid: 1,
      name: '设置变化',
      content: '旧正文',
      enabled: false,
      probability: 80,
      position: { type: 'at_depth', role: 'assistant', depth: 2, order: 9 },
    });
    expect(applied.entries[0].strategy).toMatchObject({
      type: 'constant',
      keys: ['旧主'],
      keys_secondary: { logic: 'and_any', keys: ['旧次'] },
    });
  });

  it('整条覆盖保留当前 UID，并同步正文、关键词和未展开字段', () => {
    const baseEntry = entry(1, '整条变化', '旧正文', {
      strategy: { type: 'selective', keys: ['旧主'], keys_secondary: { logic: 'and_any', keys: ['旧次'] } },
      effect: { sticky: null, cooldown: null, delay: null },
    });
    const targetEntry = entry(10, '整条变化', '新正文', {
      strategy: { type: 'constant', keys: ['新主'], keys_secondary: { logic: 'not_any', keys: ['新次'] } },
      effect: { sticky: 3, cooldown: 2, delay: 1 },
      extra: { source: 'target' },
    });
    const result = buildLorebookCompareResult('当前', '对比', [baseEntry], [targetEntry]);

    const plan = buildCompareEntryOverwritePlan(result, [baseEntry]);
    const applied = applyCompareEntryOverwritePlan([baseEntry], plan);

    expect(plan.updateCount).toBe(1);
    expect(applied.changedCount).toBe(1);
    expect(applied.entries[0]).toMatchObject({
      uid: 1,
      name: '整条变化',
      content: '新正文',
      strategy: {
        type: 'constant',
        keys: ['新主'],
        keys_secondary: { logic: 'not_any', keys: ['新次'] },
      },
      effect: { sticky: 3, cooldown: 2, delay: 1 },
      extra: { source: 'target' },
    });
  });

  it('只有未展开字段差异时不生成修改结果', () => {
    const baseEntry = entry(1, '隐藏字段变化', '正文', {
      effect: { sticky: null, cooldown: null, delay: null },
    });
    const targetEntry = entry(10, '隐藏字段变化', '正文', {
      effect: { sticky: 2, cooldown: null, delay: null },
    });
    const result = buildLorebookCompareResult('当前', '对比', [baseEntry], [targetEntry]);

    expect(result.summary.modified).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('未展开字段不会单独生成修改条目', () => {
    const baseEntry = entry(1, '隐式默认字段', '正文');
    const explicitDefaultsEntry = entry(10, '隐式默认字段', '正文', {
      addMemo: true,
      matchPersonaDescription: false,
      matchCharacterDescription: false,
      matchCharacterPersonality: false,
      matchCharacterDepthPrompt: false,
      matchScenario: false,
      matchCreatorNotes: false,
      group: '',
      groupOverride: false,
      groupWeight: 100,
      caseSensitive: null,
      matchWholeWords: null,
      useGroupScoring: null,
      automationId: '',
      ignoreBudget: false,
      outletName: '',
      triggers: [],
      characterFilter: { isExclude: false, names: [], tags: [] },
      extra: {},
    });
    const actualHiddenChangeEntry = { ...explicitDefaultsEntry, group: '真正不同的分组' };
    const actualExtraChangeEntry = { ...explicitDefaultsEntry, extra: { source: 'target' } };

    const equivalentResult = buildLorebookCompareResult('当前', '对比', [baseEntry], [explicitDefaultsEntry]);
    const changedResult = buildLorebookCompareResult('当前', '对比', [baseEntry], [actualHiddenChangeEntry]);
    const extraChangedResult = buildLorebookCompareResult('当前', '对比', [baseEntry], [actualExtraChangeEntry]);

    expect(equivalentResult.summary.modified).toBe(0);
    expect(equivalentResult.items).toHaveLength(0);
    expect(changedResult.summary.modified).toBe(0);
    expect(changedResult.items).toHaveLength(0);
    expect(extraChangedResult.summary.modified).toBe(0);
    expect(extraChangedResult.items).toHaveLength(0);
  });

  it('删除计划只包含当前世界书独有条目，交换方向后新增和删除语义反转', () => {
    const baseOnly = entry(1, '当前独有', '仅当前有');
    const targetOnly = entry(10, '对比独有', '仅对比有');
    const result = buildLorebookCompareResult('当前', '对比', [baseOnly], [targetOnly]);
    const reversed = buildLorebookCompareResult('对比', '当前', [targetOnly], [baseOnly]);

    const deletePlan = buildCompareRemovedEntryDeletePlan(result, [baseOnly]);

    expect(deletePlan).toMatchObject({ uidsToDelete: [1], deleteCount: 1 });
    expect(result.items.find(item => item.type === 'added')?.title).toBe('对比独有');
    expect(result.items.find(item => item.type === 'removed')?.title).toBe('当前独有');
    expect(reversed.items.find(item => item.type === 'added')?.title).toBe('当前独有');
    expect(reversed.items.find(item => item.type === 'removed')?.title).toBe('对比独有');
  });
});
