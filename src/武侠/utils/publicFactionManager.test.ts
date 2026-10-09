import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAllPublicFactions,
  getPlayablePublicFactions,
  getPublicFactionByName,
  getPublicFactionRelations,
  resolveCanonicalFactionId,
  resolveFactionPublicState,
} from './publicFactionManager';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('publicFactionManager', () => {
  it('应保留 46 个 canonical 组织资料，但天下势力鉴赏只投影 23 个正式可玩势力', () => {
    const factions = getAllPublicFactions();
    expect(factions).toHaveLength(47);
    expect(new Set(factions.map(faction => faction.势力ID)).size).toBe(47);

    const playable = getPlayablePublicFactions();
    expect(playable).toHaveLength(23);
    expect(playable.every(faction => faction.可加入 && Boolean(faction.sectId))).toBe(true);
    for (const name of ['灵鹫宫', '大理天龙寺', '青城派', '蓬莱派', '神农帮', '西夏一品堂']) {
      expect(playable.map(faction => faction.势力名称)).toContain(name);
    }
    expect(playable.map(faction => faction.势力名称)).not.toContain('王罕部');
  });

  it('应当支持 canonical 名、来源名与玩法门派名归一查找', () => {
    expect(resolveCanonicalFactionId('少林派')).toBe('少林');
    expect(resolveCanonicalFactionId('少林寺')).toBe('少林');
    expect(resolveCanonicalFactionId('大理段氏与一灯门下')).toBe('一灯门下');
    expect(getPublicFactionByName('大理段氏')?.sectId).toBe('大理段氏');
    expect(getPublicFactionByName('天龙寺')?.sectId).toBe('大理天龙寺');
    expect(resolveCanonicalFactionId('蒙古军旅武学')).toBe('蒙古');

    const beggars = getPublicFactionByName('丐帮');
    expect(beggars?.sectId).toBe('丐帮');
    expect(beggars?.组织结构.length).toBeGreaterThan(0);
  });

  it('应当保留势力之间的归一关系边', () => {
    const relations = getPublicFactionRelations('灵鹫宫');
    expect(relations.some(edge => edge.from === '灵鹫宫' && edge.to === '逍遥派')).toBe(true);
    expect(relations.some(edge => edge.from === '三十六洞七十二岛' && edge.to === '灵鹫宫')).toBe(true);
  });

  it('当前掌舵人只认活着人物的标准身份键，不把前任身份当现任', async () => {
    vi.stubGlobal(
      'getVariables',
      vi.fn(async () => ({
        stat_data: {
          user数据: {
            用户名: '墨逸',
            身份: {},
          },
          角色数据: {
            洪七公: {
              状态: '健康',
              身份: {
                丐帮帮主: '丐帮第十一代帮主',
              },
            },
            黄蓉: {
              状态: '健康',
              身份: {
                前丐帮帮主: '丐帮第十二代前帮主',
              },
            },
            游坦之: {
              状态: '死亡',
              身份: {
                丐帮帮主: '第十任帮主',
              },
            },
          },
        },
      })),
    );

    const state = await resolveFactionPublicState('丐帮');
    expect(state.当前掌舵人).toEqual(['洪七公']);
    expect(state.当前掌舵人来源).toBe('variable');
    expect(state.命中身份键).toEqual(['丐帮帮主']);
  });

  it('没有可靠人物身份变量时不把原著来源首领冒充成当前首领', async () => {
    vi.stubGlobal('getVariables', vi.fn(async () => ({ stat_data: { 角色数据: {} } })));

    const state = await resolveFactionPublicState('少林');
    expect(state.当前掌舵人).toEqual([]);
    expect(state.当前掌舵人来源).toBe('unresolved');

    const shaolin = getPublicFactionByName('少林');
    expect(shaolin?.资料首领.length).toBeGreaterThan(0);
  });
});
