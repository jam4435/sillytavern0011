import {
  Check,
  Clock3,
  Copy,
  GitBranch,
  Loader2,
  MapPin,
  Network,
  Pencil,
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
  abandonCheckoutRecovery,
  canSwitchSwipeInPlace,
  checkoutNode,
  filterTreeToRelatedComponent,
  renameNode,
  readLastHistoryCheckoutFailure,
  resumeCheckout,
  retryCheckoutRecovery,
  repairLegacyCheckoutVerification,
  returnToCheckoutSource,
  scanCurrentChat,
  setNodePinned,
  WUXIA_HISTORY_TREE_UPDATED_EVENT,
  type HistoryCheckoutFailureDiagnostic,
  type HistoryCheckoutResult,
  type HistoryTreeViewState,
} from '../utils/saveLoadManager';
import { renameCurrentChat } from '../utils/chatRenameManager';
import { summarizeHistoryNodeBranches } from '../utils/historyBranchStatus';
import ChatRenameDialog from './ChatRenameDialog';
import { HistoryTreeCanvas } from './HistoryTreeCanvas';

interface SaveLoadPanelProps {
  gameState: GameState;
  onClose: () => void;
  isBusy?: boolean;
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


const SaveLoadPanel: React.FC<SaveLoadPanelProps> = ({ gameState, isBusy = false }) => {
  const [view, setView] = useState<HistoryTreeViewState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [confirmingNodeId, setConfirmingNodeId] = useState<string | null>(null);
  const [canSwitchInPlace, setCanSwitchInPlace] = useState(false);
  const [journal, setJournal] = useState<HistoryCheckoutJournal | null>(() => readHistoryCheckoutJournal());
  const [lastFailureDiagnostic, setLastFailureDiagnostic] = useState<HistoryCheckoutFailureDiagnostic | null>(
    () => readLastHistoryCheckoutFailure(),
  );
  const [lastCheckout, setLastCheckout] = useState<HistoryCheckoutResult | null>(null);
  const [diagnosticCopyState, setDiagnosticCopyState] = useState('');
  const [confirmLegacyRepair, setConfirmLegacyRepair] = useState(false);
  const [showAllLineages, setShowAllLineages] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenamingChat, setIsRenamingChat] = useState(false);
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
        if (resume) {
          const pendingJournal = readHistoryCheckoutJournal();
          if (pendingJournal && !pendingJournal.failure && !isHistoryCheckoutJournalExpired(pendingJournal)) {
            recovered = await resumeCheckout();
          }
        }
        const next = await scanCurrentChat(scanOptions);
        setView(next);
        setSelectedNodeId(current => (current && next.tree.nodes[current] ? current : next.currentNodeId));
        setJournal(readHistoryCheckoutJournal());
        setLastFailureDiagnostic(readLastHistoryCheckoutFailure());
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
        setLastFailureDiagnostic(readLastHistoryCheckoutFailure());
        setWorkState({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    },
    [scanOptions],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    let refreshTimer: number | undefined;
    const handleHistoryTreeUpdated = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void refresh(false);
      }, 80);
    };
    window.addEventListener(WUXIA_HISTORY_TREE_UPDATED_EVENT, handleHistoryTreeUpdated);
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.removeEventListener(WUXIA_HISTORY_TREE_UPDATED_EVENT, handleHistoryTreeUpdated);
    };
  }, [refresh]);

  // 谱牒默认只展示与当前聊天连通的脉络；其他历史局的节点仍保留在数据里，可用开关查看
  const displayTree = useMemo(
    () => (view ? (showAllLineages ? view.tree : filterTreeToRelatedComponent(view.tree, view.currentNodeId)) : null),
    [view, showAllLineages],
  );
  const selectedNode = selectedNodeId && displayTree ? (displayTree.nodes[selectedNodeId] ?? null) : null;
  const currentLocator = useMemo(() => getCurrentLocator(view), [view]);
  const branchHealth = view && selectedNode
    ? summarizeHistoryNodeBranches(view.tree, selectedNode.id)
    : null;
  const selectedBranchStatus = branchHealth?.status ?? null;
  const selectedIsCurrent = Boolean(selectedNode && selectedNode.id === view?.currentNodeId);
  // 当前分支已经恢复时，不再用其他旧分支的 broken 状态覆盖当前成功状态。
  const selectedCurrentBranch = view?.tree.branches[view.currentBranchId] ?? null;
  const selectedCurrentBranchActive = Boolean(
    selectedIsCurrent &&
    selectedCurrentBranch?.headNodeId === selectedNode?.id &&
    selectedCurrentBranch?.status === 'active',
  );
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
  const checkoutPending = Boolean(journal && !journal.failure && !isHistoryCheckoutJournalExpired(journal));
  const recoveryAvailable = Boolean(journal && (journal.failure || isHistoryCheckoutJournalExpired(journal)));
  // journal 尚未建立就失败时，也应展示上一次切换的原始异常；这份诊断不承担锁语义。
  const standaloneFailure = !journal ? lastFailureDiagnostic : null;
  const failureVisible = recoveryAvailable || Boolean(standaloneFailure);
  const matchingJournalFailure = journal && lastFailureDiagnostic?.nodeId === journal.targetNodeId
    ? lastFailureDiagnostic
    : null;
  const isWorking = workState.type === 'loading' || Boolean(journal) || isBusy || isRenamingChat;
  const recoveryActionDisabled = workState.type === 'loading' || isRenamingChat;
  const recoveryFailureText = journal?.failure
    ? journal.failure.message
    : journal && isHistoryCheckoutJournalExpired(journal)
      ? '恢复窗口已超过 120 秒，未能继续自动恢复。'
      : '';
  const recoveryDiagnostics = journal
    ? journal.failure?.details ?? [
        `恢复事务：${journal.transactionId}`,
        `当前阶段：${journal.stage}`,
        `目标节点：${journal.targetNodeId}`,
        `来源聊天：${journal.sourceChatName}（${journal.sourceChatId}）`,
        `目标聊天：${journal.targetLocator.chatName}（${journal.targetLocator.chatId}）`,
        `原始异常：${journal.failure?.message ?? '未记录'}`,
      ].join('\n')
    : standaloneFailure?.details ?? '';
  const copyRecoveryDiagnostics = async () => {
    try {
      if (!navigator.clipboard) throw new Error('剪贴板不可用');
      await navigator.clipboard.writeText(recoveryDiagnostics);
      setDiagnosticCopyState('诊断信息已复制');
    } catch {
      setDiagnosticCopyState('复制失败，可手动选中下方诊断文本');
    }
  };

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

  const openChatRenameDialog = () => {
    if (!view?.currentChat.name || isWorking) return;
    setRenameDraft(view.currentChat.name);
    setRenameError(null);
    setIsRenameDialogOpen(true);
  };

  const submitChatRename = async () => {
    if (isRenamingChat) return;
    setIsRenamingChat(true);
    setRenameError(null);
    const result = await renameCurrentChat(renameDraft, { reason: 'manual', reopenHistoryPanel: true });
    if (result.status !== 'committed') {
      setRenameError(result.message);
      setIsRenamingChat(false);
      return;
    }
    setIsRenameDialogOpen(false);
    setIsRenamingChat(false);
    await refresh(false);
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
      setLastFailureDiagnostic(readLastHistoryCheckoutFailure());
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
      setLastFailureDiagnostic(readLastHistoryCheckoutFailure());
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

  const handleLegacyRepair = async () => {
    setWorkState({ type: 'loading', message: '正在核验来源见证并重新执行 ERA 全量恢复……' });
    try {
      const result = await repairLegacyCheckoutVerification();
      setLastCheckout(result);
      setJournal(readHistoryCheckoutJournal());
      await refresh(false);
      setConfirmLegacyRepair(false);
      if (result.status !== 'commit') {
        setWorkState({ type: 'error', message: result.error || '受控修复没有完成。' });
      }
    } catch (error) {
      setJournal(readHistoryCheckoutJournal());
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

  const handleAbandonRecovery = async () => {
    setWorkState({ type: 'loading', message: '正在解除未完成的历史恢复锁……' });
    try {
      const result = abandonCheckoutRecovery();
      setJournal(readHistoryCheckoutJournal());
      await refresh(false);
      setLastCheckout(null);
      setWorkState({
        type: 'success',
        message: result?.error || '已解除历史恢复锁，现在可以重新选择历史节点。',
      });
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
    <div className="save-history" data-wuxia-automation="history-panel">
      <header className="history-masthead">
        <div className="history-title-block">
          <div className="history-seal" aria-hidden="true">
            <Route size={19} />
          </div>
          <div className="history-heading">
            <h3>江湖行迹谱</h3>
            <div className="history-chat-name-row">
              <p>{view?.currentChat.name || '正在辨认当前卷册'} · 每个完整回合自动入谱</p>
              <button
                type="button"
                className="history-title-edit-btn"
                disabled={!view?.currentChat.name || isWorking}
                onClick={openChatRenameDialog}
                aria-label="重命名当前酒馆聊天存档"
                title="重命名当前酒馆聊天存档"
              >
                <Pencil size={13} />
              </button>
            </div>
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
          <span>正在恢复历史节点，发送与重新生成已暂时锁定。</span>
        </div>
      )}
      {failureVisible && (
        <div className="history-journal-banner history-recovery-failure" role="alert">
          <ShieldAlert size={16} aria-hidden="true" />
          <div className="history-recovery-body">
            <strong>{journal ? '历史恢复失败' : '最近一次历史切换失败'}</strong>
            <p>{journal ? (recoveryFailureText || '请重试恢复或返回来源聊天。') : standaloneFailure?.summary}</p>
            {journal ? (
              <>
                <p>新聊天已保留；处理完成前，发送与重新生成仍会锁定。</p>
                <div className="history-recovery-actions">
                  <button type="button" className="history-secondary-action" disabled={recoveryActionDisabled} onClick={() => void handleRetryRecovery()}>
                    <RotateCcw size={14} /> 重试恢复
                  </button>
                  <button type="button" className="history-secondary-action" disabled={recoveryActionDisabled} onClick={() => void handleReturnSource()}>
                    <Undo2 size={14} /> 返回来源聊天
                  </button>
                  {journal.failure?.stage === 'verify' && /主干不一致|历史记录/.test(journal.failure.message) && (
                    <button type="button" className="history-secondary-action" disabled={recoveryActionDisabled}
                      onClick={() => setConfirmLegacyRepair(value => !value)}>
                      <ShieldAlert size={14} /> 旧节点校验基准修复（高级）
                    </button>
                  )}
                </div>
                {confirmLegacyRepair && journal.failure?.stage === 'verify' && (
                  <div className="history-confirm" role="group" aria-label="旧节点校验基准修复确认">
                    <p>仅适用于旧封存缺少逐楼快照的历史节点。必须有本次分叉前自动保存的来源 MK 见证、当前全部消息与 MK 一致，且事件指纹完全相同。原指纹将保留在独立审计中；修复后仍需 ERA 完全同步与严格校验。若缺少来源证据，请先返回来源聊天并重新发起分叉。</p>
                    <div className="history-confirm-actions">
                      <button type="button" className="history-secondary-action" disabled={recoveryActionDisabled}
                        onClick={() => void handleLegacyRepair()}>确认核验并修复</button>
                      <button type="button" className="history-secondary-action" onClick={() => setConfirmLegacyRepair(false)}>取消</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p>失败发生在恢复事务建立之前，未产生待处理的历史恢复锁。可查看错误后重新选择节点。</p>
            )}
            <details className="history-recovery-diagnostics">
              <summary>查看详细错误</summary>
              <dl>
                <dt>失败步骤</dt><dd>{matchingJournalFailure?.step ?? standaloneFailure?.step ?? journal?.failure?.stage ?? journal?.stage ?? '未知'}</dd>
                <dt>事务阶段</dt><dd>{journal?.failure?.stage ?? journal?.stage ?? '尚未创建 journal'}</dd>
                <dt>底层异常</dt><dd>{matchingJournalFailure?.originalError ?? standaloneFailure?.originalError ?? journal?.failure?.message ?? '未记录'}</dd>
                {journal && <>
                <dt>事务 ID</dt><dd>{journal?.transactionId}</dd>
                <dt>失败阶段</dt><dd>{journal?.failure?.stage ?? journal?.stage}</dd>
                <dt>恢复动作</dt><dd>{journal?.actionKind ?? '未知'}</dd>
                <dt>目标节点</dt><dd>{journal?.targetNodeId}</dd>
                <dt>来源聊天</dt><dd>{journal?.sourceChatName}（{journal?.sourceChatId}）</dd>
                <dt>目标聊天</dt><dd>{journal?.targetLocator.chatName}（{journal?.targetLocator.chatId}）</dd>
                <dt>目标楼层</dt>
                <dd>User {journal?.targetLocator.userMessageId ?? '无'} / Assistant {journal?.targetLocator.assistantMessageId} / swipe {journal?.targetLocator.swipeId}</dd>
                </>}
                <dt>失败时间</dt><dd>{formatDate(journal?.failure?.occurredAt ?? standaloneFailure?.occurredAt ?? matchingJournalFailure?.occurredAt ?? Date.now())}</dd>
              </dl>
              <pre tabIndex={0}>{recoveryDiagnostics}</pre>
              <button type="button" className="history-secondary-action" onClick={() => void copyRecoveryDiagnostics()}>
                <Copy size={14} /> 复制诊断信息
              </button>
              {diagnosticCopyState && <span className="history-copy-feedback">{diagnosticCopyState}</span>}
              {journal && <button type="button" className="history-secondary-action" disabled={recoveryActionDisabled} onClick={() => void handleAbandonRecovery()} title="保留分支但解除恢复锁，不代表当前变量已通过历史校验">
                <X size={14} /> 放弃此次恢复（高级操作）
              </button>}
            </details>

          </div>
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
                  {selectedCurrentBranchActive && (
                    <span className="history-flag">当前分支正常</span>
                  )}
                  {selectedBranchStatus === 'recovery_failed' && <span className="history-flag danger">恢复失败</span>}
                  {(branchHealth?.brokenBranchCount ?? 0) > 0 && (
                    <span
                      className={`history-flag ${!selectedCurrentBranchActive && !branchHealth?.usableBranchCount ? 'warn' : ''}`.trim()}
                      title="旧分支状态是各自聊天的历史记录，不代表当前分支失败，也不代表其他聊天定位全部不可用"
                    >
                      {selectedCurrentBranchActive
                        ? `另有 ${branchHealth?.brokenBranchCount} 条旧分支标记不可用`
                        : branchHealth?.usableBranchCount
                          ? `${branchHealth?.brokenBranchCount} 条旧分支标记不可用 · 仍有可用分支`
                          : `${branchHealth?.brokenBranchCount} 条旧分支标记不可用 · 可尝试其他定位`}
                    </span>
                  )}
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
                      data-wuxia-automation="confirm-history-checkout"
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
                  data-wuxia-automation="continue-history-node"
                  data-wuxia-history-action={primaryLabel}
                  disabled={selectedIsCurrent || isWorking}
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

            </div>
          )}
        </aside>
      </div>

      {!(failureVisible && workState.type === 'error') && (
        <div
          className={`history-status-line ${workState.type}`}
          data-wuxia-automation="history-status"
          data-wuxia-history-status={workState.type}
        >
          {workState.type === 'loading' && <Loader2 className="spin" size={13} />}
          {workState.type === 'error' && <ShieldAlert size={13} />}
          <span>{workState.message}</span>
        </div>
      )}
      <ChatRenameDialog
        isOpen={isRenameDialogOpen}
        mode="manual"
        value={renameDraft}
        error={renameError}
        isSubmitting={isRenamingChat}
        onChange={value => {
          setRenameDraft(value);
          if (renameError) setRenameError(null);
        }}
        onConfirm={() => void submitChatRename()}
        onClose={() => {
          if (isRenamingChat) return;
          setIsRenameDialogOpen(false);
          setRenameError(null);
        }}
      />
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
