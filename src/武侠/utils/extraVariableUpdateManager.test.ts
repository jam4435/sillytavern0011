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
import { executeExtraVariableUpdate } from './extraVariableUpdateManager';
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

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emitSourcedEraVariableWriteAndWaitMock = vi.mocked(emitSourcedEraVariableWriteAndWait);
const requestConfiguredTextMock = vi.mocked(requestConfiguredText);
const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;
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
      {
        uid: 2,
        name: '输出提示词',
        enabled: true,
        content: '当前变量上下文',
      },
    ];

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
      },
    });

    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === assistantMessage.message_id || messageId === '0-{{lastMessageId}}') {
        return [clone(assistantMessage)];
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
});
