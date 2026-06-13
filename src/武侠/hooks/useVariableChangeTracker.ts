import { useCallback, useRef, useState } from 'react';
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

export function useVariableChangeTracker() {
  const [variableChanges, setVariableChanges] = useState<VariableChangeSummary | null>(null);
  const activeTurnRef = useRef<ActiveVariableTurn | null>(null);
  const nextTurnIdRef = useRef(0);

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

    setVariableChanges(previous => {
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
  }, []);

  const handleVariableTurnStart = useCallback(() => {
    const turnId = nextTurnIdRef.current + 1;
    nextTurnIdRef.current = turnId;

    const baselineStatData = readCurrentStatDataSnapshot();
    activeTurnRef.current = {
      turnId,
      baselineStatData,
    };

    setVariableChanges(createEmptyVariableChangeSummary(
      turnId,
      baselineStatData ? 'tracking' : 'error',
    ));
  }, []);

  const handleVariableAssistantReply = useCallback((rawReply: string, assistantMessageId?: number) => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) {
      return;
    }

    const parsedChanges = parseDeclaredVariableChanges(rawReply);
    setVariableChanges(previous => {
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
  }, [refreshActualChanges]);

  const handleMvuVariableUpdate = useCallback((variables: unknown) => {
    refreshActualChanges(variables);
  }, [refreshActualChanges]);

  const handleEraWriteDone = useCallback((detail?: EraWriteDoneDetail) => {
    refreshActualChanges(detail?.statWithoutMeta ?? detail?.stat);
  }, [refreshActualChanges]);

  const clearVariableChanges = useCallback(() => {
    activeTurnRef.current = null;
    setVariableChanges(null);
  }, []);

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
