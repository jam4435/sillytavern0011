<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../content/basePack';
import { countyRealmId } from '../domain/selectors';
import type { GameState } from '../domain/schema';

type Layer='rule'|'deJure'|'occupation'|'intel'|'people'|'armies'|'activities'|'route';
const props=defineProps<{state:GameState;selectedCountyId:string|null;selectedCharacterId:string|null;layer:Layer}>();
const emit=defineEmits<{selectCounty:[id:string];selectCharacter:[id:string];selectActivity:[id:string]}>();
const svg=ref<SVGSVGElement|null>(null);const view=ref({x:0,y:10,w:1000,h:640});
let drag:{x:number;y:number;viewX:number;viewY:number;pointerId:number}|null=null;

const player= computed(()=>props.state.characters[props.state.playerCharacterId]);
const playerCountyId=computed(()=>props.state.locations[player.value.locationId]?.countyId??null);
const activeRoute=computed(()=>{const id=props.state.activeTravelId;return id?props.state.travels[id]?.routeCountyIds??[]:[];});
const visibleCharacters=computed(()=>Object.values(props.state.characters).filter(character=>character.alive&&character.titleIds.length>0));
const activeActivities=computed(()=>Object.values(props.state.activities).filter(activity=>activity.status==='active'||activity.status==='planned'));
const activeWars=computed(()=>Object.values(props.state.wars).filter(war=>!war.endedAt));
const viewBox=computed(()=>`${view.value.x} ${view.value.y} ${view.value.w} ${view.value.h}`);
const layerName=computed(()=>({rule:'实际统治',deJure:'法理领地',occupation:'战时占领',intel:'情报可信度',people:'人物位置',armies:'军队与战争',activities:'活动',route:'旅行路线'}[props.layer]));

const palette:Record<string,string>={d_brittany:'#6f4a39',d_normandy:'#47556b',d_anjou:'#6c633f',k_france:'#536455',k_england:'#70554c',none:'#716b5d'};
function points(id:string){return props.state.counties[id].polygon.map(point=>point.join(',')).join(' ');}
function deJureTop(countyId:string){let id=props.state.titles[props.state.counties[countyId].titleId]?.deJureLiegeId;let guard=0;while(id&&props.state.titles[id]?.deJureLiegeId&&guard++<8)id=props.state.titles[id].deJureLiegeId;return id??'none';}
function countyColor(id:string){if(props.layer==='deJure')return palette[deJureTop(id)]??'#716b5d';if(props.layer==='intel'){const control=props.state.counties[id].control;return `hsl(42 18% ${34+control/4}%)`;}return palette[countyRealmId(props.state,id)]??'#716b5d';}
function countyClass(id:string){const county=props.state.counties[id];return{selected:props.selectedCountyId===id,player:playerCountyId.value===id,occupied:Boolean(county.occupation),route:activeRoute.value.includes(id)};}
function countyOfCharacter(id:string){const location=props.state.locations[props.state.characters[id]?.locationId];return location?props.state.counties[location.countyId]:null;}
function activityCounty(id:string){const location=props.state.locations[props.state.activities[id]?.locationId];return location?props.state.counties[location.countyId]:null;}
function onWheel(event:WheelEvent){event.preventDefault();const rect=svg.value?.getBoundingClientRect();if(!rect)return;const factor=event.deltaY>0?1.14:0.86;const nextW=Math.max(460,Math.min(1250,view.value.w*factor));const nextH=nextW*0.64;const px=(event.clientX-rect.left)/rect.width;const py=(event.clientY-rect.top)/rect.height;view.value={x:view.value.x+(view.value.w-nextW)*px,y:view.value.y+(view.value.h-nextH)*py,w:nextW,h:nextH};}
function onPointerDown(event:PointerEvent){if(event.button!==0)return;(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,viewX:view.value.x,viewY:view.value.y,pointerId:event.pointerId};}
function onPointerMove(event:PointerEvent){if(!drag||drag.pointerId!==event.pointerId)return;const rect=svg.value?.getBoundingClientRect();if(!rect)return;view.value={...view.value,x:drag.viewX-(event.clientX-drag.x)*view.value.w/rect.width,y:drag.viewY-(event.clientY-drag.y)*view.value.h/rect.height};}
function onPointerUp(event:PointerEvent){if(drag?.pointerId===event.pointerId)drag=null;}
function resetView(){view.value={x:0,y:10,w:1000,h:640};}
</script>

<template>
  <section class="map-canvas">
    <div class="map-caption"><div><span>BREIZH · MARCHIA NORMANNICA</span><small>1066 · 16 伯爵领精细模拟</small></div><strong>{{ layerName }}</strong><button title="重置地图视野" @click="resetView">⌂</button></div>
    <svg ref="svg" class="county-map" :viewBox="viewBox" role="img" aria-label="布列塔尼—诺曼边区战略地图" @wheel="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <defs>
        <pattern id="occupation-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="10" stroke="#70242b" stroke-width="4"/></pattern>
        <pattern id="sea-wave" width="52" height="26" patternUnits="userSpaceOnUse"><path d="M0 13 Q13 4 26 13 T52 13" fill="none" stroke="rgba(77,68,51,.13)" stroke-width="1"/></pattern>
        <filter id="marker-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".55"/></filter>
      </defs>
      <rect x="-200" y="-160" width="1450" height="1050" class="sea-paper"/><rect x="-200" y="-160" width="1450" height="1050" fill="url(#sea-wave)"/>
      <g class="coast-ink" aria-hidden="true"><path d="M55 180 C46 252 72 340 155 424 C220 487 230 572 323 612 L450 548 L518 568 L620 496 L720 514 L804 446 L914 421 L948 330 L902 252 L935 178 L870 82 L668 58 L520 91 L385 116 L270 104 L172 126 Z"/></g>
      <g class="counties">
        <g v-for="county in state.counties" :key="county.id" class="county" :class="countyClass(county.id)" @pointerdown.stop @click="emit('selectCounty',county.id)">
          <polygon :points="points(county.id)" :style="{'--county-fill':countyColor(county.id)}"/>
          <polygon v-if="county.occupation" class="occupation-overlay" :points="points(county.id)"/>
          <text :x="county.centroid[0]" :y="county.centroid[1]+4" class="county-label">{{ t(county.nameKey) }}</text>
          <text v-if="layer==='intel'" :x="county.centroid[0]" :y="county.centroid[1]+20" class="map-sub-label">控制 {{ county.control }}</text>
        </g>
      </g>
      <polyline v-if="(layer==='route'||activeRoute.length)&&activeRoute.length" class="travel-route" :points="activeRoute.map(id=>state.counties[id].centroid.join(',')).join(' ')"/>
      <g v-if="layer==='activities'" class="activity-markers">
        <g v-for="activity in activeActivities" :key="activity.id" v-show="activityCounty(activity.id)" :transform="`translate(${activityCounty(activity.id)?.centroid[0]},${(activityCounty(activity.id)?.centroid[1]??0)-30})`" @pointerdown.stop @click="emit('selectActivity',activity.id)"><circle r="15"/><path d="M-7 2 Q0-9 7 2 M-9 5 H9 M0-12 V-18"/><text y="29">{{ activity.type==='feast'?'宴会':'活动' }}</text></g>
      </g>
      <g v-if="layer==='armies'" class="army-markers">
        <g v-for="war in activeWars" :key="war.id" v-show="war.objectiveCountyId" :transform="`translate(${state.counties[war.objectiveCountyId!]?.centroid[0]},${(state.counties[war.objectiveCountyId!]?.centroid[1]??0)-24})`"><path d="M-12 13 L0-14 L12 13 Z"/><text y="29">{{ war.attackerScore }}</text></g>
      </g>
      <g v-if="layer==='people'" class="character-markers">
        <g v-for="character in visibleCharacters" :key="character.id" v-show="countyOfCharacter(character.id)" :class="{selected:selectedCharacterId===character.id,player:character.id===state.playerCharacterId}" :transform="`translate(${(countyOfCharacter(character.id)?.centroid[0]??0)+((character.id.charCodeAt(character.id.length-1)%3)-1)*18},${(countyOfCharacter(character.id)?.centroid[1]??0)-28})`" @pointerdown.stop @click="emit('selectCharacter',character.id)"><circle r="10"/><text y="3">{{ t(character.nameKey).slice(0,1) }}</text></g>
      </g>
      <g v-if="playerCountyId" class="player-marker" :transform="`translate(${state.counties[playerCountyId].centroid[0]},${state.counties[playerCountyId].centroid[1]-35})`"><path d="M0-15 L10-2 L5 14 H-5 L-10-2 Z"/><circle cy="2" r="2.5"/></g>
    </svg>
    <div class="map-legend"><span><i style="--swatch:#6f4a39"></i>布列塔尼</span><span><i style="--swatch:#47556b"></i>诺曼底</span><span><i style="--swatch:#6c633f"></i>安茹边区</span><em>滚轮缩放 · 拖动地图 · 点击对象</em></div>
  </section>
</template>
