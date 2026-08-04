export type EventOutcomeStatus = '原定' | '偏离' | '未知';

export interface WorldEventTime {
  年?: number;
  月?: number;
  日?: number;
  时?: number;
}

export interface WorldEventRecord {
  时间: WorldEventTime;
  地点: string;
  概要: string;
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeComparableValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('$'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalizeComparableValue(child)]),
  );
}

function comparableJson(value: unknown): string {
  return JSON.stringify(normalizeComparableValue(value ?? {}));
}

export function hasEventOutcomeChanged(participationEntry: unknown, eventDefinition: unknown): boolean {
  if (!isRecord(participationEntry) || !isRecord(eventDefinition)) {
    return true;
  }

  const currentEnding = typeof participationEntry.结局 === 'string' ? participationEntry.结局.trim() : '';
  const originalEnding = typeof eventDefinition.事件概要 === 'string' ? eventDefinition.事件概要.trim() : '';
  if (currentEnding !== originalEnding) {
    return true;
  }

  if (comparableJson(participationEntry.分支标记) !== comparableJson(eventDefinition.分支标记)) {
    return true;
  }

  return ['insert', 'update', 'delete'].some(
    action => comparableJson(participationEntry[action]) !== comparableJson(eventDefinition[action]),
  );
}

export function haveEventDiffsChanged(participationEntry: unknown, eventDefinition: unknown): boolean {
  if (!isRecord(participationEntry) || !isRecord(eventDefinition)) {
    return true;
  }

  return ['insert', 'update', 'delete'].some(
    action => comparableJson(participationEntry[action]) !== comparableJson(eventDefinition[action]),
  );
}

export function isWorldEventRecord(value: unknown): value is WorldEventRecord {
  return (
    isRecord(value) &&
    isRecord(value.时间) &&
    typeof value.地点 === 'string' &&
    typeof value.概要 === 'string' &&
    value.概要.trim().length > 0
  );
}

function getTimeSortValue(value: WorldEventRecord): number {
  const time = value.时间;
  const year = Number.isFinite(time.年) ? Number(time.年) : 0;
  const month = Number.isFinite(time.月) ? Number(time.月) : 0;
  const day = Number.isFinite(time.日) ? Number(time.日) : 0;
  const hour = Number.isFinite(time.时) ? Number(time.时) : 0;
  return year * 1_000_000 + month * 10_000 + day * 100 + hour;
}

export function selectWorldEventsForPrompt(
  worldEvents: unknown,
  outcomeStatuses: unknown,
  { limit = 16, priorityLimit = 8 }: { limit?: number; priorityLimit?: number } = {},
): Record<string, WorldEventRecord> {
  if (!isRecord(worldEvents) || limit <= 0) {
    return {};
  }

  const statuses = isRecord(outcomeStatuses) ? outcomeStatuses : {};
  const records = Object.entries(worldEvents)
    .filter((entry): entry is [string, WorldEventRecord] => isWorldEventRecord(entry[1]))
    .sort((left, right) => {
      const timeDiff = getTimeSortValue(right[1]) - getTimeSortValue(left[1]);
      return timeDiff || left[0].localeCompare(right[0]);
    });

  const selected = new Map<string, WorldEventRecord>();
  for (const [eventName, record] of records) {
    if (selected.size >= Math.min(priorityLimit, limit)) break;
    if (statuses[eventName] === '偏离' || statuses[eventName] === '未知') {
      selected.set(eventName, record);
    }
  }

  for (const [eventName, record] of records) {
    if (selected.size >= limit) break;
    selected.set(eventName, record);
  }

  return Object.fromEntries(
    [...selected.entries()].sort((left, right) => {
      const timeDiff = getTimeSortValue(left[1]) - getTimeSortValue(right[1]);
      return timeDiff || left[0].localeCompare(right[0]);
    }),
  );
}
