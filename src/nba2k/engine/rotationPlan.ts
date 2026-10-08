import { buildDynamicDepthChart, deriveDynamicMinuteWeights } from './depthChart';
import { getPlayerAvailability } from './availability';
import {
  normalizeRotationTargets,
  type RotationPlayerResolver,
} from './rotation';
import type { LeaguePhase, LeagueState } from './season';
import type { MatchState, RotationState, Side, TeamRotationState } from './types';

export type CareerRotationRole = '边缘轮换' | '轮换' | '第六人' | '首发' | '核心';

export interface RotationPlanOptions {
  league?: LeagueState | null;
  phase?: LeaguePhase;
  protagonist?: {
    teamId: string;
    key: string;
    role: CareerRotationRole;
  };
  overrides?: Partial<Record<Side, Record<string, number>>>;
}

export function minutesForCareerRole(role: CareerRotationRole): number {
  if (role === '核心') return 36;
  if (role === '首发') return 32;
  if (role === '第六人') return 28;
  if (role === '轮换') return 18;
  return 8;
}

function teamIdFor(match: MatchState, side: Side): string {
  return side === '主' ? match.对阵.主队 : match.对阵.客队;
}

function playoffAdjusted(
  base: Record<string, number>,
  shortening: number,
): Record<string, number> {
  if (shortening <= 0) return { ...base };
  const ranked = Object.entries(base).sort((a, b) => b[1] - a[1]);
  const next: Record<string, number> = {};
  ranked.forEach(([key, minutes], index) => {
    const factor = index < 5
      ? 1 + shortening * .18
      : index < 8
        ? 1 - shortening * .10
        : 1 - shortening * .55;
    next[key] = Math.max(0, minutes * factor);
  });
  return next;
}

function capDynamicRegularSeasonTargets(
  targets: Record<string, number>,
  fixed: Record<string, number>,
  cap: number,
): Record<string, number> {
  let current = { ...targets };
  for (let pass = 0; pass < 8; pass++) {
    const over = Object.entries(current)
      .filter(([key, value]) => fixed[key] === undefined && value > cap + .05)
      .map(([key]) => key);
    if (!over.length) break;
    const capped = { ...fixed };
    for (const key of over) capped[key] = cap;
    current = normalizeRotationTargets(current, capped);
  }
  return current;
}

function buildTeamPlan(
  match: MatchState,
  side: Side,
  resolvePlayer: RotationPlayerResolver,
  options: RotationPlanOptions,
): TeamRotationState {
  const teamId = teamIdFor(match, side);
  const rosterKeys = [...match.阵容[side].场上, ...match.阵容[side].替补];
  const roster = rosterKeys
    .map(key => resolvePlayer(key))
    .filter((player): player is NonNullable<typeof player> => Boolean(player));
  const chart = buildDynamicDepthChart(roster, { tactics: match.战术[side] });
  let base = deriveDynamicMinuteWeights(chart);

  if ((options.phase ?? options.league?.阶段) === '季后赛') {
    base = playoffAdjusted(base, chart.coach.playoffShortening);
  }

  const fixed: Record<string, number> = { ...(options.overrides?.[side] ?? {}) };
  for (const key of rosterKeys) {
    const availability = getPlayerAvailability(key, options.league);
    if (!availability.available) {
      fixed[key] = 0;
      continue;
    }
    if (availability.minuteLimit !== null) {
      base[key] = Math.min(base[key] ?? availability.minuteLimit, availability.minuteLimit);
      fixed[key] = Math.min(fixed[key] ?? base[key], availability.minuteLimit);
    }
  }

  if (options.protagonist?.teamId === teamId && rosterKeys.includes(options.protagonist.key)) {
    const availability = getPlayerAvailability(options.protagonist.key, options.league);
    const roleMinutes = minutesForCareerRole(options.protagonist.role);
    fixed[options.protagonist.key] = availability.available
      ? Math.min(roleMinutes, availability.minuteLimit ?? roleMinutes)
      : 0;
  }

  const normalized = normalizeRotationTargets(base, fixed);
  const isPlayoffs = (options.phase ?? options.league?.阶段) === '季后赛';
  const regularSeasonCap = Math.max(35.5, Math.min(37.5, 35.5 + (chart.coach.starLoad - 60) * .04));
  const targetMinutes = isPlayoffs
    ? normalized
    : capDynamicRegularSeasonTargets(normalized, fixed, regularSeasonCap);
  const closingPriority: Record<string, number> = {};
  const garbagePriority: Record<string, number> = {};
  const entryMap = new Map(chart.entries.map(entry => [entry.key, entry]));
  for (const key of rosterKeys) {
    const entry = entryMap.get(key);
    const target = targetMinutes[key] ?? 0;
    closingPriority[key] = Math.max(0, Math.min(100, (entry?.closingScore ?? 50) * .82 + target * .55 - 7));
    garbagePriority[key] = Math.max(0, Math.min(100, 108 - target * 2.25 - (entry?.rotationScore ?? 65) * .16));
  }

  return {
    starters: [...match.阵容[side].场上],
    targetMinutes,
    planSource: 'dynamic',
    benchTrust: chart.coach.benchTrust,
    starLoad: chart.coach.starLoad,
    loadManagement: chart.coach.loadManagement,
    closingPriority,
    garbagePriority,
    rotationDepth: chart.coach.rotationDepth,
    smallBallAffinity: chart.coach.smallBallAffinity,
    playoffShortening: chart.coach.playoffShortening,
    staggerGroups: chart.staggerGroups,
    contextMode: '正常',
  };
}

export function createRotationPlan(
  match: MatchState,
  resolvePlayer: RotationPlayerResolver,
  options: RotationPlanOptions = {},
): RotationState {
  return {
    主: buildTeamPlan(match, '主', resolvePlayer, options),
    客: buildTeamPlan(match, '客', resolvePlayer, options),
  };
}
