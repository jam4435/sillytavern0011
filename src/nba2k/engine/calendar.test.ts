import { describe, expect, it } from 'vitest';
import { TEAMS } from '../data/teams';
import { daysBetweenGames, getLeagueCalendar, getTeamRestDays, seasonOpeningDate, seasonFinaleDate } from './calendar';
import { getScheduledGame } from './season';

describe('全联盟正式赛程生成器', () => {
  for (const year of [0, 1, 4, 9]) {
    it(`第${year}个赛季：1230场 / 每队82场41主41客 / 合法交手分配`, () => {
      const schedule = getLeagueCalendar(year);
      expect(schedule.games).toHaveLength(1230);
      const teams = new Map(TEAMS.map(team => [team.id, team]));
      const byPair = new Map<string, { games: number; homeA: number; homeB: number }>();
      expect(schedule.games[0].date >= seasonOpeningDate(year)).toBe(true);
      expect(schedule.games.at(-1)!.date <= seasonFinaleDate(year)).toBe(true);
      for (const game of schedule.games) {
        expect(game.home).not.toBe(game.away);
        expect(teams.has(game.home)).toBe(true);
        expect(teams.has(game.away)).toBe(true);
        const [a, b] = [game.home, game.away].sort();
        const key = `${a}:${b}`;
        const record = byPair.get(key) ?? { games: 0, homeA: 0, homeB: 0 };
        record.games++;
        if (game.home === a) record.homeA++;
        else record.homeB++;
        byPair.set(key, record);
      }
      expect(byPair.size).toBe(435);
      for (const [key, played] of byPair) {
        const [a, b] = key.split(':');
        const ta = teams.get(a)!, tb = teams.get(b)!;
        const sameConf = ta.conference === tb.conference;
        const sameDivision = ta.division === tb.division && sameConf;
        if (!sameConf) {
          expect(played).toEqual({ games: 2, homeA: 1, homeB: 1 });
        } else if (sameDivision) {
          expect(played).toEqual({ games: 4, homeA: 2, homeB: 2 });
        } else {
          expect([3, 4]).toContain(played.games);
          expect(Math.abs(played.homeA - played.homeB)).toBeLessThanOrEqual(1);
        }
      }
      for (const team of TEAMS) {
        const games = schedule.byTeam[team.id];
        expect(games).toHaveLength(82);
        expect(games.filter(game => game.home === team.id)).toHaveLength(41);
        expect(games.filter(game => game.away === team.id)).toHaveLength(41);
        const dates = games.map(game => game.date);
        expect(new Set(dates).size).toBe(82);
        expect(dates).toEqual([...dates].sort());
        for (let i = 0; i < games.length; i++) {
          const fixture = getScheduledGame(team.id, i, year)!;
          expect(fixture.date).toBe(games[i].date);
          expect(fixture.home).toBe(games[i].home);
          expect(fixture.away).toBe(games[i].away);
          expect(fixture.opponent).toBe(games[i].home === team.id ? games[i].away : games[i].home);
          expect(getTeamRestDays(team.id, games[i].date, year)).toBe(
            i > 0 ? daysBetweenGames(games[i - 1].date, games[i].date) : null,
          );
        }
        const thisConference = TEAMS.filter(opponent => opponent.conference === team.conference &&
          opponent.division !== team.division);
        const shortOpponents = thisConference.filter(opponent =>
          games.filter(game => game.home === opponent.id || game.away === opponent.id).length === 3);
        expect(shortOpponents).toHaveLength(4);
      }
    });
  }

  it('多年游戏不同年份会生成新的可重算赛历、没有同一天一队双赛', () => {
    const current = getLeagueCalendar(0);
    const again = getLeagueCalendar(0);
    const future = getLeagueCalendar(1);
    expect(current).toBe(again);
    expect(current.byTeam.GSW.map(x => x.home + x.away)).not.toEqual(future.byTeam.GSW.map(x => x.home + x.away));
    expect(getScheduledGame('GSW', 82, 0)).toBeNull();
  });

  it('赛季各队具有独立比赛日期而非30队同日循环，赛程包含背靠背与连续休息日', () => {
    const calendar = getLeagueCalendar(0);
    const fixtures = calendar.byTeam.GSW;
    const rests = fixtures.slice(1).map((game, index) =>
      daysBetweenGames(fixtures[index].date, game.date)!);
    const backToBack = rests.filter(days => days === 0).length;
    const daysOff = rests.filter(days => days >= 2).length;
    console.info('[NBA2K generated calendar audit]', {
      gswBackToBack: backToBack, multiDayRests: daysOff,
      firstDayGames: calendar.games.filter(game => game.date === seasonOpeningDate(0)).length,
      lastDayGames: calendar.games.filter(game => game.date === seasonFinaleDate(0)).length,
    });
    expect(calendar.games.filter(game => game.date === seasonOpeningDate(0))).toHaveLength(3);
    expect(backToBack).toBeGreaterThan(0);
    expect(backToBack).toBeLessThan(35);
    expect(daysOff).toBeGreaterThan(0);
    expect(calendar.games.some(game => !fixtures.some(fixture => fixture.date === game.date))).toBe(true);
  });
});
