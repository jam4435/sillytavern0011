import { describe, expect, it } from 'vitest';

import {
  buildEventScheduleState,
  buildRelativeEventRebasePlan,
  getManifestEventCandidateKeys,
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
        { 年: 0, 月: 0, 日: 0, 时: 21 },
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
        { 年: 0, 月: 0, 日: 0, 时: 21 },
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
