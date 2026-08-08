/**
 * 地图工具函数
 * 提供地图相关的工具函数，如地点解锁检查等
 */

import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import {
  getLocationScopePath,
  parseLocationPath as parseStrictLocationPath,
} from '../../shared/locationPath.js';
import type { MapLocation } from '../types';
import { gameLogger } from './logger';

declare function getAllVariables(): Record<string, unknown>;

/**
 * 检查地点是否已解锁
 * @param locationPath 地点路径（格式：一级/二级/三级[/四级]）
 * @param location 地点数据
 * @param exploredLocations 已探索地点列表
 * @returns 是否已解锁
 */
export function isLocationUnlocked(locationPath: string, location: MapLocation, exploredLocations: string[]): boolean {
  const scopePath = getLocationScopePath(locationPath);
  // 1. 已探索的地点
  if (scopePath && exploredLocations.some(explored => getLocationScopePath(explored) === scopePath)) {
    return true;
  }

  // 2. 初始就探索的地点
  if (location.初始探索) {
    return true;
  }

  // 3. 无解锁条件的地点
  if (!location.解锁条件) {
    return true;
  }

  // 4. TODO: 实现基于事件的解锁检查
  // 需要在事件系统中添加 "已完成事件" 列表
  // 检查 location.解锁条件 是否在已完成事件中
  // const variables = getAllVariables();
  // const completedEvents = variables.stat_data?.user数据?.已完成事件 as string[] | undefined;
  // if (completedEvents && completedEvents.includes(location.解锁条件)) {
  //   return true;
  // }

  return false;
}

/**
 * 获取已探索地点列表
 * @returns 已探索地点列表
 */
export function getExploredLocations(): string[] {
  const variables = getAllVariables();
  const statData = variables.stat_data as { user数据?: Record<string, unknown> } | undefined;
  const user数据 = statData?.user数据;

  if (!user数据) {
    return [];
  }

  const exploredLocations = user数据.已探索地点 as string[] | undefined;
  return exploredLocations || [];
}

/** 从变量表读取玩家当前所在位置，用于生成地图指令。 */
export function getUserCurrentLocation(): string | null {
  const variables = getAllVariables();
  const statData = variables.stat_data as { user数据?: Record<string, unknown> } | undefined;
  const location = statData?.user数据?.所在位置;
  return typeof location === 'string' && location.trim() ? location.trim() : null;
}

/**
 * 添加已探索地点
 * @param locationPath 地点路径
 */
export async function addExploredLocation(locationPath: string): Promise<void> {
  const scopePath = getLocationScopePath(locationPath);
  if (!scopePath) {
    throw new Error(`无法记录无效地点路径：${locationPath}`);
  }
  const exploredLocations = getExploredLocations();

  // 如果已经探索过，不重复添加
  if (exploredLocations.some(explored => getLocationScopePath(explored) === scopePath)) {
    return;
  }

  // 添加到已探索列表
  const newExploredLocations = [...exploredLocations.map(getLocationScopePath).filter(Boolean), scopePath];

  // 使用 eventEmit 更新变量
  await emitSourcedEraVariableWriteAndWait({
    source: 'frontend',
    operation: 'update',
    reason: 'map-explored-location',
    eventName: 'era:updateByObject',
    attribution: 'background',
    detail: {
      stat_data: {
        user数据: {
          已探索地点: newExploredLocations,
        },
      },
    },
    expectedAction: 'apiWrite',
    timeoutMs: 3000,
    timeoutMessage: `地点 ${scopePath} 解锁请求已发出，但 ERA 没有确认写入完成。`,
  });

  gameLogger.log(`[mapUtils] 添加已探索地点: ${scopePath}`);
}

/**
 * 解析地点路径
 * @param locationPath 地点路径（格式：一级/二级/三级[/四级]）
 * @returns 解析后的路径对象
 */
export function parseLocationPath(locationPath: string): {
  area: string;
  region: string;
  location: string;
  scene: string | null;
  scopePath: string;
  fullPath: string;
} | null {
  const parsed = parseStrictLocationPath(locationPath);
  if (!parsed) {
    gameLogger.warn(`[mapUtils] 无效的地点路径: ${locationPath}`);
    return null;
  }

  return parsed;
}

/**
 * 构建地点路径
 * @param area 一级世界大域或政权
 * @param region 二级地图旅行区域
 * @param location 三级严格活动区
 * @returns 地点路径
 */
export function buildLocationPath(area: string, region: string, location: string): string {
  return `${area}/${region}/${location}`;
}
