import { describe, expect, it } from 'vitest';
import { leagueStateSchema } from '../schema';
import { getPlayerForLeague } from '../utils/rosters';
import { careerLeaders, playerCareerAchievements, sealChampionshipHistory, sealRegularSeasonHistory } from './history';
import { emptyPlayerSeasonTotals } from './leagueStats';
import {
  advanceLeagueAfterGame, beginNextSeason, createLeagueState,
  createPlayoffState, getScheduledGame, type LeagueState,
} from './season';
import type { MatchState } from './types';

function completedMatch(home: string, away: string, winner: string): MatchState {
  const winHome = home === winner;
  return {
    进行中: false, 对阵: { 主队: home, 客队: away },
    节次: 4, 剩余秒数: 0, 投篮时钟: 0, 比分: winHome ? { 主: 120, 客: 110 } : { 主: 110, 客: 120 },
    球权: '主', 跳球胜方: '主',
    战术: {
      主: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' },
      客: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' },
    },
    站位: { 主: [], 客: [] }, 本节球队犯规: { 主: 0, 客: 0 }, 暂停: { 主: 0, 客: 0 },
    阵容: { 主: { 场上: [], 替补: [] }, 客: { 场上: [], 替补: [] } },
    回合阶段: '死球', 待处理情境: { type: 'deadBall', reason: '结束', inboundSide: '主' },
    回合情境: '比赛结束', 球员状态: {}, 回合摘要: '终场',
  };
}

function seasonLabel(offset: number): string {
  return `${2015 + offset}-${String((2016 + offset) % 100).padStart(2, '0')}`;
}
describe('All-time archive and milestones', () => {
  it('赛季结算仅计入一次，同一球员跨赛季累计，交易不拆人且不累积重算', () => {
    let league = createLeagueState('GSW');
    league.球员赛季统计 = {
      'Stephen Curry': { ...emptyPlayerSeasonTotals('GSW'), gp: 81, min: 2800,
        pts: 2100, reb: 350, ast: 650, fgm: 710, fga: 1300, threePm: 300, threePa: 700 },
      'Tim Duncan': { ...emptyPlayerSeasonTotals('SAS'), gp: 64, min: 1800,
        pts: 950, reb: 680, ast: 220, fgm: 430, fga: 780 },
    };
    const sealed = sealRegularSeasonHistory(league);
    expect(sealRegularSeasonHistory(sealed)).toBe(sealed);
    expect(sealed.历史档案.career['Stephen Curry'].pts).toBe(2100);
    expect(sealed.历史档案.career['Tim Duncan'].reb).toBe(680);
    expect(sealed.历史档案.career['Stephen Curry'].seasons).toBe(1);
    expect(sealed.历史档案.milestones.some(row => row.playerKey === 'Stephen Curry'
      && row.category === 'pts' && row.threshold === 1000)).toBe(true);

    league = beginNextSeason({ ...sealed, 阶段: '休赛期' }, 'GSW').league;
    expect(league.球员赛季统计).toEqual({});
    league.球员赛季统计 = {
      'Stephen Curry': { ...emptyPlayerSeasonTotals('BOS'), gp: 77, min: 2700,
        pts: 1900, reb: 290, ast: 710, fgm: 650, fga: 1200, threePm: 250, threePa: 620 },
    };
    const next = sealRegularSeasonHistory(league);
    const curry = next.历史档案.career['Stephen Curry'];
    expect(curry.pts).toBe(4000);
    expect(curry.ast).toBe(1360);
    expect(curry.gp).toBe(158);
    expect(curry.teamId).toBe('BOS');
    expect(curry.seasons).toBe(2);
    expect(curry.firstSeason).toBe('2015-16');
    expect(curry.lastSeason).toBe('2016-17');
    expect(next.历史档案.milestones.filter(item => item.playerKey === 'Stephen Curry'
      && item.category === 'pts' && item.threshold === 1000)).toHaveLength(1);
    expect(leagueStateSchema.safeParse(next).success).toBe(true);
  });

  it('赛季最高场均保持跨年份纪录，低出场样本不误刷历史榜', () => {
    let league = createLeagueState('GSW');
    league.球员赛季统计 = {
      A: { ...emptyPlayerSeasonTotals('GSW'), gp: 70, pts: 2100, ast: 500 },
      B: { ...emptyPlayerSeasonTotals('BOS'), gp: 29, pts: 1600, ast: 100 },
    };
    league = sealRegularSeasonHistory(league);
    expect(league.历史档案.records.pts?.playerKey).toBe('A');
    league = { ...league, 赛季: '2016-17', 赛季序号: 1,
      球员赛季统计: { B: { ...emptyPlayerSeasonTotals('CLE'), gp: 65, pts: 2080, ast: 440 } } };
    league = sealRegularSeasonHistory(league);
    expect(league.历史档案.records.pts).toEqual({
      season: '2016-17', playerKey: 'B', teamId: 'CLE', gp: 65, total: 2080,
    });
    expect(careerLeaders(league.历史档案, 'pts')[0]).toMatchObject({ playerKey: 'B', total: 3680 });
  });

  it('退役球员仍保留所有生涯统计，且30个赛季不会扩展逐场历史日志', () => {
    let league = createLeagueState('GSW');
    for (let offset = 0; offset < 30; offset++) {
      league = {
        ...league, 赛季: seasonLabel(offset), 赛季序号: offset,
        球员赛季统计: {
          'Tim Duncan': { ...emptyPlayerSeasonTotals('SAS'), gp: 60, pts: 1000, reb: 700, ast: 240 },
          'Future Player': { ...emptyPlayerSeasonTotals('GSW'), gp: 72, pts: 2100, reb: 400, ast: 350 },
        },
      };
      league = sealRegularSeasonHistory(league);
    }
    expect(league.历史档案.career['Tim Duncan'].seasons).toBe(30);
    expect(league.历史档案.career['Tim Duncan'].pts).toBe(30000);
    expect(getPlayerForLeague('Tim Duncan', league)).toBeUndefined();
    expect(careerLeaders(league.历史档案, 'pts')[1].playerKey).toBe('Tim Duncan');
    expect(league.历史档案.milestones.length).toBeLessThanOrEqual(240);
    expect(Object.keys(league.历史档案.career)).toHaveLength(2);
    expect(leagueStateSchema.safeParse(league).success).toBe(true);
  });

  it('总冠军存档按赛季去重且可以连续储存25年；荣誉从正式奖项列表派生', () => {
    let league = createLeagueState('GSW');
    for (let offset = 0; offset < 25; offset++) {
      league = { ...league, 赛季: seasonLabel(offset), 赛季序号: offset };
      league = sealChampionshipHistory(league, 'GSW', 'CLE');
      expect(sealChampionshipHistory(league, 'CLE', 'GSW')).toBe(league);
    }
    expect(league.历史档案.championships).toHaveLength(25);
    league.奖项记录 = [
      { season: '2015-16', mvp: 'Stephen Curry', rookie: null, dpoy: null,
        allNBA: [['Stephen Curry']], allDefense: [] },
      { season: '2016-17', mvp: 'Stephen Curry', rookie: null, dpoy: 'Stephen Curry',
        allNBA: [['Stephen Curry']], allDefense: [['Stephen Curry']] },
    ];
    const achievements = playerCareerAchievements(league.历史档案, league.奖项记录, 'Stephen Curry');
    expect(achievements).toMatchObject({ mvp: 2, dpoy: 1, allNBA: 2, allDefense: 1 });
    expect(leagueStateSchema.safeParse(league).success).toBe(true);
  });

  it('主角在总决赛赢球，冠军实际由4胜系列赛封存', () => {
    const league = createLeagueState('GSW');
    league.阶段 = '季后赛';
    league.季后赛 = {
      round: '总决赛', series: [{
        id: '2016-Finals', round: '总决赛', conference: 'Finals',
        teamA: 'GSW', teamB: 'CLE', seedA: 1, seedB: 1, winsA: 3, winsB: 2,
      }], champion: null,
    };
    const next = advanceLeagueAfterGame(league, 'GSW',
      completedMatch('GSW', 'CLE', 'GSW'), () => .5).league;
    expect(next.阶段).toBe('休赛期');
    expect(next.季后赛?.champion).toBe('GSW');
    expect(next.历史档案.championships).toEqual([
      { season: '2015-16', champion: 'GSW', runnerUp: 'CLE' },
    ]);
  });

  it('主角总决赛失败、或常规赛无缘季后赛时，后台均要决出正式冠军', () => {
    const eliminated = createLeagueState('GSW');
    eliminated.阶段 = '季后赛';
    eliminated.季后赛 = {
      round: '总决赛', series: [{
        id: '2016-Finals', round: '总决赛', conference: 'Finals',
        teamA: 'GSW', teamB: 'CLE', seedA: 1, seedB: 1, winsA: 2, winsB: 3,
      }], champion: null,
    };
    const lost = advanceLeagueAfterGame(eliminated, 'GSW',
      completedMatch('GSW', 'CLE', 'CLE'), () => .5).league;
    expect(lost.季后赛?.champion).toBe('CLE');
    expect(lost.历史档案.championships).toHaveLength(1);

    const league = createLeagueState('GSW');
    league.赛程索引 = 81;
    const last = getScheduledGame('GSW', 81)!;
    league.日期 = last.date;
    for (const [team, row] of Object.entries(league.战绩)) {
      league.战绩[team] = { ...row, 胜: team === 'GSW' ? 0 : 40, 负: team === 'GSW' ? 81 : 41 };
    }
    const opponent = last.home === 'GSW' ? last.away : last.home;
    const missed = advanceLeagueAfterGame(league, 'GSW',
      completedMatch(last.home, last.away, opponent), () => .5).league;
    expect(missed.阶段).toBe('休赛期');
    expect(missed.季后赛?.champion).toBeTruthy();
    expect(missed.历史档案.championships).toHaveLength(1);
    expect(leagueStateSchema.safeParse(missed).success).toBe(true);
  });
});
