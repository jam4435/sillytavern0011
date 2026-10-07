import { TEAMS } from '../data/teams';
import type { MatchState } from './types';

export type LeaguePhase = '常规赛' | '季后赛' | '休赛期';

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
}

export interface StoryHook {
  id: string;
  type: '赛历' | '交易' | '合同' | '代言' | '伤病' | '球队关系' | '奖项';
  title: string;
  detail: string;
  createdDate: string;
  consumed?: boolean;
}

export interface LeagueState {
  赛季: '2015-16';
  日期: string;
  阶段: LeaguePhase;
  赛程索引: number;
  战绩: Record<string, StandingRecord>;
  伤病: InjuryRecord[];
  故事钩子: StoryHook[];
}

export interface ScheduledGame {
  index: number;
  date: string;
  home: string;
  away: string;
  opponent: string;
  isHome: boolean;
}

const REGULAR_SEASON_GAMES = 82;
const START_DATE = '2015-10-27';
const END_DATE = '2016-04-13';

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

export function scheduleDate(index: number): string {
  const bounded = Math.max(0, Math.min(REGULAR_SEASON_GAMES - 1, index));
  const span = daysBetween(START_DATE, END_DATE);
  return addDays(START_DATE, Math.round(span * bounded / (REGULAR_SEASON_GAMES - 1)));
}

/**
 * 固定、可重算的简化 82 场赛历。
 * 不把整份赛程塞进 stat_data；同一球队 + 同一索引永远得到同一场比赛。
 * 后续若导入真实 2015-16 赛程，只需替换本函数，不影响存档结构。
 */
export function getScheduledGame(teamId: string, index: number): ScheduledGame | null {
  if (index < 0 || index >= REGULAR_SEASON_GAMES) return null;
  const opponents = TEAMS.filter(team => team.id !== teamId).sort((a, b) => a.id.localeCompare(b.id));
  if (!opponents.length) return null;
  const seed = teamSeed(teamId);
  const opponent = opponents[(index * 7 + seed) % opponents.length];
  const isHome = (index + seed) % 2 === 0;
  return {
    index,
    date: scheduleDate(index),
    home: isHome ? teamId : opponent.id,
    away: isHome ? opponent.id : teamId,
    opponent: opponent.id,
    isHome,
  };
}

export function formatScheduledOpponent(game: ScheduledGame | null): string {
  if (!game) return '常规赛已结束';
  return `${game.isHome ? 'vs' : '@'} ${game.opponent}`;
}

function emptyStanding(): StandingRecord {
  return { 胜: 0, 负: 0, 得分: 0, 失分: 0, 连胜: 0 };
}

export function createLeagueState(playerTeamId: string): LeagueState {
  const first = getScheduledGame(playerTeamId, 0);
  return {
    赛季: '2015-16',
    日期: first?.date ?? START_DATE,
    阶段: '常规赛',
    赛程索引: 0,
    战绩: Object.fromEntries(TEAMS.map(team => [team.id, emptyStanding()])),
    伤病: [],
    故事钩子: [
      {
        id: 'opening-night-2015',
        type: '赛历',
        title: '揭幕周',
        detail: '2015-16 赛季开幕，媒体开始建立新赛季叙事。',
        createdDate: START_DATE,
      },
    ],
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
  const add = (id: string, title: string, detail: string) => hooks.push({ id, type: '赛历', title, detail, createdDate: date });
  if (date >= '2015-12-23' && date <= '2015-12-26') add('christmas-2015', '圣诞大战周', '联盟进入圣诞焦点赛期，强队与球星的全国曝光显著提高。');
  if (date >= '2016-02-12' && date <= '2016-02-14') add('allstar-2016', '全明星周末', '根据表现、人气与新秀身份检查各项全明星资格。');
  if (date >= '2016-02-15' && date <= '2016-02-18') add('trade-deadline-2016', '交易截止日前夕', '交易窗口进入最后阶段，球队需求与合同价值会生成交易流言。');
  if (date >= '2016-04-11' && date <= '2016-04-13') add('regular-finale-2016', '常规赛收官', '排名、季后赛席位、科比谢幕与勇士历史战绩成为联盟焦点。');
  return hooks;
}

function mergeHooks(existing: StoryHook[], incoming: StoryHook[]): StoryHook[] {
  const seen = new Set(existing.map(hook => hook.id));
  return [...existing, ...incoming.filter(hook => !seen.has(hook.id))];
}

export interface AdvanceSeasonResult {
  league: LeagueState;
  nextGame: ScheduledGame | null;
}

/**
 * 玩家比赛结束后推进一轮联盟：
 * 1. 记录真实玩家比赛；
 * 2. 低精度模拟其他球队同轮比赛；
 * 3. 推进固定赛历；
 * 4. 只生成轻量 StoryHook，不创建“万能事件”。
 */
export function advanceLeagueAfterGame(
  league: LeagueState,
  playerTeamId: string,
  match: MatchState,
  rng: () => number = Math.random,
): AdvanceSeasonResult {
  const home = match.对阵.主队;
  const away = match.对阵.客队;
  let standings = recordResult(league.战绩, home, away, match.比分.主, match.比分.客);
  standings = simulateOtherLeagueGames(standings, league.赛程索引, new Set([home, away]), rng);

  const nextIndex = league.赛程索引 + 1;
  const nextGame = getScheduledGame(playerTeamId, nextIndex);
  const nextDate = nextGame?.date ?? END_DATE;
  const nextPhase: LeaguePhase = nextGame ? '常规赛' : '季后赛';
  const hooks = mergeHooks(
    league.故事钩子,
    calendarHooksForDate(nextDate).concat(
      nextGame
        ? []
        : [{ id: 'playoffs-2016', type: '赛历' as const, title: '季后赛', detail: '常规赛结束，按东西部战绩生成季后赛席位与系列赛。', createdDate: nextDate }],
    ),
  );

  return {
    league: {
      ...league,
      日期: nextDate,
      阶段: nextPhase,
      赛程索引: nextIndex,
      战绩: standings,
      故事钩子: hooks,
    },
    nextGame,
  };
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
