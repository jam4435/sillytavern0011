<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import CountyMap from './components/CountyMap.vue';
import { loadContentPacks, corePack, prologuePack, readContentPackFile, type ContentPack } from './content/loader';
import { t } from './content/basePack';
import { relationshipValue } from './domain/selectors';
import { useGameStore } from './stores/game';

const store = useGameStore();
const { state, chronicle, busy, selectedCountyId, selectedCharacterId, rightTab, mapLayer, dialogueExpanded, currentSupport, daysLeft, player, currentLocation } = storeToRefs(store);
const dialogueText = ref('');
const consequential = ref(false);
const checkpointName = ref('宴会前夜');
const importedPacks = ref<ContentPack[]>([]);
const modReport = ref('本体与序章内容包已通过同一加载器。');
const mobileTab = ref<'map' | 'dialogue' | 'panel'>('map');

const tabs = [
  ['people', '人物'], ['mail', '信箱'], ['activity', '活动'], ['council', '议会'], ['ledger', '政治账本'], ['log', '日志'], ['mods', '模组'], ['settings', '设置'],
] as const;
const layers = [
  ['rule', '实际'], ['deJure', '法理'], ['occupation', '占领'], ['intel', '情报'], ['people', '人物'], ['route', '路线'],
] as const;
const selectedCounty = computed(() => state.value.counties[selectedCountyId.value]);
const selectedTitle = computed(() => selectedCounty.value ? state.value.titles[selectedCounty.value.titleId] : null);
const selectedHolder = computed(() => selectedTitle.value?.holderId ? state.value.characters[selectedTitle.value.holderId] : null);
const selectedCharacter = computed(() => state.value.characters[selectedCharacterId.value]);
const feast = computed(() => state.value.activities[state.value.scenario.feastId]);
const supportsById = computed(() => new Set(Object.values(state.value.supportCommitments).filter(item => item.status === 'active').map(item => item.supporterId)));
const latestEntries = computed(() => chronicle.value.slice(-14));
const currentTravel = computed(() => state.value.scenario.activeTravelId ? state.value.travels[state.value.scenario.activeTravelId] : null);
const canTravel = computed(() => Boolean(state.value.regentId) && !currentTravel.value && player.value.locationId !== 'loc_nantes_castle');
const canFeast = computed(() => player.value.locationId === 'loc_nantes_castle' && feast.value.phase !== 'departure');

const characterCards = computed(() => state.value.scenario.supportTargetIds.map(id => {
  const character = state.value.characters[id];
  const titleNames = character.titleIds.map(titleId => t(state.value.titles[titleId]?.nameKey ?? titleId));
  return { ...character, titleNames, opinion: relationshipValue(state.value, id, player.value.id, 'opinion'), supported: supportsById.value.has(id) };
}));

const offers: Record<string, Array<{ id: string; label: string; cost: string }>> = {
  char_hoel: [
    { id: 'succession_recognition', label: '承认阿维丝继承序位', cost: '正式承诺 · 120日' },
    { id: 'council_office', label: '许诺宫廷高位', cost: '职位承诺 · 120日' },
  ],
  char_geoffroy: [
    { id: 'contract_concession', label: '重订征召契约', cost: '契约让步 · 120日' },
    { id: 'gold_gift', label: '家族平反礼金', cost: '立即支付 35 金' },
  ],
  char_morvan: [
    { id: 'marshal_office', label: '授予军事职位', cost: '职位承诺 · 120日' },
    { id: 'border_subsidy', label: '拨付边防津贴', cost: '立即支付 45 金' },
  ],
};

const phaseLabel = computed(() => ({
  council: '密议', planning: '筹划', travelling: '出巡途中', arrival: '抵达南特', feast: '宴会', return: '散席', ultimatum: '最后通牒', campaign: '战役继续',
}[state.value.scenario.phase]));

function chooseCharacter(id: string): void {
  selectedCharacterId.value = id;
  rightTab.value = 'people';
}

async function submitDialogue(): Promise<void> {
  const text = dialogueText.value.trim();
  if (!text) return;
  dialogueText.value = '';
  await store.talk(text, consequential.value);
}

async function importPack(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const parsed = await readContentPackFile(file);
  if (!parsed.ok) {
    modReport.value = parsed.errors.join('\n');
    return;
  }
  const registry = loadContentPacks([corePack, prologuePack, ...importedPacks.value, parsed.pack]);
  if (registry.errors.length) {
    modReport.value = registry.errors.map(error => `${error.code}: ${error.message}`).join('\n');
    return;
  }
  importedPacks.value.push(parsed.pack);
  modReport.value = `已加载 ${parsed.pack.name} ${parsed.pack.version}；${registry.entities.size} 个声明式实体。当前存档未被污染。`;
  state.value.contentPackIds = registry.packs.map(pack => pack.id);
}

function updatePulseDays(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  state.value.settings.regularWorldPulseDays = Math.max(3, Math.min(30, value));
}
</script>

<template>
  <main class="ck-shell" :class="`mobile-${mobileTab}`">
    <header class="topbar">
      <div class="brand-block">
        <div class="seal-mark">CⅡ</div>
        <div>
          <p>公爵机要图室</p>
          <h1>裂冠前夜</h1>
        </div>
      </div>
      <div class="time-block">
        <span class="eyebrow">ANNO DOMINI</span>
        <strong>{{ state.currentDate }}</strong>
        <span>{{ phaseLabel }}</span>
      </div>
      <div class="resource-strip">
        <div><span>金库</span><b>{{ state.resources.gold }}</b></div>
        <div><span>威望</span><b>{{ state.resources.prestige }}</b></div>
        <div><span>合法性</span><b>{{ state.resources.legitimacy }}</b></div>
        <div><span>兵员</span><b>{{ state.resources.levies }}</b></div>
      </div>
      <div class="deadline-block" :class="{ danger: daysLeft <= 3 }">
        <span>降权派系最后通牒</span>
        <strong>{{ Math.max(0, daysLeft) }} 日</strong>
        <small>有效支持 {{ currentSupport }}/2</small>
      </div>
    </header>

    <nav class="mobile-nav" aria-label="手机页面">
      <button :class="{ active: mobileTab === 'map' }" @click="mobileTab = 'map'">地图</button>
      <button :class="{ active: mobileTab === 'dialogue' }" @click="mobileTab = 'dialogue'">对话</button>
      <button :class="{ active: mobileTab === 'panel' }" @click="mobileTab = 'panel'">政务</button>
    </nav>

    <section class="map-column">
      <div class="layer-bar">
        <span>图层</span>
        <button v-for="item in layers" :key="item[0]" :class="{ active: mapLayer === item[0] }" @click="mapLayer = item[0]">{{ item[1] }}</button>
      </div>
      <CountyMap :state="state" :selected-county-id="selectedCountyId" :layer="mapLayer" @select="selectedCountyId = $event" />
      <div v-if="selectedCounty" class="county-inspector">
        <div>
          <span class="eyebrow">COMITATUS</span>
          <h2>{{ t(selectedCounty.nameKey) }} <small>{{ selectedCounty.originalName }}</small></h2>
        </div>
        <dl>
          <div><dt>实际持有人</dt><dd>{{ selectedHolder ? t(selectedHolder.nameKey) : '无主' }}</dd></div>
          <div><dt>控制力</dt><dd>{{ selectedCounty.control }}%</dd></div>
          <div><dt>战时占领</dt><dd>{{ selectedCounty.occupation ? '是（不转移称号）' : '无' }}</dd></div>
          <div><dt>相邻伯爵领</dt><dd>{{ selectedCounty.adjacentCountyIds.map(id => t(state.counties[id].nameKey)).join(' · ') }}</dd></div>
        </dl>
      </div>
    </section>

    <aside class="side-panel">
      <nav class="panel-tabs">
        <button v-for="tab in tabs" :key="tab[0]" :class="{ active: rightTab === tab[0] }" @click="rightTab = tab[0]">{{ tab[1] }}</button>
      </nav>

      <div v-if="rightTab === 'people'" class="panel-content people-panel">
        <div class="panel-heading"><span>三位摇摆封臣</span><b>{{ currentSupport }}/2</b></div>
        <article v-for="character in characterCards" :key="character.id" class="person-card" :class="{ selected: selectedCharacterId === character.id, supported: character.supported }" @click="chooseCharacter(character.id)">
          <div class="portrait-placeholder">{{ t(character.nameKey).slice(0, 1) }}</div>
          <div class="person-copy">
            <h3>{{ t(character.nameKey) }} <span v-if="character.sourceType === 'composite'">合成人物</span></h3>
            <p>{{ character.titleNames.join('、') }}</p>
            <small>{{ character.goals.join(' · ') }}</small>
          </div>
          <div class="opinion"><span>态度</span><b>{{ character.opinion >= 0 ? '+' : '' }}{{ character.opinion }}</b></div>
        </article>
        <section v-if="selectedCharacter" class="negotiation-dossier">
          <p class="eyebrow">NEGOTIATIO</p>
          <h3>与 {{ t(selectedCharacter.nameKey) }} 交涉</h3>
          <p class="dossier-note">合法协议将立即落印；玩家不能因为结果不利而拒绝已经成立的 NPC 行动。承诺若被破坏，支持会自动撤回。</p>
          <button v-for="offer in offers[selectedCharacter.id] ?? []" :key="offer.id" :disabled="supportsById.has(selectedCharacter.id) || selectedCharacter.locationId !== player.locationId" class="offer-button" @click="store.bargain(selectedCharacter.id, offer.id)">
            <span>{{ offer.label }}</span><small>{{ offer.cost }}</small>
          </button>
          <small v-if="selectedCharacter.locationId !== player.locationId" class="distance-warning">对方不在此地：先写信，或在南特宴会当面交涉。</small>
        </section>
      </div>

      <div v-else-if="rightTab === 'mail'" class="panel-content">
        <div class="panel-heading"><span>封蜡信匣</span><b>{{ Object.keys(state.communications).length }}</b></div>
        <div class="quick-letters">
          <button v-for="id in state.scenario.supportTargetIds" :key="id" @click="store.sendProbeLetter(id)">致 {{ t(state.characters[id].nameKey) }}</button>
        </div>
        <article v-for="letter in state.communications" :key="letter.id" class="letter-card">
          <div><b>{{ letter.subject }}</b><span :class="`status-${letter.status}`">{{ letter.status }}</span></div>
          <p>{{ t(state.characters[letter.senderId].nameKey) }} → {{ t(state.characters[letter.recipientId].nameKey) }}</p>
          <small>{{ letter.sentAt }} / 预计 {{ letter.deliverAt }}</small>
        </article>
        <p v-if="!Object.keys(state.communications).length" class="empty-note">没有在途信件。信件可能延迟、拒收、截获或泄露；首版不包含伪造和翻译失真。</p>
      </div>

      <div v-else-if="rightTab === 'activity'" class="panel-content">
        <div class="panel-heading"><span>南特宴会</span><b>{{ feast.phase }}</b></div>
        <ol class="phase-list">
          <li v-for="phase in ['welcome','public_feast','free_conversation','private_audiences','departure']" :key="phase" :class="{ active: feast.phase === phase }">{{ {welcome:'迎宾',public_feast:'公开宴席',free_conversation:'自由交谈',private_audiences:'私下会面',departure:'散席'}[phase] }}</li>
        </ol>
        <div v-if="state.scenario.phase === 'council' || state.scenario.phase === 'planning'" class="action-block">
          <h3>出巡准备</h3>
          <p>先任命摄政，再选择路线。正式会面和宴会阶段会各消耗一个时段。</p>
          <div class="route-buttons">
            <button :disabled="!canTravel" @click="store.startTravel('direct')"><b>危险捷径</b><small>约 2 日 · 致命风险可见</small></button>
            <button :disabled="!canTravel" @click="store.startTravel('safe')"><b>安全长路</b><small>约 4 日 · 绕行瓦讷</small></button>
          </div>
        </div>
        <div v-if="currentTravel" class="travel-card">
          <span>行程 {{ currentTravel.routeKind === 'safe' ? '安全长路' : '危险捷径' }}</span>
          <b>{{ currentTravel.departedAt }} → {{ currentTravel.arriveAt }}</b>
          <p>{{ currentTravel.routeCountyIds.map(id => t(state.counties[id].nameKey)).join(' → ') }}</p>
        </div>
        <div class="side-stories">
          <button v-if="currentTravel?.routeKind === 'direct' && !state.scenario.flags.sideStory_lethal_risk" @click="store.triggerSideStory('lethal_risk')">接受一次已警示的致命伏击风险</button>
          <button v-if="!state.scenario.flags.sideStory_ambiguous_omen" @click="store.triggerSideStory('ambiguous_omen')">记录一场暧昧梦兆</button>
          <button v-if="player.locationId === 'loc_nantes_castle' && !state.scenario.flags.sideStory_adult_encounter" @click="store.triggerSideStory('adult_encounter')">与伊莎博私下接近（仅成年）</button>
        </div>
        <button v-if="canFeast" class="primary-action" @click="store.advanceFeast()">推进宴会阶段（+1 日）</button>
      </div>

      <div v-else-if="rightTab === 'council'" class="panel-content">
        <div class="panel-heading"><span>摄政与议会</span><b>{{ state.regentId ? '已授权' : '待任命' }}</b></div>
        <p class="dossier-note">摄政拥有日常治理、守备命令与代收通信的法定接口；宣战、割让领地和继承变更仍由统治者掌握。</p>
        <button v-for="id in ['char_alan','char_mael']" :key="id" class="regent-card" :class="{ active: state.regentId === id }" @click="store.selectRegent(id)">
          <b>{{ t(state.characters[id].nameKey) }}</b><span>{{ state.characters[id].traits.join(' · ') }}</span>
        </button>
      </div>

      <div v-else-if="rightTab === 'ledger'" class="panel-content ledger-panel">
        <div class="panel-heading"><span>政治账本</span><b>revision {{ state.revision }}</b></div>
        <section><h3>有效支持</h3><p v-if="!Object.keys(state.supportCommitments).length">尚无。</p><div v-for="item in state.supportCommitments" :key="item.id" class="ledger-row"><b>{{ t(state.characters[item.supporterId].nameKey) }}</b><span>{{ item.status }} · 至 {{ item.expiresAt }}</span></div></section>
        <section><h3>承诺与期限</h3><p v-if="!Object.keys(state.promises).length">尚无。</p><div v-for="item in state.promises" :key="item.id" class="ledger-row"><b>{{ item.kind }}</b><span>{{ item.status }} · {{ item.dueDate }}</span></div></section>
        <section><h3>战争</h3><p v-if="!Object.keys(state.wars).length">当前无公开战争。</p><div v-for="war in state.wars" :key="war.id" class="ledger-row"><b>{{ war.kind }}</b><span>{{ war.phase }} · 战争分数 {{ war.attackerScore }}</span></div></section>
      </div>

      <div v-else-if="rightTab === 'log'" class="panel-content log-panel">
        <div class="panel-heading"><span>修订日志</span><b>{{ state.eventLog.length }}</b></div>
        <article v-for="entry in [...state.eventLog].reverse()" :key="entry.id"><time>{{ entry.occurredAt }} · r{{ entry.revision }}</time><b>{{ entry.type }}</b><p>{{ JSON.stringify(entry.payload) }}</p></article>
      </div>

      <div v-else-if="rightTab === 'mods'" class="panel-content">
        <div class="panel-heading"><span>内容包</span><b>JSON5</b></div>
        <p class="dossier-note">本体剧本也走内容加载器。普通内容包只能声明条件、效果和数据，不执行任意 JavaScript。</p>
        <label class="file-import">导入 .ckpack.json5<input type="file" accept=".json5,.ckpack.json5" @change="importPack" /></label>
        <pre class="mod-report">{{ modReport }}</pre>
        <ul class="pack-list"><li v-for="id in state.contentPackIds" :key="id">{{ id }}</li></ul>
      </div>

      <div v-else class="panel-content settings-panel">
        <div class="panel-heading"><span>战役设置</span><b>每存档独立</b></div>
        <label>常规世界脉冲 <input type="range" min="3" max="30" :value="state.settings.regularWorldPulseDays" @change="updatePulseDays" /><b>{{ state.settings.regularWorldPulseDays }} 日</b></label>
        <dl><div><dt>亲密尺度</dt><dd>{{ state.settings.content.intimacy }}</dd></div><div><dt>暴力尺度</dt><dd>{{ state.settings.content.violence }}</dd></div><div><dt>神秘尺度</dt><dd>{{ state.settings.content.supernatural }}</dd></div><div><dt>硬年龄门槛</dt><dd>18（不可降低）</dd></div></dl>
        <div class="checkpoint-box"><input v-model="checkpointName" maxlength="40" /><button @click="store.checkpoint(checkpointName)">写入酒馆检查点</button></div>
        <button class="danger-button" @click="confirm('确定重新开始序章？当前权威快照将被覆盖。') && store.resetGame()">重新开始序章</button>
      </div>

      <footer class="panel-footer">
        <button @click="store.advanceDays(1)">推进 1 日</button>
        <button @click="store.advanceDays(3)">推进 3 日</button>
        <span>下次脉冲 {{ state.nextRegularPulseAt }}</span>
      </footer>

      <div v-if="state.scenario.phase === 'ultimatum'" class="ultimatum-overlay">
        <span>ULTIMATUM</span><h2>公爵必须回答</h2><p>支持不足两份。接受降权仍可继续战役；拒绝则立即建立派系战争。</p>
        <button @click="store.answerUltimatum('concede')">签署降权宪章</button><button class="war" @click="store.answerUltimatum('resist')">拒绝，召集军队</button>
      </div>
    </aside>

    <section class="dialogue-dock" :class="{ collapsed: !dialogueExpanded }">
      <button class="dock-handle" @click="dialogueExpanded = !dialogueExpanded"><span>现场交谈</span><small>{{ t(currentLocation.nameKey) }} · {{ busy ? '场景导演思考中…' : '时间暂停' }}</small><i>{{ dialogueExpanded ? '⌄' : '⌃' }}</i></button>
      <div class="dialogue-body">
        <div class="scene-feed">
          <article v-for="entry in latestEntries" :key="entry.id" :class="entry.kind"><header><b>{{ entry.title }}</b><time>{{ entry.date }}</time></header><p>{{ entry.text }}</p></article>
        </div>
        <form class="dialogue-compose" @submit.prevent="submitDialogue">
          <label><input v-model="consequential" type="checkbox" /><span>重大交涉</span><small>静默结算行动，再叙述已提交事实</small></label>
          <textarea v-model="dialogueText" :disabled="busy" rows="3" placeholder="当面交谈、提出条件、称赞或威胁……普通闲聊不会修改硬状态。" @keydown.ctrl.enter.prevent="submitDialogue" />
          <button :disabled="busy || !dialogueText.trim()">{{ busy ? '推演中' : '发言' }}</button>
        </form>
      </div>
    </section>
  </main>
</template>
