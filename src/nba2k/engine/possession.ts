import { ACTION_SPECS } from './attributes';
import { buildFormation } from './positioning';
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

interface PossessionFlowContext {
  advantageModifier: number;
  turnoverPressure: number;
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

function attackRightFor(match: MatchState, offense: Side): boolean {
  // NBA 下半场换边；加时沿用下半场篮筐。
  const rightAttackingSide: Side = match.节次 <= 2 ? '主' : '客';
  return offense === rightAttackingSide;
}

function rebuildCourt(match: MatchState, offense: Side, holder: string, resolvePlayer: PlayerResolver): MatchState['站位'] {
  const defense = opposite(offense);
  const offenseEntries = match.阵容[offense].场上.map(key => ({ key, pos: playerOrThrow(resolvePlayer, key).pos }));
  const defenseEntries = match.阵容[defense].场上.map(key => ({ key, pos: playerOrThrow(resolvePlayer, key).pos }));
  return buildFormation({
    offense: offenseEntries,
    defense: defenseEntries,
    offenseSide: offense,
    tactic: match.战术[offense].offense,
    defenseScheme: match.战术[defense].defense,
    ballHolder: holder,
    attackRight: attackRightFor(match, offense),
  });
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

export function prepareMatchForPlan(match: MatchState, plan: PossessionPlan, resolvePlayer?: PlayerResolver): MatchState {
  if (!match.阵容[plan.offense].场上.includes(plan.initiator)) return match;
  return {
    ...match,
    球权: plan.offense,
    站位: resolvePlayer
      ? rebuildCourt(match, plan.offense, plan.initiator, resolvePlayer)
      : setBallHolder(match, plan.offense, plan.initiator),
    回合情境: plan.reason,
  };
}

function chooseInitiator(match: MatchState, offense: Side, resolvePlayer: PlayerResolver, rng: RandomSource): string {
  const onCourt = match.阵容[offense].场上;
  const holder = match.站位[offense].find(spot => spot.持球)?.球员;
  const tactic = match.战术[offense].offense;
  return weightedPick(
    onCourt.map(key => {
      const player = playerOrThrow(resolvePlayer, key);
      const t = cpuTendencies(player);
      const role =
        tactic === '挡拆' ? t.pickRollHandler :
        tactic === '低位' ? Math.max(t.post, t.initiation * .7) :
        tactic === '动态进攻' ? t.passing * .55 + t.offBall * .45 :
        tactic === '五外' ? t.handling * .55 + t.passing * .25 + t.three * .2 :
        t.initiation;
      const core = t.initiation * .52 + t.usage * .28 + role * .20;
      const holderBoost = key === holder ? 1.10 : 1;
      return { item: key, weight: holderBoost * Math.pow(Math.max(8, core), 1.28) };
    }),
    rng,
  );
}

function tendencyCurve(value: number, threshold: number): number {
  return 1 + Math.pow(Math.max(0, value - threshold), 1.18);
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
      const weight =
        action === '挡拆突破' || action === '顺下传球'
          ? t.pickRollScreener * 1.25 + tendencyCurve(t.rim, 30) * .45
          : action === '外弹传球' || action === '突破分球'
            ? tendencyCurve(t.spotUp, 35) * .8 + tendencyCurve(t.three, 40) * .75 + t.usage
            : t.passing * .35 + t.usage * .5 + Math.max(t.spotUp, t.rim) * .45;
      return { item: key, weight };
    }),
    rng,
  );
}

function actionWeights(player: PlayerData, match: MatchState, side: Side): { item: ActionType; weight: number }[] {
  const t = cpuTendencies(player);
  const scheme = match.战术[side].offense;
  const rim = tendencyCurve(t.rim, 28);
  const mid = tendencyCurve(t.mid, 35);
  const three = tendencyCurve(t.three, 40);
  const post = tendencyCurve(t.post, 42);
  const weights: { item: ActionType; weight: number }[] = [
    { item: '突破终结', weight: rim * .85 + t.handling * .22 },
    { item: '突破分球', weight: t.handling * .5 + t.passing * .72 },
    { item: '急停投篮', weight: mid * .9 + t.handling * .18 },
    { item: '后撤步', weight: three * .82 + t.handling * .24 },
    { item: '定点投篮', weight: three * .98 + tendencyCurve(t.spotUp, 40) * .28 },
    { item: '背身单打', weight: post * 1.05 },
    { item: '挡拆突破', weight: t.pickRollHandler * .95 + t.handling * .18 },
    { item: '顺下传球', weight: t.pickRollHandler * .42 + t.passing * .68 },
    { item: '外弹传球', weight: t.pickRollHandler * .38 + t.passing * .62 },
    { item: '安全传球', weight: t.passing * .72 },
    { item: '跨场转移', weight: t.passing * .62 + t.handling * .14 },
  ];

  const boost = (action: ActionType, factor: number) => {
    const entry = weights.find(item => item.item === action);
    if (entry) entry.weight *= factor;
  };

  if (scheme === '挡拆') {
    boost('挡拆突破', 2.0);
    boost('顺下传球', 1.7);
    boost('外弹传球', 1.45);
  } else if (scheme === '低位') {
    boost('背身单打', 2.25);
    boost('突破终结', 1.15);
    boost('后撤步', .45);
  } else if (scheme === '五外') {
    boost('定点投篮', 1.55);
    boost('后撤步', 1.25);
    boost('突破分球', 1.35);
    boost('背身单打', .35);
  } else if (scheme === '四外一内') {
    boost('突破分球', 1.28);
    boost('背身单打', 1.25);
    boost('定点投篮', 1.18);
  } else if (scheme === '动态进攻') {
    boost('安全传球', 1.25);
    boost('跨场转移', 1.18);
    boost('定点投篮', 1.22);
    boost('突破分球', 1.18);
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
  const primaryDefender = nearestDefender(
    prepareMatchForPlan(match, { offense, defense, initiator, action, partner, primaryDefender: null, reason: '' }, resolvePlayer),
    offense,
    initiator,
  );
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
  return distance > 15.5 ? 'open' : distance < 6.5 ? 'tight' : 'normal';
}

function buildSituation(
  match: MatchState,
  offense: Side,
  actor: string,
  defender: string | null,
  flow: PossessionFlowContext,
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
    advantageModifier: flow.advantageModifier,
    turnoverPressure: flow.turnoverPressure + (match.投篮时钟 <= 8 ? 3 : match.投篮时钟 <= 12 ? 1.5 : 0),
  };
}

function actionFoulChance(action: ActionType, actor: PlayerData): number {
  const draw = (actor.attrs.drawFoul - 70) * .003;
  const base =
    action === '突破终结' ? .50 :
    action === '背身单打' ? .34 :
    action === '急停投篮' || action === '突破急停' ? .18 :
    action === '后撤步' ? .13 :
    action === '定点投篮' ? .10 :
    .12;
  return clamp(base + draw, .04, .68);
}

function andOneChance(action: ActionType, actor: PlayerData): number {
  const draw = (actor.attrs.drawFoul - 70) * .0018;
  const base = action === '突破终结' ? .10 : action === '背身单打' ? .07 : .025;
  return clamp(base + draw, .015, .18);
}

function passingTurnoverChance(resolution: ActionResolution, actor: PlayerData): number {
  const action = resolution.action;
  const risk =
    action === '安全传球' ? .18 :
    action === '跨场转移' ? .42 :
    action === '突破分球' ? .34 :
    action === '挡拆突破' ? .25 :
    action === '顺下传球' || action === '外弹传球' ? .30 :
    .24;
  const skill = (actor.attrs.passAccuracy + actor.attrs.passIQ + actor.attrs.ballControl) / 3;
  const matchup = (resolution.defenseScore - resolution.attackScore) * .004;
  return clamp(risk + (70 - skill) * .004 + matchup, .10, .64);
}

function chooseBranch(resolution: ActionResolution, actor: PlayerData, rng: RandomSource): SettlementBranch {
  const branches = resolution.contract.branches;
  if (branches.length === 1) return branches[0];

  const foul = branches.find(branch => branch.id === 'shooting-foul');
  if (foul && rng() < actionFoulChance(resolution.action, actor)) return foul;

  const andOne = branches.find(branch => branch.id === 'and-one');
  if (andOne && rng() < andOneChance(resolution.action, actor)) return andOne;

  const offensiveFoul = branches.find(branch => branch.id === 'offensive-foul');
  if (offensiveFoul) {
    const chance = resolution.action === '突破终结' || resolution.action === '背身单打' ? .16 : .06;
    if (rng() < chance) return offensiveFoul;
  }

  const blocked = branches.find(branch => branch.id === 'blocked-out');
  if (blocked) {
    const blockChance = clamp(.045 + Math.max(0, resolution.defenseScore - 65) * .0025, .03, .14);
    if (rng() < blockChance) return blocked;
  }

  const turnover = branches.find(branch => branch.id === 'turnover');
  const stolen = branches.find(branch => branch.id === 'turnover-steal');
  const reset = branches.find(branch => branch.id === 'reset');
  if ((turnover || stolen) && resolution.tier === '大失败') {
    if (stolen && rng() < clamp(.52 + (resolution.defenseScore - resolution.attackScore) * .008, .35, .75)) return stolen;
    return turnover ?? stolen!;
  }
  if ((turnover || stolen) && reset) {
    if (rng() < passingTurnoverChance(resolution, actor)) {
      if (stolen && rng() < clamp(.5 + (resolution.defenseScore - resolution.attackScore) * .006, .30, .72)) return stolen;
      return turnover ?? stolen!;
    }
    return reset;
  }

  return branches.find(branch => !['shooting-foul', 'and-one', 'offensive-foul', 'blocked-out'].includes(branch.id)) ?? branches[0];
}

function cpuSettlement(
  match: MatchState,
  resolution: ActionResolution,
  branch: SettlementBranch,
  rng: RandomSource,
): NormalizedSettlement {
  const contract = resolution.contract;
  const clockSeconds = randomInt(rng, contract.clockSeconds.min, contract.clockSeconds.max);
  const proposal = {
    contractId: contract.id,
    branchId: branch.id,
    clockSeconds,
    shotClockSeconds: Math.max(0, match.投篮时钟 - clockSeconds),
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
  flow: PossessionFlowContext,
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
    situation: buildSituation(match, offense, actorKey, defenderKey, flow),
    rollDice: () => Math.floor(rng() * 100) + 1,
  });
  const branch = chooseBranch(resolution, actor, rng);
  const settlement = cpuSettlement(match, resolution, branch, rng);
  let next = applySettlement(match, settlement, resolution.contract);
  if (next.球权 !== match.球权 && next.进行中 && next.回合阶段 === '常规回合') {
    const holder = next.阵容[next.球权].场上[0];
    if (holder) next = { ...next, 站位: rebuildCourt(next, next.球权, holder, resolvePlayer) };
  }
  return { match: next, resolution, branch };
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

function teamReboundStrength(players: PlayerData[], offensive: boolean): number {
  const values = players.map(player => reboundWeight(player, offensive)).sort((a, b) => b - a);
  const take = offensive ? values.slice(0, 2) : values.slice(0, 3);
  return take.reduce((sum, value) => sum + value, 0) / Math.max(1, take.length);
}

function settleRebound(match: MatchState, resolvePlayer: PlayerResolver, rng: RandomSource): MatchState {
  if (match.待处理情境.type !== 'rebound') return match;
  const shootingSide = match.待处理情境.shootingSide;
  const defenseSide = opposite(shootingSide);
  const offensePlayers = match.阵容[shootingSide].场上.map(key => playerOrThrow(resolvePlayer, key));
  const defensePlayers = match.阵容[defenseSide].场上.map(key => playerOrThrow(resolvePlayer, key));
  const offenseTactic = match.战术[shootingSide].rebound;
  const defenseTactic = match.战术[defenseSide].rebound;
  const offStrength = teamReboundStrength(offensePlayers, true);
  const defStrength = teamReboundStrength(defensePlayers, false);
  const tacticDelta = offenseTactic === '冲抢' ? .055 : offenseTactic === '优先退防' ? -.045 : 0;
  const defenseDelta = defenseTactic === '冲抢' ? -.015 : 0;
  const offensiveChance = clamp(.235 + tacticDelta + defenseDelta + (offStrength - defStrength) * .00135, .16, .36);
  const offensive = rng() < offensiveChance;
  const pool = offensive ? offensePlayers : defensePlayers;
  const winner = weightedPick(
    pool.map(player => ({ item: player, weight: reboundWeight(player, offensive) })),
    rng,
  );
  const winnerSide = offensive ? shootingSide : defenseSide;
  const status = match.球员状态[winner.name];
  if (!status) return match;
  const nextStatus: OnCourtStatus = {
    ...status,
    篮板: status.篮板 + 1,
    进攻篮板: status.进攻篮板 + (offensive ? 1 : 0),
    防守篮板: status.防守篮板 + (offensive ? 0 : 1),
  };
  return {
    ...match,
    球权: winnerSide,
    投篮时钟: offensive ? 14 : 24,
    站位: offensive
      ? setBallHolder(match, winnerSide, winner.name)
      : rebuildCourt(match, winnerSide, winner.name, resolvePlayer),
    球员状态: { ...match.球员状态, [winner.name]: nextStatus },
    回合阶段: '常规回合',
    待处理情境: { type: 'none' },
    回合情境: `${winner.cn}抢下${offensive ? '进攻' : '防守'}篮板`,
    回合摘要: `${winner.cn} ${offensive ? '进攻篮板' : '防守篮板'}`,
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
        next = {
          ...next,
          球权: possession,
          投篮时钟: 24,
          站位: holder ? rebuildCourt(next, possession, holder, resolvePlayer) : next.站位,
        };
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

function normalizeDeadBall(match: MatchState, resolvePlayer: PlayerResolver): MatchState {
  if (match.回合阶段 !== '死球' || match.待处理情境.type !== 'deadBall') return match;
  if (!match.进行中 || match.待处理情境.reason === '比赛结束') return match;
  const holder = match.阵容[match.球权].场上[0];
  return {
    ...match,
    投篮时钟: 24,
    站位: holder ? rebuildCourt(match, match.球权, holder, resolvePlayer) : match.站位,
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
      const finishSkill = Math.max(t.three, t.rim, t.mid, t.post);
      return { item: key, weight: Math.pow(Math.max(8, t.usage), 1.45) * (.55 + finishSkill / 100) };
    }),
    rng,
  );
}

function finishingAction(player: PlayerData, match: MatchState, side: Side, rng: RandomSource): ActionType {
  const t = cpuTendencies(player);
  const scheme = match.战术[side].offense;
  const items: { item: ActionType; weight: number }[] = [
    { item: '定点投篮', weight: tendencyCurve(t.three, 40) * (scheme === '五外' ? 1.45 : 1) },
    { item: '急停投篮', weight: tendencyCurve(t.mid, 35) },
    { item: '突破终结', weight: tendencyCurve(t.rim, 28) },
    { item: '背身单打', weight: tendencyCurve(t.post, 42) * (scheme === '低位' ? 1.55 : .8) },
  ];
  return weightedPick(items, rng);
}

function settleShotClockViolation(match: MatchState, offense: Side, resolvePlayer: PlayerResolver): MatchState {
  const holder = match.站位[offense].find(spot => spot.持球)?.球员 ?? match.阵容[offense].场上[0];
  const defense = opposite(offense);
  const nextHolder = match.阵容[defense].场上[0];
  const statuses = { ...match.球员状态 };
  if (holder && statuses[holder]) statuses[holder] = { ...statuses[holder], 失误: statuses[holder].失误 + 1 };
  return {
    ...match,
    球权: defense,
    投篮时钟: 24,
    站位: nextHolder ? rebuildCourt(match, defense, nextHolder, resolvePlayer) : match.站位,
    球员状态: statuses,
    回合阶段: '常规回合',
    待处理情境: { type: 'none' },
    回合情境: '24秒违例',
    回合摘要: '24秒违例，交换球权',
  };
}

export function continuePossessionAfterAdvantage(
  match: MatchState,
  offense: Side,
  preferredActor: string | null,
  resolvePlayer: PlayerResolver,
  rng: RandomSource = Math.random,
): PossessionResult {
  const candidates = match.阵容[offense].场上;
  const currentHolder = match.站位[offense].find(spot => spot.持球)?.球员 ?? candidates[0] ?? '';
  const actor = preferredActor && candidates.includes(preferredActor)
    ? preferredActor
    : bestFinisher(match, offense, currentHolder, resolvePlayer, rng);
  if (!actor) throw new Error('延续进攻时找不到合法终结者');
  const player = playerOrThrow(resolvePlayer, actor);
  const action = finishingAction(player, match, offense, rng);
  const plan: PossessionPlan = {
    offense,
    defense: opposite(offense),
    initiator: actor,
    action,
    partner: null,
    primaryDefender: nearestDefender(match, offense, actor),
    reason: `延续已创造的进攻优势 · ${player.cn}${action}`,
  };
  return simulatePossession(match, resolvePlayer, { rng, plan, maxSteps: 1, initialAdvantageModifier: 5 });
}

export function simulatePossession(
  match: MatchState,
  resolvePlayer: PlayerResolver,
  options: { rng?: RandomSource; plan?: PossessionPlan; maxSteps?: number; initialAdvantageModifier?: number } = {},
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
  let current = prepareMatchForPlan(match, initialPlan, resolvePlayer);
  let actor = initialPlan.initiator;
  let action = initialPlan.action;
  let partner = initialPlan.partner;
  let assistCandidate: string | null = null;
  let flow: PossessionFlowContext = {
    advantageModifier: options.initialAdvantageModifier ?? 0,
    turnoverPressure: 0,
  };
  const maxSteps = Math.max(1, Math.min(3, options.maxSteps ?? 3));

  for (let index = 0; index < maxSteps && current.进行中; index++) {
    if (current.球权 !== initialOffense) break;
    if (current.投篮时钟 <= 0) {
      current = settleShotClockViolation(current, initialOffense, resolvePlayer);
      break;
    }

    if (index === maxSteps - 1 && ['传球', '挡拆', '无球'].includes(ACTION_SPECS[action].family)) {
      const finisher = playerOrThrow(resolvePlayer, actor);
      action = finishingAction(finisher, current, initialOffense, rng);
      partner = null;
    }

    const outcome = resolveOneAction(current, initialOffense, actor, action, partner, resolvePlayer, rng, flow);
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

    const passLike = ['突破分球', '顺下传球', '外弹传球', '安全传球', '跨场转移'].includes(action);
    if (passLike && outcome.branch.id === 'advantage') assistCandidate = actor;
    else if (outcome.branch.id === 'reset') assistCandidate = null;

    const fieldGoalScored = outcome.branch.scoreDelta[initialOffense] > 0;
    if (fieldGoalScored && assistCandidate && assistCandidate !== actor) current = addAssist(current, assistCandidate);

    if (current.回合阶段 === '罚球结算') current = settleFreeThrows(current, resolvePlayer, rng);
    if (current.回合阶段 === '篮板争抢') current = settleRebound(current, resolvePlayer, rng);
    current = normalizeDeadBall(current, resolvePlayer);

    if (current.球权 !== initialOffense) break;

    if (outcome.branch.id === 'advantage') {
      const tierBonus = outcome.resolution.tier === '大成功' ? 7 : outcome.resolution.tier === '成功' ? 5 : 3;
      const creationBonus = action === '突破分球' || action === '顺下传球' || action === '外弹传球' ? 1 : 0;
      flow = {
        advantageModifier: clamp(tierBonus + creationBonus, 0, 8),
        turnoverPressure: Math.max(0, flow.turnoverPressure - 1),
      };
    } else if (outcome.branch.id === 'reset' || outcome.branch.id === 'blocked-out') {
      flow = { advantageModifier: 0, turnoverPressure: flow.turnoverPressure + 2 };
    } else {
      flow = { advantageModifier: 0, turnoverPressure: flow.turnoverPressure + .5 };
    }

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
