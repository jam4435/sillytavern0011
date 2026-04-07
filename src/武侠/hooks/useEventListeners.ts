import { useEffect } from 'react';
import { GameState } from '../types';
import {
  getLastMessageContent,
  parseOptions,
  readGameData
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

    const handleMessageUpdate = (eventData?: unknown) => {
      eventLogger.log('');
      eventLogger.log('🔔 =============== 事件触发 ===============');
      eventLogger.log('📡 收到消息更新事件');
      eventLogger.log('事件数据:', eventData);
      eventLogger.log('时间戳:', new Date().toISOString());

      eventLogger.log('');
      eventLogger.log('📖 读取游戏数据...');
      readGameData().then(newData => {
        eventLogger.log('readGameData 返回:', newData ? '有数据' : 'null');
        if (newData) {
          eventLogger.log('更新 gameState');
          updateGameState(newData);
        }
      }).catch(err => {
        eventLogger.error('readGameData 失败:', err);
      });

      eventLogger.log('');
      eventLogger.log('📄 读取最后一条消息...');
      const lastContent = getLastMessageContent();
      eventLogger.log('getLastMessageContent 返回长度:', lastContent.length);
      eventLogger.log('前 200 字符:', lastContent.substring(0, 200));

      if (lastContent) {
        const maintext = lastContent;
        const options = parseOptions(lastContent);
        eventLogger.log('🔧 调试模式：直接显示完整消息内容');
        eventLogger.log('maintext 长度 (完整内容):', maintext.length);
        eventLogger.log('解析 options 数量:', options.length);
        eventLogger.log('options:', options);

        setCurrentMaintext(maintext);
        setCurrentOptions(options);
        eventLogger.log('✅ 前端状态已更新');
      } else {
        eventLogger.warn('⚠️ 没有消息内容，跳过更新');
      }
      eventLogger.log('🔔 =========================================');
    };

    const handleWriteDone = () => {
      eventLogger.log('');
      eventLogger.log('📝 [era:writeDone] 检测到变量写入完成，检查角色数据...');
      setTimeout(() => {
        readGameData().then(newData => {
          if (newData) {
            eventLogger.log('变量写入后更新 gameState');
            updateGameState(newData);
          }
        }).catch(err => {
          eventLogger.error('era:writeDone 后 readGameData 失败:', err);
        });
      }, 50);
    };

    eventLogger.log('注册 MESSAGE_RECEIVED 监听器...');
    const messageReceivedListener = eventOn(tavern_events.MESSAGE_RECEIVED, handleMessageUpdate);
    eventLogger.log('注册 CHAT_CHANGED 监听器...');
    const chatChangedListener = eventOn(tavern_events.CHAT_CHANGED, handleMessageUpdate);
    eventLogger.log('注册 era:writeDone 监听器...');
    const writeDoneListener = eventOn('era:writeDone', handleWriteDone);
    eventLogger.log('🎧 监听器注册完成');

    return () => {
      eventLogger.log('🛑 取消事件监听器');
      messageReceivedListener.stop();
      chatChangedListener.stop();
      writeDoneListener.stop();
    };
  }, [updateGameState, setCurrentMaintext, setCurrentOptions]);
}
