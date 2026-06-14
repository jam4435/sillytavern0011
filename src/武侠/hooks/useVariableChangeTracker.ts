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
  stat?: unknown;
  statWithoutMeta?: unknown;
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
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) {
      return;
    }

    const parsedChanges = parseDeclaredVariableChanges(rawReply);
    updateVariableChanges(previous => {
      if (!previous || previous.turnId !== activeTurn.turnId) {
        return previous;
      }

      return {
        ...previous,
        status: activeTurn.baselineStatData ? 'reply-recorded' : 'error',
        assistantMessageId,
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
    refreshActualChanges();
  }, [refreshActualChanges, updateVariableChanges]);

  const hydrateVariableAssistantReply = useCallback((rawReply: string, assistantMessageId?: number) => {
    if (!rawReply.trim() || variableChangesRef.current) {
      return;
    }

    const turnId = nextTurnIdRef.current + 1;
    nextTurnIdRef.current = turnId;
    activeTurnRef.current = null;

    const parsedChanges = parseDeclaredVariableChanges(rawReply);
    updateVariableChanges({
      ...createEmptyVariableChangeSummary(turnId, 'error'),
      assistantMessageId,
      updatedAt: Date.now(),
      declaredChanges: parsedChanges.declaredChanges,
      thoughts: parsedChanges.thoughts,
      parseErrors: parsedChanges.parseErrors,
      omittedDeclaredCount: parsedChanges.omittedDeclaredCount,
      topLevelGroups: collectVariableTopLevelGroups(parsedChanges.declaredChanges, []),
    });
  }, [updateVariableChanges]);

  const handleMvuVariableUpdate = useCallback((variables: unknown) => {
    refreshActualChanges(variables);
  }, [refreshActualChanges]);

  const handleEraWriteDone = useCallback((detail?: EraWriteDoneDetail) => {
    refreshActualChanges(detail?.statWithoutMeta ?? detail?.stat);
  }, [refreshActualChanges]);

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
    hydrateVariableAssistantReply,
    handleMvuVariableUpdate,
    handleEraWriteDone,
    clearVariableChanges,
  };
}

export type { VariableChangeSummary };
