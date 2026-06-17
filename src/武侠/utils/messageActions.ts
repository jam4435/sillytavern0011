import type { GameState } from '../types';
import {
  flushPendingGameDataCompletion,
  getLastMessageContent,
  isFrontendLoaderOnlyMessage,
  normalizeDisplayedMessageContent,
  parseOptions,
  readGameDataPure,
} from './variableReader';

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
}

type RegenerateContext = {
  assistantMessage: ChatMessageWithSwipes;
  userMessage: ChatMessageWithSwipes;
  allMessages: ChatMessageWithSwipes[];
};

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return message.message || swipes[swipeIndex] || swipes[0] || '';
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
  return prompts
    .map(prompt => `[${prompt.role}]\n${prompt.content}`)
    .join('\n\n---\n\n');
}

export async function emitEraForceSyncAndWait(
  payload: Record<string, unknown>,
  timeoutMs = 10000,
  timeoutMessage = 'ERA 变量同步没有响应，已停止重新生成。',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let listener: { stop: () => void } | null = null;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (listener) {
        listener.stop();
      }
      window.clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timer = window.setTimeout(() => {
      finish(new Error(timeoutMessage));
    }, timeoutMs);

    listener = eventOnce('era:writeDone', () => {
      finish();
    });

    void eventEmit('era:forceSync', payload).catch(error => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function normalizeArray<T>(value: T[] | undefined, expectedLength: number, fallback: () => T): T[] {
  const result = Array.isArray(value) ? [...value] : [];
  while (result.length < expectedLength) {
    result.push(fallback());
  }
  return result;
}

async function writeGeneratedSwipe(messageId: number, resultText: string): Promise<void> {
  const [freshMessage] = getChatMessages(messageId, { include_swipes: true }) as ChatMessageWithSwipes[];
  if (!freshMessage) {
    throw new Error(`找不到要重新生成的楼层 #${messageId}。`);
  }

  const activeText = getActiveMessageText(freshMessage);
  const swipes = Array.isArray(freshMessage.swipes) && freshMessage.swipes.length > 0
    ? [...freshMessage.swipes]
    : [activeText || freshMessage.message || ''];

  const newSwipeId = swipes.length;
  swipes.push(resultText);

  const swipesData = normalizeArray(freshMessage.swipes_data, swipes.length, () => ({}));
  const swipesInfo = normalizeArray(freshMessage.swipes_info, swipes.length, () => ({}));
  swipesData[newSwipeId] = {};
  swipesInfo[newSwipeId] = {
    send_date: Date.now(),
    type: 'wuxia_regenerate',
  };

  await setChatMessages(
    [
      {
        message_id: messageId,
        message: resultText,
        swipe_id: newSwipeId,
        swipes,
        swipes_data: swipesData,
        swipes_info: swipesInfo,
      },
    ],
    { refresh: 'affected' },
  );
}

export async function regenerateLastAssistantSwipe(options: RegenerateOptions = {}): Promise<RegenerateResult> {
  const context = getRegenerateContext();
  if (!context) {
    throw new Error('当前没有可重新生成的最新回复。');
  }

  await flushPendingGameDataCompletion('before-regenerate');
  await emitEraForceSyncAndWait({
    mode: 'rollbackTo',
    message_id: context.userMessage.message_id,
  });

  const prompts = buildHistoryPrompts(context.allMessages, context.userMessage.message_id);
  if (prompts.length === 0 || prompts[prompts.length - 1].role !== 'user') {
    throw new Error('无法构造重新生成所需的聊天历史。');
  }

  let combinedPrompt = formatHistoryPromptsForDebug(prompts);
  const combinedPromptCapture =
    typeof eventOn === 'function'
    && typeof tavern_events !== 'undefined'
    && tavern_events.GENERATE_AFTER_COMBINE_PROMPTS
      ? eventOn(
        tavern_events.GENERATE_AFTER_COMBINE_PROMPTS,
        (result: { prompt?: string }) => {
          if (typeof result?.prompt === 'string' && result.prompt.trim()) {
            combinedPrompt = result.prompt;
            options.onCombinedPrompt?.(result.prompt);
          }
        },
      )
      : null;

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

  await writeGeneratedSwipe(context.assistantMessage.message_id, resultText);
  await emitEraForceSyncAndWait({ mode: 'latest' });

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
}
