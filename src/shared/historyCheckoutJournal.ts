import { z } from 'zod';
import type { HistoryLocator } from '../武侠/types';

export const HISTORY_CHECKOUT_JOURNAL_KEY = 'wuxia_history_checkout_journal_v1';
export const HISTORY_CHECKOUT_RETURN_INTENT_KEY = 'wuxia_history_checkout_return_intent_v1';
export const HISTORY_CHECKOUT_DRAFT_KEY = 'wuxia_history_checkout_draft_v1';
export const HISTORY_CHECKOUT_JOURNAL_TTL_MS = 120_000;
export const HISTORY_CHECKOUT_STATE_EVENT = 'wuxia:history-checkout-state';
export const HISTORY_CHECKOUT_COMMIT_EVENT = 'wuxia:history-checkout-commit';
export const HISTORY_CHECKOUT_DRAFT_EVENT = 'wuxia:history-checkout-draft';

export const HistoryCheckoutActionKindSchema = z.enum(['existing_branch', 'in_place_swipe', 'fork_branch']);
export type HistoryCheckoutActionKind = z.infer<typeof HistoryCheckoutActionKindSchema>;

export const CheckoutJournalStageSchema = z.enum([
  'navigate_source',
  'create_branch',
  'activate_swipe',
  'sync_era',
  'verify',
  'commit',
]);
export type CheckoutJournalStage = z.infer<typeof CheckoutJournalStageSchema>;

const CheckoutJournalFailureSchema = z
  .object({
    stage: CheckoutJournalStageSchema,
    message: z.string(),
    occurredAt: z.number().finite(),
  })
  .strict();

const HistoryLocatorSchema = z
  .object({
    chatId: z.string(),
    chatName: z.string(),
    userMessageId: z.number().int().nullable(),
    assistantMessageId: z.number().int(),
    swipeId: z.number().int().nonnegative(),
  })
  .strict();

export const HistoryCheckoutJournalSchema = z
  .object({
    version: z.literal(1),
    transactionId: z.string().min(1),
    stage: CheckoutJournalStageSchema,
    targetNodeId: z.string().min(1),
    targetLocator: HistoryLocatorSchema,
    actionKind: HistoryCheckoutActionKindSchema.optional(),
    branchSourceLocator: HistoryLocatorSchema.nullable().optional(),
    draftUserMessageId: z.number().int().nonnegative().nullable().optional(),
    draftMessage: z.string().optional(),
    /**
     * 仅新建分支使用：检出全部提交后，由独立的聊天改名事务采用的建议名称。
     * 可选字段让 v1 的旧 journal 继续可读。
     */
    postCommitChatName: z.string().min(1).optional(),
    failure: CheckoutJournalFailureSchema.optional(),
    sourceHeadNodeId: z.string(),
    sourceChatId: z.string(),
    sourceChatName: z.string(),
    startedAt: z.number().finite(),
  })
  .strict();

export type HistoryCheckoutJournal = z.infer<typeof HistoryCheckoutJournalSchema>;

export const HistoryCheckoutDraftSchema = z
  .object({
    version: z.literal(1),
    transactionId: z.string().min(1),
    chatId: z.string().min(1),
    message: z.string(),
    createdAt: z.number().finite(),
  })
  .strict();

export type HistoryCheckoutDraft = z.infer<typeof HistoryCheckoutDraftSchema>;

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

function dispatchPendingState(pending: boolean): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HISTORY_CHECKOUT_STATE_EVENT, { detail: { pending } }));
}

export function createHistoryCheckoutJournal(
  input: {
    targetNodeId: string;
    targetLocator: HistoryLocator;
    actionKind?: HistoryCheckoutActionKind;
    branchSourceLocator?: HistoryLocator | null;
    draftUserMessageId?: number | null;
    draftMessage?: string;
    postCommitChatName?: string;
    sourceHeadNodeId: string;
    sourceChatId: string;
    sourceChatName: string;
  },
  now = Date.now(),
): HistoryCheckoutJournal {
  clearHistoryCheckoutReturnIntent();
  const journal = HistoryCheckoutJournalSchema.parse({
    version: 1,
    transactionId: `checkout_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    stage: 'navigate_source',
    ...input,
    startedAt: now,
  });
  return writeHistoryCheckoutJournal(journal);
}

export function readHistoryCheckoutJournal(): HistoryCheckoutJournal | null {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(HISTORY_CHECKOUT_JOURNAL_KEY);
    if (!raw) return null;
    const parsed = HistoryCheckoutJournalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeHistoryCheckoutJournal(journal: HistoryCheckoutJournal): HistoryCheckoutJournal {
  const parsed = HistoryCheckoutJournalSchema.parse(journal);
  if (storageAvailable()) {
    localStorage.setItem(HISTORY_CHECKOUT_JOURNAL_KEY, JSON.stringify(parsed));
  }
  dispatchPendingState(true);
  return parsed;
}

export function updateHistoryCheckoutJournal(
  patch: Partial<
    Pick<
      HistoryCheckoutJournal,
      | 'stage'
      | 'targetLocator'
      | 'actionKind'
      | 'branchSourceLocator'
      | 'draftUserMessageId'
      | 'draftMessage'
      | 'postCommitChatName'
      | 'failure'
    >
  >,
): HistoryCheckoutJournal | null {
  const current = readHistoryCheckoutJournal();
  if (!current) return null;
  return writeHistoryCheckoutJournal({ ...current, ...patch });
}

export function clearHistoryCheckoutJournal(): void {
  if (storageAvailable()) {
    localStorage.removeItem(HISTORY_CHECKOUT_JOURNAL_KEY);
  }
  clearHistoryCheckoutReturnIntent();
  dispatchPendingState(false);
}

export function writeHistoryCheckoutReturnIntent(transactionId: string): void {
  if (!storageAvailable()) return;
  localStorage.setItem(HISTORY_CHECKOUT_RETURN_INTENT_KEY, transactionId);
}

export function readHistoryCheckoutReturnIntent(): string | null {
  if (!storageAvailable()) return null;
  return localStorage.getItem(HISTORY_CHECKOUT_RETURN_INTENT_KEY);
}

export function clearHistoryCheckoutReturnIntent(): void {
  if (!storageAvailable()) return;
  localStorage.removeItem(HISTORY_CHECKOUT_RETURN_INTENT_KEY);
}

function dispatchDraftState(draft: HistoryCheckoutDraft | null): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HISTORY_CHECKOUT_DRAFT_EVENT, { detail: draft }));
}

export function writeHistoryCheckoutDraft(
  input: Omit<HistoryCheckoutDraft, 'version' | 'createdAt'> & { createdAt?: number },
): HistoryCheckoutDraft {
  const draft = HistoryCheckoutDraftSchema.parse({
    version: 1,
    createdAt: Date.now(),
    ...input,
  });
  if (storageAvailable()) {
    localStorage.setItem(HISTORY_CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
  }
  dispatchDraftState(draft);
  return draft;
}

export function readHistoryCheckoutDraft(chatId?: string): HistoryCheckoutDraft | null {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(HISTORY_CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = HistoryCheckoutDraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (chatId !== undefined && parsed.data.chatId !== chatId) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function updateHistoryCheckoutDraftMessage(transactionId: string, message: string): HistoryCheckoutDraft | null {
  const current = readHistoryCheckoutDraft();
  if (!current || current.transactionId !== transactionId) return null;
  const updated = HistoryCheckoutDraftSchema.parse({ ...current, message });
  if (storageAvailable()) {
    localStorage.setItem(HISTORY_CHECKOUT_DRAFT_KEY, JSON.stringify(updated));
  }
  return updated;
}

export function clearHistoryCheckoutDraft(transactionId?: string): void {
  const current = readHistoryCheckoutDraft();
  if (transactionId && current?.transactionId !== transactionId) return;
  if (storageAvailable()) {
    localStorage.removeItem(HISTORY_CHECKOUT_DRAFT_KEY);
  }
  dispatchDraftState(null);
}

/** 聊天重命名后，保留尚未发送的分叉续写草稿。重复调用没有副作用。 */
export function migrateHistoryCheckoutDraftChatId(oldChatId: string, newChatId: string): HistoryCheckoutDraft | null {
  if (!oldChatId || !newChatId || oldChatId === newChatId) return readHistoryCheckoutDraft();
  const current = readHistoryCheckoutDraft();
  if (!current || current.chatId !== oldChatId) return current;
  return writeHistoryCheckoutDraft({
    transactionId: current.transactionId,
    chatId: newChatId,
    message: current.message,
    createdAt: current.createdAt,
  });
}

export function isHistoryCheckoutJournalExpired(journal: HistoryCheckoutJournal, now = Date.now()): boolean {
  return now > journal.startedAt + HISTORY_CHECKOUT_JOURNAL_TTL_MS;
}

export function isHistoryCheckoutPending(now = Date.now()): boolean {
  const journal = readHistoryCheckoutJournal();
  return Boolean(journal && !isHistoryCheckoutJournalExpired(journal, now));
}

export function notifyHistoryCheckoutFailure(): void {
  dispatchPendingState(true);
}

export function notifyHistoryCheckoutExpired(): void {
  dispatchPendingState(false);
}

export function renewHistoryCheckoutJournal(journal: HistoryCheckoutJournal, now = Date.now()): HistoryCheckoutJournal {
  return writeHistoryCheckoutJournal({
    ...journal,
    transactionId: `checkout_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now,
    failure: undefined,
  });
}

export function notifyHistoryCheckoutCommit(
  resumed: boolean,
  detail: { postCommitChatName?: string | null } = {},
): void {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HISTORY_CHECKOUT_COMMIT_EVENT, { detail: { resumed, ...detail } }));
  }
}
