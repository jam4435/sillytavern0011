/**
 * 天赋数据库
 * 包含所有可选天赋、属性触发天赋及其相关逻辑
 */

import type { CharacterTrait, InitialAttributes } from '../types';

/**
 * 普通天赋常量列表（可选天赋）
 * 包含正面和负面天赋
 */
export const CHARACTER_TRAITS: Omit<CharacterTrait, 'id'>[] = [
  // ============================================
  // 正面天赋
  // ============================================
  {
    name: '体魄强健',
    cost: 2,
    description: '生来体格健壮，比常人更能承受苦累。',
  },
  {
    name: '触类旁通',
    cost: 5,
    description: '学习能力出众，举一反三。',
  },
  {
    name: '目光如炬',
    cost: 5,
    description: '眼力过人，善于观察细节。',
  },
  {
    name: '心灵手巧',
    cost: 2,
    description: '手指灵活，做事精细。',
  },
  {
    name: '巧舌如簧',
    cost: 5,
    description: '口才极佳，善于说服他人。',
  },
  {
    name: '意志坚定',
    cost: 2,
    description: '心志坚韧，不易动摇。',
  },
  {
    name: '过目不忘',
    cost: 2,
    description: '记忆力超群，看过的东西难以忘记。',
  },
  {
    name: '武学奇才',
    cost: 5,
    description: '对武学有着超乎常人的理解力。',
  },
  {
    name: '铁骨铮铮',
    cost: 5,
    description: '骨骼异于常人的坚硬。',
  },
  {
    name: '天生魅力',
    cost: 5,
    description: '举手投足间自有一番风采。',
  },
  {
    name: '危机感应',
    cost: 5,
    description: '能本能地感知到危险的来临。',
  },
  {
    name: '九阳之体',
    cost: 18,
    description: '体内阳气充沛，是修炼阳刚武学的绝佳体质。',
  },
  {
    name: '至阴之体',
    cost: 18,
    description: '体质阴寒，适合修炼阴柔武学。',
  },

  // ============================================
  // 叙事型天赋 (偏扮演，不直接修改数值)
  // ============================================
  {
    name: '剑痴',
    cost: 4,
    description: '对剑有着近乎偏执的痴迷，学习剑法事半功倍，但对其他武学兴致缺缺。',
  },
  {
    name: '丹心侠骨',
    cost: 3,
    description: '天生一副侠义心肠，见不平事必会出手相助，但也容易因此招惹麻烦。',
  },
  {
    name: '百毒不侵',
    cost: 6,
    description: '体质特殊，寻常毒物难以对其造成伤害。',
  },
  {
    name: '嗜武如命',
    cost: 5,
    description: '将武学视为生命，无时无刻不在钻研，修行或战斗时更容易进入顿悟状态。',
  },
  {
    name: '古灵精怪',
    cost: 3,
    description: '心思活络，常有天马行空的想法，善于另辟蹊径解决问题，但不喜遵循常规。',
  },
  {
    name: '尊师重道',
    cost: 3,
    description: '极其尊敬师长，对师门有强烈的归属感。师门任务事半功倍，但若叛出师门则会产生心魔。',
  },
  {
    name: '动如雷霆',
    cost: 4,
    description: '出手果断，战斗时崇尚主动进攻，抢占先机。',
  },
  {
    name: '静若处子',
    cost: 4,
    description: '心性沉稳，擅长后发制人，于静默中等待最佳时机。',
  },

  // ============================================
  // 情感纠葛类 (NTR与被NTR)
  // ============================================
  {
    name: '魏武遗风（曹贼）',
    cost: 8,
    description:
      '你对已有家室或身负婚约的异性拥有难以言喻的吸引力。在与此类对象相处时，你的言辞更容易打动对方心扉，且不仅不会引起对方伴侣的警觉，反而常被其视为“通家之好”或“可信赖的义兄/弟”。',
  },
  {
    name: '苦主命格',
    cost: 2,
    description:
      '命中注定情路坎坷。你的伴侣极易遭遇强敌逼迫、旧情复燃或被奸人诱骗而离你而去。然而，每当你遭遇情感背叛或痛失所爱时，你的心境将受到剧烈冲击，从而使你在修炼时，效率极高。',
  },
  {
    name: '移花接木',
    cost: 3,
    description:
      '你并不在意世俗眼光与血统纯正。当你抚养非亲生的后代（仇人之子或伴侣与他人之子）时，该后代的根骨与悟性会大幅提升，且对你极其孝顺。你往往能成为一位备受江湖敬仰的“仁义大侠”，尽管真相往往令人唏嘘。',
  },
  {
    name: '墙脚金锄',
    cost: 4,
    description:
      '你擅长在看似美满的侠侣关系中发现裂痕。你的“嘘寒问暖”和“红颜知己/蓝颜知己”行为，能大幅削弱目标与其原配的情感羁绊。甚至在目标大婚之日，你有极高概率通过一句话或一件信物，令其当众悔婚随你而去。',
  },

  // ============================================
  // 佛门禅宗类
  // ============================================
  {
    name: '扫地僧',
    cost: 5,
    description:
      '大隐隐于市。当你处于身份低微、穿着朴素或不被人注意的状态（如杂役、行脚僧）时，你偷学或自行参悟高深武学的效率达到极致。你越是显得平平无奇，旁人越难看穿你的深浅。',
  },
  {
    name: '金刚怒目',
    cost: 3,
    description:
      '佛有慈悲心，亦有降魔手段。当你面对大奸大恶之徒（如采花贼、嗜杀魔头）时，你的外功招式威力将附带极强的威慑力，伴随隐约的雷音，能令心志不坚的对手未战先怯，甚至跪地忏悔。',
  },
  {
    name: '菩萨低眉',
    cost: 4,
    description:
      '化干戈为玉帛。你天生面相庄严慈悲，在这个江湖中，除非对方与你有血海深仇，否则极难对你产生杀意。在调解江湖纷争时，你的话语权极重，往往能凭三言两语化解一场腥风血雨。',
  },
  {
    name: '童子金身',
    cost: 8,
    description:
      '保持元阳未泄时，你修行效率提升，且内力生生不息，百毒不侵。但一旦破戒，这身横练功夫将在顷刻间散去大半，且极易走火入魔。',
  },
  {
    name: '放下屠刀',
    cost: 4,
    description:
      '若你曾是杀人如麻的黑道巨擘，一旦决心皈依佛门，你往日的煞气将完全转化为精纯的佛门内力。你的罪孽越深重，皈依后的武学进境越高，往往能在一夜之间领悟“苦海无边，回头是岸”的真谛。',
  },

  // ============================================
  // 剑道独尊类
  // ============================================
  {
    name: '重剑无锋',
    cost: 5,
    description:
      '大巧不工。你摒弃了繁复花哨的剑招，转而追求绝对的力量与势能。当你使用重型兵器（如玄铁重剑）时，无视对手的招架技巧与兵器锋利度，单纯以浑厚的内力压制，一力降十会。',
  },
  {
    name: '心中有剑',
    cost: 6,
    description:
      '草木竹石皆可为剑。当你手中无剑时，你可摘叶飞花伤人，树枝、筷子在你手中不亚于神兵利器。你已不再依赖兵器的材质，而是将剑意融入万物。',
  },
  {
    name: '独孤求败',
    cost: 8,
    description:
      '高处不胜寒。你在剑道一途极具天赋，极难遇到对手。当你与用剑高手对决时，你能瞬间看破对方剑招中的破绽（即便是号称无招的剑法）。但作为代价，你一生注定孤独，难以拥有知心朋友或圆满的家庭。',
  },
  {
    name: '剑胆琴心',
    cost: 5,
    description:
      '你的剑法中融入了韵律与儒雅。在对敌时，你的剑招如同奏乐般优雅，不仅能杀伤敌人身体，更能通过剑啸声扰乱敌人心神。你适合修炼那些姿势优美、需要极高悟性与文化底蕴的剑法（如落英剑法、君子剑）。',
  },
  {
    name: '人剑合一',
    cost: 6,
    description:
      '剑即是你肢体的延伸。你没有任何拔剑的前摇动作，剑在鞘中亦能伤人。在战斗中，你不会因为兵器脱手而战力大减，你的剑仿佛有灵性一般，能随着你的意念飞旋护主（仅限于内力牵引的短距离，非仙侠御剑）。',
  },

  // ============================================
  // 东瀛武道/忍者类
  // ============================================
  {
    name: '燕返绝影',
    cost: 6,
    description:
      '追求极致的拔刀速度与瞬间爆发。在双方对峙的静止状态下，你能以后发先至的速度完成出鞘、斩杀、纳刀的过程。往往敌人看到刀光时，身躯已然分离。',
  },
  {
    name: '隐忍如龟',
    cost: 5,
    description:
      '你精通利用环境（如挖坑、潜水、利用枯叶）隐藏气息。为了达成刺杀目标或窃取情报，你可以在极度恶劣的环境下不吃不喝潜伏数日，直到目标露出破绽的那一刹那。',
  },
  {
    name: '杀神一刀斩',
    cost: 7,
    description:
      '舍弃所有防御，只求一击必杀的惨烈刀法。当你面对强敌时，能够通过自残或硬抗一招的方式换取近身机会，此状态下你的痛觉暂时消失，且不仅对敌人狠，对自己更狠。',
  },

  // ============================================
  // 道家玄门类
  // ============================================
  {
    name: '上善若水',
    cost: 7,
    description:
      '你的内力性质至柔至顺，极具韧性。遭到刚猛外力打击时，能自动卸去大半劲力。在比拼内力时，你的回气速度远超常人，往往能生生耗死内力比你深厚的对手。',
  },
  {
    name: '紫气东来',
    cost: 15,
    description:
      '每日清晨日出之时修炼，你的内功精纯度将获得极大提升。你不仅百病不生，且随着年龄增长，容颜衰老极慢，百岁高龄仍可拥有如婴儿般的红润面色，是修炼“先天功”等绝学的最佳体质。',
  },
  {
    name: '四两拨千斤',
    cost: 6,
    description:
      '深谙太极圆转之理。你极擅长在接触瞬间洞悉对手劲力的流向，从而用极小的力气改变对方的攻击轨迹，甚至将对手的攻击反弹回其自身。',
  },
  {
    name: '胎息龟蛇',
    cost: 4,
    description:
      '当你身受重伤或被困绝地（如被封在石室、跌落悬崖）时，可进入一种类似“假死”的深度休眠状态。此状态下呼吸几乎停止，消耗降至最低，能在大难中存活极长时间等待救援。',
  },

  // ============================================
  // 宫廷/太监类
  // ============================================
  {
    name: '残阳诡变',
    cost: 10,
    description:
      '欲练神功，必先自宫。身体残缺后，你的阳刚之气彻底转为诡异的极阴之气。你的身法速度突破人体极限，形如鬼魅，且不再受世俗情欲干扰，修炼速度一日千里。',
  },
  {
    name: '阴煞玄脉',
    cost: 7,
    description:
      '你的内力附带极寒阴毒属性。被你击伤的对手，伤口处不会流血，但寒气会侵入经脉，使其每逢阴雨天便剧痛难忍，需耗费极大功力镇压，终生难愈。',
  },

  // ============================================
  // 刀法狂放类
  // ============================================
  {
    name: '疯魔刀意',
    cost: 6,
    description:
      '战斗越是激烈，你的神智越是癫狂。在鲜血的刺激下，你的刀法将不再遵循套路，而是变得如暴风骤雨般狂乱且致命，完全不顾自身防守，以伤换伤，如疯魔降世。',
  },
  {
    name: '力劈华山',
    cost: 5,
    description:
      '天生神力，专修重刀。你的每一刀都势大力沉，普通的兵器与你碰撞极易断裂。面对精妙的招式，你只需一刀斩下，便能凭借绝对的力量破除一切花哨。',
  },
  {
    name: '雪山飞狐',
    cost: 5,
    description:
      '你的刀法灵动诡异，擅长在极滑、极险的环境（如冰面、悬崖）中战斗。你出刀的角度往往匪夷所思，且刀上常带有一种苍凉孤寂之意，令对手在对决中感到莫名的寒意。',
  },
  {
    name: '杀人如麻',
    cost: 5,
    description:
      '你身上的煞气极重，那是经过无数次实战杀戮积累而来的“势”。当你拔刀时，周围的温度仿佛骤降，胆小的对手甚至会被你的杀气吓得握不住兵器。',
  },

  // ============================================
  // 枪法战阵类
  // ============================================
  {
    name: '横扫千军',
    cost: 6,
    description:
      '你天生属于沙场而非擂台。当面对多名敌人的围攻时，你的枪法威力不减反增。你的攻击范围极大，擅长利用长兵器的优势控制距离，让敌人近身不得。',
  },
  {
    name: '回马一枪',
    cost: 5,
    description:
      '你的败退往往是诱敌深入的陷阱。在逃跑或佯败时，你能瞬间爆发出必杀一击，这一枪往往刺向敌人最意想不到的死角，翻盘率极高。',
  },
  {
    name: '龙胆亮银',
    cost: 7,
    description:
      '当你单枪匹马闯入敌阵时，勇气与胆魄将提升至顶点。即使身陷重围，你也毫无惧色，能在万军丛中取上将首级，且极难被流矢暗箭所伤。',
  },
  {
    name: '霸王卸甲',
    cost: 6,
    description:
      '舍弃防御，孤注一掷。当你抛弃盔甲或不再格挡时，你的枪法攻击力将提升至极限。这是一种不成功便成仁的惨烈枪意，往往能在绝境中与强敌同归于尽。',
  },

  // ============================================
  // 暗器机括类
  // ============================================
  {
    name: '漫天花雨',
    cost: 7,
    description:
      '你通晓一心多用之术。双手挥洒间，可同时打出数十枚方位、劲力、速度各不相同的暗器。这不仅是武功，更是一场绚丽而致命的艺术表演，令人避无可避。',
  },
  {
    name: '听声辨位',
    cost: 5,
    description:
      '你的耳力通神。即使在绝对黑暗的环境或双目失明的情况下，你依然可以准确判断敌人的位置，并精准地投掷暗器命中目标穴位。',
  },
  {
    name: '含沙射影',
    cost: 6,
    description:
      '你擅长使用和制造极其隐蔽的机括类暗器（如袖箭、背弩）。在与人交谈、拱手甚至下跪时，你都能在对方毫无察觉的情况下发动致命袭击。',
  },

  // ============================================
  // 毒术/蛊虫类
  // ============================================
  {
    name: '万毒归宗',
    cost: 12,
    description:
      '你的体质特殊，自幼以毒物为食。天下剧毒对你而言是大补之物。你的血液本身就是一种混合剧毒，任何敢于吸你血的毒虫或试图用内力吸取你功力的敌人，都会瞬间毙命。',
  },
  {
    name: '本命蛊王',
    cost: 10,
    description:
      '你的体内寄宿着一只与你性命相连的蛊虫。它能在你中毒时为你解毒，在你受伤时为你止血，甚至在你遭遇必死攻击时代你一死。但作为代价，你需要定期忍受万虫噬心之痛。',
  },

  // ============================================
  // 负面天赋
  // ============================================

  {
    name: '贪财',
    cost: -2,
    description: '对钱财有着过分的执着。',
  },
  {
    name: '暴躁易怒',
    cost: -2,
    description: '脾气火爆，容易冲动。',
  },
  {
    name: '骨质疏松',
    cost: -5,
    description: '骨骼脆弱，容易受伤。',
  },
  {
    name: '晕血',
    cost: -4,
    description: '看到鲜血就会头晕目眩。',
  },
  {
    name: '夜盲',
    cost: -4,
    description: '夜间视力极差。',
  },
  {
    name: '酒瘾',
    cost: -3,
    description: '嗜酒如命，难以戒除。',
  },
  {
    name: '口吃',
    cost: -3,
    description: '说话结巴，表达不畅。',
  },
  {
    name: '断臂',
    cost: -10,
    description: '失去了一条手臂。',
  },
  {
    name: '独眼',
    cost: -8,
    description: '失去了一只眼睛。',
  },
  {
    name: '失聪',
    cost: -8,
    description: '听力丧失。',
  },
  {
    name: '内伤缠身',
    cost: -10,
    description: '体内有难以治愈的内伤。',
  },
  {
    name: '经脉尽断',
    cost: -20,
    description: '全身经脉俱断，无法修炼内功。',
  },
  {
    name: '天下通缉',
    cost: -15,
    description: '被江湖各大势力通缉，无处藏身。',
  },
  {
    name: '诅咒血脉',
    cost: -18,
    description: '血脉中携带着古老的诅咒。',
  },

  // ============================================
  // 属性触发型天赋
  // ============================================
  // 其他属性（非福缘）天赋触发规则：
  // | 属性值范围 | 触发天赋类型 |
  // |-----------|------------|
  // | 0-1       | 严重负面   |
  // | 2-5       | 中等负面   |
  // | 6-12      | 无         |
  // | 13-16     | 中等正面   |
  // | 17-20     | 强力正面   |

  // 臂力 (brawn) - 范围 [0, 20]
  {
    name: '肌肉萎缩',
    description: '肌肉严重萎缩，毫无力量可言。',
    attributeThreshold: { attribute: '臂力', minValue: 0, maxValue: 1 }, // 严重负面
  },
  {
    name: '手无缚鸡',
    description: '力气极小，连抓一只鸡的力气都没有。',
    attributeThreshold: { attribute: '臂力', minValue: 2, maxValue: 5 }, // 中等负面
  },
  {
    name: '天生神力',
    description: '天生就有远超常人的力量。',
    attributeThreshold: { attribute: '臂力', minValue: 13, maxValue: 16 }, // 中等正面
  },
  {
    name: '霸王扛鼎',
    description: '力能扛鼎，堪比古之霸王。',
    attributeThreshold: { attribute: '臂力', minValue: 17 }, // 强力正面
  },
  // 根骨 (root) - 范围 [0, 20]
  {
    name: '命若悬丝',
    description: '身体极度虚弱，性命如同悬着的丝线般脆弱。',
    attributeThreshold: { attribute: '根骨', minValue: 0, maxValue: 1 }, // 严重负面
  },
  {
    name: '经脉淤塞',
    description: '经脉部分堵塞，内息运转不畅。',
    attributeThreshold: { attribute: '根骨', minValue: 2, maxValue: 5 }, // 中等负面
  },
  {
    name: '龙精虎猛',
    description: '精力旺盛，体魄强健如龙虎。',
    attributeThreshold: { attribute: '根骨', minValue: 13, maxValue: 16 }, // 中等正面
  },
  {
    name: '武骨天成',
    description: '天生一副适合练武的绝佳根骨。',
    attributeThreshold: { attribute: '根骨', minValue: 17 }, // 强力正面
  },
  // 机敏 (agility) - 范围 [0, 20]
  {
    name: '反应迟缓',
    description: '神经反应极度缓慢，难以应对突发状况。',
    attributeThreshold: { attribute: '机敏', minValue: 0, maxValue: 1 }, // 严重负面
  },
  {
    name: '笨手笨脚',
    description: '动作协调性差，显得笨拙。',
    attributeThreshold: { attribute: '机敏', minValue: 2, maxValue: 5 }, // 中等负面
  },
  {
    name: '动若脱兔',
    description: '行动迅捷，像受惊的兔子一样敏捷。',
    attributeThreshold: { attribute: '机敏', minValue: 13, maxValue: 16 }, // 中等正面
  },
  {
    name: '浮光掠影',
    description: '身法快如浮光掠影，常人难以捕捉其踪迹。',
    attributeThreshold: { attribute: '机敏', minValue: 17 }, // 强力正面
  },
  // 洞察 (insight) - 范围 [0, 20]
  {
    name: '五感俱衰',
    description: '视觉、听觉、嗅觉、味觉、触觉全面衰退。',
    attributeThreshold: { attribute: '洞察', minValue: 0, maxValue: 1 }, // 严重负面
  },
  {
    name: '视而不见',
    description: '观察力差，常常忽略眼前的细节。',
    attributeThreshold: { attribute: '洞察', minValue: 2, maxValue: 5 }, // 中等负面
  },
  {
    name: '明察秋毫',
    description: '目光敏锐，能看清秋天鸟兽新换的细毛。',
    attributeThreshold: { attribute: '洞察', minValue: 13, maxValue: 16 }, // 中等正面
  },
  {
    name: '洞若观火',
    description: '对事物的观察和理解如同看火一样透彻。',
    attributeThreshold: { attribute: '洞察', minValue: 17 }, // 强力正面
  },
  // 悟性 (savvy) - 范围 [0, 20]
  {
    name: '浑浑噩噩',
    description: '头脑昏沉，对任何事物都无法理解。',
    attributeThreshold: { attribute: '悟性', minValue: 0, maxValue: 1 }, // 严重负面
  },
  {
    name: '榆木脑袋',
    description: '思路僵化，难以开窍，学习新事物很慢。',
    attributeThreshold: { attribute: '悟性', minValue: 2, maxValue: 5 }, // 中等负面
  },
  {
    name: '过目不忘',
    description: '记忆力超群，看过一遍就不会忘记。',
    attributeThreshold: { attribute: '悟性', minValue: 13, maxValue: 16 }, // 中等正面
  },
  {
    name: '玲珑七窍',
    description: '心思机敏，聪慧异常，通晓事理。',
    attributeThreshold: { attribute: '悟性', minValue: 17 }, // 强力正面
  },
  // 风姿 (charisma) - 范围 [0, 20]
  {
    name: '面目可憎',
    description: '相貌丑陋，令人心生厌恶。',
    attributeThreshold: { attribute: '风姿', minValue: 0, maxValue: 1 }, // 严重负面
  },
  {
    name: '獐头鼠目',
    description: '长相猥琐，给人留下不佳的印象。',
    attributeThreshold: { attribute: '风姿', minValue: 2, maxValue: 5 }, // 中等负面
  },
  {
    name: '玉树临风',
    description: '形容人像玉树一样潇洒，风度翩翩。',
    attributeThreshold: { attribute: '风姿', minValue: 13, maxValue: 16 }, // 中等正面
  },
  {
    name: '绝代风华',
    description: '风采才貌冠绝当世，无人能及。',
    attributeThreshold: { attribute: '风姿', minValue: 17 }, // 强力正面
  },
  // 福缘 (luck) - 范围 [-6, 14]，基础值 0
  // 严重负面：-6 ~ -5，中等负面：-4 ~ -1，中等正面：7 ~ 10，强力正面：11+
  {
    name: '天煞孤星',
    description: '命中注定会给周围的人带来灾祸，孤苦一生。',
    attributeThreshold: { attribute: '福缘', minValue: -6, maxValue: -5 }, // 严重负面
  },
  {
    name: '霉运缠身',
    description: '运气非常差，时常遇到倒霉的事情。',
    attributeThreshold: { attribute: '福缘', minValue: -4, maxValue: -1 }, // 中等负面
  },
  {
    name: '吉星高照',
    description: '吉祥之星高高照耀，运气很好。',
    attributeThreshold: { attribute: '福缘', minValue: 7, maxValue: 10 }, // 中等正面
  },
  {
    name: '天命所归',
    description: '上天所预先决定的，众望所归，是命运的宠儿。',
    attributeThreshold: { attribute: '福缘', minValue: 11 }, // 强力正面
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
