import { beforeEach, describe, expect, it, vi } from 'vitest';

const command = vi.hoisted(() => ({
  deleteByObject: vi.fn(),
  deleteByPath: vi.fn(),
  emitWriteDoneEvent: vi.fn(),
  insertByObject: vi.fn(),
  insertByPath: vi.fn(),
  transactionByObject: vi.fn(),
  updateByObject: vi.fn(),
  updateByPath: vi.fn(),
}));
const key = vi.hoisted(() => ({
  ensureMessageKey: vi.fn(async (message: { message_id: number }) => ({
    mk: message.message_id === 3 ? 'mk-floor-3' : 'mk-transaction',
    isNew: false,
  })),
  ensureMkForLatestMessage: vi.fn(async () => ({
    mk: 'mk-transaction',
    message_id: 7,
    isNewKey: false,
  })),
  readMessageKey: vi.fn(() => 'mk-transaction'),
  updateLatestSelectedMk: vi.fn(async () => undefined),
}));
const patcher = vi.hoisted(() => ({
  ApplyVarChange: vi.fn(async () => undefined),
}));
const rollback = vi.hoisted(() => ({
  rollbackByMk: vi.fn(async () => undefined),
}));

vi.mock('../api/command', () => command);
vi.mock('../api/macro/patch', () => ({ forceRenderRecentMessages: vi.fn() }));
vi.mock('../core/crud/patcher', () => patcher);
vi.mock('../core/key/mk', () => key);
vi.mock('../core/rollback', () => rollback);
const sync = vi.hoisted(() => ({
  resyncStateOnHistoryChange: vi.fn(async () => undefined),
}));
vi.mock('../core/sync', () => sync);
vi.mock('../utils/era_data', () => ({
  getEraData: () => ({
    meta: {
      SelectedMks: ['mk-transaction'],
      EditLogs: { 'mk-transaction': [{ op: 'update', path: 'player.hp' }] },
    },
    stat: { player: { hp: 80 } },
  }),
  removeMetaFields: (value: unknown) => value,
}));
vi.mock('../utils/diagnostics', () => ({
  createEraDiagnosticId: vi.fn(() => 'diagnostic-id'),
  getActiveEraDiagnosticTask: vi.fn(() => null),
  recordEraDiagnostic: vi.fn(),
  recordEraDiagnosticError: vi.fn(),
  setActiveEraDiagnosticTask: vi.fn(),
  startEraDiagnosticWatchdog: vi.fn(() => vi.fn()),
  updateEraDiagnosticState: vi.fn(),
}));
vi.mock('../utils/log', () => ({
  logContext: { mk: '' },
  Logger: class {
    log = vi.fn();
    debug = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

describe('ERA dispatcher transaction correlation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('tavern_events', {
      CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    });
    vi.stubGlobal(
      'getChatMessages',
      vi.fn(() => [{ message_id: 7, role: 'assistant' }]),
    );
  });

  it('一次 apiWrite 只应用并广播一次，且 writeDone 保留 transactionId', async () => {
    const { dispatchAndExecuteTask } = await import('./dispatcher');

    await dispatchAndExecuteTask(
      {
        type: 'era:apiWrite',
        detail: {
          flushId: 'flush-1',
          sourceDiagnosticIds: [],
          messageId: 7,
          transactionId: 'checkout-42',
          transactionIds: ['checkout-42'],
        },
        timestamp: Date.now(),
      },
      null,
    );

    expect(rollback.rollbackByMk).toHaveBeenCalledOnce();
    expect(patcher.ApplyVarChange).toHaveBeenCalledOnce();
    expect(command.emitWriteDoneEvent).toHaveBeenCalledOnce();
    expect(command.emitWriteDoneEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'checkout-42',
        transactionIds: ['checkout-42'],
        actions: expect.objectContaining({ apiWrite: true, apply: true }),
      }),
    );
  });

  it('写回到已不在末尾的指定楼层时全量重放历史，writeDone 仍关联原楼层', async () => {
    const targetFloor = { message_id: 3, role: 'assistant' };
    const latestFloor = { message_id: 9, role: 'assistant' };
    vi.stubGlobal(
      'getChatMessages',
      vi.fn((range: string | number) => {
        if (Number(range) === 3) return [targetFloor];
        if (Number(range) === -1) return [latestFloor];
        return [];
      }),
    );
    const { dispatchAndExecuteTask } = await import('./dispatcher');

    await dispatchAndExecuteTask(
      {
        type: 'era:apiWrite',
        detail: {
          messageId: 3,
          transactionId: 'summary-floor-3',
          transactionIds: ['summary-floor-3'],
        },
        timestamp: Date.now(),
      },
      null,
    );

    expect(key.ensureMessageKey).toHaveBeenCalledWith(targetFloor);
    expect(sync.resyncStateOnHistoryChange).toHaveBeenCalledWith(true);
    expect(rollback.rollbackByMk).not.toHaveBeenCalled();
    expect(patcher.ApplyVarChange).not.toHaveBeenCalled();
    expect(command.emitWriteDoneEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        message_id: 3,
        transactionId: 'summary-floor-3',
        transactionIds: ['summary-floor-3'],
        actions: expect.objectContaining({ apiWrite: true, resync: true }),
      }),
    );
  });

  it('SYNC 事件携带 syncId 时 writeDone 回传 syncIds 供等待方匹配', async () => {
    const { dispatchAndExecuteTask } = await import('./dispatcher');

    await dispatchAndExecuteTask(
      {
        type: 'manual_full_sync',
        detail: { syncId: 'wuxia-history-99' },
        timestamp: Date.now(),
      },
      null,
    );

    expect(command.emitWriteDoneEvent).toHaveBeenCalledOnce();
    expect(command.emitWriteDoneEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        syncIds: ['wuxia-history-99'],
        actions: expect.objectContaining({ resync: true }),
      }),
    );
  });

  it('transactionByObject API 事件只把完整 detail 交给批事务处理器', async () => {
    const { dispatchAndExecuteTask } = await import('./dispatcher');
    const detail = {
      transactionId: 'checkout-43',
      operations: [
        { type: 'delete', payload: { player: {} } },
        { type: 'insert', payload: { player: { route: 'C' } } },
      ],
    };

    await dispatchAndExecuteTask(
      {
        type: 'era:transactionByObject',
        detail,
        timestamp: Date.now(),
      },
      null,
    );

    expect(command.transactionByObject).toHaveBeenCalledOnce();
    expect(command.transactionByObject).toHaveBeenCalledWith(detail);
    expect(patcher.ApplyVarChange).not.toHaveBeenCalled();
    expect(command.emitWriteDoneEvent).not.toHaveBeenCalled();
  });
});
