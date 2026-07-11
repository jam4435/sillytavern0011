/**
 * 指令队列管理 Hook
 * 管理待发送的指令队列
 */

import { useState, useCallback } from 'react';
import { PendingCommand, CommandType } from '../types';
import {
  decrementStatusEffectTurns,
  removePermanentAttributeModifier,
  removeStatusEffect,
  restoreEquipmentState,
  restoreItemCount,
  undoResourceDeltas,
} from '../utils/itemManager';
import { uiLogger } from '../utils/logger';
import { syncPlayerAttributesFromVariables } from '../utils/variableReader';

export function useCommandQueue() {
  const [commands, setCommands] = useState<PendingCommand[]>([]);

  /** 设置唯一的地图移动指令；新目标会替换旧目标。 */
  const setTravelCommand = useCallback((location: string, origin: string) => {
    const target = location.split('/').filter(Boolean).pop() || location;
    const command: PendingCommand = {
      id: `travel_${Date.now()}_${Math.random()}`,
      type: 'TRAVEL' as CommandType,
      text: `[地图指令]从${origin}移动到${target}`,
      data: {
        location,
        origin,
      },
      timestamp: Date.now(),
    };

    setCommands(previous => [...previous.filter(item => item.type !== 'TRAVEL'), command]);
    uiLogger.log('[useCommandQueue] 设置地图指令:', command);
  }, []);

  /** 添加物品/装备指令，并保存撤销所需数据。 */
  const addUseItemCommand = useCallback(
    (commandText: string, data: PendingCommand['data']) => {
      const command: PendingCommand = {
        id: `use_item_${Date.now()}_${Math.random()}`,
        type: 'USE_ITEM' as CommandType,
        text: commandText,
        data,
        timestamp: Date.now(),
      };

      setCommands(prev => [...prev, command]);
      uiLogger.log('[useCommandQueue] 添加使用物品指令:', command);
    },
    [],
  );

  /**
   * 取消指令
   * @param commandId 指令ID
   */
  const cancelCommand = useCallback(
    async (commandId: string) => {
      const command = commands.find(cmd => cmd.id === commandId);
      if (!command) {
        uiLogger.warn('[useCommandQueue] 未找到指令:', commandId);
        return;
      }

      if (command.type === 'USE_ITEM' && command.data.itemName) {
        if (command.data.equipmentRollback) {
          await restoreEquipmentState(command.data.equipmentRollback);
        } else if (command.data.originalItem) {
          await restoreItemCount(command.data.itemName, command.data.originalItem);
        } else if (command.data.originalCount !== undefined) {
          await restoreItemCount(command.data.itemName, command.data.originalCount);
        }
        if (command.data.statusEffectId) {
          await removeStatusEffect(command.data.statusEffectId);
        }
        if (command.data.permanentModifierId) {
          await removePermanentAttributeModifier(command.data.permanentModifierId);
        }
        if (command.data.resourceDeltas) {
          await undoResourceDeltas(command.data.resourceDeltas);
        }
        await syncPlayerAttributesFromVariables();
        uiLogger.log('[useCommandQueue] 恢复物品使用:', command.data.itemName);
      }

      // 从队列中移除
      setCommands(prev => prev.filter(cmd => cmd.id !== commandId));
      uiLogger.log('[useCommandQueue] 取消指令:', commandId);
    },
    [commands],
  );

  /** 将当前队列附加到玩家消息；发送成功后只移除本次附加的指令。 */
  const sendMessageWithCommands = useCallback(
    async (message: string, handleSendMessage: (content: string) => void | Promise<unknown>) => {
      const queuedCommands = commands;
      const combinedMessage = [message.trim(), ...queuedCommands.map(command => command.text)]
        .filter(Boolean)
        .join('\n');

      uiLogger.log('[useCommandQueue] 发送玩家消息并附加指令:', combinedMessage);
      await handleSendMessage(combinedMessage);
      try {
        await decrementStatusEffectTurns();
        await syncPlayerAttributesFromVariables();
      } catch (error) {
        uiLogger.error('[useCommandQueue] 状态效果回合递减失败:', error);
      }

      if (queuedCommands.length > 0) {
        const sentCommandIds = new Set(queuedCommands.map(command => command.id));
        setCommands(previous => previous.filter(command => !sentCommandIds.has(command.id)));
        uiLogger.log('[useCommandQueue] 已移除本次发送的指令');
      }
    },
    [commands],
  );

  /**
   * 清空队列（不恢复物品）
   */
  const clearQueue = useCallback(() => {
    setCommands([]);
    uiLogger.log('[useCommandQueue] 队列已清空（不恢复物品）');
  }, []);

  return {
    commands,
    setTravelCommand,
    addUseItemCommand,
    cancelCommand,
    sendMessageWithCommands,
    clearQueue,
  };
}
