import {
  canonicalCharacterName,
  canonicalMartialArtName,
  cloneJson,
  isActiveUseSentence,
} from './wuxia-character-martial-arts.mjs';

export const INHERITANCE_TIERS = ['入门', '基础', '进阶', '核心', '镇派'];

const NON_MARTIAL_REALM_PATTERN = /^(?:凡人|不入流|未入流|不通武艺|不会武功|不懂武功|无|无武功)$/;
const MASTERY_BY_REALM = [
  [/五绝|绝顶|绝世|大宗师/, '出神入化'],
  [/一流|宗师|先天/, '炉火纯青'],
  [/二流|后天/, '融会贯通'],
  [/三流/, '略有小成'],
];

function membership(groups) {
  return Object.fromEntries(
    groups.flatMap(group =>
      group.names.map(name => [
        name,
        {
          关系类型: group.relation,
          层级上限: group.cap,
          归属置信度: group.confidence ?? 0.9,
          是否自动分配: group.autoAssign ?? true,
          时间口径: group.timePolicy ?? 'evidence-or-debut',
          说明: group.note ?? null,
          禁止功法: group.blockedArts ?? [],
        },
      ]),
    ),
  );
}

function existing(name, tier, prerequisites = [], options = {}) {
  return { name, tier, prerequisites, source: 'database', ...options };
}

function worldbook(name, tier, type, grade, description, prerequisites = [], options = {}) {
  return { name, tier, type, grade, description, prerequisites, source: 'worldbook', ...options };
}

function supplement(name, tier, type, grade, description, prerequisites = [], options = {}) {
  return { name, tier, type, grade, description, prerequisites, source: 'supplement', ...options };
}

export const SECT_LINEAGE_DEFINITIONS = [
  {
    id: '全真教',
    name: '全真教',
    aliases: ['全真派', '全真门下'],
    type: '门派',
    positioning: '玄门正宗，以吐纳筑基、剑掌并修和多人阵法为骨架。',
    eventKeywords: ['全真教', '全真派', '全真门下', '全真弟子', '全真道士', '全真七子'],
    members: membership([
      {
        names: ['马钰', '丘处机', '王处一', '刘处玄', '谭处端', '郝大通', '孙不二'],
        relation: '掌教或长老',
        cap: '核心',
      },
      { names: ['周伯通'], relation: '师门核心人物', cap: '镇派', blockedArts: ['先天功'] },
      {
        names: [
          '崔志方',
          '姬清虚',
          '鹿清笃',
          '皮清玄',
          '申志凡',
          '宋德方',
          '王志明',
          '夏志诚',
          '尹志平',
          '于志可',
          '张志素',
          '赵志敬',
        ],
        relation: '正式门人',
        cap: '进阶',
      },
      {
        names: ['杨康', '杨过'],
        relation: '短期或个人师承',
        cap: '基础',
        confidence: 0.65,
        autoAssign: false,
        note: '不能视为完整继承全真门派谱系。',
      },
    ]),
    nodes: [
      supplement(
        '全真吐纳法',
        '入门',
        '内功',
        '粗浅',
        '全真门人用来校正呼吸与经脉运行的筑基法，只求气息绵长稳正，不追求短期爆发。',
        [],
        { branch: '内功', common: true },
      ),
      supplement(
        '全真入门拳',
        '入门',
        '拳掌',
        '粗浅',
        '配合全真吐纳法演练的基础拳架，动作端正舒展，用于打牢步法、架势和发力次序。',
        ['全真吐纳法'],
        { branch: '拳掌', common: true },
      ),
      existing('空手夺白刃', '基础', ['全真入门拳'], { branch: '擒拿', common: true }),
      existing('虎门手', '基础', ['全真入门拳'], { branch: '拳掌', common: true }),
      existing('全真剑法', '基础', ['全真吐纳法'], { branch: '剑法', common: true }),
      existing('金雁功', '进阶', ['全真吐纳法'], { branch: '轻功', common: true }),
      existing('金关玉锁二十四诀', '进阶', ['全真吐纳法'], { branch: '内功', common: true }),
      existing('大关门式', '进阶', ['全真剑法'], { branch: '剑法' }),
      existing('鸳鸯连环腿', '进阶', ['全真入门拳'], { branch: '腿法' }),
      existing('三连环', '进阶', ['全真剑法'], { branch: '剑法' }),
      existing('全真派内功', '核心', ['金关玉锁二十四诀'], { branch: '内功', minimumRelation: '亲传' }),
      existing('三花聚顶掌法', '核心', ['全真派内功'], { branch: '拳掌', minimumRelation: '亲传' }),
      existing('天罡北斗阵', '镇派', ['全真派内功', '全真剑法'], {
        branch: '阵法',
        onlyFor: ['马钰', '丘处机', '王处一', '刘处玄', '谭处端', '郝大通', '孙不二'],
      }),
      existing('先天功', '镇派', ['全真派内功'], { branch: '内功', onlyFor: ['王重阳'] }),
    ],
  },
  {
    id: '桃花岛',
    name: '桃花岛',
    aliases: ['东邪门下'],
    type: '门派',
    positioning: '以奇门术数统摄掌、剑、指、腿和音律，重机变与悟性。',
    eventKeywords: ['桃花岛', '东邪门下', '黄药师弟子', '黄药师门下'],
    members: membership([
      { names: ['黄药师'], relation: '岛主', cap: '镇派' },
      { names: ['黄蓉', '陈玄风', '梅超风', '冯默风'], relation: '嫡系或亲传', cap: '核心' },
      {
        names: ['程英'],
        relation: '旁支亲传',
        cap: '核心',
        confidence: 0.9,
        blockedArts: ['落英神剑掌法', '奇门五行阵', '碧海潮生曲'],
        note: '正文明确施展弹指神通，但不据此推定其掌握全部岛主核心绝学。',
      },
      { names: ['傻姑'], relation: '记名传承', cap: '进阶', confidence: 0.8 },
      {
        names: ['郭芙', '郭襄', '郭破虏'],
        relation: '家学支线',
        cap: '基础',
        confidence: 0.7,
        note: '亲属关系不等于获得桃花岛核心传承。',
      },
      {
        names: ['郭靖', '冯氏'],
        relation: '婚姻或岛主家属',
        cap: '入门',
        confidence: 0.3,
        autoAssign: false,
        note: '婚姻身份本身不能推出武学继承。',
      },
    ]),
    nodes: [
      supplement(
        '碧波吐纳诀',
        '入门',
        '内功',
        '粗浅',
        '依潮汐节律调整呼吸和步伐的桃花岛筑基法，帮助门人建立绵密灵动的运劲习惯。',
        [],
        { branch: '内功', common: true },
      ),
      supplement(
        '桃影步',
        '入门',
        '轻功',
        '粗浅',
        '借桃林方位练习转折与藏身的基础步法，强调忽进忽退和遮蔽对手视线。',
        ['碧波吐纳诀'],
        { branch: '轻功', common: true },
      ),
      existing('碧波掌法', '基础', ['碧波吐纳诀'], { branch: '拳掌', common: true }),
      existing('扫叶腿法', '基础', ['桃影步'], { branch: '腿法', common: true }),
      existing('落英剑法', '基础', ['桃影步'], { branch: '剑法', common: true }),
      existing('兰花拂穴手', '进阶', ['碧波掌法'], { branch: '指法' }),
      existing('旋风扫叶腿', '进阶', ['扫叶腿法'], { branch: '腿法' }),
      existing('玉箫剑法', '进阶', ['落英剑法'], { branch: '剑法' }),
      existing('奇门遁甲', '进阶', ['桃影步'], { branch: '奇术', common: true }),
      existing('落英神剑掌法', '核心', ['碧波掌法', '奇门遁甲'], { branch: '拳掌' }),
      existing('弹指神通', '核心', ['兰花拂穴手'], { branch: '指法' }),
      existing('奇门五行阵', '核心', ['奇门遁甲'], { branch: '阵法' }),
      existing('碧海潮生曲', '镇派', ['碧波吐纳诀', '奇门遁甲'], { branch: '音律', onlyFor: ['黄药师'] }),
    ],
  },
  {
    id: '古墓派',
    name: '古墓派',
    aliases: ['古墓门下'],
    type: '门派',
    positioning: '以清静内功、轻灵身法和双剑配合为主，部分叛门支线不纳入公共传承。',
    eventKeywords: ['古墓派', '古墓门下', '古墓弟子', '小龙女弟子', '李莫愁弟子'],
    members: membership([
      { names: ['小龙女'], relation: '掌门', cap: '镇派' },
      { names: ['杨过'], relation: '亲传弟子', cap: '镇派' },
      {
        names: ['李莫愁'],
        relation: '叛门弟子',
        cap: '进阶',
        blockedArts: ['玉女心经', '玉女素心剑法'],
        note: '叛门个人毒功不视作古墓公共传承。',
      },
      { names: ['洪凌波', '陆无双'], relation: '支线弟子', cap: '进阶', confidence: 0.85 },
      { names: ['孙婆婆'], relation: '门内侍从', cap: '基础', confidence: 0.8 },
    ]),
    nodes: [
      supplement(
        '古墓吐纳诀',
        '入门',
        '内功',
        '粗浅',
        '古墓门人静坐守心、调匀呼吸的基础心法，重在收敛情绪并维持细密绵长的内息。',
        [],
        { branch: '内功', common: true },
      ),
      supplement(
        '玉女入门剑式',
        '入门',
        '剑法',
        '粗浅',
        '为玉女剑法准备的基础剑架，要求动作轻灵准确，先练身剑协调而不追求招式威力。',
        ['古墓吐纳诀'],
        { branch: '剑法', common: true },
      ),
      existing('美女拳法', '基础', ['古墓吐纳诀'], { branch: '拳掌', common: true }),
      existing('天罗地网势', '基础', ['古墓吐纳诀'], { branch: '拳掌', common: true }),
      existing('玉蜂针', '基础', ['玉女入门剑式'], { branch: '暗器' }),
      existing('玉女剑法', '进阶', ['玉女入门剑式'], { branch: '剑法', common: true }),
      existing('银索金铃索法', '进阶', ['天罗地网势'], { branch: '索法' }),
      existing('轻功提纵术', '进阶', ['古墓吐纳诀'], { branch: '轻功', common: true }),
      existing('玉女投梭', '进阶', ['玉女剑法'], { branch: '剑法' }),
      existing('玉女心经', '核心', ['古墓吐纳诀', '玉女剑法'], {
        branch: '内功',
        onlyFor: ['小龙女', '杨过'],
      }),
      existing('玉女素心剑法', '镇派', ['玉女心经', '玉女剑法'], {
        branch: '剑法',
        onlyFor: ['小龙女', '杨过'],
        specialConditions: ['双人合练时须两人心意相通'],
      }),
    ],
  },
  {
    id: '丐帮',
    name: '丐帮',
    aliases: ['天下第一大帮'],
    type: '门派',
    positioning: '普通弟子以实战拳脚和阵法为主，帮主绝学与洪七公个人传承严格限流。',
    eventKeywords: ['丐帮', '丐帮弟子', '丐帮长老', '丐帮帮主', '北丐'],
    members: membership([
      { names: ['洪七公'], relation: '前帮主', cap: '镇派' },
      { names: ['黄蓉', '耶律齐'], relation: '继任帮主', cap: '镇派', timePolicy: 'identity' },
      { names: ['鲁有脚'], relation: '帮主或核心长老', cap: '核心', timePolicy: 'identity' },
      { names: ['简长老', '梁长老', '彭长老'], relation: '长老', cap: '核心' },
      {
        names: ['陈姓乞丐', '韩姓乞丐', '胖丐', '瘦丐', '王十三', '余兆兴', '小棒头'],
        relation: '正式帮众',
        cap: '基础',
      },
      {
        names: ['杨康'],
        relation: '假帮主或政治拥立',
        cap: '入门',
        confidence: 0.2,
        autoAssign: false,
        note: '假冒或被拥立身份不产生丐帮武学继承权。',
      },
    ]),
    nodes: [
      supplement(
        '丐帮吐纳诀',
        '入门',
        '内功',
        '粗浅',
        '丐帮弟子在行乞、赶路与露宿中调息养力的通用法门，取其耐久实用而非精纯深奥。',
        [],
        { branch: '内功', common: true },
      ),
      supplement(
        '丐帮基础棍法',
        '入门',
        '棍锤',
        '粗浅',
        '利用竹棒木杖防身的基础棍法，招式直接朴实，为帮众结阵和后续杖法打下根基。',
        [],
        { branch: '棍法', common: true },
      ),
      existing('莲花掌', '基础', ['丐帮吐纳诀'], { branch: '拳掌', common: true }),
      existing('铁帚腿法', '基础', ['丐帮吐纳诀'], { branch: '腿法', common: true }),
      existing('地堂刀法', '基础', ['丐帮基础棍法'], { branch: '刀法' }),
      existing('坚壁阵', '基础', ['丐帮基础棍法'], { branch: '阵法', common: true }),
      existing('莲花落阵', '基础', ['丐帮基础棍法'], { branch: '阵法' }),
      existing('铜锤手', '进阶', ['莲花掌'], { branch: '拳掌' }),
      existing('打狗阵', '进阶', ['坚壁阵'], { branch: '阵法', common: true }),
      existing('逍遥游', '进阶', ['丐帮吐纳诀'], { branch: '拳掌', onlyFor: ['洪七公'] }),
      existing('混天功', '核心', ['丐帮吐纳诀'], {
        branch: '内功',
        onlyFor: ['洪七公', '黄蓉'],
      }),
      existing('打狗大阵', '核心', ['打狗阵'], { branch: '阵法' }),
      existing('降龙十八掌', '镇派', ['混天功'], {
        branch: '拳掌',
        onlyFor: ['洪七公', '黄蓉', '郭靖'],
      }),
      existing('打狗棒法', '镇派', ['丐帮基础棍法'], {
        branch: '棍法',
        onlyFor: ['洪七公', '黄蓉', '鲁有脚', '耶律齐'],
        specialConditions: ['仅限历任帮主或明确指定传人'],
      }),
    ],
  },
  {
    id: '铁掌帮',
    name: '铁掌帮',
    aliases: ['铁掌水上飘一系'],
    type: '门派',
    positioning: '以铁砂练掌、刚猛掌力和水上提纵为主，不另造超越铁掌功的新绝世武学。',
    eventKeywords: ['铁掌帮', '铁掌水上飘', '铁掌帮主'],
    members: membership([
      { names: ['裘千仞'], relation: '帮主', cap: '镇派' },
      { names: ['裘千尺'], relation: '帮主家传支线', cap: '核心', confidence: 0.85 },
      { names: ['乔寨主'], relation: '帮中寨主', cap: '基础', confidence: 0.85 },
      {
        names: ['沙通天'],
        relation: '仅有同名功法变量',
        cap: '入门',
        confidence: 0.2,
        autoAssign: false,
        note: '不能凭“铁掌功”变量反向判定为铁掌帮门人。',
      },
    ]),
    nodes: [
      supplement(
        '铁掌吐纳诀',
        '入门',
        '内功',
        '粗浅',
        '铁掌帮用于沉肩坠肘、稳固下盘的入门吐纳法，为长期练掌和承受反震打下基础。',
        [],
        { branch: '内功', common: true },
      ),
      supplement(
        '铁砂桩功',
        '基础',
        '外功',
        '传家',
        '通过站桩、运气和循序击砂锻炼掌骨与腕臂，是修习铁掌功前必须完成的外门基础。',
        ['铁掌吐纳诀'],
        { branch: '外功', common: true },
      ),
      supplement(
        '水上飘入门身法',
        '基础',
        '轻功',
        '传家',
        '在木桩、浅水和浮板上练习换气借力的基础身法，只求步稳身轻，不等同于上乘水上轻功。',
        ['铁掌吐纳诀'],
        { branch: '轻功', common: true },
      ),
      existing('通臂六合掌', '进阶', ['铁砂桩功'], { branch: '拳掌' }),
      existing('铁掌水上飘', '核心', ['水上飘入门身法'], { branch: '轻功' }),
      existing('铁掌功', '镇派', ['铁砂桩功', '通臂六合掌'], {
        branch: '拳掌',
        onlyFor: ['裘千仞', '裘千尺'],
      }),
    ],
  },
  {
    id: '大理一灯体系',
    name: '大理段氏与一灯门下',
    aliases: ['南帝门下', '一灯门下', '大理段氏'],
    type: '家传与师承',
    positioning: '区分段氏皇族、天龙寺和一灯弟子三支；一灯门下以一阳指为最高传承。',
    eventKeywords: ['一灯门下', '一灯大师弟子', '南帝门下', '大理段氏', '段氏皇族'],
    members: membership([
      { names: ['一灯大师'], relation: '宗师', cap: '镇派' },
      {
        names: ['泗水渔隐', '樵夫', '武三通', '朱子柳'],
        relation: '一灯亲传弟子',
        cap: '核心',
      },
      { names: ['武修文', '武敦儒'], relation: '下一代家传支线', cap: '基础', confidence: 0.75 },
      {
        names: ['天竺僧', '裘千仞'],
        relation: '友方医僧或皈依弟子',
        cap: '入门',
        confidence: 0.35,
        autoAssign: false,
        note: '友方、医术交流或皈依关系不等于获得段氏完整绝学。',
      },
    ]),
    nodes: [
      supplement(
        '南帝门下吐纳诀',
        '入门',
        '内功',
        '粗浅',
        '一灯门下用来安定心神、调和气息的基础吐纳法，为日后凝聚指力和医治经脉作准备。',
        [],
        { branch: '一灯门下', common: true },
      ),
      supplement(
        '一阳基础指诀',
        '基础',
        '指法',
        '传家',
        '练习认穴、运劲与收发的基础指法，只能点按近身穴位，尚不能施展一阳指的深厚指力。',
        ['南帝门下吐纳诀'],
        { branch: '一灯门下', common: true },
      ),
      existing('段家剑', '基础', ['南帝门下吐纳诀'], { branch: '段氏家传', common: true }),
      existing('泥鳅功', '进阶', ['南帝门下吐纳诀'], {
        branch: '渔隐支线',
        onlyFor: ['泗水渔隐'],
      }),
      existing('指笔功', '进阶', ['一阳基础指诀'], { branch: '朱子柳支线', onlyFor: ['朱子柳'] }),
      existing('一阳书指', '进阶', ['指笔功'], { branch: '朱子柳支线', onlyFor: ['朱子柳'] }),
      existing('枯荣禅功', '核心', ['南帝门下吐纳诀'], { branch: '禅功', onlyFor: ['一灯大师'] }),
      existing('一阳指', '镇派', ['一阳基础指诀', '南帝门下吐纳诀'], {
        branch: '一灯门下',
        onlyFor: ['一灯大师', '泗水渔隐', '樵夫', '武三通', '朱子柳'],
      }),
      existing('六脉神剑', '镇派', ['一阳指'], {
        branch: '段氏皇族与天龙寺',
        onlyFor: [],
        autoAssign: false,
        specialConditions: ['仅限段氏皇族或天龙寺明确传人；当前角色不自动分配'],
      }),
    ],
  },
  {
    id: '藏传密宗',
    name: '藏传密宗·金轮一脉',
    aliases: ['西藏密宗', '金轮一脉'],
    type: '门派',
    positioning: '以内功、手印、杵法和重兵器为基础，高层按个人专精分流。',
    eventKeywords: ['西藏密宗', '藏传密宗', '金轮法王弟子', '金轮一脉', '藏僧'],
    members: membership([
      { names: ['金轮法王'], relation: '法王与宗师', cap: '镇派' },
      { names: ['达尔巴', '霍都'], relation: '亲传弟子', cap: '核心' },
    ]),
    nodes: [
      supplement(
        '密宗伏息法',
        '入门',
        '内功',
        '粗浅',
        '配合诵念和静坐调整呼吸的密宗筑基法，先练耐力与定力，再逐步承受刚猛内功。',
        [],
        { branch: '内功', common: true },
      ),
      supplement(
        '密宗基础手印',
        '入门',
        '拳掌',
        '粗浅',
        '将基础掌力与手印变化结合的入门功夫，用于熟悉运劲路线和近身攻防。',
        ['密宗伏息法'],
        { branch: '手印', common: true },
      ),
      worldbook(
        '西藏密宗内功',
        '基础',
        '内功',
        '传家',
        '世界书人物变量中已有的密宗内功体系，作为金轮一脉公共内功基础保留。',
        ['密宗伏息法'],
        { branch: '内功', common: true },
      ),
      worldbook(
        '金刚杵法',
        '基础',
        '棍锤',
        '传家',
        '世界书人物变量中已有的金刚杵基础运用法，适合以沉重兵器近身攻防。',
        ['密宗基础手印'],
        { branch: '杵法', common: true },
      ),
      worldbook(
        '飞掷金杵',
        '进阶',
        '棍锤',
        '上乘',
        '世界书人物变量中已有的重兵器投掷法，以强劲臂力和准确判断完成远距离制敌。',
        ['金刚杵法'],
        { branch: '杵法', onlyFor: ['达尔巴'] },
      ),
      existing('大手印', '进阶', ['密宗基础手印'], { branch: '手印', common: true }),
      existing('无上大力杵法', '进阶', ['金刚杵法'], { branch: '杵法', onlyFor: ['达尔巴'] }),
      existing('大风袖', '进阶', ['西藏密宗内功'], { branch: '霍都支线', onlyFor: ['霍都'] }),
      existing('狂风迅雷功', '核心', ['西藏密宗内功'], { branch: '霍都支线', onlyFor: ['霍都'] }),
      existing('推经转脉', '核心', ['西藏密宗内功'], { branch: '内功', onlyFor: ['金轮法王'] }),
      existing('五轮大法', '核心', ['西藏密宗内功'], { branch: '轮法', onlyFor: ['金轮法王'] }),
      existing('龙象般若功', '镇派', ['西藏密宗内功'], {
        branch: '内功',
        onlyFor: ['金轮法王'],
        specialConditions: ['高层密传，不因普通藏僧身份自动获得'],
      }),
    ],
  },
  {
    id: '绝情谷',
    name: '绝情谷公孙家传',
    aliases: ['绝情谷'],
    type: '家传与庄门',
    positioning: '以闭穴内功、刀剑双刃和多人渔网阵为特色，谷主绝学不向普通谷众普发。',
    eventKeywords: ['绝情谷', '绝情谷谷主', '绝情谷弟子', '公孙家传'],
    members: membership([
      { names: ['公孙止'], relation: '谷主', cap: '镇派' },
      { names: ['公孙绿萼'], relation: '谷主之女与家传支线', cap: '基础', confidence: 0.8 },
      { names: ['樊一翁'], relation: '大弟子', cap: '进阶' },
      {
        names: ['裘千尺'],
        relation: '前谷主夫人与跨体系传授者',
        cap: '基础',
        confidence: 0.45,
        autoAssign: false,
        note: '其核心传承来自铁掌帮，不能反向并入公孙家传。',
      },
    ]),
    nodes: [
      supplement(
        '绝情谷吐纳法',
        '入门',
        '内功',
        '粗浅',
        '绝情谷门人配合谷中清修和兵刃训练使用的基础吐纳法，强调气息内敛和下盘稳定。',
        [],
        { branch: '内功', common: true },
      ),
      supplement(
        '双刃入门式',
        '入门',
        '刀法',
        '粗浅',
        '公孙家刀剑双刃的基础架势，先分别练熟刀剑发力，再训练左右兵刃互换。',
        ['绝情谷吐纳法'],
        { branch: '双刃', common: true },
      ),
      existing('渔网阵', '基础', ['绝情谷吐纳法'], { branch: '阵法', common: true }),
      existing('君子淑女剑', '基础', ['双刃入门式'], { branch: '兵器' }),
      worldbook(
        '阴阳双刃',
        '进阶',
        '刀法',
        '上乘',
        '世界书人物变量中已有的公孙家双兵器功夫，以黑剑和锯齿金刀交错变化。',
        ['双刃入门式'],
        { branch: '双刃', onlyFor: ['公孙止'] },
      ),
      existing('闭穴功夫', '核心', ['绝情谷吐纳法'], { branch: '内功', onlyFor: ['公孙止'] }),
      supplement(
        '绝情谷闭脉玄功',
        '核心',
        '内功',
        '镇派',
        '由绝情谷闭穴功夫补衍出的内功总诀，用于封闭经脉、收束气血并配合双刃绝学。',
        ['绝情谷吐纳法'],
        { branch: '内功', onlyFor: ['公孙止'], originality: '完全原创' },
      ),
      existing('阴阳倒乱刃法', '镇派', ['阴阳双刃', '闭穴功夫'], {
        branch: '双刃',
        onlyFor: ['公孙止'],
      }),
    ],
  },
  {
    id: '白驼山',
    name: '白驼山庄',
    aliases: ['白驼山', '西毒一系'],
    type: '家传',
    positioning: '以西域身法、使毒驭蛇和诡异拳掌为主，蛤蟆功为最高家传。',
    eventKeywords: ['白驼山', '白驼山庄', '西毒传人', '欧阳锋传人'],
    members: membership([
      { names: ['欧阳锋'], relation: '庄主与宗师', cap: '镇派' },
      { names: ['欧阳克'], relation: '少主与家传弟子', cap: '核心' },
      {
        names: ['杨康', '杨过'],
        relation: '短期个人传授或义父支线',
        cap: '基础',
        confidence: 0.6,
        autoAssign: false,
        note: '个人传授不等于继承白驼山完整谱系。',
      },
    ]),
    nodes: [
      supplement(
        '白驼吐纳法',
        '入门',
        '内功',
        '粗浅',
        '白驼山门人适应西域环境并为毒功、柔劲拳法打底的基础吐纳法，强调闭气和耐受。',
        [],
        { branch: '内功', common: true },
      ),
      supplement(
        '白驼驭蛇术',
        '入门',
        '外功',
        '粗浅',
        '通过声息、手势和药物控制毒蛇的基础技艺，本身不是高深武功，但属于白驼山必修专长。',
        [],
        { branch: '驭蛇', common: true },
      ),
      existing('飞燕银梭', '基础', ['白驼驭蛇术'], { branch: '暗器', common: true }),
      existing('连环鸳鸯腿', '基础', ['白驼吐纳法'], { branch: '腿法', common: true }),
      existing('神驼雪山掌', '基础', ['白驼吐纳法'], { branch: '拳掌', common: true }),
      existing('瞬息千里', '进阶', ['白驼吐纳法'], { branch: '轻功', common: true }),
      existing('透骨打穴法', '进阶', ['神驼雪山掌'], { branch: '指法' }),
      existing('铁筝功夫', '进阶', ['白驼吐纳法'], { branch: '音律' }),
      existing('灵蛇拳', '核心', ['白驼驭蛇术', '神驼雪山掌'], { branch: '拳掌' }),
      existing('蛤蟆功', '镇派', ['白驼吐纳法'], {
        branch: '内功',
        onlyFor: ['欧阳锋', '欧阳克'],
      }),
    ],
  },
  {
    id: '蒙古军旅',
    name: '蒙古军旅武学',
    aliases: ['草原军旅体系'],
    type: '军旅',
    positioning: '共享骑射、摔跤、弯刀和军阵，不包装成玄门神功；最高层为统军与精锐合击。',
    eventKeywords: ['蒙古大汗', '蒙古大将', '蒙古四杰', '蒙古王子', '领兵将领', '神箭手', '怯薛'],
    members: membership([
      { names: ['铁木真'], relation: '大汗与统军者', cap: '镇派' },
      {
        names: ['博尔忽', '博尔术', '赤老温', '木华黎', '察合台', '术赤', '窝阔台'],
        relation: '将领或王子',
        cap: '核心',
      },
      {
        names: ['鄂尔多', '忽都虎', '札木合', '哲别', '者勒米', '萨多', '王罕', '桑昆'],
        relation: '草原武士或首领',
        cap: '进阶',
      },
      {
        names: ['郭靖', '霍都'],
        relation: '军职经历或蒙古政治身份',
        cap: '基础',
        confidence: 0.45,
        autoAssign: false,
        note: '政治身份或军职经历不等于继承整套蒙古军旅谱系。',
      },
    ]),
    nodes: [
      existing('蒙古摔跤', '入门', [], { branch: '摔跤', common: true }),
      supplement(
        '草原骑射术',
        '入门',
        '外功',
        '粗浅',
        '草原武士在马背上保持平衡、判断距离并快速开弓的通用训练，是蒙古军旅武艺的基础。',
        [],
        { branch: '骑射', common: true },
      ),
      supplement(
        '马背弯刀术',
        '基础',
        '刀法',
        '传家',
        '适应马匹冲势和单手控缰的弯刀技法，以掠击、回斩和脱离为主要战术。',
        ['草原骑射术'],
        { branch: '骑战', common: true },
      ),
      supplement(
        '套马索法',
        '基础',
        '外功',
        '传家',
        '由套马技艺转化的长索控制法，可在骑战中缠拿兵器、牵制敌人或拖拽目标。',
        ['草原骑射术'],
        { branch: '长索', common: true },
      ),
      supplement(
        '斥候踏沙步',
        '基础',
        '轻功',
        '传家',
        '草原斥候用于长途奔袭、隐蔽接近和保存体力的实用步法，重耐力胜过腾挪花巧。',
        ['草原骑射术'],
        { branch: '身法', common: true },
      ),
      supplement(
        '回马连珠箭',
        '进阶',
        '暗器',
        '上乘',
        '在高速驰马和转向中连续发箭的进阶骑射技，要求骑术、臂力与距离判断同时过关。',
        ['草原骑射术'],
        { branch: '骑射' },
      ),
      supplement(
        '哲别神射术',
        '进阶',
        '暗器',
        '上乘',
        '依据哲别神箭手身份补衍的个人射术节点，强调远距判断、移动射击与一箭制敌。',
        ['草原骑射术'],
        { branch: '个人专精', onlyFor: ['哲别'] },
      ),
      supplement(
        '怯薛合击阵',
        '核心',
        '外功',
        '镇派',
        '精锐怯薛以骑步转换、盾矛掩护和轮番冲击构成的合击军阵，强调整体纪律。',
        ['马背弯刀术', '草原骑射术'],
        { branch: '军阵', minimumRelation: '精锐或将领' },
      ),
      supplement(
        '铁骑合围阵',
        '镇派',
        '外功',
        '镇派',
        '将骑射、诱敌、分割和多翼合围融成的统军战法，只适合能够指挥精锐骑军的高级将领。',
        ['怯薛合击阵', '回马连珠箭'],
        { branch: '统军战法', onlyFor: ['铁木真'], originality: '完全原创' },
      ),
    ],
  },
];

function confidence(score) {
  return { 等级: score >= 0.85 ? '高' : score >= 0.6 ? '中' : '低', 分值: Number(score.toFixed(2)) };
}

function masteryForRealm(realm) {
  return MASTERY_BY_REALM.find(([pattern]) => pattern.test(realm || ''))?.[1] ?? '初窥门径';
}

function databaseIndex(database) {
  return new Map((database.功法 || []).map(item => [canonicalMartialArtName(item.功法名称), item]));
}

function artEvidenceFromMaterialized(materialized, artName) {
  const canonical = canonicalMartialArtName(artName);
  const matches = [];
  for (const record of materialized.records.values()) {
    const artRecord = record.martialArts.get(canonical);
    if (!artRecord) continue;
    for (const change of artRecord.changes) matches.push({ record, change });
  }
  matches.sort((a, b) => {
    const left = a.change.生效时间;
    const right = b.change.生效时间;
    return JSON.stringify(left).localeCompare(JSON.stringify(right));
  });
  if (matches.length === 0) return null;
  const first = matches[0];
  return {
    类型: '世界书人物变量',
    来源文件: first.change.原文件,
    事件: first.change.事件,
    字段路径: `${first.change.原始操作}.${first.change.原始角色键}.功法.${first.change.源功法名}`,
    时间: cloneJson(first.change.生效时间),
    摘要: `${first.record.canonical}的功法变量中出现“${first.change.源功法名}”`,
  };
}

function makeArtBody(spec, databaseByName, materialized, metadata) {
  const canonical = canonicalMartialArtName(spec.name);
  const databaseArt = databaseByName.get(canonical);
  const worldbookEvidence = artEvidenceFromMaterialized(materialized, canonical);
  const isSupplement = spec.source === 'supplement';
  const originality = isSupplement ? (spec.originality ?? '体系补衍') : '非原创';
  const sourceStatus = databaseArt
    ? '功法库明确'
    : spec.source === 'worldbook' && worldbookEvidence
      ? '世界书变量明确'
      : isSupplement
        ? '体系补衍原创'
        : '功法库预期条目缺失';
  return {
    功法ID: `功法::${canonical}`,
    功法: canonical,
    类型: databaseArt?.类型 ?? spec.type ?? '外功',
    功法品阶: databaseArt?.功法品阶 ?? spec.grade ?? '传家',
    功法库状态: databaseArt ? '已收录' : '待新增',
    原创性: {
      原创程度: originality,
      是否原创: originality !== '非原创',
      说明: isSupplement
        ? '为补齐现有门派传承层级而设计，名称与效果均须人工审核。'
        : databaseArt
          ? '现有功法库已有独立条目。'
          : '世界书人物变量已有明确名称，但功法库尚无独立条目。',
    },
    来源状态: sourceStatus,
    功法库信息: databaseArt
      ? {
          类型: databaseArt.类型,
          功法品阶: databaseArt.功法品阶,
          修炼限制: cloneJson(databaseArt.修炼限制 || {}),
        }
      : null,
    待新增草案: databaseArt
      ? null
      : {
          功法名称: canonical,
          类型: spec.type,
          功法品阶: spec.grade,
          功法描述: spec.description,
          修炼限制: cloneJson(spec.trainingLimits || {}),
          状态: '仅审核草案，未写入功法库',
        },
    内容依据: databaseArt
      ? [
          {
            类型: '功法库',
            来源文件: metadata.databasePath,
            事件: null,
            字段路径: `功法[功法名称=${databaseArt.功法名称}]`,
            时间: null,
            摘要: '现有功法库条目',
          },
        ]
      : worldbookEvidence
        ? [worldbookEvidence]
        : [
            {
              类型: '体系补衍',
              来源文件: null,
              事件: null,
              字段路径: null,
              时间: null,
              摘要: '用于补齐该体系现有传承层级的原创候选',
            },
          ],
    审核: { 状态: '待审核', 意见: null },
  };
}

function tierIndex(tier) {
  return INHERITANCE_TIERS.indexOf(tier);
}

function sortedNodes(nodes) {
  return [...nodes].sort(
    (left, right) =>
      tierIndex(left.tier) - tierIndex(right.tier) ||
      (left.branch || '').localeCompare(right.branch || '', 'zh-CN') ||
      left.name.localeCompare(right.name, 'zh-CN'),
  );
}

export function createSectLineageDocument(materialized, database, metadata = {}) {
  const databaseByName = databaseIndex(database);
  const bodySpecs = new Map();
  for (const definition of SECT_LINEAGE_DEFINITIONS) {
    for (const spec of definition.nodes) {
      const canonical = canonicalMartialArtName(spec.name);
      if (!bodySpecs.has(canonical) || bodySpecs.get(canonical).source === 'supplement') bodySpecs.set(canonical, spec);
    }
  }
  const artBodies = [...bodySpecs.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
    .map(([, spec]) => makeArtBody(spec, databaseByName, materialized, metadata));
  const artBodyByName = new Map(artBodies.map(body => [body.功法, body]));
  const lineages = SECT_LINEAGE_DEFINITIONS.map(definition => {
    const nodes = sortedNodes(definition.nodes).map(spec => {
      const artName = canonicalMartialArtName(spec.name);
      const body = artBodyByName.get(artName);
      const affiliationScore = body.原创性.是否原创 ? 0.65 : body.功法库状态 === '已收录' ? 0.95 : 0.9;
      return {
        节点ID: `${definition.id}::${artName}`,
        功法ID: body.功法ID,
        功法: artName,
        传承层级: spec.tier,
        分支: spec.branch ?? '通用',
        是否共通: Boolean(spec.common),
        前置节点: spec.prerequisites.map(prerequisite => ({
          节点ID: `${definition.id}::${canonicalMartialArtName(prerequisite)}`,
          最低掌握程度: '略有小成',
          关系: '必修',
        })),
        学习限制: {
          最低传承资格: spec.minimumRelation ?? (spec.tier === '镇派' ? '掌门、宗师或指定传人' : '门内通传'),
          最低境界: ['无', '三流', '二流', '一流', '绝顶'][tierIndex(spec.tier)],
          属性门槛: cloneJson(body.功法库信息?.修炼限制 ?? body.待新增草案?.修炼限制 ?? {}),
          指定人物: cloneJson(spec.onlyFor ?? []),
          特别条件: cloneJson(spec.specialConditions ?? []),
        },
        允许自动分配: spec.autoAssign !== false,
        归属置信度: confidence(affiliationScore),
        归属依据: body.内容依据,
      };
    });
    const covered = INHERITANCE_TIERS.filter(tier => nodes.some(node => node.传承层级 === tier));
    return {
      门派ID: definition.id,
      门派: definition.name,
      门派别名: definition.aliases,
      体系类型: definition.type,
      设计定位: definition.positioning,
      人物映射边界: Object.entries(definition.members).map(([character, member]) => ({
        角色: character,
        关系类型: member.关系类型,
        最高可分配层级: member.层级上限,
        是否自动分配: member.是否自动分配,
        说明: member.说明,
      })),
      传承节点: nodes,
      层级完整性: {
        已覆盖层级: covered,
        缺失层级: INHERITANCE_TIERS.filter(tier => !covered.includes(tier)),
        说明: covered.length === INHERITANCE_TIERS.length ? '五级传承均有审核节点。' : '非标准门派不强制补齐缺失层级。',
      },
      审核: { 状态: '待审核', 意见: null },
    };
  });
  const nodeCount = lineages.reduce((sum, lineage) => sum + lineage.传承节点.length, 0);
  return {
    schemaVersion: 1,
    生成信息: {
      事实源: metadata.sourceRoot,
      功法库: metadata.databasePath,
      角色功法总表: 'plans/武侠角色功法审计/角色功法总表.json',
      传承层级顺序: INHERITANCE_TIERS,
      功法品阶口径: ['粗浅', '传家', '上乘', '镇派', '绝世', '传说'],
      掌握程度口径: ['初窥门径', '略有小成', '融会贯通', '炉火纯青', '出神入化'],
      原创程度口径: ['非原创', '体系补衍', '完全原创'],
      生成时间: metadata.generatedAt,
      审核原则: [
        '功法本体与门派传承节点分离，同一功法全局只定义一次',
        '镇派层级与功法品阶不是同一概念',
        '小门派和军旅体系不必虚构超自然神功',
        '所有原创节点均为待审候选，不自动写入功法库',
      ],
    },
    统计: {
      门派或体系数: lineages.length,
      功法本体数: artBodies.length,
      传承节点数: nodeCount,
      功法库既有数: artBodies.filter(body => body.功法库状态 === '已收录').length,
      世界书明确但功法库待新增数: artBodies.filter(body => body.来源状态 === '世界书变量明确').length,
      体系补衍数: artBodies.filter(body => body.原创性.原创程度 === '体系补衍').length,
      完全原创数: artBodies.filter(body => body.原创性.原创程度 === '完全原创').length,
    },
    功法目录: artBodies,
    门派列表: lineages,
  };
}

function eventCharacterDelta(event, characterName) {
  const result = [];
  for (const operation of ['insert', 'update', 'delete']) {
    for (const [rawName, delta] of Object.entries(event.definition?.[operation] || {})) {
      if (canonicalCharacterName(rawName) === characterName) result.push({ operation, rawName, delta });
    }
  }
  return result;
}

function eventText(event) {
  return [event.definition?.事件详情, event.definition?.事件概要, event.definition?.事件引子]
    .filter(value => typeof value === 'string')
    .join('\n');
}

function eventTimeReference(event, evidenceType, summary) {
  return {
    依据类型: evidenceType,
    事件: event.runtimeKey,
    原文件: event.sourceName,
    时间: cloneJson(event.effectTime),
    摘要: summary,
  };
}

function findAffiliationEvidence(record, definition, timePolicy = 'evidence-or-debut') {
  const events = [...record.involvedEvents.values()].sort((left, right) => left.effectHour - right.effectHour);
  const profileArts = new Set(definition.nodes.map(node => canonicalMartialArtName(node.name)));
  for (const event of events) {
    for (const { operation, rawName, delta } of eventCharacterDelta(event, record.canonical)) {
      const identityText = JSON.stringify(delta?.身份 || {});
      if (definition.eventKeywords.some(keyword => identityText.includes(keyword))) {
        return eventTimeReference(
          event,
          '身份变量首次明示',
          `${operation}.${rawName}.身份首次出现“${definition.name}”相关归属`,
        );
      }
    }
  }
  if (timePolicy === 'identity') return null;
  for (const event of events) {
    for (const { operation, rawName, delta } of eventCharacterDelta(event, record.canonical)) {
      const changedArts = Object.keys(delta?.功法 || {}).map(canonicalMartialArtName);
      const sameArt = changedArts.find(art => profileArts.has(art));
      if (sameArt) {
        return eventTimeReference(
          event,
          '同系功法变量首次明示',
          `${operation}.${rawName}.功法出现同系功法“${sameArt}”`,
        );
      }
    }
  }
  for (const event of events) {
    const text = eventText(event);
    if (!text.includes(record.canonical)) continue;
    const artName = definition.nodes.map(node => canonicalMartialArtName(node.name)).find(name => text.includes(name));
    if (artName)
      return eventTimeReference(event, '正文同句证据', `正文同句出现角色与同系功法“${artName}”，主动施展关系仍需复核`);
  }
  return null;
}

function findDirectArtEvidence(record, artName) {
  const canonicalArt = canonicalMartialArtName(artName);
  const events = [...record.involvedEvents.values()].sort((left, right) => left.effectHour - right.effectHour);
  for (const event of events) {
    for (const { operation, rawName, delta } of eventCharacterDelta(event, record.canonical)) {
      const changedArt = Object.keys(delta?.功法 || {}).find(name => canonicalMartialArtName(name) === canonicalArt);
      if (changedArt)
        return eventTimeReference(event, '同名功法变量首次明示', `${operation}.${rawName}.功法出现“${changedArt}”`);
    }
  }
  const aliases = [record.canonical, ...record.aliases, ...record.rawKeys];
  for (const event of events) {
    const sentences = eventText(event)
      .split(/[。！？；\n]/)
      .map(sentence => sentence.trim())
      .filter(Boolean);
    const sentence = sentences.find(
      item => item.includes(canonicalArt) && isActiveUseSentence(item, aliases, canonicalArt),
    );
    if (sentence)
      return eventTimeReference(event, '正文明确施展', `${record.canonical}主动施展“${canonicalArt}”：${sentence}`);
  }
  return null;
}

function currentArtMap(characterState) {
  const powers = characterState?.功法;
  return powers && typeof powers === 'object' && !Array.isArray(powers) ? powers : {};
}

function restrictionCheck(characterState, node, artBody) {
  const attributes = characterState.初始属性 || {};
  const requirements = artBody.功法库信息?.修炼限制 ?? artBody.待新增草案?.修炼限制 ?? {};
  const checks = [];
  let failed = false;
  let unknown = false;
  for (const [attribute, required] of Object.entries(requirements)) {
    if (!Number.isFinite(required)) continue;
    const actual = Number(attributes[attribute]);
    const result = Number.isFinite(actual) ? (actual >= required ? '满足' : '不满足') : '信息不足';
    if (result === '不满足') failed = true;
    if (result === '信息不足') unknown = true;
    checks.push({
      字段: attribute,
      要求: required,
      实际: Number.isFinite(actual) ? actual : null,
      结果: result,
      依据: '角色最终初始属性',
    });
  }
  checks.push({
    字段: '最高传承层级',
    要求: node.传承层级,
    实际: node.传承层级,
    结果: '满足',
    依据: '静态人物关系上限已在筛选阶段检查',
  });
  return { 结论: failed ? '不满足' : unknown ? '信息不足' : '满足', 检查项: checks };
}

function timeSuggestion(record, evidence, allowDebutFallback = true, suggestedArt = null) {
  if (evidence) {
    const provesSuggestedArt = suggestedArt && evidence.摘要.includes(`“${suggestedArt}”`);
    return {
      性质: provesSuggestedArt ? '功法首次证实' : '归属首次证实',
      边界: '不晚于',
      建议写入位置: '待定',
      事件: evidence.事件,
      原文件: evidence.原文件,
      时间: cloneJson(evidence.时间),
      时间依据: `${evidence.依据类型}；${provesSuggestedArt ? '只证明不晚于此时已经会' : '只证明该体系关系，不证明此功法已获得'}`,
    };
  }
  if (allowDebutFallback && record.firstAppearance) {
    return {
      性质: '登场前已掌握候选',
      边界: '不晚于',
      建议写入位置: '登场事件insert',
      事件: record.firstAppearance.事件,
      原文件: record.firstAppearance.原文件,
      时间: cloneJson(record.firstAppearance.时间),
      时间依据: '只有静态门派关系，需人工确认该关系在登场时是否已经成立',
    };
  }
  return {
    性质: '待定',
    边界: null,
    建议写入位置: '待定',
    事件: null,
    原文件: null,
    时间: null,
    时间依据: '没有安全的首次证实时点',
  };
}

function targetCountForCap(cap) {
  return [1, 2, 3, 4, 5][tierIndex(cap)] ?? 1;
}

function suggestionSort(left, right, artBodyById, characterName, cap) {
  const leftBody = artBodyById.get(left.功法ID);
  const rightBody = artBodyById.get(right.功法ID);
  const leftSource = leftBody.原创性.是否原创 ? 1 : 0;
  const rightSource = rightBody.原创性.是否原创 ? 1 : 0;
  const leftDesignated = left.学习限制.指定人物.includes(characterName) ? 0 : 1;
  const rightDesignated = right.学习限制.指定人物.includes(characterName) ? 0 : 1;
  const highRank = tierIndex(cap) >= tierIndex('核心');
  if (leftDesignated !== rightDesignated) return leftDesignated - rightDesignated;
  if (leftSource !== rightSource) return leftSource - rightSource;
  if (highRank && tierIndex(left.传承层级) !== tierIndex(right.传承层级))
    return tierIndex(right.传承层级) - tierIndex(left.传承层级);
  return (
    Number(!left.是否共通) - Number(!right.是否共通) ||
    tierIndex(left.传承层级) - tierIndex(right.传承层级) ||
    left.功法.localeCompare(right.功法, 'zh-CN')
  );
}

export function createSectAssignmentCandidatesDocument(materialized, lineageDocument, metadata = {}) {
  const lineageById = new Map(lineageDocument.门派列表.map(lineage => [lineage.门派ID, lineage]));
  const artBodyById = new Map(lineageDocument.功法目录.map(body => [body.功法ID, body]));
  const characters = new Map();
  const excluded = [];

  for (const definition of SECT_LINEAGE_DEFINITIONS) {
    const lineage = lineageById.get(definition.id);
    for (const [characterName, member] of Object.entries(definition.members)) {
      const record = materialized.records.get(characterName);
      if (!record) continue;
      const characterState = materialized.state[characterName] || {};
      if (!member.是否自动分配) {
        excluded.push({
          角色: characterName,
          门派ID: definition.id,
          关系类型: member.关系类型,
          原因: member.说明 || '该关系不足以自动推定完整门派传承',
        });
        continue;
      }
      if (NON_MARTIAL_REALM_PATTERN.test(characterState.境界 || '')) {
        excluded.push({
          角色: characterName,
          门派ID: definition.id,
          关系类型: member.关系类型,
          原因: `境界“${characterState.境界}”明确为非武学角色，不因身份关系补功法`,
        });
        continue;
      }

      const currentPowers = currentArtMap(characterState);
      const currentCanonical = new Set(Object.keys(currentPowers).map(canonicalMartialArtName));
      const historicalCanonical = new Set(record.martialArts.keys());
      const profileArtNames = new Set(lineage.传承节点.map(node => node.功法));
      const currentSame = [...currentCanonical]
        .filter(art => profileArtNames.has(art))
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
      const historicalSame = [...historicalCanonical]
        .filter(art => profileArtNames.has(art))
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
      const target = targetCountForCap(member.层级上限);
      const gap = Math.max(0, target - currentSame.length);
      const eligible = lineage.传承节点
        .filter(node => node.允许自动分配)
        .filter(node => tierIndex(node.传承层级) <= tierIndex(member.层级上限))
        .filter(node => node.学习限制.指定人物.length === 0 || node.学习限制.指定人物.includes(characterName))
        .filter(node => !member.禁止功法.includes(node.功法))
        .filter(node => !currentCanonical.has(node.功法) && !historicalCanonical.has(node.功法))
        .sort((left, right) => suggestionSort(left, right, artBodyById, characterName, member.层级上限));
      const evidence = findAffiliationEvidence(record, definition, member.时间口径);
      const currentIdentityText = JSON.stringify(characterState.身份 || {});
      const currentIdentitySupports = definition.eventKeywords.some(keyword => currentIdentityText.includes(keyword));
      const selected = eligible.slice(0, Math.min(gap, 3));
      const suggestions = [];
      const rejectedSuggestions = [];
      for (const node of selected) {
        const body = artBodyById.get(node.功法ID);
        const check = restrictionCheck(characterState, node, body);
        const directEvidence = findDirectArtEvidence(record, node.功法);
        const directArtEvidence = Boolean(directEvidence);
        if (check.结论 === '不满足' && directArtEvidence) {
          check.结论 = '事实证据优先，属性冲突待审';
          check.检查项.push({
            字段: '世界书事实证据',
            要求: '角色已明确拥有或施展该功法',
            实际: directEvidence.摘要,
            结果: '覆盖纯属性推断',
            依据: directEvidence.事件,
          });
        }
        const assignmentScore = directArtEvidence ? 0.95 : body.原创性.是否原创 ? 0.58 : 0.74;
        const finalScore = Math.min(member.归属置信度, node.归属置信度.分值, assignmentScore);
        const suggestion = {
          节点ID: node.节点ID,
          功法ID: node.功法ID,
          功法: node.功法,
          来源门派ID: definition.id,
          传承层级: node.传承层级,
          建议操作: 'insert',
          分配策略: body.原创性.是否原创 ? '补齐门派传承缺层' : '补齐门派共通或角色专精',
          建议掌握程度: masteryForRealm(characterState.境界),
          限制检查: check,
          依据: [
            {
              类型: '角色门派关系',
              来源文件: evidence?.原文件 ?? record.firstAppearance?.原文件 ?? null,
              事件: evidence?.事件 ?? record.firstAppearance?.事件 ?? null,
              字段路径: '身份/功法/正文证据',
              时间: cloneJson(evidence?.时间 ?? record.firstAppearance?.时间 ?? null),
              摘要: `${member.关系类型}，最高只审到“${member.层级上限}”`,
            },
            {
              类型: '门派谱系节点',
              来源文件: 'plans/武侠角色功法审计/门派功法谱系.json',
              事件: null,
              字段路径: `门派列表[门派ID=${definition.id}].传承节点[节点ID=${node.节点ID}]`,
              时间: null,
              摘要: `该功法位于“${node.传承层级}”层`,
            },
            ...(directEvidence
              ? [
                  {
                    类型: directEvidence.依据类型,
                    来源文件: directEvidence.原文件,
                    事件: directEvidence.事件,
                    字段路径: '功法变量或事件正文',
                    时间: cloneJson(directEvidence.时间),
                    摘要: directEvidence.摘要,
                  },
                ]
              : []),
          ],
          置信度: confidence(finalScore),
          置信度构成: {
            角色归属: confidence(member.归属置信度),
            功法归属: node.归属置信度,
            分配合理性: confidence(assignmentScore),
            计算方式: '取三项最低分',
          },
          原创性: body.原创性,
          功法库状态: body.功法库状态,
          时间建议: timeSuggestion(record, directEvidence ?? evidence, member.时间口径 !== 'identity', node.功法),
          需要人工复核: true,
        };
        if (check.结论 === '不满足')
          rejectedSuggestions.push({ ...suggestion, 排除原因: '当前属性明确不满足修炼限制' });
        else suggestions.push(suggestion);
      }

      const entry = characters.get(characterName) ?? {
        角色: characterName,
        原始角色键: [...record.rawKeys].sort((a, b) => a.localeCompare(b, 'zh-CN')),
        已确认别名: [...record.aliases]
          .filter(alias => alias !== characterName)
          .sort((a, b) => a.localeCompare(b, 'zh-CN')),
        当前快照: {
          境界: characterState.境界 ?? null,
          身份: cloneJson(characterState.身份 || {}),
          当前功法: [...currentCanonical].sort((a, b) => a.localeCompare(b, 'zh-CN')),
          历史功法: [...historicalCanonical].sort((a, b) => a.localeCompare(b, 'zh-CN')),
        },
        门派归属候选: [],
        建议分配: [],
        排除建议: [],
        需要人工复核: true,
      };
      entry.门派归属候选.push({
        门派ID: definition.id,
        门派: definition.name,
        归属类型: member.关系类型,
        归属置信度: confidence(member.归属置信度),
        有效时间范围: {
          开始: cloneJson(evidence?.时间 ?? null),
          结束: null,
          时间状态: evidence
            ? currentIdentitySupports || member.时间口径 !== 'identity'
              ? '首次证实；不等同于获得时点'
              : '关系曾明确出现，但最终身份已不再明示；结束点待追踪'
            : '待人工确认',
        },
        当前身份仍明示该关系: currentIdentitySupports,
        建议层级上限: member.层级上限,
        上限原因: member.说明 ?? `按“${member.关系类型}”设置，境界只影响掌握程度，不单独抬升传承层级`,
        当前同系功法: currentSame,
        历史同系功法: historicalSame,
        建议目标数量: target,
        当前数量缺口: gap,
        依据: evidence ? [evidence] : [],
      });
      entry.建议分配.push(...suggestions);
      entry.排除建议.push(...rejectedSuggestions);
      characters.set(characterName, entry);
    }
  }

  const characterList = [...characters.values()]
    .map(character => ({
      ...character,
      门派归属候选: character.门派归属候选.sort((a, b) => a.门派ID.localeCompare(b.门派ID, 'zh-CN')),
      建议分配: character.建议分配.sort(
        (a, b) =>
          a.来源门派ID.localeCompare(b.来源门派ID, 'zh-CN') ||
          tierIndex(a.传承层级) - tierIndex(b.传承层级) ||
          a.功法.localeCompare(b.功法, 'zh-CN'),
      ),
    }))
    .filter(character => character.建议分配.length > 0 || character.排除建议.length > 0)
    .sort((a, b) => a.角色.localeCompare(b.角色, 'zh-CN'));
  const allSuggestions = characterList.flatMap(character => character.建议分配);
  return {
    schemaVersion: 1,
    生成信息: {
      门派功法谱系: 'plans/武侠角色功法审计/门派功法谱系.json',
      角色功法总表: 'plans/武侠角色功法审计/角色功法总表.json',
      角色功法补全候选: 'plans/武侠角色功法审计/角色功法补全候选.json',
      时间口径: '普通事件按结束时间、登场事件按触发时间生效；归属首次证实不伪装成功法获得事件',
      生成时间: metadata.generatedAt,
      分配原则: [
        '正式门人、旁支、短期师承、政治身份与军旅体系分别处理',
        '境界只用于掌握程度和属性限制，不单独抬升最高传承层级',
        '当前已拥有或历史已删除的同名功法不重复建议',
        '镇派绝学只给指定人物、掌门或明确传人',
        '最终置信度取角色归属、功法归属与分配合理性三者最低值',
        '所有建议均为审核候选，不自动写回事件、角色或功法库',
      ],
    },
    统计: {
      候选角色数: characterList.length,
      门派关系数: characterList.reduce((sum, character) => sum + character.门派归属候选.length, 0),
      建议分配数: allSuggestions.length,
      非原创建议数: allSuggestions.filter(item => !item.原创性.是否原创).length,
      体系补衍建议数: allSuggestions.filter(item => item.原创性.原创程度 === '体系补衍').length,
      完全原创建议数: allSuggestions.filter(item => item.原创性.原创程度 === '完全原创').length,
      高置信建议数: allSuggestions.filter(item => item.置信度.等级 === '高').length,
      中置信建议数: allSuggestions.filter(item => item.置信度.等级 === '中').length,
      低置信建议数: allSuggestions.filter(item => item.置信度.等级 === '低').length,
      排除关系数: excluded.length,
      属性不满足建议数: characterList.reduce((sum, character) => sum + character.排除建议.length, 0),
    },
    候选角色: characterList,
    排除记录: excluded.sort(
      (a, b) => a.角色.localeCompare(b.角色, 'zh-CN') || a.门派ID.localeCompare(b.门派ID, 'zh-CN'),
    ),
  };
}

function scoreMatchesLevel(item) {
  const expected = item.分值 >= 0.85 ? '高' : item.分值 >= 0.6 ? '中' : '低';
  return item.分值 >= 0 && item.分值 <= 1 && item.等级 === expected;
}

export function validateSectReviewDocuments(lineageDocument, assignmentDocument, database, materialized) {
  const errors = [];
  const bodyIds = new Set();
  const bodyById = new Map();
  const databaseByName = databaseIndex(database);
  for (const body of lineageDocument.功法目录) {
    if (bodyIds.has(body.功法ID)) errors.push(`重复功法ID: ${body.功法ID}`);
    bodyIds.add(body.功法ID);
    bodyById.set(body.功法ID, body);
    if (body.原创性.是否原创 !== (body.原创性.原创程度 !== '非原创')) errors.push(`原创标记不一致: ${body.功法}`);
    const databaseArt = databaseByName.get(body.功法);
    if (body.功法库状态 === '已收录') {
      if (!databaseArt) errors.push(`标记已收录但功法库缺失: ${body.功法}`);
      else if (databaseArt.类型 !== body.类型 || databaseArt.功法品阶 !== body.功法品阶)
        errors.push(`功法库字段漂移: ${body.功法}`);
    }
  }
  const nodeIds = new Set();
  const nodeById = new Map();
  for (const lineage of lineageDocument.门派列表) {
    for (const node of lineage.传承节点) {
      if (nodeIds.has(node.节点ID)) errors.push(`重复节点ID: ${node.节点ID}`);
      nodeIds.add(node.节点ID);
      nodeById.set(node.节点ID, node);
      if (!bodyIds.has(node.功法ID)) errors.push(`节点引用不存在功法: ${node.节点ID}`);
      if (!scoreMatchesLevel(node.归属置信度)) errors.push(`节点置信度非法: ${node.节点ID}`);
    }
  }
  for (const node of nodeById.values()) {
    for (const prerequisite of node.前置节点) {
      const prerequisiteNode = nodeById.get(prerequisite.节点ID);
      if (!prerequisiteNode) errors.push(`前置节点不存在: ${node.节点ID} -> ${prerequisite.节点ID}`);
      else if (prerequisiteNode.节点ID === node.节点ID) errors.push(`节点自引用: ${node.节点ID}`);
      else if (tierIndex(prerequisiteNode.传承层级) > tierIndex(node.传承层级))
        errors.push(`前置层级倒挂: ${node.节点ID} -> ${prerequisite.节点ID}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(nodeId) {
    if (visiting.has(nodeId)) {
      errors.push(`传承图存在环: ${nodeId}`);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const prerequisite of nodeById.get(nodeId)?.前置节点 || []) visit(prerequisite.节点ID);
    visiting.delete(nodeId);
    visited.add(nodeId);
  }
  for (const nodeId of nodeIds) visit(nodeId);

  for (const character of assignmentDocument.候选角色) {
    if (!materialized.records.has(character.角色)) errors.push(`分配引用不存在角色: ${character.角色}`);
    const current = new Set(character.当前快照.当前功法);
    const history = new Set(character.当前快照.历史功法);
    for (const suggestion of character.建议分配) {
      if (!nodeIds.has(suggestion.节点ID)) errors.push(`分配引用不存在节点: ${suggestion.节点ID}`);
      if (!bodyIds.has(suggestion.功法ID)) errors.push(`分配引用不存在功法: ${suggestion.功法ID}`);
      if (current.has(suggestion.功法) || history.has(suggestion.功法))
        errors.push(`重复建议现有或历史功法: ${character.角色}/${suggestion.功法}`);
      if (!scoreMatchesLevel(suggestion.置信度)) errors.push(`分配置信度非法: ${character.角色}/${suggestion.功法}`);
      if (suggestion.原创性.是否原创 !== (suggestion.原创性.原创程度 !== '非原创'))
        errors.push(`分配原创标记不一致: ${character.角色}/${suggestion.功法}`);
    }
  }
  const suggestions = assignmentDocument.候选角色.flatMap(character => character.建议分配);
  if (assignmentDocument.统计.建议分配数 !== suggestions.length) errors.push('分配统计漂移: 建议分配数');
  if (lineageDocument.统计.功法本体数 !== lineageDocument.功法目录.length) errors.push('谱系统计漂移: 功法本体数');
  if (
    lineageDocument.统计.传承节点数 !==
    lineageDocument.门派列表.reduce((sum, lineage) => sum + lineage.传承节点.length, 0)
  )
    errors.push('谱系统计漂移: 传承节点数');
  return errors;
}
