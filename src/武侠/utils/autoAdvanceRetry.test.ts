import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithAutoAdvanceFailureRetry } from './autoAdvanceRetry';

describe('runWithAutoAdvanceFailureRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('普通失败最多重试两次并返回成功结果', async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockRejectedValueOnce(new Error('empty response'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const resultPromise = runWithAutoAdvanceFailureRetry(operation, {
      requestLabel: '测试模型',
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(resultPromise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.objectContaining({ retryNumber: 1, delayMs: 1000 }));
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.objectContaining({ retryNumber: 2, delayMs: 2000 }));
  });

  it('普通失败耗尽后返回带重试次数的错误', async () => {
    vi.useFakeTimers();
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('still failed'));
    const resultPromise = runWithAutoAdvanceFailureRetry(operation, { requestLabel: '测试模型' });
    const rejection = expect(resultPromise).rejects.toThrow('已自动重试 2 次');

    await vi.advanceTimersByTimeAsync(3000);

    await rejection;
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('HTTP 429 耗尽错误不会在本层再次重试', async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue({ status: 429, message: 'Too Many Requests' });

    await expect(runWithAutoAdvanceFailureRetry(operation, { requestLabel: '测试模型' })).rejects.toMatchObject({
      status: 429,
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
