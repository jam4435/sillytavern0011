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
  getEventShortName,
} from './era-utils.js';

// ==================== 检查时间条件 ====================
export function isTimeForEvent(currentTime, eventData, eventName = '') {
  const triggerTime = eventData?.触发条件;

  if (!triggerTime || triggerTime.类型 !== '时间') {
    return false;
  }

  // ============== 弹性时间核心逻辑 ==============
  const endTime = getEndTime(eventData);
  let effectiveTriggerTime = triggerTime; // 默认使用原始触发时间

  // 1. 计算事件持续时间
  let eventDuration = 0;
  if (triggerTime && endTime) {
    const triggerDays = (triggerTime.年 || 0) * 365 + (triggerTime.月 || 0) * 30 + (triggerTime.日 || 0);
    const endDays = (endTime.年 || 0) * 365 + (endTime.月 || 0) * 30 + (endTime.日 || 0);
    eventDuration = endDays - triggerDays;
  }

  // 2. 判断是否为短期事件
  const isShortEvent = eventDuration <= CONFIG.SHORT_EVENT_THRESHOLD_DAYS;

  // 3. 如果是短期事件，计算弹性开始时间
  if (isShortEvent) {
    effectiveTriggerTime = calculateDateOffset(triggerTime, -CONFIG.ELASTIC_TRIGGER_DAYS);
  }
  // ============== 弹性时间核心逻辑结束 ==============

  return compareTime(currentTime, effectiveTriggerTime, '>=');
}

export function isTimeAfterEventEnd(currentTime, endTime) {
  if (!endTime) {
    log('缺少结束时间');
    return false;
  }

  return compareTime(currentTime, endTime, '>');
}
