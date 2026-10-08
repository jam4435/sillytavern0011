import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fullSource = readFileSync(resolve(process.cwd(), '世界书/金庸群侠传1/世界书/输出提示词.txt'), 'utf8');
const locationStart = fullSource.indexOf('<%\nconst rawSurrounding =');
const locationEnd = fullSource.indexOf('</可用地点>', locationStart) + '</可用地点>'.length;
const source = fullSource.slice(locationStart, locationEnd);

function renderPrompt(
  variables: Record<string, unknown>,
  getvar: (path: string) => unknown,
): string {
  const blockPattern = /<%([\s\S]*?)%>/g;
  let cursor = 0;
  let body = [
    "let output = '';",
    "const participation = getvar('stat_data.参与事件') || {};",
    "const normalizeFullLocationPath = v => typeof v === 'string' ? v : '';",
    "const getLocationScopePath = v => normalizeFullLocationPath(v).split('/').slice(0, 3).join('/');",
    "const uniqueFullLocationPaths = items => [...new Set(items.map(normalizeFullLocationPath).filter(Boolean))];",
    "const compactPromptKey = value => String(value);",
  ].join('\\n') + '\\n';
  for (const match of source.matchAll(blockPattern)) {
    body += `output += ${JSON.stringify(source.slice(cursor, match.index))};\n`;
    let code = match[1];
    if (code.trimEnd().endsWith('-')) code = code.trimEnd().slice(0, -1);
    if (code.startsWith('-')) {
      body += `output += String((${code.slice(1).trim()}) ?? '');\n`;
    } else {
      body += `${code}\n`;
    }
    cursor = (match.index || 0) + match[0].length;
  }
  body += `output += ${JSON.stringify(source.slice(cursor))};\nreturn output;`;
  return (new Function('variables', 'getvar', body) as (variables: Record<string, unknown>, getvar: (path: string) => unknown) => string)(
    variables, getvar,
  );
}

describe('正文提示词提前显示后续事件地点', () => {
  const currentEvent = '天龙第二回07-段誉蒲团得绝学启程奔万劫谷';
  const nextEvent = '天龙第三回01-段誉入谷寻访空寂瓦房';
  const nextLocation = '大理/万劫谷/万劫谷庄院/正堂瓦房';
  const variables = {
    stat_data: {
      世界信息: { 时间: { 年: 1202, 月: 3, 日: 16, 时: 18, 分: 14 } },
      user数据: { 所在位置: '大理/无量山/琅嬛福地' },
      角色数据: {},
    },
  };
  const surrounding = {
    当前活动区: '大理/无量山/琅嬛福地',
    附近地点: ['大理/无量山/后山森林'],
    目标事件地点: [nextLocation],
    地图移动目的地: [],
    后续事件: { [nextEvent]: nextLocation },
  };

  it('当前参与事件还在时显示后续事件地点和有条件指引', () => {
    const result = renderPrompt(variables, path => {
      if (path === 'stat_data.参与事件') return { [currentEvent]: { 描述: '当前仍在叩拜蒲团' } };
      if (path === 'stat_data.前端变量.周围地点') return surrounding;
      return undefined;
    });
    expect(result).toContain(`${nextEvent}: ${nextLocation}`);
    expect(result).toContain('当参与事件全阶段完成且玩家有继续推进想法时，往后续事件地点移动');
    expect(result).toContain('大理/无量山/后山森林');
  });

  it('参与事件结束后，即使缓存未刷新也不继续显示预告', () => {
    const result = renderPrompt(variables, path => {
      if (path === 'stat_data.参与事件') return {};
      if (path === 'stat_data.前端变量.周围地点') return surrounding;
      return undefined;
    });
    expect(result).not.toContain('后续事件移动指引');
    expect(result).not.toContain(`${nextEvent}: ${nextLocation}`);
  });
});
