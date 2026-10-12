import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  canonicalCharacterName,
  canonicalMartialArtName,
  createCompletionCandidatesDocument,
  createFourCategoryMartialArtsAuditDocument,
  createMartialArtsAuditDocument,
  isActiveUseSentence,
  materializeCharacterMartialArts,
  normalizeMastery,
  parseMasteryDetails,
} from '../scripts/lib/wuxia-character-martial-arts.mjs';
import {
  createSectAssignmentCandidatesDocument,
  createSectLineageDocument,
  validateSectReviewDocuments,
} from '../scripts/lib/wuxia-sect-martial-arts.mjs';

function event(runtimeKey, effectHour, definition, kind = 'ordinary') {
  const time = { 年: 1200, 月: 1, 日: effectHour, 时: 0 };
  return {
    runtimeKey,
    sourceName: `${runtimeKey}.yaml`,
    kind,
    series: '测试',
    chapterNumber: 1,
    sequence: effectHour,
    triggerTime: time,
    triggerHour: effectHour,
    endTime: kind === 'ordinary' ? time : null,
    effectTime: time,
    effectHour,
    conditional: false,
    definition,
  };
}

describe('wuxia character martial arts audit', () => {
  it('规范化已确认人物别名、功法别名与带说明的掌握程度', () => {
    expect(canonicalCharacterName('完颜康')).toBe('杨康');
    expect(canonicalMartialArtName('双手互搏')).toBe('左右互搏之术');
    expect(canonicalMartialArtName('落英神剑掌')).toBe('落英神剑掌法');
    expect(canonicalMartialArtName('大关门式')).toBe('全真掌法');
    expect(canonicalMartialArtName('三连环')).toBe('全真剑法');
    expect(canonicalMartialArtName('虎门手')).toBe('全真掌法');
    expect(canonicalMartialArtName('玉女投梭')).toBe('玉女剑法');
    expect(canonicalMartialArtName('大风袖')).toBe('狂风迅雷功');
    expect(isActiveUseSentence('甲急问乙，乙说要他以测试剑法来换东西', ['甲'], '测试剑法')).toBe(false);
    expect(normalizeMastery('融会贯通（临敌纯熟）')).toBe('融会贯通');
    expect(normalizeMastery('略有所成')).toBe('略有小成');

    const guojingMastery = parseMasteryDetails(
      '出神入化（多年蒙古草原骑射经验——双手各抓一枝飞来的狼牙雕翎箭，举手一扬向下掷出——力道之大穿透攻城蒙古卫士胸甲两人倒撞下马。群雄喝采如雷——这般徒手射箭比劲弓所发更强更快更难）',
    );
    expect(guojingMastery.掌握程度).toBe('出神入化');
    expect(guojingMastery.标准掌握程度).toBe('出神入化');
    expect(guojingMastery.掌握程度说明).toContain('多年蒙古草原骑射经验');
  });

  it('从战斗功法中剥离生活专长与误挂装备道具', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试登场',
        1,
        {
          insert: {
            郭靖: {
              境界: '绝顶',
              身份: { 大侠: '北侠' },
              功法: {
                降龙十八掌: { 掌握程度: '出神入化（掌力刚猛无俦）' },
                游泳: { 掌握程度: '融会贯通' },
                白金丝手套: { 掌握程度: '略有小成' },
              },
            },
          },
        },
        'debut',
      ),
    ]);
    const database = { 功法: [{ 功法名称: '降龙十八掌', 功法描述: '天下刚猛第一' }] };
    const audit = createMartialArtsAuditDocument(materialized, database);
    const gj = audit.角色列表.find(c => c.角色 === '郭靖');
    expect(gj.功法记录.map(a => a.功法)).toEqual(['降龙十八掌']);
    expect(gj.功法记录[0].当前变量[0].掌握程度).toBe('出神入化');
    expect(gj.功法记录[0].当前变量[0].掌握程度说明).toBe('掌力刚猛无俦');
    expect(gj.生活与杂学专长.map(a => a.功法)).toEqual(['游泳']);
    expect(gj.误挂装备或道具.map(a => a.功法)).toEqual(['白金丝手套']);
  });

  it('按生效时间记录获得、升级和整块删除', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            甲: {
              境界: '二流-初期',
              身份: { 剑客: '江湖剑客' },
              功法: { 测试剑法: { 掌握程度: '初窥门径' } },
            },
          },
        },
        'debut',
      ),
      event('测试第一回01-升级', 2, {
        update: { 甲: { 功法: { 测试剑法: { 掌握程度: '融会贯通' } } } },
      }),
      event('测试第一回02-删除', 3, { delete: { 甲: { 功法: {} } } }),
    ]);
    const database = { 功法: [{ 功法名称: '测试剑法', 功法描述: '甲所用剑法' }] };
    const audit = createMartialArtsAuditDocument(materialized, database, { eventCount: 3 });
    const art = audit.角色列表[0].功法记录[0];
    expect(art.获得事件).toHaveLength(1);
    expect(art.升级或更新事件[0].操作).toBe('升级');
    expect(art.删除事件).toHaveLength(1);
    expect(art.当前存在).toBe(false);
  });

  it('后续获得功法者不进入完全缺失候选，凡人合理空值被排除', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            甲: { 境界: '二流-初期', 身份: { 剑客: '江湖剑客' }, 功法: {} },
            乙: { 境界: '凡人', 身份: { 商人: '普通商人' }, 功法: {} },
          },
        },
        'debut',
      ),
      event('测试第一回01-得剑法', 2, {
        事件详情: '甲使出测试剑法击退强敌。',
        insert: { 甲: { 功法: { 测试剑法: { 掌握程度: '初窥门径' } } } },
        参与人物: ['甲'],
      }),
    ]);
    const database = { 功法: [{ 功法名称: '测试剑法', 功法描述: '甲所用剑法' }] };
    const candidates = createCompletionCandidatesDocument(materialized, database);
    expect(candidates.候选角色.map(item => item.角色)).not.toContain('甲');
    expect(candidates.候选角色.map(item => item.角色)).not.toContain('乙');
    expect(candidates.排除记录.some(item => item.角色 === '乙')).toBe(true);
  });

  it('只把主动施展的功法归给角色，不误收对手功法或动词残字', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            甲: { 境界: '二流-初期', 身份: { 剑客: '江湖剑客' }, 功法: {} },
            乙: { 境界: '二流-初期', 身份: { 掌客: '江湖掌客' }, 功法: {} },
          },
        },
        'debut',
      ),
      event('测试第一回01-交手', 2, {
        事件详情: '甲使出了测试剑法迎战却不是对手，继而以测试剑法力拼乙的敌方掌法。',
        参与人物: ['甲', '乙'],
      }),
    ]);
    const database = {
      功法: [
        { 功法名称: '测试剑法', 功法描述: '一门剑法' },
        { 功法名称: '敌方掌法', 功法描述: '一门掌法' },
      ],
    };
    const candidates = createCompletionCandidatesDocument(materialized, database);
    const candidateA = candidates.候选角色.find(item => item.角色 === '甲');
    expect(candidateA.建议功法.map(item => item.功法)).toContain('测试剑法');
    expect(candidateA.建议功法.map(item => item.功法)).not.toContain('敌方掌法');
    expect(candidateA.建议功法.map(item => item.功法)).not.toContain('了测试剑法');
  });

  it('四类专项审计保留严格原始名称匹配和可审核来源', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          事件详情: '萧远山使出测试掌法击退敌人。',
          insert: {
            萧远山: { 境界: '绝顶-初期', 身份: { 高手: '江湖名宿' }, 功法: {} },
            甲: { 境界: '二流-初期', 功法: { 落英神剑掌: { 掌握程度: '略有小成' }, 游泳: { 掌握程度: '初窥门径' } } },
            段誉: { 境界: '不通武艺', 功法: {} },
          },
          参与人物: ['萧远山'],
        },
        'debut',
      ),
    ]);
    const database = {
      功法: [
        { 功法名称: '测试掌法', 功法描述: '一门掌法' },
        { 功法名称: '落英神剑掌法', 功法描述: '一门掌法' },
      ],
    };
    const report = createFourCategoryMartialArtsAuditDocument(materialized, database);
    const mismatch = report.功法名称不一致.find(item => item.人物 === '甲');
    expect(mismatch.数据库精确命中).toBe(false);
    expect(mismatch.审计别名命中).toBe(true);
    expect(mismatch.事件来源[0].事件).toBe('测试第一回00-人物登场');
    expect(report.非武学项目混入.some(item => item.原始功法名称 === '游泳')).toBe(true);
    expect(report.真正漏掉的代表武学[0].人物).toBe('萧远山');
    expect(report.合理没有武功.some(item => item.人物 === '段誉')).toBe(true);
  });

  it('只统计当前功法名称异常、保留历史名称问题并检查已有功法人物的漏项', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            甲: {
              境界: '一流-初期',
              身份: { 剑客: '江湖剑客' },
              功法: {
                落英神剑掌: { 掌握程度: '略有小成' },
                旧称掌法: { 掌握程度: '初窥门径' },
              },
            },
          },
        },
        'debut',
      ),
      event('测试第一回01-删除旧称', 2, {
        delete: { 甲: { 功法: { 旧称掌法: {} } } },
      }),
      event('测试第一回02-施展另一功法', 3, {
        事件详情: '甲施展测试剑法击退恶徒。',
        参与人物: ['甲'],
      }),
    ]);
    const database = {
      功法: [
        { 功法名称: '落英神剑掌法', 功法描述: '一门掌法' },
        { 功法名称: '测试剑法', 功法描述: '一门剑法' },
      ],
    };
    const report = createFourCategoryMartialArtsAuditDocument(materialized, database);
    expect(report.功法名称不一致.map(item => item.原始功法名称)).toContain('落英神剑掌');
    expect(report.功法名称不一致.map(item => item.原始功法名称)).not.toContain('旧称掌法');
    expect(report.历史功法名称不一致.map(item => item.原始功法名称)).toContain('旧称掌法');
    const missing = report.真正漏掉的代表武学.find(item => item.人物 === '甲');
    expect(missing?.代表武学证据.map(item => item.功法)).toContain('测试剑法');
    expect(missing?.当前已掌握战斗功法).toContain('落英神剑掌法');
  });

  it('多人动作中不能把后一个角色的招式误归给前一个角色', () => {
    expect(isActiveUseSentence('甲以剑势逼退丙、乙以测试掌法击败丁', ['甲'], '测试掌法')).toBe(false);
    expect(isActiveUseSentence('甲以测试掌法击退丙、乙以测试剑法迎战丁', ['甲'], '测试掌法')).toBe(true);
    expect(isActiveUseSentence('甲以测试掌法击退丙、乙以测试剑法迎战丁', ['甲'], '测试剑法')).toBe(false);
  });

  it('审计主动施展不得混淆被攻击者、旁观者、复数主语、泛称或笼统武学', () => {
    const cases = [
      ['乔峰凌空施展降龙十八掌，击溃丁春秋', ['乔峰'], '降龙十八掌', true],
      ['陆无双以美女拳法击退三名丐帮弟子', ['陆无双'], '美女拳法', true],
      ['李莫愁不敢过分逼近只施展小擒拿手夺回拂尘', ['李莫愁'], '小擒拿手', true],
      ['黄蓉巧妙利用《九阴真经》中的“移魂大法”反制彭长老', ['黄蓉'], '移魂大法', true],
      ['彭长老以摄魂大法柔声劝诱慈恩', ['彭长老'], '摄魂大法', true],
      ['黄蓉以硬受三枚枣核钉的代价换得交药之机', ['黄蓉'], '枣核钉', false],
      ['杨过被霍都一语提醒——回头向小龙女望了一眼猛然省起若以打狗棒法取胜', ['小龙女'], '打狗棒法', false],
      ['完颜洪烈被“妙手书生”朱聪施展妙手空空之技盗走金银', ['朱子柳', '书生'], '妙手空空', false],
      ['杨过知是义父用逆劲点穴法点中师父', ['杨过'], '点穴法', false],
      ['公孙止只得改用渔网阵，绝情谷敌意升级', ['公孙止'], '渔网阵', false],
      ['裘千尺以铁门与渔网阵封死大厅', ['裘千尺'], '渔网阵', false],
      ['段誉与虚竹联袂施展凌波微步突入敌阵', ['虚竹'], '凌波微步', false],
      ['段誉与虚竹联袂施展凌波微步突入敌阵', ['段誉'], '凌波微步', false],
      ['杨过危急中使出九阴真经功夫倏地矮身', ['杨过'], '九阴真经', false],
      ['萧峰发难施展降龙十八掌怒拍慕容博', ['萧峰'], '降龙十八掌', true],
      ['耶律燕右掌劈女刺客脸颊左手以空手夺白刃抢她刀子', ['耶律燕'], '空手夺白刃', true],
    ];
    for (const [sentence, aliases, art, expected] of cases) {
      expect(isActiveUseSentence(sentence, aliases, art), sentence).toBe(expected);
    }
  });

  it('已确认的七条原著功法均落在正确人物及成年时间线，且名称能命中数据库', () => {
    const eventRoot = path.join(process.cwd(), '世界书', '金庸群侠传1', '世界书');
    const database = JSON.parse(readFileSync(path.join(process.cwd(), 'src', '武侠', 'data', '_合并后功法.json'), 'utf8'));
    const names = new Set(database.功法.map(item => item.功法名称));
    const expected = [
      ['射雕第七回00-人物登场.yaml', '穆念慈', '逍遥游'],
      ['天龙第十九回00-人物登场.yaml', '萧远山', '无相劫指'],
      ['天龙第十九回00-人物登场.yaml', '萧远山', '般若掌'],
      ['神雕第二十三回05-杨过谎言劝退武氏兄弟.yaml', '武敦儒', '越女剑法'],
      ['神雕第二十三回05-杨过谎言劝退武氏兄弟.yaml', '武修文', '越女剑法'],
      ['神雕第三十三回01-风陵渡安渡老店三姊弟投店围炉夜话.yaml', '郭芙', '越女剑法'],
      ['神雕第三十三回01-风陵渡安渡老店三姊弟投店围炉夜话.yaml', '郭襄', '越女剑法'],
    ];
    for (const [file, person, martialArt] of expected) {
      const data = parseYaml(readFileSync(path.join(eventRoot, file), 'utf8'));
      expect(data.insert?.[person]?.功法?.[martialArt], `${file}:${person}:${martialArt}`).toBeTruthy();
      expect(names.has(martialArt)).toBe(true);
    }
    const babyEvent = parseYaml(readFileSync(path.join(eventRoot, '神雕第二十二回00-人物登场.yaml'), 'utf8'));
    expect(babyEvent.insert.郭襄.功法?.越女剑法).toBeUndefined();
    const teenEvent = parseYaml(
      readFileSync(path.join(eventRoot, '神雕第三十三回01-风陵渡安渡老店三姊弟投店围炉夜话.yaml'), 'utf8'),
    );
    expect(teenEvent.触发条件.年).toBeGreaterThan(babyEvent.触发条件.年);
  });

  it('同义功法名称整链归一，34 个世界书事件的变量键能精确命中数据库', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), 'plans', '武侠NPC功法名称归一-2026-10-12.json'), 'utf8'),
    );
    const database = JSON.parse(
      readFileSync(path.join(process.cwd(), 'src', '武侠', 'data', '_合并后功法.json'), 'utf8'),
    );
    const available = new Set(database.功法.map(art => art.功法名称));
    const oldNames = new Set(Object.keys(manifest.归一映射));
    expect(manifest.事件文件).toHaveLength(34);
    for (const [oldName, canonical] of Object.entries(manifest.归一映射)) {
      expect(available.has(canonical), `数据库未收录 ${canonical}`).toBe(true);
      expect(canonicalMartialArtName(oldName)).toBe(canonical);
    }
    let normalizedNames = 0;
    for (const file of manifest.事件文件) {
      const eventData = parseYaml(
        readFileSync(path.join(process.cwd(), '世界书', '金庸群侠传1', '世界书', file), 'utf8'),
      );
      const walk = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, nested] of Object.entries(value)) {
          if (key === '功法' && nested && typeof nested === 'object' && !Array.isArray(nested)) {
            for (const artName of Object.keys(nested)) {
              expect(oldNames.has(artName), `${file} 仍使用旧功法键 ${artName}`).toBe(false);
              if (Object.values(manifest.归一映射).includes(artName)) normalizedNames += 1;
            }
          }
          walk(nested);
        }
      };
      for (const operation of ['insert', 'update', 'delete']) walk(eventData[operation]);
    }
    expect(normalizedNames).toBeGreaterThanOrEqual(manifest.经审计现存记录);
  });

  it('审计中不得把不同武学、全套绝技和笼统门派武学强行合并', () => {
    for (const name of [
      '太祖长拳', '少林七十二绝技', '少林神功', '少林内功',
      '慕容氏家传掌法', '桃花岛基础武学', '桃花岛武学',
      '古墓派武功', '全真教武功', '逆行经脉之法',
      '丐帮杖法', '降龙二十八掌', '降龙廿八掌',
    ]) {
      expect(canonicalMartialArtName(name), name).toBe(name);
    }
  });

  it('第三批四位 NPC 的原创武学已入正式库、登场变量精确命中且来源注明合理补全', () => {
    const root = path.join(process.cwd(), '世界书', '金庸群侠传1', '世界书');
    const source = JSON.parse(readFileSync(path.join(process.cwd(), 'src', '武侠', 'data', '_合并后功法.json'), 'utf8'));
    const db = new Map(source.功法.map(item => [item.功法名称, item]));
    const entries = [
      ['射雕第七回00-人物登场.yaml', '彭连虎', '千手连环拳', '拳掌'],
      ['射雕第七回00-人物登场.yaml', '侯通海', '黄河三股叉法', '枪戟'],
      ['神雕第十六回00-人物登场.yaml', '潇湘子', '湘西哭丧棒法', '棍锤'],
      ['天龙第十八回00-人物登场.yaml', '薛慕华', '百家杂手', '拳掌'],
    ];
    expect(new Set(source.功法.map(item => item.功法名称)).size).toBe(source.功法.length);
    // 正式库后续扩充不应使第三批的存量回归测试失败。
    expect(source.功法.length).toBeGreaterThanOrEqual(488);
    for (const [file, person, art, type] of entries) {
      const eventData = parseYaml(readFileSync(path.join(root, file), 'utf8'));
      const skill = eventData.insert?.[person]?.功法?.[art];
      expect(skill, `${file} → ${person} → ${art}`).toBeTruthy();
      expect(typeof skill.掌握程度).toBe('string');
      const definition = db.get(art);
      expect(definition?.类型).toBe(type);
      expect(definition?.来源类型).toBe('合理补全');
      expect(definition?.来源说明).toBeTruthy();
      expect(definition?.战斗系数?.属性列表?.length).toBeGreaterThan(0);
      expect(definition?.修炼限制).toBeTruthy();
    }
    const shaolin = parseYaml(readFileSync(path.join(root, '天龙第十八回00-人物登场.yaml'), 'utf8'));
    expect(shaolin.insert.薛慕华.功法.金匮针法).toBeTruthy();
    expect(shaolin.insert.薛慕华.功法.本草医道).toBeTruthy();
    const rodEvent = parseYaml(readFileSync(path.join(root, '神雕第十六回00-人物登场.yaml'), 'utf8'));
    expect(rodEvent.insert.潇湘子.重要物品.毒烟哭丧棒).toContain('兵器装置');
  });

  it('黄蓉于君山大会首次明确施展移魂大法，保留九阴真经及学习阶段', () => {
    const root = path.join(process.cwd(), '世界书', '金庸群侠传1', '世界书');
    const eventData = parseYaml(readFileSync(path.join(root, '射雕第二十八回01-黄蓉智夺帮主位.yaml'), 'utf8'));
    const database = JSON.parse(readFileSync(path.join(process.cwd(), 'src', '武侠', 'data', '_合并后功法.json'), 'utf8'));
    expect(eventData.update.黄蓉.功法.九阴真经).toBeTruthy();
    const skill = eventData.update.黄蓉.功法.移魂大法;
    expect(skill.掌握程度).toMatch(/^初窥门径/);
    expect(skill.掌握程度).toContain('君山大会');
    expect(database.功法.some(item => item.功法名称 === '移魂大法')).toBe(true);
    expect(eventData.事件详情).toContain('移魂大法');
  });

  it('薛慕华只在阿朱疗伤之后获得白世镜传授的七招，不提前入登场功法', () => {
    const root = path.join(process.cwd(), '世界书', '金庸群侠传1', '世界书');
    const intro = parseYaml(readFileSync(path.join(root, '天龙第十八回00-人物登场.yaml'), 'utf8'));
    const after = parseYaml(readFileSync(path.join(root, '天龙第十九回03-乔峰探庄得知阿朱伤愈离去.yaml'), 'utf8'));
    const db = JSON.parse(readFileSync(path.join(process.cwd(), 'src', '武侠', 'data', '_合并后功法.json'), 'utf8'));
    const skill = after.insert?.薛慕华?.功法?.缠丝擒拿手;
    expect(intro.insert.薛慕华.功法.百家杂手).toBeTruthy();
    expect(intro.insert.薛慕华.功法.缠丝擒拿手).toBeUndefined();
    expect(skill?.掌握程度).toMatch(/^初窥门径/);
    expect(skill.掌握程度).toContain('七招');
    expect(skill.掌握程度).toContain('未掌握全套');
    expect(db.功法.some(art => art.功法名称 === '缠丝擒拿手')).toBe(true);
    expect(after.触发条件.年).toBeGreaterThanOrEqual(intro.触发条件.年);
    expect(after.触发条件.月).toBeGreaterThanOrEqual(intro.触发条件.月);
  });

  it('马光佐新增熟铜棍实战功法，精确匹配且不误归其他宗门传承', () => {
    const db = JSON.parse(readFileSync(path.join(process.cwd(), 'src', '武侠', 'data', '_合并后功法.json'), 'utf8'));
    const matching = db.功法.filter(art => art.功法名称 === '回疆铜棍法');
    expect(matching).toHaveLength(1);
    const [skill] = matching;
    expect(skill.类型).toBe('棍锤');
    expect(skill.功法品阶).toBe('传家');
    expect(skill.来源类型).toBe('合理补全');
    expect(skill.来源说明).toContain('第二十一回');
    expect(skill.战斗系数.属性列表[0].属性).toBe('臂力');
    const file = path.join(process.cwd(), '世界书', '金庸群侠传1', '世界书', '神雕第十六回00-人物登场.yaml');
    const debut = parseYaml(readFileSync(file, 'utf8'));
    expect(debut.insert.马光佐.功法.回疆铜棍法.掌握程度).toBe('融会贯通');
    expect(debut.insert.马光佐.重要物品.熟铜棍).toContain('兵器');
    expect(debut.insert.马光佐.功法).not.toHaveProperty('蒙古摔跤');
    expect(skill.修炼限制.臂力).toBeLessThanOrEqual(debut.insert.马光佐.初始属性.臂力);
  });

  it('生成门派谱系时遵守层级上限、指定传人与关系排除规则', () => {
    const materialized = materializeCharacterMartialArts([
      event(
        '测试第一回00-人物登场',
        1,
        {
          insert: {
            鹿清笃: {
              境界: '三流-中期',
              初始属性: { 臂力: 7, 根骨: 7, 机敏: 7, 洞察: 7, 悟性: 7 },
              身份: { 全真弟子: '全真教第三代弟子' },
              功法: {},
            },
            一灯大师: {
              境界: '绝世-初期',
              初始属性: { 臂力: 12, 根骨: 16, 机敏: 12, 洞察: 16, 悟性: 17 },
              身份: { 南帝: '大理段氏宗师' },
              功法: { 一阳指: { 掌握程度: '出神入化' } },
            },
            冯氏: {
              境界: '不通武艺',
              初始属性: { 臂力: 3, 根骨: 4, 机敏: 8, 洞察: 9, 悟性: 15 },
              身份: { 桃花岛主夫人: '黄药师之妻' },
              功法: {},
            },
          },
        },
        'debut',
      ),
    ]);
    const database = {
      功法: [{ 功法名称: '一阳指', 类型: '指法', 功法品阶: '绝世', 修炼限制: { 悟性: 10 } }],
    };
    const lineage = createSectLineageDocument(materialized, database, {
      sourceRoot: '测试世界书',
      databasePath: '测试功法库.json',
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    const assignments = createSectAssignmentCandidatesDocument(materialized, lineage, {
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    const lu = assignments.候选角色.find(item => item.角色 === '鹿清笃');
    const yideng = assignments.候选角色.find(item => item.角色 === '一灯大师');
    expect(lineage.统计.门派或体系数).toBeGreaterThanOrEqual(10);
    expect(lu.建议分配.every(item => !['核心', '镇派'].includes(item.传承层级))).toBe(true);
    expect(yideng.建议分配.map(item => item.功法)).not.toContain('六脉神剑');
    expect(assignments.排除记录.some(item => item.角色 === '冯氏' && item.门派ID === '桃花岛')).toBe(true);
    expect(validateSectReviewDocuments(lineage, assignments, database, materialized)).toEqual([]);
  });
});
