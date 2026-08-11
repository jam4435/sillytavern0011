import type { MatchState, NormalizedSettlement, OnCourtStatus, SettlementContract, SettlementProposal, Side } from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const inRange = (value: number, range: { min: number; max: number }) => Number.isFinite(value) && value >= range.min && value <= range.max;
const opposite = (side: Side): Side => side === '主' ? '客' : '主';

export function extractSettlementProposal(text: string): SettlementProposal | null {
  const match = text.match(/<NBASettlement>\s*([\s\S]*?)\s*<\/NBASettlement>/i);
  if (!match) return null;
  try { return JSON.parse(match[1]) as SettlementProposal; } catch { return null; }
}

export function validateSettlementProposal(proposal: SettlementProposal | null, contract: SettlementContract): string[] {
  if (!proposal) return ['缺少或无法解析 <NBASettlement> JSON'];
  const errors: string[] = [];
  if (proposal.contractId !== contract.id) errors.push('contractId 与本回合合同不符');
  if (!contract.branches.some(branch => branch.id === proposal.branchId)) errors.push('branchId 不在合法分支中');
  if (!inRange(proposal.clockSeconds, contract.clockSeconds)) errors.push('clockSeconds 超出合法范围');
  if (!inRange(proposal.shotClockSeconds, contract.shotClockSeconds)) errors.push('shotClockSeconds 超出合法范围');
  if (!proposal.staminaDelta || !inRange(proposal.staminaDelta.actor, contract.staminaDelta.actor)) errors.push('actor 体力变化超出合法范围');
  if (contract.staminaDelta.partner && !inRange(proposal.staminaDelta.partner ?? Number.NaN, contract.staminaDelta.partner)) errors.push('partner 体力变化超出合法范围');
  if (proposal.positions) {
    for (const side of ['主', '客'] as const) {
      if (proposal.positions[side]?.length !== 5) errors.push(`${side}队站位必须有5人`);
      const keys = proposal.positions[side]?.map(spot => spot.球员) ?? [];
      if (new Set(keys).size !== keys.length) errors.push(`${side}队站位存在重复球员`);
      for (const spot of proposal.positions[side] ?? []) {
        if (!contract.allowedPlayers.includes(spot.球员)) errors.push(`站位含非法球员 ${spot.球员}`);
        if (!inRange(spot.x, { min: 0, max: 100 }) || !inRange(spot.y, { min: 0, max: 100 })) errors.push(`球员 ${spot.球员} 坐标越界`);
      }
    }
  }
  if (typeof proposal.summary !== 'string' || !proposal.summary.trim()) errors.push('summary 不能为空');
  return errors;
}

export function fallbackProposal(contract: SettlementContract): SettlementProposal {
  return {
    contractId: contract.id, branchId: contract.referenceBranchId,
    clockSeconds: Math.round((contract.clockSeconds.min + contract.clockSeconds.max) / 2),
    shotClockSeconds: 24,
    staminaDelta: {
      actor: Math.round((contract.staminaDelta.actor.min + contract.staminaDelta.actor.max) / 2),
      ...(contract.staminaDelta.partner ? { partner: Math.round((contract.staminaDelta.partner.min + contract.staminaDelta.partner.max) / 2) } : {}),
    },
    summary: '前端参考结算',
  };
}

export function normalizeSettlement(proposal: SettlementProposal | null, contract: SettlementContract, source: NormalizedSettlement['source']): NormalizedSettlement {
  const valid = validateSettlementProposal(proposal, contract).length === 0 ? proposal! : fallbackProposal(contract);
  const branch = contract.branches.find(item => item.id === valid.branchId) ?? contract.branches[0];
  return {
    ...valid,
    clockSeconds: Math.round(clamp(valid.clockSeconds, contract.clockSeconds.min, contract.clockSeconds.max)),
    shotClockSeconds: Math.round(clamp(valid.shotClockSeconds, contract.shotClockSeconds.min, contract.shotClockSeconds.max)),
    staminaDelta: {
      actor: clamp(valid.staminaDelta.actor, contract.staminaDelta.actor.min, contract.staminaDelta.actor.max),
      ...(contract.staminaDelta.partner ? { partner: clamp(valid.staminaDelta.partner ?? contract.staminaDelta.partner.min, contract.staminaDelta.partner.min, contract.staminaDelta.partner.max) } : {}),
    },
    branch, source,
  };
}

function sideOfPlayer(match: MatchState, player: string): Side | null {
  if ([...match.阵容.主.场上, ...match.阵容.主.替补].includes(player)) return '主';
  if ([...match.阵容.客.场上, ...match.阵容.客.替补].includes(player)) return '客';
  return null;
}

function applyStat(status: OnCourtStatus, key: keyof OnCourtStatus, amount: number): OnCourtStatus {
  if (key === '手感') return status;
  const next = { ...status, [key]: Math.max(0, Number(status[key]) + amount) } as OnCourtStatus;
  if (key === '投篮命中' && amount > 0) { next.连续打铁 = 0; next.手感 = next.连续命中 + amount >= 3 ? '热' : '平'; }
  if (key === '投篮出手' && amount > 0) next.手感 = next.连续打铁 >= 3 ? '冷' : next.手感;
  return next;
}

function switchBallHolder(match: MatchState, possession: Side): MatchState['站位'] {
  const next = { 主: match.站位.主.map(spot => ({ ...spot, 持球: false })), 客: match.站位.客.map(spot => ({ ...spot, 持球: false })) };
  const holder = next[possession][0];
  if (holder) holder.持球 = true;
  return next;
}

export function advancePeriodIfNeeded(match: MatchState): MatchState {
  if (match.剩余秒数 > 0 || match.回合阶段 === '罚球结算' || match.回合阶段 === '篮板争抢') return match;
  const tied = match.比分.主 === match.比分.客;
  if (match.节次 >= 4 && !tied) return { ...match, 进行中: false, 回合阶段: '死球', 待处理情境: { type: 'deadBall', reason: '比赛结束', inboundSide: match.球权 }, 回合摘要: `比赛结束，主${match.比分.主}:客${match.比分.客}` };
  const nextQuarter = match.节次 + 1;
  const possession = nextQuarter % 2 === 1 ? match.跳球胜方 : opposite(match.跳球胜方);
  return {
    ...match, 节次: nextQuarter, 剩余秒数: nextQuarter <= 4 ? 720 : 300, 投篮时钟: 24,
    球权: possession, 本节球队犯规: { 主: 0, 客: 0 }, 回合阶段: '常规回合', 待处理情境: { type: 'none' },
    站位: switchBallHolder(match, possession), 回合摘要: nextQuarter <= 4 ? `第${nextQuarter}节开始` : `第${nextQuarter - 4}个加时开始`,
  };
}

/** 应用已规范化的分支；比分与个人数据只来自前端合同。 */
export function applySettlement(match: MatchState, settlement: NormalizedSettlement, contract: SettlementContract): MatchState {
  const branch = settlement.branch;
  const statuses = { ...match.球员状态 };
  const consumed = Math.min(match.剩余秒数, settlement.clockSeconds);
  for (const side of ['主', '客'] as const) {
    for (const player of match.阵容[side].场上) {
      const current = statuses[player];
      if (current) statuses[player] = { ...current, 上场秒数: current.上场秒数 + consumed };
    }
    for (const player of match.阵容[side].替补) {
      const current = statuses[player];
      if (current) statuses[player] = { ...current, 体力: Math.min(100, current.体力 + Math.max(1, Math.round(consumed / 8))) };
    }
  }
  for (const delta of branch.statDeltas) {
    const current = statuses[delta.player];
    if (current) statuses[delta.player] = applyStat(current, delta.stat, delta.value);
  }
  const attempted = new Set(branch.statDeltas.filter(delta => delta.stat === '投篮出手' && delta.value > 0).map(delta => delta.player));
  const made = new Set(branch.statDeltas.filter(delta => delta.stat === '投篮命中' && delta.value > 0).map(delta => delta.player));
  for (const player of attempted) {
    const current = statuses[player];
    if (!current) continue;
    statuses[player] = made.has(player)
      ? { ...current, 连续打铁: 0, 手感: current.连续命中 >= 2 ? '热' : '平' }
      : { ...current, 连续命中: 0, 手感: current.连续打铁 >= 2 ? '冷' : '平' };
  }
  const actor = contract.intent.actor;
  if (statuses[actor]) statuses[actor] = { ...statuses[actor], 体力: clamp(statuses[actor].体力 + settlement.staminaDelta.actor, 0, 100) };
  const partner = contract.intent.partner;
  if (partner && statuses[partner] && settlement.staminaDelta.partner !== undefined) statuses[partner] = { ...statuses[partner], 体力: clamp(statuses[partner].体力 + settlement.staminaDelta.partner, 0, 100) };

  const teamFouls = { ...match.本节球队犯规 };
  for (const delta of branch.statDeltas.filter(item => item.stat === '犯规' && item.value > 0)) {
    const side = sideOfPlayer(match, delta.player);
    if (side) teamFouls[side] += delta.value;
  }
  let nextPhase = branch.nextPhase;
  let pending = branch.pending;
  const foulDelta = branch.statDeltas.find(item => item.stat === '犯规' && item.value > 0);
  if (foulDelta) {
    const foulSide = sideOfPlayer(match, foulDelta.player);
    if (foulSide && teamFouls[foulSide] >= 5 && branch.label.includes('防守')) {
      const shootingSide = opposite(foulSide);
      const shooter = match.站位[shootingSide].find(spot => spot.持球)?.球员 ?? match.阵容[shootingSide].场上[0];
      nextPhase = '罚球结算';
      pending = { type: 'freeThrow', shootingSide, shooter, remaining: 2, total: 2 };
    }
  }

  const possessionChanged = branch.possession !== match.球权;
  const basePositions = settlement.positions ?? match.站位;
  let next: MatchState = {
    ...match,
    比分: { 主: match.比分.主 + branch.scoreDelta.主, 客: match.比分.客 + branch.scoreDelta.客 },
    球权: branch.possession, 剩余秒数: Math.max(0, match.剩余秒数 - consumed),
    投篮时钟: possessionChanged ? 24 : Math.round(clamp(settlement.shotClockSeconds, 0, 24)),
    站位: switchBallHolder({ ...match, 站位: basePositions }, branch.possession),
    本节球队犯规: teamFouls, 回合阶段: nextPhase, 待处理情境: pending,
    球员状态: statuses, 回合情境: settlement.summary,
    回合摘要: `${contract.intent.action} · ${branch.label} · ${settlement.summary}`,
  };

  for (const side of ['主', '客'] as const) {
    const fouledOut = next.阵容[side].场上.find(key => next.球员状态[key]?.犯规 >= 6);
    const replacement = next.阵容[side].替补.find(key => (next.球员状态[key]?.犯规 ?? 0) < 6);
    if (fouledOut && replacement) {
      next = {
        ...next, 回合阶段: '死球', 待处理情境: { type: 'deadBall', reason: `${fouledOut}六犯离场`, inboundSide: next.球权 },
        阵容: { ...next.阵容, [side]: { 场上: next.阵容[side].场上.map(key => key === fouledOut ? replacement : key), 替补: next.阵容[side].替补.map(key => key === replacement ? fouledOut : key) } },
        站位: { ...next.站位, [side]: next.站位[side].map(spot => spot.球员 === fouledOut ? { ...spot, 球员: replacement } : spot) },
      };
    }
  }
  return advancePeriodIfNeeded(next);
}

export function buildCanonicalAssistant(raw: string, settlement: NormalizedSettlement, nextMatch: MatchState, extraVariables: Record<string, unknown> = {}): string {
  const narrative = raw
    .replace(/<NBASettlement>[\s\S]*?<\/NBASettlement>/gi, '')
    .replace(/<Variable(Think|Insert|Edit|Delete)>[\s\S]*?<\/Variable\1>/gi, '')
    .trim();
  const publicSettlement = { contractId: settlement.contractId, branchId: settlement.branchId, clockSeconds: settlement.clockSeconds, shotClockSeconds: settlement.shotClockSeconds, staminaDelta: settlement.staminaDelta, summary: settlement.summary, source: settlement.source };
  return `${narrative}\n<NBASettlement>${JSON.stringify(publicSettlement)}</NBASettlement>\n<VariableThink>比赛数值已由前端合同校验并规范化。</VariableThink>\n<VariableEdit>${JSON.stringify({ 比赛: nextMatch, ...extraVariables })}</VariableEdit>`;
}

export interface SettlementAssistantResult {
  assistantText: string;
  settlement: NormalizedSettlement;
  nextMatch: MatchState;
  validationErrors: string[];
}

/** 模型提案→一次修复→确定性回退；修复输出永不单独持久化。 */
export async function settleAssistantResponse(
  raw: string,
  contract: SettlementContract,
  match: MatchState,
  repair: (prompt: string) => Promise<string>,
  extraVariables?: (settlement: NormalizedSettlement, nextMatch: MatchState) => Record<string, unknown>,
): Promise<SettlementAssistantResult> {
  const initial = extractSettlementProposal(raw);
  const initialErrors = validateSettlementProposal(initial, contract);
  let proposal = initial;
  let source: NormalizedSettlement['source'] = 'model';
  const validationErrors = [...initialErrors];
  if (initialErrors.length) {
    source = 'repair';
    const repairPrompt = [
      '你上一份 NBASettlement 不合法。只返回修正后的 <NBASettlement>{JSON}</NBASettlement>，不要叙事、解释或变量块。',
      `合同：${JSON.stringify(contract)}`,
      `非法提案：${JSON.stringify(initial)}`,
      `错误：${initialErrors.join('；')}`,
    ].join('\n');
    try {
      const repairedRaw = await repair(repairPrompt);
      proposal = extractSettlementProposal(repairedRaw);
      const repairErrors = validateSettlementProposal(proposal, contract);
      validationErrors.push(...repairErrors.map(error => `修复：${error}`));
      if (repairErrors.length) { proposal = fallbackProposal(contract); source = 'fallback'; }
    } catch (error) {
      validationErrors.push(`修复请求失败：${error instanceof Error ? error.message : String(error)}`);
      proposal = fallbackProposal(contract);
      source = 'fallback';
    }
  }
  const settlement = normalizeSettlement(proposal, contract, source);
  const nextMatch = applySettlement(match, settlement, contract);
  return { assistantText: buildCanonicalAssistant(raw, settlement, nextMatch, extraVariables?.(settlement, nextMatch)), settlement, nextMatch, validationErrors };
}
