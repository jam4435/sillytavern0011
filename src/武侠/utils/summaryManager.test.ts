import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBiographyCompressionPlan,
  buildBiographyCompressionOperations,
  parseSummaryResponse,
  formatPromptForCharacter,
  rebaseStageMemoryKeys,
  checkSummaryTrigger,
  getBiographyEntryCount,
  mergeBiographyCompression,
  runWithConcurrencyLimit,
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

  it('limits concurrent workers to the configured maximum', async () => {
    let active = 0;
    let peak = 0;
    await runWithConcurrencyLimit([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
    });
    expect(peak).toBe(2);
  });

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

  it('does not trigger when an eligible character has exactly fifty raw entries', () => {
    vi.stubGlobal('getVariables', () => ({
      stat_data: {
        角色数据: {
          段誉: { 人物经历: makeBiography(50) },
        },
      },
    }));

    const result = checkSummaryTrigger(thresholds);

    expect(result.shouldTrigger).toBe(false);
    expect(result.triggerReason).toBe('none');
    expect(result.pendingCharacters).toHaveLength(1);
    expect(result.totalEntries).toBe(50);
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

  it('adds a full-history safety rule to legacy custom prompts', () => {
    const prompt = formatPromptForCharacter(
      '一次性压缩全部输入经历。不得只总结其中一部分。虽然所有输入经历都要重新组织。\nCustom old prompt for {{characterName}}:\n{{biographyEntries}}\nDo not rewrite recent experiences.',
      {
        characterId: 'character:段誉',
        displayName: '段誉',
        entriesCount: 2,
        biography: {
          经历1: '（1200.11.1）原始经历',
          '阶段经历1-旧阶段': '（1200.10.1~1200.10.5）已有阶段记忆',
        },
      },
    );

    expect(prompt).toContain('Custom old prompt for 段誉');
    expect(prompt).toContain('经历1: （1200.11.1）原始经历');
    expect(prompt).toContain('阶段经历1-旧阶段: （1200.10.1~1200.10.5）已有阶段记忆');
    expect(prompt).toContain('【本次压缩的强制要求】');
    expect(prompt).toContain('必须将全部输入条目中的重要事实整合进返回的阶段记忆');
    expect(prompt).toContain('单行 JSON 字符串');
    expect(prompt).toContain('严禁写成 \\~');
    expect(prompt).toContain('不得将小说章节号、回目编号或集数当作游戏内日期');
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

  it('preserves newly appended biography entries outside the original compression keys', () => {
    const originalBiography = makeBiography(11);
    const plan = buildBiographyCompressionPlan(originalBiography)!;
    const latestBiography = {
      ...originalBiography,
      经历12: '(1200.11.12) 总结模型运行期间新增的经历',
    };
    const rebasedPlan = { ...plan, originalBiography: latestBiography };
    const operations = buildBiographyCompressionOperations(
      'character:段誉',
      rebasedPlan,
      { 初入江湖: '（1200.11.1~1200.11.11）旧经历阶段总结' },
    );
    const deleted = (operations[0].payload as any).角色数据.段誉.人物经历;
    expect(deleted).not.toHaveProperty('经历12');
    expect(Object.keys(deleted)).toHaveLength(11);
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

  it('repairs literal line breaks and invalid escaped tildes inside summary JSON strings', () => {
    const response = String.raw`{
  "初入江湖": "（1200.11.1\~1200.11.2）先与钟灵相遇，
随后进入万劫谷。"
}`;
    expect(parseSummaryResponse(response)).toEqual({
      初入江湖: '（1200.11.1~1200.11.2）先与钟灵相遇， 随后进入万劫谷。',
    });
  });

  it('does not silently repair unrelated invalid JSON escapes', () => {
    expect(() => parseSummaryResponse(String.raw`{"初入江湖":"（1200.11.1）包含非法转义\q"}`)).toThrow(/合法 JSON/);
  });

  it('includes parser details and a bounded response preview for invalid JSON', () => {
    const response = `前言：${'x'.repeat(300)}\n尾部标记`;
    let thrown: unknown;

    try {
      parseSummaryResponse(response);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('解析器错误：');
    expect(message).toContain('响应长度：');
    expect(message).toContain('响应预览：');
    expect(message).toContain('尾部标记');
    expect(message.length).toBeLessThan(700);
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
