import {describe,it,expect} from 'vitest';
import path from 'node:path';import {readFileSync} from 'node:fs';import {parse as parseYaml} from 'yaml';
const base=path.join(process.cwd(),'世界书/金庸群侠传1/世界书');
const read=n=>parseYaml(readFileSync(path.join(base,n),'utf8'));
const names=new Set(JSON.parse(readFileSync(path.join(process.cwd(),'src/武侠/data/_合并后功法.json'),'utf8')).功法.map(a=>a.功法名称));
describe('batch 15: documented martial art names across historical character epithets',()=>{
 it('Wu elder (Wu Changfeng) uses the original named Qimen Sancai blade, not the blade name',()=>{
 const c=read('天龙第十四回00-人物登场.yaml').insert.吴长老;
 expect(c.功法.风雷鬼头刀).toBeUndefined();
 expect(c.功法.奇门三才刀.掌握程度).toBe('炉火纯青');
 expect(c.重要物品.鬼头刀).toBeTruthy();
 expect(c.人物经历['天龙第十四回00-人物登场']).toContain('吴长风');
 expect(names.has('奇门三才刀')).toBe(true);
 });
 it('Wu Changfeng keeps the later state and uses the same official named blade',()=>{
 const event=read('天龙第十五回00-人物登场.yaml');
 const c=event.insert.吴长风;
 expect(c.功法.奇门刀法).toBeUndefined();
 expect(c.功法.奇门三才刀.掌握程度).toBe('融会贯通');
 expect(c.功法.打狗阵).toBeTruthy();
 expect(event.触发条件.年).toBe(1202);
 expect(c.人物经历['天龙第十五回00-人物登场']).toContain('吴长老');
 });
 it('Long Beard Ghost reuses Fan Yiweng original staff routine without prematurely merging the identity',()=>{
 const early=read('神雕第十七回00-人物登场.yaml').insert.樊一翁;
 const later=read('神雕第三十三回00-人物登场.yaml').insert.长须鬼;
 expect(early.功法.泼水杖法).toBeTruthy();
 expect(later.功法.钢杖功).toBeUndefined();
 expect(later.功法.泼水杖法.掌握程度).toBe('炉火纯青');
 expect(later.重要物品.钢杖).toBeTruthy();
 expect(later.人物经历['神雕第三十三回00-人物登场']).toContain('樊一翁');
 expect(names.has('泼水杖法')).toBe(true);
 });
});
