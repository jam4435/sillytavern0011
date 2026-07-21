import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventOnMock } from '../武侠/test/setup';

const logErrorMock = vi.fn();
const initializeEventListMock = vi.fn();
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;

vi.mock('./era-utils.js', () => ({
  log: vi.fn(),
  logError: logErrorMock,
  logSuccess: vi.fn(),
  logWarning: vi.fn(),
  isDebugEnabled: vi.fn(() => false),
  hasParticipationEntry: vi.fn(() => false),
  isDebutEvent: vi.fn(() => false),
  formatDate: vi.fn(() => '测试时间'),
  attachEventMetadata: vi.fn((data, metadata) => data),
  deriveEventRuntimeDescriptor: vi.fn(name => ({ runtimeKey: name, kind: 'ordinary' })),
}));

vi.mock('./era-event-loader.js', () => ({
  loadEventDefinitionsFromWorldbook: vi.fn(async () => ({})),
  loadEventDefinitions: vi.fn(async () => ({})),
  loadEventManifest: vi.fn(async () => ({ events: [] })),
  loadEventCheckpointAtOrBefore: vi.fn(async () => null),
}));

vi.mock('./era-event-checker.js', () => ({
  isTimeForEvent: vi.fn(() => false),
  isEventDiscoverable: vi.fn(() => false),
  isTimeAfterEventEnd: vi.fn(() => false),
}));

vi.mock('./era-event-operations.js', () => ({
  initializeEventList: initializeEventListMock,
  batchStartEvents: vi.fn(),
  batchCompleteDebutEvents: vi.fn(),
  playerJoinsEvents: vi.fn(),
  batchEndEvents: vi.fn(),
  applyTimedParticipantEntries: vi.fn(),
  areEventPredecessorsCompleted: vi.fn(() => true),
  cleanupFollowupCluesForActiveParticipation: vi.fn(),
  cleanupInvalidParticipationEntries: vi.fn(),
}));

vi.mock('./era-participant-entry.js', () => ({
  getRumorScopeFromEventLocation: vi.fn(() => []),
  isLocationWithinRumorScope: vi.fn(() => false),
  normalizeLocationPath: vi.fn(value => value),
}));

vi.mock('./era-world-events.js', () => ({
  reconcileWorldEventArchive: vi.fn(),
  syncParticipationOutcomeStates: vi.fn(),
}));

vi.mock('./era-runtime-state.js', () => ({
  needsEventRuntimeStateReset: vi.fn(() => false),
  resetLegacyEventRuntimeState: vi.fn(async () => true),
}));

vi.mock('./era-turn-queue.js', () => ({
  buildFollowupCounterPlan: vi.fn(),
  createSerialTaskQueue: vi.fn(() => (work: () => unknown) => work()),
}));

vi.mock('./era-write-helper.js', () => ({
  writeDirectAssign: vi.fn(),
  writeDirectUpdate: vi.fn(),
  writeDirectDelete: vi.fn(),
}));

const validVariables = () => ({
  stat_data: {
    世界信息: { 时间: { 年: 1199, 月: 8, 日: 15, 时: 11 } },
    前端变量: { 事件运行时键版本: 2 },
    事件系统: { 未发生事件: {}, 进行中事件: {}, 已完成事件: {} },
    user数据: {},
  },
});

describe('ERA 主线初始化控制', () => {
  beforeEach(() => {
    vi.resetModules();
    logErrorMock.mockReset();
    initializeEventListMock.mockReset();
    getVariablesMock.mockReset().mockReturnValue(validVariables());
    Object.assign(globalThis, {
      waitGlobalInitialized: vi.fn(() => new Promise(() => {})),
      toastr: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    });
  });

  it('initializeEventList 抛错时初始化返回失败且不显示成功 toast', async () => {
    initializeEventListMock.mockRejectedValueOnce(new Error('测试初始化失败'));

    // Vite 支持 query-string 作为隔离的模块 URL，TypeScript 不解析该虚拟路径。
    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?initialize-error-test');
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(logErrorMock).toHaveBeenCalled());

    expect(logErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('ERA 事件系统初始化失败'),
      expect.objectContaining({ message: '测试初始化失败' }),
    );
    expect(globalThis.toastr.success).not.toHaveBeenCalled();

    const gameInitializedListener = eventOnMock.mock.calls.find(([name]) => name === 'GameInitialized')?.[1] as
      | ((signal: { timestamp: number }) => unknown)
      | undefined;
    initializeEventListMock.mockResolvedValue(undefined);
    gameInitializedListener?.({ timestamp: Date.now() });
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(globalThis.toastr.success).toHaveBeenCalledTimes(1));
  });

  it('GameInitialized 监听器可以立即合并重复调度请求', async () => {
    initializeEventListMock.mockResolvedValue(undefined);

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?initialize-dedupe-test');
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(1));
    const gameInitializedListener = eventOnMock.mock.calls.find(([name]) => name === 'GameInitialized')?.[1] as
      | ((signal: { timestamp: number }) => unknown)
      | undefined;
    expect(gameInitializedListener).toBeTypeOf('function');

    const signal = { timestamp: Date.now() + 1000 };
    gameInitializedListener?.(signal);
    gameInitializedListener?.(signal);
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(2));

    expect(initializeEventListMock).toHaveBeenCalledTimes(2);
  });

  it('开局先登记玩家参与，再处理可能失败的定时人物入场', async () => {
    const eventName = '射雕测试事件-开局到场';
    const eventLocation = '大宋/嘉兴府/牛家村';
    const variables = validVariables();
    variables.stat_data.user数据 = { 所在位置: eventLocation };
    variables.stat_data.事件系统.进行中事件 = {
      [eventName]: { 年: 1199, 月: 8, 日: 16, 时: 11 },
    };
    getVariablesMock.mockReturnValue(variables);
    initializeEventListMock.mockResolvedValue(undefined);

    const loader = await import('./era-event-loader.js');
    const checker = await import('./era-event-checker.js');
    const operations = await import('./era-event-operations.js');
    const definition = {
      事件地点: eventLocation,
      触发条件: { 类型: '时间', 年: 1199, 月: 8, 日: 15, 时: 10 },
      事件结束时间: { 年: 1199, 月: 8, 日: 16, 时: 11 },
      事件详情: '测试事件',
      事件概要: '测试概要',
      参与人物: [],
      insert: {},
      update: {},
      delete: {},
    };

    vi.mocked(loader.loadEventManifest).mockResolvedValue({
      events: [{ runtimeKey: eventName, location: eventLocation }],
      indexes: { byTrigger: [], byDiscovery: [] },
    } as never);
    vi.mocked(loader.loadEventDefinitions).mockResolvedValue({ [eventName]: definition });
    vi.mocked(checker.isTimeForEvent).mockReturnValue(false);
    vi.mocked(checker.isEventDiscoverable).mockReturnValue(false);
    vi.mocked(checker.isTimeAfterEventEnd).mockReturnValue(false);
    vi.mocked(operations.playerJoinsEvents).mockClear();
    vi.mocked(operations.applyTimedParticipantEntries).mockClear().mockRejectedValueOnce(new Error('NPC 入场写入超时'));

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?opening-participation-priority-test');

    await vi.waitFor(() => expect(operations.applyTimedParticipantEntries).toHaveBeenCalledTimes(1));
    expect(operations.playerJoinsEvents).toHaveBeenCalledWith([eventName], expect.objectContaining({
      [eventName]: definition,
    }));
    expect(vi.mocked(operations.playerJoinsEvents).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(operations.applyTimedParticipantEntries).mock.invocationCallOrder[0],
    );
    expect(logErrorMock).toHaveBeenCalledWith(
      '定时参与人物入场失败，已保留本轮玩家参与判定:',
      expect.objectContaining({ message: 'NPC 入场写入超时' }),
    );
  });

  it('清理非法参与条目后使用回读快照在同轮重新加入', async () => {
    const eventName = '射雕测试事件-清理后加入';
    const eventLocation = '大宋/嘉兴府/牛家村';
    const variables = validVariables() as ReturnType<typeof validVariables> & {
      stat_data: ReturnType<typeof validVariables>['stat_data'] & { 参与事件: Record<string, unknown> };
    };
    variables.stat_data.user数据 = { 所在位置: eventLocation };
    variables.stat_data.参与事件 = { [eventName]: { 非法字段: true } };
    variables.stat_data.事件系统.进行中事件 = {
      [eventName]: { 年: 1199, 月: 8, 日: 16, 时: 11 },
    };
    getVariablesMock.mockReturnValue(variables);
    initializeEventListMock.mockResolvedValue(undefined);

    const loader = await import('./era-event-loader.js');
    const checker = await import('./era-event-checker.js');
    const operations = await import('./era-event-operations.js');
    const utils = await import('./era-utils.js');
    const definition = {
      事件地点: eventLocation,
      触发条件: { 类型: '时间', 年: 1199, 月: 8, 日: 15, 时: 10 },
      事件结束时间: { 年: 1199, 月: 8, 日: 16, 时: 11 },
      事件详情: '测试事件',
      事件概要: '测试概要',
      参与人物: [],
      insert: {},
      update: {},
      delete: {},
    };

    vi.mocked(loader.loadEventManifest).mockResolvedValue({
      events: [{ runtimeKey: eventName, location: eventLocation }],
      indexes: { byTrigger: [], byDiscovery: [] },
    } as never);
    vi.mocked(loader.loadEventDefinitions).mockResolvedValue({ [eventName]: definition });
    vi.mocked(checker.isTimeForEvent).mockReturnValue(false);
    vi.mocked(checker.isEventDiscoverable).mockReturnValue(false);
    vi.mocked(checker.isTimeAfterEventEnd).mockReturnValue(false);
    vi.mocked(utils.hasParticipationEntry).mockImplementation(
      (participation, name) => Object.prototype.hasOwnProperty.call(participation || {}, name),
    );
    vi.mocked(operations.cleanupInvalidParticipationEntries).mockImplementation(async () => {
      variables.stat_data.参与事件 = {};
      return 1;
    });
    vi.mocked(operations.playerJoinsEvents).mockClear();
    vi.mocked(operations.applyTimedParticipantEntries).mockResolvedValue(undefined);

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?opening-participation-cleanup-test');

    await vi.waitFor(() => expect(operations.playerJoinsEvents).toHaveBeenCalledTimes(1));
    expect(operations.playerJoinsEvents).toHaveBeenCalledWith([eventName], expect.any(Object));
  });

  it('定时人物入场只处理本轮尚未结束的事件', async () => {
    const activeEvent = '射雕测试事件-仍在进行';
    const endedEvent = '射雕测试事件-已经结束';
    const variables = validVariables();
    variables.stat_data.事件系统.进行中事件 = {
      [activeEvent]: { 年: 1199, 月: 8, 日: 16, 时: 11 },
      [endedEvent]: { 年: 1199, 月: 8, 日: 14, 时: 11 },
    };
    getVariablesMock.mockReturnValue(variables);
    initializeEventListMock.mockResolvedValue(undefined);

    const loader = await import('./era-event-loader.js');
    const checker = await import('./era-event-checker.js');
    const operations = await import('./era-event-operations.js');
    const definitions = Object.fromEntries(
      [activeEvent, endedEvent].map(eventName => [
        eventName,
        {
          事件地点: '大宋/嘉兴府/牛家村',
          触发条件: { 类型: '时间', 年: 1199, 月: 8, 日: 13, 时: 10 },
          事件结束时间: variables.stat_data.事件系统.进行中事件[eventName],
          事件详情: '测试事件',
          事件概要: '测试概要',
          参与人物: [],
          insert: {},
          update: {},
          delete: {},
        },
      ]),
    );

    vi.mocked(loader.loadEventManifest).mockResolvedValue({
      events: [activeEvent, endedEvent].map(runtimeKey => ({ runtimeKey })),
      indexes: { byTrigger: [], byDiscovery: [] },
    } as never);
    vi.mocked(loader.loadEventDefinitions).mockResolvedValue(definitions);
    vi.mocked(checker.isTimeForEvent).mockReturnValue(false);
    vi.mocked(checker.isEventDiscoverable).mockReturnValue(false);
    vi.mocked(checker.isTimeAfterEventEnd).mockImplementation((_currentTime, endTime) => endTime.日 === 14);
    vi.mocked(operations.batchEndEvents).mockResolvedValue(true);
    vi.mocked(operations.applyTimedParticipantEntries).mockClear().mockResolvedValue(undefined);

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?opening-active-participants-only-test');

    await vi.waitFor(() => expect(operations.applyTimedParticipantEntries).toHaveBeenCalledTimes(1));
    expect(operations.batchEndEvents).toHaveBeenCalledWith([endedEvent], expect.any(Object));
    expect(operations.applyTimedParticipantEntries).toHaveBeenCalledWith(
      [activeEvent],
      expect.any(Object),
      variables.stat_data.世界信息.时间,
      variables,
    );
  });
});
