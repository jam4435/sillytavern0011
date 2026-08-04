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
import {
  evaluateEventCondition,
  getSingleConditionTimeAnchor,
} from './era-event-schema.js';

function buildConditionContext(currentTime, statData, eventDefinitions) {
  const completedEvents = statData?.事件系统?.已完成事件 || {};
  return {
    currentTime,
    statData,
    completedEvents,
    compareTime,
    readVariable(rawPath, fallback) {
      const actual = fallback();
      if (actual.exists) return actual;

      const path = String(rawPath || '').replace(/^stat_data\.?/, '');
      const match = path.match(/^事件分支结果\.([^.]+)\.([^.]+)$/);
      if (!match) return actual;
      const [, completedEventName, markerName] = match;
      // Old non-participated completions can read the worldbook default virtually.
      // A participated completion without an archived result remains unknown.
      if (completedEvents[completedEventName] !== 0) return actual;
      const defaultValue = eventDefinitions?.[completedEventName]?.分支标记?.[markerName];
      return defaultValue === 0 || defaultValue === 1
        ? { exists: true, value: defaultValue }
        : actual;
    },
  };
}

// ==================== 检查时间条件 ====================
export function isTimeForEvent(currentTime, eventData, eventName = '', statData = {}, eventDefinitions = {}) {
  return evaluateEventCondition(
    eventData?.触发条件,
    buildConditionContext(currentTime, statData, eventDefinitions),
  );
}

export function isEventDiscoverable(currentTime, eventData, statData = {}, eventDefinitions = {}) {
  const triggerTime = getSingleConditionTimeAnchor(eventData?.触发条件);
  const durationHours = getEventDurationHours(eventData);
  if (!triggerTime || durationHours === null) {
    return false;
  }

  const isShortEvent = durationHours <= CONFIG.SHORT_EVENT_THRESHOLD_DAYS * 24;
  if (!isShortEvent || compareTime(currentTime, triggerTime, '>=')) {
    return false;
  }

  const discoverableFrom = calculateDateOffset(triggerTime, -CONFIG.ELASTIC_TRIGGER_DAYS);
  if (!compareTime(currentTime, discoverableFrom, '>=')) return false;

  return evaluateEventCondition(eventData?.触发条件, {
    ...buildConditionContext(currentTime, statData, eventDefinitions),
    ignoreTimeConditions: true,
  });
}

export function isTimeAfterEventEnd(currentTime, endTime) {
  if (!endTime) {
    log('缺少结束时间');
    return false;
  }

  return compareTime(currentTime, endTime, '>=');
}
