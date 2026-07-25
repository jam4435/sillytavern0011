import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isHttp429Error,
  parseRetryAfterMs,
  runWith429Retry,
  type Retry429Context,
} from './rateLimitRetry';

describe('rateLimitRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('识别直接、嵌套状态和标准 429 文本', () => {
    expect(isHttp429Error({ status: 429 })).toBe(true);
    expect(isHttp429Error({ response: { statusCode: '429' } })).toBe(true);
    expect(isHttp429Error(new Error('429 Too Many Requests'))).toBe(true);
    expect(isHttp429Error(new Error('请求超时'))).toBe(false);
  });

  it('解析 Retry-After 秒数和 HTTP 日期', () => {
    expect(parseRetryAfterMs('1.5')).toBe(1500);
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:02 GMT', Date.parse('2026-01-01T00:00:00Z'))).toBe(2000);
    expect(parseRetryAfterMs('invalid')).toBeNull();
  });

  it('429 使用 1 秒、2 秒退避后在第三次成功', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce(new Error('Too Many Requests'))
      .mockResolvedValue('ok');
    const retries: Retry429Context[] = [];

    const resultPromise = runWith429Retry(operation, {
      requestLabel: '测试模型',
      onRetry: context => retries.push(context),
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(resultPromise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(retries.map(item => item.delayMs)).toEqual([1000, 2000]);
  });

  it('优先遵循 Retry-After 元数据', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ status: 429, retryAfterMs: 3500 })
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const resultPromise = runWith429Retry(operation, {
      requestLabel: '测试模型',
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(3499);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(resultPromise).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ delayMs: 3500 }));
  });

  it('连续三次 429 后停止，并注明已重试两次', async () => {
    const operation = vi.fn().mockRejectedValue({ response: { status: 429 } });
    const resultPromise = runWith429Retry(operation, { requestLabel: '测试模型' });
    const rejection = expect(resultPromise).rejects.toThrow('已自动重试 2 次');

    await vi.advanceTimersByTimeAsync(3000);

    await rejection;
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('非 429 错误立即抛出且不等待', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('网络断开'));

    await expect(runWith429Retry(operation, { requestLabel: '测试模型' })).rejects.toThrow('网络断开');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
