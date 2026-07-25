export const WUXIA_PROTOCOL_VERSION = 1;
export const WUXIA_SOCKET_NAMESPACE = '/wuxia';
export const WUXIA_RELAY_DEFAULT_HOST = '127.0.0.1';
export const WUXIA_RELAY_DEFAULT_PORT = 6622;
export const WUXIA_RELAY_DEFAULT_URL = `http://${WUXIA_RELAY_DEFAULT_HOST}:${WUXIA_RELAY_DEFAULT_PORT}${WUXIA_SOCKET_NAMESPACE}`;

export const WUXIA_EVENTS = Object.freeze({
  CALL: 'wuxia:call',
  REQUEST: 'wuxia:request',
  STATE: 'wuxia:state',
});

export const WUXIA_GLOBAL_EVENTS = Object.freeze({
  DISCOVER: 'wuxia:automation-discover',
  READY: 'wuxia:automation-ready',
  DISPOSED: 'wuxia:automation-disposed',
  STATE_CHANGED: 'wuxia:automation-state-changed',
});

export const WUXIA_AUTOMATION_GLOBAL_PREFIX = 'WuxiaAutomation';

export const WUXIA_TURN_TIMEOUT_MS = Object.freeze({
  STANDARD: 3 * 60 * 1_000,
  EXTENDED: 6 * 60 * 1_000,
  RECOVERY: 60 * 1_000,
  CLIENT_GRACE: 15 * 1_000,
});

export const WUXIA_METHODS = Object.freeze({
  STATUS: 'status',
  GET_SNAPSHOT: 'getSnapshot',
  RUN_TURN: 'runTurn',
});

export const WUXIA_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SERVER_OFFLINE: 'SERVER_OFFLINE',
  BRIDGE_OFFLINE: 'BRIDGE_OFFLINE',
  AUTOMATION_NOT_READY: 'AUTOMATION_NOT_READY',
  MULTIPLE_BRIDGES: 'MULTIPLE_BRIDGES',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  BUSY: 'BUSY',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  TIMEOUT: 'TIMEOUT',
  INTERNAL: 'INTERNAL',
});

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createRequestId(prefix = 'wuxia') {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAutomationGlobalName(instanceId) {
  const normalizedInstanceId = String(instanceId ?? '').trim();
  if (!normalizedInstanceId || normalizedInstanceId.length > 160) {
    throw new TypeError('武侠自动化实例 id 长度必须为 1-160。');
  }
  return `${WUXIA_AUTOMATION_GLOBAL_PREFIX}:${normalizedInstanceId}`;
}

export function createRpcError(code, message, options = {}) {
  return {
    code,
    message,
    retryable: options.retryable === true,
    ...(options.outcome ? { outcome: options.outcome } : {}),
    ...(options.details === undefined ? {} : { details: options.details }),
  };
}

export function createErrorResponse(id, code, message, options = {}) {
  return {
    id: typeof id === 'string' ? id : '',
    ok: false,
    error: createRpcError(code, message, options),
  };
}

export function validateRpcRequest(value) {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 160) {
    return { ok: false, message: '请求必须包含长度为 1-160 的字符串 id。' };
  }

  if (!Object.values(WUXIA_METHODS).includes(value.method)) {
    return { ok: false, message: `不支持的方法: ${String(value.method)}` };
  }

  if (value.target !== undefined && !isRecord(value.target)) {
    return { ok: false, message: 'target 必须是对象。' };
  }

  if (value.method === WUXIA_METHODS.RUN_TURN) {
    if (!isRecord(value.params) || typeof value.params.input !== 'string') {
      return { ok: false, message: 'runTurn.params.input 必须是字符串。' };
    }
    const input = value.params.input.trim();
    if (!input || input.length > 8_000) {
      return { ok: false, message: '玩家行动长度必须为 1-8000 个字符。' };
    }
    for (const [key, max] of [
      ['settleTimeoutMs', 30_000],
      ['settleDelayMs', 1_000],
    ]) {
      const option = value.params[key];
      if (option !== undefined && (!Number.isFinite(option) || option < 0 || option > max)) {
        return { ok: false, message: `${key} 必须是 0-${max} 范围内的数字。` };
      }
    }
  }

  return { ok: true };
}
