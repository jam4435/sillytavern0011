import { afterEach, describe, expect, it, vi } from 'vitest';

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
    expect(eventEmit).toHaveBeenCalledWith(
      'era:apiWrite',
      expect.objectContaining({ messageId: 7 }),
    );
    expect(
      diagnostics.recordEraDiagnostic.mock.calls.some(
        ([source, event, details]) =>
          source === 'api-command' &&
          event === 'scheduled-flush-started' &&
          details.timerSource === 'microtask-hidden',
      ),
    ).toBe(true);
  });
});
