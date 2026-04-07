/**
 * 地图侧边栏组件
 * 显示三级折叠列表，用于文字导航
 */

import React, { useState } from 'react';
import { MapData, MapArea, MapRegion, MapLocation } from '../types';
import { isLocationUnlocked, buildLocationPath } from '../utils/mapUtils';

interface MapSidebarProps {
  mapData: MapData;
  exploredLocations: string[];
  currentLocation: string;
  onLocationClick: (locationPath: string) => void;
}

const MapSidebar: React.FC<MapSidebarProps> = ({
  mapData,
  exploredLocations,
  currentLocation,
  onLocationClick
}) => {
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  // 切换大区域展开状态
  const toggleArea = (areaName: string) => {
    setExpandedAreas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(areaName)) {
        newSet.delete(areaName);
      } else {
        newSet.add(areaName);
      }
      return newSet;
    });
  };

  // 切换中区域展开状态
  const toggleRegion = (regionKey: string) => {
    setExpandedRegions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(regionKey)) {
        newSet.delete(regionKey);
      } else {
        newSet.add(regionKey);
      }
      return newSet;
    });
  };

  // 检查区域是否已探索
  const isRegionExplored = (areaName: string, regionName: string, region: MapRegion): boolean => {
    for (const locationName in region.地点) {
      const locationPath = buildLocationPath(areaName, regionName, locationName);
      const location = region.地点[locationName];
      if (exploredLocations.includes(locationPath) || location.初始探索) {
        return true;
      }
    }
    return false;
  };

  // 检查地点是否是当前位置
  const isCurrentLoc = (locationPath: string): boolean => {
    return currentLocation === locationPath || currentLocation.endsWith(locationPath.split('/').pop() || '');
  };

  // 处理地点点击
  const handleLocationClick = (locationPath: string, location: MapLocation) => {
    const unlocked = isLocationUnlocked(locationPath, location, exploredLocations);
    if (!unlocked) {
      console.warn(`[MapSidebar] 地点未解锁: ${locationPath}`);
      return;
    }
    onLocationClick(locationPath);
  };

  return (
    <div className="map-sidebar">
      <div className="sidebar-title">九州舆图</div>
      <div className="sidebar-content">
        {Object.entries(mapData).map(([areaName, area]: [string, MapArea]) => {
          // 检查大区域是否有已探索的中区域
          const hasExploredRegion = Object.entries(area.子区域).some(([regionName, region]) =>
            isRegionExplored(areaName, regionName, region)
          );

          if (!hasExploredRegion) {
            return null; // 未探索的大区域不显示
          }

          const isExpanded = expandedAreas.has(areaName);

          return (
            <div key={areaName} className="area-section">
              <div className="area-header" onClick={() => toggleArea(areaName)}>
                <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                <span className="area-name">{areaName}</span>
                <span className="area-desc">{area.描述}</span>
              </div>

              {isExpanded && (
                <div className="region-list">
                  {Object.entries(area.子区域).map(([regionName, region]: [string, MapRegion]) => {
                    const explored = isRegionExplored(areaName, regionName, region);
                    if (!explored) {
                      return null; // 未探索的中区域不显示
                    }

                    const regionKey = `${areaName}-${regionName}`;
                    const isRegionExpanded = expandedRegions.has(regionKey);

                    return (
                      <div key={regionKey} className="region-section">
                        <div className="region-header" onClick={() => toggleRegion(regionKey)}>
                          <span className="expand-icon">{isRegionExpanded ? '▼' : '▶'}</span>
                          <span className="region-name">{regionName}</span>
                          <span className="region-desc">{region.描述}</span>
                        </div>

                        {isRegionExpanded && (
                          <div className="location-list">
                            {Object.entries(region.地点).map(([locationName, location]: [string, MapLocation]) => {
                              const locationPath = buildLocationPath(areaName, regionName, locationName);
                              const unlocked = isLocationUnlocked(locationPath, location, exploredLocations);
                              const isCurrent = isCurrentLoc(locationPath);

                              // 未解锁的地点不显示
                              if (!unlocked) {
                                return null;
                              }

                              return (
                                <div
                                  key={locationName}
                                  className={`location-item ${isCurrent ? 'current' : ''}`}
                                  onClick={() => handleLocationClick(locationPath, location)}
                                >
                                  <span className="location-name">
                                    {isCurrent && '📍 '}
                                    {locationName}
                                  </span>
                                  <span className="location-desc">{location.描述}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MapSidebar;
