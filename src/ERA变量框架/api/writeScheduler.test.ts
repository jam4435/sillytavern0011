import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiWriteScheduler, type ApiWriteScheduleStart } from './writeScheduler';

class FakeVisibilityTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  private listeners = new Set<() => void>();

  addEventListener(_type: 'visibilitychange', listener: () => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void) {
    this.listeners.delete(listener);
  }

  setVisibility(state: DocumentVisibilityState) {
    this.visibilityState = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

describe('createApiWriteScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createHarness(initialVisibility: DocumentVisibilityState = 'visible') {
    const visibilityTarget = new FakeVisibilityTarget();
    visibilityTarget.visibilityState = initialVisibility;
    const microtasks: Array<() => void> = [];
    const starts: ApiWriteScheduleStart[] = [];
    const flush = vi.fn((start: ApiWriteScheduleStart) => starts.push(start));
    const scheduler = createApiWriteScheduler({
      delayMs: 75,
      flush,
      visibilityTarget,
      enqueueMicrotask: callback => microtasks.push(callback),
      scheduleTimeout: (callback, delayMs) => {
        const timerId = window.setTimeout(callback, delayMs);
        return {
          source: 'top',
          cancel: () => window.clearTimeout(timerId),
        };
      },
    });
    return { visibilityTarget, microtasks, starts, flush, scheduler };
  }

  it('隐藏页使用 microtask，且同步重复调度只产生一次 flush', () => {
    const { microtasks, flush, scheduler } = createHarness('hidden');

    expect(scheduler.schedule()).toBe(true);
    expect(scheduler.schedule()).toBe(false);
    expect(microtasks).toHaveLength(1);
    expect(flush).not.toHaveBeenCalled();

    microtasks.shift()!();

    expect(flush).toHaveBeenCalledOnce();
    expect(flush.mock.calls[0][0].source).toBe('microtask-hidden');
    expect(flush.mock.calls[0][0].delayMs).toBe(0);
  });

  it('可见页保留 75ms timer 合并窗口', () => {
    const { flush, scheduler } = createHarness('visible');

    scheduler.schedule();
    vi.advanceTimersByTime(74);
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledOnce();
    expect(flush.mock.calls[0][0].source).toBe('top');
  });

  it('可见页转为隐藏时取消 timer 并提升为 microtask', () => {
    const { visibilityTarget, microtasks, flush, scheduler } = createHarness('visible');

    scheduler.schedule();
    visibilityTarget.setVisibility('hidden');

    expect(microtasks).toHaveLength(1);
    microtasks.shift()!();
    expect(flush).toHaveBeenCalledOnce();
    expect(flush.mock.calls[0][0].source).toBe('microtask-promoted');

    vi.advanceTimersByTime(1000);
    expect(flush).toHaveBeenCalledOnce();
  });

  it('即使底层 timer 取消失效，也会忽略提升后的陈旧回调', () => {
    const visibilityTarget = new FakeVisibilityTarget();
    const microtasks: Array<() => void> = [];
    const flush = vi.fn();
    let staleTimerCallback: (() => void) | undefined;
    const scheduler = createApiWriteScheduler({
      delayMs: 75,
      flush,
      visibilityTarget,
      enqueueMicrotask: callback => microtasks.push(callback),
      scheduleTimeout: callback => {
        staleTimerCallback = callback;
        return { source: 'top', cancel: () => undefined };
      },
    });

    scheduler.schedule();
    visibilityTarget.setVisibility('hidden');
    microtasks.shift()!();
    staleTimerCallback!();

    expect(flush).toHaveBeenCalledOnce();
    expect(flush.mock.calls[0][0].source).toBe('microtask-promoted');
  });

  it('timer 注册失败时立即 fallback flush，避免队列永久滞留', () => {
    const visibilityTarget = new FakeVisibilityTarget();
    const flush = vi.fn();
    const onScheduleError = vi.fn();
    const scheduler = createApiWriteScheduler({
      delayMs: 75,
      flush,
      visibilityTarget,
      scheduleTimeout: () => {
        throw new Error('timer unavailable');
      },
      onScheduleError,
    });

    scheduler.schedule();

    expect(onScheduleError).toHaveBeenCalledOnce();
    expect(onScheduleError.mock.calls[0][1]).toBe('timer');
    expect(flush).toHaveBeenCalledOnce();
    expect(flush.mock.calls[0][0].source).toBe('immediate-fallback');
    expect(scheduler.hasPending()).toBe(false);
  });

  it('flush 期间产生的新任务可在上一轮完成后续排', () => {
    const visibilityTarget = new FakeVisibilityTarget();
    visibilityTarget.visibilityState = 'hidden';
    const microtasks: Array<() => void> = [];
    let scheduler: ReturnType<typeof createApiWriteScheduler>;
    const flush = vi.fn(() => {
      if (flush.mock.calls.length === 1) {
        expect(scheduler.schedule()).toBe(true);
      }
    });
    scheduler = createApiWriteScheduler({
      delayMs: 75,
      flush,
      visibilityTarget,
      enqueueMicrotask: callback => microtasks.push(callback),
      scheduleTimeout: () => ({ source: 'top', cancel: () => undefined }),
    });

    scheduler.schedule();
    microtasks.shift()!();
    expect(microtasks).toHaveLength(1);
    microtasks.shift()!();

    expect(flush).toHaveBeenCalledTimes(2);
  });
});
