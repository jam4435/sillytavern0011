import { describe, expect, it } from 'vitest';

import { isEventStartLocationSatisfied, isTimeForEvent } from './era-event-checker.js';
import { attachEventMetadata, deriveEventRuntimeDescriptor } from './era-utils.js';

const playerLocation = '大宋/临安府/牛家村';

const maxedStatData = {
  user数据: {
    初始属性: {
      臂力: 20,
      根骨: 20,
      机敏: 20,
      悟性: 20,
      洞察: 20,
    },
  },
  事件系统: {
    已完成事件: {},
  },
};

const encounterCases = [
  {
    name: '奇遇事件-天龙-雁门绝壁抚残刻',
    location: '大宋/雁门关/关外绝壁',
    condition: {
      全部: [
        { 变量: 'user数据.初始属性.臂力', 大于等于: 13 },
        { 变量: 'user数据.初始属性.根骨', 大于等于: 13 },
      ],
    },
  },
  {
    name: '奇遇事件-射雕-王府药房饮蛇血',
    location: '金国/中都/赵王府',
    condition: {
      全部: [
        { 变量: 'user数据.初始属性.机敏', 大于等于: 13 },
        { 变量: 'user数据.初始属性.根骨', 大于等于: 12 },
      ],
    },
  },
  {
    name: '奇遇事件-射雕-绝壁斩蛇救雏雕',
    location: '蒙古/大漠/悬崖',
    condition: {
      全部: [
        { 变量: 'user数据.初始属性.臂力', 大于等于: 12 },
        { 变量: 'user数据.初始属性.机敏', 大于等于: 12 },
      ],
    },
  },
  {
    name: '奇遇事件-射雕-铁掌绝顶淬掌功',
    location: '大宋/潭州/铁掌山',
    condition: {
      全部: [
        { 变量: 'user数据.初始属性.臂力', 大于等于: 14 },
        { 变量: 'user数据.初始属性.根骨', 大于等于: 13 },
      ],
    },
  },
  {
    name: '奇遇事件-射雕-黑沼灵狐悟泥鳅',
    location: '大宋/川边/黑沼',
    condition: {
      全部: [
        { 变量: 'user数据.初始属性.机敏', 大于等于: 12 },
        { 变量: 'user数据.初始属性.悟性', 大于等于: 13 },
      ],
    },
  },
] as const;

function attachEncounterMetadata<T extends object>(name: string, eventData: T): T {
  const descriptor = deriveEventRuntimeDescriptor(name);
  if (!descriptor) throw new Error(`测试事件名无法识别为规范奇遇: ${name}`);
  return attachEventMetadata(eventData, descriptor) as T;
}

describe('encounter start location admission', () => {
  it.each(encounterCases)(
    '$name 属性条件满足但玩家在牛家村时仍不得异地触发',
    ({ name, location, condition }) => {
      const eventData = attachEncounterMetadata(name, {
        事件地点: location,
        触发条件: condition,
      });

      expect(isTimeForEvent({}, eventData, name, maxedStatData, {})).toBe(true);
      expect(isEventStartLocationSatisfied(eventData, playerLocation)).toBe(false);
    },
  );

  it('同一三级地点允许触发，即使第四级场景不同', () => {
    const name = '奇遇事件-射雕-王府药房饮蛇血';
    const eventData = attachEncounterMetadata(name, {
      事件地点: '金国/中都/赵王府/药房',
      触发条件: encounterCases[1].condition,
    });

    expect(isEventStartLocationSatisfied(eventData, '金国/中都/赵王府/后院')).toBe(true);
  });

  it('普通世界事件不受玩家地点限制', () => {
    const name = '射雕第一回01-郭杨邀饮说书人';
    const descriptor = deriveEventRuntimeDescriptor(name);
    if (!descriptor) throw new Error('测试普通事件名无法识别');

    const eventData = attachEventMetadata(
      {
        事件地点: '大宋/临安府/牛家村',
        触发条件: { 类型: '时间', 年: 1219, 月: 1, 日: 1, 时: 8 },
      },
      descriptor,
    );

    expect(isEventStartLocationSatisfied(eventData, '蒙古/大漠/悬崖')).toBe(true);
  });
});
