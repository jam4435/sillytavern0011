import { describe, expect, it } from 'vitest';
import {
  buildAiComparisons,
  createObservedVariableChanges,
  parseDeclaredVariableChanges,
} from './variableChanges';

describe('parseDeclaredVariableChanges', () => {
  it('解析变量声明、忽略 ERA 元数据并保留思考摘要', () => {
    const parsed = parseDeclaredVariableChanges(`
      <VariableThink>先更新玩家状态</VariableThink>
      <VariableEdit>
      {
        "user数据": {
          "修为": 120,
          "$meta": { "necessary": "all" }
        }
      }
      </VariableEdit>
    `);

    expect(parsed.thoughts).toHaveLength(1);
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.declaredChanges).toEqual([
      expect.objectContaining({
        action: 'edit',
        path: ['user数据', '修为'],
        value: 120,
      }),
    ]);
  });

  it('区分空块和非法 JSON', () => {
    const parsed = parseDeclaredVariableChanges(`
      <VariableInsert></VariableInsert>
      <VariableEdit>{ invalid json }</VariableEdit>
    `);

    expect(parsed.declaredChanges).toEqual([]);
    expect(parsed.parseErrors).toHaveLength(2);
  });
});

describe('createObservedVariableChanges', () => {
  it('按叶子生成增量差分并记录生产者', () => {
    const result = createObservedVariableChanges(
      { user数据: { 修为: 100, 状态: '正常' } },
      { user数据: { 修为: 120, 状态: '正常' } },
      {
        origin: 'background',
        producer: 'era',
        timestamp: 1000,
        batchId: 'batch-1',
        actions: { apiWrite: true, disabled: false },
        reason: 'test',
      },
    );

    expect(result.observedChanges).toEqual([
      expect.objectContaining({
        action: 'edit',
        path: ['user数据', '修为'],
        beforeValue: 100,
        afterValue: 120,
        origin: 'background',
        producer: 'era',
        actions: { apiWrite: true },
      }),
    ]);
    expect(result.batch).toEqual(expect.objectContaining({
      producer: 'era',
      changeCount: 1,
    }));
  });

  it('相同快照不产生差分', () => {
    const result = createObservedVariableChanges(
      { user数据: { 修为: 100 } },
      { user数据: { 修为: 100 } },
      {
        origin: 'background',
        producer: 'message-boundary',
        timestamp: 1000,
        batchId: 'batch-1',
      },
    );

    expect(result.observedChanges).toEqual([]);
    expect(result.batch).toBeNull();
  });
});

describe('buildAiComparisons', () => {
  const declared = parseDeclaredVariableChanges(`
    <VariableEdit>{"user数据":{"修为":120}}</VariableEdit>
  `).declaredChanges;

  it('识别 applied、not-applied、diverged 和 no-op', () => {
    const appliedChanges = createObservedVariableChanges(
      { user数据: { 修为: 100 } },
      { user数据: { 修为: 120 } },
      {
        origin: 'ai',
        producer: 'era',
        timestamp: 1000,
        batchId: 'ai-1',
      },
    ).observedChanges;

    expect(buildAiComparisons({
      declaredChanges: declared,
      observedChanges: appliedChanges,
      baselineStatData: { user数据: { 修为: 100 } },
      currentStatData: { user数据: { 修为: 120 } },
    }).comparisons[0].status).toBe('applied');

    expect(buildAiComparisons({
      declaredChanges: declared,
      observedChanges: [],
      baselineStatData: { user数据: { 修为: 100 } },
      currentStatData: { user数据: { 修为: 100 } },
    }).comparisons[0].status).toBe('not-applied');

    const divergedChanges = createObservedVariableChanges(
      { user数据: { 修为: 100 } },
      { user数据: { 修为: 110 } },
      {
        origin: 'ai',
        producer: 'era',
        timestamp: 1000,
        batchId: 'ai-2',
      },
    ).observedChanges;

    expect(buildAiComparisons({
      declaredChanges: declared,
      observedChanges: divergedChanges,
      baselineStatData: { user数据: { 修为: 100 } },
      currentStatData: { user数据: { 修为: 110 } },
    }).comparisons[0].status).toBe('diverged');

    expect(buildAiComparisons({
      declaredChanges: declared,
      observedChanges: [],
      baselineStatData: { user数据: { 修为: 120 } },
      currentStatData: { user数据: { 修为: 120 } },
    }).comparisons[0].status).toBe('no-op');
  });
});
