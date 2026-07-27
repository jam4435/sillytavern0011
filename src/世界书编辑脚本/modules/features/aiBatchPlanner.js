export const DIRECT_BATCH_SIZE = 5;
export const DIRECT_PLAN_RECOMMEND_THRESHOLD = 8;
export const PLANNED_OUTPUT_UTILIZATION = 0.75;

export const COMPLEXITY_WEIGHTS = Object.freeze({
  low: 1,
  medium: 1.25,
  high: 1.6,
});

const DEFAULT_ESTIMATED_OUTPUT_TOKENS = 1024;
const MIN_ESTIMATED_OUTPUT_TOKENS = 64;
const MAX_ESTIMATED_OUTPUT_TOKENS = 64000;
const DEFAULT_RESERVE_OUTPUT_TOKENS = 4096;

export class AiBatchPlanningError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AiBatchPlanningError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new AiBatchPlanningError(code, message, details);
}

function normalizeUid(value, label) {
  const uid = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(uid) || uid < 0) {
    fail('INVALID_UID', `${label} 必须是非负整数 UID`, { value, label });
  }
  return uid;
}

function normalizeUidList(value, label, ownerUid) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail('INVALID_UID_LIST', `${label} 必须是 UID 数组`, { uid: ownerUid, value, label });
  }

  const result = [];
  const seen = new Set();
  for (const rawUid of value) {
    const uid = normalizeUid(rawUid, label);
    if (seen.has(uid)) {
      fail('DUPLICATE_UID_REFERENCE', `${label} 不能包含重复 UID ${uid}`, {
        uid: ownerUid,
        referencedUid: uid,
        label,
      });
    }
    seen.add(uid);
    result.push(uid);
  }
  return result;
}

function normalizeEstimatedOutputTokens(value) {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? Math.round(parsed) : DEFAULT_ESTIMATED_OUTPUT_TOKENS;
  return Math.min(MAX_ESTIMATED_OUTPUT_TOKENS, Math.max(MIN_ESTIMATED_OUTPUT_TOKENS, normalized));
}

function normalizeReserveOutputTokens(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RESERVE_OUTPUT_TOKENS;
  }
  return Math.max(1, Math.floor(parsed));
}

function createBatch(entries, tasks, metadata = {}) {
  return {
    entries,
    tasks,
    uids: entries.map(entry => normalizeUid(entry?.uid, '条目 UID')),
    entryCount: entries.length,
    ...metadata,
  };
}

function numberBatches(batches) {
  return batches.map((batch, batchIndex) => ({
    ...batch,
    batchIndex,
    batchNumber: batchIndex + 1,
  }));
}

/**
 * 直接修改模式只按目标条目数量分批；只读上下文和 token 数不参与划分。
 */
export function buildDirectBatchPlans(entries = [], options = {}) {
  if (!Array.isArray(entries)) {
    fail('INVALID_ENTRIES', 'entries 必须是数组');
  }

  const requestedBatchSize = Number(options.batchSize);
  const batchSize = Number.isInteger(requestedBatchSize) && requestedBatchSize > 0
    ? requestedBatchSize
    : DIRECT_BATCH_SIZE;
  const batches = [];

  for (let index = 0; index < entries.length; index += batchSize) {
    const batchEntries = entries.slice(index, index + batchSize);
    batches.push(
      createBatch(batchEntries, [], {
        splitReason: 'direct-entry-count',
        maxEntries: batchSize,
        estimatedOutputWeight: null,
        safeOutputCapacity: null,
        oversized: false,
        cyclicGroups: [],
        warnings: [],
      }),
    );
  }

  return numberBatches(batches);
}

function preparePlanningInput(entries, entryTasks, readonlyUids) {
  if (!Array.isArray(entries)) {
    fail('INVALID_ENTRIES', 'entries 必须是数组');
  }
  if (!Array.isArray(entryTasks)) {
    fail('INVALID_ENTRY_TASKS', 'entryTasks 必须是数组');
  }

  const entryByUid = new Map();
  const entryOrder = new Map();
  entries.forEach((entry, index) => {
    const uid = normalizeUid(entry?.uid, '条目 UID');
    if (entryByUid.has(uid)) {
      fail('DUPLICATE_ENTRY_UID', `修改条目 UID ${uid} 重复`, { uid });
    }
    entryByUid.set(uid, entry);
    entryOrder.set(uid, index);
  });

  const taskByUid = new Map();
  entryTasks.forEach(task => {
    const uid = normalizeUid(task?.uid, '任务 UID');
    if (taskByUid.has(uid)) {
      fail('DUPLICATE_TASK_UID', `UID ${uid} 存在多个规划任务`, { uid });
    }
    if (!entryByUid.has(uid)) {
      fail('TASK_WITHOUT_TARGET_ENTRY', `规划任务 UID ${uid} 不属于修改条目`, { uid });
    }
    if (!Object.hasOwn(COMPLEXITY_WEIGHTS, task?.complexity)) {
      fail('INVALID_COMPLEXITY', `UID ${uid} 的复杂度必须是 low、medium 或 high`, {
        uid,
        complexity: task?.complexity,
      });
    }
    taskByUid.set(uid, task);
  });

  for (const uid of entryByUid.keys()) {
    if (!taskByUid.has(uid)) {
      fail('MISSING_ENTRY_TASK', `修改条目 UID ${uid} 缺少规划任务`, { uid });
    }
  }

  const readonlySet = new Set(
    normalizeUidList(readonlyUids, 'readonlyUids', null)
      .filter(uid => !entryByUid.has(uid)),
  );
  const normalizedTasks = new Map();

  for (const [uid, task] of taskByUid) {
    const dependsOnUids = normalizeUidList(task.depends_on_uids, 'depends_on_uids', uid);
    const relatedUids = normalizeUidList(task.related_uids, 'related_uids', uid);

    if (dependsOnUids.includes(uid)) {
      fail('SELF_DEPENDENCY', `UID ${uid} 不能依赖自身`, { uid });
    }
    if (relatedUids.includes(uid)) {
      fail('SELF_RELATION', `UID ${uid} 不能关联自身`, { uid });
    }

    for (const dependencyUid of dependsOnUids) {
      if (!taskByUid.has(dependencyUid) && !readonlySet.has(dependencyUid)) {
        fail('UNKNOWN_DEPENDENCY', `UID ${uid} 依赖了不存在或已排除的 UID ${dependencyUid}`, {
          uid,
          dependencyUid,
        });
      }
    }
    for (const relatedUid of relatedUids) {
      if (!taskByUid.has(relatedUid)) {
        fail('UNKNOWN_RELATION', `UID ${uid} 关联了非修改条目 UID ${relatedUid}`, {
          uid,
          relatedUid,
        });
      }
    }

    const estimatedOutputTokens = normalizeEstimatedOutputTokens(task.estimated_output_tokens);
    normalizedTasks.set(uid, {
      uid,
      task,
      entry: entryByUid.get(uid),
      order: entryOrder.get(uid),
      complexity: task.complexity,
      estimatedOutputTokens,
      estimatedOutputWeight: Math.ceil(estimatedOutputTokens * COMPLEXITY_WEIGHTS[task.complexity]),
      dependsOnUids,
      relatedUids,
    });
  }

  return { normalizedTasks, readonlySet };
}

function findStronglyConnectedComponents(tasks) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowLinks = new Map();
  const components = [];

  const visit = uid => {
    indices.set(uid, nextIndex);
    lowLinks.set(uid, nextIndex);
    nextIndex += 1;
    stack.push(uid);
    onStack.add(uid);

    const successors = [...tasks.values()]
      .filter(candidate => candidate.dependsOnUids.includes(uid))
      .sort((left, right) => left.order - right.order);

    for (const successor of successors) {
      if (!indices.has(successor.uid)) {
        visit(successor.uid);
        lowLinks.set(uid, Math.min(lowLinks.get(uid), lowLinks.get(successor.uid)));
      } else if (onStack.has(successor.uid)) {
        lowLinks.set(uid, Math.min(lowLinks.get(uid), indices.get(successor.uid)));
      }
    }

    if (lowLinks.get(uid) !== indices.get(uid)) {
      return;
    }

    const componentUids = [];
    let memberUid;
    do {
      memberUid = stack.pop();
      onStack.delete(memberUid);
      componentUids.push(memberUid);
    } while (memberUid !== uid);
    components.push(componentUids.sort((left, right) => tasks.get(left).order - tasks.get(right).order));
  };

  [...tasks.values()]
    .sort((left, right) => left.order - right.order)
    .forEach(task => {
      if (!indices.has(task.uid)) {
        visit(task.uid);
      }
    });

  return components;
}

function buildComponents(normalizedTasks, safeOutputCapacity) {
  const componentUids = findStronglyConnectedComponents(normalizedTasks);
  const componentByUid = new Map();

  const components = componentUids.map((uids, id) => {
    const tasks = uids.map(uid => normalizedTasks.get(uid));
    const estimatedOutputWeight = tasks.reduce((sum, task) => sum + task.estimatedOutputWeight, 0);
    const component = {
      id,
      uids,
      tasks,
      estimatedOutputWeight,
      order: Math.min(...tasks.map(task => task.order)),
      cyclic: uids.length > 1,
      predecessorIds: new Set(),
      relatedIds: new Set(),
    };
    uids.forEach(uid => componentByUid.set(uid, component));
    return component;
  });

  for (const component of components) {
    if (component.cyclic && component.estimatedOutputWeight > safeOutputCapacity) {
      fail(
        'CYCLIC_GROUP_EXCEEDS_SAFE_OUTPUT_CAPACITY',
        `循环依赖组 ${component.uids.join(', ')} 的预估输出权重 ${component.estimatedOutputWeight} 超过安全容量 ${safeOutputCapacity}`,
        {
          uids: [...component.uids],
          estimatedOutputWeight: component.estimatedOutputWeight,
          safeOutputCapacity,
        },
      );
    }

    for (const task of component.tasks) {
      for (const dependencyUid of task.dependsOnUids) {
        const dependencyComponent = componentByUid.get(dependencyUid);
        if (dependencyComponent && dependencyComponent.id !== component.id) {
          component.predecessorIds.add(dependencyComponent.id);
        }
      }
      for (const relatedUid of task.relatedUids) {
        const relatedComponent = componentByUid.get(relatedUid);
        if (relatedComponent && relatedComponent.id !== component.id) {
          component.relatedIds.add(relatedComponent.id);
          relatedComponent.relatedIds.add(component.id);
        }
      }
    }
  }

  return components;
}

function selectComponent(eligible, currentComponentIds, remainingCapacity) {
  const fitting = eligible.filter(component => component.estimatedOutputWeight <= remainingCapacity);
  if (!currentComponentIds.size) {
    return eligible[0] || null;
  }
  if (!fitting.length) {
    return null;
  }

  return [...fitting].sort((left, right) => {
    const leftRelated = [...currentComponentIds].some(id => left.relatedIds.has(id));
    const rightRelated = [...currentComponentIds].some(id => right.relatedIds.has(id));
    if (leftRelated !== rightRelated) {
      return leftRelated ? -1 : 1;
    }
    return left.order - right.order;
  })[0];
}

/**
 * 规划模式根据任务图和安全输出容量排批。
 *
 * `entries` 与 `entryTasks` 中的对象会原样出现在结果批次里，便于调用方
 * 在执行失败时依据任务依赖和 cyclicGroups 做后续跳过。
 */
export function buildPlannedBatchPlans({
  entries = [],
  entryTasks = [],
  readonlyUids = [],
  reserveOutputTokens = DEFAULT_RESERVE_OUTPUT_TOKENS,
} = {}) {
  const normalizedReserveOutputTokens = normalizeReserveOutputTokens(reserveOutputTokens);
  const safeOutputCapacity = Math.max(
    1,
    Math.floor(normalizedReserveOutputTokens * PLANNED_OUTPUT_UTILIZATION),
  );
  const { normalizedTasks } = preparePlanningInput(entries, entryTasks, readonlyUids);

  if (!normalizedTasks.size) {
    return {
      batches: [],
      warnings: [],
      cyclicGroups: [],
      safeOutputCapacity,
      totalEstimatedOutputWeight: 0,
      taskWeights: {},
    };
  }

  const components = buildComponents(normalizedTasks, safeOutputCapacity);
  const componentById = new Map(components.map(component => [component.id, component]));
  const unscheduledIds = new Set(components.map(component => component.id));
  const scheduledIds = new Set();
  const warnings = [];
  const batches = [];
  let currentComponents = [];
  let currentWeight = 0;

  const finalizeCurrentBatch = () => {
    if (!currentComponents.length) {
      return;
    }

    const normalizedBatchTasks = currentComponents.flatMap(component => component.tasks);
    const cyclicGroups = currentComponents
      .filter(component => component.cyclic)
      .map(component => [...component.uids]);
    const batchWarnings = warnings.filter(warning =>
      normalizedBatchTasks.some(task => task.uid === warning.uid),
    );

    batches.push(
      createBatch(
        normalizedBatchTasks.map(task => task.entry),
        normalizedBatchTasks.map(task => task.task),
        {
          splitReason: 'planned-task-graph',
          estimatedOutputWeight: currentWeight,
          safeOutputCapacity,
          oversized: currentWeight > safeOutputCapacity,
          cyclicGroups,
          warnings: batchWarnings,
        },
      ),
    );
    currentComponents = [];
    currentWeight = 0;
  };

  while (unscheduledIds.size) {
    const eligible = [...unscheduledIds]
      .map(id => componentById.get(id))
      .filter(component => [...component.predecessorIds].every(id => scheduledIds.has(id)))
      .sort((left, right) => left.order - right.order);

    if (!eligible.length) {
      fail('UNRESOLVABLE_DEPENDENCY_GRAPH', '规划任务依赖图无法继续排批', {
        remainingUids: [...unscheduledIds].flatMap(id => componentById.get(id).uids),
      });
    }

    const currentComponentIds = new Set(currentComponents.map(component => component.id));
    const selected = selectComponent(
      eligible,
      currentComponentIds,
      safeOutputCapacity - currentWeight,
    );

    if (!selected) {
      finalizeCurrentBatch();
      continue;
    }

    if (!currentComponents.length && selected.estimatedOutputWeight > safeOutputCapacity) {
      const uid = selected.uids[0];
      warnings.push({
        code: 'TASK_EXCEEDS_SAFE_OUTPUT_CAPACITY',
        uid,
        estimatedOutputWeight: selected.estimatedOutputWeight,
        safeOutputCapacity,
        message: `UID ${uid} 的预估输出权重 ${selected.estimatedOutputWeight} 超过安全容量 ${safeOutputCapacity}，已单独成批`,
      });
    }

    currentComponents.push(selected);
    currentWeight += selected.estimatedOutputWeight;
    unscheduledIds.delete(selected.id);
    scheduledIds.add(selected.id);

    if (currentWeight > safeOutputCapacity) {
      finalizeCurrentBatch();
    }
  }
  finalizeCurrentBatch();

  const cyclicGroups = components
    .filter(component => component.cyclic)
    .sort((left, right) => left.order - right.order)
    .map(component => [...component.uids]);
  const taskWeights = Object.fromEntries(
    [...normalizedTasks.values()]
      .sort((left, right) => left.order - right.order)
      .map(task => [task.uid, task.estimatedOutputWeight]),
  );

  return {
    batches: numberBatches(batches),
    warnings,
    cyclicGroups,
    safeOutputCapacity,
    totalEstimatedOutputWeight: Object.values(taskWeights).reduce((sum, weight) => sum + weight, 0),
    taskWeights,
  };
}

export const buildDirectBatches = buildDirectBatchPlans;
export const buildPlannedBatches = buildPlannedBatchPlans;
