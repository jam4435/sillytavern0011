import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { readLatestDebugRoundSnapshot, useDebugLogs } from './useDebugLogs';

const STORAGE_KEY = 'wuxia_latest_debug_round';

describe('useDebugLogs 跨 iframe 同步', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('接收其他 iframe 写入的较新调试状态', () => {
    const { result } = renderHook(() => useDebugLogs());
    act(() => {
      result.current.beginDebugRound('继续前进');
    });
    const running = readLatestDebugRoundSnapshot();
    expect(running?.main.status).toBe('running');
    expect(running?.main.retry429Count).toBe(0);

    const completed = {
      ...running!,
      updatedAt: running!.updatedAt + 1,
      variable: {
        ...running!.variable,
        status: 'success',
        finishedAt: running!.updatedAt + 1,
        retry429Count: 1,
        retry429LastDelayMs: 1_000,
        currentPhase: 'append-variable-blocks',
        phaseTimeline: [{
          name: 'append-variable-blocks',
          status: 'running',
          startedAt: running!.updatedAt,
          updatedAt: running!.updatedAt + 1,
          durationMs: 1,
          watchdogTickCount: 0,
        }],
      },
    };
    const serialized = JSON.stringify(completed);
    localStorage.setItem(STORAGE_KEY, serialized);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: serialized }));
    });

    expect(result.current.latestDebugRound?.variable.status).toBe('success');
    expect(result.current.latestDebugRound?.variable).toMatchObject({
      retry429Count: 1,
      retry429LastDelayMs: 1_000,
      currentPhase: 'append-variable-blocks',
      phaseTimeline: [
        expect.objectContaining({
          name: 'append-variable-blocks',
          status: 'running',
          durationMs: 1,
        }),
      ],
    });
  });

  it('旧 iframe 不会覆盖已经开始的新回合', () => {
    const { result } = renderHook(() => useDebugLogs());
    act(() => {
      result.current.beginDebugRound('旧回合');
    });
    const oldRound = readLatestDebugRoundSnapshot()!;
    const newerRound = {
      ...oldRound,
      id: 'new-round',
      updatedAt: oldRound.updatedAt + 100,
      main: { ...oldRound.main, userInput: '新回合' },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newerRound));

    act(() => {
      result.current.patchLatestDebugRound({ variable: { status: 'success' } });
    });

    expect(readLatestDebugRoundSnapshot()).toMatchObject({
      id: 'new-round',
      main: { userInput: '新回合' },
    });
  });
});
