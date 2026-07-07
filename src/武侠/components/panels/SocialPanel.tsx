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

  return (
    <div className="flex flex-col h-full relative" style={{ gap: '12px' }}>
      {/* 标题 */}
      <div
        className="wuxia panel-rect panel-bar-md"
        style={{
          padding: '8px 24px',
          textAlign: 'center',
          fontSize: '18px',
          letterSpacing: '4px',
          color: 'var(--color-ink)',
          fontFamily: 'var(--font-wuxia)',
        }}
      >
        侠缘
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-4">
        <button
          className={`wuxia btn-wuxia btn-sm ${
            activeTab === 'acquaintance' ? 'btn-dark' : 'btn-outline'
          }`}
          onClick={() => setActiveTab('acquaintance')}
        >
          结识
        </button>
        <button
          className={`wuxia btn-wuxia btn-sm ${
            activeTab === 'local' ? 'btn-dark' : 'btn-outline'
          }`}
          onClick={() => setActiveTab('local')}
        >
          当地
        </button>
      </div>

      {/* 列表 */}
      <div
        className="wuxia panel-rect panel-rect-md flex-1 overflow-y-auto"
        style={{ padding: '16px' }}
      >
        {filteredNpcs.length === 0 ? (
          <EmptyState
            message={`暂无${activeTab === 'acquaintance' ? '结识的侠客' : '当地的侠客'}`}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {filteredNpcs.map((npc) => (
              <div
                key={npc.id}
                className="quest-item"
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setSelectedNpc(npc)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="wuxia circle-frame circle-frame-ink flex items-center justify-center shrink-0"
                    style={{ width: '48px', height: '48px' }}
                  >
                    <span
                      style={{
                        fontSize: '20px',
                        color: 'var(--color-ink)',
                        fontFamily: 'var(--font-wuxia)',
                      }}
                    >
                      {npc.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="quest-title">{npc.name}</div>
                    <div className="quest-desc">
                      {npc.relationshipLabel || '萍水相逢'} ({npc.relationship}) |{' '}
                      {npc.location || '未知'}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  <button
                    className="btn-inline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNpc(npc);
                    }}
                  >
                    查看
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedNpc && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 bg-black/40"
          onClick={() => setSelectedNpc(null)}
        >
          <div
            className="wuxia panel-rect panel-rect-lg relative flex flex-col"
            style={{
              width: '420px',
              maxHeight: '80vh',
              padding: '24px',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 border-b border-[rgba(90,70,50,0.2)] pb-4 shrink-0">
              <div
                className="wuxia circle-frame circle-frame-ink flex items-center justify-center shrink-0"
                style={{ width: '64px', height: '64px' }}
              >
                <span
                  style={{
                    fontSize: '28px',
                    color: 'var(--color-ink)',
                    fontFamily: 'var(--font-wuxia)',
                  }}
                >
                  {selectedNpc.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1">
                <div
                  style={{
                    fontSize: '22px',
                    fontFamily: 'var(--font-wuxia)',
                    color: 'var(--color-ink)',
                  }}
                >
                  {selectedNpc.name}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--color-ink-light)',
                    marginTop: '4px',
                  }}
                >
                  {selectedNpc.relationshipLabel || '萍水相逢'} ({selectedNpc.relationship}) |{' '}
                  {selectedNpc.location || '未知'}
                </div>
              </div>
            </div>

            {/* Content */}
            <div
              className="flex-1 overflow-y-auto pr-2"
              style={{
                fontSize: '14px',
                color: 'var(--color-ink-mid)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <div
                  className="font-bold mb-1"
                  style={{ letterSpacing: '2px', color: 'var(--color-ink)' }}
                >
                  【生平】
                </div>
                <div style={{ lineHeight: '1.6' }}>
                  {selectedNpc.biography || '暂无记载'}
                </div>
              </div>

              <div>
                <div
                  className="font-bold mb-1"
                  style={{ letterSpacing: '2px', color: 'var(--color-ink)' }}
                >
                  【武学】
                </div>
                <div className="bg-[rgba(90,70,50,0.05)] p-2 border border-[rgba(90,70,50,0.1)]">
                  <div className="flex justify-between mb-1">
                    <span>
                      <span style={{ color: 'var(--color-ink-light)' }}>主修：</span>
                      {selectedNpc.template?.type || '未知'}
                    </span>
                    <span>
                      <span style={{ color: 'var(--color-ink-light)' }}>造诣：</span>
                      {selectedNpc.template?.mastery || '未知'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-ink-light)' }}>品阶：</span>
                    {selectedNpc.template?.martialArtsRank || '未知'}
                  </div>
                  <div className="mt-1" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    {selectedNpc.template?.martialArtsDescription || ''}
                  </div>

                  {selectedNpc.template?.traits &&
                    Object.keys(selectedNpc.template.traits).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[rgba(90,70,50,0.1)]">
                        <span style={{ color: 'var(--color-ink-light)' }}>特性：</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(selectedNpc.template.traits).map(
                            ([traitName, traitDesc]) => (
                              <span
                                key={traitName}
                                className="inline-block px-1 border border-[rgba(90,70,50,0.2)]"
                                style={{ fontSize: '12px' }}
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
              </div>

              {selectedNpc.keyItems && selectedNpc.keyItems.length > 0 && (
                <div>
                  <div
                    className="font-bold mb-1"
                    style={{ letterSpacing: '2px', color: 'var(--color-ink)' }}
                  >
                    【身携之物】
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedNpc.keyItems.map((item, idx) => (
                      <span
                        key={idx}
                        className="bg-[rgba(90,70,50,0.05)] px-2 py-1 border border-[rgba(90,70,50,0.1)]"
                        style={{ fontSize: '13px' }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedNpc.network && selectedNpc.network.length > 0 && (
                <div>
                  <div
                    className="font-bold mb-1"
                    style={{ letterSpacing: '2px', color: 'var(--color-ink)' }}
                  >
                    【人际】
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedNpc.network.map((person, idx) => (
                      <span
                        key={idx}
                        className="underline decoration-[rgba(90,70,50,0.3)] underline-offset-2"
                        style={{ fontSize: '13px' }}
                      >
                        {person}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end pt-2 mt-2 shrink-0">
              <button
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
