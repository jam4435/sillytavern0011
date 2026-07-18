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
  const {
    log,
    logError,
    logSuccess,
    logWarning,
    isDebugEnabled,
    hasParticipationEntry,
    isDebutEvent,
    formatDate,
    attachEventMetadata,
    deriveEventRuntimeDescriptor,
  } = await import('./era-utils.js');
  const {
    loadEventDefinitions,
    loadEventDefinitionsFromWorldbook,
    loadEventManifest,
    loadEventCheckpointAtOrBefore,
  } = await import('./era-event-loader.js');
  const { isTimeForEvent, isEventDiscoverable, isTimeAfterEventEnd } = await import('./era-event-checker.js');
  const {
    initializeEventList,
    batchStartEvents,
    batchCompleteDebutEvents,
    playerJoinsEvents,
    batchEndEvents,
    applyTimedParticipantEntries,
    areEventPredecessorsCompleted,
    cleanupFollowupCluesForActiveParticipation,
    cleanupInvalidParticipationEntries,
  } = await import('./era-event-operations.js');
  const {
    getRumorScopeFromEventLocation,
    isLocationWithinRumorScope,
    normalizeLocationPath,
  } = await import('./era-participant-entry.js');
  const { reconcileWorldEventArchive, syncParticipationOutcomeStates } = await import('./era-world-events.js');
  const { needsEventRuntimeStateReset, resetLegacyEventRuntimeState } = await import('./era-runtime-state.js');
  const { buildFollowupCounterPlan, createSerialTaskQueue } = await import('./era-turn-queue.js');
  const { getManifestEventCandidateKeys } = await import('./era-event-scheduler.js');
  const { writeDirectAssign, writeDirectUpdate, writeDirectDelete } = await import('./era-write-helper.js');

  const EVENT_SCRIPT_VERSION = '2026-07-18-event-performance-v3';
  globalThis.__WUXIA_EVENT_SCRIPT_VERSION__ = EVENT_SCRIPT_VERSION;
  log(`事件脚本版本: ${EVENT_SCRIPT_VERSION}`);

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

  const EVENT_SYSTEM_BUCKETS = ['未发生事件', '进行中事件', '已完成事件'];

  const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

  const isEmptyObject = value => isPlainObject(value) && Object.keys(value).length === 0;

  const eventTimeToHours = time => {
    if (!time || typeof time !== 'object') return null;
    return (Number(time.年 || 0) * 365 + Number(time.月 || 0) * 30 + Number(time.日 || 0)) * 24 + Number(time.时 || 0);
  };

  const buildManifestDefinition = entry => {
    const descriptor = deriveEventRuntimeDescriptor(entry.sourceName);
    const data = {
      事件地点: entry.location || '',
      触发条件: entry.triggerTime || {},
      事件结束时间: entry.endTime || undefined,
      事件引子: entry.intro || '',
      事件详情: entry.title ? `${entry.title}事件` : '',
      事件概要: entry.summary || '',
      参与人物: Array.isArray(entry.participants) ? [...entry.participants] : [],
      insert: {},
      update: {},
      delete: {},
      ...(entry.followup
        ? { 后续事件: { 事件名: entry.followup, 描述: '' } }
        : {}),
    };
    return attachEventMetadata(data, descriptor);
  };

  const isGeneratedProviderDebugMode = () => {
    if (globalThis.ERA_EVENT_DATA_PROVIDER === 'worldbook') return true;
    try {
      return globalThis.localStorage?.getItem('era_event_data_provider') === 'worldbook';
    } catch {
      return false;
    }
  };

  async function loadStartupEventDefinitions(statData, manifest, checkpoint = null) {
    if (!manifest) return loadEventDefinitionsFromWorldbook();

    const eventEntries = Array.isArray(manifest.events) ? manifest.events : [];
    const currentHour = eventTimeToHours(statData?.世界信息?.时间) ?? Number.MAX_SAFE_INTEGER;
    const eventSystem = statData?.事件系统 || {};
    const activeKeys = Object.keys(eventSystem.进行中事件 || {});
    const participationKeys = Object.keys(statData?.参与事件 || {});
    const pendingKeys = Object.keys(statData?.前端变量?.事件结算进度 || {});
    const knownCompletedKeys = new Set([
      ...Object.keys(eventSystem.已完成事件 || {}),
      ...(Array.isArray(checkpoint?.completedRuntimeKeys) ? checkpoint.completedRuntimeKeys : []),
    ]);
    const fullKeys = new Set([...activeKeys, ...participationKeys, ...pendingKeys]);
    const futureWindowEnd = currentHour + 10 * 24;
    const currentWindowStart = currentHour - 10 * 24;

    for (const entry of eventEntries) {
      const endHour = entry.endHour;
      const triggerHour = entry.triggerHour;
      if (
        (Number.isFinite(endHour) && endHour <= currentHour && !knownCompletedKeys.has(entry.runtimeKey)) ||
        (Number.isFinite(triggerHour) && triggerHour <= futureWindowEnd && (!Number.isFinite(endHour) || endHour >= currentWindowStart))
      ) {
        fullKeys.add(entry.runtimeKey);
      }
    }

    const lightweight = Object.fromEntries(eventEntries.map(entry => [entry.runtimeKey, buildManifestDefinition(entry)]));
    const fullDefinitions = fullKeys.size > 0 ? await loadEventDefinitions([...fullKeys]) : {};
    return Object.assign(lightweight, fullDefinitions);
  }

  const shouldPostResyncVerifyForStat = stat => {
    const eventSystem = stat?.事件系统;
    return (
      !!stat?.世界信息?.时间 &&
      !!stat?.user数据 &&
      isPlainObject(eventSystem) &&
      EVENT_SYSTEM_BUCKETS.every(key => isEmptyObject(eventSystem[key]))
    );
  };

  const isEmptyOpeningEventSystemWrite = detail => {
    if (detail?.actions?.apiWrite !== true) {
      return false;
    }

    const stat = detail?.statWithoutMeta || detail?.stat || {};
    return shouldPostResyncVerifyForStat(stat);
  };

  const normalizeEditLogPath = path =>
    String(path ?? '')
      .replace(/\[['"]([^'"[\]]+)['"]\]/g, '.$1')
      .replace(/\[(\d+)\]/g, '.$1');

  const extractEditLogOperations = detail => {
    const operations = [];
    const pushOperations = value => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (isPlainObject(item)) {
            operations.push(item);
          }
        });
        return;
      }

      if (isPlainObject(value) && typeof value.path === 'string') {
        operations.push(value);
      }
    };

    const editLogs = detail?.editLogs;
    if (Array.isArray(editLogs)) {
      pushOperations(editLogs);
      return operations;
    }

    if (isPlainObject(editLogs)) {
      Object.values(editLogs).forEach(pushOperations);
    }

    return operations;
  };

  const isEventRelevantApiWritePath = path => {
    const segments = normalizeEditLogPath(path).split('.').filter(Boolean);

    if (segments[0] === '世界信息' && segments[1] === '时间') {
      return true;
    }

    if (segments[0] === 'user数据' && segments[1] === '所在位置') {
      return true;
    }

    if (segments[0] === '角色数据' && segments[2] === '所在位置') {
      return true;
    }

    return segments[0] === '参与事件';
  };

  const getEventRelevantApiWritePaths = detail => {
    if (detail?.actions?.apiWrite !== true) {
      return [];
    }

    return extractEditLogOperations(detail)
      .map(operation => operation?.path)
      .filter(path => typeof path === 'string' && isEventRelevantApiWritePath(path));
  };

  // ==================== 主检查函数（批量优化版）====================
  async function checkEvents(eventDefinitions, reason = 'manual') {
    debugGroup(`🔄 事件系统检查周期: ${reason}`);

    if (Object.keys(eventDefinitions).length === 0) {
      logWarning('没有加载任何事件定义');
      debugGroupEnd();
      return;
    }

    try {
      let variables = await getVariables({ type: 'chat' });
      await syncParticipationOutcomeStates(eventDefinitions, variables);

      const pendingSettlementEvents = Object.keys(variables?.stat_data?.前端变量?.事件结算进度 || {}).filter(
        eventName => eventDefinitions[eventName],
      );
      if (pendingSettlementEvents.length > 0) {
        logWarning(`发现 ${pendingSettlementEvents.length} 个未完成结算，优先重试:`, pendingSettlementEvents);
        await batchEndEvents(pendingSettlementEvents, eventDefinitions);
        variables = await getVariables({ type: 'chat' });
      }

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
      const 已完成事件 = variables.stat_data.事件系统.已完成事件 || {};
      const playerLocation = normalizeLocationPath(variables.stat_data.user数据?.所在位置);

      let timeString = `${currentTime.年}年${currentTime.月}月${currentTime.日}日`;
      if (currentTime.时 !== undefined) {
        timeString += `${currentTime.时}时`;
      }
      log(`当前时间: ${timeString}`);

      // ==================== 批量检查未发生事件 ====================
      debugGroup('📋 批量检查未发生事件');
      const manifestCandidates = getManifestEventCandidateKeys(eventManifest, currentTime, variables.stat_data);
      const 未发生列表 = manifestCandidates || Object.keys(未发生事件);
      log(`未发生事件数: ${未发生列表.length}`);

      // 收集所有需要触发的事件（区分普通事件和登场事件）
      const eventsToStart = [];
      const earlyEventsToStart = [];
      const debutEventsToComplete = [];

      for (const eventName of 未发生列表) {
        const triggerCondition = 未发生事件[eventName];
        const eventData = eventDefinitions[eventName];

        debugGroupCollapsed(`检查事件: ${eventName}`);
        if (eventData && isTimeForEvent(currentTime, eventData, eventName)) {
          if (isDebutEvent(eventData)) {
            logSuccess(`登场事件 ${eventName} 触发条件满足，将直接完成！`);
            debutEventsToComplete.push(eventName);
          } else {
            logSuccess(`事件 ${eventName} 触发条件满足！`);
            eventsToStart.push(eventName);
          }
        } else if (
          eventData &&
          !isDebutEvent(eventData) &&
          isEventDiscoverable(currentTime, eventData) &&
          playerLocation === normalizeLocationPath(eventData.事件地点) &&
          areEventPredecessorsCompleted(eventName, eventDefinitions, 已完成事件)
        ) {
          logSuccess(`玩家在弹性窗口精确到达事件地点，提前启动 ${eventName}`);
          earlyEventsToStart.push(eventName);
        } else {
          log(`事件 ${eventName} 触发条件不满足`);
        }
        debugGroupEnd();
      }

      // 批量触发普通事件
      if (eventsToStart.length > 0) {
        log(`📋 发现 ${eventsToStart.length} 个普通事件需要触发:`, eventsToStart);
        await batchStartEvents(eventsToStart, eventDefinitions, { currentTime });
      } else {
        log('没有普通事件需要触发');
      }

      if (earlyEventsToStart.length > 0) {
        log(`📍 玩家到场，提前启动 ${earlyEventsToStart.length} 个事件:`, earlyEventsToStart);
        await batchStartEvents(earlyEventsToStart, eventDefinitions, {
          currentTime,
          earlyEventNames: earlyEventsToStart,
        });
        await playerJoinsEvents(earlyEventsToStart, eventDefinitions);
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

      await cleanupInvalidParticipationEntries(reason);

      // ==================== 批量检查进行中事件 ====================
      debugGroup('⏳ 批量检查进行中事件');
      const 进行中列表 = Object.keys(最新进行中事件);
      log(`进行中事件数: ${进行中列表.length}`);

      await applyTimedParticipantEntries(
        进行中列表,
        eventDefinitions,
        updatedVariables.stat_data.世界信息.时间,
        updatedVariables,
      );

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
      const 仍在进行事件 = 进行中列表.filter(eventName => !eventsToEnd.includes(eventName));
      const 最新未发生事件 = updatedVariables?.stat_data?.事件系统?.未发生事件 || {};
      const latestManifestCandidates = getManifestEventCandidateKeys(
        eventManifest,
        updatedVariables.stat_data.世界信息.时间,
        updatedVariables.stat_data,
      );
      const 可发现未发生事件 = (latestManifestCandidates || Object.keys(最新未发生事件)).filter(eventName =>
        isEventDiscoverable(updatedVariables.stat_data.世界信息.时间, eventDefinitions[eventName]),
      );
      if (仍在进行事件.length > 0 || 可发现未发生事件.length > 0) {
        await checkPlayerLocationTriggers(
          仍在进行事件,
          可发现未发生事件,
          eventDefinitions,
          updatedVariables,
          最新参与事件,
        );
      }
    } catch (error) {
      logError('主检查函数出错:', error);
      console.trace();
    }

    debugGroupEnd();
  }

  // ==================== 检查玩家位置触发 ====================
  async function checkPlayerLocationTriggers(
    进行中列表,
    可发现未发生列表,
    eventDefinitions,
    updatedVariables,
    最新参与事件,
  ) {
    debugGroup('📍 检查玩家位置触发');
    const playerLocation = normalizeLocationPath(updatedVariables.stat_data.user数据?.所在位置);
    log(`玩家位置: ${playerLocation}`);

    const 附近传闻 = {};
    const eventsToJoin = [];

    const activeEvents = new Set(进行中列表);
    const candidateEvents = [...new Set([...进行中列表, ...可发现未发生列表])];

    for (const eventName of candidateEvents) {
      const eventData = eventDefinitions[eventName];
      if (!eventData) continue;

      const eventLocation = normalizeLocationPath(eventData.事件地点);
      const hookText = typeof eventData.事件引子 === 'string' ? eventData.事件引子.trim() : '';
      const rumorScope = getRumorScopeFromEventLocation(eventLocation);
      const alreadyJoined = hasParticipationEntry(最新参与事件, eventName);

      log(`事件 ${eventName} 地点: ${eventLocation} | 已参与: ${alreadyJoined}`);

      // 层级式地点匹配
      if (playerLocation && eventLocation) {
        // 附近传闻范围固定由事件地点前两级派生；到达完整事件地点后只加入事件，不再显示传闻。
        if (hookText && isLocationWithinRumorScope(playerLocation, rumorScope) && !alreadyJoined && eventLocation !== playerLocation) {
          const time = eventData.触发条件;
          const location = eventData.事件地点;
          const timeString = formatDate(time);

          附近传闻[eventName] = `${hookText} [${timeString}/${location}]`;
          log(`发现传闻: ${eventName}`);
        }

        // 只有当playerLocation与eventData.事件地点完全相同时，才调用playerJoinsEvent
        if (activeEvents.has(eventName) && eventLocation === playerLocation && !alreadyJoined) {
          logSuccess(`玩家到达事件地点: ${eventName}`);
          eventsToJoin.push(eventName);
        }
      }
    }

    if (eventsToJoin.length > 0) {
      await playerJoinsEvents(eventsToJoin, eventDefinitions);
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
  async function processFollowupCounters({ decrementCounters = true, reason = 'manual', eligibleCounterKeys } = {}) {
    debugGroup('🔢 处理后续事件线索计数器');

    try {
      await cleanupFollowupCluesForActiveParticipation(eventDefinitions, reason);

      if (!decrementCounters) {
        debugGroupEnd();
        return;
      }

      const currentVars = await getVariables({ type: 'chat' });
      const followupCounters = currentVars?.stat_data?.后续事件线索计数 || {};

      if (Object.keys(followupCounters).length === 0) {
        debugGroupEnd();
        return;
      }

      const { updates, expiredKeys, retainedKeys } = buildFollowupCounterPlan(
        followupCounters,
        eligibleCounterKeys,
      );
      retainedKeys.forEach(key => log(`计数器 ${key} 为本轮新建，保持 ${followupCounters[key]}`));

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
  let eventManifest = null;
  let isInitializing = false;
  let isInitialized = false;
  let isCheckingEvents = false;
  let pendingCheckReason = null;
  let checkEventsTimer = null;
  let lastSuccessfulInitializationAt = 0;
  // 线索倒计时按 messageId 去重：同一助手楼层（含 regenerate 产生的同 messageId 新 swipe）
  // 只扣一次，避免重复扣减。切换聊天时重置。
  let lastCountedMessageId = null;
  let pendingTurnCounterKeys = null;

  const enqueueSerialTask = createSerialTaskQueue(error => {
    logError('串行事件任务失败', error);
  });

  function enqueueEventWork(reason, work) {
    return enqueueSerialTask(async () => {
      log(`🧵 开始串行事件任务: ${reason}`);
      return work();
    });
  }

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
      void enqueueEventWork(`check:${reasonToRun}`, () => runScheduledCheck(reasonToRun));
    }, 100);
  }

  async function initialize() {
    if (isInitializing) {
      log('⏳ 初始化正在进行中，跳过重复调用');
      return false;
    }

    isInitializing = true;
    isInitialized = false;
    if (isDebugEnabled()) {
      console.log('%c===== ERA 事件系统 V5.2 初始化 =====', 'color: #00aaff; font-size: 14px; font-weight: bold;');
    }

    try {
      // 预检查：确保 stat_data 已初始化
      let preCheckVars = await getVariables({ type: 'chat' });
      if (!preCheckVars || !preCheckVars.stat_data) {
        logWarning('⏳ stat_data 尚未初始化，等待前端创建角色后自动重试...');
        return false;
      }

      if (!preCheckVars.stat_data.世界信息 || !preCheckVars.stat_data.世界信息.时间) {
        logWarning('⏳ 世界信息或时间数据尚未初始化，等待前端创建角色后自动重试...');
        return false;
      }

      if (needsEventRuntimeStateReset(preCheckVars.stat_data)) {
        const resetSucceeded = await resetLegacyEventRuntimeState(preCheckVars.stat_data);
        if (!resetSucceeded) {
          return false;
        }
        preCheckVars = await getVariables({ type: 'chat' });
      }

      const manifest = isGeneratedProviderDebugMode() ? null : await loadEventManifest();
      const statForCheckpoint = preCheckVars.stat_data;
      const eventSystemForCheckpoint = statForCheckpoint.事件系统 || {};
      const canApplyOpeningCheckpoint =
        !!manifest &&
        EVENT_SYSTEM_BUCKETS.every(key => isEmptyObject(eventSystemForCheckpoint[key])) &&
        isEmptyObject(statForCheckpoint.参与事件 || {}) &&
        isEmptyObject(statForCheckpoint.世界事件 || {}) &&
        isEmptyObject(statForCheckpoint.前端变量?.事件结算进度 || {}) &&
        Object.keys(statForCheckpoint.角色数据 || {}).length === 0;
      const checkpoint = canApplyOpeningCheckpoint
        ? await loadEventCheckpointAtOrBefore(statForCheckpoint.世界信息.时间)
        : null;
      eventManifest = manifest;
      eventDefinitions = await loadStartupEventDefinitions(preCheckVars.stat_data, manifest, checkpoint);
      await initializeEventList(eventDefinitions, {
        checkpoint,
        applyCheckpoint: canApplyOpeningCheckpoint,
        sparseFuture: Boolean(manifest),
        manifestHash: manifest?.contentHash || '',
      });
      await reconcileWorldEventArchive(eventDefinitions);

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
      isInitialized = true;
      lastSuccessfulInitializationAt = Date.now();
      log('🏁 初始化流程结束，事件监听器已激活');
      return true;
    } catch (error) {
      isInitialized = false;
      logError('❌ ERA 事件系统初始化失败（变量尚未就绪或初始化步骤抛错）:', error);
      return false;
    } finally {
      isInitializing = false;
      if (pendingFrontendInitialization && !frontendInitializationScheduled) {
        const pending = pendingFrontendInitialization;
        pendingFrontendInitialization = null;
        scheduleFrontendInitialization(pending.reason, pending.signal);
      }
    }
  }

  let frontendInitializationScheduled = false;
  let pendingFrontendInitialization = null;

  // GameInitialized 信号在变量回读确认后才会发送，因此这里无需再人为等待 500ms。
  // 用微任务合并同一轮中 waitGlobalInitialized 与 eventOn 的重复通知。
  function scheduleFrontendInitialization(reason, signal) {
    pendingFrontendInitialization = { reason, signal };
    if (frontendInitializationScheduled) {
      log(`🧩 已有待执行前端开局初始化，合并请求: ${reason}`);
      return;
    }

    frontendInitializationScheduled = true;
    queueMicrotask(async () => {
      frontendInitializationScheduled = false;
      const request = pendingFrontendInitialization;
      pendingFrontendInitialization = null;
      if (!request) return;

      const { reason: requestReason, signal: requestSignal } = request;
      const signalTimestamp = typeof requestSignal?.timestamp === 'number' ? requestSignal.timestamp : 0;

      if (isInitializing) {
        // 初始化的 finally 会重新调度这个请求，避免定时器自旋或丢失开局信号。
        pendingFrontendInitialization = request;
        log(`🎮 初始化仍在进行，等待当前流程结束后处理前端开局初始化信号: ${requestReason}`, requestSignal);
        return;
      }

      if (signalTimestamp > 0 && isInitialized && lastSuccessfulInitializationAt >= signalTimestamp) {
        log(`🎮 前端开局初始化信号已被最近一次初始化覆盖，跳过重复初始化: ${requestReason}`, requestSignal);
        return;
      }

      log(`🎮 检测到前端开局初始化信号，重新初始化事件系统: ${requestReason}`, requestSignal);
      const success = await initialize();
      if (success) {
        logSuccess('🎉 ERA 事件系统已随前端开局重新初始化！');
        toastr.success('ERA 事件系统已自动初始化');
      } else {
        logError('ERA 事件系统重新初始化失败，请检查变量结构或世界书事件条目');
      }
    });
  }

  // ==================== 启动系统 ====================
  const initialSuccess = await initialize();

  // 如果首次初始化失败，设置等待前端初始化的监听
  if (!initialSuccess) {
    log('⏳ 首次初始化失败，等待前端 GameInitialized 信号...');

    waitGlobalInitialized('GameInitialized')
      .then(signal => {
        log('🎮 收到 GameInitialized 信号:', signal);
        logSuccess('🎉 前端已完成角色创建，开始自动初始化 ERA 事件系统...');
        scheduleFrontendInitialization('waitGlobalInitialized', signal);
      })
      .catch(error => {
        logError('等待 GameInitialized 信号失败:', error);
      });
  }

  // ==================== 事件监听器 ====================
  eventOn(tavern_events.CHAT_CHANGED, async () => {
    log('💬 检测到聊天切换，重新初始化');
    isInitialized = false;
    lastCountedMessageId = null;
    pendingTurnCounterKeys = null;
    await initialize();
  });

  eventOn('GameInitialized', signal => {
    scheduleFrontendInitialization('GameInitialized-event', signal);
  });

  // MESSAGE_SENT 只做事件检查，不再扣减线索倒计时。
  // 扣减改由 wuxia:turn-completed 在回合真正成功完成后触发（见下方监听器），
  // 避免发送后生成失败/取消/报错/未形成助手回合时仍被扣一次。
  eventOn(tavern_events.MESSAGE_SENT, async () => {
    log('📨 检测到消息发送，触发事件检查');
    const turnStartVariables = await getVariables({ type: 'chat' });
    pendingTurnCounterKeys = new Set(
      Object.keys(turnStartVariables?.stat_data?.后续事件线索计数 || {}),
    );
    scheduleCheckEvents('message-sent');
  });

  // 武侠前端在回合成功完成（助手消息已生成 + 必要 ERA 写入已确认 + 未取消/报错）后发出此事件。
  // 仅在此处扣减线索倒计时，确保只在真实完成一个 AI 回合时计数。
  eventOn('wuxia:turn-completed', async ({ messageId, chatId } = {}) => {
    if (!Number.isInteger(messageId)) {
      log('⚠️ wuxia:turn-completed 缺少有效 messageId，跳过扣减');
      return;
    }
    if (messageId === lastCountedMessageId) {
      log(`🔁 回合已完成过 (messageId=${messageId})，跳过重复扣减`);
      return;
    }
    lastCountedMessageId = messageId;
    const eligibleCounterKeys = pendingTurnCounterKeys;
    pendingTurnCounterKeys = null;
    log(`✅ 检测到武侠回合成功完成 (messageId=${messageId}, chatId=${chatId})，串行结算事件与线索倒计时`);
    await enqueueEventWork(`turn-completed:${messageId}`, async () => {
      await runScheduledCheck('wuxia-turn-completed');
      await processFollowupCounters({
        decrementCounters: true,
        reason: 'wuxia-turn-completed',
        eligibleCounterKeys,
      });
    });
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

    if (isEmptyOpeningEventSystemWrite(detail)) {
      log('📝 检测到新开局空事件系统写入，重新初始化事件列表');
      scheduleFrontendInitialization('opening-empty-event-system-api-write', detail);
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

    await processFollowupCounters({ decrementCounters: false, reason: 'era-write-done' });

    const eventRelevantApiWritePaths = getEventRelevantApiWritePaths(detail);

    if (detail?.actions?.apiWrite !== true) {
      log('📝 检测到ERA变量更新，触发事件检查');
      scheduleCheckEvents('era-write-done');
      return;
    }

    if (eventRelevantApiWritePaths.length > 0) {
      log(`📝 检测到事件相关 API 写入，触发事件检查: ${eventRelevantApiWritePaths.join(', ')}`);
      scheduleCheckEvents(`era-write-done-api:${eventRelevantApiWritePaths.join('|')}`);
      return;
    }

    log('📝 检测到非事件相关 API 写入，跳过事件检查');
  });

  if (isDebugEnabled()) {
    console.log('%c[ERA 事件系统 V5.2] 已启动 - 模块化重构版', 'color: #00ff00; font-size: 16px; font-weight: bold;');
    toastr.success('ERA 事件系统 V5.2 已启动（模块化重构版）');
  }
})();
