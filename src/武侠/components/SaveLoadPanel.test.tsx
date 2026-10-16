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
  continueCheckoutWithEventDrift: vi.fn(),
  returnToCheckoutSource: vi.fn(),
  abandonCheckoutRecovery: vi.fn(),
}));

vi.mock('./HistoryTreeCanvas', () => ({
  HistoryTreeCanvas: ({ onSelectNode }: { onSelectNode: (nodeId: string) => void }) => (
    <button type="button" onClick={() => onSelectNode('selected-node')}>选择测试历史节点</button>
  ),
}));
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


  it('旧分支 broken 但节点有三条 locator 时仍允许从此处继续', async () => {
    const node = {
      id: 'selected-node', parentId: null, messageKey: 'mk-selected',
      label: null, pinned: false, preview: '官道马车剧情', location: '大理/云南/官道/马车内',
      worldTimeText: '壬戌年 三月 十八', createdAt: 1,
      verification: { selectedMksHash: 'a', eventStateHash: 'b' },
      locators: [
        { chatId: 'missing', chatName: '已删除分支', userMessageId: 3, assistantMessageId: 4, swipeId: 0 },
        { chatId: 'source', chatName: '原始聊天', userMessageId: 3, assistantMessageId: 4, swipeId: 0 },
        { chatId: 'another', chatName: '现存分支', userMessageId: 3, assistantMessageId: 4, swipeId: 0 },
      ],
    };
    mocks.scan.mockResolvedValue({
      tree: {
        version: 2, updatedAt: 1, nodes: { 'selected-node': node },
        branches: {
          dead: {
            id: 'dead', chatId: 'missing', chatName: '已删除分支',
            originNodeId: null, headNodeId: 'selected-node', createdAt: 1, status: 'broken',
          },
          live: {
            id: 'live', chatId: 'another', chatName: '现存分支',
            originNodeId: null, headNodeId: 'selected-node', createdAt: 2, status: 'available',
          },
        },
      },
      currentChat: { id: 'chat-a', name: '聊天 A' },
      currentNodeId: null,
      currentBranchId: 'history_branch_current',
    });
    render(<SaveLoadPanel gameState={gameState} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '选择测试历史节点' }));
    expect(screen.getByText('3 个实际聊天定位')).toBeInTheDocument();
    expect(screen.getByText('1 条旧分支标记不可用 · 仍有可用分支')).toBeInTheDocument();
    expect(screen.queryByText('路径断链')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换到该分支' })).not.toBeDisabled();
  });

  it('第109楼修复成功后显示当前分支正常，旧 broken 分支只保留历史提示', async () => {
    const targetId = 'selected-node';
    const activeChatId = '金庸群侠传 - 2026-10-11@00h11m45s · 第52段';
    const node = {
      id: targetId, parentId: null, messageKey: 'mk-109',
      label: null, pinned: false, preview: '第109楼',
      location: '大理/云南/官道/马车内', worldTimeText: '壬戌年 三月 十八',
      createdAt: 1,
      verification: { selectedMksHash: '86621d6c8b79a618', eventStateHash: '715034ccda2a6586' },
      locators: [
        { chatId: 'broken-old-1', chatName: 'Branch #109 A', userMessageId: 108, assistantMessageId: 109, swipeId: 0 },
        { chatId: 'broken-old-2', chatName: 'Branch #109 B', userMessageId: 108, assistantMessageId: 109, swipeId: 0 },
        { chatId: activeChatId, chatName: activeChatId, userMessageId: 108, assistantMessageId: 109, swipeId: 0 },
      ],
    };
    mocks.scan.mockResolvedValue({
      tree: {
        version: 2, updatedAt: 1,
        nodes: { [targetId]: node },
        branches: {
          old1: {
            id: 'old1', chatId: 'broken-old-1', chatName: 'Branch #109 A',
            originNodeId: targetId, headNodeId: targetId, createdAt: 1, status: 'broken',
          },
          old2: {
            id: 'old2', chatId: 'broken-old-2', chatName: 'Branch #109 B',
            originNodeId: targetId, headNodeId: targetId, createdAt: 2, status: 'broken',
          },
          repaired: {
            id: 'repaired', chatId: activeChatId, chatName: activeChatId,
            originNodeId: targetId, headNodeId: targetId, createdAt: 3, status: 'active',
          },
        },
      },
      currentChat: { id: activeChatId, name: activeChatId },
      currentNodeId: targetId,
      currentBranchId: 'repaired',
    });
    render(<SaveLoadPanel gameState={gameState} onClose={vi.fn()} />);
    expect(await screen.findByText('当前分支正常')).toBeInTheDocument();
    expect(screen.getByText('另有 2 条旧分支标记不可用')).toBeInTheDocument();
    expect(screen.queryByText('部分分支失效')).not.toBeInTheDocument();
    expect(screen.queryByText('恢复失败')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '当前进度' })).toBeDisabled();
  });

  it('即使唯一历史分支 broken，仍能尝试由后端逐个核验 locator', async () => {
    const node = {
      id: 'selected-node', parentId: null, messageKey: 'mk-selected',
      label: null, pinned: false, preview: '官道马车剧情', location: '马车内',
      worldTimeText: '', createdAt: 1,
      verification: null,
      locators: [{ chatId: 'source', chatName: '原始聊天', userMessageId: 3, assistantMessageId: 4, swipeId: 0 }],
    };
    mocks.scan.mockResolvedValue({
      tree: {
        version: 2, updatedAt: 1, nodes: { 'selected-node': node },
        branches: {
          dead: {
            id: 'dead', chatId: 'missing', chatName: '已删除分支',
            originNodeId: null, headNodeId: 'selected-node', createdAt: 1, status: 'broken',
          },
        },
      },
      currentChat: { id: 'chat-a', name: '聊天 A' },
      currentNodeId: null,
      currentBranchId: 'history_branch_current',
    });
    render(<SaveLoadPanel gameState={gameState} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '选择测试历史节点' }));
    expect(screen.getByText('1 条旧分支标记不可用 · 可尝试其他定位')).toBeInTheDocument();
    const action = screen.getByRole('button', { name: '从此处继续' });
    expect(action).not.toBeDisabled();
    fireEvent.click(action);
    expect(screen.getByRole('button', { name: '确认继续' })).toBeInTheDocument();
  });

  it('事件验证失败时展示降级继续确认，警示偏差及不改原封存', async () => {
    mocks.readJournal.mockReturnValue({
      transactionId: 'txn-degrade',
      stage: 'verify',
      targetNodeId: 'node-1',
      targetLocator: { chatId: 'fork-1', chatName: '新分支', userMessageId: null, assistantMessageId: 0, swipeId: 0 },
      actionKind: 'fork_branch',
      sourceChatId: 'chat-a', sourceChatName: '聊天 A',
      failure: { stage: 'verify', message: '事件状态不匹配。', occurredAt: 1 },
    });
    render(<SaveLoadPanel gameState={gameState} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /降级继续（事件状态可能偏离）/ }));
    expect(screen.getByRole('button', { name: '我了解事件偏差风险，仍要继续' })).toBeInTheDocument();
    expect(screen.getByText(/不会修改来源聊天或覆盖历史节点封存指纹/)).toBeInTheDocument();
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
