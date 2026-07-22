import type { LatestDebugRound } from '../hooks/useDebugLogs';
import type { PageState } from '../types';
import { readIframeLifecycleBlackBox, type IframeLifecycleBlackBoxEntry } from './iframeLifecycleBlackBox';
import type { VariableChangeSummary, VariableComparisonStatus } from './variableChanges';

export const WUXIA_AUTOMATION_API_VERSION = 1 as const;

const DEFAULT_SETTLE_TIMEOUT_MS = 10_000;
const DEFAULT_SETTLE_DELAY_MS = 120;
const MAX_SETTLE_TIMEOUT_MS = 30_000;
const RECENT_MESSAGE_LIMIT = 8;
const VARIABLE_DECLARATION_REGEX = /<Variable(?:Insert|Edit|Delete)>/i;

type ChatRole = 'system' | 'assistant' | 'user';

type ChatMessageWithSwipes = {
  message_id?: number;
  role?: ChatRole;
  is_hidden?: boolean;
  message?: string;
  mes?: string;
  swipes?: string[];
  swipe_id?: number;
};

type WriteSignalDetail = {
  message_id?: number | null;
  actions?: Record<string, unknown>;
  source?: unknown;
  attribution?: unknown;
};

export interface WuxiaAutomationRuntimeState {
  page: PageState;
  busy: boolean;
  maintext: string;
  options: string[];
  latestDebugRound: LatestDebugRound | null;
  variableChanges: VariableChangeSummary | null;
  turnTimeoutMs: number;
}

export interface WuxiaAutomationRecentMessage {
  messageId: number;
  role: ChatRole | 'unknown';
  text: string;
  swipeId: number;
}

export interface WuxiaAutomationSnapshot {
  version: typeof WUXIA_AUTOMATION_API_VERSION;
  ready: boolean;
  page: PageState;
  busy: boolean;
  turnTimeoutMs: number;
  chatId: string;
  maintext: string;
  options: string[];
  statData: Record<string, unknown> | null;
  debug: LatestDebugRound | null;
  variableChanges: VariableChangeSummary | null;
  recentMessages: WuxiaAutomationRecentMessage[];
  iframeLifecycle: IframeLifecycleBlackBoxEntry[];
  capturedAt: number;
}

export type WuxiaAutomationWriteSignalName =
  'era:writeDone' | 'wuxia:eraVariableWriteDone' | 'wuxia:directVariableWriteDone';

export interface WuxiaAutomationWriteSignal {
  name: WuxiaAutomationWriteSignalName;
  observedAt: number;
  messageId?: number;
  actions: string[];
  source?: string;
  attribution?: 'ai' | 'background';
}

export type WuxiaAutomationVariableVerdict = 'not-requested' | 'applied' | 'failed' | 'inconclusive';

export interface WuxiaAutomationVariableVerification {
  expected: boolean;
  signalObserved: boolean;
  timedOut: boolean;
  verdict: WuxiaAutomationVariableVerdict;
  declaredCount: number;
  comparisonStatusCounts: Partial<Record<VariableComparisonStatus, number>>;
  parseErrors: string[];
  signals: WuxiaAutomationWriteSignal[];
}

export interface WuxiaAutomationRunTurnOptions {
  /** 等待匹配变量写入信号的最长时间。范围 0-30000ms。 */
  settleTimeoutMs?: number;
  /** 匹配信号后留给变量追踪器回读的安静时间。范围 0-1000ms。 */
  settleDelayMs?: number;
}

export interface WuxiaAutomationTurnReport {
  ok: boolean;
  requestId: string;
  input: string;
  chatId: string;
  startedAt: number;
  finishedAt: number;
  userMessageId?: number;
  assistantMessageId?: number;
  rawReply: string;
  statDataBefore: Record<string, unknown> | null;
  statDataAfter: Record<string, unknown> | null;
  debug: LatestDebugRound | null;
  variableChanges: VariableChangeSummary | null;
  variableVerification: WuxiaAutomationVariableVerification;
  error?: string;
}

export interface WuxiaAutomationApi {
  readonly version: typeof WUXIA_AUTOMATION_API_VERSION;
  getSnapshot(): WuxiaAutomationSnapshot;
  runTurn(input: string, options?: WuxiaAutomationRunTurnOptions): Promise<WuxiaAutomationTurnReport>;
}

export interface WuxiaAutomationDependencies {
  getRuntimeState: () => WuxiaAutomationRuntimeState;
  runPlayerTurn: (input: string) => Promise<string>;
}

export class WuxiaAutomationDisposedError extends Error {
  constructor() {
    super('武侠自动化实例已换代，当前回合需要通过持久化快照确认结果。');
    this.name = 'WuxiaAutomationDisposedError';
  }
}

type WriteSignalObserver = {
  signals: WuxiaAutomationWriteSignal[];
  waitForAssistantWrite: (assistantMessageId: number | undefined, timeoutMs: number) => Promise<boolean>;
  stop: () => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function cloneForAutomation<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
  } catch {
    // 回退到 JSON；游戏变量和调试对象本就应为可序列化数据。
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeDuration(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(0, Math.round(value)));
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function readChatId(): string {
  try {
    const currentWindow = globalThis as typeof globalThis & {
      SillyTavern?: { getCurrentChatId?: () => string | number | null | undefined };
    };
    const parentWindow =
      typeof window === 'undefined'
        ? undefined
        : (window.parent as Window &
            typeof globalThis & {
              SillyTavern?: { getCurrentChatId?: () => string | number | null | undefined };
            });
    const chatId = currentWindow.SillyTavern?.getCurrentChatId?.() ?? parentWindow?.SillyTavern?.getCurrentChatId?.();
    return chatId === null || chatId === undefined ? 'unknown' : String(chatId);
  } catch {
    return 'unknown';
  }
}

function readStatData(): Record<string, unknown> | null {
  try {
    const variables = getVariables({ type: 'chat' }) as Record<string, unknown> | null | undefined;
    return isRecord(variables?.stat_data) ? cloneForAutomation(variables.stat_data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const swipeId = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return message.message || message.mes || swipes[swipeId] || swipes[0] || '';
}

function readAllMessages(): ChatMessageWithSwipes[] {
  try {
    return getChatMessages('0-{{lastMessageId}}', {
      hide_state: 'all',
      include_swipes: true,
    }) as ChatMessageWithSwipes[];
  } catch {
    return [];
  }
}

function getLatestMessageId(messages: ChatMessageWithSwipes[]): number {
  return messages.reduce(
    (latest, message) => (Number.isInteger(message.message_id) ? Math.max(latest, Number(message.message_id)) : latest),
    -1,
  );
}

function findNewestMessageAfter(
  messages: ChatMessageWithSwipes[],
  previousLatestMessageId: number,
  role: ChatRole,
): ChatMessageWithSwipes | undefined {
  return [...messages]
    .reverse()
    .find(
      message =>
        message.role === role &&
        Number.isInteger(message.message_id) &&
        Number(message.message_id) > previousLatestMessageId,
    );
}

function toRecentMessages(messages: ChatMessageWithSwipes[]): WuxiaAutomationRecentMessage[] {
  return messages
    .filter(message => Number.isInteger(message.message_id))
    .slice(-RECENT_MESSAGE_LIMIT)
    .map(message => ({
      messageId: Number(message.message_id),
      role:
        message.role === 'system' || message.role === 'assistant' || message.role === 'user' ? message.role : 'unknown',
      text: getActiveMessageText(message),
      swipeId: Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0,
    }));
}

function normalizeWriteSignal(
  name: WuxiaAutomationWriteSignalName,
  unknownDetail: unknown,
): WuxiaAutomationWriteSignal {
  const detail = isRecord(unknownDetail) ? (unknownDetail as WriteSignalDetail) : {};
  const actions = isRecord(detail.actions)
    ? Object.entries(detail.actions)
        .filter(([, enabled]) => enabled === true)
        .map(([action]) => action)
    : [];
  const messageId = Number.isInteger(detail.message_id) ? Number(detail.message_id) : undefined;
  const source = typeof detail.source === 'string' ? detail.source : undefined;
  const attribution =
    detail.attribution === 'ai' || detail.attribution === 'background' ? detail.attribution : undefined;
  return {
    name,
    observedAt: Date.now(),
    ...(messageId === undefined ? {} : { messageId }),
    actions,
    ...(source ? { source } : {}),
    ...(attribution ? { attribution } : {}),
  };
}

function signalMatchesAssistant(signal: WuxiaAutomationWriteSignal, assistantMessageId: number | undefined): boolean {
  if (signal.attribution === 'background' || signal.name === 'wuxia:directVariableWriteDone') {
    return false;
  }
  if (assistantMessageId === undefined || signal.messageId === undefined) {
    return signal.name === 'era:writeDone' || signal.attribution === 'ai';
  }
  return signal.messageId === assistantMessageId;
}

function createWriteSignalObserver(): WriteSignalObserver {
  const signals: WuxiaAutomationWriteSignal[] = [];
  const waiters = new Set<() => void>();
  const names: WuxiaAutomationWriteSignalName[] = [
    'era:writeDone',
    'wuxia:eraVariableWriteDone',
    'wuxia:directVariableWriteDone',
  ];
  const registrations = names.map(name =>
    eventOn(name, (detail: unknown) => {
      signals.push(normalizeWriteSignal(name, detail));
      waiters.forEach(notify => notify());
    }),
  );

  return {
    signals,
    waitForAssistantWrite: (assistantMessageId, timeoutMs) => {
      if (signals.some(signal => signalMatchesAssistant(signal, assistantMessageId))) {
        return Promise.resolve(true);
      }
      if (timeoutMs <= 0) {
        return Promise.resolve(false);
      }

      return new Promise(resolve => {
        let settled = false;
        const finish = (observed: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          waiters.delete(check);
          window.clearTimeout(timer);
          resolve(observed);
        };
        const check = () => {
          if (signals.some(signal => signalMatchesAssistant(signal, assistantMessageId))) {
            finish(true);
          }
        };
        const timer = window.setTimeout(() => finish(false), timeoutMs);
        waiters.add(check);
      });
    },
    stop: () => {
      registrations.forEach(registration => registration.stop());
      waiters.clear();
    },
  };
}

function getComparisonStatusCounts(
  variableChanges: VariableChangeSummary | null,
): Partial<Record<VariableComparisonStatus, number>> {
  return (variableChanges?.aiReply.comparisons ?? []).reduce<Partial<Record<VariableComparisonStatus, number>>>(
    (counts, comparison) => {
      counts[comparison.status] = (counts[comparison.status] ?? 0) + 1;
      return counts;
    },
    {},
  );
}

function getVariableVerification(
  expected: boolean,
  signalObserved: boolean,
  timedOut: boolean,
  signals: WuxiaAutomationWriteSignal[],
  variableChanges: VariableChangeSummary | null,
): WuxiaAutomationVariableVerification {
  const declaredCount = variableChanges?.aiReply.declaredChanges.length ?? 0;
  const comparisons = variableChanges?.aiReply.comparisons ?? [];
  const parseErrors = variableChanges?.parseErrors ?? [];
  const comparisonStatusCounts = getComparisonStatusCounts(variableChanges);
  const hasFailedComparison = comparisons.some(
    comparison => comparison.status === 'not-applied' || comparison.status === 'diverged',
  );
  const allDeclaredApplied =
    declaredCount > 0 &&
    comparisons.length >= declaredCount &&
    comparisons.every(comparison => comparison.status === 'applied' || comparison.status === 'no-op');

  let verdict: WuxiaAutomationVariableVerdict = 'not-requested';
  if (expected) {
    if (parseErrors.length > 0 || hasFailedComparison) {
      verdict = 'failed';
    } else if (allDeclaredApplied) {
      verdict = 'applied';
    } else {
      verdict = 'inconclusive';
    }
  }

  return {
    expected,
    signalObserved,
    timedOut,
    verdict,
    declaredCount,
    comparisonStatusCounts,
    parseErrors: cloneForAutomation(parseErrors),
    signals: cloneForAutomation(signals),
  };
}

function createFailureVerification(): WuxiaAutomationVariableVerification {
  return {
    expected: false,
    signalObserved: false,
    timedOut: false,
    verdict: 'not-requested',
    declaredCount: 0,
    comparisonStatusCounts: {},
    parseErrors: [],
    signals: [],
  };
}

function getDebugError(debug: LatestDebugRound | null): string {
  if (debug?.main.status === 'error') {
    return debug.main.error || '正文生成失败。';
  }
  if (debug?.variable.status === 'error') {
    return debug.variable.error || '变量更新失败。';
  }
  return '';
}

export function createWuxiaAutomation(dependencies: WuxiaAutomationDependencies): {
  api: WuxiaAutomationApi;
  dispose: () => void;
} {
  let disposed = false;
  let activeRequestId: string | null = null;
  const disposeWaiters = new Set<() => void>();

  const settleOnDispose = <T>(operation: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        disposeWaiters.delete(rejectForDispose);
        callback();
      };
      const rejectForDispose = () => finish(() => reject(new WuxiaAutomationDisposedError()));

      disposeWaiters.add(rejectForDispose);
      if (disposed) {
        rejectForDispose();
        return;
      }
      operation.then(
        value => finish(() => resolve(value)),
        error => finish(() => reject(error)),
      );
    });

  const getSnapshot = (): WuxiaAutomationSnapshot => {
    const runtime = dependencies.getRuntimeState();
    const messages = readAllMessages();
    return {
      version: WUXIA_AUTOMATION_API_VERSION,
      ready: !disposed,
      page: runtime.page,
      busy: disposed || runtime.busy || activeRequestId !== null,
      turnTimeoutMs: runtime.turnTimeoutMs,
      chatId: readChatId(),
      maintext: runtime.maintext,
      options: cloneForAutomation(runtime.options),
      statData: readStatData(),
      debug: cloneForAutomation(runtime.latestDebugRound),
      variableChanges: cloneForAutomation(runtime.variableChanges),
      recentMessages: toRecentMessages(messages),
      iframeLifecycle: cloneForAutomation(readIframeLifecycleBlackBox().slice(-80)),
      capturedAt: Date.now(),
    };
  };

  const runTurn = async (
    unknownInput: string,
    options: WuxiaAutomationRunTurnOptions = {},
  ): Promise<WuxiaAutomationTurnReport> => {
    const input = typeof unknownInput === 'string' ? unknownInput.trim() : '';
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const startedAt = Date.now();
    const chatId = readChatId();
    const statDataBefore = readStatData();
    const runtimeAtStart = dependencies.getRuntimeState();
    const fail = (error: string): WuxiaAutomationTurnReport => ({
      ok: false,
      requestId,
      input,
      chatId,
      startedAt,
      finishedAt: Date.now(),
      rawReply: '',
      statDataBefore,
      statDataAfter: readStatData(),
      debug: cloneForAutomation(runtimeAtStart.latestDebugRound),
      variableChanges: cloneForAutomation(runtimeAtStart.variableChanges),
      variableVerification: createFailureVerification(),
      error,
    });

    if (disposed) {
      return fail('武侠自动化接口已卸载，请等待当前游戏界面重新初始化。');
    }
    if (!input) {
      return fail('玩家行动不能为空。');
    }
    if (runtimeAtStart.page !== 'game') {
      return fail(`当前页面为 ${runtimeAtStart.page}，只有进入游戏主界面后才能推进剧情。`);
    }
    if (runtimeAtStart.busy || activeRequestId !== null) {
      return fail('当前已有生成或自动化回合正在运行。');
    }

    activeRequestId = requestId;
    const previousMessages = readAllMessages();
    const previousLatestMessageId = getLatestMessageId(previousMessages);
    const observer = createWriteSignalObserver();

    try {
      const rawReply = await settleOnDispose(dependencies.runPlayerTurn(input));
      const messagesAfterTurn = readAllMessages();
      const userMessage = findNewestMessageAfter(messagesAfterTurn, previousLatestMessageId, 'user');
      const assistantMessage = findNewestMessageAfter(messagesAfterTurn, previousLatestMessageId, 'assistant');
      const assistantMessageId = Number.isInteger(assistantMessage?.message_id)
        ? Number(assistantMessage?.message_id)
        : undefined;
      const runtimeAfterTurn = dependencies.getRuntimeState();
      const debugAfterTurn = runtimeAfterTurn.latestDebugRound;
      const expectedVariableWrite = VARIABLE_DECLARATION_REGEX.test(
        [rawReply, debugAfterTurn?.variable.appendedBlocks ?? ''].join('\n'),
      );
      const settleTimeoutMs = normalizeDuration(
        options.settleTimeoutMs,
        DEFAULT_SETTLE_TIMEOUT_MS,
        MAX_SETTLE_TIMEOUT_MS,
      );
      const signalObserved = expectedVariableWrite
        ? await observer.waitForAssistantWrite(assistantMessageId, settleTimeoutMs)
        : observer.signals.some(signal => signalMatchesAssistant(signal, assistantMessageId));
      await delay(normalizeDuration(options.settleDelayMs, DEFAULT_SETTLE_DELAY_MS, 1_000));

      const runtimeSettled = dependencies.getRuntimeState();
      const debug = cloneForAutomation(runtimeSettled.latestDebugRound);
      const variableChanges = cloneForAutomation(runtimeSettled.variableChanges);
      const error = getDebugError(debug);
      const normalizedRawReply = typeof rawReply === 'string' ? rawReply : '';
      const variableVerification = getVariableVerification(
        expectedVariableWrite,
        signalObserved,
        expectedVariableWrite && !signalObserved,
        observer.signals,
        variableChanges,
      );

      return {
        ok: Boolean(normalizedRawReply.trim()) && !error,
        requestId,
        input,
        chatId,
        startedAt,
        finishedAt: Date.now(),
        ...(Number.isInteger(userMessage?.message_id) ? { userMessageId: Number(userMessage?.message_id) } : {}),
        ...(assistantMessageId === undefined ? {} : { assistantMessageId }),
        rawReply: normalizedRawReply,
        statDataBefore,
        statDataAfter: readStatData(),
        debug,
        variableChanges,
        variableVerification,
        ...(!normalizedRawReply.trim() || error ? { error: error || '本轮没有取得 AI 回复。' } : {}),
      };
    } catch (unknownError) {
      if (unknownError instanceof WuxiaAutomationDisposedError) {
        throw unknownError;
      }
      const runtime = dependencies.getRuntimeState();
      const error = unknownError instanceof Error ? unknownError.message : String(unknownError);
      return {
        ok: false,
        requestId,
        input,
        chatId,
        startedAt,
        finishedAt: Date.now(),
        rawReply: '',
        statDataBefore,
        statDataAfter: readStatData(),
        debug: cloneForAutomation(runtime.latestDebugRound),
        variableChanges: cloneForAutomation(runtime.variableChanges),
        variableVerification: createFailureVerification(),
        error,
      };
    } finally {
      observer.stop();
      if (activeRequestId === requestId) {
        activeRequestId = null;
      }
    }
  };

  return {
    api: {
      version: WUXIA_AUTOMATION_API_VERSION,
      getSnapshot,
      runTurn,
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      activeRequestId = null;
      disposeWaiters.forEach(rejectForDispose => rejectForDispose());
      disposeWaiters.clear();
    },
  };
}

declare global {
  interface Window {
    WuxiaAutomation?: WuxiaAutomationApi;
  }
}
