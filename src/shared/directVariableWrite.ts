import { variableTraceLogger } from '../武侠/utils/logger';
import {
  createVariableSnapshotDiff,
  readCurrentStatDataSnapshot,
  readStatDataSnapshotFromUnknown,
  type VariablePath,
  type VariableSnapshotDiffChange,
} from '../武侠/utils/variableChanges';
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
  | 'era:transactionByObject'
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
  /**
   * 本次 writer 自己实际产生的 stat_data 差异；空数组表示成功但没有状态变化。
   * 旧/通用 wrapper 若无法在事务边界内提供精确 diff，则省略该字段，让 tracker 走兼容 fallback。
   */
  changes?: VariableSnapshotDiffChange[];
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
  transactionId?: string;
  transactionIds?: string[];
  /** 本次 ERA 请求目标路径上的实际 stat_data 差异；已排除同一等待窗口里的无关并发写入。 */
  changes: VariableSnapshotDiffChange[];
}

export interface EraVariableWriteRequest extends EraVariableWriteMetadata {
  detail?: unknown;
  timeoutMs?: number;
  timeoutMessage: string;
  expectedMessageId?: number;
  expectedAction?: string;
  /** 精确匹配自己发起的批事务；同时兼容 writeDone.transactionId 与合并 flush 的 transactionIds。 */
  expectedTransactionId?: string;
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
  transactionId?: string;
  transactionIds?: string[];
};

type EraWriteDoneLikeDetail = EraVariableWriteConfirmation;

type EraWriteDoneSummary = {
  rawMessageId: unknown;
  normalizedMessageId?: number;
  actions: Record<string, boolean> | null;
  transactionId?: string;
  transactionIds: string[] | null;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeStatDataPath = (path: VariablePath): VariablePath =>
  path[0] === 'stat_data' ? path.slice(1) : path;

const collectEraPatchScopePaths = (
  value: unknown,
  path: VariablePath,
  result: VariablePath[],
): void => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      if (path.length > 0) result.push(normalizeStatDataPath(path));
      return;
    }
    value.forEach((child, index) => collectEraPatchScopePaths(child, [...path, index], result));
    return;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      if (path.length > 0) result.push(normalizeStatDataPath(path));
      return;
    }
    for (const [key, child] of entries) {
      collectEraPatchScopePaths(child, [...path, key], result);
    }
    return;
  }

  if (path.length > 0) result.push(normalizeStatDataPath(path));
};

const parseSimpleEraPath = (value: unknown): VariablePath | null => {
  if (Array.isArray(value) && value.every(segment => typeof segment === 'string' || typeof segment === 'number')) {
    return normalizeStatDataPath(value as VariablePath);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value
    .trim()
    .replace(/^stat_data\.?/, '')
    .replace(/\[["']([^"'\]]+)["']\]/g, '.$1')
    .replace(/\[(\d+)\]/g, '.$1');
  const segments = normalized
    .split('.')
    .map(segment => segment.trim())
    .filter(Boolean)
    .map(segment => (/^\d+$/.test(segment) ? Number(segment) : segment));
  return segments.length > 0 ? segments : null;
};

const getEraDiffScopePaths = (
  eventName: EraVariableWriteEventName,
  detail: unknown,
): VariablePath[] | null => {
  const result: VariablePath[] = [];

  if (eventName === 'era:transactionByObject' && isRecord(detail) && Array.isArray(detail.operations)) {
    for (const operation of detail.operations) {
      if (!isRecord(operation)) continue;
      collectEraPatchScopePaths(operation.payload, [], result);
    }
  } else if (
    eventName === 'era:updateByObject'
    || eventName === 'era:insertByObject'
    || eventName === 'era:deleteByObject'
  ) {
    collectEraPatchScopePaths(detail, [], result);
  } else if (eventName === 'era:deleteByPath') {
    if (isRecord(detail)) {
      const candidates = Array.isArray(detail.paths) ? detail.paths : [detail.path];
      for (const candidate of candidates) {
        const parsed = parseSimpleEraPath(candidate);
        if (parsed) result.push(parsed);
      }
    } else {
      const parsed = parseSimpleEraPath(detail);
      if (parsed) result.push(parsed);
    }
  }

  if (result.length === 0) return null;
  const seen = new Set<string>();
  return result.filter(path => {
    const key = JSON.stringify(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const pathsOverlap = (left: VariablePath, right: VariablePath): boolean => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const createEraScopedVariableSnapshotDiff = (
  eventName: EraVariableWriteEventName,
  detail: unknown,
  beforeStatData: Record<string, unknown> | null,
  afterStatData: Record<string, unknown> | null,
): VariableSnapshotDiffChange[] => {
  const allChanges = createVariableSnapshotDiff(beforeStatData, afterStatData);
  const scopePaths = getEraDiffScopePaths(eventName, detail);
  if (!scopePaths) return allChanges;
  return allChanges.filter(change => scopePaths.some(scopePath => pathsOverlap(change.path, scopePath)));
};

const normalizeTransactionId = (transactionId: unknown): string | undefined =>
  typeof transactionId === 'string' && transactionId.length > 0 ? transactionId : undefined;

const normalizeTransactionIds = (detail: EraWriteDoneLikeDetail): string[] | null => {
  const transactionIds = Array.isArray(detail.transactionIds)
    ? detail.transactionIds.flatMap(transactionId => {
        const normalized = normalizeTransactionId(transactionId);
        return normalized ? [normalized] : [];
      })
    : [];
  const transactionId = normalizeTransactionId(detail.transactionId);
  if (transactionId) transactionIds.push(transactionId);
  const uniqueIds = Array.from(new Set(transactionIds));
  return uniqueIds.length > 0 ? uniqueIds : null;
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
    transactionId: normalizeTransactionId(writeDone.transactionId),
    transactionIds: normalizeTransactionIds(writeDone),
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
  expectedTransactionId?: string,
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
  if (expectedTransactionId !== undefined) {
    const transactionIds = normalizeTransactionIds(writeDone);
    if (!transactionIds?.includes(expectedTransactionId)) {
      return `transactionId 不匹配: expected=${expectedTransactionId}, actual=${JSON.stringify(transactionIds)}`;
    }
  }
  return null;
};

const matchesEraWriteDone = (
  detail: unknown,
  expectedMessageId?: number,
  expectedAction?: string,
  expectedTransactionId?: string,
): detail is EraWriteDoneLikeDetail => {
  return getWriteDoneMismatchReason(detail, expectedMessageId, expectedAction, expectedTransactionId) === null;
};

export async function runDirectChatVariableWrite<TResult>(
  metadata: DirectVariableWriteMetadata,
  writer: () => TResult | Promise<TResult>,
  readOwnChanges?: () => VariableSnapshotDiffChange[],
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
    ...(readOwnChanges ? { changes: readOwnChanges() } : {}),
  };

  variableTraceLogger.log('[runDirectChatVariableWrite] 直接变量写入已完成，准备发送来源事件', eventDetail);
  try {
    await eventEmit(DIRECT_VARIABLE_WRITE_DONE_EVENT, eventDetail);
  } catch (error) {
    // 业务写入已经完成。来源通知属于观测元数据，监听器异常不能把成功写入反向变成失败。
    variableTraceLogger.error('[runDirectChatVariableWrite] 带来源完成事件监听链异常', {
      ...eventDetail,
      error,
    });
  }

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
  let ownChanges: VariableSnapshotDiffChange[] = [];
  return runDirectChatVariableWrite(
    {
      source: options.source ?? 'event-script',
      operation: options.operation ?? 'replace',
      reason,
      refreshHint: options.refreshHint,
    },
    () =>
      updateVariablesWith(
        variables => {
          // before 必须在 updater 运行前复制；大量现有 updater 会直接原地修改 variables。
          const beforeStatData = readStatDataSnapshotFromUnknown(variables);
          const nextVariables = updater(variables);
          const afterStatData = readStatDataSnapshotFromUnknown(nextVariables);
          ownChanges = createVariableSnapshotDiff(beforeStatData, afterStatData);
          return nextVariables;
        },
        { type: 'chat' },
      ) as Record<string, unknown>,
    () => ownChanges,
  );
}

export async function emitConfirmedEraVariableWriteDone({
  source,
  operation,
  reason,
  eventName,
  attribution = 'background',
  refreshHint,
  confirmation,
  detail,
  beforeStatData,
  afterStatData,
}: EraVariableWriteMetadata & {
  confirmation?: EraVariableWriteConfirmation | null;
  detail?: unknown;
  beforeStatData: Record<string, unknown> | null;
  afterStatData: Record<string, unknown> | null;
}): Promise<EraVariableWriteDoneDetail> {
  const eventDetail: EraVariableWriteDoneDetail = {
    version: 1,
    writeId: createVariableWriteId(),
    source,
    operation,
    reason,
    eventName,
    attribution,
    refreshHint: normalizeRefreshHint(refreshHint),
    message_id: normalizeMessageId(confirmation?.message_id),
    actions: normalizeActions(confirmation?.actions),
    transactionId: normalizeTransactionId(confirmation?.transactionId),
    transactionIds: confirmation ? normalizeTransactionIds(confirmation) ?? undefined : undefined,
    // ERA 等待窗口内可能同时发生 AI / 其他后台写入。只保留本次 ERA 请求声明要碰的路径，
    // 避免把并发的时间、人物经历等误归到当前 source。
    changes: createEraScopedVariableSnapshotDiff(eventName, detail, beforeStatData, afterStatData),
  };

  variableTraceLogger.log('[emitConfirmedEraVariableWriteDone] ERA 写入已确认，发送唯一带来源完成事件', eventDetail);
  try {
    await eventEmit(ERA_VARIABLE_WRITE_DONE_EVENT, eventDetail);
  } catch (error) {
    // 业务写入已经确认。来源通知失败只能影响观测，不能把真实写入反向判成失败。
    variableTraceLogger.error('[emitConfirmedEraVariableWriteDone] 带来源完成事件监听链异常', {
      ...eventDetail,
      error,
    });
  }
  return eventDetail;
}

/**
 * 注册完成监听器后再发出 ERA 事件，并等待与 message/action 匹配的 writeDone。
 *
 * 该底层入口等待原始 era:writeDone 后，统一发送一次带 source/reason 的项目完成事件。
 * 所有 ERA 调用方都应通过此入口声明来源，tracker 不再消费 raw writeDone 做业务归因。
 */
export async function emitEraVariableWriteAndWait({
  source,
  operation,
  reason,
  eventName,
  attribution = 'background',
  refreshHint,
  detail,
  timeoutMs = 10000,
  timeoutMessage = `ERA ${eventName} 写入完成信号超时`,
  expectedMessageId,
  expectedAction,
  expectedTransactionId,
}: EraVariableWriteRequest): Promise<EraVariableWriteDoneDetail> {
  assertFrontendWriteAllowed(source);
  // ERA 的真正修改发生在外部监听器中，因此在发出事件前建立本次 writer 的 before。
  const beforeStatData = readCurrentStatDataSnapshot();
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
    expectedTransactionId: expectedTransactionId ?? null,
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
      lastIgnoredReason = getWriteDoneMismatchReason(
        writeDoneDetail,
        expectedMessageId,
        expectedAction,
        expectedTransactionId,
      );
      recordWaitEvent('era-write-done-observed', {
        observedWriteDoneCount,
        matched: lastIgnoredReason === null,
        ignoredReason: lastIgnoredReason,
        observed: lastObservedWriteDone,
      });
      if (!matchesEraWriteDone(writeDoneDetail, expectedMessageId, expectedAction, expectedTransactionId)) {
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

  const matchedDetail = await waitForWriteDone;
  // 只在匹配到“自己”的 writeDone 后取 after；tracker 不再用共享全局区间猜 source。
  const afterStatData = readCurrentStatDataSnapshot();
  return emitConfirmedEraVariableWriteDone({
    source,
    operation,
    reason,
    eventName,
    attribution,
    refreshHint,
    confirmation: matchedDetail,
    detail,
    beforeStatData,
    afterStatData,
  });
}

/**
 * ERA 写入等待器的带来源包装。需要让 UI/追踪器知道写入来源时使用此入口；它复用
 * emitEraVariableWriteAndWait 的先监听后 emit 及精确匹配逻辑。
 */
export async function emitSourcedEraVariableWriteAndWait(
  request: EraVariableWriteRequest,
): Promise<EraVariableWriteDoneDetail> {
  // 兼容旧调用名。来源通知已经由底层统一入口发送，禁止再次补发，
  // 从而保证每次 ERA 写入只有一个带来源完成事件。
  return emitEraVariableWriteAndWait(request);
}
