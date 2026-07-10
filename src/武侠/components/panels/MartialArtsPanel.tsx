import React, { CSSProperties, useCallback, useMemo, useState } from 'react';
import { MartialArt } from '../../types';
import { getRankVisual, resolveMartialArtIcon } from '../../utils/iconCatalog';
import { gameLogger } from '../../utils/logger';
import {
  upgradeMartialArt,
  type MartialArtsRank,
  type MasteryLevel,
} from '../../utils/martialArtsDatabase';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';

type MartialTypeFilter =
  | 'ALL'
  | '内功'
  | '外功'
  | '轻功'
  | '剑法'
  | '刀法'
  | '拳掌'
  | '指法'
  | '暗器'
  | '枪戟'
  | '棍锤';

type MartialRankFilter = 'ALL' | '粗浅' | '传家' | '上乘' | '镇派' | '绝世' | '传说';

const TYPE_FILTERS: Array<{ key: MartialTypeFilter; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: '内功', label: '内功' },
  { key: '外功', label: '外功' },
  { key: '轻功', label: '轻功' },
  { key: '剑法', label: '剑法' },
  { key: '刀法', label: '刀法' },
  { key: '拳掌', label: '拳掌' },
  { key: '指法', label: '指法' },
  { key: '暗器', label: '暗器' },
  { key: '枪戟', label: '枪戟' },
  { key: '棍锤', label: '棍锤' },
];

const RANK_FILTERS: Array<{ key: MartialRankFilter; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: '粗浅', label: '粗浅' },
  { key: '传家', label: '传家' },
  { key: '上乘', label: '上乘' },
  { key: '镇派', label: '镇派' },
  { key: '绝世', label: '绝世' },
  { key: '传说', label: '传说' },
];

const getMasteryColor = (mastery: string): string => {
  const colors: Record<string, string> = {
    初窥门径: '#a8a29e',
    略有小成: '#4ade80',
    融会贯通: '#60a5fa',
    炉火纯青: '#c084fc',
    出神入化: '#fbbf24',
  };
  return colors[mastery] || '#a8a29e';
};

interface MartialArtsPanelProps {
  martialArts: Record<string, MartialArt>;
  cultivation: number;
  comprehension: number;
  onUpgrade?: (result: {
    success: boolean;
    martialArtName: string;
    newMastery?: string;
    newCultivation?: number;
    error?: string;
  }) => void;
}

export const MartialArtsPanel: React.FC<MartialArtsPanelProps> = ({
  martialArts,
  cultivation,
  comprehension,
  onUpgrade,
}) => {
  const [selectedArtName, setSelectedArtName] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<MartialTypeFilter>('ALL');
  const [rankFilter, setRankFilter] = useState<MartialRankFilter>('ALL');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [upgradingArt, setUpgradingArt] = useState<string | null>(null);

  const artEntries = useMemo(() => Object.entries(martialArts), [martialArts]);
  const filteredArts = useMemo(
    () =>
      artEntries.filter(([, art]) => {
        const typeMatched = typeFilter === 'ALL' || art.type === typeFilter;
        const rankMatched = rankFilter === 'ALL' || art.rank === rankFilter;
        return typeMatched && rankMatched;
      }),
    [artEntries, rankFilter, typeFilter],
  );

  const selectedEntry = filteredArts.find(([name]) => name === selectedArtName) ?? filteredArts[0] ?? null;
  const selectedName = selectedEntry?.[0] ?? null;
  const selectedArt = selectedEntry?.[1] ?? null;
  const selectedRank = selectedArt ? getRankVisual(selectedArt.rank, 'martial') : null;
  const selectedMasteryColor = selectedArt ? getMasteryColor(selectedArt.mastery) : '#a8a29e';
  const selectedIcon = selectedName && selectedArt ? resolveMartialArtIcon(selectedName, selectedArt) : null;
  const unlockedEntries = selectedArt ? Object.entries(selectedArt.unlockedTraits || {}) : [];
  const lockedEntries =
    selectedArt && selectedArt.traits
      ? Object.entries(selectedArt.traits).filter(([traitName]) => !selectedArt.unlockedTraits?.[traitName])
      : [];

  const handleUpgrade = useCallback(
    async (artName: string, art: MartialArt) => {
      if (!art.canUpgrade || upgradingArt) return;

      setUpgradingArt(artName);

      try {
        const result = await upgradeMartialArt(
          artName,
          art.mastery as MasteryLevel,
          cultivation,
          art.rank as MartialArtsRank,
          comprehension,
        );

        onUpgrade?.({
          success: result.success,
          martialArtName: artName,
          newMastery: result.newMastery,
          newCultivation: result.newCultivation,
          error: result.error,
        });

        if (result.success) {
          gameLogger.log(`[MartialArtsPanel] 功法升级成功: ${artName} -> ${result.newMastery}`);
        } else {
          gameLogger.error(`[MartialArtsPanel] 功法升级失败: ${result.error}`);
        }
      } catch (error) {
        gameLogger.error('[MartialArtsPanel] 升级出错:', error);
        onUpgrade?.({
          success: false,
          martialArtName: artName,
          error: error instanceof Error ? error.message : '升级失败',
        });
      } finally {
        setUpgradingArt(null);
      }
    },
    [comprehension, cultivation, onUpgrade, upgradingArt],
  );

  const handleSelectArt = (name: string) => {
    setSelectedArtName(name);
    setIsDetailOpen(true);
  };

  if (artEntries.length === 0) {
    return <EmptyState message="尚未修习任何武学功法。" variant="manual" />;
  }

  return (
    <div className={`martial-art-panel workbench-panel ${isDetailOpen ? 'detail-open' : ''}`}>
      <section className="workbench-list-pane" aria-label="功法列表">
        <div className="workbench-filter-block">
          <div className="workbench-filter-row" aria-label="功法类型筛选">
            {TYPE_FILTERS.map(filter => (
              <button
                key={filter.key}
                className={`workbench-filter-chip ${typeFilter === filter.key ? 'active' : ''}`}
                onClick={() => {
                  setTypeFilter(filter.key);
                  setIsDetailOpen(false);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="workbench-filter-row" aria-label="功法品阶筛选">
            {RANK_FILTERS.map(filter => (
              <button
                key={filter.key}
                className={`workbench-filter-chip compact ${rankFilter === filter.key ? 'active' : ''}`}
                onClick={() => {
                  setRankFilter(filter.key);
                  setIsDetailOpen(false);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {filteredArts.length > 0 ? (
          <div className="workbench-list" role="list">
            {filteredArts.map(([name, art]) => {
              const rank = getRankVisual(art.rank, 'martial');
              const masteryColor = getMasteryColor(art.mastery);
              const icon = resolveMartialArtIcon(name, art);
              const isSelected = selectedName === name;
              const itemStyle = {
                '--item-color': rank.color,
                '--item-glow': rank.glow,
                '--mastery-color': masteryColor,
              } as CSSProperties;

              return (
                <button
                  key={name}
                  className={`workbench-list-item martial ${isSelected ? 'selected' : ''}`}
                  style={itemStyle}
                  onClick={() => handleSelectArt(name)}
                  aria-label={`查看${name}`}
                >
                  <span className="workbench-item-icon">
                    <img src={icon.src} alt="" />
                  </span>
                  <span className="workbench-item-copy">
                    <span className="workbench-item-name">{name}</span>
                    <span className="workbench-item-meta">
                      {art.type} · {art.rank} · <b>{art.mastery}</b>
                    </span>
                  </span>
                  <span className="workbench-item-side">
                    <span className="workbench-rank-seal">{rank.shortLabel}</span>
                    {art.canUpgrade && <span className="workbench-ready-dot">可精进</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="workbench-empty">当前筛选下没有功法。</div>
        )}
      </section>

      <section className="workbench-detail-pane" aria-label="功法详情">
        <button className="workbench-mobile-back" onClick={() => setIsDetailOpen(false)} aria-label="返回功法列表">
          <Icons.ArrowLeft size={16} />
          <span>功法</span>
        </button>

        {selectedName && selectedArt && selectedRank && selectedIcon ? (
          <div
            className="workbench-detail-card martial"
            style={
              {
                '--item-color': selectedRank.color,
                '--item-glow': selectedRank.glow,
                '--mastery-color': selectedMasteryColor,
                '--upgrade-color': selectedArt.canUpgrade ? selectedMasteryColor : '#57534e',
                '--upgrade-bg': selectedArt.canUpgrade ? `${selectedMasteryColor}20` : 'transparent',
              } as CSSProperties
            }
          >
            <header className="workbench-detail-hero">
              <div className="workbench-detail-icon">
                <img src={selectedIcon.src} alt={`${selectedName}图标`} />
              </div>
              <div className="workbench-detail-title-group">
                <div className="workbench-detail-kicker">{selectedArt.type}</div>
                <h3 className="workbench-detail-title">{selectedName}</h3>
                <div className="workbench-detail-badges">
                  <span>{selectedArt.rank}</span>
                  <span style={{ color: selectedMasteryColor }}>{selectedArt.mastery}</span>
                </div>
              </div>
            </header>

            <div className="workbench-detail-content">
              <p className="workbench-detail-desc">{selectedArt.description || '此功法详情尚未补全。'}</p>

              <section className="workbench-detail-section">
                <h4>已领悟特性</h4>
                {unlockedEntries.length > 0 ? (
                  <div className="workbench-trait-list">
                    {unlockedEntries.map(([traitName, traitDesc]) => (
                      <div key={traitName} className="workbench-trait unlocked">
                        <strong style={{ color: selectedMasteryColor }}>{traitName}</strong>
                        <span>{traitDesc}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="workbench-muted">尚未领悟特性。</div>
                )}
              </section>

              {lockedEntries.length > 0 && (
                <section className="workbench-detail-section">
                  <h4>未领悟特性</h4>
                  <div className="workbench-trait-list compact">
                    {lockedEntries.map(([traitName]) => (
                      <div key={traitName} className="workbench-trait locked">
                        <strong>{traitName}</strong>
                        <span>???</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <footer className="workbench-detail-actions">
              {selectedArt.nextMastery ? (
                <>
                  <div className="martial-art-upgrade-meta">
                    <div>
                      下一境界:{' '}
                      <span className="martial-art-next-mastery" style={{ color: getMasteryColor(selectedArt.nextMastery) }}>
                        {selectedArt.nextMastery}
                      </span>
                    </div>
                    <div>
                      需要修为:{' '}
                      <span className={`martial-art-upgrade-cost ${selectedArt.canUpgrade ? 'is-affordable' : 'is-blocked'}`}>
                        {selectedArt.upgradeCost}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpgrade(selectedName, selectedArt)}
                    disabled={!selectedArt.canUpgrade || upgradingArt === selectedName}
                    className={`martial-upgrade-btn ${selectedArt.canUpgrade ? 'can-upgrade' : ''}`}
                    style={{ opacity: upgradingArt === selectedName ? 0.5 : 1 }}
                    title={
                      selectedArt.canUpgrade
                        ? `消耗 ${selectedArt.upgradeCost} 修为精进`
                        : `修为不足，还需 ${selectedArt.upgradeCost - cultivation} 点`
                    }
                  >
                    {upgradingArt === selectedName ? '精进中...' : '精进'}
                  </button>
                </>
              ) : (
                <div className="martial-art-complete">已臻化境</div>
              )}
            </footer>
          </div>
        ) : (
          <div className="workbench-detail-placeholder">从左侧选择一门功法。</div>
        )}
      </section>
    </div>
  );
};
