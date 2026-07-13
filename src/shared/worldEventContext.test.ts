import { describe, expect, it } from 'vitest';
import { hasEventOutcomeChanged, selectWorldEventsForPrompt } from './worldEventContext';

const eventDefinition = {
  事件概要: '郭靖与黄蓉结识，两人建立初步情谊。',
  insert: { 郭靖: { 人物经历: { 初遇黄蓉: '在张家口结识黄蓉。' } } },
  update: { 黄蓉: { 所在位置: '大宋/张家口' } },
  delete: {},
};

describe('hasEventOutcomeChanged', () => {
  it('ignores object key order and ERA metadata', () => {
    const participation = {
      结局: ' 郭靖与黄蓉结识，两人建立初步情谊。 ',
      insert: {
        郭靖: {
          $meta: { updatable: true },
          人物经历: { 初遇黄蓉: '在张家口结识黄蓉。' },
        },
      },
      update: { 黄蓉: { 所在位置: '大宋/张家口', $meta: { necessary: 'all' } } },
      delete: {},
    };

    expect(hasEventOutcomeChanged(participation, eventDefinition)).toBe(false);
  });

  it('detects ending text and effective diff changes', () => {
    expect(hasEventOutcomeChanged({ ...eventDefinition, 结局: '黄蓉离开张家口。' }, eventDefinition)).toBe(true);
    expect(
      hasEventOutcomeChanged(
        {
          ...eventDefinition,
          结局: eventDefinition.事件概要,
          update: { 黄蓉: { 所在位置: '大宋/临安府' } },
        },
        eventDefinition,
      ),
    ).toBe(true);
  });

  it('treats missing diff blocks as empty objects', () => {
    const definitionWithoutDiffs = {
      事件概要: '郭靖与黄蓉结识，两人建立初步情谊。',
    };

    expect(
      hasEventOutcomeChanged(
        {
          结局: definitionWithoutDiffs.事件概要,
          insert: {},
          update: {},
          delete: {},
        },
        definitionWithoutDiffs,
      ),
    ).toBe(false);
  });
});

describe('selectWorldEventsForPrompt', () => {
  it('prioritizes changed history and enforces the hard limit', () => {
    const worldEvents = Object.fromEntries(
      Array.from({ length: 24 }, (_, index) => [
        `事件${index + 1}`,
        {
          时间: { 年: 1200, 月: 1, 日: index + 1, 时: 12 },
          地点: '大宋/临安府',
          概要: `第${index + 1}个事件已经完成并留下长期影响。`,
        },
      ]),
    );
    const statuses = {
      事件1: '偏离',
      事件2: '未知',
      事件3: '偏离',
      事件4: '未知',
      事件5: '偏离',
      事件6: '未知',
      事件7: '偏离',
      事件8: '未知',
      事件9: '偏离',
    };

    const selected = selectWorldEventsForPrompt(worldEvents, statuses);

    expect(Object.keys(selected)).toHaveLength(16);
    expect(selected).toHaveProperty('事件9');
    expect(selected).not.toHaveProperty('事件1');
    expect(selected).toHaveProperty('事件24');
  });

  it('drops malformed records without exposing unrelated state', () => {
    const selected = selectWorldEventsForPrompt(
      {
        正常事件: { 时间: { 年: 1200 }, 地点: '大宋/临安府', 概要: '事件留下了明确的长期结果。' },
        非法事件: { 概要: '缺少时间和地点。' },
      },
      { 正常事件: '原定', 内部字段: { secret: true } },
    );

    expect(selected).toEqual({
      正常事件: { 时间: { 年: 1200 }, 地点: '大宋/临安府', 概要: '事件留下了明确的长期结果。' },
    });
  });
});
