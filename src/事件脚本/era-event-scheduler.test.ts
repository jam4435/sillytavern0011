import { describe, expect, it } from 'vitest';

import {
  buildEventScheduleState,
  buildRelativeEventRebasePlan,
  getManifestEventCandidateKeys,
  selectEarliestDiscoverableEventPerRegion,
  sortUnstartedEventsByTrigger,
} from './era-event-scheduler.js';

describe('manifest event scheduler', () => {
  const manifest = {
    events: [
      { runtimeKey: '已完成', triggerHour: 10, discoveryHour: 0 },
      { runtimeKey: '当前', triggerHour: 20, discoveryHour: 10 },
      { runtimeKey: '可发现', triggerHour: 30, discoveryHour: 20 },
      { runtimeKey: '未来', triggerHour: 100, discoveryHour: 90 },
    ],
    indexes: {
      byTrigger: [
        { hour: 10, runtimeKey: '已完成' },
        { hour: 20, runtimeKey: '当前' },
        { hour: 30, runtimeKey: '可发现' },
        { hour: 100, runtimeKey: '未来' },
      ],
      byDiscovery: [
        { hour: 0, runtimeKey: '已完成' },
        { hour: 10, runtimeKey: '当前' },
        { hour: 20, runtimeKey: '可发现' },
        { hour: 90, runtimeKey: '未来' },
      ],
    },
  };

  it('returns due and discoverable keys without scanning a future-state map', () => {
    expect(
      getManifestEventCandidateKeys(
        manifest,
        { 年: 0, 月: 1, 日: 1, 时: 21 },
        {
          事件系统: { 已完成事件: { 已完成: 0 }, 进行中事件: {} },
        },
      ),
    ).toEqual(['当前', '可发现']);
  });

  it('stores an independent schedule schema from runtime-key version', () => {
    expect(buildEventScheduleState('hash-v1', { 年: 1220, 月: 1, 日: 1, 时: 0 })).toEqual({
      schemaVersion: 1,
      manifestHash: 'hash-v1',
      lastCheckedTime: { 年: 1220, 月: 1, 日: 1, 时: 0 },
    });
  });

  it('keeps sparse rebased events as candidates after a script reload', () => {
    expect(
      getManifestEventCandidateKeys(
        manifest,
        { 年: 0, 月: 1, 日: 1, 时: 21 },
        {
          事件系统: {
            已完成事件: {},
            已失效事件: {},
            进行中事件: {},
            未发生事件: { 未来: { 类型: '时间', 年: 0, 月: 0, 日: 1, 时: 6 } },
          },
        },
      ),
    ).toEqual(['已完成', '当前', '可发现', '未来']);
  });

  it('always considers conditional definitions until they complete or expire', () => {
    const conditionalManifest = {
      events: [{ runtimeKey: '条件事件', conditional: true, triggerHour: null, discoveryHour: null }],
      indexes: { byTrigger: [], byDiscovery: [], conditional: ['条件事件'] },
    };
    expect(
      getManifestEventCandidateKeys(
        conditionalManifest,
        { 年: 1, 月: 1, 日: 1, 时: 0 },
        {
          事件系统: { 已完成事件: {}, 已失效事件: {}, 进行中事件: {} },
        },
      ),
    ).toEqual(['条件事件']);
    expect(
      getManifestEventCandidateKeys(
        conditionalManifest,
        { 年: 1, 月: 1, 日: 1, 时: 0 },
        {
          事件系统: { 已完成事件: {}, 已失效事件: { 条件事件: 1 }, 进行中事件: {} },
        },
      ),
    ).toEqual([]);
  });
});

describe('discoverable event sequencing', () => {
  it('shows only the earliest discoverable event in each rumor region', () => {
    const definitions = {
      后山首事: {
        事件地点: '大理/无量山/后山森林',
        触发条件: { 类型: '时间', 年: 1202, 月: 3, 日: 17, 时: 17 },
      },
      断魂崖后事: {
        事件地点: '大理/无量山/断魂崖',
        触发条件: { 类型: '时间', 年: 1202, 月: 3, 日: 18, 时: 6 },
      },
      临安别事: {
        事件地点: '大宋/临安府/牛家村',
        触发条件: { 类型: '时间', 年: 1202, 月: 3, 日: 17, 时: 18 },
      },
    };

    expect(
      selectEarliestDiscoverableEventPerRegion(['后山首事', '断魂崖后事', '临安别事'], definitions),
    ).toEqual(['后山首事', '临安别事']);
  });

  it('lets an active regional head block later rumors until the next check', () => {
    const definitions = {
      当前事件: {
        事件地点: '大理/无量山/后山森林',
        触发条件: { 类型: '时间', 年: 1202, 月: 3, 日: 17, 时: 17 },
      },
      下一事件: {
        事件地点: '大理/无量山/断魂崖',
        触发条件: { 类型: '时间', 年: 1202, 月: 3, 日: 17, 时: 20 },
      },
    };

    expect(selectEarliestDiscoverableEventPerRegion(['当前事件', '下一事件'], definitions)).toEqual(['当前事件']);
    expect(selectEarliestDiscoverableEventPerRegion(['下一事件'], definitions)).toEqual(['下一事件']);
  });
});

describe('relative event rebasing', () => {
  const definitions = {
    事件一: { 触发条件: { 类型: '时间', 年: 1200, 月: 8, 日: 15, 时: 17 } },
    事件二: { 触发条件: { 类型: '时间', 年: 1200, 月: 8, 日: 15, 时: 20 } },
    事件三: { 触发条件: { 类型: '时间', 年: 1200, 月: 8, 日: 16, 时: 2 } },
  };

  it('anchors only the first event now and preserves original trigger gaps for the rest', () => {
    const plan = buildRelativeEventRebasePlan(['事件三', '事件二', '事件一'], definitions, {
      年: 1200,
      月: 8,
      日: 10,
      时: 9,
      分: 25,
    });

    expect(plan.firstEventName).toBe('事件一');
    expect(plan.orderedEventNames).toEqual(['事件一', '事件二', '事件三']);
    expect(plan.deferredConditions).toEqual({
      事件二: { 类型: '时间', 年: 1200, 月: 8, 日: 10, 时: 12, 分: 25 },
      事件三: { 类型: '时间', 年: 1200, 月: 8, 日: 10, 时: 18, 分: 25 },
    });
  });

  it('does not move December events five days backward while preserving their gaps', () => {
    const decemberDefinitions = {
      事件三: { 触发条件: { 类型: '时间', 年: 1200, 月: 12, 日: 10, 时: 19 } },
      事件四: { 触发条件: { 类型: '时间', 年: 1200, 月: 12, 日: 10, 时: 22 } },
      事件五: { 触发条件: { 类型: '时间', 年: 1200, 月: 12, 日: 11, 时: 3 } },
    };

    expect(
      buildRelativeEventRebasePlan(['事件五', '事件四', '事件三'], decemberDefinitions, {
        年: 1200,
        月: 12,
        日: 10,
        时: 19,
        分: 0,
      }),
    ).toMatchObject({
      firstEventName: '事件三',
      deferredConditions: {
        事件四: { 类型: '时间', 年: 1200, 月: 12, 日: 10, 时: 22, 分: 0 },
        事件五: { 类型: '时间', 年: 1200, 月: 12, 日: 11, 时: 3, 分: 0 },
      },
    });
  });

  it('writes earlier rebased triggers before later ones', () => {
    expect(
      Object.keys(
        sortUnstartedEventsByTrigger({
          事件三: definitions.事件三.触发条件,
          事件一: definitions.事件一.触发条件,
          事件二: definitions.事件二.触发条件,
        }),
      ),
    ).toEqual(['事件一', '事件二', '事件三']);
  });
});
