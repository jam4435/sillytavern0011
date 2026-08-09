import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTurnTransaction } from './turnTransaction';

type Listener = (detail?: unknown) => void;

describe('runTurnTransaction', () => {
  let listeners: Map<string, Set<Listener>>;
  let lastMessageId: number;
  let messages: Array<{ id: number; role: string; message: string }>;

  beforeEach(() => {
    listeners = new Map();
    lastMessageId = 0;
    messages = [];

    Object.assign(globalThis, {
      SillyTavern: { getCurrentChatId: () => 'chat-nba' },
      getLastMessageId: () => lastMessageId,
      eventOn: (name: string, listener: Listener) => {
        const bucket = listeners.get(name) ?? new Set<Listener>();
        bucket.add(listener);
        listeners.set(name, bucket);
        return { stop: () => bucket.delete(listener) };
      },
      eventEmit: vi.fn(async (name: string, detail?: unknown) => {
        if (name === 'nba2k:turn-lifecycle' && (detail as any)?.phase === 'start') {
          const ack = { phase: 'locked', roundId: (detail as any).roundId, chatId: 'chat-nba' };
          listeners.get('nba2k:turn-lock-ack')?.forEach(listener => listener(ack));
        }
        listeners.get(name)?.forEach(listener => listener(detail));
      }),
      createChatMessages: vi.fn(async (entries: Array<{ role: string; message: string }>) => {
        for (const entry of entries) {
          lastMessageId += 1;
          messages.push({ id: lastMessageId, ...entry });
          if (entry.role === 'assistant') {
            const detail = { message_id: lastMessageId, actions: { resync: true }, statWithoutMeta: { 版本: 2 } };
            listeners.get('era:writeDone')?.forEach(listener => listener(detail));
          }
        }
      }),
      deleteChatMessages: vi.fn(async (ids: number[]) => {
        messages = messages.filter(message => !ids.includes(message.id));
      }),
      generate: vi.fn(async () => '本回合正文\n<VariableEdit>{}</VariableEdit>'),
    });
  });

  it('只持久化一对消息且 generate 不重复携带 user_input', async () => {
    const result = await runTurnTransaction('三分判定');

    expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(messages.map(message => message.message)).toEqual([
      '三分判定',
      '本回合正文\n<VariableEdit>{}</VariableEdit>',
    ]);
    expect(globalThis.generate).toHaveBeenCalledWith({ should_stream: false });
    expect(result.assistantMessageId).toBe(2);
  });

  it('生成失败时回滚孤立 user 楼层并释放回合锁', async () => {
    vi.mocked(globalThis.generate).mockRejectedValueOnce(new Error('provider failed'));

    await expect(runTurnTransaction('失败回合')).rejects.toThrow('provider failed');
    expect(messages).toEqual([]);
    expect(globalThis.deleteChatMessages).toHaveBeenCalledWith([1], { refresh: 'none' });
    expect(globalThis.eventEmit).toHaveBeenCalledWith(
      'nba2k:turn-lifecycle',
      expect.objectContaining({ phase: 'finish', messageId: null }),
    );
  });

  it('ERA 超时时保留完整 user/assistant 楼层', async () => {
    vi.mocked(globalThis.createChatMessages).mockImplementationOnce(async entries => {
      for (const entry of entries) {
        lastMessageId += 1;
        messages.push({ id: lastMessageId, ...entry });
      }
    });
    vi.mocked(globalThis.createChatMessages).mockImplementationOnce(async entries => {
      for (const entry of entries) {
        lastMessageId += 1;
        messages.push({ id: lastMessageId, ...entry });
      }
    });

    await expect(runTurnTransaction('ERA超时', { eraTimeoutMs: 10 })).rejects.toThrow('ERA');
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(globalThis.deleteChatMessages).not.toHaveBeenCalled();
  });
});
