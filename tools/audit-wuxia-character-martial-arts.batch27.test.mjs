import {describe,it,expect} from 'vitest';import {readFileSync} from 'node:fs';import path from 'node:path';import {parse as yaml} from 'yaml';
const root=path.join(process.cwd(),'世界书/金庸群侠传1/世界书'),r=f=>yaml(readFileSync(path.join(root,f),'utf8'));
describe('batch27: ordinary weapons and family instruction are not secret manuscripts',()=>{
 it('Gongye Qian retains named Murong sword and general palm instruction',()=>{
  const c=r('天龙第十三回00-人物登场.yaml').insert.公冶乾;
  expect(c.功法.慕容氏家传掌法).toBeUndefined();
  expect(c.功法.慕容剑法.掌握程度).toBe('略有小成');
  expect(c.人物经历['天龙第十三回00-人物登场']).toContain('融会贯通');
 });
 it('Ruan Xingzhu retains two unnamed practices but no inferred Yiyang Finger',()=>{
  const c=r('天龙第二十一回00-人物登场.yaml').insert.阮星竹;
  for(const k of ['段家小巧软兵','水性暗器']){expect(c.功法?.[k]).toBeUndefined();expect(c.人物经历['天龙第二十一回00-人物登场']).toContain(k);}
  expect(c.人物经历['天龙第二十一回00-人物登场']).toContain('一阳指');
 });
 it('Qiao Gui maintains her real knifework without an invented art title',()=>{
  const c=r('神雕第三十三回00-人物登场.yaml').insert.俏鬼;
  expect(c.功法?.刀法).toBeUndefined();
  expect(c.人物经历['神雕第三十三回00-人物登场']).toContain('融会贯通');
 });
});