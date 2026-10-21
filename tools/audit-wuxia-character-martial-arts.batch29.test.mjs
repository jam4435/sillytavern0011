import {describe,it,expect} from 'vitest';import path from 'node:path';import {readFileSync} from 'node:fs';import {parse as yaml} from 'yaml';
const root=path.join(process.cwd(),'世界书/金庸群侠传1/世界书'),read=f=>yaml(readFileSync(path.join(root,f),'utf8'));
describe('batch29: do not mistake Buddhist unnamed cultivation for formally titled manuals',()=>{
 it('Sweeping Monk retains exceptional inner-power testimony, not fake Shaolin Divine Kungfu',()=>{
  const c=read('天龙第四十一回00-人物登场.yaml').insert.扫地僧;
  expect(c.功法?.少林神功).toBeUndefined();
  expect(c.人物经历['天龙第四十一回00-人物登场']).toContain('出神入化');
  expect(c.人物经历['天龙第四十一回00-人物登场']).toContain('无形');
 });
 it('Master Zhiguang retains basic breath cultivation and specific Fumo Fist',()=>{
  const c=read('天龙第十四回00-人物登场.yaml').insert.智光大师;
  expect(c.功法.少林吐纳心法).toBeUndefined();
  expect(c.功法.少林伏魔拳.掌握程度).toBe('融会贯通');
  expect(c.人物经历['天龙第十四回00-人物登场']).toContain('炉火纯青');
  expect(c.人物经历['天龙第十四回00-人物登场']).toContain('童子功');
 });
});