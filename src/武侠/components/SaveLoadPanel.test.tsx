import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../types';
import SaveLoadPanel from './SaveLoadPanel';

const mocks = vi.hoisted(() => ({
  readJournal: vi.fn(),
  readFailure: vi.fn(),
  scan: vi.fn(),
}));

vi.mock('../../shared/historyCheckoutJournal', () => ({
  readHistoryCheckoutJournal: mocks.readJournal,
  isHistoryCheckoutJournalExpired: vi.fn(() => false),
}));

vi.mock('../utils/saveLoadManager', () => ({
  WUXIA_HISTORY_TREE_UPDATED_EVENT: 'wuxia:history-tree-updated',
  readLastHistoryCheckoutFailure: mocks.readFailure,
  scanCurrentChat: mocks.scan,
  filterTreeToRelatedComponent: vi.fn(tree => tree),
  checkoutNode: vi.fn(),
  canSwitchSwipeInPlace: vi.fn(async () => false),
  renameNode: vi.fn(),
  setNodePinned: vi.fn(),
  resumeCheckout: vi.fn(),
  retryCheckoutRecovery: vi.fn(),
  repairLegacyCheckoutVerification: vi.fn(),
  returnToCheckoutSource: vi.fn(),
  abandonCheckoutRecovery: vi.fn(),
}));

vi.mock('./HistoryTreeCanvas', () => ({ HistoryTreeCanvas: () => null }));
vi.mock('./ChatRenameDialog', () => ({ default: () => null }));
vi.mock('../utils/chatRenameManager', () => ({ renameCurrentChat: vi.fn() }));

const gameState = {
  currentLocation: '',
  stats: { location: '' },
} as GameState;

beforeEach(() => {
  mocks.readJournal.mockReturnValue(null);
  mocks.readFailure.mockReturnValue(null);
  mocks.scan.mockResolvedValue({
    tree: { version: 2, updatedAt: 1, nodes: {}, branches: {} },
    currentChat: { id: 'chat-a', name: '聊天 A' },
    currentNodeId: null,
    currentBranchId: 'branch-a',
  });
});

describe('SaveLoadPanel checkout error display', () => {
  it('journal 创建前失败仍展示可展开、可复制的底层错误，不伪造恢复锁', async () => {
    mocks.readFailure.mockReturnValue({
      occurredAt: 1_760_000_000_000,
      nodeId: 'node-1',
      actionKind: 'fork_branch',
      step: '识别当前来源聊天',
      journalStage: null,
      summary: '历史恢复未完成，请重试或返回原聊天。',
      originalError: '测试：无法识别当前聊天',
      details: '失败步骤：识别当前来源聊天\n底层异常：测试：无法识别当前聊天',
    });

    render(<SaveLoadPanel gameState={gameState} onClose={vi.fn()} />);

    expect(await screen.findByText('最近一次历史切换失败')).toBeInTheDocument();
    expect(screen.getByText('历史恢复未完成，请重试或返回原聊天。')).toBeInTheDocument();
    expect(screen.getByText('查看详细错误')).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看详细错误'));
    expect(screen.getByText('测试：无法识别当前聊天')).toBeInTheDocument();
    expect(screen.getByText(/失败步骤：识别当前来源聊天/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试恢复' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '返回来源聊天' })).not.toBeInTheDocument();
  });

  it('只有 MK 恢复失败才展示旧节点显式修复确认，拒绝静默覆盖', async () => {
    mocks.readJournal.mockReturnValue({
      transactionId: 'txn-repair',
      stage: 'verify',
      targetNodeId: 'node-1',
      targetLocator: { chatId: 'fork-1', chatName: '新分支', userMessageId: 1, assistantMessageId: 2, swipeId: 0 },
      actionKind: 'fork_branch',
      sourceChatId: 'chat-a', sourceChatName: '聊天 A',
      failure: { stage: 'verify', message: '历史记录不匹配。', occurredAt: 1, details: '主干不一致' },
    });
    render(<SaveLoadPanel gameState={gameState} onClose={vi.fn()} />);
    const advanced = await screen.findByRole('button', { name: /旧节点校验基准修复/ });
    fireEvent.click(advanced);
    expect(screen.getByRole('button', { name: '确认核验并修复' })).toBeInTheDocument();
    expect(screen.getByText(/原指纹将保留在独立审计中/)).toBeInTheDocument();
  });

  it('已有 journal 失败仍提供重试和返回来源，技术诊断保留原始异常', async () => {
    mocks.readJournal.mockReturnValue({
      transactionId: 'txn-1',
      stage: 'verify',
      targetNodeId: 'node-1',
      targetLocator: { chatId: 'chat-a', chatName: '聊天 A', userMessageId: 1, assistantMessageId: 2, swipeId: 0 },
      actionKind: 'fork_branch',
      sourceChatId: 'chat-a',
      sourceChatName: '聊天 A',
      failure: {
        stage: 'verify',
        message: '事件状态不匹配。',
        occurredAt: 1_760_000_000_000,
        details: '底层异常与堆栈：\nHistoryVerificationError: 事件状态指纹不一致',
      },
    });

    render(<SaveLoadPanel gameState={gameState} onClose={vi.fn()} />);

    expect(await screen.findByText('历史恢复失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试恢复' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回来源聊天' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看详细错误'));
    expect(screen.getByText(/HistoryVerificationError: 事件状态指纹不一致/)).toBeInTheDocument();
  });
});
