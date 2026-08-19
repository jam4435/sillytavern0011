import { z } from 'zod';

export const CHAT_RENAME_JOURNAL_KEY = 'wuxia_chat_rename_journal_v1';
export const CHAT_RENAME_JOURNAL_TTL_MS = 120_000;
export const CHAT_RENAME_STATE_EVENT = 'wuxia:chat-rename-state';
export const CHAT_RENAME_COMMIT_EVENT = 'wuxia:chat-rename-commit';

export const ChatRenameReasonSchema = z.enum(['initial', 'manual', 'branch_auto']);
export type ChatRenameReason = z.infer<typeof ChatRenameReasonSchema>;

export const ChatRenameJournalSchema = z
  .object({
    version: z.literal(1),
    transactionId: z.string().min(1),
    reason: ChatRenameReasonSchema,
    oldChatId: z.string().min(1),
    oldChatName: z.string().min(1),
    requestedName: z.string().min(1),
    reopenHistoryPanel: z.boolean(),
    startedAt: z.number().finite(),
  })
  .strict();

export type ChatRenameJournal = z.infer<typeof ChatRenameJournalSchema>;

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

function dispatchState(pending: boolean): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_RENAME_STATE_EVENT, { detail: { pending } }));
}

export function createChatRenameJournal(
  input: Omit<ChatRenameJournal, 'version' | 'transactionId' | 'startedAt'>,
  now = Date.now(),
): ChatRenameJournal {
  const journal = ChatRenameJournalSchema.parse({
    version: 1,
    transactionId: `chat-rename_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    startedAt: now,
  });
  return writeChatRenameJournal(journal);
}

export function readChatRenameJournal(): ChatRenameJournal | null {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(CHAT_RENAME_JOURNAL_KEY);
    if (!raw) return null;
    const parsed = ChatRenameJournalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeChatRenameJournal(journal: ChatRenameJournal): ChatRenameJournal {
  const parsed = ChatRenameJournalSchema.parse(journal);
  if (storageAvailable()) {
    localStorage.setItem(CHAT_RENAME_JOURNAL_KEY, JSON.stringify(parsed));
  }
  dispatchState(true);
  return parsed;
}

export function clearChatRenameJournal(): void {
  if (storageAvailable()) {
    localStorage.removeItem(CHAT_RENAME_JOURNAL_KEY);
  }
  dispatchState(false);
}

export function isChatRenameJournalExpired(journal: ChatRenameJournal, now = Date.now()): boolean {
  return now > journal.startedAt + CHAT_RENAME_JOURNAL_TTL_MS;
}

export function isChatRenamePending(now = Date.now()): boolean {
  const journal = readChatRenameJournal();
  return Boolean(journal && !isChatRenameJournalExpired(journal, now));
}

export function notifyChatRenameCommit(detail: { transactionId: string; reopenHistoryPanel: boolean }): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_RENAME_COMMIT_EVENT, { detail }));
}
