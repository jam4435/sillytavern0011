import {
  WUXIA_ERROR_CODES,
  WUXIA_EVENTS,
  WUXIA_METHODS,
  WUXIA_PROTOCOL_VERSION,
  WUXIA_SOCKET_NAMESPACE,
  WUXIA_TURN_TIMEOUT_MS,
  createErrorResponse,
  isRecord,
  validateRpcRequest,
} from './protocol.mjs';

const DEFAULT_SNAPSHOT_TIMEOUT_MS = 15_000;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function normalizeTurnTimeout(value) {
  return value === WUXIA_TURN_TIMEOUT_MS.EXTENDED ? WUXIA_TURN_TIMEOUT_MS.EXTENDED : WUXIA_TURN_TIMEOUT_MS.STANDARD;
}

function normalizeInput(value) {
  return normalizeString(value, 8_000).replace(/\s+/g, ' ');
}

function countComparisonStatuses(variableChanges) {
  const counts = {};
  const comparisons =
    isRecord(variableChanges?.aiReply) && Array.isArray(variableChanges.aiReply.comparisons)
      ? variableChanges.aiReply.comparisons
      : [];
  for (const comparison of comparisons) {
    const status = isRecord(comparison) ? normalizeString(comparison.status, 32) : '';
    if (status) counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function getMatchingTerminalDebugError(request, snapshot, notBefore = 0) {
  if (!isRecord(snapshot)) return null;
  const input = normalizeInput(request.params?.input);
  const debug = isRecord(snapshot.debug) ? snapshot.debug : null;
  const main = isRecord(debug?.main) ? debug.main : null;
  if (!input || normalizeInput(main?.userInput) !== input) return null;

  const startedAt = Number(debug?.startedAt);
  if (notBefore > 0 && (!Number.isFinite(startedAt) || startedAt < notBefore)) return null;

  const variable = isRecord(debug?.variable) ? debug.variable : null;
  if (main?.status === 'error') {
    return {
      stage: 'main',
      message: normalizeString(main.error, 20_000) || '主模型生成失败。',
      debug,
    };
  }
  if (main?.status === 'success' && variable?.status === 'error') {
    return {
      stage: 'variable',
      message: normalizeString(variable.error, 20_000) || '变量更新失败。',
      debug,
    };
  }
  return null;
}

function recoverPersistedTurnErrorReport(request, snapshot, notBefore = 0) {
  const matchedError = getMatchingTerminalDebugError(request, snapshot, notBefore);
  if (!matchedError) return null;

  const messages = Array.isArray(snapshot.recentMessages) ? snapshot.recentMessages.filter(isRecord) : [];
  const matchingUsers = messages.filter(
    message => message.role === 'user' && normalizeInput(message.text) === normalizeInput(request.params?.input),
  );
  const userMessage = matchingUsers.at(-1);
  const assistantMessage =
    userMessage && Number.isInteger(userMessage.messageId)
      ? messages.find(
          message =>
            message.role === 'assistant' &&
            Number.isInteger(message.messageId) &&
            message.messageId > userMessage.messageId,
        )
      : null;
  const main = matchedError.debug.main;

  return {
    ok: false,
    recovered: true,
    recoveryReason: 'turn-persisted-debug-error',
    failedStage: matchedError.stage,
    requestId: request.id,
    input: request.params.input.trim(),
    chatId: normalizeString(snapshot.chatId, 512),
    startedAt: Number(matchedError.debug.startedAt) || Date.now(),
    finishedAt: Number(matchedError.debug.updatedAt) || Number(snapshot.capturedAt) || Date.now(),
    ...(Number.isInteger(userMessage?.messageId) ? { userMessageId: userMessage.messageId } : {}),
    ...(Number.isInteger(assistantMessage?.messageId) ? { assistantMessageId: assistantMessage.messageId } : {}),
    rawReply:
      typeof assistantMessage?.text === 'string' ? assistantMessage.text : normalizeString(main.output, 1_000_000),
    statDataBefore: null,
    statDataAfter: isRecord(snapshot.statData) ? snapshot.statData : null,
    debug: matchedError.debug,
    variableChanges: isRecord(snapshot.variableChanges) ? snapshot.variableChanges : null,
    variableVerification: createFailureVerification(),
    error: matchedError.message,
  };
}

function createFailureVerification() {
  return {
    expected: false,
    signalObserved: false,
    timedOut: false,
    verdict: 'not-requested',
    declaredCount: 0,
    comparisonStatusCounts: {},
    parseErrors: [],
    signals: [],
  };
}

function recoverTurnReport(request, snapshot) {
  if (!isRecord(snapshot) || snapshot.busy === true) return null;
  const input = normalizeInput(request.params?.input);
  const debug = isRecord(snapshot.debug) ? snapshot.debug : null;
  const main = isRecord(debug?.main) ? debug.main : null;
  if (!input || normalizeInput(main?.userInput) !== input || !['success', 'error'].includes(main?.status)) return null;
  const messages = Array.isArray(snapshot.recentMessages) ? snapshot.recentMessages.filter(isRecord) : [];
  const matchingUsers = messages.filter(message => message.role === 'user' && normalizeInput(message.text) === input);
  const userMessage = matchingUsers.at(-1);
  if (!userMessage || !Number.isInteger(userMessage.messageId)) return null;
  const assistantMessage = messages.find(
    message =>
      message.role === 'assistant' && Number.isInteger(message.messageId) && message.messageId > userMessage.messageId,
  );
  if (!assistantMessage) return null;

  const variable = isRecord(debug?.variable) ? debug.variable : null;
  const variableMode = normalizeString(variable?.modeSnapshot, 16);
  if (variableMode === 'extra' && !['success', 'error', 'skipped'].includes(variable?.status)) return null;

  const variableChanges = isRecord(snapshot.variableChanges) ? snapshot.variableChanges : null;
  const parseErrors = Array.isArray(variableChanges?.parseErrors)
    ? variableChanges.parseErrors.map(error => String(error))
    : [];
  const declaredCount = Array.isArray(variableChanges?.declaredChanges) ? variableChanges.declaredChanges.length : 0;
  const actualCount = Array.isArray(variableChanges?.actualChanges) ? variableChanges.actualChanges.length : 0;
  const expected = declaredCount > 0;
  const comparisonStatusCounts = countComparisonStatuses(variableChanges);
  const failedComparisons = (comparisonStatusCounts['not-applied'] ?? 0) + (comparisonStatusCounts.diverged ?? 0);
  const successfulComparisons =
    (comparisonStatusCounts.applied ?? 0) +
    (comparisonStatusCounts['no-op'] ?? 0) +
    (comparisonStatusCounts['api-only'] ?? 0);
  const variableError = variable?.status === 'error' ? normalizeString(variable.error, 2_000) || '变量更新失败。' : '';
  const mainError = main.status === 'error' ? normalizeString(main.error, 2_000) || '主模型生成失败。' : '';
  const settled = variableChanges?.status === 'settled';
  const verdict = !expected
    ? 'not-requested'
    : parseErrors.length > 0 || failedComparisons > 0 || variableError
      ? 'failed'
      : settled && (successfulComparisons > 0 || actualCount > 0)
        ? 'applied'
        : 'inconclusive';
  const error = mainError || variableError || (verdict === 'failed' ? '变量更新验证失败。' : '');

  return {
    ok: !error,
    recovered: true,
    recoveryReason: 'turn-timeout-snapshot-reconciled',
    requestId: request.id,
    input: request.params.input.trim(),
    chatId: normalizeString(snapshot.chatId, 512),
    startedAt: Number(debug?.startedAt) || Date.now(),
    finishedAt: Number(debug?.updatedAt) || Number(snapshot.capturedAt) || Date.now(),
    userMessageId: userMessage.messageId,
    assistantMessageId: assistantMessage.messageId,
    rawReply:
      typeof assistantMessage.text === 'string' ? assistantMessage.text : normalizeString(main.output, 1_000_000),
    statDataBefore: null,
    statDataAfter: isRecord(snapshot.statData) ? snapshot.statData : null,
    debug,
    variableChanges,
    variableVerification: {
      expected,
      signalObserved: settled,
      timedOut: false,
      verdict,
      declaredCount,
      comparisonStatusCounts,
      parseErrors,
      signals: [],
    },
    ...(error ? { error } : {}),
  };
}

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
    automationInstanceId: state.automationInstanceId,
    automationGlobalName: state.automationGlobalName,
    chatId: state.chatId,
    page: state.page,
    busy: state.busy,
    turnTimeoutMs: state.turnTimeoutMs,
    stateRevision: state.stateRevision,
    snapshotCapturedAt: state.snapshotCapturedAt,
    connectedAt: state.connectedAt,
    updatedAt: state.updatedAt,
  };
}

function normalizeOptionalNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? Number(value) : null;
}

function normalizeOptionalTimestamp(value) {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : null;
}

function isOlderBridgeState(previous, stateRevision, snapshotCapturedAt) {
  if (stateRevision !== null) {
    if (previous.stateRevision !== null) return stateRevision <= previous.stateRevision;
    return false;
  }

  // 新桥已经开始发送 revision 后，拒绝同连接上无 revision 的迟到旧包；
  // 纯旧桥始终没有 revision，仍保持到达顺序兼容。
  if (previous.stateRevision !== null) return true;
  return (
    snapshotCapturedAt !== null &&
    previous.snapshotCapturedAt !== null &&
    snapshotCapturedAt < previous.snapshotCapturedAt
  );
}

function normalizeBridgeState(socket, previous, value) {
  const data = isRecord(value) ? value : {};
  const stateRevision = normalizeOptionalNonNegativeInteger(data.stateRevision);
  const snapshotCapturedAt = normalizeOptionalTimestamp(data.snapshotCapturedAt);
  if (isOlderBridgeState(previous, stateRevision, snapshotCapturedAt)) {
    return previous;
  }
  return {
    bridgeId: previous.bridgeId,
    sessionId: previous.sessionId,
    automationReady: data.automationReady === true,
    apiVersion: Number.isInteger(data.apiVersion) ? data.apiVersion : null,
    automationInstanceId: normalizeString(data.automationInstanceId, 160),
    automationGlobalName: normalizeString(data.automationGlobalName, 256),
    chatId: normalizeString(data.chatId, 512),
    page: normalizeString(data.page, 64),
    busy: data.busy === true,
    turnTimeoutMs: normalizeTurnTimeout(data.turnTimeoutMs),
    stateRevision,
    snapshotCapturedAt,
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
          : '没有酒馆自动化桥连接到武侠 Relay。';
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

  function chooseRecoveryBridge(originalState, target) {
    const readyStates = [...bridgeStates.values()].filter(state => state.automationReady);
    const exact = readyStates.filter(state => matchesTarget(state, target));
    if (exact.length > 0) return exact.at(-1);
    return readyStates.find(
      state =>
        state.bridgeId === originalState.bridgeId || (originalState.chatId && state.chatId === originalState.chatId),
    );
  }

  async function recoverTimedOutTurn(request, originalState, notBefore = 0) {
    const recoveryTimeoutMs = Number(options.recoveryTimeoutMs ?? WUXIA_TURN_TIMEOUT_MS.RECOVERY);
    const recoveryPollMs = Number(options.recoveryPollMs ?? 1_000);
    const deadline = Date.now() + Math.max(0, recoveryTimeoutMs);
    let attempt = 0;

    do {
      const state = chooseRecoveryBridge(originalState, request.target);
      if (state) {
        const snapshotRequest = {
          id: `${request.id}-recovery-${attempt}`.slice(0, 160),
          method: WUXIA_METHODS.GET_SNAPSHOT,
          params: {},
        };
        try {
          const response = await state.socket
            .timeout(Number(options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS))
            .emitWithAck(WUXIA_EVENTS.REQUEST, snapshotRequest);
          if (isRecord(response) && response.ok === true) {
            const failedReport = recoverPersistedTurnErrorReport(request, response.result, notBefore);
            if (failedReport) {
              logger.info?.(`[wuxia] 已从持久化调试恢复回合错误: ${request.id}`);
              return { id: request.id, ok: true, result: failedReport };
            }
            const report = recoverTurnReport(request, response.result);
            if (report) {
              logger.info?.(`[wuxia] 已通过快照恢复超时回合: ${request.id}`);
              return { id: request.id, ok: true, result: report };
            }
          }
        } catch {
          // 当前 iframe 可能仍在换代；在恢复窗口内继续寻找新桥。
        }
      }
      attempt += 1;
      if (Date.now() >= deadline) break;
      await delay(Math.max(10, recoveryPollMs));
    } while (Date.now() <= deadline);

    return null;
  }

  async function watchPersistedTurnError(request, originalState, timeoutMs, shouldStop, notBefore) {
    const pollMs = Number(options.persistedErrorPollMs ?? options.recoveryPollMs ?? 1_000);
    const deadline = Date.now() + Math.max(0, timeoutMs);
    let attempt = 0;

    while (!shouldStop() && Date.now() <= deadline) {
      const state = chooseRecoveryBridge(originalState, request.target);
      if (state) {
        const snapshotRequest = {
          id: `${request.id}-error-${attempt}`.slice(0, 160),
          method: WUXIA_METHODS.GET_SNAPSHOT,
          params: {},
        };
        try {
          const response = await state.socket
            .timeout(Number(options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS))
            .emitWithAck(WUXIA_EVENTS.REQUEST, snapshotRequest);
          if (isRecord(response) && response.ok === true) {
            const report = recoverPersistedTurnErrorReport(request, response.result, notBefore);
            if (report) {
              logger.info?.(`[wuxia] 发现本回合持久化调试错误，提前返回: ${request.id}`);
              return { id: request.id, ok: true, result: report };
            }
          }
        } catch {
          // 页面可能正在换代；下一次轮询会重新选择可用桥。
        }
      }
      attempt += 1;
      if (shouldStop() || Date.now() >= deadline) break;
      await delay(Math.max(10, pollMs));
    }

    return null;
  }

  async function recoverReplacedBridgeTurn(request, originalState, timeoutMs, shouldStop, notBefore) {
    const replacementPollMs = Number(options.replacementPollMs ?? 250);
    const deadline = Date.now() + Math.max(0, timeoutMs);

    while (!shouldStop() && Date.now() <= deadline) {
      const state = chooseRecoveryBridge(originalState, request.target);
      const socketReplaced = state && state.socket.id !== originalState.socket.id;
      const instanceReplaced =
        state &&
        originalState.automationInstanceId &&
        state.automationInstanceId &&
        state.automationInstanceId !== originalState.automationInstanceId;
      if (socketReplaced || instanceReplaced) {
        logger.info?.(`[wuxia] 检测到自动化实例换代，提前对账回合: ${request.id}`);
        return recoverTimedOutTurn(request, originalState, notBefore);
      }
      await delay(Math.max(10, replacementPollMs));
    }

    return null;
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
    let requestSettled = false;
    const requestStartedAt = Date.now();
    try {
      const timeoutMs = isRunTurn
        ? Number(options.turnTimeoutMs ?? state.turnTimeoutMs ?? WUXIA_TURN_TIMEOUT_MS.STANDARD)
        : Number(options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS);
      const responsePromise = state.socket
        .timeout(timeoutMs)
        .emitWithAck(WUXIA_EVENTS.REQUEST, request)
        .finally(() => {
          requestSettled = true;
        });
      const response = isRunTurn
        ? await Promise.race([
            responsePromise,
            recoverReplacedBridgeTurn(request, state, timeoutMs, () => requestSettled, requestStartedAt).then(
              recovered => recovered ?? new Promise(() => {}),
            ),
            watchPersistedTurnError(request, state, timeoutMs, () => requestSettled, requestStartedAt).then(
              recovered => recovered ?? new Promise(() => {}),
            ),
          ])
        : await responsePromise;
      if (!isRecord(response) || response.id !== request.id || typeof response.ok !== 'boolean') {
        return createErrorResponse(request.id, WUXIA_ERROR_CODES.INTERNAL, '酒馆桥返回了无效响应。');
      }
      if (
        isRunTurn &&
        response.ok === false &&
        isRecord(response.error) &&
        response.error.code === WUXIA_ERROR_CODES.OUTCOME_UNKNOWN
      ) {
        const recovered = await recoverTimedOutTurn(request, state, requestStartedAt);
        if (recovered) return recovered;
      }
      return response;
    } catch (error) {
      if (isRunTurn) {
        const recovered = await recoverTimedOutTurn(request, state, requestStartedAt);
        if (recovered) return recovered;
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
        automationInstanceId: '',
        automationGlobalName: '',
        chatId: '',
        page: '',
        busy: false,
        turnTimeoutMs: WUXIA_TURN_TIMEOUT_MS.STANDARD,
        stateRevision: null,
        snapshotCapturedAt: null,
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
