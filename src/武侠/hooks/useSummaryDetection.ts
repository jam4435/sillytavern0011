/**
 * 自动总结检测 Hook
 * 监听消息事件，每回合检测是否需要触发总结
 */

import { useCallback, useEffect, useRef } from 'react';
import type { SummarySettings } from '../utils/settingsManager';
import {
  checkSummaryTrigger,
  executeAllPendingSummaries,
  updatePendingQueue,
  getIsSummarizing,
  type SummaryTriggerResult,
  type BatchSummaryResult,
} from '../utils/summaryManager';
import { dataLogger } from '../utils/logger';

export interface UseSummaryDetectionOptions {
  /** 总结设置 */
  summarySettings: SummarySettings;
  /** 总结完成回调 */
  onSummaryComplete?: (results: BatchSummaryResult) => void;
  /** 总结错误回调 */
  onSummaryError?: (error: Error) => void;
  /** 检测状态变化回调 */
  onStatusChange?: (status: SummaryTriggerResult) => void;
}

/**
 * 自动总结检测 Hook
 *
 * 功能：
 * 1. 监听 MESSAGE_RECEIVED 事件
 * 2. 每回合检测角色人物经历条目数
 * 3. 当满足阈值条件时自动触发总结
 *
 * @param options 配置选项
 */
export function useSummaryDetection({
  summarySettings,
  onSummaryComplete,
  onSummaryError,
  onStatusChange,
}: UseSummaryDetectionOptions): void {
  // 使用 ref 保存最新的设置，避免闭包问题
  const settingsRef = useRef(summarySettings);
  settingsRef.current = summarySettings;

  // 使用 ref 保存回调函数
  const onCompleteRef = useRef(onSummaryComplete);
  onCompleteRef.current = onSummaryComplete;

  const onErrorRef = useRef(onSummaryError);
  onErrorRef.current = onSummaryError;

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  // 检测并执行总结的核心函数
  const checkAndExecuteSummary = useCallback(async () => {
    const settings = settingsRef.current;

    // 如果未启用自动总结，跳过
    if (!settings.enabled) {
      dataLogger.log('[useSummaryDetection] 自动总结未启用，跳过检测');
      return;
    }

    // 如果正在执行总结，跳过
    if (getIsSummarizing()) {
      dataLogger.log('[useSummaryDetection] 已有总结任务在执行中，跳过');
      return;
    }

    // 检测是否需要总结
    dataLogger.log('[useSummaryDetection] 开始检测总结条件...');
    const triggerResult = checkSummaryTrigger(settings.thresholds);

    // 通知状态变化
    onStatusChangeRef.current?.(triggerResult);

    // 更新待处理队列
    if (triggerResult.pendingCharacters.length > 0) {
      updatePendingQueue(triggerResult.pendingCharacters);
    }

    // 如果需要触发总结
    if (triggerResult.shouldTrigger) {
      dataLogger.log('[useSummaryDetection] 触发自动总结:', triggerResult.triggerReason);

      try {
        const result = await executeAllPendingSummaries(settings, triggerResult.pendingCharacters);
        dataLogger.log('[useSummaryDetection] 总结完成:', result);
        onCompleteRef.current?.(result);
      } catch (error) {
        dataLogger.error('[useSummaryDetection] 总结失败:', error);
        onErrorRef.current?.(error instanceof Error ? error : new Error(String(error)));
      }
    } else {
      dataLogger.log('[useSummaryDetection] 未达到总结阈值，跳过');
    }
  }, []);

  // 监听消息接收事件
  useEffect(() => {
    // 消息接收事件处理器
    const handleMessageReceived = () => {
      dataLogger.log('[useSummaryDetection] 收到 MESSAGE_RECEIVED 事件');
      // 延迟执行，确保变量已更新
      setTimeout(() => {
        checkAndExecuteSummary();
      }, 500);
    };

    // 注册事件监听
    dataLogger.log('[useSummaryDetection] 注册 MESSAGE_RECEIVED 事件监听');
    const listener = eventOn('MESSAGE_RECEIVED', handleMessageReceived);

    // 清理函数
    return () => {
      dataLogger.log('[useSummaryDetection] 移除 MESSAGE_RECEIVED 事件监听');
      listener.stop();
    };
  }, [checkAndExecuteSummary]);
}

export default useSummaryDetection;
