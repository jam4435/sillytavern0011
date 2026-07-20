import {
  WUXIA_ERROR_CODES,
  WUXIA_METHODS,
  createRequestId,
  isRecord,
} from '../wuxia-bridge/protocol.mjs';
import { callWuxiaBridge } from './client.mjs';

const EXIT_CODES = Object.freeze({
  OK: 0,
  ARGUMENT: 2,
  OFFLINE: 3,
  REMOTE_FAILURE: 4,
  OUTCOME_UNKNOWN: 5,
});

const OPTION_NAMES = new Set([
  'input',
  'bridge-id',
  'session-id',
  'chat-id',
  'settle-timeout-ms',
  'settle-delay-ms',
  'timeout-ms',
  'url',
]);

function parseNumberOption(value, name, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) {
    throw new Error(`--${name} 必须是 0-${max} 范围内的数字。`);
  }
  return number;
}

export function parseCliArgs(argv) {
  const [unknownCommand, ...rest] = argv;
  const command = unknownCommand || 'help';
  const options = {};
  const positionals = [];

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith('--')) {
      positionals.push(current);
      continue;
    }
    const [rawName, inlineValue] = current.slice(2).split('=', 2);
    if (!OPTION_NAMES.has(rawName)) throw new Error(`未知参数 --${rawName}。`);
    const value = inlineValue ?? rest[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${rawName} 缺少值。`);
    options[rawName] = value;
  }

  if (!['help', 'status', 'snapshot', 'turn'].includes(command)) {
    throw new Error(`未知命令 ${command}。`);
  }
  if (command !== 'turn' && positionals.length > 0) {
    throw new Error(`${command} 命令不接受位置参数。`);
  }

  const input = String(options.input ?? positionals.join(' ')).trim();
  if (command === 'turn' && !input) throw new Error('turn 命令需要 --input "玩家行动"。');
  if (input.length > 8_000) throw new Error('玩家行动不能超过 8000 个字符。');

  return {
    command,
    input,
    url: options.url,
    requestTimeoutMs:
      options['timeout-ms'] === undefined
        ? undefined
        : parseNumberOption(options['timeout-ms'], 'timeout-ms', 600_000),
    target: {
      ...(options['bridge-id'] ? { bridgeId: options['bridge-id'] } : {}),
      ...(options['session-id'] ? { sessionId: options['session-id'] } : {}),
      ...(options['chat-id'] ? { chatId: options['chat-id'] } : {}),
    },
    turnOptions: {
      ...(options['settle-timeout-ms'] === undefined
        ? {}
        : {
            settleTimeoutMs: parseNumberOption(options['settle-timeout-ms'], 'settle-timeout-ms', 30_000),
          }),
      ...(options['settle-delay-ms'] === undefined
        ? {}
        : { settleDelayMs: parseNumberOption(options['settle-delay-ms'], 'settle-delay-ms', 1_000) }),
    },
  };
}

function usageResult(requestId) {
  return {
    ok: true,
    command: 'help',
    requestId,
    data: {
      commands: [
        'pnpm --silent wuxia status',
        'pnpm --silent wuxia snapshot [--chat-id <id>]',
        'pnpm --silent wuxia turn --input "玩家行动" [--chat-id <id>]',
      ],
      environment: ['WUXIA_BRIDGE_URL', 'WUXIA_BRIDGE_TOKEN'],
    },
  };
}

function getExitCodeForError(code) {
  if (code === WUXIA_ERROR_CODES.OUTCOME_UNKNOWN) return EXIT_CODES.OUTCOME_UNKNOWN;
  if (
    [
      WUXIA_ERROR_CODES.SERVER_OFFLINE,
      WUXIA_ERROR_CODES.BRIDGE_OFFLINE,
      WUXIA_ERROR_CODES.AUTOMATION_NOT_READY,
      WUXIA_ERROR_CODES.TARGET_NOT_FOUND,
      WUXIA_ERROR_CODES.MULTIPLE_BRIDGES,
    ].includes(code)
  ) {
    return EXIT_CODES.OFFLINE;
  }
  return EXIT_CODES.REMOTE_FAILURE;
}

export async function runCli(argv, dependencies = {}) {
  const requestId = createRequestId('cli');
  const call = dependencies.call ?? callWuxiaBridge;
  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    return {
      exitCode: EXIT_CODES.ARGUMENT,
      output: {
        ok: false,
        command: argv[0] ?? 'help',
        requestId,
        error: {
          code: 'INVALID_ARGUMENT',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      },
    };
  }

  if (parsed.command === 'help') {
    return { exitCode: EXIT_CODES.OK, output: usageResult(requestId) };
  }

  const method =
    parsed.command === 'status'
      ? WUXIA_METHODS.STATUS
      : parsed.command === 'snapshot'
        ? WUXIA_METHODS.GET_SNAPSHOT
        : WUXIA_METHODS.RUN_TURN;
  const request = {
    id: requestId,
    method,
    ...(Object.keys(parsed.target).length === 0 ? {} : { target: parsed.target }),
    ...(method === WUXIA_METHODS.RUN_TURN
      ? { params: { input: parsed.input, ...parsed.turnOptions } }
      : { params: {} }),
  };
  const response = await call(request, {
    ...(parsed.url ? { url: parsed.url } : {}),
    ...(parsed.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: parsed.requestTimeoutMs }),
  });

  if (!isRecord(response) || response.ok !== true) {
    const error = isRecord(response?.error)
      ? response.error
      : { code: WUXIA_ERROR_CODES.INTERNAL, message: 'CLI 收到无效响应。', retryable: false };
    return {
      exitCode: getExitCodeForError(String(error.code)),
      output: { ok: false, command: parsed.command, requestId, error },
    };
  }

  if (method === WUXIA_METHODS.RUN_TURN && isRecord(response.result) && response.result.ok === false) {
    return {
      exitCode: EXIT_CODES.REMOTE_FAILURE,
      output: {
        ok: false,
        command: parsed.command,
        requestId,
        data: response.result,
        error: {
          code: 'TURN_FAILED',
          message: String(response.result.error ?? '酒馆端未能完成本轮剧情。'),
          retryable: false,
        },
      },
    };
  }

  return {
    exitCode: EXIT_CODES.OK,
    output: { ok: true, command: parsed.command, requestId, data: response.result },
  };
}

export { EXIT_CODES };

