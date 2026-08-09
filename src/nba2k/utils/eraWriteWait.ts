import { scheduleUnthrottledTimeout } from '../../shared/unthrottledTimer';

export interface EraWriteDoneDetail {
  message_id?: number | null;
  actions?: Record<string, unknown>;
  statWithoutMeta?: Record<string, unknown>;
}

export interface EraWriteObserver {
  waitForMessageId(messageId: number, timeoutMs?: number): Promise<EraWriteDoneDetail>;
  stop(): void;
}

/** 先监听再创建 assistant，避免 ERA 写入过快导致丢失完成信号。 */
export function observeEraWriteDone(expectedAction = 'resync'): EraWriteObserver {
  const buffered = new Map<number, EraWriteDoneDetail>();
  let stopped = false;
  let pending:
    | {
        messageId: number;
        resolve: (detail: EraWriteDoneDetail) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof scheduleUnthrottledTimeout>;
      }
    | undefined;

  const registration = eventOn('era:writeDone', (detail: unknown) => {
    if (stopped || !detail || typeof detail !== 'object' || Array.isArray(detail)) return;
    const writeDone = detail as EraWriteDoneDetail;
    if (!Number.isInteger(writeDone.message_id) || writeDone.actions?.[expectedAction] !== true) return;
    const messageId = Number(writeDone.message_id);
    if (pending?.messageId === messageId) {
      const current = pending;
      pending = undefined;
      current.timer.cancel();
      current.resolve(writeDone);
      return;
    }
    buffered.set(messageId, writeDone);
    while (buffered.size > 8) buffered.delete(buffered.keys().next().value!);
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    registration.stop();
    buffered.clear();
    if (pending) {
      const current = pending;
      pending = undefined;
      current.timer.cancel();
      current.reject(new Error('ERA 写入观察已停止。'));
    }
  };

  return {
    waitForMessageId(messageId, timeoutMs = 20_000) {
      if (stopped) return Promise.reject(new Error('ERA 写入观察已停止。'));
      const bufferedDetail = buffered.get(messageId);
      if (bufferedDetail) {
        buffered.delete(messageId);
        return Promise.resolve(bufferedDetail);
      }
      if (pending) return Promise.reject(new Error('已有 ERA 写入正在等待。'));
      return new Promise<EraWriteDoneDetail>((resolve, reject) => {
        const timer = scheduleUnthrottledTimeout(() => {
          if (pending?.messageId !== messageId) return;
          pending = undefined;
          reject(new Error(`ERA 在 ${timeoutMs}ms 内未确认 assistant 楼层 ${messageId} 的变量写入。`));
        }, timeoutMs);
        pending = { messageId, resolve, reject, timer };
      });
    },
    stop,
  };
}
