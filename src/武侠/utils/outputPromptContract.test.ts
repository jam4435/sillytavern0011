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
    expect(promptSource).toContain('{ 分支标记: 事件.分支标记 }');
    expect(variableGuidanceSource).toContain('`事件分支结果`是系统结算归档，始终只读');
    expect(variableGuidanceSource).toContain('`后续事件`只表示既有事件之间的关联和可能出现的线索');
    expect(promptSource).toContain('当前没有可用的合法严格活动区，本轮禁止修改任何 `所在位置`');
    expect(promptSource).toContain('同一前三段不代表人物已经面对面同场');
    expect(variableGuidanceSource).toContain('第四级不参加白名单匹配');
    expect(variableGuidanceSource).toContain('`前端变量.奇经八脉` 与由关窍产生的 `user数据.初始属性` 变化只读');
    expect(worldHistoryPromptSource).toContain('角色|位置:完整路径|基础:数值');
    expect(worldHistoryPromptSource).toContain(
      'selectWorldEventsForPrompt(worldEvents, outcomeStatuses, limit = 16, priorityLimit = 8)',
    );
  });

  it('约束分钟时间、实际耗时和事件节点时间一致性', () => {
    expect(cotPromptSource).toContain('只有正文实际呈现了可感知的耗时，才推进世界时间');
    expect(cotPromptSource).toContain('数十分钟');
    expect(cotPromptSource).toContain('数小时');
    expect(cotPromptSource).toContain('数日');
    expect(cotPromptSource).toContain('不是需要逐句演出的清单，也不对应固定回合数');
    expect(cotPromptSource).toContain('可以只推进一段，也可以连续发生数项发展');
    expect(cotPromptSource).toContain('因果已经完整时可以直接完成当前事件');
    expect(cotPromptSource).toContain('回复结束时局势是否发生可辨认的变化');
    expect(cotPromptSource).toContain('只有气氛、神态、饮酒、寒暄和重复立场而没有改变局势，不算推进');
    expect(cotPromptSource).toContain('关键揭示、主要冲突或高潮');
    expect(cotPromptSource).toContain('不是必须按回合均分的篇幅');
    expect(cotPromptSource).toContain('可以用“酒过数巡”“众人又谈良久”等方式自然压缩');
    expect(cotPromptSource).not.toContain('尚未发生的最早情节');
    expect(cotPromptSource).not.toContain('每轮推进一个有意义的原定情节单位');
    expect(cotPromptSource).not.toContain('不要把完整事件详情一次演完');
    expect(cotPromptSource).not.toContain('按事件进行比例');

    expect(variableGuidanceSource).toContain('{"年":整数,"月":整数,"日":整数,"时":整数,"分":整数}');
    expect(variableGuidanceSource).toContain('`分`必须是 0–59 的整数');
    expect(variableGuidanceSource).toContain('旧存档没有`分`时按 0 分理解');
    expect(variableGuidanceSource).toContain('禁止稀疏更新的原子对象');
    expect(variableGuidanceSource).toContain('旧完整时间 + 正文耗时 = 新完整时间');
    expect(variableGuidanceSource).toContain('{"世界信息":{"时间":{"年":1200,"月":8,"日":15,"时":13,"分":10}}}');
    expect(variableGuidanceSource).toContain('禁止只写 {"世界信息":{"时间":{"分":10}}}');
    expect(variableGuidanceSource).not.toContain('例如修改分钟必须写成');
    expect(variableGuidanceSource).toContain('一个回复不等于固定的一小时');
    expect(variableGuidanceSource).toContain('跨城远行、长期养伤、闭关修炼等可经过数日');
    expect(variableGuidanceSource).toContain('可以跨过事件结束时间；事件结算由事件脚本在时间写入后统一处理');
    expect(variableGuidanceSource).not.toContain('禁止越过边界顺带推进下一事件');
    expect(variableGuidanceSource).not.toContain('关键桥段完整结束时，将时间推进到事件描述给出的结束时间');
    expect(variableGuidanceSource).toContain('不得把该事件尚未结束的阶段性对话、观察、行动、冲突或关系变化按回合拆写');
    expect(variableGuidanceSource).toContain('事件开始时间+(事件结束时间-事件开始时间)*x/y');
    expect(variableGuidanceSource).not.toContain('事件结束时间-事件结束时间');
  });

  it('cot 根据参与事件和后续事件线索只输出对应的一套互斥思维规则', () => {
    const render = compilePromptRenderer(cotPromptSource);
    const renderMode = (参与事件: unknown, 后续事件线索: unknown) =>
      render({}, path => {
        if (path === 'stat_data.参与事件') return 参与事件;
        if (path === 'stat_data.后续事件线索') return 后续事件线索;
        return undefined;
      });
    const active = renderMode({ '射雕第一回01-测试事件': {} }, { '射雕第一回02-后续事件': '后续线索' });
    const bridge = renderMode({}, { '射雕第一回02-后续事件': '后续线索' });
    const idle = renderMode({}, {});

    expect(active).toContain('### 参与事件思维规则');
    expect(active).toContain('“合理推进剧情”');
    expect(active).not.toContain('### 事件接驳思维规则');
    expect(active).not.toContain('### 无参与事件思维规则');

    expect(bridge).toContain('### 事件接驳思维规则');
    expect(bridge).toContain('“合理推进剧情”');
    expect(bridge).not.toContain('### 参与事件思维规则');
    expect(bridge).not.toContain('### 无参与事件思维规则');

    expect(idle).toContain('### 无参与事件思维规则');
    expect(idle).toContain('“合理推进剧情”');
    expect(idle).not.toContain('### 参与事件思维规则');
    expect(idle).not.toContain('### 事件接驳思维规则');
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
    const eventKey = '射雕第七回02-初遇黄蓉';
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
          分支标记: { 黄蓉对郭靖变心: 1 },
        },
      },
      'stat_data.前端变量.周围地点': {
        当前活动区: '大宋/张家口/张家口镇',
        普通移动: ['大宋/张家口/张家口镇', '只有/二级'],
        事件目标: ['蒙古/大漠/荒山/山顶'],
        地图指定: [],
      },
    };
    const variables = {
      stat_data: {
        世界信息: { 时间: { 年: 1219, 月: 10, 日: 20, 时: 13 } },
        user数据: { 出生年份: 1200, 所在位置: '大宋/张家口/张家口镇/城门', $meta: { hidden: true } },
        角色数据: {
          同区异场: { 所在位置: '大宋/张家口/张家口镇/客店', 状态: '健康' },
          其他地区: { 所在位置: '金国/中都/中都城/街头', 状态: '健康' },
        },
      },
    };

    const output = render(variables, path => values[path]);

    expect(output.indexOf('# 世界历史（只读）')).toBeLessThan(output.indexOf('# 当前状态'));
    expect(output).toContain(`<${eventKey}>`);
    expect(output).toContain('[只读时间、地点与事件背景：1219年10月20日13时 到 15时');
    expect(output).toContain('{"结局":"三人相识。","insert":{},"update":{"黄蓉"');
    expect(output).toContain('"分支标记":{"黄蓉对郭靖变心":1}');
    expect(output).not.toContain('{"描述":');
    expect(output).toContain('当前完整位置：大宋/张家口/张家口镇/城门');
    expect(output).toContain('当前严格活动区：大宋/张家口/张家口镇');
    expect(output).toContain('[普通移动]\n\n- 大宋/张家口/张家口镇');
    expect(output).toContain('[事件目标]\n\n- 蒙古/大漠/荒山/山顶');
    expect(output).toContain('[地图指定]（无）');
    expect(output).not.toContain('只有/二级');
    expect(output).toContain('同区异场');
    expect(output).toContain('大宋/张家口/张家口镇/客店');
    expect(output).not.toContain('其他地区');
    expect(output).not.toContain('$meta');
  });
});
