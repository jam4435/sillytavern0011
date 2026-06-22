import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildAiComparisons,
  collectVariableTopLevelGroups,
  createEmptyVariableChangeSummary,
  createObservedVariableChanges,
  getSnapshotHash,
  MAX_STORED_VARIABLE_CHANGES,
  parseDeclaredVariableChanges,
  readCurrentStatDataSnapshot,
  stableStringify,
  type VariableActualChange,
  type VariableChangeOrigin,
  type VariableChangeProducer,
  type VariableChangeSummary,
  type VariableObservedBatch,
  type VariableWriteActions,
} from '../utils/variableChanges';

type ActiveVariableTurn = {
  turnId: number;
  baselineStatData: Record<string, unknown> | null;
  lastStatData: Record<string, unknown> | null;
  userMessageId?: number;
  assistantMessageId?: number;
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
  version: 9;
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

const STORAGE_KEY = 'wuxia.variableChangeTurn.v9';
const LEGACY_STORAGE_KEYS = [
  'wuxia.variableChangeTurn.v1',
  'wuxia.variableChangeTurn.v2',
  'wuxia.variableChangeTurn.v3',
  'wuxia.variableChangeTurn.v4',
  'wuxia.variableChangeTurn.v5',
  'wuxia.variableChangeTurn.v6',
  'wuxia.variableChangeTurn.v7',
  'wuxia.variableChangeTurn.v8',
];
const STORED_TURN_TTL_MS = 30 * 60 * 1000;
const STALE_WRITE_DONE_RETRY_DELAY_MS = 40;
const STALE_WRITE_DONE_MAX_RETRIES = 8;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

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

    if (stored.version !== 9 || isExpired || isDifferentKnownChat) {
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
      version: 9,
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
  observed: VariableActualChange,
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
  observed: VariableActualChange,
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
  boundary: 0,
  era: 1,
  direct: 2,
};

const isBoundaryReason = (reason: string | null): boolean =>
  reason === 'message-boundary';

export function useVariableChangeTracker() {
  const restoredTurnRef = useRef<StoredVariableTurn | null | undefined>(undefined);
  if (restoredTurnRef.current === undefined) {
    restoredTurnRef.current = readStoredVariableTurn();
  }

  const restoredTurn = restoredTurnRef.current;
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
      aiWriteTargetIds: [],
      batchSequence: 0,
    };
    activeTurnRef.current = activeTurn;
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

    const batch = [...current.batches]
      .reverse()
      .find(candidate => candidate.nextSnapshotHash === nextSnapshotHash);
    if (!batch) {
      return false;
    }

    const shouldMoveToAi = metadata.origin === 'ai' && batch.origin !== 'ai';
    const shouldUpgradeProducer =
      PRODUCER_PRIORITY[metadata.producer] > PRODUCER_PRIORITY[batch.producer];
    const shouldImproveMetadata =
      shouldUpgradeProducer
      || (
        batch.producer === metadata.producer
        && isBoundaryReason(batch.reason)
        && !isBoundaryReason(metadata.reason)
      )
      || (batch.actions === null && metadata.actions !== null && metadata.actions !== undefined)
      || (batch.assistantMessageId === undefined && metadata.assistantMessageId !== undefined);
    if (!shouldMoveToAi && !shouldImproveMetadata) {
      return true;
    }

    mutateSummary(summary => {
      const batchBackgroundChanges = summary.background.observedChanges
        .filter(change => change.batchId === batch.batchId);
      const movedChanges = shouldMoveToAi
        ? batchBackgroundChanges.filter(change =>
          !metadata.aiOnlyDeclaredMatches
          || matchesAnyDeclaredChange(summary.aiReply.declaredChanges, change))
        : [];
      const movedChangeIds = new Set(movedChanges.map(change => change.id));
      const aiUpgradeBatchId = `${batch.batchId}:ai`;
      const upgradedAiChanges = movedChanges.map((change, index) => ({
        ...change,
        id: `${change.source}:${change.action}:${getPathKey(change)}:${aiUpgradeBatchId}:${index}`,
        batchId: aiUpgradeBatchId,
        origin: 'ai' as const,
        producer: metadata.producer,
        actions: metadata.actions ?? change.actions,
        reason: metadata.reason,
        assistantMessageId: metadata.assistantMessageId ?? change.assistantMessageId,
      }));
      const patchedAi = summary.aiReply.observedChanges.map(change =>
        change.batchId === batch.batchId && shouldImproveMetadata
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
      const remainingBatchChangeCount = batchBackgroundChanges.length - movedChanges.length;
      const nextBatches = summary.batches.flatMap(candidate => {
        if (candidate.batchId !== batch.batchId) {
          return [candidate];
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
          observedChanges: patchedBackground,
        },
        batches: nextBatches,
      };
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
      mutateSummary(summary => ({ ...summary, status: 'error', updatedAt: Date.now() }));
      return;
    }

    const nextSnapshotHash = getSnapshotHash(nextStatData);
    const previousSnapshotHash = activeTurn.lastStatData
      ? getSnapshotHash(activeTurn.lastStatData)
      : null;
    if (previousSnapshotHash === nextSnapshotHash) {
      upgradeMatchingBatch(nextSnapshotHash, metadata);
      activeTurn.lastStatData = nextStatData;
      persistVariableTurn(activeTurn, variableChangesRef.current);
      return;
    }

    activeTurn.batchSequence += 1;
    const baseBatchId = `${activeTurn.turnId}:${activeTurn.batchSequence}`;
    const result = createObservedVariableChanges(
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
    );
    activeTurn.lastStatData = nextStatData;

    if (!result.batch || result.observedChanges.length === 0) {
      persistVariableTurn(activeTurn, variableChangesRef.current);
      return;
    }

    const declaredChanges = current.aiReply.declaredChanges;
    const aiChanges: VariableActualChange[] = [];
    const backgroundChanges: VariableActualChange[] = [];
    for (const change of result.observedChanges) {
      const matchesDeclaration = matchesAnyDeclaredChange(declaredChanges, change);
      const matchedAsAi =
        metadata.origin === 'ai'
        && (!metadata.aiOnlyDeclaredMatches || matchesDeclaration);
      (matchedAsAi ? aiChanges : backgroundChanges).push(change);
    }

    const createBatch = (
      origin: VariableChangeOrigin,
      changes: VariableActualChange[],
      suffix: string,
    ): { batch: VariableObservedBatch; changes: VariableActualChange[] } | null => {
      if (changes.length === 0 || !result.batch) {
        return null;
      }
      const batchId = `${baseBatchId}:${suffix}`;
      return {
        batch: {
          ...result.batch,
          batchId,
          origin,
          changeCount: changes.length,
        },
        changes: changes.map((change, index) => ({
          ...change,
          id: `${change.source}:${change.action}:${getPathKey(change)}:${batchId}:${index}`,
          batchId,
          origin,
        })),
      };
    };

    const aiBatch = createBatch('ai', aiChanges, 'ai');
    const backgroundBatch = createBatch('background', backgroundChanges, 'background');
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
            + (metadata.origin === 'ai' ? result.omittedObservedCount : 0),
        },
        background: {
          ...summary.background,
          observedChanges: backgroundAppend.values,
          omittedObservedCount:
            summary.background.omittedObservedCount
            + backgroundAppend.omitted
            + (metadata.origin === 'background' ? result.omittedObservedCount : 0),
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
    const parsed = parseDeclaredVariableChanges(rawReply);
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
        thoughts: parsed.thoughts,
        parseErrors: parsed.parseErrors,
        aiReply: {
          ...summary.aiReply,
          declaredChanges: parsed.declaredChanges,
          omittedDeclaredCount: parsed.omittedDeclaredCount,
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

  const handleVariableAssistantReply = useCallback((
    rawReply: string,
    assistantMessageId?: number,
  ) => {
    refreshDeclaredChanges(rawReply, assistantMessageId);
    captureCurrentSnapshot({
      origin: 'background',
      producer: 'boundary',
      reason: 'message-boundary',
      assistantMessageId,
    });
  }, [captureCurrentSnapshot, refreshDeclaredChanges]);

  const handleVariableMessageBoundary = useCallback((messageId?: number) => {
    if (!activeTurnRef.current) {
      return;
    }

    const resolved = messageId !== undefined
      ? readAssistantMessageContentById(messageId)
      : readLatestAssistantMessageContent();
    const finalMessage = resolved.content.trim()
      ? resolved
      : readLatestAssistantMessageContent();
    if (finalMessage.content.trim()) {
      refreshDeclaredChanges(finalMessage.content, finalMessage.messageId);
    }
    captureCurrentSnapshot({
      origin: 'background',
      producer: 'boundary',
      reason: 'message-boundary',
      assistantMessageId: finalMessage.messageId,
    });
  }, [captureCurrentSnapshot, refreshDeclaredChanges]);

  const scheduleStaleWriteDoneRecovery = useCallback(({
    turnId,
    expectedSnapshotHash,
    metadata,
    refreshDeclaredAssistant,
  }: {
    turnId: number;
    expectedSnapshotHash: string | null;
    metadata: CaptureMetadata;
    refreshDeclaredAssistant?: boolean;
  }) => {
    if (!expectedSnapshotHash) {
      return;
    }

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

      if (refreshDeclaredAssistant && metadata.assistantMessageId !== undefined) {
        const finalMessage = readAssistantMessageContentById(metadata.assistantMessageId);
        if (finalMessage.content.trim()) {
          refreshDeclaredChanges(finalMessage.content, metadata.assistantMessageId);
        }
      }

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
  }, [captureCurrentSnapshot, refreshDeclaredChanges]);

  const markVariableApiWriteAsAi = useCallback((assistantMessageId: number) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn || !Number.isInteger(assistantMessageId)) {
      return;
    }
    activeTurn.assistantMessageId = assistantMessageId;
    if (!activeTurn.aiWriteTargetIds.includes(assistantMessageId)) {
      activeTurn.aiWriteTargetIds.push(assistantMessageId);
    }
    mutateSummary(summary => rebuildSummary(summary, activeTurn));
  }, [mutateSummary]);

  const handleWriteDoneSignal = useCallback((
    unknownDetail: unknown,
    producer: Extract<VariableChangeProducer, 'era' | 'direct'>,
  ) => {
    const detail = isRecord(unknownDetail) ? unknownDetail as WriteDoneLikeDetail : undefined;
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) {
      return;
    }

    const actions = normalizeWriteActions(detail?.actions);
    const assistantMessageId = normalizeMessageId(detail?.message_id);
    const isAiTarget = assistantMessageId !== undefined
      && activeTurn.aiWriteTargetIds.includes(assistantMessageId);
    const isDirectChatWrite = actions?.directChatWrite === true;
    const isAiWrite =
      producer === 'era'
      && !isDirectChatWrite
      && (
        actions?.apply === true
        || (actions?.apiWrite === true && isAiTarget)
        || ((actions?.rollback === true || actions?.resync === true) && isAiTarget)
      );
    const reason = typeof detail?.reason === 'string' && detail.reason.trim()
      ? detail.reason.trim()
      : producer === 'direct' ? 'direct-write-done' : 'era-write-done';
    const beforeCaptureSnapshotHash = activeTurn.lastStatData
      ? getSnapshotHash(activeTurn.lastStatData)
      : null;

    if (assistantMessageId !== undefined && isAiWrite) {
      activeTurn.assistantMessageId = assistantMessageId;
      const finalMessage = readAssistantMessageContentById(assistantMessageId);
      if (finalMessage.content.trim()) {
        refreshDeclaredChanges(finalMessage.content, assistantMessageId);
      }
    }

    // All signals reread chat stat_data as the canonical snapshot source.
    // writeDone payloads are attribution metadata only and must not enter diff/hash directly.
    captureCurrentSnapshot({
      origin: isAiWrite ? 'ai' : 'background',
      producer,
      reason,
      actions,
      assistantMessageId,
      aiOnlyDeclaredMatches: isAiWrite,
    });

    const afterCaptureSnapshotHash = activeTurn.lastStatData
      ? getSnapshotHash(activeTurn.lastStatData)
      : null;

    if (
      beforeCaptureSnapshotHash === afterCaptureSnapshotHash
      && (
        producer === 'era'
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
          producer,
          reason,
          actions,
          assistantMessageId,
          aiOnlyDeclaredMatches: isAiWrite,
        },
        refreshDeclaredAssistant: isAiWrite && assistantMessageId !== undefined,
      });
    }
  }, [captureCurrentSnapshot, refreshDeclaredChanges, scheduleStaleWriteDoneRecovery]);

  const handleEraWriteDone = useCallback((unknownDetail?: unknown) => {
    handleWriteDoneSignal(unknownDetail, 'era');
  }, [handleWriteDoneSignal]);

  const handleDirectVariableWriteDone = useCallback((unknownDetail?: unknown) => {
    handleWriteDoneSignal(unknownDetail, 'direct');
  }, [handleWriteDoneSignal]);

  const clearVariableChanges = useCallback(() => {
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
    handleVariableMessageBoundary,
    handleEraWriteDone,
    handleDirectVariableWriteDone,
    markVariableApiWriteAsAi,
    clearVariableChanges,
  };
}

export type { VariableChangeSummary };
