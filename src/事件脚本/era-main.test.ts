import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock, eventOnMock } from '../武侠/test/setup';

const logErrorMock = vi.fn();
const initializeEventListMock = vi.fn();
const readHistoryCheckoutJournalMock = vi.fn();
const reconcileWorldEventArchiveMock = vi.fn();
const syncParticipationOutcomeStatesMock = vi.fn();
const cleanupInvalidParticipationEntriesMock = vi.fn();
const writeDirectAssignMock = vi.fn();
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
  cleanupInvalidParticipationEntries: cleanupInvalidParticipationEntriesMock,
}));

vi.mock('./era-participant-entry.js', () => ({
  getRumorScopeFromEventLocation: vi.fn(() => []),
  isLocationWithinRumorScope: vi.fn(() => false),
  normalizeLocationPath: vi.fn(value => value),
}));

vi.mock('./era-world-events.js', () => ({
  reconcileWorldEventArchive: reconcileWorldEventArchiveMock,
  syncParticipationOutcomeStates: syncParticipationOutcomeStatesMock,
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
  writeDirectAssign: writeDirectAssignMock,
  writeEraTransaction: vi.fn(),
}));

vi.mock('../shared/historyCheckoutJournal', () => ({
  readHistoryCheckoutJournal: readHistoryCheckoutJournalMock,
  isHistoryCheckoutJournalExpired: vi.fn(() => false),
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
    reconcileWorldEventArchiveMock.mockReset();
    syncParticipationOutcomeStatesMock.mockReset();
    cleanupInvalidParticipationEntriesMock.mockReset();
    writeDirectAssignMock.mockReset();
    eventEmitMock.mockClear();
    readHistoryCheckoutJournalMock.mockReset().mockReturnValue(null);
    getVariablesMock.mockReset().mockReturnValue(validVariables());
    Object.assign(globalThis, {
      waitGlobalInitialized: vi.fn(() => new Promise(() => {})),
      toastr: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    });
  });

  it('history checkout journal pending 时暂停初始化，commit 后恢复', async () => {
    vi.useFakeTimers();
    initializeEventListMock.mockResolvedValue(undefined);
    readHistoryCheckoutJournalMock.mockReturnValue({
      version: 1,
      transactionId: 'checkout-test',
      stage: 'activate_swipe',
      targetNodeId: 'node-1',
      targetLocator: {
        chatId: 'test-chat',
        chatName: 'test',
        userMessageId: 1,
        assistantMessageId: 2,
        swipeId: 1,
      },
      sourceHeadNodeId: 'node-0',
      sourceChatId: 'test-chat',
      sourceChatName: 'test',
      startedAt: Date.now(),
    });

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?history-checkout-pause-test');
    expect(initializeEventListMock).not.toHaveBeenCalled();

    readHistoryCheckoutJournalMock.mockReturnValue({
      ...readHistoryCheckoutJournalMock.mock.results.at(-1)?.value,
      stage: 'commit',
    });
    await vi.advanceTimersByTimeAsync(150);
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(1));
  });

  it('checkout 校验握手可在 journal pending 时完成非 root 初始化和稳定事件检查', async () => {
    const eventName = '射雕测试事件-checkout校验';
    const checkoutVariables = validVariables() as ReturnType<typeof validVariables> & {
      stat_data: ReturnType<typeof validVariables>['stat_data'] & { 附近传闻: Record<string, string> };
    };
    checkoutVariables.stat_data.附近传闻 = { 旧分支传闻: '应在 checkout 校验前清除' };
    getVariablesMock.mockReturnValue(checkoutVariables);
    initializeEventListMock.mockResolvedValue(undefined);
    readHistoryCheckoutJournalMock.mockReturnValue({
      version: 1,
      transactionId: 'checkout-verify-test',
      stage: 'verify',
      targetNodeId: 'node-verify',
      targetLocator: {
        chatId: 'test-chat',
        chatName: 'test',
        userMessageId: 1,
        assistantMessageId: 2,
        swipeId: 0,
      },
      sourceHeadNodeId: 'node-source',
      sourceChatId: 'test-chat',
      sourceChatName: 'test',
      startedAt: Date.now(),
    });
    const loader = await import('./era-event-loader.js');
    vi.mocked(loader.loadEventManifest).mockResolvedValue({
      events: [{ runtimeKey: eventName }],
      indexes: { byTrigger: [], byDiscovery: [] },
    } as never);
    vi.mocked(loader.loadEventDefinitions).mockResolvedValue({
      [eventName]: {
        触发条件: { 类型: '时间', 年: 1300, 月: 1, 日: 1, 时: 0 },
        事件结束时间: { 年: 1300, 月: 1, 日: 2, 时: 0 },
        事件详情: 'checkout 校验事件',
        事件概要: 'checkout 校验事件',
        参与人物: [],
        insert: {},
        update: {},
        delete: {},
      },
    });

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?history-checkout-prepare-verification-test');
    await vi.waitFor(() =>
      expect(eventOnMock.mock.calls.some(([name]) => name === 'wuxia:history-checkout-prepare-verification')).toBe(
        true,
      ),
    );
    expect(initializeEventListMock).not.toHaveBeenCalled();

    const prepareListener = eventOnMock.mock.calls
      .filter(([name]) => name === 'wuxia:history-checkout-prepare-verification')
      .at(-1)?.[1] as ((detail: { transactionId: string }) => Promise<void>) | undefined;
    await prepareListener?.({ transactionId: 'checkout-verify-test' });

    expect(initializeEventListMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ rootBootstrap: false }),
    );
    expect(syncParticipationOutcomeStatesMock).toHaveBeenCalledTimes(1);
    expect(cleanupInvalidParticipationEntriesMock).toHaveBeenCalledTimes(1);
    expect(writeDirectAssignMock).toHaveBeenCalledWith({ 附近传闻: {} }, 'update-nearby-rumors');
    expect(initializeEventListMock.mock.invocationCallOrder[0]).toBeLessThan(
      syncParticipationOutcomeStatesMock.mock.invocationCallOrder[0],
    );
    expect(syncParticipationOutcomeStatesMock.mock.invocationCallOrder[0]).toBeLessThan(
      cleanupInvalidParticipationEntriesMock.mock.invocationCallOrder[0],
    );
    expect(eventEmitMock.mock.calls.some(([name]) => name === 'wuxia:history-event-state-stable')).toBe(false);
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
      ((signal: { timestamp: number }) => unknown) | undefined;
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
      ((signal: { timestamp: number }) => unknown) | undefined;
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
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(1));
    const gameInitializedListener = eventOnMock.mock.calls
      .filter(([name]) => name === 'GameInitialized')
      .at(-1)?.[1] as ((signal: { timestamp: number }) => unknown) | undefined;
    gameInitializedListener?.({ timestamp: Date.now() + 100_000 });

    await vi.waitFor(() => expect(operations.applyTimedParticipantEntries).toHaveBeenCalledTimes(1));
    expect(operations.playerJoinsEvents).toHaveBeenCalledWith(
      [eventName],
      expect.objectContaining({
        [eventName]: definition,
      }),
    );
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
    vi.mocked(utils.hasParticipationEntry).mockImplementation((participation, name) =>
      Object.prototype.hasOwnProperty.call(participation || {}, name),
    );
    vi.mocked(operations.cleanupInvalidParticipationEntries).mockImplementation(async () => {
      variables.stat_data.参与事件 = {};
      return 1;
    });
    vi.mocked(operations.playerJoinsEvents).mockClear();
    vi.mocked(operations.applyTimedParticipantEntries).mockResolvedValue(undefined);

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?opening-participation-cleanup-test');
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(1));
    const gameInitializedListener = eventOnMock.mock.calls
      .filter(([name]) => name === 'GameInitialized')
      .at(-1)?.[1] as ((signal: { timestamp: number }) => unknown) | undefined;
    gameInitializedListener?.({ timestamp: Date.now() + 100_000 });

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
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(1));
    const gameInitializedListener = eventOnMock.mock.calls
      .filter(([name]) => name === 'GameInitialized')
      .at(-1)?.[1] as ((signal: { timestamp: number }) => unknown) | undefined;
    gameInitializedListener?.({ timestamp: Date.now() + 100_000 });

    await vi.waitFor(() => expect(operations.applyTimedParticipantEntries).toHaveBeenCalledTimes(1));
    expect(operations.batchEndEvents).toHaveBeenCalledWith([endedEvent], expect.any(Object));
    expect(operations.applyTimedParticipantEntries).toHaveBeenCalledWith(
      [activeEvent],
      expect.any(Object),
      variables.stat_data.世界信息.时间,
      variables,
    );
  });

  it('普通 CHAT_CHANGED 不做 direct 历史补算，但会 ERA 检查并在状态稳定后通知重封存', async () => {
    const historicalEvent = '射雕测试事件-已有存档历史事件';
    const variables = validVariables();
    variables.stat_data.事件系统 = {
      未发生事件: {},
      进行中事件: {
        [historicalEvent]: { 年: 1000, 月: 1, 日: 2, 时: 0 },
      },
      已完成事件: {},
    };
    getVariablesMock.mockReturnValue(variables);
    initializeEventListMock.mockResolvedValue(undefined);

    const loader = await import('./era-event-loader.js');
    const checker = await import('./era-event-checker.js');
    const operations = await import('./era-event-operations.js');
    vi.mocked(loader.loadEventManifest).mockResolvedValue({
      events: [{ runtimeKey: historicalEvent, triggerHour: 1, endHour: 2 }],
      indexes: { byTrigger: [], byDiscovery: [] },
    } as never);
    vi.mocked(loader.loadEventDefinitions).mockResolvedValue({
      [historicalEvent]: {
        触发条件: { 类型: '时间', 年: 1000, 月: 1, 日: 1, 时: 0 },
        事件结束时间: { 年: 1000, 月: 1, 日: 2, 时: 0 },
        事件详情: '早已结束的历史事件',
        事件概要: '不应在当前楼层追补',
        参与人物: [],
        insert: { 郭靖: { 状态: '不应应用' } },
        update: {},
        delete: {},
      },
    });
    vi.mocked(checker.isTimeForEvent).mockReturnValue(true);
    vi.mocked(checker.isTimeAfterEventEnd).mockReturnValue(true);
    vi.mocked(operations.batchEndEvents).mockImplementation(async () => {
      delete variables.stat_data.事件系统.进行中事件[historicalEvent];
      variables.stat_data.事件系统.已完成事件[historicalEvent] = 0;
      return true;
    });

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?chat-changed-existing-save-no-catch-up-test');
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(eventEmitMock).toHaveBeenCalledWith(
        'wuxia:history-event-state-stable',
        expect.objectContaining({ reason: 'startup-existing-chat' }),
      ),
    );

    variables.stat_data.事件系统.进行中事件 = {
      [historicalEvent]: { 年: 1000, 月: 1, 日: 2, 时: 0 },
    };
    variables.stat_data.事件系统.已完成事件 = {};
    vi.mocked(operations.batchEndEvents).mockClear();
    eventEmitMock.mockClear();

    const chatChangedListener = eventOnMock.mock.calls
      .filter(([name]) => name === tavern_events.CHAT_CHANGED)
      .at(-1)?.[1] as (() => unknown) | undefined;
    expect(chatChangedListener).toBeTypeOf('function');
    await chatChangedListener?.();

    expect(initializeEventListMock).toHaveBeenCalledTimes(2);
    expect(initializeEventListMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ rootBootstrap: false }),
    );
    expect(operations.batchCompleteDebutEvents).not.toHaveBeenCalled();
    expect(operations.batchEndEvents).toHaveBeenCalledWith([historicalEvent], expect.any(Object));
    expect(reconcileWorldEventArchiveMock).not.toHaveBeenCalled();
    expect(eventEmitMock).toHaveBeenCalledWith(
      'wuxia:history-event-state-stable',
      expect.objectContaining({ reason: 'chat-changed' }),
    );
  });

  it('回合屏障会等时间、参与事件结局和差分全部稳定后再结算', async () => {
    const eventName = '射雕测试事件-同轮稳定结算';
    const variables = validVariables() as ReturnType<typeof validVariables> & {
      stat_data: ReturnType<typeof validVariables>['stat_data'] & {
        参与事件: Record<
          string,
          {
            结局: string;
            update: Record<string, unknown>;
          }
        >;
      };
    };
    variables.stat_data.事件系统.进行中事件 = {
      [eventName]: { 年: 1199, 月: 8, 日: 15, 时: 12 },
    };
    variables.stat_data.参与事件 = {
      [eventName]: {
        结局: '旧结局',
        update: { 郭靖: { 状态: '旧状态' } },
      },
    };
    getVariablesMock.mockReturnValue(variables);
    initializeEventListMock.mockResolvedValue(undefined);

    const loader = await import('./era-event-loader.js');
    const checker = await import('./era-event-checker.js');
    const operations = await import('./era-event-operations.js');
    const definition = {
      事件地点: '大宋/嘉兴府/牛家村',
      触发条件: { 类型: '时间', 年: 1199, 月: 8, 日: 15, 时: 10 },
      事件结束时间: { 年: 1199, 月: 8, 日: 15, 时: 12 },
      事件详情: '测试事件',
      事件概要: '原定结局',
      参与人物: [],
      insert: {},
      update: {},
      delete: {},
    };
    vi.mocked(loader.loadEventManifest).mockResolvedValue({
      events: [{ runtimeKey: eventName }],
      indexes: { byTrigger: [], byDiscovery: [] },
    } as never);
    vi.mocked(loader.loadEventDefinitions).mockResolvedValue({ [eventName]: definition });
    vi.mocked(checker.isTimeForEvent).mockReturnValue(false);
    vi.mocked(checker.isEventDiscoverable).mockReturnValue(false);
    vi.mocked(checker.isTimeAfterEventEnd).mockReturnValue(false);
    vi.mocked(operations.batchEndEvents).mockResolvedValue(true);

    // @ts-expect-error 测试用模块 query
    await import('./era-main.js?turn-commit-barrier-test');
    await vi.waitFor(() => expect(initializeEventListMock).toHaveBeenCalledTimes(1));

    vi.mocked(operations.batchEndEvents).mockClear();
    vi.mocked(checker.isTimeAfterEventEnd).mockReturnValue(true);
    let endingObservedAtSettlement = '';
    let updateObservedAtSettlement: Record<string, unknown> = {};
    vi.mocked(operations.batchEndEvents).mockImplementation(async () => {
      endingObservedAtSettlement = variables.stat_data.参与事件[eventName].结局;
      updateObservedAtSettlement = clone(variables.stat_data.参与事件[eventName].update);
      return true;
    });

    const findLatestListener = (eventName: string) =>
      eventOnMock.mock.calls.filter(([name]) => name === eventName).at(-1)?.[1] as
        ((detail?: Record<string, unknown>) => unknown) | undefined;
    const lifecycleListener = findLatestListener('wuxia:turn-lifecycle');
    const messageSentListener = findLatestListener(tavern_events.MESSAGE_SENT);
    const writeDoneListener = findLatestListener('era:writeDone');
    const completedListener = findLatestListener('wuxia:turn-completed');
    expect(lifecycleListener).toBeTypeOf('function');
    expect(messageSentListener).toBeTypeOf('function');
    expect(writeDoneListener).toBeTypeOf('function');
    expect(completedListener).toBeTypeOf('function');

    lifecycleListener?.({ phase: 'start', roundId: 'round-barrier-1', chatId: 'chat-1' });
    await messageSentListener?.({});

    variables.stat_data.世界信息.时间 = { 年: 1199, 月: 8, 日: 15, 时: 13 };
    await writeDoneListener?.({
      message_id: 28,
      actions: { resync: true },
    });
    expect(operations.batchEndEvents).not.toHaveBeenCalled();

    variables.stat_data.参与事件[eventName] = {
      结局: '玩家改写后的结局',
      update: { 郭靖: { 状态: '玩家改写后的状态' } },
    };
    await writeDoneListener?.({
      message_id: 28,
      actions: { resync: true },
    });
    expect(operations.batchEndEvents).not.toHaveBeenCalled();

    await completedListener?.({
      messageId: 28,
      chatId: 'chat-1',
      roundId: 'round-barrier-1',
    });

    expect(operations.batchEndEvents).toHaveBeenCalledTimes(1);
    expect(operations.batchEndEvents).toHaveBeenCalledWith([eventName], expect.any(Object));
    expect(endingObservedAtSettlement).toBe('玩家改写后的结局');
    expect(updateObservedAtSettlement).toEqual({ 郭靖: { 状态: '玩家改写后的状态' } });
  });
});
