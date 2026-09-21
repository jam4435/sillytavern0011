import { useCallback } from 'react';
import type { GameState } from '../types';
import type { SummarySettings } from '../utils/settingsManager';
import {
  flushPendingGameDataCompletion,
  getLastMessageContent,
  normalizeAssistantReplyForPersistence,
  normalizeDisplayedMessageContent,
  parseAIResponse,
  parseOptions,
  readGameDataPure,
} from '../utils/variableReader';
import { messageLogger, variableTraceLogger } from '../utils/logger';
import { regenerateLastAssistantSwipe } from '../utils/messageActions';
import { captureNextCombinedPromptForDebug } from '../utils/promptDebug';
import { syncFrontendDerivedVariables } from '../utils/frontendDerivedVariables';
import { extractExplicitMapTargetsFromText } from '../utils/locationContext';
import {
  assertValidTurnVariableBlocks,
  ensureTurnVariableBlocksCommitted,
  executeExtraVariableUpdate,
  prepareExtraVariableUpdateTurn,
  validateOrRepairInlineWorldTimeReply,
  type ExtraVariableUpdateProgress,
  type ExtraVariableUpdateReservation,
} from '../utils/extraVariableUpdateManager';
import { observeEraWriteDone } from '../utils/eraWriteWait';
import { recordIframeLifecycleEvent } from '../utils/iframeLifecycleBlackBox';
import { acquireWuxiaTurnLock, releaseWuxiaTurnLock } from '../utils/turnLock';
import { runWith429Retry } from '../utils/rateLimitRetry';
import { MAX_AUTO_ADVANCE_FAILURE_RETRIES, runWithAutoAdvanceFailureRetry } from '../utils/autoAdvanceRetry';
import { finalizeCurrentTurn } from '../utils/saveLoadManager';
import { WUXIA_INPUT_HISTORY_DATA_KEY } from '../utils/inputHistory';
import { maybeArchiveConversationSummaries } from '../utils/narrativeMemoryManager';
import type { LatestDebugRoundPatch } from './useDebugLogs';

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

export interface SendMessageOptions {
  /** 未附加地图/物品指令的真实玩家输入；仅显式传入时写入输入历史。 */
  rawPlayerInput?: string;
  /** 自动推进专用：重试尚未落盘的模型失败，并把最终失败抛给串行推进控制器。 */
  autoAdvance?: boolean;
}

interface UseMessageHandlerOptions {
  setIsLoading: (loading: boolean) => void;
  showLoading: (message: string) => void;
  showError: (message: string) => void;
  dismissToast: () => void;
  updateGameState: (data: Partial<GameState>) => void;
  setCurrentMaintext: (text: string) => void;
  setCurrentOptions: (options: string[]) => void;
  beginDebugRound: (userInput: string) => string;
  patchLatestDebugRound: (patch: LatestDebugRoundPatch) => void;
  currentMaintext: string;
  currentOptions: string[];
  summarySettings: SummarySettings;
  onVariableTurnStart?: (variableUpdateMode: SummarySettings['variableUpdateMode']) => void;
  onVariableAssistantReply?: (rawReply: string, assistantMessageId?: number) => void;
  onVariableExtraDeclaredBlocks?: (blocksText: string, assistantMessageId?: number) => void;
  onVariableAiWriteTarget?: (assistantMessageId: number) => void;
  onVariableTurnSettled?: (assistantMessageId?: number) => void;
  onAssistantDisplayCommit?: (assistantMessageId: number, assistantSwipeId: number) => void;
}

const OPTION_BLOCK_REGEX = /\s*<option>\s*[\s\S]*?<\/option>\s*/gi;
const COMPLETE_VARIABLE_ACTION_BLOCK_REGEX = /<(VariableInsert|VariableEdit|VariableDelete)>\s*[\s\S]*?<\/\1>/;
const WUXIA_TURN_COMPLETED_EVENT = 'wuxia:turn-completed';

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

class PostGenerationStepError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PostGenerationStepError';
  }
}

async function finalizeHistoryNodeAfterEvents(): Promise<void> {
  const gameData = readGameDataPure();
  const time = gameData?.worldTime;
  const worldTimeText =
    gameData?.gameTime ||
    (time ? `${time.year}年${time.month}月${time.day}日${time.hour}时${String(time.minute).padStart(2, '0')}分` : '');
  await finalizeCurrentTurn({
    location: gameData?.currentLocation || gameData?.stats?.location || '',
    worldTimeText,
  });
}

/**
 * 读取当前聊天 ID（用于回合成功完成事件的去重与归档）。
 * 与 useEventListeners.ts 中的 readCurrentChatId 同源，读取 SillyTavern 全局 API。
 */
const readCurrentChatIdForTurn = (): string => {
  try {
    const currentWindow = globalThis as typeof globalThis & {
      SillyTavern?: { getCurrentChatId?: () => string | number | null | undefined };
    };
    const parentWindow =
      typeof window !== 'undefined'
        ? (window.parent as Window &
            typeof globalThis & {
              SillyTavern?: { getCurrentChatId?: () => string | number | null | undefined };
            })
        : undefined;
    const chatId = currentWindow.SillyTavern?.getCurrentChatId?.() ?? parentWindow?.SillyTavern?.getCurrentChatId?.();
    if (typeof chatId === 'string') {
      const normalized = chatId.trim();
      return normalized || 'unknown';
    }
    if (typeof chatId === 'number' && Number.isFinite(chatId)) {
      return String(chatId);
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

type ExtraVariableDecisionTrigger = 'send' | 'regenerate';

type ExtraVariableRunDecision = {
  trigger: ExtraVariableDecisionTrigger;
  modeSnapshot: SummarySettings['variableUpdateMode'];
  shouldRunExtra: boolean;
  skipReason: string;
};

function createExtraVariableRunDecision(
  trigger: ExtraVariableDecisionTrigger,
  settings: SummarySettings,
): ExtraVariableRunDecision {
  const modeSnapshot = settings.variableUpdateMode;
  if (modeSnapshot === 'extra') {
    return {
      trigger,
      modeSnapshot,
      shouldRunExtra: true,
      skipReason: '',
    };
  }

  return {
    trigger,
    modeSnapshot,
    shouldRunExtra: false,
    skipReason: `本轮模式快照为 ${modeSnapshot}，跳过额外变量更新。`,
  };
}

function createExtraVariableDecisionPatch(
  decision: ExtraVariableRunDecision,
  patch: Partial<NonNullable<LatestDebugRoundPatch['variable']>> = {},
): NonNullable<LatestDebugRoundPatch['variable']> {
  return {
    trigger: decision.trigger,
    modeSnapshot: decision.modeSnapshot,
    skipReason: decision.skipReason,
    ...patch,
  };
}

function createInitialExtraVariableDecisionPatch(
  decision: ExtraVariableRunDecision,
): NonNullable<LatestDebugRoundPatch['variable']> {
  const now = Date.now();
  return createExtraVariableDecisionPatch(
    decision,
    decision.shouldRunExtra
      ? {
          status: 'idle',
          startedAt: now,
          error: '',
          retry429Count: 0,
          retry429LastDelayMs: 0,
          retryFailureCount: 0,
          retryFailureLastDelayMs: 0,
          applyStatus: 'idle',
          applyError: '',
          applyVerification: '',
          postProcessStatus: 'idle',
          postProcessError: '',
        }
      : {
          status: 'skipped',
          startedAt: now,
          finishedAt: now,
          error: '',
          retry429Count: 0,
          retry429LastDelayMs: 0,
          retryFailureCount: 0,
          retryFailureLastDelayMs: 0,
          applyStatus: 'idle',
          applyError: '',
          applyVerification: '',
          postProcessStatus: 'idle',
          postProcessError: '',
        },
  );
}

function createExtraVariableProgressPatch(
  progress: ExtraVariableUpdateProgress,
): NonNullable<LatestDebugRoundPatch['variable']> {
  const patch: NonNullable<LatestDebugRoundPatch['variable']> = {};
  if (typeof progress.prompt === 'string') {
    patch.input = progress.prompt;
  }
  if (typeof progress.rawResponse === 'string') {
    patch.output = progress.rawResponse;
  }
  if (typeof progress.appendedBlocks === 'string') {
    patch.appendedBlocks = progress.appendedBlocks;
  }
  if (typeof progress.finalMessageText === 'string') {
    patch.finalMessageText = progress.finalMessageText;
  }
  if (typeof progress.appendReadbackText === 'string') {
    patch.appendReadbackText = progress.appendReadbackText;
  }
  if (typeof progress.appendVerification === 'string') {
    patch.appendVerification = progress.appendVerification;
  }
  if (typeof progress.syncReadbackText === 'string') {
    patch.syncReadbackText = progress.syncReadbackText;
  }
  if (typeof progress.syncVerification === 'string') {
    patch.syncVerification = progress.syncVerification;
  }
  if (typeof progress.retry429Count === 'number') {
    patch.retry429Count = progress.retry429Count;
  }
  if (typeof progress.retry429LastDelayMs === 'number') {
    patch.retry429LastDelayMs = progress.retry429LastDelayMs;
  }
  if (typeof progress.retryFailureCount === 'number') {
    patch.retryFailureCount = progress.retryFailureCount;
  }
  if (typeof progress.retryFailureLastDelayMs === 'number') {
    patch.retryFailureLastDelayMs = progress.retryFailureLastDelayMs;
  }
  if (progress.applyStatus) {
    patch.applyStatus = progress.applyStatus;
  }
  if (typeof progress.applyVerification === 'string') {
    patch.applyVerification = progress.applyVerification;
  }
  if (typeof progress.applyError === 'string') {
    patch.applyError = progress.applyError;
  }
  if (Array.isArray(progress.phaseTimeline)) {
    patch.phaseTimeline = progress.phaseTimeline.map(phase => ({ ...phase }));
  }
  if (typeof progress.currentPhase === 'string') {
    patch.currentPhase = progress.currentPhase;
  }
  return patch;
}

function summarizeExtraVariableProgress(progress: ExtraVariableUpdateProgress) {
  return {
    hasPrompt: typeof progress.prompt === 'string',
    promptLength: typeof progress.prompt === 'string' ? progress.prompt.length : 0,
    hasRawResponse: typeof progress.rawResponse === 'string',
    rawResponseLength: typeof progress.rawResponse === 'string' ? progress.rawResponse.length : 0,
    hasAppendedBlocks: typeof progress.appendedBlocks === 'string',
    appendedBlocksLength: typeof progress.appendedBlocks === 'string' ? progress.appendedBlocks.length : 0,
    actionBlockCount: progress.actionBlockCount ?? 0,
    appended: progress.appended === true,
    hasFinalMessageText: typeof progress.finalMessageText === 'string',
    finalMessageTextLength: typeof progress.finalMessageText === 'string' ? progress.finalMessageText.length : 0,
    appendVerification: progress.appendVerification ?? '',
    syncVerification: progress.syncVerification ?? '',
    applyStatus: progress.applyStatus ?? '',
    applyVerification: progress.applyVerification ?? '',
    applyError: progress.applyError ?? '',
    currentPhase: progress.currentPhase ?? '',
    phaseCount: progress.phaseTimeline?.length ?? 0,
  };
}

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length > 0) {
    const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
    const safeSwipeIndex = Math.max(0, Math.min(swipeIndex, swipes.length - 1));
    return swipes[safeSwipeIndex] || swipes.find(text => text.trim().length > 0) || message.message || '';
  }
  return message.message || '';
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
  beginDebugRound,
  patchLatestDebugRound,
  currentMaintext,
  currentOptions,
  summarySettings,
  onVariableTurnStart,
  onVariableAssistantReply,
  onVariableExtraDeclaredBlocks,
  onVariableAiWriteTarget,
  onVariableTurnSettled,
  onAssistantDisplayCommit,
}: UseMessageHandlerOptions) {
  const refreshAssistantStateFromFinalText = useCallback(
    (finalText: string) => {
      const displayText = normalizeDisplayedMessageContent(finalText) || finalText;
      setCurrentMaintext(displayText);
      setCurrentOptions(parseOptions(finalText));
    },
    [setCurrentMaintext, setCurrentOptions],
  );

  const prepareExtraVariableUpdateForDecision = useCallback(
    async (decision: ExtraVariableRunDecision): Promise<ExtraVariableUpdateReservation | null> => {
      if (!decision.shouldRunExtra) {
        return null;
      }

      try {
        return await prepareExtraVariableUpdateTurn(summarySettings);
      } catch (error) {
        patchLatestDebugRound({
          variable: createExtraVariableDecisionPatch(decision, {
            status: 'error',
            error: getErrorMessage(error),
            finishedAt: Date.now(),
          }),
        });
        throw error;
      }
    },
    [patchLatestDebugRound, summarySettings],
  );

  const runExtraVariableUpdate = useCallback(
    async ({
      decision,
      assistantMessageId,
      latestRawReply,
      logLabel,
      retryAutoAdvanceFailures = false,
    }: {
      decision: ExtraVariableRunDecision;
      assistantMessageId: number;
      latestRawReply: string;
      logLabel: string;
      retryAutoAdvanceFailures?: boolean;
    }) => {
      if (!decision.shouldRunExtra) {
        return null;
      }

      showLoading('正在额外更新变量...');
      let extraDeclarationsRegistered = false;
      patchLatestDebugRound({
        variable: createExtraVariableDecisionPatch(decision, {
          status: 'running',
          startedAt: Date.now(),
          finishedAt: undefined,
          error: '',
          retry429Count: 0,
          retry429LastDelayMs: 0,
          retryFailureCount: 0,
          retryFailureLastDelayMs: 0,
          applyStatus: 'idle',
          applyError: '',
          applyVerification: '',
          postProcessStatus: 'idle',
          postProcessError: '',
          phaseTimeline: [],
          currentPhase: '',
        }),
      });

      const extraUpdateResult = await executeExtraVariableUpdate({
        settings: summarySettings,
        assistantMessageId,
        latestRawReply,
        retryAutoAdvanceFailures,
        onPromptBuilt: prompt => {
          variableTraceLogger.log(`[useMessageHandler] ${logLabel}提示词已写入调试状态`, {
            assistantMessageId,
            promptLength: prompt.length,
          });
          patchLatestDebugRound({
            variable: createExtraVariableDecisionPatch(decision, {
              input: prompt,
              status: 'running',
            }),
          });
        },
        onProgress: progress => {
          variableTraceLogger.log(`[useMessageHandler] ${logLabel}进度更新`, {
            assistantMessageId,
            ...summarizeExtraVariableProgress(progress),
          });
          if (typeof progress.retryFailureCount === 'number' && progress.retryFailureCount > 0) {
            showLoading(
              `额外变量更新失败，正在自动重试 ${progress.retryFailureCount}/${MAX_AUTO_ADVANCE_FAILURE_RETRIES}...`,
            );
          }
          patchLatestDebugRound({
            variable: createExtraVariableDecisionPatch(decision, createExtraVariableProgressPatch(progress)),
          });
          // 变量块已确认写入 assistant 楼层后立即交给 tracker。不能等 ERA 后处理结束，
          // 否则已发生的 AI 变量差异会被暂时误记为 background。
          if (
            !extraDeclarationsRegistered &&
            progress.appended === true &&
            typeof progress.appendedBlocks === 'string' &&
            progress.appendedBlocks.trim()
          ) {
            extraDeclarationsRegistered = true;
            onVariableExtraDeclaredBlocks?.(progress.appendedBlocks, assistantMessageId);
          }
        },
      });

      variableTraceLogger.log(`[useMessageHandler] ${logLabel}成功，调试状态切换为 success`, {
        assistantMessageId,
        actionBlockCount: extraUpdateResult.actionBlockCount,
        appended: extraUpdateResult.appended,
      });
      if (!extraDeclarationsRegistered) {
        // extra 模式由本轮 modeSnapshot 决定；即使模型合法返回 0 个动作，也明确登记“空 AI 声明”。
        extraDeclarationsRegistered = true;
        onVariableExtraDeclaredBlocks?.(extraUpdateResult.appendedBlocks || '', assistantMessageId);
      }

      // executeExtraVariableUpdate 只有在 ERA writeDone + stat_data 最终回读验证都成功后才返回。
      // 此时再做一次 AI 目标确认，让 tracker 从“最终已验证快照”收账，避免早到的
      // writeDone / frontend 派生同步把真实 AI 变化暂记为后台后留下假「未落地」。
      if (extraUpdateResult.appended && extraUpdateResult.applyStatus === 'success') {
        onVariableAiWriteTarget?.(assistantMessageId);
      }

      patchLatestDebugRound({
        variable: createExtraVariableDecisionPatch(decision, {
          status: 'success',
          input: extraUpdateResult.prompt || '',
          output: extraUpdateResult.rawResponse,
          appendedBlocks: extraUpdateResult.appendedBlocks || '',
          finalMessageText: extraUpdateResult.finalMessageText || '',
          appendReadbackText: extraUpdateResult.appendReadbackText || '',
          appendVerification: extraUpdateResult.appendVerification || '',
          syncReadbackText: extraUpdateResult.syncReadbackText || '',
          syncVerification: extraUpdateResult.syncVerification || '',
          retry429Count: extraUpdateResult.retry429Count ?? 0,
          retry429LastDelayMs: extraUpdateResult.retry429LastDelayMs ?? 0,
          retryFailureCount: extraUpdateResult.retryFailureCount ?? 0,
          retryFailureLastDelayMs: extraUpdateResult.retryFailureLastDelayMs ?? 0,
          applyStatus: extraUpdateResult.applyStatus || 'idle',
          applyVerification: extraUpdateResult.applyVerification || '',
          applyError: extraUpdateResult.applyError || '',
          finishedAt: Date.now(),
        }),
      });

      return extraUpdateResult;
    },
    [onVariableAiWriteTarget, onVariableExtraDeclaredBlocks, patchLatestDebugRound, showLoading, summarySettings],
  );

  const handleSendMessage = useCallback(
    async (message: string, options: SendMessageOptions = {}): Promise<string> => {
      const rawPlayerInput = options.rawPlayerInput?.trim() || '';
      messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      messageLogger.log('🚀 开始发送消息流程');
      messageLogger.log('📝 用户输入:', message);
      messageLogger.log('⏱️ 时间戳:', new Date().toISOString());
      messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      setIsLoading(true);
      showLoading('正在生成回复...');
      messageLogger.log('🔄 isLoading 设置为 true');
      const debugRoundId = beginDebugRound(message);
      const extraVariableDecision = createExtraVariableRunDecision('send', summarySettings);
      patchLatestDebugRound({
        variable: createInitialExtraVariableDecisionPatch(extraVariableDecision),
      });

      let extraVariableUpdateReservation: ExtraVariableUpdateReservation | null = null;
      let createdLatestMessageId: number | null = null;
      const turnChatId = readCurrentChatIdForTurn();
      let turnLockRequestStarted = false;

      try {
        turnLockRequestStarted = true;
        await acquireWuxiaTurnLock(debugRoundId, turnChatId);
        extraVariableUpdateReservation = await prepareExtraVariableUpdateForDecision(extraVariableDecision);
        const beforeSendLastMessageId = getLatestMessageId();
        onVariableTurnStart?.(extraVariableDecision.modeSnapshot);

        // ========== 步骤 1: 创建用户消息楼层 ==========
        messageLogger.log('');
        messageLogger.log('📌 [步骤 1] 创建用户消息楼层');
        messageLogger.log('调用 createChatMessages() 参数:', {
          role: 'user',
          message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
          options: { refresh: 'none' },
        });

        const createUserResult = await createChatMessages(
          [
            {
              role: 'user',
              message: message,
              ...(rawPlayerInput
                ? {
                    data: {
                      [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: rawPlayerInput },
                    },
                  }
                : {}),
            },
          ],
          {
            refresh: 'none',
          },
        );
        messageLogger.log('✅ [步骤 1] 用户消息楼层创建完成');
        messageLogger.log('createChatMessages 返回值:', createUserResult);
        messageLogger.log('返回值类型:', typeof createUserResult);
        const userMessage = getNewestMessageAfter(beforeSendLastMessageId, 'user');
        createdLatestMessageId = userMessage?.message_id ?? null;
        recordIframeLifecycleEvent('wuxia-frontend', 'turn-user-message-created', {
          roundId: debugRoundId,
          chatId: turnChatId,
          messageId: createdLatestMessageId,
        });

        // ========== 步骤 2: 调用 generate() 触发 AI 生成 ==========
        messageLogger.log('');
        messageLogger.log('📌 [步骤 2] 同步待补全变量');
        await flushPendingGameDataCompletion('before-generate');
        messageLogger.log('✅ [步骤 2] 待补全变量同步完成');

        const frontendVariables = await syncFrontendDerivedVariables({
          explicitMapTargets: extractExplicitMapTargetsFromText(message),
        });
        messageLogger.log('🗺️ 前端变量刷新:', frontendVariables ? '完成' : '失败');

        messageLogger.log('📌 [步骤 2] 调用 generate() 触发 AI 生成');
        messageLogger.log('generate 参数:', { should_stream: true });
        messageLogger.log('⏳ 等待 AI 回复中...');
        recordIframeLifecycleEvent('wuxia-frontend', 'turn-main-generation-started', {
          roundId: debugRoundId,
          chatId: turnChatId,
          userMessageId: createdLatestMessageId,
        });

        const generateStartTime = Date.now();
        const combinedPromptCapture = captureNextCombinedPromptForDebug(prompt => {
          patchLatestDebugRound({ main: { combinedPrompt: prompt } });
        });
        let result: string | GenerateToolCallResult;
        try {
          const requestMainModel = async () => {
            const generated = await runWith429Retry(
              () =>
                generate({
                  should_stream: true,
                }),
              {
                requestLabel: '正文模型',
                onRetry: ({ retryNumber, maxRetries, delayMs, error }) => {
                  patchLatestDebugRound({
                    main: {
                      retry429Count: retryNumber,
                      retry429LastDelayMs: delayMs,
                    },
                  });
                  messageLogger.warn('[useMessageHandler] 正文模型返回 429，准备自动重试', {
                    retryNumber,
                    maxRetries,
                    delayMs,
                    error,
                  });
                },
              },
            );

            if (options.autoAdvance) {
              const generatedText = typeof generated === 'string' ? generated : generated.content;
              if (!generatedText?.trim()) {
                throw new Error('正文模型返回空回复');
              }
              if (extraVariableDecision.modeSnapshot === 'inline') {
                assertValidTurnVariableBlocks(generatedText);
              }
            }
            return generated;
          };

          result = options.autoAdvance
            ? await runWithAutoAdvanceFailureRetry(requestMainModel, {
                requestLabel: '正文模型',
                onRetry: ({ retryNumber, maxRetries, delayMs, error }) => {
                  patchLatestDebugRound({
                    main: {
                      retryFailureCount: retryNumber,
                      retryFailureLastDelayMs: delayMs,
                    },
                  });
                  showLoading(`正文生成失败，正在自动重试 ${retryNumber}/${maxRetries}...`);
                  messageLogger.warn('[useMessageHandler] 正文模型失败，准备自动推进重试', {
                    retryNumber,
                    maxRetries,
                    delayMs,
                    error,
                  });
                },
              })
            : await requestMainModel();
        } finally {
          combinedPromptCapture?.stop();
        }
        const rawResultText = typeof result === 'string' ? result : result.content;
        let resultText = normalizeAssistantReplyForPersistence(rawResultText);
        if (resultText && extraVariableDecision.modeSnapshot === 'inline') {
          const timeValidation = await validateOrRepairInlineWorldTimeReply({
            settings: summarySettings,
            rawReply: resultText,
          });
          resultText = timeValidation.replyText;
          if (timeValidation.timeRepairAttempted) {
            messageLogger.warn('[useMessageHandler] inline 世界时间已在建立 assistant 楼层前定向纠错');
            variableTraceLogger.warn('[useMessageHandler] inline 时间块已通过定向纠错替换', {
              repairedBlocks: timeValidation.blocksText,
            });
          }
        }
        const generateEndTime = Date.now();
        recordIframeLifecycleEvent('wuxia-frontend', 'turn-main-generation-returned', {
          roundId: debugRoundId,
          chatId: turnChatId,
          outputLength: rawResultText?.length ?? 0,
          durationMs: generateEndTime - generateStartTime,
        });

        messageLogger.log('✅ [步骤 2] generate() 调用完成');
        messageLogger.log('耗时:', generateEndTime - generateStartTime, 'ms');
        messageLogger.log('返回值类型:', typeof result);
        messageLogger.log('返回文本是否为空:', !rawResultText);
        messageLogger.log('返回文本长度:', rawResultText ? rawResultText.length : 0);
        messageLogger.log('持久化文本长度:', resultText.length);
        messageLogger.log('返回文本前 500 字符:', rawResultText ? rawResultText.substring(0, 500) : '(null/undefined)');
        if (rawResultText && rawResultText.length > 500) {
          messageLogger.log('返回文本后 200 字符:', rawResultText.substring(rawResultText.length - 200));
        }

        if (resultText) {
          // ========== 步骤 3: 解析 AI 回复 ==========
          messageLogger.log('');
          messageLogger.log('📌 [步骤 3] 解析 AI 回复');

          const maintext = resultText;
          const replyOptions = parseOptions(resultText);
          onVariableAssistantReply?.(resultText);

          messageLogger.log('🔧 调试模式：直接显示 AI 完整回复');
          messageLogger.log('parseMaintext 结果 (完整内容):');
          messageLogger.log('  - 是否有内容:', !!maintext);
          messageLogger.log('  - 长度:', maintext.length);
          messageLogger.log('  - 前 300 字符:', maintext.substring(0, 300));
          messageLogger.log('parseOptions 结果:');
          messageLogger.log('  - 选项数量:', replyOptions.length);
          messageLogger.log('  - 选项列表:', replyOptions);

          // ========== 步骤 4: 创建 assistant 楼层 ==========
          messageLogger.log('');
          messageLogger.log('📌 [步骤 4] 创建 assistant 消息楼层');
          messageLogger.log('调用 createChatMessages() 参数:', {
            role: 'assistant',
            messageLength: resultText.length,
            options: { refresh: 'none' },
          });

          const inlineEraWriteObserver = COMPLETE_VARIABLE_ACTION_BLOCK_REGEX.test(resultText)
            ? observeEraWriteDone({ expectedAction: 'resync' })
            : null;
          let assistantMessage: ChatMessageWithSwipes | null = null;
          try {
            const createAssistantResult = await createChatMessages(
              [
                {
                  role: 'assistant',
                  message: resultText,
                },
              ],
              {
                refresh: 'none',
              },
            );
            messageLogger.log('✅ [步骤 4] assistant 消息楼层创建完成');
            messageLogger.log('createChatMessages 返回值:', createAssistantResult);
            assistantMessage = getNewestMessageAfter(beforeSendLastMessageId, 'assistant');
            if (inlineEraWriteObserver && assistantMessage?.message_id !== undefined) {
              await inlineEraWriteObserver.waitForMessageId(assistantMessage.message_id, {
                timeoutMs: 20000,
                timeoutMessage: 'ERA 没有确认当前 assistant 楼层的 inline 变量写入，已停止事件结算。',
              });
            }
          } finally {
            inlineEraWriteObserver?.stop();
          }
          createdLatestMessageId = assistantMessage?.message_id ?? createdLatestMessageId;
          recordIframeLifecycleEvent('wuxia-frontend', 'turn-assistant-message-created', {
            roundId: debugRoundId,
            chatId: turnChatId,
            messageId: assistantMessage?.message_id ?? null,
          });
          if (assistantMessage?.message_id !== undefined) {
            onVariableAiWriteTarget?.(assistantMessage.message_id);
          }
          onVariableAssistantReply?.(resultText, assistantMessage?.message_id);

          // ========== 步骤 5: 手动刷新前端显示 ==========
          messageLogger.log('');
          messageLogger.log('📌 [步骤 5] 手动刷新前端显示');
          messageLogger.log('当前 currentMaintext 长度:', currentMaintext.length);
          messageLogger.log('当前 currentOptions:', currentOptions);
          messageLogger.log('即将设置 maintext 长度:', maintext.length);
          messageLogger.log('即将设置 options:', replyOptions);

          setCurrentMaintext(maintext);
          setCurrentOptions(replyOptions);
          if (assistantMessage?.message_id !== undefined) {
            onAssistantDisplayCommit?.(assistantMessage.message_id, assistantMessage.swipe_id ?? 0);
          }

          patchLatestDebugRound({
            main: {
              status: 'success',
              output: rawResultText,
              finishedAt: Date.now(),
            },
          });

          let committedVariableBlocks = resultText;
          if (extraVariableDecision.shouldRunExtra) {
            if (!assistantMessage?.message_id) {
              const errorMessage = '正文已生成，但没有找到可追加变量块的 assistant 楼层。';
              patchLatestDebugRound({
                variable: createExtraVariableDecisionPatch(extraVariableDecision, {
                  status: 'error',
                  error: errorMessage,
                  finishedAt: Date.now(),
                }),
              });
              if (options.autoAdvance) {
                throw new PostGenerationStepError(errorMessage);
              }
              showError(errorMessage);
              return rawResultText;
            }
            try {
              const extraUpdateResult = await runExtraVariableUpdate({
                decision: extraVariableDecision,
                assistantMessageId: assistantMessage.message_id,
                latestRawReply: resultText,
                logLabel: '额外变量更新',
                retryAutoAdvanceFailures: options.autoAdvance === true,
              });
              if (extraUpdateResult?.appended && extraUpdateResult.finalMessageText) {
                refreshAssistantStateFromFinalText(extraUpdateResult.finalMessageText);
              }
              committedVariableBlocks = `${resultText}\n${extraUpdateResult?.appendedBlocks || ''}`;
            } catch (error) {
              const errorMessage = getErrorMessage(error);
              messageLogger.error('额外变量更新失败:', error);
              variableTraceLogger.error('[useMessageHandler] 额外变量更新失败，调试状态切换为 error', {
                assistantMessageId: assistantMessage.message_id,
                error: errorMessage,
              });
              patchLatestDebugRound({
                variable: createExtraVariableDecisionPatch(extraVariableDecision, {
                  status: 'error',
                  error: errorMessage,
                  finishedAt: Date.now(),
                }),
              });
              const postGenerationError = new PostGenerationStepError(
                `正文已生成，但额外变量更新失败：${errorMessage}`,
                { cause: error },
              );
              if (options.autoAdvance) {
                throw postGenerationError;
              }
              showError(postGenerationError.message);
              return rawResultText;
            }
          }

          if (!assistantMessage?.message_id) {
            const postGenerationError = new PostGenerationStepError(
              '正文已生成，但没有找到可确认变量提交的 assistant 楼层。',
            );
            if (options.autoAdvance) {
              throw postGenerationError;
            }
            showError(postGenerationError.message);
            return rawResultText;
          }
          try {
            await ensureTurnVariableBlocksCommitted({
              assistantMessageId: assistantMessage.message_id,
              blocksText: committedVariableBlocks,
            });
          } catch (error) {
            const errorMessage = getErrorMessage(error);
            messageLogger.error('本回合变量提交确认失败:', error);
            const postGenerationError = new PostGenerationStepError(`正文已生成，但变量提交确认失败：${errorMessage}`, {
              cause: error,
            });
            if (options.autoAdvance) {
              throw postGenerationError;
            }
            showError(postGenerationError.message);
            return rawResultText;
          }

          messageLogger.log('✅ [步骤 5] 前端状态已更新');
          messageLogger.log('注意: React 状态更新是异步的，新值将在下次渲染时生效');

          if (summarySettings.conversationArchiveEnabled && summarySettings.conversationSummaryMode === 'card') {
            try {
              const archiveResult = await maybeArchiveConversationSummaries({
                settings: summarySettings,
                latestAssistantMessageId: assistantMessage.message_id,
              });
              if (archiveResult.archived) {
                messageLogger.log('🗃️ 长期叙事记忆归档完成:', archiveResult);
              }
            } catch (error) {
              // 长期摘要属于可选的上下文压缩，不得让一次归档失败反向判定正文回合失败。
              messageLogger.warn('长期叙事记忆归档失败，本回合正文与变量仍保留:', error);
            }
          }

          // 回合成功完成（文本已生成、助手楼层已写入、extra 模式下 ERA 写入已确认）
          // → 通知事件脚本扣减线索倒计时（替代 MESSAGE_SENT 的发送即扣）。
          const completedMessageId = assistantMessage.message_id;
          if (completedMessageId !== null && Number.isInteger(completedMessageId)) {
            await eventEmit(WUXIA_TURN_COMPLETED_EVENT, {
              messageId: completedMessageId,
              chatId: turnChatId,
              roundId: debugRoundId,
            });
            try {
              await finalizeHistoryNodeAfterEvents();
            } catch (error) {
              messageLogger.error('回合已完成，但自动历史节点封存失败:', error);
              showError(`回合已完成，但自动历史节点封存失败：${getErrorMessage(error)}`);
            }
            onVariableTurnSettled?.(completedMessageId);
          }

          dismissToast();
          return rawResultText;
        } else {
          // ========== 错误处理: AI 回复为空 ==========
          messageLogger.log('');
          messageLogger.warn('⚠️ [错误处理] AI 回复为空');
          messageLogger.log('result 值:', result);
          messageLogger.log('result 类型:', typeof result);

          patchLatestDebugRound({
            main: {
              status: 'error',
              error: `AI 回复为空。返回值: ${result === null ? 'null' : result === undefined ? 'undefined' : JSON.stringify(result)}；类型: ${typeof result}`,
              finishedAt: Date.now(),
            },
          });

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

        if (!(error instanceof PostGenerationStepError)) {
          patchLatestDebugRound({
            main: {
              status: 'error',
              error: `${errorMessage}\n\n${errorStack}`,
              finishedAt: Date.now(),
            },
          });
        }

        if (!options.autoAdvance) {
          showError(`生成失败：${errorMessage}`);
        }
        recordIframeLifecycleEvent('wuxia-frontend', 'turn-failed', {
          roundId: debugRoundId,
          chatId: turnChatId,
          error: errorMessage,
          latestCreatedMessageId: createdLatestMessageId,
        });
        if (options.autoAdvance) {
          throw error;
        }
        return '';
      } finally {
        extraVariableUpdateReservation?.release();
        setIsLoading(false);
        if (turnLockRequestStarted) {
          try {
            await releaseWuxiaTurnLock(debugRoundId, turnChatId, createdLatestMessageId);
          } catch (error) {
            recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-release-failed', {
              roundId: debugRoundId,
              chatId: turnChatId,
              error: getErrorMessage(error),
            });
          }
        }
        messageLogger.log('');
        messageLogger.log('🏁 流程结束');
        messageLogger.log('🔄 isLoading 设置为 false');
        messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    },
    [
      currentMaintext,
      currentOptions,
      beginDebugRound,
      patchLatestDebugRound,
      prepareExtraVariableUpdateForDecision,
      runExtraVariableUpdate,
      setIsLoading,
      showLoading,
      showError,
      dismissToast,
      setCurrentMaintext,
      setCurrentOptions,
      summarySettings,
      onVariableTurnStart,
      onVariableAssistantReply,
      onVariableAiWriteTarget,
      onVariableTurnSettled,
      onAssistantDisplayCommit,
      refreshAssistantStateFromFinalText,
    ],
  );

  const handleAutoAdvanceTurn = useCallback(
    async (message: string): Promise<AutoAdvanceTurnResult> => {
      const prompt = message.trim();
      if (!prompt) {
        throw new Error('自动推进指令不能为空。');
      }

      messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      messageLogger.log('⏩ 开始自动推进手动回合');
      messageLogger.log('📝 推进指令:', prompt);

      let variableWriteObserved = false;
      const writeDoneListener = eventOn('era:writeDone', () => {
        variableWriteObserved = true;
      });

      try {
        const beforeLastMessageId = getLatestMessageId();
        const rawReply = await handleSendMessage(prompt, { autoAdvance: true });
        if (!rawReply.trim()) {
          throw new Error('本轮没有取得 AI 回复');
        }

        const userMessage = getNewestMessageAfter(beforeLastMessageId, 'user');
        const assistantMessage = getNewestMessageAfter(beforeLastMessageId, 'assistant');
        if (!userMessage || !assistantMessage) {
          throw new Error('手动发送流程完成后，没有找到对应的新楼层记录。');
        }

        const recordedRawReply = getActiveMessageText(assistantMessage) || rawReply;
        messageLogger.log('✅ 自动推进完整回合完成:', {
          userMessageId: userMessage.message_id,
          assistantMessageId: assistantMessage.message_id,
          variableWriteObserved,
        });

        return {
          prompt,
          userMessageId: userMessage.message_id,
          assistantMessageId: assistantMessage.message_id,
          plainText: createAutoAdvancePlainText(rawReply),
          rawReply: recordedRawReply,
          variableWriteObserved,
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        messageLogger.error('自动推进失败:', error);
        if (!(error instanceof PostGenerationStepError)) {
          patchLatestDebugRound({
            main: {
              status: 'error',
              error: errorMessage,
              finishedAt: Date.now(),
            },
          });
        }
        showError(`自动推进失败：${errorMessage}`);
        throw error;
      } finally {
        writeDoneListener.stop();
        messageLogger.log('🏁 自动推进流程结束');
        messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    },
    [handleSendMessage, patchLatestDebugRound, showError],
  );

  const handleRegenerateLastAssistant = useCallback(async (replacementUserInput?: string): Promise<void> => {
    const isEditingPreviousInput = typeof replacementUserInput === 'string';
    messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    messageLogger.log(isEditingPreviousInput ? '🔁 修改上一轮输入并重新生成最新回复' : '🔁 开始重新生成最新回复');

    setIsLoading(true);
    showLoading(isEditingPreviousInput ? '正在按修改后的上一轮输入重新生成...' : '正在重新生成回复...');
    const debugRoundId = beginDebugRound(isEditingPreviousInput ? '修改上一轮输入并重新生成' : '重新生成最新回复');
    const extraVariableDecision = createExtraVariableRunDecision('regenerate', summarySettings);
    patchLatestDebugRound({
      variable: createInitialExtraVariableDecisionPatch(extraVariableDecision),
    });

    let extraVariableUpdateReservation: ExtraVariableUpdateReservation | null = null;
    let targetAssistantMessageId: number | null = null;
    const turnChatId = readCurrentChatIdForTurn();
    let turnLockRequestStarted = false;

    try {
      turnLockRequestStarted = true;
      await acquireWuxiaTurnLock(debugRoundId, turnChatId);
      extraVariableUpdateReservation = await prepareExtraVariableUpdateForDecision(extraVariableDecision);
      const result = await regenerateLastAssistantSwipe({
        replacementUserInput,
        onCombinedPrompt: prompt => {
          patchLatestDebugRound({ main: { combinedPrompt: prompt } });
        },
        onTargetAssistantResolved: assistantMessageId => {
          targetAssistantMessageId = assistantMessageId;
        },
        onVariableBaselineReady: assistantMessageId => {
          // 旧 swipe 已回滚，但随机数/战力区/周围地点等重新生成前派生写入尚未发生。
          // 从这里建立 baseline，既排除旧回复回滚，又保留本轮所有真实后台修改。
          onVariableTurnStart?.(extraVariableDecision.modeSnapshot);
          onVariableAiWriteTarget?.(assistantMessageId);
        },
        onGeneratedReplyReady: replyText => {
          // 新正文已生成但尚未写回；在 ERA 应用新 swipe 前登记 AI 变量声明。
          onVariableAssistantReply?.(replyText);
        },
      });
      targetAssistantMessageId = result.assistantMessageId;
      // 新 swipe / inline ERA 已完成后再推进 AI checkpoint。
      onVariableAssistantReply?.(result.rawReply, result.assistantMessageId);
      patchLatestDebugRound({
        main: {
          userInput: result.userInput || '重新生成最新回复',
          combinedPrompt: result.combinedPrompt || result.userInput || '重新生成最新回复',
          output: result.rawReply,
          status: 'success',
          finishedAt: Date.now(),
        },
      });
      setCurrentMaintext(result.maintext);
      setCurrentOptions(result.options);
      onAssistantDisplayCommit?.(result.assistantMessageId, result.assistantSwipeId);

      let committedVariableBlocks = result.rawReply;
      if (extraVariableDecision.shouldRunExtra) {
        try {
          const extraUpdateResult = await runExtraVariableUpdate({
            decision: extraVariableDecision,
            assistantMessageId: result.assistantMessageId,
            latestRawReply: result.rawReply,
            logLabel: '重新生成后的额外变量更新',
          });
          if (extraUpdateResult?.appended && extraUpdateResult.finalMessageText) {
            refreshAssistantStateFromFinalText(extraUpdateResult.finalMessageText);
          } else {
            const latestContent = getLastMessageContent();
            if (latestContent) {
              setCurrentMaintext(latestContent);
              setCurrentOptions(parseOptions(latestContent));
            }
          }
          committedVariableBlocks = `${result.rawReply}\n${extraUpdateResult?.appendedBlocks || ''}`;
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          messageLogger.error('重新生成后的额外变量更新失败:', error);
          variableTraceLogger.error('[useMessageHandler] 重新生成后的额外变量更新失败，调试状态切换为 error', {
            assistantMessageId: result.assistantMessageId,
            error: errorMessage,
          });
          patchLatestDebugRound({
            variable: createExtraVariableDecisionPatch(extraVariableDecision, {
              status: 'error',
              error: errorMessage,
              finishedAt: Date.now(),
            }),
          });
          showError(`重新生成已完成，但额外变量更新失败：${errorMessage}`);
          return;
        }
      }

      try {
        await ensureTurnVariableBlocksCommitted({
          assistantMessageId: result.assistantMessageId,
          blocksText: committedVariableBlocks,
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        messageLogger.error('重新生成后的变量提交确认失败:', error);
        showError(`重新生成已完成，但变量提交确认失败：${errorMessage}`);
        return;
      }

      // 回合成功完成（重新生成成功，助手楼层新 swipe 已写入、ERA 已确认）
      // → 通知事件脚本扣减线索倒计时。regenerate 的 messageId 不变，事件脚本按 messageId 去重，
      // 因此同一楼层多次 regenerate 只扣一次。
      if (targetAssistantMessageId !== null && Number.isInteger(targetAssistantMessageId)) {
        await eventEmit(WUXIA_TURN_COMPLETED_EVENT, {
          messageId: targetAssistantMessageId,
          chatId: turnChatId,
          roundId: debugRoundId,
        });
        try {
          await finalizeHistoryNodeAfterEvents();
        } catch (error) {
          messageLogger.error('重新生成已完成，但自动历史节点封存失败:', error);
          showError(`重新生成已完成，但自动历史节点封存失败：${getErrorMessage(error)}`);
        }
        onVariableTurnSettled?.(targetAssistantMessageId);
      }

      dismissToast();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      messageLogger.error('重新生成失败:', error);
      patchLatestDebugRound({
        main: {
          status: 'error',
          error: errorMessage,
          finishedAt: Date.now(),
        },
      });
      showError(`重新生成失败：${errorMessage}`);
    } finally {
      extraVariableUpdateReservation?.release();
      setIsLoading(false);
      if (turnLockRequestStarted) {
        try {
          await releaseWuxiaTurnLock(debugRoundId, turnChatId, targetAssistantMessageId);
        } catch (error) {
          recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-release-failed', {
            roundId: debugRoundId,
            chatId: turnChatId,
            error: getErrorMessage(error),
          });
        }
      }
      messageLogger.log('🏁 重新生成流程结束');
      messageLogger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }, [
    beginDebugRound,
    dismissToast,
    patchLatestDebugRound,
    prepareExtraVariableUpdateForDecision,
    runExtraVariableUpdate,
    setCurrentMaintext,
    setCurrentOptions,
    setIsLoading,
    showError,
    showLoading,
    summarySettings,
    refreshAssistantStateFromFinalText,
    onVariableTurnStart,
    onVariableAssistantReply,
    onVariableAiWriteTarget,
    onVariableTurnSettled,
  ]);

  return {
    handleSendMessage,
    handleAutoAdvanceTurn,
    handleRegenerateLastAssistant,
  };
}
