import {describe,expect,it} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import {parse as parseYaml} from 'yaml';
const root=process.cwd(),name='铁掌擒拿手';
const db=JSON.parse(fs.readFileSync(path.join(root,'src/武侠/data/_合并后功法.json'),'utf8'));
const e=parseYaml(fs.readFileSync(path.join(root,'世界书/金庸群侠传1/世界书/神雕第十回00-人物登场.yaml'),'utf8'));
describe('canonically named independent Iron Palm grappling art',()=>{
 it('contains one separately named original martial art with grounded source',()=>{
  const matches=db.功法.filter(x=>x.功法名称===name);
  expect(matches).toHaveLength(1);
  const m=matches[0];
  expect(m.来源类型).toBe('原著明示');
  expect(m.功法描述).toContain('枯藤缠树');
  expect(m.修炼限制.机敏).toBeLessThanOrEqual(e.insert.完颜萍.初始属性.机敏);
  expect(m.战斗系数.属性列表.length).toBeGreaterThan(0);
  expect(m.功法品阶).toBe('传家');
 });
 it('preserves independent Iron Palm method and its original character mastery',()=>{
  const c=e.insert.完颜萍;
  expect(c.功法.铁掌擒拿手.掌握程度).toBe('融会贯通');
  expect(c.功法.铁掌功.掌握程度).toBe('略有小成');
  expect(c.功法.柳叶刀法.掌握程度).toBe('融会贯通');
  expect(e.触发条件.年).toBe(1244);
 });
});
