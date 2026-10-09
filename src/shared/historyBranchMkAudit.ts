/**
 * 历史分叉 MK 生命周期观测（只读）。
 *
 * /branch-create 会切换聊天并销毁旧 iframe，不能把诊断只放在组件内存。
 * 使用 ERA 已有的关键日志跨 bundle / iframe 保存，不修改聊天或 ERA 变量。
 */
import { recordEraDiagnostic } from '../ERA变量框架/utils/diagnostics';

const JOURNAL_STORAGE_KEY = 'wuxia_history_checkout_journal_v1';
const MAX_SAMPLED_MKS = 32;

type RecordValue = Record<string, unknown>;

interface BranchJournalAuditContext {
  transactionId: string;
  journalStage: string;
  sourceChatId: string;
  targetMessageId: number;
}

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function parseLogs(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.filter(entry => asRecord(entry) !== null) as RecordValue[];
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(entry => asRecord(entry) !== null) as RecordValue[] : [];
  } catch {
    return [];
  }
}

function isEventSystemLog(entry: RecordValue): boolean {
  const path = entry.path;
  return typeof path === 'string' && (path === '事件系统' || path.startsWith('事件系统.'));
}

function affectsActiveEvent(entry: RecordValue, eventName: string): boolean {
  const path = entry.path;
  if (typeof path !== 'string') return false;
  const target = `事件系统.进行中事件.${eventName}`;
  return path === '事件系统' || path === '事件系统.进行中事件'
    || path === target || path.startsWith(`${target}.`);
}

export function collectHistoryBranchMkSnapshot(
  variables: unknown,
  targetMessageId: number,
): RecordValue {
  const chat = asRecord(variables);
  const meta = asRecord(chat?.ERAMetaData);
  const stat = asRecord(chat?.stat_data);
  const eventSystem = asRecord(stat?.事件系统);
  const activeEvents = Object.keys(asRecord(eventSystem?.进行中事件) ?? {});
  const mks = Array.isArray(meta?.SelectedMks) ? meta.SelectedMks : [];
  const editLogs = asRecord(meta?.EditLogs) ?? {};
  const selected = mks.map((raw, messageId) => {
    const mk = typeof raw === 'string' && raw ? raw : null;
    const entries = mk ? parseLogs(editLogs[mk]) : [];
    return {
      messageId,
      mk,
      hasLogKey: mk !== null && Object.prototype.hasOwnProperty.call(editLogs, mk),
      editLogCount: entries.length,
      eventSystemLogCount: entries.filter(isEventSystemLog).length,
    };
  });
  const future = selected.filter(row => row.messageId > targetMessageId && row.mk !== null);
  const chosenMks = new Set(selected.map(row => row.mk).filter(Boolean));
  const eventLogCount = selected.reduce((sum, row) => sum + row.eventSystemLogCount, 0);
  return {
    variablesAvailable: chat !== null,
    metaAvailable: meta !== null,
    statAvailable: stat !== null,
    targetMessageId,
    selectedMksLength: mks.length,
    selectedMksNonempty: selected.filter(row => row.mk !== null).length,
    editLogKeysCount: Object.keys(editLogs).length,
    unselectedEditLogKeysCount: Object.keys(editLogs).filter(key => !chosenMks.has(key)).length,
    eventLogCount,
    futureMksCount: future.length,
    futureEditLogCount: future.reduce((sum, row) => sum + row.editLogCount, 0),
    futureEventSystemLogCount: future.reduce((sum, row) => sum + row.eventSystemLogCount, 0),
    futureMks: future.slice(0, MAX_SAMPLED_MKS),
    omittedFutureMks: Math.max(0, future.length - MAX_SAMPLED_MKS),
    selectedMksTail: selected.slice(-MAX_SAMPLED_MKS),
    omittedSelectedMks: Math.max(0, selected.length - MAX_SAMPLED_MKS),
    activeEventNames: activeEvents.slice(0, 12),
    activeEventLogCounts: Object.fromEntries(activeEvents.slice(0, 12).map(name => [
      name,
      selected.reduce((sum, row) => {
        if (!row.mk) return sum;
        return sum + parseLogs(editLogs[row.mk]).filter(entry => affectsActiveEvent(entry, name)).length;
      }, 0),
    ])),
  };
}

function readBranchJournalContext(): BranchJournalAuditContext | null {
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (!raw) return null;
    const journal = asRecord(JSON.parse(raw));
    if (!journal || journal.actionKind !== 'fork_branch') return null;
    if (typeof journal.transactionId !== 'string') return null;
    if (journal.stage !== 'create_branch' && journal.stage !== 'sync_era'
      && journal.stage !== 'verify' && journal.stage !== 'commit') return null;
    const locator = asRecord(journal.branchSourceLocator) ?? asRecord(journal.targetLocator);
    const targetMessageId = locator?.assistantMessageId;
    if (typeof targetMessageId !== 'number' || !Number.isInteger(targetMessageId)) return null;
    return {
      transactionId: journal.transactionId,
      journalStage: String(journal.stage),
      sourceChatId: typeof journal.sourceChatId === 'string' ? journal.sourceChatId : '',
      targetMessageId,
    };
  } catch {
    return null;
  }
}

/** 仅在 fork_branch journal 存在时采集；失败不改变游戏流程。 */
export function recordHistoryBranchMkAudit(stage: string, eventType?: string): void {
  const journal = readBranchJournalContext();
  if (!journal) return;

  try {
    const vars = typeof getVariables === 'function' ? getVariables({ type: 'chat' }) : null;
    let messageCount: number | null = null;
    try {
      const messages = typeof getChatMessages === 'function'
        ? getChatMessages('0-{{lastMessageId}}', { include_swipes: true })
        : null;
      messageCount = Array.isArray(messages) ? messages.length : null;
    } catch {
      // 新 iframe 的消息接口可能比脚本初始化更晚就绪。
    }

    const chatId = typeof SillyTavern !== 'undefined'
      ? String(SillyTavern.getCurrentChatId?.() ?? '')
      : '';

    recordEraDiagnostic('history-branch-mk-lifecycle', 'history-branch-mk-lifecycle-audit', {
      stage,
      ...(eventType ? { eventType } : {}),
      ...journal,
      chatId,
      messageCount,
      ...collectHistoryBranchMkSnapshot(vars, journal.targetMessageId),
    });
  } catch (error) {
    console.warn('[历史分叉] MK 生命周期诊断采集失败', { stage, error });
  }
}
