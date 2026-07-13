import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../武侠/test/setup';
import {
  EVENT_OUTCOME_STATUS,
  buildParticipationOutcomeSyncPlan,
  buildWorldEventArchivePatch,
  ensureWorldEventsArchived,
  reconcileWorldEventArchive,
  syncParticipationOutcomeStates,
} from './era-world-events.js';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const eventName = '射雕事件条目-第7回-02-初遇黄蓉.yaml';
const eventDefinition = {
  事件地点: '大宋/张家口',
  事件概要: '郭靖结识黄蓉并请她吃饭，两人由此建立初步情谊。',
  事件结束时间: { 年: 1219, 月: 10, 日: 20, 时: 15 },
  insert: { 郭靖: { 人物经历: { 初遇黄蓉: '在张家口结识黄蓉。' } } },
  update: { 黄蓉: { 所在位置: '大宋/张家口' } },
  delete: {},
};

function participation(ending = eventDefinition.事件概要) {
  return {
    描述: '郭靖在张家口初遇黄蓉。',
    结局: ending,
    insert: clone(eventDefinition.insert),
    update: clone(eventDefinition.update),
    delete: {},
  };
}

describe('event outcome state planning', () => {
  it('initializes an unchanged participation as original', () => {
    const plan = buildParticipationOutcomeSyncPlan(
      { [eventName]: eventDefinition },
      { 参与事件: { [eventName]: participation() }, 前端变量: { 事件结局状态: {} } },
    );

    expect(plan.statusInserts).toEqual({ [eventName]: EVENT_OUTCOME_STATUS.ORIGINAL });
    expect(plan.conclusionUpdates).toEqual({});
  });

  it('marks changed text or diffs as diverged', () => {
    const changed = participation('郭靖没有结识黄蓉，独自离开张家口。');
    changed.update.黄蓉.所在位置 = '大宋/临安府';
    const plan = buildParticipationOutcomeSyncPlan(
      { [eventName]: eventDefinition },
      {
        参与事件: { [eventName]: changed },
        前端变量: { 事件结局状态: { [eventName]: EVENT_OUTCOME_STATUS.ORIGINAL } },
      },
    );

    expect(plan.statusUpdates).toEqual({ [eventName]: EVENT_OUTCOME_STATUS.DIVERGED });
  });

  it('migrates an empty legacy ending without hiding changed diffs', () => {
    const changed = participation('');
    changed.delete = { 黄蓉: { 所在位置: {} } };
    const plan = buildParticipationOutcomeSyncPlan(
      { [eventName]: eventDefinition },
      { 参与事件: { [eventName]: changed } },
    );

    expect(plan.statusInserts[eventName]).toBe(EVENT_OUTCOME_STATUS.UNKNOWN);
    expect(plan.conclusionUpdates[eventName].结局).toContain('具体结果尚未记录');
  });
});

describe('world event archive', () => {
  beforeEach(() => {
    eventEmitMock.mockClear();
  });

  it('uses the actual participation ending and never overwrites an archive', () => {
    const patch = buildWorldEventArchivePatch(
      [eventName],
      { [eventName]: eventDefinition },
      { 参与事件: { [eventName]: participation('郭靖错过黄蓉，独自离开张家口。') } },
    );

    expect(patch[eventName]).toEqual({
      时间: eventDefinition.事件结束时间,
      地点: eventDefinition.事件地点,
      概要: '郭靖错过黄蓉，独自离开张家口。',
    });
    expect(
      buildWorldEventArchivePatch([eventName], { [eventName]: eventDefinition }, { 世界事件: patch }),
    ).toEqual({});
  });

  it('uses the canonical summary for an unparticipated or expired event', () => {
    const patch = buildWorldEventArchivePatch([eventName], { [eventName]: eventDefinition }, {});

    expect(patch[eventName].概要).toBe(eventDefinition.事件概要);
  });

  it('stores hidden state through direct chat writes without ERA commands', async () => {
    let variables: any = {
      stat_data: {
        参与事件: { [eventName]: participation() },
        前端变量: { 事件结局状态: {} },
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => clone(variables));
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      variables = updater(clone(variables)) as typeof variables;
      return variables;
    });

    await syncParticipationOutcomeStates({ [eventName]: eventDefinition });

    expect(variables.stat_data.前端变量.事件结局状态[eventName]).toBe(EVENT_OUTCOME_STATUS.ORIGINAL);
    expect(eventEmitMock).toHaveBeenCalledWith('wuxia:directVariableWriteDone', expect.any(Object));
    expect(eventEmitMock.mock.calls.some(([name]) => String(name).startsWith('era:'))).toBe(false);
  });

  it('reports archive persistence failure so settlement can retain participation', async () => {
    const variables = {
      stat_data: {
        参与事件: { [eventName]: participation() },
        世界事件: {},
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => clone(variables));
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(() => {
      throw new Error('write failed');
    });

    await expect(ensureWorldEventsArchived([eventName], { [eventName]: eventDefinition })).resolves.toBe(false);
    expect(variables.stat_data.参与事件[eventName]).toEqual(participation());
  });

  it('does not rewrite an existing archive when settlement retries', async () => {
    let variables: any = {
      stat_data: {
        参与事件: { [eventName]: participation() },
        世界事件: {},
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => clone(variables));
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      variables = updater(clone(variables)) as typeof variables;
      return variables;
    });

    await expect(ensureWorldEventsArchived([eventName], { [eventName]: eventDefinition })).resolves.toBe(true);
    const firstArchive = clone(variables.stat_data.世界事件);
    eventEmitMock.mockClear();

    await expect(ensureWorldEventsArchived([eventName], { [eventName]: eventDefinition })).resolves.toBe(true);

    expect(variables.stat_data.世界事件).toEqual(firstArchive);
    expect(eventEmitMock).not.toHaveBeenCalled();
  });

  it('backfills an unparticipated completed event with its canonical summary', async () => {
    let variables: any = {
      stat_data: {
        参与事件: {},
        世界事件: {},
        事件系统: { 已完成事件: { [eventName]: 0 } },
        前端变量: { 事件结局状态: {} },
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => clone(variables));
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      variables = updater(clone(variables)) as typeof variables;
      return variables;
    });

    await reconcileWorldEventArchive({ [eventName]: eventDefinition });

    expect(variables.stat_data.世界事件[eventName].概要).toBe(eventDefinition.事件概要);
    expect(variables.stat_data.前端变量.事件结局状态).toEqual({});
  });

  it('backfills an unrecoverable participated event as unknown', async () => {
    const legacyEventName = '射雕事件条目-第8回-01-旧存档事件.yaml';
    let variables: any = {
      stat_data: {
        参与事件: {},
        世界事件: {},
        事件系统: { 已完成事件: { [legacyEventName]: 1 } },
        前端变量: { 事件结局状态: {} },
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => clone(variables));
    vi.mocked(globalThis.updateVariablesWith).mockImplementation(updater => {
      variables = updater(clone(variables)) as typeof variables;
      return variables;
    });

    await reconcileWorldEventArchive({ [legacyEventName]: eventDefinition });

    expect(variables.stat_data.世界事件[legacyEventName].概要).toContain('旧存档未保存玩家参与后的具体结局');
    expect(variables.stat_data.前端变量.事件结局状态[legacyEventName]).toBe(EVENT_OUTCOME_STATUS.UNKNOWN);
    expect(eventEmitMock.mock.calls.some(([name]) => String(name).startsWith('era:'))).toBe(false);
  });
});
