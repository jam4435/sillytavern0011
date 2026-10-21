import {describe,expect,it} from 'vitest';
import path from 'node:path';import {readFileSync} from 'node:fs';import {parse as parseYaml} from 'yaml';
const base=path.join(process.cwd(),'世界书/金庸群侠传1/世界书'),get=n=>parseYaml(readFileSync(path.join(base,n),'utf8'));
describe('batch 17: equipment remains tangible and arts remain techniques',()=>{
 it('keeps poison sack only as Chen elder equipment',()=>{
  const c=get('天龙第十四回00-人物登场.yaml').insert.陈长老;
  expect(c.功法.麻袋秘术).toBeUndefined();
  expect(c.功法.通臂拳).toBeTruthy();
  expect(c.重要物品.毒蝎麻袋).toContain('融会贯通');
 });
 it('keeps cloth ball and special gloves as physical items',()=>{
  const c=get('神雕第五回06-小龙女为孙婆婆复仇斗郝丘.yaml').insert.小龙女;
  expect(c.功法?.白绸带金球兵器).toBeUndefined();
  expect(c.功法?.白金丝手套).toBeUndefined();
  expect(c.重要物品.白绸带金球).toContain('融会贯通');
  expect(c.重要物品.白金丝手套).toContain('融会贯通');
 });
 it('does not regenerate the silk ball as a skill years later',()=>{
  const e=get('神雕第十三回07-小龙女接战金轮法王十招杨过搅局救险.yaml');
  expect(e.insert?.小龙女?.功法?.绸带金球兵器).toBeUndefined();
  expect(e.update.小龙女.人物经历['神雕第十三回07-小龙女接战金轮法王十招杨过搅局救险']).toContain('融会贯通');
 });
 it('keeps the two swords inventoried and the actual paired sword art learned',()=>{
  const e=get('神雕第二十回01-杨过小龙女联手斗公孙止血茶破闭穴功.yaml'),c=e.insert.小龙女;
  for(const sword of ['君子剑','淑女剑']){
   expect(c.功法?.[sword]).toBeUndefined();
   expect(c.重要物品[sword]).toContain('初窥门径');
  }
  expect(e.update.小龙女.功法.玉女素心剑法).toBeTruthy();
 });
});
