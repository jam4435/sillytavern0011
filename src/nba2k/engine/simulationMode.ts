import { planPossession, prepareMatchForPlan, simulatePossession } from './possession';
import type { PlayerResolver, PossessionPlan, RandomSource } from './possession';
import type { MatchState, Side } from './types';

export type SimulationMode = '全回合' | '精简比赛' | '关键时刻';

export interface InterruptionDecision {
  interrupt: boolean;
  reason: string;
}

export interface AutoSimulationSegment {
  match: MatchState;
  summaries: string[];
  possessions: number;
  nextPlan: PossessionPlan | null;
  interruptionReason: string | null;
}

function protagonistSide(match: MatchState, protagonist: string): Side | null {
  if (match.阵容.主.场上.includes(protagonist) || match.阵容.主.替补.includes(protagonist)) return '主';
  if (match.阵容.客.场上.includes(protagonist) || match.阵容.客.替补.includes(protagonist)) return '客';
  return null;
}

function isOnCourt(match: MatchState, protagonist: string, side: Side | null): boolean {
  return Boolean(side && match.阵容[side].场上.includes(protagonist));
}

function isKeyMoment(match: MatchState, protagonist: string, side: Side): string | null {
  const status = match.球员状态[protagonist];
  const diff = Math.abs(match.比分.主 - match.比分.客);
  if (match.节次 >= 4 && match.剩余秒数 <= 300 && diff <= 8) return '第四节关键五分钟';
  if (match.节次 >= 4 && match.剩余秒数 <= 120 && diff <= 12) return '最后两分钟';
  if (status?.犯规 >= 5) return '主角五犯';
  if (status?.手感 === '热' && status.连续命中 >= 3) return '主角手感火热';
  if (status && (status.得分 === 9 || status.得分 === 19 || status.得分 === 29 || status.得分 === 39 || status.得分 === 49)) return '主角接近得分里程碑';
  const myScore = match.比分[side];
  const oppScore = match.比分[side === '主' ? '客' : '主'];
  if (match.节次 >= 3 && myScore < oppScore && oppScore - myScore <= 5) return '追分阶段';
  return null;
}

export function shouldInterruptForPlan(
  mode: SimulationMode,
  match: MatchState,
  protagonist: string,
  plan: PossessionPlan,
): InterruptionDecision {
  const side = protagonistSide(match, protagonist);
  if (!side || !isOnCourt(match, protagonist, side)) return { interrupt: false, reason: '主角不在场' };

  if (mode === '全回合') return { interrupt: true, reason: '全回合模式' };

  const protagonistInPlan = plan.initiator === protagonist || plan.partner === protagonist || plan.primaryDefender === protagonist;
  if (mode === '精简比赛') {
    return protagonistInPlan
      ? { interrupt: true, reason: plan.offense === side ? '本回合由主角直接参与进攻' : '本回合直接针对主角防守' }
      : { interrupt: false, reason: '本回合与主角无直接决策关系' };
  }

  const key = isKeyMoment(match, protagonist, side);
  if (key) return { interrupt: true, reason: key };
  if (protagonistInPlan && match.节次 >= 4 && match.剩余秒数 <= 420) return { interrupt: true, reason: '末节主角直接参与' };
  return { interrupt: false, reason: '非关键时段' };
}

/**
 * 使用同一个 PossessionEngine 连续推进，直到“下一回合需要玩家介入”。
 * 三种节奏只改变暂停策略，不改变任何数值算法。
 */
export function simulateUntilInterruption(
  match: MatchState,
  mode: Exclude<SimulationMode, '全回合'>,
  protagonist: string,
  resolvePlayer: PlayerResolver,
  options: { rng?: RandomSource; maxPossessions?: number } = {},
): AutoSimulationSegment {
  const rng = options.rng ?? Math.random;
  const maxPossessions = options.maxPossessions ?? (mode === '精简比赛' ? 5 : 14);
  let current = match;
  const summaries: string[] = [];
  let possessions = 0;

  while (current.进行中 && possessions < maxPossessions) {
    if (current.回合阶段 !== '常规回合') break;
    const heroSide = protagonistSide(current, protagonist);
    const actualHolder = heroSide ? current.站位[heroSide].find(spot => spot.持球)?.球员 : undefined;
    if (mode === '精简比赛' && heroSide === current.球权 && actualHolder === protagonist) {
      return {
        match: current,
        summaries,
        possessions,
        nextPlan: null,
        interruptionReason: '主角当前持球',
      };
    }
    const plan = planPossession(current, resolvePlayer, rng);
    const decision = shouldInterruptForPlan(mode, current, protagonist, plan);
    if (decision.interrupt) {
      return {
        match: plan.initiator === protagonist ? prepareMatchForPlan(current, plan) : current,
        summaries,
        possessions,
        nextPlan: plan,
        interruptionReason: decision.reason,
      };
    }
    const result = simulatePossession(current, resolvePlayer, { rng, plan });
    current = result.match;
    possessions += Math.max(1, result.possessionsCompleted);
    summaries.push(result.summary);
  }

  if (!current.进行中 || current.回合阶段 !== '常规回合') {
    return { match: current, summaries, possessions, nextPlan: null, interruptionReason: null };
  }

  const nextPlan = planPossession(current, resolvePlayer, rng);
  const decision = shouldInterruptForPlan(mode, current, protagonist, nextPlan);
  return {
    match: decision.interrupt && nextPlan.initiator === protagonist ? prepareMatchForPlan(current, nextPlan) : current,
    summaries,
    possessions,
    nextPlan,
    interruptionReason: decision.interrupt ? decision.reason : '达到本次快速模拟上限',
  };
}
