export const VARIABLE_PROMPT_SLOT_NAMES = [
  'readonlyContextRounds',
  'latestUserBody',
  'latestAssistantBody',
  'variableData',
  'worldContext',
  'playerContext',
  'participationEvents',
  'tasks',
  'relevantCharacters',
  'locationContext',
  'cultivationReference',
] as const;

export type VariablePromptSlotName = (typeof VARIABLE_PROMPT_SLOT_NAMES)[number];
export type VariablePromptSlots = Record<VariablePromptSlotName, string>;

export type VariablePromptSlotMeta = {
  name: VariablePromptSlotName;
  label: string;
  description: string;
  source: string;
  emptyBehavior: string;
};

export const VARIABLE_PROMPT_SLOT_META: readonly VariablePromptSlotMeta[] = [
  {
    name: 'readonlyContextRounds',
    label: '前序只读轮次',
    description: '最新正文之前的完整 user + assistant 轮次，只用于理解上下文，不得重新结算。',
    source: '聊天历史 active swipe；按设置中的只读上下文轮数截取。',
    emptyBehavior: '没有更早完整轮次时为 []。',
  },
  {
    name: 'latestUserBody',
    label: '本轮 User',
    description: '触发当前 assistant 回复的玩家输入。',
    source: '当前目标 assistant 楼层之前最近的未配对 user 楼层，经正文清洗规则处理。',
    emptyBehavior: '无法取得时使用“无可用 user 输入”的只读 payload。',
  },
  {
    name: 'latestAssistantBody',
    label: '本轮正文',
    description: '变量判断的本轮实际剧情结果。',
    source: '当前目标 assistant active swipe；剥离 ERA 变量块并应用正文清洗。',
    emptyBehavior: '无法取得时使用“无可用正文”的只读 payload。',
  },
  {
    name: 'variableData',
    label: '变量数据',
    description: '由代码固定组装的完整 <variable> 动态数据块。',
    source: 'worldContext/playerContext/participationEvents/tasks/relevantCharacters/locationContext 等动态槽位。',
    emptyBehavior: '构建前为空；渲染变量数据格式后写入。',
  },
  {
    name: 'worldContext',
    label: '世界信息',
    description: '当前世界时间，使用世界信息根对象的紧凑嵌套格式。',
    source: 'stat_data.世界信息；当前仅投影时间。',
    emptyBehavior: '没有可用世界信息时为 {}。',
  },
  {
    name: 'playerContext',
    label: '玩家变量',
    description: '玩家可写状态使用 user数据 紧凑对象；初始属性与天赋另以无点路径标题的压缩记录表示。',
    source: 'stat_data.user数据；移除头像、出生年份、年龄、初始属性、天赋及内部字段，再把初始属性与天赋作为只读参考附加。',
    emptyBehavior: '没有玩家数据时为 {}。',
  },
  {
    name: 'participationEvents',
    label: '参与事件',
    description: '事件名与时间/地点/详情保持只读记录；既有结局与 insert/update/delete 使用参与事件根对象的真实嵌套结构。',
    source: 'stat_data.参与事件；详情只读，只把既有结局与差分快照作为可写对象。',
    emptyBehavior: '没有有效参与事件时为空；@if participationEvents 不成立。',
  },
  {
    name: 'tasks',
    label: '正式任务',
    description: '任务名与只读字段保持压缩记录；任务执行情况使用任务根对象的真实嵌套结构。',
    source: 'stat_data.任务；常规变量模型只允许修改已有任务的任务执行情况。',
    emptyBehavior: '没有正式任务时为空；@if tasks 不成立。',
  },
  {
    name: 'relevantCharacters',
    label: '相关人物',
    description: '本轮变量判断相关 NPC 的当前持久状态，使用角色数据根对象的紧凑嵌套格式。',
    source: 'stat_data.角色数据；筛选同一严格活动区、参与事件或本轮正文提及的角色，并移除只读/内部字段。',
    emptyBehavior: '没有命中人物时为空；@if relevantCharacters 不成立。',
  },
  {
    name: 'locationContext',
    label: '可用地点',
    description: '当前地点与可移动地点的压缩记录；地图 UI 明确指定的移动目标显示为“地图移动目的地”。',
    source: 'stat_data.前端变量.周围地点 + user数据.所在位置。',
    emptyBehavior: '无法形成地点上下文时为空；@if locationContext 不成立。',
  },
  {
    name: 'cultivationReference',
    label: '修为变化参考',
    description: '修炼一天的修为增幅参考值，只读；默认模板放在<variable><修为>中。',
    source: 'stat_data.前端变量.修为变化参考。',
    emptyBehavior: '不是有限数字时为空；@if cultivationReference 不成立。',
  },
] as const;

const IF_RE = /^\s*@if\s+([A-Za-z][A-Za-z0-9_]*)\s*$/;
const ELSE_RE = /^\s*@else\s*$/;
const ENDIF_RE = /^\s*@endif\s*$/;
const SLOT_RE = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g;

const isKnownSlot = (value: string): value is VariablePromptSlotName =>
  (VARIABLE_PROMPT_SLOT_NAMES as readonly string[]).includes(value);

type ConditionalFrame = {
  condition: boolean;
  branchActive: boolean;
  elseSeen: boolean;
};

export function renderVariableConditionalTemplate(template: string, slots: VariablePromptSlots): string {
  const output: string[] = [];
  const conditionStack: ConditionalFrame[] = [];

  for (const line of template.split(/\r?\n/)) {
    const ifMatch = line.match(IF_RE);
    if (ifMatch) {
      const slotName = ifMatch[1];
      if (!isKnownSlot(slotName)) {
        throw new Error(`变量提示词模板引用了未知条件：${slotName}`);
      }
      const condition = Boolean(slots[slotName].trim());
      conditionStack.push({ condition, branchActive: condition, elseSeen: false });
      continue;
    }

    if (ELSE_RE.test(line)) {
      const frame = conditionStack.at(-1);
      if (!frame) {
        throw new Error('变量提示词模板存在多余的 @else。');
      }
      if (frame.elseSeen) {
        throw new Error('变量提示词模板同一条件块出现重复的 @else。');
      }
      frame.elseSeen = true;
      frame.branchActive = !frame.condition;
      continue;
    }

    if (ENDIF_RE.test(line)) {
      if (conditionStack.length === 0) {
        throw new Error('变量提示词模板存在多余的 @endif。');
      }
      conditionStack.pop();
      continue;
    }

    if (conditionStack.every(frame => frame.branchActive)) {
      output.push(
        line.replace(SLOT_RE, (_match, slotName: string) => {
          if (!isKnownSlot(slotName)) {
            throw new Error(`变量提示词模板引用了未知占位符：${slotName}`);
          }
          return slots[slotName];
        }),
      );
    }
  }

  if (conditionStack.length > 0) {
    throw new Error('变量提示词模板存在未闭合的 @if。');
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function wrapVariablePromptSection(tag: string, content: string): string {
  return `<${tag}>\n${content}\n</${tag}>`;
}

export function renderVariableData(slots: VariablePromptSlots): string {
  const sections = [
    wrapVariablePromptSection('当前时间', slots.worldContext),
    wrapVariablePromptSection('玩家数据', slots.playerContext),
  ];
  if (slots.participationEvents.trim()) sections.push(wrapVariablePromptSection('参与事件', slots.participationEvents));
  if (slots.tasks.trim()) sections.push(wrapVariablePromptSection('任务', slots.tasks));
  if (slots.locationContext.trim()) sections.push(wrapVariablePromptSection('可用地点', slots.locationContext));
  if (slots.relevantCharacters.trim()) sections.push(wrapVariablePromptSection('角色数据', slots.relevantCharacters));
  if (slots.cultivationReference.trim()) sections.push(wrapVariablePromptSection('修为', slots.cultivationReference));
  return `<variable>\n${sections.join('\n\n')}\n</variable>`;
}

export function renderVariableInput(slots: VariablePromptSlots): string {
  return [
    wrapVariablePromptSection('前序只读轮次', slots.readonlyContextRounds),
    wrapVariablePromptSection('本轮User', slots.latestUserBody),
    wrapVariablePromptSection('本轮正文', slots.latestAssistantBody),
    slots.variableData.trim(),
  ].filter(Boolean).join('\n\n').trim();
}

export function renderVariableModelPrompt({
  narrativeScale,
  variableInputContext,
  variableTemplate,
  variableGuidance,
}: {
  narrativeScale: string;
  variableInputContext: string;
  variableTemplate: string;
  variableGuidance: string;
}): string {
  return [
    '你是《金庸群侠传》ERA 变量更新模型。\n任务是核对本轮玩家输入与最新 assistant 正文已经发生的持久变化；不得续写剧情。',
    `<叙事表现标尺>\n${narrativeScale}\n</叙事表现标尺>`,
    variableInputContext,
    variableTemplate,
    variableGuidance,
  ].filter(Boolean).join('\n\n').trim();
}

export function getVariablePromptSlotMeta(name: VariablePromptSlotName): VariablePromptSlotMeta {
  return VARIABLE_PROMPT_SLOT_META.find(item => item.name === name)!;
}
