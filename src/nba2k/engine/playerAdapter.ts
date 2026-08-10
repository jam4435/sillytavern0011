import type { LegacyPlayerData, PlayerData, PlayerRatingsV3, Position } from './types';

const clampRating = (value: number) => Math.max(25, Math.min(99, Math.round(value)));
const avg = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const BODY_DEFAULTS: Record<Position, { weight: number; reach: number }> = {
  PG: { weight: 86, reach: 8 },
  SG: { weight: 93, reach: 10 },
  SF: { weight: 102, reach: 12 },
  PF: { weight: 111, reach: 15 },
  C: { weight: 120, reach: 18 },
};

/** 将旧19项种子稳定展开为 v3 43项；同一输入始终得到同一结果。 */
export function expandLegacyRatings(a: LegacyPlayerData['attrs']): PlayerRatingsV3 {
  const inside = a.insideScoring;
  const outside = a.outsideScoring;
  const perimeter = a.perimeterD;
  const interior = a.interiorD;
  const consistency = avg(a.stamina, outside, inside);
  const map = (value: number, delta = 0) => clampRating(value + delta);
  return {
    standingLayup: map(avg(a.layup, inside), 1),
    drivingLayup: map(avg(a.layup, a.speed)),
    postFade: map(avg(inside, a.midRange), -4),
    postHook: map(inside, -2),
    postControl: map(avg(inside, a.strength)),
    drawFoul: map(avg(a.layup, inside), -3),
    movingClose: map(avg(a.layup, a.midRange)),
    standingClose: map(inside),
    movingMid: map(avg(a.midRange, a.ballHandle), -2),
    standingMid: map(a.midRange, 2),
    movingThree: map(avg(a.threePoint, a.ballHandle), -4),
    standingThree: map(a.threePoint, 2),
    freeThrow: map(a.freeThrow),
    ballControl: map(a.ballHandle),
    passVision: map(a.passing),
    passIQ: map(avg(a.passing, a.ballHandle), 1),
    passAccuracy: map(a.passing, 1),
    offRebound: map(a.offRebound),
    standingDunk: map(avg(a.dunk, a.strength)),
    drivingDunk: map(avg(a.dunk, a.speed)),
    contactDunk: map(avg(a.dunk, a.strength), -5),
    shotIQ: map(avg(outside, a.midRange, a.threePoint)),
    hands: map(avg(a.ballHandle, a.passing, a.layup)),
    defRebound: map(a.defRebound),
    block: map(a.block),
    shotContest: map(avg(perimeter, interior, a.block)),
    steal: map(a.steal),
    onBallDefenseIQ: map(perimeter),
    lowPostDefenseIQ: map(interior),
    reactionTime: map(avg(a.speed, perimeter, a.steal)),
    boxout: map(avg(a.strength, a.defRebound)),
    lateralQuickness: map(avg(a.speed, perimeter)),
    speed: map(a.speed),
    acceleration: map(a.speed, -1),
    vertical: map(avg(a.dunk, a.block, a.offRebound)),
    strength: map(a.strength),
    stamina: map(a.stamina),
    hustle: map(avg(a.stamina, a.speed, a.defRebound)),
    durability: map(avg(a.stamina, a.strength)),
    offensiveConsistency: map(consistency),
    defensiveConsistency: map(avg(a.stamina, perimeter, interior)),
    composure: map(avg(a.passing, a.freeThrow, a.stamina)),
    potential: map(a.potential),
  };
}

export function adaptLegacyPlayer(player: LegacyPlayerData): PlayerData {
  const body = BODY_DEFAULTS[player.pos];
  const heightWeightAdjust = (player.height_cm - ({ PG: 188, SG: 196, SF: 203, PF: 208, C: 213 } as const)[player.pos]) * 0.65;
  return {
    ...player,
    body: {
      heightCm: player.height_cm,
      weightKg: Math.round(body.weight + heightWeightAdjust),
      wingspanCm: player.height_cm + body.reach,
    },
    attrs: expandLegacyRatings(player.attrs),
  };
}
