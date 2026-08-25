import type {
  InitialAttributes,
  MeridianFinalAttribute,
  MeridianId,
  MeridianNodeId,
  MeridianNodeView,
  MeridianProgressNormalization,
  MeridianProgressV1,
  MeridianProjection,
  MeridianSettlement,
  MeridianStageId,
  MeridianSummary,
  MeridianUpgradeQuote,
  MeridianUpgradeResult,
  MeridianViewSide,
} from '../types';
import { getBreakthroughCost, MAJOR_REALMS, parseRealm } from './realmSystem';

export const MERIDIAN_PROGRESS_VERSION = 1 as const;
export const MERIDIAN_COST_RATIOS = [0.08, 0.12, 0.18, 0.25, 0.37] as const;
export const MERIDIAN_ORDINARY_BONUS = 3;
export const MERIDIAN_GATE_INITIAL_BONUS = 1;
export const MERIDIAN_GATE_FALLBACK_BONUS = 6;
export const MAX_REALM_MERIDIAN_BASE_COST = 1_000_000;
export const MERIDIAN_MINIMUM_REALM = '二流初期';

const MERIDIAN_MINIMUM_MAJOR_INDEX = MAJOR_REALMS.indexOf('二流');

const STAGES: ReadonlyArray<{ id: MeridianStageId; name: string }> = [
  { id: 'opening', name: '启脉' },
  { id: 'circulation', name: '行气' },
  { id: 'condensation', name: '凝元' },
  { id: 'cycle', name: '周天' },
  { id: 'confluence', name: '八脉交会穴' },
];

export interface MeridianNodeDefinition {
  id: MeridianNodeId;
  meridianId: MeridianId;
  name: string;
  stageIndex: number;
  stageId: MeridianStageId;
  stageName: string;
  view: MeridianViewSide;
  x: number;
  y: number;
  prerequisiteId?: MeridianNodeId;
}

export interface MeridianDefinition {
  id: MeridianId;
  name: string;
  confluenceName: string;
  view: MeridianViewSide;
  finalAttribute: MeridianFinalAttribute;
  gateInitialAttribute: keyof InitialAttributes;
  points: ReadonlyArray<readonly [number, number]>;
}

const DEFINITION_INPUT: ReadonlyArray<MeridianDefinition> = [
  {
    id: 'ren',
    name: '任脉',
    confluenceName: '列缺',
    view: 'front',
    finalAttribute: '内力上限',
    gateInitialAttribute: '根骨',
    points: [
      [120, 84],
      [120, 156],
      [120, 228],
      [120, 300],
      [120, 378],
    ],
  },
  {
    id: 'du',
    name: '督脉',
    confluenceName: '后溪',
    view: 'back',
    finalAttribute: '臂力',
    gateInitialAttribute: '臂力',
    points: [
      [120, 72],
      [120, 150],
      [120, 226],
      [120, 304],
      [120, 390],
    ],
  },
  {
    id: 'chong',
    name: '冲脉',
    confluenceName: '公孙',
    view: 'front',
    finalAttribute: '气血上限',
    gateInitialAttribute: '根骨',
    points: [
      [101, 102],
      [101, 176],
      [101, 248],
      [101, 322],
      [93, 430],
    ],
  },
  {
    id: 'dai',
    name: '带脉',
    confluenceName: '足临泣',
    view: 'front',
    finalAttribute: '根骨',
    gateInitialAttribute: '风姿',
    points: [
      [60, 242],
      [88, 231],
      [120, 228],
      [152, 231],
      [180, 242],
    ],
  },
  {
    id: 'yinqiao',
    name: '阴跷脉',
    confluenceName: '照海',
    view: 'front',
    finalAttribute: '洞察',
    gateInitialAttribute: '洞察',
    points: [
      [79, 434],
      [83, 356],
      [87, 278],
      [91, 198],
      [96, 116],
    ],
  },
  {
    id: 'yangqiao',
    name: '阳跷脉',
    confluenceName: '申脉',
    view: 'back',
    finalAttribute: '机敏',
    gateInitialAttribute: '机敏',
    points: [
      [72, 434],
      [76, 356],
      [80, 278],
      [84, 198],
      [91, 112],
    ],
  },
  {
    id: 'yinwei',
    name: '阴维脉',
    confluenceName: '内关',
    view: 'front',
    finalAttribute: '内力上限',
    gateInitialAttribute: '悟性',
    points: [
      [161, 432],
      [157, 350],
      [153, 270],
      [149, 190],
      [144, 110],
    ],
  },
  {
    id: 'yangwei',
    name: '阳维脉',
    confluenceName: '外关',
    view: 'back',
    finalAttribute: '气血上限',
    gateInitialAttribute: '福缘',
    points: [
      [168, 432],
      [164, 350],
      [160, 270],
      [156, 190],
      [149, 108],
    ],
  },
];

export const MERIDIAN_DEFINITIONS: ReadonlyArray<MeridianDefinition> = DEFINITION_INPUT;

function buildNodes(): MeridianNodeDefinition[] {
  return MERIDIAN_DEFINITIONS.flatMap(meridian =>
    STAGES.map((stage, stageIndex) => {
      const id: MeridianNodeId = `${meridian.id}:${stage.id}`;
      const previousStage = STAGES[stageIndex - 1];
      const point = meridian.points[stageIndex];
      return {
        id,
        meridianId: meridian.id,
        name: stage.id === 'confluence' ? meridian.confluenceName : stage.name,
        stageIndex,
        stageId: stage.id,
        stageName: stage.name,
        view: meridian.view,
        x: point[0],
        y: point[1],
        prerequisiteId: previousStage ? `${meridian.id}:${previousStage.id}` : undefined,
      };
    }),
  );
}

export const MERIDIAN_NODES: ReadonlyArray<MeridianNodeDefinition> = buildNodes();

const MERIDIAN_BY_ID = new Map(MERIDIAN_DEFINITIONS.map(definition => [definition.id, definition]));
const NODE_BY_ID = new Map(MERIDIAN_NODES.map(node => [node.id, node]));
const NODE_IDS = new Set(MERIDIAN_NODES.map(node => node.id));

export interface MeridianUpgradeInput {
  progress: unknown;
  nodeId: MeridianNodeId;
  realm: string;
  cultivation: number;
  initialAttributes: InitialAttributes;
}

export interface MeridianProjectionInput {
  progress: unknown;
  realm: string;
  cultivation: number;
  initialAttributes: InitialAttributes;
}

export function createEmptyMeridianProgress(): MeridianProgressV1 {
  return {
    版本: MERIDIAN_PROGRESS_VERSION,
    已通穴位: [],
    关窍结算: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMeridianNodeId(value: unknown): value is MeridianNodeId {
  return typeof value === 'string' && NODE_IDS.has(value as MeridianNodeId);
}

function normalizationError(error: string): MeridianProgressNormalization {
  return { valid: false, progress: createEmptyMeridianProgress(), error };
}

function validateSettlement(node: MeridianNodeDefinition, value: unknown): MeridianSettlement | null {
  if (node.stageId !== 'confluence' || !isRecord(value)) {
    return null;
  }

  const meridian = MERIDIAN_BY_ID.get(node.meridianId)!;
  if (
    value.类型 === '初始属性' &&
    value.属性 === meridian.gateInitialAttribute &&
    value.增量 === MERIDIAN_GATE_INITIAL_BONUS
  ) {
    return {
      类型: '初始属性',
      属性: meridian.gateInitialAttribute,
      增量: MERIDIAN_GATE_INITIAL_BONUS,
    };
  }
  if (
    value.类型 === '最终属性' &&
    value.属性 === meridian.finalAttribute &&
    value.增量 === MERIDIAN_GATE_FALLBACK_BONUS
  ) {
    return {
      类型: '最终属性',
      属性: meridian.finalAttribute,
      增量: MERIDIAN_GATE_FALLBACK_BONUS,
    };
  }
  return null;
}

/**
 * 将聊天变量中的经脉进度转为确定性的 v1 数据。缺失字段视为旧档空进度；
 * 已存在但版本、顺序或关窍结算损坏时返回 invalid，调用方应禁用购买。
 */
export function normalizeMeridianProgress(raw: unknown): MeridianProgressNormalization {
  if (raw === undefined || raw === null) {
    return { valid: true, progress: createEmptyMeridianProgress() };
  }
  if (!isRecord(raw)) {
    return normalizationError('奇经八脉存档不是对象');
  }
  if (raw.版本 !== MERIDIAN_PROGRESS_VERSION) {
    return normalizationError(`不支持的奇经八脉存档版本：${String(raw.版本)}`);
  }
  if (!Array.isArray(raw.已通穴位)) {
    return normalizationError('奇经八脉存档缺少已通穴位列表');
  }
  if (!isRecord(raw.关窍结算)) {
    return normalizationError('奇经八脉存档缺少关窍结算');
  }

  const opened = new Set<MeridianNodeId>();
  for (const value of raw.已通穴位) {
    if (!isMeridianNodeId(value)) {
      return normalizationError(`奇经八脉存档包含未知穴位：${String(value)}`);
    }
    opened.add(value);
  }

  for (const node of MERIDIAN_NODES) {
    if (opened.has(node.id) && node.prerequisiteId && !opened.has(node.prerequisiteId)) {
      return normalizationError(
        `穴位 ${MERIDIAN_BY_ID.get(node.meridianId)?.name ?? node.meridianId}·${node.name} 缺少前置穴位`,
      );
    }
  }

  const settlements: Partial<Record<MeridianNodeId, MeridianSettlement>> = {};
  for (const [rawNodeId, rawSettlement] of Object.entries(raw.关窍结算)) {
    if (!isMeridianNodeId(rawNodeId)) {
      return normalizationError(`关窍结算包含未知穴位：${rawNodeId}`);
    }
    const node = NODE_BY_ID.get(rawNodeId)!;
    if (!opened.has(rawNodeId)) {
      return normalizationError(
        `关窍 ${MERIDIAN_BY_ID.get(node.meridianId)?.name ?? node.meridianId}·${node.name} 尚未打通却存在结算`,
      );
    }
    const settlement = validateSettlement(node, rawSettlement);
    if (!settlement) {
      return normalizationError(
        `关窍 ${MERIDIAN_BY_ID.get(node.meridianId)?.name ?? node.meridianId}·${node.name} 的结算数据损坏`,
      );
    }
    settlements[rawNodeId] = settlement;
  }

  for (const node of MERIDIAN_NODES) {
    if (node.stageId === 'confluence' && opened.has(node.id) && !settlements[node.id]) {
      return normalizationError(
        `关窍 ${MERIDIAN_BY_ID.get(node.meridianId)?.name ?? node.meridianId}·${node.name} 缺少结算记录`,
      );
    }
  }

  return {
    valid: true,
    progress: {
      版本: MERIDIAN_PROGRESS_VERSION,
      已通穴位: MERIDIAN_NODES.filter(node => opened.has(node.id)).map(node => node.id),
      关窍结算: settlements,
    },
  };
}

/** 当前境界的下一次突破原价；最高境界圆满按固定 1,000,000 计。 */
export function getMeridianBaseCost(realm: string): number {
  const parsed = parseRealm(realm);
  if (!parsed) {
    return 0;
  }
  const breakthroughCost = getBreakthroughCost(parsed);
  return breakthroughCost < 0 ? MAX_REALM_MERIDIAN_BASE_COST : breakthroughCost;
}

/** 奇经八脉须突破至二流后方可修炼。 */
export function meetsMeridianRealmRequirement(realm: string): boolean {
  const parsed = parseRealm(realm);
  return parsed !== null && parsed.majorIndex >= MERIDIAN_MINIMUM_MAJOR_INDEX;
}

export function getMeridianNodeCost(realm: string, nodeId: MeridianNodeId): number {
  const node = NODE_BY_ID.get(nodeId);
  const baseCost = getMeridianBaseCost(realm);
  if (!node || baseCost <= 0) {
    return 0;
  }
  return Math.ceil(baseCost * MERIDIAN_COST_RATIOS[node.stageIndex]);
}

export function getInitialAttributeCap(attribute: keyof InitialAttributes): number {
  return attribute === '福缘' ? 14 : 20;
}

function getGateSettlement(meridian: MeridianDefinition, initialAttributes: InitialAttributes): MeridianSettlement {
  const target = meridian.gateInitialAttribute;
  if (Number(initialAttributes[target]) >= getInitialAttributeCap(target)) {
    return {
      类型: '最终属性',
      属性: meridian.finalAttribute,
      增量: MERIDIAN_GATE_FALLBACK_BONUS,
    };
  }
  return {
    类型: '初始属性',
    属性: target,
    增量: MERIDIAN_GATE_INITIAL_BONUS,
  };
}

function getRewardLabel(node: MeridianNodeDefinition, settlement?: MeridianSettlement): string {
  const meridian = MERIDIAN_BY_ID.get(node.meridianId)!;
  if (node.stageId !== 'confluence') {
    return `最终${meridian.finalAttribute} +${MERIDIAN_ORDINARY_BONUS}%`;
  }
  const resolved = settlement;
  if (resolved?.类型 === '最终属性') {
    return `最终${resolved.属性} +${resolved.增量}%（${meridian.gateInitialAttribute}已至上限）`;
  }
  return `初始${meridian.gateInitialAttribute} +${MERIDIAN_GATE_INITIAL_BONUS}`;
}

export function quoteMeridianUpgrade(input: MeridianUpgradeInput): MeridianUpgradeQuote {
  const normalization = normalizeMeridianProgress(input.progress);
  const node = NODE_BY_ID.get(input.nodeId);
  const cultivationValid = Number.isFinite(input.cultivation) && input.cultivation >= 0;
  const cultivation = cultivationValid ? Math.floor(input.cultivation) : 0;
  const baseCost = getMeridianBaseCost(input.realm);
  const cost = node && baseCost > 0 ? Math.ceil(baseCost * MERIDIAN_COST_RATIOS[node.stageIndex]) : 0;
  const persistedSettlement = normalization.progress.关窍结算[input.nodeId];
  const settlement =
    persistedSettlement ??
    (node?.stageId === 'confluence'
      ? getGateSettlement(MERIDIAN_BY_ID.get(node.meridianId)!, input.initialAttributes)
      : undefined);
  const rewardLabel = node ? getRewardLabel(node, settlement) : '未知穴位';
  const quote: MeridianUpgradeQuote = {
    nodeId: input.nodeId,
    canUpgrade: false,
    cost,
    baseCost,
    currentCultivation: cultivation,
    newCultivation: cultivation,
    settlement,
    rewardLabel,
  };

  if (!normalization.valid) {
    return { ...quote, reason: normalization.error };
  }
  if (!node) {
    return { ...quote, reason: '未知穴位' };
  }
  if (!cultivationValid) {
    return { ...quote, reason: '修为数据无效' };
  }
  if (baseCost <= 0 || cost <= 0) {
    return { ...quote, reason: '无法识别当前境界' };
  }
  if (!meetsMeridianRealmRequirement(input.realm)) {
    return { ...quote, reason: '需先突破到二流，方可冲穴' };
  }
  if (normalization.progress.已通穴位.includes(node.id)) {
    return { ...quote, reason: '该穴位已打通' };
  }
  if (node.prerequisiteId && !normalization.progress.已通穴位.includes(node.prerequisiteId)) {
    return {
      ...quote,
      reason: `需先打通 ${MERIDIAN_BY_ID.get(node.meridianId)?.name ?? node.meridianId}·${NODE_BY_ID.get(node.prerequisiteId)?.name ?? node.prerequisiteId}`,
    };
  }
  if (cultivation < cost) {
    return { ...quote, reason: `修为不足，还需 ${cost - cultivation} 点修为` };
  }

  return {
    ...quote,
    canUpgrade: true,
    newCultivation: cultivation - cost,
    reason: undefined,
  };
}

function createEmptyModifierMap(): Record<MeridianFinalAttribute, number> {
  return {
    臂力: 0,
    根骨: 0,
    机敏: 0,
    洞察: 0,
    气血上限: 0,
    内力上限: 0,
  };
}

/** 汇总所有已通穴位带来的无品阶封顶最终属性百分比点。 */
export function deriveMeridianModifiers(progress: unknown): Record<MeridianFinalAttribute, number> {
  const normalization = normalizeMeridianProgress(progress);
  const modifiers = createEmptyModifierMap();
  if (!normalization.valid) {
    return modifiers;
  }

  for (const nodeId of normalization.progress.已通穴位) {
    const node = NODE_BY_ID.get(nodeId)!;
    const meridian = MERIDIAN_BY_ID.get(node.meridianId)!;
    if (node.stageId !== 'confluence') {
      modifiers[meridian.finalAttribute] += MERIDIAN_ORDINARY_BONUS;
      continue;
    }
    const settlement = normalization.progress.关窍结算[nodeId];
    if (settlement?.类型 === '最终属性') {
      modifiers[meridian.finalAttribute] += settlement.增量;
    }
  }
  return modifiers;
}

export function applyMeridianUpgrade(input: MeridianUpgradeInput): MeridianUpgradeResult {
  const normalization = normalizeMeridianProgress(input.progress);
  const quote = quoteMeridianUpgrade(input);
  const initialAttributes = { ...input.initialAttributes };

  if (!quote.canUpgrade || !normalization.valid) {
    return {
      success: false,
      nodeId: input.nodeId,
      cost: quote.cost,
      newCultivation: quote.currentCultivation,
      progress: normalization.progress,
      initialAttributes,
      settlement: quote.settlement,
      error: quote.reason ?? normalization.error ?? '无法冲穴',
    };
  }

  const progress: MeridianProgressV1 = {
    版本: MERIDIAN_PROGRESS_VERSION,
    已通穴位: MERIDIAN_NODES.filter(
      node => node.id === input.nodeId || normalization.progress.已通穴位.includes(node.id),
    ).map(node => node.id),
    关窍结算: { ...normalization.progress.关窍结算 },
  };
  if (quote.settlement) {
    progress.关窍结算[input.nodeId] = quote.settlement;
    if (quote.settlement.类型 === '初始属性') {
      const attribute = quote.settlement.属性 as keyof InitialAttributes;
      initialAttributes[attribute] += quote.settlement.增量;
    }
  }

  return {
    success: true,
    nodeId: input.nodeId,
    cost: quote.cost,
    newCultivation: quote.newCultivation,
    progress,
    initialAttributes,
    settlement: quote.settlement,
  };
}

export function buildMeridianProjection(input: MeridianProjectionInput): MeridianProjection {
  const normalization = normalizeMeridianProgress(input.progress);
  const opened = new Set(normalization.progress.已通穴位);
  const realmEligible = meetsMeridianRealmRequirement(input.realm);

  const nodes: MeridianNodeView[] = MERIDIAN_NODES.map(node => {
    const status = opened.has(node.id)
      ? 'opened'
      : normalization.valid && realmEligible && (!node.prerequisiteId || opened.has(node.prerequisiteId))
        ? 'available'
        : 'locked';
    const prerequisite = node.prerequisiteId ? NODE_BY_ID.get(node.prerequisiteId) : undefined;
    const quote = normalization.valid
      ? quoteMeridianUpgrade({
          ...input,
          progress: normalization.progress,
          nodeId: node.id,
        })
      : undefined;
    return {
      id: node.id,
      meridianId: node.meridianId,
      meridianName: MERIDIAN_BY_ID.get(node.meridianId)!.name,
      name: node.name,
      stageIndex: node.stageIndex,
      stageName: node.stageName,
      view: node.view,
      x: node.x,
      y: node.y,
      status,
      prerequisiteId: node.prerequisiteId,
      prerequisiteLabel: prerequisite?.name,
      rewardLabel: quote?.rewardLabel ?? getRewardLabel(node, normalization.progress.关窍结算[node.id]),
      quote,
    };
  });

  const meridians: MeridianSummary[] = MERIDIAN_DEFINITIONS.map(meridian => ({
    id: meridian.id,
    name: meridian.name,
    confluenceName: meridian.confluenceName,
    view: meridian.view,
    completedNodes: MERIDIAN_NODES.filter(node => node.meridianId === meridian.id && opened.has(node.id)).length,
    totalNodes: STAGES.length,
    finalAttribute: meridian.finalAttribute,
    gateInitialAttribute: meridian.gateInitialAttribute,
  }));

  return {
    version: MERIDIAN_PROGRESS_VERSION,
    nodes,
    meridians,
    modifiers: deriveMeridianModifiers(normalization.progress),
    corrupted: !normalization.valid,
    error: normalization.error,
  };
}
