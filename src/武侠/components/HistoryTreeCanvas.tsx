import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Pin } from 'lucide-react';
import React, { memo, useCallback, useMemo } from 'react';
import type { HistoryBranch, HistoryLocator, HistoryNode, WuxiaHistoryTreeV2 } from '../types';
import { layoutHistoryTree } from '../utils/historyTreeLayout';

const BRANCH_COLORS = ['#d8aa57', '#789f91', '#a986bd', '#b87664', '#758cae', '#9c9a63', '#b680a0'];

interface HistoryNodeData extends Record<string, unknown> {
  node: HistoryNode;
  depth: number;
  isCurrent: boolean;
  isCurrentPath: boolean;
  isInactiveSwipe: boolean;
  branchStatus: HistoryBranch['status'] | null;
  branchColor: string;
}

type HistoryFlowNode = Node<HistoryNodeData, 'history'>;

export interface HistoryTreeCanvasProps {
  tree: WuxiaHistoryTreeV2;
  currentNodeId: string | null;
  currentBranchId: string | null;
  currentLocator: HistoryLocator | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

function stableColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return BRANCH_COLORS[hash % BRANCH_COLORS.length];
}

function ancestorSet(tree: WuxiaHistoryTreeV2, headNodeId: string | null): Set<string> {
  const result = new Set<string>();
  let cursor = headNodeId;
  while (cursor && !result.has(cursor)) {
    result.add(cursor);
    cursor = tree.nodes[cursor]?.parentId ?? null;
  }
  return result;
}

function HistoryFlowNodeView({ data, selected }: NodeProps<HistoryFlowNode>) {
  const { node, depth, isCurrent, isCurrentPath, isInactiveSwipe, branchStatus, branchColor } = data;
  const title = node.label?.trim() || node.location || `第 ${depth + 1} 回`;
  const statusClass = branchStatus === 'recovery_failed' ? 'failed' : branchStatus === 'broken' ? 'broken' : '';

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <div
        className={[
          'history-node',
          selected ? 'selected' : '',
          isCurrent ? 'current' : '',
          isCurrentPath ? 'path' : '',
          isInactiveSwipe ? 'inactive-swipe' : '',
          node.verification ? '' : 'unverified',
          statusClass,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ '--branch-color': branchColor } as React.CSSProperties}
        data-wuxia-automation="history-node"
        data-wuxia-history-node-id={node.id}
        data-wuxia-history-depth={depth}
        data-wuxia-history-current={isCurrent ? 'true' : 'false'}
        data-wuxia-history-selected={selected ? 'true' : 'false'}
      >
        <div className="history-node-kicker">
          第 {depth + 1} 回{isInactiveSwipe ? ' · 异文' : ''}
        </div>
        <div className="history-node-title">{title}</div>
        <div className="history-node-preview">{node.preview || '此处墨迹尚浅，未留剧情摘录。'}</div>
        {node.pinned && (
          <div className="history-node-badges" aria-label="已钉住">
            <Pin size={12} fill="currentColor" />
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
    </>
  );
}

const MemoHistoryFlowNodeView = memo(HistoryFlowNodeView);
const NODE_TYPES = { history: MemoHistoryFlowNodeView };

export const HistoryTreeCanvas: React.FC<HistoryTreeCanvasProps> = ({
  tree,
  currentNodeId,
  currentBranchId,
  currentLocator,
  selectedNodeId,
  onSelectNode,
}) => {
  const layout = useMemo(() => layoutHistoryTree(tree.nodes), [tree.nodes]);
  const currentPath = useMemo(() => ancestorSet(tree, currentNodeId), [currentNodeId, tree]);
  const currentPathMessageIds = useMemo(() => {
    if (!currentLocator) return new Set<string>();
    return new Set(
      [...currentPath].flatMap(nodeId =>
        (tree.nodes[nodeId]?.locators ?? [])
          .filter(locator => locator.chatId === currentLocator.chatId)
          .map(locator => `${locator.chatId}:${locator.assistantMessageId}`),
      ),
    );
  }, [currentLocator, currentPath, tree.nodes]);
  const branchPaths = useMemo(() => {
    return Object.fromEntries(
      Object.values(tree.branches).map(branch => [branch.id, ancestorSet(tree, branch.headNodeId)]),
    );
  }, [tree]);

  const branchForNode = useMemo(() => {
    const mapping = new Map<string, HistoryBranch>();
    const branches = Object.values(tree.branches).sort((left, right) => {
      if (left.id === currentBranchId) return -1;
      if (right.id === currentBranchId) return 1;
      return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
    });
    for (const branch of branches) {
      for (const nodeId of branchPaths[branch.id] ?? []) {
        if (!mapping.has(nodeId)) mapping.set(nodeId, branch);
      }
    }
    return mapping;
  }, [branchPaths, currentBranchId, tree.branches]);

  const flowNodes = useMemo<HistoryFlowNode[]>(() => {
    return Object.values(tree.nodes).map(node => {
      const branch = branchForNode.get(node.id);
      const locator = currentLocator
        ? node.locators.find(candidate => candidate.chatId === currentLocator.chatId)
        : null;
      return {
        id: node.id,
        type: 'history',
        position: layout.positions[node.id] ?? { x: 0, y: 0 },
        selected: selectedNodeId === node.id,
        draggable: false,
        selectable: true,
        data: {
          node,
          depth: layout.positions[node.id]?.depth ?? 0,
          isCurrent: currentNodeId === node.id,
          isCurrentPath: currentPath.has(node.id),
          isInactiveSwipe: Boolean(
            locator &&
            !currentPath.has(node.id) &&
            currentPathMessageIds.has(`${locator.chatId}:${locator.assistantMessageId}`),
          ),
          branchStatus: branch?.headNodeId === node.id ? branch.status : null,
          branchColor: branch ? stableColor(branch.id) : '#8d7957',
        },
      };
    });
  }, [
    branchForNode,
    currentLocator,
    currentNodeId,
    currentPath,
    currentPathMessageIds,
    layout.positions,
    selectedNodeId,
    tree.nodes,
  ]);

  const flowEdges = useMemo<Edge[]>(() => {
    return layout.edges.map(({ source, target }) => ({
      id: `${source}->${target}`,
      source,
      target,
      type: 'smoothstep',
      className: currentPath.has(source) && currentPath.has(target) ? 'current-path' : undefined,
      style: {
        stroke:
          currentPath.has(source) && currentPath.has(target)
            ? 'rgba(239, 197, 113, 0.9)'
            : branchForNode.get(target)
              ? stableColor(branchForNode.get(target)!.id)
              : undefined,
      },
    }));
  }, [branchForNode, currentPath, layout.edges]);

  const handleInit = useCallback(
    (instance: ReactFlowInstance<HistoryFlowNode, Edge>) => {
      window.setTimeout(() => {
        if (currentNodeId && tree.nodes[currentNodeId]) {
          void instance.fitView({
            nodes: [{ id: currentNodeId }],
            duration: 320,
            minZoom: 0.72,
            maxZoom: 1.05,
            padding: 1.8,
          });
        } else {
          void instance.fitView({ duration: 320, padding: 0.24 });
        }
      }, 0);
    },
    [currentNodeId, tree.nodes],
  );

  return (
    <ReactFlow<HistoryFlowNode, Edge>
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={NODE_TYPES}
      onInit={handleInit}
      onNodeClick={(_, flowNode) => onSelectNode(flowNode.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      zoomOnScroll
      fitView
      onlyRenderVisibleElements
      minZoom={0.24}
      maxZoom={1.7}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="rgba(176, 135, 73, 0.11)" gap={26} size={1} variant={BackgroundVariant.Dots} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={flowNode => (flowNode.data?.branchColor as string | undefined) ?? '#8d7957'}
        nodeStrokeColor="rgba(255, 232, 184, .35)"
        maskColor="rgba(5, 5, 4, .6)"
      />
    </ReactFlow>
  );
};

export default HistoryTreeCanvas;
