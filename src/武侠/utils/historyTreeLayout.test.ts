import { describe, expect, it } from 'vitest';
import type { HistoryNode } from '../types';
import { layoutHistoryTree } from './historyTreeLayout';

function node(id: string, parentId: string | null, createdAt: number): HistoryNode {
  return {
    id,
    parentId,
    locators: [],
    messageKey: null,
    label: null,
    pinned: false,
    preview: '',
    location: '',
    worldTimeText: '',
    createdAt,
    verification: null,
  };
}

describe('layoutHistoryTree', () => {
  it('按深度排列，父节点落在子树中心', () => {
    const layout = layoutHistoryTree({
      root: node('root', null, 1),
      left: node('left', 'root', 2),
      right: node('right', 'root', 3),
      leaf: node('leaf', 'left', 4),
    });

    expect(layout.positions.root.depth).toBe(0);
    expect(layout.positions.left.depth).toBe(1);
    expect(layout.positions.leaf.depth).toBe(2);
    expect(layout.positions.root.x).toBe(
      (Math.min(layout.positions.left.x, layout.positions.right.x) +
        Math.max(layout.positions.left.x, layout.positions.right.x)) /
        2,
    );
    expect(layout.edges).toEqual([
      { source: 'root', target: 'left' },
      { source: 'root', target: 'right' },
      { source: 'left', target: 'leaf' },
    ]);
  });

  it('相同输入始终得到相同布局，并把断链节点当作根', () => {
    const nodes = {
      later: node('later', 'missing', 9),
      root: node('root', null, 1),
      child: node('child', 'root', 2),
    };

    expect(layoutHistoryTree(nodes)).toEqual(layoutHistoryTree(nodes));
    expect(layoutHistoryTree(nodes).positions.later.depth).toBe(0);
  });
});
