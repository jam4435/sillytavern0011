import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestConfiguredText } from './summaryApiClient';

describe('summaryApiClient HTTP 错误元数据', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('自定义 chat-completions 的 429 保留状态和 Retry-After', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        get: vi.fn((name: string) => (name.toLowerCase() === 'retry-after' ? '3' : null)),
      },
      text: vi.fn(async () => '{"error":"limited"}'),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('SillyTavern', {
      getRequestHeaders: vi.fn(() => ({ 'X-Test': 'true' })),
    });

    const request = requestConfiguredText({
      prompt: '测试提示词',
      settings: {
        apiMode: 'custom',
        apiConfig: {
          source: 'custom',
          apiurl: 'https://example.test/v1',
          key: 'test-key',
          model: 'test-model',
        },
        stream: false,
      },
    });

    await expect(request).rejects.toMatchObject({
      message: '{"error":"limited"}',
      status: 429,
      retryAfterMs: 3000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
