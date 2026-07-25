'use strict';

export const ERA_DIAGNOSTICS_STORAGE_KEY = 'era_diagnostics_v1';

const ERA_DIAGNOSTICS_VERSION = 1;
const MAX_DIAGNOSTIC_ENTRIES = 600;
const DEFAULT_SLOW_THRESHOLD_MS = 5_000;
const DEFAULT_WATCHDOG_INTERVAL_MS = 15_000;
const MAX_DETAIL_DEPTH = 4;
const MAX_DETAIL_KEYS = 40;
const MAX_STRING_LENGTH = 1_000;

const runtimeId = `era-runtime-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
let sequence = 0;
let memoryEntries: EraDiagnosticEntry[] = [];
let persistedEntriesLoaded = false;
let activeTaskId: string | null = null;
const runtimeState: Record<string, unknown> = {};

export interface EraDiagnosticEntry {
  version: 1;
  sequence: number;
  timestamp: number;
  isoTime: string;
  runtimeId: string;
  source: string;
  event: string;
  correlationId?: string;
  elapsedMs?: number;
  details?: Record<string, unknown>;
}

export interface EraDiagnosticWatchdogOptions {
  source: string;
  event: string;
  correlationId?: string;
  details?: Record<string, unknown>;
  slowThresholdMs?: number;
  watchdogIntervalMs?: number;
}

export type EraDiagnosticWatchdogFinish = (
  outcome?: 'success' | 'error' | 'cancelled',
  details?: Record<string, unknown>,
) => void;

interface EraDiagnosticsApi {
  version: 1;
  runtimeId: string;
  read: () => EraDiagnosticEntry[];
  state: () => Record<string, unknown>;
  clear: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (
    value === null
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'undefined'
  ) {
    return value;
  }
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.slice(0, MAX_STRING_LENGTH),
    };
  }
  if (depth >= MAX_DETAIL_DEPTH) {
    return Array.isArray(value) ? `[Array(${value.length})]` : '[Object]';
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_DETAIL_KEYS).map(item => sanitizeValue(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_DETAIL_KEYS)
      .map(([key, item]) => [key, sanitizeValue(item, depth + 1, seen)]),
  );
}

function readPersistedEntries(): EraDiagnosticEntry[] {
  if (persistedEntriesLoaded) {
    return memoryEntries;
  }
  persistedEntriesLoaded = true;
  try {
    const raw = localStorage.getItem(ERA_DIAGNOSTICS_STORAGE_KEY);
    if (!raw) {
      return memoryEntries;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_DIAGNOSTIC_ENTRIES) : memoryEntries;
  } catch {
    return memoryEntries;
  }
}

function persistEntries(entries: EraDiagnosticEntry[]): void {
  memoryEntries = entries.slice(-MAX_DIAGNOSTIC_ENTRIES);
  try {
    localStorage.setItem(ERA_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(memoryEntries));
  } catch {
    // localStorage 不可用或超额时仍保留内存副本，避免诊断本身影响 ERA。
  }
}

export function createEraDiagnosticId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}-${Math.random().toString(36).slice(2, 7)}`;
}

export function setActiveEraDiagnosticTask(correlationId: string | null): void {
  activeTaskId = correlationId;
}

export function getActiveEraDiagnosticTask(): string | null {
  return activeTaskId;
}

export function updateEraDiagnosticState(key: string, value: unknown): void {
  runtimeState[key] = sanitizeValue(value);
}

export function readEraDiagnostics(): EraDiagnosticEntry[] {
  return [...readPersistedEntries()];
}

export function clearEraDiagnostics(): void {
  memoryEntries = [];
  persistedEntriesLoaded = true;
  try {
    localStorage.removeItem(ERA_DIAGNOSTICS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function recordEraDiagnostic(
  source: string,
  event: string,
  details: Record<string, unknown> = {},
  correlationId = activeTaskId ?? undefined,
): EraDiagnosticEntry {
  sequence += 1;
  const entry: EraDiagnosticEntry = {
    version: ERA_DIAGNOSTICS_VERSION,
    sequence,
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
    runtimeId,
    source,
    event,
    ...(correlationId ? { correlationId } : {}),
    details: sanitizeValue(details) as Record<string, unknown>,
  };
  persistEntries([...readPersistedEntries(), entry]);
  return entry;
}

export function startEraDiagnosticWatchdog({
  source,
  event,
  correlationId = activeTaskId ?? undefined,
  details = {},
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
  watchdogIntervalMs = DEFAULT_WATCHDOG_INTERVAL_MS,
}: EraDiagnosticWatchdogOptions): EraDiagnosticWatchdogFinish {
  const startedAt = Date.now();
  let finished = false;
  let watchdogTick = 0;

  recordEraDiagnostic(source, `${event}:started`, details, correlationId);

  const slowTimer = window.setTimeout(() => {
    if (finished) return;
    recordEraDiagnostic(
      source,
      `${event}:slow`,
      { ...details, elapsedMs: Date.now() - startedAt, slowThresholdMs },
      correlationId,
    );
  }, slowThresholdMs);

  const watchdogTimer = window.setInterval(() => {
    if (finished) return;
    watchdogTick += 1;
    recordEraDiagnostic(
      source,
      `${event}:watchdog`,
      {
        ...details,
        elapsedMs: Date.now() - startedAt,
        watchdogTick,
        runtimeState: { ...runtimeState },
      },
      correlationId,
    );
  }, watchdogIntervalMs);

  return (outcome = 'success', finishDetails = {}) => {
    if (finished) return;
    finished = true;
    window.clearTimeout(slowTimer);
    window.clearInterval(watchdogTimer);
    recordEraDiagnostic(
      source,
      `${event}:finished`,
      {
        ...details,
        ...finishDetails,
        outcome,
        elapsedMs: Date.now() - startedAt,
        watchdogTick,
      },
      correlationId,
    );
  };
}

function installDiagnosticsApi(): void {
  const api: EraDiagnosticsApi = {
    version: ERA_DIAGNOSTICS_VERSION,
    runtimeId,
    read: readEraDiagnostics,
    state: () => ({
      runtimeId,
      activeTaskId,
      ...runtimeState,
    }),
    clear: clearEraDiagnostics,
  };
  (window as Window & { ERADiagnostics?: EraDiagnosticsApi }).ERADiagnostics = api;
}

installDiagnosticsApi();
recordEraDiagnostic('runtime', 'started', { runtimeId });

export function recordEraDiagnosticError(
  source: string,
  event: string,
  error: unknown,
  details: Record<string, unknown> = {},
  correlationId = activeTaskId ?? undefined,
): EraDiagnosticEntry {
  return recordEraDiagnostic(
    source,
    event,
    {
      ...details,
      error: errorMessage(error),
      errorDetail: sanitizeValue(error),
    },
    correlationId,
  );
}
