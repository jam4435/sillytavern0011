import { describe, expect, it } from 'vitest';
import { extractOrderedVariableActionBlocks, stripCodeFence } from './string';

describe('ERA 变量块解析', () => {
  it('按正文原始出现次序提取 Delete 再 Insert，不按类型重排', () => {
    const text = [
      '<VariableEdit>{"世界信息":{"时间":{"分":12}}}</VariableEdit>',
      '<VariableDelete>{"事件系统":{"人物事件占用":{"段誉":{}}}}</VariableDelete>',
      '<VariableInsert>{"事件系统":{"人物事件占用":{"段誉":{"事件名":"第07事件"}}}}</VariableInsert>',
    ].join('\n');

    const blocks = extractOrderedVariableActionBlocks(text);
    expect(blocks.map(block => block.tag)).toEqual(['VariableEdit', 'VariableDelete', 'VariableInsert']);
    expect(JSON.parse(blocks[2].body).事件系统.人物事件占用.段誉.事件名).toBe('第07事件');
  });

  it('变量 JSON 包在带语言标记的 Markdown 代码围栏中时能正确清理', () => {
    const text = '<VariableInsert>\n```json\n{"参与事件":{"事件07":{"结局":"进行中"}}}\n```\n</VariableInsert>';
    const blocks = extractOrderedVariableActionBlocks(text);

    expect(blocks).toEqual([{
      tag: 'VariableInsert',
      body: '{"参与事件":{"事件07":{"结局":"进行中"}}}',
    }]);
    expect(stripCodeFence('~~~json\n{"a":1}\n~~~')).toBe('{"a":1}');
  });
});
