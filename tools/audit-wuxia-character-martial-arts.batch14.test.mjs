import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';import path from 'node:path';import {parse as parseYaml} from 'yaml';
const root=process.cwd();
const e=parseYaml(readFileSync(path.join(root,'世界书/金庸群侠传1/世界书/射雕第七回00-人物登场.yaml'),'utf8'));
const db=JSON.parse(readFileSync(path.join(root,'src/武侠/data/_合并后功法.json'),'utf8'));
describe('Quanzhen teaching for Wanyan Kang with no unearned school-wide mastery',()=>{
 it('retains the original early mastery and canonical inner practice',()=>{
 const c=e.insert.完颜康;
 expect(c.功法.全真教武功).toBeUndefined();
 expect(c.功法.全真派内功.掌握程度).toBe('略有小成');
 expect(c.功法.杨家枪法.掌握程度).toBe('融会贯通');
 expect(c.功法.全真剑法).toBeUndefined();
 expect(c.人物经历['射雕第七回00-人物登场']).toContain('丘处机');
 expect(c.人物经历['射雕第七回00-人物登场']).toContain('不推断');
 expect(db.功法.some(a=>a.功法名称==='全真派内功'&&a.类型==='内功')).toBe(true);
 expect(e.触发条件.年).toBe(1219);
 });
});
