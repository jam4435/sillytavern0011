import { describe, expect, it } from 'vitest';
import { buildNarrativeArchivePrompt, extractTurnSummary, selectConversationArchiveBatch } from './narrativeMemoryManager';

describe('narrativeMemoryManager', () => {
  it('extracts only the XML turn summary', () => {
    expect(extractTurnSummary('正文\n<summary>旧事摘要</summary>\n<VariableThink>x</VariableThink>')).toBe('旧事摘要');
  });

  it('archives oldest eligible summaries while protecting recent assistant replies', () => {
    const messages = Array.from({ length: 16 }, (_, index) => ({
      message_id: index * 2 + 1,
      role: 'assistant' as const,
      message: `正文${index + 1}\n<summary>摘要${index + 1}</summary>`,
    }));
    const batch = selectConversationArchiveBatch(messages, {
      archivedThroughMessageId: -1,
      recentReplies: 5,
      batchSize: 10,
    });
    expect(batch).toHaveLength(10);
    expect(batch[0]).toEqual({ messageId: 1, summary: '摘要1' });
    expect(batch[9]).toEqual({ messageId: 19, summary: '摘要10' });
  });

  it('does not cross the archived floor and preserves exact source text in the compression prompt', () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      message_id: index + 1,
      role: 'assistant' as const,
      message: `<summary>(1200.11.${index + 1}) 摘要${index + 1}</summary>`,
    }));
    const batch = selectConversationArchiveBatch(messages, {
      archivedThroughMessageId: 6,
      recentReplies: 5,
      batchSize: 5,
    });
    expect(batch.map(item => item.messageId)).toEqual([7, 8, 9, 10, 11]);
    expect(buildNarrativeArchivePrompt(batch)).toContain('(1200.11.7) 摘要7');
  });
});
