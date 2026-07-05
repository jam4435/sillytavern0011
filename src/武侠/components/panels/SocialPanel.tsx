import React, { useEffect, useMemo, useState } from 'react';
import { NPC, UiTheme, UI_THEMES } from '../../types';
import { Icons } from '../Icons';
import { buildInkSpriteStyle } from './socialSprites';

interface SocialPanelProps {
  npcs: NPC[];
  theme: UiTheme;
  onThemeChange: (theme: UiTheme) => void;
}

type SocialSectionKey = 'acquaintance' | 'local';

const SECTION_META: Record<SocialSectionKey, { title: string; emptyText: string }> = {
  acquaintance: {
    title: '相识人物',
    emptyText: '关系网中暂无可查看人物',
  },
  local: {
    title: '同处一地',
    emptyText: '当前所在地区暂无其他人物',
  },
};

// 关系印：朱砂方印，印面取一字，一眼可识等级。
// 返回印面文字 + 修饰类（控制印色），供概览叶与详情页首复用。
function getRelationshipSeal(npc: NPC): { glyph: string; modifier: string; tier: string } {
  if (npc.category === 'local') {
    return { glyph: '邻', modifier: 'seal-local', tier: '同处一地' };
  }
  if (npc.relationshipLabel) {
    // 师父/仇人/挚友等自定义标签 —— 取首字入印
    return { glyph: npc.relationshipLabel.charAt(0), modifier: '', tier: npc.relationshipLabel };
  }
  if (npc.relationship > 60) {
    return { glyph: '挚', modifier: '', tier: '生死之交' };
  }
  if (npc.relationship > 20) {
    return { glyph: '识', modifier: 'seal-first', tier: '泛泛之交' };
  }
  return { glyph: '初', modifier: 'seal-faint', tier: '初次见面' };
}

function getNpcSubtitle(npc: NPC): string {
  const role = npc.template.type || '江湖人士';
  if (npc.location) {
    return `${role} · ${npc.location}`;
  }
  return role;
}

// 墨痕进度：relationship 0-100 映射到 4%-100%，保证有底可见。
function getInkWidth(npc: NPC): string {
  if (npc.category === 'local') return '12%';
  const clamped = Math.max(0, Math.min(100, npc.relationship));
  return `${Math.max(4, clamped)}%`;
}

export const SocialPanel: React.FC<SocialPanelProps> = ({ npcs }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 移动端详情开合：桌面忽略（CSS 并排），手机点叶后翻开详情册页。
  const [detailOpen, setDetailOpen] = useState(false);

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

  const handleSelectNpc = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true); // 手机端翻开详情；桌面 CSS 忽略此态
  };

  const handleBack = () => setDetailOpen(false);

  const renderNpcSection = (section: SocialSectionKey) => {
    const meta = SECTION_META[section];
    const sectionNpcs = groupedNpcs[section];

    return (
      <div key={section} className="social-group">
        <div className="social-group-head">
          <span className="social-group-rule" />
          <h3 className="social-group-title">{meta.title}</h3>
          <span className="social-group-count">{sectionNpcs.length}</span>
        </div>
        <div className="social-group-leaves">
          {sectionNpcs.length > 0 ? (
            sectionNpcs.map(npc => {
              const seal = getRelationshipSeal(npc);
              const isSelected = selected?.id === npc.id;
              return (
                <button
                  type="button"
                  key={npc.id}
                  className={`social-leaf${isSelected ? ' is-selected' : ''}`}
                  onClick={() => handleSelectNpc(npc.id)}
                >
                  <span className="social-leaf-text">
                    <span className="social-leaf-name">{npc.name}</span>
                    <span className="social-leaf-sub">{getNpcSubtitle(npc)}</span>
                    <span className="social-ink-track" aria-hidden="true">
                      <span className="social-ink-fill" style={{ width: getInkWidth(npc) }} />
                    </span>
                  </span>
                  <span className={`social-leaf-seal ${seal.modifier}`} title={seal.tier}>
                    {seal.glyph}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="social-group-empty">{meta.emptyText}</div>
          )}
        </div>
      </div>
    );
  };

  // 空态：关系网中一人皆无
  if (orderedNpcs.length === 0) {
    return (
      <div className="social-panel">
        <div className="social-scroll-frame">
          <span className="social-scroll-cap" />
          <h2 className="social-scroll-title">江湖名册</h2>
          <span className="social-scroll-count">0</span>
          <span className="social-scroll-cap" />
        </div>
        <div className="social-empty">
          <div className="social-empty-ink" />
          <p className="social-empty-text">江湖未识一人</p>
        </div>
      </div>
    );
  }

  return (
    <div className="social-panel">
      <div className="social-scroll-frame">
        <span className="social-scroll-cap" />
        <h2 className="social-scroll-title">江湖名册</h2>
        <span className="social-scroll-count">{orderedNpcs.length}</span>
        <span className="social-scroll-cap" />
      </div>

      <div className={`social-body${detailOpen ? ' detail-open' : ''}`}>
        {/* 左：江湖名册（概览） */}
        <div className="social-roster">
          {renderNpcSection('acquaintance')}
          {renderNpcSection('local')}
        </div>

        {/* 右：展开册页（详情） */}
        <div className="social-detail">
          {selected ? (
            <div className="social-detail-inner">
              <button type="button" className="social-detail-back" onClick={handleBack}>
                ← 返回名册
              </button>

              <div className="social-hero">
                <div className="social-portrait-ink">
                  <span className="social-portrait-glyph">{selected.name.charAt(0) || '侠'}</span>
                </div>
                <div className="social-hero-text">
                  <h2 className="social-hero-name">{selected.name}</h2>
                  <span className="social-hero-role">{selected.template.type || '江湖人士'}</span>
                  {selected.location && <span className="social-hero-loc">{selected.location}</span>}
                </div>
                <span className={`social-leaf-seal social-hero-seal ${getRelationshipSeal(selected).modifier}`}>
                  {getRelationshipSeal(selected).glyph}
                </span>
              </div>

              <div className="social-plaque">
                <h4 className="social-plaque-head">
                  <Icons.Combat size={16} /> 功法根基
                </h4>
                <div className="social-plaque-tags">
                  <span className="social-tag-seal">{selected.template.martialArtsRank || '未知品阶'}</span>
                  <span className="social-tag-seal tag-muted">{selected.template.mastery || '未知掌握'}</span>
                </div>
                <p className="social-plaque-desc">{selected.template.martialArtsDescription || '尚未探明其武学底细。'}</p>

                {Object.entries(selected.template.traits).length > 0 && (
                  <div className="social-traits">
                    <div className="social-traits-label">特性</div>
                    <div>
                      {Object.entries(selected.template.traits).map(([trait, desc]) => (
                        <span key={trait} className="social-trait">
                          <span className="social-trait-name">{trait}</span>
                          <span className="social-trait-desc">{desc}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="social-twin">
                <div className="social-twin-col">
                  <h4 className="social-col-title">重要物品</h4>
                  {selected.keyItems.length > 0 ? (
                    <ul className="social-col-list">
                      {selected.keyItems.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="social-col-empty">无</span>
                  )}
                </div>

                <div className="social-twin-col">
                  <h4 className="social-col-title">人情世故</h4>
                  {selected.network.length > 0 ? (
                    <ul className="social-col-list">
                      {selected.network.map((person, index) => (
                        <li key={index}>{person}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="social-col-empty">无</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="social-bio-title">生平往事</h4>
                <p className="social-bio-text">{selected.biography || '尚无记载。'}</p>
              </div>

              <div className="social-actions">
                <button type="button" className="social-action-btn">
                  切磋武艺
                </button>
                <button type="button" className="social-action-btn">
                  赠送厚礼
                </button>
              </div>
            </div>
          ) : (
            <div className="social-empty">
              <div className="social-empty-ink" />
              <p className="social-empty-text">请自名册择一侠士，阅其生平</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
