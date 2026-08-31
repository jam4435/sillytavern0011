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
  getRegexRulesForDisplay,
  getThemeAppearanceDefaults,
  loadSettings,
  saveSettings,
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
    expect(template).toContain('{{latestAssistantBody}}');
    expect(template.indexOf('{{narrativeScale}}')).toBeLessThan(template.indexOf('{{variableGuidance}}'));
    expect(template.indexOf('{{variableGuidance}}')).toBeLessThan(template.indexOf('{{latestAssistantBody}}'));
    expect(template.indexOf('{{latestAssistantBody}}')).toBeLessThan(template.indexOf('【最终执行要求】'));
    expect(template).toContain('时间是禁止稀疏更新的原子对象');
    expect(template).toContain('旧完整时间 + 正文耗时 = 新完整时间');
    expect(template).toContain('{"世界信息":{"时间":{"年":1200,"月":8,"日":15,"时":13,"分":10}}}');
    expect(template).toContain('禁止只写“分:10”');
  });

  it('updates legacy default-template labels without changing custom placeholders', () => {
    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        summarySettings: {
          variablePromptTemplate:
            '【最近 5 层正文，已剥离旧 ERA 变量块，按旧到新排列】\n{{recentBodies}}\n【当前变量上下文，来自输出提示词渲染结果或等价快照】\n{{variableContext}}\n{{variableGuidance}}\n{{locationContext}}',
        },
      }),
    );

    const template = loadSettings().summarySettings.variablePromptTemplate;
    expect(template).toContain('最新 assistant 正文是唯一变化来源');
    expect(template).toContain('专用严格 JSON 投影');
    expect(template).toContain('{{recentBodies}}');
    expect(template).toContain('{{variableContext}}');
    expect(template).toContain('{{variableGuidance}}');
    expect(template).toContain('{{locationContext}}');
    expect(template).not.toContain('最近 5 层正文');
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
