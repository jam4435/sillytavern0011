import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../types';
import {
  getEventDescription,
  getEventSemanticLabel,
  getTrackerEvents,
  isEventUrgent,
  sortEventsForDisplay,
} from './eventPresentation';

const event = (overrides: Partial<GameEvent>): GameEvent => ({
  id: 'event',
  title: '测试事件',
  type: 'RUMOR',
  description: '',
  ...overrides,
});

describe('eventPresentation', () => {
  it('removes the duplicated leading event time field from the event description', () => {
    expect(
      getEventDescription(
        event({ description: '1219年10月20日13时 到 15时，大宋/张家口/大酒店发生相遇。' }),
      ),
    ).toBe('大宋/张家口/大酒店发生相遇。');
    expect(getEventDescription(event({ description: '只保留事件正文。' }))).toBe('只保留事件正文。');
  });

  it('maps existing event semantics to the player-facing labels', () => {
    expect(getEventSemanticLabel(event({ type: 'ACTIVE', category: 'participation' }))).toBe('亲历');
    expect(getEventSemanticLabel(event({ type: 'ACTIVE', category: 'world' }))).toBe('江湖');
    expect(getEventSemanticLabel(event({ type: 'RUMOR' }))).toBe('风闻');
    expect(getEventSemanticLabel(event({ type: 'AFTERMATH' }))).toBe('后续');
  });

  it('recognizes urgent countdowns without treating ordinary rumors as urgent', () => {
    expect(isEventUrgent(event({ type: 'ACTIVE', remainingDays: 3 }))).toBe(true);
    expect(isEventUrgent(event({ type: 'AFTERMATH', remainingTurns: 1 }))).toBe(true);
    expect(isEventUrgent(event({ type: 'ACTIVE', remainingDays: 4 }))).toBe(false);
    expect(isEventUrgent(event({ type: 'RUMOR' }))).toBe(false);
  });

  it('keeps the agreed tracker priority while preserving order within a tie', () => {
    const input = [
      event({ id: 'rumor', type: 'RUMOR' }),
      event({ id: 'world', type: 'ACTIVE', category: 'world', remainingDays: 7 }),
      event({ id: 'follow-up', type: 'AFTERMATH', remainingTurns: 3 }),
      event({ id: 'urgent-world', type: 'ACTIVE', category: 'world', remainingDays: 2 }),
      event({ id: 'personal-a', type: 'ACTIVE', category: 'participation', remainingDays: 8 }),
      event({ id: 'personal-b', type: 'ACTIVE', category: 'participation', remainingDays: 8 }),
    ];

    expect(sortEventsForDisplay(input).map(item => item.id)).toEqual([
      'personal-a',
      'personal-b',
      'urgent-world',
      'follow-up',
      'world',
      'rumor',
    ]);
    expect(getTrackerEvents(input).map(item => item.id)).toEqual(['personal-a', 'personal-b', 'urgent-world']);
  });
});
