import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleUnthrottledInterval, scheduleUnthrottledTimeout } from './unthrottledTimer';

describe('unthrottledTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('隐藏 iframe 优先把 timeout 注册到顶层窗口', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeWindow = iframe.contentWindow;
    expect(iframeWindow).not.toBeNull();

    const callback = vi.fn();
    const handle = scheduleUnthrottledTimeout(callback, 2000, iframeWindow!);

    expect(handle.source).toBe('top');
    vi.advanceTimersByTime(1999);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('iframe pagehide 时取消注册在顶层窗口的 interval', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeWindow = iframe.contentWindow!;
    const callback = vi.fn();
    const handle = scheduleUnthrottledInterval(callback, 1000, iframeWindow);

    expect(handle.source).toBe('top');
    iframeWindow.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });
});
