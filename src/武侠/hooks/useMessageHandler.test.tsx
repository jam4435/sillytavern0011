import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/variableReader', () => ({
  flushPendingGameDataCompletion: vi.fn(async () => {}),
  getLastMessageContent: vi.fn(() => '最新正文'),
  normalizeDisplayedMessageContent: vi.fn((text: string) => text),
  parseAIResponse: vi.fn((text: string) => ({ content: text })),
  parseOptions: vi.fn((text: string) => text.includes('<option>') ? ['选项'] : []),
}));

vi.mock('../utils/messageActions', () => ({
  regenerateLastAssistantSwipe: vi.fn(),
}));

vi.mock('../utils/promptDebug', () => ({
  captureNextCombinedPromptForDebug: vi.fn(() => ({ stop: vi.fn() })),
}));

vi.mock('../utils/locationContext', () => ({
  buildDynamicLocationConstraintPrompt: vi.fn(async () => '动态地点约束'),
  createDynamicLocationInjection: vi.fn((prompt: string) => [
    { position: 'in_chat', depth: 0, role: 'system', content: prompt, should_scan: false },
  ]),
}));

vi.mock('../utils/extraVariableUpdateManager', () => ({
  executeExtraVariableUpdate: vi.fn(),
  prepareExtraVariableUpdateTurn: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
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
  executeExtraVariableUpdate,
  prepareExtraVariableUpdateTurn,
} from '../utils/extraVariableUpdateManager';
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
const regenerateLastAssistantSwipeMock = vi.mocked(regenerateLastAssistantSwipe);

const createSummarySettings = (
  variableUpdateMode: 'inline' | 'extra',
) => ({
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
  onVariableAiWriteTarget: vi.fn(),
});

describe('useMessageHandler extra-variable decision', () => {
  let messages: MockChatMessage[];
  let nextMessageId: number;

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
    regenerateLastAssistantSwipeMock.mockReset();
    globals.eventEmit.mockClear();
  });

  it('send + inline 会显式标记 skipped，且不会触发额外变量链路', async () => {
    const options = createHookOptions(createSummarySettings('inline'));
    const { result } = renderHook(() => useMessageHandler(options));

    await act(async () => {
      await result.current.handleSendMessage('测试发送');
    });

    expect(prepareExtraVariableUpdateTurnMock).not.toHaveBeenCalled();
    expect(executeExtraVariableUpdateMock).not.toHaveBeenCalled();
    expect(globals.generate).toHaveBeenCalledWith(expect.objectContaining({
      injects: [expect.objectContaining({ content: '动态地点约束' })],
    }));
    expect(options.patchLatestDebugRound).toHaveBeenCalledWith({
      variable: expect.objectContaining({
        trigger: 'send',
        modeSnapshot: 'inline',
        status: 'skipped',
        skipReason: expect.stringContaining('inline'),
      }),
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
