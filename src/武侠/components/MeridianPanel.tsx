import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MeridianNodeView,
  MeridianNodeId,
  MeridianProjection,
  MeridianSummary,
  MeridianUpgradeQuote,
  MeridianUpgradeResult,
} from '../types';
import { MeridianBodyDiagram, type MeridianBodyView } from './MeridianBodyDiagram';

export interface MeridianPanelProps {
  projection: MeridianProjection;
  cultivation: number;
  gender?: '男' | '女' | string;
  busy?: boolean;
  onUpgrade: (nodeId: MeridianNodeId, quote: MeridianUpgradeQuote) => Promise<MeridianUpgradeResult | void>;
}

const formatNumber = (value: number) => new Intl.NumberFormat('zh-CN').format(Math.max(0, Math.floor(value)));

const getDefaultNode = (nodes: MeridianNodeView[]) =>
  nodes.find(node => node.status === 'available') ?? nodes.find(node => node.status === 'locked') ?? nodes[0];

const getStatusLabel = (node: MeridianNodeView) => {
  if (node.status === 'opened') {
    return '已打通';
  }
  if (node.status === 'available') {
    return '可冲穴';
  }
  return '尚未解锁';
};

const selectPreferredNode = (nodes: MeridianNodeView[], currentNodeId?: string) =>
  nodes.find(node => node.id === currentNodeId) ??
  nodes.find(node => node.status === 'available') ??
  nodes.find(node => node.status === 'locked') ??
  nodes[nodes.length - 1];

export const MeridianPanel: React.FC<MeridianPanelProps> = ({
  projection,
  cultivation,
  gender = '男',
  busy = false,
  onUpgrade,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(() => getDefaultNode(projection.nodes)?.id);
  const [mobileView, setMobileView] = useState<MeridianBodyView>(
    () => getDefaultNode(projection.nodes)?.view ?? 'front',
  );
  const [confirmationQuote, setConfirmationQuote] = useState<MeridianUpgradeQuote | null>(null);
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastOpenedNodeId, setLastOpenedNodeId] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => projection.nodes.find(node => node.id === selectedNodeId) ?? getDefaultNode(projection.nodes),
    [projection.nodes, selectedNodeId],
  );
  const selectedMeridian = useMemo(
    () => projection.meridians.find(meridian => meridian.id === selectedNode?.meridianId) ?? projection.meridians[0],
    [projection.meridians, selectedNode?.meridianId],
  );
  const selectedMeridianNodes = useMemo(
    () =>
      projection.nodes
        .filter(node => node.meridianId === selectedMeridian?.id)
        .sort((left, right) => left.stageIndex - right.stageIndex),
    [projection.nodes, selectedMeridian?.id],
  );
  const frontNodes = useMemo(() => projection.nodes.filter(node => node.view === 'front'), [projection.nodes]);
  const backNodes = useMemo(() => projection.nodes.filter(node => node.view === 'back'), [projection.nodes]);
  const frontMeridians = useMemo(
    () => projection.meridians.filter(meridian => meridian.view === 'front'),
    [projection.meridians],
  );
  const backMeridians = useMemo(
    () => projection.meridians.filter(meridian => meridian.view === 'back'),
    [projection.meridians],
  );
  const isPending = pendingNodeId !== null;
  const upgradeLocked = busy || isPending || projection.corrupted;
  const canOpenConfirmation = Boolean(
    selectedNode?.status === 'available' && selectedNode.quote?.canUpgrade && !upgradeLocked,
  );

  useEffect(() => {
    if (selectedNodeId && projection.nodes.some(node => node.id === selectedNodeId)) {
      return;
    }
    const fallback = getDefaultNode(projection.nodes);
    setSelectedNodeId(fallback?.id);
    if (fallback) {
      setMobileView(fallback.view);
    }
  }, [projection.nodes, selectedNodeId]);

  useEffect(() => {
    setConfirmationQuote(null);
    setFeedback(null);
  }, [selectedNodeId]);

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      const node = projection.nodes.find(candidate => candidate.id === nodeId);
      setSelectedNodeId(nodeId);
      if (node) {
        setMobileView(node.view);
      }
    },
    [projection.nodes],
  );

  const handleSelectMeridian = useCallback(
    (meridianId: MeridianSummary['id']) => {
      const meridian = projection.meridians.find(candidate => candidate.id === meridianId);
      const nodes = projection.nodes
        .filter(node => node.meridianId === meridianId)
        .sort((left, right) => left.stageIndex - right.stageIndex);
      const target = selectPreferredNode(nodes, selectedNode?.meridianId === meridianId ? selectedNode.id : undefined);
      if (target) {
        setSelectedNodeId(target.id);
        setMobileView(target.view);
      } else if (meridian) {
        setMobileView(meridian.view);
      }
    },
    [projection.meridians, projection.nodes, selectedNode],
  );

  const handleAskConfirmation = useCallback(() => {
    if (!canOpenConfirmation || !selectedNode?.quote) {
      return;
    }
    setFeedback(null);
    setConfirmationQuote(selectedNode.quote);
  }, [canOpenConfirmation, selectedNode]);

  const handleConfirmUpgrade = useCallback(async () => {
    if (!selectedNode || !confirmationQuote || upgradeLocked || selectedNode.id !== confirmationQuote.nodeId) {
      return;
    }

    setPendingNodeId(selectedNode.id);
    setFeedback(null);
    try {
      const result = await onUpgrade(selectedNode.id, confirmationQuote);
      if (result && !result.success) {
        setFeedback({ type: 'error', text: result.error || '冲穴未成，请稍后再试。' });
        return;
      }
      setConfirmationQuote(null);
      setLastOpenedNodeId(selectedNode.id);
      setFeedback({
        type: 'success',
        text: result ? `${selectedNode.name}已贯通，周身真气流转。` : '冲穴请求已提交。',
      });
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : '冲穴失败，请刷新状态后再试。' });
    } finally {
      setPendingNodeId(null);
    }
  }, [confirmationQuote, onUpgrade, selectedNode, upgradeLocked]);

  if (projection.nodes.length === 0 || projection.meridians.length === 0) {
    return (
      <section className="meridian-panel meridian-panel-empty" data-wuxia-automation="meridian-panel">
        <span className="meridian-empty-seal" aria-hidden="true">
          脉
        </span>
        <h3>经脉图尚未显现</h3>
        <p>{projection.error || '当前状态中没有可用的奇经八脉投影。'}</p>
      </section>
    );
  }

  return (
    <section
      className={`meridian-panel ${projection.corrupted ? 'is-corrupted' : ''}`}
      aria-labelledby="meridian-panel-title"
      aria-busy={isPending}
      data-wuxia-automation="meridian-panel"
    >
      <header className="meridian-panel-masthead">
        <div className="meridian-title-seal" aria-hidden="true">
          脉
        </div>
        <div className="meridian-title-copy">
          <span>周天藏府 · 内景真图</span>
          <h3 id="meridian-panel-title">奇经八脉</h3>
          <p>以修为引真气逐穴而行，关窍一开，不可逆转。</p>
        </div>
        <div className="meridian-cultivation-token" aria-label={`当前修为${formatNumber(cultivation)}`}>
          <small>可用修为</small>
          <strong>{formatNumber(cultivation)}</strong>
        </div>
      </header>

      {projection.corrupted && (
        <div className="meridian-integrity-warning" role="alert" data-wuxia-automation="meridian-corrupted-warning">
          <b>经脉卷册无法辨认</b>
          <span>{projection.error || '存档中的经脉数据不完整，已停用冲穴。'}</span>
        </div>
      )}

      <div className="meridian-mobile-view-switch" role="group" aria-label="铜人视角">
        {(['front', 'back'] as const).map(view => (
          <button
            key={view}
            type="button"
            className={mobileView === view ? 'is-active' : ''}
            aria-pressed={mobileView === view}
            onClick={() => setMobileView(view)}
            data-wuxia-automation={`meridian-view-toggle-${view}`}
          >
            {view === 'front' ? '正面' : '背面'}
          </button>
        ))}
      </div>

      <div className="meridian-panel-layout">
        <div className="meridian-atlas" aria-label="奇经八脉铜人图">
          <div className="meridian-atlas-inscription" aria-hidden="true">
            <span>气走丹田</span>
            <i />
            <span>脉行周天</span>
          </div>
          <div className="meridian-figures">
            <MeridianBodyDiagram
              view="front"
              gender={gender}
              nodes={frontNodes}
              meridians={frontMeridians}
              selectedNodeId={selectedNode?.id}
              selectedMeridianId={selectedMeridian?.id}
              disabled={projection.corrupted}
              active={mobileView === 'front'}
              onSelectNode={handleSelectNode}
              onSelectMeridian={handleSelectMeridian}
            />
            <MeridianBodyDiagram
              view="back"
              gender={gender}
              nodes={backNodes}
              meridians={backMeridians}
              selectedNodeId={selectedNode?.id}
              selectedMeridianId={selectedMeridian?.id}
              disabled={projection.corrupted}
              active={mobileView === 'back'}
              onSelectNode={handleSelectNode}
              onSelectMeridian={handleSelectMeridian}
            />
          </div>
          <div className="meridian-atlas-legend" aria-label="穴位状态图例">
            <span>
              <i className="is-opened" />
              已通
            </span>
            <span>
              <i className="is-available" />
              可冲
            </span>
            <span>
              <i className="is-locked" />
              未解
            </span>
          </div>
        </div>

        <aside className="meridian-detail-panel" aria-label="经脉详情">
          <div className="meridian-list" role="group" aria-label="八脉">
            {projection.meridians.map(meridian => {
              const active = selectedMeridian?.id === meridian.id;
              const complete = meridian.completedNodes === meridian.totalNodes;
              return (
                <button
                  key={meridian.id}
                  type="button"
                  className={`meridian-list-item ${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}
                  onClick={() => handleSelectMeridian(meridian.id)}
                  aria-pressed={active}
                  data-wuxia-automation={`meridian-select-${meridian.id}`}
                >
                  <span className="meridian-list-name">{meridian.name}</span>
                  <span className="meridian-list-progress">
                    {meridian.completedNodes}/{meridian.totalNodes}
                  </span>
                  <span className="meridian-list-track" aria-hidden="true">
                    <i style={{ width: `${(meridian.completedNodes / Math.max(1, meridian.totalNodes)) * 100}%` }} />
                  </span>
                </button>
              );
            })}
          </div>

          {selectedNode && selectedMeridian && (
            <div className={`meridian-node-detail ${lastOpenedNodeId === selectedNode.id ? 'is-newly-opened' : ''}`}>
              <div className="meridian-node-detail-head">
                <div>
                  <span>
                    {selectedMeridian.name} · 第{selectedNode.stageIndex + 1}关
                  </span>
                  <h4>{selectedNode.name}</h4>
                </div>
                <span className={`meridian-status-stamp is-${selectedNode.status}`}>
                  {getStatusLabel(selectedNode)}
                </span>
              </div>

              <ol className="meridian-stage-steps" aria-label={`${selectedMeridian.name}穴位进度`}>
                {selectedMeridianNodes.map(node => (
                  <li key={node.id} className={`is-${node.status} ${node.id === selectedNode.id ? 'is-selected' : ''}`}>
                    <button type="button" onClick={() => handleSelectNode(node.id)} aria-label={`查看${node.name}`}>
                      <i aria-hidden="true" />
                      <span>{node.stageIndex === 4 ? selectedMeridian.confluenceName : node.stageName}</span>
                    </button>
                  </li>
                ))}
              </ol>

              <dl className="meridian-node-facts">
                <div>
                  <dt>前置</dt>
                  <dd>
                    {selectedNode.prerequisiteLabel || (selectedNode.stageIndex === 0 ? '无，随时可启脉' : '已满足')}
                  </dd>
                </div>
                <div>
                  <dt>冲穴消耗</dt>
                  <dd>
                    {selectedNode.quote
                      ? `${formatNumber(selectedNode.quote.cost)} 修为`
                      : selectedNode.status === 'opened'
                        ? '已支付'
                        : '尚不可知'}
                  </dd>
                </div>
                <div className="meridian-node-reward">
                  <dt>贯通所得</dt>
                  <dd>{selectedNode.rewardLabel}</dd>
                </div>
              </dl>

              {feedback && (
                <div
                  className={`meridian-feedback is-${feedback.type}`}
                  role={feedback.type === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                  data-wuxia-automation="meridian-feedback"
                >
                  {feedback.text}
                </div>
              )}

              {confirmationQuote && confirmationQuote.nodeId === selectedNode.id ? (
                <div className="meridian-confirmation" role="alertdialog" aria-label={`确认冲击${selectedNode.name}`}>
                  <div className="meridian-confirmation-copy">
                    <b>落子无悔，真气不可复收</b>
                    <span>
                      将消耗 {formatNumber(confirmationQuote.cost)} 修为，余{' '}
                      {formatNumber(confirmationQuote.newCultivation)}。
                    </span>
                  </div>
                  <div className="meridian-confirmation-actions">
                    <button
                      type="button"
                      className="meridian-action-secondary"
                      onClick={() => setConfirmationQuote(null)}
                      disabled={upgradeLocked}
                      data-wuxia-automation="meridian-upgrade-cancel"
                    >
                      再想想
                    </button>
                    <button
                      type="button"
                      className="meridian-action-primary"
                      onClick={handleConfirmUpgrade}
                      disabled={upgradeLocked}
                      data-wuxia-automation="meridian-upgrade-confirm"
                    >
                      {pendingNodeId === selectedNode.id ? (
                        <>
                          <i className="meridian-action-spinner" />
                          贯脉中
                        </>
                      ) : (
                        '确认冲穴'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="meridian-upgrade-block">
                  <button
                    type="button"
                    className="meridian-action-primary meridian-upgrade-button"
                    onClick={handleAskConfirmation}
                    disabled={!canOpenConfirmation}
                    data-wuxia-automation="meridian-upgrade-open"
                  >
                    <span aria-hidden="true">冲</span>
                    <b>{selectedNode.status === 'opened' ? '此穴已通' : busy || isPending ? '气机未定' : '冲击此穴'}</b>
                    {selectedNode.quote && selectedNode.status !== 'opened' && (
                      <small>{formatNumber(selectedNode.quote.cost)} 修为</small>
                    )}
                  </button>
                  {!canOpenConfirmation && selectedNode.status !== 'opened' && (
                    <p>
                      {projection.corrupted
                        ? '经脉数据异常，暂不可冲穴。'
                        : selectedNode.quote?.reason || selectedNode.prerequisiteLabel || '尚需打通前置穴位。'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {Object.values(projection.modifiers).some(value => value !== 0) && (
            <div className="meridian-modifier-summary">
              <span>已得周天增益</span>
              <div>
                {Object.entries(projection.modifiers)
                  .filter(([, value]) => value !== 0)
                  .map(([attribute, value]) => (
                    <b key={attribute}>
                      {attribute} +{value}%
                    </b>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

export default MeridianPanel;
