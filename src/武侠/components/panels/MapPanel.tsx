/**
 * 地图面板组件
 * 集成地图画布、侧边栏和地点选择功能
 */

import React, { useState, useEffect } from 'react';
import MapCanvas from '../MapCanvas';
import MapSidebar from '../MapSidebar';
import { MapData } from '../../types';
import { loadMapData } from '../../utils/mapLoader';
import { getExploredLocations } from '../../utils/mapUtils';

interface MapPanelProps {
  currentLocation: string;
  onTravelCommand?: (locationPath: string) => void;
}

export const MapPanel: React.FC<MapPanelProps> = ({
  currentLocation,
  onTravelCommand
}) => {
  const [mapData, setMapData] = useState<MapData>({});
  const [exploredLocations, setExploredLocations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载地图数据
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const data = await loadMapData();
        setMapData(data);

        // 获取已探索地点
        const explored = getExploredLocations();
        setExploredLocations(explored);

        setIsLoading(false);
      } catch (err) {
        console.error('[MapPanel] 加载地图数据失败:', err);
        setError('加载地图数据失败');
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // 处理地点点击
  const handleLocationClick = (locationPath: string) => {
    console.log('[MapPanel] 点击地点:', locationPath);
    if (onTravelCommand) {
      onTravelCommand(locationPath);
    }
  };

  if (isLoading) {
    return (
      <div className="map-panel-loading">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="map-panel-error">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (Object.keys(mapData).length === 0) {
    return (
      <div className="map-panel-empty">
        <div className="empty-message">暂无地图数据</div>
      </div>
    );
  }

  return (
    <div className="map-container">
      {/* 侧边栏 */}
      <MapSidebar
        mapData={mapData}
        exploredLocations={exploredLocations}
        currentLocation={currentLocation}
        onLocationClick={handleLocationClick}
      />

      {/* 地图画布 */}
      <MapCanvas
        mapData={mapData}
        exploredLocations={exploredLocations}
        currentLocation={currentLocation}
        onLocationClick={handleLocationClick}
      />
    </div>
  );
};
