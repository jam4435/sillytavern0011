// ================================================================================
// ERA 事件系统 - 事件检查模块
// ================================================================================
// 包含: 时间条件判断、事件状态检查

import {
  CONFIG,
  log,
  compareTime,
  calculateDateOffset,
  getEndTime,
  getEventDurationHours,
} from './era-utils.js';

// ==================== 检查时间条件 ====================
export function isTimeForEvent(currentTime, eventData, eventName = '') {
  const triggerTime = eventData?.触发条件;

  if (!triggerTime || triggerTime.类型 !== '时间') {
    return false;
  }

  // 正式开始只认原定时间；提前十天的窗口仅用于传闻和玩家精确到场触发。
  return compareTime(currentTime, triggerTime, '>=');
}

export function isEventDiscoverable(currentTime, eventData) {
  const triggerTime = eventData?.触发条件;
  const durationHours = getEventDurationHours(eventData);
  if (!triggerTime || triggerTime.类型 !== '时间' || durationHours === null) {
    return false;
  }

  const isShortEvent = durationHours <= CONFIG.SHORT_EVENT_THRESHOLD_DAYS * 24;
  if (!isShortEvent || compareTime(currentTime, triggerTime, '>=')) {
    return false;
  }

  const discoverableFrom = calculateDateOffset(triggerTime, -CONFIG.ELASTIC_TRIGGER_DAYS);
  return compareTime(currentTime, discoverableFrom, '>=');
}

export function isTimeAfterEventEnd(currentTime, endTime) {
  if (!endTime) {
    log('缺少结束时间');
    return false;
  }

  return compareTime(currentTime, endTime, '>=');
}
