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
  it('只在角色创建加载期间延后事件通知，创建完成后无需等待初始命名', () => {
    expect(shouldDeferSetupEventNotifications('setup', true)).toBe(true);
    expect(shouldDeferSetupEventNotifications('setup', false)).toBe(false);
    expect(shouldDeferSetupEventNotifications('opening', false)).toBe(false);
  });
});
