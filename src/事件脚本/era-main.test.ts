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
});
