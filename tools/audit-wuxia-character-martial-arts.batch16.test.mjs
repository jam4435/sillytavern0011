import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';import path from 'node:path';import {parse as parseYaml} from 'yaml';
const source=readFileSync(path.join(process.cwd(),'世界书/金庸群侠传1/世界书/神雕第三十三回00-人物登场.yaml'),'utf8');
const e=parseYaml(source),root='神雕第三十三回00-人物登场';
const weapons=[["大头鬼","八角铜锤","八角铜锤","融会贯通"],["史伯威","虎头双钩","虎头双钩","炉火纯青"],["史仲猛","烂银点钢管","烂银点钢管","炉火纯青"],["史季强","青铜杵","青铜杵","融会贯通"],["史孟捷","判官双笔","判官双笔","炉火纯青"],["无常鬼","双枪","双短枪","融会贯通"],["笑脸鬼","双鞭","双鞭","融会贯通"],["笑脸鬼","毒雾","毒粉","略有小成"]];
describe('batch 16: stage equipment and animal training outside martial-art slots',()=>{
  for(const [actor,skill,item,degree] of weapons){
    it(actor+' '+skill+' belongs to inventory, never to standalone martial art',()=>{
      const c=e.insert[actor];
      expect(c.功法?.[skill]).toBeUndefined();
      expect(c.重要物品[item]).toContain(degree);
      expect(c.人物经历[root]).toContain(skill);
    });
  }
  for(const actor of ["史伯威","史仲猛","史叔刚","史季强","史孟捷"]){
    it(actor+' retains beast-taming talent as a historical profession',()=>{
      const c=e.insert[actor];
      expect(c.功法?.驯兽术).toBeUndefined();
      expect(c.人物经历[root]).toContain('驯兽');
      expect(c.人物经历[root]).toContain('出神入化');
    });
  }
  it('keeps original named martial skills and every beastmaster relationship',()=>{
    expect(e.insert.史伯威.功法.虎头双钩法).toBe('融会贯通');
    expect(e.insert.史叔刚.功法.五兽合击阵).toBe('炉火纯青');
    expect(e.insert.史孟捷.功法.灵猿飞抓术).toBe('融会贯通');
    expect(e.insert.史伯威.关系网.史仲猛).toContain('兄弟');
    expect(e.insert.长须鬼.功法.泼水杖法).toBeTruthy();
  });
});
