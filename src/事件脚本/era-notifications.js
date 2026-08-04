import {
  WUXIA_EVENT_NOTIFICATION_API_VERSION,
  WUXIA_EVENT_NOTIFICATION_EVENTS,
  WUXIA_EVENT_NOTIFICATION_GLOBAL_PREFIX,
} from '../shared/wuxiaEventNotifications';

const NOTICE_SOURCE = 'event-script';

let activeBridge = null;
let instanceSequence = 0;
let noticeSequence = 0;

function createInstanceId() {
  instanceSequence += 1;
  return `${Date.now().toString(36)}-${instanceSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safelyEmit(eventName, detail) {
  try {
    const result = globalThis.eventEmit?.(eventName, detail);
    if (result && typeof result.catch === 'function') {
      void result.catch(error => console.warn(`[ERA 通知桥] 发送 ${eventName} 失败。`, error));
    }
  } catch (error) {
    console.warn(`[ERA 通知桥] 发送 ${eventName} 失败。`, error);
  }
}

function fallbackToToastr(level, message, durationMs) {
  try {
    const showToast = globalThis.toastr?.[level];
    if (typeof showToast !== 'function') return;
    if (durationMs === undefined) {
      showToast.call(globalThis.toastr, message);
      return;
    }
    showToast.call(globalThis.toastr, message, '', { timeOut: durationMs });
  } catch (error) {
    console.error('[ERA 通知桥] 酒馆 toastr 回退失败。', error);
  }
}

function removeBridgeLifecycle(runtime) {
  try {
    runtime.discoverListener?.stop?.();
  } catch (error) {
    console.warn('[ERA 通知桥] 移除发现监听器失败。', error);
  }

  try {
    if (runtime.pagehideBinding === 'jquery') {
      globalThis.$?.(window).off(`pagehide.${runtime.pagehideNamespace}`, runtime.handlePagehide);
    } else if (runtime.pagehideBinding === 'native') {
      window.removeEventListener('pagehide', runtime.handlePagehide);
    }
  } catch (error) {
    console.warn('[ERA 通知桥] 移除 pagehide 监听器失败。', error);
  }
}

function disposeBridge(runtime) {
  if (runtime.disposed) return;
  runtime.disposed = true;
  runtime.adapter = null;
  removeBridgeLifecycle(runtime);
  safelyEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.DISPOSED, runtime.announcement);
  if (activeBridge === runtime) activeBridge = null;
}

function registerPagehide(runtime) {
  if (typeof window === 'undefined') return;

  try {
    if (typeof globalThis.$ === 'function') {
      globalThis.$(window).on(`pagehide.${runtime.pagehideNamespace}`, runtime.handlePagehide);
      runtime.pagehideBinding = 'jquery';
      return;
    }
    window.addEventListener('pagehide', runtime.handlePagehide);
    runtime.pagehideBinding = 'native';
  } catch (error) {
    console.warn('[ERA 通知桥] 注册 pagehide 监听器失败。', error);
  }
}

/**
 * Publish a fresh notification API instance. Re-initialization disposes the
 * previous instance so stale frontends cannot keep handling notifications.
 */
export function initializeEventNotificationBridge() {
  if (activeBridge) disposeBridge(activeBridge);

  const bridgeId = createInstanceId();
  const globalName = `${WUXIA_EVENT_NOTIFICATION_GLOBAL_PREFIX}:${bridgeId}`;
  const announcement = {
    version: WUXIA_EVENT_NOTIFICATION_API_VERSION,
    bridgeId,
    globalName,
    startedAt: Date.now(),
  };
  const runtime = {
    announcement,
    adapter: null,
    discoverListener: null,
    disposed: false,
    handlePagehide: null,
    pagehideBinding: null,
    pagehideNamespace: `eraEventNotifications${instanceSequence}`,
  };

  const api = Object.freeze({
    version: WUXIA_EVENT_NOTIFICATION_API_VERSION,
    bridgeId,
    globalName,
    registerAdapter(registration) {
      try {
        if (runtime.disposed) return () => {};
        if (
          !registration ||
          (registration.version !== undefined && registration.version !== WUXIA_EVENT_NOTIFICATION_API_VERSION) ||
          typeof registration.ownerId !== 'string' ||
          registration.ownerId.length === 0 ||
          !Number.isFinite(registration.mountedAt) ||
          typeof registration.show !== 'function'
        ) {
          return () => {};
        }

        if (runtime.adapter && registration.mountedAt < runtime.adapter.mountedAt) {
          return () => {};
        }

        const adapter = {
          ownerId: registration.ownerId,
          mountedAt: registration.mountedAt,
          show: registration.show,
        };
        runtime.adapter = adapter;

        let unregistered = false;
        return () => {
          if (unregistered) return;
          unregistered = true;
          if (!runtime.disposed && runtime.adapter === adapter) runtime.adapter = null;
        };
      } catch (error) {
        console.warn('[ERA 通知桥] 注册通知适配器失败。', error);
        return () => {};
      }
    },
  });

  runtime.handlePagehide = () => disposeBridge(runtime);
  activeBridge = runtime;

  try {
    globalThis.initializeGlobal?.(globalName, api);
  } catch (error) {
    console.warn(`[ERA 通知桥] 发布全局接口 ${globalName} 失败。`, error);
  }

  try {
    runtime.discoverListener = globalThis.eventOn?.(WUXIA_EVENT_NOTIFICATION_EVENTS.DISCOVER, () => {
      if (!runtime.disposed) safelyEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, announcement);
    });
  } catch (error) {
    console.warn('[ERA 通知桥] 注册发现监听器失败。', error);
  }

  registerPagehide(runtime);
  safelyEmit(WUXIA_EVENT_NOTIFICATION_EVENTS.READY, announcement);

  return {
    api,
    announcement,
    dispose: () => disposeBridge(runtime),
  };
}

/**
 * Route one event notice to the active frontend adapter, falling back to the
 * original toastr call unless the adapter synchronously confirms handling.
 */
export function notifyEvent({ kind, level, message, eventNames, durationMs }) {
  const notice = {
    version: WUXIA_EVENT_NOTIFICATION_API_VERSION,
    id: `era-notice-${Date.now().toString(36)}-${(++noticeSequence).toString(36)}`,
    source: NOTICE_SOURCE,
    kind,
    level,
    message,
    ...(Array.isArray(eventNames) && eventNames.length > 0 ? { eventNames: [...eventNames] } : {}),
    ...(durationMs === undefined ? {} : { durationMs }),
    createdAt: Date.now(),
  };

  try {
    if (!activeBridge?.disposed && activeBridge.adapter?.show(notice) === true) return true;
  } catch (error) {
    console.warn('[ERA 通知桥] 前端通知适配器执行失败，回退酒馆弹窗。', error);
  }

  fallbackToToastr(level, message, durationMs);
  return false;
}
