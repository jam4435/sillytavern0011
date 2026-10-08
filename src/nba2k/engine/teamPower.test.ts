import { describe, expect, it } from 'vitest';
import { createLeagueState } from './season';
import {
  buildLeagueSimulationProfiles,
  deriveTeamPowerRaw,
  simulateLowFidelityGame,
  type TeamSimulationProfile,
} from './teamPower';
import { buildLeagueRosterSnapshot } from '../utils/rosters';

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
});
