import { beforeAll, describe, expect, it } from 'vitest';
import {
  getTraitByName,
  getTraitModifierSources,
  getTraitRestrictions,
  checkMartialArtTraitRestriction,
  getTraitDiscounts,
  getTriggeredTraitsByAttribute,
} from './traitsDatabase';
import { calculateAllAttributes } from './attributeCalculator';
import {
  calculateUpgradeCost,
  completeMartialArt,
  checkMartialArtPrerequisites,
  upgradeMartialArt,
  loadMartialArtsDatabase,
} from './martialArtsDatabase';

describe('traitsDatabase 结构化天赋机制', () => {
  beforeAll(async () => {
    await loadMartialArtsDatabase();
  });
  it('能够正确查找和解析预设天赋', () => {
    const brokenMeridian = getTraitByName('经脉尽断');
    expect(brokenMeridian).toBeDefined();
    expect(brokenMeridian?.cost).toBe(-20);
    expect(brokenMeridian?.restrictions?.forbiddenMartialTypes).toContain('内功');
    expect(brokenMeridian?.attributeModifiers?.内力).toBe(-50);

    const swordFanatic = getTraitByName('剑痴');
    expect(swordFanatic).toBeDefined();
    expect(swordFanatic?.discounts?.martialTypeDiscount?.['剑法']).toBe(0.25);

    const martialGenius = getTraitByName('武学奇才');
    expect(martialGenius).toBeDefined();
    expect(martialGenius?.discounts?.savvyRequirementOffset).toBe(-2);
  });

  it('提取属性修正源：正确包含天赋修正并支持正负百分比', () => {
    const sources = getTraitModifierSources({
      体魄强健: '生来体格健壮',
      断臂: '失去了一条手臂',
    });

    expect(sources).toHaveLength(2);
    expect(sources[0].kind).toBe('天赋');
    expect(sources[0].modifiers?.根骨).toBe(10);
    expect(sources[1].modifiers?.臂力).toBe(-20);
    expect(sources[1].modifiers?.机敏).toBe(-20);
  });

  it('修炼限制汇总与类型拦截：经脉尽断禁止内功，但允许剑法', () => {
    const traits = { 经脉尽断: '全身经脉俱断' };

    const restrictions = getTraitRestrictions(traits);
    expect(restrictions.forbiddenMartialTypes).toContain('内功');

    const internalCheck = checkMartialArtTraitRestriction('内功', traits);
    expect(internalCheck).toBe('全身经脉俱断，无法修炼内功');

    const swordCheck = checkMartialArtTraitRestriction('剑法', traits);
    expect(swordCheck).toBeNull();
  });

  it('升级折扣汇总：武学奇才与剑痴正确生效并进行乘算复合', () => {
    const traits = ['武学奇才', '剑痴', '嗜武如命'];
    const discounts = getTraitDiscounts(traits);

    expect(discounts.savvyRequirementOffset).toBe(-2);
    expect(discounts.martialTypeDiscount?.['剑法']).toBe(0.25);
    // 武学奇才(15%) 与 嗜武如命(10%) 乘算复合: 1 - (1 - 0.15) * (1 - 0.10) = 0.235
    expect(discounts.globalUpgradeDiscount).toBe(0.235);
  });

  it('属性计算引擎正确应用天赋修正', () => {
    const baseAttrs = { 臂力: 10, 根骨: 10, 机敏: 10, 悟性: 10, 洞察: 10 };
    const realm = '三流初期'; // 系数 10
    const martialArts = {};

    // 无天赋时
    const normal = calculateAllAttributes(baseAttrs, realm, martialArts);

    // 装备天赋：体魄强健（根骨+10%，气血+10%）
    const positiveSources = getTraitModifierSources(['体魄强健']);
    const boosted = calculateAllAttributes(baseAttrs, realm, martialArts, positiveSources);
    expect(boosted.combat.根骨).toBeGreaterThan(normal.combat.根骨);
    expect(boosted.resources.气血上限).toBeGreaterThan(normal.resources.气血上限);

    // 装备负面天赋：断臂（臂力-20%，机敏-20%）
    const negativeSources = getTraitModifierSources(['断臂']);
    const crippled = calculateAllAttributes(baseAttrs, realm, martialArts, negativeSources);
    expect(crippled.combat.臂力).toBeLessThan(normal.combat.臂力);
    expect(crippled.combat.机敏).toBeLessThan(normal.combat.机敏);
  });

  it('功法升级计算：武学奇才降低基准需求，剑痴享受剑法额外折扣', () => {
    // 正常悟性 10 升级上乘剑法初窥门径
    const normalCost = calculateUpgradeCost('上乘', '初窥门径', 10, '剑法');

    // 拥有武学奇才（基准悟性要求-2，相当于悟性偏离值更大，更省修为）
    const geniusCost = calculateUpgradeCost('上乘', '初窥门径', 10, '剑法', ['武学奇才']);
    expect(geniusCost).toBeLessThan(normalCost);

    // 拥有剑痴（剑法熟练度消耗 -25%）
    const swordFanaticCost = calculateUpgradeCost('上乘', '初窥门径', 10, '剑法', ['剑痴']);
    expect(swordFanaticCost).toBe(Math.floor(normalCost * 0.75));

    // 两个天赋叠加
    const stackedCost = calculateUpgradeCost('上乘', '初窥门径', 10, '剑法', ['武学奇才', '剑痴']);
    expect(stackedCost).toBeLessThan(swordFanaticCost);
  });

  it('功法补完与前置校验：经脉尽断功法无法精进并带有明确原因', () => {
    const traits = { 经脉尽断: '全身经脉俱断' };

    // 补完一门内功（九阳神功）
    const completedInnerArt = completeMartialArt(
      '九阳神功',
      {
        类型: '内功',
        掌握程度: '初窥门径',
        功法品阶: '传说',
      },
      100000,
      10,
      traits,
    );

    expect(completedInnerArt.canUpgrade).toBe(false);
    expect(completedInnerArt.restrictionReason).toBe('全身经脉俱断，无法修炼内功');

    // 补完一门剑法（独孤九剑）应不受影响
    const completedSwordArt = completeMartialArt(
      '独孤九剑',
      {
        类型: '剑法',
        掌握程度: '初窥门径',
        功法品阶: '传说',
      },
      100000,
      10,
      traits,
    );

    expect(completedSwordArt.canUpgrade).toBe(true);
    expect(completedSwordArt.restrictionReason).toBeUndefined();

    // 校验前置拦截函数
    expect(checkMartialArtPrerequisites('内功', traits).canLearn).toBe(false);
    expect(checkMartialArtPrerequisites('剑法', traits).canLearn).toBe(true);
  });

  it('升级执行函数在受限时安全阻断', async () => {
    const result = await upgradeMartialArt('九阳神功', '初窥门径', 100000, '传说', 10, ['经脉尽断']);
    expect(result.success).toBe(false);
    expect(result.error).toContain('无法修炼内功');
  });

  it('属性触发天赋正确根据属性值触发且具有对应属性修正', () => {
    // 臂力极低（0）触发严重负面「肌肉萎缩」
    const lowBrawnTraits = getTriggeredTraitsByAttribute('臂力', 0);
    expect(lowBrawnTraits.some(t => t.name === '肌肉萎缩')).toBe(true);
    const atrophy = getTraitByName('肌肉萎缩');
    expect(atrophy?.attributeModifiers?.臂力).toBe(-30);

    // 臂力极高（18）触发强力正面「霸王扛鼎」
    const highBrawnTraits = getTriggeredTraitsByAttribute('臂力', 18);
    expect(highBrawnTraits.some(t => t.name === '霸王扛鼎')).toBe(true);
    const hercules = getTraitByName('霸王扛鼎');
    expect(hercules?.attributeModifiers?.臂力).toBe(25);

    // 根骨极高（18）触发「武骨天成」
    const highRootTraits = getTriggeredTraitsByAttribute('根骨', 18);
    expect(highRootTraits.some(t => t.name === '武骨天成')).toBe(true);
    const rootTalent = getTraitByName('武骨天成');
    expect(rootTalent?.attributeModifiers?.根骨).toBe(25);
    expect(rootTalent?.attributeModifiers?.气血).toBe(20);
    expect(rootTalent?.attributeModifiers?.内力).toBe(10);

    // 悟性极高（18）触发「玲珑七窍」
    const highSavvyTraits = getTriggeredTraitsByAttribute('悟性', 18);
    expect(highSavvyTraits.some(t => t.name === '玲珑七窍')).toBe(true);
    const geniusMind = getTraitByName('玲珑七窍');
    expect(geniusMind?.discounts?.savvyRequirementOffset).toBe(-3);
  });
});
