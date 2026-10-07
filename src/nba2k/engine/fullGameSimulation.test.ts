import { describe, expect, it } from 'vitest';
import { buildFormation } from './positioning';
import { simulateFullGame } from './fullGameSimulation';
import { createRotationState } from './rotation';
import { defaultTeamTactics } from './tendencies';
import type { MatchState, OnCourtStatus, Side } from './types';
import { getPlayer, getRoster, starterEntries } from '../utils/rosters';

const status = (): OnCourtStatus => ({
  体力: 100, 得分: 0, 篮板: 0, 助攻: 0, 抢断: 0, 盖帽: 0, 失误: 0, 犯规: 0,
  投篮命中: 0, 投篮出手: 0, 三分命中: 0, 三分出手: 0, 罚球命中: 0, 罚球出手: 0,
  进攻篮板: 0, 防守篮板: 0, 上场秒数: 0, 手感: '平', 连续命中: 0, 连续打铁: 0,
});

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function freshMatch(homeId: string, awayId: string): MatchState {
  const homeEntries = starterEntries(homeId);
  const awayEntries = starterEntries(awayId);
  const homeOn = homeEntries.map(e => e.key);
  const awayOn = awayEntries.map(e => e.key);
  const homeAll = getRoster(homeId).map(p => p.name);
  const awayAll = getRoster(awayId).map(p => p.name);
  const homeTactics = defaultTeamTactics(homeId);
  const awayTactics = defaultTeamTactics(awayId);
  const match: MatchState = {
    进行中: true, 对阵: { 主队: homeId, 客队: awayId }, 节次: 1, 剩余秒数: 720, 投篮时钟: 24,
    比分: { 主: 0, 客: 0 }, 球权: '主', 跳球胜方: '主',
    战术: { 主: homeTactics, 客: awayTactics },
    站位: buildFormation({
      offense: homeEntries, defense: awayEntries, offenseSide: '主',
      tactic: homeTactics.offense, defenseScheme: awayTactics.defense,
      ballHolder: homeOn[0], attackRight: true,
    }),
    本节球队犯规: { 主: 0, 客: 0 }, 暂停: { 主: 7, 客: 7 },
    阵容: {
      主: { 场上: homeOn, 替补: homeAll.filter(k => !homeOn.includes(k)) },
      客: { 场上: awayOn, 替补: awayAll.filter(k => !awayOn.includes(k)) },
    },
    回合阶段: '常规回合', 待处理情境: { type: 'none' }, 回合情境: '',
    球员状态: Object.fromEntries([...homeAll, ...awayAll].map(k => [k, status()])), 回合摘要: '',
  };
  match.轮换 = createRotationState(match, getPlayer);
  return match;
}

function teamStat(match: MatchState, side: Side, key: keyof OnCourtStatus): number {
  return [...match.阵容[side].场上, ...match.阵容[side].替补]
    .reduce((sum, player) => sum + Number(match.球员状态[player]?.[key] ?? 0), 0);
}

function teamMinutes(match: MatchState, teamId: string): number {
  return getRoster(teamId).reduce((sum, player) => sum + (match.球员状态[player.name]?.上场秒数 ?? 0), 0) / 60;
}

describe('48-minute full-game audit', () => {
  it('单场完整模拟能自然结束且总上场时间守恒', () => {
    const result = simulateFullGame(freshMatch('GSW', 'CLE'), getPlayer, { rng: seeded(2016) });
    expect(result.match.进行中).toBe(false);
    const expectedTeamMinutes = (48 + Math.max(0, result.match.节次 - 4) * 5) * 5;
    expect(teamMinutes(result.match, 'GSW')).toBeCloseTo(expectedTeamMinutes, 4);
    expect(teamMinutes(result.match, 'CLE')).toBeCloseTo(expectedTeamMinutes, 4);
    expect(result.possessions.主).toBeGreaterThan(70);
    expect(result.possessions.客).toBeGreaterThan(70);
  });

  it('96场多体系完整比赛统计保持在宽松真实NBA区间', () => {
    const matchups: [string, string][] = [
      ['GSW', 'CLE'], ['SAS', 'OKC'], ['HOU', 'LAC'], ['MEM', 'GSW'],
      ['CHI', 'MIA'], ['POR', 'OKC'], ['CLE', 'SAS'], ['LAL', 'NYK'],
    ];
    let games = 0;
    let totalPace = 0;
    let totalScore = 0;
    let totalFga = 0;
    let totalThreeA = 0;
    let totalFta = 0;
    let totalTov = 0;
    let totalOreb = 0;
    let totalBenchMinutes = 0;
    let totalTopMinutes = 0;
    let totalFinalStamina = 0;
    let staminaSamples = 0;

    for (let seedIndex = 0; seedIndex < 12; seedIndex++) {
      for (let matchupIndex = 0; matchupIndex < matchups.length; matchupIndex++) {
        const [homeId, awayId] = matchups[matchupIndex];
        const initial = freshMatch(homeId, awayId);
        const starters = {
          主: new Set(initial.轮换!.主.starters),
          客: new Set(initial.轮换!.客.starters),
        };
        const result = simulateFullGame(initial, getPlayer, { rng: seeded(1000 + seedIndex * 97 + matchupIndex * 13) });
        const m = result.match;
        const gameMinutes = 48 + Math.max(0, m.节次 - 4) * 5;
        const pace = ((result.possessions.主 + result.possessions.客) / 2) * (48 / gameMinutes);
        totalPace += pace;
        totalScore += (m.比分.主 + m.比分.客) / 2;

        for (const side of ['主', '客'] as const) {
          totalFga += teamStat(m, side, '投篮出手');
          totalThreeA += teamStat(m, side, '三分出手');
          totalFta += teamStat(m, side, '罚球出手');
          totalTov += teamStat(m, side, '失误');
          totalOreb += teamStat(m, side, '进攻篮板');
          const roster = [...m.阵容[side].场上, ...m.阵容[side].替补];
          const minutes = roster.map(key => ({ key, value: (m.球员状态[key]?.上场秒数 ?? 0) / 60 }));
          totalTopMinutes += Math.max(...minutes.map(item => item.value));
          totalBenchMinutes += minutes.filter(item => !starters[side].has(item.key)).reduce((sum, item) => sum + item.value, 0);
          for (const item of minutes) {
            if (item.value >= 8) {
              totalFinalStamina += m.球员状态[item.key]?.体力 ?? 0;
              staminaSamples += 1;
            }
          }
        }
        games += 1;
      }
    }

    const teamGames = games * 2;
    const metrics = {
      games,
      pace: totalPace / games,
      scorePerTeam: totalScore / games,
      threeRate: totalThreeA / Math.max(1, totalFga),
      ftr: totalFta / Math.max(1, totalFga),
      tovPerTeam: totalTov / teamGames,
      orebPerTeam: totalOreb / teamGames,
      benchMinutes: totalBenchMinutes / teamGames,
      topPlayerMinutes: totalTopMinutes / teamGames,
      finalStamina: totalFinalStamina / Math.max(1, staminaSamples),
    };
    console.info('[nba2k full-game audit]', metrics);

    expect(metrics.pace).toBeGreaterThan(82);
    expect(metrics.pace).toBeLessThan(112);
    expect(metrics.scorePerTeam).toBeGreaterThan(86);
    expect(metrics.scorePerTeam).toBeLessThan(122);
    expect(metrics.threeRate).toBeGreaterThan(.22);
    expect(metrics.threeRate).toBeLessThan(.44);
    expect(metrics.ftr).toBeGreaterThan(.16);
    expect(metrics.ftr).toBeLessThan(.38);
    expect(metrics.tovPerTeam).toBeGreaterThan(8);
    expect(metrics.tovPerTeam).toBeLessThan(19);
    expect(metrics.orebPerTeam).toBeGreaterThan(5);
    expect(metrics.orebPerTeam).toBeLessThan(15);
    expect(metrics.benchMinutes).toBeGreaterThan(45);
    expect(metrics.benchMinutes).toBeLessThan(105);
    expect(metrics.topPlayerMinutes).toBeGreaterThan(30);
    expect(metrics.topPlayerMinutes).toBeLessThan(41);
    expect(metrics.finalStamina).toBeGreaterThan(45);
    expect(metrics.finalStamina).toBeLessThan(92);
  }, 30_000);
});
