import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../武侠/test/setup';
import { completeTurnEventsAndWait, WUXIA_TURN_EVENTS_SETTLED_EVENT } from './turnEventSettlement';

const identity = { roundId: 'round-1', chatId: 'chat-a', messageId: 2 };

describe('回合事件结算屏障', () => {
  afterEach(() => vi.useRealTimers());

  it('不会把 turn-completed 的派发返回误认为事件结算成功', async () => {
    let release!: () => void;
    const deferred = new Promise<void>(resolve => { release = resolve; });
    eventOn('wuxia:turn-completed', async () => {
      await deferred;
      await eventEmit(WUXIA_TURN_EVENTS_SETTLED_EVENT, { ...identity, status: 'success' });
    });

    let sealed = false;
    const pending = completeTurnEventsAndWait(identity).then(() => { sealed = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(sealed).toBe(false);
    release();
    await pending;
    expect(sealed).toBe(true);
    expect(eventEmitMock).toHaveBeenCalledWith('wuxia:turn-completed', identity);
  });

  it('不同 chat、round、message 的确认不会提前解锁', async () => {
    let completed = false;
    const pending = completeTurnEventsAndWait(identity).then(() => { completed = true; });
    for (const mismatch of [
      { ...identity, roundId: 'round-2', status: 'success' },
      { ...identity, chatId: 'chat-b', status: 'success' },
      { ...identity, messageId: 3, status: 'success' },
    ]) {
      await eventEmit(WUXIA_TURN_EVENTS_SETTLED_EVENT, mismatch);
    }
    expect(completed).toBe(false);
    await eventEmit(WUXIA_TURN_EVENTS_SETTLED_EVENT, { ...identity, status: 'success' });
    await pending;
    expect(completed).toBe(true);
  });

  it('结算失败或超时不能误封存', async () => {
    const failed = completeTurnEventsAndWait(identity);
    await eventEmit(WUXIA_TURN_EVENTS_SETTLED_EVENT, { ...identity, status: 'failed', error: '结算写入未确认' });
    await expect(failed).rejects.toThrow('结算写入未确认');

    vi.useFakeTimers();
    const timedOut = completeTurnEventsAndWait(identity, 50);
    const assertion = expect(timedOut).rejects.toThrow('事件脚本未在限定时间内确认');
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
  });
});
