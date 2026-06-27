/**
 * 地图面板组件
 * 集成地图画布、侧边栏和地点选择功能
 */

import { ListTree, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import MapCanvas from '../MapCanvas';
import MapSidebar from '../MapSidebar';
import { MapData } from '../../types';
import { loadMapData } from '../../utils/mapLoader';
import { getExploredLocations } from '../../utils/mapUtils';
import { gameLogger } from '../../utils/logger';

interface MapPanelProps {
  currentLocation: string;
  plannedLocations?: string[];
  onDestinationSelect?: (locationPath: string) => void;
}

export const MapPanel: React.FC<MapPanelProps> = ({ currentLocation, plannedLocations = [], onDestinationSelect }) => {
  const [mapData, setMapData] = useState<MapData>({});
  const [exploredLocations, setExploredLocations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIndexOpen, setIsIndexOpen] = useState(false);

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
        gameLogger.error('[MapPanel] 加载地图数据失败:', err);
        setError('加载地图数据失败');
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // 处理地点点击
  const handleLocationClick = (locationPath: string) => {
    gameLogger.log('[MapPanel] 点击地点:', locationPath);
    setIsIndexOpen(false);
    if (onDestinationSelect) {
      onDestinationSelect(locationPath);
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

  const regionCount = Object.values(mapData).reduce((count, area) => count + Object.keys(area.子区域).length, 0);

  return (
    <div className={`map-container ${isIndexOpen ? 'index-open' : ''}`}>
      <button
        type="button"
        className="map-sidebar-scrim"
        onClick={() => setIsIndexOpen(false)}
        aria-label="关闭地点索引"
      />

      <aside id="map-location-index" className="map-sidebar-shell" aria-label="地点索引">
        <div className="map-mobile-index-header">
          <div>
            <strong>地点索引</strong>
            <span>
              {Object.keys(mapData).length} 大区 · {regionCount} 地域
            </span>
          </div>
          <button type="button" onClick={() => setIsIndexOpen(false)} aria-label="关闭地点索引" title="关闭">
            <X size={18} />
          </button>
        </div>

        <MapSidebar
          mapData={mapData}
          exploredLocations={exploredLocations}
          currentLocation={currentLocation}
          onLocationClick={handleLocationClick}
        />
      </aside>

      <MapCanvas
        mapData={mapData}
        exploredLocations={exploredLocations}
        currentLocation={currentLocation}
        plannedLocations={plannedLocations}
        onLocationClick={handleLocationClick}
      />

      <button
        type="button"
        className="map-index-toggle"
        onClick={() => setIsIndexOpen(open => !open)}
        aria-expanded={isIndexOpen}
        aria-controls="map-location-index"
      >
        <ListTree size={17} />
        <span>地点</span>
      </button>
    </div>
  );
};
