import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
const dir=path.join(process.cwd(),'世界书/金庸群侠传1/世界书');
const get=fn=>parseYaml(readFileSync(path.join(dir,fn),'utf8'));
describe('NPC sect umbrella names must not masquerade as distinct manuals',()=>{
  it('Chen Xuanfeng and Mei Chaofeng keep their named real techniques and Peach Blossom lineage',()=>{
    const e=get('射雕第四回00-人物登场.yaml');
    for(const name of ['陈玄风','梅超风']){
      const c=e.insert[name];
      expect(c.功法.桃花岛武学).toBeUndefined();
      expect(c.功法.摧心掌).toBeTruthy();
      expect(c.功法.九阴白骨爪).toBeTruthy();
      expect(c.人物经历['射雕第四回00-人物登场']).toContain('桃花岛');
    }
    expect(e.insert.陈玄风.功法.落英神剑掌法).toBe('炉火纯青');
  });
  it('granny Sun keeps the tomb background and named boxing but no umbrella entry',()=>{
    const c=get('神雕第五回00-人物登场.yaml').insert.孙婆婆;
    expect(c.功法.古墓派基础武功).toBeUndefined();
    expect(c.功法.美女拳法).toBe('融会贯通');
    expect(c.人物经历['神雕第五回00-人物登场']).toContain('古墓派入门武学');
    expect(c.人物经历['神雕第五回00-人物登场']).toContain('玉蜂');
  });
  it('Lu Wushuang preserves partial tomb training without claiming a distinct unnamed art',()=>{
    const e=get('神雕第八回03-豺狼谷陆无双独斗五敌.yaml');
    const c=e.insert.陆无双;
    expect(c.功法.古墓派武功).toBeUndefined();
    expect(c.功法.银弧刀法.掌握程度).toMatch(/^融会贯通/);
    expect(c.人物经历['神雕第八回03-豺狼谷陆无双独斗五敌']).toContain('洪凌波');
  });
  it('Zhou Botong keeps known feats while removing the generic Quanzhen umbrella',()=>{
    const e=get('神雕第十六回00-人物登场.yaml');
    const c=e.update.周伯通;
    expect(c.功法.全真派武功).toBeUndefined();
    expect(c.功法.左右互搏之术.掌握程度).toBe('出神入化');
    expect(c.人物经历['神雕第十六回00-人物登场']).toContain('出神入化');
  });
});
