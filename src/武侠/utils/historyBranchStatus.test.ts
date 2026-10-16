import { describe, expect, it } from 'vitest';
import type { WuxiaHistoryTreeV2 } from '../types';
import { summarizeHistoryNodeBranches } from './historyBranchStatus';

const createTree = (statuses: Array<'broken' | 'active' | 'available' | 'recovery_failed'>): WuxiaHistoryTreeV2 => ({
  version: 2,
  updatedAt: 1,
  nodes: {},
  branches: Object.fromEntries(statuses.map((status, i) => [
    'branch-' + i,
    {
      id: 'branch-' + i,
      chatId: 'chat-' + i,
      chatName: '聊天 ' + i,
      originNodeId: null,
      headNodeId: 'shared-node',
      createdAt: i,
      status,
    },
  ])),
});

describe('共享历史节点的分支可用性', () => {
  it('一个断链分支不能盖过其他仍然可用的分支', () => {
    expect(summarizeHistoryNodeBranches(createTree(['broken', 'available', 'active']), 'shared-node'))
      .toEqual({ status: 'active', brokenBranchCount: 1, usableBranchCount: 2 });
  });

  it('全部分支标记 broken 也只代表分支状态，不证明其它 locator 不可用', () => {
    expect(summarizeHistoryNodeBranches(createTree(['broken', 'broken']), 'shared-node'))
      .toEqual({ status: 'broken', brokenBranchCount: 2, usableBranchCount: 0 });
  });

  it('无对应分支头时不制造路径断链', () => {
    expect(summarizeHistoryNodeBranches(createTree(['broken']), 'other-node'))
      .toEqual({ status: null, brokenBranchCount: 0, usableBranchCount: 0 });
  });
});
