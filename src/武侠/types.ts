export enum GameMode {
  EXPLORE = 'EXPLORE',
  COMBAT = 'COMBAT',
  DIALOGUE = 'DIALOGUE',
}

export enum MessageType {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
  NARRATOR = 'NARRATOR',
}

// 本地聊天消息类型（用于 UI 显示，与酒馆的 ChatMessage 区分）
export interface LocalChatMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
}

// "初始属性"
export interface InitialAttributes {
  臂力: number;
  根骨: number;
  机敏: number;
  悟性: number;
  洞察: number;
  风姿: number;
  福缘: number;
}

// "属性" (Current stats)
// 注意：悟性不随境界变化，只存在于初始属性中
export interface CurrentAttributes {
  hp: number; // 气血
  mp: number; // 内力
  臂力: number;
  根骨: number;
  机敏: number;
  洞察: number;
}

// "武功" template structure (基础结构)
export interface MartialArt {
  type: string; // 类型
  description: string; // 功法描述
  rank: string; // 功法品阶
  mastery: string; // 掌握程度
  traits: Record<string, string>; // 特性（所有特性）
  unlockedTraits: Record<string, string>; // 已解锁的特性
  // 升级相关
  canUpgrade: boolean;
  upgradeCost: number;
  nextMastery: string | null;
}

// The main User Profile structure
export interface CharacterProfile {
  name: string; // Internal use, though not strictly in JSON, needed for UI
  gender: string; // 性别
  appearance: string; // 外貌（包含身材特征）
  birthYear: number; // 出生年份
  status: string; // 状态
  realm: string; // 境界
  cultivation: number; // 修为
  location: string; // 所在位置

  identities: Record<string, string>; // 身份: { Name: Desc }

  martialArts: Record<string, MartialArt>; // 武功: { Name: Template }

  initialAttributes: InitialAttributes; // 初始属性
  attributes: CurrentAttributes; // 属性

  // Note: Inventory is handled via the specific InventoryItem[] in GameState for the UI grid,
  // but conceptually belongs here.

  biography: Record<string, string> | string; // 人物经历 (Can be text or map)
  network: Record<string, string>; // 关系网

  已探索地点?: string[]; // 已探索的地点列表（用于地图系统）
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'SECRET' | 'EQUIP' | 'ELIXIR' | 'MISC';
  quality: string;
  count: number;
  description: string;
  // For SECRET type items, this holds martial art details
  martialArtInfo?: {
    description: string;
    rank: string;
    requirements?: Record<string, number>; // e.g., { "臂力": 20, "根骨": 15 }
  };
}

export interface GameEvent {
  id: string;
  title: string;
  type: 'RUMOR' | 'ACTIVE' | 'AFTERMATH';
  description: string;
  details?: string;
}

export interface NPC {
  id: string;
  name: string;
  relationship: number;
  template: {
    type: string;
    martialArtsDescription: string;
    martialArtsRank: string;
    mastery: string;
    traits: Record<string, string>;
  };
  keyItems: string[];
  biography: string;
  network: string[];
}

// 世界时间结构
export interface WorldTime {
  year: number;
  month: number;
  day: number;
  hour: number;
}

export interface GameState {
  currentLocation: string;
  gameTime: string;
  worldTime?: WorldTime; // 结构化的世界时间，用于计算年龄等
  mode: GameMode;
  stats: CharacterProfile; // Updated to new profile structure
  inventory: InventoryItem[];
  events: GameEvent[];
  social: NPC[];
}

export enum ActivePanel {
  NONE = 'NONE',
  CHARACTER = 'CHARACTER',
  MARTIAL_ARTS = 'MARTIAL_ARTS',
  EVENTS = 'EVENTS',
  INVENTORY = 'INVENTORY',
  MAP = 'MAP',
  SOCIAL = 'SOCIAL',
  SETTINGS = 'SETTINGS',
}

// ============================================
// 页面流程状态类型（酒馆助手规范）
// ============================================

/**
 * 页面状态枚举
 * StartScreen → SplashScreen → NewGameSetup → Game
 */
export type PageState = 'start' | 'splash' | 'setup' | 'game';

/**
 * 页面流程上下文
 */
export interface PageFlowContext {
  currentPage: PageState;
  hasSavedGame: boolean;
  isLoading: boolean;
  error?: string;
}

/**
 * 开局表单验证结果
 */
export interface FormValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * 属性名称映射
 */
export const ATTRIBUTE_NAMES: Record<keyof InitialAttributes, string> = {
  臂力: '臂力',
  根骨: '根骨',
  机敏: '机敏',
  悟性: '悟性',
  洞察: '洞察',
  风姿: '风姿',
  福缘: '福缘',
};

/**
 * 属性描述
 */
export const ATTRIBUTE_DESCRIPTIONS: Record<keyof InitialAttributes, string> = {
  臂力: '力量与体魄，影响近战伤害和负重',
  根骨: '根基与体质，影响气血上限和恢复',
  机敏: '身法与反应，影响闪避和出手速度',
  悟性: '悟性与理解，影响武学修炼速度',
  洞察: '洞察与感知，影响功法精进消耗',
  风姿: '风姿与气度，影响人际交往',
  福缘: '福缘与运势，影响随机事件结果',
};

// ============================================
// 新开局流程类型定义
// ============================================

/**
 * 天资类型 - 不同的开局点数配置
 */
export interface TalentTier {
  id: string;
  name: string;
  description: string;
  totalPoints: number; // 总可用点数
  icon: string;
}

/**
 * 角色天赋定义（简化版）
 * 只保留核心字段：name、description、cost（可选）、attributeThreshold（可选）
 * - 普通天赋：有 cost 字段（正数消耗点数，负数获得点数）
 * - 属性天赋：有 attributeThreshold 字段（由属性值自动触发）
 */
export interface CharacterTrait {
  name: string;
  description: string;
  cost?: number; // 正面天赋消耗点数（正数），负面天赋获得点数（负数）。属性天赋无此字段。
  attributeThreshold?: {
    attribute: keyof InitialAttributes;
    minValue?: number; // 触发最小值
    maxValue?: number; // 触发最大值
  };
}

/**
 * 判断天赋是正面还是负面
 * - cost > 0: 正面天赋（消耗点数）
 * - cost < 0: 负面天赋（获得点数）
 * - cost = 0 或无 cost: 中性天赋或属性天赋
 */
export function getTraitType(trait: CharacterTrait): '正面' | '负面' | '中性' {
  if (trait.cost === undefined || trait.cost === 0) return '中性';
  return trait.cost > 0 ? '正面' : '负面';
}

/**
 * 属性天赋类别
 * - 天残 (C): 属性值为 0
 * - 愚钝 (D): 属性值为 1-4
 * - 天才 (A): 属性值为 12-16
 * - 妖孽 (B): 属性值为 17-20
 */
export type AttributeTraitCategory = '天残' | '愚钝' | '天才' | '妖孽';

/**
 * 属性区间对应的点数收益/消耗
 */
export interface AttributePointCost {
  min: number;
  max: number;
  pointsGained: number; // 正数表示获得点数，负数表示消耗额外点数
  costPerPoint: number; // 每点消耗的点数
  triggeredTraitType?: 'positive' | 'negative'; // 触发的天赋类型
}

/**
 * 境界等级定义
 */
export type RealmLevel =
  | '不入流'
  | '三流-初入'
  | '三流-小成'
  | '三流-圆满'
  | '二流-初入'
  | '二流-小成'
  | '二流-圆满'
  | '一流-初入'
  | '一流-小成'
  | '一流-圆满'
  | '绝顶-初入'
  | '绝顶-小成'
  | '绝顶-圆满';

/**
 * 出身类别
 */
export type OriginCategory = '江湖门派' | '世家豪门' | '平民百姓' | '特殊身份' | '自定义';

/**
 * 出身自带物品的结构
 */
export interface OriginItemInfo {
  类型: string;
  品质: string;
  物品描述: string;
  数量: number;
}

/**
 * 出身选项
 */
export interface OriginOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: OriginCategory;
  realm: RealmLevel;
  cultivation?: number; // 可选：自定义修为值
  items?: Record<string, OriginItemInfo>;
  martial_arts?: { name: string; mastery: string }[];
}

/**
 * 开局存档数据
 */
export interface CharacterBuild {
  id: string;
  name: string;
  note?: string; // 备注信息，用于区分同名角色
  createdAt: number;
  talentTier: string;
  attributes: InitialAttributes;
  traits: string[]; // 天赋ID列表
  martialArts: string[]; // 武功名称列表
  origin: string;
  locationInfo: {
    year: number;
    month: number;
    day: number;
    location: string;
    eventName?: string;
  };
  characterInfo: {
    name: string;
    gender: '男' | '女';
    appearance: string; // 外貌（包含身材特征）
    age: number;
  };
}

/**
 * 开局流程步骤
 */
export type SetupStep =
  | 'talent' // 1. 天资选择
  | 'attributes' // 2. 七维点数分配
  | 'traits' // 3. 天赋选择
  | 'martial' // 4. 武功选择
  | 'origin' // 5. 出身和时间地点
  | 'identity' // 6. 个人身份设置
  | 'confirm'; // 7. 确认保存

/**
 * 开局表单完整数据
 */
export interface NewGameFormDataV2 {
  // 步骤1: 天资
  talentTierId: string;
  totalPoints: number;
  remainingPoints: number;

  // 步骤2: 属性
  attributes: InitialAttributes;
  attributeTriggeredTraits: string[]; // 由属性触发的天赋

  // 步骤3: 天赋
  selectedTraits: string[];

  // 步骤4: 武功
  selectedMartialArts: string[];

  // 步骤5: 出身和时间地点
  origin: string;
  customOrigin?: string;
  locationInfo: {
    year: number;
    month: number;
    day: number;
    location: string;
    eventName?: string;
  };
  useEventLocation: boolean;

  // 步骤6: 个人身份
  characterName: string;
  gender: '男' | '女';
  appearance: string; // 外貌（包含身材特征）
  age: number;
}

/**
 * 外貌描述模板（根据风姿值生成）
 */
export interface AppearanceTemplate {
  gender: '男' | '女';
  charismaRange: { min: number; max: number };
  templates: string[];
}

/**
 * 外貌描述模板说明
 * 外貌字段现在包含了原来的身材描述
 * AppearanceTemplate 可根据风姿、臂力、根骨综合生成外貌描述
 */

// ============================================
// 地图系统类型定义
// ============================================

/**
 * 地图坐标
 */
export interface MapCoordinate {
  x: number;
  y: number;
}

/**
 * 小地点（第三级）
 */
export interface MapLocation {
  描述: string;
  坐标: MapCoordinate;
  初始探索: boolean;
  解锁条件?: string;
}

/**
 * 中区域（第二级）
 */
export interface MapRegion {
  描述: string;
  类型: '中区域';
  坐标: MapCoordinate;
  地点: Record<string, MapLocation>;
}

/**
 * 大区域（第一级）
 */
export interface MapArea {
  描述: string;
  类型: '大区域';
  坐标: MapCoordinate;
  子区域: Record<string, MapRegion>;
}

/**
 * 完整地图数据结构
 */
export interface MapData {
  [areaName: string]: MapArea;
}

// ============================================
// 指令队列系统类型定义
// ============================================

/**
 * 待发送指令类型
 */
export type CommandType = 'TRAVEL' | 'USE_ITEM';

/**
 * 待发送指令
 */
export interface PendingCommand {
  id: string;
  type: CommandType;
  text: string;
  data: {
    location?: string;
    itemName?: string;
    originalCount?: number; // 用于撤销物品使用
  };
  timestamp: number;
}
