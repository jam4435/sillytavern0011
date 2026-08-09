// Manifest-backed candidate selection for the sparse future-event state.

import { getSingleConditionTimeAnchor } from './era-event-schema.js';
import { calculateTimeOffset, timeToTotalMinutes } from './era-utils.js';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function eventTimeToHours(time) {
  if (!time || typeof time !== 'object') return null;
  return (Number(time.年 || 0) * 365 + Number(time.月 || 0) * 30 + Number(time.日 || 0)) * 24 + Number(time.时 || 0);
}

function upperBound(entries, hour) {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (Number(entries[middle]?.hour) <= hour) low = middle + 1;
    else high = middle;
  }
  return low;
}

function addThroughHour(target, entries, hour) {
  for (const entry of entries.slice(0, upperBound(entries, hour))) {
    if (entry?.runtimeKey) target.add(entry.runtimeKey);
  }
}

export function getManifestEventCandidateKeys(manifest, currentTime, statData) {
  if (!isPlainObject(manifest)) return null;
  const currentHour = eventTimeToHours(currentTime);
  if (currentHour === null) return [];

  const indexes = manifest.indexes || {};
  const candidates = new Set();
  addThroughHour(candidates, Array.isArray(indexes.byTrigger) ? indexes.byTrigger : [], currentHour);
  addThroughHour(candidates, Array.isArray(indexes.byDiscovery) ? indexes.byDiscovery : [], currentHour);
  const conditionalKeys = Array.isArray(indexes.conditional)
    ? indexes.conditional
    : (manifest.events || []).filter(entry => entry?.conditional).map(entry => entry.runtimeKey);
  conditionalKeys.forEach(key => candidates.add(typeof key === 'string' ? key : key?.runtimeKey));

  const completed = statData?.事件系统?.已完成事件 || {};
  const expired = statData?.事件系统?.已失效事件 || {};
  const active = statData?.事件系统?.进行中事件 || {};
  const unstarted = statData?.事件系统?.未发生事件 || {};
  const entryByKey = new Map((manifest.events || []).map(entry => [entry.runtimeKey, entry]));
  for (const key of Object.keys(active)) candidates.add(key);
  // 稀疏未来状态通常不保存完整未发生列表，但相对时间平移后的少量事件会把
  // 新触发条件写回这个现有桶。它们必须在脚本重载后继续参与候选检查。
  for (const [key, condition] of Object.entries(unstarted)) {
    const entry = entryByKey.get(key);
    const plannedCondition = entry?.triggerCondition || entry?.triggerTime;
    if (!plannedCondition || JSON.stringify(condition) !== JSON.stringify(plannedCondition)) {
      candidates.add(key);
    }
  }

  return [...candidates].filter(key => {
    if (Object.prototype.hasOwnProperty.call(completed, key)) return false;
    if (Object.prototype.hasOwnProperty.call(expired, key)) return false;
    if (Object.prototype.hasOwnProperty.call(active, key)) return true;
    if (Object.prototype.hasOwnProperty.call(unstarted, key)) return true;
    const entry = entryByKey.get(key);
    if (entry?.conditional) return true;
    // Discovery index also contains already-scheduled events; only retain
    // future events inside their ten-day discovery window.
    return Number.isFinite(entry?.discoveryHour) && Number(entry.discoveryHour) <= currentHour;
  });
}

function cloneJson(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function replaceSingleTimeAnchor(condition, nextTime) {
  if (!isPlainObject(condition)) return condition;

  const directAnchor = getSingleConditionTimeAnchor(condition);
  if (!directAnchor) return cloneJson(condition);

  if (
    (condition.类型 === undefined || condition.类型 === '时间') &&
    ['年', '月', '日'].every(key => Object.prototype.hasOwnProperty.call(condition, key))
  ) {
    return {
      ...cloneJson(condition),
      ...cloneJson(nextTime),
    };
  }

  if (isPlainObject(condition.时间)) {
    return {
      ...cloneJson(condition),
      时间: cloneJson(nextTime),
    };
  }

  for (const key of ['全部', '任一']) {
    if (!Array.isArray(condition[key])) continue;
    let replaced = false;
    const children = condition[key].map(child => {
      if (replaced || !getSingleConditionTimeAnchor(child)) return cloneJson(child);
      replaced = true;
      return replaceSingleTimeAnchor(child, nextTime);
    });
    if (replaced) {
      return {
        ...cloneJson(condition),
        [key]: children,
      };
    }
  }

  return cloneJson(condition);
}

/**
 * 把同一地点同批命中的事件按原始触发时间排序。首事件锚定 currentTime，
 * 其余事件保持相对首事件的原始时间差，并继续留在未发生事件中。
 */
export function buildRelativeEventRebasePlan(eventNames, eventDefinitions, currentTime) {
  const candidates = [...new Set(eventNames)]
    .map((eventName, originalIndex) => {
      const eventData = eventDefinitions?.[eventName];
      const plannedTime = getSingleConditionTimeAnchor(eventData?.触发条件);
      return plannedTime
        ? {
            eventName,
            eventData,
            plannedTime,
            plannedMinutes: timeToTotalMinutes(plannedTime),
            originalIndex,
          }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.plannedMinutes - right.plannedMinutes || left.originalIndex - right.originalIndex);

  if (candidates.length === 0) {
    return { firstEventName: null, orderedEventNames: [], deferredConditions: {} };
  }

  const first = candidates[0];
  const deferredConditions = {};
  for (const candidate of candidates.slice(1)) {
    const deltaMinutes = candidate.plannedMinutes - first.plannedMinutes;
    const shiftedTime = calculateTimeOffset(currentTime, { 分: deltaMinutes });
    deferredConditions[candidate.eventName] = replaceSingleTimeAnchor(candidate.eventData.触发条件, shiftedTime);
  }

  return {
    firstEventName: first.eventName,
    orderedEventNames: candidates.map(candidate => candidate.eventName),
    deferredConditions,
  };
}

export function sortUnstartedEventsByTrigger(unstartedEvents) {
  return Object.fromEntries(
    Object.entries(unstartedEvents || {})
      .map(([eventName, condition], originalIndex) => ({
        eventName,
        condition,
        triggerTime: getSingleConditionTimeAnchor(condition),
        originalIndex,
      }))
      .sort((left, right) => {
        if (!left.triggerTime && !right.triggerTime) return left.originalIndex - right.originalIndex;
        if (!left.triggerTime) return 1;
        if (!right.triggerTime) return -1;
        return (
          timeToTotalMinutes(left.triggerTime) - timeToTotalMinutes(right.triggerTime) ||
          left.originalIndex - right.originalIndex
        );
      })
      .map(({ eventName, condition }) => [eventName, condition]),
  );
}

export function buildEventScheduleState(manifestHash, currentTime) {
  return {
    schemaVersion: 1,
    manifestHash: typeof manifestHash === 'string' ? manifestHash : '',
    lastCheckedTime: currentTime && typeof currentTime === 'object' ? JSON.parse(JSON.stringify(currentTime)) : null,
  };
}
