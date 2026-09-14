/**
 * 势力与宗门系统管理模块
 *
 * 职责：
 * 1. 提供 17 大门派/势力静态谱系数据检索
 * 2. 传承武学向师请教报价计算与确定性原子扣费事务
 * 3. 差事任务结算领奖原子事务（更新贡献/修为/物品、清理任务键）
 * 4. 势力差事地点严格白名单过滤与 AI 提示词构造
 */

import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import type {
  FactionStatus,
  FactionTask,
  FactionTaskExecutionStatus,
  FactionTaskMap,
  FactionTaskReward,
  FactionType,
  InitialAttributes,
  InventoryItemVariableData,
  SectMartialNode,
  SectStaticData,
  UserFactionEntry,
  UserFactionsMap,
} from '../types';
import sectsJson from '../data/sects.json';
import { gameLogger } from './logger';

declare function getVariables(filter?: { type: 'chat' | 'character' | 'global' }): Promise<Record<string, unknown>>;

export interface SectDatabase {
  version: number;
  totalSects: number;
  sects: SectStaticData[];
}

const SECTS_DATA = sectsJson as unknown as SectDatabase;

/**
 * 传承武学五层阶梯基准消耗
 */
export const FACTION_LEARN_TIER_COST: Record<string, { cultivation: number; contribution: number }> = {
  入门: { cultivation: 50, contribution: 20 },
  基础: { cultivation: 150, contribution: 50 },
  进阶: { cultivation: 400, contribution: 150 },
  核心: { cultivation: 1000, contribution: 300 },
  镇派: { cultivation: 2500, contribution: 600 },
};

/**
 * 获取所有势力静态数据列表
 */
export function getAllSects(): SectStaticData[] {
  return SECTS_DATA.sects;
}

/**
 * 根据门派ID或名称查找势力数据
 */
export function getSectByName(nameOrId: string): SectStaticData | undefined {
  const query = nameOrId.trim();
  return SECTS_DATA.sects.find(
    s => s.门派ID === query || s.门派名称 === query || s.门派别名?.includes(query),
  );
}

export interface MartialArtLearnQuote {
  sectName: string;
  artName: string;
  tier: string;
  isLearned: boolean;
  canLearn: boolean;
  reason?: string;
  cultivationCost: number;
  contributionCost: number;
  currentCultivation: number;
  currentContribution: number;
  missingPrerequisites: string[];
  missingAttributes: string[];
}

/**
 * 判定并报价请教武学消耗
 */
export function quoteMartialArtLearn(options: {
  sectName: string;
  node: SectMartialNode;
  userCultivation: number;
  userContribution: number;
  knownMartialArts: Record<string, { 掌握程度?: string }>;
  initialAttributes: InitialAttributes;
  userRealm: string;
}): MartialArtLearnQuote {
  const { sectName, node, userCultivation, userContribution, knownMartialArts, initialAttributes } = options;

  const costConfig = FACTION_LEARN_TIER_COST[node.传承层级] || { cultivation: 150, contribution: 50 };
  const cultivationCost = costConfig.cultivation;
  const contributionCost = costConfig.contribution;

  // 1. 是否已掌握
  const isLearned = Boolean(knownMartialArts[node.功法]);
  if (isLearned) {
    return {
      sectName,
      artName: node.功法,
      tier: node.传承层级,
      isLearned: true,
      canLearn: false,
      reason: '已掌握该功法',
      cultivationCost,
      contributionCost,
      currentCultivation: userCultivation,
      currentContribution: userContribution,
      missingPrerequisites: [],
      missingAttributes: [],
    };
  }

  // 2. 前置功法检验
  const missingPrerequisites: string[] = [];
  if (Array.isArray(node.前置节点)) {
    for (const pre of node.前置节点) {
      const preArtName = pre.节点ID.split('::')[1] || pre.节点ID;
      const userMastery = knownMartialArts[preArtName]?.掌握程度;
      if (!userMastery) {
        missingPrerequisites.push(`需掌握《${preArtName}》(${pre.最低掌握程度})`);
      }
    }
  }

  // 3. 属性门槛检验
  const missingAttributes: string[] = [];
  if (node.学习限制?.属性门槛) {
    for (const [attr, reqValue] of Object.entries(node.学习限制.属性门槛)) {
      if (typeof reqValue === 'number') {
        const userValue = initialAttributes[attr as keyof InitialAttributes] ?? 0;
        if (userValue < reqValue) {
          missingAttributes.push(`${attr}需达到${reqValue}（当前${userValue}）`);
        }
      }
    }
  }

  // 4. 资源充足性校验
  let reason: string | undefined = undefined;
  if (missingPrerequisites.length > 0) {
    reason = `前置未达标：${missingPrerequisites.join('，')}`;
  } else if (missingAttributes.length > 0) {
    reason = `属性未达标：${missingAttributes.join('，')}`;
  } else if (userContribution < contributionCost) {
    reason = `贡献不足（需${contributionCost}点，当前${userContribution}点）`;
  } else if (userCultivation < cultivationCost) {
    reason = `修为不足（需${cultivationCost}点，当前${userCultivation}点）`;
  }

  const canLearn = !isLearned && missingPrerequisites.length === 0 && missingAttributes.length === 0 && userContribution >= contributionCost && userCultivation >= cultivationCost;

  return {
    sectName,
    artName: node.功法,
    tier: node.传承层级,
    isLearned,
    canLearn,
    reason,
    cultivationCost,
    contributionCost,
    currentCultivation: userCultivation,
    currentContribution: userContribution,
    missingPrerequisites,
    missingAttributes,
  };
}

function createTransactionId(prefix: string): string {
  try {
    if (typeof crypto?.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 执行向师请教原子事务写入
 * 1. 扣减修为
 * 2. 扣减对应门派贡献
 * 3. 录入功法（掌握程度：初窥门径）
 */
export async function learnFactionMartialArt(options: {
  sectName: string;
  artName: string;
  quote: MartialArtLearnQuote;
}): Promise<{ success: boolean; error?: string }> {
  const { sectName, artName, quote } = options;

  if (!quote.canLearn) {
    return { success: false, error: quote.reason || '未满足请教条件' };
  }

  const variables = await getVariables({ type: 'chat' });
  const statData = (variables?.stat_data || {}) as Record<string, any>;
  const userData = statData.user数据 || {};

  const currentCultivation = typeof userData.修为 === 'number' ? userData.修为 : 0;
  const currentFactions = (userData.势力?.所属势力 || userData.势力 || {}) as Record<string, any>;
  const currentFaction = currentFactions[sectName];
  const currentContribution = typeof currentFaction?.贡献 === 'number' ? currentFaction.贡献 : 0;

  if (currentCultivation < quote.cultivationCost) {
    return { success: false, error: '请教失败：修为已不足' };
  }
  if (currentContribution < quote.contributionCost) {
    return { success: false, error: '请教失败：门派贡献已不足' };
  }

  const newCultivation = Math.max(0, currentCultivation - quote.cultivationCost);
  const newContribution = Math.max(0, currentContribution - quote.contributionCost);

  const transactionId = createTransactionId('faction-learn');
  const operations: Array<{ type: 'insert' | 'update'; payload: Record<string, unknown> }> = [
    {
      type: 'update',
      payload: {
        user数据: {
          修为: newCultivation,
        },
      },
    },
    {
      type: 'update',
      payload: {
        user数据: {
          势力: {
            [sectName]: {
              贡献: newContribution,
            },
          },
        },
      },
    },
    {
      type: 'insert',
      payload: {
        user数据: {
          功法: {
            [artName]: {
              掌握程度: '初窥门径',
            },
          },
        },
      },
    },
  ];

  try {
    await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'faction-learn-art',
      refreshHint: 'character-data',
      eventName: 'era:transactionByObject',
      attribution: 'background',
      detail: { transactionId, operations },
      expectedAction: 'apiWrite',
      expectedTransactionId: transactionId,
      timeoutMs: 10000,
      timeoutMessage: '向师请教事务已发出，但 ERA 未确认写入。',
    });
    gameLogger.log(`[factionManager] 成功请教功法 ${artName}，扣除修为 ${quote.cultivationCost}，贡献 ${quote.contributionCost}`);
    return { success: true };
  } catch (error) {
    gameLogger.error('[factionManager] 请教功法事务失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '请教功法失败' };
  }
}

export interface ClaimTaskResult {
  success: boolean;
  error?: string;
  earnedContribution?: number;
  earnedCultivation?: number;
  earnedItems?: string[];
  commandText?: string;
}

/**
 * 领取已完成的差事任务奖励原子事务
 * 1. 读取奖励增量并折算绝对值
 * 2. 增加贡献、增加修为、放入行囊
 * 3. 从 stat_data.任务 中安全删除已领取的任务键
 */
export async function claimFactionTaskReward(
  taskName: string,
  task: FactionTask,
): Promise<ClaimTaskResult> {
  if (task.任务执行情况 !== '已完成') {
    return { success: false, error: '任务尚未完成，无法领取奖励' };
  }

  const variables = await getVariables({ type: 'chat' });
  const statData = (variables?.stat_data || {}) as Record<string, any>;
  const userData = statData.user数据 || {};

  const currentCultivation = typeof userData.修为 === 'number' ? userData.修为 : 0;
  const currentFactions = (userData.势力?.所属势力 || userData.势力 || {}) as Record<string, any>;
  const currentFaction = currentFactions[task.所属势力];
  const currentContribution = typeof currentFaction?.贡献 === 'number' ? currentFaction.贡献 : 0;

  const reward = task.任务奖励 || {};
  const addContrib = Math.max(0, reward.贡献增量 || 0);
  const addCult = Math.max(0, reward.修为增量 || 0);
  const newCultivation = currentCultivation + addCult;
  const newContribution = currentContribution + addContrib;

  const transactionId = createTransactionId('faction-claim');
  const operations: Array<{ type: 'insert' | 'update' | 'delete'; payload: Record<string, unknown> }> = [];

  // 更新修为与贡献
  operations.push({
    type: 'update',
    payload: {
      user数据: {
        修为: newCultivation,
      },
    },
  });

  if (addContrib > 0 && currentFaction) {
    operations.push({
      type: 'update',
      payload: {
        user数据: {
          势力: {
            [task.所属势力]: {
              贡献: newContribution,
            },
          },
        },
      },
    });
  }

  // 插入物品到包裹
  const earnedItemNames: string[] = [];
  if (reward.获得物品 && typeof reward.获得物品 === 'object') {
    const itemsToInsert: Record<string, InventoryItemVariableData> = {};
    for (const [itemName, itemData] of Object.entries(reward.获得物品)) {
      if (itemData && typeof itemData === 'object') {
        itemsToInsert[itemName] = {
          ...itemData,
          类型: itemData.类型 || '杂物',
        };
        earnedItemNames.push(itemName);
      }
    }
    if (Object.keys(itemsToInsert).length > 0) {
      operations.push({
        type: 'insert',
        payload: {
          user数据: {
            包裹: itemsToInsert,
          },
        },
      });
    }
  }

  // 删除任务
  operations.push({
    type: 'delete',
    payload: {
      任务: {
        [taskName]: null,
      },
    },
  });

  try {
    await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'faction-claim-reward',
      refreshHint: 'character-data',
      eventName: 'era:transactionByObject',
      attribution: 'background',
      detail: { transactionId, operations },
      expectedAction: 'apiWrite',
      expectedTransactionId: transactionId,
      timeoutMs: 10000,
      timeoutMessage: '差事领奖事务已发出，但 ERA 未确认写入。',
    });

    const commandText = `🏷️ [师门汇报] 交付差事《${taskName}》`;
    gameLogger.log(`[factionManager] 成功交付差事《${taskName}》: 贡献+${addContrib}, 修为+${addCult}`);
    return {
      success: true,
      earnedContribution: addContrib,
      earnedCultivation: addCult,
      earnedItems: earnedItemNames,
      commandText,
    };
  } catch (error) {
    gameLogger.error('[factionManager] 交付差事失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '交付差事失败' };
  }
}

/**
 * 势力候选差事地点白名单提取
 * 严格基于势力主峰驻地周围的合法三级地点
 */
export function getFactionCandidateLocations(sect: SectStaticData): string[] {
  const baseLocation = sect.主峰驻地;
  const parts = baseLocation.split('/');
  const scope = `${parts[0]}/${parts[1]}`;

  // 内置各门派驻地周边高置信度合法三级地点
  const SECT_REGION_LOCATIONS: Record<string, string[]> = {
    全真教: ['大宋/终南山/重阳宫', '大宋/终南山/豺狼谷', '大宋/终南山/普光寺', '大宋/终南山/玉虚洞'],
    古墓派: ['大宋/终南山/活死人墓', '大宋/终南山/活死人墓外', '大宋/终南山/终南山山域', '大宋/终南山/豺狼谷'],
    少林派: ['大宋/少室山/少林寺', '大宋/少室山/山脚客栈', '大宋/少室山/荒山草堂', '大宋/少室山/少室绝顶'],
    逍遥派: ['西域/天山/灵鹫宫', '西域/天山/缥缈峰', '西域/天山/天然冰洞'],
    星宿派: ['西域/星宿海/星宿宫', '西域/星宿海/荒谷'],
    '藏传密宗·金轮一脉': ['蒙古/和林/和林城', '蒙古/克烈部/土山', '蒙古/克烈部/铁木真营地'],
    '吐蕃密宗·大轮寺一脉': ['吐蕃/拉萨/大轮寺'],
    丐帮: ['大宋/洞庭湖/君山', '大宋/临安府/牛家村', '大宋/临安府/临安酒楼', '大宋/嘉兴府/南湖'],
    铁掌帮: ['大宋/潭州/铁掌山', '大宋/常德府/沅江岸边', '大宋/常德府/沅江附近山区'],
    桃花岛: ['海外/桃花岛/桃花岛腹地', '海外/桃花岛/试剑峰', '海外/桃花岛/桃花岛海岸'],
    大理段氏与一灯门下: ['大理/点苍山/天龙寺', '大理/点苍山/崇圣寺', '大理/无量山/剑湖宫', '大理/无量山/后山森林'],
    白驼山庄: ['西域/白驼山/庄院', '西域/白驼山/蛇谷'],
    姑苏慕容氏: ['大宋/太湖/燕子坞', '大宋/太湖/曼陀山庄', '大宋/太湖/听香水榭', '大宋/太湖/归云庄'],
    绝情谷公孙家传: ['大宋/绝情谷/绝情谷内', '大宋/绝情谷/水仙山庄', '大宋/绝情谷/断肠崖'],
    万兽山庄: ['大宋/晋南/万兽山庄', '大宋/晋南/万兽山庄外围', '大宋/晋南/百花谷'],
    江南七怪: ['大宋/嘉兴府/南湖', '大宋/嘉兴府/嘉兴郊野', '大宋/嘉兴府/陆家庄'],
    蒙古军旅武学: ['蒙古/克烈部/铁木真营地', '蒙古/克烈部/桑昆营地', '蒙古/克烈部/土山'],
  };

  const list = SECT_REGION_LOCATIONS[sect.门派名称] || [baseLocation];
  return list.slice(0, 4);
}

/**
 * 构造拜入门派系统指令消息
 */
export function buildJoinFactionUserMessage(sect: SectStaticData, applicantName: string): string {
  const starterArt = sect.武学传承树.find(n => n.传承层级 === '入门')?.功法 || '吐纳功';
  const teacher = sect.掌舵人[0] || '掌门';

  return `${applicantName}前去拜入${sect.门派名称}门下。

[系统指令与剧情指引]
- 交互动作：投身${sect.体系类型}
- 目标势力：${sect.门派名称}
- 接引长辈：${teacher}
- 剧情要求：请结合双方性格与过往，生成${sect.门派名称}驻地内接引长辈出题考校、见其资质非凡欣然收录、赐予入门功法《${starterArt}》的生动正文。
- 变量写入：正文完成后，必须在回复最末尾附带以下标准变量插入块：
<VariableInsert>
{
  "user数据": {
    "身份": { "${sect.门派名称}": "入门弟子" },
    "势力": {
      "${sect.门派名称}": {
        "体系类型": "${sect.体系类型}",
        "身份": "入门弟子",
        "师承": "${teacher}",
        "贡献": 0,
        "状态": "在籍"
      }
    },
    "功法": {
      "${starterArt}": { "掌握程度": "初窥门径" }
    }
  }
}
</VariableInsert>`;
}

/**
 * 构造接取差事系统指令消息
 */
export function buildRequestTaskUserMessage(
  sect: SectStaticData,
  applicantName: string,
  realm: string,
): string {
  const candidateLocations = getFactionCandidateLocations(sect);
  const teacher = sect.掌舵人[0] || '长辈';
  const randomLoc = candidateLocations[Math.floor(Math.random() * candidateLocations.length)] || sect.主峰驻地;

  return `${applicantName}前去查看势力差事。

[系统指令：生成门派差事]
- 当前势力：${sect.门派名称}
- 玩家境界：${realm}
- 候选地点白名单：${JSON.stringify(candidateLocations)}
- 剧情要求：
  1. 由${sect.门派名称}长辈（如${teacher}或知客值守）交代一段切合时宜的差事或历练任务；
  2. 必须在回复末尾附带以下标准的 VariableInsert 块（任务地点必须在候选白名单内）：
<VariableInsert>
{
  "任务": {
    "${sect.门派名称}门下历练巡防": {
      "所属势力": "${sect.门派名称}",
      "任务详情": "奉师门之命巡察周边要道，缉拿侵扰山民之恶徒匪类，扬我门威。",
      "任务地点": "${randomLoc}",
      "任务执行情况": "未到达地点",
      "任务奖励": {
        "贡献增量": 30,
        "修为增量": 50,
        "获得物品": {
          "铜钱": { "类型": "杂物", "品阶": "凡品", "物品描述": "流通铜钱。", "数量": 200 }
        }
      }
    }
  }
}
</VariableInsert>`;
}

/**
 * 构造向师请教演播剧情指令
 */
export function buildLearnMartialArtUserMessage(
  applicantName: string,
  teacherName: string,
  artName: string,
  tier: string,
): string {
  return `${applicantName}向师尊${teacherName}请教《${artName}》。

[系统动作：向师请教]
- 传功恩师：${teacherName}
- 研习功法：${artName}（层级：${tier}）
- 剧情要求：请结合师徒双方性格与功法特点，生成${teacherName}亲自考校招式基础、喂招拆解口诀玄奥并指引运气行功的精彩教学正文。`;
}

/**
 * 构造申请晋升指令
 */
export function buildFactionPromotionUserMessage(
  applicantName: string,
  sect: SectStaticData,
  currentIdentity: string,
  targetIdentity: string,
): string {
  const teacher = sect.掌舵人[0] || '掌门';
  return `${applicantName}在${sect.门派名称}立下诸多功绩，特向长辈申请晋升。

[系统指令：门派身份晋升]
- 当前门派：${sect.门派名称}
- 当前身份：${currentIdentity}
- 晋升目标：${targetIdentity}
- 考核长辈：${teacher}
- 剧情要求：由${teacher}等师门尊长验看其近日功绩修为，赞许嘉勉，当众正式授予更高门派名分。
- 变量修改：正文末尾附带以下变量变更块：
<VariableEdit>
{
  "user数据": {
    "身份": { "${sect.门派名称}": "${targetIdentity}" },
    "势力": {
      "${sect.门派名称}": {
        "身份": "${targetIdentity}"
      }
    }
  }
}
</VariableEdit>`;
}

/**
 * 构造破门叛离指令
 */
export function buildFactionBetrayUserMessage(
  applicantName: string,
  sect: SectStaticData,
  currentIdentity: string,
): string {
  return `${applicantName}毅然决断，宣布脱离${sect.门派名称}！

[系统指令：破门叛离]
- 脱离势力：${sect.门派名称}
- 原有身份：${currentIdentity}
- 剧情要求：请生成${applicantName}向师门断席绝交、归还信物佩印、或遭同门长辈厉声斥责震怒的戏剧冲突正文。
- 变量修改：正文末尾附带以下变量变更块：
<VariableEdit>
{
  "user数据": {
    "身份": { "${sect.门派名称}": "弃徒" },
    "势力": {
      "${sect.门派名称}": {
        "身份": "弃徒",
        "贡献": 0,
        "状态": "叛门"
      }
    }
  }
}
</VariableEdit>`;
}
