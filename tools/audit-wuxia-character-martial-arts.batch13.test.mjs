import {describe,it,expect} from 'vitest';
import path from 'node:path';import {readFileSync} from 'node:fs';import {parse as parseYaml} from 'yaml';
const root=process.cwd();
const db=JSON.parse(readFileSync(path.join(root,'src/武侠/data/_合并后功法.json'),'utf8'));
const event=parseYaml(readFileSync(path.join(root,'世界书/金庸群侠传1/世界书/神雕第十五回00-人物登场.yaml'),'utf8'));
describe('Sha Gu only knows Huang Yaoshi’s three palm and three fork moves',()=>{
 for(const name of ['桃花岛三招掌法','桃花岛三招叉法']){
 it(name+' is a bounded original-story practice, without claiming an official manual title',()=>{
 const entries=db.功法.filter(x=>x.功法名称===name);
 expect(entries).toHaveLength(1);
 const s=entries[0];
 expect(s.来源类型).toBe('合理补全');
 expect(s.来源说明).toContain('归纳');
 expect(s.来源说明).toContain('三招');
 expect(s.战斗系数.属性列表.length).toBeGreaterThan(0);
 expect(event.update.傻姑.功法[name].掌握程度).toMatch(/^融会贯通/);
 });
 }
 it('retains the distinction from regular Peach Blossom Island boxing',()=>{
 expect(db.功法.some(x=>x.功法名称==='碧波掌法')).toBe(true);
 expect(db.功法.find(x=>x.功法名称==='桃花岛三招掌法').功法描述).toContain('不能因此推定');
 });
});
