import {
  clearCreatedWorldbookTransaction,
  clearLastMutationTransaction,
  getCreatedWorldbookTransaction,
  getLastMutationTransaction,
  setCreatedWorldbookTransaction,
  setLastMutationTransaction,
} from '../state.js';
import { getPositionLabel } from '../position.js';
import { errorCatched } from '../utils.js';

const rawGetWorldbook = window.parent.getWorldbook || window.getWorldbook;
const rawUpdateWorldbookWith = window.parent.updateWorldbookWith || window.updateWorldbookWith;

function cloneSnapshot(entries) {
  return Array.isArray(entries) ? _.cloneDeep(entries) : [];
}

async function captureSnapshot(lorebookName) {
  if (typeof rawGetWorldbook !== 'function') {
    throw new Error('核心函数 getWorldbook 不可用，无法创建事务快照。');
  }

  const entries = await rawGetWorldbook(lorebookName);
  return cloneSnapshot(entries);
}

export const beginMutationTransaction = errorCatched(async (lorebookName, meta = {}, snapshot = null) => {
  return {
    lorebookName,
    meta: _.cloneDeep(meta),
    snapshot: snapshot ? cloneSnapshot(snapshot) : await captureSnapshot(lorebookName),
    startedAt: Date.now(),
  };
}, 'beginMutationTransaction');

export const commitMutationTransaction = errorCatched(async (transaction, commitMeta = {}) => {
  if (!transaction?.lorebookName) {
    throw new Error('事务提交失败：缺少 lorebookName。');
  }

  const committedTransaction = {
    ...transaction,
    meta: {
      ..._.cloneDeep(transaction.meta || {}),
      ..._.cloneDeep(commitMeta || {}),
    },
    committedAt: Date.now(),
  };

  setLastMutationTransaction(transaction.lorebookName, committedTransaction);
  return committedTransaction;
}, 'commitMutationTransaction');

export const rollbackLastTransaction = errorCatched(async lorebookName => {
  const transaction = getLastMutationTransaction(lorebookName);
  if (!transaction) {
    return {
      success: false,
      changed: false,
      error: new Error('当前世界书没有可回滚的事务。'),
      meta: { lorebookName },
    };
  }

  if (typeof rawUpdateWorldbookWith !== 'function') {
    return {
      success: false,
      changed: false,
      error: new Error('核心函数 updateWorldbookWith 不可用，无法执行回滚。'),
      meta: { lorebookName, transactionMeta: transaction.meta },
    };
  }

  await rawUpdateWorldbookWith(lorebookName, () => cloneSnapshot(transaction.snapshot));
  clearLastMutationTransaction(lorebookName);

  return {
    success: true,
    changed: true,
    error: null,
    meta: {
      lorebookName,
      rolledBackAt: Date.now(),
      transactionMeta: _.cloneDeep(transaction.meta || {}),
    },
  };
}, 'rollbackLastTransaction');

export function getLastTransactionMeta(lorebookName) {
  const transaction = getLastMutationTransaction(lorebookName);
  if (!transaction) {
    return null;
  }

  return {
    lorebookName,
    startedAt: transaction.startedAt,
    committedAt: transaction.committedAt,
    ..._.cloneDeep(transaction.meta || {}),
  };
}

export function recordCreatedWorldbookTransaction(lorebookName, entries, meta = {}) {
  if (!lorebookName) {
    throw new Error('创建世界书事务缺少 lorebookName。');
  }
  const transaction = {
    lorebookName,
    snapshot: cloneSnapshot(entries),
    meta: {
      operationType: 'worldbook-create',
      ..._.cloneDeep(meta || {}),
    },
    createdAt: Date.now(),
  };
  setCreatedWorldbookTransaction(lorebookName, transaction);
  return _.cloneDeep(transaction);
}

export function getCreatedWorldbookTransactionMeta(lorebookName) {
  const transaction = getCreatedWorldbookTransaction(lorebookName);
  if (!transaction) return null;
  return {
    lorebookName,
    createdAt: transaction.createdAt,
    ..._.cloneDeep(transaction.meta || {}),
  };
}

export function getCreatedWorldbookTransactionSnapshot(lorebookName) {
  const transaction = getCreatedWorldbookTransaction(lorebookName);
  return transaction ? _.cloneDeep(transaction) : null;
}

export function consumeCreatedWorldbookTransaction(lorebookName) {
  const transaction = getCreatedWorldbookTransaction(lorebookName);
  if (transaction) {
    clearCreatedWorldbookTransaction(lorebookName);
  }
  return transaction;
}

function getEntryTitle(entry) {
  return entry?.name || `UID ${entry?.uid ?? '未知'}`;
}

function summarizeContent(content) {
  if (typeof content !== 'string') {
    return '';
  }

  const singleLine = content.replace(/\s+/g, ' ').trim();
  return singleLine.length > 80 ? `${singleLine.slice(0, 80)}...` : singleLine;
}

function buildFieldDiffs(beforeEntry, afterEntry) {
  const diffs = [];
  const pushDiff = (label, beforeValue, afterValue) => {
    if (!_.isEqual(beforeValue, afterValue)) {
      diffs.push({
        label,
        before: beforeValue,
        after: afterValue,
      });
    }
  };

  pushDiff('标题', beforeEntry.name || '', afterEntry.name || '');
  pushDiff('启用', beforeEntry.enabled !== false, afterEntry.enabled !== false);
  pushDiff('内容摘要', summarizeContent(beforeEntry.content), summarizeContent(afterEntry.content));
  pushDiff('激活方式', beforeEntry.strategy?.type || 'selective', afterEntry.strategy?.type || 'selective');
  pushDiff('主要关键字', beforeEntry.strategy?.keys || [], afterEntry.strategy?.keys || []);
  pushDiff(
    '位置',
    getPositionLabel(beforeEntry.position || 'after_character_definition'),
    getPositionLabel(afterEntry.position || 'after_character_definition'),
  );
  pushDiff('深度', beforeEntry.position?.depth ?? 4, afterEntry.position?.depth ?? 4);
  pushDiff('顺序', beforeEntry.position?.order ?? 0, afterEntry.position?.order ?? 0);
  pushDiff('概率', beforeEntry.probability ?? 100, afterEntry.probability ?? 100);
  pushDiff('防止递归', beforeEntry.recursion?.prevent_outgoing === true, afterEntry.recursion?.prevent_outgoing === true);
  pushDiff('排除递归', beforeEntry.recursion?.prevent_incoming === true, afterEntry.recursion?.prevent_incoming === true);
  pushDiff('延迟递归', beforeEntry.recursion?.delay_until ?? null, afterEntry.recursion?.delay_until ?? null);

  return diffs;
}

export const getRollbackPreview = errorCatched(async lorebookName => {
  const transaction = getLastMutationTransaction(lorebookName);
  if (!transaction) {
    return {
      available: false,
      lorebookName,
      meta: null,
      summary: {
        restoreCount: 0,
        removeCount: 0,
        modifyCount: 0,
      },
      items: [],
    };
  }

  const currentEntries = await captureSnapshot(lorebookName);
  const previousEntries = cloneSnapshot(transaction.snapshot);
  const previousMap = new Map(previousEntries.map(entry => [entry.uid, entry]));
  const currentMap = new Map(currentEntries.map(entry => [entry.uid, entry]));
  const items = [];

  previousEntries.forEach(previousEntry => {
    const currentEntry = currentMap.get(previousEntry.uid);
    if (!currentEntry) {
      items.push({
        type: 'restore',
        uid: previousEntry.uid,
        title: getEntryTitle(previousEntry),
        diffs: [],
      });
      return;
    }

    if (!_.isEqual(previousEntry, currentEntry)) {
      items.push({
        type: 'modify',
        uid: previousEntry.uid,
        title: getEntryTitle(previousEntry),
        diffs: buildFieldDiffs(previousEntry, currentEntry),
      });
    }
  });

  currentEntries.forEach(currentEntry => {
    if (!previousMap.has(currentEntry.uid)) {
      items.push({
        type: 'remove',
        uid: currentEntry.uid,
        title: getEntryTitle(currentEntry),
        diffs: [],
      });
    }
  });

  return {
    available: items.length > 0,
    lorebookName,
    meta: getLastTransactionMeta(lorebookName),
    summary: {
      restoreCount: items.filter(item => item.type === 'restore').length,
      removeCount: items.filter(item => item.type === 'remove').length,
      modifyCount: items.filter(item => item.type === 'modify').length,
    },
    items,
  };
}, 'getRollbackPreview');
