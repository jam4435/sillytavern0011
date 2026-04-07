// ================================================================================
// ERA 事件系统 - 工具函数模块
// ================================================================================
// 包含: 日志工具、时间计算、辅助函数

// ==================== 配置项 ====================
export const CONFIG = {
  DEBUG_MODE: true,
  EVENT_KEY_PREFIXES: ['事件条目-', '成长条目-'],
  EVENT_KEY_PATTERNS: [/事件条目-/, /登场事件-/, /成长条目-/],
  DEBUT_EVENT_PATTERN: /登场事件-/,
  ELASTIC_TRIGGER_DAYS: 10,
  SHORT_EVENT_THRESHOLD_DAYS: 30,
  DEFAULT_FOLLOWUP_LIFETIME: 3,
};

// ==================== 日志工具 ====================
export const log = (...args) => {
  if (CONFIG.DEBUG_MODE) {
    console.log('[ERA 事件系统 V5.2]', ...args);
  }
};

export const logError = (...args) => {
  console.error('[ERA 事件系统 V5.2 ❌]', ...args);
};

export const logSuccess = (...args) => {
  console.log('%c[ERA 事件系统 V5.2 ✅]', 'color: #00ff00; font-weight: bold;', ...args);
};

export const logWarning = (...args) => {
  console.warn('[ERA 事件系统 V5.2 ⚠️]', ...args);
};

// ==================== 时间比较函数 ====================
export function compareTime(currentTime, targetTime, comparisonType) {
  // 计算天数
  const currentDays = (currentTime.年 || 0) * 365 + (currentTime.月 || 0) * 30 + (currentTime.日 || 0);
  const targetDays = (targetTime.年 || 0) * 365 + (targetTime.月 || 0) * 30 + (targetTime.日 || 0);

  // 计算总小时数（兼容缺失的"时"字段，默认为0）
  const currentTotalHours = currentDays * 24 + (currentTime.时 || 0);
  const targetTotalHours = targetDays * 24 + (targetTime.时 || 0);

  // 计算天数差值（保持原有逻辑，用于diff模式）
  const diff = currentDays - targetDays;

  // 如果请求的是差值，直接返回天数差值
  if (comparisonType === 'diff') {
    log(`⏰ 时间差值计算:`);
    let currentTimeStr = `${currentTime.年}年${currentTime.月}月${currentTime.日}日`;
    let targetTimeStr = `${targetTime.年}年${targetTime.月}月${targetTime.日}日`;

    if (currentTime.时 !== undefined) {
      currentTimeStr += `${currentTime.时}时`;
    }
    if (targetTime.时 !== undefined) {
      targetTimeStr += `${targetTime.时}时`;
    }

    log(`  当前: ${currentTimeStr} (${currentDays}天, ${currentTotalHours}小时)`);
    log(`  目标: ${targetTimeStr} (${targetDays}天, ${targetTotalHours}小时)`);
    log(`  差值: ${diff}天`);
    return diff;
  }

  // 使用总小时数进行比较，支持小时级精度
  const result =
    comparisonType === '>=' ? currentTotalHours >= targetTotalHours : currentTotalHours > targetTotalHours;

  log(`⏰ 时间比较 (${comparisonType}):`);
  let currentTimeStr = `${currentTime.年}年${currentTime.月}月${currentTime.日}日`;
  let targetTimeStr = `${targetTime.年}年${targetTime.月}月${targetTime.日}日`;

  if (currentTime.时 !== undefined) {
    currentTimeStr += `${currentTime.时}时`;
  }
  if (targetTime.时 !== undefined) {
    targetTimeStr += `${targetTime.时}时`;
  }

  log(`  当前: ${currentTimeStr} (${currentDays}天, ${currentTotalHours}小时)`);
  log(`  目标: ${targetTimeStr} (${targetDays}天, ${targetTotalHours}小时)`);
  log(
    `  差值: ${diff}天, 小时差: ${currentTotalHours - targetTotalHours}小时 | 结果: ${
      result ? '✅ 满足' : '❌ 不满足'
    }`,
  );

  return result;
}

// ==================== 辅助函数 ====================

// 判断事件是否为登场事件
export function isDebutEvent(eventName) {
  return CONFIG.DEBUT_EVENT_PATTERN.test(eventName);
}

// 从完整事件文件名中提取核心名称
export function getEventShortName(eventName) {
  const match = eventName.match(/-([^-]+)\.json$/);
  return match ? match[1] : eventName;
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

  // 保留原有的"时"字段（如果存在）
  const result = {
    年: newYear,
    月: newMonth,
    日: newDay,
  };

  if (dateObject.时 !== undefined) {
    result.时 = dateObject.时;
  }

  return result;
}

// 对一个时间对象进行包含日和时的时间偏移计算，支持小时级精度
export function calculateTimeOffset(dateObject, duration) {
  // 将基础时间转换为总小时数
  const baseDays = (dateObject.年 || 0) * 365 + (dateObject.月 || 0) * 30 + (dateObject.日 || 0);
  const baseHours = dateObject.时 || 0;
  const totalBaseHours = baseDays * 24 + baseHours;

  // 将持续时间转换为总小时数
  const durationDays = duration.日 || 0;
  const durationHours = duration.时 || 0;
  const totalDurationHours = durationDays * 24 + durationHours;

  // 计算新的总小时数
  const newTotalHours = totalBaseHours + totalDurationHours;

  // 将总小时数转换回年月日时分格式
  let remainingHours = newTotalHours;

  // 计算年
  let newYear = Math.floor(remainingHours / (365 * 24));
  remainingHours %= 365 * 24;

  // 计算月
  let newMonth = Math.floor(remainingHours / (30 * 24));
  remainingHours %= 30 * 24;

  // 计算日
  let newDay = Math.floor(remainingHours / 24);
  remainingHours %= 24;

  // 计算时
  const newHour = remainingHours;

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

  return result;
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
  return result;
}
