import type {
  BadgeLevel,
  BodyProfile,
  CreationMode,
  CreationStyle,
  DynamicBadges,
  DynamicHotZones,
  DynamicTendencies,
  PlayerDevelopment,
  PlayerRatingsV3,
  Position,
  UpgradeGroupKey,
  UpgradeGroupState,
} from './types';

export const RATING_KEYS = [
  'standingLayup', 'drivingLayup', 'postFade', 'postHook', 'postControl', 'drawFoul', 'movingClose',
  'standingClose', 'movingMid', 'standingMid', 'movingThree', 'standingThree', 'freeThrow', 'ballControl',
  'passVision', 'passIQ', 'passAccuracy', 'offRebound', 'standingDunk', 'drivingDunk', 'contactDunk', 'shotIQ',
  'hands', 'defRebound', 'block', 'shotContest', 'steal', 'onBallDefenseIQ', 'lowPostDefenseIQ', 'reactionTime',
  'boxout', 'lateralQuickness', 'speed', 'acceleration', 'vertical', 'strength', 'stamina', 'hustle', 'durability',
  'offensiveConsistency', 'defensiveConsistency', 'composure', 'potential',
] as const satisfies readonly (keyof PlayerRatingsV3)[];

export const GROUP_KEYS = [
  'offDribble', 'finishing', 'midRange', 'threePoint', 'postScoring',
  'agility', 'strength', 'rebounding', 'playmaking', 'defending',
] as const satisfies readonly UpgradeGroupKey[];

export const GROUP_LABELS: Record<UpgradeGroupKey, string> = {
  offDribble: '运球投篮', finishing: '上篮扣篮', midRange: '中距离', threePoint: '三分', postScoring: '背身进攻',
  agility: '敏捷', strength: '力量', rebounding: '篮板', playmaking: '组织', defending: '防守',
};

export interface BodyBounds {
  height: { min: number; max: number; def: number };
  weight: { min: number; max: number; def: number };
  wingspanOffset: { min: number; max: number; def: number };
}

export const BODY_BOUNDS_2K16: Record<Position, BodyBounds> = {
  PG: { height: { min: 175, max: 198, def: 188 }, weight: { min: 70, max: 100, def: 86 }, wingspanOffset: { min: -5, max: 15, def: 8 } },
  SG: { height: { min: 185, max: 203, def: 196 }, weight: { min: 75, max: 105, def: 93 }, wingspanOffset: { min: -5, max: 18, def: 10 } },
  SF: { height: { min: 196, max: 211, def: 203 }, weight: { min: 82, max: 115, def: 102 }, wingspanOffset: { min: -5, max: 20, def: 12 } },
  PF: { height: { min: 201, max: 215, def: 208 }, weight: { min: 90, max: 125, def: 111 }, wingspanOffset: { min: 0, max: 23, def: 15 } },
  C: { height: { min: 206, max: 224, def: 213 }, weight: { min: 100, max: 145, def: 120 }, wingspanOffset: { min: 0, max: 28, def: 18 } },
};

export const FREE_BODY_BOUNDS: BodyBounds = {
  height: { min: 170, max: 231, def: 198 },
  weight: { min: 65, max: 150, def: 95 },
  wingspanOffset: { min: -10, max: 30, def: 10 },
};

export function bodyBounds(mode: CreationMode, pos: Position, height?: number): BodyBounds {
  if (mode === '2K16模式') return BODY_BOUNDS_2K16[pos];
  const maxOffset = Math.min(30, 250 - (height ?? FREE_BODY_BOUNDS.height.def));
  return { ...FREE_BODY_BOUNDS, wingspanOffset: { ...FREE_BODY_BOUNDS.wingspanOffset, max: maxOffset } };
}

export function defaultBody(mode: CreationMode, pos: Position): BodyProfile {
  const bounds = bodyBounds(mode, pos);
  return { heightCm: bounds.height.def, weightKg: bounds.weight.def, wingspanCm: bounds.height.def + bounds.wingspanOffset.def };
}

const curve = (level: number, shape: 'early' | 'balanced' | 'late'): number => {
  const t = Math.max(0, Math.min(20, level)) / 20;
  const shaped = shape === 'early' ? Math.sqrt(t) : shape === 'late' ? t * t : t;
  return Math.round(shaped * 1000) / 10;
};

type RatingKey = keyof PlayerRatingsV3;
type Influence = [UpgradeGroupKey, number, 'early' | 'balanced' | 'late'];

const INFLUENCES: Record<RatingKey, Influence[]> = {
  standingLayup: [['finishing', 1, 'early']], drivingLayup: [['finishing', .8, 'balanced'], ['agility', .2, 'early']],
  postFade: [['postScoring', .75, 'late'], ['midRange', .25, 'balanced']], postHook: [['postScoring', 1, 'balanced']],
  postControl: [['postScoring', .7, 'balanced'], ['strength', .3, 'early']], drawFoul: [['finishing', .65, 'late'], ['postScoring', .35, 'late']],
  movingClose: [['finishing', .55, 'balanced'], ['offDribble', .45, 'balanced']], standingClose: [['finishing', 1, 'early']],
  movingMid: [['midRange', .65, 'late'], ['offDribble', .35, 'balanced']], standingMid: [['midRange', 1, 'balanced']],
  movingThree: [['threePoint', .65, 'late'], ['offDribble', .35, 'late']], standingThree: [['threePoint', 1, 'balanced']],
  freeThrow: [['midRange', .6, 'early'], ['threePoint', .4, 'early']], ballControl: [['playmaking', .65, 'balanced'], ['agility', .35, 'balanced']],
  passVision: [['playmaking', 1, 'late']], passIQ: [['playmaking', 1, 'balanced']], passAccuracy: [['playmaking', 1, 'early']],
  offRebound: [['rebounding', .75, 'balanced'], ['strength', .25, 'early']], standingDunk: [['finishing', .6, 'balanced'], ['strength', .4, 'balanced']],
  drivingDunk: [['finishing', .65, 'late'], ['agility', .35, 'balanced']], contactDunk: [['finishing', .55, 'late'], ['strength', .45, 'late']],
  shotIQ: [['midRange', .3, 'balanced'], ['threePoint', .3, 'balanced'], ['playmaking', .4, 'late']], hands: [['playmaking', .55, 'early'], ['finishing', .45, 'early']],
  defRebound: [['rebounding', .8, 'balanced'], ['strength', .2, 'early']], block: [['defending', .65, 'late'], ['rebounding', .2, 'balanced'], ['agility', .15, 'late']],
  shotContest: [['defending', .8, 'balanced'], ['agility', .2, 'balanced']], steal: [['defending', .65, 'late'], ['agility', .35, 'late']],
  onBallDefenseIQ: [['defending', .8, 'balanced'], ['agility', .2, 'balanced']], lowPostDefenseIQ: [['defending', .7, 'balanced'], ['strength', .3, 'balanced']],
  reactionTime: [['defending', .45, 'late'], ['agility', .55, 'balanced']], boxout: [['rebounding', .65, 'balanced'], ['strength', .35, 'early']],
  lateralQuickness: [['agility', .7, 'balanced'], ['defending', .3, 'balanced']], speed: [['agility', 1, 'early']], acceleration: [['agility', 1, 'late']],
  vertical: [['agility', .55, 'late'], ['finishing', .2, 'late'], ['rebounding', .25, 'late']], strength: [['strength', 1, 'balanced']],
  stamina: [['agility', .5, 'early'], ['strength', .5, 'early']], hustle: [['agility', .45, 'balanced'], ['rebounding', .25, 'balanced'], ['defending', .3, 'balanced']],
  durability: [['strength', .65, 'late'], ['agility', .35, 'late']], offensiveConsistency: [['offDribble', .2, 'late'], ['finishing', .2, 'late'], ['midRange', .2, 'late'], ['threePoint', .2, 'late'], ['playmaking', .2, 'late']],
  defensiveConsistency: [['defending', .7, 'late'], ['rebounding', .3, 'late']], composure: [['playmaking', .45, 'late'], ['defending', .25, 'late'], ['offDribble', .3, 'late']],
  potential: [],
};

const STYLE_GROUPS: Record<CreationStyle, UpgradeGroupState> = {
  均衡: { offDribble: 10, finishing: 10, midRange: 10, threePoint: 10, postScoring: 10, agility: 10, strength: 10, rebounding: 10, playmaking: 10, defending: 10 },
  外线: { offDribble: 13, finishing: 8, midRange: 12, threePoint: 14, postScoring: 5, agility: 12, strength: 7, rebounding: 5, playmaking: 13, defending: 11 },
  内线: { offDribble: 6, finishing: 14, midRange: 9, threePoint: 4, postScoring: 14, agility: 8, strength: 14, rebounding: 14, playmaking: 6, defending: 11 },
};

export const FREE_PRESETS: Record<string, UpgradeGroupState> = {
  sharpshooter: { offDribble: 12, finishing: 7, midRange: 13, threePoint: 14, postScoring: 6, agility: 11, strength: 7, rebounding: 6, playmaking: 11, defending: 13 },
  playmaker: { offDribble: 12, finishing: 9, midRange: 11, threePoint: 9, postScoring: 5, agility: 13, strength: 8, rebounding: 5, playmaking: 14, defending: 14 },
  slasher: { offDribble: 10, finishing: 14, midRange: 8, threePoint: 6, postScoring: 7, agility: 14, strength: 10, rebounding: 7, playmaking: 11, defending: 13 },
  three_and_d: { offDribble: 9, finishing: 9, midRange: 10, threePoint: 13, postScoring: 6, agility: 12, strength: 10, rebounding: 8, playmaking: 9, defending: 14 },
  paint_beast: { offDribble: 4, finishing: 14, midRange: 8, threePoint: 4, postScoring: 13, agility: 8, strength: 14, rebounding: 14, playmaking: 7, defending: 14 },
  all_round: { ...STYLE_GROUPS.均衡 },
};

export function initialGroups(mode: CreationMode, style: CreationStyle, preset = 'all_round'): UpgradeGroupState {
  return { ...(mode === '2K16模式' ? STYLE_GROUPS[style] : (FREE_PRESETS[preset] ?? FREE_PRESETS.all_round)) };
}

export function ratingsFromGroups(groups: UpgradeGroupState, potential = 88): PlayerRatingsV3 {
  const result = {} as PlayerRatingsV3;
  for (const key of RATING_KEYS) {
    if (key === 'potential') { result[key] = potential; continue; }
    const influences = INFLUENCES[key];
    const value = influences.reduce((sum, [group, weight, shape]) => sum + curve(groups[group], shape) * weight, 0);
    result[key] = Math.max(25, Math.min(99, Math.round(38 + value * .58)));
  }
  return result;
}

const POSITION_WEIGHTS: Record<Position, Partial<Record<RatingKey, number>>> = {
  PG: { ballControl: 1.5, passVision: 1.3, passAccuracy: 1.2, movingThree: 1, standingThree: 1, speed: 1, lateralQuickness: .9, onBallDefenseIQ: .8 },
  SG: { movingThree: 1.3, standingThree: 1.2, movingMid: 1, drivingLayup: 1, ballControl: .9, shotContest: .8, lateralQuickness: .8 },
  SF: { drivingLayup: 1, standingThree: 1, strength: .8, lateralQuickness: .8, shotContest: 1, defRebound: .8, ballControl: .7 },
  PF: { standingLayup: 1, standingDunk: 1, postControl: 1, strength: 1.2, defRebound: 1.2, offRebound: 1, lowPostDefenseIQ: 1, block: .8 },
  C: { standingLayup: 1, standingDunk: 1.2, postHook: 1, strength: 1.2, defRebound: 1.3, offRebound: 1, lowPostDefenseIQ: 1, block: 1.2, shotContest: 1 },
};

export function overallOf(ratings: PlayerRatingsV3, pos: Position): number {
  const weights = POSITION_WEIGHTS[pos];
  const entries = Object.entries(weights) as [RatingKey, number][];
  const weighted = entries.reduce((sum, [key, weight]) => sum + ratings[key] * weight, 0);
  return Math.round(weighted / entries.reduce((sum, [, weight]) => sum + weight, 0));
}

export function calibrateRookieRatings(source: PlayerRatingsV3, pos: Position): PlayerRatingsV3 {
  const target = Math.max(70, Math.min(76, overallOf(source, pos)));
  const desired = target < 70 ? 70 : target > 76 ? 76 : target;
  const shift = desired - overallOf(source, pos);
  const adjusted = { ...source };
  for (const key of RATING_KEYS) if (key !== 'potential') adjusted[key] = Math.max(25, Math.min(99, adjusted[key] + shift));
  adjusted.potential = 88;
  return adjusted;
}

export function groupBudget(groups: UpgradeGroupState): number { return GROUP_KEYS.reduce((sum, key) => sum + groups[key], 0); }
export function upgradeCost(level: number): number { return 1 + Math.floor(level / 4); }
export function potentialLevelCap(potential: number): number { return Math.max(14, Math.min(20, 14 + Math.floor((potential - 75) / 3))); }

export function createDevelopment(mode: CreationMode, style: CreationStyle, groups: UpgradeGroupState): PlayerDevelopment {
  return { mode, style, groups: { ...groups }, growthPoints: 0, lastTrainingDate: null };
}

export const BADGE_REGISTRY = [
  '接球投篮', '底角专家', '高难度投篮', '远距离', '抗干扰', '关键射手', '强力终结', '杂技', '隔扣', '抛投', '造犯规',
  '脚踝终结者', '十美分', '挡拆大师', '快攻发起者', '外线封锁', '拦截者', '护框', '追身封盖', '绕掩护',
  '篮板精英', '卡位', '铜墙铁壁', '永动机',
] as const;

export const HOT_ZONE_IDS = ['篮下', '油漆左', '油漆中', '油漆右', '中投左底', '中投左肘', '中投正面', '中投右肘', '中投右底', '三分左底角', '三分左翼', '三分弧顶', '三分右翼', '三分右底角'] as const;

export function defaultTendencies(): DynamicTendencies { return { families: {} }; }
export function defaultBadges(): DynamicBadges {
  return { badges: Object.fromEntries(BADGE_REGISTRY.map(name => [name, { level: '未解锁' as BadgeLevel, progress: 0 }])) };
}
export function defaultHotZones(): DynamicHotZones {
  return { zones: Object.fromEntries(HOT_ZONE_IDS.map(zone => [zone, { makes: 0, attempts: 0, state: '中性' as const }])) };
}

export function badgeLevel(progress: number, relevantRating: number): BadgeLevel {
  if (progress >= 140 && relevantRating >= 90) return '金';
  if (progress >= 60 && relevantRating >= 80) return '银';
  if (progress >= 20 && relevantRating >= 70) return '铜';
  return '未解锁';
}

export function hotZoneState(zone: string, makes: number, attempts: number): '热' | '中性' | '冷' {
  if (attempts < 8) return '中性';
  const baseline = zone === '篮下' ? .62 : zone.startsWith('油漆') ? .45 : zone.startsWith('中投') ? .4 : .35;
  const posterior = (makes + baseline * 10) / (attempts + 10);
  return posterior >= baseline + .05 ? '热' : posterior <= baseline - .05 ? '冷' : '中性';
}

export function bodyCaps(ratings: PlayerRatingsV3, body: BodyProfile, pos: Position): PlayerRatingsV3 {
  const reference = BODY_BOUNDS_2K16[pos];
  const heightDelta = body.heightCm - reference.height.def;
  const weightDelta = body.weightKg - reference.weight.def;
  const reachDelta = body.wingspanCm - body.heightCm - reference.wingspanOffset.def;
  const next = { ...ratings };
  const adjust = (keys: RatingKey[], amount: number) => keys.forEach(key => { next[key] = Math.max(25, Math.min(99, Math.round(next[key] + amount))); });
  adjust(['block', 'shotContest', 'offRebound', 'defRebound', 'standingDunk'], heightDelta * .18 + reachDelta * .22);
  adjust(['strength', 'boxout', 'contactDunk'], weightDelta * .14);
  adjust(['speed', 'acceleration', 'lateralQuickness', 'ballControl'], -Math.max(0, heightDelta) * .16 - Math.max(0, weightDelta) * .08);
  return next;
}
