import type { DirectVariableWriteSource } from '../../shared/directVariableWrite';

export type VariablePath = Array<string | number>;
export type VariableChangeAction = 'insert' | 'edit' | 'delete';
export type VariableChangeOrigin = 'ai' | 'background';
export type VariableChangeProducer =
  | DirectVariableWriteSource
  | 'era'
  | 'message-boundary';
export type VariableChangeSource = 'ai-declared' | 'observed-diff';
export type VariableComparisonStatus = 'applied' | 'not-applied' | 'diverged' | 'no-op' | 'api-only';
export type VariableChangeStatus = 'tracking' | 'reply-recorded' | 'settled' | 'error';
export type VariableWriteActions = Record<string, boolean>;

export interface VariableThoughtEntry {
  id: string;
  text: string;
  preview: string;
}

export interface VariableDeclaredChange {
  id: string;
  source: 'ai-declared';
  action: VariableChangeAction;
  path: VariablePath;
  displayPath: string;
  copyPath: string;
  value: unknown;
  valuePreview: string;
  blockTag: 'VariableInsert' | 'VariableEdit' | 'VariableDelete';
}

export interface VariableActualChange {
  id: string;
  source: 'observed-diff';
  origin: VariableChangeOrigin;
  producer: VariableChangeProducer;
  action: VariableChangeAction;
  path: VariablePath;
  displayPath: string;
  copyPath: string;
  beforeValue: unknown;
  afterValue: unknown;
  beforePreview: string;
  afterPreview: string;
  timestamp: number;
  batchId: string;
  actions: VariableWriteActions | null;
  reason: string | null;
  assistantMessageId?: number;
}

export interface VariableObservedBatch {
  batchId: string;
  origin: VariableChangeOrigin;
  producer: VariableChangeProducer;
  timestamp: number;
  reason: string | null;
  actions: VariableWriteActions | null;
  assistantMessageId?: number;
  previousSnapshotHash: string;
  nextSnapshotHash: string;
  changeCount: number;
}

export interface VariableAiComparison {
  id: string;
  status: VariableComparisonStatus;
  action: VariableChangeAction;
  path: VariablePath;
  displayPath: string;
  copyPath: string;
  declaredChange?: VariableDeclaredChange;
  observedChange?: VariableActualChange;
  baselineValue: unknown;
  expectedValue: unknown;
  finalValue: unknown;
  baselinePreview: string;
  expectedPreview: string;
  finalPreview: string;
}

export interface ParsedDeclaredVariableChanges {
  declaredChanges: VariableDeclaredChange[];
  thoughts: VariableThoughtEntry[];
  parseErrors: string[];
  omittedDeclaredCount: number;
}

export interface ObservedVariableChangesResult {
  observedChanges: VariableActualChange[];
  omittedObservedCount: number;
  totalObservedCount: number;
  batch: VariableObservedBatch | null;
  previousSnapshotHash: string | null;
  nextSnapshotHash: string | null;
}

export interface VariableObservedDiffCandidate {
  action: VariableChangeAction;
  path: VariablePath;
  beforeValue: unknown;
  afterValue: unknown;
}

export interface ObservedVariableChangeBucket {
  observedChanges: VariableActualChange[];
  omittedObservedCount: number;
  totalObservedCount: number;
}

export interface BucketedObservedVariableChangesResult {
  ai: ObservedVariableChangeBucket;
  background: ObservedVariableChangeBucket;
  totalObservedCount: number;
  batch: VariableObservedBatch | null;
  previousSnapshotHash: string | null;
  nextSnapshotHash: string | null;
}

export interface VariableAiComparisonResult {
  comparisons: VariableAiComparison[];
  omittedComparisonCount: number;
}

export interface VariableAiReplySummary {
  declaredChanges: VariableDeclaredChange[];
  observedChanges: VariableActualChange[];
  comparisons: VariableAiComparison[];
  omittedDeclaredCount: number;
  omittedObservedCount: number;
  omittedComparisonCount: number;
}

export interface VariableBackgroundSummary {
  observedChanges: VariableActualChange[];
  omittedObservedCount: number;
}

export interface VariableChangeSummary {
  turnId: number;
  status: VariableChangeStatus;
  userMessageId?: number;
  assistantMessageId?: number;
  startedAt: number;
  updatedAt: number;
  thoughts: VariableThoughtEntry[];
  parseErrors: string[];
  topLevelGroups: string[];
  aiReply: VariableAiReplySummary;
  background: VariableBackgroundSummary;
  batches: VariableObservedBatch[];
  declaredChanges: VariableDeclaredChange[];
  actualChanges: VariableActualChange[];
  omittedDeclaredCount: number;
  omittedActualCount: number;
}

const HIDDEN_VARIABLE_KEYS = new Set(['$meta', '$template']);
const VARIABLE_BLOCK_REGEX = /<(VariableThink|VariableInsert|VariableEdit|VariableDelete)>\s*([\s\S]*?)\s*<\/\1>/gi;
export const MAX_STORED_VARIABLE_CHANGES = 100;

const ACTION_BY_BLOCK_TAG: Record<'VariableInsert' | 'VariableEdit' | 'VariableDelete', VariableChangeAction> = {
  VariableInsert: 'insert',
  VariableEdit: 'edit',
  VariableDelete: 'delete',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isContainer = (value: unknown): boolean => Array.isArray(value) || isRecord(value);

const isHiddenVariableKey = (key: string | number): boolean =>
  typeof key === 'string' && HIDDEN_VARIABLE_KEYS.has(key);

const stripCodeFence = (text: string): string =>
  text
    .trim()
    .replace(/^\s*(?:```|~~~)[a-zA-Z0-9_-]*\s*\r?\n/, '')
    .replace(/\r?\n(?:```|~~~)\s*$/, '')
    .trim();

const cloneJson = <T,>(value: T): T => {
  if (value === undefined) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

export const getSnapshotHash = (value: unknown): string => stableStringify(value);

const areValuesEqual = (left: unknown, right: unknown): boolean =>
  stableStringify(left) === stableStringify(right);

const normalizeWriteActions = (actions: VariableWriteActions | null | undefined): VariableWriteActions | null => {
  if (!actions || !isRecord(actions)) {
    return null;
  }

  const normalizedEntries = Object.entries(actions)
    .filter(([, enabled]) => enabled === true)
    .sort(([left], [right]) => left.localeCompare(right));
  if (normalizedEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(normalizedEntries);
};

const getVisibleEntries = (value: unknown): Array<[string | number, unknown]> => {
  if (Array.isArray(value)) {
    return value.map((item, index) => [index, item]);
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).filter(([key]) => !isHiddenVariableKey(key));
};

const getVariablePathId = (path: VariablePath): string =>
  path.map(segment => String(segment)).join('.');

const getVariableBlockId = (
  source: VariableChangeSource,
  action: VariableChangeAction,
  path: VariablePath,
  index: number,
): string => `${source}:${action}:${getVariablePathId(path)}:${index}`;

export const getVariableDisplayPath = (path: VariablePath): string =>
  ['stat_data', ...path.map(segment => String(segment))].join(' › ');

const formatCopyPathSegment = (segment: string | number): string => {
  if (typeof segment === 'number') {
    return `[${segment}]`;
  }

  return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(segment)
    ? `.${segment}`
    : `[${JSON.stringify(segment)}]`;
};

export const getVariableCopyPath = (path: VariablePath): string =>
  path.reduce<string>((copyPath, segment) => `${copyPath}${formatCopyPathSegment(segment)}`, 'stat_data');

export const formatVariablePreview = (value: unknown, maxLength = 120): string => {
  if (Array.isArray(value)) {
    return `数组 ${getVisibleEntries(value).length}`;
  }

  if (isRecord(value)) {
    return `对象 ${getVisibleEntries(value).length}`;
  }

  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return '未定义';
  }

  if (typeof value === 'string') {
    const compactValue = value.replace(/\s+/g, ' ').trim();
    if (!compactValue) {
      return '空文本';
    }
    return compactValue.length > maxLength ? `${compactValue.slice(0, maxLength)}...` : compactValue;
  }

  return String(value);
};

export const formatVariableDetailValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return formatVariablePreview(value);
  }
};

const extractStatData = (source: unknown): Record<string, unknown> | null => {
  if (!isRecord(source)) {
    return null;
  }

  if (isRecord(source.stat_data)) {
    return source.stat_data;
  }

  return source;
};

const getValueAtPath = (source: unknown, path: VariablePath): unknown => {
  let current: unknown = source;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
      continue;
    }
    if (isRecord(current)) {
      current = current[String(segment)];
      continue;
    }
    return undefined;
  }
  return current;
};

const normalizeObservedAction = (beforeValue: unknown, afterValue: unknown): VariableChangeAction => {
  if (beforeValue === undefined) {
    return 'insert';
  }
  if (afterValue === undefined) {
    return 'delete';
  }
  return 'edit';
};

export const readCurrentStatDataSnapshot = (): Record<string, unknown> | null => {
  try {
    const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    const statData = extractStatData(variables);
    return statData ? cloneJson(statData) : null;
  } catch {
    return null;
  }
};

// Callers must only use this for sources that already match chat stat_data's encoded representation.
export const readStatDataSnapshotFromUnknown = (source: unknown): Record<string, unknown> | null => {
  const statData = extractStatData(source);
  return statData ? cloneJson(statData) : null;
};

export const createEmptyVariableChangeSummary = (
  turnId: number,
  status: VariableChangeStatus,
): VariableChangeSummary => {
  const now = Date.now();
  return {
    turnId,
    status,
    startedAt: now,
    updatedAt: now,
    thoughts: [],
    parseErrors: [],
    topLevelGroups: [],
    aiReply: {
      declaredChanges: [],
      observedChanges: [],
      comparisons: [],
      omittedDeclaredCount: 0,
      omittedObservedCount: 0,
      omittedComparisonCount: 0,
    },
    background: {
      observedChanges: [],
      omittedObservedCount: 0,
    },
    batches: [],
    declaredChanges: [],
    actualChanges: [],
    omittedDeclaredCount: 0,
    omittedActualCount: 0,
  };
};

const createDeclaredChange = (
  action: VariableChangeAction,
  blockTag: 'VariableInsert' | 'VariableEdit' | 'VariableDelete',
  path: VariablePath,
  value: unknown,
  index: number,
): VariableDeclaredChange => ({
  id: getVariableBlockId('ai-declared', action, path, index),
  source: 'ai-declared',
  action,
  path,
  displayPath: getVariableDisplayPath(path),
  copyPath: getVariableCopyPath(path),
  value,
  valuePreview: formatVariablePreview(value),
  blockTag,
});

function collectDeclaredLeafChanges(
  blockTag: 'VariableInsert' | 'VariableEdit' | 'VariableDelete',
  value: unknown,
  path: VariablePath,
  result: VariableDeclaredChange[],
  counters: { total: number },
): void {
  const action = ACTION_BY_BLOCK_TAG[blockTag];
  const entries = getVisibleEntries(value);

  if (action === 'delete') {
    if (!isContainer(value) || entries.length === 0) {
      counters.total += 1;
      if (result.length < MAX_STORED_VARIABLE_CHANGES) {
        result.push(createDeclaredChange(action, blockTag, path, {}, counters.total));
      }
      return;
    }

    for (const [key, childValue] of entries) {
      collectDeclaredLeafChanges(blockTag, childValue, [...path, key], result, counters);
    }
    return;
  }

  if (!isContainer(value) || entries.length === 0) {
    counters.total += 1;
    if (result.length < MAX_STORED_VARIABLE_CHANGES) {
      result.push(createDeclaredChange(action, blockTag, path, value, counters.total));
    }
    return;
  }

  for (const [key, childValue] of entries) {
    collectDeclaredLeafChanges(blockTag, childValue, [...path, key], result, counters);
  }
}

export function parseDeclaredVariableChanges(rawReply: string): ParsedDeclaredVariableChanges {
  const declaredChanges: VariableDeclaredChange[] = [];
  const thoughts: VariableThoughtEntry[] = [];
  const parseErrors: string[] = [];
  const counters = { total: 0 };

  if (!rawReply.trim()) {
    return {
      declaredChanges,
      thoughts,
      parseErrors,
      omittedDeclaredCount: 0,
    };
  }

  VARIABLE_BLOCK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_BLOCK_REGEX.exec(rawReply)) !== null) {
    const blockTag = match[1] as 'VariableThink' | 'VariableInsert' | 'VariableEdit' | 'VariableDelete';
    const blockBody = stripCodeFence(match[2] || '');

    if (blockTag === 'VariableThink') {
      thoughts.push({
        id: `think:${thoughts.length + 1}`,
        text: blockBody,
        preview: formatVariablePreview(blockBody, 160),
      });
      continue;
    }

    if (!blockBody) {
      parseErrors.push(`${blockTag} 为空，无法解析。`);
      continue;
    }

    try {
      const parsed = JSON.parse(blockBody) as unknown;
      if (!isRecord(parsed)) {
        parseErrors.push(`${blockTag} 内容不是对象。`);
        continue;
      }
      collectDeclaredLeafChanges(blockTag, parsed, [], declaredChanges, counters);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      parseErrors.push(`${blockTag} JSON 解析失败：${message}`);
    }
  }

  return {
    declaredChanges,
    thoughts,
    parseErrors,
    omittedDeclaredCount: Math.max(0, counters.total - declaredChanges.length),
  };
}

const createObservedChange = (
  action: VariableChangeAction,
  path: VariablePath,
  beforeValue: unknown,
  afterValue: unknown,
  index: number,
  metadata: {
    origin: VariableChangeOrigin;
    producer: VariableChangeProducer;
    timestamp: number;
    batchId: string;
    actions: VariableWriteActions | null;
    reason: string | null;
    assistantMessageId?: number;
  },
): VariableActualChange => ({
  id: getVariableBlockId('observed-diff', action, path, index),
  source: 'observed-diff',
  origin: metadata.origin,
  producer: metadata.producer,
  action,
  path,
  displayPath: getVariableDisplayPath(path),
  copyPath: getVariableCopyPath(path),
  beforeValue,
  afterValue,
  beforePreview: formatVariablePreview(beforeValue),
  afterPreview: formatVariablePreview(afterValue),
  timestamp: metadata.timestamp,
  batchId: metadata.batchId,
  actions: normalizeWriteActions(metadata.actions),
  reason: metadata.reason,
  assistantMessageId: metadata.assistantMessageId,
});

function pushObservedChange(
  result: VariableActualChange[],
  counters: { total: number },
  action: VariableChangeAction,
  path: VariablePath,
  beforeValue: unknown,
  afterValue: unknown,
  metadata: {
    origin: VariableChangeOrigin;
    producer: VariableChangeProducer;
    timestamp: number;
    batchId: string;
    actions: VariableWriteActions | null;
    reason: string | null;
    assistantMessageId?: number;
  },
): void {
  counters.total += 1;
  if (result.length < MAX_STORED_VARIABLE_CHANGES) {
    result.push(createObservedChange(action, path, beforeValue, afterValue, counters.total, metadata));
  }
}

function visitObservedDiffs(
  beforeValue: unknown,
  afterValue: unknown,
  path: VariablePath,
  visit: (candidate: VariableObservedDiffCandidate) => void,
): void {
  if (areValuesEqual(beforeValue, afterValue)) {
    return;
  }

  const beforeIsContainer = isContainer(beforeValue);
  const afterIsContainer = isContainer(afterValue);

  if (beforeValue === undefined && afterIsContainer) {
    const entries = getVisibleEntries(afterValue);
    if (entries.length === 0) {
      visit({ action: 'insert', path, beforeValue, afterValue });
      return;
    }
    for (const [key, childValue] of entries) {
      visitObservedDiffs(undefined, childValue, [...path, key], visit);
    }
    return;
  }

  if (afterValue === undefined && beforeIsContainer) {
    const entries = getVisibleEntries(beforeValue);
    if (entries.length === 0) {
      visit({ action: 'delete', path, beforeValue, afterValue });
      return;
    }
    for (const [key, childValue] of entries) {
      visitObservedDiffs(childValue, undefined, [...path, key], visit);
    }
    return;
  }

  if (!beforeIsContainer || !afterIsContainer || Array.isArray(beforeValue) !== Array.isArray(afterValue)) {
    visit({
      action: normalizeObservedAction(beforeValue, afterValue),
      path,
      beforeValue,
      afterValue,
    });
    return;
  }

  const keySet = new Set<string | number>();
  for (const [key] of getVisibleEntries(beforeValue)) {
    keySet.add(key);
  }
  for (const [key] of getVisibleEntries(afterValue)) {
    keySet.add(key);
  }

  for (const key of keySet) {
    if (isHiddenVariableKey(key)) {
      continue;
    }

    const beforeRecord = beforeValue as Record<string, unknown> | unknown[];
    const afterRecord = afterValue as Record<string, unknown> | unknown[];
    const beforeChild = Array.isArray(beforeRecord) && typeof key === 'number'
      ? beforeRecord[key]
      : (beforeRecord as Record<string, unknown>)[String(key)];
    const afterChild = Array.isArray(afterRecord) && typeof key === 'number'
      ? afterRecord[key]
      : (afterRecord as Record<string, unknown>)[String(key)];

    visitObservedDiffs(beforeChild, afterChild, [...path, key], visit);
  }
}

function collectObservedDiffs(
  beforeValue: unknown,
  afterValue: unknown,
  path: VariablePath,
  result: VariableActualChange[],
  counters: { total: number },
  metadata: {
    origin: VariableChangeOrigin;
    producer: VariableChangeProducer;
    timestamp: number;
    batchId: string;
    actions: VariableWriteActions | null;
    reason: string | null;
    assistantMessageId?: number;
  },
): void {
  visitObservedDiffs(beforeValue, afterValue, path, candidate => {
    pushObservedChange(
      result,
      counters,
      candidate.action,
      candidate.path,
      candidate.beforeValue,
      candidate.afterValue,
      metadata,
    );
  });
}

export function createObservedVariableChanges(
  previousStatData: Record<string, unknown> | null,
  nextStatData: Record<string, unknown> | null,
  metadata: {
    origin: VariableChangeOrigin;
    producer: VariableChangeProducer;
    timestamp: number;
    batchId: string;
    actions?: VariableWriteActions | null;
    reason?: string | null;
    assistantMessageId?: number;
  },
): ObservedVariableChangesResult {
  const observedChanges: VariableActualChange[] = [];
  const previousSnapshotHash = previousStatData ? getSnapshotHash(previousStatData) : null;
  const nextSnapshotHash = nextStatData ? getSnapshotHash(nextStatData) : null;

  if (!previousStatData || !nextStatData) {
    return {
      observedChanges,
      omittedObservedCount: 0,
      totalObservedCount: 0,
      batch: null,
      previousSnapshotHash,
      nextSnapshotHash,
    };
  }

  const counters = { total: 0 };
  const normalizedMetadata = {
    origin: metadata.origin,
    producer: metadata.producer,
    timestamp: metadata.timestamp,
    batchId: metadata.batchId,
    actions: normalizeWriteActions(metadata.actions),
    reason: metadata.reason ?? null,
    assistantMessageId: metadata.assistantMessageId,
  };

  collectObservedDiffs(previousStatData, nextStatData, [], observedChanges, counters, normalizedMetadata);
  return {
    observedChanges,
    omittedObservedCount: Math.max(0, counters.total - observedChanges.length),
    totalObservedCount: counters.total,
    batch: counters.total > 0 && previousSnapshotHash && nextSnapshotHash
      ? {
        batchId: metadata.batchId,
        origin: metadata.origin,
        producer: metadata.producer,
        timestamp: metadata.timestamp,
        reason: metadata.reason ?? null,
        actions: normalizedMetadata.actions,
        assistantMessageId: metadata.assistantMessageId,
        previousSnapshotHash,
        nextSnapshotHash,
        changeCount: counters.total,
      }
      : null,
    previousSnapshotHash,
    nextSnapshotHash,
  };
}

export function createBucketedObservedVariableChanges(
  previousStatData: Record<string, unknown> | null,
  nextStatData: Record<string, unknown> | null,
  metadata: {
    origin: VariableChangeOrigin;
    producer: VariableChangeProducer;
    timestamp: number;
    batchId: string;
    actions?: VariableWriteActions | null;
    reason?: string | null;
    assistantMessageId?: number;
  },
  classify: (candidate: VariableObservedDiffCandidate) => VariableChangeOrigin,
): BucketedObservedVariableChangesResult {
  const previousSnapshotHash = previousStatData ? getSnapshotHash(previousStatData) : null;
  const nextSnapshotHash = nextStatData ? getSnapshotHash(nextStatData) : null;
  const emptyBucket = (): ObservedVariableChangeBucket => ({
    observedChanges: [],
    omittedObservedCount: 0,
    totalObservedCount: 0,
  });
  const buckets: Record<VariableChangeOrigin, ObservedVariableChangeBucket> = {
    ai: emptyBucket(),
    background: emptyBucket(),
  };

  if (!previousStatData || !nextStatData) {
    return {
      ai: buckets.ai,
      background: buckets.background,
      totalObservedCount: 0,
      batch: null,
      previousSnapshotHash,
      nextSnapshotHash,
    };
  }

  const normalizedMetadata = {
    origin: metadata.origin,
    producer: metadata.producer,
    timestamp: metadata.timestamp,
    batchId: metadata.batchId,
    actions: normalizeWriteActions(metadata.actions),
    reason: metadata.reason ?? null,
    assistantMessageId: metadata.assistantMessageId,
  };
  let totalObservedCount = 0;

  visitObservedDiffs(previousStatData, nextStatData, [], candidate => {
    totalObservedCount += 1;
    const origin = classify(candidate);
    const bucket = buckets[origin];
    bucket.totalObservedCount += 1;

    if (bucket.observedChanges.length < MAX_STORED_VARIABLE_CHANGES) {
      bucket.observedChanges.push(createObservedChange(
        candidate.action,
        candidate.path,
        candidate.beforeValue,
        candidate.afterValue,
        bucket.totalObservedCount,
        {
          ...normalizedMetadata,
          origin,
        },
      ));
    }
  });

  for (const bucket of Object.values(buckets)) {
    bucket.omittedObservedCount = Math.max(0, bucket.totalObservedCount - bucket.observedChanges.length);
  }

  return {
    ai: buckets.ai,
    background: buckets.background,
    totalObservedCount,
    batch: totalObservedCount > 0 && previousSnapshotHash && nextSnapshotHash
      ? {
        batchId: metadata.batchId,
        origin: metadata.origin,
        producer: metadata.producer,
        timestamp: metadata.timestamp,
        reason: metadata.reason ?? null,
        actions: normalizedMetadata.actions,
        assistantMessageId: metadata.assistantMessageId,
        previousSnapshotHash,
        nextSnapshotHash,
        changeCount: totalObservedCount,
      }
      : null,
    previousSnapshotHash,
    nextSnapshotHash,
  };
}

const aggregateObservedAiChanges = (changes: VariableActualChange[]): Map<string, VariableActualChange> => {
  const result = new Map<string, VariableActualChange>();
  const sortedChanges = [...changes].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    return left.id.localeCompare(right.id);
  });

  for (const change of sortedChanges) {
    const key = getVariablePathId(change.path);
    const previous = result.get(key);
    if (!previous) {
      result.set(key, change);
      continue;
    }

    result.set(key, {
      ...change,
      beforeValue: previous.beforeValue,
      beforePreview: previous.beforePreview,
      action: normalizeObservedAction(previous.beforeValue, change.afterValue),
    });
  }

  return result;
};

export function buildAiComparisons({
  declaredChanges,
  observedChanges,
  baselineStatData,
  currentStatData,
}: {
  declaredChanges: VariableDeclaredChange[];
  observedChanges: VariableActualChange[];
  baselineStatData: Record<string, unknown> | null;
  currentStatData: Record<string, unknown> | null;
}): VariableAiComparisonResult {
  const comparisons: VariableAiComparison[] = [];
  const normalizedBaselineStatData = baselineStatData ? extractStatData(baselineStatData) : null;
  const normalizedCurrentStatData = currentStatData ? extractStatData(currentStatData) : null;
  const declaredByPath = new Map<string, VariableDeclaredChange>();
  const aggregatedObserved = aggregateObservedAiChanges(observedChanges);

  for (const declaredChange of declaredChanges) {
    declaredByPath.set(getVariablePathId(declaredChange.path), declaredChange);
  }

  const pathKeys = new Set<string>([
    ...declaredByPath.keys(),
    ...aggregatedObserved.keys(),
  ]);

  for (const pathKey of pathKeys) {
    const declaredChange = declaredByPath.get(pathKey);
    const observedChange = aggregatedObserved.get(pathKey);
    const path = declaredChange?.path ?? observedChange?.path ?? [];
    const baselineValue = normalizedBaselineStatData ? getValueAtPath(normalizedBaselineStatData, path) : undefined;
    const expectedValue = declaredChange
      ? declaredChange.action === 'delete'
        ? undefined
        : declaredChange.value
      : observedChange?.afterValue;
    const finalValue = normalizedCurrentStatData
      ? getValueAtPath(normalizedCurrentStatData, path)
      : observedChange?.afterValue;

    let status: VariableComparisonStatus;
    let action: VariableChangeAction;

    if (!declaredChange && observedChange) {
      status = 'api-only';
      action = observedChange.action;
    } else {
      action = declaredChange?.action ?? observedChange?.action ?? 'edit';
      const baselineMatchesExpected = areValuesEqual(baselineValue, expectedValue);
      const observedMatchesExpected = observedChange
        ? areValuesEqual(observedChange.afterValue, expectedValue)
        : false;
      const finalMatchesExpected = areValuesEqual(finalValue, expectedValue);

      if (baselineMatchesExpected && !observedChange) {
        status = 'no-op';
      } else if (observedMatchesExpected || finalMatchesExpected) {
        status = 'applied';
      } else if (observedChange) {
        status = 'diverged';
      } else {
        status = 'not-applied';
      }
    }

    if (comparisons.length < MAX_STORED_VARIABLE_CHANGES) {
      comparisons.push({
        id: `comparison:${pathKey || 'root'}`,
        status,
        action,
        path,
        displayPath: getVariableDisplayPath(path),
        copyPath: getVariableCopyPath(path),
        declaredChange,
        observedChange,
        baselineValue,
        expectedValue,
        finalValue,
        baselinePreview: formatVariablePreview(baselineValue),
        expectedPreview: formatVariablePreview(expectedValue),
        finalPreview: formatVariablePreview(finalValue),
      });
    }
  }

  return {
    comparisons,
    omittedComparisonCount: Math.max(0, pathKeys.size - comparisons.length),
  };
}

export function collectVariableTopLevelGroups(
  declaredChanges: VariableDeclaredChange[],
  actualChanges: VariableActualChange[],
): string[] {
  const groups = new Set<string>();
  for (const change of [...declaredChanges, ...actualChanges]) {
    if (change.path.length > 0) {
      groups.add(String(change.path[0]));
    }
  }
  return Array.from(groups).slice(0, 6);
}
