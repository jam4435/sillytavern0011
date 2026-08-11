import type { CreationMode, CreationStyle, PlayerData, Position, UpgradeGroupState } from '../engine/types';
import {
  BODY_BOUNDS_2K16,
  GROUP_KEYS,
  bodyBounds,
  bodyCaps,
  calibrateRookieRatings,
  defaultBody,
  groupBudget,
  initialGroups,
  overallOf,
  ratingsFromGroups,
} from '../engine/development';

export const CUSTOM_KEY_PREFIX = 'MyPlayer_';
export const HEIGHT_BY_POS = Object.fromEntries(
  Object.entries(BODY_BOUNDS_2K16).map(([pos, value]) => [pos, value.height]),
) as Record<Position, { def: number; min: number; max: number }>;

export interface Archetype {
  id: string;
  name: string;
  tagline: string;
  fits: Position[];
}

export const ARCHETYPES: Archetype[] = [
  { id: 'sharpshooter', name: '神射手', tagline: '无球牵制与远距离火力', fits: ['PG', 'SG', 'SF'] },
  { id: 'playmaker', name: '组织大师', tagline: '控运、视野与挡拆阅读', fits: ['PG', 'SG'] },
  { id: 'slasher', name: '闪电突破手', tagline: '第一步与篮下终结', fits: ['PG', 'SG', 'SF'] },
  { id: 'three_and_d', name: '3D铁闸', tagline: '侧翼防守与定点三分', fits: ['SG', 'SF', 'PF'] },
  { id: 'paint_beast', name: '禁区猛兽', tagline: '力量、篮板与护框', fits: ['PF', 'C'] },
  { id: 'all_round', name: '全能新星', tagline: '均衡配置，自由塑形', fits: ['SG', 'SF', 'PF'] },
];

export interface CustomPlayerForm {
  name: string;
  pos: Position;
  mode: CreationMode;
  style: CreationStyle;
  archetypeId: string;
  height_cm: number;
  weight_kg: number;
  wingspan_cm: number;
  groups: UpgradeGroupState;
  number: number;
  teamId: string;
}

export function compatibleArchetypes(pos: Position): Archetype[] {
  return ARCHETYPES.filter(archetype => archetype.fits.includes(pos));
}

export function defaultCustomForm(pos: Position = 'SG', mode: CreationMode = '2K16模式'): Pick<CustomPlayerForm, 'pos' | 'mode' | 'style' | 'archetypeId' | 'height_cm' | 'weight_kg' | 'wingspan_cm' | 'groups'> {
  const style: CreationStyle = '均衡';
  const body = defaultBody(mode, pos);
  return {
    pos, mode, style, archetypeId: 'all_round', height_cm: body.heightCm, weight_kg: body.weightKg,
    wingspan_cm: body.wingspanCm, groups: initialGroups(mode, style),
  };
}

export function validateCreation(form: CustomPlayerForm): string[] {
  const errors: string[] = [];
  const bounds = bodyBounds(form.mode, form.pos, form.height_cm);
  const offset = form.wingspan_cm - form.height_cm;
  if (!form.name.trim()) errors.push('姓名不能为空');
  if (!form.teamId) errors.push('必须选择球队');
  if (form.height_cm < bounds.height.min || form.height_cm > bounds.height.max) errors.push('身高超出当前模式/位置范围');
  if (form.weight_kg < bounds.weight.min || form.weight_kg > bounds.weight.max) errors.push('体重超出当前模式/位置范围');
  if (offset < bounds.wingspanOffset.min || offset > bounds.wingspanOffset.max || form.wingspan_cm > 250) errors.push('臂展超出当前模式范围');
  if (groupBudget(form.groups) !== 100) errors.push('创建能力组预算必须恰好为100点');
  if (GROUP_KEYS.some(key => form.groups[key] < 4 || form.groups[key] > 14)) errors.push('创建能力组必须处于4–14级');
  if (form.mode === '自由模拟模式' && !compatibleArchetypes(form.pos).some(item => item.id === form.archetypeId)) errors.push('模板不适配所选位置');
  return errors;
}

export function previewRatings(form: Pick<CustomPlayerForm, 'pos' | 'groups' | 'height_cm' | 'weight_kg' | 'wingspan_cm'>) {
  const base = calibrateRookieRatings(ratingsFromGroups(form.groups, 88), form.pos);
  return calibrateRookieRatings(bodyCaps(base, { heightCm: form.height_cm, weightKg: form.weight_kg, wingspanCm: form.wingspan_cm }, form.pos), form.pos);
}

export function buildCustomPlayer(form: CustomPlayerForm): PlayerData {
  const errors = validateCreation(form);
  if (errors.length) throw new Error(errors.join('；'));
  const attrs = previewRatings(form);
  return {
    name: `${CUSTOM_KEY_PREFIX}${form.name.trim()}`,
    cn: form.name.trim(), team: form.teamId, pos: form.pos, secondaryPos: null,
    body: { heightCm: Math.round(form.height_cm), weightKg: Math.round(form.weight_kg), wingspanCm: Math.round(form.wingspan_cm) },
    height_cm: Math.round(form.height_cm), number: Math.max(0, Math.min(99, Math.round(form.number))),
    overall: overallOf(attrs, form.pos), attrs,
  };
}

export function radarOf(attrs: PlayerData['attrs']): { label: string; value: number }[] {
  const avg = (...keys: (keyof PlayerData['attrs'])[]) => Math.round(keys.reduce((sum, key) => sum + attrs[key], 0) / keys.length);
  return [
    { label: '得分', value: avg('drivingLayup', 'movingMid', 'standingThree') },
    { label: '组织', value: avg('ballControl', 'passVision', 'passAccuracy') },
    { label: '防守', value: avg('onBallDefenseIQ', 'shotContest', 'steal', 'block') },
    { label: '篮板', value: avg('offRebound', 'defRebound', 'boxout') },
    { label: '身体', value: avg('speed', 'strength', 'stamina', 'vertical') },
  ];
}
