/** NBA2K16 生涯模拟 · v3 核心类型 */

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type Conference = 'East' | 'West';
export type Side = '主' | '客';

/** 旧球员表的 19 项种子数据，仅供 deterministic adapter 使用。 */
export interface LegacyPlayerAttrs {
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

export interface PlayerRatingsV3 {
  standingLayup: number;
  drivingLayup: number;
  postFade: number;
  postHook: number;
  postControl: number;
  drawFoul: number;
  movingClose: number;
  standingClose: number;
  movingMid: number;
  standingMid: number;
  movingThree: number;
  standingThree: number;
  freeThrow: number;
  ballControl: number;
  passVision: number;
  passIQ: number;
  passAccuracy: number;
  offRebound: number;
  standingDunk: number;
  drivingDunk: number;
  contactDunk: number;
  shotIQ: number;
  hands: number;
  defRebound: number;
  block: number;
  shotContest: number;
  steal: number;
  onBallDefenseIQ: number;
  lowPostDefenseIQ: number;
  reactionTime: number;
  boxout: number;
  lateralQuickness: number;
  speed: number;
  acceleration: number;
  vertical: number;
  strength: number;
  stamina: number;
  hustle: number;
  durability: number;
  offensiveConsistency: number;
  defensiveConsistency: number;
  composure: number;
  potential: number;
}

/** 兼容既有模块名；v3 后 PlayerAttrs 即 43 项能力。 */
export type PlayerAttrs = PlayerRatingsV3;

export interface BodyProfile {
  heightCm: number;
  weightKg: number;
  wingspanCm: number;
}

export interface LegacyPlayerData {
  name: string;
  cn: string;
  team: string;
  pos: Position;
  secondaryPos: Position | null;
  height_cm: number;
  number: number;
  overall: number;
  attrs: LegacyPlayerAttrs;
}

export interface PlayerData {
  name: string;
  cn: string;
  team: string;
  pos: Position;
  secondaryPos: Position | null;
  body: BodyProfile;
  /** 兼容球场/旧组件读取，始终等于 body.heightCm。 */
  height_cm: number;
  number: number;
  overall: number;
  attrs: PlayerRatingsV3;
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

export type UpgradeGroupKey =
  | 'offDribble'
  | 'finishing'
  | 'midRange'
  | 'threePoint'
  | 'postScoring'
  | 'agility'
  | 'strength'
  | 'rebounding'
  | 'playmaking'
  | 'defending';

export type UpgradeGroupState = Record<UpgradeGroupKey, number>;
export type CreationMode = '2K16模式' | '自由模拟模式';
export type CreationStyle = '均衡' | '外线' | '内线';

export interface PlayerDevelopment {
  mode: CreationMode;
  style: CreationStyle;
  groups: UpgradeGroupState;
  growthPoints: number;
  lastTrainingDate: string | null;
}

export interface DynamicTendencyEntry { value: number; samples: number }
export interface DynamicTendencies { families: Record<string, DynamicTendencyEntry> }
export type BadgeLevel = '未解锁' | '铜' | '银' | '金';
export interface DynamicBadgeState { level: BadgeLevel; progress: number }
export interface DynamicBadges { badges: Record<string, DynamicBadgeState> }
export type HotZoneState = '热' | '中性' | '冷';
export interface HotZoneRecord { makes: number; attempts: number; state: HotZoneState }
export interface DynamicHotZones { zones: Record<string, HotZoneRecord> }

export interface OnCourtStatus {
  体力: number;
  得分: number;
  篮板: number;
  助攻: number;
  抢断: number;
  盖帽: number;
  失误: number;
  犯规: number;
  投篮命中: number;
  投篮出手: number;
  三分命中: number;
  三分出手: number;
  罚球命中: number;
  罚球出手: number;
  进攻篮板: number;
  防守篮板: number;
  上场秒数: number;
  手感: '热' | '平' | '冷';
  连续命中: number;
  连续打铁: number;
}

export interface CourtSpot { 球员: string; x: number; y: number; 持球?: boolean }
export type TurnPhase = '常规回合' | '篮板争抢' | '罚球结算' | '死球';
export interface LineupState { 场上: string[]; 替补: string[] }

export type OffensiveScheme = '基础' | '五外' | '四外一内' | '挡拆' | '低位' | '动态进攻';
export type DefensiveScheme = '人盯人' | '二三联防' | '换防' | '沉退' | '延误';
export interface StructuredTeamTactics {
  offense: OffensiveScheme;
  defense: DefensiveScheme;
  pace: '慢' | '标准' | '快';
  helpIntensity: number;
  rebound: '优先退防' | '均衡' | '冲抢';
}

export type PendingMatchSituation =
  | { type: 'none' }
  | { type: 'rebound'; shootingSide: Side; shooter: string; zone: string }
  | { type: 'freeThrow'; shootingSide: Side; shooter: string; remaining: number; total: number }
  | { type: 'deadBall'; reason: string; inboundSide: Side };

export interface MatchState {
  进行中: boolean;
  对阵: { 主队: string; 客队: string };
  节次: number;
  剩余秒数: number;
  投篮时钟: number;
  比分: { 主: number; 客: number };
  球权: Side;
  跳球胜方: Side;
  战术: { 主: StructuredTeamTactics; 客: StructuredTeamTactics };
  站位: { 主: CourtSpot[]; 客: CourtSpot[] };
  本节球队犯规: { 主: number; 客: number };
  暂停: { 主: number; 客: number };
  阵容: { 主: LineupState; 客: LineupState };
  回合阶段: TurnPhase;
  待处理情境: PendingMatchSituation;
  回合情境: string;
  球员状态: Record<string, OnCourtStatus>;
  回合摘要: string;
}

export type ActionType =
  | '定点投篮' | '急停投篮' | '后撤步' | '突破终结' | '突破分球' | '突破急停'
  | '安全传球' | '跨场转移' | '挡拆突破' | '顺下传球' | '外弹传球' | '背身单打'
  | '空切' | '外移接球' | '无球掩护'
  | '保持身位' | '贴身施压' | '赌博抢断' | '协防' | '换防' | '封盖干扰'
  | '卡位' | '防守篮板' | '冲抢进攻篮板'
  | '观察' | '模拟一个回合';

export type ActionFamily = '投篮' | '突破' | '传球' | '挡拆' | '背身' | '无球' | '防守' | '篮板' | '替补';
export type ResultTier = '大成功' | '成功' | '部分成功' | '失败' | '大失败';
export interface NumericRange { min: number; max: number }
export interface ResolutionStage { id: string; label: string; attackScore: number; defenseScore: number; successRate: number; roll: number; tier: ResultTier }

export interface ActionIntent {
  action: ActionType;
  family: ActionFamily;
  actor: string;
  partner: string | null;
  targetZone?: string;
}

export interface StatDelta {
  player: string;
  stat: keyof OnCourtStatus;
  value: number;
}

export interface SettlementBranch {
  id: string;
  label: string;
  scoreDelta: { 主: number; 客: number };
  possession: Side;
  nextPhase: TurnPhase;
  statDeltas: StatDelta[];
  pending: PendingMatchSituation;
}

export interface SettlementContract {
  id: string;
  intent: ActionIntent;
  stages: ResolutionStage[];
  tier: ResultTier;
  branches: SettlementBranch[];
  referenceBranchId: string;
  clockSeconds: NumericRange;
  shotClockSeconds: NumericRange;
  staminaDelta: { actor: NumericRange; partner?: NumericRange };
  allowedPlayers: string[];
  allowedStatePaths: string[];
}

export interface SettlementProposal {
  contractId: string;
  branchId: string;
  clockSeconds: number;
  shotClockSeconds: number;
  staminaDelta: { actor: number; partner?: number };
  positions?: { 主: CourtSpot[]; 客: CourtSpot[] };
  summary: string;
}

export interface NormalizedSettlement extends SettlementProposal {
  branch: SettlementBranch;
  source: 'model' | 'repair' | 'fallback';
}

export interface ActionResolution {
  intent: ActionIntent;
  action: ActionType;
  actor: string;
  defender: string | null;
  defenders: string[];
  partner: string | null;
  stages: ResolutionStage[];
  attackScore: number;
  defenseScore: number;
  baseRate: number;
  modifiers: { label: string; value: number }[];
  finalRate: number;
  roll: number;
  tier: ResultTier;
  contract: SettlementContract;
  summary: string;
}

export interface SituationContext {
  isHome: boolean;
  isClutch: boolean;
  coverage: 'open' | 'normal' | 'tight';
  mismatch: boolean;
  defenderFouls: number;
  actorSpot?: CourtSpot;
  defenderSpots?: CourtSpot[];
  teammateSpots?: CourtSpot[];
  offenseTactic?: StructuredTeamTactics;
  defenseTactic?: StructuredTeamTactics;
  hotZoneModifier?: number;
  badgeModifier?: number;
}

export type ReboundSide = '进攻篮板' | '防守篮板';
