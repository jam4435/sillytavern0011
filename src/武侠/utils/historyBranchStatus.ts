import type { HistoryBranch, WuxiaHistoryTreeV2 } from '../types';

/**
 * 分支状态属于某个聊天存档，不属于共享历史节点；一个节点允许同时有
 * broken 的旧分支和可用于恢复的其他聊天 locator。
 */
export function summarizeHistoryNodeBranches(tree: WuxiaHistoryTreeV2, nodeId: string): {
  status: HistoryBranch['status'] | null;
  brokenBranchCount: number;
  usableBranchCount: number;
} {
  const branches = Object.values(tree.branches).filter(branch => branch.headNodeId === nodeId);
  const brokenBranchCount = branches.filter(branch => branch.status === 'broken').length;
  const healthy = (['active', 'degraded', 'available', 'recovery_failed'] as const)
    .map(status => branches.find(branch => branch.status === status))
    .find((branch): branch is HistoryBranch => Boolean(branch));
  return {
    status: healthy?.status ?? (brokenBranchCount ? 'broken' : null),
    brokenBranchCount,
    usableBranchCount: branches.length - brokenBranchCount,
  };
}
