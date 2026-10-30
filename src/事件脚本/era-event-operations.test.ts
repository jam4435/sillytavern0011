import { describe, expect, it } from 'vitest';
import {
  normalizeCharacterDeltaForEvent,
  resolveEventSettlementGameTime,
} from './era-event-operations.js';

describe('event biography date prefixes', () => {
  const eventName = '射雕第七回02-初遇黄蓉';
  const characterPatch = {
    人物经历: {
      新经历: '初遇钟灵并卷入无量山风波。',
      已有日期: '（1200.10.1）已经带有游戏内日期。',
    },
  };

  it('adds the game date to biography values without a date prefix and preserves existing dates', () => {
    const normalized = normalizeCharacterDeltaForEvent(
      characterPatch,
      eventName,
      { 年: 1200, 月: 11, 日: 1, 时: 9 },
    );
    const biography = normalized.人物经历 as Record<string, string>;

    expect(Object.values(biography)).toContain('（1200.11.1）初遇钟灵并卷入无量山风波。');
    expect(Object.values(biography)).toContain('（1200.10.1）已经带有游戏内日期。');
  });

  it('uses the legacy unknown-date marker when no usable game date is available', () => {
    const normalized = normalizeCharacterDeltaForEvent(characterPatch, eventName, undefined);
    const biography = normalized.人物经历 as Record<string, string>;

    expect(Object.values(biography)).toContain('（旧记录时间不详）初遇钟灵并卷入无量山风波。');
    expect(Object.values(biography)).toContain('（1200.10.1）已经带有游戏内日期。');
  });

  it('uses the event actual end date instead of a later world clock date', () => {
    const eventEndTime = { 年: 1202, 月: 3, 日: 15, 时: 13, 分: 30 };
    const gameTime = resolveEventSettlementGameTime(
      eventName,
      { 事件结束时间: { 年: 1202, 月: 3, 日: 15, 时: 13, 分: 30 } },
      {
        世界信息: { 时间: { 年: 1202, 月: 3, 日: 16, 时: 9 } },
        事件系统: { 进行中事件: { [eventName]: eventEndTime } },
      },
    );
    const normalized = normalizeCharacterDeltaForEvent(
      { 人物经历: { 新经历: '事件结算时追加的人物经历。' } },
      eventName,
      gameTime,
    );

    expect(gameTime).toEqual(eventEndTime);
    expect(normalized.人物经历).toEqual({
      新经历: '（1202.3.15）事件结算时追加的人物经历。',
    });
  });

  it('uses the event definition end date for historical events without an active record', () => {
    const plannedEndTime = { 年: 1202, 月: 3, 日: 15, 时: 13, 分: 30 };
    const gameTime = resolveEventSettlementGameTime(
      eventName,
      { 事件结束时间: plannedEndTime },
      { 世界信息: { 时间: { 年: 1202, 月: 3, 日: 18, 时: 9 } } },
    );

    expect(gameTime).toEqual(plannedEndTime);
  });

  it('falls back to the current world date only when the event has no end date', () => {
    const currentTime = { 年: 1202, 月: 3, 日: 18, 时: 9 };
    expect(resolveEventSettlementGameTime(eventName, {}, { 世界信息: { 时间: currentTime } }))
      .toEqual(currentTime);
  });

  it('can normalize a legacy multiline biography string', () => {
    const normalized = normalizeCharacterDeltaForEvent(
      { 人物经历: '第一条旧经历。\n（1200.10.1）第二条已有日期。' },
      eventName,
      { 年: 1200, 月: 11, 日: 2 },
    );

    expect(normalized.人物经历).toBe('（1200.11.2）第一条旧经历。\n（1200.10.1）第二条已有日期。');
  });
});
