import React, { useMemo, useState } from 'react';
import { ChronicleEntry, GameEvent } from '../../types';
import { Icons } from '../Icons';

/* --- Events Panel --- */
interface EventsPanelProps {
    events: GameEvent[];
    /** 江湖史册：已归档的世界事件 */
    chronicle?: ChronicleEntry[];
    /** 已格式化的当前世界时间（含时辰） */
    gameTime?: string;
    /** 玩家当前位置完整路径 */
    currentLocation?: string;
    /** 点击事件地点时加入地图移动指令 */
    onTravelTo?: (location: string) => void;
}

function formatRemainingDays(remainingDays: number): string {
    return remainingDays <= 0 ? '今日之内' : `剩 ${remainingDays} 日`;
}

interface EventMetaProps {
    event: GameEvent;
    /** 时间徽章前缀，例如「预计结束」「事发时间」 */
    timeLabel: string;
    currentLocation?: string;
    onTravelTo?: (location: string) => void;
}

const EventMeta: React.FC<EventMetaProps> = ({ event, timeLabel, currentLocation, onTravelTo }) => {
    const { timeText, location, remainingDays, involvedCharacters } = event;
    const canTravel = Boolean(onTravelTo && location && location !== currentLocation);
    if (!timeText && !location && remainingDays === undefined && !involvedCharacters?.length) return null;

    // 用 span 承载：该行会出现在 .event-compact-text（span）内部，避免非法的块级嵌套
    return (
        <span className="event-meta-row">
            {remainingDays !== undefined && (
                <span className={`event-meta-badge event-meta-badge--countdown${remainingDays <= 3 ? ' urgent' : ''}`}>
                    {formatRemainingDays(remainingDays)}
                </span>
            )}
            {timeText && (
                <span className="event-meta-badge">
                    {timeLabel} {timeText}
                </span>
            )}
            {location &&
                (canTravel ? (
                    <button
                        type="button"
                        className="event-meta-badge event-meta-badge--travel"
                        title={`设置移动目标：${location}`}
                        onClick={() => onTravelTo?.(location)}
                    >
                        {location}
                        <span className="event-travel-hint">前往 ›</span>
                    </button>
                ) : (
                    <span className="event-meta-badge">{location}</span>
                ))}
            {involvedCharacters && involvedCharacters.length > 0 && (
                <span className="event-meta-badge event-meta-badge--people">卷入：{involvedCharacters.join('、')}</span>
            )}
        </span>
    );
};

const CHRONICLE_STATUS_LABEL: Record<string, string> = {
    偏离: '史笔有异',
    未知: '结局失载',
};

const CHRONICLE_STATUS_NOTE: Record<string, string> = {
    偏离: '此事因你而变，未循原定之轨。',
    未知: '此事经过已不可考。',
};

interface ChronicleSectionProps {
    chronicle: ChronicleEntry[];
}

const ChronicleSection: React.FC<ChronicleSectionProps> = ({ chronicle }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showWorld, setShowWorld] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const personalCount = useMemo(() => chronicle.filter(entry => entry.personal).length, [chronicle]);
    const backgroundCount = chronicle.length - personalCount;

    const visibleEntries = useMemo(
        () => (showWorld ? chronicle : chronicle.filter(entry => entry.personal)),
        [chronicle, showWorld],
    );

    // 条目已按时间倒序，按年份分组保持顺序
    const yearGroups = useMemo(() => {
        const groups: { yearLabel: string; entries: ChronicleEntry[] }[] = [];
        for (const entry of visibleEntries) {
            const yearLabel = entry.year !== undefined ? `${entry.year}年` : '年代不详';
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.yearLabel === yearLabel) {
                lastGroup.entries.push(entry);
            } else {
                groups.push({ yearLabel, entries: [entry] });
            }
        }
        return groups;
    }, [visibleEntries]);

    if (chronicle.length === 0) return null;

    return (
        <div className="event-section chronicle-section">
            <button
                type="button"
                className="event-section-header chronicle-header"
                onClick={() => setIsOpen(open => !open)}
            >
                <Icons.FileText size={16} color="currentColor" className="event-section-icon" />
                <span>江湖史册</span>
                <span className="event-section-count">{personalCount > 0 ? personalCount : chronicle.length}</span>
                <span className="chronicle-toggle-icon">
                    {isOpen ? <Icons.ChevronUp size={16} /> : <Icons.ChevronDown size={16} />}
                </span>
            </button>

            {isOpen && (
                <>
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
                            尚未在江湖留下痕迹。
                            {backgroundCount > 0 && `另有 ${backgroundCount} 条天下旧事，可展开一观。`}
                        </div>
                    ) : (
                        <div className="chronicle-timeline">
                            {yearGroups.map(group => (
                                <div key={group.yearLabel} className="chronicle-year-group">
                                    <div className="chronicle-year">{group.yearLabel}</div>
                                    {group.entries.map(entry => {
                                        const isExpanded = expandedId === entry.id;
                                        const dayText =
                                            entry.year !== undefined
                                                ? entry.timeText.replace(`${entry.year}年`, '')
                                                : entry.timeText;
                                        const statusLabel = entry.outcomeStatus
                                            ? CHRONICLE_STATUS_LABEL[entry.outcomeStatus]
                                            : undefined;
                                        const statusNote =
                                            isExpanded && entry.outcomeStatus
                                                ? CHRONICLE_STATUS_NOTE[entry.outcomeStatus]
                                                : undefined;
                                        return (
                                            <div
                                                key={entry.id}
                                                className={[
                                                    'chronicle-entry',
                                                    entry.personal ? 'personal' : 'background',
                                                    isExpanded ? 'expanded' : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                                onClick={() => setExpandedId(current => (current === entry.id ? null : entry.id))}
                                            >
                                                <div className="chronicle-entry-head">
                                                    <span className="chronicle-entry-time">{dayText}</span>
                                                    <span className="chronicle-entry-title">{entry.title}</span>
                                                    {statusLabel && (
                                                        <span
                                                            className={`chronicle-status-seal chronicle-status-seal--${
                                                                entry.outcomeStatus === '偏离' ? 'diverged' : 'unknown'
                                                            }`}
                                                        >
                                                            {statusLabel}
                                                        </span>
                                                    )}
                                                </div>
                                                {entry.location && (
                                                    <div className="chronicle-entry-location">{entry.location}</div>
                                                )}
                                                <p className={`chronicle-entry-summary${isExpanded ? '' : ' clamped'}`}>
                                                    {entry.summary}
                                                </p>
                                                {statusNote && <div className="chronicle-status-note">{statusNote}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}
                </>
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
    const participationEvents = events.filter(e => e.type === 'ACTIVE' && e.category !== 'world');
    const worldEvents = events.filter(e => e.type === 'ACTIVE' && e.category === 'world');
    const rumorEvents = events.filter(e => e.type === 'RUMOR');
    const aftermathEvents = events.filter(e => e.type === 'AFTERMATH');

    return (
        <div className="event-scroll-container">
            {/* 0. Current world time & location */}
            {(gameTime || currentLocation) && (
                <div className="event-now-bar">
                    {gameTime && <span className="event-now-time">{gameTime}</span>}
                    {currentLocation && <span className="event-now-location">身在 {currentLocation}</span>}
                </div>
            )}

            {/* 1. Participating Events (Detailed) */}
            <div className="event-section">
                <h4 className="event-section-header event-section-header-accent">
                    <Icons.Quest size={16} color="currentColor" className="event-section-icon" />
                    <span>当前历练</span>
                    {participationEvents.length > 0 && (
                        <span className="event-section-count">{participationEvents.length}</span>
                    )}
                </h4>

                {participationEvents.length > 0 ? (
                    <div className="event-list-active">
                        {participationEvents.map(ev => (
                            <div key={ev.id} className="event-card-active">
                                <div className="event-active-main">
                                    <div className="event-active-head">
                                        <h3 className="event-active-title">{ev.title}</h3>
                                        <span className="event-active-badge">进行中</span>
                                    </div>
                                    {ev.description && <p className="event-active-desc">{ev.description}</p>}
                                    <EventMeta
                                        event={ev}
                                        timeLabel="预计结束"
                                        currentLocation={currentLocation}
                                        onTravelTo={onTravelTo}
                                    />
                                </div>
                                {ev.details && (
                                    <div className="event-active-vars">
                                        <div className="vars-label">结局走向</div>
                                        <div className="vars-content">{ev.details}</div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="event-empty-box">暂无历练，且去江湖逍遥。</div>
                )}
            </div>

            {/* 2. World Ongoing Events */}
            {worldEvents.length > 0 && (
                <div className="event-section">
                    <h4 className="event-section-header">
                        <Icons.Compass size={16} color="currentColor" className="event-section-icon" />
                        <span>江湖动向</span>
                        <span className="event-section-count">{worldEvents.length}</span>
                    </h4>
                    <div className="event-list-compact">
                        {worldEvents.map(ev => (
                            <div key={ev.id} className="event-compact-row">
                                <span className="event-dot"></span>
                                <span className="event-compact-text">
                                    <span className="event-compact-title">{ev.title}</span>
                                    {ev.description && <>：{ev.description}</>}
                                    <EventMeta
                                        event={ev}
                                        timeLabel="预计结束"
                                        currentLocation={currentLocation}
                                        onTravelTo={onTravelTo}
                                    />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. Rumors */}
            {rumorEvents.length > 0 && (
                <div className="event-section">
                    <h4 className="event-section-header">
                        <Icons.Social size={16} color="currentColor" className="event-section-icon" />
                        <span>江湖传闻</span>
                        <span className="event-section-count">{rumorEvents.length}</span>
                    </h4>
                    <div className="event-list-compact">
                        {rumorEvents.map(ev => (
                            <div key={ev.id} className="event-compact-row">
                                <span className="event-dot"></span>
                                <span className="event-compact-text">
                                    <span className="event-compact-title">{ev.title}：</span>
                                    {ev.description}
                                    <EventMeta
                                        event={ev}
                                        timeLabel="事发时间"
                                        currentLocation={currentLocation}
                                        onTravelTo={onTravelTo}
                                    />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 4. Aftermath (Bottom, Compact) */}
            {aftermathEvents.length > 0 && (
                <div className="event-section event-section--aftermath">
                    <h4 className="event-section-header">
                        <Icons.Manual size={16} color="currentColor" className="event-section-icon" />
                        <span>往事后续</span>
                        <span className="event-section-count">{aftermathEvents.length}</span>
                    </h4>
                    <div className="event-list-compact">
                        {aftermathEvents.map(ev => (
                            <div key={ev.id} className="event-compact-row">
                                <span className="event-dot gray"></span>
                                <span className="event-compact-text">
                                    {ev.description}
                                    {ev.remainingTurns !== undefined && (
                                        <span
                                            className={`event-meta-badge event-meta-badge--countdown event-clue-turns${
                                                ev.remainingTurns <= 1 ? ' urgent' : ''
                                            }`}
                                        >
                                            余 {ev.remainingTurns} 回合可追
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 5. Chronicle (collapsed archive timeline) */}
            <ChronicleSection chronicle={chronicle} />
        </div>
    );
};
