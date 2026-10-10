import { useEffect, useRef } from 'react';
import {
  DIRECT_VARIABLE_WRITE_DONE_EVENT,
  ERA_VARIABLE_WRITE_DONE_EVENT,
  type DirectVariableWriteRefreshHint,
} from '../../shared/directVariableWrite';
import { GameState } from '../types';
import {
  getLastMessageContent,
  parseOptions,
  readGameDataPure,
  scheduleGameDataCompletion,
} from '../utils/variableReader';
import { eventLogger, getRuntimeDebugInfo, variableTraceLogger } from '../utils/logger';

export type MessageBoundaryReason = 'received' | 'swiped' | 'updated' | 'chat-changed';

interface UseEventListenersOptions {
  updateGameState: (data: Partial<GameState>) => void;
  setCurrentMaintext: (text: string) => void;
  setCurrentOptions: (options: string[]) => void;
  onMessageSent?: (messageId: number) => void;
  onMessageBoundary?: (messageId?: number, reason?: MessageBoundaryReason) => void;
  onChatChanged?: () => void;
  onEraWriteDone?: (detail: unknown) => void;
  onDirectVariableWriteDone?: (detail: unknown) => void;
  onEraVariableWriteDone?: (detail: unknown) => void;
}

const UNKNOWN_CHAT_ID = 'unknown';

const normalizeRefreshHint = (detail: unknown): DirectVariableWriteRefreshHint => {
  const hint = detail && typeof detail === 'object' && !Array.isArray(detail)
    ? (detail as { refreshHint?: unknown }).refreshHint
    : undefined;
  return hint === 'none' || hint === 'event-state' || hint === 'character-data' || hint === 'full'
    ? hint
    : 'full';
};

const getEraWriteSignature = (detail: unknown): string | null => {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return null;
  }

  const writeDone = detail as {
    message_id?: unknown;
    actions?: Record<string, unknown>;
  };
  const messageId = Number.isInteger(writeDone.message_id) ? Number(writeDone.message_id) : null;
  const actions = writeDone.actions && typeof writeDone.actions === 'object' && !Array.isArray(writeDone.actions)
    ? Object.keys(writeDone.actions)
      .filter(action => writeDone.actions?.[action] === true)
      .sort()
    : [];
  return `${messageId ?? 'none'}:${actions.join(',')}`;
};

const normalizeChatId = (value: unknown): string => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || UNKNOWN_CHAT_ID;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return UNKNOWN_CHAT_ID;
};

const readCurrentChatId = (): string => {
  try {
    const currentWindow = globalThis as typeof globalThis & {
      SillyTavern?: { getCurrentChatId?: () => string | number | null | undefined };
    };
    const parentWindow = typeof window !== 'undefined'
      ? window.parent as Window & typeof globalThis & {
        SillyTavern?: { getCurrentChatId?: () => string | number | null | undefined };
      }
      : undefined;
    return normalizeChatId(
      currentWindow.SillyTavern?.getCurrentChatId?.()
      ?? parentWindow?.SillyTavern?.getCurrentChatId?.(),
    );
  } catch {
    return UNKNOWN_CHAT_ID;
  }
};

export function useEventListeners({
  updateGameState,
  setCurrentMaintext,
  setCurrentOptions,
  onMessageSent,
  onMessageBoundary,
  onChatChanged,
  onEraWriteDone,
  onDirectVariableWriteDone,
  onEraVariableWriteDone,
}: UseEventListenersOptions) {
  const lastKnownChatIdRef = useRef(readCurrentChatId());

  useEffect(() => {
    eventLogger.log('🎧 注册消息事件监听器');
    variableTraceLogger.log('[useEventListeners] 开始注册变量相关监听器', {
      ...getRuntimeDebugInfo(),
      currentChatId: lastKnownChatIdRef.current,
    });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let rawEraCompletionTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRawEraSignature: string | null = null;
    let activeEventRound: { roundId: string; chatId: string } | null = null;
    let deferredGameRefresh = false;

    // 在一个回合的 ERA 与事件脚本都确认之前，不把“新地点 + 旧后续线索”
    // 作为中间态刷新进卷轴。只缓冲 UI 投影，不修改 stat_data 或伪造参与事件。
    const refreshGameState = () => {
      if (activeEventRound) {
        deferredGameRefresh = true;
        return;
      }
      const newData = readGameDataPure();
      if (newData) {
        updateGameState(newData);
      }
    };

    const scheduleRefresh = (delay = 0) => {
      if (activeEventRound) {
        deferredGameRefresh = true;
        return;
      }
      if (refreshTimer) {
        return;
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshGameState();
      }, delay);
    };

    const releaseDeferredRefresh = () => {
      activeEventRound = null;
      if (deferredGameRefresh) {
        deferredGameRefresh = false;
        scheduleRefresh();
      }
    };

    const isMatchingEventRound = (detail: { roundId?: unknown; chatId?: unknown }) =>
      activeEventRound !== null &&
      detail?.roundId === activeEventRound.roundId &&
      (!detail.chatId || detail.chatId === activeEventRound.chatId);

    const scheduleCompletionForHint = (reason: string, refreshHint: DirectVariableWriteRefreshHint) => {
      if (refreshHint === 'none' || refreshHint === 'event-state') {
        return;
      }
      // character-data 尚未携带可安全裁剪的 scope，保留 fullScan 以兼容旧写入调用。
      scheduleGameDataCompletion(reason, { fullScan: true });
    };

    const scheduleRawEraCompletion = (detail?: unknown) => {
      if (rawEraCompletionTimer) {
        clearTimeout(rawEraCompletionTimer);
      }
      pendingRawEraSignature = getEraWriteSignature(detail);
      rawEraCompletionTimer = setTimeout(() => {
        rawEraCompletionTimer = null;
        pendingRawEraSignature = null;
        scheduleCompletionForHint('era-write-done', 'full');
        scheduleRefresh(50);
      }, 0);
    };

    const handleMessageUpdate = (
      eventData: unknown,
      boundaryReason: MessageBoundaryReason,
    ) => {
      eventLogger.log('收到消息更新事件:', eventData);
      variableTraceLogger.log('[useEventListeners] 收到消息边界事件', {
        eventData,
        normalizedMessageId: Number.isInteger(eventData) ? Number(eventData) : null,
      });
      scheduleRefresh();
      scheduleGameDataCompletion('message-boundary', { fullScan: true });

      const lastContent = getLastMessageContent();
      eventLogger.log('getLastMessageContent 返回长度:', lastContent.length);

      if (lastContent) {
        const maintext = lastContent;
        const options = parseOptions(lastContent);

        setCurrentMaintext(maintext);
        setCurrentOptions(options);
        eventLogger.log('✅ 前端状态已更新');
      } else {
        eventLogger.warn('⚠️ 没有消息内容，跳过更新');
      }

      const messageId = Number.isInteger(eventData) ? Number(eventData) : undefined;
      onMessageBoundary?.(messageId, boundaryReason);
    };

    const handleWriteDone = (detail?: unknown) => {
      eventLogger.log('[era:writeDone] 检测到变量写入完成，调度纯读刷新');
      variableTraceLogger.log('[useEventListeners] 收到 era:writeDone', detail ?? null);
      onEraWriteDone?.(detail);
      // sourced 完成事件通常紧随 raw writeDone 发出。将 raw 的补全延后一个宏任务，
      // 让 sourced 事件可以取消它，避免同一次 ERA 写入触发两次 fullScan。
      scheduleRawEraCompletion(detail);
    };

    const handleDirectWriteDone = (detail?: unknown) => {
      eventLogger.log(`[${DIRECT_VARIABLE_WRITE_DONE_EVENT}] 检测到 direct 变量写入完成，调度纯读刷新`);
      variableTraceLogger.log(`[useEventListeners] 收到 ${DIRECT_VARIABLE_WRITE_DONE_EVENT}`, detail ?? null);
      onDirectVariableWriteDone?.(detail);
      const refreshHint = normalizeRefreshHint(detail);
      scheduleCompletionForHint('direct-write-done', refreshHint);
      if (refreshHint !== 'none') {
        scheduleRefresh(50);
      }
    };

    const handleEraVariableWriteDone = (detail?: unknown) => {
      eventLogger.log(`[${ERA_VARIABLE_WRITE_DONE_EVENT}] 检测到带来源的 ERA 变量写入完成，调度纯读刷新`);
      variableTraceLogger.log(`[useEventListeners] 收到 ${ERA_VARIABLE_WRITE_DONE_EVENT}`, detail ?? null);
      onEraVariableWriteDone?.(detail);
      const refreshHint = normalizeRefreshHint(detail);
      const sourcedSignature = getEraWriteSignature(detail);
      if (
        rawEraCompletionTimer
        && pendingRawEraSignature !== null
        && sourcedSignature !== null
        && pendingRawEraSignature === sourcedSignature
      ) {
        clearTimeout(rawEraCompletionTimer);
        rawEraCompletionTimer = null;
        pendingRawEraSignature = null;
        variableTraceLogger.log('[useEventListeners] sourced ERA 完成事件已合并 raw writeDone 刷新', {
          signature: sourcedSignature,
        });
      }
      scheduleCompletionForHint('era-variable-write-done', refreshHint);
      if (refreshHint !== 'none') {
        scheduleRefresh(50);
      }
    };

    eventLogger.log('注册 MESSAGE_SENT 监听器...');
    const messageSentListener = eventOn(tavern_events.MESSAGE_SENT, messageId => {
      onMessageSent?.(messageId);
    });
    eventLogger.log('注册 MESSAGE_RECEIVED 监听器...');
    const messageReceivedListener = eventOn(tavern_events.MESSAGE_RECEIVED, eventData =>
      handleMessageUpdate(eventData, 'received'));
    eventLogger.log('注册 MESSAGE_SWIPED 监听器...');
    const messageSwipedListener = eventOn(tavern_events.MESSAGE_SWIPED, eventData =>
      handleMessageUpdate(eventData, 'swiped'));
    eventLogger.log('注册 MESSAGE_UPDATED 监听器...');
    const messageUpdatedListener = eventOn(tavern_events.MESSAGE_UPDATED, eventData =>
      handleMessageUpdate(eventData, 'updated'));
    eventLogger.log('注册 CHAT_CHANGED 监听器...');
    const chatChangedListener = eventOn(tavern_events.CHAT_CHANGED, eventData => {
      const previousChatId = lastKnownChatIdRef.current;
      const nextChatId = normalizeChatId(eventData) !== UNKNOWN_CHAT_ID
        ? normalizeChatId(eventData)
        : readCurrentChatId();
      const didKnownChatChange =
        previousChatId !== UNKNOWN_CHAT_ID
        && nextChatId !== UNKNOWN_CHAT_ID
        && previousChatId !== nextChatId;

      if (nextChatId !== UNKNOWN_CHAT_ID) {
        lastKnownChatIdRef.current = nextChatId;
      }

      if (didKnownChatChange) {
        // 历史分叉或切换聊天时，旧聊天的 roundId 不能阻塞新聊天的 UI 投影。
        activeEventRound = null;
        deferredGameRefresh = false;
        if (refreshTimer) {
          clearTimeout(refreshTimer);
          refreshTimer = null;
        }
        eventLogger.log(`[CHAT_CHANGED] 聊天已切换: ${previousChatId} -> ${nextChatId}`);
        onChatChanged?.();
      } else {
        eventLogger.log(`[CHAT_CHANGED] 聊天未切换，保留当前回合追踪: ${previousChatId}`);
      }

      handleMessageUpdate(eventData, 'chat-changed');
    });
    // 与事件脚本的回合写入屏障使用同一个 roundId。成功在事件状态确认后刷新，
    // 失败/取消由 lifecycle.finish 兜底，避免把旧状态永远留在界面上。
    const eventTurnLifecycleListener = eventOn('wuxia:turn-lifecycle', (detail: {
      phase?: string; roundId?: string; chatId?: string;
    }) => {
      if (detail?.phase === 'start' && detail.roundId) {
        activeEventRound = { roundId: detail.roundId, chatId: detail.chatId || '' };
        if (refreshTimer) {
          clearTimeout(refreshTimer);
          refreshTimer = null;
          deferredGameRefresh = true;
        }
      } else if (detail?.phase === 'finish' && isMatchingEventRound(detail)) {
        releaseDeferredRefresh();
      }
    });
    const eventTurnSettledListener = eventOn('wuxia:turn-events-settled', (detail: {
      roundId?: string; chatId?: string; status?: string;
    }) => {
      if (isMatchingEventRound(detail)) {
        // 无论确认成功或失败，都只在事件检查结束/失败后统一读取真实状态。
        deferredGameRefresh = true;
        releaseDeferredRefresh();
      }
    });
    const eventAdmissionConfirmedListener = eventOn('wuxia:event-admission-confirmed', () => {
      // 这一信号只能在事务 + stat_data 回读确认后由事件脚本发送。
      // 允许它越过本回合的一般刷新缓冲，让卷轴和“进入事件”弹窗同一轮展示。
      const committedData = readGameDataPure();
      if (committedData) updateGameState(committedData);
    });
    eventLogger.log('注册 era:writeDone 监听器...');
    const writeDoneListener = eventOn('era:writeDone', handleWriteDone);
    eventLogger.log(`注册 ${DIRECT_VARIABLE_WRITE_DONE_EVENT} 监听器...`);
    const directWriteDoneListener = eventOn(DIRECT_VARIABLE_WRITE_DONE_EVENT, handleDirectWriteDone);
    eventLogger.log(`注册 ${ERA_VARIABLE_WRITE_DONE_EVENT} 监听器...`);
    const eraVariableWriteDoneListener = eventOn(ERA_VARIABLE_WRITE_DONE_EVENT, handleEraVariableWriteDone);
    eventLogger.log('🎧 监听器注册完成');
    variableTraceLogger.log('[useEventListeners] 变量相关监听器注册完成', {
      ...getRuntimeDebugInfo(),
      currentChatId: lastKnownChatIdRef.current,
    });

    return () => {
      eventLogger.log('🛑 取消事件监听器');
      variableTraceLogger.log('[useEventListeners] 变量相关监听器即将清理', {
        ...getRuntimeDebugInfo(),
        currentChatId: lastKnownChatIdRef.current,
      });
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      if (rawEraCompletionTimer) {
        clearTimeout(rawEraCompletionTimer);
      }
      messageSentListener.stop();
      messageReceivedListener.stop();
      messageSwipedListener.stop();
      messageUpdatedListener.stop();
      chatChangedListener.stop();
      writeDoneListener.stop();
      eventTurnLifecycleListener.stop();
      eventTurnSettledListener.stop();
      eventAdmissionConfirmedListener.stop();
      directWriteDoneListener.stop();
      eraVariableWriteDoneListener.stop();
      variableTraceLogger.log('[useEventListeners] 变量相关监听器已清理完成', {
        ...getRuntimeDebugInfo(),
        currentChatId: lastKnownChatIdRef.current,
      });
    };
  }, [
    updateGameState,
    setCurrentMaintext,
    setCurrentOptions,
    onMessageSent,
    onMessageBoundary,
    onChatChanged,
    onEraWriteDone,
    onDirectVariableWriteDone,
    onEraVariableWriteDone,
  ]);
}
