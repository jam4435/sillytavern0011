import { getEndTime, getEventParticipationKeys } from './era-utils.js';
import { writeDirectDelete, writeDirectInsert, writeDirectUpdate } from './era-write-helper.js';
import {
  haveEventDiffsChanged,
  hasEventOutcomeChanged,
  isWorldEventRecord,
} from '../shared/worldEventContext';

export const EVENT_OUTCOME_STATUS = Object.freeze({
  ORIGINAL: '原定',
  DIVERGED: '偏离',
  UNKNOWN: '未知',
});

const LEGACY_ACTIVE_UNKNOWN_PREFIX = '事件已偏离原定发展，具体结果尚未记录。原定发展为：';
const LEGACY_COMPLETED_UNKNOWN_PREFIX = '旧存档未保存玩家参与后的具体结局。原定发展为：';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

export function isOrdinaryWorldEvent(eventName) {
  return typeof eventName === 'string' && eventName.includes('事件条目-') && !eventName.includes('登场事件');
}

export function getEventSummary(eventData) {
  return typeof eventData?.事件概要 === 'string' ? eventData.事件概要.trim() : '';
}

export function findParticipationEntry(participation, eventName) {
  if (!isPlainObject(participation)) return null;

  for (const key of getEventParticipationKeys(eventName)) {
    const entry = participation[key];
    if (
      isPlainObject(entry) &&
      typeof entry.描述 === 'string' &&
      typeof entry.结局 === 'string' &&
      isPlainObject(entry.insert) &&
      isPlainObject(entry.update) &&
      isPlainObject(entry.delete)
    ) {
      return { key, entry };
    }
  }

  return null;
}

function buildLegacyActiveUnknownEnding(eventData) {
  return `${LEGACY_ACTIVE_UNKNOWN_PREFIX}${getEventSummary(eventData)}`;
}

function buildLegacyCompletedUnknownEnding(eventData) {
  return `${LEGACY_COMPLETED_UNKNOWN_PREFIX}${getEventSummary(eventData)}`;
}

export function buildParticipationOutcomeSyncPlan(eventDefinitions, statData) {
  const participation = isPlainObject(statData?.参与事件) ? statData.参与事件 : {};
  const existingStatuses = isPlainObject(statData?.前端变量?.事件结局状态)
    ? statData.前端变量.事件结局状态
    : {};
  const conclusionUpdates = {};
  const statusInserts = {};
  const statusUpdates = {};

  for (const [eventName, eventData] of Object.entries(eventDefinitions || {})) {
    if (!isOrdinaryWorldEvent(eventName)) continue;

    const found = findParticipationEntry(participation, eventName);
    if (!found) continue;

    let ending = found.entry.结局.trim();
    let status;
    if (!ending) {
      if (haveEventDiffsChanged(found.entry, eventData)) {
        ending = buildLegacyActiveUnknownEnding(eventData);
        status = EVENT_OUTCOME_STATUS.UNKNOWN;
      } else {
        ending = getEventSummary(eventData);
        status = EVENT_OUTCOME_STATUS.ORIGINAL;
      }
      conclusionUpdates[found.key] = { 结局: ending };
    } else if (
      existingStatuses[eventName] === EVENT_OUTCOME_STATUS.UNKNOWN &&
      ending.startsWith(LEGACY_ACTIVE_UNKNOWN_PREFIX)
    ) {
      status = EVENT_OUTCOME_STATUS.UNKNOWN;
    } else {
      status = hasEventOutcomeChanged({ ...found.entry, 结局: ending }, eventData)
        ? EVENT_OUTCOME_STATUS.DIVERGED
        : EVENT_OUTCOME_STATUS.ORIGINAL;
    }

    if (!Object.prototype.hasOwnProperty.call(existingStatuses, eventName)) {
      statusInserts[eventName] = status;
    } else if (existingStatuses[eventName] !== status) {
      statusUpdates[eventName] = status;
    }
  }

  return { conclusionUpdates, statusInserts, statusUpdates };
}

export async function syncParticipationOutcomeStates(eventDefinitions, variables) {
  const currentVariables = variables || (await getVariables({ type: 'chat' }));
  const statData = currentVariables?.stat_data || {};
  const plan = buildParticipationOutcomeSyncPlan(eventDefinitions, statData);

  if (Object.keys(plan.conclusionUpdates).length > 0) {
    await writeDirectUpdate(
      { 参与事件: plan.conclusionUpdates },
      `migrate-participation-endings-${Object.keys(plan.conclusionUpdates).length}`,
    );
  }
  if (Object.keys(plan.statusInserts).length > 0) {
    await writeDirectInsert(
      { 前端变量: { 事件结局状态: plan.statusInserts } },
      `insert-event-outcome-statuses-${Object.keys(plan.statusInserts).length}`,
    );
  }
  if (Object.keys(plan.statusUpdates).length > 0) {
    await writeDirectUpdate(
      { 前端变量: { 事件结局状态: plan.statusUpdates } },
      `update-event-outcome-statuses-${Object.keys(plan.statusUpdates).length}`,
    );
  }

  return plan;
}

export function buildWorldEventRecord(eventData, ending) {
  return {
    时间: cloneJson(getEndTime(eventData) || {}),
    地点: typeof eventData?.事件地点 === 'string' ? eventData.事件地点.trim() : '',
    概要: typeof ending === 'string' && ending.trim() ? ending.trim() : getEventSummary(eventData),
  };
}

export function buildWorldEventArchivePatch(eventNames, eventDefinitions, statData) {
  const participation = isPlainObject(statData?.参与事件) ? statData.参与事件 : {};
  const existingWorldEvents = isPlainObject(statData?.世界事件) ? statData.世界事件 : {};
  const patch = {};

  for (const eventName of eventNames) {
    const eventData = eventDefinitions?.[eventName];
    if (!eventData || !isOrdinaryWorldEvent(eventName) || isWorldEventRecord(existingWorldEvents[eventName])) {
      continue;
    }

    const found = findParticipationEntry(participation, eventName);
    patch[eventName] = buildWorldEventRecord(eventData, found?.entry?.结局);
  }

  return patch;
}

export async function ensureWorldEventsArchived(eventNames, eventDefinitions, variables) {
  const currentVariables = variables || (await getVariables({ type: 'chat' }));
  const currentStatData = currentVariables?.stat_data || {};
  const malformedEntries = Object.fromEntries(
    eventNames
      .filter(
        eventName =>
          Object.prototype.hasOwnProperty.call(currentStatData?.世界事件 || {}, eventName) &&
          !isWorldEventRecord(currentStatData.世界事件[eventName]),
      )
      .map(eventName => [eventName, {}]),
  );
  if (Object.keys(malformedEntries).length > 0) {
    await writeDirectDelete(
      { 世界事件: malformedEntries },
      `delete-malformed-world-events-${Object.keys(malformedEntries).length}`,
    );
  }

  const patch = buildWorldEventArchivePatch(eventNames, eventDefinitions, currentStatData);
  if (Object.keys(patch).length > 0) {
    await writeDirectInsert(
      { 世界事件: patch },
      `archive-world-events-${Object.keys(patch).length}`,
    );
  }

  const verifiedVariables = await getVariables({ type: 'chat' });
  const worldEvents = verifiedVariables?.stat_data?.世界事件 || {};
  return eventNames
    .filter(eventName => isOrdinaryWorldEvent(eventName) && eventDefinitions?.[eventName])
    .every(eventName => isWorldEventRecord(worldEvents[eventName]));
}

export async function reconcileWorldEventArchive(eventDefinitions) {
  await syncParticipationOutcomeStates(eventDefinitions);

  const variables = await getVariables({ type: 'chat' });
  const statData = variables?.stat_data || {};
  const completedEvents = isPlainObject(statData?.事件系统?.已完成事件) ? statData.事件系统.已完成事件 : {};
  const existingWorldEvents = isPlainObject(statData.世界事件) ? statData.世界事件 : {};
  const existingStatuses = isPlainObject(statData?.前端变量?.事件结局状态)
    ? statData.前端变量.事件结局状态
    : {};
  const worldEventPatch = {};
  const malformedWorldEventDeletes = {};
  const unknownStatusInserts = {};
  const unknownStatusUpdates = {};

  for (const [eventName, participationFlag] of Object.entries(completedEvents)) {
    const eventData = eventDefinitions?.[eventName];
    if (!eventData || !isOrdinaryWorldEvent(eventName) || isWorldEventRecord(existingWorldEvents[eventName])) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(existingWorldEvents, eventName)) {
      malformedWorldEventDeletes[eventName] = {};
    }

    const found = findParticipationEntry(statData.参与事件, eventName);
    let ending = getEventSummary(eventData);
    if (participationFlag === 1) {
      ending = found?.entry?.结局?.trim() || buildLegacyCompletedUnknownEnding(eventData);
      if (!found) {
        if (!Object.prototype.hasOwnProperty.call(existingStatuses, eventName)) {
          unknownStatusInserts[eventName] = EVENT_OUTCOME_STATUS.UNKNOWN;
        } else if (existingStatuses[eventName] !== EVENT_OUTCOME_STATUS.UNKNOWN) {
          unknownStatusUpdates[eventName] = EVENT_OUTCOME_STATUS.UNKNOWN;
        }
      }
    }
    worldEventPatch[eventName] = buildWorldEventRecord(eventData, ending);
  }

  if (Object.keys(malformedWorldEventDeletes).length > 0) {
    await writeDirectDelete(
      { 世界事件: malformedWorldEventDeletes },
      `delete-malformed-legacy-world-events-${Object.keys(malformedWorldEventDeletes).length}`,
    );
  }
  if (Object.keys(worldEventPatch).length > 0) {
    await writeDirectInsert(
      { 世界事件: worldEventPatch },
      `backfill-world-events-${Object.keys(worldEventPatch).length}`,
    );
  }
  if (Object.keys(unknownStatusInserts).length > 0) {
    await writeDirectInsert(
      { 前端变量: { 事件结局状态: unknownStatusInserts } },
      `insert-legacy-unknown-statuses-${Object.keys(unknownStatusInserts).length}`,
    );
  }
  if (Object.keys(unknownStatusUpdates).length > 0) {
    await writeDirectUpdate(
      { 前端变量: { 事件结局状态: unknownStatusUpdates } },
      `update-legacy-unknown-statuses-${Object.keys(unknownStatusUpdates).length}`,
    );
  }

  return {
    archived: Object.keys(worldEventPatch).length,
    unknown: Object.keys(unknownStatusInserts).length + Object.keys(unknownStatusUpdates).length,
  };
}
