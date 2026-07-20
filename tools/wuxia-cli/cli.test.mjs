// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { WUXIA_ERROR_CODES, WUXIA_METHODS } from '../wuxia-bridge/protocol.mjs';
import { EXIT_CODES, parseCliArgs, runCli } from './cli.mjs';

describe('wuxia CLI', () => {
  it('parses turn parameters into the real-turn request shape', () => {
    expect(
      parseCliArgs(['turn', '--input', '前往客栈', '--chat-id', 'chat-1', '--settle-timeout-ms', '12000']),
    ).toMatchObject({
      command: 'turn',
      input: '前往客栈',
      target: { chatId: 'chat-1' },
      turnOptions: { settleTimeoutMs: 12000 },
    });
  });

  it('rejects an empty turn without contacting the relay', async () => {
    const call = vi.fn();
    const result = await runCli(['turn'], { call });

    expect(result.exitCode).toBe(EXIT_CODES.ARGUMENT);
    expect(result.output).toMatchObject({ ok: false, error: { code: 'INVALID_ARGUMENT' } });
    expect(call).not.toHaveBeenCalled();
  });

  it('maps snapshot to getSnapshot and preserves structured data', async () => {
    const call = vi.fn(async request => ({ id: request.id, ok: true, result: { chatId: 'chat-1' } }));
    const result = await runCli(['snapshot'], { call });

    expect(call).toHaveBeenCalledWith(expect.objectContaining({ method: WUXIA_METHODS.GET_SNAPSHOT }), {});
    expect(result).toMatchObject({ exitCode: 0, output: { ok: true, data: { chatId: 'chat-1' } } });
  });

  it('uses a dedicated exit code when a turn outcome is unknown', async () => {
    const call = vi.fn(async request => ({
      id: request.id,
      ok: false,
      error: {
        code: WUXIA_ERROR_CODES.OUTCOME_UNKNOWN,
        message: 'unknown',
        retryable: false,
        outcome: 'unknown',
      },
    }));
    const result = await runCli(['turn', '--input', '继续观察'], { call });

    expect(result.exitCode).toBe(EXIT_CODES.OUTCOME_UNKNOWN);
    expect(result.output).toMatchObject({ ok: false, error: { code: WUXIA_ERROR_CODES.OUTCOME_UNKNOWN } });
  });

  it('keeps the full failed turn report for prompt and variable diagnosis', async () => {
    const report = { ok: false, error: '变量解析失败', rawReply: '<VariableEdit>', variableVerification: {} };
    const call = vi.fn(async request => ({ id: request.id, ok: true, result: report }));
    const result = await runCli(['turn', '--input', '检查背包'], { call });

    expect(result.exitCode).toBe(EXIT_CODES.REMOTE_FAILURE);
    expect(result.output).toMatchObject({ ok: false, data: report, error: { code: 'TURN_FAILED' } });
  });
});
