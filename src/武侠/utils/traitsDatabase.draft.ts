/**
 * 人物特质数据库（草稿/完整重构方案）
 *
 * 统一规范：
 * - 品阶与花费采用“机械收益 + Prompt收益”两轴递推，不再只按某个单一数值字段定阶：
 *   1. 先判极性：数值、限制或 Prompt 的核心结果若为净负面，统一归入“缺陷（残缺档）”，再按严重度返还 -3 / -6 / -10 / -20 点。
 *   2. 正面两轴分别估强度：无=0、弱=1、中=2、强=3、极强=4。机械轴包括属性、折扣、门槛偏移、限制豁免等；Prompt 轴包括关系、因果、免疫、救援、情境倍率等实际叙事收益。
 *   3. 两轴综合递推：0=粗浅(3点)，1=传家(8点)，2=上乘(14点)，3=镇派(18点)，4=绝世(24点)，5及以上=传说(30点)。
 *   4. 同一轴内若同时存在多项弱收益，可合并视为中等或更高强度；“弱机械 + 弱 Prompt”也应自然递推到上乘。
 *   5. Prompt 效果不要求全部前端结构化。难以机制化的复杂剧情因果可以继续只存在于 description 中，但定阶时必须按它真正能给角色带来的收益强度计入，不能因为“只写在 Prompt”就当作纯风味降阶。
 * - 粗浅只用于既无结构化正面收益、也没有实质正面 Prompt 权限的纯风味/性格项。
 * - 两轴规则只作为人工审视与定价依据，不额外引入评分字段或运行时审计结构；rank / cost 直接按规则手填。
 * - 分类：天资 | 体质 | 性情 | 气质 | 命格 | 缺陷（彻底移除“经历”与“专长”）。
 */

import type { CharacterTrait } from '../types';


/**
 * 普通人物特质常量列表（重构草稿）
 */
export const CHARACTER_TRAITS_DRAFT: CharacterTrait[] = [
  // ============================================
  // 一、武道天资与技艺风格（天资）
  // ============================================
  // 基础与低阶武道项（具体品阶以两轴递推后的 rank/cost 为准）
  {
    name: '弹指生风',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '指腕机巧灵活，指劲拿捏妙至颠毫，随手飞掷石子暗器便具破空之势。',
    discounts: { martialTypeDiscount: { 暗器: 0.15 } },
  },
  {
    name: '玲珑巧手',
    rank: '上乘',
    category: '天资',
    cost: 14,
    description: '十指纤细灵活，擅长开锁、拆装机括与细致手工，操控暗器机括亦有天赋。',
    discounts: { martialTypeDiscount: { 暗器: 0.1 } },
  },
  {
    name: '草上飞',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '下盘轻快灵巧，折转腾挪极具天分，跋山涉水或穿街过巷如履平地。',
    discounts: { martialTypeDiscount: { 轻功: 0.15 } },
  },
  {
    name: '尝药辨草',
    rank: '粗浅',
    category: '天资',
    cost: 3,
    description: '略识百草药性，采集山野药材时偶能辨识良药，对医理有天然灵性。',
  },

  // 进阶武道项
  {
    name: '沙场本能',
    rank: '上乘',
    category: '天资',
    cost: 14,
    description: '面对多人围逼临危不乱，擅察群敌进退方位，极善利用丈八长兵的空间之利掌控方圆。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 枪戟: 0.25 } },
  },
  {
    name: '临机迅捷',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '灵台警觉，应变若电。惊变骤起、杀机暗露或遭逢机关突变之际机断立决，往往最先回神回护，举止利落绝无迟滞。',
    attributeModifiers: { 机敏: 10 },
  },
  {
    name: '触类旁通',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '武学悟性出众，举一反三，研习招式效率过人。',
    discounts: { savvyRequirementOffset: -1 },
  },

  // 复合武道项
  {
    name: '身如鬼魅',
    rank: '镇派',
    category: '天资',
    cost: 18,
    description: '身形轻捷，手随心运，擅长一切走轻灵巧变一路的武学与兵刃。',
    attributeModifiers: { 机敏: 15 },
    discounts: { martialTypeDiscount: { 剑法: 0.15, 暗器: 0.15, 轻功: 0.15 } },
  },
  {
    name: '袖中藏锋',
    rank: '上乘',
    category: '天资',
    cost: 14,
    description: '十指如兰花弄影，精通细微机括藏纳与拆解，于袖箭、飞针等隐蔽暗器上手极快。',
    attributeModifiers: { 洞察: 10, 机敏: 10 },
    discounts: { martialTypeDiscount: { 暗器: 0.2 } },
  },
  {
    name: '药王转世',
    rank: '绝世',
    category: '天资',
    cost: 24,
    description: '对药性、脉象与人体经络参悟极快，研习医理药道无师自通，丹药吸收与疗伤药效极佳。',
    attributeModifiers: { 气血: 15, 内力: 15 },
  },

  // 高阶武道项
  {
    name: '剑心通明',
    rank: '镇派',
    category: '天资',
    cost: 18,
    description: '天生剑心，观剑极具慧眼，能洞察招式虚实与剑路转折之精微；研习诸派剑经时往往能早一步参透奥妙关窍。',
    attributeModifiers: { 洞察: 15 },
    discounts: { martialTypeDiscount: { 剑法: 0.2 } },
  },
  {
    name: '武学奇才',
    rank: '镇派',
    category: '天资',
    cost: 18,
    description: '天生百脉具通的绝代奇才，任何深奥武功一看便懂，极难遇到修炼瓶颈。',
    discounts: { savvyRequirementOffset: -2, globalUpgradeDiscount: 0.15 },
  },

  // ============================================
  // 二、肉身体魄与经脉内息（体质）
  // ============================================
  // 基础体质项
  {
    name: '筋骨精实',
    rank: '传家',
    category: '体质',
    cost: 8,
    description: '生来体格健旺，精神充沛，耐得长途跋涉、饥寒劳顿，寻常风寒小恙也不易伤及元气。',
    attributeModifiers: { 根骨: 10 },
  },

  // 进阶体质项
  {
    name: '铜皮铁骨',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '天生筋厚骨密，肉搏摔打之下耐受远胜常人，不惧寻常刀棍磕碰。',
    attributeModifiers: { 根骨: 15, 气血: 15 },
  },
  {
    name: '身轻如燕',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '身骨轻灵若无物，掠水踏叶不留痕，修习高深提纵身法极易领会其中关窍。',
    attributeModifiers: { 机敏: 10 },
    discounts: { martialTypeDiscount: { 轻功: 0.25 } },
  },
  {
    name: '铁骨铜掌',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '掌骨坚厚，腕肘硬朗，天生一副修炼外家拳掌功夫的强健体格。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 拳掌: 0.25 } },
  },
  {
    name: '丹田气海',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '天生气海宽厚渊深，经络通达，运功调息时真气沛然莫御。',
    attributeModifiers: { 内力: 15 },
    discounts: { martialTypeDiscount: { 内功: 0.15 } },
  },

  // 复合性情项
  {
    name: '沉岳重劲',
    rank: '镇派',
    category: '体质',
    cost: 18,
    description: '骨重筋强，身藏沉岳之劲，天生适合驾驭厚拙沉兵与大开大阖的刚猛劲力。',
    attributeModifiers: { 臂力: 15 },
    discounts: { martialTypeDiscount: { 刀法: 0.15, 枪戟: 0.15, 拳掌: 0.15 } },
  },
  {
    name: '百毒不侵',
    rank: '镇派',
    category: '体质',
    cost: 18,
    description: '体质奇异或服食过天地奇草，寻常草木蛇蝎剧毒入口如饮寻常茶汤。',
    attributeModifiers: { 根骨: 15 },
  },

  // 高阶性情项
  {
    name: '金刚不坏',
    rank: '镇派',
    category: '体质',
    cost: 18,
    description: '筋骨若精钢交铸，气血如烘炉初沸，是百里挑一的外家横练巅峰胚子。',
    attributeModifiers: { 根骨: 25, 气血: 25 },
  },
  {
    name: '化毒入髓',
    rank: '镇派',
    category: '体质',
    cost: 18,
    description: '以身纳毒淬炼肉身，周身血液化为剧毒，筋脉对诸多剧毒产生免疫适应。',
    attributeModifiers: { 气血: 15, 内力: 15 },
  },
  {
    name: '绿帽神功',
    rank: '传说',
    category: '体质',
    cost: 30,
    description: '异种玄异体质。心念与道侣紧密相连，每当心爱之人与其他男子亲密或私通时，心境不怒不崩，体内真气反若狂潮激荡逆流，修炼进境十倍暴增！',
    attributeModifiers: { 内力: 20, 气血: 15 },
  },

  // 极高阶体质项
  {
    name: '九阳之体',
    rank: '绝世',
    category: '体质',
    cost: 24,
    description: '天生纯阳经脉，阳气如日中天，是修炼至阳武学的绝佳体质，诸邪难侵。',
    attributeModifiers: { 内力: 25, 气血: 20 },
  },
  {
    name: '至阴之体',
    rank: '绝世',
    category: '体质',
    cost: 24,
    description: '体质阴寒玄幽，内息冷冽如霜，极利于修习阴柔与幽微武学。',
    attributeModifiers: { 内力: 25, 机敏: 15 },
  },
  {
    name: '本命蛊王',
    rank: '绝世',
    category: '体质',
    cost: 24,
    description: '心脉深处育有一尊南疆蛊王，遇凶险毒瘴与诡谲异蛊自发长鸣示警；寻常毒虫近身多有畏缩，极利于察觉周遭中蛊之人的微弱气息。',
    attributeModifiers: { 气血: 20, 根骨: 15 },
  },
  {
    name: '紫气东来',
    rank: '传说',
    category: '体质',
    cost: 30,
    description: '先天玄门灵胎，清晨吞吐朝霞紫气，百脉温润纯阳；根骨清奇易得道门名宿青眼，吐纳修持清静正宗内家功夫格外圆融相契。',
    attributeModifiers: { 内力: 30, 根骨: 20, 气血: 20 },
  },

  // ============================================
  // 三、心性脾气与为人处世（性情）
  // ============================================
  // 基础体质项：纯性格或自虐整活向（无数值加成，纯Prompt）
  {
    name: '古灵精怪',
    rank: '粗浅',
    category: '性情',
    cost: 3,
    description: '心思机变跳脱，言语俏皮不喜拘泥凡俗礼法；行事出人意表，常有天马行空之思，极擅另辟蹊径化解死局难题。',
  },
  {
    name: '尊师重道',
    rank: '粗浅',
    category: '性情',
    cost: 3,
    description: '极重师门恩义与同门之谊，言必称师尊长辈教诲，行事严守规矩门风，深得门派宿老青睐与同门拥戴。',
  },
  {
    name: '丹心侠骨',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '侠肝义胆，骨鲠宁折不弯。路见不平一身浩然正气必拔刀相助，虽易招惹是非凶险，却深得市井百姓与武林正道交口传颂。',
  },
  {
    name: '移花接木',
    rank: '上乘',
    category: '命格',
    cost: 14,
    description: '命带离合奇缘，易遭伴侣背叛却甘愿替他人抚育螟蛉子且视若己出；所抚养子女的功法领悟与武学进境，冥冥中会与自身百脉同步映照提升。',
  },
  {
    name: '枯木蛰伏',
    rank: '上乘',
    category: '性情',
    cost: 14,
    description: '极擅借助环境收敛生息，耐性如铁，可为达成目的在恶劣环境下潜伏数日静候良机。',
  },

  // 进阶体质项：显著性格倾向或单一机制
  {
    name: '剑痴',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '对剑有着近乎偏执的痴迷，研习剑法事半功倍，但对其他兵刃兴致缺缺。',
    discounts: { martialTypeDiscount: { 剑法: 0.25 } },
  },
  {
    name: '嗜战如狂',
    rank: '绝世',
    category: '性情',
    cost: 24,
    description: '见强则喜，好武成痴。尤爱与成名高手拆招死斗，越逢险局越全神贯注；对劈砍冲杀有异乎常人的热情，战罢常反复琢磨敌我招式得失。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 刀法: 0.2, 枪戟: 0.2 } },
  },
  {
    name: '大隐抱拙',
    rank: '上乘',
    category: '性情',
    cost: 14,
    description: '大隐隐于市。不着华服时神态平实朴素，混迹市井如寻常布衣，等闲难察其武学深浅；参研功法极擅静心默悟，不显山露水。',
    discounts: { savvyRequirementOffset: -1 },
  },
  {
    name: '红颜知己',
    rank: '上乘',
    category: '性情',
    cost: 14,
    description: '极擅倾听异性在伴侣面前无法启齿的委屈，善于在他人情感裂隙中获得深厚信任与依赖。',
  },
  {
    name: '放下屠刀',
    rank: '上乘',
    category: '性情',
    cost: 14,
    description: '曾染血海杀业后大彻大悟，眉宇常带自省与度人之意；面对仇家怨怼寻仇坦然受责，往往能以至诚悔悟动摇顽敌杀心，化解宿怨。',
  },
  {
    name: '夺妻之恨',
    rank: '上乘',
    category: '性情',
    cost: 14,
    description: '至爱被夺或遭奸人残害后煞气郁结于心，视仇家与轻薄浪子如寇仇；言语冷冽绝情，临阵出招杀伐决绝、招招直取要害。',
    attributeModifiers: { 臂力: 10 },
  },

  // 复合性情项
  {
    name: '嗜武如命',
    rank: '上乘',
    category: '性情',
    cost: 14,
    description: '将武道视为生命，无时无刻不在揣摩切磋，全流派功法精进速度均获得提升。',
    discounts: { globalUpgradeDiscount: 0.1 },
  },

  // 高阶性情项
  {
    name: '临阵无惧',
    rank: '绝世',
    category: '性情',
    cost: 24,
    description: '泰山崩于前而色不变。越是刀光压顶、深陷重围，心神越沉稳如磐石；生死关头仍能稳住气息分辨虚实，绝无畏难退缩之意。',
    attributeModifiers: { 臂力: 15, 气血: 10 },
    discounts: { martialTypeDiscount: { 枪戟: 0.2, 刀法: 0.15 } },
  },

  // 极高阶性情项
  {
    name: '太上忘情',
    rank: '绝世',
    category: '性情',
    cost: 24,
    description: '历尽红尘斩断情丝羁绊，心湖如古井照月。荣辱毁誉、美色恐吓皆难掀起波澜，临事抽身于七情之外，参悟高深武道犹如明镜止水。',
    discounts: { savvyRequirementOffset: -3, globalUpgradeDiscount: 0.15 },
  },

  // ============================================
  // 四、容貌神采与外在风姿（气质）
  // ============================================
  // 基础体质项：纯外在日常风味
  {
    name: '眉清目秀',
    rank: '传家',
    category: '气质',
    cost: 8,
    description: '长相干净讨喜，初见之时容易获得江湖长辈与市井豪客的好感照拂。',
  },
  {
    name: '和光同尘',
    rank: '上乘',
    category: '气质',
    cost: 14,
    description: '五官与气韵平淡如微尘，走入市井闹市便如滴水入海；脱战数日后，寻常江湖客与交手之人极易将其容貌体态忘得精光，极擅隐匿。',
  },

  // 进阶体质项：显著外在魅力
  {
    name: '天生尤物',
    rank: '镇派',
    category: '气质',
    cost: 18,
    description: '风姿绰约冠绝同侪，举手投足极具异性吸引力，容易引得高手侧目。',
  },
  {
    name: '菩萨低眉',
    rank: '上乘',
    category: '气质',
    cost: 14,
    description: '面相慈悲端庄，非血海深仇之敌极难对其生杀心，化解江湖干戈如春风化雨。',
  },

  // 极高阶性情项：绝世红颜
  {
    name: '倾国倾城',
    rank: '绝世',
    category: '气质',
    cost: 24,
    description: '生具倾国倾城之绝色，一颦一笑足以牵动数大门派恩怨，引得江湖名宿与少侠英杰争相折腰。',
  },

  // ============================================
  // 五、气运机缘与宿命际遇（命格）
  // ============================================
  // 基础体质项：纯娱乐因果风味
  {
    name: '乌鸦嘴',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '言语仿佛受无形天道反向牵引，好的不灵坏的灵，一旦把话说得太满，后续往往离奇遭重逆转。',
  },

  // 进阶体质项：初阶因果宿命
  {
    name: '苦主命格',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '命中注定多遇绿帽情劫，伴侣极易红杏出墙或被他人所夺。',
  },

  // 复合性情项：强剧情特权
  {
    name: '红鸾庇佑',
    rank: '镇派',
    category: '命格',
    cost: 18,
    description: '命中多逢异性贵人庇护，极易引动高境界、高地位异性名宿与强者的青睐关照；涉险蒙难之际，往往有绝顶高手主动挺身护短、为其遮风挡雨。',
  },

  // 高阶性情项：神级特权因果律
  {
    name: '债多不压身',
    rank: '镇派',
    category: '命格',
    cost: 18,
    description: '欠下黑白两道巨额银两，各方债主唯恐其横死血本无归，反倒不得不在暗中保其性命周全。',
  },
  {
    name: '魏武遗风',
    rank: '镇派',
    category: '命格',
    cost: 18,
    description: '生来多招人妇情缘，对已有婚配之女子吸引力极高，且言谈举止反常地极易被其夫婿引为莫逆之交或生死至交。',
  },

  // ============================================
  // 六、缺陷与负面（固定四档返还点数：-3 / -6 / -10 / -20）
  // ============================================
  // 轻度性格缺陷 (-3)
  {
    name: '贪财',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '见利忘义，爱财如命。常因蝇头小利背信弃义或身陷死地，行商采购时极易被市井奸商痛宰加价。',
  },
  {
    name: '暴躁易怒',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '性烈如火，一点即着。极易被挑衅激怒，一旦动怒便无法保持冷静，常常主动招致无谓祸端。',
  },
  {
    name: '口吃',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '天生重度结巴，舌根僵硬。急迫之时辞不达意，极易引人嗤笑，江湖言语交涉往往大受阻碍。',
  },
  {
    name: '酒瘾',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '嗜酒如命，每日必须饮烈酒。若半日无酒便浑身发抖冷汗直冒、四肢无力，常因烂醉如泥而误事。',
  },

  // 中度生理/感官缺陷 (-6)
  {
    name: '晕血',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '目睹鲜血与残肢断臂便心悸眩晕、面色惨白四肢酸软，瞬间丧失临战战意。',
  },
  {
    name: '夜盲',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '日落西山之后目力犹如瞽目盲人，眼前漆黑一片，暗夜之中伸手不见五指，极易踏空坠崖或遭伏击。',
  },
  {
    name: '酥骨宿疾',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '骨骼酥脆如朽木，难以承受沉重硬碰，挨上一记重拳钝击极易折伤筋骨，需久卧调养。',
    attributeModifiers: { 根骨: -15, 气血: -15 },
  },

  // 重度伤残/断门缺陷 (-10)
  {
    name: '断根绝阳',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '自幼遭腐刑去势或误服奇毒断绝阳根，六根残缺，断子绝孙。身形因之阴柔迅疾，但气血底子亏损。',
    attributeModifiers: { 机敏: 10, 气血: -15 },
  },
  {
    name: '独眼',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '彻底失去一只眼珠，视野残缺一半，无纵深感，盲侧极难防备暗器与突袭。',
    attributeModifiers: { 洞察: -25 },
  },
  {
    name: '失聪',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '双耳永久丧失听力，天地死寂无声，无法听见脚步、风声与暗器破空。',
    attributeModifiers: { 洞察: -25 },
  },
  {
    name: '断臂',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '失去整条手臂，终身残废！绝对无法双持或佩戴副手兵刃盾牌，臂力与机敏大挫。',
    attributeModifiers: { 臂力: -20, 机敏: -20 },
    restrictions: {
      forbiddenEquipSlots: ['副手'],
    },
  },
  {
    name: '天下通缉',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '被名门正派与朝廷联合悬赏海捕，身份一旦走漏便会引来鹰犬与绿林杀手四处盘查围剿。',
  },
  {
    name: '内伤缠身',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '曾遭重击留下不治暗伤，每逢剧烈死斗或阴雨寒夜便真气逆冲，气血与内力上限大损。',
    attributeModifiers: { 气血: -20, 内力: -20 },
  },
  {
    name: '天生目盲',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '天生双目盲瞽，不辨日月。绝对无法研读视觉武学图谱与施展暗器，全凭敏锐听觉与风息辨敌。',
    attributeModifiers: { 洞察: -30, 机敏: 10 },
    restrictions: {
      forbiddenMartialTypes: ['暗器'],
    },
  },
  {
    name: '厄咒血脉',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '血脉中背负着厄运反噬之咒，气血与内力上限长期受挫，身边更容易卷入不祥因果。',
    attributeModifiers: { 气血: -15, 内力: -15 },
  },

  // 绝灭天残 (-20)
  {
    name: '经脉尽断',
    rank: '缺陷',
    category: '缺陷',
    cost: -20,
    description: '周天大脉彻底断绝碎裂，无法纳气归元，绝对无法修炼或运转任何内功！',
    attributeModifiers: { 内力: -50 },
    restrictions: {
      forbiddenMartialTypes: ['内功'],
    },
  },

  // ============================================
  // 七、属性极限触发型特质（由初始属性极值自动赋予，无 cost）
  // ============================================
  // 臂力
  {
    name: '形销骨立',
    rank: '缺陷',
    category: '缺陷',
    description: '天生四肢羸弱干瘪，气力尽失，提拎寻常重物皆觉力不从心。',
    attributeThreshold: { attribute: '臂力', minValue: 0, maxValue: 1 },
    attributeModifiers: { 臂力: -30 },
  },
  {
    name: '手无缚鸡',
    rank: '缺陷',
    category: '缺陷',
    description: '体质孱弱，力气极微，甚至连抓一只鸡的气力都没有。',
    attributeThreshold: { attribute: '臂力', minValue: 2, maxValue: 5 },
    attributeModifiers: { 臂力: -15 },
  },
  {
    name: '天生神力',
    rank: '传家',
    category: '体质',
    description: '天生臂力惊人，骨量沉实，一身神力远非同辈所能企及。',
    attributeThreshold: { attribute: '臂力', minValue: 13, maxValue: 16 },
    attributeModifiers: { 臂力: 15 },
  },
  {
    name: '霸王扛鼎',
    rank: '镇派',
    category: '体质',
    description: '力拔山兮气盖世，肉身神力惊世骇俗，开山裂石不在话下。',
    attributeThreshold: { attribute: '臂力', minValue: 17 },
    attributeModifiers: { 臂力: 25 },
  },

  // 根骨
  {
    name: '命若悬丝',
    rank: '缺陷',
    category: '缺陷',
    description: '先天元气大亏，体弱若惊风弱柳，稍受风寒风霜便命悬一线。',
    attributeThreshold: { attribute: '根骨', minValue: 0, maxValue: 1 },
    attributeModifiers: { 根骨: -30, 气血: -30 },
  },
  {
    name: '经脉淤塞',
    rank: '缺陷',
    category: '缺陷',
    description: '周天经络多处阻滞，气血与内息运转滞涩晦暗。',
    attributeThreshold: { attribute: '根骨', minValue: 2, maxValue: 5 },
    attributeModifiers: { 根骨: -15, 内力: -15 },
  },
  {
    name: '龙精虎猛',
    rank: '传家',
    category: '体质',
    description: '精力充沛，气血旺盛如火，体魄强健宛若龙虎。',
    attributeThreshold: { attribute: '根骨', minValue: 13, maxValue: 16 },
    attributeModifiers: { 根骨: 15, 气血: 15 },
  },
  {
    name: '武骨天成',
    rank: '镇派',
    category: '体质',
    description: '百世难遇的纯正练武胚子，经络开阔坚韧，骨骼如玉髓天成。',
    attributeThreshold: { attribute: '根骨', minValue: 17 },
    attributeModifiers: { 根骨: 25, 气血: 20, 内力: 10 },
  },

  // 机敏
  {
    name: '神思木讷',
    rank: '缺陷',
    category: '缺陷',
    description: '身心滞涩，神思木讷，四肢动作迟滞，遇突发变故往往不及抽身规避。',
    attributeThreshold: { attribute: '机敏', minValue: 0, maxValue: 1 },
    attributeModifiers: { 机敏: -30 },
  },
  {
    name: '笨手笨脚',
    rank: '缺陷',
    category: '缺陷',
    description: '手脚协调欠佳，举手投足常显笨拙僵硬。',
    attributeThreshold: { attribute: '机敏', minValue: 2, maxValue: 5 },
    attributeModifiers: { 机敏: -15 },
  },
  {
    name: '动若脱兔',
    rank: '传家',
    category: '体质',
    description: '步法轻捷迅疾，身随意转，闪展腾挪宛若脱兔。',
    attributeThreshold: { attribute: '机敏', minValue: 13, maxValue: 16 },
    attributeModifiers: { 机敏: 15 },
  },
  {
    name: '身捷如影',
    rank: '镇派',
    category: '体质',
    description: '身法与腾挪快绝当世，动静之间犹如浮光掠影，令人难以捉摸。',
    attributeThreshold: { attribute: '机敏', minValue: 17 },
    attributeModifiers: { 机敏: 25 },
  },

  // 洞察
  {
    name: '五感俱衰',
    rank: '缺陷',
    category: '缺陷',
    description: '耳目失聪、感官蒙昧，对周遭潜藏之危机暗算浑然不觉。',
    attributeThreshold: { attribute: '洞察', minValue: 0, maxValue: 1 },
    attributeModifiers: { 洞察: -30 },
  },
  {
    name: '目不辨微',
    rank: '缺陷',
    category: '缺陷',
    description: '粗心大意，极易忽略眼皮底下的微小破绽与线索。',
    attributeThreshold: { attribute: '洞察', minValue: 2, maxValue: 5 },
    attributeModifiers: { 洞察: -15 },
  },
  {
    name: '明察秋毫',
    rank: '传家',
    category: '天资',
    description: '目光如炬，秋毫必现，极擅在蛛丝马迹中洞悉端倪。',
    attributeThreshold: { attribute: '洞察', minValue: 13, maxValue: 16 },
    attributeModifiers: { 洞察: 15 },
  },
  {
    name: '洞若观火',
    rank: '镇派',
    category: '天资',
    description: '心眼通透，对全局局势与微末破绽洞悉分明，如观掌上火烛。',
    attributeThreshold: { attribute: '洞察', minValue: 17 },
    attributeModifiers: { 洞察: 25 },
  },

  // 悟性
  {
    name: '浑浑噩噩',
    rank: '缺陷',
    category: '缺陷',
    description: '灵台混沌蒙昧，翻阅高深武学拳经如坠云雾。',
    attributeThreshold: { attribute: '悟性', minValue: 0, maxValue: 1 },
    discounts: { savvyRequirementOffset: 4 },
  },
  {
    name: '榆木脑袋',
    rank: '缺陷',
    category: '缺陷',
    description: '心思死板不知变通，研读武经招式进展甚是缓慢。',
    attributeThreshold: { attribute: '悟性', minValue: 2, maxValue: 5 },
    discounts: { savvyRequirementOffset: 2 },
  },
  {
    name: '聪慧过人',
    rank: '传家',
    category: '天资',
    description: '聪敏机变，参悟拳经剑谱往往能一点即通。',
    attributeThreshold: { attribute: '悟性', minValue: 13, maxValue: 16 },
    discounts: { savvyRequirementOffset: -1 },
  },
  {
    name: '玲珑七窍',
    rank: '镇派',
    category: '天资',
    description: '七窍玲珑，心如明镜，对天下玄奥武理往往能一通百通。',
    attributeThreshold: { attribute: '悟性', minValue: 17 },
    discounts: { savvyRequirementOffset: -3 },
  },

  // 风姿
  {
    name: '面目可憎',
    rank: '缺陷',
    category: '缺陷',
    description: '相貌乖戾古怪，骨相凶狞，令人望之生厌戒备。',
    attributeThreshold: { attribute: '风姿', minValue: 0, maxValue: 1 },
  },
  {
    name: '獐头鼠目',
    rank: '缺陷',
    category: '缺陷',
    description: '神态猥琐，目光游移，容易让人心生不喜与猜忌。',
    attributeThreshold: { attribute: '风姿', minValue: 2, maxValue: 5 },
  },
  {
    name: '玉树临风',
    rank: '传家',
    category: '气质',
    description: '风度翩翩如玉树琼枝，仪态俊朗，气质卓然出众。',
    attributeThreshold: { attribute: '风姿', minValue: 13, maxValue: 16 },
  },
  {
    name: '绝代风华',
    rank: '镇派',
    category: '气质',
    description: '姿仪神采冠绝一时，举手投足尽显风流神韵，令人过目难忘。',
    attributeThreshold: { attribute: '风姿', minValue: 17 },
  },

  // 福缘
  {
    name: '天煞孤星',
    rank: '缺陷',
    category: '缺陷',
    description: '命中带煞，刑克因果；同行亲近之人更容易遭逢坎坷波折。',
    attributeThreshold: { attribute: '福缘', minValue: 0, maxValue: 1 },
  },
  {
    name: '霉运缠身',
    rank: '缺陷',
    category: '缺陷',
    description: '运道欠佳，日常更容易遇上小麻烦、错失与不凑巧，但不会无视现实因果制造必然灾祸。',
    attributeThreshold: { attribute: '福缘', minValue: 2, maxValue: 5 },
  },
  {
    name: '吉星高照',
    rank: '传家',
    category: '命格',
    description: '气运亨通，在合理范围内更容易遇上顺心巧合、长者照拂或转机。',
    attributeThreshold: { attribute: '福缘', minValue: 13, maxValue: 16 },
  },
  {
    name: '天命所归',
    rank: '镇派',
    category: '命格',
    description: '气运盛极，更容易被卷入天下大势、绝世机缘与时代风云之中。',
    attributeThreshold: { attribute: '福缘', minValue: 17 },
  },
];
