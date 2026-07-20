import {
  WUXIA_ERROR_CODES,
  WUXIA_EVENTS,
  WUXIA_METHODS,
  WUXIA_PROTOCOL_VERSION,
  WUXIA_SOCKET_NAMESPACE,
  createErrorResponse,
  isRecord,
  validateRpcRequest,
} from './protocol.mjs';

const DEFAULT_SNAPSHOT_TIMEOUT_MS = 15_000;
const DEFAULT_TURN_TIMEOUT_MS = 300_000;

function normalizeString(value, maxLength = 256) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseAllowedOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedBrowserOrigin(origin, configuredOrigins) {
  if (!origin) return false;
  if (isLoopbackOrigin(origin)) return true;
  return configuredOrigins.includes(origin);
}

function publicBridgeState(socket, state) {
  return {
    bridgeId: state.bridgeId,
    sessionId: state.sessionId,
    socketId: socket.id,
    automationReady: state.automationReady,
    apiVersion: state.apiVersion,
    chatId: state.chatId,
    page: state.page,
    busy: state.busy,
    connectedAt: state.connectedAt,
    updatedAt: state.updatedAt,
  };
}

function normalizeBridgeState(socket, previous, value) {
  const data = isRecord(value) ? value : {};
  return {
    bridgeId: previous.bridgeId,
    sessionId: previous.sessionId,
    automationReady: data.automationReady === true,
    apiVersion: Number.isInteger(data.apiVersion) ? data.apiVersion : null,
    chatId: normalizeString(data.chatId, 512),
    page: normalizeString(data.page, 64),
    busy: data.busy === true,
    connectedAt: previous.connectedAt,
    updatedAt: Date.now(),
    socket,
  };
}

function matchesTarget(state, target) {
  if (!isRecord(target)) return true;
  if (target.bridgeId && state.bridgeId !== target.bridgeId) return false;
  if (target.sessionId && state.sessionId !== target.sessionId) return false;
  if (target.chatId && state.chatId !== target.chatId) return false;
  return true;
}

export function attachWuxiaAutomationRelay(io, options = {}) {
  const namespace = io.of(options.namespace ?? WUXIA_SOCKET_NAMESPACE);
  const token = String(options.token ?? '');
  const configuredOrigins = parseAllowedOrigins(options.allowedOrigins);
  const logger = options.logger ?? console;
  const bridgeStates = new Map();
  const runInFlight = new Set();

  namespace.use((socket, next) => {
    const auth = isRecord(socket.handshake.auth) ? socket.handshake.auth : {};
    const role = auth.role;
    const version = Number(auth.protocolVersion);
    const origin = socket.handshake.headers.origin;

    if (version !== WUXIA_PROTOCOL_VERSION) {
      return next(new Error('VERSION_MISMATCH'));
    }
    if (role !== 'bridge' && role !== 'cli') {
      return next(new Error('UNAUTHORIZED'));
    }
    if (token && auth.token !== token) {
      return next(new Error('UNAUTHORIZED'));
    }
    if (role === 'bridge' && !isAllowedBrowserOrigin(origin, configuredOrigins)) {
      return next(new Error('ORIGIN_NOT_ALLOWED'));
    }
    if (role === 'cli' && origin) {
      return next(new Error('UNAUTHORIZED'));
    }

    socket.data.role = role;
    socket.data.bridgeId = normalizeString(auth.bridgeId, 160);
    socket.data.sessionId = normalizeString(auth.sessionId, 160);
    return next();
  });

  function getStatus() {
    const bridges = [...bridgeStates.values()].map(state => publicBridgeState(state.socket, state));
    return {
      protocolVersion: WUXIA_PROTOCOL_VERSION,
      serverOnline: true,
      bridgeConnected: bridges.length > 0,
      readyBridgeCount: bridges.filter(bridge => bridge.automationReady).length,
      bridges,
      capturedAt: Date.now(),
    };
  }

  function chooseBridge(request) {
    const allStates = [...bridgeStates.values()];
    const targetedStates = allStates.filter(state => matchesTarget(state, request.target));
    if (isRecord(request.target) && targetedStates.length === 0) {
      return {
        error: createErrorResponse(
          request.id,
          WUXIA_ERROR_CODES.TARGET_NOT_FOUND,
          '没有找到匹配 bridgeId/sessionId/chatId 的酒馆页面。',
          { retryable: true },
        ),
      };
    }

    const readyStates = targetedStates.filter(state => state.automationReady);
    if (readyStates.length === 0) {
      const code =
        targetedStates.length > 0 ? WUXIA_ERROR_CODES.AUTOMATION_NOT_READY : WUXIA_ERROR_CODES.BRIDGE_OFFLINE;
      const message =
        code === WUXIA_ERROR_CODES.AUTOMATION_NOT_READY
          ? '酒馆桥已连接，但武侠游戏界面尚未初始化。'
          : '没有酒馆自动化桥连接到 pnpm watch。';
      return { error: createErrorResponse(request.id, code, message, { retryable: true }) };
    }
    if (readyStates.length > 1) {
      return {
        error: createErrorResponse(
          request.id,
          WUXIA_ERROR_CODES.MULTIPLE_BRIDGES,
          '检测到多个可用酒馆页面，请通过 --bridge-id、--session-id 或 --chat-id 指定目标。',
          { retryable: true, details: readyStates.map(state => publicBridgeState(state.socket, state)) },
        ),
      };
    }
    return { state: readyStates[0] };
  }

  async function forwardRequest(request) {
    const selected = chooseBridge(request);
    if (selected.error) return selected.error;
    const state = selected.state;
    const runKey = state.sessionId || state.socket.id;
    const isRunTurn = request.method === WUXIA_METHODS.RUN_TURN;
    if (isRunTurn && runInFlight.has(runKey)) {
      return createErrorResponse(request.id, WUXIA_ERROR_CODES.BUSY, '该酒馆页面已有剧情回合正在执行。', {
        retryable: true,
      });
    }

    if (isRunTurn) runInFlight.add(runKey);
    try {
      const timeoutMs = isRunTurn
        ? Number(options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS)
        : Number(options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS);
      const response = await state.socket.timeout(timeoutMs).emitWithAck(WUXIA_EVENTS.REQUEST, request);
      if (!isRecord(response) || response.id !== request.id || typeof response.ok !== 'boolean') {
        return createErrorResponse(request.id, WUXIA_ERROR_CODES.INTERNAL, '酒馆桥返回了无效响应。');
      }
      return response;
    } catch (error) {
      if (isRunTurn) {
        return createErrorResponse(
          request.id,
          WUXIA_ERROR_CODES.OUTCOME_UNKNOWN,
          '剧情请求发送后连接中断或超时，无法确认是否已经新增楼层；请先读取 snapshot 对账，禁止自动重试。',
          { retryable: false, outcome: 'unknown' },
        );
      }
      return createErrorResponse(request.id, WUXIA_ERROR_CODES.TIMEOUT, '读取酒馆快照时连接中断或超时。', {
        retryable: true,
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (isRunTurn) runInFlight.delete(runKey);
    }
  }

  namespace.on('connection', socket => {
    if (socket.data.role === 'bridge') {
      const bridgeId = socket.data.bridgeId || `bridge-${socket.id}`;
      const sessionId = socket.data.sessionId || socket.id;
      const initialState = {
        bridgeId,
        sessionId,
        automationReady: false,
        apiVersion: null,
        chatId: '',
        page: '',
        busy: false,
        connectedAt: Date.now(),
        updatedAt: Date.now(),
        socket,
      };
      bridgeStates.set(socket.id, initialState);
      socket.on(WUXIA_EVENTS.STATE, value => {
        const previous = bridgeStates.get(socket.id);
        if (previous) bridgeStates.set(socket.id, normalizeBridgeState(socket, previous, value));
      });
      socket.on('disconnect', () => {
        bridgeStates.delete(socket.id);
      });
      logger.info?.(`[wuxia] 酒馆自动化桥已连接: ${bridgeId}/${sessionId}`);
      return;
    }

    socket.on(WUXIA_EVENTS.CALL, async (request, acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      const validation = validateRpcRequest(request);
      if (!validation.ok) {
        acknowledge(
          createErrorResponse(request?.id, WUXIA_ERROR_CODES.INVALID_REQUEST, validation.message, {
            retryable: false,
          }),
        );
        return;
      }
      if (request.method === WUXIA_METHODS.STATUS) {
        acknowledge({ id: request.id, ok: true, result: getStatus() });
        return;
      }
      acknowledge(await forwardRequest(request));
    });
  });

  if (!token) {
    logger.warn?.('[wuxia] WUXIA_BRIDGE_TOKEN 未设置；自动化 namespace 仅依赖来源校验，建议本机调通后配置令牌。');
  }

  return {
    namespace,
    getStatus,
    dispose() {
      namespace.removeAllListeners();
      for (const socket of namespace.sockets.values()) socket.disconnect(true);
      bridgeStates.clear();
      runInFlight.clear();
    },
  };
}
