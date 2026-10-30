import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBiographyCompressionPlan,
  buildBiographyCompressionOperations,
  parseSummaryResponse,
  formatPromptForCharacter,
  checkSummaryTrigger,
  getBiographyEntryCount,
  normalizeBiography,
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
    expect(prompt).toContain('程序只解析 JSON 结构并做基本键值校验');
    expect(prompt).toContain('模型返回的键名和值按原样写回');
    expect(prompt).toContain('不要添加“阶段经历N-”编号前缀');
    expect(prompt).toContain('程序不会重命名键、清理或改写值、补写日期');
    expect(prompt).not.toContain('程序会自动补齐缺失的时间前缀');
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
      '初入江湖': '（1200.10.1~1200.11.3）前期经历的完整阶段记忆。',
      '关系变化': '（1200.11.4~1200.11.10）后续经历的完整阶段记忆。',
      '$summaryStageMemoryKeys': '["初入江湖","关系变化"]',
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
      '初入江湖': '（1200.10.1~1200.11.3）前期经历总结',
      '关系变化': '（1200.11.4~1200.11.10）后续经历总结',
      '$summaryStageMemoryKeys': '["初入江湖","关系变化"]',
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
    const inserted = (operations[1].payload as any).角色数据.段誉.人物经历;
    expect(deleted).not.toHaveProperty('经历12');
    expect(Object.keys(deleted)).toHaveLength(11);
    expect(inserted).toEqual({
      初入江湖: '（1200.11.1~1200.11.11）旧经历阶段总结',
      '$summaryStageMemoryKeys': '["初入江湖"]',
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
      '旧事回顾': '（1200.11.1~1200.11.4）旧记录总结',
      '人物关系': '（1200.11.5~1200.11.7）另一条阶段记忆',
      '$summaryStageMemoryKeys': '["旧事回顾","人物关系"]',
    });
    expect(getBiographyEntryCount(inserted)).toBe(0);
  });

  it('parses a strict JSON object keyed by stage summary names', () => {
    expect(parseSummaryResponse(
      '{"初入江湖":"（1200.11.1~1200.11.2）建立了重要关系。","关系变化":"（旧记录时间不详）确认了长期立场。"}',
      2,
    )).toEqual({
      初入江湖: '（1200.11.1~1200.11.2）建立了重要关系。',
      关系变化: '（旧记录时间不详）确认了长期立场。',
    });
  });

  it('does not repair invalid JSON or rewrite model-provided memory values', () => {
    const response = '{"初入江湖":"  模型原样输出的内容  ","关系变化":"没有日期前缀的记忆"}';
    expect(parseSummaryResponse(response)).toEqual({
      初入江湖: '  模型原样输出的内容  ',
      关系变化: '没有日期前缀的记忆',
    });

    expect(() => parseSummaryResponse('{"初入江湖":"日期分隔符非法\\~1200.11.2"}')).toThrow(/合法 JSON/);
    const rawLineBreak = '{"初入江湖":"第一行' + '\n' + '第二行"}';
    expect(() => parseSummaryResponse(rawLineBreak)).toThrow(/合法 JSON/);
  });

  it('does not silently repair unrelated invalid JSON escapes', () => {
    expect(() => parseSummaryResponse('{"初入江湖":"（1200.11.1）包含非法转义\\q"}')).toThrow(/合法 JSON/);
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

  it('keeps the model output object keys and values unchanged when parsing', () => {
    const output = {
      初入江湖: '（1200.11.1~1200.11.5）完整阶段记忆。',
      关系变化: '这条模型输出没有日期，也应原样保留。',
    };
    const modelOutput = JSON.stringify(output);
    expect(parseSummaryResponse(modelOutput, 2)).toEqual(output);
  });

  it('rejects malformed JSON, reserved keys, invalid values, duplicate keys, and excessive output count', () => {
    expect(() => parseSummaryResponse('<summary>不是 JSON</summary>')).toThrow(/合法 JSON/);
    expect(() => parseSummaryResponse('[]')).toThrow(/JSON 对象/);
    expect(() => parseSummaryResponse('{}')).toThrow(/空 JSON 对象/);
    expect(() => parseSummaryResponse('{"$summaryStageMemoryKeys":"[]"}')).toThrow(/保留键/);
    expect(() => parseSummaryResponse('{"初入江湖":12}')).toThrow(/非空字符串/);
    expect(() => parseSummaryResponse('{"初入江湖":"一","初入江湖":"二"}')).toThrow(/重复键/);
    expect(() => parseSummaryResponse('{"初入江湖":"一","关系变化":"二"}', 1)).toThrow(/多于本批/);
  });

  it('uses hidden metadata to exclude verbatim stage keys from future raw-entry counts and prompts', () => {
    const biography = {
      经历1: '（1200.11.1）原始经历',
      初入江湖: '（1200.11.1~1200.11.5）已压缩阶段记忆',
      '$summaryStageMemoryKeys': '["初入江湖"]',
    };
    expect(getBiographyEntryCount(biography)).toBe(1);
    const normalizedBiography = normalizeBiography(biography);
    expect(getBiographyEntryCount(normalizedBiography)).toBe(1);

    const prompt = formatPromptForCharacter(
      '全部经历：{{biographyEntries}}',
      {
        characterId: 'character:段誉',
        displayName: '段誉',
        entriesCount: 1,
        biography: normalizedBiography,
      },
    );
    expect(prompt).toContain('初入江湖: （1200.11.1~1200.11.5）已压缩阶段记忆');
    expect(prompt).toContain('经历1: （1200.11.1）原始经历');
    expect(prompt).not.toContain('$summaryStageMemoryKeys');
  });
});

