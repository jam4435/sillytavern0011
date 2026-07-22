import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WUXIA_ERROR_CODES,
  WUXIA_EVENTS,
  WUXIA_GLOBAL_EVENTS,
  WUXIA_METHODS,
} from '../../tools/wuxia-bridge/protocol.mjs';

const mocks = vi.hoisted(() => ({
  io: vi.fn(),
  socket: null as any,
  pagehideHandler: null as null | (() => void),
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

    mocks.pagehideHandler = null;
    const pagehideChain = {
      off: vi.fn(() => pagehideChain),
      one: vi.fn((_event: string, handler: () => void) => {
        mocks.pagehideHandler = handler;
        return pagehideChain;
      }),
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

  afterEach(() => {
    mocks.pagehideHandler?.();
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

  it('自动化实例换代时释放旧实例的锁，且旧请求不会误清新请求', async () => {
    const snapshot = {
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
    let resolveOldTurn!: (value: { ok: boolean }) => void;
    let resolveNewTurn!: (value: { ok: boolean }) => void;
    const oldApi = {
      version: 1,
      getSnapshot: vi.fn(() => snapshot),
      runTurn: vi.fn(() => new Promise<{ ok: boolean }>(resolve => (resolveOldTurn = resolve))),
    };
    const newApi = {
      version: 1,
      getSnapshot: vi.fn(() => snapshot),
      runTurn: vi.fn(() => new Promise<{ ok: boolean }>(resolve => (resolveNewTurn = resolve))),
    };
    Object.assign(globalThis, {
      'WuxiaAutomation:frontend-old': oldApi,
      'WuxiaAutomation:frontend-new': newApi,
      waitGlobalInitialized: vi.fn((name: string) => Promise.resolve((globalThis as Record<string, unknown>)[name])),
    });

    await import('./index');
    await eventEmit(WUXIA_GLOBAL_EVENTS.READY, {
      version: 1,
      instanceId: 'frontend-old',
      globalName: 'WuxiaAutomation:frontend-old',
    });
    await vi.waitFor(() =>
      expect(getLastState(mocks.socket)).toMatchObject({ automationInstanceId: 'frontend-old', busy: false }),
    );

    const requestHandler = mocks.socket.handlers.get(WUXIA_EVENTS.REQUEST)!;
    const oldResponse = new Promise(resolve => {
      void requestHandler({ id: 'old-turn', method: WUXIA_METHODS.RUN_TURN, params: { input: '旧实例行动' } }, resolve);
    });
    await vi.waitFor(() => expect(getLastState(mocks.socket)).toMatchObject({ busy: true }));

    await eventEmit(WUXIA_GLOBAL_EVENTS.DISPOSED, {
      version: 1,
      instanceId: 'frontend-old',
      globalName: 'WuxiaAutomation:frontend-old',
    });
    await vi.waitFor(() => expect(getLastState(mocks.socket)).toMatchObject({ automationReady: false, busy: false }));

    await eventEmit(WUXIA_GLOBAL_EVENTS.READY, {
      version: 1,
      instanceId: 'frontend-new',
      globalName: 'WuxiaAutomation:frontend-new',
    });
    await vi.waitFor(() =>
      expect(getLastState(mocks.socket)).toMatchObject({ automationInstanceId: 'frontend-new', busy: false }),
    );

    const newResponse = new Promise(resolve => {
      void requestHandler({ id: 'new-turn', method: WUXIA_METHODS.RUN_TURN, params: { input: '新实例行动' } }, resolve);
    });
    await vi.waitFor(() => expect(newApi.runTurn).toHaveBeenCalledTimes(1));
    resolveOldTurn({ ok: true });
    await oldResponse;
    await vi.waitFor(() => expect(getLastState(mocks.socket)).toMatchObject({ busy: true }));

    const busyResponse = await new Promise(resolve => {
      void requestHandler(
        { id: 'blocked-turn', method: WUXIA_METHODS.RUN_TURN, params: { input: '不应并发' } },
        resolve,
      );
    });
    expect(busyResponse).toMatchObject({ ok: false, error: { code: WUXIA_ERROR_CODES.BUSY } });

    resolveNewTurn({ ok: true });
    await expect(newResponse).resolves.toMatchObject({ ok: true, result: { ok: true } });
    await vi.waitFor(() => expect(getLastState(mocks.socket)).toMatchObject({ busy: false }));
  });

  it('仍以游戏快照的 busy 阻止自动化并发，不介入普通对话流程', async () => {
    const api = {
      version: 1,
      getSnapshot: vi.fn(() => ({
        version: 1,
        ready: true,
        page: 'game',
        busy: true,
        chatId: 'live-chat',
        maintext: '',
        options: [],
        statData: {},
        debug: null,
        variableChanges: null,
        recentMessages: [],
        capturedAt: Date.now(),
      })),
      runTurn: vi.fn(),
    };
    Object.assign(globalThis, {
      'WuxiaAutomation:frontend-live': api,
      waitGlobalInitialized: vi.fn((name: string) => Promise.resolve((globalThis as Record<string, unknown>)[name])),
    });

    await import('./index');
    await eventEmit(WUXIA_GLOBAL_EVENTS.READY, {
      version: 1,
      instanceId: 'frontend-live',
      globalName: 'WuxiaAutomation:frontend-live',
    });
    await vi.waitFor(() => expect(getLastState(mocks.socket)).toMatchObject({ automationReady: true, busy: true }));

    const response = await new Promise(resolve => {
      void mocks.socket.handlers.get(WUXIA_EVENTS.REQUEST)?.(
        { id: 'busy-turn', method: WUXIA_METHODS.RUN_TURN, params: { input: '自动化行动' } },
        resolve,
      );
    });

    expect(response).toMatchObject({ ok: false, error: { code: WUXIA_ERROR_CODES.BUSY } });
    expect(api.runTurn).not.toHaveBeenCalled();
  });
});
