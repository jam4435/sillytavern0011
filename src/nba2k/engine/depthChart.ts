import { cpuTendencies } from './tendencies';
import type { PlayerData, Position, StructuredTeamTactics } from './types';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const avg = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

export interface CoachRotationProfile {
  rotationDepth: number;
  benchTrust: number;
  starLoad: number;
  smallBallAffinity: number;
  playoffShortening: number;
  loadManagement: number;
  staggerStars: boolean;
}

export interface DepthChartEntry {
  key: string;
  player: PlayerData;
  rotationScore: number;
  starterScore: number;
  creationScore: number;
  closingScore: number;
  positions: Position[];
}

export interface DynamicDepthChart {
  entries: DepthChartEntry[];
  starters: { key: string; pos: Position }[];
  activeRotation: string[];
  staggerGroups: string[][];
  coach: CoachRotationProfile;
}

function defenseScore(player: PlayerData): number {
  const a = player.attrs;
  return avg(a.onBallDefenseIQ, a.lowPostDefenseIQ, a.shotContest, a.defensiveConsistency, a.reactionTime);
}

function offenseScore(player: PlayerData): number {
  const a = player.attrs;
  return avg(
    a.shotIQ,
    a.offensiveConsistency,
    a.drivingLayup,
    a.standingMid,
    a.standingThree,
    a.passIQ,
  );
}

function spacingScore(player: PlayerData): number {
  const a = player.attrs;
  return avg(a.standingThree, a.movingThree, a.shotIQ, a.hands);
}

function mobilityScore(player: PlayerData): number {
  const a = player.attrs;
  return avg(a.speed, a.acceleration, a.lateralQuickness, a.reactionTime);
}

function positionFit(player: PlayerData, position: Position): number {
  if (player.pos === position) return 10;
  if (player.secondaryPos === position) return 7;
  const distance = Math.abs(POSITIONS.indexOf(player.pos) - POSITIONS.indexOf(position));
  if (distance === 1) return -7;
  if (distance === 2) return -18;
  return -36;
}

function tacticFit(player: PlayerData, tactics?: StructuredTeamTactics): number {
  if (!tactics) return 0;
  const t = cpuTendencies(player);
  if (tactics.offense === '五外') return (t.three - 65) * .08 + (mobilityScore(player) - 65) * .03;
  if (tactics.offense === '动态进攻') return (t.passing - 65) * .06 + (t.offBall - 65) * .05;
  if (tactics.offense === '挡拆') return Math.max(t.pickRollHandler, t.pickRollScreener) * .06 - 4;
  if (tactics.offense === '低位') return (t.post - 65) * .07 + (player.attrs.strength - 65) * .03;
  if (tactics.offense === '四外一内') return Math.max(t.spotUp, t.post) * .05 - 3;
  return 0;
}

function makeEntry(player: PlayerData, tactics?: StructuredTeamTactics): DepthChartEntry {
  const t = cpuTendencies(player);
  const defense = defenseScore(player);
  const offense = offenseScore(player);
  const spacing = spacingScore(player);
  const mobility = mobilityScore(player);
  const creation = clamp(t.initiation * .65 + t.passing * .20 + t.usage * .15);
  const healthCapacity = avg(player.attrs.stamina, player.attrs.durability);
  const rotationScore = clamp(
    player.overall * .64 +
    offense * .10 +
    defense * .11 +
    healthCapacity * .08 +
    creation * .04 +
    tacticFit(player, tactics) +
    2,
  );
  const starterScore = clamp(
    rotationScore * .76 +
    player.overall * .14 +
    defense * .04 +
    spacing * .03 +
    healthCapacity * .03,
  );
  const closingScore = clamp(
    player.overall * .44 +
    player.attrs.composure * .12 +
    player.attrs.offensiveConsistency * .09 +
    player.attrs.defensiveConsistency * .09 +
    defense * .08 +
    spacing * .07 +
    creation * .08 +
    mobility * .03,
  );
  return {
    key: player.name,
    player,
    rotationScore,
    starterScore,
    creationScore: creation,
    closingScore,
    positions: [player.pos, ...(player.secondaryPos ? [player.secondaryPos] : [])],
  };
}

function deriveCoach(entries: DepthChartEntry[]): CoachRotationProfile {
  const ranked = [...entries].sort((a, b) => b.rotationScore - a.rotationScore);
  const topFive = ranked.slice(0, 5);
  const bench = ranked.slice(5, 10);
  const topAvg = avg(...topFive.map(entry => entry.rotationScore));
  const benchAvg = bench.length ? avg(...bench.map(entry => entry.rotationScore)) : topAvg - 15;
  const depthGap = topAvg - benchAvg;
  const benchTrust = clamp(82 - depthGap * 2.2 + Math.max(0, bench.length - 3) * 2, 35, 92);
  const top = ranked[0];
  const fifth = ranked[4] ?? top;
  const starGap = Math.max(0, (top?.rotationScore ?? 75) - (fifth?.rotationScore ?? 70));
  const starCapacity = top ? avg(top.player.attrs.stamina, top.player.attrs.durability) : 75;
  const starLoad = clamp(63 + starGap * 2.2 + (starCapacity - 75) * .32 - (benchTrust - 60) * .12, 48, 96);

  let rotationDepth = 8;
  if (benchTrust >= 58) rotationDepth += 1;
  if (benchTrust >= 70) rotationDepth += 1;
  if (benchTrust >= 82) rotationDepth += 1;
  rotationDepth = Math.min(rotationDepth, entries.length, 11);

  const mobileBigs = entries.filter(entry =>
    (entry.player.pos === 'SF' || entry.player.pos === 'PF' || entry.player.pos === 'C') &&
    mobilityScore(entry.player) >= 68 &&
    spacingScore(entry.player) >= 64,
  );
  const smallBallAffinity = clamp(38 + mobileBigs.length * 12 + (benchTrust - 60) * .25, 20, 94);
  const playoffShortening = clamp(.12 + (starLoad - 60) * .0032 - (benchTrust - 60) * .0014, .08, .32);
  const topDurability = topFive.length ? avg(...topFive.map(entry => entry.player.attrs.durability)) : 75;
  const loadManagement = clamp(50 + (76 - topDurability) * 1.5 + (benchTrust - 60) * .25, 15, 85);

  const creators = ranked.filter(entry => entry.creationScore >= 72);
  return {
    rotationDepth,
    benchTrust,
    starLoad,
    smallBallAffinity,
    playoffShortening,
    loadManagement,
    staggerStars: creators.length >= 2,
  };
}

function pickStarters(
  entries: DepthChartEntry[],
  tactics: StructuredTeamTactics | undefined,
  forcedStarter?: string | null,
): { key: string; pos: Position }[] {
  const unused = new Set(entries.map(entry => entry.key));
  const starters: { key: string; pos: Position }[] = [];

  for (const position of POSITIONS) {
    let best: DepthChartEntry | null = null;
    let bestScore = -Infinity;
    for (const entry of entries) {
      if (!unused.has(entry.key)) continue;
      let score = entry.starterScore + positionFit(entry.player, position) + tacticFit(entry.player, tactics);
      if (forcedStarter && entry.key === forcedStarter) score += 120;
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    if (!best) continue;
    unused.delete(best.key);
    starters.push({ key: best.key, pos: position });
  }
  return starters;
}

function buildStaggerGroups(
  entries: DepthChartEntry[],
  active: Set<string>,
  coach: CoachRotationProfile,
): string[][] {
  if (!coach.staggerStars) return [];
  const creators = entries
    .filter(entry => active.has(entry.key))
    .sort((a, b) => b.creationScore - a.creationScore);
  if (creators.length < 2 || creators[1].creationScore < 70) return [];
  return [[creators[0].key, creators[1].key]];
}

export function buildDynamicDepthChart(
  roster: PlayerData[],
  options: { tactics?: StructuredTeamTactics; forcedStarter?: string | null } = {},
): DynamicDepthChart {
  const entries = roster
    .map(player => makeEntry(player, options.tactics))
    .sort((a, b) => b.rotationScore - a.rotationScore);
  const coach = deriveCoach(entries);
  const starters = pickStarters(entries, options.tactics, options.forcedStarter);
  const starterKeys = new Set(starters.map(entry => entry.key));

  const ranked = [...entries].sort((a, b) => b.rotationScore - a.rotationScore);
  const active = ranked.slice(0, Math.max(5, coach.rotationDepth)).map(entry => entry.key);
  for (const key of starterKeys) {
    if (!active.includes(key)) active[active.length - 1] = key;
  }
  const activeSet = new Set(active);

  return {
    entries,
    starters,
    activeRotation: [...activeSet],
    staggerGroups: buildStaggerGroups(entries, activeSet, coach),
    coach,
  };
}

export function deriveDynamicMinuteWeights(chart: DynamicDepthChart): Record<string, number> {
  const active = new Set(chart.activeRotation);
  const ranked = chart.entries.filter(entry => active.has(entry.key));
  const starterSet = new Set(chart.starters.map(entry => entry.key));
  const rankCurve = [35, 34, 32, 30, 28, 24, 21, 17, 12, 8, 5];
  const median = ranked.length ? ranked[Math.min(ranked.length - 1, 4)].rotationScore : 75;
  const result: Record<string, number> = {};

  chart.entries.forEach(entry => {
    if (!active.has(entry.key)) {
      result[entry.key] = 0;
      return;
    }
    const rank = ranked.findIndex(item => item.key === entry.key);
    const base = rankCurve[rank] ?? 4;
    const quality = clamp((entry.rotationScore - median) * .42, -3.5, 4.5);
    const starter = starterSet.has(entry.key) ? 1.5 : 0;
    const stamina = (avg(entry.player.attrs.stamina, entry.player.attrs.durability) - 78) * .06;
    const star = rank < 2 ? (chart.coach.starLoad - 60) * .035 : 0;
    const bench = rank >= 5 ? (chart.coach.benchTrust - 60) * .025 : 0;
    result[entry.key] = Math.max(1, base + quality + starter + stamina + star + bench);
  });
  return result;
}
