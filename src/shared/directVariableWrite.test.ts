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

describe('runDirectChatVariableWrite', () => {
  beforeEach(() => {
    eventEmitMock.mockClear();
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

    await expect(runDirectChatVariableWrite(
      {
        source: 'event-script',
        operation: 'replace',
        reason: 'test-failure',
      },
      async () => {
        throw error;
      },
    )).rejects.toThrow(error);

    expect(eventEmitMock).not.toHaveBeenCalled();
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
      await Promise.all(writeDoneListeners.map(listener => listener({
        message_id: 51,
        actions: { apply: true },
      })));
      await Promise.all(writeDoneListeners.map(listener => listener({
        message_id: 52,
        actions: { apiWrite: true },
      })));
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

  it('原始 era:writeDone 已匹配时不等待无关后处理监听器', async () => {
    let releasePostProcess: (() => void) | undefined;
    const postProcessPending = new Promise<void>(resolve => {
      releasePostProcess = resolve;
    });
    let settled = false;

    eventOn('era:updateByObject', async () => {
      const writeDoneListeners = [...(listeners.get('era:writeDone') ?? [])];
      await Promise.all(writeDoneListeners.map(listener => listener({
        message_id: 77,
        actions: { apiWrite: true },
      })));
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
      await Promise.all(writeDoneListeners.map(listener => listener({
        message_id: 42,
        actions: { apiWrite: true, ignored: false },
      })));
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

    expect(result).toEqual(expect.objectContaining({
      version: 1,
      source: 'frontend',
      operation: 'update',
      reason: 'summary-write',
      eventName: 'era:updateByObject',
      attribution: 'background',
      message_id: 42,
      actions: { apiWrite: true },
    }));
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
    expect(executionOrder).toEqual([
      'era:updateByObject',
      ERA_VARIABLE_WRITE_DONE_EVENT,
    ]);
  });

  it('未显式指定 attribution 时默认标记为 background', async () => {
    eventOn('era:updateByObject', async () => {
      const writeDoneListeners = [...(listeners.get('era:writeDone') ?? [])];
      await Promise.all(writeDoneListeners.map(listener => listener({
        message_id: 7,
        actions: { apiWrite: true },
      })));
    });

    const result = await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'default-background-write',
      eventName: 'era:updateByObject',
      expectedAction: 'apiWrite',
      timeoutMessage: 'timeout',
    });

    expect(result).toEqual(expect.objectContaining({
      attribution: 'background',
      message_id: 7,
      actions: { apiWrite: true },
    }));
    expect(eventEmitMock).toHaveBeenCalledWith(
      ERA_VARIABLE_WRITE_DONE_EVENT,
      expect.objectContaining({
        attribution: 'background',
      }),
    );
  });
});
