import {describe,it,expect} from 'vitest';import path from 'node:path';import{readFileSync}from'node:fs';import{parse as parseYaml}from'yaml';
const root=process.cwd(),base=path.join(root,'世界书/金庸群侠传1/世界书');
const read=f=>parseYaml(readFileSync(path.join(base,f),'utf8'));
const db=JSON.parse(readFileSync(path.join(root,'src/武侠/data/_合并后功法.json'),'utf8'));
describe('batch 19: generic martial experience and explicit low-tier gameplay training',()=>{
 it('adds one honest low-tier basic fighting skill for both recorded NPCs',()=>{
  const arts=db.功法.filter(x=>x.功法名称==='基本拳脚');
  expect(arts).toHaveLength(1);
  expect(arts[0].来源类型).toBe('合理补全');
  expect(arts[0].功法品阶).toBe('粗浅');
  for(const actor of ['煞神鬼','宋五'])expect(read('神雕第三十三回00-人物登场.yaml').insert[actor].功法.基本拳脚.掌握程度).toBeTruthy();
 });
 it('retains Wu Sanniang sword basics and separate control techniques',()=>{
  const c=read('神雕第一回00-人物登场.yaml').insert.武三娘;
  expect(c.功法.剑法).toBeUndefined();
  expect(c.功法.小擒拿手.掌握程度).toBe('融会贯通');
  expect(c.人物经历['神雕第一回00-人物登场']).toContain('略有小成');
 });
 it('keeps Shi Shugang strong inner strength and palm mastery without invented titles',()=>{
  const c=read('神雕第三十三回00-人物登场.yaml').insert.史叔刚;
  expect(c.功法.内功).toBeUndefined();expect(c.功法.掌法).toBeUndefined();
  expect(c.功法.五兽合击阵).toBe('炉火纯青');
  expect(c.人物经历['神雕第三十三回00-人物登场']).toContain('均炉火纯青');
  expect(c.人物经历['神雕第三十三回00-人物登场']).toContain('驯兽');
 });
 it('removes Xiaolongnu sect umbrella but keeps her ancient tomb training',()=>{
  const c=read('神雕第四回00-人物登场.yaml').insert.小龙女;
  expect(c.功法.古墓派武功).toBeUndefined();
  expect(c.功法.玉蜂之术).toBeTruthy();
  expect(c.人物经历['神雕第四回00-人物登场']).toContain('炉火纯青');
 });
});
