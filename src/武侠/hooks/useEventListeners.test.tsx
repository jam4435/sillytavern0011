import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECT_VARIABLE_WRITE_DONE_EVENT,
  ERA_VARIABLE_WRITE_DONE_EVENT,
} from '../../shared/directVariableWrite';
import { eventOnMock } from '../test/setup';

const {
  readGameDataPureMock,
  scheduleGameDataCompletionMock,
  getLastMessageContentMock,
  parseOptionsMock,
} = vi.hoisted(() => ({
  readGameDataPureMock: vi.fn(() => ({ stats: { cultivation: 100 } })),
  scheduleGameDataCompletionMock: vi.fn(),
  getLastMessageContentMock: vi.fn(() => '正文\n[A]选项'),
  parseOptionsMock: vi.fn(() => ['选项']),
}));

vi.mock('../utils/variableReader', () => ({
  readGameDataPure: readGameDataPureMock,
  scheduleGameDataCompletion: scheduleGameDataCompletionMock,
  getLastMessageContent: getLastMessageContentMock,
  parseOptions: parseOptionsMock,
}));

import { useEventListeners } from './useEventListeners';

const getSillyTavernMock = () => globalThis as typeof globalThis & {
  SillyTavern: {
    getCurrentChatId: ReturnType<typeof vi.fn>;
  };
};

const emitMockEvent = (eventName: string, ...args: unknown[]) =>
  (eventEmit as unknown as (name: string, ...payload: unknown[]) => Promise<void>)(eventName, ...args);

describe('useEventListeners', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    eventOnMock.mockClear();
    readGameDataPureMock.mockClear();
    scheduleGameDataCompletionMock.mockClear();
    getLastMessageContentMock.mockClear();
    parseOptionsMock.mockClear();
    getSillyTavernMock().SillyTavern.getCurrentChatId.mockReturnValue('test-chat');
  });

  it('注册并注销全部全局监听器', () => {
    const { unmount } = renderHook(() =>
      useEventListeners({
        updateGameState: vi.fn(),
        setCurrentMaintext: vi.fn(),
        setCurrentOptions: vi.fn(),
      }),
    );

    expect(eventOnMock.mock.calls.map(([eventName]) => eventName)).toEqual([
      tavern_events.MESSAGE_SENT,
      tavern_events.MESSAGE_RECEIVED,
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MESSAGE_UPDATED,
        tavern_events.CHAT_CHANGED,
        'era:writeDone',
        DIRECT_VARIABLE_WRITE_DONE_EVENT,
        ERA_VARIABLE_WRITE_DONE_EVENT,
      ]);

    const stopMocks = eventOnMock.mock.results.map(result => result.value.stop as ReturnType<typeof vi.fn>);
    unmount();

    for (const stopMock of stopMocks) {
      expect(stopMock).toHaveBeenCalledTimes(1);
    }
  });

  it('ERA、direct 和消息边界都会调度刷新与补全', async () => {
    const updateGameState = vi.fn();
    const setCurrentMaintext = vi.fn();
    const setCurrentOptions = vi.fn();
    const onEraWriteDone = vi.fn();
    const onDirectVariableWriteDone = vi.fn();
    const onEraVariableWriteDone = vi.fn();
    const onMessageBoundary = vi.fn();

    renderHook(() =>
      useEventListeners({
        updateGameState,
        setCurrentMaintext,
        setCurrentOptions,
        onEraWriteDone,
        onDirectVariableWriteDone,
        onEraVariableWriteDone,
        onMessageBoundary,
      }),
    );

    await act(async () => {
      await emitMockEvent('era:writeDone', { actions: { apiWrite: true } });
      vi.advanceTimersByTime(60);
    });
    expect(onEraWriteDone).toHaveBeenCalledTimes(1);
    expect(scheduleGameDataCompletionMock).toHaveBeenCalledWith('era-write-done', { fullScan: true });

    await act(async () => {
      await emitMockEvent(DIRECT_VARIABLE_WRITE_DONE_EVENT, {
        version: 1,
        writeId: 'direct-1',
        source: 'event-script',
        operation: 'update',
        reason: 'event-script-write',
      });
      vi.advanceTimersByTime(60);
    });
    expect(onDirectVariableWriteDone).toHaveBeenCalledTimes(1);
    expect(scheduleGameDataCompletionMock).toHaveBeenCalledWith('direct-write-done', { fullScan: true });

    await act(async () => {
      await emitMockEvent(ERA_VARIABLE_WRITE_DONE_EVENT, {
        version: 1,
        writeId: 'era-1',
        source: 'frontend',
        operation: 'update',
        reason: 'summary-write',
        eventName: 'era:updateByObject',
        message_id: 12,
        actions: { apiWrite: true },
      });
      vi.advanceTimersByTime(60);
    });
    expect(onEraVariableWriteDone).toHaveBeenCalledTimes(1);
    expect(scheduleGameDataCompletionMock).toHaveBeenCalledWith('era-variable-write-done', { fullScan: true });

    await act(async () => {
      await emitMockEvent(String(tavern_events.MESSAGE_RECEIVED), 12);
      vi.advanceTimersByTime(1);
    });
    expect(onMessageBoundary).toHaveBeenCalledWith(12);
    expect(scheduleGameDataCompletionMock).toHaveBeenCalledWith('message-boundary', { fullScan: true });
    expect(readGameDataPureMock).toHaveBeenCalled();
    expect(updateGameState).toHaveBeenCalledWith({ stats: { cultivation: 100 } });
    expect(setCurrentMaintext).toHaveBeenCalledWith('正文\n[A]选项');
    expect(setCurrentOptions).toHaveBeenCalledWith(['选项']);
  });

  it('纯事件状态直接写入只刷新投影，不触发 fullScan', async () => {
    renderHook(() =>
      useEventListeners({
        updateGameState: vi.fn(),
        setCurrentMaintext: vi.fn(),
        setCurrentOptions: vi.fn(),
      }),
    );

    await act(async () => {
      await emitMockEvent(DIRECT_VARIABLE_WRITE_DONE_EVENT, {
        version: 1,
        writeId: 'event-state-1',
        source: 'event-script',
        operation: 'update',
        reason: 'event-state-write',
        refreshHint: 'event-state',
      });
      vi.advanceTimersByTime(60);
    });

    expect(scheduleGameDataCompletionMock).not.toHaveBeenCalled();
    expect(readGameDataPureMock).toHaveBeenCalledTimes(1);
  });

  it('同一 ERA 写入的 raw 与 sourced 完成通知只执行一次 fullScan', async () => {
    renderHook(() =>
      useEventListeners({
        updateGameState: vi.fn(),
        setCurrentMaintext: vi.fn(),
        setCurrentOptions: vi.fn(),
      }),
    );

    await act(async () => {
      await emitMockEvent('era:writeDone', {
        message_id: 88,
        actions: { apiWrite: true },
      });
      await emitMockEvent(ERA_VARIABLE_WRITE_DONE_EVENT, {
        version: 1,
        writeId: 'era-88',
        source: 'frontend',
        operation: 'update',
        reason: 'same-write',
        eventName: 'era:updateByObject',
        message_id: 88,
        actions: { apiWrite: true },
        refreshHint: 'full',
      });
      vi.advanceTimersByTime(60);
    });

    expect(scheduleGameDataCompletionMock).toHaveBeenCalledTimes(1);
    expect(scheduleGameDataCompletionMock).toHaveBeenCalledWith('era-variable-write-done', { fullScan: true });
  });

  it('同聊天的 CHAT_CHANGED 只刷新，不清空当前回合追踪', async () => {
    const updateGameState = vi.fn();
    const setCurrentMaintext = vi.fn();
    const setCurrentOptions = vi.fn();
    const onChatChanged = vi.fn();

    renderHook(() =>
      useEventListeners({
        updateGameState,
        setCurrentMaintext,
        setCurrentOptions,
        onChatChanged,
      }),
    );

    await act(async () => {
      await emitMockEvent(String(tavern_events.CHAT_CHANGED), 'test-chat');
      vi.advanceTimersByTime(1);
    });

    expect(onChatChanged).not.toHaveBeenCalled();
    expect(updateGameState).toHaveBeenCalledWith({ stats: { cultivation: 100 } });
    expect(setCurrentMaintext).toHaveBeenCalledWith('正文\n[A]选项');
    expect(setCurrentOptions).toHaveBeenCalledWith(['选项']);
  });

  it('聊天 ID 真的变化时才清空当前回合追踪', async () => {
    const onChatChanged = vi.fn();

    renderHook(() =>
      useEventListeners({
        updateGameState: vi.fn(),
        setCurrentMaintext: vi.fn(),
        setCurrentOptions: vi.fn(),
        onChatChanged,
      }),
    );

    getSillyTavernMock().SillyTavern.getCurrentChatId.mockReturnValue('next-chat');

    await act(async () => {
      await emitMockEvent(String(tavern_events.CHAT_CHANGED), 'next-chat');
      vi.advanceTimersByTime(1);
    });

    expect(onChatChanged).toHaveBeenCalledTimes(1);
  });
});
