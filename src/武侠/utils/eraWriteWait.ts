import { scheduleUnthrottledTimeout } from '../../shared/unthrottledTimer';

export type EraWriteDoneDetail = {
  message_id?: number | null;
  actions?: Record<string, unknown>;
};

export type EraWaitOptions = {
  timeoutMs?: number;
  timeoutMessage: string;
  expectedMessageId?: number;
  expectedAction?: string;
  detail?: unknown;
};

type EraWriteDoneWaiter = {
  promise: Promise<void>;
  finish: (error?: Error) => void;
};

export type EraWriteDoneObserver = {
  waitForMessageId: (
    messageId: number,
    options: { timeoutMs?: number; timeoutMessage: string },
  ) => Promise<EraWriteDoneDetail>;
  stop: () => void;
};

function matchesEraWriteDone(
  detail: unknown,
  expectedMessageId?: number,
  expectedAction?: string,
): boolean {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return false;
  }

  const writeDone = detail as EraWriteDoneDetail;
  if (expectedMessageId !== undefined && writeDone.message_id !== expectedMessageId) {
    return false;
  }
  if (expectedAction && writeDone.actions?.[expectedAction] !== true) {
    return false;
  }
  return true;
}

export function createEraWriteDoneWaiter({
  timeoutMs,
  timeoutMessage,
  expectedMessageId,
  expectedAction,
}: Required<Pick<EraWaitOptions, 'timeoutMs' | 'timeoutMessage'>> &
  Pick<EraWaitOptions, 'expectedMessageId' | 'expectedAction'>): EraWriteDoneWaiter {
  let finish = (_error?: Error) => {};

  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let listener: { stop: () => void } | null = null;

    finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (listener) {
        listener.stop();
      }
      timer.cancel();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timer = scheduleUnthrottledTimeout(() => {
      finish(new Error(timeoutMessage));
    }, timeoutMs);

    listener = eventOn('era:writeDone', (writeDoneDetail: unknown) => {
      if (!matchesEraWriteDone(writeDoneDetail, expectedMessageId, expectedAction)) {
        return;
      }
      finish();
    });
  });

  return { promise, finish };
}

export function waitForEraWriteDone({
  timeoutMs = 10000,
  timeoutMessage,
  expectedMessageId,
  expectedAction,
}: Omit<EraWaitOptions, 'detail'>): Promise<void> {
  return createEraWriteDoneWaiter({
    timeoutMs,
    timeoutMessage,
    expectedMessageId,
    expectedAction,
  }).promise;
}

export function observeEraWriteDone({
  expectedAction,
  maxBuffered = 8,
}: {
  expectedAction: string;
  maxBuffered?: number;
}): EraWriteDoneObserver {
  const buffered = new Map<number, EraWriteDoneDetail>();
  let stopped = false;
  let pending:
    | {
        messageId: number;
        resolve: (detail: EraWriteDoneDetail) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof scheduleUnthrottledTimeout>;
      }
    | undefined;

  const stopListener = eventOn('era:writeDone', (detail: unknown) => {
    if (
      stopped
      || !detail
      || typeof detail !== 'object'
      || Array.isArray(detail)
    ) {
      return;
    }

    const writeDone = detail as EraWriteDoneDetail;
    if (!Number.isInteger(writeDone.message_id) || writeDone.actions?.[expectedAction] !== true) {
      return;
    }

    const messageId = Number(writeDone.message_id);
    if (pending?.messageId === messageId) {
      const current = pending;
      pending = undefined;
      current.timer.cancel();
      current.resolve(writeDone);
      return;
    }

    buffered.delete(messageId);
    buffered.set(messageId, writeDone);
    while (buffered.size > Math.max(1, maxBuffered)) {
      const oldestMessageId = buffered.keys().next().value;
      if (oldestMessageId === undefined) break;
      buffered.delete(oldestMessageId);
    }
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    stopListener.stop();
    buffered.clear();
    if (pending) {
      const current = pending;
      pending = undefined;
      current.timer.cancel();
      current.reject(new Error('ERA 写入观察已停止。'));
    }
  };

  return {
    waitForMessageId(messageId, { timeoutMs = 20000, timeoutMessage }) {
      if (stopped) {
        return Promise.reject(new Error('ERA 写入观察已停止。'));
      }
      if (!Number.isInteger(messageId)) {
        return Promise.reject(new Error(`无效的 assistant message_id：${String(messageId)}`));
      }
      if (pending) {
        return Promise.reject(new Error('同一个 ERA 写入观察器不能同时等待多个 assistant 楼层。'));
      }

      const bufferedDetail = buffered.get(messageId);
      if (bufferedDetail) {
        buffered.delete(messageId);
        return Promise.resolve(bufferedDetail);
      }

      return new Promise<EraWriteDoneDetail>((resolve, reject) => {
        const timer = scheduleUnthrottledTimeout(() => {
          if (pending?.messageId !== messageId) return;
          pending = undefined;
          reject(new Error(timeoutMessage));
        }, timeoutMs);
        pending = { messageId, resolve, reject, timer };
      });
    },
    stop,
  };
}

export async function emitEraEventAndWait(
  eventName: string,
  { timeoutMs = 10000, timeoutMessage, expectedMessageId, expectedAction, detail }: EraWaitOptions,
): Promise<void> {
  const waiter = createEraWriteDoneWaiter({
    timeoutMs,
    timeoutMessage,
    expectedMessageId,
    expectedAction,
  });

  try {
    await (detail === undefined ? eventEmit(eventName) : eventEmit(eventName, detail));
  } catch (error) {
    waiter.finish(error instanceof Error ? error : new Error(String(error)));
  }

  await waiter.promise;
}
