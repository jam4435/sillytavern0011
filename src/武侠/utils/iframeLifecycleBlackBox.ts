export const IFRAME_LIFECYCLE_BLACK_BOX_STORAGE_KEY = 'wuxia_iframe_lifecycle_black_box_v1';
export const IFRAME_PENDING_RELOAD_REASON_STORAGE_KEY = 'wuxia_iframe_pending_reload_reason_v1';

const MAX_BLACK_BOX_ENTRIES = 240;
const PENDING_RELOAD_REASON_MAX_AGE_MS = 30_000;

export interface IframeLifecycleBlackBoxEntry {
  id: string;
  timestamp: number;
  source: string;
  event: string;
  runtimeId?: string;
  details?: Record<string, unknown>;
}

export interface PendingIframeReloadReason {
  id: string;
  timestamp: number;
  source: string;
  reason: string;
  details?: Record<string, unknown>;
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  try {
    return JSON.parse(JSON.stringify(details)) as Record<string, unknown>;
  } catch {
    return { serializationError: 'details 无法序列化' };
  }
}

export function readIframeLifecycleBlackBox(): IframeLifecycleBlackBoxEntry[] {
  try {
    const stored = localStorage.getItem(IFRAME_LIFECYCLE_BLACK_BOX_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed.filter(entry => entry && typeof entry === 'object') as IframeLifecycleBlackBoxEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordIframeLifecycleEvent(
  source: string,
  event: string,
  details?: Record<string, unknown>,
  runtimeId?: string,
): IframeLifecycleBlackBoxEntry | null {
  try {
    const entry: IframeLifecycleBlackBoxEntry = {
      id: createEntryId('event'),
      timestamp: Date.now(),
      source,
      event,
      ...(runtimeId ? { runtimeId } : {}),
      ...(details ? { details: cloneDetails(details) } : {}),
    };
    const entries = [...readIframeLifecycleBlackBox(), entry].slice(-MAX_BLACK_BOX_ENTRIES);
    localStorage.setItem(IFRAME_LIFECYCLE_BLACK_BOX_STORAGE_KEY, JSON.stringify(entries));
    return entry;
  } catch {
    return null;
  }
}

export function markPendingIframeReloadReason(
  source: string,
  reason: string,
  details?: Record<string, unknown>,
): PendingIframeReloadReason | null {
  try {
    const marker: PendingIframeReloadReason = {
      id: createEntryId('reload'),
      timestamp: Date.now(),
      source,
      reason,
      ...(details ? { details: cloneDetails(details) } : {}),
    };
    localStorage.setItem(IFRAME_PENDING_RELOAD_REASON_STORAGE_KEY, JSON.stringify(marker));
    recordIframeLifecycleEvent(source, 'iframe-reload-requested', { markerId: marker.id, reason, ...details });
    return marker;
  } catch {
    return null;
  }
}

export function readPendingIframeReloadReason(): PendingIframeReloadReason | null {
  try {
    const stored = localStorage.getItem(IFRAME_PENDING_RELOAD_REASON_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<PendingIframeReloadReason>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.timestamp !== 'number' ||
      typeof parsed.source !== 'string' ||
      typeof parsed.reason !== 'string'
    ) {
      return null;
    }
    if (Date.now() - parsed.timestamp > PENDING_RELOAD_REASON_MAX_AGE_MS) {
      localStorage.removeItem(IFRAME_PENDING_RELOAD_REASON_STORAGE_KEY);
      return null;
    }
    return parsed as PendingIframeReloadReason;
  } catch {
    return null;
  }
}

export function clearPendingIframeReloadReason(markerId?: string): void {
  try {
    if (markerId) {
      const current = readPendingIframeReloadReason();
      if (current && current.id !== markerId) return;
    }
    localStorage.removeItem(IFRAME_PENDING_RELOAD_REASON_STORAGE_KEY);
  } catch {
    // 生命周期诊断不得影响游戏主流程。
  }
}
