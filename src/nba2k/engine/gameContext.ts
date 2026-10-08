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
    const previous = rotation?.contextMode ?? '正常';

    if (abs >= hardThreshold || (remaining <= 150 && abs >= 16)) {
      return { mode: '硬垃圾时间', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
    }
    // 垃圾时间退出采用4-5分迟滞，避免比分在阈值附近每个回合来回切换。
    if (previous === '硬垃圾时间' && abs >= hardThreshold - 5) {
      return { mode: '硬垃圾时间', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
    }

    if (abs >= softThreshold) {
      const mode: RotationContextMode = diff > 0 || remaining <= 180 ? '软垃圾时间' : '正常';
      return { mode, scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
    }
    if (previous === '软垃圾时间' && abs >= softThreshold - 4) {
      return { mode: diff > 0 || remaining <= 180 ? '软垃圾时间' : '正常', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
    }

    if (remaining <= 360 && abs <= 10) {
      return { mode: '终结阵容', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
    }
  }

  if (match.节次 === 3 && match.剩余秒数 <= 120 && abs >= 28) {
    return { mode: diff > 0 ? '软垃圾时间' : '正常', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
  }

  return { mode: '正常', scoreDiff: diff, remainingSeconds: remaining, leading: diff > 0, trailing: diff < 0 };
}
