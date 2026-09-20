import { beforeEach, describe, expect, it } from 'vitest';

import type { InitialAttributes, InventoryItem, MartialArt } from '../types';
import { setMartialArtsDatabase } from './martialArtsDatabase';
import { quoteMartialArtStudyEligibility } from './martialArtStudyEligibility';

const baseAttributes: InitialAttributes = {
  臂力: 10,
  根骨: 10,
  机敏: 10,
  悟性: 10,
  洞察: 10,
  风姿: 10,
  福缘: 10,
};

const secretItem: InventoryItem = {
  id: 'secret-1',
  name: '九阳神功',
  type: 'SECRET',
  rank: 'RED',
  count: 1,
  description: '秘籍。',
  martialArtInfo: {
    description: '至阳至刚的绝世内功。',
    rank: '绝世',
    requirements: {
      悟性: 12,
      根骨: 11,
    },
  },
};

beforeEach(() => {
  setMartialArtsDatabase([
    {
      功法名称: '九阳神功',
      类型: '内功',
      功法品阶: '绝世',
      功法描述: '至阳至刚的绝世内功。',
      修炼限制: { 悟性: 12, 根骨: 11 },
    },
  ]);
});

describe('quoteMartialArtStudyEligibility', () => {
  it('逐项返回当前值、要求值和缺口原因', () => {
    const quote = quoteMartialArtStudyEligibility({
      item: secretItem,
      initialAttributes: baseAttributes,
    });

    expect(quote.canStudy).toBe(false);
    expect(quote.requirementStatuses).toEqual([
      { attribute: '悟性', current: 10, required: 12, met: false, deficit: 2 },
      { attribute: '根骨', current: 10, required: 11, met: false, deficit: 1 },
    ]);
    expect(quote.reasons).toEqual([
      '悟性不足：当前 10，需要 12，尚缺 2。',
      '根骨不足：当前 10，需要 11，尚缺 1。',
    ]);
  });

  it('属性满足但受天赋限制时给出具体禁止原因', () => {
    const quote = quoteMartialArtStudyEligibility({
      item: secretItem,
      initialAttributes: { ...baseAttributes, 悟性: 15, 根骨: 15 },
      traits: { 经脉尽断: '全身经脉俱断' },
    });

    expect(quote.canStudy).toBe(false);
    expect(quote.reasons).toContain('全身经脉俱断，无法修炼内功');
  });

  it('已经习得的功法不能重复参悟', () => {
    const knownMartialArts: Record<string, MartialArt> = {
      九阳神功: {
        type: '内功',
        description: '至阳至刚的绝世内功。',
        rank: '绝世',
        mastery: '初窥门径',
        traits: {},
        unlockedTraits: {},
        canUpgrade: true,
        upgradeCost: 100,
        nextMastery: '略有小成',
      },
    };

    const quote = quoteMartialArtStudyEligibility({
      item: secretItem,
      initialAttributes: { ...baseAttributes, 悟性: 15, 根骨: 15 },
      knownMartialArts,
    });

    expect(quote.canStudy).toBe(false);
    expect(quote.alreadyLearned).toBe(true);
    expect(quote.reasons).toContain('已习得《九阳神功》，无需重复参悟。');
  });

  it('所有限制满足时返回可参悟', () => {
    const quote = quoteMartialArtStudyEligibility({
      item: secretItem,
      initialAttributes: { ...baseAttributes, 悟性: 15, 根骨: 15 },
    });

    expect(quote.canStudy).toBe(true);
    expect(quote.reasons).toEqual([]);
  });
});
