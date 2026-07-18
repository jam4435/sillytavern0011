import { describe, expect, it } from 'vitest';

import { buildEventScheduleState, getManifestEventCandidateKeys } from './era-event-scheduler.js';

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
      getManifestEventCandidateKeys(manifest, { 年: 0, 月: 0, 日: 0, 时: 21 }, {
        事件系统: { 已完成事件: { 已完成: 0 }, 进行中事件: {} },
      }),
    ).toEqual(['当前', '可发现']);
  });

  it('stores an independent schedule schema from runtime-key version', () => {
    expect(buildEventScheduleState('hash-v1', { 年: 1220, 月: 1, 日: 1, 时: 0 })).toEqual({
      schemaVersion: 1,
      manifestHash: 'hash-v1',
      lastCheckedTime: { 年: 1220, 月: 1, 日: 1, 时: 0 },
    });
  });
});
