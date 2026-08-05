import { isHttp429Error } from './rateLimitRetry';

export const MAX_AUTO_ADVANCE_FAILURE_RETRIES = 2;

const AUTO_ADVANCE_FAILURE_RETRY_DELAYS_MS = [1000, 2000] as const;

export interface AutoAdvanceFailureRetryContext {
  requestLabel: string;
  retryNumber: number;
  maxRetries: number;
  delayMs: number;
  error: unknown;
}

export interface RunWithAutoAdvanceFailureRetryOptions {
  requestLabel: string;
  onRetry?: (context: AutoAdvanceFailureRetryContext) => void;
}

type RetryExhaustedError = Error & {
  cause?: unknown;
};

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, delayMs));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return String(error);
}

function createRetryExhaustedError(error: unknown, requestLabel: string): RetryExhaustedError {
  const exhaustedError = new Error(
    `${getErrorMessage(error)}（${requestLabel}失败，已自动重试 ${MAX_AUTO_ADVANCE_FAILURE_RETRIES} 次）`,
  ) as RetryExhaustedError;
  exhaustedError.cause = error;
  return exhaustedError;
}

/**
 * 自动推进专用的普通失败重试。
 *
 * 调用方必须保证 operation 只包含尚未落盘的模型请求与响应校验。HTTP 429
 * 由请求内层的 runWith429Retry 处理；429 耗尽后不再由本层扩大重试次数。
 */
export async function runWithAutoAdvanceFailureRetry<T>(
  operation: () => Promise<T>,
  { requestLabel, onRetry }: RunWithAutoAdvanceFailureRetryOptions,
): Promise<T> {
  for (let retryCount = 0; ; retryCount += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isHttp429Error(error)) {
        throw error;
      }
      if (retryCount >= MAX_AUTO_ADVANCE_FAILURE_RETRIES) {
        throw createRetryExhaustedError(error, requestLabel);
      }

      const retryNumber = retryCount + 1;
      const delayMs = AUTO_ADVANCE_FAILURE_RETRY_DELAYS_MS[retryCount];
      onRetry?.({
        requestLabel,
        retryNumber,
        maxRetries: MAX_AUTO_ADVANCE_FAILURE_RETRIES,
        delayMs,
        error,
      });
      await wait(delayMs);
    }
  }
}
