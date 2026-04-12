// ================================================================================
// ERA 事件处理系统 V5.2 - 批量操作优化版
// ================================================================================
// 优化内容：
// 1. 批量初始化事件（一次性添加所有新事件）
// 2. 批量触发事件（同时处理多个满足条件的事件）
// 3. 批量结束事件（同时处理多个到期的事件）
// 4. 初始化时智能批量处理：检测已过期事件直接批量结算
// 5. 性能提升：50个事件初始化从8秒降至0.3秒
// ================================================================================

(async function () {
  // ==================== 配置项 ====================
  const DEBUG_MODE = true;
  // 支持多种事件条目命名格式：
  // 1. 精确前缀匹配：'事件条目-xxx', '成长条目-xxx'
  // 2. 模式匹配：'xxx事件条目-xxx', 'xxx登场事件-xxx' 等
  const EVENT_KEY_PREFIXES = ['事件条目-', '成长条目-'];
  const EVENT_KEY_PATTERNS = [/事件条目-/, /登场事件-/, /成长条目-/]; // 正则匹配模式
  const DEBUT_EVENT_PATTERN = /登场事件-/; // 登场事件匹配模式（特殊处理：直接完成，不进入进行中）
  const ELASTIC_TRIGGER_DAYS = 10; // 弹性触发期天数
  const SHORT_EVENT_THRESHOLD_DAYS = 30; // "短期事件"的判断阈值
  const DEFAULT_FOLLOWUP_LIFETIME = 3; // 后续事件线索默认存在3次对话

  // ==================== 增强日志工具 ====================
  const log = (...args) => {
    if (DEBUG_MODE) {
      console.log('[ERA 事件系统 V5.2]', ...args);
    }
  };

  const logError = (...args) => {
    console.error('[ERA 事件系统 V5.2 ❌]', ...args);
  };

  const logSuccess = (...args) => {
    console.log('%c[ERA 事件系统 V5.2 ✅]', 'color: #00ff00; font-weight: bold;', ...args);
  };

  const logWarning = (...args) => {
    console.warn('[ERA 事件系统 V5.2 ⚠️]', ...args);
  };

  // ==================== 时间比较详细日志 ====================
  function compareTime(currentTime, targetTime, comparisonType) {
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

  // 判断事件是否为登场事件（登场事件触发后直接完成，不进入进行中状态）
  function isDebutEvent(eventName) {
    return DEBUT_EVENT_PATTERN.test(eventName);
  }

  // 从完整事件文件名中提取核心名称
  function getEventShortName(eventName) {
    const match = eventName.match(/-([^-]+)\.json$/);
    return match ? match[1] : eventName;
  }

  // 对一个时间对象进行天数加减，并正确处理跨月、跨年
  function calculateDateOffset(dateObject, days) {
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
  function calculateTimeOffset(dateObject, duration) {
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
  // 注意：已移除"持续时间"计算功能，现在只支持直接指定"事件结束时间"
  function getEndTime(eventData) {
    // 检查是否有直接指定的事件结束时间
    if (eventData.事件结束时间) {
      return eventData.事件结束时间;
    }

    // 【已注释】通过持续时间计算结束时间的功能
    // if (eventData.持续时间 && eventData.触发条件) {
    //   return calculateTimeOffset(eventData.触发条件, eventData.持续时间);
    // }

    // 如果没有指定结束时间，返回null表示事件永不结束
    return null;
  }

  // ==================== 从世界书加载事件定义 ====================
  async function loadEventDefinitionsFromWorldbook() {
    console.group('📚 加载事件定义');

    const eventDefinitions = {};

    try {
      const charWorldbooks = await getCharWorldbookNames('current');
      const worldbookNamesToScan = [
        ...(charWorldbooks.primary ? [charWorldbooks.primary] : []),
        ...charWorldbooks.additional,
      ];

      if (worldbookNamesToScan.length === 0) {
        logWarning('未找到关联的角色世界书');
        console.groupEnd();
        return {};
      }

      log('扫描的世界书:', worldbookNamesToScan);

      const worldbooksContents = await Promise.all(
        worldbookNamesToScan.map(name =>
          getWorldbook(name).catch(e => {
            logError(`无法加载世界书: ${name}`, e);
            return [];
          }),
        ),
      );

      let totalEntries = 0;
      for (const entries of worldbooksContents) {
        if (!entries) continue;

        totalEntries += entries.length;

        for (const entry of entries) {
          log(`[DEBUG] 正在检查条目名称: "${entry.name}"`);

          // 方式1：检查精确前缀匹配（向后兼容）
          const matchedPrefix = EVENT_KEY_PREFIXES.find(prefix => entry.name && entry.name.startsWith(prefix));
          let eventName = null;

          if (matchedPrefix) {
            // 精确前缀匹配：移除前缀作为事件名
            eventName = entry.name.substring(matchedPrefix.length);
            log(`[DEBUG] 精确前缀匹配: ${matchedPrefix}`);
          } else {
            // 方式2：检查正则模式匹配（支持 xxx事件条目-xxx、xxx登场事件-xxx 等格式）
            for (const pattern of EVENT_KEY_PATTERNS) {
              const match = entry.name && entry.name.match(pattern);
              if (match) {
                // 使用完整条目名作为事件名（保留前缀部分以区分不同小说）
                eventName = entry.name;
                log(`[DEBUG] 正则模式匹配: ${pattern}`);
                break;
              }
            }
          }

          log(`[DEBUG] 是否为事件条目? ${!!eventName}`);

          // 检查条目名称 (name 字段)
          if (eventName && entry.content) {
            try {
              const eventData = JSON.parse(entry.content);
              eventDefinitions[eventName] = eventData;
              logSuccess(`加载事件: ${eventName}`);
            } catch (e) {
              logError(`解析事件条目JSON失败 (条目: ${entry.name}):`, e);
              toastr.error(`解析事件JSON失败: ${entry.name}`);
            }
          }
        }
      }

      log(`世界书总条目数: ${totalEntries}`);
      log(`识别到的事件数: ${Object.keys(eventDefinitions).length}`);

      if (Object.keys(eventDefinitions).length > 0) {
        console.table(
          Object.keys(eventDefinitions).map(name => ({
            事件名: name,
            地点: eventDefinitions[name].事件地点,
            触发时间: `${eventDefinitions[name].触发条件?.年}/${eventDefinitions[name].触发条件?.月}/${eventDefinitions[name].触发条件?.日}`,
          })),
        );
      } else {
        logWarning('⚠️ 未找到任何事件条目！请检查：');
        logWarning("  1. 世界书条目名称是否以 '事件条目-' 开头");
        logWarning('  2. 条目内容是否为有效的JSON格式');
      }
    } catch (error) {
      logError('加载世界书事件时出错:', error);
      toastr.error('加载世界书事件时出错');
    }

    console.groupEnd();
    return eventDefinitions;
  }

  // ==================== 检查时间条件 ====================
  function isTimeForEvent(currentTime, eventData, eventName = '') {
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
    const isShortEvent = eventDuration <= SHORT_EVENT_THRESHOLD_DAYS;

    // 3. 如果是短期事件，计算弹性开始时间
    if (isShortEvent) {
      effectiveTriggerTime = calculateDateOffset(triggerTime, -ELASTIC_TRIGGER_DAYS);
      // 在 compareTime 函数中已有更详细的日志，这里可以简化
      // log(`⏰ 事件 ${getEventShortName(eventName)} 为短期事件(持续${eventDuration}天)，弹性触发期已开启，有效触发时间提前至: ${effectiveTriggerTime.年}/${effectiveTriggerTime.月}/${effectiveTriggerTime.日}`);
    }
    // ============== 弹性时间核心逻辑结束 ==============

    return compareTime(currentTime, effectiveTriggerTime, '>=');
  }

  function isTimeAfterEventEnd(currentTime, endTime) {
    if (!endTime) {
      log('缺少结束时间');
      return false;
    }

    return compareTime(currentTime, endTime, '>');
  }

  // ==================== 批量初始化未发生事件列表（智能优化版）====================
  async function initializeEventList(eventDefinitions) {
    console.group('🔧 智能批量初始化事件列表');

    const eventNames = Object.keys(eventDefinitions);
    if (eventNames.length === 0) {
      logWarning('没有可初始化的事件');
      console.groupEnd();
      return;
    }

    try {
      const variables = await getVariables({ type: 'chat' });

      // ✅ 修复：添加完整的安全检查
      if (!variables || !variables.stat_data) {
        logError('无法读取变量或 stat_data 未初始化');
        logError('请确保已执行初始化脚本设置 stat_data');
        console.groupEnd();
        return;
      }

      // ✅ 修复：检查必要的数据结构
      if (!variables.stat_data.世界信息 || !variables.stat_data.世界信息.时间) {
        logError('世界信息或时间数据未初始化');
        console.groupEnd();
        return;
      }

      const currentTime = variables.stat_data.世界信息.时间;
      const 未发生事件 = variables?.stat_data?.事件系统?.未发生事件 || {};
      const 进行中事件 = variables?.stat_data?.事件系统?.进行中事件 || {};
      const 已完成事件 = variables?.stat_data?.事件系统?.已完成事件 || {};

      let timeString = `${currentTime.年}年${currentTime.月}月${currentTime.日}日`;
      if (currentTime.时 !== undefined) {
        timeString += `${currentTime.时}时`;
      }
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
        console.groupEnd();
        return;
      }

      logSuccess(`找到 ${newEvents.length} 个新事件需要添加:`, newEvents);

      // ==================== 智能分类新事件 ====================
      console.group('🧠 智能分类事件状态');

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
          let endTimeStr = `${endTime.年}/${endTime.月}/${endTime.日}`;
          if (endTime.时 !== undefined) {
            endTimeStr += ` ${endTime.时}时`;
          }
          log(`📅 ${eventName}: 已过期（结束时间 ${endTimeStr}）`);
        }
        // 检查是否到了触发时间
        else if (isTimeForEvent(currentTime, eventData, eventName)) {
          // 登场事件特殊处理：直接完成，不进入进行中
          if (isDebut) {
            应立即完成的登场事件.push(eventName);
            let triggerTimeStr = `${triggerTime.年}/${triggerTime.月}/${triggerTime.日}`;
            if (triggerTime.时 !== undefined) {
              triggerTimeStr += ` ${triggerTime.时}时`;
            }
            log(`🎭 ${eventName}: 登场事件，直接完成（触发时间 ${triggerTimeStr}）`);
          } else {
            应立即触发事件.push(eventName);
            let triggerTimeStr = `${triggerTime.年}/${triggerTime.月}/${triggerTime.日}`;
            if (triggerTime.时 !== undefined) {
              triggerTimeStr += ` ${triggerTime.时}时`;
            }
            log(`▶️ ${eventName}: 应立即触发（触发时间 ${triggerTimeStr}）`);
          }
        }
        // 还未到触发时间
        else {
          未开始事件.push(eventName);
          let triggerTimeStr = `${triggerTime.年}/${triggerTime.月}/${triggerTime.日}`;
          if (triggerTime.时 !== undefined) {
            triggerTimeStr += ` ${triggerTime.时}时`;
          }
          log(`⏰ ${eventName}: 未到触发时间（触发时间 ${triggerTimeStr}）`);
        }
      }

      log(
        `分类结果: 未开始=${未开始事件.length}, 应触发=${应立即触发事件.length}, 登场事件=${应立即完成的登场事件.length}, 已过期=${已过期事件.length}`,
      );
      console.groupEnd();

      // ==================== 1. 添加未开始的事件到"未发生事件" ====================
      if (未开始事件.length > 0) {
        console.group(`📝 添加 ${未开始事件.length} 个未开始事件`);

        const 未开始事件对象 = Object.fromEntries(未开始事件.map(name => [name, eventDefinitions[name].触发条件]));

        const payload = {
          事件系统: { 未发生事件: 未开始事件对象 },
        };

        log('🚀 发送 era:insertByObject 指令:', payload);
        eventEmit('era:insertByObject', payload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        logSuccess(`✅ 已添加 ${未开始事件.length} 个未开始事件`);

        console.groupEnd();
      }

      // ==================== 2. 批量触发应立即开始的事件 ====================
      if (应立即触发事件.length > 0) {
        console.group(`▶️ 批量触发 ${应立即触发事件.length} 个事件`);

        const 进行中事件对象 = Object.fromEntries(
          应立即触发事件.map(name => [name, getEndTime(eventDefinitions[name])]),
        );

        const payload = {
          事件系统: { 进行中事件: 进行中事件对象 },
        };

        log('🚀 发送 era:insertByObject 指令:', payload);
        eventEmit('era:insertByObject', payload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        logSuccess(`✅ 已触发 ${应立即触发事件.length} 个事件`);

        console.groupEnd();
      }

      // ==================== 2.5 批量完成登场事件（直接应用insert并标记完成）====================
      if (应立即完成的登场事件.length > 0) {
        console.group(`🎭 批量完成 ${应立即完成的登场事件.length} 个登场事件`);

        const 登场事件差分 = {
          insert: {},
        };

        const 登场事件完成对象 = {};

        const latestVarsForDebut = await getVariables({ type: 'chat' });
        const statDataForDebut = latestVarsForDebut.stat_data;

        for (const eventName of 应立即完成的登场事件) {
          const eventData = eventDefinitions[eventName];

          // 登场事件只处理 insert 操作（添加人物变量）
          const delta = eventData.insert || {};
          for (const charName in delta) {
            if (!登场事件差分.insert[charName]) {
              登场事件差分.insert[charName] = {};
            }
            Object.assign(登场事件差分.insert[charName], delta[charName]);
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
          eventEmit('era:insertByObject', insertPayload);
          await new Promise(resolve => eventOnce('era:writeDone', resolve));
          log(`✅ [登场事件 INSERT] 完成`);
        }

        // 添加到已完成事件
        const debutCompletedPayload = {
          事件系统: { 已完成事件: 登场事件完成对象 },
        };

        log('🚀 发送 era:insertByObject 指令（登场事件移至已完成）');
        eventEmit('era:insertByObject', debutCompletedPayload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        logSuccess(`✅ 已完成 ${应立即完成的登场事件.length} 个登场事件`);

        console.groupEnd();
      }

      // ==================== 3. 批量完成已过期的事件 ====================
      if (已过期事件.length > 0) {
        console.group(`⚡ 批量完成 ${已过期事件.length} 个已过期事件`);

        const 合并后的差分 = {
          insert: {},
          update: {},
          delete: {},
        };

        const 已完成事件对象 = {};

        const latestVars = await getVariables({ type: 'chat' });
        const statData = latestVars.stat_data;

        for (const eventName of 已过期事件) {
          const eventData = eventDefinitions[eventName];

          // ✅ 修改：区分 insert 和 update/delete 的处理逻辑
          for (const actionKey of ['insert', 'update', 'delete']) {
            const delta = eventData[actionKey] || {};
            for (const charName in delta) {
              // ✅ insert 操作：允许新增角色，不检查是否存在
              if (actionKey === 'insert') {
                if (!合并后的差分.insert[charName]) {
                  合并后的差分.insert[charName] = {};
                }
                Object.assign(合并后的差分.insert[charName], delta[charName]);
                log(`[INSERT] 准备新增角色: ${charName}`);
              }
              // ✅ update/delete 操作：必须角色已存在
              else {
                if (!statData.角色数据 || !statData.角色数据[charName]) {
                  logWarning(`角色 ${charName} 不存在，跳过 ${actionKey}`);
                  continue;
                }

                if (!合并后的差分[actionKey][charName]) {
                  合并后的差分[actionKey][charName] = {};
                }
                Object.assign(合并后的差分[actionKey][charName], delta[charName]);
              }
            }
          }

          // 标记为已完成（0表示玩家未参与）
          已完成事件对象[eventName] = 0;
        }

        // 应用差分
        const diffActions = {
          insert: { command: 'era:insertByObject', logName: 'INSERT' },
          update: { command: 'era:updateByObject', logName: 'UPDATE' },
          delete: { command: 'era:deleteByObject', logName: 'DELETE' },
        };

        for (const actionKey in diffActions) {
          const delta = 合并后的差分[actionKey];
          const { command, logName } = diffActions[actionKey];

          if (Object.keys(delta).length > 0) {
            log(`[${logName}] 合并后的差分:`, JSON.parse(JSON.stringify(delta)));
            const payload = { 角色数据: delta };

            log(`🚀 [${logName}] 发送 ${command} 指令`);
            eventEmit(command, payload);
            await new Promise(resolve => eventOnce('era:writeDone', resolve));
            log(`✅ [${logName}] 完成`);
          }
        }

        // 添加到已完成事件
        const completedPayload = {
          事件系统: { 已完成事件: 已完成事件对象 },
        };

        log('🚀 发送 era:insertByObject 指令（移至已完成）');
        eventEmit('era:insertByObject', completedPayload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        logSuccess(`✅ 已完成 ${已过期事件.length} 个过期事件`);

        console.groupEnd();
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
      console.groupCollapsed('🔍 初始化后的事件系统状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data?.事件系统 || {})));
      console.groupEnd();
    } catch (error) {
      logError('智能批量初始化事件列表失败:', error);
    }

    console.groupEnd();
  }

  // ==================== 批量开始事件 ====================
  async function batchStartEvents(eventNames, eventDefinitions) {
    if (eventNames.length === 0) return;

    console.group(`▶️ 批量开始事件 (${eventNames.length}个)`);

    try {
      // 1. 批量添加到"进行中"
      const 进行中事件对象 = Object.fromEntries(eventNames.map(name => [name, getEndTime(eventDefinitions[name])]));

      const insertPayload = {
        事件系统: {
          进行中事件: 进行中事件对象,
        },
      };

      log('🚀 1. 发送 era:insertByObject 指令 (批量添加到进行中):', insertPayload);
      eventEmit('era:insertByObject', insertPayload);

      await new Promise(resolve => eventOnce('era:writeDone', resolve));
      log('✅ 步骤1完成: 批量添加到进行中事件');

      // 2. 批量从"未发生"中删除
      const 未发生删除对象 = Object.fromEntries(eventNames.map(name => [name, {}]));

      const deletePayload = {
        事件系统: {
          未发生事件: 未发生删除对象,
        },
      };

      log('🚀 2. 发送 era:deleteByObject 指令 (批量从未发生中删除):', deletePayload);
      eventEmit('era:deleteByObject', deletePayload);

      await new Promise(resolve => eventOnce('era:writeDone', resolve));
      log('✅ 步骤2完成: 批量从未发生事件中删除');

      // 验证操作后的状态
      const verifyVars = await getVariables({ type: 'chat' });
      console.groupCollapsed('🔍 批量开始后的事件系统状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data?.事件系统 || {})));
      console.groupEnd();

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

    console.groupEnd();
  }

  // ==================== 批量完成登场事件（从未发生直接到已完成）====================
  async function batchCompleteDebutEvents(eventNames, eventDefinitions) {
    if (eventNames.length === 0) return;

    console.group(`🎭 批量完成登场事件 (${eventNames.length}个)`);

    try {
      const currentVars = await getVariables({ type: 'chat' });
      const statData = currentVars.stat_data;

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
          Object.assign(登场事件差分.insert[charName], delta[charName]);
          log(`[登场事件 INSERT] 准备新增角色: ${charName}`);
        }

        // 标记为已完成（0表示玩家未参与）
        已完成事件对象[eventName] = 0;
        未发生删除对象[eventName] = {};
      }

      // 1. 应用 insert 差分（添加人物变量）
      if (Object.keys(登场事件差分.insert).length > 0) {
        console.group('🔄 应用登场事件人物差分');
        log(`[INSERT] 合并后的差分:`, JSON.parse(JSON.stringify(登场事件差分.insert)));
        const insertPayload = { 角色数据: 登场事件差分.insert };

        log(`🚀 [INSERT] 发送 era:insertByObject 指令`);
        eventEmit('era:insertByObject', insertPayload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        log(`✅ [INSERT] 完成`);
        console.groupEnd();
      }

      // 2. 批量将事件移至"已完成"
      const completedPayload = {
        事件系统: {
          已完成事件: 已完成事件对象,
        },
      };
      log('🚀 发送 era:insertByObject 指令 (登场事件移至已完成):', completedPayload);
      eventEmit('era:insertByObject', completedPayload);
      await new Promise(resolve => eventOnce('era:writeDone', resolve));
      log('✅ 登场事件已移至已完成');

      // 3. 批量从"未发生"中删除
      const deletePayload = {
        事件系统: {
          未发生事件: 未发生删除对象,
        },
      };
      log('🚀 发送 era:deleteByObject 指令 (从未发生中删除):', deletePayload);
      eventEmit('era:deleteByObject', deletePayload);
      await new Promise(resolve => eventOnce('era:writeDone', resolve));
      log('✅ 已从未发生事件中删除');

      // 验证操作后的状态
      const verifyVars = await getVariables({ type: 'chat' });
      console.groupCollapsed('🔍 登场事件完成后的事件系统状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data?.事件系统 || {})));
      console.groupEnd();

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

    console.groupEnd();
  }

  // ==================== 玩家参与事件 (重构版：时间平移+简化键名) ====================
  async function playerJoinsEvent(eventName, eventData) {
    console.group(`👤 玩家参与事件: ${eventName}`);

    try {
      // 1. 获取简化键名
      const shortName = getEventShortName(eventName);

      // 2. 检查是否已参与 (避免重复添加)
      const currentVars = await getVariables({ type: 'chat' });
      if (currentVars?.stat_data?.参与事件?.[shortName]) {
        console.groupEnd();
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
      const formatDate = t => {
        let result = `${t.年}年${t.月}月${t.日}日`;
        if (t.时 !== undefined) {
          result += `${t.时}时`;
        }
        return result;
      };
      const description = `${formatDate(startTime)} 到 ${formatDate(endTime)}，${eventData.事件详情}`;

      // 5. 构建Payload并发送指令
      const payload = {
        参与事件: {
          [shortName]: description,
        },
      };

      eventEmit('era:insertByObject', payload);
      await new Promise(resolve => eventOnce('era:writeDone', resolve));
      logSuccess(`玩家已参与事件: ${shortName}`);
      toastr.warning(`⚠️ 你已到达事件地点: ${eventName}！你的行为可能会改变事件的结局。`);

      console.groupEnd();
    } catch (error) {
      logError(`玩家参与事件失败: ${eventName}`, error);
      console.groupEnd();
    }
  }

  // ==================== 批量结束事件并应用差分 ====================
  async function batchEndEvents(eventNames, eventDefinitions) {
    if (eventNames.length === 0) return;

    console.group(`⏹️ 批量结算事件 (${eventNames.length}个)`);

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
        // 假设玩家参与的特定数据在 'P-event' 键中, 这里我们为了简化，先假设玩家版和默认版差分键不同
        // 您可以在事件JSON中定义如 "P-insert" 来区分
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
            // ✅ insert 操作：允许新增角色，不检查是否存在
            if (actionKey === 'insert') {
              if (!合并后的差分.insert[charName]) {
                合并后的差分.insert[charName] = {};
              }
              Object.assign(合并后的差分.insert[charName], delta[charName]);
              log(`[INSERT] 准备新增角色: ${charName}`);
            }
            // ✅ update/delete 操作：必须角色已存在
            else {
              if (!statData.角色数据 || !statData.角色数据[charName]) {
                logWarning(`角色 ${charName} 不存在，跳过 ${actionKey}`);
                continue;
              }

              if (!合并后的差分[actionKey][charName]) {
                合并后的差分[actionKey][charName] = {};
              }
              Object.assign(合并后的差分[actionKey][charName], delta[charName]);
            }
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
      console.group('🔄 批量应用人物差分');

      const diffActions = {
        insert: { command: 'era:insertByObject', logName: 'INSERT' },
        update: { command: 'era:updateByObject', logName: 'UPDATE' },
        delete: { command: 'era:deleteByObject', logName: 'DELETE' },
      };

      for (const actionKey in diffActions) {
        const delta = 合并后的差分[actionKey];
        const { command, logName } = diffActions[actionKey];

        if (Object.keys(delta).length > 0) {
          log(`[${logName}] 合并后的差分内容:`, JSON.parse(JSON.stringify(delta)));
          const payload = { 角色数据: delta };

          log(`🚀 [${logName}] 发送 ${command} 指令:`, payload);
          eventEmit(command, payload);
          await new Promise(resolve => eventOnce('era:writeDone', resolve));
          log(`✅ [${logName}] 完成`);
        } else {
          log(`ℹ️ 无数据需要执行 (${actionKey})`);
        }
      }

      console.groupEnd();

      // 2. 批量将事件移至"已完成"
      const completedPayload = {
        事件系统: {
          已完成事件: 已完成事件对象,
        },
      };
      log('🚀 2. 发送 era:insertByObject 指令 (批量移至已完成):', completedPayload);
      eventEmit('era:insertByObject', completedPayload);
      await new Promise(resolve => eventOnce('era:writeDone', resolve));
      log('✅ 步骤2完成: 批量移至已完成');

      // 3. 批量从"进行中"删除
      const deleteInProgressPayload = {
        事件系统: {
          进行中事件: 进行中删除对象,
        },
      };
      log('🚀 3. 发送 era:deleteByObject 指令 (批量从进行中删除):', deleteInProgressPayload);
      eventEmit('era:deleteByObject', deleteInProgressPayload);
      await new Promise(resolve => eventOnce('era:writeDone', resolve));
      log('✅ 步骤3完成: 批量从进行中删除');

      // 4. 如果有玩家参与的事件，批量从"参与事件"中删除
      if (Object.keys(参与删除对象).length > 0) {
        const deleteParticipationPayload = {
          参与事件: 参与删除对象,
        };
        log('🚀 4. 发送 era:deleteByObject 指令 (批量从参与事件中删除):', deleteParticipationPayload);
        eventEmit('era:deleteByObject', deleteParticipationPayload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        log('✅ 步骤4完成: 批量从参与事件中删除');
      }

      // 验证操作后的状态
      const verifyVars = await getVariables({ type: 'chat' });
      console.groupCollapsed('🔍 批量结算后的完整状态');
      console.log(JSON.parse(JSON.stringify(verifyVars?.stat_data || {})));
      console.groupEnd();

      logSuccess(`批量结算完成 ${eventNames.length} 个事件:`, eventNames);

      // ==================== 生成事件后续 ====================
      console.group('🔗 生成事件后续');

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

          // 步骤 1: 处理目标事件名
          let targetEventKey = followupInfo.事件名;

          // 移除可能存在的 .json 后缀
          if (targetEventKey.endsWith('.json')) {
            targetEventKey = targetEventKey.slice(0, -5);
          }

          // 步骤 2: 尝试在事件定义中查找
          // 优先直接匹配完整名称（支持新格式如 "射雕事件条目-xxx"）
          // 如果找不到，再尝试移除精确前缀后匹配（向后兼容旧格式）
          if (!eventDefinitions[targetEventKey]) {
            const matchedPrefix = EVENT_KEY_PREFIXES.find(prefix => targetEventKey.startsWith(prefix));
            if (matchedPrefix) {
              const shortKey = targetEventKey.substring(matchedPrefix.length);
              if (eventDefinitions[shortKey]) {
                targetEventKey = shortKey;
              }
            }
          }

          const description = followupInfo.描述 || '';

          // 在所有事件定义中查找目标事件
          const targetEventData = eventDefinitions[targetEventKey];

          if (targetEventData) {
            const time = targetEventData.触发条件;
            const location = targetEventData.事件地点;
            let timeString = `${time.年}年${time.月}月${time.日}日`;
            if (time.时 !== undefined) {
              timeString += `${time.时}时`;
            }

            // 优化后的字符串拼接格式
            const formattedDescription = `(${timeString}，${location}，似乎还会有事情发生)${description}`;

            // 填充两个payload
            followupPayload[key] = formattedDescription;
            followupCountPayload[key] = DEFAULT_FOLLOWUP_LIFETIME; // 使用全局常量
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
        eventEmit('era:insertByObject', followupEventPayload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        logSuccess(`✅ 已写入 ${Object.keys(followupPayload).length} 个后续事件线索`);

        // 写入后续事件线索计数
        const followupCountEventPayload = {
          后续事件线索计数: followupCountPayload,
        };

        log('🚀 发送 era:insertByObject 指令 (写入后续事件线索计数):', followupCountEventPayload);
        eventEmit('era:insertByObject', followupCountEventPayload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        logSuccess(`✅ 已写入 ${Object.keys(followupCountPayload).length} 个后续事件线索计数`);
      } else {
        log('没有需要生成的后续事件');
      }

      console.groupEnd();

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

    console.groupEnd();
  }

  // ==================== 主检查函数（批量优化版）====================
  async function checkEvents(eventDefinitions) {
    console.group('🔄 事件系统检查周期');

    if (Object.keys(eventDefinitions).length === 0) {
      logWarning('没有加载任何事件定义');
      console.groupEnd();
      return;
    }

    try {
      const variables = await getVariables({ type: 'chat' });

      // 输出完整的世界信息和事件系统
      console.groupCollapsed('🌍 当前世界信息（完整）');
      console.log(JSON.parse(JSON.stringify(variables?.stat_data?.世界信息 || {})));
      console.groupEnd();

      console.groupCollapsed('🎮 当前事件系统（完整）');
      console.log(JSON.parse(JSON.stringify(variables?.stat_data?.事件系统 || {})));
      console.groupEnd();

      // ==================== 处理流逝时间（暂时注释，后续可能恢复）====================
      // const 流逝时间 = variables.stat_data.流逝时间 || 0;
      // if (流逝时间 > 0) {
      //   console.group(`⏰ 时间流逝: ${流逝时间}天`);

      //   const 时间 = { ...variables.stat_data.世界信息.时间 };
      //   let 总天数 = 时间.年 * 365 + 时间.月 * 30 + 时间.日 + 流逝时间;

      //   // 计算新的年月日
      //   时间.年 = Math.floor(总天数 / 365);
      //   总天数 %= 365;
      //   时间.月 = Math.floor(总天数 / 30);
      //   时间.日 = 总天数 % 30;

      //   // 处理日期为0的情况
      //   if (时间.日 === 0) {
      //     时间.日 = 30;
      //     时间.月 -= 1;
      //   }
      //   if (时间.月 === 0) {
      //     时间.月 = 12;
      //     时间.年 -= 1;
      //   }

      //   // 注意：流逝时间以天为单位，不影响"时"字段
      //   // 如果原时间有时字段，保持不变；如果没有，也不添加

      //   const payload = {
      //     'stat_data.世界信息.时间': 时间,
      //     'stat_data.流逝时间': 0,
      //   };

      //   log('🚀 发送 era:updateByObject 指令 (时间流逝):', payload);
      //   eventEmit('era:updateByObject', payload);

      //   await new Promise(resolve => {
      //     eventOnce('era:writeDone', resolve);
      //   });

      //   let timeString = `${时间.年}年${时间.月}月${时间.日}日`;
      //   if (时间.时 !== undefined) {
      //     timeString += `${时间.时}时`;
      //   }
      //   logSuccess(`时间更新为: ${timeString}`);
      //   console.groupEnd();

      //   // 重新读取变量以获取更新后的时间
      //   variables = await getVariables({ type: 'chat' });
      // }

      const currentTime = variables.stat_data.世界信息.时间;
      const 未发生事件 = variables.stat_data.事件系统.未发生事件 || {};

      let timeString = `${currentTime.年}年${currentTime.月}月${currentTime.日}日`;
      if (currentTime.时 !== undefined) {
        timeString += `${currentTime.时}时`;
      }
      log(`当前时间: ${timeString}`);

      // ==================== 批量检查未发生事件 ====================
      console.group('📋 批量检查未发生事件');
      const 未发生列表 = Object.keys(未发生事件);
      log(`未发生事件数: ${未发生列表.length}`);

      // 收集所有需要触发的事件（区分普通事件和登场事件）
      const eventsToStart = [];
      const debutEventsToComplete = [];
      for (const eventName of 未发生列表) {
        const triggerCondition = 未发生事件[eventName];
        const eventData = eventDefinitions[eventName];

        console.groupCollapsed(`检查事件: ${eventName}`);
        if (eventData && isTimeForEvent(currentTime, eventData, eventName)) {
          if (isDebutEvent(eventName)) {
            logSuccess(`登场事件 ${eventName} 触发条件满足，将直接完成！`);
            debutEventsToComplete.push(eventName);
          } else {
            logSuccess(`事件 ${eventName} 触发条件满足！`);
            eventsToStart.push(eventName);
          }
        } else {
          log(`事件 ${eventName} 触发条件不满足`);
        }
        console.groupEnd();
      }

      // 批量触发普通事件
      if (eventsToStart.length > 0) {
        log(`📋 发现 ${eventsToStart.length} 个普通事件需要触发:`, eventsToStart);
        await batchStartEvents(eventsToStart, eventDefinitions);
      } else {
        log('没有普通事件需要触发');
      }

      // 批量完成登场事件（直接从未发生 -> 已完成）
      if (debutEventsToComplete.length > 0) {
        log(`🎭 发现 ${debutEventsToComplete.length} 个登场事件需要直接完成:`, debutEventsToComplete);
        await batchCompleteDebutEvents(debutEventsToComplete, eventDefinitions);
      }
      console.groupEnd();

      // ⚠️ 重新读取变量，因为事件状态可能已改变
      log('🔄 重新读取变量以获取最新的事件状态...');
      const updatedVariables = await getVariables({ type: 'chat' });
      const 最新进行中事件 = updatedVariables?.stat_data?.事件系统?.进行中事件 || {};
      const 最新参与事件 = updatedVariables?.stat_data?.参与事件 || {};

      // ==================== 批量检查进行中事件 ====================
      console.group('⏳ 批量检查进行中事件');
      const 进行中列表 = Object.keys(最新进行中事件);
      log(`进行中事件数: ${进行中列表.length}`);

      // 收集所有需要结束的事件
      const eventsToEnd = [];
      for (const eventName of 进行中列表) {
        const endTime = 最新进行中事件[eventName];
        const eventData = eventDefinitions[eventName];

        console.groupCollapsed(`检查事件: ${eventName}`);
        if (eventData && isTimeAfterEventEnd(updatedVariables.stat_data.世界信息.时间, endTime)) {
          logSuccess(`事件 ${eventName} 已到结束时间！`);
          eventsToEnd.push(eventName);
        } else {
          log(`事件 ${eventName} 尚未结束`);
        }
        console.groupEnd();
      }

      // 批量结束事件
      if (eventsToEnd.length > 0) {
        log(`⏹️ 发现 ${eventsToEnd.length} 个事件需要结束:`, eventsToEnd);
        await batchEndEvents(eventsToEnd, eventDefinitions);
      } else {
        log('没有事件需要结束');
      }
      console.groupEnd();

      // ==================== 检查玩家位置触发（弹性时间+层级式地点匹配）====================
      if (进行中列表.length > 0) {
        console.group('📍 检查玩家位置触发');
        const playerLocation = updatedVariables.stat_data.user数据?.所在位置;
        log(`玩家位置: ${playerLocation}`);

        // 在 "检查玩家位置触发" group 的最开始
        const 附近传闻 = {};

        for (const eventName of 进行中列表) {
          const eventData = eventDefinitions[eventName];
          if (!eventData) continue;

          const eventLocation = eventData.事件地点;
          const alreadyJoined = eventName in 最新参与事件;

          log(`事件 ${eventName} 地点: ${eventLocation} | 已参与: ${alreadyJoined}`);

          // 简化：由于 isTimeForEvent 已包含弹性触发，事件能进入“进行中”状态本身就意味着它可见。
          // 此处无需重复计算弹性时间，只需确保事件尚未结束即可。
          // （此检查实际上在“批量检查进行中事件”部分已完成，此处为双重保险）

          // 层级式地点匹配
          if (playerLocation && eventLocation) {
            // 获取playerLocation并逐级拆分 (e.g., a/b/c -> ['a', 'a/b', 'a/b/c'])
            const locationParts = playerLocation.split('/');
            const hierarchicalPaths = [];

            for (let i = 1; i <= locationParts.length; i++) {
              hierarchicalPaths.push(locationParts.slice(0, i).join('/'));
            }

            // 调整后的引子触发逻辑
            let bestMatchPath = '';
            for (const path of hierarchicalPaths) {
              if (eventData.事件引子 && eventData.事件引子[path]) {
                bestMatchPath = path; // 持续寻找更精确的匹配
              }
            }
            // 附近传闻只显示"附近"的事件，不显示玩家当前所在位置的事件
            // 玩家所在位置的事件应该是"当前历练"，不是"传闻"
            if (bestMatchPath && !alreadyJoined && eventLocation !== playerLocation) {
              const hookText = eventData.事件引子[bestMatchPath];
              const shortName = getEventShortName(eventName);
              const time = eventData.触发条件;
              const location = eventData.事件地点;
              let timeString = `${time.年}年${time.月}月${time.日}日`;
              if (time.时 !== undefined) {
                timeString += `${time.时}时`;
              }

              // 按您建议的格式 "事件名：对应上级地点的事件引子描述[事件时间/事件地点]" 写入
              附近传闻[shortName] = `${hookText} [${timeString}/${location}]`;
              log(`发现传闻: ${shortName}`);
            }

            // 只有当playerLocation与eventData.事件地点完全相同时，才调用playerJoinsEvent
            if (eventLocation === playerLocation && !alreadyJoined) {
              logSuccess(`玩家到达事件地点: ${eventName}`);
              await playerJoinsEvent(eventName, eventData);
            }
          }
        }

        // 循环结束后，检查传闻是否有变化，仅在有变化时写入
        const existingRumors = updatedVariables?.stat_data?.附近传闻 || {};
        // 使用 JSON.stringify 进行简单的深比较，判断内容是否一致
        if (JSON.stringify(existingRumors) !== JSON.stringify(附近传闻)) {
          logSuccess('附近传闻发生变化，正在更新...');
          // 使用覆盖式写入，而不是"删除+插入"，逻辑更简洁
          const updatePayload = { 附近传闻: 附近传闻 };
          eventEmit('era:insertByObject', updatePayload);
          await new Promise(resolve => eventOnce('era:writeDone', resolve));
          logSuccess(`✅ 已更新附近传闻，现有 ${Object.keys(附近传闻).length} 条`);
        } else {
          log('附近传闻无变化，跳过写入');
        }

        console.groupEnd();
      }
    } catch (error) {
      logError('主检查函数出错:', error);
      console.trace();
    }

    console.groupEnd();
  }

  // ==================== 初始化流程 ====================
  let eventDefinitions = {};
  let isInitializing = false; // Flag to prevent re-entrancy during init
  let isInitialized = false; // 标记系统是否已成功初始化

  async function initialize() {
    // 防止重复初始化
    if (isInitializing) {
      log('⏳ 初始化正在进行中，跳过重复调用');
      return false;
    }

    isInitializing = true;
    console.log('%c===== ERA 事件系统 V5.2 初始化 =====', 'color: #00aaff; font-size: 14px; font-weight: bold;');

    // 预检查：确保 stat_data 已初始化
    try {
      const preCheckVars = await getVariables({ type: 'chat' });
      if (!preCheckVars || !preCheckVars.stat_data) {
        logWarning('⏳ stat_data 尚未初始化，等待前端创建角色后自动重试...');
        isInitializing = false;
        isInitialized = false;
        return false;
      }

      if (!preCheckVars.stat_data.世界信息 || !preCheckVars.stat_data.世界信息.时间) {
        logWarning('⏳ 世界信息或时间数据尚未初始化，等待前端创建角色后自动重试...');
        isInitializing = false;
        isInitialized = false;
        return false;
      }
    } catch (error) {
      logWarning('⏳ 读取变量失败，等待前端创建角色后自动重试...', error);
      isInitializing = false;
      isInitialized = false;
      return false;
    }

    eventDefinitions = await loadEventDefinitionsFromWorldbook();
    await initializeEventList(eventDefinitions);

    // 初始化完成后输出当前状态
    try {
      const vars = await getVariables({ type: 'chat' });

      console.groupCollapsed('🌍 当前世界信息（完整JSON）');
      console.log(JSON.parse(JSON.stringify(vars?.stat_data?.世界信息 || {})));
      console.groupEnd();

      console.groupCollapsed('🎮 当前事件系统（完整JSON）');
      console.log(JSON.parse(JSON.stringify(vars?.stat_data?.事件系统 || {})));
      console.groupEnd();

      log('✅ 初始化完成，完整数据已输出到控制台（点击展开查看）');
    } catch (error) {
      logError('输出初始状态失败:', error);
    }

    console.log('%c===== 初始化完成 =====', 'color: #00aaff; font-size: 14px; font-weight: bold;');

    // 初始化后自动执行一次事件检查
    log('🔄 初始化完成，开始自动检查事件...');
    await checkEvents(eventDefinitions);
    isInitializing = false;
    isInitialized = true; // 标记初始化成功
    log('🏁 初始化流程结束，事件监听器已激活');
    return true;
  }

  // ==================== 启动系统 ====================
  // 首次尝试初始化
  const initialSuccess = await initialize();

  // 如果首次初始化失败（stat_data 尚未就绪），设置等待前端初始化的监听
  if (!initialSuccess) {
    log('⏳ 首次初始化失败，等待前端 GameInitialized 信号...');

    // 使用 waitGlobalInitialized 等待前端完成角色创建
    waitGlobalInitialized('GameInitialized')
      .then(async signal => {
        log('🎮 收到 GameInitialized 信号:', signal);
        logSuccess('🎉 前端已完成角色创建，开始自动初始化 ERA 事件系统...');

        // 延迟一小段时间确保变量完全写入
        await new Promise(resolve => setTimeout(resolve, 500));

        const success = await initialize();
        if (success) {
          logSuccess('🎉 ERA 事件系统已随前端初始化自动启动！');
          toastr.success('ERA 事件系统已自动启动');
        } else {
          logError('ERA 事件系统初始化仍然失败，请检查变量结构');
        }
      })
      .catch(error => {
        logError('等待 GameInitialized 信号失败:', error);
      });
  }

  // 监听消息发送和聊天切换事件，自动执行检查
  eventOn(tavern_events.CHAT_CHANGED, async () => {
    log('💬 检测到聊天切换，重新初始化');
    // 重置初始化状态，允许新聊天重新初始化
    isInitialized = false;
    await initialize();
  });

  eventOn(tavern_events.MESSAGE_SENT, async () => {
    // ==================== 计数器处理逻辑 ====================
    console.group('🔢 处理后续事件线索计数器');

    try {
      // 读取stat_data.后续事件线索计数对象
      const currentVars = await getVariables({ type: 'chat' });
      const followupCounters = currentVars?.stat_data?.后续事件线索计数 || {};

      // 若不存在或为空，则直接返回
      if (Object.keys(followupCounters).length === 0) {
        console.groupEnd();
        log('📨 检测到消息发送，触发事件检查');
        checkEvents(eventDefinitions);
        return;
      }

      // 初始化updates和expiredKeys
      const updates = {};
      const expiredKeys = [];

      // 遍历计数器对象
      for (const key in followupCounters) {
        const currentCount = followupCounters[key];
        const newCount = currentCount - 1;

        // 将计数值减1
        if (newCount > 0) {
          updates[key] = newCount;
          log(`计数器 ${key}: ${currentCount} -> ${newCount}`);
        } else {
          expiredKeys.push(key);
          log(`计数器 ${key}: ${currentCount} -> 0 (将过期)`);
        }
      }

      // 发送更新指令
      if (Object.keys(updates).length > 0) {
        const updatePayload = {
          后续事件线索计数: updates,
        };

        log('🚀 发送 era:updateByObject 指令 (更新计数器):', updatePayload);
        eventEmit('era:updateByObject', updatePayload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        logSuccess(`✅ 已更新 ${Object.keys(updates).length} 个计数器`);
      }

      // 发送删除指令
      if (expiredKeys.length > 0) {
        // 构建一个delete payload，其中同时包含后续事件线索和后续事件线索计数的过期key
        const deletePayload = {
          后续事件线索: Object.fromEntries(expiredKeys.map(key => [key, {}])),
          后续事件线索计数: Object.fromEntries(expiredKeys.map(key => [key, {}])),
        };

        log('🚀 发送 era:deleteByObject 指令 (删除过期的后续事件线索):', deletePayload);
        eventEmit('era:deleteByObject', deletePayload);
        await new Promise(resolve => eventOnce('era:writeDone', resolve));
        logSuccess(`✅ 已删除 ${expiredKeys.length} 个过期的后续事件线索`);
      }
    } catch (error) {
      logError('处理后续事件线索计数器失败:', error);
    }

    console.groupEnd();

    log('📨 检测到消息发送，触发事件检查');
    checkEvents(eventDefinitions);
  });

  // 监听ERA变量写入完成事件（如果用户修改了时间）
  eventOn('era:writeDone', async detail => {
    // During initialization, skip checks triggered by our own writes.
    if (isInitializing) {
      log('📝 初始化期间，跳过 era:writeDone 触发的检查');
      return;
    }

    // 如果系统尚未初始化，尝试初始化
    if (!isInitialized) {
      log('📝 检测到ERA变量更新，系统尚未初始化，尝试初始化...');
      const success = await initialize();
      if (success) {
        logSuccess('🎉 stat_data 已就绪，ERA事件系统自动初始化成功！');
        toastr.success('ERA 事件系统已自动启动');
      }
      return;
    }

    // 仅在非API写入时触发检查，避免循环
    if (detail?.actions?.apiWrite !== true) {
      log('📝 检测到ERA变量更新，触发事件检查');
      checkEvents(eventDefinitions);
    }
  });

  console.log('%c[ERA 事件系统 V5.2] 已启动 - 批量优化版', 'color: #00ff00; font-size: 16px; font-weight: bold;');
  toastr.success('ERA 事件系统 V5.2 已启动（批量优化版）');
})();
