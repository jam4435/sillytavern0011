import { useCallback, useEffect, useState } from 'react';

const DEBUG_ROUND_STORAGE_KEY = 'wuxia_latest_debug_round';

export type DebugStageStatus = 'idle' | 'running' | 'success' | 'error';
export type ExtendedDebugStageStatus = DebugStageStatus | 'skipped';
export type DebugTrigger = '' | 'send' | 'regenerate';
export type DebugVariableModeSnapshot = '' | 'inline' | 'extra';

export interface DebugStage {
  status: ExtendedDebugStageStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface LatestDebugRound {
  id: string;
  startedAt: number;
  updatedAt: number;
  main: DebugStage & {
    userInput: string;
    combinedPrompt: string;
    output: string;
  };
  variable: DebugStage & {
    trigger: DebugTrigger;
    modeSnapshot: DebugVariableModeSnapshot;
    skipReason: string;
    input: string;
    output: string;
    appendedBlocks: string;
    finalMessageText: string;
    appendReadbackText: string;
    appendVerification: string;
    syncReadbackText: string;
    syncVerification: string;
  };
}

export type LatestDebugRoundPatch = Partial<{
  main: Partial<LatestDebugRound['main']>;
  variable: Partial<LatestDebugRound['variable']>;
}>;

function createEmptyDebugRound(): LatestDebugRound {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    startedAt: now,
    updatedAt: now,
    main: {
      status: 'idle',
      userInput: '',
      combinedPrompt: '',
      output: '',
    },
    variable: {
      status: 'idle',
      trigger: '',
      modeSnapshot: '',
      skipReason: '',
      input: '',
      output: '',
      appendedBlocks: '',
      finalMessageText: '',
      appendReadbackText: '',
      appendVerification: '',
      syncReadbackText: '',
      syncVerification: '',
    },
  };
}

function normalizeDebugStageStatus(value: unknown): ExtendedDebugStageStatus {
  return value === 'running' || value === 'success' || value === 'error' || value === 'idle' || value === 'skipped'
    ? value
    : 'idle';
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeDebugTrigger(value: unknown): DebugTrigger {
  return value === 'send' || value === 'regenerate' ? value : '';
}

function normalizeDebugVariableModeSnapshot(value: unknown): DebugVariableModeSnapshot {
  return value === 'inline' || value === 'extra' ? value : '';
}

function normalizeLoadedDebugRound(value: unknown): LatestDebugRound | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const source = value as Partial<LatestDebugRound>;
  const main =
    source.main && typeof source.main === 'object' && !Array.isArray(source.main)
      ? (source.main as Partial<LatestDebugRound['main']>)
      : {};
  const variable =
    source.variable && typeof source.variable === 'object' && !Array.isArray(source.variable)
      ? (source.variable as Partial<LatestDebugRound['variable']>)
      : {};
  const now = Date.now();

  return {
    id: normalizeString(source.id) || `${now}-loaded`,
    startedAt: normalizeNumber(source.startedAt) || now,
    updatedAt: normalizeNumber(source.updatedAt) || now,
    main: {
      status: normalizeDebugStageStatus(main.status),
      startedAt: normalizeNumber(main.startedAt),
      finishedAt: normalizeNumber(main.finishedAt),
      error: normalizeString(main.error),
      userInput: normalizeString(main.userInput),
      combinedPrompt: normalizeString(main.combinedPrompt),
      output: normalizeString(main.output),
    },
    variable: {
      status: normalizeDebugStageStatus(variable.status),
      startedAt: normalizeNumber(variable.startedAt),
      finishedAt: normalizeNumber(variable.finishedAt),
      error: normalizeString(variable.error),
      trigger: normalizeDebugTrigger(variable.trigger),
      modeSnapshot: normalizeDebugVariableModeSnapshot(variable.modeSnapshot),
      skipReason: normalizeString(variable.skipReason),
      input: normalizeString(variable.input),
      output: normalizeString(variable.output),
      appendedBlocks: normalizeString(variable.appendedBlocks),
      finalMessageText: normalizeString(variable.finalMessageText),
      appendReadbackText: normalizeString(variable.appendReadbackText),
      appendVerification: normalizeString(variable.appendVerification),
      syncReadbackText: normalizeString(variable.syncReadbackText),
      syncVerification: normalizeString(variable.syncVerification),
    },
  };
}

export function readLatestDebugRoundSnapshot(): LatestDebugRound | null {
  try {
    const stored = localStorage.getItem(DEBUG_ROUND_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    return normalizeLoadedDebugRound(JSON.parse(stored));
  } catch {
    return null;
  }
}

function saveLatestDebugRound(round: LatestDebugRound | null): void {
  try {
    if (!round) {
      localStorage.removeItem(DEBUG_ROUND_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DEBUG_ROUND_STORAGE_KEY, JSON.stringify(round));
  } catch {
    // 调试信息不应影响游戏主流程。
  }
}

export function useDebugLogs() {
  const [latestDebugRound, setLatestDebugRound] = useState<LatestDebugRound | null>(() =>
    readLatestDebugRoundSnapshot(),
  );

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== DEBUG_ROUND_STORAGE_KEY) {
        return;
      }
      if (!event.newValue) {
        setLatestDebugRound(null);
        return;
      }
      try {
        setLatestDebugRound(normalizeLoadedDebugRound(JSON.parse(event.newValue)));
      } catch {
        // 忽略其他 iframe 写入的无效调试数据。
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const beginDebugRound = useCallback((userInput: string): string => {
    const now = Date.now();
    const round: LatestDebugRound = {
      ...createEmptyDebugRound(),
      startedAt: now,
      updatedAt: now,
      main: {
        status: 'running',
        startedAt: now,
        userInput,
        combinedPrompt: '',
        output: '',
      },
    };
    setLatestDebugRound(round);
    saveLatestDebugRound(round);
    return round.id;
  }, []);

  const patchLatestDebugRound = useCallback((patch: LatestDebugRoundPatch) => {
    setLatestDebugRound(previous => {
      if (!previous) {
        return previous;
      }
      const stored = readLatestDebugRoundSnapshot();
      if (stored && stored.id !== previous.id && stored.updatedAt >= previous.updatedAt) {
        return stored;
      }
      const base = stored?.id === previous.id && stored.updatedAt > previous.updatedAt ? stored : previous;
      const next: LatestDebugRound = {
        ...base,
        updatedAt: Date.now(),
        main: {
          ...base.main,
          ...patch.main,
        },
        variable: {
          ...base.variable,
          ...patch.variable,
        },
      };
      saveLatestDebugRound(next);
      return next;
    });
  }, []);

  const clearDebugLogs = useCallback(() => {
    setLatestDebugRound(null);
    saveLatestDebugRound(null);
  }, []);

  return {
    latestDebugRound,
    beginDebugRound,
    patchLatestDebugRound,
    clearDebugLogs,
  };
}
