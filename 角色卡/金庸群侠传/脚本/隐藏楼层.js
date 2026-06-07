$(() => {
  let collapseTimer = null;

  function getLastMessageElement($messages) {
    let $last = $messages.filter('.last_mes').last();
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

    return maxMessageId >= 0 ? $messages.filter(`[mesid="${maxMessageId}"]`).last() : $();
  }

  function collapseToLastMessage() {
    // 编辑框打开时不要删 DOM，否则会打断酒馆的编辑控件。
    if ($('#curEditTextarea').length > 0) {
      return;
    }

    const $messages = $('#chat > .mes');
    if ($messages.length <= 1) {
      return;
    }

    const $last = getLastMessageElement($messages);
    if ($last.length === 0) {
      return;
    }

    $messages.not($last).remove();
  }

  function scheduleCollapse(delay = 120) {
    if (collapseTimer) {
      clearTimeout(collapseTimer);
    }

    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      collapseToLastMessage();
    }, delay);
  }

  // 移除除了最后一楼以外的楼层
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

  const chatElement = $('#chat')[0];
  const observer = chatElement
    ? new MutationObserver(() => {
        scheduleCollapse();
      })
    : null;
  observer?.observe(chatElement, { childList: true });

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
    observer?.disconnect();
  })
})
