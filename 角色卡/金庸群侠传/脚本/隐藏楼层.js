$(() => {
  // 移除除了最后一楼以外的楼层
  $('#chat > .mes').not('.last_mes').remove();

  // 当聊天文件变更时, 重新加载前端界面或脚本
  let current_chat_id = SillyTavern.getCurrentChatId();
  eventOn(tavern_events.CHAT_CHANGED, chat_id => {
    if (current_chat_id !== chat_id) {
      current_chat_id = chat_id;
      reloadIframe();
    }
  })
})