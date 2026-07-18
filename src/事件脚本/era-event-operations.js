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
  compareTime,
  formatDate,
  debugGroup,
  debugGroupCollapsed,
  debugGroupEnd,
  isDebugEnabled,
} from './era-utils.js';

import { isTimeForEvent, isTimeAfterEventEnd } from './era-event-checker.js';
import {
  writeDirectInsert,
  writeDirectDelete,
  writeEraCommand,
  writeEraInsert,
  writeEraUpdate,
} from './era-write-helper.js';
import {
  PARTICIPANT_ENTRY_SOURCE,
  buildOccupancyCleanupPatch,
  buildParticipantEntryPlan,
} from './era-participant-entry.js';
import {
  ensureWorldEventsArchived,
  getEventSummary,
  buildWorldEventRecord,
  isOrdinaryWorldEvent,
  syncParticipationOutcomeStates,
} from './era-world-events.js';
import { writeDirectChatTransaction } from '../shared/directVariableWrite';
import { isWorldEventRecord } from '../shared/worldEventContext';

const CHAPTER_SEQUENCE_PATTERN = /^(.*?第[0-9一二三四五六七八九十百千万]+回[0-9]+)-/;
const EVENT_SYSTEM_BUCKETS = ['未发生事件', '进行中事件', '已完成事件'];
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

function countExpectedEventKeys(eventSystemPatch) {
  return EVENT_SYSTEM_BUCKETS.reduce((total, bucket) => {
    const bucketPatch = eventSystemPatch?.[bucket];
    return total + (isPlainObject(bucketPatch) ? Object.keys(bucketPatch).length : 0);
  }, 0);
}

function countPersistedEventKeys(currentEventSystem, eventSystemPatch) {
  return EVENT_SYSTEM_BUCKETS.reduce((total, bucket) => {
    const currentBucket = currentEventSystem?.[bucket];
    const bucketPatch = eventSystemPatch?.[bucket];
    if (!isPlainObject(currentBucket) || !isPlainObject(bucketPatch)) {
      return total;
    }

    return total + Object.keys(bucketPatch).filter(key => key in currentBucket).length;
  }, 0);
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
        if (isPlainObject(node[key]) && isPlainObject(value) && Object.keys(value).length > 0) apply(node[key], value, operation);
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

async function ensureEventSystemPatchPersisted(eventSystemPatch, reason) {
  const expectedEventCount = countExpectedEventKeys(eventSystemPatch);
  if (expectedEventCount <= 0) {
    return {
      variables: await getVariables({ type: 'chat' }),
      expectedEventCount,
      persistedEventCount: 0,
      usedFallback: false,
    };
  }

  let variables = await getVariables({ type: 'chat' });
  let persistedEventCount = countPersistedEventKeys(variables?.stat_data?.事件系统, eventSystemPatch);

  if (persistedEventCount >= expectedEventCount) {
    return {
      variables,
      expectedEventCount,
      persistedEventCount,
      usedFallback: false,
    };
  }

  logWarning(`事件初始化 ${reason} 后未完全落库: ${persistedEventCount}/${expectedEventCount}，切换 ERA 持久写入兜底`);
  await writeEraInsert({ 事件系统: eventSystemPatch }, `initialize-event-system-${reason}-fallback`);
  variables = await getVariables({ type: 'chat' });
  persistedEventCount = countPersistedEventKeys(variables?.stat_data?.事件系统, eventSystemPatch);
  toastr.warning('事件初始化已切换为 ERA 持久写入兜底');
  return {
    variables,
    expectedEventCount,
    persistedEventCount,
    usedFallback: true,
  };
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

  const sourceToTarget = new Map();
  const clueKeysByTargetKey = new Map();

  for (const [sourceEventName, eventData] of Object.entries(eventDefinitions)) {
    const followupInfo = eventData?.后续事件;
    if (!followupInfo) continue;

    const targetEventKey = resolveEventReference(sourceEventName, followupInfo.事件名, eventDefinitions);
    const targetEventData = eventDefinitions[targetEventKey];
    if (!targetEventData) continue;

    const clueKey = sourceEventName;
    sourceToTarget.set(sourceEventName, targetEventKey);
    addValueToSetMap(clueKeysByTargetKey, targetEventKey, clueKey);
  }

  const index = {
    sourceToTarget,
    clueKeysByTargetKey,
    predecessorsByTargetKey: [...sourceToTarget.entries()].reduce((entries, [sourceEventName, targetEventName]) => {
        const existing = entries.get(targetEventName) || new Set();
        existing.add(sourceEventName);
        entries.set(targetEventName, existing);
        return entries;
      }, new Map()),
  };
  followupReferenceIndexCache.set(eventDefinitions, index);
  return index;
}

export function getValidEventPredecessors(eventName, eventDefinitions) {
  return [...(getFollowupReferenceIndex(eventDefinitions).predecessorsByTargetKey.get(eventName) || [])];
}

export function areEventPredecessorsCompleted(eventName, eventDefinitions, completedEvents) {
  return getValidEventPredecessors(eventName, eventDefinitions).every(predecessorName =>
    Object.prototype.hasOwnProperty.call(completedEvents || {}, predecessorName),
  );
}

export function buildActualEventWindow(eventData, currentTime, earlyStart = false) {
  const plannedStart = eventData?.触发条件 || null;
  const plannedEnd = getEndTime(eventData || {});
  if (!earlyStart || !currentTime || !plannedEnd) {
    return { startTime: plannedStart, endTime: plannedEnd };
  }

  const durationHours = getEventDurationHours(eventData);
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
    return { startTime: eventData?.触发条件 || null, endTime };
  }

  const endMatchesPlan = JSON.stringify(endTime) === JSON.stringify(plannedEnd);
  return {
    startTime: endMatchesPlan
      ? eventData?.触发条件 || null
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

    if (!mergedDiff[actionKey][charName]) {
      mergedDiff[actionKey][charName] = {};
    }
    mergeCharacterDeltaForEvent(mergedDiff[actionKey][charName], delta[charName], eventName);
    log(`[${actionKey.toUpperCase()}] 准备${actionKey === 'delete' ? '删除' : '修改'}角色: ${charName} (${sourceLabel})`);
  }
}

// ==================== 开局事件状态单事务初始化 ====================
export async function initializeEventList(eventDefinitions, options = {}) {
  const eventNames = Object.keys(eventDefinitions || {});
  if (eventNames.length === 0) {
    return { initialized: true, added: 0, committed: false };
  }

  let result = { initialized: false, added: 0, committed: false, eventNames: [] };

  await writeDirectChatTransaction(
    variables => {
      if (!variables?.stat_data?.世界信息?.时间) {
        throw new Error('无法初始化事件：stat_data.世界信息.时间尚未落库');
      }

      const statData = variables.stat_data;
      const currentTime = statData.世界信息.时间;
      statData.事件系统 = isPlainObject(statData.事件系统) ? statData.事件系统 : {};
      statData.事件系统.未发生事件 = isPlainObject(statData.事件系统.未发生事件)
        ? statData.事件系统.未发生事件
        : {};
      statData.事件系统.进行中事件 = isPlainObject(statData.事件系统.进行中事件)
        ? statData.事件系统.进行中事件
        : {};
      statData.事件系统.已完成事件 = isPlainObject(statData.事件系统.已完成事件)
        ? statData.事件系统.已完成事件
        : {};
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
      ]);

      const checkpoint = options.applyCheckpoint === true ? options.checkpoint : null;
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
            applyOpeningObjectPatch(
              statData.角色数据 || (statData.角色数据 = {}),
              action,
              operation?.[action],
            );
          }
        }
      }

      const newEvents = eventNames.filter(
        eventName =>
          !knownEventKeys.has(eventName),
      );

      if (sparseFuture) {
        statData.事件系统.未发生事件 = {};
      }

      for (const eventName of newEvents) {
        const eventData = eventDefinitions[eventName];
        const endTime = getEndTime(eventData);
        const expired = endTime && isTimeAfterEventEnd(currentTime, endTime);
        const due = isTimeForEvent(currentTime, eventData, eventName);

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
            !Object.prototype.hasOwnProperty.call(statData.事件系统.已完成事件, eventName),
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
      Object.prototype.hasOwnProperty.call(verifiedSystem.已完成事件 || {}, eventName),
  );
  if (!persisted) {
    throw new Error('开局事件状态单事务提交后校验失败');
  }

  logSuccess(`开局事件初始化完成：处理 ${result.added} 个新事件，direct commit=${result.committed ? 1 : 0}`);
  return result;
}

// 开局初始化已统一走上方的单事务规划器；旧的多写入实现已移除。
// ==================== 处理登场事件完成的辅助函数 ====================
async function processDebutEventsCompletion(eventNames, eventDefinitions) {
  debugGroup(`🎭 批量完成 ${eventNames.length} 个登场事件`);

  const 登场事件差分 = {
    insert: {},
  };

  const 登场事件完成对象 = {};

  for (const eventName of eventNames) {
    const eventData = eventDefinitions[eventName];

    // 登场事件只处理 insert 操作（添加人物变量）
    const delta = eventData.insert || {};
    for (const charName in delta) {
      if (!登场事件差分.insert[charName]) {
        登场事件差分.insert[charName] = {};
      }
      mergeCharacterDeltaForEvent(登场事件差分.insert[charName], delta[charName], eventName);
      log(`[登场事件 INSERT] 准备新增角色: ${charName}`);
    }

    // 标记为已完成（0表示玩家未参与，登场事件默认玩家未参与）
    登场事件完成对象[eventName] = 0;
  }

  // 应用 insert 差分
  if (Object.keys(登场事件差分.insert).length > 0) {
    log(`[登场事件 INSERT] 合并后的差分:`, JSON.parse(JSON.stringify(登场事件差分.insert)));
    const insertPayload = { 角色数据: 登场事件差分.insert };

    log(`🚀 [登场事件 INSERT] 发送 era:insertByObject 指令`);
    await writeEraInsert(insertPayload, 'debut-character-insert');
    log(`✅ [登场事件 INSERT] 完成`);
  }

  // 添加到已完成事件
  const debutCompletedPayload = {
    事件系统: { 已完成事件: 登场事件完成对象 },
  };

  log('🚀 发送 era:insertByObject 指令（登场事件移至已完成）');
  await writeDirectInsert(debutCompletedPayload, 'debut-events-completed');
  logSuccess(`✅ 已完成 ${eventNames.length} 个登场事件`);

  debugGroupEnd();
}

// ==================== 处理过期事件完成的辅助函数 ====================
async function processExpiredEventsCompletion(eventNames, eventDefinitions) {
  debugGroup(`⚡ 批量完成 ${eventNames.length} 个已过期事件`);

  const 合并后的差分 = {
    insert: {},
    update: {},
    delete: {},
  };

  const 已完成事件对象 = {};

  const latestVars = await getVariables({ type: 'chat' });
  const statData = latestVars.stat_data;

  for (const eventName of eventNames) {
    const eventData = eventDefinitions[eventName];

    for (const actionKey of ['insert', 'update', 'delete']) {
      const delta = eventData[actionKey] || {};
      for (const charName in delta) {
        // update 和 delete 需要角色已存在，insert 无需检查
        if (actionKey !== 'insert' && (!statData.角色数据 || !statData.角色数据[charName])) {
          logWarning(`角色 ${charName} 不存在，跳过 ${actionKey}`);
          continue;
        }

        if (!合并后的差分[actionKey][charName]) {
          合并后的差分[actionKey][charName] = {};
        }
        mergeCharacterDeltaForEvent(合并后的差分[actionKey][charName], delta[charName], eventName);
        log(`[${actionKey.toUpperCase()}] 准备${actionKey === 'delete' ? '删除' : '修改'}角色: ${charName}`);
      }
    }

    // 标记为已完成（0表示玩家未参与）
    已完成事件对象[eventName] = 0;
  }

  // 应用差分
  await applyEventDiff(合并后的差分);

  const archived = await ensureWorldEventsArchived(eventNames, eventDefinitions, latestVars);
  if (!archived) {
    throw new Error('已过期事件的世界事件归档未能持久化');
  }

  // 添加到已完成事件
  const completedPayload = {
    事件系统: { 已完成事件: 已完成事件对象 },
  };

  log('🚀 发送 era:insertByObject 指令（移至已完成）');
  await writeDirectInsert(completedPayload, 'expired-events-completed');
  logSuccess(`✅ 已完成 ${eventNames.length} 个过期事件`);

  debugGroupEnd();
}

// ==================== 应用事件差分的辅助函数 ====================
async function applyEventDiff(差分对象) {
  const diffActions = {
    insert: { command: 'era:insertByObject', logName: 'INSERT' },
    update: { command: 'era:updateByObject', logName: 'UPDATE' },
    delete: { command: 'era:deleteByObject', logName: 'DELETE' },
  };

  for (const actionKey in diffActions) {
    const delta = 差分对象[actionKey];
    const { command, logName } = diffActions[actionKey];

    if (Object.keys(delta).length > 0) {
      log(`[${logName}] 合并后的差分:`, JSON.parse(JSON.stringify(delta)));
      const payload = { 角色数据: delta };

      log(`🚀 [${logName}] 发送 ${command} 指令`);
      await writeEraCommand(command, payload, `event-diff-${actionKey}`);
      log(`✅ [${logName}] 完成`);
    }
  }
}

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

  if (Object.keys(mergedLocationUpdates).length > 0) {
    await writeEraUpdate(
      { 角色数据: mergedLocationUpdates },
      `participant-entry-location-${source}-${uniqueEventNames.length}events`,
    );
  }

  if (Object.keys(mergedOccupancyDeletes).length > 0) {
    await writeDirectDelete(
      { 事件系统: { 人物事件占用: mergedOccupancyDeletes } },
      `participant-entry-release-conflicts-${source}-${uniqueEventNames.length}events`,
    );
  }

  if (Object.keys(mergedOccupancyInserts).length > 0) {
    await writeDirectInsert(
      { 事件系统: { 人物事件占用: mergedOccupancyInserts } },
      `participant-entry-occupy-${source}-${uniqueEventNames.length}events`,
    );
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
  };
}

export async function applyTimedParticipantEntries(eventNames, eventDefinitions, currentTime, currentVars) {
  const eligibleEventNames = [];

  for (const eventName of eventNames) {
    const eventData = eventDefinitions[eventName];
    const triggerTime = eventData?.触发条件;
    const endTime = getEndTime(eventData);

    if (
      !eventData ||
      isDebutEvent(eventData) ||
      !triggerTime ||
      triggerTime.类型 !== '时间' ||
      !compareTime(currentTime, triggerTime, '>=') ||
      (endTime && isTimeAfterEventEnd(currentTime, endTime))
    ) {
      continue;
    }

    eligibleEventNames.push(eventName);
  }

  return applyParticipantEntries(eligibleEventNames, eventDefinitions, PARTICIPANT_ENTRY_SOURCE.TIME, {
    currentTime,
    currentVars,
  });
}

async function cleanupParticipantOccupancy(eventNames) {
  const currentVars = await getVariables({ type: 'chat' });
  const occupancy = currentVars?.stat_data?.事件系统?.人物事件占用 || {};
  const cleanupPatch = {};

  for (const eventName of eventNames) {
    Object.assign(cleanupPatch, buildOccupancyCleanupPatch(occupancy, eventName));
  }

  if (Object.keys(cleanupPatch).length > 0) {
    await writeDirectDelete(
      { 事件系统: { 人物事件占用: cleanupPatch } },
      `participant-entry-cleanup-${eventNames.join('|')}`,
    );
  }
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

    log('🚀 1. 发送 era:insertByObject 指令 (批量添加到进行中):', insertPayload);
    await writeDirectInsert(insertPayload, 'batch-start-in-progress');
    log('✅ 步骤1完成: 批量添加到进行中事件');

    // 2. 批量从"未发生"中删除
    const 未发生删除对象 = Object.fromEntries(eventNames.map(name => [name, {}]));

    const deletePayload = {
      事件系统: {
        未发生事件: 未发生删除对象,
      },
    };

    log('🚀 2. 发送 era:deleteByObject 指令 (批量从未发生中删除):', deletePayload);
    await writeDirectDelete(deletePayload, 'batch-start-delete-unstarted');
    log('✅ 步骤2完成: 批量从未发生事件中删除');

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
        toastr.info(`📜 事件开始: ${name}`, '', { timeOut: 2000 });
      });
    } else {
      toastr.info(`📜 ${eventNames.length} 个事件已开始`, '', { timeOut: 3000 });
    }
  } catch (error) {
    logError(`批量开始事件失败`, error);
  }

  debugGroupEnd();
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
      await writeEraInsert(insertPayload, 'batch-debut-character-insert');
      log(`✅ [INSERT] 完成`);
      debugGroupEnd();
    }

    // 2. 批量将事件移至"已完成"
    const completedPayload = {
      事件系统: {
        已完成事件: 已完成事件对象,
      },
    };
    log('🚀 发送 era:insertByObject 指令 (登场事件移至已完成):', completedPayload);
    await writeDirectInsert(completedPayload, 'batch-debut-completed');
    log('✅ 登场事件已移至已完成');

    // 3. 批量从"未发生"中删除
    const deletePayload = {
      事件系统: {
        未发生事件: 未发生删除对象,
      },
    };
    log('🚀 发送 era:deleteByObject 指令 (从未发生中删除):', deletePayload);
    await writeDirectDelete(deletePayload, 'batch-debut-delete-unstarted');
    log('✅ 已从未发生事件中删除');

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
        toastr.success(`🎭 登场事件完成: ${name}`, '', { timeOut: 2000 });
      });
    } else {
      toastr.success(`🎭 ${eventNames.length} 个登场事件已完成`, '', { timeOut: 3000 });
    }
  } catch (error) {
    logError(`批量完成登场事件失败`, error);
  }

  debugGroupEnd();
}

function buildPlayerParticipationDescription(eventName, eventData, actualEndTime) {
  const { startTime, endTime } = resolveActualEventWindow(eventData, actualEndTime);
  return `${formatDate(startTime)} 到 ${formatDate(endTime)}，${eventData.事件详情}`;
}

export function buildPlayerParticipationEntry(eventName, eventData, currentTime, actualEndTime) {
  return {
    描述: buildPlayerParticipationDescription(eventName, eventData, actualEndTime),
    结局: getEventSummary(eventData),
    insert: getInitialParticipationActionDiff(eventData, 'insert', eventName),
    update: getInitialParticipationActionDiff(eventData, 'update', eventName),
    delete: getInitialParticipationActionDiff(eventData, 'delete', eventName),
  };
}

export async function cleanupInvalidParticipationEntries(reason = 'manual') {
  const currentVars = await getVariables({ type: 'chat' });
  const deletePatch = buildInvalidParticipationDeletePatch(currentVars?.stat_data?.参与事件);
  if (Object.keys(deletePatch).length === 0) {
    return 0;
  }

  await writeDirectDelete({ 参与事件: deletePatch }, `delete-invalid-participation-${reason}`);
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
      toastr.warning(`⚠️ 你已到达事件地点: ${eventsToJoin[0]}！你的行为可能会改变事件的结局。`);
    } else {
      toastr.warning(`⚠️ 你已到达 ${eventsToJoin.length} 个事件地点！你的行为可能会改变事件的结局。`);
    }

    await applyParticipantEntries(eventsToJoin, eventDefinitions, PARTICIPANT_ENTRY_SOURCE.PLAYER, {
      currentVars,
      currentTime,
    });

    const participationPatch = Object.fromEntries(
      eventsToJoin.map(eventName => {
        const eventData = eventDefinitions[eventName];
        return [
          eventName,
          buildPlayerParticipationEntry(eventName, eventData, currentTime, inProgressEvents[eventName]),
        ];
      }),
    );

    await writeEraInsert({ 参与事件: participationPatch }, `player-joins-events-${eventsToJoin.length}`);
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

// ==================== 批量结束事件并应用差分 ====================
export async function batchEndEvents(eventNames, eventDefinitions) {
  if (eventNames.length === 0) return true;

  debugGroup(`⏹️ 批量结算事件 (${eventNames.length}个)`);

  try {
    await syncParticipationOutcomeStates(eventDefinitions);
    const currentVars = await getVariables({ type: 'chat' });
    const statData = currentVars.stat_data;
    const 参与事件 = statData.参与事件 || {};
    const settlementProgress = statData?.前端变量?.[EVENT_SETTLEMENT_PROGRESS_KEY] || {};

    // 收集所有需要应用的差分
    const 合并后的差分 = {
      insert: {},
      update: {},
      delete: {},
    };

    const 已完成事件对象 = {};
    const 进行中删除对象 = {};
    const 参与删除对象 = {};

    const eventsNeedingDiff = [];
    const participationByEvent = {};

    // 遍历所有要结束的事件，合并差分。已经持久记录完成差分的事件在重试时不会再次结算。
    for (const eventName of eventNames) {
      const eventData = eventDefinitions[eventName];
      if (!eventData) {
        logWarning(`事件定义未找到: ${eventName}`);
        continue;
      }

      // 步骤 1: 明确判断玩家是否参与
      const progressEntry = settlementProgress[eventName];
      const completedParticipationFlag = statData?.事件系统?.已完成事件?.[eventName] === 1;
      const playerParticipated =
        hasParticipationEntry(参与事件, eventName) ||
        (isPlainObject(progressEntry) && progressEntry.玩家参与 === true) ||
        completedParticipationFlag;
      participationByEvent[eventName] = playerParticipated;
      log(`事件 ${eventName}: 玩家是否参与? ${playerParticipated}`);

      const participationEntry = hasParticipationEntry(参与事件, eventName)
        ? getParticipationEntry(参与事件, eventName)
        : null;

      const diffWasApplied =
        progressEntry === '差分已应用' || (isPlainObject(progressEntry) && progressEntry.差分已应用 === true);
      if (!diffWasApplied) {
        eventsNeedingDiff.push(eventName);
        // 步骤 2: 未参与事件使用事件定义差分；玩家参与事件使用参与事件内的结局快照。
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
      }

      // 准备状态变更数据
      已完成事件对象[eventName] = playerParticipated ? 1 : 0;
      进行中删除对象[eventName] = {};

      if (playerParticipated) {
        Object.assign(参与删除对象, buildParticipationDeletePatch(参与事件, eventName));
      }
    }

    // 1. 批量应用角色数据差分
    debugGroup('🔄 批量应用人物差分');
    await applyEventDiff(合并后的差分);
    debugGroupEnd();

    if (eventsNeedingDiff.length > 0) {
      const progressPatch = Object.fromEntries(
        eventsNeedingDiff.map(eventName => [
          eventName,
          { 差分已应用: true, 玩家参与: participationByEvent[eventName] === true },
        ]),
      );
      await writeDirectInsert(
        { 前端变量: { [EVENT_SETTLEMENT_PROGRESS_KEY]: progressPatch } },
        'batch-end-mark-diff-applied',
      );
      const progressVars = await getVariables({ type: 'chat' });
      const persistedProgress = progressVars?.stat_data?.前端变量?.[EVENT_SETTLEMENT_PROGRESS_KEY] || {};
      if (
        eventsNeedingDiff.some(
          eventName => !isPlainObject(persistedProgress[eventName]) || persistedProgress[eventName].差分已应用 !== true,
        )
      ) {
        throw new Error('事件差分结算进度未能持久化，保留进行中事件等待重试');
      }
    }

    // 差分进度已经独立落库；其余事件终态在一次 direct transaction 内提交。
    // 如果该事务失败，事件结算进度仍会保留，下一轮会跳过已应用的人物差分后重试。
    const finalFollowups = buildFollowupPayloads(eventNames, eventDefinitions);
    await writeDirectChatTransaction(
      variables => {
        const nextStat = variables?.stat_data;
        if (!nextStat) throw new Error('事件终态提交时 stat_data 不存在');

        nextStat.事件系统 = isPlainObject(nextStat.事件系统) ? nextStat.事件系统 : {};
        nextStat.事件系统.进行中事件 = isPlainObject(nextStat.事件系统.进行中事件)
          ? nextStat.事件系统.进行中事件
          : {};
        nextStat.事件系统.已完成事件 = isPlainObject(nextStat.事件系统.已完成事件)
          ? nextStat.事件系统.已完成事件
          : {};
        nextStat.事件系统.人物事件占用 = isPlainObject(nextStat.事件系统.人物事件占用)
          ? nextStat.事件系统.人物事件占用
          : {};
        nextStat.参与事件 = isPlainObject(nextStat.参与事件) ? nextStat.参与事件 : {};
        nextStat.世界事件 = isPlainObject(nextStat.世界事件) ? nextStat.世界事件 : {};
        nextStat.后续事件线索 = isPlainObject(nextStat.后续事件线索) ? nextStat.后续事件线索 : {};
        nextStat.后续事件线索计数 = isPlainObject(nextStat.后续事件线索计数)
          ? nextStat.后续事件线索计数
          : {};
        nextStat.前端变量 = isPlainObject(nextStat.前端变量) ? nextStat.前端变量 : {};
        nextStat.前端变量[EVENT_SETTLEMENT_PROGRESS_KEY] = isPlainObject(
          nextStat.前端变量[EVENT_SETTLEMENT_PROGRESS_KEY],
        )
          ? nextStat.前端变量[EVENT_SETTLEMENT_PROGRESS_KEY]
          : {};

        for (const eventName of eventNames) {
          const eventData = eventDefinitions[eventName];
          const foundParticipation = getParticipationEntry(nextStat.参与事件, eventName);
          if (isOrdinaryWorldEvent(eventData) && !isWorldEventRecord(nextStat.世界事件[eventName])) {
            nextStat.世界事件[eventName] = buildWorldEventRecord(
              eventData,
              foundParticipation?.结局,
              nextStat.事件系统.进行中事件[eventName],
            );
          }

          nextStat.事件系统.已完成事件[eventName] = participationByEvent[eventName] ? 1 : 0;
          delete nextStat.事件系统.进行中事件[eventName];
          for (const participationKey of Object.keys(buildParticipationDeletePatch(nextStat.参与事件, eventName))) {
            delete nextStat.参与事件[participationKey];
          }

          for (const [characterName, occupancyValue] of Object.entries(nextStat.事件系统.人物事件占用)) {
            if (occupancyValue?.事件名 === eventName) delete nextStat.事件系统.人物事件占用[characterName];
          }
          delete nextStat.前端变量[EVENT_SETTLEMENT_PROGRESS_KEY][eventName];
        }

        for (const [key, clue] of Object.entries(finalFollowups.followupPayload)) {
          if (!(key in nextStat.后续事件线索)) nextStat.后续事件线索[key] = clue;
          if (!(key in nextStat.后续事件线索计数)) {
            nextStat.后续事件线索计数[key] = finalFollowups.followupCountPayload[key];
          }
        }
        return variables;
      },
      `batch-end-finalize-${eventNames.length}`,
      { operation: 'replace', refreshHint: 'event-state' },
    );

    const finalVerifyVars = await getVariables({ type: 'chat' });
    const finalVerifyStat = finalVerifyVars?.stat_data || {};
    const finalCompletionPersisted = eventNames.every(eventName => {
      const eventData = eventDefinitions[eventName];
      const archiveReady = !isOrdinaryWorldEvent(eventData) || isWorldEventRecord(finalVerifyStat.世界事件?.[eventName]);
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
        occupancyCleared
      );
    });
    const finalFollowupsPersisted = Object.keys(finalFollowups.followupPayload).every(
      key =>
        finalVerifyStat.后续事件线索?.[key] === finalFollowups.followupPayload[key] &&
        finalVerifyStat.后续事件线索计数?.[key] === finalFollowups.followupCountPayload[key],
    );
    if (!finalCompletionPersisted || !finalFollowupsPersisted) {
      throw new Error('事件完成终态单次提交后校验失败');
    }

    logSuccess(`批量结算完成 ${eventNames.length} 个事件（进度提交 + 终态提交）:`, eventNames);
    if (eventNames.length <= 5) {
      eventNames.forEach(name => toastr.success(`✅ 事件完成: ${name}`, '', { timeOut: 2000 }));
    } else {
      toastr.success(`✅ ${eventNames.length} 个事件已完成`, '', { timeOut: 3000 });
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
  const followupIndex = getFollowupReferenceIndex(eventDefinitions);

  for (const eventName of eventNames) {
    if (eventDefinitions[eventName] && eventDefinitions[eventName].后续事件) {
      const key = eventName;
      const followupInfo = eventDefinitions[eventName].后续事件;
      const targetEventKey = followupIndex.sourceToTarget.get(eventName);
      const description = followupInfo.描述 || '';
      const targetEventData = eventDefinitions[targetEventKey];

      if (targetEventData) {
        const time = targetEventData.触发条件;
        const location = targetEventData.事件地点;
        const timeString = formatDate(time);

        const formattedDescription = `(${timeString}，${location}，似乎还会有事情发生)${description}`;

        followupPayload[key] = formattedDescription;
        followupCountPayload[key] = CONFIG.DEFAULT_FOLLOWUP_LIFETIME;
      }

      log(`为事件 ${eventName} 生成后续: ${key}`);
    }
  }

  return { followupPayload, followupCountPayload };
}

async function writeFollowupEvents(eventNames, eventDefinitions, { reason }) {
  debugGroup(`🔗 生成事件后续: ${reason}`);

  const { followupPayload, followupCountPayload } = buildFollowupPayloads(eventNames, eventDefinitions);
  if (Object.keys(followupPayload).length === 0) {
    log('没有需要生成的后续事件');
    debugGroupEnd();
    return;
  }

  const currentVars = await getVariables({ type: 'chat' });
  const existingClues = currentVars?.stat_data?.后续事件线索 || {};
  const existingCounters = currentVars?.stat_data?.后续事件线索计数 || {};

  const cluePatch = Object.fromEntries(Object.entries(followupPayload).filter(([key]) => !(key in existingClues)));
  const counterPatch = Object.fromEntries(
    Object.entries(followupCountPayload).filter(([key]) => !(key in existingCounters)),
  );
  if (Object.keys(cluePatch).length > 0 || Object.keys(counterPatch).length > 0) {
    const followupPairPayload = {
      后续事件线索: cluePatch,
      后续事件线索计数: counterPatch,
    };

    log('🚀 同一次直接写入后续事件线索与计数:', followupPairPayload);
    await writeDirectInsert(followupPairPayload, `insert-followup-pairs-${reason}`);
    logSuccess(`✅ 已成对写入 ${new Set([...Object.keys(cluePatch), ...Object.keys(counterPatch)]).size} 个后续事件`);
  } else {
    log('后续事件线索及计数无变化，跳过写入');
  }

  debugGroupEnd();
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
  await writeDirectDelete(deletePayload, `delete-active-followups-${reason}`);
  logSuccess(`✅ 已清理 ${keysToDelete.size} 个已参与后续事件线索`);

  debugGroupEnd();
  return keysToDelete.size;
}
