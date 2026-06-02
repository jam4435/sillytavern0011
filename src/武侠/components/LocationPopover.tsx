/**
 * 小地点浮窗组件
 * 点击中区域标记后弹出，显示该区域下的所有小地点
 */

import React, { useEffect, useRef } from 'react';
import { MapRegion, MapLocation } from '../types';
import { isLocationUnlocked, buildLocationPath } from '../utils/mapUtils';
import { gameLogger } from '../utils/logger';

interface LocationPopoverProps {
  areaName: string;
  regionName: string;
  region: MapRegion;
  exploredLocations: string[];
  currentLocation: string;
  position: { x: number; y: number };
  onLocationClick: (locationPath: string) => void;
  onClose: () => void;
}

const LocationPopover: React.FC<LocationPopoverProps> = ({
  areaName,
  regionName,
  region,
  exploredLocations,
  currentLocation,
  position,
  onLocationClick,
  onClose
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭浮窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // 处理地点点击
  const handleLocationClick = (locationName: string, location: MapLocation) => {
    const locationPath = buildLocationPath(areaName, regionName, locationName);
    const unlocked = isLocationUnlocked(locationPath, location, exploredLocations);

    if (!unlocked) {
      gameLogger.warn(`[LocationPopover] 地点未解锁: ${locationPath}`);
      return;
    }

    onLocationClick(locationPath);
    onClose();
  };

  // 检查地点是否是当前位置
  const isCurrentLoc = (locationName: string): boolean => {
    const locationPath = buildLocationPath(areaName, regionName, locationName);
    return currentLocation === locationPath || currentLocation.endsWith(locationName);
  };

  return (
    <div
      ref={popoverRef}
      className="location-popover"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y - 10}px`,
        transform: 'translate(-50%, -100%)'
      }}
    >
      <div className="popover-title">{regionName}</div>
      <div className="location-list">
        {Object.entries(region.地点).map(([locationName, location]: [string, MapLocation]) => {
          const locationPath = buildLocationPath(areaName, regionName, locationName);
          const unlocked = isLocationUnlocked(locationPath, location, exploredLocations);
          const isCurrent = isCurrentLoc(locationName);

          return (
            <div
              key={locationName}
              className={`location-item ${unlocked ? '' : 'locked'} ${isCurrent ? 'current' : ''}`}
              onClick={() => unlocked && handleLocationClick(locationName, location)}
            >
              <div className="location-name">
                {isCurrent && '📍 '}
                {locationName}
                {!unlocked && ' 🔒'}
              </div>
              <div className="location-desc">{location.描述}</div>
              {!unlocked && location.解锁条件 && (
                <div className="location-unlock-hint">需要：{location.解锁条件}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LocationPopover;
