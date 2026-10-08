import { describe, expect, it } from 'vitest';
import { beginNextSeason, createLeagueState } from './season';
import { runAnnualDraft } from './draft';
import { prepareOffseasonMarket } from './transactions';
import { TEAMS } from '../data/teams';
import {
  buildLeagueSimulationProfiles,
  deriveTeamPowerRaw,
  simulateLowFidelityGame,
  type TeamSimulationProfile,
} from './teamPower';
import {
  buildLeagueRosterSnapshot,
  getAllPlayersForLeague,
  getPlayerForLeague,
  getRosterForLeague,
} from '../utils/rosters';

function seededRng(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function cloneProfile(profile: TeamSimulationProfile, patch: Partial<TeamSimulationProfile>): TeamSimulationProfile {
  return { ...profile, ...patch };
}

/**
 * 只用于回归压力测试的对称联盟赛历：
 * 30队循环轮转，82轮每队出赛一次，所有赛果仍走正式低精度 GameSim。
 * 第7步的生产赛程生成器上线后可改用生产赛程；不以2015固定胜场作为答案。
 */
function simulateSeasonStandings(
  profiles: Record<string, TeamSimulationProfile>,
  seed: number,
): ReturnType<typeof createLeagueState>['战绩'] {
  const teamIds = TEAMS.map(team => team.id).sort();
  const standings = Object.fromEntries(teamIds.map(id => [id, {
    胜: 0, 负: 0, 得分: 0, 失分: 0, 连胜: 0,
  }])) as ReturnType<typeof createLeagueState>['战绩'];
  const rng = seededRng(seed);
  let order = [...teamIds];
  for (let round = 0; round < 82; round++) {
    for (let i = 0; i < 15; i++) {
      const first = order[i];
      const second = order[29 - i];
      const [home, away] = (round + i) % 2 === 0 ? [first, second] : [second, first];
      const [homeScore, awayScore] = simulateLowFidelityGame(home, away, profiles, rng);
      const homeWon = homeScore > awayScore;
      const homeRow = standings[home];
      const awayRow = standings[away];
      homeRow.胜 += Number(homeWon);
      homeRow.负 += Number(!homeWon);
      homeRow.得分 += homeScore;
      homeRow.失分 += awayScore;
      awayRow.胜 += Number(!homeWon);
      awayRow.负 += Number(homeWon);
      awayRow.得分 += awayScore;
      awayRow.失分 += homeScore;
    }
    // Circle method：固定首队，其他29队旋转，不靠任何球队历史实力分组。
    order = [order[0], order[29], ...order.slice(1, 29)];
  }
  return standings;
}

describe('dynamic TeamPowerEngine', () => {
  it('首季30队全部由当前Roster生成有限的进攻/防守/节奏画像', () => {
    const league = createLeagueState('GSW');
    const snapshot = buildLeagueRosterSnapshot(league);
    const profiles = buildLeagueSimulationProfiles(league, snapshot.byTeam);

    expect(Object.keys(profiles)).toHaveLength(30);
    for (const profile of Object.values(profiles)) {
      expect(profile.offenseRating).toBeGreaterThanOrEqual(94);
      expect(profile.offenseRating).toBeLessThanOrEqual(119);
      expect(profile.defenseRating).toBeGreaterThanOrEqual(94);
      expect(profile.defenseRating).toBeLessThanOrEqual(119);
      expect(profile.pace).toBeGreaterThanOrEqual(89);
      expect(profile.pace).toBeLessThanOrEqual(103);
      expect(profile.healthyPlayers).toBeGreaterThanOrEqual(5);
    }

    const ranking = Object.values(profiles)
      .sort((a, b) => b.netRating - a.netRating)
      .map(profile => ({
        team: profile.teamId,
        net: Math.round(profile.netRating * 10) / 10,
        ortg: Math.round(profile.offenseRating * 10) / 10,
        drtg: Math.round(profile.defenseRating * 10) / 10,
        pace: Math.round(profile.pace * 10) / 10,
        power: Math.round(profile.power * 10) / 10,
      }));
    console.info('[nba2k dynamic team power 2015-16]', ranking);

    // 只做粗粒度历史校准；运行时没有球队名级强度答案。
    expect(profiles.GSW.netRating).toBeGreaterThan(0);
    expect(profiles.CLE.netRating).toBeGreaterThan(0);
    expect(profiles.SAS.netRating).toBeGreaterThan(0);
    expect(profiles.PHI.netRating).toBeLessThan(0);
    expect(profiles.LAL.netRating).toBeLessThan(0);
  });

  it('核心伤停会直接压低球队动态实力，复出无需修改任何固定球队overall', () => {
    const healthyLeague = createLeagueState('GSW');
    const healthySnapshot = buildLeagueRosterSnapshot(healthyLeague);
    const healthy = buildLeagueSimulationProfiles(healthyLeague, healthySnapshot.byTeam).GSW;

    const injuredLeague = createLeagueState('GSW');
    injuredLeague.伤病.push({
      球员: 'Stephen Curry',
      类型: '膝伤',
      严重度: '严重',
      受伤日期: injuredLeague.日期,
      预计复出: '2016-01-15',
      状态: '休战',
    });
    const injuredSnapshot = buildLeagueRosterSnapshot(injuredLeague);
    const injured = buildLeagueSimulationProfiles(injuredLeague, injuredSnapshot.byTeam).GSW;

    console.info('[nba2k Curry injury team-power delta]', {
      healthy: { power: healthy.power, ortg: healthy.offenseRating, net: healthy.netRating },
      injured: { power: injured.power, ortg: injured.offenseRating, net: injured.netRating },
    });
    expect(injured.offenseRating).toBeLessThan(healthy.offenseRating);
    expect(injured.power).toBeLessThan(healthy.power);
  });

  it('交易改变球员归属后，买卖双方实力会从新Roster重新计算', () => {
    const beforeLeague = createLeagueState('GSW');
    const beforeSnapshot = buildLeagueRosterSnapshot(beforeLeague);
    const before = buildLeagueSimulationProfiles(beforeLeague, beforeSnapshot.byTeam);

    const afterLeague = createLeagueState('GSW');
    afterLeague.球员归属['Stephen Curry'] = 'PHI';
    const afterSnapshot = buildLeagueRosterSnapshot(afterLeague);
    const after = buildLeagueSimulationProfiles(afterLeague, afterSnapshot.byTeam);

    expect(after.GSW.offenseRating).toBeLessThan(before.GSW.offenseRating);
    expect(after.GSW.power).toBeLessThan(before.GSW.power);
    expect(after.PHI.offenseRating).toBeGreaterThan(before.PHI.offenseRating);
    expect(after.PHI.power).toBeGreaterThan(before.PHI.power);
  });

  it('低精度GameSim使用动态画像：明显强队长期胜率更高，同时保留单场爆冷', () => {
    const league = createLeagueState('GSW');
    const snapshot = buildLeagueRosterSnapshot(league);
    const profiles = buildLeagueSimulationProfiles(league, snapshot.byTeam);
    const strong = profiles.GSW;
    const weak = profiles.PHI;

    // 强化差异只为了隔离验证GameSim是否真正读取画像，而不是球队ID。
    const testProfiles = {
      X: cloneProfile(strong, { teamId: 'X', offenseRating: 114, defenseRating: 101, pace: 98, netRating: 13, power: 92 }),
      Y: cloneProfile(weak, { teamId: 'Y', offenseRating: 99, defenseRating: 113, pace: 94, netRating: -14, power: 68 }),
    };
    const rng = seededRng(17);
    let strongWins = 0;
    let weakWins = 0;
    let totalPoints = 0;
    let upsets = 0;
    for (let i = 0; i < 600; i++) {
      const strongHome = i % 2 === 0;
      const [home, away] = strongHome ? ['X', 'Y'] : ['Y', 'X'];
      const [homeScore, awayScore] = simulateLowFidelityGame(home, away, testProfiles, rng);
      totalPoints += homeScore + awayScore;
      const winner = homeScore > awayScore ? home : away;
      if (winner === 'X') strongWins += 1;
      else {
        weakWins += 1;
        upsets += 1;
      }
    }

    const strongRate = strongWins / 600;
    const pointsPerTeam = totalPoints / 1200;
    console.info('[nba2k low-fi game sim]', { strongRate, weakWins, upsets, pointsPerTeam });
    expect(strongRate).toBeGreaterThan(.72);
    expect(strongRate).toBeLessThan(.99);
    expect(upsets).toBeGreaterThan(0);
    expect(pointsPerTeam).toBeGreaterThan(92);
    expect(pointsPerTeam).toBeLessThan(114);
  });

  it('球队强度函数不需要静态TeamData.overall；同一份Roster可在虚构球队ID上计算', () => {
    const league = createLeagueState('GSW');
    const snapshot = buildLeagueRosterSnapshot(league);
    const roster = snapshot.byTeam.GSW.map((player, index) => ({
      ...player,
      team: 'FUTURE',
      name: `Future Player ${index + 1}`,
      cn: `未来球员${index + 1}`,
    }));
    const futureLeague = {
      ...league,
      教练: { ...league.教练, FUTURE: league.教练.GSW },
      伤病: [],
    };
    const raw = deriveTeamPowerRaw('FUTURE', roster, futureLeague);
    expect(raw.healthyPlayers).toBe(roster.length);
    expect(raw.weightedOverall).toBeGreaterThan(60);
    expect(raw.offenseSkill).toBeGreaterThan(50);
    expect(raw.defenseSkill).toBeGreaterThan(50);
  });
  it('交易影响真实长期胜场与排名，不仅仅是TeamPower数值变化', () => {
    const original = createLeagueState('GSW');
    const afterTrade = createLeagueState('GSW');
    afterTrade.球员归属['Stephen Curry'] = 'PHI';
    const beforeProfiles = buildLeagueSimulationProfiles(original, buildLeagueRosterSnapshot(original).byTeam);
    const afterProfiles = buildLeagueSimulationProfiles(afterTrade, buildLeagueRosterSnapshot(afterTrade).byTeam);

    const tally = { beforeGSW: 0, afterGSW: 0, beforePHI: 0, afterPHI: 0 };
    // 同一批82场赛程与随机数，避免抽样波动盖过球员交易的因果效应。
    for (let sample = 0; sample < 10; sample++) {
      const seed = 4800 + sample;
      const before = simulateSeasonStandings(beforeProfiles, seed);
      const after = simulateSeasonStandings(afterProfiles, seed);
      tally.beforeGSW += before.GSW.胜;
      tally.afterGSW += after.GSW.胜;
      tally.beforePHI += before.PHI.胜;
      tally.afterPHI += after.PHI.胜;
    }
    console.info('[nba2k Curry trade 10x82-game standings]', tally);
    expect(tally.beforeGSW - tally.afterGSW).toBeGreaterThan(10);
    expect(tally.afterPHI - tally.beforePHI).toBeGreaterThan(10);
  });

  it('连续8年赛季赛果→选秀→自由市场→退役成长会重排联盟强弱', () => {
    let league = createLeagueState('GSW');
    let openingProfiles: ReturnType<typeof buildLeagueSimulationProfiles> | null = null;
    let closingProfiles: ReturnType<typeof buildLeagueSimulationProfiles> | null = null;
    const leaders: string[] = [];
    const leagueIds = TEAMS.map(team => team.id);

    for (let year = 0; year <= 8; year++) {
      const snapshot = buildLeagueRosterSnapshot(league);
      const profiles = buildLeagueSimulationProfiles(league, snapshot.byTeam);
      const standings = simulateSeasonStandings(profiles, 6900 + year);
      for (const teamId of leagueIds) {
        expect(standings[teamId].胜 + standings[teamId].负).toBe(82);
      }

      const strongest = [...leagueIds].sort((a, b) => profiles[b].netRating - profiles[a].netRating);
      leaders.push(strongest[0]);
      expect(standings[strongest[0]].胜).toBeGreaterThan(standings[strongest[29]].胜);
      if (year === 0) openingProfiles = profiles;
      if (year === 8) {
        closingProfiles = profiles;
        break;
      }

      // 用当年真实模拟胜负决定下一届选秀顺位，不能人工灌入历史名次。
      league = { ...league, 阶段: '休赛期', 战绩: standings };
      const drafted = runAnnualDraft(league, getRosterForLeague, snapshot.byTeam);
      const market = prepareOffseasonMarket(
        drafted.league,
        '__test_no_player_protagonist__',
        getPlayerForLeague,
        getRosterForLeague,
        getAllPlayersForLeague,
      );
      league = beginNextSeason(market.league, 'GSW').league;
    }

    expect(league.赛季序号).toBe(8);
    expect(Object.keys(league.生成球员)).toHaveLength(480);
    expect(league.选秀历史).toHaveLength(480);
    const latest = buildLeagueRosterSnapshot(league);
    expect(Math.max(...leagueIds.map(id => latest.byTeam[id].length))).toBeLessThanOrEqual(15);
    expect(leagueIds.flatMap(id => latest.byTeam[id]).filter(player => player.name.startsWith('Generated_')).length)
      .toBeGreaterThan(100);
    // Tim Duncan在第8年已越过44岁硬退役线；旧核心不能永久留在阵容里。
    expect(leagueIds.flatMap(id => latest.byTeam[id]).some(player => player.name === 'Tim Duncan')).toBe(false);

    const before = openingProfiles!;
    const after = closingProfiles!;
    const initialTopFive = [...leagueIds]
      .sort((a, b) => before[b].netRating - before[a].netRating)
      .slice(0, 5);
    const futureTopFive = [...leagueIds]
      .sort((a, b) => after[b].netRating - after[a].netRating)
      .slice(0, 5);
    const changedPower = leagueIds.filter(id => Math.abs(after[id].netRating - before[id].netRating) > 2);
    console.info('[nba2k 8-year power turnover]', {
      initialTopFive, futureTopFive, changedPower: changedPower.length, leaders,
      generatedActive: leagueIds.flatMap(id => latest.byTeam[id]).filter(player => player.name.startsWith('Generated_')).length,
    });
    expect(futureTopFive.some(teamId => !initialTopFive.includes(teamId))).toBe(true);
    expect(changedPower.length).toBeGreaterThanOrEqual(6);
  });

});
