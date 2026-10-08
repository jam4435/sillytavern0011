import { TEAMS } from '../data/teams';
import { getLeagueCalendar, seasonOpeningDate, seasonFinaleDate, getTeamRestDays } from './calendar';
import type { MatchState } from './types';
import {
  advanceCoachTenure,
  createInitialCoachProfiles,
  replacementCoach,
  type CoachProfile,
} from './coachProfile';
import { seasonLabelFromOffset } from './lifecycle';
import type { LeagueContract, MarketOffer, TransactionRecord } from './transactionTypes';
import type { DraftPickRecord, GeneratedPlayerSeed } from './draft';
import { simulateLowFidelityGame, buildLeagueSimulationProfiles, type LeagueSimulationProfiles } from './teamPower';
import { applyGameInjuries, advanceInjuryRecovery, type InjuryGameExposure } from './injury';
import { addSeasonLines, decideSeasonAwards, matchSeasonLines, simulateTeamSeasonLines,
  type LeaguePlayerSeasonStats, type SeasonAwards } from './leagueStats';
import type { PlayerData } from './types';

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
  type: '赛历' | '交易' | '合同' | '代言' | '伤病' | '球队关系' | '奖项' | '选秀';
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
  /** 程序化新秀种子；43项能力由 draft.ts 确定性重建。 */
  生成球员: Record<string, GeneratedPlayerSeed>;
  /** 最近最多10届（600签）的选秀历史。 */
  选秀历史: DraftPickRecord[];
  /** 当前赛季逐球员累计数据；不保存后台逐场Box Score。 */
  球员赛季统计: LeaguePlayerSeasonStats;
  /** 历年只存紧凑正式奖项结果。 */
  奖项记录: SeasonAwards[];
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
const regularStartDate = seasonOpeningDate;
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

/** 返回指定球队真实赛程的第index场日期；不再用均匀插值代表所有球队。 */
export function scheduleDate(index: number, seasonOffset = 0, teamId = 'GSW'): string {
  return getScheduledGame(teamId, index, seasonOffset)?.date ?? seasonOpeningDate(seasonOffset);
}

/** 全联盟唯一赛历，玩家和后台共享同一份主客场及日期。 */
export function getScheduledGame(teamId: string, index: number, seasonOffset = 0): ScheduledGame | null {
  if (index < 0 || index >= REGULAR_SEASON_GAMES) return null;
  const game = getLeagueCalendar(seasonOffset).byTeam[teamId]?.[index];
  if (!game) return null;
  return {
    index, date: game.date, home: game.home, away: game.away,
    opponent: game.home === teamId ? game.away : game.home,
    isHome: game.home === teamId, stage: '常规赛',
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
    生成球员: {},
    选秀历史: [],
    球员赛季统计: {},
    奖项记录: [],
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

/**
 * 后台按正式日历结算，而非让剩余28队在玩家每打一场后都各打一场。
 * 当前比赛结束→模拟截至下一场开赛前的全部其他比赛，天然反映不同球队日程密度。
 * 第1场特殊包含开幕日至主角首场之前的背景比赛；末场结算剩余背景日程。
 */
function simulateOtherLeagueGames(
  league: LeagueState,
  playerTeamId: string,
  playerIndex: number,
  playerDate: string,
  nextPlayerDate: string | null,
  rng: () => number,
  profiles?: LeagueSimulationProfiles | null,
  rosters?: Record<string, PlayerData[]>,
  protagonist?: { key: string; age: number },
): LeagueState {
  const calendar = getLeagueCalendar(league.赛季序号);
  const startDate = playerIndex === 0 ? seasonOpeningDate(league.赛季序号) : playerDate;
  const horizon = nextPlayerDate ?? seasonFinaleDate(league.赛季序号);
  const games = calendar.games.filter(game =>
    game.date >= startDate &&
    (nextPlayerDate ? game.date < horizon : game.date <= horizon) &&
    game.home !== playerTeamId && game.away !== playerTeamId);
  let current = league;
  let activeProfiles = profiles ?? null;
  for (const game of games) {
    if (current.日期 !== game.date) {
      const old = current.伤病;
      current = advanceInjuryRecovery({ ...current, 日期: game.date });
      if (rosters && activeProfiles && JSON.stringify(old) !== JSON.stringify(current.伤病))
        activeProfiles = buildLeagueSimulationProfiles(current, rosters);
    }
    const [homeScore, awayScore] = simulateLowFidelityGame(game.home, game.away, activeProfiles, rng);
    const standings = recordResult(current.战绩, game.home, game.away, homeScore, awayScore);
    current = { ...current, 战绩: standings };
    if (!rosters || !activeProfiles?.[game.home] || !activeProfiles?.[game.away]) continue;
    const homeLines = simulateTeamSeasonLines(
      game.home, rosters[game.home] ?? [], current, activeProfiles[game.home], homeScore, rng);
    const awayLines = simulateTeamSeasonLines(
      game.away, rosters[game.away] ?? [], current, activeProfiles[game.away], awayScore, rng);
    current = { ...current, 球员赛季统计: addSeasonLines(current.球员赛季统计,
      { ...homeLines, ...awayLines }) };
    const oldInjuries = current.伤病;
    current = applyGameInjuries(current, rosters, [{
      gameId: game.id, date: game.date,
      lines: { ...homeLines, ...awayLines },
      restDaysByTeam: {
        [game.home]: getTeamRestDays(game.home, game.date, league.赛季序号),
        [game.away]: getTeamRestDays(game.away, game.date, league.赛季序号),
      },
    }], protagonist);
    if (current.伤病 !== oldInjuries)
      activeProfiles = buildLeagueSimulationProfiles(current, rosters);
  }
  return advanceInjuryRecovery({ ...current, 日期: nextPlayerDate ?? horizon });
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

function simulateSeriesGame(
  series: PlayoffSeries,
  rng: () => number,
  profiles?: LeagueSimulationProfiles | null,
  onGame?: (home: string, away: string, homeScore: number, awayScore: number, gameId: string) => void,
): PlayoffSeries {
  if (seriesWinner(series)) return series;
  const gameNo = Math.min(6, series.winsA + series.winsB);
  const homeA = PLAYOFF_HOME_PATTERN[gameNo] === 'A';
  const home = homeA ? series.teamA : series.teamB;
  const away = homeA ? series.teamB : series.teamA;
  const [homeScore, awayScore] = simulateLowFidelityGame(home, away, profiles, rng, true);
  onGame?.(home, away, homeScore, awayScore, `${series.id}-g${gameNo + 1}`);
  const winner = homeScore > awayScore ? home : away;
  return {
    ...series,
    winsA: series.winsA + (winner === series.teamA ? 1 : 0),
    winsB: series.winsB + (winner === series.teamB ? 1 : 0),
  };
}

function simulateOtherPlayoffSeries(
  state: PlayoffState,
  playerTeamId: string,
  rng: () => number,
  profiles?: LeagueSimulationProfiles | null,
  onGame?: (home: string, away: string, homeScore: number, awayScore: number, gameId: string) => void,
): PlayoffState {
  return {
    ...state,
    series: state.series.map(series =>
      seriesContains(series, playerTeamId) ? series : simulateSeriesGame(series, rng, profiles, onGame),
    ),
  };
}

function completeOtherSeries(
  state: PlayoffState,
  playerTeamId: string,
  rng: () => number,
  profiles?: LeagueSimulationProfiles | null,
  onGame?: (home: string, away: string, homeScore: number, awayScore: number, gameId: string) => void,
): PlayoffState {
  let next = state;
  for (let guard = 0; guard < 7; guard++) {
    const incompleteOther = next.series.some(series => !seriesContains(series, playerTeamId) && !seriesWinner(series));
    if (!incompleteOther) break;
    next = simulateOtherPlayoffSeries(next, playerTeamId, rng, profiles, onGame);
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
    球员赛季统计: {},
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
  return { league: advanceInjuryRecovery(nextLeague), nextGame };
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
  profiles?: LeagueSimulationProfiles | null,
  rosters?: Record<string, PlayerData[]>,
  protagonist?: { key: string; age: number },
): AdvanceSeasonResult {
  // 每个玩家比赛轮次同时代表联盟推进一轮；所有现任教练增加1场磨合。
  league = { ...league, 教练: advanceCoachTenure(league.教练) };
  // 在本场真实Box Score已经结算后才判伤，供下一场轮换读取。
  const realGame = rosters && (league.阶段 === '常规赛' || league.阶段 === '季后赛')
    ? matchSeasonLines(match) : {};
  if (rosters && Object.keys(realGame).length) {
    const fatigue = Object.fromEntries(Object.entries(match.球员状态)
      .map(([key, status]) => [key, status.体力]));
    league = applyGameInjuries(league, rosters, [{
      gameId: `player-${league.赛季序号}-${league.赛程索引}-${match.对阵.主队}-${match.对阵.客队}`,
      date: league.日期, lines: realGame, remainingStamina: fatigue,
      restDaysByTeam: league.阶段 === '常规赛' ? {
        [match.对阵.主队]: getTeamRestDays(match.对阵.主队, league.日期, league.赛季序号),
        [match.对阵.客队]: getTeamRestDays(match.对阵.客队, league.日期, league.赛季序号),
      } : undefined,
    }], protagonist);
  }
  if (league.阶段 === '季后赛' && league.季后赛) {
    const otherExposures: InjuryGameExposure[] = [];
    const onOtherGame = (home: string, away: string, homeScore: number, awayScore: number, gameId: string) => {
      if (!rosters || !profiles?.[home] || !profiles?.[away]) return;
      otherExposures.push({
        gameId: `playoffs-${gameId}`, date: league.日期,
        lines: {
          ...simulateTeamSeasonLines(home, rosters[home] ?? [], league, profiles[home], homeScore, rng),
          ...simulateTeamSeasonLines(away, rosters[away] ?? [], league, profiles[away], awayScore, rng),
        },
      });
    };
    const finalizeOtherInjuries = () => rosters
      ? applyGameInjuries(league, rosters, otherExposures, protagonist) : league;
    let playoffs = recordPlayerPlayoffGame(league.季后赛, match, playerTeamId);
    playoffs = simulateOtherPlayoffSeries(playoffs, playerTeamId, rng, profiles, onOtherGame);
    const playerSeries = playoffs.series.find(series => seriesContains(series, playerTeamId));
    const playerWinner = playerSeries ? seriesWinner(playerSeries) : null;
    const nextIndex = league.赛程索引 + 1;
    const nextDate = addDays(league.日期, 2);

    if (playerSeries && playerWinner && playerWinner !== playerTeamId) {
      league = finalizeOtherInjuries();
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
      playoffs = completeOtherSeries(playoffs, playerTeamId, rng, profiles, onOtherGame);
      league = finalizeOtherInjuries();
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

    league = finalizeOtherInjuries();
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
  const standings = recordResult(league.战绩, home, away, match.比分.主, match.比分.客);
  const seasonStats = rosters
    ? addSeasonLines(league.球员赛季统计, realGame)
    : league.球员赛季统计;
  const nextIndex = league.赛程索引 + 1;
  const nextGame = getScheduledGame(playerTeamId, nextIndex, league.赛季序号);
  league = simulateOtherLeagueGames(
    { ...league, 战绩: standings, 球员赛季统计: seasonStats },
    playerTeamId, league.赛程索引, league.日期, nextGame?.date ?? null,
    rng, profiles, rosters, protagonist,
  );
  if (nextGame) {
    const nextDate = nextGame.date;
    return {
      league: {
        ...league,
        日期: nextDate,
        赛程索引: nextIndex,
        战绩: league.战绩,
        球员赛季统计: league.球员赛季统计,
        故事钩子: mergeHooks(league.故事钩子, calendarHooksForDate(nextDate)),
      },
      nextGame,
    };
  }

  const seededBase: LeagueState = league;
  // MVP/ROY/DPOY与最佳阵容只在常规赛结束后按全联盟真实累计一次性裁定。
  const awards = rosters ? decideSeasonAwards(seededBase, rosters) : null;
  const awardHistory = awards && awards.mvp
    ? [...league.奖项记录.filter(item => item.season !== league.赛季), awards].slice(-20)
    : league.奖项记录;
  const awardHook: StoryHook[] = awards?.mvp ? [{
    id: `league-awards-${league.赛季}`,
    type: '奖项',
    title: `${league.赛季} 赛季个人奖项揭晓`,
    detail: `MVP：${awards.mvp}；最佳新秀：${awards.rookie ?? '空缺'}；DPOY：${awards.dpoy ?? '空缺'}。所有结果由联盟赛季统计裁定，叙事模型不得改写。`,
    createdDate: league.日期,
  }] : [];
  const playoffs = createPlayoffState(seededBase);
  const qualified = playoffs.series.some(series => seriesContains(series, playerTeamId));
  const nextDate = playoffStartDate(league.赛季序号);
  const hooks = mergeHooks(league.故事钩子, [
    playoffHook(`playoffs-${playoffYearTag(league)}`, '季后赛', qualified ? '常规赛结束，球队获得季后赛席位，首轮对阵已生成。' : '常规赛结束，球队未进入季后赛，进入赛季总结与休赛期。', nextDate),
    ...awardHook,
  ]);
  const nextLeague: LeagueState = {
    ...league,
    日期: nextDate,
    阶段: qualified ? '季后赛' : '休赛期',
    赛程索引: nextIndex,
    战绩: league.战绩,
    球员赛季统计: league.球员赛季统计,
    奖项记录: awardHistory,
    故事钩子: hooks,
    季后赛: playoffs,
  };
  return {
    league: nextLeague,
    nextGame: qualified ? getNextPlayoffGame(nextLeague, playerTeamId) : null,
  };
}
