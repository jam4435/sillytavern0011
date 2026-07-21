import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WUXIA_EVENTS, WUXIA_GLOBAL_EVENTS } from '../../tools/wuxia-bridge/protocol.mjs';

const mocks = vi.hoisted(() => ({
  io: vi.fn(),
  socket: null as any,
}));

vi.mock('socket.io-client', () => ({
  io: mocks.io,
}));

function createSocketMock() {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  return {
    connected: true,
    emit: vi.fn(),
    on: vi.fn((event: string, listener: (...args: any[]) => unknown) => {
      handlers.set(event, listener);
    }),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
    handlers,
  };
}

function getLastState(socket: ReturnType<typeof createSocketMock>) {
  return socket.emit.mock.calls.filter(([event]) => event === WUXIA_EVENTS.STATE).at(-1)?.[1];
}

describe('武侠自动化桥接口发现', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.socket = createSocketMock();
    mocks.io.mockReturnValue(mocks.socket);

    const pagehideChain = {
      off: vi.fn(() => pagehideChain),
      one: vi.fn(() => pagehideChain),
    };
    Object.assign(globalThis, {
      $: (value: unknown) => {
        if (typeof value === 'function') {
          value();
          return undefined;
        }
        return pagehideChain;
      },
      getScriptId: vi.fn(() => 'bridge-test'),
      getVariables: vi.fn(() => ({})),
    });
  });

  it('采用最新公告的唯一实例，并忽略随后返回的旧全局接口', async () => {
    let resolveLegacy!: (value: unknown) => void;
    const legacyPromise = new Promise(resolve => {
      resolveLegacy = resolve;
    });
    const liveSnapshot = {
      version: 1,
      ready: true,
      page: 'game',
      busy: false,
      chatId: 'live-chat',
      maintext: '当前正文',
      options: [],
      statData: {},
      debug: null,
      variableChanges: null,
      recentMessages: [],
      capturedAt: Date.now(),
    };
    const liveApi = {
      version: 1,
      getSnapshot: vi.fn(() => liveSnapshot),
      runTurn: vi.fn(),
    };
    const staleApi = {
      version: 1,
      getSnapshot: vi.fn(() => ({ ...liveSnapshot, ready: false, chatId: 'stale-chat' })),
      runTurn: vi.fn(),
    };
    Object.assign(globalThis, {
      'WuxiaAutomation:frontend-live': liveApi,
      waitGlobalInitialized: vi.fn((name: string) =>
        name === 'WuxiaAutomation:frontend-live' ? Promise.resolve(undefined) : legacyPromise,
      ),
    });

    await import('./index');
    await eventEmit(WUXIA_GLOBAL_EVENTS.READY, {
      version: 1,
      instanceId: 'frontend-live',
      globalName: 'WuxiaAutomation:frontend-live',
    });
    await vi.waitFor(() => {
      expect(getLastState(mocks.socket)).toMatchObject({
        automationReady: true,
        automationInstanceId: 'frontend-live',
        automationGlobalName: 'WuxiaAutomation:frontend-live',
        chatId: 'live-chat',
        page: 'game',
      });
    });

    resolveLegacy(staleApi);
    await Promise.resolve();
    await Promise.resolve();

    expect(getLastState(mocks.socket)).toMatchObject({
      automationReady: true,
      automationInstanceId: 'frontend-live',
      chatId: 'live-chat',
    });
    expect(staleApi.getSnapshot).not.toHaveBeenCalled();
  });
});
