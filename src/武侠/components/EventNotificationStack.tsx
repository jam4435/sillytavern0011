import { AlertTriangle, CheckCircle2, Info, MapPin, ScrollText, Sparkles, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EventNotice, EventNoticeKind } from '../../shared/wuxiaEventNotifications';

const MAX_VISIBLE_NOTIFICATIONS = 5;
const DEFAULT_DURATION_MS = 5_000;
const EXIT_DURATION_MS = 220;

const NOTICE_TITLES: Record<EventNoticeKind, string> = {
  'system-ready': '江湖脉络已定',
  'event-started': '风云忽起',
  'debut-event-completed': '侠影入世',
  'player-entered-event': '身入局中',
  'event-completed': '尘埃落定',
  'event-data-error': '卷宗有误',
};

const renderNoticeIcon = (notice: EventNotice) => {
  switch (notice.kind) {
    case 'system-ready':
      return <Sparkles size={18} aria-hidden="true" />;
    case 'event-started':
      return <ScrollText size={18} aria-hidden="true" />;
    case 'player-entered-event':
      return <MapPin size={18} aria-hidden="true" />;
    case 'debut-event-completed':
    case 'event-completed':
      return <CheckCircle2 size={18} aria-hidden="true" />;
    case 'event-data-error':
      return <AlertTriangle size={18} aria-hidden="true" />;
    default:
      return <Info size={18} aria-hidden="true" />;
  }
};

interface EventNotificationCardProps {
  notice: EventNotice;
  onDismiss: (noticeId: string) => void;
}

const EventNotificationCard: React.FC<EventNotificationCardProps> = ({ notice, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationMs = notice.durationMs ?? DEFAULT_DURATION_MS;

  const dismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    exitTimerRef.current = setTimeout(() => onDismiss(notice.id), EXIT_DURATION_MS);
  }, [isExiting, notice.id, onDismiss]);

  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = setTimeout(dismiss, durationMs);
    return () => clearTimeout(timer);
  }, [dismiss, durationMs]);

  useEffect(
    () => () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    },
    [],
  );

  const urgent = notice.level === 'warning' || notice.level === 'error';
  const style = durationMs > 0 ? ({ '--event-notice-duration': `${durationMs}ms` } as React.CSSProperties) : undefined;

  return (
    <article
      className={`event-notification-card ${notice.level} ${isExiting ? 'is-exiting' : ''}`}
      style={style}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <span className="event-notification-rail" aria-hidden="true" />
      <div className="event-notification-emblem">{renderNoticeIcon(notice)}</div>
      <div className="event-notification-copy">
        <div className="event-notification-heading">
          <span className="event-notification-title">{NOTICE_TITLES[notice.kind]}</span>
          {notice.eventNames && notice.eventNames.length > 1 && (
            <span className="event-notification-count">{notice.eventNames.length} 件</span>
          )}
        </div>
        <p className="event-notification-message">{notice.message}</p>
      </div>
      <button className="event-notification-close" type="button" onClick={dismiss} aria-label="关闭事件通知">
        <X size={14} aria-hidden="true" />
      </button>
      {durationMs > 0 && <span className="event-notification-progress" aria-hidden="true" />}
    </article>
  );
};

export interface EventNotificationStackProps {
  notifications: EventNotice[];
  onDismiss: (noticeId: string) => void;
}

const EventNotificationStack: React.FC<EventNotificationStackProps> = ({ notifications, onDismiss }) => {
  const visibleNotifications = notifications.slice(0, MAX_VISIBLE_NOTIFICATIONS);
  if (visibleNotifications.length === 0) return null;

  return (
    <aside className="event-notification-stack" aria-label="江湖事件通知">
      {visibleNotifications.map(notice => (
        <EventNotificationCard key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </aside>
  );
};

export default EventNotificationStack;

export { DEFAULT_DURATION_MS, MAX_VISIBLE_NOTIFICATIONS };
