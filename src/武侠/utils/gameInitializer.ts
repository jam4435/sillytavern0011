/**
 * 游戏初始化工具
 * 用于创建开局楼层和初始化游戏状态
 */

import type {
  AppearanceRangeTemplate,
  AppearanceTemplateData,
  AttributePointCost,
  InitialAttributes,
  OriginItemInfo,
  OriginOption,
  RealmLevel,
  TalentTier,
} from '../types';
import { ATTRIBUTE_NAMES } from '../types';
import {
  calculateAllAttributes,
  type InitialAttributes as ChineseInitialAttributes,
  type MartialArtForCalculation,
} from './attributeCalculator';
import { initLogger } from './logger';
import { clearAvatarSelection, createAvatarEntityKey } from './avatarStorage';
import { EVENT_RUNTIME_KEY_VERSION } from '../../shared/eventKey.js';

// 从天赋数据库导入天赋相关内容，并重新导出供其他模块使用
import { CHARACTER_TRAITS, getTriggeredTraitsByAttribute } from './traitsDatabase';
export { CHARACTER_TRAITS, getTriggeredTraitsByAttribute };

// 从 data 文件夹导入静态数据
import eventsData from '../data/事件信息汇总.json';
import originOptionsData from '../data/出身选项.json';
import realmSystemData from '../data/境界系统.json';
import appearanceTemplatesData from '../data/外貌描述模板.json';
import talentTiersData from '../data/天资等级.json';
import attributePointCostsData from '../data/属性点数消耗表.json';
import openingLinesData from '../data/开场白.json';
import martialArtsOptionsData from '../data/武功选项.json';

// ============================================
// 新开局流程常量数据
// ============================================

/**
 * 天资等级常量
 */
export const TALENT_TIERS: TalentTier[] = talentTiersData as TalentTier[];

/**
 * 属性点数消耗表
 */
export const ATTRIBUTE_POINT_COSTS: AttributePointCost[] =
  attributePointCostsData.attributePointCosts as AttributePointCost[];

/**
 * 福缘属性点数消耗表
 */
export const LUCK_ATTRIBUTE_POINT_COSTS: AttributePointCost[] =
  attributePointCostsData.luckAttributePointCosts as AttributePointCost[];

export function getAttributePointCost(value: number): AttributePointCost | undefined {
  return ATTRIBUTE_POINT_COSTS.find(cost => value >= cost.min && value <= cost.max);
}

export function getLuckAttributePointCost(value: number): AttributePointCost | undefined {
  return LUCK_ATTRIBUTE_POINT_COSTS.find(cost => value >= cost.min && value <= cost.max);
}

export function calculateAttributeCost(targetValue: number): number {
  const baseValue = 6;
  if (targetValue === baseValue) return 0;

  let totalCost = 0;
  const direction = targetValue > baseValue ? 1 : -1;
  let currentValue = baseValue;

  while (currentValue !== targetValue) {
    const nextValue = currentValue + direction;
    const costRule = getAttributePointCost(nextValue);
    if (costRule) {
      if (direction > 0) {
        totalCost += costRule.costPerPoint;
      } else {
        totalCost -= costRule.pointsGained;
      }
    }
    currentValue = nextValue;
  }

  return totalCost;
}

export function calculateLuckAttributeCost(targetValue: number): number {
  const baseValue = 0;
  if (targetValue === baseValue) return 0;

  let totalCost = 0;
  const direction = targetValue > baseValue ? 1 : -1;
  let currentValue = baseValue;

  while (currentValue !== targetValue) {
    const nextValue = currentValue + direction;
    const costRule = getLuckAttributePointCost(nextValue);
    if (costRule) {
      if (direction > 0) {
        totalCost += costRule.costPerPoint;
      } else {
        totalCost -= costRule.pointsGained;
      }
    }
    currentValue = nextValue;
  }

  return totalCost;
}

export const APPEARANCE_TEMPLATES: AppearanceTemplateData = appearanceTemplatesData as AppearanceTemplateData;

type AppearanceAttributes = Pick<InitialAttributes, '风姿' | '臂力' | '根骨'>;

function findAppearanceRange(ranges: AppearanceRangeTemplate[], value: number): AppearanceRangeTemplate | undefined {
  return ranges.find(({ range }) => value >= range.min && value <= range.max);
}

function pickAppearanceFragment(range: AppearanceRangeTemplate | undefined, fallback: string): string {
  if (!range || range.templates.length === 0) {
    return fallback;
  }

  const randomIndex = Math.floor(Math.random() * range.templates.length);
  return range.templates[randomIndex] ?? fallback;
}

function getAppearanceRangeIndex(ranges: AppearanceRangeTemplate[], value: number): number {
  const index = ranges.findIndex(({ range }) => value >= range.min && value <= range.max);
  return index >= 0 ? index : 2;
}

export function getRandomAppearance(gender: '男' | '女', attributes: AppearanceAttributes): string {
  const faceRange = findAppearanceRange(APPEARANCE_TEMPLATES.face[gender], attributes.风姿);
  const frameRange = findAppearanceRange(APPEARANCE_TEMPLATES.frame, attributes.根骨);
  const strengthRange = findAppearanceRange(APPEARANCE_TEMPLATES.strength, attributes.臂力);

  const face = pickAppearanceFragment(faceRange, gender === '男' ? '五官端正，神情平和' : '眉目端正，神情平和');
  const frame = pickAppearanceFragment(frameRange, '骨架匀称，气息平稳');
  const strength = pickAppearanceFragment(strengthRange, '四肢松紧适中，举止自然');

  const frameIndex = getAppearanceRangeIndex(APPEARANCE_TEMPLATES.frame, attributes.根骨);
  const strengthIndex = getAppearanceRangeIndex(APPEARANCE_TEMPLATES.strength, attributes.臂力);
  const bodyConnector = Math.abs(frameIndex - strengthIndex) >= 2 ? '，却' : '，';

  return `${face}；${frame}${bodyConnector}${strength}。`;
}

export interface EventLocation {
  year: number;
  month: number;
  day: number;
  hour?: number;
  location: string;
  eventName?: string;
}

export interface StoryEvent {
  id: string;
  name: string;
  year: number;
  month: number;
  day: number;
  hour?: number;
  location: string;
}

export interface MartialArtOption {
  id: string;
  name: string;
  type: string;
  rank: string;
  description: string;
  mastery: string;
  traits: Record<string, string>;
}

export const REALM_CULTIVATION_MAP: Record<RealmLevel, number> = realmSystemData.realmCultivationMap;

export const REALM_LEVELS: RealmLevel[] = realmSystemData.realmLevels as RealmLevel[];

interface EventJsonItem {
  事件名称: string;
  事件地点: string;
  触发时间: {
    年: number;
    月: number;
    日: number;
    时?: number;
  };
}

export const STORY_EVENTS: StoryEvent[] = (eventsData as EventJsonItem[]).map((event, index) => ({
  id: `event_${index + 1}`,
  name: event.事件名称,
  year: event.触发时间.年,
  month: event.触发时间.月,
  day: event.触发时间.日,
  ...(event.触发时间.时 !== undefined ? { hour: event.触发时间.时 } : {}),
  location: event.事件地点,
}));

export const MARTIAL_ARTS_OPTIONS: MartialArtOption[] = martialArtsOptionsData as unknown as MartialArtOption[];

export const ORIGIN_OPTIONS: OriginOption[] = originOptionsData as OriginOption[];

export function getOriginById(originId: string): OriginOption | undefined {
  return ORIGIN_OPTIONS.find(o => o.id === originId);
}

export function getOriginRealmAndCultivation(originId: string): { realm: RealmLevel; cultivation: number } {
  const origin = getOriginById(originId);
  if (!origin) {
    return { realm: '三流圆满', cultivation: 200 };
  }
  const realm = origin.realm;
  const cultivation = origin.cultivation ?? REALM_CULTIVATION_MAP[realm];
  return { realm, cultivation };
}

export const OPENING_LINES: string[] = openingLinesData as string[];

export function getRandomOpeningLine(): string {
  const randomIndex = Math.floor(Math.random() * OPENING_LINES.length);
  return OPENING_LINES[randomIndex];
}

export interface NewGameFormData {
  name: string;
  gender: '男' | '女';
  avatarRef?: string;
  appearance: string;
  age: number;
  locationInfo: EventLocation;
  initialAttributes: InitialAttributes;
  martialArtId: string;
  selectedMartialArts?: string[];
  selectedTraits?: string[]; // 选择的天赋名称列表
  originItems?: Record<string, OriginItemInfo>;
  originMartialArts?: { name: string; mastery: string }[];
  origin: string;
  originId: string;
  customRealm?: RealmLevel;
}

export const DEFAULT_ATTRIBUTES: InitialAttributes = {
  臂力: 6,
  根骨: 6,
  机敏: 6,
  悟性: 6,
  洞察: 6,
  风姿: 6,
  福缘: 0,
};

export const TOTAL_ATTRIBUTE_POINTS = 62;
export const MAX_ATTRIBUTE_VALUE = 20;
export const MIN_ATTRIBUTE_VALUE = 0;
export const MAX_LUCK_VALUE = 14;
export const MIN_LUCK_VALUE = -6;

export function generateVariableData(formData: NewGameFormData): Record<string, unknown> {
  const {
    name,
    gender,
    avatarRef,
    appearance,
    age,
    locationInfo,
    initialAttributes,
    martialArtId,
    selectedMartialArts,
    selectedTraits,
    originItems,
    originMartialArts,
    origin,
    originId,
    customRealm,
  } = formData;

  const birthYear = locationInfo.year - age;
  const martialArtsObj: Record<string, unknown> = {};
  const martialArtsForCalc: Record<string, MartialArtForCalculation> = {};

  const combinedMartialArts = [...(originMartialArts || [])];
  if (selectedMartialArts) {
    for (const artName of selectedMartialArts) {
      if (!combinedMartialArts.some(a => a.name === artName)) {
        combinedMartialArts.push({ name: artName, mastery: '初窥门径' });
      }
    }
  }

  for (const art of combinedMartialArts) {
    martialArtsObj[art.name] = {
      掌握程度: art.mastery,
    };
    martialArtsForCalc[art.name] = {
      type: '',
      rank: '粗浅',
      mastery: art.mastery,
    };
  }

  if (combinedMartialArts.length === 0 && martialArtId) {
    const selectedMartialArt = MARTIAL_ARTS_OPTIONS.find(m => m.id === martialArtId);
    if (selectedMartialArt) {
      martialArtsObj[selectedMartialArt.name] = {
        掌握程度: selectedMartialArt.mastery,
      };
      martialArtsForCalc[selectedMartialArt.name] = {
        type: selectedMartialArt.type,
        rank: selectedMartialArt.rank,
        mastery: selectedMartialArt.mastery,
      };
    }
  }

  // 处理天赋数据：将选择的天赋转换为键值对（天赋名：天赋描述）
  const traitsObj: Record<string, string> = {};
  if (selectedTraits && selectedTraits.length > 0) {
    // 添加选择的天赋
    for (const traitName of selectedTraits) {
      const trait = CHARACTER_TRAITS.find(t => t.name === traitName);
      if (trait) {
        traitsObj[trait.name] = trait.description;
      }
    }
  }

  // 添加属性触发的天赋（无论是否选择了天赋都要检查）
  for (const key of Object.keys(initialAttributes) as Array<keyof InitialAttributes>) {
    const triggeredTraits = getTriggeredTraitsByAttribute(key, initialAttributes[key]);
    for (const trait of triggeredTraits) {
      traitsObj[trait.name] = trait.description;
    }
  }

  let realm: RealmLevel;
  let cultivation: number;

  if (originId === 'custom' && customRealm) {
    realm = customRealm;
    cultivation = REALM_CULTIVATION_MAP[customRealm];
  } else {
    const realmInfo = getOriginRealmAndCultivation(originId);
    realm = realmInfo.realm;
    cultivation = realmInfo.cultivation;
  }

  const chineseInitialAttrs: ChineseInitialAttributes = {
    臂力: initialAttributes.臂力,
    根骨: initialAttributes.根骨,
    机敏: initialAttributes.机敏,
    悟性: initialAttributes.悟性,
    洞察: initialAttributes.洞察,
  };

  const { combat, resources } = calculateAllAttributes(chineseInitialAttrs, realm, martialArtsForCalc);

  const variableData = {
    世界信息: {
      时间: {
        年: locationInfo.year,
        月: locationInfo.month,
        日: locationInfo.day,
        时: locationInfo.hour ?? 11,
        分: 0,
        $meta: { updatable: true, necessary: 'all' },
      },
      $meta: { necessary: 'all', updatable: true },
    },
    附近传闻: {},
    事件系统: {
      未发生事件: {},
      进行中事件: {},
      已完成事件: {},
      已失效事件: {},
      人物事件占用: {},
      $meta: { necessary: 'self', updatable: true },
    },
    参与事件: {},
    世界事件: {},
    事件分支结果: {},
    前端变量: {
      事件结局状态: {},
      事件运行时键版本: EVENT_RUNTIME_KEY_VERSION,
      头像: {
        ...(avatarRef ? { 玩家: avatarRef } : {}),
        人物: {},
      },
      头像版本: 1,
    },
    user数据: {
      用户名: name,
      性别: gender,
      外貌: appearance,
      出生年份: birthYear,
      状态: '健康',
      境界: realm,
      修为: cultivation,
      所在位置: locationInfo.location,
      身份: {
        [origin]: '初入江湖的新人',
      },
      功法: {
        $template: {
          类型: '',
          功法描述: '',
          功法品阶: '',
          掌握程度: '',
          特性: {
            初窥门径: '',
          },
        },
        ...martialArtsObj,
      },
      初始属性: {
        ...initialAttributes,
      },
      天赋: {
        ...traitsObj,
      },
      属性: {
        气血: `${resources.气血上限}/${resources.气血上限}`,
        内力: `${resources.内力上限}/${resources.内力上限}`,
        臂力: combat.臂力,
        根骨: combat.根骨,
        机敏: combat.机敏,
        洞察: combat.洞察,
      },
      包裹: {
        $template: {
          类型: '',
          品阶: '',
          物品描述: '',
          数量: 0,
          功效类型: '',
          部位: '',
          属性修正: {},
          使用状态: '',
          持续时间: '',
        },
        ...originItems,
      },
      装备栏: {
        $template: '',
      },
      状态效果: {
        $template: {
          类型: '',
          功效类型: '',
          来源: '',
          品阶: '',
          属性修正: {},
          持续时间: 0,
          剩余时间: 0,
        },
      },
      人物经历: {},
      关系网: {},
      $meta: { necessary: 'self', updatable: true },
    },
    角色数据: {
      $template: {
        性别: '',
        外貌: '',
        性格: '',
        境界: '',
        初始属性: { 臂力: 0, 根骨: 0, 机敏: 0, 悟性: 0, 洞察: 0 },
        属性: { 气血: '0/0', 内力: '0/0', 臂力: 0, 根骨: 0, 机敏: 0, 洞察: 0 },
        出生年份: 0,
        状态: '',
        所在位置: '',
        身份: {},
        功法: {
          $template: {
            类型: '',
            功法描述: '',
            功法品阶: '',
            掌握程度: '',
            特性: { 初窥门径: '' },
          },
        },
        重要物品: {},
        人物经历: {},
        关系网: {},
        $meta: { necessary: 'self', updatable: true },
      },
    },
  };

  return variableData;
}

export function generateVariableInsertString(formData: NewGameFormData): string {
  const variableData = generateVariableData(formData);
  return JSON.stringify(variableData, null, 2);
}

export function generateOpeningMessage(formData: NewGameFormData): string {
  const variableInsert = generateVariableInsertString(formData);
  return `<VariableInsert>
${variableInsert}
</VariableInsert>`;
}

export interface OpeningStoryResult {
  success: boolean;
  content?: string;
  error?: string;
}

export async function initializeNewGameSession(formData: NewGameFormData): Promise<OpeningStoryResult> {
  try {
    const openingLine = getRandomOpeningLine();
    const variableData = generateVariableData(formData);

    // 变量写入是后续 ERA 事件初始化的前置条件，必须等待酒馆确认写入完成。
    await updateVariablesWith(
      variables => ({
        ...variables,
        stat_data: variableData,
      }),
      { type: 'chat' },
    );

    // 写入完成后回读一次，避免在异步落盘前发送 GameInitialized，导致事件脚本读到旧的 stat_data。
    const persistedVariables = await getVariables({ type: 'chat' });
    const persistedStatData = persistedVariables?.stat_data;
    const expectedStatData = variableData as {
      世界信息: { 时间: { 年: number; 月: number; 日: number; 时: number; 分: number } };
      前端变量: { 事件运行时键版本: number };
    };
    const expectedTime = expectedStatData.世界信息.时间;
    const persistedTime = persistedStatData?.世界信息?.时间;
    const runtimeKeyVersion = persistedStatData?.前端变量?.事件运行时键版本;
    const timeConfirmed =
      persistedTime?.年 === expectedTime.年 &&
      persistedTime?.月 === expectedTime.月 &&
      persistedTime?.日 === expectedTime.日 &&
      persistedTime?.时 === expectedTime.时 &&
      persistedTime?.分 === expectedTime.分;
    if (!timeConfirmed || runtimeKeyVersion !== expectedStatData.前端变量.事件运行时键版本) {
      throw new Error('新游戏变量写入后回读校验失败，未发送 GameInitialized 信号');
    }

    clearAvatarSelection(createAvatarEntityKey('player'));

    await setChatMessages([{ message_id: 0, is_hidden: true }], { refresh: 'none' });

    const initializationSignal = { timestamp: Date.now(), formData };
    initializeGlobal('GameInitialized', initializationSignal);
    // 不等待事件脚本的完整初始化，避免前端开局请求被 ERA 的历史事件处理阻塞。
    // 但要接住异步监听器错误，避免产生 unhandled rejection。
    void eventEmit('GameInitialized', initializationSignal).catch(error => {
      initLogger.error('❌ 发送 GameInitialized 信号失败:', error);
    });

    return { success: true, content: openingLine };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    initLogger.error('❌ 初始化新游戏失败:', error);
    return { success: false, error: errorMessage };
  }
}

/** @deprecated 新开局不再创建assistant开场楼，请使用 initializeNewGameSession。 */
export async function createOpeningStoryMessage(formData: NewGameFormData): Promise<OpeningStoryResult> {
  return initializeNewGameSession(formData);
}

export function validateAttributes(attributes: InitialAttributes): { valid: boolean; message?: string } {
  const total = Object.values(attributes).reduce((sum, val) => sum + val, 0);

  if (total !== TOTAL_ATTRIBUTE_POINTS) {
    return {
      valid: false,
      message: `属性点总和必须为 ${TOTAL_ATTRIBUTE_POINTS}，当前为 ${total}`,
    };
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (key !== '福缘' && value < MIN_ATTRIBUTE_VALUE) {
      return {
        valid: false,
        message: `${ATTRIBUTE_NAMES[key as keyof InitialAttributes]} 不能低于 ${MIN_ATTRIBUTE_VALUE}`,
      };
    }
    if (value > MAX_ATTRIBUTE_VALUE) {
      return {
        valid: false,
        message: `${ATTRIBUTE_NAMES[key as keyof InitialAttributes]} 不能超过 ${MAX_ATTRIBUTE_VALUE}`,
      };
    }
  }

  return { valid: true };
}
