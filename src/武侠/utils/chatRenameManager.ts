import {
  CHAT_RENAME_JOURNAL_TTL_MS,
  clearChatRenameJournal,
  createChatRenameJournal,
  isChatRenameJournalExpired,
  isChatRenamePending,
  notifyChatRenameCommit,
  readChatRenameJournal,
  type ChatRenameJournal,
  type ChatRenameReason,
} from '../../shared/chatRenameJournal';
import {
  isHistoryCheckoutPending,
  migrateHistoryCheckoutDraftChatId,
} from '../../shared/historyCheckoutJournal';
import { migrateAvatarChatStorage } from './avatarStorage';
import {
  migrateHistoryChatIdentity,
  readCurrentChatIdentity,
  scanCurrentChat,
  type HistoryChatIdentity,
} from './saveLoadManager';

const INVALID_CHAT_NAME = /[<>:"/\\|?*]/;

export type ChatRenameOutcome =
  | { status: 'committed'; journal: ChatRenameJournal }
  | { status: 'failed' | 'expired' | 'not_pending'; message: string; journal?: ChatRenameJournal };

function normalizeChatFileName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\.jsonl$/i, '');
}

export function validateChatRenameTarget(input: string, currentName?: string): string {
  const name = input.trim();
  if (!name) throw new Error('请填写存档名称。');
  const hasControlCharacter = [...name].some(character => character.charCodeAt(0) < 32);
  if (name === '.' || name === '..' || INVALID_CHAT_NAME.test(name) || hasControlCharacter || /[.\s]$/.test(name)) {
    throw new Error('名称不能包含路径非法字符，也不能以句点或空格结尾。');
  }
  if (currentName && name === currentName.trim()) {
    throw new Error('新名称与当前聊天存档名称相同。');
  }
  return name;
}

async function listCurrentChatNames(): Promise<Set<string>> {
  const tavern = SillyTavern as unknown as {
    groupId?: unknown;
    groups?: Array<{ id?: unknown; chats?: unknown }>;
    characterId?: unknown;
    characters?: Array<{ avatar?: unknown }>;
    getRequestHeaders?: () => Record<string, string>;
  };
  const groupId = String(tavern.groupId ?? '').trim();
  if (groupId) {
    const group = tavern.groups?.find(item => String(item?.id ?? '') === groupId);
    if (!group) throw new Error('无法读取当前群组聊天列表。');
    const chats = Array.isArray(group.chats) ? group.chats : [];
    return new Set(chats.map(normalizeChatFileName).filter(Boolean));
  }

  const characterId = Number(tavern.characterId);
  const avatarUrl = Number.isInteger(characterId) ? String(tavern.characters?.[characterId]?.avatar ?? '').trim() : '';
  if (!avatarUrl || !tavern.getRequestHeaders) throw new Error('无法读取当前角色，不能验证存档名称。');
  const response = await fetch('/api/characters/chats', {
    method: 'POST',
    headers: tavern.getRequestHeaders(),
    body: JSON.stringify({ avatar_url: avatarUrl }),
  });
  if (!response.ok) throw new Error(`无法读取角色聊天列表（HTTP ${response.status}）。`);
  const payload: unknown = await response.json();
  const entries = Array.isArray(payload) ? payload : payload && typeof payload === 'object' ? Object.values(payload) : [];
  return new Set(
    entries
      .map(item => (item && typeof item === 'object' ? normalizeChatFileName((item as { file_name?: unknown }).file_name) : ''))
      .filter(Boolean),
  );
}

async function assertTargetNameAvailable(targetName: string, currentChat: HistoryChatIdentity): Promise<void> {
  const existing = await listCurrentChatNames();
  const normalizedTarget = normalizeChatFileName(targetName);
  if (existing.has(normalizedTarget) && normalizedTarget !== normalizeChatFileName(currentChat.id)) {
    throw new Error('已有同名聊天存档，请换一个名称。');
  }
}

/** 根据当前角色或群组的实际聊天列表，给自动分支取得一个唯一名称。 */
export async function getUniqueChatRenameSuggestion(baseName: string): Promise<string> {
  const base = validateChatRenameTarget(baseName);
  const existing = await listCurrentChatNames();
  for (let index = 1; index < 1_000; index += 1) {
    const candidate = index === 1 ? base : `${base} · ${index}`;
    if (!existing.has(normalizeChatFileName(candidate))) return candidate;
  }
  throw new Error('无法取得唯一的分支存档名称，请稍后重试。');
}

function makeAutomaticChatRenameTarget(input: string): string {
  const sanitized = [...input]
    .map(character => (INVALID_CHAT_NAME.test(character) || character.charCodeAt(0) < 32 ? '·' : character))
    .join('')
    .trim()
    .replace(/[.\s]+$/u, '');
  return sanitized || '未题名分支';
}

function renamedIdentityMatches(journal: ChatRenameJournal, current: HistoryChatIdentity): boolean {
  return current.id !== journal.oldChatId && current.name === journal.requestedName;
}

/**
 * 接续 iframe 重载后的改名事务。身份、真实名称都验证通过后才迁移历史引用和本地缓存。
 */
export async function resumePendingChatRename(now = Date.now()): Promise<ChatRenameOutcome> {
  const journal = readChatRenameJournal();
  if (!journal) return { status: 'not_pending', message: '没有待恢复的聊天改名事务。' };
  if (isChatRenameJournalExpired(journal, now)) {
    clearChatRenameJournal();
    return {
      status: 'expired',
      message: `聊天改名恢复窗口已超过 ${Math.round(CHAT_RENAME_JOURNAL_TTL_MS / 1_000)} 秒，未迁移历史引用。`,
      journal,
    };
  }

  let current: HistoryChatIdentity;
  try {
    current = await readCurrentChatIdentity();
  } catch (error) {
    clearChatRenameJournal();
    return {
      status: 'failed',
      message: `无法确认改名后的聊天：${error instanceof Error ? error.message : String(error)}`,
      journal,
    };
  }
  if (!renamedIdentityMatches(journal, current)) {
    clearChatRenameJournal();
    return {
      status: 'failed',
      message: '未确认到目标聊天名称；为避免误迁移，历史引用保持原样。',
      journal,
    };
  }

  try {
    migrateHistoryChatIdentity({ id: journal.oldChatId, name: journal.oldChatName }, current);
    migrateAvatarChatStorage(journal.oldChatId, current.id);
    migrateHistoryCheckoutDraftChatId(journal.oldChatId, current.id);
    await scanCurrentChat();
    clearChatRenameJournal();
    notifyChatRenameCommit({ transactionId: journal.transactionId, reopenHistoryPanel: journal.reopenHistoryPanel });
    return { status: 'committed', journal };
  } catch (error) {
    // 写入失败时保留 journal，让同一身份再次加载时能够安全续接。
    return {
      status: 'failed',
      message: `改名已完成，但历史引用迁移尚未完成：${error instanceof Error ? error.message : String(error)}`,
      journal,
    };
  }
}

export async function renameCurrentChat(
  requestedName: string,
  options: { reason: ChatRenameReason; reopenHistoryPanel?: boolean },
): Promise<ChatRenameOutcome> {
  if (isHistoryCheckoutPending()) {
    return { status: 'failed', message: '历史分叉正在处理，暂时不能改名。' };
  }
  if (isChatRenamePending()) {
    return { status: 'failed', message: '已有聊天改名事务正在等待完成。' };
  }
  if (typeof SillyTavern.renameChat !== 'function') {
    return { status: 'failed', message: '当前酒馆版本未提供聊天改名接口。' };
  }

  let current: HistoryChatIdentity;
  let targetName: string;
  try {
    current = await readCurrentChatIdentity();
    targetName = validateChatRenameTarget(requestedName, current.name);
    await assertTargetNameAvailable(targetName, current);
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }

  const journal = createChatRenameJournal({
    reason: options.reason,
    oldChatId: current.id,
    oldChatName: current.name,
    requestedName: targetName,
    reopenHistoryPanel: options.reopenHistoryPanel === true,
  });
  try {
    await SillyTavern.renameChat(current.name, targetName);
  } catch (error) {
    clearChatRenameJournal();
    return {
      status: 'failed',
      message: `酒馆聊天改名失败：${error instanceof Error ? error.message : String(error)}`,
      journal,
    };
  }

  // 正常成功会马上重载 iframe；某些实现/测试环境会直接返回，此时仍须只在真实身份已改变时提交迁移。
  const outcome = await resumePendingChatRename();
  if (outcome.status === 'committed') return outcome;
  return {
    status: 'failed',
    message: outcome.message || '酒馆没有确认聊天名称已更新。',
    journal,
  };
}

/** 自动分支只负责建议和提交；失败不会回滚已经验证通过的分叉。 */
export async function renameCurrentChatAutomatically(baseName: string): Promise<ChatRenameOutcome> {
  try {
    const targetName = await getUniqueChatRenameSuggestion(makeAutomaticChatRenameTarget(baseName));
    return renameCurrentChat(targetName, { reason: 'branch_auto', reopenHistoryPanel: false });
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

export { isChatRenamePending };
