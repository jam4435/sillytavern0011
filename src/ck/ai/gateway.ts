import { z } from 'zod';
import { t } from '../content/basePack';
import { actionDefinitions, executeAction, makeAction } from '../domain/engine';
import { projectScene } from '../domain/selectors';
import type { ActionCall, GameState } from '../domain/schema';

const ActionCandidateSchema = z.object({
  actionId: z.string(),
  actorId: z.string(),
  targetIds: z.array(z.string()),
  params: z.record(z.string(), z.unknown()),
}).strict();

const DecisionSchema = z.object({
  speakerId: z.string(),
  intent: z.string(),
  actionCalls: z.array(ActionCandidateSchema).max(3),
  narrationBrief: z.string(),
}).strict();

const InteractionDecisionSchema = z.object({
  decision: z.enum(['accept', 'reject', 'counter']),
  terms: z.record(z.string(), z.unknown()),
  message: z.string(),
  reasoning: z.string(),
}).strict();

export type DirectorResult = {
  state: GameState;
  narration: string;
  committedCalls: ActionCall[];
  rejected: string[];
  usedFallback: boolean;
};

function modelAvailable(): boolean {
  return typeof generateRaw === 'function' || typeof generate === 'function';
}

function describeActionContract(): string {
  return actionDefinitions.map(item => `${item.id}: ${item.description}`).join('\n');
}

async function callModel(config: GenerateConfig & { ordered_prompts?: GenerateRawConfig['ordered_prompts'] }): Promise<string | GenerateToolCallResult> {
  if (typeof generateRaw === 'function') return generateRaw(config as GenerateRawConfig);
  return generate(config);
}

async function callText(prompt: string, presetName: string, onStream?: (text: string) => void): Promise<string> {
  if (!modelAvailable()) return '';
  const generationId = `ck_text_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const listener = onStream && typeof eventOn === 'function' && typeof iframe_events !== 'undefined'
    ? eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, (text, receivedId) => {
        if (receivedId === generationId) onStream(text);
      })
    : null;
  try {
    const output = await callModel({
      user_input: prompt,
      preset_name: presetName,
      should_stream: true,
      should_silence: true,
      generation_id: generationId,
      max_chat_history: 0,
      ordered_prompts: ['user_input'],
    });
    return typeof output === 'string' ? output : JSON.stringify(output);
  } finally {
    listener?.stop();
  }
}

const actionDecisionJsonSchema = {
  name: 'ck_registered_action_decision',
  strict: true,
  value: {
    type: 'object',
    properties: {
      speakerId: { type: 'string' }, intent: { type: 'string' }, narrationBrief: { type: 'string' },
      actionCalls: { type: 'array', maxItems: 3, items: { type: 'object', properties: {
        actionId: { type: 'string' }, actorId: { type: 'string' }, targetIds: { type: 'array', items: { type: 'string' } }, params: { type: 'object', additionalProperties: true },
      }, required: ['actionId', 'actorId', 'targetIds', 'params'], additionalProperties: false } },
    },
    required: ['speakerId', 'intent', 'actionCalls', 'narrationBrief'], additionalProperties: false,
  },
} as const;

async function callDecision(prompt: string, presetName: string): Promise<z.infer<typeof DecisionSchema> | null> {
  if (!modelAvailable()) return null;
  const response = await callModel({ user_input: prompt, preset_name: presetName, should_stream: false, should_silence: true, max_chat_history: 0, ordered_prompts: ['user_input'], json_schema: actionDecisionJsonSchema });
  try {
    const parsed = DecisionSchema.safeParse(JSON.parse(typeof response === 'string' ? response : JSON.stringify(response)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

async function callInteractionDecision(prompt: string, presetName: string): Promise<z.infer<typeof InteractionDecisionSchema> | null> {
  if (!modelAvailable()) return null;
  const response = await callModel({
    user_input: prompt, preset_name: presetName, should_stream: false, should_silence: true, max_chat_history: 0, ordered_prompts: ['user_input'],
    json_schema: { name:'ck_interaction_decision', strict:true, value:{ type:'object', properties:{ decision:{type:'string',enum:['accept','reject','counter']}, terms:{type:'object',additionalProperties:true}, message:{type:'string'}, reasoning:{type:'string'} }, required:['decision','terms','message','reasoning'], additionalProperties:false } },
  });
  try {
    const parsed = InteractionDecisionSchema.safeParse(JSON.parse(typeof response === 'string' ? response : JSON.stringify(response)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

function fallbackNarration(state: GameState, playerText: string, speakerIds: string[]): string {
  const names = speakerIds.map(id => t(state.characters[id]?.nameKey ?? id)).join('、');
  return `${names || '在场众人'}听完了你的话。羽笔停在契约边缘，双方都在衡量利益与代价。\n\n「${playerText.slice(0, 120)}」`;
}

export async function runOrdinaryDialogue(state: GameState, sceneId: string, locationId: string, speakerIds: string[], playerText: string, onStream?: (text: string) => void): Promise<string> {
  const projection = projectScene(state, sceneId, locationId, speakerIds);
  const prompt = `你是历史沙盒中的场景导演。只能使用裁剪场景，不得读取远方秘密、虚构已发生的硬结果或修改数据。\n场景：${JSON.stringify(projection)}\n玩家说：${playerText}\n用简体中文写 120—220 字人物对话。闲聊只表达态度，不宣告战争、婚约、土地转让等正式结果。`;
  const generated = await callText(prompt, state.settings.models.sceneDirector.presetName, onStream);
  return generated || fallbackNarration(state, playerText, projection.activeCharacterIds);
}

function fallbackInteractionDecision(state: GameState, interactionId: string): z.infer<typeof InteractionDecisionSchema> {
  const thread = state.interactions[interactionId];
  if (!thread) return { decision:'reject', terms:{}, message:'这项谈判已经失去对象。', reasoning:'线程不存在' };
  if (thread.acceptance >= 0) return { decision:'accept', terms:thread.terms, message:'你的条件可以接受。让我们把它写进正式记录。', reasoning:'规则接受度非负' };
  if (thread.acceptance >= -24) {
    const terms = { ...thread.terms, offerKind: thread.terms.offerKind ?? 'gold_gift' };
    return { decision:'counter', terms, message:'我不会空手承诺。给出切实的利益，我们还能继续谈。', reasoning:'接近接受阈值，提出反提案' };
  }
  return { decision:'reject', terms:thread.terms, message:'这不符合我的利益，也不足以改变我的立场。', reasoning:'规则接受度过低' };
}

export async function runInteractionDialogue(state: GameState, interactionId: string, playerText: string, onStream?: (text: string) => void): Promise<DirectorResult> {
  const thread = state.interactions[interactionId];
  if (!thread) throw new Error('互动线程不存在。');
  if (thread.status !== 'negotiating') throw new Error('这项互动当前不等待 NPC 决策。');
  const initiator = state.characters[thread.initiatorId];
  const target = state.characters[thread.targetId];
  const projection = projectScene(state, thread.sceneId, initiator.locationId, [thread.initiatorId, thread.targetId], interactionId);
  const decisionPrompt = `你是历史沙盒中的 NPC 静默决策层，只能替 ${thread.targetId} 回应当前正式互动。\n裁剪上下文：${JSON.stringify(projection)}\n玩家表述：${playerText}\n接受度及理由已经由规则引擎计算。你可以接受、拒绝或提出反提案；不得创造资源、土地、婚姻对象、宣称或未知秘密。terms 只能调整当前议题的报价，例如 offerKind、taxLevel、levyLevel、privilege、subject、body。`;
  let decision = await callInteractionDecision(decisionPrompt, state.settings.models.sceneDirector.presetName);
  if (!decision) decision = await callInteractionDecision(`${decisionPrompt}\n上次输出不符合 JSON schema；仅输出合法对象。`, state.settings.models.sceneDirector.presetName);
  const usedFallback = !decision;
  decision ??= fallbackInteractionDecision(state, interactionId);
  const call = makeAction(state, 'interaction.resolve', thread.targetId, [interactionId], { decision:decision.decision, terms:decision.terms, message:decision.message }, 'ai.interaction', thread.sceneId, `interaction_ai_${interactionId}_${state.revision}`);
  const result = executeAction(state, call);
  const rejected = result.status === 'committed' ? [] : result.errors.map(error => error.message);
  const nextState = result.status === 'committed' ? result.state : state;
  const facts = nextState.eventLog.slice(state.eventLog.length).map(item => ({ type:item.type, payload:item.payload }));
  const narrationPrompt = `你是历史沙盒叙事层。只叙述已经提交的事实，不得增加或撤销硬结果。\n玩家：${playerText}\n${target.nameKey}的回应要点：${decision.message}\n已提交事实：${JSON.stringify(facts)}\n写 140—240 字对话，明确表达接受、拒绝或反提案以及政治含义。`;
  const generated = await callText(narrationPrompt, state.settings.models.sceneDirector.presetName, onStream);
  return { state:nextState, narration:generated || `${t(target.nameKey)}答道：“${decision.message}”`, committedCalls:result.status==='committed'?[call]:[], rejected, usedFallback:usedFallback||!generated };
}

export type WorldPlan = { summary:string; keyCharacterIds:string[]; signals:string[] };

export async function planWorldPulse(state: GameState): Promise<WorldPlan> {
  const pending = state.signals.filter(signal => !signal.consumed);
  const regularBudget = Math.max(0, ...pending.filter(signal=>signal.type==='regular_pulse').map(signal=>Number(signal.payload.decisionBudget)||0));
  const budget = Math.min(state.settings.models.keyCharacter.maxCallsPerPulse, regularBudget || (pending.some(signal=>signal.type==='major_change') ? 2 : 0));
  const scoped = pending.flatMap(signal=>signal.scopeIds).filter(id=>state.characters[id]?.alive);
  const important = Object.values(state.characters).filter(character=>character.alive&&character.titleIds.length>0).sort((a,b)=>(state.characterResources[b.id]?.levies??0)-(state.characterResources[a.id]?.levies??0)).map(character=>character.id);
  const candidates=[...new Set([...scoped,...important])].filter(id=>id!==state.playerCharacterId);
  const offset=candidates.length?Math.abs(Math.floor(Date.parse(`${state.currentDate}T00:00:00Z`)/86400000))%candidates.length:0;
  const keyCharacterIds=[...candidates.slice(offset),...candidates.slice(0,offset)].slice(0,budget);
  const fallback = { summary:pending.length?`${pending.length} 项局势信号已进入分层推演。`:'西欧局势暂时平静。', keyCharacterIds, signals:pending.map(signal=>signal.id) };
  if (!modelAvailable() || pending.length===0) return fallback;
  const compact = pending.map(signal=>({type:signal.type,kind:signal.kind,date:signal.occurredAt,scope:signal.scopeIds,payload:signal.payload}));
  const summary = await callText(`你是 1066 年西欧局势规划器。只根据这些可见信号给出简短局势摘要和压力方向，不直接修改世界，也不指定战争赢家。\n${JSON.stringify(compact)}`, state.settings.models.worldPlanner.presetName);
  return { ...fallback, summary:summary||fallback.summary };
}

export type WorldSimulationResult = { state:GameState; plan:WorldPlan; committedCalls:ActionCall[]; rejected:string[] };

function fallbackWorldCall(state: GameState, characterId: string, index: number): ActionCall | null {
  const person=state.characters[characterId]; const scene=`world_${state.currentDate}`; const key=`world_fallback_${state.currentDate}_${characterId}_${index}`;
  if (!person?.alive) return null;
  const invitedActivity=Object.values(state.activities).find(activity=>(activity.status==='planned'||activity.status==='active')&&activity.invitedIds.includes(characterId)&&person.locationId!==activity.locationId);
  if(invitedActivity)return makeAction(state,'travel.start',characterId,[invitedActivity.locationId],{routeKind:'direct'},'rules.world_fallback',scene,key);
  const claim=Object.values(state.claims).find(item=>item.claimantId===characterId&&Boolean(state.titles[item.titleId]?.countyId));
  const claimedCounty=claim?state.titles[claim.titleId]?.countyId:null;const defender=claim?state.titles[claim.titleId]?.holderId:null;
  if(claimedCounty&&defender&&defender!==characterId&&person.personality.boldness>40&&!Object.values(state.wars).some(war=>!war.endedAt&&[war.attackerId,war.defenderId].includes(characterId)))return makeAction(state,'military.declare_county_claim',characterId,[defender,claimedCounty],{},'rules.world_fallback',scene,key);
  const faction=state.factions.faction_liberty;
  if (faction?.status==='organizing' && person.liegeId===faction.targetId && !faction.memberIds.includes(characterId) && person.personality.boldness>30 && person.personality.honor<25) return makeAction(state,'politics.join_faction',characterId,[faction.id],{},'rules.world_fallback',scene,key);
  if (faction?.memberIds.includes(characterId) && (person.personality.honor>45 || faction.power<45)) return makeAction(state,'politics.leave_faction',characterId,[faction.id],{},'rules.world_fallback',scene,key);
  const heldCounty=person.titleIds.map(id=>state.titles[id]?.countyId).find((id):id is string=>Boolean(id));
  const wallet=state.characterResources[characterId];
  if (heldCounty && (wallet?.gold??0)>=60 && !Object.values(state.projects).some(project=>project.countyId===heldCounty&&project.status==='active')) return makeAction(state,'economy.start_project',characterId,[heldCounty],{templateId:person.attributes.stewardship>=person.attributes.martial?'market':'watchtower'},'rules.world_fallback',scene,key);
  const targetId=state.playerCharacterId;
  const contract=Object.values(state.contracts).find(item=>item.vassalId===characterId&&item.liegeId===targetId);
  const hasOpenProposal=Object.values(state.interactions).some(thread=>thread.initiatorId===characterId&&thread.targetId===targetId&&['negotiating','awaiting_player','countered'].includes(thread.status));
  if(contract&&!hasOpenProposal&&person.personality.boldness>20)return makeAction(state,'interaction.open',characterId,[targetId],{intentId:'politics.modify_contract',terms:{taxLevel:'low',levyLevel:contract.levyLevel}},'rules.world_fallback',scene,key);
  return characterId===targetId?null:makeAction(state,'relationship.adjust',characterId,[targetId],{dimension:characterId==='char_jean_dol'?'suspicion':'opinion',delta:characterId==='char_jean_dol'?2:(person.personality.honor>=35?1:-1),reasonCode:'world_pulse_assessment'},'rules.world_fallback',scene,key);
}

export async function runPendingWorldSimulation(state: GameState): Promise<WorldSimulationResult> {
  const plan=await planWorldPulse(state);
  if(!plan.signals.length)return{state,plan,committedCalls:[],rejected:[]};
  let nextState=state;const committedCalls:ActionCall[]=[];const rejected:string[]=[];
  for(const[index,characterId]of plan.keyCharacterIds.entries()){
    const character=nextState.characters[characterId];if(!character?.alive)continue;let call:ActionCall|null=null;
    if(modelAvailable()){
      let decision=await callDecision(`你是关键 NPC 决策层。只能替 ${characterId} 使用一个注册行动；不得替别人调整态度、创造资源、越权转让头衔或指定战争胜者。\n人物投影：${JSON.stringify({id:character.id,traits:character.traits,goals:character.goals,ambition:character.ambition,resources:nextState.characterResources[characterId],titles:character.titleIds})}\n信号：${JSON.stringify(nextState.signals.filter(signal=>plan.signals.includes(signal.id)))}\n行动：\n${describeActionContract()}`,nextState.settings.models.keyCharacter.presetName);
      if(!decision)decision=await callDecision('严格按上一请求的 JSON schema 重试；只返回一个合法行动。',nextState.settings.models.keyCharacter.presetName);
      const candidate=decision?.actionCalls.find(item=>item.actorId===characterId);if(candidate)call=makeAction(nextState,candidate.actionId,characterId,candidate.targetIds,candidate.params,'ai.key_character',`world_${nextState.currentDate}`,`world_ai_${nextState.currentDate}_${characterId}_${index}`);
    }
    call??=fallbackWorldCall(nextState,characterId,index);if(!call)continue;const result=executeAction(nextState,call);
    if(result.status==='committed'){nextState=result.state;committedCalls.push(call);}else rejected.push(...result.errors.map(error=>`${characterId}: ${error.message}`));
  }
  const consume=makeAction(nextState,'world.consume_signals',nextState.playerCharacterId,[],{signalIds:plan.signals},'ai.world_planner',`world_${nextState.currentDate}`,`world_consume_${nextState.currentDate}_${plan.signals.join('_')}`);
  const consumed=executeAction(nextState,consume);if(consumed.status==='committed'){nextState=consumed.state;committedCalls.push(consume);}else rejected.push(...consumed.errors.map(error=>error.message));
  return{state:nextState,plan,committedCalls,rejected};
}
