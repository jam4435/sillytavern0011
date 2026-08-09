// ================================================================================
// ERA 事件系统 - 工具函数模块
// ================================================================================
// 包含: 日志工具、时间计算、辅助函数

import { getSingleConditionTimeAnchor } from './era-event-schema.js';
import {
  EVENT_KIND,
  EVENT_RUNTIME_KEY_VERSION,
  parseCanonicalEventKey,
  stripEventFileSuffix,
} from '../shared/eventKey.js';

export { EVENT_KIND, EVENT_RUNTIME_KEY_VERSION } from '../shared/eventKey.js';

// ==================== 配置项 ====================
function readLocalStorageFlag(key) {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

export const CONFIG = {
  DEBUG_MODE: false,
  TIME_DEBUG_MODE: false,
  ELASTIC_TRIGGER_DAYS: 10,
  SHORT_EVENT_THRESHOLD_DAYS: 30,
  DEFAULT_FOLLOWUP_LIFETIME: 3,
};

const EVENT_METADATA = Symbol('era-event-metadata');

/**
 * 从世界书物理条目名派生唯一运行时键。物理名保持不变，变量层只使用 runtimeKey。
 */
export function deriveEventRuntimeDescriptor(entryName) {
  return parseCanonicalEventKey(entryName);
}

/**
 * 将事件来源信息附着到定义对象；元数据不参与 JSON 序列化，也不会进入变量差分。
 */
export function attachEventMetadata(eventData, descriptor) {
  if (!isPlainObject(eventData) || !descriptor) return eventData;
  if (eventData[EVENT_METADATA]) return eventData;

  Object.defineProperty(eventData, EVENT_METADATA, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ ...descriptor }),
  });
  return eventData;
}

export function getEventMetadata(eventData) {
  return isPlainObject(eventData) ? eventData[EVENT_METADATA] || null : null;
}

export function isEventKind(eventData, kind) {
  return getEventMetadata(eventData)?.kind === kind;
}

// 判断事件是否为登场事件。事件种类只读 loader 附着的元数据，不再解析运行时键文本。
export function isDebutEvent(eventData) {
  return isEventKind(eventData, EVENT_KIND.DEBUT);
}

export function isOrdinaryEvent(eventData) {
  return isEventKind(eventData, EVENT_KIND.ORDINARY);
}

export function normalizeOrdinaryEventReference(reference) {
  return stripEventFileSuffix(reference);
}

// ==================== 日志工具 ====================
export const isDebugEnabled = () => CONFIG.DEBUG_MODE || readLocalStorageFlag('era_event_debug');

export const isTimeDebugEnabled = () => CONFIG.TIME_DEBUG_MODE || readLocalStorageFlag('era_event_time_debug');

export const log = (...args) => {
  if (isDebugEnabled()) {
    console.log('[ERA 事件系统 V5.2]', ...args);
  }
};

export const logTime = (...args) => {
  if (isTimeDebugEnabled()) {
    console.log('[ERA 事件系统 V5.2]', ...args);
  }
};

export const logError = (...args) => {
  console.error('[ERA 事件系统 V5.2 ❌]', ...args);
};

export const logSuccess = (...args) => {
  if (isDebugEnabled()) {
    console.log('%c[ERA 事件系统 V5.2 ✅]', 'color: #00ff00; font-weight: bold;', ...args);
  }
};

export const logWarning = (...args) => {
  console.warn('[ERA 事件系统 V5.2 ⚠️]', ...args);
};

export const debugGroup = (...args) => {
  if (isDebugEnabled()) {
    console.group(...args);
  }
};

export const debugGroupCollapsed = (...args) => {
  if (isDebugEnabled()) {
    console.groupCollapsed(...args);
  }
};

export const debugGroupEnd = () => {
  if (isDebugEnabled()) {
    console.groupEnd();
  }
};

export const debugTable = data => {
  if (isDebugEnabled()) {
    console.table(data);
  }
};

// ==================== 时间比较函数 ====================
export function compareTime(currentTime, targetTime, comparisonType) {
  // 计算天数
  const currentDays = (currentTime.年 || 0) * 365 + (currentTime.月 || 0) * 30 + (currentTime.日 || 0);
  const targetDays = (targetTime.年 || 0) * 365 + (targetTime.月 || 0) * 30 + (targetTime.日 || 0);

  // 计算总分钟数（兼容缺失的"时"、"分"字段，默认为0）
  const currentTotalMinutes = currentDays * 24 * 60 + (currentTime.时 || 0) * 60 + (currentTime.分 || 0);
  const targetTotalMinutes = targetDays * 24 * 60 + (targetTime.时 || 0) * 60 + (targetTime.分 || 0);

  // 计算天数差值（保持原有逻辑，用于diff模式）
  const diff = currentDays - targetDays;

  // 如果请求的是差值，直接返回天数差值
  if (comparisonType === 'diff') {
    if (isTimeDebugEnabled()) {
      logTime(`⏰ 时间差值计算:`);
      let currentTimeStr = `${currentTime.年}年${currentTime.月}月${currentTime.日}日`;
      let targetTimeStr = `${targetTime.年}年${targetTime.月}月${targetTime.日}日`;

      if (currentTime.时 !== undefined) {
        currentTimeStr += `${currentTime.时}时`;
      }
      if (targetTime.时 !== undefined) {
        targetTimeStr += `${targetTime.时}时`;
      }

      logTime(`  当前: ${currentTimeStr} (${currentDays}天, ${currentTotalMinutes}分钟)`);
      logTime(`  目标: ${targetTimeStr} (${targetDays}天, ${targetTotalMinutes}分钟)`);
      logTime(`  差值: ${diff}天`);
    }
    return diff;
  }

  // 使用总分钟数进行比较，避免事件相对平移时丢失当前分钟。
  const result =
    comparisonType === '>=' ? currentTotalMinutes >= targetTotalMinutes : currentTotalMinutes > targetTotalMinutes;

  if (isTimeDebugEnabled()) {
    logTime(`⏰ 时间比较 (${comparisonType}):`);
    let currentTimeStr = `${currentTime.年}年${currentTime.月}月${currentTime.日}日`;
    let targetTimeStr = `${targetTime.年}年${targetTime.月}月${targetTime.日}日`;

    if (currentTime.时 !== undefined) {
      currentTimeStr += `${currentTime.时}时`;
    }
    if (targetTime.时 !== undefined) {
      targetTimeStr += `${targetTime.时}时`;
    }

    logTime(`  当前: ${currentTimeStr} (${currentDays}天, ${currentTotalMinutes}分钟)`);
    logTime(`  目标: ${targetTimeStr} (${targetDays}天, ${targetTotalMinutes}分钟)`);
    logTime(
      `  差值: ${diff}天, 分钟差: ${currentTotalMinutes - targetTotalMinutes}分钟 | 结果: ${
        result ? '✅ 满足' : '❌ 不满足'
      }`,
    );
  }

  return result;
}

// ==================== 辅助函数 ====================

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getEventParticipationKeys(eventName) {
  const runtimeKey = stripEventFileSuffix(eventName);
  return runtimeKey ? [runtimeKey] : [];
}

export function isParticipationEntry(value) {
  return (
    isPlainObject(value) &&
    typeof value.描述 === 'string' &&
    typeof value.结局 === 'string' &&
    isPlainObject(value.insert) &&
    isPlainObject(value.update) &&
    isPlainObject(value.delete) &&
    (value.分支标记 === undefined ||
      (isPlainObject(value.分支标记) && Object.values(value.分支标记).every(marker => marker === 0 || marker === 1)))
  );
}

export function hasParticipationEntry(participation, eventName) {
  return getParticipationEntry(participation, eventName) !== null;
}

export function getParticipationEntry(participation, eventName) {
  if (!participation || typeof participation !== 'object') {
    return null;
  }

  for (const key of getEventParticipationKeys(eventName)) {
    if (Object.prototype.hasOwnProperty.call(participation, key) && isParticipationEntry(participation[key])) {
      return participation[key];
    }
  }

  return null;
}

export function buildParticipationDeletePatch(participation, eventName) {
  if (!participation || typeof participation !== 'object') {
    return {};
  }

  return Object.fromEntries(
    getEventParticipationKeys(eventName)
      .filter(key => Object.prototype.hasOwnProperty.call(participation, key))
      .map(key => [key, {}]),
  );
}

export function buildInvalidParticipationDeletePatch(participation) {
  if (!isPlainObject(participation)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(participation)
      .filter(([, value]) => !isParticipationEntry(value))
      .map(([key]) => [key, {}]),
  );
}

// 对一个时间对象进行天数加减，并正确处理跨月、跨年
export function calculateDateOffset(dateObject, days) {
  // 将年月日统一转换为总天数进行计算
  let totalDays = (dateObject.年 || 0) * 365 + (dateObject.月 || 0) * 30 + (dateObject.日 || 0) + days;

  // 计算新的年月日
  let newYear = Math.floor(totalDays / 365);
  totalDays %= 365;
  let newMonth = Math.floor(totalDays / 30);
  let newDay = totalDays % 30;

  // 处理日期为0的情况
  if (newDay === 0) {
    newDay = 30;
    newMonth -= 1;
  }
  if (newMonth === 0) {
    newMonth = 12;
    newYear -= 1;
  }

  // 保留原有的"时"、"分"字段（如果存在）
  const result = {
    年: newYear,
    月: newMonth,
    日: newDay,
  };

  if (dateObject.时 !== undefined) {
    result.时 = dateObject.时;
  }
  if (dateObject.分 !== undefined) {
    result.分 = dateObject.分;
  }

  return result;
}

// 对一个时间对象进行包含日、时、分的时间偏移计算。
export function calculateTimeOffset(dateObject, duration) {
  // 将基础时间转换为总分钟数
  const baseDays = (dateObject.年 || 0) * 365 + (dateObject.月 || 0) * 30 + (dateObject.日 || 0);
  const totalBaseMinutes = baseDays * 24 * 60 + (dateObject.时 || 0) * 60 + (dateObject.分 || 0);

  // 将持续时间转换为总分钟数
  const durationDays = duration.日 || 0;
  const durationHours = duration.时 || 0;
  const durationMinutes = duration.分 || 0;
  const totalDurationMinutes = durationDays * 24 * 60 + durationHours * 60 + durationMinutes;

  // 计算新的总分钟数
  const newTotalMinutes = totalBaseMinutes + totalDurationMinutes;

  // 将总分钟数转换回年月日时分格式
  let remainingMinutes = newTotalMinutes;

  // 计算年
  let newYear = Math.floor(remainingMinutes / (365 * 24 * 60));
  remainingMinutes %= 365 * 24 * 60;

  // 计算月
  let newMonth = Math.floor(remainingMinutes / (30 * 24 * 60));
  remainingMinutes %= 30 * 24 * 60;

  // 计算日
  let newDay = Math.floor(remainingMinutes / (24 * 60));
  remainingMinutes %= 24 * 60;

  // 计算时
  const newHour = Math.floor(remainingMinutes / 60);
  const newMinute = remainingMinutes % 60;

  // 处理日期为0的情况
  if (newDay === 0) {
    newDay = 30;
    newMonth -= 1;
  }
  if (newMonth === 0) {
    newMonth = 12;
    newYear -= 1;
  }

  // 构建结果对象
  const result = {
    年: newYear,
    月: newMonth,
    日: newDay,
    时: newHour,
  };

  if (dateObject.分 !== undefined || duration.分 !== undefined) {
    result.分 = newMinute;
  }

  return result;
}

// 将事件系统使用的简化历法时间转换为总小时数。所有持续时长和平移都必须复用此口径。
export function timeToTotalHours(timeObject) {
  return timeToTotalMinutes(timeObject) / 60;
}

export function timeToTotalMinutes(timeObject) {
  const totalDays = (timeObject?.年 || 0) * 365 + (timeObject?.月 || 0) * 30 + (timeObject?.日 || 0);
  return totalDays * 24 * 60 + (timeObject?.时 || 0) * 60 + (timeObject?.分 || 0);
}

export function getEventDurationHours(eventData) {
  const relativeDuration = eventData?.事件持续时间;
  if (relativeDuration && typeof relativeDuration === 'object') {
    return Math.max(0, Number(relativeDuration.日 || 0) * 24 + Number(relativeDuration.时 || 0));
  }

  const triggerTime = getSingleConditionTimeAnchor(eventData?.触发条件);
  const endTime = getEndTime(eventData || {});
  if (!triggerTime || !endTime) return null;
  return Math.max(0, timeToTotalHours(endTime) - timeToTotalHours(triggerTime));
}

// 获取事件的结束时间
export function getEndTime(eventData) {
  // 检查是否有直接指定的事件结束时间
  if (eventData.事件结束时间) {
    return eventData.事件结束时间;
  }

  // 如果没有指定结束时间，返回null表示事件永不结束
  return null;
}

// 格式化时间对象为字符串
export function formatDate(timeObj) {
  let result = `${timeObj.年}年${timeObj.月}月${timeObj.日}日`;
  if (timeObj.时 !== undefined) {
    result += `${timeObj.时}时`;
  }
  if (timeObj.分 !== undefined) {
    result += `${timeObj.分}分`;
  }
  return result;
}
