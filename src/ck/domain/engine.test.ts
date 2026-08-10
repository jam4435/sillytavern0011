import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { runPendingWorldSimulation } from '../ai/gateway';
import { createInitialState } from '../content/basePack';
import { corePack, loadContentPacks, parseContentPack, sandboxPack } from '../content/loader';
import { useGameStore } from '../stores/game';
import { executeAction, makeAction, pulseNormalization } from './engine';
import { projectScene, relationshipValue, supportCount } from './selectors';
import type { GameState } from './schema';

function run(state:GameState,actionId:string,targetIds:string[]=[],params:Record<string,unknown>={},actorId='char_conan'){
  return executeAction(state,makeAction(state,actionId,actorId,targetIds,params,'test',`scene_${state.revision}`,`test_${actionId}_${state.revision}`));
}

function resolveFirstEvent(state:GameState,preferred?:string):GameState{
  const pending=Object.values(state.pendingEvents).find(item=>item.status==='pending'&&item.requiresResponse);if(!pending)return state;
  const choice=preferred&&pending.choices.some(item=>item.id===preferred)?preferred:pending.choices.find(item=>item.id==='ignore'||item.id==='acknowledge')?.id??pending.choices[0].id;
  const result=run(state,'event.choose',[pending.id],{choiceId:choice});expect(result.status).toBe('committed');return result.state;
}

function simulateOneYear(seed:number):GameState{
  let state=createInitialState(seed);let guard=0;
  while(state.currentDate<'1067-09-15'&&guard++<500){
    while(Object.values(state.pendingEvents).some(item=>item.status==='pending'&&item.requiresResponse))state=resolveFirstEvent(state,'concede');
    const advanced=run(state,'time.advance',[],{days:Math.min(30,Math.max(1,Math.ceil((Date.parse('1067-09-15T00:00:00Z')-Date.parse(`${state.currentDate}T00:00:00Z`))/86400000)))});expect(advanced.status).toBe('committed');state=advanced.state;
    const ids=state.signals.filter(signal=>!signal.consumed).map(signal=>signal.id);if(ids.length){const consumed=run(state,'world.consume_signals',[],{signalIds:ids});expect(consumed.status).toBe('committed');state=consumed.state;}
  }
  expect(guard).toBeLessThan(500);return state;
}

describe('CK 历史沙盒领域规则',()=>{
  it('初始化的是通用沙盒而非线性 scenario',()=>{
    setActivePinia(createPinia());const store=useGameStore();
    expect(store.state.schemaVersion).toBe(2);expect('scenario' in store.state).toBe(false);expect(store.activeSituation?.id).toBe('situation_liberty_1066');expect(store.state.clock).toEqual({date:'1066-09-15',segment:'morning'});
  });

  it('建立 16 县和至少 28 名人物，并分离法理、实际与占领',()=>{
    const state=createInitialState();expect(Object.keys(state.counties)).toHaveLength(16);expect(Object.keys(state.characters).length).toBeGreaterThanOrEqual(28);
    const county=state.counties.rennes;const holder=state.titles[county.titleId].holderId;county.occupation={warId:'war_test',occupierTitleId:'d_normandy'};
    expect(state.titles[county.titleId].holderId).toBe(holder);expect(state.titles[county.titleId].deJureLiegeId).toBe('d_brittany');expect(county.occupation.occupierTitleId).toBe('d_normandy');
  });

  it('时间推进遇到活动、战争和重大事件时停在准确日期',()=>{
    let state=createInitialState();const first=run(state,'time.advance',[],{days:7});expect(first.status).toBe('committed');state=first.state;
    expect(state.currentDate).toBe('1066-09-20');expect(Object.values(state.pendingEvents).some(item=>item.type==='activity_started'&&item.status==='pending')).toBe(true);
    state=resolveFirstEvent(state,'ignore');state=run(state,'time.advance',[],{days:12}).state;expect(state.currentDate).toBe('1066-09-28');expect(Object.values(state.pendingEvents).some(item=>item.type==='norman_landing'&&item.status==='pending')).toBe(true);
  });

  it('完全无视南特宴会仍可任命、建设、通信、联姻和宣战',()=>{
    let state=createInitialState();state=run(state,'time.advance',[],{days:7}).state;state=resolveFirstEvent(state,'ignore');
    state=run(state,'council.appoint',['char_yves'],{positionId:'council_chancellor'}).state;expect(state.council.council_chancellor.holderId).toBe('char_yves');
    state=run(state,'economy.start_project',['rennes'],{templateId:'market'}).state;expect(Object.values(state.projects).some(item=>item.countyId==='rennes')).toBe(true);
    state=run(state,'communication.send_letter',['char_morvan'],{subject:'边防',body:'汇报莱昂近况'}).state;expect(Object.keys(state.communications)).toHaveLength(1);
    let opened=run(state,'interaction.open',['char_isabeau'],{intentId:'diplomacy.propose_marriage',terms:{candidateAId:'char_conan',candidateBId:'char_isabeau'}});expect(opened.status).toBe('committed');state=opened.state;
    const marriageThread=Object.values(state.interactions).at(-1)!;state=run(state,'interaction.resolve',[marriageThread.id],{decision:'accept'},'char_isabeau').state;expect(state.characters.char_conan.spouseIds).toContain('char_isabeau');
    const war=run(state,'military.declare_county_claim',['char_william','avranches']);expect(war.status).toBe('committed');expect(Object.values(war.state.wars).some(item=>item.objectiveCountyId==='avranches')).toBe(true);
  });

  it('结构化意图允许接受、拒绝与反提案，正式支持自动提交',()=>{
    let state=createInitialState();let opened=run(state,'interaction.open',['char_hoel'],{intentId:'politics.request_support',terms:{offerKind:'succession_recognition'}});expect(opened.status).toBe('committed');state=opened.state;
    let thread=Object.values(state.interactions).at(-1)!;state=run(state,'interaction.resolve',[thread.id],{decision:'accept'},'char_hoel').state;expect(supportCount(state)).toBe(1);
    opened=run(state,'interaction.open',['char_geoffroy'],{intentId:'politics.request_support',terms:{offerKind:'contract_concession'}});state=opened.state;thread=Object.values(state.interactions).at(-1)!;
    state=run(state,'interaction.resolve',[thread.id],{decision:'counter',terms:{offerKind:'gold_gift'},message:'先恢复家族名誉。'},'char_geoffroy').state;expect(state.interactions[thread.id].status).toBe('awaiting_player');
    state=run(state,'interaction.resolve',[thread.id],{decision:'accept'}).state;expect(supportCount(state)).toBe(2);expect(state.characterResources.char_conan.gold).toBeLessThan(180);
  });

  it('关系只能调整行动者的单向数值，并执行 ±10、场景和单日限额',()=>{
    let state=createInitialState();const first=run(state,'relationship.adjust',['char_conan'],{dimension:'opinion',delta:-10,reasonCode:'insulted'},'char_hoel');expect(first.status).toBe('committed');state=first.state;
    expect(relationshipValue(state,'char_hoel','char_conan','opinion')).toBe(-10);expect(relationshipValue(state,'char_conan','char_hoel','opinion')).toBe(0);
    const excessive=executeAction(state,makeAction(state,'relationship.adjust','char_hoel',['char_conan'],{dimension:'opinion',delta:-6,reasonCode:'more'},'test','scene_0','relation_scene_cap'));expect(excessive.status).toBe('rejected');expect(excessive.errors[0].code).toBe('relationship.scene_cap');
    expect(run(state,'relationship.adjust',['char_conan'],{dimension:'opinion',delta:100,reasonCode:'absolute'},'char_hoel').status).toBe('rejected');
  });

  it('幂等键防止模型重试重复提交',()=>{
    const state=createInitialState();const call=makeAction(state,'social.praise','char_conan',['char_hoel'],{},'ai','scene_1','same-key');const first=executeAction(state,call);expect(first.status).toBe('committed');const duplicate=executeAction(first.state,{...call,expectedRevision:first.state.revision});expect(duplicate.status).toBe('duplicate');expect(relationshipValue(duplicate.state,'char_hoel','char_conan','opinion')).toBe(5);
  });

  it('活动与通信场景投影只暴露参与者及玩家已知事实',()=>{
    const state=createInitialState();state.knowledge.secret_far={id:'secret_far',subjectId:'char_william',predicate:'secret_plan',value:'hidden',certainty:'confirmed',sourceId:'spy',observedAt:state.currentDate,visibility:'secret'};state.characters.char_william.knowledgeIds.push('secret_far');
    const projection=projectScene(state,'scene','loc_nantes_castle',['char_hoel','char_hawise','char_william','char_geoffroy']);expect(projection.activeCharacterIds).toEqual(['char_hoel','char_hawise']);expect(projection.publicFacts.some(fact=>fact.predicate==='secret_plan')).toBe(false);
  });

  it('NPC 使用同一行动接口加入派系、建设、旅行和主动提案',()=>{
    let state=createInitialState();state=run(state,'politics.join_faction',['faction_liberty'],{},'char_morvan').state;expect(state.factions.faction_liberty.memberIds).toContain('char_morvan');
    state=run(state,'economy.start_project',['nantes'],{templateId:'market'},'char_hoel').state;expect(Object.values(state.projects).some(item=>item.ownerId==='char_hoel')).toBe(true);
    state=run(state,'travel.start',['loc_nantes_castle'],{routeKind:'direct'},'char_morvan').state;expect(Object.values(state.travels).some(item=>item.leaderId==='char_morvan')).toBe(true);
    const proposal=run(state,'interaction.open',['char_conan'],{intentId:'politics.modify_contract',terms:{taxLevel:'low'}},'char_geoffroy');expect(proposal.status).toBe('committed');const incoming=Object.values(proposal.state.interactions).at(-1)!;expect(incoming.status).toBe('awaiting_player');const accepted=run(proposal.state,'interaction.resolve',[incoming.id],{decision:'accept'});expect(accepted.status).toBe('committed');expect(accepted.state.contracts.contract_geoffroy.taxLevel).toBe('low');
  });

  it('3 日和 30 日脉冲按真实经过时间归一化',()=>{
    const short=createInitialState();short.settings.regularWorldPulseDays=3;const long=createInitialState();long.settings.regularWorldPulseDays=30;expect(pulseNormalization(short)).toEqual({elapsedDays:3,actionBudget:0});expect(pulseNormalization(long)).toEqual({elapsedDays:30,actionBudget:3});
  });

  it('世界规划最多驱动预算内关键人物并消费信号',async()=>{
    let state=createInitialState();state=run(state,'time.advance',[],{days:7}).state;state=resolveFirstEvent(state,'ignore');state=run(state,'time.advance',[],{days:2}).state;expect(state.signals.some(signal=>!signal.consumed)).toBe(true);
    const result=await runPendingWorldSimulation(state);expect(result.plan.keyCharacterIds.length).toBeLessThanOrEqual(3);expect(result.state.signals.every(signal=>signal.consumed)).toBe(true);expect(result.committedCalls.some(call=>call.actionId==='world.consume_signals')).toBe(true);
  });

  it('降权局势可以由支持解决，也可无视到最后通牒和内战',()=>{
    let supported=createInitialState();supported.characters.char_conan.locationId='loc_nantes_castle';supported.characters.char_geoffroy.locationId='loc_nantes_castle';supported=run(supported,'politics.offer_support_bargain',['char_hoel'],{offerKind:'succession_recognition'}).state;supported=run(supported,'politics.offer_support_bargain',['char_geoffroy'],{offerKind:'gold_gift'}).state;
    supported=run(supported,'time.advance',[],{days:14}).state;while(Object.values(supported.pendingEvents).some(item=>item.status==='pending'))supported=resolveFirstEvent(supported,'ignore');while(supported.currentDate<'1066-09-29'){supported=run(supported,'time.advance',[],{days:3}).state;if(Object.values(supported.pendingEvents).some(item=>item.status==='pending'))supported=resolveFirstEvent(supported,'acknowledge');}expect(supported.situations.situation_liberty_1066.status).toBe('resolved');
    let ignored=createInitialState();while(ignored.currentDate<'1066-09-29'){const advanced=run(ignored,'time.advance',[],{days:30});if(advanced.status==='committed')ignored=advanced.state;if(Object.values(ignored.pendingEvents).some(item=>item.status==='pending'))ignored=resolveFirstEvent(ignored,ignored.currentDate==='1066-09-29'?'resist':'ignore');}
    expect(ignored.wars.war_liberty_revolt?.kind).toBe('faction_revolt');expect(ignored.situations.situation_liberty_1066.status).toBe('war');
  });

  it('死亡切换到有记录血缘的合法继承人',()=>{
    const result=run(createInitialState(),'character.die',['char_conan']);expect(result.status).toBe('committed');expect(result.state.playerCharacterId).toBe('char_hawise');expect(result.state.titles.d_brittany.holderId).toBe('char_hawise');expect(Object.values(result.state.pendingEvents).some(item=>item.type==='succession')).toBe(true);
  });

  it('战争占领不会直接转移称号，只有和约执行宣称',()=>{
    let state=createInitialState(88);state.currentDate='1066-10-01';state.clock={date:state.currentDate,segment:'morning'};state.activities.activity_feast_nantes_1066.status='cancelled';state.situations.situation_liberty_1066.status='resolved';
    state=run(state,'military.declare_county_claim',['char_william','avranches']).state;state=resolveFirstEvent(state,'acknowledge');const war=Object.values(state.wars)[0];state=run(state,'military.issue_order',['avranches'],{warId:war.id,phase:'siege'}).state;
    let guard=0;while(!Object.values(state.pendingEvents).some(item=>item.type==='war_peace'&&item.status==='pending')&&guard++<30)state=run(state,'time.advance',[],{days:3}).state;
    expect(state.counties.avranches.occupation?.warId).toBe(war.id);expect(state.titles.c_avranches.holderId).toBe('char_william');const peace=Object.values(state.pendingEvents).find(item=>item.type==='war_peace'&&item.status==='pending')!;state=run(state,'event.choose',[peace.id],{choiceId:'enforce'}).state;expect(state.titles.c_avranches.holderId).toBe('char_conan');expect(state.counties.avranches.occupation).toBeNull();expect(state.wars[war.id].phase).toBe('ended');
  });

  it('亲密行动执行成年、同地、私密与非强迫硬门槛',()=>{
    const state=createInitialState();state.characters.char_isabeau.locationId=state.characters.char_conan.locationId;state.characters.char_isabeau.birthDate='1052-01-01';let result=run(state,'intimacy.resolve',['char_isabeau']);expect(result.status).toBe('rejected');expect(result.errors[0].code).toBe('intimacy.age_gate');state.characters.char_isabeau.birthDate='1044-03-02';result=run(state,'intimacy.resolve',['char_isabeau'],{coercive:true});expect(result.status).toBe('rejected');expect(result.errors[0].code).toBe('intimacy.coercion_forbidden');expect(run(state,'intimacy.resolve',['char_isabeau']).status).toBe('committed');
  });

  it('固定种子推进一年得到完全一致的可重放规则状态',()=>{const a=simulateOneYear(4066);const b=simulateOneYear(4066);expect(a.currentDate).toBe('1067-09-15');expect(a).toEqual(b);});
});

describe('声明式内容包',()=>{
  it('支持沙盒新增实体类型与 JSON5',()=>{const parsed=parseContentPack(`{format:'ckpack',formatVersion:1,id:'demo.pack',version:'1',name:'Demo',namespace:'demo',dependencies:[],entities:[{id:'law.demo',kind:'law',data:{value:1},},],}`);expect(parsed.ok).toBe(true);});
  it('报告缺失依赖且不污染注册表',()=>{const parsed=parseContentPack(`{format:'ckpack',formatVersion:1,id:'bad.pack',version:'1',name:'Bad',namespace:'bad',dependencies:[{id:'missing'}],entities:[]}`);expect(parsed.ok).toBe(true);if(!parsed.ok)return;const registry=loadContentPacks([corePack,sandboxPack,parsed.pack]);expect(registry.errors.some(error=>error.code==='dependency.missing')).toBe(true);});
});
