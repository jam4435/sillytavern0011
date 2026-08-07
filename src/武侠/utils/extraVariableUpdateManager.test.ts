import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SUMMARY_SETTINGS } from './settingsManager';

vi.mock('../../shared/directVariableWrite', () => ({
  emitSourcedEraVariableWriteAndWait: vi.fn(),
}));

vi.mock('./summaryApiClient', () => ({
  requestConfiguredText: vi.fn(),
  resolveConfiguredTextSettings: vi.fn(() => ({
    apiMode: 'preset',
    apiConfig: { source: 'openai' },
    stream: false,
  })),
  validateSummaryApiConfig: vi.fn(() => ''),
}));

vi.mock('./variableReader', () => ({
  isFrontendLoaderOnlyMessage: vi.fn(() => false),
  normalizeDisplayedMessageContent: vi.fn((text: string) => text),
}));

import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import {
  applyVariableUpdateModeWorldbookState,
  buildExtraVariableProjection,
  ensureTurnVariableBlocksCommitted,
  executeExtraVariableUpdate,
  getIsExtraVariableUpdating,
} from './extraVariableUpdateManager';
import { requestConfiguredText } from './summaryApiClient';

type AssistantMessage = {
  message_id: number;
  role: 'assistant';
  message: string;
  swipes: string[];
  swipe_id: number;
  swipes_data: Record<string, unknown>[];
  swipes_info: Record<string, unknown>[];
};

type TestChatMessage = Omit<AssistantMessage, 'role'> & { role: 'user' | 'assistant' };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emitSourcedEraVariableWriteAndWaitMock = vi.mocked(emitSourcedEraVariableWriteAndWait);
const requestConfiguredTextMock = vi.mocked(requestConfiguredText);
const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const globalScope = globalThis as typeof globalThis & {
  setChatMessages: ReturnType<typeof vi.fn>;
  getWorldbook: ReturnType<typeof vi.fn>;
  updateWorldbookWith: ReturnType<typeof vi.fn>;
  getCharWorldbookNames: ReturnType<typeof vi.fn>;
  substitudeMacros: (text: string) => string;
  formatAsTavernRegexedString: ReturnType<typeof vi.fn>;
  EjsTemplate: {
    prepareContext: ReturnType<typeof vi.fn>;
    evaltemplate: ReturnType<typeof vi.fn>;
    allVariables?: ReturnType<typeof vi.fn>;
  };
};

describe('executeExtraVariableUpdate', () => {
  let assistantMessage: AssistantMessage;
  let worldbookEntries: Array<{
    uid: number;
    name: string;
    enabled: boolean;
    content: string;
  }>;
  let setChatMessagesMock: ReturnType<typeof vi.fn>;
  let chatMessages: TestChatMessage[];
  let variableSnapshot: Record<string, unknown>;

  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    assistantMessage = {
      message_id: 28,
      role: 'assistant',
      message: '正文内容',
      swipes: ['正文内容'],
      swipe_id: 0,
      swipes_data: [{}],
      swipes_info: [{}],
    };
    worldbookEntries = [
      {
        uid: 1,
        name: '变量指导',
        enabled: true,
        content: '仅输出合法变量块',
      },
      {
        uid: 2,
        name: '世界背景',
        enabled: true,
        content: '<世界信息>宏观背景\n<叙事表现标尺>传说：基本失传，不得操纵时间空间。</叙事表现标尺>\n</世界信息>',
      },
    ];
    chatMessages = [
      {
        message_id: 18,
        role: 'user',
        message: '更早用户正文',
        swipes: ['更早用户正文'],
        swipe_id: 0,
        swipes_data: [{}],
        swipes_info: [{}],
      },
      {
        message_id: 19,
        role: 'assistant',
        message: '更早助手正文',
        swipes: ['更早助手正文'],
        swipe_id: 0,
        swipes_data: [{}],
        swipes_info: [{}],
      },
      {
        message_id: 20,
        role: 'user',
        message: '上一轮用户正文',
        swipes: ['上一轮用户正文'],
        swipe_id: 0,
        swipes_data: [{}],
        swipes_info: [{}],
      },
      {
        message_id: 21,
        role: 'assistant',
        message: '上一轮助手正文',
        swipes: ['上一轮助手正文'],
        swipe_id: 0,
        swipes_data: [{}],
        swipes_info: [{}],
      },
      {
        message_id: 27,
        role: 'user',
        message: '触发本轮的用户输入',
        swipes: ['触发本轮的用户输入'],
        swipe_id: 0,
        swipes_data: [{}],
        swipes_info: [{}],
      },
      assistantMessage,
    ];
    variableSnapshot = {
      stat_data: {
        世界信息: { 时间: { 年: 1219, 月: 10, 日: 20, 时: 13, 分: 15 }, 天气: '晴' },
        user数据: {
          所在位置: '大宋/临安府/城门',
          头像: 'preset:legacy-player-avatar',
          出生年份: 1201,
          年龄: 18,
          初始属性: { 根骨: 10 },
          天赋: { 过目不忘: '只读' },
          属性: { 根骨: 60, $缓存: '隐藏' },
          $meta: { 不应发送: true },
        },
        角色数据: {
          郭靖: {
            所在位置: '大宋/临安府/城门',
            头像: 'preset:legacy-npc-avatar',
            初始属性: { 根骨: 18 },
            天赋: { 坚毅: '只读' },
            身份: { 侠士: '初入江湖' },
            $template: {},
          },
          黄蓉: { 所在位置: '大宋/临安府/客栈', 身份: { 少女: '聪慧' } },
          洪七公: { 所在位置: '大宋/嘉兴府/烟雨楼', 身份: { 丐帮帮主: '北丐' } },
          欧阳锋: { 所在位置: '西域/白驼山/山庄', 身份: { 西毒: '宗师' } },
          $template: { 所在位置: '' },
        },
        参与事件: {
          射雕第7回02: {
            描述: '黄蓉正在事件中',
            update: { 黄蓉: { 好感: 1 } },
            分支标记: { 黄蓉对郭靖变心: 0 },
            $meta: '隐藏',
          },
        },
        世界事件: { 旧闻: '不应发送' },
        附近传闻: { 传闻: '不应发送' },
        后续事件线索: { 线索: '不应发送' },
        前端变量: {
          周围地点: {
            普通移动: ['大宋/临安府/城门', '大宋/临安府/客栈'],
            $内部: ['不应发送'],
          },
          随机数: '不应发送',
        },
      },
    };

    setChatMessagesMock = vi.fn(async (messages: Array<Record<string, unknown>>) => {
      const nextMessage = messages[0];
      assistantMessage = {
        ...assistantMessage,
        message: String(nextMessage.message ?? assistantMessage.message),
        swipe_id: Number.isInteger(nextMessage.swipe_id) ? Number(nextMessage.swipe_id) : assistantMessage.swipe_id,
        swipes: Array.isArray(nextMessage.swipes) ? clone(nextMessage.swipes as string[]) : assistantMessage.swipes,
        swipes_data: Array.isArray(nextMessage.swipes_data)
          ? clone(nextMessage.swipes_data as Record<string, unknown>[])
          : assistantMessage.swipes_data,
        swipes_info: Array.isArray(nextMessage.swipes_info)
          ? clone(nextMessage.swipes_info as Record<string, unknown>[])
          : assistantMessage.swipes_info,
      };
    });

    Object.assign(globalScope, {
      setChatMessages: setChatMessagesMock,
      getCharWorldbookNames: vi.fn(() => ({ primary: 'wuxia', additional: [] })),
      getWorldbook: vi.fn(async () => clone(worldbookEntries)),
      updateWorldbookWith: vi.fn(
        async (_worldbookName: string, updater: (entries: typeof worldbookEntries) => typeof worldbookEntries) => {
          worldbookEntries = updater(clone(worldbookEntries));
          return clone(worldbookEntries);
        },
      ),
      substitudeMacros: (text: string) => text,
      formatAsTavernRegexedString: vi.fn((text: string) => text),
      EjsTemplate: {
        prepareContext: vi.fn(async () => ({})),
        evaltemplate: vi.fn(async (template: string) => template),
        allVariables: vi.fn(() => clone(variableSnapshot)),
      },
    });
    getVariablesMock.mockImplementation(() => clone(variableSnapshot));

    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === assistantMessage.message_id) {
        return [clone(assistantMessage)];
      }
      if (messageId === '0-{{lastMessageId}}') {
        return clone(
          chatMessages.map(message =>
            message.message_id === assistantMessage.message_id ? assistantMessage : message,
          ),
        );
      }
      return [];
    });

    requestConfiguredTextMock.mockResolvedValue('<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>');
    // 模拟 ERA 在 writeDone 前已把变量写入聊天级 stat_data；否则这里会
    // 故意停留在“等待变量快照刷新”，与真实成功写入的场景不符。
    emitSourcedEraVariableWriteAndWaitMock.mockImplementation(async () => {
      const statData = variableSnapshot.stat_data as Record<string, unknown>;
      const userData = statData.user数据 as Record<string, unknown>;
      userData.修为 = 120;
      return {
        version: 1,
        writeId: 'extra-sync-1',
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        message_id: 28,
        actions: { apiWrite: true },
      };
    });
  });

  it('inline 模式强制启用变量指导，即使它原本处于禁用状态', async () => {
    worldbookEntries[0].enabled = false;

    const status = await applyVariableUpdateModeWorldbookState('inline');

    expect(worldbookEntries[0].enabled).toBe(true);
    expect(status).toContain('已启用');
    expect(globalScope.updateWorldbookWith).toHaveBeenCalledTimes(1);
  });

  it('extra 模式强制禁用变量指导，即使它原本处于启用状态', async () => {
    const status = await applyVariableUpdateModeWorldbookState('extra');

    expect(worldbookEntries[0].enabled).toBe(false);
    expect(status).toContain('已禁用');
    expect(globalScope.updateWorldbookWith).toHaveBeenCalledTimes(1);
  });

  it('模式与变量指导状态已经一致时不重复写世界书', async () => {
    const status = await applyVariableUpdateModeWorldbookState('inline');

    expect(worldbookEntries[0].enabled).toBe(true);
    expect(status).toContain('已经是启用状态');
    expect(globalScope.updateWorldbookWith).not.toHaveBeenCalled();
  });

  it('追加变量块时使用 refresh:none，并以严格目标参数等待 ERA 完成', async () => {
    const onProgress = vi.fn();
    const settings = {
      ...DEFAULT_SUMMARY_SETTINGS,
      variableUpdateMode: 'extra' as const,
    };

    const result = await executeExtraVariableUpdate({
      settings,
      assistantMessageId: 28,
      latestRawReply: '正文内容',
      onProgress,
    });

    expect(setChatMessagesMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          message_id: 28,
          message: expect.stringContaining('<VariableEdit>'),
        }),
      ],
      { refresh: 'none' },
    );
    expect(result.appended).toBe(true);
    expect(result.actionBlockCount).toBe(1);
    expect(result.finalMessageText).toContain('<VariableEdit>');
    expect(result.finalMessageText).toMatch(/^正文内容\n\n<VariableEdit>/);
    expect(requestConfiguredTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('合法地点完整路径'),
      }),
    );
    const prompt = requestConfiguredTextMock.mock.calls.at(-1)?.[0].prompt as string;
    expect(prompt).toContain('传说：基本失传，不得操纵时间空间。');
    expect(prompt).not.toContain('宏观背景');
    expect(prompt.indexOf('传说：基本失传')).toBeLessThan(prompt.indexOf('仅输出合法变量块'));
    expect(prompt.indexOf('仅输出合法变量块')).toBeLessThan(prompt.indexOf('"content":"正文内容"'));
    expect(prompt.indexOf('"content":"正文内容"')).toBeLessThan(prompt.indexOf('【最终执行要求】'));
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        expectedMessageId: 28,
        expectedAction: 'apiWrite',
      }),
    );
    const latestPhaseProgress = onProgress.mock.calls
      .map(([progress]) => progress)
      .filter(progress => Array.isArray(progress.phaseTimeline))
      .at(-1);
    expect(latestPhaseProgress).toEqual(
      expect.objectContaining({
        currentPhase: '',
        phaseTimeline: expect.arrayContaining([
          expect.objectContaining({ name: 'request-variable-model', status: 'success' }),
          expect.objectContaining({ name: 'append-variable-blocks', status: 'success' }),
          expect.objectContaining({ name: 'wait-era-write-done', status: 'success' }),
          expect.objectContaining({ name: 'verify-variable-persistence', status: 'success' }),
        ]),
      }),
    );
  });

  it('ERA 同步后仅重排变量块格式时，按等价变量操作通过回读验证', async () => {
    emitSourcedEraVariableWriteAndWaitMock.mockImplementation(async () => {
      const compactBlocks = '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>';
      assistantMessage = {
        ...assistantMessage,
        message: assistantMessage.message.replace(/<VariableEdit>[\s\S]*?<\/VariableEdit>/, compactBlocks),
        swipes: assistantMessage.swipes.map(swipe =>
          swipe.replace(/<VariableEdit>[\s\S]*?<\/VariableEdit>/, compactBlocks),
        ),
      };
      const statData = variableSnapshot.stat_data as Record<string, unknown>;
      (statData.user数据 as Record<string, unknown>).修为 = 120;
      return {
        version: 1,
        writeId: 'extra-sync-reformatted',
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        message_id: 28,
        actions: { apiWrite: true },
      };
    });

    const result = await executeExtraVariableUpdate({
      settings: { ...DEFAULT_SUMMARY_SETTINGS, variableUpdateMode: 'extra' },
      assistantMessageId: 28,
      latestRawReply: '正文内容',
    });

    expect(result.syncVerification).toContain('通过');
    expect(result.applyStatus).toBe('success');
  });

  it('页面隐藏时不让前台持久化轮询被节流成数分钟，并在 busy 回读时释放锁', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    emitSourcedEraVariableWriteAndWaitMock.mockResolvedValue({
      version: 1,
      writeId: 'extra-sync-hidden',
      source: 'frontend',
      operation: 'update',
      reason: 'extra-variable-api-write',
      eventName: 'era:apiWrite',
      attribution: 'ai',
      message_id: 28,
      actions: { apiWrite: true },
    });

    const startedAt = Date.now();
    const result = await executeExtraVariableUpdate({
      settings: { ...DEFAULT_SUMMARY_SETTINGS, variableUpdateMode: 'extra' },
      assistantMessageId: 28,
      latestRawReply: '正文内容',
    });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result.applyStatus).toBe('pending');
    expect(getIsExtraVariableUpdating()).toBe(true);

    const statData = variableSnapshot.stat_data as Record<string, unknown>;
    (statData.user数据 as Record<string, unknown>).修为 = 120;
    expect(getIsExtraVariableUpdating()).toBe(false);
  });

  it('持久化轮询期间转入后台时立即退出前台等待', async () => {
    emitSourcedEraVariableWriteAndWaitMock.mockResolvedValue({
      version: 1,
      writeId: 'extra-sync-became-hidden',
      source: 'frontend',
      operation: 'update',
      reason: 'extra-variable-api-write',
      eventName: 'era:apiWrite',
      attribution: 'ai',
      message_id: 28,
      actions: { apiWrite: true },
    });
    const onProgress = vi.fn((progress: { currentPhase?: string }) => {
      if (progress.currentPhase !== 'verify-variable-persistence') return;
      queueMicrotask(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    });

    const startedAt = Date.now();
    const result = await executeExtraVariableUpdate({
      settings: { ...DEFAULT_SUMMARY_SETTINGS, variableUpdateMode: 'extra' },
      assistantMessageId: 28,
      latestRawReply: '正文内容',
      onProgress,
    });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result.applyStatus).toBe('pending');

    const statData = variableSnapshot.stat_data as Record<string, unknown>;
    (statData.user数据 as Record<string, unknown>).修为 = 120;
    expect(getIsExtraVariableUpdating()).toBe(false);
  });

  it('额外变量模型遇到两次 429 后只追加和应用一次变量块', async () => {
    const onProgress = vi.fn();
    requestConfiguredTextMock
      .mockRejectedValueOnce({ status: 429, retryAfterMs: 0 })
      .mockRejectedValueOnce({ response: { statusCode: 429 }, retryAfterMs: 0 })
      .mockResolvedValue('<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>');

    const result = await executeExtraVariableUpdate({
      settings: {
        ...DEFAULT_SUMMARY_SETTINGS,
        variableUpdateMode: 'extra',
      },
      assistantMessageId: 28,
      latestRawReply: '正文内容',
      onProgress,
    });

    expect(requestConfiguredTextMock).toHaveBeenCalledTimes(3);
    expect(setChatMessagesMock).toHaveBeenCalledTimes(1);
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledTimes(1);
    expect(result.appended).toBe(true);
    expect(result).toMatchObject({ retry429Count: 2, retry429LastDelayMs: 0 });
    expect(onProgress).toHaveBeenCalledWith({ retry429Count: 1, retry429LastDelayMs: 0 });
    expect(onProgress).toHaveBeenCalledWith({ retry429Count: 2, retry429LastDelayMs: 0 });
  });

  it('额外变量模型 429 耗尽时不写入，并释放执行锁供下一次调用', async () => {
    requestConfiguredTextMock.mockRejectedValue({ status: 429, retryAfterMs: 0, message: 'HTTP 429' });

    await expect(
      executeExtraVariableUpdate({
        settings: {
          ...DEFAULT_SUMMARY_SETTINGS,
          variableUpdateMode: 'extra',
        },
        assistantMessageId: 28,
        latestRawReply: '正文内容',
      }),
    ).rejects.toThrow('已自动重试 2 次');

    expect(requestConfiguredTextMock).toHaveBeenCalledTimes(3);
    expect(setChatMessagesMock).not.toHaveBeenCalled();
    expect(emitSourcedEraVariableWriteAndWaitMock).not.toHaveBeenCalled();

    requestConfiguredTextMock.mockResolvedValue('<VariableThink>无变化</VariableThink>');
    await expect(
      executeExtraVariableUpdate({
        settings: {
          ...DEFAULT_SUMMARY_SETTINGS,
          variableUpdateMode: 'extra',
        },
        assistantMessageId: 28,
        latestRawReply: '正文内容',
      }),
    ).resolves.toEqual(expect.objectContaining({ appended: false }));
  });

  it('自动推进会在落变量块前重试额外模型普通失败和空回复', async () => {
    vi.useFakeTimers();
    requestConfiguredTextMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('')
      .mockResolvedValue('<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>');
    const onProgress = vi.fn();

    try {
      const updatePromise = executeExtraVariableUpdate({
        settings: {
          ...DEFAULT_SUMMARY_SETTINGS,
          variableUpdateMode: 'extra',
        },
        assistantMessageId: 28,
        latestRawReply: '正文内容',
        retryAutoAdvanceFailures: true,
        onProgress,
      });
      await vi.advanceTimersByTimeAsync(3000);
      const result = await updatePromise;

      expect(requestConfiguredTextMock).toHaveBeenCalledTimes(3);
      expect(setChatMessagesMock).toHaveBeenCalledTimes(1);
      expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        appended: true,
        retryFailureCount: 2,
        retryFailureLastDelayMs: 2000,
      });
      expect(onProgress).toHaveBeenCalledWith({ retryFailureCount: 1, retryFailureLastDelayMs: 1000 });
      expect(onProgress).toHaveBeenCalledWith({ retryFailureCount: 2, retryFailureLastDelayMs: 2000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('自动推进会在落变量块前重试额外模型非法变量块', async () => {
    vi.useFakeTimers();
    requestConfiguredTextMock
      .mockResolvedValueOnce('<VariableEdit>{invalid json}</VariableEdit>')
      .mockResolvedValue('<VariableThink>无变化</VariableThink>');

    try {
      const updatePromise = executeExtraVariableUpdate({
        settings: {
          ...DEFAULT_SUMMARY_SETTINGS,
          variableUpdateMode: 'extra',
        },
        assistantMessageId: 28,
        latestRawReply: '正文内容',
        retryAutoAdvanceFailures: true,
      });
      await vi.advanceTimersByTimeAsync(1000);
      const result = await updatePromise;

      expect(requestConfiguredTextMock).toHaveBeenCalledTimes(2);
      expect(setChatMessagesMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        appended: false,
        retryFailureCount: 1,
        retryFailureLastDelayMs: 1000,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('自定义模板未放置 locationContext 时不会强行追加地点约束', async () => {
    await executeExtraVariableUpdate({
      settings: {
        ...DEFAULT_SUMMARY_SETTINGS,
        variableUpdateMode: 'extra',
        variablePromptTemplate: '正文：{{recentBodies}}\n变量：{{variableContext}}',
      },
      assistantMessageId: 28,
      latestRawReply: '正文内容',
    });

    expect(requestConfiguredTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('合法地点完整路径'),
      }),
    );
  });

  it('旧自定义模板只使用 variableGuidance 时仍复用世界背景中的表现标尺', async () => {
    await executeExtraVariableUpdate({
      settings: {
        ...DEFAULT_SUMMARY_SETTINGS,
        variableUpdateMode: 'extra',
        variablePromptTemplate: '{{variableGuidance}}',
      },
      assistantMessageId: 28,
      latestRawReply: '正文内容',
    });

    const prompt = requestConfiguredTextMock.mock.calls.at(-1)?.[0].prompt as string;
    expect(prompt).toContain('传说：基本失传，不得操纵时间空间。');
    expect(prompt).toContain('仅输出合法变量块');
    expect(prompt).not.toContain('宏观背景');
  });

  it('构造严格范围投影，递归清理所有 $ 字段并只选择相关 NPC', () => {
    const projection = buildExtraVariableProjection(variableSnapshot, '洪七公忽然现身。');
    const serialized = JSON.stringify(projection);

    expect(Object.keys(projection)).toEqual(['世界信息', 'user数据', '角色数据', '参与事件']);
    expect(projection.世界信息).toEqual({ 时间: { 年: 1219, 月: 10, 日: 20, 时: 13, 分: 15 } });
    expect(Object.keys(projection.角色数据 as Record<string, unknown>)).toEqual(['郭靖', '黄蓉', '洪七公']);
    expect(serialized).not.toContain('欧阳锋');
    expect(serialized).not.toContain('世界事件');
    expect(serialized).not.toContain('附近传闻');
    expect(serialized).not.toContain('后续事件线索');
    expect(serialized).not.toContain('随机数');
    expect(serialized).not.toContain('legacy-player-avatar');
    expect(serialized).not.toContain('legacy-npc-avatar');
    expect(serialized).not.toContain('出生年份');
    expect(serialized).not.toContain('年龄');
    expect(serialized).not.toContain('初始属性');
    expect(serialized).not.toContain('天赋');
    expect(serialized).not.toContain('$');
    expect(projection.参与事件).toEqual({
      射雕第7回02: { update: { 黄蓉: { 好感: 1 } }, 分支标记: { 黄蓉对郭靖变心: 0 } },
    });
    expect(serialized).not.toContain('黄蓉正在事件中');
  });

  it('默认只发送一轮完整只读上下文，并把最新 assistant 正文标记为唯一变化来源', async () => {
    requestConfiguredTextMock.mockResolvedValue('<VariableThink>无变化</VariableThink>');

    await executeExtraVariableUpdate({
      settings: {
        ...DEFAULT_SUMMARY_SETTINGS,
        variableUpdateMode: 'extra',
        variablePromptTemplate: '{{recentBodies}}',
      },
      assistantMessageId: 28,
      latestRawReply: '洪七公忽然现身。',
    });

    const prompt = requestConfiguredTextMock.mock.calls.at(-1)?.[0].prompt as string;
    const context = JSON.parse(prompt) as {
      readonlyContextRounds: Array<{ user: { messageId: number }; assistant: { messageId: number } }>;
      latestAssistantBody: { messageId: number; content: string; isOnlyChangeSource: boolean };
    };
    expect(context.readonlyContextRounds).toEqual([
      { user: { messageId: 20, content: '上一轮用户正文' }, assistant: { messageId: 21, content: '上一轮助手正文' } },
    ]);
    expect(context.latestAssistantBody).toEqual({
      messageId: 28,
      content: '洪七公忽然现身。',
      isOnlyChangeSource: true,
    });
    expect(prompt).not.toContain('触发本轮的用户输入');
    expect(prompt).not.toContain('更早用户正文');
  });

  it('先应用当前酒馆提示词正则，再按额外变量设置精确剥离规划前缀和附属标签', async () => {
    requestConfiguredTextMock.mockResolvedValue('<VariableThink>无变化</VariableThink>');
    globalScope.formatAsTavernRegexedString.mockImplementation((text: string) =>
      text.replace(/<preset_hidden>[\s\S]*?<\/preset_hidden>/g, ''),
    );

    await executeExtraVariableUpdate({
      settings: {
        ...DEFAULT_SUMMARY_SETTINGS,
        variableUpdateMode: 'extra',
        variablePromptTemplate: '{{recentBodies}}',
        variablePromptExcludedTags: 'tucao\ncurrent_event, progress',
        variablePromptBodyStartMarkers: '</konatan_planning~>',
      },
      assistantMessageId: 28,
      latestRawReply: [
        '主模型规划内容',
        '</konatan_planning~>',
        '真正正文。',
        '<tucao>吐槽</tucao>',
        '<current_event>事件摘要</current_event>',
        '<progress>进度</progress>',
        '<preset_hidden>由当前预设正则处理</preset_hidden>',
        '<unknown>未配置标签需要保留</unknown>',
      ].join('\n'),
    });

    const prompt = requestConfiguredTextMock.mock.calls.at(-1)?.[0].prompt as string;
    const context = JSON.parse(prompt) as { latestAssistantBody: { content: string } };
    expect(context.latestAssistantBody.content).toContain('真正正文。');
    expect(context.latestAssistantBody.content).toContain('<unknown>未配置标签需要保留</unknown>');
    expect(context.latestAssistantBody.content).not.toContain('主模型规划内容');
    expect(context.latestAssistantBody.content).not.toContain('吐槽');
    expect(context.latestAssistantBody.content).not.toContain('事件摘要');
    expect(context.latestAssistantBody.content).not.toContain('进度');
    expect(context.latestAssistantBody.content).not.toContain('由当前预设正则处理');
    expect(globalScope.formatAsTavernRegexedString).toHaveBeenCalledWith(expect.any(String), 'ai_output', 'prompt', {
      depth: 0,
    });
  });

  it('可配置发送两轮完整只读上下文', async () => {
    requestConfiguredTextMock.mockResolvedValue('<VariableThink>无变化</VariableThink>');

    await executeExtraVariableUpdate({
      settings: {
        ...DEFAULT_SUMMARY_SETTINGS,
        variableUpdateMode: 'extra',
        variableContextRounds: 2,
        variablePromptTemplate: '{{recentBodies}}',
      },
      assistantMessageId: 28,
      latestRawReply: '正文内容',
    });

    const prompt = requestConfiguredTextMock.mock.calls.at(-1)?.[0].prompt as string;
    const context = JSON.parse(prompt) as { readonlyContextRounds: unknown[] };
    expect(context.readonlyContextRounds).toHaveLength(2);
    expect(prompt).toContain('更早用户正文');
    expect(prompt).toContain('上一轮助手正文');
  });

  it('EjsTemplate 正常读取与聊天变量 fallback 共享同一专用投影构建器', async () => {
    requestConfiguredTextMock.mockResolvedValue('<VariableThink>无变化</VariableThink>');
    const settings = {
      ...DEFAULT_SUMMARY_SETTINGS,
      variableUpdateMode: 'extra' as const,
      variablePromptTemplate: '{{variableContext}}',
    };

    await executeExtraVariableUpdate({
      settings,
      assistantMessageId: 28,
      latestRawReply: '洪七公忽然现身。',
    });
    const normalProjection = requestConfiguredTextMock.mock.calls.at(-1)?.[0].prompt;

    globalScope.EjsTemplate.allVariables = vi.fn(() => {
      throw new Error('allVariables unavailable');
    });
    await executeExtraVariableUpdate({
      settings,
      assistantMessageId: 28,
      latestRawReply: '洪七公忽然现身。',
    });
    const fallbackProjection = requestConfiguredTextMock.mock.calls.at(-1)?.[0].prompt;

    expect(fallbackProjection).toBe(normalProjection);
    expect(fallbackProjection).toContain('<status_current_variables>');
    expect(fallbackProjection).toContain('[只读时间、地点与事件背景：黄蓉正在事件中]');
    expect(fallbackProjection).toContain('{"update":{"黄蓉":{"好感":1}},"分支标记":{"黄蓉对郭靖变心":0}}');
    expect(fallbackProjection).not.toContain('前端变量');
  });
});

describe('ensureTurnVariableBlocksCommitted', () => {
  it('按 ERA 的最终相序折叠同一路径的多次编辑', async () => {
    getVariablesMock.mockReturnValue({
      stat_data: {
        user数据: { 修为: 120 },
      },
    });

    await expect(
      ensureTurnVariableBlocksCommitted({
        assistantMessageId: 28,
        blocksText: [
          '<VariableEdit>{"user数据":{"修为":110}}</VariableEdit>',
          '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>',
        ].join('\n'),
      }),
    ).resolves.toMatchObject({ verified: true });
  });

  it('Edit 后 Delete 时只验证最终删除状态', async () => {
    getVariablesMock.mockReturnValue({
      stat_data: {
        user数据: {},
      },
    });

    await expect(
      ensureTurnVariableBlocksCommitted({
        assistantMessageId: 28,
        blocksText: [
          '<VariableEdit>{"user数据":{"临时状态":"受伤"}}</VariableEdit>',
          '<VariableDelete>{"user数据":{"临时状态":{}}}</VariableDelete>',
        ].join('\n'),
      }),
    ).resolves.toMatchObject({ verified: true });
  });

  it('动作标签残缺时拒绝把回合视为已提交', async () => {
    getVariablesMock.mockReturnValue({ stat_data: {} });

    await expect(
      ensureTurnVariableBlocksCommitted({
        assistantMessageId: 28,
        blocksText: '<VariableEdit>{"世界信息":{"时间":{"年":1200}}}',
      }),
    ).rejects.toThrow('未闭合');
  });
});
