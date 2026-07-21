import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatestDebugRound } from '../hooks/useDebugLogs';
import type { VariableChangeSummary } from './variableChanges';
import { createWuxiaAutomation, type WuxiaAutomationRuntimeState } from './wuxiaAutomation';

const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;

function createDebugRound(
  output: string,
  variableStatus: LatestDebugRound['variable']['status'] = 'skipped',
): LatestDebugRound {
  const now = Date.now();
  return {
    id: `round-${now}`,
    startedAt: now,
    updatedAt: now,
    main: {
      status: 'success',
      startedAt: now,
      finishedAt: now,
      userInput: '向前走',
      combinedPrompt: '组合提示词',
      output,
    },
    variable: {
      status: variableStatus,
      trigger: 'send',
      modeSnapshot: 'inline',
      skipReason: variableStatus === 'skipped' ? 'inline 模式' : '',
      input: '',
      output: '',
      appendedBlocks: '',
      finalMessageText: '',
      appendReadbackText: '',
      appendVerification: '',
      syncReadbackText: '',
      syncVerification: '',
    },
  };
}

function createVariableSummary(status: 'applied' | 'not-applied' | 'diverged'): VariableChangeSummary {
  const declaredChange = {
    id: 'declared-1',
    source: 'ai-declared' as const,
    action: 'edit' as const,
    path: ['user数据', '气血'],
    displayPath: 'user数据 › 气血',
    copyPath: 'user数据.气血',
    value: 2,
    valuePreview: '2',
    blockTag: 'VariableEdit' as const,
  };
  const comparison = {
    id: 'comparison-1',
    status,
    action: 'edit' as const,
    path: ['user数据', '气血'],
    displayPath: 'user数据 › 气血',
    copyPath: 'user数据.气血',
    declaredChange,
    baselineValue: 1,
    expectedValue: 2,
    finalValue: status === 'applied' ? 2 : 1,
    baselinePreview: '1',
    expectedPreview: '2',
    finalPreview: status === 'applied' ? '2' : '1',
  };
  return {
    turnId: 1,
    status: 'settled',
    userMessageId: 1,
    assistantMessageId: 2,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    thoughts: [],
    parseErrors: [],
    topLevelGroups: ['user数据'],
    aiReply: {
      declaredChanges: [declaredChange],
      observedChanges: [],
      comparisons: [comparison],
      omittedDeclaredCount: 0,
      omittedObservedCount: 0,
      omittedComparisonCount: 0,
    },
    background: {
      observedChanges: [],
      omittedObservedCount: 0,
    },
    batches: [],
    declaredChanges: [declaredChange],
    actualChanges: [],
    omittedDeclaredCount: 0,
    omittedActualCount: 0,
  };
}

function createRuntime(): WuxiaAutomationRuntimeState {
  return {
    page: 'game',
    busy: false,
    maintext: '旧正文',
    options: ['A. 前进'],
    latestDebugRound: null,
    variableChanges: null,
    turnTimeoutMs: 180_000,
  };
}

afterEach(() => {
  getVariablesMock.mockReset();
  getVariablesMock.mockReturnValue({ stat_data: {} });
  getChatMessagesMock.mockReset();
  getChatMessagesMock.mockReturnValue([]);
});

describe('WuxiaAutomation', () => {
  it('返回隔离的结构化快照', () => {
    const runtime = createRuntime();
    const statData = { user数据: { 气血: 10 } };
    getVariablesMock.mockReturnValue({ stat_data: statData });
    getChatMessagesMock.mockReturnValue([{ message_id: 3, role: 'assistant', message: '楼层正文', swipe_id: 0 }]);
    const { api } = createWuxiaAutomation({
      getRuntimeState: () => runtime,
      runPlayerTurn: vi.fn(),
    });

    const snapshot = api.getSnapshot();

    expect(snapshot).toMatchObject({
      version: 1,
      ready: true,
      page: 'game',
      busy: false,
      turnTimeoutMs: 180_000,
      chatId: 'test-chat',
      maintext: '旧正文',
    });
    expect(snapshot.recentMessages).toEqual([{ messageId: 3, role: 'assistant', text: '楼层正文', swipeId: 0 }]);
    (snapshot.statData as { user数据: { 气血: number } }).user数据.气血 = 0;
    expect(statData.user数据.气血).toBe(10);
  });

  it('通过真实玩家回合入口返回新楼层、调试和变量验证', async () => {
    const runtime = createRuntime();
    const messages: Array<Record<string, unknown>> = [{ message_id: 0, role: 'assistant', message: '旧回复' }];
    let statData = { user数据: { 气血: 1 } };
    getVariablesMock.mockImplementation(() => ({ stat_data: statData }));
    getChatMessagesMock.mockImplementation(() => messages);
    const rawReply = '<VariableEdit>user数据.气血=2</VariableEdit>\n新的剧情';
    const runPlayerTurn = vi.fn(async () => {
      messages.push(
        { message_id: 1, role: 'user', message: '向前走' },
        { message_id: 2, role: 'assistant', message: rawReply },
      );
      statData = { user数据: { 气血: 2 } };
      runtime.latestDebugRound = createDebugRound(rawReply);
      runtime.variableChanges = createVariableSummary('applied');
      await eventEmit('era:writeDone', { message_id: 2, actions: { apply: true } });
      return rawReply;
    });
    const { api } = createWuxiaAutomation({
      getRuntimeState: () => runtime,
      runPlayerTurn,
    });

    const report = await api.runTurn('  向前走  ', { settleDelayMs: 0, settleTimeoutMs: 10 });

    expect(runPlayerTurn).toHaveBeenCalledWith('向前走');
    expect(report).toMatchObject({
      ok: true,
      input: '向前走',
      userMessageId: 1,
      assistantMessageId: 2,
      rawReply,
      statDataBefore: { user数据: { 气血: 1 } },
      statDataAfter: { user数据: { 气血: 2 } },
      variableVerification: {
        expected: true,
        signalObserved: true,
        timedOut: false,
        verdict: 'applied',
        declaredCount: 1,
        comparisonStatusCounts: { applied: 1 },
      },
    });
    expect(report.debug?.main.combinedPrompt).toBe('组合提示词');
  });

  it('拒绝并发回合，避免覆盖调试轮次', async () => {
    const runtime = createRuntime();
    let resolveTurn: ((reply: string) => void) | undefined;
    const runPlayerTurn = vi.fn(
      () =>
        new Promise<string>(resolve => {
          resolveTurn = resolve;
        }),
    );
    const { api } = createWuxiaAutomation({
      getRuntimeState: () => runtime,
      runPlayerTurn,
    });

    const firstTurn = api.runTurn('第一轮', { settleDelayMs: 0 });
    const secondTurn = await api.runTurn('第二轮', { settleDelayMs: 0 });

    expect(secondTurn.ok).toBe(false);
    expect(secondTurn.error).toContain('已有生成或自动化回合');
    resolveTurn?.('第一轮回复');
    await firstTurn;
    expect(runPlayerTurn).toHaveBeenCalledTimes(1);
  });

  it('把调试中的变量错误作为结构化失败返回', async () => {
    const runtime = createRuntime();
    const messages: Array<Record<string, unknown>> = [];
    getChatMessagesMock.mockImplementation(() => messages);
    const runPlayerTurn = vi.fn(async () => {
      messages.push(
        { message_id: 1, role: 'user', message: '推进' },
        { message_id: 2, role: 'assistant', message: '正文成功' },
      );
      runtime.latestDebugRound = createDebugRound('正文成功', 'error');
      runtime.latestDebugRound.variable.error = 'ERA 同步失败';
      return '正文成功';
    });
    const { api } = createWuxiaAutomation({
      getRuntimeState: () => runtime,
      runPlayerTurn,
    });

    const report = await api.runTurn('推进', { settleDelayMs: 0 });

    expect(report.ok).toBe(false);
    expect(report.error).toBe('ERA 同步失败');
    expect(report.rawReply).toBe('正文成功');
  });
});
