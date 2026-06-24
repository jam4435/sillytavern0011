import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECT_VARIABLE_WRITE_DONE_EVENT,
  ERA_VARIABLE_WRITE_DONE_EVENT,
  emitSourcedEraVariableWriteAndWait,
  runDirectChatVariableWrite,
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
      message_id: 42,
      actions: { apiWrite: true },
    }));
    expect(eventEmitMock).toHaveBeenCalledWith(
      ERA_VARIABLE_WRITE_DONE_EVENT,
      expect.objectContaining({
        source: 'frontend',
        operation: 'update',
        reason: 'summary-write',
        message_id: 42,
        actions: { apiWrite: true },
      }),
    );
    expect(executionOrder).toEqual([
      'era:updateByObject',
      ERA_VARIABLE_WRITE_DONE_EVENT,
    ]);
  });
});
