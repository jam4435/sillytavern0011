export type UnthrottledTimerSource = 'top' | 'parent' | 'self';

export interface UnthrottledTimerHandle {
  source: UnthrottledTimerSource;
  cancel: () => void;
}

type TimerWindow = Pick<Window, 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'>;

function getTimerCandidates(currentWindow: Window): Array<{ source: UnthrottledTimerSource; owner: TimerWindow }> {
  const candidates: Array<{ source: UnthrottledTimerSource; owner: TimerWindow }> = [];
  const seen = new Set<TimerWindow>();
  const addCandidate = (source: UnthrottledTimerSource, owner: TimerWindow | null | undefined) => {
    if (!owner || seen.has(owner)) return;
    seen.add(owner);
    candidates.push({ source, owner });
  };

  try {
    if (currentWindow.top && currentWindow.top !== currentWindow) {
      addCandidate('top', currentWindow.top);
    }
  } catch {
    // 跨源顶层窗口不可访问时继续尝试 parent/self。
  }
  try {
    if (currentWindow.parent && currentWindow.parent !== currentWindow) {
      addCandidate('parent', currentWindow.parent);
    }
  } catch {
    // 跨源父窗口不可访问时回退当前 iframe。
  }
  addCandidate('self', currentWindow);
  return candidates;
}

function createHandle(
  source: UnthrottledTimerSource,
  owner: TimerWindow,
  timerId: number,
  clear: (owner: TimerWindow, timerId: number) => void,
): UnthrottledTimerHandle {
  let active = true;
  return {
    source,
    cancel: () => {
      if (!active) return;
      active = false;
      try {
        clear(owner, timerId);
      } catch {
        // 计时器所属窗口已经销毁时无需继续清理。
      }
    },
  };
}

function cancelOnPageHide(handle: UnthrottledTimerHandle, currentWindow: Window): UnthrottledTimerHandle {
  const cancelTimer = handle.cancel;
  const cancelForPageHide = () => cancelTimer();
  try {
    currentWindow.addEventListener('pagehide', cancelForPageHide, { once: true });
    handle.cancel = () => {
      try {
        currentWindow.removeEventListener('pagehide', cancelForPageHide);
      } catch {
        // 当前 iframe 已经销毁。
      }
      cancelTimer();
    };
  } catch {
    // 非浏览器测试环境无需绑定页面生命周期。
  }
  return handle;
}

/**
 * 隐藏消息 iframe 的原生计时器可能被 Chromium 以分钟级节流。优先把截止时间注册到
 * 顶层 SillyTavern 页面；访问受限或窗口已销毁时再安全回退到当前 iframe。
 */
export function scheduleUnthrottledTimeout(
  callback: () => void,
  delayMs: number,
  currentWindow: Window = window,
): UnthrottledTimerHandle {
  for (const candidate of getTimerCandidates(currentWindow)) {
    try {
      let handle: UnthrottledTimerHandle;
      const timerId = candidate.owner.setTimeout(() => {
        handle.cancel();
        callback();
      }, delayMs);
      handle = createHandle(candidate.source, candidate.owner, timerId, (owner, id) => owner.clearTimeout(id));
      return cancelOnPageHide(handle, currentWindow);
    } catch {
      // 尝试下一个可访问的计时器宿主。
    }
  }
  throw new Error('无法注册超时计时器。');
}

export function scheduleUnthrottledInterval(
  callback: () => void,
  delayMs: number,
  currentWindow: Window = window,
): UnthrottledTimerHandle {
  for (const candidate of getTimerCandidates(currentWindow)) {
    try {
      const timerId = candidate.owner.setInterval(callback, delayMs);
      return cancelOnPageHide(
        createHandle(candidate.source, candidate.owner, timerId, (owner, id) => owner.clearInterval(id)),
        currentWindow,
      );
    } catch {
      // 尝试下一个可访问的计时器宿主。
    }
  }
  throw new Error('无法注册周期计时器。');
}
