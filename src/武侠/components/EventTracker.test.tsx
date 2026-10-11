import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChronicleEntry, GameEvent } from '../types';
import EventTracker, { EVENT_TRACKER_COLLAPSED_STORAGE_KEY } from './EventTracker';

const events: GameEvent[] = [
  {
    id: 'personal',
    title: '射雕第一回03-风起江南',
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
    title: '射雕第二回01-塞外烽烟',
    type: 'ACTIVE',
    category: 'world',
    description: '北地军情骤紧。',
    remainingDays: 6,
  },
  {
    id: 'follow-up',
    title: '射雕第三回02-旧案余波',
    type: 'AFTERMATH',
    clueKind: 'followup',
    description: '客栈掌柜似乎知道内情。',
    remainingTurns: 1,
  },
  {
    id: 'rumor',
    title: '射雕第四回01-古墓传闻',
    type: 'RUMOR',
    clueKind: 'nearby',
    description: '终南山下有人见到白衣女子。',
    startsInDays: 4,
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

  it('保留本回合刚完成的05于卷轴顶部，同时显示接续的06，下回合清空后移除', () => {
    const finished: ChronicleEntry = {
      id: 'chronicle05',
      title: '天龙第二回05-段誉坠崖幸存',
      timeText: '1202年3月16日15时',
      sortDays: 0,
      location: '大理/无量山/剑湖谷底',
      summary: '段誉得见无量玉壁，05已经结束。',
      personal: true,
    };
    const next: GameEvent = {
      id: 'event06',
      title: '天龙第二回06-段誉入秘洞',
      type: 'ACTIVE',
      category: 'participation',
      description: '段誉向玉像叩拜。',
    };

    const { rerender } = render(
      <EventTracker events={[next]} completedEvents={[finished]} onOpenAll={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '展开江湖事簿' }));
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('段誉坠崖幸存')).toBeInTheDocument();
    expect(screen.getByText('段誉得见无量玉壁，05已经结束。')).toBeInTheDocument();
    expect(screen.getByText('段誉入秘洞')).toBeInTheDocument();
    expect(screen.getByLabelText('共有 1 件未结事件，1 件本回合已完成事件')).toHaveTextContent('2');
    expect(screen.getByText('大理/无量山/剑湖谷底')).not.toHaveAttribute('type', 'button');

    rerender(<EventTracker events={[next]} completedEvents={[]} onOpenAll={vi.fn()} />);
    expect(screen.queryByText('已完成')).not.toBeInTheDocument();
    expect(screen.getByText('段誉入秘洞')).toBeInTheDocument();
  });

  it('hides itself when there are no unclosed events', () => {
    render(<EventTracker events={[]} onOpenAll={vi.fn()} />);

    expect(screen.queryByLabelText('江湖事簿')).not.toBeInTheDocument();
  });

  it('defaults to a compact HUD, then shows only three entries and the full count after expansion', () => {
    render(<EventTracker events={events} onOpenAll={vi.fn()} />);

    expect(screen.getByRole('button', { name: '展开江湖事簿' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: '展开江湖事簿' }));
    expect(screen.getByText('镖局的密信催你赶往城外。')).toBeInTheDocument();
    expect(screen.getByText('另有 1 件待阅')).toBeInTheDocument();
    expect(screen.getByText('风起江南')).toBeInTheDocument();
    expect(screen.getByText('射雕第一回03')).toBeInTheDocument();
    expect(screen.getByText('先赴苏州城外，再寻失踪镖师。')).toBeInTheDocument();
    expect(screen.getByText('卷入：陆乘风')).toBeInTheDocument();
    expect(screen.getByText('旧案余波')).toBeInTheDocument();
    expect(screen.getByText('古墓传闻')).toBeInTheDocument();
    expect(screen.getByText('附近传闻')).toBeInTheDocument();
    expect(screen.getByText('后续线索')).toBeInTheDocument();
    expect(screen.queryByText('塞外烽烟')).not.toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: /风起江南 射雕第一回03/ })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /旧案余波 射雕第三回02/ }));
    expect(screen.getByRole('button', { name: /风起江南 射雕第一回03/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /旧案余波 射雕第三回02/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('falls back to the collapsed default when stored data is not recognized', () => {
    window.localStorage.setItem(EVENT_TRACKER_COLLAPSED_STORAGE_KEY, 'not-a-tracker-state');
    mockMatchMedia(false);

    render(<EventTracker events={events} onOpenAll={vi.fn()} />);

    expect(screen.getByRole('button', { name: '展开江湖事簿' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('treats different narrative scenes under the same three-level location as already arrived', () => {
    const onTravelTo = vi.fn();
    const scopedEvent: GameEvent = {
      id: 'same-scope',
      title: '射雕第二回02-醉仙楼风波',
      type: 'RUMOR',
      description: '楼中风波将起。',
      location: '大宋/嘉兴府/嘉兴城/醉仙楼',
    };

    render(
      <EventTracker
        events={[scopedEvent]}
        currentLocation="大宋/嘉兴府/嘉兴城/客栈后院"
        onOpenAll={vi.fn()}
        onTravelTo={onTravelTo}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '展开江湖事簿' }));
    expect(screen.getByText('大宋/嘉兴府/嘉兴城/醉仙楼')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /醉仙楼前往/ })).not.toBeInTheDocument();
    expect(onTravelTo).not.toHaveBeenCalled();
  });

  it('opens the full event page and reuses the travel callback', () => {
    const onOpenAll = vi.fn();
    const onTravelTo = vi.fn();
    render(<EventTracker events={events} currentLocation="嘉兴城内" onOpenAll={onOpenAll} onTravelTo={onTravelTo} />);

    fireEvent.click(screen.getByRole('button', { name: '展开江湖事簿' }));
    fireEvent.click(screen.getByRole('button', { name: /苏州城外前往/ }));
    expect(onTravelTo).toHaveBeenCalledWith('苏州城外');

    fireEvent.click(screen.getByRole('button', { name: /查看全部/ }));
    expect(onOpenAll).toHaveBeenCalledOnce();
  });
});
