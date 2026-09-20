import { describe, expect, it } from 'vitest';
import { buildConversationSummaryRegexes } from './conversationSummaryManager';

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
});
