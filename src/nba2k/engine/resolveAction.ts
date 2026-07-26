import { ACTION_SPECS, weightedScore } from './attributes';
import type {
  ActionResolution,
  ActionType,
  OnCourtStatus,
  PlayerData,
  ResultTier,
  SituationContext,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface ResolveInput {
  action: ActionType;
  actor: PlayerData;
  actorStatus: OnCourtStatus;
  /** 对位球员；无对位判定（无球跑动）传 null */
  defender: PlayerData | null;
  /** 第二参与者：挡拆掩护人 / 传球接球人 */
  partner: PlayerData | null;
  situation: SituationContext;
  /** 注入骰子便于测试；默认 1-100 均匀随机 */
  rollDice?: () => number;
}

/** 情境修正明细（见 设计文档.md §3.2） */
function situationModifiers(
  input: ResolveInput,
): { label: string; value: number }[] {
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

  if (situation.mismatch) mods.push({ label: '挡拆错位', value: 8 });

  if (situation.coverage === 'open') mods.push({ label: '空位', value: 10 });
  else if (situation.coverage === 'tight') mods.push({ label: '严防', value: -8 });

  mods.push(situation.isHome ? { label: '主场', value: 2 } : { label: '客场', value: -2 });

  if (situation.defenderFouls >= 4) mods.push({ label: '对位犯规危机', value: 5 });

  return mods;
}

function tierOf(roll: number, finalRate: number): ResultTier {
  if (roll >= 97) return '大失败';
  if (roll <= finalRate * 0.25) return '大成功';
  if (roll <= finalRate) return '成功';
  if (roll <= finalRate + 15) return '部分成功';
  return '失败';
}

const TIER_TEXT: Record<ResultTier, string> = {
  大成功: '完美执行，效果拉满',
  成功: '执行成功',
  部分成功: '勉强完成，效果打折',
  失败: '执行失败',
  大失败: '严重失误，攻守易位风险',
};

/**
 * 核心判定：属性加权对抗 + 情境修正 + 1d100。
 * 判定完全在前端完成，AI 只演出结果（稳定约束）。
 */
export function resolveAction(input: ResolveInput): ActionResolution {
  const { action, actor, defender, partner } = input;
  const spec = ACTION_SPECS[action];

  let attackScore = weightedScore(spec.attack, actor.attrs, actor.overall, actor.height_cm);

  // 挡拆：掩护人的 strength 顶替发起人 strength 权重
  if (action === '挡拆' && partner) {
    attackScore =
      weightedScore(
        { ballHandle: 0.35, speed: 0.25 },
        actor.attrs,
        actor.overall,
        actor.height_cm,
      ) +
      partner.attrs.strength * 0.4;
  }

  const defenseScore = defender
    ? weightedScore(spec.defense, defender.attrs, defender.overall, defender.height_cm)
    : (spec.flatDefense ?? 55);

  const diff = attackScore - defenseScore;
  const baseRate = clamp(50 + diff * 1.1, 15, 90);

  const modifiers = situationModifiers(input);
  const modTotal = modifiers.reduce((s, m) => s + m.value, 0);
  const finalRate = clamp(baseRate + modTotal, 5, 95);

  const roll = (input.rollDice ?? (() => Math.floor(Math.random() * 100) + 1))();
  const tier = tierOf(roll, finalRate);

  const vs = defender ? ` 对位 ${defender.cn}` : '';
  const withPartner = partner ? `（配合：${partner.cn}）` : '';
  const summary = `${actor.cn} ${action}${vs}${withPartner}：掷骰 ${roll}/成功线 ${Math.round(finalRate)} → ${tier}（${TIER_TEXT[tier]}）`;

  return {
    action,
    actor: actor.name,
    defender: defender?.name ?? null,
    partner: partner?.name ?? null,
    attackScore: Math.round(attackScore * 10) / 10,
    defenseScore: Math.round(defenseScore * 10) / 10,
    baseRate: Math.round(baseRate),
    modifiers,
    finalRate: Math.round(finalRate),
    roll,
    tier,
    summary,
  };
}
