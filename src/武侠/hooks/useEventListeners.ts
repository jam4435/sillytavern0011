import { useEffect } from 'react';
import { GameState } from '../types';
import {
  getLastMessageContent,
  parseOptions,
  readGameDataPure,
  scheduleGameDataCompletion,
  scheduleGameDataCompletionFromMvuUpdate,
} from '../utils/variableReader';
import { eventLogger } from '../utils/logger';

interface UseEventListenersOptions {
  updateGameState: (data: Partial<GameState>) => void;
  setCurrentMaintext: (text: string) => void;
  setCurrentOptions: (options: string[]) => void;
}

export function useEventListeners({
  updateGameState,
  setCurrentMaintext,
  setCurrentOptions,
}: UseEventListenersOptions) {
  useEffect(() => {
    eventLogger.log('🎧 注册消息事件监听器');
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let mvuVariableListener: { stop: () => void } | null = null;
    let mvuVariableUpdatesReady = false;
    let disposed = false;

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

    const registerMvuVariableListener = (): boolean => {
      if (mvuVariableListener) {
        return true;
      }

      const mvu = (globalThis as { Mvu?: { events?: { VARIABLE_UPDATE_ENDED?: string } } }).Mvu;
      if (!mvu?.events?.VARIABLE_UPDATE_ENDED) {
        return false;
      }

      mvuVariableListener = eventOn(mvu.events.VARIABLE_UPDATE_ENDED, (variables: unknown, variablesBeforeUpdate: unknown) => {
        scheduleGameDataCompletionFromMvuUpdate(variables, variablesBeforeUpdate);
      });
      mvuVariableUpdatesReady = true;
      eventLogger.log('MVU 变量更新监听器已注册');
      return true;
    };

    if (!registerMvuVariableListener()) {
      const waitGlobalInitialized = (globalThis as { waitGlobalInitialized?: (name: string) => Promise<void> }).waitGlobalInitialized;
      void waitGlobalInitialized?.('Mvu')
        .then(() => {
          if (!disposed) {
            registerMvuVariableListener();
          }
        })
        .catch(error => {
          eventLogger.warn('等待 MVU 初始化失败，使用全量后台补全兜底:', error);
        });
    }

    const handleMessageUpdate = (eventData?: unknown) => {
      eventLogger.log('收到消息更新事件:', eventData);
      scheduleRefresh();

      if (!mvuVariableUpdatesReady) {
        scheduleGameDataCompletion('message-update-fallback', { fullScan: true });
      }

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
    };

    const handleWriteDone = () => {
      eventLogger.log('[era:writeDone] 检测到变量写入完成，调度纯读刷新');
      scheduleRefresh(50);
    };

    eventLogger.log('注册 MESSAGE_RECEIVED 监听器...');
    const messageReceivedListener = eventOn(tavern_events.MESSAGE_RECEIVED, handleMessageUpdate);
    eventLogger.log('注册 CHAT_CHANGED 监听器...');
    const chatChangedListener = eventOn(tavern_events.CHAT_CHANGED, handleMessageUpdate);
    eventLogger.log('注册 era:writeDone 监听器...');
    const writeDoneListener = eventOn('era:writeDone', handleWriteDone);
    eventLogger.log('🎧 监听器注册完成');

    return () => {
      disposed = true;
      eventLogger.log('🛑 取消事件监听器');
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      messageReceivedListener.stop();
      chatChangedListener.stop();
      writeDoneListener.stop();
      mvuVariableListener?.stop();
    };
  }, [updateGameState, setCurrentMaintext, setCurrentOptions]);
}
