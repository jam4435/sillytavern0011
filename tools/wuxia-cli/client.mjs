import { io } from 'socket.io-client';
import {
  WUXIA_ERROR_CODES,
  WUXIA_EVENTS,
  WUXIA_METHODS,
  WUXIA_PROTOCOL_VERSION,
  WUXIA_SOCKET_NAMESPACE,
  createErrorResponse,
} from '../wuxia-bridge/protocol.mjs';

export const DEFAULT_WUXIA_BRIDGE_URL = `http://127.0.0.1:6621${WUXIA_SOCKET_NAMESPACE}`;

function waitForConnection(socket) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleError);
    };
    const handleConnect = () => {
      cleanup();
      resolve();
    };
    const handleError = error => {
      cleanup();
      reject(error);
    };
    socket.once('connect', handleConnect);
    socket.once('connect_error', handleError);
    socket.connect();
  });
}

export async function callWuxiaBridge(request, options = {}) {
  const url = options.url ?? process.env.WUXIA_BRIDGE_URL ?? DEFAULT_WUXIA_BRIDGE_URL;
  const token = options.token ?? process.env.WUXIA_BRIDGE_TOKEN ?? '';
  const connectionTimeoutMs = Number(options.connectionTimeoutMs ?? 5_000);
  const requestTimeoutMs = Number(
    options.requestTimeoutMs ?? (request.method === WUXIA_METHODS.RUN_TURN ? 310_000 : 20_000),
  );
  const socket = io(url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    timeout: connectionTimeoutMs,
    transports: ['websocket', 'polling'],
    auth: {
      role: 'cli',
      token,
      protocolVersion: WUXIA_PROTOCOL_VERSION,
    },
  });

  try {
    await waitForConnection(socket);
  } catch (error) {
    socket.disconnect();
    return createErrorResponse(request.id, WUXIA_ERROR_CODES.SERVER_OFFLINE, `无法连接武侠监听服务 ${url}。`, {
      retryable: true,
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    return await socket.timeout(requestTimeoutMs).emitWithAck(WUXIA_EVENTS.CALL, request);
  } catch (error) {
    const isRunTurn = request.method === WUXIA_METHODS.RUN_TURN;
    return createErrorResponse(
      request.id,
      isRunTurn ? WUXIA_ERROR_CODES.OUTCOME_UNKNOWN : WUXIA_ERROR_CODES.TIMEOUT,
      isRunTurn
        ? 'CLI 等待剧情结果时连接中断或超时；请先读取 snapshot 对账，禁止自动重试。'
        : '等待酒馆监听服务响应超时。',
      {
        retryable: !isRunTurn,
        ...(isRunTurn ? { outcome: 'unknown' } : {}),
        details: error instanceof Error ? error.message : String(error),
      },
    );
  } finally {
    socket.disconnect();
  }
}
