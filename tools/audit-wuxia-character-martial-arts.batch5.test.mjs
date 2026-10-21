import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const root = process.cwd();
const source = '世界书/金庸群侠传1/世界书';
const readEvent = name => parseYaml(readFileSync(path.join(root, source, name), 'utf8'));
const database = JSON.parse(readFileSync(path.join(root, 'src/武侠/data/_合并后功法.json'), 'utf8'));
const officialNames = new Set(database.功法.map(art => art.功法名称));

describe('fifth batch continued NPC martial-art normalization', () => {
  it('uses the existing Kaishan Palm name for Nan Xiren without altering mastery', () => {
    const e = readEvent('射雕第二回00-人物登场.yaml');
    const arts = e.insert.南希仁.功法;
    expect(arts.开山掌).toBeUndefined();
    expect(arts.开山掌法.掌握程度).toBe('融会贯通');
    expect(officialNames.has('开山掌法')).toBe(true);
    expect(database.功法.find(a => a.功法名称 === '开山掌法').功法描述).toContain('南希仁');
  });
  it('maps Quanzhen entry swordsmanship to the canonical school sword art', () => {
    const e = readEvent('神雕第七回00-人物登场.yaml');
    const arts = e.insert.皮清玄.功法;
    expect(arts.全真入门剑法).toBeUndefined();
    expect(arts.全真剑法.掌握程度).toBe('初窥门径');
    expect(officialNames.has('全真剑法')).toBe(true);
  });
  it('preserves Yang Guo tomb study without a duplicate generic palm art', () => {
    const e = readEvent('神雕第六回04-杨过两年学遍古墓武功.yaml');
    const before = readEvent('神雕第六回02-小龙女传授天罗地网势.yaml');
    const arts = e.insert.杨过.功法;
    for (const oldName of ['古墓派拳法','古墓派掌法','古墓派轻功']) expect(arts[oldName]).toBeUndefined();
    expect(arts.美女拳法.掌握程度).toBe('融会贯通');
    expect(arts.捕雀功.掌握程度).toBe('融会贯通');
    expect(e.update.杨过.功法.天罗地网势.掌握程度).toBe('融会贯通');
    for(const name of ['美女拳法','捕雀功','天罗地网势']) expect(officialNames.has(name)).toBe(true);
    expect(arts.古墓派兵刃功夫).toBeTruthy();
    expect(arts.古墓派暗器功夫).toBeTruthy();
    expect(e.事件详情).toContain('拳法掌法、兵刃暗器');
    expect(before.触发条件.年).toBeLessThanOrEqual(e.触发条件.年);
  });
  it('records Ouyang Feng teaching Toad Skill formulas as a later update', () => {
    const start = readEvent('神雕第二回00-人物登场.yaml');
    const event = readEvent('神雕第七回10-欧阳锋传神功点穴尹志平趁隙侵犯.yaml');
    expect(start.insert.杨过.功法.蛤蟆功).toBeTruthy();
    expect(event.insert.杨过.功法.蛤蟆功诀窍).toBeUndefined();
    expect(event.insert.杨过.功法.九阴假经).toBeTruthy();
    expect(event.update.杨过.功法.蛤蟆功.掌握程度).toMatch(/^初窥门径（得欧阳锋尽数传授蛤蟆功全部诀窍/);
    expect(start.触发条件.年).toBeLessThan(event.触发条件.年);
    expect(officialNames.has('蛤蟆功')).toBe(true);
    expect(event.insert.杨过.人物经历['神雕第七回10-欧阳锋传神功点穴尹志平趁隙侵犯']).toContain('蛤蟆功');
  });
});
