import { ensureNumericUID, errorCatched } from './utils.js';
import { beginMutationTransaction, commitMutationTransaction } from './features/history.js';
import { applyPositionSelectionToEntry, normalizePositionRole } from './position.js';
import { addPinnedEntry, removePinnedEntry } from './settings.js';

/**
 * API 调用结果类型
 * @typedef {Object} ApiResult
 * @property {boolean} success - 是否成功
 * @property {any} data - 返回数据
 * @property {Error} [error] - 错误对象（失败时）
 */

// 这些是旧版API或通用API，暂时保留
export const triggerSlash = window.parent.triggerSlash || window.triggerSlash;
export const getIframeName = window.parent.getIframeName || window.getIframeName;
export const rawUpdateWorldbookWith = window.parent.updateWorldbookWith || window.updateWorldbookWith;
export const rawCreateWorldbookEntries = window.parent.createWorldbookEntries || window.createWorldbookEntries;
export const rawDeleteWorldbookEntries = window.parent.deleteWorldbookEntries || window.deleteWorldbookEntries;

const AUTO_UNPIN_POSITION_FIELDS = new Set([
  'position.type',
  'position.role',
  'position.depth',
  'position.order',
  'position',
  'depth',
  'order',
]);

function buildMutationResult(success, changed, error = null, meta = {}, data = null) {
  return { success, changed, error, meta, data };
}

function cloneEntriesSnapshot(entries) {
  return Array.isArray(entries) ? _.cloneDeep(entries) : [];
}

function hasEntryChanges(previousEntries, nextEntries) {
  if (!Array.isArray(previousEntries) || !Array.isArray(nextEntries)) {
    return previousEntries !== nextEntries;
  }

  if (previousEntries === nextEntries) {
    return false;
  }

  return !_.isEqual(previousEntries, nextEntries);
}

async function createTransactionIfNeeded(lorebookName, options = {}) {
  if (!options.trackHistory) {
    return null;
  }

  if (options.transaction) {
    if (options.transaction.lorebookName && options.transaction.lorebookName !== lorebookName) {
      throw new Error(`事务所属世界书不匹配: ${options.transaction.lorebookName} !== ${lorebookName}`);
    }
    return options.transaction;
  }

  return beginMutationTransaction(lorebookName, {
    operationType: options.transactionType || 'mutation',
    ...(options.transactionMeta || {}),
  });
}

function shouldCommitTransaction(transaction, options = {}, changed) {
  if (!transaction || !options.trackHistory || !changed) {
    return false;
  }

  if (options.transaction) {
    return options.commitTransaction === true;
  }

  return options.commitTransaction !== false;
}

// 获取所有世界书的名称
export const getWorldbookNamesSafe = errorCatched(async () => {
  if (typeof getWorldbookNames !== 'function') {
    const msg = '角色世界书: 核心函数 getWorldbookNames 不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  return (await getWorldbookNames()) || [];
}, 'getWorldbookNames');

// 获取当前全局启用的世界书列表
export const getGlobalLorebooks = errorCatched(async () => {
  if (typeof getGlobalWorldbookNames !== 'function') {
    const msg = '角色世界书: 核心函数 getGlobalWorldbookNames 不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  return (await getGlobalWorldbookNames()) || [];
}, 'getGlobalLorebooks');

// 确保禁用一个全局世界书（使用酒馆助手的 rebindGlobalWorldbooks 函数）
export const disableGlobalLorebook = errorCatched(async worldbookName => {
  if (typeof rebindGlobalWorldbooks !== 'function') {
    const msg = '角色世界书: 核心函数 rebindGlobalWorldbooks 不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  // 获取当前启用的全局世界书列表
  const currentGlobalBooks = await getGlobalLorebooks();
  console.log('[disableGlobalLorebook] 当前全局世界书:', currentGlobalBooks, '要禁用:', worldbookName);
  // 移除指定的世界书
  const newGlobalBooks = currentGlobalBooks.filter(name => name !== worldbookName);
  console.log('[disableGlobalLorebook] 新的全局世界书列表:', newGlobalBooks);
  // 重新绑定
  await rebindGlobalWorldbooks(newGlobalBooks);
}, 'disableGlobalLorebook');

// 确保启用一个全局世界书（使用酒馆助手的 rebindGlobalWorldbooks 函数）
export const enableGlobalLorebook = errorCatched(async worldbookName => {
  if (typeof rebindGlobalWorldbooks !== 'function') {
    const msg = '角色世界书: 核心函数 rebindGlobalWorldbooks 不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  // 获取当前启用的全局世界书列表
  const currentGlobalBooks = await getGlobalLorebooks();
  console.log('[enableGlobalLorebook] 当前全局世界书:', currentGlobalBooks, '要启用:', worldbookName);
  // 如果已经启用，则不重复添加
  if (!currentGlobalBooks.includes(worldbookName)) {
    currentGlobalBooks.push(worldbookName);
  }
  console.log('[enableGlobalLorebook] 新的全局世界书列表:', currentGlobalBooks);
  // 重新绑定
  await rebindGlobalWorldbooks(currentGlobalBooks);
}, 'enableGlobalLorebook');

// 切换全局世界书状态（使用酒馆助手的 rebindGlobalWorldbooks 函数）
export const toggleGlobalLorebook = errorCatched(async worldbookName => {
  if (typeof rebindGlobalWorldbooks !== 'function') {
    const msg = '角色世界书: 核心函数 rebindGlobalWorldbooks 不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  // 获取当前启用的全局世界书列表
  const currentGlobalBooks = await getGlobalLorebooks();
  let newGlobalBooks;
  if (currentGlobalBooks.includes(worldbookName)) {
    // 如果已启用，则禁用
    newGlobalBooks = currentGlobalBooks.filter(name => name !== worldbookName);
  } else {
    // 如果未启用，则启用
    newGlobalBooks = [...currentGlobalBooks, worldbookName];
  }
  // 重新绑定
  await rebindGlobalWorldbooks(newGlobalBooks);
}, 'toggleGlobalLorebook');

/**
 * @deprecated 旧的实现方式，由于 getGlobalLorebooks 的状态延迟问题已弃用。请改用 toggleGlobalLorebook。
 */
export const setGlobalLorebooks = errorCatched(async worldbookNames => {
  // 修正：根据TavernHelper的结构，函数位于 window.parent.TavernHelper 下
  const rebindFn = window.parent.TavernHelper?.rebindGlobalWorldbooks;
  if (typeof rebindFn !== 'function') {
    const msg =
      '角色世界书: 核心函数 TavernHelper.rebindGlobalWorldbooks 在父窗口中不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  return await rebindFn(worldbookNames);
}, 'setGlobalLorebooks');

// 获取指定世界书的所有条目
// 返回 ApiResult: { success: boolean, data: Array, error?: Error }
export const getWorldbookSafe = errorCatched(async worldbookName => {
  if (!worldbookName) {
    const error = new Error('未提供世界书名');
    console.error('角色世界书: 调用 getWorldbookSafe 时未提供 worldbookName。');
    return { success: false, data: [], error };
  }
  if (typeof getWorldbook !== 'function') {
    const error = new Error('核心函数 getWorldbook 不可用。请确保酒馆助手已更新到最新版本。');
    console.error('角色世界书:', error.message);
    return { success: false, data: [], error };
  }
  try {
    const entries = await getWorldbook(worldbookName);
    return { success: true, data: entries || [] };
  } catch (error) {
    console.error(`角色世界书: 获取世界书 ${worldbookName} 条目时出错`, error);
    return { success: false, data: [], error };
  }
}, 'getWorldbook');

// 获取指定世界书的单个条目
export const getLorebookEntry = errorCatched(async (lorebookName, entryUid) => {
  const numericUid = ensureNumericUID(entryUid);
  try {
    const result = await getWorldbookSafe(lorebookName);

    if (!result.success) {
      console.error(`角色世界书: 获取世界书 "${lorebookName}" 失败`, result.error);
      return null;
    }

    const entries = result.data;

    // 【修复】增加对API返回值的类型检查，防止因返回HTML等非数组类型而导致崩溃
    if (!Array.isArray(entries)) {
      const errorMsg = `获取世界书 "${lorebookName}" 的条目时返回了无效的数据格式。`;
      console.error(`角色世界书: ${errorMsg} 收到的值:`, entries);
      throw new Error(errorMsg);
    }

    if (!entries || entries.length === 0) {
      console.warn(`角色世界书: 世界书 ${lorebookName} 中没有条目`);
      return null;
    }
    const entry = entries.find(e => ensureNumericUID(e.uid) === numericUid);
    if (!entry) {
      console.error(`角色世界书: 在 ${lorebookName} 中未找到UID为 ${numericUid} 的条目`);
      return null;
    }
    return entry;
  } catch (error) {
    console.error(`角色世界书: 获取条目时出错:`, error);
    return null;
  }
}, 'getLorebookEntry');

export const updateWorldbookEntries = errorCatched(async (lorebookName, mutator, options = {}) => {
  if (typeof rawUpdateWorldbookWith !== 'function') {
    const error = new Error('核心函数 updateWorldbookWith 不可用。请确保酒馆助手已更新到最新版本。');
    console.error('角色世界书:', error.message);
    return buildMutationResult(false, false, error, { lorebookName });
  }

  const transaction = await createTransactionIfNeeded(lorebookName, options);
  let previousEntries = [];
  let nextEntries = [];
  let changed = false;

  try {
    await rawUpdateWorldbookWith(lorebookName, entries => {
      previousEntries = cloneEntriesSnapshot(entries);
      const mutatedEntries = mutator(entries);
      nextEntries = cloneEntriesSnapshot(mutatedEntries);
      changed = hasEntryChanges(previousEntries, nextEntries);
      return mutatedEntries;
    });

    if (shouldCommitTransaction(transaction, options, changed)) {
      await commitMutationTransaction(transaction, {
        changedCount: nextEntries.length,
        lorebookName,
      });
    }

    return buildMutationResult(
      true,
      changed,
      null,
      {
        lorebookName,
        previousCount: previousEntries.length,
        nextCount: nextEntries.length,
        ...(options.transactionMeta || {}),
      },
      nextEntries,
    );
  } catch (error) {
    console.error(`角色世界书: 更新世界书 "${lorebookName}" 时出错`, error);
    return buildMutationResult(false, false, error, {
      lorebookName,
      ...(options.transactionMeta || {}),
    });
  }
}, 'updateWorldbookEntries');

export const createLorebookEntries = errorCatched(async (lorebookName, entriesToCreate, options = {}) => {
  if (typeof rawCreateWorldbookEntries !== 'function') {
    const error = new Error('核心函数 createWorldbookEntries 不可用。请确保酒馆助手已更新到最新版本。');
    console.error('角色世界书:', error.message);
    return buildMutationResult(false, false, error, { lorebookName });
  }

  const entries = Array.isArray(entriesToCreate) ? entriesToCreate : [];
  const transaction = await createTransactionIfNeeded(lorebookName, options);

  try {
    const result = await rawCreateWorldbookEntries(lorebookName, entries);
    const changed = entries.length > 0;

    if (shouldCommitTransaction(transaction, options, changed)) {
      await commitMutationTransaction(transaction, {
        createdCount: entries.length,
        lorebookName,
      });
    }

    return buildMutationResult(
      true,
      changed,
      null,
      {
        lorebookName,
        createdCount: entries.length,
        ...(options.transactionMeta || {}),
      },
      result,
    );
  } catch (error) {
    console.error(`角色世界书: 在 "${lorebookName}" 中创建条目时出错`, error);
    return buildMutationResult(false, false, error, {
      lorebookName,
      createdCount: entries.length,
      ...(options.transactionMeta || {}),
    });
  }
}, 'createLorebookEntries');

export const deleteLorebookEntries = errorCatched(async (lorebookName, predicate, options = {}) => {
  if (typeof rawDeleteWorldbookEntries !== 'function') {
    const error = new Error('核心函数 deleteWorldbookEntries 不可用。请确保酒馆助手已更新到最新版本。');
    console.error('角色世界书:', error.message);
    return buildMutationResult(false, false, error, { lorebookName });
  }

  const transaction = await createTransactionIfNeeded(lorebookName, options);

  try {
    const result = await rawDeleteWorldbookEntries(lorebookName, predicate);

    if (shouldCommitTransaction(transaction, options, true)) {
      await commitMutationTransaction(transaction, {
        lorebookName,
        operationType: options.transactionType || 'delete',
        ...(options.transactionMeta || {}),
      });
    }

    return buildMutationResult(
      true,
      true,
      null,
      {
        lorebookName,
        ...(options.transactionMeta || {}),
      },
      result,
    );
  } catch (error) {
    console.error(`角色世界书: 删除 "${lorebookName}" 的条目时出错`, error);
    return buildMutationResult(false, false, error, {
      lorebookName,
      ...(options.transactionMeta || {}),
    });
  }
}, 'deleteLorebookEntries');

export const replaceWorldbookEntries = errorCatched(async (lorebookName, nextEntries, options = {}) => {
  return updateWorldbookEntries(lorebookName, () => cloneEntriesSnapshot(nextEntries), options);
}, 'replaceWorldbookEntries');

// 【核心更新】使用新API `updateWorldbookWith` 来自动保存单个字段
function applyEntryFieldUpdate(entryToUpdate, fieldName, value) {
  if (fieldName === 'position' || fieldName === 'position.type') {
    applyPositionSelectionToEntry(entryToUpdate, value);
    return;
  }
  if (fieldName === 'position.role') {
    if (!entryToUpdate.position) entryToUpdate.position = {};
    entryToUpdate.position.role = normalizePositionRole(value);
    return;
  }

  _.set(entryToUpdate, fieldName, value);

  if (fieldName === 'comment') {
    _.set(entryToUpdate, 'name', value);
  }
  if (fieldName === 'type' && (value === 'constant' || value === 'selective')) {
    _.set(entryToUpdate, 'strategy.type', value);
  }
  if (fieldName === 'keys') {
    _.set(entryToUpdate, 'strategy.keys', value);
  }
  if (fieldName === 'depth') {
    _.set(entryToUpdate, 'position.depth', value);
  }
  if (fieldName === 'order') {
    _.set(entryToUpdate, 'position.order', value);
  }
  if (fieldName === 'prevent_recursion') {
    _.set(entryToUpdate, 'recursion.prevent_outgoing', value);
  }
  if (fieldName === 'exclude_recursion') {
    _.set(entryToUpdate, 'recursion.prevent_incoming', value);
  }
  if (fieldName === 'delay_until_recursion') {
    _.set(entryToUpdate, 'recursion.delay_until', value ? 1 : null);
  }
}

export const saveEntryField = errorCatched(async (entryUid, lorebookName, fieldName, value) => {
  if (!lorebookName || fieldName === undefined) {
    console.error(`角色世界书: 调用 saveEntryField 时缺少必要参数。`, { lorebookName, fieldName });
    return false;
  }
  if (typeof rawUpdateWorldbookWith !== 'function') {
    const msg = '角色世界书: 核心函数 updateWorldbookWith 不可用，无法保存条目。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    alert(msg); // 这是一个关键功能，直接提示用户
    return false;
  }

  const numericUid = ensureNumericUID(entryUid);

  try {
    const result = await updateWorldbookEntries(lorebookName, entries => {
      const entryIndex = entries.findIndex(e => ensureNumericUID(e.uid) === numericUid);
      if (entryIndex === -1) {
        console.error(`角色世界书: 在保存字段 "${fieldName}" 时未找到UID为 ${numericUid} 的条目`);
        return entries; // 未找到则不修改
      }

      // 优化：只深拷贝需要修改的条目，并创建一个新的数组引用
      const updatedEntries = [...entries];
      const entryToUpdate = _.cloneDeep(updatedEntries[entryIndex]);
      updatedEntries[entryIndex] = entryToUpdate;

      // 使用 lodash 的 set 方法安全地设置嵌套属性
      applyEntryFieldUpdate(entryToUpdate, fieldName, value);
      if (AUTO_UNPIN_POSITION_FIELDS.has(fieldName)) {
        entryToUpdate.pinned = false;
      }

      return updatedEntries;
    });

    if (result.success && AUTO_UNPIN_POSITION_FIELDS.has(fieldName)) {
      removePinnedEntry(lorebookName, numericUid);
    }

    return result.success;
  } catch (error) {
    console.error(`角色世界书: 使用 updateWorldbookWith 保存字段 '${fieldName}' 时出错`, error);
    return false;
  }
}, 'saveEntryField');

// 切换启用/禁用状态（现在调用新的 saveEntryField）
export const toggleEntryEnabled = errorCatched(async (lorebookName, entryUid, enabled) => {
  return saveEntryField(entryUid, lorebookName, 'enabled', enabled);
}, 'toggleEntryEnabled');

export const updateWorldbookWith = rawUpdateWorldbookWith;
export const createWorldbookEntries = rawCreateWorldbookEntries;
export const deleteWorldbookEntries = rawDeleteWorldbookEntries;

// 创建新的世界书条目
export const createNewLorebookEntry = errorCatched(async (lorebookName, isGlobal = false) => {
  if (typeof rawCreateWorldbookEntries !== 'function') {
    const msg = '角色世界书: 核心函数 createWorldbookEntries 不可用，无法创建新条目。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    alert(msg);
    return false;
  }

  try {
    // 获取当前世界书的所有条目，计算最大UID
    const result = await getWorldbookSafe(lorebookName);
    let maxUid = 0;
    if (result.success && result.data.length > 0) {
      maxUid = Math.max(...result.data.map(e => ensureNumericUID(e.uid)));
    }

    // 创建一个符合新API结构的基础条目，UID为最大值+1
    const newEntry = {
      uid: maxUid + 1,
      name: '新条目',
      content: '',
      enabled: true,
      pinned: true,
      probability: 100,
      strategy: {
        type: 'selective',
        keys: [],
      },
      position: {
        type: 'after_character_definition',
        depth: 4,
        order: 0,
      },
    };

    // 调用新的全局API创建条目
    const creationResult = await createLorebookEntries(lorebookName, [newEntry]);
    if (creationResult.success) {
      addPinnedEntry(lorebookName, newEntry.uid);
    }
    return {
      success: creationResult.success,
      entryUid: creationResult.success ? newEntry.uid : null,
      isGlobal,
      error: creationResult.error || null,
    };
  } catch (error) {
    console.error(`角色世界书: 创建新条目时出错`, error);
    alert(`创建新条目失败: ${error.message || '未知错误'}`);
    return {
      success: false,
      entryUid: null,
      isGlobal,
      error,
    };
  }
}, 'createNewLorebookEntry');

// 重新绑定角色世界书
export const rebindCharWorldbooksSafe = errorCatched(async charWorldbooks => {
  const rebindFn = window.parent.rebindCharWorldbooks || window.rebindCharWorldbooks;
  if (typeof rebindFn !== 'function') {
    const msg = '角色世界书: 核心函数 rebindCharWorldbooks 不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  return await rebindFn('current', charWorldbooks);
}, 'rebindCharWorldbooks');

// 新增：封装酒馆助手的 importRawWorldbook 函数
export const importWorldbookSafe = errorCatched(async (filename, content) => {
  const importFn = window.parent.importRawWorldbook || window.importRawWorldbook;
  if (typeof importFn !== 'function') {
    const msg = '角色世界书: 核心函数 importRawWorldbook 不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  return await importFn(filename, content);
}, 'importWorldbookSafe');

// 创建新的世界书
export const createWorldbookSafe = errorCatched(async (worldbookName, worldbook) => {
  if (typeof createWorldbook !== 'function') {
    const msg = '角色世界书: 核心函数 createWorldbook 不可用。';
    console.error(msg);
    throw new Error(msg);
  }
  return await createWorldbook(worldbookName, worldbook);
}, 'createWorldbookSafe');

// 删除世界书
export const deleteWorldbookSafe = errorCatched(async worldbookName => {
  if (typeof deleteWorldbook !== 'function') {
    const msg = '角色世界书: 核心函数 deleteWorldbook 不可用。';
    console.error(msg);
    throw new Error(msg);
  }
  return await deleteWorldbook(worldbookName);
}, 'deleteWorldbookSafe');

// 重命名世界书
export const renameWorldbookSafe = errorCatched(async (oldName, newName) => {
  const result = await getWorldbookSafe(oldName);
  if (!result.success) {
    throw result.error || new Error(`获取世界书 "${oldName}" 失败`);
  }
  const entries = result.data;
  // 直接携带完整世界书创建副本，保留条目 UID 以及所有基于 UID 的关联数据。
  await createWorldbookSafe(newName, entries);
  await deleteWorldbookSafe(oldName);
  return true;
}, 'renameWorldbookSafe');

// 重新绑定聊天世界书
export const rebindChatWorldbookSafe = errorCatched(async worldbookName => {
  const rebindFn = window.parent.rebindChatWorldbook || window.rebindChatWorldbook;
  if (typeof rebindFn !== 'function') {
    const msg = '角色世界书: 核心函数 rebindChatWorldbook 不可用。请确保酒馆助手已更新到最新版本。';
    console.error(msg);
    throw new Error(msg);
  }
  return await rebindFn('current', worldbookName);
}, 'rebindChatWorldbookSafe');
