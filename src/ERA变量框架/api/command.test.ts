import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const diagnostics = vi.hoisted(() => ({
  createEraDiagnosticId: vi.fn(() => 'diagnostic-id'),
  getActiveEraDiagnosticTask: vi.fn(() => null),
  recordEraDiagnostic: vi.fn(),
  recordEraDiagnosticError: vi.fn(),
  startEraDiagnosticWatchdog: vi.fn(() => vi.fn()),
  updateEraDiagnosticState: vi.fn(),
}));

const messages = vi.hoisted(() => ({
  findLastAiMessage: vi.fn(async () => ({ message_id: 7 })),
  getMessageContent: vi.fn(() => '正文'),
  updateMessageContent: vi.fn(async () => undefined),
}));

vi.mock('../utils/diagnostics', () => diagnostics);
vi.mock('../utils/message', () => messages);
vi.mock('../utils/constants', () => ({
  ERA_EVENT_EMITTER: { API_WRITE: 'era:apiWrite', WRITE_DONE: 'era:writeDone' },
}));
vi.mock('../utils/data', () => ({
  J: (value: unknown) => JSON.stringify(value),
  unescapeEraData: (value: unknown) => value,
}));
vi.mock('../utils/log', () => ({
  Logger: class {
    log = vi.fn();
    debug = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

describe('ERA API command write scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('隐藏页同步入队会经 microtask 合并，并实际启动一次写入', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const eventEmit = vi.fn(async () => undefined);
    vi.stubGlobal('eventEmit', eventEmit);
    const { updateByObject } = await import('./command');

    updateByObject({ player: { hp: 10 } });
    updateByObject({ player: { mp: 20 } });

    await vi.waitFor(() => expect(messages.updateMessageContent).toHaveBeenCalledOnce());

    const writtenText = messages.updateMessageContent.mock.calls[0][1];
    expect(writtenText).toContain('<VariableEdit>');
    expect(writtenText).toContain('{"player":{"hp":10,"mp":20}}');
    expect(eventEmit).toHaveBeenCalledWith('era:apiWrite', expect.objectContaining({ messageId: 7 }));
    expect(
      diagnostics.recordEraDiagnostic.mock.calls.some(
        ([source, event, details]) =>
          source === 'api-command' && event === 'scheduled-flush-started' && details.timerSource === 'microtask-hidden',
      ),
    ).toBe(true);
  });

  it('批事务按声明顺序一次更新消息并只发出一次带 transactionId 的 apiWrite', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const eventEmit = vi.fn(async () => undefined);
    vi.stubGlobal('eventEmit', eventEmit);
    const { transactionByObject } = await import('./command');

    transactionByObject({
      transactionId: 'checkout-42',
      operations: [
        { type: 'delete', payload: { player: { obsolete: {} } } },
        { type: 'insert', payload: { player: { route: 'B' } } },
        { type: 'update', payload: { player: { hp: 80 } } },
      ],
    });

    await vi.waitFor(() => expect(messages.updateMessageContent).toHaveBeenCalledOnce());

    const writtenText = messages.updateMessageContent.mock.calls[0][1] as string;
    expect(writtenText.indexOf('<VariableDelete>')).toBeLessThan(writtenText.indexOf('<VariableInsert>'));
    expect(writtenText.indexOf('<VariableInsert>')).toBeLessThan(writtenText.indexOf('<VariableEdit>'));
    expect(eventEmit).toHaveBeenCalledTimes(1);
    expect(eventEmit).toHaveBeenCalledWith(
      'era:apiWrite',
      expect.objectContaining({
        messageId: 7,
        transactionId: 'checkout-42',
        transactionIds: ['checkout-42'],
      }),
    );
  });

  it.each([
    [{ transactionId: 'tx', operations: [] }, 'operations'],
    [{ transactionId: '', operations: [{ type: 'insert', payload: {} }] }, 'transactionId'],
    [{ transactionId: 'tx', operations: [{ type: 'insert', payload: [] }] }, 'payload'],
    [{ transactionId: 'tx', operations: [{ type: 'replace', payload: {} }] }, 'type'],
  ])('拒绝非法批事务且不更新消息: %j', async (detail, expectedError) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.stubGlobal(
      'eventEmit',
      vi.fn(async () => undefined),
    );
    const { transactionByObject } = await import('./command');

    expect(() => transactionByObject(detail as never)).toThrow(expectedError);
    await Promise.resolve();
    expect(messages.updateMessageContent).not.toHaveBeenCalled();
  });

  it('任一 payload 无法序列化时不会部分入队', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.stubGlobal(
      'eventEmit',
      vi.fn(async () => undefined),
    );
    const { transactionByObject, updateByObject } = await import('./command');
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() =>
      transactionByObject({
        transactionId: 'broken-tx',
        operations: [
          { type: 'insert', payload: { shouldNotAppear: true } },
          { type: 'update', payload: circular },
        ],
      }),
    ).toThrow();

    updateByObject({ validAfterFailure: true });
    await vi.waitFor(() => expect(messages.updateMessageContent).toHaveBeenCalledOnce());
    const writtenText = messages.updateMessageContent.mock.calls[0][1] as string;
    expect(writtenText).toContain('validAfterFailure');
    expect(writtenText).not.toContain('shouldNotAppear');
  });
});
