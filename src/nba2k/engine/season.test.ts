import { describe, expect, it } from 'vitest';
import { advanceLeagueAfterGame, beginNextSeason, createLeagueState, getScheduledGame, scheduleDate } from './season';
import type { MatchState } from './types';
import { buildLeagueRosterSnapshot } from '../utils/rosters';
import { buildLeagueSimulationProfiles } from './teamPower';
import { getLeagueCalendar } from './calendar';

function finishedMatch(): MatchState {
  const scheduled = getScheduledGame('GSW', 0)!;
  return {
    进行中: false, 对阵: { 主队: scheduled.home, 客队: scheduled.away }, 节次: 4, 剩余秒数: 0, 投篮时钟: 0,
    比分: scheduled.home === 'GSW' ? { 主: 112, 客: 104 } : { 主: 104, 客: 112 }, 球权: '客', 跳球胜方: '主',
    战术: {
      主: { offense: '动态进攻', defense: '换防', pace: '快', helpIntensity: 60, rebound: '均衡' },
      客: { offense: '四外一内', defense: '人盯人', pace: '标准', helpIntensity: 55, rebound: '均衡' },
    },
    站位: { 主: [], 客: [] }, 本节球队犯规: { 主: 2, 客: 3 }, 暂停: { 主: 2, 客: 1 },
    阵容: { 主: { 场上: [], 替补: [] }, 客: { 场上: [], 替补: [] } },
    回合阶段: '死球', 待处理情境: { type: 'deadBall', reason: '比赛结束', inboundSide: '客' },
    回合情境: '比赛结束', 球员状态: {}, 回合摘要: '比赛结束',
  };
}

describe('SeasonEngine', () => {
  it('同一球队的简化赛历固定可重算并覆盖常规赛时间范围', () => {
    expect(getScheduledGame('GSW', 0)).toEqual(getScheduledGame('GSW', 0));
    expect(scheduleDate(0)).toBe(getScheduledGame('GSW', 0)?.date);
    expect(scheduleDate(81)).toBe(getScheduledGame('GSW', 81)?.date);
    expect(scheduleDate(0, 1)).toBe(getScheduledGame('GSW', 0, 1)?.date);
    expect(scheduleDate(81, 1)).toBe(getScheduledGame('GSW', 81, 1)?.date);
    expect(getScheduledGame('GSW', 82)).toBeNull();
  });

  it('比赛结束会更新联盟战绩并推进下一场', () => {
    const league = createLeagueState('GSW');
    const tenureBefore = league.教练.GSW.tenureGames;
    const result = advanceLeagueAfterGame(league, 'GSW', finishedMatch(), () => .5);
    expect(result.league.战绩.GSW.胜).toBe(1);
    expect(result.league.教练.GSW.tenureGames).toBe(tenureBefore + 1);
    expect(result.league.战绩[finishedMatch().对阵.主队 === 'GSW'
      ? finishedMatch().对阵.客队 : finishedMatch().对阵.主队].负).toBe(1);
    expect(result.league.赛程索引).toBe(1);
    expect(result.nextGame?.index).toBe(1);
  });

  it('SeasonEngine根据统一日历结算后台队伍，仍然读取动态球队画像', () => {
    const league = createLeagueState('GSW');
    const snapshot = buildLeagueRosterSnapshot(league);
    const base = buildLeagueSimulationProfiles(league, snapshot.byTeam);
    const nextGame = getScheduledGame('GSW', 1)!;
    const candidate = getLeagueCalendar(0).games.find(game =>
      game.home !== 'GSW' && game.away !== 'GSW' &&
      game.date < nextGame.date)!;
    expect(candidate).toBeDefined();
    const { home, away } = candidate;
    const firstPower = {
      ...base,
      [home]: { ...base[home], offenseRating: 116, defenseRating: 100, netRating: 16, power: 93 },
      [away]: { ...base[away], offenseRating: 99, defenseRating: 113, netRating: -14, power: 68 },
    };
    const reversePower = {
      ...base,
      [home]: { ...base[home], offenseRating: 99, defenseRating: 113, netRating: -14, power: 68 },
      [away]: { ...base[away], offenseRating: 116, defenseRating: 100, netRating: 16, power: 93 },
    };
    const first = advanceLeagueAfterGame(league, 'GSW', finishedMatch(), () => .5, firstPower);
    const second = advanceLeagueAfterGame(league, 'GSW', finishedMatch(), () => .5, reversePower);
    expect(first.league.战绩[home].胜).toBeGreaterThan(second.league.战绩[home].胜);
    expect(first.league.战绩[away].胜).toBeLessThan(second.league.战绩[away].胜);
  });

  it('休赛期进入下一赛季会重置战绩并使用下一年度赛历', () => {
    const league = createLeagueState('GSW');
    league.阶段 = '休赛期';
    const next = beginNextSeason(league, 'GSW');
    expect(next.league.赛季).toBe('2016-17');
    expect(next.league.赛季序号).toBe(1);
    expect(next.league.日期).toBe(getScheduledGame('GSW', 0, 1)!.date);
    expect(next.nextGame?.index).toBe(0);
    expect(next.league.战绩.GSW.胜).toBe(0);
  });

  it('第82场结束后按排名生成七场四胜季后赛首轮', () => {
    const league = createLeagueState('GSW');
    league.赛程索引 = 81;
    league.日期 = '2016-04-13';
    league.战绩.GSW = { 胜: 70, 负: 11, 得分: 9000, 失分: 8200, 连胜: 4 };
    const last = getScheduledGame('GSW', 81)!;
    const result = advanceLeagueAfterGame(league, 'GSW', {
      ...finishedMatch(), 对阵: { 主队: last.home, 客队: last.away },
    }, () => .5);
    expect(result.league.阶段).toBe('季后赛');
    expect(result.league.季后赛?.round).toBe('首轮');
    expect(result.league.季后赛?.series).toHaveLength(8);
    expect(result.nextGame?.stage).toBe('首轮');
    expect(result.nextGame?.opponent).toBeTruthy();
  });
});
