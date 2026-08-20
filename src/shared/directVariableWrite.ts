import { variableTraceLogger } from '../武侠/utils/logger';
import { recordIframeLifecycleEvent } from '../武侠/utils/iframeLifecycleBlackBox';
import { isChatRenamePending } from './chatRenameJournal';
import { isHistoryCheckoutPending } from './historyCheckoutJournal';
import { scheduleUnthrottledTimeout, type UnthrottledTimerHandle } from './unthrottledTimer';

export const DIRECT_VARIABLE_WRITE_DONE_EVENT = 'wuxia:directVariableWriteDone';
export const ERA_VARIABLE_WRITE_DONE_EVENT = 'wuxia:eraVariableWriteDone';

export type DirectVariableWriteSource = 'event-script' | 'variable-editor' | 'frontend' | 'restore';
export type DirectVariableWriteOperation = 'insert' | 'update' | 'delete' | 'assign' | 'replace';
export type DirectVariableWriteRefreshHint = 'none' | 'event-state' | 'character-data' | 'full';
export type EraVariableWriteAttribution = 'ai' | 'background';
export type EraVariableWriteEventName =
  | 'era:apiWrite'
  | 'era:updateByObject'
  | 'era:insertByObject'
  | 'era:deleteByObject'
  | 'era:deleteByPath'
  | 'manual_sync';

export interface DirectVariableWriteMetadata {
  source: DirectVariableWriteSource;
  operation: DirectVariableWriteOperation;
  reason: string;
  /** 缺省为 full，旧调用不需要升级即可保持原有补全行为。 */
  refreshHint?: DirectVariableWriteRefreshHint;
}

export interface DirectVariableWriteDoneDetail extends DirectVariableWriteMetadata {
  version: 1;
  writeId: string;
}

export interface EraVariableWriteMetadata extends DirectVariableWriteMetadata {
  eventName: EraVariableWriteEventName;
  attribution?: EraVariableWriteAttribution;
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

type EraWriteDispatchFailure = {
  error: unknown;
  observedAt: number;
};

export interface DirectChatTransactionOptions {
  source?: DirectVariableWriteSource;
  operation?: DirectVariableWriteOperation;
  refreshHint?: DirectVariableWriteRefreshHint;
}

function assertFrontendWriteAllowed(source: DirectVariableWriteSource): void {
  // 酒馆改名会在下一步换掉 iframe / 聊天身份。用户从变量编辑器发起的直接写入和前端派生写入
  // 都不能落到旧聊天；事件脚本与恢复链由宿主换代自行中止，不在这里伪造失败。
  if (isChatRenamePending() && source !== 'event-script' && source !== 'restore') {
    throw new Error(
      source === 'frontend' ? '聊天存档改名期间已暂停前端派生变量写入。' : '聊天存档改名期间已暂停直接变量写入。',
    );
  }
  if (source !== 'frontend') return;
  if (isHistoryCheckoutPending()) {
    throw new Error('历史分叉同步期间已暂停前端派生变量写入。');
  }
}

export type DirectChatVariableUpdater = (variables: Record<string, unknown>) => Record<string, unknown>;

const normalizeRefreshHint = (
  refreshHint: DirectVariableWriteRefreshHint | undefined,
): DirectVariableWriteRefreshHint => refreshHint ?? 'full';

export type EraVariableWriteConfirmation = {
  message_id?: number | null;
  actions?: Record<string, unknown>;
};

type EraWriteDoneLikeDetail = EraVariableWriteConfirmation;

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
  assertFrontendWriteAllowed(metadata.source);
  const result = await writer();
  const eventDetail: DirectVariableWriteDoneDetail = {
    version: 1,
    writeId: createVariableWriteId(),
    source: metadata.source,
    operation: metadata.operation,
    reason: metadata.reason,
    refreshHint: normalizeRefreshHint(metadata.refreshHint),
  };

  variableTraceLogger.log('[runDirectChatVariableWrite] 直接变量写入已完成，准备发送来源事件', eventDetail);
  await eventEmit(DIRECT_VARIABLE_WRITE_DONE_EVENT, eventDetail);

  return result;
}

/**
 * 在同一个 updateVariablesWith 回调中执行一组变量变更，并只发出一次直接写入完成事件。
 *
 * 与 writeDirectChatVariables 不同，此入口不先读取当前变量；调用方可以在 updater 内
 * 基于酒馆传入的同一份 variables 快照完成规划和提交，避免多次 getVariables/updateVariablesWith
 * 之间出现竞态。updater 必须返回要写回的完整变量对象。
 */
export async function writeDirectChatTransaction(
  updater: DirectChatVariableUpdater,
  reason = 'direct-chat-transaction',
  options: DirectChatTransactionOptions = {},
): Promise<Record<string, unknown>> {
  return runDirectChatVariableWrite(
    {
      source: options.source ?? 'event-script',
      operation: options.operation ?? 'replace',
      reason,
      refreshHint: options.refreshHint,
    },
    () => updateVariablesWith(updater, { type: 'chat' }) as Record<string, unknown>,
  );
}

/**
 * 注册完成监听器后再发出 ERA 事件，并等待与 message/action 匹配的 writeDone。
 *
 * 该底层入口只等待原始 era:writeDone，不会再发送 sourced 完成事件。事件脚本的
 * writeEraCommand 应使用此入口，避免 raw + sourced 两个事件让前端执行两次全量扫描。
 */
export async function emitEraVariableWriteAndWait({
  source,
  operation,
  reason,
  eventName,
  attribution = 'background',
  detail,
  timeoutMs = 10000,
  timeoutMessage = `ERA ${eventName} 写入完成信号超时`,
  expectedMessageId,
  expectedAction,
}: EraVariableWriteRequest): Promise<EraVariableWriteConfirmation> {
  assertFrontendWriteAllowed(source);
  const waitId = createVariableWriteId();
  const startedAt = Date.now();
  let timer: UnthrottledTimerHandle | null = null;
  let listener: { stop: () => void } | null = null;
  let observedWriteDoneCount = 0;
  let lastObservedWriteDone: EraWriteDoneSummary | { invalidDetail: true; detailType: string } | null = null;
  let lastIgnoredReason: string | null = null;
  let dispatchFailure: EraWriteDispatchFailure | null = null;
  const waitContext = {
    waitId,
    source,
    operation,
    reason,
    eventName,
    attribution,
    expectedMessageId: expectedMessageId ?? null,
    expectedAction: expectedAction ?? null,
    timeoutMs,
  };
  const recordWaitEvent = (event: string, details: Record<string, unknown> = {}) => {
    recordIframeLifecycleEvent('era-write-wait', event, {
      ...waitContext,
      elapsedMs: Date.now() - startedAt,
      ...details,
    });
  };
  const stopListener = (reasonText: string) => {
    if (!listener) {
      return;
    }
    variableTraceLogger.log('[emitEraVariableWriteAndWait] 停止等待监听器', {
      ...waitContext,
      reason: reasonText,
      observedWriteDoneCount,
    });
    listener.stop();
    listener = null;
  };

  const waitForWriteDone = new Promise<EraVariableWriteConfirmation>((resolve, reject) => {
    const timeoutScheduledAt = Date.now();
    timer = scheduleUnthrottledTimeout(() => {
      stopListener('timeout');
      recordWaitEvent('era-write-wait-timeout', {
        timerLagMs: Date.now() - timeoutScheduledAt - timeoutMs,
        timerSource: timer?.source ?? null,
        observedWriteDoneCount,
        lastObservedWriteDone,
        lastIgnoredReason,
        dispatchFailureAt: dispatchFailure?.observedAt ?? null,
      });
      variableTraceLogger.error('[emitEraVariableWriteAndWait] 等待 era:writeDone 超时', {
        ...waitContext,
        observedWriteDoneCount,
        lastObservedWriteDone,
        lastIgnoredReason,
        dispatchFailure: dispatchFailure
          ? {
              observedAt: dispatchFailure.observedAt,
              error: dispatchFailure.error,
            }
          : null,
      });
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    variableTraceLogger.log('[emitEraVariableWriteAndWait] 已注册 era:writeDone 等待监听器', waitContext);
    recordWaitEvent('era-write-wait-registered', {
      timeoutScheduledAt,
      timeoutExpectedAt: timeoutScheduledAt + timeoutMs,
      timerSource: timer.source,
    });
    listener = eventOn('era:writeDone', (writeDoneDetail: unknown) => {
      observedWriteDoneCount += 1;
      lastObservedWriteDone = summarizeEraWriteDone(writeDoneDetail);
      lastIgnoredReason = getWriteDoneMismatchReason(writeDoneDetail, expectedMessageId, expectedAction);
      recordWaitEvent('era-write-done-observed', {
        observedWriteDoneCount,
        matched: lastIgnoredReason === null,
        ignoredReason: lastIgnoredReason,
        observed: lastObservedWriteDone,
      });
      if (!matchesEraWriteDone(writeDoneDetail, expectedMessageId, expectedAction)) {
        variableTraceLogger.log('[emitEraVariableWriteAndWait] 忽略不匹配的 era:writeDone', {
          ...waitContext,
          observedWriteDoneCount,
          lastIgnoredReason,
          observed: lastObservedWriteDone,
        });
        return;
      }

      variableTraceLogger.log('[emitEraVariableWriteAndWait] 匹配到目标 era:writeDone', {
        ...waitContext,
        observedWriteDoneCount,
        matched: lastObservedWriteDone,
      });
      stopListener('matched');
      if (timer) {
        timer.cancel();
      }
      recordWaitEvent('era-write-done-matched', {
        observedWriteDoneCount,
        matched: lastObservedWriteDone,
      });
      resolve(writeDoneDetail);
    });
  });

  variableTraceLogger.log('[emitEraVariableWriteAndWait] 开始发送事件并等待原始 era:writeDone', waitContext);
  const dispatchStartedAt = Date.now();
  recordWaitEvent('era-write-dispatch-started');
  try {
    const dispatch = detail === undefined ? eventEmit(eventName) : eventEmit(eventName, detail);
    void dispatch.then(
      () => {
        recordWaitEvent('era-write-dispatch-settled', {
          dispatchDurationMs: Date.now() - dispatchStartedAt,
        });
        variableTraceLogger.log('[emitEraVariableWriteAndWait] 事件监听链已结束', waitContext);
      },
      error => {
        // eventEmit 会等待该事件的所有异步监听器。原始 ERA 已经写入时，后续监听器失败
        // 或耗时不能反向否定本次写入；保留错误，供 writeDone 超时日志关联诊断。
        dispatchFailure = { error, observedAt: Date.now() };
        recordWaitEvent('era-write-dispatch-failed', {
          dispatchDurationMs: Date.now() - dispatchStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        variableTraceLogger.error('[emitEraVariableWriteAndWait] 事件监听链异常，继续等待原始 era:writeDone', {
          ...waitContext,
          error,
        });
      },
    );
  } catch (error) {
    // 同步抛错同样只记录。若 ERA 处理器已经开始工作，仍应以匹配的 raw writeDone 为准。
    dispatchFailure = { error, observedAt: Date.now() };
    recordWaitEvent('era-write-dispatch-threw', {
      dispatchDurationMs: Date.now() - dispatchStartedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    variableTraceLogger.error('[emitEraVariableWriteAndWait] 发送事件时同步异常，继续等待原始 era:writeDone', {
      ...waitContext,
      error,
    });
  }

  return waitForWriteDone;
}

/**
 * ERA 写入等待器的带来源包装。需要让 UI/追踪器知道写入来源时使用此入口；它复用
 * emitEraVariableWriteAndWait 的先监听后 emit 及精确匹配逻辑。
 */
export async function emitSourcedEraVariableWriteAndWait(
  request: EraVariableWriteRequest,
): Promise<EraVariableWriteDoneDetail> {
  const { source, operation, reason, eventName, attribution = 'background', refreshHint } = request;
  const matchedDetail = await emitEraVariableWriteAndWait(request);

  const eventDetail: EraVariableWriteDoneDetail = {
    version: 1,
    writeId: createVariableWriteId(),
    source,
    operation,
    reason,
    eventName,
    attribution,
    refreshHint: normalizeRefreshHint(refreshHint),
    message_id: normalizeMessageId(matchedDetail?.message_id),
    actions: normalizeActions(matchedDetail?.actions),
  };

  try {
    const notification = eventEmit(ERA_VARIABLE_WRITE_DONE_EVENT, eventDetail);
    void notification.then(
      () =>
        variableTraceLogger.log('[emitSourcedEraVariableWriteAndWait] 带来源 ERA 完成通知监听链已结束', eventDetail),
      error =>
        variableTraceLogger.error('[emitSourcedEraVariableWriteAndWait] 带来源 ERA 完成通知监听链异常', {
          ...eventDetail,
          error,
        }),
    );
  } catch (error) {
    variableTraceLogger.error('[emitSourcedEraVariableWriteAndWait] 发送带来源 ERA 完成通知时同步异常', {
      ...eventDetail,
      error,
    });
  }

  return eventDetail;
}
