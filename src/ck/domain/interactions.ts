import { ageOnDate } from './date';
import type { GameState } from './schema';

export type InteractionDefinition = {
  id: string;
  label: string;
  description: string;
  category: 'social' | 'diplomacy' | 'politics' | 'communication' | 'hostile';
  channels: Array<'meeting' | 'letter' | 'messenger' | 'activity'>;
  formal: boolean;
  baseAcceptance: number;
};

export const interactionDefinitions: InteractionDefinition[] = [
  { id:'social.praise', label:'称赞', description:'赞许对方的品格或功绩，改善其对你的看法。', category:'social', channels:['meeting','letter','activity'], formal:false, baseAcceptance:35 },
  { id:'social.threaten', label:'威胁', description:'制造恐惧，但损害信任并可能留下敌意。', category:'hostile', channels:['meeting','letter','messenger'], formal:true, baseAcceptance:-15 },
  { id:'politics.request_support', label:'索取政治支持', description:'围绕当前局势交换支持、职位、契约、金钱或继承保证。', category:'politics', channels:['meeting','letter','activity'], formal:true, baseAcceptance:-20 },
  { id:'politics.modify_contract', label:'修改封建契约', description:'协商税收、征召义务与特权。', category:'politics', channels:['meeting','letter','messenger'], formal:true, baseAcceptance:-25 },
  { id:'diplomacy.propose_marriage', label:'提出婚姻', description:'通过婚姻建立家庭关系、继承纽带与潜在同盟。', category:'diplomacy', channels:['meeting','letter','messenger','activity'], formal:true, baseAcceptance:-10 },
  { id:'diplomacy.form_alliance', label:'缔结同盟', description:'承诺在战争和重大政治危机中互相支援。', category:'diplomacy', channels:['meeting','letter','messenger','activity'], formal:true, baseAcceptance:-30 },
  { id:'activity.invite', label:'邀请参加活动', description:'邀请目标参加现有宴会、巡游或议会。', category:'diplomacy', channels:['meeting','letter','messenger'], formal:true, baseAcceptance:5 },
  { id:'communication.write_letter', label:'写信', description:'通过有延迟且可能被截获的正式信件交谈。', category:'communication', channels:['letter'], formal:false, baseAcceptance:50 },
  { id:'politics.arrest', label:'逮捕', description:'依据公开罪行实施逮捕；缺少正当理由会产生暴政。', category:'hostile', channels:['meeting','messenger'], formal:true, baseAcceptance:-80 },
];

export function interactionDefinition(id: string): InteractionDefinition | undefined {
  return interactionDefinitions.find(item=>item.id===id);
}

function relation(state: GameState, fromId: string, toId: string, dimension: string): number {
  return state.relationshipModifiers
    .filter(item=>item.fromId===fromId && item.toId===toId && item.dimension===dimension)
    .filter(item=>item.expiresAt===null || item.expiresAt>=state.currentDate)
    .reduce((sum,item)=>sum+item.delta,0);
}

export type AcceptanceBreakdown = { total:number; reasons:Array<{label:string;value:number}> };

export function interactionAcceptance(state: GameState, intentId: string, initiatorId: string, targetId: string, terms:Record<string,unknown>={}): AcceptanceBreakdown {
  const definition = interactionDefinition(intentId);
  const initiator = state.characters[initiatorId];
  const target = state.characters[targetId];
  if (!definition || !initiator || !target) return { total:-100, reasons:[{label:'无效人物或行动',value:-100}] };
  const reasons:Array<{label:string;value:number}> = [{label:'行动基础',value:definition.baseAcceptance}];
  const opinion = relation(state,targetId,initiatorId,'opinion');
  const trust = relation(state,targetId,initiatorId,'trust');
  const fear = relation(state,targetId,initiatorId,'fear');
  if (opinion) reasons.push({label:'对你的好感',value:opinion});
  if (trust) reasons.push({label:'信任',value:trust});
  if (fear && ['social.threaten','politics.arrest'].includes(intentId)) reasons.push({label:'畏惧',value:Math.round(fear/2)});
  const skill = Math.round((initiator.attributes.diplomacy-target.attributes.diplomacy)/2);
  if (skill) reasons.push({label:'外交能力差',value:skill});
  if (target.traits.includes('忠诚') && initiator.id===target.liegeId) reasons.push({label:'忠诚封臣',value:20});
  if (target.traits.includes('骄傲') && intentId==='social.threaten') reasons.push({label:'骄傲',value:-18});
  if (target.traits.includes('务实') && ['politics.request_support','politics.modify_contract'].includes(intentId)) reasons.push({label:'务实',value:12});
  if (intentId==='politics.request_support' && target.liegeId===initiatorId) reasons.push({label:'封臣义务',value:12});
  if (intentId==='politics.modify_contract') {
    const contract = Object.values(state.contracts).find(item=>item.liegeId===initiatorId&&item.vassalId===targetId);
    reasons.push({label:contract?'存在封建契约':'没有直接契约',value:contract?18:-80});
  }
  if (intentId==='diplomacy.propose_marriage') {
    const left=state.characters[typeof terms.candidateAId==='string'?terms.candidateAId:initiatorId]??initiator;
    const right=state.characters[typeof terms.candidateBId==='string'?terms.candidateBId:targetId]??target;
    const bothAdult = left.alive&&right.alive&&ageOnDate(left.birthDate,state.currentDate)>=18 && ageOnDate(right.birthDate,state.currentDate)>=18;
    reasons.push({label:bothAdult?'双方成年':'年龄条件不符',value:bothAdult?10:-100});
    if (left.spouseIds.length || right.spouseIds.length) reasons.push({label:'已有婚姻',value:-100});
    if (left.houseId===right.houseId) reasons.push({label:'同一家族',value:-35});
  }
  if (intentId==='diplomacy.form_alliance') {
    const initiatorPower=state.characterResources[initiatorId]?.levies??0;
    const targetPower=state.characterResources[targetId]?.levies??0;
    reasons.push({label:'同盟军事价值',value:Math.min(30,Math.round((initiatorPower+targetPower)/300))});
  }
  if (intentId==='politics.arrest') {
    const knownCrime=Object.values(state.knowledge).some(fact=>fact.subjectId===targetId&&fact.predicate==='organized_faction'&&fact.certainty==='confirmed');
    reasons.push({label:knownCrime?'已知犯罪理由':'没有正当理由',value:knownCrime?35:-40});
  }
  return { total:reasons.reduce((sum,item)=>sum+item.value,0), reasons };
}

export function interactionChannel(state: GameState, initiatorId: string, targetId: string, intentId: string): 'meeting'|'letter'|'messenger'|'activity'|null {
  const definition=interactionDefinition(intentId);
  const initiator=state.characters[initiatorId];
  const target=state.characters[targetId];
  if (!definition||!initiator||!target||!target.alive) return null;
  const sameLocation=initiator.locationId===target.locationId;
  const sharedActivity=Object.values(state.activities).some(activity=>activity.status==='active'&&activity.participantIds.includes(initiatorId)&&activity.participantIds.includes(targetId));
  if (sharedActivity&&definition.channels.includes('activity')) return 'activity';
  if (sameLocation&&definition.channels.includes('meeting')) return 'meeting';
  if (definition.channels.includes('letter')) return 'letter';
  if (definition.channels.includes('messenger')) return 'messenger';
  return null;
}
