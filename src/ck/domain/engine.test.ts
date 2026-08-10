import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createInitialState } from '../content/basePack';
import { corePack, loadContentPacks, parseContentPack, prologuePack } from '../content/loader';
import { executeAction, makeAction, pulseNormalization } from './engine';
import { projectScene, relationshipValue, supportCount } from './selectors';
import { useGameStore } from '../stores/game';
import { runPendingWorldSimulation } from '../ai/gateway';

function run(state: ReturnType<typeof createInitialState>, actionId: string, targetIds: string[] = [], params: Record<string, unknown> = {}, actorId = 'char_conan') {
  return executeAction(state, makeAction(state, actionId, actorId, targetIds, params, 'test', 'scene_test', `${actionId}_${state.revision}_${Object.keys(params).join('_')}`));
}

describe('CK 领主 RPG 领域规则', () => {
  it('可在独立页面初始化 Pinia 权威状态', async () => {
    setActivePinia(createPinia());
    const store = useGameStore();
    expect(store.state.scenario.deadline).toBe('1066-09-29');
    expect(store.daysLeft).toBe(14);
    store.selectRegent('char_mael');
    expect(store.state.regentId).toBe('char_mael');
    expect(store.state.revision).toBe(1);
    store.sendProbeLetter('char_hoel');
    store.startTravel('safe');
    await store.advanceDays(4);
    expect(store.state.characters.char_conan.locationId).toBe('loc_nantes_castle');
  });

  it('建立 16 个伯爵领，并把法理、实际统治和占领分开', () => {
    const state = createInitialState();
    expect(Object.keys(state.counties)).toHaveLength(16);
    const county = state.counties.rennes;
    const holderBefore = state.titles[county.titleId].holderId;
    county.occupation = { warId: 'war_test', occupierTitleId: 'd_normandy' };
    expect(state.titles[county.titleId].holderId).toBe(holderBefore);
    expect(county.controllerTitleId).toBe('c_rennes');
    expect(state.titles[county.titleId].deJureLiegeId).toBe('d_brittany');
  });

  it('关系调整只改行动者自己的单向态度，并执行单次、场景和单日限额', () => {
    let state = createInitialState();
    const first = run(state, 'relationship.adjust', ['char_conan'], { dimension: 'opinion', delta: -10, reasonCode: 'insulted' }, 'char_hoel');
    expect(first.status).toBe('committed');
    state = first.state;
    expect(relationshipValue(state, 'char_hoel', 'char_conan', 'opinion')).toBe(-10);
    expect(relationshipValue(state, 'char_conan', 'char_hoel', 'opinion')).toBe(0);
    const tooMuch = executeAction(state, makeAction(state, 'relationship.adjust', 'char_hoel', ['char_conan'], { dimension: 'opinion', delta: -6, reasonCode: 'more' }, 'test', 'scene_test', 'scene_cap'));
    expect(tooMuch.status).toBe('rejected');
    expect(tooMuch.errors[0].code).toBe('relationship.scene_cap');
    const absolute = run(state, 'relationship.adjust', ['char_conan'], { dimension: 'opinion', delta: 100, reasonCode: 'illegal' }, 'char_hoel');
    expect(absolute.status).toBe('rejected');
  });

  it('以幂等键阻止模型重试重复提交', () => {
    const state = createInitialState();
    const call = makeAction(state, 'social.praise', 'char_hoel', ['char_conan'], {}, 'ai', 'scene_1', 'same-key');
    const first = executeAction(state, call);
    expect(first.status).toBe('committed');
    const duplicate = executeAction(first.state, { ...call, expectedRevision: first.state.revision });
    expect(duplicate.status).toBe('duplicate');
    expect(relationshipValue(duplicate.state, 'char_hoel', 'char_conan', 'opinion')).toBe(5);
  });

  it('按地图路径投递信件并由即时调度器结算', () => {
    let state = createInitialState(1);
    const sent = run(state, 'communication.send_letter', ['char_morvan'], { subject: '边防', body: '来南特谈谈。' });
    expect(sent.status).toBe('committed');
    state = sent.state;
    const letter = Object.values(state.communications)[0];
    expect(letter.status).toBe('in_transit');
    const advanced = run(state, 'time.advance', [], { days: 5 });
    expect(advanced.status).toBe('committed');
    expect(Object.values(advanced.state.communications)[0].status).not.toBe('in_transit');
  });

  it('安全长路逐段改变人物位置，并在离境时结算一次摄政行动', () => {
    let state = createInitialState();
    state = run(state, 'regency.delegate', ['char_mael']).state;
    state = run(state, 'travel.start', ['loc_nantes_castle'], { routeKind: 'safe' }).state;
    state = run(state, 'time.advance', [], { days: 2 }).state;
    expect(state.locations[state.characters.char_conan.locationId].countyId).toBe('broerec');
    expect(state.eventLog.some(event => event.type === 'regency.action_taken')).toBe(true);
    expect(state.resources.gold).toBe(162);
  });

  it('宴会局部投影最多含三名同地点人物且不泄漏远方秘密', () => {
    const state = createInitialState();
    state.knowledge.secret_far = { id: 'secret_far', subjectId: 'char_william', predicate: 'secret_plan', value: 'hidden', certainty: 'confirmed', sourceId: 'spy', observedAt: state.currentDate, visibility: 'secret' };
    state.characters.char_william.knowledgeIds.push('secret_far');
    const projection = projectScene(state, 'scene', 'loc_nantes_castle', ['char_hoel', 'char_hawise', 'char_william', 'char_geoffroy', 'char_morvan']);
    expect(projection.activeCharacterIds).toEqual(['char_hoel', 'char_hawise']);
    expect(projection.publicFacts).toHaveLength(0);
  });

  it('3 日与 30 日常规脉冲按实际天数归一，关键行动预算不会线性膨胀', () => {
    const short = createInitialState();
    short.settings.regularWorldPulseDays = 3;
    const long = createInitialState();
    long.settings.regularWorldPulseDays = 30;
    expect(pulseNormalization(short)).toEqual({ elapsedDays: 3, actionBudget: 0 });
    expect(pulseNormalization(long)).toEqual({ elapsedDays: 30, actionBudget: 3 });
    const shortAdvanced = run(short, 'time.advance', [], { days: 30 }).state;
    const longAdvanced = run(long, 'time.advance', [], { days: 30 }).state;
    const budgetSum = (candidate: typeof shortAdvanced) => candidate.signals
      .filter(signal => signal.type === 'regular_pulse')
      .reduce((sum, signal) => sum + Number(signal.payload.decisionBudget ?? 0), 0);
    expect(Math.abs(budgetSum(shortAdvanced) - budgetSum(longAdvanced))).toBeLessThanOrEqual(1);
  });

  it('世界脉冲只规划一次、按预算执行关键人物并消费信号', async () => {
    let state = createInitialState();
    state = run(state, 'time.advance', [], { days: 7 }).state;
    expect(state.signals.some(signal => !signal.consumed)).toBe(true);
    const result = await runPendingWorldSimulation(state);
    expect(result.plan.signals).toHaveLength(1);
    expect(result.plan.keyCharacterIds).toHaveLength(1);
    expect(result.state.signals.every(signal => signal.consumed)).toBe(true);
    expect(result.committedCalls.some(call => call.actionId === 'world.consume_signals')).toBe(true);
  });

  it('取得任意两份有效支持后在 09-29 瓦解派系并继续战役', () => {
    let state = createInitialState();
    state.characters.char_conan.locationId = 'loc_nantes_castle';
    state.characters.char_geoffroy.locationId = 'loc_nantes_castle';
    const hoel = run(state, 'politics.offer_support_bargain', ['char_hoel'], { offerKind: 'succession_recognition' });
    expect(hoel.status).toBe('committed');
    state = hoel.state;
    const geoffroy = run(state, 'politics.offer_support_bargain', ['char_geoffroy'], { offerKind: 'gold_gift' });
    expect(geoffroy.status).toBe('committed');
    state = geoffroy.state;
    expect(supportCount(state)).toBe(2);
    state = run(state, 'time.advance', [], { days: 14 }).state;
    const resolved = run(state, 'scenario.resolve_deadline', ['faction_liberty']);
    expect(resolved.status).toBe('committed');
    expect(resolved.state.scenario.result).toBe('success');
    expect(resolved.state.factions.faction_liberty.status).toBe('dissolved');
  });

  it('支持不足时可拒绝降权并自动建立派系战争', () => {
    let state = createInitialState();
    state = run(state, 'time.advance', [], { days: 14 }).state;
    state = run(state, 'scenario.resolve_deadline', ['faction_liberty']).state;
    expect(state.scenario.phase).toBe('ultimatum');
    const resisted = run(state, 'scenario.answer_ultimatum', ['faction_liberty'], { answer: 'resist' });
    expect(resisted.state.scenario.result).toBe('civil_war');
    expect(resisted.state.wars.war_liberty_revolt.kind).toBe('faction_revolt');
  });

  it('未满 18 岁人物永远不能进入亲密行动', () => {
    const state = createInitialState();
    state.characters.char_hawise.birthDate = '1052-01-01';
    state.characters.char_hawise.locationId = state.characters.char_conan.locationId;
    const result = run(state, 'intimacy.resolve', ['char_hawise']);
    expect(result.status).toBe('rejected');
    expect(result.errors[0].code).toBe('intimacy.age_gate');
  });

  it('玩家死亡后只切换到有记录血缘的合法继承人', () => {
    let state = createInitialState(302988);
    state = run(state, 'regency.delegate', ['char_alan']).state;
    state = run(state, 'travel.start', ['loc_nantes_castle'], { routeKind: 'direct' }).state;
    const result = run(state, 'scenario.side_story', [], { kind: 'lethal_risk' });
    expect(result.status).toBe('committed');
    const fatal = result.events.some(event => event.type === 'succession.player_changed');
    if (fatal) {
      expect(result.state.playerCharacterId).toBe('char_hawise');
      expect(result.state.titles.d_brittany.holderId).toBe('char_hawise');
      expect(result.state.characters.char_hoel.titleIds).not.toContain('d_brittany');
    }
  });
});

describe('声明式内容包', () => {
  it('接受 JSON5 注释和尾逗号', () => {
    const parsed = parseContentPack(`{ // mod\nformat:'ckpack', formatVersion:1, id:'demo.pack', version:'1', name:'Demo', namespace:'demo', dependencies:[], entities:[], }`);
    expect(parsed.ok).toBe(true);
  });

  it('报告缺失依赖，坏包不会写入游戏状态', () => {
    const parsed = parseContentPack(`{format:'ckpack',formatVersion:1,id:'bad.pack',version:'1',name:'Bad',namespace:'bad',dependencies:[{id:'missing'}],entities:[]}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const registry = loadContentPacks([corePack, prologuePack, parsed.pack]);
    expect(registry.errors.some(error => error.code === 'dependency.missing')).toBe(true);
  });
});
