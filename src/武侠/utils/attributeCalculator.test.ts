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
  it('会把属性修正叠加到最终战斗属性和资源属性', () => {
    const result = calculateAllAttributes(initialAttributes, '不入流', {}, {
      臂力: 5,
      根骨: 15,
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
      气血上限: 310,
      内力上限: 130,
    });
  });

  it('支持负数修正并且不会低于 0', () => {
    const result = applyAttributeModifiers(
      { 臂力: 3, 根骨: 3, 机敏: 3, 洞察: 3 },
      { 气血上限: 20, 内力上限: 20 },
      {
        臂力: -5,
        气血上限: -25,
        内力: -7,
      },
    );

    expect(result.combat.臂力).toBe(0);
    expect(result.resources.气血上限).toBe(0);
    expect(result.resources.内力上限).toBe(13);
  });
});
