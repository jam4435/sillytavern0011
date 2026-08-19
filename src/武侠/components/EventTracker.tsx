import React, { useEffect, useId, useMemo, useState } from 'react';
import type { GameEvent } from '../types';
import {
  getEventCountdownLabel,
  getEventSemanticLabel,
  getTrackerEvents,
  isEventUrgent,
} from '../utils/eventPresentation';
import { EventMeta } from './EventMeta';
import { Icons } from './Icons';

export const EVENT_TRACKER_COLLAPSED_STORAGE_KEY = 'wuxia_event_tracker_collapsed_v1';

export interface EventTrackerProps {
  events: GameEvent[];
  currentLocation?: string;
  onTravelTo?: (location: string) => void;
  onOpenAll: () => void;
}

function getInitialCollapsedState(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    const stored = window.localStorage.getItem(EVENT_TRACKER_COLLAPSED_STORAGE_KEY);
    if (stored === 'collapsed') return true;
    if (stored === 'expanded') return false;
  } catch {
    // 显示偏好不能影响聊天主流程。
  }

  // 事簿是聊天上的 HUD，不应在首次进入时遮挡叙事内容。
  // 窄屏和宽屏均从收起状态开始，之后仅遵从用户自己的显示偏好。
  return true;
}

function persistCollapsedState(isCollapsed: boolean): void {
  try {
    window.localStorage.setItem(EVENT_TRACKER_COLLAPSED_STORAGE_KEY, isCollapsed ? 'collapsed' : 'expanded');
  } catch {
    // 隐私模式或存储满时仅退回本次会话状态。
  }
}

const EventTracker: React.FC<EventTrackerProps> = ({ events, currentLocation, onTravelTo, onOpenAll }) => {
  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsedState);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const trackerBodyId = useId().replace(/:/g, '');
  const trackedEvents = useMemo(() => getTrackerEvents(events), [events]);
  const hiddenCount = Math.max(0, events.length - trackedEvents.length);

  useEffect(() => {
    setExpandedEventId(current => {
      if (current && trackedEvents.some(event => event.id === current)) return current;
      return trackedEvents[0]?.id ?? null;
    });
  }, [trackedEvents]);

  if (events.length === 0) return null;

  const toggleTracker = () => {
    setIsCollapsed(previous => {
      const next = !previous;
      persistCollapsedState(next);
      return next;
    });
  };

  return (
    <aside className={`event-tracker ${isCollapsed ? 'is-collapsed' : 'is-expanded'}`} aria-label="江湖事簿">
      <button
        type="button"
        className="event-tracker-heading"
        aria-label={isCollapsed ? '展开江湖事簿' : '收起江湖事簿'}
        aria-expanded={!isCollapsed}
        aria-controls={trackerBodyId}
        onClick={toggleTracker}
      >
        <span className="event-tracker-title-mark" aria-hidden="true"><Icons.Quest size={17} /></span>
        <span className="event-tracker-title">江湖事簿</span>
        <span className="event-tracker-count" aria-label={`共有 ${events.length} 件未结事件`}>{events.length}</span>
        <span className="event-tracker-chevron" aria-hidden="true">
          {isCollapsed ? <Icons.ChevronDown size={17} /> : <Icons.ChevronUp size={17} />}
        </span>
      </button>

      {!isCollapsed && (
        <div className="event-tracker-body" id={trackerBodyId}>
          <div className="event-tracker-list">
            {trackedEvents.map(event => {
              const isExpanded = expandedEventId === event.id;
              const detailId = `${trackerBodyId}-event-${event.id}`;
              const countdown = getEventCountdownLabel(event);
              return (
                <section
                  className={`event-tracker-entry ${isExpanded ? 'is-expanded' : ''}${isEventUrgent(event) ? ' is-urgent' : ''}`}
                  key={event.id}
                >
                  <button
                    type="button"
                    className="event-tracker-entry-heading"
                    aria-expanded={isExpanded}
                    aria-controls={detailId}
                    onClick={() => setExpandedEventId(current => (current === event.id ? null : event.id))}
                  >
                    <span className="event-tracker-entry-kicker">【{getEventSemanticLabel(event)}】</span>
                    <span className="event-tracker-entry-title">{event.title}</span>
                    {countdown && <span className="event-tracker-entry-countdown">{countdown}</span>}
                  </button>

                  {isExpanded && (
                    <div className="event-tracker-entry-detail" id={detailId}>
                      {event.description && <p>{event.description}</p>}
                      {event.details && (
                        <div className="event-tracker-outcome">
                          <span>结局走向</span>
                          <strong>{event.details}</strong>
                        </div>
                      )}
                      <EventMeta event={event} currentLocation={currentLocation} onTravelTo={onTravelTo} />
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="event-tracker-footer">
            {hiddenCount > 0 && <span>另有 {hiddenCount} 件待阅</span>}
            <button type="button" onClick={onOpenAll} data-wuxia-automation="open-events-panel">
              查看全部 <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

export default EventTracker;
