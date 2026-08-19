import React from 'react';
import type { GameEvent } from '../types';
import { getEventTimeLabel } from '../utils/eventPresentation';

export function formatRemainingDays(remainingDays: number): string {
  return remainingDays <= 0 ? '今日之内' : `剩 ${remainingDays} 日`;
}

interface EventMetaProps {
  event: GameEvent;
  currentLocation?: string;
  onTravelTo?: (location: string) => void;
}

/** 事件详情中复用的时间、地点、倒计时与人物信息。 */
export const EventMeta: React.FC<EventMetaProps> = ({ event, currentLocation, onTravelTo }) => {
  const { timeText, location, remainingDays, involvedCharacters } = event;
  const canTravel = Boolean(onTravelTo && location && location !== currentLocation);
  if (!timeText && !location && remainingDays === undefined && !involvedCharacters?.length) return null;

  return (
    <span className="event-meta-row">
      {remainingDays !== undefined && (
        <span className={`event-meta-badge event-meta-badge--countdown${remainingDays <= 3 ? ' urgent' : ''}`}>
          {formatRemainingDays(remainingDays)}
        </span>
      )}
      {timeText && <span className="event-meta-badge">{getEventTimeLabel(event)} {timeText}</span>}
      {location &&
        (canTravel ? (
          <button
            type="button"
            className="event-meta-badge event-meta-badge--travel"
            title={`设置移动目标：${location}`}
            onClick={() => onTravelTo?.(location)}
          >
            {location}
            <span className="event-travel-hint">前往 ›</span>
          </button>
        ) : (
          <span className="event-meta-badge">{location}</span>
        ))}
      {involvedCharacters && involvedCharacters.length > 0 && (
        <span className="event-meta-badge event-meta-badge--people">卷入：{involvedCharacters.join('、')}</span>
      )}
    </span>
  );
};

