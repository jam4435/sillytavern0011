import { LockKeyhole, MapPin, Navigation, X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { MapLocation, MapRegion } from '../types';
import { buildLocationPath, isLocationUnlocked } from '../utils/mapUtils';
import { gameLogger } from '../utils/logger';

interface LocationPopoverProps {
  areaName: string;
  regionName: string;
  region: MapRegion;
  exploredLocations: string[];
  currentLocation: string;
  plannedLocations: string[];
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
  plannedLocations,
  position,
  onLocationClick,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleLocationClick = (locationName: string, location: MapLocation) => {
    const locationPath = buildLocationPath(areaName, regionName, locationName);
    if (!isLocationUnlocked(locationPath, location, exploredLocations)) {
      gameLogger.warn(`[LocationPopover] 地点未解锁: ${locationPath}`);
      return;
    }

    onLocationClick(locationPath);
    onClose();
  };

  const isCurrentLocation = (locationName: string): boolean => {
    const path = buildLocationPath(areaName, regionName, locationName);
    return currentLocation === path || currentLocation.endsWith(locationName);
  };

  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const safeX = Math.max(170, Math.min(viewportWidth - 170, position.x));
  const placeBelow = position.y < 330;

  return (
    <div
      ref={popoverRef}
      className={`location-popover ${placeBelow ? 'below-marker' : 'above-marker'}`}
      style={{
        left: `${safeX}px`,
        top: `${position.y + (placeBelow ? 18 : -12)}px`,
        transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      role="dialog"
      aria-label={`${regionName}地点`}
    >
      <div className="popover-header">
        <div>
          <span className="popover-area">{areaName}</span>
          <div className="popover-title">{regionName}</div>
        </div>
        <button type="button" className="popover-close" onClick={onClose} aria-label="关闭地点列表" title="关闭">
          <X size={16} />
        </button>
      </div>

      <div className="location-list">
        {Object.entries(region.地点).map(([locationName, location]: [string, MapLocation]) => {
          const locationPath = buildLocationPath(areaName, regionName, locationName);
          const unlocked = isLocationUnlocked(locationPath, location, exploredLocations);
          const current = isCurrentLocation(locationName);
          const plannedIndex = plannedLocations.indexOf(locationPath);

          return (
            <button
              type="button"
              key={locationName}
              className={`location-item ${unlocked ? '' : 'locked'} ${current ? 'current' : ''} ${plannedIndex >= 0 ? 'planned' : ''}`}
              onClick={() => handleLocationClick(locationName, location)}
              disabled={!unlocked || current}
            >
              <span className="location-state" aria-hidden="true">
                {!unlocked ? <LockKeyhole size={15} /> : current ? <MapPin size={16} /> : <Navigation size={15} />}
              </span>
              <span className="location-copy">
                <span className="location-name">{locationName}</span>
                <span className="location-desc">
                  {current ? '当前位置' : plannedIndex >= 0 ? `行程第 ${plannedIndex + 1} 站` : location.描述}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LocationPopover;
