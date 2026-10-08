import { getPlayerAvailability } from './availability';
import { buildDynamicDepthChart, deriveDynamicMinuteWeights } from './depthChart';
import type { CoachProfile } from './coachProfile';
import type { LeagueState } from './season';
import { deriveTeamStyle } from './teamStyle';
import type { PlayerData, StructuredTeamTactics } from './types';

const LEAGUE_BASE_ORTG = 106.4;
const LEAGUE_BASE_PACE = 95.8;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const avg = (...values: number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;

export interface TeamPowerRaw {
  teamId: string;
  healthyPlayers: number;
  rotationPlayers: number;
  offenseSkill: number;
  defenseSkill: number;
  reboundSkill: number;
  weightedOverall: number;
  topEnd: number;
  depth: number;
  paceScore: number;
  offenseFit: number;
  defenseFit: number;
  tactics: StructuredTeamTactics;
}

export interface TeamSimulationProfile extends TeamPowerRaw {
  /** 预测每100回合得分；只用于低精度后台比赛。 */
  offenseRating: number;
  /** 预测每100回合失分；越低越好。 */
  defenseRating: number;
  netRating: number;
  /** 预测每48分钟回合数。 */
  pace: number;
  power: number;
}

export type LeagueSimulationProfiles = Record<string, TeamSimulationProfile>;

function playerOffense(player: PlayerData): number {
  const a = player.attrs;
  const rim = avg(a.standingLayup, a.drivingLayup, a.standingDunk, a.drivingDunk, a.contactDunk);
  const shooting = avg(
    a.movingClose, a.standingClose,
    a.movingMid, a.standingMid,
    a.movingThree, a.standingThree,
    a.freeThrow,
  );
  const creation = avg(a.ballControl, a.passVision, a.passIQ, a.passAccuracy);
  const polish = avg(a.shotIQ, a.offensiveConsistency, a.composure, a.hands);
  return clamp(player.overall * .36 + rim * .16 + shooting * .22 + creation * .15 + polish * .11, 25, 99);
}

function playerDefense(player: PlayerData): number {
  const a = player.attrs;
  const positional = avg(a.onBallDefenseIQ, a.lowPostDefenseIQ, a.shotContest, a.lateralQuickness);
  const playmaking = avg(a.steal, a.block, a.reactionTime);
  const reliability = avg(a.defensiveConsistency, a.composure, a.hustle);
  const physical = avg(a.strength, a.speed, a.vertical);
  return clamp(player.overall * .22 + positional * .38 + playmaking * .16 + reliability * .16 + physical * .08, 25, 99);
}

function playerRebound(player: PlayerData): number {
  const a = player.attrs;
  return clamp(avg(a.offRebound, a.defRebound, a.boxout) * .76 + avg(a.vertical, a.strength, a.hustle) * .24, 25, 99);
}

function weighted(
  players: PlayerData[],
  weights: Record<string, number>,
  selector: (player: PlayerData) => number,
): number {
  let numerator = 0;
  let denominator = 0;
  for (const player of players) {
    const weight = Math.max(0, weights[player.name] ?? 0);
    numerator += selector(player) * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : 50;
}

function availabilityAdjustedWeights(
  roster: PlayerData[],
  league: LeagueState,
  coachProfile: CoachProfile | null | undefined,
  tactics: StructuredTeamTactics,
): { players: PlayerData[]; weights: Record<string, number>; rotationPlayers: number } {
  const players = roster.filter(player => getPlayerAvailability(player.name, league).available);
  if (!players.length) return { players: [], weights: {}, rotationPlayers: 0 };

  const chart = buildDynamicDepthChart(players, { tactics, coachProfile });
  const base = deriveDynamicMinuteWeights(chart);
  const weights: Record<string, number> = {};
  for (const player of players) {
    const availability = getPlayerAvailability(player.name, league);
    const planned = Math.max(0, base[player.name] ?? 0);
    const capFactor = availability.minuteLimit === null
      ? 1
      : clamp(availability.minuteLimit / Math.max(18, planned), .08, 1);
    weights[player.name] = planned * capFactor;
  }
  return {
    players,
    weights,
    rotationPlayers: chart.activeRotation.filter(key => (weights[key] ?? 0) > .25).length,
  };
}

export function deriveTeamPowerRaw(
  teamId: string,
  roster: PlayerData[],
  league: LeagueState,
): TeamPowerRaw {
  const coachProfile = league.教练[teamId] ?? null;
  const availableForStyle = roster.filter(player => getPlayerAvailability(player.name, league).available);
  const style = deriveTeamStyle(availableForStyle.length ? availableForStyle : roster, coachProfile);
  const { players, weights, rotationPlayers } = availabilityAdjustedWeights(
    roster,
    league,
    coachProfile,
    style.tactics,
  );

  if (!players.length) {
    return {
      teamId,
      healthyPlayers: 0,
      rotationPlayers: 0,
      offenseSkill: 45,
      defenseSkill: 45,
      reboundSkill: 45,
      weightedOverall: 45,
      topEnd: 45,
      depth: 30,
      paceScore: style.diagnostics.paceScore,
      offenseFit: 45,
      defenseFit: 45,
      tactics: style.tactics,
    };
  }

  const weightedOverall = weighted(players, weights, player => player.overall);
  const offenseSkill = weighted(players, weights, playerOffense);
  const defenseSkill = weighted(players, weights, playerDefense);
  const reboundSkill = weighted(players, weights, playerRebound);
  const top = [...players].sort((a, b) => b.overall - a.overall).slice(0, 3);
  const topEnd = avg(...top.map(player => player.overall));

  const rankedWeights = Object.entries(weights)
    .filter(([, weight]) => weight > .25)
    .sort((a, b) => b[1] - a[1]);
  const starters = new Set(rankedWeights.slice(0, 5).map(([key]) => key));
  const benchPlayers = players.filter(player => !starters.has(player.name) && (weights[player.name] ?? 0) > .25);
  const depth = benchPlayers.length
    ? weighted(benchPlayers, weights, player => player.overall)
    : Math.max(40, weightedOverall - 12);

  const offenseFit = Math.max(...Object.values(style.diagnostics.offenseScores));
  const defenseFit = Math.max(...Object.values(style.diagnostics.defenseScores));

  return {
    teamId,
    healthyPlayers: players.length,
    rotationPlayers,
    offenseSkill,
    defenseSkill,
    reboundSkill,
    weightedOverall,
    topEnd,
    depth,
    paceScore: style.diagnostics.paceScore,
    offenseFit,
    defenseFit,
    tactics: style.tactics,
  };
}

function mean(rows: TeamPowerRaw[], selector: (row: TeamPowerRaw) => number): number {
  return rows.length ? rows.reduce((sum, row) => sum + selector(row), 0) / rows.length : 0;
}

/**
 * 将“当前世界中的30队Roster”转换成后台低精度比赛使用的动态画像。
 * 2015-16真实联盟平均只作为量纲锚点；所有球队间强弱差都来自当下Roster/伤病/教练/体系。
 */
export function buildLeagueSimulationProfiles(
  league: LeagueState,
  rosters: Record<string, PlayerData[]>,
): LeagueSimulationProfiles {
  const raw = Object.entries(rosters).map(([teamId, roster]) => deriveTeamPowerRaw(teamId, roster, league));
  const avgOffense = mean(raw, row => row.offenseSkill);
  const avgDefense = mean(raw, row => row.defenseSkill);
  const avgRebound = mean(raw, row => row.reboundSkill);
  const avgOverall = mean(raw, row => row.weightedOverall);
  const avgTop = mean(raw, row => row.topEnd);
  const avgDepth = mean(raw, row => row.depth);
  const avgOffenseFit = mean(raw, row => row.offenseFit);
  const avgDefenseFit = mean(raw, row => row.defenseFit);
  const avgPaceScore = mean(raw, row => row.paceScore);

  return Object.fromEntries(raw.map(row => {
    const availabilityPenalty =
      row.healthyPlayers < 8 ? (8 - row.healthyPlayers) * .75 : 0;
    const rotationPenalty =
      row.rotationPlayers < 8 ? (8 - row.rotationPlayers) * .45 : 0;

    const offenseDelta =
      (row.offenseSkill - avgOffense) * .40 +
      (row.weightedOverall - avgOverall) * .22 +
      (row.topEnd - avgTop) * .14 +
      (row.depth - avgDepth) * .08 +
      (row.offenseFit - avgOffenseFit) * .055 -
      availabilityPenalty -
      rotationPenalty;

    const defenseDelta =
      (row.defenseSkill - avgDefense) * .43 +
      (row.weightedOverall - avgOverall) * .15 +
      (row.reboundSkill - avgRebound) * .13 +
      (row.depth - avgDepth) * .07 +
      (row.defenseFit - avgDefenseFit) * .05 -
      availabilityPenalty * .75 -
      rotationPenalty * .70;

    const offenseRating = clamp(LEAGUE_BASE_ORTG + offenseDelta, 94, 119);
    const defenseRating = clamp(LEAGUE_BASE_ORTG - defenseDelta, 94, 119);
    const paceBias =
      row.tactics.pace === '快' ? 1.15 :
      row.tactics.pace === '慢' ? -1.15 :
      0;
    const pace = clamp(
      LEAGUE_BASE_PACE + (row.paceScore - avgPaceScore) * .28 + paceBias,
      89,
      103,
    );
    const netRating = offenseRating - defenseRating;
    const power = clamp(
      80 + netRating * .72 + (row.topEnd - avgTop) * .12 + (row.depth - avgDepth) * .07,
      65,
      96,
    );
    return [row.teamId, {
      ...row,
      offenseRating,
      defenseRating,
      netRating,
      pace,
      power,
    }];
  }));
}

function neutralProfile(teamId: string): TeamSimulationProfile {
  const tactics: StructuredTeamTactics = {
    offense: '基础',
    defense: '人盯人',
    pace: '标准',
    helpIntensity: 50,
    rebound: '均衡',
  };
  return {
    teamId,
    healthyPlayers: 10,
    rotationPlayers: 9,
    offenseSkill: 75,
    defenseSkill: 75,
    reboundSkill: 75,
    weightedOverall: 75,
    topEnd: 78,
    depth: 72,
    paceScore: 74,
    offenseFit: 70,
    defenseFit: 70,
    tactics,
    offenseRating: LEAGUE_BASE_ORTG,
    defenseRating: LEAGUE_BASE_ORTG,
    netRating: 0,
    pace: LEAGUE_BASE_PACE,
    power: 80,
  };
}

function scoreNoise(rng: () => number): number {
  // 三个均匀随机数叠加，避免原先单次±9分的“平顶噪声”。
  return ((rng() + rng() + rng()) - 1.5) * 10.5;
}

/**
 * 低精度球队级GameSim。只负责后台联盟赛果，不生成球员box score。
 * 输入画像完全由当前世界状态派生；这里不读取静态TEAMS.overall。
 */
export function simulateLowFidelityGame(
  homeId: string,
  awayId: string,
  profiles: LeagueSimulationProfiles | null | undefined,
  rng: () => number,
  playoffs = false,
): [number, number] {
  const home = profiles?.[homeId] ?? neutralProfile(homeId);
  const away = profiles?.[awayId] ?? neutralProfile(awayId);
  const possessions = clamp(
    (home.pace + away.pace) / 2 - (playoffs ? 1.1 : 0) + ((rng() + rng()) - 1) * 2.2,
    87,
    104,
  );

  // 对手防守画像以“对联盟平均的DRtg偏差”进入本队进攻效率。
  const homeMatchupOrtg =
    LEAGUE_BASE_ORTG +
    (home.offenseRating - LEAGUE_BASE_ORTG) +
    (away.defenseRating - LEAGUE_BASE_ORTG) +
    2.25;
  const awayMatchupOrtg =
    LEAGUE_BASE_ORTG +
    (away.offenseRating - LEAGUE_BASE_ORTG) +
    (home.defenseRating - LEAGUE_BASE_ORTG);

  let homeScore = Math.round(possessions * homeMatchupOrtg / 100 + scoreNoise(rng));
  let awayScore = Math.round(possessions * awayMatchupOrtg / 100 + scoreNoise(rng));
  homeScore = Math.max(72, homeScore);
  awayScore = Math.max(72, awayScore);
  if (homeScore === awayScore) {
    if (rng() < .56) homeScore += 1;
    else awayScore += 1;
  }
  return [homeScore, awayScore];
}
