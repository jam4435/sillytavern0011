import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHAT_RENAME_JOURNAL_KEY,
  CHAT_RENAME_JOURNAL_TTL_MS,
  CHAT_RENAME_STATE_EVENT,
  ChatRenameJournalSchema,
  clearChatRenameJournal,
  createChatRenameJournal,
  isChatRenameJournalExpired,
  isChatRenamePending,
  readChatRenameJournal,
} from './chatRenameJournal';

describe('chatRenameJournal', () => {
  beforeEach(() => localStorage.clear());

  it('以严格 v1 schema 持久化，并在 120 秒后自然解除 pending', () => {
    const journal = createChatRenameJournal(
      {
        reason: 'manual',
        oldChatId: 'old-chat',
        oldChatName: '旧卷',
        requestedName: '新卷',
        reopenHistoryPanel: true,
      },
      1_000,
    );

    expect(ChatRenameJournalSchema.parse(JSON.parse(localStorage.getItem(CHAT_RENAME_JOURNAL_KEY)!))).toEqual(journal);
    expect(isChatRenamePending(1_000 + CHAT_RENAME_JOURNAL_TTL_MS)).toBe(true);
    expect(isChatRenameJournalExpired(journal, 1_000 + CHAT_RENAME_JOURNAL_TTL_MS + 1)).toBe(true);
    expect(isChatRenamePending(1_000 + CHAT_RENAME_JOURNAL_TTL_MS + 1)).toBe(false);
    expect(() => ChatRenameJournalSchema.parse({ ...journal, unsafe: true })).toThrow();
  });

  it('写入和清理派发同 iframe pending 状态，损坏记录不被读取', () => {
    const states: boolean[] = [];
    window.addEventListener(CHAT_RENAME_STATE_EVENT, ((event: CustomEvent<{ pending: boolean }>) => {
      states.push(event.detail.pending);
    }) as EventListener);

    createChatRenameJournal({
      reason: 'initial',
      oldChatId: 'old-chat',
      oldChatName: '酒馆默认名',
      requestedName: '侠客 · 牛家村',
      reopenHistoryPanel: false,
    });
    clearChatRenameJournal();
    localStorage.setItem(CHAT_RENAME_JOURNAL_KEY, '{broken');

    expect(states).toEqual([true, false]);
    expect(readChatRenameJournal()).toBeNull();
  });
});
