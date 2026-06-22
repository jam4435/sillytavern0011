import { useEffect } from 'react';
import { GameState } from '../types';
import {
  getLastMessageContent,
  parseOptions,
  readGameDataPure,
  scheduleGameDataCompletion,
} from '../utils/variableReader';
import { eventLogger } from '../utils/logger';

interface UseEventListenersOptions {
  updateGameState: (data: Partial<GameState>) => void;
  setCurrentMaintext: (text: string) => void;
  setCurrentOptions: (options: string[]) => void;
  onMessageSent?: (messageId: number) => void;
  onMessageBoundary?: (messageId?: number) => void;
  onChatChanged?: () => void;
  onEraWriteDone?: (detail: unknown) => void;
  onDirectVariableWriteDone?: (detail: unknown) => void;
}

export function useEventListeners({
  updateGameState,
  setCurrentMaintext,
  setCurrentOptions,
  onMessageSent,
  onMessageBoundary,
  onChatChanged,
  onEraWriteDone,
  onDirectVariableWriteDone,
}: UseEventListenersOptions) {
  useEffect(() => {
    eventLogger.log('🎧 注册消息事件监听器');
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
      onEraWriteDone?.(detail);
      scheduleGameDataCompletion('era-write-done', { fullScan: true });
      scheduleRefresh(50);
    };

    const handleDirectWriteDone = (detail?: unknown) => {
      eventLogger.log('[wuxia:directVariableWriteDone] 检测到 direct 变量写入完成，调度纯读刷新');
      onDirectVariableWriteDone?.(detail);
      scheduleGameDataCompletion('direct-write-done', { fullScan: true });
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
      onChatChanged?.();
      handleMessageUpdate(eventData);
    });
    eventLogger.log('注册 era:writeDone 监听器...');
    const writeDoneListener = eventOn('era:writeDone', handleWriteDone);
    eventLogger.log('注册 wuxia:directVariableWriteDone 监听器...');
    const directWriteDoneListener = eventOn('wuxia:directVariableWriteDone', handleDirectWriteDone);
    eventLogger.log('🎧 监听器注册完成');

    return () => {
      eventLogger.log('🛑 取消事件监听器');
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
  ]);
}
