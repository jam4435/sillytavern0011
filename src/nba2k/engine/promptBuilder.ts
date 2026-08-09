import type { ActionResolution, MatchState } from './types';

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 把前端判定结果 + 局势快照拼成随 user 楼层发送的结构化指令。
 * AI 按世界书「输出提示词」契约演出该结果并结算变量，不得改判。
 */
export function buildTurnPrompt(params: {
  match: MatchState;
  resolution: ActionResolution;
  /** 玩家附加的自由文本（可为空） */
  playerNote?: string;
}): string {
  const { match, resolution } = params;
  const modLines = resolution.modifiers
    .map(m => `${m.label}${m.value >= 0 ? '+' : ''}${m.value}`)
    .join('，') || '无';

  const lines = [
    '<行动判定>',
    `局势：第${match.节次}节 剩余${formatClock(match.剩余秒数)}，比分 主${match.比分.主}:客${match.比分.客}，球权：${match.球权}队`,
    `上回合：${match.回合摘要 || '比赛进行中'}`,
    `动作：${resolution.summary}`,
    `攻防分：${resolution.attackScore} vs ${resolution.defenseScore}（基础成功率 ${resolution.baseRate}%）`,
    `情境修正：${modLines}（最终成功线 ${resolution.finalRate}）`,
    `判定等级：${resolution.tier}`,
    `硬结算边界：${JSON.stringify(resolution.hardResult)}`,
    '要求：按判定等级演出本回合（解说+场上对话）；比分、球权、阶段、耗时、体力和个人统计必须严格落在硬结算边界内，只能修改 allowedStatePaths；requiredStatUpdates 中 choiceGroup 相同的项目必须且只能选择一项，不得改变判定结果。',
    '</行动判定>',
  ];

  if (params.playerNote) lines.splice(lines.length - 1, 0, `玩家意图补充：${params.playerNote}`);

  return lines.join('\n');
}
