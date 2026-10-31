import { describe, expect, it } from 'vitest';
import {
  buildWorldHistoryArchivePrompt,
  buildWorldHistoryOverviewPrompt,
  parseWorldHistorySummary,
  selectWorldEventsForArchive,
  selectWorldHistoryChaptersForConsolidation,
  type WorldHistoryChapterRecord,
} from './worldHistoryMemoryManager';

function createWorldEvents(count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      '事件' + String(index + 1).padStart(2, '0'),
      {
        时间: { 年: 1200, 月: 1, 日: index + 1, 时: 12 },
        地点: '大宋/临安府',
        概要: '第' + String(index + 1) + '个事件已经完成并留下长期影响。',
      },
    ]),
  );
}

function createChapter(index: number): WorldHistoryChapterRecord {
  return {
    起始时间: { 年: 1200, 月: 1, 日: index + 1 },
    结束时间: { 年: 1200, 月: 1, 日: index + 1 },
    来源事件名: ['事件' + index],
    事件数量: 1,
    摘要: '世界史章节' + index,
  };
}

describe('worldHistoryMemoryManager', () => {
  it('waits until the unarchived event threshold is exceeded', () => {
    expect(selectWorldEventsForArchive(createWorldEvents(24), {}, 24, 12)).toHaveLength(0);
    expect(selectWorldEventsForArchive(createWorldEvents(25), {}, 24, 12)).toHaveLength(12);
  });

  it('archives the oldest batch and leaves recent events in detailed context', () => {
    const selected = selectWorldEventsForArchive(createWorldEvents(25), {}, 24, 12);

    expect(selected.map(item => item.eventName)).toEqual([
      '事件01', '事件02', '事件03', '事件04', '事件05', '事件06',
      '事件07', '事件08', '事件09', '事件10', '事件11', '事件12',
    ]);
    expect(selected[0].record.时间.日).toBe(1);
    expect(selected[selected.length - 1].record.时间.日).toBe(12);
  });

  it('does not summarize events already covered by a chapter', () => {
    const selected = selectWorldEventsForArchive(
      createWorldEvents(28),
      { 事件01: 1, 事件02: 1, 事件03: 1 },
      24,
      12,
    );

    expect(selected).toHaveLength(12);
    expect(selected[0].eventName).toBe('事件04');
  });

  it('accepts only a non-empty tagged world-history summary', () => {
    expect(parseWorldHistorySummary(
      '<world_history_summary>这段历史保留了明确日期、地点与人物因果。</world_history_summary>',
    )).toBe('这段历史保留了明确日期、地点与人物因果。');
    expect(() => parseWorldHistorySummary('模型返回了无标签的普通文本。')).toThrow();
    expect(() => parseWorldHistorySummary(
      '<world_history_summary>' + '史'.repeat(2001) + '</world_history_summary>',
    )).toThrow();
  });

  it('builds a world-history prompt that preserves deviation status and source facts', () => {
    const events = createWorldEvents(1);
    const prompt = buildWorldHistoryArchivePrompt([{
      eventName: '萧峰救阿紫',
      record: events.事件01,
      status: '偏离',
    }]);

    expect(prompt).toContain('萧峰救阿紫');
    expect(prompt).toContain('1200年1月1日 12时');
    expect(prompt).toContain('偏离');
    expect(prompt).toContain('不得补写原著');
  });

  it('consolidates the oldest chapters only after the chapter threshold is exceeded', () => {
    const chapters = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => ['史册' + String(index + 1).padStart(3, '0'), createChapter(index + 1)]),
    );
    const selected = selectWorldHistoryChaptersForConsolidation(chapters);

    expect(selected).toHaveLength(8);
    expect(selected[0][0]).toBe('史册001');
    expect(selected[7][0]).toBe('史册008');
    expect(selectWorldHistoryChaptersForConsolidation(
      Object.fromEntries(Object.entries(chapters).slice(0, 20)),
    )).toHaveLength(0);
  });

  it('builds a higher-level overview from the previous overview and older chapters', () => {
    const chapters = [
      ['史册001', createChapter(1)] as [string, WorldHistoryChapterRecord],
      ['史册002', createChapter(2)] as [string, WorldHistoryChapterRecord],
    ];
    const prompt = buildWorldHistoryOverviewPrompt({
      起始时间: { 年: 1199 },
      结束时间: { 年: 1199 },
      覆盖事件数: 8,
      摘要: '此前已经发生的历史总览。',
    }, chapters);

    expect(prompt).toContain('此前已经发生的历史总览');
    expect(prompt).toContain('世界史章节1');
    expect(prompt).toContain('世界史章节2');
    expect(prompt).toContain('<world_history_overview>');
  });
});
