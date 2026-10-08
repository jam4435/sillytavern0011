import { TEAMS } from '../data/teams';

/**
 * 全联盟唯一可重算赛程。正常运行只按年份存一个缓存（不存 stat_data）；
 * 30 队共同读取相同的 1230 场正式比赛，而不是各自拼凑82场。
 */
export interface LeagueCalendarGame {
  id: string;
  date: string;
  home: string;
  away: string;
}
export interface LeagueCalendar {
  games: LeagueCalendarGame[];
  byTeam: Record<string, LeagueCalendarGame[]>;
}

const cache = new Map<number, LeagueCalendar>();
function dateToTime(date: string): number {
  return Date.parse(`${date}T12:00:00Z`);
}
function addDays(date: string, days: number): string {
  return new Date(dateToTime(date) + days * 86_400_000).toISOString().slice(0, 10);
}
export function seasonOpeningDate(seasonOffset: number): string {
  return `${2015 + seasonOffset}-10-27`;
}
export function seasonFinaleDate(seasonOffset: number): string {
  return `${2016 + seasonOffset}-04-13`;
}
function getSeasonSpan(offset: number): number {
  return Math.round((dateToTime(seasonFinaleDate(offset)) - dateToTime(seasonOpeningDate(offset))) / 86_400_000);
}
function hash(seed: string): number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}
function rngFrom(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const output = [...arr];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

interface PairGame { home: string; away: string }
/** 圆圈法完整30队循环赛，共29轮，每人一轮且每对只遇到一次。 */
function roundRobin(teams: string[]): PairGame[][] {
  const result: PairGame[][] = [];
  let circle = [...teams];
  for (let round = 0; round < teams.length - 1; round++) {
    const games: PairGame[] = [];
    for (let i = 0; i < teams.length / 2; i++) {
      const a = circle[i], b = circle[circle.length - 1 - i];
      games.push((round + i) % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    result.push(games);
    circle = [circle[0], circle[circle.length - 1], ...circle.slice(1, -1)];
  }
  return result;
}

/**
 * 常规赛82场标准结构：
 * - 另一个分区15队各2场（1主1客）：30
 * - 本分区同组4队各4场（2主2客）：16
 * - 本分区其他10队，其中6队各4场、4队各3场：36
 * 3场对手每队恰有2组2主1客、2组1主2客 => 总计41主41客。
 */
function additionalConferenceGames(): PairGame[] {
  const output: PairGame[] = [];
  const divisions = new Map<string, string[]>();
  for (const team of TEAMS) {
    const key = `${team.conference}:${team.division}`;
    const list = divisions.get(key) ?? [];
    list.push(team.id);
    divisions.set(key, list);
  }
  for (const members of divisions.values()) members.sort();
  for (const members of divisions.values()) {
    if (members.length !== 5) throw new Error('NBA分组赛程需要每分组5队');
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      output.push({ home: members[i], away: members[j] }, { home: members[j], away: members[i] });
    }
  }
  for (const conference of ['East', 'West']) {
    const keys = [...divisions.keys()].filter(key => key.startsWith(`${conference}:`)).sort();
    if (keys.length !== 3) throw new Error('每分区必须有3个NBA分组');
    for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
      const teamA = divisions.get(keys[a])!, teamB = divisions.get(keys[b])!;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const x = teamA[i], y = teamB[j];
        // 2×5对手进入3场列表：每组两个，且3场中的额外主场双方恰好平衡。
        const threeGames = j === i || j === (i + 1) % 5;
        if (!threeGames) output.push({ home: x, away: y }, { home: y, away: x });
        else output.push(j === i ? { home: x, away: y } : { home: y, away: x });
      }
    }
  }
  return output;
}

/** 对额外360场比赛做确定性逐轮最大匹配；每轮每队至多一场。 */
function extraRounds(games: PairGame[], rand: () => number): PairGame[][] {
  let remaining = shuffle(games, rand);
  const rounds: PairGame[][] = [];
  while (remaining.length) {
    const degrees = new Map<string, number>();
    for (const { home, away } of remaining) {
      degrees.set(home, (degrees.get(home) ?? 0) + 1);
      degrees.set(away, (degrees.get(away) ?? 0) + 1);
    }
    const prioritized = remaining.map((game, index) => ({
      game, index,
      weight: (degrees.get(game.home) ?? 0) + (degrees.get(game.away) ?? 0),
    })).sort((a, b) => b.weight - a.weight || a.index - b.index);
    const active = new Set<string>();
    const selected = new Set<number>();
    const round: PairGame[] = [];
    for (const { game, index } of prioritized) {
      if (active.has(game.home) || active.has(game.away)) continue;
      active.add(game.home);
      active.add(game.away);
      selected.add(index);
      round.push(game);
    }
    if (!round.length) throw new Error('无法分配分区额外比赛');
    rounds.push(shuffle(round, rand));
    remaining = remaining.filter((_, index) => !selected.has(index));
  }
  return rounds;
}

/**
 * 约90轮铺到169/170个日历日，然后按对阵双方负荷轻微错开，
 * 不能同日双赛、不能连续三天比赛；若末段有密集赛程则优先保证82场。
 */
function placeOnCalendar(rounds: PairGame[][], offset: number): LeagueCalendar {
  const opening = seasonOpeningDate(offset);
  const span = getSeasonSpan(offset);
  const rand = rngFrom(`nba2k-calendar-dates:${offset}`);
  const lastPlayed: Record<string, number[]> = Object.fromEntries(TEAMS.map(team => [team.id, []]));
  const result: LeagueCalendarGame[] = [];
  rounds.forEach((round, r) => {
    const base = Math.round(span * r / Math.max(1, rounds.length - 1));
    const latest = Math.min(span, base + (r === rounds.length - 1 ? 0 : 1));
    for (const game of shuffle(round, rand)) {
      const candidates: { day: number; score: number }[] = [];
      for (let day = Math.max(0, base - 2); day <= Math.min(span, base + 3); day++) {
        if (day > latest) continue;
        const h = lastPlayed[game.home], a = lastPlayed[game.away];
        if ((h.length && h[h.length - 1] >= day) || (a.length && a[a.length - 1] >= day)) continue;
        const penalty = (dates: number[]): number => {
          if (!dates.length) return 0;
          const gap = day - dates[dates.length - 1];
          if (gap === 1 && dates.length > 1 && dates[dates.length - 1] - dates[dates.length - 2] === 1) return 35;
          if (gap === 1) return 1.5;
          if (gap > 5) return (gap - 5) * .4;
          return 0;
        };
        candidates.push({ day, score: Math.abs(day - base) * 1.3 + penalty(h) + penalty(a) + rand() * .9 });
      }
      if (!candidates.length) {
        for (let day = Math.max(0, base - 4); day <= span; day++) {
          const h = lastPlayed[game.home], a = lastPlayed[game.away];
          if ((!h.length || h[h.length - 1] < day) && (!a.length || a[a.length - 1] < day)) {
            candidates.push({ day, score: 100 + Math.abs(day - base) });
            break;
          }
        }
      }
      if (!candidates.length) throw new Error(`赛季${offset}日期已耗尽，无法安排${game.home}-${game.away}`);
      const day = candidates.sort((a, b) => a.score - b.score)[0].day;
      lastPlayed[game.home].push(day);
      lastPlayed[game.away].push(day);
      result.push({
        id: `${offset}-${result.length + 1}`,
        date: addDays(opening, day), home: game.home, away: game.away,
      });
    }
  });
  const ordered = result.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const byTeam = Object.fromEntries(TEAMS.map(team => [team.id, [] as LeagueCalendarGame[]])) as Record<string, LeagueCalendarGame[]>;
  for (const game of ordered) {
    byTeam[game.home].push(game);
    byTeam[game.away].push(game);
  }
  return { games: ordered, byTeam };
}

function createLeagueCalendar(offset: number): LeagueCalendar {
  const rand = rngFrom(`nba2k-season-pairings:${offset}`);
  const teams = shuffle(TEAMS.map(team => team.id).sort(), rand);
  const firstLeg = roundRobin(teams);
  const reverseLeg = firstLeg.map(round => round.map(({ home, away }) => ({ home: away, away: home })));
  const extras = extraRounds(additionalConferenceGames(), rand);
  // 分散跨分区与同分区重复对阵，不将所有追加对阵堆在赛季末尾。
  const rounds: PairGame[][] = [];
  for (let i = 0; i < Math.max(firstLeg.length * 2, extras.length * 3); i++) {
    if (i < firstLeg.length * 2) rounds.push(i < firstLeg.length ? firstLeg[i] : reverseLeg[i - firstLeg.length]);
    if (i % 3 === 1 && extras.length) rounds.push(extras.shift()!);
  }
  rounds.push(...extras);
  return placeOnCalendar(rounds, offset);
}

/** O(1)重用赛历，不写入stat_data；年份变化会重建对阵和日期。 */
export function getLeagueCalendar(seasonOffset = 0): LeagueCalendar {
  const current = cache.get(seasonOffset);
  if (current) return current;
  const result = createLeagueCalendar(seasonOffset);
  // 避免玩几十赛季时把几十份1230场赛程常驻内存。
  if (cache.size > 2) cache.clear();
  cache.set(seasonOffset, result);
  return result;
}

/** 从一个球员已打的上一场比赛与本场日期，读取实际休息天数。 */
export function daysBetweenGames(previousDate: string | null, currentDate: string): number | null {
  if (!previousDate) return null;
  return Math.max(0, Math.round((dateToTime(currentDate) - dateToTime(previousDate)) / 86_400_000) - 1);
}

/** 本场与本队上一场之间完整休息的自然日；0代表背靠背。 */
export function getTeamRestDays(teamId: string, gameDate: string, seasonOffset = 0): number | null {
  const fixtures = getLeagueCalendar(seasonOffset).byTeam[teamId] ?? [];
  const index = fixtures.findIndex(game => game.date === gameDate);
  return index > 0 ? daysBetweenGames(fixtures[index - 1].date, gameDate) : null;
}
