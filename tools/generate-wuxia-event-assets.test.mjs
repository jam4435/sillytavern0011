import { describe, expect, it } from 'vitest';

import { buildOpeningEventSummary } from '../scripts/lib/wuxia-event-summary.mjs';

describe('buildOpeningEventSummary', () => {
  it('只汇总普通事件，并仅在源触发条件有小时字段时输出小时', () => {
    const summary = buildOpeningEventSummary([
      {
        kind: 'ordinary',
        sourceName: '射雕第七回02-初遇黄蓉',
        location: '金国/张家口/张家口镇',
        triggerTime: { 类型: '时间', 年: 1219, 月: 10, 日: 20, 时: 13 },
      },
      {
        kind: 'ordinary',
        sourceName: '测试第一回01-无小时事件',
        location: '测试/地点',
        triggerTime: { 类型: '时间', 年: 1, 月: 2, 日: 3 },
      },
      {
        kind: 'debut',
        sourceName: '射雕第七回00-人物登场',
        location: '',
        triggerTime: { 类型: '时间', 年: 1219, 月: 10, 日: 20, 时: 0 },
      },
    ]);

    expect(summary).toEqual([
      {
        事件名称: '射雕第七回02-初遇黄蓉',
        事件地点: '金国/张家口/张家口镇',
        触发时间: { 年: 1219, 月: 10, 日: 20, 时: 13 },
      },
      {
        事件名称: '测试第一回01-无小时事件',
        事件地点: '测试/地点',
        触发时间: { 年: 1, 月: 2, 日: 3 },
      },
    ]);
    expect(summary[1].触发时间).not.toHaveProperty('时');
  });
});
