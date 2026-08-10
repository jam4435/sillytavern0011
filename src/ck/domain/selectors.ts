import { ageOnDate, daysBetween, daysUntilDeadline } from './date';
import type { GameState, RelationshipDimension } from './schema';

export function relationshipValue(state: GameState, fromId: string, toId: string, dimension: RelationshipDimension): number {
  return state.relationshipModifiers.filter(item=>item.fromId===fromId&&item.toId===toId&&item.dimension===dimension)
    .filter(item=>item.expiresAt===null||item.expiresAt>=state.currentDate).reduce((sum,item)=>sum+item.delta,0);
}

export function isPromiseEffective(state: GameState, promiseId: string): boolean {
  const promise=state.promises[promiseId];
  return Boolean(promise&&(promise.status==='fulfilled'||(promise.status==='active'&&promise.dueDate>=state.currentDate)));
}

export function activeSupports(state: GameState): GameState['supportCommitments'][string][] {
  return Object.values(state.supportCommitments).filter(item=>item.status==='active'&&item.expiresAt>=state.currentDate&&item.conditionPromiseIds.every(id=>isPromiseEffective(state,id)));
}

export function supportCount(state: GameState, issueId='ducal_authority'): number {
  return new Set(activeSupports(state).filter(item=>item.issueId===issueId).map(item=>item.supporterId)).size;
}

export function libertySituation(state: GameState) {
  return Object.values(state.situations).find(item=>item.definitionId==='situation.liberty_crisis_1066')??null;
}

export function deadlineDays(state: GameState): number { return daysUntilDeadline(state); }
export function characterAge(state: GameState, characterId: string): number { const person=state.characters[characterId]; return person?ageOnDate(person.birthDate,state.currentDate):-1; }
export function countyForLocation(state: GameState, locationId: string): string|null { return state.locations[locationId]?.countyId??null; }

export function findCountyPath(state: GameState, fromCountyId: string, toCountyId: string): string[]|null {
  if(fromCountyId===toCountyId)return[fromCountyId];
  const queue:string[][]=[[fromCountyId]];const seen=new Set([fromCountyId]);
  while(queue.length){const path=queue.shift()!;const current=path[path.length-1];for(const next of state.counties[current]?.adjacentCountyIds??[]){if(seen.has(next))continue;const candidate=[...path,next];if(next===toCountyId)return candidate;seen.add(next);queue.push(candidate);}}
  return null;
}

export function nextScheduledDate(state: GameState): string|null {
  const dates:string[]=[state.nextRegularPulseAt];
  for(const item of Object.values(state.situations))if(item.status==='active'&&item.deadline&&item.deadline>state.currentDate)dates.push(item.deadline);
  for(const item of Object.values(state.activities))if(item.status==='planned'&&item.startedAt>state.currentDate)dates.push(item.startedAt);
  for(const item of Object.values(state.communications))if(item.status==='in_transit'&&item.deliverAt>state.currentDate)dates.push(item.deliverAt);
  for(const item of Object.values(state.travels))if(item.status==='travelling'&&item.arriveAt>state.currentDate)dates.push(item.arriveAt);
  return dates.sort()[0]??null;
}

export function daysToNextScheduled(state: GameState): number { const date=nextScheduledDate(state);return date?Math.max(1,daysBetween(state.currentDate,date)):7; }

export function realmTopLiegeTitleId(state: GameState, titleId: string): string {
  let current=state.titles[titleId];const seen=new Set<string>();
  while(current?.deFactoLiegeId&&!seen.has(current.id)){seen.add(current.id);const next=state.titles[current.deFactoLiegeId];if(!next)break;current=next;}
  return current?.id??titleId;
}

export function countyRealmId(state: GameState, countyId: string): string {
  const title=state.titles[state.counties[countyId]?.titleId];return title?realmTopLiegeTitleId(state,title.id):'none';
}

export function primaryTitle(state: GameState, characterId: string) {
  const rank={barony:0,county:1,duchy:2,kingdom:3,empire:4};
  return state.characters[characterId]?.titleIds.map(id=>state.titles[id]).filter(Boolean).sort((a,b)=>rank[b.rank]-rank[a.rank])[0]??null;
}

export type SceneProjection={
  date:string;segment:GameState['clock']['segment'];sceneId:string;locationId:string;activeCharacterIds:string[];
  characters:Array<{id:string;name:string;traits:string[];goal:string|null;ambition:string|null;opinionOfPlayer:number;trustOfPlayer:number}>;
  publicFacts:Array<{subjectId:string;predicate:string;value:unknown;certainty:string}>;
  player:{id:string;resources:GameState['resources'];titles:string[]};
  situations:Array<{id:string;phase:string;deadline:string|null;metrics:Record<string,number>}>;
  interaction:GameState['interactions'][string]|null;
};

export function projectScene(state:GameState,sceneId:string,locationId:string,requestedCharacterIds:string[],interactionId?:string):SceneProjection{
  const interaction=interactionId?state.interactions[interactionId]??null:null;
  const participantIds=interaction?[interaction.initiatorId,interaction.targetId]:[];
  const localIds=[...new Set([...participantIds,...requestedCharacterIds.filter(id=>state.characters[id]?.alive&&state.characters[id].locationId===locationId)])].filter(id=>state.characters[id]?.alive).slice(0,3);
  const visibleFacts=Object.values(state.knowledge).filter(fact=>fact.visibility==='public'||state.characters[state.playerCharacterId]?.knowledgeIds.includes(fact.id));
  return{date:state.currentDate,segment:state.clock.segment,sceneId,locationId,activeCharacterIds:localIds,
    characters:localIds.map(id=>({id,name:state.characters[id].nameKey,traits:state.characters[id].traits,goal:state.characters[id].shortTermGoal,ambition:state.characters[id].ambition,opinionOfPlayer:relationshipValue(state,id,state.playerCharacterId,'opinion'),trustOfPlayer:relationshipValue(state,id,state.playerCharacterId,'trust')})),
    publicFacts:visibleFacts.map(({subjectId,predicate,value,certainty})=>({subjectId,predicate,value,certainty})),
    player:{id:state.playerCharacterId,resources:state.resources,titles:state.characters[state.playerCharacterId]?.titleIds??[]},
    situations:Object.values(state.situations).filter(item=>item.status==='active').map(item=>({id:item.id,phase:item.phase,deadline:item.deadline,metrics:item.metrics})),
    interaction};
}

export function livingBloodHeirs(state:GameState,deceasedId:string):string[]{
  const deceased=state.characters[deceasedId];if(!deceased)return[];
  const descendants:string[]=[];const queue=[...deceased.childIds];const seen=new Set<string>();
  while(queue.length){const id=queue.shift()!;if(seen.has(id))continue;seen.add(id);const person=state.characters[id];if(!person)continue;if(person.alive)descendants.push(id);queue.push(...person.childIds);}
  const siblings=Object.values(state.characters).filter(person=>person.id!==deceasedId&&person.alive&&person.parentIds.some(id=>deceased.parentIds.includes(id))).map(person=>person.id);
  const broader=Object.values(state.characters).filter(person=>person.id!==deceasedId&&person.alive&&(person.dynastyId===deceased.dynastyId||person.houseId===deceased.houseId)).map(person=>person.id);
  const designated=deceased.titleIds.flatMap(titleId=>Object.values(state.succession).find(line=>line.titleId===titleId)?.heirIds??[]).filter(id=>state.characters[id]?.alive);
  const byAge=(ids:string[])=>ids.sort((a,b)=>characterAge(state,b)-characterAge(state,a));
  return [...new Set([...designated,...byAge(descendants),...byAge(siblings),...byAge(broader)])];
}

export function unreadNotifications(state:GameState){return Object.values(state.notifications).filter(item=>!item.read).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export function pendingPlayerEvent(state:GameState){return Object.values(state.pendingEvents).filter(item=>item.status==='pending'&&item.requiresResponse).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt))[0]??null;}
