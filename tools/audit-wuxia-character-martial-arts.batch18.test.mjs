import {describe,it,expect} from 'vitest';
import path from 'node:path';import {readFileSync} from 'node:fs';import {parse as parseYaml} from 'yaml';
const dir=path.join(process.cwd(),'世界书/金庸群侠传1/世界书');
const read=x=>parseYaml(readFileSync(path.join(dir,x),'utf8'));
describe('batch 18: equipment, scouting and disguise belong outside combat manuals',()=>{
 it('Huo Du retains the staff mechanism and its original competence',()=>{
 const c=read('神雕第三十六回07-何师我暗算击败耶律齐.yaml').insert.霍都;
 expect(c.功法.特制铁杖).toBeUndefined();
 expect(c.功法.狂风迅雷功).toBeTruthy();
 expect(c.重要物品.特制铁杖).toContain('炉火纯青');
 expect(c.重要物品.打狗棒).toBeTruthy();
 });
 it('Hua Hegen remains a martial artist with documented scouting experience',()=>{
 const c=read('天龙第九回00-人物登场.yaml').insert.华赫艮;
 expect(c.功法.伏地听声).toBeUndefined();
 expect(c.功法.地灵铲法).toBeUndefined();
 expect(c.人物经历['天龙第九回00-人物登场']).toContain('地灵铲法');
 expect(c.人物经历['天龙第九回00-人物登场']).toContain('略有小成');
 expect(c.人物经历['天龙第九回00-人物登场']).toContain('融会贯通');
 });
 it('Azhu keeps genuine disguise and voice specialties, not martial skills',()=>{
 const c=read('天龙第十二回00-人物登场.yaml').insert.阿朱;
 expect(c.功法?.易容术).toBeUndefined();
 expect(c.功法?.变声绝技).toBeUndefined();
 expect(c.人物经历['天龙第十二回00-人物登场']).toContain('炉火纯青');
 expect(c.人物经历['天龙第十二回00-人物登场']).toContain('融会贯通');
 });
});
