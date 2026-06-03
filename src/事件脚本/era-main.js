// ================================================================================
// ERA 事件处理系统 V5.2 - 主脚本 (模块化重构版)
// ================================================================================
// 优化内容：
// 1. 模块化架构 - 按功能拆分为独立模块
// 2. 批量操作优化 - 批量初始化/触发/结束事件
// 3. 智能初始化 - 检测已过期事件直接批量结算
// 4. 性能提升 - 50个事件初始化从8秒降至0.3秒
// ================================================================================

(async function () {
  // ==================== 导入模块 ====================
  const { log, logError, logSuccess, logWarning, isDebugEnabled } = await import('./era-utils.js');
  const { loadEventDefinitionsFromWorldbook } = await import('./era-event-loader.js');
  const { isTimeForEvent, isTimeAfterEventEnd } = await import('./era-event-checker.js');
  const {
    initializeEventList,
    batchStartEvents,
    batchCompleteDebutEvents,
    playerJoinsEvent,
    batchEndEvents,
  } = await import('./era-event-operations.js');
  const { writeDirectAssign, writeDirectUpdate, writeDirectDelete } = await import('./era-write-helper.js');

  const debugGroup = (...args) => {
    if (isDebugEnabled()) {
      console.group(...args);
    }
  };

  const debugGroupCollapsed = (...args) => {
    if (isDebugEnabled()) {
      console.groupCollapsed(...args);
    }
  };

  const debugGroupEnd = () => {
    if (isDebugEnabled()) {
      console.groupEnd();
    }
  };

  const isResyncOnlyWriteDone = detail => {
    const actions = detail?.actions || {};
    return actions.resync === true && !actions.apply && !actions.rollback && !actions.apiWrite;
  };

  const isDirectChatWriteDone = detail => detail?.actions?.directChatWrite === true;

  // ==================== 主检查函数（批量优化版）====================
  async function checkEvents(eventDefinitions, reason = 'manual') {
    debugGroup(`🔄 事件系统检查周期: ${reason}`);

    if (Object.keys(eventDefinitions).length === 0) {
      logWarning('没有加载任何事件定义');
      debugGroupEnd();
      return;
    }

    try {
      const variables = await getVariables({ type: 'chat' });

      // 输出完整的世界信息和事件系统
      if (isDebugEnabled()) {
        debugGroupCollapsed('🌍 当前世界信息（完整）');
        console.log(JSON.parse(JSON.stringify(variables?.stat_data?.世界信息 || {})));
        debugGroupEnd();

        debugGroupCollapsed('🎮 当前事件系统（完整）');
        console.log(JSON.parse(JSON.stringify(variables?.stat_data?.事件系统 || {})));
        debugGroupEnd();
      }

      const currentTime = variables.stat_data.世界信息.时间;
      const 未发生事件 = variables.stat_data.事件系统.未发生事件 || {};

      let timeString = `${currentTime.年}年${currentTime.月}月${currentTime.日}日`;
      if (currentTime.时 !== undefined) {
        timeString += `${currentTime.时}时`;
      }
      log(`当前时间: ${timeString}`);

      // ==================== 批量检查未发生事件 ====================
      debugGroup('📋 批量检查未发生事件');
      const 未发生列表 = Object.keys(未发生事件);
      log(`未发生事件数: ${未发生列表.length}`);

      // 收集所有需要触发的事件（区分普通事件和登场事件）
      const eventsToStart = [];
      const debutEventsToComplete = [];

      for (const eventName of 未发生列表) {
        const triggerCondition = 未发生事件[eventName];
        const eventData = eventDefinitions[eventName];

        debugGroupCollapsed(`检查事件: ${eventName}`);
        if (eventData && isTimeForEvent(currentTime, eventData, eventName)) {
          const { isDebutEvent } = await import('./era-utils.js');
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
        debugGroupEnd();
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
      debugGroupEnd();

      // ⚠️ 重新读取变量，因为事件状态可能已改变
      log('🔄 重新读取变量以获取最新的事件状态...');
      const updatedVariables = await getVariables({ type: 'chat' });
      const 最新进行中事件 = updatedVariables?.stat_data?.事件系统?.进行中事件 || {};
      const 最新参与事件 = updatedVariables?.stat_data?.参与事件 || {};

      // ==================== 批量检查进行中事件 ====================
      debugGroup('⏳ 批量检查进行中事件');
      const 进行中列表 = Object.keys(最新进行中事件);
      log(`进行中事件数: ${进行中列表.length}`);

      // 收集所有需要结束的事件
      const eventsToEnd = [];
      for (const eventName of 进行中列表) {
        const endTime = 最新进行中事件[eventName];
        const eventData = eventDefinitions[eventName];

        debugGroupCollapsed(`检查事件: ${eventName}`);
        if (eventData && isTimeAfterEventEnd(updatedVariables.stat_data.世界信息.时间, endTime)) {
          logSuccess(`事件 ${eventName} 已到结束时间！`);
          eventsToEnd.push(eventName);
        } else {
          log(`事件 ${eventName} 尚未结束`);
        }
        debugGroupEnd();
      }

      // 批量结束事件
      if (eventsToEnd.length > 0) {
        log(`⏹️ 发现 ${eventsToEnd.length} 个事件需要结束:`, eventsToEnd);
        await batchEndEvents(eventsToEnd, eventDefinitions);
      } else {
        log('没有事件需要结束');
      }
      debugGroupEnd();

      // ==================== 检查玩家位置触发（弹性时间+层级式地点匹配）====================
      if (进行中列表.length > 0) {
        await checkPlayerLocationTriggers(进行中列表, eventDefinitions, updatedVariables, 最新参与事件);
      }
    } catch (error) {
      logError('主检查函数出错:', error);
      console.trace();
    }

    debugGroupEnd();
  }

  // ==================== 检查玩家位置触发 ====================
  async function checkPlayerLocationTriggers(进行中列表, eventDefinitions, updatedVariables, 最新参与事件) {
    debugGroup('📍 检查玩家位置触发');
    const { getEventShortName } = await import('./era-utils.js');
    const playerLocation = updatedVariables.stat_data.user数据?.所在位置;
    log(`玩家位置: ${playerLocation}`);

    const 附近传闻 = {};

    for (const eventName of 进行中列表) {
      const eventData = eventDefinitions[eventName];
      if (!eventData) continue;

      const eventLocation = eventData.事件地点;
      const alreadyJoined = eventName in 最新参与事件;

      log(`事件 ${eventName} 地点: ${eventLocation} | 已参与: ${alreadyJoined}`);

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
        if (bestMatchPath && !alreadyJoined && eventLocation !== playerLocation) {
          const hookText = eventData.事件引子[bestMatchPath];
          const shortName = getEventShortName(eventName);
          const time = eventData.触发条件;
          const location = eventData.事件地点;
          const { formatDate } = await import('./era-utils.js');
          const timeString = formatDate(time);

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
    if (JSON.stringify(existingRumors) !== JSON.stringify(附近传闻)) {
      logSuccess('附近传闻发生变化，正在更新...');
      const updatePayload = { 附近传闻: 附近传闻 };
      await writeDirectAssign(updatePayload, 'update-nearby-rumors');
      logSuccess(`✅ 已更新附近传闻，现有 ${Object.keys(附近传闻).length} 条`);
    } else {
      log('附近传闻无变化，跳过写入');
    }

    debugGroupEnd();
  }

  // ==================== 处理后续事件线索计数器 ====================
  async function processFollowupCounters() {
    debugGroup('🔢 处理后续事件线索计数器');

    try {
      const currentVars = await getVariables({ type: 'chat' });
      const followupCounters = currentVars?.stat_data?.后续事件线索计数 || {};

      if (Object.keys(followupCounters).length === 0) {
        debugGroupEnd();
        return;
      }

      const updates = {};
      const expiredKeys = [];

      for (const key in followupCounters) {
        const currentCount = followupCounters[key];
        const newCount = currentCount - 1;

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
        const updatePayload = { 后续事件线索计数: updates };
        log('🚀 发送 era:updateByObject 指令 (更新计数器):', updatePayload);
        await writeDirectUpdate(updatePayload, 'update-followup-counters');
        logSuccess(`✅ 已更新 ${Object.keys(updates).length} 个计数器`);
      }

      // 发送删除指令
      if (expiredKeys.length > 0) {
        const deletePayload = {
          后续事件线索: Object.fromEntries(expiredKeys.map(key => [key, {}])),
          后续事件线索计数: Object.fromEntries(expiredKeys.map(key => [key, {}])),
        };

        log('🚀 发送 era:deleteByObject 指令 (删除过期的后续事件线索):', deletePayload);
        await writeDirectDelete(deletePayload, 'delete-expired-followups');
        logSuccess(`✅ 已删除 ${expiredKeys.length} 个过期的后续事件线索`);
      }
    } catch (error) {
      logError('处理后续事件线索计数器失败:', error);
    }

    debugGroupEnd();
  }

  // ==================== 初始化流程 ====================
  let eventDefinitions = {};
  let isInitializing = false;
  let isInitialized = false;
  let isCheckingEvents = false;
  let pendingCheckReason = null;
  let checkEventsTimer = null;

  async function runScheduledCheck(reason) {
    if (isCheckingEvents) {
      pendingCheckReason = reason;
      log(`🔁 事件检查正在进行，合并请求: ${reason}`);
      return;
    }

    isCheckingEvents = true;
    let currentReason = reason;
    try {
      do {
        pendingCheckReason = null;
        await checkEvents(eventDefinitions, currentReason);
        currentReason = pendingCheckReason;
      } while (currentReason);
    } finally {
      isCheckingEvents = false;
    }
  }

  function scheduleCheckEvents(reason) {
    pendingCheckReason = reason;
    if (checkEventsTimer) {
      log(`🧩 已有待执行事件检查，合并请求: ${reason}`);
      return;
    }

    checkEventsTimer = setTimeout(() => {
      checkEventsTimer = null;
      const reasonToRun = pendingCheckReason || reason;
      pendingCheckReason = null;
      void runScheduledCheck(reasonToRun);
    }, 100);
  }

  async function initialize() {
    if (isInitializing) {
      log('⏳ 初始化正在进行中，跳过重复调用');
      return false;
    }

    isInitializing = true;
    if (isDebugEnabled()) {
      console.log('%c===== ERA 事件系统 V5.2 初始化 =====', 'color: #00aaff; font-size: 14px; font-weight: bold;');
    }

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

      if (isDebugEnabled()) {
        debugGroupCollapsed('🌍 当前世界信息（完整JSON）');
        console.log(JSON.parse(JSON.stringify(vars?.stat_data?.世界信息 || {})));
        debugGroupEnd();

        debugGroupCollapsed('🎮 当前事件系统（完整JSON）');
        console.log(JSON.parse(JSON.stringify(vars?.stat_data?.事件系统 || {})));
        debugGroupEnd();
      }

      log('✅ 初始化完成，完整数据已输出到控制台（点击展开查看）');
    } catch (error) {
      logError('输出初始状态失败:', error);
    }

    if (isDebugEnabled()) {
      console.log('%c===== 初始化完成 =====', 'color: #00aaff; font-size: 14px; font-weight: bold;');
    }

    // 初始化后自动执行一次事件检查
    log('🔄 初始化完成，开始自动检查事件...');
    await checkEvents(eventDefinitions, 'initialize');
    isInitializing = false;
    isInitialized = true;
    log('🏁 初始化流程结束，事件监听器已激活');
    return true;
  }

  // ==================== 启动系统 ====================
  const initialSuccess = await initialize();

  // 如果首次初始化失败，设置等待前端初始化的监听
  if (!initialSuccess) {
    log('⏳ 首次初始化失败，等待前端 GameInitialized 信号...');

    waitGlobalInitialized('GameInitialized')
      .then(async signal => {
        log('🎮 收到 GameInitialized 信号:', signal);
        logSuccess('🎉 前端已完成角色创建，开始自动初始化 ERA 事件系统...');

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

  // ==================== 事件监听器 ====================
  eventOn(tavern_events.CHAT_CHANGED, async () => {
    log('💬 检测到聊天切换，重新初始化');
    isInitialized = false;
    await initialize();
  });

  eventOn(tavern_events.MESSAGE_SENT, async () => {
    await processFollowupCounters();
    log('📨 检测到消息发送，触发事件检查');
    scheduleCheckEvents('message-sent');
  });

  eventOn('era:writeDone', async detail => {
    if (isInitializing) {
      log('📝 初始化期间，跳过 era:writeDone 触发的检查');
      return;
    }

    if (!isInitialized) {
      log('📝 检测到ERA变量更新，系统尚未初始化，尝试初始化...');
      const success = await initialize();
      if (success) {
        logSuccess('🎉 stat_data 已就绪，ERA事件系统自动初始化成功！');
        toastr.success('ERA 事件系统已自动启动');
      }
      return;
    }

    if (isResyncOnlyWriteDone(detail)) {
      log('📝 检测到 ERA 纯同步 writeDone，跳过事件检查');
      return;
    }

    if (isDirectChatWriteDone(detail)) {
      log('📝 检测到事件脚本直接变量写入，跳过事件检查');
      return;
    }

    if (detail?.actions?.apiWrite !== true) {
      log('📝 检测到ERA变量更新，触发事件检查');
      scheduleCheckEvents('era-write-done');
    }
  });

  if (isDebugEnabled()) {
    console.log('%c[ERA 事件系统 V5.2] 已启动 - 模块化重构版', 'color: #00ff00; font-size: 16px; font-weight: bold;');
    toastr.success('ERA 事件系统 V5.2 已启动（模块化重构版）');
  }
})();
