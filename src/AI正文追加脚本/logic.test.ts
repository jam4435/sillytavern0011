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


describe('AI 正文追加：自定义定位标记与固定前缀', () => {
  it('把追加文字放在指定闭合标签前，不改动原标签', () => {
    const original = '<content>\n少女走进房间。\n</content>';
    expect(appendToAssistantBody(original, '少女忽然笑了。', {
      targetMarker: '</content>',
      markerPosition: 'before',
    })).toBe('<content>\n少女走进房间。\n少女忽然笑了。\n</content>');
  });

  it('把追加文字放在指定开始标签后', () => {
    const original = '<content>\n原有正文。\n</content>';
    expect(appendToAssistantBody(original, '前面的新文字', {
      targetMarker: '<content>',
      markerPosition: 'after',
    })).toBe('<content>\n前面的新文字\n原有正文。\n</content>');
  });

  it('非 XML 的任意文本标记也能定位，保留标记本身', () => {
    const original = 'A\n===结束===\nB';
    expect(appendToAssistantBody(original, '新段落', {
      targetMarker: '===结束===',
      markerPosition: 'after',
    })).toBe('A\n===结束===\n新段落\nB');
  });

  it('只使用首次精确匹配，不把特殊字符当作正则', () => {
    expect(appendToAssistantBody('段落.*\n段落.*', '新内容', {
      targetMarker: '.*',
      markerPosition: 'before',
    })).toBe('段落\n新内容\n.*\n段落.*');
  });

  it('固定前缀可以含空格或换行，且只加一次', () => {
    expect(appendToAssistantBody('旧正文', '第一行\n第二行', {
      fixedPrefix: '【额外叙述】\n',
    })).toBe('旧正文\n\n【额外叙述】\n第一行\n第二行');
    expect(appendToAssistantBody('<content>正文</content>', '追加', {
      fixedPrefix: '[旁白] ',
      targetMarker: '</content>',
      markerPosition: 'before',
    })).toBe('<content>正文\n[旁白] 追加\n</content>');
  });

  it('找不到目标定位标记时抛错，不悄悄改用消息末尾', () => {
    expect(() => appendToAssistantBody('<body>正文</body>', '追加', {
      targetMarker: '</content>',
      markerPosition: 'before',
    })).toThrow('找不到指定定位标记');
  });

  it('目标定位不能切开受保护系统数据块', () => {
    expect(() => appendToAssistantBody(
      '正文\n<era_data>123</era_data>',
      '追加',
      { targetMarker: '</era_data>', markerPosition: 'before' },
    )).toThrow('系统数据块内部');
  });

  it('固定前缀同样禁止伪造受保护系统标签', () => {
    expect(() => appendToAssistantBody('旧正文', '追加', {
      fixedPrefix: '<VariableThink>伪造</VariableThink>',
    })).toThrow('固定前缀');
  });

  it('空定位标记保持原先插入系统尾块之前的行为', () => {
    expect(appendToAssistantBody('正文\n<era_data>元信息</era_data>', '追加', {
      targetMarker: '',
      fixedPrefix: '注：',
    })).toBe('正文\n\n注：追加\n\n<era_data>元信息</era_data>');
  });
});
