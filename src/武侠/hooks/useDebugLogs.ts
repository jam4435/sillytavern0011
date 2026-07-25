import { useCallback, useEffect, useState } from 'react';

const DEBUG_ROUND_STORAGE_KEY = 'wuxia_latest_debug_round';

export type DebugStageStatus = 'idle' | 'running' | 'success' | 'error';
export type ExtendedDebugStageStatus = DebugStageStatus | 'skipped';
export type DebugVariableApplyStatus =
  | 'idle'
  | 'waiting-write-done'
  | 'verifying'
  | 'success'
  | 'pending'
  | 'error';
export type DebugTrigger = '' | 'send' | 'regenerate';
export type DebugVariableModeSnapshot = '' | 'inline' | 'extra';
export type DebugVariablePhaseStatus = 'running' | 'success' | 'error';

export interface DebugVariablePhaseTiming {
  name: string;
  status: DebugVariablePhaseStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  durationMs: number;
  watchdogTickCount: number;
  error?: string;
}

export interface DebugStage {
  status: ExtendedDebugStageStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** 当前阶段发生的 HTTP 429 自动重试次数；自动化报告会原样返回。 */
  retry429Count?: number;
  /** 最近一次 HTTP 429 重试前的等待时长。 */
  retry429LastDelayMs?: number;
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
    /** ERA 原始写入和聊天变量快照回读的状态，不与模型输出阶段混用。 */
    applyStatus: DebugVariableApplyStatus;
    applyError: string;
    applyVerification: string;
    /** 事件结算、差分写入、补全等派生工作只用于诊断，不阻塞变量模型成功。 */
    postProcessStatus: ExtendedDebugStageStatus;
    postProcessError: string;
    /** 额外变量流水线的持久化分阶段耗时；iframe 重载后仍可从 snapshot 读取。 */
    phaseTimeline?: DebugVariablePhaseTiming[];
    currentPhase?: string;
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
      retry429Count: 0,
      retry429LastDelayMs: 0,
      userInput: '',
      combinedPrompt: '',
      output: '',
    },
    variable: {
      status: 'idle',
      retry429Count: 0,
      retry429LastDelayMs: 0,
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
      applyStatus: 'idle',
      applyError: '',
      applyVerification: '',
      postProcessStatus: 'idle',
      postProcessError: '',
      phaseTimeline: [],
      currentPhase: '',
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

function normalizeDebugVariableApplyStatus(value: unknown): DebugVariableApplyStatus {
  return value === 'waiting-write-done'
    || value === 'verifying'
    || value === 'success'
    || value === 'pending'
    || value === 'error'
    || value === 'idle'
    ? value
    : 'idle';
}

function normalizeDebugVariablePhaseTimeline(value: unknown): DebugVariablePhaseTiming[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const phase = item as Partial<DebugVariablePhaseTiming>;
    const name = normalizeString(phase.name);
    const startedAt = normalizeNumber(phase.startedAt);
    if (!name || startedAt === undefined) {
      return [];
    }
    const status: DebugVariablePhaseStatus =
      phase.status === 'success' || phase.status === 'error' ? phase.status : 'running';
    return [{
      name,
      status,
      startedAt,
      updatedAt: normalizeNumber(phase.updatedAt) ?? startedAt,
      finishedAt: normalizeNumber(phase.finishedAt),
      durationMs: normalizeNumber(phase.durationMs) ?? 0,
      watchdogTickCount: normalizeNumber(phase.watchdogTickCount) ?? 0,
      error: normalizeString(phase.error),
    }];
  });
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
      retry429Count: normalizeNumber(main.retry429Count) ?? 0,
      retry429LastDelayMs: normalizeNumber(main.retry429LastDelayMs) ?? 0,
      userInput: normalizeString(main.userInput),
      combinedPrompt: normalizeString(main.combinedPrompt),
      output: normalizeString(main.output),
    },
    variable: {
      status: normalizeDebugStageStatus(variable.status),
      startedAt: normalizeNumber(variable.startedAt),
      finishedAt: normalizeNumber(variable.finishedAt),
      error: normalizeString(variable.error),
      retry429Count: normalizeNumber(variable.retry429Count) ?? 0,
      retry429LastDelayMs: normalizeNumber(variable.retry429LastDelayMs) ?? 0,
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
      applyStatus: normalizeDebugVariableApplyStatus(variable.applyStatus),
      applyError: normalizeString(variable.applyError),
      applyVerification: normalizeString(variable.applyVerification),
      postProcessStatus: normalizeDebugStageStatus(variable.postProcessStatus),
      postProcessError: normalizeString(variable.postProcessError),
      phaseTimeline: normalizeDebugVariablePhaseTimeline(variable.phaseTimeline),
      currentPhase: normalizeString(variable.currentPhase),
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
        retry429Count: 0,
        retry429LastDelayMs: 0,
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
