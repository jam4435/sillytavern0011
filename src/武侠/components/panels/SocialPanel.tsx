import React, { useEffect, useMemo, useState } from 'react';
import { NPC } from '../../types';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';

interface SocialPanelProps {
  npcs: NPC[];
}

type SocialSectionKey = 'acquaintance' | 'local';

const SECTION_META: Record<SocialSectionKey, { title: string; emptyText: string }> = {
  acquaintance: {
    title: '相识人物',
    emptyText: '关系网中暂无可查看人物',
  },
  local: {
    title: '所在地区人物',
    emptyText: '当前所在地区暂无其他人物',
  },
};

function getRelationshipBadge(npc: NPC): {
  label: string;
  color: string;
  background: string;
  borderColor: string;
} {
  if (npc.category === 'local') {
    return {
      label: '同处一地',
      color: '#14b8a6',
      background: 'rgba(20, 184, 166, 0.12)',
      borderColor: 'rgba(20, 184, 166, 0.45)',
    };
  }

  if (npc.relationshipLabel) {
    return {
      label: npc.relationshipLabel,
      color: '#d97706',
      background: 'rgba(217, 119, 6, 0.12)',
      borderColor: 'rgba(217, 119, 6, 0.45)',
    };
  }

  if (npc.relationship > 60) {
    return {
      label: '生死之交',
      color: '#22c55e',
      background: 'rgba(34, 197, 94, 0.12)',
      borderColor: 'rgba(34, 197, 94, 0.45)',
    };
  }

  if (npc.relationship > 20) {
    return {
      label: '泛泛之交',
      color: '#a8a29e',
      background: 'rgba(168, 162, 158, 0.1)',
      borderColor: 'rgba(168, 162, 158, 0.35)',
    };
  }

  return {
    label: '初次见面',
    color: '#78716c',
    background: 'rgba(120, 113, 108, 0.1)',
    borderColor: 'rgba(120, 113, 108, 0.28)',
  };
}

function getNpcSubtitle(npc: NPC): string {
  const role = npc.template.type || '江湖人士';
  if (npc.location) {
    return `${role} · ${npc.location}`;
  }
  return role;
}

export const SocialPanel: React.FC<SocialPanelProps> = ({ npcs }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<SocialSectionKey, boolean>>({
    acquaintance: false,
    local: false,
  });

  const groupedNpcs = useMemo(
    () => ({
      acquaintance: npcs.filter(npc => npc.category === 'acquaintance'),
      local: npcs.filter(npc => npc.category === 'local'),
    }),
    [npcs],
  );

  const orderedNpcs = useMemo(() => [...groupedNpcs.acquaintance, ...groupedNpcs.local], [groupedNpcs]);

  useEffect(() => {
    if (orderedNpcs.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !orderedNpcs.some(npc => npc.id === selectedId)) {
      setSelectedId(orderedNpcs[0].id);
    }
  }, [orderedNpcs, selectedId]);

  const selected = orderedNpcs.find(npc => npc.id === selectedId) || null;

  const toggleSection = (section: SocialSectionKey) => {
    setCollapsedSections(previous => ({
      ...previous,
      [section]: !previous[section],
    }));
  };

  const renderNpcSection = (section: SocialSectionKey) => {
    const meta = SECTION_META[section];
    const sectionNpcs = groupedNpcs[section];
    const isCollapsed = collapsedSections[section];

    return (
      <div
        key={section}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <button
          type="button"
          onClick={() => toggleSection(section)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#a8a29e',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                background: section === 'acquaintance' ? '#d97706' : '#14b8a6',
                transform: 'rotate(45deg)',
                flexShrink: 0,
              }}
            ></span>
            <span style={{ fontSize: '0.82rem', letterSpacing: '0.08em', color: '#d6d3d1' }}>{meta.title}</span>
            <span
              style={{
                fontSize: '0.72rem',
                color: '#78716c',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '1px 6px',
                borderRadius: '999px',
              }}
            >
              {sectionNpcs.length}
            </span>
          </span>
          <span style={{ fontSize: '0.72rem', color: '#78716c' }}>{isCollapsed ? '展开' : '收起'}</span>
        </button>

        {!isCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sectionNpcs.length > 0 ? (
              sectionNpcs.map(npc => {
                const badge = getRelationshipBadge(npc);
                const isSelected = selected?.id === npc.id;

                return (
                  <button
                    type="button"
                    key={npc.id}
                    onClick={() => setSelectedId(npc.id)}
                    style={{
                      width: '100%',
                      padding: '0.95rem',
                      border: '1px solid',
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderColor: isSelected ? '#d97706' : 'rgba(255,255,255,0.1)',
                      background: isSelected ? 'rgba(217, 119, 6, 0.1)' : 'rgba(255,255,255,0.02)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span style={{ color: '#e7e5e4', fontWeight: 'bold' }}>{npc.name}</span>
                        <span style={{ color: '#78716c', fontSize: '0.78rem', lineHeight: '1.4' }}>
                          {getNpcSubtitle(npc)}
                        </span>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: '0.7rem',
                          color: badge.color,
                          border: '1px solid',
                          borderColor: badge.borderColor,
                          padding: '2px 7px',
                          borderRadius: '999px',
                          background: badge.background,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div
                style={{
                  padding: '0.8rem 0.9rem',
                  color: '#57534e',
                  fontSize: '0.82rem',
                  border: '1px dashed rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                {meta.emptyText}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', height: '100%' }}>
      <div
        style={{
          borderRight: '1px solid rgba(255,255,255,0.1)',
          paddingRight: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          overflowY: 'auto',
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: '0.8rem',
            color: '#78716c',
            letterSpacing: '0.1em',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          江湖人物簿
        </h4>
        {renderNpcSection('acquaintance')}
        {renderNpcSection('local')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '0.5rem' }}>
        {selected ? (
          <div style={{ animation: 'fadeIn 0.5s', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    background: '#292524',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #44403c',
                  }}
                >
                  <span style={{ fontSize: '2rem', color: '#57534e', fontFamily: 'serif' }}>
                    {selected.name.charAt(0) || '侠'}
                  </span>
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '2rem', color: '#e7e5e4', fontFamily: 'serif' }}>
                    {selected.name}
                  </h2>
                  <div style={{ color: '#d97706', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    {selected.template.type || '江湖人士'}
                  </div>
                  {selected.location && (
                    <div style={{ color: '#78716c', fontSize: '0.78rem', marginTop: '0.3rem' }}>
                      {selected.location}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '1.25rem',
              }}
            >
              <h4
                style={{
                  margin: '0 0 1rem 0',
                  fontSize: '0.9rem',
                  color: '#a8a29e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Icons.Combat size={16} /> 功法根基
              </h4>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    color: '#d97706',
                    border: '1px solid #78350f',
                    padding: '2px 8px',
                    background: 'rgba(120, 53, 15, 0.2)',
                  }}
                >
                  {selected.template.martialArtsRank || '未知品阶'}
                </span>
                <span style={{ color: '#a8a29e', border: '1px solid #44403c', padding: '2px 8px' }}>
                  {selected.template.mastery || '未知掌握'}
                </span>
              </div>
              <p style={{ color: '#d6d3d1', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                {selected.template.martialArtsDescription || '尚未探明其武学底细。'}
              </p>

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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <h4
                  style={{
                    fontSize: '0.9rem',
                    color: '#a8a29e',
                    marginBottom: '0.75rem',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    paddingBottom: '0.25rem',
                  }}
                >
                  重要物品
                </h4>
                {selected.keyItems.length > 0 ? (
                  <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#d6d3d1', fontSize: '0.9rem' }}>
                    {selected.keyItems.map((item, index) => (
                      <li key={index} style={{ marginBottom: '0.25rem' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: '#57534e', fontSize: '0.85rem' }}>暂无知悉</span>
                )}
              </div>

              <div>
                <h4
                  style={{
                    fontSize: '0.9rem',
                    color: '#a8a29e',
                    marginBottom: '0.75rem',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    paddingBottom: '0.25rem',
                  }}
                >
                  人情世故
                </h4>
                {selected.network.length > 0 ? (
                  <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#d6d3d1', fontSize: '0.9rem' }}>
                    {selected.network.map((person, index) => (
                      <li key={index} style={{ marginBottom: '0.25rem' }}>
                        {person}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: '#57534e', fontSize: '0.85rem' }}>独来独往</span>
                )}
              </div>
            </div>

            <div>
              <h4
                style={{
                  fontSize: '0.9rem',
                  color: '#a8a29e',
                  marginBottom: '0.75rem',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  paddingBottom: '0.25rem',
                }}
              >
                生平往事
              </h4>
              <p style={{ color: '#d6d3d1', fontSize: '0.95rem', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                {selected.biography || '尚无记载。'}
              </p>
            </div>

            <div
              style={{
                marginTop: 'auto',
                display: 'flex',
                gap: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <button
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'transparent',
                  border: '1px solid #44403c',
                  color: '#a8a29e',
                  cursor: 'pointer',
                  fontFamily: 'serif',
                }}
              >
                切磋武艺
              </button>
              <button
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'transparent',
                  border: '1px solid #44403c',
                  color: '#a8a29e',
                  cursor: 'pointer',
                  fontFamily: 'serif',
                }}
              >
                赠送厚礼
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            message={orderedNpcs.length === 0 ? '暂无可查看的江湖人物。' : '请从左侧选择一位江湖侠士，查看其生平详情。'}
          />
        )}
      </div>
    </div>
  );
};
