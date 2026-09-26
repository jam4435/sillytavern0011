import { describe, expect, it } from 'vitest';
import {
  buildSmallSummaryBackfillBatches,
  buildSmallSummaryBackfillPrompt,
  insertSmallSummaryIntoAssistantText,
  parseSmallSummaryBatchResponse,
  type SmallSummaryBackfillItem,
} from './conversationSummaryBackfillManager';

function item(messageId: number, hasSummary: boolean): SmallSummaryBackfillItem {
  return {
    messageId,
    hasSummary,
    summary: hasSummary ? `已有摘要${messageId}` : '',
    summaryTag: hasSummary ? 'summary' : null,
    body: `Assistant #${messageId} 正文`,
    preview: `Assistant #${messageId} 正文`,
  };
}

describe('conversationSummaryBackfillManager', () => {
  it('builds continuous five-to-ten floor batches while keeping already-summarized floors as context', () => {
    const items = [191, 193, 195, 197, 199, 201, 203, 205, 207].map((id, index) =>
      item(id, index === 2 || index === 4),
    );

    const batches = buildSmallSummaryBackfillBatches(items, 8);
    expect(batches).toHaveLength(1);
    expect(batches[0].messageIds).toEqual([191, 193, 195, 197, 199, 201, 203, 205, 207]);
    expect(batches[0].items.filter(entry => entry.hasSummary).map(entry => entry.messageId)).toEqual([195, 199]);

    const prompt = buildSmallSummaryBackfillPrompt(batches[0], 'summary');
    expect(prompt).toContain('"message_id": 195');
    expect(prompt).toContain('"needs_summary": false');
    expect(prompt).toContain('"existing_summary": "已有摘要195"');
  });

  it('rebalances a short tail so every normal batch stays between five and ten floors', () => {
    const twelve = Array.from({ length: 12 }, (_, index) => item(101 + index * 2, false));
    const batches = buildSmallSummaryBackfillBatches(twelve, 8);

    expect(batches.map(batch => batch.items.length)).toEqual([7, 5]);
    expect(batches.flatMap(batch => batch.messageIds)).toEqual(twelve.map(entry => entry.messageId));
  });

  it('accepts valid partial JSON and reports omitted floors as missing instead of success', () => {
    const parsed = parseSmallSummaryBatchResponse(
      JSON.stringify({
        summaries: [
          { message_id: 191, summary: '第一层发生了重要事件，并明确记录人物、地点与长期结果。' },
          { message_id: 197, summary: '第四层推进剧情并形成了后续仍需记住的关系变化与结果。' },
        ],
      }),
      [191, 193, 197],
      'summary',
    );

    expect(parsed.summaries.map(entry => entry.messageId)).toEqual([191, 197]);
    expect(parsed.missingMessageIds).toEqual([193]);
  });

  it('rejects duplicate message ids instead of accepting an ambiguous floor result', () => {
    const parsed = parseSmallSummaryBatchResponse(
      JSON.stringify({
        summaries: [
          { message_id: 191, summary: '第一个版本。' },
          { message_id: 191, summary: '互相冲突的第二个版本。' },
          { message_id: 193, summary: '另一层正常的小总结。' },
        ],
      }),
      [191, 193],
      'summary',
    );

    expect(parsed.summaries).toEqual([{ messageId: 193, summary: '另一层正常的小总结。' }]);
    expect(parsed.rejected).toEqual([
      { messageId: 191, error: '模型对同一楼层返回了重复小总结。' },
    ]);
  });

  it('rejects truncated JSON so no floor can be mistaken for a completed summary', () => {
    expect(() =>
      parseSmallSummaryBatchResponse(
        '{"summaries":[{"message_id":191,"summary":"正常"},{"message_id":193',
        [191, 193],
        'summary',
      ),
    ).toThrow(/完整的严格 JSON|截断/);
  });

  it('inserts the small summary before ERA variable blocks', () => {
    const source = [
      '正文内容。',
      '<VariableThink>检查</VariableThink>',
      '<VariableEdit>{"user数据":{"修为":10}}</VariableEdit>',
    ].join('\n');

    const result = insertSmallSummaryIntoAssistantText(source, 'summary', '这一层的小总结。');
    expect(result.indexOf('<summary>')).toBeGreaterThan(result.indexOf('正文内容'));
    expect(result.indexOf('<summary>')).toBeLessThan(result.indexOf('<VariableThink>'));
    expect(result).toContain('<summary>\n这一层的小总结。\n</summary>');
  });

  it('does not duplicate a summary that already exists on the active text', () => {
    const source = '正文\n<summary>已有总结</summary>\n<VariableThink>检查</VariableThink>';
    expect(insertSmallSummaryIntoAssistantText(source, 'summary', '新的总结')).toBe(source);
  });
});
