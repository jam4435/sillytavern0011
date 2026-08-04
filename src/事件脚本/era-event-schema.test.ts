import { describe, expect, it } from 'vitest';

import { isEventDiscoverable, isTimeForEvent } from './era-event-checker.js';
import {
  evaluateEventCondition,
  isPureTimeTrigger,
  normalizeFollowupEvents,
  validateAndNormalizeEventDefinition,
} from './era-event-schema.js';
import { compareTime } from './era-utils.js';

const now = { 年: 1222, 月: 2, 日: 1, 时: 8 };

describe('event condition trees', () => {
  it('keeps the legacy time trigger and normalizes old/new follow-up formats', () => {
    const legacy = { 类型: '时间', 年: 1222, 月: 2, 日: 1, 时: 8 };
    expect(evaluateEventCondition(legacy, { currentTime: now, compareTime })).toBe(true);
    expect(isPureTimeTrigger(legacy)).toBe(true);
    expect(normalizeFollowupEvents({ 事件名: '事件B', 描述: '旧线索' })).toEqual({ 事件B: '旧线索' });
    expect(normalizeFollowupEvents({ 事件B: '线索B', 事件C: '线索C' })).toEqual({
      事件B: '线索B',
      事件C: '线索C',
    });
    expect(normalizeFollowupEvents({})).toEqual({});
  });

  it('evaluates nested all/any, completed events and variable operators', () => {
    const condition = {
      全部: [
        { 事件完成: '事件A' },
        {
          任一: [
            { 变量: '事件分支结果.事件A.变心', 等于: 1 },
            { 变量: '角色数据.黄蓉.好感', 大于等于: 80 },
          ],
        },
        { 变量: '角色数据.郭靖.失踪', 不存在: true },
      ],
    };
    const context = {
      currentTime: now,
      compareTime,
      completedEvents: { 事件A: 1 },
      statData: { 事件分支结果: { 事件A: { 变心: 1 } }, 角色数据: { 郭靖: {} } },
    };

    expect(evaluateEventCondition(condition, context)).toBe(true);
    expect(evaluateEventCondition(condition, { ...context, completedEvents: {} })).toBe(false);
    expect(isPureTimeTrigger(condition)).toBe(false);
  });

  it('treats missing paths consistently for equality and existence checks', () => {
    const context = { statData: {}, completedEvents: {}, currentTime: now, compareTime };
    expect(evaluateEventCondition({ 变量: '角色数据.黄蓉.状态', 等于: undefined }, context)).toBe(false);
    expect(evaluateEventCondition({ 变量: '角色数据.黄蓉.状态', 不等于: '安全' }, context)).toBe(true);
    expect(evaluateEventCondition({ 变量: '角色数据.黄蓉.状态', 存在: true }, context)).toBe(false);
    expect(evaluateEventCondition({ 变量: '角色数据.黄蓉.状态', 不存在: true }, context)).toBe(true);
  });

  it('requires non-time predicates during a single-anchor discovery window', () => {
    const event = {
      触发条件: {
        全部: [
          { 时间: { 年: 1222, 月: 2, 日: 10, 时: 8 } },
          { 事件完成: '事件A' },
        ],
      },
      事件结束时间: { 年: 1222, 月: 2, 日: 10, 时: 10 },
    };
    const discoveryTime = { 年: 1222, 月: 2, 日: 1, 时: 8 };

    expect(isEventDiscoverable(discoveryTime, event, { 事件系统: { 已完成事件: {} } })).toBe(false);
    expect(
      isEventDiscoverable(discoveryTime, event, { 事件系统: { 已完成事件: { 事件A: 0 } } }),
    ).toBe(true);
    expect(isTimeForEvent(discoveryTime, event, '事件B', { 事件系统: { 已完成事件: { 事件A: 0 } } })).toBe(
      false,
    );
  });

  it('validates nested conditions, duration choice and branch marker bounds', () => {
    const normalized = validateAndNormalizeEventDefinition('事件A', {
      触发条件: { 任一: [{ 事件完成: '事件前置' }, { 变量: 'user数据.声望', 大于: 10 }] },
      事件持续时间: { 日: 1, 时: 2 },
      后续事件: { 事件B: '线索B', 事件C: '线索C' },
      分支标记: { 变心: 0 },
    });
    expect(normalized.valid).toBe(true);
    expect(normalized.data.后续事件).toEqual({ 事件B: '线索B', 事件C: '线索C' });

    const invalid = validateAndNormalizeEventDefinition('事件A', {
      触发条件: { 全部: [] },
      事件结束时间: now,
      事件持续时间: { 时: 1 },
      分支标记: { 变心: 2 },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join('\n')).toContain('不能同时定义');
    expect(invalid.errors.join('\n')).toContain('只能是 0 或 1');
  });

  it('virtually reads defaults only for old unparticipated completions', () => {
    const dependentEvent = { 触发条件: { 变量: '事件分支结果.事件A.变心', 等于: 1 } };
    const definitions = { 事件A: { 分支标记: { 变心: 1 } }, 事件B: dependentEvent };

    expect(
      isTimeForEvent(now, dependentEvent, '事件B', { 事件系统: { 已完成事件: { 事件A: 0 } } }, definitions),
    ).toBe(true);
    expect(
      isTimeForEvent(now, dependentEvent, '事件B', { 事件系统: { 已完成事件: { 事件A: 1 } } }, definitions),
    ).toBe(false);
  });
});
