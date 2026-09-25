/**
 * @file ERA 变量框架 - ERA 核心变量读写模块
 */

'use strict';

import _ from 'lodash';
import { CHAT_SCOPE, LOGS_PATH, META_DATA_PATH, STAT_DATA_PATH } from './constants';
import { unescapeLegacyEraEditLogValues, unescapeLegacyEraStringValues } from './data';
import {
  getActiveEraDiagnosticTask,
  recordEraDiagnosticError,
  startEraDiagnosticWatchdog,
} from './diagnostics';

export const ERA_STRING_VALUE_ENCODING_VERSION = 2;
const ERA_STRING_VALUE_ENCODING_VERSION_PATH = 'StringValueEncodingVersion';

function getStringValueEncodingVersion(meta: any): number {
  const raw = _.get(meta, ERA_STRING_VALUE_ENCODING_VERSION_PATH, 1);
  const version = Number(raw);
  return Number.isFinite(version) ? version : 1;
}

/**
 * 将旧版 ERA 对字符串值的 __DOT__/__DQUOTE__/__SQUOTE__ 编码一次性还原。
 * 对象键和 EditLog.path 继续保持 ERA 内部路径编码，避免破坏 Lodash 路径语义。
 */
export function migrateLegacyEraStringValueStorageInPlace(chatVars: any): boolean {
  if (!chatVars || typeof chatVars !== 'object') return false;

  const meta = _.get(chatVars, META_DATA_PATH, {});
  if (getStringValueEncodingVersion(meta) >= ERA_STRING_VALUE_ENCODING_VERSION) {
    return false;
  }

  const stat = _.get(chatVars, STAT_DATA_PATH);
  if (stat !== undefined) {
    _.set(chatVars, STAT_DATA_PATH, unescapeLegacyEraStringValues(stat));
  }

  const editLogs = _.get(meta, LOGS_PATH);
  if (_.isPlainObject(editLogs)) {
    for (const mk of Object.keys(editLogs)) {
      editLogs[mk] = unescapeLegacyEraEditLogValues(editLogs[mk]);
    }
  }

  _.set(meta, ERA_STRING_VALUE_ENCODING_VERSION_PATH, ERA_STRING_VALUE_ENCODING_VERSION);
  _.set(chatVars, META_DATA_PATH, meta);
  return true;
}

/**
 * 当前聊天加载时执行一次迁移；版本号保存在 ERAMetaData 中，因此每个聊天独立且幂等。
 */
export async function ensureEraStringValueEncodingV2(): Promise<boolean> {
  const current = getVariables(CHAT_SCOPE) || {};
  // APP_READY 可能早于聊天变量装载完成；空对象不能提前写 v2 标记，否则可能跳过真正旧存档的迁移。
  if (!_.has(current, META_DATA_PATH) && !_.has(current, STAT_DATA_PATH)) {
    return false;
  }
  const currentMeta = _.get(current, META_DATA_PATH, {});
  if (getStringValueEncodingVersion(currentMeta) >= ERA_STRING_VALUE_ENCODING_VERSION) {
    return false;
  }

  let migrated = false;
  await updateVariablesWith(v => {
    migrated = migrateLegacyEraStringValueStorageInPlace(v);
    return v;
  }, CHAT_SCOPE);
  return migrated;
}

/**
 * 递归地从对象中移除所有以 `$` 开头的字段（如 `$meta`, `$template`）。
 * 此函数会创建一个对象的深拷贝，因此不会修改原始对象。
 * @param {any} obj - 待处理的对象或值。
 * @returns {any} 一个不包含 `$` 前缀字段的新对象或原始值。
 */
export function removeMetaFields(obj: any): any {
  // 对于非对象类型，直接返回原始值
  if (!_.isObject(obj)) {
    return obj;
  }

  // 创建深拷贝以避免修改原始对象
  const newObj = _.cloneDeep(obj);

  function recurse(current: any) {
    if (Array.isArray(current)) {
      // 如果是数组，则递归处理数组中的每个元素
      current.forEach(item => recurse(item));
    } else if (_.isPlainObject(current)) {
      // 如果是纯粹的对象，遍历其所有键
      for (const key in current) {
        // 如果键以 '$' 开头，则删除该属性
        if (key.startsWith('$')) {
          delete current[key];
        } else {
          // 否则，递归处理该属性的值
          recurse(current[key]);
        }
      }
    }
  }

  recurse(newObj);
  return newObj;
}

/**
 * 获取并确保 ERA 的元数据和状态数据对象的存在。
 * @returns {{meta: object, stat: object}} 包含元数据和状态数据的对象。
 */
export function getEraData(): { meta: any; stat: any } {
  const chatVars = getVariables(CHAT_SCOPE) || {};
  const meta = _.get(chatVars, META_DATA_PATH, {});
  const stat = _.get(chatVars, STAT_DATA_PATH, {});
  return { meta, stat };
}

/**
 * 原子性地更新 ERA 的状态数据 (stat_data)。
 * @param {(currentStatData: any) => (any | Promise<any>)} updater - 一个接收当前 stat_data 并返回修改后 stat_data 的函数 (可以是 async)。
 */
export async function updateEraStatData(updater: (currentStatData: any) => any | Promise<any>) {
  const correlationId = getActiveEraDiagnosticTask() ?? undefined;
  const finishWatchdog = startEraDiagnosticWatchdog({
    source: 'utils-era-data',
    event: 'update-stat-data',
    correlationId,
    details: { scope: CHAT_SCOPE.type },
  });
  try {
    await updateVariablesWith(async v => {
      migrateLegacyEraStringValueStorageInPlace(v);
      const currentStat = _.get(v, STAT_DATA_PATH, {});
      const newStat = await updater(currentStat);
      _.set(v, STAT_DATA_PATH, newStat);
      return v;
    }, CHAT_SCOPE);
    finishWatchdog('success');
  } catch (error) {
    finishWatchdog('error', { error: error instanceof Error ? error.message : String(error) });
    recordEraDiagnosticError('utils-era-data', 'update-stat-data-error', error, {
      scope: CHAT_SCOPE.type,
    }, correlationId);
    throw error;
  }
}

/**
 * 原子性地更新 ERA 的元数据 (ERAMetaData)。
 * @param {(currentMetaData: any) => (any | Promise<any>)} updater - 一个接收当前 ERAMetaData 并返回修改后 ERAMetaData 的函数 (可以是 async)。
 */
export async function updateEraMetaData(updater: (currentMetaData: any) => any | Promise<any>) {
  const correlationId = getActiveEraDiagnosticTask() ?? undefined;
  const finishWatchdog = startEraDiagnosticWatchdog({
    source: 'utils-era-data',
    event: 'update-meta-data',
    correlationId,
    details: { scope: CHAT_SCOPE.type },
  });
  try {
    await updateVariablesWith(async v => {
      migrateLegacyEraStringValueStorageInPlace(v);
      const currentMeta = _.get(v, META_DATA_PATH, {});
      const newMeta = await updater(currentMeta);
      _.set(v, META_DATA_PATH, newMeta);
      return v;
    }, CHAT_SCOPE);
    finishWatchdog('success');
  } catch (error) {
    finishWatchdog('error', { error: error instanceof Error ? error.message : String(error) });
    recordEraDiagnosticError('utils-era-data', 'update-meta-data-error', error, {
      scope: CHAT_SCOPE.type,
    }, correlationId);
    throw error;
  }
}
