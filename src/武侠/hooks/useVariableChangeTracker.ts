import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DirectVariableWriteDoneDetail,
  EraVariableWriteDoneDetail,
  DirectVariableWriteSource,
} from '../../shared/directVariableWrite';
import {
  buildAiComparisons,
  collectVariableTopLevelGroups,
  createBucketedObservedVariableChanges,
  createEmptyVariableChangeSummary,
  getSnapshotHash,
  MAX_STORED_VARIABLE_CHANGES,
  parseDeclaredVariableChanges,
  readCurrentStatDataSnapshot,
  stableStringify,
  type ObservedVariableChangeBucket,
  type VariableActualChange,
  type VariableDeclaredChange,
  type VariableChangeOrigin,
  type VariableChangeProducer,
  type VariableChangeSummary,
  type VariableObservedBatch,
  type VariableThoughtEntry,
  type VariableWriteActions,
} from '../utils/variableChanges';
import { variableTraceLogger } from '../utils/logger';

type ActiveVariableTurn = {
  turnId: number;
  baselineStatData: Record<string, unknown> | null;
  lastStatData: Record<string, unknown> | null;
  userMessageId?: number;
  assistantMessageId?: number;
  assistantReplyLocked: boolean;
  assistantDeclaredReply: string;
  extraDeclaredBlocks: string;
  aiWriteTargetIds: number[];
  batchSequence: number;
};

type WriteDoneLikeDetail = {
  message_id?: number | null;
  actions?: Record<string, unknown>;
  reason?: unknown;
  stat?: unknown;
  statWithoutMeta?: unknown;
};

type ChatMessageWithSwipes = {
  message_id?: number;
  message?: string;
  mes?: string;
  swipes?: string[];
  swipe_id?: number;
};

type StoredVariableTurn = {
  version: 13;
  chatId: string;
  savedAt: number;
  activeTurn: ActiveVariableTurn;
  summary: VariableChangeSummary;
};

type CaptureMetadata = {
  origin: VariableChangeOrigin;
  producer: VariableChangeProducer;
  reason: string;
  actions?: VariableWriteActions | null;
  assistantMessageId?: number;
  aiOnlyDeclaredMatches?: boolean;
};

type VariableWriteSignal =
  | { kind: 'era'; producer: 'era'; detail?: WriteDoneLikeDetail }
  | { kind: 'sourced-era'; producer: DirectVariableWriteSource; detail?: EraVariableWriteDoneDetail }
  | { kind: 'direct'; producer: DirectVariableWriteSource; detail?: DirectVariableWriteDoneDetail }
  | { kind: 'boundary'; producer: 'message-boundary'; assistantMessageId?: number };

type DeclaredSourceKind = 'assistant-reply' | 'extra-blocks';
type ParsedDeclaredState = ReturnType<typeof parseDeclaredVariableChanges>;

const STORAGE_KEY = 'wuxia.variableChangeTurn.v13';
const LEGACY_STORAGE_KEYS = [
  'wuxia.variableChangeTurn.v1',
  'wuxia.variableChangeTurn.v2',
  'wuxia.variableChangeTurn.v3',
  'wuxia.variableChangeTurn.v4',
  'wuxia.variableChangeTurn.v5',
  'wuxia.variableChangeTurn.v6',
  'wuxia.variableChangeTurn.v7',
  'wuxia.variableChangeTurn.v8',
  'wuxia.variableChangeTurn.v9',
  'wuxia.variableChangeTurn.v10',
  'wuxia.variableChangeTurn.v11',
  'wuxia.variableChangeTurn.v12',
];
const STORED_TURN_TTL_MS = 30 * 60 * 1000;
const STALE_WRITE_DONE_RETRY_DELAY_MS = 40;
const STALE_WRITE_DONE_MAX_RETRIES = 8;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const summarizeActions = (actions?: VariableWriteActions | null): string[] =>
  Object.keys(actions ?? {}).filter(action => actions?.[action] === true);

const summarizeMetadata = (metadata: CaptureMetadata) => ({
  attribution: metadata.origin,
  origin: metadata.origin,
  producer: metadata.producer,
  reason: metadata.reason,
  actions: summarizeActions(metadata.actions),
  assistantMessageId: metadata.assistantMessageId ?? null,
  aiOnlyDeclaredMatches: metadata.aiOnlyDeclaredMatches === true,
});

const summarizeObservedChange = (change: VariableActualChange) => ({
  action: change.action,
  path: change.displayPath,
  attribution: change.origin,
  producer: change.producer,
  origin: change.origin,
  before: change.beforePreview,
  after: change.afterPreview,
  reason: change.reason,
  actions: summarizeActions(change.actions),
  batchId: change.batchId,
});

const summarizeBatch = (batch: VariableObservedBatch) => ({
  batchId: batch.batchId,
  attribution: batch.origin,
  origin: batch.origin,
  producer: batch.producer,
  reason: batch.reason,
  actions: summarizeActions(batch.actions),
  assistantMessageId: batch.assistantMessageId ?? null,
  changeCount: batch.changeCount,
});

const summarizeDeclaredChange = (
  change: VariableChangeSummary['aiReply']['declaredChanges'][number],
) => ({
  action: change.action,
  path: change.displayPath,
  value: change.valuePreview,
  blockTag: change.blockTag,
});

const normalizeSourcedEraAttribution = (value: unknown): 'ai' | 'background' | undefined =>
  value === 'ai' || value === 'background' ? value : undefined;

const summarizeSignal = (signal: VariableWriteSignal) => ({
  kind: signal.kind,
  producer: signal.producer,
  attribution:
    signal.kind === 'sourced-era'
      ? normalizeSourcedEraAttribution(signal.detail?.attribution) ?? null
      : null,
  assistantMessageId:
    signal.kind === 'boundary'
      ? signal.assistantMessageId ?? null
      : signal.kind === 'direct'
        ? null
        : signal.detail?.message_id ?? null,
  detail: signal.kind === 'boundary' ? null : signal.detail ?? null,
});

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
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    for (const legacyStorageKey of LEGACY_STORAGE_KEYS) {
      window.sessionStorage.removeItem(legacyStorageKey);
    }
    const rawStored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawStored) {
      return null;
    }

    const stored = JSON.parse(rawStored) as StoredVariableTurn;
    const currentChatId = getCurrentChatStorageId();
    const isExpired = Date.now() - Number(stored.savedAt || 0) > STORED_TURN_TTL_MS;
    const isDifferentKnownChat =
      stored.chatId !== 'unknown'
      && currentChatId !== 'unknown'
      && stored.chatId !== currentChatId;

    if (stored.version !== 13 || isExpired || isDifferentKnownChat) {
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
  if (typeof window === 'undefined') {
    return;
  }

  if (!activeTurn || !summary) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }

  try {
    const stored: StoredVariableTurn = {
      version: 13,
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
  const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return message.message || message.mes || swipes[swipeIndex] || swipes[0] || '';
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
      if (content.trim()) {
        return {
          messageId: Number.isInteger(message.message_id) ? Number(message.message_id) : undefined,
          content,
        };
      }
    }
  } catch {
    // Message-boundary refresh is a best-effort fallback.
  }
  return { content: '' };
};

const normalizeMessageId = (messageId: unknown): number | undefined =>
  Number.isInteger(messageId) ? Number(messageId) : undefined;

const normalizeWriteActions = (actions: unknown): VariableWriteActions | null => {
  if (!isRecord(actions)) {
    return null;
  }

  const enabledActions = Object.entries(actions)
    .filter(([, enabled]) => enabled === true)
    .map(([action]) => [action, true] as const);
  return enabledActions.length > 0 ? Object.fromEntries(enabledActions) : null;
};

const getPathKey = (change: Pick<VariableActualChange, 'path'>): string =>
  JSON.stringify(change.path);

const declaredMatchesObserved = (
  declared: VariableChangeSummary['aiReply']['declaredChanges'][number],
  observed: Pick<VariableActualChange, 'path' | 'afterValue'>,
): boolean => {
  if (JSON.stringify(declared.path) !== JSON.stringify(observed.path)) {
    return false;
  }
  if (declared.action === 'delete') {
    return observed.afterValue === undefined;
  }
  return stableStringify(declared.value) === stableStringify(observed.afterValue);
};

const matchesAnyDeclaredChange = (
  declaredChanges: VariableChangeSummary['aiReply']['declaredChanges'],
  observed: Pick<VariableActualChange, 'path' | 'afterValue'>,
): boolean => declaredChanges.some(declared => declaredMatchesObserved(declared, observed));

const appendLimited = <T,>(
  existing: T[],
  additions: T[],
): { values: T[]; omitted: number } => {
  const available = Math.max(0, MAX_STORED_VARIABLE_CHANGES - existing.length);
  return {
    values: [...existing, ...additions.slice(0, available)],
    omitted: Math.max(0, additions.length - available),
  };
};

const combineObservedChanges = (summary: VariableChangeSummary): VariableActualChange[] =>
  [...summary.aiReply.observedChanges, ...summary.background.observedChanges]
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));

const rebuildSummary = (
  summary: VariableChangeSummary,
  activeTurn: ActiveVariableTurn,
): VariableChangeSummary => {
  const comparisonResult = buildAiComparisons({
    declaredChanges: summary.aiReply.declaredChanges,
    observedChanges: summary.aiReply.observedChanges,
    baselineStatData: activeTurn.baselineStatData,
    currentStatData: activeTurn.lastStatData,
  });
  const allObservedChanges = combineObservedChanges(summary);

  return {
    ...summary,
    userMessageId: activeTurn.userMessageId,
    assistantMessageId: activeTurn.assistantMessageId ?? summary.assistantMessageId,
    updatedAt: Date.now(),
    topLevelGroups: collectVariableTopLevelGroups(summary.aiReply.declaredChanges, allObservedChanges),
    aiReply: {
      ...summary.aiReply,
      comparisons: comparisonResult.comparisons,
      omittedComparisonCount: comparisonResult.omittedComparisonCount,
    },
    declaredChanges: summary.aiReply.declaredChanges,
    actualChanges: allObservedChanges,
    omittedDeclaredCount: summary.aiReply.omittedDeclaredCount,
    omittedActualCount:
      summary.aiReply.omittedObservedCount
      + summary.background.omittedObservedCount,
  };
};

const PRODUCER_PRIORITY: Record<VariableChangeProducer, number> = {
  'message-boundary': 0,
  era: 1,
  'event-script': 2,
  'variable-editor': 2,
  frontend: 2,
  restore: 2,
};

const isBoundaryProducer = (producer: VariableChangeProducer): boolean =>
  producer === 'message-boundary';

const canPromoteBatchToAi = (
  batch: Pick<VariableObservedBatch, 'origin' | 'producer'>,
  metadata: CaptureMetadata,
): boolean =>
  metadata.origin === 'ai'
  && batch.origin !== 'ai'
  && isBoundaryProducer(batch.producer);

const canDemoteBatchToBackground = (
  batch: Pick<VariableObservedBatch, 'origin'>,
  metadata: CaptureMetadata,
): boolean =>
  metadata.origin === 'background'
  && batch.origin === 'ai';

const isDirectVariableWriteSource = (value: unknown): value is DirectVariableWriteSource =>
  value === 'event-script'
  || value === 'variable-editor'
  || value === 'frontend'
  || value === 'restore';

const createEmptyParsedDeclaredState = (): ParsedDeclaredState => ({
  declaredChanges: [],
  thoughts: [],
  parseErrors: [],
  omittedDeclaredCount: 0,
});

const getDeclaredChangeDedupKey = (change: VariableDeclaredChange): string =>
  [
    change.action,
    change.copyPath,
    change.blockTag,
    stableStringify(change.value),
  ].join('|');

const mergeParsedDeclaredStates = (...parsedList: ParsedDeclaredState[]): ParsedDeclaredState => {
  const declaredChanges: VariableDeclaredChange[] = [];
  const thoughts: VariableThoughtEntry[] = [];
  const parseErrors: string[] = [];
  const seenDeclaredKeys = new Set<string>();
  let omittedDeclaredCount = 0;

  for (const parsed of parsedList) {
    thoughts.push(...parsed.thoughts);
    parseErrors.push(...parsed.parseErrors);
    omittedDeclaredCount += parsed.omittedDeclaredCount;

    for (const change of parsed.declaredChanges) {
      const dedupKey = getDeclaredChangeDedupKey(change);
      if (seenDeclaredKeys.has(dedupKey)) {
        continue;
      }

      seenDeclaredKeys.add(dedupKey);
      if (declaredChanges.length < MAX_STORED_VARIABLE_CHANGES) {
        declaredChanges.push(change);
      } else {
        omittedDeclaredCount += 1;
      }
    }
  }

  return {
    declaredChanges,
    thoughts,
    parseErrors,
    omittedDeclaredCount,
  };
};

const hasFrozenDeclaredSources = (
  activeTurn: Pick<ActiveVariableTurn, 'assistantDeclaredReply' | 'extraDeclaredBlocks'>,
): boolean =>
  activeTurn.assistantDeclaredReply.trim().length > 0
  || activeTurn.extraDeclaredBlocks.trim().length > 0;

const normalizeActiveTurn = (activeTurn: ActiveVariableTurn): ActiveVariableTurn => ({
  ...activeTurn,
  assistantReplyLocked: activeTurn.assistantReplyLocked === true,
  assistantDeclaredReply:
    typeof activeTurn.assistantDeclaredReply === 'string' ? activeTurn.assistantDeclaredReply : '',
  extraDeclaredBlocks:
    typeof activeTurn.extraDeclaredBlocks === 'string' ? activeTurn.extraDeclaredBlocks : '',
  aiWriteTargetIds: Array.isArray(activeTurn.aiWriteTargetIds)
    ? activeTurn.aiWriteTargetIds.filter(id => Number.isInteger(id))
    : [],
  batchSequence: Number.isInteger(activeTurn.batchSequence) ? activeTurn.batchSequence : 0,
});

export function useVariableChangeTracker() {
  const restoredTurnRef = useRef<StoredVariableTurn | null | undefined>(undefined);
  if (restoredTurnRef.current === undefined) {
    restoredTurnRef.current = readStoredVariableTurn();
  }

  const restoredTurn = restoredTurnRef.current
    ? {
      ...restoredTurnRef.current,
      activeTurn: normalizeActiveTurn(restoredTurnRef.current.activeTurn),
    }
    : null;
  const [variableChanges, setVariableChanges] = useState<VariableChangeSummary | null>(
    () => restoredTurn?.summary ?? null,
  );
  const variableChangesRef = useRef<VariableChangeSummary | null>(restoredTurn?.summary ?? null);
  const activeTurnRef = useRef<ActiveVariableTurn | null>(restoredTurn?.activeTurn ?? null);
  const nextTurnIdRef = useRef(restoredTurn?.summary.turnId ?? 0);

  const commitSummary = useCallback((summary: VariableChangeSummary | null) => {
    variableChangesRef.current = summary;
    setVariableChanges(summary);
    persistVariableTurn(activeTurnRef.current, summary);
  }, []);

  const mutateSummary = useCallback((
    updater: (current: VariableChangeSummary) => VariableChangeSummary,
  ) => {
    const current = variableChangesRef.current;
    if (!current) {
      return;
    }
    commitSummary(updater(current));
  }, [commitSummary]);

  const startTurn = useCallback((userMessageId?: number) => {
    const turnId = nextTurnIdRef.current + 1;
    nextTurnIdRef.current = turnId;
    const baselineStatData = readCurrentStatDataSnapshot();
    const activeTurn: ActiveVariableTurn = {
      turnId,
      baselineStatData,
      lastStatData: baselineStatData,
      userMessageId,
      assistantReplyLocked: false,
      assistantDeclaredReply: '',
      extraDeclaredBlocks: '',
      aiWriteTargetIds: [],
      batchSequence: 0,
    };
    activeTurnRef.current = activeTurn;
    variableTraceLogger.log('[useVariableChangeTracker] 开始新回合', {
      turnId,
      userMessageId: userMessageId ?? null,
      baselineSnapshotHash: baselineStatData ? getSnapshotHash(baselineStatData) : null,
      baselineTopLevelKeys: baselineStatData ? Object.keys(baselineStatData) : [],
    });
    commitSummary(createEmptyVariableChangeSummary(
      turnId,
      baselineStatData ? 'tracking' : 'error',
    ));
  }, [commitSummary]);

  const upgradeMatchingBatch = useCallback((
    nextSnapshotHash: string,
    metadata: CaptureMetadata,
  ): boolean => {
    const activeTurn = activeTurnRef.current;
    const current = variableChangesRef.current;
    if (!activeTurn || !current) {
      return false;
    }

    const matchingBatches = [...current.batches]
      .reverse()
      .filter(candidate => candidate.nextSnapshotHash === nextSnapshotHash);
    const batch = matchingBatches.find(candidate =>
      canPromoteBatchToAi(candidate, metadata)
      || canDemoteBatchToBackground(candidate, metadata))
      ?? matchingBatches[0];
    if (!batch) {
      variableTraceLogger.warn('[useVariableChangeTracker] 快照未变化，但没有找到可升级的批次', {
        turnId: activeTurn.turnId,
        nextSnapshotHash,
        metadata: summarizeMetadata(metadata),
      });
      return false;
    }

    const shouldMoveToAi = canPromoteBatchToAi(batch, metadata);
    const shouldMoveToBackground = canDemoteBatchToBackground(batch, metadata);
    const shouldUpgradeProducer =
      PRODUCER_PRIORITY[metadata.producer] > PRODUCER_PRIORITY[batch.producer];
    const shouldImproveMetadata =
      shouldUpgradeProducer
      || (
        batch.producer === metadata.producer
        && isBoundaryProducer(batch.producer)
        && !isBoundaryProducer(metadata.producer)
      )
      || (batch.actions === null && metadata.actions !== null && metadata.actions !== undefined)
      || (batch.assistantMessageId === undefined && metadata.assistantMessageId !== undefined);
    if (!shouldMoveToAi && !shouldMoveToBackground && !shouldImproveMetadata) {
      variableTraceLogger.log('[useVariableChangeTracker] 命中已有批次，但无需调整归因', {
        turnId: activeTurn.turnId,
        batch: summarizeBatch(batch),
        metadata: summarizeMetadata(metadata),
      });
      return true;
    }

    variableTraceLogger.log('[useVariableChangeTracker] 复用已有批次并调整归因', {
      turnId: activeTurn.turnId,
      nextSnapshotHash,
      batch: summarizeBatch(batch),
      metadata: summarizeMetadata(metadata),
      shouldMoveToAi,
      shouldMoveToBackground,
      shouldUpgradeProducer,
      shouldImproveMetadata,
    });

    mutateSummary(summary => {
      const batchAiChanges = summary.aiReply.observedChanges
        .filter(change => change.batchId === batch.batchId);
      const batchBackgroundChanges = summary.background.observedChanges
        .filter(change => change.batchId === batch.batchId);
      const movedChanges = shouldMoveToAi
        ? batchBackgroundChanges.filter(change =>
          !metadata.aiOnlyDeclaredMatches
          || matchesAnyDeclaredChange(summary.aiReply.declaredChanges, change))
        : shouldMoveToBackground
          ? batchAiChanges
        : [];
      const movedChangeIds = new Set(movedChanges.map(change => change.id));
      const aiUpgradeBatchId = `${batch.batchId}:ai`;
      const backgroundDowngradeBatchId = `${batch.batchId}:background`;
      const upgradedAiChanges = shouldMoveToAi
        ? movedChanges.map((change, index) => ({
          ...change,
          id: `${change.source}:${change.action}:${getPathKey(change)}:${aiUpgradeBatchId}:${index}`,
          batchId: aiUpgradeBatchId,
          origin: 'ai' as const,
          producer: metadata.producer,
          actions: metadata.actions ?? change.actions,
          reason: metadata.reason,
          assistantMessageId: metadata.assistantMessageId ?? change.assistantMessageId,
        }))
        : [];
      const downgradedBackgroundChanges = shouldMoveToBackground
        ? movedChanges.map((change, index) => ({
          ...change,
          id: `${change.source}:${change.action}:${getPathKey(change)}:${backgroundDowngradeBatchId}:${index}`,
          batchId: backgroundDowngradeBatchId,
          origin: 'background' as const,
          producer: metadata.producer,
          actions: metadata.actions ?? change.actions,
          reason: metadata.reason,
          assistantMessageId: metadata.assistantMessageId ?? change.assistantMessageId,
        }))
        : [];
      const patchedAi = summary.aiReply.observedChanges
        .filter(change => !shouldMoveToBackground || !movedChangeIds.has(change.id))
        .map(change =>
          change.batchId === batch.batchId && shouldImproveMetadata && !shouldMoveToBackground
          ? {
            ...change,
            producer: metadata.producer,
            actions: metadata.actions ?? change.actions,
            reason: metadata.reason,
            assistantMessageId: metadata.assistantMessageId ?? change.assistantMessageId,
          }
          : change);
      const patchedBackground = summary.background.observedChanges
        .filter(change => !movedChangeIds.has(change.id))
        .map(change =>
          !shouldMoveToAi && shouldImproveMetadata && change.batchId === batch.batchId
            ? {
              ...change,
              producer: metadata.producer,
              actions: metadata.actions ?? change.actions,
              reason: metadata.reason,
              assistantMessageId: metadata.assistantMessageId ?? change.assistantMessageId,
            }
            : change);
      const aiAppend = appendLimited(
        patchedAi,
        upgradedAiChanges,
      );
      const backgroundAppend = appendLimited(
        patchedBackground,
        downgradedBackgroundChanges,
      );
      const remainingBatchChangeCount = batchBackgroundChanges.length - movedChanges.length;
      const nextBatches = summary.batches.flatMap(candidate => {
        if (candidate.batchId !== batch.batchId) {
          return [candidate];
        }

        if (shouldMoveToBackground) {
          const downgradedBatch: VariableObservedBatch | null = movedChanges.length > 0
            ? {
              ...candidate,
              batchId: backgroundDowngradeBatchId,
              origin: 'background',
              producer: metadata.producer,
              actions: metadata.actions ?? candidate.actions,
              reason: metadata.reason,
              assistantMessageId: metadata.assistantMessageId ?? candidate.assistantMessageId,
              changeCount: movedChanges.length,
            }
            : null;
          return downgradedBatch ? [downgradedBatch] : [];
        }

        if (!shouldMoveToAi) {
          return [{
            ...candidate,
            producer: metadata.producer,
            actions: metadata.actions ?? candidate.actions,
            reason: metadata.reason,
            assistantMessageId: metadata.assistantMessageId ?? candidate.assistantMessageId,
          }];
        }

        const upgradedBatch: VariableObservedBatch | null = movedChanges.length > 0
          ? {
            ...candidate,
            batchId: aiUpgradeBatchId,
            origin: 'ai',
            producer: metadata.producer,
            actions: metadata.actions ?? candidate.actions,
            reason: metadata.reason,
            assistantMessageId: metadata.assistantMessageId ?? candidate.assistantMessageId,
            changeCount: movedChanges.length,
          }
          : null;
        const remainingBatch: VariableObservedBatch | null = remainingBatchChangeCount > 0
          ? {
            ...candidate,
            producer: metadata.producer,
            actions: metadata.actions ?? candidate.actions,
            reason: metadata.reason,
            assistantMessageId: metadata.assistantMessageId ?? candidate.assistantMessageId,
            changeCount: remainingBatchChangeCount,
          }
          : null;
        return [remainingBatch, upgradedBatch].filter(
          (nextBatch): nextBatch is VariableObservedBatch => Boolean(nextBatch),
        );
      });
      const nextSummary: VariableChangeSummary = {
        ...summary,
        aiReply: {
          ...summary.aiReply,
          observedChanges: aiAppend.values,
          omittedObservedCount: summary.aiReply.omittedObservedCount + aiAppend.omitted,
        },
        background: {
          ...summary.background,
          observedChanges: backgroundAppend.values,
          omittedObservedCount: summary.background.omittedObservedCount + backgroundAppend.omitted,
        },
        batches: nextBatches,
      };
      variableTraceLogger.log('[useVariableChangeTracker] 批次归因调整结果', {
        turnId: activeTurn.turnId,
        aiObservedCount: nextSummary.aiReply.observedChanges.length,
        backgroundObservedCount: nextSummary.background.observedChanges.length,
        aiObserved: nextSummary.aiReply.observedChanges.map(summarizeObservedChange),
        backgroundObserved: nextSummary.background.observedChanges.map(summarizeObservedChange),
        batches: nextSummary.batches.map(summarizeBatch),
      });
      return rebuildSummary(nextSummary, activeTurn);
    });
    return true;
  }, [mutateSummary]);

  const captureResolvedSnapshot = useCallback((
    nextStatData: Record<string, unknown> | null,
    metadata: CaptureMetadata,
  ) => {
    const activeTurn = activeTurnRef.current;
    const current = variableChangesRef.current;
    if (!activeTurn || !current || current.turnId !== activeTurn.turnId) {
      return;
    }

    if (!nextStatData) {
      variableTraceLogger.error('[useVariableChangeTracker] 读取 stat_data 快照失败，无法继续归因', {
        turnId: activeTurn.turnId,
        metadata: summarizeMetadata(metadata),
      });
      mutateSummary(summary => ({ ...summary, status: 'error', updatedAt: Date.now() }));
      return;
    }

    const nextSnapshotHash = getSnapshotHash(nextStatData);
    const previousSnapshotHash = activeTurn.lastStatData
      ? getSnapshotHash(activeTurn.lastStatData)
      : null;
    if (previousSnapshotHash === nextSnapshotHash) {
      variableTraceLogger.log('[useVariableChangeTracker] 快照未变化，尝试复用已有批次', {
        turnId: activeTurn.turnId,
        metadata: summarizeMetadata(metadata),
        snapshotHash: nextSnapshotHash,
      });
      upgradeMatchingBatch(nextSnapshotHash, metadata);
      activeTurn.lastStatData = nextStatData;
      persistVariableTurn(activeTurn, variableChangesRef.current);
      return;
    }

    activeTurn.batchSequence += 1;
    const baseBatchId = `${activeTurn.turnId}:${activeTurn.batchSequence}`;
    const declaredChanges = current.aiReply.declaredChanges;
    const result = createBucketedObservedVariableChanges(
      activeTurn.lastStatData ?? activeTurn.baselineStatData,
      nextStatData,
      {
        origin: metadata.origin,
        producer: metadata.producer,
        timestamp: Date.now(),
        batchId: baseBatchId,
        actions: metadata.actions,
        reason: metadata.reason,
        assistantMessageId: metadata.assistantMessageId,
      },
      candidate => {
        const matchesDeclaration = matchesAnyDeclaredChange(declaredChanges, candidate);
        const matchedAsAi =
          metadata.origin === 'ai'
          && (!metadata.aiOnlyDeclaredMatches || matchesDeclaration);
        return matchedAsAi ? 'ai' : 'background';
      },
    );
    activeTurn.lastStatData = nextStatData;

    if (!result.batch || result.totalObservedCount === 0) {
      variableTraceLogger.log('[useVariableChangeTracker] 当前信号未产生新的变量差分', {
        turnId: activeTurn.turnId,
        metadata: summarizeMetadata(metadata),
        previousSnapshotHash,
        nextSnapshotHash,
      });
      persistVariableTurn(activeTurn, variableChangesRef.current);
      return;
    }

    const aiChanges = result.ai.observedChanges;
    const backgroundChanges = result.background.observedChanges;

    variableTraceLogger.log('[useVariableChangeTracker] 捕获到新的变量差分', {
      turnId: activeTurn.turnId,
      metadata: summarizeMetadata(metadata),
      previousSnapshotHash,
      nextSnapshotHash,
      totalObservedCount: result.totalObservedCount,
      aiObservedTotal: result.ai.totalObservedCount,
      backgroundObservedTotal: result.background.totalObservedCount,
      aiChanges: aiChanges.map(summarizeObservedChange),
      backgroundChanges: backgroundChanges.map(summarizeObservedChange),
    });

    const createBatch = (
      origin: VariableChangeOrigin,
      bucket: ObservedVariableChangeBucket,
      suffix: string,
    ): { batch: VariableObservedBatch; changes: VariableActualChange[] } | null => {
      if (bucket.totalObservedCount === 0 || !result.batch) {
        return null;
      }
      const batchId = `${baseBatchId}:${suffix}`;
      return {
        batch: {
          ...result.batch,
          batchId,
          origin,
          changeCount: bucket.totalObservedCount,
        },
        changes: bucket.observedChanges.map((change, index) => ({
          ...change,
          id: `${change.source}:${change.action}:${getPathKey(change)}:${batchId}:${index}`,
          batchId,
          origin,
        })),
      };
    };

    const aiBatch = createBatch('ai', result.ai, 'ai');
    const backgroundBatch = createBatch('background', result.background, 'background');
    mutateSummary(summary => {
      const aiAppend = appendLimited(
        summary.aiReply.observedChanges,
        aiBatch?.changes ?? [],
      );
      const backgroundAppend = appendLimited(
        summary.background.observedChanges,
        backgroundBatch?.changes ?? [],
      );
      const nextSummary: VariableChangeSummary = {
        ...summary,
        status: summary.status === 'tracking' ? 'tracking' : 'settled',
        aiReply: {
          ...summary.aiReply,
          observedChanges: aiAppend.values,
          omittedObservedCount:
            summary.aiReply.omittedObservedCount
            + aiAppend.omitted
            + result.ai.omittedObservedCount,
        },
        background: {
          ...summary.background,
          observedChanges: backgroundAppend.values,
          omittedObservedCount:
            summary.background.omittedObservedCount
            + backgroundAppend.omitted
            + result.background.omittedObservedCount,
        },
        batches: [
          ...summary.batches,
          ...[aiBatch?.batch, backgroundBatch?.batch].filter(
            (batch): batch is VariableObservedBatch => Boolean(batch),
          ),
        ].slice(-MAX_STORED_VARIABLE_CHANGES),
      };
      return rebuildSummary(nextSummary, activeTurn);
    });
  }, [mutateSummary, upgradeMatchingBatch]);

  const captureCurrentSnapshot = useCallback((metadata: CaptureMetadata) => {
    captureResolvedSnapshot(readCurrentStatDataSnapshot(), metadata);
  }, [captureResolvedSnapshot]);

  const refreshDeclaredChanges = useCallback((
    source: DeclaredSourceKind,
    rawReply: string,
    assistantMessageId?: number,
  ) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn || !rawReply.trim()) {
      return;
    }

    if (assistantMessageId !== undefined) {
      activeTurn.assistantMessageId = assistantMessageId;
    }
    if (source === 'assistant-reply') {
      activeTurn.assistantDeclaredReply = rawReply;
    } else {
      activeTurn.extraDeclaredBlocks = rawReply;
    }

    const merged = mergeParsedDeclaredStates(
      activeTurn.assistantDeclaredReply.trim()
        ? parseDeclaredVariableChanges(activeTurn.assistantDeclaredReply)
        : createEmptyParsedDeclaredState(),
      activeTurn.extraDeclaredBlocks.trim()
        ? parseDeclaredVariableChanges(activeTurn.extraDeclaredBlocks)
        : createEmptyParsedDeclaredState(),
    );

    variableTraceLogger.log('[useVariableChangeTracker] 刷新 AI 声明变量', {
      turnId: activeTurn.turnId,
      source,
      assistantMessageId: assistantMessageId ?? null,
      rawReplyLength: rawReply.length,
      declaredChanges: merged.declaredChanges.map(summarizeDeclaredChange),
      omittedDeclaredCount: merged.omittedDeclaredCount,
      thoughts: merged.thoughts.map(thought => thought.preview),
      parseErrors: merged.parseErrors,
      hasAssistantDeclaredReply: activeTurn.assistantDeclaredReply.trim().length > 0,
      hasExtraDeclaredBlocks: activeTurn.extraDeclaredBlocks.trim().length > 0,
    });
    mutateSummary(summary => {
      const hasObservedChanges =
        summary.aiReply.observedChanges.length > 0
        || summary.background.observedChanges.length > 0;
      const nextSummary: VariableChangeSummary = {
        ...summary,
        status: activeTurn.baselineStatData
          ? hasObservedChanges ? 'settled' : 'reply-recorded'
          : 'error',
        assistantMessageId: assistantMessageId ?? summary.assistantMessageId,
        thoughts: merged.thoughts,
        parseErrors: merged.parseErrors,
        aiReply: {
          ...summary.aiReply,
          declaredChanges: merged.declaredChanges,
          omittedDeclaredCount: merged.omittedDeclaredCount,
        },
      };
      return rebuildSummary(nextSummary, activeTurn);
    });
  }, [mutateSummary]);

  const handleVariableTurnStart = useCallback(() => {
    startTurn();
  }, [startTurn]);

  const handleGlobalMessageSent = useCallback((messageId: number) => {
    const normalizedMessageId = normalizeMessageId(messageId);
    if (normalizedMessageId === undefined) {
      return;
    }

    const activeTurn = activeTurnRef.current;
    if (activeTurn && activeTurn.userMessageId === undefined) {
      activeTurn.userMessageId = normalizedMessageId;
      mutateSummary(summary => rebuildSummary(summary, activeTurn));
      return;
    }
    if (activeTurn?.userMessageId === normalizedMessageId) {
      return;
    }
    startTurn(normalizedMessageId);
  }, [mutateSummary, startTurn]);

  const scheduleStaleWriteDoneRecovery = useCallback(({
    turnId,
    expectedSnapshotHash,
    metadata,
  }: {
    turnId: number;
    expectedSnapshotHash: string | null;
    metadata: CaptureMetadata;
  }) => {
    if (!expectedSnapshotHash) {
      return;
    }

    variableTraceLogger.warn('[useVariableChangeTracker] 写入事件先到、变量快照未刷新，安排延迟补读', {
      turnId,
      expectedSnapshotHash,
      metadata: summarizeMetadata(metadata),
    });

    const retryCapture = (remainingRetries: number) => {
      const activeTurn = activeTurnRef.current;
      if (!activeTurn || activeTurn.turnId !== turnId) {
        return;
      }

      const currentSnapshotHash = activeTurn.lastStatData
        ? getSnapshotHash(activeTurn.lastStatData)
        : null;
      if (currentSnapshotHash !== expectedSnapshotHash) {
        return;
      }

      variableTraceLogger.log('[useVariableChangeTracker] 执行延迟补读', {
        turnId,
        remainingRetries,
        expectedSnapshotHash,
        metadata: summarizeMetadata(metadata),
      });

      captureCurrentSnapshot(metadata);

      const refreshedTurn = activeTurnRef.current;
      if (!refreshedTurn || refreshedTurn.turnId !== turnId) {
        return;
      }

      const refreshedSnapshotHash = refreshedTurn.lastStatData
        ? getSnapshotHash(refreshedTurn.lastStatData)
        : null;
      if (refreshedSnapshotHash !== expectedSnapshotHash || remainingRetries <= 1) {
        return;
      }

      window.setTimeout(() => {
        retryCapture(remainingRetries - 1);
      }, STALE_WRITE_DONE_RETRY_DELAY_MS);
    };

    window.setTimeout(() => {
      retryCapture(STALE_WRITE_DONE_MAX_RETRIES);
    }, STALE_WRITE_DONE_RETRY_DELAY_MS);
  }, [captureCurrentSnapshot]);

  const markVariableApiWriteAsAi = useCallback((assistantMessageId: number) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn || !Number.isInteger(assistantMessageId)) {
      return;
    }
    activeTurn.assistantMessageId = assistantMessageId;
    if (!activeTurn.aiWriteTargetIds.includes(assistantMessageId)) {
      activeTurn.aiWriteTargetIds.push(assistantMessageId);
    }
    variableTraceLogger.log('[useVariableChangeTracker] 标记 assistant 楼层为 AI 写入目标', {
      turnId: activeTurn.turnId,
      assistantMessageId,
      aiWriteTargetIds: [...activeTurn.aiWriteTargetIds],
    });
    captureCurrentSnapshot({
      origin: 'ai',
      producer: 'message-boundary',
      reason: 'message-boundary',
      assistantMessageId,
      aiOnlyDeclaredMatches: true,
    });
    mutateSummary(summary => rebuildSummary(summary, activeTurn));
  }, [captureCurrentSnapshot, mutateSummary]);

  const captureSignal = useCallback((signal: VariableWriteSignal) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) {
      return;
    }

    if (signal.kind === 'boundary') {
      variableTraceLogger.log('[useVariableChangeTracker] 处理消息边界信号', {
        turnId: activeTurn.turnId,
        signal: summarizeSignal(signal),
      });
      captureCurrentSnapshot({
        origin: 'background',
        producer: signal.producer,
        reason: 'message-boundary',
        assistantMessageId: signal.assistantMessageId,
      });
      return;
    }

    const actions =
      signal.kind === 'era' || signal.kind === 'sourced-era'
        ? normalizeWriteActions(signal.detail?.actions)
        : null;
    const assistantMessageId =
      signal.kind === 'era' || signal.kind === 'sourced-era'
        ? normalizeMessageId(signal.detail?.message_id)
        : undefined;
    const sourcedAttribution =
      signal.kind === 'sourced-era'
        ? normalizeSourcedEraAttribution(signal.detail?.attribution)
        : undefined;
    const isAiTarget = assistantMessageId !== undefined
      && activeTurn.aiWriteTargetIds.includes(assistantMessageId);
    const isDirectChatWrite = actions?.directChatWrite === true;
    const isAiWrite =
      !isDirectChatWrite
      && (
        (signal.kind === 'sourced-era' && sourcedAttribution === 'ai')
        || (
          signal.kind === 'era'
          && (
            actions?.apply === true
            || (actions?.apiWrite === true && isAiTarget)
            || ((actions?.rollback === true || actions?.resync === true) && isAiTarget)
          )
        )
      );
    const reason =
      signal.kind === 'direct' || signal.kind === 'sourced-era'
        ? (typeof signal.detail?.reason === 'string' && signal.detail.reason.trim()
          ? signal.detail.reason.trim()
          : 'direct-write-done')
        : (typeof signal.detail?.reason === 'string' && signal.detail.reason.trim()
          ? signal.detail.reason.trim()
          : 'era-write-done');
    const beforeCaptureSnapshotHash = activeTurn.lastStatData
      ? getSnapshotHash(activeTurn.lastStatData)
      : null;

    variableTraceLogger.log('[useVariableChangeTracker] 收到变量写入信号', {
      turnId: activeTurn.turnId,
      signal: summarizeSignal(signal),
      normalized: {
        assistantMessageId: assistantMessageId ?? null,
        actions: summarizeActions(actions),
        isAiTarget,
        isDirectChatWrite,
        sourcedAttribution: sourcedAttribution ?? null,
        isAiWrite,
        reason,
        aiWriteTargetIds: [...activeTurn.aiWriteTargetIds],
      },
      beforeCaptureSnapshotHash,
    });

    if (assistantMessageId !== undefined && isAiWrite) {
      activeTurn.assistantMessageId = assistantMessageId;
    }

    // All signals reread chat stat_data as the canonical snapshot source.
    // writeDone payloads are attribution metadata only and must not enter diff/hash directly.
    captureCurrentSnapshot({
      origin: isAiWrite ? 'ai' : 'background',
      producer: signal.producer,
      reason,
      actions,
      assistantMessageId,
      aiOnlyDeclaredMatches: isAiWrite,
    });

    const afterCaptureSnapshotHash = activeTurn.lastStatData
      ? getSnapshotHash(activeTurn.lastStatData)
      : null;

    variableTraceLogger.log('[useVariableChangeTracker] 写入信号归因完成', {
      turnId: activeTurn.turnId,
      signalKind: signal.kind,
      resolvedOrigin: isAiWrite ? 'ai' : 'background',
      producer: signal.producer,
      assistantMessageId: assistantMessageId ?? null,
      beforeCaptureSnapshotHash,
      afterCaptureSnapshotHash,
    });

    if (
      beforeCaptureSnapshotHash === afterCaptureSnapshotHash
      && (
        signal.kind === 'era'
        && (
          actions?.apply === true
          || actions?.apiWrite === true
          || (isAiWrite && (actions?.rollback === true || actions?.resync === true))
        )
      )
    ) {
      scheduleStaleWriteDoneRecovery({
        turnId: activeTurn.turnId,
        expectedSnapshotHash: beforeCaptureSnapshotHash,
        metadata: {
          origin: isAiWrite ? 'ai' : 'background',
          producer: signal.producer,
          reason,
          actions,
          assistantMessageId,
          aiOnlyDeclaredMatches: isAiWrite,
        },
      });
    }
  }, [captureCurrentSnapshot, refreshDeclaredChanges, scheduleStaleWriteDoneRecovery]);

  const handleVariableAssistantReply = useCallback((
    rawReply: string,
    assistantMessageId?: number,
  ) => {
    const activeTurn = activeTurnRef.current;
    if (activeTurn) {
      activeTurn.assistantReplyLocked = true;
      if (assistantMessageId !== undefined) {
        activeTurn.assistantMessageId = assistantMessageId;
      }
    }
    variableTraceLogger.log('[useVariableChangeTracker] 记录主回复中的变量声明', {
      turnId: activeTurn?.turnId ?? null,
      assistantMessageId: assistantMessageId ?? null,
      rawReplyLength: rawReply.length,
    });
    refreshDeclaredChanges('assistant-reply', rawReply, assistantMessageId);
    captureSignal({
      kind: 'boundary',
      producer: 'message-boundary',
      assistantMessageId,
    });
  }, [captureSignal, refreshDeclaredChanges]);

  const handleVariableExtraDeclaredBlocks = useCallback((
    blocksText: string,
    assistantMessageId?: number,
  ) => {
    const activeTurn = activeTurnRef.current;
    if (assistantMessageId !== undefined && activeTurn) {
      activeTurn.assistantMessageId = assistantMessageId;
    }
    variableTraceLogger.log('[useVariableChangeTracker] 记录额外变量中的 AI 声明', {
      turnId: activeTurn?.turnId ?? null,
      assistantMessageId: assistantMessageId ?? null,
      blocksLength: blocksText.length,
    });
    refreshDeclaredChanges('extra-blocks', blocksText, assistantMessageId);
  }, [refreshDeclaredChanges]);

  const handleVariableMessageBoundary = useCallback((messageId?: number) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) {
      return;
    }

    const resolved = messageId !== undefined
      ? readAssistantMessageContentById(messageId)
      : readLatestAssistantMessageContent();
    const finalMessage = resolved.content.trim()
      ? resolved
      : readLatestAssistantMessageContent();
    variableTraceLogger.log('[useVariableChangeTracker] 处理消息边界回读', {
      turnId: activeTurn.turnId,
      requestedMessageId: messageId ?? null,
      resolvedMessageId: resolved.messageId ?? null,
      finalMessageId: finalMessage.messageId ?? null,
      assistantReplyLocked: activeTurn.assistantReplyLocked,
      finalMessageLength: finalMessage.content.length,
    });
    if (finalMessage.messageId !== undefined) {
      activeTurn.assistantMessageId = finalMessage.messageId;
    }
    if (!hasFrozenDeclaredSources(activeTurn) && finalMessage.content.trim()) {
      refreshDeclaredChanges('assistant-reply', finalMessage.content, finalMessage.messageId);
    }
    captureSignal({
      kind: 'boundary',
      producer: 'message-boundary',
      assistantMessageId: finalMessage.messageId,
    });
  }, [captureSignal, refreshDeclaredChanges]);

  const handleEraWriteDone = useCallback((unknownDetail?: unknown) => {
    const detail = isRecord(unknownDetail) ? unknownDetail as WriteDoneLikeDetail : undefined;
    captureSignal({ kind: 'era', producer: 'era', detail });
  }, [captureSignal]);

  const handleDirectVariableWriteDone = useCallback((unknownDetail?: unknown) => {
    const detail = isRecord(unknownDetail)
      ? unknownDetail as unknown as DirectVariableWriteDoneDetail
      : undefined;
    const producer = isDirectVariableWriteSource(detail?.source) ? detail.source : 'frontend';
    captureSignal({ kind: 'direct', producer, detail });
  }, [captureSignal]);

  const handleEraVariableWriteDone = useCallback((unknownDetail?: unknown) => {
    const detail = isRecord(unknownDetail)
      ? unknownDetail as unknown as EraVariableWriteDoneDetail
      : undefined;
    const producer = isDirectVariableWriteSource(detail?.source) ? detail.source : 'frontend';
    captureSignal({ kind: 'sourced-era', producer, detail });
  }, [captureSignal]);

  const clearVariableChanges = useCallback(() => {
    variableTraceLogger.log('[useVariableChangeTracker] 清空当前变量追踪回合');
    activeTurnRef.current = null;
    commitSummary(null);
  }, [commitSummary]);

  useEffect(() => {
    if (!restoredTurn) {
      return;
    }
    const refreshTimer = window.setTimeout(() => {
      handleVariableMessageBoundary(restoredTurn.summary.assistantMessageId);
    }, 100);
    return () => window.clearTimeout(refreshTimer);
  }, [handleVariableMessageBoundary, restoredTurn]);

  return {
    variableChanges,
    handleVariableTurnStart,
    handleGlobalMessageSent,
    handleVariableAssistantReply,
    handleVariableExtraDeclaredBlocks,
    handleVariableMessageBoundary,
    handleEraWriteDone,
    handleDirectVariableWriteDone,
    handleEraVariableWriteDone,
    markVariableApiWriteAsAi,
    clearVariableChanges,
  };
}

export type { VariableChangeSummary };
