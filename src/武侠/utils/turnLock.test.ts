import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../test/setup';
import {
  WUXIA_TURN_LIFECYCLE_EVENT,
  WUXIA_TURN_LOCK_ACK_EVENT,
  acquireWuxiaTurnLock,
  releaseWuxiaTurnLock,
} from './turnLock';

describe('turnLock', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('收到同一 roundId 的 ACK 后才确认锁定', async () => {
    const lifecycleListener = eventOn(WUXIA_TURN_LIFECYCLE_EVENT, async (payload: Record<string, unknown>) => {
      if (payload.phase !== 'start') return;
      await eventEmit(WUXIA_TURN_LOCK_ACK_EVENT, {
        phase: 'locked',
        roundId: payload.roundId,
        scriptRuntimeId: 'hidden-runtime',
        lockedAt: 123,
      });
    });

    const ack = await acquireWuxiaTurnLock('round-1', 'chat-1', 100);
    await releaseWuxiaTurnLock('round-1', 'chat-1', 9);

    expect(ack).toMatchObject({ roundId: 'round-1', scriptRuntimeId: 'hidden-runtime' });
    lifecycleListener.stop();
  });

  it('未收到 ACK 时明确失败', async () => {
    vi.useFakeTimers();
    const lock = acquireWuxiaTurnLock('round-timeout', 'chat-1', 100);
    const assertion = expect(lock).rejects.toThrow('回合锁未确认');

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('eventEmit 本身不返回时仍按 ACK 上限失败', async () => {
    vi.useFakeTimers();
    const originalImplementation = eventEmitMock.getMockImplementation();
    eventEmitMock.mockImplementation(async eventName => {
      if (eventName === WUXIA_TURN_LIFECYCLE_EVENT) {
        await new Promise(() => {});
      }
    });

    try {
      const lock = acquireWuxiaTurnLock('round-hanging-emit', 'chat-1', 100);
      const assertion = expect(lock).rejects.toThrow('回合锁未确认');
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
    } finally {
      eventEmitMock.mockImplementation(originalImplementation!);
    }
  });

  it('释放事件不返回时不会让回合永久卡在 finally', async () => {
    vi.useFakeTimers();
    const originalImplementation = eventEmitMock.getMockImplementation();
    eventEmitMock.mockImplementation(async eventName => {
      if (eventName === WUXIA_TURN_LIFECYCLE_EVENT) {
        await new Promise(() => {});
      }
    });

    try {
      const release = releaseWuxiaTurnLock('round-release-timeout', 'chat-1', null, 100);
      const assertion = expect(release).resolves.toBeUndefined();
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
    } finally {
      eventEmitMock.mockImplementation(originalImplementation!);
    }
  });
});
