import { describe, expect, it } from 'vitest';
import type { InitialAttributes, MeridianId, MeridianNodeId, MeridianProgressV1, MeridianSettlement } from '../types';
import {
  MERIDIAN_COST_RATIOS,
  MERIDIAN_DEFINITIONS,
  MERIDIAN_NODES,
  applyMeridianUpgrade,
  buildMeridianProjection,
  createEmptyMeridianProgress,
  deriveMeridianModifiers,
  getMeridianBaseCost,
  getMeridianNodeCost,
  meetsMeridianRealmRequirement,
  normalizeMeridianProgress,
  quoteMeridianUpgrade,
} from './meridianSystem';

const INITIAL: InitialAttributes = {
  臂力: 10,
  根骨: 10,
  机敏: 10,
  悟性: 10,
  洞察: 10,
  风姿: 10,
  福缘: 10,
};

function nodesOf(meridianId: MeridianId): MeridianNodeId[] {
  return MERIDIAN_NODES.filter(node => node.meridianId === meridianId).map(node => node.id);
}

function progressThrough(meridianId: MeridianId, count: number, settlement?: MeridianSettlement): MeridianProgressV1 {
  const ids = nodesOf(meridianId).slice(0, count);
  const gateId = nodesOf(meridianId)[4];
  return {
    版本: 1,
    已通穴位: ids,
    关窍结算: settlement && count === 5 ? { [gateId]: settlement } : {},
  };
}

describe('meridianSystem static definitions', () => {
  it('defines eight meridians with five unique stable node ids each', () => {
    expect(MERIDIAN_DEFINITIONS).toHaveLength(8);
    expect(MERIDIAN_NODES).toHaveLength(40);
    expect(new Set(MERIDIAN_NODES.map(node => node.id))).toHaveLength(40);
    expect(MERIDIAN_NODES.slice(0, 5).map(node => node.id)).toEqual([
      'ren:opening',
      'ren:circulation',
      'ren:condensation',
      'ren:cycle',
      'ren:confluence',
    ]);
    expect(MERIDIAN_NODES.every(node => node.x >= 0 && node.x <= 240 && node.y >= 0 && node.y <= 500)).toBe(true);
  });

  it('uses only same-meridian immediate prerequisites', () => {
    for (const meridian of MERIDIAN_DEFINITIONS) {
      const nodes = MERIDIAN_NODES.filter(node => node.meridianId === meridian.id);
      expect(nodes[0].prerequisiteId).toBeUndefined();
      for (let index = 1; index < nodes.length; index += 1) {
        expect(nodes[index].prerequisiteId).toBe(nodes[index - 1].id);
      }
    }
  });
});

describe('meridianSystem cultivation costs', () => {
  it('prices the five stages at 8/12/18/25/37 percent of the next breakthrough', () => {
    const nodes = nodesOf('ren');
    expect(MERIDIAN_COST_RATIOS).toEqual([0.08, 0.12, 0.18, 0.25, 0.37]);
    expect(getMeridianBaseCost('不入流')).toBe(500);
    expect(nodes.map(nodeId => getMeridianNodeCost('不入流', nodeId))).toEqual([40, 60, 90, 125, 185]);
    expect(nodes.map(nodeId => getMeridianNodeCost('三流初期', nodeId))).toEqual([56, 84, 126, 175, 259]);
  });

  it('uses 1,000,000 at the highest completed realm and rejects an unknown realm', () => {
    expect(getMeridianBaseCost('陆地神仙圆满')).toBe(1_000_000);
    expect(getMeridianNodeCost('陆地神仙圆满', 'ren:confluence')).toBe(370_000);
    expect(getMeridianBaseCost('天外飞仙')).toBe(0);
  });
});

describe('meridianSystem progress normalization', () => {
  it('treats a missing old-save field as an empty v1 projection without writing', () => {
    expect(normalizeMeridianProgress(undefined)).toEqual({
      valid: true,
      progress: createEmptyMeridianProgress(),
    });
  });

  it('deduplicates and canonicalizes valid opened node ids', () => {
    const normalized = normalizeMeridianProgress({
      版本: 1,
      已通穴位: ['du:opening', 'ren:opening', 'du:opening'],
      关窍结算: {},
    });
    expect(normalized.valid).toBe(true);
    expect(normalized.progress.已通穴位).toEqual(['ren:opening', 'du:opening']);
  });

  it.each([
    [{ 版本: 2, 已通穴位: [], 关窍结算: {} }, '版本'],
    [{ 版本: 1, 已通穴位: ['ren:unknown'], 关窍结算: {} }, '未知穴位'],
    [{ 版本: 1, 已通穴位: ['ren:circulation'], 关窍结算: {} }, '缺少前置穴位'],
    [{ 版本: 1, 已通穴位: nodesOf('ren'), 关窍结算: {} }, '缺少结算记录'],
  ])('rejects corrupted version, ids, order, and missing gate settlement', (raw, errorPart) => {
    const normalized = normalizeMeridianProgress(raw);
    expect(normalized.valid).toBe(false);
    expect(normalized.error).toContain(errorPart);
  });

  it('rejects a settlement whose type, target, or increment was tampered with', () => {
    const raw = progressThrough('ren', 5, { 类型: '初始属性', 属性: '臂力', 增量: 99 });
    const normalized = normalizeMeridianProgress(raw);
    expect(normalized.valid).toBe(false);
    expect(normalized.error).toContain('结算数据损坏');
  });
});

describe('meridianSystem upgrade quotes and results', () => {
  it('requires the player to reach at least 二流 before opening meridian nodes', () => {
    expect(meetsMeridianRealmRequirement('不入流')).toBe(false);
    expect(meetsMeridianRealmRequirement('三流圆满')).toBe(false);
    expect(meetsMeridianRealmRequirement('二流初期')).toBe(true);
    expect(meetsMeridianRealmRequirement('陆地神仙圆满')).toBe(true);

    const quote = quoteMeridianUpgrade({
      progress: undefined,
      nodeId: 'ren:opening',
      realm: '三流圆满',
      cultivation: 10_000,
      initialAttributes: INITIAL,
    });
    expect(quote).toMatchObject({ canUpgrade: false, reason: '需先突破到二流，方可冲穴' });

    const projection = buildMeridianProjection({
      progress: undefined,
      realm: '三流圆满',
      cultivation: 10_000,
      initialAttributes: INITIAL,
    });
    expect(projection.nodes.every(node => node.status === 'locked')).toBe(true);
    expect(projection.nodes[0].quote?.reason).toBe('需先突破到二流，方可冲穴');
  });

  it('allows exact cultivation, blocks insufficient cultivation, prerequisites, and duplicate purchases', () => {
    const exact = quoteMeridianUpgrade({
      progress: undefined,
      nodeId: 'ren:opening',
      realm: '二流初期',
      cultivation: 160,
      initialAttributes: INITIAL,
    });
    expect(exact).toMatchObject({ canUpgrade: true, cost: 160, newCultivation: 0 });

    expect(
      quoteMeridianUpgrade({
        progress: undefined,
        nodeId: 'ren:opening',
        realm: '二流初期',
        cultivation: 159,
        initialAttributes: INITIAL,
      }),
    ).toMatchObject({ canUpgrade: false, reason: '修为不足，还需 1 点修为' });

    expect(
      quoteMeridianUpgrade({
        progress: undefined,
        nodeId: 'ren:circulation',
        realm: '二流初期',
        cultivation: 10_000,
        initialAttributes: INITIAL,
      }).reason,
    ).toContain('需先打通');

    expect(
      quoteMeridianUpgrade({
        progress: progressThrough('ren', 1),
        nodeId: 'ren:opening',
        realm: '二流初期',
        cultivation: 10_000,
        initialAttributes: INITIAL,
      }).reason,
    ).toBe('该穴位已打通');
  });

  it.each([
    ['ren', '根骨'],
    ['du', '臂力'],
    ['chong', '根骨'],
    ['dai', '风姿'],
    ['yinqiao', '洞察'],
    ['yangqiao', '机敏'],
    ['yinwei', '悟性'],
    ['yangwei', '福缘'],
  ] as const)('%s gate grants +1 to its fixed initial %s target', (meridianId, attribute) => {
    const gateId = nodesOf(meridianId)[4];
    const quote = quoteMeridianUpgrade({
      progress: progressThrough(meridianId, 4),
      nodeId: gateId,
      realm: '二流初期',
      cultivation: 10_000,
      initialAttributes: INITIAL,
    });
    expect(quote.canUpgrade).toBe(true);
    expect(quote.settlement).toEqual({ 类型: '初始属性', 属性: attribute, 增量: 1 });
  });

  it('records and applies an initial-attribute gate settlement exactly once', () => {
    const result = applyMeridianUpgrade({
      progress: progressThrough('ren', 4),
      nodeId: 'ren:confluence',
      realm: '二流初期',
      cultivation: 740,
      initialAttributes: { ...INITIAL, 根骨: 19 },
    });
    expect(result).toMatchObject({ success: true, cost: 740, newCultivation: 0 });
    expect(result.initialAttributes.根骨).toBe(20);
    expect(result.progress.关窍结算['ren:confluence']).toEqual({ 类型: '初始属性', 属性: '根骨', 增量: 1 });

    const duplicate = applyMeridianUpgrade({
      progress: result.progress,
      nodeId: 'ren:confluence',
      realm: '二流初期',
      cultivation: result.newCultivation,
      initialAttributes: result.initialAttributes,
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.initialAttributes.根骨).toBe(20);
  });

  it('uses the +6% final-attribute fallback at the 20 point cap', () => {
    const result = applyMeridianUpgrade({
      progress: progressThrough('du', 4),
      nodeId: 'du:confluence',
      realm: '二流初期',
      cultivation: 740,
      initialAttributes: { ...INITIAL, 臂力: 20 },
    });
    expect(result.success).toBe(true);
    expect(result.initialAttributes.臂力).toBe(20);
    expect(result.settlement).toEqual({ 类型: '最终属性', 属性: '臂力', 增量: 6 });
    expect(deriveMeridianModifiers(result.progress).臂力).toBe(18);
  });

  it('uses the special 14 point 福缘 cap', () => {
    const quote = quoteMeridianUpgrade({
      progress: progressThrough('yangwei', 4),
      nodeId: 'yangwei:confluence',
      realm: '二流初期',
      cultivation: 740,
      initialAttributes: { ...INITIAL, 福缘: 14 },
    });
    expect(quote.settlement).toEqual({ 类型: '最终属性', 属性: '气血上限', 增量: 6 });
  });
});

describe('meridianSystem modifier and UI projection', () => {
  it('adds +3% for every ordinary node and combines meridians targeting the same final stat', () => {
    const progress: MeridianProgressV1 = {
      版本: 1,
      已通穴位: MERIDIAN_DEFINITIONS.flatMap(meridian => nodesOf(meridian.id).slice(0, 4)),
      关窍结算: {},
    };
    expect(deriveMeridianModifiers(progress)).toEqual({
      臂力: 12,
      根骨: 12,
      机敏: 12,
      洞察: 12,
      气血上限: 24,
      内力上限: 24,
    });
  });

  it('projects opened, available, and locked states with summaries and live quotes', () => {
    const projection = buildMeridianProjection({
      progress: progressThrough('ren', 1),
      realm: '二流初期',
      cultivation: 1_000,
      initialAttributes: INITIAL,
    });
    expect(projection.corrupted).toBe(false);
    expect(projection.nodes.find(node => node.id === 'ren:opening')).toMatchObject({ status: 'opened' });
    expect(projection.nodes.find(node => node.id === 'ren:circulation')).toMatchObject({
      status: 'available',
      prerequisiteId: 'ren:opening',
      quote: { canUpgrade: true, cost: 240 },
    });
    expect(projection.nodes.find(node => node.id === 'ren:condensation')).toMatchObject({ status: 'locked' });
    expect(projection.meridians.find(meridian => meridian.id === 'ren')).toMatchObject({
      completedNodes: 1,
      totalNodes: 5,
    });
  });

  it('marks corrupted progress and disables every node', () => {
    const projection = buildMeridianProjection({
      progress: { 版本: 99, 已通穴位: [], 关窍结算: {} },
      realm: '不入流',
      cultivation: 1_000,
      initialAttributes: INITIAL,
    });
    expect(projection.corrupted).toBe(true);
    expect(projection.error).toContain('版本');
    expect(projection.nodes.every(node => node.status === 'locked' && node.quote === undefined)).toBe(true);
  });
});
