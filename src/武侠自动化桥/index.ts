import { io, type Socket } from 'socket.io-client';
import {
  WuxiaAutomationDisposedError,
  type WuxiaAutomationApi,
  type WuxiaAutomationSnapshot,
} from '../武侠/utils/wuxiaAutomation';
import { forwardIframeLifecycleEvent } from '../武侠/utils/iframeLifecycleBlackBox';
import {
  WUXIA_ERROR_CODES,
  WUXIA_EVENTS,
  WUXIA_GLOBAL_EVENTS,
  WUXIA_METHODS,
  WUXIA_PROTOCOL_VERSION,
  WUXIA_RELAY_DEFAULT_URL,
  WUXIA_TURN_TIMEOUT_MS,
  WUXIA_AUTOMATION_GLOBAL_PREFIX,
  createErrorResponse,
  createRequestId,
  isRecord,
  validateRpcRequest,
  type WuxiaRpcRequest,
  type WuxiaRpcResponse,
} from '../../tools/wuxia-bridge/protocol.mjs';

const DEFAULT_SERVER_URL = WUXIA_RELAY_DEFAULT_URL;
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

type AutomationAnnouncement = {
  version: number | null;
  instanceId: string;
  globalName: string;
};

type RunInFlight = {
  requestId: string;
  automationInstanceId: string;
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

function readAutomationAnnouncement(value: unknown): AutomationAnnouncement | null {
  if (!isRecord(value)) return null;
  const instanceId = readString(value, ['instanceId'], '');
  const globalName = readString(value, ['globalName'], '');
  if (!instanceId || !globalName || !globalName.startsWith(`${WUXIA_AUTOMATION_GLOBAL_PREFIX}:`)) return null;
  return {
    version: Number.isInteger(value.version) ? Number(value.version) : null,
    instanceId,
    globalName,
  };
}

function normalizeError(requestId: string, error: unknown): WuxiaRpcResponse {
  if (error instanceof WuxiaAutomationDisposedError) {
    return createErrorResponse(requestId, WUXIA_ERROR_CODES.OUTCOME_UNKNOWN, error.message, {
      retryable: false,
      outcome: 'unknown',
    });
  }
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
  let automationInstanceId = '';
  let automationGlobalName = '';
  let turnTimeoutMs = WUXIA_TURN_TIMEOUT_MS.STANDARD;
  let acquisitionGeneration = 0;
  let stateQueryGeneration = 0;
  let stateRevision = 0;
  let runInFlight: RunInFlight | null = null;
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

  async function getUsableSnapshot(candidate = automation): Promise<WuxiaAutomationSnapshot> {
    if (!candidate) {
      throw new BridgeRequestError(
        WUXIA_ERROR_CODES.AUTOMATION_NOT_READY,
        '武侠游戏界面尚未初始化，请先进入游戏页面。',
        true,
      );
    }
    const automationVersion = await candidate.version;
    if (automationVersion !== WUXIA_PROTOCOL_VERSION) {
      throw new BridgeRequestError(
        WUXIA_ERROR_CODES.VERSION_MISMATCH,
        `自动化接口版本为 ${String(automationVersion)}，桥接协议要求版本 ${WUXIA_PROTOCOL_VERSION}。`,
      );
    }
    const snapshot = await candidate.getSnapshot();
    if (!snapshot.ready) {
      throw new BridgeRequestError(
        WUXIA_ERROR_CODES.AUTOMATION_NOT_READY,
        '武侠游戏界面正在重载，请稍后重新读取快照。',
        true,
      );
    }
    return snapshot;
  }

  function isCurrentStateQuery(
    queryGeneration: number,
    candidate: WuxiaAutomationApi | null,
    instanceId: string,
  ): boolean {
    return (
      !disposed &&
      stateQueryGeneration === queryGeneration &&
      automation === candidate &&
      automationInstanceId === instanceId
    );
  }

  function emitSnapshotState(snapshot: WuxiaAutomationSnapshot): void {
    if (!socket.connected || disposed) return;
    turnTimeoutMs = snapshot.turnTimeoutMs;
    stateRevision += 1;
    socket.emit(WUXIA_EVENTS.STATE, {
      automationReady: true,
      apiVersion: snapshot.version,
      automationInstanceId,
      automationGlobalName,
      chatId: snapshot.chatId,
      page: snapshot.page,
      busy: snapshot.busy || runInFlight !== null,
      turnTimeoutMs,
      stateRevision,
      snapshotCapturedAt: snapshot.capturedAt,
      latestMessageId: getLatestMessageId(snapshot),
    });
  }

  function emitUnavailableState(error: unknown): void {
    if (!socket.connected || disposed) return;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[wuxia-bridge] 自动化接口尚不可用。', error);
    stateRevision += 1;
    socket.emit(WUXIA_EVENTS.STATE, {
      automationReady: false,
      apiVersion: automation?.version ?? null,
      automationInstanceId,
      automationGlobalName,
      chatId: '',
      page: `error:${errorMessage}`,
      busy: runInFlight !== null,
      turnTimeoutMs,
      stateRevision,
      latestMessageId: null,
    });
  }

  async function emitState() {
    const queryGeneration = ++stateQueryGeneration;
    const candidate = automation;
    const instanceId = automationInstanceId;
    if (!socket.connected || disposed || !candidate) {
      if (!disposed && socket.connected && isCurrentStateQuery(queryGeneration, candidate, instanceId)) {
        emitUnavailableState(new Error('武侠游戏界面尚未初始化，请先进入游戏页面。'));
      }
      return;
    }
    try {
      const snapshot = await getUsableSnapshot(candidate);
      if (!isCurrentStateQuery(queryGeneration, candidate, instanceId)) return;
      emitSnapshotState(snapshot);
    } catch (error) {
      if (!isCurrentStateQuery(queryGeneration, candidate, instanceId)) return;
      emitUnavailableState(error);
    }
  }

  async function acquireAutomation(globalName: string = WUXIA_AUTOMATION_GLOBAL_PREFIX, instanceId = 'legacy') {
    const generation = ++acquisitionGeneration;
    try {
      const initialized = await waitGlobalInitialized<WuxiaAutomationApi | undefined>(globalName);
      const candidate = initialized ?? (globalThis as Record<string, unknown>)[globalName];
      if (disposed || generation !== acquisitionGeneration) return;
      if (!candidate || typeof (candidate as WuxiaAutomationApi).getSnapshot !== 'function') {
        throw new Error(`全局接口 ${globalName} 已初始化，但当前脚本作用域中没有可调用对象。`);
      }
      const previousInstanceId = automationInstanceId;
      automation = candidate as WuxiaAutomationApi;
      automationInstanceId = instanceId;
      automationGlobalName = globalName;
      if (
        previousInstanceId &&
        previousInstanceId !== instanceId &&
        runInFlight?.automationInstanceId === previousInstanceId
      ) {
        runInFlight = null;
      }
      void emitState();
    } catch (error) {
      if (!disposed && generation === acquisitionGeneration) {
        console.warn(`[wuxia-bridge] 等待自动化接口 ${globalName} 失败。`, error);
      }
    }
  }

  function requestAutomationDiscovery() {
    void eventEmit(WUXIA_GLOBAL_EVENTS.DISCOVER, { bridgeId, sessionId }).catch(error => {
      if (!disposed) console.warn('[wuxia-bridge] 请求发现武侠自动化接口失败。', error);
    });
  }

  async function dispatchRequest(request: WuxiaRpcRequest): Promise<WuxiaRpcResponse> {
    try {
      const requestAutomation = automation;
      if (!requestAutomation) {
        throw new BridgeRequestError(
          WUXIA_ERROR_CODES.AUTOMATION_NOT_READY,
          '武侠游戏界面尚未初始化，请先进入游戏页面。',
          true,
        );
      }
      const snapshot = await getUsableSnapshot(requestAutomation);
      if (request.method === WUXIA_METHODS.GET_SNAPSHOT) {
        // 读取快照本身就是比缓存状态更新的事实来源；同时使尚未返回的旧状态查询失效。
        if (automation === requestAutomation) {
          stateQueryGeneration += 1;
          emitSnapshotState(snapshot);
        }
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
      if (snapshot.busy || runInFlight !== null) {
        throw new BridgeRequestError(WUXIA_ERROR_CODES.BUSY, '当前已有生成或自动化回合正在运行。', true);
      }

      const input = String(request.params.input).trim();
      const settleTimeoutMs = request.params.settleTimeoutMs;
      const settleDelayMs = request.params.settleDelayMs;
      const runToken: RunInFlight = {
        requestId: request.id,
        automationInstanceId,
      };
      runInFlight = runToken;
      void emitState();
      try {
        const result = await requestAutomation.runTurn(input, {
          ...(settleTimeoutMs === undefined ? {} : { settleTimeoutMs }),
          ...(settleDelayMs === undefined ? {} : { settleDelayMs }),
        });
        return { id: request.id, ok: true, result };
      } finally {
        if (runInFlight === runToken) {
          runInFlight = null;
        }
        void emitState();
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

  socket.on(
    WUXIA_EVENTS.REQUEST,
    async (unknownRequest: unknown, acknowledge: (response: WuxiaRpcResponse) => void) => {
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
      const response = await entry.response;
      const responseReadyAt = Date.now();
      const isRunTurnRequest = request.method === WUXIA_METHODS.RUN_TURN;
      if (isRunTurnRequest) {
        forwardIframeLifecycleEvent('wuxia-bridge', 'bridge-run-turn-response-ready', {
          requestId: request.id,
          method: request.method,
          ok: response.ok,
        });
      }
      acknowledge(response);
      if (isRunTurnRequest) {
        forwardIframeLifecycleEvent('wuxia-bridge', 'bridge-run-turn-acknowledge-returned', {
          requestId: request.id,
          method: request.method,
          ok: response.ok,
          acknowledgeDurationMs: Date.now() - responseReadyAt,
        });
      }
    },
  );

  socket.on('connect', () => {
    void emitState();
    requestAutomationDiscovery();
  });
  socket.on('connect_error', error => {
    if (!disposed) console.warn(`[wuxia-bridge] 无法连接 ${config.url}: ${error.message}`);
  });

  const readyListener = eventOn(WUXIA_GLOBAL_EVENTS.READY, detail => {
    const announcement = readAutomationAnnouncement(detail);
    if (announcement) {
      void acquireAutomation(announcement.globalName, announcement.instanceId);
      return;
    }
    void acquireAutomation();
  });
  const disposedListener = eventOn(WUXIA_GLOBAL_EVENTS.DISPOSED, detail => {
    const announcement = readAutomationAnnouncement(detail);
    if (!announcement || announcement.instanceId !== automationInstanceId) return;
    acquisitionGeneration += 1;
    if (runInFlight?.automationInstanceId === announcement.instanceId) {
      runInFlight = null;
    }
    automation = null;
    automationInstanceId = '';
    automationGlobalName = '';
    void emitState();
  });
  const stateChangedListener = eventOn(WUXIA_GLOBAL_EVENTS.STATE_CHANGED, detail => {
    const announcement = readAutomationAnnouncement(detail);
    if (!announcement || announcement.instanceId !== automationInstanceId) return;
    void emitState();
  });
  const chatChangedListener = eventOn(tavern_events.CHAT_CHANGED, () => void emitState());

  function dispose() {
    if (disposed) return;
    disposed = true;
    acquisitionGeneration += 1;
    readyListener.stop();
    disposedListener.stop();
    stateChangedListener.stop();
    chatChangedListener.stop();
    socket.removeAllListeners();
    socket.disconnect();
    responseCache.clear();
    automation = null;
  }

  $(window).off(`pagehide${SCRIPT_EVENT_NAMESPACE}`).one(`pagehide${SCRIPT_EVENT_NAMESPACE}`, dispose);
  void acquireAutomation();
  requestAutomationDiscovery();
}

$(() => startBridge());
