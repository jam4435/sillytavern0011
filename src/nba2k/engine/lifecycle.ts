import { overallOf, RATING_KEYS } from './development';
import type { PlayerData, PlayerRatingsV3, Position } from './types';

export type CareerPhase = '新秀' | '成长' | '巅峰' | '下滑' | '暮年' | '退役';
export type RetirementStatus = '现役' | '考虑退役' | '退役';

const clamp = (value: number, min = 25, max = 99) => Math.max(min, Math.min(max, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

function hash(text: string): number {
  let value = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function jitter(key: string, span = 1): number {
  const unit = (hash(key) % 10001) / 10000;
  return (unit * 2 - 1) * span;
}

const PEAK_AGE_BASE: Record<Position, number> = {
  PG: 27, SG: 27, SF: 28, PF: 29, C: 29,
};

const ATHLETIC_KEYS = new Set<keyof PlayerRatingsV3>([
  'speed', 'acceleration', 'vertical', 'lateralQuickness', 'stamina',
  'drivingDunk', 'contactDunk', 'reactionTime', 'hustle',
]);
const DURABILITY_KEYS = new Set<keyof PlayerRatingsV3>(['durability']);
const STRENGTH_KEYS = new Set<keyof PlayerRatingsV3>(['strength', 'boxout']);
const SKILL_KEYS = new Set<keyof PlayerRatingsV3>([
  'standingLayup', 'drivingLayup', 'postFade', 'postHook', 'postControl', 'drawFoul',
  'movingClose', 'standingClose', 'movingMid', 'standingMid', 'movingThree', 'standingThree',
  'freeThrow', 'ballControl', 'passVision', 'passAccuracy', 'offRebound', 'standingDunk',
  'hands', 'defRebound', 'block', 'steal',
]);
const IQ_KEYS = new Set<keyof PlayerRatingsV3>([
  'shotIQ', 'passIQ', 'shotContest', 'onBallDefenseIQ', 'lowPostDefenseIQ',
  'offensiveConsistency', 'defensiveConsistency', 'composure',
]);

/**
 * 数据表没有年龄字段，因此用“当前实力/潜力差 + 身体衰退信号”估算初始年龄。
 * 这是运行时纯模拟输入；真实2015-16年龄只允许在 calibration 测试中校验。
 */
export function estimateInitialAge(player: PlayerData): number {
  const gap = player.attrs.potential - player.overall;
  let age =
    28 -
    Math.max(0, gap) * .62 +
    Math.max(0, -gap) * .48 +
    Math.max(0, 82 - player.attrs.speed) * .10 +
    Math.max(0, 84 - player.attrs.stamina) * .12 +
    Math.max(0, 88 - player.attrs.potential) * .22;

  if (player.overall >= 82 && player.attrs.potential <= 86 && player.attrs.stamina < 80) age += 2.8;
  if (player.attrs.potential <= 76 && player.attrs.speed < 65) age += 2.5;
  if (player.attrs.speed >= 76 && player.attrs.stamina >= 76 && age > 34) age = 34;
  if (
    Math.abs(gap) <= 1 &&
    player.overall >= 82 &&
    player.attrs.speed < 76 &&
    player.attrs.stamina < 76
  ) age += 3;

  return Math.max(19, Math.min(39, Math.round(age)));
}

export function estimatePeakAge(player: Pick<PlayerData, 'name' | 'pos' | 'attrs'>): number {
  const skillBias =
    (player.attrs.shotIQ + player.attrs.passIQ + player.attrs.composure) / 3 >= 84 ? 1 : 0;
  const value = PEAK_AGE_BASE[player.pos] + skillBias + Math.round(jitter(`${player.name}:peak`, 1));
  return Math.max(25, Math.min(31, value));
}

function oneYearRatingDelta(
  key: keyof PlayerRatingsV3,
  rating: number,
  potential: number,
  ageAfter: number,
  peakAge: number,
  seed: string,
): number {
  if (key === 'potential') return 0;
  const variance = 1 + jitter(seed, .12);

  if (ageAfter <= peakAge) {
    const room = Math.max(0, potential - rating);
    const youth = ageAfter <= 22 ? 1.15 : ageAfter <= 24 ? .9 : ageAfter <= peakAge - 1 ? .55 : .2;
    const roomFactor = Math.min(1.25, room / 16);
    if (IQ_KEYS.has(key)) return (.35 + roomFactor * .45) * variance;
    if (SKILL_KEYS.has(key)) return youth * (.25 + roomFactor * .65) * variance;
    if (ATHLETIC_KEYS.has(key)) return ageAfter <= 24 ? youth * .42 * variance : .08 * variance;
    if (STRENGTH_KEYS.has(key)) return ageAfter <= 27 ? .28 * variance : .08 * variance;
    if (DURABILITY_KEYS.has(key)) return ageAfter <= 23 ? .18 * variance : 0;
    return .12 * variance;
  }

  const yearsPastPeak = ageAfter - peakAge;
  if (ATHLETIC_KEYS.has(key)) {
    const base = .45 + yearsPastPeak * .30 + Math.max(0, ageAfter - 33) * .35;
    return -base * variance;
  }
  if (DURABILITY_KEYS.has(key)) {
    const base = ageAfter < 30 ? .15 : .45 + (ageAfter - 30) * .25;
    return -base * variance;
  }
  if (STRENGTH_KEYS.has(key)) {
    if (ageAfter <= 32) return .10 * variance;
    return -(.25 + Math.max(0, ageAfter - 34) * .28) * variance;
  }
  if (SKILL_KEYS.has(key)) {
    if (ageAfter <= 32) return .08 * variance;
    return -(.12 + Math.max(0, ageAfter - 34) * .16) * variance;
  }
  if (IQ_KEYS.has(key)) {
    if (ageAfter <= 32) return .18 * variance;
    if (ageAfter <= 35) return 0;
    return -(.10 + (ageAfter - 35) * .12) * variance;
  }
  return ageAfter >= 34 ? -.15 * variance : 0;
}

export function evolveRatingsOneSeason(
  ratings: PlayerRatingsV3,
  ageBefore: number,
  peakAge: number,
  seed: string,
): PlayerRatingsV3 {
  const next = { ...ratings };
  const ageAfter = ageBefore + 1;
  for (const key of RATING_KEYS) {
    if (key === 'potential') continue;
    const delta = oneYearRatingDelta(
      key,
      next[key],
      ratings.potential,
      ageAfter,
      peakAge,
      `${seed}:${ageAfter}:${key}`,
    );
    next[key] = Math.round(clamp(next[key] + delta));
  }
  next.potential = ratings.potential;
  return next;
}

export function careerPhase(age: number, peakAge: number, retirementStatus: RetirementStatus = '现役'): CareerPhase {
  if (retirementStatus === '退役') return '退役';
  if (age <= 21) return '新秀';
  if (age < peakAge - 1) return '成长';
  if (age <= peakAge + 1) return '巅峰';
  if (age <= peakAge + 5) return '下滑';
  return '暮年';
}

export function retirementPressure(input: {
  age: number;
  overall: number;
  durability: number;
  role?: '边缘轮换' | '轮换' | '第六人' | '首发' | '核心';
  severeInjuries?: number;
}): number {
  const roleBias =
    input.role === '核心' ? -8 :
    input.role === '首发' ? -5 :
    input.role === '第六人' ? -2 :
    input.role === '边缘轮换' ? 6 :
    0;
  return round1(
    Math.max(0, input.age - 33) * 10 +
    Math.max(0, 74 - input.overall) * 1.8 +
    Math.max(0, 72 - input.durability) * .8 +
    Math.max(0, input.severeInjuries ?? 0) * 6 +
    roleBias,
  );
}

export function retirementStatusFor(input: {
  age: number;
  overall: number;
  durability: number;
  role?: '边缘轮换' | '轮换' | '第六人' | '首发' | '核心';
  severeInjuries?: number;
}): RetirementStatus {
  if (input.age >= 44) return '退役';
  if (input.age < 34) return '现役';
  const pressure = retirementPressure(input);
  if (pressure >= 82) return '退役';
  if (pressure >= 55) return '考虑退役';
  return '现役';
}

export interface ProjectedLeaguePlayer {
  player: PlayerData;
  initialAge: number;
  age: number;
  peakAge: number;
  phase: CareerPhase;
  retirementStatus: RetirementStatus;
}

/**
 * 从不可变2015-16种子按赛季序号重算当季球员。
 * 不需要给373名球员在 stat_data 复制43项能力，避免长期存档膨胀。
 */
export function projectLeaguePlayer(
  base: PlayerData,
  seasonOffset: number,
  severeInjuries = 0,
): ProjectedLeaguePlayer {
  const initialAge = estimateInitialAge(base);
  const peakAge = estimatePeakAge(base);
  let attrs = { ...base.attrs };
  let age = initialAge;

  for (let season = 0; season < Math.max(0, seasonOffset); season++) {
    attrs = evolveRatingsOneSeason(attrs, age, peakAge, `${base.name}:league:${season}`);
    age += 1;
  }

  const computedBase = overallOf(base.attrs, base.pos);
  const computedNow = overallOf(attrs, base.pos);
  const overall = Math.max(40, Math.min(99, base.overall + (computedNow - computedBase)));
  const retirementStatus = retirementStatusFor({
    age,
    overall,
    durability: attrs.durability,
    severeInjuries,
  });

  return {
    player: { ...base, overall, attrs },
    initialAge,
    age,
    peakAge,
    phase: careerPhase(age, peakAge, retirementStatus),
    retirementStatus,
  };
}

export interface CareerLifecycleLike {
  附身球员: string;
  位置: Position;
  年龄: number;
  巅峰年龄: number;
  生涯赛季数: number;
  退役状态: RetirementStatus;
  球队角色: '边缘轮换' | '轮换' | '第六人' | '首发' | '核心';
  能力: PlayerRatingsV3 & { overall: number };
}

export function advanceCareerLifecycleOneSeason<T extends CareerLifecycleLike>(
  career: T,
  severeInjuries = 0,
): T {
  if (career.退役状态 === '退役') return career;
  const attrs = evolveRatingsOneSeason(
    career.能力,
    career.年龄,
    career.巅峰年龄,
    `${career.附身球员}:career:${career.生涯赛季数}`,
  );
  const age = career.年龄 + 1;
  const overall = overallOf(attrs, career.位置);
  const retirementStatus = retirementStatusFor({
    age,
    overall,
    durability: attrs.durability,
    role: career.球队角色,
    severeInjuries,
  });

  return {
    ...career,
    年龄: age,
    生涯赛季数: career.生涯赛季数 + 1,
    退役状态: retirementStatus,
    能力: { overall, ...attrs },
  };
}

export function seasonLabelFromOffset(offset: number): string {
  const start = 2015 + Math.max(0, offset);
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
