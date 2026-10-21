import {describe,it,expect} from 'vitest';
import path from 'node:path';import {readFileSync} from 'node:fs';import {parse as parseYaml} from 'yaml';
const root=process.cwd(),src=path.join(root,'世界书/金庸群侠传1/世界书');
const db=JSON.parse(readFileSync(path.join(root,'src/武侠/data/_合并后功法.json'),'utf8'));
const read=f=>parseYaml(readFileSync(path.join(src,f),'utf8'));
describe('batch22: evidence-based Tomb basic cultivation and Ouyang Feng staff',()=>{
 it('recognizes a named gameplay basic practice but never inflates it to Jade Maiden Heart Sutra',()=>{
  const a=db.功法.filter(x=>x.功法名称==='古墓派入门内功');
  expect(a).toHaveLength(1);
  expect(a[0].来源类型).toBe('合理补全');
  expect(a[0].功法描述).toContain('不能把它直接当成《玉女心经》');
  for(const [f,op,level] of [["神雕第五回08-杨过初睡寒玉床练内功.yaml","insert","初窥门径"],["神雕第五回10-杨过捉麻雀练古墓轻功.yaml","update","初窥门径"],["神雕第六回02-小龙女传授天罗地网势.yaml","update","略有小成"],["神雕第六回04-杨过两年学遍古墓武功.yaml","update","融会贯通"]]) {
   expect(read(f)[op].杨过.功法.古墓派入门内功.掌握程度).toMatch(new RegExp('^'+level));
  }
 });
 it('uses popular name for the actual West Venom snake staff, separate from the physical snake staff',()=>{
  const a=db.功法.filter(x=>x.功法名称==='灵蛇杖法');
  expect(a).toHaveLength(1);expect(a[0].来源类型).toBe('合理补全');
  const o=read('射雕第十八回00-人物登场.yaml').insert.欧阳锋;
  expect(o.功法.蛇杖杖法).toBeUndefined();
  expect(o.功法.灵蛇杖法.掌握程度).toBe('出神入化');
  expect(o.功法.灵蛇拳).toBeTruthy();
  expect(o.重要物品.蛇杖).toContain('小蛇');
  expect(o.人物经历['射雕第十八回00-人物登场']).toContain('蛇杖杖法');
 });
});
