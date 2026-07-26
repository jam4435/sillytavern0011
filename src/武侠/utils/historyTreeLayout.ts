import type { HistoryNode } from '../types';

export interface HistoryTreePosition {
  x: number;
  y: number;
  depth: number;
}

export interface HistoryTreeLayout {
  positions: Record<string, HistoryTreePosition>;
  edges: Array<{ source: string; target: string }>;
}

const DEFAULT_HORIZONTAL_GAP = 248;
const DEFAULT_VERTICAL_GAP = 154;

function compareNodes(left: HistoryNode, right: HistoryNode): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

/**
 * 确定性自顶向下布局：
 * - 叶节点按创建时间占据横向轨道；
 * - 父节点位于直属子树的中心；
 * - 损坏的 parentId 与意外环路会退化为独立根，不阻塞整张图。
 */
export function layoutHistoryTree(
  nodesById: Record<string, HistoryNode>,
  options: { horizontalGap?: number; verticalGap?: number } = {},
): HistoryTreeLayout {
  const horizontalGap = options.horizontalGap ?? DEFAULT_HORIZONTAL_GAP;
  const verticalGap = options.verticalGap ?? DEFAULT_VERTICAL_GAP;
  const allNodes = Object.values(nodesById).sort(compareNodes);
  const childrenByParent = new Map<string | null, HistoryNode[]>();
  const edges: HistoryTreeLayout['edges'] = [];

  for (const node of allNodes) {
    const validParentId = node.parentId && nodesById[node.parentId] ? node.parentId : null;
    const siblings = childrenByParent.get(validParentId) ?? [];
    siblings.push(node);
    childrenByParent.set(validParentId, siblings);
    if (validParentId) {
      edges.push({ source: validParentId, target: node.id });
    }
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(compareNodes);
  }

  const positions: Record<string, HistoryTreePosition> = {};
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let nextLeafTrack = 0;

  const visit = (node: HistoryNode, depth: number): number => {
    if (visited.has(node.id)) {
      return positions[node.id]?.x ?? nextLeafTrack * horizontalGap;
    }
    if (visiting.has(node.id)) {
      const cycleX = nextLeafTrack++ * horizontalGap;
      positions[node.id] = { x: cycleX, y: depth * verticalGap, depth };
      visited.add(node.id);
      return cycleX;
    }

    visiting.add(node.id);
    const children = (childrenByParent.get(node.id) ?? []).filter(child => !visiting.has(child.id));
    let x: number;
    if (children.length === 0) {
      x = nextLeafTrack++ * horizontalGap;
    } else {
      const childXs = children.map(child => visit(child, depth + 1));
      x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    positions[node.id] = { x, y: depth * verticalGap, depth };
    visiting.delete(node.id);
    visited.add(node.id);
    return x;
  };

  for (const root of childrenByParent.get(null) ?? []) {
    visit(root, 0);
    nextLeafTrack += 0.35;
  }

  // Defensive fallback for malformed cycles whose every node still points at another existing node.
  for (const node of allNodes) {
    if (!visited.has(node.id)) {
      visit(node, 0);
      nextLeafTrack += 0.35;
    }
  }

  return { positions, edges };
}
