import type { VariableDeclaredChange } from './variableChanges';
import {
  totalMinutesToWuxiaCalendarTime,
  wuxiaCalendarTimeToTotalMinutes,
} from '../../shared/wuxiaCalendar.js';

export const WORLD_TIME_FIELDS = ['年', '月', '日', '时', '分'] as const;

export type WorldTimeField = (typeof WORLD_TIME_FIELDS)[number];
export type WorldTimeTuple = Record<WorldTimeField, number>;

export type WorldTimeGuardErrorCode =
  | 'baseline-invalid'
  | 'declared-action-invalid'
  | 'unsupported-time-path'
  | 'delete-required-field'
  | 'incomplete-time-update'
  | 'invalid-time-value'
  | 'time-not-forward';

export type WorldTimeGuardResult =
  | {
      ok: true;
      hasTimeUpdate: boolean;
      baseline: WorldTimeTuple;
      candidate: WorldTimeTuple | null;
      timeChanges: VariableDeclaredChange[];
      nonTimeChanges: VariableDeclaredChange[];
    }
  | {
      ok: false;
      code: WorldTimeGuardErrorCode;
      reason: string;
      baseline: WorldTimeTuple | null;
      candidate: WorldTimeTuple | null;
      timeChanges: VariableDeclaredChange[];
      nonTimeChanges: VariableDeclaredChange[];
    };

export type WorldTimeCompletionTargetResult =
  | {
      ok: true;
      baseline: WorldTimeTuple;
      target: WorldTimeTuple;
      elapsedMinutes: number;
      source: 'declared-duration' | 'declared-fields';
    }
  | {
      ok: false;
      reason: string;
    };

type WorldTimeSource = Partial<Record<WorldTimeField, unknown>> | null | undefined;

const TIME_PATH_PREFIX = ['世界信息', '时间'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isWorldTimePath(path: readonly (string | number)[]): boolean {
  return path[0] === TIME_PATH_PREFIX[0] && path[1] === TIME_PATH_PREFIX[1];
}

function formatWorldTime(time: WorldTimeTuple | null): string {
  if (!time) return '（不可用）';
  return `${time.年}年${time.月}月${time.日}日${time.时}时${String(time.分).padStart(2, '0')}分`;
}

function readInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function validateWorldTimeSource(source: WorldTimeSource, allowMissingMinute: boolean): WorldTimeTuple | null {
  if (!source || typeof source !== 'object') return null;
  const year = readInteger(source.年);
  const month = readInteger(source.月);
  const day = readInteger(source.日);
  const hour = readInteger(source.时);
  const rawMinute = source.分;
  const minute = rawMinute === undefined && allowMissingMinute ? 0 : readInteger(rawMinute);
  if (year === null || month === null || day === null || hour === null || minute === null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 30 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { 年: year, 月: month, 日: day, 时: hour, 分: minute };
}

function worldTimeToOrdinalMinutes(time: WorldTimeTuple): number {
  return wuxiaCalendarTimeToTotalMinutes(time);
}

function addWorldTimeMinutes(time: WorldTimeTuple, minutes: number): WorldTimeTuple | null {
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  return validateWorldTimeSource(totalMinutesToWuxiaCalendarTime(worldTimeToOrdinalMinutes(time) + minutes), false);
}

function collectDeclaredElapsedMinutes(thoughts: readonly { text: string }[]): number[] {
  const durations = new Set<number>();
  const patterns = [
    /耗时(?:约|大约)?\s*(?:(\d+)\s*(?:小时|时))?\s*(?:(\d+)\s*分(?:钟)?)?/g,
    /\+\s*(?:(\d+)\s*(?:小时|时))?\s*(?:(\d+)\s*分(?:钟)?)\s*=/g,
  ];
  for (const thought of thoughts) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of thought.text.matchAll(pattern)) {
        const hours = match[1] ? Number(match[1]) : 0;
        const minutes = match[2] ? Number(match[2]) : 0;
        const total = hours * 60 + minutes;
        if (Number.isInteger(total) && total > 0) durations.add(total);
      }
    }
  }
  return [...durations];
}

/**
 * 锁定稀疏时间声明原本表达的目标，只允许后续纠错补全字段，不能重新估算正文耗时。
 */
export function resolveWorldTimeCompletionTarget({
  baseline: rawBaseline,
  declaredChanges,
  thoughts,
}: {
  baseline: WorldTimeSource;
  declaredChanges: VariableDeclaredChange[];
  thoughts: readonly { text: string }[];
}): WorldTimeCompletionTargetResult {
  const baseline = validateWorldTimeSource(rawBaseline, true);
  if (!baseline) return { ok: false, reason: '当前世界时间无效，无法锁定原声明的目标时间。' };

  const latestByField = new Map<WorldTimeField, VariableDeclaredChange>();
  for (const change of declaredChanges.filter(item => isWorldTimePath(item.path))) {
    if (change.path.length !== 3 || !WORLD_TIME_FIELDS.includes(change.path[2] as WorldTimeField)) {
      return { ok: false, reason: `时间声明包含不支持的路径 ${change.displayPath}。` };
    }
    if (change.action === 'delete') {
      return { ok: false, reason: `时间必需字段 ${change.displayPath} 不允许删除。` };
    }
    latestByField.set(change.path[2] as WorldTimeField, change);
  }
  if (latestByField.size === 0) return { ok: false, reason: '原回复没有可用于补全的世界时间叶子。' };

  const overlaySource = { ...baseline } as Record<WorldTimeField, unknown>;
  for (const [field, change] of latestByField) overlaySource[field] = change.value;
  const overlay = validateWorldTimeSource(overlaySource, false);
  if (!overlay) return { ok: false, reason: '原时间叶子包含非整数或越界值，不能通过补全其他字段修复。' };

  const declaredDurations = collectDeclaredElapsedMinutes(thoughts);
  if (declaredDurations.length > 1) {
    return { ok: false, reason: `原 VariableThink 声明了互相冲突的耗时：${declaredDurations.join('、')} 分钟。` };
  }

  let target: WorldTimeTuple;
  let source: 'declared-duration' | 'declared-fields';
  if (declaredDurations.length === 1) {
    const declaredDuration = declaredDurations[0];
    const durationTarget = addWorldTimeMinutes(baseline, declaredDuration);
    if (!durationTarget) return { ok: false, reason: '原 VariableThink 声明的耗时无效。' };
    for (const [field, change] of latestByField) {
      if (change.value !== durationTarget[field]) {
        return {
          ok: false,
          reason: `原耗时锁定的新时间为 ${formatWorldTime(durationTarget)}，但原叶子“${field}”声明为 ${String(change.value)}，二者冲突。`,
        };
      }
    }
    target = durationTarget;
    source = 'declared-duration';
  } else {
    if (compareWorldTime(overlay, baseline) <= 0) {
      return {
        ok: false,
        reason: `原稀疏叶子覆盖后得到 ${formatWorldTime(overlay)}，且未声明可解析耗时，无法在不猜测进位的前提下补全。`,
      };
    }
    target = overlay;
    source = 'declared-fields';
  }

  return {
    ok: true,
    baseline,
    target,
    elapsedMinutes: worldTimeToOrdinalMinutes(target) - worldTimeToOrdinalMinutes(baseline),
    source,
  };
}

export function compareWorldTime(left: WorldTimeTuple, right: WorldTimeTuple): number {
  for (const field of WORLD_TIME_FIELDS) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
  }
  return 0;
}

function createFailure(
  code: WorldTimeGuardErrorCode,
  reason: string,
  context: {
    baseline: WorldTimeTuple | null;
    candidate: WorldTimeTuple | null;
    timeChanges: VariableDeclaredChange[];
    nonTimeChanges: VariableDeclaredChange[];
  },
): WorldTimeGuardResult {
  return { ok: false, code, reason, ...context };
}

export function validateWorldTimePatch({
  baseline: rawBaseline,
  declaredChanges,
}: {
  baseline: WorldTimeSource;
  declaredChanges: VariableDeclaredChange[];
}): WorldTimeGuardResult {
  const timeChanges = declaredChanges.filter(change => isWorldTimePath(change.path));
  const nonTimeChanges = declaredChanges.filter(change => !isWorldTimePath(change.path));
  const baseline = validateWorldTimeSource(rawBaseline, true);
  const baseContext = { baseline, candidate: null, timeChanges, nonTimeChanges };

  if (!baseline) {
    return createFailure('baseline-invalid', '当前世界时间不是合法的年/月/日/时/分结构，已停止写入。', baseContext);
  }
  if (timeChanges.length === 0) {
    return {
      ok: true,
      hasTimeUpdate: false,
      baseline,
      candidate: null,
      timeChanges,
      nonTimeChanges,
    };
  }

  const latestByField = new Map<WorldTimeField, VariableDeclaredChange>();
  for (const change of timeChanges) {
    if (change.path.length !== 3 || !WORLD_TIME_FIELDS.includes(change.path[2] as WorldTimeField)) {
      return createFailure(
        'unsupported-time-path',
        `时间只允许写入完整的年/月/日/时/分叶子，不支持路径 ${change.displayPath}。`,
        baseContext,
      );
    }
    const field = change.path[2] as WorldTimeField;
    latestByField.set(field, change);
  }

  for (const [field, change] of latestByField) {
    if (change.action === 'delete') {
      return createFailure('delete-required-field', `世界时间必需字段“${field}”不允许删除。`, baseContext);
    }
  }

  const candidateSource = { ...baseline } as Partial<Record<WorldTimeField, unknown>>;
  for (const [field, change] of latestByField) candidateSource[field] = change.value;
  const candidate = validateWorldTimeSource(candidateSource, false);
  const candidateContext = { ...baseContext, candidate };
  if (!candidate) {
    return createFailure(
      'invalid-time-value',
      '世界时间必须使用整数，且月为1–12、日为1–30、时为0–23、分为0–59。',
      candidateContext,
    );
  }
  if (compareWorldTime(candidate, baseline) <= 0) {
    return createFailure(
      'time-not-forward',
      `新时间 ${formatWorldTime(candidate)} 必须严格晚于当前时间 ${formatWorldTime(baseline)}，禁止回拨或无意义原值更新。`,
      candidateContext,
    );
  }
  return {
    ok: true,
    hasTimeUpdate: true,
    baseline,
    candidate,
    timeChanges,
    nonTimeChanges,
  };
}
