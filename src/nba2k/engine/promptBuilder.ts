import type { ActionResolution, MatchState } from './types';

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 把前端判定结果 + 局势快照拼成随 user 楼层发送的结构化指令。
 * AI 演出并从合同合法分支中提交 NBASettlement；前端落楼前校验并生成 ERA。
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
    `阶段判定：${JSON.stringify(resolution.stages)}`,
    `结算合同：${JSON.stringify(resolution.contract)}`,
    '要求：先按判定等级写本回合解说与场上互动，再输出且只输出一份 <NBASettlement>{JSON}</NBASettlement> 提案。contractId 必须一致；branchId 必须取合同 branches.id；耗时、投篮时钟、体力和可选站位必须在合同范围内。不要输出比赛 VariableEdit/Insert/Delete，前端会校验并生成唯一变量块。',
    '</行动判定>',
  ];

  if (params.playerNote) lines.splice(lines.length - 1, 0, `玩家意图补充：${params.playerNote}`);

  return lines.join('\n');
}
