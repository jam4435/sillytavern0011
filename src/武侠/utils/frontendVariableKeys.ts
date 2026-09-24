export const FRONTEND_VARIABLES_KEY = '前端变量';
export const FRONTEND_BATTLE_ZONE_KEY = '战力区';
export const FRONTEND_LOCATION_LORE_KEY = '当前地点信息';
export const FRONTEND_LEGACY_RANDOM_NUMBERS_KEY = '随机数';
export const FRONTEND_CULTIVATION_REFERENCE_KEY = '修为变化参考';
export const FRONTEND_MERIDIANS_KEY = '奇经八脉';

const FRONTEND_DERIVED_CACHE_KEYS = new Set([
  '周围地点',
  FRONTEND_LOCATION_LORE_KEY,
  FRONTEND_BATTLE_ZONE_KEY,
  FRONTEND_CULTIVATION_REFERENCE_KEY,
  FRONTEND_LEGACY_RANDOM_NUMBERS_KEY,
]);

export function isFrontendDerivedCachePath(path: Array<string | number>): boolean {
  return (
    path.length >= 2
    && String(path[0]) === FRONTEND_VARIABLES_KEY
    && FRONTEND_DERIVED_CACHE_KEYS.has(String(path[1]))
  );
}
