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
  isOrdinaryWorldEvent,
  syncParticipationOutcomeStates,
} from './era-world-events.js';

const CHAPTER_SEQUENCE_PATTERN = /^(.*?第[0-9一二三四五六七八九十百千万]+回[0-9]+)-/;
const EVENT_SYSTEM_BUCKETS = ['未发生事件', '进行中事件', '已完成事件'];
const EVENT_DIFF_ACTIONS = ['insert', 'update', 'delete'];
const EVENT_SETTLEMENT_PROGRESS_KEY = '事件结算进度';
const POST_RESYNC_VERIFY_DELAY_MS = 1200;
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// ==================== 批量初始化未发生事件列表（智能优化版）====================
export async function initializeEventList(eventDefinitions, options = {}) {
  debugGroup('🔧 智能批量初始化事件列表');

  const eventNames = Object.keys(eventDefinitions);
  if (eventNames.length === 0) {
    logWarning('没有可初始化的事件');
    debugGroupEnd();
    return;
  }

  try {
    const variables = await getVariables({ type: 'chat' });

    // ✅ 修复：添加完整的安全检查
    if (!variables || !variables.stat_data) {
      logError('无法读取变量或 stat_data 未初始化');
      logError('请确保已执行初始化脚本设置 stat_data');
      debugGroupEnd();
      return;
    }

    // ✅ 修复：检查必要的数据结构
    if (!variables.stat_data.世界信息 || !variables.stat_data.世界信息.时间) {
      logError('世界信息或时间数据未初始化');
      debugGroupEnd();
      return;
    }

    if (!isPlainObject(variables.stat_data.事件系统?.人物事件占用)) {
      await writeDirectInsert({ 事件系统: { 人物事件占用: {} } }, 'initialize-participant-occupancy');
    }

    const currentTime = variables.stat_data.世界信息.时间;
    const 未发生事件 = variables?.stat_data?.事件系统?.未发生事件 || {};
    const 进行中事件 = variables?.stat_data?.事件系统?.进行中事件 || {};
    const 已完成事件 = variables?.stat_data?.事件系统?.已完成事件 || {};

    const timeString = formatDate(currentTime);
    log('当前时间:', timeString);
    log('当前未发生事件:', Object.keys(未发生事件));
    log('当前进行中事件:', Object.keys(进行中事件));
    log('当前已完成事件:', Object.keys(已完成事件));

    // 过滤出真正需要添加的新事件（不在任何事件列表中的）
    const newEvents = eventNames.filter(
      name => !(name in 未发生事件) && !(name in 进行中事件) && !(name in 已完成事件),
    );

    if (newEvents.length === 0) {
      logSuccess('所有事件都已在系统中，无需添加');
      debugGroupEnd();
      return;
    }

    logSuccess(`找到 ${newEvents.length} 个新事件需要添加:`, newEvents);

    // ==================== 智能分类新事件 ====================
    debugGroup('🧠 智能分类事件状态');

    const 未开始事件 = []; // 触发时间未到
    const 应立即触发事件 = []; // 触发时间已到但未超过结束时间（普通事件）
    const 应立即完成的登场事件 = []; // 登场事件：触发时间已到，直接完成
    const 已过期事件 = []; // 已超过结束时间，直接完成

    for (const eventName of newEvents) {
      const eventData = eventDefinitions[eventName];
      const triggerTime = eventData.触发条件;
      const endTime = getEndTime(eventData);
      const isDebut = isDebutEvent(eventData);

      // 检查是否已超过结束时间
      if (endTime && isTimeAfterEventEnd(currentTime, endTime)) {
        已过期事件.push(eventName);
        log(`📅 ${eventName}: 已过期（结束时间 ${formatDate(endTime)}）`);
      }
      // 检查是否到了触发时间
      else if (isTimeForEvent(currentTime, eventData, eventName)) {
        // 登场事件特殊处理：直接完成，不进入进行中
        if (isDebut) {
          应立即完成的登场事件.push(eventName);
          log(`🎭 ${eventName}: 登场事件，直接完成（触发时间 ${formatDate(triggerTime)}）`);
        } else {
          应立即触发事件.push(eventName);
          log(`▶️ ${eventName}: 应立即触发（触发时间 ${formatDate(triggerTime)}）`);
        }
      }
      // 还未到触发时间
      else {
        未开始事件.push(eventName);
        log(`⏰ ${eventName}: 未到触发时间（触发时间 ${formatDate(triggerTime)}）`);
      }
    }

    log(
      `分类结果: 未开始=${未开始事件.length}, 应触发=${应立即触发事件.length}, 登场事件=${应立即完成的登场事件.length}, 已过期=${已过期事件.length}`,
    );
    debugGroupEnd();

    const 未开始事件对象 = Object.fromEntries(未开始事件.map(name => [name, eventDefinitions[name].触发条件]));
    const 进行中事件对象 = Object.fromEntries(应立即触发事件.map(name => [name, getEndTime(eventDefinitions[name])]));
    const 初始化完成事件对象 = Object.fromEntries([...应立即完成的登场事件, ...已过期事件].map(name => [name, 0]));
    const expectedEventSystemPatch = {};
    if (未开始事件.length > 0) {
      expectedEventSystemPatch.未发生事件 = 未开始事件对象;
    }
    if (应立即触发事件.length > 0) {
      expectedEventSystemPatch.进行中事件 = 进行中事件对象;
    }
    if (Object.keys(初始化完成事件对象).length > 0) {
      expectedEventSystemPatch.已完成事件 = 初始化完成事件对象;
    }

    // ==================== 1. 添加未开始的事件到"未发生事件" ====================
    if (未开始事件.length > 0) {
      debugGroup(`📝 添加 ${未开始事件.length} 个未开始事件`);

      const payload = {
        事件系统: { 未发生事件: 未开始事件对象 },
      };

      log('🚀 发送 era:insertByObject 指令:', payload);
      await writeDirectInsert(payload, 'initialize-unstarted-events');
      logSuccess(`✅ 已添加 ${未开始事件.length} 个未开始事件`);

      debugGroupEnd();
    }

    // ==================== 2. 批量触发应立即开始的事件 ====================
    if (应立即触发事件.length > 0) {
      debugGroup(`▶️ 批量触发 ${应立即触发事件.length} 个事件`);

      const payload = {
        事件系统: { 进行中事件: 进行中事件对象 },
      };

      log('🚀 发送 era:insertByObject 指令:', payload);
      await writeDirectInsert(payload, 'initialize-in-progress-events');
      logSuccess(`✅ 已触发 ${应立即触发事件.length} 个事件`);

      await ensureFollowupCluesForInProgressEvents(应立即触发事件, eventDefinitions, 'initialize-in-progress');

      debugGroupEnd();
    }

    // ==================== 2.5 批量完成登场事件（直接应用insert并标记完成）====================
    if (应立即完成的登场事件.length > 0) {
      await processDebutEventsCompletion(应立即完成的登场事件, eventDefinitions);
    }

    // ==================== 3. 批量完成已过期的事件 ====================
    if (已过期事件.length > 0) {
      await processExpiredEventsCompletion(已过期事件, eventDefinitions);
    }

    // ==================== 汇总统计 ====================
    const totalAdded = 未开始事件.length + 应立即触发事件.length + 应立即完成的登场事件.length + 已过期事件.length;
    logSuccess(`📊 初始化完成: 共处理 ${totalAdded} 个新事件`);
    logSuccess(
      `   └─ 未开始: ${未开始事件.length} | 已触发: ${应立即触发事件.length} | 登场完成: ${应立即完成的登场事件.length} | 已过期: ${已过期事件.length}`,
    );

    if (totalAdded > 0) {
      toastr.success(
        `✅ 智能初始化: ${totalAdded}个事件 (登场${应立即完成的登场事件.length}个, 过期${已过期事件.length}个)`,
      );
    }

    // 验证最终结果。仅在新开局/重同步风险场景下执行延迟复核，普通重初始化走即时校验即可。
    const shouldPostResyncVerify = options.shouldPostResyncVerify === true;
    const initialVerification = await ensureEventSystemPatchPersisted(expectedEventSystemPatch, 'direct-write');
    let verifyVars = initialVerification.variables;
    if (shouldPostResyncVerify && initialVerification.expectedEventCount > 0) {
      await wait(POST_RESYNC_VERIFY_DELAY_MS);
      const postResyncVerification = await ensureEventSystemPatchPersisted(expectedEventSystemPatch, 'post-resync');
      verifyVars = postResyncVerification.variables;
    } else if (initialVerification.expectedEventCount > 0) {
      log('事件初始化即时校验完成，跳过延迟复核');
    }

    if (isDebugEnabled()) {
      debugGroupCollapsed('🔍 初始化后的事件系统状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data?.事件系统 || {})));
      debugGroupEnd();
    }
  } catch (error) {
    logError('智能批量初始化事件列表失败:', error);
  }

  debugGroupEnd();
}

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

    // 遍历所有要结束的事件，合并差分。已经持久记录完成差分的事件在重试时不会再次结算。
    for (const eventName of eventNames) {
      const eventData = eventDefinitions[eventName];
      if (!eventData) {
        logWarning(`事件定义未找到: ${eventName}`);
        continue;
      }

      // 步骤 1: 明确判断玩家是否参与
      const playerParticipated = hasParticipationEntry(参与事件, eventName);
      log(`事件 ${eventName}: 玩家是否参与? ${playerParticipated}`);

      const participationEntry = playerParticipated ? getParticipationEntry(参与事件, eventName) : null;

      if (settlementProgress[eventName] !== '差分已应用') {
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
      const progressPatch = Object.fromEntries(eventsNeedingDiff.map(eventName => [eventName, '差分已应用']));
      await writeDirectInsert(
        { 前端变量: { [EVENT_SETTLEMENT_PROGRESS_KEY]: progressPatch } },
        'batch-end-mark-diff-applied',
      );
      const progressVars = await getVariables({ type: 'chat' });
      const persistedProgress = progressVars?.stat_data?.前端变量?.[EVENT_SETTLEMENT_PROGRESS_KEY] || {};
      if (eventsNeedingDiff.some(eventName => persistedProgress[eventName] !== '差分已应用')) {
        throw new Error('事件差分结算进度未能持久化，保留进行中事件等待重试');
      }
    }

    const archived = await ensureWorldEventsArchived(eventNames, eventDefinitions, currentVars);
    if (!archived) {
      throw new Error('世界事件归档未能持久化，保留参与事件等待重试');
    }

    // 2. 批量将事件移至"已完成"
    const completedPayload = {
      事件系统: {
        已完成事件: 已完成事件对象,
      },
    };
    log('🚀 2. 发送 era:insertByObject 指令 (批量移至已完成):', completedPayload);
    await writeDirectInsert(completedPayload, 'batch-end-completed');
    log('✅ 步骤2完成: 批量移至已完成');

    // 3. 批量从"进行中"删除
    const deleteInProgressPayload = {
      事件系统: {
        进行中事件: 进行中删除对象,
      },
    };
    log('🚀 3. 发送 era:deleteByObject 指令 (批量从进行中删除):', deleteInProgressPayload);
    await writeDirectDelete(deleteInProgressPayload, 'batch-end-delete-in-progress');
    log('✅ 步骤3完成: 批量从进行中删除');

    // 4. 如果有玩家参与的事件，批量从"参与事件"中删除
    if (Object.keys(参与删除对象).length > 0) {
      const deleteParticipationPayload = {
        参与事件: 参与删除对象,
      };
      log('🚀 4. 发送 era:deleteByObject 指令 (批量从参与事件中删除):', deleteParticipationPayload);
      await writeDirectDelete(deleteParticipationPayload, 'batch-end-delete-participation');
      log('✅ 步骤4完成: 批量从参与事件中删除');
    }

    // 5. 清理仅属于本批已结束事件的人物占用；被其他事件覆盖的占用不会误删
    await cleanupParticipantOccupancy(eventNames);

    // 6. 完成后才原子写入后续线索与计数；进行中阶段不会生成线索。
    await writeFollowupEvents(eventNames, eventDefinitions, { reason: 'batch-end' });

    // 7. 验证最终状态；任一项缺失都保留未完成标记供下一轮明确报错和重试。
    const verifyVars = await getVariables({ type: 'chat' });
    const verifyStat = verifyVars?.stat_data || {};
    const expectedFollowups = buildFollowupPayloads(eventNames, eventDefinitions);
    const completionPersisted = eventNames.every(eventName => {
      const worldEventPersisted =
        !isOrdinaryWorldEvent(eventDefinitions[eventName]) || isPlainObject(verifyStat?.世界事件?.[eventName]);
      const occupancyCleared = Object.values(verifyStat?.事件系统?.人物事件占用 || {}).every(
        occupancyValue => occupancyValue?.事件名 !== eventName,
      );
      return (
        Object.prototype.hasOwnProperty.call(verifyStat?.事件系统?.已完成事件 || {}, eventName) &&
        !Object.prototype.hasOwnProperty.call(verifyStat?.事件系统?.进行中事件 || {}, eventName) &&
        !hasParticipationEntry(verifyStat?.参与事件, eventName) &&
        worldEventPersisted &&
        occupancyCleared
      );
    });
    const followupsPersisted = Object.keys(expectedFollowups.followupPayload).every(
      key =>
        verifyStat?.后续事件线索?.[key] === expectedFollowups.followupPayload[key] &&
        verifyStat?.后续事件线索计数?.[key] === expectedFollowups.followupCountPayload[key],
    );

    if (!completionPersisted || !followupsPersisted) {
      throw new Error('事件完成状态未完整落库（世界事件/已完成/进行中/参与事件/后续线索），等待下一轮重试');
    }

    const progressCleanup = Object.fromEntries(eventNames.map(eventName => [eventName, {}]));
    await writeDirectDelete(
      { 前端变量: { [EVENT_SETTLEMENT_PROGRESS_KEY]: progressCleanup } },
      'batch-end-clear-settlement-progress',
    );

    if (isDebugEnabled()) {
      debugGroupCollapsed('🔍 批量结算后的完整状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data || {})));
      debugGroupEnd();
    }

    logSuccess(`批量结算完成 ${eventNames.length} 个事件:`, eventNames);

    // 显示通知（限制数量避免刷屏）
    if (eventNames.length <= 5) {
      eventNames.forEach(name => {
        toastr.success(`✅ 事件完成: ${name}`, '', { timeOut: 2000 });
      });
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
