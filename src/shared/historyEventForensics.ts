/**
 * 历史事件状态只读取证。不会修改聊天变量、ERA MK、EditLogs 或历史树。
 * 使用与 saveLoadManager.stableHistoryHash 完全相同的规范化及 16 位哈希算法，
 * 便于把封存指纹、事件事务与直接写入关联起来。
 */
import { recordEraDiagnostic } from '../ERA变量框架/utils/diagnostics';

export const HISTORY_EVENT_FORENSICS_STORAGE_KEY = 'wuxia_history_event_forensics_v1';
const MAX_RECORDS = 120;
const MAX_EVENT_ITEMS = 16;
const ROOTS = ['事件系统', '参与事件', '世界事件', '事件分支结果', '后续事件线索', '后续事件线索计数'] as const;
const TRACKED_BUCKETS = ['未发生事件', '进行中事件', '已完成事件', '已失效事件', '人物事件占用'] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function canonicalize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (value === undefined) return '"__undefined__"';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '"__nan__"';
    if (!Number.isFinite(value)) return value > 0 ? '"__infinity__"' : '"__negative_infinity__"';
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'bigint') return JSON.stringify(`${value.toString()}n`);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'symbol' || typeof value === 'function') return JSON.stringify(String(value));
  if (seen.has(value as object)) throw new TypeError('无法为循环引用生成稳定哈希。');
  seen.add(value as object);
  try {
    if (Array.isArray(value)) return `[${value.map(item => canonicalize(item, seen)).join(',')}]`;
    const fields = value as Record<string, unknown>;
    return `{${Object.keys(fields).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalize(fields[key], seen)}`).join(',')}}`;
  } finally {
    seen.delete(value as object);
  }
}

export function hashHistoryEventForensics(value: unknown): string {
  const input = canonicalize(value, new WeakSet<object>());
  let high = 0x9e3779b9;
  let low = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    low ^= code;
    low = Math.imul(low, 0x01000193) >>> 0;
    high ^= low + code + ((high << 6) >>> 0) + (high >>> 2);
    high >>>= 0;
  }
  return `${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`;
}

export function snapshotHistoryEventForensics(statData: unknown) {
  const stat = record(statData) ?? {};
  const eventSystem = record(stat.事件系统) ?? {};
  const active = record(eventSystem.进行中事件) ?? {};
  const occupancy = record(eventSystem.人物事件占用) ?? {};
  const eventRoots = Object.fromEntries(ROOTS.map(key => [key, stat[key] ?? null]));
  return {
    eventStateHash: hashHistoryEventForensics(eventRoots),
    eventSystemHash: hashHistoryEventForensics(stat.事件系统 ?? null),
    eventBuckets: Object.fromEntries(TRACKED_BUCKETS.map(key => [
      key, hashHistoryEventForensics(eventSystem[key] ?? null),
    ])),
    ongoingCount: Object.keys(active).length,
    ongoingEvents: Object.entries(active).slice(0, MAX_EVENT_ITEMS).map(([name, value]) => ({
      name,
      hash: hashHistoryEventForensics(value),
    })),
    omittedOngoing: Math.max(0, Object.keys(active).length - MAX_EVENT_ITEMS),
    occupancyCount: Object.keys(occupancy).length,
    characterOccupancy: Object.entries(occupancy).slice(0, MAX_EVENT_ITEMS).map(([name, value]) => ({
      name,
      eventName: typeof record(value)?.事件名 === 'string' ? record(value)?.事件名 : null,
      hash: hashHistoryEventForensics(value),
    })),
    omittedOccupancy: Math.max(0, Object.keys(occupancy).length - MAX_EVENT_ITEMS),
  };
}

/** 只记录事件根下面的触及路径，不读取操作的新旧变量值。 */
export function summarizeEventTransactionOperations(operations: unknown) {
  const summary: Array<{ type: string; path: string }> = [];
  if (!Array.isArray(operations)) return summary;
  for (const raw of operations) {
    const op = record(raw);
    const payload = record(op?.payload);
    if (!payload) continue;
    const type = String(op?.type ?? 'unknown');
    for (const root of ROOTS) {
      if (!Object.prototype.hasOwnProperty.call(payload, root)) continue;
      const nested = record(payload[root]);
      if (!nested) {
        summary.push({ type, path: root });
        continue;
      }
      for (const [category, value] of Object.entries(nested)) {
        if (root === '事件系统') {
          const targets = record(value);
          if (targets) {
            for (const name of Object.keys(targets)) {
              summary.push({ type, path: `${root}.${category}.${name}` });
            }
          } else {
            summary.push({ type, path: `${root}.${category}` });
          }
        } else {
          summary.push({ type, path: `${root}.${category}` });
        }
      }
    }
  }
  return summary.slice(0, 40);
}

export function getHistoryEventMessageContext(vars: unknown): Record<string, unknown> {
  const meta = record(record(vars)?.ERAMetaData) ?? {};
  const mks = Array.isArray(meta.SelectedMks) ? meta.SelectedMks : [];
  let chatId = '';
  let messageId: number | null = null;
  try {
    if (typeof SillyTavern !== 'undefined') chatId = String(SillyTavern.getCurrentChatId?.() ?? '');
    if (typeof getChatMessages === 'function') {
      const latest = getChatMessages(-1, { include_swipes: true })?.[0];
      if (typeof latest?.message_id === 'number') messageId = latest.message_id;
    }
  } catch {
    // 旧 iframe 尚未就绪时允许没有 messageId，不能误绑到其它楼层。
  }
  return {
    chatId,
    messageId,
    selectedMk: messageId !== null && typeof mks[messageId] === 'string' ? mks[messageId] : null,
    selectedMksCount: mks.length,
  };
}

/**
 * 独立 localStorage 环形日志，不受 ERA critical 300 条上限中的逐叶 skip 噪声挤占。
 * 所有异常只输出告警；诊断永远不能使真正的变量提交或历史封存失败。
 */
export function recordHistoryEventForensics(stage: string, details: Record<string, unknown>): void {
  try {
    const entry = recordEraDiagnostic('history-event-forensics', 'history-event-forensics', { stage, ...details });
    try {
      const raw = localStorage.getItem(HISTORY_EVENT_FORENSICS_STORAGE_KEY);
      const previous: unknown = raw ? JSON.parse(raw) : [];
      const entries = Array.isArray(previous) ? previous : [];
      localStorage.setItem(HISTORY_EVENT_FORENSICS_STORAGE_KEY, JSON.stringify([...entries, entry].slice(-MAX_RECORDS)));
    } catch (error) {
      console.warn('[事件历史取证] 独立诊断存储失败', error);
    }
  } catch (error) {
    console.warn('[事件历史取证] 记录失败', { stage, error });
  }
}
