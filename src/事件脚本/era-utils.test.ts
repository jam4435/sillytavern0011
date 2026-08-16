import { describe, expect, it } from 'vitest';

import { calculateDateOffset, calculateTimeOffset, timeToTotalMinutes } from './era-utils.js';
import { totalMinutesToWuxiaCalendarTime } from '../shared/wuxiaCalendar.js';

describe('wuxia calendar arithmetic', () => {
  it('round-trips valid one-based dates without moving December backward', () => {
    const times = [
      { 年: 1200, 月: 1, 日: 1, 时: 0, 分: 0 },
      { 年: 1200, 月: 12, 日: 5, 时: 19, 分: 0 },
      { 年: 1200, 月: 12, 日: 10, 时: 18, 分: 5 },
      { 年: 1200, 月: 12, 日: 30, 时: 23, 分: 59 },
    ];

    for (const time of times) {
      expect(totalMinutesToWuxiaCalendarTime(timeToTotalMinutes(time))).toEqual(time);
    }
  });

  it('preserves the actual event window around 1200-12-10', () => {
    const start = { 年: 1200, 月: 12, 日: 10, 时: 18, 分: 0 };

    expect(calculateTimeOffset(start, { 时: 0 })).toEqual(start);
    expect(calculateTimeOffset(start, { 时: 2 })).toEqual({ 年: 1200, 月: 12, 日: 10, 时: 20, 分: 0 });
    expect(calculateTimeOffset(start, { 时: 4 })).toEqual({ 年: 1200, 月: 12, 日: 10, 时: 22, 分: 0 });
    expect(calculateTimeOffset(start, { 时: 28 })).toEqual({ 年: 1200, 月: 12, 日: 11, 时: 22, 分: 0 });
  });

  it('crosses month and year boundaries in the 12-by-30-day calendar', () => {
    expect(calculateDateOffset({ 年: 1200, 月: 12, 日: 30 }, 1)).toEqual({ 年: 1201, 月: 1, 日: 1 });
    expect(calculateTimeOffset({ 年: 1200, 月: 12, 日: 30, 时: 23 }, { 时: 2 })).toEqual({
      年: 1201,
      月: 1,
      日: 1,
      时: 1,
    });
  });
});
