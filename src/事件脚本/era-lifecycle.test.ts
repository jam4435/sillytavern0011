import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../武侠/test/setup';

import { isEventDiscoverable, isTimeAfterEventEnd, isTimeForEvent } from './era-event-checker.js';
import {
  batchEndEvents,
  batchStartEvents,
  buildActualEventWindow,
  buildPlayerParticipationEntry,
  cleanupInvalidParticipationEntries,
  initializeEventList,
} from './era-event-operations.js';
import { createSerialTaskQueue, buildFollowupCounterPlan } from './era-turn-queue.js';
import { attachEventMetadata, deriveEventRuntimeDescriptor } from './era-utils.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function applyOperation(target: Record<string, any>, operation: { type: string; payload: Record<string, any> }) {
  const visit = (node: Record<string, any>, patch: Record<string, any>) => {
    for (const [key, value] of Object.entries(patch)) {
      if (operation.type === 'insert') {
        if (node[key] === undefined) node[key] = clone(value);
        else if (isRecord(node[key]) && isRecord(value)) visit(node[key], value);
      } else if (operation.type === 'update') {
        if (node[key] === undefined) continue;
        if (isRecord(node[key]) && isRecord(value)) visit(node[key], value);
        else node[key] = clone(value);
      } else if (isRecord(value) && Object.keys(value).length > 0 && isRecord(node[key])) {
        visit(node[key], value);
      } else {
        delete node[key];
      }
    }
  };
  visit(target, operation.payload);
}
const sourceName = '射雕第7回01-宝马风波';
const targetName = '射雕第7回03-比武招亲';
const actualEndTime = { 年: 1219, 月: 10, 日: 10, 时: 11 };
let transactionMessageId = 100;

const eventDefinition = attachEventMetadata(
  {
    事件地点: '大宋/张家口/大酒店',
    事件引子: '张家口近日似有异动。',
    事件详情: '郭靖在张家口经历了一场风波。',
    事件概要: '郭靖平安结束了张家口风波。',
    参与人物: ['郭靖'],
    触发条件: { 类型: '时间', 年: 1219, 月: 10, 日: 20, 时: 13 },
    事件结束时间: { 年: 1219, 月: 10, 日: 20, 时: 15 },
    insert: {},
    update: {},
    delete: {},
    后续事件: { 事件名: '第7回-03-比武招亲', 描述: '江南似有新的风波。' },
  },
  deriveEventRuntimeDescriptor('射雕事件条目-第7回-01-宝马风波.yaml'),
);

const targetDefinition = attachEventMetadata(
  {
    事件地点: '大宋/金国中都/赵王府',
    事件引子: '中都近日有比武招亲的消息。',
    事件详情: '众人在中都见证比武招亲。',
    事件概要: '比武招亲告一段落。',
    参与人物: ['郭靖'],
    触发条件: { 类型: '时间', 年: 1219, 月: 11, 日: 1, 时: 10 },
    事件结束时间: { 年: 1219, 月: 11, 日: 1, 时: 12 },
    insert: {},
    update: {},
    delete: {},
  },
  deriveEventRuntimeDescriptor('射雕事件条目-第7回-03-比武招亲.yaml'),
);

describe('event discovery and actual runtime windows', () => {
  it('opens only discovery ten days early and starts formally at the scheduled time', () => {
    const elasticTime = { 年: 1219, 月: 10, 日: 10, 时: 13 };

    expect(isEventDiscoverable(elasticTime, eventDefinition)).toBe(true);
    expect(isTimeForEvent(elasticTime, eventDefinition, sourceName)).toBe(false);
    expect(isTimeForEvent(eventDefinition.触发条件, eventDefinition, sourceName)).toBe(true);
    expect(isEventDiscoverable(eventDefinition.触发条件, eventDefinition)).toBe(false);
    expect(isTimeAfterEventEnd(eventDefinition.事件结束时间, eventDefinition.事件结束时间)).toBe(true);
  });

  it('preserves the original duration to the hour for an early arrival', () => {
    const currentTime = { 年: 1219, 月: 10, 日: 10, 时: 9 };
    const window = buildActualEventWindow(eventDefinition, currentTime, true);

    expect(window).toEqual({ startTime: currentTime, endTime: actualEndTime });
    expect(buildPlayerParticipationEntry(sourceName, eventDefinition, currentTime, actualEndTime).描述).toBe(
      '1219年10月10日9时 到 1219年10月10日11时，郭靖在张家口经历了一场风波。',
    );
  });

  it('derives an actual end from relative duration when a conditional event starts', () => {
    const currentTime = { 年: 1222, 月: 2, 日: 1, 时: 8 };
    expect(
      buildActualEventWindow(
        { 触发条件: { 变量: 'user数据.声望', 大于: 10 }, 事件持续时间: { 日: 1, 时: 2 } },
        currentTime,
      ),
    ).toEqual({
      startTime: currentTime,
      endTime: { 年: 1222, 月: 2, 日: 2, 时: 10 },
    });
  });
});

describe('follow-up relationships', () => {
  it('does not turn a follow-up edge into an implicit predecessor gate', () => {
    const statData = { 事件系统: { 已完成事件: {} } };
    expect(isTimeForEvent(targetDefinition.触发条件, targetDefinition, targetName, statData, {
      [sourceName]: eventDefinition,
      [targetName]: targetDefinition,
    })).toBe(true);
  });
});

describe('completion persistence and follow-up pairs', () => {
  let variables: any;

  beforeEach(() => {
    eventEmitMock.mockClear();
    variables = {
      stat_data: {
        世界信息: { 时间: clone(actualEndTime) },
        事件系统: {
          未发生事件: { [targetName]: targetDefinition.触发条件 },
          进行中事件: { [sourceName]: clone(actualEndTime) },
          已完成事件: {},
          人物事件占用: {},
        },
        参与事件: {},
        世界事件: {},
        后续事件线索: {},
        后续事件线索计数: {},
        前端变量: { 事件结局状态: {}, 事件结算进度: {} },
        角色数据: {},
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => clone(variables));
    transactionMessageId += 1;
    vi.mocked(globalThis.getChatMessages).mockReturnValue([{ message_id: transactionMessageId, swipe_id: 0 }] as never);
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      variables = updater(clone(variables)) as typeof variables;
      return clone(variables);
    });
    eventOn('era:transactionByObject', async ({ transactionId, operations }: any) => {
      globalThis.updateVariablesWith(
        current => {
          const next = clone(current) as typeof variables;
          for (const operation of operations) {
            applyOperation(next.stat_data, operation);
          }
          return next;
        },
        { type: 'chat' },
      );
      await eventEmit('era:writeDone', {
        transactionId,
        transactionIds: [transactionId],
        actions: { apiWrite: true },
      });
    });
    Object.assign(globalThis, {
      toastr: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
    });
  });

  it('does not materialize historical events when initializing an existing chat', async () => {
    variables.stat_data.世界信息.时间 = { 年: 1219, 月: 11, 日: 1, 时: 0 };
    variables.stat_data.事件系统 = {
      未发生事件: {},
      进行中事件: {},
      已完成事件: {},
      人物事件占用: {},
    };
    const expiredDefinition = attachEventMetadata(
      {
        ...eventDefinition,
        insert: { 郭靖: { 状态: '不应在当前楼层补做' } },
        事件结束时间: { 年: 1219, 月: 10, 日: 20, 时: 15 },
      },
      deriveEventRuntimeDescriptor('射雕事件条目-第7回-01-宝马风波.yaml'),
    );

    await expect(
      initializeEventList({ [sourceName]: expiredDefinition }, { sparseFuture: true, manifestHash: 'existing-save' }),
    ).resolves.toMatchObject({ added: 0, committed: false });

    expect(variables.stat_data.事件系统.已完成事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.事件系统.进行中事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.角色数据.郭靖).toBeUndefined();
    expect(variables.stat_data.世界事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.前端变量.事件调度状态).toMatchObject({
      manifestHash: 'existing-save',
    });
  });

  it('cleans an invalid participation entry through an ERA transaction', async () => {
    variables.stat_data.参与事件 = {
      [sourceName]: { 非法字段: true },
    };

    await expect(cleanupInvalidParticipationEntries('test')).resolves.toBe(1);

    expect(variables.stat_data.参与事件[sourceName]).toBeUndefined();
    expect(eventEmitMock).toHaveBeenCalledWith(
      'era:transactionByObject',
      expect.objectContaining({
        operations: [
          {
            type: 'delete',
            payload: { 参与事件: { [sourceName]: {} } },
          },
        ],
      }),
    );
  });

  it('initializes an opening event window with one direct transaction and no in-progress follow-up', async () => {
    variables.stat_data.世界信息.时间 = { 年: 1219, 月: 10, 日: 20, 时: 14 };
    variables.stat_data.事件系统 = {
      未发生事件: {},
      进行中事件: {},
      已完成事件: {},
      人物事件占用: {},
    };
    let commitCount = 0;
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      commitCount += 1;
      variables = updater(clone(variables)) as typeof variables;
      return clone(variables);
    });

    await expect(
      initializeEventList({ [sourceName]: eventDefinition }, { rootBootstrap: true }),
    ).resolves.toMatchObject({
      added: 1,
      committed: true,
    });

    expect(commitCount).toBe(1);
    expect(variables.stat_data.事件系统.进行中事件[sourceName]).toEqual(eventDefinition.事件结束时间);
    expect(variables.stat_data.后续事件线索).toEqual({});
    expect(variables.stat_data.后续事件线索计数).toEqual({});
  });

  it('replays expired opening history in the same transaction', async () => {
    variables.stat_data.世界信息.时间 = { 年: 1219, 月: 11, 日: 1, 时: 0 };
    variables.stat_data.事件系统 = {
      未发生事件: {},
      进行中事件: {},
      已完成事件: {},
      人物事件占用: {},
    };
    const expiredDefinition = attachEventMetadata(
      {
        ...eventDefinition,
        insert: { 郭靖: { 状态: '已登场' } },
        事件结束时间: { 年: 1219, 月: 10, 日: 20, 时: 15 },
      },
      deriveEventRuntimeDescriptor('射雕事件条目-第7回-01-宝马风波.yaml'),
    );
    let commitCount = 0;
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      commitCount += 1;
      variables = updater(clone(variables)) as typeof variables;
      return clone(variables);
    });

    await expect(
      initializeEventList({ [sourceName]: expiredDefinition }, { rootBootstrap: true }),
    ).resolves.toMatchObject({ added: 1 });

    expect(commitCount).toBe(1);
    expect(variables.stat_data.事件系统.已完成事件[sourceName]).toBe(0);
    expect(variables.stat_data.角色数据.郭靖.状态).toBe('已登场');
    expect(variables.stat_data.世界事件[sourceName].概要).toBe(eventDefinition.事件概要);
  });

  it('expires an unmet absolute-window condition without applying diffs or completing it', async () => {
    variables.stat_data.世界信息.时间 = { 年: 1219, 月: 11, 日: 1, 时: 0 };
    variables.stat_data.事件系统 = {
      未发生事件: {},
      进行中事件: {},
      已完成事件: {},
      已失效事件: {},
      人物事件占用: {},
    };
    const conditionalDefinition = {
      ...eventDefinition,
      触发条件: { 变量: 'user数据.声望', 大于: 100 },
      update: { 郭靖: { 状态: '不应应用' } },
    };

    await initializeEventList({ [sourceName]: conditionalDefinition }, { rootBootstrap: true });

    expect(variables.stat_data.事件系统.已失效事件[sourceName]).toEqual(eventDefinition.事件结束时间);
    expect(variables.stat_data.事件系统.已完成事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.角色数据.郭靖).toBeUndefined();
    expect(variables.stat_data.世界事件[sourceName]).toBeUndefined();
  });

  it('does not replay checkpoint-completed character diffs on top of a snapshot', async () => {
    variables.stat_data.世界信息.时间 = { 年: 1219, 月: 11, 日: 1, 时: 0 };
    variables.stat_data.事件系统 = {
      未发生事件: {},
      进行中事件: {},
      已完成事件: {},
      人物事件占用: {},
    };
    const historicalDefinition = attachEventMetadata(
      {
        ...eventDefinition,
        insert: { 郭靖: { 状态: '重复应用' } },
        事件结束时间: { 年: 1219, 月: 10, 日: 20, 时: 15 },
      },
      deriveEventRuntimeDescriptor('射雕事件条目-第7回-01-宝马风波.yaml'),
    );

    await expect(
      initializeEventList(
        { [sourceName]: historicalDefinition },
        {
          checkpoint: {
            completedRuntimeKeys: [sourceName],
            characterState: { 郭靖: { 状态: '检查点快照' } },
          },
          applyCheckpoint: true,
          rootBootstrap: true,
        },
      ),
    ).resolves.toMatchObject({ added: 0, committed: false });

    expect(variables.stat_data.角色数据.郭靖.状态).toBe('检查点快照');
    expect(variables.stat_data.事件系统.已完成事件[sourceName]).toBe(0);
  });

  it('stores an early actual end without creating any in-progress follow-up data', async () => {
    variables.stat_data.事件系统.未发生事件 = { [sourceName]: eventDefinition.触发条件 };
    variables.stat_data.事件系统.进行中事件 = {};
    const earlyTime = { 年: 1219, 月: 10, 日: 10, 时: 9 };

    await batchStartEvents(
      [sourceName],
      { [sourceName]: eventDefinition },
      {
        currentTime: earlyTime,
        earlyEventNames: [sourceName],
      },
    );

    expect(variables.stat_data.事件系统.进行中事件[sourceName]).toEqual(actualEndTime);
    expect(variables.stat_data.事件系统.未发生事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.后续事件线索).toEqual({});
    expect(variables.stat_data.后续事件线索计数).toEqual({});
  });

  it('archives the actual window and creates an old-format clue under the target key', async () => {
    const definitions = { [sourceName]: eventDefinition, [targetName]: targetDefinition };

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);

    expect(variables.stat_data.世界事件[sourceName].时间).toEqual(actualEndTime);
    expect(variables.stat_data.事件系统.已完成事件[sourceName]).toBe(0);
    expect(variables.stat_data.事件系统.进行中事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.参与事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.后续事件线索[targetName]).toContain('江南似有新的风波');
    expect(variables.stat_data.后续事件线索计数[targetName]).toBe(3);
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toBeUndefined();
  });

  it('does not enter final settlement when the ERA preparation transaction fails', async () => {
    const definitions = { [sourceName]: eventDefinition, [targetName]: targetDefinition };
    let writeCount = 0;
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      writeCount += 1;
      if (writeCount === 1) {
        throw new Error('final settlement transaction failed');
      }
      variables = updater(clone(variables)) as typeof variables;
      return clone(variables);
    });

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(false);
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toBeUndefined();
    expect(variables.stat_data.事件系统.进行中事件[sourceName]).toEqual(actualEndTime);
    expect(variables.stat_data.后续事件线索[targetName]).toBeUndefined();

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);
    expect(variables.stat_data.后续事件线索计数[targetName]).toBe(3);
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toBeUndefined();
  });

  it('retries a failed atomic participation settlement without losing the ending', async () => {
    const settlingDefinition = attachEventMetadata(
      {
        ...eventDefinition,
        update: { 郭靖: { 状态: '事件完成' } },
      },
      deriveEventRuntimeDescriptor('射雕事件条目-第7回-01-宝马风波.yaml'),
    );
    const definitions = { [sourceName]: settlingDefinition, [targetName]: targetDefinition };
    const actualEnding = '郭靖改变了张家口风波的原定结局。';
    variables.stat_data.角色数据 = { 郭靖: { 状态: '事件前' } };
    variables.stat_data.参与事件 = {
      [sourceName]: {
        描述: '1219年10月10日9时 到 1219年10月10日11时，郭靖在张家口经历了一场风波。',
        结局: actualEnding,
        insert: {},
        update: { 郭靖: { 状态: '事件完成' } },
        delete: {},
      },
    };

    let failParticipationDelete = true;
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      const nextVariables = updater(clone(variables)) as typeof variables;
      const deletedParticipation =
        variables.stat_data.参与事件[sourceName] && !nextVariables.stat_data.参与事件[sourceName];
      if (failParticipationDelete && deletedParticipation) {
        failParticipationDelete = false;
        throw new Error('participation delete failed');
      }
      variables = nextVariables;
      return clone(variables);
    });

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(false);
    expect(variables.stat_data.参与事件[sourceName].结局).toBe(actualEnding);
    expect(variables.stat_data.角色数据.郭靖.状态).toBe('事件前');

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);
    expect(variables.stat_data.角色数据.郭靖.状态).toBe('事件完成');
    expect(variables.stat_data.世界事件[sourceName].概要).toBe(actualEnding);
    expect(variables.stat_data.参与事件[sourceName]).toBeUndefined();
  });

  it('freezes branch markers across a failed final transaction and clears progress after retry', async () => {
    const branchDefinition = { ...eventDefinition, 分支标记: { 黄蓉对郭靖变心: 0 } };
    const definitions = { [sourceName]: branchDefinition, [targetName]: targetDefinition };
    variables.stat_data.参与事件 = {
      [sourceName]: {
        描述: '玩家参与了事件。',
        结局: '玩家改变了事件。',
        insert: {},
        update: {},
        delete: {},
        分支标记: { 黄蓉对郭靖变心: 1 },
      },
    };

    let failCompletedWrite = true;
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      const nextVariables = updater(clone(variables)) as typeof variables;
      const insertedCompletedState =
        variables.stat_data.事件系统.已完成事件[sourceName] === undefined &&
        nextVariables.stat_data.事件系统.已完成事件[sourceName] !== undefined;
      if (failCompletedWrite && insertedCompletedState) {
        failCompletedWrite = false;
        throw new Error('completed-state write failed');
      }
      variables = nextVariables;
      return clone(variables);
    });

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(false);
    expect(variables.stat_data.参与事件[sourceName].结局).toBe('玩家改变了事件。');
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toEqual({
      分支标记: { 黄蓉对郭靖变心: 1 },
    });

    variables.stat_data.参与事件[sourceName].分支标记.黄蓉对郭靖变心 = 0;

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);
    expect(variables.stat_data.事件系统.已完成事件[sourceName]).toBe(1);
    expect(variables.stat_data.事件分支结果[sourceName]).toEqual({ 黄蓉对郭靖变心: 1 });
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toBeUndefined();
  });

  it('archives defaults for unparticipated events but keeps old participated saves unknown', async () => {
    const branchDefinition = { ...eventDefinition, 分支标记: { 黄蓉对郭靖变心: 0 } };
    await expect(
      batchEndEvents([sourceName], { [sourceName]: branchDefinition, [targetName]: targetDefinition }),
    ).resolves.toBe(true);
    expect(variables.stat_data.事件分支结果[sourceName]).toEqual({ 黄蓉对郭靖变心: 0 });

    variables.stat_data.事件系统.进行中事件[sourceName] = clone(actualEndTime);
    delete variables.stat_data.事件系统.已完成事件[sourceName];
    delete variables.stat_data.事件分支结果[sourceName];
    variables.stat_data.参与事件[sourceName] = {
      描述: '旧存档参与条目',
      结局: '旧结局',
      insert: {},
      update: {},
      delete: {},
    };

    await expect(
      batchEndEvents([sourceName], { [sourceName]: branchDefinition, [targetName]: targetDefinition }),
    ).resolves.toBe(true);
    expect(variables.stat_data.事件分支结果[sourceName]).toBeUndefined();
  });

  it('writes every new-format follow-up clue and counter without selecting a branch', async () => {
    const secondTarget = '射雕第8回01-并行后续';
    const multiSource = {
      ...eventDefinition,
      后续事件: {
        [targetName]: '第一条线索。',
        [secondTarget]: '第二条线索。',
      },
    };
    const definitions = {
      [sourceName]: multiSource,
      [targetName]: targetDefinition,
      [secondTarget]: { ...targetDefinition, 触发条件: { 事件完成: '另一个事件' } },
    };

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);

    expect(variables.stat_data.后续事件线索[targetName]).toContain('第一条线索');
    expect(variables.stat_data.后续事件线索[secondTarget]).toContain('第二条线索');
    expect(variables.stat_data.后续事件线索计数).toMatchObject({ [targetName]: 3, [secondTarget]: 3 });
  });

  it('preserves the first clue and does not renew its counter when sources converge', async () => {
    variables.stat_data.后续事件线索[targetName] = '先前来源留下的线索';
    variables.stat_data.后续事件线索计数[targetName] = 1;

    await expect(batchEndEvents([sourceName], { [sourceName]: eventDefinition, [targetName]: targetDefinition })).resolves.toBe(
      true,
    );

    expect(variables.stat_data.后续事件线索[targetName]).toBe('先前来源留下的线索');
    expect(variables.stat_data.后续事件线索计数[targetName]).toBe(1);
  });
});

describe('serialized turn completion', () => {
  it('runs event tasks in order and does not decrement counters created during this turn', async () => {
    const order: string[] = [];
    const enqueue = createSerialTaskQueue();
    const first = enqueue(async () => {
      order.push('check:start');
      await Promise.resolve();
      order.push('check:end');
    });
    const second = enqueue(async () => {
      order.push('counter');
    });
    await Promise.all([first, second]);

    expect(order).toEqual(['check:start', 'check:end', 'counter']);
    expect(buildFollowupCounterPlan({ old: 3, fresh: 3 }, new Set(['old']))).toEqual({
      updates: { old: 2 },
      expiredKeys: [],
      retainedKeys: ['fresh'],
    });
  });
});
