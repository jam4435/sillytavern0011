import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { canonicalMartialArtName } from '../scripts/lib/wuxia-character-martial-arts.mjs';

const root = process.cwd();
const eventRoot = path.join(root, '世界书', '金庸群侠传1', '世界书');
const database = JSON.parse(readFileSync(path.join(root, 'src', '武侠', 'data', '_合并后功法.json'), 'utf8'));
const readEvent = (file) => parseYaml(readFileSync(path.join(eventRoot, file), 'utf8'));
const readCharacter = (file, name) => readEvent(file).insert[name];
const history = (character, file) => character.人物经历?.[file.replace(/\.yaml$/, '')] ?? '';

const movedRecords = [
  { file: '天龙第九回00-人物登场.yaml', character: '巴天石', skill: '大理轻功', mastery: '融会贯通' },
  { file: '天龙第三十三回00-人物登场.yaml', character: '不平道人', skill: '拂尘功', mastery: '融会贯通' },
  { file: '天龙第六回00-人物登场.yaml', character: '褚万里', skill: '大理棍法', mastery: '融会贯通' },
  { file: '天龙第六回00-人物登场.yaml', character: '风波恶', skill: '劈风刀法', mastery: '融会贯通' },
  { file: '天龙第六回00-人物登场.yaml', character: '风波恶', skill: '折扇点穴术', mastery: '略有小成' },
  { file: '天龙第四十四回00-人物登场.yaml', character: '符敏仪', skill: '针法暗器', mastery: '炉火纯青' },
  { file: '天龙第八回00-人物登场.yaml', character: '傅思归', skill: '熟铜钯法', mastery: '略有小成' },
  { file: '天龙第四十七回00-人物登场.yaml', character: '高升泰', skill: '羽扇点穴手', mastery: '融会贯通' },
  { file: '天龙第九回00-人物登场.yaml', character: '华赫艮', skill: '地灵铲法', mastery: '略有小成' },
  { file: '天龙第三回00-人物登场.yaml', character: '木婉清', skill: '软鞭法', mastery: '略有小成' },
  { file: '天龙第二回00-人物登场.yaml', character: '司空玄', skill: '地煞锄法', mastery: '略有小成' },
  { file: '天龙第三十一回00-人物登场.yaml', character: '苏星河', skill: '小开缝手', mastery: '融会贯通' },
  { file: '天龙第八回00-人物登场.yaml', character: '岳老三', skill: '南海鳄鱼功', mastery: '略有小成' },
  { file: '天龙第八回00-人物登场.yaml', character: '云中鹤', skill: '鹤翼九变轻功', mastery: '炉火纯青' },
  { file: '天龙第八回00-人物登场.yaml', character: '云中鹤', skill: '铁爪钢杖法', mastery: '略有小成' },
  { file: '天龙第八回00-人物登场.yaml', character: '朱丹臣', skill: '铁扇点穴手法', mastery: '融会贯通' },
];

const expectedTriggers = {
  '天龙第二回00-人物登场.yaml': { 类型: '时间', 年: 1202, 月: 3, 日: 16, 时: 8, 分: 0 },
  '天龙第三回00-人物登场.yaml': { 类型: '时间', 年: 1202, 月: 3, 日: 17, 时: 8, 分: 0 },
  '天龙第六回00-人物登场.yaml': { 类型: '时间', 年: 1202, 月: 3, 日: 19, 时: 8, 分: 0 },
  '天龙第八回00-人物登场.yaml': { 类型: '时间', 年: 1202, 月: 3, 日: 22, 时: 8, 分: 0 },
  '天龙第九回00-人物登场.yaml': { 类型: '时间', 年: 1202, 月: 3, 日: 24, 时: 8, 分: 0 },
  '天龙第十三回00-人物登场.yaml': { 类型: '时间', 年: 1202, 月: 5, 日: 21, 时: 8, 分: 0 },
  '天龙第三十一回00-人物登场.yaml': { 类型: '时间', 年: 1204, 月: 4, 日: 5, 时: 8, 分: 0 },
  '天龙第三十三回00-人物登场.yaml': { 类型: '时间', 年: 1204, 月: 5, 日: 1, 时: 8, 分: 0 },
  '天龙第四十四回00-人物登场.yaml': { 类型: '时间', 年: 1205, 月: 4, 日: 5, 时: 8, 分: 0 },
  '天龙第四十七回00-人物登场.yaml': { 类型: '时间', 年: 1205, 月: 6, 日: 20, 时: 8, 分: 0 },
};

describe('wave10-a: Tianlong generic arts, weapons, and named techniques', () => {
  it.each(movedRecords)('preserves $character / $skill proficiency in history', ({ file, character, skill, mastery }) => {
    const c = readCharacter(file, character);
    expect(c.功法?.[skill]).toBeUndefined();
    expect(c.人物经历?.[file]).toBeUndefined();
    expect(history(c, file)).toContain(skill);
    expect(history(c, file)).toContain(mastery);
  });

  it('keeps every source event trigger and transaction sections unchanged', () => {
    for (const [file, trigger] of Object.entries(expectedTriggers)) {
      const event = readEvent(file);
      expect(event.触发条件).toEqual(trigger);
      expect(event.事件类型).toBe('登场事件');
      expect(event.update ?? {}).toEqual({});
      expect(event.delete ?? {}).toEqual({});
    }
  });

  it('distinguishes Chu Wanli’s fishing rod and Fu Sigui’s copper staff from formal martial arts', () => {
    const chu = readCharacter('天龙第六回00-人物登场.yaml', '褚万里');
    expect(chu.重要物品['精铁长钓杆']).toContain('钢丝软索');
    expect(chu.重要物品['熟铜长棍']).toBeUndefined();
    expect(history(chu, '天龙第六回00-人物登场.yaml')).toContain('大理段氏武功');

    const fu = readCharacter('天龙第八回00-人物登场.yaml', '傅思归');
    expect(fu.重要物品['熟铜长棍']).toContain('熟铜棍');
    expect(fu.重要物品['熟铜铜钯']).toBeUndefined();
  });

  it('normalizes Gu Ducheng’s two-axe shorthand to the verified named art', () => {
    const gu = readCharacter('天龙第六回00-人物登场.yaml', '古笃诚');
    const namedArt = database.功法.filter((art) => art.功法名称 === '盘根错节十八斧');
    expect(namedArt).toHaveLength(1);
    expect(namedArt[0].功法描述).toContain('古笃诚');
    expect(gu.功法['双斧法']).toBeUndefined();
    expect(gu.功法['盘根错节十八斧'].掌握程度).toBe('融会贯通');
    expect(history(gu, '天龙第六回00-人物登场.yaml')).toContain('熟练度不变');
  });

  it('does not collapse 劈风刀法 into 泼风刀法 or speculate about 破箭掌', () => {
    expect(canonicalMartialArtName('劈风刀法')).toBe('劈风刀法');
    expect(database.功法.some((art) => art.功法名称 === '泼风刀法')).toBe(true);
    expect(database.功法.some((art) => art.功法名称 === '劈风刀法')).toBe(false);

    const sima = readCharacter('天龙第十三回00-人物登场.yaml', '司马林');
    expect(sima.功法['破箭掌'].掌握程度).toBe('略有小成');
    expect(sima.功法['城字十八破'].掌握程度).toBe('略有小成');
    expect(sima.功法['青字九打'].掌握程度).toBe('略有小成');
  });

  it('does not turn Fu Minyi’s sewing skill into combat needles or medical acupuncture', () => {
    const fu = readCharacter('天龙第四十四回00-人物登场.yaml', '符敏仪');
    expect(fu.功法['针法暗器']).toBeUndefined();
    expect(fu.功法['金匮针法']).toBeUndefined();
    expect(history(fu, '天龙第四十四回00-人物登场.yaml')).toContain('针神');
    expect(history(fu, '天龙第四十四回00-人物登场.yaml')).toContain('缝制衣袍');
    expect(history(fu, '天龙第四十四回00-人物登场.yaml')).toContain('不作为战斗功法');
  });

  it('keeps distinct whisk/fan styles and actual weapon items separate', () => {
    const bu = readCharacter('天龙第三十三回00-人物登场.yaml', '不平道人');
    expect(bu.功法['拂尘功']).toBeUndefined();
    expect(history(bu, '天龙第三十三回00-人物登场.yaml')).toContain('拂尘功夫');
    expect(history(bu, '天龙第三十三回00-人物登场.yaml')).toContain('玉虚拂尘功');

    const feng = readCharacter('天龙第六回00-人物登场.yaml', '风波恶');
    expect(feng.重要物品['铁骨折扇']).toBeTruthy();
    expect(history(feng, '天龙第六回00-人物登场.yaml')).toContain('不因字近而与库中“泼风刀法”合并');

    const mu = readCharacter('天龙第三回00-人物登场.yaml', '木婉清');
    expect(mu.重要物品['长软鞭']).toBeTruthy();

    const si = readCharacter('天龙第二回00-人物登场.yaml', '司空玄');
    expect(si.重要物品['药锄']).toBeTruthy();

    const yun = readCharacter('天龙第八回00-人物登场.yaml', '云中鹤');
    expect(yun.重要物品['铁爪钢杖']).toBeTruthy();
    expect(history(yun, '天龙第八回00-人物登场.yaml')).toContain('捕雀功');

    const zhu = readCharacter('天龙第八回00-人物登场.yaml', '朱丹臣');
    expect(zhu.重要物品['铁折扇']).toBeTruthy();
    expect(history(zhu, '天龙第八回00-人物登场.yaml')).toContain('清凉扇法');
    expect(history(zhu, '天龙第八回00-人物登场.yaml')).toContain('玄门内功');
    expect(history(zhu, '天龙第八回00-人物登场.yaml')).toContain('大理段氏家传武学');
  });

  it('retains the original mastery of Yue Laosan’s two distinct crocodile weapons', () => {
    const yue = readCharacter('天龙第八回00-人物登场.yaml', '岳老三');
    expect(yue.功法['南海鳄鱼功']).toBeUndefined();
    expect(yue.功法['鳄嘴剪法'].掌握程度).toBe('融会贯通');
    expect(yue.功法['鳄尾鞭法'].掌握程度).toBe('略有小成');
    expect(yue.重要物品['鳄嘴剪']).toBeTruthy();
  });
});
