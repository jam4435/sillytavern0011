import { describe, expect, it } from 'vitest';

import { buildFollowupPayloads } from './era-event-operations.js';

describe('historical followup clue filtering', () => {
  it('suppresses stale intermediate clues and keeps only a genuinely future target', () => {
    const historicalSource = '射雕第二回04-醉仙楼赌约';
    const historicalTarget = '射雕第三回01-醉仙楼十八年之约';
    const latestHistoricalSource = historicalTarget;
    const futureTarget = '射雕第五回04-弯弓射雕';

    const definitions = {
      [historicalSource]: {
        后续事件: {
          [historicalTarget]: '十八年赌约继续推进。',
        },
      },
      [historicalTarget]: {
        事件地点: '大宋/嘉兴府/嘉兴郊野/法华寺',
        触发条件: { 类型: '时间', 年: 1201, 月: 3, 日: 6, 时: 14 },
        事件结束时间: { 年: 1201, 月: 3, 日: 6, 时: 16 },
        后续事件: {
          [futureTarget]: '江南七怪远赴大漠，郭靖日后将弯弓射雕。',
        },
      },
      [futureTarget]: {
        事件地点: '蒙古/大漠/悬崖',
        触发条件: { 类型: '时间', 年: 1217, 月: 8, 日: 20, 时: 15 },
        事件结束时间: { 年: 1217, 月: 8, 日: 20, 时: 17 },
      },
    };

    const payloads = buildFollowupPayloads(
      [historicalSource, latestHistoricalSource],
      definitions,
      {
        世界信息: { 时间: { 年: 1201, 月: 3, 日: 12, 时: 0 } },
        事件系统: {
          未发生事件: {
            [historicalTarget]: definitions[historicalTarget].触发条件,
            [futureTarget]: definitions[futureTarget].触发条件,
          },
          进行中事件: {},
          已完成事件: {},
          已失效事件: {},
        },
      },
    );

    expect(payloads.followupPayload).not.toHaveProperty(historicalTarget);
    expect(payloads.frontendClueArchivePayload).not.toHaveProperty(historicalTarget);
    expect(payloads.followupPayload).toHaveProperty(futureTarget);
    expect(payloads.frontendClueArchivePayload[futureTarget]).toMatchObject({
      来源事件: latestHistoricalSource,
      地点: '蒙古/大漠/悬崖',
      开始时间: { 年: 1217, 月: 8, 日: 20, 时: 15 },
    });
  });

  it('does not rebuild clues for targets already in a terminal or active state', () => {
    const source = '射雕测试回01-来源';
    const target = '射雕测试回02-目标';
    const definitions = {
      [source]: { 后续事件: { [target]: '后续' } },
      [target]: {
        触发条件: { 类型: '时间', 年: 1210, 月: 1, 日: 1, 时: 0 },
        事件结束时间: { 年: 1210, 月: 1, 日: 1, 时: 2 },
      },
    };

    const payloads = buildFollowupPayloads([source], definitions, {
      世界信息: { 时间: { 年: 1209, 月: 12, 日: 30, 时: 0 } },
      事件系统: {
        未发生事件: {},
        进行中事件: {},
        已完成事件: { [target]: 0 },
        已失效事件: {},
      },
    });

    expect(payloads.followupPayload).toEqual({});
    expect(payloads.followupCountPayload).toEqual({});
    expect(payloads.frontendClueArchivePayload).toEqual({});
  });
});
