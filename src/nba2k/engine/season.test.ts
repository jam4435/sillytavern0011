import { describe, expect, it } from 'vitest';
import { advanceLeagueAfterGame, createLeagueState, getScheduledGame, scheduleDate } from './season';
import type { MatchState } from './types';

function finishedMatch(): MatchState {
  return {
    进行中: false, 对阵: { 主队: 'GSW', 客队: 'CLE' }, 节次: 4, 剩余秒数: 0, 投篮时钟: 0,
    比分: { 主: 112, 客: 104 }, 球权: '客', 跳球胜方: '主',
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
    expect(scheduleDate(0)).toBe('2015-10-27');
    expect(scheduleDate(81)).toBe('2016-04-13');
    expect(getScheduledGame('GSW', 82)).toBeNull();
  });

  it('比赛结束会更新联盟战绩并推进下一场', () => {
    const league = createLeagueState('GSW');
    const result = advanceLeagueAfterGame(league, 'GSW', finishedMatch(), () => .5);
    expect(result.league.战绩.GSW.胜).toBe(1);
    expect(result.league.战绩.CLE.负).toBe(1);
    expect(result.league.赛程索引).toBe(1);
    expect(result.nextGame?.index).toBe(1);
  });
});
