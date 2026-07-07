import React, { useState } from 'react';
import type { NPC } from '../../types';
import { EmptyState } from './EmptyState';

interface SocialPanelProps {
  npcs: NPC[];
}

type TabCategory = 'acquaintance' | 'local';

export const SocialPanel: React.FC<SocialPanelProps> = ({ npcs }) => {
  const [activeTab, setActiveTab] = useState<TabCategory>('acquaintance');
  const [selectedNpc, setSelectedNpc] = useState<NPC | null>(null);

  const filteredNpcs = npcs.filter((npc) => npc.category === activeTab);
  const emptyMessage = `暂无${activeTab === 'acquaintance' ? '结识的侠客' : '当地的侠客'}`;

  return (
    <div className="social-panel">
      <div className="social-panel-heading">
        <div className="wuxia brush-bar brush-bar-md social-panel-title">侠缘</div>
        <p className="social-panel-subtitle">江湖相逢皆有痕，结识与当地人物分册而录。</p>
      </div>

      <div className="social-panel-tabs">
        <button
          type="button"
          className={`wuxia btn-wuxia btn-sm social-panel-tab-button ${
            activeTab === 'acquaintance' ? 'btn-dark' : 'btn-outline'
          }`}
          onClick={() => setActiveTab('acquaintance')}
        >
          结识
        </button>
        <button
          type="button"
          className={`wuxia btn-wuxia btn-sm social-panel-tab-button ${
            activeTab === 'local' ? 'btn-dark' : 'btn-outline'
          }`}
          onClick={() => setActiveTab('local')}
        >
          当地
        </button>
      </div>

      <div className="panel-rect panel-rect-lg social-panel-list-frame">
        <div className="social-panel-list-scroll">
          {filteredNpcs.length === 0 ? (
            <div className="social-panel-empty">
              <EmptyState message={emptyMessage} />
            </div>
          ) : (
            <div className="social-panel-list">
              {filteredNpcs.map((npc) => (
                <div
                  key={npc.id}
                  className="social-panel-item"
                  onClick={() => setSelectedNpc(npc)}
                >
                  <div className="social-panel-item-main">
                    <div className="circle-frame circle-frame-ink social-panel-avatar social-panel-avatar--sm">
                      <span className="social-panel-avatar-initial social-panel-avatar-initial--sm">
                        {npc.name.charAt(0)}
                      </span>
                    </div>

                    <div className="social-panel-copy">
                      <div className="social-panel-copy-head">
                        <div className="quest-title">{npc.name}</div>
                        <span className="social-panel-relationship-badge">
                          {npc.relationshipLabel || '萍水相逢'}
                        </span>
                      </div>
                      <div className="quest-desc">
                        情谊 {npc.relationship} · {npc.location || '未知地点'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-inline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNpc(npc);
                    }}
                  >
                    查看
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedNpc && (
        <div className="social-panel-detail-overlay" onClick={() => setSelectedNpc(null)}>
          <div
            className="panel-rect panel-rect-lg social-panel-detail-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="social-panel-detail-header">
              <div className="circle-frame circle-frame-ink social-panel-avatar social-panel-avatar--lg">
                <span className="social-panel-avatar-initial social-panel-avatar-initial--lg">
                  {selectedNpc.name.charAt(0)}
                </span>
              </div>

              <div className="social-panel-detail-identity">
                <div className="social-panel-detail-name">
                  {selectedNpc.name}
                </div>
                <div className="social-panel-detail-meta">
                  {selectedNpc.relationshipLabel || '萍水相逢'} ({selectedNpc.relationship}) |{' '}
                  {selectedNpc.location || '未知'}
                </div>
              </div>
            </div>

            <div className="social-panel-detail-body">
              <section className="social-panel-detail-section">
                <div className="social-panel-section-heading">
                  【生平】
                </div>
                <div className="social-panel-detail-text">
                  {selectedNpc.biography || '暂无记载'}
                </div>
              </section>

              <section className="social-panel-detail-section">
                <div className="social-panel-section-heading">
                  【武学】
                </div>
                <div className="social-panel-detail-box">
                  <div className="social-panel-stat-row">
                    <span>
                      <span className="social-panel-stat-label">主修：</span>
                      {selectedNpc.template?.type || '未知'}
                    </span>
                    <span>
                      <span className="social-panel-stat-label">造诣：</span>
                      {selectedNpc.template?.mastery || '未知'}
                    </span>
                  </div>
                  <div className="social-panel-stat-row">
                    <span>
                      <span className="social-panel-stat-label">品阶：</span>
                      {selectedNpc.template?.martialArtsRank || '未知'}
                    </span>
                  </div>
                  <div className="social-panel-detail-text">
                    {selectedNpc.template?.martialArtsDescription || '暂无记载'}
                  </div>

                  {selectedNpc.template?.traits &&
                    Object.keys(selectedNpc.template.traits).length > 0 && (
                      <div className="social-panel-detail-section">
                        <div className="social-panel-stat-label">特性</div>
                        <div className="social-panel-chip-list">
                          {Object.entries(selectedNpc.template.traits).map(
                            ([traitName, traitDesc]) => (
                              <span
                                key={traitName}
                                className="social-panel-chip"
                                title={traitDesc}
                              >
                                {traitName}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </section>

              {selectedNpc.keyItems && selectedNpc.keyItems.length > 0 && (
                <section className="social-panel-detail-section">
                  <div className="social-panel-section-heading">
                    【身携之物】
                  </div>
                  <div className="social-panel-chip-list">
                    {selectedNpc.keyItems.map((item, idx) => (
                      <span key={idx} className="social-panel-chip">
                        {item}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {selectedNpc.network && selectedNpc.network.length > 0 && (
                <section className="social-panel-detail-section">
                  <div className="social-panel-section-heading">
                    【人际】
                  </div>
                  <div className="social-panel-chip-list">
                    {selectedNpc.network.map((person, idx) => (
                      <span key={idx} className="social-panel-chip social-panel-chip--link">
                        {person}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="social-panel-detail-footer">
              <button
                type="button"
                className="wuxia btn-wuxia btn-outline btn-md"
                onClick={() => setSelectedNpc(null)}
              >
                收起
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
