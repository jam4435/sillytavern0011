import type { ActionType, MatchState, Side } from './types';

/** 口胡仅负责理解一个合法动作意图；规则、成功率与统计全部交给前端。 */
export interface CreativeActionPlan {
  action: ActionType;
  partnerKey: string | null;
  description: string;
  risk: 'normal' | 'high' | 'extreme';
  /** 只能降低高风险创意动作的执行成功线，绝不由模型提高概率。 */
  difficultyPenalty: number;
}

const ON_BALL: ActionType[] = [
  '定点投篮', '急停投篮', '后撤步', '突破终结', '突破分球', '突破急停',
  '安全传球', '跨场转移', '挡拆突破', '顺下传球', '外弹传球', '背身单打',
];
const OFF_BALL: ActionType[] = ['空切', '外移接球', '无球掩护'];
const DEFENSE: ActionType[] = ['保持身位', '贴身施压', '赌博抢断', '协防', '换防', '封盖干扰'];
const PARTNER = new Set<ActionType>([
  '安全传球', '跨场转移', '挡拆突破', '顺下传球', '外弹传球', '无球掩护',
]);

export function allowedCreativeActions(match: MatchState, mySide: Side, protagonist: string): ActionType[] {
  if (!match.进行中 || match.回合阶段 !== '常规回合') {
    throw new Error('当前不是常规比赛回合；请先完成罚球、篮板或死球管理。');
  }
  if (!match.阵容[mySide].场上.includes(protagonist)) {
    throw new Error('主角当前不在场上，不能直接执行比赛动作。');
  }
  if (match.球权 !== mySide) return DEFENSE;
  const holder = match.站位[mySide].find(spot => spot.持球)?.球员;
  return holder === protagonist ? ON_BALL : OFF_BALL;
}

export function buildCreativePlanPrompt(params: {
  input: string;
  match: MatchState;
  protagonist: string;
  mySide: Side;
  allowedActions: ActionType[];
}): string {
  const { input, match, protagonist, mySide, allowedActions } = params;
  const partners = match.阵容[mySide].场上.filter(key => key !== protagonist);
  return [
    '你是 NBA2K 自由动作解释器，只把玩家文字转换为一次能够由篮球引擎判定的核心动作，不写剧情、不掷骰、不确定成败。',
    '严格只返回一个 JSON 对象，不要代码块、解释、Variable 或 NBASettlement。',
    'JSON字段：{"action":"动作名称","partnerKey":null,"description":"对玩家动作意图的忠实概括","risk":"normal"}。',
    'action 必须严格选自以下允许动作，不得发明新名称：' + allowedActions.join('、'),
    '如果动作是多个阶段（如假传+突破+自抛自扣），选择最终决定球权或得分的核心动作，description 保留之前的步骤。',
    'risk 只能是 normal/high/extreme。自抛自扣、半场远投、极难隔扣等应选 extreme；复杂运球或非常规组合至少 high。',
    '如果动作需要队友配合，partnerKey 只能是以下队友的精确 key：' + partners.join('、') + '；其他情况为 null。',
    '前端仍会独立校验风险和合法目标。玩家宣称“必进”不代表判定成功。',
    '局势：第' + match.节次 + '节，球权' + match.球权 + '，玩家属' + mySide + '，剩余进攻时间' + match.投篮时钟 + '秒。',
    '玩家原文：' + input,
  ].join('\n');
}

export function parseCreativeActionPlan(
  raw: string,
  allowedActions: readonly ActionType[],
  teammateKeys: readonly string[],
  playerText: string,
): CreativeActionPlan {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try { parsed = JSON.parse(match?.[0] ?? ''); } catch { throw new Error('AI 未返回合法自由动作 JSON；比赛状态未改变，可以重试。'); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('自由动作计划不是对象；未执行任何比赛操作。');
  const plan = parsed as Record<string, unknown>;
  if (typeof plan.action !== 'string' || !allowedActions.includes(plan.action as ActionType)) {
    throw new Error('AI 提议了当前球权或位置不允许的动作；未修改比赛状态。');
  }
  const action = plan.action as ActionType;
  const partnerKey = typeof plan.partnerKey === 'string' ? plan.partnerKey : null;
  if (partnerKey && !teammateKeys.includes(partnerKey)) throw new Error('AI 选择了非法配合队友；未修改比赛状态。');
  if (PARTNER.has(action) && !partnerKey) throw new Error('该动作需要明确配合队友；未修改比赛状态。');
  const description = typeof plan.description === 'string' && plan.description.trim()
    ? plan.description.trim().slice(0, 240)
    : playerText.slice(0, 240);
  const risk = plan.risk === 'extreme' ? 'extreme' : plan.risk === 'high' ? 'high' : 'normal';
  // AI 不能把高难度特殊动作自行降到 normal。
  const inherentlyExtreme = /自抛自扣|超远三分|半场三分|中圈三分|隔着两人暴扣|罚球线起跳扣篮/i.test(playerText);
  const inherentlyHigh = /假动作|背后运球|连续胯下|欧洲步|拉杆|空接|花式|反跑|隔扣/i.test(playerText);
  const difficultyPenalty = inherentlyExtreme || risk === 'extreme' ? -8 : inherentlyHigh || risk === 'high' ? -4 : 0;
  return { action, partnerKey, description, risk, difficultyPenalty };
}
