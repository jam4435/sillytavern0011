import {
  createWorldbookSafe,
  deleteWorldbookSafe,
  enableGlobalLorebook,
  getCharWorldbooksSafe,
  getChatWorldbookSafe,
  getWorldbookBindingStatus,
  getWorldbookNamesSafe,
  getWorldbookSafe,
  rebindCharWorldbooksSafe,
  rebindChatWorldbookSafe,
  updateWorldbookEntries,
} from '../api.js';
import {
  consumeCreatedWorldbookTransaction,
  getCreatedWorldbookTransactionSnapshot,
  recordCreatedWorldbookTransaction,
} from './history.js';
import { auditGeneratedEntries, auditGenerationProject } from './worldbookGenerationAudit.js';
import {
  applyXmlFallbackKeywords,
  yamlDocumentToWorldbookEntry,
} from './worldbookYaml.js';

const RESERVED_ENTRY_PREFIXES = ['__WI_', '__LOREBOOK_EDITOR_'];
const SAFE_UPDATE_FIELDS = ['content', 'strategy.keys', 'position.order'];

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = stableSortObject(value[key]);
      return result;
    }, {});
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function fingerprintWorldbookEntry(entry) {
  return hashString(JSON.stringify(stableSortObject(entry || {})));
}

function isProtocolDocument(value) {
  return !!value?.trigger && !value?.strategy;
}

function normalizeInternalEntry(value, uid = undefined) {
  const source = isProtocolDocument(value) ? yamlDocumentToWorldbookEntry(value, { uid }) : clone(value || {});
  const normalizedUid = uid ?? source.uid;
  const entry = {
    ...source,
    ...(normalizedUid === undefined ? {} : { uid: Number(normalizedUid) }),
    name: `${source.name || source.title || ''}`.trim(),
    content: `${source.content || ''}`,
    enabled: source.enabled !== false,
    probability: Number.isFinite(Number(source.probability)) ? Number(source.probability) : 100,
    strategy: {
      type: source.strategy?.type === 'constant' ? 'constant' : 'selective',
      keys: asArray(source.strategy?.keys).map(key => `${key}`.trim()).filter(Boolean),
      keys_secondary: {
        logic: source.strategy?.keys_secondary?.logic || 'and_any',
        keys: asArray(source.strategy?.keys_secondary?.keys),
      },
      scan_depth: source.strategy?.scan_depth ?? 'same_as_global',
    },
    position: {
      type: source.position?.type || 'after_character_definition',
      role: source.position?.role || 'system',
      depth: Number(source.position?.depth ?? 0),
      order: Number(source.position?.order ?? 0),
    },
    recursion: {
      prevent_incoming: false,
      prevent_outgoing: false,
      delay_until: null,
      ...(source.recursion || {}),
    },
    effect: {
      sticky: null,
      cooldown: null,
      delay: null,
      ...(source.effect || {}),
    },
  };
  delete entry.nodeId;
  delete entry.entryId;
  delete entry.blueprintNodeId;
  delete entry.targetUid;
  delete entry.baseFingerprint;
  delete entry.beforeFingerprint;
  return entry;
}

function getEntryName(entry) {
  return `${entry?.name || entry?.title || entry?.trigger?.Title || ''}`.trim();
}

function isReservedEntry(entry) {
  const name = getEntryName(entry);
  return RESERVED_ENTRY_PREFIXES.some(prefix => name.startsWith(prefix));
}

function getProjectEntries(project, options) {
  const selectedGroupIds = options?.acceptedGroupIds ? new Set(options.acceptedGroupIds) : null;
  return asArray(options?.entries || project?.entryDrafts || project?.drafts)
    .filter(entry => entry?.accepted !== false)
    .filter(entry => !selectedGroupIds || selectedGroupIds.has(entry?.groupId || entry?.xml?.groupId || entry?.nodeId));
}

function collectAuditErrors(project, entries) {
  const projectReport = auditGenerationProject(project);
  const entriesReport = auditGeneratedEntries(entries, { blueprint: project?.blueprint });
  const errors = [
    ...asArray(projectReport?.errors),
    ...asArray(entriesReport?.errors),
    ...asArray(projectReport?.issues).filter(issue => issue?.severity === 'error'),
    ...asArray(entriesReport?.issues).filter(issue => issue?.severity === 'error'),
  ];
  const unique = new Map();
  errors.forEach(error => {
    const key = `${error?.code || ''}:${error?.message || JSON.stringify(error)}`;
    unique.set(key, error);
  });
  return {
    valid: unique.size === 0,
    errors: [...unique.values()],
    project: projectReport,
    entries: entriesReport,
  };
}

function getAtPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function setAtPath(object, path, value) {
  const parts = path.split('.');
  let current = object;
  parts.slice(0, -1).forEach(part => {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  });
  current[parts.at(-1)] = clone(value);
}

function applySafeExistingUpdate(currentEntry, update) {
  const source = update?.afterEntry || update?.entry || update?.patch || {};
  const next = clone(currentEntry);
  SAFE_UPDATE_FIELDS.forEach(path => {
    const value = getAtPath(source, path);
    if (value !== undefined) setAtPath(next, path, value);
  });
  return next;
}

function normalizeUpdate(update, project) {
  const uid = Number(update?.uid ?? update?.targetUid);
  const baselineEntries = asArray(
    project?.existingWorldbookBaseline?.entries ||
    project?.existingWorldbookBaseline ||
    project?.baseline?.entries ||
    project?.targetBaseline?.entries,
  );
  const baseline = baselineEntries.find(entry => Number(entry.uid) === uid);
  return {
    ...clone(update),
    uid,
    beforeFingerprint:
      update?.beforeFingerprint ||
      update?.baseFingerprint ||
      (update?.beforeEntry ? fingerprintWorldbookEntry(update.beforeEntry) : null) ||
      (baseline ? fingerprintWorldbookEntry(baseline) : null),
  };
}

function buildApplyFailure(error, lorebookName, extra = {}) {
  return {
    success: false,
    changed: false,
    targetMode: extra.targetMode || null,
    lorebookName,
    created: false,
    createdEntries: [],
    updatedUids: [],
    conflicts: clone(error?.conflicts || []),
    error,
    ...extra,
  };
}

function makeConflictError(conflicts) {
  const error = new Error(`世界书已发生冲突，未写入任何条目（${conflicts.length} 项）。`);
  error.name = 'GenerationApplyConflictError';
  error.conflicts = conflicts;
  return error;
}

function getExplicitUpdates(project, options, drafts) {
  const updates = [
    ...asArray(project?.existingUpdates || project?.targetUpdates),
    ...asArray(options?.updates),
  ];
  drafts.filter(draft => draft?.targetUid !== undefined).forEach(draft => {
    updates.push({
      uid: draft.targetUid,
      afterEntry: draft,
      beforeFingerprint: draft.beforeFingerprint || draft.baseFingerprint,
    });
  });
  return updates.map(update => normalizeUpdate(update, project));
}

export async function appendGeneratedEntriesAtomically(lorebookName, drafts, updates = [], options = {}) {
  if (!lorebookName) return buildApplyFailure(new Error('未提供目标世界书名。'), lorebookName);
  const normalizedUpdates = updates.map(update => normalizeUpdate(update, options.project || {}));
  const newDrafts = drafts.filter(draft => draft?.targetUid === undefined);
  let resultMeta = null;

  const mutation = await updateWorldbookEntries(
    lorebookName,
    currentEntries => {
      const conflicts = [];
      const currentByUid = new Map(currentEntries.map(entry => [Number(entry.uid), entry]));
      const updateUids = new Set(normalizedUpdates.map(update => update.uid));
      const occupiedNames = new Map(
        currentEntries
          .filter(entry => !updateUids.has(Number(entry.uid)))
          .map(entry => [getEntryName(entry), Number(entry.uid)])
          .filter(([name]) => name),
      );
      const pendingNames = new Set();

      normalizedUpdates.forEach(update => {
        const current = currentByUid.get(update.uid);
        if (!current) {
          conflicts.push({ type: 'entry-missing', uid: update.uid });
          return;
        }
        if (isReservedEntry(current)) {
          conflicts.push({ type: 'reserved-meta-entry', uid: update.uid, name: getEntryName(current) });
          return;
        }
        if (!update.beforeFingerprint) {
          conflicts.push({ type: 'missing-fingerprint', uid: update.uid });
          return;
        }
        const currentFingerprint = fingerprintWorldbookEntry(current);
        if (currentFingerprint !== update.beforeFingerprint) {
          conflicts.push({
            type: 'fingerprint-conflict',
            uid: update.uid,
            expected: update.beforeFingerprint,
            actual: currentFingerprint,
          });
        }
      });

      newDrafts.forEach(draft => {
        const name = getEntryName(draft);
        if (!name) {
          conflicts.push({ type: 'title-empty' });
          return;
        }
        if (occupiedNames.has(name)) {
          conflicts.push({ type: 'title-conflict', name, uid: occupiedNames.get(name) });
        }
        if (pendingNames.has(name)) {
          conflicts.push({ type: 'duplicate-generated-title', name });
        }
        pendingNames.add(name);
      });

      if (conflicts.length > 0) throw makeConflictError(conflicts);

      const nextEntries = currentEntries.map(entry => {
        const update = normalizedUpdates.find(item => item.uid === Number(entry.uid));
        return update ? applySafeExistingUpdate(entry, update) : entry;
      });
      const maxUid = currentEntries.reduce((max, entry) => Math.max(max, Number(entry.uid) || 0), 0);
      const createdEntries = newDrafts.map((draft, index) => normalizeInternalEntry(draft, maxUid + index + 1));
      nextEntries.push(...createdEntries);
      resultMeta = {
        previousCount: currentEntries.length,
        nextCount: nextEntries.length,
        createdEntries: clone(createdEntries),
        updatedUids: normalizedUpdates.map(update => update.uid),
      };
      return nextEntries;
    },
    {
      trackHistory: true,
      transactionType: 'worldbook-generation-apply',
      transactionMeta: {
        projectId: options?.projectId || null,
        requestedCreateCount: newDrafts.length,
        requestedUpdateCount: normalizedUpdates.length,
      },
    },
  );

  if (!mutation?.success) {
    return buildApplyFailure(mutation?.error || new Error('更新世界书失败。'), lorebookName, {
      targetMode: 'existing',
    });
  }
  return {
    success: true,
    changed: mutation.changed,
    targetMode: 'existing',
    lorebookName,
    created: false,
    createdEntries: resultMeta?.createdEntries || [],
    updatedUids: resultMeta?.updatedUids || [],
    conflicts: [],
    error: null,
    meta: resultMeta,
  };
}

async function createGeneratedWorldbook(lorebookName, drafts, project) {
  const names = await getWorldbookNamesSafe();
  if (asArray(names).includes(lorebookName)) {
    return buildApplyFailure(new Error(`世界书“${lorebookName}”已存在。`), lorebookName, {
      targetMode: 'new',
      conflicts: [{ type: 'worldbook-name-conflict', name: lorebookName }],
    });
  }

  const entries = drafts.map((draft, index) => normalizeInternalEntry(draft, index + 1));
  const created = await createWorldbookSafe(lorebookName, entries);
  if (created !== true) {
    return buildApplyFailure(new Error(`未能安全创建世界书“${lorebookName}”。`), lorebookName, {
      targetMode: 'new',
    });
  }
  recordCreatedWorldbookTransaction(lorebookName, entries, {
    projectId: project?.id || project?.projectId || null,
    entryCount: entries.length,
    snapshotFingerprint: hashString(JSON.stringify(stableSortObject(entries))),
  });
  return {
    success: true,
    changed: true,
    targetMode: 'new',
    lorebookName,
    created: true,
    createdEntries: clone(entries),
    updatedUids: [],
    conflicts: [],
    error: null,
  };
}

/**
 * Apply an accepted generation project without touching UI state.
 * Existing books use one updateWorldbookWith mutation; new books are created
 * only after a fresh name check and receive UID 1..N.
 */
export async function applyGenerationProjectToTarget(project, options = {}) {
  const projectTargetType = project?.target?.type;
  const targetMode =
    options.targetMode ||
    options.mode ||
    project?.target?.mode ||
    (projectTargetType === 'create' ? 'new' : 'existing');
  const lorebookName =
    options.lorebookName ||
    options.name ||
    project?.target?.lorebookName ||
    project?.target?.name ||
    '';
  const rawDrafts = getProjectEntries(project, options);
  const drafts = applyXmlFallbackKeywords(rawDrafts, project?.blueprint);
  const audit = collectAuditErrors(project, drafts);
  if (!audit.valid && options.ignoreAuditErrors !== true) {
    return buildApplyFailure(new Error('生成项目仍存在硬错误，已阻止写入。'), lorebookName, {
      targetMode,
      audit,
    });
  }
  if (rawDrafts.length === 0) {
    return buildApplyFailure(new Error('没有可写入的已接受条目。'), lorebookName, { targetMode, audit });
  }

  if (targetMode === 'new' || targetMode === 'create') {
    return createGeneratedWorldbook(lorebookName, drafts, project);
  }

  const updates = getExplicitUpdates(project, options, rawDrafts);
  return appendGeneratedEntriesAtomically(lorebookName, drafts, updates, {
    project,
    projectId: project?.id || project?.projectId || null,
  });
}

export async function bindCreatedWorldbook(lorebookName, mode) {
  const transaction = getCreatedWorldbookTransactionSnapshot(lorebookName);
  if (!transaction) {
    return { success: false, lorebookName, mode, error: new Error('没有可绑定的新建世界书事务。') };
  }
  const names = await getWorldbookNamesSafe();
  if (!asArray(names).includes(lorebookName)) {
    return { success: false, lorebookName, mode, error: new Error('新建世界书已不存在。') };
  }

  try {
    if (mode === 'character-additional') {
      const current = await getCharWorldbooksSafe();
      const additional = [...new Set([...current.additional, lorebookName])].filter(name => name !== current.primary);
      await rebindCharWorldbooksSafe({ primary: current.primary, additional });
    } else if (mode === 'character-primary') {
      const current = await getCharWorldbooksSafe();
      const additional = [
        ...(current.primary && current.primary !== lorebookName ? [current.primary] : []),
        ...current.additional,
      ].filter(name => name && name !== lorebookName);
      await rebindCharWorldbooksSafe({ primary: lorebookName, additional: [...new Set(additional)] });
    } else if (mode === 'chat') {
      const previous = await getChatWorldbookSafe();
      await rebindChatWorldbookSafe(lorebookName);
      return { success: true, lorebookName, mode, previousChatWorldbook: previous, rollbackAvailable: false };
    } else if (mode === 'global') {
      await enableGlobalLorebook(lorebookName);
    } else {
      throw new Error(`未知绑定方式: ${mode}`);
    }
    return { success: true, lorebookName, mode, rollbackAvailable: false };
  } catch (error) {
    return { success: false, lorebookName, mode, error };
  }
}

export async function rollbackCreatedWorldbook(lorebookName) {
  const transaction = getCreatedWorldbookTransactionSnapshot(lorebookName);
  if (!transaction) {
    return {
      success: false,
      changed: false,
      lorebookName,
      reason: 'transaction-missing',
      error: new Error('没有可撤销的新建世界书事务。'),
    };
  }

  const [currentResult, bindingStatus] = await Promise.all([
    getWorldbookSafe(lorebookName),
    getWorldbookBindingStatus(lorebookName),
  ]);
  if (!currentResult?.success) {
    return {
      success: false,
      changed: false,
      lorebookName,
      reason: 'worldbook-missing',
      error: currentResult?.error || new Error('新建世界书已不存在。'),
    };
  }
  if (bindingStatus?.bound) {
    return {
      success: false,
      changed: false,
      lorebookName,
      reason: 'worldbook-bound',
      bindings: bindingStatus.bindings,
      error: new Error('世界书已被绑定，请先解除绑定后再撤销创建。'),
    };
  }
  if (fingerprintWorldbookEntry(currentResult.data) !== fingerprintWorldbookEntry(transaction.snapshot)) {
    return {
      success: false,
      changed: false,
      lorebookName,
      reason: 'worldbook-changed',
      error: new Error('世界书内容在创建后已变化，不能整本删除。'),
    };
  }

  const deleted = await deleteWorldbookSafe(lorebookName);
  if (!deleted) {
    return {
      success: false,
      changed: false,
      lorebookName,
      reason: 'delete-failed',
      error: new Error('删除新建世界书失败。'),
    };
  }
  consumeCreatedWorldbookTransaction(lorebookName);
  return {
    success: true,
    changed: true,
    lorebookName,
    reason: 'rolled-back',
    error: null,
  };
}

export const generationApplyInternals = {
  applySafeExistingUpdate,
  collectAuditErrors,
  normalizeInternalEntry,
};
