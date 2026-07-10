import React, { CSSProperties, useCallback, useMemo, useRef, useState } from 'react';
import AvatarImage from '../AvatarImage';
import AvatarPreviewModal from '../AvatarPreviewModal';
import { Icons } from '../Icons';
import { ActivePanel, CharacterProfile, WorldTime } from '../../types';
import {
  getAvatarsByGender,
  getDefaultAvatarRefForGender,
  toCustomAvatarRef,
  toPresetAvatarRef,
} from '../../utils/avatarCatalog';
import {
  clearAvatarSelection,
  clearCustomAvatar,
  createAvatarEntityKey,
  imageFileToDataUrl,
  readAvatarSelection,
  resolveAvatarSource,
  saveAvatarSelection,
  saveCustomAvatar,
} from '../../utils/avatarStorage';
import { gameLogger } from '../../utils/logger';
import {
  checkBreakthrough,
  getBreakthroughTooltip,
  getRealmColor,
  performBreakthrough,
} from '../../utils/realmSystem';

const PLAYER_AVATAR_ENTITY_KEY = createAvatarEntityKey('player');

const StatBar = ({ label, current, max, color }: { label: string; current: number; max: number; color: string }) => {
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

const Attribute = ({ label, value, initial }: { label: string; value: number; initial?: number }) => (
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

interface CharacterPanelProps {
  stats: CharacterProfile;
  worldTime?: WorldTime;
  onBreakthrough?: (result: { success: boolean; newRealm?: string; newCultivation?: number; error?: string }) => void;
  onAvatarUpdated?: () => void;
}

export const CharacterPanel: React.FC<CharacterPanelProps> = ({
  stats,
  worldTime,
  onBreakthrough,
  onAvatarUpdated,
}) => {
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);

  const age = worldTime && stats.birthYear ? worldTime.year - stats.birthYear : null;
  const currentRealm = stats.realm || '不入流';
  const realmColor = getRealmColor(currentRealm);
  const breakthroughCheck = checkBreakthrough(currentRealm, stats.cultivation || 0);
  const canBreakthrough = breakthroughCheck.canBreak;
  const breakthroughCost = breakthroughCheck.cost;
  const nextRealm = breakthroughCheck.nextRealm;
  const cultivation = stats.cultivation || 0;
  const maxCultivation = breakthroughCost > 0 ? breakthroughCost : 100;
  const cultivationProgress = breakthroughCost > 0 ? Math.min((cultivation / breakthroughCost) * 100, 100) : 100;
  const tooltipText = getBreakthroughTooltip(currentRealm, cultivation);
  const nextRealmColor = nextRealm ? getRealmColor(nextRealm) : realmColor;
  const identityEntries = Object.entries(stats.identities);
  const networkEntries = stats.network ? Object.entries(stats.network) : [];
  const playerGender = stats.gender === '女' ? '女' : '男';
  const genderAvatarOptions = useMemo(() => getAvatarsByGender(playerGender), [playerGender]);
  const selectedAvatarRef = useMemo(
    () => readAvatarSelection(PLAYER_AVATAR_ENTITY_KEY)?.avatarRef || stats.avatarRef || getDefaultAvatarRefForGender(playerGender),
    [avatarVersion, playerGender, stats.avatarRef],
  );
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
        gender: playerGender,
      }),
    [avatarVersion, playerGender, stats.avatarRef, stats.name],
  );

  const refreshAvatars = useCallback(() => {
    setAvatarVersion(version => version + 1);
    onAvatarUpdated?.();
  }, [onAvatarUpdated]);

  const handleSelectPresetAvatar = useCallback(
    (avatarId: string) => {
      saveAvatarSelection(PLAYER_AVATAR_ENTITY_KEY, toPresetAvatarRef(avatarId));
      refreshAvatars();
    },
    [refreshAvatars],
  );

  const handleAvatarUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const imageData = await imageFileToDataUrl(file);
        saveCustomAvatar(PLAYER_AVATAR_ENTITY_KEY, imageData, file.name);
        saveAvatarSelection(PLAYER_AVATAR_ENTITY_KEY, toCustomAvatarRef(PLAYER_AVATAR_ENTITY_KEY));
        refreshAvatars();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '头像上传失败');
      } finally {
        if (avatarUploadInputRef.current) {
          avatarUploadInputRef.current.value = '';
        }
      }
    },
    [refreshAvatars],
  );

  const handleClearAvatarOverride = useCallback(() => {
    clearAvatarSelection(PLAYER_AVATAR_ENTITY_KEY);
    clearCustomAvatar(PLAYER_AVATAR_ENTITY_KEY);
    refreshAvatars();
  }, [refreshAvatars]);

  const handleBreakthrough = useCallback(async () => {
    if (!canBreakthrough) {
      gameLogger.log('[CharacterPanel] 无法突破:', breakthroughCheck.reason);
      return;
    }

    gameLogger.log(`[CharacterPanel] 尝试突破: ${currentRealm} -> ${nextRealm}, 消耗修为: ${breakthroughCost}`);

    const result = await performBreakthrough(currentRealm, cultivation);

    if (onBreakthrough) {
      onBreakthrough(result);
    }

    if (result.success) {
      gameLogger.log(`[CharacterPanel] 突破成功! 新境界: ${result.newRealm}, 剩余修为: ${result.newCultivation}`);
    } else {
      gameLogger.error(`[CharacterPanel] 突破失败: ${result.error}`);
    }
  }, [breakthroughCheck.reason, breakthroughCost, canBreakthrough, cultivation, currentRealm, nextRealm, onBreakthrough]);

  return (
    <>
      <div className="char-layout">
        <div className="char-left">
          {avatarSource.src ? (
            <button
              type="button"
              className="portrait-container portrait-container--button"
              onClick={() => setIsAvatarPreviewOpen(true)}
              aria-label={`查看${stats.name}头像`}
            >
              <AvatarImage
                src={avatarSource.src}
                alt={`${stats.name}头像`}
                className="portrait-img"
                objectPosition={avatarSource.objectPosition}
                rasterMode="trim"
              />
              <div className="portrait-text-overlay">
                <h3 className="char-name-display">{stats.name}</h3>
                {identityEntries.map(([id]) => (
                  <span key={id} className="char-title-display">
                    {id}
                  </span>
                ))}
              </div>
            </button>
          ) : (
            <div className="portrait-container">
              <div className="portrait-fallback">{avatarSource.fallbackInitial}</div>
              <div className="portrait-text-overlay">
                <h3 className="char-name-display">{stats.name}</h3>
                {identityEntries.map(([id]) => (
                  <span key={id} className="char-title-display">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="character-avatar-actions">
            <button
              type="button"
              className={`character-avatar-action ${isAvatarPickerOpen ? 'is-active' : ''}`}
              onClick={() => setIsAvatarPickerOpen(open => !open)}
              aria-label="设置玩家头像"
              aria-expanded={isAvatarPickerOpen}
            >
              <Icons.Plus size={14} />
              <span>{isAvatarPickerOpen ? '收起头像' : '换头像'}</span>
            </button>
          </div>

          {isAvatarPickerOpen && (
            <section className="character-avatar-picker" aria-label="玩家头像选择">
              <div className="character-avatar-picker-head">
                <span>头像</span>
                <small>{avatarSource.label}</small>
              </div>
              <div className="character-avatar-options">
                {genderAvatarOptions.map(avatar => {
                  const avatarRef = toPresetAvatarRef(avatar.id);
                  const isSelected = selectedAvatarRef === avatarRef;

                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      className={`character-avatar-option ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => handleSelectPresetAvatar(avatar.id)}
                      aria-pressed={isSelected}
                    >
                      <AvatarImage
                        src={avatar.src}
                        alt={avatar.label}
                        objectPosition={avatar.objectPosition}
                        rasterMode="square"
                      />
                      <span>{avatar.label}</span>
                    </button>
                  );
                })}
                <label className={`character-avatar-option upload ${avatarSource.source === 'custom' ? 'is-selected' : ''}`}>
                  <input
                    ref={avatarUploadInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                  />
                  <span className="character-avatar-upload-mark">+</span>
                  <span>上传</span>
                </label>
                <button type="button" className="character-avatar-clear" onClick={handleClearAvatarOverride}>
                  清除本地覆盖
                </button>
              </div>
            </section>
          )}

          <div className="character-side-stack">
            <div className="character-identity-list">
              {identityEntries.map(([name, desc]) => (
                <div key={name} className="character-identity-card">
                  <div className="character-identity-title">{name}</div>
                  <div className="character-identity-desc">{desc}</div>
                </div>
              ))}
            </div>

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

            <div className="character-appearance-note">"{stats.appearance || '待定'}"</div>
          </div>
        </div>

        <div className="char-right">
          <div className="character-panel-stat-block">
            <div className="stats-bars-grid">
              <StatBar label="气血" current={stats.attributes.hp} max={stats.attributes.hp} color="#7f1d1d" />
              <StatBar label="内力" current={stats.attributes.mp} max={stats.attributes.mp} color="#0e7490" />
              <StatBar label="修为" current={stats.cultivation || 0} max={maxCultivation} color="#78350f" />
            </div>
          </div>

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

            {nextRealm && (
              <div className="cultivation-progress-bar">
                <div className="progress-fill" style={{ width: `${cultivationProgress}%` }}></div>
              </div>
            )}
          </div>

          <div>
            <h4 className="section-header">
              <DiamondBullet /> 根骨天资
            </h4>
            <div className="attr-grid">
              <Attribute label="臂力" value={stats.attributes.臂力} initial={stats.initialAttributes.臂力} />
              <Attribute label="根骨" value={stats.attributes.根骨} initial={stats.initialAttributes.根骨} />
              <Attribute label="机敏" value={stats.attributes.机敏} initial={stats.initialAttributes.机敏} />
              <Attribute label="洞察" value={stats.attributes.洞察} initial={stats.initialAttributes.洞察} />
              <Attribute label="悟性" value={stats.initialAttributes.悟性} />
              <Attribute label="风姿" value={stats.initialAttributes.风姿} />
              <Attribute label="福缘" value={stats.initialAttributes.福缘} />
            </div>
          </div>

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

          <div className="character-biography-section">
            <h4 className="section-header">
              <DiamondBullet /> 往事如烟
            </h4>
            <div className="character-biography">{renderBiography(stats.biography)}</div>
          </div>
        </div>
      </div>

      <AvatarPreviewModal
        isOpen={isAvatarPreviewOpen}
        onClose={() => setIsAvatarPreviewOpen(false)}
        title={`${stats.name}头像`}
        subtitle={avatarSource.label}
        src={avatarSource.src}
        type={ActivePanel.CHARACTER}
        objectPosition={avatarSource.objectPosition}
      />
    </>
  );
};
