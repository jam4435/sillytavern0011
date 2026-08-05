import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./eraWriteWait', () => ({ emitEraEventAndWait: vi.fn(async () => {}) }));
vi.mock('./variableReader', () => ({
  flushPendingGameDataCompletion: vi.fn(async () => {}),
  isFrontendLoaderOnlyMessage: vi.fn((text: string) => text.includes('loader-only')),
  normalizeDisplayedMessageContent: vi.fn((text: string) => text.replace(/<Variable(?:Think|Insert|Edit|Delete)>[\s\S]*?<\/Variable(?:Think|Insert|Edit|Delete)>/gi, '').trim()),
}));

import { emitEraEventAndWait } from './eraWriteWait';
import {
  LatestAssistantEditorConflictError,
  LatestAssistantEraDataProtectedError,
  LatestAssistantRollbackUncertainError,
  LatestAssistantVariableBlockError,
  readLatestAssistantSnapshot,
  saveLatestAssistantSnapshot,
} from './latestAssistantEditor';

type Message = {
  message_id: number;
  role: 'system' | 'assistant' | 'user';
  message: string;
  is_hidden?: boolean;
  swipe_id?: number;
  swipes?: string[];
  swipes_data?: Record<string, unknown>[];
  swipes_info?: Record<string, unknown>[];
  data?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;
const globals = globalThis as typeof globalThis & { setChatMessages: ReturnType<typeof vi.fn> };
const emitEraEventAndWaitMock = vi.mocked(emitEraEventAndWait);

describe('latestAssistantEditor', () => {
  let messages: Message[];
  let chatId: string;

  beforeEach(() => {
    chatId = 'chat-a';
    (globalThis as typeof globalThis & { SillyTavern: { getCurrentChatId: () => string } }).SillyTavern = {
      getCurrentChatId: () => chatId,
    };
    messages = [
      { message_id: 1, role: 'user', message: '前情' },
      {
        message_id: 2,
        role: 'assistant',
        // 模拟固定 iframe 宿主仍映射旧 message 字段；编辑器必须以 active swipe 为准。
        message: '陈旧宿主正文',
        swipe_id: 1,
        swipes: ['旧 swipe', '旧 active\n<era_data>{"mk":"stable"}</era_data>'],
        swipes_data: [{ page: 0 }, { page: 1 }],
        swipes_info: [{ type: 'old' }, { type: 'active' }],
        data: { custom: true },
        extra: { marker: 'x' },
      },
    ];
    getChatMessagesMock.mockImplementation((range: string | number) => {
      if (range === '0-{{lastMessageId}}') return clone(messages);
      if (typeof range === 'number') return clone(messages.filter(message => message.message_id === range));
      return [];
    });
    globals.setChatMessages = vi.fn(async (patches: Array<Partial<Message>>) => {
      for (const patch of patches) {
        const index = messages.findIndex(message => message.message_id === patch.message_id);
        if (index < 0) continue;
        messages[index] = {
          ...messages[index],
          ...patch,
          swipes: Array.isArray(patch.swipes) ? clone(patch.swipes) : messages[index].swipes,
        };
      }
    });
    emitEraEventAndWaitMock.mockReset().mockResolvedValue(undefined);
  });

  it('严格只选择最后一个未隐藏的有效 assistant active swipe', () => {
    const snapshot = readLatestAssistantSnapshot();

    expect(snapshot).toMatchObject({
      chatId: 'chat-a',
      messageId: 2,
      swipeId: 1,
      rawText: '旧 active\n<era_data>{"mk":"stable"}</era_data>',
      messageMirrorText: '陈旧宿主正文',
      hasSwipes: true,
    });
    expect(snapshot?.metadata).toMatchObject({ swipeCount: 2, data: { custom: true }, extra: { marker: 'x' } });

    messages.push({ message_id: 3, role: 'user', message: '新的行动' });
    expect(readLatestAssistantSnapshot()).toBeNull();
  });

  it('双写 active swipe 与 message，保留其他 swipe metadata，且不刷新 iframe', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    const draft = '新 active\n<era_data>{"mk":"stable"}</era_data>';
    const result = await saveLatestAssistantSnapshot(snapshot, draft);

    expect(globals.setChatMessages).toHaveBeenCalledWith(
      [expect.objectContaining({ message_id: 2, message: draft, swipe_id: 1, swipes: ['旧 swipe', draft] })],
      { refresh: 'none' },
    );
    expect(messages[1].swipes_data).toEqual([{ page: 0 }, { page: 1 }]);
    expect(messages[1].swipes_info).toEqual([{ type: 'old' }, { type: 'active' }]);
    expect(result).toMatchObject({ finalText: draft, variableActionsChanged: false });
    expect(emitEraEventAndWaitMock).not.toHaveBeenCalled();
  });

  it('在 chat、active swipe 或 raw 变化后拒绝覆盖', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    messages[1].swipes![1] = '外部新内容\n<era_data>{"mk":"stable"}</era_data>';
    messages[1].message = messages[1].swipes![1];

    await expect(saveLatestAssistantSnapshot(snapshot, snapshot.rawText)).rejects.toBeInstanceOf(
      LatestAssistantEditorConflictError,
    );
    expect(globals.setChatMessages).not.toHaveBeenCalled();
  });

  it('即使 active swipe 未变，message mirror 变化也拒绝覆盖', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    messages[1].message = '外部修正的镜像字段';

    await expect(saveLatestAssistantSnapshot(snapshot, snapshot.rawText)).rejects.toBeInstanceOf(
      LatestAssistantEditorConflictError,
    );
    expect(globals.setChatMessages).not.toHaveBeenCalled();
  });

  it('保护 era_data 字节内容，并拒绝不完整或非法变量动作块', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    await expect(saveLatestAssistantSnapshot(snapshot, '正文\n<era_data>{"mk":"changed"}</era_data>')).rejects.toBeInstanceOf(
      LatestAssistantEraDataProtectedError,
    );
    await expect(saveLatestAssistantSnapshot(snapshot, '正文\n<VariableEdit>{bad}</VariableEdit>\n<era_data>{"mk":"stable"}</era_data>')).rejects.toBeInstanceOf(
      LatestAssistantVariableBlockError,
    );
    await expect(saveLatestAssistantSnapshot(snapshot, '正文\n<VariableEdit>\n<era_data>{"mk":"stable"}</era_data>')).rejects.toBeInstanceOf(
      LatestAssistantVariableBlockError,
    );
    messages[1].message = '没有 ERA 数据';
    messages[1].swipes![1] = '没有 ERA 数据';
    const noEraSnapshot = readLatestAssistantSnapshot()!;
    await expect(saveLatestAssistantSnapshot(noEraSnapshot, '正文\n<era_data>{"mk":"new"}')).rejects.toBeInstanceOf(
      LatestAssistantEraDataProtectedError,
    );
  });

  it('无 swipe 时写回 message 且保持 refresh:none', async () => {
    messages = [{ message_id: 4, role: 'assistant', message: '原正文' }];
    const snapshot = readLatestAssistantSnapshot()!;
    const result = await saveLatestAssistantSnapshot(snapshot, '新正文');

    expect(snapshot.hasSwipes).toBe(false);
    expect(globals.setChatMessages).toHaveBeenCalledWith([{ message_id: 4, message: '新正文' }], { refresh: 'none' });
    expect(result.finalText).toBe('新正文');
  });

  it('写入 API 报错但草稿已完整落盘时恢复原 active swipe 和原 message 镜像', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    const draft = '写入后抛错的草稿\n<era_data>{"mk":"stable"}</era_data>';
    globals.setChatMessages.mockImplementationOnce(async () => {
      messages[1].message = draft;
      messages[1].swipes![1] = draft;
      throw new Error('transport failed after commit');
    });

    await expect(saveLatestAssistantSnapshot(snapshot, draft)).rejects.toThrow('已恢复保存前内容');
    expect(messages[1].message).toBe(snapshot.messageMirrorText);
    expect(messages[1].swipes?.[1]).toBe(snapshot.rawText);
  });

  it('写入只完成一半时报告状态不确定，不冒险覆盖', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    const draft = '部分写入的草稿\n<era_data>{"mk":"stable"}</era_data>';
    globals.setChatMessages.mockImplementationOnce(async () => {
      messages[1].message = draft;
      throw new Error('partial write');
    });

    await expect(saveLatestAssistantSnapshot(snapshot, draft)).rejects.toBeInstanceOf(
      LatestAssistantRollbackUncertainError,
    );
    expect(messages[1].message).toBe(draft);
    expect(messages[1].swipes?.[1]).toBe(snapshot.rawText);
  });

  it('最后可见楼层为 hidden、loader-only 或空 assistant 时不提供编辑目标', () => {
    messages = [{ message_id: 4, role: 'assistant', message: '不可见', is_hidden: true }];
    expect(readLatestAssistantSnapshot()).toBeNull();

    messages = [{ message_id: 4, role: 'assistant', message: 'loader-only' }];
    expect(readLatestAssistantSnapshot()).toBeNull();

    messages = [{ message_id: 4, role: 'assistant', message: '' }];
    expect(readLatestAssistantSnapshot()).toBeNull();
  });

  it('变量动作语义变化后等待匹配 manual_sync', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    const draft = '正文\n<VariableEdit>{"user数据":{"修为":101}}</VariableEdit>\n<era_data>{"mk":"stable"}</era_data>';
    const result = await saveLatestAssistantSnapshot(snapshot, draft, { eraSyncTimeoutMs: 1234 });

    expect(result.variableActionsChanged).toBe(true);
    expect(emitEraEventAndWaitMock).toHaveBeenCalledWith('manual_sync', expect.objectContaining({
      timeoutMs: 1234,
      expectedMessageId: 2,
      expectedAction: 'resync',
    }));
  });

  it('ERA 同步失败时恢复原文并等待恢复同步', async () => {
    messages[1].message = '旧 message 镜像';
    const snapshot = readLatestAssistantSnapshot()!;
    const draft = '正文\n<VariableEdit>{"user数据":{"修为":101}}</VariableEdit>\n<era_data>{"mk":"stable"}</era_data>';
    emitEraEventAndWaitMock.mockRejectedValueOnce(new Error('sync timeout')).mockResolvedValueOnce(undefined);

    await expect(saveLatestAssistantSnapshot(snapshot, draft)).rejects.toThrow('已恢复保存前的最新回复');
    expect(messages[1].message).toBe('旧 message 镜像');
    expect(messages[1].swipes?.[1]).toBe(snapshot.rawText);
    expect(emitEraEventAndWaitMock).toHaveBeenCalledTimes(2);
  });

  it('拒绝开闭标签数量相同但类型不匹配的变量动作块', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    const draft = '正文\n<VariableInsert>{"a":1}</VariableEdit>\n<era_data>{"mk":"stable"}</era_data>';

    await expect(saveLatestAssistantSnapshot(snapshot, draft)).rejects.toBeInstanceOf(
      LatestAssistantVariableBlockError,
    );
    expect(globals.setChatMessages).not.toHaveBeenCalled();
  });

  it('不能安全回滚时报告不确定状态，不覆盖外部内容', async () => {
    const snapshot = readLatestAssistantSnapshot()!;
    const draft = '正文\n<VariableEdit>{"user数据":{"修为":101}}</VariableEdit>\n<era_data>{"mk":"stable"}</era_data>';
    emitEraEventAndWaitMock.mockImplementationOnce(async () => {
      messages[1].message = '外部覆盖';
      messages[1].swipes![1] = '外部覆盖';
      throw new Error('sync timeout');
    });

    await expect(saveLatestAssistantSnapshot(snapshot, draft)).rejects.toBeInstanceOf(
      LatestAssistantRollbackUncertainError,
    );
    expect(messages[1].message).toBe('外部覆盖');
  });
});
