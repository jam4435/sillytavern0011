import { describe, expect, it } from 'vitest';
import martialArtsDatabase from '../data/_合并后功法.json';
import {
  MASTERY_LEVELS,
  RANK_COMBAT_COEFFICIENT_SUM,
  RANK_LEVELS,
  type MartialArtsRank,
  type MartialArtsType,
} from './martialArtNumerics';

const supportedTypes: MartialArtsType[] = [
  '内功', '外功', '轻功', '剑法', '刀法', '拳掌', '指法', '暗器', '枪戟', '棍锤', '鞭法',
];
const allowedAttributes = ['臂力', '根骨', '机敏', '悟性', '洞察', '风姿', '福缘'] as const;
const arts = martialArtsDatabase.功法;

describe('功法数据库数值完整性', () => {
  it('所有非空战斗系数列表都精确匹配品阶预算', () => {
    for (const art of arts) {
      const attributes = art.战斗系数?.属性列表;
      if (!attributes?.length) continue;
      const sumInHundredths = Math.round(attributes.reduce((sum, item) => sum + item.系数, 0) * 100);
      const expectedInHundredths = Math.round(
        RANK_COMBAT_COEFFICIENT_SUM[art.功法品阶 as MartialArtsRank] * 100,
      );
      expect(sumInHundredths, art.功法名称).toBe(expectedInHundredths);
      for (const item of attributes) {
        expect(allowedAttributes, `${art.功法名称} 的战斗属性`).toContain(item.属性);
        expect(Number.isFinite(item.系数) && item.系数 > 0, `${art.功法名称} 的系数`).toBe(true);
        if (item.乘境界 !== undefined) expect(typeof item.乘境界).toBe('boolean');
      }
    }
  });

  it('所有功法类型均在运行时支持列表内', () => {
    for (const art of arts) expect(supportedTypes, art.功法名称).toContain(art.类型);
  });

  it('修炼限制只使用合法七维属性和 0–20 的整数门槛/范围', () => {
    for (const art of arts) {
      for (const [attribute, requirement] of Object.entries(art.修炼限制 || {})) {
        expect(allowedAttributes, `${art.功法名称} 的修炼限制属性`).toContain(attribute);
        if (typeof requirement === 'number') {
          expect(Number.isInteger(requirement) && requirement >= 0 && requirement <= 20, art.功法名称).toBe(true);
          continue;
        }
        expect(requirement && typeof requirement === 'object' && !Array.isArray(requirement), art.功法名称).toBe(true);
        const range = requirement as { min?: number; max?: number };
        const keys = Object.keys(range);
        expect(keys.length > 0 && keys.every(key => key === 'min' || key === 'max'), art.功法名称).toBe(true);
        for (const bound of Object.values(range)) {
          expect(Number.isInteger(bound) && Number(bound) >= 0 && Number(bound) <= 20, art.功法名称).toBe(true);
        }
        if (range.min !== undefined && range.max !== undefined) expect(range.min <= range.max, art.功法名称).toBe(true);
      }
    }
  });

  it('所有特性阶段键都属于五级掌握程度', () => {
    for (const art of arts) {
      for (const mastery of Object.keys(art.特性 || {})) expect(MASTERY_LEVELS, `${art.功法名称} 的特性阶段`).toContain(mastery);
    }
  });

  it('所有功法品阶都在统一枚举中', () => {
    for (const art of arts) expect(RANK_LEVELS, art.功法名称).toContain(art.功法品阶);
  });
});
