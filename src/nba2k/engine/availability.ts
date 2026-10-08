import type { LeagueState } from './season';

export interface PlayerAvailability {
  available: boolean;
  minuteLimit: number | null;
  reason: string | null;
}

function dateToUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function daysSince(a: string, b: string): number {
  const start = dateToUtc(a).getTime();
  const end = dateToUtc(b).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function getPlayerAvailability(
  playerKey: string,
  league: LeagueState | null | undefined,
): PlayerAvailability {
  if (!league) return { available: true, minuteLimit: null, reason: null };
  const injury = [...league.伤病].reverse().find(item => item.球员 === playerKey);
  if (!injury) return { available: true, minuteLimit: null, reason: null };

  if (injury.状态 === '休战' || injury.状态 === '恢复中') {
    return {
      available: false,
      minuteLimit: 0,
      reason: `${injury.类型} · ${injury.状态}`,
    };
  }

  if (typeof injury.分钟限制 === 'number') {
    return {
      available: true,
      minuteLimit: Math.max(0, Math.min(40, injury.分钟限制)),
      reason: `${injury.类型} · 复出限时`,
    };
  }

  // 没有显式限制时，从伤势严重度 + 预计复出后经过天数确定性推导。
  const elapsed = daysSince(injury.预计复出, league.日期);
  const base = injury.严重度 === '严重' ? 18 : injury.严重度 === '中等' ? 24 : 30;
  const step = injury.严重度 === '严重' ? 3 : injury.严重度 === '中等' ? 4 : 5;
  const fullAfter = injury.严重度 === '严重' ? 7 : injury.严重度 === '中等' ? 4 : 2;
  return {
    available: true,
    minuteLimit: elapsed >= fullAfter ? null : Math.min(38, base + elapsed * step),
    reason: elapsed >= fullAfter ? null : `${injury.类型} · 复出第${elapsed + 1}阶段`,
  };
}

export function isPlayerAvailable(playerKey: string, league: LeagueState | null | undefined): boolean {
  return getPlayerAvailability(playerKey, league).available;
}
