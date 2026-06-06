import { GitBranch, Loader2, MapPin, Save, ScrollText, UploadCloud } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameState, WuxiaSaveNode } from '../types';
import {
  createBranchFromNode,
  createCurrentCheckpoint,
  getSuggestedSaveLabel,
  openCheckpoint,
  readSaveTreeState,
  type SaveTreeViewState,
} from '../utils/saveLoadManager';

interface SaveLoadPanelProps {
  gameState: GameState;
  onClose: () => void;
}

type WorkState =
  | { type: 'idle'; message: string }
  | { type: 'loading'; message: string }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string };

type ConfirmAction = {
  type: 'load' | 'branch';
  nodeId: string;
} | null;

const SaveLoadPanel: React.FC<SaveLoadPanelProps> = ({ gameState, onClose }) => {
  const [treeState, setTreeState] = useState<SaveTreeViewState | null>(null);
  const [label, setLabel] = useState('');
  const [workState, setWorkState] = useState<WorkState>({ type: 'idle', message: '读取存档树中...' });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const suggestedLabel = useMemo(() => getSuggestedSaveLabel(gameState), [gameState]);

  const refreshTree = useCallback(async () => {
    setWorkState({ type: 'loading', message: '正在读取存档谱系...' });
    try {
      const nextState = await readSaveTreeState(gameState);
      setTreeState(nextState);
      setLabel(current => current || suggestedLabel);
      setWorkState({ type: 'idle', message: '存档谱系已就绪' });
    } catch (error) {
      setWorkState({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [gameState, suggestedLabel]);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  const handleSave = async () => {
    setConfirmAction(null);
    setWorkState({ type: 'loading', message: '正在创建 checkpoint...' });
    try {
      const node = await createCurrentCheckpoint(label || suggestedLabel, gameState);
      setLabel(getSuggestedSaveLabel(gameState));
      const nextState = await readSaveTreeState(gameState);
      setTreeState(nextState);
      setWorkState({ type: 'success', message: `已保存「${node.label}」` });
    } catch (error) {
      setWorkState({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleLoad = async (node: WuxiaSaveNode) => {
    if (confirmAction?.type !== 'load' || confirmAction.nodeId !== node.id) {
      setConfirmAction({ type: 'load', nodeId: node.id });
      setWorkState({ type: 'idle', message: `再次点击以读取「${node.label}」` });
      return;
    }

    setWorkState({ type: 'loading', message: `正在读取「${node.label}」...` });
    try {
      await openCheckpoint(node);
      onClose();
    } catch (error) {
      setWorkState({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleBranch = async (node: WuxiaSaveNode) => {
    if (treeState?.currentNodeId !== node.id) {
      setWorkState({ type: 'error', message: '请先读取该节点，再从它另开分叉。' });
      return;
    }

    if (confirmAction?.type !== 'branch' || confirmAction.nodeId !== node.id) {
      setConfirmAction({ type: 'branch', nodeId: node.id });
      setWorkState({ type: 'idle', message: `再次点击以从「${node.label}」另开分叉` });
      return;
    }

    setWorkState({ type: 'loading', message: '正在另开聊天分叉...' });
    try {
      await createBranchFromNode(node);
      onClose();
    } catch (error) {
      setWorkState({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const tree = treeState?.tree;
  const nodes = useMemo(() => {
    return [...(tree?.nodes ?? [])].sort((a, b) => a.createdAt - b.createdAt);
  }, [tree?.nodes]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, WuxiaSaveNode[]>();
    for (const node of nodes) {
      const key = node.parentId || null;
      const siblings = map.get(key) || [];
      siblings.push(node);
      map.set(key, siblings);
    }
    return map;
  }, [nodes]);

  const renderNode = (node: WuxiaSaveNode, depth = 0): React.ReactNode => {
    const children = childrenByParent.get(node.id) || [];
    const isCurrent = treeState?.currentNodeId === node.id;
    const loadConfirming = confirmAction?.type === 'load' && confirmAction.nodeId === node.id;
    const branchConfirming = confirmAction?.type === 'branch' && confirmAction.nodeId === node.id;
    const branchDisabled = !isCurrent;

    return (
      <div key={node.id} className="save-tree-node-wrap" style={{ '--tree-depth': depth } as React.CSSProperties}>
        <div className={`save-tree-node ${isCurrent ? 'current' : ''}`}>
          <div className="save-node-rail" aria-hidden="true"></div>
          <div className="save-node-main">
            <div className="save-node-head">
              <div>
                <div className="save-node-title">{node.label}</div>
                <div className="save-node-meta">
                  <span>{formatDate(node.createdAt)}</span>
                  {node.worldTimeText && <span>{node.worldTimeText}</span>}
                </div>
              </div>
              {isCurrent && <span className="save-node-current">当前</span>}
            </div>

            <div className="save-node-place">
              <MapPin size={13} />
              <span>{node.location || '未知地点'}</span>
            </div>

            <p className="save-node-preview">{node.preview || '暂无剧情摘录。'}</p>

            <div className="save-node-actions">
              <button type="button" className="save-action-btn primary" onClick={() => void handleLoad(node)}>
                <UploadCloud size={14} />
                <span>{loadConfirming ? '确认读取' : '读取'}</span>
              </button>
              <button
                type="button"
                className="save-action-btn"
                onClick={() => void handleBranch(node)}
                disabled={branchDisabled}
                title={branchDisabled ? '请先读取该节点，再从它另开分叉' : '另开聊天分叉'}
              >
                <GitBranch size={14} />
                <span>{branchConfirming ? '确认分叉' : '另开分叉'}</span>
              </button>
            </div>
          </div>
        </div>
        {children.length > 0 && (
          <div className="save-tree-children">
            {children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="save-load-panel">
      <section className="save-ledger">
        <div className="save-section-title">
          <Save size={18} />
          <span>保存当前进度</span>
        </div>

        <div className="save-current-summary">
          <div className="summary-line strong">{gameState.stats.name || '少侠'}</div>
          <div className="summary-line">{gameState.currentLocation || gameState.stats.location || '江湖途中'}</div>
          <div className="summary-line muted">{gameState.gameTime || '未知时辰'}</div>
        </div>

        <label className="save-label-field">
          <span>存档标题</span>
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            placeholder={suggestedLabel}
            maxLength={40}
          />
        </label>

        <div className="save-preview-box">
          <div className="save-preview-title">
            <ScrollText size={14} />
            <span>最近可保存楼层</span>
          </div>
          <p>{treeState?.latestSaveTarget?.preview || '尚未找到可保存的剧情回复。'}</p>
        </div>

        <button
          type="button"
          className="save-primary-btn"
          onClick={() => void handleSave()}
          disabled={workState.type === 'loading' || !treeState?.latestSaveTarget}
        >
          {workState.type === 'loading' ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
          <span>保存当前进度</span>
        </button>

        <button type="button" className="save-secondary-btn" onClick={() => void refreshTree()}>
          刷新谱系
        </button>

        <div className={`save-work-state ${workState.type}`}>
          {workState.type === 'loading' && <Loader2 className="spin" size={14} />}
          <span>{workState.message}</span>
        </div>
      </section>

      <section className="save-tree-panel">
        <div className="save-tree-header">
          <div>
            <div className="save-section-title">
              <GitBranch size={18} />
              <span>分叉谱系</span>
            </div>
            <div className="save-tree-subtitle">
              当前聊天：{treeState?.currentChatName || '未知'}
            </div>
          </div>
          <span className="save-tree-count">{nodes.length} 节点</span>
        </div>

        <div className="save-tree-scroll">
          {nodes.length === 0 ? (
            <div className="save-empty-state">
              <ScrollText size={32} />
              <p>尚无存档节点。保存当前进度后，会在这里生成分叉谱系。</p>
            </div>
          ) : (
            (childrenByParent.get(null) || []).map(node => renderNode(node))
          )}
        </div>
      </section>
    </div>
  );
};

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return '未知时间';
  }

  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export default SaveLoadPanel;
