import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { runInteractionDialogue, runOrdinaryDialogue, runPendingWorldSimulation } from '../ai/gateway';
import { createInitialState, t } from '../content/basePack';
import { executeAction, makeAction } from '../domain/engine';
import { daysToNextScheduled, pendingPlayerEvent, primaryTitle, supportCount, unreadNotifications } from '../domain/selectors';
import type { GameState } from '../domain/schema';
import {
  addCheckpoint, loadSave, restoreCheckpoint, restoreLatestHistoryBranch, saveState, writeNarrativeExchange,
  type ChronicleEntry, type SaveCheckpoint,
} from '../persistence/save';

export type SelectedObjectKind = 'county'|'character'|'activity'|'title'|'war';
export type UtilityWindow = 'council'|'factions'|'succession'|'chronicle'|'mail'|'mods'|'settings'|null;

function openingChronicle(): ChronicleEntry[] {
  return [{
    id:'opening', date:'1066-09-15', kind:'system', title:'布列塔尼，1066 年秋',
    text:'科南二世在雷恩处理公国政务。多勒旧叛乱集团正在组织降权派系，霍埃尔也将在南特设宴——但这只是当前局势之一。你可以赴宴、联姻、重订契约、争取外援、建设领地，或用战争解决问题；历史施加压力，却不替你写好结局。',
  }];
}

export const useGameStore=defineStore('ck-game',()=>{
  const persisted=loadSave();
  const state=ref<GameState>(persisted?.state??createInitialState());
  const chronicle=ref<ChronicleEntry[]>(persisted?.chronicle.length?persisted.chronicle:openingChronicle());
  const checkpoints=ref<SaveCheckpoint[]>(persisted?.checkpoints??[]);
  const busy=ref(false);const streamingText=ref('');
  const selectedKind=ref<SelectedObjectKind>('county');const selectedObjectId=ref('rennes');
  const mapLayer=ref<'rule'|'deJure'|'occupation'|'intel'|'people'|'armies'|'activities'|'route'>('rule');
  const utilityWindow=ref<UtilityWindow>(null);const dialogueOpen=ref(false);const activeInteractionId=ref<string|null>(null);

  const player=computed(()=>state.value.characters[state.value.playerCharacterId]);
  const playerTitle=computed(()=>primaryTitle(state.value,state.value.playerCharacterId));
  const currentLocation=computed(()=>state.value.locations[player.value.locationId]);
  const localCharacterIds=computed(()=>Object.values(state.value.characters).filter(character=>character.alive&&character.locationId===player.value.locationId&&character.id!==player.value.id).map(character=>character.id));
  const activeSituation=computed(()=>Object.values(state.value.situations).find(item=>item.status==='active'||item.status==='war')??null);
  const currentSupport=computed(()=>supportCount(state.value));
  const pendingEvent=computed(()=>pendingPlayerEvent(state.value));
  const alerts=computed(()=>unreadNotifications(state.value));
  const activeInteraction=computed(()=>activeInteractionId.value?state.value.interactions[activeInteractionId.value]??null:null);
  const selectedCounty=computed(()=>selectedKind.value==='county'?state.value.counties[selectedObjectId.value]??null:null);
  const selectedCharacter=computed(()=>selectedKind.value==='character'?state.value.characters[selectedObjectId.value]??null:null);
  const selectedActivity=computed(()=>selectedKind.value==='activity'?state.value.activities[selectedObjectId.value]??null:null);

  function persist(){const envelope=saveState(state.value,{chronicle:chronicle.value,checkpoints:checkpoints.value});checkpoints.value=envelope.checkpoints;}
  function addEntry(kind:ChronicleEntry['kind'],title:string,text:string,occurredAt=state.value.currentDate,persistAfter=true){chronicle.value.push({id:`${kind}_${Date.now()}_${chronicle.value.length}`,date:occurredAt,kind,title,text});if(chronicle.value.length>500)chronicle.value.splice(0,chronicle.value.length-500);if(persistAfter)persist();}

  function summarizeEvent(type:string,payload:Record<string,unknown>):string{
    const name=(id:unknown)=>typeof id==='string'?t(state.value.characters[id]?.nameKey??state.value.counties[id]?.nameKey??id):'';
    const summaries:Record<string,string>={
      'interaction.opened':`已建立正式互动，渠道：${String(payload.channel)}，基础接受度 ${String(payload.acceptance)}。`,
      'interaction.accepted':'双方的正式结果已经由规则引擎提交。','interaction.rejected':'对方拒绝了这项提议。','interaction.countered':'对方提出了新的条件，等待你的答复。',
      'communication.sent':`信使已经出发，预计 ${String(payload.deliverAt)} 送达。`,'communication.delivered':'信件已经送达。','communication.intercepted':'信件遭到截获。','communication.refused':'收信人拒绝拆封。',
      'travel.started':`队伍启程，预计 ${String(payload.arriveAt)} 抵达。`,'travel.arrived':'队伍已经抵达目的地。','travel.waypoint_reached':`队伍经过 ${name(payload.countyId)}。`,
      'activity.started':'一项活动已经开始；你可以关注，也可以无视。','activity.phase_changed':`活动进入 ${String(payload.phase)} 阶段。`,
      'council.appointed':`${name(payload.targetId)}获得议会任命。`,'regency.delegated':`${name(payload.regentId)}被授予摄政权限。`,
      'economy.project_started':`${name(payload.countyId)}开始建设 ${String(payload.templateId)}。`,'economy.project_completed':`${name(payload.countyId)}的建设已经完成。`,
      'politics.support_committed':`${name(payload.supporterId)}作出正式支持承诺。`,'politics.contract_modified':'封建契约已经重订。','politics.character_arrested':`${name(payload.targetId)}已被逮捕。`,
      'faction.member_joined':`${name(payload.memberId)}加入派系。`,'faction.member_left':`${name(payload.memberId)}退出派系。`,
      'military.war_declared':'战争已经爆发。','situation.ultimatum_issued':'降权派系发出最后通牒。','situation.liberty_resolved':'降权危机已经解除。','situation.civil_war_started':'降权争端转化为派系战争。',
      'succession.player_changed':`${name(payload.heirId)}继承头衔并成为新的玩家角色。`,'world.norman_landing':'诺曼军在英格兰南岸登陆，胜负仍未决定。',
    };
    return summaries[type]??Object.entries(payload).slice(0,5).map(([key,value])=>`${key}: ${String(value)}`).join(' · ');
  }

  function commitAction(actionId:string,targetIds:string[],params:Record<string,unknown>={},actorId=state.value.playerCharacterId,sourceId='ui.player',sceneId=`scene_${state.value.revision}`):boolean{
    const result=executeAction(state.value,makeAction(state.value,actionId,actorId,targetIds,params,sourceId,sceneId));
    if(result.status!=='committed'){addEntry('error','行动未生效',result.errors.map(error=>error.message).join('；')||'该行动被规则拒绝。');return false;}
    state.value=result.state;for(const event of result.events)addEntry('event',event.type,summarizeEvent(event.type,event.payload),event.occurredAt,false);persist();return true;
  }

  function selectCounty(id:string){selectedKind.value='county';selectedObjectId.value=id;utilityWindow.value=null;}
  function selectCharacter(id:string){selectedKind.value='character';selectedObjectId.value=id;utilityWindow.value=null;}
  function selectActivity(id:string){selectedKind.value='activity';selectedObjectId.value=id;utilityWindow.value=null;}

  async function resolvePendingWorld(){if(!state.value.signals.some(signal=>!signal.consumed))return;const simulation=await runPendingWorldSimulation(state.value);state.value=simulation.state;addEntry('system','西欧局势推演',simulation.plan.summary,state.value.currentDate,false);if(simulation.rejected.length)addEntry('error','世界规则回退',simulation.rejected.join('；'),state.value.currentDate,false);persist();}
  async function advanceDays(days:number){if(busy.value)return;busy.value=true;try{if(commitAction('time.advance',[],{days}))await resolvePendingWorld();}finally{busy.value=false;}}
  async function advanceToNext(){await advanceDays(Math.max(1,Math.min(30,daysToNextScheduled(state.value))));}
  function chooseEvent(eventId:string,choiceId:string){commitAction('event.choose',[eventId],{choiceId});}
  function readNotification(id:string){commitAction('notification.read',[],{notificationId:id});}

  function beginInteraction(intentId:string,targetId:string,terms:Record<string,unknown>={}){
    const before=new Set(Object.keys(state.value.interactions));
    if(!commitAction('interaction.open',[targetId],{intentId,terms},state.value.playerCharacterId,'ui.interaction',`interaction_${state.value.revision}`))return;
    activeInteractionId.value=Object.keys(state.value.interactions).find(id=>!before.has(id))??null;dialogueOpen.value=true;selectedKind.value='character';selectedObjectId.value=targetId;
  }
  function openIncomingInteraction(id:string){if(!state.value.interactions[id])return;activeInteractionId.value=id;dialogueOpen.value=true;}
  function respondInteraction(decision:'accept'|'reject'|'counter',terms:Record<string,unknown>={},message=''){
    if(!activeInteraction.value)return;commitAction('interaction.resolve',[activeInteraction.value.id],{decision,terms,message});
  }
  async function talk(text:string){if(!text.trim()||busy.value)return;busy.value=true;streamingText.value='';addEntry('speech',t(player.value.nameKey),text.trim(),state.value.currentDate,false);persist();
    try{let narration:string;if(activeInteraction.value?.status==='negotiating'){const result=await runInteractionDialogue(state.value,activeInteraction.value.id,text.trim(),value=>streamingText.value=value);state.value=result.state;narration=result.narration;if(result.rejected.length)addEntry('error','互动规则回退',result.rejected.join('；'),state.value.currentDate,false);}else{const speakers=selectedCharacter.value&&selectedCharacter.value.locationId===player.value.locationId?[selectedCharacter.value.id]:localCharacterIds.value.slice(0,3);narration=await runOrdinaryDialogue(state.value,`talk_${state.value.revision}`,player.value.locationId,speakers,text.trim(),value=>streamingText.value=value);}addEntry('speech','对方',narration,state.value.currentDate,false);const envelope=await writeNarrativeExchange(state.value,chronicle.value,text.trim(),narration);checkpoints.value=envelope.checkpoints;}catch(error){addEntry('error','场景导演未响应',error instanceof Error?error.message:String(error));}finally{streamingText.value='';busy.value=false;persist();}}

  function sendLetter(recipientId:string,subject:string,body:string){commitAction('communication.send_letter',[recipientId],{subject,body});}
  function startTravel(destinationLocationId:string,routeKind:'direct'|'safe'='direct'){commitAction('travel.start',[destinationLocationId],{routeKind,companionIds:[]});}
  function advanceActivity(activityId:string){commitAction('activity.advance',[],{activityId});}
  function appointCouncil(positionId:string,characterId:string){commitAction('council.appoint',[characterId],{positionId});}
  function delegateRegency(characterId:string){commitAction('regency.delegate',[characterId]);}
  function startProject(countyId:string,templateId:'market'|'watchtower'){commitAction('economy.start_project',[countyId],{templateId});}
  function arrest(characterId:string){commitAction('politics.arrest',[characterId]);}
  function declareWar(defenderId:string,countyId:string){commitAction('military.declare_county_claim',[defenderId,countyId]);}

  async function checkpoint(name:string){addEntry('system','检查点已写入酒馆',`${name}（revision ${state.value.revision}）`,state.value.currentDate,false);const envelope=await addCheckpoint(state.value,chronicle.value,name,true);checkpoints.value=envelope.checkpoints;}
  function restoreNamedCheckpoint(id:string){const restored=restoreCheckpoint(id);if(!restored){addEntry('error','检查点恢复失败','检查点不兼容、不存在或状态哈希校验失败。');return;}state.value=restored.state;chronicle.value=restored.chronicle;checkpoints.value=loadSave()?.checkpoints??[];activeInteractionId.value=null;addEntry('system','已恢复检查点',`战役回到 revision ${state.value.revision}。`);}
  function reloadFromHost(historyChanged=false){if(busy.value)return;const envelope=historyChanged?restoreLatestHistoryBranch():loadSave();if(envelope){state.value=envelope.state;chronicle.value=envelope.chronicle.length?envelope.chronicle:openingChronicle();checkpoints.value=envelope.checkpoints;}else{state.value=createInitialState();chronicle.value=openingChronicle();checkpoints.value=[];persist();}activeInteractionId.value=null;}
  function setPulseDays(days:number){state.value.settings.regularWorldPulseDays=Math.max(3,Math.min(30,Math.round(days)));persist();}
  function setContentPacks(packs:Array<{id:string;version:string}>){state.value.contentPackIds=packs.map(pack=>pack.id);state.value.contentPackVersions=Object.fromEntries(packs.map(pack=>[pack.id,pack.version]));persist();}
  function resetGame(){state.value=createInitialState(Date.now()>>>0);chronicle.value=openingChronicle();checkpoints.value=[];activeInteractionId.value=null;saveState(state.value,{chronicle:chronicle.value,checkpoints:[],branchAnchor:null});}

  return{state,chronicle,checkpoints,busy,streamingText,selectedKind,selectedObjectId,mapLayer,utilityWindow,dialogueOpen,activeInteractionId,player,playerTitle,currentLocation,localCharacterIds,activeSituation,currentSupport,pendingEvent,alerts,activeInteraction,selectedCounty,selectedCharacter,selectedActivity,addEntry,commitAction,selectCounty,selectCharacter,selectActivity,advanceDays,advanceToNext,chooseEvent,readNotification,beginInteraction,openIncomingInteraction,respondInteraction,talk,sendLetter,startTravel,advanceActivity,appointCouncil,delegateRegency,startProject,arrest,declareWar,checkpoint,restoreNamedCheckpoint,reloadFromHost,setPulseDays,setContentPacks,resetGame};
});
