import { describe, expect, it } from 'vitest';
import { resolveAction, tierOf } from './resolveAction';
import type { ActionType, OnCourtStatus, PlayerData, ResultTier, SituationContext } from './types';

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
  连续命中: 0,
  连续打铁: 0,
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

  it('无球跑动即使调用方误传 defender 也强制使用固定防守分', () => {
    const r = resolveAction({
      action: '无球跑动',
      actor: makePlayer(),
      actorStatus: normalStatus,
      defender: makePlayer({ name: 'Ignored Defender', cn: '不应参与' }),
      partner: null,
      situation: neutralSituation,
      rollDice: () => 30,
    });
    expect(r.defenseScore).toBe(55);
    expect(r.defenders).toEqual([]);
  });

  it('组织使用对方场上五人的防守均值', () => {
    const defenders = [40, 50, 60, 70, 80].map((value, index) =>
      makePlayer({
        name: `Defender ${index}`,
        cn: `防守人${index}`,
        attrs: { ...makePlayer().attrs, perimeterD: value, steal: value, interiorD: value },
      }),
    );
    const r = resolveAction({
      action: '组织',
      actor: makePlayer(),
      actorStatus: normalStatus,
      defender: defenders[0],
      defenders,
      partner: null,
      situation: neutralSituation,
      rollDice: () => 30,
    });
    expect(r.defenders).toHaveLength(5);
    expect(r.defenseScore).toBe(60);
  });

  it('挡拆取两名对位防守者均值，并在成功时创建真实错位', () => {
    const guardDefender = makePlayer({
      name: 'Guard Defender',
      cn: '后卫防守人',
      pos: 'PG',
      height_cm: 188,
      attrs: { ...makePlayer().attrs, perimeterD: 50, interiorD: 50, speed: 50 },
    });
    const centerDefender = makePlayer({
      name: 'Center Defender',
      cn: '中锋防守人',
      pos: 'C',
      height_cm: 216,
      attrs: { ...makePlayer().attrs, perimeterD: 90, interiorD: 90, speed: 90 },
    });
    const r = resolveAction({
      action: '挡拆',
      actor: makePlayer({ pos: 'PG', height_cm: 190 }),
      actorStatus: normalStatus,
      defender: guardDefender,
      partner: makePlayer({ name: 'Screener', cn: '掩护人', pos: 'C' }),
      partnerDefender: centerDefender,
      situation: neutralSituation,
      rollDice: () => 20,
    });
    expect(r.defenders).toEqual(['Guard Defender', 'Center Defender']);
    expect(r.defenseScore).toBe(70);
    expect(r.modifiers).toContainEqual({ label: '挡拆错位', value: 8 });
    expect(r.tier).toBe('成功');
    expect(r.hardResult.mismatchCreated).toBe(true);
  });

  it('篮板按进攻/防守身份切换发起人的篮板属性', () => {
    const rebounder = makePlayer({
      attrs: { ...makePlayer().attrs, offRebound: 30, defRebound: 90 },
    });
    const opponent = makePlayer({
      name: 'Opponent',
      attrs: { ...makePlayer().attrs, offRebound: 80, defRebound: 20 },
    });
    const offense = resolveAction({
      action: '篮板',
      actor: rebounder,
      actorStatus: normalStatus,
      defender: opponent,
      partner: null,
      reboundSide: '进攻篮板',
      situation: neutralSituation,
      rollDice: () => 50,
    });
    const defense = resolveAction({
      action: '篮板',
      actor: rebounder,
      actorStatus: normalStatus,
      defender: opponent,
      partner: null,
      reboundSide: '防守篮板',
      situation: neutralSituation,
      rollDice: () => 50,
    });
    expect(defense.attackScore).toBeGreaterThan(offense.attackScore);
    expect(defense.defenseScore).toBeGreaterThan(offense.defenseScore);
  });

  it('判级使用与展示一致的取整成功线', () => {
    expect(tierOf(51, 50.6)).toBe('成功');
    expect(tierOf(52, 50.6)).toBe('部分成功');
    const r = resolveAction({
      action: '中投',
      actor: makePlayer(),
      actorStatus: normalStatus,
      defender: makePlayer(),
      partner: null,
      situation: neutralSituation,
      rollDice: () => 50,
    });
    expect(Number.isInteger(r.finalRate)).toBe(true);
    expect(r.summary).toContain(`成功线 ${r.finalRate}`);
  });

  it('所有动作与五档结果均生成完整硬结算边界', () => {
    const actions: ActionType[] = [
      '突破', '中投', '三分', '内线终结', '传球', '组织', '挡拆',
      '无球跑动', '抢断', '盖帽', '篮板', '贴身防守', '协防',
    ];
    const expectedTiers: ResultTier[] = ['大成功', '成功', '部分成功', '失败', '大失败'];
    const weakAttrs = Object.fromEntries(
      Object.keys(makePlayer().attrs).map(key => [key, 40]),
    ) as unknown as PlayerData['attrs'];
    weakAttrs.potential = 40;
    const actor = makePlayer({ overall: 40, attrs: weakAttrs });
    const defender = makePlayer({ name: 'Strong Defender', cn: '强防守人', overall: 90 });

    for (const action of actions) {
      const probe = resolveAction({
        action,
        actor,
        actorStatus: normalStatus,
        defender,
        partner: action === '挡拆' ? makePlayer({ name: 'Partner' }) : null,
        situation: { ...neutralSituation, isHome: false },
        rollDice: () => 50,
      });
      const rolls = [
        1,
        Math.max(2, probe.finalRate),
        Math.min(96, probe.finalRate + 1),
        Math.min(96, probe.finalRate + 16),
        98,
      ];
      const results = rolls.map(roll => resolveAction({
        action,
        actor,
        actorStatus: normalStatus,
        defender,
        partner: action === '挡拆' ? makePlayer({ name: 'Partner' }) : null,
        situation: { ...neutralSituation, isHome: false },
        rollDice: () => roll,
      }));

      expect(results.map(result => result.tier), action).toEqual(expectedTiers);
      for (const result of results) {
        expect(result.hardResult.allowedStatePaths.length, `${action}/${result.tier}`).toBeGreaterThan(0);
        expect(result.hardResult.clockSeconds.min).toBeLessThanOrEqual(result.hardResult.clockSeconds.max);
        expect(result.hardResult.scoreDelta.actionSide.min).toBeLessThanOrEqual(
          result.hardResult.scoreDelta.actionSide.max,
        );
      }
    }
  });

  it('得分、创造和防守动作遵守关键硬结果边界', () => {
    const resolveAt = (action: ActionType, roll: number) => resolveAction({
      action,
      actor: makePlayer(),
      actorStatus: normalStatus,
      defender: makePlayer({ name: 'Opponent' }),
      partner: null,
      situation: neutralSituation,
      rollDice: () => roll,
    });

    const madeThree = resolveAt('三分', 20);
    expect(madeThree.tier).toBe('成功');
    expect(madeThree.hardResult.scoreDelta.actionSide).toEqual({ min: 3, max: 3 });
    expect(madeThree.hardResult.possession).toBe('对手获得');

    const missedShot = resolveAt('中投', 96);
    expect(missedShot.tier).toBe('失败');
    expect(missedShot.hardResult.nextPhase).toEqual(['篮板争抢']);
    expect(missedShot.hardResult.scoreDelta.actionSide.max).toBe(0);

    const badPass = resolveAt('传球', 98);
    expect(badPass.hardResult.possession).toBe('对手获得');
    expect(badPass.hardResult.requiredStatUpdates).toContainEqual(
      expect.objectContaining({ target: 'actor', stat: '失误', operation: 'add', value: { min: 1, max: 1 } }),
    );

    const failedDefense = resolveAt('贴身防守', 90);
    expect(failedDefense.hardResult.scoreDelta.opponentSide.max).toBe(0);
  });
});
