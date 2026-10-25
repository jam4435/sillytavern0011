import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BIOGRAPHY_RECENT_ENTRIES_TO_KEEP,
  buildBiographyCompressionPlan,
  buildBiographyCompressionOperations,
  buildBiographyStageSummaryValue,
  checkSummaryTrigger,
  getBiographyEntryCount,
  mergeBiographyCompression,
} from './summaryManager';

describe('summaryManager biography compression', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lets one character trigger as soon as the per-character threshold is reached', () => {
    vi.stubGlobal('getVariables', () => ({
      stat_data: {
        角色数据: {
          包惜弱: {
            人物经历: Object.fromEntries(
              Array.from({ length: 10 }, (_, index) => [
                `经历${index + 1}`,
                `(1200.11.${index + 1}) 测试经历${index + 1}`,
              ]),
            ),
          },
        },
      },
    }));

    const result = checkSummaryTrigger({
      pendingQueueThreshold: 5,
      totalEntriesThreshold: 50,
      perCharacterEntriesThreshold: 10,
    });

    expect(result.shouldTrigger).toBe(true);
    expect(result.triggerReason).toBe('per_character');
    expect(result.pendingCharacters).toHaveLength(1);
  });

  it('does not count compressed stage memories toward the raw-entry threshold', () => {
    expect(
      getBiographyEntryCount({
        阶段经历1: '(1200.11.1~1200.11.5) 旧阶段记忆',
        经历6: '(1200.11.6) 六',
        经历7: '(1200.11.7) 七',
      }),
    ).toBe(2);
  });

  it('compresses only the oldest raw entries and keeps recent entries plus existing stage memories', () => {
    const biography = {
      阶段经历1: '(1200.10.1~1200.10.5) 已压缩旧记忆',
      经历1: '(1200.11.1) 一',
      经历2: '(1200.11.2) 二',
      经历3: '(1200.11.3) 三',
      经历4: '(1200.11.4) 四',
      经历5: '(1200.11.5) 五',
      经历6: '(1200.11.6) 六',
      经历7: '(1200.11.7) 七',
      经历8: '(1200.11.8) 八',
      经历9: '(1200.11.9) 九',
      经历10: '(1200.11.10) 十',
    };

    const plan = buildBiographyCompressionPlan(biography);
    expect(plan).not.toBeNull();
    expect(Object.keys(plan!.sourceEntries)).toEqual(['经历1', '经历2', '经历3', '经历4', '经历5']);
    expect(plan!.summaryKey).toBe('阶段经历2');

    const merged = mergeBiographyCompression(
      plan!,
      buildBiographyStageSummaryValue('前五条被压成一个长期阶段记忆。', plan!.sourceEntries),
    );

    expect(merged.阶段经历1).toBe('(1200.10.1~1200.10.5) 已压缩旧记忆');
    expect(merged.阶段经历2).toBe('(1200.11.1~1200.11.5) 前五条被压成一个长期阶段记忆。');
    expect(merged.经历6).toBe('(1200.11.6) 六');
    expect(merged.经历10).toBe('(1200.11.10) 十');
    expect(Object.keys(merged)).toHaveLength(BIOGRAPHY_RECENT_ENTRIES_TO_KEEP + 2);
  });

  it('writes biography compression as Delete then Insert, targeting only old entries and the new stage key', () => {
    const biography = {
      阶段经历1: '(1200.10.1~1200.10.5) 已压缩旧记忆',
      经历1: '(1200.11.1) 一',
      经历2: '(1200.11.2) 二',
      经历3: '(1200.11.3) 三',
      经历4: '(1200.11.4) 四',
      经历5: '(1200.11.5) 五',
      经历6: '(1200.11.6) 六',
      经历7: '(1200.11.7) 七',
      经历8: '(1200.11.8) 八',
      经历9: '(1200.11.9) 九',
      经历10: '(1200.11.10) 十',
    };
    const plan = buildBiographyCompressionPlan(biography)!;
    const summaryValue = '(1200.11.1~1200.11.5) 前五条经历总结';
    const operations = buildBiographyCompressionOperations(
      'character:包惜弱',
      plan,
      summaryValue,
    );

    expect(operations.map(operation => operation.type)).toEqual(['delete', 'insert']);
    expect(
      (operations[0].payload as any).角色数据.包惜弱.人物经历,
    ).toEqual({
      经历1: {},
      经历2: {},
      经历3: {},
      经历4: {},
      经历5: {},
    });
    expect(
      (operations[1].payload as any).角色数据.包惜弱.人物经历,
    ).toEqual({ 阶段经历2: summaryValue });
    // 近期经历和既有阶段经历不出现在删除/插入 payload 中。
    expect(JSON.stringify(operations)).not.toContain('经历6');
    expect(JSON.stringify(operations)).not.toContain('阶段经历1');
  });

  it('normalizes legacy string biography by deleting the old field and inserting retained entries plus summary', () => {
    const plan = buildBiographyCompressionPlan({
      条目1: '(1200.11.1) 一',
      条目2: '(1200.11.2) 二',
      条目3: '(1200.11.3) 三',
      条目4: '(1200.11.4) 四',
      条目5: '(1200.11.5) 五',
      条目6: '(1200.11.6) 六',
      条目7: '(1200.11.7) 七',
    })!;
    const operations = buildBiographyCompressionOperations(
      'user',
      plan,
      '(1200.11.1~1200.11.2) 旧记录总结',
      { replaceLegacyString: true },
    );

    expect(operations.map(operation => operation.type)).toEqual(['delete', 'insert']);
    expect((operations[0].payload as any).user数据.人物经历).toEqual({});
    expect(Object.keys((operations[1].payload as any).user数据.人物经历)).toContain('阶段经历1');
    expect((operations[1].payload as any).user数据.人物经历.条目3).toBe('(1200.11.3) 三');
    expect((operations[1].payload as any).user数据.人物经历.条目7).toBe('(1200.11.7) 七');
  });

  it('marks undated legacy blocks unknown instead of inventing a date', () => {
    expect(
      buildBiographyStageSummaryValue('保留旧事实', {
        经历1: '旧存档没有日期',
        经历2: '另一条也没有日期',
      }),
    ).toBe('(旧记录时间不详) 保留旧事实');
  });
});
