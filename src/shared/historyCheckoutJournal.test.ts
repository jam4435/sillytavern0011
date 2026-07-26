import { beforeEach, describe, expect, it } from 'vitest';
import {
  HISTORY_CHECKOUT_COMMIT_EVENT,
  HISTORY_CHECKOUT_DRAFT_EVENT,
  HISTORY_CHECKOUT_DRAFT_KEY,
  HISTORY_CHECKOUT_JOURNAL_KEY,
  HISTORY_CHECKOUT_JOURNAL_TTL_MS,
  HISTORY_CHECKOUT_RETURN_INTENT_KEY,
  HISTORY_CHECKOUT_STATE_EVENT,
  HistoryCheckoutJournalSchema,
  clearHistoryCheckoutDraft,
  clearHistoryCheckoutJournal,
  createHistoryCheckoutJournal,
  isHistoryCheckoutJournalExpired,
  isHistoryCheckoutPending,
  notifyHistoryCheckoutCommit,
  readHistoryCheckoutDraft,
  readHistoryCheckoutJournal,
  readHistoryCheckoutReturnIntent,
  renewHistoryCheckoutJournal,
  updateHistoryCheckoutJournal,
  updateHistoryCheckoutDraftMessage,
  writeHistoryCheckoutDraft,
  writeHistoryCheckoutReturnIntent,
} from './historyCheckoutJournal';

describe('historyCheckoutJournal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('只持久化精确 journal schema，并在 120 秒后解除 pending', () => {
    const now = 1_000;
    const journal = createHistoryCheckoutJournal(
      {
        targetNodeId: 'node-a',
        targetLocator: {
          chatId: 'chat-a',
          chatName: '聊天 A',
          userMessageId: 1,
          assistantMessageId: 2,
          swipeId: 0,
        },
        sourceHeadNodeId: 'node-source',
        sourceChatId: 'chat-source',
        sourceChatName: '来源聊天',
      },
      now,
    );

    expect(Object.keys(journal).sort()).toEqual([
      'sourceChatId',
      'sourceChatName',
      'sourceHeadNodeId',
      'stage',
      'startedAt',
      'targetLocator',
      'targetNodeId',
      'transactionId',
      'version',
    ]);
    expect(HistoryCheckoutJournalSchema.parse(JSON.parse(localStorage.getItem(HISTORY_CHECKOUT_JOURNAL_KEY)!))).toEqual(
      journal,
    );
    expect(isHistoryCheckoutPending(now + HISTORY_CHECKOUT_JOURNAL_TTL_MS)).toBe(true);
    expect(isHistoryCheckoutJournalExpired(journal, now + HISTORY_CHECKOUT_JOURNAL_TTL_MS + 1)).toBe(true);
    expect(isHistoryCheckoutPending(now + HISTORY_CHECKOUT_JOURNAL_TTL_MS + 1)).toBe(false);

    writeHistoryCheckoutReturnIntent(journal.transactionId);
    expect(localStorage.getItem(HISTORY_CHECKOUT_RETURN_INTENT_KEY)).toBe(journal.transactionId);
    expect(readHistoryCheckoutReturnIntent()).toBe(journal.transactionId);
    expect(Object.hasOwn(journal, 'returnIntent')).toBe(false);
    clearHistoryCheckoutJournal();
    expect(readHistoryCheckoutReturnIntent()).toBeNull();
  });

  it('写入、续期、提交和清理会派发同 iframe 状态事件', () => {
    const pendingStates: boolean[] = [];
    const commits: boolean[] = [];
    window.addEventListener(HISTORY_CHECKOUT_STATE_EVENT, ((event: CustomEvent<{ pending: boolean }>) => {
      pendingStates.push(event.detail.pending);
    }) as EventListener);
    window.addEventListener(HISTORY_CHECKOUT_COMMIT_EVENT, ((event: CustomEvent<{ resumed: boolean }>) => {
      commits.push(event.detail.resumed);
    }) as EventListener);

    const original = createHistoryCheckoutJournal(
      {
        targetNodeId: 'node-a',
        targetLocator: {
          chatId: 'chat-a',
          chatName: 'A',
          userMessageId: null,
          assistantMessageId: 0,
          swipeId: 0,
        },
        sourceHeadNodeId: '',
        sourceChatId: 'chat-a',
        sourceChatName: 'A',
      },
      10,
    );
    updateHistoryCheckoutJournal({ stage: 'sync_era' });
    const renewed = renewHistoryCheckoutJournal(readHistoryCheckoutJournal()!, 20);
    notifyHistoryCheckoutCommit(true);
    clearHistoryCheckoutJournal();

    expect(renewed.transactionId).not.toBe(original.transactionId);
    expect(renewed.startedAt).toBe(20);
    expect(renewed.stage).toBe('sync_era');
    expect(pendingStates).toEqual([true, true, true, false]);
    expect(commits).toEqual([true]);
    expect(readHistoryCheckoutJournal()).toBeNull();
  });

  it('拒绝 journal 的额外字段', () => {
    expect(() =>
      HistoryCheckoutJournalSchema.parse({
        version: 1,
        transactionId: 'tx',
        stage: 'navigate_source',
        targetNodeId: 'node',
        targetLocator: {
          chatId: 'chat',
          chatName: 'Chat',
          userMessageId: null,
          assistantMessageId: 0,
          swipeId: 0,
        },
        sourceHeadNodeId: '',
        sourceChatId: 'chat',
        sourceChatName: 'Chat',
        startedAt: 0,
        expiresAt: 120_000,
      }),
    ).toThrow();
  });

  it('分支输入草稿按聊天隔离，可跨 iframe 更新并在发送后清理', () => {
    const observed: Array<string | null> = [];
    window.addEventListener(HISTORY_CHECKOUT_DRAFT_EVENT, ((event: CustomEvent<{ message?: string } | null>) => {
      observed.push(event.detail?.message ?? null);
    }) as EventListener);

    const draft = writeHistoryCheckoutDraft({
      transactionId: 'checkout-draft',
      chatId: 'branch-chat',
      message: '原路线行动',
      createdAt: 123,
    });
    expect(readHistoryCheckoutDraft('branch-chat')).toEqual(draft);
    expect(readHistoryCheckoutDraft('other-chat')).toBeNull();

    updateHistoryCheckoutDraftMessage(draft.transactionId, '修改后的行动');
    expect(readHistoryCheckoutDraft('branch-chat')?.message).toBe('修改后的行动');
    expect(localStorage.getItem(HISTORY_CHECKOUT_DRAFT_KEY)).toContain('修改后的行动');

    clearHistoryCheckoutDraft(draft.transactionId);
    expect(readHistoryCheckoutDraft()).toBeNull();
    expect(observed).toEqual(['原路线行动', null]);
  });
});
