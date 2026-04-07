/**
 * 物品管理工具
 * 负责物品数量的增减和恢复操作
 */

declare function getAllVariables(): Record<string, unknown>;
declare function eventEmit(eventName: string, data: unknown): void;

/**
 * 扣减物品数量
 * @param itemName 物品名称
 * @param count 扣减数量（默认为1）
 * @returns 扣减后的数量
 */
export async function decreaseItemCount(itemName: string, count: number = 1): Promise<number> {
  const variables = getAllVariables();
  const user数据 = variables.stat_data?.user数据 as Record<string, unknown> | undefined;

  if (!user数据) {
    console.warn('[itemManager] user数据不存在');
    return 0;
  }

  const 包裹 = user数据.包裹 as Record<string, { 数量?: number }> | undefined;
  if (!包裹 || !包裹[itemName]) {
    console.warn(`[itemManager] 物品 ${itemName} 不存在`);
    return 0;
  }

  const currentCount = 包裹[itemName].数量 || 0;
  const newCount = Math.max(0, currentCount - count);

  if (newCount === 0) {
    // 数量为0时删除物品
    await eventEmit('era:deleteByPath', {
      path: `stat_data.user数据.包裹.${itemName}`
    });
    console.log(`[itemManager] 删除物品: ${itemName}`);
  } else {
    // 更新数量
    await eventEmit('era:updateByObject', {
      stat_data: {
        user数据: {
          包裹: {
            [itemName]: { 数量: newCount }
          }
        }
      }
    });
    console.log(`[itemManager] 更新物品数量: ${itemName} ${currentCount} -> ${newCount}`);
  }

  return newCount;
}

/**
 * 恢复物品数量（用于撤销操作）
 * @param itemName 物品名称
 * @param originalCount 原始数量
 */
export async function restoreItemCount(itemName: string, originalCount: number): Promise<void> {
  const variables = getAllVariables();
  const user数据 = variables.stat_data?.user数据 as Record<string, unknown> | undefined;

  if (!user数据) {
    console.warn('[itemManager] user数据不存在，无法恢复物品');
    return;
  }

  const 包裹 = user数据.包裹 as Record<string, unknown> | undefined;

  if (!包裹) {
    console.warn('[itemManager] 包裹不存在，无法恢复物品');
    return;
  }

  // 如果物品不存在，需要重新插入
  if (!包裹[itemName]) {
    // 这里需要完整的物品信息，但我们只有数量
    // 简化处理：只恢复数量字段
    await eventEmit('era:updateByObject', {
      stat_data: {
        user数据: {
          包裹: {
            [itemName]: { 数量: originalCount }
          }
        }
      }
    });
    console.log(`[itemManager] 恢复物品: ${itemName} 数量: ${originalCount}`);
  } else {
    // 物品存在，只更新数量
    await eventEmit('era:updateByObject', {
      stat_data: {
        user数据: {
          包裹: {
            [itemName]: { 数量: originalCount }
          }
        }
      }
    });
    console.log(`[itemManager] 恢复物品数量: ${itemName} -> ${originalCount}`);
  }
}

/**
 * 获取物品当前数量
 * @param itemName 物品名称
 * @returns 当前数量
 */
export function getItemCount(itemName: string): number {
  const variables = getAllVariables();
  const user数据 = variables.stat_data?.user数据 as Record<string, unknown> | undefined;

  if (!user数据) {
    return 0;
  }

  const 包裹 = user数据.包裹 as Record<string, { 数量?: number }> | undefined;
  if (!包裹 || !包裹[itemName]) {
    return 0;
  }

  return 包裹[itemName].数量 || 0;
}
