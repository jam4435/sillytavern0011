import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
const root=process.cwd(), dir='世界书/金庸群侠传1/世界书';
const get = f => parseYaml(readFileSync(path.join(root,dir,f),'utf8'));
describe('NPC martial arts distinction between manuals, moves, and effects',()=>{
  it('rejects the mistake of mistaking granny Sun calling bees for mind control',()=>{
    const s=get('神雕第五回00-人物登场.yaml').insert.孙婆婆;
    expect(s.功法.传音摄心术).toBeUndefined();
    expect(s.功法.裙里腿).toBeUndefined();
    expect(s.功法.美女拳法).toBe('融会贯通');
    const text=s.人物经历['神雕第五回00-人物登场'];
    for(const q of ['裙里腿','融会贯通','玉蜂','传音摄心术','误认为'])expect(text).toContain(q);
  });
  it('keeps sword aura as swordsmanship performance, without a fake manual',()=>{
    const z=get('天龙第三十三回00-人物登场.yaml').insert.卓不凡;
    expect(z.功法.剑芒).toBeUndefined();
    expect(z.功法.周公剑法).toBeTruthy();
    expect(z.人物经历['天龙第三十三回00-人物登场']).toContain('半尺青色剑芒');
  });
  it('records the sweeping monk’s invisible inner-force barrier without inventing a scripture',()=>{
    const monk=get('天龙第四十一回00-人物登场.yaml').insert.扫地僧;
    expect(monk.功法.无形气墙).toBeUndefined();
    expect(monk.功法.少林神功).toBeTruthy();
    expect(monk.人物经历['天龙第四十一回00-人物登场']).toContain('出神入化');
  });
  it('distinguishes Guo Jing throwing arrows by hand from a named archery style, and avoids overwriting event history',()=>{
    const e=get('神雕第二十回06-蒙古军攻襄阳郭靖守城显神威.yaml');
    expect(e.insert.郭靖.功法?.['百步穿杨（弓法）']).toBeUndefined();
    expect(e.insert.郭靖.人物经历['神雕第二十回06-蒙古军攻襄阳郭靖守城显神威']).toContain('接箭掷还');
    expect(e.update.郭靖.人物经历).toBeUndefined();
    expect(e.update.郭靖.状态).toContain('襄阳');
  });
});
