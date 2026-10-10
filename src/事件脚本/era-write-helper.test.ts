import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../武侠/test/setup';
import { writeEraTransaction } from './era-write-helper.js';
import { HISTORY_EVENT_FORENSICS_STORAGE_KEY } from '../shared/historyEventForensics';

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

    const forensicEntries = JSON.parse(localStorage.getItem(HISTORY_EVENT_FORENSICS_STORAGE_KEY) || '[]')
      .filter((entry: any) => entry.details?.reason === 'test-transaction-success');
    expect(forensicEntries.map((entry: any) => entry.details.stage)).toEqual([
      'era-transaction-before', 'era-transaction-confirmed',
    ]);
    expect(forensicEntries[0].details.transactionId).toBe(forensicEntries[1].details.transactionId);
    expect(forensicEntries[0].details.operations).toEqual([
      { type: 'insert', path: '事件系统.进行中事件.测试事件' },
      { type: 'delete', path: '事件系统.未发生事件.测试事件' },
    ]);
    expect(forensicEntries[0].details.eventSnapshot.eventSystemHash).not.toBe(
      forensicEntries[1].details.eventSnapshot.eventSystemHash,
    );
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

    const firstForensics = JSON.parse(localStorage.getItem(HISTORY_EVENT_FORENSICS_STORAGE_KEY) || '[]');
    expect(firstForensics.map((entry: any) => entry.details?.stage)).toContain('era-transaction-unconfirmed');
    expect(firstForensics.map((entry: any) => entry.details?.stage)).toContain('era-transaction-reread-result');
    expect(firstForensics.find((entry: any) => entry.details?.stage === 'era-transaction-unconfirmed')?.details)
      .toMatchObject({ isTimeout: true, transactionId: expect.any(String), signatureHash: expect.any(String) });

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
    const duplicateDiagnostics = JSON.parse(localStorage.getItem(HISTORY_EVENT_FORENSICS_STORAGE_KEY) || '[]');
    expect(duplicateDiagnostics.find((entry: any) => entry.details?.stage === 'era-transaction-duplicate-suppressed')?.details)
      .toMatchObject({ duplicateState: 'recently-confirmed', signatureHash: expect.any(String) });

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
