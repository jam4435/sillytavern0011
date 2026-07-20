import { io, type Socket } from 'socket.io-client';
import type { WuxiaAutomationApi, WuxiaAutomationSnapshot } from '../武侠/utils/wuxiaAutomation';
import {
  WUXIA_ERROR_CODES,
  WUXIA_EVENTS,
  WUXIA_METHODS,
  WUXIA_PROTOCOL_VERSION,
  WUXIA_SOCKET_NAMESPACE,
  createErrorResponse,
  createRequestId,
  isRecord,
  validateRpcRequest,
  type WuxiaRpcRequest,
  type WuxiaRpcResponse,
} from '../../tools/wuxia-bridge/protocol.mjs';

const DEFAULT_SERVER_URL = `http://127.0.0.1:6621${WUXIA_SOCKET_NAMESPACE}`;
const RESPONSE_CACHE_LIMIT = 100;
const RESPONSE_CACHE_TTL_MS = 15 * 60 * 1_000;
const SCRIPT_EVENT_NAMESPACE = '.wuxiaAutomationBridge';

type BridgeConfig = {
  enabled: boolean;
  url: string;
  token: string;
};

type ResponseCacheEntry = {
  expiresAt: number;
  response: Promise<WuxiaRpcResponse>;
};

class BridgeRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

function readString(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function readBoolean(record: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    if (typeof record[key] === 'boolean') return record[key];
  }
  return fallback;
}

function readBridgeConfig(): BridgeConfig {
  const variables = getVariables({ type: 'script', script_id: getScriptId() });
  const record = isRecord(variables) ? variables : {};
  return {
    enabled: readBoolean(record, ['启用', 'enabled'], true),
    url: readString(record, ['服务地址', 'url'], DEFAULT_SERVER_URL),
    token: readString(record, ['访问令牌', 'token']),
  };
}

function getSessionId(): string {
  return createRequestId('tab');
}

function getLatestMessageId(snapshot: WuxiaAutomationSnapshot): number | null {
  const latest = snapshot.recentMessages.at(-1);
  return latest?.messageId ?? null;
}

function normalizeError(requestId: string, error: unknown): WuxiaRpcResponse {
  if (error instanceof BridgeRequestError) {
    return createErrorResponse(requestId, error.code, error.message, { retryable: error.retryable });
  }
  return createErrorResponse(
    requestId,
    WUXIA_ERROR_CODES.INTERNAL,
    error instanceof Error ? error.message : String(error),
  );
}

function startBridge() {
  const config = readBridgeConfig();
  if (!config.enabled) {
    console.info('[wuxia-bridge] 已由脚本变量禁用。');
    return;
  }

  let disposed = false;
  let automation: WuxiaAutomationApi | null = null;
  let runInFlight = false;
  const bridgeId = String(getScriptId());
  const sessionId = getSessionId();
  const responseCache = new Map<string, ResponseCacheEntry>();

  const socket: Socket = io(config.url, {
    auth: {
      role: 'bridge',
      token: config.token,
      protocolVersion: WUXIA_PROTOCOL_VERSION,
      bridgeId,
      sessionId,
    },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    randomizationFactor: 0.4,
    timeout: 5_000,
    transports: ['websocket', 'polling'],
  });

  function getUsableSnapshot(): WuxiaAutomationSnapshot {
    if (!automation) {
      throw new BridgeRequestError(
        WUXIA_ERROR_CODES.AUTOMATION_NOT_READY,
        '武侠游戏界面尚未初始化，请先进入游戏页面。',
        true,
      );
    }
    if (automation.version !== WUXIA_PROTOCOL_VERSION) {
      throw new BridgeRequestError(
        WUXIA_ERROR_CODES.VERSION_MISMATCH,
        `自动化接口版本为 ${String(automation.version)}，桥接协议要求版本 ${WUXIA_PROTOCOL_VERSION}。`,
      );
    }
    const snapshot = automation.getSnapshot();
    if (!snapshot.ready) {
      automation = null;
      throw new BridgeRequestError(
        WUXIA_ERROR_CODES.AUTOMATION_NOT_READY,
        '武侠游戏界面正在重载，请稍后重新读取快照。',
        true,
      );
    }
    return snapshot;
  }

  function emitState() {
    if (!socket.connected || disposed) return;
    try {
      const snapshot = getUsableSnapshot();
      socket.emit(WUXIA_EVENTS.STATE, {
        automationReady: true,
        apiVersion: automation?.version ?? null,
        chatId: snapshot.chatId,
        page: snapshot.page,
        busy: snapshot.busy || runInFlight,
        latestMessageId: getLatestMessageId(snapshot),
      });
    } catch {
      socket.emit(WUXIA_EVENTS.STATE, {
        automationReady: false,
        apiVersion: automation?.version ?? null,
        chatId: '',
        page: '',
        busy: runInFlight,
        latestMessageId: null,
      });
    }
  }

  async function acquireAutomation() {
    try {
      const candidate = await waitGlobalInitialized<WuxiaAutomationApi>('WuxiaAutomation');
      if (disposed) return;
      automation = candidate;
      emitState();
    } catch (error) {
      if (!disposed) console.warn('[wuxia-bridge] 等待自动化接口失败。', error);
    }
  }

  async function dispatchRequest(request: WuxiaRpcRequest): Promise<WuxiaRpcResponse> {
    try {
      const snapshot = getUsableSnapshot();
      if (request.method === WUXIA_METHODS.GET_SNAPSHOT) {
        return { id: request.id, ok: true, result: snapshot };
      }
      if (request.method !== WUXIA_METHODS.RUN_TURN || !isRecord(request.params)) {
        throw new BridgeRequestError(WUXIA_ERROR_CODES.INVALID_REQUEST, `桥接脚本不处理方法 ${request.method}。`);
      }
      if (snapshot.page !== 'game') {
        throw new BridgeRequestError(
          WUXIA_ERROR_CODES.AUTOMATION_NOT_READY,
          `当前页面为 ${snapshot.page}，只有游戏主界面可以推进剧情。`,
          true,
        );
      }
      if (snapshot.busy || runInFlight) {
        throw new BridgeRequestError(WUXIA_ERROR_CODES.BUSY, '当前已有生成或自动化回合正在运行。', true);
      }

      const input = String(request.params.input).trim();
      const settleTimeoutMs = request.params.settleTimeoutMs;
      const settleDelayMs = request.params.settleDelayMs;
      runInFlight = true;
      emitState();
      try {
        const result = await automation!.runTurn(input, {
          ...(settleTimeoutMs === undefined ? {} : { settleTimeoutMs }),
          ...(settleDelayMs === undefined ? {} : { settleDelayMs }),
        });
        return { id: request.id, ok: true, result };
      } finally {
        runInFlight = false;
        emitState();
      }
    } catch (error) {
      return normalizeError(request.id, error);
    }
  }

  function pruneResponseCache() {
    const now = Date.now();
    for (const [id, entry] of responseCache) {
      if (entry.expiresAt <= now) responseCache.delete(id);
    }
    while (responseCache.size > RESPONSE_CACHE_LIMIT) {
      const oldestId = responseCache.keys().next().value;
      if (typeof oldestId !== 'string') break;
      responseCache.delete(oldestId);
    }
  }

  socket.on(WUXIA_EVENTS.REQUEST, async (unknownRequest: unknown, acknowledge: (response: WuxiaRpcResponse) => void) => {
    if (typeof acknowledge !== 'function') return;
    const validation = validateRpcRequest(unknownRequest);
    if (!validation.ok) {
      acknowledge(
        createErrorResponse(
          isRecord(unknownRequest) ? unknownRequest.id : '',
          WUXIA_ERROR_CODES.INVALID_REQUEST,
          validation.message,
        ),
      );
      return;
    }

    const request = unknownRequest as WuxiaRpcRequest;
    pruneResponseCache();
    let entry = responseCache.get(request.id);
    if (!entry) {
      entry = {
        expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
        response: dispatchRequest(request),
      };
      responseCache.set(request.id, entry);
    }
    acknowledge(await entry.response);
  });

  socket.on('connect', emitState);
  socket.on('connect_error', error => {
    if (!disposed) console.warn(`[wuxia-bridge] 无法连接 ${config.url}: ${error.message}`);
  });

  const readyListener = eventOn('wuxia:automation-ready', () => {
    void acquireAutomation();
  });
  const chatChangedListener = eventOn(tavern_events.CHAT_CHANGED, emitState);

  function dispose() {
    if (disposed) return;
    disposed = true;
    readyListener.stop();
    chatChangedListener.stop();
    socket.removeAllListeners();
    socket.disconnect();
    responseCache.clear();
    automation = null;
  }

  $(window).off(`pagehide${SCRIPT_EVENT_NAMESPACE}`).one(`pagehide${SCRIPT_EVENT_NAMESPACE}`, dispose);
  void acquireAutomation();
}

$(() => startBridge());

