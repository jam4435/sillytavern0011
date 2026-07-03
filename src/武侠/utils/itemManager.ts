/**
 * 物品管理工具
 * 负责物品数量、装备栏和状态效果的变量写入。
 */

import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import type { ActiveStatusEffectVariableData, EquipmentSlots, InventoryItemVariableData } from '../types';
import { gameLogger } from './logger';

declare function getAllVariables(): Record<string, unknown>;

type UserDataRecord = {
  包裹?: Record<string, InventoryItemVariableData>;
  装备栏?: EquipmentSlots;
  状态效果?: Record<string, ActiveStatusEffectVariableData>;
};

export interface UseElixirResult {
  itemName: string;
  originalItem: InventoryItemVariableData;
  newCount: number;
  statusEffectId: string;
}

function getUserData(): UserDataRecord | undefined {
  const variables = getAllVariables();
  const statData = variables.stat_data as { user数据?: UserDataRecord } | undefined;
  return statData?.user数据;
}

function cloneItem(item: InventoryItemVariableData): InventoryItemVariableData {
  return JSON.parse(JSON.stringify(item)) as InventoryItemVariableData;
}

function isEquipment(item?: InventoryItemVariableData): boolean {
  return item?.类型 === '装备' || item?.类型 === '兵器';
}

function isElixir(item?: InventoryItemVariableData): boolean {
  return item?.类型 === '丹药';
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

function normalizeRemainingTurns(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }
  return 0;
}

function createStatusEffectId(itemName: string): string {
  return `${itemName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function writeUserDataPatch(
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
      stat_data: {
        user数据: patch,
      },
    },
    expectedAction: 'apiWrite',
    timeoutMs: 3000,
    timeoutMessage: '物品状态写入请求已发出，但 ERA 没有确认写入完成。',
  });
}

export function getInventoryItemSnapshot(itemName: string): InventoryItemVariableData | null {
  const item = getUserData()?.包裹?.[itemName];
  return item ? cloneItem(item) : null;
}

/**
 * 扣减物品数量。
 * @param itemName 物品名称
 * @param count 扣减数量（默认为1）
 * @returns 扣减后的数量
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
    await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'delete',
      reason: 'item-write-decrease',
      eventName: 'era:deleteByPath',
      attribution: 'background',
      detail: {
        path: `stat_data.user数据.包裹.${itemName}`,
      },
      expectedAction: 'apiWrite',
      timeoutMs: 3000,
      timeoutMessage: `物品 ${itemName} 删除请求已发出，但 ERA 没有确认写入完成。`,
    });
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

export async function equipInventoryItem(itemName: string): Promise<boolean> {
  const user数据 = getUserData();
  const item = user数据?.包裹?.[itemName];

  if (!user数据 || !item) {
    gameLogger.warn(`[itemManager] 物品 ${itemName} 不存在，无法装备`);
    return false;
  }

  if (!isEquipment(item)) {
    gameLogger.warn(`[itemManager] 物品 ${itemName} 不是装备`);
    return false;
  }

  const slot = typeof item.部位 === 'string' ? item.部位.trim() : '';
  if (!slot) {
    gameLogger.warn(`[itemManager] 装备 ${itemName} 缺少部位`);
    return false;
  }

  const currentEquippedItem = user数据.装备栏?.[slot];
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

  const equipmentSlotExists = Boolean(user数据.装备栏 && Object.prototype.hasOwnProperty.call(user数据.装备栏, slot));
  const equipmentPatch = { 装备栏: { [slot]: itemName } };
  const packageStatusPatch = { 包裹: packagePatch };

  await writeUserDataPatch(equipmentPatch, 'item-write-equip-slot', equipmentSlotExists ? 'update' : 'insert');
  await writeUserDataPatch(packageStatusPatch, 'item-write-equip-status');

  gameLogger.log(`[itemManager] 装备物品: ${itemName} -> ${slot}`);
  return true;
}

export async function useElixirItem(itemName: string): Promise<UseElixirResult | null> {
  const originalItem = getInventoryItemSnapshot(itemName);
  if (!originalItem || !isElixir(originalItem)) {
    gameLogger.warn(`[itemManager] 物品 ${itemName} 不是可吞服丹药`);
    return null;
  }

  const duration = normalizeDuration(originalItem.持续时间);
  const statusEffectId = createStatusEffectId(itemName);
  const statusEffect: ActiveStatusEffectVariableData = {
    类型: '丹药',
    来源: itemName,
    属性修正: originalItem.属性修正 || {},
    持续时间: duration,
    剩余时间: duration,
  };

  const newCount = await decreaseItemCount(itemName, 1);
  if ((originalItem.数量 || 0) <= 0 && newCount === 0) {
    return null;
  }

  await writeUserDataPatch(
    {
      状态效果: {
        [statusEffectId]: statusEffect,
      },
    },
    'item-write-elixir-effect',
    'insert',
  );

  gameLogger.log(`[itemManager] 吞服丹药: ${itemName}, 效果=${statusEffectId}`);
  return {
    itemName,
    originalItem,
    newCount,
    statusEffectId,
  };
}

export async function removeStatusEffect(statusEffectId: string): Promise<void> {
  if (!statusEffectId) {
    return;
  }

  await emitSourcedEraVariableWriteAndWait({
    source: 'frontend',
    operation: 'delete',
    reason: 'status-effect-remove',
    eventName: 'era:deleteByPath',
    attribution: 'background',
    detail: {
      path: `stat_data.user数据.状态效果.${statusEffectId}`,
    },
    expectedAction: 'apiWrite',
    timeoutMs: 3000,
    timeoutMessage: `状态效果 ${statusEffectId} 删除请求已发出，但 ERA 没有确认写入完成。`,
  });
  gameLogger.log(`[itemManager] 删除状态效果: ${statusEffectId}`);
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

    const remaining = normalizeRemainingTurns(effect.剩余时间 ?? effect.持续时间);
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
