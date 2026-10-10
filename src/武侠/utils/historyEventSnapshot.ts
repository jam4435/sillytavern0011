/**
 * 历史节点六组事件根的权威基准（按封存指纹内容寻址）。
 *
 * 初始事件状态与少量历史事件迁移使用 direct write，不属于 ERA 楼层 EditLog。
 * 所以 ERA full sync 只能负责变量操作重放；历史节点的事件最终状态以封存快照校准。
 * 不修改 ERA 编辑日志，且只在历史节点封存或已确认的历史检出期间调用。
 */
export const HISTORY_EVENT_SNAPSHOT_PREFIX = 'wuxia_history_event_snapshot_v1_';

export const HISTORY_EVENT_ROOTS = [
  '事件系统', '参与事件', '世界事件', '事件分支结果', '后续事件线索', '后续事件线索计数',
] as const;

export type HistoryEventRoots = Record<(typeof HISTORY_EVENT_ROOTS)[number], unknown>;

export function captureHistoryEventRoots(stat: Record<string, unknown>): HistoryEventRoots {
  return Object.fromEntries(
    HISTORY_EVENT_ROOTS.map(key => [key, structuredClone(stat[key] ?? null)]),
  ) as HistoryEventRoots;
}

export function saveHistoryEventSnapshot(eventStateHash: string, roots: HistoryEventRoots): void {
  if (!eventStateHash) throw new Error('封存事件快照缺少事件指纹');
  localStorage.setItem(
    HISTORY_EVENT_SNAPSHOT_PREFIX + eventStateHash,
    JSON.stringify({ version: 1, eventStateHash, roots }),
  );
}

export function loadHistoryEventSnapshot(eventStateHash: string): HistoryEventRoots | null {
  if (!eventStateHash) return null;
  const raw = localStorage.getItem(HISTORY_EVENT_SNAPSHOT_PREFIX + eventStateHash);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || parsed.eventStateHash !== eventStateHash ||
        !parsed.roots || typeof parsed.roots !== 'object' || Array.isArray(parsed.roots) ||
        !HISTORY_EVENT_ROOTS.every(key => Object.hasOwn(parsed.roots, key))) {
      return null;
    }
    return structuredClone(parsed.roots) as HistoryEventRoots;
  } catch {
    return null;
  }
}
