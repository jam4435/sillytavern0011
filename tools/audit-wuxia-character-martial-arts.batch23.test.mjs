import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';import path from 'node:path';import {parse as parseYaml} from 'yaml';
const root=process.cwd(),d=JSON.parse(readFileSync(path.join(root,'src/武侠/data/_合并后功法.json'),'utf8'));
const read=f=>parseYaml(readFileSync(path.join(root,'世界书/金庸群侠传1/世界书',f),'utf8'));
describe('NPC martial audit batch23: beard and bee feats',()=>{
 it('has exactly one grounded beard technique limited by physical beard',()=>{
  const list=d.功法.filter(x=>x.功法名称==='长须功');
  expect(list).toHaveLength(1);expect(list[0].来源类型).toBe('合理补全');
  expect(list[0].功法描述).toContain('胡子被剪短');
  const c=read('神雕第十七回00-人物登场.yaml').insert.樊一翁;
  expect(c.功法.长须功.掌握程度).toMatch(/^炉火纯青/);
  expect(c.功法.泼水杖法).toBeTruthy();
 });
 it('keeps bee-command dependent on actual bees and separate from Jade Bee Needles',()=>{
  const list=d.功法.filter(x=>x.功法名称==='玉蜂之术');
  expect(list).toHaveLength(1);expect(list[0].来源类型).toBe('合理补全');
  expect(list[0].功法描述).toContain('不能凭空生成毒蜂');
  const c=read('神雕第四回00-人物登场.yaml').insert.小龙女;
  expect(c.功法.玉蜂之术.掌握程度).toBe('炉火纯青');
  expect(c.重要物品.玉蜂).toBeTruthy();
  expect(d.功法.some(x=>x.功法名称==='玉蜂针')).toBe(true);
 });
});
