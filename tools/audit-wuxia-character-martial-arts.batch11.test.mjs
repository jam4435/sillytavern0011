import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const dir = path.join(process.cwd(), '世界书/金庸群侠传1/世界书');
const read = file => parseYaml(readFileSync(path.join(dir, file), 'utf8'));

const reviewedWeapons = [
  {
    file: '天龙第六回00-人物登场.yaml',
    name: '褚万里',
    umbrella: '大理段氏武功',
    formerArt: '大理棍法',
    mastery: '融会贯通',
    backgroundMastery: '略有小成',
    item: '精铁长钓杆',
  },
  {
    file: '天龙第六回00-人物登场.yaml',
    name: '古笃诚',
    umbrella: '大理段氏武功',
    formerArt: '双斧法',
    mastery: '融会贯通',
    backgroundMastery: '略有小成',
    canonicalArt: '盘根错节十八斧',
    item: '精钢双斧',
  },
  {
    file: '天龙第八回00-人物登场.yaml',
    name: '傅思归',
    umbrella: '大理段氏家传武学',
    formerArt: '熟铜钯法',
    mastery: '略有小成',
    backgroundMastery: '略有小成',
    item: '熟铜长棍',
  },
  {
    file: '天龙第八回00-人物登场.yaml',
    name: '朱丹臣',
    umbrella: '大理段氏家传武学',
    formerArt: '铁扇点穴手法',
    mastery: '融会贯通',
    backgroundMastery: '略有小成',
    item: '铁折扇',
  },
];

describe('NPC martial arts batch 11: sect umbrella is not a named manual', () => {
  it.each(reviewedWeapons)(
    '$name retains original proficiency as experience, with an authentic weapon or named art',
    ({ file, name, umbrella, formerArt, mastery, backgroundMastery, item, canonicalArt }) => {
      const character = read(file).insert[name];
      const history = character.人物经历[file.replace('.yaml', '')];
      expect(character.功法?.[umbrella]).toBeUndefined();
      expect(character.功法?.[formerArt]).toBeUndefined();
      expect(history).toContain(umbrella);
      expect(history).toContain(backgroundMastery);
      expect(history).toContain(formerArt);
      expect(history).toContain(mastery);
      expect(character.重要物品[item]).toBeTruthy();
      if (canonicalArt) {
        expect(character.功法[canonicalArt].掌握程度).toBe(mastery);
        expect(history).toContain(canonicalArt);
      }
    },
  );

  it('keeps Bai Shijing’s independently named grappling art', () => {
    const file = '天龙第十四回00-人物登场.yaml';
    const character = read(file).insert.白世镜;
    const history = character.人物经历[file.replace('.yaml', '')];
    expect(character.功法?.丐帮杖法).toBeUndefined();
    expect(character.功法.缠丝擒拿手.掌握程度).toBe('炉火纯青');
    expect(history).toContain('丐帮杖法');
    expect(history).toContain('融会贯通');
    expect(history).toContain('缠丝擒拿手');
  });
});
