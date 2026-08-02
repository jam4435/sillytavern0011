import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readRecentInputHistory, WUXIA_INPUT_HISTORY_DATA_KEY } from './inputHistory';

const getChatMessagesMock = vi.mocked(globalThis.getChatMessages);

describe('inputHistory', () => {
  beforeEach(() => {
    getChatMessagesMock.mockReset();
  });

  it('只读取带原始输入元数据的最近五个可见 user 楼层，并按最新在前返回', () => {
    getChatMessagesMock.mockReturnValue([
      { message_id: 1, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '第一条' } } },
      { message_id: 2, role: 'user', data: {} },
      { message_id: 3, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '重复行动' } } },
      { message_id: 4, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '第三条' } } },
      { message_id: 5, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '第四条' } } },
      { message_id: 6, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '重复行动' } } },
      { message_id: 7, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '  最新行动  ' } } },
    ] as never);

    expect(readRecentInputHistory()).toEqual([
      { messageId: 7, text: '最新行动' },
      { messageId: 6, text: '重复行动' },
      { messageId: 5, text: '第四条' },
      { messageId: 4, text: '第三条' },
      { messageId: 3, text: '重复行动' },
    ]);
    expect(getChatMessagesMock).toHaveBeenCalledWith('0-{{lastMessageId}}', {
      role: 'user',
      hide_state: 'unhidden',
    });
  });

  it('忽略损坏或空白的元数据，并允许调用方缩小条数', () => {
    getChatMessagesMock.mockReturnValue([
      { message_id: 1, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: null } },
      { message_id: 2, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '   ' } } },
      { message_id: 3, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '可用' } } },
      { message_id: 4, role: 'user', data: { [WUXIA_INPUT_HISTORY_DATA_KEY]: { text: '最新' } } },
    ] as never);

    expect(readRecentInputHistory(1)).toEqual([{ messageId: 4, text: '最新' }]);
    expect(readRecentInputHistory(0)).toEqual([]);
  });

  it('聊天记录暂时不可读时安全返回空历史', () => {
    getChatMessagesMock.mockImplementation(() => {
      throw new Error('chat unavailable');
    });

    expect(readRecentInputHistory()).toEqual([]);
  });
});
