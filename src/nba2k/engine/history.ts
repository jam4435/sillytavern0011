import { emptyPlayerSeasonTotals, type LeaderboardCategory, type LeaguePlayerSeasonStats, type PlayerSeasonTotals } from './leagueStats';
import type { LeagueState, StoryHook } from './season';

/** All values are fictional saves, never historical NBA season data. */
export interface HistoricalPlayerTotals extends PlayerSeasonTotals {
  seasons: number;
  firstSeason: string;
  lastSeason: string;
}
export interface ChampionshipRecord {
  season: string;
  champion: string;
  runnerUp: string;
}
export interface SeasonRecord {
  season: string;
  playerKey: string;
  teamId: string;
  gp: number;
  /** Exact sum and games retained instead of storing rounded averages. */
  total: number;
}
export interface MilestoneRecord {
  id: string;
  season: string;
  playerKey: string;
  category: 'gp' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk';
  threshold: number;
}
export interface LeagueHistory {
  /** Prevents double-accumulation if postgame settlement is retried. */
  lastCountedSeason: string | null;
  career: Record<string, HistoricalPlayerTotals>;
  /** Single best qualifying season per category. */
  records: Partial<Record<LeaderboardCategory, SeasonRecord>>;
  /** Bounded event display; lifetime totals retain the complete data. */
  milestones: MilestoneRecord[];
  /** Small complete title list: at most 120 seasons. */
  championships: ChampionshipRecord[];
}

const CATEGORIES = ['pts', 'reb', 'ast', 'stl', 'blk'] as const;
const TOTAL_KEYS = ['gp', 'min', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga',
  'threePm', 'threePa', 'ftm', 'fta'] as const;
const THRESHOLDS: Record<MilestoneRecord['category'], number[]> = {
  gp: [100, 500, 1000, 1400],
  pts: [1000, 5000, 10000, 20000, 30000, 40000],
  reb: [1000, 5000, 10000, 15000],
  ast: [1000, 5000, 10000, 15000],
  stl: [500, 1000, 2000, 3000],
  blk: [500, 1000, 2000, 3000],
};

export const emptyLeagueHistory = (): LeagueHistory => ({
  lastCountedSeason: null, career: {}, records: {}, milestones: [], championships: [],
});

function bestSeasonWins(current: SeasonRecord | undefined, challenger: SeasonRecord): boolean {
  if (!current) return true;
  const score = challenger.total * current.gp - current.total * challenger.gp;
  return score > 0 || score === 0 && (
    challenger.gp > current.gp ||
    challenger.gp === current.gp && challenger.playerKey.localeCompare(current.playerKey) < 0
  );
}

/** Called once at the end of 82-game regular season; idempotent after same-season retries. */
export function sealRegularSeasonHistory(league: LeagueState): LeagueState {
  const history = league.历史档案 ?? emptyLeagueHistory();
  if (history.lastCountedSeason === league.赛季) return league;
  const career = { ...history.career };
  const records = { ...history.records };
  const milestones = [...history.milestones];
  const hooks: StoryHook[] = [];

  for (const [key, season] of Object.entries(league.球员赛季统计)) {
    if (season.gp <= 0) continue;
    const existing = career[key];
    const merged: HistoricalPlayerTotals = {
      ...(existing ?? emptyPlayerSeasonTotals(season.teamId)),
      seasons: (existing?.seasons ?? 0) + 1,
      firstSeason: existing?.firstSeason ?? league.赛季,
      lastSeason: league.赛季, teamId: season.teamId,
    };
    for (const column of TOTAL_KEYS) merged[column] = (existing?.[column] ?? 0) + season[column];
    career[key] = merged;

    if (season.gp >= 30) {
      for (const category of CATEGORIES) {
        const candidate: SeasonRecord = {
          season: league.赛季, playerKey: key, teamId: season.teamId,
          gp: season.gp, total: season[category],
        };
        if (bestSeasonWins(records[category], candidate)) records[category] = candidate;
      }
    }
    for (const category of Object.keys(THRESHOLDS) as MilestoneRecord['category'][]) {
      const before = existing?.[category] ?? 0;
      for (const threshold of THRESHOLDS[category]) {
        if (before >= threshold || merged[category] < threshold) continue;
        const id = `career-${key}-${category}-${threshold}`;
        milestones.push({ id, season: league.赛季, playerKey: key, category, threshold });
        if (hooks.length < 8) {
          hooks.push({
            id: `milestone-${id}`, type: '奖项',
            title: `${key} 达成生涯里程碑`,
            detail: `${key}在${league.赛季}赛季累计${category.toUpperCase()}突破${threshold}。依据已结算生涯统计，AI不得改写数据。`,
            createdDate: league.日期,
          });
        }
      }
    }
  }

  const nextHistory: LeagueHistory = {
    ...history,
    lastCountedSeason: league.赛季,
    career, records, milestones: milestones.slice(-240),
  };
  return {
    ...league, 历史档案: nextHistory,
    故事钩子: [...league.故事钩子, ...hooks.filter(h =>
      !league.故事钩子.some(previous => previous.id === h.id))],
  };
}

/** Derive championship from an actually completed finals series, not from current team power or narrative. */
export function sealChampionshipHistory(
  league: LeagueState,
  champion: string,
  runnerUp: string,
): LeagueState {
  const history = league.历史档案 ?? emptyLeagueHistory();
  if (history.championships.some(row => row.season === league.赛季)) return league;
  const championships = [...history.championships, {
    season: league.赛季, champion, runnerUp,
  }].slice(-120);
  const hook: StoryHook = {
    id: `history-title-${league.赛季}`, type: '奖项',
    title: `${league.赛季} NBA总冠军：${champion}`,
    detail: `总决赛${champion}战胜${runnerUp}。结果由系列赛逐场胜负决定，已载入联盟历史。`,
    createdDate: league.日期,
  };
  return {
    ...league,
    历史档案: { ...history, championships },
    故事钩子: league.故事钩子.some(h => h.id === hook.id)
      ? league.故事钩子 : [...league.故事钩子, hook],
  };
}

export function careerLeaders(
  history: LeagueHistory,
  category: 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'gp',
  count = 5,
): { playerKey: string; total: number; seasons: number }[] {
  return Object.entries(history.career).map(([playerKey, stats]) => ({
    playerKey, total: stats[category], seasons: stats.seasons,
  })).filter(row => row.total > 0)
    .sort((a, b) => b.total - a.total || a.playerKey.localeCompare(b.playerKey))
    .slice(0, count);
}

export function playerCareerAchievements(
  history: LeagueHistory,
  awards: LeagueState['奖项记录'],
  playerKey: string,
) {
  const mvp = awards.filter(row => row.mvp === playerKey).length;
  const dpoy = awards.filter(row => row.dpoy === playerKey).length;
  const rookie = awards.some(row => row.rookie === playerKey);
  const allNBA = awards.reduce((sum, row) => sum + row.allNBA.filter(team => team.includes(playerKey)).length, 0);
  const allDefense = awards.reduce((sum, row) => sum + row.allDefense.filter(team => team.includes(playerKey)).length, 0);
  // Avoid inferring individual title ownership from teamId of last season after trades.
  return { stats: history.career[playerKey] ?? null, mvp, dpoy, rookie, allNBA, allDefense };
}
