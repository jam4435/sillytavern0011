import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IFRAME_LIFECYCLE_BLACK_BOX_STORAGE_KEY,
  IFRAME_PENDING_RELOAD_REASON_STORAGE_KEY,
  markPendingIframeReloadReason,
  readIframeLifecycleBlackBox,
  readPendingIframeReloadReason,
  recordIframeLifecycleEvent,
} from './iframeLifecycleBlackBox';

describe('iframeLifecycleBlackBox', () => {
  beforeEach(() => {
    localStorage.removeItem(IFRAME_LIFECYCLE_BLACK_BOX_STORAGE_KEY);
    localStorage.removeItem(IFRAME_PENDING_RELOAD_REASON_STORAGE_KEY);
    vi.useRealTimers();
  });

  it('跨 iframe 可持久读取生命周期事件和刷新原因', () => {
    recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-requested', { roundId: 'round-1' }, 'runtime-1');
    const marker = markPendingIframeReloadReason('hidden-floor', 'refreshOneMessage:turn-finish', {
      latestMessageId: 10,
    });

    expect(readIframeLifecycleBlackBox()).toEqual([
      expect.objectContaining({
        source: 'wuxia-frontend',
        event: 'turn-lock-requested',
        runtimeId: 'runtime-1',
        details: { roundId: 'round-1' },
      }),
      expect.objectContaining({
        source: 'hidden-floor',
        event: 'iframe-reload-requested',
        details: expect.objectContaining({ reason: 'refreshOneMessage:turn-finish', latestMessageId: 10 }),
      }),
    ]);
    expect(readPendingIframeReloadReason()).toMatchObject({ id: marker?.id, reason: 'refreshOneMessage:turn-finish' });
  });

  it('忽略超过诊断窗口的旧刷新原因', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00Z'));
    markPendingIframeReloadReason('hidden-floor', 'old-reload');
    vi.advanceTimersByTime(31_000);

    expect(readPendingIframeReloadReason()).toBeNull();
  });
});
