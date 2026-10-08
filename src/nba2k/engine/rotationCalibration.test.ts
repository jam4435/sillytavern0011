import { describe, expect, it } from 'vitest';
import { ROTATION_BENCHMARKS_2015_16 } from '../data/calibration/rotationBenchmarks2015_16';
import { buildDynamicDepthChart } from './depthChart';
import { buildFormation } from './positioning';
import { createRotationPlan } from './rotationPlan';
import { deriveTeamTactics } from './teamStyle';
import type { MatchState, OnCourtStatus } from './types';
import { getPlayer, getRoster } from '../utils/rosters';

const status = (): OnCourtStatus => ({
  体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0,
  投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0,
  进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 垃圾时间秒数: 0,
  手感: '平', 连续命中: 0, 连续打铁: 0,
});

function matchFor(teamId: string): MatchState {
  const opponent = teamId === 'CLE' ? 'GSW' : 'CLE';
  const homeRoster = getRoster(teamId);
  const awayRoster = getRoster(opponent);
  const homeTactics = deriveTeamTactics(homeRoster);
  const awayTactics = deriveTeamTactics(awayRoster);
  const homeEntries = buildDynamicDepthChart(homeRoster, { tactics: homeTactics }).starters;
  const awayEntries = buildDynamicDepthChart(awayRoster, { tactics: awayTactics }).starters;
  const homeOn = homeEntries.map(entry => entry.key);
  const awayOn = awayEntries.map(entry => entry.key);
  const homeAll = homeRoster.map(player => player.name);
  const awayAll = awayRoster.map(player => player.name);
  return {
    进行中: true,
    对阵: { 主队: teamId, 客队: opponent },
    节次: 1,
    剩余秒数: 720,
    投篮时钟: 24,
    比分: { 主: 0, 客: 0 },
    球权: '主',
    跳球胜方: '主',
    战术: { 主: homeTactics, 客: awayTactics },
    站位: buildFormation({
      offense: homeEntries,
      defense: awayEntries,
      offenseSide: '主',
      tactic: homeTactics.offense,
      defenseScheme: awayTactics.defense,
      ballHolder: homeOn[0],
      attackRight: true,
    }),
    本节球队犯规: { 主: 0, 客: 0 },
    暂停: { 主: 7, 客: 7 },
    阵容: {
      主: { 场上: homeOn, 替补: homeAll.filter(key => !homeOn.includes(key)) },
      客: { 场上: awayOn, 替补: awayAll.filter(key => !awayOn.includes(key)) },
    },
    回合阶段: '常规回合',
    待处理情境: { type: 'none' },
    回合情境: '',
    球员状态: Object.fromEntries([...homeAll, ...awayAll].map(key => [key, status()])),
    回合摘要: '',
  };
}

describe('historical rotation calibration (test-only data)', () => {
  it('纯模拟分钟对2015-16代表球队保持合理误差，但生产计划不读取历史答案', () => {
    const rows: Record<string, { mae: number; samples: number; predictedTop: string; historicalTop: string }> = {};
    let weightedError = 0;
    let samples = 0;

    for (const [teamId, benchmark] of Object.entries(ROTATION_BENCHMARKS_2015_16)) {
      const match = matchFor(teamId);
      const plan = createRotationPlan(match, getPlayer);
      expect(plan.主.planSource).toBe('dynamic');

      const comparable = Object.entries(benchmark).filter(([key]) => plan.主.targetMinutes[key] !== undefined);
      const error = comparable.reduce((sum, [key, historical]) =>
        sum + Math.abs((plan.主.targetMinutes[key] ?? 0) - historical), 0);
      const mae = error / Math.max(1, comparable.length);
      weightedError += error;
      samples += comparable.length;

      const predictedTop = Object.entries(plan.主.targetMinutes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const historicalTop = Object.entries(benchmark).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      rows[teamId] = { mae, samples: comparable.length, predictedTop, historicalTop };

      expect(mae).toBeLessThan(7.5);
    }

    const overallMae = weightedError / Math.max(1, samples);
    console.info('[nba2k rotation calibration]', { overallMae, rows });
    expect(overallMae).toBeLessThan(6.2);
  });
});
