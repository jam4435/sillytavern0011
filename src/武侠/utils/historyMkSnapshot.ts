/**
 * 历史节点 SelectedMks 的逐楼取证基准。只保存 MK 身份，不保存变量或 EditLog。
 * 快照按封存哈希去重；诊断取证丢失不影响节点封存及严格检出。
 */
export const HISTORY_MK_SNAPSHOT_PREFIX = 'wuxia_history_mk_snapshot_v1_';
export type HistoryMk = string | null;

export interface HistoryMkMessage {
  messageId: number;
  role: string;
  mk: string | null;
  /** 酒馆 mes 与激活 swipe 内容可能不同，额外揭示此类不一致。 */
  swipeMk?: string | null;
}

export function saveHistoryMkSnapshot(hash: string, values: readonly unknown[]): void {
  if (!hash) throw new Error('封存 MK 快照缺少指纹');
  // 严格限定快照格式，避免 JSON 把 undefined / 数组空洞偷偷改成 null。
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.hasOwn(values, index) || (values[index] !== null && typeof values[index] !== 'string')) {
      throw new Error('SelectedMks 含无法无损封存的值，楼层 ' + index);
    }
  }
  localStorage.setItem(HISTORY_MK_SNAPSHOT_PREFIX + hash,
    JSON.stringify({ version: 1, selectedMksHash: hash, mks: values }));
}

/** 返回 null 代表旧节点、缓存丢失或快照无效；由调用方用封存指纹再次验真。 */
export function loadHistoryMkSnapshot(hash: string): HistoryMk[] | null {
  if (!hash || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(HISTORY_MK_SNAPSHOT_PREFIX + hash);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
    const entry = saved as { version?: unknown; selectedMksHash?: unknown; mks?: unknown };
    if (entry.version !== 1 || entry.selectedMksHash !== hash || !Array.isArray(entry.mks)) return null;
    for (let index = 0; index < entry.mks.length; index += 1) {
      if (!Object.hasOwn(entry.mks, index) ||
          (entry.mks[index] !== null && typeof entry.mks[index] !== 'string')) return null;
    }
    return entry.mks.slice();
  } catch {
    return null;
  }
}

function formatMk(value: unknown, exists: boolean): string {
  if (!exists) return '<缺失>';
  if (value === null) return 'null';
  if (typeof value === 'string') return value === '' ? '<空字符串>' : value;
  return '<异常类型:' + typeof value + '>';
}

function slotEquals(left: readonly unknown[], right: readonly unknown[], index: number): boolean {
  const leftExists = index < left.length && Object.hasOwn(left, index);
  const rightExists = index < right.length && Object.hasOwn(right, index);
  return leftExists === rightExists && (!leftExists || left[index] === right[index]);
}

function displaySlot(values: readonly unknown[], index: number): string {
  return formatMk(values[index], index < values.length && Object.hasOwn(values, index));
}

/**
 * 对比封存 SelectedMks / 恢复 SelectedMks / 当前激活聊天消息的 MK。
 * 只返回少量差异样本，但计数和首个差异扫描全部楼层。
 */
export function describeHistoryMkDifferences(
  sealed: readonly HistoryMk[] | null,
  restored: readonly unknown[],
  messages: readonly HistoryMkMessage[],
  limit = 12,
): string[] {
  const maxSample = Math.max(1, limit);
  const lines = [
    'ERA 逐楼 MK 差异诊断：',
    '封存数组长度：' + (sealed ? sealed.length : '无逐楼基准') +
      '；恢复数组长度：' + restored.length + '；实际聊天消息数：' + messages.length,
  ];
  if (!sealed) {
    lines.push('封存逐楼 MK 基准不可用（旧节点或本地缓存缺失/无效）；只能核对恢复数组与当前消息，不能推断原 MK。');
  } else {
    const examples: string[] = [];
    let differences = 0;
    for (let index = 0; index < Math.max(sealed.length, restored.length); index += 1) {
      if (slotEquals(sealed, restored, index)) continue;
      differences += 1;
      if (examples.length < maxSample) {
        examples.push('  楼层 ' + index + '：封存 ' + displaySlot(sealed, index) +
          ' → 恢复 ' + displaySlot(restored, index));
      }
    }
    lines.push('封存/恢复不同的 MK 楼层：' + differences + ' 处' +
      (differences ? '；首个差异见下方' : '（逐楼相同，请检查哈希对应的快照）'));
    lines.push(...examples);
    if (differences > examples.length) lines.push('  其余 ' + (differences - examples.length) + ' 处省略');
  }

  const mismatches: string[] = [];
  let messageDifferences = 0;
  const seen = new Set<number>();
  for (const message of messages) {
    if (!Number.isInteger(message.messageId) || message.messageId < 0) continue;
    seen.add(message.messageId);
    const hasSlot = message.messageId < restored.length &&
      Object.hasOwn(restored, message.messageId);
    const stored = hasSlot ? restored[message.messageId] : undefined;
    const differs = !hasSlot || stored !== message.mk || (
      message.swipeMk !== undefined && message.swipeMk !== message.mk
    );
    if (!differs) continue;
    messageDifferences += 1;
    if (mismatches.length < maxSample) {
      mismatches.push('  楼层 ' + message.messageId + ' [' + message.role + ']：' +
        'SelectedMks=' + formatMk(stored, hasSlot) + '；消息 MK=' + formatMk(message.mk, true) +
        (message.swipeMk !== undefined && message.swipeMk !== message.mk
          ? '；激活 swipe MK=' + formatMk(message.swipeMk, true) : ''));
    }
  }
  // 数组里残留不属于任何消息的 MK（包括多出来的 null）也要报告。
  for (let index = 0; index < restored.length; index += 1) {
    if (seen.has(index)) continue;
    messageDifferences += 1;
    if (mismatches.length < maxSample) {
      mismatches.push('  楼层 ' + index + '：SelectedMks=' + displaySlot(restored, index) +
        '；聊天中没有对应消息');
    }
  }
  lines.push('恢复 SelectedMks / 实际消息不一致：' + messageDifferences + ' 处');
  lines.push(...mismatches);
  if (messageDifferences > mismatches.length) {
    lines.push('  其余 ' + (messageDifferences - mismatches.length) + ' 处省略');
  }
  return lines;
}
