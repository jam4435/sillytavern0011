/**
 * 酒馆变量读取工具
 * 用于从酒馆环境中读取和解析游戏状态数据
 *
 * 使用酒馆助手提供的 getAllVariables() API 获取合并后的变量表
 * - 在消息楼层 iframe 中调用: 获取 全局→角色卡→聊天→0号消息楼层→中间所有消息楼层→当前消息楼层 的合并结果
 * - 在全局变量 iframe 中调用: 获取 全局→角色卡→脚本→聊天→0号消息楼层→中间所有消息楼层→最新消息楼层 的合并结果
 */

import type {
  ActiveStatusEffect,
  ActiveStatusEffectVariableData,
  ChronicleEntry,
  CurrentAttributes,
  EquipmentSlots,
  FrontendVariableData,
  GameEvent,
  GameState,
  InitialAttributes,
  InventoryAttributeModifierMap,
  InventoryItem,
  InventoryItemVariableData,
  MartialArt,
  NPC,
  WorldEventVariableData,
  WorldTime,
} from '../types';

import {
  calculateAllAttributes,
  type AttributeModifierSource,
  type MartialArtForCalculation,
} from './attributeCalculator';
import {
  completeMartialArts,
  getMartialArtData,
  loadMartialArtsDatabase,
  type CompleteMartialArt,
  type SimpleMartialArt,
} from './martialArtsDatabase';
import { unescapeEraData } from '../../ERA变量框架/utils/data';
import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { isHistoryCheckoutPending } from '../../shared/historyCheckoutJournal';
import { isChatRenamePending } from '../../shared/chatRenameJournal';
import { getLocationScopePath } from '../../shared/locationPath.js';
import { wuxiaCalendarDateToTotalDays } from '../../shared/wuxiaCalendar.js';
import { dataLogger } from './logger';
import { buildMeridianProjection, deriveMeridianModifiers } from './meridianSystem';

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
  用户名?: string;
  性别?: string;
  /** @deprecated 仅供头像变量 v1 迁移读取。 */
  头像?: string;
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
  包裹?: Record<string, InventoryItemVariableData>;
  装备栏?: EquipmentSlots;
  状态效果?: Record<string, ActiveStatusEffectVariableData>;
  人物经历?: Record<string, string> | string;
  关系网?: Record<string, string>;
  $meta?: unknown; // ERA 元数据，忽略
}

/**
 * 角色数据结构类型定义（NPC）
 */
interface CharacterData {
  性别?: string;
  /** @deprecated 仅供头像变量 v1 迁移读取。 */
  头像?: string;
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
 * 根据当前项目使用的聊天级 stat_data 结构定义
 */
interface GameVariables {
  // 世界信息
  世界信息?: {
    时间?: {
      年?: number;
      月?: number;
      日?: number;
      时?: number;
      分?: number;
    };
  };

  // user数据（扁平结构，用户名和其他属性同级）
  user数据?: UserProfile & { 用户名?: string };

  前端变量?: FrontendVariableData;
  世界事件?: Record<string, WorldEventVariableData>;

  // 角色数据（NPC 信息存储在这里）
  角色数据?: Record<string, CharacterData | unknown>;

  // 事件系统
  事件系统?: {
    未发生事件?: Record<string, unknown>;
    进行中事件?: Record<string, unknown>;
    已完成事件?: Record<string, unknown>;
    已失效事件?: Record<string, unknown>;
    人物事件占用?: Record<
      string,
      {
        事件名?: string;
        地点?: string;
        来源?: '时间触发' | '玩家参与' | string;
        入场时间?: { 年?: number; 月?: number; 日?: number; 时?: number };
      }
    >;
  };

  参与事件?: Record<string, unknown>;
  事件分支结果?: Record<string, Record<string, 0 | 1>>;
  附近传闻?: Record<string, unknown>;
  后续事件线索?: Record<string, unknown>;
  后续事件线索计数?: Record<string, unknown>;

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

type LegacySocialNpc = NonNullable<NonNullable<GameVariables['侠缘']>[number]>;

export type GameSessionState = 'empty' | 'opening' | 'active';

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

const ERA_VARIABLE_BLOCK_REGEX = /\s*<Variable(Think|Insert|Edit|Delete)>\s*[\s\S]*?<\/Variable\1>\s*/gi;
const FRONTEND_LOADER_SCRIPT_REGEX = /<script\b[\s\S]*?<\/script>/gi;
const FRONTEND_LOADER_BODY_TAG_REGEX = /<\/?body\b[^>]*>/gi;
const FRONTEND_LOADER_HINT_REGEX = /(localhost|127\.0\.0\.1):5500\/dist\/武侠\/index\.html|\$\(['"]body['"]\)\.load\(/i;

/**
 * 规范即将写入酒馆 assistant 楼层的模型回复。
 *
 * 这里只处理换行与行尾空白，不解析或删除任何正文/变量结构块，确保实际楼层与后续提示词
 * 不会保留模型偶发输出的大段空行。
 */
export function normalizeAssistantReplyForPersistence(messageContent: string): string {
  if (!messageContent) return '';
  return messageContent
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 剥离 ERA 变量块，保留真正需要展示/解析的楼层正文。
 */
export function stripEraVariableBlocks(messageContent: string): string {
  if (!messageContent) return '';
  return messageContent
    .replace(ERA_VARIABLE_BLOCK_REGEX, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripFrontendLoaderArtifacts(messageContent: string): string {
  if (!messageContent) return '';
  return messageContent
    .replace(FRONTEND_LOADER_SCRIPT_REGEX, '\n')
    .replace(FRONTEND_LOADER_BODY_TAG_REGEX, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeDisplayedMessageContent(messageContent: string): string {
  return stripFrontendLoaderArtifacts(stripEraVariableBlocks(messageContent));
}

function resolveAssistantMessageRawContent(message: TavernChatMessage): string {
  const messageWithSwipes = message as TavernChatMessage & {
    mes?: string;
    swipes?: string[];
    swipe_id?: number;
  };
  const swipeIndex = Number(messageWithSwipes.swipe_id ?? 0);
  return (
    message.message ||
    messageWithSwipes.mes ||
    messageWithSwipes.swipes?.[Number.isFinite(swipeIndex) ? swipeIndex : 0] ||
    ''
  );
}

export function isFrontendLoaderOnlyMessage(messageContent: string): boolean {
  if (!messageContent) {
    return true;
  }

  const trimmed = messageContent.trim();
  if (!trimmed) {
    return true;
  }

  if (!FRONTEND_LOADER_HINT_REGEX.test(trimmed)) {
    return false;
  }

  const cleaned = normalizeDisplayedMessageContent(trimmed);
  return cleaned.length === 0;
}

/**
 * 解析消息中的 option 内容（兼容旧版）
 * @deprecated 建议使用 parseAIResponse，然后从 otherTags 中获取 option
 */
export function parseOptions(messageContent: string): string[] {
  const content = normalizeDisplayedMessageContent(messageContent);

  dataLogger.log('');
  dataLogger.log('🔍 [parseOptions] 开始解析 options');
  dataLogger.log('   输入内容长度:', content.length);

  // 检查是否包含 option 标签
  const hasOption = /<option>/i.test(content);
  dataLogger.log('   是否包含 <option> 标签:', hasOption);

  const match = content.match(/<option>([\s\S]*?)<\/option>/i);
  dataLogger.log('   正则匹配结果:', match ? '匹配成功' : '匹配失败');

  if (!match) {
    // 调试：查找可能的标签变体
    const optionStart = content.indexOf('<option');
    const optionEnd = content.indexOf('</option>');
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
 * stat_data 包含世界信息、用户档案等项目变量
 */
export function getGameVariables(): GameVariables {
  try {
    // 调用酒馆助手提供的 getAllVariables API
    const rawVariables = getAllVariables() as Record<string, unknown>;

    // 真正的游戏变量在 stat_data 键下
    const statData = rawVariables?.stat_data as GameVariables;
    dataLogger.log('[variableReader] stat_data 键:', statData ? Object.keys(statData) : []);

    // getAllVariables 返回的是 ERA 内部快照，字符串和动态键可能仍保留
    // __DOT__/__DQUOTE__/__SQUOTE__ 等占位符。前端只读投影必须先反转义，
    // 否则正文会把占位符直接显示出来，包含引号的动态键也无法匹配。
    return statData ? unescapeEraData(statData) : {};
  } catch (error) {
    dataLogger.error('[variableReader] 获取变量表失败:', error);
    return {};
  }
}

function hasValidUserData(variables: GameVariables): boolean {
  const user数据 = variables.user数据;
  if (!user数据) {
    return false;
  }

  const hasGender = '性别' in user数据 && Boolean(user数据.性别);
  const hasRealm = '境界' in user数据 && Boolean(user数据.境界);
  const hasUserName = '用户名' in user数据 && Boolean(user数据.用户名);

  return hasGender || hasRealm || hasUserName;
}

/**
 * 将变量表中的时间转换为 WorldTime 结构
 */
function parseWorldTime(世界信息?: GameVariables['世界信息']): WorldTime | undefined {
  const 时间 = 世界信息?.时间;
  if (!时间) return undefined;

  return {
    year: 时间.年 ?? 1199,
    month: 时间.月 ?? 1,
    day: 时间.日 ?? 1,
    hour: 时间.时 ?? 12,
    minute: 时间.分 ?? 0,
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
  const minuteText = String(worldTime.minute).padStart(2, '0');

  return `${yearName} ${monthName} ${dayName} ${hourName} ${worldTime.hour}时${minuteText}分`;
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

interface ResourcePair {
  current: number;
  max: number;
  exists: boolean;
}

function clampResourceCurrent(current: number, max: number): number {
  return Math.max(0, Math.min(Math.floor(current), Math.max(0, Math.floor(max))));
}

function parseResourcePair(value: string | number | undefined, defaultMax: number): ResourcePair {
  const fallbackMax = Math.max(0, Math.floor(defaultMax));
  if (value === undefined) {
    return { current: fallbackMax, max: fallbackMax, exists: false };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const max = Math.max(0, Math.floor(value));
    return { current: max, max, exists: true };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const parts = trimmed.split('/');
    if (parts.length === 2) {
      const current = Number(parts[0]);
      const max = Number(parts[1]);
      if (Number.isFinite(current) && Number.isFinite(max)) {
        const normalizedMax = Math.max(0, Math.floor(max));
        return {
          current: clampResourceCurrent(current, normalizedMax),
          max: normalizedMax,
          exists: true,
        };
      }
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      const max = Math.max(0, Math.floor(parsed));
      return { current: max, max, exists: true };
    }
  }

  return { current: fallbackMax, max: fallbackMax, exists: false };
}

function adjustResourcePairByMaxDelta(pair: ResourcePair, nextMax: number): ResourcePair {
  const max = Math.max(0, Math.floor(nextMax));
  if (!pair.exists) {
    return { current: max, max, exists: true };
  }
  return {
    current: clampResourceCurrent(pair.current + (max - pair.max), max),
    max,
    exists: true,
  };
}

function formatResourcePair(pair: ResourcePair): string {
  return `${pair.current}/${pair.max}`;
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

  const hpPairFromAttrs = parseResourcePair(attrs?.气血, calculatedResources?.气血上限 ?? 100);
  const mpPairFromAttrs = parseResourcePair(attrs?.内力, calculatedResources?.内力上限 ?? 50);
  const hpPair = calculatedResources
    ? adjustResourcePairByMaxDelta(hpPairFromAttrs, calculatedResources.气血上限)
    : hpPairFromAttrs;
  const mpPair = calculatedResources
    ? adjustResourcePairByMaxDelta(mpPairFromAttrs, calculatedResources.内力上限)
    : mpPairFromAttrs;

  // 优先使用计算结果，如果没有则使用变量中的值或默认值
  // 注意：悟性不随境界变化，只存在于初始属性中
  const result: CurrentAttributes = {
    hp: hpPair.max,
    mp: mpPair.max,
    hpCurrent: hpPair.current,
    mpCurrent: mpPair.current,
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
  comprehension: number = 10,
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
    comprehension,
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
 * 包裹物品字段统一使用"品阶"，装备/药品可携带额外元信息
 */
function normalizeAttributeModifiers(
  属性修正?: InventoryAttributeModifierMap,
): InventoryAttributeModifierMap | undefined {
  if (!属性修正 || typeof 属性修正 !== 'object') {
    return undefined;
  }

  const normalizedEntries = Object.entries(属性修正).filter(
    ([attribute, value]) => Boolean(attribute) && typeof value === 'number' && Number.isFinite(value),
  );
  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

function normalizeDurationValue(持续时间?: string | number): string | undefined {
  if (typeof 持续时间 === 'number' && Number.isFinite(持续时间)) {
    return String(持续时间);
  }
  if (typeof 持续时间 === 'string' && 持续时间.trim()) {
    return 持续时间.trim();
  }
  return undefined;
}

function normalizeDurationNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
  }
  return undefined;
}

function parseEquipmentSlots(装备栏?: EquipmentSlots): EquipmentSlots {
  if (!装备栏 || typeof 装备栏 !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(装备栏)
      .filter(([slot, itemName]) => !slot.startsWith('$') && typeof itemName === 'string' && itemName.trim())
      .map(([slot, itemName]) => [slot, itemName.trim()]),
  );
}

function parseStatusEffects(状态效果?: Record<string, ActiveStatusEffectVariableData>): ActiveStatusEffect[] {
  if (!状态效果 || typeof 状态效果 !== 'object') {
    return [];
  }

  return Object.entries(状态效果)
    .filter(([id]) => !id.startsWith('$'))
    .map(([id, effect]) => {
      const duration = normalizeDurationNumber(effect?.持续时间) ?? 0;
      const remaining = normalizeDurationNumber(effect?.剩余时间) ?? duration;
      return {
        id,
        type: typeof effect?.类型 === 'string' && effect.类型.trim() ? effect.类型.trim() : '药品',
        effectType: typeof effect?.功效类型 === 'string' && effect.功效类型.trim() ? effect.功效类型.trim() : undefined,
        source: typeof effect?.来源 === 'string' ? effect.来源.trim() : '',
        rank: typeof effect?.品阶 === 'string' && effect.品阶.trim() ? effect.品阶.trim() : undefined,
        modifiers: normalizeAttributeModifiers(effect?.属性修正),
        duration,
        remaining,
      };
    })
    .filter(effect => effect.remaining > 0);
}

function createModifierSource(
  id: string,
  kind: AttributeModifierSource['kind'],
  rank: string | undefined,
  modifiers?: InventoryAttributeModifierMap,
): AttributeModifierSource | undefined {
  const normalizedModifiers = normalizeAttributeModifiers(modifiers);
  return normalizedModifiers ? { id, kind, rank, modifiers: normalizedModifiers } : undefined;
}

function collectPermanentAttributeModifierSources(前端变量?: FrontendVariableData): AttributeModifierSource[] {
  const 永久属性修正 = 前端变量?.永久属性修正;
  if (!永久属性修正 || typeof 永久属性修正 !== 'object') {
    return [];
  }

  return Object.entries(永久属性修正).flatMap(([id, modifier]) => {
    if (id.startsWith('$')) {
      return [];
    }
    const source = createModifierSource(
      `永久:${id}`,
      '永久增幅',
      typeof modifier?.品阶 === 'string' ? modifier.品阶 : undefined,
      modifier?.属性修正,
    );
    return source ? [source] : [];
  });
}

function collectMeridianAttributeModifierSources(前端变量?: FrontendVariableData): AttributeModifierSource[] {
  const modifiers = deriveMeridianModifiers(前端变量?.奇经八脉);
  if (!Object.values(modifiers).some(value => value !== 0)) {
    return [];
  }
  return [{ id: '奇经八脉', kind: '经脉', modifiers }];
}

function collectActiveAttributeModifiers(
  用户档案?: UserProfile,
  equipmentSlots: EquipmentSlots = parseEquipmentSlots(用户档案?.装备栏),
  statusEffects: ActiveStatusEffect[] = parseStatusEffects(用户档案?.状态效果),
  前端变量?: FrontendVariableData,
): AttributeModifierSource[] | undefined {
  const sources: AttributeModifierSource[] = collectMeridianAttributeModifierSources(前端变量);
  const 包裹 = 用户档案?.包裹;

  if (包裹 && typeof 包裹 === 'object') {
    for (const [slot, itemName] of Object.entries(equipmentSlots)) {
      if (!slot || !itemName) {
        continue;
      }

      const item = 包裹[itemName];
      if (!item || mapItemType(item.类型) !== 'EQUIP') {
        continue;
      }

      const source = createModifierSource(`装备:${itemName}`, '装备', item.品阶, item.属性修正);
      if (source) {
        sources.push(source);
      }
    }
  }

  for (const effect of statusEffects) {
    const source = createModifierSource(
      `状态:${effect.id}`,
      effect.effectType === '永久增幅' ? '永久增幅' : '临时增幅',
      effect.rank,
      effect.modifiers,
    );
    if (source) {
      sources.push(source);
    }
  }

  sources.push(...collectPermanentAttributeModifierSources(前端变量));

  return sources.length > 0 ? sources : undefined;
}

function parseEquipInfo(
  itemName: string,
  item: InventoryItemVariableData,
  equipmentSlots: EquipmentSlots,
): InventoryItem['equipInfo'] | undefined {
  const slot = typeof item.部位 === 'string' ? item.部位.trim() : '';
  const isEquipped = Boolean(slot && equipmentSlots[slot] === itemName);
  const itemStatus = typeof item.使用状态 === 'string' ? item.使用状态.trim() : '';
  const status = isEquipped ? '装备中' : itemStatus;
  const modifiers = normalizeAttributeModifiers(item.属性修正);

  if (!slot && !status && !modifiers && !isEquipped) {
    return undefined;
  }

  return {
    slot: slot || undefined,
    modifiers,
    status: status || undefined,
    isEquipped,
  };
}

function parseElixirInfo(item: InventoryItemVariableData): InventoryItem['elixirInfo'] | undefined {
  const modifiers = normalizeAttributeModifiers(item.属性修正);
  const duration = normalizeDurationValue(item.持续时间);
  const effectType = typeof item.功效类型 === 'string' && item.功效类型.trim() ? item.功效类型.trim() : undefined;

  if (!modifiers && !duration && !effectType) {
    return undefined;
  }

  return {
    effectType,
    rank: item.品阶,
    modifiers,
    duration,
  };
}

function parseInventory(用户档案?: UserProfile): InventoryItem[] {
  const 包裹 = 用户档案?.包裹;
  if (!包裹 || typeof 包裹 !== 'object') return [];

  const equipmentSlots = parseEquipmentSlots(用户档案?.装备栏);
  const result: InventoryItem[] = [];
  let index = 0;

  for (const [name, item] of Object.entries(包裹)) {
    // 过滤掉 $template 模板字段
    if (name.startsWith('$')) continue;

    const type = mapItemType(item.类型);
    const martialArtData = item.类型 === '秘籍' ? getMartialArtData(name) : null;
    const description = martialArtData?.功法描述 || item.物品描述 || '';
    const rankSource = martialArtData?.功法品阶 || item.品阶;

    result.push({
      id: `item_${index++}`,
      name: name,
      type,
      rank: mapItemRank(rankSource),
      count: item.数量 ?? 1,
      description,
      equipInfo: type === 'EQUIP' ? parseEquipInfo(name, item, equipmentSlots) : undefined,
      elixirInfo: type === 'ELIXIR' ? parseElixirInfo(item) : undefined,
      martialArtInfo: martialArtData
        ? {
            description: martialArtData.功法描述,
            rank: martialArtData.功法品阶,
            requirements: martialArtData.修炼限制,
          }
        : undefined,
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
    药品: 'ELIXIR',
    杂物: 'MISC',
  };
  return typeMap[类型 || ''] || 'MISC';
}

/**
 * 映射物品品阶
 * 同时兼容普通物品品阶文案与秘籍品阶文案
 */
function mapItemRank(品阶?: string): string {
  const rankMap: Record<string, string> = {
    凡品: 'WHITE',
    粗浅: 'WHITE',
    精品: 'GREEN',
    传家: 'GREEN',
    珍品: 'BLUE',
    上乘: 'BLUE',
    极品: 'PURPLE',
    镇派: 'PURPLE',
    绝品: 'GOLD',
    绝世: 'GOLD',
    神品: 'RED',
    传说: 'RED',
  };
  return rankMap[品阶 || ''] || 'WHITE';
}

function getDisplayEventName(eventName: string): string {
  return eventName
    .replace(/__DOT__/g, '.')
    .replace(/\.(json|txt)$/i, '')
    .replace(/^.*?(事件条目-|登场事件-|成长条目-)/, '')
    .trim();
}

function isParticipationEventValue(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.描述 === 'string' &&
    typeof value.结局 === 'string' &&
    isRecord(value.insert) &&
    isRecord(value.update) &&
    isRecord(value.delete)
  );
}

function filterParticipationEvents(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record) return undefined;

  const entries = Object.entries(record).filter(([, value]) => isParticipationEventValue(value));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

type CalendarRecord = { 年?: number; 月?: number; 日?: number; 时?: number };

function isCalendarRecord(value: unknown): value is CalendarRecord {
  return isRecord(value) && ('年' in value || '月' in value || '日' in value);
}

function formatCalendarRecord(time: CalendarRecord): string {
  return `${time.年 ?? '?'}年${time.月 ?? '?'}月${time.日 ?? '?'}日${time.时 === undefined ? '' : `${time.时}时`}`;
}

// 与事件脚本一致的 12 月×30 天简化历法换算。
function toCalendarDays(time: CalendarRecord): number {
  return wuxiaCalendarDateToTotalDays(time);
}

function formatEventValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value === 1 ? '玩家参与' : '未参与';
  if (isCalendarRecord(value)) return formatCalendarRecord(value);
  if (isRecord(value) && typeof value.描述 === 'string') return value.描述;
  if (value === null || value === undefined) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// 附近传闻由事件脚本拼为 `引子文本 [事件开始时间/事件地点]`；时间段不含斜杠，地点是含斜杠的完整路径
const RUMOR_META_PATTERN = /^([\s\S]*?)\s*\[([^/[\]]+)\/([^[\]]+)\]$/;

function parseRumorMeta(raw: string): { description: string; timeText?: string; location?: string } {
  const match = raw.match(RUMOR_META_PATTERN);
  if (!match) return { description: raw };
  return { description: match[1].trim(), timeText: match[2].trim(), location: match[3].trim() };
}

function parseCalendarText(raw?: string): CalendarRecord | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^(\d+)年(\d+)月(\d+)日(?:([0-9]+)时)?/);
  if (!match) return undefined;
  return {
    年: Number(match[1]),
    月: Number(match[2]),
    日: Number(match[3]),
    时: match[4] === undefined ? undefined : Number(match[4]),
  };
}

function collectEventOccupancy(
  occupancy: NonNullable<NonNullable<GameVariables['事件系统']>['人物事件占用']>,
  eventName: string,
): { location?: string; involvedCharacters?: string[] } {
  const involved: string[] = [];
  let location: string | undefined;

  for (const [characterName, record] of Object.entries(occupancy)) {
    if (!isRecord(record) || record.事件名 !== eventName || characterName.startsWith('$')) continue;
    involved.push(characterName);
    if (!location && typeof record.地点 === 'string' && record.地点.trim()) {
      location = getLocationScopePath(record.地点) || undefined;
    }
  }

  return {
    location,
    involvedCharacters: involved.length > 0 ? involved : undefined,
  };
}

/**
 * 将当前事件系统变量转换为前端事件面板结构。
 *
 * 不展示全部未发生事件，避免初始化后把数百条事件渲染进前端。
 */
function parseEvents(variables: GameVariables, worldTime?: WorldTime): GameEvent[] {
  const events: GameEvent[] = [];
  const eventSystem = variables.事件系统 || {};
  const occupancy = eventSystem.人物事件占用 || {};
  const ongoing = eventSystem.进行中事件 || {};
  const nowDays = worldTime
    ? wuxiaCalendarDateToTotalDays({ 年: worldTime.year, 月: worldTime.month, 日: worldTime.day })
    : undefined;

  const remainingDaysUntil = (endTime: unknown): number | undefined => {
    if (nowDays === undefined || !isCalendarRecord(endTime)) return undefined;
    const remaining = toCalendarDays(endTime) - nowDays;
    return remaining >= 0 ? remaining : undefined;
  };

  const daysUntilStart = (timeText?: string): number | undefined => {
    if (nowDays === undefined) return undefined;
    const startTime = parseCalendarText(timeText);
    if (!startTime) return undefined;
    const remaining = toCalendarDays(startTime) - nowDays;
    return remaining >= 0 ? remaining : undefined;
  };

  const previewNames = new Set<string>();
  for (const [eventName, value] of Object.entries(variables.前端变量?.可发现事件 || {})) {
    const raw = typeof value === 'string' ? value : formatEventValue(value);
    if (!raw.trim()) continue;
    const meta = parseRumorMeta(raw);
    previewNames.add(eventName);
    events.push({
      id: `preview_${eventName}`,
      title: getDisplayEventName(eventName),
      type: 'RUMOR',
      ...meta,
      startsInDays: daysUntilStart(meta.timeText),
    });
  }

  for (const [eventName, value] of Object.entries(variables.附近传闻 || {})) {
    if (previewNames.has(eventName)) continue;
    const raw = typeof value === 'string' ? value : formatEventValue(value);
    if (!raw.trim()) continue;
    events.push({
      id: `rumor_${eventName}`,
      title: getDisplayEventName(eventName),
      type: 'RUMOR',
      ...parseRumorMeta(raw),
    });
  }

  // 玩家参与中的事件：展示描述与当前结局走向，不暴露 insert/update/delete 差分细节
  const participation = filterParticipationEvents(variables.参与事件) || {};
  for (const [eventName, value] of Object.entries(participation)) {
    const record = value as Record<string, unknown>;
    const outcome = typeof record.结局 === 'string' ? record.结局.trim() : '';
    const endTime = ongoing[eventName];
    events.push({
      id: `participating_${events.length}`,
      title: getDisplayEventName(eventName),
      type: 'ACTIVE',
      category: 'participation',
      description: typeof record.描述 === 'string' ? record.描述 : '',
      details: outcome || undefined,
      timeText: isCalendarRecord(endTime) ? formatCalendarRecord(endTime) : undefined,
      remainingDays: remainingDaysUntil(endTime),
      ...collectEventOccupancy(occupancy, eventName),
    });
  }

  // 江湖中进行、玩家未卷入的事件：进行中事件只存结束时间，地点与人物从占用表反查
  const participationKeys = new Set(Object.keys(variables.参与事件 || {}));
  for (const [eventName, endTime] of Object.entries(ongoing)) {
    if (participationKeys.has(eventName)) continue;
    events.push({
      id: `active_${events.length}`,
      title: getDisplayEventName(eventName),
      type: 'ACTIVE',
      category: 'world',
      description: '',
      timeText: isCalendarRecord(endTime) ? formatCalendarRecord(endTime) : undefined,
      remainingDays: remainingDaysUntil(endTime),
      ...collectEventOccupancy(occupancy, eventName),
    });
  }

  const clueCounters = variables.后续事件线索计数 || {};
  for (const [eventName, value] of Object.entries(variables.后续事件线索 || {})) {
    const description = formatEventValue(value);
    if (!description.trim() || description === '{}') continue;
    const counter = Number(clueCounters[eventName]);
    events.push({
      id: `followup_${events.length}`,
      title: getDisplayEventName(eventName),
      type: 'AFTERMATH',
      description,
      remainingTurns: Number.isFinite(counter) && counter > 0 ? counter : undefined,
    });
  }

  return events;
}

/**
 * 将 stat_data.世界事件 归档转换为江湖史册条目。
 *
 * 事件结局状态只为玩家参与过的事件写入，因此有状态即为"亲历"，
 * 无状态的归档（含智能初始化直接完成的史前事件）归入背景。
 */
function parseChronicle(variables: GameVariables): ChronicleEntry[] {
  const entries: ChronicleEntry[] = [];
  const outcomeStatuses = variables.前端变量?.事件结局状态 || {};

  for (const [eventName, record] of Object.entries(variables.世界事件 || {})) {
    if (eventName.startsWith('$') || !isRecord(record)) continue;
    const summary = typeof record.概要 === 'string' ? record.概要.trim() : '';
    if (!summary) continue;

    const time = isCalendarRecord(record.时间) ? record.时间 : undefined;
    const location = typeof record.地点 === 'string' && record.地点.trim() ? record.地点.trim() : undefined;
    const outcomeStatus = outcomeStatuses[eventName];

    entries.push({
      id: `chronicle_${entries.length}`,
      title: getDisplayEventName(eventName),
      year: time?.年,
      timeText: time ? formatCalendarRecord(time) : '年代不详',
      sortDays: time ? toCalendarDays(time) : 0,
      location,
      summary,
      outcomeStatus,
      personal: outcomeStatus !== undefined,
    });
  }

  // 最近的事排最前；同日按标题稳定排序
  entries.sort((a, b) => b.sortDays - a.sortDays || a.title.localeCompare(b.title, 'zh'));
  return entries;
}

/**
 * 将人物经历统一格式化为前端可读文本
 */
function formatBiographySummary(biography?: Record<string, string> | string): string {
  if (!biography) return '';
  if (typeof biography === 'string') return biography;

  return Object.entries(biography)
    .filter(([key, value]) => !key.startsWith('$') && Boolean(value))
    .map(([key, value]) => (key ? `【${key}】${value}` : value))
    .join('\n');
}

function formatNetworkSummary(network?: Record<string, string> | string[]): string[] {
  if (!network) return [];
  if (Array.isArray(network)) {
    return network.filter(Boolean);
  }

  return Object.entries(network)
    .filter(([name]) => Boolean(name) && !name.startsWith('$'))
    .map(([name, relation]) => (relation ? `${name}（${relation}）` : name));
}

function getPrimaryIdentityTitle(identities?: Record<string, string>, fallbackType?: string): string {
  const identityTitle = identities
    ? Object.keys(identities).find(name => Boolean(name) && !name.startsWith('$'))
    : undefined;

  return identityTitle || fallbackType || '江湖人士';
}

function getPrimaryMartialArtTemplate(characterData?: CharacterData, legacyNpc?: LegacySocialNpc): NPC['template'] {
  const martialArts: NonNullable<NPC['template']['martialArts']> = {};
  for (const [name, art] of Object.entries(characterData?.功法 || {})) {
    if (name.startsWith('$')) continue;
    martialArts[name] = {
      type: art?.类型 || '',
      martialArtsDescription: art?.功法描述 || '',
      martialArtsRank: art?.功法品阶 || '普通',
      mastery: art?.掌握程度 || '入门',
      traits: art?.特性 || {},
    };
  }

  const primaryMartialArt = Object.values(martialArts)[0];

  return {
    type: getPrimaryIdentityTitle(characterData?.身份, primaryMartialArt?.type),
    martialArtsDescription: primaryMartialArt?.martialArtsDescription || legacyNpc?.武功描述 || '',
    martialArtsRank: primaryMartialArt?.martialArtsRank || legacyNpc?.武功品阶 || '普通',
    mastery: primaryMartialArt?.mastery || legacyNpc?.掌握程度 || '入门',
    traits: primaryMartialArt?.traits || legacyNpc?.特性 || {},
    martialArts: Object.keys(martialArts).length > 0 ? martialArts : undefined,
  };
}

function getCharacterKeyItems(characterData?: CharacterData, legacyNpc?: LegacySocialNpc): string[] {
  const characterItems = characterData?.重要物品
    ? Object.keys(characterData.重要物品).filter(name => Boolean(name) && !name.startsWith('$'))
    : [];

  if (characterItems.length > 0) {
    return characterItems;
  }

  return legacyNpc?.重要物品 || [];
}

function createCharacterNpc(
  name: string,
  characterData: CharacterData,
  category: NPC['category'],
  avatarRef?: string,
  relationshipLabel?: string,
  legacyNpc?: LegacySocialNpc,
): NPC {
  const network = formatNetworkSummary(characterData.关系网);

  return {
    id: `npc:${category}:${name}`,
    name,
    avatarRef,
    relationship: legacyNpc?.关系值 ?? 0,
    relationshipLabel: relationshipLabel?.trim() || undefined,
    category,
    location: characterData.所在位置 || undefined,
    template: getPrimaryMartialArtTemplate(characterData, legacyNpc),
    keyItems: getCharacterKeyItems(characterData, legacyNpc),
    biography: formatBiographySummary(characterData.人物经历) || legacyNpc?.人物经历 || '',
    network: network.length > 0 ? network : formatNetworkSummary(legacyNpc?.关系网),
  };
}

function createLegacySocialNpc(legacyNpc: LegacySocialNpc, category: NPC['category'], relationshipLabel?: string): NPC {
  const name = legacyNpc.姓名?.trim() || '未知人物';

  return {
    id: `npc:${category}:${name}`,
    name,
    avatarRef: undefined,
    relationship: legacyNpc.关系值 ?? 0,
    relationshipLabel: relationshipLabel?.trim() || undefined,
    category,
    template: {
      type: '江湖人士',
      martialArtsDescription: legacyNpc.武功描述 || '',
      martialArtsRank: legacyNpc.武功品阶 || '普通',
      mastery: legacyNpc.掌握程度 || '入门',
      traits: legacyNpc.特性 || {},
    },
    keyItems: legacyNpc.重要物品 || [],
    biography: legacyNpc.人物经历 || '',
    network: formatNetworkSummary(legacyNpc.关系网),
  };
}

function createPlaceholderNpc(name: string, category: NPC['category'], relationshipLabel?: string): NPC {
  return {
    id: `npc:${category}:${name}`,
    name,
    avatarRef: undefined,
    relationship: 0,
    relationshipLabel: relationshipLabel?.trim() || undefined,
    category,
    template: {
      type: '江湖人士',
      martialArtsDescription: '',
      martialArtsRank: '未知',
      mastery: '未知',
      traits: {},
    },
    keyItems: [],
    biography: '',
    network: [],
  };
}

function isCharacterDataRecord(value: unknown): value is CharacterData {
  return typeof value === 'object' && value !== null;
}

/**
 * 按现有变量结构组装侠缘页人物列表：
 * 1. 相识人物来源于 user数据.关系网
 * 2. 所在地区人物来源于与 user数据.所在位置 相同的角色数据
 * 3. 所在地区人物不得与相识人物重复显示
 */
function parseSocial(variables: GameVariables, 用户档案?: UserProfile): NPC[] {
  const legacySocialList = Array.isArray(variables.侠缘) ? variables.侠缘 : [];
  const legacyByName = new Map<string, LegacySocialNpc>();
  const avatarRefs = variables.前端变量?.头像?.人物 || {};
  for (const npc of legacySocialList) {
    const name = npc.姓名?.trim();
    if (name) {
      legacyByName.set(name, npc);
    }
  }

  const relationshipNetwork = 用户档案?.关系网 || {};
  const acquaintanceNames = Object.keys(relationshipNetwork).filter(name => Boolean(name) && !name.startsWith('$'));
  const currentLocation = 用户档案?.所在位置?.trim();
  const characterRecords = variables.角色数据 || {};
  const userName = 用户档案?.用户名?.trim();
  const seenNames = new Set<string>();
  const result: NPC[] = [];

  for (const rawName of acquaintanceNames) {
    const name = rawName.trim();
    if (!name || name === userName || seenNames.has(name)) {
      continue;
    }

    const relationshipLabel = relationshipNetwork[rawName];
    const characterRecord = characterRecords[name];
    const legacyNpc = legacyByName.get(name);

    if (isCharacterDataRecord(characterRecord)) {
      result.push(
        createCharacterNpc(name, characterRecord, 'acquaintance', avatarRefs[name], relationshipLabel, legacyNpc),
      );
    } else if (legacyNpc) {
      result.push(createLegacySocialNpc(legacyNpc, 'acquaintance', relationshipLabel));
    } else {
      result.push(createPlaceholderNpc(name, 'acquaintance', relationshipLabel));
    }

    seenNames.add(name);
  }

  if (!currentLocation) {
    return result;
  }

  for (const [rawName, characterRecord] of Object.entries(characterRecords)) {
    const name = rawName.trim();

    if (
      !name ||
      name.startsWith('$') ||
      name === userName ||
      seenNames.has(name) ||
      !isCharacterDataRecord(characterRecord)
    ) {
      continue;
    }

    if (characterRecord.所在位置?.trim() !== currentLocation) {
      continue;
    }

    result.push(
      createCharacterNpc(name, characterRecord, 'local', avatarRefs[name], undefined, legacyByName.get(name)),
    );
    seenNames.add(name);
  }

  return result;
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
  const chineseInitialAttrs: InitialAttributes = {
    臂力: 初始属性.臂力 ?? 10,
    根骨: 初始属性.根骨 ?? 10,
    机敏: 初始属性.机敏 ?? 10,
    悟性: 初始属性.悟性 ?? 10,
    洞察: 初始属性.洞察 ?? 10,
    风姿: 10,
    福缘: 0,
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

type VariableAttributeSet = NonNullable<UserProfile['属性']> | NonNullable<CharacterData['属性']>;

function normalizeAttributeResourceValue(value: string | number | undefined): string {
  return String(value ?? '').trim();
}

function normalizeAttributeNumberValue(value: number | undefined): number {
  return Number(value ?? NaN);
}

function areCalculatedAttributesEqual(
  currentAttributes: VariableAttributeSet | undefined,
  calculatedAttributes: CalculatedCharacterAttributes,
): boolean {
  if (!currentAttributes) {
    return false;
  }

  return (
    normalizeAttributeResourceValue(currentAttributes.气血) === calculatedAttributes.气血 &&
    normalizeAttributeResourceValue(currentAttributes.内力) === calculatedAttributes.内力 &&
    normalizeAttributeNumberValue(currentAttributes.臂力) === calculatedAttributes.臂力 &&
    normalizeAttributeNumberValue(currentAttributes.根骨) === calculatedAttributes.根骨 &&
    normalizeAttributeNumberValue(currentAttributes.机敏) === calculatedAttributes.机敏 &&
    normalizeAttributeNumberValue(currentAttributes.洞察) === calculatedAttributes.洞察
  );
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
  /** 玩家属性计算输入签名；NPC 仍只用境界缓存 */
  attributeSignature?: string;
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
function stringifySortedRecord(record: Record<string, unknown> | undefined): string {
  if (!record) {
    return '{}';
  }

  return JSON.stringify(
    Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function createPlayerAttributeSignature(
  initialAttrs: InitialAttributes,
  realm: string,
  martialArts: Record<string, MartialArtForCalculation>,
  modifiers?: AttributeModifierSource[],
): string {
  return JSON.stringify({
    initialAttrs,
    realm,
    martialArts: stringifySortedRecord(martialArts as Record<string, unknown>),
    modifiers: modifiers ?? [],
  });
}

function updateCharacterCache(cacheKey: string, realm: string, attributeSignature?: string): void {
  characterStateCache.set(cacheKey, { realm, exists: true, attributeSignature });
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
export async function autoUpdatePlayerAttributes(
  user数据?: UserProfile,
  前端变量?: FrontendVariableData,
): Promise<void> {
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

  const equipmentSlots = parseEquipmentSlots(user数据.装备栏);
  const statusEffects = parseStatusEffects(user数据.状态效果);
  const activeModifiers = collectActiveAttributeModifiers(user数据, equipmentSlots, statusEffects, 前端变量);
  const attributeSignature = createPlayerAttributeSignature(
    initialAttrs,
    currentRealm,
    martialArtsForCalc,
    activeModifiers,
  );

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
  } else if (cached.attributeSignature !== attributeSignature) {
    shouldUpdate = true;
    dataLogger.log('[autoUpdatePlayerAttributes] 属性计算输入变更，需要更新');
  } else {
    dataLogger.log('[autoUpdatePlayerAttributes] 玩家属性计算输入无变化，跳过');
    return;
  }

  if (!shouldUpdate) {
    return;
  }

  dataLogger.log(`[autoUpdatePlayerAttributes] 需要更新玩家属性 (新玩家=${isNew}, 境界变更=${realmChanged})`);
  dataLogger.log('[autoUpdatePlayerAttributes] 玩家初始属性:', initialAttrs);
  dataLogger.log('[autoUpdatePlayerAttributes] 玩家境界:', currentRealm);
  dataLogger.log('[autoUpdatePlayerAttributes] 玩家功法:', martialArtsForCalc);
  dataLogger.log('[autoUpdatePlayerAttributes] 装备栏:', equipmentSlots);
  dataLogger.log('[autoUpdatePlayerAttributes] 状态效果:', statusEffects);
  dataLogger.log('[autoUpdatePlayerAttributes] 属性修正:', activeModifiers);

  // 使用 attributeCalculator 计算战斗属性和资源属性
  const { combat, resources } = calculateAllAttributes(initialAttrs, currentRealm, martialArtsForCalc, activeModifiers);
  const hpPair = adjustResourcePairByMaxDelta(
    parseResourcePair(user数据.属性?.气血, resources.气血上限),
    resources.气血上限,
  );
  const mpPair = adjustResourcePairByMaxDelta(
    parseResourcePair(user数据.属性?.内力, resources.内力上限),
    resources.内力上限,
  );

  dataLogger.log('[autoUpdatePlayerAttributes] 计算后战斗属性:', combat);
  dataLogger.log('[autoUpdatePlayerAttributes] 计算后资源属性:', resources);

  // 构建属性数据（使用 "当前值/最大值" 格式）
  const calculatedAttrs: CalculatedCharacterAttributes = {
    气血: formatResourcePair(hpPair),
    内力: formatResourcePair(mpPair),
    臂力: combat.臂力,
    根骨: combat.根骨,
    机敏: combat.机敏,
    洞察: combat.洞察,
  };

  if (areCalculatedAttributesEqual(user数据.属性, calculatedAttrs)) {
    dataLogger.log('[autoUpdatePlayerAttributes] 玩家属性已与计算结果一致，跳过 ERA 写入');
    updateCharacterCache(cacheKey, currentRealm, attributeSignature);
    return;
  }

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
      await emitSourcedEraVariableWriteAndWait({
        source: 'frontend',
        operation: 'update',
        reason: 'player-attribute-completion',
        eventName: 'era:updateByObject',
        attribution: 'background',
        detail: updateData,
        expectedAction: 'apiWrite',
        timeoutMs: 3000,
        timeoutMessage: '玩家属性更新请求已发出，但 ERA 没有确认写入完成。',
      });
      dataLogger.log('[autoUpdatePlayerAttributes] UPDATE 请求已发送');
    } else {
      // 属性不存在，使用 insert
      dataLogger.log('[autoUpdatePlayerAttributes] INSERT 数据:', JSON.stringify(updateData, null, 2));
      await emitSourcedEraVariableWriteAndWait({
        source: 'frontend',
        operation: 'insert',
        reason: 'player-attribute-completion',
        eventName: 'era:insertByObject',
        attribution: 'background',
        detail: updateData,
        expectedAction: 'apiWrite',
        timeoutMs: 3000,
        timeoutMessage: '玩家属性补全请求已发出，但 ERA 没有确认写入完成。',
      });
      dataLogger.log('[autoUpdatePlayerAttributes] INSERT 请求已发送');
    }

    // 更新缓存
    updateCharacterCache(cacheKey, currentRealm, attributeSignature);

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

/** 在物品状态变化后立即重算并写回玩家最终属性。 */
export async function syncPlayerAttributesFromVariables(): Promise<void> {
  const variables = getGameVariables();
  await autoUpdatePlayerAttributes(variables.user数据, variables.前端变量);
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
export async function autoUpdateCharacterAttributes(
  角色数据?: Record<string, CharacterData | unknown>,
  user数据?: Pick<UserProfile, '用户名'>,
): Promise<void> {
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
    if (isPlayerCharacterEntry(角色名, user数据)) {
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
    if (isPlayerCharacterEntry(角色名, user数据)) {
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

    if (checkResult.attributeExists && areCalculatedAttributesEqual(角色Data.属性, calculatedAttrs)) {
      dataLogger.log(`[autoUpdateCharacterAttributes] 角色 ${角色名}: 属性已与计算结果一致，跳过 ERA 写入`);
      updateCharacterCache(cacheKey, 角色Data.境界 || '不入流');
      continue;
    }

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
        await emitSourcedEraVariableWriteAndWait({
          source: 'frontend',
          operation: 'insert',
          reason: 'character-attribute-completion',
          eventName: 'era:insertByObject',
          attribution: 'background',
          detail: insertData,
          expectedAction: 'apiWrite',
          timeoutMs: 3000,
          timeoutMessage: '角色属性补全请求已发出，但 ERA 没有确认写入完成。',
        });
        dataLogger.log('[autoUpdateCharacterAttributes] INSERT 请求已发送');
      }

      // 2. 处理需要 UPDATE 的角色（属性已存在但需要重算）
      if (needsUpdateList.length > 0) {
        const updateData: Record<string, unknown> = { 角色数据: {} as Record<string, unknown> };
        for (const { 角色名, 属性 } of needsUpdateList) {
          (updateData.角色数据 as Record<string, unknown>)[角色名] = { 属性 };
        }
        dataLogger.log('[autoUpdateCharacterAttributes] UPDATE 数据:', JSON.stringify(updateData, null, 2));
        await emitSourcedEraVariableWriteAndWait({
          source: 'frontend',
          operation: 'update',
          reason: 'character-attribute-completion',
          eventName: 'era:updateByObject',
          attribution: 'background',
          detail: updateData,
          expectedAction: 'apiWrite',
          timeoutMs: 3000,
          timeoutMessage: '角色属性刷新请求已发出，但 ERA 没有确认写入完成。',
        });
        dataLogger.log('[autoUpdateCharacterAttributes] UPDATE 请求已发送');
      }

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
type MartialArtUpdateType = 'insert' | 'update' | 'mixed' | 'none';

interface MartialArtVerificationLeaf {
  path: string[];
  expectedValue: unknown;
  displayPath: string;
}

interface MartialArtWritePlan {
  updateType: MartialArtUpdateType;
  hasChanges: boolean;
  insertPatch: Partial<MartialArtUpdateData>;
  updatePatch: Partial<MartialArtUpdateData>;
  verificationLeaves: MartialArtVerificationLeaf[];
}

interface PendingMartialArtVerification {
  cacheKey: string;
  displayName: string;
  mastery: string;
  verificationLeaves: MartialArtVerificationLeaf[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cloneJsonValue = <T>(value: T): T => {
  if (value === undefined) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) {
    return;
  }

  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const nextValue = cursor[segment];
    if (!isPlainObject(nextValue)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[path[path.length - 1]] = cloneJsonValue(value);
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let cursor = value;
  for (const segment of path) {
    if (!isPlainObject(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function hasNestedEntries(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return value !== undefined;
  }

  return Object.values(value).some(child => hasNestedEntries(child));
}

function collectMartialArtLeafWritePlan(
  currentValue: unknown,
  targetValue: unknown,
  path: string[],
  insertPatch: Record<string, unknown>,
  updatePatch: Record<string, unknown>,
  verificationLeaves: MartialArtVerificationLeaf[],
): void {
  if (isPlainObject(targetValue)) {
    for (const [key, childTargetValue] of Object.entries(targetValue)) {
      const childCurrentValue = isPlainObject(currentValue) ? currentValue[key] : undefined;
      collectMartialArtLeafWritePlan(
        childCurrentValue,
        childTargetValue,
        [...path, key],
        insertPatch,
        updatePatch,
        verificationLeaves,
      );
    }
    return;
  }

  if (currentValue === undefined) {
    setNestedValue(insertPatch, path, targetValue);
  } else if (currentValue !== targetValue) {
    setNestedValue(updatePatch, path, targetValue);
  } else {
    return;
  }

  verificationLeaves.push({
    path,
    expectedValue: cloneJsonValue(targetValue),
    displayPath: path.join('.'),
  });
}

function buildMartialArtWritePlan(
  功法数据: SimpleMartialArt,
  completedData: MartialArtUpdateData,
): MartialArtWritePlan {
  const insertPatch: Record<string, unknown> = {};
  const updatePatch: Record<string, unknown> = {};
  const verificationLeaves: MartialArtVerificationLeaf[] = [];

  collectMartialArtLeafWritePlan(
    功法数据 as unknown,
    completedData as unknown,
    [],
    insertPatch,
    updatePatch,
    verificationLeaves,
  );

  const hasInsert = hasNestedEntries(insertPatch);
  const hasUpdate = hasNestedEntries(updatePatch);
  const updateType: MartialArtUpdateType =
    hasInsert && hasUpdate ? 'mixed' : hasInsert ? 'insert' : hasUpdate ? 'update' : 'none';

  return {
    updateType,
    hasChanges: verificationLeaves.length > 0,
    insertPatch: insertPatch as Partial<MartialArtUpdateData>,
    updatePatch: updatePatch as Partial<MartialArtUpdateData>,
    verificationLeaves,
  };
}

function prefixVerificationLeaves(
  basePath: string[],
  leaves: MartialArtVerificationLeaf[],
): MartialArtVerificationLeaf[] {
  return leaves.map(leaf => {
    const fullPath = [...basePath, ...leaf.path];
    return {
      path: fullPath,
      expectedValue: cloneJsonValue(leaf.expectedValue),
      displayPath: fullPath.join('.'),
    };
  });
}

function readChatStatDataSnapshot(): GameVariables {
  try {
    const chatVariables = getVariables({ type: 'chat' }) as { stat_data?: GameVariables } | null | undefined;
    return isRecord(chatVariables?.stat_data) ? (chatVariables.stat_data as GameVariables) : {};
  } catch (error) {
    dataLogger.error('[variableReader] 读取 chat.stat_data 失败:', error);
    return {};
  }
}

function verifyMartialArtWrites(pendingVerifications: PendingMartialArtVerification[]): {
  succeeded: PendingMartialArtVerification[];
  failed: Array<
    PendingMartialArtVerification & {
      mismatches: Array<{ path: string; expected: unknown; actual: unknown }>;
    }
  >;
} {
  const chatStatData = readChatStatDataSnapshot();
  const succeeded: PendingMartialArtVerification[] = [];
  const failed: Array<
    PendingMartialArtVerification & {
      mismatches: Array<{ path: string; expected: unknown; actual: unknown }>;
    }
  > = [];

  for (const pending of pendingVerifications) {
    const mismatches = pending.verificationLeaves
      .map(leaf => {
        const actualValue = getNestedValue(chatStatData, leaf.path);
        if (actualValue === leaf.expectedValue) {
          return null;
        }
        return {
          path: leaf.displayPath,
          expected: leaf.expectedValue,
          actual: actualValue,
        };
      })
      .filter((entry): entry is { path: string; expected: unknown; actual: unknown } => entry !== null);

    if (mismatches.length === 0) {
      succeeded.push(pending);
    } else {
      failed.push({
        ...pending,
        mismatches,
      });
    }
  }

  return { succeeded, failed };
}

/**
 * 根据逐叶写入计划归纳本次补全的写入类型。
 * @returns 更新类型
 */
function checkMartialArtUpdateType(writePlan: MartialArtWritePlan): MartialArtUpdateType {
  return writePlan.updateType;
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

export function __resetVariableReaderTestState(): void {
  characterStateCache.clear();
  martialArtStateCache.clear();
  isUpdatingMartialArts = false;
}

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
  writePlan: MartialArtWritePlan,
): {
  shouldUpdate: boolean;
  isNew: boolean;
  masteryChanged: boolean;
  updateType: MartialArtUpdateType;
} {
  const currentMastery = 功法数据.掌握程度 || '初窥门径';
  const updateType = checkMartialArtUpdateType(writePlan);
  const cached = martialArtStateCache.get(cacheKey);

  if (!cached) {
    dataLogger.log(`[shouldUpdateMartialArtByCache] ${cacheKey}: 新功法，更新类型=${updateType}`);
    return { shouldUpdate: updateType !== 'none', isNew: true, masteryChanged: false, updateType };
  }

  if (updateType !== 'none') {
    const masteryChanged = cached.mastery !== currentMastery;
    dataLogger.log(`[shouldUpdateMartialArtByCache] ${cacheKey}: 目标叶子与当前变量不一致，更新类型=${updateType}`);
    return { shouldUpdate: true, isNew: false, masteryChanged, updateType };
  }

  if (cached.mastery !== currentMastery) {
    dataLogger.log(
      `[shouldUpdateMartialArtByCache] ${cacheKey}: 掌握程度变动 ${cached.mastery} -> ${currentMastery}，但目标叶子已同步`,
    );
    return { shouldUpdate: false, isNew: false, masteryChanged: true, updateType };
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

type CharacterRecord = Record<string, CharacterData | unknown>;

export interface MartialArtsCompletionScope {
  player?: Record<string, SimpleMartialArt>;
  characters?: CharacterRecord;
}

interface GameDataCompletionScope {
  playerAttributes?: UserProfile;
  characterAttributes?: CharacterRecord;
  martialArts?: MartialArtsCompletionScope;
}

type MartialArtWriteData = {
  user数据?: { 功法: Record<string, Partial<MartialArtUpdateData>> };
  角色数据?: Record<string, { 功法: Record<string, Partial<MartialArtUpdateData>> }>;
};

export interface GameDataCompletionOptions {
  fullScan?: boolean;
  scope?: GameDataCompletionScope;
  debounceMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getUserName(user数据?: Pick<UserProfile, '用户名'>): string {
  return typeof user数据?.用户名 === 'string' ? user数据.用户名.trim() : '';
}

function isPlayerCharacterEntry(characterName: string, userDataOrName?: Pick<UserProfile, '用户名'> | string): boolean {
  const userName = typeof userDataOrName === 'string' ? userDataOrName.trim() : getUserName(userDataOrName);
  return !!userName && characterName === userName;
}

function toSimpleMartialArts(value: unknown): Record<string, SimpleMartialArt> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const result: Record<string, SimpleMartialArt> = {};
  for (const [name, art] of Object.entries(value)) {
    if (name.startsWith('$') || !isRecord(art)) {
      continue;
    }
    result[name] = art as SimpleMartialArt;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function martialArtSignature(art: SimpleMartialArt | undefined): string {
  if (!art) {
    return '';
  }

  const traits = art.特性 ? Object.entries(art.特性).sort(([a], [b]) => a.localeCompare(b)) : [];

  return JSON.stringify({
    mastery: art.掌握程度 || '初窥门径',
    type: art.类型 || '',
    rank: art.功法品阶 || '',
    description: art.功法描述 || '',
    traits,
  });
}

function shouldQueueMartialArtForCompletion(
  功法名: string,
  nextArt: SimpleMartialArt,
  previousArt?: SimpleMartialArt,
): boolean {
  if (!nextArt.类型 || !nextArt.功法品阶 || !nextArt.功法描述 || !nextArt.特性) {
    return true;
  }

  if (previousArt && martialArtSignature(nextArt) !== martialArtSignature(previousArt)) {
    return true;
  }

  const cached = martialArtStateCache.get(getMartialArtCacheKey('diff', 功法名));
  return !previousArt && !cached;
}

function collectChangedMartialArts(
  nextVariables: GameVariables,
  previousVariables: GameVariables,
): MartialArtsCompletionScope | null {
  const scope: MartialArtsCompletionScope = {};
  const playerName = getUserName(nextVariables.user数据) || getUserName(previousVariables.user数据);

  const nextPlayerArts = toSimpleMartialArts(nextVariables.user数据?.功法);
  const previousPlayerArts = toSimpleMartialArts(previousVariables.user数据?.功法);
  if (nextPlayerArts) {
    const changedPlayerArts: Record<string, SimpleMartialArt> = {};
    for (const [name, art] of Object.entries(nextPlayerArts)) {
      if (shouldQueueMartialArtForCompletion(name, art, previousPlayerArts?.[name])) {
        changedPlayerArts[name] = art;
      }
    }
    if (Object.keys(changedPlayerArts).length > 0) {
      scope.player = changedPlayerArts;
    }
  }

  const nextCharacters = nextVariables.角色数据 || {};
  const previousCharacters = previousVariables.角色数据 || {};
  const changedCharacters: CharacterRecord = {};

  for (const [characterName, nextCharacter] of Object.entries(nextCharacters)) {
    if (
      characterName.startsWith('$') ||
      isPlayerCharacterEntry(characterName, playerName) ||
      !isRecord(nextCharacter)
    ) {
      continue;
    }

    const nextArts = toSimpleMartialArts((nextCharacter as CharacterData).功法);
    if (!nextArts) {
      continue;
    }

    const previousCharacter = previousCharacters[characterName];
    const previousArts = isRecord(previousCharacter)
      ? toSimpleMartialArts((previousCharacter as CharacterData).功法)
      : undefined;
    const changedArts: Record<string, SimpleMartialArt> = {};

    for (const [name, art] of Object.entries(nextArts)) {
      if (shouldQueueMartialArtForCompletion(name, art, previousArts?.[name])) {
        changedArts[name] = art;
      }
    }

    if (Object.keys(changedArts).length > 0) {
      changedCharacters[characterName] = { 功法: changedArts };
    }
  }

  if (Object.keys(changedCharacters).length > 0) {
    scope.characters = changedCharacters;
  }

  return scope.player || scope.characters ? scope : null;
}

function shouldCheckPlayerAttributes(nextUser?: UserProfile, previousUser?: UserProfile): nextUser is UserProfile {
  if (!nextUser?.初始属性) {
    return false;
  }

  if (!previousUser) {
    return true;
  }

  return (
    !nextUser.属性 ||
    nextUser.境界 !== previousUser.境界 ||
    JSON.stringify(nextUser.初始属性) !== JSON.stringify(previousUser.初始属性) ||
    martialArtSignatureMap(nextUser.功法) !== martialArtSignatureMap(previousUser.功法)
  );
}

function martialArtSignatureMap(arts?: Record<string, SimpleMartialArt>): string {
  if (!arts) {
    return '';
  }

  return JSON.stringify(
    Object.entries(arts)
      .filter(([name]) => !name.startsWith('$'))
      .map(([name, art]) => [name, martialArtSignature(art)])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
}

function collectChangedCharacterAttributes(
  nextVariables: GameVariables,
  previousVariables: GameVariables,
): CharacterRecord | undefined {
  const nextCharacters = nextVariables.角色数据 || {};
  const previousCharacters = previousVariables.角色数据 || {};
  const changedCharacters: CharacterRecord = {};
  const playerName = getUserName(nextVariables.user数据) || getUserName(previousVariables.user数据);

  for (const [characterName, nextCharacter] of Object.entries(nextCharacters)) {
    if (
      characterName.startsWith('$') ||
      isPlayerCharacterEntry(characterName, playerName) ||
      !isRecord(nextCharacter)
    ) {
      continue;
    }

    const nextData = nextCharacter as CharacterData;
    if (!nextData.初始属性) {
      continue;
    }

    const previousCharacter = previousCharacters[characterName];
    const previousData = isRecord(previousCharacter) ? (previousCharacter as CharacterData) : undefined;
    const shouldCheck =
      !previousData ||
      !nextData.属性 ||
      nextData.境界 !== previousData.境界 ||
      JSON.stringify(nextData.初始属性) !== JSON.stringify(previousData.初始属性) ||
      martialArtSignatureMap(nextData.功法) !== martialArtSignatureMap(previousData.功法);

    if (shouldCheck) {
      changedCharacters[characterName] = nextData;
    }
  }

  return Object.keys(changedCharacters).length > 0 ? changedCharacters : undefined;
}

function mergeMartialArtsScope(
  target: MartialArtsCompletionScope,
  source: MartialArtsCompletionScope,
): MartialArtsCompletionScope {
  if (source.player) {
    target.player = { ...(target.player || {}), ...source.player };
  }

  if (source.characters) {
    target.characters = target.characters || {};
    for (const [characterName, characterData] of Object.entries(source.characters)) {
      const existing = isRecord(target.characters[characterName])
        ? (target.characters[characterName] as CharacterData)
        : {};
      const next = isRecord(characterData) ? (characterData as CharacterData) : {};
      target.characters[characterName] = {
        ...existing,
        ...next,
        功法: {
          ...(existing.功法 || {}),
          ...(next.功法 || {}),
        },
      };
    }
  }

  return target;
}

function mergeCompletionScope(
  target: GameDataCompletionScope,
  source: GameDataCompletionScope,
): GameDataCompletionScope {
  if (source.playerAttributes) {
    target.playerAttributes = source.playerAttributes;
  }

  if (source.characterAttributes) {
    target.characterAttributes = {
      ...(target.characterAttributes || {}),
      ...source.characterAttributes,
    };
  }

  if (source.martialArts) {
    target.martialArts = mergeMartialArtsScope(target.martialArts || {}, source.martialArts);
  }

  return target;
}

/**
 * 自动补全/更新功法信息并写回变量表
 *
 * 触发条件（基于缓存检测）：
 * 1. 新增功法（缓存中不存在该功法）
 * 2. 掌握程度变动（缓存中的掌握程度与当前不同，需要更新特性）
 *
 * 写入策略：
 * 1. 目标叶子路径为 undefined -> insert
 * 2. 目标叶子已存在，但为空、占位或值错误 -> update
 * 3. 写完后回读 chat.stat_data，逐叶验证；失败不记成功，不更新缓存
 *
 * @param 玩家功法 user数据中的功法对象
 * @param 角色数据 角色数据对象（包含所有NPC）
 */
export async function autoUpdateMartialArts(
  玩家功法?: Record<string, SimpleMartialArt>,
  角色数据?: Record<string, CharacterData | unknown>,
  user数据?: Pick<UserProfile, '用户名'>,
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

  // ERA updateByObject 不会创建不存在的字段；功法补全和特性刷新必须分流写入。
  const insertData: MartialArtWriteData = {};
  const updateData: MartialArtWriteData = {};
  const pendingVerifications: PendingMartialArtVerification[] = [];

  let needsInsert = false;
  let needsUpdate = false;

  // 1. 检查玩家功法
  if (玩家功法) {
    const 玩家功法Insert: Record<string, Partial<MartialArtUpdateData>> = {};
    const 玩家功法Update: Record<string, Partial<MartialArtUpdateData>> = {};

    for (const [功法名, 功法数据] of Object.entries(玩家功法)) {
      if (功法名.startsWith('$')) continue; // 跳过模板

      const cacheKey = getMartialArtCacheKey('玩家', 功法名);
      const completedData = completeMartialArtFromDatabase(功法名, 功法数据);
      if (!completedData) {
        continue;
      }
      const writePlan = buildMartialArtWritePlan(功法数据, completedData);
      const { shouldUpdate, isNew, masteryChanged, updateType } = shouldUpdateMartialArtByCache(
        cacheKey,
        功法数据,
        writePlan,
      );

      if (!shouldUpdate) {
        updateMartialArtCache(cacheKey, completedData.掌握程度, !writePlan.hasChanges);
        continue;
      }

      dataLogger.log(
        `[autoUpdateMartialArts] 玩家功法 ${功法名}: 需要处理 (新增=${isNew}, 掌握程度变动=${masteryChanged}, 操作=${updateType})`,
      );

      if (hasNestedEntries(writePlan.insertPatch)) {
        玩家功法Insert[功法名] = writePlan.insertPatch;
        needsInsert = true;
      }
      if (hasNestedEntries(writePlan.updatePatch)) {
        玩家功法Update[功法名] = writePlan.updatePatch;
        needsUpdate = true;
      }

      pendingVerifications.push({
        cacheKey,
        displayName: `玩家功法 ${功法名}`,
        mastery: completedData.掌握程度,
        verificationLeaves: prefixVerificationLeaves(['user数据', '功法', 功法名], writePlan.verificationLeaves),
      });
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
    const 角色功法Insert: Record<string, { 功法: Record<string, Partial<MartialArtUpdateData>> }> = {};
    const 角色功法Update: Record<string, { 功法: Record<string, Partial<MartialArtUpdateData>> }> = {};

    for (const [角色名, 角色] of Object.entries(角色数据)) {
      if (
        角色名.startsWith('$') ||
        isPlayerCharacterEntry(角色名, user数据) ||
        typeof 角色 !== 'object' ||
        角色 === null
      )
        continue;

      const 角色Data = 角色 as CharacterData;
      if (!角色Data.功法) continue;

      const 该角色功法Insert: Record<string, Partial<MartialArtUpdateData>> = {};
      const 该角色功法Update: Record<string, Partial<MartialArtUpdateData>> = {};

      for (const [功法名, 功法数据] of Object.entries(角色Data.功法)) {
        if (功法名.startsWith('$')) continue;

        const cacheKey = getMartialArtCacheKey(`角色:${角色名}`, 功法名);
        const completedData = completeMartialArtFromDatabase(功法名, 功法数据);
        if (!completedData) {
          continue;
        }
        const writePlan = buildMartialArtWritePlan(功法数据, completedData);
        const { shouldUpdate, isNew, masteryChanged, updateType } = shouldUpdateMartialArtByCache(
          cacheKey,
          功法数据,
          writePlan,
        );

        if (!shouldUpdate) {
          updateMartialArtCache(cacheKey, completedData.掌握程度, !writePlan.hasChanges);
          continue;
        }

        dataLogger.log(
          `[autoUpdateMartialArts] 角色 ${角色名} 功法 ${功法名}: 需要处理 (新增=${isNew}, 掌握程度变动=${masteryChanged}, 操作=${updateType})`,
        );

        if (hasNestedEntries(writePlan.insertPatch)) {
          该角色功法Insert[功法名] = writePlan.insertPatch;
          needsInsert = true;
        }
        if (hasNestedEntries(writePlan.updatePatch)) {
          该角色功法Update[功法名] = writePlan.updatePatch;
          needsUpdate = true;
        }

        pendingVerifications.push({
          cacheKey,
          displayName: `角色 ${角色名} 功法 ${功法名}`,
          mastery: completedData.掌握程度,
          verificationLeaves: prefixVerificationLeaves(
            ['角色数据', 角色名, '功法', 功法名],
            writePlan.verificationLeaves,
          ),
        });
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
    dataLogger.log(`  - 需要 INSERT（补全缺失字段）: ${needsInsert}`);
    dataLogger.log(`  - 需要 UPDATE（刷新已有特性）: ${needsUpdate}`);

    isUpdatingMartialArts = true;

    try {
      if (needsInsert) {
        dataLogger.log('[autoUpdateMartialArts] INSERT 数据:', JSON.stringify(insertData, null, 2));
        await emitSourcedEraVariableWriteAndWait({
          source: 'frontend',
          operation: 'insert',
          reason: 'martial-arts-completion',
          eventName: 'era:insertByObject',
          attribution: 'background',
          detail: insertData,
          expectedAction: 'apiWrite',
          timeoutMs: 3000,
          timeoutMessage: '功法补全请求已发出，但 ERA 没有确认写入完成。',
        });
        dataLogger.log('[autoUpdateMartialArts] 功法补全(insert)请求已发送');
      }

      if (needsUpdate) {
        dataLogger.log('[autoUpdateMartialArts] UPDATE 数据:', JSON.stringify(updateData, null, 2));
        await emitSourcedEraVariableWriteAndWait({
          source: 'frontend',
          operation: 'update',
          reason: 'martial-arts-completion',
          eventName: 'era:updateByObject',
          attribution: 'background',
          detail: updateData,
          expectedAction: 'apiWrite',
          timeoutMs: 3000,
          timeoutMessage: '功法特性刷新请求已发出，但 ERA 没有确认写入完成。',
        });
        dataLogger.log('[autoUpdateMartialArts] 功法特性刷新(update)请求已发送');
      }

      const verificationResult = verifyMartialArtWrites(pendingVerifications);
      for (const succeeded of verificationResult.succeeded) {
        updateMartialArtCache(succeeded.cacheKey, succeeded.mastery, true);
      }

      if (verificationResult.failed.length > 0) {
        dataLogger.error(
          '[autoUpdateMartialArts] 功法写入回读验证失败，本次不记成功:',
          verificationResult.failed.map(failed => ({
            cacheKey: failed.cacheKey,
            displayName: failed.displayName,
            mismatches: failed.mismatches,
          })),
        );
      }

      dataLogger.log('[autoUpdateMartialArts] 功法处理结束:', {
        verifiedSuccessCount: verificationResult.succeeded.length,
        verifiedFailureCount: verificationResult.failed.length,
      });
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

const COMPLETION_DEBOUNCE_MS = 80;

let completionTimer: ReturnType<typeof setTimeout> | null = null;
let completionPromise: Promise<void> | null = null;
let completionWaitPromise: Promise<void> | null = null;
let resolveCompletionWaitPromise: (() => void) | null = null;
let pendingFullCompletion = false;
let pendingCompletionScope: GameDataCompletionScope | null = null;
let initialCompletionFinished = false;

function ensureCompletionWaitPromise(): Promise<void> {
  if (!completionWaitPromise) {
    completionWaitPromise = new Promise(resolve => {
      resolveCompletionWaitPromise = resolve;
    });
  }
  return completionWaitPromise;
}

function resolveCompletionWaiters(): void {
  resolveCompletionWaitPromise?.();
  completionWaitPromise = null;
  resolveCompletionWaitPromise = null;
}

function hasPendingCompletionScope(scope: GameDataCompletionScope | null): boolean {
  return !!(
    scope?.playerAttributes ||
    scope?.characterAttributes ||
    scope?.martialArts?.player ||
    scope?.martialArts?.characters
  );
}

function queueCompletionRequest(options: GameDataCompletionOptions): void {
  const shouldFullScan = options.fullScan ?? !options.scope;
  if (shouldFullScan) {
    pendingFullCompletion = true;
    return;
  }

  if (options.scope) {
    pendingCompletionScope = mergeCompletionScope(pendingCompletionScope || {}, options.scope);
  }
}

async function runCompletionOnce(fullScan: boolean, scope: GameDataCompletionScope | null): Promise<void> {
  if (isHistoryCheckoutPending() || isChatRenamePending()) {
    dataLogger.log('[gameDataCompletion] 历史分叉或聊天改名同步中，跳过前端派生变量补全');
    return;
  }
  if (fullScan) {
    const variables = getGameVariables();
    if (Object.keys(variables).length === 0) {
      return;
    }

    if (variables.user数据) {
      await autoUpdatePlayerAttributes(variables.user数据, variables.前端变量);
    }
    if (variables.角色数据) {
      await autoUpdateCharacterAttributes(variables.角色数据, variables.user数据);
    }
    await autoUpdateMartialArts(variables.user数据?.功法, variables.角色数据, variables.user数据);
    initialCompletionFinished = true;
    return;
  }

  if (!scope) {
    return;
  }

  if (scope.playerAttributes) {
    await autoUpdatePlayerAttributes(scope.playerAttributes, getGameVariables().前端变量);
  }
  const currentUserData = getGameVariables().user数据;
  if (scope.characterAttributes) {
    await autoUpdateCharacterAttributes(scope.characterAttributes, currentUserData);
  }
  if (scope.martialArts) {
    await autoUpdateMartialArts(scope.martialArts.player, scope.martialArts.characters, currentUserData);
  }
}

async function runCompletionLoop(): Promise<void> {
  if (completionTimer) {
    clearTimeout(completionTimer);
    completionTimer = null;
  }

  if (completionPromise) {
    return completionPromise;
  }

  completionPromise = (async () => {
    try {
      do {
        const fullScan = pendingFullCompletion;
        const scope = pendingCompletionScope;
        pendingFullCompletion = false;
        pendingCompletionScope = null;
        await runCompletionOnce(fullScan, scope);
      } while (pendingFullCompletion || hasPendingCompletionScope(pendingCompletionScope));
    } catch (error) {
      dataLogger.error('[gameDataCompletion] 后台补全失败:', error);
    } finally {
      completionPromise = null;
      resolveCompletionWaiters();
    }
  })();

  return completionPromise;
}

export function scheduleGameDataCompletion(
  reason: string = 'manual',
  options: GameDataCompletionOptions = {},
): Promise<void> {
  if (isHistoryCheckoutPending() || isChatRenamePending()) {
    dataLogger.log(`[gameDataCompletion] 历史分叉或聊天改名同步中，忽略调度: ${reason}`);
    return Promise.resolve();
  }
  dataLogger.log(`[gameDataCompletion] 已调度: ${reason}`);
  queueCompletionRequest(options);
  const waitPromise = ensureCompletionWaitPromise();

  if (!completionTimer && !completionPromise) {
    completionTimer = setTimeout(() => {
      void runCompletionLoop();
    }, options.debounceMs ?? COMPLETION_DEBOUNCE_MS);
  }

  return waitPromise;
}

export async function flushPendingGameDataCompletion(reason: string = 'manual-flush'): Promise<void> {
  dataLogger.log(`[gameDataCompletion] flush: ${reason}`);
  if (!initialCompletionFinished && !pendingFullCompletion && !hasPendingCompletionScope(pendingCompletionScope)) {
    pendingFullCompletion = true;
  }

  if (
    !completionPromise &&
    (pendingFullCompletion || hasPendingCompletionScope(pendingCompletionScope) || completionTimer)
  ) {
    await runCompletionLoop();
    return;
  }

  if (completionPromise) {
    await completionPromise;
  }
}

/**
 * 从酒馆变量表纯读取游戏数据，不触发任何变量写入。
 */
export function readGameDataPure(): Partial<GameState> | null {
  dataLogger.log('[variableReader] ====== 开始纯读取游戏数据 ======');
  try {
    const variables = getGameVariables();

    if (Object.keys(variables).length === 0) {
      dataLogger.log('[variableReader] 变量表为空，返回 null');
      return null;
    }

    const result = mapVariablesToGameState(variables);
    dataLogger.log('[variableReader] ====== 纯读取完成 ======');
    return result;
  } catch (error) {
    dataLogger.error('[variableReader] 读取游戏数据失败:', error);
    return null;
  }
}

/**
 * 从酒馆变量表读取游戏数据
 * 使用 getAllVariables() API 获取合并后的变量
 *
 * 注意：保留兼容旧调用。新 UI 刷新路径应使用 readGameDataPure()，
 * 自动补全由 scheduleGameDataCompletion()/flushPendingGameDataCompletion() 调度。
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

    await runCompletionOnce(true, null);
    const result = readGameDataPure();
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

    // 解析功法（用于属性计算）— 悟性驱动升级折扣，对应 user数据.初始属性.悟性
    const martialArts = parseMartialArts(用户档案, 用户档案.修为 ?? 0, 用户档案.初始属性?.悟性 ?? 10);

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

    const equipmentSlots = parseEquipmentSlots(用户档案.装备栏);
    const statusEffects = parseStatusEffects(用户档案.状态效果);
    const activeModifiers = collectActiveAttributeModifiers(
      用户档案,
      equipmentSlots,
      statusEffects,
      variables.前端变量,
    );

    dataLogger.log('[variableReader] Step 4d1 - 装备栏:', equipmentSlots);
    dataLogger.log('[variableReader] Step 4d2 - 状态效果:', statusEffects);
    dataLogger.log('[variableReader] Step 4d3 - 属性修正:', activeModifiers);

    const meridianModifiers = collectMeridianAttributeModifierSources(variables.前端变量);
    const baseAttributes = calculateAllAttributes(
      initialAttrs,
      realm,
      martialArtsForCalc,
      meridianModifiers.length > 0 ? meridianModifiers : undefined,
    );
    const { combat, resources } = calculateAllAttributes(initialAttrs, realm, martialArtsForCalc, activeModifiers);

    dataLogger.log('[variableReader] Step 4e - 计算后的战斗属性:', combat);
    dataLogger.log('[variableReader] Step 4f - 计算后的资源属性:', resources);

    state.stats = {
      name: userName,
      gender: 用户档案.性别 || '未知',
      avatarRef: variables.前端变量?.头像?.玩家,
      appearance: 用户档案.外貌 || '',
      birthYear: 用户档案.出生年份 || (worldTime ? worldTime.year - 20 : 1179),
      status: 用户档案.状态 || '健康',
      realm: realm,
      cultivation: 用户档案.修为 ?? 0,
      location: 用户档案.所在位置 || '未知位置',
      identities: 用户档案.身份 || {},
      martialArts: martialArts,
      initialAttributes: initialAttrs,
      baseAttributes: parseCurrentAttributes(用户档案, baseAttributes.combat, baseAttributes.resources),
      attributes: parseCurrentAttributes(用户档案, combat, resources),
      meridians: buildMeridianProjection({
        progress: variables.前端变量?.奇经八脉,
        realm,
        cultivation: 用户档案.修为 ?? 0,
        initialAttributes: initialAttrs,
      }),
      biography: 用户档案.人物经历 || '',
      network: 用户档案.关系网 || {},
    };

    dataLogger.log('[variableReader] Step 6 - 最终 stats:', state.stats);

    // 背包（从用户档案中的包裹字段读取）
    state.inventory = parseInventory(用户档案);
    state.equipment = equipmentSlots;
    state.statusEffects = statusEffects;
  } else {
    dataLogger.log('[variableReader] 用户档案不存在，使用空背包');
    state.inventory = [];
    state.equipment = {};
    state.statusEffects = [];
  }

  // 事件 - 从事件系统读取（避免全量渲染未发生事件）
  state.events = parseEvents(variables, worldTime);
  state.chronicle = parseChronicle(variables);

  // 社交
  state.social = parseSocial(variables, 用户档案);

  return state;
}

export function detectGameSessionState(): GameSessionState {
  dataLogger.log('');
  dataLogger.log('🔍 [detectGameSessionState] 检查游戏会话状态');

  try {
    dataLogger.log('   [Step 1] 检查user数据变量...');
    const variables = getGameVariables();
    dataLogger.log('   变量表键:', Object.keys(variables));

    if (!hasValidUserData(variables)) {
      dataLogger.log('⚠️ [detectGameSessionState] 没有有效user数据，返回 empty');
      return 'empty';
    }

    dataLogger.log('   [Step 2] 检查第0楼之后是否已有有效assistant剧情...');
    const messages = getChatMessages('0-{{lastMessageId}}', {
      role: 'assistant',
      hide_state: 'all',
      include_swipes: true,
    }) as TavernChatMessage[];

    const hasAssistantStory = messages.some(message => {
      if (message.message_id <= 0) {
        return false;
      }

      const rawContent = resolveAssistantMessageRawContent(message);
      if (!rawContent.trim() || isFrontendLoaderOnlyMessage(rawContent)) {
        return false;
      }

      return normalizeDisplayedMessageContent(rawContent).length > 0;
    });

    if (hasAssistantStory) {
      dataLogger.log('✅ [detectGameSessionState] 已有有效剧情，返回 active');
      return 'active';
    }

    dataLogger.log('⚠️ [detectGameSessionState] 无有效剧情，返回 empty 进入启动页');
    return 'empty';
  } catch (error) {
    dataLogger.error('❌ [detectGameSessionState] 检查会话状态失败:', error);
    return 'empty';
  }
}

/**
 * 检查是否有保存的游戏存档。
 * @deprecated 新流程请使用 detectGameSessionState() 区分 empty/opening/active。
 */
export function hasSavedGame(): boolean {
  return detectGameSessionState() !== 'empty';
}

/**
 * 获取最后一条消息的内容
 */
export function getLastMessageContent(): string {
  dataLogger.log('');
  dataLogger.log('📨 [getLastMessageContent] 获取最后一条消息');

  try {
    dataLogger.log('   调用 getChatMessages("0-{{lastMessageId}}", { role: "assistant", include_swipes: true })...');
    const messages = getChatMessages('0-{{lastMessageId}}', {
      role: 'assistant',
      include_swipes: true,
    }) as TavernChatMessage[];

    dataLogger.log('   获取到消息数量:', messages.length);

    if (messages.length === 0) {
      dataLogger.log('⚠️ [getLastMessageContent] 没有 assistant 消息');
      return '';
    }

    let fallbackContent = '';

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const rawContent = resolveAssistantMessageRawContent(message);
      const normalizedContent = normalizeDisplayedMessageContent(rawContent);

      dataLogger.log(`   检查 assistant 消息 #${message.message_id}:`, {
        rawLength: rawContent.length,
        normalizedLength: normalizedContent.length,
        loaderOnly: isFrontendLoaderOnlyMessage(rawContent),
      });

      if (!fallbackContent && normalizedContent) {
        fallbackContent = normalizedContent;
      }

      if (!rawContent.trim()) {
        continue;
      }

      if (isFrontendLoaderOnlyMessage(rawContent)) {
        continue;
      }

      if (!normalizedContent) {
        continue;
      }

      dataLogger.log('✅ [getLastMessageContent] 命中有效正文，message_id:', message.message_id);
      dataLogger.log('✅ [getLastMessageContent] 返回内容长度:', normalizedContent.length);
      return normalizedContent;
    }

    dataLogger.warn('⚠️ [getLastMessageContent] 未找到有效正文，返回回退内容');
    return fallbackContent;
  } catch (error) {
    dataLogger.error('❌ [getLastMessageContent] 获取消息失败:', error);
    return '';
  }
}
