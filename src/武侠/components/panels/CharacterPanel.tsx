import React, { useCallback } from 'react';
import { CharacterProfile, WorldTime } from '../../types';
import { gameLogger } from '../../utils/logger';
import {
  checkBreakthrough,
  getBreakthroughTooltip,
  getRealmColor,
  parseRealm,
  performBreakthrough
} from '../../utils/realmSystem';

/* --- Helper Components (Internal to CharacterPanel) --- */
const StatBar = ({ label, current, max, color }: { label: string, current: number, max: number, color: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <span>{label}</span>
            <span>{current}</span>
        </div>
        <div style={{ height: '6px', background: '#292524', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ height: '100%', width: `${max > 0 ? (current / max) * 100 : 100}%`, background: color, transition: 'width 1s ease' }}></div>
        </div>
    </div>
);

const Attribute = ({ label, value, initial }: { label: string, value: number, initial?: number }) => (
    <div className="attr-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#a8a29e' }}>{label}</span>
            <span style={{ fontSize: '1.2rem', color: '#e7e5e4', fontWeight: 'bold' }}>{value}</span>
        </div>
        {initial !== undefined && initial !== value && (
            <div style={{ fontSize: '0.7rem', color: '#57534e' }}>初始: {initial}</div>
        )}
    </div>
);

/* --- Character Panel --- */
interface CharacterPanelProps {
  stats: CharacterProfile;
  worldTime?: WorldTime;
  onBreakthrough?: (result: { success: boolean; newRealm?: string; newCultivation?: number; error?: string }) => void;
}

export const CharacterPanel: React.FC<CharacterPanelProps> = ({ stats, worldTime, onBreakthrough }) => {
  // 计算年龄（如果有世界时间和出生年份）
  const age = worldTime && stats.birthYear ? worldTime.year - stats.birthYear : null;

  // 解析当前境界
  const currentRealm = stats.realm || '不入流初期';
  const realmInfo = parseRealm(currentRealm);
  const realmColor = getRealmColor(currentRealm);

  // 检查突破条件
  const breakthroughCheck = checkBreakthrough(currentRealm, stats.cultivation || 0);
  const canBreakthrough = breakthroughCheck.canBreak;
  const breakthroughCost = breakthroughCheck.cost;
  const nextRealm = breakthroughCheck.nextRealm;

  // 计算修为进度条（基于到下一境界的进度）
  const cultivation = stats.cultivation || 0;
  const maxCultivation = breakthroughCost > 0 ? breakthroughCost : 100;
  const cultivationProgress = breakthroughCost > 0
    ? Math.min((cultivation / breakthroughCost) * 100, 100)
    : 100;

  // 生成提示信息
  const tooltipText = getBreakthroughTooltip(currentRealm, cultivation);

  // 突破按钮点击处理
  const handleBreakthrough = useCallback(async () => {
    if (!canBreakthrough) {
      gameLogger.log('[CharacterPanel] 无法突破:', breakthroughCheck.reason);
      return;
    }

    gameLogger.log(`[CharacterPanel] 尝试突破: ${currentRealm} -> ${nextRealm}, 消耗修为: ${breakthroughCost}`);

    // 调用突破函数
    const result = await performBreakthrough(stats.name, currentRealm, cultivation);

    // 调用回调通知父组件
    if (onBreakthrough) {
      onBreakthrough(result);
    }

    if (result.success) {
      gameLogger.log(`[CharacterPanel] 突破成功! 新境界: ${result.newRealm}, 剩余修为: ${result.newCultivation}`);
    } else {
      gameLogger.error(`[CharacterPanel] 突破失败: ${result.error}`);
    }
  }, [canBreakthrough, currentRealm, nextRealm, breakthroughCost, stats.name, cultivation, onBreakthrough, breakthroughCheck.reason]);

  // Suppress unused variable warning
  void realmInfo;

  return (
    <div className="char-layout">
      {/* Left Column: Core Identity & Basic Stats */}
      <div className="char-left">
        <div className="portrait-container">
            <img
                src="https://picsum.photos/400/600?grayscale"
                alt="Character"
                className="portrait-img"
            />
            <div className="portrait-text-overlay">
                <h3 className="char-name-display">{stats.name}</h3>
                {Object.keys(stats.identities).map(id => (
                    <span key={id} className="char-title-display">{id}</span>
                ))}
            </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Identities Detailed View */}
            {Object.entries(stats.identities).map(([name, desc]) => (
                <div key={name} style={{ background: 'rgba(217, 119, 6, 0.1)', border: '1px solid #78350f', padding: '0.5rem', borderRadius: '4px' }}>
                    <div style={{ color: '#d97706', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{name}</div>
                    <div style={{ color: '#a8a29e', fontSize: '0.75rem', lineHeight: '1.4' }}>{desc}</div>
                </div>
            ))}

            {/* 基本信息 */}
            <div className="info-row" style={{ marginTop: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', color: '#a8a29e', fontSize: '0.875rem' }}>
                <span>性别</span><span style={{ color: '#e7e5e4' }}>{stats.gender}</span>
            </div>
            {age !== null && (
                <div className="info-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', color: '#a8a29e', fontSize: '0.875rem' }}>
                    <span>年龄</span><span style={{ color: '#e7e5e4' }}>{age} 岁</span>
                </div>
            )}
            {stats.status && (
                <div className="info-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', color: '#a8a29e', fontSize: '0.875rem' }}>
                    <span>状态</span><span style={{ color: stats.status.includes('受伤') ? '#ef4444' : '#e7e5e4' }}>{stats.status}</span>
                </div>
            )}
            <div style={{ marginTop: '0.5rem', color: '#78716c', fontSize: '0.8rem', fontStyle: 'italic', lineHeight: '1.5' }}>
                "{stats.appearance || '待定'}"
            </div>
        </div>
      </div>

      {/* Right Column: Stats & Info */}
      <div className="char-right">

        {/* 气血/内力/修为条 - 置顶 */}
        <div style={{ marginBottom: '1.5rem' }}>
            <div className="stats-bars-grid">
                <StatBar label="气血" current={stats.attributes.hp} max={stats.attributes.hp} color="#7f1d1d" />
                <StatBar label="内力" current={stats.attributes.mp} max={stats.attributes.mp} color="#0e7490" />
                <StatBar label="修为" current={stats.cultivation || 0} max={maxCultivation} color="#78350f" />
            </div>
        </div>

        {/* 境界 - 武侠风格框 */}
        <div className="realm-container" style={{
            position: 'relative',
            marginBottom: '1.5rem',
            padding: '1.25rem',
            background: 'linear-gradient(135deg, rgba(28,25,23,0.9) 0%, rgba(41,37,36,0.8) 100%)',
            border: `1px solid ${realmColor}40`,
            boxShadow: `inset 0 0 20px rgba(0,0,0,0.3), 0 0 15px ${realmColor}20`
        }}>
            {/* 四角装饰 - 使用境界颜色 */}
            <div style={{ position: 'absolute', top: '-1px', left: '-1px', width: '12px', height: '12px', borderTop: `2px solid ${realmColor}`, borderLeft: `2px solid ${realmColor}` }}></div>
            <div style={{ position: 'absolute', top: '-1px', right: '-1px', width: '12px', height: '12px', borderTop: `2px solid ${realmColor}`, borderRight: `2px solid ${realmColor}` }}></div>
            <div style={{ position: 'absolute', bottom: '-1px', left: '-1px', width: '12px', height: '12px', borderBottom: `2px solid ${realmColor}`, borderLeft: `2px solid ${realmColor}` }}></div>
            <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '12px', height: '12px', borderBottom: `2px solid ${realmColor}`, borderRight: `2px solid ${realmColor}` }}></div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: '0.7rem', color: '#78716c', letterSpacing: '0.15em', marginBottom: '0.5rem', textTransform: 'uppercase' }}>当前境界</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{
                            fontSize: '1.5rem',
                            color: realmColor,
                            fontWeight: 'bold',
                            fontFamily: 'serif',
                            textShadow: `0 0 10px ${realmColor}50`
                        }}>{currentRealm}</span>
                        <span style={{ fontSize: '0.85rem', color: '#a8a29e' }}>
                            修为 <span style={{ color: realmColor }}>{cultivation}</span>
                            {nextRealm && (
                                <span style={{ color: '#57534e' }}> / {breakthroughCost}</span>
                            )}
                        </span>
                    </div>
                    {/* 下一境界提示 */}
                    {nextRealm && (
                        <div style={{ fontSize: '0.75rem', color: '#57534e', marginTop: '0.5rem' }}>
                            下一境界: <span style={{ color: getRealmColor(nextRealm) }}>{nextRealm}</span>
                            {canBreakthrough && (
                                <span style={{ color: '#22c55e', marginLeft: '0.5rem' }}>✓ 可突破</span>
                            )}
                        </div>
                    )}
                </div>
                {/* 加号按钮 - 突破按钮 */}
                <button
                    onClick={handleBreakthrough}
                    disabled={!canBreakthrough}
                    className={`breakthrough-btn ${canBreakthrough ? 'can-break' : ''}`}
                    style={{
                        width: '40px',
                        height: '40px',
                        background: canBreakthrough ? `${realmColor}20` : 'transparent',
                        border: `2px solid ${canBreakthrough ? realmColor : '#44403c'}`,
                        color: canBreakthrough ? realmColor : '#57534e',
                        cursor: canBreakthrough ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        transition: 'all 0.3s ease',
                        transform: 'rotate(45deg)',
                        opacity: canBreakthrough ? 1 : 0.5,
                        boxShadow: canBreakthrough ? `0 0 10px ${realmColor}40` : 'none'
                    }}
                    title={tooltipText}
                    onMouseEnter={(e) => {
                        if (canBreakthrough) {
                            e.currentTarget.style.background = `${realmColor}40`;
                            e.currentTarget.style.boxShadow = `0 0 20px ${realmColor}60`;
                            e.currentTarget.style.transform = 'rotate(45deg) scale(1.1)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (canBreakthrough) {
                            e.currentTarget.style.background = `${realmColor}20`;
                            e.currentTarget.style.boxShadow = `0 0 10px ${realmColor}40`;
                            e.currentTarget.style.transform = 'rotate(45deg) scale(1)';
                        }
                    }}
                >
                    <span style={{ transform: 'rotate(-45deg)' }}>+</span>
                </button>
            </div>

            {/* 修为进度条 */}
            {nextRealm && (
                <div style={{ marginTop: '1rem' }}>
                    <div style={{
                        height: '4px',
                        background: '#292524',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${cultivationProgress}%`,
                            background: `linear-gradient(90deg, ${realmColor}80, ${realmColor})`,
                            transition: 'width 0.5s ease',
                            boxShadow: `0 0 5px ${realmColor}`
                        }}></div>
                    </div>
                </div>
            )}
        </div>

        {/* Attributes Grid (Split Initial / Current) */}
        <div>
            <h4 className="section-header">
                <span className="diamond-bullet" style={{ width: '6px', height: '6px', background: '#d97706', transform: 'rotate(45deg)' }}></span> 根骨天资
            </h4>
            <div className="attr-grid">
                {/* 战斗属性（随境界变化） */}
                <Attribute label="臂力" value={stats.attributes.臂力} initial={stats.initialAttributes.臂力} />
                <Attribute label="根骨" value={stats.attributes.根骨} initial={stats.initialAttributes.根骨} />
                <Attribute label="机敏" value={stats.attributes.机敏} initial={stats.initialAttributes.机敏} />
                <Attribute label="洞察" value={stats.attributes.洞察} initial={stats.initialAttributes.洞察} />
                {/* 固定属性（不随境界变化） */}
                <Attribute label="悟性" value={stats.initialAttributes.悟性} />
                <Attribute label="风姿" value={stats.initialAttributes.风姿} />
                <Attribute label="福缘" value={stats.initialAttributes.福缘} />
            </div>
        </div>

        {/* 关系网 */}
        {stats.network && Object.keys(stats.network).length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
                <h4 className="section-header">
                    <span className="diamond-bullet" style={{ width: '6px', height: '6px', background: '#d97706', transform: 'rotate(45deg)' }}></span> 人情往来
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {Object.entries(stats.network).map(([person, relation]) => (
                        <div key={person} style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.85rem'
                        }}>
                            <span style={{ color: '#e7e5e4' }}>{person}</span>
                            <span style={{ color: '#78716c', marginLeft: '0.5rem' }}>({relation})</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Biography (Text) */}
        <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
            <h4 className="section-header">
                <span className="diamond-bullet" style={{ width: '6px', height: '6px', background: '#d97706', transform: 'rotate(45deg)' }}></span> 往事如烟
            </h4>
            <div style={{ color: '#a8a29e', fontSize: '0.9rem', lineHeight: '1.6', background: 'rgba(0,0,0,0.2)', padding: '1rem', maxHeight: '150px', overflowY: 'auto' }}>
                {typeof stats.biography === 'string'
                    ? (stats.biography || '尚无记载')
                    : Object.keys(stats.biography).length > 0
                        ? Object.entries(stats.biography).map(([key, val]) => (
                            <div key={key} style={{ marginBottom: '0.5rem' }}>
                                <span style={{ color: '#d97706' }}>【{key}】</span> {val}
                            </div>
                          ))
                        : '尚无记载'
                }
            </div>
        </div>

      </div>
    </div>
  );
};
