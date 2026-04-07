/**
 * 酒馆变量读取工具
 * 用于从酒馆环境中读取和解析游戏状态数据
 *
 * 使用酒馆助手提供的 getAllVariables() API 获取合并后的变量表
 * - 在消息楼层 iframe 中调用: 获取 全局→角色卡→聊天→0号消息楼层→中间所有消息楼层→当前消息楼层 的合并结果
 * - 在全局变量 iframe 中调用: 获取 全局→角色卡→脚本→聊天→0号消息楼层→中间所有消息楼层→最新消息楼层 的合并结果
 */

import type {
    CurrentAttributes,
    GameEvent,
    GameState,
    InitialAttributes,
    InventoryItem,
    MartialArt,
    NPC,
    WorldTime,
} from '../types';

import {
    calculateAllAttributes,
    type MartialArtForCalculation,
} from './attributeCalculator';
import {
    completeMartialArts,
    getMartialArtData,
    loadMartialArtsDatabase,
    type CompleteMartialArt,
    type SimpleMartialArt,
} from './martialArtsDatabase';
import { dataLogger } from './logger';

// 使用酒馆的 ChatMessage 类型（与本地 types.ts 中的 ChatMessage 区分）
type TavernChatMessage = {
  message_id: number;
  name: string;
  role: 'system' | 'assistant' | 'user';
  is_hidden: boolean;
  message: string;
  data: Record<string, unknown>;
  extra: Record<string, unknown>;
};

/**
 * 用户档案结构类型定义
 * 实际变量存储在 user数据.[用户名] 下
 */
interface UserProfile {
  性别?: string;
  外貌?: string;
  出生年份?: number;
  状态?: string;
  境界?: string;
  修为?: number;
  所在位置?: string;
  身份?: Record<string, string>;
  功法?: Record<
    string,
    {
      类型?: string;
      功法描述?: string;
      功法品阶?: string;
      掌握程度?: string;
      特性?: Record<string, string>;
    }
  >;
  // 玩家初始属性（7维：臂力、根骨、机敏、悟性、洞察、风姿、福缘）
  初始属性?: {
    臂力?: number;
    根骨?: number;
    机敏?: number;
    悟性?: number;
    洞察?: number;
    风姿?: number;
    福缘?: number;
  };
  // 玩家当前属性（战斗属性：随境界变化）
  // 注意：悟性、风姿、福缘不随境界变化，只存在于初始属性中
  当前属性?: {
    臂力?: number;
    根骨?: number;
    机敏?: number;
    洞察?: number;
  };
  // 当前属性字段（兼容新旧格式）
  // 注意：悟性不随境界变化，只存在于初始属性中
  属性?: {
    气血?: string | number; // 支持 "当前值/最大值" 格式或纯数字
    内力?: string | number; // 支持 "当前值/最大值" 格式或纯数字
    臂力?: number;
    根骨?: number;
    机敏?: number;
    洞察?: number;
  };
  // 包裹（注意：实际变量名是"包裹"而非"背包"）
  包裹?: Record<
    string,
    {
      类型?: string;
      品质?: string;
      物品描述?: string;
      数量?: number;
    }
  >;
  人物经历?: Record<string, string> | string;
  关系网?: Record<string, string>;
  $meta?: unknown; // MVU 元数据，忽略
}

/**
 * 角色数据结构类型定义（NPC）
 */
interface CharacterData {
  性别?: string;
  外貌?: string;
  性格?: string;
  境界?: string;
  修为?: number;
  初始属性?: {
    臂力?: number;
    根骨?: number;
    机敏?: number;
    悟性?: number;
    洞察?: number;
  };
  属性?: {
    气血?: string | number;
    内力?: string | number;
    臂力?: number;
    根骨?: number;
    机敏?: number;
    洞察?: number;
  };
  出生年份?: number;
  状态?: string;
  所在位置?: string;
  身份?: Record<string, string>;
  功法?: Record<
    string,
    {
      类型?: string;
      功法描述?: string;
      功法品阶?: string;
      掌握程度?: string;
      特性?: Record<string, string>;
    }
  >;
  重要物品?: Record<string, unknown>;
  人物经历?: Record<string, string> | string;
  关系网?: Record<string, string>;
  $meta?: unknown;
}

/**
 * 变量表结构类型定义
 * 根据 MVU 框架定义的变量结构
 */
interface GameVariables {
  // 世界信息
  世界信息?: {
    时间?: {
      年?: number;
      月?: number;
      日?: number;
      时?: number;
    };
  };

  // user数据（扁平结构，用户名和其他属性同级）
  user数据?: UserProfile & { 用户名?: string };

  // 角色数据（NPC 信息存储在这里）
  角色数据?: Record<string, CharacterData | unknown>;

  // 事件系统
  事件系统?: {
    未发生事件?: Record<string, unknown>;
    进行中事件?: Record<string, unknown>;
    已完成事件?: Record<string, unknown>;
  };

  // 社交/NPC
  侠缘?: Array<{
    姓名?: string;
    关系值?: number;
    武功描述?: string;
    武功品阶?: string;
    掌握程度?: string;
    特性?: Record<string, string>;
    重要物品?: string[];
    人物经历?: string;
    关系网?: string[];
  }>;

  // 允许其他未知字段
  [key: string]: unknown;
}

/**
 * 解析后的 AI 回复结构
 */
export interface ParsedAIResponse {
  /** 思维链内容（<content> 之前的内容） */
  thinking: string;
  /** 正文内容（<content></content> 包裹的内容） */
  content: string;
  /** 其他 XML 标签内容（<content> 之后的标签，键为标签名，值为标签内容） */
  otherTags: Record<string, string>;
}

/**
 * 解析 AI 回复，提取 thinking、content 和其他 XML 标签
 *
 * 结构说明：
 * - <content> 之前的内容是思维链（thinking）
 * - <content></content> 包裹的内容是正文
 * - </content> 之后的其他 XML 标签单独提取，用标签名命名
 *
 * @param messageContent AI 返回的原始消息内容
 * @returns 解析后的结构化数据
 */
export function parseAIResponse(messageContent: string): ParsedAIResponse {
  const result: ParsedAIResponse = {
    thinking: '',
    content: '',
    otherTags: {},
  };

  if (!messageContent) return result;

  // 查找 <content> 标签的位置
  const contentStartMatch = messageContent.match(/<content>/i);
  const contentEndMatch = messageContent.match(/<\/content>/i);

  if (
    contentStartMatch &&
    contentEndMatch &&
    contentStartMatch.index !== undefined &&
    contentEndMatch.index !== undefined
  ) {
    // 1. 提取 thinking（<content> 之前的内容）
    result.thinking = messageContent.substring(0, contentStartMatch.index).trim();

    // 2. 提取 content（<content> 和 </content> 之间的内容）
    const contentStart = contentStartMatch.index + '<content>'.length;
    const contentEnd = contentEndMatch.index;
    result.content = messageContent.substring(contentStart, contentEnd).trim();

    // 3. 提取 </content> 之后的其他 XML 标签
    const afterContent = messageContent.substring(contentEndMatch.index + '</content>'.length);

    // 匹配所有 XML 标签（支持自闭合和成对标签）
    const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>|<(\w+)\s*\/>/gi;
    let match;
    while ((match = tagRegex.exec(afterContent)) !== null) {
      const tagName = match[1] || match[3]; // match[1] 是成对标签名，match[3] 是自闭合标签名
      const tagContent = match[2] || ''; // 成对标签的内容，自闭合标签为空
      result.otherTags[tagName] = tagContent.trim();
    }
  } else {
    // 如果没有 <content> 标签，整个内容作为 content
    result.content = messageContent.trim();
  }

  return result;
}

/**
 * 解析消息中的 maintext 内容（兼容旧版）
 * @deprecated 建议使用 parseAIResponse
 */
export function parseMaintext(messageContent: string): string {
  dataLogger.log('');
  dataLogger.log('🔍 [parseMaintext] 开始解析 maintext');
  dataLogger.log('   输入内容长度:', messageContent.length);
  dataLogger.log('   输入内容前 200 字符:', messageContent.substring(0, 200));

  // 检查是否包含 maintext 标签
  const hasMaintext = /<maintext>/i.test(messageContent);
  dataLogger.log('   是否包含 <maintext> 标签:', hasMaintext);

  const match = messageContent.match(/<maintext>([\s\S]*?)<\/maintext>/i);
  dataLogger.log('   正则匹配结果:', match ? '匹配成功' : '匹配失败');

  if (match) {
    dataLogger.log('   匹配到的内容长度:', match[1].length);
    dataLogger.log('   匹配到的内容前 200 字符:', match[1].substring(0, 200));
  } else {
    // 调试：查找可能的标签变体
    const maintextStart = messageContent.indexOf('<maintext');
    const maintextEnd = messageContent.indexOf('</maintext>');
    dataLogger.log('   <maintext 位置:', maintextStart);
    dataLogger.log('   </maintext> 位置:', maintextEnd);
    if (maintextStart >= 0) {
      dataLogger.log('   <maintext 附近内容:', messageContent.substring(maintextStart, maintextStart + 50));
    }
  }

  const result = match ? match[1].trim() : '';
  dataLogger.log('✅ [parseMaintext] 返回结果长度:', result.length);
  return result;
}

/**
 * 解析消息中的 option 内容（兼容旧版）
 * @deprecated 建议使用 parseAIResponse，然后从 otherTags 中获取 option
 */
export function parseOptions(messageContent: string): string[] {
  dataLogger.log('');
  dataLogger.log('🔍 [parseOptions] 开始解析 options');
  dataLogger.log('   输入内容长度:', messageContent.length);

  // 检查是否包含 option 标签
  const hasOption = /<option>/i.test(messageContent);
  dataLogger.log('   是否包含 <option> 标签:', hasOption);

  const match = messageContent.match(/<option>([\s\S]*?)<\/option>/i);
  dataLogger.log('   正则匹配结果:', match ? '匹配成功' : '匹配失败');

  if (!match) {
    // 调试：查找可能的标签变体
    const optionStart = messageContent.indexOf('<option');
    const optionEnd = messageContent.indexOf('</option>');
    dataLogger.log('   <option 位置:', optionStart);
    dataLogger.log('   </option> 位置:', optionEnd);
    dataLogger.log('⚠️ [parseOptions] 未找到 option 标签，返回空数组');
    return [];
  }

  const optionText = match[1].trim();
  dataLogger.log('   匹配到的原始内容:', optionText);

  // 解析 A. B. C. 格式的选项
  const lines = optionText.split(/\n/);
  dataLogger.log('   按行分割数量:', lines.length);
  dataLogger.log('   各行内容:', lines);

  const options = lines.filter(line => /^[A-Z]\./.test(line.trim()));
  dataLogger.log('   筛选后选项数量:', options.length);

  const result = options.map(opt => opt.trim());
  dataLogger.log('✅ [parseOptions] 返回结果:', result);
  return result;
}

/**
 * 从 otherTags 中解析选项（A. B. C. 格式）
 */
export function parseOptionsFromTag(optionContent: string): string[] {
  if (!optionContent) return [];
  const options = optionContent.split(/\n/).filter(line => /^[A-Z]\./.test(line.trim()));
  return options.map(opt => opt.trim());
}

/**
 * 使用酒馆 getAllVariables() API 获取合并后的变量表
 * 这是读取游戏状态的首选方法
 *
 * 注意：getAllVariables() 返回的数据结构中，真正的游戏变量在 stat_data 键下
 * stat_data 包含世界信息、用户档案等 MVU 框架定义的变量
 */
export function getGameVariables(): GameVariables {
  try {
    // 调用酒馆助手提供的 getAllVariables API
    const rawVariables = getAllVariables() as Record<string, unknown>;
    dataLogger.log('[variableReader] Step 1a - getAllVariables() 原始数据:', rawVariables);

    // 真正的游戏变量在 stat_data 键下
    const statData = rawVariables?.stat_data as GameVariables;
    dataLogger.log('[variableReader] Step 1b - stat_data 数据:', statData);
    dataLogger.log('[variableReader] Step 1c - stat_data 所有键:', statData ? Object.keys(statData) : []);

    return statData || {};
  } catch (error) {
    dataLogger.error('[variableReader] 获取变量表失败:', error);
    return {};
  }
}

/**
 * 将变量表中的时间转换为 WorldTime 结构
 */
function parseWorldTime(世界信息?: GameVariables['世界信息']): WorldTime | undefined {
  const 时间 = 世界信息?.时间;
  if (!时间) return undefined;

  return {
    year: 时间.年 || 1199,
    month: 时间.月 || 1,
    day: 时间.日 || 1,
    hour: 时间.时 || 12,
  };
}

/**
 * 将时辰字符串转换为小时数
 */
function parseTimeToHour(时辰?: string): number {
  const timeMap: Record<string, number> = {
    子时: 0,
    丑时: 2,
    寅时: 4,
    卯时: 6,
    辰时: 8,
    巳时: 10,
    午时: 12,
    未时: 14,
    申时: 16,
    酉时: 18,
    戌时: 20,
    亥时: 22,
  };
  return 时辰 ? (timeMap[时辰] ?? 12) : 12;
}

/**
 * 将时间转换为游戏显示格式
 */
function formatGameTime(worldTime?: WorldTime): string {
  if (!worldTime) return '未知时间';

  const 天干 = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const 地支 = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const 月份 = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  const 时辰名 = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];

  const yearIndex = (worldTime.year - 4) % 60;
  const ganIndex = yearIndex % 10;
  const zhiIndex = yearIndex % 12;
  const yearName = 天干[ganIndex] + 地支[zhiIndex] + '年';

  const monthName = 月份[(worldTime.month - 1) % 12] || '正月';
  const dayName =
    worldTime.day <= 10
      ? `初${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][worldTime.day - 1]}`
      : worldTime.day <= 20
        ? `${['十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'][worldTime.day - 11]}`
        : worldTime.day <= 30
          ? `${['廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'][worldTime.day - 21]}`
          : '三十';
  const hourName = 时辰名[Math.floor(worldTime.hour / 2) % 12];

  return `${yearName} ${monthName} ${dayName} ${hourName}`;
}

/**
 * 将变量表中的初始属性转换为 InitialAttributes 结构
 * 注意：玩家初始属性包含7维（臂力、根骨、机敏、悟性、洞察、风姿、福缘）
 * 全部从"初始属性"字段读取
 */
function parseInitialAttributes(用户档案?: UserProfile): InitialAttributes {
  const initialAttrs = 用户档案?.初始属性;
  dataLogger.log('[variableReader] Step 4a - 初始属性原始数据:', initialAttrs);
  const result: InitialAttributes = {
    // 从初始属性读取全部7维（使用中文键名）
    臂力: initialAttrs?.臂力 ?? 10,
    根骨: initialAttrs?.根骨 ?? 10,
    机敏: initialAttrs?.机敏 ?? 10,
    悟性: initialAttrs?.悟性 ?? 10,
    洞察: initialAttrs?.洞察 ?? 10,
    风姿: initialAttrs?.风姿 ?? 10,
    福缘: initialAttrs?.福缘 ?? 0,
  };
  dataLogger.log('[variableReader] Step 4b - 初始属性解析结果:', result);
  return result;
}

/**
 * 解析气血/内力字符串格式，提取最大值
 * 支持格式: "当前值/最大值" (如 "800/1000") 或纯数字
 * @returns 最大值（如果是字符串格式返回最大值，否则返回原数字）
 */
function parseResourceValue(value: string | number | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (typeof value === 'number') return value;

  // 尝试解析 "当前值/最大值" 格式
  const parts = value.split('/');
  if (parts.length === 2) {
    const maxValue = parseInt(parts[1], 10);
    if (!isNaN(maxValue)) return maxValue;
  }

  // 尝试直接解析为数字
  const numValue = parseInt(value, 10);
  return isNaN(numValue) ? defaultValue : numValue;
}

/**
 * 将变量表中的当前属性转换为 CurrentAttributes 结构
 * 注意：现在战斗属性和资源属性由前端实时计算，不再从变量中读取
 * 此函数保留用于兼容旧数据，优先使用计算结果
 *
 * 属性说明：
 * - 气血/内力：支持 "当前值/最大值" 字符串格式
 * - 臂力/根骨/机敏/洞察：战斗属性，由前端根据初始属性+境界计算
 * - 悟性：不随境界变化，只存在于初始属性中，此处从初始属性读取
 */
function parseCurrentAttributes(
  用户档案?: UserProfile,
  calculatedCombat?: { 臂力: number; 根骨: number; 机敏: number; 洞察: number },
  calculatedResources?: { 气血上限: number; 内力上限: number },
): CurrentAttributes {
  const attrs = 用户档案?.属性;
  const initialAttrs = 用户档案?.初始属性;
  dataLogger.log('[variableReader] Step 5a - 当前属性原始数据:', attrs);
  dataLogger.log('[variableReader] Step 5b - 计算后的战斗属性:', calculatedCombat);
  dataLogger.log('[variableReader] Step 5c - 计算后的资源属性:', calculatedResources);

  // 解析气血/内力（支持 "当前值/最大值" 格式）
  const hpFromAttrs = parseResourceValue(attrs?.气血, 100);
  const mpFromAttrs = parseResourceValue(attrs?.内力, 50);

  // 优先使用计算结果，如果没有则使用变量中的值或默认值
  // 注意：悟性不随境界变化，只存在于初始属性中
  const result: CurrentAttributes = {
    hp: calculatedResources?.气血上限 ?? hpFromAttrs,
    mp: calculatedResources?.内力上限 ?? mpFromAttrs,
    臂力: calculatedCombat?.臂力 ?? attrs?.臂力 ?? 10,
    根骨: calculatedCombat?.根骨 ?? attrs?.根骨 ?? 10,
    机敏: calculatedCombat?.机敏 ?? attrs?.机敏 ?? 10,
    洞察: calculatedCombat?.洞察 ?? attrs?.洞察 ?? 10,
  };
  dataLogger.log('[variableReader] Step 5d - 当前属性解析结果:', result);
  return result;
}

/**
 * 将变量表中的功法转换为 MartialArt 结构
 * 使用功法数据库补完功法信息
 * 注意：需要过滤掉 $template 模板字段
 */
function parseMartialArts(
  用户档案?: UserProfile,
  currentCultivation: number = 0,
  insight: number = 10,
): Record<string, MartialArt> {
  const 功法 = 用户档案?.功法;
  if (!功法) return {};

  // 准备简化的功法数据（只包含变量中的信息）
  const simpleMartialArtsData: Record<string, SimpleMartialArt> = {};

  for (const [name, art] of Object.entries(功法)) {
    // 过滤掉 $template 模板字段
    if (name.startsWith('$')) continue;

    simpleMartialArtsData[name] = {
      掌握程度: art.掌握程度,
      类型: art.类型,
      功法描述: art.功法描述,
      功法品阶: art.功法品阶,
      特性: art.特性,
    };
  }

  // 使用功法数据库补完
  const completedArts: Record<string, CompleteMartialArt> = completeMartialArts(
    simpleMartialArtsData,
    currentCultivation,
    insight,
  );

  // 转换为 MartialArt 结构
  const result: Record<string, MartialArt> = {};
  for (const [name, completedArt] of Object.entries(completedArts)) {
    result[name] = {
      type: completedArt.type,
      description: completedArt.description,
      rank: completedArt.rank,
      mastery: completedArt.mastery,
      traits: completedArt.traits,
      unlockedTraits: completedArt.unlockedTraits,
      canUpgrade: completedArt.canUpgrade,
      upgradeCost: completedArt.upgradeCost,
      nextMastery: completedArt.nextMastery,
    };
  }

  return result;
}

/**
 * 将用户档案中的包裹转换为 InventoryItem[] 结构
 * 注意：实际变量名是"包裹"而非"背包"，且是对象格式而非数组
 */
function parseInventory(用户档案?: UserProfile): InventoryItem[] {
  const 包裹 = 用户档案?.包裹;
  if (!包裹 || typeof 包裹 !== 'object') return [];

  const result: InventoryItem[] = [];
  let index = 0;

  for (const [name, item] of Object.entries(包裹)) {
    // 过滤掉 $template 模板字段
    if (name.startsWith('$')) continue;

    result.push({
      id: `item_${index++}`,
      name: name,
      type: mapItemType(item.类型),
      quality: mapItemQuality(item.品质),
      count: item.数量 ?? 1,
      description: item.物品描述 || '',
    });
  }

  return result;
}

/**
 * 映射物品类型
 */
function mapItemType(类型?: string): InventoryItem['type'] {
  const typeMap: Record<string, InventoryItem['type']> = {
    秘籍: 'SECRET',
    装备: 'EQUIP',
    兵器: 'EQUIP',
    丹药: 'ELIXIR',
    杂物: 'MISC',
  };
  return typeMap[类型 || ''] || 'MISC';
}

/**
 * 映射物品品质
 */
function mapItemQuality(品质?: string): string {
  const qualityMap: Record<string, string> = {
    凡品: 'WHITE',
    精品: 'GREEN',
    珍品: 'BLUE',
    极品: 'PURPLE',
    绝品: 'GOLD',
    神品: 'RED',
  };
  return qualityMap[品质 || ''] || 'WHITE';
}

/**
 * 将变量表中的事件转换为 GameEvent[] 结构
 */
function parseEvents(事件?: GameVariables['事件']): GameEvent[] {
  if (!事件 || !Array.isArray(事件)) return [];

  return 事件.map((ev, index) => ({
    id: `event_${index}`,
    title: ev.标题 || '未知事件',
    type: mapEventType(ev.类型),
    description: ev.描述 || '',
    details: ev.详情,
  }));
}

/**
 * 映射事件类型
 */
function mapEventType(类型?: string): GameEvent['type'] {
  const typeMap: Record<string, GameEvent['type']> = {
    传闻: 'RUMOR',
    进行中: 'ACTIVE',
    已完成: 'AFTERMATH',
  };
  return typeMap[类型 || ''] || 'ACTIVE';
}

/**
 * 将变量表中的侠缘转换为 NPC[] 结构
 */
function parseSocial(侠缘?: GameVariables['侠缘']): NPC[] {
  if (!侠缘 || !Array.isArray(侠缘)) return [];

  return 侠缘.map((npc, index) => ({
    id: `npc_${index}`,
    name: npc.姓名 || '未知人物',
    relationship: npc.关系值 ?? 0,
    template: {
      type: '江湖人士',
      martialArtsDescription: npc.武功描述 || '',
      martialArtsRank: npc.武功品阶 || '普通',
      mastery: npc.掌握程度 || '入门',
      traits: npc.特性 || {},
    },
    keyItems: npc.重要物品 || [],
    biography: npc.人物经历 || '',
    network: npc.关系网 || [],
  }));
}

/**
 * 角色数据计算后的属性结构
 */
export interface CalculatedCharacterAttributes {
  气血: string; // "当前值/最大值" 格式
  内力: string; // "当前值/最大值" 格式
  臂力: number;
  根骨: number;
  机敏: number;
  洞察: number;
}

/**
 * 根据角色的初始属性、境界和功法计算战斗属性
 * 用于为 NPC 角色生成属性数据
 *
 * @param 角色名 角色名称（用于日志）
 * @param 角色数据 角色的变量数据
 * @returns 计算后的属性对象，格式符合变量表规范
 */
export function calculateCharacterAttributes(角色名: string, 角色数据: CharacterData): CalculatedCharacterAttributes {
  dataLogger.log(`[variableReader] 计算角色属性: ${角色名}`);

  const 初始属性 = 角色数据.初始属性;
  const 境界 = 角色数据.境界 || '不入流';
  const 功法 = 角色数据.功法 || {};

  // 如果没有初始属性，返回默认值
  if (!初始属性) {
    dataLogger.log(`[variableReader] 角色 ${角色名} 没有初始属性，使用默认值`);
    return {
      气血: '100/100',
      内力: '50/50',
      臂力: 10,
      根骨: 10,
      机敏: 10,
      洞察: 10,
    };
  }

  // 构建初始属性对象（5维：臂力、根骨、机敏、悟性、洞察）
  const chineseInitialAttrs: ChineseInitialAttributes = {
    臂力: 初始属性.臂力 ?? 10,
    根骨: 初始属性.根骨 ?? 10,
    机敏: 初始属性.机敏 ?? 10,
    悟性: 初始属性.悟性 ?? 10,
    洞察: 初始属性.洞察 ?? 10,
  };

  // 准备功法计算数据
  const martialArtsForCalc: Record<string, MartialArtForCalculation> = {};
  for (const [name, art] of Object.entries(功法)) {
    if (name.startsWith('$')) continue; // 跳过模板
    martialArtsForCalc[name] = {
      type: art.类型 || '',
      rank: art.功法品阶 || '粗浅',
      mastery: art.掌握程度 || '初窥门径',
    };
  }

  dataLogger.log(`[variableReader] 角色 ${角色名} 初始属性:`, chineseInitialAttrs);
  dataLogger.log(`[variableReader] 角色 ${角色名} 境界:`, 境界);
  dataLogger.log(`[variableReader] 角色 ${角色名} 功法:`, martialArtsForCalc);

  // 使用 attributeCalculator 计算战斗属性和资源属性
  const { combat, resources } = calculateAllAttributes(chineseInitialAttrs, 境界, martialArtsForCalc);

  dataLogger.log(`[variableReader] 角色 ${角色名} 计算后战斗属性:`, combat);
  dataLogger.log(`[variableReader] 角色 ${角色名} 计算后资源属性:`, resources);

  // 返回计算后的属性，使用 "当前值/最大值" 格式
  return {
    气血: `${resources.气血上限}/${resources.气血上限}`,
    内力: `${resources.内力上限}/${resources.内力上限}`,
    臂力: combat.臂力,
    根骨: combat.根骨,
    机敏: combat.机敏,
    洞察: combat.洞察,
  };
}

/**
 * 处理所有角色数据的属性计算
 * 遍历角色数据，为每个有初始属性但缺少战斗属性的角色计算属性
 *
 * @param 角色数据 变量表中的角色数据对象
 * @returns 处理后的角色数据（包含计算后的属性）
 */
export function processCharacterDataAttributes(
  角色数据?: Record<string, CharacterData | unknown>,
): Record<string, CharacterData> {
  if (!角色数据) return {};

  const result: Record<string, CharacterData> = {};

  for (const [角色名, 角色] of Object.entries(角色数据)) {
    // 跳过模板和非对象数据
    if (角色名.startsWith('$') || typeof 角色 !== 'object' || 角色 === null) {
      continue;
    }

    const 角色Data = 角色 as CharacterData;

    // 如果角色有初始属性，则计算战斗属性
    if (角色Data.初始属性) {
      const calculatedAttrs = calculateCharacterAttributes(角色名, 角色Data);

      // 合并计算后的属性到角色数据
      result[角色名] = {
        ...角色Data,
        属性: calculatedAttrs,
      };

      dataLogger.log(`[variableReader] 已为角色 ${角色名} 计算并设置属性`);
    } else {
      // 没有初始属性的角色，保持原样
      result[角色名] = 角色Data;
    }
  }

  return result;
}

/**
 * 属性更新检查结果
 */
interface AttributeUpdateCheck {
  needsUpdate: boolean;
  attributeExists: boolean; // 属性字段是否已存在（用于决定使用 insert 还是 update）
}

/**
 * 检查角色属性是否需要更新
 * 当角色有初始属性但属性为空或全0时返回 true
 *
 * @returns { needsUpdate: boolean, attributeExists: boolean }
 *   - needsUpdate: 是否需要更新属性
 *   - attributeExists: 属性字段是否已存在（用于决定使用 insert 还是 update）
 */
function needsAttributeUpdate(角色Data: CharacterData): AttributeUpdateCheck {
  dataLogger.log('[needsAttributeUpdate] 检查角色是否需要更新属性');
  dataLogger.log('  初始属性:', 角色Data.初始属性);
  dataLogger.log('  当前属性:', 角色Data.属性);

  if (!角色Data.初始属性) {
    dataLogger.log('  结果: false (没有初始属性)');
    return { needsUpdate: false, attributeExists: !!角色Data.属性 };
  }

  const 属性 = 角色Data.属性;
  if (!属性) {
    dataLogger.log('  结果: true (没有属性字段), 使用 insert');
    return { needsUpdate: true, attributeExists: false };
  }

  // 属性字段存在，检查是否全为0或默认值
  const 气血 = typeof 属性.气血 === 'string' ? 属性.气血 : String(属性.气血 ?? '0/0');
  const 内力 = typeof 属性.内力 === 'string' ? 属性.内力 : String(属性.内力 ?? '0/0');

  dataLogger.log('  解析后气血:', 气血);
  dataLogger.log('  解析后内力:', 内力);
  dataLogger.log('  臂力:', 属性.臂力);
  dataLogger.log('  根骨:', 属性.根骨);

  // 如果气血内力是 "0/0" 或数值属性全为0，则需要更新（使用 update，因为属性已存在）
  if (气血 === '0/0' || 气血 === '0') {
    dataLogger.log('  结果: true (气血为0), 使用 update');
    return { needsUpdate: true, attributeExists: true };
  }
  if (内力 === '0/0' || 内力 === '0') {
    dataLogger.log('  结果: true (内力为0), 使用 update');
    return { needsUpdate: true, attributeExists: true };
  }
  if ((属性.臂力 ?? 0) === 0 && (属性.根骨 ?? 0) === 0) {
    dataLogger.log('  结果: true (臂力和根骨都为0), 使用 update');
    return { needsUpdate: true, attributeExists: true };
  }

  dataLogger.log('  结果: false (属性已有有效值)');
  return { needsUpdate: false, attributeExists: true };
}

// 防止重复调用的标记
// 由于属性更新会触发 era:writeDone 事件，
// 而 App.tsx 监听 era:writeDone 后会调用 readGameData()，
// readGameData() 又会调用属性更新函数，需要防止无限循环
let isUpdatingPlayerAttributes = false;
let isUpdatingCharacterAttributes = false;

// ============================================
// 缓存机制：记录上次的角色状态，用于检测变化
// ============================================

/**
 * 角色状态缓存结构
 */
interface CharacterStateCache {
  /** 角色的境界 */
  realm: string;
  /** 是否已存在（用于检测新人物） */
  exists: boolean;
}

/**
 * 功法状态缓存结构
 */
interface MartialArtStateCache {
  /** 掌握程度 */
  mastery: string;
  /** 是否已补全基本信息 */
  isCompleted: boolean;
}

/**
 * 全局缓存：记录所有角色的状态
 * 键格式：
 * - 玩家："玩家"
 * - NPC："角色:{角色名}"
 */
const characterStateCache: Map<string, CharacterStateCache> = new Map();

/**
 * 全局缓存：记录所有功法的状态
 * 键格式："{拥有者}:{功法名}"
 * - 玩家功法："玩家:太极拳"
 * - NPC功法："角色:张三:太极拳"
 */
const martialArtStateCache: Map<string, MartialArtStateCache> = new Map();

/**
 * 获取角色缓存键
 */
function getCharacterCacheKey(isPlayer: boolean, characterName?: string): string {
  return isPlayer ? '玩家' : `角色:${characterName}`;
}

/**
 * 获取功法缓存键
 */
function getMartialArtCacheKey(owner: string, martialArtName: string): string {
  return `${owner}:${martialArtName}`;
}

/**
 * 检查角色是否需要更新（基于缓存对比）
 * 触发条件：
 * 1. 新人物出现（缓存中不存在）
 * 2. 境界变更（缓存中的境界与当前不同）
 *
 * @param cacheKey 缓存键
 * @param 角色Data 角色数据
 * @returns { shouldUpdate: boolean, isNew: boolean, realmChanged: boolean }
 */
function shouldUpdateCharacterByCache(
  cacheKey: string,
  角色Data: CharacterData,
): {
  shouldUpdate: boolean;
  isNew: boolean;
  realmChanged: boolean;
} {
  const currentRealm = 角色Data.境界 || '不入流';
  const cached = characterStateCache.get(cacheKey);

  if (!cached) {
    // 新人物
    dataLogger.log(`[shouldUpdateCharacterByCache] ${cacheKey}: 新人物，需要更新`);
    return { shouldUpdate: true, isNew: true, realmChanged: false };
  }

  if (cached.realm !== currentRealm) {
    // 境界变更
    dataLogger.log(`[shouldUpdateCharacterByCache] ${cacheKey}: 境界变更 ${cached.realm} -> ${currentRealm}，需要更新`);
    return { shouldUpdate: true, isNew: false, realmChanged: true };
  }

  dataLogger.log(`[shouldUpdateCharacterByCache] ${cacheKey}: 无变化，跳过`);
  return { shouldUpdate: false, isNew: false, realmChanged: false };
}

/**
 * 更新角色状态缓存
 */
function updateCharacterCache(cacheKey: string, realm: string): void {
  characterStateCache.set(cacheKey, { realm, exists: true });
  dataLogger.log(`[updateCharacterCache] 已更新缓存: ${cacheKey} -> realm=${realm}`);
}

/**
 * 自动更新玩家数据的战斗属性并写回变量表
 *
 * 触发条件（基于缓存检测）：
 * 1. 新游戏（缓存中不存在玩家数据）
 * 2. 境界变更（缓存中的境界与当前不同）
 *
 * 调用时机：
 * - 在 readGameData() 中读取变量后调用
 * - 监听 MESSAGE_RECEIVED 事件后调用
 *
 * 注意：此函数有防重复调用保护，避免无限循环
 *
 * @param user数据 变量表中的玩家数据对象
 */
export async function autoUpdatePlayerAttributes(user数据?: UserProfile): Promise<void> {
  // 防止重复调用
  if (isUpdatingPlayerAttributes) {
    dataLogger.log('[autoUpdatePlayerAttributes] 正在更新中，跳过重复调用');
    return;
  }

  dataLogger.log('[autoUpdatePlayerAttributes] 开始检查玩家数据...');

  if (!user数据) {
    dataLogger.log('[autoUpdatePlayerAttributes] 玩家数据为空，跳过');
    return;
  }

  // 如果没有初始属性，无法计算战斗属性
  if (!user数据.初始属性) {
    dataLogger.log('[autoUpdatePlayerAttributes] 玩家没有初始属性，跳过');
    return;
  }

  const cacheKey = getCharacterCacheKey(true); // 玩家的缓存键
  const currentRealm = user数据.境界 || '不入流';

  // 使用缓存检测是否需要更新
  const cached = characterStateCache.get(cacheKey);

  // 检查是否需要更新
  let shouldUpdate = false;
  let isNew = false;
  let realmChanged = false;

  if (!cached) {
    // 新玩家数据
    shouldUpdate = true;
    isNew = true;
    dataLogger.log('[autoUpdatePlayerAttributes] 新玩家数据，需要更新');
  } else if (cached.realm !== currentRealm) {
    // 境界变更
    shouldUpdate = true;
    realmChanged = true;
    dataLogger.log(`[autoUpdatePlayerAttributes] 境界变更 ${cached.realm} -> ${currentRealm}，需要更新`);
  } else {
    dataLogger.log('[autoUpdatePlayerAttributes] 玩家境界无变化，跳过');
    return;
  }

  if (!shouldUpdate) {
    return;
  }

  dataLogger.log(`[autoUpdatePlayerAttributes] 需要更新玩家属性 (新玩家=${isNew}, 境界变更=${realmChanged})`);

  // 构建初始属性对象（5维：臂力、根骨、机敏、悟性、洞察）
  const initialAttrs: InitialAttributes = {
    臂力: user数据.初始属性.臂力 ?? 10,
    根骨: user数据.初始属性.根骨 ?? 10,
    机敏: user数据.初始属性.机敏 ?? 10,
    悟性: user数据.初始属性.悟性 ?? 10,
    洞察: user数据.初始属性.洞察 ?? 10,
    风姿: user数据.初始属性.风姿 ?? 10,
    福缘: user数据.初始属性.福缘 ?? 0,
  };

  // 准备功法计算数据
  const martialArtsForCalc: Record<string, MartialArtForCalculation> = {};
  if (user数据.功法) {
    for (const [name, art] of Object.entries(user数据.功法)) {
      if (name.startsWith('$')) continue; // 跳过模板
      martialArtsForCalc[name] = {
        type: art.类型 || '',
        rank: art.功法品阶 || '粗浅',
        mastery: art.掌握程度 || '初窥门径',
      };
    }
  }

  dataLogger.log('[autoUpdatePlayerAttributes] 玩家初始属性:', initialAttrs);
  dataLogger.log('[autoUpdatePlayerAttributes] 玩家境界:', currentRealm);
  dataLogger.log('[autoUpdatePlayerAttributes] 玩家功法:', martialArtsForCalc);

  // 使用 attributeCalculator 计算战斗属性和资源属性
  const { combat, resources } = calculateAllAttributes(initialAttrs, currentRealm, martialArtsForCalc);

  dataLogger.log('[autoUpdatePlayerAttributes] 计算后战斗属性:', combat);
  dataLogger.log('[autoUpdatePlayerAttributes] 计算后资源属性:', resources);

  // 构建属性数据（使用 "当前值/最大值" 格式）
  const calculatedAttrs: CalculatedCharacterAttributes = {
    气血: `${resources.气血上限}/${resources.气血上限}`,
    内力: `${resources.内力上限}/${resources.内力上限}`,
    臂力: combat.臂力,
    根骨: combat.根骨,
    机敏: combat.机敏,
    洞察: combat.洞察,
  };

  // 检查属性字段是否存在
  const attributeExists = !!user数据.属性;

  // 设置防重复标记
  isUpdatingPlayerAttributes = true;

  try {
    // 写入变量表
    const updateData = { user数据: { 属性: calculatedAttrs } };

    if (attributeExists) {
      // 属性已存在，使用 update
      dataLogger.log('[autoUpdatePlayerAttributes] UPDATE 数据:', JSON.stringify(updateData, null, 2));
      eventEmit('era:updateByObject', updateData);
      dataLogger.log('[autoUpdatePlayerAttributes] UPDATE 请求已发送');
    } else {
      // 属性不存在，使用 insert
      dataLogger.log('[autoUpdatePlayerAttributes] INSERT 数据:', JSON.stringify(updateData, null, 2));
      eventEmit('era:insertByObject', updateData);
      dataLogger.log('[autoUpdatePlayerAttributes] INSERT 请求已发送');
    }

    // 等待写入完成
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        dataLogger.log('[autoUpdatePlayerAttributes] 等待超时 (500ms)，继续执行');
        resolve();
      }, 500);
      eventOnce('era:writeDone', () => {
        dataLogger.log('[autoUpdatePlayerAttributes] 收到 era:writeDone 事件');
        clearTimeout(timeout);
        resolve();
      });
    });

    // 更新缓存
    updateCharacterCache(cacheKey, currentRealm);

    dataLogger.log('[autoUpdatePlayerAttributes] 玩家属性更新完成');
  } catch (error) {
    dataLogger.error('[autoUpdatePlayerAttributes] 玩家属性更新失败:', error);
  } finally {
    setTimeout(() => {
      isUpdatingPlayerAttributes = false;
      dataLogger.log('[autoUpdatePlayerAttributes] 防重复标记已清除');
    }, 100);
  }
}

/**
 * 自动更新角色数据的战斗属性并写回变量表
 *
 * 触发条件（基于缓存检测）：
 * 1. 新人物出现（缓存中不存在该角色）
 * 2. 境界变更（缓存中的境界与当前不同）
 *
 * 调用时机：
 * - 在 readGameData() 中读取变量后调用
 * - 监听 MESSAGE_RECEIVED 事件后调用
 *
 * 注意：此函数有防重复调用保护，避免无限循环
 *
 * @param 角色数据 变量表中的角色数据对象
 */
export async function autoUpdateCharacterAttributes(角色数据?: Record<string, CharacterData | unknown>): Promise<void> {
  // 防止重复调用
  if (isUpdatingCharacterAttributes) {
    dataLogger.log('[autoUpdateCharacterAttributes] 正在更新中，跳过重复调用');
    return;
  }

  dataLogger.log('[autoUpdateCharacterAttributes] 开始检查角色数据...');

  if (!角色数据) {
    dataLogger.log('[autoUpdateCharacterAttributes] 角色数据为空，跳过');
    return;
  }

  const allKeys = Object.keys(角色数据);
  dataLogger.log('[autoUpdateCharacterAttributes] 角色数据所有键:', allKeys);

  // ============ 优化：快速缓存预检查 ============
  // 在遍历所有角色之前，先快速检查是否有任何角色需要更新
  // 这样可以避免在没有变化时进行不必要的遍历
  let hasAnyPotentialUpdate = false;

  for (const [角色名, 角色] of Object.entries(角色数据)) {
    // 跳过模板和非对象数据
    if (角色名.startsWith('$')) {
      continue;
    }
    if (typeof 角色 !== 'object' || 角色 === null) {
      continue;
    }

    const 角色Data = 角色 as CharacterData;

    // 没有初始属性的角色无法计算战斗属性
    if (!角色Data.初始属性) {
      continue;
    }

    const cacheKey = getCharacterCacheKey(false, 角色名);
    const currentRealm = 角色Data.境界 || '不入流';
    const cached = characterStateCache.get(cacheKey);

    // 检查是否是新角色或境界发生变化
    if (!cached || cached.realm !== currentRealm) {
      hasAnyPotentialUpdate = true;
      break; // 找到一个需要更新的角色，立即退出预检查
    }
  }

  // 如果没有任何角色需要更新，直接返回
  if (!hasAnyPotentialUpdate) {
    dataLogger.log('[autoUpdateCharacterAttributes] 快速预检查：所有角色境界无变化，跳过更新');

    // 即使没有境界变化，也需要确保缓存已初始化（首次加载场景）
    // 只在缓存为空时才进行完整检查
    if (characterStateCache.size === 0) {
      dataLogger.log('[autoUpdateCharacterAttributes] 缓存为空，进行首次初始化检查');
    } else {
      return; // 缓存已存在且无变化，直接返回
    }
  } else {
    dataLogger.log('[autoUpdateCharacterAttributes] 快速预检查：检测到角色变化，继续完整检查');
  }
  // ============ 优化结束 ============

  // 分别收集需要 insert（属性不存在）和 update（属性存在但需要重算）的角色
  const needsInsert: Array<{ 角色名: string; 属性: CalculatedCharacterAttributes }> = [];
  const needsUpdateList: Array<{ 角色名: string; 属性: CalculatedCharacterAttributes }> = [];

  for (const [角色名, 角色] of Object.entries(角色数据)) {
    // 跳过模板和非对象数据
    if (角色名.startsWith('$')) {
      continue;
    }
    if (typeof 角色 !== 'object' || 角色 === null) {
      continue;
    }

    const 角色Data = 角色 as CharacterData;

    // 没有初始属性的角色无法计算战斗属性
    if (!角色Data.初始属性) {
      continue;
    }

    const cacheKey = getCharacterCacheKey(false, 角色名);

    // 使用缓存检测是否需要更新
    const { shouldUpdate, isNew, realmChanged } = shouldUpdateCharacterByCache(cacheKey, 角色Data);

    if (!shouldUpdate) {
      // 即使不需要通过缓存更新，也要检查属性是否真的存在且有效
      // 这是为了处理首次加载时缓存为空但属性已存在的情况
      const checkResult = needsAttributeUpdate(角色Data);
      if (!checkResult.needsUpdate) {
        // 属性已经存在且有效，更新缓存并跳过
        updateCharacterCache(cacheKey, 角色Data.境界 || '不入流');
        continue;
      }
      // 属性需要更新（可能是第一次加载，属性为空或全0）
      dataLogger.log(`[autoUpdateCharacterAttributes] 角色 ${角色名}: 首次加载，属性需要初始化`);
    }

    dataLogger.log(
      `[autoUpdateCharacterAttributes] 角色 ${角色名}: 需要更新属性 (新人物=${isNew}, 境界变更=${realmChanged})`,
    );

    // 计算战斗属性
    const calculatedAttrs = calculateCharacterAttributes(角色名, 角色Data);

    // 检查属性字段是否存在，决定使用 insert 还是 update
    const checkResult = needsAttributeUpdate(角色Data);

    if (checkResult.attributeExists) {
      // 属性已存在，使用 update（境界变更场景）
      needsUpdateList.push({ 角色名, 属性: calculatedAttrs });
      dataLogger.log(`[autoUpdateCharacterAttributes] 角色 ${角色名}: 添加到 UPDATE 队列`);
    } else {
      // 属性不存在，使用 insert（新人物场景）
      needsInsert.push({ 角色名, 属性: calculatedAttrs });
      dataLogger.log(`[autoUpdateCharacterAttributes] 角色 ${角色名}: 添加到 INSERT 队列`);
    }

    // 更新缓存
    updateCharacterCache(cacheKey, 角色Data.境界 || '不入流');
  }

  const totalNeedsUpdate = needsInsert.length + needsUpdateList.length;

  // 如果有需要更新的角色，批量写入变量表
  if (totalNeedsUpdate > 0) {
    dataLogger.log(`[autoUpdateCharacterAttributes] 检测到 ${totalNeedsUpdate} 个角色需要更新属性`);
    dataLogger.log(`  - 需要 INSERT（属性不存在）: ${needsInsert.length} 个`);
    dataLogger.log(`  - 需要 UPDATE（属性已存在）: ${needsUpdateList.length} 个`);

    // 设置防重复标记，避免写入触发的 era:writeDone 事件导致无限循环
    isUpdatingCharacterAttributes = true;

    try {
      // 1. 处理需要 INSERT 的角色（属性不存在）
      if (needsInsert.length > 0) {
        const insertData: Record<string, unknown> = { 角色数据: {} as Record<string, unknown> };
        for (const { 角色名, 属性 } of needsInsert) {
          (insertData.角色数据 as Record<string, unknown>)[角色名] = { 属性 };
        }
        dataLogger.log('[autoUpdateCharacterAttributes] INSERT 数据:', JSON.stringify(insertData, null, 2));
        eventEmit('era:insertByObject', insertData);
        dataLogger.log('[autoUpdateCharacterAttributes] INSERT 请求已发送');
      }

      // 2. 处理需要 UPDATE 的角色（属性已存在但需要重算）
      if (needsUpdateList.length > 0) {
        const updateData: Record<string, unknown> = { 角色数据: {} as Record<string, unknown> };
        for (const { 角色名, 属性 } of needsUpdateList) {
          (updateData.角色数据 as Record<string, unknown>)[角色名] = { 属性 };
        }
        dataLogger.log('[autoUpdateCharacterAttributes] UPDATE 数据:', JSON.stringify(updateData, null, 2));
        eventEmit('era:updateByObject', updateData);
        dataLogger.log('[autoUpdateCharacterAttributes] UPDATE 请求已发送');
      }

      // 等待写入完成
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          dataLogger.log('[autoUpdateCharacterAttributes] 等待超时 (500ms)，继续执行');
          resolve();
        }, 500);
        eventOnce('era:writeDone', () => {
          dataLogger.log('[autoUpdateCharacterAttributes] 收到 era:writeDone 事件');
          clearTimeout(timeout);
          resolve();
        });
      });

      dataLogger.log('[autoUpdateCharacterAttributes] 角色属性更新完成');
    } catch (error) {
      dataLogger.error('[autoUpdateCharacterAttributes] 角色属性更新失败:', error);
    } finally {
      setTimeout(() => {
        isUpdatingCharacterAttributes = false;
        dataLogger.log('[autoUpdateCharacterAttributes] 防重复标记已清除');
      }, 100);
    }
  } else {
    dataLogger.log('[autoUpdateCharacterAttributes] 没有需要更新的角色（无变化）');
  }
}

// ============================================
// 功法补全逻辑
// ============================================

/**
 * 功法补全需要更新的数据结构
 */
interface MartialArtUpdateData {
  类型: string;
  功法描述: string;
  功法品阶: string;
  掌握程度: string;
  特性: Record<string, string>;
}

/**
 * 功法更新类型
 */
type MartialArtUpdateType = 'insert' | 'update' | 'none';

/**
 * 检查单个功法的更新需求
 * - 'insert': 缺少类型、描述、品阶等基本字段，需要用 insert 补全
 * - 'update': 基本字段已存在，但特性数量可能需要根据掌握程度更新
 * - 'none': 不需要更新
 *
 * @param 功法数据 变量中的功法数据
 * @param 功法名 功法名称（用于从数据库查询）
 * @returns 更新类型
 */
function checkMartialArtUpdateType(功法数据: SimpleMartialArt, 功法名: string): MartialArtUpdateType {
  // 如果缺少类型或功法品阶或功法描述，说明需要补全（用 insert）
  if (!功法数据.类型 || !功法数据.功法品阶 || !功法数据.功法描述) {
    return 'insert';
  }

  // 检查特性是否需要更新
  // 当掌握程度上升后，需要解锁新的特性
  const dbData = getMartialArtData(功法名);
  if (!dbData) return 'none';

  const 掌握程度 = 功法数据.掌握程度 || '初窥门径';
  const allTraits = dbData.特性 || {};
  const MASTERY_LEVELS = ['初窥门径', '略有小成', '融会贯通', '炉火纯青', '出神入化'];
  const masteryIndex = MASTERY_LEVELS.indexOf(掌握程度);

  // 计算应该解锁的特性数量
  let expectedTraitCount = 0;
  for (const traitMastery of Object.keys(allTraits)) {
    const traitMasteryIndex = MASTERY_LEVELS.indexOf(traitMastery);
    if (traitMasteryIndex >= 0 && traitMasteryIndex <= masteryIndex) {
      expectedTraitCount++;
    }
  }

  // 当前特性数量
  const currentTraitCount = 功法数据.特性 ? Object.keys(功法数据.特性).length : 0;

  // 如果当前特性数量少于应解锁的特性数量，需要更新
  if (currentTraitCount < expectedTraitCount) {
    return 'update';
  }

  return 'none';
}

/**
 * 根据功法数据库补全功法信息
 *
 * @param 功法名 功法名称
 * @param 功法数据 变量中的简化功法数据
 * @returns 补全后的功法数据，如果数据库中没有此功法则返回 null
 */
function completeMartialArtFromDatabase(功法名: string, 功法数据: SimpleMartialArt): MartialArtUpdateData | null {
  const dbData = getMartialArtData(功法名);

  if (!dbData) {
    dataLogger.log(`[completeMartialArtFromDatabase] 功法数据库中没有: ${功法名}`);
    return null;
  }

  // 保留变量中的掌握程度，其他从数据库补全
  const 掌握程度 = 功法数据.掌握程度 || '初窥门径';

  // 获取已解锁的特性（根据掌握程度）
  const allTraits = dbData.特性 || {};
  const MASTERY_LEVELS = ['初窥门径', '略有小成', '融会贯通', '炉火纯青', '出神入化'];
  const masteryIndex = MASTERY_LEVELS.indexOf(掌握程度);
  const unlockedTraits: Record<string, string> = {};

  for (const [traitMastery, traitDesc] of Object.entries(allTraits)) {
    const traitMasteryIndex = MASTERY_LEVELS.indexOf(traitMastery);
    // 只包含已解锁的特性
    if (traitMasteryIndex >= 0 && traitMasteryIndex <= masteryIndex) {
      unlockedTraits[traitMastery] = traitDesc;
    }
  }

  return {
    类型: dbData.类型,
    功法描述: dbData.功法描述,
    功法品阶: dbData.功法品阶,
    掌握程度,
    特性: unlockedTraits,
  };
}

// 防止 autoUpdateMartialArts 重复调用的标记
let isUpdatingMartialArts = false;

/**
 * 检查功法是否需要更新（基于缓存对比）
 * 触发条件：
 * 1. 新增功法（缓存中不存在）
 * 2. 掌握程度变动（缓存中的掌握程度与当前不同）
 *
 * @param cacheKey 缓存键
 * @param 功法数据 功法数据
 * @param 功法名 功法名称
 * @returns { shouldUpdate: boolean, isNew: boolean, masteryChanged: boolean, updateType: MartialArtUpdateType }
 */
function shouldUpdateMartialArtByCache(
  cacheKey: string,
  功法数据: SimpleMartialArt,
  功法名: string,
): {
  shouldUpdate: boolean;
  isNew: boolean;
  masteryChanged: boolean;
  updateType: MartialArtUpdateType;
} {
  const currentMastery = 功法数据.掌握程度 || '初窥门径';
  const isCompleted = !!(功法数据.类型 && 功法数据.功法品阶 && 功法数据.功法描述);
  const cached = martialArtStateCache.get(cacheKey);
  
  if (!cached) {
    // 新功法
    const updateType = checkMartialArtUpdateType(功法数据, 功法名);
    dataLogger.log(`[shouldUpdateMartialArtByCache] ${cacheKey}: 新功法，更新类型=${updateType}`);
    return { shouldUpdate: updateType !== 'none', isNew: true, masteryChanged: false, updateType };
  }
  
  if (!cached.isCompleted && !isCompleted) {
    // 之前未补全，现在仍需补全
    dataLogger.log(`[shouldUpdateMartialArtByCache] ${cacheKey}: 仍需补全`);
    return { shouldUpdate: true, isNew: false, masteryChanged: false, updateType: 'insert' };
  }
  
  if (cached.mastery !== currentMastery) {
    // 掌握程度变动
    dataLogger.log(`[shouldUpdateMartialArtByCache] ${cacheKey}: 掌握程度变动 ${cached.mastery} -> ${currentMastery}`);
    return { shouldUpdate: true, isNew: false, masteryChanged: true, updateType: 'update' };
  }
  
  dataLogger.log(`[shouldUpdateMartialArtByCache] ${cacheKey}: 无变化，跳过`);
  return { shouldUpdate: false, isNew: false, masteryChanged: false, updateType: 'none' };
}

/**
 * 更新功法状态缓存
 */
function updateMartialArtCache(cacheKey: string, mastery: string, isCompleted: boolean): void {
  martialArtStateCache.set(cacheKey, { mastery, isCompleted });
  dataLogger.log(`[updateMartialArtCache] 已更新缓存: ${cacheKey} -> mastery=${mastery}, isCompleted=${isCompleted}`);
}

/**
 * 自动补全/更新功法信息并写回变量表
 *
 * 触发条件（基于缓存检测）：
 * 1. 新增功法（缓存中不存在该功法）
 * 2. 掌握程度变动（缓存中的掌握程度与当前不同，需要更新特性）
 *
 * 两种操作：
 * 1. 补全（insert）: 功法只有掌握程度，缺少类型、描述、品阶、特性 -> 用 era:insertByObject
 * 2. 更新（update）: 掌握程度上升后，特性需要增加 -> 用 era:updateByObject
 *
 * @param 玩家功法 user数据中的功法对象
 * @param 角色数据 角色数据对象（包含所有NPC）
 */
export async function autoUpdateMartialArts(
  玩家功法?: Record<string, SimpleMartialArt>,
  角色数据?: Record<string, CharacterData | unknown>,
): Promise<void> {
  // 防止重复调用
  if (isUpdatingMartialArts) {
    dataLogger.log('[autoUpdateMartialArts] 正在更新中，跳过重复调用');
    return;
  }

  dataLogger.log('[autoUpdateMartialArts] 开始检查功法数据...');

  // 确保功法数据库已加载
  const dbLoaded = await loadMartialArtsDatabase();
  if (!dbLoaded) {
    dataLogger.log('[autoUpdateMartialArts] 功法数据库加载失败，跳过补全');
    return;
  }

  // 分别收集需要 insert（补全）和 update（更新特性）的功法
  const insertData: {
    user数据?: { 功法: Record<string, MartialArtUpdateData> };
    角色数据?: Record<string, { 功法: Record<string, MartialArtUpdateData> }>;
  } = {};

  const updateData: {
    user数据?: { 功法: Record<string, Partial<MartialArtUpdateData>> };
    角色数据?: Record<string, { 功法: Record<string, Partial<MartialArtUpdateData>> }>;
  } = {};

  let needsInsert = false;
  let needsUpdate = false;

  // 1. 检查玩家功法
  if (玩家功法) {
    const 玩家功法Insert: Record<string, MartialArtUpdateData> = {};
    const 玩家功法Update: Record<string, Partial<MartialArtUpdateData>> = {};

    for (const [功法名, 功法数据] of Object.entries(玩家功法)) {
      if (功法名.startsWith('$')) continue; // 跳过模板

      const cacheKey = getMartialArtCacheKey('玩家', 功法名);
      const { shouldUpdate, isNew, masteryChanged, updateType } = shouldUpdateMartialArtByCache(cacheKey, 功法数据, 功法名);
      
      if (!shouldUpdate) {
        // 无需更新，但要确保缓存是最新的
        const isCompleted = !!(功法数据.类型 && 功法数据.功法品阶 && 功法数据.功法描述);
        updateMartialArtCache(cacheKey, 功法数据.掌握程度 || '初窥门径', isCompleted);
        continue;
      }

      dataLogger.log(`[autoUpdateMartialArts] 玩家功法 ${功法名}: 需要处理 (新增=${isNew}, 掌握程度变动=${masteryChanged}, 操作=${updateType})`);

      if (updateType === 'insert') {
        const completedData = completeMartialArtFromDatabase(功法名, 功法数据);
        if (completedData) {
          玩家功法Insert[功法名] = completedData;
          needsInsert = true;
          // 更新缓存
          updateMartialArtCache(cacheKey, completedData.掌握程度, true);
        }
      } else if (updateType === 'update') {
        const completedData = completeMartialArtFromDatabase(功法名, 功法数据);
        if (completedData) {
          玩家功法Update[功法名] = { 特性: completedData.特性 };
          needsUpdate = true;
          // 更新缓存
          updateMartialArtCache(cacheKey, completedData.掌握程度, true);
        }
      }
    }

    if (Object.keys(玩家功法Insert).length > 0) {
      insertData.user数据 = { 功法: 玩家功法Insert };
    }
    if (Object.keys(玩家功法Update).length > 0) {
      updateData.user数据 = { 功法: 玩家功法Update };
    }
  }

  // 2. 检查角色功法
  if (角色数据) {
    const 角色功法Insert: Record<string, { 功法: Record<string, MartialArtUpdateData> }> = {};
    const 角色功法Update: Record<string, { 功法: Record<string, Partial<MartialArtUpdateData>> }> = {};

    for (const [角色名, 角色] of Object.entries(角色数据)) {
      if (角色名.startsWith('$') || typeof 角色 !== 'object' || 角色 === null) continue;

      const 角色Data = 角色 as CharacterData;
      if (!角色Data.功法) continue;

      const 该角色功法Insert: Record<string, MartialArtUpdateData> = {};
      const 该角色功法Update: Record<string, Partial<MartialArtUpdateData>> = {};

      for (const [功法名, 功法数据] of Object.entries(角色Data.功法)) {
        if (功法名.startsWith('$')) continue;

        const cacheKey = getMartialArtCacheKey(`角色:${角色名}`, 功法名);
        const { shouldUpdate, isNew, masteryChanged, updateType } = shouldUpdateMartialArtByCache(cacheKey, 功法数据, 功法名);
        
        if (!shouldUpdate) {
          // 无需更新，但要确保缓存是最新的
          const isCompleted = !!(功法数据.类型 && 功法数据.功法品阶 && 功法数据.功法描述);
          updateMartialArtCache(cacheKey, 功法数据.掌握程度 || '初窥门径', isCompleted);
          continue;
        }

        dataLogger.log(`[autoUpdateMartialArts] 角色 ${角色名} 功法 ${功法名}: 需要处理 (新增=${isNew}, 掌握程度变动=${masteryChanged}, 操作=${updateType})`);

        if (updateType === 'insert') {
          const completedData = completeMartialArtFromDatabase(功法名, 功法数据);
          if (completedData) {
            该角色功法Insert[功法名] = completedData;
            needsInsert = true;
            updateMartialArtCache(cacheKey, completedData.掌握程度, true);
          }
        } else if (updateType === 'update') {
          const completedData = completeMartialArtFromDatabase(功法名, 功法数据);
          if (completedData) {
            该角色功法Update[功法名] = { 特性: completedData.特性 };
            needsUpdate = true;
            updateMartialArtCache(cacheKey, completedData.掌握程度, true);
          }
        }
      }

      if (Object.keys(该角色功法Insert).length > 0) {
        角色功法Insert[角色名] = { 功法: 该角色功法Insert };
      }
      if (Object.keys(该角色功法Update).length > 0) {
        角色功法Update[角色名] = { 功法: 该角色功法Update };
      }
    }

    if (Object.keys(角色功法Insert).length > 0) {
      insertData.角色数据 = 角色功法Insert;
    }
    if (Object.keys(角色功法Update).length > 0) {
      updateData.角色数据 = 角色功法Update;
    }
  }

  // 如果有需要处理的功法，写入变量表
  if (needsInsert || needsUpdate) {
    dataLogger.log('[autoUpdateMartialArts] 需要处理功法数据...');
    dataLogger.log(`  - 需要 INSERT（补全）: ${needsInsert}`);
    dataLogger.log(`  - 需要 UPDATE（更新特性）: ${needsUpdate}`);

    isUpdatingMartialArts = true;

    try {
      // 1. 处理需要补全的功法
      if (needsInsert) {
        dataLogger.log('[autoUpdateMartialArts] INSERT 数据:', JSON.stringify(insertData, null, 2));
        eventEmit('era:insertByObject', insertData);
        dataLogger.log('[autoUpdateMartialArts] 功法补全(insert)请求已发送');
      }

      // 2. 处理需要更新特性的功法
      if (needsUpdate) {
        dataLogger.log('[autoUpdateMartialArts] UPDATE 数据:', JSON.stringify(updateData, null, 2));
        eventEmit('era:updateByObject', updateData);
        dataLogger.log('[autoUpdateMartialArts] 功法更新(update)请求已发送');
      }

      // 等待写入完成
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          dataLogger.log('[autoUpdateMartialArts] 等待超时 (500ms)，继续执行');
          resolve();
        }, 500);
        eventOnce('era:writeDone', () => {
          dataLogger.log('[autoUpdateMartialArts] 收到 era:writeDone 事件');
          clearTimeout(timeout);
          resolve();
        });
      });

      dataLogger.log('[autoUpdateMartialArts] 功法处理完成');
    } catch (error) {
      dataLogger.error('[autoUpdateMartialArts] 功法处理失败:', error);
    } finally {
      setTimeout(() => {
        isUpdatingMartialArts = false;
        dataLogger.log('[autoUpdateMartialArts] 防重复标记已清除');
      }, 100);
    }
  } else {
    dataLogger.log('[autoUpdateMartialArts] 没有需要处理的功法（无变化）');
  }
}

/**
 * 从酒馆变量表读取游戏数据
 * 使用 getAllVariables() API 获取合并后的变量
 *
 * 注意：此函数会自动检测并更新角色数据中缺失的战斗属性
 */
export async function readGameData(): Promise<Partial<GameState> | null> {
  dataLogger.log('[variableReader] ====== 开始读取游戏数据 ======');
  try {
    const variables = getGameVariables();

    // 如果变量表为空，返回 null
    if (Object.keys(variables).length === 0) {
      dataLogger.log('[variableReader] 变量表为空，返回 null');
      return null;
    }

    // 自动更新玩家数据中缺失的战斗属性
    if (variables.user数据) {
      await autoUpdatePlayerAttributes(variables.user数据);
    }

    // 自动更新角色数据中缺失的战斗属性
    // 这会检测有初始属性但缺少战斗属性的角色，并自动计算写入
    if (variables.角色数据) {
      await autoUpdateCharacterAttributes(variables.角色数据);
    }

    // 自动补全功法信息
    // 检测只有掌握程度、缺少其他信息的功法，从数据库补全
    const 玩家功法 = variables.user数据?.功法;
    if (玩家功法 || variables.角色数据) {
      await autoUpdateMartialArts(玩家功法, variables.角色数据);
    }

    const result = mapVariablesToGameState(variables);
    dataLogger.log('[variableReader] Step 7 - 最终 GameState:', result);
    dataLogger.log('[variableReader] ====== 读取完成 ======');
    return result;
  } catch (error) {
    dataLogger.error('[variableReader] 读取游戏数据失败:', error);
    return null;
  }
}

/**
 * 同步版本的 readGameData，用于不支持异步的场景
 * 注意：此版本不会自动更新角色属性
 * @deprecated 建议使用异步版本 readGameData()
 */
export function readGameDataSync(): Partial<GameState> | null {
  dataLogger.log('[variableReader] ====== 开始读取游戏数据 (同步) ======');
  try {
    const variables = getGameVariables();

    // 如果变量表为空，返回 null
    if (Object.keys(variables).length === 0) {
      dataLogger.log('[variableReader] 变量表为空，返回 null');
      return null;
    }

    const result = mapVariablesToGameState(variables);
    dataLogger.log('[variableReader] Step 7 - 最终 GameState:', result);
    dataLogger.log('[variableReader] ====== 读取完成 ======');
    return result;
  } catch (error) {
    dataLogger.error('[variableReader] 读取游戏数据失败:', error);
    return null;
  }
}

/**
 * 从变量表中查找用户档案
 * user数据采用扁平结构，用户名和其他属性同级存储在 user数据 下
 */
function findUserProfile(variables: GameVariables): { name: string; profile: UserProfile } | null {
  dataLogger.log('[variableReader] Step 2 - 开始查找用户档案');
  dataLogger.log('[variableReader] Step 2a - 变量表所有键:', Object.keys(variables));

  // user数据采用扁平结构，直接检查 user数据 对象
  const user数据 = variables.user数据;
  if (user数据) {
    dataLogger.log('[variableReader] Step 2b - user数据键:', Object.keys(user数据));

    // 扁平结构：用户名和其他属性同级
    // 通过检查特征字段来判断是否是user数据
    if ('性别' in user数据 || '属性' in user数据 || '功法' in user数据 || '境界' in user数据) {
      const userName = user数据.用户名 || '少侠';
      dataLogger.log(`[variableReader] Step 2c - 找到user数据! 用户名: "${userName}"`);
      dataLogger.log('[variableReader] Step 2d - user数据内容:', user数据);
      return { name: userName, profile: user数据 as UserProfile };
    }
  }

  dataLogger.log('[variableReader] Step 2e - 未找到用户档案');
  return null;
}

/**
 * 将变量表映射到 GameState 结构
 */
function mapVariablesToGameState(variables: GameVariables): Partial<GameState> {
  dataLogger.log('[variableReader] Step 3 - 开始映射变量到 GameState');

  const worldTime = parseWorldTime(variables.世界信息);
  dataLogger.log('[variableReader] Step 3a - 世界时间:', worldTime);

  // 动态查找用户档案（从user数据下查找）
  const userInfo = findUserProfile(variables);
  const userName = userInfo?.name || '少侠';
  const 用户档案 = userInfo?.profile;

  dataLogger.log('[variableReader] Step 3b - 用户名:', userName);
  dataLogger.log('[variableReader] Step 3c - 用户档案存在:', !!用户档案);

  const state: Partial<GameState> = {};

  // 基础信息 - 玩家位置从 user数据.[用户名].所在位置 读取
  state.currentLocation = 用户档案?.所在位置 || '未知位置';
  state.worldTime = worldTime;
  state.gameTime = formatGameTime(worldTime);

  // 角色信息
  if (用户档案) {
    dataLogger.log('[variableReader] Step 4 - 解析角色信息');
    dataLogger.log('[variableReader] Step 4-境界:', 用户档案.境界);
    dataLogger.log('[variableReader] Step 4-修为:', 用户档案.修为);

    // 解析初始属性
    const initialAttrs = parseInitialAttributes(用户档案);

    // 解析功法（用于属性计算）
    const martialArts = parseMartialArts(用户档案, 用户档案.修为 ?? 0, 用户档案.初始属性?.洞察 ?? 10);

    // 准备功法计算数据
    const martialArtsForCalc: Record<string, MartialArtForCalculation> = {};
    for (const [name, art] of Object.entries(martialArts)) {
      martialArtsForCalc[name] = {
        type: art.type,
        rank: art.rank,
        mastery: art.mastery,
      };
    }

    // 使用 attributeCalculator 计算战斗属性和资源属性
    // initialAttrs 已经是中文键名的 InitialAttributes
    const realm = 用户档案.境界 || '不入流';

    dataLogger.log('[variableReader] Step 4a - 开始计算属性');
    dataLogger.log('[variableReader] Step 4b - 初始属性:', initialAttrs);
    dataLogger.log('[variableReader] Step 4c - 境界:', realm);
    dataLogger.log('[variableReader] Step 4d - 功法计算数据:', martialArtsForCalc);

    const { combat, resources } = calculateAllAttributes(initialAttrs, realm, martialArtsForCalc);

    dataLogger.log('[variableReader] Step 4e - 计算后的战斗属性:', combat);
    dataLogger.log('[variableReader] Step 4f - 计算后的资源属性:', resources);

    state.stats = {
      name: userName,
      gender: 用户档案.性别 || '未知',
      appearance: 用户档案.外貌 || '',
      birthYear: 用户档案.出生年份 || (worldTime ? worldTime.year - 20 : 1179),
      status: 用户档案.状态 || '健康',
      realm: realm,
      cultivation: 用户档案.修为 ?? 0,
      location: 用户档案.所在位置 || '未知位置',
      identities: 用户档案.身份 || {},
      martialArts: martialArts,
      initialAttributes: initialAttrs,
      attributes: parseCurrentAttributes(用户档案, combat, resources),
      biography: 用户档案.人物经历 || '',
      network: 用户档案.关系网 || {},
    };

    dataLogger.log('[variableReader] Step 6 - 最终 stats:', state.stats);

    // 背包（从用户档案中的包裹字段读取）
    state.inventory = parseInventory(用户档案);
  } else {
    dataLogger.log('[variableReader] 用户档案不存在，使用空背包');
    state.inventory = [];
  }

  // 事件 - 从事件系统读取（需要转换格式）
  state.events = [];

  // 社交
  state.social = parseSocial(variables.侠缘);

  return state;
}

/**
 * 检查是否有保存的游戏存档
 *
 * 检测逻辑：
 * 1. 首先检查是否存在 assistant 消息
 * 2. 然后检查变量表中是否存在user数据的特征字段（性别、境界、用户名等）
 *
 * 只有同时满足两个条件才认为是有效存档
 */
export function hasSavedGame(): boolean {
  dataLogger.log('');
  dataLogger.log('🔍 [hasSavedGame] 检查是否存在存档');

  try {
    // 第一步：检查是否存在 assistant 消息
    dataLogger.log('   [Step 1] 检查 assistant 消息...');
    const messages = getChatMessages(-1, { role: 'assistant' });
    dataLogger.log('   获取到 assistant 消息数量:', messages.length);

    if (messages.length === 0) {
      dataLogger.log('⚠️ [hasSavedGame] 没有 assistant 消息，返回 false');
      return false;
    }

    // 第二步：检查变量表中是否存在有效的user数据
    dataLogger.log('   [Step 2] 检查user数据变量...');
    const variables = getGameVariables();
    dataLogger.log('   变量表键:', Object.keys(variables));

    const user数据 = variables.user数据;
    if (!user数据) {
      dataLogger.log('⚠️ [hasSavedGame] 变量表中没有user数据，返回 false');
      return false;
    }

    dataLogger.log('   user数据键:', Object.keys(user数据));

    // 检查user数据中是否存在特征字段
    // 这些字段是在开局时由 gameInitializer 创建的
    const hasGender = '性别' in user数据 && user数据.性别;
    const hasRealm = '境界' in user数据 && user数据.境界;
    const hasAttributes = '属性' in user数据 || '初始属性' in user数据;
    const hasUserName = '用户名' in user数据 && user数据.用户名;

    dataLogger.log('   特征字段检测:');
    dataLogger.log('     - 性别:', hasGender ? `"${user数据.性别}"` : '无');
    dataLogger.log('     - 境界:', hasRealm ? `"${user数据.境界}"` : '无');
    dataLogger.log('     - 属性:', hasAttributes ? '存在' : '无');
    dataLogger.log('     - 用户名:', hasUserName ? `"${user数据.用户名}"` : '无');

    // 至少需要存在性别或境界或用户名中的一个特征字段
    const hasValidPlayerData = hasGender || hasRealm || hasUserName;

    if (hasValidPlayerData) {
      dataLogger.log('✅ [hasSavedGame] 检测到有效user数据，返回 true');
      return true;
    } else {
      dataLogger.log('⚠️ [hasSavedGame] user数据不完整（缺少特征字段），返回 false');
      return false;
    }
  } catch (error) {
    dataLogger.error('❌ [hasSavedGame] 检查存档失败:', error);
    return false;
  }
}

/**
 * 获取最后一条消息的内容
 */
export function getLastMessageContent(): string {
  dataLogger.log('');
  dataLogger.log('📨 [getLastMessageContent] 获取最后一条消息');

  try {
    dataLogger.log('   调用 getChatMessages(-1, { role: "assistant" })...');
    const messages = getChatMessages(-1, { role: 'assistant' }) as TavernChatMessage[];

    dataLogger.log('   获取到消息数量:', messages.length);

    if (messages.length === 0) {
      dataLogger.log('⚠️ [getLastMessageContent] 没有 assistant 消息');
      return '';
    }

    const lastMessage = messages[messages.length - 1];
    dataLogger.log('   最后一条消息信息:');
    dataLogger.log('     - message_id:', lastMessage.message_id);
    dataLogger.log('     - name:', lastMessage.name);
    dataLogger.log('     - role:', lastMessage.role);
    dataLogger.log('     - is_hidden:', lastMessage.is_hidden);
    dataLogger.log('     - message 长度:', lastMessage.message?.length || 0);
    dataLogger.log('     - message 前 300 字符:', lastMessage.message?.substring(0, 300) || '(无内容)');
    dataLogger.log('     - data:', lastMessage.data);
    dataLogger.log('     - extra:', lastMessage.extra);

    const result = lastMessage.message || '';
    dataLogger.log('✅ [getLastMessageContent] 返回内容长度:', result.length);
    return result;
  } catch (error) {
    dataLogger.error('❌ [getLastMessageContent] 获取消息失败:', error);
    return '';
  }
}

/**
 * 解析消息中的变量数据（保留兼容性）
 * 支持 MVU 格式的变量块
 */
export function parseVariables(messageContent: string): Record<string, unknown> | null {
  try {
    // 尝试解析 MVU 格式的变量块
    const mvuMatch = messageContent.match(/<mvu>([\s\S]*?)<\/mvu>/i);
    if (mvuMatch) {
      return YAML.parse(mvuMatch[1]);
    }

    // 尝试解析 JSON 格式的变量块
    const jsonMatch = messageContent.match(/<variables>([\s\S]*?)<\/variables>/i);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    return null;
  } catch (error) {
    dataLogger.error('解析变量失败:', error);
    return null;
  }
}
