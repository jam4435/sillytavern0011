import { LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface CameraState {
  centerX: number;
  centerY: number;
  zoom: number;
}

interface CanvasSize {
  width: number;
  height: number;
}

interface GestureState {
  mode: 'pan' | 'pinch';
  startCamera: CameraState;
  startPoint?: { x: number; y: number };
  startDistance?: number;
  anchorWorld?: MapCoordinate;
  moved: boolean;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

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

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function getViewportSize(camera: CameraState, canvasSize: CanvasSize) {
  if (canvasSize.width > 768) {
    return {
      width: MAP_WIDTH / camera.zoom,
      height: MAP_HEIGHT / camera.zoom,
    };
  }

  const canvasAspect = Math.max(0.2, canvasSize.width / Math.max(canvasSize.height, 1));
  const mapAspect = MAP_WIDTH / MAP_HEIGHT;

  const baseWidth = canvasAspect >= mapAspect ? MAP_WIDTH : MAP_HEIGHT * canvasAspect;
  const baseHeight = canvasAspect >= mapAspect ? MAP_WIDTH / canvasAspect : MAP_HEIGHT;

  return {
    width: baseWidth / camera.zoom,
    height: baseHeight / camera.zoom,
  };
}

function clampCamera(camera: CameraState, canvasSize: CanvasSize): CameraState {
  const zoom = clampZoom(camera.zoom);
  const viewport = getViewportSize({ ...camera, zoom }, canvasSize);
  const halfWidth = viewport.width / 2;
  const halfHeight = viewport.height / 2;

  return {
    zoom,
    centerX: Math.max(halfWidth, Math.min(MAP_WIDTH - halfWidth, camera.centerX)),
    centerY: Math.max(halfHeight, Math.min(MAP_HEIGHT - halfHeight, camera.centerY)),
  };
}

function getDistance(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getMidpoint(first: { x: number; y: number }, second: { x: number; y: number }) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  exploredLocations,
  currentLocation,
  plannedLocations,
  onLocationClick,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cameraRef = useRef<CameraState>({ centerX: MAP_WIDTH / 2, centerY: MAP_HEIGHT / 2, zoom: 1 });
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<GestureState | null>(null);
  const suppressClickRef = useRef(false);
  const hasUserMovedRef = useRef(false);
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const [camera, setCamera] = useState<CameraState>(cameraRef.current);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 900, height: 600 });
  const [isDragging, setIsDragging] = useState(false);

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

  const applyCamera = useCallback(
    (nextCamera: CameraState) => {
      const clamped = clampCamera(nextCamera, canvasSize);
      cameraRef.current = clamped;
      setCamera(clamped);
    },
    [canvasSize],
  );

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    applyCamera(cameraRef.current);
  }, [applyCamera, canvasSize]);

  useEffect(() => {
    if (!hasUserMovedRef.current && route.current) {
      applyCamera({ centerX: route.current.x, centerY: route.current.y, zoom: 1 });
    }
  }, [applyCamera, route.current]);

  const viewport = useMemo(() => {
    const size = getViewportSize(camera, canvasSize);
    return {
      width: size.width,
      height: size.height,
      x: camera.centerX - size.width / 2,
      y: camera.centerY - size.height / 2,
    };
  }, [camera, canvasSize]);

  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, nextZoom: number) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }

      const rect = svg.getBoundingClientRect();
      const currentCamera = cameraRef.current;
      const currentSize = getViewportSize(currentCamera, canvasSize);
      const currentX = currentCamera.centerX - currentSize.width / 2;
      const currentY = currentCamera.centerY - currentSize.height / 2;
      const ratioX = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
      const ratioY = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(rect.height, 1)));
      const worldX = currentX + ratioX * currentSize.width;
      const worldY = currentY + ratioY * currentSize.height;
      const zoom = clampZoom(nextZoom);
      const nextSize = getViewportSize({ ...currentCamera, zoom }, canvasSize);

      hasUserMovedRef.current = true;
      setSelectedRegion(null);
      applyCamera({
        zoom,
        centerX: worldX - ratioX * nextSize.width + nextSize.width / 2,
        centerY: worldY - ratioY * nextSize.height + nextSize.height / 2,
      });
    },
    [applyCamera, canvasSize],
  );

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
    zoomAtPoint(event.clientX, event.clientY, cameraRef.current.zoom * factor);
  };

  const beginPinchGesture = () => {
    const points = Array.from(activePointersRef.current.values());
    const svg = svgRef.current;
    if (points.length < 2 || !svg) {
      return;
    }

    const first = points[0];
    const second = points[1];
    const midpoint = getMidpoint(first, second);
    const rect = svg.getBoundingClientRect();
    const startCamera = cameraRef.current;
    const startSize = getViewportSize(startCamera, canvasSize);
    const startX = startCamera.centerX - startSize.width / 2;
    const startY = startCamera.centerY - startSize.height / 2;

    gestureRef.current = {
      mode: 'pinch',
      startCamera,
      startDistance: getDistance(first, second),
      anchorWorld: {
        x: startX + ((midpoint.x - rect.left) / Math.max(rect.width, 1)) * startSize.width,
        y: startY + ((midpoint.y - rect.top) / Math.max(rect.height, 1)) * startSize.height,
      },
      moved: true,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setSelectedRegion(null);
    setIsDragging(true);

    if (activePointersRef.current.size >= 2) {
      beginPinchGesture();
      return;
    }

    gestureRef.current = {
      mode: 'pan',
      startCamera: cameraRef.current,
      startPoint: { x: event.clientX, y: event.clientY },
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) {
      return;
    }

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    const svg = svgRef.current;
    if (!gesture || !svg) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    if (gesture.mode === 'pinch' && activePointersRef.current.size >= 2) {
      const points = Array.from(activePointersRef.current.values());
      const midpoint = getMidpoint(points[0], points[1]);
      const distance = getDistance(points[0], points[1]);
      const zoom = clampZoom(gesture.startCamera.zoom * (distance / Math.max(gesture.startDistance ?? distance, 1)));
      const nextSize = getViewportSize({ ...gesture.startCamera, zoom }, canvasSize);
      const ratioX = (midpoint.x - rect.left) / Math.max(rect.width, 1);
      const ratioY = (midpoint.y - rect.top) / Math.max(rect.height, 1);
      const anchor = gesture.anchorWorld ?? { x: gesture.startCamera.centerX, y: gesture.startCamera.centerY };

      hasUserMovedRef.current = true;
      applyCamera({
        zoom,
        centerX: anchor.x - ratioX * nextSize.width + nextSize.width / 2,
        centerY: anchor.y - ratioY * nextSize.height + nextSize.height / 2,
      });
      return;
    }

    if (gesture.mode === 'pan' && gesture.startPoint) {
      const deltaX = event.clientX - gesture.startPoint.x;
      const deltaY = event.clientY - gesture.startPoint.y;
      if (Math.hypot(deltaX, deltaY) > 4) {
        gesture.moved = true;
        hasUserMovedRef.current = true;
      }

      const startSize = getViewportSize(gesture.startCamera, canvasSize);
      applyCamera({
        ...gesture.startCamera,
        centerX: gesture.startCamera.centerX - (deltaX / Math.max(rect.width, 1)) * startSize.width,
        centerY: gesture.startCamera.centerY - (deltaY / Math.max(rect.height, 1)) * startSize.height,
      });
    }
  };

  const finishPointerGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    if (gestureRef.current?.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size >= 2) {
      beginPinchGesture();
      return;
    }

    const remainingPointer = Array.from(activePointersRef.current.values())[0];
    if (remainingPointer) {
      gestureRef.current = {
        mode: 'pan',
        startCamera: cameraRef.current,
        startPoint: remainingPointer,
        moved: true,
      };
      return;
    }

    gestureRef.current = null;
    setIsDragging(false);
  };

  const handleRegionClick = (
    areaName: string,
    regionName: string,
    region: MapRegion,
    event: React.MouseEvent<SVGGElement> | React.KeyboardEvent<SVGGElement>,
  ) => {
    if (suppressClickRef.current) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setSelectedRegion({
      areaName,
      regionName,
      region,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const changeZoom = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const rect = svg.getBoundingClientRect();
    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, cameraRef.current.zoom * factor);
  };

  const resetCamera = () => {
    hasUserMovedRef.current = false;
    setSelectedRegion(null);
    const focus = route.current ?? { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    applyCamera({ centerX: focus.x, centerY: focus.y, zoom: 1 });
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
    <div ref={canvasRef} className={`map-canvas ${isDragging ? 'dragging' : ''}`}>
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

      <div className="map-zoom-controls" aria-label="地图缩放控制">
        <button
          type="button"
          onClick={() => changeZoom(1.35)}
          disabled={camera.zoom >= MAX_ZOOM - 0.01}
          aria-label="放大地图"
          title="放大"
        >
          <ZoomIn size={18} />
        </button>
        <button type="button" onClick={resetCamera} aria-label="复位地图" title="回到当前位置">
          <LocateFixed size={18} />
        </button>
        <button
          type="button"
          onClick={() => changeZoom(1 / 1.35)}
          disabled={camera.zoom <= MIN_ZOOM + 0.01}
          aria-label="缩小地图"
          title="缩小"
        >
          <ZoomOut size={18} />
        </button>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
        preserveAspectRatio={canvasSize.width <= 768 ? 'none' : 'xMidYMid meet'}
        aria-label="射雕与神雕剧情地图"
        onWheel={handleWheel}
        onDoubleClick={event => zoomAtPoint(event.clientX, event.clientY, cameraRef.current.zoom * 1.4)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        onPointerCancel={finishPointerGesture}
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
                    handleRegionClick(areaName, regionName, region, event);
                  }
                }}
                role="button"
                tabIndex={explored ? 0 : -1}
                aria-label={`${areaName} ${regionName}，${Object.keys(region.地点).length} 处地点`}
              >
                <circle className="marker-hit-area" cx={region.坐标.x} cy={region.坐标.y} r="18" />
                <circle className="marker-ring" cx={region.坐标.x} cy={region.坐标.y} r={current ? 9 : 7} />
                <circle className="marker-core" cx={region.坐标.x} cy={region.坐标.y} r={current ? 3.5 : 2.5} />
                <g
                  className="region-label-anchor"
                  transform={`translate(${region.坐标.x} ${region.坐标.y}) scale(${1 / camera.zoom})`}
                >
                  <text className="region-label" x="0" y="-17" textAnchor="middle">
                    {regionName}
                  </text>
                </g>
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
