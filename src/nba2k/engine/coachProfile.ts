import type { DefensiveScheme, OffensiveScheme } from './types';

export type PacePreference = '慢' | '标准' | '快';
export type ReboundPreference = '优先退防' | '均衡' | '冲抢';

export interface CoachProfile {
  id: string;
  generation: number;
  /** 在当前球队已执教的比赛数；新帅需要约15场把理念完全落地。 */
  tenureGames: number;
  offensePreference: OffensiveScheme | null;
  defensePreference: DefensiveScheme | null;
  pacePreference: PacePreference;
  reboundPreference: ReboundPreference;
  /** 0=几乎完全随阵容调整；100=强烈坚持自己的理念。 */
  stubbornness: number;
  helpBias: number;
  rotationDepthBias: number;
  benchTrustBias: number;
  starLoadBias: number;
  smallBallBias: number;
  playoffShorteningBias: number;
}

const OFFENSES: OffensiveScheme[] = ['基础', '五外', '四外一内', '挡拆', '低位', '动态进攻'];
const DEFENSES: DefensiveScheme[] = ['人盯人', '二三联防', '换防', '沉退', '延误'];
const PACES: PacePreference[] = ['慢', '标准', '快'];
const REBOUNDS: ReboundPreference[] = ['优先退防', '均衡', '冲抢'];

function hash(text: string): number {
  let value = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function rngFor(seed: string): () => number {
  let state = hash(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function centered(rng: () => number, magnitude: number): number {
  return (rng() * 2 - 1) * magnitude;
}

/**
 * 生成持久教练人格。只用 teamId+generation 做稳定随机种子，
 * 不读取球队历史战术或当前阵容，因此它是独立于 roster 的长期偏好。
 */
export function createCoachProfile(teamId: string, generation = 0): CoachProfile {
  const rng = rngFor(`nba2k-coach-v1:${teamId}:${generation}`);
  const stubbornness = Math.round(25 + rng() * 55);
  const preferenceChance = .72;

  return {
    id: `coach-${teamId}-${generation}`,
    generation,
    tenureGames: generation === 0 ? 24 : 0,
    offensePreference: rng() < preferenceChance ? OFFENSES[Math.floor(rng() * OFFENSES.length)] : null,
    defensePreference: rng() < preferenceChance ? DEFENSES[Math.floor(rng() * DEFENSES.length)] : null,
    pacePreference: PACES[Math.floor(rng() * PACES.length)],
    reboundPreference: REBOUNDS[Math.floor(rng() * REBOUNDS.length)],
    stubbornness,
    helpBias: Math.round(centered(rng, 8) * 10) / 10,
    rotationDepthBias: Math.max(-1, Math.min(1, Math.round(centered(rng, 1.25)))),
    benchTrustBias: Math.round(centered(rng, 10) * 10) / 10,
    starLoadBias: Math.round(centered(rng, 9) * 10) / 10,
    smallBallBias: Math.round(centered(rng, 12) * 10) / 10,
    playoffShorteningBias: Math.round(centered(rng, .055) * 1000) / 1000,
  };
}

export function createInitialCoachProfiles(teamIds: string[]): Record<string, CoachProfile> {
  return Object.fromEntries(teamIds.map(teamId => [teamId, createCoachProfile(teamId, 0)]));
}

export function replacementCoach(teamId: string, current?: CoachProfile | null): CoachProfile {
  return createCoachProfile(teamId, (current?.generation ?? -1) + 1);
}

/** 教练哲学影响强度：即使最固执也只是偏置，不替代 roster 客观适配。 */
export function coachInfluence(profile?: CoachProfile | null): number {
  if (!profile) return 0;
  const philosophy = .35 + profile.stubbornness / 100 * .45;
  const assimilation = .45 + Math.min(1, profile.tenureGames / 15) * .55;
  return philosophy * assimilation;
}

export function advanceCoachTenure(
  profiles: Record<string, CoachProfile>,
): Record<string, CoachProfile> {
  return Object.fromEntries(Object.entries(profiles).map(([teamId, profile]) => [
    teamId,
    { ...profile, tenureGames: profile.tenureGames + 1 },
  ]));
}
