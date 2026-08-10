import { addDays, daysBetween } from './date';
import { nextRandom, randomInt } from './random';
import { characterAge, countyForLocation, findCountyPath, livingBloodHeirs, supportCount } from './selectors';
import { ActionCallSchema, GameStateSchema, type ActionCall, type CommandResult, type DomainEvent, type GameState, type RelationshipDimension } from './schema';

export type ActionDefinition = {
  id: string;
  version: 1;
  label: string;
  description: string;
  category: 'social' | 'politics' | 'travel' | 'communication' | 'economy' | 'military' | 'time' | 'scenario';
  targetKinds: Array<'character' | 'county' | 'location' | 'faction' | 'none'>;
};

export const actionDefinitions: ActionDefinition[] = [
  { id: 'relationship.adjust', version: 1, label: '调整态度', description: '行动者基于本次互动调整自己对目标的态度。', category: 'social', targetKinds: ['character'] },
  { id: 'social.praise', version: 1, label: '称赞', description: '称赞目标并留下可解释的关系修正。', category: 'social', targetKinds: ['character'] },
  { id: 'social.insult', version: 1, label: '侮辱', description: '侮辱目标并承担关系代价。', category: 'social', targetKinds: ['character'] },
  { id: 'social.threaten', version: 1, label: '威胁', description: '制造恐惧，同时损害信任。', category: 'social', targetKinds: ['character'] },
  { id: 'regency.delegate', version: 1, label: '任命摄政', description: '旅行前授予有限权限。', category: 'politics', targetKinds: ['character'] },
  { id: 'communication.send_letter', version: 1, label: '发送信件', description: '按地图距离投递，可能拒收、截获或泄露。', category: 'communication', targetKinds: ['character'] },
  { id: 'travel.start', version: 1, label: '开始出巡', description: '选择安全路线或危险捷径前往南特。', category: 'travel', targetKinds: ['location'] },
  { id: 'activity.advance', version: 1, label: '推进宴会', description: '推进当前宴会阶段并消耗一个时段。', category: 'scenario', targetKinds: ['none'] },
  { id: 'politics.offer_support_bargain', version: 1, label: '交换支持', description: '以职位、承认、契约或补贴换取有效支持。', category: 'politics', targetKinds: ['character'] },
  { id: 'economy.start_project', version: 1, label: '建设领地', description: '支付金钱，在所控制的伯爵领开始项目。', category: 'economy', targetKinds: ['county'] },
  { id: 'intimacy.resolve', version: 1, label: '亲密互动', description: '仅适用于达到硬年龄门槛的成年人。', category: 'social', targetKinds: ['character'] },
  { id: 'time.advance', version: 1, label: '推进日期', description: '执行即时调度器和世界脉冲。', category: 'time', targetKinds: ['none'] },
  { id: 'world.consume_signals', version: 1, label: '提交世界推演', description: '在局势规划和关键人物行动完成后标记对应信号。', category: 'scenario', targetKinds: ['none'] },
  { id: 'scenario.resolve_deadline', version: 1, label: '结算最后通牒', description: '按有效支持自动结算派系。', category: 'scenario', targetKinds: ['faction'] },
  { id: 'scenario.answer_ultimatum', version: 1, label: '回应最后通牒', description: '接受降权或拒绝并进入派系战争。', category: 'scenario', targetKinds: ['faction'] },
  { id: 'scenario.side_story', version: 1, label: '可选支线', description: '触发一次致命风险、成年亲密机会或暧昧梦兆。', category: 'scenario', targetKinds: ['character', 'none'] },
  { id: 'military.declare_county_claim', version: 1, label: '发动宣称战争', description: '序章外保留的县级宣称战争。', category: 'military', targetKinds: ['character', 'county'] },
  { id: 'military.issue_order', version: 1, label: '发布军事命令', description: '选择路线、目标与行动阶段。', category: 'military', targetKinds: ['county'] },
];

type MutableContext = { state: GameState; call: ActionCall; events: DomainEvent[]; errors: CommandResult['errors'] };

function cloneState(state: GameState): GameState {
  // UI 会传入 Vue/Pinia 响应式代理；领域边界只接受可序列化数据，并在克隆后重新校验。
  return GameStateSchema.parse(JSON.parse(JSON.stringify(state)));
}

function event(ctx: MutableContext, type: string, payload: Record<string, unknown>, actorId: string | null = ctx.call.actorId): void {
  ctx.events.push({
    id: `evt_${ctx.call.idempotencyKey}_${ctx.events.length}`,
    revision: ctx.state.revision + 1,
    type,
    occurredAt: ctx.state.currentDate,
    actorId,
    sourceId: ctx.call.sourceId,
    idempotencyKey: ctx.call.idempotencyKey,
    payload,
  });
}

function reject(ctx: MutableContext, code: string, message: string, field?: string): void {
  ctx.errors.push({ code, message, ...(field ? { field } : {}) });
}

function stringParam(call: ActionCall, key: string): string | null {
  const value = call.params[key];
  return typeof value === 'string' ? value : null;
}

function numberParam(call: ActionCall, key: string): number | null {
  const value = call.params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function relationshipAdjust(ctx: MutableContext, defaults?: { dimension: RelationshipDimension; delta: number; reason: string }): void {
  const targetId = ctx.call.targetIds[0];
  const dimension = (stringParam(ctx.call, 'dimension') ?? defaults?.dimension ?? 'opinion') as RelationshipDimension;
  const requestedDelta = numberParam(ctx.call, 'delta') ?? defaults?.delta ?? 0;
  const reasonCode = stringParam(ctx.call, 'reasonCode') ?? defaults?.reason ?? 'interaction';
  if (!targetId || !ctx.state.characters[targetId]) return reject(ctx, 'target.invalid', '关系行动需要有效人物目标。', 'targetIds');
  if (!['opinion', 'trust', 'fear', 'suspicion', 'attraction'].includes(dimension)) return reject(ctx, 'dimension.invalid', '未知关系维度。', 'params.dimension');
  if (!Number.isInteger(requestedDelta) || requestedDelta < -10 || requestedDelta > 10) return reject(ctx, 'delta.out_of_range', '单次关系调整必须为 -10 至 10 的整数。', 'params.delta');
  const sceneSameDirection = ctx.state.relationshipModifiers
    .filter(modifier => modifier.fromId === ctx.call.actorId && modifier.toId === targetId && modifier.dimension === dimension && modifier.sceneId === ctx.call.sceneId)
    .filter(modifier => Math.sign(modifier.delta) === Math.sign(requestedDelta))
    .reduce((sum, modifier) => sum + Math.abs(modifier.delta), 0);
  const daySameDirection = ctx.state.relationshipModifiers
    .filter(modifier => modifier.fromId === ctx.call.actorId && modifier.toId === targetId && modifier.dimension === dimension && modifier.createdAt === ctx.state.currentDate)
    .filter(modifier => Math.sign(modifier.delta) === Math.sign(requestedDelta))
    .reduce((sum, modifier) => sum + Math.abs(modifier.delta), 0);
  if (sceneSameDirection + Math.abs(requestedDelta) > 15) return reject(ctx, 'relationship.scene_cap', '同方向关系调整超过单场景 15 点上限。');
  if (daySameDirection + Math.abs(requestedDelta) > 20) return reject(ctx, 'relationship.day_cap', '同方向关系调整超过单日 20 点上限。');
  const modifier = {
    id: `rel_${ctx.call.idempotencyKey}`,
    fromId: ctx.call.actorId,
    toId: targetId,
    dimension,
    delta: requestedDelta,
    reasonCode,
    sourceId: ctx.call.sourceId,
    sceneId: ctx.call.sceneId,
    createdAt: ctx.state.currentDate,
    expiresAt: addDays(ctx.state.currentDate, 90),
  };
  ctx.state.relationshipModifiers.push(modifier);
  event(ctx, 'relationship.adjusted', modifier);
}

function delegateRegency(ctx: MutableContext): void {
  const regentId = ctx.call.targetIds[0];
  if (!regentId || !ctx.state.characters[regentId]?.alive) return reject(ctx, 'regent.invalid', '摄政必须是存活人物。');
  if (ctx.call.actorId !== ctx.state.playerCharacterId) return reject(ctx, 'permission.denied', '只有当前统治者可任命摄政。');
  ctx.state.regentId = regentId;
  ctx.state.scenario.selectedRegentId = regentId;
  ctx.state.scenario.phase = 'planning';
  event(ctx, 'regency.delegated', { regentId, permissions: ['routine_governance', 'defensive_orders', 'message_receipt'] });
}

function sendLetter(ctx: MutableContext): void {
  const recipientId = ctx.call.targetIds[0];
  const recipient = recipientId ? ctx.state.characters[recipientId] : undefined;
  const sender = ctx.state.characters[ctx.call.actorId];
  const subject = stringParam(ctx.call, 'subject') ?? '无题';
  const body = stringParam(ctx.call, 'body') ?? '';
  if (!recipientId || !recipient || !sender) return reject(ctx, 'letter.participant_invalid', '寄信人或收信人不存在。');
  const fromCounty = countyForLocation(ctx.state, sender.locationId);
  const toCounty = countyForLocation(ctx.state, recipient.locationId);
  if (!fromCounty || !toCounty) return reject(ctx, 'letter.route_missing', '无法确定信使路线。');
  const route = findCountyPath(ctx.state, fromCounty, toCounty);
  if (!route) return reject(ctx, 'letter.route_missing', '两个地点之间没有已知路线。');
  const deliveryDays = Math.max(1, Math.ceil((route.length - 1) / 2) + 1);
  const id = `letter_${ctx.call.idempotencyKey}`;
  ctx.state.communications[id] = {
    id,
    senderId: sender.id,
    recipientId,
    courierId: null,
    subject,
    body,
    sentAt: ctx.state.currentDate,
    deliverAt: addDays(ctx.state.currentDate, deliveryDays),
    status: 'in_transit',
    interceptedById: null,
    threadId: stringParam(ctx.call, 'threadId') ?? `thread_${sender.id}_${recipientId}`,
  };
  event(ctx, 'communication.sent', { communicationId: id, recipientId, deliverAt: ctx.state.communications[id].deliverAt, route });
}

function startTravel(ctx: MutableContext): void {
  const leader = ctx.state.characters[ctx.call.actorId];
  const destinationLocationId = ctx.call.targetIds[0];
  const destination = destinationLocationId ? ctx.state.locations[destinationLocationId] : undefined;
  const fromCounty = leader ? countyForLocation(ctx.state, leader.locationId) : null;
  if (!leader || !destination || !fromCounty) return reject(ctx, 'travel.invalid', '无法确定旅行起点或目的地。');
  const shortest = findCountyPath(ctx.state, fromCounty, destination.countyId);
  if (!shortest) return reject(ctx, 'travel.route_missing', '目的地不可达。');
  const routeKind = stringParam(ctx.call, 'routeKind') === 'safe' ? 'safe' : 'direct';
  const safeDetour = fromCounty === 'rennes' && destination.countyId === 'nantes' ? ['rennes', 'broerec', 'nantes'] : shortest;
  const route = routeKind === 'safe' ? safeDetour : shortest;
  const days = routeKind === 'safe' ? Math.max(3, route.length + 1) : Math.max(2, route.length);
  const id = `travel_${ctx.call.idempotencyKey}`;
  ctx.state.travels[id] = {
    id,
    leaderId: leader.id,
    companionIds: Array.isArray(ctx.call.params.companionIds) ? ctx.call.params.companionIds.filter((value): value is string => typeof value === 'string') : [],
    routeCountyIds: route,
    destinationLocationId,
    routeKind,
    progressIndex: 0,
    currentCountyId: route[0],
    departedAt: ctx.state.currentDate,
    arriveAt: addDays(ctx.state.currentDate, days),
    status: 'travelling',
  };
  ctx.state.scenario.activeTravelId = id;
  ctx.state.scenario.phase = 'travelling';
  event(ctx, 'travel.started', { travelId: id, route, routeKind, arriveAt: ctx.state.travels[id].arriveAt });
}

const feastPhases = ['planned', 'welcome', 'public_feast', 'free_conversation', 'private_audiences', 'departure'] as const;

function advanceActivity(ctx: MutableContext): void {
  const activity = ctx.state.activities[ctx.state.scenario.feastId];
  if (!activity) return reject(ctx, 'activity.missing', '序章宴会不存在。');
  if (ctx.state.currentDate < activity.startedAt) return reject(ctx, 'activity.not_started', `宴会将在 ${activity.startedAt} 开始。`);
  const currentIndex = feastPhases.indexOf(activity.phase as (typeof feastPhases)[number]);
  const next = feastPhases[Math.min(currentIndex + 1, feastPhases.length - 1)];
  activity.phase = next;
  activity.status = next === 'departure' ? 'completed' : 'active';
  ctx.state.scenario.phase = next === 'departure' ? 'return' : 'feast';
  ctx.state.scenario.sceneCount += 1;
  event(ctx, 'activity.phase_changed', { activityId: activity.id, phase: next });
  if (stringParam(ctx.call, 'consumeTimeslot') !== 'false') advanceDaysInContext(ctx, 1);
}

const acceptableOffers: Record<string, string[]> = {
  char_hoel: ['succession_recognition', 'council_office'],
  char_geoffroy: ['contract_concession', 'gold_gift'],
  char_morvan: ['marshal_office', 'border_subsidy'],
};

function offerSupportBargain(ctx: MutableContext): void {
  const supporterId = ctx.call.targetIds[0];
  const offerKind = stringParam(ctx.call, 'offerKind');
  if (!supporterId || !ctx.state.scenario.supportTargetIds.includes(supporterId)) return reject(ctx, 'support.invalid_target', '该人物不是本次游说目标。');
  if (ctx.state.characters[ctx.call.actorId]?.locationId !== ctx.state.characters[supporterId]?.locationId) return reject(ctx, 'support.not_co_located', '正式游说需要双方同地会面；远程只能先通过信件沟通。');
  if (!offerKind || !acceptableOffers[supporterId]?.includes(offerKind)) return reject(ctx, 'support.offer_rejected', '这项提议没有满足该封臣的核心诉求。');
  if (Object.values(ctx.state.supportCommitments).some(item => item.supporterId === supporterId && item.status === 'active')) return reject(ctx, 'support.duplicate', '该封臣已作出有效承诺。');
  const costs: Record<string, number> = { gold_gift: 35, border_subsidy: 45, council_office: 0, marshal_office: 0, succession_recognition: 0, contract_concession: 0 };
  const cost = costs[offerKind] ?? 0;
  if (ctx.state.resources.gold < cost) return reject(ctx, 'resource.insufficient_gold', '金库不足以兑现这项提议。');
  ctx.state.resources.gold -= cost;
  const promiseId = `promise_${ctx.call.idempotencyKey}`;
  const dueDate = addDays(ctx.state.currentDate, offerKind === 'gold_gift' ? 1 : 120);
  ctx.state.promises[promiseId] = { id: promiseId, promisorId: ctx.call.actorId, beneficiaryId: supporterId, kind: offerKind, terms: { cost, formal: true }, dueDate, status: offerKind === 'gold_gift' ? 'fulfilled' : 'active', sourceId: ctx.call.sourceId };
  const commitmentId = `support_${ctx.call.idempotencyKey}`;
  ctx.state.supportCommitments[commitmentId] = { id: commitmentId, supporterId, beneficiaryId: ctx.call.actorId, issueId: 'ducal_authority', grantedAt: ctx.state.currentDate, expiresAt: addDays(ctx.state.scenario.deadline, 1), status: 'active', conditionPromiseIds: [promiseId], sourceId: ctx.call.sourceId };
  ctx.state.factions.faction_liberty.power = Math.max(0, ctx.state.factions.faction_liberty.power - 22);
  event(ctx, 'politics.support_committed', { supporterId, offerKind, promiseId, commitmentId, currentSupport: supportCount(ctx.state) });
}

function startProject(ctx: MutableContext): void {
  const countyId = ctx.call.targetIds[0];
  const county = countyId ? ctx.state.counties[countyId] : undefined;
  const templateId = stringParam(ctx.call, 'templateId') ?? 'watchtower';
  const owned = county && ctx.state.titles[county.titleId]?.holderId === ctx.call.actorId;
  if (!county || !owned) return reject(ctx, 'project.permission_denied', '只能在自己直接持有的伯爵领建设。');
  const cost = templateId === 'market' ? 60 : 45;
  if (ctx.state.resources.gold < cost) return reject(ctx, 'resource.insufficient_gold', '金库不足。');
  ctx.state.resources.gold -= cost;
  const id = `project_${ctx.call.idempotencyKey}`;
  ctx.state.projects[id] = { id, ownerId: ctx.call.actorId, countyId, templateId, startedAt: ctx.state.currentDate, completeAt: addDays(ctx.state.currentDate, templateId === 'market' ? 25 : 18), status: 'active' };
  event(ctx, 'economy.project_started', { projectId: id, countyId, templateId, cost });
}

function resolveIntimacy(ctx: MutableContext): void {
  const targetId = ctx.call.targetIds[0];
  if (!targetId || !ctx.state.characters[targetId]) return reject(ctx, 'intimacy.invalid_target', '亲密行动缺少有效目标。');
  if (characterAge(ctx.state, ctx.call.actorId) < 18 || characterAge(ctx.state, targetId) < 18) return reject(ctx, 'intimacy.age_gate', '未满 18 岁人物绝不能成为亲密行动参与者。');
  const actor = ctx.state.characters[ctx.call.actorId];
  const target = ctx.state.characters[targetId];
  if (actor.locationId !== target.locationId) return reject(ctx, 'intimacy.not_co_located', '双方不在同一地点。');
  const privatePlace = ['castle', 'estate', 'inn'].includes(ctx.state.locations[actor.locationId]?.kind ?? '');
  if (!privatePlace) return reject(ctx, 'intimacy.no_opportunity', '当前地点不具备私密机会。');
  relationshipAdjust(ctx, { dimension: 'trust', delta: 4, reason: 'mutual_intimacy' });
  if (ctx.errors.length === 0) event(ctx, 'intimacy.resolved', { participantIds: [actor.id, target.id], narrationPolicy: 'adult_consensual_only' });
}

function declareCountyClaim(ctx: MutableContext): void {
  const defenderId = ctx.call.targetIds[0];
  const countyId = ctx.call.targetIds[1];
  const county = countyId ? ctx.state.counties[countyId] : undefined;
  if (!defenderId || !ctx.state.characters[defenderId] || !county) return reject(ctx, 'war.invalid_target', '战争需要有效防御者与目标伯爵领。');
  const id = `war_${ctx.call.idempotencyKey}`;
  ctx.state.wars[id] = { id, kind: 'county_claim', attackerId: ctx.call.actorId, defenderId, targetTitleId: county.titleId, attackerScore: 0, raisedByIds: [], objectiveCountyId: countyId, routeCountyIds: [], phase: 'declared', startedAt: ctx.state.currentDate, endedAt: null };
  ctx.state.signals.push({ id: `signal_${id}`, type: 'major_change', kind: 'war_started', occurredAt: ctx.state.currentDate, scopeIds: [ctx.call.actorId, defenderId, countyId], payload: { warId: id }, consumed: false });
  event(ctx, 'military.war_declared', { warId: id, kind: 'county_claim', countyId });
}

function issueMilitaryOrder(ctx: MutableContext): void {
  const warId = stringParam(ctx.call, 'warId');
  const war = warId ? ctx.state.wars[warId] : undefined;
  const objectiveCountyId = ctx.call.targetIds[0];
  const phase = stringParam(ctx.call, 'phase');
  if (!war || !objectiveCountyId || !ctx.state.counties[objectiveCountyId]) return reject(ctx, 'war.order_invalid', '军事命令缺少战争或目标。');
  if (war.attackerId !== ctx.call.actorId && war.defenderId !== ctx.call.actorId) return reject(ctx, 'war.permission_denied', '只有参战方能发布命令。');
  const actorCounty = countyForLocation(ctx.state, ctx.state.characters[ctx.call.actorId].locationId);
  const route = actorCounty ? findCountyPath(ctx.state, actorCounty, objectiveCountyId) : null;
  if (!route) return reject(ctx, 'war.route_missing', '军队无法抵达目标。');
  war.objectiveCountyId = objectiveCountyId;
  war.routeCountyIds = route;
  war.phase = phase === 'siege' ? 'siege' : phase === 'battle' ? 'battle' : 'marching';
  if (!war.raisedByIds.includes(ctx.call.actorId)) war.raisedByIds.push(ctx.call.actorId);
  event(ctx, 'military.order_issued', { warId: war.id, objectiveCountyId, route, phase: war.phase });
}

function resolveDeadline(ctx: MutableContext): void {
  if (ctx.state.currentDate < ctx.state.scenario.deadline) return reject(ctx, 'scenario.too_early', '最后通牒尚未到期。');
  const count = supportCount(ctx.state);
  const faction = ctx.state.factions.faction_liberty;
  if (count >= ctx.state.scenario.requiredSupport) {
    faction.status = 'dissolved';
    ctx.state.scenario.result = 'success';
    ctx.state.scenario.phase = 'campaign';
    ctx.state.resources.legitimacy = Math.min(100, ctx.state.resources.legitimacy + 8);
    event(ctx, 'scenario.prologue_succeeded', { supportCount: count });
  } else {
    faction.status = 'ultimatum';
    ctx.state.scenario.phase = 'ultimatum';
    event(ctx, 'scenario.ultimatum_issued', { supportCount: count, options: ['concede', 'resist'] });
  }
}

function consumeWorldSignals(ctx: MutableContext): void {
  const ids = Array.isArray(ctx.call.params.signalIds) ? ctx.call.params.signalIds.filter((value): value is string => typeof value === 'string') : [];
  for (const signal of ctx.state.signals) if (ids.includes(signal.id)) signal.consumed = true;
  event(ctx, 'world.signals_consumed', { signalIds: ids });
}

function answerUltimatum(ctx: MutableContext): void {
  const answer = stringParam(ctx.call, 'answer');
  const faction = ctx.state.factions.faction_liberty;
  if (faction.status !== 'ultimatum') return reject(ctx, 'scenario.no_ultimatum', '当前没有待回应的最后通牒。');
  if (answer === 'concede') {
    faction.status = 'dissolved';
    ctx.state.scenario.result = 'conceded';
    ctx.state.scenario.phase = 'campaign';
    ctx.state.resources.legitimacy = Math.max(0, ctx.state.resources.legitimacy - 18);
    event(ctx, 'scenario.authority_conceded', { legitimacy: ctx.state.resources.legitimacy });
    return;
  }
  if (answer !== 'resist') return reject(ctx, 'scenario.answer_invalid', '必须选择 concede 或 resist。');
  faction.status = 'war';
  ctx.state.scenario.result = 'civil_war';
  ctx.state.scenario.phase = 'campaign';
  const id = 'war_liberty_revolt';
  ctx.state.wars[id] = { id, kind: 'faction_revolt', attackerId: faction.leaderId, defenderId: ctx.state.playerCharacterId, targetTitleId: 'd_brittany', attackerScore: 0, raisedByIds: faction.memberIds, objectiveCountyId: 'rennes', routeCountyIds: ['penthievre', 'rennes'], phase: 'declared', startedAt: ctx.state.currentDate, endedAt: null };
  ctx.state.signals.push({ id: `signal_${id}`, type: 'major_change', kind: 'war_started', occurredAt: ctx.state.currentDate, scopeIds: [faction.id, id], payload: { warId: id }, consumed: false });
  event(ctx, 'scenario.civil_war_started', { warId: id });
}

function transferPlayerOnDeath(ctx: MutableContext, deceasedId: string): void {
  const deceased = ctx.state.characters[deceasedId];
  if (!deceased) return;
  deceased.alive = false;
  const heirId = livingBloodHeirs(ctx.state, deceasedId)[0];
  if (!heirId) {
    ctx.state.scenario.flags.gameEndedNoBloodHeir = true;
    event(ctx, 'succession.game_ended', { deceasedId, reason: 'no_living_blood_heir' }, null);
    return;
  }
  const inheritedTitleIds: string[] = [];
  for (const title of Object.values(ctx.state.titles)) {
    if (title.holderId !== deceasedId) continue;
    title.holderId = heirId;
    inheritedTitleIds.push(title.id);
  }
  ctx.state.characters[heirId].titleIds = [...new Set([...ctx.state.characters[heirId].titleIds, ...inheritedTitleIds])];
  deceased.titleIds = deceased.titleIds.filter(id => !inheritedTitleIds.includes(id));
  ctx.state.playerCharacterId = heirId;
  event(ctx, 'succession.player_changed', { deceasedId, heirId, inheritedTitleIds, knowledgePolicy: 'public_and_possessed_archives_only' }, null);
}

function sideStory(ctx: MutableContext): void {
  const kind = stringParam(ctx.call, 'kind');
  if (!kind || !['lethal_risk', 'ambiguous_omen', 'adult_encounter'].includes(kind)) return reject(ctx, 'side_story.invalid', '未知支线。');
  const flag = `sideStory_${kind}`;
  if (ctx.state.scenario.flags[flag]) return reject(ctx, 'side_story.already_seen', '该支线在本序章已经发生过。');
  if (kind === 'ambiguous_omen') {
    ctx.state.scenario.flags[flag] = true;
    const id = `knowledge_omen_${ctx.state.currentDate}`;
    ctx.state.knowledge[id] = { id, subjectId: ctx.call.actorId, predicate: 'dream_of_broken_crown', value: '一顶裂开的王冠沉入黑水；没有规则确认这是真实魔法。', certainty: 'rumored', sourceId: ctx.call.sourceId, observedAt: ctx.state.currentDate, visibility: 'private' };
    ctx.state.characters[ctx.call.actorId].knowledgeIds.push(id);
    event(ctx, 'story.ambiguous_omen', { knowledgeId: id, supernaturalHardEffect: false });
    return;
  }
  if (kind === 'adult_encounter') {
    const targetId = ctx.call.targetIds[0];
    if (!targetId || !ctx.state.characters[targetId]) return reject(ctx, 'side_story.target_missing', '成年亲密支线需要人物目标。');
    if (ctx.state.settings.content.intimacy === 'abstract') return reject(ctx, 'side_story.content_disabled', '本存档将亲密内容设为抽象。');
    if (characterAge(ctx.state, ctx.call.actorId) < 18 || characterAge(ctx.state, targetId) < 18) return reject(ctx, 'intimacy.age_gate', '未满 18 岁人物绝不能成为亲密行动目标。');
    if (ctx.state.characters[ctx.call.actorId].locationId !== ctx.state.characters[targetId].locationId) return reject(ctx, 'intimacy.not_co_located', '双方不在同一地点。');
    ctx.state.scenario.flags[flag] = true;
    event(ctx, 'story.adult_opportunity', { participantIds: [ctx.call.actorId, targetId], state: 'opportunity', requiresConsent: true, forcedCrimeTemplateAllowed: false });
    return;
  }
  const travel = ctx.state.scenario.activeTravelId ? ctx.state.travels[ctx.state.scenario.activeTravelId] : null;
  if (!travel || travel.routeKind !== 'direct') return reject(ctx, 'side_story.no_lethal_route', '致命风险只在选择危险捷径时出现。');
  ctx.state.scenario.flags[flag] = true;
  const random = nextRandom(ctx.state.rngState);
  ctx.state.rngState = random.state;
  if (random.value < 0.12) {
    event(ctx, 'story.lethal_ambush', { outcome: 'fatal', telegraphed: true });
    transferPlayerOnDeath(ctx, ctx.call.actorId);
  } else if (random.value < 0.5) {
    ctx.state.characters[ctx.call.actorId].traits.push('负伤');
    ctx.state.resources.stress = Math.min(300, ctx.state.resources.stress + 18);
    event(ctx, 'story.lethal_ambush', { outcome: 'wounded', telegraphed: true });
  } else {
    ctx.state.resources.prestige += 12;
    event(ctx, 'story.lethal_ambush', { outcome: 'escaped', telegraphed: true });
  }
}

function processDay(ctx: MutableContext): void {
  for (const activity of Object.values(ctx.state.activities)) {
    if (activity.status !== 'planned' || activity.startedAt > ctx.state.currentDate) continue;
    activity.status = 'active';
    activity.phase = 'welcome';
    for (const participantId of activity.participantIds) if (ctx.state.characters[participantId]?.alive) ctx.state.characters[participantId].locationId = activity.locationId;
    event(ctx, 'activity.started', { activityId: activity.id, participantIds: activity.participantIds, locationId: activity.locationId }, activity.hostId);
  }
  for (const communication of Object.values(ctx.state.communications)) {
    if (communication.status !== 'in_transit' || communication.deliverAt > ctx.state.currentDate) continue;
    const random = nextRandom(ctx.state.rngState);
    ctx.state.rngState = random.state;
    if (random.value < 0.08) {
      communication.status = 'intercepted';
      communication.interceptedById = 'char_jean_dol';
      event(ctx, 'communication.intercepted', { communicationId: communication.id, interceptedById: communication.interceptedById }, null);
    } else if (random.value < 0.14) {
      communication.status = 'refused';
      event(ctx, 'communication.refused', { communicationId: communication.id }, communication.recipientId);
    } else {
      communication.status = 'delivered';
      event(ctx, 'communication.delivered', { communicationId: communication.id }, communication.recipientId);
    }
  }
  for (const travel of Object.values(ctx.state.travels)) {
    if (travel.status !== 'travelling') continue;
    const duration = Math.max(1, daysBetween(travel.departedAt, travel.arriveAt));
    const elapsed = Math.max(0, daysBetween(travel.departedAt, ctx.state.currentDate));
    const progressIndex = Math.min(travel.routeCountyIds.length - 1, Math.floor((elapsed / duration) * (travel.routeCountyIds.length - 1)));
    if (progressIndex > travel.progressIndex && ctx.state.currentDate < travel.arriveAt) {
      travel.progressIndex = progressIndex;
      travel.currentCountyId = travel.routeCountyIds[progressIndex];
      const waypoint = ctx.state.counties[travel.currentCountyId]?.locationIds[1];
      if (waypoint) for (const id of [travel.leaderId, ...travel.companionIds]) if (ctx.state.characters[id]) ctx.state.characters[id].locationId = waypoint;
      event(ctx, 'travel.waypoint_reached', { travelId: travel.id, countyId: travel.currentCountyId, progressIndex }, travel.leaderId);
    }
    if (travel.arriveAt > ctx.state.currentDate) continue;
    travel.status = 'arrived';
    travel.progressIndex = travel.routeCountyIds.length - 1;
    travel.currentCountyId = travel.routeCountyIds[travel.routeCountyIds.length - 1];
    const travellers = [travel.leaderId, ...travel.companionIds];
    for (const id of travellers) if (ctx.state.characters[id]) ctx.state.characters[id].locationId = travel.destinationLocationId;
    if (travel.id === ctx.state.scenario.activeTravelId) {
      ctx.state.scenario.phase = 'arrival';
      ctx.state.scenario.activeTravelId = null;
      const feast = ctx.state.activities[ctx.state.scenario.feastId];
      if (feast && !feast.participantIds.includes(travel.leaderId)) feast.participantIds.push(travel.leaderId);
    }
    event(ctx, 'travel.arrived', { travelId: travel.id, destinationLocationId: travel.destinationLocationId }, travel.leaderId);
  }
  const activeTravel = ctx.state.scenario.activeTravelId ? ctx.state.travels[ctx.state.scenario.activeTravelId] : null;
  if (activeTravel && ctx.state.regentId && !ctx.state.scenario.flags.regencyWindowResolved && daysBetween(activeTravel.departedAt, ctx.state.currentDate) >= 2) {
    ctx.state.scenario.flags.regencyWindowResolved = true;
    if (ctx.state.regentId === 'char_mael') {
      const cost = Math.min(18, ctx.state.resources.gold);
      ctx.state.resources.gold -= cost;
      ctx.state.resources.legitimacy = Math.min(100, ctx.state.resources.legitimacy + 3);
      event(ctx, 'regency.action_taken', { regentId: ctx.state.regentId, action: 'abbey_tithe_exemption', goldCost: cost, legitimacyDelta: 3, withinDelegatedAuthority: true }, ctx.state.regentId);
    } else {
      ctx.state.resources.legitimacy = Math.max(0, ctx.state.resources.legitimacy - 2);
      event(ctx, 'regency.action_taken', { regentId: ctx.state.regentId, action: 'tax_petition_deferred', legitimacyDelta: -2, withinDelegatedAuthority: true }, ctx.state.regentId);
    }
  }
  for (const project of Object.values(ctx.state.projects)) {
    if (project.status !== 'active' || project.completeAt > ctx.state.currentDate) continue;
    project.status = 'completed';
    ctx.state.counties[project.countyId].control = Math.min(100, ctx.state.counties[project.countyId].control + 5);
    event(ctx, 'economy.project_completed', { projectId: project.id, countyId: project.countyId }, project.ownerId);
  }
  for (const promise of Object.values(ctx.state.promises)) {
    if (promise.status === 'active' && promise.dueDate < ctx.state.currentDate) {
      promise.status = 'broken';
      for (const commitment of Object.values(ctx.state.supportCommitments)) {
        if (commitment.conditionPromiseIds.includes(promise.id) && commitment.status === 'active') commitment.status = 'withdrawn';
      }
      event(ctx, 'politics.promise_broken', { promiseId: promise.id, beneficiaryId: promise.beneficiaryId }, promise.promisorId);
    }
  }
  if (ctx.state.currentDate === '1066-09-28' && !ctx.state.signals.some(signal => signal.kind === 'norman_landing')) {
    ctx.state.signals.push({ id: 'signal_norman_landing_10660928', type: 'major_change', kind: 'norman_landing', occurredAt: ctx.state.currentDate, scopeIds: ['char_william', 'd_normandy'], payload: { summary: '诺曼军队已在英格兰南岸登陆，结果未被预设。' }, consumed: false });
    event(ctx, 'world.major_change_observed', { kind: 'norman_landing' }, null);
  }
  if (ctx.state.currentDate >= ctx.state.nextRegularPulseAt) {
    const elapsed = Math.max(3, ctx.state.settings.regularWorldPulseDays);
    ctx.state.worldActionCredit += elapsed / 7;
    const budget = Math.min(3, Math.floor(ctx.state.worldActionCredit));
    ctx.state.worldActionCredit -= budget;
    const id = `signal_regular_${ctx.state.currentDate}`;
    ctx.state.signals.push({ id, type: 'regular_pulse', kind: 'western_europe_pulse', occurredAt: ctx.state.currentDate, scopeIds: ['char_jean_dol', 'char_william', 'char_geoffrey_anjou'], payload: { elapsedDays: elapsed, decisionBudget: budget }, consumed: false });
    ctx.state.nextRegularPulseAt = addDays(ctx.state.nextRegularPulseAt, elapsed);
    event(ctx, 'world.regular_pulse_due', { signalId: id, elapsedDays: elapsed, decisionBudget: budget }, null);
  }
  for (const war of Object.values(ctx.state.wars)) {
    if (war.phase === 'marching') {
      war.phase = 'siege';
      event(ctx, 'military.army_reached_objective', { warId: war.id, objectiveCountyId: war.objectiveCountyId }, null);
    } else if (war.phase === 'siege') {
      const random = randomInt(ctx.state.rngState, 2, 7);
      ctx.state.rngState = random.state;
      war.attackerScore = Math.min(100, war.attackerScore + random.value);
      if (war.attackerScore >= 60 && war.objectiveCountyId) {
        ctx.state.counties[war.objectiveCountyId].occupation = { warId: war.id, occupierTitleId: ctx.state.characters[war.attackerId]?.titleIds[0] ?? 'unknown' };
        war.phase = 'negotiation';
        event(ctx, 'military.siege_completed', { warId: war.id, objectiveCountyId: war.objectiveCountyId, occupationOnly: true }, war.attackerId);
      }
    }
  }
}

function advanceDaysInContext(ctx: MutableContext, days: number): void {
  const safeDays = Math.max(1, Math.min(30, Math.trunc(days)));
  for (let index = 0; index < safeDays; index += 1) {
    ctx.state.currentDate = addDays(ctx.state.currentDate, 1);
    processDay(ctx);
  }
  event(ctx, 'time.advanced', { days: safeDays, currentDate: ctx.state.currentDate });
}

export function executeAction(inputState: GameState, inputCall: ActionCall): CommandResult {
  const parsed = ActionCallSchema.safeParse(inputCall);
  if (!parsed.success) return { status: 'rejected', state: inputState, events: [], errors: [{ code: 'action.invalid', message: parsed.error.message }] };
  const call = parsed.data;
  if (inputState.eventLog.some(item => item.idempotencyKey === call.idempotencyKey)) return { status: 'duplicate', state: inputState, events: [], errors: [] };
  if (call.expectedRevision !== inputState.revision) return { status: 'rejected', state: inputState, events: [], errors: [{ code: 'revision.conflict', message: `预期 revision ${call.expectedRevision}，当前为 ${inputState.revision}。` }] };
  if (!inputState.characters[call.actorId]?.alive) return { status: 'rejected', state: inputState, events: [], errors: [{ code: 'actor.invalid', message: '行动者不存在或已死亡。' }] };
  if (!actionDefinitions.some(definition => definition.id === call.actionId)) return { status: 'rejected', state: inputState, events: [], errors: [{ code: 'action.unknown', message: `未注册行动 ${call.actionId}。` }] };

  const ctx: MutableContext = { state: cloneState(inputState), call, events: [], errors: [] };
  switch (call.actionId) {
    case 'relationship.adjust': relationshipAdjust(ctx); break;
    case 'social.praise': relationshipAdjust(ctx, { dimension: 'opinion', delta: 5, reason: 'praise' }); break;
    case 'social.insult': relationshipAdjust(ctx, { dimension: 'opinion', delta: -5, reason: 'insult' }); break;
    case 'social.threaten':
      relationshipAdjust(ctx, { dimension: 'fear', delta: 6, reason: 'threat' });
      if (ctx.errors.length === 0) {
        const followup: MutableContext = { ...ctx, call: { ...call, params: { ...call.params, dimension: 'trust', delta: -4, reasonCode: 'threat' }, idempotencyKey: `${call.idempotencyKey}_trust` } };
        relationshipAdjust(followup);
      }
      break;
    case 'regency.delegate': delegateRegency(ctx); break;
    case 'communication.send_letter': sendLetter(ctx); break;
    case 'travel.start': startTravel(ctx); break;
    case 'activity.advance': advanceActivity(ctx); break;
    case 'politics.offer_support_bargain': offerSupportBargain(ctx); break;
    case 'economy.start_project': startProject(ctx); break;
    case 'intimacy.resolve': resolveIntimacy(ctx); break;
    case 'time.advance': advanceDaysInContext(ctx, numberParam(call, 'days') ?? 1); break;
    case 'world.consume_signals': consumeWorldSignals(ctx); break;
    case 'scenario.resolve_deadline': resolveDeadline(ctx); break;
    case 'scenario.answer_ultimatum': answerUltimatum(ctx); break;
    case 'scenario.side_story': sideStory(ctx); break;
    case 'military.declare_county_claim': declareCountyClaim(ctx); break;
    case 'military.issue_order': issueMilitaryOrder(ctx); break;
  }
  if (ctx.errors.length > 0) return { status: 'rejected', state: inputState, events: [], errors: ctx.errors };
  ctx.state.revision += 1;
  for (const item of ctx.events) item.revision = ctx.state.revision;
  ctx.state.eventLog.push(...ctx.events);
  return { status: 'committed', state: ctx.state, events: ctx.events, errors: [] };
}

export function makeAction(state: GameState, actionId: string, actorId: string, targetIds: string[], params: Record<string, unknown>, sourceId: string, sceneId: string, idempotencyKey?: string): ActionCall {
  return {
    actionId,
    version: 1,
    actorId,
    targetIds,
    params,
    sourceId,
    sceneId,
    idempotencyKey: idempotencyKey ?? `${actionId}_${state.revision}_${Date.now().toString(36)}`,
    expectedRevision: state.revision,
  };
}

export function replayActions(initial: GameState, calls: ActionCall[]): GameState {
  return calls.reduce((state, call) => {
    const result = executeAction(state, { ...call, expectedRevision: state.revision });
    if (result.status !== 'committed') throw new Error(result.errors.map(item => item.message).join('; ') || '重放失败');
    return result.state;
  }, initial);
}

export function pulseNormalization(state: GameState): { elapsedDays: number; actionBudget: number } {
  const elapsedDays = Math.max(3, Math.min(30, state.settings.regularWorldPulseDays));
  return { elapsedDays, actionBudget: Math.min(3, Math.floor(state.worldActionCredit + elapsedDays / 7)) };
}

export function travelDuration(state: GameState, travelId: string): number {
  const travel = state.travels[travelId];
  return travel ? daysBetween(travel.departedAt, travel.arriveAt) : 0;
}
