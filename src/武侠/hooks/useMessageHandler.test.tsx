import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/variableReader', () => ({
  flushPendingGameDataCompletion: vi.fn(async () => {}),
  getLastMessageContent: vi.fn(() => '最新正文'),
  normalizeDisplayedMessageContent: vi.fn((text: string) => text),
  parseAIResponse: vi.fn((text: string) => ({ content: text })),
  parseOptions: vi.fn((text: string) => (text.includes('<option>') ? ['选项'] : [])),
  readGameDataPure: vi.fn(() => ({
    currentLocation: '襄阳/城内/客栈',
    gameTime: '1199年8月16日11时',
  })),
}));

vi.mock('../utils/messageActions', () => ({
  regenerateLastAssistantSwipe: vi.fn(),
}));

vi.mock('../utils/saveLoadManager', () => ({
  finalizeCurrentTurn: vi.fn(async () => {}),
}));

vi.mock('../utils/promptDebug', () => ({
  captureNextCombinedPromptForDebug: vi.fn(() => ({ stop: vi.fn() })),
}));

vi.mock('../utils/frontendDerivedVariables', () => ({
  syncFrontendDerivedVariables: vi.fn(async () => null),
}));

vi.mock('../utils/locationContext', () => ({
  extractExplicitMapTargetsFromText: vi.fn(() => []),
  syncDynamicLocationContextVariable: vi.fn(async () => ({ 已解析: true })),
}));

vi.mock('../utils/extraVariableUpdateManager', () => ({
  ensureTurnVariableBlocksCommitted: vi.fn(),
  executeExtraVariableUpdate: vi.fn(),
  prepareExtraVariableUpdateTurn: vi.fn(),
}));

vi.mock('../utils/eraWriteWait', () => ({
  observeEraWriteDone: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  dataLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  messageLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  variableTraceLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { DEFAULT_SUMMARY_SETTINGS } from '../utils/settingsManager';
import { useMessageHandler } from './useMessageHandler';
import {
  ensureTurnVariableBlocksCommitted,
  executeExtraVariableUpdate,
  prepareExtraVariableUpdateTurn,
} from '../utils/extraVariableUpdateManager';
import { observeEraWriteDone } from '../utils/eraWriteWait';
import { regenerateLastAssistantSwipe } from '../utils/messageActions';

type ChatRole = 'system' | 'assistant' | 'user';

type MockChatMessage = {
  message_id: number;
  role: ChatRole;
  message: string;
  swipes: string[];
  swipe_id: number;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;
const globals = globalThis as typeof globalThis & {
  createChatMessages: ReturnType<typeof vi.fn>;
  generate: ReturnType<typeof vi.fn>;
  eventEmit: ReturnType<typeof vi.fn>;
};

const prepareExtraVariableUpdateTurnMock = vi.mocked(prepareExtraVariableUpdateTurn);
const executeExtraVariableUpdateMock = vi.mocked(executeExtraVariableUpdate);
const ensureTurnVariableBlocksCommittedMock = vi.mocked(ensureTurnVariableBlocksCommitted);
const observeEraWriteDoneMock = vi.mocked(observeEraWriteDone);
const regenerateLastAssistantSwipeMock = vi.mocked(regenerateLastAssistantSwipe);

const createSummarySettings = (variableUpdateMode: 'inline' | 'extra') => ({
  ...DEFAULT_SUMMARY_SETTINGS,
  variableUpdateMode,
});

const createHookOptions = (summarySettings: ReturnType<typeof createSummarySettings>) => ({
  setIsLoading: vi.fn(),
  showLoading: vi.fn(),
  showError: vi.fn(),
  dismissToast: vi.fn(),
  updateGameState: vi.fn(),
  setCurrentMaintext: vi.fn(),
  setCurrentOptions: vi.fn(),
  beginDebugRound: vi.fn(() => 'debug-round-id'),
  patchLatestDebugRound: vi.fn(),
  currentMaintext: '',
  currentOptions: [] as string[],
  summarySettings,
  onVariableTurnStart: vi.fn(),
  onVariableAssistantReply: vi.fn(),
  onVariableExtraDeclaredBlocks: vi.fn(),
  onVariableAiWriteTarget: vi.fn(),
});

describe('useMessageHandler extra-variable decision', () => {
  let messages: MockChatMessage[];
  let nextMessageId: number;
  let turnLockAckResponder: EventOnReturn;

  beforeEach(() => {
    messages = [];
    nextMessageId = 1;

    globals.createChatMessages = vi.fn(async (entries: Array<{ role: ChatRole; message: string }>) => {
      for (const entry of entries) {
        messages.push({
          message_id: nextMessageId,
          role: entry.role,
          message: entry.message,
          swipes: [entry.message],
          swipe_id: 0,
        });
        nextMessageId += 1;
      }
      return undefined;
    });
    globals.generate = vi.fn(async () => '正文回复');

    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === '0-{{lastMessageId}}') {
        return clone(messages);
      }
      if (typeof messageId === 'number') {
        return clone(messages.filter(message => message.message_id === messageId));
      }
      return clone(messages);
    });

    prepareExtraVariableUpdateTurnMock.mockReset();
    executeExtraVariableUpdateMock.mockReset();
    ensureTurnVariableBlocksCommittedMock.mockReset().mockResolvedValue({
      verified: true,
      verification: '测试变量已提交',
      pendingPaths: [],
    });
    observeEraWriteDoneMock.mockReset().mockReturnValue({
      waitForMessageId: vi.fn(async () => ({ message_id: 2, actions: { resync: true } })),
      stop: vi.fn(),
    });
    regenerateLastAssistantSwipeMock.mockReset();
    globals.eventEmit.mockClear();
    localStorage.clear();
    turnLockAckResponder = eventOn('wuxia:turn-lifecycle', async (payload: Record<string, unknown>) => {
      if (payload.phase !== 'start') return;
      await eventEmit('wuxia:turn-lock-ack', {
        phase: 'locked',
        roundId: payload.roundId,
        chatId: payload.chatId,
        scriptRuntimeId: 'hidden-floor-test',
        lockedAt: Date.now(),
      });
    });
  });

  it('回合锁未确认时不会创建用户楼层', async () => {
    vi.useFakeTimers();
    turnLockAckResponder.stop();
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      const send = result.current.handleSendMessage('不应落楼层');
      await vi.advanceTimersByTimeAsync(2_000);
      await send;
    });

    expect(globals.createChatMessages).not.toHaveBeenCalled();
    expect(globals.generate).not.toHaveBeenCalled();
    expect(options.showError).toHaveBeenCalledWith(expect.stringContaining('回合锁未确认'));
  });

  it('send + inline 会显式标记 skipped，且不会触发额外变量链路', async () => {
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试发送');
    });

    expect(prepareExtraVariableUpdateTurnMock).not.toHaveBeenCalled();
    expect(executeExtraVariableUpdateMock).not.toHaveBeenCalled();
    expect(globals.generate).toHaveBeenCalledWith({ should_stream: true });
    expect(options.onVariableExtraDeclaredBlocks).not.toHaveBeenCalled();
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      variable: expect.objectContaining({
        trigger: 'send',
        modeSnapshot: 'inline',
        status: 'skipped',
        skipReason: expect.stringContaining('inline'),
      }),
    });
    expect(globals.eventEmit).toHaveBeenCalledWith('wuxia:turn-lifecycle', {
      phase: 'start',
      roundId: 'debug-round-id',
      chatId: expect.any(String),
    });
    expect(globals.eventEmit).toHaveBeenCalledWith('wuxia:turn-lifecycle', {
      phase: 'finish',
      roundId: 'debug-round-id',
      chatId: expect.any(String),
      messageId: 2,
    });
    expect(globals.eventEmit).toHaveBeenCalledWith('wuxia:turn-completed', {
      messageId: 2,
      chatId: expect.any(String),
      roundId: 'debug-round-id',
    });
  });

  it('send + inline 会先等匹配 resync 和 stat_data 回读，再发送回合完成', async () => {
    globals.generate = vi.fn(
      async () => '正文回复\n<VariableEdit>{"世界信息":{"时间":{"年":1200,"月":1,"日":1,"时":1}}}</VariableEdit>',
    );
    const waitForMessageId = vi.fn(async () => ({ message_id: 2, actions: { resync: true } }));
    const stop = vi.fn();
    observeEraWriteDoneMock.mockReturnValue({ waitForMessageId, stop });
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试同轮时间与参与事件变化');
    });

    expect(observeEraWriteDoneMock).toHaveBeenCalledWith({ expectedAction: 'resync' });
    expect(waitForMessageId).toHaveBeenCalledWith(2, expect.objectContaining({ timeoutMs: 20000 }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(ensureTurnVariableBlocksCommittedMock).toHaveBeenCalledWith({
      assistantMessageId: 2,
      blocksText: expect.stringContaining('<VariableEdit>'),
    });
    const completedCallIndex = globals.eventEmit.mock.calls.findIndex(
      ([eventName]) => eventName === 'wuxia:turn-completed',
    );
    expect(completedCallIndex).toBeGreaterThanOrEqual(0);
    expect(ensureTurnVariableBlocksCommittedMock.mock.invocationCallOrder[0]).toBeLessThan(
      globals.eventEmit.mock.invocationCallOrder[completedCallIndex],
    );
  });

  it('变量回读未确认时不发送回合完成，但仍释放 lifecycle 屏障', async () => {
    globals.generate = vi.fn(
      async () => '正文回复\n<VariableEdit>{"世界信息":{"时间":{"年":1200,"月":1,"日":1,"时":1}}}</VariableEdit>',
    );
    ensureTurnVariableBlocksCommittedMock.mockRejectedValue(new Error('时间与参与事件尚未同时落库'));
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试变量确认失败');
    });

    expect(globals.eventEmit).not.toHaveBeenCalledWith('wuxia:turn-completed', expect.anything());
    expect(globals.eventEmit).toHaveBeenCalledWith('wuxia:turn-lifecycle', {
      phase: 'finish',
      roundId: 'debug-round-id',
      chatId: expect.any(String),
      messageId: 2,
    });
    expect(options.showError).toHaveBeenCalledWith(expect.stringContaining('正文已生成，但变量提交确认失败'));
  });

  it('自动化回合会等待桥响应送达后再请求最新楼层同步', async () => {
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('自动化测试发送', { waitForBridgeResponseDelivery: true });
    });

    expect(globals.eventEmit).toHaveBeenCalledWith('wuxia:turn-lifecycle', {
      phase: 'finish',
      roundId: 'debug-round-id',
      chatId: expect.any(String),
      messageId: 2,
      waitForResponseDelivery: true,
    });
    expect(globals.eventEmit).not.toHaveBeenCalledWith('wuxia:sync-latest-message-shell', 2);
  });

  it('send 遇到两次 429 后只落一次用户和 assistant 楼层', async () => {
    globals.generate = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, retryAfterMs: 0 })
      .mockRejectedValueOnce({ response: { status: 429 }, retryAfterMs: 0 })
      .mockResolvedValue('重试后的正文');
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试限流重试');
    });

    expect(globals.generate).toHaveBeenCalledTimes(3);
    expect(globals.createChatMessages).toHaveBeenCalledTimes(2);
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1]?.message).toBe('重试后的正文');
    expect(options.showError).not.toHaveBeenCalled();
  });

  it('send 连续三次 429 后停止重试且不创建 assistant 楼层', async () => {
    globals.generate = vi.fn().mockRejectedValue({ status: 429, retryAfterMs: 0, message: 'Too Many Requests' });
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试限流耗尽');
    });

    expect(globals.generate).toHaveBeenCalledTimes(3);
    expect(globals.createChatMessages).toHaveBeenCalledTimes(1);
    expect(messages.map(message => message.role)).toEqual(['user']);
    expect(options.showError).toHaveBeenCalledWith(expect.stringContaining('已自动重试 2 次'));
  });

  it('自动推进链路继承正文 429 重试且不会重复创建楼层', async () => {
    globals.generate = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, retryAfterMs: 0 })
      .mockResolvedValue('自动化重试后的正文');
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    let autoAdvanceResult: Awaited<ReturnType<typeof result.current.handleAutoAdvanceTurn>> | undefined;
    await act(async () => {
      autoAdvanceResult = await result.current.handleAutoAdvanceTurn('自动化测试行动');
    });

    expect(globals.generate).toHaveBeenCalledTimes(2);
    expect(globals.createChatMessages).toHaveBeenCalledTimes(2);
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(autoAdvanceResult).toMatchObject({
      userMessageId: 1,
      assistantMessageId: 2,
      rawReply: '自动化重试后的正文',
    });
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      main: {
        retry429Count: 1,
        retry429LastDelayMs: 0,
      },
    });
  });

  it('send + extra 会先记录决策，再执行 prepare 和额外变量更新', async () => {
    const order: string[] = [];
    const options = createHookOptions(createSummarySettings('extra'));
    options.beginDebugRound.mockImplementation(() => {
      order.push('begin');
      return 'debug-round-id';
    });

    prepareExtraVariableUpdateTurnMock.mockImplementation(async () => {
      order.push('prepare');
      return { release: vi.fn() };
    });
    executeExtraVariableUpdateMock.mockResolvedValue({
      appended: true,
      actionBlockCount: 1,
      prompt: '额外提示词',
      rawResponse: '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>',
      appendedBlocks: '<VariableEdit>\n{\n  "user数据": {\n    "修为": 120\n  }\n}\n</VariableEdit>',
      finalMessageText: '正文回复\n\n<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>',
      appendReadbackText: '写入后回读',
      appendVerification: '写入后通过',
      syncReadbackText: '同步后回读',
      syncVerification: '同步后通过',
    });

    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试发送');
    });

    expect(order.slice(0, 2)).toEqual(['begin', 'prepare']);
    expect(prepareExtraVariableUpdateTurnMock).toHaveBeenCalledTimes(1);
    expect(executeExtraVariableUpdateMock).toHaveBeenCalledTimes(1);
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      variable: expect.objectContaining({
        trigger: 'send',
        modeSnapshot: 'extra',
        status: 'idle',
        skipReason: '',
      }),
    });
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      variable: expect.objectContaining({
        trigger: 'send',
        modeSnapshot: 'extra',
        status: 'success',
        input: '额外提示词',
        output: '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>',
      }),
    });
    expect(options.onVariableExtraDeclaredBlocks).toHaveBeenCalledWith(
      '<VariableEdit>\n{\n  "user数据": {\n    "修为": 120\n  }\n}\n</VariableEdit>',
      2,
    );
  });

  it('send + extra 失败时不会上报额外变量声明块', async () => {
    const options = createHookOptions(createSummarySettings('extra'));
    prepareExtraVariableUpdateTurnMock.mockResolvedValue({ release: vi.fn() });
    executeExtraVariableUpdateMock.mockRejectedValue(new Error('extra failed'));

    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试发送');
    });

    expect(options.onVariableExtraDeclaredBlocks).not.toHaveBeenCalled();
    expect(options.showError).toHaveBeenCalledWith('正文已生成，但额外变量更新失败：extra failed');
  });

  it('regenerate + inline 会显式标记 skipped，且不会触发额外变量链路', async () => {
    const options = createHookOptions(createSummarySettings('inline'));
    regenerateLastAssistantSwipeMock.mockResolvedValue({
      maintext: '重新生成正文',
      options: ['选项'],
      gameData: null,
      assistantMessageId: 9,
      userInput: '上一条用户输入',
      combinedPrompt: '组合提示词',
      rawReply: '重新生成正文',
    });

    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleRegenerateLastAssistant();
    });

    expect(prepareExtraVariableUpdateTurnMock).not.toHaveBeenCalled();
    expect(executeExtraVariableUpdateMock).not.toHaveBeenCalled();
    expect(options.onVariableExtraDeclaredBlocks).not.toHaveBeenCalled();
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      variable: expect.objectContaining({
        trigger: 'regenerate',
        modeSnapshot: 'inline',
        status: 'skipped',
        skipReason: expect.stringContaining('inline'),
      }),
    });
    expect(globals.eventEmit).toHaveBeenCalledWith('wuxia:sync-latest-message-shell', 9);
  });

  it('regenerate + extra 会先记录决策，再执行 prepare 和额外变量更新', async () => {
    const order: string[] = [];
    const options = createHookOptions(createSummarySettings('extra'));
    options.beginDebugRound.mockImplementation(() => {
      order.push('begin');
      return 'debug-round-id';
    });

    prepareExtraVariableUpdateTurnMock.mockImplementation(async () => {
      order.push('prepare');
      return { release: vi.fn() };
    });
    regenerateLastAssistantSwipeMock.mockResolvedValue({
      maintext: '重新生成正文',
      options: ['选项'],
      gameData: null,
      assistantMessageId: 12,
      userInput: '上一条用户输入',
      combinedPrompt: '组合提示词',
      rawReply: '重新生成正文',
    });
    executeExtraVariableUpdateMock.mockResolvedValue({
      appended: true,
      actionBlockCount: 1,
      prompt: '重生成额外提示词',
      rawResponse: '<VariableEdit>{"user数据":{"修为":130}}</VariableEdit>',
      appendedBlocks: '<VariableEdit>{"user数据":{"修为":130}}</VariableEdit>',
      finalMessageText: '重新生成正文\n\n<VariableEdit>{"user数据":{"修为":130}}</VariableEdit>',
      appendReadbackText: '写入后回读',
      appendVerification: '写入后通过',
      syncReadbackText: '同步后回读',
      syncVerification: '同步后通过',
    });

    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleRegenerateLastAssistant();
    });

    expect(order.slice(0, 2)).toEqual(['begin', 'prepare']);
    expect(prepareExtraVariableUpdateTurnMock).toHaveBeenCalledTimes(1);
    expect(executeExtraVariableUpdateMock).toHaveBeenCalledTimes(1);
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      variable: expect.objectContaining({
        trigger: 'regenerate',
        modeSnapshot: 'extra',
        status: 'success',
        input: '重生成额外提示词',
        output: '<VariableEdit>{"user数据":{"修为":130}}</VariableEdit>',
      }),
    });
    expect(options.onVariableExtraDeclaredBlocks).toHaveBeenCalledWith(
      '<VariableEdit>{"user数据":{"修为":130}}</VariableEdit>',
      12,
    );
    expect(globals.eventEmit).toHaveBeenCalledWith('wuxia:sync-latest-message-shell', 12);
  });

  it('regenerate + extra + prepare 失败时，设置页调试仍保留 variable 决策与错误', async () => {
    const options = createHookOptions(createSummarySettings('extra'));
    prepareExtraVariableUpdateTurnMock.mockRejectedValue(new Error('prepare failed'));

    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleRegenerateLastAssistant();
    });

    expect(options.beginDebugRound).toHaveBeenCalledWith('重新生成最新回复');
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      variable: expect.objectContaining({
        trigger: 'regenerate',
        modeSnapshot: 'extra',
        status: 'idle',
      }),
    });
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      variable: expect.objectContaining({
        trigger: 'regenerate',
        modeSnapshot: 'extra',
        status: 'error',
        error: 'prepare failed',
      }),
    });
    expect(options.showError).toHaveBeenCalledWith('重新生成失败：prepare failed');
  });
});
