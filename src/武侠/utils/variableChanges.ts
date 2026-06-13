export type VariablePath = Array<string | number>;
export type VariableChangeAction = 'insert' | 'edit' | 'delete';
export type VariableChangeSource = 'ai-declared' | 'actual-diff';
export type VariableChangeStatus = 'tracking' | 'reply-recorded' | 'settled' | 'error';

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
  source: 'actual-diff';
  action: VariableChangeAction;
  path: VariablePath;
  displayPath: string;
  copyPath: string;
  beforeValue: unknown;
  afterValue: unknown;
  beforePreview: string;
  afterPreview: string;
}

export interface ParsedDeclaredVariableChanges {
  declaredChanges: VariableDeclaredChange[];
  thoughts: VariableThoughtEntry[];
  parseErrors: string[];
  omittedDeclaredCount: number;
}

export interface ActualVariableChangesResult {
  actualChanges: VariableActualChange[];
  omittedActualCount: number;
}

export interface VariableChangeSummary {
  turnId: number;
  status: VariableChangeStatus;
  assistantMessageId?: number;
  startedAt: number;
  updatedAt: number;
  declaredChanges: VariableDeclaredChange[];
  actualChanges: VariableActualChange[];
  thoughts: VariableThoughtEntry[];
  parseErrors: string[];
  topLevelGroups: string[];
  omittedDeclaredCount: number;
  omittedActualCount: number;
}

const HIDDEN_VARIABLE_KEYS = new Set(['$meta', '$template']);
const VARIABLE_BLOCK_REGEX = /<(VariableThink|VariableInsert|VariableEdit|VariableDelete)>\s*([\s\S]*?)\s*<\/\1>/gi;
const MAX_STORED_VARIABLE_CHANGES = 100;

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

const stableStringify = (value: unknown): string => {
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

const areValuesEqual = (left: unknown, right: unknown): boolean =>
  stableStringify(left) === stableStringify(right);

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
  path.reduce((copyPath, segment) => `${copyPath}${formatCopyPathSegment(segment)}`, 'stat_data');

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

export const readCurrentStatDataSnapshot = (): Record<string, unknown> | null => {
  try {
    const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    const statData = extractStatData(variables?.stat_data ?? null);
    return statData ? cloneJson(statData) : null;
  } catch {
    return null;
  }
};

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
    declaredChanges: [],
    actualChanges: [],
    thoughts: [],
    parseErrors: [],
    topLevelGroups: [],
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

const createActualChange = (
  action: VariableChangeAction,
  path: VariablePath,
  beforeValue: unknown,
  afterValue: unknown,
  index: number,
): VariableActualChange => ({
  id: getVariableBlockId('actual-diff', action, path, index),
  source: 'actual-diff',
  action,
  path,
  displayPath: getVariableDisplayPath(path),
  copyPath: getVariableCopyPath(path),
  beforeValue,
  afterValue,
  beforePreview: formatVariablePreview(beforeValue),
  afterPreview: formatVariablePreview(afterValue),
});

function pushActualChange(
  result: VariableActualChange[],
  counters: { total: number },
  action: VariableChangeAction,
  path: VariablePath,
  beforeValue: unknown,
  afterValue: unknown,
): void {
  counters.total += 1;
  if (result.length < MAX_STORED_VARIABLE_CHANGES) {
    result.push(createActualChange(action, path, beforeValue, afterValue, counters.total));
  }
}

function collectActualDiffs(
  beforeValue: unknown,
  afterValue: unknown,
  path: VariablePath,
  result: VariableActualChange[],
  counters: { total: number },
): void {
  if (areValuesEqual(beforeValue, afterValue)) {
    return;
  }

  const beforeIsContainer = isContainer(beforeValue);
  const afterIsContainer = isContainer(afterValue);

  if (beforeValue === undefined && afterIsContainer) {
    const entries = getVisibleEntries(afterValue);
    if (entries.length === 0) {
      pushActualChange(result, counters, 'insert', path, beforeValue, afterValue);
      return;
    }
    for (const [key, childValue] of entries) {
      collectActualDiffs(undefined, childValue, [...path, key], result, counters);
    }
    return;
  }

  if (afterValue === undefined && beforeIsContainer) {
    const entries = getVisibleEntries(beforeValue);
    if (entries.length === 0) {
      pushActualChange(result, counters, 'delete', path, beforeValue, afterValue);
      return;
    }
    for (const [key, childValue] of entries) {
      collectActualDiffs(childValue, undefined, [...path, key], result, counters);
    }
    return;
  }

  if (!beforeIsContainer || !afterIsContainer || Array.isArray(beforeValue) !== Array.isArray(afterValue)) {
    const action = beforeValue === undefined ? 'insert' : afterValue === undefined ? 'delete' : 'edit';
    pushActualChange(result, counters, action, path, beforeValue, afterValue);
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

    collectActualDiffs(beforeChild, afterChild, [...path, key], result, counters);
  }
}

export function createActualVariableChanges(
  baselineStatData: Record<string, unknown> | null,
  nextStatData: Record<string, unknown> | null,
): ActualVariableChangesResult {
  const actualChanges: VariableActualChange[] = [];
  const counters = { total: 0 };

  if (!baselineStatData || !nextStatData) {
    return {
      actualChanges,
      omittedActualCount: 0,
    };
  }

  collectActualDiffs(baselineStatData, nextStatData, [], actualChanges, counters);
  return {
    actualChanges,
    omittedActualCount: Math.max(0, counters.total - actualChanges.length),
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
