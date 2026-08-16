// ================================================================================
// ERA 事件系统 - 工具函数模块
// ================================================================================
// 包含: 日志工具、时间计算、辅助函数

import { getSingleConditionTimeAnchor } from './era-event-schema.js';
import {
  EVENT_KIND,
  EVENT_RUNTIME_KEY_VERSION,
  looksLikeEventEntryName,
  parseCanonicalEventKey,
  stripEventFileSuffix,
} from '../shared/eventKey.js';
import {
  totalDaysToWuxiaCalendarDate,
  totalMinutesToWuxiaCalendarTime,
  wuxiaCalendarDateToTotalDays,
  wuxiaCalendarTimeToTotalMinutes,
} from '../shared/wuxiaCalendar.js';

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
  const rawReference = stripEventFileSuffix(reference);
  if (!rawReference || parseCanonicalEventKey(rawReference)) return rawReference;
  if (looksLikeEventEntryName(rawReference)) {
    throw new Error(`非规范事件引用: ${rawReference}`);
  }
  return rawReference;
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
  const currentDays = wuxiaCalendarDateToTotalDays(currentTime);
  const targetDays = wuxiaCalendarDateToTotalDays(targetTime);
  const currentTotalMinutes = wuxiaCalendarTimeToTotalMinutes(currentTime);
  const targetTotalMinutes = wuxiaCalendarTimeToTotalMinutes(targetTime);

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
  const shiftedDate = totalDaysToWuxiaCalendarDate(wuxiaCalendarDateToTotalDays(dateObject) + Number(days || 0));

  // 保留原有的"时"、"分"字段（如果存在）
  const result = {
    ...shiftedDate,
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
  const durationDays = duration.日 || 0;
  const durationHours = duration.时 || 0;
  const durationMinutes = duration.分 || 0;
  const totalDurationMinutes = durationDays * 24 * 60 + durationHours * 60 + durationMinutes;
  const shiftedTime = totalMinutesToWuxiaCalendarTime(
    wuxiaCalendarTimeToTotalMinutes(dateObject) + totalDurationMinutes,
  );
  const result = {
    年: shiftedTime.年,
    月: shiftedTime.月,
    日: shiftedTime.日,
    时: shiftedTime.时,
  };

  if (dateObject.分 !== undefined || duration.分 !== undefined) {
    result.分 = shiftedTime.分;
  }

  return result;
}

// 将事件系统使用的 12 月×30 天简化历法转换为总小时数。所有持续时长和平移都必须复用此口径。
export function timeToTotalHours(timeObject) {
  return timeToTotalMinutes(timeObject) / 60;
}

export function timeToTotalMinutes(timeObject) {
  return wuxiaCalendarTimeToTotalMinutes(timeObject);
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
