import { describe, expect, it } from 'vitest';
import { applyAttributeModifiers, calculateAllAttributes } from './attributeCalculator';
import type { InitialAttributes } from '../types';

const initialAttributes: InitialAttributes = {
  臂力: 10,
  根骨: 10,
  机敏: 10,
  悟性: 10,
  洞察: 10,
  风姿: 10,
  福缘: 0,
};

describe('attributeCalculator', () => {
  it('会把百分比属性修正应用到最终战斗属性和资源属性', () => {
    const result = calculateAllAttributes(initialAttributes, '不入流', {}, {
      臂力: 50,
      根骨: 150,
      气血: 300,
      内力: 120,
    });

    expect(result.combat).toEqual({
      臂力: 15,
      根骨: 25,
      机敏: 10,
      洞察: 10,
    });
    expect(result.resources).toEqual({
      气血上限: 40,
      内力上限: 22,
    });
  });

  it('支持负数修正并且不会低于 0', () => {
    const result = applyAttributeModifiers(
      { 臂力: 3, 根骨: 3, 机敏: 3, 洞察: 3 },
      { 气血上限: 20, 内力上限: 20 },
      {
        臂力: -200,
        气血上限: -125,
        内力: -35,
      },
    );

    expect(result.combat.臂力).toBe(0);
    expect(result.resources.气血上限).toBe(0);
    expect(result.resources.内力上限).toBe(13);
  });

  it('同属性百分比先求和再乘算，并合并资源别名', () => {
    const result = applyAttributeModifiers(
      { 臂力: 100, 根骨: 100, 机敏: 100, 洞察: 100 },
      { 气血上限: 200, 内力上限: 200 },
      { 臂力: 30, 气血: 10, 气血上限: 15 },
    );

    expect(result.combat.臂力).toBe(130);
    expect(result.resources.气血上限).toBe(250);
  });

  it('来源数组会按来源品阶独立封顶后叠加', () => {
    const result = applyAttributeModifiers(
      { 臂力: 100, 根骨: 100, 机敏: 100, 洞察: 100 },
      { 气血上限: 200, 内力上限: 200 },
      [
        { id: '精品剑', kind: '装备', rank: '精品', modifiers: { 臂力: 50 } },
        { id: '精品药', kind: '临时增幅', rank: '精品', modifiers: { 臂力: 50, 气血: 25 } },
      ],
    );

    expect(result.combat.臂力).toBe(144);
    expect(result.resources.气血上限).toBe(246);
  });

  it('负数来源不吃正向封顶但最终不低于 0', () => {
    const result = applyAttributeModifiers(
      { 臂力: 20, 根骨: 20, 机敏: 20, 洞察: 20 },
      { 气血上限: 20, 内力上限: 20 },
      [{ id: '毒', kind: '装备', rank: '凡品', modifiers: { 臂力: -200, 气血: -50 } }],
    );

    expect(result.combat.臂力).toBe(0);
    expect(result.resources.气血上限).toBe(10);
  });
});
