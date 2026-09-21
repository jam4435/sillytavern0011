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
    expect(result.removedCharacters).toBe(
      '<thinking>A</thinking>'.length + '<thinking>B</thinking>'.length,
    );
  });

  it('allows a complete thinking block to exceed the 80% safety threshold', () => {
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

    expect(result.patch).toEqual({
      message_id: 9,
      message: '短正文',
      swipe_id: 0,
      swipes: ['短正文'],
    });
  });

  it('still refuses a non-thinking rule that would remove 80% or more', () => {
    const broadRule: RegexRule = {
      ...rule,
      id: 'broad',
      pattern: '/附加块很长很长很长很长很长很长很长很长很长/g',
      description: '非 thinking 大块',
    };
    const broadSelected = [getRegexRuleContentSignature(broadRule)];
    const message = '附加块很长很长很长很长很长很长很长很长很长正文';

    const result = cleanChatMessagePresetBlocks(
      {
        message_id: 10,
        role: 'assistant',
        message,
        swipes: [message],
        swipe_id: 0,
      },
      [broadRule],
      broadSelected,
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
