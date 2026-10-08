import type { MatchState, RotationContextMode, Side, TeamRotationState } from './types';

export interface RotationGameContext {
  mode: RotationContextMode;
  scoreDiff: number;
  remainingSeconds: number;
  leading: boolean;
  trailing: boolean;
}

export function deriveRotationGameContext(
  match: MatchState,
  side: Side,
  rotation?: TeamRotationState,
): RotationGameContext {
  const mine = match.比分[side];
  const theirs = match.比分[side === '主' ? '客' : '主'];
  const diff = mine - theirs;
  const abs = Math.abs(diff);
  const remaining = match.剩余秒数;

  if (match.节次 >= 4) {
    const minutes = remaining / 60;
    const hardThreshold = 14 + minutes * 1.5;
    const softThreshold = 9 + minutes * 1.4;

    if (abs >= hardThreshold || (remaining <= 150 && abs >= 16)) {
      return { mode: '硬垃圾时间', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
    }
    if (abs >= softThreshold) {
      // 落后方在软垃圾时间仍可多保留正常轮换追分；最后3分钟才共同进入深板凳语义。
      const mode: RotationContextMode = diff > 0 || remaining <= 180 ? '软垃圾时间' : '正常';
      return { mode, scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
    }
    if (remaining <= 360 && abs <= 10) {
      return { mode: '终结阵容', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
    }
  }

  if (match.节次 === 3 && match.剩余秒数 <= 120 && abs >= 28) {
    return { mode: diff > 0 ? '软垃圾时间' : '正常', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
  }

  return { mode: rotation?.contextMode ?? '正常', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
}
