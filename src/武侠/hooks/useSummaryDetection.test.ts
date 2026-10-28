import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock, eventOnMock } from '../test/setup';
import type { SummarySettings } from '../utils/settingsManager';
import { useSummaryDetection } from './useSummaryDetection';

const summaryMocks = vi.hoisted(() => {
  const pendingCharacters = [{
    characterId: 'character:包惜弱',
    displayName: '包惜弱',
    entriesCount: 51,
    biography: { 经历1: '旧经历' },
  }];
  const triggerResult = {
    shouldTrigger: true,
    triggerReason: 'total_entries' as const,
    pendingCharacters,
    totalEntries: 51,
  };
  const result = {
    success: true,
    results: [],
    totalProcessed: 1,
    totalSuccess: 1,
    totalFailed: 0,
  };
  return {
    pendingCharacters,
    triggerResult,
    result,
    checkSummaryTrigger: vi.fn(() => triggerResult),
    executeAllPendingSummaries: vi.fn(async () => result),
    updatePendingQueue: vi.fn(),
    getIsSummarizing: vi.fn(() => false),
  };
});

const extraVariableMocks = vi.hoisted(() => ({
  getIsExtraVariableUpdating: vi.fn(() => false),
}));

vi.mock('../utils/summaryManager', () => summaryMocks);
vi.mock('../utils/extraVariableUpdateManager', () => extraVariableMocks);
vi.mock('../utils/logger', () => ({
  dataLogger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('useSummaryDetection', () => {
  const settings = {
    enabled: true,
    thresholds: {
      perCharacterEntriesThreshold: 10,
      totalEntriesThreshold: 50,
    },
  } as SummarySettings;

  beforeEach(() => {
    vi.clearAllMocks();
    eventEmitMock.mockClear();
    eventOnMock.mockClear();
    summaryMocks.checkSummaryTrigger.mockReturnValue(summaryMocks.triggerResult);
    summaryMocks.executeAllPendingSummaries.mockResolvedValue(summaryMocks.result);
    extraVariableMocks.getIsExtraVariableUpdating.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('只在成功的武侠回合结算后触发，并把触发楼层 ID 传给总结事务', async () => {
    const onSummaryComplete = vi.fn();
    const { unmount } = renderHook(() => useSummaryDetection({
      summarySettings: settings,
      onSummaryComplete,
    }));

    expect(eventOnMock).toHaveBeenCalledWith('wuxia:turn-events-settled', expect.any(Function));
    expect(eventOnMock).not.toHaveBeenCalledWith('MESSAGE_RECEIVED', expect.any(Function));

    await act(async () => {
      await eventEmitMock('wuxia:turn-events-settled', {
        status: 'success',
        messageId: 42,
        roundId: 'round-42',
      });
    });

    await waitFor(() => {
      expect(summaryMocks.executeAllPendingSummaries).toHaveBeenCalledWith(
        settings,
        summaryMocks.pendingCharacters,
        42,
      );
    });
    await waitFor(() => expect(onSummaryComplete).toHaveBeenCalledWith(summaryMocks.result));
    expect(summaryMocks.updatePendingQueue).toHaveBeenCalledWith(summaryMocks.pendingCharacters);
    unmount();
  });

  it('总量阈值未超过时不执行自动总结', async () => {
    summaryMocks.checkSummaryTrigger.mockReturnValue({
      shouldTrigger: false,
      triggerReason: 'none',
      pendingCharacters: [],
      totalEntries: 50,
    });

    renderHook(() => useSummaryDetection({ summarySettings: settings }));

    await act(async () => {
      await eventEmitMock('wuxia:turn-events-settled', {
        status: 'success',
        messageId: 43,
        roundId: 'round-43',
      });
    });

    await waitFor(() => expect(summaryMocks.checkSummaryTrigger).toHaveBeenCalled());
    expect(summaryMocks.executeAllPendingSummaries).not.toHaveBeenCalled();
    expect(summaryMocks.updatePendingQueue).toHaveBeenCalledWith([]);
  });

  it('回合结算失败时不检查阈值、不调用总结 API', async () => {
    renderHook(() => useSummaryDetection({ summarySettings: settings }));

    await act(async () => {
      await eventEmitMock('wuxia:turn-events-settled', {
        status: 'failed',
        messageId: 42,
        roundId: 'round-failed',
      });
    });

    expect(summaryMocks.checkSummaryTrigger).not.toHaveBeenCalled();
    expect(summaryMocks.executeAllPendingSummaries).not.toHaveBeenCalled();
  });

  it('成功事件缺少楼层 ID 时安全跳过', async () => {
    const onSummaryError = vi.fn();
    renderHook(() => useSummaryDetection({
      summarySettings: settings,
      onSummaryError,
    }));

    await act(async () => {
      await eventEmitMock('wuxia:turn-events-settled', {
        status: 'success',
        roundId: 'round-without-message',
      });
    });

    expect(summaryMocks.checkSummaryTrigger).not.toHaveBeenCalled();
    expect(summaryMocks.executeAllPendingSummaries).not.toHaveBeenCalled();
    expect(onSummaryError).toHaveBeenCalledWith(expect.any(Error));
  });
});
