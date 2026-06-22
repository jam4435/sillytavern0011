type EraWriteDoneDetail = {
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
      window.clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timer = window.setTimeout(() => {
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
