import type { PlayerAttrs, PlayerData, Position } from '../engine/types';

/** 自定义球员 key 前缀，用于识别与运行时注册 */
export const CUSTOM_KEY_PREFIX = 'MyPlayer_';

export interface Archetype {
  id: string;
  name: string;
  tagline: string;
  /** 模板允许创建的位置 */
  fits: Position[];
  attrs: PlayerAttrs;
}

const base = (over: Partial<PlayerAttrs>): PlayerAttrs => ({
  insideScoring: 55,
  outsideScoring: 60,
  threePoint: 60,
  midRange: 62,
  freeThrow: 70,
  layup: 65,
  dunk: 55,
  speed: 72,
  ballHandle: 65,
  passing: 62,
  perimeterD: 58,
  interiorD: 50,
  steal: 55,
  block: 40,
  offRebound: 42,
  defRebound: 52,
  stamina: 80,
  strength: 60,
  potential: 88,
  ...over,
});

/** 新秀原型模板（创建时会校准为 73 总评，潜力保持不变） */
export const ARCHETYPES: Archetype[] = [
  {
    id: 'sharpshooter',
    name: '神射手',
    tagline: '接球就投，三分线是你的领地',
    fits: ['PG', 'SG', 'SF'],
    attrs: base({ threePoint: 86, midRange: 80, freeThrow: 86, outsideScoring: 84, stamina: 82, perimeterD: 60 }),
  },
  {
    id: 'playmaker',
    name: '组织大师',
    tagline: '一双眼睛看穿全场，助攻如呼吸',
    fits: ['PG', 'SG'],
    attrs: base({ passing: 87, ballHandle: 85, speed: 80, steal: 66, threePoint: 68, midRange: 70 }),
  },
  {
    id: 'slasher',
    name: '闪电突破手',
    tagline: '第一步快过闪电，篮下终结毫不留情',
    fits: ['PG', 'SG', 'SF'],
    attrs: base({ speed: 88, layup: 85, ballHandle: 80, dunk: 78, insideScoring: 70, stamina: 84 }),
  },
  {
    id: 'three_and_d',
    name: '3D铁闸',
    tagline: '锁死对方箭头，底角三分一击致命',
    fits: ['SG', 'SF', 'PF'],
    attrs: base({ perimeterD: 84, steal: 74, threePoint: 78, stamina: 84, strength: 68, speed: 78 }),
  },
  {
    id: 'paint_beast',
    name: '禁区猛兽',
    tagline: '篮板是你的私有财产，油漆区寸步不让',
    fits: ['PF', 'C'],
    attrs: base({
      insideScoring: 82,
      dunk: 84,
      strength: 86,
      offRebound: 80,
      defRebound: 82,
      block: 76,
      interiorD: 80,
      speed: 62,
      threePoint: 35,
      outsideScoring: 40,
      layup: 74,
    }),
  },
  {
    id: 'all_round',
    name: '全能新星',
    tagline: '没有短板，比赛需要什么你就是什么',
    fits: ['SG', 'SF', 'PF'],
    attrs: base({
      insideScoring: 68,
      threePoint: 71,
      midRange: 72,
      layup: 72,
      speed: 76,
      ballHandle: 72,
      passing: 72,
      perimeterD: 68,
      defRebound: 62,
      dunk: 68,
    }),
  },
];

/** 位置默认身高（cm）与合理范围 */
export const HEIGHT_BY_POS: Record<Position, { def: number; min: number; max: number }> = {
  PG: { def: 188, min: 175, max: 198 },
  SG: { def: 196, min: 185, max: 203 },
  SF: { def: 203, min: 196, max: 211 },
  PF: { def: 208, min: 201, max: 215 },
  C: { def: 213, min: 206, max: 224 },
};

export interface CustomPlayerForm {
  name: string;
  pos: Position;
  archetypeId: string;
  height_cm: number;
  number: number;
  teamId: string;
}

/** 按位置取相关属性计算总评，内线不因三分项被拉低 */
const OVERALL_KEYS: Record<Position, (keyof PlayerAttrs)[]> = {
  PG: ['outsideScoring', 'threePoint', 'midRange', 'layup', 'speed', 'ballHandle', 'passing', 'perimeterD', 'steal', 'stamina'],
  SG: ['outsideScoring', 'threePoint', 'midRange', 'layup', 'speed', 'ballHandle', 'passing', 'perimeterD', 'steal', 'stamina'],
  SF: ['outsideScoring', 'threePoint', 'midRange', 'layup', 'speed', 'ballHandle', 'perimeterD', 'defRebound', 'strength', 'stamina'],
  PF: ['insideScoring', 'layup', 'dunk', 'strength', 'offRebound', 'defRebound', 'interiorD', 'block', 'speed', 'stamina'],
  C: ['insideScoring', 'layup', 'dunk', 'strength', 'offRebound', 'defRebound', 'interiorD', 'block', 'speed', 'stamina'],
};

export function overallOf(attrs: PlayerAttrs, pos: Position): number {
  const keys = OVERALL_KEYS[pos];
  return Math.round(keys.reduce((s, k) => s + attrs[k], 0) / keys.length);
}

const ATTRIBUTE_KEYS = Object.keys(base({})).filter((key): key is Exclude<keyof PlayerAttrs, 'potential'> => key !== 'potential');
const TARGET_ROOKIE_OVERALL = 73;

const clampAttribute = (value: number): number => Math.max(0, Math.min(99, Math.round(value)));

/**
 * 对所有非潜力属性先做统一平移，再在本位置计分项上均匀补齐舍入差。
 * 这样既保留模板强弱项，也保证所有合法模板/位置组合稳定为 73 总评。
 */
export function calibrateRookieAttrs(source: PlayerAttrs, pos: Position): PlayerAttrs {
  const attrs = { ...source };
  const overallKeys = OVERALL_KEYS[pos];
  const targetSum = TARGET_ROOKIE_OVERALL * overallKeys.length;
  const sourceSum = overallKeys.reduce((sum, key) => sum + source[key], 0);
  const uniformShift = Math.trunc((targetSum - sourceSum) / overallKeys.length);

  for (const key of ATTRIBUTE_KEYS) attrs[key] = clampAttribute(source[key] + uniformShift);

  let remaining = targetSum - overallKeys.reduce((sum, key) => sum + attrs[key], 0);
  let cursor = 0;
  while (remaining !== 0) {
    const key = overallKeys[cursor % overallKeys.length];
    const step = remaining > 0 ? 1 : -1;
    const next = attrs[key] + step;
    if (next >= 0 && next <= 99) {
      attrs[key] = next;
      remaining -= step;
    }
    cursor += 1;
    if (cursor > overallKeys.length * 100) throw new Error(`无法将 ${pos} 新秀校准为 ${TARGET_ROOKIE_OVERALL} 总评`);
  }

  attrs.potential = clampAttribute(source.potential);
  return attrs;
}

export function compatibleArchetypes(pos: Position): Archetype[] {
  return ARCHETYPES.filter(archetype => archetype.fits.includes(pos));
}

export function buildCustomPlayer(form: CustomPlayerForm): PlayerData {
  const arch = ARCHETYPES.find(a => a.id === form.archetypeId);
  if (!arch) throw new Error(`未知球员模板：${form.archetypeId}`);
  if (!arch.fits.includes(form.pos)) throw new Error(`${arch.name}不支持 ${form.pos} 位置`);

  const attrs = calibrateRookieAttrs(arch.attrs, form.pos);
  const heightRange = HEIGHT_BY_POS[form.pos];
  return {
    name: `${CUSTOM_KEY_PREFIX}${form.name.trim()}`,
    cn: form.name.trim(),
    team: form.teamId,
    pos: form.pos,
    secondaryPos: null,
    height_cm: Math.max(heightRange.min, Math.min(heightRange.max, Math.round(form.height_cm))),
    number: Math.max(0, Math.min(99, Math.round(form.number))),
    overall: overallOf(attrs, form.pos),
    attrs,
  };
}

/** 五维雷达聚合（0-99），用于创建界面预览 */
export function radarOf(attrs: PlayerAttrs): { label: string; value: number }[] {
  const avg = (...ks: (keyof PlayerAttrs)[]) => Math.round(ks.reduce((s, k) => s + attrs[k], 0) / ks.length);
  return [
    { label: '得分', value: avg('insideScoring', 'midRange', 'layup') },
    { label: '三分', value: avg('threePoint', 'outsideScoring') },
    { label: '组织', value: avg('passing', 'ballHandle') },
    { label: '防守', value: avg('perimeterD', 'interiorD', 'steal', 'block') },
    { label: '身体', value: avg('speed', 'strength', 'stamina') },
  ];
}
