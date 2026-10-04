import React, { useEffect, useMemo, useState } from 'react';
import { isSameLocationScope } from '../../../shared/locationPath.js';
import type {
  CharacterProfile,
  FactionTask,
  FactionTaskMap,
  FactionTaskPoolMap,
  InitialAttributes,
  PublicFactionCategory,
  PublicFactionRuntimeState,
  SectMartialNode,
  SectStaticData,
  UserFactionEntry,
} from '../../types';
import { Icons } from '../Icons';
import { SectTaskList } from './SectTaskList';
import {
  buildFactionBetrayUserMessage,
  buildFactionPromotionUserMessage,
  buildJoinFactionUserMessage,
  buildLearnMartialArtUserMessage,
  getSectByName,
  learnFactionMartialArt,
  quoteMartialArtLearn,
} from '../../utils/factionManager';
import {
  getAllPublicFactions,
  getPublicFactionByName,
  getPublicFactionRelations,
  resolveFactionPublicState,
} from '../../utils/publicFactionManager';

export interface FactionPanelProps {
  stats: CharacterProfile;
  currentLocation: string;
  tasks?: FactionTaskMap;
  availableTasksByFaction?: FactionTaskPoolMap;
  onSendMessage: (message: string) => Promise<string>;
  onClaimTask: (taskName: string, task: FactionTask) => Promise<void>;
  onGenerateTaskOptions: (sectName: string) => Promise<void>;
  onAcceptTask: (sectName: string, taskName: string) => Promise<void>;
  onNavigateLocation?: (location: string) => void;
  onClose?: () => void;
  isBusy?: boolean;
}

type PanelViewMode = 'my-faction' | 'all-factions';
type FilterCategory = '全部' | PublicFactionCategory;

const TIER_ORDER: Array<SectMartialNode['传承层级']> = ['入门', '基础', '进阶', '核心', '镇派'];

export const FactionPanel: React.FC<FactionPanelProps> = ({
  stats,
  currentLocation,
  tasks = {},
  availableTasksByFaction = {},
  onSendMessage,
  onClaimTask,
  onGenerateTaskOptions,
  onAcceptTask,
  onNavigateLocation,
  onClose,
  isBusy = false,
}) => {
  const allPublicFactions = useMemo(() => getAllPublicFactions(), []);
  const playerFactions = stats.factions || {};
  const joinedSectNames = Object.keys(playerFactions);
  const hasJoinedAny = joinedSectNames.length > 0;

  // 当前视图：已加入默认展示我的势力，散修默认展示天下势力鉴赏
  const [viewMode, setViewMode] = useState<PanelViewMode>(hasJoinedAny ? 'my-faction' : 'all-factions');

  // 当前选中的势力名称（我的势力视图下为已加入的门派之一；天下势力鉴赏下为任意门派）
  const [selectedSectName, setSelectedSectName] = useState<string>(
    joinedSectNames[0] || getPublicFactionByName('全真教')?.势力名称 || allPublicFactions[0]?.势力名称 || '全真教',
  );

  // 天下势力分类过滤
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('全部');

  // 当前选中的武学树节点（用于查看详情和向师请教）
  const [inspectingNode, setInspectingNode] = useState<SectMartialNode | null>(null);

  // 动作弹窗与确认状态
  const [confirmingBetray, setConfirmingBetray] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  // 天下势力鉴赏与 17 门派玩法库彻底分离；可加入势力通过 sectId 桥接回现有玩法数据。
  const currentPublicFaction = useMemo(
    () => getPublicFactionByName(selectedSectName),
    [selectedSectName],
  );

  const currentSectData: SectStaticData | undefined = useMemo(() => {
    const direct = getSectByName(selectedSectName);
    if (direct) return direct;
    if (currentPublicFaction?.sectId) return getSectByName(currentPublicFaction.sectId);
    return undefined;
  }, [selectedSectName, currentPublicFaction]);

  // 当前玩家在该势力的归属信息（若已加入）；公开 canonical 名与玩法门派名允许不同。
  const currentFactionMembership: UserFactionEntry | undefined =
    playerFactions[selectedSectName] ||
    (currentSectData ? playerFactions[currentSectData.门派名称] : undefined);
  const isMemberOfSelected = Boolean(currentFactionMembership && currentFactionMembership.状态 !== '叛门');

  // 过滤后的天下势力列表
  const filteredPublicFactions = useMemo(() => {
    if (categoryFilter === '全部') return allPublicFactions;
    return allPublicFactions.filter(faction => faction.分类 === categoryFilter);
  }, [allPublicFactions, categoryFilter]);

  const [publicRuntimeState, setPublicRuntimeState] = useState<PublicFactionRuntimeState | null>(null);

  useEffect(() => {
    let disposed = false;
    if (viewMode !== 'all-factions' || !currentPublicFaction) {
      setPublicRuntimeState(null);
      return () => {
        disposed = true;
      };
    }

    setPublicRuntimeState(null);
    void resolveFactionPublicState(currentPublicFaction).then(state => {
      if (!disposed) setPublicRuntimeState(state);
    });

    return () => {
      disposed = true;
    };
  }, [viewMode, currentPublicFaction, stats]);

  const currentPublicRelations = useMemo(
    () => (currentPublicFaction ? getPublicFactionRelations(currentPublicFaction.势力ID) : []),
    [currentPublicFaction],
  );

  // 地点判定统一按前三层范围比较；第四层叙事场景不应阻止驻地交互。
  const isAtSectBase = useMemo(() => {
    if (!currentSectData) return false;
    return isSameLocationScope(currentLocation, currentSectData.主峰驻地);
  }, [currentLocation, currentSectData]);
  const sectBaseLabel = useMemo(() => {
    const path = currentSectData?.主峰驻地?.trim();
    if (!path) return '势力驻地';
    const segments = path.split('/').map(segment => segment.trim()).filter(Boolean);
    return segments[segments.length - 1] || path;
  }, [currentSectData]);

  // 按层级分组武学传承树节点
  const martialNodesByTier = useMemo(() => {
    if (!currentSectData) return {};
    const groups: Partial<Record<SectMartialNode['传承层级'], SectMartialNode[]>> = {};
    for (const tier of TIER_ORDER) {
      groups[tier] = currentSectData.武学传承树.filter(n => n.传承层级 === tier);
    }
    return groups;
  }, [currentSectData]);

  // 计算当前查看节点的请教报价
  const currentInspectQuote = useMemo(() => {
    if (!inspectingNode || !currentSectData) return null;
    return quoteMartialArtLearn({
      sectName: currentSectData.门派名称,
      node: inspectingNode,
      userCultivation: stats.cultivation,
      userContribution: currentFactionMembership?.贡献 || 0,
      knownMartialArts: stats.martialArts || {},
      initialAttributes: stats.initialAttributes,
      userRealm: stats.realm,
    });
  }, [inspectingNode, currentSectData, stats, currentFactionMembership]);

  // 处理【向师请教】
  const handleLearnMartialArt = async (node: SectMartialNode) => {
    if (!currentSectData || isBusy || isActionPending) return;
    const quote = quoteMartialArtLearn({
      sectName: currentSectData.门派名称,
      node,
      userCultivation: stats.cultivation,
      userContribution: currentFactionMembership?.贡献 || 0,
      knownMartialArts: stats.martialArts || {},
      initialAttributes: stats.initialAttributes,
      userRealm: stats.realm,
    });

    if (!quote.canLearn) {
      setActionError(quote.reason || '未满足请教条件');
      return;
    }

    setActionError(null);
    setIsActionPending(true);
    try {
      const res = await learnFactionMartialArt({
        sectName: currentSectData.门派名称,
        artName: node.功法,
        quote,
      });

      if (!res.success) {
        setActionError(res.error || '向师请教失败');
        return;
      }

      // 扣费事务落库后，发送 User 消息请求 AI 生成生动教学剧情
      const teacher = currentFactionMembership?.师承 || '本门长辈';
      const prompt = buildLearnMartialArtUserMessage(stats.name, teacher, node.功法, node.传承层级);
      setInspectingNode(null);
      if (onClose) onClose();
      await onSendMessage(prompt);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '请教武学出现异常');
    } finally {
      setIsActionPending(false);
    }
  };

  // 查看/刷新差事：后台模型只生成候选池，不创建聊天回合。
  const handleGenerateTaskOptions = async (sectName: string) => {
    const sect = getSectByName(sectName);
    if (!sect || isBusy || isActionPending) return;
    setActionError(null);
    setIsActionPending(true);
    try {
      await onGenerateTaskOptions(sectName);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '查看差事出现异常');
    } finally {
      setIsActionPending(false);
    }
  };

  // 接取已生成的候选差事：由前端确定性搬入正式任务，不调用 AI。
  const handleAcceptTask = async (sectName: string, taskName: string) => {
    if (isBusy || isActionPending) return;
    setActionError(null);
    setIsActionPending(true);
    try {
      await onAcceptTask(sectName, taskName);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '接取差事出现异常');
    } finally {
      setIsActionPending(false);
    }
  };

  // 处理【拜入门派 / 投身势力】
  const handleJoinFaction = async (sect: SectStaticData) => {
    if (isBusy || isActionPending) return;
    setIsActionPending(true);
    try {
      const teacher = publicRuntimeState?.当前掌舵人[0];
      const prompt = buildJoinFactionUserMessage(sect, stats.name, teacher);
      if (onClose) onClose();
      await onSendMessage(prompt);
    } finally {
      setIsActionPending(false);
    }
  };

  // 处理【同门切磋】
  const handleSpar = async () => {
    if (!currentSectData || isBusy || isActionPending) return;
    setIsActionPending(true);
    try {
      const teacher = currentFactionMembership?.师承 || '同门师长';
      const prompt = `${stats.name}在${currentSectData.门派名称}演武场中，主动向同门师兄弟请教切磋武艺。

[系统指令：同门切磋]
- 所属势力：${currentSectData.门派名称}
- 切磋对象：同门精锐师兄/师姐
- 剧情要求：请生成两人交锋过招、点到即止的精彩比武拆招正文，并在文末由${teacher}点评指点其招式得失。`;
      if (onClose) onClose();
      await onSendMessage(prompt);
    } finally {
      setIsActionPending(false);
    }
  };

  // 处理【申请晋升】
  const handlePromote = async () => {
    if (!currentSectData || !currentFactionMembership || isBusy || isActionPending) return;
    const currentId = currentFactionMembership.身份;
    let nextId = '亲传弟子';
    if (currentId.includes('入门') || currentId.includes('记名')) {
      nextId = currentSectData.体系类型 === '帮会' ? '四袋弟子' : currentSectData.体系类型 === '世家' ? '执事家臣' : '亲传弟子';
    } else if (currentId.includes('亲传') || currentId.includes('四袋')) {
      nextId = currentSectData.体系类型 === '帮会' ? '分舵舵主' : currentSectData.体系类型 === '世家' ? '供奉客卿' : '执事长老';
    }

    setIsActionPending(true);
    try {
      const prompt = buildFactionPromotionUserMessage(
        stats.name,
        currentSectData,
        currentId,
        nextId,
        currentFactionMembership.师承 || '本门长辈',
      );
      if (onClose) onClose();
      await onSendMessage(prompt);
    } finally {
      setIsActionPending(false);
    }
  };

  // 处理【破门叛离】
  const handleBetray = async () => {
    if (!currentSectData || !currentFactionMembership || isBusy || isActionPending) return;
    setConfirmingBetray(false);
    setIsActionPending(true);
    try {
      const prompt = buildFactionBetrayUserMessage(stats.name, currentSectData, currentFactionMembership.身份);
      if (onClose) onClose();
      await onSendMessage(prompt);
    } finally {
      setIsActionPending(false);
    }
  };

  return (
    <div className="faction-panel-wrapper">
      {/* 顶部主切换视图栏 */}
      <div className="faction-view-header">
        <div className="faction-view-tabs">
          <button
            type="button"
            className={`view-tab-btn ${viewMode === 'my-faction' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('my-faction');
              if (!playerFactions[selectedSectName]) {
                setSelectedSectName(joinedSectNames[0] || '');
                setInspectingNode(null);
              }
            }}
            disabled={!hasJoinedAny}
            title={!hasJoinedAny ? '暂未加入任何势力（当前为散修）' : '查看已加入的势力'}
          >
            <Icons.Character size={16} className="tab-icon" />
            <span>我的势力 {hasJoinedAny ? `(${joinedSectNames.length})` : ''}</span>
          </button>
          <button
            type="button"
            className={`view-tab-btn ${viewMode === 'all-factions' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('all-factions');
              const publicSelection = getPublicFactionByName(selectedSectName);
              setSelectedSectName(
                publicSelection?.势力名称 ||
                  getPublicFactionByName('全真教')?.势力名称 ||
                  allPublicFactions[0]?.势力名称 ||
                  '',
              );
              setInspectingNode(null);
            }}
          >
            <Icons.Faction size={16} className="tab-icon" />
            <span>天下势力鉴赏</span>
          </button>
        </div>

        {/* 若身兼多派，在“我的势力”顶部显示多门派切换 */}
        {viewMode === 'my-faction' && joinedSectNames.length > 1 && (
          <div className="my-sects-selector">
            <span className="selector-label">选择宗派：</span>
            <div className="sect-chips-list">
              {joinedSectNames.map(name => (
                <button
                  key={name}
                  type="button"
                  className={`sect-chip ${selectedSectName === name ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedSectName(name);
                    setInspectingNode(null);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {actionError && (
        <div className="faction-action-error-bar">
          <span>⚠️ {actionError}</span>
          <button type="button" onClick={() => setActionError(null)}>
            ×
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 视图 A：【我的势力】 */}
      {/* ========================================================= */}
      {viewMode === 'my-faction' && currentSectData && (
        <div className="faction-my-view">
          {/* 顶部势力信息卡 */}
          <div className="sect-banner-card">
            <div className="banner-left">
              <div className="sect-emblem-box">
                <Icons.Faction size={36} className="emblem-icon" />
                <span className={`sect-type-pill ${currentSectData.体系类型}`}>
                  {currentSectData.体系类型}
                </span>
              </div>
              <div className="sect-meta-box">
                <div className="sect-name-row">
                  <h3 className="sect-title">{currentSectData.门派名称}</h3>
                  <span className="sect-status-tag">在籍</span>
                </div>
                <div className="sect-submeta-row">
                  <span className="meta-item">
                    <strong>主峰驻地：</strong>
                    {currentSectData.主峰驻地}
                    {onNavigateLocation && (
                      <button
                        type="button"
                        className="loc-nav-link"
                        onClick={() => onNavigateLocation(currentSectData.主峰驻地)}
                      >
                        [定位]
                      </button>
                    )}
                  </span>
                  <span className="meta-item">
                    <strong>身份称谓：</strong>
                    {currentFactionMembership?.身份 || '弟子'}
                  </span>
                  <span className="meta-item">
                    <strong>授业恩师：</strong>
                    {currentFactionMembership?.师承 || currentSectData.掌舵人[0] || '长辈'}
                  </span>
                </div>
              </div>
            </div>

            <div className="banner-right">
              <div className="contrib-counter-box">
                <span className="counter-label">门派贡献</span>
                <span className="counter-value">{currentFactionMembership?.贡献 ?? 0}</span>
              </div>
              <div className="cult-counter-box">
                <span className="counter-label">当前修为</span>
                <span className="counter-value">{stats.cultivation}</span>
              </div>
            </div>
          </div>

          {/* 中央主体：左侧传承武学树 + 右侧差事任务分栏 */}
          <div className="faction-main-split">
            {/* 左侧/中央：传承武学树 */}
            <div className="faction-tree-column">
              <div className="column-title-bar">
                <h4 className="column-title">
                  <Icons.Manual size={16} className="title-icon" />
                  传承武学技能树
                </h4>
                <span className="column-hint">点击武学节点查看详情与向师请教</span>
              </div>

              <div className="tier-levels-container">
                {TIER_ORDER.map(tier => {
                  const nodes = martialNodesByTier[tier] || [];
                  if (nodes.length === 0) return null;

                  return (
                    <div key={tier} className="tier-level-row">
                      <div className="tier-header-badge">
                        <span className="tier-name">{tier}</span>
                        <span className="tier-count">({nodes.length})</span>
                      </div>
                      <div className="tier-nodes-list">
                        {nodes.map(node => {
                          const isLearned = Boolean(stats.martialArts?.[node.功法]);
                          const quote = quoteMartialArtLearn({
                            sectName: currentSectData.门派名称,
                            node,
                            userCultivation: stats.cultivation,
                            userContribution: currentFactionMembership?.贡献 || 0,
                            knownMartialArts: stats.martialArts || {},
                            initialAttributes: stats.initialAttributes,
                            userRealm: stats.realm,
                          });

                          const isSelected = inspectingNode?.节点ID === node.节点ID;
                          const nodeStatusClass = isLearned
                            ? 'status-learned'
                            : quote.canLearn
                            ? 'status-available'
                            : 'status-locked';

                          return (
                            <button
                              key={node.节点ID}
                              type="button"
                              className={`martial-node-card ${nodeStatusClass} ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setActionError(null);
                                setInspectingNode(node);
                              }}
                              title={isLearned ? '已融会贯通' : quote.canLearn ? '满足条件，可向师请教' : quote.reason}
                            >
                              <div className="node-badge-status">
                                {isLearned ? '✓ 已习得' : quote.canLearn ? '可请教' : '未解锁'}
                              </div>
                              <div className="node-art-name">{node.功法}</div>
                              <div className="node-branch-tag">{node.分支}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右侧分栏：【势力差事】子组件 */}
            <div className="faction-tasks-column">
              <SectTaskList
                tasks={tasks}
                availableTasks={availableTasksByFaction[selectedSectName] || {}}
                activeSectName={selectedSectName}
                onClaimTask={onClaimTask}
                onGenerateTaskOptions={handleGenerateTaskOptions}
                onAcceptTask={handleAcceptTask}
                onNavigateLocation={onNavigateLocation}
                isBusy={isBusy || isActionPending}
              />
            </div>
          </div>

          {/* 底部动作栏 */}
          <div className="faction-bottom-actions-bar">
            <button
              type="button"
              className="faction-action-btn primary"
              onClick={handleSpar}
              disabled={isBusy || isActionPending}
              title="前往演武场与师兄弟切磋磨砺招式"
            >
              <Icons.Combat size={16} />
              <span>同门切磋</span>
            </button>
            <button
              type="button"
              className="faction-action-btn secondary"
              onClick={handlePromote}
              disabled={isBusy || isActionPending}
              title="向师门尊长申请更高阶称号名分"
            >
              <Icons.Variables size={16} />
              <span>申请晋升</span>
            </button>
            <button
              type="button"
              className="faction-action-btn danger"
              onClick={() => setConfirmingBetray(true)}
              disabled={isBusy || isActionPending}
              title="斩断门派羁绊，归还信物自立门户"
            >
              <Icons.Close size={16} />
              <span>破门叛离</span>
            </button>
          </div>
        </div>
      )}

      {viewMode === 'my-faction' && !currentSectData && currentFactionMembership && (
        <div className="faction-my-view">
          <div className="sect-banner-card">
            <div className="banner-left">
              <div className="sect-emblem-box">
                <Icons.Faction size={36} className="emblem-icon" />
                <span className={`sect-type-pill ${currentFactionMembership.体系类型}`}>
                  {currentFactionMembership.体系类型}
                </span>
              </div>
              <div className="sect-meta-box">
                <div className="sect-name-row">
                  <h3 className="sect-title">{selectedSectName}</h3>
                  <span className="sect-status-tag">{currentFactionMembership.状态 || '在籍'}</span>
                </div>
                <div className="sect-submeta-row">
                  <span className="meta-item">
                    <strong>身份称谓：</strong>
                    {currentFactionMembership.身份 || '门人'}
                  </span>
                  <span className="meta-item">
                    <strong>授业恩师：</strong>
                    {currentFactionMembership.师承 || '本门长辈'}
                  </span>
                </div>
              </div>
            </div>
            <div className="banner-right">
              <div className="contrib-counter-box">
                <span className="counter-label">门派贡献</span>
                <span className="counter-value">{currentFactionMembership.贡献 ?? 0}</span>
              </div>
              <div className="cult-counter-box">
                <span className="counter-label">当前修为</span>
                <span className="counter-value">{stats.cultivation}</span>
              </div>
            </div>
          </div>

          <div className="faction-main-split">
            <div className="faction-tree-column">
              <div className="column-title-bar">
                <h4 className="column-title">
                  <Icons.Faction size={16} className="title-icon" />
                  势力资料尚未收录
                </h4>
              </div>
              <p className="column-hint">
                该出身的门派归属与身份已保留；当前静态势力库尚未提供完整驻地、传承武学树与差事资料。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 视图 B：【天下势力鉴赏】 */}
      {/* ========================================================= */}
      {viewMode === 'all-factions' && (
        <div className="faction-world-view">
          {/* 侧栏势力列表 */}
          <div className="world-sects-sidebar">
            <div className="category-filter-bar">
              {(['全部', '宗门', '帮会', '世家', '行伍', '政权', '组织'] as FilterCategory[]).map(cat => (
                <button
                  key={cat}
                  type="button"
                  className={`filter-btn ${categoryFilter === cat ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="sects-card-list">
              {filteredPublicFactions.map(faction => {
                const isSelected = faction.势力名称 === currentPublicFaction?.势力名称;
                const joinableSect = faction.sectId ? getSectByName(faction.sectId) : undefined;
                const isMember = Boolean(
                  playerFactions[faction.势力名称] ||
                    (joinableSect ? playerFactions[joinableSect.门派名称] : undefined),
                );
                const summary = faction.规模资料[faction.规模资料.length - 1]?.描述 || '公开资料待补充';

                return (
                  <button
                    key={faction.势力ID}
                    type="button"
                    className={`sect-summary-card ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSectName(faction.势力名称);
                      setInspectingNode(null);
                    }}
                  >
                    <div className="card-top">
                      <span className="sect-title">{faction.势力名称}</span>
                      <span className={`type-tag ${faction.分类}`}>{faction.分类}</span>
                    </div>
                    <div className="card-desc">{summary}</div>
                    {isMember && <span className="member-mark">已加入</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右侧公开势力详情：稳定资料 + 当前变量状态，不再公开完整武学谱系。 */}
          {currentPublicFaction && (
            <div className="world-sect-detail-main">
              <div className="detail-top-card">
                <div className="detail-header-left">
                  <h3 className="sect-hero-title">{currentPublicFaction.势力名称}</h3>
                  <div className="sect-tags-row">
                    <span className="badge-tag">{currentPublicFaction.分类}</span>
                    {currentPublicFaction.驻地 && (
                      <span className="badge-tag location">驻地: {currentPublicFaction.驻地}</span>
                    )}
                    {currentPublicFaction.可加入 && <span className="badge-tag">可加入</span>}
                    {currentPublicFaction.驻地 && onNavigateLocation && (
                      <button
                        type="button"
                        className="quick-loc-btn"
                        onClick={() => onNavigateLocation(currentPublicFaction.驻地)}
                      >
                        查看地图
                      </button>
                    )}
                  </div>
                </div>

                <div className="detail-header-right">
                  {currentSectData && isMemberOfSelected ? (
                    <button
                      type="button"
                      className="enter-my-sect-btn"
                      onClick={() => {
                        setSelectedSectName(currentSectData.门派名称);
                        setViewMode('my-faction');
                      }}
                    >
                      进入我的势力
                    </button>
                  ) : currentSectData && isAtSectBase ? (
                    <button
                      type="button"
                      className="join-sect-btn at-base"
                      disabled={isBusy || isActionPending}
                      onClick={() => void handleJoinFaction(currentSectData)}
                      title="身处驻地，可向前辈行礼拜入"
                    >
                      拜入门派 / 投身麾下
                    </button>
                  ) : currentSectData ? (
                    <button
                      type="button"
                      className="travel-sect-btn"
                      disabled={isBusy || isActionPending || !onNavigateLocation}
                      onClick={() => onNavigateLocation?.(currentSectData.主峰驻地)}
                      title={`当前身处「${currentLocation}」，前往「${currentSectData.主峰驻地}」`}
                    >
                      前往{sectBaseLabel}
                    </button>
                  ) : (
                    <span className="sect-status-tag">公开势力资料</span>
                  )}
                </div>
              </div>

              <div className="detail-intro-section">
                <h4 className="section-heading">当前掌舵与公开规模</h4>
                <div className="sect-leaders-row">
                  <span className="leaders-label">当前掌舵人：</span>
                  {publicRuntimeState?.当前掌舵人.length ? (
                    publicRuntimeState.当前掌舵人.map(leader => (
                      <span key={leader} className="leader-pill">{leader}</span>
                    ))
                  ) : (
                    <span className="column-hint">当前人物变量尚未确认</span>
                  )}
                </div>

                {currentPublicFaction.资料首领.length > 0 && (
                  <div className="sect-leaders-row">
                    <span className="leaders-label">来源资料记载：</span>
                    {currentPublicFaction.资料首领.map((leader, index) => (
                      <span key={`${leader.来源}-${index}`} className="leader-pill">
                        {leader.来源} · {leader.人物 || leader.称谓}
                      </span>
                    ))}
                  </div>
                )}

                <div className="public-faction-scale-list">
                  {currentPublicFaction.规模资料.map((record, index) => (
                    <p key={`${record.来源}-${index}`} className="intro-text">
                      <strong>{record.来源}：</strong>{record.描述}
                    </p>
                  ))}
                </div>
              </div>

              <div className="detail-intro-section">
                <h4 className="section-heading">公开组织结构</h4>
                {currentPublicFaction.组织结构.length > 0 ? (
                  <div className="public-faction-structure-list">
                    {currentPublicFaction.组织结构.map(layer => (
                      <div key={layer.名称} className="public-faction-structure-item">
                        <div className="card-top">
                          <span className="sect-title">{layer.名称}</span>
                          {layer.显示人数 && <span className="member-mark">{layer.显示人数}</span>}
                        </div>
                        {layer.已知人物.length > 0 && (
                          <div className="sect-leaders-row">
                            {layer.已知人物.map(person => (
                              <span key={person} className="leader-pill">{person}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="column-hint">现有来源没有提供可公开的组织层级。</p>
                )}
              </div>

              {currentPublicFaction.重要人物.length > 0 && (
                <div className="detail-intro-section">
                  <h4 className="section-heading">公开重要人物</h4>
                  <div className="public-faction-people-list">
                    {currentPublicFaction.重要人物.map((person, index) => (
                      <div key={`${person.人物}-${person.来源}-${index}`} className="public-faction-person-item">
                        <strong>{person.人物}</strong>
                        <span>{person.身份}</span>
                        <small>{person.来源}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentPublicRelations.length > 0 && (
                <div className="detail-intro-section">
                  <h4 className="section-heading">势力关系</h4>
                  <div className="sect-leaders-row">
                    {currentPublicRelations.map((relation, index) => {
                      const counterpart =
                        relation.from === currentPublicFaction.势力ID ? relation.to : relation.from;
                      return (
                        <span key={`${relation.from}-${relation.to}-${index}`} className="leader-pill">
                          {relation.type} · {counterpart} · {relation.scope}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 节点详情与向师请教抽屉模态 */}
      {/* ========================================================= */}
      {inspectingNode && currentInspectQuote && (
        <div className="node-inspect-drawer">
          <div className="drawer-header">
            <div className="drawer-title-group">
              <span className="tier-pill">{inspectingNode.传承层级}</span>
              <h4 className="art-name">{inspectingNode.功法}</h4>
              <span className="branch-label">所属分支：{inspectingNode.分支}</span>
            </div>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setInspectingNode(null)}
            >
              ×
            </button>
          </div>

          <div className="drawer-body">
            {/* 掌握状态 */}
            <div className="drawer-status-box">
              <span className="status-label">当前研习状态：</span>
              <span className={`status-val ${currentInspectQuote.isLearned ? 'learned' : 'unlearned'}`}>
                {currentInspectQuote.isLearned ? '已掌握（已录入武学秘籍）' : '未习得'}
              </span>
            </div>

            {/* 前置条件检测 */}
            <div className="drawer-requirements-box">
              <h5 className="box-title">研习前置条件</h5>
              <ul className="req-list">
                {inspectingNode.前置节点.length === 0 ? (
                  <li className="req-item pass">无前置功法限制</li>
                ) : (
                  inspectingNode.前置节点.map(pre => {
                    const preName = pre.节点ID.split('::')[1] || pre.节点ID;
                    const isMet = Boolean(stats.martialArts?.[preName]?.掌握程度);
                    return (
                      <li key={pre.节点ID} className={`req-item ${isMet ? 'pass' : 'fail'}`}>
                        {isMet ? '✓' : '✗'} 需掌握《{preName}》（{pre.最低掌握程度}）
                      </li>
                    );
                  })
                )}
                {Object.entries(inspectingNode.学习限制.属性门槛).map(([attr, req]) => {
                  const currentVal = stats.initialAttributes[attr as keyof InitialAttributes] ?? 0;
                  const isMet = currentVal >= (req as number);
                  return (
                    <li key={attr} className={`req-item ${isMet ? 'pass' : 'fail'}`}>
                      {isMet ? '✓' : '✗'} {attr}要求 {req} 点（当前 {currentVal} 点）
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* 请教消耗与资源对比 */}
            <div className="drawer-cost-box">
              <h5 className="box-title">向师请教消耗</h5>
              <div className="cost-row">
                <span className="cost-item">
                  门派贡献：
                  <strong>{currentInspectQuote.contributionCost}</strong>
                  <small> (当前: {currentInspectQuote.currentContribution})</small>
                </span>
                <span className="cost-item">
                  研习修为：
                  <strong>{currentInspectQuote.cultivationCost}</strong>
                  <small> (当前: {currentInspectQuote.currentCultivation})</small>
                </span>
              </div>
            </div>
          </div>

          {/* 底部动作按钮 */}
          <div className="drawer-footer">
            {isMemberOfSelected ? (
              <button
                type="button"
                className="action-learn-btn"
                disabled={!currentInspectQuote.canLearn || isBusy || isActionPending}
                onClick={() => handleLearnMartialArt(inspectingNode)}
              >
                {currentInspectQuote.isLearned
                  ? '已融会贯通'
                  : currentInspectQuote.canLearn
                  ? `向师请教《${inspectingNode.功法}》`
                  : currentInspectQuote.reason}
              </button>
            ) : (
              <div className="not-member-tip">需先拜入本门方可向师尊请教传承绝艺</div>
            )}
          </div>
        </div>
      )}

      {/* 叛门二次确认弹窗 */}
      {confirmingBetray && currentSectData && (
        <div className="faction-confirm-modal-overlay">
          <div className="faction-confirm-modal">
            <h4 className="modal-title">⚠️ 决意破门叛离？</h4>
            <p className="modal-desc">
              破门叛出后，你将失去在<strong>{currentSectData.门派名称}</strong>的一切名分与道统，
              身份将变更为<strong>「弃徒」</strong>，门派累积的<strong>
                {currentFactionMembership?.贡献 || 0} 点贡献
              </strong>将被彻底清空，同门师长亦将对你心生嫌隙！
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setConfirmingBetray(false)}
              >
                深思熟虑，暂留师门
              </button>
              <button
                type="button"
                className="confirm-betray-btn"
                onClick={handleBetray}
              >
                断袍割义，即刻叛离
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
