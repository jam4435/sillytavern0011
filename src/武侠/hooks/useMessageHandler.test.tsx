import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/variableReader', () => ({
  flushPendingGameDataCompletion: vi.fn(async () => {}),
  getLastMessageContent: vi.fn(() => '最新正文'),
  normalizeAssistantReplyForPersistence: vi.fn((text: string) =>
    text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
  ),
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
  assertValidTurnVariableBlocks: vi.fn((text: string) => {
    if (text.includes('{invalid json}')) {
      throw new Error('本回合变量动作块无法完整解析');
    }
    return text.includes('<VariableInsert>') || text.includes('<VariableEdit>') || text.includes('<VariableDelete>');
  }),
  ensureTurnVariableBlocksCommitted: vi.fn(),
  executeExtraVariableUpdate: vi.fn(),
  prepareExtraVariableUpdateTurn: vi.fn(),
  validateOrRepairInlineWorldTimeReply: vi.fn(async ({ rawReply }: { rawReply: string }) => ({
    replyText: rawReply,
    timeRepairAttempted: false,
    blocksText: rawReply,
  })),
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
  validateOrRepairInlineWorldTimeReply,
} from '../utils/extraVariableUpdateManager';
import { observeEraWriteDone } from '../utils/eraWriteWait';
import { regenerateLastAssistantSwipe } from '../utils/messageActions';

type ChatRole = 'system' | 'assistant' | 'user';

type MockChatMessage = {
  message_id: number;
  role: ChatRole;
  message: string;
  data?: Record<string, unknown>;
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
const validateOrRepairInlineWorldTimeReplyMock = vi.mocked(validateOrRepairInlineWorldTimeReply);
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

    globals.createChatMessages = vi.fn(
      async (entries: Array<{ role: ChatRole; message: string; data?: Record<string, unknown> }>) => {
        for (const entry of entries) {
          messages.push({
            message_id: nextMessageId,
            role: entry.role,
            message: entry.message,
            ...(entry.data ? { data: clone(entry.data) } : {}),
            swipes: [entry.message],
            swipe_id: 0,
          });
          nextMessageId += 1;
        }
        return undefined;
      },
    );
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
    validateOrRepairInlineWorldTimeReplyMock.mockReset().mockImplementation(async ({ rawReply }) => ({
      replyText: rawReply,
      timeRepairAttempted: false,
      blocksText: rawReply,
    }));
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

  afterEach(() => {
    vi.useRealTimers();
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

  it('真实玩家发送只把未拼接指令的原始输入写入 user 楼层元数据', async () => {
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('前往烟雨楼\n[地图指令]从牛家村移动到烟雨楼', {
        rawPlayerInput: '前往烟雨楼',
      });
    });

    expect(messages[0]).toMatchObject({
      role: 'user',
      message: '前往烟雨楼\n[地图指令]从牛家村移动到烟雨楼',
      data: {
        wuxiaInputHistoryV1: { text: '前往烟雨楼' },
      },
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

  it('发送完成后释放 lifecycle 屏障，且不会请求最新楼层同步', async () => {
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('自动化测试发送');
    });

    expect(globals.eventEmit).toHaveBeenCalledWith('wuxia:turn-lifecycle', {
      phase: 'finish',
      roundId: 'debug-round-id',
      chatId: expect.any(String),
      messageId: 2,
    });
    expect(globals.eventEmit).not.toHaveBeenCalledWith('wuxia:sync-latest-message-shell', expect.anything());
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
    expect(messages[0]?.data).toBeUndefined();
    expect(messages[1]?.message).toBe('重试后的正文');
    expect(options.showError).not.toHaveBeenCalled();
  });

  it('send 写入楼层前清洗异常换行，同时 rawReply 和调试输出保留模型原文', async () => {
    const rawReply = '\r\n<tucao>\r\n吐槽内容  \r\n</tucao>\r\n \t\r\n\r\n\r\n正文\r\n\r\n\r\n';
    const persistedReply = '<tucao>\n吐槽内容\n</tucao>\n\n正文';
    globals.generate = vi.fn(async () => rawReply);
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    let returnedReply = '';
    await act(async () => {
      returnedReply = await result.current.handleSendMessage('测试换行清洗');
    });

    expect(messages[1]?.message).toBe(persistedReply);
    expect(messages[1]?.message).not.toMatch(/\n{3,}/);
    expect(messages[1]?.message).not.toMatch(/\n$/);
    expect(options.onVariableAssistantReply).toHaveBeenNthCalledWith(1, persistedReply);
    expect(options.onVariableAssistantReply).toHaveBeenNthCalledWith(2, persistedReply, 2);
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      main: expect.objectContaining({ output: rawReply }),
    });
    expect(returnedReply).toBe(rawReply);
  });

  it('清洗后为空的回复不会创建 assistant 楼层', async () => {
    globals.generate = vi.fn(async () => '\r\n \t\r\n\r\n');
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试空回复');
    });

    expect(messages.map(message => message.role)).toEqual(['user']);
    expect(options.showError).toHaveBeenCalledWith('生成失败：AI 回复为空，请重试');
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
    expect(messages[0]?.data).toBeUndefined();
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

  it('自动推进会重试正文普通失败且不会重复创建楼层', async () => {
    vi.useFakeTimers();
    globals.generate = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue('普通失败重试后的正文');
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    let autoAdvanceResult: Awaited<ReturnType<typeof result.current.handleAutoAdvanceTurn>> | undefined;
    await act(async () => {
      const turnPromise = result.current.handleAutoAdvanceTurn('自动化测试行动');
      await vi.advanceTimersByTimeAsync(1000);
      autoAdvanceResult = await turnPromise;
    });

    expect(globals.generate).toHaveBeenCalledTimes(2);
    expect(globals.createChatMessages).toHaveBeenCalledTimes(2);
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(autoAdvanceResult?.rawReply).toBe('普通失败重试后的正文');
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      main: {
        retryFailureCount: 1,
        retryFailureLastDelayMs: 1000,
      },
    });
  });

  it('自动推进 inline 模式会在落 assistant 楼层前重试非法变量块', async () => {
    vi.useFakeTimers();
    globals.generate = vi
      .fn()
      .mockResolvedValueOnce('正文\n<VariableEdit>{invalid json}</VariableEdit>')
      .mockResolvedValue('正文\n<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>');
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      const turnPromise = result.current.handleAutoAdvanceTurn('自动化测试行动');
      await vi.advanceTimersByTimeAsync(1000);
      await turnPromise;
    });

    expect(globals.generate).toHaveBeenCalledTimes(2);
    expect(globals.createChatMessages).toHaveBeenCalledTimes(2);
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1]?.message).toContain('"修为":120');
  });

  it('inline 时间回拨会只替换时间块，不重新生成正文且只落一个 assistant', async () => {
    const badReply = '正文只生成一次\n<VariableEdit>{"世界信息":{"时间":{"分":10}}}</VariableEdit>';
    const repairedReply =
      '正文只生成一次\n<VariableThink>旧时间 + 5分钟 = 新时间</VariableThink>\n<VariableEdit>{"世界信息":{"时间":{"年":1200,"月":8,"日":15,"时":13,"分":0}}}</VariableEdit>';
    globals.generate = vi.fn(async () => badReply);
    validateOrRepairInlineWorldTimeReplyMock.mockResolvedValue({
      replyText: repairedReply,
      timeRepairAttempted: true,
      blocksText: repairedReply.slice(repairedReply.indexOf('<VariableThink>')),
    });
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试时间纠错');
    });

    expect(globals.generate).toHaveBeenCalledTimes(1);
    expect(validateOrRepairInlineWorldTimeReplyMock).toHaveBeenCalledTimes(1);
    expect(globals.createChatMessages).toHaveBeenCalledTimes(2);
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1]?.message).toBe(repairedReply);
    expect(messages[1]?.message).not.toContain('"分":10}}');
    expect(ensureTurnVariableBlocksCommittedMock).toHaveBeenCalledWith(
      expect.objectContaining({ blocksText: repairedReply }),
    );
  });

  it('inline 时间定向纠错耗尽时不创建 assistant 也不等待 ERA', async () => {
    globals.generate = vi.fn(async () => '正文\n<VariableEdit>{"世界信息":{"时间":{"分":10}}}</VariableEdit>');
    validateOrRepairInlineWorldTimeReplyMock.mockRejectedValue(
      new Error('世界时间定向纠错失败，已自动重试 2 次'),
    );
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试纠错耗尽');
    });

    expect(messages.map(message => message.role)).toEqual(['user']);
    expect(observeEraWriteDoneMock).not.toHaveBeenCalled();
    expect(ensureTurnVariableBlocksCommittedMock).not.toHaveBeenCalled();
    expect(options.showError).toHaveBeenCalledWith(expect.stringContaining('世界时间定向纠错失败'));
  });

  it('自动推进 extra 模式会启用额外变量模型失败重试', async () => {
    prepareExtraVariableUpdateTurnMock.mockResolvedValue({ release: vi.fn() });
    executeExtraVariableUpdateMock.mockResolvedValue({
      appended: false,
      actionBlockCount: 0,
      rawResponse: '<VariableThink>无需更新</VariableThink>',
    });
    const options = createHookOptions(createSummarySettings('extra'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleAutoAdvanceTurn('自动化测试行动');
    });

    expect(executeExtraVariableUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ retryAutoAdvanceFailures: true }),
    );
  });

  it('自动推进 extra 模式在额外变量重试耗尽后明确失败', async () => {
    prepareExtraVariableUpdateTurnMock.mockResolvedValue({ release: vi.fn() });
    executeExtraVariableUpdateMock.mockRejectedValue(new Error('额外变量模型失败（已自动重试 2 次）'));
    const options = createHookOptions(createSummarySettings('extra'));
    const { result } = renderHook(() => useMessageHandler(options));

    await expect(
      act(async () => {
        await result.current.handleAutoAdvanceTurn('自动化测试行动');
      }),
    ).rejects.toThrow('已自动重试 2 次');
    expect(options.showError).toHaveBeenCalledWith(expect.stringContaining('额外变量更新失败'));
    expect(globals.eventEmit).not.toHaveBeenCalledWith('wuxia:turn-completed', expect.anything());
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
    expect(globals.eventEmit).not.toHaveBeenCalledWith('wuxia:sync-latest-message-shell', expect.anything());
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
    expect(globals.eventEmit).not.toHaveBeenCalledWith('wuxia:sync-latest-message-shell', expect.anything());
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
