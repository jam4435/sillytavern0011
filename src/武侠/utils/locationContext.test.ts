import { describe, expect, it, vi } from 'vitest';
import type { MapData, MapRegion } from '../types';

vi.mock('./mapLoader', () => ({
  loadMapData: vi.fn(),
}));

import { loadMapData } from './mapLoader';
import {
  buildDynamicLocationContext,
  collectEventTargetPaths,
  createDynamicLocationContextVariable,
  extractExplicitMapTargetsFromText,
  formatDynamicLocationConstraint,
  syncDynamicLocationContextVariable,
} from './locationContext';

const loadMapDataMock = vi.mocked(loadMapData);
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const updateVariablesWithMock = globalThis.updateVariablesWith as ReturnType<typeof vi.fn>;

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
  it('从四级完整路径解析前三段活动区，并展开当前与相邻区域的三级白名单', () => {
    const context = buildDynamicLocationContext(mapData, '大宋/临安府/牛家村/村西树林', 1);

    expect(context.currentLocation).toBe('大宋/临安府/牛家村/村西树林');
    expect(context.currentScopePath).toBe('大宋/临安府/牛家村');
    expect(context.currentRegions.map(region => region.path)).toEqual(['大宋/临安府']);
    expect(context.adjacentRegions.map(region => region.path)).toEqual(['大宋/嘉兴府']);
    expect(context.allowedLocationPaths).toEqual(['大宋/临安府/牛家村', '大宋/临安府/西湖', '大宋/嘉兴府/烟雨楼']);
  });

  it('拒绝同名地点缩写，不再猜测所属活动区', () => {
    const context = buildDynamicLocationContext(mapData, '牛家村', 1);

    expect(context.resolved).toBe(false);
    expect(context.ambiguous).toBe(false);
    expect(context.allowedLocationPaths).toEqual([]);
  });

  it('无法解析当前位置时明确禁止模型修改位置', () => {
    const prompt = formatDynamicLocationConstraint(buildDynamicLocationContext(mapData, '江湖', 1));

    expect(prompt).toContain('不是地点表中的合法三级/四级完整路径');
    expect(prompt).toContain('本轮不得修改 user数据.所在位置');
  });

  it('生成可供世界书读取的结构化聊天变量', () => {
    const value = createDynamicLocationContextVariable(buildDynamicLocationContext(mapData, '大宋/临安府/牛家村', 1));

    expect(Object.keys(value)).toEqual(['当前活动区', '普通移动', '事件目标', '地图指定']);
    expect(value.当前活动区).toBe('大宋/临安府/牛家村');
    expect(value.普通移动).toContain('大宋/临安府/西湖');
    expect(value.普通移动).toContain('大宋/嘉兴府/烟雨楼');
    expect(value.事件目标).toEqual([]);
    expect(value.地图指定).toEqual([]);
  });

  it('过滤相邻区域中尚未解锁的三级地点', () => {
    const lockedMap = structuredClone(mapData);
    lockedMap.大宋.子区域.嘉兴府.地点.烟雨楼 = {
      ...lockedMap.大宋.子区域.嘉兴府.地点.烟雨楼,
      初始探索: false,
      解锁条件: '完成前置事件',
    };

    const locked = buildDynamicLocationContext(lockedMap, '大宋/临安府/牛家村', 1);
    const explored = buildDynamicLocationContext(lockedMap, '大宋/临安府/牛家村', 1, ['大宋/嘉兴府/烟雨楼']);

    expect(locked.allowedLocationPaths).not.toContain('大宋/嘉兴府/烟雨楼');
    expect(explored.allowedLocationPaths).toContain('大宋/嘉兴府/烟雨楼');
  });

  it('事件占用只授权前三段，传闻、后续线索和地图指令仍可提供完整地点', () => {
    expect(
      collectEventTargetPaths({
        参与事件: { 夜斗: { 描述: '进行中' } },
        事件系统: {
          人物事件占用: {
            曲三: { 事件名: '夜斗', 地点: '大宋/临安府/牛家村/村西树林' },
            闲人: { 事件名: '别的事件', 地点: '大宋/临安府/临安城/皇宫' },
          },
        },
        前端变量: {
          可发现事件: { 远方风波: '临安府暗流涌动 [1219年10月25日13时/大理/大理城/天龙寺]' },
        },
        附近传闻: { 比武招亲: '擂台人声鼎沸 [1219年10月20日13时/金国/中都/擂台]' },
        后续事件线索: {
          后续:
            '开始：1219年10月21日8时｜结束：1219年10月21日10时｜地点：大宋/嘉兴府/烟雨楼｜可能会发生的事件脉络：有人等候',
          错误层级:
            '开始：1219年10月21日8时｜结束：1219年10月21日10时｜地点：大宋/嘉兴府/烟雨楼/楼顶｜可能会发生的事件脉络：不应授权',
        },
      }),
    ).toEqual([
      '大宋/临安府/牛家村',
      '金国/中都/擂台',
      '大理/大理城/天龙寺',
      '大宋/嘉兴府/烟雨楼',
      '大宋/嘉兴府/烟雨楼/楼顶',
    ]);
    expect(extractExplicitMapTargetsFromText('出发\n[地图指令]从大宋/临安府/牛家村移动到大理/大理城/天龙寺')).toEqual([
      '大理/大理城/天龙寺',
    ]);
  });

  it('把最新周围地点写入 stat_data.前端变量，并清理旧顶层与旧世界信息变量', async () => {
    loadMapDataMock.mockResolvedValue(mapData);
    getVariablesMock.mockReturnValue({
      stat_data: { user数据: { 所在位置: '大宋/临安府/牛家村/村西树林' } },
      地图上下文: { 相邻三级地点: ['旧值'], 相邻二级地点: [] },
    });

    const value = await syncDynamicLocationContextVariable();

    expect(value?.普通移动).toContain('大宋/临安府/牛家村');
    expect(updateVariablesWithMock).toHaveBeenCalledWith(expect.any(Function), { type: 'chat' });
    const updater = updateVariablesWithMock.mock.calls[0][0] as (
      variables: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(
      updater({
        stat_data: { 世界信息: { 时间: { 年: 1 }, 周围地点: { 相邻三级地点: ['旧值'] } } },
        地图上下文: { 相邻三级地点: ['旧值'] },
      }),
    ).toEqual({
      stat_data: {
        前端变量: {
          周围地点: {
            当前活动区: '大宋/临安府/牛家村',
            普通移动: expect.arrayContaining(['大宋/临安府/牛家村']),
            事件目标: [],
            地图指定: [],
          },
        },
        世界信息: {
          时间: { 年: 1 },
        },
      },
    });
  });
});
