import {describe,it,expect} from 'vitest';import path from 'node:path';import {readFileSync} from 'node:fs';import{parse as parseYaml}from'yaml';
const base=path.join(process.cwd(),'世界书/金庸群侠传1/世界书'),read=f=>parseYaml(readFileSync(path.join(base,f),'utf8'));
describe('batch25: sect lineage is not a self-contained named manual',()=>{
 it('Guo Fu maintains two dated skill levels and her separate family art',()=>{
 const a=read('神雕第一回00-人物登场.yaml').insert.郭芙,b=read('神雕第十回06-武关酒楼群侠大战李莫愁.yaml');
 expect(a.功法.桃花岛基础武学).toBeUndefined();expect(a.功法.沧浪纳气诀).toBe('略有小成');
 expect(a.人物经历['神雕第一回00-人物登场']).toContain('初窥门径');
 expect(b.update.郭芙.功法?.桃花岛基础武学).toBeUndefined();
 expect(b.insert.郭芙.人物经历['神雕第十回06-武关酒楼群侠大战李莫愁']).toContain('融会贯通');
 });
 it('Guo siblings retain home training, Guo Xiang sword is unaffected',()=>{
 const e=read('神雕第三十三回01-风陵渡安渡老店三姊弟投店围炉夜话.yaml');
 for(const name of ['郭襄','郭破虏']){expect(e.insert[name].功法?.桃花岛基础武学).toBeUndefined();expect(e.insert[name].人物经历['神雕第三十三回01-风陵渡安渡老店三姊弟投店围炉夜话']).toContain('桃花岛基础武学');}
 expect(e.insert.郭襄.功法.越女剑法).toBeTruthy();
 });
 it('Gongsun Lüe retains her real valley upbringing, not inherited secret arts',()=>{
 const c=read('神雕第十七回00-人物登场.yaml').insert.公孙绿萼;
 expect(c.功法?.绝情谷基本功).toBeUndefined();expect(c.人物经历['神雕第十七回00-人物登场']).toContain('融会贯通');expect(c.人物经历['神雕第十七回00-人物登场']).toContain('闭穴功');
 });
 it('Shaolin elders preserve individual named moves but no generic inner-power title',()=>{
 const e=read('天龙第四十一回00-人物登场.yaml');
 for(const n of ['玄渡','玄生']){expect(e.insert[n].功法.少林内功).toBeUndefined();expect(e.insert[n].人物经历['天龙第四十一回00-人物登场']).toContain('少林内功');}
 expect(e.insert.玄渡.功法.一指禅).toBeTruthy();expect(e.insert.玄生.功法.大韦陀杵).toBeTruthy();
 });
});