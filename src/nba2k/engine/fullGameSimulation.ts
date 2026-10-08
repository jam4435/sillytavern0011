import { planPossession, simulatePossession } from './possession';
import type { PlayerResolver, RandomSource } from './possession';
import { applyAutomaticRotation } from './rotation';
import type { RotationOverrides } from './rotation';
import { createRotationPlan } from './rotationPlan';
import type { MatchState, Side } from './types';

export interface FullGameSimulationResult {
  match: MatchState;
  possessions: { 主: number; 客: number; total: number };
  iterations: number;
  summaries: string[];
}

const opposite = (side: Side): Side => side === '主' ? '客' : '主';

/**
 * 用和玩家比赛完全相同的 PossessionEngine + RotationEngine 跑完整48分钟。
 * 仅用于 CPU 高精度审计/测试，不替代赛季里其他29队的低精度 GameSim。
 */
export function simulateFullGame(
  initial: MatchState,
  resolvePlayer: PlayerResolver,
  options: {
    rng?: RandomSource;
    maxIterations?: number;
    keepSummaries?: number;
    rotationOverrides?: RotationOverrides;
  } = {},
): FullGameSimulationResult {
  const rng = options.rng ?? Math.random;
  const maxIterations = options.maxIterations ?? 1200;
  const keepSummaries = options.keepSummaries ?? 20;
  let current: MatchState = initial.轮换
    ? initial
    : { ...initial, 轮换: createRotationPlan(initial, resolvePlayer, { overrides: options.rotationOverrides }) };
  const possessions = { 主: 0, 客: 0, total: 0 };
  const summaries: string[] = [];
  let iterations = 0;

  while (current.进行中 && iterations < maxIterations) {
    iterations += 1;
    if (current.回合阶段 !== '常规回合') {
      throw new Error(`完整比赛模拟停在未结算阶段：${current.回合阶段}`);
    }

    const before = current;
    const offense = current.球权;
    const plan = planPossession(current, resolvePlayer, rng);
    const result = simulatePossession(current, resolvePlayer, { rng, plan });
    current = result.match;

    const periodEnded = current.节次 !== before.节次;
    const gameEnded = !current.进行中;
    const completed = Boolean(result.possessionsCompleted || periodEnded || gameEnded);
    if (completed) {
      possessions[offense] += 1;
      possessions.total += 1;
      if (current.进行中) current = applyAutomaticRotation(current, resolvePlayer, options.rotationOverrides);
    }

    if (keepSummaries > 0 && result.summary) {
      summaries.push(result.summary);
      if (summaries.length > keepSummaries) summaries.shift();
    }

    // 极端情况下回合没有交换球权（如前场板），继续同一 possession；
    // 若比赛结束时球权仍恰好相同，上面的 period/gameEnded 仍会计入最后一攻。
    if (!completed && current.球权 === opposite(offense) && current.进行中) {
      possessions[offense] += 1;
      possessions.total += 1;
      current = applyAutomaticRotation(current, resolvePlayer, options.rotationOverrides);
    }
  }

  if (current.进行中) {
    throw new Error(`完整比赛模拟超过最大循环次数 ${maxIterations}，疑似存在不会结束的 possession`);
  }

  return { match: current, possessions, iterations, summaries };
}
