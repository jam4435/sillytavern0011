import { describe, expect, it } from 'vitest';
import { buildPlayerParticipationEntry } from './era-event-operations.js';

describe('event biography date prefixes', () => {
  const eventName = '射雕第七回02-初遇黄蓉';
  const eventData = {
    事件详情: '人物在事件中经历了重要变化。',
    事件概要: '测试事件概要',
    insert: {
      段誉: {
        人物经历: {
          新经历: '初遇钟灵并卷入无量山风波。',
          已有日期: '（1200.10.1）已经带有游戏内日期。',
        },
      },
    },
  };

  it('adds the current game date only to biography values without a date prefix', () => {
    const entry = buildPlayerParticipationEntry(
      eventName,
      eventData,
      { 年: 1200, 月: 11, 日: 1, 时: 9 },
    );
    const biography = (entry.insert as any).段誉.人物经历 as Record<string, string>;

    expect(Object.values(biography)).toContain('（1200.11.1）初遇钟灵并卷入无量山风波。');
    expect(Object.values(biography)).toContain('（1200.10.1）已经带有游戏内日期。');
  });

  it('uses the legacy unknown-date marker when the event has no usable game date', () => {
    const entry = buildPlayerParticipationEntry(eventName, eventData, undefined);
    const biography = (entry.insert as any).段誉.人物经历 as Record<string, string>;

    expect(Object.values(biography)).toContain('（旧记录时间不详）初遇钟灵并卷入无量山风波。');
    expect(Object.values(biography)).toContain('（1200.10.1）已经带有游戏内日期。');
  });
});
