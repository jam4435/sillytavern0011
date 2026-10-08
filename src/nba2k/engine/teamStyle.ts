import { deriveCpuTendencies } from './tendencies';
import type { DefensiveScheme, OffensiveScheme, PlayerData, StructuredTeamTactics } from './types';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const avg = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

export interface TeamStyleDiagnostics {
  offenseScores: Record<OffensiveScheme, number>;
  defenseScores: Record<DefensiveScheme, number>;
  paceScore: number;
  helpScore: number;
  reboundScore: number;
  spacingScore: number;
  passingScore: number;
  mobilityScore: number;
}

export interface DerivedTeamStyle {
  tactics: StructuredTeamTactics;
  diagnostics: TeamStyleDiagnostics;
}

function weightedAverage(
  players: PlayerData[],
  selector: (player: PlayerData) => number,
): number {
  if (!players.length) return 50;
  let total = 0;
  let weightTotal = 0;
  players.forEach((player, index) => {
    const weight = index < 5 ? 1.35 : index < 8 ? 1 : .65;
    total += selector(player) * weight;
    weightTotal += weight;
  });
  return total / Math.max(.001, weightTotal);
}

function best(players: PlayerData[], selector: (player: PlayerData) => number, count = 1): number {
  const values = players.map(selector).sort((a, b) => b - a).slice(0, count);
  return values.length ? avg(...values) : 50;
}

function rotationPool(roster: PlayerData[]): PlayerData[] {
  return [...roster]
    .sort((a, b) => {
      const aScore = a.overall * .88 + a.attrs.stamina * .07 + a.attrs.durability * .05;
      const bScore = b.overall * .88 + b.attrs.stamina * .07 + b.attrs.durability * .05;
      return bScore - aScore;
    })
    .slice(0, Math.min(10, roster.length));
}

function offenseScheme(scores: Record<OffensiveScheme, number>): OffensiveScheme {
  return (Object.entries(scores) as [OffensiveScheme, number][])
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '基础';
}

function defenseScheme(scores: Record<DefensiveScheme, number>): DefensiveScheme {
  return (Object.entries(scores) as [DefensiveScheme, number][])
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '人盯人';
}

/**
 * TeamStyleEngine：只读取“当前可用阵容”。
 * 不读取球队ID、历史年份或真实球队答案，因此交易、退役、选秀、生成球员后会自然重算。
 */
export function deriveTeamStyle(roster: PlayerData[]): DerivedTeamStyle {
  const pool = rotationPool(roster);
  if (!pool.length) {
    const tactics: StructuredTeamTactics = {
      offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡',
    };
    return {
      tactics,
      diagnostics: {
        offenseScores: { 基础: 50, 五外: 0, 四外一内: 0, 挡拆: 0, 低位: 0, 动态进攻: 0 },
        defenseScores: { 人盯人: 50, 二三联防: 0, 换防: 0, 沉退: 0, 延误: 0 },
        paceScore: 50, helpScore: 50, reboundScore: 50,
        spacingScore: 50, passingScore: 50, mobilityScore: 50,
      },
    };
  }

  const tendencies = new Map(pool.map(player => [player.name, deriveCpuTendencies(player)]));
  const t = (player: PlayerData) => tendencies.get(player.name)!;
  const guards = pool.filter(player => player.pos === 'PG' || player.pos === 'SG' || player.pos === 'SF');
  const bigs = pool.filter(player => player.pos === 'PF' || player.pos === 'C');

  const spacing = weightedAverage(pool, player => t(player).three * .72 + t(player).spotUp * .28);
  const perimeterSpacing = weightedAverage(guards.length ? guards : pool, player => t(player).three * .7 + t(player).spotUp * .3);
  const passing = weightedAverage(pool, player => t(player).passing);
  const offBall = weightedAverage(pool, player => t(player).offBall);
  const mobility = weightedAverage(pool, player => avg(player.attrs.speed, player.attrs.acceleration, player.attrs.lateralQuickness));
  const stamina = weightedAverage(pool, player => avg(player.attrs.stamina, player.attrs.durability));
  const handling = best(pool, player => t(player).handling, 3);
  const initiation = best(pool, player => t(player).initiation, 3);
  const pnrHandler = best(pool, player => t(player).pickRollHandler, 2);
  const pnrScreener = best(bigs.length ? bigs : pool, player => t(player).pickRollScreener, 2);
  const post = best(bigs.length ? bigs : pool, player => t(player).post, 2);
  const rim = best(bigs.length ? bigs : pool, player => t(player).rim, 2);
  const interiorAnchor = best(bigs.length ? bigs : pool, player =>
    avg(player.attrs.lowPostDefenseIQ, player.attrs.block, player.attrs.shotContest, player.attrs.defRebound, player.attrs.strength), 2);
  const mobileBig = best(bigs.length ? bigs : pool, player =>
    avg(player.attrs.lateralQuickness, player.attrs.speed, player.attrs.reactionTime, t(player).three), 2);

  const perimeterDefense = weightedAverage(guards.length ? guards : pool, player =>
    avg(player.attrs.onBallDefenseIQ, player.attrs.lateralQuickness, player.attrs.shotContest, player.attrs.reactionTime));
  const teamDefense = weightedAverage(pool, player =>
    avg(player.attrs.onBallDefenseIQ, player.attrs.lowPostDefenseIQ, player.attrs.defensiveConsistency, player.attrs.reactionTime));
  const help = weightedAverage(pool, player =>
    avg(player.attrs.reactionTime, player.attrs.shotContest, player.attrs.defensiveConsistency));
  const defensiveMobility = weightedAverage(pool, player =>
    avg(player.attrs.lateralQuickness, player.attrs.speed, player.attrs.reactionTime));
  const offensiveRebound = weightedAverage(pool, player =>
    avg(player.attrs.offRebound, player.attrs.hustle, player.attrs.strength));
  const defensiveRebound = weightedAverage(pool, player =>
    avg(player.attrs.defRebound, player.attrs.boxout, player.attrs.strength));

  const offenseScores: Record<OffensiveScheme, number> = {
    基础: avg(spacing, passing, handling, rim, post),
    五外: spacing * .38 + perimeterSpacing * .18 + handling * .13 + passing * .11 + mobileBig * .20,
    四外一内: perimeterSpacing * .27 + handling * .12 + passing * .12 + post * .24 + rim * .25,
    挡拆: pnrHandler * .34 + pnrScreener * .24 + handling * .12 + passing * .14 + spacing * .16,
    低位: post * .42 + rim * .18 + passing * .10 + spacing * .08 + interiorAnchor * .12 + best(bigs.length ? bigs : pool, p => p.attrs.strength, 2) * .10,
    动态进攻: passing * .28 + offBall * .26 + spacing * .20 + handling * .12 + initiation * .14,
  };

  // 避免“任何稍有投射的队都五外”：必须真的有能拉开的机动内线。
  if (mobileBig < 67) offenseScores.五外 -= 8;
  if (passing < 68) offenseScores.动态进攻 -= 6;
  if (post < 72) offenseScores.低位 -= 5;

  const defenseScores: Record<DefensiveScheme, number> = {
    人盯人: perimeterDefense * .35 + teamDefense * .35 + defensiveMobility * .15 + help * .15,
    二三联防: interiorAnchor * .30 + help * .28 + defensiveRebound * .18 + teamDefense * .16 - perimeterDefense * .08 - 5,
    换防: defensiveMobility * .34 + perimeterDefense * .28 + teamDefense * .18 + mobileBig * .20,
    沉退: interiorAnchor * .42 + defensiveRebound * .20 + perimeterDefense * .15 + teamDefense * .13 - mobileBig * .10 + 8,
    延误: mobileBig * .28 + perimeterDefense * .26 + help * .20 + defensiveMobility * .18 + teamDefense * .08,
  };

  const paceScore = clamp(
    mobility * .31 + handling * .18 + initiation * .12 + stamina * .25 + offBall * .14 - Math.max(0, post - 78) * .22,
  );
  const helpScore = clamp(help * .48 + interiorAnchor * .24 + teamDefense * .20 + (100 - perimeterDefense) * .08);
  const reboundScore = clamp(offensiveRebound * .58 + defensiveRebound * .20 + stamina * .12 + (100 - paceScore) * .10);

  const tactics: StructuredTeamTactics = {
    offense: offenseScheme(offenseScores),
    defense: defenseScheme(defenseScores),
    pace: paceScore >= 72 ? '快' : paceScore <= 62 ? '慢' : '标准',
    helpIntensity: Math.round(clamp(helpScore, 35, 82)),
    rebound: reboundScore >= 70 ? '冲抢' : reboundScore <= 58 || paceScore >= 76 ? '优先退防' : '均衡',
  };

  return {
    tactics,
    diagnostics: {
      offenseScores,
      defenseScores,
      paceScore,
      helpScore,
      reboundScore,
      spacingScore: spacing,
      passingScore: passing,
      mobilityScore: mobility,
    },
  };
}

export function deriveTeamTactics(roster: PlayerData[]): StructuredTeamTactics {
  return deriveTeamStyle(roster).tactics;
}
