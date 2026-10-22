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
  it('公共检查引用真实上下文，使用正向是/否判定', () => {
    expect(cotSource).toContain('本轮最新 User 消息');
    expect(cotSource).not.toContain('<user输入>');
    expect(cotSource).not.toContain('<variable>');
    expect(cotSource).toContain('<合理性审查>');
    expect(cotSource).toContain('读取<合理性审查>及<系统信息>中的<玩家>、<角色数据>、<时间>、<可用地点>');
    expect(cotSource).toContain('<card_thinking要求>');
    expect(cotSource).toContain('“是”表示满足条件；“否”表示未满足');
    expect(cotSource).toContain('无对应情形时记“是”');
    expect(cotSource).toContain('04. 本轮拟发生打斗/比试时');
  });

  it('参与事件仅注入 01～08 审查，正文之后逐阶段验收', () => {
    const output = renderCot({ '天龙第二回06-测试': { 描述: '入秘洞' } }, { 下一回: '后续线索' });
    expect(output).toContain('<事件记录规则>');
    expect(output).toContain('每阶段对应一个独立完成结果');
    expect(output).toContain('准备不等于完成');
    expect(output).toContain('全部必要结果成立才可标记已完成');
    expect(output).toContain('正文后输出<事件记录>时');
    expect(output).toContain('保持历史阶段名称、数量与顺序');
    expect(output).toContain('07. 是否仅根据历史已确认事实判断起始进度');
    expect(output.match(/^\d{2}\./gm)?.map(x => Number(x.slice(0, 2)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(output).not.toContain('05. 读取<后续事件线索>');
  });

  it('仅有后续线索时注入 01～07 审查，保持接驳边界与自然推进', () => {
    const output = renderCot({}, { '天龙第二回07-测试': '前往后续地点' });
    expect(output).not.toContain('<事件记录规则>');
    expect(output).toContain('05. 读取<后续事件线索>、本轮最新 User 消息及<可用地点>');
    expect(output).toContain('未主动干预且未明确拒绝时');
    expect(output).toContain('06. 是否仅将<后续事件线索>视为待触发线索');
    expect(output).toContain('07. 读取<系统信息>中的<时间>、<可用地点>及最近正文');
    expect(output.match(/^\d{2}\./gm)?.map(x => Number(x.slice(0, 2)))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(output).not.toContain('每阶段对应一个独立完成结果');
  });

  it('自由探索与仅有模板变量时注入 01～05，不生成参与事件规则', () => {
    for (const participation of [{}, { $template: {} }, null]) {
      const output = renderCot(participation, {});
      expect(output).not.toContain('<事件记录规则>');
      expect(output).toContain('05. 读取<合理性审查>、本轮最新 User 消息和最近正文');
      expect(output.match(/^\d{2}\./gm)?.map(x => Number(x.slice(0, 2)))).toEqual([1, 2, 3, 4, 5]);
      expect(output).not.toContain('05. 读取<后续事件线索>');
    }
  });
});
