// ================================================================================
// ERA 事件系统 - 事件操作模块 (第1部分)
// ================================================================================
// 包含: 批量初始化、批量开始、批量完成、批量结束事件

import {
  CONFIG,
  log,
  logError,
  logSuccess,
  logWarning,
  getEndTime,
  getEventMetadata,
  hasParticipationEntry,
  getParticipationEntry,
  buildInvalidParticipationDeletePatch,
  buildParticipationDeletePatch,
  isDebutEvent,
  normalizeOrdinaryEventReference,
  calculateTimeOffset,
  getEventDurationHours,
  formatDate,
  debugGroup,
  debugGroupCollapsed,
  debugGroupEnd,
  isDebugEnabled,
} from './era-utils.js';

import { isTimeForEvent, isTimeAfterEventEnd } from './era-event-checker.js';
import { writeEraTransaction } from './era-write-helper.js';
import {
  PARTICIPANT_ENTRY_SOURCE,
  buildOccupancyCleanupPatch,
  buildParticipantEntryPlan,
} from './era-participant-entry.js';
import {
  getEventSummary,
  buildWorldEventRecord,
  buildWorldEventArchivePatch,
  isOrdinaryWorldEvent,
  syncParticipationOutcomeStates,
} from './era-world-events.js';
import { writeDirectChatTransaction } from '../shared/directVariableWrite';
import { isWorldEventRecord } from '../shared/worldEventContext';
import { notifyEvent } from './era-notifications.js';
import {
  getSingleConditionTimeAnchor,
  isPureTimeTrigger,
  normalizeBranchMarkers,
  normalizeFollowupEvents,
} from './era-event-schema.js';

const CHAPTER_SEQUENCE_PATTERN = /^(.*?第[0-9一二三四五六七八九十百千万]+回[0-9]+)-/;
const EVENT_DIFF_ACTIONS = ['insert', 'update', 'delete'];
const EVENT_SETTLEMENT_PROGRESS_KEY = '事件结算进度';
const followupReferenceIndexCache = new WeakMap();

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function applyOpeningObjectPatch(target, action, patch) {
  if (!isPlainObject(patch)) return;

  const apply = (node, nodePatch, operation) => {
    if (!isPlainObject(nodePatch)) return;
    for (const [key, value] of Object.entries(nodePatch)) {
      if (operation === 'insert') {
        if (node[key] === undefined) node[key] = cloneJson(value);
        else if (isPlainObject(node[key]) && isPlainObject(value)) apply(node[key], value, operation);
      } else if (operation === 'update') {
        if (node[key] === undefined) continue;
        if (isPlainObject(node[key]) && isPlainObject(value)) apply(node[key], value, operation);
        else node[key] = cloneJson(value);
      } else if (operation === 'delete') {
        if (node[key] === undefined) continue;
        if (isPlainObject(node[key]) && isPlainObject(value) && Object.keys(value).length > 0)
          apply(node[key], value, operation);
        else delete node[key];
      } else {
        node[key] = cloneJson(value);
      }
    }
  };

  apply(target, patch, action);
}

function applyOpeningCharacterDelta(statData, eventData, eventName) {
  if (!isPlainObject(statData.角色数据)) statData.角色数据 = {};

  for (const action of EVENT_DIFF_ACTIONS) {
    const delta = eventData?.[action];
    if (!isPlainObject(delta)) continue;
    for (const [characterName, characterPatch] of Object.entries(delta)) {
      if (action !== 'insert' && !statData.角色数据[characterName]) {
        logWarning(`开局历史事件 ${eventName} 的角色 ${characterName} 不存在，跳过 ${action}`);
        continue;
      }
      if (!isPlainObject(statData.角色数据[characterName])) statData.角色数据[characterName] = {};
      applyOpeningObjectPatch(statData.角色数据[characterName], action, characterPatch);
    }
  }
}

function applyOpeningDebutDelta(statData, eventData, eventName) {
  if (!isPlainObject(statData.角色数据)) statData.角色数据 = {};
  for (const [characterName, characterPatch] of Object.entries(eventData?.insert || {})) {
    if (!isPlainObject(statData.角色数据[characterName])) statData.角色数据[characterName] = {};
    applyOpeningObjectPatch(statData.角色数据[characterName], 'insert', characterPatch);
    log(`[开局登场] 添加角色 ${characterName} (${eventName})`);
  }
}

function stripJsonSuffix(value) {
  const text = String(value || '').trim();
  return text.replace(/\.(json|ya?ml|txt)$/i, '');
}

function resolveEventReference(sourceEventName, targetEventName, eventDefinitions) {
  const rawTarget = stripJsonSuffix(targetEventName);
  if (!rawTarget) return rawTarget;
  if (eventDefinitions[rawTarget]) return rawTarget;

  const canonicalTarget = normalizeOrdinaryEventReference(rawTarget, sourceEventName);
  if (eventDefinitions[canonicalTarget]) return canonicalTarget;

  const sequencePrefix = canonicalTarget.match(CHAPTER_SEQUENCE_PATTERN)?.[1];
  if (sequencePrefix) {
    const sourceSeries = getEventMetadata(eventDefinitions[sourceEventName])?.series;
    const sequenceMatches = Object.keys(eventDefinitions).filter(name => {
      const metadata = getEventMetadata(eventDefinitions[name]);
      return metadata?.series === sourceSeries && name.startsWith(`${sequencePrefix}-`);
    });
    if (sequenceMatches.length === 1) return sequenceMatches[0];
  }

  return canonicalTarget;
}

function addValueToSetMap(map, key, value) {
  if (!key || !value) return;

  if (!map.has(key)) {
    map.set(key, new Set());
  }

  map.get(key).add(value);
}

function getFollowupReferenceIndex(eventDefinitions) {
  if (followupReferenceIndexCache.has(eventDefinitions)) {
    return followupReferenceIndexCache.get(eventDefinitions);
  }

  const sourceToTargets = new Map();
  const clueKeysByTargetKey = new Map();

  for (const [sourceEventName, eventData] of Object.entries(eventDefinitions)) {
    const followupInfo = eventData?.后续事件;
    if (!followupInfo) continue;

    const targets = new Set();
    for (const targetReference of Object.keys(normalizeFollowupEvents(followupInfo))) {
      const targetEventKey = resolveEventReference(sourceEventName, targetReference, eventDefinitions);
      if (!eventDefinitions[targetEventKey]) continue;
      targets.add(targetEventKey);
      // New clues use the target key. The source key is retained only so old
      // saves can remove their legacy clue when the target is joined.
      addValueToSetMap(clueKeysByTargetKey, targetEventKey, targetEventKey);
      addValueToSetMap(clueKeysByTargetKey, targetEventKey, sourceEventName);
    }
    if (targets.size > 0) sourceToTargets.set(sourceEventName, targets);
  }

  const index = {
    sourceToTargets,
    clueKeysByTargetKey,
  };
  followupReferenceIndexCache.set(eventDefinitions, index);
  return index;
}

export function getValidEventPredecessors(eventName, eventDefinitions) {
  return [];
}

export function areEventPredecessorsCompleted(eventName, eventDefinitions, completedEvents) {
  return true;
}

export function buildActualEventWindow(eventData, currentTime, earlyStart = false) {
  const plannedStart = getSingleConditionTimeAnchor(eventData?.触发条件);
  const plannedEnd = getEndTime(eventData || {});
  const durationHours = getEventDurationHours(eventData);
  if (eventData?.事件持续时间 && currentTime && durationHours !== null) {
    return {
      startTime: cloneJson(currentTime),
      endTime: calculateTimeOffset(currentTime, { 时: durationHours }),
    };
  }
  if (!earlyStart || !currentTime || !plannedEnd) {
    return { startTime: plannedStart, endTime: plannedEnd };
  }

  return {
    startTime: cloneJson(currentTime),
    endTime: durationHours === null ? plannedEnd : calculateTimeOffset(currentTime, { 时: durationHours }),
  };
}

export function resolveActualEventWindow(eventData, actualEndTime) {
  const plannedEnd = getEndTime(eventData || {});
  const endTime = actualEndTime || plannedEnd;
  const durationHours = getEventDurationHours(eventData);
  if (!endTime || durationHours === null) {
    return { startTime: getSingleConditionTimeAnchor(eventData?.触发条件), endTime };
  }

  const endMatchesPlan = JSON.stringify(endTime) === JSON.stringify(plannedEnd);
  return {
    startTime:
      endMatchesPlan && !eventData?.事件持续时间
        ? getSingleConditionTimeAnchor(eventData?.触发条件)
        : calculateTimeOffset(endTime, { 时: -durationHours }),
    endTime,
  };
}

function normalizeEventRecordName(sourceEventName, recordName) {
  return normalizeOrdinaryEventReference(recordName, sourceEventName);
}

function normalizeCharacterDeltaForEvent(delta, eventName) {
  const normalizedDelta = cloneJson(delta || {});
  if (!isPlainObject(normalizedDelta?.人物经历)) {
    return normalizedDelta;
  }

  const normalizedExperiences = {};
  for (const [recordName, recordValue] of Object.entries(normalizedDelta.人物经历)) {
    normalizedExperiences[normalizeEventRecordName(eventName, recordName)] = recordValue;
  }
  normalizedDelta.人物经历 = normalizedExperiences;
  return normalizedDelta;
}

function mergePlainObject(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (isPlainObject(target[key]) && isPlainObject(value)) {
      mergePlainObject(target[key], value);
    } else {
      target[key] = cloneJson(value);
    }
  }
  return target;
}

function mergeCharacterDeltaForEvent(target, source, eventName) {
  return mergePlainObject(target, normalizeCharacterDeltaForEvent(source, eventName));
}

function isEmptyPlainObject(value) {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

// ERA 的 insertByObject 不能覆盖已存在的叶子路径。事件结算重试或同一事件的
// 多来源差分命中既有经历时，把真正新增的叶子保留为 insert，把不同值转为 update，
// 相同值则跳过，从而让差分重放保持幂等。
function splitInsertPatchAgainstExisting(patch, existingValue) {
  const insert = {};
  const update = {};
  for (const [key, value] of Object.entries(patch || {})) {
    const existingChild = isPlainObject(existingValue) ? existingValue[key] : undefined;
    if (existingChild === undefined) {
      insert[key] = cloneJson(value);
      continue;
    }
    if (isPlainObject(value) && isPlainObject(existingChild)) {
      const nested = splitInsertPatchAgainstExisting(value, existingChild);
      if (!isEmptyPlainObject(nested.insert)) insert[key] = nested.insert;
      if (!isEmptyPlainObject(nested.update)) update[key] = nested.update;
      continue;
    }
    if (JSON.stringify(existingChild) !== JSON.stringify(value)) {
      update[key] = cloneJson(value);
    }
  }
  return { insert, update };
}

function getParticipationActionDiff(participationEntry, actionKey) {
  if (!isPlainObject(participationEntry)) {
    return {};
  }

  const diff = participationEntry[actionKey];
  return isPlainObject(diff) ? diff : {};
}

function getInitialParticipationActionDiff(eventData, actionKey, eventName) {
  const delta = eventData?.[actionKey];
  if (!isPlainObject(delta)) return {};

  return Object.fromEntries(
    Object.entries(delta).map(([characterName, characterDelta]) => [
      characterName,
      normalizeCharacterDeltaForEvent(characterDelta, eventName),
    ]),
  );
}

function mergeEventActionDelta(mergedDiff, actionKey, delta, eventName, statData, sourceLabel) {
  if (!isPlainObject(delta) || Object.keys(delta).length === 0) {
    return;
  }

  for (const charName in delta) {
    const characterExists = !!statData.角色数据?.[charName];
    const willExistAfterInsert = actionKey !== 'insert' && !!mergedDiff.insert?.[charName];
    if (actionKey !== 'insert' && !characterExists && !willExistAfterInsert) {
      logWarning(`角色 ${charName} 不存在，跳过 ${sourceLabel} ${actionKey}`);
      continue;
    }

    const normalizedPatch = normalizeCharacterDeltaForEvent(delta[charName], eventName);
    if (actionKey === 'insert' && characterExists) {
      const split = splitInsertPatchAgainstExisting(normalizedPatch, statData.角色数据[charName]);
      if (!isEmptyPlainObject(split.insert)) {
        if (!mergedDiff.insert[charName]) mergedDiff.insert[charName] = {};
        mergePlainObject(mergedDiff.insert[charName], split.insert);
      }
      if (!isEmptyPlainObject(split.update)) {
        if (!mergedDiff.update[charName]) mergedDiff.update[charName] = {};
        mergePlainObject(mergedDiff.update[charName], split.update);
      }
      log(`[INSERT] 已按既有路径拆分角色差分: ${charName} (${sourceLabel})`);
      continue;
    }
    if (!mergedDiff[actionKey][charName]) {
      mergedDiff[actionKey][charName] = {};
    }
    mergePlainObject(mergedDiff[actionKey][charName], normalizedPatch);
    log(
      `[${actionKey.toUpperCase()}] 准备${actionKey === 'delete' ? '删除' : '修改'}角色: ${charName} (${sourceLabel})`,
    );
  }
}

// ==================== 开局事件状态单事务初始化 ====================
export async function initializeEventList(eventDefinitions, options = {}) {
  const eventNames = Object.keys(eventDefinitions || {});
  if (eventNames.length === 0) {
    return { initialized: true, added: 0, committed: false };
  }

  const rootBootstrap = options.rootBootstrap === true;
  let result = { initialized: false, added: 0, committed: false, eventNames: [] };

  await writeDirectChatTransaction(
    variables => {
      if (!variables?.stat_data?.世界信息?.时间) {
        throw new Error('无法初始化事件：stat_data.世界信息.时间尚未落库');
      }

      const statData = variables.stat_data;
      const currentTime = statData.世界信息.时间;
      statData.事件系统 = isPlainObject(statData.事件系统) ? statData.事件系统 : {};
      statData.事件系统.未发生事件 = isPlainObject(statData.事件系统.未发生事件) ? statData.事件系统.未发生事件 : {};
      statData.事件系统.进行中事件 = isPlainObject(statData.事件系统.进行中事件) ? statData.事件系统.进行中事件 : {};
      statData.事件系统.已完成事件 = isPlainObject(statData.事件系统.已完成事件) ? statData.事件系统.已完成事件 : {};
      statData.事件系统.已失效事件 = isPlainObject(statData.事件系统.已失效事件) ? statData.事件系统.已失效事件 : {};
      statData.事件系统.人物事件占用 = isPlainObject(statData.事件系统.人物事件占用)
        ? statData.事件系统.人物事件占用
        : {};
      statData.世界事件 = isPlainObject(statData.世界事件) ? statData.世界事件 : {};
      statData.前端变量 = isPlainObject(statData.前端变量) ? statData.前端变量 : {};

      const sparseFuture = options.sparseFuture === true;
      const legacyUnstartedKeys = Object.keys(statData.事件系统.未发生事件);
      const knownEventKeys = new Set([
        ...legacyUnstartedKeys,
        ...Object.keys(statData.事件系统.进行中事件),
        ...Object.keys(statData.事件系统.已完成事件),
        ...Object.keys(statData.事件系统.已失效事件),
      ]);

      const checkpoint = rootBootstrap && options.applyCheckpoint === true ? options.checkpoint : null;
      if (checkpoint && Array.isArray(checkpoint.completedRuntimeKeys)) {
        for (const runtimeKey of checkpoint.completedRuntimeKeys) {
          statData.事件系统.已完成事件[runtimeKey] = 0;
          // A checkpoint already contains the effects of these events (and,
          // when present, a character snapshot).  Treat them as known before
          // planning new entries so opening initialization cannot replay their
          // character diffs on top of the snapshot.
          knownEventKeys.add(runtimeKey);
        }
      }
      if (checkpoint && isPlainObject(checkpoint.characterState)) {
        statData.角色数据 = isPlainObject(statData.角色数据) ? statData.角色数据 : {};
        for (const [characterName, characterState] of Object.entries(checkpoint.characterState)) {
          statData.角色数据[characterName] = cloneJson(characterState);
        }
      } else if (checkpoint && Array.isArray(checkpoint.operations)) {
        for (const operation of checkpoint.operations) {
          for (const action of EVENT_DIFF_ACTIONS) {
            applyOpeningObjectPatch(statData.角色数据 || (statData.角色数据 = {}), action, operation?.[action]);
          }
        }
      }

      // 只有新游戏根初始化可以把世界书时间线物化为当前楼层状态。
      // 已有聊天（包括 CHAT_CHANGED 和历史树检出）只能补齐 schema/调度缓存，
      // 不能在当前楼层追补过去本应发生在历史楼层的开始、完成、归档或角色差分。
      const newEvents = rootBootstrap ? eventNames.filter(eventName => !knownEventKeys.has(eventName)) : [];

      if (rootBootstrap && sparseFuture) {
        statData.事件系统.未发生事件 = {};
      }

      for (const eventName of newEvents) {
        const eventData = eventDefinitions[eventName];
        const endTime = getEndTime(eventData);
        const expired = endTime && isTimeAfterEventEnd(currentTime, endTime);
        const conditional = !isPureTimeTrigger(eventData?.触发条件);
        const due = isTimeForEvent(currentTime, eventData, eventName, statData, eventDefinitions);

        if (expired && conditional) {
          statData.事件系统.已失效事件[eventName] = cloneJson(endTime);
          continue;
        }

        if (!expired && !due) {
          if (!sparseFuture) {
            statData.事件系统.未发生事件[eventName] = cloneJson(eventData.触发条件);
          }
          continue;
        }

        if (!expired && due && !isDebutEvent(eventData)) {
          statData.事件系统.进行中事件[eventName] = cloneJson(endTime);
          continue;
        }

        statData.事件系统.已完成事件[eventName] = 0;
        if (isDebutEvent(eventData)) {
          applyOpeningDebutDelta(statData, eventData, eventName);
        } else {
          applyOpeningCharacterDelta(statData, eventData, eventName);
          if (!isWorldEventRecord(statData.世界事件[eventName])) {
            statData.世界事件[eventName] = buildWorldEventRecord(eventData, undefined, endTime);
          }
        }
      }

      if (sparseFuture) {
        statData.前端变量.事件调度状态 = {
          schemaVersion: 1,
          manifestHash: options.manifestHash || '',
          lastCheckedTime: cloneJson(currentTime),
        };
      }

      result = {
        initialized: true,
        added: newEvents.length,
        committed: newEvents.length > 0,
        eventNames: newEvents,
        futureEventNames: newEvents.filter(
          eventName =>
            !Object.prototype.hasOwnProperty.call(statData.事件系统.进行中事件, eventName) &&
            !Object.prototype.hasOwnProperty.call(statData.事件系统.已完成事件, eventName) &&
            !Object.prototype.hasOwnProperty.call(statData.事件系统.已失效事件, eventName),
        ),
      };
      return variables;
    },
    'initialize-opening-event-state',
    { operation: 'replace', refreshHint: 'character-data' },
  );

  const verifiedVariables = await getVariables({ type: 'chat' });
  const verifiedSystem = verifiedVariables?.stat_data?.事件系统 || {};
  const persisted = result.eventNames.every(
    eventName =>
      result.futureEventNames?.includes(eventName) ||
      Object.prototype.hasOwnProperty.call(verifiedSystem.未发生事件 || {}, eventName) ||
      Object.prototype.hasOwnProperty.call(verifiedSystem.进行中事件 || {}, eventName) ||
      Object.prototype.hasOwnProperty.call(verifiedSystem.已完成事件 || {}, eventName) ||
      Object.prototype.hasOwnProperty.call(verifiedSystem.已失效事件 || {}, eventName),
  );
  if (!persisted) {
    throw new Error('开局事件状态单事务提交后校验失败');
  }

  logSuccess(`开局事件初始化完成：处理 ${result.added} 个新事件，direct commit=${result.committed ? 1 : 0}`);
  return result;
}

// 开局初始化已统一走上方的单事务规划器；旧的多写入实现已移除。

export async function applyParticipantEntry(eventName, eventData, source) {
  const result = await applyParticipantEntries([eventName], { [eventName]: eventData }, source);
  return result.plans[eventName] || { entered: 0, skipped: 0 };
}

export async function applyParticipantEntries(eventNames, eventDefinitions, source, options = {}) {
  const uniqueEventNames = [...new Set(eventNames)].filter(eventName => {
    const eventData = eventDefinitions[eventName];
    return eventData && !isDebutEvent(eventData);
  });

  if (uniqueEventNames.length === 0) {
    return {
      entered: 0,
      skipped: 0,
      plans: {},
      locationUpdates: {},
      occupancyDeletes: {},
      occupancyInserts: {},
    };
  }

  const currentVars = options.currentVars || (await getVariables({ type: 'chat' }));
  const statData = currentVars?.stat_data || {};
  const currentTime = options.currentTime || statData.世界信息?.时间 || {};
  const simulatedCharacters = { ...(isPlainObject(statData.角色数据) ? statData.角色数据 : {}) };
  const simulatedOccupancy = {
    ...(isPlainObject(statData.事件系统?.人物事件占用) ? statData.事件系统.人物事件占用 : {}),
  };

  const mergedLocationUpdates = {};
  const mergedOccupancyDeletes = {};
  const mergedOccupancyInserts = {};
  const plans = {};

  for (const eventName of uniqueEventNames) {
    const eventData = eventDefinitions[eventName];
    const plan = buildParticipantEntryPlan({
      eventName,
      eventData,
      source,
      currentTime,
      characters: simulatedCharacters,
      occupancy: simulatedOccupancy,
    });

    for (const characterName of plan.missingCharacters) {
      logWarning(`事件 ${eventName} 的参与人物 ${characterName} 尚未登场，跳过自动入场`);
    }

    for (const conflict of plan.conflicts) {
      logWarning(
        `人物 ${conflict.人物} 已被事件 ${conflict.当前事件} 占用，时间触发事件 ${conflict.请求事件} 不覆盖其位置`,
      );
    }

    Object.assign(mergedLocationUpdates, plan.locationUpdates);
    Object.assign(mergedOccupancyDeletes, plan.occupancyDeletes);
    Object.assign(mergedOccupancyInserts, plan.occupancyInserts);

    for (const characterName of Object.keys(plan.locationUpdates)) {
      simulatedCharacters[characterName] = {
        ...(isPlainObject(simulatedCharacters[characterName]) ? simulatedCharacters[characterName] : {}),
        ...plan.locationUpdates[characterName],
      };
    }
    for (const characterName of Object.keys(plan.occupancyDeletes)) {
      delete simulatedOccupancy[characterName];
    }
    for (const [characterName, occupancyValue] of Object.entries(plan.occupancyInserts)) {
      simulatedOccupancy[characterName] = occupancyValue;
    }

    const entered = Object.keys(plan.occupancyInserts).length;
    plans[eventName] = {
      entered,
      skipped: plan.missingCharacters.length + plan.conflicts.length + plan.alreadyEntered.length,
      ...plan,
    };
  }

  const transactionOperations = [];
  if (Object.keys(mergedLocationUpdates).length > 0) {
    transactionOperations.push({
      type: 'update',
      payload: { 角色数据: mergedLocationUpdates },
    });
  }
  if (Object.keys(mergedOccupancyDeletes).length > 0) {
    transactionOperations.push({
      type: 'delete',
      payload: { 事件系统: { 人物事件占用: mergedOccupancyDeletes } },
    });
  }
  if (Object.keys(mergedOccupancyInserts).length > 0) {
    transactionOperations.push({
      type: 'insert',
      payload: { 事件系统: { 人物事件占用: mergedOccupancyInserts } },
    });
  }

  if (!options.deferWrite && transactionOperations.length > 0) {
    await writeEraTransaction(transactionOperations, `participant-entry-${source}-${uniqueEventNames.length}events`);
  }

  const entered = Object.values(plans).reduce((total, plan) => total + plan.entered, 0);
  const skipped = Object.values(plans).reduce((total, plan) => total + plan.skipped, 0);
  if (entered > 0) {
    logSuccess(`已按${source}批量完成 ${entered} 名参与人物入场 (${uniqueEventNames.length} 个事件)`);
  }

  return {
    entered,
    skipped,
    plans,
    locationUpdates: mergedLocationUpdates,
    occupancyDeletes: mergedOccupancyDeletes,
    occupancyInserts: mergedOccupancyInserts,
    transactionOperations,
  };
}

export async function applyTimedParticipantEntries(eventNames, eventDefinitions, currentTime, currentVars) {
  const eligibleEventNames = [];

  for (const eventName of eventNames) {
    const eventData = eventDefinitions[eventName];
    const endTime = getEndTime(eventData);

    if (!eventData || isDebutEvent(eventData) || (endTime && isTimeAfterEventEnd(currentTime, endTime))) {
      continue;
    }

    eligibleEventNames.push(eventName);
  }

  return applyParticipantEntries(eligibleEventNames, eventDefinitions, PARTICIPANT_ENTRY_SOURCE.TIME, {
    currentTime,
    currentVars,
  });
}

// ==================== 批量开始事件 ====================
export async function batchStartEvents(eventNames, eventDefinitions, options = {}) {
  if (eventNames.length === 0) return;

  debugGroup(`▶️ 批量开始事件 (${eventNames.length}个)`);

  try {
    // 1. 批量添加到"进行中"。提前到场事件保留原事件小时级时长，其他事件使用原定结束时间。
    const earlyEventNames = new Set(options.earlyEventNames || []);
    const 进行中事件对象 = Object.fromEntries(
      eventNames.map(name => [
        name,
        buildActualEventWindow(eventDefinitions[name], options.currentTime, earlyEventNames.has(name)).endTime,
      ]),
    );

    const insertPayload = {
      事件系统: {
        进行中事件: 进行中事件对象,
      },
    };

    // 2. 批量从"未发生"中删除
    const 未发生删除对象 = Object.fromEntries(eventNames.map(name => [name, {}]));

    const deletePayload = {
      事件系统: {
        未发生事件: 未发生删除对象,
      },
    };

    log('🚀 在同一 ERA 事务中开始事件并删除未发生状态');
    await writeEraTransaction(
      [
        { type: 'insert', payload: insertPayload },
        { type: 'delete', payload: deletePayload },
      ],
      `batch-start-${eventNames.length}`,
    );
    log('✅ 批量开始事件事务完成');

    // 验证操作后的状态
    const verifyVars = await getVariables({ type: 'chat' });
    if (isDebugEnabled()) {
      debugGroupCollapsed('🔍 批量开始后的事件系统状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data?.事件系统 || {})));
      debugGroupEnd();
    }

    logSuccess(`批量开始了 ${eventNames.length} 个事件:`, eventNames);

    // 显示通知（限制数量避免刷屏）
    if (eventNames.length <= 5) {
      eventNames.forEach(name => {
        notifyEvent({
          kind: 'event-started',
          level: 'info',
          message: `📜 事件开始: ${name}`,
          eventNames: [name],
          durationMs: 2000,
        });
      });
    } else {
      notifyEvent({
        kind: 'event-started',
        level: 'info',
        message: `📜 ${eventNames.length} 个事件已开始`,
        eventNames,
        durationMs: 3000,
      });
    }
  } catch (error) {
    logError(`批量开始事件失败`, error);
  }

  debugGroupEnd();
}

export async function batchExpireEvents(eventNames, eventDefinitions) {
  const uniqueEventNames = [...new Set(eventNames)].filter(eventName => eventDefinitions[eventName]);
  if (uniqueEventNames.length === 0) return true;

  const expiredPatch = Object.fromEntries(
    uniqueEventNames.map(eventName => [eventName, cloneJson(getEndTime(eventDefinitions[eventName])) || 1]),
  );
  const unstartedDeletes = Object.fromEntries(uniqueEventNames.map(eventName => [eventName, {}]));
  const committed = await writeEraTransaction(
    [
      { type: 'insert', payload: { 事件系统: { 已失效事件: expiredPatch } } },
      { type: 'delete', payload: { 事件系统: { 未发生事件: unstartedDeletes } } },
    ],
    `batch-expire-${uniqueEventNames.length}`,
  );
  if (committed) logSuccess(`已将 ${uniqueEventNames.length} 个条件事件归档为失效:`, uniqueEventNames);
  return committed;
}

// ==================== 批量完成登场事件（从未发生直接到已完成）====================
export async function batchCompleteDebutEvents(eventNames, eventDefinitions) {
  if (eventNames.length === 0) return;

  debugGroup(`🎭 批量完成登场事件 (${eventNames.length}个)`);

  try {
    // 收集所有需要应用的 insert 差分
    const 登场事件差分 = {
      insert: {},
    };

    const 已完成事件对象 = {};
    const 未发生删除对象 = {};

    for (const eventName of eventNames) {
      const eventData = eventDefinitions[eventName];
      if (!eventData) {
        logWarning(`事件定义未找到: ${eventName}`);
        continue;
      }

      // 登场事件只处理 insert 操作（添加人物变量）
      const delta = eventData.insert || {};
      for (const charName in delta) {
        if (!登场事件差分.insert[charName]) {
          登场事件差分.insert[charName] = {};
        }
        mergeCharacterDeltaForEvent(登场事件差分.insert[charName], delta[charName], eventName);
        log(`[登场事件 INSERT] 准备新增角色: ${charName}`);
      }

      // 标记为已完成（0表示玩家未参与）
      已完成事件对象[eventName] = 0;
      未发生删除对象[eventName] = {};
    }

    // 1. 应用 insert 差分（添加人物变量）
    if (Object.keys(登场事件差分.insert).length > 0) {
      debugGroup('🔄 应用登场事件人物差分');
      log(`[INSERT] 合并后的差分:`, JSON.parse(JSON.stringify(登场事件差分.insert)));
      const insertPayload = { 角色数据: 登场事件差分.insert };

      log(`🚀 [INSERT] 发送 era:insertByObject 指令`);
      log(`✅ [INSERT] 已加入登场事件事务`);
      debugGroupEnd();
    }

    // 2. 批量将事件移至"已完成"
    const completedPayload = {
      事件系统: {
        已完成事件: 已完成事件对象,
      },
    };
    // 3. 批量从"未发生"中删除
    const deletePayload = {
      事件系统: {
        未发生事件: 未发生删除对象,
      },
    };
    const debutOperations = [];
    if (Object.keys(登场事件差分.insert).length > 0) {
      debutOperations.push({ type: 'insert', payload: { 角色数据: 登场事件差分.insert } });
    }
    debutOperations.push({ type: 'insert', payload: completedPayload }, { type: 'delete', payload: deletePayload });
    log('🚀 在同一 ERA 事务中应用登场差分、完成状态与未发生清理');
    await writeEraTransaction(debutOperations, `batch-complete-debut-${eventNames.length}`);
    log('✅ 登场事件事务完成');

    // 验证操作后的状态
    const verifyVars = await getVariables({ type: 'chat' });
    if (isDebugEnabled()) {
      debugGroupCollapsed('🔍 登场事件完成后的事件系统状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data?.事件系统 || {})));
      debugGroupEnd();
    }

    logSuccess(`批量完成了 ${eventNames.length} 个登场事件:`, eventNames);

    // 显示通知
    if (eventNames.length <= 5) {
      eventNames.forEach(name => {
        notifyEvent({
          kind: 'debut-event-completed',
          level: 'success',
          message: `🎭 登场事件完成: ${name}`,
          eventNames: [name],
          durationMs: 2000,
        });
      });
    } else {
      notifyEvent({
        kind: 'debut-event-completed',
        level: 'success',
        message: `🎭 ${eventNames.length} 个登场事件已完成`,
        eventNames,
        durationMs: 3000,
      });
    }
  } catch (error) {
    logError(`批量完成登场事件失败`, error);
  }

  debugGroupEnd();
}

function buildPlayerParticipationDescription(eventName, eventData, actualEndTime) {
  const { startTime, endTime } = resolveActualEventWindow(eventData, actualEndTime);
  const timeRange = startTime && endTime ? `${formatDate(startTime)} 到 ${formatDate(endTime)}，` : '';
  return `${timeRange}${eventData.事件详情}`;
}

export function buildPlayerParticipationEntry(eventName, eventData, currentTime, actualEndTime) {
  const branchMarkers = normalizeBranchMarkers(eventData?.分支标记);
  return {
    描述: buildPlayerParticipationDescription(eventName, eventData, actualEndTime),
    结局: getEventSummary(eventData),
    insert: getInitialParticipationActionDiff(eventData, 'insert', eventName),
    update: getInitialParticipationActionDiff(eventData, 'update', eventName),
    delete: getInitialParticipationActionDiff(eventData, 'delete', eventName),
    ...(Object.keys(branchMarkers).length > 0 ? { 分支标记: cloneJson(branchMarkers) } : {}),
  };
}

export async function cleanupInvalidParticipationEntries(reason = 'manual') {
  const currentVars = await getVariables({ type: 'chat' });
  const deletePatch = buildInvalidParticipationDeletePatch(currentVars?.stat_data?.参与事件);
  if (Object.keys(deletePatch).length === 0) {
    return 0;
  }

  const committed = await writeEraTransaction(
    [{ type: 'delete', payload: { 参与事件: deletePatch } }],
    `delete-invalid-participation-${reason}`,
  );
  if (!committed) {
    logWarning('非法参与事件清理事务未能确认提交，保留原条目等待后续稳定检查:', Object.keys(deletePatch));
    return 0;
  }
  logWarning(`已清理 ${Object.keys(deletePatch).length} 个非法参与事件条目:`, Object.keys(deletePatch));
  return Object.keys(deletePatch).length;
}

export async function playerJoinsEvents(eventNames, eventDefinitions) {
  const uniqueEventNames = [...new Set(eventNames)].filter(eventName => eventDefinitions[eventName]);
  if (uniqueEventNames.length === 0) {
    return [];
  }

  debugGroup(`👤 玩家参与事件 (${uniqueEventNames.length}个)`);

  try {
    const currentVars = await getVariables({ type: 'chat' });
    const currentParticipation = currentVars?.stat_data?.参与事件;
    const currentTime = currentVars?.stat_data?.世界信息?.时间 || {};
    const inProgressEvents = currentVars?.stat_data?.事件系统?.进行中事件 || {};
    const eventsToJoin = uniqueEventNames.filter(eventName => !hasParticipationEntry(currentParticipation, eventName));

    if (eventsToJoin.length === 0) {
      debugGroupEnd();
      return [];
    }

    if (eventsToJoin.length === 1) {
      notifyEvent({
        kind: 'player-entered-event',
        level: 'warning',
        message: `⚠️ 你已到达事件地点: ${eventsToJoin[0]}！你的行为可能会改变事件的结局。`,
        eventNames: eventsToJoin,
      });
    } else {
      notifyEvent({
        kind: 'player-entered-event',
        level: 'warning',
        message: `⚠️ 你已到达 ${eventsToJoin.length} 个事件地点！你的行为可能会改变事件的结局。`,
        eventNames: eventsToJoin,
      });
    }

    const participantPlan = await applyParticipantEntries(
      eventsToJoin,
      eventDefinitions,
      PARTICIPANT_ENTRY_SOURCE.PLAYER,
      {
        currentVars,
        currentTime,
        deferWrite: true,
      },
    );

    const participationPatch = Object.fromEntries(
      eventsToJoin.map(eventName => {
        const eventData = eventDefinitions[eventName];
        return [
          eventName,
          buildPlayerParticipationEntry(eventName, eventData, currentTime, inProgressEvents[eventName]),
        ];
      }),
    );

    await writeEraTransaction(
      [...participantPlan.transactionOperations, { type: 'insert', payload: { 参与事件: participationPatch } }],
      `player-joins-events-${eventsToJoin.length}`,
    );
    await syncParticipationOutcomeStates(eventDefinitions);
    logSuccess(`玩家已参与 ${eventsToJoin.length} 个事件:`, eventsToJoin);

    debugGroupEnd();
    return eventsToJoin;
  } catch (error) {
    logError('玩家参与事件失败', error);
    debugGroupEnd();
    return [];
  }
}

// ==================== 玩家参与事件 (时间平移 + 规范运行时键) ====================
export async function playerJoinsEvent(eventName, eventData) {
  const joinedEvents = await playerJoinsEvents([eventName], { [eventName]: eventData });
  return joinedEvents.length > 0;
}

function buildSettlementBranchSnapshot(eventName, eventData, statData) {
  const participationEntry = getParticipationEntry(statData?.参与事件, eventName);
  if (participationEntry) {
    // Old participated saves did not carry branch markers. Their result must
    // remain unknown instead of guessing the current worldbook default.
    return normalizeBranchMarkers(participationEntry.分支标记);
  }
  return normalizeBranchMarkers(eventData?.分支标记);
}

async function prepareSettlementSnapshots(eventNames, eventDefinitions, statData) {
  const existingProgress = statData?.前端变量?.[EVENT_SETTLEMENT_PROGRESS_KEY] || {};
  const progressPatch = {};

  for (const eventName of eventNames) {
    if (isPlainObject(existingProgress[eventName]) && isPlainObject(existingProgress[eventName].分支标记)) {
      continue;
    }
    progressPatch[eventName] = {
      分支标记: buildSettlementBranchSnapshot(eventName, eventDefinitions[eventName], statData),
    };
  }

  if (Object.keys(progressPatch).length > 0) {
    const committed = await writeEraTransaction(
      [{ type: 'insert', payload: { 前端变量: { [EVENT_SETTLEMENT_PROGRESS_KEY]: progressPatch } } }],
      `prepare-event-settlement-${eventNames.length}`,
    );
    if (!committed) throw new Error('事件结算预备事务未能确认提交');
  }

  const preparedVariables = await getVariables({ type: 'chat' });
  const preparedStat = preparedVariables?.stat_data || {};
  const preparedProgress = preparedStat?.前端变量?.[EVENT_SETTLEMENT_PROGRESS_KEY] || {};
  if (!eventNames.every(eventName => isPlainObject(preparedProgress[eventName]?.分支标记))) {
    throw new Error('事件结算分支标记快照校验失败');
  }
  return preparedStat;
}

// ==================== 批量结束事件并应用差分 ====================
export async function batchEndEvents(eventNames, eventDefinitions) {
  if (eventNames.length === 0) return true;

  debugGroup(`⏹️ 批量结算事件 (${eventNames.length}个)`);

  try {
    await syncParticipationOutcomeStates(eventDefinitions);
    const currentVars = await getVariables({ type: 'chat' });
    const statData = await prepareSettlementSnapshots(eventNames, eventDefinitions, currentVars.stat_data);
    const 参与事件 = statData.参与事件 || {};

    const 合并后的差分 = {
      insert: {},
      update: {},
      delete: {},
    };
    const 已完成事件对象 = {};
    const 进行中删除对象 = {};
    const 参与删除对象 = {};
    const 占用删除对象 = {};
    const participationByEvent = {};
    const branchResults = {};

    for (const eventName of eventNames) {
      const eventData = eventDefinitions[eventName];
      if (!eventData) {
        logWarning(`事件定义未找到: ${eventName}`);
        continue;
      }

      const completedParticipationFlag = statData?.事件系统?.已完成事件?.[eventName] === 1;
      const playerParticipated = hasParticipationEntry(参与事件, eventName) || completedParticipationFlag;
      participationByEvent[eventName] = playerParticipated;
      log(`事件 ${eventName}: 玩家是否参与? ${playerParticipated}`);

      const participationEntry = hasParticipationEntry(参与事件, eventName)
        ? getParticipationEntry(参与事件, eventName)
        : null;
      const frozenMarkers = normalizeBranchMarkers(
        statData?.前端变量?.[EVENT_SETTLEMENT_PROGRESS_KEY]?.[eventName]?.分支标记,
      );
      if (Object.keys(frozenMarkers).length > 0) branchResults[eventName] = cloneJson(frozenMarkers);

      for (const actionKey of EVENT_DIFF_ACTIONS) {
        if (playerParticipated) {
          const participationDelta = getParticipationActionDiff(participationEntry, actionKey);
          if (Object.keys(participationDelta).length > 0) {
            mergeEventActionDelta(
              合并后的差分,
              actionKey,
              participationDelta,
              eventName,
              statData,
              `参与事件.${actionKey}`,
            );
          }
        } else {
          mergeEventActionDelta(合并后的差分, actionKey, eventData[actionKey] || {}, eventName, statData, actionKey);
        }
      }

      已完成事件对象[eventName] = playerParticipated ? 1 : 0;
      进行中删除对象[eventName] = {};
      if (playerParticipated) {
        Object.assign(参与删除对象, buildParticipationDeletePatch(参与事件, eventName));
      }
      Object.assign(占用删除对象, buildOccupancyCleanupPatch(statData?.事件系统?.人物事件占用 || {}, eventName));
    }

    const finalFollowups = buildFollowupPayloads(eventNames, eventDefinitions);
    const followupPayload = Object.fromEntries(
      Object.entries(finalFollowups.followupPayload).filter(
        ([key]) => !Object.prototype.hasOwnProperty.call(statData.后续事件线索 || {}, key),
      ),
    );
    const followupCountPayload = Object.fromEntries(
      Object.entries(finalFollowups.followupCountPayload).filter(
        ([key]) => !Object.prototype.hasOwnProperty.call(statData.后续事件线索计数 || {}, key),
      ),
    );
    const worldEventPatch = buildWorldEventArchivePatch(eventNames, eventDefinitions, statData);
    const malformedWorldEventDeletes = Object.fromEntries(
      eventNames
        .filter(
          eventName =>
            Object.prototype.hasOwnProperty.call(statData.世界事件 || {}, eventName) &&
            !isWorldEventRecord(statData.世界事件[eventName]),
        )
        .map(eventName => [eventName, {}]),
    );
    const settlementProgressDeletes = Object.fromEntries(eventNames.map(eventName => [eventName, {}]));

    const settlementOperations = [];
    for (const actionKey of EVENT_DIFF_ACTIONS) {
      if (Object.keys(合并后的差分[actionKey]).length > 0) {
        settlementOperations.push({
          type: actionKey,
          payload: { 角色数据: 合并后的差分[actionKey] },
        });
      }
    }
    if (Object.keys(malformedWorldEventDeletes).length > 0) {
      settlementOperations.push({
        type: 'delete',
        payload: { 世界事件: malformedWorldEventDeletes },
      });
    }
    if (Object.keys(worldEventPatch).length > 0) {
      settlementOperations.push({
        type: 'insert',
        payload: { 世界事件: worldEventPatch },
      });
    }
    if (Object.keys(branchResults).length > 0) {
      settlementOperations.push({
        type: 'insert',
        payload: { 事件分支结果: branchResults },
      });
    }
    settlementOperations.push(
      { type: 'insert', payload: { 事件系统: { 已完成事件: 已完成事件对象 } } },
      { type: 'delete', payload: { 事件系统: { 进行中事件: 进行中删除对象 } } },
    );
    if (Object.keys(参与删除对象).length > 0) {
      settlementOperations.push({ type: 'delete', payload: { 参与事件: 参与删除对象 } });
    }
    if (Object.keys(占用删除对象).length > 0) {
      settlementOperations.push({
        type: 'delete',
        payload: { 事件系统: { 人物事件占用: 占用删除对象 } },
      });
    }
    if (Object.keys(followupPayload).length > 0 || Object.keys(followupCountPayload).length > 0) {
      settlementOperations.push({
        type: 'insert',
        payload: {
          后续事件线索: followupPayload,
          后续事件线索计数: followupCountPayload,
        },
      });
    }
    settlementOperations.push({
      type: 'delete',
      payload: { 前端变量: { [EVENT_SETTLEMENT_PROGRESS_KEY]: settlementProgressDeletes } },
    });

    const committed = await writeEraTransaction(settlementOperations, `batch-end-events-${eventNames.length}`);
    if (!committed) {
      throw new Error('事件结算 ERA 事务未能确认提交');
    }

    const finalVerifyVars = await getVariables({ type: 'chat' });
    const finalVerifyStat = finalVerifyVars?.stat_data || {};
    const finalCompletionPersisted = eventNames.every(eventName => {
      const eventData = eventDefinitions[eventName];
      const archiveReady =
        !isOrdinaryWorldEvent(eventData) || isWorldEventRecord(finalVerifyStat.世界事件?.[eventName]);
      const occupancyCleared = Object.values(finalVerifyStat.事件系统?.人物事件占用 || {}).every(
        occupancyValue => occupancyValue?.事件名 !== eventName,
      );
      return (
        Object.prototype.hasOwnProperty.call(finalVerifyStat.事件系统?.已完成事件 || {}, eventName) &&
        !Object.prototype.hasOwnProperty.call(finalVerifyStat.事件系统?.进行中事件 || {}, eventName) &&
        !hasParticipationEntry(finalVerifyStat.参与事件, eventName) &&
        !Object.prototype.hasOwnProperty.call(
          finalVerifyStat.前端变量?.[EVENT_SETTLEMENT_PROGRESS_KEY] || {},
          eventName,
        ) &&
        archiveReady &&
        occupancyCleared &&
        (!branchResults[eventName] ||
          JSON.stringify(finalVerifyStat.事件分支结果?.[eventName]) === JSON.stringify(branchResults[eventName]))
      );
    });
    const finalFollowupsPersisted = Object.keys(followupPayload).every(
      key =>
        finalVerifyStat.后续事件线索?.[key] === followupPayload[key] &&
        finalVerifyStat.后续事件线索计数?.[key] === followupCountPayload[key],
    );
    if (!finalCompletionPersisted || !finalFollowupsPersisted) {
      throw new Error('事件完成终态单次提交后校验失败');
    }

    logSuccess(`批量结算完成 ${eventNames.length} 个事件（单次 ERA 事务）:`, eventNames);
    if (eventNames.length <= 5) {
      eventNames.forEach(name =>
        notifyEvent({
          kind: 'event-completed',
          level: 'success',
          message: `✅ 事件完成: ${name}`,
          eventNames: [name],
          durationMs: 2000,
        }),
      );
    } else {
      notifyEvent({
        kind: 'event-completed',
        level: 'success',
        message: `✅ ${eventNames.length} 个事件已完成`,
        eventNames,
        durationMs: 3000,
      });
    }
    return true;
  } catch (error) {
    logError(`批量结算事件失败`, error);
    return false;
  } finally {
    debugGroupEnd();
  }
}

// ==================== 后续事件线索 ====================
function buildFollowupPayloads(eventNames, eventDefinitions) {
  const followupPayload = {};
  const followupCountPayload = {};

  for (const eventName of eventNames) {
    const eventData = eventDefinitions[eventName];
    for (const [targetReference, description] of Object.entries(normalizeFollowupEvents(eventData?.后续事件))) {
      const targetEventKey = resolveEventReference(eventName, targetReference, eventDefinitions);
      const targetEventData = eventDefinitions[targetEventKey];
      if (!targetEventData || Object.prototype.hasOwnProperty.call(followupPayload, targetEventKey)) continue;

      const time = getSingleConditionTimeAnchor(targetEventData.触发条件);
      const location = targetEventData.事件地点;
      const contextParts = [time ? formatDate(time) : '', location, '似乎还会有事情发生'].filter(Boolean);
      followupPayload[targetEventKey] = `(${contextParts.join('，')})${description}`;
      followupCountPayload[targetEventKey] = CONFIG.DEFAULT_FOLLOWUP_LIFETIME;
      log(`为事件 ${eventName} 生成后续线索: ${targetEventKey}`);
    }
  }

  return { followupPayload, followupCountPayload };
}

export async function cleanupFollowupCluesForActiveParticipation(eventDefinitions, reason = 'manual') {
  debugGroup(`🧹 清理已参与后续事件线索: ${reason}`);

  const currentVars = await getVariables({ type: 'chat' });
  const participation = currentVars?.stat_data?.参与事件 || {};
  const followupClues = currentVars?.stat_data?.后续事件线索 || {};
  const followupCounters = currentVars?.stat_data?.后续事件线索计数 || {};
  const participationKeys = new Set(Object.keys(participation));
  const keysToDelete = new Set();
  const followupIndex = getFollowupReferenceIndex(eventDefinitions);

  if (
    participationKeys.size === 0 ||
    (Object.keys(followupClues).length === 0 && Object.keys(followupCounters).length === 0)
  ) {
    debugGroupEnd();
    return 0;
  }

  for (const participationKey of participationKeys) {
    const clueSets = [followupIndex.clueKeysByTargetKey.get(participationKey)];

    for (const clueSet of clueSets) {
      if (!clueSet) continue;

      for (const clueKey of clueSet) {
        if (clueKey in followupClues || clueKey in followupCounters) {
          keysToDelete.add(clueKey);
        }
      }
    }
  }

  if (keysToDelete.size === 0) {
    debugGroupEnd();
    return 0;
  }

  const deletePayload = {
    后续事件线索: Object.fromEntries([...keysToDelete].map(key => [key, {}])),
    后续事件线索计数: Object.fromEntries([...keysToDelete].map(key => [key, {}])),
  };

  log('🚀 发送 era:deleteByObject 指令 (清理已参与后续事件线索):', deletePayload);
  await writeEraTransaction([{ type: 'delete', payload: deletePayload }], `delete-active-followups-${reason}`);
  logSuccess(`✅ 已清理 ${keysToDelete.size} 个已参与后续事件线索`);

  debugGroupEnd();
  return keysToDelete.size;
}
