import type { CourtSpot, DefensiveScheme, OffensiveScheme, Position, Side } from './types';

/**
 * 球场坐标系：x 0-100（左端线→右端线），y 0-100。
 * 模板按向右侧篮筐进攻定义；换边时镜像 x。
 */
const OFFENSE_TEMPLATES: Record<OffensiveScheme, Record<Position, { x: number; y: number }>> = {
  基础: {
    PG: { x: 61, y: 50 },
    SG: { x: 70, y: 16 },
    SF: { x: 70, y: 84 },
    PF: { x: 82, y: 30 },
    C: { x: 87, y: 62 },
  },
  五外: {
    PG: { x: 60, y: 50 },
    SG: { x: 68, y: 12 },
    SF: { x: 68, y: 88 },
    PF: { x: 72, y: 28 },
    C: { x: 72, y: 72 },
  },
  四外一内: {
    PG: { x: 61, y: 50 },
    SG: { x: 69, y: 13 },
    SF: { x: 69, y: 87 },
    PF: { x: 74, y: 28 },
    C: { x: 90, y: 56 },
  },
  挡拆: {
    PG: { x: 63, y: 46 },
    SG: { x: 71, y: 12 },
    SF: { x: 71, y: 88 },
    PF: { x: 84, y: 72 },
    C: { x: 68, y: 52 },
  },
  低位: {
    PG: { x: 61, y: 50 },
    SG: { x: 69, y: 14 },
    SF: { x: 70, y: 86 },
    PF: { x: 88, y: 39 },
    C: { x: 89, y: 63 },
  },
  动态进攻: {
    PG: { x: 61, y: 50 },
    SG: { x: 69, y: 14 },
    SF: { x: 69, y: 86 },
    PF: { x: 75, y: 31 },
    C: { x: 76, y: 69 },
  },
};

function defenseSpotFor(off: { x: number; y: number }, scheme: DefensiveScheme): { x: number; y: number } {
  const basketX = 94;
  const basketY = 50;
  // 越大越向篮下收缩。联防/沉退更收缩，延误更贴近持球侧。
  const shrink =
    scheme === '二三联防' ? 0.38 :
    scheme === '沉退' ? 0.30 :
    scheme === '换防' ? 0.20 :
    scheme === '延误' ? 0.14 :
    0.18;
  return {
    x: off.x + (basketX - off.x) * shrink,
    y: off.y + (basketY - off.y) * shrink,
  };
}

export function mirrorX(spot: { x: number; y: number }): { x: number; y: number } {
  return { x: 100 - spot.x, y: spot.y };
}

export interface LineupEntry {
  key: string;
  pos: Position;
}

export function buildFormation(params: {
  offense: LineupEntry[];
  defense: LineupEntry[];
  offenseSide: Side;
  tactic: OffensiveScheme;
  defenseScheme: DefensiveScheme;
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
    const paired = params.offense[i]?.pos ?? p.pos;
    const raw = defenseSpotFor(template[paired], params.defenseScheme);
    const spot = params.attackRight ? raw : mirrorX(raw);
    return { 球员: p.key, x: Math.round(spot.x), y: Math.round(spot.y) };
  });

  return params.offenseSide === '主'
    ? { 主: offSpots, 客: defSpots }
    : { 主: defSpots, 客: offSpots };
}
