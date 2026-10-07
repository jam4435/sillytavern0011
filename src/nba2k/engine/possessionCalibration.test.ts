import { describe, expect, it } from 'vitest';
import { buildFormation } from './positioning';
import { planPossession, simulatePossession } from './possession';
import { defaultTeamTactics } from './tendencies';
import type { MatchState, OnCourtStatus, Side } from './types';
import { getPlayer, getRoster, starterEntries } from '../utils/rosters';

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const status = (): OnCourtStatus => ({
  体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0,
  投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0,
  进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 手感: '平', 连续命中: 0, 连续打铁: 0,
});

function freshMatch(homeId: string, awayId: string, possession: Side = '主'): MatchState {
  const homeEntries = starterEntries(homeId);
  const awayEntries = starterEntries(awayId);
  const offenseEntries = possession === '主' ? homeEntries : awayEntries;
  const defenseEntries = possession === '主' ? awayEntries : homeEntries;
  const offenseTactics = defaultTeamTactics(possession === '主' ? homeId : awayId);
  const defenseTactics = defaultTeamTactics(possession === '主' ? awayId : homeId);
  const homeOn = homeEntries.map(entry => entry.key);
  const awayOn = awayEntries.map(entry => entry.key);
  const all = [...getRoster(homeId), ...getRoster(awayId)].map(player => player.name);
  return {
    进行中: true,
    对阵: { 主队: homeId, 客队: awayId },
    节次: 1,
    剩余秒数: 720,
    投篮时钟: 24,
    比分: { 主: 0, 客: 0 },
    球权: possession,
    跳球胜方: possession,
    战术: { 主: defaultTeamTactics(homeId), 客: defaultTeamTactics(awayId) },
    站位: buildFormation({
      offense: offenseEntries,
      defense: defenseEntries,
      offenseSide: possession,
      tactic: offenseTactics.offense,
      defenseScheme: defenseTactics.defense,
      ballHolder: offenseEntries[0]?.key ?? '',
      attackRight: possession === '主',
    }),
    本节球队犯规: { 主: 0, 客: 0 },
    暂停: { 主: 7, 客: 7 },
    阵容: { 主: { 场上: homeOn, 替补: [] }, 客: { 场上: awayOn, 替补: [] } },
    回合阶段: '常规回合',
    待处理情境: { type: 'none' },
    回合情境: '',
    球员状态: Object.fromEntries(all.map(key => [key, status()])),
    回合摘要: '',
  };
}

function sumSide(match: MatchState, side: Side, key: keyof OnCourtStatus): number {
  return match.阵容[side].场上.reduce((sum, player) => sum + Number(match.球员状态[player]?.[key] ?? 0), 0);
}

describe('PossessionEngine broad NBA-like calibration', () => {
  it('勇士CPU发起权以Curry为核心，Bogut不会接近核心持球比例', () => {
    const rng = seeded(2016);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const plan = planPossession(freshMatch('GSW', 'CLE'), getPlayer, rng);
      counts[plan.initiator] = (counts[plan.initiator] ?? 0) + 1;
    }
    console.info('[nba2k calibration] GSW initiators', counts);
    expect(counts['Stephen Curry']).toBeGreaterThan(counts['Andrew Bogut'] * 1.7);
    expect(counts['Stephen Curry']).toBeGreaterThan(counts['Klay Thompson']);
  });

  it('大量勇士进攻的关键统计落在宽松的真实篮球区间', () => {
    const rng = seeded(73);
    let points = 0, fga = 0, threeA = 0, fta = 0, tov = 0, oreb = 0, misses = 0, assists = 0;
    const trials = 1600;
    for (let i = 0; i < trials; i++) {
      const result = simulatePossession(freshMatch('GSW', 'CLE'), getPlayer, { rng });
      const m = result.match;
      points += m.比分.主;
      const attempts = sumSide(m, '主', '投篮出手');
      const makes = sumSide(m, '主', '投篮命中');
      fga += attempts;
      threeA += sumSide(m, '主', '三分出手');
      fta += sumSide(m, '主', '罚球出手');
      tov += sumSide(m, '主', '失误');
      oreb += sumSide(m, '主', '进攻篮板');
      assists += sumSide(m, '主', '助攻');
      misses += Math.max(0, attempts - makes);
    }

    const ppp = points / trials;
    const threeRate = threeA / Math.max(1, fga);
    const ftr = fta / Math.max(1, fga);
    const tovRate = tov / trials;
    const orebPerMiss = oreb / Math.max(1, misses);

    console.info('[nba2k calibration] GSW vs CLE', {
      ppp,
      threeRate,
      ftr,
      tovRate,
      orebPerMiss,
      assists,
      fga,
      fta,
    });

    expect(ppp).toBeGreaterThan(.85);
    expect(ppp).toBeLessThan(1.35);
    expect(threeRate).toBeGreaterThan(.24);
    expect(threeRate).toBeLessThan(.55);
    expect(ftr).toBeGreaterThan(.12);
    expect(ftr).toBeLessThan(.45);
    expect(tovRate).toBeGreaterThan(.07);
    expect(tovRate).toBeLessThan(.20);
    expect(orebPerMiss).toBeGreaterThan(.14);
    expect(orebPerMiss).toBeLessThan(.36);
    expect(assists).toBeGreaterThan(0);
  });
});
