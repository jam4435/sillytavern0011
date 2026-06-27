import locationTable from '../射雕神雕地点表.yaml';
import { MapData } from '../types';
import { AREA_COORDINATES, AREA_DESCRIPTIONS, clampMapCoordinate, REGION_COORDINATES } from '../data/mapCoordinates';

let cachedMapData: MapData | null = null;

type LocationTable = Record<string, Record<string, string[]>>;

function getFallbackCoordinate(areaName: string, index: number, total: number) {
  const areaCoordinate = AREA_COORDINATES[areaName] ?? { x: 768, y: 512 };
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const radius = 54 + (index % 3) * 20;

  return clampMapCoordinate({
    x: areaCoordinate.x + Math.cos(angle) * radius,
    y: areaCoordinate.y + Math.sin(angle) * radius,
  });
}

function getLocationCoordinate(regionCoordinate: { x: number; y: number }, index: number) {
  const angle = index * 2.399963229728653;
  const radius = 8 + Math.sqrt(index + 1) * 8;

  return clampMapCoordinate({
    x: regionCoordinate.x + Math.cos(angle) * radius,
    y: regionCoordinate.y + Math.sin(angle) * radius,
  });
}

function buildMapData(): MapData {
  const table = locationTable as LocationTable;

  return Object.fromEntries(
    Object.entries(table).map(([areaName, regions]) => {
      const regionEntries = Object.entries(regions);
      const areaCoordinate = AREA_COORDINATES[areaName] ?? getFallbackCoordinate(areaName, 0, 1);

      return [
        areaName,
        {
          描述: AREA_DESCRIPTIONS[areaName] ?? `${areaName}一带的江湖区域`,
          类型: '大区域' as const,
          坐标: areaCoordinate,
          子区域: Object.fromEntries(
            regionEntries.map(([regionName, locationNames], regionIndex) => {
              const regionCoordinate =
                REGION_COORDINATES[`${areaName}/${regionName}`] ??
                getFallbackCoordinate(areaName, regionIndex, regionEntries.length);

              return [
                regionName,
                {
                  描述: `${regionName}一带，共 ${locationNames.length} 处剧情地点`,
                  类型: '中区域' as const,
                  坐标: regionCoordinate,
                  地点: Object.fromEntries(
                    locationNames.map((locationName, locationIndex) => [
                      locationName,
                      {
                        描述: `${regionName}辖下的剧情场景`,
                        坐标: getLocationCoordinate(regionCoordinate, locationIndex),
                        初始探索: true,
                      },
                    ]),
                  ),
                },
              ];
            }),
          ),
        },
      ];
    }),
  );
}

/**
 * 加载地图数据
 * @returns 地图数据对象
 */
export async function loadMapData(): Promise<MapData> {
  if (cachedMapData) {
    return cachedMapData;
  }

  cachedMapData = buildMapData();
  return cachedMapData;
}

/**
 * 清除缓存的地图数据（用于开发/调试）
 */
export function clearMapCache(): void {
  cachedMapData = null;
}
