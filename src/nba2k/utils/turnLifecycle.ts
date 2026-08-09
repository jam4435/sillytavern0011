export const NBA2K_TURN_LIFECYCLE_EVENT = 'nba2k:turn-lifecycle';
export const NBA2K_TURN_LOCK_ACK_EVENT = 'nba2k:turn-lock-ack';
export const NBA2K_SYNC_SHELL_EVENT = 'nba2k:sync-latest-message-shell';

export interface Nba2kTurnLockAck {
  phase: 'locked';
  roundId: string;
  chatId?: string;
  scriptRuntimeId?: string;
}

function isMatchingAck(value: unknown, roundId: string): value is Nba2kTurnLockAck {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ack = value as Partial<Nba2kTurnLockAck>;
  return ack.phase === 'locked' && ack.roundId === roundId;
}

export async function acquireTurnLock(roundId: string, chatId: string, timeoutMs = 2_000): Promise<void> {
  let timer: number | undefined;
  let registration: EventOnReturn | undefined;
  const ack = new Promise<Nba2kTurnLockAck | null>(resolve => {
    registration = eventOn(NBA2K_TURN_LOCK_ACK_EVENT, (detail: unknown) => {
      if (isMatchingAck(detail, roundId)) resolve(detail);
    });
    timer = window.setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    await eventEmit(NBA2K_TURN_LIFECYCLE_EVENT, { phase: 'start', roundId, chatId });
    if (!(await ack)) {
      throw new Error('NBA2K 回合锁未确认，为避免生成期间替换游戏 iframe，本轮已取消。');
    }
  } finally {
    registration?.stop();
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

export async function releaseTurnLock(roundId: string, chatId: string, messageId: number | null): Promise<void> {
  await eventEmit(NBA2K_TURN_LIFECYCLE_EVENT, { phase: 'finish', roundId, chatId, messageId });
  if (messageId !== null) await eventEmit(NBA2K_SYNC_SHELL_EVENT, messageId);
}
