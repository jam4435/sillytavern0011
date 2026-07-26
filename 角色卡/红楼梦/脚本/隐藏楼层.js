  $(() => {
    const SYNC_LATEST_MESSAGE_SHELL_EVENT = 'wuxia:sync-latest-message-shell';
    const WUXIA_TURN_LIFECYCLE_EVENT = 'wuxia:turn-lifecycle';
    const WUXIA_TURN_LOCK_ACK_EVENT = 'wuxia:turn-lock-ack';
    const WUXIA_TURN_RESPONSE_DELIVERED_EVENT = 'wuxia:turn-response-delivered';
    const TURN_LOCK_TIMEOUT_MS = 8 * 60 * 1000;
    const TURN_RESPONSE_DELIVERY_TIMEOUT_MS = 30 * 1000;
    const BLACK_BOX_STORAGE_KEY = 'wuxia_iframe_lifecycle_black_box_v1';
    const PENDING_RELOAD_REASON_STORAGE_KEY = 'wuxia_iframe_pending_reload_reason_v1';
    const MAX_BLACK_BOX_ENTRIES = 240;
    const PENDING_RELOAD_REASON_MAX_AGE_MS = 30 * 1000;
    const COLLAPSE_MAX_WAIT_MS = 2000;
    const URGENT_COLLAPSE_REASONS = new Set([
      'turn-finish-event',
      'turn-lock-timeout',
      'turn-response-delivered',
      'turn-response-delivery-timeout',
      'explicit-latest-message-shell-sync',
    ]);
    const SCRIPT_RUNTIME_ID = `hidden-floor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let collapseTimer = null;
    let collapseTimerPriority = 'normal';
    let collapseFirstScheduledAt = null;
    let collapseLastScheduledAt = null;
    let collapseResetCount = 0;
    let collapseTriggerReasonCounts = {};
    let chatElement = null;
    let chatObserver = null;
    let shellObserver = null;
    let syncInProgress = false;
    let activeTurnRoundId = null;
    let pendingMessageId = null;
    let turnLockTimer = null;
    let pendingResponseDeliveryRoundId = null;
    let pendingResponseDeliveryMessageId = null;
    let responseDeliveryTimer = null;

    function cloneDetails(details) {
      try {
        return JSON.parse(JSON.stringify(details || {}));
      } catch {
        return { serializationError: 'details 无法序列化' };
      }
    }

    function readBlackBox() {
      try {
        const stored = localStorage.getItem(BLACK_BOX_STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === 'object') : [];
      } catch {
        return [];
      }
    }

    function recordBlackBox(event, details = {}) {
      try {
        const entry = {
          id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: Date.now(),
          source: 'hidden-floor',
          event,
          runtimeId: SCRIPT_RUNTIME_ID,
          details: cloneDetails(details),
        };
        const entries = [...readBlackBox(), entry].slice(-MAX_BLACK_BOX_ENTRIES);
        localStorage.setItem(BLACK_BOX_STORAGE_KEY, JSON.stringify(entries));
        return entry;
      } catch {
        return null;
      }
    }

    function readPendingReloadReason() {
      try {
        const stored = localStorage.getItem(PENDING_RELOAD_REASON_STORAGE_KEY);
        if (!stored) return null;
        const marker = JSON.parse(stored);
        if (
          !marker ||
          typeof marker.id !== 'string' ||
          typeof marker.timestamp !== 'number' ||
          typeof marker.reason !== 'string'
        ) {
          return null;
        }
        if (Date.now() - marker.timestamp > PENDING_RELOAD_REASON_MAX_AGE_MS) {
          localStorage.removeItem(PENDING_RELOAD_REASON_STORAGE_KEY);
          return null;
        }
        return marker;
      } catch {
        return null;
      }
    }

    function markPendingReloadReason(reason, details = {}) {
      try {
        const marker = {
          id: `reload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: Date.now(),
          source: 'hidden-floor',
          reason,
          details: cloneDetails(details),
        };
        localStorage.setItem(PENDING_RELOAD_REASON_STORAGE_KEY, JSON.stringify(marker));
        recordBlackBox('iframe-reload-requested', { markerId: marker.id, reason, ...details });
        return marker;
      } catch {
        return null;
      }
    }

    function clearPendingReloadReason(markerId) {
      try {
        const current = readPendingReloadReason();
        if (markerId && current && current.id !== markerId) return;
        localStorage.removeItem(PENDING_RELOAD_REASON_STORAGE_KEY);
      } catch {
        // 黑匣子不得影响楼层显示流程。
      }
    }

    function normalizeMessageId(value) {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const messageId = Number(value);
      return Number.isInteger(messageId) && messageId >= 0 ? messageId : null;
    }

    function clearTurnLockTimer() {
      if (turnLockTimer) {
        clearTimeout(turnLockTimer);
        turnLockTimer = null;
      }
    }

    function clearResponseDeliveryTimer() {
      if (responseDeliveryTimer) {
        clearTimeout(responseDeliveryTimer);
        responseDeliveryTimer = null;
      }
    }

    function finishDeferredResponseDelivery(roundId, messageId, reason) {
      if (
        pendingResponseDeliveryRoundId &&
        roundId &&
        pendingResponseDeliveryRoundId !== roundId
      ) {
        recordBlackBox('turn-response-delivery-ignored', {
          expectedRoundId: pendingResponseDeliveryRoundId,
          receivedRoundId: roundId,
          reason: 'round-id-mismatch',
        });
        return;
      }

      const completedRoundId = pendingResponseDeliveryRoundId || roundId || null;
      const latestMessageId = normalizeMessageId(messageId) ?? pendingResponseDeliveryMessageId;
      pendingResponseDeliveryRoundId = null;
      pendingResponseDeliveryMessageId = null;
      clearResponseDeliveryTimer();
      recordBlackBox('turn-response-delivery-released', {
        roundId: completedRoundId,
        messageId: latestMessageId,
        reason,
      });
      scheduleCollapse(0, latestMessageId, reason);
    }

    function unlockTurn(expectedRoundId, messageId, reason = 'turn-finished', waitForResponseDelivery = false) {
      if (expectedRoundId && activeTurnRoundId && expectedRoundId !== activeTurnRoundId) {
        recordBlackBox('turn-unlock-ignored', {
          expectedRoundId,
          activeTurnRoundId,
          reason: 'round-id-mismatch',
        });
        return;
      }

      const releasedRoundId = activeTurnRoundId || expectedRoundId || null;
      const latestPendingMessageId = normalizeMessageId(messageId) ?? pendingMessageId;
      recordBlackBox('turn-lock-released', {
        roundId: releasedRoundId,
        messageId: latestPendingMessageId,
        reason,
        waitForResponseDelivery,
      });
      activeTurnRoundId = null;
      pendingMessageId = null;
      clearTurnLockTimer();
      if (waitForResponseDelivery && releasedRoundId) {
        pendingResponseDeliveryRoundId = releasedRoundId;
        pendingResponseDeliveryMessageId = latestPendingMessageId;
        clearResponseDeliveryTimer();
        responseDeliveryTimer = setTimeout(() => {
          recordBlackBox('turn-response-delivery-timeout', {
            roundId: pendingResponseDeliveryRoundId,
            messageId: pendingResponseDeliveryMessageId,
            timeoutMs: TURN_RESPONSE_DELIVERY_TIMEOUT_MS,
          });
          finishDeferredResponseDelivery(
            pendingResponseDeliveryRoundId,
            pendingResponseDeliveryMessageId,
            'turn-response-delivery-timeout',
          );
        }, TURN_RESPONSE_DELIVERY_TIMEOUT_MS);
        recordBlackBox('turn-refresh-deferred-for-response-delivery', {
          roundId: releasedRoundId,
          messageId: latestPendingMessageId,
        });
        return;
      }
      scheduleCollapse(0, latestPendingMessageId, reason);
    }

    function lockTurn(roundId, chatId) {
      const previousRoundId = activeTurnRoundId;
      activeTurnRoundId = typeof roundId === 'string' && roundId ? roundId : `turn-${Date.now()}`;
      recordBlackBox('turn-lock-acquired', {
        roundId: activeTurnRoundId,
        previousRoundId,
        chatId,
      });
      clearTurnLockTimer();
      turnLockTimer = setTimeout(() => {
        console.warn('[隐藏楼层] 武侠回合锁超时，自动恢复最新楼层同步。', activeTurnRoundId);
        recordBlackBox('turn-lock-timeout', { roundId: activeTurnRoundId });
        unlockTurn(activeTurnRoundId, null, 'turn-lock-timeout');
      }, TURN_LOCK_TIMEOUT_MS);
      return activeTurnRoundId;
    }

    function getMessageElement($messages, messageId) {
      return $messages.filter(`[mesid="${messageId}"]`).last();
    }

    async function syncAndCollapseToLastMessage(expectedMessageId, triggerReason = 'unspecified') {
      observeChat();

      if (activeTurnRoundId || pendingResponseDeliveryRoundId) {
        const normalizedMessageId = normalizeMessageId(expectedMessageId);
        const waitingForResponseDelivery = !activeTurnRoundId && Boolean(pendingResponseDeliveryRoundId);
        const previousPendingMessageId = waitingForResponseDelivery
          ? pendingResponseDeliveryMessageId
          : pendingMessageId;
        if (normalizedMessageId !== null && waitingForResponseDelivery) {
          pendingResponseDeliveryMessageId = normalizedMessageId;
        } else if (normalizedMessageId !== null) {
          pendingMessageId = normalizedMessageId;
        }
        const latestPendingMessageId = waitingForResponseDelivery
          ? pendingResponseDeliveryMessageId
          : pendingMessageId;
        if (latestPendingMessageId !== previousPendingMessageId) {
          recordBlackBox('shell-sync-deferred-by-turn-lock', {
            triggerReason,
            roundId: activeTurnRoundId || pendingResponseDeliveryRoundId,
            expectedMessageId: normalizedMessageId,
            waitingForResponseDelivery,
          });
        }
        return;
      }

      // 编辑框打开时不要删 DOM，否则会打断酒馆的编辑控件。
      if ($('#curEditTextarea').length > 0) {
        scheduleCollapse(250, expectedMessageId, 'editor-open-retry');
        return;
      }

      const latestMessageId = getLastMessageId();
      if (Number.isFinite(expectedMessageId) && expectedMessageId !== latestMessageId) {
        return;
      }

      let $messages = $('#chat > .mes');
      if ($messages.length === 0) {
        return;
      }

      let $latest = getMessageElement($messages, latestMessageId);
      if ($latest.length === 0) {
        if (syncInProgress) {
          return;
        }

        // refresh:none 创建的新消息不会生成宿主 DOM。复用当前伪同层外壳时，必须同步
        // mesid 和楼层标题，酒馆的编辑按钮才会定位到真实最新消息。
        const $shell =
          $messages.filter('.last_mes').last().length > 0 ? $messages.filter('.last_mes').last() : $messages.last();
        if ($shell.length === 0) {
          return;
        }

        const previousMessageId = $shell.attr('mesid');
        const previousMessageIdLabel = $shell.find('.mesIDDisplay').text();
        const reloadMarker = markPendingReloadReason(`refreshOneMessage:${triggerReason}`, {
          previousMessageId: previousMessageId ?? null,
          latestMessageId,
          expectedMessageId: normalizeMessageId(expectedMessageId),
        });
        syncInProgress = true;
        try {
          $shell.attr('mesid', String(latestMessageId));
          $shell.data('mesid', latestMessageId);
          $shell.find('.mesIDDisplay').text(String(latestMessageId));
          recordBlackBox('refresh-one-message-started', {
            markerId: reloadMarker?.id ?? '',
            triggerReason,
            latestMessageId,
          });
          await refreshOneMessage(latestMessageId, $shell);
          recordBlackBox('refresh-one-message-returned', {
            markerId: reloadMarker?.id ?? '',
            triggerReason,
            latestMessageId,
          });
        } catch (error) {
          clearPendingReloadReason(reloadMarker?.id);
          if (previousMessageId === undefined) {
            $shell.removeAttr('mesid');
            $shell.removeData('mesid');
          } else {
            $shell.attr('mesid', previousMessageId);
            $shell.data('mesid', Number(previousMessageId));
          }
          $shell.find('.mesIDDisplay').text(previousMessageIdLabel);
          console.error('[隐藏楼层] 同步最新楼层显示失败:', error);
          return;
        } finally {
          syncInProgress = false;
        }

        $messages = $('#chat > .mes');
        $latest = getMessageElement($messages, latestMessageId);
        if ($latest.length === 0) {
          return;
        }
      }

      $latest.addClass('last_mes');
      $messages.not($latest).remove();
      $('#show_more_messages').remove();
    }

    function scheduleCollapse(delay = 120, expectedMessageId, triggerReason = 'unspecified') {
      const now = Date.now();
      const priority = URGENT_COLLAPSE_REASONS.has(triggerReason) ? 'urgent' : 'normal';
      if (collapseFirstScheduledAt === null) {
        collapseFirstScheduledAt = now;
        collapseResetCount = 0;
        collapseTriggerReasonCounts = {};
      }
      collapseLastScheduledAt = now;
      collapseTriggerReasonCounts[triggerReason] = (collapseTriggerReasonCounts[triggerReason] || 0) + 1;

      if (collapseTimer) {
        if (collapseTimerPriority === 'urgent' && priority !== 'urgent') {
          // 回合完成或显式同步已经排队时，普通 DOM 变化不能把它推迟。
          return;
        }
        clearTimeout(collapseTimer);
        collapseResetCount += 1;
      }

      const elapsedMs = now - collapseFirstScheduledAt;
      const remainingMaxWaitMs = Math.max(0, COLLAPSE_MAX_WAIT_MS - elapsedMs);
      const effectiveDelay = priority === 'urgent' ? 0 : Math.min(delay, remainingMaxWaitMs);
      collapseTimerPriority = priority;
      collapseTimer = setTimeout(() => {
        const firedAt = Date.now();
        const diagnostics = {
          firstScheduledAt: collapseFirstScheduledAt,
          lastScheduledAt: collapseLastScheduledAt,
          firedAt,
          waitMs: collapseFirstScheduledAt === null ? 0 : firedAt - collapseFirstScheduledAt,
          resetCount: collapseResetCount,
          triggerReasonCounts: cloneDetails(collapseTriggerReasonCounts),
          selectedTriggerReason: triggerReason,
          priority,
          expectedMessageId: normalizeMessageId(expectedMessageId),
        };
        collapseTimer = null;
        collapseTimerPriority = 'normal';
        collapseFirstScheduledAt = null;
        collapseLastScheduledAt = null;
        collapseResetCount = 0;
        collapseTriggerReasonCounts = {};
        recordBlackBox('collapse-debounce-fired', diagnostics);
        void syncAndCollapseToLastMessage(expectedMessageId, triggerReason);
      }, effectiveDelay);
    }

    function observeChat() {
      const nextChatElement = $('#chat')[0] || null;
      if (nextChatElement === chatElement) {
        return;
      }

      chatObserver?.disconnect();
      chatElement = nextChatElement;
      chatObserver = chatElement
        ? new MutationObserver(() => {
            scheduleCollapse(120, undefined, 'chat-child-list-mutation');
          })
        : null;
      chatObserver?.observe(chatElement, { childList: true });
    }

    // 移除除了最后一楼以外的楼层
    observeChat();
    recordBlackBox('hidden-floor-script-boot', {
      chatId: SillyTavern.getCurrentChatId(),
      latestMessageId: getLastMessageId(),
    });
    scheduleCollapse(0, undefined, 'hidden-floor-script-boot');

    [
      tavern_events.MESSAGE_EDITED,
      tavern_events.MESSAGE_UPDATED,
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MESSAGE_DELETED,
      tavern_events.MORE_MESSAGES_LOADED,
      tavern_events.USER_MESSAGE_RENDERED,
      tavern_events.CHARACTER_MESSAGE_RENDERED,
    ].forEach(eventType => {
      if (eventType) {
        eventOn(eventType, () => scheduleCollapse(120, undefined, `tavern-event:${eventType}`));
      }
    });

    eventOn(SYNC_LATEST_MESSAGE_SHELL_EVENT, messageId => {
      scheduleCollapse(50, Number(messageId), 'explicit-latest-message-shell-sync');
    });

    eventOn(WUXIA_TURN_LIFECYCLE_EVENT, payload => {
      if (!payload || typeof payload !== 'object') {
        return;
      }
      if (payload.phase === 'start') {
        const roundId = lockTurn(payload.roundId, payload.chatId);
        void eventEmit(WUXIA_TURN_LOCK_ACK_EVENT, {
          phase: 'locked',
          roundId,
          chatId: payload.chatId,
          scriptRuntimeId: SCRIPT_RUNTIME_ID,
          lockedAt: Date.now(),
        })
          .then(() => {
            recordBlackBox('turn-lock-ack-sent', { roundId, chatId: payload.chatId });
          })
          .catch(error => {
            recordBlackBox('turn-lock-ack-failed', { roundId, error: String(error) });
          });
        return;
      }
      if (payload.phase === 'finish') {
        unlockTurn(
          payload.roundId,
          payload.messageId,
          'turn-finish-event',
          payload.waitForResponseDelivery === true,
        );
      }
    });

    eventOn(WUXIA_TURN_RESPONSE_DELIVERED_EVENT, payload => {
      if (!payload || typeof payload !== 'object') {
        return;
      }
      finishDeferredResponseDelivery(payload.roundId, payload.messageId, 'turn-response-delivered');
    });

    const shellElement = $('#sheld')[0] || document.body;
    shellObserver = shellElement
      ? new MutationObserver(() => {
          observeChat();
          scheduleCollapse(120, undefined, 'shell-child-list-mutation');
        })
      : null;
    shellObserver?.observe(shellElement, { childList: true });

    // 当聊天文件变更时, 重新加载前端界面或脚本
    let current_chat_id = SillyTavern.getCurrentChatId();
    eventOn(tavern_events.CHAT_CHANGED, chat_id => {
      if (current_chat_id !== chat_id) {
        const previousChatId = current_chat_id;
        markPendingReloadReason('reloadIframe:chat-changed', {
          previousChatId,
          nextChatId: chat_id,
          activeTurnRoundId,
        });
        activeTurnRoundId = null;
        pendingMessageId = null;
        clearTurnLockTimer();
        pendingResponseDeliveryRoundId = null;
        pendingResponseDeliveryMessageId = null;
        clearResponseDeliveryTimer();
        current_chat_id = chat_id;
        reloadIframe();
        return;
      }

      scheduleCollapse(120, undefined, 'chat-changed-same-chat');
    });

    $(window).on('pagehide', () => {
      const pendingReload = readPendingReloadReason();
      recordBlackBox('hidden-floor-script-pagehide', {
        activeTurnRoundId,
        pendingMessageId,
        reason: pendingReload?.reason ?? 'external-or-unknown',
        reloadMarkerId: pendingReload?.id ?? '',
      });
      if (collapseTimer) {
        clearTimeout(collapseTimer);
      }
      chatObserver?.disconnect();
      shellObserver?.disconnect();
      clearTurnLockTimer();
    });
  });
