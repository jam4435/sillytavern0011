import { describe, expect, it } from 'vitest';
import { parseDeclaredVariableChanges } from './variableChanges';
import {
  resolveWorldTimeCompletionTarget,
  validateWorldTimePatch,
  type WorldTimeTuple,
} from './worldTimeGuard';

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

  it('允许一次跨越多个事件时段的前进', () => {
    const skippedTime = { 年: 1200, 月: 8, 日: 17, 时: 13, 分: 1 };
    expect(validateWorldTimePatch({ baseline, declaredChanges: fullTime(skippedTime) })).toMatchObject({
      ok: true,
      candidate: skippedTime,
    });
  });
});

describe('resolveWorldTimeCompletionTarget', () => {
  it.each([
    {
      current: { 年: 1200, 月: 8, 日: 15, 时: 12, 分: 0 },
      minute: 15,
      thought: '酒馆对话耗时约15分钟',
      target: { 年: 1200, 月: 8, 日: 15, 时: 12, 分: 15 },
    },
    {
      current: { 年: 1200, 月: 8, 日: 15, 时: 12, 分: 10 },
      minute: 30,
      thought: '众人离店耗时约20分钟',
      target: { 年: 1200, 月: 8, 日: 15, 时: 12, 分: 30 },
    },
    {
      current: { 年: 1200, 月: 8, 日: 15, 时: 12, 分: 55 },
      minute: 10,
      thought: '1200年8月15日12时55分 + 15分钟 = 1200年8月15日13时10分',
      target: { 年: 1200, 月: 8, 日: 15, 时: 13, 分: 10 },
    },
  ] satisfies Array<{
    current: WorldTimeTuple;
    minute: number;
    thought: string;
    target: WorldTimeTuple;
  }>)('按原声明耗时锁定目标 $current → $target', ({ current, minute, thought, target }) => {
    expect(
      resolveWorldTimeCompletionTarget({
        baseline: current,
        declaredChanges: changesFrom({ 世界信息: { 时间: { 分: minute } } }),
        thoughts: [{ text: thought }],
      }),
    ).toMatchObject({ ok: true, target });
  });

  it('原耗时与时间叶子冲突时拒绝重新估算', () => {
    expect(
      resolveWorldTimeCompletionTarget({
        baseline,
        declaredChanges: changesFrom({ 世界信息: { 时间: { 分: 10 } } }),
        thoughts: [{ text: '耗时约5分钟' }],
      }),
    ).toMatchObject({ ok: false, reason: expect.stringContaining('二者冲突') });
  });

  it('跨小时稀疏声明未写耗时时拒绝猜测进位', () => {
    expect(
      resolveWorldTimeCompletionTarget({
        baseline,
        declaredChanges: changesFrom({ 世界信息: { 时间: { 分: 10 } } }),
        thoughts: [],
      }),
    ).toMatchObject({ ok: false, reason: expect.stringContaining('无法在不猜测进位') });
  });
});
