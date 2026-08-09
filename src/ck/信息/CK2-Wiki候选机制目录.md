# CK2 Wiki 候选机制目录：面向 HTML 领主 RPG 与 SillyTavern 角色卡

> 用途：这不是开发清单，而是供用户逐项审批的机制候选池。结论基于 CK2 最终版本（约 3.3）本体、主要 DLC、CK2 Wiki/中文百科及 Paradox 官方 DLC 页面；数值细节不主张照搬，重点提取能服务“真实欧洲小地图 + 人物政治 + AI 对话”的结构。
>
> 已确认的产品边界：首个剧本采用真实欧洲；地图以伯爵领为基本多边形；首条竖切为 12—20 个伯爵领，玩家出巡参加宴会并争取两名封臣支持。

## 一、审批标记和复杂度

建议在每项后把“初步建议”改成你的结论：`批准`、`否决`、`后置`、`需讨论`。

| 标记 | 含义 |
| --- | --- |
| 保留 | 原机制非常契合领主 RPG，只需做规模收缩 |
| 简化 | 保留决策关系，删掉繁琐数值、重复按钮或全地图模拟 |
| 后置 | 有价值，但不应进入第一条竖切 |
| 舍弃 | 不适合当前产品，或投入与收益明显不成比例 |
| S | 小型：单一状态/少量界面，通常可独立落地 |
| M | 中型：涉及多个角色、事件和状态联动 |
| L | 大型：跨地图、AI、长期状态或多个子系统 |
| XL | 超大型：接近独立资料片或新政体，首版不应尝试 |

## 二、总判断：CK2 最值得移植的不是“全部规则”，而是五个故事发动机

1. **事件—选择—状态差分**：世界不是靠文本随机发挥，而是由条件化事件、事件链、决议和 on-action 持续响应人物行为。
2. **死亡—继承—关系重排**：玩家经营的是王朝；一个角色死亡会同时改变头衔、封臣、婚姻价值、宣称和派系。
3. **分封—依赖—反抗**：扩张后必须把土地交给有自身欲望的人；封臣不是资源条，而是需要谈判的政治主体。
4. **私人关系改变公共政治**：婚姻、朋友、仇敌、情人、人情、教育、社团和秘密合作都会改变国家决策。
5. **角色主动选择生活方向**：野心、生活重心、社团任务和重大决议控制接下来会遇到什么故事，而非被动等随机弹窗。

其中事件系统是其他四项的共同底座，应列为 P0。

---

## 三、事件、事件链、决议、野心与随机故事（P0 核心）

CK2 中文百科把事件概括为“满足某些条件时发生的有趣事情”，其原版事件范围实际覆盖成人/儿童特质、监护、封建生活、健康、战役、阴谋、十字军、内阁任务、婚姻、家庭、宗教、狩猎和叙事事件等。换言之，事件不是一个内容包，而是 CK2 的叙事操作系统。[事件](https://ck2.parawikis.com/wiki/%E4%BA%8B%E4%BB%B6)、[决议](https://ck2.parawikis.com/wiki/%E5%86%B3%E8%AE%AE)

| ID | CK2 原机制 | 对 HTML + 酒馆的价值 | 初步建议 | 复杂度 | 主要来源 |
| --- | --- | --- | --- | --- | --- |
| EVT-01 | 条件化事件：事件检查人物、关系、头衔、地点、战争、宗教等条件，再向目标角色显示若干选项 | 让 AI 对话有“为什么现在发生”的硬依据；避免模型凭空造危机 | **保留 / P0** | M | [事件](https://ck2.parawikis.com/wiki/%E4%BA%8B%E4%BB%B6) |
| EVT-02 | 事件选项：每个选项可有前置、即时效果、概率结果、角色特质倾向与 AI 权重 | 玩家可以自由说话，但最终要落到可验证的提案/选项；NPC 选择也能被性格解释 | **保留 / P0** | M | [特质](https://ck2.parawikis.com/wiki/%E7%89%B9%E8%B4%A8)、[事件模组制作](https://ck2.parawikis.com/wiki/Event_modding) |
| EVT-03 | MTTH/脉冲式随机事件：满足条件后按权重或平均发生时间抽取，而非每天必然触发 | 提供非脚本化日常生活；同一剧本可重复游玩 | **简化 / P0**：按周或行动后抽取，不做全人物每日扫描 | M | [事件模组制作](https://ck2.parawikis.com/wiki/Event_modding) |
| EVT-04 | on-action 事件：出生、成年、结婚、死亡、继承、开战、战斗、改宗等动作发生时触发响应 | 是状态连续性的核心；尤其适合“抵达宴会”“信件送达”“头衔易主”“角色死亡” | **保留 / P0** | M | [On Actions](https://ck2.parawikis.com/wiki/On_actions)、[模组制作](https://ck2.parawikis.com/wiki/%E6%A8%A1%E7%BB%84%E5%88%B6%E4%BD%9C) |
| EVT-05 | 事件链：前一事件保存参与者/旗标/变量，若干天月后进入下一阶段，可中断、失败或分叉 | 最适合酒馆长对话：宴会冲突、恋情、谋杀、教育、治病都应是多阶段关系故事 | **保留 / P0** | L | [事件](https://ck2.parawikis.com/wiki/%E4%BA%8B%E4%BB%B6)、[Way of Life](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life) |
| EVT-06 | 多角色定向事件：事件在主角、目标、配偶、领主、封臣、内阁成员、阴谋同谋之间来回传递 | AI 对话不能只有玩家单视角；对方应收到提案并基于自己的利益反提条件 | **保留 / P0** | L | [外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8)、[作用域](https://ck2.parawikis.com/wiki/%E4%BD%9C%E7%94%A8%E5%9F%9F) |
| EVT-07 | 决议：玩家主动满足条件并支付成本，启动宴会、夏季集市、狩猎、朝圣等事件链 | 把“等随机故事”变为“主动制造会面机会”；正好承载竖切宴会 | **保留 / P0** | M | [决议](https://ck2.parawikis.com/wiki/%E5%86%B3%E8%AE%AE) |
| EVT-08 | 目标式决议/外交行动：对某个人发起婚约、赠礼、授地、赎金、邀请入廷、阴谋邀请等 | 对话最终转成结构化请求；能显示接受/拒绝理由 | **保留 / P0** | L | [外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8) |
| EVT-09 | 野心（Ambition）：人物选择一项中期目标，达成后奖励并结束；Conclave 后野心更偏改变流程，如成为内阁成员、战争金库、索取头衔、为子女获地 | 为每个 NPC 提供可被对话利用的当前诉求；“争取支持”因此变成交换条件而非刷好感 | **保留 / P0**：每人最多 1 个公开野心 + 1 个隐秘欲望 | M | [野心](https://ck2.parawikis.com/wiki/%E9%87%8E%E5%BF%83)、[御前会议](https://ck2.parawikis.com/wiki/%E5%BE%A1%E5%89%8D%E4%BC%9A%E8%AE%AE) |
| EVT-10 | 生活重心（Focus）：选择统治、经商、狩猎、战争、家庭、宴饮、勾引、密谋、学术、神学之一，立即加能力并改变事件与可用交互 | 是“玩家想看哪类故事”的内容路由器；也可作为角色卡提示词的短期人格重心 | **保留 / P1** | L | [官方 Way of Life](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life) |
| EVT-11 | 稀有叙事事件链：永生探索、神秘预言、日食恐慌、猫、传奇血脉等低频长链 | 构成长存档的“我这局遇到过”故事；不能挤占基础政治事件 | **后置 / P2**，并设历史/超自然开关 | L | [死神索命](https://ck2.parawikis.com/wiki/The_Reaper%27s_Due)、[血脉](https://ck2.parawikis.com/wiki/%E8%A1%80%E8%84%89) |
| EVT-12 | 性格驱动的随机故事：特质既改数值，也影响 AI 的理性、荣誉、野心、贪婪、狂热和事件选项权重 | 让不同 NPC 面对同一提案说不同的话、做不同的事 | **保留 / P0** | M | [特质](https://ck2.parawikis.com/wiki/%E7%89%B9%E8%B4%A8) |
| EVT-13 | 冷却、一次性旗标和互斥状态：限制事件重复，记录角色是否经历过某链 | 防止 LLM/事件池反复生成同一忏悔、初吻、受伤或传奇经历 | **保留 / P0** | S | [事件模组制作](https://ck2.parawikis.com/wiki/Event_modding) |
| EVT-14 | 消息重要度：CK2 会区分需要玩家选择的事件、通知和背景消息 | 小地图有几十名角色时控制信息噪音；只把涉及玩家/亲友/封臣的事推到前台 | **保留 / P0** | S | [事件](https://ck2.parawikis.com/wiki/%E4%BA%8B%E4%BB%B6) |
| EVT-15 | 编年史、称号、击杀名单等把事件结果沉淀为人物历史 | 角色卡需要长期记忆；让 AI 能引用“你在去年的宴会上羞辱过我” | **简化 / P1**：用结构化事件日志代替大段自动散文 | M | [称号](https://ck2.parawikis.com/wiki/%E7%A7%B0%E5%8F%B7)、[Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |

### 建议的事件数据最小骨架

```ts
type EventDefinition = {
  id: string;
  category: 'court' | 'travel' | 'activity' | 'relationship' | 'war' |
    'succession' | 'intrigue' | 'religion' | 'disease' | 'society';
  trigger: RuleExpr;
  source: 'pulse' | 'onAction' | 'decision' | 'dialogueIntent';
  participantSelectors: Record<string, Selector>;
  locationRule?: RuleExpr;
  cooldown?: Duration;
  stages: EventStage[];
};

type EventStage = {
  textPromptKey: string;        // 给 LLM 的叙事边界，不是世界真相
  options: Array<{
    id: string;
    visibleIf?: RuleExpr;
    allowedIf?: RuleExpr;
    effects: StateDiff[];       // 唯一可提交的硬状态变化
    npcWeight?: RuleExpr;
    nextStageId?: string;
  }>;
};

type EventInstance = {
  id: string;
  definitionId: string;
  participants: Record<string, string>;
  locationId: string | null;
  stageId: string;
  variables: Record<string, string | number | boolean>;
  status: 'active' | 'resolved' | 'failed' | 'expired';
  startedAt: string;
};
```

酒馆对话的职责是：生成符合人物口吻的陈述、追问、威胁和反提案。规则引擎的职责是：选择事件、验证选项、掷概率、提交 `StateDiff`、写事件日志。不能让模型直接宣布“对方已支持你”或“某人死亡”。

### 事件内容池应覆盖的九种尺度

| 内容池 | CK2 对应内容 | 首版例子 | 建议 |
| --- | --- | --- | --- |
| 日常宫廷 | 封建生活、婚姻生活、家庭事件 | 配偶抱怨被冷落；总管请求追加预算 | P0，低影响、高复用 |
| 关系 | 朋友、仇敌、情人、亲属死亡反应 | 两名封臣在宴会上争座位；玩家选边 | P0 |
| 活动 | 宴会、狩猎、集市、朝圣事件链 | 宴会邀请、路上偶遇、席间提案、离席余波 | P0 |
| 职位 | 内阁任务与滥权事件 | 间谍总管发现流言，也可能隐瞒与自己有关的阴谋 | P1 |
| 政治 | 派系、法律、授地、继承 | 支持法案的条件是给无地次子一块伯爵领 | P0 |
| 阴谋 | plot 进度、同谋、刺杀尝试 | 厨师被收买、酒杯被调换、阴谋走漏 | P1 |
| 身体 | 疾病、治疗、怀孕、受伤、死亡 | 宴会后发热；医师提出保守或激进疗法 | P1 |
| 世界 | 战争、瘟疫、十字军、宗教变化 | 边境伯爵来信称敌军集结 | P1/P2 |
| 传奇 | 血脉、圣人、永生、预言 | 多代积累后塑造家族传说 | P2，可关闭超自然 |

---

## 四、人物、关系、王朝与继承

| ID | CK2 原机制 | 酒馆化价值 | 初步建议 | 复杂度 | 来源 |
| --- | --- | --- | --- | --- | --- |
| CHR-01 | 外交、军事、管理、密谋、学识五项属性；统治者、配偶和内阁共同形成国家能力 | 清楚界定人物擅长什么；对话说服只是外交/密谋的一种表现，不可万能 | **保留 / P0**，压缩到 0—20 | S | [属性](https://ck2.parawikis.com/wiki/%E5%B1%9E%E6%80%A7) |
| CHR-02 | 性格、教育、先天、健康、生活方式、指挥官等特质 | 角色卡最重要的结构化人格与身体资料 | **保留 / P0**，每人只显示关键 5—9 项 | M | [特质](https://ck2.parawikis.com/wiki/%E7%89%B9%E8%B4%A8) |
| CHR-03 | 非对称好感及带来源/期限的修正 | “他喜欢你”应可追溯到授地、亲族、暴政、事件羞辱等原因 | **保留 / P0** | M | [好感](https://ck2.parawikis.com/wiki/%E5%A5%BD%E6%84%9F) |
| CHR-04 | 朋友、仇敌、情人、配偶、亲子、领主/封臣、监护、囚禁等结构关系 | 给 AI 清楚的称谓、边界、记忆与立场；比单一好感值更能驱动对白 | **保留 / P0** | M | [婚姻](https://ck2.parawikis.com/wiki/%E5%A9%9A%E5%A7%BB)、[外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8) |
| CHR-05 | 人物年龄、健康、生育、怀孕、疾病、受伤和死亡 | 让继承、摄政、婚姻与战争都有真实风险 | **简化 / P0**：不显示精确健康值 | L | [疾病](https://ck2.parawikis.com/wiki/%E7%96%BE%E7%97%85)、[婚姻](https://ck2.parawikis.com/wiki/%E5%A9%9A%E5%A7%BB) |
| DYN-01 | 家族/王朝身份与家族威望；角色死亡后继续扮演同王朝继承人 | CK 的根本长线；失败可以是王朝绝嗣而非一次战败 | **保留 / P0** | L | [家族](https://ck2.parawikis.com/wiki/%E5%AE%B6%E6%97%8F)、[官方 CK2](https://www.paradoxinteractive.com/games/crusader-kings-ii) |
| DYN-02 | 普通婚姻、入赘婚姻、订婚；子女归属、宫廷迁移、声望、同盟、宣称相互连接 | 每桩婚姻都是一场可用书信/会面谈判的政治交易 | **保留 / P0** | L | [婚姻](https://ck2.parawikis.com/wiki/%E5%A9%9A%E5%A7%BB) |
| DYN-03 | 婚外情、私生子、合法化、亲子疑云 | 极适合角色卡和秘密对话；能直接冲击继承 | **简化 / P1**，必须提供内容开关与叙事边界 | L | [婚姻：情人](https://ck2.parawikis.com/wiki/%E5%A9%9A%E5%A7%BB#%E6%83%85%E4%BA%BA) |
| DYN-04 | 头衔各自拥有继承法；长子、均分、年长者、选举等会产生不同继承人和领土分割 | 一个死亡事件即可重画地图、制造兄弟冲突和新派系 | **简化 / P0**：首版仅长子、均分、选举三类 | L | [继承](https://ck2.parawikis.com/wiki/%E7%BB%A7%E6%89%BF)、[均分继承法](https://ck2.parawikis.com/wiki/%E5%9D%87%E5%88%86%E7%BB%A7%E6%89%BF%E6%B3%95) |
| DYN-05 | 宣称可由出生、继承、婚姻、伪造、失去头衔等产生，并有强弱与可继承差异 | 让人物说“这块地本应属于我”成为可验证事实 | **简化 / P0**：有效/潜在两级即可 | M | [宣称](https://ck2.parawikis.com/wiki/%E5%AE%A3%E7%A7%B0) |
| DYN-06 | Conclave 儿童教育：童年重心、儿童特质、青春期教育方向、监护人和相关事件共同塑造成长 | 监护关系天然等于人质、文化影响和多年情感关系 | **简化 / P1** | L | [教育](https://ck2.parawikis.com/wiki/%E6%95%99%E8%82%B2)、[官方 Conclave](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave) |
| DYN-07 | 血脉记录创始人的伟业并按规则传给后代，能由壮举、社团传奇、特殊事件等创立 | 把事件日志变成多代身份；AI 能以祖先功业要求尊重或婚配 | **简化 / P2**：重叙事身份，弱化数值叠加 | L | [血脉](https://ck2.parawikis.com/wiki/%E8%A1%80%E8%84%89)、[官方 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| DYN-08 | 称号/绰号由条件、事件、战争与野心产生 | 低成本地把重大经历永久写到人物姓名和传闻里 | **保留 / P1** | S | [称号](https://ck2.parawikis.com/wiki/%E7%A7%B0%E5%8F%B7) |
| DYN-09 | 宝物可装备、继承、赠送、被夺取，部分有宗教/身份生效条件 | 适合对话交易、宴会展示、家族纪念物和战争战利品 | **简化 / P1**：只保留具名物品及来历 | M | [宝物](https://ck2.parawikis.com/wiki/%E5%AE%9D%E7%89%A9)、[官方 Monks and Mystics](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-monks-and-mystics) |
| DYN-10 | 宫廷由配偶、亲属、内阁、宾客、宣称者、囚犯等组成，角色可邀请、驱逐或随婚姻迁移 | 地点可见人物不应随机生成；宫廷是首都中的常驻社交池 | **保留 / P0** | M | [廷臣](https://ck2.parawikis.com/wiki/%E5%BB%B7%E8%87%A3) |

### Way of Life 十种重心的逐项价值

官方页面确认十种重心都会改变属性、事件和部分外交交互，并新增数百事件。[Way of Life 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life)

| 重心 | 原版主题 | 酒馆化事件/交互 | 建议 |
| --- | --- | --- | --- |
| 统治 | 管理领地、处理行政压力、培养管理者 | 巡视庄园、裁判纠纷、官员腐败、工作过劳 | **保留 / P1** |
| 经商 | 投资、贸易尝试、获利或亏损、建筑家 | 与商人谈判、借贷、资助作坊、失败项目追责 | **保留 / P1** |
| 狩猎 | 狩猎活动、健康、勇气与事故 | 直接接入出巡路线和同地会面；可建立友谊或遭遇危险 | **保留 / P1** |
| 战争 | 训练、决斗、指挥与军事成长 | 与骑士操练、评议战术、挑战决斗 | **保留 / P1** |
| 家庭 | 改善亲属关系、生育、教养 | 配偶/子女专属会谈、家庭调解、继承人塑造 | **保留 / P1** |
| 宴饮 | 私人宴饮、结交朋友、社交者 | 与首条“参加宴会争取支持”完全重合 | **保留 / P0 内容** |
| 勾引 | 定向追求、恋人、丑闻 | 自由对话价值高，但需要用户内容偏好和边界设置 | **后置 / P1** |
| 密谋 | 监视、绑架/释放、流言、阴谋成长 | 审讯、试探、密信、把柄与反情报 | **保留 / P1** |
| 学术 | 研究、实验、天文/自然哲学 | 与学者通信、藏书、实验伦理、知识换政治声望 | **保留 / P2** |
| 神学 | 祈祷、宗教思考、朝圣、品格变化 | 连接朝圣、告解、神职人员对话与合法性 | **保留 / P1** |

不建议照搬“选中后固定加几点属性”的纯数值部分；重心应主要控制主动决议、事件池、可谈话对象和角色的当前目标。

---

## 五、封臣、内阁、法律与摄政

| ID | CK2 原机制 | 酒馆化价值 | 初步建议 | 复杂度 | 来源 |
| --- | --- | --- | --- | --- | --- |
| GOV-01 | 直辖领上限迫使领主把扩张所得分封给他人 | 防止玩家吞下所有伯爵领；每次扩张都会创造新的政治关系 | **保留 / P0** | M | [属性](https://ck2.parawikis.com/wiki/%E5%B1%9E%E6%80%A7)、[领地](https://ck2.parawikis.com/wiki/%E9%A2%86%E5%9C%B0) |
| GOV-02 | 多级封臣链：伯爵可臣属于公爵，公爵臣属于国王；税与兵沿直接关系计算 | 地图颜色与人物关系统一；下级封臣通常不直接向顶层君主负责 | **保留 / P0** | L | [封臣](https://ck2.parawikis.com/wiki/%E5%B0%81%E8%87%A3) |
| GOV-03 | 授予/剥夺头衔、转封封臣、授予荣誉头衔 | 土地和职位是对话中最有分量的筹码 | **保留 / P0**，必须有合法性与确认步骤 | L | [外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8) |
| GOV-04 | 封臣义务决定税收和征召兵；Conclave 将义务表现为税—兵之间的政策权衡 | “支持我就减税/少出兵”可成为正式谈判条件 | **简化 / P1**：每类封臣 3 档义务 | M | [法律](https://ck2.parawikis.com/wiki/%E6%B3%95%E5%BE%8B)、[御前会议](https://ck2.parawikis.com/wiki/%E5%BE%A1%E5%89%8D%E4%BC%9A%E8%AE%AE) |
| GOV-05 | 强力封臣要求内阁席位；不给职位会不满，给职位则获得参与国家决策的机会 | 制造“能力优秀的人”和“不能得罪的人”之间的任命矛盾 | **保留 / P0** | M | [官方 Conclave](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave) |
| GOV-06 | 五名主要内阁官员及各自地图任务；官员能力和忠诚都会改变成效，间谍总管甚至可能掩盖针对领主的阴谋 | 给 NPC 持续职责、出差地点和滥权机会；使人物有理由出现在某县 | **简化 / P1**：首版只做总管、军事统帅、间谍总管 | L | [内阁](https://ck2.parawikis.com/wiki/%E5%86%85%E9%98%81) |
| GOV-07 | Conclave 内阁对宣战、法律、剥夺、囚禁等事项投票；成员有忠臣、反对派及基于性格/利益的立场 | 最适合多人 AI 议政；“争取两名封臣支持”可直接落在票数上 | **保留 / P0**，首版仅一个议案类型 | L | [官方 Conclave](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave)、[内阁](https://ck2.parawikis.com/wiki/%E5%86%85%E9%98%81) |
| GOV-08 | 人情（Favor）可促成内阁投票、婚姻、入廷、教育或加入派系等；接受人情意味着未来可被调用 | 对话承诺的最好硬货币；应扩成“承诺账本”而非一次性好感 | **保留 / P0** | L | [人情](https://ck2.parawikis.com/wiki/%E4%BA%BA%E6%83%85)、[官方 Conclave](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave) |
| GOV-09 | 法律限制统治者和封臣可做的事，Conclave 以“内阁是否有权投票”拆分王权 | 法律是谈判的规则边界，不只是被动加成 | **简化 / P1**：继承、内阁权、封臣战争、义务四组 | L | [法律](https://ck2.parawikis.com/wiki/%E6%B3%95%E5%BE%8B)、[御前会议](https://ck2.parawikis.com/wiki/%E5%BE%A1%E5%89%8D%E4%BC%9A%E8%AE%AE) |
| GOV-10 | 派系以共同要求联合封臣，力量足够后发最后通牒，拒绝即组成临时叛军内战 | 把分散不满转成可读的集体政治；玩家可以逐个谈判瓦解 | **保留 / P1** | L | [派系](https://ck2.parawikis.com/wiki/%E6%B4%BE%E7%B3%BB) |
| GOV-11 | 派系目标包括拥立宣称者、改变继承、扩大内阁权、独立、推翻统治者等 | 每个派系有明确可执行诉求；比“反叛值”更适合对话 | **简化 / P1**：首版只做拥立、内阁权、独立 | M | [派系](https://ck2.parawikis.com/wiki/%E6%B4%BE%E7%B3%BB) |
| GOV-12 | 暴政：无合法理由逮捕、处决、剥夺等会引发普遍好感惩罚；叛徒/罪犯则可合法处罚 | 防止玩家靠聊天随意关人夺地；司法行为要显示合法理由 | **保留 / P0** | M | [暴政](https://ck2.parawikis.com/wiki/%E6%9A%B4%E6%94%BF)、[外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8) |
| GOV-13 | 囚犯可赎金、释放、处决、驱逐；Reaper's Due 增加羞辱、折磨、致残、招募入廷等 | 地牢对话和政治交换价值很高，但暴力内容应可配置 | **简化 / P1** | M | [死神索命](https://ck2.parawikis.com/wiki/The_Reaper%27s_Due) |
| GOV-14 | 未成年、无能、被囚、隐藏、朝圣等可触发摄政；重大行动需摄政/内阁许可，并有摄政滥权事件 | 出巡时让首都政治继续运转；摄政者可扣信、拖延或附加条件 | **保留 / P1**，吸收轻量离境摄政 | L | [摄政](https://ck2.parawikis.com/wiki/%E6%91%84%E6%94%BF) |
| GOV-15 | 荣誉头衔和宫廷职位提供声望、收入或小权力，也能安抚人物 | 是低于授地、高于口头称赞的谈判筹码 | **简化 / P1**：6—10 个有叙事职责的职位 | M | [荣誉头衔](https://ck2.parawikis.com/wiki/%E8%8D%A3%E8%AA%89%E5%A4%B4%E8%A1%94) |
| GOV-16 | 总督制把公国/王国作为终身职位，持有人死后归还君主 | 适合拜占庭等后续剧本，不适合首个封建小领地竖切 | **后置 / P3** | L | [帝国](https://ck2.parawikis.com/wiki/%E5%B8%9D%E5%9B%BD) |

---

## 六、阴谋、私人关系与人物交互

| ID | CK2 原机制 | 酒馆化价值 | 初步建议 | 复杂度 | 来源 |
| --- | --- | --- | --- | --- | --- |
| INT-01 | 阴谋有策划者、目标、同谋和阴谋力量；同谋接受度受双方好感、目标关系、利益冲突与荣誉性格影响 | 密信和同地私谈可用于招募；同一计划中的参与者各有可谈条件 | **保留 / P1** | L | [阴谋](https://ck2.parawikis.com/wiki/%E9%98%B4%E8%B0%8B)、[外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8) |
| INT-02 | 谋杀不是按一下立刻死亡；阴谋达到条件后通过多种刺杀事件尝试，可能失败、误伤或暴露 | 天然的悬疑事件链；让防范、泄密、替罪羊和调查成为故事 | **保留 / P1**，抽象手段，不追求 CK2 全列表 | L | [刺杀](https://ck2.parawikis.com/wiki/%E5%88%BA%E6%9D%80)、[事件](https://ck2.parawikis.com/wiki/%E4%BA%8B%E4%BB%B6) |
| INT-03 | 已知阴谋可被间谍总管发现；领主能要求终止，拒绝可能提供逮捕/剥夺理由 | 将情报变成可行动证据，并给嫌疑人一场对质对话 | **保留 / P1** | M | [内阁](https://ck2.parawikis.com/wiki/%E5%86%85%E9%98%81)、[外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8) |
| INT-04 | 密谋重心可监视人物、散播流言、发现把柄、提升密谋能力，也可能错怪无辜者 | 可转成调查面板 + 审讯自由对话；结论仍由规则与证据决定 | **简化 / P1** | L | [密谋生活重心](https://ck2.parawikis.com/wiki/%E5%AF%86%E8%B0%8B%E7%94%9F%E6%B4%BB%E9%87%8D%E5%BF%83) |
| INT-05 | Sway/Antagonize 持续针对一人，周期触发改善或恶化关系的事件 | 把“主动经营一段关系”从无限聊天中抽离出来，形成有冷却的长期行动 | **保留 / P1** | M | [官方 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| INT-06 | 宴饮重心能邀请小圈子宴饮并产生朋友关系；事件也可制造仇敌、情人 | 非常适合“同地才能深聊”的社交门槛 | **保留 / P0 内容** | M | [官方 Way of Life](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life) |
| INT-07 | 决斗及个人实战能力；战士公会与 Holy Fury 扩展决斗、战伤和传奇 | 可用于荣誉冲突与宴会争执，但不应成为主要战争模拟 | **简化 / P2** | M | [官方 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| INT-08 | 外交请求展示一组可解释的接受/拒绝因素 | 规则引擎先给理由，LLM 再以人物语气表达；是 AI 对话可靠性的核心 | **保留 / P0** | M | [外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8) |
| INT-09 | CK2 没有 CK3 那种统一、完整的秘密/牵制体系；丑闻更多由事件、特质、已知阴谋和合法处罚理由表现 | 项目可做“情报/把柄”，但不要误称为 CK2 原样移植 | **原创简化 / P1**：证据、知情者、公开状态三层 | L | [特质](https://ck2.parawikis.com/wiki/%E7%89%B9%E8%B4%A8)、[阴谋](https://ck2.parawikis.com/wiki/%E9%98%B4%E8%B0%8B) |
| INT-10 | 人情是一种可调用的关系债务，但 CK2 不完整记录口头许诺 | 角色卡自由谈判需要“承诺：给职、给地、投票、婚约、付款”的到期追责 | **原创扩展 / P0** | L | [人情](https://ck2.parawikis.com/wiki/%E4%BA%BA%E6%83%85) |

---

## 七、地图、战争与军事政治

| ID | CK2 原机制 | 酒馆化价值 | 初步建议 | 复杂度 | 来源 |
| --- | --- | --- | --- | --- | --- |
| WAR-01 | 伯爵领省份、头衔、法理结构、实际持有与战时占领彼此分离 | 地图永久颜色和占领纹理不会混淆；支持飞地与多级封臣 | **保留 / P0** | L | [头衔](https://ck2.parawikis.com/wiki/%E5%A4%B4%E8%A1%94)、[王国](https://ck2.parawikis.com/wiki/%E7%8E%8B%E5%9B%BD) |
| WAR-02 | 宣战必须有宣战理由（CB）；目标明确规定胜利后转移哪项头衔、财富或臣属关系 | 防止“打赢邻县就自动吞地”；战争目标可被议会和书信讨论 | **简化 / P0**：宣称、法理、独立、惩罚叛徒四类 | L | [宣战理由](https://ck2.parawikis.com/wiki/%E5%AE%A3%E6%88%98%E7%90%86%E7%94%B1) |
| WAR-03 | 战争分数综合战斗、占领、目标和俘虏；和平结算才改永久状态 | 玩家能看懂战争为什么结束；占领不直接等于吞并 | **简化 / P0** | M | [战争](https://ck2.parawikis.com/wiki/%E6%88%98%E4%BA%89) |
| WAR-04 | 征召兵来自直辖和封臣，好感、法律与义务影响供给；动员封臣太久会不满 | 战争会消耗政治信用；玩家须说服封臣而非只点征兵 | **简化 / P1**：兵力抽象为军势值 | L | [征召兵](https://ck2.parawikis.com/wiki/%E5%BE%81%E5%8F%AC%E5%85%B5)、[法律](https://ck2.parawikis.com/wiki/%E6%B3%95%E5%BE%8B) |
| WAR-05 | 指挥官、三翼、兵种比例、战术、士气、地形共同决定战斗 | 原版细节很深，但对角色卡收益不及成本；保留“谁指挥、在哪打、兵力/地形/士气”即可 | **大幅简化 / P2** | XL | [战斗](https://ck2.parawikis.com/wiki/%E6%88%98%E6%96%97)、[官方 Conclave](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave) |
| WAR-06 | 围城逐步占领省内地产；守军、工事与时间影响结果 | 让伯爵领占领有过程，也创造援军、投降、劫掠和人质事件 | **简化 / P1**：单个伯爵领一个围城进度 | M | [围城](https://ck2.parawikis.com/wiki/%E5%9B%B4%E5%9F%8E) |
| WAR-07 | 同盟与互不侵犯常由近亲婚姻建立；战争中可召集盟友 | 婚姻谈判立刻拥有军事后果 | **保留 / P1** | M | [婚姻](https://ck2.parawikis.com/wiki/%E5%A9%9A%E5%A7%BB)、[同盟](https://ck2.parawikis.com/wiki/%E5%90%8C%E7%9B%9F) |
| WAR-08 | 雇佣兵、骑士团、近卫军分别用金钱、宗教条件或常备资源获得 | 提供紧急战争筹码，但完整兵种/维护系统过重 | **后置 / P2** | L | [雇佣兵](https://ck2.parawikis.com/wiki/%E9%9B%87%E4%BD%A3%E5%85%B5)、[近卫军](https://ck2.parawikis.com/wiki/%E8%BF%91%E5%8D%AB%E5%86%9B) |
| WAR-09 | 劫掠、冒险者、农民/宗教叛乱等给地图施加非正规威胁 | 小地图可用作阶段性危机和旅行风险 | **简化 / P2** | L | [劫掠](https://ck2.parawikis.com/wiki/%E5%8A%AB%E6%8E%A0)、[冒险者](https://ck2.parawikis.com/wiki/%E5%86%92%E9%99%A9%E8%80%85) |
| WAR-10 | 十字军/大圣战把多国角色聚集到共同战争，Holy Fury 增加受益人和过程事件 | 是后期欧洲剧本的大型社交/战争舞台，不适合 12—20 县首版 | **后置 / P3** | XL | [十字军](https://ck2.parawikis.com/wiki/%E5%8D%81%E5%AD%97%E5%86%9B%E3%80%81%E5%90%89%E5%93%88%E5%BE%B7%E5%92%8C%E5%A4%A7%E5%9C%A3%E6%88%98)、[Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| WAR-11 | 补给、损耗、地形和距离约束军队行动 | 出巡与军事都需要共用路线图；首版只做路线耗时和危险即可 | **简化 / P0 路径底层，P2 军事损耗** | L | [损耗](https://ck2.parawikis.com/wiki/%E6%8D%9F%E8%80%97) |

---

## 八、经济、地产、疾病与世界模拟

| ID | CK2 原机制 | 酒馆化价值 | 初步建议 | 复杂度 | 来源 |
| --- | --- | --- | --- | --- | --- |
| ECO-01 | 伯爵领内有城堡、城市、神殿等男爵级地产；地产类型提供不同税与兵 | 用户已接受“伯爵领是地图块”，男爵领可作为县内地点、访问对象和经济来源 | **简化 / P0**：每县 2—4 个地点卡，不画小多边形 | M | [地产](https://ck2.parawikis.com/wiki/%E5%9C%B0%E4%BA%A7) |
| ECO-02 | 税收、直辖收入、封臣税、军队维护、建筑、礼物和活动共同组成金钱循环 | 让宴会、出巡、贿赂、战争和医院争夺同一预算 | **保留 / P0**，使用少量整数 | M | [经济](https://ck2.parawikis.com/wiki/%E7%BB%8F%E6%B5%8E) |
| ECO-03 | 地产建筑逐级提高税、兵、工事等 | 完整建筑树是数值工程，对自由对话贡献有限 | **大幅简化 / P2**：每地点 1 个特色设施 + 2 个升级槽 | L | [建筑](https://ck2.parawikis.com/wiki/%E5%BB%BA%E7%AD%91) |
| ECO-04 | 省份文化、宗教影响好感、叛乱、转化、征服与身份 | 真实欧洲不可缺；当地人与领主不必同文化/信仰 | **保留 / P1**，转化按事件而非进度条刷满 | L | [文化](https://ck2.parawikis.com/wiki/%E6%96%87%E5%8C%96)、[宗教](https://ck2.parawikis.com/wiki/%E5%AE%97%E6%95%99) |
| ECO-05 | 科技分军事/经济/文化并在省份传播，内阁可研究/窃取 | 完整科技矩阵不适合小范围角色卡；可改为领地传统与少量革新 | **后置或舍弃** | XL | [科技](https://ck2.parawikis.com/wiki/%E7%A7%91%E6%8A%80) |
| ECO-06 | Reaper's Due 疫病在地图上传播，感染角色；地图模式可观察疫情 | 地点与旅行因此真正重要；同地交互有感染代价 | **简化 / P1**：2—3 种区域疫情 | L | [官方 Reaper's Due](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-the-reapers-due) |
| ECO-07 | 宫廷医师通过诊断与治疗事件处理疾病，能力和治疗选择会带来好坏结果 | 典型的角色化专业职位和高风险对话 | **保留 / P1** | M | [疾病](https://ck2.parawikis.com/wiki/%E7%96%BE%E7%97%85)、[官方 Reaper's Due](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-the-reapers-due) |
| ECO-08 | 医院提高疫病防御；领主可关闭城门隔离宫廷，但与外界隔绝并触发饥饿/宫廷压力事件 | 让“是否接见来客”成为生死决策，也天然限制对话对象 | **简化 / P1** | L | [官方 Reaper's Due](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-the-reapers-due) |
| ECO-09 | 繁荣/人口衰减受和平、管理、围城、劫掠和疾病影响，反过来改变税与兵 | 地图块获得可读的中期记忆：这里为何富庶或荒凉 | **简化 / P1**：荒废/普通/繁荣三级 | M | [死神索命](https://ck2.parawikis.com/wiki/The_Reaper%27s_Due) |
| ECO-10 | 商业共和国有五大家族、家族府邸、贸易站和选举竞争 | 是一整套不同主循环，不应塞进封建竖切 | **后置 / P3** | XL | [商业共和国](https://ck2.parawikis.com/wiki/%E5%95%86%E4%B8%9A%E5%85%B1%E5%92%8C%E5%9B%BD) |
| ECO-11 | 奇观/伟大工程提供长期建设、升级和事件 | 可成为王朝长期项目，但对首版人物政治帮助有限 | **后置 / P3** | L | [奇观](https://ck2.parawikis.com/wiki/%E5%A5%87%E8%A7%82) |

---

## 九、宗教、合法性与神职政治

| ID | CK2 原机制 | 酒馆化价值 | 初步建议 | 复杂度 | 来源 |
| --- | --- | --- | --- | --- | --- |
| REL-01 | 人物与省份信仰、宗教权威、虔诚、宗教领袖与异端关系共同影响政治 | 真实欧洲的婚姻、战争、加冕、神职任命和民众关系都依赖信仰 | **简化 / P1** | L | [宗教](https://ck2.parawikis.com/wiki/%E5%AE%97%E6%95%99) |
| REL-02 | 教宗可绝罚、离婚、授予宣称、索取金钱等；天主教君主与教宗关系及主教忠诚很重要 | 书信外交价值极高；形成地图外但人格化的权威 | **简化 / P2** | L | [教宗](https://ck2.parawikis.com/wiki/%E6%95%99%E5%AE%97)、[Sons of Abraham](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-sons-of-abraham) |
| REL-03 | 神职叙任权、对立教宗和主教税兵在世俗领主与教会之间制造利益冲突 | 适合较大王国剧本，首个小地图可以只保留主教支持 | **后置 / P2** | L | [王权法/叙任权](https://ck2.parawikis.com/wiki/Investiture) |
| REL-04 | 朝圣是决议触发的旅行事件链，会暂设摄政并在路上发生遭遇 | 与用户的出巡机制高度一致，可复用旅行底层和同地对话 | **保留 / P1** | L | [决议](https://ck2.parawikis.com/wiki/%E5%86%B3%E8%AE%AE) |
| REL-05 | Holy Fury 加冕要求国王/皇帝寻求神职人员主持，对方可能提出条件 | 一场天然的合法性谈判：捐款、改法、授地或停止战争 | **保留 / P2** | M | [官方 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| REL-06 | 圣人/封圣在虔诚信徒死后发生，其荣誉可传给后代并使墓地有价值 | 把生前行为转成死后政治资本与朝圣地点 | **后置 / P3** | L | [官方 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| REL-07 | 原始宗教改革可选择教义、领导结构等，建立新的有组织宗教 | 创造性强，但真实欧洲首个封建竖切不需要 | **后置 / P3** | XL | [原始宗教](https://ck2.parawikis.com/wiki/%E5%8E%9F%E5%A7%8B%E5%AE%97%E6%95%99)、[官方 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| REL-08 | 秘密宗教可公开信另一教、暗中招募、秘密教育孩子，最终公开信仰 | 是双重身份、密信和社团对话的绝佳来源 | **保留 / P2** | L | [秘密宗教](https://ck2.parawikis.com/wiki/%E7%A7%98%E5%AF%86%E5%AE%97%E6%95%99)、[社团](https://ck2.parawikis.com/wiki/%E7%A4%BE%E5%9B%A2) |

---

## 十、Monks and Mystics 社团与横向组织

官方将社团定位为宗教团体和秘密兄弟会，通过晋升获得能力、事件与角色扮演机会，并加入圣遗物/特殊物品与更多内阁任务。[Monks and Mystics 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-monks-and-mystics)

| ID | CK2 原机制 | 酒馆化价值 | 初步建议 | 复杂度 | 来源 |
| --- | --- | --- | --- | --- | --- |
| SOC-01 | 每个角色同一时间通常加入一个社团；社团有准入条件、公开/秘密身份和成员名单 | 在封臣链之外再建一张跨国关系网 | **保留 / P1** | L | [社团](https://ck2.parawikis.com/wiki/%E7%A4%BE%E5%9B%A2) |
| SOC-02 | 社团一般有四级阶层、奉献/社团货币、晋升和逐级能力 | 给无战争时期提供清晰长期成长 | **简化 / P1**：三级即可，能力以交互权限为主 | L | [社团](https://ck2.parawikis.com/wiki/%E7%A4%BE%E5%9B%A2)、[官方手册](https://cdn.cloudflare.steamstatic.com/steam/apps/530780/manuals/2018_11_CK_II_Monks_Mystics_Manual_ENG.pdf) |
| SOC-03 | 社团任务要求布道、写作、决斗、招募、慈善、研究等，成功/失败影响奉献和地位 | 任务可明确地点、目标人物、期限和证据，天然适配事件链与对话 | **保留 / P1** | L | [社团](https://ck2.parawikis.com/wiki/%E7%A4%BE%E5%9B%A2) |
| SOC-04 | 修会强调慈善、祈祷、美德、移除恶习和宗教影响 | 适合历史欧洲且不依赖超自然；可做首批公开社团 | **保留 / P1** | M | [官方 Monks and Mystics](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-monks-and-mystics) |
| SOC-05 | 赫耳墨斯学会包含炼金、占星、实验室、论文、宝物和同侪网络 | 对学者角色卡很有味道，但需要大量专属事件 | **后置 / P2** | L | [赫耳墨斯学会](https://ck2.parawikis.com/wiki/%E8%B5%AB%E8%80%B3%E5%A2%A8%E6%96%AF%E5%AD%A6%E4%BC%9A) |
| SOC-06 | 阿萨辛派提供隐秘招募、刺杀与宗教任务 | 适合后续中东剧本，不适合首个西欧小竖切 | **后置 / P3** | L | [社团](https://ck2.parawikis.com/wiki/%E7%A4%BE%E5%9B%A2) |
| SOC-07 | 恶魔崇拜社团拥有绑架、腐化和超自然能力 | 易破坏历史基调和规则可信度 | **舍弃或默认关闭** | L | [官方 Monks and Mystics](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-monks-and-mystics) |
| SOC-08 | Holy Fury 战士公会通过任务、决斗、战友和传奇旅程晋升，可创立传奇血脉 | 非常适合军事人物关系和同会兄弟，但首个宴会竖切不急需 | **后置 / P2** | L | [官方 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| SOC-09 | 秘密社团成员面临身份暴露、双重忠诚和组织义务 | 是 AI 对话最有价值的社团部分：暗号、试探、告密、审讯 | **保留 / P1/P2** | L | [社团](https://ck2.parawikis.com/wiki/%E7%A4%BE%E5%9B%A2) |

---

## 十一、主要 DLC 候选总览（防止只研究了几个著名系统）

| DLC/系统 | 最值得提取的内容 | 对本项目建议 | 原因/来源 |
| --- | --- | --- | --- |
| 本体 | 王朝延续、封臣、婚姻、继承、宣称、阴谋、战争理由、人物事件 | **P0/P1 主体** | [CK2 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii) |
| Sword of Islam | 穆斯林可玩、颓废等宗教政体规则 | **后置** | 首个西欧竖切未必使用；将来真实欧洲/地中海剧本需要 |
| Legacy of Rome | 拜占庭风味、派系/总督、近卫军 | **后置** | 帝国尺度才有收益 |
| The Republic | 商业共和国五大家族、贸易站与选举 | **P3 独立剧本** | 几乎是一套新游戏循环 |
| The Old Gods | 867 开局、原始宗教、劫掠、冒险者、叛乱 | **P2/P3** | 适合维京剧本；可先只借劫掠危机 |
| Sons of Abraham | 教宗/宗教领袖交互、圣地宗教政治、修会/宗教事件 | **P2** | 对真实欧洲重要，但非首条宴会闭环 |
| Rajas of India | 印度宗教、种姓、次大陆政体 | **舍弃于首个产品范围** | 地理和内容成本过大 |
| Charlemagne | 更早开局、总督、自建王国/帝国、编年史 | **后置**；只借事件日志 | 769 世界与首版无关，编年史思路有用 |
| Way of Life | 十种重心、数百事件、决斗/勾引/修道院等交互 | **P0 宴饮内容，整体 P1** | [官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life) |
| Horse Lords | 游牧氏族、人口/牧群、丝路、朝贡 | **P3 独立政体** | XL 级新循环 |
| Conclave | 强力封臣、内阁投票、人情、法律、儿童教育、婚姻同盟 | **P0/P1** | [官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave) |
| The Reaper's Due | 地图疫病、医师、医院、隔离、繁荣/荒废、伤残与叙事事件 | **P1/P2** | [官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-the-reapers-due) |
| Monks and Mystics | 社团、任务、晋级、宝物、更多内阁任务 | **P1/P2** | [官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-monks-and-mystics) |
| Jade Dragon | 地图外中华帝国、恩惠/惩罚、更多 CB、丝路互动 | **舍弃于首个欧洲范围** | 世界尺度和 UI 成本过高 |
| Holy Fury | Sway/Antagonize、战士公会、血脉、封圣、加冕、十字军重做、原始宗教改革 | **关系项 P1，其余 P2/P3** | [官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury) |
| Sunset Invasion | 阿兹特克架空入侵 | **舍弃/仅彩蛋开关** | 与真实欧洲历史基调冲突 |

---

## 十二、把候选项压到第一条竖切

### 竖切目标

玩家统治一个小型公国/伯爵领群，在 12—20 个伯爵领的真实欧洲局部地图上，为一个即将表决的议案或潜在派系危机争取两名封臣支持。玩家从首都出发，按路线前往宴会；宾客也需要实际抵达。席间通过自由对话、正式提案、礼物、人情或承诺交换支持，宴会结束后结果写入政治状态与人物记忆。

### 这条竖切真正需要的 CK2 机制

| 优先 | 必需机制 | 对应候选 ID | 最小范围 |
| --- | --- | --- | --- |
| P0 | 人物、特质、非对称好感、关系标签 | CHR-01—04 | 20—40 名活跃人物，每人 5—9 个关键特质 |
| P0 | 家族、头衔、封臣链、直辖与分封 | DYN-01、GOV-01—03 | 3 层头衔：伯爵领、公国、王国背景 |
| P0 | 地点、邻接、路线、实际抵达 | WAR-01、WAR-11、ECO-01 | 伯爵领多边形 + 县内城堡/城镇/修道院地点 |
| P0 | 事件定义、on-action、事件链、冷却和事件日志 | EVT-01—07、12—15 | 1 条宴会主链 + 8—12 个席间小事件 |
| P0 | 决议“举办/参加宴会” | EVT-07、INT-06 | 邀请—回信—出发—抵达—开席—离席六阶段 |
| P0 | 正式请求、接受理由与反提案 | EVT-08、INT-08 | “支持议案”一种正式请求即可 |
| P0 | 两名强力封臣与一次内阁表决 | GOV-05、GOV-07 | 3 名有票者，争取其中 2 人 |
| P0 | 人情和承诺账本 | GOV-08、INT-10 | 支持、给职、给钱、未来授地四种承诺 |
| P0 | 野心/诉求 | EVT-09 | 每位关键封臣 1 个公开目标 + 1 个隐藏底线 |
| P0 | AI 台词与规则引擎分权 | EVT-02、06 | LLM 只生成表达和 `intent`，规则提交结果 |

### 宴会事件链建议

1. **政治缘由出现**：某项议案将在 30 天后表决，玩家目前只有一票。
2. **主动决议**：玩家或东道主举办宴会；系统列出成本、地点、时间、可邀请范围。
3. **邀请与回信**：NPC 按关系、距离、战争、疾病、野心判断出席；可能要求旅费、护卫或带某位亲属。
4. **旅行**：玩家选路线和随从；途中发生 0—2 个轻事件，首都进入轻量离境摄政。
5. **宾客抵达**：只将实际到场者加入可深度对话池；迟到、遇险、临时缺席都写入事件状态。
6. **座次/迎宾事件**：公开礼遇某人会影响其他人的态度，形成第一个可见取舍。
7. **自由会谈**：玩家可与在场人物闲谈、试探诉求，LLM 不直接改变投票。
8. **正式提案**：玩家选择“请求支持”，对方基于野心和底线提出合法反条件。
9. **承诺提交**：玩家确认给钱、给职、欠人情或未来授地；规则引擎冻结/登记义务。
10. **席间插曲**：从关系、性格和当前矛盾筛选事件，如争座、醉酒失言、旧怨、私下密谈。
11. **离席结果**：每位宾客形成宴会评价、关系修正、秘密知情和承诺记录。
12. **议案表决**：系统按已提交支持、人物立场和有效承诺计算；AI 负责发言，不得临场改票。
13. **后果事件**：兑现承诺提高信任；拖欠则触发催讨、公开指责、加入派系或报复。

---

## 十三、建议直接舍弃或显著降级的 CK2 内容

| 内容 | 理由 | 处理 |
| --- | --- | --- |
| 全欧亚上万角色每日完整模拟 | 浏览器与角色卡上下文成本极高，且首个局部剧本看不到大多数结果 | 局部活跃模拟 + 远方摘要 |
| CK2 全兵种、三翼与战术触发表 | 复杂度巨大，对 AI 对话不是核心增益 | 军势值 + 指挥官 + 地形 + 士气 |
| 完整科技矩阵 | 需要大量数值平衡，人物戏剧收益低 | 少量领地革新或后置 |
| 每座地产完整建筑树 | 易沦为等待升级的菜单游戏 | 特色设施和少量槽位 |
| 所有宣战理由和政体 | 规则组合爆炸 | 按剧本启用少量 CB/政体模块 |
| 恶魔社团超能力、长生等强超自然内容 | 会削弱真实欧洲基调和硬状态可信度 | 默认关闭，未来作为世界规则 |
| 中国地图外帝国、印度、草原氏族、共和国同时首发 | 每项都接近独立资料片 | 分剧本、分阶段制作 |
| CK2 的重复性数值事件原样搬运 | 原作大量事件依赖频繁弹窗；酒馆里会造成文本疲劳 | 合并同类事件，强调人物差异与长期后果 |

---

## 十四、等待用户审批的关键选择

### A. 建议直接批准为 P0

- [ ] 条件化事件、事件链、on-action、决议、冷却、事件日志
- [ ] 人物属性/特质、非对称好感、结构关系
- [ ] 家族、头衔、封臣链、直辖上限、死亡与一次继承
- [ ] 宴会作为主动决议和临时同地社交场
- [ ] 强力封臣、一次三人内阁表决、争取两票
- [ ] 人情 + 可追责承诺账本
- [ ] 每个关键 NPC 的公开野心和隐藏底线
- [ ] LLM 生成台词/反提案，规则引擎提交硬状态

### B. 建议批准为 P1

- [ ] Way of Life 十重心（先做宴饮、家庭、密谋）
- [ ] 派系与最后通牒
- [ ] 轻量阴谋/谋杀事件链与反情报
- [ ] 婚姻、订婚、宣称传递与儿童教育
- [ ] 疾病、宫廷医师、隔离、繁荣/荒废
- [ ] 2 个社团（建议修会 + 一个秘密信仰组织）
- [ ] 摄政与出巡离境期间的首都政务

### C. 需要明确基调后再批

- [ ] 勾引、婚外情、私生子与亲子疑云的表现尺度
- [ ] 刑讯、处决、致残等暴力内容的表现尺度
- [ ] 恶魔崇拜、永生、巫术等超自然内容是否存在
- [ ] 首个真实欧洲剧本的年份和地区（这会决定人物、宗教、战争与法理）
- [ ] 玩家死亡后是否强制继续扮演同王朝继承人
- [ ] NPC 的隐藏野心是否允许被情报系统探知，还是只可从对话推断

### D. 建议后置

- [ ] 血脉、封圣、加冕、完整十字军
- [ ] 战士公会与赫耳墨斯学会
- [ ] 商业共和国、游牧、拜占庭总督制
- [ ] 奇观、完整建筑树、科技矩阵

---

## 十五、核心来源索引与版本提醒

### Wiki / 中文百科

- [CK2 中文百科：事件](https://ck2.parawikis.com/wiki/%E4%BA%8B%E4%BB%B6)
- [CK2 中文百科：决议](https://ck2.parawikis.com/wiki/%E5%86%B3%E8%AE%AE)
- [CK2 中文百科：外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8)
- [CK2 中文百科：婚姻](https://ck2.parawikis.com/wiki/%E5%A9%9A%E5%A7%BB)
- [CK2 中文百科：特质](https://ck2.parawikis.com/wiki/%E7%89%B9%E8%B4%A8)
- [CK2 中文百科：派系](https://ck2.parawikis.com/wiki/%E6%B4%BE%E7%B3%BB)
- [CK2 中文百科：内阁](https://ck2.parawikis.com/wiki/%E5%86%85%E9%98%81)
- [CK2 中文百科：社团](https://ck2.parawikis.com/wiki/%E7%A4%BE%E5%9B%A2)
- [CK2 中文百科：疾病](https://ck2.parawikis.com/wiki/%E7%96%BE%E7%97%85)
- [CK2 中文百科：血脉](https://ck2.parawikis.com/wiki/%E8%A1%80%E8%84%89)
- [CK2 中文百科：宗教](https://ck2.parawikis.com/wiki/%E5%AE%97%E6%95%99)
- [CK2 中文百科：死神索命](https://ck2.parawikis.com/wiki/The_Reaper%27s_Due)

### Paradox 官方页面/手册

- [Crusader Kings II 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii)
- [CK2 本体官方手册 PDF](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/203770/manuals/PDX7605US_CK%20II_Onlinemanual.pdf)
- [Way of Life 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life)
- [Conclave 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave)
- [The Reaper's Due 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-the-reapers-due)
- [Monks and Mystics 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-monks-and-mystics)
- [Monks and Mystics 官方手册 PDF](https://cdn.cloudflare.steamstatic.com/steam/apps/530780/manuals/2018_11_CK_II_Monks_Mystics_Manual_ENG.pdf)
- [Holy Fury 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury)
- [Holy Fury 官方手册 PDF](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/756660/manuals/2018_10_CK_II_Holy_Fury_Manual_EU.pdf)

版本提醒：中文百科个别条目停留在 2.6—3.0，但机制结论以 CK2 最终形态和官方 DLC 功能页交叉核对；开发时不应照抄过时页面中的具体数值。本文的“酒馆化价值”“优先级”和数据结构属于本项目设计建议，不是 CK2 原版事实。
