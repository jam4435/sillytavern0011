import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const root = process.cwd();
const base = '世界书/金庸群侠传1/世界书';
const read = file => parseYaml(readFileSync(path.join(root, base, file), 'utf8'));
const db = JSON.parse(readFileSync(path.join(root, 'src/武侠/data/_合并后功法.json'), 'utf8'));
const find = name => db.功法.filter(x => x.功法名称 === name);

describe('fifth batch sustained canonical martial arts audit', () => {
  it('adds only the two separately documented complete martial arts', () => {
    for (const skill of ['黄沙万里鞭法','推经转脉易宫换穴']) {
      expect(find(skill)).toHaveLength(1);
      expect(find(skill)[0].来源类型).toBe('原著明示');
      expect(find(skill)[0].来源说明).toContain('《神雕侠侣》');
      expect(find(skill)[0].战斗系数.属性列表.length).toBeGreaterThan(0);
    }
    expect(db.功法.length).toBeGreaterThanOrEqual(496);
  });
  it('Yin Kexi uses his complete whip art at the late event without an earlier assignment', () => {
    const event=read('神雕第二十六回02-小龙女独战三大高手.yaml');
    expect(event.insert.尹克西.功法.黄沙万里鞭法.掌握程度).toMatch(/^融会贯通/);
    expect(event.insert.尹克西.人物经历['神雕第二十六回02-小龙女独战三大高手']).toContain('黄沙万里鞭法');
  });
  it('Jinlun spells out his rare inner skill only at the demonstrated event', () => {
    const event=read('神雕第三十八回08-金轮法王骗郭襄解穴逃脱挟持郭襄失踪.yaml');
    expect(event.insert.金轮法王.功法.推经转脉易宫换穴.掌握程度).toMatch(/^融会贯通/);
    expect(find('推经转脉易宫换穴')[0].功法描述).toContain('金轮法王');
  });
  it('Li Mochou matches the existing dedicated whisk art, not an unrelated Taoist variant', () => {
    const arts=read('神雕第一回00-人物登场.yaml').insert.李莫愁.功法;
    expect(arts.拂尘功).toBeUndefined();
    expect(arts.拂尘功夫.掌握程度).toBe('融会贯通');
    expect(find('拂尘功夫')[0].功法描述).toContain('李莫愁');
  });
  it('moves three named weapons out of martial-art maps without losing equipment use', () => {
    const wu=read('天龙第三十三回00-人物登场.yaml').insert.乌老大;
    expect(wu.功法.绿波香露刀法).toBeUndefined();
    expect(wu.重要物品.绿波香露刀).toContain('融会贯通');
    const han=read('神雕第八回00-人物登场.yaml').insert.韩姓乞丐;
    expect(han.功法.链子锤).toBeUndefined();
    expect(han.重要物品.链子锤).toContain('融会贯通');
    expect(han.功法.莲花掌).toBeTruthy();
    const ghost=read('神雕第三十三回00-人物登场.yaml').insert.丧门鬼;
    expect(ghost.功法?.链子枪).toBeUndefined();
    expect(ghost.重要物品.链子枪).toContain('融会贯通');
  });
  it('preserves the named cooperative move as five character experiences, not five fake secret manuals', () => {
    const event=read('神雕第二十六回04-全真五子破洞而出.yaml');
    for(const k of ['郝大通','刘处玄','丘处机','孙不二','王处一']) {
      expect(event.insert[k].功法?.七星聚会).toBeUndefined();
      const experience=event.insert[k].人物经历['神雕第二十六回04-全真五子破洞而出'];
      expect(experience).toContain('七星聚会');
      expect(experience).toContain('初窥门径');
    }
    expect(event.事件详情).toContain('创出了一招');
  });
});
