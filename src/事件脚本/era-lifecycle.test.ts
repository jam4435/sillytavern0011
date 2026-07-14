import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isEventDiscoverable, isTimeAfterEventEnd, isTimeForEvent } from './era-event-checker.js';
import {
  areEventPredecessorsCompleted,
  batchEndEvents,
  batchStartEvents,
  buildActualEventWindow,
  buildPlayerParticipationEntry,
  getValidEventPredecessors,
} from './era-event-operations.js';
import { createSerialTaskQueue, buildFollowupCounterPlan } from './era-turn-queue.js';
import { attachEventMetadata, deriveEventRuntimeDescriptor } from './era-utils.js';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sourceName = '射雕第7回01-宝马风波';
const secondSourceName = '射雕第7回02-初遇黄蓉';
const targetName = '射雕第7回03-比武招亲';
const actualEndTime = { 年: 1219, 月: 10, 日: 10, 时: 11 };

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
});

describe('early-start predecessor gates', () => {
  it('requires every valid incoming predecessor while ignoring dangling placeholders', () => {
    const secondSourceDefinition = {
      ...eventDefinition,
      后续事件: { 事件名: targetName, 描述: '另一条前置线索。' },
    };
    const danglingDefinition = {
      ...eventDefinition,
      后续事件: { 事件名: '第XX回-待定', 描述: '占位引用。' },
    };
    const definitions = {
      [sourceName]: eventDefinition,
      [secondSourceName]: secondSourceDefinition,
      [targetName]: targetDefinition,
      '射雕第7回99-占位': danglingDefinition,
    };

    expect(getValidEventPredecessors(targetName, definitions)).toEqual([sourceName, secondSourceName]);
    expect(areEventPredecessorsCompleted(targetName, definitions, { [sourceName]: 0 })).toBe(false);
    expect(
      areEventPredecessorsCompleted(targetName, definitions, { [sourceName]: 0, [secondSourceName]: 1 }),
    ).toBe(true);
  });
});

describe('completion persistence and follow-up pairs', () => {
  let variables: any;

  beforeEach(() => {
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
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      variables = updater(clone(variables)) as typeof variables;
      return clone(variables);
    });
    Object.assign(globalThis, {
      toastr: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
    });
  });

  it('stores an early actual end without creating any in-progress follow-up data', async () => {
    variables.stat_data.事件系统.未发生事件 = { [sourceName]: eventDefinition.触发条件 };
    variables.stat_data.事件系统.进行中事件 = {};
    const earlyTime = { 年: 1219, 月: 10, 日: 10, 时: 9 };

    await batchStartEvents([sourceName], { [sourceName]: eventDefinition }, {
      currentTime: earlyTime,
      earlyEventNames: [sourceName],
    });

    expect(variables.stat_data.事件系统.进行中事件[sourceName]).toEqual(actualEndTime);
    expect(variables.stat_data.事件系统.未发生事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.后续事件线索).toEqual({});
    expect(variables.stat_data.后续事件线索计数).toEqual({});
  });

  it('archives the actual window and creates clue plus counter only after completion', async () => {
    const definitions = { [sourceName]: eventDefinition, [targetName]: targetDefinition };

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);

    expect(variables.stat_data.世界事件[sourceName].时间).toEqual(actualEndTime);
    expect(variables.stat_data.事件系统.已完成事件[sourceName]).toBe(0);
    expect(variables.stat_data.事件系统.进行中事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.参与事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.后续事件线索[sourceName]).toContain('江南似有新的风波');
    expect(variables.stat_data.后续事件线索计数[sourceName]).toBe(3);
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toBeUndefined();
  });

  it('retains settlement progress and safely fills a failed follow-up write on retry', async () => {
    const definitions = { [sourceName]: eventDefinition, [targetName]: targetDefinition };
    let writeCount = 0;
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      writeCount += 1;
      if (writeCount === 5) {
        throw new Error('follow-up write failed');
      }
      variables = updater(clone(variables)) as typeof variables;
      return clone(variables);
    });

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(false);
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toEqual({
      差分已应用: true,
      玩家参与: false,
    });
    expect(variables.stat_data.后续事件线索[sourceName]).toBeUndefined();

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);
    expect(variables.stat_data.后续事件线索计数[sourceName]).toBe(3);
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toBeUndefined();
  });

  it('retries a failed participation deletion without applying the event diff twice or losing the ending', async () => {
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

    let diffApplyCount = 0;
    eventOn('era:updateByObject', (payload: any) => {
      diffApplyCount += 1;
      variables.stat_data.角色数据.郭靖.状态 = payload.角色数据.郭靖.状态;
      window.setTimeout(() => {
        void eventEmit('era:writeDone', { actions: { apply: true } });
      }, 0);
    });

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(false);
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toEqual({
      差分已应用: true,
      玩家参与: true,
    });
    expect(variables.stat_data.参与事件[sourceName].结局).toBe(actualEnding);
    expect(diffApplyCount).toBe(1);

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);
    expect(diffApplyCount).toBe(1);
    expect(variables.stat_data.角色数据.郭靖.状态).toBe('事件完成');
    expect(variables.stat_data.世界事件[sourceName].概要).toBe(actualEnding);
    expect(variables.stat_data.参与事件[sourceName]).toBeUndefined();
  });

  it('preserves the participation flag when completed-state write fails after participation is removed', async () => {
    const definitions = { [sourceName]: eventDefinition, [targetName]: targetDefinition };
    variables.stat_data.参与事件 = {
      [sourceName]: {
        描述: '玩家参与了事件。',
        结局: '玩家改变了事件。',
        insert: {},
        update: {},
        delete: {},
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
    expect(variables.stat_data.参与事件[sourceName]).toBeUndefined();
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toEqual({
      差分已应用: true,
      玩家参与: true,
    });

    await expect(batchEndEvents([sourceName], definitions)).resolves.toBe(true);
    expect(variables.stat_data.事件系统.已完成事件[sourceName]).toBe(1);
    expect(variables.stat_data.前端变量.事件结算进度[sourceName]).toBeUndefined();
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
