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
