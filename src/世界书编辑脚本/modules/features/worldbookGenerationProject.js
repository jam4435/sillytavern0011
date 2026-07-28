import {
  cloneGenerationValue,
  createGenerationProject,
  createGenerationId,
  normalizeGenerationAuditReport,
  normalizeGenerationProject,
  normalizeGenerationProposal,
} from './worldbookGenerationSchema.js';

const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function parsePath(path) {
  const segments = Array.isArray(path)
    ? path
    : `${path || ''}`
        .split('.')
        .map(segment => segment.trim())
        .filter(Boolean);
  if (!segments.length || segments.some(segment => FORBIDDEN_PATH_SEGMENTS.has(`${segment}`))) {
    throw new Error('生成项目操作包含无效路径');
  }
  return segments.map(segment => (/^\d+$/.test(`${segment}`) ? Number(segment) : `${segment}`));
}

function readAtPath(root, path) {
  return path.reduce((value, segment) => value?.[segment], root);
}

function hasAtPath(root, path) {
  if (!path.length) return true;
  const parent = readAtPath(root, path.slice(0, -1));
  return parent !== null && parent !== undefined && Object.prototype.hasOwnProperty.call(parent, path.at(-1));
}

function ensureParentAtPath(root, path) {
  let current = root;
  path.slice(0, -1).forEach((segment, index) => {
    if (!current[segment] || typeof current[segment] !== 'object') {
      current[segment] = typeof path[index + 1] === 'number' ? [] : {};
    }
    current = current[segment];
  });
  return current;
}

function setAtPath(root, path, value) {
  const parent = ensureParentAtPath(root, path);
  parent[path.at(-1)] = cloneGenerationValue(value);
}

function deleteAtPath(root, path) {
  const parent = readAtPath(root, path.slice(0, -1));
  if (parent === null || parent === undefined) return;
  if (Array.isArray(parent) && typeof path.at(-1) === 'number') {
    parent.splice(path.at(-1), 1);
  } else {
    delete parent[path.at(-1)];
  }
}

function findIndexById(items, id, keys) {
  return items.findIndex(item => keys.some(key => `${item?.[key] ?? ''}` === `${id ?? ''}`));
}

function operationPathForCollection(collection, operation, idKeys) {
  const items = collection.items;
  const id = operation.id || idKeys.map(key => operation[key]).find(Boolean);
  const index = findIndexById(items, id, idKeys);
  return { id, index };
}

function normalizeDomainOperation(project, operation = {}) {
  const type = operation.type || operation.op;
  const collectionMap = {
    addNode: { path: ['blueprint', 'nodes'], keys: ['entryId', 'nodeId'], value: operation.node || operation.value },
    updateNode: { path: ['blueprint', 'nodes'], keys: ['entryId', 'nodeId'], value: operation.patch || operation.value },
    removeNode: { path: ['blueprint', 'nodes'], keys: ['entryId', 'nodeId'] },
    addEntry: { path: ['entryDrafts'], keys: ['entryId', 'nodeId'], value: operation.entry || operation.value },
    updateEntry: { path: ['entryDrafts'], keys: ['entryId', 'nodeId'], value: operation.patch || operation.value },
    removeEntry: { path: ['entryDrafts'], keys: ['entryId', 'nodeId'] },
    addSource: { path: ['sources'], keys: ['sourceId', 'id'], value: operation.source || operation.value },
    updateSource: { path: ['sources'], keys: ['sourceId', 'id'], value: operation.patch || operation.value },
    removeSource: { path: ['sources'], keys: ['sourceId', 'id'] },
  };

  if (type === 'replaceBlueprint') {
    return { type: 'set', path: ['blueprint'], value: operation.blueprint ?? operation.value };
  }
  if (type === 'replaceEntryDrafts') {
    return { type: 'set', path: ['entryDrafts'], value: operation.entries ?? operation.value ?? [] };
  }
  if (type === 'setAudit') {
    return { type: 'set', path: ['audit'], value: operation.audit ?? operation.value };
  }
  if (type === 'appendConversation') {
    return {
      type: 'insert',
      path: ['conversations'],
      index: project.conversations.length,
      value: operation.message ?? operation.value,
    };
  }
  if (type === 'addRule') {
    return {
      type: 'insert',
      path: ['projectRules'],
      index: project.projectRules.length,
      value: operation.rule ?? operation.value,
    };
  }
  if (type === 'removeRule') {
    const index = Number.isInteger(operation.index)
      ? operation.index
      : project.projectRules.findIndex(rule => rule?.id === operation.id);
    return { type: 'remove', path: ['projectRules'], index };
  }

  const definition = collectionMap[type];
  if (!definition) return operation;
  const items = readAtPath(project, definition.path);
  const { index } = operationPathForCollection({ items }, operation, definition.keys);
  if (type.startsWith('add')) {
    return {
      type: 'insert',
      path: definition.path,
      index: Number.isInteger(operation.index) ? operation.index : items.length,
      value: definition.value,
    };
  }
  if (index < 0) {
    throw new Error(`生成项目操作找不到目标：${type}`);
  }
  if (type.startsWith('update')) {
    return { type: 'merge', path: [...definition.path, index], value: definition.value || {} };
  }
  return { type: 'remove', path: definition.path, index };
}

function applyCanonicalOperation(project, rawOperation) {
  const operation = normalizeDomainOperation(project, rawOperation);
  const type = operation.type || operation.op;
  const path = parsePath(operation.path);

  if (type === 'set' || type === 'replace') {
    const existed = hasAtPath(project, path);
    const previous = cloneGenerationValue(readAtPath(project, path));
    setAtPath(project, path, operation.value);
    return existed
      ? { type: 'set', path, value: previous }
      : { type: 'delete', path };
  }

  if (type === 'delete' || type === 'unset') {
    if (!hasAtPath(project, path)) return { type: 'noop', path };
    const previous = cloneGenerationValue(readAtPath(project, path));
    deleteAtPath(project, path);
    return { type: 'set', path, value: previous };
  }

  if (type === 'merge' || type === 'patch') {
    const previous = cloneGenerationValue(readAtPath(project, path));
    const patch = operation.value && typeof operation.value === 'object' ? operation.value : {};
    const current = previous && typeof previous === 'object' ? previous : {};
    setAtPath(project, path, { ...current, ...cloneGenerationValue(patch) });
    return { type: 'set', path, value: previous };
  }

  if (type === 'insert') {
    const target = readAtPath(project, path);
    if (!Array.isArray(target)) throw new Error('生成项目 insert 操作目标必须是数组');
    const index = Number.isInteger(operation.index)
      ? Math.max(0, Math.min(operation.index, target.length))
      : target.length;
    target.splice(index, 0, cloneGenerationValue(operation.value));
    return { type: 'remove', path, index };
  }

  if (type === 'remove') {
    const target = readAtPath(project, path);
    if (!Array.isArray(target)) throw new Error('生成项目 remove 操作目标必须是数组');
    const index = Number.parseInt(`${operation.index}`, 10);
    if (!Number.isFinite(index) || index < 0 || index >= target.length) {
      throw new Error('生成项目 remove 操作下标无效');
    }
    const previous = cloneGenerationValue(target[index]);
    target.splice(index, 1);
    return { type: 'insert', path, index, value: previous };
  }

  if (type === 'noop') return { type: 'noop', path };
  throw new Error(`不支持的生成项目操作：${type || 'unknown'}`);
}

function collectStructureAffectedIds(project, proposal) {
  const ids = new Set(proposal.affectedIds || []);
  let structureChanged = false;
  proposal.operations.forEach(operation => {
    const type = operation.type || operation.op;
    if (['addNode', 'updateNode', 'removeNode', 'replaceBlueprint'].includes(type)) {
      structureChanged = true;
      [operation.id, operation.entryId, operation.nodeId, operation.node?.entryId, operation.node?.nodeId]
        .filter(Boolean)
        .forEach(id => ids.add(`${id}`));
    }
    const rawPath = Array.isArray(operation.path) ? operation.path.join('.') : `${operation.path || ''}`;
    if (rawPath === 'blueprint' || rawPath.startsWith('blueprint.nodes')) structureChanged = true;
  });
  if (!structureChanged) return new Set();

  const nodes = project.blueprint.nodes;
  const byId = new Map(nodes.map(node => [node.entryId, node]));
  [...ids].forEach(id => {
    let current = byId.get(id);
    while (current?.parentId) {
      ids.add(current.parentId);
      current = byId.get(current.parentId);
    }
    const groupId = byId.get(id)?.xml?.groupId;
    if (groupId) {
      nodes.filter(node => node.xml?.groupId === groupId).forEach(node => ids.add(node.entryId));
    }
  });
  return ids;
}

function applyOperations(project, operations) {
  const inverseOperations = [];
  operations.forEach(operation => {
    const inverse = applyCanonicalOperation(project, operation);
    inverseOperations.unshift(inverse);
  });
  return inverseOperations;
}

function appendRevisionHistory(project, stack, record) {
  project.revisionHistory[stack] = [...project.revisionHistory[stack], cloneGenerationValue(record)].slice(-100);
}

function finalizeMutation(project, record) {
  project.updatedAt = record.createdAt;
  Object.defineProperty(project, '__lastRevisionRecord', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: cloneGenerationValue(record),
  });
  return project;
}

export function getLastGenerationRevisionRecord(project) {
  return cloneGenerationValue(project?.__lastRevisionRecord || null);
}

export function applyGenerationProposal(inputProject, inputProposal = inputProject?.pendingProposal) {
  const project = normalizeGenerationProject(inputProject);
  const proposal = normalizeGenerationProposal(inputProposal, project.revision);
  if (!proposal) throw new Error('没有可接受的生成项目提案');
  if (proposal.baseRevision !== project.revision) {
    throw new Error(`提案基于修订 ${proposal.baseRevision}，当前项目已是修订 ${project.revision}`);
  }
  const unresolvedConflicts = proposal.conflicts.filter(conflict => conflict?.resolved !== true);
  if (unresolvedConflicts.length) {
    throw new Error('提案仍有未解决的资料冲突');
  }

  const inverseOperations = applyOperations(project, proposal.operations);
  const affectedIds = collectStructureAffectedIds(project, proposal);
  const appliedForwardOperations = cloneGenerationValue(proposal.operations);
  if (affectedIds.size) {
    project.blueprint.nodes.forEach((node, index) => {
      if (!node.stale && affectedIds.has(node.entryId)) {
        const operation = { type: 'set', path: ['blueprint', 'nodes', index, 'stale'], value: true };
        inverseOperations.unshift(applyCanonicalOperation(project, operation));
        appliedForwardOperations.push(operation);
      }
    });
    project.entryDrafts.forEach((entry, index) => {
      if (!entry.stale && affectedIds.has(entry.entryId)) {
        const operation = { type: 'set', path: ['entryDrafts', index, 'stale'], value: true };
        inverseOperations.unshift(applyCanonicalOperation(project, operation));
        appliedForwardOperations.push(operation);
      }
    });
  }
  if (['entries', 'modify_entries'].includes(proposal.intent)) {
    const generatedIds = new Set(project.entryDrafts.map(entry => entry.entryId || entry.nodeId).filter(Boolean));
    project.blueprint.nodes.forEach((node, index) => {
      if (node.stale && generatedIds.has(node.entryId)) {
        const operation = { type: 'set', path: ['blueprint', 'nodes', index, 'stale'], value: false };
        inverseOperations.unshift(applyCanonicalOperation(project, operation));
        appliedForwardOperations.push(operation);
      }
    });
  }

  project.pendingProposal = null;
  if (proposal.audit !== undefined) {
    const operation = {
      type: 'insert',
      path: ['audits'],
      index: project.audits.length,
      value: cloneGenerationValue(proposal.audit),
    };
    inverseOperations.unshift(applyCanonicalOperation(project, operation));
    appliedForwardOperations.push(operation);
    const auditOperation = {
      type: 'set',
      path: ['audit'],
      value: normalizeGenerationAuditReport(
        {
          ...proposal.audit,
          checkedAt: new Date().toISOString(),
          revision: project.revision + 1,
        },
        project.revision + 1,
      ),
    };
    inverseOperations.unshift(applyCanonicalOperation(project, auditOperation));
    appliedForwardOperations.push(auditOperation);
  }
  let nextStage = project.stage;
  if (['blueprint', 'modify_blueprint', 'expand_branch'].includes(proposal.intent)) {
    nextStage = 'blueprint-review';
  } else if (['entries', 'modify_entries'].includes(proposal.intent)) {
    nextStage = 'entry-review';
  }
  if (nextStage !== project.stage) {
    const operation = { type: 'set', path: ['stage'], value: nextStage };
    inverseOperations.unshift(applyCanonicalOperation(project, operation));
    appliedForwardOperations.push(operation);
  }
  project.revision += 1;
  const createdAt = new Date().toISOString();
  const record = {
    projectId: project.id,
    revision: project.revision,
    baseRevision: proposal.baseRevision,
    kind: 'apply',
    proposalId: proposal.id,
    summary: proposal.summary,
    forwardOperations: appliedForwardOperations,
    inverseOperations,
    createdAt,
  };
  appendRevisionHistory(project, 'undo', record);
  project.revisionHistory.redo = [];
  return finalizeMutation(normalizeGenerationProject(project), record);
}

export function rejectGenerationProposal(inputProject, proposalId = inputProject?.pendingProposal?.id) {
  const project = normalizeGenerationProject(inputProject);
  if (!project.pendingProposal) return project;
  if (proposalId && project.pendingProposal.id !== proposalId) {
    throw new Error('待拒绝的提案已不是当前未决提案');
  }
  project.pendingProposal = null;
  project.updatedAt = new Date().toISOString();
  return project;
}

export function undoGenerationProject(inputProject) {
  const project = normalizeGenerationProject(inputProject);
  const originalRecord = project.revisionHistory.undo.at(-1);
  if (!originalRecord) return project;

  const inverseOperations = cloneGenerationValue(originalRecord.inverseOperations || []);
  const redoInverse = applyOperations(project, inverseOperations);
  project.revisionHistory.undo.pop();
  appendRevisionHistory(project, 'redo', originalRecord);
  const baseRevision = project.revision;
  project.revision += 1;
  project.pendingProposal = null;
  const record = {
    projectId: project.id,
    revision: project.revision,
    baseRevision,
    kind: 'undo',
    sourceRevision: originalRecord.revision,
    summary: `撤销：${originalRecord.summary || originalRecord.proposalId || '生成项目修改'}`,
    forwardOperations: inverseOperations,
    inverseOperations: redoInverse,
    createdAt: new Date().toISOString(),
  };
  return finalizeMutation(normalizeGenerationProject(project), record);
}

export function redoGenerationProject(inputProject) {
  const project = normalizeGenerationProject(inputProject);
  const originalRecord = project.revisionHistory.redo.at(-1);
  if (!originalRecord) return project;

  const forwardOperations = cloneGenerationValue(originalRecord.forwardOperations || []);
  const inverseOperations = applyOperations(project, forwardOperations);
  project.revisionHistory.redo.pop();
  const baseRevision = project.revision;
  project.revision += 1;
  const replayedRecord = {
    ...cloneGenerationValue(originalRecord),
    projectId: project.id,
    revision: project.revision,
    baseRevision,
    kind: 'redo',
    sourceRevision: originalRecord.revision,
    inverseOperations,
    createdAt: new Date().toISOString(),
  };
  appendRevisionHistory(project, 'undo', replayedRecord);
  project.pendingProposal = null;
  return finalizeMutation(normalizeGenerationProject(project), replayedRecord);
}

export function setGenerationPendingProposal(inputProject, inputProposal) {
  const project = normalizeGenerationProject(inputProject);
  if (project.pendingProposal) throw new Error('项目已有未决修改提案');
  project.pendingProposal = normalizeGenerationProposal(inputProposal, project.revision);
  project.updatedAt = new Date().toISOString();
  return project;
}

export function duplicateGenerationProjectSnapshot(inputProject, overrides = {}) {
  const source = normalizeGenerationProject(inputProject);
  return createGenerationProject({
    ...source,
    ...cloneGenerationValue(overrides),
    id: overrides.id || createGenerationId('project'),
    name: overrides.name || `${source.name} - 副本`,
    createdAt: undefined,
    updatedAt: undefined,
    archived: false,
    revision: 0,
    pendingProposal: null,
    revisionHistory: { undo: [], redo: [] },
    jobs: source.jobs.map(job => ({
      ...job,
      jobId: createGenerationId('job'),
      status: job.status === 'complete' ? 'complete' : 'interrupted',
    })),
  });
}

export { createGenerationProject, normalizeGenerationProject };
