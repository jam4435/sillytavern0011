import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./eraWriteWait', () => ({
  emitEraEventAndWait: vi.fn(async () => {}),
}));

vi.mock('./variableReader', () => ({
  flushPendingGameDataCompletion: vi.fn(async () => {}),
  getLastMessageContent: vi.fn(),
  isFrontendLoaderOnlyMessage: vi.fn(() => false),
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
import { regenerateLastAssistantSwipe } from './messageActions';

type ChatRole = 'system' | 'assistant' | 'user';

type MockChatMessage = {
  message_id: number;
  role: ChatRole;
  message: string;
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

    getLastMessageContentMock.mockImplementation(() => getActiveMessageText(messages[1]));
  });

  it('重新生成时先只写聊天数据，成功后再等待 ERA，同步前不刷新宿主楼层', async () => {
    const result = await regenerateLastAssistantSwipe();

    expect(globals.setChatMessages).toHaveBeenNthCalledWith(
      1,
      [
        expect.objectContaining({
          message_id: 2,
          swipes: expect.arrayContaining([
            '旧正文\n\n<era_data>{"mk":"old"}</era_data>',
            '旧正文',
          ]),
        }),
      ],
      { refresh: 'none' },
    );
    expect(globals.setChatMessages).toHaveBeenNthCalledWith(
      2,
      [
        expect.objectContaining({
          message_id: 2,
          swipe_id: 1,
        }),
      ],
      { refresh: 'none' },
    );
    expect(globals.setChatMessages).toHaveBeenNthCalledWith(
      3,
      [
        expect.objectContaining({
          message_id: 2,
          message: '旧正文',
        }),
      ],
      { refresh: 'none' },
    );
    expect(globals.setChatMessages).toHaveBeenNthCalledWith(
      4,
      [
        expect.objectContaining({
          message_id: 2,
          swipes: expect.arrayContaining([
            '旧正文\n\n<era_data>{"mk":"old"}</era_data>',
            expect.stringContaining('新正文'),
          ]),
        }),
      ],
      { refresh: 'none' },
    );
    expect(globals.setChatMessages).toHaveBeenNthCalledWith(
      5,
      [
        expect.objectContaining({
          message_id: 2,
          message: expect.stringContaining('新正文'),
        }),
      ],
      { refresh: 'none' },
    );
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
    expect(result.rawReply).toBe('新正文');
  });

  it('重新生成遇到两次 429 后只提交一个新 swipe', async () => {
    globals.generate = vi.fn()
      .mockRejectedValueOnce({ status: 429, retryAfterMs: 0 })
      .mockRejectedValueOnce({ cause: { statusCode: 429 }, retryAfterMs: 0 })
      .mockResolvedValue('限流后新正文');

    const result = await regenerateLastAssistantSwipe();

    expect(globals.generate).toHaveBeenCalledTimes(3);
    expect(messages[1].swipes).toHaveLength(2);
    expect(messages[1].swipes?.filter(text => text.includes('限流后新正文'))).toHaveLength(1);
    expect(emitEraEventAndWaitMock).toHaveBeenCalledTimes(2);
    expect(result.rawReply).toBe('限流后新正文');
  });

  it('重新生成连续三次 429 后恢复原 swipe', async () => {
    globals.generate = vi.fn().mockRejectedValue({ status: 429, retryAfterMs: 0, message: 'HTTP 429' });

    await expect(regenerateLastAssistantSwipe()).rejects.toThrow('已自动重试 2 次');

    expect(globals.generate).toHaveBeenCalledTimes(3);
    expect(messages[1].swipe_id).toBe(0);
    expect(messages[1].message).toBe('旧正文\n\n<era_data>{"mk":"old"}</era_data>');
    expect(emitEraEventAndWaitMock).not.toHaveBeenCalledWith('era:apiWrite', expect.anything());
  });
});
