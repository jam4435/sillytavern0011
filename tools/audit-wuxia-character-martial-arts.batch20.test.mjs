import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';import path from 'node:path';import {parse as parseYaml} from 'yaml';
const base=path.join(process.cwd(),'世界书/金庸群侠传1/世界书');
const read=f=>parseYaml(readFileSync(path.join(base,f),'utf8'));
describe('NPC audit batch20: no fabricated manuals from Guo Jing and Ke Zhen’e life skills',()=>{
 for(const [file,name,actor,degree] of [["射雕第五回04-弯弓射雕.yaml","射艺","郭靖","融会贯通"],["射雕第九回02-寻药风波.yaml","未知内功","郭靖","初窥门径"],["射雕第三十六回07-郭靖研读兵书.yaml","武穆遗书阵法","郭靖","融会贯通"],["射雕第十一回05-郭靖黄蓉出走.yaml","游泳","郭靖","略有小成"],["射雕第二回00-人物登场.yaml","毒菱","柯镇恶","炉火纯青"]]) {
  it(name+' remains in history, not as an independent kungfu title',()=>{
   const v=read(file).insert[actor],key=file.replace('.yaml','');
   expect(v.功法?.[name]).toBeUndefined();
   expect(v.人物经历[key]).toContain(degree);
  });
 }
 it('preserves the Military Treatise as a carried book and poison as Ke Zhen’e inventory',()=>{
  expect(read('射雕第三十六回07-郭靖研读兵书.yaml').insert.郭靖.重要物品['《武穆遗书》']).toBeTruthy();
  expect(read('射雕第二回00-人物登场.yaml').insert.柯镇恶.重要物品.毒菱).toContain('炉火纯青');
  const early=read('神雕第一回00-人物登场.yaml').update.柯镇恶;
  expect(early.功法.毒蒺藜).toBeUndefined();
  expect(early.功法.伏魔杖法.掌握程度).toBe('炉火纯青');
  expect(early.重要物品.毒蒺藜).toContain('融会贯通');
  expect(early.人物经历['神雕第一回00-人物登场']).toContain('毒蒺藜');
 });
 it('retains Guo Jing venom status from drinking the medicinal snake blood',()=>{
  expect(read('射雕第九回02-寻药风波.yaml').update.郭靖.状态).toContain('中毒');
 });
});
