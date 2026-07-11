/**
 * 物品管理工具
 * 负责物品数量、装备栏、状态效果、永久修正和资源当前值的变量写入。
 */

import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import type {
  ActiveStatusEffectVariableData,
  EquipmentRollbackData,
  EquipmentSlots,
  FrontendVariableData,
  InventoryAttributeModifierMap,
  InventoryItemVariableData,
  ItemEffectType,
  PermanentAttributeModifierVariableData,
  ResourceDeltaMap,
} from '../types';
import { calculateCappedModifierDelta, canonicalModifierAttribute } from './attributeCalculator';
import { gameLogger } from './logger';

declare function getAllVariables(): Record<string, unknown>;

type UserAttributeRecord = {
  气血?: string | number;
  内力?: string | number;
  臂力?: number;
  根骨?: number;
  机敏?: number;
  洞察?: number;
};

type UserDataRecord = {
  包裹?: Record<string, InventoryItemVariableData>;
  装备栏?: EquipmentSlots;
  状态效果?: Record<string, ActiveStatusEffectVariableData>;
  属性?: UserAttributeRecord;
};

type StatDataRecord = {
  user数据?: UserDataRecord;
  前端变量?: FrontendVariableData;
};

interface ResourcePair {
  current: number;
  max: number;
}

export interface EquipInventoryItemResult {
  itemName: string;
  commandText: string;
  rollback: EquipmentRollbackData;
}

export interface UseMedicineResult {
  itemName: string;
  originalItem: InventoryItemVariableData;
  newCount: number;
  commandText: string;
  statusEffectId?: string;
  permanentModifierId?: string;
  resourceDeltas?: ResourceDeltaMap;
}

function getStatData(): StatDataRecord | undefined {
  const variables = getAllVariables();
  return variables.stat_data as StatDataRecord | undefined;
}

function getUserData(): UserDataRecord | undefined {
  return getStatData()?.user数据;
}

function getFrontendVariables(): FrontendVariableData | undefined {
  return getStatData()?.前端变量;
}

function cloneItem(item: InventoryItemVariableData): InventoryItemVariableData {
  return JSON.parse(JSON.stringify(item)) as InventoryItemVariableData;
}

function isEquipment(item?: InventoryItemVariableData): boolean {
  return item?.类型 === '装备';
}

function isMedicine(item?: InventoryItemVariableData): boolean {
  return item?.类型 === '药品';
}

function normalizeEffectType(value: unknown): ItemEffectType | null {
  return value === '回复' || value === '临时增幅' || value === '永久增幅' || value === '特殊' ? value : null;
}

function normalizeDuration(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
  }
  return 1;
}

function normalizeRemainingTime(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }
  return 0;
}

function createEffectId(itemName: string): string {
  return `${itemName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function writeStatDataPatch(
  patch: Record<string, unknown>,
  reason: string,
  operation: 'insert' | 'update' = 'update',
): Promise<void> {
  await emitSourcedEraVariableWriteAndWait({
    source: 'frontend',
    operation,
    reason,
    eventName: operation === 'insert' ? 'era:insertByObject' : 'era:updateByObject',
    attribution: 'background',
    detail: {
      stat_data: patch,
    },
    expectedAction: 'apiWrite',
    timeoutMs: 3000,
    timeoutMessage: '物品状态写入请求已发出，但 ERA 没有确认写入完成。',
  });
}

async function writeUserDataPatch(
  patch: Record<string, unknown>,
  reason: string,
  operation: 'insert' | 'update' = 'update',
): Promise<void> {
  await writeStatDataPatch({ user数据: patch }, reason, operation);
}

async function deleteVariablePath(path: string, reason: string, timeoutMessage: string): Promise<void> {
  await emitSourcedEraVariableWriteAndWait({
    source: 'frontend',
    operation: 'delete',
    reason,
    eventName: 'era:deleteByPath',
    attribution: 'background',
    detail: { path },
    expectedAction: 'apiWrite',
    timeoutMs: 3000,
    timeoutMessage,
  });
}

function clampResourceCurrent(current: number, max: number): number {
  return Math.max(0, Math.min(Math.floor(current), Math.max(0, Math.floor(max))));
}

function parseResourcePair(value: string | number | undefined, defaultMax = 0): ResourcePair {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const max = Math.max(0, Math.floor(value));
    return { current: max, max };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const parts = trimmed.split('/');
    if (parts.length === 2) {
      const current = Number(parts[0]);
      const max = Number(parts[1]);
      if (Number.isFinite(current) && Number.isFinite(max)) {
        const normalizedMax = Math.max(0, Math.floor(max));
        return {
          current: clampResourceCurrent(current, normalizedMax),
          max: normalizedMax,
        };
      }
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      const max = Math.max(0, Math.floor(parsed));
      return { current: max, max };
    }
  }

  const max = Math.max(0, Math.floor(defaultMax));
  return { current: max, max };
}

function formatResourcePair(pair: ResourcePair): string {
  return `${pair.current}/${pair.max}`;
}

function getResourcePairs(): { 气血: ResourcePair; 内力: ResourcePair } {
  const attrs = getUserData()?.属性;
  return {
    气血: parseResourcePair(attrs?.气血, 0),
    内力: parseResourcePair(attrs?.内力, 0),
  };
}

function normalizeResourceDeltas(deltas: ResourceDeltaMap): ResourceDeltaMap {
  const result: ResourceDeltaMap = {};
  if (Number.isFinite(deltas.气血)) {
    result.气血 = Math.trunc(Number(deltas.气血));
  }
  if (Number.isFinite(deltas.内力)) {
    result.内力 = Math.trunc(Number(deltas.内力));
  }
  return result;
}

function invertResourceDeltas(deltas: ResourceDeltaMap): ResourceDeltaMap {
  return Object.fromEntries(
    Object.entries(deltas).map(([resource, delta]) => [resource, -Number(delta)]),
  ) as ResourceDeltaMap;
}

function formatResourceDeltaSummary(deltas?: ResourceDeltaMap): string {
  if (!deltas) {
    return '';
  }
  return Object.entries(deltas)
    .filter(([, delta]) => Number.isFinite(delta) && Number(delta) !== 0)
    .map(([resource, delta]) => `${resource}已${Number(delta) >= 0 ? '恢复' : '减少'}${Math.abs(Number(delta))}`)
    .join('，');
}

function formatModifierSummary(modifiers?: InventoryAttributeModifierMap): string {
  if (!modifiers) {
    return '';
  }
  return Object.entries(modifiers)
    .filter(([, value]) => Number.isFinite(value) && Number(value) !== 0)
    .map(([attribute, value]) => `${attribute}${Number(value) >= 0 ? '+' : ''}${value}%`)
    .join('，');
}

export function getInventoryItemSnapshot(itemName: string): InventoryItemVariableData | null {
  const item = getUserData()?.包裹?.[itemName];
  return item ? cloneItem(item) : null;
}

/**
 * 扣减物品数量。
 */
export async function decreaseItemCount(itemName: string, count: number = 1): Promise<number> {
  const user数据 = getUserData();

  if (!user数据) {
    gameLogger.warn('[itemManager] user数据不存在');
    return 0;
  }

  const 包裹 = user数据.包裹;
  if (!包裹 || !包裹[itemName]) {
    gameLogger.warn(`[itemManager] 物品 ${itemName} 不存在`);
    return 0;
  }

  const currentCount = 包裹[itemName].数量 || 0;
  const newCount = Math.max(0, currentCount - count);

  if (newCount === 0) {
    await deleteVariablePath(
      `stat_data.user数据.包裹.${itemName}`,
      'item-write-decrease',
      `物品 ${itemName} 删除请求已发出，但 ERA 没有确认写入完成。`,
    );
    gameLogger.log(`[itemManager] 删除物品: ${itemName}`);
  } else {
    await writeUserDataPatch(
      {
        包裹: {
          [itemName]: { 数量: newCount },
        },
      },
      'item-write-decrease',
    );
    gameLogger.log(`[itemManager] 更新物品数量: ${itemName} ${currentCount} -> ${newCount}`);
  }

  return newCount;
}

/**
 * 恢复物品。优先使用完整物品快照；number 参数保留给旧调用。
 */
export async function restoreItemCount(
  itemName: string,
  originalItemOrCount: InventoryItemVariableData | number,
): Promise<void> {
  const user数据 = getUserData();

  if (!user数据) {
    gameLogger.warn('[itemManager] user数据不存在，无法恢复物品');
    return;
  }

  const 包裹 = user数据.包裹;
  if (!包裹) {
    gameLogger.warn('[itemManager] 包裹不存在，无法恢复物品');
    return;
  }

  const restoredItem =
    typeof originalItemOrCount === 'number' ? { 数量: originalItemOrCount } : cloneItem(originalItemOrCount);
  const operation = 包裹[itemName] ? 'update' : 'insert';

  await writeUserDataPatch(
    {
      包裹: {
        [itemName]: restoredItem,
      },
    },
    'item-write-restore',
    operation,
  );
  gameLogger.log(`[itemManager] 恢复物品: ${itemName}`);
}

export async function equipInventoryItem(itemName: string): Promise<EquipInventoryItemResult | null> {
  const user数据 = getUserData();
  const item = user数据?.包裹?.[itemName];

  if (!user数据 || !item) {
    gameLogger.warn(`[itemManager] 物品 ${itemName} 不存在，无法装备`);
    return null;
  }

  if (!isEquipment(item)) {
    gameLogger.warn(`[itemManager] 物品 ${itemName} 不是装备`);
    return null;
  }

  const slot = typeof item.部位 === 'string' ? item.部位.trim() : '';
  if (!slot) {
    gameLogger.warn(`[itemManager] 装备 ${itemName} 缺少部位`);
    return null;
  }

  const currentEquippedItem = user数据.装备栏?.[slot];
  const rollback: EquipmentRollbackData = {
    slot,
    previousItemName: currentEquippedItem,
    previousItem: currentEquippedItem ? user数据.包裹?.[currentEquippedItem] && cloneItem(user数据.包裹[currentEquippedItem]) : undefined,
    newItemName: itemName,
    newItem: cloneItem(item),
    equipmentSlotExisted: Boolean(user数据.装备栏 && Object.prototype.hasOwnProperty.call(user数据.装备栏, slot)),
  };

  const packagePatch: Record<string, InventoryItemVariableData> = {
    [itemName]: {
      ...cloneItem(item),
      使用状态: '装备中',
    },
  };

  if (currentEquippedItem && currentEquippedItem !== itemName && user数据.包裹?.[currentEquippedItem]) {
    packagePatch[currentEquippedItem] = {
      ...cloneItem(user数据.包裹[currentEquippedItem]),
      使用状态: '',
    };
  }

  await writeUserDataPatch(
    {
      装备栏: { [slot]: itemName },
    },
    'item-write-equip-slot',
    rollback.equipmentSlotExisted ? 'update' : 'insert',
  );
  await writeUserDataPatch(
    {
      包裹: packagePatch,
    },
    'item-write-equip-status',
  );

  gameLogger.log(`[itemManager] 装备物品: ${itemName} -> ${slot}`);
  return {
    itemName,
    rollback,
    commandText: `装备${itemName}，（属性已变化）`,
  };
}

export async function restoreEquipmentState(rollback: EquipmentRollbackData): Promise<void> {
  if (!rollback.equipmentSlotExisted) {
    await deleteVariablePath(
      `stat_data.user数据.装备栏.${rollback.slot}`,
      'item-write-equip-restore-slot',
      `装备栏 ${rollback.slot} 删除请求已发出，但 ERA 没有确认写入完成。`,
    );
  } else {
    await writeUserDataPatch(
      {
        装备栏: {
          [rollback.slot]: rollback.previousItemName || '',
        },
      },
      'item-write-equip-restore-slot',
    );
  }

  const packagePatch: Record<string, InventoryItemVariableData> = {
    [rollback.newItemName]: cloneItem(rollback.newItem),
  };
  if (rollback.previousItemName && rollback.previousItem) {
    packagePatch[rollback.previousItemName] = cloneItem(rollback.previousItem);
  }

  await writeUserDataPatch(
    {
      包裹: packagePatch,
    },
    'item-write-equip-restore-status',
  );
  gameLogger.log(`[itemManager] 恢复装备状态: ${rollback.newItemName}`);
}

export async function applyResourceDeltas(deltas: ResourceDeltaMap): Promise<ResourceDeltaMap> {
  const normalized = normalizeResourceDeltas(deltas);
  if (!normalized.气血 && !normalized.内力) {
    return {};
  }

  const pairs = getResourcePairs();
  const nextAttributes: UserAttributeRecord = {};
  const actualDeltas: ResourceDeltaMap = {};

  if (normalized.气血) {
    const nextCurrent = clampResourceCurrent(pairs.气血.current + normalized.气血, pairs.气血.max);
    actualDeltas.气血 = nextCurrent - pairs.气血.current;
    nextAttributes.气血 = formatResourcePair({ current: nextCurrent, max: pairs.气血.max });
  }
  if (normalized.内力) {
    const nextCurrent = clampResourceCurrent(pairs.内力.current + normalized.内力, pairs.内力.max);
    actualDeltas.内力 = nextCurrent - pairs.内力.current;
    nextAttributes.内力 = formatResourcePair({ current: nextCurrent, max: pairs.内力.max });
  }

  await writeUserDataPatch(
    {
      属性: nextAttributes,
    },
    'item-write-resource-delta',
  );

  return normalizeResourceDeltas(actualDeltas);
}

function calculateRecoveryDeltas(item: InventoryItemVariableData): ResourceDeltaMap {
  const modifiers = item.属性修正 || {};
  const pairs = getResourcePairs();
  const deltas: ResourceDeltaMap = {};

  for (const [attribute, percentage] of Object.entries(modifiers)) {
    if (!Number.isFinite(percentage) || percentage <= 0) {
      continue;
    }
    const canonical = canonicalModifierAttribute(attribute);
    if (canonical !== '气血上限' && canonical !== '内力上限') {
      continue;
    }

    const resource = canonical === '气血上限' ? '气血' : '内力';
    const pair = pairs[resource];
    const missing = Math.max(0, pair.max - pair.current);
    const cappedDelta = calculateCappedModifierDelta(pair.max, percentage, item.品阶, '回复', canonical);
    const actualDelta = Math.min(missing, Math.max(0, cappedDelta));
    if (actualDelta > 0) {
      deltas[resource] = (deltas[resource] ?? 0) + actualDelta;
    }
  }

  return normalizeResourceDeltas(deltas);
}

async function writeStatusEffect(statusEffectId: string, statusEffect: ActiveStatusEffectVariableData): Promise<void> {
  await writeUserDataPatch(
    {
      状态效果: {
        [statusEffectId]: statusEffect,
      },
    },
    'item-write-medicine-effect',
    'insert',
  );
}

async function writePermanentAttributeModifier(
  modifierId: string,
  modifier: PermanentAttributeModifierVariableData,
): Promise<void> {
  const current = getFrontendVariables()?.永久属性修正;
  await writeStatDataPatch(
    {
      前端变量: {
        永久属性修正: {
          [modifierId]: modifier,
        },
      },
    },
    'item-write-permanent-modifier',
    current && Object.prototype.hasOwnProperty.call(current, modifierId) ? 'update' : 'insert',
  );
}

export async function removeStatusEffect(statusEffectId: string): Promise<void> {
  if (!statusEffectId) {
    return;
  }

  await deleteVariablePath(
    `stat_data.user数据.状态效果.${statusEffectId}`,
    'status-effect-remove',
    `状态效果 ${statusEffectId} 删除请求已发出，但 ERA 没有确认写入完成。`,
  );
  gameLogger.log(`[itemManager] 删除状态效果: ${statusEffectId}`);
}

export async function removePermanentAttributeModifier(modifierId: string): Promise<void> {
  if (!modifierId) {
    return;
  }

  await deleteVariablePath(
    `stat_data.前端变量.永久属性修正.${modifierId}`,
    'permanent-modifier-remove',
    `永久属性修正 ${modifierId} 删除请求已发出，但 ERA 没有确认写入完成。`,
  );
  gameLogger.log(`[itemManager] 删除永久属性修正: ${modifierId}`);
}

export async function undoResourceDeltas(deltas: ResourceDeltaMap): Promise<void> {
  await applyResourceDeltas(invertResourceDeltas(deltas));
}

export async function useMedicineItem(itemName: string): Promise<UseMedicineResult | null> {
  const originalItem = getInventoryItemSnapshot(itemName);
  if (!originalItem || !isMedicine(originalItem)) {
    gameLogger.warn(`[itemManager] 物品 ${itemName} 不是可使用药品`);
    return null;
  }
  if ((originalItem.数量 || 0) <= 0) {
    gameLogger.warn(`[itemManager] 药品 ${itemName} 数量不足`);
    return null;
  }

  const effectType = normalizeEffectType(originalItem.功效类型);
  if (!effectType) {
    gameLogger.warn(`[itemManager] 药品 ${itemName} 缺少有效功效类型`);
    return null;
  }

  let newCount = 0;
  try {
    if (effectType === '回复') {
      const recoveryDeltas = calculateRecoveryDeltas(originalItem);
      if (!recoveryDeltas.气血 && !recoveryDeltas.内力) {
        gameLogger.warn(`[itemManager] 药品 ${itemName} 没有可恢复的气血或内力`);
        return null;
      }
      newCount = await decreaseItemCount(itemName, 1);
      const actualDeltas = await applyResourceDeltas(recoveryDeltas);
      return {
        itemName,
        originalItem,
        newCount,
        resourceDeltas: actualDeltas,
        commandText: `使用${itemName}，（${formatResourceDeltaSummary(actualDeltas)}）`,
      };
    }

    if (effectType === '临时增幅') {
      const duration = normalizeDuration(originalItem.持续时间);
      const statusEffectId = createEffectId(itemName);
      const statusEffect: ActiveStatusEffectVariableData = {
        类型: '药品',
        功效类型: '临时增幅',
        来源: itemName,
        品阶: originalItem.品阶,
        属性修正: originalItem.属性修正 || {},
        持续时间: duration,
        剩余时间: duration,
      };
      newCount = await decreaseItemCount(itemName, 1);
      await writeStatusEffect(statusEffectId, statusEffect);
      const summary = formatModifierSummary(originalItem.属性修正) || '属性已变化';
      return {
        itemName,
        originalItem,
        newCount,
        statusEffectId,
        commandText: `使用${itemName}，（${summary}，持续${duration}时）`,
      };
    }

    if (effectType === '永久增幅') {
      const permanentModifierId = createEffectId(itemName);
      const modifier: PermanentAttributeModifierVariableData = {
        类型: '药品',
        功效类型: '永久增幅',
        来源: itemName,
        品阶: originalItem.品阶,
        属性修正: originalItem.属性修正 || {},
      };
      newCount = await decreaseItemCount(itemName, 1);
      await writePermanentAttributeModifier(permanentModifierId, modifier);
      const summary = formatModifierSummary(originalItem.属性修正) || '根基已变化';
      return {
        itemName,
        originalItem,
        newCount,
        permanentModifierId,
        commandText: `使用${itemName}，（${summary}，永久生效）`,
      };
    }

    newCount = await decreaseItemCount(itemName, 1);
    return {
      itemName,
      originalItem,
      newCount,
      commandText: `使用${itemName}，（“${originalItem.物品描述 || '此物效果请在剧情中体现'}”，请在剧情中体现）`,
    };
  } catch (error) {
    await restoreItemCount(itemName, originalItem);
    throw error;
  }
}

export async function decrementStatusEffectTurns(): Promise<void> {
  const 状态效果 = getUserData()?.状态效果;
  if (!状态效果 || typeof 状态效果 !== 'object') {
    return;
  }

  const updates: Record<string, { 剩余时间: number }> = {};
  const expiredEffectIds: string[] = [];

  for (const [effectId, effect] of Object.entries(状态效果)) {
    if (effectId.startsWith('$')) {
      continue;
    }

    const remaining = normalizeRemainingTime(effect.剩余时间 ?? effect.持续时间);
    const nextRemaining = remaining - 1;
    if (nextRemaining <= 0) {
      expiredEffectIds.push(effectId);
    } else {
      updates[effectId] = { 剩余时间: nextRemaining };
    }
  }

  if (Object.keys(updates).length > 0) {
    await writeUserDataPatch(
      {
        状态效果: updates,
      },
      'status-effect-decrement',
    );
  }

  for (const effectId of expiredEffectIds) {
    await removeStatusEffect(effectId);
  }
}

/**
 * 获取物品当前数量。
 */
export function getItemCount(itemName: string): number {
  const item = getUserData()?.包裹?.[itemName];
  return item?.数量 || 0;
}
