import type {
  ActiveStatusEffect,
  CurrentAttributes,
  InventoryAttributeModifierMap,
  InventoryItem,
} from '../types';
import {
  applyAttributeModifiers,
  calculateCappedModifierDelta,
  canonicalModifierAttribute,
  type AttributeModifierKind,
  type AttributeModifierSource,
} from './attributeCalculator';

export interface AttributePreviewRow {
  attribute: string;
  currentValue: number;
  nextValue: number;
  delta: number;
}

const PREVIEW_ATTRIBUTES = ['臂力', '根骨', '机敏', '洞察', '气血上限', '内力上限'] as const;

function getModifierKind(item: InventoryItem): AttributeModifierKind {
  if (item.type === 'EQUIP') {
    return '装备';
  }
  if (item.elixirInfo?.effectType === '永久增幅') {
    return '永久增幅';
  }
  return '临时增幅';
}

function createModifierSource(
  id: string,
  kind: AttributeModifierKind,
  rank?: string,
  modifiers?: InventoryAttributeModifierMap,
): AttributeModifierSource | null {
  return modifiers ? { id, kind, rank, modifiers } : null;
}

function collectActiveSources(items: InventoryItem[], statusEffects: ActiveStatusEffect[]): AttributeModifierSource[] {
  const sources: AttributeModifierSource[] = [];

  for (const item of items) {
    if (item.type === 'EQUIP' && item.equipInfo?.isEquipped) {
      const source = createModifierSource(`装备:${item.name}`, '装备', item.rank, item.equipInfo.modifiers);
      if (source) sources.push(source);
    }
  }
  for (const effect of statusEffects) {
    if (effect.remaining > 0) {
      const source = createModifierSource(
        `状态:${effect.id}`,
        effect.effectType === '永久增幅' ? '永久增幅' : '临时增幅',
        effect.rank,
        effect.modifiers,
      );
      if (source) sources.push(source);
    }
  }

  return sources;
}

function calculateValues(base: CurrentAttributes, sources: AttributeModifierSource[]): Record<string, number> {
  const result = applyAttributeModifiers(
    { 臂力: base.臂力, 根骨: base.根骨, 机敏: base.机敏, 洞察: base.洞察 },
    { 气血上限: base.hp, 内力上限: base.mp },
    sources,
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

function buildRecoveryPreview(item: InventoryItem, attributes: CurrentAttributes): AttributePreviewRow[] {
  const modifiers = item.elixirInfo?.modifiers;
  if (!modifiers) {
    return [];
  }

  const resourceState = {
    气血: {
      attribute: '气血',
      canonical: '气血上限',
      current: attributes.hpCurrent ?? attributes.hp,
      max: attributes.hp,
      delta: 0,
    },
    内力: {
      attribute: '内力',
      canonical: '内力上限',
      current: attributes.mpCurrent ?? attributes.mp,
      max: attributes.mp,
      delta: 0,
    },
  };

  for (const [attribute, percentage] of Object.entries(modifiers)) {
    if (!Number.isFinite(percentage) || percentage <= 0) {
      continue;
    }
    const canonical = canonicalModifierAttribute(attribute);
    const resource = canonical === '气血上限' ? resourceState.气血 : canonical === '内力上限' ? resourceState.内力 : null;
    if (!resource) {
      continue;
    }
    const missing = Math.max(0, resource.max - resource.current - resource.delta);
    const cappedDelta = calculateCappedModifierDelta(resource.max, percentage, item.elixirInfo?.rank, '回复', resource.canonical);
    resource.delta += Math.min(missing, Math.max(0, cappedDelta));
  }

  return Object.values(resourceState).flatMap(resource => {
    if (resource.delta === 0) {
      return [];
    }
    return [{
      attribute: resource.attribute,
      currentValue: resource.current,
      nextValue: resource.current + resource.delta,
      delta: resource.delta,
    }];
  });
}

export function buildItemAttributePreview(
  item: InventoryItem,
  items: InventoryItem[],
  statusEffects: ActiveStatusEffect[],
  baseAttributes: CurrentAttributes,
  attributes: CurrentAttributes,
): AttributePreviewRow[] {
  if (item.type !== 'EQUIP' && item.type !== 'ELIXIR') return [];

  if (item.type === 'ELIXIR') {
    if (item.elixirInfo?.effectType === '回复') {
      return buildRecoveryPreview(item, attributes);
    }
    if (item.elixirInfo?.effectType === '特殊') {
      return [];
    }
  }

  let nextSources = collectActiveSources(items, statusEffects);
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
    if (replacedItem) {
      nextSources = nextSources.filter(source => source.id !== `装备:${replacedItem.name}`);
    }
    const source = createModifierSource(`装备:${item.name}`, '装备', item.rank, item.equipInfo?.modifiers);
    if (source) nextSources.push(source);
  } else {
    const source = createModifierSource(
      `药品:${item.name}`,
      getModifierKind(item),
      item.elixirInfo?.rank || item.rank,
      item.elixirInfo?.modifiers,
    );
    if (source) nextSources.push(source);
  }

  const current = currentValues(attributes);
  const next = calculateValues(baseAttributes, nextSources);

  return PREVIEW_ATTRIBUTES.flatMap(attribute => {
    const delta = next[attribute] - current[attribute];
    return delta === 0
      ? []
      : [{ attribute, currentValue: current[attribute], nextValue: next[attribute], delta }];
  });
}
