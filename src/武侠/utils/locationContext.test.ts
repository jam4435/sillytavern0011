import { describe, expect, it } from 'vitest';
import type { MapData, MapRegion } from '../types';
import { buildDynamicLocationContext, formatDynamicLocationConstraint } from './locationContext';

function createRegion(x: number, y: number, locationNames: string[]): MapRegion {
  return {
    描述: '测试区域',
    类型: '中区域',
    坐标: { x, y },
    地点: Object.fromEntries(
      locationNames.map(name => [
        name,
        {
          描述: '测试地点',
          坐标: { x, y },
          初始探索: true,
        },
      ]),
    ),
  };
}

const mapData: MapData = {
  大宋: {
    描述: '测试',
    类型: '大区域',
    坐标: { x: 0, y: 0 },
    子区域: {
      临安府: createRegion(0, 0, ['牛家村', '西湖']),
      嘉兴府: createRegion(10, 0, ['烟雨楼']),
    },
  },
  金国: {
    描述: '测试',
    类型: '大区域',
    坐标: { x: 30, y: 0 },
    子区域: {
      中都: createRegion(30, 0, ['王府', '牛家村']),
    },
  },
};

describe('locationContext', () => {
  it('从二级/三级相对路径解析当前区域，并生成三级地点和相邻二级地点白名单', () => {
    const context = buildDynamicLocationContext(mapData, '临安府/牛家村', 1);

    expect(context.currentRegions.map(region => region.path)).toEqual(['大宋/临安府']);
    expect(context.adjacentRegions.map(region => region.path)).toEqual(['大宋/嘉兴府']);
    expect(context.allowedLocationPaths).toEqual([
      '大宋/临安府/牛家村',
      '大宋/临安府/西湖',
      '大宋/嘉兴府',
    ]);
  });

  it('同名三级地点会保留所有二级地点候选，避免任意选择错误区域', () => {
    const context = buildDynamicLocationContext(mapData, '牛家村', 1);

    expect(context.ambiguous).toBe(true);
    expect(context.currentRegions.map(region => region.path)).toEqual(['大宋/临安府', '金国/中都']);
    expect(context.allowedLocationPaths).toContain('大宋/临安府/西湖');
    expect(context.allowedLocationPaths).toContain('金国/中都/王府');
  });

  it('无法解析当前位置时明确禁止模型修改位置', () => {
    const prompt = formatDynamicLocationConstraint(buildDynamicLocationContext(mapData, '江湖', 1));

    expect(prompt).toContain('当前值无法在地点表中定位');
    expect(prompt).toContain('本轮不得修改 user数据.所在位置');
  });
});
