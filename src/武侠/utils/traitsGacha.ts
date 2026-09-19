/**
 * 天赋抽卡与气运洗炼盘核心逻辑
 * 鬼谷八荒式推演盘算法与保底机制
 */

import type { CharacterTrait, TraitRank } from '../types';
import { CHARACTER_TRAITS } from './traitsDatabase';

export const MAX_EQUIPPED_TRAITS = 5;
export const DIVINATION_BOARD_SIZE = 6;
export const REROLL_POINT_COST = 10;
export const INITIAL_FREE_BLESSINGS = 1;

/**
 * 品阶权重配置
 * 粗浅 35% | 传家 30% | 上乘 20% | 镇派 10% | 绝世 4% | 传说 1%
 */
const RANK_WEIGHTS: Record<Exclude<TraitRank, '缺陷'>, number> = {
  粗浅: 35,
  传家: 30,
  上乘: 20,
  镇派: 10,
  绝世: 4,
  传说: 1,
};

/**
 * 根据权重随机抽取一个正面品阶
 */
function getRandomPositiveRank(): Exclude<TraitRank, '缺陷'> {
  const totalWeight = Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (const [rank, weight] of Object.entries(RANK_WEIGHTS)) {
    if (random < weight) {
      return rank as Exclude<TraitRank, '缺陷'>;
    }
    random -= weight;
  }
  return '粗浅';
}

/**
 * 获取所有可选的预设天赋池（排除属性极值触发的）
 */
export function getSelectableTraitsPool(): {
  positive: CharacterTrait[];
  negative: CharacterTrait[];
  byRank: Record<string, CharacterTrait[]>;
} {
  const selectable = CHARACTER_TRAITS.filter(t => !t.attributeThreshold);
  const positive = selectable.filter(t => (t.cost ?? 0) > 0);
  const negative = selectable.filter(t => (t.cost ?? 0) < 0);

  const byRank: Record<string, CharacterTrait[]> = {};
  for (const t of selectable) {
    const rank = t.rank || '粗浅';
    if (!byRank[rank]) {
      byRank[rank] = [];
    }
    byRank[rank].push(t);
  }

  return { positive, negative, byRank };
}

/**
 * 抽取单张命牌
 */
function drawSingleTrait(
  isNegative: boolean,
  forceHighRank: boolean,
  excludeNames: Set<string>,
  pool: ReturnType<typeof getSelectableTraitsPool>,
): CharacterTrait {
  if (isNegative) {
    const available = pool.negative.filter(t => !excludeNames.has(t.name));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
  }

  // 正面天赋
  let targetRank: TraitRank;
  if (forceHighRank) {
    const highRanks: TraitRank[] = ['镇派', '绝世', '传说'];
    targetRank = highRanks[Math.floor(Math.random() * highRanks.length)];
  } else {
    targetRank = getRandomPositiveRank();
  }

  const availableInRank = (pool.byRank[targetRank] || []).filter(
    t => (t.cost ?? 0) > 0 && !excludeNames.has(t.name),
  );

  if (availableInRank.length > 0) {
    return availableInRank[Math.floor(Math.random() * availableInRank.length)];
  }

  // 兜底退化选择任意非重复正面
  const fallback = pool.positive.filter(t => !excludeNames.has(t.name));
  if (fallback.length > 0) {
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  // 极端情况下全被排除，随机给一个
  return pool.positive[Math.floor(Math.random() * pool.positive.length)];
}

/**
 * 生成完整的八卦洗炼命盘（6张卡牌）
 * - 每轮必定包含 1~2 张负面缺陷（为玩家提供“提款续命”选择）
 * - 遵守锁定槽位
 * - 触发 3 连抽无紫保底时，强制翻出镇派或以上
 */
export function rollDivinationBoard(
  currentBoard: (CharacterTrait | null)[],
  lockedIndices: number[],
  pityCount: number,
  alreadyEquippedNames: string[] = [],
): {
  newBoard: CharacterTrait[];
  newPityCount: number;
} {
  const pool = getSelectableTraitsPool();
  const result: CharacterTrait[] = [...(currentBoard as CharacterTrait[])];
  const pickedNames = new Set<string>(alreadyEquippedNames);

  // 先把锁定的牌放入占用池
  for (const idx of lockedIndices) {
    if (result[idx]) {
      pickedNames.add(result[idx].name);
    }
  }

  // 需重新摇卦的槽位索引
  const slotsToRoll = Array.from({ length: DIVINATION_BOARD_SIZE }, (_, i) => i).filter(
    i => !lockedIndices.includes(i),
  );

  // 决定本轮负面卡数量（通常1~2张）
  const existingNegativeLocked = lockedIndices.filter(
    idx => result[idx] && (result[idx].cost ?? 0) < 0,
  ).length;
  const targetNegativeCount = Math.max(1, Math.min(2, Math.floor(Math.random() * 2) + 1));
  let remainingNegativeNeeded = Math.max(0, targetNegativeCount - existingNegativeLocked);

  // 检查是否触发紫光保底（连续3次未出镇派/绝世/传说，第4次必定触发）
  const shouldTriggerPity = pityCount >= 3;
  let highRankTriggered = false;

  for (let i = 0; i < slotsToRoll.length; i++) {
    const slotIndex = slotsToRoll[i];
    const isNegative = remainingNegativeNeeded > 0;
    if (isNegative) {
      remainingNegativeNeeded--;
    }

    const forceHighRank = !isNegative && shouldTriggerPity && !highRankTriggered;

    const trait = drawSingleTrait(isNegative, forceHighRank, pickedNames, pool);
    pickedNames.add(trait.name);
    result[slotIndex] = trait;

    if (['镇派', '绝世', '传说'].includes(trait.rank || '')) {
      highRankTriggered = true;
    }
  }

  // 更新保底计数器
  const hasHighRankOnBoard = result.some(t => ['镇派', '绝世', '传说'].includes(t?.rank || ''));
  const newPityCount = hasHighRankOnBoard ? 0 : pityCount + 1;

  return {
    newBoard: result,
    newPityCount,
  };
}
