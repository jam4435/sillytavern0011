import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../武侠/test/setup';
import { writeEraTransaction } from './era-write-helper.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const RECENT_SIGNATURE_TTL_FOR_TEST = 3001;

describe('writeEraTransaction', () => {
  let variables: any;

  beforeEach(() => {
    variables = {
      stat_data: {
        事件系统: {
          未发生事件: { 测试事件: { 年: 1 } },
          进行中事件: {},
        },
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => clone(variables));
    vi.mocked(globalThis.getChatMessages).mockReturnValue([{ message_id: 7 }] as never);
    eventEmitMock.mockClear();
  });

  it('sends ordered operations once and matches writeDone by transactionId', async () => {
    eventOn('era:transactionByObject', async ({ transactionId, operations }: any) => {
      expect(operations.map((operation: any) => operation.type)).toEqual(['insert', 'delete']);
      variables.stat_data.事件系统.进行中事件.测试事件 = { 年: 2 };
      delete variables.stat_data.事件系统.未发生事件.测试事件;
      await eventEmit('era:writeDone', {
        transactionId,
        transactionIds: [transactionId],
        actions: { apiWrite: true },
      });
    });

    await expect(
      writeEraTransaction(
        [
          {
            type: 'insert',
            payload: { 事件系统: { 进行中事件: { 测试事件: { 年: 2 } } } },
          },
          {
            type: 'delete',
            payload: { 事件系统: { 未发生事件: { 测试事件: {} } } },
          },
        ],
        'test-transaction-success',
      ),
    ).resolves.toBe(true);

    const transactionCalls = eventEmitMock.mock.calls.filter(([name]) => name === 'era:transactionByObject');
    expect(transactionCalls).toHaveLength(1);
    expect(transactionCalls[0][1]).toMatchObject({
      transactionId: expect.stringMatching(/^event-script-/),
      operations: expect.any(Array),
    });
  });

  it('does not auto-resend an applied timeout but can reapply after ERA rollback', async () => {
    vi.useFakeTimers();
    eventOn('era:transactionByObject', ({ operations }: any) => {
      expect(operations).toHaveLength(1);
      variables.stat_data.事务兜底标记 = 'written';
    });

    const firstWrite = writeEraTransaction(
      [{ type: 'insert', payload: { 事务兜底标记: 'written' } }],
      'test-transaction-timeout-applied',
      { timeoutMs: 5 },
    );
    await vi.advanceTimersByTimeAsync(10);
    await expect(firstWrite).resolves.toBe(true);

    expect(globalThis.getChatMessages).toHaveBeenCalledWith(-1, { include_swipes: true });
    expect(eventEmitMock.mock.calls.some(([name]) => name === 'manual_sync')).toBe(true);
    const initialTransactionCount = eventEmitMock.mock.calls.filter(
      ([name]) => name === 'era:transactionByObject',
    ).length;

    delete variables.stat_data.事务兜底标记;
    await expect(
      writeEraTransaction(
        [{ type: 'insert', payload: { 事务兜底标记: 'written' } }],
        'test-transaction-timeout-applied-retry',
        { timeoutMs: 5 },
      ),
    ).resolves.toBe(false);
    expect(eventEmitMock.mock.calls.filter(([name]) => name === 'era:transactionByObject')).toHaveLength(
      initialTransactionCount,
    );

    await vi.advanceTimersByTimeAsync(RECENT_SIGNATURE_TTL_FOR_TEST);
    eventOn('era:transactionByObject', async ({ transactionId }: any) => {
      await eventEmit('era:writeDone', {
        transactionId,
        transactionIds: [transactionId],
        actions: { apiWrite: true },
      });
    });
    await expect(
      writeEraTransaction(
        [{ type: 'insert', payload: { 事务兜底标记: 'written' } }],
        'test-transaction-after-era-rollback',
        { timeoutMs: 5 },
      ),
    ).resolves.toBe(true);
    expect(variables.stat_data.事务兜底标记).toBe('written');
    expect(eventEmitMock.mock.calls.filter(([name]) => name === 'era:transactionByObject')).toHaveLength(
      initialTransactionCount + 1,
    );
  });

  it('does not auto-resend when dispatch fails and reread cannot prove persistence', async () => {
    eventOn('era:transactionByObject', () => {
      throw new Error('transaction dispatch failed');
    });

    await expect(
      writeEraTransaction(
        [{ type: 'insert', payload: { 未落库标记: 'missing' } }],
        'test-transaction-dispatch-failed',
        { timeoutMs: 5 },
      ),
    ).resolves.toBe(false);

    expect(variables.stat_data.未落库标记).toBeUndefined();
    expect(eventEmitMock.mock.calls.some(([name]) => name === 'manual_sync')).toBe(false);
    expect(eventEmitMock.mock.calls.filter(([name]) => name === 'era:transactionByObject')).toHaveLength(1);
  });

  it('manual-syncs a written variable block before deciding whether an unknown transaction landed', async () => {
    vi.useFakeTimers();
    vi.mocked(globalThis.getChatMessages).mockReturnValue([
      {
        message_id: 8,
        message: ['正文', '<VariableInsert>', JSON.stringify({ 消息块兜底标记: 'written' }), '</VariableInsert>'].join(
          '\n',
        ),
      },
    ] as never);
    eventOn('manual_sync', () => {
      variables.stat_data.消息块兜底标记 = 'written';
    });

    const write = writeEraTransaction(
      [{ type: 'insert', payload: { 消息块兜底标记: 'written' } }],
      'test-message-written-before-stat-applied',
      { timeoutMs: 5 },
    );
    await vi.advanceTimersByTimeAsync(10);

    await expect(write).resolves.toBe(true);
    expect(variables.stat_data.消息块兜底标记).toBe('written');
    expect(eventEmitMock.mock.calls.some(([name]) => name === 'manual_sync')).toBe(true);
    expect(eventEmitMock.mock.calls.filter(([name]) => name === 'era:transactionByObject')).toHaveLength(1);
  });
});
