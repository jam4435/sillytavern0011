<script setup lang="ts">
import { computed } from 'vue';
import { t } from '../content/basePack';
import type { GameState } from '../domain/schema';

const props = defineProps<{ state: GameState; selectedCountyId: string; layer: 'rule' | 'deJure' | 'occupation' | 'intel' | 'people' | 'route' }>();
const emit = defineEmits<{ select: [countyId: string] }>();

const playerLocationId = computed(() => props.state.characters[props.state.playerCharacterId].locationId);
const playerCountyId = computed(() => props.state.locations[playerLocationId.value]?.countyId);
const route = computed(() => {
  const activeId = props.state.scenario.activeTravelId;
  return activeId ? props.state.travels[activeId]?.routeCountyIds ?? [] : [];
});

function points(countyId: string): string {
  return props.state.counties[countyId].polygon.map(point => point.join(',')).join(' ');
}

function countyClass(countyId: string): string[] {
  const county = props.state.counties[countyId];
  const holder = props.state.titles[county.titleId]?.holderId;
  const classes = ['county', `holder-${holder ?? 'none'}`];
  if (props.selectedCountyId === countyId) classes.push('selected');
  if (playerCountyId.value === countyId) classes.push('player-county');
  if (county.occupation) classes.push('occupied');
  if (route.value.includes(countyId)) classes.push('on-route');
  return classes;
}

function layerLabel(): string {
  return { rule: '实际统治', deJure: '法理归属', occupation: '战时占领', intel: '情报可信度', people: '人物位置', route: '旅行路线' }[props.layer];
}
</script>

<template>
  <div class="map-frame">
    <div class="map-caption">
      <span>BREIZH · 1066</span>
      <strong>{{ layerLabel() }}</strong>
    </div>
    <svg class="county-map" viewBox="20 35 940 590" role="img" aria-label="布列塔尼、诺曼底与边区十六伯爵领战略图">
      <defs>
        <pattern id="occupation-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="#5e1820" stroke-width="4" />
        </pattern>
        <filter id="paper-noise"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="grey"/><feBlend in="SourceGraphic" in2="grey" mode="multiply"/></filter>
      </defs>
      <g class="sea-lines" aria-hidden="true">
        <path d="M36 184 C120 196 170 193 236 159"/><path d="M45 330 C118 314 176 337 223 448"/><path d="M572 72 C674 56 796 44 931 69"/>
      </g>
      <g :class="`layer-${layer}`">
        <g v-for="county in state.counties" :key="county.id" :class="countyClass(county.id)" @click="emit('select', county.id)">
          <polygon :points="points(county.id)" />
          <polygon v-if="county.occupation && layer === 'occupation'" class="occupation-overlay" :points="points(county.id)" />
          <text :x="county.centroid[0]" :y="county.centroid[1]" class="county-label">{{ t(county.nameKey) }}</text>
          <circle v-if="layer === 'people' && Object.values(state.characters).some(character => state.locations[character.locationId]?.countyId === county.id)" :cx="county.centroid[0]" :cy="county.centroid[1] - 20" r="5" class="people-dot" />
        </g>
      </g>
      <polyline v-if="layer === 'route' && route.length" class="travel-route" :points="route.map(id => state.counties[id].centroid.join(',')).join(' ')" />
      <g class="location-nodes">
        <circle v-for="location in state.locations" :key="location.id" :cx="location.position[0]" :cy="location.position[1]" :r="location.id === playerLocationId ? 5 : 2.4" :class="{ current: location.id === playerLocationId }" />
      </g>
      <g v-if="playerCountyId" class="player-marker" :transform="`translate(${state.counties[playerCountyId].centroid[0]}, ${state.counties[playerCountyId].centroid[1] - 34})`">
        <path d="M0 -10 L8 1 L3 13 L-3 13 L-8 1 Z"/><circle cy="2" r="2.3"/>
      </g>
    </svg>
    <div class="map-legend">
      <span><i class="swatch player"></i>公爵直领</span><span><i class="swatch hoel"></i>霍埃尔</span><span><i class="swatch geoffroy"></i>潘蒂耶夫尔</span><span><i class="swatch morvan"></i>莱昂</span><span><i class="swatch foreign"></i>域外</span>
    </div>
  </div>
</template>
