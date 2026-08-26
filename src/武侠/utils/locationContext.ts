import type { MapData, MapRegion } from '../types';
import { getLocationScopePath, normalizeLocationPath, parseLocationPath } from '../../shared/locationPath.js';
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
  currentScopePath: string;
  currentRegions: LocationRegionOption[];
  adjacentRegions: LocationRegionOption[];
  allowedLocationPaths: string[];
  resolved: boolean;
  ambiguous: boolean;
}

export interface DynamicLocationContextVariable {
  当前活动区: string;
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

export { normalizeLocationPath } from '../../shared/locationPath.js';

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
  const parsed = parseLocationPath(currentLocation);
  if (!parsed) return [];

  return regions.filter(
    region =>
      parsed.area === region.areaName &&
      parsed.region === region.regionName &&
      Object.hasOwn(region.region.地点, parsed.location),
  );
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
    .sort((left, right) => left.distance - right.distance || left.region.path.localeCompare(right.region.path, 'zh-CN'))
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
  const normalizedCurrentLocation = normalizeLocationPath(currentLocation);
  const currentScopePath = getLocationScopePath(currentLocation);
  const resolvedRegions = resolveCurrentRegions(allRegions, currentLocation);
  if (resolvedRegions.length === 0) {
    return {
      currentLocation: normalizedCurrentLocation,
      currentScopePath,
      currentRegions: [],
      adjacentRegions: [],
      allowedLocationPaths: [],
      resolved: false,
      ambiguous: false,
    };
  }

  const currentRegions = resolvedRegions.map(region => toRegionOption(region, exploredLocations));
  const adjacentRegions = resolveAdjacentRegions(allRegions, resolvedRegions, adjacentRegionLimit).map(region =>
    toRegionOption(region, exploredLocations),
  );
  const allowedLocationPaths = [
    ...currentRegions.flatMap(region => region.locations),
    ...adjacentRegions.flatMap(region => region.locations),
  ];

  return {
    currentLocation: normalizedCurrentLocation,
    currentScopePath,
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
      `当前 user数据.所在位置：${context.currentLocation || '(无效路径)'}`,
      '当前值不是地点表中的合法三级/四级完整路径。',
      '强制规则：本轮不得修改 user数据.所在位置，必须保留当前值。',
    ].join('\n');
  }

  const currentRegionLocations = context.currentRegions.flatMap(region => region.locations);
  return [
    title,
    '路径格式：一级/二级/三级[/四级]。',
    '一级是世界大域或政权；二级是地图旅行区域；三级是严格活动区；第四级是可选的具体镜头场景。',
    `当前完整位置：${context.currentLocation}`,
    `当前严格活动区：${context.currentScopePath}`,
    '当前二级地图区域：',
    formatPathList(context.currentRegions.map(region => region.path)),
    '当前二级区域内可到达的严格三级活动区：',
    formatPathList(currentRegionLocations),
    '相邻二级区域内已解锁的严格三级活动区（按地图坐标由近到远）：',
    formatPathList(context.adjacentRegions.flatMap(region => region.locations)) || '- (无)',
    '强制规则：',
    '1. 只有剧情中确实发生移动时才修改“所在位置”；未移动时不得改写第四级同义词。',
    '2. 新值只能是完整三级路径，或在完整三级路径后追加一个第四级场景。',
    '3. 前三级必须逐字等于合法活动区；不得缩写、改写或杜撰前三段。',
    '4. 第四级可按正文生成，不参加活动区白名单；同一场景优先复用已有名称。',
    '5. 同一前三段只表示处于同一事件活动区，不表示人物已经面对面同场。',
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
  return buildDynamicLocationContext(
    mapData,
    getCurrentPlayerLocation(),
    DEFAULT_ADJACENT_REGION_LIMIT,
    exploredLocations,
  );
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
    当前活动区: context.currentScopePath,
    普通移动: [...new Set(context.allowedLocationPaths)],
    事件目标: eventTargets,
    地图指定: explicitMapTargets,
  };
}

function normalizeCompleteLocationPaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeLocationPath).filter(Boolean))];
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
  const frontendVariables = isRecord(statData.前端变量) ? statData.前端变量 : {};
  const discoverableEvents = isRecord(frontendVariables.可发现事件) ? frontendVariables.可发现事件 : {};
  const followupClues = isRecord(statData.后续事件线索) ? statData.后续事件线索 : {};
  const participationEvents = isRecord(statData.参与事件) ? statData.参与事件 : {};
  const eventSystem = isRecord(statData.事件系统) ? statData.事件系统 : {};
  const participantOccupancy = isRecord(eventSystem.人物事件占用) ? eventSystem.人物事件占用 : {};
  const activeEventNames = new Set(Object.keys(participationEvents));

  for (const value of Object.values(participantOccupancy)) {
    if (!isRecord(value) || typeof value.事件名 !== 'string' || !activeEventNames.has(value.事件名)) continue;
    if (typeof value.地点 === 'string') {
      const occupancyScope = getLocationScopePath(value.地点);
      if (occupancyScope) targets.push(occupancyScope);
    }
  }

  for (const value of [...Object.values(nearbyRumors), ...Object.values(discoverableEvents)]) {
    if (typeof value !== 'string') continue;
    const match = value.match(/\[[^\]/]+\/(.+)]\s*$/);
    if (match?.[1]) targets.push(match[1]);
  }
  for (const value of Object.values(followupClues)) {
    if (typeof value !== 'string') continue;
    const structuredMatch = value.match(/(?:^|｜)地点：([^｜]+)(?:｜|$)/);
    const legacyMatch = value.match(/^\([^，]+，([^，]+)，似乎还会有事情发生\)/);
    const location = structuredMatch?.[1] || legacyMatch?.[1];
    if (location) targets.push(location);
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
  const statData = hasStatDataWrapper ? (variables[STAT_DATA_KEY] as Record<string, unknown>) : rootVariables;
  const worldInfo = omitKeys(isRecord(statData[WORLD_INFO_KEY]) ? statData[WORLD_INFO_KEY] : {}, [
    LEGACY_LOCATION_CONTEXT_VARIABLE_KEY,
    LOCATION_CONTEXT_VARIABLE_KEY,
  ]);
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
