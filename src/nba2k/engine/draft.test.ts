import { describe, expect, it } from 'vitest';
import { beginNextSeason, createLeagueState } from './season';
import {
  draftOrder,
  generateDraftClass,
  playerFromGeneratedSeed,
  projectGeneratedPlayer,
  runAnnualDraft,
} from './draft';
import { getAllPlayersForLeague, getPlayerForLeague, getRosterForLeague } from '../utils/rosters';
import { prepareOffseasonMarket } from './transactions';
import { TEAMS } from '../data/teams';

describe('procedural rookie draft', () => {
  it('每届确定性生成60名唯一新秀，包含身体、位置、模板、潜力与43项初始能力', () => {
    const first = generateDraftClass(0);
    const second = generateDraftClass(0);
    expect(first).toEqual(second);
    expect(first).toHaveLength(60);
    expect(new Set(first.map(seed => seed.key)).size).toBe(60);
    expect(new Set(first.map(seed => seed.displayName)).size).toBe(60);

    const players = first.map(playerFromGeneratedSeed);
    expect(players.every(player => Object.keys(player.attrs).length === 43)).toBe(true);
    expect(Math.min(...players.map(player => player.overall))).toBeGreaterThanOrEqual(64);
    expect(Math.max(...players.map(player => player.overall))).toBeLessThanOrEqual(82);
    expect(Math.min(...first.map(seed => seed.potential))).toBeGreaterThanOrEqual(72);
    expect(Math.max(...first.map(seed => seed.potential))).toBeLessThanOrEqual(97);
    expect(first.every(seed => !('attrs' in (seed as unknown as Record<string, unknown>)))).toBe(true);
  });

  it('选秀顺位按战绩倒序，弱队先于强队', () => {
    const league = createLeagueState('GSW');
    for (const team of TEAMS) {
      league.战绩[team.id] = { 胜: 41, 负: 41, 得分: 8200, 失分: 8200, 连胜: 0 };
    }
    league.战绩.PHI = { 胜: 10, 负: 72, 得分: 7600, 失分: 8600, 连胜: -5 };
    league.战绩.GSW = { 胜: 72, 负: 10, 得分: 9000, 失分: 7900, 连胜: 6 };
    const order = draftOrder(league);
    expect(order[0]).toBe('PHI');
    expect(order.at(-1)).toBe('GSW');
  });

  it('两轮共60签，30队各两签，并给新秀写归属与新秀合同', () => {
    const league = createLeagueState('GSW');
    league.阶段 = '休赛期';
    for (const team of TEAMS) {
      const seed = team.id.charCodeAt(0) + team.id.charCodeAt(team.id.length - 1);
      const wins = 15 + seed % 53;
      league.战绩[team.id] = { 胜: wins, 负: 82 - wins, 得分: 8000 + wins * 10, 失分: 8500 - wins * 5, 连胜: 0 };
    }

    const result = runAnnualDraft(league, getRosterForLeague);
    expect(result.picks).toHaveLength(60);
    for (const team of TEAMS) {
      expect(result.picks.filter(pick => pick.teamId === team.id)).toHaveLength(2);
    }
    expect(Object.keys(result.league.生成球员)).toHaveLength(60);
    for (const pick of result.picks) {
      expect(result.league.球员归属[pick.playerKey]).toBe(pick.teamId);
      const contract = result.league.合同册[pick.playerKey];
      expect(contract?.teamId).toBe(pick.teamId);
      expect(contract?.years).toBe(pick.round === 1 ? 4 : 2);
      expect(contract?.annualSalary).toBeGreaterThan(0);
    }

    const again = runAnnualDraft(result.league, getRosterForLeague);
    expect(again.league.选秀历史).toHaveLength(60);
    expect(again.picks).toEqual(result.picks);
  });

  it('选秀后接自由市场会把所有球队收敛到15人上限以内', () => {
    let league = createLeagueState('GSW');
    league.阶段 = '休赛期';
    for (const [index, team] of TEAMS.entries()) {
      const wins = 18 + (index * 7) % 48;
      league.战绩[team.id] = { 胜: wins, 负: 82 - wins, 得分: 7900 + wins * 9, 失分: 8500 - wins * 4, 连胜: 0 };
    }
    const drafted = runAnnualDraft(league, getRosterForLeague);
    const market = prepareOffseasonMarket(
      drafted.league,
      'Stephen Curry',
      getPlayerForLeague,
      getRosterForLeague,
      getAllPlayersForLeague,
    );
    const sizes = Object.fromEntries(TEAMS.map(team => [team.id, getRosterForLeague(team.id, market.league).length]));
    console.info('[nba2k post-draft roster sizes]', sizes);
    expect(Math.max(...Object.values(sizes))).toBeLessThanOrEqual(15);
    expect(Object.values(sizes).filter(size => size >= 12).length).toBeGreaterThanOrEqual(25);
  });

  it('连续5届选秀能持续补充联盟人口，不会重复生成同届或把Roster无限撑大', () => {
    let league = createLeagueState('GSW');
    for (let season = 0; season < 5; season++) {
      league.阶段 = '休赛期';
      for (const [index, team] of TEAMS.entries()) {
        const wins = 15 + (index * 11 + season * 5) % 54;
        league.战绩[team.id] = { 胜: wins, 负: 82 - wins, 得分: 7800 + wins * 10, 失分: 8600 - wins * 5, 连胜: 0 };
      }
      const drafted = runAnnualDraft(league, getRosterForLeague);
      const market = prepareOffseasonMarket(
        drafted.league,
        'Stephen Curry',
        getPlayerForLeague,
        getRosterForLeague,
        getAllPlayersForLeague,
      );
      league = beginNextSeason(market.league, 'GSW').league;
      expect(Math.max(...TEAMS.map(team => getRosterForLeague(team.id, league).length))).toBeLessThanOrEqual(15);
    }
    expect(Object.keys(league.生成球员)).toHaveLength(300);
    expect(league.选秀历史).toHaveLength(300);
    const activeRosterPlayers = TEAMS.reduce((sum, team) => sum + getRosterForLeague(team.id, league).length, 0);
    console.info('[nba2k five-season roster population]', activeRosterPlayers);
    expect(activeRosterPlayers).toBeGreaterThanOrEqual(330);
    expect(activeRosterPlayers).toBeLessThanOrEqual(450);
  });

  it('新秀进入下一赛季真实Roster，并按已知年龄而不是历史年龄估算器成长', () => {
    let league = createLeagueState('GSW');
    league.阶段 = '休赛期';
    const drafted = runAnnualDraft(league, getRosterForLeague);
    const firstPick = drafted.picks[0];
    const seed = drafted.league.生成球员[firstPick.playerKey];
    const atDraft = projectGeneratedPlayer(seed, seed.entrySeason);
    expect(atDraft.age).toBe(seed.ageAtEntry);

    const next = beginNextSeason(drafted.league, 'GSW').league;
    const player = getPlayerForLeague(firstPick.playerKey, next);
    expect(player).toBeTruthy();
    expect(getRosterForLeague(firstPick.teamId, next).some(item => item.name === firstPick.playerKey)).toBe(true);

    const yearTwo = projectGeneratedPlayer(seed, seed.entrySeason + 1);
    expect(yearTwo.age).toBe(seed.ageAtEntry + 1);
    expect(yearTwo.player.attrs.potential).toBe(seed.potential);
  });
});
