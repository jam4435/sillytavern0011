import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECT_VARIABLE_WRITE_DONE_EVENT,
  ERA_VARIABLE_WRITE_DONE_EVENT,
  emitEraVariableWriteAndWait,
  emitSourcedEraVariableWriteAndWait,
  runDirectChatVariableWrite,
  writeDirectChatTransaction,
} from './directVariableWrite';
import { eventEmitMock, listeners } from '../武侠/test/setup';
import { clearHistoryCheckoutJournal, createHistoryCheckoutJournal } from './historyCheckoutJournal';
import { clearChatRenameJournal, createChatRenameJournal } from './chatRenameJournal';

describe('runDirectChatVariableWrite', () => {
  beforeEach(() => {
    eventEmitMock.mockClear();
    clearHistoryCheckoutJournal();
    clearChatRenameJournal();
  });

  it('写入成功后返回原结果并发送项目事件', async () => {
    const executionOrder: string[] = [];
    const writer = vi.fn(async () => {
      executionOrder.push('writer');
      return { ok: true };
    });

    eventEmitMock.mockImplementationOnce(async () => {
      executionOrder.push('event');
    });

    const result = await runDirectChatVariableWrite(
      {
        source: 'variable-editor',
        operation: 'update',
        reason: 'variable-editor-leaf-save',
      },
      writer,
    );

    expect(result).toEqual({ ok: true });
    expect(writer).toHaveBeenCalledTimes(1);
    expect(eventEmitMock).toHaveBeenCalledWith(
      DIRECT_VARIABLE_WRITE_DONE_EVENT,
      expect.objectContaining({
        version: 1,
        writeId: expect.any(String),
        source: 'variable-editor',
        operation: 'update',
        reason: 'variable-editor-leaf-save',
      }),
    );
    expect(executionOrder).toEqual(['writer', 'event']);
  });

  it('写入失败时不发送完成事件', async () => {
    const error = new Error('write failed');

    await expect(
      runDirectChatVariableWrite(
        {
          source: 'event-script',
          operation: 'replace',
          reason: 'test-failure',
        },
        async () => {
          throw error;
        },
      ),
    ).rejects.toThrow(error);

    expect(eventEmitMock).not.toHaveBeenCalled();
  });

  it('checkout journal 存在时阻止前端派生写入，但不阻止事件脚本显式写入', async () => {
    createHistoryCheckoutJournal({
      targetNodeId: 'target',
      targetLocator: {
        chatId: 'chat-a',
        chatName: 'A',
        userMessageId: 1,
        assistantMessageId: 2,
        swipeId: 0,
      },
      sourceHeadNodeId: 'source',
      sourceChatId: 'chat-a',
      sourceChatName: 'A',
    });
    const frontendWriter = vi.fn();

    await expect(
      runDirectChatVariableWrite(
        {
          source: 'frontend',
          operation: 'update',
          reason: 'startup-completion',
        },
        frontendWriter,
      ),
    ).rejects.toThrow('历史分叉同步期间已暂停前端派生变量写入');
    expect(frontendWriter).not.toHaveBeenCalled();

    const eventWriter = vi.fn(async () => ({ ok: true }));
    await expect(
      runDirectChatVariableWrite(
        {
          source: 'event-script',
          operation: 'update',
          reason: 'history-verification-derived-state',
        },
        eventWriter,
      ),
    ).resolves.toEqual({ ok: true });
    expect(eventWriter).toHaveBeenCalledTimes(1);
  });

  it('聊天改名 journal 存在时阻止前端和变量编辑器直接写入', async () => {
    createChatRenameJournal({
      reason: 'manual',
      oldChatId: 'chat-a',
      oldChatName: '旧卷',
      requestedName: '新卷',
      reopenHistoryPanel: true,
    });
    const writer = vi.fn(async () => ({ ok: true }));

    await expect(
      runDirectChatVariableWrite({ source: 'frontend', operation: 'update', reason: 'rename-race' }, writer),
    ).rejects.toThrow('聊天存档改名期间已暂停前端派生变量写入');
    await expect(
      runDirectChatVariableWrite({ source: 'variable-editor', operation: 'update', reason: 'rename-race' }, writer),
    ).rejects.toThrow('聊天存档改名期间已暂停直接变量写入');
    expect(writer).not.toHaveBeenCalled();
  });

  it('缺省 refreshHint 保持 full，并支持单次 direct transaction', async () => {
    eventEmitMock.mockImplementationOnce(async (_eventName, detail) => {
      expect(detail).toEqual(expect.objectContaining({ refreshHint: 'full' }));
    });

    await runDirectChatVariableWrite(
      {
        source: 'frontend',
        operation: 'update',
        reason: 'legacy-write',
      },
      async () => ({ stat_data: {} }),
    );
    expect(eventEmitMock).toHaveBeenCalledWith(
      DIRECT_VARIABLE_WRITE_DONE_EVENT,
      expect.objectContaining({ refreshHint: 'full' }),
    );

    const updateVariablesWithMock = vi.mocked(globalThis.updateVariablesWith);
    updateVariablesWithMock.mockImplementationOnce(updater => updater({ stat_data: {} }));
    eventEmitMock.mockClear();
    await writeDirectChatTransaction(
      variables => ({ ...variables, stat_data: { eventState: true } }),
      'single-transaction',
      { refreshHint: 'event-state' },
    );
    expect(updateVariablesWithMock).toHaveBeenCalledTimes(1);
    expect(eventEmitMock).toHaveBeenCalledWith(
      DIRECT_VARIABLE_WRITE_DONE_EVENT,
      expect.objectContaining({
        reason: 'single-transaction',
        refreshHint: 'event-state',
      }),
    );
  });

  it('底层 ERA 等待器先监听后 emit，且不发送 sourced 完成事件', async () => {
    const executionOrder: string[] = [];

    eventOn('era:updateByObject', async () => {
      executionOrder.push('era:updateByObject');
      const writeDoneListeners = [...(listeners.get('era:writeDone') ?? [])];
      await Promise.all(
        writeDoneListeners.map(listener =>
          listener({
            message_id: 51,
            actions: { apply: true },
          }),
        ),
      );
      await Promise.all(
        writeDoneListeners.map(listener =>
          listener({
            message_id: 52,
            actions: { apiWrite: true },
          }),
        ),
      );
    });

    const result = await emitEraVariableWriteAndWait({
      source: 'event-script',
      operation: 'update',
      reason: 'event-diff-update',
      eventName: 'era:updateByObject',
      detail: { 角色数据: { 郭靖: { 状态: '已完成' } } },
      expectedMessageId: 52,
      expectedAction: 'apiWrite',
      timeoutMessage: 'timeout',
    });

    expect(result).toEqual({ message_id: 52, actions: { apiWrite: true } });
    expect(executionOrder).toEqual(['era:updateByObject']);
    expect(eventEmitMock.mock.calls.some(([eventName]) => eventName === ERA_VARIABLE_WRITE_DONE_EVENT)).toBe(false);
  });

  it('批事务等待器忽略其他事务，并匹配合并 flush 的 transactionIds', async () => {
    eventOn('era:transactionByObject', async () => {
      const writeDoneListeners = [...(listeners.get('era:writeDone') ?? [])];
      await Promise.all(
        writeDoneListeners.map(listener =>
          listener({
            message_id: 81,
            actions: { apiWrite: true },
            transactionId: 'other-transaction',
            transactionIds: ['other-transaction'],
          }),
        ),
      );
      await Promise.all(
        writeDoneListeners.map(listener =>
          listener({
            message_id: 81,
            actions: { apiWrite: true },
            transactionIds: ['coalesced-transaction', 'target-transaction'],
          }),
        ),
      );
    });

    const result = await emitEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'meridian-upgrade',
      eventName: 'era:transactionByObject',
      detail: {
        transactionId: 'target-transaction',
        operations: [{ type: 'update', payload: { user数据: { 修为: 100 } } }],
      },
      expectedMessageId: 81,
      expectedAction: 'apiWrite',
      expectedTransactionId: 'target-transaction',
      timeoutMessage: 'timeout',
    });

    expect(result).toEqual({
      message_id: 81,
      actions: { apiWrite: true },
      transactionIds: ['coalesced-transaction', 'target-transaction'],
    });
  });

  it('带来源事务完成事件保留单事务 transactionId 与规范化 transactionIds', async () => {
    eventOn('era:transactionByObject', async ({ transactionId }: any) => {
      const writeDoneListeners = [...(listeners.get('era:writeDone') ?? [])];
      await Promise.all(
        writeDoneListeners.map(listener =>
          listener({
            message_id: 82,
            actions: { apiWrite: true },
            transactionId,
          }),
        ),
      );
    });

    const result = await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'single-meridian-upgrade',
      eventName: 'era:transactionByObject',
      detail: { transactionId: 'target-transaction', operations: [] },
      expectedTransactionId: 'target-transaction',
      timeoutMessage: 'timeout',
    });

    expect(result).toEqual(
      expect.objectContaining({
        eventName: 'era:transactionByObject',
        transactionId: 'target-transaction',
        transactionIds: ['target-transaction'],
      }),
    );
    expect(eventEmitMock).toHaveBeenCalledWith(
      ERA_VARIABLE_WRITE_DONE_EVENT,
      expect.objectContaining({
        transactionId: 'target-transaction',
        transactionIds: ['target-transaction'],
      }),
    );
  });

  it('原始 era:writeDone 已匹配时不等待无关后处理监听器', async () => {
    let releasePostProcess: (() => void) | undefined;
    const postProcessPending = new Promise<void>(resolve => {
      releasePostProcess = resolve;
    });
    let settled = false;

    eventOn('era:updateByObject', async () => {
      const writeDoneListeners = [...(listeners.get('era:writeDone') ?? [])];
      await Promise.all(
        writeDoneListeners.map(listener =>
          listener({
            message_id: 77,
            actions: { apiWrite: true },
          }),
        ),
      );
      await postProcessPending;
    });

    const resultPromise = emitEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'extra-variable-api-write',
      eventName: 'era:updateByObject',
      expectedMessageId: 77,
      expectedAction: 'apiWrite',
      timeoutMessage: 'timeout',
    }).then(result => {
      settled = true;
      return result;
    });

    try {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(settled).toBe(true);
      await expect(resultPromise).resolves.toEqual({ message_id: 77, actions: { apiWrite: true } });
    } finally {
      releasePostProcess?.();
    }
  });

  it('ERA 写入确认后发送带来源的完成事件', async () => {
    const executionOrder: string[] = [];

    eventOn('era:updateByObject', async () => {
      executionOrder.push('era:updateByObject');
      const writeDoneListeners = [...(listeners.get('era:writeDone') ?? [])];
      await Promise.all(
        writeDoneListeners.map(listener =>
          listener({
            message_id: 42,
            actions: { apiWrite: true, ignored: false },
          }),
        ),
      );
    });
    eventOn(ERA_VARIABLE_WRITE_DONE_EVENT, () => {
      executionOrder.push(ERA_VARIABLE_WRITE_DONE_EVENT);
    });

    const result = await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'summary-write',
      eventName: 'era:updateByObject',
      attribution: 'background',
      detail: { stat_data: { user数据: { 修为: 120 } } },
      expectedAction: 'apiWrite',
      timeoutMessage: 'timeout',
    });

    expect(result).toEqual(
      expect.objectContaining({
        version: 1,
        source: 'frontend',
        operation: 'update',
        reason: 'summary-write',
        eventName: 'era:updateByObject',
        attribution: 'background',
        message_id: 42,
        actions: { apiWrite: true },
      }),
    );
    expect(eventEmitMock).toHaveBeenCalledWith(
      ERA_VARIABLE_WRITE_DONE_EVENT,
      expect.objectContaining({
        source: 'frontend',
        operation: 'update',
        reason: 'summary-write',
        attribution: 'background',
        message_id: 42,
        actions: { apiWrite: true },
      }),
    );
    expect(executionOrder).toEqual(['era:updateByObject', ERA_VARIABLE_WRITE_DONE_EVENT]);
  });

  it('未显式指定 attribution 时默认标记为 background', async () => {
    eventOn('era:updateByObject', async () => {
      const writeDoneListeners = [...(listeners.get('era:writeDone') ?? [])];
      await Promise.all(
        writeDoneListeners.map(listener =>
          listener({
            message_id: 7,
            actions: { apiWrite: true },
          }),
        ),
      );
    });

    const result = await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'default-background-write',
      eventName: 'era:updateByObject',
      expectedAction: 'apiWrite',
      timeoutMessage: 'timeout',
    });

    expect(result).toEqual(
      expect.objectContaining({
        attribution: 'background',
        message_id: 7,
        actions: { apiWrite: true },
      }),
    );
    expect(eventEmitMock).toHaveBeenCalledWith(
      ERA_VARIABLE_WRITE_DONE_EVENT,
      expect.objectContaining({
        attribution: 'background',
      }),
    );
  });
});
