/**
 * ERA MK 撤销账本生命周期诊断。独立于易被逐叶 skip 挤占的 critical log。
 * 只记录路径/计数，不持久化任何 value_old/value_new。
 */
import { recordEraDiagnostic } from './diagnostics';

export const ERA_MK_LEDGER_JOURNAL_KEY = 'era_mk_ledger_journal_v1';
const MAX_RECORDS = 200;

// 只在当前 iframe 记住已经执行过回滚的 MK；后续 Apply 对该 MK 必须真正重放，
// 不得因为其它写入碰巧保留了原目标值，就将旧 EditLog 认作幂等重入记录。
const rollbackWitnesses = new Set<string>();
export function markMkRollbackPerformed(mk: string): void {
  rollbackWitnesses.add(mk);
}
export function consumeMkRollbackWitness(mk: string): boolean {
  const hadRollback = rollbackWitnesses.has(mk);
  rollbackWitnesses.delete(mk);
  return hadRollback;
}

export function recordMkLedgerTransition(
  stage: string,
  mk: string,
  details: Record<string, unknown> = {},
): void {
  try {
    let chatId = '';
    try {
      if (typeof SillyTavern !== 'undefined') chatId = String(SillyTavern.getCurrentChatId?.() ?? '');
    } catch { /* 宿主切换聊天时不依赖 chatId */ }
    const entry = recordEraDiagnostic('mk-ledger', 'mk-ledger-transition', {
      stage,
      mk,
      chatId,
      ...details,
    });
    try {
      const raw = localStorage.getItem(ERA_MK_LEDGER_JOURNAL_KEY);
      const stored: unknown = raw ? JSON.parse(raw) : [];
      const records = Array.isArray(stored) ? stored : [];
      localStorage.setItem(ERA_MK_LEDGER_JOURNAL_KEY, JSON.stringify(
        [...records, entry].slice(-MAX_RECORDS),
      ));
    } catch {
      // localStorage 不可用时不影响业务。
    }
  } catch {
    // 诊断绝不能使 ERA 写入或回滚失败。
  }
}

export function summarizeMkLedger(logs: unknown): Record<string, unknown> {
  const entries = Array.isArray(logs) ? logs : [];
  const eventRoots = /^(?:事件系统|参与事件|世界事件|事件分支结果|后续事件线索|后续事件线索计数)(?:\.|$)/;
  const paths = entries.flatMap(entry =>
    entry && typeof entry === 'object' &&
    typeof (entry as { path?: unknown }).path === 'string' &&
    eventRoots.test((entry as { path: string }).path)
      ? [(entry as { path: string }).path] : [],
  );
  return {
    logCount: entries.length,
    eventLogCount: paths.length,
    eventPaths: paths.slice(0, 20),
    omittedEventPaths: Math.max(0, paths.length - 20),
  };
}
