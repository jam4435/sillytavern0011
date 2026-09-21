import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginInternalMessageUpdate,
  consumeInternalMessageUpdatedEvent,
  finishInternalMessageUpdate,
  resetInternalMessageUpdateGuard,
} from './internalMessageUpdateGuard';

describe('internalMessageUpdateGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    resetInternalMessageUpdateGuard();
  });

  it('会消费对应的内部 MESSAGE_UPDATED，且只消费一次', () => {
    beginInternalMessageUpdate(28);

    expect(consumeInternalMessageUpdatedEvent({ message_id: 28 })).toBe(true);
    expect(consumeInternalMessageUpdatedEvent({ message_id: 28 })).toBe(false);
  });

  it('有明确 messageId 时不会吞掉其他楼层的用户编辑', () => {
    beginInternalMessageUpdate(28);

    expect(consumeInternalMessageUpdatedEvent({ message_id: 27 })).toBe(false);
    expect(consumeInternalMessageUpdatedEvent({ message_id: 28 })).toBe(true);
  });

  it('setChatMessages 返回后只保留短宽限窗，不会长期吞掉后续编辑', () => {
    const token = beginInternalMessageUpdate(28);
    finishInternalMessageUpdate(token);

    vi.advanceTimersByTime(251);

    expect(consumeInternalMessageUpdatedEvent({ message_id: 28 })).toBe(false);
  });
});
