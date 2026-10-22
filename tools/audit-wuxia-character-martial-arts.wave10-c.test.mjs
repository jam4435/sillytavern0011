import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { MARTIAL_ART_ALIASES_REQUIRING_SEMANTIC_REVIEW } from '../scripts/lib/wuxia-character-martial-arts.mjs';

const root = process.cwd();
const worldbookDir = path.join(root, '世界书', '金庸群侠传1', '世界书');
const databasePath = path.join(root, 'src', '武侠', 'data', '_合并后功法.json');
const database = JSON.parse(readFileSync(databasePath, 'utf8'));
const artByName = new Map(database.功法.map(art => [art.功法名称, art]));
const readEvent = name => parseYaml(readFileSync(path.join(worldbookDir, name), 'utf8'));

describe('wave10-c NPC martial arts evidence and timeline', () => {
  it('keeps Guo Jing’s two-volume learning stages distinct without treating the books as separate combat arts', () => {
    const event = readEvent('射雕第十七回05-周伯通哄传真经.yaml');
    expect(event.触发条件).toEqual({ 类型: '时间', 年: 1220, 月: 9, 日: 30, 时: 8 });
    expect(event.事件结束时间).toEqual({ 年: 1220, 月: 10, 日: 12, 时: 8 });
    expect(event.insert.郭靖.功法).toBeUndefined();
    const history = event.insert.郭靖.人物经历['射雕第十七回05-周伯通哄传真经'];
    expect(history).toContain('《九阴真经》上卷');
    expect(history).toContain('融会贯通');
    expect(history).toContain('《九阴真经》下卷');
    expect(history).toContain('略有小成');
    expect(history).toContain('不把两卷的记忆进度合并');
  });

  it('records Mei Chaofeng’s remnant lower-volume text as an item, not mastery of the full manual', () => {
    const event = readEvent('射雕第十回04-往事如烟.yaml');
    expect(event.触发条件).toEqual({ 类型: '时间', 年: 1220, 月: 2, 日: 3, 时: 20 });
    expect(event.事件结束时间).toEqual({ 年: 1220, 月: 2, 日: 3, 时: 22 });
    expect(event.insert.梅超风.功法).not.toHaveProperty('九阴真经（下卷）');
    expect(event.insert.梅超风.功法).not.toHaveProperty('九阴真经');
    expect(event.insert.梅超风.功法).toHaveProperty('白蟒鞭法');
    expect(event.insert.梅超风.重要物品['陈玄风身上的《九阴真经》下卷残存人皮经文']).toContain('残存文字');
    expect(event.insert.梅超风.人物经历['射雕第十回04-往事如烟']).toContain('不等于完整真经');
    expect(event.update.梅超风.功法).toHaveProperty('九阴白骨爪');
    expect(event.update.梅超风.功法).toHaveProperty('摧心掌');
  });

  it('keeps the Wang Chongyang inscription as a separate residual art and preserves the later upgrade', () => {
    const first = readEvent('神雕第七回08-山谷搭茅屋养伤修炼一年有余.yaml');
    expect(first.触发条件).toEqual({ 类型: '时间', 年: 1243, 月: 6, 日: 21, 时: 8 });
    expect(first.事件结束时间).toEqual({ 年: 1244, 月: 9, 日: 1, 时: 8 });
    expect(first.insert.杨过.功法['九阴真经(残篇)'].掌握程度).toContain('初窥门径');
    expect(first.insert.小龙女.功法['九阴真经(残篇)'].掌握程度).toContain('初窥门径');
    expect(first.insert.杨过.功法).not.toHaveProperty('九阴真经');
    expect(first.insert.小龙女.功法).not.toHaveProperty('九阴真经');

    const later = readEvent('神雕第十三回06-杨过以移魂大法制达尔巴使其自击晕倒.yaml');
    expect(later.update.杨过.功法['九阴真经(残篇)'].掌握程度).toContain('略有小成');
    expect(later.update.杨过.功法).not.toHaveProperty('九阴真经');
    const partial = artByName.get('九阴真经(残篇)');
    expect(partial.来源类型).toBe('合理补全');
    expect(partial.功法描述).toContain('不是九阴真经上下卷全本');
    expect(partial.来源说明).toContain('仅为九阴真经一小部分');
  });

  it('preserves all three inverse-meridian timeline deltas without equating them to the full reversed manual', () => {
    const first = readEvent('神雕第二回00-人物登场.yaml');
    expect(first.触发条件).toEqual({ 类型: '时间', 年: 1238, 月: 7, 日: 14, 时: 12 });
    expect(first.update.杨过.功法['逆行经脉之法'].掌握程度).toBe('初窥门径');
    expect(first.update.欧阳锋.功法['九阴假经'].掌握程度).toBe('炉火纯青');

    const second = readEvent('神雕第三回05-杨过偷学武功暗练蛤蟆功.yaml');
    expect(second.触发条件).toEqual({ 类型: '时间', 年: 1238, 月: 9, 日: 9, 时: 10 });
    expect(second.事件结束时间).toEqual({ 年: 1239, 月: 2, 日: 22, 时: 17 });
    expect(second.update.杨过.功法['逆行经脉之法'].掌握程度).toBe('略知皮毛');

    const third = readEvent('神雕第九回05-逆行经脉夺拂尘逃逸.yaml');
    expect(third.触发条件).toEqual({ 类型: '时间', 年: 1244, 月: 9, 日: 10, 时: 7 });
    expect(third.事件结束时间).toEqual({ 年: 1244, 月: 9, 日: 10, 时: 8 });
    expect(third.update.杨过.功法['逆行经脉之法'].掌握程度).toContain('初窥门径');

    const inverse = artByName.get('逆行经脉之法');
    expect(inverse.来源类型).toBe('合理补全');
    expect(inverse.功法描述).toContain('不等于欧阳锋完整逆练');
    expect(inverse.功法描述).toContain('九阴假经');
    expect(MARTIAL_ART_ALIASES_REQUIRING_SEMANTIC_REVIEW.has('逆行经脉之法')).toBe(false);
  });

  it('moves improvised weapons and unsupported family-style names to items or experience', () => {
    const hammer = readEvent('神雕第十六回01-冯默风铁锤拐杖烧衣斗李莫愁.yaml');
    expect(hammer.insert.冯默风.功法).toBeUndefined();
    expect(hammer.insert.冯默风.重要物品).toHaveProperty('铁锤');
    expect(hammer.insert.冯默风.重要物品).toHaveProperty('铁拐杖');
    expect(hammer.insert.冯默风.人物经历['神雕第十六回01-冯默风铁锤拐杖烧衣斗李莫愁']).toContain('略有小成');

    const huo = readEvent('神雕第四回00-人物登场.yaml');
    expect(huo.insert.霍都.功法).not.toHaveProperty('铁扇功');
    expect(huo.insert.霍都.功法).toHaveProperty('西藏密宗内功');
    expect(huo.insert.霍都.重要物品.铁扇).toContain('钢骨铁扇');
    expect(huo.insert.霍都.人物经历['神雕第四回00-人物登场']).toContain('朱丹臣');

    const lu = readEvent('神雕第一回00-人物登场.yaml');
    expect(lu.insert.陆立鼎.功法).toEqual({});
    expect(lu.insert.陆立鼎.重要物品.单刀).toContain('祖传');
    expect(lu.insert.陆立鼎.人物经历['神雕第一回00-人物登场']).toContain('陆展元');

    const cook = readEvent('神雕第三十五回00-人物登场.yaml');
    expect(cook.insert.人厨子.功法).toEqual({});
    expect(cook.insert.人厨子.重要物品['厚背薄刃鬼头刀']).toContain('兵器名为鬼头刀');
    expect(cook.insert.人厨子.人物经历['神雕第三十五回00-人物登场']).toContain('未见独立题名');

    const son = readEvent('神雕第三十三回00-人物登场.yaml');
    expect(son.insert['王惟忠之子'].功法).toEqual({});
    expect(son.insert['王惟忠之子'].人物经历['神雕第三十三回00-人物登场']).toContain('宋军军官');
    expect(son.insert['王惟忠之子'].人物经历['神雕第三十三回00-人物登场']).toContain('未点明独立题名');
  });

  it('retains directly named arts as distinct records with sourced provenance', () => {
    const blue = readEvent('神雕第三十六回00-人物登场.yaml');
    expect(blue.insert.蓝天和.功法.风雷掌法.掌握程度).toBe('炉火纯青');
    const yelü = readEvent('神雕第九回00-人物登场.yaml');
    expect(yelü.insert.耶律晋.功法.大力鹰爪功.掌握程度).toBe('融会贯通');
    const poem = readEvent('神雕第二十回01-杨过小龙女联手斗公孙止血茶破闭穴功.yaml');
    expect(poem.insert.杨过.功法.诗句剑法.掌握程度).toContain('初窥门径');

    expect(artByName.get('风雷掌法').来源类型).toBe('原著明示');
    expect(artByName.get('大力鹰爪功').来源类型).toBe('原著明示');
    expect(artByName.get('诗句剑法').来源类型).toBe('合理补全');
    expect(artByName.get('诗句剑法').功法描述).toContain('玉女素心剑法');
    expect(artByName.has('鹰爪功')).toBe(true);
    expect(artByName.has('鹰爪擒拿功')).toBe(true);
    expect(artByName.get('大力鹰爪功').功法名称).not.toBe('鹰爪功');
    expect(artByName.get('大力鹰爪功').功法名称).not.toBe('鹰爪擒拿功');
  });

  it('uses Yinggu’s own needle and cold-arrow arts rather than a borrowed point-acupuncture style', () => {
    const first = readEvent('射雕第二十九回00-人物登场.yaml');
    expect(first.触发条件).toEqual({ 类型: '时间', 年: 1220, 月: 11, 日: 21, 时: 8 });
    expect(first.insert.瑛姑.功法).not.toHaveProperty('点穴术');
    expect(first.insert.瑛姑.功法.七绝针.掌握程度).toBe('融会贯通');
    expect(first.insert.瑛姑.重要物品.金针指环).toContain('喂毒金针');
    expect(first.insert.瑛姑.人物经历['射雕第二十九回00-人物登场']).toContain('全真点穴术');
    expect(artByName.get('七绝针').来源类型).toBe('合理补全');

    const later = readEvent('神雕第三十四回00-人物登场.yaml');
    expect(later.触发条件).toEqual({ 类型: '时间', 年: 1259, 月: 9, 日: 8, 时: 1 });
    expect(later.update.瑛姑.功法).not.toHaveProperty('寒阴箭掌力');
    expect(later.update.瑛姑.功法.寒阴箭.掌握程度).toBe('融会贯通');
    expect(artByName.get('寒阴箭').来源类型).toBe('原著明示');
  });
});
