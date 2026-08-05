import { recordIframeLifecycleEvent } from './iframeLifecycleBlackBox';

export const WUXIA_TURN_LIFECYCLE_EVENT = 'wuxia:turn-lifecycle';
export const WUXIA_TURN_LOCK_ACK_EVENT = 'wuxia:turn-lock-ack';
export const WUXIA_TURN_LOCK_ACK_TIMEOUT_MS = 2_000;

export interface WuxiaTurnLockAck {
  phase: 'locked';
  roundId: string;
  chatId?: string;
  scriptRuntimeId?: string;
  lockedAt?: number;
}

type TurnLifecycleEmitFailure = {
  kind: 'emit-error';
  error: unknown;
};

function waitForTurnLifecycleEmitFailure(payload: Record<string, unknown>): Promise<TurnLifecycleEmitFailure> {
  return new Promise(resolve => {
    void Promise.resolve()
      .then(() => eventEmit(WUXIA_TURN_LIFECYCLE_EVENT, payload))
      .catch(error => resolve({ kind: 'emit-error', error }));
  });
}

function isMatchingAck(value: unknown, roundId: string): value is WuxiaTurnLockAck {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ack = value as Partial<WuxiaTurnLockAck>;
  return ack.phase === 'locked' && ack.roundId === roundId;
}

export async function acquireWuxiaTurnLock(
  roundId: string,
  chatId: string,
  timeoutMs = WUXIA_TURN_LOCK_ACK_TIMEOUT_MS,
): Promise<WuxiaTurnLockAck> {
  recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-requested', { roundId, chatId, timeoutMs });

  let timer: number | undefined;
  let registration: EventOnReturn | undefined;
  const ackPromise = new Promise<WuxiaTurnLockAck | null>(resolve => {
    registration = eventOn(WUXIA_TURN_LOCK_ACK_EVENT, (detail: unknown) => {
      if (!isMatchingAck(detail, roundId)) {
        recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-ack-ignored', {
          expectedRoundId: roundId,
          receivedRoundId:
            detail && typeof detail === 'object' && !Array.isArray(detail)
              ? String((detail as Record<string, unknown>).roundId ?? '')
              : '',
        });
        return;
      }
      resolve(detail);
    });
    timer = window.setTimeout(() => resolve(null), Math.max(100, timeoutMs));
  });

  try {
    const outcome = await Promise.race([
      ackPromise.then(ack => ({ kind: 'ack' as const, ack })),
      waitForTurnLifecycleEmitFailure({ phase: 'start', roundId, chatId }),
    ]);
    if (outcome.kind === 'emit-error') {
      recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-emit-failed', {
        roundId,
        chatId,
        error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
      });
      throw new Error(
        `发送武侠回合锁请求失败：${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`,
      );
    }
    const { ack } = outcome;
    if (!ack) {
      recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-ack-timeout', { roundId, chatId, timeoutMs });
      throw new Error('武侠回合锁未确认，为避免生成过程中替换 iframe，本轮尚未创建用户楼层。');
    }
    recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-acknowledged', {
      roundId,
      chatId,
      scriptRuntimeId: ack.scriptRuntimeId ?? '',
      lockedAt: ack.lockedAt ?? null,
    });
    return ack;
  } finally {
    registration?.stop();
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

export async function releaseWuxiaTurnLock(
  roundId: string,
  chatId: string,
  messageId: number | null,
  timeoutMs = WUXIA_TURN_LOCK_ACK_TIMEOUT_MS,
): Promise<void> {
  recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-release-requested', { roundId, chatId, messageId });
  let timer: number | undefined;
  const emission = Promise.resolve()
    .then(() =>
      eventEmit(WUXIA_TURN_LIFECYCLE_EVENT, {
        phase: 'finish',
        roundId,
        chatId,
        messageId,
      }),
    )
    .then(
      () => ({ kind: 'sent' as const }),
      error => ({ kind: 'emit-error' as const, error }),
    );
  const timeout = new Promise<{ kind: 'timeout' }>(resolve => {
    timer = window.setTimeout(() => resolve({ kind: 'timeout' }), Math.max(100, timeoutMs));
  });
  const outcome = await Promise.race([emission, timeout]);
  if (timer !== undefined) window.clearTimeout(timer);

  if (outcome.kind === 'emit-error') {
    throw outcome.error;
  }
  if (outcome.kind === 'timeout') {
    recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-release-emit-timeout', {
      roundId,
      chatId,
      messageId,
      timeoutMs,
    });
    return;
  }
  recordIframeLifecycleEvent('wuxia-frontend', 'turn-lock-released', { roundId, chatId, messageId });
}
