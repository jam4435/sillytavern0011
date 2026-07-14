import type { MapData, MapRegion } from '../types';
import { loadMapData } from './mapLoader';
import { FRONTEND_VARIABLES_KEY } from './frontendVariableKeys';
import { isLocationUnlocked } from './mapUtils';

const DEFAULT_ADJACENT_REGION_LIMIT = 4;
export const LOCATION_CONTEXT_VARIABLE_KEY = '周围地点';
const LEGACY_LOCATION_CONTEXT_VARIABLE_KEY = '地图上下文';
const STAT_DATA_KEY = 'stat_data';
const WORLD_INFO_KEY = '世界信息';

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
  普通移动: string[];
  事件目标: string[];
  地图指定: string[];
}

export interface DynamicLocationContextVariableOptions {
  eventTargetPaths?: string[];
  explicitMapTargets?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function omitKeys(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

export function normalizeLocationPath(value: string): string {
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

function toRegionOption(region: MapRegionReference, exploredLocations: string[]): LocationRegionOption {
  return {
    path: region.path,
    locations: Object.entries(region.region.地点)
      .map(([locationName, location]) => ({
        path: `${region.path}/${locationName}`,
        location,
      }))
      .filter(({ path, location }) => isLocationUnlocked(path, location, exploredLocations))
      .map(({ path }) => path),
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
  exploredLocations: string[] = [],
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

  const currentRegions = resolvedRegions.map(region => toRegionOption(region, exploredLocations));
  const adjacentRegions = resolveAdjacentRegions(allRegions, resolvedRegions, adjacentRegionLimit)
    .map(region => toRegionOption(region, exploredLocations));
  const allowedLocationPaths = [
    ...currentRegions.flatMap(region => region.locations),
    ...adjacentRegions.flatMap(region => region.locations),
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
    '相邻二级地点内已解锁的三级地点（按地图坐标由近到远）：',
    formatPathList(context.adjacentRegions.flatMap(region => region.locations)) || '- (无)',
    '强制规则：',
    '1. 仅当剧情中确实发生移动时，才修改 user数据.所在位置。',
    '2. 新值必须逐字等于上方某个三级地点完整路径；以上路径是唯一写入白名单。',
    '3. 不得缩写路径、只写末级名称、杜撰地点，或写入白名单之外的值。',
    '4. 二级地点本身不可作为移动目标；移动必须落到具体三级地点。',
  ].join('\n');
}

export function getCurrentPlayerLocation(): string {
  const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
  const statData = isRecord(variables.stat_data) ? variables.stat_data : variables;
  const userData = isRecord(statData.user数据) ? statData.user数据 : null;
  const location = userData?.所在位置;
  return typeof location === 'string' ? location.trim() : '';
}

export async function buildCurrentDynamicLocationContext(): Promise<DynamicLocationContext> {
  const mapData = await loadMapData();
  const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
  const statData = isRecord(variables.stat_data) ? variables.stat_data : variables;
  const userData = isRecord(statData.user数据) ? statData.user数据 : {};
  const exploredLocations = Array.isArray(userData.已探索地点)
    ? userData.已探索地点.filter((value): value is string => typeof value === 'string')
    : [];
  return buildDynamicLocationContext(mapData, getCurrentPlayerLocation(), DEFAULT_ADJACENT_REGION_LIMIT, exploredLocations);
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
  options: DynamicLocationContextVariableOptions = {},
): DynamicLocationContextVariable {
  const eventTargets = normalizeCompleteLocationPaths(options.eventTargetPaths || []);
  const explicitMapTargets = normalizeCompleteLocationPaths(options.explicitMapTargets || []);
  return {
    普通移动: [...new Set(context.allowedLocationPaths)],
    事件目标: eventTargets,
    地图指定: explicitMapTargets,
  };
}

function normalizeCompleteLocationPaths(paths: string[]): string[] {
  return [...new Set(paths
    .map(normalizeLocationPath)
    .filter(path => path.split('/').filter(Boolean).length === 3))];
}

export function extractExplicitMapTargetsFromText(text: string): string[] {
  const targets: string[] = [];
  const pattern = /\[地图指令\]从[^\r\n]+?移动到([^\r\n]+)/g;
  for (const match of text.matchAll(pattern)) {
    targets.push(match[1].trim());
  }
  return normalizeCompleteLocationPaths(targets);
}

export function collectEventTargetPaths(statData: Record<string, unknown>): string[] {
  const targets: string[] = [];
  const nearbyRumors = isRecord(statData.附近传闻) ? statData.附近传闻 : {};
  const followupClues = isRecord(statData.后续事件线索) ? statData.后续事件线索 : {};

  for (const value of Object.values(nearbyRumors)) {
    if (typeof value !== 'string') continue;
    const match = value.match(/\[[^\]/]+\/(.+)]\s*$/);
    if (match?.[1]) targets.push(match[1]);
  }
  for (const value of Object.values(followupClues)) {
    if (typeof value !== 'string') continue;
    const match = value.match(/^\([^，]+，([^，]+)，似乎还会有事情发生\)/);
    if (match?.[1]) targets.push(match[1]);
  }

  return normalizeCompleteLocationPaths(targets);
}

function getWorldInfoRecord(variables: Record<string, unknown>): Record<string, unknown> {
  const statData = isRecord(variables[STAT_DATA_KEY]) ? variables[STAT_DATA_KEY] : variables;
  return isRecord(statData[WORLD_INFO_KEY]) ? statData[WORLD_INFO_KEY] : {};
}

function getFrontendVariablesRecord(variables: Record<string, unknown>): Record<string, unknown> {
  const statData = isRecord(variables[STAT_DATA_KEY]) ? variables[STAT_DATA_KEY] : variables;
  return isRecord(statData[FRONTEND_VARIABLES_KEY]) ? statData[FRONTEND_VARIABLES_KEY] : {};
}

function hasLegacyLocationContext(variables: Record<string, unknown>): boolean {
  return (
    Object.hasOwn(variables, LEGACY_LOCATION_CONTEXT_VARIABLE_KEY) ||
    Object.hasOwn(variables, LOCATION_CONTEXT_VARIABLE_KEY) ||
    Object.hasOwn(getWorldInfoRecord(variables), LEGACY_LOCATION_CONTEXT_VARIABLE_KEY) ||
    Object.hasOwn(getWorldInfoRecord(variables), LOCATION_CONTEXT_VARIABLE_KEY)
  );
}

export function updateLocationContextInVariables(
  variables: Record<string, unknown>,
  value: DynamicLocationContextVariable,
): Record<string, unknown> {
  const rootVariables = omitKeys(variables, [LEGACY_LOCATION_CONTEXT_VARIABLE_KEY, LOCATION_CONTEXT_VARIABLE_KEY]);
  const hasStatDataWrapper = isRecord(variables[STAT_DATA_KEY]);
  const statData = hasStatDataWrapper ? variables[STAT_DATA_KEY] as Record<string, unknown> : rootVariables;
  const worldInfo = omitKeys(
    isRecord(statData[WORLD_INFO_KEY]) ? statData[WORLD_INFO_KEY] : {},
    [LEGACY_LOCATION_CONTEXT_VARIABLE_KEY, LOCATION_CONTEXT_VARIABLE_KEY],
  );
  const frontendVariables = isRecord(statData[FRONTEND_VARIABLES_KEY]) ? statData[FRONTEND_VARIABLES_KEY] : {};
  const nextStatData = {
    ...statData,
    [FRONTEND_VARIABLES_KEY]: {
      ...frontendVariables,
      [LOCATION_CONTEXT_VARIABLE_KEY]: value,
    },
  };
  if (Object.keys(worldInfo).length > 0) {
    nextStatData[WORLD_INFO_KEY] = worldInfo;
  } else {
    delete nextStatData[WORLD_INFO_KEY];
  }

  if (hasStatDataWrapper) {
    return {
      ...rootVariables,
      [STAT_DATA_KEY]: nextStatData,
    };
  }

  return nextStatData;
}

export async function syncDynamicLocationContextVariable(
  options: Pick<DynamicLocationContextVariableOptions, 'explicitMapTargets'> = {},
): Promise<DynamicLocationContextVariable | null> {
  try {
    const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    const statData = isRecord(variables.stat_data) ? variables.stat_data : variables;
    const value = createDynamicLocationContextVariable(await buildCurrentDynamicLocationContext(), {
      eventTargetPaths: collectEventTargetPaths(statData),
      explicitMapTargets: options.explicitMapTargets,
    });
    const frontendVariables = getFrontendVariablesRecord(variables);
    if (
      JSON.stringify(frontendVariables[LOCATION_CONTEXT_VARIABLE_KEY]) === JSON.stringify(value) &&
      !hasLegacyLocationContext(variables)
    ) {
      return value;
    }

    updateVariablesWith(
      currentVariables => updateLocationContextInVariables(currentVariables as Record<string, unknown>, value),
      { type: 'chat' },
    );
    return value;
  } catch (error) {
    console.warn('[locationContext] 刷新聊天变量「前端变量.周围地点」失败。', error);
    return null;
  }
}
