import {
  DEFAULT_VARIABLE_DATA_FORMAT_TEMPLATE,
  DEFAULT_VARIABLE_INPUT_TEMPLATE,
} from '../prompts/variablePromptDefaults';

export const VARIABLE_PROMPT_SLOT_NAMES = [
  'readonlyContextRounds',
  'latestUserBody',
  'latestAssistantBody',
  'variableData',
  'worldContext',
  'playerContext',
  'participationEvents',
  'tasks',
  'followupClues',
  'relevantCharacters',
  'locationContext',
  'cultivationReference',
  'decisionChecklist',
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
    description: '按 src/武侠/prompts/变量数据格式.txt 渲染后的完整 <variable> 动态数据块。',
    source: 'worldContext/playerContext/participationEvents/tasks/relevantCharacters/locationContext 等动态槽位。',
    emptyBehavior: '构建前为空；渲染变量数据格式后写入。',
  },
  {
    name: 'worldContext',
    label: '世界信息',
    description: '当前世界信息，以世界信息根键开头的紧凑嵌套对象表示。',
    source: 'stat_data.世界信息；当前仅投影时间。',
    emptyBehavior: '没有可用世界信息时为 {}。',
  },
  {
    name: 'playerContext',
    label: '玩家变量',
    description: '玩家状态以 user数据 根键开头的紧凑嵌套对象表示；初始属性与天赋按真实子键合并回同一对象。',
    source: 'stat_data.user数据；过滤头像、出生年份、年龄和内部字段，同时保留只读初始属性与天赋作为判断参考。',
    emptyBehavior: '没有玩家数据时为 {}。',
  },
  {
    name: 'participationEvents',
    label: '参与事件',
    description: '参与事件以参与事件根键开头的紧凑嵌套对象表示；描述/地点与既有结局、insert/update/delete 保持同一真实层级。',
    source: 'stat_data.参与事件；只发送相关事件的描述、地点和既有可写快照。',
    emptyBehavior: '没有有效参与事件时为空；@if participationEvents 不成立。',
  },
  {
    name: 'tasks',
    label: '正式任务',
    description: '已接取正式任务以任务根键开头的紧凑嵌套对象表示，保持任务真实字段层级。',
    source: 'stat_data.任务；发送已有任务完整公开字段，常规变量模型仍只允许修改任务执行情况。',
    emptyBehavior: '没有正式任务时为空；@if tasks 不成立。',
  },
  {
    name: 'followupClues',
    label: '后续事件脉络',
    description: '尚未发生的后续事件约束，只用于理解时间与因果。',
    source: 'stat_data.后续事件线索。',
    emptyBehavior: '没有线索时为空；@if followupClues 不成立。',
  },
  {
    name: 'relevantCharacters',
    label: '相关人物',
    description: '本轮变量判断相关 NPC 的当前持久状态，以角色数据根键开头的紧凑嵌套对象表示。',
    source: 'stat_data.角色数据；筛选同一严格活动区、参与事件或本轮正文提及的角色，并移除只读/内部字段。',
    emptyBehavior: '没有命中人物时为空；@if relevantCharacters 不成立。',
  },
  {
    name: 'locationContext',
    label: '可用地点',
    description: '当前地点与可移动地点的压缩记录；底层地图指定目标在提示词中显示为“指令地点”。',
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
  {
    name: 'decisionChecklist',
    label: '变量检查清单',
    description: '旧输入模板兼容占位符；检查清单已迁入可编辑的变量指导。',
    source: '兼容保留，不再由代码生成检查规则。',
    emptyBehavior: '始终为空；新模板不应再使用此占位符。',
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

export function renderVariableDataTemplate(template: string, slots: VariablePromptSlots): string {
  const source = template.trim() ? template : DEFAULT_VARIABLE_DATA_FORMAT_TEMPLATE;
  return renderVariableConditionalTemplate(source, slots);
}

export function renderVariableInputTemplate(template: string, slots: VariablePromptSlots): string {
  const source = template.trim() ? template : DEFAULT_VARIABLE_INPUT_TEMPLATE;
  return renderVariableConditionalTemplate(source, slots);
}

export function getVariablePromptSlotMeta(name: VariablePromptSlotName): VariablePromptSlotMeta {
  return VARIABLE_PROMPT_SLOT_META.find(item => item.name === name)!;
}
