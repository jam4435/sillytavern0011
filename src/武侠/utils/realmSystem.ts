/**
 * 境界系统 - 定义武侠世界的境界体系和升级逻辑
 *
 * 大境界: 不入流 → 三流 → 二流 → 一流 → 宗师 → 绝顶 → 陆地神仙
 * 小境界: 初期 → 中期 → 后期 → 圆满
 */

import { gameLogger } from './logger';

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
 * 设计理念：
 * - 不入流: 入门阶段，消耗较少
 * - 三流: 初入江湖，逐渐增加
 * - 二流: 小有所成
 * - 一流: 高手境界
 * - 宗师: 顶级高手
 * - 绝顶: 传说级别
 * - 陆地神仙: 超凡入圣
 */
export const REALM_CULTIVATION_COST: Record<MajorRealm, Record<MinorRealm, number>> = {
  不入流: {
    初期: 0, // 起始境界，无需消耗
    中期: 10,
    后期: 20,
    圆满: 30,
  },
  三流: {
    初期: 50, // 从不入流圆满突破到三流初期
    中期: 80,
    后期: 120,
    圆满: 160,
  },
  二流: {
    初期: 250,
    中期: 350,
    后期: 500,
    圆满: 700,
  },
  一流: {
    初期: 1000,
    中期: 1500,
    后期: 2200,
    圆满: 3000,
  },
  宗师: {
    初期: 5000,
    中期: 8000,
    后期: 12000,
    圆满: 18000,
  },
  绝顶: {
    初期: 30000,
    中期: 50000,
    后期: 80000,
    圆满: 120000,
  },
  陆地神仙: {
    初期: 200000,
    中期: 350000,
    后期: 550000,
    圆满: 999999, // 最高境界，无法再突破
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
 * 总共 7 个大境界 × 4 个小境界 = 28 级
 * @param realmStr 境界字符串
 * @returns 0-27 的等级数
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
 * 使用酒馆的 updateVariablesWith API 更新变量
 *
 * @param userName 用户名（变量表中的键名）
 * @param currentRealm 当前境界
 * @param currentCultivation 当前修为
 * @returns 突破结果
 */
export async function performBreakthrough(
  userName: string,
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

    // 使用酒馆 API 更新变量
    // 需要更新 stat_data 下的用户档案中的境界和修为字段
    updateVariablesWith(
      (variables: Record<string, unknown>) => {
        const statData = variables.stat_data as Record<string, unknown> | undefined;
        if (statData && statData[userName]) {
          const userProfile = statData[userName] as Record<string, unknown>;
          userProfile['境界'] = newRealm;
          userProfile['修为'] = newCultivation;
        }
        return variables;
      },
      { type: 'message', message_id: -1 },
    );

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
