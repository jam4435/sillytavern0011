import type { MapData, MapRegion } from '../types';
import { loadMapData } from './mapLoader';

const DEFAULT_ADJACENT_REGION_LIMIT = 4;
export const LOCATION_CONTEXT_VARIABLE_KEY = '地图上下文';

interface MapRegionReference {
  areaName: string;
  regionName: string;
  region: MapRegion;
  path: string;
}

export interface LocationRegionOption {
  path: string;
  locations: string[];
}

export interface DynamicLocationContext {
  currentLocation: string;
  currentRegions: LocationRegionOption[];
  adjacentRegions: LocationRegionOption[];
  allowedLocationPaths: string[];
  resolved: boolean;
  ambiguous: boolean;
}

export interface DynamicLocationContextVariable {
  当前所在位置: string;
  当前二级地点: string[];
  当前二级地点内三级地点: string[];
  相邻二级地点: string[];
  允许写入地点: string[];
  已解析: boolean;
  存在同名候选: boolean;
  地点限制提示词: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLocationPath(value: string): string {
  return value
    .trim()
    .replace(/[\\＞>›→]+/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function flattenMapRegions(mapData: MapData): MapRegionReference[] {
  return Object.entries(mapData).flatMap(([areaName, area]) =>
    Object.entries(area.子区域).map(([regionName, region]) => ({
      areaName,
      regionName,
      region,
      path: `${areaName}/${regionName}`,
    })),
  );
}

function uniqueRegions(regions: MapRegionReference[]): MapRegionReference[] {
  return [...new Map(regions.map(region => [region.path, region])).values()];
}

function resolveCurrentRegions(regions: MapRegionReference[], currentLocation: string): MapRegionReference[] {
  const normalized = normalizeLocationPath(currentLocation);
  if (!normalized) {
    return [];
  }

  const segments = normalized.split('/').filter(Boolean);
  const last = segments.at(-1) || '';
  const previous = segments.at(-2) || '';
  const beforePrevious = segments.at(-3) || '';

  const exactLocationPathMatches = regions.filter(region =>
    beforePrevious === region.areaName &&
    previous === region.regionName &&
    Object.hasOwn(region.region.地点, last),
  );
  if (exactLocationPathMatches.length > 0) {
    return uniqueRegions(exactLocationPathMatches);
  }

  const exactRegionPathMatches = regions.filter(
    region => previous === region.areaName && last === region.regionName,
  );
  if (exactRegionPathMatches.length > 0) {
    return uniqueRegions(exactRegionPathMatches);
  }

  const relativeLocationPathMatches = regions.filter(
    region => previous === region.regionName && Object.hasOwn(region.region.地点, last),
  );
  if (relativeLocationPathMatches.length > 0) {
    return uniqueRegions(relativeLocationPathMatches);
  }

  const regionNameMatches = regions.filter(region => normalized === region.regionName);
  if (regionNameMatches.length > 0) {
    return uniqueRegions(regionNameMatches);
  }

  return uniqueRegions(regions.filter(region => Object.hasOwn(region.region.地点, normalized)));
}

function toRegionOption(region: MapRegionReference): LocationRegionOption {
  return {
    path: region.path,
    locations: Object.keys(region.region.地点).map(locationName => `${region.path}/${locationName}`),
  };
}

function getSquaredDistance(left: MapRegionReference, right: MapRegionReference): number {
  const x = left.region.坐标.x - right.region.坐标.x;
  const y = left.region.坐标.y - right.region.坐标.y;
  return x * x + y * y;
}

function resolveAdjacentRegions(
  allRegions: MapRegionReference[],
  currentRegions: MapRegionReference[],
  limit: number,
): MapRegionReference[] {
  const currentPaths = new Set(currentRegions.map(region => region.path));

  return allRegions
    .filter(region => !currentPaths.has(region.path))
    .map(region => ({
      region,
      distance: Math.min(...currentRegions.map(current => getSquaredDistance(current, region))),
    }))
    .sort((left, right) =>
      left.distance - right.distance || left.region.path.localeCompare(right.region.path, 'zh-CN'),
    )
    .slice(0, Math.max(0, limit))
    .map(item => item.region);
}

export function buildDynamicLocationContext(
  mapData: MapData,
  currentLocation: string,
  adjacentRegionLimit = DEFAULT_ADJACENT_REGION_LIMIT,
): DynamicLocationContext {
  const allRegions = flattenMapRegions(mapData);
  const resolvedRegions = resolveCurrentRegions(allRegions, currentLocation);
  if (resolvedRegions.length === 0) {
    return {
      currentLocation,
      currentRegions: [],
      adjacentRegions: [],
      allowedLocationPaths: [],
      resolved: false,
      ambiguous: false,
    };
  }

  const currentRegions = resolvedRegions.map(toRegionOption);
  const adjacentRegions = resolveAdjacentRegions(allRegions, resolvedRegions, adjacentRegionLimit).map(toRegionOption);
  const allowedLocationPaths = [
    ...currentRegions.flatMap(region => region.locations),
    ...adjacentRegions.map(region => region.path),
  ];

  return {
    currentLocation,
    currentRegions,
    adjacentRegions,
    allowedLocationPaths: [...new Set(allowedLocationPaths)],
    resolved: true,
    ambiguous: resolvedRegions.length > 1,
  };
}

function formatPathList(paths: string[]): string {
  return paths.map(path => `- ${path}`).join('\n');
}

export function formatDynamicLocationConstraint(context: DynamicLocationContext): string {
  const title = '【动态地图地点约束】';
  if (!context.resolved) {
    return [
      title,
      `当前 user数据.所在位置：${context.currentLocation || '(空)'}`,
      '当前值无法在地点表中定位到二级地点。',
      '强制规则：本轮不得修改 user数据.所在位置，必须保留当前值。',
    ].join('\n');
  }

  const currentRegionLocations = context.currentRegions.flatMap(region => region.locations);
  const currentRegionHeading = context.ambiguous
    ? '当前值存在同名地点，可能所属的二级地点：'
    : '当前所属二级地点：';

  return [
    title,
    `当前 user数据.所在位置：${context.currentLocation}`,
    currentRegionHeading,
    formatPathList(context.currentRegions.map(region => region.path)),
    '当前二级地点内可到达的三级地点：',
    formatPathList(currentRegionLocations),
    '可直接进入的相邻二级地点（按地图坐标由近到远）：',
    formatPathList(context.adjacentRegions.map(region => region.path)) || '- (无)',
    '强制规则：',
    '1. 仅当剧情中确实发生移动时，才修改 user数据.所在位置。',
    '2. 新值必须逐字等于上方某个三级地点完整路径，或某个相邻二级地点完整路径；以上两组路径是唯一写入白名单。',
    '3. 不得缩写路径、只写末级名称、杜撰地点，或写入白名单之外的值。',
    '4. 进入相邻二级地点后，其三级地点将在下一回合开放，不得本回合跨越二级地点直接写入其中的三级地点。',
  ].join('\n');
}

export function getCurrentPlayerLocation(): string {
  const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
  const statData = isRecord(variables.stat_data) ? variables.stat_data : variables;
  const userData = isRecord(statData.user数据) ? statData.user数据 : null;
  const location = userData?.所在位置;
  return typeof location === 'string' ? location.trim() : '';
}

async function buildCurrentDynamicLocationContext(): Promise<DynamicLocationContext> {
  const mapData = await loadMapData();
  return buildDynamicLocationContext(mapData, getCurrentPlayerLocation());
}

export async function buildDynamicLocationConstraintPrompt(): Promise<string> {
  try {
    return formatDynamicLocationConstraint(await buildCurrentDynamicLocationContext());
  } catch (error) {
    console.warn('[locationContext] 构建动态地点约束失败。', error);
    return '';
  }
}

export function createDynamicLocationContextVariable(
  context: DynamicLocationContext,
): DynamicLocationContextVariable {
  return {
    当前所在位置: context.currentLocation,
    当前二级地点: context.currentRegions.map(region => region.path),
    当前二级地点内三级地点: context.currentRegions.flatMap(region => region.locations),
    相邻二级地点: context.adjacentRegions.map(region => region.path),
    允许写入地点: context.allowedLocationPaths,
    已解析: context.resolved,
    存在同名候选: context.ambiguous,
    地点限制提示词: formatDynamicLocationConstraint(context),
  };
}

export async function syncDynamicLocationContextVariable(): Promise<DynamicLocationContextVariable | null> {
  try {
    const value = createDynamicLocationContextVariable(await buildCurrentDynamicLocationContext());
    const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    if (JSON.stringify(variables[LOCATION_CONTEXT_VARIABLE_KEY]) === JSON.stringify(value)) {
      return value;
    }

    updateVariablesWith(
      currentVariables => ({
        ...currentVariables,
        [LOCATION_CONTEXT_VARIABLE_KEY]: value,
      }),
      { type: 'chat' },
    );
    return value;
  } catch (error) {
    console.warn('[locationContext] 刷新聊天变量「地图上下文」失败。', error);
    return null;
  }
}
