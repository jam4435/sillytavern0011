import type { GameState } from '../types';
import { emitEraEventAndWait } from './eraWriteWait';
import {
  flushPendingGameDataCompletion,
  getLastMessageContent,
  isFrontendLoaderOnlyMessage,
  normalizeAssistantReplyForPersistence,
  normalizeDisplayedMessageContent,
  parseOptions,
  readGameDataPure,
} from './variableReader';
import { captureNextCombinedPromptForDebug } from './promptDebug';
import { syncFrontendDerivedVariables } from './frontendDerivedVariables';
import { extractExplicitMapTargetsFromText } from './locationContext';
import { WUXIA_INPUT_HISTORY_DATA_KEY } from './inputHistory';
import { messageLogger } from './logger';
import { runWith429Retry } from './rateLimitRetry';

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
  assistantSwipeId: number;
  userInput: string;
  combinedPrompt: string;
  rawReply: string;
}

export interface RegenerateRequestOptions {
  /** 可选：把上一轮真实玩家输入替换为此文本后再重生；失败时会恢复旧 user 楼层。 */
  replacementUserInput?: string;
  /**
   * 可选：向上一轮 assistant active swipe 的正文尾部追加普通文本，再按原 user 输入重生最新回复。
   * 追加内容会插在 Variable 系列与 era_data 系统尾块之前；失败时恢复上一轮 assistant 原文。
   */
  previousAssistantAppendText?: string;
}

export interface RegenerateOptions extends RegenerateRequestOptions {
  onCombinedPrompt?: (prompt: string) => void;
  onTargetAssistantResolved?: (assistantMessageId: number) => void;
  /**
   * 旧 swipe 已由 manual_sync 完成回滚，但重新生成前的前端派生变量尚未同步。
   * tracker 在这里建立 baseline：排除旧回复回滚，同时仍能记录随后真实发生的前端后台修改。
   */
  onVariableBaselineReady?: (assistantMessageId: number) => void;
  /** 新正文已生成，但新 swipe 尚未写回；此时登记本轮 AI 变量块。 */
  onGeneratedReplyReady?: (replyText: string, assistantMessageId: number) => void;
}

type RegenerateContext = {
  assistantMessage: ChatMessageWithSwipes;
  userMessage: ChatMessageWithSwipes;
  previousAssistantMessage: ChatMessageWithSwipes | null;
  allMessages: ChatMessageWithSwipes[];
};

type RegenerateSwipeTransaction = {
  messageId: number;
  previousSwipeId: number;
  regenerateSwipeId: number;
  previousSwipeText: string;
  previousSwipeData: Record<string, unknown>;
  previousSwipeInfo: Record<string, unknown>;
};

type RegenerateUserInputTransaction = {
  messageId: number;
  previousMessage: string;
  previousData: Record<string, unknown>;
};

type RegenerateAssistantAppendTransaction = {
  messageId: number;
  swipeId: number;
  previousSwipeText: string;
  previousMessageMirror: string;
  appendedSwipeText: string;
};

const ERA_DATA_BLOCK_REGEX = /\s*<era_data>[\s\S]*?<\/era_data>\s*/gi;
const TRAILING_ERA_DATA_BLOCKS_REGEX = /(?:\s*<era_data>[\s\S]*?<\/era_data>\s*)+$/i;
const ASSISTANT_SYSTEM_BLOCK_REGEX =
  /<era_data>[\s\S]*?<\/era_data>|<VariableThink>[\s\S]*?<\/VariableThink>|<VariableInsert>[\s\S]*?<\/VariableInsert>|<VariableEdit>[\s\S]*?<\/VariableEdit>|<VariableDelete>[\s\S]*?<\/VariableDelete>/gi;
const RESERVED_ASSISTANT_APPEND_TAG_REGEX =
  /<\/?(?:era_data|Variable(?:Think|Insert|Edit|Delete))\b/i;

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

    let previousAssistantMessage: ChatMessageWithSwipes | null = null;
    for (let cursor = index - 2; cursor >= 0; cursor -= 1) {
      const earlier = allMessages[cursor];
      if (earlier.role === 'user') {
        break;
      }
      if (isUsableAssistant(earlier)) {
        previousAssistantMessage = earlier;
        break;
      }
    }

    return {
      assistantMessage: candidate,
      userMessage: previous,
      previousAssistantMessage,
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

export function canAppendPreviousAssistantForRegenerate(): boolean {
  try {
    return Boolean(getRegenerateContext()?.previousAssistantMessage);
  } catch {
    return false;
  }
}

function splitTrailingEraDataBlocks(text: string): { editableText: string; suffix: string } {
  const match = text.match(TRAILING_ERA_DATA_BLOCKS_REGEX);
  if (!match || match.index === undefined) {
    return { editableText: text.trim(), suffix: '' };
  }
  return {
    editableText: text.slice(0, match.index).trim(),
    suffix: match[0],
  };
}

function getEditableRegenerateUserInput(message: ChatMessageWithSwipes): string {
  const fullMessage = getActiveMessageText(message);
  const historyData = message.data?.[WUXIA_INPUT_HISTORY_DATA_KEY];
  if (historyData && typeof historyData === 'object' && !Array.isArray(historyData)) {
    const rawText = (historyData as { text?: unknown }).text;
    if (typeof rawText === 'string' && rawText.trim()) {
      return rawText.trim();
    }
  }
  return splitTrailingEraDataBlocks(fullMessage).editableText;
}

export function getLastRegenerateUserInput(): string | null {
  try {
    const context = getRegenerateContext();
    if (!context) return null;
    return getEditableRegenerateUserInput(context.userMessage) || null;
  } catch {
    return null;
  }
}

async function beginRegenerateUserInputReplacement(
  userMessage: ChatMessageWithSwipes,
  replacementUserInput: string,
): Promise<RegenerateUserInputTransaction> {
  const nextRawInput = replacementUserInput.trim();
  if (!nextRawInput) {
    throw new Error('修改后的上一轮玩家输入不能为空。');
  }

  const freshMessage = readMessageWithSwipes(userMessage.message_id);
  const previousMessage = getActiveMessageText(freshMessage);
  const previousData = { ...(freshMessage.data || {}) };
  const historyData = previousData[WUXIA_INPUT_HISTORY_DATA_KEY];
  const previousRawInput =
    historyData && typeof historyData === 'object' && !Array.isArray(historyData)
      ? (historyData as { text?: unknown }).text
      : undefined;
  const preservedSuffix =
    typeof previousRawInput === 'string' && previousRawInput && previousMessage.startsWith(previousRawInput)
      ? previousMessage.slice(previousRawInput.length)
      : splitTrailingEraDataBlocks(previousMessage).suffix;
  const nextMessage = `${nextRawInput}${preservedSuffix}`;
  const nextData: Record<string, unknown> = {
    ...previousData,
    [WUXIA_INPUT_HISTORY_DATA_KEY]: {
      ...(historyData && typeof historyData === 'object' && !Array.isArray(historyData)
        ? (historyData as Record<string, unknown>)
        : {}),
      text: nextRawInput,
    },
  };

  await setChatMessages(
    [
      {
        message_id: freshMessage.message_id,
        message: nextMessage,
        data: nextData,
      },
    ],
    { refresh: 'none' },
  );

  const written = readMessageWithSwipes(freshMessage.message_id);
  if (getActiveMessageText(written) !== nextMessage) {
    throw new Error('修改上一轮玩家输入后回读失败，已中止重新生成。');
  }

  return {
    messageId: freshMessage.message_id,
    previousMessage,
    previousData,
  };
}

async function restoreRegenerateUserInput(transaction: RegenerateUserInputTransaction): Promise<void> {
  await setChatMessages(
    [
      {
        message_id: transaction.messageId,
        message: transaction.previousMessage,
        data: transaction.previousData,
      },
    ],
    { refresh: 'none' },
  );
  const restored = readMessageWithSwipes(transaction.messageId);
  if (getActiveMessageText(restored) !== transaction.previousMessage) {
    throw new Error('重新生成失败后，上一轮玩家输入恢复失败。');
  }
}

function findTrailingAssistantSystemBlockStart(text: string): number {
  ASSISTANT_SYSTEM_BLOCK_REGEX.lastIndex = 0;
  const matches = Array.from(text.matchAll(ASSISTANT_SYSTEM_BLOCK_REGEX));
  let tailStart = text.length;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) continue;
    const matchEnd = matchIndex + match[0].length;
    if (text.slice(matchEnd, tailStart).trim()) {
      break;
    }
    tailStart = matchIndex;
  }

  return tailStart;
}

function buildAssistantTextWithAppend(previousText: string, appendText: string): string {
  const normalizedAppend = appendText.trim();
  if (!normalizedAppend) {
    throw new Error('追加到上一轮 AI 输出的信息不能为空。');
  }
  if (RESERVED_ASSISTANT_APPEND_TAG_REGEX.test(normalizedAppend)) {
    throw new Error('追加信息不能包含 era_data 或 Variable* 系统标签。');
  }

  const tailStart = findTrailingAssistantSystemBlockStart(previousText);
  const body = previousText.slice(0, tailStart).trimEnd();
  const systemTail = previousText.slice(tailStart).trimStart();
  const nextBody = body ? `${body}\n\n${normalizedAppend}` : normalizedAppend;
  return systemTail ? `${nextBody}\n\n${systemTail}` : nextBody;
}

async function beginRegenerateAssistantAppend(
  assistantMessage: ChatMessageWithSwipes,
  appendText: string,
): Promise<RegenerateAssistantAppendTransaction> {
  const freshMessage = readMessageWithSwipes(assistantMessage.message_id);
  const swipes = Array.isArray(freshMessage.swipes) ? [...freshMessage.swipes] : [];
  const swipeId = getSafeSwipeIndex(freshMessage, swipes);
  const previousSwipeText = getActiveMessageText(freshMessage);
  const previousMessageMirror = freshMessage.message || '';
  const appendedSwipeText = buildAssistantTextWithAppend(previousSwipeText, appendText);

  if (swipes.length > 0) {
    swipes[swipeId] = appendedSwipeText;
    await setChatMessages(
      [
        {
          message_id: freshMessage.message_id,
          message: appendedSwipeText,
          swipe_id: swipeId,
          swipes,
        },
      ],
      { refresh: 'none' },
    );
  } else {
    await setChatMessages(
      [{ message_id: freshMessage.message_id, message: appendedSwipeText }],
      { refresh: 'none' },
    );
  }

  const written = readMessageWithSwipes(freshMessage.message_id);
  if (
    getSafeSwipeIndex(written, Array.isArray(written.swipes) ? written.swipes : []) !== swipeId ||
    getActiveMessageText(written) !== appendedSwipeText ||
    written.message !== appendedSwipeText
  ) {
    throw new Error('追加上一轮 AI 输出后回读失败，已中止重新生成。');
  }

  return {
    messageId: freshMessage.message_id,
    swipeId,
    previousSwipeText,
    previousMessageMirror,
    appendedSwipeText,
  };
}

async function restoreRegenerateAssistantAppend(transaction: RegenerateAssistantAppendTransaction): Promise<void> {
  const freshMessage = readMessageWithSwipes(transaction.messageId);
  const swipes = Array.isArray(freshMessage.swipes) ? [...freshMessage.swipes] : [];

  if (swipes.length > 0) {
    if (transaction.swipeId >= swipes.length) {
      throw new Error('恢复上一轮 AI 输出失败：目标 swipe 已不存在。');
    }
    swipes[transaction.swipeId] = transaction.previousSwipeText;
    await setChatMessages(
      [
        {
          message_id: transaction.messageId,
          message: transaction.previousMessageMirror,
          swipe_id: transaction.swipeId,
          swipes,
        },
      ],
      { refresh: 'none' },
    );
  } else {
    await setChatMessages(
      [{ message_id: transaction.messageId, message: transaction.previousMessageMirror }],
      { refresh: 'none' },
    );
  }

  const restored = readMessageWithSwipes(transaction.messageId);
  if (
    getActiveMessageText(restored) !== transaction.previousSwipeText ||
    restored.message !== transaction.previousMessageMirror
  ) {
    throw new Error('重新生成失败后，上一轮 AI 输出恢复失败。');
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

function readMessageWithSwipes(messageId: number): ChatMessageWithSwipes {
  const [freshMessage] = getChatMessages(messageId, {
    hide_state: 'all',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];

  if (!freshMessage) {
    throw new Error(`找不到要操作的楼层 #${messageId}。`);
  }

  return freshMessage;
}

function assertSwipeExists(messageId: number, expectedSwipeId: number, step: string): ChatMessageWithSwipes {
  const freshMessage = readMessageWithSwipes(messageId);
  const swipes = Array.isArray(freshMessage.swipes) ? freshMessage.swipes : [];

  if (expectedSwipeId >= swipes.length) {
    throw new Error(
      `${step}失败：重新生成目标 swipe #${expectedSwipeId} 未成功写入当前楼层，当前仅有 ${swipes.length} 个 swipe。`,
    );
  }

  return freshMessage;
}

function assertActiveSwipe(messageId: number, expectedSwipeId: number, step: string): ChatMessageWithSwipes {
  const freshMessage = assertSwipeExists(messageId, expectedSwipeId, step);
  const actualSwipeId = Number.isInteger(freshMessage.swipe_id) ? Number(freshMessage.swipe_id) : 0;

  if (actualSwipeId !== expectedSwipeId) {
    throw new Error(`${step}失败：当前 active swipe 是 #${actualSwipeId}，不是目标 #${expectedSwipeId}。`);
  }

  return freshMessage;
}

async function ensureMessageFieldMatches(messageId: number, expectedText: string): Promise<void> {
  const [message] = getChatMessages(messageId);
  if (message?.message === expectedText) {
    return;
  }

  await setChatMessages(
    [
      {
        message_id: messageId,
        message: expectedText,
      },
    ],
    { refresh: 'none' },
  );
}

async function beginRegenerateSwipe(messageId: number): Promise<RegenerateSwipeTransaction> {
  const freshMessage = readMessageWithSwipes(messageId);
  const activeText = getActiveMessageText(freshMessage);
  const swipes =
    Array.isArray(freshMessage.swipes) && freshMessage.swipes.length > 0
      ? [...freshMessage.swipes]
      : [activeText || freshMessage.message || ''];
  const regenerateSwipeId = getSafeSwipeIndex(freshMessage, swipes);
  const previousSwipeId = regenerateSwipeId;
  const previousSwipeText = swipes[regenerateSwipeId] || activeText || freshMessage.message || '';
  const swipesData = normalizeArray(freshMessage.swipes_data, swipes.length, () => ({}));
  const swipesInfo = normalizeArray(freshMessage.swipes_info, swipes.length, () => ({}));
  const previousSwipeData = { ...(swipesData[regenerateSwipeId] || {}) };
  const previousSwipeInfo = { ...(swipesInfo[regenerateSwipeId] || {}) };
  const placeholderText = stripEraDataBlocks(normalizeDisplayedMessageContent(activeText)) || '正在重新生成...';

  // 武侠前端的“重新生成”是重 roll，而不是创建长期备选：
  // 直接原位覆盖当前 swipe。其它由玩家手动创建的 swipe 保持不动。
  swipes[regenerateSwipeId] = placeholderText;
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
    { refresh: 'none' },
  );
  assertActiveSwipe(messageId, regenerateSwipeId, '原位写入重新生成占位内容后');

  return {
    messageId,
    previousSwipeId,
    regenerateSwipeId,
    previousSwipeText,
    previousSwipeData,
    previousSwipeInfo,
  };
}

async function writeGeneratedSwipe(transaction: RegenerateSwipeTransaction, resultText: string): Promise<string> {
  const freshMessage = assertActiveSwipe(
    transaction.messageId,
    transaction.regenerateSwipeId,
    '写回重新生成正文前',
  );
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
    { refresh: 'none' },
  );
  const writtenMessage = assertActiveSwipe(
    transaction.messageId,
    transaction.regenerateSwipeId,
    '写回重新生成正文后',
  );
  if (getActiveMessageText(writtenMessage) !== nextText) {
    throw new Error(`写回重新生成正文后回读失败：目标 swipe #${transaction.regenerateSwipeId} 未保持新正文。`);
  }
  await ensureMessageFieldMatches(transaction.messageId, nextText);
  return nextText;
}

async function restorePreviousSwipe(transaction: RegenerateSwipeTransaction): Promise<void> {
  const freshMessage = readMessageWithSwipes(transaction.messageId);
  const swipes =
    Array.isArray(freshMessage.swipes) && freshMessage.swipes.length > 0
      ? [...freshMessage.swipes]
      : [transaction.previousSwipeText];
  const swipesData = normalizeArray(freshMessage.swipes_data, swipes.length, () => ({}));
  const swipesInfo = normalizeArray(freshMessage.swipes_info, swipes.length, () => ({}));

  swipes[transaction.regenerateSwipeId] = transaction.previousSwipeText;
  swipesData[transaction.regenerateSwipeId] = { ...transaction.previousSwipeData };
  swipesInfo[transaction.regenerateSwipeId] = { ...transaction.previousSwipeInfo };

  await setChatMessages(
    [
      {
        message_id: transaction.messageId,
        message: transaction.previousSwipeText,
        swipe_id: transaction.previousSwipeId,
        swipes,
        swipes_data: swipesData,
        swipes_info: swipesInfo,
      },
    ],
    { refresh: 'none' },
  );
  const restoredMessage = assertActiveSwipe(
    transaction.messageId,
    transaction.previousSwipeId,
    '恢复重 roll 前当前 swipe 后',
  );
  await ensureMessageFieldMatches(transaction.messageId, getActiveMessageText(restoredMessage));
  await emitEraEventAndWait('manual_sync', {
    timeoutMessage: '重新生成失败后已恢复原 swipe，但 ERA 没有确认变量恢复。',
    expectedMessageId: transaction.messageId,
    expectedAction: 'resync',
  });
}

export async function regenerateLastAssistantSwipe(options: RegenerateOptions = {}): Promise<RegenerateResult> {
  if (
    typeof options.replacementUserInput === 'string' &&
    typeof options.previousAssistantAppendText === 'string'
  ) {
    throw new Error('一次重新生成只能修改上一轮输入或追加上一轮 AI 输出，不能同时执行两种编辑。');
  }

  const context = getRegenerateContext();
  if (!context) {
    throw new Error('当前没有可重新生成的最新回复。');
  }
  options.onTargetAssistantResolved?.(context.assistantMessage.message_id);

  let prompts: GenerateHistoryPrompt[] = [];
  let combinedPrompt = '';
  let transaction: RegenerateSwipeTransaction | null = null;
  let userInputTransaction: RegenerateUserInputTransaction | null = null;
  let assistantAppendTransaction: RegenerateAssistantAppendTransaction | null = null;
  try {
    await flushPendingGameDataCompletion('before-regenerate');

    if (typeof options.replacementUserInput === 'string') {
      userInputTransaction = await beginRegenerateUserInputReplacement(
        context.userMessage,
        options.replacementUserInput,
      );
    }

    if (typeof options.previousAssistantAppendText === 'string') {
      if (!context.previousAssistantMessage) {
        throw new Error('当前没有可追加信息的上一轮 AI 输出。');
      }
      assistantAppendTransaction = await beginRegenerateAssistantAppend(
        context.previousAssistantMessage,
        options.previousAssistantAppendText,
      );
    }

    const promptContext = getRegenerateContext();
    if (!promptContext || promptContext.assistantMessage.message_id !== context.assistantMessage.message_id) {
      throw new Error('修改上一轮输入后聊天尾部发生变化，已中止重新生成。');
    }
    prompts = buildHistoryPrompts(promptContext.allMessages, promptContext.userMessage.message_id);
    if (prompts.length === 0 || prompts[prompts.length - 1].role !== 'user') {
      throw new Error('无法构造重新生成所需的聊天历史。');
    }
    combinedPrompt = formatHistoryPromptsForDebug(prompts);

    transaction = await beginRegenerateSwipe(context.assistantMessage.message_id);
    await emitEraEventAndWait('manual_sync', {
      timeoutMessage: 'ERA 没有响应 manual_sync，无法在重新生成前回滚旧 swipe 变量。',
      expectedMessageId: context.assistantMessage.message_id,
      expectedAction: 'resync',
    });
    options.onVariableBaselineReady?.(context.assistantMessage.message_id);
    await syncFrontendDerivedVariables({
      explicitMapTargets: extractExplicitMapTargetsFromText(getActiveMessageText(promptContext.userMessage)),
    });

    const combinedPromptCapture = captureNextCombinedPromptForDebug(prompt => {
      combinedPrompt = prompt;
      options.onCombinedPrompt?.(prompt);
    });

    let generated: string | GenerateToolCallResult;
    try {
      generated = await runWith429Retry(() => generate({
        should_stream: true,
        overrides: {
          chat_history: {
            prompts,
          },
        },
      }), {
        requestLabel: '正文重新生成模型',
        onRetry: ({ retryNumber, maxRetries, delayMs, error }) => {
          messageLogger.warn('[messageActions] 重新生成模型返回 429，准备自动重试', {
            retryNumber,
            maxRetries,
            delayMs,
            error,
          });
        },
      });
    } finally {
      combinedPromptCapture?.stop();
    }

    const rawResultText = typeof generated === 'string' ? generated : generated.content;
    const resultText = normalizeAssistantReplyForPersistence(rawResultText);
    if (!resultText?.trim()) {
      throw new Error('重新生成失败：AI 回复为空。');
    }

    options.onGeneratedReplyReady?.(resultText, context.assistantMessage.message_id);

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
      assistantSwipeId: transaction.regenerateSwipeId,
      userInput: getEditableRegenerateUserInput(readMessageWithSwipes(context.userMessage.message_id)),
      combinedPrompt,
      rawReply: rawResultText,
    };
  } catch (error) {
    const restoreErrors: string[] = [];

    // manual_sync 恢复最新 assistant 变量前，先把被编辑的历史楼层恢复原样，
    // 这样最终的旧 swipe 回滚看到的仍是原来的完整回合。
    if (userInputTransaction) {
      try {
        await restoreRegenerateUserInput(userInputTransaction);
      } catch (restoreError) {
        restoreErrors.push(restoreError instanceof Error ? restoreError.message : String(restoreError));
      }
    }

    if (assistantAppendTransaction) {
      try {
        await restoreRegenerateAssistantAppend(assistantAppendTransaction);
      } catch (restoreError) {
        restoreErrors.push(restoreError instanceof Error ? restoreError.message : String(restoreError));
      }
    }

    if (transaction) {
      try {
        await restorePreviousSwipe(transaction);
      } catch (restoreError) {
        restoreErrors.push(restoreError instanceof Error ? restoreError.message : String(restoreError));
      }
    }

    if (restoreErrors.length > 0) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`${originalMessage}\n${restoreErrors.join('\n')}`);
    }
    throw error;
  }
}
