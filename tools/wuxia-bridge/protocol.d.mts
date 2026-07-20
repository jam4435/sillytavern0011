export const WUXIA_PROTOCOL_VERSION: 1;
export const WUXIA_SOCKET_NAMESPACE: '/wuxia';
export const WUXIA_EVENTS: Readonly<{
  CALL: 'wuxia:call';
  REQUEST: 'wuxia:request';
  STATE: 'wuxia:state';
}>;
export const WUXIA_METHODS: Readonly<{
  STATUS: 'status';
  GET_SNAPSHOT: 'getSnapshot';
  RUN_TURN: 'runTurn';
}>;
export const WUXIA_ERROR_CODES: Readonly<Record<string, string>>;

export type WuxiaBridgeTarget = { bridgeId?: string; sessionId?: string; chatId?: string };
export type WuxiaRpcRequest = {
  id: string;
  method: 'status' | 'getSnapshot' | 'runTurn';
  params?: {
    input?: string;
    settleTimeoutMs?: number;
    settleDelayMs?: number;
  };
  target?: WuxiaBridgeTarget;
};
export type WuxiaRpcError = {
  code: string;
  message: string;
  retryable: boolean;
  outcome?: 'known' | 'unknown';
  details?: unknown;
};
export type WuxiaRpcResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: WuxiaRpcError };

export function isRecord(value: unknown): value is Record<string, unknown>;
export function createRequestId(prefix?: string): string;
export function createRpcError(
  code: string,
  message: string,
  options?: { retryable?: boolean; outcome?: 'known' | 'unknown'; details?: unknown },
): WuxiaRpcError;
export function createErrorResponse(
  id: unknown,
  code: string,
  message: string,
  options?: { retryable?: boolean; outcome?: 'known' | 'unknown'; details?: unknown },
): WuxiaRpcResponse;
export function validateRpcRequest(value: unknown): { ok: true } | { ok: false; message: string };

