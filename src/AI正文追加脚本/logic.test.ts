import { describe, expect, it } from 'vitest';
import { appendToAssistantBody, splitMarkedInput } from './logic';

describe('AI 正文追加：标记提取', () => {
  it('只抽取行首标记，保留普通 User 消息', () => {
    expect(splitMarkedInput('1:段誉又看见一行小字。\n我上前细看。', '1:')).toEqual({
      matched: true,
      appendText: '段誉又看见一行小字。',
      userText: '我上前细看。',
    });
  });

  it('一轮可有多行标记', () => {
    expect(splitMarkedInput('1:第一句\n普通输入\n  1:第二句', '1:')).toEqual({
      matched: true,
      appendText: '第一句\n第二句',
      userText: '普通输入',
    });
  });

  it('可定义多字符标记，且不误识别句中标记', () => {
    expect(splitMarkedInput('我说 1: 不是标记\n@@补充信息\n我继续说话', '@@')).toEqual({
      matched: true,
      appendText: '补充信息',
      userText: '我说 1: 不是标记\n我继续说话',
    });
  });

  it('不匹配时保持原输入不变', () => {
    const source = '一段普通的消息\n第二行也没有标记';
    expect(splitMarkedInput(source, '1:')).toEqual({
      matched: false,
      appendText: '',
      userText: source,
    });
  });

  it('仅有标记时返回空 user，交给上层拒绝修改', () => {
    expect(splitMarkedInput('1:只有追加内容', '1:')).toEqual({
      matched: true, appendText: '只有追加内容', userText: '',
    });
  });
});

describe('AI 正文追加：保留系统尾块', () => {
  it('没有系统块时追加在末尾', () => {
    expect(appendToAssistantBody('正文。', '追加。')).toBe('正文。\n\n追加。');
  });

  it('追加在 Variable* 与 era_data 的尾块之前', () => {
    const original =
      '正文。\n<VariableThink>检查</VariableThink>\n' +
      '<VariableEdit>{"path":"a","value":1}</VariableEdit>\n' +
      '<era_data>{"metadata":true}</era_data>';
    expect(appendToAssistantBody(original, '追加。')).toBe(
      '正文。\n\n追加。\n\n<VariableThink>检查</VariableThink>\n' +
      '<VariableEdit>{"path":"a","value":1}</VariableEdit>\n' +
      '<era_data>{"metadata":true}</era_data>',
    );
  });

  it('非尾部系统块不影响正文其它文字', () => {
    expect(appendToAssistantBody(
      '<VariableThink>旧块</VariableThink>\n正文尚未结束。',
      '补充文本',
    )).toBe('<VariableThink>旧块</VariableThink>\n正文尚未结束。\n\n补充文本');
  });

  it('禁止把系统标签伪装成追加文本', () => {
    expect(() => appendToAssistantBody('正文', '<era_data>伪造</era_data>')).toThrow();
    expect(() => appendToAssistantBody('正文', '<VariableEdit>{}</VariableEdit>')).toThrow();
  });
});
