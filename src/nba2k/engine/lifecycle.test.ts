import { describe, expect, it } from 'vitest';
import { AGE_BENCHMARKS_2015_16 } from '../data/calibration/ageBenchmarks2015_16';
import { createLeagueState, beginNextSeason } from './season';
import {
  advanceCareerLifecycleOneSeason,
  careerPhase,
  estimateInitialAge,
  estimatePeakAge,
  projectLeaguePlayer,
} from './lifecycle';
import { getBasePlayer, getRosterForLeague } from '../utils/rosters';
import { TEAMS } from '../data/teams';

describe('multi-season lifecycle', () => {
  it('初始年龄估算只靠球员种子，但与2015-16真实年龄大致接近', () => {
    let error = 0;
    let samples = 0;
    const rows: Record<string, { predicted: number; actual: number }> = {};
    for (const [name, actual] of Object.entries(AGE_BENCHMARKS_2015_16)) {
      const player = getBasePlayer(name);
      if (!player) continue;
      const predicted = estimateInitialAge(player);
      rows[name] = { predicted, actual };
      error += Math.abs(predicted - actual);
      samples += 1;
    }
    const mae = error / Math.max(1, samples);
    console.info('[nba2k age calibration]', { mae, rows });
    expect(samples).toBeGreaterThanOrEqual(12);
    expect(mae).toBeLessThan(1.8);
  });

  it('年轻高潜球员先成长/进入巅峰，老将身体先于IQ与投射衰退', () => {
    const towns = getBasePlayer('Karl-Anthony Towns')!;
    const young = projectLeaguePlayer(towns, 4);
    expect(young.age).toBeGreaterThan(estimateInitialAge(towns));
    expect(['成长', '巅峰']).toContain(young.phase);
    expect(young.player.overall).toBeGreaterThanOrEqual(towns.overall - 1);

    const lebron = getBasePlayer('LeBron James')!;
    const old = projectLeaguePlayer(lebron, 6);
    const speedLoss = lebron.attrs.speed - old.player.attrs.speed;
    const iqLoss = lebron.attrs.passIQ - old.player.attrs.passIQ;
    expect(speedLoss).toBeGreaterThan(iqLoss);
    expect(old.player.attrs.composure).toBeGreaterThanOrEqual(lebron.attrs.composure - 4);
  });

  it('暮年老将最终会确定性退役并从后续赛季Roster消失', () => {
    const league = createLeagueState('SAS');
    league.赛季序号 = 3;
    league.赛季 = '2018-19';
    const roster = getRosterForLeague('SAS', league);
    expect(roster.some(player => player.name === 'Tim Duncan')).toBe(false);
  });

  it('没有新秀补充前，5到10年内原始联盟不会因退役曲线过早清空', () => {
    const counts: Record<number, number> = {};
    for (const offset of [0, 5, 10]) {
      const league = createLeagueState('GSW');
      league.赛季序号 = offset;
      league.赛季 = `${2015 + offset}-${String((2016 + offset) % 100).padStart(2, '0')}`;
      counts[offset] = TEAMS.reduce((sum, team) => sum + getRosterForLeague(team.id, league).length, 0);
    }
    console.info('[nba2k lifecycle population]', counts);
    expect(counts[5]).toBeGreaterThan(220);
    expect(counts[10]).toBeGreaterThan(90);
    expect(counts[10]).toBeLessThan(counts[5]);
  });

  it('主角每个休赛期只衰老一次，并按年龄/能力/角色进入生涯阶段', () => {
    const base = getBasePlayer('Stephen Curry')!;
    const age = estimateInitialAge(base);
    const peak = estimatePeakAge(base);
    const career = {
      附身球员: base.name,
      位置: base.pos,
      年龄: age,
      巅峰年龄: peak,
      生涯赛季数: 0,
      退役状态: '现役' as const,
      球队角色: '核心' as const,
      能力: { overall: base.overall, ...base.attrs },
    };
    const next = advanceCareerLifecycleOneSeason(career);
    expect(next.年龄).toBe(age + 1);
    expect(next.生涯赛季数).toBe(1);
    expect(next.能力.overall).toBeGreaterThan(0);
    expect(careerPhase(next.年龄, next.巅峰年龄, next.退役状态)).not.toBe('退役');
  });

  it('休赛期可进入下一赛季，赛历年份与赛季标签一起前进', () => {
    const league = createLeagueState('GSW');
    league.阶段 = '休赛期';
    const next = beginNextSeason(league, 'GSW');
    expect(next.league.赛季).toBe('2016-17');
    expect(next.league.赛季序号).toBe(1);
    expect(next.league.日期).toBe('2016-10-27');
    expect(next.nextGame?.date).toBe('2016-10-27');
    expect(next.league.战绩.GSW).toEqual({ 胜: 0, 负: 0, 得分: 0, 失分: 0, 连胜: 0 });
  });
});
