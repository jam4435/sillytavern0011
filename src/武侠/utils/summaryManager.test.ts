import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBiographyCompressionPlan,
  buildBiographyCompressionOperations,
  parseSummaryResponse,
  formatPromptForCharacter,
  checkSummaryTrigger,
  getBiographyEntryCount,
  mergeBiographyCompression,
  runWithConcurrencyLimit,
} from './summaryManager';
import { DEFAULT_SUMMARY_PROMPT_TEMPLATE } from './settingsManager';

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

  it('triggers by raw entries only and excludes model-written stage keys via the character metadata index', () => {
    const biography = {
      ...makeBiography(51),
      '初入江湖': '（1200.10.1~1200.10.5）模型输出的阶段记忆',
      '关系变化': '（1200.10.6~1200.10.9）另一条模型输出的阶段记忆',
    };
    vi.stubGlobal('getVariables', () => ({
      stat_data: {
        角色数据: {
          段誉: {
            人物经历: biography,
            $summaryStageMemoryKeys: JSON.stringify(['初入江湖', '关系变化']),
          },
        },
      },
    }));

    const result = checkSummaryTrigger(thresholds);

    expect(result.shouldTrigger).toBe(true);
    expect(result.totalEntries).toBe(51);
    expect(result.pendingCharacters[0].entriesCount).toBe(51);
    expect(result.pendingCharacters[0].biography).toEqual(biography);
  });

  it('does not count legacy numbered stage memories or keys listed in the summary index', () => {
    expect(getBiographyEntryCount({
      阶段经历1: '(1200.10.1~1200.10.5) 旧版阶段记忆',
      '阶段经历2-结识故人': '(1200.10.6~1200.10.9) 旧版阶段记忆',
      经历1: '(1200.11.1) 一',
      经历2: '(1200.11.2) 二',
      初入江湖: '（1200.10.1~1200.10.5）模型原样输出的阶段记忆',
    }, new Set(['初入江湖']))).toBe(2);
  });

  it('adds a full-history safety rule to legacy custom prompts and requires verbatim writeback', () => {
    const prompt = formatPromptForCharacter(
      'Custom old prompt for {{characterName}}:\n{{biographyEntries}}',
      {
        characterId: 'character:段誉',
        displayName: '段誉',
        entriesCount: 2,
        biography: {
          经历1: '（1200.11.1）原始经历',
          '阶段经历1-旧阶段': '（1200.10.1~1200.10.5）已有阶段记忆',
          $summaryStageMemoryKeys: '["不应发送给模型"]',
        },
      },
    );

    expect(prompt).toContain('Custom old prompt for 段誉');
    expect(prompt).toContain('经历1: （1200.11.1）原始经历');
    expect(prompt).toContain('阶段经历1-旧阶段: （1200.10.1~1200.10.5）已有阶段记忆');
    expect(prompt).not.toContain('$summaryStageMemoryKeys');
    expect(prompt).toContain('【本次压缩的强制要求】');
    expect(prompt).toContain('必须将全部输入条目中的重要事实整合进返回的阶段记忆');
    expect(prompt).toContain('模型输出的键名和值会原样写回人物经历');
    expect(prompt).toContain('程序不会重命名、重编号、清理、补日期或改写模型输出');
    expect(prompt).not.toContain('程序会自动补齐缺失的时间前缀');
  });

  it('uses the updated default prompt without appending contradictory post-processing instructions', () => {
    const prompt = formatPromptForCharacter(DEFAULT_SUMMARY_PROMPT_TEMPLATE, {
      characterId: 'character:段誉',
      displayName: '段誉',
      entriesCount: 1,
      biography: { 经历1: '（1200.11.1）原始经历' },
    });

    expect(prompt).toContain('模型输出的键名和值会原样写回');
    expect(prompt).toContain('日期前缀必须由模型根据输入自行提供');
    expect(prompt).not.toContain('程序会自动补齐缺失的时间前缀');
  });

  it('includes every biography entry, including old stage memories, in one compression batch', () => {
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
    expect(plan!.sourceEntries).toEqual(biography);
    expect(plan!.sourceKeys).toEqual(Object.keys(biography));
  });

  it('writes model keys and values directly without renumbering, trimming, or date completion', () => {
    const biography = {
      经历1: '(1200.11.1) 一',
      经历2: '(1200.11.2) 二',
    };
    const plan = buildBiographyCompressionPlan(biography)!;
    const modelOutput = {
      '  初入江湖  ': '  模型给出的原始内容，无日期前缀。  ',
      关系变化: '（1200.11.2~1200.11.3）模型原样给出的内容。',
    };

    expect(mergeBiographyCompression(plan, modelOutput)).toEqual(modelOutput);
  });

  it('deletes submitted entries and inserts exactly the model-returned keys and values', () => {
    const biography = {
      阶段经历1: '(1200.10.1~1200.10.5) 已压缩旧记忆',
      经历1: '(1200.11.1) 一',
      经历2: '(1200.11.2) 二',
      经历3: '(1200.11.3) 三',
    };
    const plan = buildBiographyCompressionPlan(biography)!;
    const modelOutput = {
      初入江湖: '  模型原样返回的第一段记忆。  ',
      关系变化: '模型原样返回的第二段记忆。',
    };
    const operations = buildBiographyCompressionOperations(
      'character:包惜弱',
      plan,
      modelOutput,
    );

    expect(operations.map(operation => operation.type)).toEqual(['delete', 'insert']);
    expect((operations[0].payload as any).角色数据.包惜弱.人物经历).toEqual(
      Object.fromEntries(Object.keys(biography).map(key => [key, {}])),
    );
    const insertedCharacter = (operations[1].payload as any).角色数据.包惜弱;
    expect(insertedCharacter.人物经历).toEqual(modelOutput);
    expect(insertedCharacter.$summaryStageMemoryKeys).toBe(JSON.stringify(Object.keys(modelOutput)));
    expect((operations[0].payload as any).角色数据.包惜弱.$summaryStageMemoryKeys).toEqual({});
  });

  it('preserves newly appended biography entries outside the original compression keys', () => {
    const originalBiography = makeBiography(11);
    const plan = buildBiographyCompressionPlan(originalBiography)!;
    const latestBiography = {
      ...originalBiography,
      经历12: '(1200.11.12) 总结模型运行期间新增的经历',
    };
    const writePlan = { ...plan, originalBiography: latestBiography };
    const modelOutput = { 初入江湖: '模型原样返回的阶段记忆' };
    const operations = buildBiographyCompressionOperations(
      'character:段誉',
      writePlan,
      modelOutput,
    );
    const deleted = (operations[0].payload as any).角色数据.段誉.人物经历;
    const inserted = (operations[1].payload as any).角色数据.段誉.人物经历;

    expect(deleted).not.toHaveProperty('经历12');
    expect(Object.keys(deleted)).toHaveLength(11);
    expect(inserted).toEqual(modelOutput);
  });

  it('rejects model keys that collide with new entries appended while the model was running', () => {
    const originalBiography = makeBiography(11);
    const plan = buildBiographyCompressionPlan(originalBiography)!;
    const writePlan = {
      ...plan,
      originalBiography: {
        ...originalBiography,
        初入江湖: '（1200.11.12）总结期间新追加的原始经历',
      },
    };

    expect(() => buildBiographyCompressionOperations(
      'character:段誉',
      writePlan,
      { 初入江湖: '模型返回的阶段记忆' },
    )).toThrow(/冲突/);
  });

  it('replaces a legacy string biography and writes the model output verbatim', () => {
    const plan = buildBiographyCompressionPlan([
      '(1200.11.1) 一',
      '(1200.11.2) 二',
      '(1200.11.3) 三',
    ].join('\n'))!;
    const modelOutput = {
      旧事回顾: '模型没有补日期，也没有被程序改写。',
      人物关系: '  保留模型原始空格。  ',
    };
    const operations = buildBiographyCompressionOperations(
      'user',
      plan,
      modelOutput,
      { replaceLegacyString: true },
    );

    expect(operations.map(operation => operation.type)).toEqual(['delete', 'insert']);
    expect((operations[0].payload as any).user数据.人物经历).toEqual({});
    expect((operations[0].payload as any).user数据.$summaryStageMemoryKeys).toEqual({});
    expect((operations[1].payload as any).user数据.人物经历).toEqual(modelOutput);
    expect((operations[1].payload as any).user数据.$summaryStageMemoryKeys)
      .toBe(JSON.stringify(Object.keys(modelOutput)));
  });

  it('parses the JSON object while preserving every model key and string value verbatim', () => {
    const response = '{"  初入江湖  ":"  原样内容，无日期前缀。  ","关系变化":"第一行\\n第二行"}';

    expect(parseSummaryResponse(response, 2)).toEqual({
      '  初入江湖  ': '  原样内容，无日期前缀。  ',
      关系变化: '第一行\n第二行',
    });
  });

  it('does not add date prefixes or rewrite model memory values', () => {
    expect(parseSummaryResponse('{"初入江湖":"没有日期，直接保留模型原文。"}')).toEqual({
      初入江湖: '没有日期，直接保留模型原文。',
    });
  });

  it('rejects invalid JSON, non-object responses, reserved keys, invalid values, and excessive output count', () => {
    expect(() => parseSummaryResponse('<summary>不是 JSON</summary>')).toThrow(/合法 JSON/);
    expect(() => parseSummaryResponse('["不是对象"]')).toThrow(/JSON 对象/);
    expect(() => parseSummaryResponse('{"":"空键"}')).toThrow(/不能为空/);
    expect(() => parseSummaryResponse('{"阶段":"   "}')).toThrow(/非空字符串/);
    expect(() => parseSummaryResponse('{"阶段":1}')).toThrow(/非空字符串/);
    expect(() => parseSummaryResponse('{"$internal":"保留键"}')).toThrow(/保留键/);
    expect(() => parseSummaryResponse('{"第一段":"一","第二段":"二"}', 1)).toThrow(/多于本批/);
    expect(() => parseSummaryResponse('{"阶段":"日期范围\\~分隔符"}')).toThrow(/合法 JSON/);
  });
});
