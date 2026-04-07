/**
 * 功法数据库模块
 *
 * 职责：
 * 1. 加载和管理功法数据库（从 data/_合并后功法.json）
 * 2. 提供功法信息补完功能
 * 3. 计算功法升级消耗
 * 4. 执行功法升级操作
 */

import { dataLogger } from './logger';

// ============================================
// 类型定义
// ============================================

/** 功法品阶 */
export type MartialArtsRank = '粗浅' | '传家' | '上乘' | '镇派' | '绝世' | '传说';

/** 掌握程度 */
export type MasteryLevel = '初窥门径' | '略有小成' | '融会贯通' | '炉火纯青' | '出神入化';

/** 功法类型 */
export type MartialArtsType = '内功' | '外功' | '轻功' | '剑法' | '刀法' | '拳掌' | '指法' | '暗器' | '枪戟' | '棍锤';

/** 战斗系数属性配置 */
export interface CombatAttribute {
  属性: string;
  系数: number;
  乘境界?: boolean;
}

/** 战斗系数配置 */
export interface CombatCoefficient {
  属性列表: CombatAttribute[];
}

/** 修炼限制 */
export interface TrainingRequirement {
  臂力?: number;
  根骨?: number;
  机敏?: number;
  悟性?: number;
  洞察?: number;
  风姿?: number;
  福缘?: number;
}

/** 功法数据库中的完整功法结构 */
export interface MartialArtData {
  功法名称: string;
  类型: string;
  功法品阶: MartialArtsRank;
  功法描述: string;
  修炼限制?: TrainingRequirement;
  战斗系数?: CombatCoefficient;
  特性?: Record<string, string>;
}

/** 功法数据库JSON结构 */
export interface MartialArtsDatabase {
  功法: MartialArtData[];
}

/** 变量中的简化功法结构（LLM写入） */
export interface SimpleMartialArt {
  掌握程度?: string;
  类型?: string;
  功法描述?: string;
  功法品阶?: string;
  特性?: Record<string, string>;
}

/** 补完后的完整功法结构（用于UI显示） */
export interface CompleteMartialArt {
  name: string;
  type: string;
  rank: MartialArtsRank;
  mastery: MasteryLevel;
  description: string;
  traits: Record<string, string>;
  unlockedTraits: Record<string, string>; // 已解锁的特性
  combatCoefficient?: CombatCoefficient;
  trainingRequirement?: TrainingRequirement;
  // 升级相关
  canUpgrade: boolean;
  upgradeCost: number;
  nextMastery: MasteryLevel | null;
}

/** 功法升级结果 */
export interface UpgradeResult {
  success: boolean;
  newMastery?: MasteryLevel;
  newCultivation?: number;
  error?: string;
}

// ============================================
// 常量定义
// ============================================

/** 掌握程度列表（按顺序） */
export const MASTERY_LEVELS: MasteryLevel[] = ['初窥门径', '略有小成', '融会贯通', '炉火纯青', '出神入化'];

/** 功法品阶列表（按顺序） */
export const RANK_LEVELS: MartialArtsRank[] = ['粗浅', '传家', '上乘', '镇派', '绝世', '传说'];

/** 品阶基础消耗（用于升级掌握程度） */
export const RANK_BASE_COST: Record<MartialArtsRank, number> = {
  粗浅: 100,
  传家: 300,
  上乘: 800,
  镇派: 1500,
  绝世: 4000,
  传说: 10000,
};

/** 升级系数（当前掌握程度 → 下一掌握程度） */
export const UPGRADE_MULTIPLIER: Record<MasteryLevel, number> = {
  初窥门径: 1, // 初窥门径 → 略有小成: ×1
  略有小成: 2, // 略有小成 → 融会贯通: ×2
  融会贯通: 4, // 融会贯通 → 炉火纯青: ×4
  炉火纯青: 8, // 炉火纯青 → 出神入化: ×8
  出神入化: 0, // 已满级，无法升级
};

/** 品阶对应的洞察基准点（用于洞察折扣计算） */
export const RANK_INSIGHT_BASELINE: Record<MartialArtsRank, number> = {
  粗浅: 0,
  传家: 4,
  上乘: 8,
  镇派: 12,
  绝世: 16,
  传说: 20,
};

/** 掌握程度系数（用于功法加成计算） */
export const MASTERY_COEFFICIENT: Record<MasteryLevel, number> = {
  初窥门径: 0.6,
  略有小成: 0.8,
  融会贯通: 1.0,
  炉火纯青: 1.2,
  出神入化: 1.5,
};

/** 品阶基础值（用于功法加成计算） */
export const RANK_BASE_VALUE: Record<MartialArtsRank, number> = {
  粗浅: 1,
  传家: 2,
  上乘: 4,
  镇派: 8,
  绝世: 15,
  传说: 25,
};

/** 品阶战斗系数总和 */
export const RANK_COMBAT_COEFFICIENT_SUM: Record<MartialArtsRank, number> = {
  粗浅: 0.6,
  传家: 0.8,
  上乘: 1.0,
  镇派: 1.2,
  绝世: 1.5,
  传说: 2.0,
};

// ============================================
// 功法数据库管理
// ============================================

/** 功法数据库缓存（功法名称 → 功法数据） */
let martialArtsCache: Map<string, MartialArtData> | null = null;

/** 数据库加载状态 */
let isLoading = false;
let loadError: string | null = null;

/**
 * 加载功法数据库
 * 从 data/_合并后功法.json 加载所有功法数据
 */
export async function loadMartialArtsDatabase(): Promise<boolean> {
  if (martialArtsCache !== null) {
    return true; // 已加载
  }

  if (isLoading) {
    // 等待加载完成
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (!isLoading) {
          clearInterval(checkInterval);
          resolve(martialArtsCache !== null);
        }
      }, 100);
    });
  }

  isLoading = true;
  loadError = null;

  try {
    // 使用动态 import 加载 JSON 文件
    const database = (await import('../data/_合并后功法.json')) as MartialArtsDatabase;

    martialArtsCache = new Map();

    for (const art of database.功法) {
      martialArtsCache.set(art.功法名称, art);
    }

    dataLogger.log(`[martialArtsDatabase] 功法数据库加载成功，共 ${martialArtsCache.size} 个功法`);
    isLoading = false;
    return true;
  } catch (error) {
    dataLogger.error('[martialArtsDatabase] 加载功法数据库失败:', error);
    loadError = error instanceof Error ? error.message : '加载失败';
    isLoading = false;
    return false;
  }
}

/**
 * 同步初始化功法数据库
 * 使用预加载的数据或触发异步加载
 */
export function initMartialArtsDatabase(): void {
  if (martialArtsCache !== null) {
    return;
  }

  // 触发异步加载
  loadMartialArtsDatabase().catch(error => {
    dataLogger.error('[martialArtsDatabase] 初始化加载失败:', error);
  });
}

/**
 * 手动设置功法数据库（用于测试或预加载场景）
 */
export function setMartialArtsDatabase(data: MartialArtData[]): void {
  martialArtsCache = new Map();
  for (const art of data) {
    martialArtsCache.set(art.功法名称, art);
  }
  dataLogger.log(`[martialArtsDatabase] 功法数据库设置成功，共 ${martialArtsCache.size} 个功法`);
}

/**
 * 获取功法数据库是否已加载
 */
export function isDatabaseLoaded(): boolean {
  return martialArtsCache !== null;
}

/**
 * 获取数据库加载错误信息
 */
export function getDatabaseError(): string | null {
  return loadError;
}

/**
 * 根据功法名称获取功法数据
 */
export function getMartialArtData(name: string): MartialArtData | null {
  if (!martialArtsCache) {
    // 数据库未加载，触发加载并返回 null
    initMartialArtsDatabase();
    return null;
  }
  return martialArtsCache.get(name) || null;
}

/**
 * 获取所有功法名称列表
 */
export function getAllMartialArtNames(): string[] {
  if (!martialArtsCache) {
    initMartialArtsDatabase();
    return [];
  }
  return Array.from(martialArtsCache.keys());
}

// ============================================
// 功法补完功能
// ============================================

/**
 * 补完功法信息
 * 根据功法名称从数据库获取完整信息，只保留变量中的掌握程度
 *
 * @param name 功法名称
 * @param simpleArt 变量中的简化功法结构
 * @param currentCultivation 当前修为（用于计算是否可升级）
 * @param insight 洞察值（用于计算升级折扣）
 * @returns 补完后的完整功法信息
 */
export function completeMartialArt(
  name: string,
  simpleArt: SimpleMartialArt,
  currentCultivation: number = 0,
  insight: number = 10,
): CompleteMartialArt {
  // 从数据库获取功法数据
  const dbData = getMartialArtData(name);

  // 解析掌握程度
  const mastery = parseMasteryLevel(simpleArt.掌握程度 || '初窥门径');

  // 如果数据库中有此功法，使用数据库数据
  if (dbData) {
    const rank = dbData.功法品阶;
    const traits = dbData.特性 || {};
    const unlockedTraits = getUnlockedTraits(traits, mastery);
    const { canUpgrade, cost, nextMastery } = calculateUpgradeInfo(rank, mastery, currentCultivation, insight);

    return {
      name,
      type: dbData.类型,
      rank,
      mastery,
      description: dbData.功法描述,
      traits,
      unlockedTraits,
      combatCoefficient: dbData.战斗系数,
      trainingRequirement: dbData.修炼限制,
      canUpgrade,
      upgradeCost: cost,
      nextMastery,
    };
  }

  // 数据库中没有此功法，使用变量中的数据（兜底）
  const rank = parseRank(simpleArt.功法品阶 || '粗浅');
  const traits = simpleArt.特性 || {};
  const unlockedTraits = getUnlockedTraits(traits, mastery);
  const { canUpgrade, cost, nextMastery } = calculateUpgradeInfo(rank, mastery, currentCultivation, insight);

  return {
    name,
    type: simpleArt.类型 || '未知',
    rank,
    mastery,
    description: simpleArt.功法描述 || '',
    traits,
    unlockedTraits,
    canUpgrade,
    upgradeCost: cost,
    nextMastery,
  };
}

/**
 * 批量补完功法
 * @param martialArts 变量中的功法对象
 * @param currentCultivation 当前修为
 * @param insight 洞察值
 */
export function completeMartialArts(
  martialArts: Record<string, SimpleMartialArt>,
  currentCultivation: number = 0,
  insight: number = 10,
): Record<string, CompleteMartialArt> {
  const result: Record<string, CompleteMartialArt> = {};

  for (const [name, art] of Object.entries(martialArts)) {
    // 跳过模板字段
    if (name.startsWith('$')) continue;

    result[name] = completeMartialArt(name, art, currentCultivation, insight);
  }

  return result;
}

// ============================================
// 升级消耗计算
// ============================================

/**
 * 计算洞察折扣
 * @param rank 功法品阶
 * @param insight 洞察值
 * @returns 折扣率（0.4 ~ 1.6，低于1表示消耗减少）
 */
export function calculateInsightDiscount(rank: MartialArtsRank, insight: number): number {
  const baseline = RANK_INSIGHT_BASELINE[rank];
  const deviation = insight - baseline;
  // 偏离值 × 5%，限制在 ±60%
  const discountRate = Math.max(-0.6, Math.min(0.6, deviation * 0.05));
  // 返回实际消耗比例（1 - 折扣率）
  return 1 - discountRate;
}

/**
 * 计算升级到下一掌握程度的修为消耗
 * @param rank 功法品阶
 * @param currentMastery 当前掌握程度
 * @param insight 洞察值
 * @returns 升级消耗，如果已满级返回 -1
 */
export function calculateUpgradeCost(
  rank: MartialArtsRank,
  currentMastery: MasteryLevel,
  insight: number = 10,
): number {
  // 已满级
  if (currentMastery === '出神入化') {
    return -1;
  }

  const baseCost = RANK_BASE_COST[rank];
  const multiplier = UPGRADE_MULTIPLIER[currentMastery];
  const insightDiscount = calculateInsightDiscount(rank, insight);

  return Math.floor(baseCost * multiplier * insightDiscount);
}

/**
 * 计算升级信息
 */
function calculateUpgradeInfo(
  rank: MartialArtsRank,
  mastery: MasteryLevel,
  cultivation: number,
  insight: number,
): { canUpgrade: boolean; cost: number; nextMastery: MasteryLevel | null } {
  const masteryIndex = MASTERY_LEVELS.indexOf(mastery);

  // 已满级
  if (masteryIndex >= MASTERY_LEVELS.length - 1) {
    return { canUpgrade: false, cost: 0, nextMastery: null };
  }

  const nextMastery = MASTERY_LEVELS[masteryIndex + 1];
  const cost = calculateUpgradeCost(rank, mastery, insight);
  const canUpgrade = cost > 0 && cultivation >= cost;

  return { canUpgrade, cost, nextMastery };
}

/**
 * 获取下一个掌握程度
 */
export function getNextMastery(current: MasteryLevel): MasteryLevel | null {
  const index = MASTERY_LEVELS.indexOf(current);
  if (index < 0 || index >= MASTERY_LEVELS.length - 1) {
    return null;
  }
  return MASTERY_LEVELS[index + 1];
}

// ============================================
// 功法升级执行
// ============================================

/**
 * 执行功法掌握程度升级
 * @param userName 用户名（变量表中的键名，此参数已废弃，保留用于兼容）
 * @param martialArtName 功法名称
 * @param currentMastery 当前掌握程度
 * @param currentCultivation 当前修为
 * @param rank 功法品阶
 * @param insight 洞察值
 */
export async function upgradeMartialArt(
  userName: string,
  martialArtName: string,
  currentMastery: MasteryLevel,
  currentCultivation: number,
  rank: MartialArtsRank,
  insight: number = 10,
): Promise<UpgradeResult> {
  // 计算升级消耗
  const cost = calculateUpgradeCost(rank, currentMastery, insight);

  if (cost < 0) {
    return {
      success: false,
      error: '此功法已达出神入化之境，无法再精进',
    };
  }

  if (currentCultivation < cost) {
    return {
      success: false,
      error: `修为不足，还需 ${cost - currentCultivation} 点修为`,
    };
  }

  const nextMastery = getNextMastery(currentMastery);
  if (!nextMastery) {
    return {
      success: false,
      error: '无法获取下一掌握程度',
    };
  }

  try {
    const newCultivation = currentCultivation - cost;

    // 使用酒馆 API 更新变量
    // 注意：变量路径是 stat_data.user数据.功法，而不是 stat_data.[用户名].武功
    updateVariablesWith(
      (variables: Record<string, unknown>) => {
        const statData = variables.stat_data as Record<string, unknown> | undefined;
        if (statData && statData['user数据']) {
          const user数据 = statData['user数据'] as Record<string, unknown>;

          // 更新修为
          user数据['修为'] = newCultivation;

          // 更新功法掌握程度
          const 功法 = user数据['功法'] as Record<string, Record<string, unknown>> | undefined;
          if (功法 && 功法[martialArtName]) {
            功法[martialArtName]['掌握程度'] = nextMastery;
          }
        }
        return variables;
      },
      { type: 'message', message_id: -1 },
    );

    dataLogger.log(
      `[martialArtsDatabase] 功法升级成功: ${martialArtName} ${currentMastery} -> ${nextMastery}, 消耗修为: ${cost}`,
    );

    return {
      success: true,
      newMastery: nextMastery,
      newCultivation,
    };
  } catch (error) {
    dataLogger.error('[martialArtsDatabase] 功法升级失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '更新变量失败',
    };
  }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 解析掌握程度字符串
 */
function parseMasteryLevel(str: string): MasteryLevel {
  if (MASTERY_LEVELS.includes(str as MasteryLevel)) {
    return str as MasteryLevel;
  }
  // 默认返回初窥门径
  return '初窥门径';
}

/**
 * 解析功法品阶字符串
 */
function parseRank(str: string): MartialArtsRank {
  if (RANK_LEVELS.includes(str as MartialArtsRank)) {
    return str as MartialArtsRank;
  }
  // 默认返回粗浅
  return '粗浅';
}

/**
 * 根据掌握程度获取已解锁的特性
 * 特性按掌握程度解锁：初窥门径、略有小成、融会贯通、炉火纯青、出神入化
 */
function getUnlockedTraits(allTraits: Record<string, string>, mastery: MasteryLevel): Record<string, string> {
  const masteryIndex = MASTERY_LEVELS.indexOf(mastery);
  const unlockedTraits: Record<string, string> = {};

  for (const [traitMastery, traitDesc] of Object.entries(allTraits)) {
    const traitMasteryIndex = MASTERY_LEVELS.indexOf(traitMastery as MasteryLevel);
    // 如果特性的掌握程度等级 <= 当前掌握程度等级，则已解锁
    if (traitMasteryIndex >= 0 && traitMasteryIndex <= masteryIndex) {
      unlockedTraits[traitMastery] = traitDesc;
    }
  }

  return unlockedTraits;
}

/**
 * 计算功法加成值
 * 功法加成 = 品阶基础值 × 掌握程度系数
 */
export function calculateMartialArtBonus(rank: MartialArtsRank, mastery: MasteryLevel): number {
  return RANK_BASE_VALUE[rank] * MASTERY_COEFFICIENT[mastery];
}

/**
 * 获取功法品阶颜色
 */
export function getRankColor(rank: MartialArtsRank): string {
  const colors: Record<MartialArtsRank, string> = {
    粗浅: '#a8a29e', // 灰色
    传家: '#4ade80', // 绿色
    上乘: '#60a5fa', // 蓝色
    镇派: '#c084fc', // 紫色
    绝世: '#fbbf24', // 金色
    传说: '#f87171', // 红色
  };
  return colors[rank];
}

/**
 * 获取掌握程度颜色
 */
export function getMasteryColor(mastery: MasteryLevel): string {
  const colors: Record<MasteryLevel, string> = {
    初窥门径: '#a8a29e', // 灰色
    略有小成: '#4ade80', // 绿色
    融会贯通: '#60a5fa', // 蓝色
    炉火纯青: '#c084fc', // 紫色
    出神入化: '#fbbf24', // 金色
  };
  return colors[mastery];
}
