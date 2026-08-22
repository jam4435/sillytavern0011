import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChronicleEntry, GameEvent } from '../../types';
import { EventsPanel } from './EventsPanel';

const events: GameEvent[] = [
  {
    id: 'personal',
    title: '射雕第一回03-风起江南',
    type: 'ACTIVE',
    category: 'participation',
    description: '镖局的密信催你赶往城外。',
    location: '苏州城外',
    remainingDays: 2,
  },
  {
    id: 'world',
    title: '射雕第二回01-塞外烽烟',
    type: 'ACTIVE',
    category: 'world',
    description: '北地军情骤紧。',
  },
  {
    id: 'rumor',
    title: '射雕第四回01-古墓传闻',
    type: 'RUMOR',
    description: '终南山下有人见到白衣女子。',
  },
  {
    id: 'follow-up',
    title: '射雕第三回02-旧案余波',
    type: 'AFTERMATH',
    description: '客栈掌柜似乎知道内情。',
    remainingTurns: 1,
  },
];

const chronicle: ChronicleEntry[] = [
  {
    id: 'personal-history',
    title: '射雕第五回01-太湖夜宴',
    year: 1206,
    timeText: '1206年三月初二',
    sortDays: 1,
    summary: '你在夜宴中识破了敌方的毒酒。',
    outcomeStatus: '偏离',
    personal: true,
  },
  {
    id: 'world-history',
    title: '射雕第六回01-襄阳战报',
    year: 1205,
    timeText: '1205年十月初八',
    sortDays: 0,
    summary: '守军据城而战，终获援军。',
    personal: false,
  },
];

describe('EventsPanel', () => {
  it('groups events into the three tabs and keeps a single disclosure open', () => {
    render(<EventsPanel events={events} chronicle={chronicle} currentLocation="嘉兴城内" />);

    expect(screen.getByRole('tab', { name: /当前2/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /风起江南 射雕第一回03/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('射雕第二回01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /塞外烽烟 射雕第二回01/ }));
    expect(screen.getByRole('button', { name: /风起江南 射雕第一回03/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /塞外烽烟 射雕第二回01/ })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('tab', { name: /线索2/ }));
    expect(screen.getByRole('tab', { name: /线索2/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /旧案余波 射雕第三回02/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('removes the duplicated time prefix from the expanded event description', () => {
    render(
      <EventsPanel
        events={[
          {
            ...events[0],
            description: '1200年8月15日17时 到 1200年8月15日19时，酒馆内风雨将起。',
          },
        ]}
        currentLocation="嘉兴城内"
      />,
    );

    expect(screen.queryByText('1200年8月15日17时 到 1200年8月15日19时，酒馆内风雨将起。')).not.toBeInTheDocument();
    expect(screen.getByText('酒馆内风雨将起。')).toBeInTheDocument();
  });

  it("keeps travel behavior and shows the chronicle's personal filter", () => {
    const onTravelTo = vi.fn();
    render(
      <EventsPanel
        events={events}
        chronicle={chronicle}
        currentLocation="嘉兴城内"
        onTravelTo={onTravelTo}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /苏州城外前往/ }));
    expect(onTravelTo).toHaveBeenCalledWith('苏州城外');

    fireEvent.click(screen.getByRole('tab', { name: /史册2/ }));
    expect(screen.getByText('太湖夜宴')).toBeInTheDocument();
    expect(screen.queryByText('襄阳战报')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '显示天下事（1）' }));
    expect(screen.getByText('襄阳战报')).toBeInTheDocument();
  });

  it('defaults to the first nonempty tab when no current event exists', () => {
    render(<EventsPanel events={[events[2]]} chronicle={chronicle} />);

    expect(screen.getByRole('tab', { name: /线索1/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /古墓传闻 射雕第四回01/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('changes away from an empty active tab after a game-state refresh', () => {
    const { rerender } = render(<EventsPanel events={events} chronicle={chronicle} />);

    fireEvent.click(screen.getByRole('tab', { name: /线索2/ }));
    rerender(<EventsPanel events={[events[0]]} chronicle={chronicle} />);

    expect(screen.getByRole('tab', { name: /当前1/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not offer a redundant travel action for the current location', () => {
    render(<EventsPanel events={[events[0]]} currentLocation="苏州城外" />);

    expect(screen.queryByRole('button', { name: /前往/ })).not.toBeInTheDocument();
    expect(screen.getByText('苏州城外')).toBeInTheDocument();
  });
});
