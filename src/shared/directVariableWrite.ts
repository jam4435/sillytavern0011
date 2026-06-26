import { variableTraceLogger } from '../武侠/utils/logger';

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

type EraWriteDoneSummary = {
  rawMessageId: unknown;
  normalizedMessageId?: number;
  actions: Record<string, boolean> | null;
  mk?: string;
  consecutiveProcessingCount?: number;
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

const summarizeEraWriteDone = (detail: unknown): EraWriteDoneSummary | { invalidDetail: true; detailType: string } => {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return {
      invalidDetail: true,
      detailType: Array.isArray(detail) ? 'array' : typeof detail,
    };
  }

  const writeDone = detail as EraWriteDoneLikeDetail & {
    mk?: unknown;
    consecutiveProcessingCount?: unknown;
  };
  return {
    rawMessageId: writeDone.message_id,
    normalizedMessageId: normalizeMessageId(writeDone.message_id),
    actions: normalizeActions(writeDone.actions),
    mk: typeof writeDone.mk === 'string' ? writeDone.mk : undefined,
    consecutiveProcessingCount: Number.isInteger(writeDone.consecutiveProcessingCount)
      ? Number(writeDone.consecutiveProcessingCount)
      : undefined,
  };
};

const getWriteDoneMismatchReason = (
  detail: unknown,
  expectedMessageId?: number,
  expectedAction?: string,
): string | null => {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return `payload 不是对象: ${Array.isArray(detail) ? 'array' : typeof detail}`;
  }

  const writeDone = detail as EraWriteDoneLikeDetail;
  if (expectedMessageId !== undefined && writeDone.message_id !== expectedMessageId) {
    return `message_id 不匹配: expected=${expectedMessageId}, actual=${String(writeDone.message_id)}`;
  }
  if (expectedAction && writeDone.actions?.[expectedAction] !== true) {
    return `actions.${expectedAction} !== true: actual=${JSON.stringify(normalizeActions(writeDone.actions))}`;
  }
  return null;
};

const matchesEraWriteDone = (
  detail: unknown,
  expectedMessageId?: number,
  expectedAction?: string,
): detail is EraWriteDoneLikeDetail => {
  return getWriteDoneMismatchReason(detail, expectedMessageId, expectedAction) === null;
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

  variableTraceLogger.log('[runDirectChatVariableWrite] 直接变量写入已完成，准备发送来源事件', eventDetail);
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
  const waitId = createVariableWriteId();
  let matchedDetail: EraWriteDoneLikeDetail | undefined;
  let timer: ReturnType<typeof window.setTimeout> | null = null;
  let listener: { stop: () => void } | null = null;
  let observedWriteDoneCount = 0;
  let lastObservedWriteDone: EraWriteDoneSummary | { invalidDetail: true; detailType: string } | null = null;
  let lastIgnoredReason: string | null = null;
  const waitContext = {
    waitId,
    source,
    operation,
    reason,
    eventName,
    expectedMessageId: expectedMessageId ?? null,
    expectedAction: expectedAction ?? null,
    timeoutMs,
  };
  const stopListener = (reasonText: string) => {
    if (!listener) {
      return;
    }
    variableTraceLogger.log('[emitSourcedEraVariableWriteAndWait] 停止等待监听器', {
      ...waitContext,
      reason: reasonText,
      observedWriteDoneCount,
    });
    listener.stop();
    listener = null;
  };

  const waitForWriteDone = new Promise<void>((resolve, reject) => {
    timer = window.setTimeout(() => {
      stopListener('timeout');
      variableTraceLogger.error('[emitSourcedEraVariableWriteAndWait] 等待 era:writeDone 超时', {
        ...waitContext,
        observedWriteDoneCount,
        lastObservedWriteDone,
        lastIgnoredReason,
      });
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    variableTraceLogger.log('[emitSourcedEraVariableWriteAndWait] 已注册 era:writeDone 等待监听器', waitContext);
    listener = eventOn('era:writeDone', (writeDoneDetail: unknown) => {
      observedWriteDoneCount += 1;
      lastObservedWriteDone = summarizeEraWriteDone(writeDoneDetail);
      lastIgnoredReason = getWriteDoneMismatchReason(writeDoneDetail, expectedMessageId, expectedAction);
      if (!matchesEraWriteDone(writeDoneDetail, expectedMessageId, expectedAction)) {
        variableTraceLogger.log('[emitSourcedEraVariableWriteAndWait] 忽略不匹配的 era:writeDone', {
          ...waitContext,
          observedWriteDoneCount,
          lastIgnoredReason,
          observed: lastObservedWriteDone,
        });
        return;
      }

      matchedDetail = writeDoneDetail;
      variableTraceLogger.log('[emitSourcedEraVariableWriteAndWait] 匹配到目标 era:writeDone', {
        ...waitContext,
        observedWriteDoneCount,
        matched: lastObservedWriteDone,
      });
      stopListener('matched');
      if (timer) {
        window.clearTimeout(timer);
      }
      resolve();
    });
  });

  try {
    variableTraceLogger.log('[emitSourcedEraVariableWriteAndWait] 开始发送事件并等待 era:writeDone', waitContext);
    await (detail === undefined ? eventEmit(eventName) : eventEmit(eventName, detail));
    variableTraceLogger.log('[emitSourcedEraVariableWriteAndWait] 事件已发出，开始等待匹配的 era:writeDone', waitContext);
  } catch (error) {
    stopListener('emit-failed');
    if (timer) {
      window.clearTimeout(timer);
    }
    variableTraceLogger.error('[emitSourcedEraVariableWriteAndWait] 发送事件失败', {
      ...waitContext,
      error,
    });
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
  variableTraceLogger.log('[emitSourcedEraVariableWriteAndWait] 已发送带来源的 ERA 完成事件', eventDetail);

  return eventDetail;
}
