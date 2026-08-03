import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const promptPath = resolve(process.cwd(), '世界书/金庸群侠传1/世界书/输出提示词.txt');
const promptSource = readFileSync(promptPath, 'utf8');
const worldHistoryPromptPath = resolve(process.cwd(), '世界书/金庸群侠传1/世界书/战斗骰子.txt');
const worldHistoryPromptSource = readFileSync(worldHistoryPromptPath, 'utf8');
const cotPromptPath = resolve(process.cwd(), '世界书/金庸群侠传1/世界书/cot.txt');
const cotPromptSource = readFileSync(cotPromptPath, 'utf8');
const variableGuidancePath = resolve(process.cwd(), '世界书/金庸群侠传1/世界书/变量指导.txt');
const variableGuidanceSource = readFileSync(variableGuidancePath, 'utf8');
const worldBackgroundPath = resolve(process.cwd(), '世界书/金庸群侠传1/世界书/世界背景.yaml');
const worldBackgroundSource = readFileSync(worldBackgroundPath, 'utf8');

type PromptSerializer = (value: unknown) => string;
type PromptRenderer = (
  variables: Record<string, unknown>,
  getvar: (path: string, options?: Record<string, unknown>) => unknown,
) => string;

function loadPromptSerializer(): PromptSerializer {
  const serializerSource = promptSource.match(/\/\/ PROMPT_SERIALIZER_START([\s\S]*?)\/\/ PROMPT_SERIALIZER_END/)?.[1];

  if (!serializerSource) {
    throw new Error('输出提示词缺少可测试的严格 JSON 序列化代码块');
  }

  return new Function(`${serializerSource}\nreturn toStrictJson;`)() as PromptSerializer;
}

function compilePromptRenderer(source = promptSource): PromptRenderer {
  const ejsBlock = /<%([\s\S]*?)%>/g;
  let cursor = 0;
  let body = "let __output = '';\n";

  for (const match of source.matchAll(ejsBlock)) {
    body += `__output += ${JSON.stringify(source.slice(cursor, match.index))};\n`;
    let code = match[1];
    if (code.trimEnd().endsWith('-')) {
      code = code.trimEnd().slice(0, -1);
    }
    if (code.startsWith('-')) {
      body += `__output += String((${code.slice(1).trim()}) ?? '');\n`;
    } else {
      body += `${code}\n`;
    }
    cursor = (match.index || 0) + match[0].length;
  }

  body += `__output += ${JSON.stringify(source.slice(cursor))};\nreturn __output;`;
  return new Function('variables', 'getvar', body) as PromptRenderer;
}

describe('武侠输出提示词契约', () => {
  it('递归过滤所有 $ 前缀键，并用严格 JSON 转义特殊字符', () => {
    const toStrictJson = loadPromptSerializer();
    const fixture = {
      备注: '他说"取{秘籍}"，明日再来\n路径：C:\\江湖\\客栈',
      $meta: { 来源: '内部' },
      关系网: {
        黄蓉: '知己/90',
        $template: { 不应发送: true },
      },
      经历: [{ 内容: '括号[]与反斜杠\\仍需保留', $cache: '内部' }],
    };
    const expected = {
      备注: '他说"取{秘籍}"，明日再来\n路径：C:\\江湖\\客栈',
      关系网: { 黄蓉: '知己/90' },
      经历: [{ 内容: '括号[]与反斜杠\\仍需保留' }],
    };

    const serialized = toStrictJson(fixture);

    expect(serialized).toBe(JSON.stringify(expected));
    expect(JSON.parse(serialized)).toEqual(expected);
    expect(serialized).not.toMatch(/\$meta|\$template|\$cache/);
    expect(serialized).not.toContain('\n路径：');
  });

  it('保留既有字段投影，同时声明事件和地点边界', () => {
    expect(promptSource).not.toContain('function toCompact');
    expect(promptSource).toContain("getvar('stat_data.前端变量.周围地点'");
    expect(promptSource).toContain('<参与事件>');
    expect(promptSource).toContain('<context_error>玩家数据或世界时间加载失败</context_error>');
    expect(promptSource).toContain('结局: 事件.结局');
    expect(promptSource).toContain('当前没有任何可用的完整地点路径，本轮禁止修改任何 `所在位置`');
    expect(worldHistoryPromptSource).toContain(
      'selectWorldEventsForPrompt(worldEvents, outcomeStatuses, limit = 16, priorityLimit = 8)',
    );
  });

  it('约束分钟时间、实际耗时和事件节点时间一致性', () => {
    expect(cotPromptSource).toContain('只有正文实际呈现了可感知的耗时，才推进世界时间');
    expect(cotPromptSource).toContain('数十分钟');
    expect(cotPromptSource).toContain('数小时');
    expect(cotPromptSource).toContain('数日');
    expect(cotPromptSource).toContain('仍在开端或第一个节点时');
    expect(cotPromptSource).not.toContain('按事件进行比例');

    expect(variableGuidanceSource).toContain('{"年":整数,"月":整数,"日":整数,"时":整数,"分":整数}');
    expect(variableGuidanceSource).toContain('`分`必须是 0–59 的整数');
    expect(variableGuidanceSource).toContain('旧存档没有`分`时按 0 分理解');
    expect(variableGuidanceSource).toContain('一个回复不等于固定的一小时');
    expect(variableGuidanceSource).toContain('跨城远行、长期养伤、闭关修炼等可经过数日');
    expect(variableGuidanceSource).toContain('禁止直接写到事件结束时间');
    expect(variableGuidanceSource).not.toContain('关键桥段完整结束时，将时间推进到事件描述给出的结束时间');
  });

  it('世界背景提供可复用的写实叙事表现标尺', () => {
    expect(worldBackgroundSource).toContain('<叙事表现标尺>');
    expect(worldBackgroundSource).toContain('</叙事表现标尺>');
    expect(worldBackgroundSource).toContain('高品阶功法不等于当前必胜');
    expect(worldBackgroundSource).toContain('传说：基本失传的时代级武学');
    expect(worldBackgroundSource).toContain('不得表现为元神出窍、时间凝固、空间冻结或破碎虚空');
    expect(worldBackgroundSource).toContain('陆地神仙：江湖对极少数传奇人物的尊称，并非真正仙人');
  });

  it('可执行渲染只读历史、分事件快照和分组地点白名单', () => {
    const render = compilePromptRenderer(`${worldHistoryPromptSource}\n${promptSource}`);
    const eventKey = '射雕第7回02-初遇黄蓉';
    const values: Record<string, unknown> = {
      'stat_data.世界事件': {
        往事: {
          时间: { 年: 1219, 月: 10, 日: 1, 时: 8 },
          地点: '大宋/张家口/城门',
          概要: '旧事已了',
        },
      },
      'stat_data.前端变量.事件结局状态': { 往事: '正常' },
      'stat_data.参与事件': {
        [eventKey]: {
          描述: '1219年10月20日13时 到 15时，大宋/张家口/大酒店发生相遇。',
          结局: '三人相识。',
          insert: {},
          update: { 黄蓉: { 所在位置: '大宋/张家口/大酒店' } },
          delete: {},
        },
      },
      'stat_data.前端变量.周围地点': {
        普通移动: ['大宋/张家口/城门', '只有/二级'],
        事件目标: ['蒙古/大漠/荒山'],
        地图指定: [],
      },
    };
    const variables = {
      stat_data: {
        世界信息: { 时间: { 年: 1219, 月: 10, 日: 20, 时: 13 } },
        user数据: { 出生年份: 1200, 所在位置: '大宋/张家口/城门', $meta: { hidden: true } },
        角色数据: {},
      },
    };

    const output = render(variables, path => values[path]);

    expect(output.indexOf('# 世界历史（只读）')).toBeLessThan(output.indexOf('# 当前状态'));
    expect(output).toContain(`<${eventKey}>`);
    expect(output).toContain('[只读时间、地点与事件背景：1219年10月20日13时 到 15时');
    expect(output).toContain('{"结局":"三人相识。","insert":{},"update":{"黄蓉"');
    expect(output).not.toContain('{"描述":');
    expect(output).toContain('[普通移动]\n\n- 大宋/张家口/城门');
    expect(output).toContain('[事件目标]\n\n- 蒙古/大漠/荒山');
    expect(output).toContain('[地图指定]（无）');
    expect(output).not.toContain('只有/二级');
    expect(output).not.toContain('$meta');
  });
});
