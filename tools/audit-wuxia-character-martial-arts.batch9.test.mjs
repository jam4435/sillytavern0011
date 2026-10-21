import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import path from 'node:path'; import { parse as parseYaml } from 'yaml';
const dir=path.join(process.cwd(),'世界书/金庸群侠传1/世界书');
const read=f=>parseYaml(fs.readFileSync(path.join(dir,f),'utf8'));
describe('fifth batch continued: distinguish practices and skill collections',()=>{
 it('Yang Guo sea-tide exercise is part of wooden sword training, not a second manual',()=>{
  const c=read('神雕第三十二回15-杨过飘然离去海边练剑.yaml').insert.杨过;
  expect(c.功法.海潮内功).toBeUndefined();
  expect(c.功法.木剑剑法.掌握程度).toMatch(/^融会贯通/);
  const text=c.人物经历['神雕第三十二回15-杨过飘然离去海边练剑'];
  expect(text).toContain('六年迎潮练剑');
  expect(text).toContain('原另称');
 });
 it('Jiumozhi retains Xiao Wuxiang Gong but not the entire Shaolin group as one skill',()=>{
  const c=read('天龙第十回00-人物登场.yaml').insert.鸠摩智;
  expect(c.功法['少林七十二绝技']).toBeUndefined();
  expect(c.功法.小无相功).toBeTruthy();
  expect(c.人物经历['天龙第十回00-人物登场']).toContain('七十二');
 });
 it('Murong Bo and the sweeping monk retain their Shaolin knowledge without a fabricated 72-in-one manual',()=>{
  const e=read('天龙第四十一回00-人物登场.yaml');
  for(const actor of ['慕容博','扫地僧']){
   const c=e.insert[actor];
   expect(c.功法['少林七十二绝技']).toBeUndefined();
   expect(c.人物经历['天龙第四十一回00-人物登场']).toContain('七十二');
  }
  expect(e.insert.慕容博.功法.斗转星移).toBeTruthy();
  expect(e.insert.扫地僧.功法?.少林神功).toBeUndefined();
  expect(e.insert.扫地僧.人物经历['天龙第四十一回00-人物登场']).toContain('少林神功');
 });
 it('Xiaolongnu plays the zither but does not gain an invented named sonic attack',()=>{
  const c=read('神雕第四回00-人物登场.yaml').insert.小龙女;
  expect(c.功法.琴音功).toBeUndefined();
  expect(c.功法.古墓派武功).toBeUndefined();
  expect(c.人物经历['神雕第四回00-人物登场']).toContain('古墓派武功');
  expect(c.人物经历['神雕第四回00-人物登场']).toContain('融会贯通');
 });
});
