import { describe, expect, it } from 'vitest';
import { normalizeCharacterDeltaForEvent } from './era-event-operations.js';

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

  it('can normalize a legacy multiline biography string', () => {
    const normalized = normalizeCharacterDeltaForEvent(
      { 人物经历: '第一条旧经历。\n（1200.10.1）第二条已有日期。' },
      eventName,
      { 年: 1200, 月: 11, 日: 2 },
    );

    expect(normalized.人物经历).toBe('（1200.11.2）第一条旧经历。\n（1200.10.1）第二条已有日期。');
  });
});
