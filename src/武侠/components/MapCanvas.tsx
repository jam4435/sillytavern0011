import React, { useMemo, useState } from 'react';
import mapImageUrl from '../地图.jpg?url';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/mapCoordinates';
import { MapArea, MapCoordinate, MapData, MapRegion } from '../types';
import LocationPopover from './LocationPopover';

interface MapCanvasProps {
  mapData: MapData;
  exploredLocations: string[];
  currentLocation: string;
  plannedLocations: string[];
  onLocationClick: (locationPath: string) => void;
}

interface SelectedRegion {
  areaName: string;
  regionName: string;
  region: MapRegion;
  x: number;
  y: number;
}

function resolveLocationCoordinate(mapData: MapData, locationPath: string): MapCoordinate | null {
  const [exactArea, exactRegion, exactLocation] = locationPath.split('/');
  const exactMatch = mapData[exactArea]?.子区域[exactRegion]?.地点[exactLocation];
  if (exactMatch) {
    return exactMatch.坐标;
  }

  let regionMatch: MapCoordinate | null = null;
  for (const [areaName, area] of Object.entries(mapData)) {
    for (const [regionName, region] of Object.entries(area.子区域)) {
      for (const [name, location] of Object.entries(region.地点)) {
        if (locationPath === `${areaName}/${regionName}/${name}` || locationPath.endsWith(name)) {
          return location.坐标;
        }
      }

      if (!regionMatch && (locationPath === `${areaName}/${regionName}` || locationPath.endsWith(regionName))) {
        regionMatch = region.坐标;
      }
    }
  }

  return regionMatch;
}

function buildRoutePath(points: MapCoordinate[]): string {
  if (points.length < 2) {
    return '';
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  exploredLocations,
  currentLocation,
  plannedLocations,
  onLocationClick,
}) => {
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);

  const route = useMemo(() => {
    const current = resolveLocationCoordinate(mapData, currentLocation);
    const destinations = plannedLocations
      .map(path => ({ path, coordinate: resolveLocationCoordinate(mapData, path) }))
      .filter((item): item is { path: string; coordinate: MapCoordinate } => item.coordinate !== null);
    const points = current
      ? [current, ...destinations.map(item => item.coordinate)]
      : destinations.map(item => item.coordinate);

    return {
      current,
      destinations,
      path: buildRoutePath(points),
    };
  }, [currentLocation, mapData, plannedLocations]);

  const handleRegionClick = (
    areaName: string,
    regionName: string,
    region: MapRegion,
    event: React.MouseEvent<SVGGElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setSelectedRegion({
      areaName,
      regionName,
      region,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const isRegionExplored = (areaName: string, regionName: string, region: MapRegion): boolean =>
    Object.entries(region.地点).some(
      ([locationName, location]) =>
        exploredLocations.includes(`${areaName}/${regionName}/${locationName}`) || location.初始探索,
    );

  const isCurrentRegion = (areaName: string, regionName: string, region: MapRegion): boolean =>
    currentLocation === `${areaName}/${regionName}` ||
    currentLocation.endsWith(regionName) ||
    Object.keys(region.地点).some(
      locationName =>
        currentLocation === `${areaName}/${regionName}/${locationName}` || currentLocation.endsWith(locationName),
    );

  return (
    <div className="map-canvas">
      <div className="map-legend" aria-hidden="true">
        <span>
          <i className="legend-current" />
          所在
        </span>
        <span>
          <i className="legend-region" />
          地点
        </span>
        <span>
          <i className="legend-route" />
          行程
        </span>
      </div>

      {plannedLocations.length > 0 && (
        <div className="map-route-count" aria-live="polite">
          行程 {plannedLocations.length} 站
        </div>
      )}

      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="射雕与神雕剧情地图"
      >
        <defs>
          <filter id="map-marker-shadow" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1c130d" floodOpacity="0.6" />
          </filter>
          <filter id="map-route-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#fff1b8" floodOpacity="0.75" />
          </filter>
          <marker
            id="route-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#7f1d1d" />
          </marker>
        </defs>

        <image href={mapImageUrl} x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} />
        <rect className="map-image-wash" x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} />

        {route.path && (
          <g className="story-route" aria-hidden="true">
            <path className="route-underlay" d={route.path} />
            <path className="route-line" d={route.path} markerEnd="url(#route-arrow)" />
          </g>
        )}

        {Object.entries(mapData).map(([areaName, area]: [string, MapArea]) => (
          <g key={areaName} className="area-marker" aria-hidden="true">
            <path
              className="area-seal"
              d={`M ${area.坐标.x} ${area.坐标.y - 14} L ${area.坐标.x + 14} ${area.坐标.y} L ${area.坐标.x} ${area.坐标.y + 14} L ${area.坐标.x - 14} ${area.坐标.y} Z`}
            />
            <text x={area.坐标.x} y={area.坐标.y - 25} textAnchor="middle">
              {areaName}
            </text>
          </g>
        ))}

        {Object.entries(mapData).flatMap(([areaName, area]: [string, MapArea]) =>
          Object.entries(area.子区域).map(([regionName, region]: [string, MapRegion]) => {
            const explored = isRegionExplored(areaName, regionName, region);
            const current = isCurrentRegion(areaName, regionName, region);
            const selected = selectedRegion?.areaName === areaName && selectedRegion.regionName === regionName;

            return (
              <g
                key={`${areaName}-${regionName}`}
                className={`region-marker ${explored ? 'explored' : 'unexplored'} ${current ? 'current' : ''} ${selected ? 'selected' : ''}`}
                onClick={event => explored && handleRegionClick(areaName, regionName, region, event)}
                onKeyDown={event => {
                  if (explored && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    handleRegionClick(areaName, regionName, region, event as unknown as React.MouseEvent<SVGGElement>);
                  }
                }}
                role="button"
                tabIndex={explored ? 0 : -1}
                aria-label={`${areaName} ${regionName}，${Object.keys(region.地点).length} 处地点`}
              >
                <circle className="marker-hit-area" cx={region.坐标.x} cy={region.坐标.y} r="18" />
                <circle className="marker-ring" cx={region.坐标.x} cy={region.坐标.y} r={current ? 9 : 7} />
                <circle className="marker-core" cx={region.坐标.x} cy={region.坐标.y} r={current ? 3.5 : 2.5} />
                <text className="region-label" x={region.坐标.x} y={region.坐标.y - 17} textAnchor="middle">
                  {regionName}
                </text>
              </g>
            );
          }),
        )}

        {route.current && (
          <g
            className="current-location-marker"
            transform={`translate(${route.current.x} ${route.current.y})`}
            aria-hidden="true"
          >
            <circle className="current-pulse" r="18" />
            <circle className="current-dot" r="7" />
          </g>
        )}

        {route.destinations.map((destination, index) => (
          <g
            key={`${destination.path}-${index}`}
            className="route-stop-marker"
            transform={`translate(${destination.coordinate.x} ${destination.coordinate.y})`}
            aria-hidden="true"
          >
            <circle r="11" />
            <text x="0" y="4" textAnchor="middle">
              {index + 1}
            </text>
          </g>
        ))}
      </svg>

      {selectedRegion && (
        <LocationPopover
          areaName={selectedRegion.areaName}
          regionName={selectedRegion.regionName}
          region={selectedRegion.region}
          exploredLocations={exploredLocations}
          currentLocation={currentLocation}
          plannedLocations={plannedLocations}
          position={{ x: selectedRegion.x, y: selectedRegion.y }}
          onLocationClick={onLocationClick}
          onClose={() => setSelectedRegion(null)}
        />
      )}
    </div>
  );
};

export default MapCanvas;
