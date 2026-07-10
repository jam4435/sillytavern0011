import { describe, expect, it } from 'vitest';
import type { InventoryItem, MartialArt } from '../types';
import { getRankVisual, resolveInventoryIcon, resolveMartialArtIcon } from './iconCatalog';

const baseItem: InventoryItem = {
  id: 'item_1',
  name: '无名物',
  type: 'MISC',
  rank: 'WHITE',
  count: 1,
  description: '',
};

const baseArt: MartialArt = {
  type: '内功',
  description: '',
  rank: '绝世',
  mastery: '初窥门径',
  traits: {},
  unlockedTraits: {},
  canUpgrade: false,
  upgradeCost: 0,
  nextMastery: null,
};

describe('iconCatalog', () => {
  it('功法名称与繁简别名可匹配到同一图标', () => {
    expect(resolveMartialArtIcon('九陽神功', baseArt)).toEqual(
      expect.objectContaining({ label: '九阳神功', matchedBy: 'name' }),
    );
    expect(resolveMartialArtIcon('九阳真经', baseArt)).toEqual(
      expect.objectContaining({ label: '九阳神功', matchedBy: 'alias' }),
    );
  });

  it('物品按类型返回不同兜底图标', () => {
    expect(resolveInventoryIcon({ ...baseItem, type: 'EQUIP' })).toEqual(
      expect.objectContaining({ matchedBy: 'type' }),
    );
    expect(resolveInventoryIcon({ ...baseItem, type: 'SECRET' })).toEqual(
      expect.objectContaining({ matchedBy: 'type' }),
    );
    expect(resolveInventoryIcon({ ...baseItem, type: 'ELIXIR' })).toEqual(
      expect.objectContaining({ matchedBy: 'type' }),
    );
    expect(resolveInventoryIcon({ ...baseItem, type: 'MISC' })).toEqual(
      expect.objectContaining({ matchedBy: 'type' }),
    );
  });

  it('未知功法返回通用兜底，品阶颜色稳定', () => {
    expect(resolveMartialArtIcon('不存在神功', { ...baseArt, type: '未知' })).toEqual(
      expect.objectContaining({ matchedBy: 'fallback' }),
    );
    expect(getRankVisual('BLUE')).toEqual(expect.objectContaining({ label: '珍品', color: '#60a5fa' }));
    expect(getRankVisual('上乘', 'martial')).toEqual(expect.objectContaining({ label: '上乘', color: '#60a5fa' }));
  });
});

