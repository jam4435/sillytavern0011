import type { GameEvent } from '../types';

const EVENT_TIME_PREFIX_PATTERN = /^\s*(?:时间[：:]\s*)?\d{1,4}年\d{1,2}月\d{1,2}日\d{1,2}时(?:\d{1,2}分)?\s*(?:到|至|[-—–→])\s*(?:(?:\d{1,4}年)?\d{1,2}月\d{1,2}日)?\s*\d{1,2}时(?:\d{1,2}分)?\s*[，,、。:：]\s*/;

export type EventSemanticCategory = 'participation' | 'world' | 'rumor' | 'aftermath';

export const EVENT_SEMANTIC_LABELS: Record<EventSemanticCategory, string> = {
  participation: '亲历',
  world: '江湖',
  rumor: '风闻',
  aftermath: '后续',
};

export function getEventSemanticCategory(event: GameEvent): EventSemanticCategory {
  if (event.type === 'RUMOR') return 'rumor';
  if (event.type === 'AFTERMATH') return 'aftermath';
  return event.category === 'world' ? 'world' : 'participation';
}

export function getEventSemanticLabel(event: GameEvent): string {
  return EVENT_SEMANTIC_LABELS[getEventSemanticCategory(event)];
}

export function getEventTimeLabel(event: GameEvent): string {
  return event.type === 'RUMOR' ? '事发时间' : '预计结束';
}

export function getEventDescription(event: GameEvent): string {
  return event.description.trim().replace(EVENT_TIME_PREFIX_PATTERN, '').trim();
}

export function getEventCountdownLabel(event: GameEvent): string | null {
  if (event.remainingDays !== undefined) {
    return event.remainingDays <= 0 ? '今日' : `${event.remainingDays}日`;
  }
  if (event.remainingTurns !== undefined) {
    return `余${event.remainingTurns}回`;
  }
  return null;
}

export function isEventUrgent(event: GameEvent): boolean {
  return Boolean(
    (event.remainingDays !== undefined && event.remainingDays <= 3)
    || (event.remainingTurns !== undefined && event.remainingTurns <= 1),
  );
}

function getCountdownOrder(event: GameEvent): number {
  if (event.remainingDays !== undefined) return event.remainingDays;
  if (event.remainingTurns !== undefined) return event.remainingTurns;
  return Number.POSITIVE_INFINITY;
}

function getTrackerPriority(event: GameEvent): number {
  const category = getEventSemanticCategory(event);
  if (category === 'participation') return 0;
  if (isEventUrgent(event)) return 1;
  if (category === 'aftermath') return 2;
  if (category === 'world') return 3;
  return 4;
}

/**
 * 供聊天追踪器与完整事件页共享的稳定排序。
 * 亲历事件永远优先，其他事件按紧迫度与语义层级排列，同级保持变量读取顺序。
 */
export function sortEventsForDisplay(events: GameEvent[]): GameEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const priorityDifference = getTrackerPriority(left.event) - getTrackerPriority(right.event);
      if (priorityDifference !== 0) return priorityDifference;

      const countdownDifference = getCountdownOrder(left.event) - getCountdownOrder(right.event);
      if (countdownDifference !== 0) return countdownDifference;

      return left.index - right.index;
    })
    .map(({ event }) => event);
}

export function getTrackerEvents(events: GameEvent[], limit = 3): GameEvent[] {
  return sortEventsForDisplay(events).slice(0, limit);
}
