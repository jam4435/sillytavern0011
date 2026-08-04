import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WUXIA_EVENT_NOTIFICATION_API_VERSION,
  WUXIA_EVENT_NOTIFICATION_EVENTS,
  type EventNotice,
  type WuxiaEventNotificationAdapterRegistration,
  type WuxiaEventNotificationApi,
} from '../../shared/wuxiaEventNotifications';
import { eventEmitMock } from '../test/setup';
import { useEventNotifications } from './useEventNotifications';

const notice: EventNotice = {
  version: WUXIA_EVENT_NOTIFICATION_API_VERSION,
  id: 'notice-1',
  source: 'event-script',
  kind: 'event-started',
  level: 'info',
  message: '事件开始',
  eventNames: ['测试事件'],
  durationMs: 2_000,
  createdAt: 1,
};

describe('useEventNotifications', () => {
  const unregister = vi.fn();
  let registration: WuxiaEventNotificationAdapterRegistration | null;
  let api: WuxiaEventNotificationApi;

  beforeEach(() => {
    unregister.mockReset();
    registration = null;
    api = {
      version: WUXIA_EVENT_NOTIFICATION_API_VERSION,
      registerAdapter: vi.fn(adapter => {
        registration = adapter;
        return unregister;
      }),
    };
    Object.assign(globalThis, {
      waitGlobalInitialized: vi.fn(async () => api),
    });
    eventEmitMock.mockClear();
  });

  it('发现桥、注册适配器并把结构化通知加入队列', async () => {
    const { result } = renderHook(() => useEventNotifications());
    expect(eventEmitMock).toHaveBeenCalledWith(WUXIA_EVENT_NOTIFICATION_EVENTS.DISCOVER);

    await act(async () => {
      await eventEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, {
        version: WUXIA_EVENT_NOTIFICATION_API_VERSION,
        bridgeId: 'bridge-1',
        globalName: 'WuxiaEventNotificationBridge_bridge-1',
        startedAt: 10,
      });
    });
    await waitFor(() => expect(api.registerAdapter).toHaveBeenCalledTimes(1));

    act(() => {
      expect(registration?.show(notice)).toBe(true);
    });
    expect(result.current.notifications).toEqual([notice]);

    act(() => result.current.dismissNotification(notice.id));
    expect(result.current.notifications).toEqual([]);
  });

  it('忽略旧桥迟到通知，且旧桥 disposed 不会注销新桥', async () => {
    const oldUnregister = vi.fn();
    const newUnregister = vi.fn();
    const oldApi: WuxiaEventNotificationApi = {
      version: 1,
      registerAdapter: vi.fn(() => oldUnregister),
    };
    const newApi: WuxiaEventNotificationApi = {
      version: 1,
      registerAdapter: vi.fn(() => newUnregister),
    };
    vi.mocked(globalThis.waitGlobalInitialized).mockImplementation(async globalName =>
      String(globalName).includes('new') ? newApi : oldApi,
    );

    renderHook(() => useEventNotifications());
    await act(async () => {
      await eventEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, {
        version: 1,
        bridgeId: 'bridge-new',
        globalName: 'bridge-new-global',
        startedAt: 20,
      });
    });
    await waitFor(() => expect(newApi.registerAdapter).toHaveBeenCalledTimes(1));

    await act(async () => {
      await eventEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, {
        version: 1,
        bridgeId: 'bridge-old',
        globalName: 'bridge-old-global',
        startedAt: 10,
      });
      await eventEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.DISPOSED, {
        version: 1,
        bridgeId: 'bridge-old',
        globalName: 'bridge-old-global',
      });
    });

    expect(oldApi.registerAdapter).not.toHaveBeenCalled();
    expect(newUnregister).not.toHaveBeenCalled();
  });

  it('卸载时注销当前适配器，之后的调用返回 false', async () => {
    const { unmount } = renderHook(() => useEventNotifications());
    await act(async () => {
      await eventEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, {
        version: 1,
        bridgeId: 'bridge-1',
        globalName: 'bridge-global',
        startedAt: 10,
      });
    });
    await waitFor(() => expect(registration).not.toBeNull());

    const adapter = registration;
    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(adapter?.show(notice)).toBe(false);
  });
});
