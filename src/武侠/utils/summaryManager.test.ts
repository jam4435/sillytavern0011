import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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

  const thresholds = {
    totalEntriesThreshold: 50,
    perCharacterEntriesThreshold: 10,
  };

  const makeBiography = (count: number, prefix = '经历') => Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `${prefix}${index + 1}`,
      `(1200.11.${index + 1}) 测试经历${index + 1}`,
    ]),
  );

  it('triggers when one eligible character has more than the aggregate threshold', () => {
    vi.stubGlobal('getVariables', () => ({
      stat_data: {
        角色数据: {
          段誉: { 人物经历: makeBiography(51) },
          王语嫣: { 人物经历: makeBiography(10) },
        },
      },
    }));

    const result = checkSummaryTrigger(thresholds);

    expect(result.shouldTrigger).toBe(true);
    expect(result.triggerReason).toBe('total_entries');
    expect(result.pendingCharacters.map(character => character.displayName)).toEqual(['段誉']);
    expect(result.totalEntries).toBe(51);
  });

  it('triggers when five eligible characters with eleven entries each exceed fifty in aggregate', () => {
    vi.stubGlobal('getVariables', () => ({
      stat_data: {
        角色数据: Object.fromEntries(
          ['甲', '乙', '丙', '丁', '戊'].map(name => [name, { 人物经历: makeBiography(11, `${name}经历`) }]),
        ),
      },
    }));

    const result = checkSummaryTrigger(thresholds);

    expect(result.shouldTrigger).toBe(true);
    expect(result.triggerReason).toBe('total_entries');
    expect(result.pendingCharacters).toHaveLength(5);
    expect(result.totalEntries).toBe(55);
  });

  it('does not trigger when eligible characters do not exceed fifty in aggregate', () => {
    vi.stubGlobal('getVariables', () => ({
      stat_data: {
        角色数据: {
          甲: { 人物经历: makeBiography(11, '甲经历') },
          乙: { 人物经历: makeBiography(11, '乙经历') },
          丙: { 人物经历: makeBiography(10, '丙经历') },
        },
      },
    }));

    const result = checkSummaryTrigger(thresholds);

    expect(result.shouldTrigger).toBe(false);
    expect(result.triggerReason).toBe('none');
    expect(result.pendingCharacters.map(character => character.displayName)).toEqual(['甲', '乙']);
    expect(result.totalEntries).toBe(22);
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

  it('compresses every biography entry in one pass, including existing stage memories', () => {
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
    expect(Object.keys(plan!.sourceEntries)).toEqual(Object.keys(biography));

    const merged = mergeBiographyCompression(plan!, {
      '初入江湖': '（1200.10.1~1200.11.3）前期经历的完整阶段记忆。',
      '关系变化': '（1200.11.4~1200.11.10）后续经历的完整阶段记忆。',
    });

    expect(merged).toEqual({
      '阶段经历1-初入江湖': '（1200.10.1~1200.11.3）前期经历的完整阶段记忆。',
      '阶段经历2-关系变化': '（1200.11.4~1200.11.10）后续经历的完整阶段记忆。',
    });
    expect(getBiographyEntryCount(merged)).toBe(0);
  });

  it('deletes all submitted biography entries and inserts only the new stage memories', () => {
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
      '初入江湖': '（1200.10.1~1200.11.3）前期经历总结',
      '关系变化': '（1200.11.4~1200.11.10）后续经历总结',
    };
    const operations = buildBiographyCompressionOperations(
      'character:包惜弱',
      plan,
      stageMemories,
    );

    expect(operations.map(operation => operation.type)).toEqual(['delete', 'insert']);
    expect((operations[0].payload as any).角色数据.包惜弱.人物经历).toEqual(
      Object.fromEntries(Object.keys(biography).map(key => [key, {}])),
    );
    expect((operations[1].payload as any).角色数据.包惜弱.人物经历).toEqual({
      '阶段经历1-初入江湖': '（1200.10.1~1200.11.3）前期经历总结',
      '阶段经历2-关系变化': '（1200.11.4~1200.11.10）后续经历总结',
    });
  });

  it('replaces every legacy string biography line with stage memories in one pass', () => {
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
        '旧事回顾': '（1200.11.1~1200.11.4）旧记录总结',
        '人物关系': '（1200.11.5~1200.11.7）另一条阶段记忆',
      },
      { replaceLegacyString: true },
    );

    expect(operations.map(operation => operation.type)).toEqual(['delete', 'insert']);
    expect((operations[0].payload as any).user数据.人物经历).toEqual({});
    const inserted = (operations[1].payload as any).user数据.人物经历;
    expect(inserted).toEqual({
      '阶段经历1-旧事回顾': '（1200.11.1~1200.11.4）旧记录总结',
      '阶段经历2-人物关系': '（1200.11.5~1200.11.7）另一条阶段记忆',
    });
    expect(getBiographyEntryCount(inserted)).toBe(0);
  });

  it('parses a strict JSON object keyed by stage summary names', () => {
    expect(parseSummaryResponse(`{
      "初入江湖": "（1200.11.1~1200.11.2）建立了重要关系。",
      "关系变化": "（旧记录时间不详）确认了长期立场。"
    }`, 2, {
      经历1: '(1200.11.1) 旧经历一',
      经历2: '(1200.11.2) 旧经历二',
    })).toEqual({
      '初入江湖': '（1200.11.1~1200.11.2）建立了重要关系。',
      '关系变化': '（旧记录时间不详）确认了长期立场。',
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

  it('rebases stage-summary-name keys into internal numbered storage keys', () => {
    expect(rebaseStageMemoryKeys({
      '初入江湖': '（1200.11.1）第一阶段',
      '关系变化': '（1200.11.2）第二阶段',
    }, {
      '阶段经历1-旧记忆': '（1200.10.1）旧阶段',
    })).toEqual({
      '阶段经历2-初入江湖': '（1200.11.1）第一阶段',
      '阶段经历3-关系变化': '（1200.11.2）第二阶段',
    });
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
