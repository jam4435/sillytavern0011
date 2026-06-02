/**
 * 地图数据加载工具
 * 负责加载和缓存地图数据
 */

import { MapData } from '../types';
import { gameLogger } from './logger';

let cachedMapData: MapData | null = null;

/**
 * 加载地图数据
 * @returns 地图数据对象
 */
export async function loadMapData(): Promise<MapData> {
  if (cachedMapData) {
    return cachedMapData;
  }

  try {
    const response = await fetch('/data/地图数据.json');
    if (!response.ok) {
      throw new Error(`加载地图数据失败: ${response.statusText}`);
    }
    const data = await response.json() as MapData;
    cachedMapData = data;
    return data;
  } catch (error) {
    gameLogger.error('加载地图数据失败:', error);
    // 返回空地图数据以防止应用崩溃
    return {};
  }
}

/**
 * 清除缓存的地图数据（用于开发/调试）
 */
export function clearMapCache(): void {
  cachedMapData = null;
}
