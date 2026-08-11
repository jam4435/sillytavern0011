import type { VariableDeclaredChange } from './variableChanges';

export const WORLD_TIME_FIELDS = ['年', '月', '日', '时', '分'] as const;

export type WorldTimeField = (typeof WORLD_TIME_FIELDS)[number];
export type WorldTimeTuple = Record<WorldTimeField, number>;

export type WorldTimeGuardErrorCode =
  | 'baseline-invalid'
  | 'event-end-invalid'
  | 'declared-action-invalid'
  | 'unsupported-time-path'
  | 'delete-required-field'
  | 'incomplete-time-update'
  | 'invalid-time-value'
  | 'time-not-forward'
  | 'event-end-exceeded';

export type WorldTimeGuardResult =
  | {
      ok: true;
      hasTimeUpdate: boolean;
      baseline: WorldTimeTuple;
      candidate: WorldTimeTuple | null;
      eventEnd: WorldTimeTuple | null;
      timeChanges: VariableDeclaredChange[];
      nonTimeChanges: VariableDeclaredChange[];
    }
  | {
      ok: false;
      code: WorldTimeGuardErrorCode;
      reason: string;
      baseline: WorldTimeTuple | null;
      candidate: WorldTimeTuple | null;
      eventEnd: WorldTimeTuple | null;
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
  return (((time.年 * 12 + (time.月 - 1)) * 30 + (time.日 - 1)) * 24 + time.时) * 60 + time.分;
}

function addWorldTimeMinutes(time: WorldTimeTuple, minutes: number): WorldTimeTuple | null {
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  let remaining = worldTimeToOrdinalMinutes(time) + minutes;
  const minute = remaining % 60;
  remaining = Math.floor(remaining / 60);
  const hour = remaining % 24;
  remaining = Math.floor(remaining / 24);
  const day = (remaining % 30) + 1;
  remaining = Math.floor(remaining / 30);
  const month = (remaining % 12) + 1;
  const year = Math.floor(remaining / 12);
  return validateWorldTimeSource({ 年: year, 月: month, 日: day, 时: hour, 分: minute }, false);
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
  eventEnd: rawEventEnd,
}: {
  baseline: WorldTimeSource;
  declaredChanges: VariableDeclaredChange[];
  thoughts: readonly { text: string }[];
  eventEnd?: WorldTimeSource;
}): WorldTimeCompletionTargetResult {
  const baseline = validateWorldTimeSource(rawBaseline, true);
  if (!baseline) return { ok: false, reason: '当前世界时间无效，无法锁定原声明的目标时间。' };
  const eventEnd = rawEventEnd ? validateWorldTimeSource(rawEventEnd, true) : null;
  if (rawEventEnd && !eventEnd) return { ok: false, reason: '进行中事件结束边界无效，无法锁定目标时间。' };

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

  if (eventEnd && compareWorldTime(target, eventEnd) > 0) {
    return {
      ok: false,
      reason: `原声明锁定的新时间 ${formatWorldTime(target)} 超过事件结束边界 ${formatWorldTime(eventEnd)}，不能靠改变耗时修复。`,
    };
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

export function findEarliestRunningEventEnd(statData: Record<string, unknown>): WorldTimeTuple | null {
  const eventSystem = isRecord(statData.事件系统) ? statData.事件系统 : null;
  const runningEvents = eventSystem && isRecord(eventSystem.进行中事件) ? eventSystem.进行中事件 : null;
  const participationEvents = isRecord(statData.参与事件) ? statData.参与事件 : null;
  if (!runningEvents || !participationEvents) return null;
  const participationNames = new Set(Object.keys(participationEvents).filter(name => !name.startsWith('$')));
  if (participationNames.size === 0) return null;

  let earliest: WorldTimeTuple | null = null;
  for (const [eventName, rawEnd] of Object.entries(runningEvents)) {
    if (!participationNames.has(eventName)) continue;
    const end = isRecord(rawEnd) ? validateWorldTimeSource(rawEnd, true) : null;
    if (!end) continue;
    if (!earliest || compareWorldTime(end, earliest) < 0) earliest = end;
  }
  return earliest;
}

function createFailure(
  code: WorldTimeGuardErrorCode,
  reason: string,
  context: {
    baseline: WorldTimeTuple | null;
    candidate: WorldTimeTuple | null;
    eventEnd: WorldTimeTuple | null;
    timeChanges: VariableDeclaredChange[];
    nonTimeChanges: VariableDeclaredChange[];
  },
): WorldTimeGuardResult {
  return { ok: false, code, reason, ...context };
}

export function validateWorldTimePatch({
  baseline: rawBaseline,
  declaredChanges,
  eventEnd: rawEventEnd,
}: {
  baseline: WorldTimeSource;
  declaredChanges: VariableDeclaredChange[];
  eventEnd?: WorldTimeSource;
}): WorldTimeGuardResult {
  const timeChanges = declaredChanges.filter(change => isWorldTimePath(change.path));
  const nonTimeChanges = declaredChanges.filter(change => !isWorldTimePath(change.path));
  const baseline = validateWorldTimeSource(rawBaseline, true);
  const eventEnd = rawEventEnd ? validateWorldTimeSource(rawEventEnd, true) : null;
  const baseContext = { baseline, candidate: null, eventEnd, timeChanges, nonTimeChanges };

  if (!baseline) {
    return createFailure('baseline-invalid', '当前世界时间不是合法的年/月/日/时/分结构，已停止写入。', baseContext);
  }
  if (rawEventEnd && !eventEnd) {
    return createFailure('event-end-invalid', '进行中事件的结束时间无效，无法安全校验事件边界。', baseContext);
  }
  if (timeChanges.length === 0) {
    return {
      ok: true,
      hasTimeUpdate: false,
      baseline,
      candidate: null,
      eventEnd,
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

  for (const field of WORLD_TIME_FIELDS) {
    const change = latestByField.get(field);
    if (!change) {
      return createFailure(
        'incomplete-time-update',
        `世界时间必须原子更新年/月/日/时/分五个字段，当前缺少“${field}”。`,
        baseContext,
      );
    }
    if (change.action === 'delete') {
      return createFailure('delete-required-field', `世界时间必需字段“${field}”不允许删除。`, baseContext);
    }
  }

  const candidateSource = Object.fromEntries(
    WORLD_TIME_FIELDS.map(field => [field, latestByField.get(field)?.value]),
  ) as Partial<Record<WorldTimeField, unknown>>;
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
  if (eventEnd && compareWorldTime(candidate, eventEnd) > 0) {
    return createFailure(
      'event-end-exceeded',
      `新时间 ${formatWorldTime(candidate)} 超过当前进行中事件的最早结束边界 ${formatWorldTime(eventEnd)}。`,
      candidateContext,
    );
  }

  return {
    ok: true,
    hasTimeUpdate: true,
    baseline,
    candidate,
    eventEnd,
    timeChanges,
    nonTimeChanges,
  };
}
