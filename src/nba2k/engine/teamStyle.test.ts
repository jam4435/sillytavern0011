import { describe, expect, it } from 'vitest';
import { TEAM_STYLE_BENCHMARKS_2015_16 } from '../data/calibration/teamStyleBenchmarks2015_16';
import { getRoster } from '../utils/rosters';
import { deriveTeamStyle, deriveTeamTactics } from './teamStyle';

describe('dynamic TeamStyleEngine', () => {
  it('历史球队只作为校准答案，纯模拟风格在整体层面接近2015-16粗粒度标签', () => {
    let offenseMatches = 0;
    let paceMatches = 0;
    let reboundMatches = 0;
    const rows: Record<string, unknown> = {};

    for (const [teamId, expected] of Object.entries(TEAM_STYLE_BENCHMARKS_2015_16)) {
      const derived = deriveTeamStyle(getRoster(teamId));
      if (derived.tactics.offense === expected.offense) offenseMatches += 1;
      if (derived.tactics.pace === expected.pace) paceMatches += 1;
      if (derived.tactics.rebound === expected.rebound) reboundMatches += 1;
      rows[teamId] = {
        expected,
        actual: derived.tactics,
        offenseScores: derived.diagnostics.offenseScores,
        defenseScores: derived.diagnostics.defenseScores,
        paceScore: derived.diagnostics.paceScore,
      };
    }

    console.info('[nba2k team-style calibration]', {
      offenseMatches,
      paceMatches,
      reboundMatches,
      rows,
    });

    // 历史标签很粗，只要求算法能捕捉多数显著差异，而不是逐队复刻。
    expect(offenseMatches).toBeGreaterThanOrEqual(5);
    expect(paceMatches).toBeGreaterThanOrEqual(6);
    expect(reboundMatches).toBeGreaterThanOrEqual(4);
  });

  it('球队ID和球员姓名全部改掉后，只要能力结构不变就仍推导出同一体系', () => {
    const original = getRoster('GSW').slice(0, 10);
    const future = original.map((player, index) => ({
      ...player,
      name: `Generated ${index + 1}`,
      cn: `生成球员${index + 1}`,
      team: 'FUTURE',
    }));

    expect(deriveTeamTactics(future)).toEqual(deriveTeamTactics(original));
  });

  it('改变阵容能力结构会让体系跟着变化，而不是沿用球队历史标签', () => {
    const original = getRoster('MEM').slice(0, 10);
    const shooters = original.map((player, index) => ({
      ...player,
      name: `Space ${index + 1}`,
      team: 'SPACE',
      attrs: {
        ...player.attrs,
        standingThree: Math.max(player.attrs.standingThree, 88),
        movingThree: Math.max(player.attrs.movingThree, 84),
        ballControl: Math.max(player.attrs.ballControl, index < 4 ? 86 : 72),
        passVision: Math.max(player.attrs.passVision, 78),
        passIQ: Math.max(player.attrs.passIQ, 78),
        lateralQuickness: Math.max(player.attrs.lateralQuickness, 76),
        speed: Math.max(player.attrs.speed, 76),
      },
    }));

    const before = deriveTeamTactics(original);
    const after = deriveTeamTactics(shooters);
    expect(after).not.toEqual(before);
    expect(['五外', '动态进攻', '挡拆']).toContain(after.offense);
    expect(after.pace).not.toBe('慢');
  });
});
