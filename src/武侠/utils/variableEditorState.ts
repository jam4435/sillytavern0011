export type VariableEditorPathSegment = string | number;
export type VariableEditorPath = ReadonlyArray<VariableEditorPathSegment>;
export type VariableEditorLeafChangeKind = 'insert' | 'edit' | 'delete';
export type VariableEditorVariableOption = Parameters<typeof getVariables>[0];

export interface VariableEditorLeafChange {
  kind: VariableEditorLeafChangeKind;
  path: VariableEditorPath;
  beforeValue: unknown;
  afterValue: unknown;
}

export interface VariableEditorConflict {
  change: VariableEditorLeafChange;
  currentValue: unknown;
}

export interface VariableEditorSaveResult {
  didSave: boolean;
  appliedChanges: VariableEditorLeafChange[];
  conflicts: VariableEditorConflict[];
  savedVariables: Record<string, any>;
  savedStatData: Record<string, unknown>;
  sanitizedStatData: Record<string, unknown>;
  writeDoneDetail: VariableEditorWriteDoneDetail;
}

export interface VariableEditorWriteDoneDetail {
  message_id: null;
  actions: {
    directChatWrite: true;
  };
  stat: Record<string, unknown>;
  statWithoutMeta: Record<string, unknown>;
}

export class VariableEditorConflictError extends Error {
  readonly conflicts: VariableEditorConflict[];

  constructor(conflicts: VariableEditorConflict[]) {
    super(createConflictErrorMessage(conflicts));
    this.name = 'VariableEditorConflictError';
    Object.setPrototypeOf(this, VariableEditorConflictError.prototype);
    this.conflicts = conflicts;
  }
}

const VARIABLE_EDITOR_HIDDEN_PREFIX = '$';
const ROOT_PATH_KEY = 'root';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isVariableEditorHiddenKey = (key: string | number): boolean =>
  typeof key === 'string' && key.startsWith(VARIABLE_EDITOR_HIDDEN_PREFIX);

export const getVisibleVariableEntries = (value: unknown): Array<[string | number, unknown]> => {
  if (Array.isArray(value)) {
    return value.map((item, index) => [index, item]);
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).filter(([key]) => !isVariableEditorHiddenKey(key));
};

export const getVariableEditorPathKey = (path: VariableEditorPath): string =>
  path.length === 0 ? ROOT_PATH_KEY : path.map(segment => String(segment)).join('\u001f');

export const getVariableEditorDisplayPath = (path: VariableEditorPath): string =>
  ['stat_data', ...path.map(segment => String(segment))].join(' › ');

const formatCopyPathSegment = (segment: VariableEditorPathSegment): string => {
  if (typeof segment === 'number') {
    return `[${segment}]`;
  }

  return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(segment)
    ? `.${segment}`
    : `[${JSON.stringify(segment)}]`;
};

export const getVariableEditorCopyPath = (path: VariableEditorPath): string =>
  path.reduce<string>((copyPath, segment) => `${copyPath}${formatCopyPathSegment(segment)}`, 'stat_data');

export const sanitizeVariableEditorValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeVariableEditorValue(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitizedEntries = Object.entries(value)
    .filter(([key]) => !isVariableEditorHiddenKey(key))
    .map(([key, childValue]) => [key, sanitizeVariableEditorValue(childValue)] as const);
  return Object.fromEntries(sanitizedEntries);
};

export const sanitizeVariableEditorStatData = (value: unknown): Record<string, unknown> => {
  const sanitized = sanitizeVariableEditorValue(value);
  return isRecord(sanitized) ? sanitized : {};
};

export const getVariableEditorStatDataFromVariables = (variables: unknown): Record<string, unknown> => {
  if (!isRecord(variables)) {
    return {};
  }

  return isRecord(variables.stat_data) ? variables.stat_data : {};
};

const cloneVariableValue = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => cloneVariableValue(item)) as T;
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => [key, cloneVariableValue(childValue)]),
  ) as T;
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

const areEqual = (left: unknown, right: unknown): boolean => stableStringify(left) === stableStringify(right);

export const readVariableValueAtPath = (source: unknown, path: VariableEditorPath): unknown => {
  let cursor: unknown = source;

  for (const segment of path) {
    if (Array.isArray(cursor) && typeof segment === 'number') {
      cursor = cursor[segment];
      continue;
    }

    if (isRecord(cursor)) {
      cursor = cursor[String(segment)];
      continue;
    }

    return undefined;
  }

  return cursor;
};

const createMissingContainer = (nextSegment: VariableEditorPathSegment | undefined): Record<string, unknown> | unknown[] =>
  typeof nextSegment === 'number' ? [] : {};

const writeValueRecursively = (
  source: unknown,
  path: VariableEditorPath,
  nextValue: unknown,
  depth: number,
): unknown => {
  if (depth >= path.length) {
    return cloneVariableValue(nextValue);
  }

  const segment = path[depth];
  const childSource = readVariableValueAtPath(source, [segment]);
  const nextChild = writeValueRecursively(childSource, path, nextValue, depth + 1);

  if (typeof segment === 'number') {
    const nextArray = Array.isArray(source) ? [...source] : [];
    nextArray[segment] = nextChild;
    return nextArray;
  }

  const nextRecord = isRecord(source) ? { ...source } : createMissingContainer(segment) as Record<string, unknown>;
  nextRecord[String(segment)] = nextChild;
  return nextRecord;
};

export const writeVariableValueAtPath = (
  source: Record<string, unknown>,
  path: VariableEditorPath,
  nextValue: unknown,
): Record<string, unknown> => {
  if (path.length === 0) {
    return isRecord(nextValue) ? cloneVariableValue(nextValue) : source;
  }

  return writeValueRecursively(source, path, nextValue, 0) as Record<string, unknown>;
};

const deleteValueRecursively = (source: unknown, path: VariableEditorPath, depth: number): unknown => {
  if (depth >= path.length) {
    return source;
  }

  const segment = path[depth];
  const isLeaf = depth === path.length - 1;

  if (typeof segment === 'number') {
    if (!Array.isArray(source)) {
      return source;
    }

    const nextArray = [...source];
    if (isLeaf) {
      nextArray.splice(segment, 1);
      return nextArray;
    }

    nextArray[segment] = deleteValueRecursively(nextArray[segment], path, depth + 1);
    return nextArray;
  }

  if (!isRecord(source)) {
    return source;
  }

  const nextRecord: Record<string, unknown> = { ...source };
  if (isLeaf) {
    delete nextRecord[String(segment)];
    return nextRecord;
  }

  nextRecord[String(segment)] = deleteValueRecursively(nextRecord[String(segment)], path, depth + 1);
  return nextRecord;
};

export const deleteVariableValueAtPath = (
  source: Record<string, unknown>,
  path: VariableEditorPath,
): Record<string, unknown> => {
  if (path.length === 0) {
    return {};
  }

  return deleteValueRecursively(source, path, 0) as Record<string, unknown>;
};

const createLeafChange = (
  kind: VariableEditorLeafChangeKind,
  path: VariableEditorPath,
  beforeValue: unknown,
  afterValue: unknown,
): VariableEditorLeafChange => ({
  kind,
  path: [...path],
  beforeValue: cloneVariableValue(beforeValue),
  afterValue: cloneVariableValue(afterValue),
});

const collectLeafChangesRecursively = (
  beforeValue: unknown,
  afterValue: unknown,
  path: VariableEditorPath,
  changes: VariableEditorLeafChange[],
): void => {
  if (areEqual(beforeValue, afterValue)) {
    return;
  }

  const beforeEntries = getVisibleVariableEntries(beforeValue);
  const afterEntries = getVisibleVariableEntries(afterValue);
  const beforeIsContainer = Array.isArray(beforeValue) || isRecord(beforeValue);
  const afterIsContainer = Array.isArray(afterValue) || isRecord(afterValue);

  if (beforeValue === undefined && afterIsContainer) {
    if (afterEntries.length === 0) {
      changes.push(createLeafChange('insert', path, beforeValue, afterValue));
      return;
    }

    for (const [key, childValue] of afterEntries) {
      collectLeafChangesRecursively(undefined, childValue, [...path, key], changes);
    }
    return;
  }

  if (afterValue === undefined && beforeIsContainer) {
    if (beforeEntries.length === 0) {
      changes.push(createLeafChange('delete', path, beforeValue, afterValue));
      return;
    }

    for (const [key, childValue] of beforeEntries) {
      collectLeafChangesRecursively(childValue, undefined, [...path, key], changes);
    }
    return;
  }

  if (!beforeIsContainer || !afterIsContainer || Array.isArray(beforeValue) !== Array.isArray(afterValue)) {
    const kind = beforeValue === undefined ? 'insert' : afterValue === undefined ? 'delete' : 'edit';
    changes.push(createLeafChange(kind, path, beforeValue, afterValue));
    return;
  }

  const keySet = new Set<VariableEditorPathSegment>();
  for (const [key] of beforeEntries) {
    keySet.add(key);
  }
  for (const [key] of afterEntries) {
    keySet.add(key);
  }

  for (const key of keySet) {
    collectLeafChangesRecursively(
      readVariableValueAtPath(beforeValue, [key]),
      readVariableValueAtPath(afterValue, [key]),
      [...path, key],
      changes,
    );
  }
};

export const collectVariableLeafChanges = (
  baselineStatData: Record<string, unknown>,
  draftStatData: Record<string, unknown>,
): VariableEditorLeafChange[] => {
  const sanitizedBaseline = sanitizeVariableEditorStatData(baselineStatData);
  const sanitizedDraft = sanitizeVariableEditorStatData(draftStatData);
  const changes: VariableEditorLeafChange[] = [];
  collectLeafChangesRecursively(sanitizedBaseline, sanitizedDraft, [], changes);
  return changes;
};

export const detectVariableLeafConflicts = (
  latestStatData: Record<string, unknown>,
  changes: VariableEditorLeafChange[],
): VariableEditorConflict[] => {
  const sanitizedLatest = sanitizeVariableEditorStatData(latestStatData);
  return changes
    .map(change => {
      const currentValue = readVariableValueAtPath(sanitizedLatest, change.path);
      if (areEqual(currentValue, change.beforeValue)) {
        return null;
      }

      return {
        change,
        currentValue: cloneVariableValue(currentValue),
      } satisfies VariableEditorConflict;
    })
    .filter((conflict): conflict is VariableEditorConflict => Boolean(conflict));
};

export const applyVariableLeafChanges = (
  statData: Record<string, unknown>,
  changes: VariableEditorLeafChange[],
): Record<string, unknown> => {
  const orderedChanges = [...changes].sort((left, right) => {
    if (left.kind === 'delete' && right.kind !== 'delete') {
      return -1;
    }
    if (left.kind !== 'delete' && right.kind === 'delete') {
      return 1;
    }

    const leftPath = left.path.map(segment => String(segment)).join('\u001f');
    const rightPath = right.path.map(segment => String(segment)).join('\u001f');
    if (left.kind === 'delete' && right.kind === 'delete') {
      return rightPath.localeCompare(leftPath, 'zh-CN');
    }

    return leftPath.localeCompare(rightPath, 'zh-CN');
  });

  return orderedChanges.reduce<Record<string, unknown>>((nextStatData, change) => {
    if (change.kind === 'delete') {
      return deleteVariableValueAtPath(nextStatData, change.path);
    }

    return writeVariableValueAtPath(nextStatData, change.path, change.afterValue);
  }, cloneVariableValue(statData));
};

export const createDirectChatWriteDoneDetail = (
  savedStatData: Record<string, unknown>,
  sanitizedStatData: Record<string, unknown> = sanitizeVariableEditorStatData(savedStatData),
): VariableEditorWriteDoneDetail => ({
  message_id: null,
  actions: {
    directChatWrite: true,
  },
  stat: cloneVariableValue(savedStatData),
  statWithoutMeta: cloneVariableValue(sanitizedStatData),
});

export const saveVariableEditorStatData = async ({
  baselineStatData,
  draftStatData,
  option = { type: 'chat' } as VariableEditorVariableOption,
}: {
  baselineStatData: Record<string, unknown>;
  draftStatData: Record<string, unknown>;
  option?: VariableEditorVariableOption;
}): Promise<VariableEditorSaveResult> => {
  const appliedChanges = collectVariableLeafChanges(baselineStatData, draftStatData);

  if (appliedChanges.length === 0) {
    const savedVariables = getVariables(option) as Record<string, any>;
    const savedStatData = getVariableEditorStatDataFromVariables(savedVariables);
    return {
      didSave: false,
      appliedChanges,
      conflicts: [],
      savedVariables,
      savedStatData,
      sanitizedStatData: sanitizeVariableEditorStatData(savedStatData),
      writeDoneDetail: createDirectChatWriteDoneDetail(savedStatData),
    };
  }

  let detectedConflicts: VariableEditorConflict[] = [];
  const savedVariables = await Promise.resolve(
    updateVariablesWith(currentVariables => {
      const currentStatData = getVariableEditorStatDataFromVariables(currentVariables);
      detectedConflicts = detectVariableLeafConflicts(currentStatData, appliedChanges);
      if (detectedConflicts.length > 0) {
        throw new VariableEditorConflictError(detectedConflicts);
      }

      return {
        ...currentVariables,
        stat_data: applyVariableLeafChanges(currentStatData, appliedChanges),
      };
    }, option),
  );

  const savedStatData = getVariableEditorStatDataFromVariables(savedVariables);
  const sanitizedStatData = sanitizeVariableEditorStatData(savedStatData);
  const writeDoneDetail = createDirectChatWriteDoneDetail(savedStatData, sanitizedStatData);

  await eventEmit('era:writeDone', writeDoneDetail);

  return {
    didSave: true,
    appliedChanges,
    conflicts: detectedConflicts,
    savedVariables,
    savedStatData,
    sanitizedStatData,
    writeDoneDetail,
  };
};

function createConflictErrorMessage(conflicts: VariableEditorConflict[]): string {
  if (conflicts.length === 0) {
    return '变量保存冲突：目标变量已被其他写入更新。';
  }

  const preview = conflicts
    .slice(0, 5)
    .map(conflict => getVariableEditorDisplayPath(conflict.change.path))
    .join('、');

  return `变量保存冲突：以下路径在保存前已发生外部变化：${preview}`;
}
