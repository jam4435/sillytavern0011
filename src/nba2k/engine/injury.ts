import { getBasePlayer } from '../utils/rosters';
import { getPlayerAvailability } from './availability';
import { estimateInitialAge } from './lifecycle';
import type { LeagueState, InjuryRecord, StoryHook } from './season';
import type { LeaguePlayerSeasonStats } from './leagueStats';
import type { PlayerData } from './types';

/**
 * 比赛结束后才裁定伤病。球员的出场分钟与最终体力来自既成比赛，
 * 不篡改本场得分/个人数据，也不让语言模型决定伤病严重度。
 */
export interface InjuryGameExposure {
  /** 同一日期的多场季后赛补模拟使用不同ID，避免随机数完全重合。 */
  gameId: string;
  date: string;
  lines: LeaguePlayerSeasonStats;
  /** 高精度玩家比赛中真实剩余体力（其他球队由分钟/耐力估算）。 */
  remainingStamina?: Record<string, number>;
}

const DAY_MS = 86_400_000;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function dayNumber(date: string): number {
  return Date.parse(`${date}T12:00:00Z`) / DAY_MS;
}
function daysBetween(start: string, end: string): number {
  const difference = dayNumber(end) - dayNumber(start);
  return Number.isFinite(difference) ? Math.max(0, Math.floor(difference)) : 0;
}
function addDays(date: string, days: number): string {
  const time = dayNumber(date);
  return Number.isFinite(time) ? new Date((time + days) * DAY_MS).toISOString().slice(0, 10) : date;
}

/** 小型可复现PRNG：不依赖球队ID、球员姓名的历史伤病白名单。 */
function unit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

function ageOf(player: PlayerData, league: LeagueState, ageOverride?: { key: string; age: number }): number {
  if (ageOverride?.key === player.name) return ageOverride.age;
  const generated = league.生成球员[player.name];
  return generated
    ? generated.ageAtEntry + Math.max(0, league.赛季序号 - generated.entrySeason)
    : estimateInitialAge(getBasePlayer(player.name) ?? player) + league.赛季序号;
}

/** 单次出场的风险：分钟、耐久、年龄、疲劳与既往严重伤病均参与。 */
export function gameInjuryRisk(input: {
  minutes: number;
  durability: number;
  age: number;
  stamina: number;
  fatigue?: number | null;
  recentAverageMinutes?: number;
  severeHistory?: number;
  recovering?: boolean;
}): number {
  const { minutes, durability, age, stamina } = input;
  if (minutes <= 0) return 0;
  const exposure = clamp(minutes / 30, .10, 1.70);
  const durabilityFactor = clamp(1 + (77 - durability) / 65, .55, 1.95);
  const ageFactor = clamp(1 + Math.max(0, age - 29) * .055, 1, 1.72);
  const fatigue = input.fatigue ?? clamp(88 - minutes * 1.0 - (80 - stamina) * .55, 15, 95);
  const fatigueFactor = clamp(1 + Math.max(0, 45 - fatigue) / 85, 1, 1.55);
  const chronic = clamp(1 + (input.severeHistory ?? 0) * .13, 1, 1.52);
  const workload = clamp(1 + Math.max(0, (input.recentAverageMinutes ?? minutes) - 32) * .035, 1, 1.3);
  const returnRisk = input.recovering ? 1.16 : 1;
  return clamp(.00285 * exposure * durabilityFactor * ageFactor * fatigueFactor
    * workload * chronic * returnRisk, 0, .025);
}

const INJURY_TYPES = {
  轻微: ['肌肉紧绷', '踝部扭伤', '膝部挫伤', '背部拉伤'],
  中等: ['腿筋拉伤', '踝关节损伤', '膝部扭伤', '肩部伤势'],
  严重: ['膝部韧带重伤', '跟腱重伤', '足部骨折', '肩部严重损伤'],
} as const;

function chooseInjury(player: PlayerData, league: LeagueState, exposure: InjuryGameExposure): InjuryRecord {
  const seed = `${league.赛季}:${exposure.gameId}:${player.name}`;
  const severityRoll = unit(`${seed}:severity`);
  const severity: InjuryRecord['严重度'] = severityRoll < .69 ? '轻微' : severityRoll < .94 ? '中等' : '严重';
  const variants = INJURY_TYPES[severity];
  const kind = variants[Math.floor(unit(`${seed}:kind`) * variants.length)];
  const duration = severity === '轻微'
    ? 2 + Math.floor(unit(`${seed}:duration`) * 6)
    : severity === '中等'
      ? 9 + Math.floor(unit(`${seed}:duration`) * 22)
      : 35 + Math.floor(unit(`${seed}:duration`) * 86);
  return {
    球员: player.name,
    类型: kind,
    严重度: severity,
    受伤日期: exposure.date,
    预计复出: addDays(exposure.date, duration),
    状态: '休战',
  };
}

/** 对同一比赛/赛季存档重算时固定结果；不会重复添加同一事故。 */
export function applyGameInjuries(
  league: LeagueState,
  rosters: Record<string, PlayerData[]>,
  exposures: InjuryGameExposure[],
  ageOverride?: { key: string; age: number },
): LeagueState {
  if (!exposures.length) return league;
  const byKey = new Map(Object.values(rosters).flat().map(player => [player.name, player]));
  const history = [...league.伤病];
  const storyHooks: StoryHook[] = [];
  const encountered = new Set<string>();

  for (const exposure of exposures) {
    for (const [key, line] of Object.entries(exposure.lines)) {
      if (line.gp <= 0 || line.min <= 0) continue;
      const player = byKey.get(key);
      if (!player) continue;
      const incidentId = `${league.赛季}:${exposure.gameId}:${key}`;
      if (encountered.has(key) || history.some(injury =>
        injury.球员 === key && injury.受伤日期 === exposure.date)) continue;
      // 已休战球员不会从另一场后台模拟里“再受一次伤”。
      if (!getPlayerAvailability(key, { ...league, 伤病: history }).available) continue;
      const existing = [...history].reverse().find(injury => injury.球员 === key);
      const severeHistory = history.filter(injury => injury.球员 === key && injury.严重度 === '严重').length;
      const previous = league.球员赛季统计[key];
      const avgMinutes = previous?.gp ? previous.min / previous.gp : line.min;
      const risk = gameInjuryRisk({
        minutes: line.min,
        durability: player.attrs.durability,
        stamina: player.attrs.stamina,
        age: ageOf(player, league, ageOverride),
        fatigue: exposure.remainingStamina?.[key],
        recentAverageMinutes: avgMinutes,
        severeHistory,
        recovering: existing?.状态 === '可复出' && typeof existing.分钟限制 === 'number',
      });
      if (unit(`${incidentId}:injury`) >= risk) continue;
      const injury = chooseInjury(player, league, exposure);
      history.push(injury);
      encountered.add(key);
      if (player.overall >= 82 || ageOverride?.key === key || injury.严重度 === '严重') {
        storyHooks.push({
          id: `injury-${incidentId}`,
          type: '伤病',
          title: `${player.cn || player.name} 赛后伤病报告`,
          detail: `${player.cn || player.name}在${exposure.date}赛后确诊${injury.类型}（${injury.严重度}），预计${injury.预计复出}复出。伤停、后续轮换和球队实力由前端处理，不得擅自修改。`,
          createdDate: exposure.date,
        });
      }
    }
  }
  if (history.length === league.伤病.length) return league;
  return {
    ...league,
    伤病: history,
    故事钩子: [...league.故事钩子, ...storyHooks.filter(hook =>
      !league.故事钩子.some(existing => existing.id === hook.id))],
  };
}

/** 按实际日期推进康复；非按“调用次数”提前治愈。包括休赛期跨越数月的情况。 */
export function advanceInjuryRecovery(league: LeagueState): LeagueState {
  const injuries = league.伤病.map(injury => {
    if (league.日期 < injury.预计复出) {
      return injury.状态 === '恢复中' ? injury : { ...injury, 状态: '恢复中' as const };
    }
    const elapsed = daysBetween(injury.预计复出, league.日期);
    const initial = injury.严重度 === '严重' ? 18 : injury.严重度 === '中等' ? 24 : 30;
    const step = injury.严重度 === '严重' ? 4 : injury.严重度 === '中等' ? 5 : 6;
    const minutes = initial + Math.floor(elapsed / 3) * step;
    return {
      ...injury,
      状态: '可复出' as const,
      分钟限制: minutes >= 36 ? null : Math.min(36, minutes),
    };
  });
  // 长期存档不保留无影响的数年前轻/中伤；严重伤史仍保留供生命周期衰退与退役评估。
  const hooks: StoryHook[] = [];
  injuries.forEach((injury, index) => {
    if (injury.状态 !== '可复出' || league.伤病[index].状态 === '可复出') return;
    const id = `injury-return-${injury.球员}-${injury.预计复出}`;
    if (league.故事钩子.some(hook => hook.id === id)) return;
    hooks.push({
      id, type: '伤病', title: `${injury.球员} 可以复出`,
      detail: `${injury.类型}已达到预计恢复日期，当前分钟限制${injury.分钟限制 ?? '无'}；后续按日期逐步解除。`,
      createdDate: league.日期,
    });
  });
  const compact = injuries.filter(injury =>
    injury.严重度 === '严重' ||
    injury.状态 !== '可复出' ||
    daysBetween(injury.预计复出, league.日期) <= 120);
  return { ...league, 伤病: compact, 故事钩子: [...league.故事钩子, ...hooks] };
}
