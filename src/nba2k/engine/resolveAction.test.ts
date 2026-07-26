import { describe, expect, it } from 'vitest';
import { resolveAction } from './resolveAction';
import type { OnCourtStatus, PlayerData, SituationContext } from './types';

function makePlayer(overrides: Partial<PlayerData> = {}): PlayerData {
  return {
    name: 'Test Guard',
    cn: '测试后卫',
    team: 'GSW',
    pos: 'PG',
    secondaryPos: null,
    height_cm: 190,
    number: 1,
    overall: 85,
    attrs: {
      insideScoring: 70,
      outsideScoring: 85,
      threePoint: 88,
      midRange: 82,
      freeThrow: 90,
      layup: 80,
      dunk: 60,
      speed: 88,
      ballHandle: 90,
      passing: 85,
      perimeterD: 70,
      interiorD: 50,
      steal: 72,
      block: 40,
      offRebound: 40,
      defRebound: 55,
      stamina: 88,
      strength: 60,
      potential: 90,
    },
    ...overrides,
  };
}

const normalStatus: OnCourtStatus = {
  体力: 90,
  得分: 0,
  篮板: 0,
  助攻: 0,
  抢断: 0,
  盖帽: 0,
  失误: 0,
  犯规: 0,
  手感: '平',
};

const neutralSituation: SituationContext = {
  isHome: true,
  isClutch: false,
  coverage: 'normal',
  mismatch: false,
  defenderFouls: 0,
};

describe('resolveAction', () => {
  it('强攻弱防时成功率高，低掷骰判大成功', () => {
    const weakDefender = makePlayer({
      cn: '弱防守人',
      overall: 65,
      attrs: { ...makePlayer().attrs, perimeterD: 45, speed: 55, steal: 40 },
    });
    const r = resolveAction({
      action: '突破',
      actor: makePlayer(),
      actorStatus: normalStatus,
      defender: weakDefender,
      partner: null,
      situation: neutralSituation,
      rollDice: () => 5,
    });
    expect(r.finalRate).toBeGreaterThan(60);
    expect(r.tier).toBe('大成功');
  });

  it('掷骰 97+ 永远是大失败', () => {
    const r = resolveAction({
      action: '三分',
      actor: makePlayer(),
      actorStatus: normalStatus,
      defender: makePlayer({ cn: '防守人' }),
      partner: null,
      situation: { ...neutralSituation, coverage: 'open' },
      rollDice: () => 98,
    });
    expect(r.tier).toBe('大失败');
  });

  it('成功线被钳制在 5-95 且体力/空位修正生效', () => {
    const tired: OnCourtStatus = { ...normalStatus, 体力: 15 };
    const r = resolveAction({
      action: '中投',
      actor: makePlayer(),
      actorStatus: tired,
      defender: makePlayer({ cn: '防守人' }),
      partner: null,
      situation: { ...neutralSituation, coverage: 'tight' },
      rollDice: () => 50,
    });
    expect(r.modifiers.some(m => m.label === '体力透支')).toBe(true);
    expect(r.finalRate).toBeGreaterThanOrEqual(5);
    expect(r.finalRate).toBeLessThanOrEqual(95);
  });

  it('挡拆使用掩护人力量并记录 partner', () => {
    const screener = makePlayer({
      name: 'Big Man',
      cn: '掩护中锋',
      pos: 'C',
      height_cm: 213,
      attrs: { ...makePlayer().attrs, strength: 92 },
    });
    const r = resolveAction({
      action: '挡拆',
      actor: makePlayer(),
      actorStatus: normalStatus,
      defender: makePlayer({ cn: '防守人' }),
      partner: screener,
      situation: neutralSituation,
      rollDice: () => 40,
    });
    expect(r.partner).toBe('Big Man');
    expect(r.attackScore).toBeGreaterThan(0);
  });

  it('无对位动作使用固定防守分', () => {
    const r = resolveAction({
      action: '无球跑动',
      actor: makePlayer(),
      actorStatus: normalStatus,
      defender: null,
      partner: null,
      situation: neutralSituation,
      rollDice: () => 30,
    });
    expect(r.defenseScore).toBe(55);
    expect(r.defender).toBeNull();
  });
});
