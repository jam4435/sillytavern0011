type PendingInternalMessageUpdate = {
  token: number;
  messageId?: number;
  expiresAt: number;
};

const INTERNAL_UPDATE_TTL_MS = 2_000;
const POST_WRITE_GRACE_MS = 250;

let nextToken = 0;
let pendingUpdates: PendingInternalMessageUpdate[] = [];

const pruneExpired = (now = Date.now()) => {
  pendingUpdates = pendingUpdates.filter(update => update.expiresAt >= now);
};

const readDetailMessageId = (detail: unknown): number | undefined => {
  if (Number.isInteger(detail)) {
    return Number(detail);
  }
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return undefined;
  }

  const record = detail as Record<string, unknown>;
  for (const key of ['message_id', 'messageId', 'id']) {
    const value = record[key];
    if (Number.isInteger(value)) {
      return Number(value);
    }
  }
  return undefined;
};

/**
 * 标记一次由项目内部主动触发的 setChatMessages 更新。
 *
 * ERA 会把 MESSAGE_UPDATED + GENERATION_STARTED 合并为 combo_sync；如果这里的
 * MESSAGE_UPDATED 实际只是“内部追加变量块 / 注入 MK”，就不能把它当成用户编辑历史。
 */
export const beginInternalMessageUpdate = (messageId?: number): number => {
  pruneExpired();
  const token = ++nextToken;
  pendingUpdates.push({
    token,
    messageId: Number.isInteger(messageId) ? Number(messageId) : undefined,
    expiresAt: Date.now() + INTERNAL_UPDATE_TTL_MS,
  });
  return token;
};

/**
 * setChatMessages promise 结束后再保留一个很短的宽限窗，兼容宿主把 MESSAGE_UPDATED
 * 放到后续任务派发的情况。若事件已被消费，此调用是 no-op。
 */
export const finishInternalMessageUpdate = (token: number): void => {
  pruneExpired();
  const pending = pendingUpdates.find(update => update.token === token);
  if (!pending) {
    return;
  }
  pending.expiresAt = Math.min(pending.expiresAt, Date.now() + POST_WRITE_GRACE_MS);
};

/**
 * 由 ERA 的事件入口调用。返回 true 代表这是项目内部预期的 MESSAGE_UPDATED，
 * 应直接吞掉，不能进入 combo_sync / resync。
 */
export const consumeInternalMessageUpdatedEvent = (detail: unknown): boolean => {
  pruneExpired();
  const detailMessageId = readDetailMessageId(detail);

  const index = pendingUpdates.findIndex(update => {
    if (detailMessageId === undefined || update.messageId === undefined) {
      return true;
    }
    return update.messageId === detailMessageId;
  });
  if (index < 0) {
    return false;
  }

  pendingUpdates.splice(index, 1);
  return true;
};

/** 测试/热重载清理，避免旧 runtime 遗留短期标记。 */
export const resetInternalMessageUpdateGuard = (): void => {
  pendingUpdates = [];
};
