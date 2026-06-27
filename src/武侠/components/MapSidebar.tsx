import { ChevronRight, MapPin, Search, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { MapArea, MapData, MapLocation, MapRegion } from '../types';
import { gameLogger } from '../utils/logger';
import { buildLocationPath, isLocationUnlocked } from '../utils/mapUtils';

interface MapSidebarProps {
  mapData: MapData;
  exploredLocations: string[];
  currentLocation: string;
  onLocationClick: (locationPath: string) => void;
}

const MapSidebar: React.FC<MapSidebarProps> = ({ mapData, exploredLocations, currentLocation, onLocationClick }) => {
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  const visibleAreas = useMemo(() => {
    const matches = (value: string) => value.toLocaleLowerCase().includes(normalizedSearch);

    return Object.entries(mapData).flatMap(([areaName, area]: [string, MapArea]) => {
      const areaMatches = normalizedSearch !== '' && (matches(areaName) || matches(area.描述));
      const regions = Object.entries(area.子区域).flatMap(([regionName, region]: [string, MapRegion]) => {
        const explored = Object.entries(region.地点).some(
          ([locationName, location]) =>
            exploredLocations.includes(buildLocationPath(areaName, regionName, locationName)) || location.初始探索,
        );
        if (!explored) {
          return [];
        }

        const regionMatches = normalizedSearch !== '' && (matches(regionName) || matches(region.描述));
        const unlockedLocations = Object.entries(region.地点).filter(([locationName, location]) =>
          isLocationUnlocked(buildLocationPath(areaName, regionName, locationName), location, exploredLocations),
        );
        const locations =
          normalizedSearch === '' || areaMatches || regionMatches
            ? unlockedLocations
            : unlockedLocations.filter(([locationName, location]) => [locationName, location.描述].some(matches));

        if (normalizedSearch !== '' && !areaMatches && !regionMatches && locations.length === 0) {
          return [];
        }

        return [{ regionName, region, locations }];
      });

      return regions.length > 0 ? [{ areaName, area, regions }] : [];
    });
  }, [exploredLocations, mapData, normalizedSearch]);

  const toggleArea = (areaName: string) => {
    setExpandedAreas(previous => {
      const next = new Set(previous);
      if (next.has(areaName)) {
        next.delete(areaName);
      } else {
        next.add(areaName);
      }
      return next;
    });
  };

  const toggleRegion = (regionKey: string) => {
    setExpandedRegions(previous => {
      const next = new Set(previous);
      if (next.has(regionKey)) {
        next.delete(regionKey);
      } else {
        next.add(regionKey);
      }
      return next;
    });
  };

  const isCurrentLocation = (locationPath: string): boolean =>
    currentLocation === locationPath || currentLocation.endsWith(locationPath.split('/').pop() || '');

  const handleLocationClick = (locationPath: string, location: MapLocation) => {
    if (!isLocationUnlocked(locationPath, location, exploredLocations)) {
      gameLogger.warn(`[MapSidebar] 地点未解锁: ${locationPath}`);
      return;
    }
    onLocationClick(locationPath);
  };

  return (
    <div className="map-sidebar">
      <div className="sidebar-title">九州舆图</div>

      <div className="map-search-field">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder="搜索地点"
          aria-label="搜索地点"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} aria-label="清空搜索" title="清空搜索">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="sidebar-content">
        {visibleAreas.length === 0 ? (
          <div className="map-search-empty">未找到相关地点</div>
        ) : (
          visibleAreas.map(({ areaName, area, regions }) => {
            const isExpanded = normalizedSearch !== '' || expandedAreas.has(areaName);

            return (
              <div key={areaName} className="area-section">
                <button type="button" className="area-header" onClick={() => toggleArea(areaName)}>
                  <ChevronRight className={`expand-icon ${isExpanded ? 'expanded' : ''}`} aria-hidden="true" />
                  <span className="area-name">{areaName}</span>
                  <span className="area-desc">{area.描述}</span>
                </button>

                {isExpanded && (
                  <div className="region-list">
                    {regions.map(({ regionName, region, locations }) => {
                      const regionKey = `${areaName}-${regionName}`;
                      const isRegionExpanded = normalizedSearch !== '' || expandedRegions.has(regionKey);

                      return (
                        <div key={regionKey} className="region-section">
                          <button type="button" className="region-header" onClick={() => toggleRegion(regionKey)}>
                            <ChevronRight
                              className={`expand-icon ${isRegionExpanded ? 'expanded' : ''}`}
                              aria-hidden="true"
                            />
                            <span className="region-name">{regionName}</span>
                            <span className="region-desc">{region.描述}</span>
                          </button>

                          {isRegionExpanded && (
                            <div className="location-list">
                              {locations.map(([locationName, location]) => {
                                const locationPath = buildLocationPath(areaName, regionName, locationName);
                                const current = isCurrentLocation(locationPath);

                                return (
                                  <button
                                    type="button"
                                    key={locationName}
                                    className={`location-item ${current ? 'current' : ''}`}
                                    onClick={() => handleLocationClick(locationPath, location)}
                                  >
                                    <span className="location-name">
                                      {current && <MapPin size={12} aria-hidden="true" />}
                                      {locationName}
                                    </span>
                                    <span className="location-desc">{location.描述}</span>
                                  </button>
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
          })
        )}
      </div>
    </div>
  );
};

export default MapSidebar;
