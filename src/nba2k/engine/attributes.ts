import type { ActionFamily, ActionType, PlayerAttrs } from './types';

export type AttrWeight = Partial<Record<keyof PlayerAttrs | 'height' | 'weight' | 'wingspan' | 'overall', number>>;
export interface ActionSpec { family: ActionFamily; attack: AttrWeight; defense: AttrWeight; defensive?: boolean; flatDefense?: number; difficulty?: number }

const shotDefense: AttrWeight = { shotContest: .45, onBallDefenseIQ: .2, reactionTime: .15, wingspan: .2 };
const passDefense: AttrWeight = { steal: .45, reactionTime: .3, onBallDefenseIQ: .25 };

export const ACTION_SPECS: Record<ActionType, ActionSpec> = {
  定点投篮: { family: '投篮', attack: { standingThree: .55, shotIQ: .2, offensiveConsistency: .15, stamina: .1 }, defense: shotDefense, difficulty: 0 },
  急停投篮: { family: '投篮', attack: { movingMid: .45, movingThree: .2, ballControl: .15, offensiveConsistency: .2 }, defense: shotDefense, difficulty: 6 },
  后撤步: { family: '投篮', attack: { movingThree: .45, ballControl: .25, acceleration: .15, offensiveConsistency: .15 }, defense: shotDefense, difficulty: 10 },
  突破终结: { family: '突破', attack: { ballControl: .25, drivingLayup: .25, acceleration: .2, speed: .15, strength: .15 }, defense: { onBallDefenseIQ: .3, lateralQuickness: .3, reactionTime: .2, strength: .1, steal: .1 } },
  突破分球: { family: '突破', attack: { ballControl: .25, acceleration: .2, passVision: .25, passAccuracy: .2, composure: .1 }, defense: { ...passDefense, lateralQuickness: .15 } },
  突破急停: { family: '突破', attack: { ballControl: .2, acceleration: .2, movingMid: .35, composure: .1, offensiveConsistency: .15 }, defense: shotDefense, difficulty: 6 },
  安全传球: { family: '传球', attack: { passAccuracy: .45, passIQ: .3, hands: .15, composure: .1 }, defense: passDefense },
  跨场转移: { family: '传球', attack: { passVision: .35, passAccuracy: .35, passIQ: .2, strength: .1 }, defense: passDefense, difficulty: 6 },
  挡拆突破: { family: '挡拆', attack: { ballControl: .3, acceleration: .25, passIQ: .15, drivingLayup: .2, composure: .1 }, defense: { onBallDefenseIQ: .3, lateralQuickness: .25, reactionTime: .25, lowPostDefenseIQ: .2 } },
  顺下传球: { family: '挡拆', attack: { passVision: .4, passAccuracy: .3, passIQ: .3 }, defense: passDefense },
  外弹传球: { family: '挡拆', attack: { passVision: .35, passAccuracy: .35, passIQ: .3 }, defense: passDefense },
  背身单打: { family: '背身', attack: { postControl: .35, postFade: .2, postHook: .15, strength: .2, offensiveConsistency: .1 }, defense: { lowPostDefenseIQ: .45, strength: .3, block: .15, wingspan: .1 }, difficulty: 8 },
  空切: { family: '无球', attack: { acceleration: .35, speed: .2, offensiveConsistency: .2, hands: .15, stamina: .1 }, defense: {}, flatDefense: 55 },
  外移接球: { family: '无球', attack: { acceleration: .25, shotIQ: .3, hands: .25, stamina: .2 }, defense: {}, flatDefense: 55 },
  无球掩护: { family: '无球', attack: { strength: .35, offensiveConsistency: .2, passIQ: .2, stamina: .25 }, defense: {}, flatDefense: 55 },
  保持身位: { family: '防守', defensive: true, attack: { onBallDefenseIQ: .4, lateralQuickness: .3, reactionTime: .2, defensiveConsistency: .1 }, defense: { ballControl: .45, acceleration: .3, offensiveConsistency: .25 } },
  贴身施压: { family: '防守', defensive: true, attack: { onBallDefenseIQ: .3, lateralQuickness: .25, strength: .15, reactionTime: .2, stamina: .1 }, defense: { ballControl: .45, speed: .25, composure: .3 } },
  赌博抢断: { family: '防守', defensive: true, attack: { steal: .45, reactionTime: .3, lateralQuickness: .15, defensiveConsistency: .1 }, defense: { ballControl: .55, passIQ: .2, composure: .25 } },
  协防: { family: '防守', defensive: true, attack: { reactionTime: .3, shotContest: .3, onBallDefenseIQ: .2, speed: .2 }, defense: { passVision: .3, passIQ: .25, drivingLayup: .25, composure: .2 } },
  换防: { family: '防守', defensive: true, attack: { reactionTime: .3, onBallDefenseIQ: .3, lateralQuickness: .25, defensiveConsistency: .15 }, defense: { ballControl: .4, acceleration: .3, passIQ: .3 } },
  封盖干扰: { family: '防守', defensive: true, attack: { block: .4, shotContest: .3, vertical: .15, reactionTime: .1, wingspan: .05 }, defense: { drivingLayup: .3, contactDunk: .2, shotIQ: .25, composure: .25 } },
  卡位: { family: '篮板', defensive: true, attack: { boxout: .45, strength: .3, defRebound: .15, wingspan: .1 }, defense: { offRebound: .45, strength: .25, vertical: .2, wingspan: .1 } },
  防守篮板: { family: '篮板', defensive: true, attack: { defRebound: .45, boxout: .2, strength: .15, vertical: .1, wingspan: .1 }, defense: { offRebound: .45, strength: .2, vertical: .2, wingspan: .15 } },
  冲抢进攻篮板: { family: '篮板', attack: { offRebound: .45, hustle: .2, strength: .15, vertical: .1, wingspan: .1 }, defense: { defRebound: .45, boxout: .25, strength: .15, wingspan: .15 } },
  观察: { family: '替补', attack: { composure: .5, passIQ: .5 }, defense: {}, flatDefense: 0 },
  模拟一个回合: { family: '替补', attack: { composure: .5, passIQ: .5 }, defense: {}, flatDefense: 0 },
};

function normalizedBody(value: number, min: number, max: number): number { return Math.max(0, Math.min(99, ((value - min) / (max - min)) * 99)); }
export function weightedScore(weights: AttrWeight, attrs: PlayerAttrs, overall: number, body: { heightCm: number; weightKg: number; wingspanCm: number }): number {
  let sum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (weight === undefined) continue;
    const value = key === 'height' ? normalizedBody(body.heightCm, 170, 231)
      : key === 'weight' ? normalizedBody(body.weightKg, 65, 150)
      : key === 'wingspan' ? normalizedBody(body.wingspanCm, 165, 250)
      : key === 'overall' ? overall : attrs[key as keyof PlayerAttrs];
    sum += value * weight;
  }
  return sum;
}
