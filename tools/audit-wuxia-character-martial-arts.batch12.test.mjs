import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parse as parseYaml} from 'yaml';
const names=["神雕第十一回04-二老借杨过口传演武打狗棒法对蛇杖.yaml","神雕第十二回02-树上偷听靖蓉议婚与黄蓉演棒.yaml","神雕第十三回02-杨过霍都厅上追逐戏斗.yaml","神雕第十三回03-杨过使打狗棒法黄蓉借棒指点斗霍都.yaml"];
const e=names.map(n=>parseYaml(readFileSync(path.join(process.cwd(),'世界书/金庸群侠传1/世界书',n),'utf8')));
describe('Yang Guo staged Dog Beating Staff teaching does not produce phantom skills',()=>{
 it('preserves memorized techniques but not early standalone art',()=>{
  expect(e[0].insert?.杨过?.功法?.['打狗棒法(招式)']).toBeUndefined();
  expect(e[0].update.杨过.人物经历[names[0].replace('.yaml','')]).toContain('不知临敌口诀');
 });
 it('retains authentic later practice after overhearing Huang Rong',()=>{
  expect(e[1].delete?.杨过?.功法?.['打狗棒法(招式)']).toBeUndefined();
  expect(e[1].insert.杨过.功法.打狗棒法).toBeTruthy();
  expect(e[1].insert.杨过.人物经历[names[1].replace('.yaml','')]).toContain('偷听黄蓉');
 });
 it('keeps the first use, not an invented second manual',()=>{
  expect(e[2].insert?.杨过?.功法?.打狗棒法实战运用).toBeUndefined();
  expect(e[2].update.杨过.人物经历[names[2].replace('.yaml','')]).toContain('初次临敌试招');
 });
 it('retains existing real full-skill update and removes temporary add/delete',()=>{
  expect(e[3].insert?.杨过?.功法?.打狗棒法实战运用).toBeUndefined();
  expect(e[3].delete?.杨过?.功法?.打狗棒法实战运用).toBeUndefined();
  expect(e[3].update.杨过.功法.打狗棒法.掌握程度).toMatch(/^融会贯通/);
  expect(e[3].update.杨过.人物经历[names[3].replace('.yaml','')]).toContain('黄蓉');
 });
});
