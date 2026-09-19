import { describe, it, expect } from 'vitest';
import {
  rollDivinationBoard,
  DIVINATION_BOARD_SIZE,
  MAX_EQUIPPED_TRAITS,
  REROLL_POINT_COST,
} from './traitsGacha';

describe('traitsGacha 洗炼盘逻辑测试', () => {
  it('基础常量符合设计预期', () => {
    expect(DIVINATION_BOARD_SIZE).toBe(6);
    expect(MAX_EQUIPPED_TRAITS).toBe(5);
    expect(REROLL_POINT_COST).toBe(10);
  });

  it('初始开盘能生成 6 张不重复命牌，且必定包含负面缺陷供提款', () => {
    const { newBoard } = rollDivinationBoard([], [], 0, []);
    expect(newBoard.length).toBe(6);

    const names = newBoard.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(6);

    // 至少包含 1 张负面卡
    const negativeCount = newBoard.filter(t => (t.cost ?? 0) < 0).length;
    expect(negativeCount).toBeGreaterThanOrEqual(1);
  });

  it('锁定槽位在重新洗炼时严格保留不被替换', () => {
    const { newBoard: firstBoard } = rollDivinationBoard([], [], 0, []);
    const lockedIndex = 2;
    const lockedTrait = firstBoard[lockedIndex];

    // 锁定第 2 个槽位并重新洗炼
    const { newBoard: secondBoard } = rollDivinationBoard(firstBoard, [lockedIndex], 0, []);
    expect(secondBoard[lockedIndex].name).toBe(lockedTrait.name);
  });

  it('保底机制：连续3次未出高阶时第4次必定触发镇派及以上', () => {
    // 强制 pityCount = 3
    const { newBoard } = rollDivinationBoard([], [], 3, []);
    const hasHighRank = newBoard.some(t => ['镇派', '绝世', '传说'].includes(t.rank || ''));
    expect(hasHighRank).toBe(true);
  });
});
