import { describe, expect, it } from 'vitest';
import { buildConversationSummaryRegexes, filterArchivedSummariesFromPrompt } from './conversationSummaryManager';

describe('conversationSummaryManager', () => {
  it('keeps five recent assistant replies full and reduces older context to summaries', () => {
    const rules=buildConversationSummaryRegexes(5);
    expect(rules.find(r=>r.id==='wuxia-card-summary-recent-hide')?.max_depth).toBe(9);
    expect(rules.find(r=>r.id==='wuxia-card-summary-old-assistant-keep')?.min_depth).toBe(10);
    expect(rules.find(r=>r.id==='wuxia-card-summary-old-user-empty')?.min_depth).toBe(10);
  });

  it('clamps the recent reply count', () => {
    expect(buildConversationSummaryRegexes(0).find(r=>r.id==='wuxia-card-summary-recent-hide')?.max_depth).toBe(1);
    expect(buildConversationSummaryRegexes(999).find(r=>r.id==='wuxia-card-summary-recent-hide')?.max_depth).toBe(39);
  });

  it('removes already archived summary messages and their paired user messages from the final prompt', () => {
    const chat = [
      { role: 'system' as const, content: '设定' },
      { role: 'user' as const, content: '旧用户1' },
      { role: 'system' as const, content: '夹在对话之间的深度世界书' },
      { role: 'assistant' as const, content: '<summary>旧摘要1</summary>' },
      { role: 'user' as const, content: '旧用户2' },
      { role: 'assistant' as const, content: '<summary>旧摘要2</summary>' },
      { role: 'user' as const, content: '当前用户' },
    ];
    expect(filterArchivedSummariesFromPrompt(chat, 2)).toBe(4);
    expect(chat).toEqual([
      { role: 'system', content: '设定' },
      { role: 'system', content: '夹在对话之间的深度世界书' },
      { role: 'user', content: '当前用户' },
    ]);
  });
});
