import { describe, expect, it } from 'vitest';
import type { ActiveStatusEffect, CurrentAttributes, InventoryItem } from '../types';
import { buildItemAttributePreview } from './inventoryAttributePreview';

const baseAttributes: CurrentAttributes = {
  hp: 200,
  mp: 200,
  臂力: 100,
  根骨: 100,
  机敏: 100,
  洞察: 100,
};

describe('inventoryAttributePreview', () => {
  it('换装时会移除同部位旧装备并保留药效', () => {
    const items: InventoryItem[] = [
      {
        id: 'old',
        name: '旧甲',
        type: 'EQUIP',
        rank: 'WHITE',
        count: 1,
        description: '',
        equipInfo: { slot: '护甲', modifiers: { 根骨: 10 }, isEquipped: true },
      },
      {
        id: 'next',
        name: '新甲',
        type: 'EQUIP',
        rank: 'GREEN',
        count: 1,
        description: '',
        equipInfo: { slot: '护甲', modifiers: { 臂力: 20 }, isEquipped: false },
      },
    ];
    const effects: ActiveStatusEffect[] = [
      { id: '药效', type: '丹药', source: '轻身丸', modifiers: { 机敏: 10 }, duration: 2, remaining: 1 },
    ];
    const current = { ...baseAttributes, 根骨: 110, 机敏: 110 };

    expect(buildItemAttributePreview(items[1], items, effects, baseAttributes, current)).toEqual([
      { attribute: '臂力', currentValue: 100, nextValue: 120, delta: 20 },
      { attribute: '根骨', currentValue: 110, nextValue: 100, delta: -10 },
    ]);
  });

  it('丹药预览会在现有效果上增加本次百分比', () => {
    const elixir: InventoryItem = {
      id: 'elixir',
      name: '护心丹',
      type: 'ELIXIR',
      rank: 'GREEN',
      count: 1,
      description: '',
      elixirInfo: { modifiers: { 气血上限: 25 }, duration: '2' },
    };

    expect(buildItemAttributePreview(elixir, [elixir], [], baseAttributes, baseAttributes)).toEqual([
      { attribute: '气血上限', currentValue: 200, nextValue: 250, delta: 50 },
    ]);
  });
});
