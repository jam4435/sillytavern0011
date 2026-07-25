export const MAX_429_RETRIES = 2;

const FALLBACK_RETRY_DELAYS_MS = [1000, 2000] as const;
const HTTP_429_MESSAGE_REGEX = /(?:^|\D)429(?:\D|$)|too many requests/i;

type UnknownRecord = Record<string, unknown>;

export interface Retry429Context {
  requestLabel: string;
  retryNumber: number;
  maxRetries: number;
  delayMs: number;
  error: unknown;
}

export interface RunWith429RetryOptions {
  requestLabel: string;
  onRetry?: (context: Retry429Context) => void;
}

export type HttpStatusError = Error & {
  status?: number;
  retryAfterMs?: number;
  cause?: unknown;
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object';
}

function is429Status(value: unknown): boolean {
  return value === 429 || (typeof value === 'string' && value.trim() === '429');
}

function readHeaderValue(headers: unknown, headerName: string): string | null {
  if (!headers) {
    return null;
  }

  if (isRecord(headers) && typeof headers.get === 'function') {
    const value = (headers.get as (this: unknown, name: string) => unknown).call(headers, headerName);
    return typeof value === 'string' ? value : null;
  }

  if (!isRecord(headers)) {
    return null;
  }

  const targetName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === targetName && (typeof value === 'string' || typeof value === 'number')) {
      return String(value);
    }
  }
  return null;
}

export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return Math.max(0, timestamp - now);
}

function find429(error: unknown, visited = new Set<unknown>()): boolean {
  if (is429Status(error)) {
    return true;
  }
  if (typeof error === 'string') {
    return HTTP_429_MESSAGE_REGEX.test(error);
  }
  if (!isRecord(error) || visited.has(error)) {
    return false;
  }
  visited.add(error);

  if (is429Status(error.status) || is429Status(error.statusCode) || is429Status(error.code)) {
    return true;
  }
  if (typeof error.message === 'string' && HTTP_429_MESSAGE_REGEX.test(error.message)) {
    return true;
  }

  return [error.response, error.cause, error.error].some(nested => find429(nested, visited));
}

export function isHttp429Error(error: unknown): boolean {
  return find429(error);
}

function findRetryAfterMs(error: unknown, visited = new Set<unknown>()): number | null {
  if (!isRecord(error) || visited.has(error)) {
    return null;
  }
  visited.add(error);

  if (typeof error.retryAfterMs === 'number' && Number.isFinite(error.retryAfterMs) && error.retryAfterMs >= 0) {
    return error.retryAfterMs;
  }

  const directRetryAfter = error.retryAfter;
  if (typeof directRetryAfter === 'string' || typeof directRetryAfter === 'number') {
    const parsed = parseRetryAfterMs(String(directRetryAfter));
    if (parsed !== null) {
      return parsed;
    }
  }

  const headerRetryAfter = parseRetryAfterMs(readHeaderValue(error.headers, 'Retry-After'));
  if (headerRetryAfter !== null) {
    return headerRetryAfter;
  }

  for (const nested of [error.response, error.cause, error.error]) {
    const nestedRetryAfter = findRetryAfterMs(nested, visited);
    if (nestedRetryAfter !== null) {
      return nestedRetryAfter;
    }
  }
  return null;
}

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, delayMs));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

function createRetryExhaustedError(error: unknown): HttpStatusError {
  const exhaustedError = new Error(
    `${getErrorMessage(error)}（HTTP 429，已自动重试 ${MAX_429_RETRIES} 次）`,
  ) as HttpStatusError;
  exhaustedError.status = 429;
  exhaustedError.cause = error;
  return exhaustedError;
}

export async function runWith429Retry<T>(
  operation: () => Promise<T>,
  { requestLabel, onRetry }: RunWith429RetryOptions,
): Promise<T> {
  for (let retryCount = 0; ; retryCount += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isHttp429Error(error)) {
        throw error;
      }
      if (retryCount >= MAX_429_RETRIES) {
        throw createRetryExhaustedError(error);
      }

      const retryNumber = retryCount + 1;
      const delayMs = findRetryAfterMs(error) ?? FALLBACK_RETRY_DELAYS_MS[retryCount];
      onRetry?.({
        requestLabel,
        retryNumber,
        maxRetries: MAX_429_RETRIES,
        delayMs,
        error,
      });
      await wait(delayMs);
    }
  }
}
