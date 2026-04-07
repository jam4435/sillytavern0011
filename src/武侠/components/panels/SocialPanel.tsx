import React, { useState } from 'react';
import { NPC } from '../../types';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';

/* --- Social Panel --- */
interface SocialPanelProps {
    npcs: NPC[];
}

export const SocialPanel: React.FC<SocialPanelProps> = ({ npcs }) => {
    const [selected, setSelected] = useState<NPC | null>(null);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', height: '100%' }}>
            {/* Left: NPC List */}
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
                <h4 style={{ fontSize: '0.8rem', color: '#78716c', letterSpacing: '0.1em', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    结识豪杰
                </h4>
                {npcs.map(npc => (
                    <div
                        key={npc.id}
                        onClick={() => setSelected(npc)}
                        style={{
                            padding: '1rem',
                            border: '1px solid',
                            cursor: 'pointer',
                            borderColor: selected?.id === npc.id ? '#d97706' : 'rgba(255,255,255,0.1)',
                            background: selected?.id === npc.id ? 'rgba(217, 119, 6, 0.1)' : 'transparent',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#e7e5e4', fontWeight: 'bold' }}>{npc.name}</span>
                            <span style={{
                                fontSize: '0.7rem',
                                color: npc.relationship > 60 ? '#22c55e' : npc.relationship > 20 ? '#a8a29e' : '#78716c',
                                border: '1px solid',
                                borderColor: 'currentColor',
                                padding: '1px 6px',
                                borderRadius: '999px'
                            }}>
                                {npc.relationship > 60 ? '生死之交' : npc.relationship > 20 ? '泛泛之交' : '初次见面'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Right: Detailed Dossier */}
            <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {selected ? (
                    <div style={{ animation: 'fadeIn 0.5s', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                        {/* Header: Name & Role */}
                        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '64px', height: '64px', background: '#292524', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #44403c' }}>
                                    <span style={{ fontSize: '2rem', color: '#57534e', fontFamily: 'serif' }}>{selected.name[0]}</span>
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '2rem', color: '#e7e5e4', fontFamily: 'serif' }}>{selected.name}</h2>
                                    <div style={{ color: '#d97706', fontSize: '0.9rem', marginTop: '0.25rem' }}>{selected.template.type}</div>
                                </div>
                            </div>
                        </div>

                        {/* Martial Arts Section (Boxed) */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem' }}>
                            <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#a8a29e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Icons.Combat size={16} /> 功法根基
                            </h4>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
                                <span style={{ color: '#d97706', border: '1px solid #78350f', padding: '2px 8px', background: 'rgba(120, 53, 15, 0.2)' }}>
                                    {selected.template.martialArtsRank}
                                </span>
                                <span style={{ color: '#a8a29e', border: '1px solid #44403c', padding: '2px 8px' }}>
                                    {selected.template.mastery}
                                </span>
                            </div>
                            <p style={{ color: '#d6d3d1', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                                {selected.template.martialArtsDescription}
                            </p>

                            {/* Traits */}
                            {Object.entries(selected.template.traits).length > 0 && (
                                <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#78716c', marginBottom: '0.5rem' }}>特性</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                        {Object.entries(selected.template.traits).map(([trait, desc]) => (
                                            <div key={trait} style={{ fontSize: '0.85rem' }}>
                                                <span style={{ color: '#e7e5e4', fontWeight: 'bold' }}>{trait}</span>
                                                <span style={{ color: '#78716c', marginLeft: '0.5rem' }}>{desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Grid for Other Info */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                             {/* Key Items */}
                             <div>
                                <h4 style={{ fontSize: '0.9rem', color: '#a8a29e', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.25rem' }}>重要物品</h4>
                                {selected.keyItems.length > 0 ? (
                                    <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#d6d3d1', fontSize: '0.9rem' }}>
                                        {selected.keyItems.map((item, i) => (
                                            <li key={i} style={{ marginBottom: '0.25rem' }}>{item}</li>
                                        ))}
                                    </ul>
                                ) : <span style={{ color: '#57534e', fontSize: '0.85rem' }}>暂无知悉</span>}
                             </div>

                             {/* Network */}
                             <div>
                                <h4 style={{ fontSize: '0.9rem', color: '#a8a29e', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.25rem' }}>人情世故</h4>
                                {selected.network.length > 0 ? (
                                    <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#d6d3d1', fontSize: '0.9rem' }}>
                                        {selected.network.map((person, i) => (
                                            <li key={i} style={{ marginBottom: '0.25rem' }}>{person}</li>
                                        ))}
                                    </ul>
                                ) : <span style={{ color: '#57534e', fontSize: '0.85rem' }}>独来独往</span>}
                             </div>
                        </div>

                        {/* Biography */}
                        <div>
                            <h4 style={{ fontSize: '0.9rem', color: '#a8a29e', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.25rem' }}>生平往事</h4>
                            <p style={{ color: '#d6d3d1', fontSize: '0.95rem', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                                {selected.biography}
                            </p>
                        </div>

                        <div style={{ marginTop: 'auto', display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <button style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid #44403c', color: '#a8a29e', cursor: 'pointer', fontFamily: 'serif' }}>
                                切磋武艺
                            </button>
                            <button style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid #44403c', color: '#a8a29e', cursor: 'pointer', fontFamily: 'serif' }}>
                                赠送厚礼
                            </button>
                        </div>

                    </div>
                ) : (
                    <EmptyState message="请从左侧选择一位江湖侠士，查看其生平详情。" />
                )}
            </div>
        </div>
    );
};
