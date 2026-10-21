import {describe,it,expect} from 'vitest';
import path from 'node:path';import {readFileSync} from 'node:fs';import {parse as parseYaml} from 'yaml';
const root=path.join(process.cwd(),'世界书/金庸群侠传1/世界书');
const r=f=>parseYaml(readFileSync(path.join(root,f),'utf8'));
describe('batch24: partial advice and five-elements tactics do not imply complete standalone manuals',()=>{
 it('records the single Taoist internal-arts hint as an encounter, not full new training',()=>{
  const e=r('射雕第六回03-智退铁尸.yaml'),c=e.insert.梅超风;
  expect(c.功法?.道家内功).toBeUndefined();
  expect(c.人物经历['射雕第六回03-智退铁尸']).toContain('初窥门径');
  expect(c.人物经历['射雕第六回03-智退铁尸']).toContain('马钰');
 });
 it('Lu Chengfeng retains his two explicitly named combat techniques',()=>{
  const e=r('射雕第十三回00-人物登场.yaml'),c=e.insert.陆乘风;
  expect(c.功法.奇门五行之术).toBeUndefined();
  expect(c.功法.旋风扫叶腿.掌握程度).toBe('炉火纯青');
  expect(c.功法.劈空掌.掌握程度).toBe('炉火纯青');
  expect(c.人物经历['射雕第十三回00-人物登场']).toContain('融会贯通');
 });
});
