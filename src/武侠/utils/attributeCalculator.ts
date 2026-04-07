/**
 * 属性计算模块
 * 负责根据初始属性、境界、功法计算战斗属性和资源属性
 */
import type { InitialAttributes } from '../types';

// ============ 常量定义 ============

// 大境界系数
export const MAJOR_REALM_COEF: Record<string, number> = {
  不入流: 1,
  三流: 10,
  二流: 100,
  一流: 1000,
  宗师: 10000,
  绝顶: 50000,
  陆地神仙: 100000,
};

// 小境界系数
export const MINOR_REALM_COEF: Record<string, number> = {
  初期: 1.0,
  中期: 1.2,
  后期: 1.4,
  圆满: 1.6,
};

// 品阶基础值
export const RANK_BASE: Record<string, number> = {
  粗浅: 1,
  传家: 2,
  上乘: 4,
  镇派: 8,
  绝世: 15,
  传说: 25,
};

// 掌握程度系数
export const MASTERY_COEF: Record<string, number> = {
  初窥门径: 0.6,
  略有小成: 0.8,
  融会贯通: 1.0,
  炉火纯青: 1.2,
  出神入化: 1.5,
};

// 境界隐含保底
export const REALM_IMPLIED_BONUS: Record<string, number> = {
  不入流: 0,
  三流: 0.6,
  二流: 2.0,
  一流: 4.0,
  宗师: 8.0,
  绝顶: 15.0,
  陆地神仙: 25.0,
};

// ============ 类型定义 ============

export interface CombatAttributes {
  臂力: number;
  根骨: number;
  机敏: number;
  洞察: number;
}

export interface ResourceAttributes {
  气血上限: number;
  内力上限: number;
}

export interface RealmInfo {
  major: string;
  minor: string;
}

export interface MartialArtForCalculation {
  type: string;
  rank: string;
  mastery: string;
}

// ============ 核心函数 ============

/**
 * 解析境界字符串
 */
export function parseRealm(realm: string): RealmInfo {
  // 处理 "绝顶-圆满" 格式
  if (realm.includes('-')) {
    const parts = realm.split('-');
    return {
      major: parts[0] || '不入流',
      minor: parts[1] || '初期',
    };
  }

  // 处理 "绝顶圆满" 格式（无分隔符）
  const minorRealms = ['初期', '中期', '后期', '圆满'];
  for (const minor of minorRealms) {
    if (realm.endsWith(minor)) {
      return {
        major: realm.slice(0, -minor.length) || '不入流',
        minor: minor,
      };
    }
  }

  // 只有大境界，默认初期
  return {
    major: realm || '不入流',
    minor: '初期',
  };
}

/**
 * 计算境界系数
 */
export function getRealmCoefficient(realm: string): number {
  const { major, minor } = parseRealm(realm);
  return (MAJOR_REALM_COEF[major] || 1) * (MINOR_REALM_COEF[minor] || 1.0);
}

/**
 * 计算功法加成
 */
export function calculateMartialArtBonus(rank: string, mastery: string): number {
  return (RANK_BASE[rank] || 1) * (MASTERY_COEF[mastery] || 0.6);
}

/**
 * 计算战斗属性
 */
export function calculateCombatAttributes(initial: InitialAttributes, realm: string): CombatAttributes {
  const realmCoef = getRealmCoefficient(realm);

  return {
    臂力: Math.floor(initial.臂力 * realmCoef),
    根骨: Math.floor(initial.根骨 * realmCoef),
    机敏: Math.floor(initial.机敏 * realmCoef),
    洞察: Math.floor(initial.洞察 * realmCoef),
  };
}

/**
 * 计算资源属性（气血/内力）
 */
export function calculateResources(
  combatRoot: number,
  martialArts: Record<string, MartialArtForCalculation>,
  majorRealm: string,
): ResourceAttributes {
  // 计算显性功法加成
  let explicitInner = 0;
  let explicitOuter = 0;

  for (const art of Object.values(martialArts)) {
    const bonus = calculateMartialArtBonus(art.rank, art.mastery);
    if (art.type === '内功') {
      explicitInner += bonus;
    } else if (art.type === '外功') {
      explicitOuter += bonus;
    }
  }

  // 应用境界保底
  const impliedBonus = REALM_IMPLIED_BONUS[majorRealm] || 0;
  const finalInner = Math.max(explicitInner, impliedBonus);
  const finalOuter = Math.max(explicitOuter, impliedBonus);

  return {
    气血上限: Math.floor(combatRoot * (1 + finalOuter)),
    内力上限: Math.floor(combatRoot * (1 + finalInner)),
  };
}

/**
 * 完整的属性计算入口
 */
export function calculateAllAttributes(
  initial: InitialAttributes,
  realm: string,
  martialArts: Record<string, MartialArtForCalculation>,
): {
  combat: CombatAttributes;
  resources: ResourceAttributes;
} {
  const { major } = parseRealm(realm);
  const combat = calculateCombatAttributes(initial, realm);
  const resources = calculateResources(combat.根骨, martialArts, major);

  return { combat, resources };
}
