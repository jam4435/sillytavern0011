/**
 * 地图画布组件
 * 显示地图背景和标记点（仅显示大区域和中区域）
 */

import React, { useState } from 'react';
import { MapData, MapArea, MapRegion } from '../types';
import LocationPopover from './LocationPopover';

interface MapCanvasProps {
  mapData: MapData;
  exploredLocations: string[];
  currentLocation: string;
  onLocationClick: (locationPath: string) => void;
}

const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  exploredLocations,
  currentLocation,
  onLocationClick
}) => {
  const [selectedRegion, setSelectedRegion] = useState<{
    areaName: string;
    regionName: string;
    region: MapRegion;
    x: number;
    y: number;
  } | null>(null);

  // 处理中区域标记点击
  const handleRegionClick = (
    areaName: string,
    regionName: string,
    region: MapRegion,
    event: React.MouseEvent<SVGGElement>
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setSelectedRegion({
      areaName,
      regionName,
      region,
      x: rect.left + rect.width / 2,
      y: rect.top
    });
  };

  // 关闭浮窗
  const handleClosePopover = () => {
    setSelectedRegion(null);
  };

  // 检查区域是否已探索（区域下至少有一个地点已探索）
  const isRegionExplored = (areaName: string, regionName: string, region: MapRegion): boolean => {
    for (const locationName in region.地点) {
      const locationPath = `${areaName}/${regionName}/${locationName}`;
      const location = region.地点[locationName];
      if (exploredLocations.includes(locationPath) || location.初始探索) {
        return true;
      }
    }
    return false;
  };

  // 检查地点是否是当前位置
  const isCurrentLocation = (areaName: string, regionName: string, locationName: string): boolean => {
    const locationPath = `${areaName}/${regionName}/${locationName}`;
    return currentLocation === locationPath || currentLocation.endsWith(locationName);
  };

  return (
    <div className="map-canvas">
      <svg width="100%" height="100%" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">
        {/* 渲染大区域标记 */}
        {Object.entries(mapData).map(([areaName, area]: [string, MapArea]) => {
          const hasExploredRegion = Object.entries(area.子区域).some(([regionName, region]) =>
            isRegionExplored(areaName, regionName, region)
          );

          if (!hasExploredRegion) {
            return null; // 未探索的大区域不显示
          }

          return (
            <g key={areaName} className="area-marker explored">
              <circle
                cx={area.坐标.x}
                cy={area.坐标.y}
                r={12}
                fill="#d4af37"
                filter="drop-shadow(0 0 6px rgba(212, 175, 55, 0.6))"
              />
              <text
                x={area.坐标.x}
                y={area.坐标.y - 20}
                textAnchor="middle"
                fill="#44403c"
                fontSize="14"
                fontFamily="var(--font-serif)"
              >
                {areaName}
              </text>
            </g>
          );
        })}

        {/* 渲染中区域标记 */}
        {Object.entries(mapData).map(([areaName, area]: [string, MapArea]) =>
          Object.entries(area.子区域).map(([regionName, region]: [string, MapRegion]) => {
            const explored = isRegionExplored(areaName, regionName, region);
            const isCurrent = Object.keys(region.地点).some(locationName =>
              isCurrentLocation(areaName, regionName, locationName)
            );

            if (!explored) {
              return null; // 未探索的中区域不显示
            }

            return (
              <g
                key={`${areaName}-${regionName}`}
                className={`region-marker ${explored ? 'explored' : 'unexplored'} ${isCurrent ? 'current' : ''}`}
                onClick={(e) => handleRegionClick(areaName, regionName, region, e)}
                style={{ cursor: explored ? 'pointer' : 'default' }}
              >
                <circle
                  cx={region.坐标.x}
                  cy={region.坐标.y}
                  r={8}
                  fill={isCurrent ? '#d97706' : '#8b5a2b'}
                  filter={`drop-shadow(0 0 ${isCurrent ? '8px' : '4px'} rgba(139, 90, 43, ${isCurrent ? '0.8' : '0.5'}))`}
                />
                <text
                  x={region.坐标.x}
                  y={region.坐标.y - 15}
                  textAnchor="middle"
                  fill="#44403c"
                  fontSize="12"
                  fontFamily="var(--font-serif)"
                >
                  {regionName}
                </text>
              </g>
            );
          })
        )}
      </svg>

      {/* 小地点浮窗 */}
      {selectedRegion && (
        <LocationPopover
          areaName={selectedRegion.areaName}
          regionName={selectedRegion.regionName}
          region={selectedRegion.region}
          exploredLocations={exploredLocations}
          currentLocation={currentLocation}
          position={{ x: selectedRegion.x, y: selectedRegion.y }}
          onLocationClick={onLocationClick}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
};

export default MapCanvas;
