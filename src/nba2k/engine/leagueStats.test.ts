import { describe, expect, it } from 'vitest';
import { leagueStateSchema } from '../schema';
import { buildLeagueRosterSnapshot } from '../utils/rosters';
import { advanceLeagueAfterGame, beginNextSeason, createLeagueState } from './season';
import { buildLeagueSimulationProfiles } from './teamPower';
import { getScheduledGame } from './season';
import { getLeagueCalendar } from './calendar';
import { generateDraftClass, playerFromGeneratedSeed } from './draft';
import {
  addSeasonLines, decideSeasonAwards, emptyPlayerSeasonTotals, leaderboard,
  matchSeasonLines, simulateTeamSeasonLines,
} from './leagueStats';
import type { MatchState, OnCourtStatus } from './types';

function seededRng(seed = 17): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function completedMatch(index = 0): MatchState {
  const scheduled = getScheduledGame('GSW', index)!;
  const status: OnCourtStatus = {
    体力: 78, 得分: 29, 篮板: 6, 助攻: 9, 抢断: 2, 盖帽: 0, 失误: 3,
    犯规: 2, 投篮命中: 10, 投篮出手: 19, 三分命中: 5, 三分出手: 10,
    罚球命中: 4, 罚球出手: 4, 进攻篮板: 0, 防守篮板: 6, 上场秒数: 2100,
    手感: '平', 连续命中: 0, 连续打铁: 0,
  };
  return {
    进行中: false, 对阵: { 主队: scheduled.home, 客队: scheduled.away }, 节次: 4,
    剩余秒数: 0, 投篮时钟: 0, 比分: scheduled.home === 'GSW' ? { 主: 115, 客: 100 } : { 主: 100, 客: 115 },
    球权: '主', 跳球胜方: '主',
    战术: {
      主: { offense: '五外', defense: '换防', pace: '快', helpIntensity: 50, rebound: '均衡' },
      客: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' },
    },
    站位: { 主: [], 客: [] }, 本节球队犯规: { 主: 0, 客: 0 },
    暂停: { 主: 0, 客: 0 },
    阵容: scheduled.home === 'GSW'
      ? { 主: { 场上: ['Stephen Curry'], 替补: [] }, 客: { 场上: [], 替补: [] } }
      : { 主: { 场上: [], 替补: [] }, 客: { 场上: ['Stephen Curry'], 替补: [] } },
    回合阶段: '死球', 待处理情境: { type: 'deadBall', reason: '结束', inboundSide: '主' },
    回合情境: '结束', 球员状态: { 'Stephen Curry': status }, 回合摘要: '比赛结束',
  };
}

describe('league-wide season statistics and awards', () => {
  it('30队赛季账本严格通过Schema且首季为空，换季会清零但保留正式奖项记录', () => {
    const league = createLeagueState('GSW');
    expect(leagueStateSchema.safeParse(league).success).toBe(true);
    const withAwards = {
      ...league, 阶段: '休赛期' as const,
      球员赛季统计: { 'Stephen Curry': { ...emptyPlayerSeasonTotals('GSW'), gp: 82, pts: 1900 } },
      奖项记录: [{ season: league.赛季, mvp: 'Stephen Curry', rookie: null, dpoy: null,
        allNBA: [['Stephen Curry']], allDefense: [] }],
    };
    const next = beginNextSeason(withAwards, 'GSW').league;
    expect(next.球员赛季统计).toEqual({});
    expect(next.奖项记录[0].mvp).toBe('Stephen Curry');
    expect(leagueStateSchema.safeParse(next).success).toBe(true);
  });

  it('后台单场按当前可用轮换分配240分钟与准确球队得分，不让受伤者虚构出赛', () => {
    const league = createLeagueState('GSW');
    league.伤病.push({
      球员: 'Stephen Curry', 类型: '膝伤', 严重度: '严重',
      受伤日期: league.日期, 预计复出: '2016-03-01', 状态: '休战',
    });
    const snapshot = buildLeagueRosterSnapshot(league);
    const profile = buildLeagueSimulationProfiles(league, snapshot.byTeam).GSW;
    const lines = simulateTeamSeasonLines('GSW', snapshot.byTeam.GSW, league, profile, 104, seededRng());
    const values = Object.values(lines);
    expect(values).toHaveLength(profile.rotationPlayers);
    expect(lines['Stephen Curry']).toBeUndefined();
    expect(values.reduce((sum, line) => sum + line.min, 0)).toBe(240);
    expect(values.reduce((sum, line) => sum + line.pts, 0)).toBe(104);
    for (const line of values) {
      expect(line.fgm).toBeLessThanOrEqual(line.fga);
      expect(line.threePm).toBeLessThanOrEqual(line.threePa);
      expect(line.threePm).toBeLessThanOrEqual(line.fgm);
      expect(line.pts).toBe(2 * (line.fgm - line.threePm) + 3 * line.threePm + line.ftm);
      expect(line.gp).toBe(1);
    }
  });

  it('伤愈球星的可复出分钟限制在球队有足够健康轮换时应是硬上限', () => {
    const league = createLeagueState('GSW');
    league.伤病.push({
      球员: 'Stephen Curry', 类型: '膝伤', 严重度: '严重',
      受伤日期: league.日期, 预计复出: league.日期,
      状态: '可复出', 分钟限制: 20,
    });
    const snapshot = buildLeagueRosterSnapshot(league);
    const profile = buildLeagueSimulationProfiles(league, snapshot.byTeam).GSW;
    const lines = simulateTeamSeasonLines('GSW', snapshot.byTeam.GSW, league, profile, 109, seededRng(8));
    expect(lines['Stephen Curry']?.min).toBeLessThanOrEqual(20);
    expect(Object.values(lines).reduce((sum, line) => sum + line.min, 0)).toBe(240);
  });

  it('玩家比赛真实Box Score写入一次，同时后台其他28队有个人数据，不重复结算主角', () => {
    const league = createLeagueState('GSW');
    const snapshot = buildLeagueRosterSnapshot(league);
    const profiles = buildLeagueSimulationProfiles(league, snapshot.byTeam);
    const match = completedMatch();
    expect(matchSeasonLines(match)['Stephen Curry'].pts).toBe(29);
    const next = advanceLeagueAfterGame(league, 'GSW', match, seededRng(), profiles, snapshot.byTeam).league;
    const curry = next.球员赛季统计['Stephen Curry'];
    expect(curry.gp).toBe(1);
    expect(curry.pts).toBe(29);
    expect(curry.ast).toBe(9);
    expect(curry.fgm).toBe(10);
    const rival = match.对阵.主队 === 'GSW' ? match.对阵.客队 : match.对阵.主队;
    expect(next.球员赛季统计[snapshot.byTeam[rival][0].name]).toBeUndefined();
    const nextPlayerDate = getScheduledGame('GSW', 1)!.date;
    const other = getLeagueCalendar(0).games.find(game =>
      game.home !== 'GSW' && game.away !== 'GSW' && game.date < nextPlayerDate)!;
    expect(next.球员赛季统计[snapshot.byTeam[other.home][0].name]?.gp).toBeGreaterThanOrEqual(1);
    expect(leagueStateSchema.safeParse(next).success).toBe(true);
    const added = addSeasonLines(next.球员赛季统计, matchSeasonLines(match));
    expect(added['Stephen Curry'].gp).toBe(2);
    expect(added['Stephen Curry'].pts).toBe(58);
  });

  it('排名依据真实累计场均数；交易后的球员不会被拆成两名或丢失赛季成绩', () => {
    const rows = {
      A: { ...emptyPlayerSeasonTotals('GSW'), gp: 20, pts: 550, ast: 130 },
      B: { ...emptyPlayerSeasonTotals('PHI'), gp: 20, pts: 600, ast: 50 },
    };
    expect(leaderboard(rows, 'pts')[0].playerKey).toBe('B');
    const afterTrade = addSeasonLines(rows, {
      A: { ...emptyPlayerSeasonTotals('PHI'), gp: 1, pts: 40, ast: 8 },
    });
    expect(afterTrade.A.gp).toBe(21);
    expect(afterTrade.A.teamId).toBe('PHI');
    expect(afterTrade.A.pts).toBe(590);
    expect(leaderboard(afterTrade, 'ast')[0].playerKey).toBe('A');
  });

  it('未来新秀只在自己的入盟首季有ROY资格，不会被高OVR老球员冒领', () => {
    const league = createLeagueState('GSW');
    league.赛季序号 = 1;
    league.赛季 = '2016-17';
    const rookieSeed = generateDraftClass(0)[0];
    league.生成球员[rookieSeed.key] = rookieSeed;
    const rookie = { ...playerFromGeneratedSeed(rookieSeed), team: 'PHI' };
    const baseline = buildLeagueRosterSnapshot(league).byTeam;
    const rosters = { ...baseline, PHI: [...baseline.PHI, rookie] };
    for (const roster of Object.values(rosters)) {
      for (const player of roster) {
        league.球员赛季统计[player.name] = {
          ...emptyPlayerSeasonTotals(player.team), gp: 70, pts: 840, reb: 300, ast: 180,
        };
      }
    }
    league.球员赛季统计[rookie.name].pts = 2000;
    expect(decideSeasonAwards(league, rosters).rookie).toBe(rookie.name);
    league.赛季序号 = 2;
    league.赛季 = '2017-18';
    expect(decideSeasonAwards(league, rosters).rookie).toBeNull();
  });

  it('第82轮正式结算奖项并保存在联盟，进入季后赛不二次改写赛季累计', () => {
    const league = createLeagueState('GSW');
    league.赛程索引 = 81;
    league.日期 = getScheduledGame('GSW', 81)!.date;
    const snapshot = buildLeagueRosterSnapshot(league);
    for (const roster of Object.values(snapshot.byTeam)) {
      for (const player of roster) {
        league.球员赛季统计[player.name] = {
          ...emptyPlayerSeasonTotals(player.team), gp: 67, min: 1800,
          pts: player.overall * 13, reb: 310, ast: 230, stl: 65, blk: 35,
        };
      }
    }
    const profiles = buildLeagueSimulationProfiles(league, snapshot.byTeam);
    const closed = advanceLeagueAfterGame(league, 'GSW', completedMatch(81), seededRng(84), profiles, snapshot.byTeam).league;
    expect(closed.赛程索引).toBe(82);
    expect(closed.奖项记录).toHaveLength(1);
    expect(closed.奖项记录[0].season).toBe('2015-16');
    expect(closed.奖项记录[0].mvp).toBeTruthy();
    expect(closed.球员赛季统计['Stephen Curry'].gp).toBe(68);
    expect(closed.故事钩子.some(hook => hook.type === '奖项')).toBe(true);
    expect(leagueStateSchema.safeParse(closed).success).toBe(true);
  });

  it('年终按全联盟比赛数据评选MVP/DPOY/新秀并生成互不重复的最佳阵容', () => {
    const league = createLeagueState('GSW');
    const snapshot = buildLeagueRosterSnapshot(league);
    const stars = snapshot.byTeam.GSW[0];
    for (const roster of Object.values(snapshot.byTeam)) {
      for (const player of roster) {
        league.球员赛季统计[player.name] = {
          ...emptyPlayerSeasonTotals(player.team), gp: 72, min: 2100,
          pts: player.overall * 12, reb: 360, ast: 220, stl: 90, blk: 50,
        };
      }
    }
    league.球员赛季统计[stars.name].pts = 2700;
    const award = decideSeasonAwards(league, snapshot.byTeam);
    expect(award.mvp).toBe(stars.name);
    expect(award.dpoy).toBeTruthy();
    expect(award.allNBA).toHaveLength(3);
    expect(award.allDefense).toHaveLength(2);
    expect(new Set(award.allNBA.flat()).size).toBe(award.allNBA.flat().length);
    expect(new Set(award.allDefense.flat()).size).toBe(award.allDefense.flat().length);
    const draft = leagueStateSchema.safeParse({
      ...league, 奖项记录: [award],
    });
    expect(draft.success).toBe(true);
  });
});
