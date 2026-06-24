export const DIRECT_VARIABLE_WRITE_DONE_EVENT = 'wuxia:directVariableWriteDone';
export const ERA_VARIABLE_WRITE_DONE_EVENT = 'wuxia:eraVariableWriteDone';

export type DirectVariableWriteSource = 'event-script' | 'variable-editor' | 'frontend' | 'restore';
export type DirectVariableWriteOperation = 'insert' | 'update' | 'delete' | 'assign' | 'replace';
export type EraVariableWriteEventName =
  | 'era:apiWrite'
  | 'era:updateByObject'
  | 'era:insertByObject'
  | 'era:deleteByPath'
  | 'manual_sync';

export interface DirectVariableWriteMetadata {
  source: DirectVariableWriteSource;
  operation: DirectVariableWriteOperation;
  reason: string;
}

export interface DirectVariableWriteDoneDetail extends DirectVariableWriteMetadata {
  version: 1;
  writeId: string;
}

export interface EraVariableWriteMetadata extends DirectVariableWriteMetadata {
  eventName: EraVariableWriteEventName;
}

export interface EraVariableWriteDoneDetail extends EraVariableWriteMetadata {
  version: 1;
  writeId: string;
  message_id?: number;
  actions: Record<string, boolean> | null;
}

export interface EraVariableWriteRequest extends EraVariableWriteMetadata {
  detail?: unknown;
  timeoutMs?: number;
  timeoutMessage: string;
  expectedMessageId?: number;
  expectedAction?: string;
}

type EraWriteDoneLikeDetail = {
  message_id?: number | null;
  actions?: Record<string, unknown>;
};

const createVariableWriteId = (): string => {
  try {
    if (typeof crypto?.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeMessageId = (messageId: unknown): number | undefined =>
  Number.isInteger(messageId) ? Number(messageId) : undefined;

const normalizeActions = (actions: unknown): Record<string, boolean> | null => {
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) {
    return null;
  }

  const enabledActions = Object.entries(actions)
    .filter(([, enabled]) => enabled === true)
    .sort(([left], [right]) => left.localeCompare(right));
  return enabledActions.length > 0 ? Object.fromEntries(enabledActions) : null;
};

const matchesEraWriteDone = (
  detail: unknown,
  expectedMessageId?: number,
  expectedAction?: string,
): detail is EraWriteDoneLikeDetail => {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return false;
  }

  const writeDone = detail as EraWriteDoneLikeDetail;
  if (expectedMessageId !== undefined && writeDone.message_id !== expectedMessageId) {
    return false;
  }
  if (expectedAction && writeDone.actions?.[expectedAction] !== true) {
    return false;
  }
  return true;
};

export async function runDirectChatVariableWrite<TResult>(
  metadata: DirectVariableWriteMetadata,
  writer: () => TResult | Promise<TResult>,
): Promise<TResult> {
  const result = await writer();
  const eventDetail: DirectVariableWriteDoneDetail = {
    version: 1,
    writeId: createVariableWriteId(),
    source: metadata.source,
    operation: metadata.operation,
    reason: metadata.reason,
  };

  await eventEmit(DIRECT_VARIABLE_WRITE_DONE_EVENT, eventDetail);

  return result;
}

export async function emitSourcedEraVariableWriteAndWait({
  source,
  operation,
  reason,
  eventName,
  detail,
  timeoutMs = 10000,
  timeoutMessage,
  expectedMessageId,
  expectedAction,
}: EraVariableWriteRequest): Promise<EraVariableWriteDoneDetail> {
  let matchedDetail: EraWriteDoneLikeDetail | undefined;
  let timer: ReturnType<typeof window.setTimeout> | null = null;
  let listener: { stop: () => void } | null = null;
  const stopListener = () => {
    if (!listener) {
      return;
    }
    listener.stop();
    listener = null;
  };

  const waitForWriteDone = new Promise<void>((resolve, reject) => {
    timer = window.setTimeout(() => {
      stopListener();
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    listener = eventOn('era:writeDone', (writeDoneDetail: unknown) => {
      if (!matchesEraWriteDone(writeDoneDetail, expectedMessageId, expectedAction)) {
        return;
      }

      matchedDetail = writeDoneDetail;
      stopListener();
      if (timer) {
        window.clearTimeout(timer);
      }
      resolve();
    });
  });

  try {
    await (detail === undefined ? eventEmit(eventName) : eventEmit(eventName, detail));
  } catch (error) {
    stopListener();
    if (timer) {
      window.clearTimeout(timer);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  await waitForWriteDone;

  const eventDetail: EraVariableWriteDoneDetail = {
    version: 1,
    writeId: createVariableWriteId(),
    source,
    operation,
    reason,
    eventName,
    message_id: normalizeMessageId(matchedDetail?.message_id),
    actions: normalizeActions(matchedDetail?.actions),
  };

  await eventEmit(ERA_VARIABLE_WRITE_DONE_EVENT, eventDetail);

  return eventDetail;
}
