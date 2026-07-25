export const IFRAME_LIFECYCLE_BLACK_BOX_STORAGE_KEY = 'wuxia_iframe_lifecycle_black_box_v1';
export const IFRAME_PENDING_RELOAD_REASON_STORAGE_KEY = 'wuxia_iframe_pending_reload_reason_v1';
export const IFRAME_LIFECYCLE_FORWARD_EVENT = 'wuxia:iframe-lifecycle-forward';

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

export interface ForwardedIframeLifecycleEvent {
  version: 1;
  id: string;
  timestamp: number;
  source: string;
  event: string;
  runtimeId?: string;
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

function appendIframeLifecycleEntry(entry: IframeLifecycleBlackBoxEntry): IframeLifecycleBlackBoxEntry | null {
  try {
    const entries = readIframeLifecycleBlackBox();
    const existing = entries.find(candidate => candidate.id === entry.id);
    if (existing) return existing;
    localStorage.setItem(
      IFRAME_LIFECYCLE_BLACK_BOX_STORAGE_KEY,
      JSON.stringify([...entries, entry].slice(-MAX_BLACK_BOX_ENTRIES)),
    );
    return entry;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
    return appendIframeLifecycleEntry(entry);
  } catch {
    return null;
  }
}

/**
 * 供运行在独立酒馆脚本上下文中的桥使用。桥不直接写自己的 localStorage，而是把带有
 * 原始时间戳的事件送到游戏 iframe，由后者统一写入快照可见的黑盒。
 */
export function forwardIframeLifecycleEvent(
  source: string,
  event: string,
  details?: Record<string, unknown>,
  runtimeId?: string,
): string {
  const payload: ForwardedIframeLifecycleEvent = {
    version: 1,
    id: createEntryId('forwarded-event'),
    timestamp: Date.now(),
    source,
    event,
    ...(runtimeId ? { runtimeId } : {}),
    ...(details ? { details: cloneDetails(details) } : {}),
  };
  try {
    void eventEmit(IFRAME_LIFECYCLE_FORWARD_EVENT, payload).catch(error => {
      console.warn('[wuxia-lifecycle] 转发生命周期事件失败。', error);
    });
  } catch (error) {
    console.warn('[wuxia-lifecycle] 无法发送生命周期转发事件。', error);
  }
  return payload.id;
}

export function installIframeLifecycleEventForwarder(): { stop: () => void } {
  const registration = eventOn(IFRAME_LIFECYCLE_FORWARD_EVENT, (unknownPayload: unknown) => {
    if (!isRecord(unknownPayload)) return;
    if (
      unknownPayload.version !== 1 ||
      typeof unknownPayload.id !== 'string' ||
      typeof unknownPayload.timestamp !== 'number' ||
      typeof unknownPayload.source !== 'string' ||
      typeof unknownPayload.event !== 'string'
    ) {
      return;
    }

    const receivedAt = Date.now();
    const forwardedDetails = isRecord(unknownPayload.details) ? cloneDetails(unknownPayload.details) : undefined;
    appendIframeLifecycleEntry({
      id: unknownPayload.id,
      timestamp: unknownPayload.timestamp,
      source: unknownPayload.source,
      event: unknownPayload.event,
      ...(typeof unknownPayload.runtimeId === 'string' ? { runtimeId: unknownPayload.runtimeId } : {}),
      details: {
        ...(forwardedDetails ?? {}),
        lifecycleTransport: 'tavern-event-bus',
        lifecycleForwardReceivedAt: receivedAt,
        lifecycleForwardDelayMs: Math.max(0, receivedAt - unknownPayload.timestamp),
      },
    });
  });
  return { stop: () => registration.stop() };
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
