import {
  Check,
  Clock3,
  GitBranch,
  Loader2,
  MapPin,
  Network,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  Route,
  ScrollText,
  ShieldAlert,
  Undo2,
  X,
} from 'lucide-react';
import React, { Component, useCallback, useEffect, useMemo, useState } from 'react';
import {
  isHistoryCheckoutJournalExpired,
  readHistoryCheckoutJournal,
  type HistoryCheckoutJournal,
} from '../../shared/historyCheckoutJournal';
import type { GameState, HistoryLocator, HistoryNode } from '../types';
import {
  canSwitchSwipeInPlace,
  checkoutNode,
  filterTreeToRelatedComponent,
  renameNode,
  resumeCheckout,
  retryCheckoutRecovery,
  returnToCheckoutSource,
  scanCurrentChat,
  setNodePinned,
  type HistoryCheckoutResult,
  type HistoryTreeViewState,
} from '../utils/saveLoadManager';
import { HistoryTreeCanvas } from './HistoryTreeCanvas';

interface SaveLoadPanelProps {
  gameState: GameState;
  onClose: () => void;
}

type WorkState = {
  type: 'idle' | 'loading' | 'error' | 'success';
  message: string;
};

interface HistoryTreeErrorBoundaryProps {
  resetKey: string;
  children: React.ReactNode;
}

interface HistoryTreeErrorBoundaryState {
  error: string | null;
}

class HistoryTreeErrorBoundary extends Component<HistoryTreeErrorBoundaryProps, HistoryTreeErrorBoundaryState> {
  state: HistoryTreeErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): HistoryTreeErrorBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[wuxia-history-tree] 历史树渲染失败', error, info);
  }

  componentDidUpdate(previousProps: HistoryTreeErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="history-empty" role="alert">
        <div className="history-empty-inner">
          <ShieldAlert size={34} />
          <h4>谱牒画布未能展开</h4>
          <p>历史数据仍然安全，只有树图渲染失败。你可以重试绘制，或关闭面板继续游戏。</p>
          <button type="button" className="history-secondary-action" onClick={this.retry}>
            <RefreshCw size={14} />
            重试绘制
          </button>
        </div>
      </div>
    );
  }
}

function getWorldTimeText(gameState: GameState): string {
  if (gameState.gameTime) return gameState.gameTime;
  const time = gameState.worldTime;
  return time
    ? `${time.year}年${time.month}月${time.day}日${time.hour}时${String(time.minute).padStart(2, '0')}分`
    : '';
}

function getCurrentLocator(view: HistoryTreeViewState | null): HistoryLocator | null {
  if (!view?.currentNodeId) return null;
  const node = view.tree.nodes[view.currentNodeId];
  return node?.locators.find(locator => locator.chatId === view.currentChat.id) ?? null;
}

function getNodeBranchStatus(view: HistoryTreeViewState, nodeId: string) {
  return Object.values(view.tree.branches).find(branch => branch.headNodeId === nodeId)?.status ?? null;
}

const SaveLoadPanel: React.FC<SaveLoadPanelProps> = ({ gameState }) => {
  const [view, setView] = useState<HistoryTreeViewState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [confirmingNodeId, setConfirmingNodeId] = useState<string | null>(null);
  const [canSwitchInPlace, setCanSwitchInPlace] = useState(false);
  const [journal, setJournal] = useState<HistoryCheckoutJournal | null>(() => readHistoryCheckoutJournal());
  const [lastCheckout, setLastCheckout] = useState<HistoryCheckoutResult | null>(null);
  const [showAllLineages, setShowAllLineages] = useState(false);
  const [workState, setWorkState] = useState<WorkState>({
    type: 'loading',
    message: '正在展开江湖谱牒……',
  });

  const scanOptions = useMemo(
    () => ({
      location: gameState.currentLocation || gameState.stats.location || '',
      worldTimeText: getWorldTimeText(gameState),
    }),
    [gameState.currentLocation, gameState.gameTime, gameState.stats.location, gameState.worldTime],
  );

  const refresh = useCallback(
    async (resume = false) => {
      setWorkState({ type: 'loading', message: resume ? '正在续接未完成的分叉……' : '正在校准历史路径……' });
      try {
        let recovered: HistoryCheckoutResult | null = null;
        if (resume) recovered = await resumeCheckout();
        const next = await scanCurrentChat(scanOptions);
        setView(next);
        setSelectedNodeId(current => (current && next.tree.nodes[current] ? current : next.currentNodeId));
        setJournal(readHistoryCheckoutJournal());
        if (recovered) setLastCheckout(recovered);
        if (recovered?.status && recovered.status !== 'commit') {
          setWorkState({ type: 'error', message: recovered.error || '历史分叉恢复失败，请选择恢复操作。' });
        } else {
          setWorkState({
            type: recovered ? 'success' : 'idle',
            message: recovered ? '未完成的历史分叉已恢复。' : '谱牒已与当前聊天同步。',
          });
        }
      } catch (error) {
        setWorkState({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    },
    [scanOptions],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  // 谱牒默认只展示与当前聊天连通的脉络；其他历史局的节点仍保留在数据里，可用开关查看
  const displayTree = useMemo(
    () => (view ? (showAllLineages ? view.tree : filterTreeToRelatedComponent(view.tree, view.currentNodeId)) : null),
    [view, showAllLineages],
  );
  const selectedNode = selectedNodeId && displayTree ? (displayTree.nodes[selectedNodeId] ?? null) : null;
  const currentLocator = useMemo(() => getCurrentLocator(view), [view]);
  const selectedBranchStatus = view && selectedNode ? getNodeBranchStatus(view, selectedNode.id) : null;
  const selectedIsCurrent = Boolean(selectedNode && selectedNode.id === view?.currentNodeId);
  const selectedIsOtherBranchLeaf = Boolean(
    selectedNode &&
    !selectedIsCurrent &&
    Object.values(view?.tree.branches ?? {}).some(
      branch => branch.headNodeId === selectedNode.id && branch.status !== 'broken',
    ),
  );
  // 选中的分支头所在脉络若包含当前分支的分叉起点，说明它就是当前分支的来源主线，
  // 此时切换语义是"返回主分支"而不是一般的"切换到该分支"
  const selectedIsMainReturn = useMemo(() => {
    if (!view || !selectedNode || !selectedIsOtherBranchLeaf) return false;
    const originNodeId = view.currentBranchId ? (view.tree.branches[view.currentBranchId]?.originNodeId ?? null) : null;
    if (!originNodeId) return false;
    const seen = new Set<string>();
    let cursor: string | null = selectedNode.id;
    while (cursor && !seen.has(cursor)) {
      if (cursor === originNodeId) return true;
      seen.add(cursor);
      cursor = view.tree.nodes[cursor]?.parentId ?? null;
    }
    return false;
  }, [view, selectedNode, selectedIsOtherBranchLeaf]);
  const checkoutPending = Boolean(journal && !isHistoryCheckoutJournalExpired(journal));
  const recoveryAvailable = Boolean(
    journal &&
    (isHistoryCheckoutJournalExpired(journal) ||
      lastCheckout?.status === 'recovery_failed' ||
      lastCheckout?.status === 'broken'),
  );
  const isWorking = workState.type === 'loading' || Boolean(journal);
  const recoveryActionDisabled = workState.type === 'loading';

  useEffect(() => {
    setLabelDraft(selectedNode?.label ?? '');
    setConfirmingNodeId(null);
    setCanSwitchInPlace(false);
    if (!selectedNode || selectedNode.id === view?.currentNodeId) return;
    let cancelled = false;
    void canSwitchSwipeInPlace(selectedNode.id).then(result => {
      if (!cancelled) setCanSwitchInPlace(result);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedNode, view?.currentNodeId]);

  const updateTree = (tree: HistoryTreeViewState['tree']) => {
    setView(current => (current ? { ...current, tree } : current));
  };

  const handleRename = () => {
    if (!selectedNode) return;
    try {
      updateTree(renameNode(selectedNode.id, labelDraft));
      setWorkState({ type: 'success', message: labelDraft.trim() ? '节点题名已写入谱牒。' : '节点题名已清除。' });
    } catch (error) {
      setWorkState({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handlePin = () => {
    if (!selectedNode) return;
    try {
      updateTree(setNodePinned(selectedNode.id, !selectedNode.pinned));
      setWorkState({
        type: 'success',
        message: selectedNode.pinned ? '已取消钉住；自动节点仍会永久保留。' : '已钉住此段江湖往事。',
      });
    } catch (error) {
      setWorkState({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const runCheckout = async (node: HistoryNode) => {
    setConfirmingNodeId(null);
    setWorkState({
      type: 'loading',
      message: selectedIsMainReturn
        ? '正在返回主分支……'
        : selectedIsOtherBranchLeaf
          ? '正在切换聊天分支……'
          : '正在创建非破坏性历史分叉……',
    });
    try {
      const result = await checkoutNode(node.id);
      setLastCheckout(result);
      setJournal(readHistoryCheckoutJournal());
      if (result.status !== 'commit') {
        await refresh(false);
        setWorkState({ type: 'error', message: result.error || '历史切换未能安全完成。' });
        return;
      }
      await refresh(false);
      setWorkState({
        type: 'success',
        message:
          result.actionKind === 'fork_branch'
            ? '新分支已建立；原路线的下一次玩家行动已放入输入框，等待你修改后手动发送。'
            : result.actionKind === 'existing_branch'
              ? selectedIsMainReturn
                ? '已返回主分支。'
                : '已切换到既有分支。'
              : '已切换最新楼层的异文。',
      });
    } catch (error) {
      setJournal(readHistoryCheckoutJournal());
      setWorkState({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handlePrimaryAction = () => {
    if (!selectedNode || selectedIsCurrent || isWorking) return;
    if (selectedIsOtherBranchLeaf) {
      void runCheckout(selectedNode);
      return;
    }
    setConfirmingNodeId(selectedNode.id);
  };

  const handleRetryRecovery = async () => {
    setWorkState({ type: 'loading', message: '正在重试分叉恢复……' });
    try {
      const result = await retryCheckoutRecovery();
      setLastCheckout(result);
      setJournal(readHistoryCheckoutJournal());
      await refresh(false);
      if (result?.status !== 'commit') {
        setWorkState({ type: 'error', message: result?.error || '恢复仍未完成。' });
      }
    } catch (error) {
      setWorkState({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleReturnSource = async () => {
    setWorkState({ type: 'loading', message: '正在返回来源聊天……' });
    try {
      await returnToCheckoutSource();
      setJournal(readHistoryCheckoutJournal());
      await refresh(false);
      setWorkState({ type: 'success', message: '已返回来源聊天，分叉恢复记录已解除。' });
    } catch (error) {
      setWorkState({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const primaryLabel = selectedIsCurrent
    ? '当前进度'
    : selectedIsMainReturn
      ? '返回主分支'
      : selectedIsOtherBranchLeaf
        ? '切换到该分支'
        : canSwitchInPlace
          ? '切换至此异文'
          : '从此处继续';

  return (
    <div className="save-history">
      <header className="history-masthead">
        <div className="history-title-block">
          <div className="history-seal" aria-hidden="true">
            <Route size={19} />
          </div>
          <div className="history-heading">
            <h3>江湖行迹谱</h3>
            <p>{view?.currentChat.name || '正在辨认当前卷册'} · 每个完整回合自动入谱</p>
          </div>
        </div>
        <div className="history-masthead-actions">
          <span className="history-count">{Object.keys(displayTree?.nodes ?? {}).length} 段行迹</span>
          <button
            type="button"
            className={`history-icon-btn ${showAllLineages ? 'active' : ''}`}
            aria-label={showAllLineages ? '只看当前脉络' : '显示全部行迹'}
            title={showAllLineages ? '只看当前脉络' : '显示全部行迹（含其他历史局）'}
            onClick={() => setShowAllLineages(current => !current)}
          >
            <Network size={15} />
          </button>
          <button
            type="button"
            className="history-icon-btn"
            aria-label="刷新历史谱牒"
            title="刷新历史谱牒"
            disabled={isWorking}
            onClick={() => void refresh(false)}
          >
            {workState.type === 'loading' ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
          </button>
        </div>
      </header>

      {checkoutPending && (
        <div className="history-journal-banner">
          <Loader2 className="spin" size={14} />
          <span>分叉事务进行中：{journal?.stage}。发送与重新生成已暂时锁定。</span>
        </div>
      )}
      {recoveryAvailable && (
        <div className="history-journal-banner">
          <ShieldAlert size={14} />
          <span>上次分叉未能完成。新聊天会保留，不会自动删除。</span>
        </div>
      )}

      <div className="history-workspace">
        <section className="history-canvas" aria-label="自动逻辑历史树">
          {view && displayTree && Object.keys(displayTree.nodes).length > 0 ? (
            <HistoryTreeErrorBoundary
              resetKey={`${view.tree.updatedAt}:${view.currentNodeId ?? ''}:${showAllLineages ? 'all' : 'related'}`}
            >
              <HistoryTreeCanvas
                key={showAllLineages ? 'all-lineages' : 'related-lineages'}
                tree={displayTree}
                currentNodeId={view.currentNodeId}
                currentBranchId={view.currentBranchId}
                currentLocator={currentLocator}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
            </HistoryTreeErrorBoundary>
          ) : (
            <div className="history-empty">
              <div className="history-empty-inner">
                <ScrollText size={34} />
                <h4>尚无完整回合</h4>
                <p>下一次剧情回复及事件结算完成后，会自动在这里留下第一段行迹，无需手动保存。</p>
              </div>
            </div>
          )}
        </section>

        <aside className="history-detail" aria-label="历史节点详情">
          <div className="history-detail-scroll">
            {selectedNode ? (
              <>
                <div className="history-detail-eyebrow">
                  <span>
                    {selectedIsCurrent
                      ? '当前路径'
                      : selectedIsMainReturn
                        ? '主分支'
                        : selectedIsOtherBranchLeaf
                          ? '既有分支'
                          : '历史节点'}
                  </span>
                  <span>{formatDate(selectedNode.createdAt)}</span>
                </div>
                <h4 className="history-detail-title">
                  {selectedNode.label || selectedNode.location || '未题名的江湖往事'}
                </h4>
                <div className="history-detail-meta">
                  <span>
                    <MapPin size={13} />
                    {selectedNode.location || '地点未载'}
                  </span>
                  <span>
                    <Clock3 size={13} />
                    {selectedNode.worldTimeText || '时辰未载'}
                  </span>
                  <span>
                    <GitBranch size={13} />
                    {selectedNode.locators.length} 个实际聊天定位
                  </span>
                </div>
                <p className="history-detail-preview">{selectedNode.preview || '暂无剧情摘录。'}</p>
                <div className="history-detail-flags">
                  {selectedNode.pinned && <span className="history-flag">已钉住</span>}
                  {!selectedNode.verification && <span className="history-flag warn">首次扫描 · 未校验</span>}
                  {selectedBranchStatus === 'recovery_failed' && <span className="history-flag danger">恢复失败</span>}
                  {selectedBranchStatus === 'broken' && <span className="history-flag danger">路径断链</span>}
                </div>
                <div className="history-label-editor">
                  <input
                    value={labelDraft}
                    onChange={event => setLabelDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') handleRename();
                    }}
                    placeholder="为此段往事题名（可选）"
                    maxLength={40}
                    disabled={isWorking}
                  />
                  <button
                    type="button"
                    className="history-icon-btn"
                    onClick={handleRename}
                    disabled={isWorking || labelDraft.trim() === (selectedNode.label ?? '')}
                    title="保存题名"
                    aria-label="保存题名"
                  >
                    <Check size={14} />
                  </button>
                </div>
              </>
            ) : (
              <div className="history-empty-inner">
                <Route size={30} />
                <h4>择一段行迹</h4>
                <p>点击图中节点查看剧情摘录。选择本身不会改变聊天。</p>
              </div>
            )}
          </div>

          {selectedNode && (
            <div className="history-detail-actions">
              {confirmingNodeId === selectedNode.id ? (
                <div className="history-confirm">
                  <p>
                    {canSwitchInPlace
                      ? '将切换最新楼层的另一条回复，并让 ERA 同步到对应状态。'
                      : '将从此处创建一个截断的新聊天；原聊天及未来完整保留。原路线的下一次玩家行动会放入输入框，但不会自动发送或生成。'}
                  </p>
                  <div className="history-confirm-actions">
                    <button
                      type="button"
                      className="history-primary-action"
                      disabled={isWorking}
                      onClick={() => void runCheckout(selectedNode)}
                    >
                      <Check size={14} />
                      确认继续
                    </button>
                    <button
                      type="button"
                      className="history-secondary-action"
                      onClick={() => setConfirmingNodeId(null)}
                    >
                      <X size={14} />
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`history-primary-action ${selectedIsCurrent ? 'current' : ''}`}
                  disabled={selectedIsCurrent || isWorking || selectedBranchStatus === 'broken'}
                  onClick={handlePrimaryAction}
                >
                  {selectedIsCurrent ? <Check size={15} /> : <GitBranch size={15} />}
                  {primaryLabel}
                </button>
              )}
              <button
                type="button"
                className={`history-secondary-action ${selectedNode.pinned ? 'active' : ''}`}
                disabled={isWorking}
                onClick={handlePin}
              >
                {selectedNode.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                {selectedNode.pinned ? '取消钉住' : '钉住节点'}
              </button>
              {recoveryAvailable && (
                <>
                  <button
                    type="button"
                    className="history-secondary-action"
                    disabled={recoveryActionDisabled}
                    onClick={() => void handleRetryRecovery()}
                  >
                    <RotateCcw size={14} />
                    重试恢复
                  </button>
                  <button
                    type="button"
                    className="history-secondary-action"
                    disabled={recoveryActionDisabled}
                    onClick={() => void handleReturnSource()}
                  >
                    <Undo2 size={14} />
                    返回来源聊天
                  </button>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      <div className={`history-status-line ${workState.type}`}>
        {workState.type === 'loading' && <Loader2 className="spin" size={13} />}
        {workState.type === 'error' && <ShieldAlert size={13} />}
        <span>{workState.message}</span>
      </div>
    </div>
  );
};

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '时间不详';
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default SaveLoadPanel;
