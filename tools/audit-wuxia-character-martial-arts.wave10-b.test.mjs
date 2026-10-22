import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parse as parseYaml} from 'yaml';

const root=process.cwd();
const world=path.join(root,'世界书/金庸群侠传1/世界书');
const read=f=>parseYaml(fs.readFileSync(path.join(world,f),'utf8'));
const db=JSON.parse(fs.readFileSync(path.join(root,'src/武侠/data/_合并后功法.json'),'utf8')).功法;
const art=name=>db.filter(x=>x.功法名称===name);

const findings=[
  {
    "id": 4,
    "file": "射雕第一回00-人物登场.yaml",
    "npc": "段天德",
    "old": "锯齿刀法",
    "level": "略有小成",
    "fact": "《射雕英雄传》第一回仅写段天德使用锯齿刀伤人，未给出独立刀谱题名",
    "decision": "移出正式功法，锯齿刀仍作为兵器保留"
  },
  {
    "id": 15,
    "file": "天龙第十七回00-人物登场.yaml",
    "npc": "赫连铁树",
    "old": "西夏军传开山掌",
    "level": "略有小成",
    "fact": "原著未证实赫连铁树掌握此题名的独立掌法，且不能与江南七怪的开山掌法混并",
    "decision": "移出正式功法，不映射为开山掌法"
  },
  {
    "id": 16,
    "file": "天龙第十七回00-人物登场.yaml",
    "npc": "赫连铁树",
    "old": "西夏斩马刀法",
    "level": "略有小成",
    "fact": "原著未证实赫连铁树本人习得名为西夏斩马刀法的独立刀谱",
    "decision": "移出正式功法，不凭军职推定个人刀法"
  },
  {
    "id": 20,
    "file": "射雕第二十六回00-人物登场.yaml",
    "npc": "鲁有脚",
    "old": "大力擒龙功",
    "level": "略有小成",
    "fact": "未找到原著证据将大力擒龙功列为鲁有脚的正式武学，手大或一般擒拿动作不能证明其掌握擒龙功",
    "decision": "移出正式功法，保留已有混天功"
  },
  {
    "id": 22,
    "file": "射雕第六回00-人物登场.yaml",
    "npc": "马青雄",
    "old": "夺魄鞭法",
    "level": "略有小成",
    "fact": "《射雕英雄传》第六回以夺魄鞭称呼马青雄，属于兵器绰号而非独立秘籍题名",
    "decision": "移出正式功法，保留铁鞭及夺魄鞭绰号"
  },
  {
    "id": 25,
    "file": "射雕第六回00-人物登场.yaml",
    "npc": "钱青健",
    "old": "丧门斧法",
    "level": "略有小成",
    "fact": "《射雕英雄传》第六回以丧门斧称呼钱青健，属于兵器绰号而非独立秘籍题名",
    "decision": "移出正式功法，保留双斧及丧门斧绰号"
  },
  {
    "id": 26,
    "file": "天龙第十四回00-人物登场.yaml",
    "npc": "全冠清",
    "old": "丐帮剑法",
    "level": "融会贯通",
    "fact": "原著记全冠清腰悬长剑，但未证实存在统一的丐帮剑法传承或他习得此独立剑谱",
    "decision": "移出正式功法，保留佩剑和已有太祖长拳"
  },
  {
    "id": 30,
    "file": "天龙第十四回00-人物登场.yaml",
    "npc": "宋长老",
    "old": "降魔杖法",
    "level": "融会贯通",
    "fact": "未找到原著证据证实宋长老掌握独立降魔杖法，不能把奚长老的五台山二十四路伏魔杖跨人物套用",
    "decision": "移出正式功法，保留精钢法杖和已有打狗棒法"
  },
  {
    "id": 32,
    "file": "天龙第十四回00-人物登场.yaml",
    "npc": "谭公",
    "old": "回生草木诀",
    "level": "炉火纯青",
    "fact": "未找到原著证据证实谭公掌握名为回生草木诀的医疗或养生秘籍",
    "decision": "移出正式功法，不把未经证实的医养名目当作武学"
  },
  {
    "id": 33,
    "file": "天龙第十四回00-人物登场.yaml",
    "npc": "谭婆",
    "old": "飞燕身法",
    "level": "融会贯通",
    "fact": "未找到原著证据证实谭婆掌握名为飞燕身法的独立轻功",
    "decision": "移出正式功法，保留已登记的修罗刀法"
  },
  {
    "id": 35,
    "file": "射雕第六回00-人物登场.yaml",
    "npc": "吴青烈",
    "old": "追命枪法",
    "level": "融会贯通",
    "fact": "《射雕英雄传》第六回以追命枪称呼吴青烈，属于兵器绰号而非独立秘籍题名",
    "decision": "移出正式功法，保留长枪及追命枪绰号"
  },
  {
    "id": 36,
    "file": "天龙第十四回00-人物登场.yaml",
    "npc": "奚长老",
    "old": "泼墨披麻刀法",
    "level": "融会贯通",
    "fact": "原著明确奚长老使五台山二十四路伏魔杖并持丈余钢杖，未见其使用泼墨披麻刀法或厚背大砍刀",
    "decision": "改为正式功法五台山二十四路伏魔杖，熟练度沿用融会贯通"
  },
  {
    "id": 38,
    "file": "天龙第十七回00-人物登场.yaml",
    "npc": "玄难",
    "old": "快刀法",
    "level": "略有小成",
    "fact": "未找到原著证据证实玄难掌握名为快刀法的刀术，保留可核实的大金刚拳",
    "decision": "移出正式功法，不凭僧人身份或旧数据推定刀法"
  },
  {
    "id": 42,
    "file": "天龙第二十五回00-人物登场.yaml",
    "npc": "耶律洪基",
    "old": "辽军搏杀术",
    "level": "略有小成",
    "fact": "未找到原著证据证实耶律洪基本人掌握名为辽军搏杀术的独立秘籍，军旅身份不等于正式武学",
    "decision": "移出正式功法，保留契丹骑射和辽帝统军身份"
  },
  {
    "id": 44,
    "file": "天龙第二十五回00-人物登场.yaml",
    "npc": "耶律涅鲁古",
    "old": "狂风矛法",
    "level": "略有小成",
    "fact": "未找到原著证据证实耶律涅鲁古掌握名为狂风矛法的独立矛谱",
    "decision": "移出正式功法，保留精钢长矛作为兵器"
  },
  {
    "id": 50,
    "file": "天龙第十四回00-人物登场.yaml",
    "npc": "赵钱孙",
    "old": "疯魔乱舞步",
    "level": "融会贯通",
    "fact": "未找到原著证据证实赵钱孙掌握名为疯魔乱舞步的独立轻功，疯癫举止不能等同武学",
    "decision": "移出正式功法，保留人物既有疯癫性格描述"
  },
  {
    "id": 51,
    "file": "天龙第十四回00-人物登场.yaml",
    "npc": "赵钱孙",
    "old": "追魂杖法",
    "level": "炉火纯青",
    "fact": "未找到原著证据证实赵钱孙掌握名为追魂杖法的独立杖谱，追魂杖是兵器名而不能由此推出杖法",
    "decision": "移出正式功法，保留追魂杖作为重要物品"
  }
];

describe('wave10-b: distinguish canon martial arts from weapon names and generic labels',()=>{
 for(const row of findings){
  it(`#${row.id} ${row.npc}: ${row.old} is not left as an unsupported formal art`,()=>{
   const c=read(row.file).insert[row.npc];
   const history=c.人物经历?.[row.file.replace(/\\.yaml$/,'')];
   expect(c.功法?.[row.old]).toBeUndefined();
   expect(history).toContain(row.old);
   expect(history).toContain(`原熟练度：${row.level}`);
   expect(history).toContain(row.fact);
   expect(history).toContain(row.decision);
   expect(art(row.old)).toHaveLength(0);
  });
 }
 it('keeps Guo Xiaotian’s family halberd art with an explicit reasonable-completion label',()=>{
  const e=read('射雕第一回00-人物登场.yaml');
  expect(e.insert.郭啸天.功法.郭家戟法.掌握程度).toBe('融会贯通');
  expect(art('郭家戟法')).toHaveLength(1);
  expect(art('郭家戟法')[0].来源类型).toBe('合理补全');
  expect(art('郭家戟法')[0].功法描述).toContain('家传戟法');
  expect(art('郭家戟法')[0].功法描述).toContain('化单为双');
  expect(art('郭家戟法')[0].来源说明).toContain('射雕英雄传');
 });
 it('corrects Xihe Elder to the existing Five-Tai staff technique and weapon',()=>{
  const c=read('天龙第十四回00-人物登场.yaml').insert.奚长老;
  expect(c.功法.五台山二十四路伏魔杖.掌握程度).toBe('融会贯通');
  expect(c.功法.泼墨披麻刀法).toBeUndefined();
  expect(c.重要物品.钢杖).toContain('五台山二十四路伏魔杖');
  expect(c.重要物品.厚背大砍刀).toBeUndefined();
  expect(art('五台山二十四路伏魔杖')).toHaveLength(1);
 });
 it('preserves real weapon nicknames instead of misclassifying them as manuals',()=>{
  const e=read('射雕第六回00-人物登场.yaml');
  expect(e.insert.马青雄.功法.夺魄鞭法).toBeUndefined();
  expect(e.insert.马青雄.重要物品.铁鞭).toContain('夺魄鞭');
  expect(e.insert.钱青健.功法.丧门斧法).toBeUndefined();
  expect(e.insert.钱青健.重要物品.双斧).toContain('丧门斧');
  expect(e.insert.吴青烈.功法.追命枪法).toBeUndefined();
  expect(e.insert.吴青烈.重要物品.长枪).toContain('追命枪');
 });
 it('keeps neighboring verified martial arts and their mastery unchanged',()=>{
  const t14=read('天龙第十四回00-人物登场.yaml');
  const t17=read('天龙第十七回00-人物登场.yaml');
  const t25=read('天龙第二十五回00-人物登场.yaml');
  const s1=read('射雕第一回00-人物登场.yaml');
  const s6=read('射雕第六回00-人物登场.yaml');
  const s26=read('射雕第二十六回00-人物登场.yaml');
  expect(t14.insert.全冠清.功法.太祖长拳.掌握程度).toBe('略有小成');
  expect(t14.insert.宋长老.功法.打狗棒法.掌握程度).toBe('略有小成');
  expect(t14.insert.谭公.功法.太行重掌.掌握程度).toBe('融会贯通');
  expect(t14.insert.谭婆.功法.修罗刀法.掌握程度).toBe('炉火纯青');
  expect(t14.insert.奚长老.功法.太祖长拳.掌握程度).toBe('略有小成');
  expect(t17.insert.玄难.功法.大金刚拳.掌握程度).toBe('炉火纯青');
  expect(t25.insert.耶律洪基.功法.契丹骑射.掌握程度).toBe('炉火纯青');
  expect(t25.insert.耶律涅鲁古.功法.契丹骑射.掌握程度).toBe('融会贯通');
  expect(s1.insert.段天德.重要物品.锯齿刀).toContain('锯齿刀');
  expect(s1.insert.郭啸天.功法.郭家戟法.掌握程度).toBe('融会贯通');
  expect(s26.insert.鲁有脚.功法.混天功.掌握程度).toBe('融会贯通');
  expect(s6.insert.马青雄.重要物品.铁鞭).toBeDefined();
  expect(s6.insert.钱青健.重要物品.双斧).toBeDefined();
  expect(s6.insert.吴青烈.重要物品.长枪).toBeDefined();
  expect(t14.insert.赵钱孙.重要物品.追魂杖).toContain('兵器');
 });
 it('leaves every event trigger and chapter metadata unchanged',()=>{
  const expected={
   '天龙第二十五回00-人物登场.yaml':{章节:'第二十五回',trigger:{类型:'时间',年:1203,月:8,日:1,时:8,分:0}},
   '天龙第十七回00-人物登场.yaml':{章节:'第十七回',trigger:{类型:'时间',年:1202,月:5,日:24,时:8,分:0}},
   '天龙第十四回00-人物登场.yaml':{章节:'第十四回',trigger:{类型:'时间',年:1202,月:5,日:22,时:8,分:0}},
   '射雕第一回00-人物登场.yaml':{章节:'第1回',trigger:{类型:'时间',年:1200,月:7,日:15,时:17}},
   '射雕第二十六回00-人物登场.yaml':{章节:'第26回',trigger:{类型:'时间',年:1220,月:11,日:6,时:8}},
   '射雕第六回00-人物登场.yaml':{章节:'第6回',trigger:{类型:'时间',年:1219,月:8,日:10,时:20}}
  };
  for(const [file,meta] of Object.entries(expected)){
   const e=read(file);
   expect(e.所属回目).toBe(meta.章节);
   expect(e.触发条件).toEqual(meta.trigger);
   expect(e.事件类型).toBe('登场事件');
  }
 });
 it('does not merge the invented Xixia opening-palm label into the Jiangnan Seven Monsters art',()=>{
  const c=read('天龙第十七回00-人物登场.yaml').insert.赫连铁树;
  expect(c.功法.西夏军传开山掌).toBeUndefined();
  expect(c.功法.开山掌法).toBeUndefined();
  expect(art('开山掌法')).toHaveLength(1);
 });
});
