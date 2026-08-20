import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { shouldDeferSetupEventNotifications, usePageFlow } from './usePageFlow';

describe('usePageFlow', () => {
  it('在用户进入新角色流程后拒绝迟到的首屏页面判定', () => {
    const { result } = renderHook(() => usePageFlow());

    act(() => {
      result.current.handleStart();
      result.current.handleNewGame();
    });

    expect(result.current.currentPage).toBe('setup');

    let didApplyInitialPage = true;
    act(() => {
      didApplyInitialPage = result.current.resolveInitialPage('start');
    });

    expect(didApplyInitialPage).toBe(false);
    expect(result.current.currentPage).toBe('setup');
  });

  it('首屏判定未被用户接管时仍可进入已保存会话页面', () => {
    const { result } = renderHook(() => usePageFlow());

    let didApplyInitialPage = false;
    act(() => {
      didApplyInitialPage = result.current.resolveInitialPage('opening');
    });

    expect(didApplyInitialPage).toBe(true);
    expect(result.current.currentPage).toBe('opening');
  });
});

describe('shouldDeferSetupEventNotifications', () => {
  it('在角色创建或初始命名期间延后事件通知，进入开局后恢复显示', () => {
    expect(shouldDeferSetupEventNotifications('setup', true, false)).toBe(true);
    expect(shouldDeferSetupEventNotifications('setup', false, true)).toBe(true);
    expect(shouldDeferSetupEventNotifications('opening', false, false)).toBe(false);
  });
});
