import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cotSource = readFileSync(resolve(process.cwd(), '世界书/金庸群侠传1/世界书/cot.txt'), 'utf8');

function renderCot(参与事件: unknown, 后续事件线索: unknown): string {
  const blocks = /<%([\s\S]*?)%>/g;
  let cursor = 0;
  let body = "let output = '';\n";

  for (const block of cotSource.matchAll(blocks)) {
    body += 'output += ' + JSON.stringify(cotSource.slice(cursor, block.index)) + ';\n';
    let code = block[1];
    if (code.trimEnd().endsWith('-')) code = code.trimEnd().slice(0, -1);
    if (code.startsWith('-')) {
      body += 'output += String((' + code.slice(1).trim() + ') ?? \'\');\n';
    } else {
      body += code + '\n';
    }
    cursor = (block.index || 0) + block[0].length;
  }

  body += 'output += ' + JSON.stringify(cotSource.slice(cursor)) + ';\nreturn output;';
  const getvar = (path: string): unknown => {
    if (path === 'stat_data.参与事件') return 参与事件;
    if (path === 'stat_data.后续事件线索') return 后续事件线索;
    return undefined;
  };
  return (new Function('getvar', body) as (getvar: (path: string) => unknown) => string)(getvar);
}

describe('武侠 COT 条件审查契约', () => {
  it('引用实际正文模型上下文而不是不存在的输入与变量模型标签', () => {
    expect(cotSource).toContain('本轮最新的 User 消息');
    expect(cotSource).toContain('不是一个名为<user输入>的 XML 标签');
    expect(cotSource).toContain('<时间>、<玩家>、<角色数据>、<可用地点>');
    expect(cotSource).toContain('额外变量模型专用的<variable>');
    expect(cotSource).toContain('<合理性审查>');
    expect(cotSource).toContain('<card_thinking>');
  });

  it('有参与事件时仅注入事件记录规则和连续 01～07 审查', () => {
    const output = renderCot({ '天龙第二回06-测试': { 描述: '入秘洞' } }, { 下一回: '后续线索' });
    expect(output).toContain('<事件记录规则>');
    expect(output).toContain('正文之后，根据实际发生的事实输出完整<事件记录>');
    expect(output).toContain('正文 → <事件记录> → <summary>');
    for (let i = 1; i <= 7; i += 1) {
      expect(output).toMatch(new RegExp('^' + String(i).padStart(2, '0') + '\\.', 'm'));
    }
    expect(output).not.toMatch(/^08\./m);
    expect(output).not.toContain('04. 读取<后续事件线索>');
    expect(output).toContain('<card_thinking>');
  });

  it('仅有后续线索时注入 01～05 审查，不要求事件记录', () => {
    const output = renderCot({}, { '天龙第二回07-测试': '前往后续地点' });
    expect(output).not.toContain('<事件记录规则>');
    expect(output).toContain('04. 读取<后续事件线索>');
    expect(output).toContain('05. 是否存在玩家尚未参与目标事件');
    expect(output).not.toMatch(/^06\./m);
    expect(output).toContain('当前没有参与事件，不得生成<事件记录>');
  });

  it('自由探索和只有 $template 的参与事件均只保留 01～03', () => {
    for (const participation of [{}, { $template: {} }, null]) {
      const output = renderCot(participation, {});
      expect(output).toContain('01. 读取<合理性审查>');
      expect(output).toContain('02. 是否存在过滤玩家输入时');
      expect(output).toContain('03. 读取正文当前状态');
      expect(output).not.toMatch(/^04\./m);
      expect(output).not.toContain('<事件记录规则>');
    }
  });
});
