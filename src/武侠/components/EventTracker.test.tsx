import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../types';
import EventTracker, { EVENT_TRACKER_COLLAPSED_STORAGE_KEY } from './EventTracker';

const events: GameEvent[] = [
  {
    id: 'personal',
    title: '风起江南',
    type: 'ACTIVE',
    category: 'participation',
    description: '镖局的密信催你赶往城外。',
    details: '先赴苏州城外，再寻失踪镖师。',
    location: '苏州城外',
    remainingDays: 2,
    involvedCharacters: ['陆乘风'],
  },
  {
    id: 'world',
    title: '塞外烽烟',
    type: 'ACTIVE',
    category: 'world',
    description: '北地军情骤紧。',
    remainingDays: 6,
  },
  {
    id: 'follow-up',
    title: '旧案余波',
    type: 'AFTERMATH',
    description: '客栈掌柜似乎知道内情。',
    remainingTurns: 1,
  },
  {
    id: 'rumor',
    title: '古墓传闻',
    type: 'RUMOR',
    description: '终南山下有人见到白衣女子。',
  },
];

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(min-width: 1200px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('EventTracker', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockMatchMedia(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides itself when there are no unclosed events', () => {
    render(<EventTracker events={[]} onOpenAll={vi.fn()} />);

    expect(screen.queryByLabelText('江湖事簿')).not.toBeInTheDocument();
  });

  it('defaults to a compact HUD, then shows only three entries and the full count after expansion', () => {
    render(<EventTracker events={events} onOpenAll={vi.fn()} />);

    expect(screen.getByRole('button', { name: '展开江湖事簿' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: '展开江湖事簿' }));
    expect(screen.getByText('另有 1 件待阅')).toBeInTheDocument();
    expect(screen.getByText('风起江南')).toBeInTheDocument();
    expect(screen.queryByText('镖局的密信催你赶往城外。')).not.toBeInTheDocument();
    expect(screen.getByText('先赴苏州城外，再寻失踪镖师。')).toBeInTheDocument();
    expect(screen.getByText('卷入：陆乘风')).toBeInTheDocument();
    expect(screen.getByText('旧案余波')).toBeInTheDocument();
    expect(screen.queryByText('古墓传闻')).not.toBeInTheDocument();
  });

  it('persists the whole-tracker collapse state and only expands one event at a time', () => {
    const { unmount } = render(<EventTracker events={events} onOpenAll={vi.fn()} />);
    const openButton = screen.getByRole('button', { name: '展开江湖事簿' });

    fireEvent.click(openButton);
    fireEvent.click(screen.getByRole('button', { name: '收起江湖事簿' }));
    expect(screen.getByRole('button', { name: '展开江湖事簿' })).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem(EVENT_TRACKER_COLLAPSED_STORAGE_KEY)).toBe('collapsed');

    unmount();
    render(<EventTracker events={events} onOpenAll={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '展开江湖事簿' }));

    expect(screen.getByRole('button', { name: /【亲历】风起江南/ })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /【后续】旧案余波/ }));
    expect(screen.getByRole('button', { name: /【亲历】风起江南/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /【后续】旧案余波/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('falls back to the collapsed default when stored data is not recognized', () => {
    window.localStorage.setItem(EVENT_TRACKER_COLLAPSED_STORAGE_KEY, 'not-a-tracker-state');
    mockMatchMedia(false);

    render(<EventTracker events={events} onOpenAll={vi.fn()} />);

    expect(screen.getByRole('button', { name: '展开江湖事簿' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the full event page and reuses the travel callback', () => {
    const onOpenAll = vi.fn();
    const onTravelTo = vi.fn();
    render(
      <EventTracker
        events={events}
        currentLocation="嘉兴城内"
        onOpenAll={onOpenAll}
        onTravelTo={onTravelTo}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '展开江湖事簿' }));
    fireEvent.click(screen.getByRole('button', { name: /苏州城外前往/ }));
    expect(onTravelTo).toHaveBeenCalledWith('苏州城外');

    fireEvent.click(screen.getByRole('button', { name: /查看全部/ }));
    expect(onOpenAll).toHaveBeenCalledOnce();
  });
});
