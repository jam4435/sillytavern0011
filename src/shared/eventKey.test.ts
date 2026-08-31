import { describe, expect, it } from 'vitest';
import {
  EVENT_KIND,
  EVENT_RUNTIME_KEY_VERSION,
  formatChineseNumber,
  parseCanonicalEventKey,
  parseChineseNumber,
} from './eventKey.js';

describe('canonical wuxia event keys', () => {
  it.each([
    [1, '一'],
    [10, '十'],
    [11, '十一'],
    [20, '二十'],
    [40, '四十'],
  ])('round-trips chapter %s as %s', (chapter, text) => {
    expect(formatChineseNumber(chapter)).toBe(text);
    expect(parseChineseNumber(text)).toBe(chapter);
  });

  it('parses ordinary, debut, and reserved growth keys', () => {
    expect(parseCanonicalEventKey('射雕第一回01-郭杨邀饮说书人.yaml')).toMatchObject({
      runtimeKey: '射雕第一回01-郭杨邀饮说书人',
      sourceName: '射雕第一回01-郭杨邀饮说书人',
      kind: EVENT_KIND.ORDINARY,
      series: '射雕',
      chapter: '第一回',
      chapterNumber: 1,
      sequence: '01',
      title: '郭杨邀饮说书人',
    });
    expect(parseCanonicalEventKey('神雕第四十回00-人物登场')?.kind).toBe(EVENT_KIND.DEBUT);
    expect(parseCanonicalEventKey('神雕第十一回00-人物成长-杨过')?.kind).toBe(EVENT_KIND.GROWTH);
    expect(parseCanonicalEventKey('奇遇事件-神雕-剑冢神雕引路与重剑出土.yaml')).toMatchObject({
      runtimeKey: '奇遇事件-神雕-剑冢神雕引路与重剑出土',
      sourceName: '奇遇事件-神雕-剑冢神雕引路与重剑出土',
      kind: EVENT_KIND.ENCOUNTER,
      series: '神雕奇遇',
      chapter: '奇遇篇',
      chapterNumber: 9999,
      sequence: '00',
      title: '剑冢神雕引路与重剑出土',
    });
    expect(parseCanonicalEventKey('奇遇-剑冢神雕引路与重剑出土')).toMatchObject({
      runtimeKey: '奇遇-剑冢神雕引路与重剑出土',
      sourceName: '奇遇-剑冢神雕引路与重剑出土',
      kind: EVENT_KIND.ENCOUNTER,
      series: '奇遇',
      chapter: '奇遇篇',
      chapterNumber: 9999,
      sequence: '00',
      title: '剑冢神雕引路与重剑出土',
    });
    expect(EVENT_RUNTIME_KEY_VERSION).toBe(3);
  });

  it.each([
    '射雕事件条目-第1回-01-郭杨邀饮说书人',
    '射雕登场事件-第1回人物',
    '射雕第1回01-郭杨邀饮说书人',
    '射雕第一回1-郭杨邀饮说书人',
    '射雕第一回001-郭杨邀饮说书人',
    '射雕第一回00-普通事件',
    '射雕第一回01-人物登场',
    '射雕第一十回01-非标准中文数',
  ])('rejects non-canonical key %s', key => {
    expect(parseCanonicalEventKey(key)).toBeNull();
  });
});
