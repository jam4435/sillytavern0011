import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DirectVariableWriteDoneDetail,
  DirectVariableWriteSource,
  EraVariableWriteDoneDetail,
} from '../../shared/directVariableWrite';
import {
  buildAiComparisons,
  collectVariableTopLevelGroups,
  createBucketedObservedVariableChanges,
  createEmptyVariableChangeSummary,
  createObservedVariableChanges,
  formatVariablePreview,
  getVariableCopyPath,
  getVariableDisplayPath,
  MAX_STORED_VARIABLE_CHANGES,
  parseDeclaredVariableChanges,
  readCurrentStatDataSnapshot,
  stableStringify,
  type ParsedDeclaredVariableChanges,
  type VariableActualChange,
  type VariableChangeAction,
  type VariableChangeOrigin,
  type VariableChangeProducer,
  type VariableChangeSummary,
  type VariableDeclaredChange,
  type VariablePath,
  type VariableWriteActions,
} from '../utils/variableChanges';
import { variableTraceLogger } from '../utils/logger';
import type { SummaryVariableUpdateMode } from '../utils/settingsManager';

type ActiveVariableTurn = {
  turnId: number;
  /** 本轮开始时冻结的变量更新模式；不能在 settle 时重新读取设置页。 */
  variableUpdateMode: SummaryVariableUpdateMode;
  baselineStatData: Record<string, unknown> | null;
  /** AI 变量写入真实完成后的观测快照，仅用于最终楼层 fallback，不等同于 AI 声明值。 */
  aiCheckpointStatData: Record<string, unknown> | null;
  /**
   * 最近一次已观测到的 stat_data，仅用于刷新当前摘要与异常 fallback。
   * source 归因改由每个 writer 事件自带的 changes 决定，不再依赖这个共享区间。
   */
  lastObservedStatData: Record<string, unknown> | null;
  userMessageId?: number;
  assistantMessageId?: number;
  assistantDeclaredReply: string;
  extraDeclaredBlocks: string;
  batchSequence: number;
  settled: boolean;
};

type ChatMessageWithSwipes = {
  message_id?: number;
  role?: string;
  message?: string;
  mes?: string;
  swipes?: string[];
  swipe_id?: number;
};

type StoredVariableTurn = {
  version: 17;
  chatId: string;
  savedAt: number;
  activeTurn: ActiveVariableTurn;
  summary: VariableChangeSummary;
};

type BackgroundWriteMetadata = {
  producer: VariableChangeProducer;
  reason: string;
  actions?: VariableWriteActions | null;
  assistantMessageId?: number;
  /** 新 sourced event 直接携带本次 writer 自己的实际 diff；缺失时才兼容旧快照推断。 */
  changes?: DirectVariableWriteDoneDetail['changes'];
};

const STORAGE_KEY = 'wuxia.variableChangeTurn.v17';
const LEGACY_STORAGE_KEYS = Array.from({ length: 16 }, (_, index) => `wuxia.variableChangeTurn.v${index + 1}`);
const STORED_TURN_TTL_MS = 30 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeMessageId = (value: unknown): number | undefined =>
  Number.isInteger(value) ? Number(value) : undefined;

const isDirectVariableWriteSource = (value: unknown): value is DirectVariableWriteSource =>
  value === 'event-script'
  || value === 'variable-editor'
  || value === 'frontend'
  || value === 'restore';

const normalizeWriteActions = (actions: unknown): VariableWriteActions | null => {
  if (!isRecord(actions)) return null;
  const entries = Object.entries(actions)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => [key, true] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const getCurrentChatStorageId = (): string => {
  try {
    const currentWindow = globalThis as typeof globalThis & {
      SillyTavern?: { getCurrentChatId?: () => string | number | null | undefined };
    };
    const parentWindow = typeof window !== 'undefined'
      ? window.parent as Window & typeof globalThis & {
        SillyTavern?: { getCurrentChatId?: () => string | number | null | undefined };
      }
      : undefined;
    const chatId = currentWindow.SillyTavern?.getCurrentChatId?.()
      ?? parentWindow?.SillyTavern?.getCurrentChatId?.();
    return chatId === null || chatId === undefined ? 'unknown' : String(chatId);
  } catch {
    return 'unknown';
  }
};

const readStoredVariableTurn = (): StoredVariableTurn | null => {
  if (typeof window === 'undefined') return null;
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      window.sessionStorage.removeItem(key);
    }
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredVariableTurn;
    const currentChatId = getCurrentChatStorageId();
    const expired = Date.now() - Number(stored.savedAt || 0) > STORED_TURN_TTL_MS;
    const differentChat =
      stored.chatId !== 'unknown'
      && currentChatId !== 'unknown'
      && stored.chatId !== currentChatId;
    if (stored.version !== 17 || expired || differentChat) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

const persistVariableTurn = (
  activeTurn: ActiveVariableTurn | null,
  summary: VariableChangeSummary | null,
): void => {
  if (typeof window === 'undefined') return;
  if (!activeTurn || !summary) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  try {
    const stored: StoredVariableTurn = {
      version: 17,
      chatId: getCurrentChatStorageId(),
      savedAt: Date.now(),
      activeTurn,
      summary,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
};

const getActiveMessageContent = (message: ChatMessageWithSwipes): string => {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length > 0) {
    const requested = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
    const safeIndex = Math.max(0, Math.min(requested, swipes.length - 1));
    return swipes[safeIndex] ?? '';
  }
  return message.message || message.mes || '';
};

const readAssistantMessageContentById = (messageId: number): { messageId?: number; content: string } => {
  try {
    const messages = getChatMessages(messageId, {
      role: 'assistant',
      hide_state: 'all',
      include_swipes: true,
    }) as ChatMessageWithSwipes[];
    return {
      messageId,
      content: messages[0] ? getActiveMessageContent(messages[0]) : '',
    };
  } catch {
    return { messageId, content: '' };
  }
};

const readLatestAssistantMessageContent = (): { messageId?: number; content: string } => {
  try {
    const messages = getChatMessages('0-{{lastMessageId}}', {
      role: 'assistant',
      hide_state: 'all',
      include_swipes: true,
    }) as ChatMessageWithSwipes[];

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const content = getActiveMessageContent(message);
      if (!content.trim()) continue;
      return {
        messageId: normalizeMessageId(message.message_id),
        content,
      };
    }
  } catch {
    // 最终楼层回读是兜底；失败时仍可用当前已登记的 AI 声明和 stat_data。
  }
  return { content: '' };
};

const getPathKey = (path: VariablePath): string => JSON.stringify(path);

const getValueAtPath = (source: unknown, path: VariablePath): unknown => {
  let current: unknown = source;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[String(segment)];
  }
  return current;
};

const valuesEqual = (left: unknown, right: unknown): boolean =>
  stableStringify(left) === stableStringify(right);

const resolveObservedAction = (beforeValue: unknown, afterValue: unknown): VariableChangeAction => {
  if (beforeValue === undefined) return 'insert';
  if (afterValue === undefined) return 'delete';
  return 'edit';
};

const makeObservedChange = ({
  path,
  beforeValue,
  afterValue,
  origin,
  producer,
  timestamp,
  batchId,
  reason,
  actions = null,
  assistantMessageId,
  index,
}: {
  path: VariablePath;
  beforeValue: unknown;
  afterValue: unknown;
  origin: VariableChangeOrigin;
  producer: VariableChangeProducer;
  timestamp: number;
  batchId: string;
  reason: string | null;
  actions?: VariableWriteActions | null;
  assistantMessageId?: number;
  index: number;
}): VariableActualChange => ({
  id: `observed-diff:${origin}:${batchId}:${getPathKey(path)}:${index}`,
  source: 'observed-diff',
  origin,
  producer,
  action: resolveObservedAction(beforeValue, afterValue),
  path,
  displayPath: getVariableDisplayPath(path),
  copyPath: getVariableCopyPath(path),
  beforeValue,
  afterValue,
  beforePreview: formatVariablePreview(beforeValue),
  afterPreview: formatVariablePreview(afterValue),
  timestamp,
  batchId,
  actions,
  reason,
  assistantMessageId,
});

const appendLimited = <T,>(existing: T[], additions: T[]): { values: T[]; omitted: number } => {
  const available = Math.max(0, MAX_STORED_VARIABLE_CHANGES - existing.length);
  return {
    values: [...existing, ...additions.slice(0, available)],
    omitted: Math.max(0, additions.length - available),
  };
};

const parseAiDeclaredState = (activeTurn: ActiveVariableTurn): ParsedDeclaredVariableChanges => {
  // AI 身份只由“本轮冻结的变量模式”决定，不能用 extra 是否返回非空块来反推模式。
  // extra 合法返回 0 个动作时，AI 声明就是空集合；正文中的意外变量块仍属于最终楼层剩余块。
  if (activeTurn.variableUpdateMode === 'extra') {
    return parseDeclaredVariableChanges(activeTurn.extraDeclaredBlocks);
  }
  return parseDeclaredVariableChanges(activeTurn.assistantDeclaredReply);
};

const declaredSignature = (change: VariableDeclaredChange): string =>
  stableStringify({
    action: change.action,
    path: change.path,
    value: change.action === 'delete' ? undefined : change.value,
  });

const subtractAiDeclarations = (
  finalDeclarations: VariableDeclaredChange[],
  aiDeclarations: VariableDeclaredChange[],
): VariableDeclaredChange[] => {
  const aiCounts = new Map<string, number>();
  for (const change of aiDeclarations) {
    const signature = declaredSignature(change);
    aiCounts.set(signature, (aiCounts.get(signature) ?? 0) + 1);
  }

  const background: VariableDeclaredChange[] = [];
  for (const change of finalDeclarations) {
    const signature = declaredSignature(change);
    const remaining = aiCounts.get(signature) ?? 0;
    if (remaining > 0) {
      aiCounts.set(signature, remaining - 1);
      continue;
    }
    background.push(change);
  }
  return background;
};

const combineObservedChanges = (summary: VariableChangeSummary): VariableActualChange[] =>
  [...summary.aiReply.observedChanges, ...summary.background.observedChanges]
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));

const buildSummary = (
  summary: VariableChangeSummary,
  activeTurn: ActiveVariableTurn,
  currentStatData: Record<string, unknown> | null,
  status = summary.status,
): VariableChangeSummary => {
  const parsedAi = parseAiDeclaredState(activeTurn);
  const aiPathKeys = new Set(parsedAi.declaredChanges.map(change => getPathKey(change.path)));
  const bucketedFinalDiff = createBucketedObservedVariableChanges(
    activeTurn.baselineStatData,
    currentStatData,
    {
      origin: 'ai',
      producer: 'era',
      timestamp: Date.now(),
      batchId: `${activeTurn.turnId}:ai-final`,
      reason: 'ai-final-snapshot',
      assistantMessageId: activeTurn.assistantMessageId,
    },
    candidate => aiPathKeys.has(getPathKey(candidate.path)) ? 'ai' : 'background',
  );
  const aiObserved = bucketedFinalDiff.ai.observedChanges.map((change, index) => ({
    ...change,
    id: `ai-final:${activeTurn.turnId}:${getPathKey(change.path)}:${index}`,
    origin: 'ai' as const,
    producer: 'era' as const,
    batchId: `${activeTurn.turnId}:ai-final`,
    reason: 'ai-final-snapshot',
    assistantMessageId: activeTurn.assistantMessageId,
  }));

  const comparisonResult = buildAiComparisons({
    declaredChanges: parsedAi.declaredChanges,
    observedChanges: aiObserved,
    baselineStatData: activeTurn.baselineStatData,
    currentStatData,
  });

  const next: VariableChangeSummary = {
    ...summary,
    status,
    userMessageId: activeTurn.userMessageId,
    assistantMessageId: activeTurn.assistantMessageId ?? summary.assistantMessageId,
    updatedAt: Date.now(),
    thoughts: parsedAi.thoughts,
    parseErrors: parsedAi.parseErrors,
    aiReply: {
      ...summary.aiReply,
      declaredChanges: parsedAi.declaredChanges,
      observedChanges: aiObserved,
      comparisons: comparisonResult.comparisons,
      omittedDeclaredCount: parsedAi.omittedDeclaredCount,
      omittedObservedCount: bucketedFinalDiff.ai.omittedObservedCount,
      omittedComparisonCount: comparisonResult.omittedComparisonCount,
    },
    declaredChanges: parsedAi.declaredChanges,
    omittedDeclaredCount: parsedAi.omittedDeclaredCount,
  };

  const allObserved = combineObservedChanges(next);
  next.actualChanges = allObserved;
  next.omittedActualCount = next.aiReply.omittedObservedCount + next.background.omittedObservedCount;
  next.topLevelGroups = collectVariableTopLevelGroups(parsedAi.declaredChanges, allObserved);
  return next;
};

export function useVariableChangeTracker() {
  const restoredTurnRef = useRef<StoredVariableTurn | null | undefined>(undefined);
  if (restoredTurnRef.current === undefined) {
    restoredTurnRef.current = readStoredVariableTurn();
  }

  const restored = restoredTurnRef.current;
  const [variableChanges, setVariableChanges] = useState<VariableChangeSummary | null>(
    () => restored?.summary ?? null,
  );
  const variableChangesRef = useRef<VariableChangeSummary | null>(restored?.summary ?? null);
  const activeTurnRef = useRef<ActiveVariableTurn | null>(restored?.activeTurn ?? null);
  const nextTurnIdRef = useRef(restored?.summary.turnId ?? 0);

  const commitSummary = useCallback((summary: VariableChangeSummary | null) => {
    variableChangesRef.current = summary;
    setVariableChanges(summary);
    persistVariableTurn(activeTurnRef.current, summary);
  }, []);

  const startTurn = useCallback((
    userMessageId?: number,
    variableUpdateMode: SummaryVariableUpdateMode = 'inline',
  ) => {
    const turnId = nextTurnIdRef.current + 1;
    nextTurnIdRef.current = turnId;
    const baselineStatData = readCurrentStatDataSnapshot();
    const activeTurn: ActiveVariableTurn = {
      turnId,
      variableUpdateMode,
      baselineStatData,
      aiCheckpointStatData: null,
      lastObservedStatData: baselineStatData,
      userMessageId,
      assistantDeclaredReply: '',
      extraDeclaredBlocks: '',
      batchSequence: 0,
      settled: false,
    };
    activeTurnRef.current = activeTurn;
    const summary = createEmptyVariableChangeSummary(
      turnId,
      baselineStatData ? 'tracking' : 'error',
    );
    variableTraceLogger.log('[useVariableChangeTracker] 开始回合：保存唯一 baseline', {
      turnId,
      userMessageId: userMessageId ?? null,
      variableUpdateMode,
      baselineReadable: Boolean(baselineStatData),
    });
    commitSummary(summary);
  }, [commitSummary]);

  const refreshCurrentSummary = useCallback((status?: VariableChangeSummary['status']) => {
    const activeTurn = activeTurnRef.current;
    const current = variableChangesRef.current;
    if (!activeTurn || !current) return;
    const currentStatData = activeTurn.lastObservedStatData ?? readCurrentStatDataSnapshot();
    commitSummary(buildSummary(current, activeTurn, currentStatData, status ?? current.status));
  }, [commitSummary]);

  const captureBackgroundWrite = useCallback((metadata: BackgroundWriteMetadata) => {
    const activeTurn = activeTurnRef.current;
    const current = variableChangesRef.current;
    if (!activeTurn || !current || activeTurn.settled) return;

    activeTurn.batchSequence += 1;
    const batchId = `${activeTurn.turnId}:background:${activeTurn.batchSequence}`;
    const timestamp = Date.now();
    const nextStatData = readCurrentStatDataSnapshot();

    let observedChanges: VariableActualChange[] = [];
    let omittedObservedCount = 0;
    let batch = null;

    if (Array.isArray(metadata.changes)) {
      // 主链：source event 直接携带“本次 writer 自己”的实际 diff。
      // 其他 writer 即使已改变全局 stat_data，也不会被错误吸收到当前 source。
      observedChanges = metadata.changes.slice(0, MAX_STORED_VARIABLE_CHANGES).map((change, index) =>
        makeObservedChange({
          path: change.path,
          beforeValue: change.beforeValue,
          afterValue: change.afterValue,
          origin: 'background',
          producer: metadata.producer,
          timestamp,
          batchId,
          actions: metadata.actions,
          reason: metadata.reason,
          assistantMessageId: metadata.assistantMessageId,
          index: index + 1,
        }),
      );
      omittedObservedCount = Math.max(0, metadata.changes.length - observedChanges.length);
    } else {
      // 仅兼容旧来源事件：没有 changes 字段时才退回共享快照区间推断。
      if (!nextStatData) {
        variableTraceLogger.error('[useVariableChangeTracker] 后台写入完成但 stat_data 不可读', metadata);
        commitSummary({ ...current, status: 'error', updatedAt: Date.now() });
        return;
      }
      const result = createObservedVariableChanges(
        activeTurn.lastObservedStatData ?? activeTurn.baselineStatData,
        nextStatData,
        {
          origin: 'background',
          producer: metadata.producer,
          timestamp,
          batchId,
          actions: metadata.actions,
          reason: metadata.reason,
          assistantMessageId: metadata.assistantMessageId,
        },
      );
      observedChanges = result.observedChanges;
      omittedObservedCount = result.omittedObservedCount;
      batch = result.batch;
    }

    if (nextStatData) {
      activeTurn.lastObservedStatData = nextStatData;
    }

    if (observedChanges.length === 0) {
      refreshCurrentSummary();
      return;
    }

    const backgroundAppend = appendLimited(current.background.observedChanges, observedChanges);
    const batches = batch ? [...current.batches, batch].slice(-MAX_STORED_VARIABLE_CHANGES) : current.batches;
    const summaryStatData = nextStatData ?? activeTurn.lastObservedStatData ?? activeTurn.baselineStatData;
    const nextSummary = buildSummary({
      ...current,
      background: {
        observedChanges: backgroundAppend.values,
        omittedObservedCount:
          current.background.omittedObservedCount
          + omittedObservedCount
          + backgroundAppend.omitted,
      },
      batches,
    }, activeTurn, summaryStatData);

    variableTraceLogger.log('[useVariableChangeTracker] 记录来源已知的后台实际修改', {
      turnId: activeTurn.turnId,
      producer: metadata.producer,
      reason: metadata.reason,
      writerOwnedDiff: Array.isArray(metadata.changes),
      changes: observedChanges.map(change => ({
        path: change.displayPath,
        before: change.beforePreview,
        after: change.afterPreview,
      })),
    });
    commitSummary(nextSummary);
  }, [commitSummary, refreshCurrentSummary]);

  const checkpointAiWrite = useCallback((assistantMessageId?: number) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn || activeTurn.settled) return;
    if (assistantMessageId !== undefined) activeTurn.assistantMessageId = assistantMessageId;
    const snapshot = readCurrentStatDataSnapshot();
    if (snapshot) {
      // 保存真实观测到的 AI 写入后状态，供异常楼层 fallback 使用；绝不拿 AI 声明值冒充实际 before。
      activeTurn.aiCheckpointStatData = snapshot;
      activeTurn.lastObservedStatData = snapshot;
    }
    refreshCurrentSummary('reply-recorded');
  }, [refreshCurrentSummary]);

  const settleTurn = useCallback((assistantMessageId?: number) => {
    const activeTurn = activeTurnRef.current;
    const current = variableChangesRef.current;
    if (!activeTurn || !current) return;

    if (assistantMessageId !== undefined) {
      activeTurn.assistantMessageId = assistantMessageId;
    }

    const finalMessage = activeTurn.assistantMessageId !== undefined
      ? readAssistantMessageContentById(activeTurn.assistantMessageId)
      : readLatestAssistantMessageContent();
    if (activeTurn.assistantMessageId === undefined && finalMessage.messageId !== undefined) {
      activeTurn.assistantMessageId = finalMessage.messageId;
    }

    const finalStatData = readCurrentStatDataSnapshot();
    if (!finalStatData) {
      commitSummary({ ...current, status: 'error', updatedAt: Date.now() });
      return;
    }

    const parsedAi = parseAiDeclaredState(activeTurn);
    const finalParsed = parseDeclaredVariableChanges(finalMessage.content);
    const backgroundBlockDeclarations = subtractAiDeclarations(
      finalParsed.declaredChanges,
      parsedAi.declaredChanges,
    );

    const overallFinalDiff = createObservedVariableChanges(
      activeTurn.baselineStatData,
      finalStatData,
      {
        origin: 'background',
        producer: 'message-boundary',
        timestamp: Date.now(),
        batchId: `${activeTurn.turnId}:final-diff`,
        reason: 'unattributed-final-diff',
        assistantMessageId: activeTurn.assistantMessageId,
      },
    );

    const backgroundChanges = [...current.background.observedChanges];

    // 最终楼层中排除 AI 变量模型返回块后剩余的变量块，按定义属于后台变量块。
    // 正常情况下它们已由统一来源事件记录；这里仅补齐未经过包装层的漏网写入。
    for (const declaration of backgroundBlockDeclarations) {
      const pathKey = getPathKey(declaration.path);
      const expectedValue = declaration.action === 'delete' ? undefined : declaration.value;
      const finalValue = getValueAtPath(finalStatData, declaration.path);
      const latestRecorded = [...backgroundChanges]
        .reverse()
        .find(change => getPathKey(change.path) === pathKey);
      if (latestRecorded && valuesEqual(latestRecorded.afterValue, expectedValue)) continue;
      if (!valuesEqual(finalValue, expectedValue)) continue;

      const beforeValue = latestRecorded
        ? latestRecorded.afterValue
        : getValueAtPath(
            activeTurn.aiCheckpointStatData ?? activeTurn.baselineStatData,
            declaration.path,
          );
      if (valuesEqual(beforeValue, finalValue)) continue;

      const batchId = `${activeTurn.turnId}:background-block-fallback`;
      backgroundChanges.push(makeObservedChange({
        path: declaration.path,
        beforeValue,
        afterValue: finalValue,
        origin: 'background',
        producer: 'unknown',
        timestamp: Date.now(),
        batchId,
        reason: 'assistant-background-block',
        assistantMessageId: activeTurn.assistantMessageId,
        index: backgroundChanges.length + 1,
      }));
    }

    // direct write / 外部脚本若没有经过包装层，也不能因为“没有变量块”而从变更条消失。
    // 只对最终仍存在、且既不是 AI 路径也没有已知后台记录的差分做兜底。
    const aiPathKeys = new Set(parsedAi.declaredChanges.map(change => getPathKey(change.path)));
    for (const change of overallFinalDiff.observedChanges) {
      const pathKey = getPathKey(change.path);
      if (aiPathKeys.has(pathKey)) continue;

      const latestRecorded = [...backgroundChanges]
        .reverse()
        .find(candidate => getPathKey(candidate.path) === pathKey);
      if (latestRecorded && valuesEqual(latestRecorded.afterValue, change.afterValue)) {
        continue;
      }

      const beforeValue = latestRecorded ? latestRecorded.afterValue : change.beforeValue;
      if (valuesEqual(beforeValue, change.afterValue)) continue;

      backgroundChanges.push(makeObservedChange({
        path: change.path,
        beforeValue,
        afterValue: change.afterValue,
        origin: 'background',
        producer: 'unknown',
        timestamp: Date.now(),
        batchId: `${activeTurn.turnId}:unattributed-final`,
        reason: 'unattributed-final-diff',
        assistantMessageId: activeTurn.assistantMessageId,
        index: backgroundChanges.length + 1,
      }));
    }

    const backgroundLimited = backgroundChanges.slice(0, MAX_STORED_VARIABLE_CHANGES);
    const omittedBackground = Math.max(0, backgroundChanges.length - backgroundLimited.length);
    activeTurn.lastObservedStatData = finalStatData;
    activeTurn.settled = true;

    const nextSummary = buildSummary({
      ...current,
      background: {
        observedChanges: backgroundLimited,
        omittedObservedCount: current.background.omittedObservedCount + omittedBackground,
      },
    }, activeTurn, finalStatData, 'settled');

    variableTraceLogger.log('[useVariableChangeTracker] 回合结算完成', {
      turnId: activeTurn.turnId,
      assistantMessageId: activeTurn.assistantMessageId ?? null,
      aiDeclaredCount: parsedAi.declaredChanges.length,
      finalVariableBlockCount: finalParsed.declaredChanges.length,
      backgroundBlockCount: backgroundBlockDeclarations.length,
      backgroundActualCount: nextSummary.background.observedChanges.length,
      aiComparisonStatuses: nextSummary.aiReply.comparisons.map(item => ({
        path: item.displayPath,
        status: item.status,
      })),
    });
    commitSummary(nextSummary);
  }, [commitSummary]);

  const handleVariableTurnStart = useCallback((variableUpdateMode: SummaryVariableUpdateMode = 'inline') => {
    startTurn(undefined, variableUpdateMode);
  }, [startTurn]);

  const handleGlobalMessageSent = useCallback((messageId: number) => {
    const normalized = normalizeMessageId(messageId);
    if (normalized === undefined) return;
    const activeTurn = activeTurnRef.current;
    if (activeTurn && activeTurn.userMessageId === undefined) {
      activeTurn.userMessageId = normalized;
      refreshCurrentSummary();
      return;
    }
    if (activeTurn?.userMessageId === normalized) return;
    startTurn(normalized, 'inline');
  }, [refreshCurrentSummary, startTurn]);

  const markVariableApiWriteAsAi = useCallback((assistantMessageId: number) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn || !Number.isInteger(assistantMessageId)) return;
    activeTurn.assistantMessageId = assistantMessageId;
    variableTraceLogger.log('[useVariableChangeTracker] 记录本轮 AI assistant 楼层', {
      turnId: activeTurn.turnId,
      assistantMessageId,
    });
    refreshCurrentSummary();
  }, [refreshCurrentSummary]);

  const handleVariableAssistantReply = useCallback((
    rawReply: string,
    assistantMessageId?: number,
  ) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) return;
    activeTurn.assistantDeclaredReply = rawReply;
    if (assistantMessageId !== undefined) {
      activeTurn.assistantMessageId = assistantMessageId;
    }
    variableTraceLogger.log('[useVariableChangeTracker] 登记正文模型变量块', {
      turnId: activeTurn.turnId,
      assistantMessageId: assistantMessageId ?? null,
      declarationCount: parseDeclaredVariableChanges(rawReply).declaredChanges.length,
    });

    // 带 assistant id 的回调发生在 inline ERA 写入确认之后，用它作为后台后续写入的起点。
    if (assistantMessageId !== undefined) {
      checkpointAiWrite(assistantMessageId);
    } else {
      refreshCurrentSummary('reply-recorded');
    }
  }, [checkpointAiWrite, refreshCurrentSummary]);

  const handleVariableExtraDeclaredBlocks = useCallback((
    blocksText: string,
    assistantMessageId?: number,
  ) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) return;
    activeTurn.extraDeclaredBlocks = blocksText;
    if (assistantMessageId !== undefined) activeTurn.assistantMessageId = assistantMessageId;
    variableTraceLogger.log('[useVariableChangeTracker] 登记额外变量模型变量块', {
      turnId: activeTurn.turnId,
      assistantMessageId: assistantMessageId ?? null,
      declarationCount: parseDeclaredVariableChanges(blocksText).declaredChanges.length,
    });
    refreshCurrentSummary('reply-recorded');
  }, [refreshCurrentSummary]);

  const handleVariableAssistantRevision = useCallback((
    rawReply: string,
    assistantMessageId?: number,
  ) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) return;
    activeTurn.assistantDeclaredReply = rawReply;
    activeTurn.extraDeclaredBlocks = '';
    activeTurn.variableUpdateMode = 'inline';
    if (assistantMessageId !== undefined) activeTurn.assistantMessageId = assistantMessageId;
    checkpointAiWrite(assistantMessageId);
    settleTurn(assistantMessageId);
  }, [checkpointAiWrite, settleTurn]);

  const handleVariableMessageBoundary = useCallback((
    messageId?: number,
    options?: { replaceAssistantReply?: boolean },
  ) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) return;
    const resolved = messageId !== undefined
      ? readAssistantMessageContentById(messageId)
      : readLatestAssistantMessageContent();
    if (resolved.messageId !== undefined) activeTurn.assistantMessageId = resolved.messageId;

    if (options?.replaceAssistantReply && resolved.content.trim()) {
      activeTurn.assistantDeclaredReply = resolved.content;
      activeTurn.extraDeclaredBlocks = '';
      activeTurn.variableUpdateMode = 'inline';
      checkpointAiWrite(resolved.messageId);
      settleTurn(resolved.messageId);
      return;
    }

    // 普通消息边界只刷新 UI/楼层身份，不再把无来源 diff 提前归为 background。
    refreshCurrentSummary();
  }, [checkpointAiWrite, refreshCurrentSummary, settleTurn]);

  const handleEraWriteDone = useCallback((unknownDetail?: unknown) => {
    // raw era:writeDone 只表示“ERA 做完了”，没有可靠业务来源。
    // tracker 故意不在这里读 diff；统一来源事件随后会携带 source/reason。
    variableTraceLogger.log('[useVariableChangeTracker] 忽略 raw era:writeDone 的归因', unknownDetail ?? null);
  }, []);

  const handleDirectVariableWriteDone = useCallback((unknownDetail?: unknown) => {
    const detail = isRecord(unknownDetail)
      ? unknownDetail as unknown as DirectVariableWriteDoneDetail
      : undefined;
    captureBackgroundWrite({
      producer: isDirectVariableWriteSource(detail?.source) ? detail.source : 'unknown',
      reason: typeof detail?.reason === 'string' && detail.reason.trim()
        ? detail.reason.trim()
        : 'direct-variable-write',
      actions: null,
      changes: Array.isArray(detail?.changes) ? detail.changes : undefined,
    });
  }, [captureBackgroundWrite]);

  const handleEraVariableWriteDone = useCallback((unknownDetail?: unknown) => {
    const detail = isRecord(unknownDetail)
      ? unknownDetail as unknown as EraVariableWriteDoneDetail
      : undefined;
    const assistantMessageId = normalizeMessageId(detail?.message_id);

    if (detail?.attribution === 'ai') {
      variableTraceLogger.log('[useVariableChangeTracker] AI ERA 写入完成：仅推进后台基准，不做来源猜测', {
        assistantMessageId: assistantMessageId ?? null,
        source: detail?.source ?? null,
        reason: detail?.reason ?? null,
      });
      checkpointAiWrite(assistantMessageId);
      return;
    }

    captureBackgroundWrite({
      producer: isDirectVariableWriteSource(detail?.source) ? detail.source : 'era',
      reason: typeof detail?.reason === 'string' && detail.reason.trim()
        ? detail.reason.trim()
        : 'era-variable-write',
      actions: normalizeWriteActions(detail?.actions),
      assistantMessageId,
      changes: Array.isArray(detail?.changes) ? detail.changes : undefined,
    });
  }, [captureBackgroundWrite, checkpointAiWrite]);

  const handleVariableTurnSettled = useCallback((assistantMessageId?: number) => {
    settleTurn(assistantMessageId);
  }, [settleTurn]);

  const clearVariableChanges = useCallback(() => {
    variableTraceLogger.log('[useVariableChangeTracker] 清空当前变量追踪回合');
    activeTurnRef.current = null;
    commitSummary(null);
  }, [commitSummary]);

  useEffect(() => {
    if (!restored || restored.activeTurn.settled) return;
    const timer = window.setTimeout(() => {
      refreshCurrentSummary();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [refreshCurrentSummary, restored]);

  return {
    variableChanges,
    handleVariableTurnStart,
    handleGlobalMessageSent,
    handleVariableAssistantReply,
    handleVariableAssistantRevision,
    handleVariableExtraDeclaredBlocks,
    handleVariableMessageBoundary,
    handleEraWriteDone,
    handleDirectVariableWriteDone,
    handleEraVariableWriteDone,
    handleVariableTurnSettled,
    markVariableApiWriteAsAi,
    clearVariableChanges,
  };
}

export type { VariableChangeSummary };
