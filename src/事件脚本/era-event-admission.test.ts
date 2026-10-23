import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../武侠/test/setup';

const { transactionMock, notifyMock, syncMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  notifyMock: vi.fn(),
  syncMock: vi.fn(),
}));

vi.mock('./era-utils.js', () => ({
  log: vi.fn(), logError: vi.fn(), logSuccess: vi.fn(), logWarning: vi.fn(),
  debugGroup: vi.fn(), debugGroupCollapsed: vi.fn(), debugGroupEnd: vi.fn(),
  isDebugEnabled: () => false,
  isDebutEvent: () => false,
  EVENT_KIND: { ORDINARY: 'ordinary', ENCOUNTER: 'encounter' },
  hasParticipationEntry: (participation: Record<string, unknown> | undefined, name: string) => {
    const entry = participation?.[name] as Record<string, unknown> | undefined;
    return !!entry && typeof entry.描述 === 'string' && typeof entry.结局 === 'string' &&
      ['insert', 'update', 'delete'].every(key => entry[key] && typeof entry[key] === 'object');
  },
  getEndTime: (event: { 事件结束时间?: unknown }) => event.事件结束时间,
  getEventDurationHours: () => 1,
  calculateTimeOffset: (time: Record<string, number>, offset: { 时: number }) =>
    ({ ...time, 时: time.时 + offset.时 }),
  formatDate: () => '测试时刻',
  getSingleConditionTimeAnchor: (condition: unknown) => condition,
  normalizeOrdinaryEventReference: (name: string) => name,
}));
vi.mock('./era-event-schema.js', () => ({
  getSingleConditionTimeAnchor: (condition: unknown) => condition,
  normalizeBranchMarkers: () => ({}),
  normalizeFollowupEvents: () => ({}),
  isPureTimeTrigger: () => true,
}));
vi.mock('./era-event-checker.js', () => ({
  isTimeForEvent: vi.fn(), isTimeAfterEventEnd: vi.fn(), isEventStartLocationSatisfied: vi.fn(),
}));
vi.mock('./era-world-events.js', () => ({
  getEventSummary: (event: { 事件概要?: string }) => event.事件概要 || '',
  syncParticipationOutcomeStates: syncMock,
  buildWorldEventRecord: vi.fn(), buildWorldEventArchivePatch: vi.fn(), isOrdinaryWorldEvent: vi.fn(),
}));
vi.mock('./era-write-helper.js', () => ({ writeEraTransaction: transactionMock }));
vi.mock('./era-notifications.js', () => ({ notifyEvent: notifyMock }));
vi.mock('./era-event-scheduler.js', () => ({ sortUnstartedEventsByTrigger: (v: unknown) => v }));
vi.mock('../shared/directVariableWrite', () => ({ writeDirectChatTransaction: vi.fn() }));

import { batchStartEvents, batchCompleteDebutEvents, getPairedDebutEventName, playerJoinsEvents } from './era-event-operations.js';

type RecordValue = Record<string, any>;
type Operation = { type: 'insert' | 'update' | 'delete'; payload: RecordValue };

const LOCATION = '大理/无量山/琅嬛福地';
const OTHER_LOCATION = '大理/无量山/剑湖谷底';
const TIME = { 年: 1202, 月: 3, 日: 16, 时: 15 };
const END = { 年: 1202, 月: 3, 日: 16, 时: 17 };
const first = '天龙第二回06-入秘洞';
const second = '天龙第二回07-得绝学';
const definition = (name: string, location = LOCATION) => ({
  事件地点: location,
  触发条件: TIME,
  事件结束时间: END,
  事件详情: name + '详情',
  事件概要: name + '原定结局',
  参与人物: ['段誉'],
  insert: {}, update: {}, delete: {},
});
const definitions = { [first]: definition(first), [second]: definition(second) };

function applyPatch(target: RecordValue, patch: RecordValue, type: Operation['type']): void {
  for (const [key, value] of Object.entries(patch)) {
    if (type === 'delete') {
      if (value && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).length > 0 && target[key] && typeof target[key] === 'object') {
        applyPatch(target[key], value, type);
      } else {
        delete target[key];
      }
    } else if (type === 'insert') {
      if (target[key] === undefined) target[key] = structuredClone(value);
      else if (value && typeof value === 'object' && !Array.isArray(value) &&
        target[key] && typeof target[key] === 'object') {
        applyPatch(target[key], value, type);
      }
    } else if (target[key] !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value) &&
        target[key] && typeof target[key] === 'object') {
        applyPatch(target[key], value, type);
      } else {
        target[key] = structuredClone(value);
      }
    }
  }
}

describe('事件开始 / 玩家入场 ERA 单事务', () => {
  let variables: { stat_data: RecordValue };
  const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    transactionMock.mockReset();
    notifyMock.mockReset();
    eventEmitMock.mockClear();
    syncMock.mockReset().mockResolvedValue(undefined);
    variables = {
      stat_data: {
        世界信息: { 时间: TIME },
        user数据: { 所在位置: LOCATION },
        事件系统: {
          未发生事件: { [first]: TIME, [second]: TIME },
          进行中事件: {}, 已完成事件: {},
        },
        角色数据: { 段誉: { 所在位置: OTHER_LOCATION } },
        参与事件: {},
      },
    };
    getVariablesMock.mockReset().mockImplementation(() => variables);
    transactionMock.mockImplementation(async (operations: Operation[]) => {
      for (const op of operations) applyPatch(variables.stat_data, op.payload, op.type);
      return true;
    });
  });

  it('已到场的新事件一次事务写入进行中、NPC 位置、参与快照与未发生删除', async () => {
    await expect(batchStartEvents([first], definitions, { currentTime: TIME })).resolves.toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const [ops, reason] = transactionMock.mock.calls[0] as [Operation[], string];
    expect(reason).toBe('batch-start-1');
    expect(ops.map(op => op.type)).toEqual(['insert', 'update', 'insert', 'delete']);
    expect(ops[2].payload.参与事件[first]).toMatchObject({
      描述: expect.stringContaining(first + '详情'),
      结局: first + '原定结局',
      地点: LOCATION,
      insert: {}, update: {}, delete: {},
    });
    expect(variables.stat_data.事件系统.进行中事件[first]).toEqual(END);
    expect(variables.stat_data.事件系统.未发生事件[first]).toBeUndefined();
    expect(variables.stat_data.角色数据.段誉.所在位置).toBe(LOCATION);
    expect(variables.stat_data.参与事件[first]).toBeDefined();
    expect(notifyMock.mock.calls.map(([notice]) => notice.kind))
      .toEqual(['event-started', 'player-entered-event']);
    expect(eventEmitMock.mock.calls.some(([name]) => name === 'wuxia:event-admission-confirmed')).toBe(true);
  });

  it('玩家尚未到场时事件可以启动，但不提前写参与快照或参与通知', async () => {
    variables.stat_data.user数据.所在位置 = OTHER_LOCATION;
    await expect(batchStartEvents([first], definitions, { currentTime: TIME })).resolves.toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(variables.stat_data.参与事件[first]).toBeUndefined();
    expect(notifyMock.mock.calls.map(([notice]) => notice.kind)).toEqual(['event-started']);
  });

  it('已经进行中的事件允许玩家后来到场并独立加入，不再二次移动 NPC', async () => {
    delete variables.stat_data.事件系统.未发生事件[first];
    variables.stat_data.事件系统.进行中事件[first] = END;
    await expect(playerJoinsEvents([first], definitions)).resolves.toEqual([first]);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const operations = transactionMock.mock.calls[0][0] as Operation[];
    expect(operations).toHaveLength(1);
    expect(operations[0].payload.参与事件[first]).toBeDefined();
    expect(variables.stat_data.角色数据.段誉.所在位置).toBe(OTHER_LOCATION);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0][0].kind).toBe('player-entered-event');
  });

  it('上个事件结束后同地点接驳下个事件，每次开启只发生一笔事务', async () => {
    await batchStartEvents([first], definitions, { currentTime: TIME });
    delete variables.stat_data.事件系统.进行中事件[first];
    delete variables.stat_data.参与事件[first];
    variables.stat_data.事件系统.已完成事件[first] = 1;
    await batchStartEvents([second], definitions, { currentTime: TIME });
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(variables.stat_data.参与事件[second]).toBeDefined();
    expect(variables.stat_data.事件系统.进行中事件[second]).toEqual(END);
    expect(variables.stat_data.事件系统.未发生事件[second]).toBeUndefined();
    expect(notifyMock.mock.calls.filter(([notice]) => notice.kind === 'player-entered-event'))
      .toHaveLength(2);
  });

  it('ERA 未完成时不先弹参与通知；提交完成、状态回读后才通知', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    transactionMock.mockImplementationOnce(async (operations: Operation[]) => {
      await gate;
      for (const op of operations) applyPatch(variables.stat_data, op.payload, op.type);
      return true;
    });
    const pending = batchStartEvents([first], definitions, { currentTime: TIME });
    await vi.waitFor(() => expect(transactionMock).toHaveBeenCalledTimes(1));
    expect(notifyMock).not.toHaveBeenCalled();
    expect(variables.stat_data.参与事件[first]).toBeUndefined();
    release();
    await expect(pending).resolves.toBe(true);
    expect(notifyMock.mock.calls.some(([notice]) => notice.kind === 'player-entered-event')).toBe(true);
  });

  it('ERA 失败或结果未落地时绝不通知成功；既有事件后加入同样遵守', async () => {
    transactionMock.mockResolvedValueOnce(false);
    await expect(batchStartEvents([first], definitions, { currentTime: TIME })).resolves.toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(variables.stat_data.参与事件[first]).toBeUndefined();

    transactionMock.mockReset().mockResolvedValueOnce(true);
    await expect(batchStartEvents([first], definitions, { currentTime: TIME })).resolves.toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();

    delete variables.stat_data.事件系统.未发生事件[first];
    variables.stat_data.事件系统.进行中事件[first] = END;
    transactionMock.mockReset().mockResolvedValueOnce(false);
    await expect(playerJoinsEvents([first], definitions)).resolves.toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('已经参与时不会覆盖已有结局与差分快照', async () => {
    variables.stat_data.参与事件[first] = {
      描述: '旧叙事', 结局: '玩家改变过的结局', insert: {}, update: {}, delete: {},
    };
    await batchStartEvents([first], definitions, { currentTime: TIME });
    expect(variables.stat_data.参与事件[first].结局).toBe('玩家改变过的结局');
    expect(transactionMock.mock.calls[0][0].some((op: Operation) => op.payload.参与事件)).toBe(false);
    expect(notifyMock.mock.calls.map(([notice]) => notice.kind)).toEqual(['event-started']);
  });

  const chapterDebut = '天龙第七回00-人物登场';
  const chapterFirst = '天龙第七回01-段誉携木婉清归府受迎';
  const chapterSecond = '天龙第七回02-段誉述说历险隐匿神功';
  const palace = '大理/大理城/镇南王府/正厅';
  const chapterDefinitions = {
    [chapterDebut]: {
      事件类型: '登场事件',
      insert: {
        段正淳: {
          性别: '男', 境界: '一流-中期', 出生年份: 1162,
          初始属性: { 臂力: 8, 根骨: 12, 机敏: 11, 洞察: 7, 悟性: 14 },
          所在位置: '大理/大理城/镇南王府/偏厅', 人物经历: {},
        },
        刀白凤: {
          性别: '女', 境界: '二流-中期', 出生年份: 1164,
          初始属性: { 臂力: 5, 根骨: 8, 机敏: 13, 洞察: 9, 悟性: 11 },
          所在位置: palace, 人物经历: {},
        },
      },
    },
    [chapterFirst]: {
      ...definition(chapterFirst, palace),
      参与人物: ['段誉', '段正淳', '刀白凤'],
    },
    [chapterSecond]: definition(chapterSecond, palace),
  };

  it('只有同回目的 01 绑定 00；后续事件和不存在 00 的回目仍正常执行', () => {
    expect(getPairedDebutEventName(chapterFirst, chapterDefinitions)).toBe(chapterDebut);
    expect(getPairedDebutEventName(chapterSecond, chapterDefinitions)).toBeNull();
    expect(getPairedDebutEventName(first, definitions)).toBeNull();
  });

  it('01 提前触发时，同一 ERA 事务先建正式 NPC、完成 00，再让其进入 01 场景', async () => {
    variables.stat_data.user数据.所在位置 = palace;
    variables.stat_data.事件系统.未发生事件[chapterDebut] = TIME;
    variables.stat_data.事件系统.未发生事件[chapterFirst] = TIME;
    await expect(batchStartEvents([chapterFirst], chapterDefinitions, {
      currentTime: TIME, earlyEventNames: [chapterFirst],
    })).resolves.toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const operations = transactionMock.mock.calls[0][0] as Operation[];
    expect(operations[0].type).toBe('insert');
    expect(operations[0].payload.事件系统.已完成事件[chapterDebut]).toBe(0);
    expect(operations[0].payload.角色数据.段正淳.出生年份).toBe(1162);
    expect(operations.some(op => op.type === 'update' && op.payload.角色数据?.段正淳?.所在位置 === palace)).toBe(true);
    expect(variables.stat_data.角色数据.段正淳).toMatchObject({
      性别: '男', 境界: '一流-中期', 所在位置: palace,
    });
    expect(variables.stat_data.角色数据.刀白凤).toMatchObject({
      性别: '女', 境界: '二流-中期', 所在位置: palace,
    });
    expect(variables.stat_data.事件系统.已完成事件[chapterDebut]).toBe(0);
    expect(variables.stat_data.事件系统.未发生事件[chapterDebut]).toBeUndefined();
    expect(variables.stat_data.事件系统.进行中事件[chapterFirst]).toBeDefined();
    expect(variables.stat_data.参与事件[chapterFirst]).toBeDefined();
  });

  it('00 已完成时，01 不重复登场也不覆盖已经改变的人物资料', async () => {
    variables.stat_data.user数据.所在位置 = palace;
    variables.stat_data.事件系统.已完成事件[chapterDebut] = 0;
    variables.stat_data.事件系统.未发生事件[chapterFirst] = TIME;
    variables.stat_data.角色数据.段正淳 = { 性别: '男', 境界: '绝顶', 所在位置: OTHER_LOCATION };
    await expect(batchStartEvents([chapterFirst], chapterDefinitions)).resolves.toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const operations = transactionMock.mock.calls[0][0] as Operation[];
    expect(operations.every(op => !op.payload.角色数据?.刀白凤)).toBe(true);
    expect(variables.stat_data.角色数据.段正淳.境界).toBe('绝顶');
    expect(variables.stat_data.事件系统.已完成事件[chapterDebut]).toBe(0);
  });

  it('01 不能使用 manifest 空 insert 冒充正式登场定义', async () => {
    const lightweight = {
      ...chapterDefinitions,
      [chapterDebut]: { 事件类型: '登场事件', insert: {} },
    };
    await expect(batchStartEvents([chapterFirst], lightweight)).resolves.toBe(false);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('00 的 $template 空壳修复与 01 入场同一事务，保留已有经历', async () => {
    variables.stat_data.user数据.所在位置 = palace;
    variables.stat_data.事件系统.未发生事件[chapterDebut] = TIME;
    variables.stat_data.角色数据.段正淳 = {
      性别: '', 外貌: '', 性格: '', 境界: '', 出生年份: 0, 状态: '',
      初始属性: { 臂力: 0, 根骨: 0, 机敏: 0, 洞察: 0, 悟性: 0 },
      所在位置: '大理/大理城/镇南王府/书房',
      人物经历: { 既有剧情: '应保留' },
    };
    await expect(batchStartEvents([chapterFirst], chapterDefinitions)).resolves.toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(variables.stat_data.角色数据.段正淳).toMatchObject({
      性别: '男', 境界: '一流-中期', 出生年份: 1162,
      所在位置: palace, 人物经历: { 既有剧情: '应保留' },
    });
  });

  it('00 终态未落地时不把 01 参与通知视为成功', async () => {
    variables.stat_data.user数据.所在位置 = palace;
    transactionMock.mockImplementationOnce(async (operations: Operation[]) => {
      for (const op of operations) {
        if (op.payload.事件系统?.已完成事件) continue;
        applyPatch(variables.stat_data, op.payload, op.type);
      }
      return true;
    });
    await expect(batchStartEvents([chapterFirst], chapterDefinitions)).resolves.toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('NPC 先被经历插入生成模板空壳后，正式登场在同笔事务中补全默认值，保留真实位置和经历', async () => {
    const debutName = '天龙第六回00-人物登场';
    variables.stat_data.事件系统.未发生事件[debutName] = TIME;
    variables.stat_data.角色数据.风波恶 = {
      性别: '', 外貌: '', 性格: '', 境界: '',
      初始属性: { 臂力: 0, 根骨: 0, 机敏: 0, 悟性: 0, 洞察: 0 },
      出生年份: 0, 状态: '',
      所在位置: '大理/无量山/山脚废农舍/屋内',
      身份: {}, 功法: {}, 重要物品: {},
      人物经历: { 第六回02: '已有经历，不可丢失' },
      关系网: {},
    };
    const eventData = {
      事件类型: '登场事件',
      insert: {
        风波恶: {
          性别: '男', 外貌: '武人', 性格: '好斗', 境界: '二流-中期',
          初始属性: { 臂力: 11, 根骨: 10, 机敏: 15, 悟性: 7, 洞察: 5 },
          出生年份: 1168, 状态: '健康',
          所在位置: '大理/无量山/山脚废农舍/舍外',
          身份: { 姑苏慕容氏家臣: '玄霜庄庄主' },
          功法: { 劈风刀法: { 掌握程度: '融会贯通' } },
          重要物品: {}, 人物经历: {}, 关系网: {},
        },
      },
    };

    await expect(batchCompleteDebutEvents([debutName], { [debutName]: eventData })).resolves.toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const [operations] = transactionMock.mock.calls[0] as [Operation[]];
    expect(operations.map(op => op.type)).toEqual(['insert', 'update', 'insert', 'delete']);
    expect(operations[1].payload.角色数据.风波恶).not.toHaveProperty('所在位置');
    expect(variables.stat_data.角色数据.风波恶).toMatchObject({
      性别: '男', 境界: '二流-中期', 初始属性: { 臂力: 11, 机敏: 15 },
      功法: { 劈风刀法: { 掌握程度: '融会贯通' } },
      身份: { 姑苏慕容氏家臣: '玄霜庄庄主' },
      人物经历: { 第六回02: '已有经历，不可丢失' },
      所在位置: '大理/无量山/山脚废农舍/屋内',
    });
    expect(variables.stat_data.事件系统.已完成事件[debutName]).toBe(0);
  });

  it('NPC 空壳补全未成功回读时禁止登场完成通知', async () => {
    const name = '天龙第六回00-人物登场';
    variables.stat_data.事件系统.未发生事件[name] = TIME;
    variables.stat_data.角色数据.风波恶 = {
      性别: '', 境界: '', 出生年份: 0,
      初始属性: { 臂力: 0, 根骨: 0, 机敏: 0, 悟性: 0, 洞察: 0 },
    };
    // 模拟提交端只写入事件终态，没有落地人物修复。
    transactionMock.mockImplementationOnce(async (operations: Operation[]) => {
      for (const op of operations) {
        if (!op.payload.角色数据) applyPatch(variables.stat_data, op.payload, op.type);
      }
      return true;
    });
    await expect(batchCompleteDebutEvents([name], {
      [name]: { insert: { 风波恶: {
        性别: '男', 境界: '二流-中期', 出生年份: 1168,
        初始属性: { 臂力: 11, 根骨: 10, 机敏: 15, 悟性: 7, 洞察: 5 },
      } } },
    })).rejects.toThrow('登场事件事务回读未通过');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('登场事件成功后确认终态并通知，未提交或终态缺失时拒绝成功通知', async () => {
    await expect(batchCompleteDebutEvents([first], definitions)).resolves.toBe(true);
    expect(variables.stat_data.事件系统.已完成事件[first]).toBe(0);
    expect(variables.stat_data.事件系统.未发生事件[first]).toBeUndefined();
    expect(notifyMock.mock.calls.map(([notice]) => notice.kind)).toEqual(['debut-event-completed']);
    notifyMock.mockClear();
    variables.stat_data.事件系统.未发生事件[first] = TIME;
    delete variables.stat_data.事件系统.已完成事件[first];
    transactionMock.mockReset().mockResolvedValueOnce(false);
    await expect(batchCompleteDebutEvents([first], definitions)).rejects.toThrow('人物登场事件事务未确认提交');
    expect(notifyMock).not.toHaveBeenCalled();
    transactionMock.mockReset().mockResolvedValueOnce(true);
    await expect(batchCompleteDebutEvents([first], definitions)).rejects.toThrow('登场事件事务回读未通过');
    expect(notifyMock).not.toHaveBeenCalled();
  });

});
