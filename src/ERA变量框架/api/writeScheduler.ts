import type { UnthrottledTimerHandle, UnthrottledTimerSource } from '../../shared/unthrottledTimer';

export type ApiWriteScheduleSource =
  | UnthrottledTimerSource
  | 'microtask-hidden'
  | 'microtask-promoted'
  | 'immediate-fallback';

export interface ApiWriteScheduleSnapshot {
  id: number;
  source: ApiWriteScheduleSource;
  scheduledAt: number;
  expectedAt: number;
  delayMs: number;
}

export interface ApiWriteScheduleStart extends ApiWriteScheduleSnapshot {
  actualStartAt: number;
  lagMs: number;
}

interface PendingApiWriteSchedule extends ApiWriteScheduleSnapshot {
  cancel: () => void;
}

interface VisibilityTarget {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface ApiWriteSchedulerOptions {
  delayMs: number;
  flush: (start: ApiWriteScheduleStart) => void;
  scheduleTimeout: (callback: () => void, delayMs: number) => UnthrottledTimerHandle;
  visibilityTarget?: VisibilityTarget;
  enqueueMicrotask?: (callback: () => void) => void;
  now?: () => number;
  onScheduled?: (schedule: ApiWriteScheduleSnapshot) => void;
  onStarted?: (start: ApiWriteScheduleStart) => void;
  onScheduleError?: (error: unknown, source: 'timer' | 'microtask') => void;
}

export interface ApiWriteScheduler {
  schedule: () => boolean;
  hasPending: () => boolean;
  promoteIfHidden: () => boolean;
  cancel: () => void;
  dispose: () => void;
}

/**
 * 可见页保留短暂的 timer 合并窗口；隐藏页改在当前任务结束后的 microtask flush，
 * 避免 Chromium 把后台页 timer 延后到十几秒甚至更久。
 */
export function createApiWriteScheduler(options: ApiWriteSchedulerOptions): ApiWriteScheduler {
  const now = options.now ?? Date.now;
  const enqueueMicrotask = options.enqueueMicrotask ?? queueMicrotask;
  const visibilityTarget = options.visibilityTarget ?? document;
  let nextScheduleId = 0;
  let pending: PendingApiWriteSchedule | null = null;
  let disposed = false;

  const begin = (scheduleId: number) => {
    if (disposed || pending?.id !== scheduleId) {
      return;
    }
    const schedule = pending;
    pending = null;
    const actualStartAt = now();
    const start: ApiWriteScheduleStart = {
      ...schedule,
      actualStartAt,
      lagMs: Math.max(0, actualStartAt - schedule.expectedAt),
    };
    options.onStarted?.(start);
    options.flush(start);
  };

  const startImmediatelyAfterScheduleError = (error: unknown, source: 'timer' | 'microtask') => {
    options.onScheduleError?.(error, source);
    const scheduledAt = now();
    const schedule: PendingApiWriteSchedule = {
      id: ++nextScheduleId,
      source: 'immediate-fallback',
      scheduledAt,
      expectedAt: scheduledAt,
      delayMs: 0,
      cancel: () => undefined,
    };
    pending = schedule;
    options.onScheduled?.(schedule);
    begin(schedule.id);
  };

  const scheduleMicrotask = (source: 'microtask-hidden' | 'microtask-promoted') => {
    const scheduledAt = now();
    const schedule: PendingApiWriteSchedule = {
      id: ++nextScheduleId,
      source,
      scheduledAt,
      expectedAt: scheduledAt,
      delayMs: 0,
      // microtask 无法物理取消；begin 中的 id 校验负责忽略陈旧回调。
      cancel: () => undefined,
    };
    pending = schedule;
    try {
      enqueueMicrotask(() => begin(schedule.id));
      options.onScheduled?.(schedule);
    } catch (error) {
      pending = null;
      startImmediatelyAfterScheduleError(error, 'microtask');
    }
  };

  const scheduleTimer = () => {
    const scheduledAt = now();
    const scheduleId = ++nextScheduleId;
    try {
      const timer = options.scheduleTimeout(() => begin(scheduleId), options.delayMs);
      const schedule: PendingApiWriteSchedule = {
        id: scheduleId,
        source: timer.source,
        scheduledAt,
        expectedAt: scheduledAt + options.delayMs,
        delayMs: options.delayMs,
        cancel: timer.cancel,
      };
      pending = schedule;
      options.onScheduled?.(schedule);
    } catch (error) {
      startImmediatelyAfterScheduleError(error, 'timer');
    }
  };

  const schedule = () => {
    if (disposed || pending) {
      return false;
    }
    if (visibilityTarget.visibilityState === 'hidden') {
      scheduleMicrotask('microtask-hidden');
    } else {
      scheduleTimer();
    }
    return true;
  };

  const promoteIfHidden = () => {
    if (
      disposed ||
      visibilityTarget.visibilityState !== 'hidden' ||
      !pending ||
      pending.source === 'microtask-hidden' ||
      pending.source === 'microtask-promoted' ||
      pending.source === 'immediate-fallback'
    ) {
      return false;
    }
    const previous = pending;
    pending = null;
    previous.cancel();
    scheduleMicrotask('microtask-promoted');
    return true;
  };

  const cancel = () => {
    const previous = pending;
    pending = null;
    previous?.cancel();
  };

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    cancel();
    visibilityTarget.removeEventListener('visibilitychange', promoteIfHidden);
  };

  visibilityTarget.addEventListener('visibilitychange', promoteIfHidden);

  return {
    schedule,
    hasPending: () => pending !== null,
    promoteIfHidden,
    cancel,
    dispose,
  };
}
