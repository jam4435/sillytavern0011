import { ACTION_SPECS } from './attributes';
import { resolveAction } from './resolveAction';
import { applySettlement, normalizeSettlement } from './settlement';
import { cpuTendencies } from './tendencies';
import type {
  ActionResolution,
  ActionType,
  MatchState,
  NormalizedSettlement,
  OnCourtStatus,
  PlayerData,
  SettlementBranch,
  Side,
  SituationContext,
} from './types';

export type PlayerResolver = (key: string) => PlayerData | undefined;
export type RandomSource = () => number;

export interface PossessionPlan {
  offense: Side;
  defense: Side;
  initiator: string;
  action: ActionType;
  partner: string | null;
  primaryDefender: string | null;
  reason: string;
}

export interface PossessionStep {
  actor: string;
  action: ActionType;
  partner: string | null;
  tier: ActionResolution['tier'];
  branchId: string;
  label: string;
}

export interface PossessionResult {
  match: MatchState;
  plan: PossessionPlan;
  steps: PossessionStep[];
  summary: string;
  involvedPlayers: string[];
  possessionsCompleted: number;
}

const opposite = (side: Side): Side => side === '主' ? '客' : '主';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const randomInt = (rng: RandomSource, min: number, max: number) => Math.round(min + (max - min) * rng());

function weightedPick<T>(items: { item: T; weight: number }[], rng: RandomSource): T {
  const safe = items.map(entry => ({ ...entry, weight: Math.max(.001, entry.weight) }));
  const total = safe.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * total;
  for (const entry of safe) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }
  return safe.at(-1)!.item;
}

function playerOrThrow(resolvePlayer: PlayerResolver, key: string): PlayerData {
  const player = resolvePlayer(key);
  if (!player) throw new Error(`CPU 回合找不到球员：${key}`);
  return player;
}

function spotOf(match: MatchState, side: Side, key: string) {
  return match.站位[side].find(spot => spot.球员 === key);
}

function nearestDefender(match: MatchState, offense: Side, actor: string, exclude?: string | null): string | null {
  const defense = opposite(offense);
  const actorSpot = spotOf(match, offense, actor);
  const candidates = match.站位[defense].filter(spot => spot.球员 !== exclude);
  if (!candidates.length) return null;
  if (!actorSpot) return candidates[0].球员;
  return [...candidates].sort(
    (a, b) =>
      Math.hypot(a.x - actorSpot.x, a.y - actorSpot.y) -
      Math.hypot(b.x - actorSpot.x, b.y - actorSpot.y),
  )[0]?.球员 ?? null;
}

function setBallHolder(match: MatchState, side: Side, holder: string): MatchState['站位'] {
  return {
    主: match.站位.主.map(spot => ({ ...spot, 持球: side === '主' && spot.球员 === holder })),
    客: match.站位.客.map(spot => ({ ...spot, 持球: side === '客' && spot.球员 === holder })),
  };
}

/** 把 CPU 已决定的发起人投影为真实持球状态，供模拟或交还玩家控制。 */
export function prepareMatchForPlan(match: MatchState, plan: PossessionPlan): MatchState {
  if (!match.阵容[plan.offense].场上.includes(plan.initiator)) return match;
  return {
    ...match,
    球权: plan.offense,
    站位: setBallHolder(match, plan.offense, plan.initiator),
    回合情境: plan.reason,
  };
}

function chooseInitiator(match: MatchState, offense: Side, resolvePlayer: PlayerResolver, rng: RandomSource): string {
  const onCourt = match.阵容[offense].场上;
  const holder = match.站位[offense].find(spot => spot.持球)?.球员;
  return weightedPick(
    onCourt.map(key => {
      const player = playerOrThrow(resolvePlayer, key);
      const t = cpuTendencies(player);
      const holderBoost = key === holder ? 1.35 : 1;
      const tactic = match.战术[offense].offense;
      const schemeBoost = tactic === '挡拆' ? .55 * t.pickRollHandler + .45 * t.handling
        : tactic === '低位' ? .65 * t.post + .35 * t.usage
        : tactic === '动态进攻' ? .35 * t.usage + .35 * t.passing + .3 * t.offBall
        : .55 * t.usage + .45 * t.handling;
      return { item: key, weight: holderBoost * Math.max(8, schemeBoost) };
    }),
    rng,
  );
}

function choosePartner(
  match: MatchState,
  offense: Side,
  initiator: string,
  action: ActionType,
  resolvePlayer: PlayerResolver,
  rng: RandomSource,
): string | null {
  const others = match.阵容[offense].场上.filter(key => key !== initiator);
  if (!others.length) return null;
  if (!['挡拆突破', '顺下传球', '外弹传球', '突破分球', '安全传球', '跨场转移'].includes(action)) return null;
  return weightedPick(
    others.map(key => {
      const player = playerOrThrow(resolvePlayer, key);
      const t = cpuTendencies(player);
      const weight = action === '挡拆突破' || action === '顺下传球'
        ? t.pickRollScreener * 1.4 + t.rim
        : action === '外弹传球' || action === '突破分球'
          ? t.spotUp * 1.3 + t.three
          : t.spotUp + t.rim + t.usage * .5;
      return { item: key, weight };
    }),
    rng,
  );
}

function actionWeights(player: PlayerData, match: MatchState, side: Side): { item: ActionType; weight: number }[] {
  const t = cpuTendencies(player);
  const scheme = match.战术[side].offense;
  const weights: { item: ActionType; weight: number }[] = [
    { item: '突破终结', weight: t.rim * .8 + t.handling * .5 },
    { item: '突破分球', weight: t.handling * .55 + t.passing * .7 },
    { item: '急停投篮', weight: t.mid * .75 + t.handling * .45 },
    { item: '后撤步', weight: t.three * .7 + t.handling * .55 },
    { item: '定点投篮', weight: t.three * .9 + t.spotUp * .55 },
    { item: '背身单打', weight: t.post * 1.15 },
    { item: '挡拆突破', weight: t.pickRollHandler * 1.05 },
    { item: '顺下传球', weight: t.pickRollHandler * .5 + t.passing * .65 },
    { item: '外弹传球', weight: t.pickRollHandler * .45 + t.passing * .6 },
    { item: '安全传球', weight: t.passing * .75 },
    { item: '跨场转移', weight: t.passing * .72 + t.handling * .18 },
  ];

  const boost = (action: ActionType, factor: number) => {
    const entry = weights.find(item => item.item === action);
    if (entry) entry.weight *= factor;
  };

  if (scheme === '挡拆') {
    boost('挡拆突破', 2.2);
    boost('顺下传球', 1.8);
    boost('外弹传球', 1.6);
  } else if (scheme === '低位') {
    boost('背身单打', 2.6);
    boost('突破终结', 1.25);
    boost('后撤步', .55);
  } else if (scheme === '五外') {
    boost('定点投篮', 1.65);
    boost('后撤步', 1.35);
    boost('突破分球', 1.45);
    boost('背身单打', .45);
  } else if (scheme === '四外一内') {
    boost('突破分球', 1.35);
    boost('背身单打', 1.4);
    boost('定点投篮', 1.25);
  } else if (scheme === '动态进攻') {
    boost('安全传球', 1.4);
    boost('跨场转移', 1.35);
    boost('定点投篮', 1.35);
    boost('突破分球', 1.25);
  }

  return weights;
}

export function planPossession(match: MatchState, resolvePlayer: PlayerResolver, rng: RandomSource = Math.random): PossessionPlan {
  const offense = match.球权;
  const defense = opposite(offense);
  const initiator = chooseInitiator(match, offense, resolvePlayer, rng);
  const actor = playerOrThrow(resolvePlayer, initiator);
  const action = weightedPick(actionWeights(actor, match, offense), rng);
  const partner = choosePartner(match, offense, initiator, action, resolvePlayer, rng);
  const primaryDefender = nearestDefender(match, offense, initiator);
  return {
    offense,
    defense,
    initiator,
    action,
    partner,
    primaryDefender,
    reason: `${match.战术[offense].offense} · ${actor.cn}发起${action}`,
  };
}

function coverageOf(match: MatchState, offense: Side, actor: string, defender: string | null): SituationContext['coverage'] {
  const actorSpot = spotOf(match, offense, actor);
  const defenderSpot = defender ? spotOf(match, opposite(offense), defender) : undefined;
  if (!actorSpot || !defenderSpot) return 'normal';
  const distance = Math.hypot(actorSpot.x - defenderSpot.x, actorSpot.y - defenderSpot.y);
  return distance > 18 ? 'open' : distance < 8 ? 'tight' : 'normal';
}

function buildSituation(
  match: MatchState,
  offense: Side,
  actor: string,
  defender: string | null,
): SituationContext {
  const defense = opposite(offense);
  return {
    isHome: offense === '主',
    isClutch: match.节次 >= 4 && match.剩余秒数 <= 120 && Math.abs(match.比分.主 - match.比分.客) <= 5,
    coverage: coverageOf(match, offense, actor, defender),
    mismatch: false,
    defenderFouls: defender ? match.球员状态[defender]?.犯规 ?? 0 : 0,
    actorSpot: spotOf(match, offense, actor),
    defenderSpots: match.站位[defense],
    teammateSpots: match.站位[offense],
    offenseTactic: match.战术[offense],
    defenseTactic: match.战术[defense],
  };
}

function chooseBranch(resolution: ActionResolution, actor: PlayerData, rng: RandomSource): SettlementBranch {
  if (resolution.contract.branches.length === 1) return resolution.contract.branches[0];
  const andOne = resolution.contract.branches.find(branch => branch.id === 'and-one');
  if (andOne) {
    const chance = clamp(cpuTendencies(actor).drawFoul / 500, .05, .22);
    if (rng() < chance) return andOne;
  }
  return resolution.contract.branches.find(branch => branch.id !== 'and-one') ?? resolution.contract.branches[0];
}

function cpuSettlement(
  resolution: ActionResolution,
  branch: SettlementBranch,
  rng: RandomSource,
): NormalizedSettlement {
  const contract = resolution.contract;
  const proposal = {
    contractId: contract.id,
    branchId: branch.id,
    clockSeconds: randomInt(rng, contract.clockSeconds.min, contract.clockSeconds.max),
    shotClockSeconds: randomInt(rng, contract.shotClockSeconds.min, contract.shotClockSeconds.max),
    staminaDelta: {
      actor: randomInt(rng, contract.staminaDelta.actor.min, contract.staminaDelta.actor.max),
      ...(contract.staminaDelta.partner
        ? { partner: randomInt(rng, contract.staminaDelta.partner.min, contract.staminaDelta.partner.max) }
        : {}),
    },
    summary: `CPU：${resolution.summary} · ${branch.label}`,
  };
  return normalizeSettlement(proposal, contract, 'cpu');
}

function resolveOneAction(
  match: MatchState,
  offense: Side,
  actorKey: string,
  action: ActionType,
  partnerKey: string | null,
  resolvePlayer: PlayerResolver,
  rng: RandomSource,
): { match: MatchState; resolution: ActionResolution; branch: SettlementBranch } {
  const actor = playerOrThrow(resolvePlayer, actorKey);
  const partner = partnerKey ? playerOrThrow(resolvePlayer, partnerKey) : null;
  const defenderKey = nearestDefender(match, offense, actorKey);
  const defender = defenderKey ? playerOrThrow(resolvePlayer, defenderKey) : null;
  const partnerDefenderKey = partnerKey ? nearestDefender(match, offense, partnerKey, defenderKey) : null;
  const partnerDefender = partnerDefenderKey ? playerOrThrow(resolvePlayer, partnerDefenderKey) : null;
  const defenders = match.阵容[opposite(offense)].场上.map(key => playerOrThrow(resolvePlayer, key));
  const resolution = resolveAction({
    action,
    actor,
    actorStatus: match.球员状态[actorKey],
    defender,
    defenders,
    partner,
    partnerDefender,
    actionSide: offense,
    match,
    situation: buildSituation(match, offense, actorKey, defenderKey),
    rollDice: () => Math.floor(rng() * 100) + 1,
  });
  const branch = chooseBranch(resolution, actor, rng);
  const settlement = cpuSettlement(resolution, branch, rng);
  return { match: applySettlement(match, settlement, resolution.contract), resolution, branch };
}

function addAssist(match: MatchState, passer: string): MatchState {
  const status = match.球员状态[passer];
  if (!status) return match;
  return {
    ...match,
    球员状态: {
      ...match.球员状态,
      [passer]: { ...status, 助攻: status.助攻 + 1 },
    },
  };
}

function reboundWeight(player: PlayerData, offensive: boolean): number {
  const a = player.attrs;
  return offensive
    ? a.offRebound * 1.55 + a.hustle * .45 + a.vertical * .4 + a.strength * .3 + player.body.wingspanCm * .08
    : a.defRebound * 1.65 + a.boxout * .65 + a.vertical * .35 + a.strength * .35 + player.body.wingspanCm * .08;
}

function settleRebound(match: MatchState, resolvePlayer: PlayerResolver, rng: RandomSource): MatchState {
  if (match.待处理情境.type !== 'rebound') return match;
  const shootingSide = match.待处理情境.shootingSide;
  const defenseSide = opposite(shootingSide);
  const offenseTactic = match.战术[shootingSide].rebound;
  const defenseTactic = match.战术[defenseSide].rebound;
  const candidates = [
    ...match.阵容[shootingSide].场上.map(key => {
      const player = playerOrThrow(resolvePlayer, key);
      const tactic = offenseTactic === '冲抢' ? 1.3 : offenseTactic === '优先退防' ? .55 : 1;
      return { key, side: shootingSide, weight: reboundWeight(player, true) * tactic };
    }),
    ...match.阵容[defenseSide].场上.map(key => {
      const player = playerOrThrow(resolvePlayer, key);
      const tactic = defenseTactic === '冲抢' ? 1.15 : 1;
      return { key, side: defenseSide, weight: reboundWeight(player, false) * tactic * 1.18 };
    }),
  ];
  const winner = weightedPick(candidates.map(item => ({ item, weight: item.weight })), rng);
  const status = match.球员状态[winner.key];
  if (!status) return match;
  const offensive = winner.side === shootingSide;
  const nextStatus: OnCourtStatus = {
    ...status,
    篮板: status.篮板 + 1,
    进攻篮板: status.进攻篮板 + (offensive ? 1 : 0),
    防守篮板: status.防守篮板 + (offensive ? 0 : 1),
  };
  return {
    ...match,
    球权: winner.side,
    投篮时钟: offensive ? 14 : 24,
    站位: setBallHolder(match, winner.side, winner.key),
    球员状态: { ...match.球员状态, [winner.key]: nextStatus },
    回合阶段: '常规回合',
    待处理情境: { type: 'none' },
    回合情境: `${resolvePlayer(winner.key)?.cn ?? winner.key}抢下${offensive ? '进攻' : '防守'}篮板`,
    回合摘要: `${resolvePlayer(winner.key)?.cn ?? winner.key} ${offensive ? '进攻篮板' : '防守篮板'}`,
  };
}

function settleFreeThrows(match: MatchState, resolvePlayer: PlayerResolver, rng: RandomSource): MatchState {
  let next = match;
  while (next.待处理情境.type === 'freeThrow') {
    const pending = next.待处理情境;
    const shooter = playerOrThrow(resolvePlayer, pending.shooter);
    const status = next.球员状态[pending.shooter];
    if (!status) break;
    const made = rng() * 100 < shooter.attrs.freeThrow;
    const remaining = pending.remaining - 1;
    const score = { ...next.比分, [pending.shootingSide]: next.比分[pending.shootingSide] + (made ? 1 : 0) };
    next = {
      ...next,
      比分: score,
      球员状态: {
        ...next.球员状态,
        [pending.shooter]: {
          ...status,
          得分: status.得分 + (made ? 1 : 0),
          罚球出手: status.罚球出手 + 1,
          罚球命中: status.罚球命中 + (made ? 1 : 0),
        },
      },
      待处理情境: remaining > 0 ? { ...pending, remaining } : { type: 'none' },
      回合阶段: remaining > 0 ? '罚球结算' : '常规回合',
      回合摘要: `${shooter.cn}罚球${made ? '命中' : '不中'}`,
    };
    if (remaining === 0) {
      if (made) {
        const possession = opposite(pending.shootingSide);
        const holder = next.阵容[possession].场上[0];
        next = { ...next, 球权: possession, 投篮时钟: 24, 站位: setBallHolder(next, possession, holder) };
      } else {
        next = {
          ...next,
          回合阶段: '篮板争抢',
          待处理情境: { type: 'rebound', shootingSide: pending.shootingSide, shooter: pending.shooter, zone: '罚球' },
        };
        next = settleRebound(next, resolvePlayer, rng);
      }
    }
  }
  return next;
}

function normalizeDeadBall(match: MatchState): MatchState {
  if (match.回合阶段 !== '死球' || match.待处理情境.type !== 'deadBall') return match;
  if (!match.进行中 || match.待处理情境.reason === '比赛结束') return match;
  const holder = match.阵容[match.球权].场上[0];
  return {
    ...match,
    投篮时钟: 24,
    站位: setBallHolder(match, match.球权, holder),
    回合阶段: '常规回合',
    待处理情境: { type: 'none' },
  };
}

function bestFinisher(match: MatchState, offense: Side, exclude: string, resolvePlayer: PlayerResolver, rng: RandomSource): string {
  const candidates = match.阵容[offense].场上.filter(key => key !== exclude);
  if (!candidates.length) return exclude;
  return weightedPick(
    candidates.map(key => {
      const player = playerOrThrow(resolvePlayer, key);
      const t = cpuTendencies(player);
      return { item: key, weight: t.usage * .5 + Math.max(t.three, t.rim, t.mid, t.post) };
    }),
    rng,
  );
}

function finishingAction(player: PlayerData, match: MatchState, side: Side, rng: RandomSource): ActionType {
  const t = cpuTendencies(player);
  const items: { item: ActionType; weight: number }[] = [
    { item: '定点投篮', weight: t.three * (match.战术[side].offense === '五外' ? 1.4 : 1) },
    { item: '急停投篮', weight: t.mid },
    { item: '突破终结', weight: t.rim },
    { item: '背身单打', weight: t.post * (match.战术[side].offense === '低位' ? 1.5 : .8) },
  ];
  return weightedPick(items, rng);
}

/**
 * 模拟一个真正的进攻回合。
 * 允许 1~3 个动作阶段；传导/挡拆创造优势后会自动找到终结者，投丢后自动结算篮板。
 */
export function simulatePossession(
  match: MatchState,
  resolvePlayer: PlayerResolver,
  options: { rng?: RandomSource; plan?: PossessionPlan; maxSteps?: number } = {},
): PossessionResult {
  const rng = options.rng ?? Math.random;
  const initialPlan = options.plan ?? planPossession(match, resolvePlayer, rng);
  const initialOffense = initialPlan.offense;
  const steps: PossessionStep[] = [];
  const involved = new Set<string>([
    initialPlan.initiator,
    ...(initialPlan.partner ? [initialPlan.partner] : []),
    ...(initialPlan.primaryDefender ? [initialPlan.primaryDefender] : []),
  ]);
  let current = prepareMatchForPlan(match, initialPlan);
  let actor = initialPlan.initiator;
  let action = initialPlan.action;
  let partner = initialPlan.partner;
  let assistCandidate: string | null = null;
  const maxSteps = Math.max(1, Math.min(3, options.maxSteps ?? 3));

  for (let index = 0; index < maxSteps && current.进行中; index++) {
    if (current.球权 !== initialOffense) break;
    const beforeScore = current.比分[initialOffense];
    const outcome = resolveOneAction(current, initialOffense, actor, action, partner, resolvePlayer, rng);
    current = outcome.match;
    steps.push({
      actor,
      action,
      partner,
      tier: outcome.resolution.tier,
      branchId: outcome.branch.id,
      label: outcome.branch.label,
    });
    involved.add(actor);
    if (partner) involved.add(partner);
    outcome.resolution.defenders.forEach(key => involved.add(key));

    const family = ACTION_SPECS[action].family;
    if (['传球', '挡拆'].includes(family) || action === '突破分球') assistCandidate = actor;

    if (current.回合阶段 === '罚球结算') current = settleFreeThrows(current, resolvePlayer, rng);
    if (current.回合阶段 === '篮板争抢') current = settleRebound(current, resolvePlayer, rng);
    current = normalizeDeadBall(current);

    const scored = current.比分[initialOffense] > beforeScore;
    if (scored && assistCandidate && assistCandidate !== actor) current = addAssist(current, assistCandidate);
    if (current.球权 !== initialOffense) break;

    if (index < maxSteps - 1) {
      const nextActor = partner && current.阵容[initialOffense].场上.includes(partner)
        ? partner
        : bestFinisher(current, initialOffense, actor, resolvePlayer, rng);
      actor = nextActor;
      const nextPlayer = playerOrThrow(resolvePlayer, actor);
      action = finishingAction(nextPlayer, current, initialOffense, rng);
      partner = null;
      current = { ...current, 站位: setBallHolder(current, initialOffense, actor) };
    }
  }

  // 三阶段仍未终结时，最后强制以当前持球人的一次终结完成 possession，避免无限“传导成功”。
  if (current.进行中 && current.球权 === initialOffense && steps.length >= maxSteps) {
    const holder = current.站位[initialOffense].find(spot => spot.持球)?.球员 ?? actor;
    const finisher = playerOrThrow(resolvePlayer, holder);
    const final = resolveOneAction(current, initialOffense, holder, finishingAction(finisher, current, initialOffense, rng), null, resolvePlayer, rng);
    current = final.match;
    steps.push({ actor: holder, action: final.resolution.action, partner: null, tier: final.resolution.tier, branchId: final.branch.id, label: final.branch.label });
    if (current.回合阶段 === '罚球结算') current = settleFreeThrows(current, resolvePlayer, rng);
    if (current.回合阶段 === '篮板争抢') current = settleRebound(current, resolvePlayer, rng);
    current = normalizeDeadBall(current);
  }

  const summary = steps
    .map(step => `${resolvePlayer(step.actor)?.cn ?? step.actor}${step.action}→${step.label}`)
    .join('；');
  return {
    match: current,
    plan: initialPlan,
    steps,
    summary,
    involvedPlayers: [...involved],
    possessionsCompleted: current.球权 !== initialOffense || !current.进行中 ? 1 : 0,
  };
}
