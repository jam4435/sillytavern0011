import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyRegexRules,
  applySettingsToDOM,
  BATTLE_CHECK_REGEX_RULE,
  BUILTIN_LOCAL_REGEX_RULES,
  CONTENT_FONT_FAMILIES,
  createDefaultDisplaySettings,
  ERA_BASE_REGEX_RULE,
  EVENT_AUDIT_REGEX_RULE,
  EVENT_STAGE_TAG_REGEX_RULE,
  getPresetStorageCleanupRecommendation,
  getRegexRuleContentSignature,
  getRegexRulesForDisplay,
  getThemeAppearanceDefaults,
  loadSettings,
  normalizePresetXmlModuleInput,
  saveSettings,
  shouldOfferVariablePromptTemplateUpdate,
  stripSelectedPresetRegexMatches,
  stripSelectedXmlModules,
} from './settingsManager';

describe('settingsManager ui theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-ui-theme');
    document.documentElement.removeAttribute('style');
  });

  it('uses dark-gold as the default theme', () => {
    const settings = createDefaultDisplaySettings();

    expect(settings.uiTheme).toBe('dark-gold');
    expect(settings.contentFont).toBe('wenkai');
    expect(settings.fontColor).toBe(getThemeAppearanceDefaults('dark-gold').fontColor);
    expect(settings.themeAppearanceByTheme['ink-wash'].fontColor).toBe(
      getThemeAppearanceDefaults('ink-wash').fontColor,
    );
  });

  it('migrates old stored settings without a theme field', () => {
    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        fontSize: 18,
        fontColor: '#ffffff',
        lineHeight: 1.6,
      }),
    );

    const settings = loadSettings();

    expect(settings.uiTheme).toBe('dark-gold');
    expect(settings.contentFont).toBe('wenkai');
    expect(settings.fontSize).toBe(18);
    expect(settings.fontColor).toBe('#ffffff');
    expect(settings.themeAppearanceByTheme['dark-gold'].fontColor).toBe('#ffffff');
  });

  it('normalizes invalid stored themes to dark-gold', () => {
    window.localStorage.setItem('wuxia_display_settings', JSON.stringify({ uiTheme: 'paper-blue' }));

    expect(loadSettings().uiTheme).toBe('dark-gold');
  });

  it('normalizes invalid stored content fonts to wenkai', () => {
    window.localStorage.setItem('wuxia_display_settings', JSON.stringify({ contentFont: 'comic-sans' }));

    expect(loadSettings().contentFont).toBe('wenkai');
  });

  it('migrates legacy active-theme appearance into the matching theme slot', () => {
    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        uiTheme: 'ink-wash',
        fontColor: '#2a2118',
        backgroundColor: '#efe5d6',
        backgroundOpacity: 0.46,
        backgroundImage: 'data:image/png;base64,ink',
        backgroundBlur: 2,
        chromeOpacity: 0.44,
        modalOpacity: 0.54,
      }),
    );

    const settings = loadSettings();

    expect(settings.uiTheme).toBe('ink-wash');
    expect(settings.fontColor).toBe('#2a2118');
    expect(settings.backgroundImage).toBe('data:image/png;base64,ink');
    expect(settings.themeAppearanceByTheme['ink-wash']).toEqual(
      expect.objectContaining({
        fontColor: '#2a2118',
        backgroundColor: '#efe5d6',
        backgroundOpacity: 0.46,
        backgroundImage: 'data:image/png;base64,ink',
        backgroundBlur: 2,
        chromeOpacity: 0.44,
        modalOpacity: 0.54,
      }),
    );
    expect(settings.themeAppearanceByTheme['dark-gold'].fontColor).toBe(
      getThemeAppearanceDefaults('dark-gold').fontColor,
    );
  });

  it('persists and reloads the selected theme', () => {
    const defaults = createDefaultDisplaySettings();
    const settings = {
      ...defaults,
      uiTheme: 'ink-wash' as const,
      contentFont: 'calligraphy' as const,
      ...getThemeAppearanceDefaults('ink-wash'),
      backgroundImage: 'data:image/png;base64,ink',
      themeAppearanceByTheme: {
        ...defaults.themeAppearanceByTheme,
        'ink-wash': {
          ...defaults.themeAppearanceByTheme['ink-wash'],
          ...getThemeAppearanceDefaults('ink-wash'),
          backgroundImage: 'data:image/png;base64,ink',
        },
      },
    };

    expect(saveSettings(settings)).toBe(true);
    expect(loadSettings()).toEqual(
      expect.objectContaining({
        uiTheme: 'ink-wash',
        contentFont: 'calligraphy',
        backgroundImage: 'data:image/png;base64,ink',
        themeAppearanceByTheme: expect.objectContaining({
          'ink-wash': expect.objectContaining({
            backgroundImage: 'data:image/png;base64,ink',
          }),
        }),
      }),
    );
  });

  it('applies data-ui-theme and ink-wash sprite variables to the DOM', () => {
    const defaults = createDefaultDisplaySettings();
    const settings = {
      ...defaults,
      uiTheme: 'ink-wash' as const,
      contentFont: 'system' as const,
      ...getThemeAppearanceDefaults('ink-wash'),
      chromeOpacity: 0.45,
      modalOpacity: 0.7,
      themeAppearanceByTheme: {
        ...defaults.themeAppearanceByTheme,
        'ink-wash': {
          ...defaults.themeAppearanceByTheme['ink-wash'],
          ...getThemeAppearanceDefaults('ink-wash'),
          chromeOpacity: 0.45,
          modalOpacity: 0.7,
        },
      },
    };

    applySettingsToDOM(settings);

    expect(document.documentElement.dataset.uiTheme).toBe('ink-wash');
    expect(document.documentElement.style.getPropertyValue('--content-font-color')).toBe(
      getThemeAppearanceDefaults('ink-wash').fontColor,
    );
    expect(document.documentElement.style.getPropertyValue('--content-font-family')).toBe(CONTENT_FONT_FAMILIES.system);
    expect(document.documentElement.style.getPropertyValue('--wuxia-ink-bg-image')).toContain('url(');
    expect(document.documentElement.style.getPropertyValue('--wuxia-chrome-opacity')).toBe('0.45');
    expect(document.documentElement.style.getPropertyValue('--wuxia-modal-opacity')).toBe('0.7');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('defaults and migrates the extra-variable readonly context rounds to one or two', () => {
    expect(createDefaultDisplaySettings().summarySettings.variableContextRounds).toBe(1);

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({ summarySettings: { variableContextRounds: 2 } }),
    );
    expect(loadSettings().summarySettings.variableContextRounds).toBe(2);

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({ summarySettings: { variableContextRounds: 8 } }),
    );
    expect(loadSettings().summarySettings.variableContextRounds).toBe(1);
  });

  it('defaults and migrates conversation summary mode safely', () => {
    const defaults = createDefaultDisplaySettings().summarySettings;
    expect(defaults.conversationSummaryMode).toBe('off');
    expect(defaults.conversationSummaryRecentReplies).toBe(5);
    expect(defaults.conversationSummaryPresetTag).toBe('summary');
    expect(defaults.conversationArchiveEnabled).toBe(false);
    expect(defaults.conversationArchiveBatchSize).toBe(10);

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        summarySettings: {
          conversationSummaryMode: 'card',
          conversationSummaryRecentReplies: 8,
          conversationSummaryPresetTag: '<memory>',
          conversationArchiveEnabled: true,
          conversationArchiveBatchSize: 12,
        },
      }),
    );
    const loaded = loadSettings().summarySettings;
    expect(loaded.conversationSummaryMode).toBe('card');
    expect(loaded.conversationSummaryRecentReplies).toBe(8);
    expect(loaded.conversationSummaryPresetTag).toBe('<memory>');
    expect(loaded.conversationArchiveEnabled).toBe(true);
    expect(loaded.conversationArchiveBatchSize).toBe(12);

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        summarySettings: {
          conversationSummaryMode: 'invalid',
          conversationSummaryRecentReplies: 999,
          conversationArchiveBatchSize: 1,
        },
      }),
    );
    const invalid = loadSettings().summarySettings;
    expect(invalid.conversationSummaryMode).toBe('off');
    expect(invalid.conversationSummaryRecentReplies).toBe(20);
    expect(invalid.conversationArchiveBatchSize).toBe(5);
  });

  it('defaults and persists the extra-variable body cleaning rules', () => {
    const defaults = createDefaultDisplaySettings().summarySettings;
    expect(defaults.variablePromptExcludedTags).toBe('tucao\ncurrent_event\nprogress');
    expect(defaults.variablePromptBodyStartMarkers).toBe('</konatan_planning~>');

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        summarySettings: {
          variablePromptExcludedTags: 'aside\nmetadata',
          variablePromptBodyStartMarkers: '</thinking>',
        },
      }),
    );
    const loaded = loadSettings().summarySettings;
    expect(loaded.variablePromptExcludedTags).toBe('aside\nmetadata');
    expect(loaded.variablePromptBodyStartMarkers).toBe('</thinking>');
  });

  it('places the latest assistant body and execution contract at the end of the default variable prompt', () => {
    const template = createDefaultDisplaySettings().summarySettings.variablePromptTemplate;

    expect(template).toContain('{{readonlyContextRounds}}');
    expect(template).toContain('{{narrativeScale}}');
    expect(template).toContain('{{latestUserBody}}');
    expect(template).toContain('{{latestAssistantBody}}');
    expect(template.indexOf('{{narrativeScale}}')).toBeLessThan(template.indexOf('{{variableGuidance}}'));
    expect(template.indexOf('{{variableGuidance}}')).toBeLessThan(template.indexOf('{{latestUserBody}}'));
    expect(template.indexOf('{{latestUserBody}}')).toBeLessThan(template.indexOf('{{latestAssistantBody}}'));
    expect(template.indexOf('{{latestAssistantBody}}')).toBeLessThan(template.indexOf('【最终执行要求】'));
    expect(template).toContain('时间是禁止稀疏更新的原子对象');
    expect(template).toContain('旧完整时间 + 正文耗时 = 新完整时间');
    expect(template).toContain('{"世界信息":{"时间":{"年":1200,"月":8,"日":15,"时":13,"分":10}}}');
    expect(template).toContain('禁止只写“分:10”');
    expect(template).toContain('当 user 的行动宣称与 assistant 的实际结果冲突时，以 assistant 正文中的实际结果为准');
  });

  it('keeps biography compression focused on old chunks and game-time dates', () => {
    const template = createDefaultDisplaySettings().summarySettings.promptTemplate;
    expect(template).toContain('只总结下面提供的旧条目');
    expect(template).toContain('(1200.11.26)');
    expect(template).toContain('不得把现实日期写入结果');
    expect(template).toContain('1～3 句');
  });

  it('migrates the 2026-08-27 assistant-only default variable prompt to the current default', () => {
    const assistantOnlyLegacyTemplate = `你是《金庸群侠传》ERA 变量更新模型。
任务是核对最新 assistant 正文已经发生的持久变化；不得续写剧情。

【前序只读完整轮次】
{{readonlyContextRounds}}

【当前变量上下文；JSON 是真实可写快照，方括号内容只读】
{{variableContext}}

【合法地点】
{{locationContext}}

【叙事表现标尺】
{{narrativeScale}}

【ERA 变量领域规则】
{{variableGuidance}}

【本轮唯一变化来源】
{{latestAssistantBody}}

【最终执行要求】
强制判定顺序：
1. 只有上方 latestAssistantBody 是本轮变化来源；前序对话只用于理解上下文。
2. 逐级对照当前变量上下文中的真实键名。最终目标键已存在只能使用 VariableEdit，不存在才可使用 VariableInsert；VariableDelete 只能删除已存在的键。
3. 正文没有改变的事实不得重复 Insert 或无意义 Edit。
4. 时间是禁止稀疏更新的原子对象。每次时间变化都必须先核算“旧完整时间 + 正文耗时 = 新完整时间”，并完整写出年/月/日/时/分五字段；未变字段也必须写出，不属于无意义 Edit。
5. 例如当前 1200年8月15日12时55分，正文经过 15 分钟，新时间是 1200年8月15日13时10分；必须输出完整 {"世界信息":{"时间":{"年":1200,"月":8,"日":15,"时":13,"分":10}}}，禁止只写“分:10”。
6. 只允许修改世界信息.时间、user数据、角色数据，以及当前上下文已有参与事件的结局/insert/update/delete和已有分支标记的 0/1 值。分支标记只能 Edit，禁止新增、删除或改成其他值；禁止写事件分支结果。
7. 方括号说明、叙事表现标尺、可用地点列表和其他只读内容不得写回变量。
8. 时间可以跨过参与事件的结束时间；事件结算由事件脚本在时间写入后统一处理。
9. 没有需要持久化的变化时，只输出简短 VariableThink。

输出要求：
- 只允许输出 <VariableThink>、<VariableInsert>、<VariableEdit>、<VariableDelete> 块。
- 不要寒暄、复述正文、续写剧情或输出其他 XML 标签。
- VariableThink 使用“路径｜当前存在/不存在｜正文变化｜操作”，不展开思维链；时间变化额外简写“旧完整时间 + 耗时 = 新完整时间”。
- VariableInsert/VariableEdit/VariableDelete 内只能放严格 JSON 对象，不得使用注释、尾随逗号或 JSON5。
- 相同类型的操作合并到一个块中。
- 输出前再次核对：操作类型正确、路径逐层嵌套、时间五字段完整且向前、地点逐字来自白名单。`;

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        summarySettings: {
          variablePromptTemplate: assistantOnlyLegacyTemplate,
        },
      }),
    );

    const template = loadSettings().summarySettings.variablePromptTemplate;
    expect(template).toBe(createDefaultDisplaySettings().summarySettings.variablePromptTemplate);
    expect(template).toContain('{{latestUserBody}}');
    expect(template).toContain('{{latestAssistantBody}}');
  });

  it('preserves a customized 2026-08-27 assistant-only template and offers an update instead of overwriting it', () => {
    const customizedLegacyTemplate = `你是《金庸群侠传》ERA 变量更新模型。
任务是核对最新 assistant 正文已经发生的持久变化；不得续写剧情。

【前序只读完整轮次】
{{readonlyContextRounds}}

【当前变量上下文；JSON 是真实可写快照，方括号内容只读】
{{variableContext}}

【本轮唯一变化来源】
{{latestAssistantBody}}

【我的自定义规则】
优先保留我自己的变量判定补充。

【最终执行要求】
1. 只有上方 latestAssistantBody 是本轮变化来源；前序对话只用于理解上下文。`;

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        summarySettings: {
          variablePromptTemplate: customizedLegacyTemplate,
        },
      }),
    );

    const template = loadSettings().summarySettings.variablePromptTemplate;
    expect(template).toBe(customizedLegacyTemplate);
    expect(shouldOfferVariablePromptTemplateUpdate(template)).toBe(true);
  });

  it('preserves customized recentBodies-era templates verbatim and offers an update', () => {
    const customizedLegacyTemplate =
      '【最近 5 层正文，已剥离旧 ERA 变量块，按旧到新排列】\n{{recentBodies}}\n【当前变量上下文，来自输出提示词渲染结果或等价快照】\n{{variableContext}}\n{{variableGuidance}}\n{{locationContext}}\n【我的自定义规则】\n不要覆盖这一段。';

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        summarySettings: {
          variablePromptTemplate: customizedLegacyTemplate,
        },
      }),
    );

    const template = loadSettings().summarySettings.variablePromptTemplate;
    expect(template).toBe(customizedLegacyTemplate);
    expect(shouldOfferVariablePromptTemplateUpdate(template)).toBe(true);
  });

  it('does not flag an unrelated custom variable prompt merely because it omits latestUserBody', () => {
    const customTemplate =
      'CUSTOM VARIABLE PROMPT\\n{{readonlyContextRounds}}\\n{{latestAssistantBody}}\\n{{variableContext}}';

    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        summarySettings: {
          variablePromptTemplate: customTemplate,
        },
      }),
    );

    const template = loadSettings().summarySettings.variablePromptTemplate;
    expect(template).toBe(customTemplate);
    expect(shouldOfferVariablePromptTemplateUpdate(template)).toBe(false);
  });

  describe('preset storage cleanup', () => {
    const thinkingRule = {
      id: 'thinking',
      pattern: '/<thinking>[\\s\\S]*?<\\/thinking>/gi',
      replacement: '<details>美化后的思维链</details>',
      enabled: true,
      description: '折叠思维链',
      originScope: 'preset' as const,
    };

    it('removes only player-confirmed preset matches while preserving ERA diagnostic blocks', () => {
      const input = [
        '<thinking>预设思维链</thinking>',
        '正文仍然保留。',
        '<VariableThink>',
        '世界信息.时间｜当前存在｜正文无变化｜无操作',
        '</VariableThink>',
      ].join('\n\n');
      const signature = getRegexRuleContentSignature(thinkingRule);

      const result = stripSelectedPresetRegexMatches(input, [thinkingRule], [signature]);

      expect(result).not.toContain('<thinking>');
      expect(result).toContain('正文仍然保留。');
      expect(result).toContain('<VariableThink>');
      expect(result).toContain('世界信息.时间｜当前存在｜正文无变化｜无操作');
    });

    it('allows complete thinking blocks above the 80% threshold while keeping a short body', () => {
      const input = '<thinking>长思维链长思维链长思维链长思维链长思维链</thinking>正文';
      const signature = getRegexRuleContentSignature(thinkingRule);

      expect(stripSelectedPresetRegexMatches(input, [thinkingRule], [signature])).toBe('正文');
    });

    it('also treats a complete <think> block as safely removable above the 80% threshold', () => {
      const thinkRule = {
        ...thinkingRule,
        id: 'think-short-tag',
        pattern: '/<think>[\\s\\S]*?<\\/think>/gi',
      };
      const input = '<think>长思维链长思维链长思维链长思维链长思维链</think>正文';
      const signature = getRegexRuleContentSignature(thinkRule);

      expect(stripSelectedPresetRegexMatches(input, [thinkRule], [signature])).toBe('正文');
    });

    it('keeps a compatibility think/thinking regex as the exact matched XML block', () => {
      const compatibilityRule = {
        ...thinkingRule,
        id: 'thinking-compatible',
        pattern: '/\\<(?:think|thinking)>([\\s\\S]*?)\\<\\/(?:think|thinking)>/gi',
      };
      const recommendation = getPresetStorageCleanupRecommendation(compatibilityRule);
      const signature = getRegexRuleContentSignature(compatibilityRule);

      expect(recommendation).toMatchObject({
        kind: 'recommended',
        allowLargeMatch: true,
      });
      expect(recommendation.matchDescription).toContain('<think|thinking>');
      expect(
        stripSelectedPresetRegexMatches(
          '<thinking>很长很长很长很长很长很长很长很长的思维内容</thinking>正文',
          [compatibilityRule],
          [signature],
        ),
      ).toBe('正文');
    });

    it('recognizes a thinking prefix ending at a special marker without inventing a wider regex', () => {
      const markerRule = {
        ...thinkingRule,
        id: 'thinking-end-marker',
        pattern: '/^[\\s\\S]*?【思维链结束】/i',
        replacement: '',
        description: '思维链特殊结束标记',
      };
      const recommendation = getPresetStorageCleanupRecommendation(markerRule);
      const signature = getRegexRuleContentSignature(markerRule);

      expect(recommendation).toMatchObject({
        kind: 'recommended',
        matchDescription: '思维链前缀块：从回复开头到结束标记（含标记）',
        allowLargeMatch: true,
      });
      expect(
        stripSelectedPresetRegexMatches(
          '很长很长很长很长很长很长很长很长的无标签思维链【思维链结束】正文',
          [markerRule],
          [signature],
        ),
      ).toBe('正文');
    });

    it('does not reinterpret separate opening/closing-tag alternatives as a whole XML block', () => {
      const tagOnlyRule = {
        ...thinkingRule,
        id: 'tag-only',
        pattern: '/<Interleaving>\\n?|<\\/Interleaving>/g',
        replacement: '',
        description: '标签剥离',
      };

      expect(getPresetStorageCleanupRecommendation(tagOnlyRule)).toMatchObject({
        kind: 'manual',
        allowLargeMatch: false,
        matchDescription: '原正则实际命中的区间（清理时整段删除，不执行 replacement）',
      });
    });

    it('protects the configured preset summary XML block from module filtering', () => {
      const summaryRule = {
        ...thinkingRule,
        id: 'memory',
        pattern: '/<memory>[\\s\\S]*?<\\/memory>/gi',
        description: '摘要显示美化',
      };
      const input = '足够长的正文内容，用于确认不是安全阈值阻止删除。\n<memory>必须保留的摘要</memory>';
      const signature = getRegexRuleContentSignature(summaryRule);

      expect(stripSelectedPresetRegexMatches(input, [summaryRule], [signature], '<memory>')).toBe(input);
    });

    it('still refuses a selected non-thinking regex that would erase almost the whole reply', () => {
      const wholeReplyRule = {
        ...thinkingRule,
        id: 'whole',
        pattern: '/[\\s\\S]+/g',
        description: '整楼替换',
      };
      const input = '正文第一段\n\n正文第二段';
      const signature = getRegexRuleContentSignature(wholeReplyRule);

      expect(stripSelectedPresetRegexMatches(input, [wholeReplyRule], [signature])).toBe(input);
    });

    it('normalizes persisted cleanup signatures by preset', () => {
      window.localStorage.setItem(
        'wuxia_display_settings',
        JSON.stringify({
          presetStorageExcludedRegexSignaturesByPreset: {
            '  测试预设  ': [' sig-a ', 'sig-a', '', 123],
          },
        }),
      );

      expect(loadSettings().presetStorageExcludedRegexSignaturesByPreset).toEqual({
        测试预设: ['sig-a'],
      });
    });

    it('normalizes XML module input and persists the new per-preset module filter state', () => {
      expect(normalizePresetXmlModuleInput('thinking')).toBe('thinking');
      expect(normalizePresetXmlModuleInput('<Thinking>')).toBe('thinking');
      expect(normalizePresetXmlModuleInput('<memory>...</memory>')).toBe('memory');
      expect(normalizePresetXmlModuleInput('<not valid')).toBeNull();

      window.localStorage.setItem(
        'wuxia_display_settings',
        JSON.stringify({
          presetModuleFilterEnabledByPreset: {
            '  测试预设  ': true,
          },
          presetModuleFilterSelectedTagsByPreset: {
            '  测试预设  ': [' Thinking ', '<tucao>', 'thinking', 123],
          },
          presetModuleFilterCustomTagsByPreset: {
            '  测试预设  ': ['Memory', '<aside>'],
          },
        }),
      );

      const loaded = loadSettings();
      expect(loaded.presetModuleFilterEnabledByPreset).toEqual({ 测试预设: true });
      expect(loaded.presetModuleFilterSelectedTagsByPreset).toEqual({
        测试预设: ['thinking', 'tucao'],
      });
      expect(loaded.presetModuleFilterCustomTagsByPreset).toEqual({
        测试预设: ['memory', 'aside'],
      });
    });

    it('removes selected XML modules while protecting summary and ERA blocks', () => {
      const input = [
        '<thinking>内部思考</thinking>',
        '正文',
        '<summary>保留摘要</summary>',
        '<era_data>{"ok":true}</era_data>',
      ].join('\n');

      const result = stripSelectedXmlModules(input, ['thinking', 'summary', 'era_data']);

      expect(result).not.toContain('<thinking>');
      expect(result).toContain('正文');
      expect(result).toContain('<summary>保留摘要</summary>');
      expect(result).toContain('<era_data>{"ok":true}</era_data>');
    });
  });

  describe('default builtin regex rules', () => {
    it('includes all 4 builtin rules in default display settings', () => {
      const settings = createDefaultDisplaySettings();
      expect(settings.localRegexRules.map(r => r.id)).toEqual([
        'era-base-regex',
        'wuxia-filter-event-audit',
        'wuxia-filter-event-stage-tag',
        'wuxia-beauty-battle-check',
      ]);
      expect(BUILTIN_LOCAL_REGEX_RULES).toHaveLength(4);
    });

    it('migrates legacy local regex settings by appending missing builtin rules', () => {
      window.localStorage.setItem(
        'wuxia_display_settings',
        JSON.stringify({
          localRegexRules: [
            {
              id: 'era-base-regex',
              pattern: '/<era_data>{.*?}<\\/era_data>/gi',
              replacement: '',
              enabled: true,
              description: 'ERA基础正则',
              originScope: 'manual',
            },
          ],
        }),
      );

      const loaded = loadSettings();
      const ids = loaded.localRegexRules.map(r => r.id);
      expect(ids).toContain('era-base-regex');
      expect(ids).toContain('wuxia-filter-event-audit');
      expect(ids).toContain('wuxia-filter-event-stage-tag');
      expect(ids).toContain('wuxia-beauty-battle-check');
    });

    it('filters out <event_audit> and <transition_audit> tags', () => {
      const input = `<event_audit>
01｜状态｜裁定=官兵包围至全歼追兵与掩埋现场｜依据=射雕第一回04事件开始，追兵夜袭牛家村
02｜连续｜裁定=自把酒言欢突闻异响推进至丘处机斩尽追兵、验明身份并为包惜弱诊脉｜依据=承接定名立约，推进至追兵覆灭
03｜干涉｜裁定=原定｜依据=用户未做偏离干涉，顺应原事件发展
04｜隔离｜裁定=只演当前事件｜依据=专注完成射雕第一回04，不提前进入完颜洪烈中箭获救等后续
</event_audit>
风雪漫天，丘处机长剑出鞘。
<transition_audit>
01｜目标｜裁定=跟随线索｜依据=时间地点
02｜承接｜裁定=余波｜依据=实质变化
03｜过程｜裁定=赶路｜依据=距离
04｜止点｜裁定=停在事前｜依据=未演出
</transition_audit>`;

      const result = applyRegexRules(input, [EVENT_AUDIT_REGEX_RULE]);
      expect(result.trim()).toBe('风雪漫天，丘处机长剑出鞘。');
    });

    it('filters out event stage short tags like <射雕第一回04>', () => {
      const input = `风雪漫天，丘处机长剑出鞘。
<射雕第一回04>
追兵合围夜袭|树上反杀全歼|搜证掩埋诊脉
已完成|已完成|已完成
</射雕第一回04>`;

      const result = applyRegexRules(input, [EVENT_STAGE_TAG_REGEX_RULE]);
      expect(result.trim()).toBe('风雪漫天，丘处机长剑出鞘。');
    });

    it('beautifies <战斗判定> block into wuxia battle card HTML', () => {
      const input = `<战斗判定>
先手: 角色A.水上漂=1234
后手: 角色B.降龙十八掌=5465
公式: 45 + round(50*(1234-5465)/max(1234,5465)) + 随机数1(7) + 环境因素·在水上逃跑(+10) + 状态因素·被B震慑(-5)
计算: 45 - 39 + 7 + 10 - 5 = 18
结果: 失败
叙事: 角色A未能完全避开掌力，只避开了要害，仍被击退并受伤。
</战斗判定>`;

      const result = applyRegexRules(input, [BATTLE_CHECK_REGEX_RULE]);
      expect(result).toContain('class="wuxia-battle-card"');
      expect(result).toContain('【 失败 】');
      expect(result).toContain('角色A.水上漂=1234');
      expect(result).toContain('角色B.降龙十八掌=5465');
      expect(result).toContain('角色A未能完全避开掌力，只避开了要害，仍被击退并受伤。');
      expect(result).toContain('45 - 39 + 7 + 10 - 5 = 18');
      expect(result).toContain('<details class="wuxia-battle-details">');
      expect(result).not.toContain('<战斗判定>');
    });

    it('processes full response pipeline cleanly using display regex rules', () => {
      const settings = createDefaultDisplaySettings();
      const rules = getRegexRulesForDisplay(settings, 'default');

      const fullAssistantReply = `<event_audit>
01｜状态｜裁定=官兵包围至全歼追兵与掩埋现场｜依据=射雕第一回04事件开始，追兵夜袭牛家村
02｜连续｜裁定=自把酒言欢突闻异响推进至丘处机斩尽追兵、验明身份并为包惜弱诊脉｜依据=承接定名立约，推进至追兵覆灭
03｜干涉｜裁定=原定｜依据=用户未做偏离干涉，顺应原事件发展
04｜隔离｜裁定=只演当前事件｜依据=专注完成射雕第一回04，不提前进入完颜洪烈中箭获救等后续
</event_audit>
风雪之中，数名黑衣追兵围拢而上！

<战斗判定>
先手: 角色A.水上漂=1234
后手: 角色B.降龙十八掌=5465
公式: 45 + round(50*(1234-5465)/max(1234,5465)) + 随机数1(7) + 环境因素·在水上逃跑(+10) + 状态因素·被B震慑(-5)
计算: 45 - 39 + 7 + 10 - 5 = 18
结果: 失败
叙事: 角色A未能完全避开掌力，只避开了要害，仍被击退并受伤。
</战斗判定>

杨铁心挺枪上前，喝道：“何方贼子！”

<射雕第一回04>
追兵合围夜袭|树上反杀全歼|搜证掩埋诊脉
已完成|已完成|已完成
</射雕第一回04>`;

      const rendered = applyRegexRules(fullAssistantReply, rules);

      expect(rendered).not.toContain('<event_audit>');
      expect(rendered).not.toContain('01｜状态｜裁定');
      expect(rendered).not.toContain('<射雕第一回04>');
      expect(rendered).not.toContain('追兵合围夜袭|树上反杀全歼|搜证掩埋诊脉');
      expect(rendered).toContain('风雪之中，数名黑衣追兵围拢而上！');
      expect(rendered).toContain('杨铁心挺枪上前，喝道：“何方贼子！”');
      expect(rendered).toContain('class="wuxia-battle-card"');
      expect(rendered).toContain('【 失败 】');
    });
  });
});
