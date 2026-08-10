import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { runConsequentialDialogue, runOrdinaryDialogue, runPendingWorldSimulation } from '../ai/gateway';
import { createInitialState, t } from '../content/basePack';
import { executeAction, makeAction } from '../domain/engine';
import { deadlineDays, supportCount } from '../domain/selectors';
import type { GameState } from '../domain/schema';
import { addCheckpoint, loadSave, saveState } from '../persistence/save';

export type ChronicleEntry = { id: string; date: string; kind: 'system' | 'speech' | 'event' | 'error'; title: string; text: string };

function openingChronicle(): ChronicleEntry[] {
  return [{
    id: 'opening',
    date: '1066-09-15',
    kind: 'system',
    title: '裂冠前夜',
    text: '雷恩议事厅的门刚刚合拢。多勒—孔堡旧叛乱集团正在集结降权派系；十四日后，他们将递上最后通牒。你必须离开亲领，任命摄政，赶赴霍埃尔在南特设下的宴会，并从三名摇摆封臣中争取至少两人。',
  }];
}

export const useGameStore = defineStore('ck-game', () => {
  const persisted = loadSave();
  const state = ref<GameState>(persisted?.state ?? createInitialState());
  const chronicle = ref<ChronicleEntry[]>(openingChronicle());
  const busy = ref(false);
  const selectedCountyId = ref('rennes');
  const selectedCharacterId = ref('char_hoel');
  const rightTab = ref<'people' | 'mail' | 'activity' | 'council' | 'ledger' | 'log' | 'mods' | 'settings'>('people');
  const mapLayer = ref<'rule' | 'deJure' | 'occupation' | 'intel' | 'people' | 'route'>('rule');
  const dialogueExpanded = ref(true);
  const currentSupport = computed(() => supportCount(state.value));
  const daysLeft = computed(() => deadlineDays(state.value));
  const player = computed(() => state.value.characters[state.value.playerCharacterId]);
  const currentLocation = computed(() => state.value.locations[player.value.locationId]);
  const localCharacterIds = computed(() => Object.values(state.value.characters).filter(character => character.alive && character.locationId === player.value.locationId && character.id !== player.value.id).map(character => character.id));

  function addEntry(kind: ChronicleEntry['kind'], title: string, text: string, occurredAt = state.value.currentDate): void {
    chronicle.value.push({ id: `${kind}_${Date.now()}_${chronicle.value.length}`, date: occurredAt, kind, title, text });
  }

  function commitAction(actionId: string, targetIds: string[], params: Record<string, unknown> = {}, actorId = state.value.playerCharacterId, sourceId = 'ui.player', sceneId = `scene_${state.value.scenario.sceneCount}`): boolean {
    const call = makeAction(state.value, actionId, actorId, targetIds, params, sourceId, sceneId);
    const result = executeAction(state.value, call);
    if (result.status !== 'committed') {
      addEntry('error', '行动未生效', result.errors.map(error => error.message).join('；') || '该行动被规则拒绝。');
      return false;
    }
    state.value = result.state;
    saveState(state.value);
    for (const event of result.events) addEntry('event', event.type, summarizeEvent(event.type, event.payload), event.occurredAt);
    return true;
  }

  function summarizeEvent(type: string, payload: Record<string, unknown>): string {
    const target = typeof payload.supporterId === 'string' ? t(state.value.characters[payload.supporterId]?.nameKey ?? payload.supporterId) : '';
    const summaries: Record<string, string> = {
      'regency.delegated': `已将日常治理、守备命令与代收通信权限交给 ${t(state.value.characters[String(payload.regentId)]?.nameKey ?? String(payload.regentId))}。`,
      'communication.sent': `信件已交给信使，预计 ${String(payload.deliverAt)} 送达。`,
      'communication.delivered': '信件已经送达收信人。',
      'communication.intercepted': '信使失去踪影；派系的眼线可能已经读过这封信。',
      'communication.refused': '对方没有拆封，原信被送回。',
      'travel.started': `队伍踏上${payload.routeKind === 'safe' ? '安全长路' : '危险捷径'}，预计 ${String(payload.arriveAt)} 抵达。`,
      'travel.arrived': '车马穿过城门，出巡队伍已经抵达目的地。',
      'travel.waypoint_reached': `队伍抵达 ${t(state.value.counties[String(payload.countyId)]?.nameKey ?? String(payload.countyId))} 的途中节点。`,
      'regency.action_taken': `摄政在授权范围内处理了 ${String(payload.action)}；其资源与合法性影响已经自动提交。`,
      'politics.support_committed': `${target} 已作出有条件的正式支持承诺。当前有效支持：${String(payload.currentSupport)}/2。`,
      'politics.promise_broken': '一项承诺逾期未履行，相应支持已被撤回。',
      'scenario.prologue_succeeded': '两份有效支持令降权派系当场分裂。布列塔尼战役将从这个结果继续。',
      'scenario.ultimatum_issued': '支持不足。降权派系送来最后通牒：接受降权，或在战场上回答。',
      'scenario.civil_war_started': '你拒绝降权。派系成员升起旗帜，内战已经建立为可继续的战争状态。',
      'scenario.authority_conceded': '你在宪章上盖印。公爵权威受损，但战役仍将继续。',
      'world.major_change_observed': '海峡对岸传来消息：诺曼军已登陆英格兰南岸，结果仍未注定。',
    };
    return summaries[type] ?? Object.entries(payload).map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
  }

  function selectRegent(characterId: string): void {
    if (commitAction('regency.delegate', [characterId])) addEntry('system', '摄政已定', '你可以写出试探信，并选择前往南特的路线。');
  }

  function sendProbeLetter(recipientId: string, body?: string): void {
    const recipient = state.value.characters[recipientId];
    commitAction('communication.send_letter', [recipientId], { subject: '关于南特宴会与公国安宁', body: body || `致${t(recipient.nameKey)}：愿我们在南特坦率谈论布列塔尼的安宁与彼此的义务。` });
  }

  function startTravel(routeKind: 'direct' | 'safe'): void {
    const companions = state.value.regentId === 'char_alan' ? ['char_mael'] : ['char_alan'];
    if (commitAction('travel.start', ['loc_nantes_castle'], { routeKind, companionIds: companions })) addEntry('system', '出巡开始', routeKind === 'safe' ? '队伍沿瓦讷方向绕行；时间更长，但伏击风险较低。' : '队伍取直道南下；更快，也把自己暴露给派系的耳目。');
  }

  async function resolvePendingWorld(): Promise<void> {
    if (!state.value.signals.some(signal => !signal.consumed)) return;
    const simulation = await runPendingWorldSimulation(state.value);
    state.value = simulation.state;
    saveState(state.value);
    addEntry('system', '西欧局势推演', simulation.plan.summary);
    if (simulation.rejected.length) addEntry('error', '世界规则回退', simulation.rejected.join('；'));
  }

  async function advanceDays(days = 1): Promise<void> {
    if (!commitAction('time.advance', [], { days })) return;
    await resolvePendingWorld();
    if (state.value.currentDate >= state.value.scenario.deadline && state.value.scenario.result === 'pending' && state.value.factions.faction_liberty.status !== 'ultimatum') commitAction('scenario.resolve_deadline', ['faction_liberty']);
  }

  async function advanceFeast(): Promise<void> {
    if (commitAction('activity.advance', [], { consumeTimeslot: 'true' })) await resolvePendingWorld();
  }

  function bargain(targetId: string, offerKind: string): void {
    if (commitAction('politics.offer_support_bargain', [targetId], { offerKind })) addEntry('speech', '承诺落印', `${t(state.value.characters[targetId].nameKey)}与你交换了书面承诺。它无需额外确认，但会在条件遭破坏或期限届满时撤回。`);
  }

  function answerUltimatum(answer: 'concede' | 'resist'): void {
    commitAction('scenario.answer_ultimatum', ['faction_liberty'], { answer });
  }

  function triggerSideStory(kind: 'lethal_risk' | 'ambiguous_omen' | 'adult_encounter'): void {
    const targets = kind === 'adult_encounter' ? ['char_isabeau'] : [];
    if (!commitAction('scenario.side_story', targets, { kind })) return;
    const copy = {
      lethal_risk: '你亲自接受了捷径上早已标明的致命风险；伏击结果已由固定随机种子提交。',
      ambiguous_omen: '夜里的梦兆已经成为私人记忆，但规则没有确认任何超自然力量。',
      adult_encounter: '一段只涉及成年人的私下接近开始了；意愿与机会仍由状态机约束。',
    }[kind];
    addEntry('system', '可选支线', copy);
  }

  async function talk(text: string, consequential: boolean): Promise<void> {
    if (!text.trim() || busy.value) return;
    busy.value = true;
    addEntry('speech', '科南二世', text.trim());
    const sceneId = `dialogue_${state.value.revision}_${Date.now().toString(36)}`;
    try {
      if (consequential) {
        const result = await runConsequentialDialogue(state.value, sceneId, player.value.locationId, localCharacterIds.value, text.trim());
        state.value = result.state;
        saveState(state.value);
        addEntry('speech', '在场人物', result.narration);
        if (result.rejected.length) addEntry('error', '规则回退', result.rejected.join('；'));
      } else {
        const narration = await runOrdinaryDialogue(state.value, sceneId, player.value.locationId, localCharacterIds.value, text.trim());
        addEntry('speech', '在场人物', narration);
      }
    } catch (error) {
      addEntry('error', '场景导演未响应', error instanceof Error ? error.message : String(error));
    } finally {
      busy.value = false;
    }
  }

  async function checkpoint(name: string): Promise<void> {
    await addCheckpoint(state.value, name, true);
    addEntry('system', '检查点已写入酒馆', `${name}（revision ${state.value.revision}）`);
  }

  function resetGame(): void {
    state.value = createInitialState(Date.now() >>> 0);
    chronicle.value = openingChronicle();
    saveState(state.value, []);
  }

  return {
    state, chronicle, busy, selectedCountyId, selectedCharacterId, rightTab, mapLayer, dialogueExpanded,
    currentSupport, daysLeft, player, currentLocation, localCharacterIds,
    addEntry, commitAction, selectRegent, sendProbeLetter, startTravel, advanceDays, advanceFeast, bargain, answerUltimatum, triggerSideStory, talk, checkpoint, resetGame,
  };
});
