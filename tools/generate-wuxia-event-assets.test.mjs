import { describe, expect, it } from 'vitest';

import { buildOpeningEventSummary } from '../scripts/lib/wuxia-event-summary.mjs';

describe('buildOpeningEventSummary', () => {
  it('只汇总普通事件，并仅在源触发条件有小时字段时输出小时', () => {
    const summary = buildOpeningEventSummary([
      {
        kind: 'ordinary',
        sourceName: '射雕事件条目-第7回-02-初遇黄蓉',
        location: '金国/张家口/张家口镇',
        triggerTime: { 类型: '时间', 年: 1219, 月: 10, 日: 20, 时: 13 },
      },
      {
        kind: 'ordinary',
        sourceName: '测试事件条目-第1回-01-无小时事件',
        location: '测试/地点',
        triggerTime: { 类型: '时间', 年: 1, 月: 2, 日: 3 },
      },
      {
        kind: 'debut',
        sourceName: '射雕登场事件-第7回人物',
        location: '',
        triggerTime: { 类型: '时间', 年: 1219, 月: 10, 日: 20, 时: 0 },
      },
    ]);

    expect(summary).toEqual([
      {
        事件名称: '射雕第7回-02-初遇黄蓉',
        事件地点: '金国/张家口/张家口镇',
        触发时间: { 年: 1219, 月: 10, 日: 20, 时: 13 },
      },
      {
        事件名称: '测试第1回-01-无小时事件',
        事件地点: '测试/地点',
        触发时间: { 年: 1, 月: 2, 日: 3 },
      },
    ]);
    expect(summary[1].触发时间).not.toHaveProperty('时');
  });
});
