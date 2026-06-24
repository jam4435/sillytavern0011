$(() => {
  const SYNC_LATEST_MESSAGE_SHELL_EVENT = 'wuxia:sync-latest-message-shell';
  let collapseTimer = null;
  let chatElement = null;
  let chatObserver = null;
  let shellObserver = null;
  let syncInProgress = false;

  function getMessageElement($messages, messageId) {
    return $messages.filter(`[mesid="${messageId}"]`).last();
  }

  async function syncAndCollapseToLastMessage(expectedMessageId) {
    observeChat();

    // 编辑框打开时不要删 DOM，否则会打断酒馆的编辑控件。
    if ($('#curEditTextarea').length > 0) {
      scheduleCollapse(250, expectedMessageId);
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
      const $shell = $messages.filter('.last_mes').last().length > 0
        ? $messages.filter('.last_mes').last()
        : $messages.last();
      if ($shell.length === 0) {
        return;
      }

      const previousMessageId = $shell.attr('mesid');
      const previousMessageIdLabel = $shell.find('.mesIDDisplay').text();
      syncInProgress = true;
      try {
        $shell.attr('mesid', String(latestMessageId));
        $shell.data('mesid', latestMessageId);
        $shell.find('.mesIDDisplay').text(String(latestMessageId));
        await refreshOneMessage(latestMessageId, $shell);
      } catch (error) {
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

  function scheduleCollapse(delay = 120, expectedMessageId) {
    if (collapseTimer) {
      clearTimeout(collapseTimer);
    }

    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      void syncAndCollapseToLastMessage(expectedMessageId);
    }, delay);
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
          scheduleCollapse();
        })
      : null;
    chatObserver?.observe(chatElement, { childList: true });
  }

  // 移除除了最后一楼以外的楼层
  observeChat();
  scheduleCollapse(0);

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
      eventOn(eventType, () => scheduleCollapse());
    }
  });

  eventOn(SYNC_LATEST_MESSAGE_SHELL_EVENT, messageId => {
    scheduleCollapse(50, Number(messageId));
  });

  const shellElement = $('#sheld')[0] || document.body;
  shellObserver = shellElement
    ? new MutationObserver(() => {
        observeChat();
        scheduleCollapse();
      })
    : null;
  shellObserver?.observe(shellElement, { childList: true });

  // 当聊天文件变更时, 重新加载前端界面或脚本
  let current_chat_id = SillyTavern.getCurrentChatId();
  eventOn(tavern_events.CHAT_CHANGED, chat_id => {
    if (current_chat_id !== chat_id) {
      current_chat_id = chat_id;
      reloadIframe();
      return;
    }

    scheduleCollapse();
  });

  $(window).on('pagehide', () => {
    if (collapseTimer) {
      clearTimeout(collapseTimer);
    }
    chatObserver?.disconnect();
    shellObserver?.disconnect();
  })
})
