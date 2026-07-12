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

  it('按名称细分装备、药品和杂物外观', () => {
    expect(
      resolveInventoryIcon({
        ...baseItem,
        name: '铁沙掌套',
        type: 'EQUIP',
        rank: 'GREEN',
        equipInfo: { slot: '护甲' },
      }),
    ).toEqual(expect.objectContaining({ category: '护手', matchedBy: 'name' }));

    expect(
      resolveInventoryIcon({ ...baseItem, name: '少林金疮药', type: 'ELIXIR', rank: 'GREEN' }),
    ).toEqual(expect.objectContaining({ category: '药散', matchedBy: 'name' }));

    expect(
      resolveInventoryIcon({ ...baseItem, name: '达摩心经残页', type: 'MISC', rank: 'BLUE' }),
    ).toEqual(expect.objectContaining({ category: '地图书信', matchedBy: 'name' }));
  });

  it('同一细分类会按品阶选择不同资源', () => {
    const low = resolveInventoryIcon({ ...baseItem, name: '青锋剑', type: 'EQUIP', rank: 'WHITE' });
    const high = resolveInventoryIcon({ ...baseItem, name: '青锋剑', type: 'EQUIP', rank: 'GOLD' });

    expect(low.category).toBe('剑');
    expect(high.category).toBe('剑');
    expect(low.src).not.toBe(high.src);
  });

  it('行囊中的秘籍使用书册外观而不是招式特效图', () => {
    expect(resolveInventoryIcon({ ...baseItem, name: '九阳神功', type: 'SECRET', rank: 'RED' })).toEqual(
      expect.objectContaining({ category: '内功经诀', label: '内功经诀' }),
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
