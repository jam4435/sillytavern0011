import { describe, expect, it } from 'vitest';

import { cleanChatMessagePresetBlocks } from './chatStorageCleanup';
import { getRegexRuleContentSignature, type RegexRule } from './settingsManager';

const rule: RegexRule = {
  id: 'think',
  pattern: '/<thinking>[\\s\\S]*?<\\/thinking>/gi',
  replacement: '',
  enabled: true,
  description: '隐藏思维链',
  originScope: 'preset',
};
const selected = [getRegexRuleContentSignature(rule)];

describe('cleanChatMessagePresetBlocks', () => {
  it('cleans the active message mirror and every stored swipe consistently', () => {
    const result = cleanChatMessagePresetBlocks(
      {
        message_id: 7,
        role: 'assistant',
        message: '<thinking>B</thinking>这是足够长的正文B，用于避免触发整楼误删保护。',
        swipe_id: 1,
        swipes: [
          '<thinking>A</thinking>这是足够长的正文A，用于避免触发整楼误删保护。',
          '<thinking>B</thinking>这是足够长的正文B，用于避免触发整楼误删保护。',
        ],
      },
      [rule],
      selected,
    );

    expect(result.patch).toEqual({
      message_id: 7,
      message: '这是足够长的正文B，用于避免触发整楼误删保护。',
      swipe_id: 1,
      swipes: [
        '这是足够长的正文A，用于避免触发整楼误删保护。',
        '这是足够长的正文B，用于避免触发整楼误删保护。',
      ],
    });
    expect(result.updatedSwipes).toBe(2);
    expect(result.removedCharacters).toBeGreaterThan(0);
  });

  it('keeps the 80% whole-reply safety guard for suspicious preset regex matches', () => {
    const result = cleanChatMessagePresetBlocks(
      {
        message_id: 9,
        role: 'assistant',
        message: '<thinking>几乎整条都是附加块</thinking>短正文',
        swipes: ['<thinking>几乎整条都是附加块</thinking>短正文'],
        swipe_id: 0,
      },
      [rule],
      selected,
    );

    expect(result.patch).toBeNull();
  });

  it('never changes non-assistant messages', () => {
    expect(
      cleanChatMessagePresetBlocks(
        { message_id: 8, role: 'user', message: '<thinking>用户原文</thinking>' },
        [rule],
        selected,
      ).patch,
    ).toBeNull();
  });
});
