import { PLAYERS } from '../data/players';
import { TEAMS } from '../data/teams';
import type { PlayerData, Position, TeamData } from '../engine/types';
import { adaptLegacyPlayer } from '../engine/playerAdapter';

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
  return [...players.filter(p => p.team === teamId), ...[...customPlayers.values()].filter(p => p.team === teamId)].sort(
    (a, b) => b.overall - a.overall,
  );
}

export function getPlayer(key: string): PlayerData | undefined {
  return customPlayers.get(key) ?? players.find(p => p.name === key);
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
