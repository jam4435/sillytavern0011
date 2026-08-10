import { describe, expect, it } from 'vitest';
import { parseDeclaredVariableChanges } from './variableChanges';
import { findEarliestRunningEventEnd, validateWorldTimePatch, type WorldTimeTuple } from './worldTimeGuard';

const baseline: WorldTimeTuple = { 年: 1200, 月: 8, 日: 15, 时: 12, 分: 55 };

function changesFrom(
  patch: Record<string, unknown>,
  tag: 'VariableInsert' | 'VariableEdit' | 'VariableDelete' = 'VariableEdit',
) {
  return parseDeclaredVariableChanges(`<${tag}>${JSON.stringify(patch)}</${tag}>`).declaredChanges;
}

function fullTime(time: WorldTimeTuple) {
  return changesFrom({ 世界信息: { 时间: time } });
}

describe('validateWorldTimePatch', () => {
  it('拒绝只修改分钟造成的跨小时回拨', () => {
    const result = validateWorldTimePatch({
      baseline,
      declaredChanges: changesFrom({ 世界信息: { 时间: { 分: 10 } } }),
    });
    expect(result).toMatchObject({ ok: false, code: 'incomplete-time-update' });
  });

  it.each([
    { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 10 },
    { 年: 1200, 月: 8, 日: 15, 时: 12, 分: 59 },
  ] satisfies WorldTimeTuple[])('接受原子且向前的时间 $time', time => {
    const result = validateWorldTimePatch({ baseline, declaredChanges: fullTime(time) });
    expect(result).toMatchObject({ ok: true, hasTimeUpdate: true, candidate: time });
  });

  it('拒绝完整但未前进的时间', () => {
    expect(validateWorldTimePatch({ baseline, declaredChanges: fullTime(baseline) })).toMatchObject({
      ok: false,
      code: 'time-not-forward',
    });
  });

  it('按完整日期判断跨日、跨月和跨年', () => {
    const cases: Array<[WorldTimeTuple, WorldTimeTuple, boolean]> = [
      [{ 年: 1200, 月: 8, 日: 15, 时: 23, 分: 55 }, { 年: 1200, 月: 8, 日: 16, 时: 0, 分: 10 }, true],
      [{ 年: 1200, 月: 8, 日: 30, 时: 23, 分: 55 }, { 年: 1200, 月: 9, 日: 1, 时: 0, 分: 10 }, true],
      [{ 年: 1200, 月: 12, 日: 30, 时: 23, 分: 55 }, { 年: 1201, 月: 1, 日: 1, 时: 0, 分: 10 }, true],
      [{ 年: 1200, 月: 8, 日: 15, 时: 23, 分: 55 }, { 年: 1200, 月: 8, 日: 15, 时: 0, 分: 10 }, false],
    ];

    for (const [current, next, accepted] of cases) {
      const result = validateWorldTimePatch({ baseline: current, declaredChanges: fullTime(next) });
      expect(result.ok).toBe(accepted);
    }
  });

  it.each([
    { 年: 1200, 月: 8, 日: 15, 时: 13, 分: -1 },
    { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 60 },
    { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 1.5 },
    { 年: 1200, 月: 8, 日: 15, 时: 24, 分: 0 },
    { 年: 1200, 月: 13, 日: 1, 时: 0, 分: 0 },
    { 年: 1200, 月: 9, 日: 31, 时: 0, 分: 0 },
  ])('拒绝越界或非整数时间 $time', time => {
    const result = validateWorldTimePatch({
      baseline,
      declaredChanges: changesFrom({ 世界信息: { 时间: time } }),
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid-time-value' });
  });

  it('拒绝字符串分钟和删除必需字段', () => {
    const stringMinute = changesFrom({
      世界信息: { 时间: { 年: 1200, 月: 8, 日: 15, 时: 13, 分: '10' } },
    });
    expect(validateWorldTimePatch({ baseline, declaredChanges: stringMinute })).toMatchObject({
      ok: false,
      code: 'invalid-time-value',
    });

    const deleted = [
      ...fullTime({ 年: 1200, 月: 8, 日: 15, 时: 13, 分: 10 }),
      ...changesFrom({ 世界信息: { 时间: { 分: {} } } }, 'VariableDelete'),
    ];
    expect(validateWorldTimePatch({ baseline, declaredChanges: deleted })).toMatchObject({
      ok: false,
      code: 'delete-required-field',
    });
  });

  it('允许旧档缺分时由 Edit 和 Insert 合成完整时间', () => {
    const edits = changesFrom({ 世界信息: { 时间: { 年: 1200, 月: 8, 日: 15, 时: 13 } } });
    const insert = changesFrom({ 世界信息: { 时间: { 分: 10 } } }, 'VariableInsert');
    expect(
      validateWorldTimePatch({
        baseline: { 年: 1200, 月: 8, 日: 15, 时: 12 },
        declaredChanges: [...edits, ...insert],
      }),
    ).toMatchObject({ ok: true, candidate: { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 10 } });
  });

  it('对重复声明使用 last-wins 后的候选时间', () => {
    const first = fullTime({ 年: 1200, 月: 8, 日: 15, 时: 13, 分: 10 });
    const lastMinute = changesFrom({ 世界信息: { 时间: { 分: 20 } } });
    expect(validateWorldTimePatch({ baseline, declaredChanges: [...first, ...lastMinute] })).toMatchObject({
      ok: true,
      candidate: { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 20 },
    });
  });

  it('阻止越过进行中事件边界，但允许准确落在边界', () => {
    const eventEnd = { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 0 };
    expect(validateWorldTimePatch({ baseline, declaredChanges: fullTime(eventEnd), eventEnd })).toMatchObject({
      ok: true,
      candidate: eventEnd,
    });
    expect(
      validateWorldTimePatch({
        baseline,
        declaredChanges: fullTime({ 年: 1200, 月: 8, 日: 15, 时: 13, 分: 1 }),
        eventEnd,
      }),
    ).toMatchObject({ ok: false, code: 'event-end-exceeded' });
  });
});

describe('findEarliestRunningEventEnd', () => {
  it('读取最早的进行中事件结束时间并忽略元数据', () => {
    expect(
      findEarliestRunningEventEnd({
        参与事件: { 先: {}, 后: {} },
        事件系统: {
          进行中事件: {
            后: { 年: 1200, 月: 8, 日: 15, 时: 15 },
            先: { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 0 },
            $meta: { updatable: true },
          },
        },
      }),
    ).toEqual({ 年: 1200, 月: 8, 日: 15, 时: 13, 分: 0 });
  });

  it('不用未参与的后台进行中事件限制玩家时间', () => {
    expect(
      findEarliestRunningEventEnd({
        参与事件: { 玩家事件: {} },
        事件系统: {
          进行中事件: { 后台事件: { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 0 } },
        },
      }),
    ).toBeNull();
  });
});
