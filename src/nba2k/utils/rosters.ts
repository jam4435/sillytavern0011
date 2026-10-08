import { PLAYERS } from '../data/players';
import { TEAMS } from '../data/teams';
import type { PlayerData, Position, TeamData } from '../engine/types';
import { adaptLegacyPlayer } from '../engine/playerAdapter';
import { projectLeaguePlayer } from '../engine/lifecycle';
import { currentTeamOf } from '../engine/transactions';
import { projectGeneratedPlayer } from '../engine/draft';
import type { LeagueState } from '../engine/season';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** 运行时注册的自定义球员（来自 stat_data.生涯.自定义球员） */
const customPlayers = new Map<string, PlayerData>();
const players: PlayerData[] = PLAYERS.map(adaptLegacyPlayer);

export function registerCustomPlayer(p: PlayerData): void {
  customPlayers.set(p.name, p);
}

export function getTeam(id: string): TeamData | undefined {
  return TEAMS.find(t => t.id === id);
}

export function getRoster(teamId: string): PlayerData[] {
  const custom = [...customPlayers.values()].filter(p => p.team === teamId);
  const customKeys = new Set(custom.map(player => player.name));
  return [...players.filter(p => p.team === teamId && !customKeys.has(p.name)), ...custom].sort(
    (a, b) => b.overall - a.overall,
  );
}

export function getBasePlayer(key: string): PlayerData | undefined {
  return players.find(p => p.name === key);
}

export function getPlayer(key: string): PlayerData | undefined {
  return customPlayers.get(key) ?? getBasePlayer(key);
}

function severeInjuryCount(league: LeagueState | null | undefined, playerKey: string): number {
  return league?.伤病.filter(item => item.球员 === playerKey && item.严重度 === '严重').length ?? 0;
}

export function getPlayerForLeague(
  key: string,
  league: LeagueState | null | undefined,
): PlayerData | undefined {
  const custom = customPlayers.get(key);
  if (custom) {
    if (!league) return custom;
    const team = currentTeamOf(custom, league);
    return { ...custom, team: team ?? 'FA' };
  }
  const generated = league?.生成球员?.[key];
  if (generated && league) {
    const projected = projectGeneratedPlayer(
      generated,
      league.赛季序号,
      severeInjuryCount(league, key),
    );
    if (projected.retirementStatus === '退役') return undefined;
    const team = currentTeamOf(projected.player, league);
    return { ...projected.player, team: team ?? 'FA' };
  }
  const base = getBasePlayer(key);
  if (!base || !league) return base;
  const projected = projectLeaguePlayer(base, league.赛季序号 ?? 0, severeInjuryCount(league, key));
  if (projected.retirementStatus === '退役') return undefined;
  const team = currentTeamOf(projected.player, league);
  return { ...projected.player, team: team ?? 'FA' };
}

export function getRosterForLeague(
  teamId: string,
  league: LeagueState | null | undefined,
): PlayerData[] {
  if (!league) return getRoster(teamId);
  const custom = [...customPlayers.values()];
  const customKeys = new Set(custom.map(player => player.name));
  const projectedBase = players
    .filter(player => !customKeys.has(player.name))
    .map(player => {
      const projected = projectLeaguePlayer(
        player,
        league.赛季序号 ?? 0,
        severeInjuryCount(league, player.name),
      );
      if (projected.retirementStatus === '退役') return null;
      const currentTeam = currentTeamOf(projected.player, league);
      return currentTeam === teamId ? { ...projected.player, team: teamId } : null;
    })
    .filter((player): player is PlayerData => Boolean(player));
  const currentCustom = custom
    .map(player => {
      const currentTeam = currentTeamOf(player, league);
      return currentTeam === teamId ? { ...player, team: teamId } : null;
    })
    .filter((player): player is PlayerData => Boolean(player));
  const generated = Object.values(league.生成球员 ?? {})
    .map(seed => {
      const projected = projectGeneratedPlayer(
        seed,
        league.赛季序号,
        severeInjuryCount(league, seed.key),
      );
      if (projected.retirementStatus === '退役') return null;
      const currentTeam = currentTeamOf(projected.player, league);
      return currentTeam === teamId ? { ...projected.player, team: teamId } : null;
    })
    .filter((player): player is PlayerData => Boolean(player));
  return [...projectedBase, ...generated, ...currentCustom].sort((a, b) => b.overall - a.overall);
}

export function getAllPlayersForLeague(
  league: LeagueState | null | undefined,
): PlayerData[] {
  if (!league) return [...players, ...customPlayers.values()];
  const custom = [...customPlayers.values()];
  const customKeys = new Set(custom.map(player => player.name));
  const projectedBase = players
    .filter(player => !customKeys.has(player.name))
    .map(player => {
      const projected = projectLeaguePlayer(
        player,
        league.赛季序号 ?? 0,
        severeInjuryCount(league, player.name),
      );
      if (projected.retirementStatus === '退役') return null;
      const currentTeam = currentTeamOf(projected.player, league);
      return { ...projected.player, team: currentTeam ?? 'FA' };
    })
    .filter((player): player is PlayerData => Boolean(player));
  const projectedGenerated = Object.values(league.生成球员 ?? {})
    .map(seed => {
      const projected = projectGeneratedPlayer(
        seed,
        league.赛季序号,
        severeInjuryCount(league, seed.key),
      );
      if (projected.retirementStatus === '退役') return null;
      const currentTeam = currentTeamOf(projected.player, league);
      return { ...projected.player, team: currentTeam ?? 'FA' };
    })
    .filter((player): player is PlayerData => Boolean(player));
  const projectedCustom = custom.map(player => {
    const currentTeam = currentTeamOf(player, league);
    return { ...player, team: currentTeam ?? 'FA' };
  });
  return [...projectedBase, ...projectedGenerated, ...projectedCustom];
}

export function createLeaguePlayerResolver(
  league: LeagueState | null | undefined,
): (key: string) => PlayerData | undefined {
  return key => getPlayerForLeague(key, league);
}

/** 从已筛选可用名单中按位置挑选首发。 */
export function starterEntriesFromPlayers(roster: PlayerData[]): { key: string; pos: Position }[] {
  const entries: { key: string; pos: Position }[] = [];
  for (const pos of POSITIONS) {
    const candidate = roster.find(
      p => !entries.some(entry => entry.key === p.name) && (p.pos === pos || p.secondaryPos === pos),
    );
    if (candidate) entries.push({ key: candidate.name, pos });
  }
  for (const player of roster) {
    if (entries.length >= 5) break;
    if (!entries.some(entry => entry.key === player.name)) entries.push({ key: player.name, pos: player.pos });
  }
  return entries;
}

/** 保证指定球员在给定首发模板中，优先顶替同位置球员。 */
export function starterEntriesFromPlayersWith(
  roster: PlayerData[],
  protagonistKey: string,
): { key: string; pos: Position }[] {
  const entries = starterEntriesFromPlayers(roster);
  if (entries.some(e => e.key === protagonistKey)) return entries;
  const hero = roster.find(player => player.name === protagonistKey);
  if (!hero) return entries;
  const idx = entries.findIndex(e => e.pos === hero.pos);
  const slot = idx >= 0 ? idx : entries.length - 1;
  entries[slot] = { key: protagonistKey, pos: entries[slot]?.pos ?? hero.pos };
  return entries;
}

/** 按位置挑选首发五人：每个位置取该位置（含副位置）评分最高者，不重复 */
export function pickStarters(teamId: string): PlayerData[] {
  const roster = getRoster(teamId);
  const picked: PlayerData[] = [];
  for (const pos of POSITIONS) {
    const candidate = roster.find(
      p => !picked.includes(p) && (p.pos === pos || p.secondaryPos === pos),
    );
    if (candidate) picked.push(candidate);
  }
  // 阵容不满 5 人时按总评补齐
  for (const p of roster) {
    if (picked.length >= 5) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}

/** 首发五人的场上位置映射（与 pickStarters 顺序对应） */
export function starterEntries(teamId: string): { key: string; pos: Position }[] {
  const roster = getRoster(teamId);
  const entries: { key: string; pos: Position }[] = [];
  for (const pos of POSITIONS) {
    const candidate = roster.find(
      p => !entries.some(entry => entry.key === p.name) && (p.pos === pos || p.secondaryPos === pos),
    );
    if (candidate) entries.push({ key: candidate.name, pos });
  }
  for (const player of roster) {
    if (entries.length >= 5) break;
    if (!entries.some(entry => entry.key === player.name)) entries.push({ key: player.name, pos: player.pos });
  }
  return entries;
}

/**
 * 保证主角在首发中：不在名单时顶替同位置首发（找不到同位置则顶替末位）。
 */
export function starterEntriesWith(teamId: string, protagonistKey: string): { key: string; pos: Position }[] {
  const entries = starterEntries(teamId);
  if (entries.some(e => e.key === protagonistKey)) return entries;
  const hero = getPlayer(protagonistKey);
  if (!hero) return entries;
  const idx = entries.findIndex(e => e.pos === hero.pos);
  const slot = idx >= 0 ? idx : entries.length - 1;
  entries[slot] = { key: protagonistKey, pos: entries[slot]?.pos ?? hero.pos };
  return entries;
}

/** 球员姓名缩写（头像圆内显示），如 "S. Curry" → "SC" */
export function initialsOf(player: PlayerData): string {
  const parts = player.name.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
