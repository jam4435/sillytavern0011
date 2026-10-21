import {describe,it,expect} from 'vitest';import path from 'node:path';import {readFileSync} from 'node:fs';import{parse as yaml}from'yaml';
const d=path.join(process.cwd(),'世界书/金庸群侠传1/世界书'),read=f=>yaml(readFileSync(path.join(d,f),'utf8'));
const items=[["神雕第六回04-杨过两年学遍古墓武功.yaml","杨过",["古墓派兵刃功夫","古墓派暗器功夫"]],["神雕第九回00-人物登场.yaml","耶律燕",["掌法"]],["射雕第一回00-人物登场.yaml","曲三",["轻身功夫"]]];
describe('batch26: distinguish general lessons and named Tomb moves',()=>{
 for(const [f,n,arts] of items){it(n+' keeps his/her original lessons in history',()=>{
  const c=read(f).insert[n],history=c.人物经历[f.replace('.yaml','')];
  for(const art of arts){expect(c.功法?.[art]).toBeUndefined();expect(history).toContain(art);expect(history).toContain('原熟练度');}
 });}
 it('Yang Guo retains authenticated Tomb moves and subsequent training',()=>{
  const e=read('神雕第六回04-杨过两年学遍古墓武功.yaml');
  expect(e.insert.杨过.功法.美女拳法.掌握程度).toBe('融会贯通');
  expect(e.insert.杨过.功法.捕雀功.掌握程度).toBe('融会贯通');
  expect(e.update.杨过.功法.天罗地网势.掌握程度).toBe('融会贯通');
 });
});