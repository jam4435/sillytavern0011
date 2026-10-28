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
import { getIsExtraVariableUpdating } from '../utils/extraVariableUpdateManager';

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
 * 1. 监听 wuxia:turn-events-settled 成功事件
 * 2. 使用该回合的 assistant messageId 检测角色人物经历条目数
 * 3. 当满足阈值条件时，将总结事务写回触发楼层
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
  const checkAndExecuteSummary = useCallback(async (triggeringMessageId: number) => {
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

    if (getIsExtraVariableUpdating()) {
      dataLogger.log('[useSummaryDetection] 额外变量更新正在执行，跳过本次总结检测');
      return;
    }

    // 检测是否需要总结
    dataLogger.log('[useSummaryDetection] 开始检测总结条件...');
    const triggerResult = checkSummaryTrigger(settings.thresholds);

    // 通知状态变化
    onStatusChangeRef.current?.(triggerResult);

    // 每轮都用最新扫描结果替换队列，避免已压缩或低于阈值的人物残留。
    updatePendingQueue(triggerResult.pendingCharacters);

    // 如果需要触发总结
    if (triggerResult.shouldTrigger) {
      dataLogger.log('[useSummaryDetection] 触发自动总结:', triggerResult.triggerReason);

      try {
        const result = await executeAllPendingSummaries(
          settings,
          triggerResult.pendingCharacters,
          triggeringMessageId,
        );
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

  // 只在武侠前端确认本回合事件结算成功后检测，避免依赖宿主不保证触发的 MESSAGE_RECEIVED。
  useEffect(() => {
    const listener = eventOn(
      'wuxia:turn-events-settled',
      (detail: { status?: string; messageId?: number; roundId?: string }) => {
        if (detail?.status !== 'success') {
          dataLogger.log('[useSummaryDetection] 回合结算未成功，跳过自动总结', {
            messageId: detail?.messageId,
            status: detail?.status,
          });
          return;
        }

        if (!Number.isInteger(detail.messageId) || (detail.messageId as number) < 0) {
          dataLogger.warn('[useSummaryDetection] 回合结算成功事件缺少有效 messageId，跳过自动总结');
          onErrorRef.current?.(new Error('自动总结未启动：回合结算事件没有有效的写回楼层 ID。'));
          return;
        }

        dataLogger.log('[useSummaryDetection] 收到回合结算成功事件，固定总结写回楼层', {
          messageId: detail.messageId,
          roundId: detail.roundId,
        });
        void checkAndExecuteSummary(detail.messageId as number);
      },
    );

    dataLogger.log('[useSummaryDetection] 已注册 wuxia:turn-events-settled 自动总结监听');
    return () => {
      dataLogger.log('[useSummaryDetection] 移除 wuxia:turn-events-settled 自动总结监听');
      listener.stop();
    };
  }, [checkAndExecuteSummary]);
}

export default useSummaryDetection;
