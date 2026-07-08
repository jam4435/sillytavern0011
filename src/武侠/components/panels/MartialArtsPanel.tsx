import React, { CSSProperties, useCallback, useState } from 'react';
import { MartialArt } from '../../types';
import {
  upgradeMartialArt,
  type MartialArtsRank,
  type MasteryLevel,
} from '../../utils/martialArtsDatabase';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';
import { gameLogger } from '../../utils/logger';

/* --- Private Helper Functions --- */
const getRankColor = (rank: string): string => {
    const colors: Record<string, string> = {
        '粗浅': '#a8a29e',
        '传家': '#4ade80',
        '上乘': '#60a5fa',
        '镇派': '#c084fc',
        '绝世': '#fbbf24',
        '传说': '#f87171'
    };
    return colors[rank] || '#a8a29e';
};

const getMasteryColor = (mastery: string): string => {
    const colors: Record<string, string> = {
        '初窥门径': '#a8a29e',
        '略有小成': '#4ade80',
        '融会贯通': '#60a5fa',
        '炉火纯青': '#c084fc',
        '出神入化': '#fbbf24'
    };
    return colors[mastery] || '#a8a29e';
};

/* --- Martial Arts Panel --- */
interface MartialArtsPanelProps {
    martialArts: Record<string, MartialArt>;
    cultivation: number;
    comprehension: number;
    onUpgrade?: (result: { success: boolean; martialArtName: string; newMastery?: string; newCultivation?: number; error?: string }) => void;
}

export const MartialArtsPanel: React.FC<MartialArtsPanelProps> = ({
    martialArts,
    cultivation,
    comprehension,
    onUpgrade
}) => {
    const [upgradingArt, setUpgradingArt] = useState<string | null>(null);
    const artEntries = Object.entries(martialArts);

    // 处理功法升级
    const handleUpgrade = useCallback(async (artName: string, art: MartialArt) => {
        if (!art.canUpgrade || upgradingArt) return;

        setUpgradingArt(artName);

        try {
            const result = await upgradeMartialArt(
                artName,
                art.mastery as MasteryLevel,
                cultivation,
                art.rank as MartialArtsRank,
                comprehension
            );

            if (onUpgrade) {
                onUpgrade({
                    success: result.success,
                    martialArtName: artName,
                    newMastery: result.newMastery,
                    newCultivation: result.newCultivation,
                    error: result.error
                });
            }

            if (result.success) {
                gameLogger.log(`[MartialArtsPanel] 功法升级成功: ${artName} -> ${result.newMastery}`);
            } else {
                gameLogger.error(`[MartialArtsPanel] 功法升级失败: ${result.error}`);
            }
        } catch (error) {
            gameLogger.error('[MartialArtsPanel] 升级出错:', error);
            if (onUpgrade) {
                onUpgrade({
                    success: false,
                    martialArtName: artName,
                    error: error instanceof Error ? error.message : '升级失败'
                });
            }
        } finally {
            setUpgradingArt(null);
        }
    }, [cultivation, comprehension, upgradingArt, onUpgrade]);

    return (
        <div className="martial-art-panel">
             {artEntries.length > 0 ? (
                 <div className="martial-art-grid">
                    {artEntries.map(([name, art]) => {
                        const rankColor = getRankColor(art.rank);
                        const masteryColor = getMasteryColor(art.mastery);
                        const isUpgrading = upgradingArt === name;
                        const cardStyle = {
                            '--rank-color': rankColor,
                            '--mastery-color': masteryColor,
                            '--upgrade-color': art.canUpgrade ? masteryColor : '#57534e',
                            '--upgrade-bg': art.canUpgrade ? `${masteryColor}20` : 'transparent',
                            borderColor: `${rankColor}30`,
                        } as CSSProperties;

                        return (
                            <div key={name} className="martial-art-card" style={cardStyle}>
                                {/* 头部：名称和品阶 */}
                                <div className="martial-art-header">
                                    <div className="martial-art-title-group">
                                        <div
                                            className="martial-art-icon"
                                            style={{
                                                background: `${rankColor}20`,
                                                borderColor: `${rankColor}40`,
                                                color: rankColor,
                                            }}
                                        >
                                            <Icons.Combat size={16} />
                                        </div>
                                        <span className="martial-art-name">{name}</span>
                                    </div>
                                    <span
                                        className="martial-art-rank-badge"
                                        style={{
                                            borderColor: `${rankColor}60`,
                                            color: rankColor,
                                            background: `${rankColor}10`,
                                        }}
                                    >
                                        {art.rank}
                                    </span>
                                </div>

                                {/* 类型和掌握程度 */}
                                <div className="martial-art-meta">
                                    <span className="martial-art-type">{art.type}</span>
                                    <span className="martial-art-meta-dot"></span>
                                    <span className="martial-art-mastery" style={{ color: masteryColor }}>{art.mastery}</span>
                                </div>

                                {/* 描述 */}
                                <p className="martial-art-description">{art.description}</p>

                                {/* 已解锁特性 */}
                                {art.unlockedTraits && Object.keys(art.unlockedTraits).length > 0 && (
                                    <div className="martial-art-traits">
                                        <div className="martial-art-traits-title">已领悟特性</div>
                                        <div className="martial-art-traits-list">
                                            {Object.entries(art.unlockedTraits).map(([tName, tDesc]) => (
                                                <div key={tName} className="trait-unlocked">
                                                    <span className="trait-unlocked-name" style={{ color: masteryColor }}>{tName}</span>
                                                    <span>{tDesc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 未解锁特性（灰色显示） */}
                                {art.traits && Object.keys(art.traits).length > Object.keys(art.unlockedTraits || {}).length && (
                                    <div className="martial-art-traits martial-art-traits-locked">
                                        <div className="martial-art-traits-title">未领悟特性</div>
                                        <div className="martial-art-traits-list compact">
                                            {Object.entries(art.traits)
                                                .filter(([tName]) => !art.unlockedTraits?.[tName])
                                                .map(([tName]) => (
                                                    <div key={tName} className="trait-locked">
                                                        <span>{tName}</span>
                                                        <span className="trait-locked-mask">???</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}

                                {/* 升级区域 */}
                                <div className="martial-art-upgrade">
                                    {art.nextMastery ? (
                                        <>
                                            <div className="martial-art-upgrade-meta">
                                                <div>
                                                    下一境界:
                                                    {' '}
                                                    <span className="martial-art-next-mastery" style={{ color: getMasteryColor(art.nextMastery) }}>
                                                        {art.nextMastery}
                                                    </span>
                                                </div>
                                                <div>
                                                    需要修为:
                                                    {' '}
                                                    <span className={`martial-art-upgrade-cost ${art.canUpgrade ? 'is-affordable' : 'is-blocked'}`}>
                                                        {art.upgradeCost}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleUpgrade(name, art)}
                                                disabled={!art.canUpgrade || isUpgrading}
                                                className={`martial-upgrade-btn ${art.canUpgrade ? 'can-upgrade' : ''}`}
                                                style={{ opacity: isUpgrading ? 0.5 : 1 }}
                                                title={art.canUpgrade ? `消耗 ${art.upgradeCost} 修为精进` : `修为不足，还需 ${art.upgradeCost - cultivation} 点`}
                                            >
                                                {isUpgrading ? '精进中...' : '精进'}
                                            </button>
                                        </>
                                    ) : (
                                        <div className="martial-art-complete">
                                            ✦ 已臻化境 ✦
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                 </div>
             ) : (
                 <EmptyState message="尚未修习任何武学功法。" />
             )}
        </div>
    );
};
