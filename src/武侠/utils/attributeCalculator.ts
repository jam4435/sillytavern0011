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

export interface AttributeModifierMap {
  [attribute: string]: number;
}

export type AttributeModifierKind = '装备' | '回复' | '临时增幅' | '永久增幅' | '未封顶';

export interface AttributeModifierSource {
  id?: string;
  kind?: AttributeModifierKind;
  rank?: string;
  modifiers?: AttributeModifierMap;
}

export type AttributeModifierInput = AttributeModifierMap | AttributeModifierSource[];

const REFERENCE_INITIAL_ATTRIBUTES: InitialAttributes = {
  臂力: 10,
  根骨: 10,
  机敏: 10,
  悟性: 10,
  洞察: 10,
  风姿: 10,
  福缘: 0,
};

const ORDINARY_RANK_BY_INPUT: Record<string, string> = {
  WHITE: '凡品',
  GREEN: '精品',
  BLUE: '珍品',
  PURPLE: '极品',
  GOLD: '绝品',
  RED: '神品',
  凡品: '凡品',
  精品: '精品',
  珍品: '珍品',
  极品: '极品',
  绝品: '绝品',
  神品: '神品',
  粗浅: '凡品',
  传家: '精品',
  上乘: '珍品',
  镇派: '极品',
  绝世: '绝品',
  传说: '神品',
};

const RANK_REFERENCE_REALM: Record<string, string> = {
  凡品: '不入流圆满',
  精品: '三流圆满',
  珍品: '二流圆满',
  极品: '一流圆满',
  绝品: '宗师圆满',
  神品: '绝顶圆满',
};

const MODIFIER_CAP_PERCENT: Record<Exclude<AttributeModifierKind, '未封顶'>, Record<string, number>> = {
  装备: {
    凡品: 5,
    精品: 10,
    珍品: 18,
    极品: 30,
    绝品: 45,
    神品: 70,
  },
  回复: {
    凡品: 20,
    精品: 40,
    珍品: 70,
    极品: 100,
    绝品: 150,
    神品: 200,
  },
  临时增幅: {
    凡品: 10,
    精品: 18,
    珍品: 30,
    极品: 50,
    绝品: 75,
    神品: 110,
  },
  永久增幅: {
    凡品: 0,
    精品: 0,
    珍品: 18,
    极品: 35,
    绝品: 65,
    神品: 120,
  },
};

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

export function canonicalModifierAttribute(attribute: string): string {
  if (attribute === '气血') return '气血上限';
  if (attribute === '内力') return '内力上限';
  return attribute;
}

function normalizeOrdinaryRank(rank?: string): string | undefined {
  if (!rank) {
    return undefined;
  }
  return ORDINARY_RANK_BY_INPUT[rank];
}

function getModifierCapPercent(kind: AttributeModifierKind | undefined, rank?: string): number | undefined {
  if (!kind || kind === '未封顶') {
    return undefined;
  }
  const normalizedRank = normalizeOrdinaryRank(rank);
  return normalizedRank ? MODIFIER_CAP_PERCENT[kind]?.[normalizedRank] : undefined;
}

export function calculateReferenceAttributeBase(attribute: string, rank?: string): number {
  const normalizedRank = normalizeOrdinaryRank(rank) || '凡品';
  const referenceRealm = RANK_REFERENCE_REALM[normalizedRank] || RANK_REFERENCE_REALM.凡品;
  const { major } = parseRealm(referenceRealm);
  const referenceCombat = calculateCombatAttributes(REFERENCE_INITIAL_ATTRIBUTES, referenceRealm);
  const referenceResources = calculateResources(referenceCombat.根骨, {}, major);
  const canonical = canonicalModifierAttribute(attribute);

  if (canonical === '气血上限') {
    return referenceResources.气血上限;
  }
  if (canonical === '内力上限') {
    return referenceResources.内力上限;
  }
  return referenceCombat[canonical as keyof CombatAttributes] ?? 0;
}

export function calculateCappedModifierDelta(
  baseValue: number,
  modifierPercentage: number,
  rank?: string,
  kind: AttributeModifierKind = '未封顶',
  attribute: string = '',
): number {
  if (!Number.isFinite(baseValue) || !Number.isFinite(modifierPercentage)) {
    return 0;
  }

  const theoreticalDelta = Math.floor((baseValue * modifierPercentage) / 100);
  if (modifierPercentage <= 0) {
    return theoreticalDelta;
  }

  const capPercent = getModifierCapPercent(kind, rank);
  if (!Number.isFinite(capPercent)) {
    return theoreticalDelta;
  }

  const referenceBase = calculateReferenceAttributeBase(attribute, rank);
  const cappedDelta = Math.floor((referenceBase * Number(capPercent)) / 100);
  return Math.min(theoreticalDelta, cappedDelta);
}

function normalizeModifierMap(modifiers?: AttributeModifierMap): AttributeModifierMap | undefined {
  if (!modifiers) {
    return undefined;
  }

  const normalized: AttributeModifierMap = {};
  for (const [attribute, value] of Object.entries(modifiers)) {
    if (!attribute || !Number.isFinite(value)) {
      continue;
    }
    const canonical = canonicalModifierAttribute(attribute);
    normalized[canonical] = (normalized[canonical] ?? 0) + value;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function toModifierSources(input?: AttributeModifierInput): AttributeModifierSource[] {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input.flatMap(source => {
      const modifiers = normalizeModifierMap(source.modifiers);
      return modifiers ? [{ ...source, modifiers }] : [];
    });
  }
  const modifiers = normalizeModifierMap(input);
  return modifiers ? [{ kind: '未封顶', modifiers }] : [];
}

function applySourceModifiers<T extends object>(
  baseValues: T,
  sources: AttributeModifierSource[],
): T {
  const baseRecord = baseValues as Record<string, number>;
  const deltas: Record<string, number> = Object.fromEntries(Object.keys(baseRecord).map(attribute => [attribute, 0]));

  for (const source of sources) {
    const modifiers = source.modifiers;
    if (!modifiers) {
      continue;
    }

    for (const [attribute, percentage] of Object.entries(modifiers)) {
      if (!Object.hasOwn(baseRecord, attribute)) {
        continue;
      }
      const baseValue = baseRecord[attribute];
      const delta = calculateCappedModifierDelta(baseValue, percentage, source.rank, source.kind, attribute);
      deltas[attribute] = (deltas[attribute] ?? 0) + delta;
    }
  }

  return Object.fromEntries(
    Object.entries(baseRecord).map(([attribute, value]) => [
      attribute,
      Math.max(0, Math.floor(Number(value) + Number(deltas[attribute] ?? 0))),
    ]),
  ) as T;
}

/**
 * 属性修正中的数字表示百分比点。数组输入会按来源独立封顶后相加；单个 map 输入保持未封顶兼容。
 */
export function applyAttributeModifiers(
  combat: CombatAttributes,
  resources: ResourceAttributes,
  modifiers?: AttributeModifierInput,
): {
  combat: CombatAttributes;
  resources: ResourceAttributes;
} {
  const sources = toModifierSources(modifiers);
  if (sources.length === 0) {
    return { combat, resources };
  }

  return {
    combat: applySourceModifiers(combat, sources),
    resources: applySourceModifiers(resources, sources),
  };
}

/**
 * 完整的属性计算入口
 */
export function calculateAllAttributes(
  initial: InitialAttributes,
  realm: string,
  martialArts: Record<string, MartialArtForCalculation>,
  modifiers?: AttributeModifierInput,
): {
  combat: CombatAttributes;
  resources: ResourceAttributes;
} {
  const { major } = parseRealm(realm);
  const combat = calculateCombatAttributes(initial, realm);
  const resources = calculateResources(combat.根骨, martialArts, major);

  return applyAttributeModifiers(combat, resources, modifiers);
}
