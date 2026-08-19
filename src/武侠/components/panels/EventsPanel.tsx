import React, { useEffect, useId, useMemo, useState } from 'react';
import { ChronicleEntry, GameEvent } from '../../types';
import {
  getEventCountdownLabel,
  getEventSemanticLabel,
  isEventUrgent,
  sortEventsForDisplay,
} from '../../utils/eventPresentation';
import { EventMeta } from '../EventMeta';
import { Icons } from '../Icons';

interface EventsPanelProps {
  events: GameEvent[];
  chronicle?: ChronicleEntry[];
  gameTime?: string;
  currentLocation?: string;
  onTravelTo?: (location: string) => void;
}

type EventTab = 'current' | 'clues' | 'chronicle';

const TAB_LABELS: Record<EventTab, string> = {
  current: '当前',
  clues: '线索',
  chronicle: '史册',
};

interface EventDisclosureRowProps {
  event: GameEvent;
  isExpanded: boolean;
  onToggle: () => void;
  currentLocation?: string;
  onTravelTo?: (location: string) => void;
}

const EventDisclosureRow: React.FC<EventDisclosureRowProps> = ({
  event,
  isExpanded,
  onToggle,
  currentLocation,
  onTravelTo,
}) => {
  const detailId = useId().replace(/:/g, '');
  const countdown = getEventCountdownLabel(event);

  return (
    <section className={`event-disclosure ${isExpanded ? 'is-expanded' : ''}${isEventUrgent(event) ? ' is-urgent' : ''}`}>
      <button
        type="button"
        className="event-disclosure-heading"
        aria-expanded={isExpanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="event-disclosure-kicker">【{getEventSemanticLabel(event)}】</span>
        <span className="event-disclosure-title">{event.title}</span>
        {countdown && <span className="event-disclosure-countdown">{countdown}</span>}
        <span className="event-disclosure-chevron" aria-hidden="true">
          {isExpanded ? <Icons.ChevronUp size={17} /> : <Icons.ChevronDown size={17} />}
        </span>
      </button>

      {isExpanded && (
        <div className="event-disclosure-detail" id={detailId}>
          {event.description && <p className="event-disclosure-description">{event.description}</p>}
          {event.details && (
            <div className="event-disclosure-outcome">
              <span>结局走向</span>
              <strong>{event.details}</strong>
            </div>
          )}
          <EventMeta event={event} currentLocation={currentLocation} onTravelTo={onTravelTo} />
        </div>
      )}
    </section>
  );
};

interface ChronicleTabProps {
  chronicle: ChronicleEntry[];
}

const CHRONICLE_STATUS_LABEL: Record<string, string> = {
  偏离: '史笔有异',
  未知: '结局失载',
};

const CHRONICLE_STATUS_NOTE: Record<string, string> = {
  偏离: '此事因你而变，未循原定之轨。',
  未知: '此事经过已不可考。',
};

const ChronicleTab: React.FC<ChronicleTabProps> = ({ chronicle }) => {
  const [showWorld, setShowWorld] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const personalCount = useMemo(() => chronicle.filter(entry => entry.personal).length, [chronicle]);
  const backgroundCount = chronicle.length - personalCount;
  const visibleEntries = useMemo(
    () => (showWorld ? chronicle : chronicle.filter(entry => entry.personal)),
    [chronicle, showWorld],
  );

  const yearGroups = useMemo(() => {
    const groups: { yearLabel: string; entries: ChronicleEntry[] }[] = [];
    for (const entry of visibleEntries) {
      const yearLabel = entry.year !== undefined ? `${entry.year}年` : '年代不详';
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.yearLabel === yearLabel) {
        lastGroup.entries.push(entry);
      } else {
        groups.push({ yearLabel, entries: [entry] });
      }
    }
    return groups;
  }, [visibleEntries]);

  return (
    <div className="chronicle-tab">
      {backgroundCount > 0 && (
        <div className="chronicle-toolbar">
          <button
            type="button"
            className={`chronicle-world-toggle${showWorld ? ' active' : ''}`}
            onClick={() => setShowWorld(value => !value)}
          >
            {showWorld ? '只看亲历' : `显示天下事（${backgroundCount}）`}
          </button>
        </div>
      )}

      {visibleEntries.length === 0 ? (
        <div className="event-empty-box">
          尚未在江湖留下亲历痕迹。
          {backgroundCount > 0 && `另有 ${backgroundCount} 条天下旧事，可展开一观。`}
        </div>
      ) : (
        <div className="chronicle-timeline">
          {yearGroups.map(group => (
            <div key={group.yearLabel} className="chronicle-year-group">
              <div className="chronicle-year">{group.yearLabel}</div>
              {group.entries.map(entry => {
                const isExpanded = expandedId === entry.id;
                const dayText = entry.year !== undefined ? entry.timeText.replace(`${entry.year}年`, '') : entry.timeText;
                const statusLabel = entry.outcomeStatus ? CHRONICLE_STATUS_LABEL[entry.outcomeStatus] : undefined;
                const statusNote = isExpanded && entry.outcomeStatus ? CHRONICLE_STATUS_NOTE[entry.outcomeStatus] : undefined;
                return (
                  <button
                    type="button"
                    key={entry.id}
                    className={[
                      'chronicle-entry',
                      entry.personal ? 'personal' : 'background',
                      isExpanded ? 'expanded' : '',
                    ].filter(Boolean).join(' ')}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(current => (current === entry.id ? null : entry.id))}
                  >
                    <span className="chronicle-entry-head">
                      <span className="chronicle-entry-time">{dayText}</span>
                      <span className="chronicle-entry-title">{entry.title}</span>
                      {statusLabel && (
                        <span className={`chronicle-status-seal chronicle-status-seal--${entry.outcomeStatus === '偏离' ? 'diverged' : 'unknown'}`}>
                          {statusLabel}
                        </span>
                      )}
                    </span>
                    {entry.location && <span className="chronicle-entry-location">{entry.location}</span>}
                    <span className={`chronicle-entry-summary${isExpanded ? '' : ' clamped'}`}>{entry.summary}</span>
                    {statusNote && <span className="chronicle-status-note">{statusNote}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const EventsPanel: React.FC<EventsPanelProps> = ({
  events,
  chronicle = [],
  gameTime,
  currentLocation,
  onTravelTo,
}) => {
  const currentEvents = useMemo(() => sortEventsForDisplay(events.filter(event => event.type === 'ACTIVE')), [events]);
  const clueEvents = useMemo(
    () => sortEventsForDisplay(events.filter(event => event.type === 'RUMOR' || event.type === 'AFTERMATH')),
    [events],
  );
  const tabCounts: Record<EventTab, number> = {
    current: currentEvents.length,
    clues: clueEvents.length,
    chronicle: chronicle.length,
  };
  const availableTabs = (Object.keys(TAB_LABELS) as EventTab[]).filter(tab => tabCounts[tab] > 0);
  const [activeTab, setActiveTab] = useState<EventTab>('current');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (tabCounts[activeTab] > 0 || availableTabs.length === 0) return;
    setActiveTab(availableTabs[0]);
  }, [activeTab, availableTabs, tabCounts]);

  const tabEvents = activeTab === 'current' ? currentEvents : activeTab === 'clues' ? clueEvents : [];
  useEffect(() => {
    setExpandedEventId(current => {
      if (current && tabEvents.some(event => event.id === current)) return current;
      return tabEvents[0]?.id ?? null;
    });
  }, [tabEvents]);

  const renderTabPanel = (tab: EventTab) => {
    const tabId = `event-tab-${tab}`;
    const panelId = `event-tab-panel-${tab}`;
    const visibleEvents = tab === 'current' ? currentEvents : tab === 'clues' ? clueEvents : [];
    return (
      <div
        key={tab}
        className="event-tab-panel"
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId}
        hidden={activeTab !== tab}
      >
        {tab === 'chronicle' ? (
          <ChronicleTab chronicle={chronicle} />
        ) : visibleEvents.length > 0 ? (
          <div className="event-disclosure-list">
            {visibleEvents.map(event => (
              <EventDisclosureRow
                key={event.id}
                event={event}
                isExpanded={activeTab === tab && expandedEventId === event.id}
                onToggle={() => setExpandedEventId(current => (current === event.id ? null : event.id))}
                currentLocation={currentLocation}
                onTravelTo={onTravelTo}
              />
            ))}
          </div>
        ) : (
          <div className="event-empty-box">
            {tab === 'current' ? '眼下暂无进行中的江湖事。' : '尚未寻得可追的江湖线索。'}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="events-panel">
      {(gameTime || currentLocation) && (
        <div className="event-now-bar">
          {gameTime && <span className="event-now-time">{gameTime}</span>}
          {currentLocation && <span className="event-now-location">身在 {currentLocation}</span>}
        </div>
      )}

      <div className="event-tabs" role="tablist" aria-label="江湖轶事分类">
        {(Object.keys(TAB_LABELS) as EventTab[]).map(tab => {
          const tabId = `event-tab-${tab}`;
          const panelId = `event-tab-panel-${tab}`;
          return (
            <button
              type="button"
              key={tab}
              id={tabId}
              role="tab"
              className={`event-tab${activeTab === tab ? ' active' : ''}`}
              aria-selected={activeTab === tab}
              aria-controls={panelId}
              onClick={() => setActiveTab(tab)}
            >
              <span>{TAB_LABELS[tab]}</span>
              <span className="event-tab-count">{tabCounts[tab]}</span>
            </button>
          );
        })}
      </div>

      {(Object.keys(TAB_LABELS) as EventTab[]).map(renderTabPanel)}
    </div>
  );
};
