import { log, logWarning } from './era-utils.js';

const RECENT_SIGNATURE_TTL_MS = 3000;
const pendingSignatures = new Set();
const recentSignatures = new Map();

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function pruneRecentSignatures(now = Date.now()) {
  for (const [signature, timestamp] of recentSignatures) {
    if (now - timestamp > RECENT_SIGNATURE_TTL_MS) {
      recentSignatures.delete(signature);
    }
  }
}

function isDuplicateSignature(signature) {
  const now = Date.now();
  pruneRecentSignatures(now);
  return pendingSignatures.has(signature) || recentSignatures.has(signature);
}

function markPending(signature) {
  pendingSignatures.add(signature);
}

function markDone(signature) {
  pendingSignatures.delete(signature);
  recentSignatures.set(signature, Date.now());
}

function isEmptyPatch(value) {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function buildInsertPatch(current, patch) {
  if (!isPlainObject(patch)) {
    return current === undefined ? cloneJson(patch) : undefined;
  }

  if (current === undefined) {
    return cloneJson(patch);
  }

  if (!isPlainObject(current)) {
    return undefined;
  }

  const result = {};
  for (const key of Object.keys(patch)) {
    const childPatch = buildInsertPatch(current[key], patch[key]);
    if (childPatch !== undefined) {
      result[key] = childPatch;
    }
  }
  return isEmptyPatch(result) ? undefined : result;
}

function buildUpdatePatch(current, patch) {
  if (current === undefined) {
    return undefined;
  }

  if (!isPlainObject(patch) || !isPlainObject(current)) {
    return deepEqual(current, patch) ? undefined : cloneJson(patch);
  }

  const result = {};
  for (const key of Object.keys(patch)) {
    const childPatch = buildUpdatePatch(current[key], patch[key]);
    if (childPatch !== undefined) {
      result[key] = childPatch;
    }
  }
  return isEmptyPatch(result) ? undefined : result;
}

function buildAssignPatch(current, patch) {
  return deepEqual(current, patch) ? undefined : cloneJson(patch);
}

function buildDeletePatch(current, patch) {
  if (current === undefined) {
    return undefined;
  }

  if (!isPlainObject(patch) || Object.keys(patch).length === 0) {
    return {};
  }

  if (!isPlainObject(current)) {
    return undefined;
  }

  const result = {};
  for (const key of Object.keys(patch)) {
    const childPatch = buildDeletePatch(current[key], patch[key]);
    if (childPatch !== undefined) {
      result[key] = childPatch;
    }
  }
  return isEmptyPatch(result) ? undefined : result;
}

function buildEffectivePatch(action, currentStat, payload) {
  if (!isPlainObject(payload)) {
    return undefined;
  }

  const result = {};
  for (const key of Object.keys(payload)) {
    const current = currentStat?.[key];
    const next =
      action === 'insert'
        ? buildInsertPatch(current, payload[key])
        : action === 'update'
          ? buildUpdatePatch(current, payload[key])
          : action === 'delete'
            ? buildDeletePatch(current, payload[key])
            : buildAssignPatch(current, payload[key]);

    if (next !== undefined) {
      result[key] = next;
    }
  }

  return isEmptyPatch(result) ? undefined : result;
}

function applyInsert(target, patch) {
  if (!isPlainObject(patch)) {
    return;
  }

  for (const key of Object.keys(patch)) {
    if (target[key] === undefined) {
      target[key] = cloneJson(patch[key]);
    } else if (isPlainObject(target[key]) && isPlainObject(patch[key])) {
      applyInsert(target[key], patch[key]);
    }
  }
}

function applyUpdate(target, patch) {
  if (!isPlainObject(patch)) {
    return;
  }

  for (const key of Object.keys(patch)) {
    if (target[key] === undefined) {
      continue;
    }

    if (isPlainObject(target[key]) && isPlainObject(patch[key])) {
      applyUpdate(target[key], patch[key]);
    } else {
      target[key] = cloneJson(patch[key]);
    }
  }
}

function applyAssign(target, patch) {
  if (!isPlainObject(patch)) {
    return;
  }

  for (const key of Object.keys(patch)) {
    target[key] = cloneJson(patch[key]);
  }
}

function applyDelete(target, patch) {
  if (!isPlainObject(patch)) {
    return;
  }

  for (const key of Object.keys(patch)) {
    if (target[key] === undefined) {
      continue;
    }

    if (isPlainObject(patch[key]) && Object.keys(patch[key]).length > 0 && isPlainObject(target[key])) {
      applyDelete(target[key], patch[key]);
    } else {
      delete target[key];
    }
  }
}

function applyPatchToStat(statData, action, patch) {
  if (action === 'insert') {
    applyInsert(statData, patch);
  } else if (action === 'update') {
    applyUpdate(statData, patch);
  } else if (action === 'delete') {
    applyDelete(statData, patch);
  } else {
    applyAssign(statData, patch);
  }
}

async function emitDirectWriteDone(action, reason) {
  const variables = await getVariables({ type: 'chat' });
  const stat = variables?.stat_data || {};
  eventEmit('era:writeDone', {
    mk: 'direct-chat-write',
    message_id: null,
    actions: { directChatWrite: true, [action]: true },
    stat,
    statWithoutMeta: stat,
    editLogs: {},
    selectedMks: [],
    consecutiveProcessingCount: 1,
    reason,
  });
}

export async function writeDirectChatVariables(action, payload, reason = 'direct-chat-write') {
  const currentVariables = await getVariables({ type: 'chat' });
  const currentStat = currentVariables?.stat_data || {};
  const effectivePatch = buildEffectivePatch(action, currentStat, payload);

  if (!effectivePatch) {
    log(`跳过空 ${action} 直接写入: ${reason}`);
    return false;
  }

  const signature = `direct:${action}:${stableStringify(effectivePatch)}`;
  if (isDuplicateSignature(signature)) {
    log(`跳过重复 ${action} 直接写入: ${reason}`);
    return false;
  }

  markPending(signature);
  try {
    await updateVariablesWith(variables => {
      const nextVariables = cloneJson(variables || {});
      if (!isPlainObject(nextVariables.stat_data)) {
        nextVariables.stat_data = {};
      }
      applyPatchToStat(nextVariables.stat_data, action, effectivePatch);
      return nextVariables;
    }, { type: 'chat' });

    await emitDirectWriteDone(action, reason);
    log(`直接写入完成: ${reason}`);
    return true;
  } catch (error) {
    logWarning(`直接写入失败: ${reason}`, error);
    return false;
  } finally {
    markDone(signature);
  }
}

export const writeDirectInsert = (payload, reason) => writeDirectChatVariables('insert', payload, reason);
export const writeDirectUpdate = (payload, reason) => writeDirectChatVariables('update', payload, reason);
export const writeDirectDelete = (payload, reason) => writeDirectChatVariables('delete', payload, reason);
export const writeDirectAssign = (payload, reason) => writeDirectChatVariables('assign', payload, reason);

export async function writeEraCommand(command, payload, reason = command) {
  const signature = `era:${command}:${stableStringify(payload)}`;
  if (isDuplicateSignature(signature)) {
    log(`跳过重复 ERA 写入: ${reason}`);
    return false;
  }

  markPending(signature);
  try {
    eventEmit(command, payload);
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 1500);
      eventOnce('era:writeDone', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    return true;
  } finally {
    markDone(signature);
  }
}

export const writeEraInsert = (payload, reason) => writeEraCommand('era:insertByObject', payload, reason);
export const writeEraUpdate = (payload, reason) => writeEraCommand('era:updateByObject', payload, reason);
export const writeEraDelete = (payload, reason) => writeEraCommand('era:deleteByObject', payload, reason);
