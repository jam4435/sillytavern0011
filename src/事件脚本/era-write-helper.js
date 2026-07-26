import { log, logWarning } from './era-utils.js';
import { emitEraVariableWriteAndWait, runDirectChatVariableWrite } from '../shared/directVariableWrite';

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

function releasePending(signature) {
  pendingSignatures.delete(signature);
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

function hashStableString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizeTransactionOperation(operation) {
  if (!isPlainObject(operation) || !isPlainObject(operation.payload)) {
    return null;
  }

  const type = String(operation.type || '').trim();
  if (!['insert', 'update', 'delete'].includes(type)) {
    return null;
  }

  return {
    type,
    payload: cloneJson(operation.payload),
  };
}

function buildTransactionExpectation(currentVariables, operations) {
  const expectedVariables = cloneJson(currentVariables || {});
  if (!isPlainObject(expectedVariables.stat_data)) {
    expectedVariables.stat_data = {};
  }

  const effectiveOperations = [];
  for (const operation of operations) {
    const effectivePatch = buildEffectivePatch(operation.type, expectedVariables.stat_data, operation.payload);
    if (!effectivePatch) continue;
    effectiveOperations.push({
      type: operation.type,
      payload: effectivePatch,
    });
    applyPatchToStat(expectedVariables.stat_data, operation.type, effectivePatch);
  }

  return {
    expectedStat: expectedVariables.stat_data,
    effectiveOperations,
  };
}

function patchMatchesExpected(actual, expected, patch, operationType) {
  if (!isPlainObject(patch)) {
    return deepEqual(actual, expected);
  }

  for (const [key, childPatch] of Object.entries(patch)) {
    const actualChild = actual?.[key];
    const expectedChild = expected?.[key];
    if (isPlainObject(childPatch) && Object.keys(childPatch).length > 0 && isPlainObject(expectedChild)) {
      if (!patchMatchesExpected(actualChild, expectedChild, childPatch, operationType)) {
        return false;
      }
      continue;
    }

    if (operationType === 'delete' && expectedChild === undefined) {
      if (actualChild !== undefined) return false;
      continue;
    }

    if (!deepEqual(actualChild, expectedChild)) {
      return false;
    }
  }
  return true;
}

function transactionExpectationMatches(actualStat, expectedStat, effectiveOperations) {
  return effectiveOperations.every(operation =>
    patchMatchesExpected(actualStat, expectedStat, operation.payload, operation.type),
  );
}

function objectContainsPatch(container, patch) {
  if (!isPlainObject(patch)) {
    return deepEqual(container, patch);
  }
  if (!isPlainObject(container)) return false;
  return Object.entries(patch).every(([key, value]) =>
    isPlainObject(value) ? objectContainsPatch(container[key], value) : deepEqual(container[key], value),
  );
}

function getLatestMessageText(message) {
  if (!message) return '';
  for (const key of ['message', 'mes', 'content']) {
    if (typeof message[key] === 'string') return message[key];
  }
  return '';
}

function parseVariableBlocks(message) {
  const text = getLatestMessageText(message);
  if (!text.includes('<Variable')) return [];

  const blocks = [];
  const regex = /<(VariableInsert|VariableEdit|VariableDelete)>\s*([\s\S]*?)\s*<\/\1>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const payload = JSON.parse(match[2]);
      if (isPlainObject(payload)) {
        blocks.push({ tag: match[1], payload });
      }
    } catch {
      // 非 JSON 变量块无法稳定匹配，交给最终 stat_data 回读判断。
    }
  }
  return blocks;
}

function transactionBlocksWritten(message, operations) {
  const expectedTags = {
    insert: 'VariableInsert',
    update: 'VariableEdit',
    delete: 'VariableDelete',
  };
  const blocks = parseVariableBlocks(message);
  return operations.every(operation =>
    blocks.some(
      block => block.tag === expectedTags[operation.type] && objectContainsPatch(block.payload, operation.payload),
    ),
  );
}

function getTransactionMatchValue(detail, keys) {
  if (!isPlainObject(detail)) return undefined;
  for (const key of keys) {
    if (typeof detail[key] === 'string') return detail[key];
  }
  if (isPlainObject(detail.transaction)) {
    for (const key of keys) {
      if (typeof detail.transaction[key] === 'string') return detail.transaction[key];
    }
  }
  return undefined;
}

function matchesTransactionWriteDone(detail, transactionId, transactionSignature) {
  if (isPlainObject(detail) && Array.isArray(detail.transactionIds) && detail.transactionIds.includes(transactionId)) {
    return true;
  }
  const observedTransactionId = getTransactionMatchValue(detail, ['transactionId', 'transaction_id', 'id']);
  if (observedTransactionId) {
    return observedTransactionId === transactionId;
  }

  const observedSignature = getTransactionMatchValue(detail, [
    'transactionSignature',
    'transaction_signature',
    'signature',
  ]);
  return !!observedSignature && observedSignature === transactionSignature;
}

function getTransactionContextKey() {
  let chatId = '';
  let messageId = null;
  let swipeId = null;
  try {
    chatId = String(SillyTavern?.getCurrentChatId?.() || '');
  } catch {
    // ignore
  }
  try {
    const latestMessage = getChatMessages(-1, { include_swipes: true })?.[0];
    messageId = latestMessage?.message_id ?? latestMessage?.messageId ?? latestMessage?.id ?? null;
    swipeId = latestMessage?.swipe_id ?? latestMessage?.swipeId ?? null;
  } catch {
    // 未能读取楼层时仍可依赖操作签名；未知结果路径会再次回读。
  }
  return stableStringify({ chatId, messageId, swipeId });
}

async function waitForTransactionWriteDone(transactionId, transactionSignature, detail, timeoutMs, timeoutMessage) {
  let timer = null;
  let listener = null;
  let rejectWait = null;
  let settled = false;

  const cleanup = () => {
    listener?.stop();
    listener = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const waitForWriteDone = new Promise((resolve, reject) => {
    rejectWait = reject;
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    listener = eventOn('era:writeDone', writeDoneDetail => {
      if (!matchesTransactionWriteDone(writeDoneDetail, transactionId, transactionSignature)) {
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      resolve(writeDoneDetail);
    });
  });

  const rejectUnknownDispatch = error => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectWait?.(error instanceof Error ? error : new Error(String(error)));
  };

  try {
    const dispatch = eventEmit('era:transactionByObject', detail);
    void Promise.resolve(dispatch).catch(error => {
      logWarning(`ERA 事务事件监听链异常，进入未知结果回读: ${transactionId}`, error);
      rejectUnknownDispatch(error);
    });
  } catch (error) {
    logWarning(`ERA 事务事件发送异常，进入未知结果回读: ${transactionId}`, error);
    rejectUnknownDispatch(error);
  }

  return waitForWriteDone;
}

async function rereadTransactionState(expectedStat, effectiveOperations, reason) {
  let latestMessage = null;
  try {
    latestMessage = getChatMessages(-1, { include_swipes: true })?.[0] || null;
  } catch (error) {
    logWarning(`ERA 事务未知结果后回读最新消息失败: ${reason}`, error);
  }

  const latestVariables = await getVariables({ type: 'chat' });
  const persisted = transactionExpectationMatches(latestVariables?.stat_data || {}, expectedStat, effectiveOperations);
  const messageWritten = transactionBlocksWritten(latestMessage, effectiveOperations);
  return { persisted, messageWritten, latestMessage, latestVariables };
}

export async function writeEraTransaction(operations, reason = 'era-transaction', options = {}) {
  const normalizedOperations = (Array.isArray(operations) ? operations : [])
    .map(normalizeTransactionOperation)
    .filter(Boolean);
  if (normalizedOperations.length === 0) {
    log(`跳过空 ERA 事务: ${reason}`);
    return false;
  }

  const currentVariables = await getVariables({ type: 'chat' });
  const { expectedStat, effectiveOperations } = buildTransactionExpectation(currentVariables, normalizedOperations);
  if (effectiveOperations.length === 0) {
    log(`跳过无有效变更的 ERA 事务: ${reason}`);
    return true;
  }

  const transactionSignature = stableStringify({
    context: getTransactionContextKey(),
    operations: effectiveOperations,
  });
  const signature = `era-transaction:${transactionSignature}`;
  if (isDuplicateSignature(signature)) {
    log(`跳过重复 ERA 事务: ${reason}`);
    return false;
  }

  const transactionId =
    options.transactionId || `event-script-${hashStableString(transactionSignature)}-${transactionSignature.length}`;
  const detail = {
    transactionId,
    transactionSignature,
    operations: effectiveOperations,
  };

  markPending(signature);
  try {
    await waitForTransactionWriteDone(
      transactionId,
      transactionSignature,
      detail,
      options.timeoutMs ?? 10000,
      options.timeoutMessage ?? `ERA 事务写入完成信号超时: ${reason}`,
    );
    markDone(signature);
    log(`ERA 事务写入完成: ${reason}`);
    return true;
  } catch (error) {
    logWarning(`ERA 事务结果未知，开始回读消息与最终变量: ${reason}`, error);
    let reread = await rereadTransactionState(expectedStat, effectiveOperations, reason);
    if (reread.persisted || reread.messageWritten) {
      logWarning(
        `ERA 事务${reread.persisted ? '最终变量已落库' : '变量块已写入消息'}但 writeDone 未确认，` +
          `执行 manual_sync 且禁止自动重发: ${reason}`,
      );
      try {
        await eventEmit('manual_sync');
      } catch (syncError) {
        logWarning(`ERA 事务兜底 manual_sync 失败: ${reason}`, syncError);
      }
      if (!reread.persisted) {
        reread = await rereadTransactionState(expectedStat, effectiveOperations, reason);
      }
    }

    if (reread.persisted) {
      markDone(signature);
      return true;
    }

    if (reread.messageWritten) {
      markDone(signature);
      logWarning(`ERA 事务块已写入但 manual_sync 后仍未确认最终变量，保留短期去重: ${reason}`);
    } else {
      releasePending(signature);
      logWarning(`ERA 事务回读未确认消息块或最终变量，禁止本次调用自动重发: ${reason}`);
    }
    return false;
  }
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
    await runDirectChatVariableWrite(
      {
        source: 'event-script',
        operation: action,
        reason,
        refreshHint: 'event-state',
      },
      () =>
        updateVariablesWith(
          variables => {
            const nextVariables = variables || {};
            if (!isPlainObject(nextVariables.stat_data)) {
              nextVariables.stat_data = {};
            }
            applyPatchToStat(nextVariables.stat_data, action, effectivePatch);
            return nextVariables;
          },
          { type: 'chat' },
        ),
    );

    log(`直接写入完成: ${reason}`);
    releasePending(signature);
    return true;
  } catch (error) {
    releasePending(signature);
    logWarning(`直接写入失败: ${reason}`, error);
    return false;
  }
}

export const writeDirectInsert = (payload, reason) => writeDirectChatVariables('insert', payload, reason);
export const writeDirectUpdate = (payload, reason) => writeDirectChatVariables('update', payload, reason);
export const writeDirectDelete = (payload, reason) => writeDirectChatVariables('delete', payload, reason);
export const writeDirectAssign = (payload, reason) => writeDirectChatVariables('assign', payload, reason);

export async function writeEraCommand(command, payload, reason = command, options = {}) {
  const signature = `era:${command}:${stableStringify(payload)}`;
  if (isDuplicateSignature(signature)) {
    log(`跳过重复 ERA 写入: ${reason}`);
    return false;
  }

  markPending(signature);
  try {
    const operation =
      command === 'era:insertByObject'
        ? 'insert'
        : command === 'era:updateByObject'
          ? 'update'
          : command === 'era:deleteByObject' || command === 'era:deleteByPath'
            ? 'delete'
            : 'replace';
    await emitEraVariableWriteAndWait({
      source: 'event-script',
      operation,
      reason,
      eventName: command,
      detail: payload,
      timeoutMs: options.timeoutMs ?? 10000,
      timeoutMessage: options.timeoutMessage ?? `ERA ${command} 写入完成信号超时: ${reason}`,
      expectedMessageId: options.expectedMessageId,
      expectedAction: options.expectedAction,
    });
    return true;
  } finally {
    markDone(signature);
  }
}

export const writeEraInsert = (payload, reason) => writeEraCommand('era:insertByObject', payload, reason);
export const writeEraUpdate = (payload, reason) => writeEraCommand('era:updateByObject', payload, reason);
export const writeEraDelete = (payload, reason) => writeEraCommand('era:deleteByObject', payload, reason);
