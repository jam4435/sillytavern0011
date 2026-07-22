// @vitest-environment node
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  WUXIA_ERROR_CODES,
  WUXIA_EVENTS,
  WUXIA_METHODS,
  WUXIA_PROTOCOL_VERSION,
  WUXIA_SOCKET_NAMESPACE,
  createRequestId,
} from './protocol.mjs';
import { attachWuxiaAutomationRelay } from './relay.mjs';

const silentLogger = { info() {}, warn() {} };

describe('wuxia Socket.IO relay', () => {
  let httpServer;
  let ioServer;
  let url;
  const clients = [];

  beforeEach(async () => {
    httpServer = createServer();
    ioServer = new Server(httpServer, { cors: { origin: '*' } });
    attachWuxiaAutomationRelay(ioServer, {
      logger: silentLogger,
      snapshotTimeoutMs: 500,
      turnTimeoutMs: 500,
      recoveryTimeoutMs: 120,
      recoveryPollMs: 20,
      replacementPollMs: 20,
    });
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    url = `http://127.0.0.1:${address.port}${WUXIA_SOCKET_NAMESPACE}`;
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    clients.length = 0;
    await new Promise(resolve => ioServer.close(resolve));
  });

  async function connect(role, extraAuth = {}) {
    const client = createClient(url, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      extraHeaders: role === 'bridge' ? { Origin: 'http://127.0.0.1:8000' } : undefined,
      auth: { role, protocolVersion: WUXIA_PROTOCOL_VERSION, ...extraAuth },
    });
    clients.push(client);
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  }

  async function call(client, method, extras = {}) {
    const request = { id: createRequestId('test'), method, params: {}, ...extras };
    return client.timeout(2_000).emitWithAck(WUXIA_EVENTS.CALL, request);
  }

  async function connectReadyBridge(id = 'bridge-1') {
    const bridge = await connect('bridge', { bridgeId: id, sessionId: `${id}-session` });
    bridge.emit(WUXIA_EVENTS.STATE, {
      automationReady: true,
      apiVersion: 1,
      chatId: `${id}-chat`,
      page: 'game',
      busy: false,
    });
    await new Promise(resolve => setTimeout(resolve, 10));
    return bridge;
  }

  it('reports an online server while no Tavern bridge is connected', async () => {
    const cli = await connect('cli');
    const response = await call(cli, WUXIA_METHODS.STATUS);

    expect(response).toMatchObject({
      ok: true,
      result: { serverOnline: true, bridgeConnected: false, readyBridgeCount: 0 },
    });
  });

  it('forwards a snapshot request to the ready bridge', async () => {
    const bridge = await connectReadyBridge();
    bridge.on(WUXIA_EVENTS.REQUEST, (request, acknowledge) => {
      acknowledge({ id: request.id, ok: true, result: { chatId: 'bridge-1-chat', ready: true } });
    });
    const cli = await connect('cli');
    const response = await call(cli, WUXIA_METHODS.GET_SNAPSHOT);

    expect(response).toMatchObject({ ok: true, result: { chatId: 'bridge-1-chat', ready: true } });
  });

  it('refuses to choose silently when multiple bridges are ready', async () => {
    await connectReadyBridge('bridge-1');
    await connectReadyBridge('bridge-2');
    const cli = await connect('cli');
    const response = await call(cli, WUXIA_METHODS.GET_SNAPSHOT);

    expect(response).toMatchObject({ ok: false, error: { code: WUXIA_ERROR_CODES.MULTIPLE_BRIDGES } });
  });

  it('does not queue a second real turn for the same bridge', async () => {
    const bridge = await connectReadyBridge();
    bridge.on(WUXIA_EVENTS.REQUEST, async (request, acknowledge) => {
      await new Promise(resolve => setTimeout(resolve, 80));
      acknowledge({ id: request.id, ok: true, result: { ok: true } });
    });
    const cli = await connect('cli');
    const first = call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '第一步' } });
    await new Promise(resolve => setTimeout(resolve, 10));
    const second = await call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '第二步' } });

    expect(second).toMatchObject({ ok: false, error: { code: WUXIA_ERROR_CODES.BUSY } });
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it('marks a disconnected real turn as outcome unknown', async () => {
    const bridge = await connectReadyBridge();
    bridge.on(WUXIA_EVENTS.REQUEST, () => bridge.disconnect());
    const cli = await connect('cli');
    const response = await call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '可能已经执行' } });

    expect(response).toMatchObject({
      ok: false,
      error: { code: WUXIA_ERROR_CODES.OUTCOME_UNKNOWN, outcome: 'unknown', retryable: false },
    });
  });

  it('recovers a timed-out turn from the latest snapshot without resending it', async () => {
    const bridge = await connectReadyBridge();
    let runRequestCount = 0;
    bridge.on(WUXIA_EVENTS.REQUEST, (request, acknowledge) => {
      if (request.method === WUXIA_METHODS.RUN_TURN) {
        runRequestCount += 1;
        return;
      }
      acknowledge({
        id: request.id,
        ok: true,
        result: {
          ready: true,
          busy: false,
          chatId: 'bridge-1-chat',
          statData: { user数据: { 修为: 2 } },
          capturedAt: Date.now(),
          recentMessages: [
            { messageId: 3, role: 'user', text: '向前走' },
            { messageId: 4, role: 'assistant', text: '新的剧情' },
          ],
          debug: {
            id: 'round-1',
            startedAt: 1,
            updatedAt: 2,
            main: { status: 'success', userInput: '向前走', output: '新的剧情' },
            variable: { status: 'success', modeSnapshot: 'extra' },
          },
          variableChanges: {
            status: 'settled',
            parseErrors: [],
            declaredChanges: [{ path: ['user数据', '修为'] }],
            actualChanges: [{ path: ['user数据', '修为'] }],
            aiReply: { comparisons: [{ status: 'applied' }] },
          },
        },
      });
    });
    const cli = await connect('cli');
    const response = await call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '向前走' } });

    expect(runRequestCount).toBe(1);
    expect(response).toMatchObject({
      ok: true,
      result: {
        ok: true,
        recovered: true,
        recoveryReason: 'turn-timeout-snapshot-reconciled',
        userMessageId: 3,
        assistantMessageId: 4,
        rawReply: '新的剧情',
        variableVerification: { verdict: 'applied' },
      },
    });
  });

  it('returns a matching persisted main-model error without waiting for the turn timeout', async () => {
    const bridge = await connectReadyBridge();
    let turnStartedAt = 0;
    bridge.on(WUXIA_EVENTS.REQUEST, (request, acknowledge) => {
      if (request.method === WUXIA_METHODS.RUN_TURN) {
        turnStartedAt = Date.now();
        return;
      }
      acknowledge({
        id: request.id,
        ok: true,
        result: {
          ready: true,
          busy: true,
          chatId: 'bridge-1-chat',
          capturedAt: Date.now(),
          recentMessages: [{ messageId: 7, role: 'user', text: '进入黑松林' }],
          debug: {
            id: 'round-error',
            startedAt: turnStartedAt,
            updatedAt: Date.now(),
            main: {
              status: 'error',
              userInput: '进入黑松林',
              error: 'Got response status 429',
            },
            variable: { status: 'idle', modeSnapshot: 'extra' },
          },
        },
      });
    });
    const cli = await connect('cli');
    const startedAt = Date.now();
    const response = await call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '进入黑松林' } });

    expect(Date.now() - startedAt).toBeLessThan(400);
    expect(response).toMatchObject({
      ok: true,
      result: {
        ok: false,
        recovered: true,
        recoveryReason: 'turn-persisted-debug-error',
        failedStage: 'main',
        userMessageId: 7,
        error: 'Got response status 429',
        debug: { main: { status: 'error' } },
      },
    });
  });

  it('ignores a persisted error from an older round with the same input', async () => {
    const bridge = await connectReadyBridge();
    bridge.on(WUXIA_EVENTS.REQUEST, (request, acknowledge) => {
      if (request.method === WUXIA_METHODS.RUN_TURN) return;
      acknowledge({
        id: request.id,
        ok: true,
        result: {
          ready: true,
          busy: false,
          chatId: 'bridge-1-chat',
          capturedAt: Date.now(),
          recentMessages: [{ messageId: 3, role: 'user', text: '继续观察' }],
          debug: {
            id: 'old-round-error',
            startedAt: Date.now() - 60_000,
            updatedAt: Date.now() - 59_000,
            main: { status: 'error', userInput: '继续观察', error: '旧回合错误' },
          },
        },
      });
    });
    const cli = await connect('cli');
    const response = await call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '继续观察' } });

    expect(response).toMatchObject({
      ok: false,
      error: { code: WUXIA_ERROR_CODES.OUTCOME_UNKNOWN, outcome: 'unknown' },
    });
  });

  it('returns a matching persisted variable-model error after main generation succeeded', async () => {
    const bridge = await connectReadyBridge();
    let turnStartedAt = 0;
    bridge.on(WUXIA_EVENTS.REQUEST, (request, acknowledge) => {
      if (request.method === WUXIA_METHODS.RUN_TURN) {
        turnStartedAt = Date.now();
        return;
      }
      acknowledge({
        id: request.id,
        ok: true,
        result: {
          ready: true,
          busy: true,
          chatId: 'bridge-1-chat',
          capturedAt: Date.now(),
          recentMessages: [
            { messageId: 8, role: 'user', text: '检查行囊' },
            { messageId: 9, role: 'assistant', text: '你检查了行囊。' },
          ],
          debug: {
            id: 'round-variable-error',
            startedAt: turnStartedAt,
            updatedAt: Date.now(),
            main: { status: 'success', userInput: '检查行囊', output: '你检查了行囊。' },
            variable: { status: 'error', modeSnapshot: 'extra', error: '变量模型连接失败' },
          },
        },
      });
    });
    const cli = await connect('cli');
    const response = await call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '检查行囊' } });

    expect(response).toMatchObject({
      ok: true,
      result: {
        ok: false,
        recovered: true,
        recoveryReason: 'turn-persisted-debug-error',
        failedStage: 'variable',
        userMessageId: 8,
        assistantMessageId: 9,
        rawReply: '你检查了行囊。',
        error: '变量模型连接失败',
      },
    });
  });

  it('recovers immediately when a new frontend instance replaces the request instance', async () => {
    const bridge = await connectReadyBridge();
    bridge.emit(WUXIA_EVENTS.STATE, {
      automationReady: true,
      apiVersion: 1,
      automationInstanceId: 'frontend-old',
      chatId: 'bridge-1-chat',
      page: 'game',
      busy: false,
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    let runRequestCount = 0;
    bridge.on(WUXIA_EVENTS.REQUEST, (request, acknowledge) => {
      if (request.method === WUXIA_METHODS.RUN_TURN) {
        runRequestCount += 1;
        setTimeout(
          () =>
            bridge.emit(WUXIA_EVENTS.STATE, {
              automationReady: true,
              apiVersion: 1,
              automationInstanceId: 'frontend-new',
              chatId: 'bridge-1-chat',
              page: 'game',
              busy: false,
            }),
          40,
        );
        return;
      }
      acknowledge({
        id: request.id,
        ok: true,
        result: {
          ready: true,
          busy: false,
          chatId: 'bridge-1-chat',
          recentMessages: [
            { messageId: 5, role: 'user', text: '进入客栈' },
            { messageId: 6, role: 'assistant', text: '已经进入客栈' },
          ],
          debug: {
            main: { status: 'success', userInput: '进入客栈' },
            variable: { status: 'success', modeSnapshot: 'extra' },
          },
          variableChanges: {
            status: 'settled',
            parseErrors: [],
            declaredChanges: [{ path: ['user数据', '所在位置'] }],
            actualChanges: [{ path: ['user数据', '所在位置'] }],
          },
        },
      });
    });
    const cli = await connect('cli');
    const startedAt = Date.now();
    const response = await call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '进入客栈' } });

    expect(Date.now() - startedAt).toBeLessThan(400);
    expect(runRequestCount).toBe(1);
    expect(response).toMatchObject({
      ok: true,
      result: {
        recovered: true,
        recoveryReason: 'turn-timeout-snapshot-reconciled',
        userMessageId: 5,
        assistantMessageId: 6,
      },
    });
  });

  it('reconciles an outcome-unknown response returned when the browser automation instance is disposed', async () => {
    const bridge = await connectReadyBridge();
    bridge.on(WUXIA_EVENTS.REQUEST, (request, acknowledge) => {
      if (request.method === WUXIA_METHODS.RUN_TURN) {
        acknowledge({
          id: request.id,
          ok: false,
          error: {
            code: WUXIA_ERROR_CODES.OUTCOME_UNKNOWN,
            message: '自动化实例已换代',
            retryable: false,
            outcome: 'unknown',
          },
        });
        return;
      }
      acknowledge({
        id: request.id,
        ok: true,
        result: {
          ready: true,
          busy: false,
          chatId: 'bridge-1-chat',
          recentMessages: [
            { messageId: 10, role: 'user', text: '继续赶路' },
            { messageId: 11, role: 'assistant', text: '你抵达了黑松林。' },
          ],
          debug: {
            startedAt: Date.now(),
            main: { status: 'success', userInput: '继续赶路', output: '你抵达了黑松林。' },
            variable: { status: 'success', modeSnapshot: 'extra' },
          },
          variableChanges: {
            status: 'settled',
            parseErrors: [],
            declaredChanges: [],
            actualChanges: [],
          },
        },
      });
    });
    const cli = await connect('cli');
    const response = await call(cli, WUXIA_METHODS.RUN_TURN, { params: { input: '继续赶路' } });

    expect(response).toMatchObject({
      ok: true,
      result: {
        ok: true,
        recovered: true,
        recoveryReason: 'turn-timeout-snapshot-reconciled',
        userMessageId: 10,
        assistantMessageId: 11,
      },
    });
  });
});
