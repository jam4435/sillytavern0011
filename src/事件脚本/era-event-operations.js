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
  getEventShortName,
  isDebutEvent,
  calculateDateOffset,
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
  writeEraDelete,
} from './era-write-helper.js';

const EVENT_KIND_PATTERN = /(事件条目-|登场事件-|成长条目-)/;
const CHAPTER_EVENT_PATTERN = /^第[0-9一二三四五六七八九十百千万]+回-/;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function getEventFamilyParts(eventName) {
  const text = String(eventName || '');
  const match = text.match(EVENT_KIND_PATTERN);
  if (!match) return null;

  const kindPrefix = match[1];
  const kindIndex = match.index || 0;
  const fullPrefix = text.slice(0, kindIndex + kindPrefix.length);
  const novelPrefix = text.slice(0, kindIndex);
  const coreName = text.slice(kindIndex + kindPrefix.length);

  return { novelPrefix, kindPrefix, fullPrefix, coreName };
}

function stripJsonSuffix(value) {
  const text = String(value || '').trim();
  return text.endsWith('.json') ? text.slice(0, -5) : text;
}

function resolveEventReference(sourceEventName, targetEventName, eventDefinitions) {
  const rawTarget = stripJsonSuffix(targetEventName);
  if (!rawTarget) return rawTarget;
  if (eventDefinitions[rawTarget]) return rawTarget;

  const sourceParts = getEventFamilyParts(sourceEventName);
  const targetParts = getEventFamilyParts(rawTarget);
  const candidates = [];
  const addCandidate = candidate => {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  addCandidate(rawTarget);

  if (sourceParts) {
    if (targetParts) {
      addCandidate(`${sourceParts.novelPrefix}${targetParts.kindPrefix}${targetParts.coreName}`);
      addCandidate(`${sourceParts.fullPrefix}${targetParts.coreName}`);
      addCandidate(targetParts.coreName);
    } else {
      addCandidate(`${sourceParts.fullPrefix}${rawTarget}`);
    }
  }

  if (targetParts) {
    addCandidate(targetParts.coreName);
  }

  for (const candidate of candidates) {
    if (eventDefinitions[candidate]) {
      return candidate;
    }
  }

  if (sourceParts) {
    const coreTarget = targetParts ? targetParts.coreName : rawTarget;
    const suffixMatches = Object.keys(eventDefinitions).filter(name => {
      const parts = getEventFamilyParts(name);
      return (
        parts &&
        parts.novelPrefix === sourceParts.novelPrefix &&
        parts.kindPrefix === sourceParts.kindPrefix &&
        parts.coreName === coreTarget
      );
    });
    if (suffixMatches.length === 1) {
      return suffixMatches[0];
    }
  }

  return rawTarget;
}

function normalizeEventRecordName(sourceEventName, recordName) {
  const sourceParts = getEventFamilyParts(sourceEventName);
  const rawRecordName = stripJsonSuffix(recordName);
  const recordParts = getEventFamilyParts(rawRecordName);
  const strippedRecordName = recordParts ? `${recordParts.novelPrefix}${recordParts.coreName}` : rawRecordName;

  if (!sourceParts?.novelPrefix) {
    return strippedRecordName;
  }
  if (strippedRecordName.startsWith(sourceParts.novelPrefix)) {
    return strippedRecordName;
  }
  if (CHAPTER_EVENT_PATTERN.test(strippedRecordName)) {
    return `${sourceParts.novelPrefix}${strippedRecordName}`;
  }
  return strippedRecordName;
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

// ==================== 批量初始化未发生事件列表（智能优化版）====================
export async function initializeEventList(eventDefinitions) {
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

    const currentTime = variables.stat_data.世界信息.时间;
    const 未发生事件 = variables?.stat_data?.事件系统?.未发生事件 || {};
    const 进行中事件 = variables?.stat_data?.事件系统?.进行中事件 || {};
    const 已完成事件 = variables?.stat_data?.事件系统?.已完成事件 || {};

    let timeString = formatDate(currentTime);
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
      const isDebut = isDebutEvent(eventName);

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

    // ==================== 1. 添加未开始的事件到"未发生事件" ====================
    if (未开始事件.length > 0) {
      debugGroup(`📝 添加 ${未开始事件.length} 个未开始事件`);

      const 未开始事件对象 = Object.fromEntries(未开始事件.map(name => [name, eventDefinitions[name].触发条件]));

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

      const 进行中事件对象 = Object.fromEntries(
        应立即触发事件.map(name => [name, getEndTime(eventDefinitions[name])]),
      );

      const payload = {
        事件系统: { 进行中事件: 进行中事件对象 },
      };

      log('🚀 发送 era:insertByObject 指令:', payload);
      await writeDirectInsert(payload, 'initialize-in-progress-events');
      logSuccess(`✅ 已触发 ${应立即触发事件.length} 个事件`);

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

    // 验证最终结果
    const verifyVars = await getVariables({ type: 'chat' });
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

// ==================== 批量开始事件 ====================
export async function batchStartEvents(eventNames, eventDefinitions) {
  if (eventNames.length === 0) return;

  debugGroup(`▶️ 批量开始事件 (${eventNames.length}个)`);

  try {
    // 1. 批量添加到"进行中"
    const 进行中事件对象 = Object.fromEntries(eventNames.map(name => [name, getEndTime(eventDefinitions[name])]));

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

// ==================== 玩家参与事件 (重构版：时间平移+简化键名) ====================
export async function playerJoinsEvent(eventName, eventData) {
  debugGroup(`👤 玩家参与事件: ${eventName}`);

  try {
    // 1. 获取简化键名
    const shortName = getEventShortName(eventName);

    // 2. 检查是否已参与 (避免重复添加)
    const currentVars = await getVariables({ type: 'chat' });
    if (currentVars?.stat_data?.参与事件?.[shortName]) {
      debugGroupEnd();
      return;
    }

    // 3. 计算时间平移
    const currentTime = currentVars.stat_data.世界信息.时间;
    const triggerTime = eventData.触发条件;
    let startTime = triggerTime;
    let endTime = getEndTime(eventData);

    // 假设compareTime返回天数差值
    const timeDiffDays = compareTime(triggerTime, currentTime, 'diff');
    if (timeDiffDays > 0) {
      // 玩家提前触发
      startTime = currentTime;
      endTime = calculateDateOffset(endTime, -timeDiffDays);
    }

    // 4. 拼接值字符串
    const description = `${formatDate(startTime)} 到 ${formatDate(endTime)}，${eventData.事件详情}`;

    // 5. 构建Payload并发送指令
    const payload = {
      参与事件: {
        [shortName]: description,
      },
    };

    await writeEraInsert(payload, 'player-joins-event');
    logSuccess(`玩家已参与事件: ${shortName}`);
    toastr.warning(`⚠️ 你已到达事件地点: ${eventName}！你的行为可能会改变事件的结局。`);

    debugGroupEnd();
  } catch (error) {
    logError(`玩家参与事件失败: ${eventName}`, error);
    debugGroupEnd();
  }
}

// ==================== 批量结束事件并应用差分 ====================
export async function batchEndEvents(eventNames, eventDefinitions) {
  if (eventNames.length === 0) return;

  debugGroup(`⏹️ 批量结算事件 (${eventNames.length}个)`);

  try {
    const currentVars = await getVariables({ type: 'chat' });
    const statData = currentVars.stat_data;
    const 参与事件 = statData.参与事件 || {};

    // 收集所有需要应用的差分
    const 合并后的差分 = {
      insert: {},
      update: {},
      delete: {},
    };

    const 已完成事件对象 = {};
    const 进行中删除对象 = {};
    const 参与删除对象 = {};

    // 遍历所有要结束的事件，合并差分
    for (const eventName of eventNames) {
      const eventData = eventDefinitions[eventName];
      if (!eventData) {
        logWarning(`事件定义未找到: ${eventName}`);
        continue;
      }

      // 步骤 1: 明确判断玩家是否参与
      const playerParticipated = eventName in 参与事件;
      log(`事件 ${eventName}: 玩家是否参与? ${playerParticipated}`);

      // 步骤 2: 根据玩家参与状态决定数据源
      const eventDataSource = eventData; // 数据源始终是完整的事件定义

      // 步骤 3: 循环应用差分
      for (const actionKey of ['insert', 'update', 'delete']) {
        // 根据是否参与，决定使用哪个差分键 (e.g., 'P-insert' or 'insert')
        const playerActionKey = `P-${actionKey}`;
        let delta = {};

        if (playerParticipated && eventDataSource[playerActionKey]) {
          delta = eventDataSource[playerActionKey];
          log(`  └─ 使用玩家参与版差分 [${playerActionKey}]`);
        } else {
          delta = eventDataSource[actionKey] || {};
        }

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

      // 准备状态变更数据
      已完成事件对象[eventName] = playerParticipated ? 1 : 0;
      进行中删除对象[eventName] = {};

      if (playerParticipated) {
        参与删除对象[eventName] = {};
      }
    }

    // 1. 批量应用角色数据差分
    debugGroup('🔄 批量应用人物差分');
    await applyEventDiff(合并后的差分);
    debugGroupEnd();

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
      await writeEraDelete(deleteParticipationPayload, 'batch-end-delete-participation');
      log('✅ 步骤4完成: 批量从参与事件中删除');
    }

    // 验证操作后的状态
    const verifyVars = await getVariables({ type: 'chat' });
    if (isDebugEnabled()) {
      debugGroupCollapsed('🔍 批量结算后的完整状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data || {})));
      debugGroupEnd();
    }

    logSuccess(`批量结算完成 ${eventNames.length} 个事件:`, eventNames);

    // ==================== 生成事件后续 ====================
    await generateFollowupEvents(eventNames, eventDefinitions);

    // 显示通知（限制数量避免刷屏）
    if (eventNames.length <= 5) {
      eventNames.forEach(name => {
        toastr.success(`✅ 事件完成: ${name}`, '', { timeOut: 2000 });
      });
    } else {
      toastr.success(`✅ ${eventNames.length} 个事件已完成`, '', { timeOut: 3000 });
    }
  } catch (error) {
    logError(`批量结算事件失败`, error);
  }

  debugGroupEnd();
}

// ==================== 生成事件后续 ====================
async function generateFollowupEvents(eventNames, eventDefinitions) {
  debugGroup('🔗 生成事件后续');

  // 初始化后续事件payload
  const followupPayload = {};
  const followupCountPayload = {};

  // 遍历本次完成的eventNames数组
  for (const eventName of eventNames) {
    // 检查eventDefinitions[eventName].后续事件是否存在
    if (eventDefinitions[eventName] && eventDefinitions[eventName].后续事件) {
      // 获取来源事件的简化名，构建key (e.g., `${shortName}的后续`)
      const shortName = getEventShortName(eventName);
      const key = `${shortName}的后续`;

      // 从后续事件对象中提取描述和事件名
      const followupInfo = eventDefinitions[eventName].后续事件;

      // 步骤 1: 处理目标事件名。新世界书事件名带小说名前缀，
      // 旧后续引用常只写 "第N回..."，这里按来源事件补同小说前缀。
      const targetEventKey = resolveEventReference(eventName, followupInfo.事件名, eventDefinitions);

      const description = followupInfo.描述 || '';

      // 在所有事件定义中查找目标事件
      const targetEventData = eventDefinitions[targetEventKey];

      if (targetEventData) {
        const time = targetEventData.触发条件;
        const location = targetEventData.事件地点;
        const timeString = formatDate(time);

        // 优化后的字符串拼接格式
        const formattedDescription = `(${timeString}，${location}，似乎还会有事情发生)${description}`;

        // 填充两个payload
        followupPayload[key] = formattedDescription;
        followupCountPayload[key] = CONFIG.DEFAULT_FOLLOWUP_LIFETIME; // 使用全局常量
      }

      log(`为事件 ${eventName} 生成后续: ${key}`);
    }
  }

  // 循环结束后，如果payload不为空，则发送两次era:insertByObject指令
  if (Object.keys(followupPayload).length > 0) {
    // 写入后续事件线索
    const followupEventPayload = {
      后续事件线索: followupPayload,
    };

    log('🚀 发送 era:insertByObject 指令 (写入后续事件线索):', followupEventPayload);
    await writeDirectInsert(followupEventPayload, 'insert-followup-clues');
    logSuccess(`✅ 已写入 ${Object.keys(followupPayload).length} 个后续事件线索`);

    // 写入后续事件线索计数
    const followupCountEventPayload = {
      后续事件线索计数: followupCountPayload,
    };

    log('🚀 发送 era:insertByObject 指令 (写入后续事件线索计数):', followupCountEventPayload);
    await writeDirectInsert(followupCountEventPayload, 'insert-followup-counters');
    logSuccess(`✅ 已写入 ${Object.keys(followupCountPayload).length} 个后续事件线索计数`);
  } else {
    log('没有需要生成的后续事件');
  }

  debugGroupEnd();
}

