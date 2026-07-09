import React, { useEffect, useMemo, useState } from 'react';
import type { NPC } from '../../types';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';

interface SocialPanelProps {
  npcs: NPC[];
}

type SocialSectionKey = NPC['category'];

interface SectionMeta {
  title: string;
  emptyText: string;
  description: string;
}

const SECTION_META: Record<SocialSectionKey, SectionMeta> = {
  acquaintance: {
    title: '相识人物',
    description: '来自你的关系网',
    emptyText: '关系网中暂无可查看人物',
  },
  local: {
    title: '同处一地',
    description: '与你当前所在位置相同',
    emptyText: '当前所在地区暂无其他人物',
  },
};

function clampRelationship(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function getRelationshipMeta(npc: NPC): { label: string; seal: string; modifier: string; progress: number } {
  if (npc.category === 'local') {
    return {
      label: '同处一地',
      seal: '邻',
      modifier: 'local',
      progress: 12,
    };
  }

  const relationValue = clampRelationship(npc.relationship);
  if (npc.relationshipLabel) {
    return {
      label: npc.relationshipLabel,
      seal: npc.relationshipLabel.charAt(0) || '缘',
      modifier: relationValue >= 60 ? 'strong' : 'known',
      progress: Math.max(8, relationValue),
    };
  }

  if (relationValue >= 60) {
    return { label: '生死之交', seal: '挚', modifier: 'strong', progress: relationValue };
  }
  if (relationValue >= 20) {
    return { label: '泛泛之交', seal: '识', modifier: 'known', progress: relationValue };
  }
  return {
    label: relationValue > 0 ? '初识' : '相识未深',
    seal: '初',
    modifier: 'faint',
    progress: Math.max(8, relationValue),
  };
}

function getNpcSubtitle(npc: NPC): string {
  const role = npc.template.type || '江湖人士';
  return npc.location ? `${role} / ${npc.location}` : role;
}

function renderFallbackList(items: string[], emptyText: string) {
  if (items.length === 0) {
    return <div className="social-detail-empty">{emptyText}</div>;
  }

  return (
    <ul className="social-detail-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

export const SocialPanel: React.FC<SocialPanelProps> = ({ npcs }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SocialSectionKey, boolean>>({
    acquaintance: true,
    local: true,
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
      setDetailOpen(false);
      return;
    }

    if (!selectedId || !orderedNpcs.some(npc => npc.id === selectedId)) {
      setSelectedId(orderedNpcs[0].id);
      setDetailOpen(false);
    }
  }, [orderedNpcs, selectedId]);

  const selectedNpc = orderedNpcs.find(npc => npc.id === selectedId) || orderedNpcs[0] || null;
  const selectedRelation = selectedNpc ? getRelationshipMeta(selectedNpc) : null;
  const traitEntries = selectedNpc ? Object.entries(selectedNpc.template.traits) : [];

  const handleSelectNpc = (npc: NPC) => {
    setSelectedId(npc.id);
    setDetailOpen(true);
  };

  const toggleSection = (section: SocialSectionKey) => {
    setOpenSections(current => ({ ...current, [section]: !current[section] }));
  };

  const renderSection = (section: SocialSectionKey) => {
    const meta = SECTION_META[section];
    const sectionNpcs = groupedNpcs[section];
    const isOpen = openSections[section];

    return (
      <section className={`social-section social-section-${section}`} key={section}>
        <button
          type="button"
          className="social-section-header"
          onClick={() => toggleSection(section)}
          aria-expanded={isOpen}
        >
          <span className="social-section-title-block">
            <span className="social-section-title">{meta.title}</span>
            <span className="social-section-desc">{meta.description}</span>
          </span>
          <span className="social-section-meta">
            <span className="social-section-count">{sectionNpcs.length}</span>
            {isOpen ? <Icons.ChevronUp size={16} /> : <Icons.ChevronDown size={16} />}
          </span>
        </button>

        {isOpen && (
          <div className="social-roster-list">
            {sectionNpcs.length > 0 ? (
              sectionNpcs.map(npc => {
                const relation = getRelationshipMeta(npc);
                const isSelected = selectedNpc?.id === npc.id;
                const style = { '--social-relation-progress': `${relation.progress}%` } as React.CSSProperties;

                return (
                  <button
                    type="button"
                    key={npc.id}
                    className={`social-member-card ${isSelected ? 'is-selected' : ''}`}
                    style={style}
                    onClick={() => handleSelectNpc(npc)}
                  >
                    <span className={`social-relation-seal ${relation.modifier}`} title={relation.label}>
                      {relation.seal}
                    </span>
                    <span className="social-member-copy">
                      <span className="social-member-name">{npc.name || '未知人物'}</span>
                      <span className="social-member-subtitle">{getNpcSubtitle(npc)}</span>
                      <span className="social-relation-track" aria-hidden="true">
                        <span className="social-relation-fill"></span>
                      </span>
                    </span>
                    <span className="social-member-relation">{relation.label}</span>
                  </button>
                );
              })
            ) : (
              <div className="social-section-empty">{meta.emptyText}</div>
            )}
          </div>
        )}
      </section>
    );
  };

  if (orderedNpcs.length === 0) {
    return (
      <div className="social-panel social-panel-empty">
        <div className="social-panel-head">
          <div>
            <div className="social-panel-kicker">江湖名册</div>
            <h3 className="social-panel-title">未录侠缘</h3>
          </div>
          <div className="social-total-seal">0</div>
        </div>
        <EmptyState message="江湖未识一人" />
      </div>
    );
  }

  return (
    <div className="social-panel">
      <div className="social-panel-head">
        <div className="social-title-stack">
          <div className="social-panel-kicker">江湖名册</div>
          <h3 className="social-panel-title">往来人物</h3>
        </div>
        <div className="social-summary-strip" aria-label="侠缘统计">
          <span>
            相识
            <b>{groupedNpcs.acquaintance.length}</b>
          </span>
          <span>
            同地
            <b>{groupedNpcs.local.length}</b>
          </span>
          <span>
            合计
            <b>{orderedNpcs.length}</b>
          </span>
        </div>
      </div>

      <div className={`social-body ${detailOpen ? 'detail-open' : ''}`}>
        <div className="social-roster" aria-label="侠缘人物名册">
          {renderSection('acquaintance')}
          {renderSection('local')}
        </div>

        <div className="social-detail" aria-label="侠缘人物详情">
          {selectedNpc && selectedRelation ? (
            <article className="social-detail-inner">
              <button type="button" className="social-detail-back" onClick={() => setDetailOpen(false)}>
                <Icons.ArrowLeft size={16} />
                返回名册
              </button>

              <header className="social-detail-hero">
                <div className="social-portrait" aria-hidden="true">
                  <span>{selectedNpc.name.charAt(0) || '侠'}</span>
                </div>
                <div className="social-hero-copy">
                  <div className="social-hero-label">{selectedRelation.label}</div>
                  <h3 className="social-hero-name">{selectedNpc.name || '未知人物'}</h3>
                  <div className="social-hero-meta">
                    <span>{selectedNpc.template.type || '江湖人士'}</span>
                    {selectedNpc.location && <span>{selectedNpc.location}</span>}
                    {selectedNpc.category === 'acquaintance' && (
                      <span>关系值 {clampRelationship(selectedNpc.relationship)}</span>
                    )}
                  </div>
                </div>
                <span className={`social-relation-seal social-hero-seal ${selectedRelation.modifier}`}>
                  {selectedRelation.seal}
                </span>
              </header>

              <section className="social-detail-card">
                <div className="social-detail-card-head">
                  <Icons.Combat size={16} />
                  <span>功法根基</span>
                </div>
                <div className="social-tag-row">
                  <span className="social-tag">{selectedNpc.template.martialArtsRank || '未知品阶'}</span>
                  <span className="social-tag muted">{selectedNpc.template.mastery || '未知掌握'}</span>
                </div>
                <p className="social-detail-text">
                  {selectedNpc.template.martialArtsDescription || '尚未探明其武学底细。'}
                </p>
                {traitEntries.length > 0 && (
                  <div className="social-trait-grid">
                    {traitEntries.map(([trait, desc]) => (
                      <div className="social-trait-chip" key={trait}>
                        <span>{trait}</span>
                        <small>{desc || '尚未详载'}</small>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="social-detail-columns">
                <section className="social-detail-card compact">
                  <div className="social-detail-card-head">
                    <Icons.Inventory size={16} />
                    <span>重要物品</span>
                  </div>
                  {renderFallbackList(selectedNpc.keyItems, '无可记载物品')}
                </section>

                <section className="social-detail-card compact">
                  <div className="social-detail-card-head">
                    <Icons.Social size={16} />
                    <span>人情世故</span>
                  </div>
                  {renderFallbackList(selectedNpc.network, '暂无关系线索')}
                </section>
              </div>

              <section className="social-detail-card">
                <div className="social-detail-card-head">
                  <Icons.FileText size={16} />
                  <span>生平往事</span>
                </div>
                <p className="social-detail-text">{selectedNpc.biography || '尚无记载。'}</p>
              </section>
            </article>
          ) : (
            <EmptyState message="请自名册择一侠士，阅其生平" />
          )}
        </div>
      </div>
    </div>
  );
};
