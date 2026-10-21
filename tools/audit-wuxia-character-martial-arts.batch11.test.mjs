import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';import path from 'node:path';import {parse as parseYaml} from 'yaml';
const d=path.join(process.cwd(),'世界书/金庸群侠传1/世界书');
const read=x=>parseYaml(readFileSync(path.join(d,x),'utf8'));
const checks=[
 ['天龙第六回00-人物登场.yaml','褚万里','大理段氏武功','大理棍法','融会贯通','略有小成'],
 ['天龙第六回00-人物登场.yaml','古笃诚','大理段氏武功','双斧法','融会贯通','略有小成'],
 ['天龙第八回00-人物登场.yaml','傅思归','大理段氏家传武学','熟铜钯法','略有小成','略有小成'],
 ['天龙第八回00-人物登场.yaml','朱丹臣','大理段氏家传武学','铁扇点穴手法','融会贯通','略有小成'],
 ['天龙第十四回00-人物登场.yaml','白世镜','丐帮杖法','缠丝擒拿手','炉火纯青','融会贯通']
];
describe('NPC martial arts batch 11: never equate sect umbrella with a named martial art',()=>{
 for(const [f,name,oldName,keptName,mastery,backgroundMastery] of checks){
 it(name+' preserves specific martial practice and sect lineage',()=>{
 const c=read(f).insert[name],key=f.replace('.yaml','');
 expect(c.功法[oldName]).toBeUndefined();
 expect(c.功法[keptName].掌握程度).toBe(mastery);
 expect(c.人物经历[key]).toContain(oldName);
 expect(c.人物经历[key]).toContain(backgroundMastery);
 expect(c.人物经历[key]).toContain(keptName);
 });
 }
});
