import { describe, expect, it } from 'vitest';
import sectsJson from '../data/sects.json';
import martialArtsJson from '../data/_合并后功法.json';
import publicCatalogJson from '../data/factionPublicCatalog.json';
import { getAllSects, getFactionCandidateLocations, getSectByName } from './factionManager';
import { getPlayablePublicFactions } from './publicFactionManager';
import { loadMapData } from './mapLoader';

const NEW_FACTIONS = ['灵鹫宫', '大理天龙寺', '青城派', '蓬莱派', '神农帮', '西夏一品堂'] as const;

describe('23 个正式可玩势力数据完整性', () => {
  it('23 个玩法势力与公开目录严格一一对应，世界组织不混入列表', () => {
    const sects = getAllSects();
    const playable = getPlayablePublicFactions();

    expect(sectsJson.totalSects).toBe(23);
    expect(sects).toHaveLength(23);
    expect(playable).toHaveLength(23);
    expect(publicCatalogJson.canonicalFactionCount).toBe(46);
    expect(publicCatalogJson.factions).toHaveLength(46);
    expect(publicCatalogJson.supplementalFactions).toHaveLength(1);

    const ids = sects.map(sect => sect.门派ID);
    expect(new Set(ids).size).toBe(23);
    expect(new Set(playable.map(faction => faction.sectId)).size).toBe(23);
    expect(new Set(playable.map(faction => faction.sectId))).toEqual(new Set(ids));
    for (const sect of sects) {
      expect(getSectByName(sect.门派ID)?.门派ID).toBe(sect.门派ID);
      expect(getSectByName(sect.门派名称)?.门派ID).toBe(sect.门派ID);
    }
    for (const name of NEW_FACTIONS) {
      expect(playable.map(faction => faction.势力名称)).toContain(name);
    }
    expect(playable.map(faction => faction.势力名称)).not.toContain('王罕部');
  });

  it('220 个传承节点各有唯一 ID、合法功法与真实前置节点', () => {
    const nodes = getAllSects().flatMap(sect => sect.武学传承树);
    const ids = new Set(nodes.map(node => node.节点ID));
    const artNames = new Set(martialArtsJson.功法.map(art => art.功法名称));

    expect(nodes).toHaveLength(220);
    expect(ids.size).toBe(220);
    expect(martialArtsJson.功法).toHaveLength(484);
    for (const node of nodes) {
      expect(artNames.has(node.功法), `功法缺失: ${node.功法}`).toBe(true);
      for (const prerequisite of node.前置节点) {
        expect(ids.has(prerequisite.节点ID), `前置节点缺失: ${prerequisite.节点ID}`).toBe(true);
      }
    }
  });

  it('六个新增势力驻地与候选差事地点全部可在地图解析为坐标', async () => {
    const map = await loadMapData();

    for (const name of NEW_FACTIONS) {
      const sect = getSectByName(name);
      expect(sect, `势力缺失: ${name}`).toBeDefined();
      const base = sect!.主峰驻地;
      const candidates = getFactionCandidateLocations(sect!);
      expect(candidates, `候选地点必须包含驻地: ${name}`).toContain(base);

      for (const path of [base, ...candidates]) {
        const [area, region, location, ...extra] = path.split('/');
        expect(extra, `非三级地图路径: ${path}`).toHaveLength(0);
        expect(map[area]?.子区域[region]?.地点[location]?.坐标, `地图未登记: ${path}`).toBeDefined();
      }
    }
  });
});
