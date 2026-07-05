import type {
  ActiveStatusEffect,
  CurrentAttributes,
  InventoryAttributeModifierMap,
  InventoryItem,
} from '../types';
import { applyAttributeModifiers } from './attributeCalculator';

export interface AttributePreviewRow {
  attribute: string;
  currentValue: number;
  nextValue: number;
  delta: number;
}

const PREVIEW_ATTRIBUTES = ['臂力', '根骨', '机敏', '洞察', '气血上限', '内力上限'] as const;

function canonicalAttribute(attribute: string): string {
  if (attribute === '气血') return '气血上限';
  if (attribute === '内力') return '内力上限';
  return attribute;
}

function addModifiers(
  target: InventoryAttributeModifierMap,
  modifiers?: InventoryAttributeModifierMap,
  multiplier = 1,
): void {
  if (!modifiers) return;

  for (const [attribute, value] of Object.entries(modifiers)) {
    if (!Number.isFinite(value)) continue;
    const canonical = canonicalAttribute(attribute);
    target[canonical] = (target[canonical] ?? 0) + value * multiplier;
  }
}

function collectActiveModifiers(items: InventoryItem[], statusEffects: ActiveStatusEffect[]): InventoryAttributeModifierMap {
  const modifiers: InventoryAttributeModifierMap = {};

  for (const item of items) {
    if (item.type === 'EQUIP' && item.equipInfo?.isEquipped) {
      addModifiers(modifiers, item.equipInfo.modifiers);
    }
  }
  for (const effect of statusEffects) {
    if (effect.remaining > 0) {
      addModifiers(modifiers, effect.modifiers);
    }
  }

  return modifiers;
}

function calculateValues(base: CurrentAttributes, modifiers: InventoryAttributeModifierMap): Record<string, number> {
  const result = applyAttributeModifiers(
    { 臂力: base.臂力, 根骨: base.根骨, 机敏: base.机敏, 洞察: base.洞察 },
    { 气血上限: base.hp, 内力上限: base.mp },
    modifiers,
  );

  return {
    ...result.combat,
    ...result.resources,
  };
}

function currentValues(attributes: CurrentAttributes): Record<string, number> {
  return {
    臂力: attributes.臂力,
    根骨: attributes.根骨,
    机敏: attributes.机敏,
    洞察: attributes.洞察,
    气血上限: attributes.hp,
    内力上限: attributes.mp,
  };
}

export function buildItemAttributePreview(
  item: InventoryItem,
  items: InventoryItem[],
  statusEffects: ActiveStatusEffect[],
  baseAttributes: CurrentAttributes,
  attributes: CurrentAttributes,
): AttributePreviewRow[] {
  if (item.type !== 'EQUIP' && item.type !== 'ELIXIR') return [];

  const nextModifiers = collectActiveModifiers(items, statusEffects);
  if (item.type === 'EQUIP') {
    if (item.equipInfo?.isEquipped) return [];

    const slot = item.equipInfo?.slot;
    const replacedItem = items.find(
      candidate =>
        candidate.type === 'EQUIP' &&
        candidate.equipInfo?.isEquipped &&
        Boolean(slot) &&
        candidate.equipInfo.slot === slot,
    );
    addModifiers(nextModifiers, replacedItem?.equipInfo?.modifiers, -1);
    addModifiers(nextModifiers, item.equipInfo?.modifiers);
  } else {
    addModifiers(nextModifiers, item.elixirInfo?.modifiers);
  }

  const current = currentValues(attributes);
  const next = calculateValues(baseAttributes, nextModifiers);

  return PREVIEW_ATTRIBUTES.flatMap(attribute => {
    const delta = next[attribute] - current[attribute];
    return delta === 0
      ? []
      : [{ attribute, currentValue: current[attribute], nextValue: next[attribute], delta }];
  });
}
