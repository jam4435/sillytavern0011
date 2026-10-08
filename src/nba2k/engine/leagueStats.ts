import { getPlayerAvailability } from './availability';
import { buildDynamicDepthChart, deriveDynamicMinuteWeights } from './depthChart';
import { estimateInitialAge } from './lifecycle';
import { deriveTeamStyle } from './teamStyle';
import { deriveCpuTendencies } from './tendencies';
import type { LeagueState } from './season';
import type { TeamSimulationProfile } from './teamPower';
import type { MatchState, PlayerData } from './types';

/** 只储存赛季累计数，不保存其他29队的逐场Box Score。 */
export interface PlayerSeasonTotals {
  teamId: string;
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
}
export type LeaguePlayerSeasonStats = Record<string, PlayerSeasonTotals>;
export interface SeasonAwards {
  season: string;
  mvp: string | null;
  rookie: string | null;
  dpoy: string | null;
  allNBA: string[][];
  allDefense: string[][];
}
export type LeaderboardCategory = 'pts' | 'reb' | 'ast' | 'stl' | 'blk';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const mean = (...items: number[]) => items.reduce((sum, item) => sum + item, 0) / Math.max(1, items.length);

export function emptyPlayerSeasonTotals(teamId: string): PlayerSeasonTotals {
  return { teamId, gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0 };
}

const TOTAL_KEYS = ['gp', 'min', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga',
  'threePm', 'threePa', 'ftm', 'fta'] as const;

/** 由一次比赛的统计增量写入，绝不改写其他球队之前的历史累计。 */
export function addSeasonLines(
  previous: LeaguePlayerSeasonStats,
  lines: LeaguePlayerSeasonStats,
): LeaguePlayerSeasonStats {
  const next = { ...previous };
  for (const [key, line] of Object.entries(lines)) {
    if (!line.gp) continue;
    const existing = next[key] ?? emptyPlayerSeasonTotals(line.teamId);
    const merged = { ...existing, teamId: line.teamId };
    for (const stat of TOTAL_KEYS) merged[stat] = existing[stat] + line[stat];
    next[key] = merged;
  }
  return next;
}

/** 按权重将整数总量分给队员，保证分项合计不漂移。 */
function allocate(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const safe = weights.map(weight => Math.max(0, weight));
  const sum = safe.reduce((a, b) => a + b, 0);
  if (!sum) return allocate(total, weights.map(() => 1));
  const desired = safe.map(weight => total * weight / sum);
  const values = desired.map(Math.floor);
  let remaining = total - values.reduce((a, b) => a + b, 0);
  const order = desired.map((value, index) => ({ index, fraction: value - values[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remaining; i++) values[order[i % order.length].index]++;
  return values;
}

/**
 * 正常情况下严格执行每人分钟限制，并将剩余分钟给可用轮换。
 * 当全队可承担的上限不足240时回退到比例分配，保证赛果不产生无主分钟。
 */
function allocateTeamMinutes(weights: number[], caps: number[]): number[] {
  const boundedCaps = caps.map(cap => Math.floor(clamp(cap, 0, 48)));
  if (boundedCaps.reduce((sum, value) => sum + value, 0) < 240) return allocate(240, weights);
  const result = weights.map(() => 0);
  const active = new Set(weights.map((value, index) => value > 0 ? index : -1).filter(index => index >= 0));
  let remaining = 240;
  for (let pass = 0; pass < weights.length && active.size; pass++) {
    const sum = [...active].reduce((total, index) => total + weights[index], 0);
    const over = [...active].filter(index => remaining * weights[index] / sum > boundedCaps[index]);
    if (!over.length) {
      const indices = [...active];
      const shares = allocate(remaining, indices.map(index => weights[index]));
      indices.forEach((index, i) => { result[index] = shares[i]; });
      return result;
    }
    for (const index of over) {
      result[index] = boundedCaps[index];
      remaining -= result[index];
      active.delete(index);
    }
  }
  return result;
}

/**
 * 后台单场：球队比分由 TeamPower GameSim 决定，再拆给当前真实轮换。
 * 不产生可被 AI 修改的每场球员日志；只有累计数字进入 stat_data。
 */
export function simulateTeamSeasonLines(
  teamId: string,
  roster: PlayerData[],
  league: LeagueState,
  profile: TeamSimulationProfile,
  teamPoints: number,
  rng: () => number,
): LeaguePlayerSeasonStats {
  const players = roster.filter(player => getPlayerAvailability(player.name, league).available);
  if (players.length < 5) return {};
  const style = deriveTeamStyle(players, league.教练[teamId] ?? null);
  const chart = buildDynamicDepthChart(players, { tactics: style.tactics, coachProfile: league.教练[teamId] ?? null });
  const base = deriveDynamicMinuteWeights(chart);
  const minuteWeights = players.map(player => {
    const available = getPlayerAvailability(player.name, league);
    const minutes = base[player.name] ?? 0;
    const limit = available.minuteLimit ?? 48;
    return Math.max(0, Math.min(minutes, limit));
  });
  // 原比赛结果已确定，总分钟统一到240；可行时复出限制作为硬上限。
  const minutes = allocateTeamMinutes(minuteWeights, players.map(player =>
    getPlayerAvailability(player.name, league).minuteLimit ?? 48));
  const tendencies = players.map(deriveCpuTendencies);
  const pointsWeights = players.map((player, i) => minutes[i] * (0.25 + tendencies[i].usage / 22)
    * (0.8 + player.overall / 400) * (0.89 + rng() * .22));
  const points = allocate(teamPoints, pointsWeights);
  const boards = allocate(Math.round(clamp(44 + (profile.reboundSkill - 70) * .13 + (rng() - .5) * 10, 32, 57)),
    players.map((player, i) => minutes[i] * mean(player.attrs.defRebound, player.attrs.offRebound, player.attrs.boxout) / 65));
  const assists = allocate(Math.round(clamp(teamPoints * .235 + (rng() - .5) * 6, 12, 35)),
    players.map((player, i) => minutes[i] * mean(player.attrs.passIQ, player.attrs.passAccuracy, tendencies[i].passing) / 70
      * (player.pos === 'PG' ? 1.6 : player.pos === 'SG' ? 1.2 : 1)));
  const steals = allocate(Math.round(6 + rng() * 5),
    players.map((player, i) => minutes[i] * player.attrs.steal / 75));
  const blocks = allocate(Math.round(3 + rng() * 5),
    players.map((player, i) => minutes[i] * player.attrs.block / 65));
  const turnovers = allocate(Math.round(10 + rng() * 6),
    players.map((player, i) => minutes[i] * (0.5 + tendencies[i].usage / 30 + tendencies[i].handling / 160)));

  return Object.fromEntries(players.map((player, i) => {
    if (!minutes[i]) return [player.name, emptyPlayerSeasonTotals(teamId)];
    const pts = points[i];
    let ftm = Math.round(pts * (0.1 + tendencies[i].drawFoul / 1000));
    let threes = Math.floor(Math.max(0, pts - ftm) * (player.pos === 'C' ? .07 : .20 + tendencies[i].three / 1000) / 3);
    if ((pts - ftm - threes * 3) % 2 !== 0) ftm++;
    const twos = Math.max(0, Math.floor((pts - ftm - threes * 3) / 2));
    const fgm = twos + threes;
    const threePa = threes ? Math.max(threes, Math.round(threes * (2.5 + (rng() - .5) * .5))) : (tendencies[i].three > 70 && pts ? 1 : 0);
    const fga = fgm + Math.round(fgm * (0.83 + (rng() - .5) * .3)) + Math.max(0, threePa - threes);
    const ftSkill = clamp(player.attrs.freeThrow / 100, .48, .94);
    const fta = ftm ? Math.max(ftm, Math.round(ftm / ftSkill)) : 0;
    const line: PlayerSeasonTotals = {
      teamId, gp: 1, min: minutes[i], pts, reb: boards[i], ast: assists[i],
      stl: steals[i], blk: blocks[i], tov: turnovers[i],
      fgm, fga, threePm: threes, threePa, ftm, fta,
    };
    return [player.name, line];
  }).filter(([, line]) => (line as PlayerSeasonTotals).gp > 0));
}

/** 玩家比赛使用已有完整 MatchState 的真实 Box Score，不额外模拟第二份个人成绩。 */
export function matchSeasonLines(match: MatchState): LeaguePlayerSeasonStats {
  const result: LeaguePlayerSeasonStats = {};
  for (const side of ['主', '客'] as const) {
    const teamId = side === '主' ? match.对阵.主队 : match.对阵.客队;
    const keys = [...match.阵容[side].场上, ...match.阵容[side].替补];
    for (const key of new Set(keys)) {
      const s = match.球员状态[key];
      if (!s || s.上场秒数 <= 0) continue;
      result[key] = {
        teamId, gp: 1, min: Math.round(s.上场秒数 / 60 * 10) / 10,
        pts: s.得分, reb: s.篮板, ast: s.助攻, stl: s.抢断, blk: s.盖帽, tov: s.失误,
        fgm: s.投篮命中, fga: s.投篮出手,
        threePm: s.三分命中, threePa: s.三分出手,
        ftm: s.罚球命中, fta: s.罚球出手,
      };
    }
  }
  return result;
}

export function leaderboard(
  stats: LeaguePlayerSeasonStats,
  category: LeaderboardCategory,
  count = 5,
): { playerKey: string; teamId: string; gp: number; average: number }[] {
  return Object.entries(stats).filter(([, stat]) => stat.gp >= 1)
    .map(([playerKey, stat]) => ({ playerKey, teamId: stat.teamId, gp: stat.gp, average: stat[category] / stat.gp }))
    .sort((a, b) => b.average - a.average || b.gp - a.gp || a.playerKey.localeCompare(b.playerKey))
    .slice(0, count);
}

function teamWinPct(league: LeagueState, teamId: string): number {
  const standing = league.战绩[teamId];
  const games = standing ? standing.胜 + standing.负 : 0;
  return games ? standing.胜 / games : .5;
}

function pickPositionalTeam(
  ranked: { playerKey: string; pos: PlayerData['pos']; score: number }[],
  used: Set<string>,
): string[] {
  const output: string[] = [];
  const take = (valid: (pos: PlayerData['pos']) => boolean, count: number) => {
    for (const candidate of ranked) {
      if (output.filter(key => {
        const found = ranked.find(item => item.playerKey === key);
        return found && valid(found.pos);
      }).length >= count) break;
      if (used.has(candidate.playerKey) || !valid(candidate.pos)) continue;
      output.push(candidate.playerKey);
      used.add(candidate.playerKey);
    }
  };
  take(pos => pos === 'PG' || pos === 'SG', 2);
  take(pos => pos === 'SF' || pos === 'PF', 2);
  take(pos => pos === 'C', 1);
  for (const player of ranked) {
    if (output.length >= 5) break;
    if (!used.has(player.playerKey)) { output.push(player.playerKey); used.add(player.playerKey); }
  }
  return output;
}

/** 年终全联盟竞争：资格、球队战绩、赛季累计与当季能力共同决定，绝无固定球星白名单。 */
export function decideSeasonAwards(
  league: LeagueState,
  rosters: Record<string, PlayerData[]>,
): SeasonAwards {
  const players = Object.values(rosters).flat();
  const eligible = players.flatMap(player => {
    const totals = league.球员赛季统计[player.name];
    if (!totals || totals.gp < 30) return [];
    const gpFactor = clamp(totals.gp / 65, .1, 1);
    const per = (key: LeaderboardCategory) => totals[key] / totals.gp;
    const pct = teamWinPct(league, totals.teamId);
    const a = player.attrs;
    const mvp = (per('pts') * 1.5 + per('reb') * .65 + per('ast') * 1.2 + pct * 27) * gpFactor;
    const defense = (per('stl') * 5 + per('blk') * 5 + per('reb') * .75
      + mean(a.onBallDefenseIQ, a.shotContest, a.defensiveConsistency) * .15 + pct * 11) * gpFactor;
    const entry = league.生成球员[player.name]?.entrySeason;
    const rookie = entry === league.赛季序号
      || (league.赛季序号 === 0 && estimateInitialAge(player) <= 20);
    return [{ playerKey: player.name, pos: player.pos, mvp, defense,
      rookie, rookieScore: (per('pts') * 1.4 + per('reb') * .8 + per('ast') + pct * 8) * gpFactor }];
  });
  const by = (key: 'mvp' | 'defense') => [...eligible]
    .sort((a, b) => b[key] - a[key] || a.playerKey.localeCompare(b.playerKey))
    .map(item => ({ playerKey: item.playerKey, pos: item.pos, score: item[key] }));
  const offensive = by('mvp');
  const defensive = by('defense');
  const first = (rows: { playerKey: string }[]) => rows[0]?.playerKey ?? null;
  const rookies = [...eligible].filter(item => item.rookie)
    .sort((a, b) => b.rookieScore - a.rookieScore || a.playerKey.localeCompare(b.playerKey));
  const allNBAUsed = new Set<string>();
  const defenseUsed = new Set<string>();
  return {
    season: league.赛季,
    mvp: first(offensive),
    rookie: first(rookies),
    dpoy: first(defensive),
    allNBA: [0, 1, 2].map(() => pickPositionalTeam(offensive, allNBAUsed)),
    allDefense: [0, 1].map(() => pickPositionalTeam(defensive, defenseUsed)),
  };
}
