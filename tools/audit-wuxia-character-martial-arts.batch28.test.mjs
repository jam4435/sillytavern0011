import {describe,it,expect} from 'vitest';import path from 'node:path';import{readFileSync}from'node:fs';import{parse as yaml}from'yaml';
const root=process.cwd(),db=JSON.parse(readFileSync(path.join(root,'src/武侠/data/_合并后功法.json'),'utf8'));
const e=yaml(readFileSync(path.join(root,'世界书/金庸群侠传1/世界书/神雕第三十三回00-人物登场.yaml'),'utf8'));
describe('batch28: original rope maneuvers and the five-leaf iron ledger',()=>{
 it('models the actual rope loops as a bounded, documented gameplay art',()=>{
  const c=e.insert.吊死鬼,items=db.功法.filter(x=>x.功法名称==='长索功');
  expect(items).toHaveLength(1);expect(items[0].来源类型).toBe('合理补全');expect(items[0].来源说明).toContain('风陵夜话');
  expect(c.功法.长索功.掌握程度).toBe('炉火纯青');expect(c.重要物品.长索).toBeTruthy();
 });
 it('leaves the elaborate iron ledger as an item with the prior proficiency',()=>{
  const c=e.insert.讨债鬼;
  expect(c.功法?.铁帐簿功).toBeUndefined();
  expect(c.重要物品.铁帐簿).toContain('融会贯通');
  expect(c.人物经历['神雕第三十三回00-人物登场']).toContain('镔铁牌');
 });
});
