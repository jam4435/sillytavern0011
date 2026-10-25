import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BIOGRAPHY_RECENT_ENTRIES_TO_KEEP,
  buildBiographyCompressionPlan,
  buildBiographyCompressionOperations,
  parseSummaryResponse,
  rebaseStageMemoryKeys,
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

  it('does not count old or titled stage memories toward the raw-entry threshold', () => {
    expect(
      getBiographyEntryCount({
        阶段经历1: '(1200.10.1~1200.10.5) 旧阶段记忆',
        '阶段经历2-结识故人': '（1200.10.6~1200.10.9）另一段阶段记忆',
        经历6: '(1200.11.6) 六',
        经历7: '(1200.11.7) 七',
      }),
    ).toBe(2);
  });

  it('compresses the oldest raw entries into multiple named stage memories and keeps recent/existing memories', () => {
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

    const merged = mergeBiographyCompression(plan!, {
      '阶段经历1-初入江湖': '（1200.11.1~1200.11.3）前三条经历的完整阶段记忆。',
      '阶段经历2-关系变化': '（1200.11.4~1200.11.5）后两条经历的完整阶段记忆。',
    });

    expect(merged.阶段经历1).toBe('(1200.10.1~1200.10.5) 已压缩旧记忆');
    expect(merged['阶段经历2-初入江湖']).toBe('（1200.11.1~1200.11.3）前三条经历的完整阶段记忆。');
    expect(merged['阶段经历3-关系变化']).toBe('（1200.11.4~1200.11.5）后两条经历的完整阶段记忆。');
    expect(merged.经历6).toBe('(1200.11.6) 六');
    expect(merged.经历10).toBe('(1200.11.10) 十');
    expect(Object.keys(merged)).toHaveLength(BIOGRAPHY_RECENT_ENTRIES_TO_KEEP + 3);
  });

  it('writes Delete then Insert for multiple named stage memories without touching recent/old stage memories', () => {
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
    const stageMemories = {
      '阶段经历1-初入江湖': '（1200.11.1~1200.11.3）前三条经历总结',
      '阶段经历2-关系变化': '（1200.11.4~1200.11.5）后两条经历总结',
    };
    const operations = buildBiographyCompressionOperations(
      'character:包惜弱',
      plan,
      stageMemories,
    );

    expect(operations.map(operation => operation.type)).toEqual(['delete', 'insert']);
    expect((operations[0].payload as any).角色数据.包惜弱.人物经历).toEqual({
      经历1: {},
      经历2: {},
      经历3: {},
      经历4: {},
      经历5: {},
    });
    expect((operations[1].payload as any).角色数据.包惜弱.人物经历).toEqual({
      '阶段经历2-初入江湖': '（1200.11.1~1200.11.3）前三条经历总结',
      '阶段经历3-关系变化': '（1200.11.4~1200.11.5）后两条经历总结',
    });
    expect(JSON.stringify(operations)).not.toContain('经历6');
    expect(JSON.stringify(operations)).not.toContain('阶段经历1:');
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
      {
        '阶段经历1-旧事回顾': '（1200.11.1~1200.11.2）旧记录总结',
        '阶段经历2-人物关系': '（旧记录时间不详）另一条阶段记忆',
      },
      { replaceLegacyString: true },
    );

    expect(operations.map(operation => operation.type)).toEqual(['delete', 'insert']);
    expect((operations[0].payload as any).user数据.人物经历).toEqual({});
    const inserted = (operations[1].payload as any).user数据.人物经历;
    expect(inserted['阶段经历1-旧事回顾']).toBe('（1200.11.1~1200.11.2）旧记录总结');
    expect(inserted['阶段经历2-人物关系']).toBe('（旧记录时间不详）另一条阶段记忆');
    expect(inserted.条目3).toBe('(1200.11.3) 三');
    expect(inserted.条目7).toBe('(1200.11.7) 七');
  });

  it('parses a strict JSON object containing multiple titled stage memories', () => {
    expect(parseSummaryResponse(`{
      "阶段经历1-初入江湖": "（1200.11.1~1200.11.2）建立了重要关系。",
      "阶段经历2-关系变化": "（旧记录时间不详）确认了长期立场。"
    }`)).toEqual({
      '阶段经历1-初入江湖': '（1200.11.1~1200.11.2）建立了重要关系。',
      '阶段经历2-关系变化': '（旧记录时间不详）确认了长期立场。',
    });
  });

  it('rejects non-JSON, invalid keys, missing dates, and non-contiguous stage numbers', () => {
    expect(() => parseSummaryResponse('<summary>不是 JSON</summary>')).toThrow(/合法 JSON/);
    expect(() => parseSummaryResponse('{"经历1":"（1200.11.1）内容"}')).toThrow(/键名/);
    expect(() => parseSummaryResponse('{"阶段经历1-无日期":"没有日期"}')).toThrow(/时间前缀/);
    expect(() => parseSummaryResponse('{"阶段经历1-一":"（1200.11.1）一","阶段经历3-三":"（1200.11.3）三"}')).toThrow(/连续递增/);
    expect(() => parseSummaryResponse('{"阶段经历1-一":"（1200.11.1）一","阶段经历1-重复":"（1200.11.2）二"}')).toThrow(/连续递增/);
    expect(() => parseSummaryResponse('{"阶段经历1-一":"（1200.11.1）一","阶段经历2-二":"（1200.11.2）二"}', 1)).toThrow(/多于本批/);
    expect(() => parseSummaryResponse(
      '{"阶段经历1-超出范围":"（1200.11.1~1200.11.20）日期不应超出输入"}',
      1,
      { 经历1: '(1200.11.1) 一', 经历2: '(1200.11.5) 五' },
    )).toThrow(/超出本批/);
    expect(() => parseSummaryResponse(
      '{"阶段经历1-无来源日期":"（1200.11.1）不应编造日期"}',
      1,
      { 经历1: '旧存档没有日期', 经历2: '另一条也没有日期' },
    )).toThrow(/没有可识别的游戏内日期/);
  });

  it('rebases generated stage keys after existing stage memories and excludes titled stage keys from raw counts', () => {
    expect(rebaseStageMemoryKeys({
      '阶段经历1-初入江湖': '（1200.11.1）第一阶段',
      '阶段经历2-关系变化': '（1200.11.2）第二阶段',
    }, {
      '阶段经历1-旧记忆': '（1200.10.1）旧阶段',
    })).toEqual({
      '阶段经历2-初入江湖': '（1200.11.1）第一阶段',
      '阶段经历3-关系变化': '（1200.11.2）第二阶段',
    });
  });
});
