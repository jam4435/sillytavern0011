import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./eraWriteWait', () => ({
  emitEraEventAndWait: vi.fn(async () => {}),
}));

vi.mock('./variableReader', () => ({
  flushPendingGameDataCompletion: vi.fn(async () => {}),
  getLastMessageContent: vi.fn(),
  isFrontendLoaderOnlyMessage: vi.fn(() => false),
  normalizeAssistantReplyForPersistence: vi.fn((text: string) =>
    text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
  ),
  normalizeDisplayedMessageContent: vi.fn((text: string) => text),
  parseOptions: vi.fn((text: string) => (text.includes('<option>') ? ['选项'] : [])),
  readGameDataPure: vi.fn(() => ({ 时间: '测试' })),
}));

vi.mock('./promptDebug', () => ({
  captureNextCombinedPromptForDebug: vi.fn(() => ({ stop: vi.fn() })),
}));

vi.mock('./locationContext', () => ({
  extractExplicitMapTargetsFromText: vi.fn(() => []),
  syncDynamicLocationContextVariable: vi.fn(async () => ({ 已解析: true })),
}));

import { emitEraEventAndWait } from './eraWriteWait';
import { getLastMessageContent } from './variableReader';
import {
  canAppendPreviousAssistantForRegenerate,
  getLastRegenerateAssistantAppendText,
  getLastRegenerateUserInput,
  regenerateLastAssistantSwipe,
} from './messageActions';

type ChatRole = 'system' | 'assistant' | 'user';

type MockChatMessage = {
  message_id: number;
  role: ChatRole;
  message: string;
  data?: Record<string, unknown>;
  swipes?: string[];
  swipes_data?: Record<string, unknown>[];
  swipes_info?: Record<string, unknown>[];
  swipe_id?: number;
  is_hidden?: boolean;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emitEraEventAndWaitMock = vi.mocked(emitEraEventAndWait);
const getLastMessageContentMock = vi.mocked(getLastMessageContent);
const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;
const globals = globalThis as typeof globalThis & {
  setChatMessages: ReturnType<typeof vi.fn>;
  generate: ReturnType<typeof vi.fn>;
};

function getActiveMessageText(message: MockChatMessage): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length === 0) {
    return message.message;
  }
  const swipeId = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return swipes[Math.max(0, Math.min(swipeId, swipes.length - 1))] || message.message;
}

describe('regenerateLastAssistantSwipe', () => {
  let messages: MockChatMessage[];

  beforeEach(() => {
    messages = [
      {
        message_id: 1,
        role: 'user',
        message: '上一条提问',
      },
      {
        message_id: 2,
        role: 'assistant',
        message: '旧正文\n\n<era_data>{"mk":"old"}</era_data>',
        swipes: ['旧正文\n\n<era_data>{"mk":"old"}</era_data>'],
        swipes_data: [{}],
        swipes_info: [{}],
        swipe_id: 0,
      },
    ];

    globals.setChatMessages = vi.fn(async (nextMessages: Array<Partial<MockChatMessage>>) => {
      for (const patch of nextMessages) {
        const index = messages.findIndex(message => message.message_id === patch.message_id);
        if (index < 0) {
          continue;
        }

        const previous = messages[index];
        messages[index] = {
          ...previous,
          ...patch,
          swipes: Array.isArray(patch.swipes) ? clone(patch.swipes) : previous.swipes,
          swipes_data: Array.isArray(patch.swipes_data) ? clone(patch.swipes_data) : previous.swipes_data,
          swipes_info: Array.isArray(patch.swipes_info) ? clone(patch.swipes_info) : previous.swipes_info,
          swipe_id: Number.isInteger(patch.swipe_id) ? Number(patch.swipe_id) : previous.swipe_id,
          message: typeof patch.message === 'string' ? patch.message : previous.message,
        };
      }
    });
    globals.generate = vi.fn(async () => '新正文');

    getChatMessagesMock.mockImplementation((messageId?: unknown, options?: { include_swipes?: boolean }) => {
      if (messageId === '0-{{lastMessageId}}') {
        return clone(messages);
      }
      if (typeof messageId === 'number') {
        return clone(messages.filter(message => message.message_id === messageId));
      }
      if (options?.include_swipes) {
        return clone(messages);
      }
      return clone(messages);
    });

    getLastMessageContentMock.mockImplementation(() => {
      const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant');
      return latestAssistant ? getActiveMessageText(latestAssistant) : '';
    });
  });

  it('重新生成原位替换当前 swipe，成功后不保留旧重 roll 内容', async () => {
    const result = await regenerateLastAssistantSwipe();

    expect(globals.setChatMessages).toHaveBeenNthCalledWith(
      1,
      [
        expect.objectContaining({
          message_id: 2,
          message: '旧正文',
          swipe_id: 0,
          swipes: ['旧正文'],
        }),
      ],
      { refresh: 'none' },
    );
    expect(globals.setChatMessages).toHaveBeenNthCalledWith(
      2,
      [
        expect.objectContaining({
          message_id: 2,
          message: '新正文',
          swipe_id: 0,
          swipes: ['新正文'],
        }),
      ],
      { refresh: 'none' },
    );
    expect(messages[1].swipes).toEqual(['新正文']);
    expect(messages[1].message).toBe('新正文');
    expect(emitEraEventAndWaitMock).toHaveBeenNthCalledWith(1, 'manual_sync', expect.objectContaining({
      expectedMessageId: 2,
      expectedAction: 'resync',
    }));
    expect(emitEraEventAndWaitMock).toHaveBeenNthCalledWith(2, 'era:apiWrite', expect.objectContaining({
      expectedMessageId: 2,
      expectedAction: 'apiWrite',
    }));
    expect(globals.generate).toHaveBeenCalledWith(expect.not.objectContaining({ injects: expect.anything() }));
    expect(result.assistantMessageId).toBe(2);
    expect(result.assistantSwipeId).toBe(0);
    expect(result.rawReply).toBe('新正文');
  });

  it('重新生成 tracker baseline 位于旧 swipe 回滚后，并早于新回复写入', async () => {
    const onVariableBaselineReady = vi.fn();
    const onGeneratedReplyReady = vi.fn();

    await regenerateLastAssistantSwipe({ onVariableBaselineReady, onGeneratedReplyReady });

    expect(onVariableBaselineReady).toHaveBeenCalledWith(2);
    expect(onGeneratedReplyReady).toHaveBeenCalledWith('新正文', 2);
    expect(emitEraEventAndWaitMock.mock.invocationCallOrder[0]).toBeLessThan(
      onVariableBaselineReady.mock.invocationCallOrder[0],
    );
    expect(onVariableBaselineReady.mock.invocationCallOrder[0]).toBeLessThan(
      onGeneratedReplyReady.mock.invocationCallOrder[0],
    );
    expect(onGeneratedReplyReady.mock.invocationCallOrder[0]).toBeLessThan(
      globals.setChatMessages.mock.invocationCallOrder[1],
    );
    expect(onGeneratedReplyReady.mock.invocationCallOrder[0]).toBeLessThan(
      emitEraEventAndWaitMock.mock.invocationCallOrder[1],
    );
  });

  it('重新生成遇到两次 429 后仍只原位提交一个 swipe', async () => {
    globals.generate = vi.fn()
      .mockRejectedValueOnce({ status: 429, retryAfterMs: 0 })
      .mockRejectedValueOnce({ cause: { statusCode: 429 }, retryAfterMs: 0 })
      .mockResolvedValue('限流后新正文');

    const result = await regenerateLastAssistantSwipe();

    expect(globals.generate).toHaveBeenCalledTimes(3);
    expect(messages[1].swipes).toHaveLength(1);
    expect(messages[1].swipes?.[0]).toContain('限流后新正文');
    expect(emitEraEventAndWaitMock).toHaveBeenCalledTimes(2);
    expect(result.rawReply).toBe('限流后新正文');
  });

  it('重新生成写入新 swipe 前清洗异常换行并同步 message 镜像', async () => {
    const rawReply = '\r\n<tucao>\r\n重新生成吐槽  \r\n</tucao>\r\n\r\n\r\n\r\n新正文\r\n\r\n\r\n';
    const persistedReply = '<tucao>\n重新生成吐槽\n</tucao>\n\n新正文';
    globals.generate = vi.fn(async () => rawReply);

    const result = await regenerateLastAssistantSwipe();

    expect(messages[1].swipes).toHaveLength(1);
    expect(messages[1].swipes?.[0]).toBe(persistedReply);
    expect(messages[1].message).toBe(persistedReply);
    expect(messages[1].message).not.toMatch(/\n{3,}/);
    expect(messages[1].message).not.toMatch(/\n$/);
    expect(result.rawReply).toBe(rawReply);
  });

  it('已有手动备选时只替换当前 swipe，不删除其它备选', async () => {
    messages[1] = {
      ...messages[1],
      message: '备选B\n\n<era_data>{"mk":"b"}</era_data>',
      swipes: [
        '备选A\n\n<era_data>{"mk":"a"}</era_data>',
        '备选B\n\n<era_data>{"mk":"b"}</era_data>',
        '备选C\n\n<era_data>{"mk":"c"}</era_data>',
      ],
      swipes_data: [{ a: 1 }, { b: 1 }, { c: 1 }],
      swipes_info: [{ type: 'manual' }, { type: 'manual' }, { type: 'manual' }],
      swipe_id: 1,
    };
    globals.generate = vi.fn(async () => '重 roll 后的B');

    const result = await regenerateLastAssistantSwipe();

    expect(messages[1].swipes).toEqual([
      '备选A\n\n<era_data>{"mk":"a"}</era_data>',
      '重 roll 后的B',
      '备选C\n\n<era_data>{"mk":"c"}</era_data>',
    ]);
    expect(messages[1].swipe_id).toBe(1);
    expect(messages[1].message).toBe('重 roll 后的B');
    expect(result.assistantSwipeId).toBe(1);
  });

  it('旧 user 楼层没有输入历史元数据时，编辑值隐藏 era_data 且写回仍保留原系统尾段', async () => {
    messages[0] = {
      message_id: 1,
      role: 'user',
      message: '原玩家输入\n\n<era_data>{"user":"meta"}</era_data>',
    };

    expect(getLastRegenerateUserInput()).toBe('原玩家输入');

    await regenerateLastAssistantSwipe({ replacementUserInput: '修改后的玩家输入' });

    expect(messages[0].message).toBe('修改后的玩家输入\n\n<era_data>{"user":"meta"}</era_data>');
    const generateCall = vi.mocked(globals.generate).mock.calls[0]?.[0] as {
      overrides?: { chat_history?: { prompts?: Array<{ role: string; content: string }> } };
    };
    expect(generateCall.overrides?.chat_history?.prompts?.at(-1)).toEqual({
      role: 'user',
      content: '修改后的玩家输入\n\n<era_data>{"user":"meta"}</era_data>',
    });
  });

  it('输入历史元数据意外带有 era_data 时，修改上一轮输入仍只暴露玩家正文', () => {
    messages[0] = {
      message_id: 1,
      role: 'user',
      message: '玩家真实输入\n\n<era_data>{"user":"meta"}</era_data>',
      data: {
        wuxiaInputHistoryV1: {
          text: '玩家真实输入\n\n<era_data>{"user":"meta"}</era_data>',
        },
      },
    };

    expect(getLastRegenerateUserInput()).toBe('玩家真实输入');
  });

  it('重新生成编辑器会隐藏不在末尾的 era_data，而不是只处理系统尾段', () => {
    messages[0] = {
      message_id: 1,
      role: 'user',
      message: '玩家真实输入\n<era_data>{"user":"meta"}</era_data>\n补充正文',
      data: {
        wuxiaInputHistoryV1: {
          text: '玩家真实输入\n<era_data>{"user":"meta"}</era_data>\n补充正文',
        },
      },
    };

    expect(getLastRegenerateUserInput()).toBe('玩家真实输入\n\n补充正文');
  });

  it('提交修改上一轮输入时会剥离误混入草稿与旧元数据的 era_data，并继续保留原楼层系统尾段', async () => {
    messages[0] = {
      message_id: 1,
      role: 'user',
      message: '原玩家输入\n\n<era_data>{"user":"original"}</era_data>',
      data: {
        wuxiaInputHistoryV1: {
          text: '原玩家输入\n\n<era_data>{"user":"original"}</era_data>',
        },
      },
    };

    await regenerateLastAssistantSwipe({
      replacementUserInput: '修改后的玩家输入\n\n<era_data>{"user":"should-not-be-editable"}</era_data>',
    });

    expect(messages[0].message).toBe('修改后的玩家输入\n\n<era_data>{"user":"original"}</era_data>');
    expect(messages[0].data?.wuxiaInputHistoryV1).toEqual({ text: '修改后的玩家输入' });
  });

  it('可把补充文本插到上一轮 AI 的 Variable/era_data 系统尾块之前再重新生成', async () => {
    messages = [
      {
        message_id: 1,
        role: 'assistant',
        message:
          '上一轮正文\n\n<VariableEdit>{"stat_data":{"测试":1}}</VariableEdit>\n\n<era_data>{"mk":"previous"}</era_data>',
        swipes: [
          '上一轮正文\n\n<VariableEdit>{"stat_data":{"测试":1}}</VariableEdit>\n\n<era_data>{"mk":"previous"}</era_data>',
        ],
        swipe_id: 0,
      },
      {
        message_id: 2,
        role: 'user',
        message: '继续追问',
      },
      {
        message_id: 3,
        role: 'assistant',
        message: '当前旧回复\n\n<era_data>{"mk":"current"}</era_data>',
        swipes: ['当前旧回复\n\n<era_data>{"mk":"current"}</era_data>'],
        swipe_id: 0,
      },
    ];

    expect(canAppendPreviousAssistantForRegenerate()).toBe(true);
    globals.generate = vi.fn(async () => '根据补充信息生成的新回复');

    await regenerateLastAssistantSwipe({ previousAssistantAppendText: '补充：上一轮其实还发生了这件事。' });

    expect(messages[0].message).toBe(
      '上一轮正文\n\n补充：上一轮其实还发生了这件事。\n\n<VariableEdit>{"stat_data":{"测试":1}}</VariableEdit>\n\n<era_data>{"mk":"previous"}</era_data>',
    );
    const generateCall = vi.mocked(globals.generate).mock.calls[0]?.[0] as {
      overrides?: { chat_history?: { prompts?: Array<{ role: string; content: string }> } };
    };
    expect(generateCall.overrides?.chat_history?.prompts?.[0]?.content).toContain(
      '上一轮正文\n\n补充：上一轮其实还发生了这件事。\n\n<VariableEdit>',
    );
    expect(messages[2].message).toBe('根据补充信息生成的新回复');
  });

  it('再次编辑上一轮 AI 追加段时会回填旧追加，并用新内容替换而不是继续叠加', async () => {
    const previousAssistant =
      '上一轮正文\n\n<VariableEdit>{"stat_data":{"测试":1}}</VariableEdit>\n\n<era_data>{"mk":"previous"}</era_data>';
    messages = [
      { message_id: 1, role: 'assistant', message: previousAssistant, swipes: [previousAssistant], swipe_id: 0 },
      { message_id: 2, role: 'user', message: '继续追问' },
      {
        message_id: 3,
        role: 'assistant',
        message: '当前旧回复\n\n<era_data>{"mk":"current"}</era_data>',
        swipes: ['当前旧回复\n\n<era_data>{"mk":"current"}</era_data>'],
        swipe_id: 0,
      },
    ];

    globals.generate = vi.fn(async () => '第一次重新生成');
    await regenerateLastAssistantSwipe({ previousAssistantAppendText: '补充A：第一次追加。' });

    expect(getLastRegenerateAssistantAppendText()).toBe('补充A：第一次追加。');
    expect(messages[0].message).toContain('补充A：第一次追加。');

    globals.generate = vi.fn(async () => '第二次重新生成');
    await regenerateLastAssistantSwipe({ previousAssistantAppendText: '补充B：修改后的追加。' });

    expect(getLastRegenerateAssistantAppendText()).toBe('补充B：修改后的追加。');
    expect(messages[0].message).toContain('补充B：修改后的追加。');
    expect(messages[0].message).not.toContain('补充A：第一次追加。');
    expect(messages[0].message.match(/补充B：修改后的追加。/g)).toHaveLength(1);
  });

  it('追加上一轮 AI 输出时 message 镜像短暂未同步不会误判失败，并会主动补写镜像', async () => {
    const previousAssistant =
      '上一轮正文\n\n<VariableEdit>{"stat_data":{"测试":1}}</VariableEdit>\n\n<era_data>{"mk":"previous"}</era_data>';
    messages = [
      { message_id: 1, role: 'assistant', message: previousAssistant, swipes: [previousAssistant], swipe_id: 0 },
      { message_id: 2, role: 'user', message: '继续追问' },
      {
        message_id: 3,
        role: 'assistant',
        message: '当前旧回复\n\n<era_data>{"mk":"current"}</era_data>',
        swipes: ['当前旧回复\n\n<era_data>{"mk":"current"}</era_data>'],
        swipe_id: 0,
      },
    ];
    globals.generate = vi.fn(async () => '镜像修复后的新回复');

    const normalSetChatMessages = globals.setChatMessages;
    let delayedMirrorOnce = true;
    globals.setChatMessages = vi.fn(async (nextMessages: Array<Partial<MockChatMessage>>) => {
      const appendPatch = nextMessages.find(
        patch =>
          patch.message_id === 1 &&
          Array.isArray(patch.swipes) &&
          typeof patch.message === 'string' &&
          patch.message.includes('补充：镜像延迟测试'),
      );

      if (delayedMirrorOnce && appendPatch) {
        delayedMirrorOnce = false;
        const expectedMirror = appendPatch.message;
        await normalSetChatMessages(
          nextMessages.map(patch =>
            patch === appendPatch
              ? {
                  ...patch,
                  message: previousAssistant,
                }
              : patch,
          ),
        );
        expect(messages[0].swipes?.[0]).toBe(expectedMirror);
        expect(messages[0].message).toBe(previousAssistant);
        return;
      }

      await normalSetChatMessages(nextMessages);
    });

    await expect(
      regenerateLastAssistantSwipe({ previousAssistantAppendText: '补充：镜像延迟测试' }),
    ).resolves.toEqual(expect.objectContaining({ rawReply: '镜像修复后的新回复' }));

    expect(messages[0].swipes?.[0]).toContain('补充：镜像延迟测试');
    expect(messages[0].message).toBe(messages[0].swipes?.[0]);
    expect(messages[2].message).toBe('镜像修复后的新回复');
  });

  it('可同时修改上一轮 user 并追加上一轮 assistant，再用两项修改后的历史重新生成', async () => {
    const previousAssistant =
      '上一轮正文\n\n<VariableEdit>{"stat_data":{"测试":1}}</VariableEdit>\n\n<era_data>{"mk":"previous"}</era_data>';
    messages = [
      { message_id: 1, role: 'assistant', message: previousAssistant, swipes: [previousAssistant], swipe_id: 0 },
      {
        message_id: 2,
        role: 'user',
        message: '原玩家输入\n\n<era_data>{"user":"meta"}</era_data>',
      },
      {
        message_id: 3,
        role: 'assistant',
        message: '当前旧回复\n\n<era_data>{"mk":"current"}</era_data>',
        swipes: ['当前旧回复\n\n<era_data>{"mk":"current"}</era_data>'],
        swipe_id: 0,
      },
    ];
    globals.generate = vi.fn(async () => '同时修改后的新回复');

    await regenerateLastAssistantSwipe({
      replacementUserInput: '修改后的玩家输入',
      previousAssistantAppendText: '补充：上一轮还有隐藏信息。',
    });

    expect(messages[0].message).toContain('上一轮正文\n\n补充：上一轮还有隐藏信息。\n\n<VariableEdit>');
    expect(messages[1].message).toBe('修改后的玩家输入\n\n<era_data>{"user":"meta"}</era_data>');

    const generateCall = vi.mocked(globals.generate).mock.calls[0]?.[0] as {
      overrides?: { chat_history?: { prompts?: Array<{ role: string; content: string }> } };
    };
    const prompts = generateCall.overrides?.chat_history?.prompts ?? [];
    expect(prompts[0]?.content).toContain('补充：上一轮还有隐藏信息。');
    expect(prompts.at(-1)).toEqual({
      role: 'user',
      content: '修改后的玩家输入\n\n<era_data>{"user":"meta"}</era_data>',
    });
    expect(messages[2].message).toBe('同时修改后的新回复');
  });

  it('追加上一轮 AI 输出后若重新生成失败，会同时恢复上一轮输出与当前回复', async () => {
    const previousAssistant =
      '上一轮正文\n\n<VariableEdit>{"stat_data":{"测试":1}}</VariableEdit>\n\n<era_data>{"mk":"previous"}</era_data>';
    const currentAssistant = '当前旧回复\n\n<era_data>{"mk":"current"}</era_data>';
    messages = [
      { message_id: 1, role: 'assistant', message: previousAssistant, swipes: [previousAssistant], swipe_id: 0 },
      { message_id: 2, role: 'user', message: '继续追问' },
      { message_id: 3, role: 'assistant', message: currentAssistant, swipes: [currentAssistant], swipe_id: 0 },
    ];
    globals.generate = vi.fn().mockRejectedValue(new Error('生成失败'));

    await expect(
      regenerateLastAssistantSwipe({ previousAssistantAppendText: '临时补充信息' }),
    ).rejects.toThrow('生成失败');

    expect(messages[0].message).toBe(previousAssistant);
    expect(messages[0].swipes?.[0]).toBe(previousAssistant);
    expect(messages[2].message).toBe(currentAssistant);
    expect(messages[2].swipes?.[0]).toBe(currentAssistant);
  });

  it('重新生成连续三次 429 后恢复原 swipe', async () => {
    globals.generate = vi.fn().mockRejectedValue({ status: 429, retryAfterMs: 0, message: 'HTTP 429' });

    await expect(regenerateLastAssistantSwipe()).rejects.toThrow('已自动重试 2 次');

    expect(globals.generate).toHaveBeenCalledTimes(3);
    expect(messages[1].swipe_id).toBe(0);
    expect(messages[1].swipes).toEqual(['旧正文\n\n<era_data>{"mk":"old"}</era_data>']);
    expect(messages[1].message).toBe('旧正文\n\n<era_data>{"mk":"old"}</era_data>');
    expect(emitEraEventAndWaitMock).not.toHaveBeenCalledWith('era:apiWrite', expect.anything());
  });
});
