import {describe,it,expect} from 'vitest';
import path from 'node:path';import {readFileSync} from 'node:fs';import {parse as parseYaml} from 'yaml';
const dir=path.join(process.cwd(),'世界书/金庸群侠传1/世界书');
const read=x=>parseYaml(readFileSync(path.join(dir,x),'utf8'));
const actors=[{"f":"天龙第二十一回00-人物登场.yaml","who":"阿紫","skills":["星宿毒术"],"retain":["化功大法"]},{"f":"天龙第八回00-人物登场.yaml","who":"段延庆","skills":["腹语术"],"retain":["一阳指","段家剑"]},{"f":"天龙第二回00-人物登场.yaml","who":"司空玄","skills":["辨药施毒"],"retain":["地煞锄法"]},{"f":"天龙第十八回00-人物登场.yaml","who":"薛慕华","skills":["本草医道","金匮针法"],"retain":["百家杂手"]},{"f":"天龙第十五回00-人物登场.yaml","who":"智光","skills":["岐黄医道"],"retain":[]}];
describe('NPC audit batch21: poison, speech and healing are expertise rather than learned martial manuals',()=>{
 for(const a of actors) {
  it(a.who+' retains specializations and any real named fighting arts',()=>{
   const c=read(a.f).insert[a.who];
   for(const name of a.skills){
    expect(c.功法?.[name]).toBeUndefined();
    expect(c.人物经历[a.f.replace('.yaml','')]).toContain(name);
   }
   for(const name of a.retain)expect(c.功法[name]).toBeTruthy();
   expect(c.人物经历[a.f.replace('.yaml','')]).toContain('原熟练度');
  });
 }
 it('keeps actual poison and medical tools as inventory rather than inventing a new manual',()=>{
  expect(read('天龙第二回00-人物登场.yaml').insert.司空玄.重要物品.七日断肠散).toBeTruthy();
  expect(read('天龙第十八回00-人物登场.yaml').insert.薛慕华.重要物品.阎王敌针囊).toBeTruthy();
  expect(read('天龙第八回00-人物登场.yaml').insert.段延庆.重要物品.精钢细杖).toBeTruthy();
 });
});
