import { describe, expect, it } from 'vitest';
import {
  VARIABLE_PROMPT_SLOT_META,
  renderVariableConditionalTemplate,
  renderVariableInputTemplate,
  type VariablePromptSlots,
} from './variablePromptTemplateEngine';

const makeSlots = (overrides: Partial<VariablePromptSlots> = {}): VariablePromptSlots => ({
  readonlyContextRounds: '[]',
  latestUserBody: '{"content":"user"}',
  latestAssistantBody: '{"content":"assistant"}',
  worldContext: '{"时间":"now"}',
  playerContext: '{"修为":100}',
  participationEvents: '',
  tasks: '',
  followupClues: '',
  relevantCharacters: '',
  locationContext: '<可用地点>测试</可用地点>',
  cultivationReference: '',
  decisionChecklist: '检查变量',
  ...overrides,
});

describe('variablePromptTemplateEngine', () => {
  it('只在 slot 非空时渲染 @if 区块', () => {
    const template = [
      '<root>',
      '@if participationEvents',
      '{{participationEvents}}',
      '@endif',
      '@if relevantCharacters',
      '<chars>{{relevantCharacters}}</chars>',
      '@endif',
      '</root>',
    ].join('\n');

    expect(renderVariableInputTemplate(template, makeSlots())).toBe('<root>\n</root>');
    expect(
      renderVariableInputTemplate(
        template,
        makeSlots({ participationEvents: '<参与事件>事件</参与事件>', relevantCharacters: '{"郭靖":{}}' }),
      ),
    ).toContain('<参与事件>事件</参与事件>');
  });

  it('支持 @else，并可用于变量指导等非输入模板', () => {
    const template = [
      'before',
      '@if participationEvents',
      'event-rules',
      '@else',
      'normal-rules',
      '@endif',
      'after',
    ].join('\n');

    expect(renderVariableConditionalTemplate(template, makeSlots())).toBe('before\nnormal-rules\nafter');
    expect(
      renderVariableConditionalTemplate(template, makeSlots({ participationEvents: '参与事件.测试' })),
    ).toBe('before\nevent-rules\nafter');
  });

  it('会拒绝多余或重复的 @else', () => {
    expect(() => renderVariableConditionalTemplate('@else\nfoo', makeSlots())).toThrow('多余的 @else');
    expect(() =>
      renderVariableConditionalTemplate(
        '@if participationEvents\na\n@else\nb\n@else\nc\n@endif',
        makeSlots(),
      ),
    ).toThrow('重复的 @else');
  });

  it('未知 slot 和未闭合条件会明确报错', () => {
    expect(() => renderVariableInputTemplate('{{unknownSlot}}', makeSlots())).toThrow('未知占位符');
    expect(() => renderVariableInputTemplate('@if participationEvents\nfoo', makeSlots())).toThrow('未闭合');
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
