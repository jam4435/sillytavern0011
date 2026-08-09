# CK2 机制研究：面向酒馆领主 RPG 的提炼与移植建议

> 研究范围：`Crusader Kings II`（CK2）本体及其主要 DLC，重点参考 CK2 最终时期的系统形态。本文只讨论 CK2；凡是为酒馆玩法新增的设计，均明确标记为“移植建议”，不把它冒充成 CK2 原版机制。
>
> 最重要的版本边界：CK2 在 `Conclave / 御前会议` DLC 启用前后，内阁和摄政的处理方式有明显差异。下文会分别说明。

## 一、先纠正地图与头衔层级的几个概念

### 1. CK2 地图上能点到的最小省份是伯爵领，不是男爵领

CK2 的世界地图由 `province（省份）` 拼成，每个陆地省份对应一个 `county-tier（伯爵领级）` 头衔。省内再包含若干 `holding（地产）`：城堡、城市、神殿，部落地区还可有部落地产。地产属于男爵级，但它们只显示在省份面板中，并不是地图上的独立多边形。

因此：

- CK2 没有一套“子爵领 → 伯爵领”的标准地图层级。
- CK2 的标准头衔等级是：男爵级 `b_` → 伯爵级 `c_` → 公爵级 `d_` → 国王级 `k_` → 皇帝级 `e_`。
- 男爵、主教、市长在封建层级中都属于男爵级，分别统治城堡、神殿、城市。
- 正常封建玩法的最低可玩领主是伯爵；省内普通男爵不是标准可玩起点。
- “多个地图小块组成一个伯爵领”的地图结构更接近 CK3；若项目采用这种结构，应称为对 CK2/CK3 的混合，而不是复刻 CK2 地图。

依据：[CK2 官方本体手册](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/203770/manuals/PDX7605US_CK%20II_Onlinemanual.pdf) 的 Province Interface 与 Titles—Landed 章节；[CK2 中文百科：头衔模组制作](https://ck2.parawikis.com/wiki/%E5%A4%B4%E8%A1%94%E6%A8%A1%E7%BB%84%E5%88%B6%E4%BD%9C)。

### 2. 头衔、土地、人物、领地不是同一个对象

CK2 最值得保留的建模思想，是把以下概念分开：

| 概念 | 含义 | 为什么必须分开 |
| --- | --- | --- |
| 省份/伯爵领地图块 | 地图几何与当地人口、文化、宗教、税收、兵力 | 这是地图和经济的基本单位 |
| 头衔 | 对某级土地的法理权利，拥有持有人和继承法 | 高级头衔不是把所有下级土地“合并成一块” |
| 角色 | 会出生、结婚、继承、死亡的人 | 玩家控制的是角色与家族，不是抽象国家 |
| 领地/realm | 某位最高领主及其层层封臣控制的所有土地 | 地图颜色通常沿封臣链追溯到最高领主 |
| 直辖领/demesne | 角色亲自持有的地产与伯爵领 | 与“整个领地”不同，超过上限会低效并得罪封臣 |
| 法理/de jure | 某伯爵领依法属于哪个公国、王国、帝国 | 可以和现实控制完全不一致 |
| 事实/de facto | 当前实际持有人与封臣链 | 战争、继承、授予、叛乱会不断改变它 |
| 占领/occupation | 战争期间的临时军事控制 | 不应立刻改写永久头衔持有人 |

CK2 手册明确区分法理公国/王国地图与现实控制；高级头衔也可以在并未亲自持有其全部法理土地时存在。[CK2 官方本体手册](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/203770/manuals/PDX7605US_CK%20II_Onlinemanual.pdf)、[CK2 中文百科：王国](https://ck2.parawikis.com/wiki/%E7%8E%8B%E5%9B%BD)、[CK2 中文百科：帝国](https://ck2.parawikis.com/wiki/%E5%B8%9D%E5%9B%BD)。

### 3. 连接线只应负责邻接、移动和局部规则，不自动决定归属

CK2 并不是“相邻伯爵领被占领后自动并入同色势力”。它允许飞地，永久转移通常来自：

1. 合法或伪造的宣称、法理权利、圣战等宣战理由；
2. 战争目标确定争夺的头衔或臣服关系；
3. 军队战斗并围攻，占领只是战争分数来源之一；
4. 和平结算根据宣战理由转移头衔、附庸或财富；
5. 新的持有人和封臣链使地图颜色发生变化。

所以，伯爵领连接图适合承担：陆军寻路、是否接壤、外交距离、补给传播、疾病传播、活动/出巡路线、某些战争目标的合法性。它不应是唯一的领土归属算法。

### 4. 推荐的地图数据骨架（移植建议）

```ts
type County = {
  id: string;
  polygonId: string;
  neighbors: string[];
  holdings: Holding[];
  cultureId: string;
  religionId: string;
  controllerCharacterId: string | null; // 战时临时占领者
  countyTitleId: string;
};

type LandedTitle = {
  id: string;
  tier: 'barony' | 'county' | 'duchy' | 'kingdom' | 'empire';
  deJureParentId: string | null;
  holderCharacterId: string | null;
  successionLawId: string;
};

type CharacterPoliticalState = {
  liegeCharacterId: string | null;
  primaryTitleId: string | null;
  heldTitleIds: string[];
  capitalCountyId: string | null;
};
```

渲染永久势力色时，先从伯爵头衔持有人沿 `liegeCharacterId` 向上找到最高领主；战争占领则另加纹理、旗帜或描边，不覆盖永久所有权色。

## 二、CK2 的核心循环：土地只是棋盘，人物关系才是游戏

CK2 官方对游戏的概括本身就强调任命封臣、处理叛徒、制定法律、与大量贵族互动和经营王朝。[Paradox：Crusader Kings II](https://www.paradoxinteractive.com/games/crusader-kings-ii)。适合移植的循环可压缩为：

1. 角色通过继承、婚姻、宣称、授地和战争获得头衔。
2. 统治者只能高效直辖有限土地，扩张后必须分封。
3. 分封创造有自己家族、欲望、宣称和兵力的封臣。
4. 封臣依据法律和对领主的好感提供税与征召兵，也会加入派系、阴谋或叛乱。
5. 领主用婚姻、职位、荣誉头衔、金钱、人情、法律、威慑和惩罚维持统治。
6. 角色死亡后继承重排土地和关系；“短暂统治”、幼主、争位者会再次制造危机。

这比单纯的地图涂色更重要：扩张的主要代价不是多点几块地，而是创造更多需要谈判的政治主体。

## 三、人物关系与交互

### 1. 好感是有来源、会衰减、而且是非对称的

CK2 的 `Opinion（好感）` 是“角色 A 对角色 B”的值，不应默认对称。它受外交属性、性格特质、亲族/婚姻、宗教文化、法律、头衔欲望、暴政、近期事件等修正影响。高好感通常提高请求接受率；低好感会推动派系、阴谋和敌对行为。[CK2 中文百科：好感](https://ck2.parawikis.com/wiki/%E5%A5%BD%E6%84%9F)。

但 CK2 的关系并不只有一个数字，还存在：

- 亲属、配偶、情人；
- 朋友、仇敌；
- 领主、封臣、廷臣；
- 监护人、被监护人；
- 囚犯、囚禁者；
- 同盟、互不侵犯关系；
- 宣称者与头衔持有人；
- 内阁成员与政治立场；
- 欠下或持有的人情；
- 同社团成员、秘密宗教同道。

移植时应采用“一个总体好感 + 多条带来源和期限的修正 + 结构化关系标签”，不要只保存一个永久数值。

```ts
type DirectedRelationship = {
  fromId: string;
  toId: string;
  opinionBase: number;
  modifiers: Array<{
    key: string;
    value: number;
    expiresAt: string | null;
    sourceEventId?: string;
  }>;
  tags: Array<'friend' | 'rival' | 'lover' | 'guardian' | 'prisoner'>;
  favorOwed: boolean;
};
```

### 2. 值得保留的交互类别

CK2 的外交行动从角色头像发起。完整列表很庞杂，领主 RPG 可以提炼成以下六组：[CK2 中文百科：外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8)、[CK2 官方本体手册](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/203770/manuals/PDX7605US_CK%20II_Onlinemanual.pdf)。

| 组别 | CK2 式动作 | 对 RPG 的价值 |
| --- | --- | --- |
| 礼遇与恩赏 | 赠送礼物、赠予宝物、授予荣誉头衔、授地、转封封臣 | 最直接的封建交换；会留下长期政治后果 |
| 家族与人质 | 求婚、订婚、母系婚姻、指定监护人 | 把亲密关系、继承和外交绑定在一起 |
| 宫廷与信仰 | 邀请入廷、任命/解雇内阁、要求改信、授予职位 | 适合通过当面对话或正式信件谈判 |
| 承诺与集体政治 | 买人情、请求内阁支持、要求支持派系、缔结同盟 | 比单纯刷好感更有可执行性 |
| 强制与司法 | 逮捕、赎金、释放、处决、驱逐、剥夺头衔 | 必须经过合法性、暴政、内阁/摄政审查 |
| 阴谋与私人行动 | 邀请加入谋杀阴谋、制止阴谋、监视、勾引、决斗 | 让性格、秘密和私人关系进入政治循环 |

`Way of Life` 还把角色重心和事件/交互绑定，包含统治、经商、狩猎、战争、家庭、宴饮、勾引、密谋、学术、神学十种重心，并加入决斗、勾引、送入修道院、与情人分手等互动。[Paradox：CK2 Way of Life](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life)。

### 3. 接受与拒绝应由“理由”构成

CK2 外交界面会把 AI 接受度拆成可见原因，例如好感、军力、地位差、宗教文化、法理、距离、性格中的贪婪，以及是否存在利益冲突。赠礼的效果和费用也受外交属性、对方收入、对方性格影响。[CK2 中文百科：外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8)。

移植建议：每次正式请求都生成可解释的判定，而不是让大模型临场拍脑袋。

```text
接受分 = 基础意愿
       + 对玩家好感
       + 性格与请求匹配
       + 亲族/同盟/同社团关系
       + 权力与威慑
       + 许诺利益
       + 已调用的人情
       - 风险
       - 利益冲突
       - 宗教文化隔阂
       - 距离与通信损耗
```

界面应向玩家展示主要理由；AI 的自然语言回复则负责把这些理由说得像该角色本人。

### 4. 内阁与人情是 CK2 后期最适合对话化的政治系统

启用 `Conclave` 后，强力封臣会要求内阁席位；进入内阁可让他们暂时无法加入派系，但也让他们参与重大行动投票。内阁成员会按立场赞成、反对或弃权，强行绕过反对会造成暴政与内阁不满。人情可强制一段时间内的投票支持，也可迫使婚姻、入廷、教育、入派系等请求被接受。[Paradox：CK2 Conclave](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave)、[Conclave 官方开发日志：Power to the Council](https://admin-forum.paradoxplaza.com/forum/developer-diary/conclave-dev-diary-2-power-to-the-council.903120/)。

它非常适合改成可对话的“议政场景”：

- 玩家先提出法令/战争/剥夺案；
- 每位内阁成员根据立场给出条件与反对理由；
- 玩家可以说服、交换承诺、支付金钱、许诺职位或调用旧人情；
- 最终由确定性规则计算投票；
- 对话生成只改变提案条件和态度修正，不能绕过规则直接宣布结果。

### 5. 将“同地对话 + 书信”接到 CK2 交互上（移植建议，不是 CK2 原版）

CK2 原版的大多数角色行动不要求双方实际同地，也没有 CK3 式完整旅行系统。因此，用户提出的“同地才能自由对话，异地只能写信”应作为本项目自己的核心创新。

推荐分层：

| 渠道 | 可做的事 | 特点 |
| --- | --- | --- |
| 当面会谈 | 私密谈判、宴饮、安慰、勾引、质问、决斗、秘密招募、深度自由对话 | 信息丰富、关系变化大，也有刺杀/泄密风险 |
| 正式书信 | 求婚、结盟、赎金、授职、召见、改信、战争召唤、外交照会 | 有送达时间，可被截获、伪造、公开或拒收 |
| 密信 | 阴谋邀请、社团暗号、策反、勒索、私奔安排 | 需要密谋能力和可靠信使 |
| 代理人 | 外交官、亲属、内阁成员代为谈判 | 结果受代理人能力、忠诚和私心影响 |
| 公开议政 | 法律、战争、司法、摄政和财政议案 | 多人场景，产生投票与正式记录 |

“只有同地才可交互”不宜做成绝对限制，否则远距离封建政治会失灵。更好的规则是：异地可做形式化、低带宽的交互；同地解锁高带宽、高风险、高关系增量的互动。

### 6. AI 对话与游戏状态的权力边界（移植建议）

建议采用两阶段提交：

1. 游戏先向 LLM 提供角色可知信息、性格、当前地点、关系、合法动作和本轮目标。
2. LLM 输出台词，同时提交一个受限的 `intent`，例如“愿意结盟，但要求把女儿许配给继承人”。
3. 规则引擎校验人物是否有权承诺、条件是否合法、资源是否足够。
4. 玩家确认后，规则引擎执行状态变更并写入事件日志。
5. 下一轮对话读取已发生的事实，而不是让 LLM 自己维护唯一真相。

这样既保留自由对话，又避免 AI 一句话凭空送出王国、复活死者或改变战争结果。

## 四、Societies：CK2 最适合酒馆 RPG 的独有骨架

### 1. 原版结构

`Monks and Mystics` 把 Society 定义为有共同宗教/思想目标的角色组织。社团有加入条件、秘密性、层级、社团货币（通常称 Devotion）、任务、能力和成员互动；角色同一时间只能属于一个社团。完成任务可更快积累奉献并申请晋升，等级越高解锁越强的动作。[CK2 Monks and Mystics 官方手册](https://cdn.cloudflare.steamstatic.com/steam/apps/530780/manuals/2018_11_CK_II_Monks_Mystics_Manual_ENG.pdf)、[CK2 中文百科：社团](https://ck2.parawikis.com/zh-hans/%E7%A4%BE%E5%9B%A2)。

最终时期常见类型包括：

| 类型 | 公开性 | 主要体验 |
| --- | --- | --- |
| 修会 | 公开 | 祈祷、慈善、朝圣、去除罪恶特质、培养美德、宗教转化 |
| 赫耳墨斯学会 | 公开 | 学术、炼金、占星、实验、实验室、著作和宝物 |
| 秘密宗教社团 | 秘密且非法 | 伪装信仰、拉拢成人、秘密教育儿童、秘密礼拜、最终公开改宗 |
| 阿萨辛派 | 秘密 | 恐吓、谋杀、非对称战争、召集特殊部队 |
| 恶魔崇拜者 | 秘密 | 超自然能力、绑架与腐化；可由规则关闭 |
| 战士公会/战士会 | 公开 | 决斗、战斗任务、武艺成长、战友网络 |

官方手册说明社团按层级解锁能力；CK2 通常以四个等级表现成员晋升。移植时不必照抄每个超能力，但应保留“准入—任务—货币—晋级—新权力—组织义务”循环。

### 2. 社团真正有价值的地方

社团给人物增加了一条与封建领主—封臣链交叉的横向网络：两个敌对国家的贵族可能是同会兄弟；一个忠诚内阁成员可能暗中属于被迫害的信仰；玩家的继承人可能在社团里先于继位积累人脉。

这对酒馆尤其重要，因为它天然制造：

- 暗号、试探、入会仪式和导师对话；
- 可持续的任务链，而不是一次性闲聊；
- 身份暴露、告密、审讯、伪装和双重忠诚；
- 同门请求与政治职责冲突；
- 只有同地或持有介绍信时才能接触的隐秘人物；
- 跨国人脉和与地图扩张无关的成长线。

### 3. 推荐的社团最小模型（移植建议）

```ts
type SocietyMembership = {
  societyId: string;
  characterId: string;
  rank: 1 | 2 | 3 | 4;
  currency: number;
  publicStatus: 'public' | 'suspected' | 'secret' | 'exposed';
  activeMissionId: string | null;
  mentorId: string | null;
};
```

每个任务必须同时包含：前置条件、地点、目标人物、截止期、可接受的完成证据、成功/失败状态差分，以及拒绝任务的组织代价。不要让 LLM 只凭叙事宣布任务完成。

## 五、摄政：CK2 有戏剧性事件，但不是 CK3 的“权力天平”

### 1. 触发与基本效果

CK2 中，未成年领主、无能力者、被囚禁者、躲藏者，以及朝圣/麦加朝觐等离开统治现场的角色会进入摄政；部分 DLC 决议也会在角色远行时临时产生摄政。[CK2 Wiki：Regency](https://ck2.paradoxwikis.com/Regency)（官方 Wiki 链接）、[Steam 社区对 CK2 Wiki 触发条件的转述](https://steamcommunity.com/app/203770/discussions/0/1488866813759116799/)。

摄政期间的关键约束是：

- 摄政者的能力会替代/影响统治者用于国家计算的能力；
- 宣战、剥夺、逮捕、处决、驱逐等重大动作需要摄政者或摄政内阁批准；
- 摄政者对统治者的好感、对目标的好感、性格和利益冲突会影响批准；
- 成年角色可预先授予某人“指定摄政”荣誉头衔，但实际摄政仍可能因死亡和事件更替。

### 2. 无 Conclave 与有 Conclave 的区别

- 旧制：单个摄政者是重大行动的关键审批者。
- 启用 `Conclave`：旧的“单摄政一人决定一切”被改为摄政者进入内阁并代替领主投票；摄政中的玩家不能绕过内阁多数。[Conclave 官方开发日志：Power to the Council](https://admin-forum.paradoxplaza.com/forum/developer-diary/conclave-dev-diary-2-power-to-the-council.903120/)。

因此，若要复刻 CK2 最终形态，摄政必须和内阁投票连接，而不是另做一套完全平行的系统。

### 3. CK2 摄政的事件戏剧

CK2 的摄政事件可出现摄政者侵吞钱财、夺取地产、把钱捐给慈善、羞辱统治者、被其他封臣挑战、试图宣布统治者疯狂，乃至极少数篡位相关事件。它们属于条件化事件链，而不是 CK3 后来那套持续摆动的“权力天平/牢固摄政”。

这是必须防混淆的点：若设计“摄政权威 0—100、摄政者逐级攫取权力、领主争取终止牢固摄政”，那是在吸收 CK3 或原创机制，不能标为 CK2 原版。

### 4. 适合本项目的摄政改造（移植建议）

可以保留 CK2 的批准制和事件制，再增加一套轻量但可读的摄政状态：

```ts
type Regency = {
  rulerId: string;
  regentId: string;
  reason: 'minor' | 'incapable' | 'imprisoned' | 'absent' | 'hidden';
  startedAt: string;
  expectedEndAt: string | null;
  councilApprovalRequired: boolean;
  regentTrust: number;       // 对幼主/正主的忠诚，不等于好感
  regentInfluence: number;   // 政治影响力，项目原创或 CK3 借鉴项
  recordedAbuses: string[];
};
```

摄政者不应直接成为新的玩家角色；玩家仍扮演法定领主，但其行动会被拒绝、附加条件或交由议政场景。这样幼主时期不是“暂停游戏”，而是围绕监护人、母族、叔伯、内阁和封臣争夺实际控制权。

出巡系统与摄政也能自然连接：领主远离首都时，摄政处理日常政务；紧急信件会追上领主，领主可远程批准少数事项，但通信有延迟与被截获风险。这里是项目原创，不是 CK2 旅行机制。

## 六、其他值得移植的 CK2 精华

### S 级：直接服务“AI 对话 + 领主政治”

1. **Conclave 内阁立场、投票和人情**：把国家行动变成多人谈判，不再是菜单按钮。[Paradox：CK2 Conclave](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave)。
2. **Societies 的任务与横向秘密网络**：为自由对话提供长期组织目标。
3. **Way of Life 重心**：玩家选择当前人生方向，控制随后出现的人物、地点、事件和对白主题。[Paradox：CK2 Way of Life](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life)。
4. **监护/教育作为人质外交**：孩子所在宫廷、监护人文化宗教和成年后的关系都会产生长期后果。
5. **定向好感修正 + 朋友/仇敌/情人**：让 AI 台词有可追溯的情感原因。

### A 级：给王朝长线提供记忆

1. **宝库与可继承宝物**：宝物可提供加成、赠予他人，也可能在城堡失陷时被抢走。[Monks and Mystics 官方手册](https://cdn.cloudflare.steamstatic.com/steam/apps/530780/manuals/2018_11_CK_II_Monks_Mystics_Manual_ENG.pdf)。
2. **血脉**：历史人物和玩家壮举形成可遗传的特殊血脉，给后代身份和叙事资本。[Paradox：CK2 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury)。
3. **野心、称号和事件链**：让人物有一生的追求与被世界记住的结果，而非只有数值升级。
4. **继承法与多头衔分割**：角色死亡后地图、封臣和兄弟关系一起重排，是王朝戏剧的主要发动机。

### B 级：世界模拟与风味扩展

1. **瘟疫、医院、繁荣/人口衰减与闭门隔离**：让地点状态真正改变人物可见性、活动和政治。[Paradox：CK2 The Reaper's Due](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-the-reapers-due)。
2. **商业共和国五大家族、终身选举和贸易站**：适合以后做非封建玩法，但不宜拖慢第一版。
3. **宗教领袖、叙任权、教宗政治、圣战与加冕**：能扩展合法性来源。
4. **总督制**：授予终身而非世袭的公国/王国职位，死亡后归还君主；特别适合帝国官僚与继承冲突。[CK2 中文百科：帝国](https://ck2.parawikis.com/wiki/%E5%B8%9D%E5%9B%BD)。
5. **疾病、伤残、医师和死亡风险**：把身体状态变成摄政、继承和关系危机的来源。

## 七、建议的开发优先级

> 后续决定：用户已确认首条竖切缩小为 12—20 个伯爵领。下列 20—50 个伯爵领是本研究形成时对较完整 P0 的原始估计，不再作为首条竖切范围。

### P0：先证明“地图政治 + 对话政治”闭环

- 20—50 个伯爵领的可点击地图；
- 伯爵领邻接、路径和永久/临时占领两层颜色；
- `county/duchy/kingdom` 三层头衔，法理与事实分离；
- 30—80 名活跃人物，含家族、头衔、领主链、地点和五项能力；
- 定向好感、关系标签、短期修正和事件日志；
- 当面会谈、书信、礼物、婚姻、召见、授职、宣战请求、逮捕/赎金等少量交互；
- LLM 台词 + 规则引擎 `intent` 校验；
- 死亡与一次可观察的继承重排；
- 轻量摄政：未成年/离境触发，重大行为需摄政或内阁批准。

### P1：让政治网络开始自驱动

- 派系、阴谋和宣称；
- Conclave 式内阁投票、人情和强力封臣；
- 2—3 个社团，每个四级、各 6—10 个任务；
- 角色重心和个人事件；
- 书信延迟、拦截、密信和代理人；
- 出巡/活动和同地人物刷新。

### P2：增加王朝与世界厚度

- 宝物、血脉、称号、编年史；
- 瘟疫、医院、繁荣、隔离；
- 宗教领袖、加冕、叙任权；
- 商业共和国或总督帝国等异质政体；
- 更完整的战争、补给、兵种与围攻。

第一版不应先实现整个欧亚地图、上千人物和 CK2 全部宣战理由。只要小地图上一次婚姻、一次授地、一次争议继承和一次内阁交易能互相影响，就已证明核心成立。

## 八、建议尽快向用户确认的问题

1. 地图最小可点击块究竟采用 CK2 式“伯爵领”，还是 CK3 式“男爵领小块拼伯爵领”？推荐后者负责画面与移动、前者负责主要政治和经济。
2. 世界是历史欧洲、架空欧洲，还是仅借用封建结构的原创世界？这会决定宗教、文化和头衔名称能否照搬。
3. 玩家只扮演有地领主，还是允许无地廷臣、摄政、骑士、商人和社团成员开局？
4. 是否保留超自然恶魔社团、长生和巫术？建议做独立世界规则，默认可关闭。
5. 摄政更偏 CK2 的“批准 + 事件”，还是吸收 CK3 的“持续权力斗争”？
6. 对话可否许诺未来的土地、婚姻、职位和战争？如果可以，需要一套可追责的承诺账本。
7. 书信是立即回复，还是随地图距离经过若干天送达？能否被拦截、伪造或公开？
8. AI 是否可以主动发起对话、送信、召集议会和提出交易，而不是只回复玩家？
9. 游戏时间是逐日、逐周、按事件推进，还是玩家行动一次推进若干天？
10. 角色死亡后是否强制切换到同王朝继承人？这是 CK 核心，但也会显著增加角色卡和存档设计复杂度。
11. 玩家在对话里说出的事实，哪些只是吹嘘，哪些可以成为系统承认的正式提案或誓言？
12. 第一张卡希望服务单一主角的深度故事，还是长期多代王朝沙盒？两者的状态规模不同。

## 九、核心来源索引

- [Paradox：Crusader Kings II 官方页](https://www.paradoxinteractive.com/games/crusader-kings-ii)
- [CK2 官方本体手册 PDF](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/203770/manuals/PDX7605US_CK%20II_Onlinemanual.pdf)
- [CK2 官方 Wiki 首页](https://ck2.paradoxwikis.com/Crusader_Kings_II_Wiki)
- [CK2 官方 Wiki：Regency](https://ck2.paradoxwikis.com/Regency)
- [Paradox：CK2 Conclave](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-conclave)
- [Conclave 官方开发日志：Power to the Council](https://admin-forum.paradoxplaza.com/forum/developer-diary/conclave-dev-diary-2-power-to-the-council.903120/)
- [CK2 Monks and Mystics 官方手册 PDF](https://cdn.cloudflare.steamstatic.com/steam/apps/530780/manuals/2018_11_CK_II_Monks_Mystics_Manual_ENG.pdf)
- [Paradox：CK2 Way of Life](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-way-of-life)
- [Paradox：CK2 Holy Fury](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-holy-fury)
- [Paradox：CK2 The Reaper's Due](https://www.paradoxinteractive.com/games/crusader-kings-ii/add-ons/crusader-kings-ii-the-reapers-due)
- [CK2 中文百科：外交行动](https://ck2.parawikis.com/wiki/%E5%A4%96%E4%BA%A4%E8%A1%8C%E5%8A%A8)
- [CK2 中文百科：社团](https://ck2.parawikis.com/zh-hans/%E7%A4%BE%E5%9B%A2)
- [CK2 中文百科：好感](https://ck2.parawikis.com/wiki/%E5%A5%BD%E6%84%9F)
- [CK2 中文百科：内阁](https://ck2.parawikis.com/wiki/%E5%86%85%E9%98%81)
- [CK2 中文百科：王国](https://ck2.parawikis.com/wiki/%E7%8E%8B%E5%9B%BD)
- [CK2 中文百科：帝国](https://ck2.parawikis.com/wiki/%E5%B8%9D%E5%9B%BD)

## 十、一句话结论

要移植的不是 CK2 的全部菜单，而是它的因果链：**地图上的每块土地由一个会死、会爱恨、会欠债、会结党的人掌握；扩张会迫使玩家把土地交给更多这样的人；AI 对话负责让他们像人，规则引擎负责保证他们仍然活在同一个可计算的封建世界里。**
