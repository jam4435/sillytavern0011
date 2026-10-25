/**
 * 功法数值唯一常量来源，供功法数据库与属性计算共同使用。
 */
export type MartialArtsRank = '粗浅' | '传家' | '上乘' | '镇派' | '绝世' | '传说';
export type MasteryLevel = '初窥门径' | '略有小成' | '融会贯通' | '炉火纯青' | '出神入化';
export type MartialArtsType =
  | '内功' | '外功' | '轻功' | '剑法' | '刀法' | '拳掌'
  | '指法' | '暗器' | '枪戟' | '棍锤' | '鞭法';

export const MASTERY_LEVELS: MasteryLevel[] = ['初窥门径', '略有小成', '融会贯通', '炉火纯青', '出神入化'];
export const RANK_LEVELS: MartialArtsRank[] = ['粗浅', '传家', '上乘', '镇派', '绝世', '传说'];
export const RANK_BASE_COST: Record<MartialArtsRank, number> = {
  粗浅: 100, 传家: 300, 上乘: 800, 镇派: 1500, 绝世: 4000, 传说: 10000,
};
export const UPGRADE_MULTIPLIER: Record<MasteryLevel, number> = {
  初窥门径: 1, 略有小成: 2, 融会贯通: 4, 炉火纯青: 8, 出神入化: 0,
};
export const RANK_COMPREHENSION_BASELINE: Record<MartialArtsRank, number> = {
  粗浅: 0, 传家: 4, 上乘: 8, 镇派: 12, 绝世: 16, 传说: 20,
};
export const MASTERY_COEFFICIENT: Record<MasteryLevel, number> = {
  初窥门径: 0.6, 略有小成: 0.8, 融会贯通: 1.0, 炉火纯青: 1.2, 出神入化: 1.5,
};
export const RANK_BASE_VALUE: Record<MartialArtsRank, number> = {
  粗浅: 1, 传家: 2, 上乘: 4, 镇派: 8, 绝世: 15, 传说: 25,
};
export const RANK_COMBAT_COEFFICIENT_SUM: Record<MartialArtsRank, number> = {
  粗浅: 0.6, 传家: 0.8, 上乘: 1.0, 镇派: 1.2, 绝世: 1.5, 传说: 2.0,
};
