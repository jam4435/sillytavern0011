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
