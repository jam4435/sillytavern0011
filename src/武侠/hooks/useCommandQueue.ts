/**
 * 指令队列管理 Hook
 * 管理待发送的指令队列
 */

import { useState, useCallback } from 'react';
import { PendingCommand, CommandType } from '../types';
import { restoreItemCount } from '../utils/itemManager';
import { uiLogger } from '../utils/logger';

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

  /**
   * 添加使用物品指令
   * @param itemName 物品名称
   * @param originalCount 原始数量（用于撤销）
   */
  const addUseItemCommand = useCallback((itemName: string, originalCount: number) => {
    const command: PendingCommand = {
      id: `use_item_${Date.now()}_${Math.random()}`,
      type: 'USE_ITEM' as CommandType,
      text: `使用${itemName}`,
      data: {
        itemName,
        originalCount,
      },
      timestamp: Date.now(),
    };

    setCommands(prev => [...prev, command]);
    uiLogger.log('[useCommandQueue] 添加使用物品指令:', command);
  }, []);

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

      // 如果是物品使用指令，需要恢复物品数量
      if (command.type === 'USE_ITEM' && command.data.itemName && command.data.originalCount !== undefined) {
        await restoreItemCount(command.data.itemName, command.data.originalCount);
        uiLogger.log('[useCommandQueue] 恢复物品数量:', command.data.itemName, command.data.originalCount);
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
