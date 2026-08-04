export const WUXIA_EVENT_NOTIFICATION_API_VERSION = 1 as const;

export const WUXIA_EVENT_NOTIFICATION_GLOBAL_PREFIX = 'WuxiaEventNotification' as const;

export const WUXIA_EVENT_NOTIFICATION_EVENTS = {
  DISCOVER: 'wuxia:event-notification:discover',
  READY: 'wuxia:event-notification:ready',
  DISPOSED: 'wuxia:event-notification:disposed',
} as const;

export type EventNoticeLevel = 'info' | 'success' | 'warning' | 'error';

export type EventNoticeKind =
  | 'system-ready'
  | 'event-started'
  | 'debut-event-completed'
  | 'player-entered-event'
  | 'event-completed'
  | 'event-data-error';

export interface EventNotice {
  version: typeof WUXIA_EVENT_NOTIFICATION_API_VERSION;
  id: string;
  source: 'event-script';
  kind: EventNoticeKind;
  level: EventNoticeLevel;
  message: string;
  eventNames?: string[];
  durationMs?: number;
  createdAt: number;
}

export interface WuxiaEventNotificationAdapterRegistration {
  /** Omit for v1 callers; an explicit incompatible version is rejected. */
  version?: typeof WUXIA_EVENT_NOTIFICATION_API_VERSION;
  ownerId: string;
  mountedAt: number;
  show(notice: EventNotice): boolean;
}

export interface WuxiaEventNotificationApi {
  readonly version: typeof WUXIA_EVENT_NOTIFICATION_API_VERSION;
  registerAdapter(registration: WuxiaEventNotificationAdapterRegistration): () => void;
}

export interface WuxiaEventNotificationBridgeReady {
  version: typeof WUXIA_EVENT_NOTIFICATION_API_VERSION;
  bridgeId: string;
  globalName: string;
  startedAt: number;
}

export interface WuxiaEventNotificationBridgeDisposed {
  version: typeof WUXIA_EVENT_NOTIFICATION_API_VERSION;
  bridgeId: string;
  globalName: string;
}
