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
import { buildExtraVariableProjection, executeExtraVariableUpdate } from './extraVariableUpdateManager';
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

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
  formatAsTavernRegexedString: (text: string) => string;
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
        世界信息: { 时间: '1219年10月20日13时', 天气: '晴' },
        user数据: {
          所在位置: '大宋/临安府/城门',
          头像: 'preset:legacy-player-avatar',
          属性: { 根骨: 60, $缓存: '隐藏' },
          $meta: { 不应发送: true },
        },
        角色数据: {
          郭靖: { 所在位置: '大宋/临安府/城门', 头像: 'preset:legacy-npc-avatar', 身份: { 侠士: '初入江湖' }, $template: {} },
          黄蓉: { 所在位置: '大宋/临安府/客栈', 身份: { 少女: '聪慧' } },
          洪七公: { 所在位置: '大宋/嘉兴府/烟雨楼', 身份: { 丐帮帮主: '北丐' } },
          欧阳锋: { 所在位置: '西域/白驼山/山庄', 身份: { 西毒: '宗师' } },
          $template: { 所在位置: '' },
        },
        参与事件: {
          射雕第7回02: { 描述: '黄蓉正在事件中', update: { 黄蓉: { 好感: 1 } }, $meta: '隐藏' },
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
        swipes: Array.isArray(nextMessage.swipes)
          ? clone(nextMessage.swipes as string[])
          : assistantMessage.swipes,
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
      updateWorldbookWith: vi.fn(async (_worldbookName: string, updater: (entries: typeof worldbookEntries) => typeof worldbookEntries) => {
        worldbookEntries = updater(clone(worldbookEntries));
        return clone(worldbookEntries);
      }),
      substitudeMacros: (text: string) => text,
      formatAsTavernRegexedString: (text: string) => text,
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
        return clone(chatMessages.map(message =>
          message.message_id === assistantMessage.message_id ? assistantMessage : message,
        ));
      }
      return [];
    });

    requestConfiguredTextMock.mockResolvedValue('<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>');
    emitSourcedEraVariableWriteAndWaitMock.mockResolvedValue({
      version: 1,
      writeId: 'extra-sync-1',
      source: 'frontend',
      operation: 'update',
      reason: 'extra-variable-api-write',
      eventName: 'era:apiWrite',
      attribution: 'ai',
      message_id: 28,
      actions: { apiWrite: true },
    });
  });

  it('追加变量块时使用 refresh:none，并以严格目标参数等待 ERA 完成', async () => {
    const settings = {
      ...DEFAULT_SUMMARY_SETTINGS,
      variableUpdateMode: 'extra' as const,
    };

    const result = await executeExtraVariableUpdate({
      settings,
      assistantMessageId: 28,
      latestRawReply: '正文内容',
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
    expect(requestConfiguredTextMock).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('合法地点完整路径'),
    }));
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledWith(expect.objectContaining({
      source: 'frontend',
      operation: 'update',
      reason: 'extra-variable-api-write',
      eventName: 'era:apiWrite',
      attribution: 'ai',
      expectedMessageId: 28,
      expectedAction: 'apiWrite',
    }));
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

    expect(requestConfiguredTextMock).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining('合法地点完整路径'),
    }));
  });

  it('构造严格范围投影，递归清理所有 $ 字段并只选择相关 NPC', () => {
    const projection = buildExtraVariableProjection(variableSnapshot, '洪七公忽然现身。');
    const serialized = JSON.stringify(projection);

    expect(Object.keys(projection)).toEqual(['世界信息', 'user数据', '角色数据', '参与事件', '前端变量']);
    expect(projection.世界信息).toEqual({ 时间: '1219年10月20日13时' });
    expect(Object.keys(projection.角色数据 as Record<string, unknown>)).toEqual(['郭靖', '黄蓉', '洪七公']);
    expect(serialized).not.toContain('欧阳锋');
    expect(serialized).not.toContain('世界事件');
    expect(serialized).not.toContain('附近传闻');
    expect(serialized).not.toContain('后续事件线索');
    expect(serialized).not.toContain('随机数');
    expect(serialized).not.toContain('legacy-player-avatar');
    expect(serialized).not.toContain('legacy-npc-avatar');
    expect(serialized).not.toContain('$');
    expect(serialized).toContain('大宋/临安府/客栈');
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
    expect(() => JSON.parse(String(fallbackProjection))).not.toThrow();
  });
});
