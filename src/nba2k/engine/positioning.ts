import type { CourtSpot, Position, Side } from './types';

/**
 * 球场坐标系：横向全场，x 0-100（左端线→右端线），y 0-100（下边线→上边线）。
 * 模板一律按「向右侧篮筐进攻」定义，需要时用 mirrorX 镜像。
 * 右侧篮筐位于 (94, 50)，三分线顶弧约 x=69。
 */

/** 进攻站位模板（向右进攻），按位置给出落位 */
const OFFENSE_TEMPLATES: Record<string, Record<Position, { x: number; y: number }>> = {
  // 常规落位：控卫弧顶持球，两侧翼，内线双塔低位/高位
  基础: {
    PG: { x: 62, y: 50 },
    SG: { x: 72, y: 18 },
    SF: { x: 72, y: 82 },
    PF: { x: 84, y: 30 },
    C: { x: 88, y: 62 },
  },
  // 五外/跑轰：全员拉开到三分线外
  跑轰: {
    PG: { x: 60, y: 50 },
    SG: { x: 68, y: 12 },
    SF: { x: 68, y: 88 },
    PF: { x: 74, y: 26 },
    C: { x: 74, y: 74 },
  },
  // 内线主导：双塔沉低位
  内线: {
    PG: { x: 60, y: 50 },
    SG: { x: 70, y: 15 },
    SF: { x: 70, y: 85 },
    PF: { x: 90, y: 38 },
    C: { x: 90, y: 62 },
  },
  // 挡拆发起：中锋上提弧顶做墙
  挡拆: {
    PG: { x: 64, y: 46 },
    SG: { x: 74, y: 12 },
    SF: { x: 74, y: 88 },
    PF: { x: 86, y: 70 },
    C: { x: 68, y: 52 },
  },
};

/** 防守站位：相对进攻站位向篮筐方向收缩 */
function defenseSpotFor(off: { x: number; y: number }, scheme: string): { x: number; y: number } {
  const basketX = 94;
  const basketY = 50;
  // 人盯人贴 4 个坐标距离；联防按区域收缩到禁区外沿
  const shrink = scheme === '联防' ? 0.45 : 0.22;
  return {
    x: off.x + (basketX - off.x) * shrink,
    y: off.y + (basketY - off.y) * shrink,
  };
}

export function mirrorX(spot: { x: number; y: number }): { x: number; y: number } {
  return { x: 100 - spot.x, y: spot.y };
}

export interface LineupEntry {
  /** 球员 key（players.json 的 name） */
  key: string;
  pos: Position;
}

/**
 * 生成双方 10 人站位。
 * @param offense 进攻方阵容与球权方
 * @param attackRight 进攻方是否向右侧篮筐进攻
 */
export function buildFormation(params: {
  offense: LineupEntry[];
  defense: LineupEntry[];
  offenseSide: Side;
  tactic: string;
  defenseScheme: string;
  ballHolder: string;
  attackRight: boolean;
}): { 主: CourtSpot[]; 客: CourtSpot[] } {
  const template = OFFENSE_TEMPLATES[params.tactic] ?? OFFENSE_TEMPLATES.基础;

  const offSpots: CourtSpot[] = params.offense.map(p => {
    const raw = template[p.pos];
    const spot = params.attackRight ? raw : mirrorX(raw);
    return { 球员: p.key, x: Math.round(spot.x), y: Math.round(spot.y), 持球: p.key === params.ballHolder };
  });

  const defSpots: CourtSpot[] = params.defense.map((p, i) => {
    const offRaw = template[params.offense[i]?.pos ?? p.pos];
    const raw = defenseSpotFor(offRaw, params.defenseScheme);
    const spot = params.attackRight ? raw : mirrorX(raw);
    return { 球员: p.key, x: Math.round(spot.x), y: Math.round(spot.y) };
  });

  return params.offenseSide === '主'
    ? { 主: offSpots, 客: defSpots }
    : { 主: defSpots, 客: offSpots };
}
