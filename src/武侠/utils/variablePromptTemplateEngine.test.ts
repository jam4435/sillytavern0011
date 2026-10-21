import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VARIABLE_PROMPT_SLOT_META,
  renderVariableConditionalTemplate,
  renderVariableData,
  renderVariableInput,
  renderVariableModelPrompt,
  type VariablePromptSlots,
} from './variablePromptTemplateEngine';

const makeSlots = (overrides: Partial<VariablePromptSlots> = {}): VariablePromptSlots => ({
  readonlyContextRounds: '[]',
  latestUserBody: '{"content":"user"}',
  latestAssistantBody: '{"content":"assistant"}',
  variableData: '',
  worldContext: '世界信息:{时间:{年:1200}}',
  playerContext: 'user数据:{修为:100}',
  participationEvents: '',
  tasks: '',
  relevantCharacters: '',
  locationContext: '当前地点:大宋/临安府/牛家村',
  cultivationReference: '',
  ...overrides,
});

describe('variablePromptTemplateEngine', () => {
  it('由代码固定生成 variable 数据块，并只输出有内容的可选区块', () => {
    const rendered = renderVariableData(makeSlots({ participationEvents: '事件记录', relevantCharacters: '角色数据:{郭靖:{}}' }));
    expect(rendered).toContain('<当前时间>\n世界信息:{时间:{年:1200}}\n</当前时间>');
    expect(rendered).toContain('<参与事件>\n事件记录\n</参与事件>');
    expect(rendered).toContain('<角色数据>\n角色数据:{郭靖:{}}\n</角色数据>');
    expect(rendered).not.toContain('<任务>');
    expect(rendered).not.toContain('<修为>');
  });

  it('由代码固定生成前序轮次、本轮 User、本轮正文和 variable 的顺序', () => {
    const slots = makeSlots();
    slots.variableData = renderVariableData(slots);
    const rendered = renderVariableInput(slots);
    expect(rendered.indexOf('<前序只读轮次>')).toBeLessThan(rendered.indexOf('<本轮User>'));
    expect(rendered.indexOf('<本轮User>')).toBeLessThan(rendered.indexOf('<本轮正文>'));
    expect(rendered.indexOf('<本轮正文>')).toBeLessThan(rendered.indexOf('<variable>'));
  });

  it('主提示词骨架固定拼接叙事标尺、输入、变量模板和变量指导', () => {
    const rendered = renderVariableModelPrompt({
      narrativeScale: '传说：不得操纵时间空间。',
      variableInputContext: '<本轮正文>正文</本轮正文>',
      variableTemplate: '<变量模板>schema</变量模板>',
      variableGuidance: '# ERA 变量更新规则',
    });
    expect(rendered).toContain('你是《金庸群侠传》ERA 变量更新模型。');
    expect(rendered).toContain('<叙事表现标尺>\n传说：不得操纵时间空间。\n</叙事表现标尺>');
    expect(rendered).toContain('<变量模板>schema</变量模板>');
    expect(rendered).toContain('# ERA 变量更新规则');
  });

  it('变量指导继续支持 @if / @else 条件块', () => {
    const template = ['before', '@if participationEvents', 'event-rules', '@else', 'normal-rules', '@endif', 'after'].join('\n');
    expect(renderVariableConditionalTemplate(template, makeSlots())).toBe('before\nnormal-rules\nafter');
    expect(renderVariableConditionalTemplate(template, makeSlots({ participationEvents: '参与事件.测试' }))).toBe('before\nevent-rules\nafter');
  });

  it('会拒绝多余、重复、未知或未闭合的条件模板语法', () => {
    expect(() => renderVariableConditionalTemplate('@else\nfoo', makeSlots())).toThrow('多余的 @else');
    expect(() => renderVariableConditionalTemplate('@if participationEvents\na\n@else\nb\n@else\nc\n@endif', makeSlots())).toThrow('重复的 @else');
    expect(() => renderVariableConditionalTemplate('{{unknownSlot}}', makeSlots())).toThrow('未知占位符');
    expect(() => renderVariableConditionalTemplate('@if participationEvents\nfoo', makeSlots())).toThrow('未闭合');
  });

  it('每个公开 slot 都带可检查的说明元数据', () => {
    for (const meta of VARIABLE_PROMPT_SLOT_META) {
      expect(meta.name).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.source).toBeTruthy();
      expect(meta.emptyBehavior).toBeTruthy();
    }
  });
});


describe('变量模型显式分点检查契约', () => {
  const guidance = readFileSync(resolve(process.cwd(), 'src/武侠/prompts/变量指导.txt'), 'utf8');
  const checkNumbers = (text: string) => [...text.matchAll(/^(\d{2})\./gm)].map(match => Number(match[1]));

  it('有参与事件时仅保留 01～08，采信正文事件记录而不重判完成状态', () => {
    const rendered = renderVariableConditionalTemplate(guidance, makeSlots({ participationEvents: '参与事件.测试' }));
    expect(checkNumbers(rendered)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rendered).toContain('不自行重判完成情况');
    expect(rendered).toContain('缺失或不匹配时不臆造阶段进度');
    expect(rendered).toContain('按记录的阶段总数等分事件时间窗口');
    expect(rendered).toContain('参与事件按第4节阶段规则推进');
  });

  it('无参与事件时仅保留 01～06，时间根据正文实际耗时判断', () => {
    const rendered = renderVariableConditionalTemplate(guidance, makeSlots());
    expect(checkNumbers(rendered)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rendered).toContain('旧完整时间加实际耗时计算新时间');
    expect(rendered).not.toContain('不自行重判完成情况');
    expect(rendered).not.toContain('按记录的阶段总数等分事件时间窗口');
  });

  it('要求完整非空 VariableThink、正向判断与操作一致', () => {
    expect(guidance).toContain('“编号｜是/否｜简短依据”');
    expect(guidance).toContain('“是”表示该项判断与拟写操作符合规则');
    expect(guidance).toContain('不得漏项、跳号、合并或复述题目');
    expect(guidance).toContain('最终操作须与检查结果一致');
    expect(guidance).toContain('唯一非空<VariableThink>');
    expect(guidance).not.toContain('只输出一个闭合的<VariableThink></VariableThink>');
  });

  it('时间规则按事件和非事件区分，不再反对按事件阶段等分', () => {
    expect(guidance).toContain('参与事件按第4节阶段规则推进');
    expect(guidance).toContain('无参与事件时按正文实际过程判断耗时');
    expect(guidance).not.toContain('事件总时长机械均摊');
    expect(guidance).toContain('不按回复篇幅或回合数机械推算');
  });
});
