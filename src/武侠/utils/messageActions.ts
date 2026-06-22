import type { GameState } from '../types';
import { emitEraEventAndWait } from './eraWriteWait';
import {
  flushPendingGameDataCompletion,
  getLastMessageContent,
  isFrontendLoaderOnlyMessage,
  normalizeDisplayedMessageContent,
  parseOptions,
  readGameDataPure,
} from './variableReader';
import { captureNextCombinedPromptForDebug } from './promptDebug';

type ChatRole = 'system' | 'assistant' | 'user';

type ChatMessageWithSwipes = {
  message_id: number;
  role: ChatRole;
  is_hidden?: boolean;
  message?: string;
  data?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  swipes?: string[];
  swipes_data?: Record<string, unknown>[];
  swipes_info?: Record<string, unknown>[];
  swipe_id?: number;
};

type GenerateHistoryPrompt = {
  role: ChatRole;
  content: string;
};

export interface RegenerateResult {
  maintext: string;
  options: string[];
  gameData: Partial<GameState> | null;
  assistantMessageId: number;
  userInput: string;
  combinedPrompt: string;
  rawReply: string;
}

export interface RegenerateOptions {
  onCombinedPrompt?: (prompt: string) => void;
  onTargetAssistantResolved?: (assistantMessageId: number) => void;
}

type RegenerateContext = {
  assistantMessage: ChatMessageWithSwipes;
  userMessage: ChatMessageWithSwipes;
  allMessages: ChatMessageWithSwipes[];
};

type RegenerateSwipeTransaction = {
  messageId: number;
  previousSwipeId: number;
  regenerateSwipeId: number;
};

const ERA_DATA_BLOCK_REGEX = /\s*<era_data>[\s\S]*?<\/era_data>\s*/gi;

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length > 0) {
    const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
    const safeSwipeIndex = Math.max(0, Math.min(swipeIndex, swipes.length - 1));
    return swipes[safeSwipeIndex] || swipes.find(text => text.trim().length > 0) || message.message || '';
  }
  return message.message || '';
}

function isUsableAssistant(message: ChatMessageWithSwipes): boolean {
  if (message.role !== 'assistant') {
    return false;
  }

  const rawText = getActiveMessageText(message);
  if (!rawText.trim() || isFrontendLoaderOnlyMessage(rawText)) {
    return false;
  }

  return normalizeDisplayedMessageContent(rawText).length > 0;
}

function getRegenerateContext(): RegenerateContext | null {
  const allMessages = getChatMessages('0-{{lastMessageId}}', {
    role: 'all',
    hide_state: 'all',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];

  for (let index = allMessages.length - 1; index >= 0; index -= 1) {
    const candidate = allMessages[index];
    if (!isUsableAssistant(candidate)) {
      continue;
    }

    const previous = allMessages[index - 1];
    if (!previous || previous.role !== 'user') {
      return null;
    }

    return {
      assistantMessage: candidate,
      userMessage: previous,
      allMessages,
    };
  }

  return null;
}

export function canRegenerateLastAssistantSwipe(): boolean {
  try {
    return Boolean(getRegenerateContext());
  } catch {
    return false;
  }
}

function buildHistoryPrompts(messages: ChatMessageWithSwipes[], lastMessageId: number): GenerateHistoryPrompt[] {
  return messages
    .filter(message => message.message_id <= lastMessageId)
    .filter(message => !message.is_hidden)
    .map(message => {
      const rawText = getActiveMessageText(message);
      const content = message.role === 'assistant' ? normalizeDisplayedMessageContent(rawText) : rawText.trim();
      return {
        role: message.role,
        content,
      };
    })
    .filter(prompt => prompt.content.length > 0);
}

function formatHistoryPromptsForDebug(prompts: GenerateHistoryPrompt[]): string {
  return prompts.map(prompt => `[${prompt.role}]\n${prompt.content}`).join('\n\n---\n\n');
}

function normalizeArray<T>(value: T[] | undefined, expectedLength: number, fallback: () => T): T[] {
  const result = Array.isArray(value) ? [...value] : [];
  while (result.length < expectedLength) {
    result.push(fallback());
  }
  return result;
}

function getSafeSwipeIndex(message: ChatMessageWithSwipes, swipes: string[]): number {
  if (swipes.length === 0) {
    return 0;
  }
  const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return Math.max(0, Math.min(swipeIndex, swipes.length - 1));
}

function stripEraDataBlocks(text: string): string {
  ERA_DATA_BLOCK_REGEX.lastIndex = 0;
  return text
    .replace(ERA_DATA_BLOCK_REGEX, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getEraDataBlock(text: string): string {
  ERA_DATA_BLOCK_REGEX.lastIndex = 0;
  return text.match(ERA_DATA_BLOCK_REGEX)?.[0]?.trim() || '';
}

function attachEraDataBlock(text: string, eraDataBlock: string): string {
  const body = stripEraDataBlocks(text);
  return eraDataBlock ? `${body}\n\n${eraDataBlock}`.trim() : body;
}

async function beginRegenerateSwipe(messageId: number): Promise<RegenerateSwipeTransaction> {
  const [freshMessage] = getChatMessages(messageId, { include_swipes: true }) as ChatMessageWithSwipes[];
  if (!freshMessage) {
    throw new Error(`找不到要重新生成的楼层 #${messageId}。`);
  }

  const activeText = getActiveMessageText(freshMessage);
  const swipes =
    Array.isArray(freshMessage.swipes) && freshMessage.swipes.length > 0
      ? [...freshMessage.swipes]
      : [activeText || freshMessage.message || ''];
  const previousSwipeId = getSafeSwipeIndex(freshMessage, swipes);
  const regenerateSwipeId = swipes.length;
  const placeholderText = stripEraDataBlocks(normalizeDisplayedMessageContent(activeText)) || '正在重新生成...';
  swipes.push(placeholderText);

  const swipesData = normalizeArray(freshMessage.swipes_data, swipes.length, () => ({}));
  const swipesInfo = normalizeArray(freshMessage.swipes_info, swipes.length, () => ({}));
  swipesData[regenerateSwipeId] = {};
  swipesInfo[regenerateSwipeId] = {
    send_date: Date.now(),
    type: 'wuxia_regenerate_pending',
  };

  await setChatMessages(
    [
      {
        message_id: messageId,
        message: placeholderText,
        swipe_id: regenerateSwipeId,
        swipes,
        swipes_data: swipesData,
        swipes_info: swipesInfo,
      },
    ],
    { refresh: 'affected' },
  );

  return {
    messageId,
    previousSwipeId,
    regenerateSwipeId,
  };
}

async function writeGeneratedSwipe(transaction: RegenerateSwipeTransaction, resultText: string): Promise<string> {
  const [freshMessage] = getChatMessages(transaction.messageId, {
    hide_state: 'all',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];
  if (!freshMessage) {
    throw new Error(`找不到要写入重新生成结果的楼层 #${transaction.messageId}。`);
  }

  const swipes = Array.isArray(freshMessage.swipes) && freshMessage.swipes.length > 0 ? [...freshMessage.swipes] : [];
  if (transaction.regenerateSwipeId >= swipes.length) {
    throw new Error(`重新生成目标 swipe #${transaction.regenerateSwipeId} 已不存在。`);
  }

  const currentSwipeText = swipes[transaction.regenerateSwipeId] || '';
  const nextText = attachEraDataBlock(resultText, getEraDataBlock(currentSwipeText));
  swipes[transaction.regenerateSwipeId] = nextText;
  const swipesData = normalizeArray(freshMessage.swipes_data, swipes.length, () => ({}));
  const swipesInfo = normalizeArray(freshMessage.swipes_info, swipes.length, () => ({}));
  swipesInfo[transaction.regenerateSwipeId] = {
    ...swipesInfo[transaction.regenerateSwipeId],
    send_date: Date.now(),
    type: 'wuxia_regenerate',
  };

  await setChatMessages(
    [
      {
        message_id: transaction.messageId,
        message: nextText,
        swipe_id: transaction.regenerateSwipeId,
        swipes,
        swipes_data: swipesData,
        swipes_info: swipesInfo,
      },
    ],
    { refresh: 'affected' },
  );
  return nextText;
}

async function restorePreviousSwipe(transaction: RegenerateSwipeTransaction): Promise<void> {
  await setChatMessages(
    [
      {
        message_id: transaction.messageId,
        swipe_id: transaction.previousSwipeId,
      },
    ],
    { refresh: 'affected' },
  );
  await emitEraEventAndWait('manual_sync', {
    timeoutMessage: '重新生成失败后已切回原 swipe，但 ERA 没有确认变量恢复。',
    expectedMessageId: transaction.messageId,
    expectedAction: 'resync',
  });
}

export async function regenerateLastAssistantSwipe(options: RegenerateOptions = {}): Promise<RegenerateResult> {
  const context = getRegenerateContext();
  if (!context) {
    throw new Error('当前没有可重新生成的最新回复。');
  }
  options.onTargetAssistantResolved?.(context.assistantMessage.message_id);

  const prompts = buildHistoryPrompts(context.allMessages, context.userMessage.message_id);
  if (prompts.length === 0 || prompts[prompts.length - 1].role !== 'user') {
    throw new Error('无法构造重新生成所需的聊天历史。');
  }

  let combinedPrompt = formatHistoryPromptsForDebug(prompts);
  let transaction: RegenerateSwipeTransaction | null = null;
  try {
    await flushPendingGameDataCompletion('before-regenerate');
    transaction = await beginRegenerateSwipe(context.assistantMessage.message_id);
    await emitEraEventAndWait('manual_sync', {
      timeoutMessage: 'ERA 没有响应 manual_sync，无法在重新生成前回滚旧 swipe 变量。',
      expectedMessageId: context.assistantMessage.message_id,
      expectedAction: 'resync',
    });

    const combinedPromptCapture = captureNextCombinedPromptForDebug(prompt => {
      combinedPrompt = prompt;
      options.onCombinedPrompt?.(prompt);
    });

    let generated: string | GenerateToolCallResult;
    try {
      generated = await generate({
        should_stream: true,
        overrides: {
          chat_history: {
            prompts,
          },
        },
      });
    } finally {
      combinedPromptCapture?.stop();
    }

    const resultText = typeof generated === 'string' ? generated : generated.content;
    if (!resultText?.trim()) {
      throw new Error('重新生成失败：AI 回复为空。');
    }

    await writeGeneratedSwipe(transaction, resultText);
    await emitEraEventAndWait('era:apiWrite', {
      timeoutMessage: '新 swipe 已写入，但 ERA 没有响应 era:apiWrite。',
      expectedMessageId: context.assistantMessage.message_id,
      expectedAction: 'apiWrite',
    });

    const maintext = getLastMessageContent();
    return {
      maintext,
      options: parseOptions(maintext),
      gameData: readGameDataPure(),
      assistantMessageId: context.assistantMessage.message_id,
      userInput: getActiveMessageText(context.userMessage),
      combinedPrompt,
      rawReply: resultText,
    };
  } catch (error) {
    if (transaction) {
      try {
        await restorePreviousSwipe(transaction);
      } catch (restoreError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
        throw new Error(`${originalMessage}\n${restoreMessage}`);
      }
    }
    throw error;
  }
}
