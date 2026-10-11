import { describe, expect, it } from 'vitest';
import type { ChronicleEntry, GameEvent } from '../types';
import {
  getEventDescription,
  getEventCountdownLabel,
  getEventSemanticLabel,
  getEventTitleParts,
  getTrackerEvents,
  getNewlyCompletedPersonalEvents,
  getVisibleCompletedEvents,
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
      getEventDescription(event({ description: '1219年10月20日13时 到 15时，大宋/张家口/大酒店发生相遇。' })),
    ).toBe('大宋/张家口/大酒店发生相遇。');
    expect(getEventDescription(event({ description: '只保留事件正文。' }))).toBe('只保留事件正文。');
  });

  it('maps existing event semantics to the player-facing labels', () => {
    expect(getEventSemanticLabel(event({ type: 'ACTIVE', category: 'participation' }))).toBe('亲历');
    expect(getEventSemanticLabel(event({ type: 'ACTIVE', category: 'world' }))).toBe('江湖');
    expect(getEventSemanticLabel(event({ type: 'RUMOR' }))).toBe('江湖风闻');
    expect(getEventSemanticLabel(event({ type: 'AFTERMATH' }))).toBe('后续线索');
  });

  it('puts the event name before its source reference and removes the separator', () => {
    expect(getEventTitleParts('射雕第一回03-郭杨结识丘处机')).toEqual({
      name: '郭杨结识丘处机',
      reference: '射雕第一回03',
    });
    expect(getEventTitleParts('无来源事件')).toEqual({ name: '无来源事件' });
  });

  it('recognizes urgent countdowns without treating ordinary rumors as urgent', () => {
    expect(isEventUrgent(event({ type: 'ACTIVE', remainingDays: 3 }))).toBe(true);
    expect(isEventUrgent(event({ type: 'AFTERMATH', remainingTurns: 1 }))).toBe(false);
    expect(isEventUrgent(event({ type: 'ACTIVE', remainingDays: 4 }))).toBe(false);
    expect(isEventUrgent(event({ type: 'RUMOR', startsInDays: 3 }))).toBe(true);
    expect(isEventUrgent(event({ type: 'RUMOR' }))).toBe(false);
    expect(getEventCountdownLabel(event({ type: 'RUMOR', startsInDays: 10 }))).toBe('10日后');
    expect(getEventCountdownLabel(event({ type: 'AFTERMATH', remainingTurns: 1 }))).toBeNull();
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

  it('只回顾本轮新增的亲历归档，不混入既有史册或未参与的背景事件', () => {
    const archive = (title: string, personal: boolean): ChronicleEntry => ({
      id: title,
      title,
      timeText: '1202年3月16日16时',
      sortDays: 0,
      summary: '事件已结算。',
      personal,
    });
    const old = archive('天龙第二回04-钟灵赠信物', true);
    const finished = archive('天龙第二回05-段誉失足坠崖', true);
    const worldOnly = archive('天龙第二回06-天下异动', false);
    const before = [old];
    const after = [worldOnly, finished, old];

    expect(getNewlyCompletedPersonalEvents(before, after)).toEqual([finished]);
    expect(getNewlyCompletedPersonalEvents(after, after)).toEqual([]);
    expect(getNewlyCompletedPersonalEvents([], [worldOnly])).toEqual([]);
  });

  it('临时已完成卡片仅在真实楼层匹配时显示，初始双空状态不导致白屏', () => {
    const finished: ChronicleEntry = {
      id: 'finished-05',
      title: '天龙第二回05-段誉失足坠崖',
      timeText: '1202年3月16日15时',
      sortDays: 0,
      personal: true,
    };
    const recent = { messageId: 46, events: [finished] };

    expect(getVisibleCompletedEvents(null, undefined)).toEqual([]);
    expect(getVisibleCompletedEvents(null, 46)).toEqual([]);
    expect(getVisibleCompletedEvents(recent, undefined)).toEqual([]);
    expect(getVisibleCompletedEvents(recent, 45)).toEqual([]);
    expect(getVisibleCompletedEvents(recent, 46)).toBe(recent.events);
  });
});
