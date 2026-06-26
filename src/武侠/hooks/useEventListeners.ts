import { useEffect, useRef } from 'react';
import {
  DIRECT_VARIABLE_WRITE_DONE_EVENT,
  ERA_VARIABLE_WRITE_DONE_EVENT,
} from '../../shared/directVariableWrite';
import { GameState } from '../types';
import {
  getLastMessageContent,
  parseOptions,
  readGameDataPure,
  scheduleGameDataCompletion,
} from '../utils/variableReader';
import { eventLogger, getRuntimeDebugInfo, variableTraceLogger } from '../utils/logger';

interface UseEventListenersOptions {
  updateGameState: (data: Partial<GameState>) => void;
  setCurrentMaintext: (text: string) => void;
  setCurrentOptions: (options: string[]) => void;
  onMessageSent?: (messageId: number) => void;
  onMessageBoundary?: (messageId?: number) => void;
  onChatChanged?: () => void;
  onEraWriteDone?: (detail: unknown) => void;
  onDirectVariableWriteDone?: (detail: unknown) => void;
  onEraVariableWriteDone?: (detail: unknown) => void;
}

const UNKNOWN_CHAT_ID = 'unknown';

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

    const refreshGameState = () => {
      const newData = readGameDataPure();
      if (newData) {
        updateGameState(newData);
      }
    };

    const scheduleRefresh = (delay = 0) => {
      if (refreshTimer) {
        return;
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshGameState();
      }, delay);
    };

    const handleMessageUpdate = (eventData?: unknown) => {
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
      onMessageBoundary?.(messageId);
    };

    const handleWriteDone = (detail?: unknown) => {
      eventLogger.log('[era:writeDone] 检测到变量写入完成，调度纯读刷新');
      variableTraceLogger.log('[useEventListeners] 收到 era:writeDone', detail ?? null);
      onEraWriteDone?.(detail);
      scheduleGameDataCompletion('era-write-done', { fullScan: true });
      scheduleRefresh(50);
    };

    const handleDirectWriteDone = (detail?: unknown) => {
      eventLogger.log(`[${DIRECT_VARIABLE_WRITE_DONE_EVENT}] 检测到 direct 变量写入完成，调度纯读刷新`);
      variableTraceLogger.log(`[useEventListeners] 收到 ${DIRECT_VARIABLE_WRITE_DONE_EVENT}`, detail ?? null);
      onDirectVariableWriteDone?.(detail);
      scheduleGameDataCompletion('direct-write-done', { fullScan: true });
      scheduleRefresh(50);
    };

    const handleEraVariableWriteDone = (detail?: unknown) => {
      eventLogger.log(`[${ERA_VARIABLE_WRITE_DONE_EVENT}] 检测到带来源的 ERA 变量写入完成，调度纯读刷新`);
      variableTraceLogger.log(`[useEventListeners] 收到 ${ERA_VARIABLE_WRITE_DONE_EVENT}`, detail ?? null);
      onEraVariableWriteDone?.(detail);
      scheduleGameDataCompletion('era-variable-write-done', { fullScan: true });
      scheduleRefresh(50);
    };

    eventLogger.log('注册 MESSAGE_SENT 监听器...');
    const messageSentListener = eventOn(tavern_events.MESSAGE_SENT, messageId => {
      onMessageSent?.(messageId);
    });
    eventLogger.log('注册 MESSAGE_RECEIVED 监听器...');
    const messageReceivedListener = eventOn(tavern_events.MESSAGE_RECEIVED, handleMessageUpdate);
    eventLogger.log('注册 MESSAGE_SWIPED 监听器...');
    const messageSwipedListener = eventOn(tavern_events.MESSAGE_SWIPED, handleMessageUpdate);
    eventLogger.log('注册 MESSAGE_UPDATED 监听器...');
    const messageUpdatedListener = eventOn(tavern_events.MESSAGE_UPDATED, handleMessageUpdate);
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
        eventLogger.log(`[CHAT_CHANGED] 聊天已切换: ${previousChatId} -> ${nextChatId}`);
        onChatChanged?.();
      } else {
        eventLogger.log(`[CHAT_CHANGED] 聊天未切换，保留当前回合追踪: ${previousChatId}`);
      }

      handleMessageUpdate(eventData);
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
      variableTraceLogger.warn('[useEventListeners] 变量相关监听器即将清理', {
        ...getRuntimeDebugInfo(),
        currentChatId: lastKnownChatIdRef.current,
      });
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      messageSentListener.stop();
      messageReceivedListener.stop();
      messageSwipedListener.stop();
      messageUpdatedListener.stop();
      chatChangedListener.stop();
      writeDoneListener.stop();
      directWriteDoneListener.stop();
      eraVariableWriteDoneListener.stop();
      variableTraceLogger.warn('[useEventListeners] 变量相关监听器已清理完成', {
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
