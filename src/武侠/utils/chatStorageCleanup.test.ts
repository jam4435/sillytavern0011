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
        message: '<thinking>B</thinking>正文B',
        swipe_id: 1,
        swipes: ['<thinking>A</thinking>正文A', '<thinking>B</thinking>正文B'],
      },
      [rule],
      selected,
    );

    expect(result.patch).toEqual({
      message_id: 7,
      message: '正文B',
      swipe_id: 1,
      swipes: ['正文A', '正文B'],
    });
    expect(result.updatedSwipes).toBe(2);
    expect(result.removedCharacters).toBeGreaterThan(0);
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
