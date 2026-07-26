/** NBA2K16 生涯模拟 · 核心类型 */

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export type Conference = 'East' | 'West';

/** 球员细项属性，0-99，对齐 data/players.json */
export interface PlayerAttrs {
  insideScoring: number;
  outsideScoring: number;
  threePoint: number;
  midRange: number;
  freeThrow: number;
  layup: number;
  dunk: number;
  speed: number;
  ballHandle: number;
  passing: number;
  perimeterD: number;
  interiorD: number;
  steal: number;
  block: number;
  offRebound: number;
  defRebound: number;
  stamina: number;
  strength: number;
  potential: number;
}

export interface PlayerData {
  name: string;
  cn: string;
  team: string;
  pos: Position;
  secondaryPos: Position | null;
  height_cm: number;
  number: number;
  overall: number;
  attrs: PlayerAttrs;
}

export interface TeamData {
  id: string;
  name: string;
  cn: string;
  conference: Conference;
  division: string;
  overall: number;
  colors: { primary: string; secondary: string };
}

/** 场上一名球员的实时状态（stat_data.比赛.球员状态[key]） */
export interface OnCourtStatus {
  体力: number;
  得分: number;
  篮板: number;
  助攻: number;
  抢断: number;
  盖帽: number;
  失误: number;
  犯规: number;
  手感: '热' | '平' | '冷';
}

/** 球场俯视图坐标：x 0-100 左端线→右端线，y 0-100 下边线→上边线 */
export interface CourtSpot {
  球员: string;
  x: number;
  y: number;
  持球?: boolean;
}

export type Side = '主' | '客';

export interface MatchState {
  进行中: boolean;
  对阵: { 主队: string; 客队: string };
  节次: number;
  剩余秒数: number;
  比分: { 主: number; 客: number };
  球权: Side;
  战术: { 主: string; 客: string };
  站位: { 主: CourtSpot[]; 客: CourtSpot[] };
  球员状态: Record<string, OnCourtStatus>;
  回合摘要: string;
}

/** 玩家可选动作 */
export type ActionType =
  | '突破'
  | '中投'
  | '三分'
  | '内线终结'
  | '传球'
  | '组织'
  | '挡拆'
  | '无球跑动'
  | '抢断'
  | '盖帽'
  | '篮板'
  | '贴身防守'
  | '协防';

export type ResultTier = '大成功' | '成功' | '部分成功' | '失败' | '大失败';

/** 一次判定的完整结果，交给 promptBuilder 注入 user 消息 */
export interface ActionResolution {
  action: ActionType;
  actor: string;
  /** 对位/受方球员 key，无对位时为 null（如无球跑动） */
  defender: string | null;
  /** 挡拆掩护人、传球目标等第二参与者 */
  partner: string | null;
  attackScore: number;
  defenseScore: number;
  baseRate: number;
  modifiers: { label: string; value: number }[];
  finalRate: number;
  roll: number;
  tier: ResultTier;
  /** 面向 AI 的一句话结果描述 */
  summary: string;
}

/** 判定时的情境输入 */
export interface SituationContext {
  /** 当前动作发起方是否主队 */
  isHome: boolean;
  /** 关键时刻：第4节及以后最后2分钟且分差≤5 */
  isClutch: boolean;
  /** 空位程度：open 空位 / normal 常规 / tight 严防 */
  coverage: 'open' | 'normal' | 'tight';
  /** 挡拆刚创造出错位 */
  mismatch: boolean;
  /** 对位防守人犯规数 */
  defenderFouls: number;
}
