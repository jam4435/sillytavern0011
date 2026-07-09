import React, { CSSProperties, useCallback, useMemo } from 'react';
import { CharacterProfile, WorldTime } from '../../types';
import { createAvatarEntityKey, resolveAvatarSource } from '../../utils/avatarStorage';
import { gameLogger } from '../../utils/logger';
import {
  checkBreakthrough,
  getBreakthroughTooltip,
  getRealmColor,
  performBreakthrough
} from '../../utils/realmSystem';

const PLAYER_AVATAR_ENTITY_KEY = createAvatarEntityKey('player');

/* --- Helper Components (Internal to CharacterPanel) --- */
const StatBar = ({ label, current, max, color }: { label: string, current: number, max: number, color: string }) => {
  const percent = max > 0 ? Math.min((current / max) * 100, 100) : 100;
  const style = { '--stat-bar-color': color } as CSSProperties;

  return (
    <div className="character-stat-bar" style={style}>
      <div className="character-stat-bar-head">
        <span className="character-stat-bar-label">{label}</span>
        <span className="character-stat-bar-value">{current}</span>
      </div>
      <div className="character-stat-bar-track">
        <div className="character-stat-bar-fill" style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
};

const Attribute = ({ label, value, initial }: { label: string, value: number, initial?: number }) => (
  <div className="attr-item character-attribute-card">
    <div className="character-attribute-head">
      <span className="character-attribute-label">{label}</span>
      <span className="character-attribute-value">{value}</span>
    </div>
    {initial !== undefined && initial !== value && <div className="character-attribute-initial">初始: {initial}</div>}
  </div>
);

const RealmCorner = ({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) => (
  <div className={`realm-corner ${position}`}></div>
);

const DiamondBullet = () => <span className="diamond-bullet"></span>;

const renderBiography = (biography: CharacterProfile['biography']) => {
  if (typeof biography === 'string') {
    return biography || '尚无记载';
  }

  const entries = Object.entries(biography);
  if (entries.length === 0) {
    return '尚无记载';
  }

  return entries.map(([key, val]) => (
    <div key={key} className="character-biography-entry">
      <span className="character-biography-label">【{key}】</span>
      <span>{String(val)}</span>
    </div>
  ));
};

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
  const currentRealm = stats.realm || '不入流';
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
  const nextRealmColor = nextRealm ? getRealmColor(nextRealm) : realmColor;
  const identityEntries = Object.entries(stats.identities);
  const networkEntries = stats.network ? Object.entries(stats.network) : [];
  const realmStyles = {
    '--realm-color': realmColor,
    '--realm-color-soft': `${realmColor}66`,
    '--realm-color-muted': `${realmColor}16`,
    '--realm-color-glow': `${realmColor}33`,
    '--next-realm-color': nextRealmColor,
  } as CSSProperties;
  const avatarSource = useMemo(
    () =>
      resolveAvatarSource({
        entityKey: PLAYER_AVATAR_ENTITY_KEY,
        avatarRef: stats.avatarRef,
        name: stats.name,
        gender: stats.gender === '女' ? '女' : '男',
      }),
    [stats.avatarRef, stats.gender, stats.name],
  );

  // 突破按钮点击处理
  const handleBreakthrough = useCallback(async () => {
    if (!canBreakthrough) {
      gameLogger.log('[CharacterPanel] 无法突破:', breakthroughCheck.reason);
      return;
    }

    gameLogger.log(`[CharacterPanel] 尝试突破: ${currentRealm} -> ${nextRealm}, 消耗修为: ${breakthroughCost}`);

    // 调用突破函数
    const result = await performBreakthrough(currentRealm, cultivation);

    // 调用回调通知父组件
    if (onBreakthrough) {
      onBreakthrough(result);
    }

    if (result.success) {
      gameLogger.log(`[CharacterPanel] 突破成功! 新境界: ${result.newRealm}, 剩余修为: ${result.newCultivation}`);
    } else {
      gameLogger.error(`[CharacterPanel] 突破失败: ${result.error}`);
    }
  }, [canBreakthrough, currentRealm, nextRealm, breakthroughCost, cultivation, onBreakthrough, breakthroughCheck.reason]);

  return (
    <div className="char-layout">
      {/* Left Column: Core Identity & Basic Stats */}
      <div className="char-left">
        <div className="portrait-container">
            {avatarSource.src ? (
              <img
                  src={avatarSource.src}
                  alt={`${stats.name}头像`}
                  className="portrait-img"
              />
            ) : (
              <div className="portrait-fallback">{avatarSource.fallbackInitial}</div>
            )}
            <div className="portrait-text-overlay">
                <h3 className="char-name-display">{stats.name}</h3>
                {identityEntries.map(([id]) => (
                    <span key={id} className="char-title-display">{id}</span>
                ))}
            </div>
        </div>

        <div className="character-side-stack">
            {/* Identities Detailed View */}
            <div className="character-identity-list">
              {identityEntries.map(([name, desc]) => (
                <div key={name} className="character-identity-card">
                  <div className="character-identity-title">{name}</div>
                  <div className="character-identity-desc">{desc}</div>
                </div>
              ))}
            </div>

            {/* 基本信息 */}
            <div className="character-info-list">
              <div className="info-row character-info-row">
                <span className="character-info-label">性别</span>
                <span className="character-info-value">{stats.gender}</span>
              </div>
              {age !== null && (
                <div className="info-row character-info-row">
                  <span className="character-info-label">年龄</span>
                  <span className="character-info-value">{age} 岁</span>
                </div>
              )}
              {stats.status && (
                <div className="info-row character-info-row">
                  <span className="character-info-label">状态</span>
                  <span className={`character-info-value ${stats.status.includes('受伤') ? 'is-injured' : ''}`}>
                    {stats.status}
                  </span>
                </div>
              )}
            </div>

            <div className="character-appearance-note">
              "{stats.appearance || '待定'}"
            </div>
        </div>
      </div>

      {/* Right Column: Stats & Info */}
      <div className="char-right">

        {/* 气血/内力/修为条 - 置顶 */}
        <div className="character-panel-stat-block">
            <div className="stats-bars-grid">
                <StatBar label="气血" current={stats.attributes.hp} max={stats.attributes.hp} color="#7f1d1d" />
                <StatBar label="内力" current={stats.attributes.mp} max={stats.attributes.mp} color="#0e7490" />
                <StatBar label="修为" current={stats.cultivation || 0} max={maxCultivation} color="#78350f" />
            </div>
        </div>

        {/* 境界 - 武侠风格框 */}
        <div className="realm-container character-realm-container" style={realmStyles}>
            <RealmCorner position="top-left" />
            <RealmCorner position="top-right" />
            <RealmCorner position="bottom-left" />
            <RealmCorner position="bottom-right" />

            <div className="character-realm-header">
                <div className="character-realm-copy">
                    <div className="character-realm-eyebrow">当前境界</div>
                    <div className="character-realm-line">
                        <span className="character-realm-name">{currentRealm}</span>
                        <span className="character-realm-cultivation">
                            修为 <span className="current">{cultivation}</span>
                            {nextRealm && <span className="total"> / {breakthroughCost}</span>}
                        </span>
                    </div>
                    {nextRealm && (
                        <div className="character-realm-next">
                            下一境界: <span className="character-realm-next-name">{nextRealm}</span>
                            {canBreakthrough && <span className="character-realm-ready">可突破</span>}
                        </div>
                    )}
                </div>
                <button
                    onClick={handleBreakthrough}
                    disabled={!canBreakthrough}
                    className={`breakthrough-btn ${canBreakthrough ? 'can-break' : ''}`}
                    title={tooltipText}
                >
                    <span className="breakthrough-btn-glyph">+</span>
                </button>
            </div>

            {/* 修为进度条 */}
            {nextRealm && (
                <div className="cultivation-progress-bar">
                    <div className="progress-fill" style={{ width: `${cultivationProgress}%` }}></div>
                </div>
            )}
        </div>

        {/* Attributes Grid (Split Initial / Current) */}
        <div>
            <h4 className="section-header">
                <DiamondBullet /> 根骨天资
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
        {networkEntries.length > 0 && (
            <div className="character-network-section">
                <h4 className="section-header">
                    <DiamondBullet /> 人情往来
                </h4>
                <div className="character-network-list">
                    {networkEntries.map(([person, relation]) => (
                        <div key={person} className="character-network-chip">
                            <span className="character-network-name">{person}</span>
                            <span className="character-network-relation">({relation})</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Biography (Text) */}
        <div className="character-biography-section">
            <h4 className="section-header">
                <DiamondBullet /> 往事如烟
            </h4>
            <div className="character-biography">
                {renderBiography(stats.biography)}
            </div>
        </div>

      </div>
    </div>
  );
};
