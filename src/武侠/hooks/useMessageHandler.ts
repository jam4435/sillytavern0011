import { useCallback } from 'react';
import type { GameState } from '../types';
import {
  flushPendingGameDataCompletion,
  getLastMessageContent,
  normalizeDisplayedMessageContent,
  parseAIResponse,
  parseOptions,
  readGameDataPure,
} from '../utils/variableReader';
import { messageLogger } from '../utils/logger';
import { regenerateLastAssistantSwipe } from '../utils/messageActions';

type ChatRole = 'system' | 'assistant' | 'user';

type ChatMessageWithSwipes = {
  message_id: number;
  role: ChatRole;
  is_hidden?: boolean;
  message?: string;
  swipes?: string[];
  swipe_id?: number;
};

export interface AutoAdvanceTurnResult {
  prompt: string;
  userMessageId: number;
  assistantMessageId: number;
  plainText: string;
  rawReply: string;
  variableWriteObserved: boolean;
}

interface UseMessageHandlerOptions {
  setIsLoading: (loading: boolean) => void;
  showLoading: (message: string) => void;
  showError: (message: string) => void;
  dismissToast: () => void;
  updateGameState: (data: Partial<GameState>) => void;
  setCurrentMaintext: (text: string) => void;
  setCurrentOptions: (options: string[]) => void;
  addDebugLog: (type: 'prompt' | 'assistant', content: string) => void;
  currentMaintext: string;
  currentOptions: string[];
}

const OPTION_BLOCK_REGEX = /\s*<option>\s*[\s\S]*?<\/option>\s*/gi;
const AUTO_ADVANCE_USER_MESSAGE_TIMEOUT_MS = 15000;
const AUTO_ADVANCE_ASSISTANT_MESSAGE_TIMEOUT_MS = 120000;
const AUTO_ADVANCE_ERA_WRITE_TIMEOUT_MS = 12000;
const AUTO_ADVANCE_EVENT_SETTLE_TIMEOUT_MS = 1500;
const AUTO_ADVANCE_POLL_INTERVAL_MS = 400;
const AUTO_ADVANCE_SETTLE_MS = 500;
const AUTO_ADVANCE_VARIABLE_BLOCK_REGEX = /<Variable(?:Think|Insert|Edit|Delete)>/i;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, milliseconds));

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function quoteSlashCommandArgument(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return message.message || swipes[swipeIndex] || swipes[0] || '';
}

function getAllChatMessagesWithSwipes(): ChatMessageWithSwipes[] {
  return getChatMessages('0-{{lastMessageId}}', {
    role: 'all',
    hide_state: 'unhidden',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];
}

function getLatestMessageId(): number {
  return getAllChatMessagesWithSwipes().reduce(
    (latestId, message) => Math.max(latestId, Number(message.message_id)),
    -1,
  );
}

function getNewestMessageAfter(messageId: number, role: ChatRole): ChatMessageWithSwipes | null {
  const messages = getAllChatMessagesWithSwipes()
    .filter(message => message.role === role && message.message_id > messageId)
    .sort((left, right) => right.message_id - left.message_id);

  if (role !== 'assistant') {
    return messages[0] || null;
  }

  return messages.find(message => getActiveMessageText(message).trim().length > 0) || null;
}

async function waitForNewMessageAfter(
  messageId: number,
  role: ChatRole,
  timeoutMs: number,
): Promise<ChatMessageWithSwipes> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const message = getNewestMessageAfter(messageId, role);
    if (message) {
      return message;
    }

    await sleep(AUTO_ADVANCE_POLL_INTERVAL_MS);
  }

  throw new Error(role === 'user' ? '发送后没有找到新增用户楼层。' : '触发生成后没有找到新增助手楼层。');
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 100,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    if (predicate()) {
      return true;
    }

    await sleep(intervalMs);
  }

  return predicate();
}

function createAutoAdvancePlainText(rawReply: string): string {
  const normalizedReply = normalizeDisplayedMessageContent(rawReply);
  const parsedReply = parseAIResponse(normalizedReply);
  const content = parsedReply.content || normalizedReply;
  return content
    .replace(OPTION_BLOCK_REGEX, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function useMessageHandler({
  setIsLoading,
  showLoading,
  showError,
  dismissToast,
  updateGameState,
  setCurrentMaintext,
  setCurrentOptions,
  addDebugLog,
  currentMaintext,
  currentOptions,
}: UseMessageHandlerOptions) {
  const handleSendMessage = useCallback(async (message: string): Promise<string> => {
    messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    messageLogger.log('🚀 开始发送消息流程');
    messageLogger.log('📝 用户输入:', message);
    messageLogger.log('⏱️ 时间戳:', new Date().toISOString());
    messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    setIsLoading(true);
    showLoading('正在生成回复...');
    messageLogger.log('🔄 isLoading 设置为 true');

    try {
      // ========== 步骤 1: 创建用户消息楼层 ==========
      messageLogger.log('');
      messageLogger.log('📌 [步骤 1] 创建用户消息楼层');
      messageLogger.log('调用 createChatMessages() 参数:', {
        role: 'user',
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        options: { refresh: 'none' }
      });

      const createUserResult = await createChatMessages(
        [
          {
            role: 'user',
            message: message,
          },
        ],
        {
          refresh: 'none',
        }
      );
      messageLogger.log('✅ [步骤 1] 用户消息楼层创建完成');
      messageLogger.log('createChatMessages 返回值:', createUserResult);
      messageLogger.log('返回值类型:', typeof createUserResult);

      // ========== 步骤 1.5: 记录用户消息到调试日志 ==========
      messageLogger.log('');
      messageLogger.log('📌 [步骤 1.5] 记录用户消息到调试日志');
      addDebugLog('prompt', `用户发送:\n${message}`);
      messageLogger.log('已记录用户消息到调试日志');

      // ========== 步骤 2: 调用 generate() 触发 AI 生成 ==========
      messageLogger.log('');
      messageLogger.log('📌 [步骤 2] 同步待补全变量');
      await flushPendingGameDataCompletion('before-generate');
      messageLogger.log('✅ [步骤 2] 待补全变量同步完成');

      messageLogger.log('📌 [步骤 2] 调用 generate() 触发 AI 生成');
      messageLogger.log('generate 参数:', { should_stream: true });
      messageLogger.log('⏳ 等待 AI 回复中...');

      const generateStartTime = Date.now();
      const result = await generate({
        should_stream: true,
      });
      const resultText = typeof result === 'string' ? result : result.content;
      const generateEndTime = Date.now();

      messageLogger.log('✅ [步骤 2] generate() 调用完成');
      messageLogger.log('耗时:', generateEndTime - generateStartTime, 'ms');
      messageLogger.log('返回值类型:', typeof result);
      messageLogger.log('返回文本是否为空:', !resultText);
      messageLogger.log('返回文本长度:', resultText ? resultText.length : 0);
      messageLogger.log('返回文本前 500 字符:', resultText ? resultText.substring(0, 500) : '(null/undefined)');
      if (resultText && resultText.length > 500) {
        messageLogger.log('返回文本后 200 字符:', resultText.substring(resultText.length - 200));
      }

      if (resultText) {
        // ========== 步骤 3: 解析 AI 回复 ==========
        messageLogger.log('');
        messageLogger.log('📌 [步骤 3] 解析 AI 回复');

        const maintext = resultText;
        const options = parseOptions(resultText);

        messageLogger.log('🔧 调试模式：直接显示 AI 完整回复');
        messageLogger.log('parseMaintext 结果 (完整内容):');
        messageLogger.log('  - 是否有内容:', !!maintext);
        messageLogger.log('  - 长度:', maintext.length);
        messageLogger.log('  - 前 300 字符:', maintext.substring(0, 300));
        messageLogger.log('parseOptions 结果:');
        messageLogger.log('  - 选项数量:', options.length);
        messageLogger.log('  - 选项列表:', options);

        // ========== 步骤 4: 创建 assistant 楼层 ==========
        messageLogger.log('');
        messageLogger.log('📌 [步骤 4] 创建 assistant 消息楼层');
        messageLogger.log('调用 createChatMessages() 参数:', {
          role: 'assistant',
          messageLength: result.length,
          options: { refresh: 'none' }
        });

        const createAssistantResult = await createChatMessages(
          [
            {
              role: 'assistant',
              message: resultText,
            },
          ],
          {
            refresh: 'none',
          }
        );
        messageLogger.log('✅ [步骤 4] assistant 消息楼层创建完成');
        messageLogger.log('createChatMessages 返回值:', createAssistantResult);

        // ========== 步骤 5: 手动刷新前端显示 ==========
        messageLogger.log('');
        messageLogger.log('📌 [步骤 5] 手动刷新前端显示');
        messageLogger.log('当前 currentMaintext 长度:', currentMaintext.length);
        messageLogger.log('当前 currentOptions:', currentOptions);
        messageLogger.log('即将设置 maintext 长度:', maintext.length);
        messageLogger.log('即将设置 options:', options);

        setCurrentMaintext(maintext);
        setCurrentOptions(options);

        addDebugLog('assistant', resultText);

        messageLogger.log('✅ [步骤 5] 前端状态已更新');
        messageLogger.log('注意: React 状态更新是异步的，新值将在下次渲染时生效');

        dismissToast();
        return resultText;

      } else {
        // ========== 错误处理: AI 回复为空 ==========
        messageLogger.log('');
        messageLogger.warn('⚠️ [错误处理] AI 回复为空');
        messageLogger.log('result 值:', result);
        messageLogger.log('result 类型:', typeof result);

        addDebugLog('assistant', `[AI 回复为空]\n返回值: ${result === null ? 'null' : result === undefined ? 'undefined' : JSON.stringify(result)}\n类型: ${typeof result}`);

        showError('生成失败：AI 回复为空，请重试');
        messageLogger.log('已设置错误提示到前端');
        return '';
      }
    } catch (error) {
      // ========== 异常处理 ==========
      messageLogger.log('');
      messageLogger.error('❌ [异常处理] 发送消息过程中出错');
      messageLogger.error('错误对象:', error);
      messageLogger.log('错误类型:', typeof error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '无堆栈信息';
      messageLogger.error('错误信息:', errorMessage);
      messageLogger.log('错误堆栈:', errorStack);

      addDebugLog('assistant', `[生成异常]\n错误信息: ${errorMessage}\n\n堆栈:\n${errorStack}`);

      showError(`生成失败：${errorMessage}`);
      return '';
    } finally {
      setIsLoading(false);
      messageLogger.log('');
      messageLogger.log('🏁 流程结束');
      messageLogger.log('🔄 isLoading 设置为 false');
      messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }, [currentMaintext, currentOptions, addDebugLog, setIsLoading, showLoading, showError, dismissToast, setCurrentMaintext, setCurrentOptions]);

  const handleAutoAdvanceTurn = useCallback(async (message: string): Promise<AutoAdvanceTurnResult> => {
    const prompt = message.trim();
    if (!prompt) {
      throw new Error('自动推进指令不能为空。');
    }

    messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    messageLogger.log('⏩ 开始自动推进完整回合');
    messageLogger.log('📝 推进指令:', prompt);

    setIsLoading(true);
    showLoading('正在自动推进剧情...');

    let variableWriteObserved = false;
    const writeDoneListener = eventOn('era:writeDone', () => {
      variableWriteObserved = true;
    });

    try {
      await flushPendingGameDataCompletion('before-auto-advance');

      const beforeLastMessageId = getLatestMessageId();
      addDebugLog('prompt', `[自动推进]\n${prompt}`);

      await triggerSlash(`/send raw=true ${quoteSlashCommandArgument(prompt)}`);
      const userMessage = await waitForNewMessageAfter(
        beforeLastMessageId,
        'user',
        AUTO_ADVANCE_USER_MESSAGE_TIMEOUT_MS,
      );

      await triggerSlash('/trigger await=true');
      const assistantMessage = await waitForNewMessageAfter(
        userMessage.message_id,
        'assistant',
        AUTO_ADVANCE_ASSISTANT_MESSAGE_TIMEOUT_MS,
      );
      let latestAssistantMessage = getNewestMessageAfter(userMessage.message_id, 'assistant') || assistantMessage;
      let rawReply = getActiveMessageText(latestAssistantMessage);
      if (!rawReply.trim()) {
        throw new Error('本轮新增助手楼层没有可读取的回复内容。');
      }

      await flushPendingGameDataCompletion('after-auto-advance-message');

      if (!variableWriteObserved) {
        await waitForCondition(
          () => variableWriteObserved,
          AUTO_ADVANCE_VARIABLE_BLOCK_REGEX.test(rawReply)
            ? AUTO_ADVANCE_ERA_WRITE_TIMEOUT_MS
            : AUTO_ADVANCE_EVENT_SETTLE_TIMEOUT_MS,
        );
      }
      await sleep(AUTO_ADVANCE_SETTLE_MS);

      latestAssistantMessage = getNewestMessageAfter(userMessage.message_id, 'assistant') || latestAssistantMessage;
      rawReply = getActiveMessageText(latestAssistantMessage);
      if (!rawReply.trim()) {
        throw new Error('本轮新增助手楼层没有可读取的回复内容。');
      }

      const maintext = getLastMessageContent() || normalizeDisplayedMessageContent(rawReply);
      const options = parseOptions(maintext || rawReply);
      const gameData = readGameDataPure();
      if (gameData) {
        updateGameState(gameData);
      }
      setCurrentMaintext(maintext);
      setCurrentOptions(options);
      addDebugLog('assistant', `[自动推进 #${latestAssistantMessage.message_id}]\n${rawReply}`);

      dismissToast();
      messageLogger.log('✅ 自动推进完整回合完成:', {
        userMessageId: userMessage.message_id,
        assistantMessageId: latestAssistantMessage.message_id,
        variableWriteObserved,
      });

      return {
        prompt,
        userMessageId: userMessage.message_id,
        assistantMessageId: latestAssistantMessage.message_id,
        plainText: createAutoAdvancePlainText(rawReply),
        rawReply,
        variableWriteObserved,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      messageLogger.error('自动推进失败:', error);
      addDebugLog('assistant', `[自动推进异常]\n${errorMessage}`);
      showError(`自动推进失败：${errorMessage}`);
      throw error;
    } finally {
      writeDoneListener.stop();
      setIsLoading(false);
      messageLogger.log('🏁 自动推进流程结束');
      messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }, [
    addDebugLog,
    dismissToast,
    setCurrentMaintext,
    setCurrentOptions,
    setIsLoading,
    showError,
    showLoading,
    updateGameState,
  ]);

  const handleRegenerateLastAssistant = useCallback(async (): Promise<void> => {
    messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    messageLogger.log('🔁 开始重新生成最新回复');

    setIsLoading(true);
    showLoading('正在重新生成回复...');

    try {
      const result = await regenerateLastAssistantSwipe();
      setCurrentMaintext(result.maintext);
      setCurrentOptions(result.options);
      if (result.maintext) {
        addDebugLog('assistant', `[重新生成]\n${result.maintext}`);
      }
      dismissToast();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      messageLogger.error('重新生成失败:', error);
      addDebugLog('assistant', `[重新生成异常]\n${errorMessage}`);
      showError(`重新生成失败：${errorMessage}`);
    } finally {
      setIsLoading(false);
      messageLogger.log('🏁 重新生成流程结束');
      messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }, [
    addDebugLog,
    dismissToast,
    setCurrentMaintext,
    setCurrentOptions,
    setIsLoading,
    showError,
    showLoading,
  ]);

  return { handleSendMessage, handleAutoAdvanceTurn, handleRegenerateLastAssistant };
}
