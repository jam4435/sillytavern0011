import { describe, expect, it } from 'vitest';
import {
  coachInfluence,
  createCoachProfile,
  replacementCoach,
  type CoachProfile,
} from './coachProfile';
import { createLeagueState, replaceTeamCoach } from './season';
import { deriveTeamStyle } from './teamStyle';
import { getRoster } from '../utils/rosters';

function stubborn(overrides: Partial<CoachProfile>): CoachProfile {
  return {
    id: 'test-coach',
    generation: 0,
    tenureGames: 30,
    offensePreference: null,
    defensePreference: null,
    pacePreference: '标准',
    reboundPreference: '均衡',
    stubbornness: 90,
    helpBias: 0,
    rotationDepthBias: 0,
    benchTrustBias: 0,
    starLoadBias: 0,
    smallBallBias: 0,
    playoffShorteningBias: 0,
    ...overrides,
  };
}

describe('persistent CoachProfile', () => {
  it('同一球队/代次生成稳定人格，换帅生成不同代次且从磨合期开始', () => {
    const first = createCoachProfile('GSW', 0);
    expect(createCoachProfile('GSW', 0)).toEqual(first);
    expect(first.tenureGames).toBeGreaterThanOrEqual(15);

    const next = replacementCoach('GSW', first);
    expect(next.id).not.toBe(first.id);
    expect(next.generation).toBe(first.generation + 1);
    expect(next.tenureGames).toBe(0);
    expect(coachInfluence(next)).toBeLessThan(coachInfluence({ ...next, tenureGames: 20 }));
  });

  it('教练偏好只对阵容客观评分做有限偏置', () => {
    const roster = getRoster('GSW');
    const base = deriveTeamStyle(roster);
    const postCoach = stubborn({
      offensePreference: '低位',
      defensePreference: '沉退',
      pacePreference: '慢',
      reboundPreference: '冲抢',
    });
    const coached = deriveTeamStyle(roster, postCoach);

    expect(coached.diagnostics.offenseScores.低位).toBeGreaterThan(base.diagnostics.offenseScores.低位);
    expect(coached.diagnostics.defenseScores.沉退).toBeGreaterThan(base.diagnostics.defenseScores.沉退);
    expect(coached.diagnostics.paceScore).toBeLessThan(base.diagnostics.paceScore);
    expect(coached.diagnostics.reboundScore).toBeGreaterThan(base.diagnostics.reboundScore);
    // 即使高固执，也不能给偏好体系凭空增加十几二十分。
    expect(coached.diagnostics.offenseScores.低位 - base.diagnostics.offenseScores.低位).toBeLessThan(7);
  });

  it('新帅理念会随磨合场次逐步增强，而不是换帅后一场完全覆盖', () => {
    const roster = getRoster('MEM');
    const base = deriveTeamStyle(roster);
    const fresh = stubborn({
      id: 'fresh-coach',
      generation: 1,
      tenureGames: 0,
      offensePreference: '五外',
      defensePreference: '换防',
      pacePreference: '快',
    });
    const settled = { ...fresh, tenureGames: 20 };

    const early = deriveTeamStyle(roster, fresh);
    const late = deriveTeamStyle(roster, settled);
    const earlyBoost = early.diagnostics.offenseScores.五外 - base.diagnostics.offenseScores.五外;
    const lateBoost = late.diagnostics.offenseScores.五外 - base.diagnostics.offenseScores.五外;

    expect(earlyBoost).toBeGreaterThan(0);
    expect(lateBoost).toBeGreaterThan(earlyBoost);
    expect(late.diagnostics.paceScore).toBeGreaterThan(early.diagnostics.paceScore);
  });

  it('League换帅只替换教练并生成球队关系钩子', () => {
    const league = createLeagueState('GSW');
    const before = league.教练.GSW;
    const next = replaceTeamCoach(league, 'GSW');

    expect(next.教练.GSW.generation).toBe(before.generation + 1);
    expect(next.教练.GSW.tenureGames).toBe(0);
    expect(next.战绩).toEqual(league.战绩);
    expect(next.故事钩子.some(hook => hook.id.startsWith('coach-change-GSW-'))).toBe(true);
  });
});
