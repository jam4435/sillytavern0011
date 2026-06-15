import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collectVariableTopLevelGroups,
  createActualVariableChanges,
  createEmptyVariableChangeSummary,
  parseDeclaredVariableChanges,
  readCurrentStatDataSnapshot,
  readStatDataSnapshotFromUnknown,
  type VariableChangeSummary,
} from '../utils/variableChanges';

type ActiveVariableTurn = {
  turnId: number;
  baselineStatData: Record<string, unknown> | null;
};

type EraWriteDoneDetail = {
  message_id?: number;
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
  version: 1;
  chatId: string;
  savedAt: number;
  activeTurn: ActiveVariableTurn;
  summary: VariableChangeSummary;
};

const STORAGE_KEY = 'wuxia.variableChangeTurn.v1';
const STORED_TURN_TTL_MS = 30 * 60 * 1000;

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
    const rawStored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawStored) {
      return null;
    }

    const stored = JSON.parse(rawStored) as StoredVariableTurn;
    const isExpired = Date.now() - Number(stored.savedAt || 0) > STORED_TURN_TTL_MS;
    const currentChatId = getCurrentChatStorageId();
    const isDifferentKnownChat =
      stored.chatId !== 'unknown'
      && currentChatId !== 'unknown'
      && stored.chatId !== currentChatId;

    if (stored.version !== 1 || isExpired || isDifferentKnownChat) {
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
      version: 1,
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

function getActiveMessageContent(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return message.message || message.mes || swipes[swipeIndex] || swipes[0] || '';
}

type ResolvedAssistantMessageContent = {
  messageId?: number;
  content: string;
};

function readAssistantMessageContentById(messageId: number): ResolvedAssistantMessageContent {
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
}

function readLatestAssistantMessageContent(): ResolvedAssistantMessageContent {
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

    return { content: '' };
  } catch {
    return { content: '' };
  }
}

function readAssistantMessageContent(
  messageId: unknown,
  fallbackMessageId?: unknown,
): ResolvedAssistantMessageContent {
  const candidateIds = [messageId, fallbackMessageId]
    .filter((id): id is number => Number.isInteger(id))
    .map(id => Number(id));
  const uniqueCandidateIds = Array.from(new Set(candidateIds));

  for (const candidateId of uniqueCandidateIds) {
    const resolved = readAssistantMessageContentById(candidateId);
    if (resolved.content.trim()) {
      return resolved;
    }
  }

  return readLatestAssistantMessageContent();
}

function normalizeAssistantMessageId(messageId: unknown): number | undefined {
  if (!Number.isInteger(messageId)) {
    return undefined;
  }
  return Number(messageId);
}

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

  const updateVariableChanges = useCallback((
    updater: VariableChangeSummary | null | ((previous: VariableChangeSummary | null) => VariableChangeSummary | null),
  ) => {
    setVariableChanges(previous => {
      const next = typeof updater === 'function'
        ? (updater as (previous: VariableChangeSummary | null) => VariableChangeSummary | null)(previous)
        : updater;
      variableChangesRef.current = next;
      persistVariableTurn(activeTurnRef.current, next);
      return next;
    });
  }, []);

  const refreshActualChanges = useCallback((nextData?: unknown) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) {
      return;
    }

    const nextStatData = nextData === undefined
      ? readCurrentStatDataSnapshot()
      : readStatDataSnapshotFromUnknown(nextData) || readCurrentStatDataSnapshot();
    const { actualChanges, omittedActualCount } = createActualVariableChanges(
      activeTurn.baselineStatData,
      nextStatData,
    );

    updateVariableChanges(previous => {
      if (!previous || previous.turnId !== activeTurn.turnId) {
        return previous;
      }

      const hasComparableData = Boolean(activeTurn.baselineStatData && nextStatData);
      return {
        ...previous,
        status: hasComparableData
          ? previous.status === 'tracking' ? 'tracking' : 'settled'
          : 'error',
        updatedAt: Date.now(),
        actualChanges,
        omittedActualCount,
        topLevelGroups: collectVariableTopLevelGroups(previous.declaredChanges, actualChanges),
      };
    });
  }, [updateVariableChanges]);

  const refreshDeclaredChanges = useCallback((rawReply: string, assistantMessageId?: number) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn || !rawReply.trim()) {
      return;
    }

    const parsedChanges = parseDeclaredVariableChanges(rawReply);
    updateVariableChanges(previous => {
      if (!previous || previous.turnId !== activeTurn.turnId) {
        return previous;
      }

      const nextStatus = activeTurn.baselineStatData
        ? previous.status === 'settled' ? 'settled' : 'reply-recorded'
        : 'error';

      return {
        ...previous,
        status: nextStatus,
        assistantMessageId: assistantMessageId ?? previous.assistantMessageId,
        updatedAt: Date.now(),
        declaredChanges: parsedChanges.declaredChanges,
        thoughts: parsedChanges.thoughts,
        parseErrors: parsedChanges.parseErrors,
        omittedDeclaredCount: parsedChanges.omittedDeclaredCount,
        topLevelGroups: collectVariableTopLevelGroups(
          parsedChanges.declaredChanges,
          previous.actualChanges,
        ),
      };
    });
  }, [updateVariableChanges]);

  const handleVariableTurnStart = useCallback(() => {
    const turnId = nextTurnIdRef.current + 1;
    nextTurnIdRef.current = turnId;

    const baselineStatData = readCurrentStatDataSnapshot();
    activeTurnRef.current = {
      turnId,
      baselineStatData,
    };

    updateVariableChanges(createEmptyVariableChangeSummary(
      turnId,
      baselineStatData ? 'tracking' : 'error',
    ));
  }, [updateVariableChanges]);

  const handleVariableAssistantReply = useCallback((rawReply: string, assistantMessageId?: number) => {
    refreshDeclaredChanges(rawReply, assistantMessageId);
    refreshActualChanges();
  }, [refreshActualChanges, refreshDeclaredChanges]);

  const handleMvuVariableUpdate = useCallback((variables: unknown) => {
    refreshActualChanges(variables);
  }, [refreshActualChanges]);

  const handleEraWriteDone = useCallback((detail?: EraWriteDoneDetail) => {
    const finalMessage = readAssistantMessageContent(
      detail?.message_id,
      variableChangesRef.current?.assistantMessageId,
    );
    if (finalMessage.content) {
      refreshDeclaredChanges(
        finalMessage.content,
        normalizeAssistantMessageId(detail?.message_id) ?? finalMessage.messageId,
      );
    }
    refreshActualChanges(detail?.statWithoutMeta ?? detail?.stat);
  }, [refreshActualChanges, refreshDeclaredChanges]);

  const clearVariableChanges = useCallback(() => {
    activeTurnRef.current = null;
    updateVariableChanges(null);
  }, [updateVariableChanges]);

  useEffect(() => {
    if (!restoredTurn) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      refreshActualChanges();
    }, 100);
    return () => window.clearTimeout(refreshTimer);
  }, [refreshActualChanges, restoredTurn]);

  return {
    variableChanges,
    handleVariableTurnStart,
    handleVariableAssistantReply,
    handleMvuVariableUpdate,
    handleEraWriteDone,
    clearVariableChanges,
  };
}

export type { VariableChangeSummary };
