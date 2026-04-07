/**
 * 指令队列管理 Hook
 * 管理待发送的指令队列
 */

import { useState, useCallback } from 'react';
import { PendingCommand, CommandType } from '../types';
import { restoreItemCount } from '../utils/itemManager';

export function useCommandQueue() {
  const [commands, setCommands] = useState<PendingCommand[]>([]);

  /**
   * 添加前往地点指令
   * @param location 地点路径
   */
  const addTravelCommand = useCallback((location: string) => {
    const command: PendingCommand = {
      id: `travel_${Date.now()}_${Math.random()}`,
      type: 'TRAVEL' as CommandType,
      text: `前往${location}`,
      data: {
        location
      },
      timestamp: Date.now()
    };

    setCommands(prev => [...prev, command]);
    console.log('[useCommandQueue] 添加前往指令:', command);
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
        originalCount
      },
      timestamp: Date.now()
    };

    setCommands(prev => [...prev, command]);
    console.log('[useCommandQueue] 添加使用物品指令:', command);
  }, []);

  /**
   * 取消指令
   * @param commandId 指令ID
   */
  const cancelCommand = useCallback(async (commandId: string) => {
    const command = commands.find(cmd => cmd.id === commandId);
    if (!command) {
      console.warn('[useCommandQueue] 未找到指令:', commandId);
      return;
    }

    // 如果是物品使用指令，需要恢复物品数量
    if (command.type === 'USE_ITEM' && command.data.itemName && command.data.originalCount !== undefined) {
      await restoreItemCount(command.data.itemName, command.data.originalCount);
      console.log('[useCommandQueue] 恢复物品数量:', command.data.itemName, command.data.originalCount);
    }

    // 从队列中移除
    setCommands(prev => prev.filter(cmd => cmd.id !== commandId));
    console.log('[useCommandQueue] 取消指令:', commandId);
  }, [commands]);

  /**
   * 发送所有指令
   * @param handleSendMessage 发送消息的函数
   */
  const sendAllCommands = useCallback(async (handleSendMessage: (message: string) => void) => {
    if (commands.length === 0) {
      console.warn('[useCommandQueue] 没有待发送的指令');
      return;
    }

    // 合并所有指令文本
    const combinedText = commands.map(cmd => cmd.text).join('\n');
    console.log('[useCommandQueue] 发送所有指令:', combinedText);

    // 调用发送消息函数
    handleSendMessage(combinedText);

    // 清空队列
    setCommands([]);
    console.log('[useCommandQueue] 队列已清空');
  }, [commands]);

  /**
   * 清空队列（不恢复物品）
   */
  const clearQueue = useCallback(() => {
    setCommands([]);
    console.log('[useCommandQueue] 队列已清空（不恢复物品）');
  }, []);

  return {
    commands,
    addTravelCommand,
    addUseItemCommand,
    cancelCommand,
    sendAllCommands,
    clearQueue
  };
}
