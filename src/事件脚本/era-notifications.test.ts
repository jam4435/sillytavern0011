import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WUXIA_EVENT_NOTIFICATION_API_VERSION,
  WUXIA_EVENT_NOTIFICATION_EVENTS,
  type WuxiaEventNotificationApi,
} from '../shared/wuxiaEventNotifications';
import { eventEmitMock, eventOnMock } from '../武侠/test/setup';
import { initializeEventNotificationBridge, notifyEvent } from './era-notifications.js';

const initializeGlobalMock = vi.fn();
const toastr = {
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};

let disposeCurrent: (() => void) | null = null;

function startBridge() {
  const bridge = initializeEventNotificationBridge();
  disposeCurrent = bridge.dispose;
  return bridge;
}

describe('ERA 事件通知桥', () => {
  beforeEach(() => {
    initializeGlobalMock.mockReset();
    eventEmitMock.mockClear();
    eventOnMock.mockClear();
    Object.values(toastr).forEach(mock => mock.mockReset());
    Object.assign(globalThis, { initializeGlobal: initializeGlobalMock, toastr });
  });

  afterEach(() => {
    disposeCurrent?.();
    disposeCurrent = null;
  });

  it('发布动态全局接口，并通过 ready/discover/disposed 完成双向发现', async () => {
    const bridge = startBridge();

    expect(bridge.announcement).toEqual({
      version: WUXIA_EVENT_NOTIFICATION_API_VERSION,
      bridgeId: expect.any(String),
      globalName: expect.stringMatching(/^WuxiaEventNotification:/),
      startedAt: expect.any(Number),
    });
    expect(initializeGlobalMock).toHaveBeenCalledWith(bridge.announcement.globalName, bridge.api);
    expect(eventEmitMock).toHaveBeenCalledWith(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, bridge.announcement);

    eventEmitMock.mockClear();
    await eventEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.DISCOVER, { ownerId: 'frontend' });
    expect(eventEmitMock).toHaveBeenCalledWith(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, bridge.announcement);

    eventEmitMock.mockClear();
    bridge.dispose();
    bridge.dispose();
    expect(eventEmitMock).toHaveBeenCalledTimes(1);
    expect(eventEmitMock).toHaveBeenCalledWith(WUXIA_EVENT_NOTIFICATION_EVENTS.DISPOSED, bridge.announcement);
  });

  it('没有适配器时按原 toastr 参数恰好回退一次', () => {
    startBridge();

    expect(
      notifyEvent({
        kind: 'event-started',
        level: 'info',
        message: '📜 事件开始: 测试事件',
        eventNames: ['测试事件'],
        durationMs: 2000,
      }),
    ).toBe(false);

    expect(toastr.info).toHaveBeenCalledTimes(1);
    expect(toastr.info).toHaveBeenCalledWith('📜 事件开始: 测试事件', '', { timeOut: 2000 });
  });

  it('适配器同步返回 true 时传递完整 v1 payload 且不显示 toastr', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_723_000_000_000);
    const { api } = startBridge();
    const show = vi.fn(() => true);
    api.registerAdapter({ ownerId: 'frontend', mountedAt: 100, show });

    expect(
      notifyEvent({
        kind: 'event-completed',
        level: 'success',
        message: '✅ 事件完成: 测试事件',
        eventNames: ['测试事件'],
        durationMs: 3000,
      }),
    ).toBe(true);

    expect(show).toHaveBeenCalledWith({
      version: 1,
      id: expect.stringMatching(/^era-notice-/),
      source: 'event-script',
      kind: 'event-completed',
      level: 'success',
      message: '✅ 事件完成: 测试事件',
      eventNames: ['测试事件'],
      durationMs: 3000,
      createdAt: 1_723_000_000_000,
    });
    expect(toastr.success).not.toHaveBeenCalled();
  });

  it.each([
    ['返回 false', vi.fn(() => false)],
    ['返回非布尔值', vi.fn(() => undefined)],
    [
      '抛出异常',
      vi.fn(() => {
        throw new Error('adapter failed');
      }),
    ],
  ])('适配器%s时立即回退且不向业务抛错', (_label, show) => {
    const { api } = startBridge();
    api.registerAdapter({ ownerId: 'frontend', mountedAt: 100, show });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => notifyEvent({ kind: 'player-entered-event', level: 'warning', message: '玩家已到场' })).not.toThrow();
    expect(toastr.warning).toHaveBeenCalledTimes(1);
    expect(toastr.warning).toHaveBeenCalledWith('玩家已到场');
  });

  it('显式不兼容版本注册无效并回退 toastr', () => {
    const { api } = startBridge();
    const show = vi.fn(() => true);
    api.registerAdapter({ version: 2, ownerId: 'future-ui', mountedAt: 100, show } as never);

    notifyEvent({ kind: 'event-data-error', level: 'error', message: '事件数据错误' });

    expect(show).not.toHaveBeenCalled();
    expect(toastr.error).toHaveBeenCalledTimes(1);
  });

  it('只保留最新 mountedAt，且旧注销函数不能清除新实例', () => {
    const { api } = startBridge();
    const oldShow = vi.fn(() => true);
    const newShow = vi.fn(() => true);
    const staleShow = vi.fn(() => true);
    const unregisterOld = api.registerAdapter({ ownerId: 'old', mountedAt: 100, show: oldShow });
    const unregisterNew = api.registerAdapter({ ownerId: 'new', mountedAt: 200, show: newShow });
    api.registerAdapter({ ownerId: 'stale', mountedAt: 150, show: staleShow });

    unregisterOld();
    notifyEvent({ kind: 'system-ready', level: 'success', message: '桥已就绪' });
    expect(newShow).toHaveBeenCalledTimes(1);
    expect(oldShow).not.toHaveBeenCalled();
    expect(staleShow).not.toHaveBeenCalled();

    unregisterNew();
    unregisterNew();
    notifyEvent({ kind: 'system-ready', level: 'success', message: '已卸载' });
    expect(toastr.success).toHaveBeenCalledTimes(1);
  });

  it('事件脚本重载会使旧 API 失效，并仅由新桥处理后续注册', () => {
    const oldBridge = startBridge();
    const oldShow = vi.fn(() => true);
    oldBridge.api.registerAdapter({ ownerId: 'old-ui', mountedAt: 100, show: oldShow });
    eventEmitMock.mockClear();

    const newBridge = initializeEventNotificationBridge();
    disposeCurrent = newBridge.dispose;
    const newShow = vi.fn(() => true);
    const staleLateShow = vi.fn(() => true);
    newBridge.api.registerAdapter({ ownerId: 'new-ui', mountedAt: 200, show: newShow });
    oldBridge.api.registerAdapter({ ownerId: 'late-old-ui', mountedAt: 300, show: staleLateShow });

    expect(eventEmitMock.mock.calls).toEqual([
      [WUXIA_EVENT_NOTIFICATION_EVENTS.DISPOSED, oldBridge.announcement],
      [WUXIA_EVENT_NOTIFICATION_EVENTS.READY, newBridge.announcement],
    ]);
    notifyEvent({ kind: 'system-ready', level: 'success', message: '新桥' });
    expect(newShow).toHaveBeenCalledTimes(1);
    expect(oldShow).not.toHaveBeenCalled();
    expect(staleLateShow).not.toHaveBeenCalled();
  });

  it('toastr 自身抛错也不会传播到事件业务', () => {
    startBridge();
    toastr.error.mockImplementationOnce(() => {
      throw new Error('toast failed');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => notifyEvent({ kind: 'event-data-error', level: 'error', message: '数据错误' })).not.toThrow();
  });

  it('公开 API 的最小结构只要求 version 与 registerAdapter', () => {
    const compatibleApi: WuxiaEventNotificationApi = {
      version: WUXIA_EVENT_NOTIFICATION_API_VERSION,
      registerAdapter: () => () => undefined,
    };

    expect(compatibleApi.version).toBe(1);
  });
});
