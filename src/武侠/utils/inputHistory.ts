export const WUXIA_INPUT_HISTORY_DATA_KEY = 'wuxiaInputHistoryV1';
export const DEFAULT_INPUT_HISTORY_LIMIT = 5;

export interface InputHistoryEntry {
  messageId: number;
  text: string;
}

type HistoryChatMessage = {
  message_id: number;
  role: 'system' | 'assistant' | 'user';
  data?: Record<string, unknown>;
};

/**
 * 从当前聊天的真实 user 楼层读取原始玩家输入。
 * 历史只信任专用元数据，不解析楼层正文，避免把已执行的指令再次带回输入框。
 */
export function readRecentInputHistory(limit = DEFAULT_INPUT_HISTORY_LIMIT): InputHistoryEntry[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) return [];

  let messages: HistoryChatMessage[];
  try {
    messages = getChatMessages('0-{{lastMessageId}}', {
      role: 'user',
      hide_state: 'unhidden',
    }) as HistoryChatMessage[];
  } catch {
    return [];
  }

  return messages
    .filter(message => message.role === 'user' && Number.isInteger(message.message_id))
    .sort((left, right) => right.message_id - left.message_id)
    .flatMap(message => {
      const historyData = message.data?.[WUXIA_INPUT_HISTORY_DATA_KEY];
      if (!historyData || typeof historyData !== 'object' || Array.isArray(historyData)) return [];

      const text = (historyData as { text?: unknown }).text;
      if (typeof text !== 'string' || !text.trim()) return [];
      return [{ messageId: message.message_id, text: text.trim() }];
    })
    .slice(0, safeLimit);
}
