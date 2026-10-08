import { getTeamRotationProfile } from '../data/rotationProfiles';
import { getPlayerAvailability } from './availability';
import {
  buildGenericRotationTargets,
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

function buildTeamPlan(
  match: MatchState,
  side: Side,
  resolvePlayer: RotationPlayerResolver,
  options: RotationPlanOptions,
): TeamRotationState {
  const teamId = teamIdFor(match, side);
  const profile = getTeamRotationProfile(teamId);
  const roster = [...match.阵容[side].场上, ...match.阵容[side].替补];
  const generic = buildGenericRotationTargets(match, side, resolvePlayer);
  let base: Record<string, number> = {};

  for (const key of roster) {
    const historical = profile?.regularMinutes?.[key];
    base[key] = typeof historical === 'number' ? historical : (generic[key] ?? 0);
  }

  if ((options.phase ?? options.league?.阶段) === '季后赛' && profile) {
    base = playoffAdjusted(base, profile.playoffShortening);
  }

  const fixed: Record<string, number> = { ...(options.overrides?.[side] ?? {}) };
  for (const key of roster) {
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

  if (options.protagonist?.teamId === teamId && roster.includes(options.protagonist.key)) {
    const availability = getPlayerAvailability(options.protagonist.key, options.league);
    const roleMinutes = minutesForCareerRole(options.protagonist.role);
    fixed[options.protagonist.key] = availability.available
      ? Math.min(roleMinutes, availability.minuteLimit ?? roleMinutes)
      : 0;
  }

  const targetMinutes = normalizeRotationTargets(base, fixed);
  const closingPriority: Record<string, number> = {};
  const garbagePriority: Record<string, number> = {};
  for (const key of roster) {
    const player = resolvePlayer(key);
    const target = targetMinutes[key] ?? 0;
    closingPriority[key] =
      profile?.closingPriority?.[key] ??
      Math.max(0, Math.min(100, (player?.overall ?? 70) * .72 + target * .75 - 5));
    garbagePriority[key] = Math.max(0, Math.min(100, 105 - target * 2.25 - (player?.overall ?? 70) * .15));
  }

  return {
    starters: [...match.阵容[side].场上],
    targetMinutes,
    profileId: profile?.teamId ?? 'generic',
    closingPriority,
    garbagePriority,
    rotationDepth: profile?.rotationDepth ?? 10,
    smallBallAffinity: profile?.smallBallAffinity ?? 50,
    playoffShortening: profile?.playoffShortening ?? .18,
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
