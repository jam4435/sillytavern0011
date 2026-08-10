import { ACTION_SPECS, weightedScore } from './attributes';
import type {
  ActionResolution, ActionType, MatchState, NumericRange, OnCourtStatus, PlayerData, ResultTier,
  SettlementBranch, SettlementContract, Side, SituationContext,
} from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const range = (min: number, max = min): NumericRange => ({ min, max });
const otherSide = (side: Side): Side => side === '主' ? '客' : '主';

export interface ResolveInput {
  action: ActionType;
  actor: PlayerData;
  actorStatus: OnCourtStatus;
  defender: PlayerData | null;
  defenders?: PlayerData[];
  partner: PlayerData | null;
  partnerDefender?: PlayerData | null;
  actionSide: Side;
  match: MatchState;
  situation: SituationContext;
  rollDice?: () => number;
}

export function tierOf(roll: number, finalRate: number): ResultTier {
  const successLine = Math.round(finalRate);
  if (roll >= 97) return '大失败';
  if (roll <= Math.round(successLine * .25)) return '大成功';
  if (roll <= successLine) return '成功';
  if (roll <= successLine + 15) return '部分成功';
  return '失败';
}

const TIER_TEXT: Record<ResultTier, string> = {
  大成功: '完美执行', 成功: '执行成功', 部分成功: '制造有限优势', 失败: '被对方化解', 大失败: '严重失误',
};

function bodyMatchup(actor: PlayerData, defender: PlayerData | null): number {
  if (!defender) return 0;
  return clamp(
    (actor.body.weightKg - defender.body.weightKg) * .08 +
    (actor.body.wingspanCm - defender.body.wingspanCm) * .05,
    -6, 6,
  );
}

function situationalModifiers(input: ResolveInput, helpCount: number): { label: string; value: number }[] {
  const { actorStatus, situation } = input;
  const mods: { label: string; value: number }[] = [];
  if (actorStatus.体力 < 20) mods.push({ label: '体力透支', value: -12 });
  else if (actorStatus.体力 < 40) mods.push({ label: '体力下降', value: -6 });
  if (actorStatus.手感 === '热') mods.push({ label: '手感火热', value: 4 });
  if (actorStatus.手感 === '冷') mods.push({ label: '手感冰冷', value: -4 });
  if (situation.isClutch) mods.push({ label: '关键时刻镇定', value: (input.actor.attrs.composure - 70) * .12 });
  if (situation.mismatch) mods.push({ label: '错位', value: 6 });
  if (situation.coverage === 'open') mods.push({ label: '空位', value: 8 });
  if (situation.coverage === 'tight') mods.push({ label: '严防', value: -8 });
  if (helpCount) mods.push({ label: `协防×${helpCount}`, value: -Math.min(10, helpCount * 3) });
  if (situation.offenseTactic?.offense === '五外') mods.push({ label: '五外空间', value: 4 });
  if (situation.defenseTactic?.defense === '二三联防') mods.push({ label: '联防收缩', value: -3 });
  if (situation.hotZoneModifier) mods.push({ label: '冷热区', value: situation.hotZoneModifier });
  if (situation.badgeModifier) mods.push({ label: '徽章', value: clamp(situation.badgeModifier, -8, 8) });
  if (situation.defenderFouls >= 4) mods.push({ label: '防守犯规危机', value: 4 });
  return mods;
}

function shotBase(action: ActionType): number | null {
  if (action === '定点投篮' || action === '后撤步') return .35;
  if (action === '急停投篮' || action === '突破急停' || action === '背身单打') return .4;
  if (action === '突破终结') return .62;
  return null;
}

function shotSkill(action: ActionType, actor: PlayerData): number {
  if (action === '定点投篮') return actor.attrs.standingThree;
  if (action === '后撤步') return actor.attrs.movingThree;
  if (action === '急停投篮' || action === '突破急停') return (actor.attrs.movingMid + actor.attrs.movingThree) / 2;
  if (action === '背身单打') return (actor.attrs.postFade + actor.attrs.postControl) / 2;
  return (actor.attrs.drivingLayup + actor.attrs.drivingDunk) / 2;
}

export function shotProbability(input: ResolveInput, contest: number, helpWeight: number): number {
  const base = shotBase(input.action);
  if (base === null) return 0;
  const skill = shotSkill(input.action, input.actor);
  const fatigue = (input.actorStatus.体力 - 70) * .004;
  const difficulty = ACTION_SPECS[input.action].difficulty ?? 0;
  const body = input.defender ? (input.actor.body.wingspanCm - input.defender.body.wingspanCm) * .002 : 0;
  const spacing = input.situation.offenseTactic?.offense === '五外' ? .035 : 0;
  const zone = (input.situation.hotZoneModifier ?? 0) / 100;
  const badges = clamp(input.situation.badgeModifier ?? 0, -8, 8) / 100;
  const logit = Math.log(base / (1 - base)) + (skill - 70) * .035 - (contest - 65) * .025 - helpWeight * .035 - difficulty * .035 + fatigue + body + spacing;
  return clamp(1 / (1 + Math.exp(-logit)) + zone + badges, .03, .95);
}

function nearbyHelp(input: ResolveInput): { players: PlayerData[]; weight: number } {
  const actorSpot = input.situation.actorSpot;
  if (!actorSpot || !input.situation.defenderSpots?.length) return { players: [], weight: 0 };
  const primary = input.defender?.name;
  const intensity = (input.situation.defenseTactic?.helpIntensity ?? 50) / 50;
  const radius = 14 + 4 * intensity;
  const byKey = new Map((input.defenders ?? []).map(player => [player.name, player]));
  const found = input.situation.defenderSpots
    .filter(spot => spot.球员 !== primary)
    .map(spot => ({ spot, distance: Math.hypot(spot.x - actorSpot.x, spot.y - actorSpot.y), player: byKey.get(spot.球员) }))
    .filter((item): item is typeof item & { player: PlayerData } => Boolean(item.player) && item.distance <= radius);
  const weight = found.reduce((sum, item) => sum + (1 - item.distance / radius) * intensity * ((item.player.attrs.reactionTime + item.player.attrs.shotContest) / 140), 0);
  return { players: found.map(item => item.player), weight };
}

function roll(input: ResolveInput): number { return Math.round(clamp((input.rollDice ?? (() => Math.floor(Math.random() * 100) + 1))(), 1, 100)); }

function stat(player: string, name: keyof OnCourtStatus, value: number) { return { player, stat: name, value }; }

function scoringBranch(input: ResolveInput, tier: ResultTier, points: number, id: string, andOne = false): SettlementBranch {
  const offense = input.actionSide;
  const defense = otherSide(offense);
  const made = tier === '成功' || tier === '大成功';
  const score = made ? points : 0;
  const scoreDelta = { 主: offense === '主' ? score : 0, 客: offense === '客' ? score : 0 };
  const deltas = [stat(input.actor.name, '投篮出手', 1)];
  if (points === 3) deltas.push(stat(input.actor.name, '三分出手', 1));
  if (made) {
    deltas.push(stat(input.actor.name, '投篮命中', 1), stat(input.actor.name, '得分', points), stat(input.actor.name, '连续命中', 1));
    if (points === 3) deltas.push(stat(input.actor.name, '三分命中', 1));
  } else deltas.push(stat(input.actor.name, '连续打铁', 1));
  return {
    id, label: andOne ? `${points}分命中并加罚` : made ? `${points}分命中` : '投篮不中', scoreDelta,
    possession: made && !andOne ? defense : offense,
    nextPhase: andOne ? '罚球结算' : made ? '常规回合' : '篮板争抢', statDeltas: deltas,
    pending: andOne ? { type: 'freeThrow', shootingSide: offense, shooter: input.actor.name, remaining: 1, total: 1 }
      : made ? { type: 'none' } : { type: 'rebound', shootingSide: offense, shooter: input.actor.name, zone: points === 3 ? '三分弧顶' : '中投正面' },
  };
}

function branchesFor(input: ResolveInput, tier: ResultTier): SettlementBranch[] {
  const family = ACTION_SPECS[input.action].family;
  const mine = input.actionSide;
  const theirs = otherSide(mine);
  const points = input.action === '定点投篮' || input.action === '后撤步' ? 3 : 2;
  if (shotBase(input.action) !== null) {
    if (tier === '大成功') return [scoringBranch(input, tier, points, 'clean-make'), scoringBranch(input, tier, points, 'and-one', true)];
    if (tier === '成功') return [scoringBranch(input, tier, points, 'made')];
    if (tier === '部分成功') return [{ ...scoringBranch(input, '失败', points, 'blocked-out'), label: '被封堵出界', possession: mine, nextPhase: '死球', pending: { type: 'deadBall', reason: '投篮被封堵出界', inboundSide: mine } }];
    if (tier === '失败') return [scoringBranch(input, tier, points, 'miss')];
    return [{ id: 'offensive-foul', label: '进攻犯规', scoreDelta: { 主: 0, 客: 0 }, possession: theirs, nextPhase: '死球', statDeltas: [stat(input.actor.name, '失误', 1), stat(input.actor.name, '犯规', 1)], pending: { type: 'deadBall', reason: '进攻犯规', inboundSide: theirs } }];
  }
  if (family === '传球' || family === '挡拆' || family === '无球') {
    if (tier === '大失败') return [{ id: 'turnover', label: '传球/配合失误', scoreDelta: { 主: 0, 客: 0 }, possession: theirs, nextPhase: '常规回合', statDeltas: [stat(input.actor.name, '失误', 1)], pending: { type: 'none' } }];
    return [{ id: tier === '失败' ? 'reset' : 'advantage', label: tier === '失败' ? '进攻重置' : '创造进攻优势', scoreDelta: { 主: 0, 客: 0 }, possession: mine, nextPhase: '常规回合', statDeltas: [], pending: { type: 'none' } }];
  }
  if (family === '防守') {
    if (tier === '大成功' || (tier === '成功' && input.action === '赌博抢断')) return [{ id: 'forced-turnover', label: '制造球权转换', scoreDelta: { 主: 0, 客: 0 }, possession: mine, nextPhase: '常规回合', statDeltas: input.action === '赌博抢断' ? [stat(input.actor.name, '抢断', 1), ...(input.defender ? [stat(input.defender.name, '失误', 1)] : [])] : [], pending: { type: 'none' } }];
    if (tier === '大失败') return [{ id: 'defensive-foul', label: '防守犯规', scoreDelta: { 主: 0, 客: 0 }, possession: theirs, nextPhase: '死球', statDeltas: [stat(input.actor.name, '犯规', 1)], pending: { type: 'deadBall', reason: '防守犯规', inboundSide: theirs } }];
    return [{ id: 'continue-offense', label: '进攻方继续组织', scoreDelta: { 主: 0, 客: 0 }, possession: theirs, nextPhase: '常规回合', statDeltas: [], pending: { type: 'none' } }];
  }
  if (family === '篮板') {
    const won = tier === '大成功' || tier === '成功';
    const winner = won ? mine : theirs;
    const rebounder = won ? input.actor.name : (input.defender?.name ?? input.actor.name);
    const isOffensive = winner === (input.match.待处理情境.type === 'rebound' ? input.match.待处理情境.shootingSide : input.match.球权);
    return [{ id: won ? 'rebound-won' : 'rebound-lost', label: won ? '抢下篮板' : '篮板被对手控制', scoreDelta: { 主: 0, 客: 0 }, possession: winner, nextPhase: '常规回合', statDeltas: [stat(rebounder, '篮板', 1), stat(rebounder, isOffensive ? '进攻篮板' : '防守篮板', 1)], pending: { type: 'none' } }];
  }
  return [{ id: 'simulated', label: '模拟回合', scoreDelta: { 主: 0, 客: 0 }, possession: theirs, nextPhase: '常规回合', statDeltas: [], pending: { type: 'none' } }];
}

function contractFor(input: ResolveInput, stages: ActionResolution['stages'], tier: ResultTier): SettlementContract {
  const branches = branchesFor(input, tier);
  const pace = input.situation.offenseTactic?.pace ?? '标准';
  const clock = pace === '快' ? range(3, 10) : pace === '慢' ? range(8, 18) : range(5, 14);
  return {
    id: `nba-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    intent: { action: input.action, family: ACTION_SPECS[input.action].family, actor: input.actor.name, partner: input.partner?.name ?? null },
    stages, tier, branches, referenceBranchId: branches[0].id, clockSeconds: clock,
    shotClockSeconds: range(0, 24), staminaDelta: { actor: range(-7, -2), ...(input.partner ? { partner: range(-4, -1) } : {}) },
    allowedPlayers: [...new Set([...input.match.阵容.主.场上, ...input.match.阵容.客.场上])],
    allowedStatePaths: ['比赛.比分', '比赛.球权', '比赛.剩余秒数', '比赛.投篮时钟', '比赛.站位', '比赛.球员状态', '比赛.本节球队犯规', '比赛.回合阶段', '比赛.待处理情境', '比赛.回合情境', '比赛.回合摘要'],
  };
}

export function resolveAction(input: ResolveInput): ActionResolution {
  const spec = ACTION_SPECS[input.action];
  const help = nearbyHelp(input);
  const primaryDefense = input.defender ? weightedScore(spec.defense, input.defender.attrs, input.defender.overall, input.defender.body) : (spec.flatDefense ?? 55);
  const helpScores = help.players.map(player => weightedScore(spec.defense, player.attrs, player.overall, player.body));
  const defenseScore = helpScores.length ? primaryDefense * .72 + (helpScores.reduce((a, b) => a + b, 0) / helpScores.length) * .28 : primaryDefense;
  let attackScore = weightedScore(spec.attack, input.actor.attrs, input.actor.overall, input.actor.body);
  if (spec.family === '挡拆' && input.partner) attackScore = attackScore * .72 + (input.partner.attrs.strength + input.partner.attrs.passIQ) / 2 * .28;
  const mods = situationalModifiers(input, help.players.length);
  const body = bodyMatchup(input.actor, input.defender);
  if (Math.abs(body) >= .5) mods.push({ label: '体型对抗', value: Math.round(body * 10) / 10 });
  const modifierTotal = mods.reduce((sum, item) => sum + item.value, 0);
  const baseShot = shotBase(input.action);
  const baseRate = baseShot === null ? clamp(50 + (attackScore - defenseScore) * 1.05, 10, 92) : shotProbability(input, defenseScore, help.weight) * 100;
  const finalRate = Math.round(clamp(baseRate + modifierTotal, 3, 95));

  const stages: ActionResolution['stages'] = [];
  if (spec.family === '突破' || spec.family === '挡拆') {
    const separationRate = Math.round(clamp(50 + (attackScore - primaryDefense) * 1.1 + body, 5, 95));
    const separationRoll = roll(input);
    stages.push({ id: 'separation', label: '创造分离', attackScore: Math.round(attackScore), defenseScore: Math.round(primaryDefense), successRate: separationRate, roll: separationRoll, tier: tierOf(separationRoll, separationRate) });
  }
  const finalRoll = roll(input);
  const tier = tierOf(finalRoll, finalRate);
  stages.push({ id: baseShot === null ? 'execution' : 'shot', label: baseShot === null ? '动作执行' : '出手结算', attackScore: Math.round(attackScore), defenseScore: Math.round(defenseScore), successRate: finalRate, roll: finalRoll, tier });
  const contract = contractFor(input, stages, tier);
  const names = [input.defender, ...help.players].filter((player): player is PlayerData => Boolean(player)).map(player => player.cn);
  const summary = `${input.actor.cn}执行${input.action}${names.length ? `，面对${names.join('、')}` : ''}：${stages.map(stage => `${stage.label} ${stage.roll}/${stage.successRate}`).join('；')} → ${tier}（${TIER_TEXT[tier]}）`;
  return {
    intent: contract.intent, action: input.action, actor: input.actor.name, defender: input.defender?.name ?? null,
    defenders: [input.defender, ...help.players].filter((player): player is PlayerData => Boolean(player)).map(player => player.name),
    partner: input.partner?.name ?? null, stages, attackScore: Math.round(attackScore * 10) / 10,
    defenseScore: Math.round(defenseScore * 10) / 10, baseRate: Math.round(baseRate), modifiers: mods,
    finalRate, roll: finalRoll, tier, contract, summary,
  };
}
