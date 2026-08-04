import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventNotice, EventNoticeKind, EventNoticeLevel } from '../../shared/wuxiaEventNotifications';
import StatusToast from './StatusToast';
import EventNotificationStack, { DEFAULT_DURATION_MS, MAX_VISIBLE_NOTIFICATIONS } from './EventNotificationStack';

const createNotice = (
  id: string,
  level: EventNoticeLevel = 'info',
  kind: EventNoticeKind = 'event-started',
  durationMs = 0,
): EventNotice => ({
  version: 1,
  id,
  source: 'event-script',
  kind,
  level,
  message: `通知 ${id}`,
  eventNames: [`事件 ${id}`],
  durationMs,
  createdAt: Date.now(),
});

describe('EventNotificationStack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('最多同时展示五条并在关闭后按 FIFO 提升候场通知', () => {
    const notices = Array.from({ length: 6 }, (_, index) => createNotice(String(index + 1)));
    const onDismiss = vi.fn();
    const { rerender } = render(<EventNotificationStack notifications={notices} onDismiss={onDismiss} />);

    expect(screen.getAllByText(/通知 \d/)).toHaveLength(MAX_VISIBLE_NOTIFICATIONS);
    expect(screen.queryByText('通知 6')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '关闭事件通知' })[0]);
    act(() => vi.advanceTimersByTime(220));
    expect(onDismiss).toHaveBeenCalledWith('1');

    rerender(<EventNotificationStack notifications={notices.slice(1)} onDismiss={onDismiss} />);
    expect(screen.getByText('通知 6')).toBeInTheDocument();
  });

  it('遵循显式时长并在缺省时使用五秒', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <EventNotificationStack
        notifications={[createNotice('short', 'success', 'event-completed', 1_000)]}
        onDismiss={onDismiss}
      />,
    );

    act(() => vi.advanceTimersByTime(1_219));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledWith('short');

    onDismiss.mockClear();
    const fallbackDurationNotice = { ...createNotice('default'), durationMs: undefined };
    rerender(<EventNotificationStack notifications={[fallbackDurationNotice]} onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(DEFAULT_DURATION_MS + 220));
    expect(onDismiss).toHaveBeenCalledWith('default');
  });

  it('为警告和错误使用 alert，同时不覆盖现有加载状态条', () => {
    render(
      <>
        <StatusToast state={{ status: 'loading', message: '正在生成' }} />
        <EventNotificationStack
          notifications={[
            createNotice('warning', 'warning', 'player-entered-event'),
            createNotice('error', 'error', 'event-data-error'),
          ]}
          onDismiss={vi.fn()}
        />
      </>,
    );

    expect(screen.getByText('正在生成')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByText('身入局中')).toBeInTheDocument();
    expect(screen.getByText('卷宗有误')).toBeInTheDocument();
  });
});
