import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENTRY_TOGGLE_PRESETS_KEY } from '../config.js';
import { getEntryTogglePresetMap, renameEntryTogglePresetLorebook } from './entryTogglePresets.js';

type Preset = {
  name: string;
  uids: number[];
  enabled: number[];
  strategyTypes?: Record<string, 'constant' | 'selective' | 'vectorized'>;
  updatedAt: number;
};

const sourcePreset: Preset = {
  name: '战斗组',
  uids: [2, 7, 11],
  enabled: [2, 11],
  strategyTypes: {
    '2': 'constant',
    '7': 'selective',
    '11': 'vectorized',
  },
  updatedAt: 1_725_000_000_000,
};

function seedPresetMap(presetMap: Record<string, Record<string, Preset>>) {
  localStorage.setItem(ENTRY_TOGGLE_PRESETS_KEY, JSON.stringify(presetMap));
}

describe('条目组预设世界书命名空间迁移', () => {
  beforeEach(() => {
    localStorage.removeItem(ENTRY_TOGGLE_PRESETS_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(ENTRY_TOGGLE_PRESETS_KEY);
  });

  it('将源世界书下的全部预设迁移到新名称', async () => {
    const secondPreset: Preset = {
      name: '日常组',
      uids: [20],
      enabled: [],
      updatedAt: 1_725_000_000_100,
    };
    seedPresetMap({
      旧世界书: { 战斗组: sourcePreset, 日常组: secondPreset },
      其他世界书: { 战斗组: { ...sourcePreset, updatedAt: 10 } },
    });

    await renameEntryTogglePresetLorebook('旧世界书', '新世界书');

    expect(getEntryTogglePresetMap()).toEqual({
      新世界书: { 战斗组: sourcePreset, 日常组: secondPreset },
      其他世界书: { 战斗组: { ...sourcePreset, updatedAt: 10 } },
    });
  });

  it('源世界书没有预设时不修改现有数据', async () => {
    const initial = {
      新世界书: { 战斗组: sourcePreset },
    };
    seedPresetMap(initial);

    await renameEntryTogglePresetLorebook('不存在的世界书', '新世界书');

    expect(getEntryTogglePresetMap()).toEqual(initial);
  });

  it('新旧名称相同时不删除该世界书的预设', async () => {
    const initial = {
      同名世界书: { 战斗组: sourcePreset },
    };
    seedPresetMap(initial);

    await renameEntryTogglePresetLorebook('同名世界书', '同名世界书');

    expect(getEntryTogglePresetMap()).toEqual(initial);
  });

  it('目标名称已有残留预设时以源世界书预设整体覆盖', async () => {
    const staleTargetPreset: Preset = {
      name: '残留组',
      uids: [99],
      enabled: [99],
      updatedAt: 1,
    };
    seedPresetMap({
      旧世界书: { 战斗组: sourcePreset },
      新世界书: { 残留组: staleTargetPreset },
    });

    await renameEntryTogglePresetLorebook('旧世界书', '新世界书');

    expect(getEntryTogglePresetMap().新世界书).toEqual({ 战斗组: sourcePreset });
    expect(getEntryTogglePresetMap().新世界书).not.toHaveProperty('残留组');
  });

  it('迁移成功后删除旧世界书键', async () => {
    seedPresetMap({
      旧世界书: { 战斗组: sourcePreset },
    });

    await renameEntryTogglePresetLorebook('旧世界书', '新世界书');

    expect(getEntryTogglePresetMap()).not.toHaveProperty('旧世界书');
    expect(JSON.parse(localStorage.getItem(ENTRY_TOGGLE_PRESETS_KEY) ?? '{}')).not.toHaveProperty('旧世界书');
  });

  it('完整保留 UID、启用状态、策略类型和更新时间字段', async () => {
    seedPresetMap({
      旧世界书: { 战斗组: sourcePreset },
    });

    await renameEntryTogglePresetLorebook('旧世界书', '新世界书');

    expect(getEntryTogglePresetMap().新世界书.战斗组).toEqual(sourcePreset);
  });
});
