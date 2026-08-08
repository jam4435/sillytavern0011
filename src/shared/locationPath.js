const ALTERNATE_LOCATION_SEPARATORS = /[\\＞>›→]+/g;

function splitLocationPath(value) {
  if (typeof value !== 'string') return [];

  const normalized = value.trim().replace(ALTERNATE_LOCATION_SEPARATORS, '/');
  if (!normalized) return [];

  const segments = normalized.split('/').map(segment => segment.trim());
  if (segments.some(segment => !segment)) return [];
  return segments;
}

/**
 * Parse a strict wuxia location path.
 *
 * Valid paths have exactly three strict scope segments and may include one
 * optional narrative scene segment.
 */
export function parseLocationPath(value) {
  const segments = splitLocationPath(value);
  if (segments.length !== 3 && segments.length !== 4) return null;

  const [area, region, location, scene] = segments;
  const scopePath = segments.slice(0, 3).join('/');
  return {
    area,
    region,
    location,
    scene: scene || null,
    scopePath,
    fullPath: segments.join('/'),
    segments,
  };
}

export function normalizeLocationPath(value) {
  return parseLocationPath(value)?.fullPath || '';
}

export function getLocationScopePath(value) {
  return parseLocationPath(value)?.scopePath || '';
}

export function getLocationScene(value) {
  return parseLocationPath(value)?.scene || '';
}

export function getLocationRegionPath(value) {
  const parsed = parseLocationPath(value);
  return parsed ? `${parsed.area}/${parsed.region}` : '';
}

export function isSameLocationScope(left, right) {
  const leftScope = getLocationScopePath(left);
  return !!leftScope && leftScope === getLocationScopePath(right);
}

export function isSameLocationScene(left, right) {
  const leftPath = normalizeLocationPath(left);
  return !!leftPath && leftPath === normalizeLocationPath(right);
}
