import { TEAMS } from '../data/teams';
import type { MatchState } from './types';
import {
  advanceCoachTenure,
  createInitialCoachProfiles,
  replacementCoach,
  type CoachProfile,
} from './coachProfile';
import { seasonLabelFromOffset } from './lifecycle';
import type { LeagueContract, MarketOffer, TransactionRecord } from './transactionTypes';

export type LeaguePhase = '常规赛' | '季后赛' | '休赛期';
export type PlayoffRound = '首轮' | '分区半决赛' | '分区决赛' | '总决赛';
export type PlayoffConference = 'East' | 'West' | 'Finals';

export interface StandingRecord {
  胜: number;
  负: number;
  得分: number;
  失分: number;
  连胜: number;
}

export interface InjuryRecord {
  球员: string;
  类型: string;
  严重度: '轻微' | '中等' | '严重';
  受伤日期: string;
  预计复出: string;
  状态: '休战' | '恢复中' | '可复出';
  分钟限制?: number | null;
}

export interface StoryHook {
  id: string;
  type: '赛历' | '交易' | '合同' | '代言' | '伤病' | '球队关系' | '奖项';
  title: string;
  detail: string;
  createdDate: string;
  consumed?: boolean;
}

export interface PlayoffSeries {
  id: string;
  round: PlayoffRound;
  conference: PlayoffConference;
  teamA: string;
  teamB: string;
  seedA: number;
  seedB: number;
  winsA: number;
  winsB: number;
}

export interface PlayoffState {
  round: PlayoffRound;
  series: PlayoffSeries[];
  champion: string | null;
}

export interface LeagueState {
  赛季: string;
  赛季序号: number;
  日期: string;
  阶段: LeaguePhase;
  赛程索引: number;
  战绩: Record<string, StandingRecord>;
  教练: Record<string, CoachProfile>;
  /** 缺省时沿用球员初始球队；null 表示自由球员。仅记录发生过变动的球员。 */
  球员归属: Record<string, string | null>;
  /** 缺省时使用 deterministic 初始合同；续约/签约后写覆盖。 */
  合同册: Record<string, LeagueContract>;
  /** 只持久化当前玩家可交互的报价，防止叙事回合后重掷。 */
  市场报价: MarketOffer[];
  /** 联盟正式交易/签约流水。 */
  交易记录: TransactionRecord[];
  伤病: InjuryRecord[];
  故事钩子: StoryHook[];
  季后赛: PlayoffState | null;
}

export interface ScheduledGame {
  index: number;
  date: string;
  home: string;
  away: string;
  opponent: string;
  isHome: boolean;
  stage?: '常规赛' | PlayoffRound;
}

const REGULAR_SEASON_GAMES = 82;
const INITIAL_START_YEAR = 2015;
const regularStartDate = (seasonOffset: number) => `${INITIAL_START_YEAR + seasonOffset}-10-27`;
const regularEndDate = (seasonOffset: number) => `${INITIAL_START_YEAR + seasonOffset + 1}-04-13`;
const playoffStartDate = (seasonOffset: number) => `${INITIAL_START_YEAR + seasonOffset + 1}-04-16`;
const PLAYOFF_HOME_PATTERN = ['A', 'A', 'B', 'B', 'A', 'B', 'A'] as const;

function dateToUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function addDays(iso: string, days: number): string {
  const date = dateToUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((dateToUtc(b).getTime() - dateToUtc(a).getTime()) / 86_400_000);
}

function teamSeed(teamId: string): number {
  return [...teamId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function scheduleDate(index: number, seasonOffset = 0): string {
  const bounded = Math.max(0, Math.min(REGULAR_SEASON_GAMES - 1, index));
  const start = regularStartDate(seasonOffset);
  const end = regularEndDate(seasonOffset);
  const span = daysBetween(start, end);
  return addDays(start, Math.round(span * bounded / (REGULAR_SEASON_GAMES - 1)));
}

/**
 * 固定、可重算的简化 82 场赛历。
 * 不把整份赛程塞进 stat_data；同一球队 + 同一索引永远得到同一场比赛。
 * 后续若导入真实 2015-16 赛程，只需替换本函数，不影响存档结构。
 */
export function getScheduledGame(teamId: string, index: number, seasonOffset = 0): ScheduledGame | null {
  if (index < 0 || index >= REGULAR_SEASON_GAMES) return null;
  const opponents = TEAMS.filter(team => team.id !== teamId).sort((a, b) => a.id.localeCompare(b.id));
  if (!opponents.length) return null;
  const seed = teamSeed(teamId);
  const opponent = opponents[(index * 7 + seed) % opponents.length];
  const isHome = (index + seed) % 2 === 0;
  return {
    index,
    date: scheduleDate(index, seasonOffset),
    home: isHome ? teamId : opponent.id,
    away: isHome ? opponent.id : teamId,
    opponent: opponent.id,
    isHome,
    stage: '常规赛',
  };
}

export function formatScheduledOpponent(game: ScheduledGame | null): string {
  if (!game) return '赛季阶段已结束';
  return `${game.isHome ? 'vs' : '@'} ${game.opponent}`;
}

function emptyStanding(): StandingRecord {
  return { 胜: 0, 负: 0, 得分: 0, 失分: 0, 连胜: 0 };
}

export function createLeagueState(playerTeamId: string): LeagueState {
  const first = getScheduledGame(playerTeamId, 0, 0);
  return {
    赛季: seasonLabelFromOffset(0),
    赛季序号: 0,
    日期: first?.date ?? regularStartDate(0),
    阶段: '常规赛',
    赛程索引: 0,
    战绩: Object.fromEntries(TEAMS.map(team => [team.id, emptyStanding()])),
    教练: createInitialCoachProfiles(TEAMS.map(team => team.id)),
    球员归属: {},
    合同册: {},
    市场报价: [],
    交易记录: [],
    伤病: [],
    故事钩子: [{
      id: 'opening-night-2015',
      type: '赛历',
      title: '揭幕周',
      detail: '2015-16 赛季开幕，媒体开始建立新赛季叙事。',
      createdDate: regularStartDate(0),
    }],
    季后赛: null,
  };
}

function recordResult(
  standings: Record<string, StandingRecord>,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
): Record<string, StandingRecord> {
  const next = structuredClone(standings);
  const homeRow = next[home] ?? emptyStanding();
  const awayRow = next[away] ?? emptyStanding();
  const homeWon = homeScore > awayScore;
  next[home] = {
    胜: homeRow.胜 + (homeWon ? 1 : 0),
    负: homeRow.负 + (homeWon ? 0 : 1),
    得分: homeRow.得分 + homeScore,
    失分: homeRow.失分 + awayScore,
    连胜: homeWon ? Math.max(1, homeRow.连胜 + 1) : Math.min(-1, homeRow.连胜 - 1),
  };
  next[away] = {
    胜: awayRow.胜 + (homeWon ? 0 : 1),
    负: awayRow.负 + (homeWon ? 1 : 0),
    得分: awayRow.得分 + awayScore,
    失分: awayRow.失分 + homeScore,
    连胜: homeWon ? Math.min(-1, awayRow.连胜 - 1) : Math.max(1, awayRow.连胜 + 1),
  };
  return next;
}

function simulateScore(homeId: string, awayId: string, rng: () => number): [number, number] {
  const home = TEAMS.find(team => team.id === homeId);
  const away = TEAMS.find(team => team.id === awayId);
  const homeStrength = home?.overall ?? 80;
  const awayStrength = away?.overall ?? 80;
  const paceNoise = () => Math.round((rng() - .5) * 18);
  let homeScore = 99 + Math.round((homeStrength - 80) * .7) + 3 + paceNoise();
  let awayScore = 99 + Math.round((awayStrength - 80) * .7) + paceNoise();
  if (homeScore === awayScore) homeScore += rng() < .55 ? 1 : -1;
  return [Math.max(72, homeScore), Math.max(72, awayScore)];
}

function simulateOtherLeagueGames(
  standings: Record<string, StandingRecord>,
  roundIndex: number,
  excluded: Set<string>,
  rng: () => number,
): Record<string, StandingRecord> {
  const teams = TEAMS.filter(team => !excluded.has(team.id)).map(team => team.id).sort();
  if (teams.length < 2) return standings;
  const rotation = roundIndex % teams.length;
  const rotated = [...teams.slice(rotation), ...teams.slice(0, rotation)];
  let next = standings;
  for (let i = 0; i + 1 < rotated.length; i += 2) {
    const home = rotated[i];
    const away = rotated[i + 1];
    const [homeScore, awayScore] = simulateScore(home, away, rng);
    next = recordResult(next, home, away, homeScore, awayScore);
  }
  return next;
}

export function calendarHooksForDate(date: string): StoryHook[] {
  const hooks: StoryHook[] = [];
  const year = date.slice(0, 4);
  const monthDay = date.slice(5);
  const add = (suffix: string, title: string, detail: string) =>
    hooks.push({ id: `${suffix}-${year}`, type: '赛历', title, detail, createdDate: date });
  if (monthDay >= '12-23' && monthDay <= '12-26') add('christmas', '圣诞大战周', '联盟进入圣诞焦点赛期，强队与球星的全国曝光显著提高。');
  if (monthDay >= '02-12' && monthDay <= '02-14') add('allstar', '全明星周末', '根据表现、人气与新秀身份检查各项全明星资格。');
  if (monthDay >= '02-15' && monthDay <= '02-18') add('trade-deadline', '交易截止日前夕', '交易窗口进入最后阶段，球队需求与合同价值会生成交易流言。');
  if (monthDay >= '04-11' && monthDay <= '04-13') add('regular-finale', '常规赛收官', '排名、季后赛席位与赛季奖项竞争成为联盟焦点。');
  return hooks;
}

function mergeHooks(existing: StoryHook[], incoming: StoryHook[]): StoryHook[] {
  const seen = new Set(existing.map(hook => hook.id));
  return [...existing, ...incoming.filter(hook => !seen.has(hook.id))];
}

export function conferenceStandings(league: LeagueState, conference: 'East' | 'West') {
  return TEAMS
    .filter(team => team.conference === conference)
    .map(team => ({ team, record: league.战绩[team.id] ?? emptyStanding() }))
    .sort((a, b) => {
      const aGames = a.record.胜 + a.record.负;
      const bGames = b.record.胜 + b.record.负;
      const aPct = aGames ? a.record.胜 / aGames : 0;
      const bPct = bGames ? b.record.胜 / bGames : 0;
      return bPct - aPct || b.record.胜 - a.record.胜 || (b.record.得分 - b.record.失分) - (a.record.得分 - a.record.失分);
    });
}

function playoffYearTag(league: LeagueState): string {
  return String(INITIAL_START_YEAR + league.赛季序号 + 1);
}

function firstRoundPairs(league: LeagueState, conference: 'East' | 'West'): PlayoffSeries[] {
  const seeds = conferenceStandings(league, conference).slice(0, 8);
  const pairings = [[0, 7], [3, 4], [1, 6], [2, 5]] as const;
  const tag = playoffYearTag(league);
  return pairings.map(([a, b], index) => ({
    id: `${tag}-${conference}-R1-${index + 1}`,
    round: '首轮' as const,
    conference,
    teamA: seeds[a].team.id,
    teamB: seeds[b].team.id,
    seedA: a + 1,
    seedB: b + 1,
    winsA: 0,
    winsB: 0,
  }));
}

export function createPlayoffState(league: LeagueState): PlayoffState {
  return {
    round: '首轮',
    series: [...firstRoundPairs(league, 'East'), ...firstRoundPairs(league, 'West')],
    champion: null,
  };
}

function seriesWinner(series: PlayoffSeries): string | null {
  return series.winsA >= 4 ? series.teamA : series.winsB >= 4 ? series.teamB : null;
}

function seriesContains(series: PlayoffSeries, teamId: string): boolean {
  return series.teamA === teamId || series.teamB === teamId;
}

function playoffGameForSeries(series: PlayoffSeries, playerTeamId: string, index: number, date: string): ScheduledGame {
  const gameNo = Math.min(6, series.winsA + series.winsB);
  const homeA = PLAYOFF_HOME_PATTERN[gameNo] === 'A';
  const home = homeA ? series.teamA : series.teamB;
  const away = homeA ? series.teamB : series.teamA;
  return {
    index,
    date,
    home,
    away,
    opponent: series.teamA === playerTeamId ? series.teamB : series.teamA,
    isHome: home === playerTeamId,
    stage: series.round,
  };
}

export function getNextPlayoffGame(league: LeagueState, playerTeamId: string): ScheduledGame | null {
  const state = league.季后赛;
  if (!state || state.champion) return null;
  const series = state.series.find(item => seriesContains(item, playerTeamId) && !seriesWinner(item));
  return series ? playoffGameForSeries(series, playerTeamId, league.赛程索引, league.日期) : null;
}

function simulateSeriesGame(series: PlayoffSeries, rng: () => number): PlayoffSeries {
  if (seriesWinner(series)) return series;
  const gameNo = Math.min(6, series.winsA + series.winsB);
  const homeA = PLAYOFF_HOME_PATTERN[gameNo] === 'A';
  const home = homeA ? series.teamA : series.teamB;
  const away = homeA ? series.teamB : series.teamA;
  const [homeScore, awayScore] = simulateScore(home, away, rng);
  const winner = homeScore > awayScore ? home : away;
  return {
    ...series,
    winsA: series.winsA + (winner === series.teamA ? 1 : 0),
    winsB: series.winsB + (winner === series.teamB ? 1 : 0),
  };
}

function simulateOtherPlayoffSeries(state: PlayoffState, playerTeamId: string, rng: () => number): PlayoffState {
  return {
    ...state,
    series: state.series.map(series => seriesContains(series, playerTeamId) ? series : simulateSeriesGame(series, rng)),
  };
}

function completeOtherSeries(state: PlayoffState, playerTeamId: string, rng: () => number): PlayoffState {
  let next = state;
  for (let guard = 0; guard < 7; guard++) {
    const incompleteOther = next.series.some(series => !seriesContains(series, playerTeamId) && !seriesWinner(series));
    if (!incompleteOther) break;
    next = simulateOtherPlayoffSeries(next, playerTeamId, rng);
  }
  return next;
}

function winnerSeed(series: PlayoffSeries): { team: string; seed: number } {
  const winner = seriesWinner(series);
  if (!winner) throw new Error(`系列赛尚未结束：${series.id}`);
  return winner === series.teamA ? { team: winner, seed: series.seedA } : { team: winner, seed: series.seedB };
}

function nextRoundState(state: PlayoffState): PlayoffState {
  if (state.series.some(series => !seriesWinner(series))) return state;
  const tag = state.series[0]?.id.split('-')[0] ?? 'playoffs';

  const build = (
    round: PlayoffRound,
    conference: PlayoffConference,
    left: PlayoffSeries,
    right: PlayoffSeries,
    id: string,
  ): PlayoffSeries => {
    const a = winnerSeed(left);
    const b = winnerSeed(right);
    const higher = a.seed <= b.seed ? a : b;
    const lower = higher === a ? b : a;
    return {
      id,
      round,
      conference,
      teamA: higher.team,
      teamB: lower.team,
      seedA: higher.seed,
      seedB: lower.seed,
      winsA: 0,
      winsB: 0,
    };
  };

  if (state.round === '首轮') {
    const east = state.series.filter(series => series.conference === 'East');
    const west = state.series.filter(series => series.conference === 'West');
    return {
      round: '分区半决赛',
      series: [
        build('分区半决赛', 'East', east[0], east[1], `${tag}-East-R2-1`),
        build('分区半决赛', 'East', east[2], east[3], `${tag}-East-R2-2`),
        build('分区半决赛', 'West', west[0], west[1], `${tag}-West-R2-1`),
        build('分区半决赛', 'West', west[2], west[3], `${tag}-West-R2-2`),
      ],
      champion: null,
    };
  }

  if (state.round === '分区半决赛') {
    const east = state.series.filter(series => series.conference === 'East');
    const west = state.series.filter(series => series.conference === 'West');
    return {
      round: '分区决赛',
      series: [
        build('分区决赛', 'East', east[0], east[1], `${tag}-East-R3`),
        build('分区决赛', 'West', west[0], west[1], `${tag}-West-R3`),
      ],
      champion: null,
    };
  }

  if (state.round === '分区决赛') {
    const east = state.series.find(series => series.conference === 'East');
    const west = state.series.find(series => series.conference === 'West');
    if (!east || !west) throw new Error('分区决赛结构不完整');
    return {
      round: '总决赛',
      series: [build('总决赛', 'Finals', east, west, `${tag}-Finals`)],
      champion: null,
    };
  }

  const final = state.series[0];
  return { ...state, champion: final ? seriesWinner(final) : null };
}

function recordPlayerPlayoffGame(state: PlayoffState, match: MatchState, playerTeamId: string): PlayoffState {
  const winner = match.比分.主 > match.比分.客 ? match.对阵.主队 : match.对阵.客队;
  return {
    ...state,
    series: state.series.map(series => {
      if (!seriesContains(series, playerTeamId) || seriesWinner(series)) return series;
      return {
        ...series,
        winsA: series.winsA + (winner === series.teamA ? 1 : 0),
        winsB: series.winsB + (winner === series.teamB ? 1 : 0),
      };
    }),
  };
}

function playoffHook(id: string, title: string, detail: string, date: string): StoryHook {
  return { id, type: '赛历', title, detail, createdDate: date };
}

export interface AdvanceSeasonResult {
  league: LeagueState;
  nextGame: ScheduledGame | null;
}

/**
 * 休赛期进入下一赛季。这里只推进赛季壳与赛历；
 * 球员年龄/能力由 lifecycle 投影根据新的“赛季序号”自动变化。
 * 交易、自由市场、选秀会在后续系统中插入调用本函数之前。
 */
export function beginNextSeason(league: LeagueState, playerTeamId: string): AdvanceSeasonResult {
  if (league.阶段 !== '休赛期') return { league, nextGame: null };
  const nextOffset = league.赛季序号 + 1;
  const nextGame = getScheduledGame(playerTeamId, 0, nextOffset);
  const nextDate = nextGame?.date ?? regularStartDate(nextOffset);
  const nextLeague: LeagueState = {
    ...league,
    赛季: seasonLabelFromOffset(nextOffset),
    赛季序号: nextOffset,
    日期: nextDate,
    阶段: '常规赛',
    赛程索引: 0,
    战绩: Object.fromEntries(TEAMS.map(team => [team.id, emptyStanding()])),
    市场报价: [],
    故事钩子: mergeHooks(league.故事钩子, [{
      id: `season-open-${nextOffset}`,
      type: '赛历',
      title: '新赛季揭幕',
      detail: `${seasonLabelFromOffset(nextOffset)} 赛季开始。球员年龄、成长/衰退与退役状态已经按新赛季重新投影。`,
      createdDate: nextDate,
    }]),
    季后赛: null,
  };
  return { league: nextLeague, nextGame };
}

/**
 * 确定性换帅入口：只更换教练人格与磨合进度，不改 roster、不改球员能力。
 * AI只能演出管理层决定和更衣室反应，不能改判新教练的 Profile。
 */
export function replaceTeamCoach(league: LeagueState, teamId: string): LeagueState {
  const previous = league.教练[teamId] ?? null;
  const next = replacementCoach(teamId, previous);
  const hook: StoryHook = {
    id: `coach-change-${teamId}-${next.generation}-${league.日期}`,
    type: '球队关系',
    title: '球队更换主教练',
    detail:
      `${teamId} 更换主教练。新教练进入磨合期：进攻偏好${next.offensePreference ?? '随阵容'}、` +
      `防守偏好${next.defensePreference ?? '随阵容'}、节奏偏好${next.pacePreference}；` +
      '其理念只作为阵容适配上的有限偏置，将在约15场比赛内逐步完全落地。',
    createdDate: league.日期,
  };
  return {
    ...league,
    教练: { ...league.教练, [teamId]: next },
    故事钩子: mergeHooks(league.故事钩子, [hook]),
  };
}

/**
 * 玩家比赛结束后推进联盟。
 * 常规赛：记录真实比赛 + 低精度模拟其他球队 + 固定赛历。
 * 季后赛：玩家系列赛使用真实结果；其他系列赛低精度模拟；七场四胜纯代码晋级。
 */
export function advanceLeagueAfterGame(
  league: LeagueState,
  playerTeamId: string,
  match: MatchState,
  rng: () => number = Math.random,
): AdvanceSeasonResult {
  // 每个玩家比赛轮次同时代表联盟推进一轮；所有现任教练增加1场磨合。
  league = { ...league, 教练: advanceCoachTenure(league.教练) };
  if (league.阶段 === '季后赛' && league.季后赛) {
    let playoffs = recordPlayerPlayoffGame(league.季后赛, match, playerTeamId);
    playoffs = simulateOtherPlayoffSeries(playoffs, playerTeamId, rng);
    const playerSeries = playoffs.series.find(series => seriesContains(series, playerTeamId));
    const playerWinner = playerSeries ? seriesWinner(playerSeries) : null;
    const nextIndex = league.赛程索引 + 1;
    const nextDate = addDays(league.日期, 2);

    if (playerSeries && playerWinner && playerWinner !== playerTeamId) {
      const nextLeague: LeagueState = {
        ...league,
        日期: nextDate,
        阶段: '休赛期',
        赛程索引: nextIndex,
        季后赛: playoffs,
        故事钩子: mergeHooks(league.故事钩子, [
          playoffHook(`eliminated-${playoffs.round}`, '季后赛出局', `球队在${playoffs.round}被淘汰，进入赛季总结与休赛期。`, nextDate),
        ]),
      };
      return { league: nextLeague, nextGame: null };
    }

    if (playerSeries && playerWinner === playerTeamId) {
      playoffs = completeOtherSeries(playoffs, playerTeamId, rng);
      playoffs = nextRoundState(playoffs);

      if (playoffs.champion) {
        const nextLeague: LeagueState = {
          ...league,
          日期: nextDate,
          阶段: '休赛期',
          赛程索引: nextIndex,
          季后赛: playoffs,
          故事钩子: mergeHooks(league.故事钩子, [
            playoffHook(`champion-${playoffYearTag(league)}`, 'NBA总冠军', `${playoffs.champion} 赢得 ${league.赛季} NBA 总冠军。`, nextDate),
          ]),
        };
        return { league: nextLeague, nextGame: null };
      }

      const advancedLeague: LeagueState = {
        ...league,
        日期: nextDate,
        赛程索引: nextIndex,
        季后赛: playoffs,
        故事钩子: mergeHooks(league.故事钩子, [
          playoffHook(`advance-${playoffs.round}`, `晋级${playoffs.round}`, `球队进入${playoffs.round}，下一轮系列赛已经确定。`, nextDate),
        ]),
      };
      return { league: advancedLeague, nextGame: getNextPlayoffGame(advancedLeague, playerTeamId) };
    }

    const continuingLeague: LeagueState = {
      ...league,
      日期: nextDate,
      赛程索引: nextIndex,
      季后赛: playoffs,
    };
    return { league: continuingLeague, nextGame: getNextPlayoffGame(continuingLeague, playerTeamId) };
  }

  if (league.阶段 !== '常规赛') return { league, nextGame: null };

  const home = match.对阵.主队;
  const away = match.对阵.客队;
  let standings = recordResult(league.战绩, home, away, match.比分.主, match.比分.客);
  standings = simulateOtherLeagueGames(standings, league.赛程索引, new Set([home, away]), rng);

  const nextIndex = league.赛程索引 + 1;
  const nextGame = getScheduledGame(playerTeamId, nextIndex, league.赛季序号);
  if (nextGame) {
    const nextDate = nextGame.date;
    return {
      league: {
        ...league,
        日期: nextDate,
        赛程索引: nextIndex,
        战绩: standings,
        故事钩子: mergeHooks(league.故事钩子, calendarHooksForDate(nextDate)),
      },
      nextGame,
    };
  }

  const seededBase: LeagueState = { ...league, 战绩: standings };
  const playoffs = createPlayoffState(seededBase);
  const qualified = playoffs.series.some(series => seriesContains(series, playerTeamId));
  const nextDate = playoffStartDate(league.赛季序号);
  const hooks = mergeHooks(league.故事钩子, [
    playoffHook(`playoffs-${playoffYearTag(league)}`, '季后赛', qualified ? '常规赛结束，球队获得季后赛席位，首轮对阵已生成。' : '常规赛结束，球队未进入季后赛，进入赛季总结与休赛期。', nextDate),
  ]);
  const nextLeague: LeagueState = {
    ...league,
    日期: nextDate,
    阶段: qualified ? '季后赛' : '休赛期',
    赛程索引: nextIndex,
    战绩: standings,
    故事钩子: hooks,
    季后赛: playoffs,
  };
  return {
    league: nextLeague,
    nextGame: qualified ? getNextPlayoffGame(nextLeague, playerTeamId) : null,
  };
}
