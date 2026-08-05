  $(() => {
    const WUXIA_TURN_LIFECYCLE_EVENT = 'wuxia:turn-lifecycle';
    const WUXIA_TURN_LOCK_ACK_EVENT = 'wuxia:turn-lock-ack';
    const TURN_LOCK_TIMEOUT_MS = 8 * 60 * 1000;
    const BLACK_BOX_STORAGE_KEY = 'wuxia_iframe_lifecycle_black_box_v1';
    const PENDING_RELOAD_REASON_STORAGE_KEY = 'wuxia_iframe_pending_reload_reason_v1';
    const MAX_BLACK_BOX_ENTRIES = 240;
    const PENDING_RELOAD_REASON_MAX_AGE_MS = 30 * 1000;
    const COLLAPSE_MAX_WAIT_MS = 2000;
    const URGENT_COLLAPSE_REASONS = new Set([
      'turn-finish-event',
      'turn-lock-timeout',
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
    let stableShellElement = null;
    let activeTurnRoundId = null;
    let activeTurnChatId = null;
    let pendingMessageId = null;
    let turnLockTimer = null;

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

    function unlockTurn(expectedRoundId, messageId, reason = 'turn-finished') {
      if (expectedRoundId && expectedRoundId !== activeTurnRoundId) {
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
      });
      activeTurnRoundId = null;
      activeTurnChatId = null;
      pendingMessageId = null;
      clearTurnLockTimer();
      scheduleCollapse(0, latestPendingMessageId, reason);
    }

    function lockTurn(roundId, chatId) {
      const previousRoundId = activeTurnRoundId;
      activeTurnRoundId = typeof roundId === 'string' && roundId ? roundId : `turn-${Date.now()}`;
      activeTurnChatId = chatId ?? null;
      recordBlackBox('turn-lock-acquired', {
        roundId: activeTurnRoundId,
        previousRoundId,
        chatId,
      });
      clearTurnLockTimer();
      turnLockTimer = setTimeout(() => {
        const timedOutRoundId = activeTurnRoundId;
        const timedOutChatId = activeTurnChatId;
        const timedOutMessageId = pendingMessageId;
        console.warn('[隐藏楼层] 武侠回合锁超时，自动恢复楼层折叠。', timedOutRoundId);
        recordBlackBox('turn-lock-timeout', {
          roundId: timedOutRoundId,
          chatId: timedOutChatId,
          messageId: timedOutMessageId,
        });
        // 通知同一事件总线上的 ERA 等回合屏障；本脚本随后自行解锁，避免遗留等待状态。
        void eventEmit(WUXIA_TURN_LIFECYCLE_EVENT, {
          phase: 'finish',
          roundId: timedOutRoundId,
          chatId: timedOutChatId,
          messageId: timedOutMessageId,
          timeoutSourceRuntimeId: SCRIPT_RUNTIME_ID,
        }).catch(error => {
          recordBlackBox('turn-lock-timeout-finish-emit-failed', {
            roundId: timedOutRoundId,
            chatId: timedOutChatId,
            error: String(error),
          });
        });
        unlockTurn(timedOutRoundId, timedOutMessageId, 'turn-lock-timeout');
      }, TURN_LOCK_TIMEOUT_MS);
      return activeTurnRoundId;
    }

    function getExistingShell($messages) {
      const $last = $messages.filter('.last_mes').last();
      if ($last.length > 0) {
        return $last;
      }

      let maxMessageId = -1;
      $messages.each((_index, element) => {
        const messageId = Number($(element).attr('mesid'));
        if (Number.isFinite(messageId) && messageId > maxMessageId) {
          maxMessageId = messageId;
        }
      });
      return maxMessageId >= 0 ? $messages.filter(`[mesid="${maxMessageId}"]`).last() : $messages.last();
    }

    function getStableShell($messages, triggerReason) {
      const isStableShellAttached =
        stableShellElement &&
        stableShellElement.parentElement === chatElement &&
        stableShellElement.classList.contains('mes');
      if (isStableShellAttached) {
        return $(stableShellElement);
      }

      if (stableShellElement) {
        recordBlackBox('stable-shell-lost', {
          triggerReason,
          previousMessageId: stableShellElement.getAttribute('mesid'),
        });
        stableShellElement = null;
      }

      const $shell = getExistingShell($messages);
      if ($shell.length === 0) {
        return $shell;
      }
      stableShellElement = $shell[0];
      recordBlackBox('stable-shell-adopted', {
        triggerReason,
        messageId: $shell.attr('mesid') ?? null,
      });
      return $shell;
    }

    function collapseToStableShell(expectedMessageId, triggerReason = 'unspecified') {
      observeChat();

      if (activeTurnRoundId) {
        const normalizedMessageId = normalizeMessageId(expectedMessageId);
        const previousPendingMessageId = pendingMessageId;
        if (normalizedMessageId !== null) {
          pendingMessageId = normalizedMessageId;
        }
        if (pendingMessageId !== previousPendingMessageId) {
          recordBlackBox('stable-shell-collapse-deferred-by-turn-lock', {
            triggerReason,
            roundId: activeTurnRoundId,
            expectedMessageId: normalizedMessageId,
          });
        }
        return;
      }

      // 编辑框打开时不要删 DOM，否则会打断酒馆的编辑控件。
      if ($('#curEditTextarea').length > 0) {
        scheduleCollapse(250, expectedMessageId, 'editor-open-retry');
        return;
      }

      const $messages = $('#chat > .mes');
      if ($messages.length === 0) {
        return;
      }

      const $stableShell = getStableShell($messages, triggerReason);
      if ($stableShell.length === 0) {
        return;
      }

      $stableShell.addClass('last_mes');
      $messages.not($stableShell).remove();
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
          // 回合完成后的折叠已经排队时，普通 DOM 变化不能把它推迟。
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
        collapseToStableShell(expectedMessageId, triggerReason);
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

    // 同一聊天只保留首次采用的宿主楼层 DOM，避免重建其中的武侠 iframe。
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
        if (payload.timeoutSourceRuntimeId === SCRIPT_RUNTIME_ID) {
          return;
        }
        unlockTurn(payload.roundId, payload.messageId, 'turn-finish-event');
      }
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
        stableShellElement = null;
        activeTurnRoundId = null;
        activeTurnChatId = null;
        pendingMessageId = null;
        clearTurnLockTimer();
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
