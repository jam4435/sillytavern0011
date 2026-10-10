/**
 * 回合事件稳定屏障：事件脚本必须在其串行检查、结算及线索计数真正结束后确认。
 * 不能用 eventEmit('wuxia:turn-completed') 的返回值代替事件处理完成。
 */
import { recordEraDiagnostic } from '../ERA变量框架/utils/diagnostics';

export const WUXIA_TURN_EVENTS_SETTLED_EVENT = 'wuxia:turn-events-settled';

export interface WuxiaTurnIdentity {
  roundId: string;
  chatId: string;
  messageId: number;
}

export interface WuxiaTurnEventSettlement extends WuxiaTurnIdentity {
  status: 'success' | 'failed';
  error?: string;
}

export async function completeTurnEventsAndWait(
  identity: WuxiaTurnIdentity,
  timeoutMs = 45_000,
): Promise<void> {
  let listener: { stop: () => void } | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let completed = false;

  const cleanup = () => {
    listener?.stop();
    listener = null;
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
  };

  const wait = new Promise<void>((resolve, reject) => {
    const complete = (error?: Error) => {
      if (completed) return;
      completed = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    listener = eventOn(WUXIA_TURN_EVENTS_SETTLED_EVENT, (detail: WuxiaTurnEventSettlement) => {
      if (
        detail?.roundId !== identity.roundId ||
        detail.chatId !== identity.chatId ||
        detail.messageId !== identity.messageId
      ) return;

      complete(
        detail.status === 'success'
          ? undefined
          : new Error(detail.error || '事件脚本未能确认本回合的事件状态稳定'),
      );
    });
    timeout = setTimeout(() => {
      recordEraDiagnostic('wuxia-turn-settlement', 'turn-events-settlement-timeout', {
        ...identity,
        timeoutMs,
      });
      complete(new Error('事件脚本未在限定时间内确认结算，历史节点暂不封存'));
    }, timeoutMs);
  });

  // 已提前监听确认事件，故即使宿主 eventEmit 不等待异步监听器也不会提前封存。
  // 派发链报错不等同于事件未提交；仍以显式确认或超时为准。
  try {
    void Promise.resolve(eventEmit('wuxia:turn-completed', identity)).catch(error => {
      recordEraDiagnostic('wuxia-turn-settlement', 'turn-completed-dispatch-error', {
        ...identity,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    cleanup();
    void wait.catch(() => {});
    throw error;
  }
  await wait;
}
