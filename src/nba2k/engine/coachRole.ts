import type { MatchState } from './types';
import type { CareerState } from '../utils/statReader';

export type CoachRole = CareerState['球队角色'];

const ROLE_ORDER: CoachRole[] = ['边缘轮换', '轮换', '第六人', '首发', '核心'];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export interface CoachReviewResult {
  career: CareerState;
  changed: boolean;
  previousRole: CoachRole;
  nextRole: CoachRole;
  roleScore: number;
  trustDelta: number;
}

function teamWon(career: CareerState, match: MatchState): boolean {
  const side = match.对阵.主队 === career.球队 ? '主' : '客';
  return match.比分[side] > match.比分[side === '主' ? '客' : '主'];
}

function roleForScore(score: number): CoachRole {
  if (score >= 83) return '核心';
  if (score >= 73) return '首发';
  if (score >= 64) return '第六人';
  if (score >= 48) return '轮换';
  return '边缘轮换';
}

export function applyCoachReview(
  career: CareerState,
  match: MatchState,
  performance: number,
  gamesPlayed: number,
): CoachReviewResult {
  const status = match.球员状态[career.附身球员];
  const previousRole = career.球队角色;
  if (!status || status.上场秒数 <= 0) {
    return { career, changed: false, previousRole, nextRole: previousRole, roleScore: career.教练信任, trustDelta: 0 };
  }

  const minutes = status.上场秒数 / 60;
  const workloadCredit = Math.min(1, minutes / 24);
  const trustDelta = clamp((performance - 64) / 11, -3.2, 3.6) * workloadCredit + (teamWon(career, match) ? .45 : -.15);
  const trust = Math.round(clamp(career.教练信任 + trustDelta) * 10) / 10;
  const review = career.教练评估 ?? { 最近评分: [], 上次角色调整场次: 0 };
  const recent = [...review.最近评分, performance].slice(-5);
  const recentAvg = recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length);
  const roleScore = Math.round((trust * .50 + career.能力.overall * .25 + recentAvg * .25) * 10) / 10;

  let nextRole = previousRole;
  const canReview = gamesPlayed >= 5 && gamesPlayed % 5 === 0 && gamesPlayed - review.上次角色调整场次 >= 5;
  let lastChange = review.上次角色调整场次;
  if (canReview) {
    const desired = roleForScore(roleScore);
    const currentIndex = ROLE_ORDER.indexOf(previousRole);
    const desiredIndex = ROLE_ORDER.indexOf(desired);
    // 一次评估最多升/降一级，避免角色来回震荡。
    if (desiredIndex > currentIndex) nextRole = ROLE_ORDER[currentIndex + 1] ?? previousRole;
    else if (desiredIndex < currentIndex) nextRole = ROLE_ORDER[currentIndex - 1] ?? previousRole;
    if (nextRole !== previousRole) lastChange = gamesPlayed;
  }

  const nextCareer: CareerState = {
    ...career,
    教练信任: trust,
    球队角色: nextRole,
    教练评估: { 最近评分: recent, 上次角色调整场次: lastChange },
  };
  return {
    career: nextCareer,
    changed: nextRole !== previousRole,
    previousRole,
    nextRole,
    roleScore,
    trustDelta: Math.round(trustDelta * 10) / 10,
  };
}
