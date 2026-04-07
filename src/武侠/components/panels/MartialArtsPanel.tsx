import React, { useCallback, useState } from 'react';
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
    userName: string;
    onUpgrade?: (result: { success: boolean; martialArtName: string; newMastery?: string; newCultivation?: number; error?: string }) => void;
}

export const MartialArtsPanel: React.FC<MartialArtsPanelProps> = ({
    martialArts,
    cultivation,
    userName,
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
                userName,
                artName,
                art.mastery as MasteryLevel,
                cultivation,
                art.rank as MartialArtsRank
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
    }, [userName, cultivation, upgradingArt, onUpgrade]);

    return (
        <div style={{ height: '100%', overflowY: 'auto', paddingRight: '0.5rem' }}>
             {artEntries.length > 0 ? (
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {artEntries.map(([name, art]) => {
                        const rankColor = getRankColor(art.rank);
                        const masteryColor = getMasteryColor(art.mastery);
                        const isUpgrading = upgradingArt === name;

                        return (
                            <div
                                key={name}
                                className="martial-art-card"
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${rankColor}30`,
                                    padding: '1.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    position: 'relative',
                                    transition: 'all 0.3s ease'
                                }}
                            >
                                {/* 头部：名称和品阶 */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            background: `${rankColor}20`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: `1px solid ${rankColor}40`,
                                            color: rankColor
                                        }}>
                                            <Icons.Combat size={16} />
                                        </div>
                                        <span style={{ fontSize: '1.25rem', color: '#e7e5e4', fontFamily: 'serif', fontWeight: 'bold' }}>{name}</span>
                                    </div>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '2px 8px',
                                        border: `1px solid ${rankColor}60`,
                                        color: rankColor,
                                        background: `${rankColor}10`
                                    }}>{art.rank}</span>
                                </div>

                                {/* 类型和掌握程度 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#a8a29e' }}>
                                    <span style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{art.type}</span>
                                    <span style={{ width: '4px', height: '4px', background: '#57534e', borderRadius: '50%' }}></span>
                                    <span style={{ color: masteryColor, fontWeight: 'bold' }}>{art.mastery}</span>
                                </div>

                                {/* 描述 */}
                                <p style={{ fontSize: '0.9rem', color: '#d6d3d1', margin: '0 0 1rem 0', lineHeight: '1.6', flex: 1 }}>{art.description}</p>

                                {/* 已解锁特性 */}
                                {art.unlockedTraits && Object.keys(art.unlockedTraits).length > 0 && (
                                    <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '1rem', marginBottom: '1rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#78716c', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>已领悟特性</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {Object.entries(art.unlockedTraits).map(([tName, tDesc]) => (
                                                <div key={tName} style={{ fontSize: '0.85rem', color: '#a8a29e' }}>
                                                    <span style={{ color: masteryColor, marginRight: '0.5rem' }}>◆ {tName}</span>
                                                    <span>{tDesc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 未解锁特性（灰色显示） */}
                                {art.traits && Object.keys(art.traits).length > Object.keys(art.unlockedTraits || {}).length && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#57534e', marginBottom: '0.5rem' }}>未领悟特性</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {Object.entries(art.traits)
                                                .filter(([tName]) => !art.unlockedTraits?.[tName])
                                                .map(([tName]) => (
                                                    <div key={tName} style={{ fontSize: '0.8rem', color: '#44403c' }}>
                                                        <span>◇ {tName}</span>
                                                        <span style={{ marginLeft: '0.5rem' }}>???</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}

                                {/* 升级区域 */}
                                <div style={{
                                    borderTop: '1px solid rgba(255,255,255,0.1)',
                                    paddingTop: '1rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    {art.nextMastery ? (
                                        <>
                                            <div style={{ fontSize: '0.8rem', color: '#78716c' }}>
                                                <div>下一境界: <span style={{ color: getMasteryColor(art.nextMastery) }}>{art.nextMastery}</span></div>
                                                <div>需要修为: <span style={{ color: art.canUpgrade ? '#22c55e' : '#ef4444' }}>{art.upgradeCost}</span></div>
                                            </div>
                                            <button
                                                onClick={() => handleUpgrade(name, art)}
                                                disabled={!art.canUpgrade || isUpgrading}
                                                className={`martial-upgrade-btn ${art.canUpgrade ? 'can-upgrade' : ''}`}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    background: art.canUpgrade ? `${masteryColor}20` : 'transparent',
                                                    border: `1px solid ${art.canUpgrade ? masteryColor : '#44403c'}`,
                                                    color: art.canUpgrade ? masteryColor : '#57534e',
                                                    cursor: art.canUpgrade && !isUpgrading ? 'pointer' : 'not-allowed',
                                                    fontSize: '0.85rem',
                                                    fontFamily: 'serif',
                                                    transition: 'all 0.3s ease',
                                                    opacity: isUpgrading ? 0.5 : 1
                                                }}
                                                title={art.canUpgrade ? `消耗 ${art.upgradeCost} 修为精进` : `修为不足，还需 ${art.upgradeCost - cultivation} 点`}
                                            >
                                                {isUpgrading ? '精进中...' : '精进'}
                                            </button>
                                        </>
                                    ) : (
                                        <div style={{
                                            width: '100%',
                                            textAlign: 'center',
                                            color: '#fbbf24',
                                            fontSize: '0.85rem',
                                            fontFamily: 'serif'
                                        }}>
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
