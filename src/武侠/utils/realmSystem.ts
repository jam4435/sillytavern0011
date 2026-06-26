/**
 * 境界系统 - 定义武侠世界的境界体系和升级逻辑
 *
 * 大境界: 不入流 → 三流 → 二流 → 一流 → 宗师 → 绝顶 → 陆地神仙
 * 小境界: 初期 → 中期 → 后期 → 圆满
 */

import { gameLogger } from './logger';
import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';

// 大境界列表（按顺序）
export const MAJOR_REALMS = ['不入流', '三流', '二流', '一流', '宗师', '绝顶', '陆地神仙'] as const;

// 小境界列表（按顺序）
export const MINOR_REALMS = ['初期', '中期', '后期', '圆满'] as const;

export type MajorRealm = (typeof MAJOR_REALMS)[number];
export type MinorRealm = (typeof MINOR_REALMS)[number];

// 完整境界格式: "大境界小境界" 例如 "三流初期"
export interface RealmInfo {
  major: MajorRealm;
  minor: MinorRealm;
  majorIndex: number;
  minorIndex: number;
  displayName: string;
}

/**
 * 各大境界下，每个小境界突破所需的修为
 * 例如：三流初期 → 三流中期 需要消耗 REALM_CULTIVATION_COST['三流']['中期'] 点修为
 *
 * 数值以《修为境界功法属性战斗的体系架构》§1.3「境界升级消耗表」为唯一权威：
 * 消耗值为进入该目标境界/阶段所需的修为。
 *
 * 特例：不入流无小境界划分，500 修为直接突破到三流初期（见 getNextRealm 的不入流特例）。
 * 因此不入流行的中期/后期/圆满不会被读到，保留 0 仅为满足 Record 类型完整。
 *
 * 设计理念：
 * - 不入流: 入门阶段，无小境界，500 突破到三流初期
 * - 三流: 初入江湖，逐渐增加
 * - 二流: 小有所成
 * - 一流: 高手境界
 * - 宗师: 顶级高手
 * - 绝顶: 传说级别
 * - 陆地神仙: 超凡入圣
 */
export const REALM_CULTIVATION_COST: Record<MajorRealm, Record<MinorRealm, number>> = {
  不入流: {
    // 不入流无小境界：getNextRealm 对不入流特例直接返回三流初期，不会读到这三项。
    初期: 0,
    中期: 0,
    后期: 0,
    圆满: 0,
  },
  三流: {
    初期: 500, // 从不入流突破到三流初期
    中期: 700,
    后期: 900,
    圆满: 1200,
  },
  二流: {
    初期: 1500,
    中期: 2000,
    后期: 2800,
    圆满: 4000,
  },
  一流: {
    初期: 6000,
    中期: 10000,
    后期: 15000,
    圆满: 25000,
  },
  宗师: {
    初期: 40000,
    中期: 60000,
    后期: 90000,
    圆满: 140000,
  },
  绝顶: {
    初期: 200000,
    中期: 300000,
    后期: 450000,
    圆满: 650000,
  },
  陆地神仙: {
    初期: 800000,
    中期: 900000,
    后期: 950000,
    圆满: 1000000, // 最高境界，无法再突破
  },
};

/**
 * 解析境界字符串为结构化信息
 * @param realmStr 境界字符串，如 "三流初期"、"一流"（默认初期）
 * @returns RealmInfo 或 null（如果解析失败）
 */
export function parseRealm(realmStr: string): RealmInfo | null {
  if (!realmStr) return null;

  // 尝试匹配 "大境界小境界" 格式
  for (let i = 0; i < MAJOR_REALMS.length; i++) {
    const major = MAJOR_REALMS[i];
    if (realmStr.startsWith(major)) {
      const remaining = realmStr.slice(major.length);

      // 如果没有小境界，默认为初期
      if (!remaining) {
        return {
          major,
          minor: '初期',
          majorIndex: i,
          minorIndex: 0,
          displayName: `${major}初期`,
        };
      }

      // 查找小境界
      const minorIndex = MINOR_REALMS.indexOf(remaining as MinorRealm);
      if (minorIndex !== -1) {
        return {
          major,
          minor: MINOR_REALMS[minorIndex],
          majorIndex: i,
          minorIndex,
          displayName: `${major}${MINOR_REALMS[minorIndex]}`,
        };
      }
    }
  }

  // 如果只是大境界名称
  const majorIndex = MAJOR_REALMS.indexOf(realmStr as MajorRealm);
  if (majorIndex !== -1) {
    return {
      major: MAJOR_REALMS[majorIndex],
      minor: '初期',
      majorIndex,
      minorIndex: 0,
      displayName: `${MAJOR_REALMS[majorIndex]}初期`,
    };
  }

  return null;
}

/**
 * 获取下一个境界
 * @param current 当前境界信息
 * @returns 下一个境界信息，如果已是最高境界则返回 null
 */
export function getNextRealm(current: RealmInfo): RealmInfo | null {
  // 不入流无小境界划分：直接突破到三流初期（规则文档 §1.3）
  if (current.major === '不入流') {
    return {
      major: '三流',
      minor: '初期',
      majorIndex: 1,
      minorIndex: 0,
      displayName: '三流初期',
    };
  }

  // 检查是否已是最高境界
  if (current.majorIndex === MAJOR_REALMS.length - 1 && current.minorIndex === MINOR_REALMS.length - 1) {
    return null;
  }

  // 小境界还能提升
  if (current.minorIndex < MINOR_REALMS.length - 1) {
    const nextMinorIndex = current.minorIndex + 1;
    return {
      major: current.major,
      minor: MINOR_REALMS[nextMinorIndex],
      majorIndex: current.majorIndex,
      minorIndex: nextMinorIndex,
      displayName: `${current.major}${MINOR_REALMS[nextMinorIndex]}`,
    };
  }

  // 需要突破到下一个大境界
  if (current.majorIndex < MAJOR_REALMS.length - 1) {
    const nextMajorIndex = current.majorIndex + 1;
    return {
      major: MAJOR_REALMS[nextMajorIndex],
      minor: '初期',
      majorIndex: nextMajorIndex,
      minorIndex: 0,
      displayName: `${MAJOR_REALMS[nextMajorIndex]}初期`,
    };
  }

  return null;
}

/**
 * 获取突破到下一境界所需的修为
 * @param current 当前境界信息
 * @returns 所需修为数量，如果已是最高境界返回 -1
 */
export function getBreakthroughCost(current: RealmInfo): number {
  const next = getNextRealm(current);
  if (!next) return -1;

  // 获取下一境界的消耗
  return REALM_CULTIVATION_COST[next.major][next.minor];
}

/**
 * 检查是否可以突破
 * @param currentRealm 当前境界字符串
 * @param cultivation 当前修为
 * @returns { canBreak: boolean; cost: number; nextRealm: string | null; reason?: string }
 */
export function checkBreakthrough(
  currentRealm: string,
  cultivation: number,
): {
  canBreak: boolean;
  cost: number;
  nextRealm: string | null;
  reason?: string;
} {
  const current = parseRealm(currentRealm);

  if (!current) {
    return {
      canBreak: false,
      cost: 0,
      nextRealm: null,
      reason: '无法识别当前境界',
    };
  }

  const next = getNextRealm(current);

  if (!next) {
    return {
      canBreak: false,
      cost: 0,
      nextRealm: null,
      reason: '已达至境巅峰，无法再突破',
    };
  }

  const cost = getBreakthroughCost(current);

  if (cultivation < cost) {
    return {
      canBreak: false,
      cost,
      nextRealm: next.displayName,
      reason: `修为不足，还需 ${cost - cultivation} 点修为`,
    };
  }

  return {
    canBreak: true,
    cost,
    nextRealm: next.displayName,
  };
}

/**
 * 获取境界的颜色（用于UI显示）
 * @param realmStr 境界字符串
 * @returns 颜色代码
 */
export function getRealmColor(realmStr: string): string {
  const realm = parseRealm(realmStr);
  if (!realm) return '#a8a29e'; // 默认灰色

  const colors: Record<MajorRealm, string> = {
    不入流: '#a8a29e', // 石灰色
    三流: '#4ade80', // 绿色
    二流: '#60a5fa', // 蓝色
    一流: '#c084fc', // 紫色
    宗师: '#fbbf24', // 金色
    绝顶: '#f87171', // 红色
    陆地神仙: '#e879f9', // 粉紫色（仙气）
  };

  return colors[realm.major];
}

/**
 * 获取境界等级（用于比较和进度条）
 * 共 25 级：不入流为单阶段（1 级），其余 6 个大境界 × 4 个小境界（24 级）。
 * @param realmStr 境界字符串
 * @returns 0-24 的等级数
 */
export function getRealmLevel(realmStr: string): number {
  const realm = parseRealm(realmStr);
  if (!realm) return 0;

  return realm.majorIndex * 4 + realm.minorIndex;
}

/**
 * 获取在当前大境界内的进度百分比
 * @param realmStr 境界字符串
 * @returns 0-100 的百分比
 */
export function getMinorRealmProgress(realmStr: string): number {
  const realm = parseRealm(realmStr);
  if (!realm) return 0;

  // 每个小境界占 25%
  return (realm.minorIndex + 1) * 25;
}

/**
 * 执行境界突破
 * 使用 ERA 对象 API 更新 user 数据下的境界和修为
 *
 * @param currentRealm 当前境界
 * @param currentCultivation 当前修为
 * @returns 突破结果
 */
export async function performBreakthrough(
  currentRealm: string,
  currentCultivation: number,
): Promise<{
  success: boolean;
  newRealm?: string;
  newCultivation?: number;
  error?: string;
}> {
  // 检查是否可以突破
  const check = checkBreakthrough(currentRealm, currentCultivation);

  if (!check.canBreak) {
    return {
      success: false,
      error: check.reason || '无法突破',
    };
  }

  try {
    // 计算新的修为值
    const newCultivation = currentCultivation - check.cost;
    const newRealm = check.nextRealm!;
    const updatePayload = {
      stat_data: {
        user数据: {
          境界: newRealm,
          修为: newCultivation,
        },
      },
    };

    await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'realm-breakthrough',
      eventName: 'era:updateByObject',
      attribution: 'background',
      detail: updatePayload,
      timeoutMs: 20000,
      timeoutMessage: `境界突破到「${newRealm}」的请求已发出，但 ERA 没有确认 apiWrite 写入完成。`,
      expectedAction: 'apiWrite',
    });

    gameLogger.log(`[realmSystem] 境界突破成功: ${currentRealm} -> ${newRealm}, 消耗修为: ${check.cost}`);

    return {
      success: true,
      newRealm,
      newCultivation,
    };
  } catch (error) {
    gameLogger.error('[realmSystem] 境界突破失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '更新变量失败',
    };
  }
}

/**
 * 获取境界突破提示信息
 * @param currentRealm 当前境界
 * @param cultivation 当前修为
 * @returns 提示信息
 */
export function getBreakthroughTooltip(currentRealm: string, cultivation: number): string {
  const check = checkBreakthrough(currentRealm, cultivation);

  if (!check.nextRealm) {
    return '已达至境巅峰，天地为尊';
  }

  if (check.canBreak) {
    return `可突破至 ${check.nextRealm}\n消耗修为: ${check.cost}`;
  }

  return `距离突破至 ${check.nextRealm}\n需要修为: ${check.cost}\n当前修为: ${cultivation}\n还差: ${check.cost - cultivation}`;
}
