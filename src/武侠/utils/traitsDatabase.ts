/**
 * 天赋数据库
 * 包含所有可选天赋、属性触发天赋及其相关逻辑
 *
 * 统一规范：
 * - 品阶与花费：
 *   粗浅(白): 2点 | 传家(绿): 5点 | 上乘(蓝): 8点 | 镇派(紫): 12点 | 绝世(金): 16点 | 传说(红): 20点
 *   缺陷(负面): 轻度 -3点 | 中度 -6点 | 重度/断门 -10点 | 绝灭 -20点
 * - 分类：兵刃 | 体质 | 身法 | 内功 | 情爱 | 奇人 | 医毒 | 缺陷
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

const COMBAT_RULE_PROMPT =
  '该特质的战力与属性数值已完全折算进属性面板中，战斗胜负严格以面板与境界为准；只可在非战力的日常言行、风味描写与江湖交互中展现特异异象与角色个性。';

/**
 * 普通天赋常量列表（可选天赋）
 * 包含正面和负面天赋，涵盖六大流派与七大特质域
 */
export const CHARACTER_TRAITS: CharacterTrait[] = [
  // ============================================
  // 1. 兵刃专精域（剑法、刀法、枪戟、拳掌、暗器、轻功）
  // ============================================
  // 剑法
  {
    name: '剑术初解',
    rank: '粗浅',
    category: '兵刃',
    cost: 2,
    description: '自幼摸过木剑，对剑招套路有基础理解。',
    discounts: { martialTypeDiscount: { 剑法: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '剑痴',
    rank: '传家',
    category: '兵刃',
    cost: 5,
    description: '对剑有着近乎偏执的痴迷，学习剑法事半功倍，但对其他兵刃兴致缺缺。',
    discounts: { martialTypeDiscount: { 剑法: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '轻灵快剑',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '出剑轻快灵动，如清风拂柳，善于在瞬息之间连出数招抢占先机。',
    attributeModifiers: { 机敏: 15 },
    discounts: { martialTypeDiscount: { 剑法: 0.15 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '重剑无锋',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '大巧不工。摒弃繁复花哨的剑招，追求绝对的力量与势能，挥舞重剑一力降十会。',
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '心中有剑',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '草木竹石皆可为剑。即便手中无剑，随手折下树枝亦能施展凌厉剑意。',
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '剑胆琴心',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '剑法中融入音律与儒雅之意，剑啸如乐，不仅伤敌身躯，更能以剑韵扰敌心神。',
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '人剑合一',
    rank: '镇派',
    category: '兵刃',
    cost: 12,
    description: '剑即是肢体的延伸，出鞘无形，不会因兵刃脱手而战力受挫。',
    discounts: { martialTypeDiscount: { 剑法: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '剑心通明',
    rank: '镇派',
    category: '兵刃',
    cost: 12,
    description: '剑道直觉通达无碍，能看破寻常剑客招式中的破绽，万变不离其宗。',
    attributeModifiers: { 洞察: 15 },
    discounts: { martialTypeDiscount: { 剑法: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '独孤求败',
    rank: '传说',
    category: '兵刃',
    cost: 20,
    description: '剑道极诣，高处不胜寒。洞悉天下招式破绽，但性情孤高冷僻，注定孤独一生。',
    discounts: { savvyRequirementOffset: -3, martialTypeDiscount: { 剑法: 0.3 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 刀法
  {
    name: '刀口舐血',
    rank: '粗浅',
    category: '兵刃',
    cost: 2,
    description: '草莽绿林出身，熟悉短兵劈砍，出刀狠辣直接。',
    discounts: { martialTypeDiscount: { 刀法: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '疯魔刀意',
    rank: '传家',
    category: '兵刃',
    cost: 5,
    description: '战斗越是激烈，神智越是癫狂。刀法大开大合，如狂风骤雨，以伤换伤。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 刀法: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '雪山飞狐',
    rank: '传家',
    category: '兵刃',
    cost: 5,
    description: '刀法灵动诡异，出刀角度匪夷所思，常带苍凉孤寂之意，令对手寒意顿生。',
    discounts: { martialTypeDiscount: { 刀法: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '力劈华山',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '天生神力专修重刀，每一刀都势大力沉，普通的兵刃与其碰撞极易断裂。',
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '杀神一刀斩',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '舍弃防守只求一击必杀的惨烈刀势，面对强敌敢于以硬抗换取近身斩杀。',
    attributeModifiers: { 臂力: 10, 机敏: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '杀人如麻',
    rank: '镇派',
    category: '兵刃',
    cost: 12,
    description: '一身煞气极重，拔刀时周围温度骤降，常能令心志不坚之敌手胆寒怯战。',
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 枪戟长兵
  {
    name: '行伍阵势',
    rank: '粗浅',
    category: '兵刃',
    cost: 2,
    description: '站过军阵，通晓长兵突刺与借力之道。',
    discounts: { martialTypeDiscount: { 枪戟: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '横扫千军',
    rank: '传家',
    category: '兵刃',
    cost: 5,
    description: '天生属于沙场，面对群攻时枪法威力不减反增，利用长兵优势控场自如。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 枪戟: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '回马一枪',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '败退往往是诱敌深入之计，逃跑佯败时能瞬间刺出意想不到的致命反杀。',
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '龙胆亮银',
    rank: '镇派',
    category: '兵刃',
    cost: 12,
    description: '单枪匹马闯入重围而面无惧色，万军之中气魄摄人，枪出如潜龙出海。',
    attributeModifiers: { 臂力: 15, 气血: 10 },
    discounts: { martialTypeDiscount: { 枪戟: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '霸王卸甲',
    rank: '镇派',
    category: '兵刃',
    cost: 12,
    description: '弃盔甲而不格挡，枪意暴涨至极限，不成功便成仁的惨烈枪势。',
    attributeModifiers: { 臂力: 20 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 拳掌
  {
    name: '皮糙肉厚',
    rank: '粗浅',
    category: '兵刃',
    cost: 2,
    description: '空手肉搏不觉痛，筋骨耐打。',
    attributeModifiers: { 气血: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '拳镇山河',
    rank: '传家',
    category: '兵刃',
    cost: 5,
    description: '一双铁拳磨砺得坚硬如铁，修习拳脚掌法时如虎添翼，招式沉稳刚猛。',
    attributeModifiers: { 臂力: 10 },
    discounts: { martialTypeDiscount: { 拳掌: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '四两拨千斤',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '深谙太极圆转借劲之理，擅长以巧劲化解敌方猛烈攻势并反弹其劲力。',
    attributeModifiers: { 机敏: 10, 洞察: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '降龙伏虎',
    rank: '镇派',
    category: '兵刃',
    cost: 12,
    description: '拳劲刚猛无双，一拳轰出破空呼啸，拳风暗含惊涛骇浪般的雄厚劲道。',
    attributeModifiers: { 臂力: 20 },
    discounts: { martialTypeDiscount: { 拳掌: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 暗器
  {
    name: '手腕活络',
    rank: '粗浅',
    category: '兵刃',
    cost: 2,
    description: '手指机敏，掷石子打飞鸟极准。',
    discounts: { martialTypeDiscount: { 暗器: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '漫天花雨',
    rank: '传家',
    category: '兵刃',
    cost: 5,
    description: '通晓一心多用之术，双手挥洒间能同时打出数十枚方位各异的暗器。',
    attributeModifiers: { 机敏: 10 },
    discounts: { martialTypeDiscount: { 暗器: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '含沙射影',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '精擅机括暗器，在交谈、拱手之间即可隐蔽出招，杀人于无形。',
    attributeModifiers: { 洞察: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '千臂如来',
    rank: '镇派',
    category: '兵刃',
    cost: 12,
    description: '暗器绝巅造诣，摘叶飞花皆能封穴伤人，盲打亦中百步外烛火。',
    attributeModifiers: { 机敏: 15, 洞察: 10 },
    discounts: { martialTypeDiscount: { 暗器: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 身法轻功
  {
    name: '脚底抹油',
    rank: '粗浅',
    category: '身法',
    cost: 2,
    description: '见势不妙溜得飞快，跑路步法纯熟。',
    discounts: { martialTypeDiscount: { 轻功: 0.1 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '身轻如燕',
    rank: '传家',
    category: '身法',
    cost: 5,
    description: '骨骼清奇，身形飘逸如燕，飞檐走壁不在话下，在轻功身法上有极高造诣。',
    attributeModifiers: { 机敏: 10 },
    discounts: { martialTypeDiscount: { 轻功: 0.25 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '动如雷霆',
    rank: '上乘',
    category: '身法',
    cost: 8,
    description: '出手果断迅疾，战斗时崇尚先发制人，抢占绝对先机。',
    attributeModifiers: { 机敏: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '燕返绝影',
    rank: '上乘',
    category: '身法',
    cost: 8,
    description: '追求极致的拔刀身法与瞬时爆发，双方对峙之时能以鬼魅速度后发先至。',
    attributeModifiers: { 机敏: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '凌波绝影',
    rank: '镇派',
    category: '身法',
    cost: 12,
    description: '身法化虚为实如浮光掠影，在漫天刀光剑影中闪展腾挪，从容不迫。',
    attributeModifiers: { 机敏: 20 },
    discounts: { martialTypeDiscount: { 轻功: 0.2 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 全武道通识
  {
    name: '触类旁通',
    rank: '传家',
    category: '兵刃',
    cost: 5,
    description: '武学悟性出众，举一反三，研习招式效率过人。',
    discounts: { savvyRequirementOffset: -1 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '嗜武如命',
    rank: '上乘',
    category: '兵刃',
    cost: 8,
    description: '将武道视为生命，无时无刻不在揣摩切磋，全流派功法精进速度均获得提升。',
    discounts: { globalUpgradeDiscount: 0.1 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '武学奇才',
    rank: '镇派',
    category: '兵刃',
    cost: 12,
    description: '天生百脉具通的绝代奇才，任何深奥武功一看便懂，极难遇到修炼瓶颈。',
    discounts: { savvyRequirementOffset: -2, globalUpgradeDiscount: 0.15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // ============================================
  // 2. 肉身体魄域（骨骼、抗性、纯外家肉身）
  // ============================================
  {
    name: '体魄强健',
    rank: '粗浅',
    category: '体质',
    cost: 2,
    description: '生来体格健壮，比常人更能承受苦累劳作。',
    attributeModifiers: { 根骨: 10, 气血: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '意志坚定',
    rank: '粗浅',
    category: '体质',
    cost: 2,
    description: '心志坚韧如磐石，在严刑拷问或心魔诱惑前不易动摇。',
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '铁骨铮铮',
    rank: '传家',
    category: '体质',
    cost: 5,
    description: '骨骼异于常人的坚硬，寻常棍棒钝器击中难以伤及筋骨。',
    attributeModifiers: { 根骨: 15, 气血: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '铜皮铁骨',
    rank: '上乘',
    category: '体质',
    cost: 8,
    description: '肉身横练有成，肌理紧密如铜铁，寻常刀刃划过只留白痕。',
    attributeModifiers: { 根骨: 20, 气血: 20 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '金刚怒目',
    rank: '上乘',
    category: '体质',
    cost: 8,
    description: '佛门降魔威势，面对凶顽之徒招式伴随低沉雷音，声势沉雄。',
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '金刚不坏',
    rank: '镇派',
    category: '体质',
    cost: 12,
    description: '外家肉身横练巅峰，气血如烘炉奔涌，极抗外伤击打。',
    attributeModifiers: { 根骨: 25, 气血: 25 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // ============================================
  // 3. 经脉内功域（纯阳、至阴、道玄、佛家）
  // ============================================
  {
    name: '丹田气海',
    rank: '传家',
    category: '内功',
    cost: 5,
    description: '天生丹田开阔，内息流转不易滞涩，真气储备充裕。',
    attributeModifiers: { 内力: 15 },
    discounts: { martialTypeDiscount: { 内功: 0.15 } },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '上善若水',
    rank: '上乘',
    category: '内功',
    cost: 8,
    description: '内力性质至柔至顺，比拼内息时韧性绵长，善于化解刚猛劲力。',
    attributeModifiers: { 内力: 15, 根骨: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '童子金身',
    rank: '镇派',
    category: '内功',
    cost: 12,
    description: '保持元阳未泄时内力生生不息，修行效率极高；但破戒将受内息反噬。',
    attributeModifiers: { 内力: 20, 气血: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '九阳之体',
    rank: '绝世',
    category: '内功',
    cost: 16,
    description: '天生纯阳经脉，阳气充沛，是修炼至阳武学的绝佳体质，诸邪难侵。',
    attributeModifiers: { 内力: 25, 气血: 20 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '至阴之体',
    rank: '绝世',
    category: '内功',
    cost: 16,
    description: '体质阴寒玄幽，内息冷冽如霜，极利于修习阴柔与幽微武学。',
    attributeModifiers: { 内力: 25, 机敏: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '紫气东来',
    rank: '传说',
    category: '内功',
    cost: 20,
    description: '绝世道门灵胎，每日清晨吞吐朝霞紫气，驻颜极缓，内息纯阳浩然。',
    attributeModifiers: { 内力: 30, 根骨: 20, 气血: 20 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // ============================================
  // 4. 情爱因果域（NTL、NTR、软饭、桃花）
  // ============================================
  {
    name: '暗送秋波',
    rank: '粗浅',
    category: '情爱',
    cost: 2,
    description: '眉目含情，善解人意，面对有婚约或心仪之异性时更易拉近私下关系。',
    flavorPrompt: '面对有伴侣的异性交谈时常带自然撩拨，言语得体不易引起戒心。',
  },
  {
    name: '眉清目秀',
    rank: '粗浅',
    category: '情爱',
    cost: 2,
    description: '长相干净讨喜，初见之时容易获得江湖长辈与市井豪客的好感照拂。',
    flavorPrompt: '相貌清秀端正，日常问路打听消息时NPC态度亲和耐烦。',
  },
  {
    name: '红颜知己',
    rank: '传家',
    category: '情爱',
    cost: 5,
    description: '极擅倾听异性在伴侣面前无法启齿的委屈，善于在他人情感裂隙中获得信任。',
    flavorPrompt: '异性极易视其为知心良友，倾诉夫妻隔阂，剧情中极擅充当感情倾诉对象。',
  },
  {
    name: '移花接木',
    rank: '传家',
    category: '情爱',
    cost: 5,
    description: '抚养仇人或伴侣与他人之子毫无芥蒂，后代极具孝心成材，受江湖敬仰。',
    flavorPrompt: '胸襟开阔不拘小节，剧情中常以仁义宽厚长辈形象为人称道。',
  },
  {
    name: '苦主命格',
    rank: '传家',
    category: '情爱',
    cost: 5,
    description: '命中注定情路多舛，伴侣易生变故或离去；然而痛失所爱时修行效率暴增。',
    flavorPrompt: '遭遇情感背叛或生离死别时心境剧震，化悲痛为苦修动力，剧情中更显坚毅苍凉。',
  },
  {
    name: '天生尤物',
    rank: '传家',
    category: '情爱',
    cost: 5,
    description: '风姿绰约冠绝同侪，举手投足极具异性吸引力，容易引得高手侧目。',
    flavorPrompt: '容貌气质出众，异性NPC与之对视常有恍惚，非深仇大恨极难痛下杀手。',
  },
  {
    name: '墙脚金锄',
    rank: '上乘',
    category: '情爱',
    cost: 8,
    description: '擅长在他人看似美满的姻缘中寻找裂缝，甚至能在目标大婚之日使其动摇。',
    flavorPrompt: '剧情中擅长在关键时刻以言辞信物打动已有婚约之人，使其当众生悔。',
  },
  {
    name: '夺妻之恨',
    rank: '上乘',
    category: '情爱',
    cost: 8,
    description: '道侣被夺或被奸人所害后化身复仇修罗，面对仇家时招招致命凶险。',
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: '刻骨仇恨铭刻于心，面对仇敌或轻薄之徒时杀伐果断，言语冰冷绝情。',
  },
  {
    name: '软饭硬吃',
    rank: '上乘',
    category: '情爱',
    cost: 8,
    description: '自身战力平平，却极受高境界异性高手青睐庇护，危难关头常有人相助。',
    flavorPrompt: '面对强敌时善于示弱借势，高阶异性NPC极易产生护犊关爱之意。',
  },
  {
    name: '魏武遗风（曹贼）',
    rank: '镇派',
    category: '情爱',
    cost: 12,
    description: '对已有家室之异性吸引力奇高，言谈举止反常地常被其伴侣视为信赖良友。',
    flavorPrompt: '在人妇或名花有主者面前魅力非凡，且其原配常常视其为通家之好、生死兄弟。',
  },
  {
    name: '绿帽神功',
    rank: '镇派',
    category: '情爱',
    cost: 12,
    description: '世人的冷嘲热讽反倒成为磨砺心性的沃土，逆境中内息越挫越韧。',
    attributeModifiers: { 内力: 15, 气血: 10 },
    flavorPrompt: '唾面自干心若枯井，任凭江湖流言蜚语中伤，神色自若波澜不惊。',
  },
  {
    name: '太上忘情',
    rank: '绝世',
    category: '情爱',
    cost: 16,
    description: '历尽沧海斩断世俗红尘羁绊，心境无垢，参悟高深武学犹如明镜止水。',
    discounts: { savvyRequirementOffset: -3 },
    flavorPrompt: '情至极处反归于淡漠，清冷超然，举手投足无半点凡尘情欲纠缠。',
  },
  {
    name: '倾覆天下',
    rank: '绝世',
    category: '情爱',
    cost: 16,
    description: '祸水级绝色容姿，一举一动足以牵动数大宗门恩怨，群雄争相折腰。',
    flavorPrompt: '风华绝代倾国倾城，江湖豪杰、正邪掌门常为其一颦一笑而大动干戈。',
  },

  // ============================================
  // 5. 江湖奇人域（性格大病、荒诞绝活、因果律）
  // ============================================
  {
    name: '古灵精怪',
    rank: '粗浅',
    category: '奇人',
    cost: 2,
    description: '心思活络机敏，常有天马行空的想法，善于另辟蹊径解决棘手难题。',
    flavorPrompt: '言语俏皮跳脱，行事出人意表，不喜拘泥凡俗礼节。',
  },
  {
    name: '尊师重道',
    rank: '粗浅',
    category: '奇人',
    cost: 2,
    description: '极其尊敬师长门楣，门派归属感极强，深得同门长辈喜爱。',
    flavorPrompt: '行事尊奉师命规矩，言必称师门教诲，极重同门之谊。',
  },
  {
    name: '丹心侠骨',
    rank: '粗浅',
    category: '奇人',
    cost: 2,
    description: '见不平之事必拔刀相助，侠肝义胆，虽易招惹麻烦却深得民间赞颂。',
    flavorPrompt: '路见不平一身浩然正气，宁折不弯，侠名远播。',
  },
  {
    name: '扫地僧',
    rank: '传家',
    category: '奇人',
    cost: 5,
    description: '大隐隐于市，身着朴素衣着时气质极不起眼，极擅低调自悟武学。',
    flavorPrompt: '平平无奇深藏不露，日常粗布麻衣扫阶除尘，无人能看穿其深浅。',
  },
  {
    name: '菩萨低眉',
    rank: '传家',
    category: '奇人',
    cost: 5,
    description: '面相慈悲端庄，非血海深仇之敌极难对其生杀心，化解江湖干戈如春风化雨。',
    flavorPrompt: '神态慈和从容，言辞常具安抚人心之效，擅长化解争端。',
  },
  {
    name: '放下屠刀',
    rank: '传家',
    category: '奇人',
    cost: 5,
    description: '若涉足黑道重杀戮，心生忏悔皈依正道时，一身煞气转化为精纯武念。',
    flavorPrompt: '浪子回头金不换，眉宇间常带自省与度人之意。',
  },
  {
    name: '剑性恋',
    rank: '传家',
    category: '奇人',
    cost: 5,
    description: '无法对凡俗异性产生恋爱兴趣，视随身佩剑为唯一道侣，日夜擦拭对谈。',
    flavorPrompt: '对凡俗男女情事毫无感觉，视爱剑如发妻/夫君，神情执拗痴迷。',
  },
  {
    name: '滑跪宗师',
    rank: '传家',
    category: '奇人',
    cost: 5,
    description: '能屈能伸，濒死之际滑跪求饶言辞真挚动人，常令强敌下不去死手甚至赐教。',
    flavorPrompt: '极懂察言观色，见势不妙下跪作揖一气呵成，言辞恳切惹人发笑又同情。',
  },
  {
    name: '隐忍如龟',
    rank: '上乘',
    category: '奇人',
    cost: 8,
    description: '极擅借助环境收敛生息，可为达成目的在恶劣环境下潜伏数日静候良机。',
    flavorPrompt: '耐性极佳气息如枯木，隐匿潜行时极难被旁人察觉动静。',
  },
  {
    name: '战略性平地摔',
    rank: '上乘',
    category: '奇人',
    cost: 8,
    description: '笨人自有笨福，搏斗失误摔倒常误打误撞避开夺命暗器或反点对手死穴。',
    flavorPrompt: '战斗动作偶显滑稽踉跄，却总能因巧合阴差阳错化险为夷。',
  },
  {
    name: '纯路人存在感',
    rank: '上乘',
    category: '奇人',
    cost: 8,
    description: '存在感稀薄如影子，偷盗或脱战数日后，寻常江湖人极易将其容貌忘得精光。',
    flavorPrompt: '五官平淡如水，走入人群瞬息无踪，NPC转头便记不清其具体样貌。',
  },
  {
    name: '绝世毒奶',
    rank: '上乘',
    category: '奇人',
    cost: 8,
    description: '言语仿佛受因果律牵引，一旦在言谈中极力称赞某人必定大胜，对方往往遭重。',
    flavorPrompt: '日常聊天立下flag往往离奇应验，惹得周围同伴提心吊胆。',
  },
  {
    name: '凭本事借钱',
    rank: '镇派',
    category: '奇人',
    cost: 12,
    description: '债多不压身，欠各方钱庄大佬银两巨甚，各路债主为收回老本不得不暗中相护。',
    flavorPrompt: '走到哪打白条赖账到哪，神态理直气壮，债主们恨得牙痒却生怕其暴毙。',
  },
  {
    name: '纯纯恋爱脑',
    rank: '镇派',
    category: '奇人',
    cost: 12,
    description: '单身时心性平常；一旦坠入爱河悟性归零，但道侣受辱发狂时武勇暴增。',
    attributeModifiers: { 臂力: 20 },
    flavorPrompt: '恋爱之时满心唯有道侣一人，憨傻痴情，谁敢犯其道侣必遭疯魔反扑。',
  },
  {
    name: '闭口禅',
    rank: '绝世',
    category: '奇人',
    cost: 16,
    description: '修持佛门不语真戒，剧情中永不开口言语，内息激荡充盈，破戒说话功力受创。',
    attributeModifiers: { 内力: 25 },
    flavorPrompt: '常年以手势或墨书示意，唇齿紧闭，双眸如古井无波，不发一语。',
  },
  {
    name: '残阳诡变',
    rank: '绝世',
    category: '奇人',
    cost: 16,
    description: '自宫去势断绝世俗情欲，极阴真气破体而出，身法如鬼魅变幻莫测。',
    attributeModifiers: { 机敏: 30 },
    flavorPrompt: '面容白皙无须，嗓音尖细清冷，眼神阴鸷莫测，无情欲挂碍。',
  },

  // ============================================
  // 6. 医毒奇门域（丹药、毒功、蛊虫、机关）
  // ============================================
  {
    name: '心灵手巧',
    rank: '粗浅',
    category: '医毒',
    cost: 2,
    description: '十指纤细灵活，擅长开锁、拆装机括与细致手工。',
    flavorPrompt: '手脚麻利细密，善于拨弄细小机括与暗锁。',
  },
  {
    name: '识草尝百',
    rank: '粗浅',
    category: '医毒',
    cost: 2,
    description: '略识百草药性，采集山野药材时偶能辨识良药。',
    flavorPrompt: '见草木便下意识掐闻辨味，口尝药性习以为常。',
  },
  {
    name: '危机感应',
    rank: '传家',
    category: '医毒',
    cost: 5,
    description: '对致命杀气与暗算具备惊人的本能直觉，险境常能后背发凉示警。',
    attributeModifiers: { 洞察: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '目光如炬',
    rank: '传家',
    category: '医毒',
    cost: 5,
    description: '目力过人，极擅在阴暗混乱处辨识蛛丝马迹与细微毒物。',
    attributeModifiers: { 洞察: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '药王转世',
    rank: '上乘',
    category: '医毒',
    cost: 8,
    description: '医道药理造诣非凡，丹药服用吸收更佳，擅长救死扶伤疗愈重创。',
    attributeModifiers: { 气血: 10, 内力: 10 },
    flavorPrompt: '望闻问切信手拈来，对各门派毒伤病患胸有成竹。',
  },
  {
    name: '百毒不侵',
    rank: '上乘',
    category: '医毒',
    cost: 8,
    description: '体质奇异或服食过天地奇草，寻常草木蛇蝎剧毒入口如饮寻常茶汤。',
    attributeModifiers: { 根骨: 10 },
    flavorPrompt: '见毒物面不改色，寻常蒙汗药砒霜入腹毫无波澜。',
  },
  {
    name: '阴煞玄脉',
    rank: '上乘',
    category: '医毒',
    cost: 8,
    description: '内劲附带极阴寒毒，被其掌劲所伤者伤口不愈，每逢阴雨寒气蚀骨难消。',
    attributeModifiers: { 内力: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '万毒归宗',
    rank: '镇派',
    category: '医毒',
    cost: 12,
    description: '以身纳毒自幼淬炼，周身血液化为见血封喉的混合剧毒，克制吸功邪术。',
    attributeModifiers: { 气血: 15, 内力: 15 },
    flavorPrompt: '体带幽微草药苦香，血色隐泛乌紫，寻常蚊蝇沾体即毙。',
  },
  {
    name: '本命蛊王',
    rank: '绝世',
    category: '医毒',
    cost: 16,
    description: '体内育有一尊性命相连的南疆蛊王，能以蛊毒护心化解濒死死局。',
    attributeModifiers: { 气血: 20, 根骨: 15 },
    flavorPrompt: '心房常有微弱异样律动，遇剧毒恶障蛊虫自发护体长鸣。',
  },

  // ============================================
  // 7. 残疾缺陷域（负面天赋，固定四档返还点数：-3 / -6 / -10 / -20）
  // ============================================
  // 轻度性格缺陷 (-3)
  {
    name: '贪财',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '见利忘义，爱财如命。常因蝇头小利背信弃义或身陷死地，行商采购时极易被市井奸商痛宰加价。',
    flavorPrompt: '极度贪婪吝啬，遇到黄白之物便挪不开眼，常为蝇头小利不择手段甚至临阵倒戈，口碑极差。',
  },
  {
    name: '暴躁易怒',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '性烈如火，一点即着。极易被挑衅激怒，一旦动怒便无法保持冷静，常常主动招致杀身之祸。',
    flavorPrompt: '性格暴烈如火药桶，极易遭人激将法暗算，盛怒之时不顾后果拔刀相向，处事极其鲁莽。',
  },
  {
    name: '口吃',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '天生重度结巴，舌根僵硬。急迫之时辞不达意，极易引人嗤笑，一切说服劝解与江湖交涉必定以惨败告终。',
    flavorPrompt: '日常交谈结巴严重，言语艰涩，任何试图化解冲突的言语交涉必定被误解激化。',
  },
  {
    name: '酒瘾',
    rank: '缺陷',
    category: '缺陷',
    cost: -3,
    description: '嗜酒如命，每日必须狂饮烈酒。若半日无酒便浑身发抖冷汗直冒、四肢绵软无力，常因烂醉如泥而误事。',
    flavorPrompt: '嗜酒无度，腰间酒葫芦从不离身，无酒便狂躁手抖，醉卧街头常遭宵小洗劫。',
  },

  // 中度生理/感官缺陷 (-6)
  {
    name: '晕血',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '目睹鲜血与开膛破肚便心悸眩晕、面色惨白四肢酸软，甚至当场恶心呕吐，瞬间丧失临战战意。',
    flavorPrompt: '极其畏惧腥风血雨，目睹血腥厮杀便头晕目眩战意全消，常需同伴搀扶逃命。',
  },
  {
    name: '夜盲',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '日落西山之后目力犹如瞽目盲人，眼前漆黑一片，暗夜之中伸手不见五指，极易踏空坠崖或遭伏击。',
    flavorPrompt: '入夜后双眼完全无法视物，夜间作战犹如盲打，寸步难行极易遭暗袭。',
  },
  {
    name: '骨质疏松',
    rank: '缺陷',
    category: '缺陷',
    cost: -6,
    description: '骨骼酥脆薄脆如枯槁朽木，挨上一记重拳钝击极易粉碎性骨折，气血与根骨永久削减，伤筋动骨需卧床半年。',
    attributeModifiers: { 根骨: -15, 气血: -15 },
    flavorPrompt: '体质孱弱骨骼酥脆，挨上一记重手便吐血骨折，常年药罐不离身。',
  },

  // 重度伤残/断门缺陷 (-10)
  {
    name: '独眼',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '彻底被剜去一只眼珠，视野残缺一半，无纵深感，盲侧极易遭暗器致命偷袭，洞察永久暴跌。',
    attributeModifiers: { 洞察: -25 },
    flavorPrompt: '单眼遮罩黑布，转头环顾幅度极大，盲区遭遇偷袭难以防备。',
  },
  {
    name: '失聪',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '双耳永久丧失听力，天地死寂无声，无法听见任何脚步、暗器破空与呼救声，洞察永久暴跌。',
    attributeModifiers: { 洞察: -25 },
    flavorPrompt: '两耳失聪一片死寂，全凭目光观察口型，暗算与偷袭对其防不胜防。',
  },
  {
    name: '断臂',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '齐肩失去整条手臂，终身残废！绝对无法双持或佩戴副手兵刃盾牌，单手持兵，臂力与机敏永久暴跌！',
    attributeModifiers: { 臂力: -20, 机敏: -20 },
    restrictions: {
      forbiddenEquipSlots: ['副手'],
    },
    flavorPrompt: '断袖迎风飘荡，单手持械，日常起居多有不便，战斗时缺少一手格挡。',
  },
  {
    name: '天下通缉',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '被名门正派与朝廷六扇门以万两黄金联合悬赏海捕！江湖黑白两道倾巢而出，所过城池关隘皆有鹰犬埋伏围剿，举目皆敌！',
    flavorPrompt: '头顶天下第一悬赏海捕文书，六扇门捕快与绿林杀手如蛆附骨，无处藏身。',
  },
  {
    name: '内伤缠身',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '脏腑受过宗师绝学重创留下不治宿疾，每逢剧烈死斗或阴雨寒夜便真气乱窜咳血不止，气血与内力上限永久大损！',
    attributeModifiers: { 气血: -20, 内力: -20 },
    flavorPrompt: '病骨支离面如金纸，久战必气血翻江倒海，帕掩唇角尽是殷红鲜血。',
  },
  {
    name: '天生目盲（盲侠）',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '双目失明，天生不见天日！绝对无法研读视觉秘籍与使用任何暗器，洞察暴跌，只能凭借微弱风声盲打度日！',
    attributeModifiers: { 洞察: -30, 机敏: 10 },
    restrictions: {
      forbiddenMartialTypes: ['暗器'],
    },
    flavorPrompt: '双眼蒙布，目不能视，虽听觉警觉敏锐，但凡俗生活多有艰难。',
  },
  {
    name: '诅咒血脉',
    rank: '缺陷',
    category: '缺陷',
    cost: -10,
    description: '血脉中背负着天道厄运反噬之咒，气血与内力上限永久受挫，所到之处必遭天煞孤星般的无妄灾祸与背刺！',
    attributeModifiers: { 气血: -15, 内力: -15 },
    flavorPrompt: '命格凶险灾煞缠身，身边亲友常罹离奇横祸，行事处处受天道阻遏。',
  },

  // 绝灭天残 (-20)
  {
    name: '经脉尽断',
    rank: '缺陷',
    category: '缺陷',
    cost: -20,
    description: '周天大脉彻底断绝碎裂，丹田气海漏尽！绝对无法修炼、进阶或运转任何内功！内力上限腰斩，只能以凡人之躯血肉硬抗！',
    attributeModifiers: { 内力: -50 },
    restrictions: {
      forbiddenMartialTypes: ['内功'],
    },
    flavorPrompt: '周身经脉尽废，内家真气无从谈起，只能以惊人毅力纯修一身外家肉体！',
  },

  // ============================================
  // 8. 属性极限触发型天赋（由初始属性极值自动赋予，无 cost）
  // ============================================
  // 臂力
  {
    name: '肌肉萎缩',
    rank: '缺陷',
    category: '缺陷',
    description: '肌肉严重萎缩无力，毫无气力可言。',
    attributeThreshold: { attribute: '臂力', minValue: 0, maxValue: 1 },
    attributeModifiers: { 臂力: -30 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '手无缚鸡',
    rank: '缺陷',
    category: '缺陷',
    description: '力气极小，连抓一只鸡的气力都没有。',
    attributeThreshold: { attribute: '臂力', minValue: 2, maxValue: 5 },
    attributeModifiers: { 臂力: -15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '天生神力',
    rank: '传家',
    category: '体质',
    description: '天生臂力过人，骨量沉实，气力远胜同辈。',
    attributeThreshold: { attribute: '臂力', minValue: 13, maxValue: 16 },
    attributeModifiers: { 臂力: 15 },
    flavorPrompt: '腕力极沉，激动时随手捏碎瓷杯，单手搬运重物如履平地。',
  },
  {
    name: '霸王扛鼎',
    rank: '镇派',
    category: '体质',
    description: '力拔山兮气盖世，宛如古之霸王再世，肉身神力惊世骇俗。',
    attributeThreshold: { attribute: '臂力', minValue: 17 },
    attributeModifiers: { 臂力: 25 },
    flavorPrompt: '臂围粗壮坚实，随手挥舞大铁锤石碾如掷稻草。',
  },

  // 根骨
  {
    name: '命若悬丝',
    rank: '缺陷',
    category: '缺陷',
    description: '体质极度虚弱，犹如悬于狂风中的游丝，随时可能晕厥。',
    attributeThreshold: { attribute: '根骨', minValue: 0, maxValue: 1 },
    attributeModifiers: { 根骨: -30, 气血: -30 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '经脉淤塞',
    rank: '缺陷',
    category: '缺陷',
    description: '周天经脉多处淤阻，气血内息运转晦涩不畅。',
    attributeThreshold: { attribute: '根骨', minValue: 2, maxValue: 5 },
    attributeModifiers: { 根骨: -15, 内力: -15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '龙精虎猛',
    rank: '传家',
    category: '体质',
    description: '精力过人，气血旺盛如火，体魄强健如龙虎奔行。',
    attributeThreshold: { attribute: '根骨', minValue: 13, maxValue: 16 },
    attributeModifiers: { 根骨: 15, 气血: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '武骨天成',
    rank: '镇派',
    category: '体质',
    description: '百世难遇的纯正练武胚子，筋络宽阔，骨骼如玉髓天成。',
    attributeThreshold: { attribute: '根骨', minValue: 17 },
    attributeModifiers: { 根骨: 25, 气血: 20, 内力: 10 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 机敏
  {
    name: '反应迟缓',
    rank: '缺陷',
    category: '缺陷',
    description: '肢体反应极度缓慢，猝不及防之事难以应变。',
    attributeThreshold: { attribute: '机敏', minValue: 0, maxValue: 1 },
    attributeModifiers: { 机敏: -30 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '笨手笨脚',
    rank: '缺陷',
    category: '缺陷',
    description: '手脚协调较差，行动显得木讷笨拙。',
    attributeThreshold: { attribute: '机敏', minValue: 2, maxValue: 5 },
    attributeModifiers: { 机敏: -15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '动若脱兔',
    rank: '传家',
    category: '身法',
    description: '步法迅疾敏捷，身随意转，轻捷如狡兔脱困。',
    attributeThreshold: { attribute: '机敏', minValue: 13, maxValue: 16 },
    attributeModifiers: { 机敏: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '浮光掠影',
    rank: '镇派',
    category: '身法',
    description: '身形快如惊鸿浮光，凡人肉眼极难捕捉其移动残影。',
    attributeThreshold: { attribute: '机敏', minValue: 17 },
    attributeModifiers: { 机敏: 25 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 洞察
  {
    name: '五感俱衰',
    rank: '缺陷',
    category: '缺陷',
    description: '视听嗅触全面迟钝衰退，极难察觉危险临近。',
    attributeThreshold: { attribute: '洞察', minValue: 0, maxValue: 1 },
    attributeModifiers: { 洞察: -30 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '视而不见',
    rank: '缺陷',
    category: '缺陷',
    description: '粗心大意，常常忽略近在咫尺的细致蛛丝马迹。',
    attributeThreshold: { attribute: '洞察', minValue: 2, maxValue: 5 },
    attributeModifiers: { 洞察: -15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '明察秋毫',
    rank: '传家',
    category: '医毒',
    description: '目光如电，连秋天鸟兽细微绒毛都清晰可见，极擅观形辨微。',
    attributeThreshold: { attribute: '洞察', minValue: 13, maxValue: 16 },
    attributeModifiers: { 洞察: 15 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '洞若观火',
    rank: '镇派',
    category: '医毒',
    description: '目力神识对全局的洞悉如看掌心火烛一般分明透彻。',
    attributeThreshold: { attribute: '洞察', minValue: 17 },
    attributeModifiers: { 洞察: 25 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 悟性
  {
    name: '浑浑噩噩',
    rank: '缺陷',
    category: '缺陷',
    description: '灵台混沌昏沉，对高深武学拳经如看天书。',
    attributeThreshold: { attribute: '悟性', minValue: 0, maxValue: 1 },
    discounts: { savvyRequirementOffset: 4 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '榆木脑袋',
    rank: '缺陷',
    category: '缺陷',
    description: '思路固执死板，难以开窍，研读招式进展极为缓慢。',
    attributeThreshold: { attribute: '悟性', minValue: 2, maxValue: 5 },
    discounts: { savvyRequirementOffset: 2 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '聪慧过人',
    rank: '传家',
    category: '兵刃',
    description: '聪敏机变，学习拳经剑谱领悟神速。',
    attributeThreshold: { attribute: '悟性', minValue: 13, maxValue: 16 },
    discounts: { savvyRequirementOffset: -1 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },
  {
    name: '玲珑七窍',
    rank: '镇派',
    category: '兵刃',
    description: '七窍玲珑，心如明镜，对天下至奥武学一通百通。',
    attributeThreshold: { attribute: '悟性', minValue: 17 },
    discounts: { savvyRequirementOffset: -3 },
    flavorPrompt: COMBAT_RULE_PROMPT,
  },

  // 风姿
  {
    name: '面目可憎',
    rank: '缺陷',
    category: '缺陷',
    description: '容貌凶丑怪诞，极易惹人厌恶戒备。',
    attributeThreshold: { attribute: '风姿', minValue: 0, maxValue: 1 },
    flavorPrompt: '相貌凶恶古怪，初见者常退避三舍。',
  },
  {
    name: '獐头鼠目',
    rank: '缺陷',
    category: '缺陷',
    description: '长相猥琐贼头贼脑，给人的第一印象欠佳。',
    attributeThreshold: { attribute: '风姿', minValue: 2, maxValue: 5 },
    flavorPrompt: '神态猥琐眼神闪烁，常被当成江湖宵小盘查。',
  },
  {
    name: '玉树临风',
    rank: '传家',
    category: '情爱',
    description: '风度翩翩如玉树琼枝，气质卓然出众。',
    attributeThreshold: { attribute: '风姿', minValue: 13, maxValue: 16 },
    flavorPrompt: '身姿俊拔气度儒雅，驻足处常有女子悄悄注目。',
  },
  {
    name: '绝代风华',
    rank: '镇派',
    category: '情爱',
    description: '容止才貌冠绝一代，举手投足尽显风流神韵，过目难忘。',
    attributeThreshold: { attribute: '风姿', minValue: 17 },
    flavorPrompt: '风华绝代惊艳当世，一入客栈满堂寂然无声。',
  },

  // 福缘
  {
    name: '天煞孤星',
    rank: '缺陷',
    category: '缺陷',
    description: '命带灾煞，身边亲近之人多罹祸患，注定孤苦无依。',
    attributeThreshold: { attribute: '福缘', minValue: -6, maxValue: -5 },
    flavorPrompt: '命格凶险，同行者易遭飞来横祸，独行时常遇恶运。',
  },
  {
    name: '霉运缠身',
    rank: '缺陷',
    category: '缺陷',
    description: '运道欠佳，日常琐事常遭磕绊倒霉。',
    attributeThreshold: { attribute: '福缘', minValue: -4, maxValue: -1 },
    flavorPrompt: '喝凉水塞牙，晴天赶路常遇骤雨落石。',
  },
  {
    name: '吉星高照',
    rank: '传家',
    category: '奇人',
    description: '吉星悬顶，机缘常伴左右，往往能化险为夷。',
    attributeThreshold: { attribute: '福缘', minValue: 7, maxValue: 10 },
    flavorPrompt: '常逢贵人相助，跳崖偶落深潭，跌落草丛必遇野果。',
  },
  {
    name: '天命所归',
    rank: '镇派',
    category: '奇人',
    description: '众望所归，天道钟爱，命定的大时代风云弄潮儿。',
    attributeThreshold: { attribute: '福缘', minValue: 11 },
    flavorPrompt: '自带主角光环气运，危机深处常迎泼天奇遇。',
  },
];

/**
 * 根据属性值获取触发的天赋
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
// 天赋查询与机制推导辅助函数
// ============================================

const TRAIT_MAP = new Map<string, CharacterTrait>();
for (const trait of CHARACTER_TRAITS) {
  TRAIT_MAP.set(trait.name, trait);
}

/**
 * 根据天赋名称安全查找预设定义
 */
export function getTraitByName(name: string): CharacterTrait | undefined {
  return TRAIT_MAP.get(name);
}

/**
 * 规范化天赋名称数组（支持 Record<string, unknown>、string[] 或 null/undefined）
 */
export function normalizeTraitNames(traits?: Record<string, unknown> | string[] | null): string[] {
  if (!traits) return [];
  if (Array.isArray(traits)) {
    return traits.filter(Boolean);
  }
  return Object.keys(traits).filter(k => !k.startsWith('$'));
}

/**
 * 将用户天赋转换为属性修正源列表，供 attributeCalculator 使用
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
 * 汇总计算所有天赋对修炼/学习造成的限制
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
 * 汇总计算所有天赋对升级消耗产生的折扣与基准偏移
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
