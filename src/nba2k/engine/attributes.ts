import type { ActionType, PlayerAttrs } from './types';

export type AttrWeight = Partial<Record<keyof PlayerAttrs | 'height' | 'overall', number>>;

export interface ActionSpec {
  /** 进攻/发起方属性权重 */
  attack: AttrWeight;
  /** 防守/受方属性权重 */
  defense: AttrWeight;
  /** 该动作是否属于防守方主动动作 */
  defensive?: boolean;
  /** 无对位判定时的固定防守分（如无球跑动） */
  flatDefense?: number;
}

/** 各动作的属性权重表，权重合计为 1（见 设计文档.md §3.1） */
export const ACTION_SPECS: Record<ActionType, ActionSpec> = {
  突破: {
    attack: { ballHandle: 0.4, speed: 0.3, layup: 0.3 },
    defense: { perimeterD: 0.5, speed: 0.3, steal: 0.2 },
  },
  中投: {
    attack: { midRange: 0.7, overall: 0.3 },
    defense: { perimeterD: 0.6, block: 0.2, height: 0.2 },
  },
  三分: {
    attack: { threePoint: 0.75, stamina: 0.25 },
    defense: { perimeterD: 0.7, speed: 0.3 },
  },
  内线终结: {
    attack: { insideScoring: 0.4, layup: 0.25, dunk: 0.2, strength: 0.15 },
    defense: { interiorD: 0.5, block: 0.3, strength: 0.2 },
  },
  传球: {
    attack: { passing: 0.7, ballHandle: 0.3 },
    defense: { steal: 0.6, perimeterD: 0.4 },
  },
  组织: {
    attack: { passing: 0.45, ballHandle: 0.35, overall: 0.2 },
    defense: { perimeterD: 0.5, steal: 0.3, interiorD: 0.2 },
  },
  挡拆: {
    // 掩护人权重在 resolveAction 中以 partnerWeight 合成
    attack: { ballHandle: 0.35, speed: 0.25, strength: 0.4 },
    defense: { perimeterD: 0.5, interiorD: 0.3, speed: 0.2 },
  },
  无球跑动: {
    attack: { speed: 0.5, stamina: 0.3, overall: 0.2 },
    defense: {},
    flatDefense: 55,
  },
  抢断: {
    defensive: true,
    attack: { steal: 0.65, speed: 0.35 },
    defense: { ballHandle: 0.7, passing: 0.3 },
  },
  盖帽: {
    defensive: true,
    attack: { block: 0.7, height: 0.3 },
    defense: { layup: 0.4, dunk: 0.3, insideScoring: 0.3 },
  },
  篮板: {
    attack: { offRebound: 0.6, strength: 0.25, height: 0.15 },
    defense: { defRebound: 0.6, strength: 0.25, height: 0.15 },
  },
  贴身防守: {
    defensive: true,
    attack: { perimeterD: 0.6, speed: 0.25, stamina: 0.15 },
    defense: { ballHandle: 0.5, speed: 0.5 },
  },
  协防: {
    defensive: true,
    attack: { interiorD: 0.4, block: 0.3, speed: 0.3 },
    defense: { passing: 0.5, layup: 0.5 },
  },
};

/** 身高 cm 归一化到 0-99 属性刻度（170cm→30，231cm→99） */
export function heightScore(height_cm: number): number {
  const v = ((height_cm - 170) / (231 - 170)) * 69 + 30;
  return Math.max(0, Math.min(99, Math.round(v)));
}

/** 按权重表汇总一名球员的加权得分 */
export function weightedScore(
  weights: AttrWeight,
  attrs: PlayerAttrs,
  overall: number,
  height_cm: number,
): number {
  let sum = 0;
  for (const [key, w] of Object.entries(weights)) {
    if (w === undefined) continue;
    let value: number;
    if (key === 'height') value = heightScore(height_cm);
    else if (key === 'overall') value = overall;
    else value = attrs[key as keyof PlayerAttrs];
    sum += value * w;
  }
  return sum;
}
