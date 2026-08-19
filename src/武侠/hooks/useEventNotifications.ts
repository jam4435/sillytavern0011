import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WUXIA_EVENT_NOTIFICATION_API_VERSION,
  WUXIA_EVENT_NOTIFICATION_EVENTS,
  type EventNotice,
  type WuxiaEventNotificationApi,
  type WuxiaEventNotificationBridgeDisposed,
  type WuxiaEventNotificationBridgeReady,
} from '../../shared/wuxiaEventNotifications';

const createInstanceId = (): string => {
  try {
    if (typeof crypto?.randomUUID === 'function') {
      return `wuxia-notice-ui-${crypto.randomUUID()}`;
    }
  } catch {
    // 使用时间戳回退；通知适配器只需要当前页面生命周期内唯一。
  }
  return `wuxia-notice-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isEventNotice = (value: unknown): value is EventNotice => {
  if (!value || typeof value !== 'object') return false;
  const notice = value as Partial<EventNotice>;
  return (
    notice.version === WUXIA_EVENT_NOTIFICATION_API_VERSION &&
    typeof notice.id === 'string' &&
    notice.source === 'event-script' &&
    typeof notice.kind === 'string' &&
    typeof notice.level === 'string' &&
    typeof notice.message === 'string' &&
    typeof notice.createdAt === 'number'
  );
};

export interface UseEventNotificationsResult {
  notifications: EventNotice[];
  dismissNotification: (noticeId: string) => void;
}

export function useEventNotifications(): UseEventNotificationsResult {
  const [notifications, setNotifications] = useState<EventNotice[]>([]);
  const activeRef = useRef(true);
  const ownerRef = useRef({ ownerId: createInstanceId(), mountedAt: Date.now() });

  const enqueueNotification = useCallback((notice: EventNotice): boolean => {
    if (!activeRef.current || !isEventNotice(notice)) return false;

    setNotifications(current => {
      if (current.some(item => item.id === notice.id)) return current;
      return [...current, notice];
    });
    return true;
  }, []);

  const dismissNotification = useCallback((noticeId: string) => {
    setNotifications(current => current.filter(notice => notice.id !== noticeId));
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const root = document.documentElement;
    let connectionSequence = 0;
    let latestBridgeStartedAt = Number.NEGATIVE_INFINITY;
    let currentBridgeId: string | null = null;
    let unregisterAdapter: (() => void) | null = null;

    const setConnectionStatus = (status: string, bridgeId?: string) => {
      root.dataset.wuxiaEventNotificationStatus = status;
      if (bridgeId) root.dataset.wuxiaEventNotificationBridge = bridgeId;
      else delete root.dataset.wuxiaEventNotificationBridge;
    };

    setConnectionStatus('discovering');

    const disconnect = () => {
      unregisterAdapter?.();
      unregisterAdapter = null;
      currentBridgeId = null;
    };

    const connect = async (detail: WuxiaEventNotificationBridgeReady) => {
      if (
        !detail ||
        detail.version !== WUXIA_EVENT_NOTIFICATION_API_VERSION ||
        typeof detail.bridgeId !== 'string' ||
        typeof detail.globalName !== 'string' ||
        typeof detail.startedAt !== 'number' ||
        detail.startedAt < latestBridgeStartedAt
      ) {
        return;
      }

      latestBridgeStartedAt = detail.startedAt;
      const sequence = ++connectionSequence;
      setConnectionStatus('connecting', detail.bridgeId);

      try {
        const initialized = await waitGlobalInitialized<WuxiaEventNotificationApi | undefined>(detail.globalName);
        const api = initialized ?? (globalThis as Record<string, unknown>)[detail.globalName];
        if (!activeRef.current || sequence !== connectionSequence) return;
        if (
          !api ||
          typeof api !== 'object' ||
          (api as WuxiaEventNotificationApi).version !== WUXIA_EVENT_NOTIFICATION_API_VERSION ||
          typeof (api as WuxiaEventNotificationApi).registerAdapter !== 'function'
        ) {
          setConnectionStatus('incompatible', detail.bridgeId);
          return;
        }

        disconnect();
        currentBridgeId = detail.bridgeId;
        unregisterAdapter = (api as WuxiaEventNotificationApi).registerAdapter({
          ...ownerRef.current,
          show: enqueueNotification,
        });
        setConnectionStatus('connected', detail.bridgeId);
      } catch (error) {
        if (!activeRef.current || sequence !== connectionSequence) return;
        setConnectionStatus('error', detail.bridgeId);
        console.warn('[武侠事件通知] 连接事件脚本通知桥失败，事件脚本将使用酒馆弹窗回退。', error);
      }
    };

    const readyListener = eventOn(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, detail => {
      void connect(detail as WuxiaEventNotificationBridgeReady);
    });
    const disposedListener = eventOn(WUXIA_EVENT_NOTIFICATION_EVENTS.DISPOSED, detail => {
      const disposed = detail as WuxiaEventNotificationBridgeDisposed;
      if (disposed?.bridgeId !== currentBridgeId) return;
      connectionSequence += 1;
      disconnect();
    });

    void eventEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.DISCOVER).catch(error => {
      console.warn('[武侠事件通知] 无法发现事件脚本通知桥。', error);
    });

    return () => {
      activeRef.current = false;
      connectionSequence += 1;
      readyListener.stop();
      disposedListener.stop();
      disconnect();
      delete root.dataset.wuxiaEventNotificationStatus;
      delete root.dataset.wuxiaEventNotificationBridge;
    };
  }, [enqueueNotification]);

  return { notifications, dismissNotification };
}
