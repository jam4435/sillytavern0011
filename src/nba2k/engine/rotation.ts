import { buildFormation } from './positioning';
import { deriveRotationGameContext } from './gameContext';
import type {
  MatchState,
  PlayerData,
  Position,
  RotationState,
  Side,
  TeamRotationState,
} from './types';

export type RotationPlayerResolver = (key: string) => PlayerData | undefined;
export type RotationOverrides = Partial<Record<Side, Record<string, number>>>;

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const BASE_MINUTES = [35, 34, 33, 31, 29, 25, 21, 15, 10, 5, 1, 1] as const;
const opposite = (side: Side): Side => side === '主' ? '客' : '主';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function rosterKeys(match: MatchState, side: Side): string[] {
  return [...match.阵容[side].场上, ...match.阵容[side].替补];
}

export function buildGenericRotationTargets(
  match: MatchState,
  side: Side,
  resolvePlayer: RotationPlayerResolver,
): Record<string, number> {
  const starters = new Set(match.阵容[side].场上);
  const ranked = rosterKeys(match, side)
    .map(key => resolvePlayer(key))
    .filter((player): player is PlayerData => Boolean(player))
    .sort((a, b) => {
      const aScore = a.overall + (starters.has(a.name) ? 1.5 : 0) + (a.attrs.stamina - 80) * .025;
      const bScore = b.overall + (starters.has(b.name) ? 1.5 : 0) + (b.attrs.stamina - 80) * .025;
      return bScore - aScore;
    });
  return Object.fromEntries(ranked.map((player, index) => [player.name, BASE_MINUTES[index] ?? 0]));
}

export function normalizeRotationTargets(
  base: Record<string, number>,
  fixed: Record<string, number> = {},
): Record<string, number> {
  const result: Record<string, number> = {};
  const all = Object.keys(base);
  const fixedKeys = new Set(Object.keys(fixed).filter(key => key in base));
  let remaining = 240;

  for (const key of fixedKeys) {
    const value = clamp(fixed[key], 0, 40);
    result[key] = value;
    remaining -= value;
  }

  let flexible = all.filter(key => !fixedKeys.has(key) && base[key] > 0);
  const zeroKeys = all.filter(key => !fixedKeys.has(key) && base[key] <= 0);
  zeroKeys.forEach(key => { result[key] = 0; });

  remaining = Math.max(0, remaining);
  while (flexible.length) {
    const baseSum = flexible.reduce((sum, key) => sum + base[key], 0);
    if (baseSum <= 0) break;
    const scale = remaining / baseSum;
    const capped = flexible.filter(key => base[key] * scale > 40);
    if (!capped.length) {
      for (const key of flexible) result[key] = base[key] * scale;
      remaining = 0;
      break;
    }
    for (const key of capped) {
      result[key] = 40;
      remaining -= 40;
    }
    flexible = flexible.filter(key => !capped.includes(key));
    remaining = Math.max(0, remaining);
  }

  if (remaining > .001 && flexible.length) {
    const add = remaining / flexible.length;
    flexible.forEach(key => { result[key] = (result[key] ?? 0) + add; });
  }

  // 保留一位小数，并把舍入误差补给最高分钟球员，确保总和仍为240。
  for (const key of all) result[key] = Math.round((result[key] ?? 0) * 10) / 10;
  const sum = all.reduce((total, key) => total + (result[key] ?? 0), 0);
  const diff = Math.round((240 - sum) * 10) / 10;
  const anchor = [...all].sort((a, b) => (result[b] ?? 0) - (result[a] ?? 0))[0];
  if (anchor && Math.abs(diff) > .001) result[anchor] = Math.round((result[anchor] + diff) * 10) / 10;
  return result;
}

export function createRotationState(
  match: MatchState,
  resolvePlayer: RotationPlayerResolver,
  overrides: RotationOverrides = {},
): RotationState {
  const build = (side: Side): TeamRotationState => ({
    starters: [...match.阵容[side].场上],
    targetMinutes: normalizeRotationTargets(buildGenericRotationTargets(match, side, resolvePlayer), overrides[side]),
  });
  return { 主: build('主'), 客: build('客') };
}

function elapsedSeconds(match: MatchState): number {
  if (match.节次 <= 4) return (match.节次 - 1) * 720 + (720 - match.剩余秒数);
  return 2880 + (match.节次 - 5) * 300 + (300 - match.剩余秒数);
}

function foulPenalty(match: MatchState, fouls: number): number {
  if (fouls >= 6) return -500;
  if (fouls >= 5) return -75;
  if (match.节次 === 1 && fouls >= 2) return -40;
  if (match.节次 === 2 && fouls >= 3) return -38;
  if (match.节次 === 3 && fouls >= 4) return -35;
  return 0;
}

function playerRotationScore(
  match: MatchState,
  side: Side,
  key: string,
  rotation: TeamRotationState,
  resolvePlayer: RotationPlayerResolver,
): number {
  const player = resolvePlayer(key);
  const status = match.球员状态[key];
  if (!player || !status || status.犯规 >= 6) return -1000;
  const target = rotation.targetMinutes[key] ?? 0;
  if (target <= 0) return -250;

  const elapsed = elapsedSeconds(match);
  const progress = clamp(elapsed / 2880, 0, 1);
  const expected = target * 60 * progress;
  const deficit = expected - status.上场秒数;
  const currentBonus = match.阵容[side].场上.includes(key) ? 1.5 : 0;
  const stamina = (status.体力 - 75) * .18;
  const context = deriveRotationGameContext(match, side, rotation);
  const closingPriority = rotation.closingPriority?.[key] ?? clamp(player.overall + target * .4, 0, 100);
  const garbagePriority = rotation.garbagePriority?.[key] ?? clamp(100 - target * 2, 0, 100);

  let contextBonus = 0;
  if (context.mode === '正常') {
    const stagger = rotation.staggerGroups?.find(group => group.includes(key));
    if (stagger) {
      const onCourt = stagger.filter(member => match.阵容[side].场上.includes(member));
      if (onCourt.length === 0) contextBonus += 8;
      else if (onCourt.length === 1 && onCourt[0] === key) contextBonus += 5;
      else if (onCourt.length >= 2) contextBonus -= 1.5;
    }
  } else if (context.mode === '终结阵容') {
    contextBonus += (closingPriority - 60) * .36;
    // 终结阶段减少“欠分钟补课”，优先真正适合收比赛的人。
    contextBonus -= Math.max(0, deficit) / 28;
  } else if (context.mode === '软垃圾时间') {
    contextBonus += (garbagePriority - 55) * .28;
    if (target >= 30) contextBonus -= 8;
  } else if (context.mode === '硬垃圾时间') {
    contextBonus += (garbagePriority - 45) * .48;
    if (target >= 28) contextBonus -= 18;
    if (rotation.starters.includes(key)) contextBonus -= 10;
  }

  return player.overall + deficit / 10 + stamina + currentBonus + contextBonus + foulPenalty(match, status.犯规);
}

function positionFit(
  player: PlayerData,
  position: Position,
  rotation: TeamRotationState,
  closing: boolean,
): number {
  if (player.pos === position) return 8;
  if (player.secondaryPos === position) return 5;
  const from = POSITIONS.indexOf(player.pos);
  const to = POSITIONS.indexOf(position);
  const distance = Math.abs(from - to);
  if (closing && position === 'C' && (rotation.smallBallAffinity ?? 0) >= 75 && player.pos === 'PF') return 3;
  if (closing && position === 'PF' && (rotation.smallBallAffinity ?? 0) >= 70 && player.pos === 'SF') return 1;
  if (distance === 1) return closing ? -5 : -8;
  if (distance === 2) return closing ? -14 : -18;
  return -32;
}

interface DesiredLineup {
  keys: string[];
  scores: Record<string, number>;
}

function desiredLineup(
  match: MatchState,
  side: Side,
  rotation: TeamRotationState,
  resolvePlayer: RotationPlayerResolver,
): DesiredLineup {
  const context = deriveRotationGameContext(match, side, rotation);
  const allKeys = rosterKeys(match, side);
  const rankedByTarget = [...allKeys].sort((a, b) => (rotation.targetMinutes[b] ?? 0) - (rotation.targetMinutes[a] ?? 0));
  const depth = context.mode === '硬垃圾时间'
    ? allKeys.length
    : context.mode === '软垃圾时间'
      ? Math.min(allKeys.length, Math.max(rotation.rotationDepth ?? 10, 10))
      : Math.min(allKeys.length, rotation.rotationDepth ?? 10);
  const activePool = new Set(rankedByTarget.slice(0, Math.max(5, depth)));
  match.阵容[side].场上.forEach(key => activePool.add(key));
  const keys = [...activePool];
  const unused = new Set(keys);
  const byPosition = new Map<Position, string>();
  const scores: Record<string, number> = {};

  // 稀缺位置优先，避免双能锋/后卫过早占掉唯一中锋或控卫。
  const order: Position[] = ['C', 'PG', 'PF', 'SG', 'SF'];
  for (const position of order) {
    let bestKey: string | null = null;
    let bestScore = -Infinity;
    for (const key of unused) {
      const player = resolvePlayer(key);
      if (!player) continue;
      const score = playerRotationScore(match, side, key, rotation, resolvePlayer) +
        positionFit(player, position, rotation, context.mode === '终结阵容');
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    if (bestKey) {
      byPosition.set(position, bestKey);
      scores[bestKey] = bestScore;
      unused.delete(bestKey);
    }
  }

  const ordered = POSITIONS.map(position => byPosition.get(position)).filter((key): key is string => Boolean(key));
  // 极端伤停/六犯情况下仍保证尽可能凑足5人。
  for (const key of unused) {
    if (ordered.length >= 5) break;
    const status = match.球员状态[key];
    if ((status?.犯规 ?? 0) < 6) ordered.push(key);
  }
  return { keys: ordered.slice(0, 5), scores };
}

function rebuildFormation(
  match: MatchState,
  resolvePlayer: RotationPlayerResolver,
): MatchState['站位'] {
  const offense = match.球权;
  const defense = opposite(offense);
  const offenseEntries = match.阵容[offense].场上.map((key, index) => ({
    key,
    pos: POSITIONS[index] ?? resolvePlayer(key)?.pos ?? 'SF',
  }));
  const defenseEntries = match.阵容[defense].场上.map((key, index) => ({
    key,
    pos: POSITIONS[index] ?? resolvePlayer(key)?.pos ?? 'SF',
  }));
  const oldHolder = match.站位[offense].find(spot => spot.持球)?.球员;
  const ballHolder = oldHolder && match.阵容[offense].场上.includes(oldHolder)
    ? oldHolder
    : match.阵容[offense].场上[0] ?? '';
  const rightAttackingSide: Side = match.节次 <= 2 ? '主' : '客';
  return buildFormation({
    offense: offenseEntries,
    defense: defenseEntries,
    offenseSide: offense,
    tactic: match.战术[offense].offense,
    defenseScheme: match.战术[defense].defense,
    ballHolder,
    attackRight: offense === rightAttackingSide,
  });
}

function rotateSide(
  match: MatchState,
  side: Side,
  rotation: TeamRotationState,
  resolvePlayer: RotationPlayerResolver,
): { lineup: MatchState['阵容'][Side]; changes: string[] } {
  const current = [...match.阵容[side].场上];
  const desired = desiredLineup(match, side, rotation, resolvePlayer);
  const forced = current.filter(key => {
    const status = match.球员状态[key];
    return !status || status.犯规 >= 6 || status.体力 <= 12;
  });

  if (!forced.length && elapsedSeconds(match) < 90) return { lineup: match.阵容[side], changes: [] };

  const desiredSet = new Set(desired.keys);
  const currentSet = new Set(current);
  const incoming = desired.keys.filter(key => !currentSet.has(key));
  const outgoing = current.filter(key => !desiredSet.has(key));
  if (!incoming.length || !outgoing.length) return { lineup: match.阵容[side], changes: [] };

  const quarterStart = (match.节次 <= 4 ? match.剩余秒数 >= 710 : match.剩余秒数 >= 290);
  const maxSubs = quarterStart ? 3 : 2;
  const proposals = incoming.map(inKey => {
    const desiredSlot = desired.keys.indexOf(inKey);
    const slotOut = current[desiredSlot];
    const outKey = slotOut && outgoing.includes(slotOut) ? slotOut : outgoing[0];
    const inScore = playerRotationScore(match, side, inKey, rotation, resolvePlayer);
    const outScore = playerRotationScore(match, side, outKey, rotation, resolvePlayer);
    return {
      inKey,
      outKey,
      desiredSlot,
      forced: forced.includes(outKey),
      gain: inScore - outScore,
    };
  }).sort((a, b) => Number(b.forced) - Number(a.forced) || b.gain - a.gain);

  const next = [...current];
  const usedOut = new Set<string>();
  const usedIn = new Set<string>();
  const changes: string[] = [];
  for (const proposal of proposals) {
    if (changes.length >= maxSubs) break;
    if (usedOut.has(proposal.outKey) || usedIn.has(proposal.inKey)) continue;
    // 需要至少明显改善轮换节奏；犯规/极低体力时强制换下。
    if (!proposal.forced && proposal.gain < 4.5) continue;
    const index = next.indexOf(proposal.outKey);
    if (index < 0) continue;
    next[index] = proposal.inKey;
    usedOut.add(proposal.outKey);
    usedIn.add(proposal.inKey);
    changes.push(`${resolvePlayer(proposal.outKey)?.cn ?? proposal.outKey}↓ ${resolvePlayer(proposal.inKey)?.cn ?? proposal.inKey}↑`);
  }

  if (!changes.length) return { lineup: match.阵容[side], changes: [] };
  const all = rosterKeys(match, side);
  const nextSet = new Set(next);
  const bench = all.filter(key => !nextSet.has(key));
  return { lineup: { 场上: next, 替补: bench }, changes };
}

/**
 * possession 边界上的确定性 CPU 轮换。
 * 不改变比分、时间或事件结果，只调整五人阵容和随后的战术站位。
 */
export function applyAutomaticRotation(
  input: MatchState,
  resolvePlayer: RotationPlayerResolver,
  overrides: RotationOverrides = {},
): MatchState {
  const rotationState = input.轮换 ?? createRotationState(input, resolvePlayer, overrides);
  let match: MatchState = input.轮换 ? input : { ...input, 轮换: rotationState };
  if (!match.进行中 || match.回合阶段 !== '常规回合') return match;

  const homeContext = deriveRotationGameContext(match, '主', rotationState.主);
  const awayContext = deriveRotationGameContext(match, '客', rotationState.客);
  match = {
    ...match,
    轮换: {
      主: { ...rotationState.主, contextMode: homeContext.mode },
      客: { ...rotationState.客, contextMode: awayContext.mode },
    },
  };

  const forcedExists = (['主', '客'] as Side[]).some(side =>
    match.阵容[side].场上.some(key => {
      const status = match.球员状态[key];
      return !status || status.犯规 >= 6 || status.体力 <= 12;
    }),
  );
  // 只在一个 possession 刚结束/节开始时常规换人；强制离场例外。
  if (!forcedExists && match.投篮时钟 < 20) return match;

  const home = rotateSide(match, '主', match.轮换!.主, resolvePlayer);
  match = { ...match, 阵容: { ...match.阵容, 主: home.lineup } };
  const away = rotateSide(match, '客', match.轮换!.客, resolvePlayer);
  match = { ...match, 阵容: { ...match.阵容, 客: away.lineup } };

  const changes = [
    ...(home.changes.length ? [`主队：${home.changes.join('，')}`] : []),
    ...(away.changes.length ? [`客队：${away.changes.join('，')}`] : []),
  ];
  if (!changes.length) return match;

  return {
    ...match,
    站位: rebuildFormation(match, resolvePlayer),
    回合情境: `${match.回合情境} · CPU轮换`,
    回合摘要: `${match.回合摘要} · ${changes.join('；')}`,
  };
}
