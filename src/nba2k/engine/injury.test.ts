import { describe, expect, it } from 'vitest';
import { buildLeagueRosterSnapshot } from '../utils/rosters';
import { getPlayerAvailability } from './availability';
import { emptyPlayerSeasonTotals } from './leagueStats';
import { applyGameInjuries, advanceInjuryRecovery, gameInjuryRisk, type InjuryGameExposure } from './injury';
import { advanceLeagueAfterGame, beginNextSeason, createLeagueState } from './season';
import { buildLeagueSimulationProfiles } from './teamPower';
import { getLeagueCalendar } from './calendar';
import { getScheduledGame } from './season';
import type { MatchState } from './types';

function seedRng(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function dayAfter(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function finishedMatch(index = 0): MatchState {
  const scheduled = getScheduledGame('GSW', index)!;
  return {
    进行中: false, 对阵: { 主队: scheduled.home, 客队: scheduled.away },
    节次: 4, 剩余秒数: 0, 投篮时钟: 0, 比分: scheduled.home === 'GSW' ? { 主: 108, 客: 102 } : { 主: 102, 客: 108 },
    球权: '主', 跳球胜方: '主',
    战术: {
      主: { offense: '五外', defense: '换防', pace: '快', helpIntensity: 50, rebound: '均衡' },
      客: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' },
    },
    站位: { 主: [], 客: [] }, 本节球队犯规: { 主: 0, 客: 0 },
    暂停: { 主: 0, 客: 0 },
    阵容: { 主: { 场上: [], 替补: [] }, 客: { 场上: [], 替补: [] } },
    回合阶段: '死球', 待处理情境: { type: 'deadBall', reason: '结束', inboundSide: '主' },
    回合情境: '已结束', 球员状态: {}, 回合摘要: '终场',
  };
}

describe('InjuryManager', () => {
  it('耐久差、年龄高、疲劳重、出场时间过长都增加赛后受伤风险，DNP风险为0', () => {
    const baseline = { minutes: 30, durability: 80, age: 26, stamina: 85, fatigue: 78 };
    const good = gameInjuryRisk(baseline);
    expect(good).toBeGreaterThan(0);
    expect(gameInjuryRisk({ ...baseline, minutes: 0 })).toBe(0);
    expect(gameInjuryRisk({ ...baseline, minutes: 40 })).toBeGreaterThan(good);
    expect(gameInjuryRisk({ ...baseline, durability: 40 })).toBeGreaterThan(good);
    expect(gameInjuryRisk({ ...baseline, age: 37 })).toBeGreaterThan(good);
    expect(gameInjuryRisk({ ...baseline, fatigue: 15 })).toBeGreaterThan(good);
    expect(gameInjuryRisk({ ...baseline, recentAverageMinutes: 38 })).toBeGreaterThan(good);
    expect(gameInjuryRisk({ ...baseline, severeHistory: 2 })).toBeGreaterThan(good);
    expect(gameInjuryRisk({ ...baseline, recovering: true })).toBeGreaterThan(good);
    expect(gameInjuryRisk({ ...baseline, restDays: 0 })).toBeGreaterThan(
      gameInjuryRisk({ ...baseline, restDays: 2 }));
  });

  it('同一场比赛的确定性判定一致且幂等；伤停立即影响Availability与TeamPower', () => {
    const league = createLeagueState('GSW');
    const snapshot = buildLeagueRosterSnapshot(league);
    const curry = snapshot.byTeam.GSW.find(player => player.name === 'Stephen Curry')!;
    const modified = { ...curry, attrs: { ...curry.attrs, durability: 32, stamina: 35 } };
    const rosters = { ...snapshot.byTeam, GSW: snapshot.byTeam.GSW.map(p => p.name === curry.name ? modified : p) };
    const playerLine = { ...emptyPlayerSeasonTotals('GSW'), gp: 1, min: 43, pts: 30 };
    const exposure = (index: number): InjuryGameExposure => ({
      date: league.日期, gameId: `controlled-${index}`,
      lines: { 'Stephen Curry': playerLine },
      remainingStamina: { 'Stephen Curry': 9 },
    });
    let chosen: InjuryGameExposure | undefined;
    let injured = league;
    for (let i = 0; i < 1200; i++) {
      const next = applyGameInjuries(league, rosters, [exposure(i)], { key: 'Stephen Curry', age: 37 });
      if (next.伤病.length) {
        chosen = exposure(i);
        injured = next;
        break;
      }
    }
    expect(chosen).toBeDefined();
    expect(injured.伤病).toHaveLength(1);
    expect(injured.伤病[0].球员).toBe('Stephen Curry');
    expect(injured.伤病[0].状态).toBe('休战');
    expect(getPlayerAvailability('Stephen Curry', injured).available).toBe(false);
    expect(applyGameInjuries(league, rosters, [chosen!], { key: 'Stephen Curry', age: 37 })).toEqual(injured);
    expect(applyGameInjuries(injured, rosters, [chosen!], { key: 'Stephen Curry', age: 37 })).toEqual(injured);
    const before = buildLeagueSimulationProfiles(league, rosters).GSW;
    const after = buildLeagueSimulationProfiles(injured, rosters).GSW;
    expect(after.offenseRating).toBeLessThan(before.offenseRating);
  });

  it('伤后日期未到不可上场；预计复出时逐步限时，几个月后不残留限制', () => {
    const initial = createLeagueState('GSW');
    const injury = {
      球员: 'Stephen Curry', 类型: '膝部韧带重伤', 严重度: '严重' as const,
      受伤日期: initial.日期, 预计复出: dayAfter(initial.日期, 60),
      状态: '休战' as const,
    };
    let league = { ...initial, 伤病: [injury] };
    league = advanceInjuryRecovery(league);
    expect(league.伤病[0].状态).toBe('恢复中');
    expect(getPlayerAvailability('Stephen Curry', league).available).toBe(false);

    league = advanceInjuryRecovery({ ...league, 日期: injury.预计复出 });
    expect(league.伤病[0].状态).toBe('可复出');
    expect(getPlayerAvailability('Stephen Curry', league).minuteLimit).toBe(18);
    const unchanged = advanceInjuryRecovery(league);
    expect(unchanged.伤病[0].分钟限制).toBe(18);

    league = advanceInjuryRecovery({ ...league, 日期: dayAfter(injury.预计复出, 12) });
    expect(getPlayerAvailability('Stephen Curry', league).minuteLimit).toBe(34);
    league = advanceInjuryRecovery({ ...league, 日期: dayAfter(injury.预计复出, 18) });
    expect(getPlayerAvailability('Stephen Curry', league).minuteLimit).toBeNull();
    expect(league.故事钩子.filter(hook => hook.id === `injury-return-Stephen Curry-${injury.预计复出}`))
      .toHaveLength(1);
  });

  it('跨整个休赛期进入新年会自动结算已过期的旧伤', () => {
    const league = createLeagueState('GSW');
    league.阶段 = '休赛期';
    league.日期 = '2016-04-23';
    league.伤病 = [{
      球员: 'Stephen Curry', 类型: '踝关节损伤', 严重度: '中等',
      受伤日期: '2016-04-20', 预计复出: '2016-05-20', 状态: '休战',
    }];
    const next = beginNextSeason(league, 'GSW').league;
    expect(next.日期).toBe(getScheduledGame('GSW', 0, 1)!.date);
    expect(getPlayerAvailability('Stephen Curry', next).available).toBe(true);
    expect(getPlayerAvailability('Stephen Curry', next).minuteLimit).toBeNull();
  });

  it('后台全联盟连续24轮自然产生伤病；复诊前不再让伤员重复参加比赛', () => {
    let league = createLeagueState('GSW');
    const injured = new Set<string>();
    for (let round = 0; round < 24; round++) {
      const snapshot = buildLeagueRosterSnapshot(league);
      const profiles = buildLeagueSimulationProfiles(league, snapshot.byTeam);
      const next = advanceLeagueAfterGame(
        league, 'GSW', finishedMatch(round), seedRng(2300 + round), profiles, snapshot.byTeam,
      ).league;
      expect(next.赛程索引).toBe(round + 1);
      for (const injury of next.伤病) injured.add(injury.球员);
      league = advanceInjuryRecovery(next);
    }
    console.info('[nba2k 24-round natural injury audit]', {
      injuries: league.伤病.length, players: injured.size, missedGames: Object.values(league.球员赛季统计)
        .filter(line => line.gp < league.赛程索引).length,
    });
    expect(injured.size).toBeGreaterThan(0);
    expect(injured.size).toBeLessThan(50);
    expect(Object.values(league.球员赛季统计).some(line => line.gp < 24)).toBe(true);
    // 回合产生的新伤病只影响未来轮次，赛果和赛季统计仍正常推进。
    const atlGamesSoFar = getLeagueCalendar(0).byTeam.ATL
      .filter(game => game.date < league.日期).length;
    expect(league.战绩.ATL.胜 + league.战绩.ATL.负).toBe(atlGamesSoFar);
  });
});
