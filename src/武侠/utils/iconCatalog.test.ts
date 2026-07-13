import { describe, expect, it } from 'vitest';
import martialArtsDatabase from '../data/_合并后功法.json';
import type { InventoryItem, MartialArt } from '../types';
import reviewedEquipSaberDivine from '../assets/icons/reviewed/equip_saber_divine_game.jpg?url';
import reviewedEquipSwordSupreme from '../assets/icons/reviewed/equip_sword_supreme_game.png?url';
import reviewedMedicineElixirDivine from '../assets/icons/reviewed/medicine_elixir_divine_game.jpg?url';
import { getRankVisual, resolveInventoryIcon, resolveMartialArtIcon } from './iconCatalog';
import { generatedInventoryAssets } from './inventoryGeneratedIconAssets';

const baseItem: InventoryItem = {
  id: 'item_1',
  name: '无名物',
  type: 'MISC',
  rank: 'WHITE',
  count: 1,
  description: '',
};

const baseArt: MartialArt = {
  type: '内功',
  description: '',
  rank: '绝世',
  mastery: '初窥门径',
  traits: {},
  unlockedTraits: {},
  canUpgrade: false,
  upgradeCost: 0,
  nextMastery: null,
};

describe('iconCatalog', () => {
  it('功法名称与繁简别名可匹配到同一图标', () => {
    expect(resolveMartialArtIcon('九陽神功', baseArt)).toEqual(
      expect.objectContaining({ label: '九阳神功', matchedBy: 'name' }),
    );
    expect(resolveMartialArtIcon('九阳真经', baseArt)).toEqual(
      expect.objectContaining({ label: '九阳神功', matchedBy: 'alias' }),
    );
  });

  it('会按招式意象为未精确匹配的功法选择图标', () => {
    expect(resolveMartialArtIcon('天罡北斗阵', { ...baseArt, type: '外功' })).toEqual(
      expect.objectContaining({ category: '阵法', matchedBy: 'semantic' }),
    );
    expect(resolveMartialArtIcon('玄冥神掌', { ...baseArt, type: '拳掌' })).toEqual(
      expect.objectContaining({ category: '阴柔内功', matchedBy: 'semantic' }),
    );
    expect(resolveMartialArtIcon('虎爪绝户手', { ...baseArt, type: '拳掌' })).toEqual(
      expect.objectContaining({ category: '擒拿', matchedBy: 'semantic' }),
    );
    expect(resolveMartialArtIcon('边军断魂枪', { ...baseArt, type: '枪戟' })).toEqual(
      expect.objectContaining({ category: '枪戟', matchedBy: 'semantic' }),
    );
  });

  it('罗汉伏虎拳使用对应招式图而不是佛门通用特效', () => {
    const luohanFuhu = resolveMartialArtIcon('罗汉伏虎拳', { ...baseArt, type: '拳掌' });
    const buddhistInner = resolveMartialArtIcon('神足经', { ...baseArt, type: '内功' });

    expect(luohanFuhu).toEqual(expect.objectContaining({ category: '罗汉拳', label: '罗汉伏虎拳' }));
    expect(luohanFuhu.src).not.toBe(buddhistInner.src);
  });

  it('佛门功法按内功、护体、拳掌、指法和兵器分别取图', () => {
    const inner = resolveMartialArtIcon('神足经', { ...baseArt, type: '内功' });
    const guard = resolveMartialArtIcon('袈裟伏魔功', { ...baseArt, type: '外功' });
    const palm = resolveMartialArtIcon('大金刚掌', { ...baseArt, type: '拳掌' });
    const finger = resolveMartialArtIcon('拈花指', { ...baseArt, type: '指法' });
    const weapon = resolveMartialArtIcon('大韦陀杵', { ...baseArt, type: '棍锤' });

    expect(inner.category).toBe('佛门内功');
    expect(guard.category).toBe('佛门护体');
    expect(palm.category).toBe('佛门拳掌');
    expect(finger.category).toBe('佛门指法');
    expect(weapon.category).toBe('佛门重兵器');
    expect(new Set([inner.src, guard.src, palm.src, finger.src, weapon.src]).size).toBe(5);
  });

  it('功法库全部功法都有图标且不会落入未知兜底', () => {
    const resolved = martialArtsDatabase.功法.map(art =>
      resolveMartialArtIcon(art.功法名称, { ...baseArt, type: art.类型 }),
    );

    expect(resolved).toHaveLength(373);
    expect(resolved.every(icon => Boolean(icon.src))).toBe(true);
    expect(resolved.every(icon => icon.matchedBy !== 'fallback')).toBe(true);
    expect(new Set(resolved.map(icon => icon.src)).size).toBeGreaterThanOrEqual(20);
  });

  it('功法解析不会误用行囊书册图，并兼容旧功法类型', () => {
    expect(resolveMartialArtIcon('玉女心经', { ...baseArt, type: '内功' })).toEqual(
      expect.objectContaining({ matchedBy: 'type', category: '内功' }),
    );
    expect(resolveMartialArtIcon('太祖长拳', { ...baseArt, type: '拳脚' })).toEqual(
      expect.objectContaining({ matchedBy: 'semantic', category: '拳法' }),
    );
    expect(resolveMartialArtIcon('杨家枪法', { ...baseArt, type: '枪法' })).toEqual(
      expect.objectContaining({ matchedBy: 'semantic', category: '枪戟' }),
    );
  });

  it('物品按类型返回不同兜底图标', () => {
    expect(resolveInventoryIcon({ ...baseItem, type: 'EQUIP' })).toEqual(
      expect.objectContaining({ matchedBy: 'type' }),
    );
    expect(resolveInventoryIcon({ ...baseItem, type: 'SECRET' })).toEqual(
      expect.objectContaining({ matchedBy: 'type' }),
    );
    expect(resolveInventoryIcon({ ...baseItem, type: 'ELIXIR' })).toEqual(
      expect.objectContaining({ matchedBy: 'type' }),
    );
    expect(resolveInventoryIcon({ ...baseItem, type: 'MISC' })).toEqual(expect.objectContaining({ matchedBy: 'type' }));
  });

  it('按名称细分装备、药品和杂物外观', () => {
    expect(
      resolveInventoryIcon({
        ...baseItem,
        name: '铁沙掌套',
        type: 'EQUIP',
        rank: 'GREEN',
        equipInfo: { slot: '护甲' },
      }),
    ).toEqual(expect.objectContaining({ category: '护手', matchedBy: 'name' }));

    expect(resolveInventoryIcon({ ...baseItem, name: '少林金疮药', type: 'ELIXIR', rank: 'GREEN' })).toEqual(
      expect.objectContaining({ category: '药散', matchedBy: 'name' }),
    );

    expect(resolveInventoryIcon({ ...baseItem, name: '达摩心经残页', type: 'MISC', rank: 'BLUE' })).toEqual(
      expect.objectContaining({ category: '书信文书', matchedBy: 'name' }),
    );
  });

  it('同一细分类会按品阶选择不同资源', () => {
    const low = resolveInventoryIcon({ ...baseItem, name: '青锋剑', type: 'EQUIP', rank: 'WHITE' });
    const high = resolveInventoryIcon({ ...baseItem, name: '青锋剑', type: 'EQUIP', rank: 'GOLD' });

    expect(low.category).toBe('剑');
    expect(high.category).toBe('剑');
    expect(low.src).not.toBe(high.src);
  });

  it('人工审核选择优先于 AI 默认图', () => {
    expect(resolveInventoryIcon({ ...baseItem, name: '倚天剑', type: 'EQUIP', rank: 'GOLD' }).src).toBe(
      reviewedEquipSwordSupreme,
    );
    expect(resolveInventoryIcon({ ...baseItem, name: '屠龙刀', type: 'EQUIP', rank: 'RED' }).src).toBe(
      reviewedEquipSaberDivine,
    );
    expect(resolveInventoryIcon({ ...baseItem, name: '九转还魂丹', type: 'ELIXIR', rank: 'RED' }).src).toBe(
      reviewedMedicineElixirDivine,
    );
  });

  it('未审核的装备与杂物在六品阶都使用对应 AI 图', () => {
    const cases: Array<{
      item: InventoryItem;
      category: keyof typeof generatedInventoryAssets;
    }> = [
      { item: { ...baseItem, name: '丈八长枪', type: 'EQUIP' }, category: '枪戟' },
      { item: { ...baseItem, name: '盘龙棍', type: 'EQUIP' }, category: '棍棒' },
      { item: { ...baseItem, name: '铁胎弓', type: 'EQUIP' }, category: '弓' },
      { item: { ...baseItem, name: '开山斧', type: 'EQUIP' }, category: '斧' },
      { item: { ...baseItem, name: '八棱锤', type: 'EQUIP' }, category: '锤' },
      { item: { ...baseItem, name: '折扇', type: 'EQUIP' }, category: '扇' },
      { item: { ...baseItem, name: '九节鞭', type: 'EQUIP' }, category: '鞭' },
      { item: { ...baseItem, name: '玄铁护手', type: 'EQUIP' }, category: '护手' },
      { item: { ...baseItem, name: '梅花飞镖', type: 'EQUIP' }, category: '暗器' },
      { item: { ...baseItem, name: '锁子甲', type: 'EQUIP' }, category: '衣甲' },
      { item: { ...baseItem, name: '踏云履', type: 'EQUIP' }, category: '鞋履' },
      { item: { ...baseItem, name: '白玉佩', type: 'EQUIP' }, category: '饰品' },
      { item: { ...baseItem, name: '盟主令牌', type: 'MISC' }, category: '令牌印玺' },
      { item: { ...baseItem, name: '藏宝图', type: 'MISC' }, category: '地图' },
      { item: { ...baseItem, name: '掌门密信', type: 'MISC' }, category: '书信文书' },
      { item: { ...baseItem, name: '玄铁矿石', type: 'MISC' }, category: '矿石金属' },
      { item: { ...baseItem, name: '虎骨', type: 'MISC' }, category: '兽材' },
      { item: { ...baseItem, name: '翡翠珠', type: 'MISC' }, category: '珠玉' },
      { item: { ...baseItem, name: '百宝木匣', type: 'MISC' }, category: '容器杂具' },
      { item: { ...baseItem, name: '精巧机关锁', type: 'MISC' }, category: '机关奇物' },
      { item: { ...baseItem, name: '同门信物', type: 'MISC' }, category: '任务信物' },
    ];
    const ranks = ['WHITE', 'GREEN', 'BLUE', 'PURPLE', 'GOLD', 'RED'] as const;

    cases.forEach(({ item, category }) => {
      ranks.forEach((rank, rankIndex) => {
        expect(resolveInventoryIcon({ ...item, rank })).toEqual(
          expect.objectContaining({ category, src: generatedInventoryAssets[category][rankIndex] }),
        );
      });
    });
  });

  it('未审核且被否决的药品格改用国风 V3 AI 图', () => {
    expect(resolveInventoryIcon({ ...baseItem, name: '还魂丹', type: 'ELIXIR', rank: 'BLUE' }).src).toBe(
      generatedInventoryAssets.丹药[2],
    );
    expect(resolveInventoryIcon({ ...baseItem, name: '还魂丹', type: 'ELIXIR', rank: 'PURPLE' }).src).toBe(
      generatedInventoryAssets.丹药[3],
    );
  });

  it('行囊中的秘籍使用书册外观而不是招式特效图', () => {
    expect(resolveInventoryIcon({ ...baseItem, name: '九阳神功', type: 'SECRET', rank: 'RED' })).toEqual(
      expect.objectContaining({ category: '内功经诀', label: '内功经诀' }),
    );
  });

  it('未知功法返回通用兜底，品阶颜色稳定', () => {
    expect(resolveMartialArtIcon('不存在神功', { ...baseArt, type: '未知' })).toEqual(
      expect.objectContaining({ matchedBy: 'fallback' }),
    );
    expect(getRankVisual('BLUE')).toEqual(expect.objectContaining({ label: '珍品', color: '#60a5fa' }));
    expect(getRankVisual('上乘', 'martial')).toEqual(expect.objectContaining({ label: '上乘', color: '#60a5fa' }));
  });
});
