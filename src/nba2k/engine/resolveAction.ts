import { ACTION_SPECS, weightedScore } from './attributes';
import type {
  ActionHardResult,
  ActionResolution,
  ActionType,
  NumericRange,
  OnCourtStatus,
  PlayerData,
  ReboundSide,
  RequiredStatUpdate,
  ResultTier,
  SituationContext,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const range = (min: number, max = min): NumericRange => ({ min, max });

export interface ResolveInput {
  action: ActionType;
  actor: PlayerData;
  actorStatus: OnCourtStatus;
  /** 主要对位球员；无球跑动即使误传也会被引擎忽略。 */
  defender: PlayerData | null;
  /** 组织动作传入对方场上五人，引擎取五人的防守均值。 */
  defenders?: PlayerData[];
  /** 第二参与者：挡拆掩护人 / 传球接球人。 */
  partner: PlayerData | null;
  /** 挡拆掩护人的原始对位防守人。 */
  partnerDefender?: PlayerData | null;
  /** 篮板发起者争抢的是进攻篮板还是防守篮板。 */
  reboundSide?: ReboundSide;
  situation: SituationContext;
  /** 注入骰子便于测试；默认 1-100 均匀随机。 */
  rollDice?: () => number;
}

const POSITION_ORDER: Record<PlayerData['pos'], number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

function isPotentialMismatch(input: ResolveInput): boolean {
  if (input.action !== '挡拆' || !input.partner || !input.partnerDefender) return false;
  const switchedDefender = input.partnerDefender;
  return (
    Math.abs(POSITION_ORDER[input.actor.pos] - POSITION_ORDER[switchedDefender.pos]) >= 2 ||
    Math.abs(input.actor.height_cm - switchedDefender.height_cm) >= 15
  );
}

/** 情境修正明细（见 设计文档.md §3.2）。 */
function situationModifiers(input: ResolveInput, mismatch: boolean): { label: string; value: number }[] {
  const { actor, actorStatus, situation } = input;
  const mods: { label: string; value: number }[] = [];

  if (actorStatus.体力 < 20) mods.push({ label: '体力透支', value: -12 });
  else if (actorStatus.体力 < 40) mods.push({ label: '体力下降', value: -5 });

  if (actorStatus.手感 === '热') mods.push({ label: '手感火热', value: 4 });
  else if (actorStatus.手感 === '冷') mods.push({ label: '手感冰冷', value: -4 });

  if (situation.isClutch) {
    mods.push(
      actor.overall >= 85
        ? { label: '关键时刻·大心脏', value: 5 }
        : { label: '关键时刻·压力', value: -5 },
    );
  }

  if (situation.mismatch || mismatch) mods.push({ label: '挡拆错位', value: 8 });

  if (situation.coverage === 'open') mods.push({ label: '空位', value: 10 });
  else if (situation.coverage === 'tight') mods.push({ label: '严防', value: -8 });

  mods.push(situation.isHome ? { label: '主场', value: 2 } : { label: '客场', value: -2 });

  if (situation.defenderFouls >= 4) mods.push({ label: '对位犯规危机', value: 5 });

  return mods;
}

export function tierOf(roll: number, finalRate: number): ResultTier {
  const successLine = Math.round(finalRate);
  if (roll >= 97) return '大失败';
  if (roll <= Math.round(successLine * 0.25)) return '大成功';
  if (roll <= successLine) return '成功';
  if (roll <= successLine + 15) return '部分成功';
  return '失败';
}

const TIER_TEXT: Record<ResultTier, string> = {
  大成功: '完美执行，效果拉满',
  成功: '执行成功',
  部分成功: '勉强完成，效果打折',
  失败: '执行失败',
  大失败: '严重失误，攻守易位风险',
};

const COMMON_PATHS = [
  '比赛.比分',
  '比赛.球权',
  '比赛.剩余秒数',
  '比赛.站位',
  '比赛.球员状态',
  '比赛.回合阶段',
  '比赛.回合情境',
  '比赛.回合摘要',
];

function stat(
  target: RequiredStatUpdate['target'],
  trackedStat: RequiredStatUpdate['stat'],
  value: NumericRange,
  operation: RequiredStatUpdate['operation'] = 'add',
  choiceGroup?: string,
): RequiredStatUpdate {
  return { target, stat: trackedStat, operation, value, ...(choiceGroup ? { choiceGroup } : {}) };
}

function makeHardResult(
  action: ActionType,
  tier: ResultTier,
  mismatchCreated: boolean,
): ActionHardResult {
  const result: ActionHardResult = {
    scoreDelta: { actionSide: range(0), opponentSide: range(0) },
    possession: '行动方保留',
    nextPhase: ['常规回合'],
    clockSeconds: range(2, 8),
    staminaDelta: { actor: range(-5, -2) },
    requiredStatUpdates: [],
    allowedStatePaths: [...COMMON_PATHS],
    mismatchCreated,
  };

  const scoringPoints = action === '三分' ? 3 : 2;
  const isScoring = action === '突破' || action === '中投' || action === '三分' || action === '内线终结';
  const isCreation = action === '传球' || action === '组织' || action === '挡拆' || action === '无球跑动';

  if (isScoring) {
    result.clockSeconds = range(3, 12);
    if (tier === '大成功' || tier === '成功') {
      const maxPoints = tier === '大成功' ? scoringPoints + 1 : scoringPoints;
      result.scoreDelta.actionSide = range(scoringPoints, maxPoints);
      result.possession = '对手获得';
      result.nextPhase = tier === '大成功' ? ['常规回合', '死球'] : ['常规回合'];
      result.requiredStatUpdates.push(
        stat('actor', '得分', range(scoringPoints, maxPoints)),
        stat('actor', '连续命中', range(1)),
        stat('actor', '连续打铁', range(0), 'set'),
      );
    } else if (tier === '部分成功') {
      result.possession = '行动方保留';
      result.requiredStatUpdates.push(
        stat('actor', '连续命中', range(0), 'set'),
        stat('actor', '连续打铁', range(1)),
      );
    } else if (tier === '失败') {
      result.possession = '篮板待定';
      result.nextPhase = ['篮板争抢'];
      result.requiredStatUpdates.push(
        stat('actor', '连续命中', range(0), 'set'),
        stat('actor', '连续打铁', range(1)),
      );
    } else {
      result.possession = '对手获得';
      result.nextPhase = ['死球'];
      result.requiredStatUpdates.push(
        stat('actor', '连续命中', range(0), 'set'),
        stat('actor', '连续打铁', range(1)),
        stat('actor', '失误', range(1), 'add', '进攻失误或进攻犯规'),
        stat('actor', '犯规', range(1), 'add', '进攻失误或进攻犯规'),
      );
      result.allowedStatePaths.push('比赛.本节球队犯规');
    }
    return result;
  }

  if (isCreation) {
    result.staminaDelta.partner = action === '挡拆' ? range(-4, -1) : range(0);
    if (tier === '部分成功' || tier === '失败') {
      result.clockSeconds = range(4, 12);
    } else if (tier === '大失败') {
      result.possession = '对手获得';
      result.nextPhase = ['常规回合'];
      result.requiredStatUpdates.push(stat('actor', '失误', range(1)));
    }
    return result;
  }

  if (action === '抢断') {
    if (tier === '大成功' || tier === '成功') {
      result.possession = '行动方获得';
      result.requiredStatUpdates.push(stat('actor', '抢断', range(1)), stat('defender', '失误', range(1)));
    } else {
      result.possession = '对手保留';
      if (tier === '大失败') {
        result.nextPhase = ['死球'];
        result.requiredStatUpdates.push(stat('actor', '犯规', range(1)));
        result.allowedStatePaths.push('比赛.本节球队犯规');
      }
    }
    return result;
  }

  if (action === '盖帽') {
    if (tier === '大成功') {
      result.possession = '行动方获得';
      result.requiredStatUpdates.push(stat('actor', '盖帽', range(1)));
    } else if (tier === '成功') {
      result.possession = '篮板待定';
      result.nextPhase = ['篮板争抢'];
      result.requiredStatUpdates.push(stat('actor', '盖帽', range(1)));
    } else {
      result.possession = '对手保留';
      if (tier === '大失败') {
        result.nextPhase = ['死球'];
        result.requiredStatUpdates.push(stat('actor', '犯规', range(1)));
        result.allowedStatePaths.push('比赛.本节球队犯规');
      }
    }
    return result;
  }

  if (action === '篮板') {
    result.clockSeconds = range(0, 3);
    if (tier === '大成功' || tier === '成功') {
      result.possession = '行动方获得';
      result.requiredStatUpdates.push(stat('actor', '篮板', range(1)));
    } else if (tier === '部分成功') {
      result.possession = '篮板待定';
      result.nextPhase = ['篮板争抢'];
    } else {
      result.possession = '对手获得';
      result.requiredStatUpdates.push(stat('defender', '篮板', range(1)));
    }
    return result;
  }

  // 贴身防守 / 协防：失败也不授权 AI 给进攻方直接加分。
  result.possession = tier === '大成功' ? '行动方获得' : '对手保留';
  if (tier === '大成功') result.requiredStatUpdates.push(stat('defender', '失误', range(1)));
  if (tier === '大失败') {
    result.nextPhase = ['死球'];
    result.requiredStatUpdates.push(stat('actor', '犯规', range(1)));
    result.allowedStatePaths.push('比赛.本节球队犯规');
  }
  return result;
}

function defenseParticipants(input: ResolveInput): PlayerData[] {
  if (input.action === '无球跑动') return [];
  if (input.action === '组织' && input.defenders?.length) return input.defenders;
  if (input.action === '挡拆') {
    const participants = [input.defender, input.partnerDefender].filter(
      (player): player is PlayerData => Boolean(player),
    );
    return participants.filter((player, index) => participants.findIndex(candidate => candidate.name === player.name) === index);
  }
  return input.defender ? [input.defender] : [];
}

function reboundWeights(input: ResolveInput) {
  if (input.action !== '篮板') return null;
  return input.reboundSide === '防守篮板'
    ? {
        attack: { defRebound: 0.6, strength: 0.25, height: 0.15 } as const,
        defense: { offRebound: 0.6, strength: 0.25, height: 0.15 } as const,
      }
    : {
        attack: { offRebound: 0.6, strength: 0.25, height: 0.15 } as const,
        defense: { defRebound: 0.6, strength: 0.25, height: 0.15 } as const,
      };
}

/** 核心判定：属性加权对抗 + 情境修正 + 1d100；AI 只演出硬结果。 */
export function resolveAction(input: ResolveInput): ActionResolution {
  const { action, actor, partner } = input;
  const spec = ACTION_SPECS[action];
  const rebound = reboundWeights(input);

  let attackScore = weightedScore(rebound?.attack ?? spec.attack, actor.attrs, actor.overall, actor.height_cm);

  if (action === '挡拆' && partner) {
    attackScore =
      weightedScore({ ballHandle: 0.35, speed: 0.25 }, actor.attrs, actor.overall, actor.height_cm) +
      partner.attrs.strength * 0.4;
  }

  const defenders = defenseParticipants(input);
  const defenseScores = defenders.map(player =>
    weightedScore(rebound?.defense ?? spec.defense, player.attrs, player.overall, player.height_cm),
  );
  const defenseScore = defenseScores.length
    ? defenseScores.reduce((sum, value) => sum + value, 0) / defenseScores.length
    : (spec.flatDefense ?? 55);

  const diff = attackScore - defenseScore;
  const baseRateRaw = clamp(50 + diff * 1.1, 15, 90);
  const mismatch = isPotentialMismatch(input);
  const modifiers = situationModifiers(input, mismatch);
  const modTotal = modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
  // 判级和 UI 展示都使用同一条整数成功线。
  const finalRate = Math.round(clamp(baseRateRaw + modTotal, 5, 95));

  const rawRoll = (input.rollDice ?? (() => Math.floor(Math.random() * 100) + 1))();
  const roll = Math.round(clamp(rawRoll, 1, 100));
  const tier = tierOf(roll, finalRate);
  const mismatchCreated = action === '挡拆' && mismatch && (tier === '大成功' || tier === '成功');

  const defenderNames = defenders.map(player => player.cn);
  const vs = defenderNames.length ? ` 对位 ${defenderNames.join('、')}` : '';
  const withPartner = partner ? `（配合：${partner.cn}）` : '';
  const summary = `${actor.cn} ${action}${vs}${withPartner}：掷骰 ${roll}/成功线 ${finalRate} → ${tier}（${TIER_TEXT[tier]}）`;

  return {
    action,
    actor: actor.name,
    defender: defenders[0]?.name ?? null,
    defenders: defenders.map(player => player.name),
    partner: partner?.name ?? null,
    attackScore: Math.round(attackScore * 10) / 10,
    defenseScore: Math.round(defenseScore * 10) / 10,
    baseRate: Math.round(baseRateRaw),
    modifiers,
    finalRate,
    roll,
    tier,
    hardResult: makeHardResult(action, tier, mismatchCreated),
    summary,
  };
}
