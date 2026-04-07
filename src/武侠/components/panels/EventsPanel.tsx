import React from 'react';
import { GameEvent } from '../../types';
import { Icons } from '../Icons';

/* --- Events Panel --- */
interface EventsPanelProps {
    events: GameEvent[];
}

export const EventsPanel: React.FC<EventsPanelProps> = ({ events }) => {
    const activeEvents = events.filter(e => e.type === 'ACTIVE');
    const rumorEvents = events.filter(e => e.type === 'RUMOR');
    const aftermathEvents = events.filter(e => e.type === 'AFTERMATH');

    return (
        <div className="event-scroll-container">
            {/* 1. Rumors (Top, Compact) */}
            {rumorEvents.length > 0 && (
                <div className="event-section">
                    <h4 className="event-section-header">
                        <Icons.Social size={16} className="text-stone-500" />
                        <span>江湖传闻</span>
                    </h4>
                    <div className="event-list-compact">
                        {rumorEvents.map(ev => (
                            <div key={ev.id} className="event-compact-row">
                                <span className="event-dot"></span>
                                <span className="event-compact-text">
                                    <span style={{color: '#d6d3d1'}}>{ev.title}：</span>
                                    {ev.description}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. Active Events (Middle, Detailed) */}
            <div className="event-section">
                <h4 className="event-section-header" style={{ color: '#d97706', borderColor: '#d97706' }}>
                    <Icons.Quest size={16} color="#d97706" />
                    <span>当前历练</span>
                </h4>

                {activeEvents.length > 0 ? (
                    <div className="event-list-active">
                        {activeEvents.map(ev => (
                            <div key={ev.id} className="event-card-active">
                                <div className="event-active-main">
                                    <h3 className="event-active-title">{ev.title}</h3>
                                    <p className="event-active-desc">{ev.description}</p>
                                </div>
                                {ev.details && (
                                    <div className="event-active-vars">
                                        <div className="vars-label">卷宗详情</div>
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

            {/* 3. Aftermath (Bottom, Compact) */}
            {aftermathEvents.length > 0 && (
                <div className="event-section" style={{ marginTop: 'auto', paddingTop: '1rem', opacity: 0.7 }}>
                    <h4 className="event-section-header">
                        <Icons.Compass size={16} className="text-stone-500" />
                        <span>往事后续</span>
                    </h4>
                    <div className="event-list-compact">
                        {aftermathEvents.map(ev => (
                            <div key={ev.id} className="event-compact-row">
                                <span className="event-dot gray"></span>
                                <span className="event-compact-text">
                                    {ev.description}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
