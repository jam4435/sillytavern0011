/**
 * 人物特质数据库
 * 包含所有可选人物特质、属性触发特质及其相关逻辑
 *
 * 统一规范：
 * - 品阶与花费：
 *   粗浅(白): 3点 | 传家(绿): 8点 | 上乘(蓝): 14点 | 镇派(紫): 18点 | 绝世(金): 24点 | 传说(红): 30点
 *   缺陷(负面): 轻度 -3点 | 中度 -6点 | 重度/断门 -10点 | 绝灭 -20点
 * - 分类：天资 | 体质 | 性情 | 气质 | 专长 | 命格 | 经历 | 缺陷
 * - 规则：属性加成加算累加，熟练度折扣乘算复合；
 * - 风味约束：战力数值完全折算进属性面板，严禁大模型在剧情中违背数值凭空秒杀。
 */

import type {
  CharacterTrait,
  InitialAttributes,
  TraitAttributeModifiers,
  TraitRestrictions,
  TraitDiscounts,
  TraitRank,
  TraitCategory,
} from '../types';
import type { AttributeModifierSource } from './attributeCalculator';

// 注意：../types 中的 TraitCategory 需同步改为：
// '天资' | '体质' | '性情' | '气质' | '专长' | '命格' | '经历' | '缺陷'

const COMBAT_RULE_PROMPT =
  '该特质的战力与属性数值已完全折算进属性面板中，战斗胜负严格以面板与境界为准；只可在非战力的日常言行、风味描写与江湖交互中展现特异异象与角色个性。';

/**
 * 普通人物特质常量列表（可选特质）
 * category 仅表示人物特质本质，不再表示武学流派或题材领域
 */
export const CHARACTER_TRAITS: CharacterTrait[] = [
  // ============================================
  // 1. 兵刃相关特质（仅编辑分组，不作为 category）
  // ============================================
  // 剑法
  {
    name: '剑胚天成',
    rank: '粗浅',
    category: '天资',
    cost: 3,
    description: '生来与三尺青锋相契，初握剑柄便知吞吐进退之势，剑招招架之间隐隐合度。',
    discounts: { martialTypeDiscount: { 剑法: 0.1 } },
    flavorPrompt: '对剑器有天然亲近感，初握长剑便能摸索出门道与发力脉络；战力仍以属性与所学武功为准。',
  },
  {
    name: '剑痴',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '对剑有着近乎偏执的痴迷，研习剑法事半功倍，但对其他兵刃兴致缺缺。',
    discounts: { martialTypeDiscount: { 剑法: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '剑走轻灵',
    rank: '上乘',
    category: '天资',
    cost: 14,
    description: '腕若灵蛇，身法轻捷，极擅施展轻灵巧变一路的剑法，剑招衔接宛若行云流水。',
    attributeModifiers: { 机敏: 15 },
    discounts: { martialTypeDiscount: { 剑法: 0.15 } },
    flavorPrompt: '持剑轻灵飘逸，剑招转换毫无滞涩，举手投足尽显灵秀之韵；战力仍以属性与所学武功为准。',
  },
  {
    name: '重剑无锋',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '骨重筋强，身藏沉岳之劲，天生适合驾驭厚拙沉兵，开阖之间以势压人。',
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: '举重若轻，持大剑沉兵时渊渟岳峙，以浑厚沉劲见长；战力仍以属性与所学武功为准。',
  },
  {
    name: '剑心通明',
    rank: '镇派',
    category: '天资',
    cost: 18,
    description: '生具剑心，对于剑路虚实与剑势脉络异常敏锐，研习剑经时往往能早一步参透关窍。',
    attributeModifiers: { 洞察: 15 },
    discounts: { martialTypeDiscount: { 剑法: 0.2 } },
    flavorPrompt: '观剑极具慧眼，能捕捉剑路转折之精微，但不能凭特质直接看穿高深武学或越级取胜。',
  },

  // 刀法
  {
    name: '刀口舐血',
    rank: '粗浅',
    category: '经历',
    cost: 3,
    description: '曾在草莽绿林中以刀讨生活，熟悉短兵械斗与凶险场面，对刀法有扎实的实战底子。',
    discounts: { martialTypeDiscount: { 刀法: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '嗜战如狂',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '性情好勇，越逢强敌越容易全神贯注，对凶猛直接的刀路有异乎常人的热情。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 刀法: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '刀走偏锋',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '心思奇崛诡谲，常能从常人想不到的角度理解刀势变化，出招行险弄奇、难测虚实。',
    discounts: { martialTypeDiscount: { 刀法: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '断岳沉锋',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '臂力沉浑如铁，天生宜使厚背沉刀，修习沉猛一路刀法时大开大阖、势不可挡。',
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '血债累累',
    rank: '镇派',
    category: '经历',
    cost: 18,
    description: '曾亲手斩杀诸多仇敌，见惯了血雨腥风；这段经历深刻烙印在心性中，亦留下令人闻风丧胆的凶名。',
    flavorPrompt: '见惯血腥与死亡，谈及杀戮时比常人平静；旁人是否畏惧取决于其身份、名声和具体情境。',
  },

  // 枪戟长兵
  {
    name: '关山戎马',
    rank: '粗浅',
    category: '经历',
    cost: 3,
    description: '曾在行伍军阵中历练，深谙队列攻防、长兵击刺与阵前厮杀之术，长兵底子极扎实。',
    discounts: { martialTypeDiscount: { 枪戟: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '沙场本能',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '面对多人围逼临危不乱，擅察群敌进退方位，极善利用丈八长兵的空间之利掌控方圆。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 枪戟: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '临阵无惧',
    rank: '镇派',
    category: '性情',
    cost: 18,
    description: '泰山崩于前而色不变，身陷重围之时心境愈发沉稳，毫无畏难怯战之意。',
    attributeModifiers: { 臂力: 15, 气血: 10 },
    discounts: { martialTypeDiscount: { 枪戟: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 拳掌
  {
    name: '铜皮铁骨',
    rank: '粗浅',
    category: '体质',
    cost: 3,
    description: '天生筋厚骨密，肉搏摔打之下耐受远胜常人，不惧拳脚硬碰。',
    attributeModifiers: { 气血: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '铁拳天成',
    rank: '传家',
    category: '体质',
    cost: 8,
    description: '掌骨坚厚，腕肘硬朗，天生一副修炼外家拳掌功夫的强健体格。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 拳掌: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 暗器
  {
    name: '飞石穿杨',
    rank: '粗浅',
    category: '专长',
    cost: 3,
    description: '指腕机巧灵活，指劲拿捏妙至颠毫，随手飞石掷叶便能百步穿杨。',
    discounts: { martialTypeDiscount: { 暗器: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '袖中藏锋',
    rank: '上乘',
    category: '专长',
    cost: 14,
    description: '十指如兰花弄影，精通细微机括藏纳与拆解，于袖箭、飞针等隐蔽暗器上手极快。',
    attributeModifiers: { 洞察: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 身法轻功
  {
    name: '草上飞',
    rank: '粗浅',
    category: '专长',
    cost: 3,
    description: '下盘轻快灵巧，折转腾挪极具天分，跋山涉水或穿街过巷如履平地。',
    discounts: { martialTypeDiscount: { 轻功: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '身轻如燕',
    rank: '传家',
    category: '体质',
    cost: 8,
    description: '身骨轻灵若无物，掠水踏叶不留痕，修习高深提纵身法极易领会其中关窍。',
    attributeModifiers: { 机敏: 10 },
    discounts: { martialTypeDiscount: { 轻功: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '临机迅捷',
    rank: '上乘',
    category: '天资',
    cost: 14,
    description: '灵台警觉，应变若电，遭逢猝变之际机断立决，绝无分秒迟滞。',
    attributeModifiers: { 机敏: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 全武道通识
  {
    name: '触类旁通',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '武学悟性出众，举一反三，研习招式效率过人。',
    discounts: { savvyRequirementOffset: -1 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '嗜武如命',
    rank: '上乘',
    category: '性情',
    cost: 14,
    description: '将武道视为生命，无时无刻不在揣摩切磋，全流派功法精进速度均获得提升。',
    discounts: { globalUpgradeDiscount: 0.1 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '武学奇才',
    rank: '镇派',
    category: '天资',
    cost: 18,
    description: '天生百脉具通的绝代奇才，任何深奥武功一看便懂，极难遇到修炼瓶颈。',
    discounts: { savvyRequirementOffset: -2, globalUpgradeDiscount: 0.15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // ============================================
  // 2. 肉身相关特质（仅编辑分组，不作为 category）
  // ============================================
  {
    name: '体魄强健',
    rank: '粗浅',
    category: '体质',
    cost: 3,
    description: '生来体格健壮，气血充沛，比常人更能经受风霜劳苦。',
    attributeModifiers: { 根骨: 10, 气血: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '意志坚定',
    rank: '粗浅',
    category: '性情',
    cost: 3,
    description: '心志坚韧如磐石，在严刑拷问或心魔诱惑前不易动摇。',
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '铁骨铮铮',
    rank: '传家',
    category: '体质',
    cost: 8,
    description: '骨骼异于常人的坚硬，寻常棍棒钝器击中难以伤及筋骨。',
    attributeModifiers: { 根骨: 15, 气血: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '筋皮坚韧',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '天生筋如弓弦、肤似厚革，承受跌打钝击与寻常外伤的能力明显强于常人。',
    attributeModifiers: { 根骨: 20, 气血: 20 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '金刚体魄',
    rank: '镇派',
    category: '体质',
    cost: 18,
    description: '筋骨若精钢交铸，气血如烘炉初沸，是百里挑一的外家横练胚子。',
    attributeModifiers: { 根骨: 25, 气血: 25 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // ============================================
  // 3. 经脉与内息相关特质（仅编辑分组，不作为 category）
  // ============================================
  {
    name: '丹田气海',
    rank: '传家',
    category: '体质',
    cost: 8,
    description: '天生气海宽厚渊深，经络通达，运功调息时真气沛然莫御。',
    attributeModifiers: { 内力: 15 },
    discounts: { martialTypeDiscount: { 内功: 0.15 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '九阳之体',
    rank: '绝世',
    category: '体质',
    cost: 24,
    description: '天生纯阳经脉，阳气如日中天，是修炼至阳武学的绝佳体质，诸邪难侵。',
    attributeModifiers: { 内力: 25, 气血: 20 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '至阴之体',
    rank: '绝世',
    category: '体质',
    cost: 24,
    description: '体质阴寒玄幽，内息冷冽如霜，极利于修习阴柔与幽微武学。',
    attributeModifiers: { 内力: 25, 机敏: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '紫气灵胎',
    rank: '传说',
    category: '体质',
    cost: 30,
    description: '先天百脉温润无瑕，清晨调息尤见玄妙，内息天然偏向纯和清正。',
    attributeModifiers: { 内力: 30, 根骨: 20, 气血: 20 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // ============================================
  // 4. 情感与人际相关特质（仅编辑分组，不作为 category）
  // ============================================
  {
    name: '眉目含情',
    rank: '粗浅',
    category: '气质',
    cost: 3,
    description: '双目秋水脉脉，盼睐生姿，言谈举止间自带三分柔情与亲近之意。',
    flavorPrompt: '顾盼生姿，待人接物天然透着亲近温存，容易令人放下戒备。',
  },
  {
    name: '眉清目秀',
    rank: '粗浅',
    category: '气质',
    cost: 3,
    description: '相貌清秀端正，气质干净讨喜，初见之时容易获得江湖长辈与市井豪客的好感。',
    flavorPrompt: '相貌清秀端正，日常问路打听消息时NPC态度亲和耐烦。',
  },
  {
    name: '善解人意',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '心细如发，善体人意，往往能敏锐捕捉旁人的情绪波澜与难言之隐。',
    flavorPrompt: '善于倾听，常让人不自觉吐露心声；NPC态度与反应仍遵其自身个性与处境。',
  },
  {
    name: '不计血缘',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '胸襟坦荡，对门第与血缘看得很淡，只要真心相投，便愿以赤诚晚辈相待。',
    flavorPrompt: '胸襟开阔不拘小节，剧情中常以仁义宽厚长辈形象为人称道。',
  },
  {
    name: '情深命蹇',
    rank: '传家',
    category: '命格',
    cost: 8,
    description: '命带情劫，红尘情路上多逢擦肩而过与造化弄人，情感波折往往深刻影响其行止。',
    flavorPrompt: '情路多有坎坷与误会，可作为剧情宿命感倾向，但不得强制伴侣背叛或离去。',
  },
  {
    name: '天生尤物',
    rank: '传家',
    category: '气质',
    cost: 8,
    description: '容貌、体态与风韵极具吸引力，一颦一笑动人心魄，比常人更容易引人瞩目。',
    flavorPrompt: '容貌气质出众，容易获得注意与好感；NPC仍保有自身性格、立场、关系与选择。',
  },
  {
    name: '洞察情隙',
    rank: '上乘',
    category: '专长',
    cost: 14,
    description: '深谙男女幽微心绪，善于在言笑掩映间察觉旁人情意裂痕与未解执念。',
    flavorPrompt: '善于捕捉他人言语闪烁与情愫动摇之处，顺势切入；但不得强行左右NPC伦常决定。',
  },
  {
    name: '情殇血仇',
    rank: '上乘',
    category: '经历',
    cost: 14,
    description: '曾因至亲挚爱惨遭变故结下刻骨仇怨，这段旧恨至今仍影响其心境与决断。',
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: '刻骨仇恨铭刻于心，面对仇敌或轻薄之徒时杀伐果断，言语冰冷绝情。',
  },
  {
    name: '惹人怜爱',
    rank: '上乘',
    category: '气质',
    cost: 14,
    description: '气质中有一种特殊的亲和与纤柔感，容易激发豪侠长者的庇护之意。',
    flavorPrompt: '言谈举止容易激起部分强势人物的照拂欲，但任何帮助都必须符合对方性格、关系与现实条件。',
  },
  {
    name: '名花有缘',
    rank: '镇派',
    category: '命格',
    cost: 18,
    description: '命中多惹红颜恩怨，容易身不由己卷入世家联姻与江湖佳人的复杂情孽之中。',
    flavorPrompt: '更容易卷入复杂感情关系与误会，但不得强制已有伴侣者移情，也不得替NPC做决定。',
  },
  {
    name: '忍辱负重',
    rank: '镇派',
    category: '性情',
    cost: 18,
    description: '心性沉鸷，任凭奇耻大辱或流言锥心，皆能吞声隐忍，越处逆境越能按捺待机。',
    attributeModifiers: { 内力: 15, 气血: 10 },
    flavorPrompt: '遇大辱而能容，心如古井无波，不逞一时意气，暗伏待时之机。',
  },
  {
    name: '倾城绝色',
    rank: '绝世',
    category: '气质',
    cost: 24,
    description: '容貌与风华冠绝当世，惊艳绝伦，所到之处宛若明月生辉，令人过目难忘。',
    flavorPrompt: '容貌气韵极其醒目，容易成为话题与关注中心；不得让NPC仅凭容貌无条件倒戈、争斗或牺牲。',
  },

  // ============================================
  // 5. 江湖性情、气质、命格与经历（仅编辑分组，不作为 category）
  // ============================================
  {
    name: '古灵精怪',
    rank: '粗浅',
    category: '性情',
    cost: 3,
    description: '心思活络机敏，常有天马行空的想法，善于另辟蹊径解决棘手难题。',
    flavorPrompt: '言语俏皮跳脱，行事出人意表，不喜拘泥凡俗礼节。',
  },
  {
    name: '尊师重道',
    rank: '粗浅',
    category: '性情',
    cost: 3,
    description: '极其尊敬师长门楣，门派归属感极强，深得同门长辈喜爱。',
    flavorPrompt: '行事尊奉师命规矩，言必称师门教诲，极重同门之谊。',
  },
  {
    name: '丹心侠骨',
    rank: '粗浅',
    category: '性情',
    cost: 3,
    description: '路见不平拔刀相助，侠肝义胆，虽易招惹麻烦却深得江湖正道与民间赞颂。',
    flavorPrompt: '路见不平一身浩然正气，宁折不弯，侠名远播。',
  },
  {
    name: '藏锋守拙',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '敛芒入鞘，大智若愚。衣着举止朴实无华，极少在人前显山露水。',
    flavorPrompt: '气度内敛质朴，不显山不露水，极难凭外在窥其内蕴深浅。',
  },
  {
    name: '慈眉善目',
    rank: '传家',
    category: '气质',
    cost: 8,
    description: '神态温和沉静，言语少有压迫感，陌生人较容易在其面前放下戒备。',
    flavorPrompt: '神态慈和，说话容易缓和气氛；能否化解冲突仍取决于利益、仇怨与双方立场。',
  },
  {
    name: '浪子回头',
    rank: '传家',
    category: '经历',
    cost: 8,
    description: '曾造下杀业或长期身处黑道，后来因重大变故悔悟收手；旧怨、旧识与过去的名声仍可能追来。',
    flavorPrompt: '浪子回头金不换，眉宇间常带自省与度人之意。',
  },
  {
    name: '恋剑成痴',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '对凡俗情爱兴趣淡薄，却容易将强烈情感投射到随身兵刃上，尤其钟爱佩剑。',
    flavorPrompt: '对凡俗男女情事毫无感觉，视爱剑如发妻/夫君，神情执拗痴迷。',
  },
  {
    name: '能屈能伸',
    rank: '传家',
    category: '性情',
    cost: 8,
    description: '极善察言观色，不拘小节，危急关头能迅速放低身段，为自身谋求转圜余地。',
    flavorPrompt: '危急时善于示弱、赔罪和察言观色；是否获得宽恕完全取决于对方性格与局势。',
  },
  {
    name: '伏龟息气',
    rank: '上乘',
    category: '性情',
    cost: 14,
    description: '深谙潜伏匿迹之道，耐性如铁，为候一击之机可在绝境恶土中匿伏数日不移。',
    flavorPrompt: '耐性极佳气息如枯木，隐匿潜行时极难被旁人察觉动静。',
  },
  {
    name: '歪打正着',
    rank: '上乘',
    category: '命格',
    cost: 14,
    description: '慌乱、失误或偶然有时会带来出人意料的巧合，但这种运气不能无视实力差距或必然结果。',
    flavorPrompt: '偶尔用巧合增加荒诞感，但不得借此规避确定命中的攻击、致命后果或实力差距。',
  },
  {
    name: '泯然众人',
    rank: '上乘',
    category: '气质',
    cost: 14,
    description: '容貌与气韵平淡如水，混入市井人群之中极不易引人注目。',
    flavorPrompt: '在人群中不容易留下鲜明印象，但熟人、仇家或刻意观察者仍可正常记住其身份与外貌。',
  },
  {
    name: '一语成谶',
    rank: '上乘',
    category: '命格',
    cost: 14,
    description: '过于笃定的判断常与后续发展出现离奇反差，久而久之，身边人甚至会忌讳其把话说得太满。',
    flavorPrompt: '可偶尔安排其笃定预言与结果形成反差作为喜剧性命格表现，不得将说话直接设为因果律。',
  },
  {
    name: '债台高筑',
    rank: '镇派',
    category: '经历',
    cost: 18,
    description: '欠下巨额银两，并因此形成复杂的债主与江湖关系网；有人催逼，有人盯梢，也有人不愿让这笔债彻底烂掉。',
    flavorPrompt: '债务关系是既有背景，不代表债主一定保护角色；债主会依自身利益采取催债、威胁、合作等合理行为。',
  },
  {
    name: '痴情入骨',
    rank: '镇派',
    category: '性情',
    cost: 18,
    description: '一旦真心认定某人，便极容易把感情置于利益与理性判断之前。',
    attributeModifiers: { 臂力: 20 },
    flavorPrompt: '恋爱之时满心唯有道侣一人，憨傻痴情，谁敢犯其道侣必遭疯魔反扑。',
  },
  {
    name: '残身绝念',
    rank: '绝世',
    category: '经历',
    cost: 24,
    description: '曾受宫刑腐刑或自绝尘欲，六根清净无碍，身形阴柔诡谲，心念冷酷如霜；具体武学仍由所修功法决定。',
    attributeModifiers: { 机敏: 30 },
    flavorPrompt: '面容白皙无须，嗓音尖细清冷，眼神阴鸷莫测，无情欲挂碍。',
  },

  // ============================================
  // 6. 医毒与奇门相关特质（仅编辑分组，不作为 category）
  // ============================================
  {
    name: '心灵手巧',
    rank: '粗浅',
    category: '专长',
    cost: 3,
    description: '十指纤细灵活，擅长开锁、拆装机括与细致手工。',
    flavorPrompt: '手脚麻利细密，善于拨弄细小机括与暗锁。',
  },
  {
    name: '识草尝百',
    rank: '粗浅',
    category: '专长',
    cost: 3,
    description: '略识百草药性，采集山野药材时偶能辨识良药。',
    flavorPrompt: '见草木便下意识掐闻辨味，口尝药性习以为常。',
  },
  {
    name: '危机感应',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '对致命杀气与暗算具备惊人的本能直觉，险境常能后背发凉示警。',
    attributeModifiers: { 洞察: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '目光如炬',
    rank: '传家',
    category: '天资',
    cost: 8,
    description: '目力过人，极擅在阴暗混乱处辨识蛛丝马迹与细微毒物。',
    attributeModifiers: { 洞察: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '岐黄奇才',
    rank: '上乘',
    category: '天资',
    cost: 14,
    description: '对药性、脉象与人体经络参悟极快，研习医理药道往往能触类旁通。',
    attributeModifiers: { 气血: 10, 内力: 10 },
    flavorPrompt: '望闻问切信手拈来，对各门派毒伤病患胸有成竹。',
  },
  {
    name: '百毒不侵',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '体质奇异或服食过天地奇草，寻常草木蛇蝎剧毒入口如饮寻常茶汤。',
    attributeModifiers: { 根骨: 10 },
    flavorPrompt: '见毒物面不改色，寻常蒙汗药砒霜入腹毫无波澜。',
  },
  {
    name: '寒煞玄脉',
    rank: '上乘',
    category: '体质',
    cost: 14,
    description: '先天经脉偏阴寒，内息天然冷冽，对阴寒、毒煞一路武学的适应性极佳。',
    attributeModifiers: { 内力: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '百毒淬体',
    rank: '镇派',
    category: '经历',
    cost: 18,
    description: '常年以毒物淬炼肉身，筋脉已对多种毒性产生适应，周身隐带药石异香；具体毒功威力仍取决于所修功法。',
    attributeModifiers: { 气血: 15, 内力: 15 },
    flavorPrompt: '体带幽微草药苦香，血色隐泛乌紫，寻常蚊蝇沾体即毙。',
  },
  {
    name: '蛊王共生',
    rank: '绝世',
    category: '经历',
    cost: 24,
    description: '曾纳南疆罕见蛊王入体共生，蛊脉相连，亦可能成为触发江湖奇遇的重要线索。',
    attributeModifiers: { 气血: 20, 根骨: 15 },
    flavorPrompt: '心房常有微弱异样律动，遇剧毒恶障蛊虫自发护体长鸣。',
  },

  // ============================================
  // 7. 缺陷与负面经历（固定四档返还点数：-3 / -6 / -10 / -20）
  // ============================================
  // 轻度性格缺陷 (-3)
  {
    name: '贪财',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '贪鄙成性，见金银如蝇见血。常因蝇头微利背信弃义或身陷险地，采购时极易被市井奸商痛宰。',
    flavorPrompt: '生性贪鄙，贪恋黄白之物，常因蝇头微利铤而走险或失节背信。',
  },
  {
    name: '暴躁易怒',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '性烈如火，一点即着。极易被挑衅激怒，一旦动怒便难以保持冷静，常招致无谓祸端。',
    flavorPrompt: '性格暴烈如火药桶，极易遭人激将法暗算，盛怒之时不顾后果拔刀相向，处事极其鲁莽。',
  },
  {
    name: '口吃',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '言语迟滞磕绊，越是紧张急迫越发严重，虽增交涉之难，但不致必定败事。',
    flavorPrompt: '说话结巴并可能影响沟通效率，但不得让所有说服、劝解或交涉自动失败。',
  },
  {
    name: '酒瘾',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '嗜酒如命，每日必饮。若半日无酒便四肢乏力、冷汗直冒，常因贪杯买醉而误事。',
    flavorPrompt: '嗜酒无度，腰间酒葫芦从不离身，无酒便狂躁手抖，醉卧街头常遭宵小洗劫。',
  },

  // 中度生理/感官缺陷 (-6)
  {
    name: '晕血',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '天生见血晕眩，目睹殷红血光或残破伤躯便心悸手软，临战心志极易溃散。',
    flavorPrompt: '极其畏惧腥风血雨，目睹血腥厮杀便头晕目眩战意全消，常需同伴搀扶逃命。',
  },
  {
    name: '夜盲',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '日落西山之后目力犹如瞽目，暗夜之中伸手不见五指，极易踏空坠崖或遭人伏击。',
    flavorPrompt: '入夜后双眼完全无法视物，夜间作战犹如盲打，寸步难行极易遭暗袭。',
  },
  {
    name: '酥骨宿疾',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '天生骨质羸弱如糟木，难以承受沉重硬碰，挨上一记重击便易折伤筋骨，需久卧调养。',
    attributeModifiers: { 根骨: -15, 气血: -15 },
    flavorPrompt: '体质孱弱骨骼酥脆，挨上一记重手便吐血骨折，常年药罐不离身。',
  },

  // 重度伤残/断门缺陷 (-10)
  {
    name: '独眼',
    rank: '缺陷',
    category: '经历',
    cost: -10,
    description: '因昔日伤病或激斗失去一只眼睛，视野纵深大受局限，极难防备视线盲区。',
    attributeModifiers: { 洞察: -25 },
    flavorPrompt: '单眼遮罩黑布，转头环顾幅度极大，盲区遭遇偷袭难以防备。',
  },
  {
    name: '失聪',
    rank: '缺陷',
    category: '经历',
    cost: -10,
    description: '过去因重创或意外永久失去听力，只能更多依靠目光、口型与身周风动感知局势。',
    attributeModifiers: { 洞察: -25 },
    flavorPrompt: '两耳失聪一片死寂，全凭目光观察口型，暗算与偷袭对其防不胜防。',
  },
  {
    name: '断臂',
    rank: '缺陷',
    category: '经历',
    cost: -10,
    description: '曾因重伤、酷刑或变故痛失一臂，起居与御敌之法皆受大挫，再难双持或使副手兵刃。',
    attributeModifiers: { 臂力: -20, 机敏: -20 },
    restrictions: {
      forbiddenEquipSlots: ['副手'],
    },
    flavorPrompt: '断袖迎风飘荡，单手持械，日常起居多有不便，战斗时缺少一手格挡。',
  },
  {
    name: '天下通缉',
    rank: '缺陷',
    category: '经历',
    cost: -10,
    description: '因过往重罪遭官府海捕文书或仇家重金悬赏，身份一旦走漏便会引来盘查与追剿。',
    flavorPrompt: '追捕强度取决于悬赏、地域、身份暴露程度与势力触达范围，不应无条件做到天下处处即时围剿。',
  },
  {
    name: '内伤缠身',
    rank: '缺陷',
    category: '经历',
    cost: -10,
    description: '曾遭重击留下顽固暗伤，剧烈运功或久战时极易牵动旧患，气血与内息上限长期受损。',
    attributeModifiers: { 气血: -20, 内力: -20 },
    flavorPrompt: '病骨支离面如金纸，久战必气血翻江倒海，帕掩唇角尽是殷红鲜血。',
  },
  {
    name: '天生目盲（盲侠）',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '天生双目盲瞽，不辨日月。无法研读视觉武学图谱与施展暗器，全凭敏锐听觉与风息辨敌。',
    attributeModifiers: { 洞察: -30, 机敏: 10 },
    restrictions: {
      forbiddenMartialTypes: ['暗器'],
    },
    flavorPrompt: '双眼蒙布，目不能视，虽听觉警觉敏锐，但凡俗生活多有艰难。',
  },
  {
    name: '厄咒血脉',
    rank: '缺陷',
    category: '命格',
    cost: -10,
    description: '血脉中背负着难以解释的厄咒，体魄与运势长期受到压制，也更容易卷入不祥因果。',
    attributeModifiers: { 气血: -15, 内力: -15 },
    flavorPrompt: '以不祥气息、身体不适和偶发厄运表现血脉诅咒，不得强制身边亲友必遭横祸。',
  },

  // 绝灭天残 (-20)
  {
    name: '经脉尽断',
    rank: '缺陷',
    category: '经历',
    cost: -20,
    description: '曾遭遇毁灭性的重创致使周天大脉尽断，无法纳气归元，彻底与内功无缘。',
    attributeModifiers: { 内力: -50 },
    restrictions: {
      forbiddenMartialTypes: ['内功'],
    },
    flavorPrompt: '经脉寸断内息无存，无法运转内家真气，唯凭惊人意志打磨一身外家筋骨皮肉。',
  },

  // ============================================
  // 8. 属性极限触发型特质（由初始属性极值自动赋予，无 cost）
  // ============================================
  // 臂力
  {
    name: '形销骨立',
    rank: '缺陷',
    category: '缺陷',
    description: '天生四肢羸弱干瘪，气力尽失，提拎寻常重物皆觉力不从心。',
    attributeThreshold: { attribute: '臂力', minValue: 0, maxValue: 1 },
    attributeModifiers: { 臂力: -30 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '手无缚鸡',
    rank: '缺陷',
    category: '缺陷',
    description: '体质孱弱，力气极微，甚至连寻常农活与拉弓搬石都难以胜任。',
    attributeThreshold: { attribute: '臂力', minValue: 2, maxValue: 5 },
    attributeModifiers: { 臂力: -15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '天生神力',
    rank: '传家',
    category: '体质',
    description: '天生臂力惊人，骨量沉实，一身神力远非同辈所能企及。',
    attributeThreshold: { attribute: '臂力', minValue: 13, maxValue: 16 },
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: '腕力极沉，激动时随手捏碎瓷杯，单手搬运重物如履平地。',
  },
  {
    name: '霸王扛鼎',
    rank: '镇派',
    category: '体质',
    description: '力拔山兮气盖世，肉身神力惊世骇俗，开山裂石不在话下。',
    attributeThreshold: { attribute: '臂力', minValue: 17 },
    attributeModifiers: { 臂力: 25 },
    flavorPrompt: '臂围粗壮坚实，随手挥舞大铁锤石碾如掷稻草。',
  },

  // 根骨
  {
    name: '命若悬丝',
    rank: '缺陷',
    category: '缺陷',
    description: '先天元气大亏，体弱若惊风弱柳，稍受风寒风霜便命悬一线。',
    attributeThreshold: { attribute: '根骨', minValue: 0, maxValue: 1 },
    attributeModifiers: { 根骨: -30, 气血: -30 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '经脉淤塞',
    rank: '缺陷',
    category: '缺陷',
    description: '周天经络多处阻滞，气血与内息运转滞涩晦暗。',
    attributeThreshold: { attribute: '根骨', minValue: 2, maxValue: 5 },
    attributeModifiers: { 根骨: -15, 内力: -15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '龙精虎猛',
    rank: '传家',
    category: '体质',
    description: '精力充沛，气血旺盛如火，体魄强健宛若龙虎。',
    attributeThreshold: { attribute: '根骨', minValue: 13, maxValue: 16 },
    attributeModifiers: { 根骨: 15, 气血: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '武骨天成',
    rank: '镇派',
    category: '体质',
    description: '百世难遇的纯正练武胚子，经络开阔坚韧，骨骼如玉髓天成。',
    attributeThreshold: { attribute: '根骨', minValue: 17 },
    attributeModifiers: { 根骨: 25, 气血: 20, 内力: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 机敏
  {
    name: '反应迟缓',
    rank: '缺陷',
    category: '缺陷',
    description: '神思木讷，四肢动作迟滞，遇突发变故往往不及抽身规避。',
    attributeThreshold: { attribute: '机敏', minValue: 0, maxValue: 1 },
    attributeModifiers: { 机敏: -30 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '笨手笨脚',
    rank: '缺陷',
    category: '缺陷',
    description: '手脚协调欠佳，举手投足常显笨拙僵硬。',
    attributeThreshold: { attribute: '机敏', minValue: 2, maxValue: 5 },
    attributeModifiers: { 机敏: -15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '动若脱兔',
    rank: '传家',
    category: '体质',
    description: '步法轻捷迅疾，身随意转，闪展腾挪宛若脱兔。',
    attributeThreshold: { attribute: '机敏', minValue: 13, maxValue: 16 },
    attributeModifiers: { 机敏: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '身捷如影',
    rank: '镇派',
    category: '体质',
    description: '身法与腾挪快绝当世，动静之间犹如浮光掠影，令人难以捉摸。',
    attributeThreshold: { attribute: '机敏', minValue: 17 },
    attributeModifiers: { 机敏: 25 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 洞察
  {
    name: '五感俱衰',
    rank: '缺陷',
    category: '缺陷',
    description: '耳目失聪、感官蒙昧，对周遭潜藏之危机暗算浑然不觉。',
    attributeThreshold: { attribute: '洞察', minValue: 0, maxValue: 1 },
    attributeModifiers: { 洞察: -30 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '视而不见',
    rank: '缺陷',
    category: '缺陷',
    description: '粗心大意，极易忽略眼皮底下的微小破绽与线索。',
    attributeThreshold: { attribute: '洞察', minValue: 2, maxValue: 5 },
    attributeModifiers: { 洞察: -15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '明察秋毫',
    rank: '传家',
    category: '天资',
    description: '目光如炬，秋毫必现，极擅在蛛丝马迹中洞悉端倪。',
    attributeThreshold: { attribute: '洞察', minValue: 13, maxValue: 16 },
    attributeModifiers: { 洞察: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '洞若观火',
    rank: '镇派',
    category: '天资',
    description: '心眼通透，对全局局势与微末破绽洞悉分明，如观掌上火烛。',
    attributeThreshold: { attribute: '洞察', minValue: 17 },
    attributeModifiers: { 洞察: 25 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 悟性
  {
    name: '浑浑噩噩',
    rank: '缺陷',
    category: '缺陷',
    description: '灵台混沌蒙昧，翻阅高深武学拳经如坠云雾。',
    attributeThreshold: { attribute: '悟性', minValue: 0, maxValue: 1 },
    discounts: { savvyRequirementOffset: 4 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '榆木脑袋',
    rank: '缺陷',
    category: '缺陷',
    description: '心思死板不知变通，研读武经招式进展甚是缓慢。',
    attributeThreshold: { attribute: '悟性', minValue: 2, maxValue: 5 },
    discounts: { savvyRequirementOffset: 2 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '聪慧过人',
    rank: '传家',
    category: '天资',
    description: '聪敏机变，参悟拳经剑谱往往能一点即通。',
    attributeThreshold: { attribute: '悟性', minValue: 13, maxValue: 16 },
    discounts: { savvyRequirementOffset: -1 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '玲珑七窍',
    rank: '镇派',
    category: '天资',
    description: '七窍玲珑，心如明镜，对天下玄奥武理往往能一通百通。',
    attributeThreshold: { attribute: '悟性', minValue: 17 },
    discounts: { savvyRequirementOffset: -3 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 风姿
  {
    name: '面目可憎',
    rank: '缺陷',
    category: '缺陷',
    description: '相貌乖戾古怪，骨相凶狞，令人望之生厌戒备。',
    attributeThreshold: { attribute: '风姿', minValue: 0, maxValue: 1 },
    flavorPrompt: '相貌凶恶古怪，初见者常退避三舍。',
  },
  {
    name: '獐头鼠目',
    rank: '缺陷',
    category: '缺陷',
    description: '神态猥琐，目光游移，容易让人心生不喜与猜忌。',
    attributeThreshold: { attribute: '风姿', minValue: 2, maxValue: 5 },
    flavorPrompt: '神态猥琐眼神闪烁，常被当成江湖宵小盘查。',
  },
  {
    name: '玉树临风',
    rank: '传家',
    category: '气质',
    description: '风度翩翩如玉树琼枝，仪态俊朗，气质卓然出众。',
    attributeThreshold: { attribute: '风姿', minValue: 13, maxValue: 16 },
    flavorPrompt: '身姿俊拔气度儒雅，驻足处常有女子悄悄注目。',
  },
  {
    name: '绝代风华',
    rank: '镇派',
    category: '气质',
    description: '姿仪神采冠绝一时，举手投足尽显风流神韵，令人过目难忘。',
    attributeThreshold: { attribute: '风姿', minValue: 17 },
    flavorPrompt: '风华绝代惊艳当世，一入客栈满堂寂然无声。',
  },

  // 福缘
  {
    name: '天煞孤星',
    rank: '缺陷',
    category: '命格',
    description: '命中带煞，刑克因果；同行亲近之人更容易遭逢坎坷波折。',
    attributeThreshold: { attribute: '福缘', minValue: -6, maxValue: -5 },
    flavorPrompt: '以关系波折与不祥巧合体现低福缘，不得强制亲友死亡或持续制造无法回避的灾难。',
  },
  {
    name: '霉运缠身',
    rank: '缺陷',
    category: '命格',
    description: '运道欠佳，日常更容易遇上小麻烦、错失与不凑巧，但不会无视现实因果制造必然灾祸。',
    attributeThreshold: { attribute: '福缘', minValue: -4, maxValue: -1 },
    flavorPrompt: '可增加合理的小倒霉和错失，不得凭空制造违反因果的致命事故。',
  },
  {
    name: '吉星高照',
    rank: '传家',
    category: '命格',
    description: '气运亨通，在合理范围内更容易遇上顺心巧合、长者照拂或转机。',
    attributeThreshold: { attribute: '福缘', minValue: 7, maxValue: 10 },
    flavorPrompt: '可在合理范围内增加巧合、善意与转机，不得凭空免死或越级化险。',
  },
  {
    name: '天命所归',
    rank: '镇派',
    category: '命格',
    description: '气运盛极，更容易被卷入天下大势、绝世机缘与时代风云之中。',
    attributeThreshold: { attribute: '福缘', minValue: 11 },
    flavorPrompt: '可让角色更容易接触重大人物、机缘与时代事件，但不得赋予“主角必胜”或凭空逆转死局的权限。',
  },
];

/**
 * 根据属性值获取触发的特质
 */
export function getTriggeredTraitsByAttribute(attribute: keyof InitialAttributes, value: number): CharacterTrait[] {
  return CHARACTER_TRAITS.filter(trait => {
    if (!trait.attributeThreshold) return false;
    if (trait.attributeThreshold.attribute !== attribute) return false;

    const { minValue, maxValue } = trait.attributeThreshold;
    if (minValue !== undefined && value < minValue) return false;
    if (maxValue !== undefined && value > maxValue) return false;

    return true;
  }) as CharacterTrait[];
}

// ============================================
// 特质查询与机制推导辅助函数
// ============================================

const TRAIT_MAP = new Map<string, CharacterTrait>();
for (const trait of CHARACTER_TRAITS) {
  TRAIT_MAP.set(trait.name, trait);
}

/**
 * 根据特质名称安全查找预设定义
 */
export function getTraitByName(name: string): CharacterTrait | undefined {
  return TRAIT_MAP.get(name);
}

/**
 * 规范化特质名称数组（支持 Record<string, unknown>、string[] 或 null/undefined）
 */
export function normalizeTraitNames(traits?: Record<string, unknown> | string[] | null): string[] {
  if (!traits) return [];
  if (Array.isArray(traits)) {
    return traits.filter(Boolean);
  }
  return Object.keys(traits).filter(k => !k.startsWith('$'));
}

/**
 * 将用户特质转换为属性修正源列表，供 attributeCalculator 使用
 */
export function getTraitModifierSources(
  traits?: Record<string, unknown> | string[] | null,
): AttributeModifierSource[] {
  const names = normalizeTraitNames(traits);
  const sources: AttributeModifierSource[] = [];

  for (const name of names) {
    const def = getTraitByName(name);
    if (def?.attributeModifiers && Object.keys(def.attributeModifiers).length > 0) {
      sources.push({
        id: `天赋:${name}`,
        kind: '天赋',
        modifiers: def.attributeModifiers as Record<string, number>,
      });
    }
  }

  return sources;
}

/**
 * 汇总计算所有特质对修炼/学习造成的限制
 */
export function getTraitRestrictions(
  traits?: Record<string, unknown> | string[] | null,
): TraitRestrictions {
  const names = normalizeTraitNames(traits);
  const forbiddenTypes = new Set<string>();
  const forbiddenSlots = new Set<string>();

  for (const name of names) {
    const def = getTraitByName(name);
    if (def?.restrictions) {
      def.restrictions.forbiddenMartialTypes?.forEach(t => forbiddenTypes.add(t));
      def.restrictions.forbiddenEquipSlots?.forEach(s => forbiddenSlots.add(s));
    }
  }

  return {
    forbiddenMartialTypes: Array.from(forbiddenTypes),
    forbiddenEquipSlots: Array.from(forbiddenSlots),
  };
}

/**
 * 检查特定功法类型是否被当前天赋禁止
 * @returns 若被禁止返回具体原因，否则返回 null
 */
export function checkMartialArtTraitRestriction(
  artType: string,
  traits?: Record<string, unknown> | string[] | null,
): string | null {
  const restrictions = getTraitRestrictions(traits);
  if (restrictions.forbiddenMartialTypes?.includes(artType)) {
    if (artType === '内功') {
      return '全身经脉俱断，无法修炼内功';
    }
    return `受天赋限制，无法修炼${artType}`;
  }
  return null;
}

/**
 * 汇总计算所有特质对升级消耗产生的折扣与基准偏移
 * 遵循“折扣乘算复合，加成加算累加”的规则，防止多重折扣溢出或归零
 */
export function getTraitDiscounts(
  traits?: Record<string, unknown> | string[] | null,
): TraitDiscounts {
  const names = normalizeTraitNames(traits);
  let savvyRequirementOffset = 0;
  const martialTypeDiscount: Record<string, number> = {};
  let globalMultiplier = 1.0;
  const typeMultipliers: Record<string, number> = {};

  for (const name of names) {
    const def = getTraitByName(name);
    if (def?.discounts) {
      if (def.discounts.savvyRequirementOffset) {
        savvyRequirementOffset += def.discounts.savvyRequirementOffset;
      }
      if (def.discounts.martialTypeDiscount) {
        for (const [type, discount] of Object.entries(def.discounts.martialTypeDiscount)) {
          const currentMult = typeMultipliers[type] ?? 1.0;
          typeMultipliers[type] = currentMult * (1 - Math.max(0, Math.min(0.8, discount)));
        }
      }
      if (def.discounts.globalUpgradeDiscount) {
        globalMultiplier *= (1 - Math.max(0, Math.min(0.8, def.discounts.globalUpgradeDiscount)));
      }
    }
  }

  for (const [type, mult] of Object.entries(typeMultipliers)) {
    martialTypeDiscount[type] = Number((1 - mult).toFixed(4));
  }

  const globalDiscount = Number((1 - globalMultiplier).toFixed(4));

  return {
    savvyRequirementOffset,
    martialTypeDiscount: Object.keys(martialTypeDiscount).length > 0 ? martialTypeDiscount : undefined,
    globalUpgradeDiscount: globalDiscount > 0 ? globalDiscount : undefined,
  };
}
