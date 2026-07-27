import { describe, expect, it } from 'vitest';
import {
  AiBatchPlanningError,
  COMPLEXITY_WEIGHTS,
  DIRECT_BATCH_SIZE,
  DIRECT_PLAN_RECOMMEND_THRESHOLD,
  PLANNED_OUTPUT_UTILIZATION,
  buildDirectBatchPlans,
  buildPlannedBatchPlans,
} from './aiBatchPlanner.js';

function entry(uid: number) {
  return { uid, name: `条目 ${uid}` };
}

function task(
  uid: number,
  options: Partial<{
    complexity: 'low' | 'medium' | 'high';
    estimated_output_tokens: number;
    depends_on_uids: number[];
    related_uids: number[];
  }> = {},
) {
  return {
    uid,
    objective: `修改条目 ${uid}`,
    complexity: options.complexity ?? 'low',
    estimated_output_tokens: options.estimated_output_tokens ?? 1000,
    depends_on_uids: options.depends_on_uids ?? [],
    related_uids: options.related_uids ?? [],
  };
}

describe('直接修改分批', () => {
  it('导出统一默认常量', () => {
    expect(DIRECT_BATCH_SIZE).toBe(5);
    expect(DIRECT_PLAN_RECOMMEND_THRESHOLD).toBe(8);
    expect(PLANNED_OUTPUT_UTILIZATION).toBe(0.75);
    expect(COMPLEXITY_WEIGHTS).toEqual({ low: 1, medium: 1.25, high: 1.6 });
  });

  it.each([
    { count: 5, expected: [5] },
    { count: 6, expected: [5, 1] },
    { count: 11, expected: [5, 5, 1] },
  ])('$count 个条目按五个一批且保持原顺序', ({ count, expected }) => {
    const entries = Array.from({ length: count }, (_, index) => entry(index + 1));
    const batches = buildDirectBatchPlans(entries);

    expect(batches.map(batch => batch.entryCount)).toEqual(expected);
    expect(batches.flatMap(batch => batch.entries)).toEqual(entries);
    expect(batches.map(batch => batch.batchNumber)).toEqual(expected.map((_, index) => index + 1));
    expect(batches.every(batch => batch.splitReason === 'direct-entry-count')).toBe(true);
  });

  it('空条目集合不产生批次', () => {
    expect(buildDirectBatchPlans([])).toEqual([]);
  });
});

describe('规划模式分批', () => {
  it('按安全输出容量和复杂度权重分批', () => {
    const entries = [entry(1), entry(2), entry(3)];
    const tasks = [
      task(1, { complexity: 'low' }),
      task(2, { complexity: 'medium' }),
      task(3, { complexity: 'high' }),
    ];

    const result = buildPlannedBatchPlans({
      entries,
      entryTasks: tasks,
      reserveOutputTokens: 4000,
    });

    expect(result.safeOutputCapacity).toBe(3000);
    expect(result.taskWeights).toEqual({ 1: 1000, 2: 1250, 3: 1600 });
    expect(result.batches.map(batch => batch.uids)).toEqual([[1, 2], [3]]);
    expect(result.totalEstimatedOutputWeight).toBe(3850);
  });

  it('容量允许时把依赖任务放在同一批并保证依赖在前', () => {
    const dependency = entry(1);
    const dependent = entry(2);
    const dependencyTask = task(1);
    const dependentTask = task(2, { depends_on_uids: [1] });

    const result = buildPlannedBatchPlans({
      entries: [dependent, dependency],
      entryTasks: [dependentTask, dependencyTask],
      reserveOutputTokens: 4000,
    });

    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].entries).toEqual([dependency, dependent]);
    expect(result.batches[0].tasks).toEqual([dependencyTask, dependentTask]);
  });

  it('依赖任务放不进同一批时让被依赖项先成批', () => {
    const entries = [entry(2), entry(1)];
    const tasks = [
      task(2, { estimated_output_tokens: 2000, depends_on_uids: [1] }),
      task(1, { estimated_output_tokens: 2000 }),
    ];

    const result = buildPlannedBatchPlans({
      entries,
      entryTasks: tasks,
      reserveOutputTokens: 4000,
    });

    expect(result.batches.map(batch => batch.uids)).toEqual([[1], [2]]);
  });

  it('只读依赖视为执行前已经满足', () => {
    const result = buildPlannedBatchPlans({
      entries: [entry(1)],
      entryTasks: [task(1, { depends_on_uids: [99] })],
      readonlyUids: [99],
      reserveOutputTokens: 4000,
    });

    expect(result.batches.map(batch => batch.uids)).toEqual([[1]]);
  });

  it('优先将软关联任务装入当前批次', () => {
    const result = buildPlannedBatchPlans({
      entries: [entry(1), entry(2), entry(3)],
      entryTasks: [
        task(1, { related_uids: [3] }),
        task(2),
        task(3),
      ],
      reserveOutputTokens: 2668,
    });

    expect(result.safeOutputCapacity).toBe(2001);
    expect(result.batches.map(batch => batch.uids)).toEqual([[1, 3], [2]]);
  });

  it('循环依赖 SCC 必须同批并暴露全局及批内循环组', () => {
    const entries = [entry(1), entry(2), entry(3)];
    const tasks = [
      task(1, { depends_on_uids: [2] }),
      task(2, { depends_on_uids: [1] }),
      task(3),
    ];

    const result = buildPlannedBatchPlans({
      entries,
      entryTasks: tasks,
      reserveOutputTokens: 4000,
    });

    expect(result.cyclicGroups).toEqual([[1, 2]]);
    const cyclicBatch = result.batches.find(batch => batch.uids.includes(1));
    expect(cyclicBatch?.uids).toEqual([1, 2, 3]);
    expect(cyclicBatch?.cyclicGroups).toEqual([[1, 2]]);
    expect(cyclicBatch?.tasks).toEqual([tasks[0], tasks[1], tasks[2]]);
  });

  it('循环依赖组超过安全容量时拒绝执行', () => {
    expect(() =>
      buildPlannedBatchPlans({
        entries: [entry(1), entry(2)],
        entryTasks: [
          task(1, { estimated_output_tokens: 2000, depends_on_uids: [2] }),
          task(2, { estimated_output_tokens: 2000, depends_on_uids: [1] }),
        ],
        reserveOutputTokens: 4000,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AiBatchPlanningError>>({
        code: 'CYCLIC_GROUP_EXCEEDS_SAFE_OUTPUT_CAPACITY',
      }),
    );
  });

  it('单任务超过安全容量时单独成批并给出警告', () => {
    const oversizedEntry = entry(1);
    const smallEntry = entry(2);
    const result = buildPlannedBatchPlans({
      entries: [oversizedEntry, smallEntry],
      entryTasks: [
        task(1, { estimated_output_tokens: 5000 }),
        task(2, { estimated_output_tokens: 1000 }),
      ],
      reserveOutputTokens: 4000,
    });

    expect(result.batches.map(batch => batch.uids)).toEqual([[1], [2]]);
    expect(result.batches[0].oversized).toBe(true);
    expect(result.batches[0].warnings).toEqual([
      expect.objectContaining({ code: 'TASK_EXCEEDS_SAFE_OUTPUT_CAPACITY', uid: 1 }),
    ]);
    expect(result.warnings).toEqual(result.batches[0].warnings);
  });

  it('同等候选按原始条目顺序稳定排批', () => {
    const entries = [entry(3), entry(1), entry(2)];
    const result = buildPlannedBatchPlans({
      entries,
      entryTasks: [task(1), task(2), task(3)],
      reserveOutputTokens: 4000,
    });

    expect(result.batches[0].entries).toEqual(entries);
  });

  it('拒绝缺失任务和未知依赖', () => {
    expect(() =>
      buildPlannedBatchPlans({
        entries: [entry(1), entry(2)],
        entryTasks: [task(1)],
      }),
    ).toThrowError(expect.objectContaining({ code: 'MISSING_ENTRY_TASK' }));

    expect(() =>
      buildPlannedBatchPlans({
        entries: [entry(1)],
        entryTasks: [task(1, { depends_on_uids: [404] })],
      }),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_DEPENDENCY' }));
  });

  it('将输出估算规范到 64–64000 后再计算权重', () => {
    const result = buildPlannedBatchPlans({
      entries: [entry(1), entry(2)],
      entryTasks: [
        task(1, { estimated_output_tokens: 1 }),
        task(2, { complexity: 'high', estimated_output_tokens: 100000 }),
      ],
      reserveOutputTokens: 200000,
    });

    expect(result.taskWeights).toEqual({ 1: 64, 2: 102400 });
  });
});
