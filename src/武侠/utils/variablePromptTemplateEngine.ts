import { DEFAULT_VARIABLE_INPUT_TEMPLATE } from '../prompts/variablePromptDefaults';

export const VARIABLE_PROMPT_SLOT_NAMES = [
  'readonlyContextRounds',
  'latestUserBody',
  'latestAssistantBody',
  'worldContext',
  'playerContext',
  'participationEvents',
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
    name: 'worldContext',
    label: '世界信息',
    description: '变量模型当前需要读取的世界级可写状态。',
    source: 'stat_data.世界信息；当前仅投影时间。',
    emptyBehavior: '没有可用世界信息时为 {}。',
  },
  {
    name: 'playerContext',
    label: '玩家变量',
    description: '玩家当前可供变量模型判断持久变化的状态。',
    source: 'stat_data.user数据；移除头像、出生年份、年龄、初始属性、天赋及内部字段。',
    emptyBehavior: '没有玩家数据时为 {}。',
  },
  {
    name: 'participationEvents',
    label: '参与事件',
    description: '当前参与事件的只读详情与允许变量模型检查的既有事件差分快照。',
    source: 'stat_data.参与事件；事件详情只读，仅保留既有结局/insert/update/delete/分支标记等允许检查的字段。',
    emptyBehavior: '没有有效参与事件时为空；@if participationEvents 不成立。',
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
    description: '本轮变量判断相关 NPC 的当前持久状态。',
    source: 'stat_data.角色数据；筛选同一严格活动区、参与事件或本轮正文提及的角色，并移除只读/内部字段。',
    emptyBehavior: '没有命中人物时为空；@if relevantCharacters 不成立。',
  },
  {
    name: 'locationContext',
    label: '可用地点',
    description: '当前完整位置、严格活动区及合法移动范围。',
    source: 'stat_data.前端变量.周围地点 + user数据.所在位置。',
    emptyBehavior: '无法形成地点上下文时为空；@if locationContext 不成立。',
  },
  {
    name: 'cultivationReference',
    label: '修为变化参考',
    description: '每日专心修炼基准，只读，用于结合正文实际时长/强度估算修为变化。',
    source: 'stat_data.前端变量.修为变化参考。',
    emptyBehavior: '不是有限数字时为空；@if cultivationReference 不成立。',
  },
  {
    name: 'decisionChecklist',
    label: '变量检查清单',
    description: '根据当前是否存在参与事件选择的普通回合/参与事件检查清单。',
    source: '前端内置确定性规则。',
    emptyBehavior: '正常情况下始终存在。',
  },
] as const;

const IF_RE = /^\s*@if\s+([A-Za-z][A-Za-z0-9_]*)\s*$/;
const ENDIF_RE = /^\s*@endif\s*$/;
const SLOT_RE = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g;

const isKnownSlot = (value: string): value is VariablePromptSlotName =>
  (VARIABLE_PROMPT_SLOT_NAMES as readonly string[]).includes(value);

export function renderVariableInputTemplate(
  template: string,
  slots: VariablePromptSlots,
): string {
  const source = template.trim() ? template : DEFAULT_VARIABLE_INPUT_TEMPLATE;
  const output: string[] = [];
  const conditionStack: boolean[] = [];

  for (const line of source.split(/\r?\n/)) {
    const ifMatch = line.match(IF_RE);
    if (ifMatch) {
      const slotName = ifMatch[1];
      if (!isKnownSlot(slotName)) {
        throw new Error(`变量输入模板引用了未知条件：${slotName}`);
      }
      conditionStack.push(Boolean(slots[slotName].trim()));
      continue;
    }

    if (ENDIF_RE.test(line)) {
      if (conditionStack.length === 0) {
        throw new Error('变量输入模板存在多余的 @endif。');
      }
      conditionStack.pop();
      continue;
    }

    if (conditionStack.every(Boolean)) {
      output.push(
        line.replace(SLOT_RE, (_match, slotName: string) => {
          if (!isKnownSlot(slotName)) {
            throw new Error(`变量输入模板引用了未知占位符：${slotName}`);
          }
          return slots[slotName];
        }),
      );
    }
  }

  if (conditionStack.length > 0) {
    throw new Error('变量输入模板存在未闭合的 @if。');
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function getVariablePromptSlotMeta(name: VariablePromptSlotName): VariablePromptSlotMeta {
  return VARIABLE_PROMPT_SLOT_META.find(item => item.name === name)!;
}
