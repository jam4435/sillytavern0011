import React, { useState } from 'react';
import { InventoryItem } from '../../types';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';

/* --- Private Helper Types and Functions --- */
type QualityKey = 'WHITE' | 'GREEN' | 'BLUE' | 'PURPLE' | 'GOLD' | 'RED';

interface QualityInfo {
    color: string;
    labelGeneric: string;
    labelSecret: string;
}

const QUALITY_CONFIG: Record<string, QualityInfo> = {
  WHITE: { color: '#a8a29e', labelGeneric: '凡品', labelSecret: '粗浅' },
  GREEN: { color: '#4ade80', labelGeneric: '精品', labelSecret: '传家' },
  BLUE:  { color: '#60a5fa', labelGeneric: '珍品', labelSecret: '上乘' },
  PURPLE:{ color: '#c084fc', labelGeneric: '极品', labelSecret: '镇派' },
  GOLD:  { color: '#fbbf24', labelGeneric: '绝品', labelSecret: '绝世' },
  RED:   { color: '#f87171', labelGeneric: '神品', labelSecret: '传说' },
};

const getActionLabel = (type: InventoryItem['type']) => {
    switch(type) {
        case 'EQUIP': return '装备';
        case 'SECRET': return '参悟';
        case 'ELIXIR': return '吞服';
        case 'MISC': return '使用';
        default: return '使用';
    }
};

const getItemTypeLabel = (type: InventoryItem['type']) => {
    switch(type) {
        case 'EQUIP': return '兵甲';
        case 'SECRET': return '秘籍';
        case 'ELIXIR': return '丹药';
        case 'MISC': return '杂物';
        default: return '物品';
    }
};

const getItemQualityInfo = (item: InventoryItem) => {
    const config = QUALITY_CONFIG[item.quality] || QUALITY_CONFIG['WHITE'];
    const label = item.type === 'SECRET' ? config.labelSecret : config.labelGeneric;
    return { ...config, label };
};

// Suppress unused type warning
void (undefined as unknown as QualityKey);

/* --- Inventory Panel --- */
interface InventoryPanelProps {
    items: InventoryItem[];
}

export const InventoryPanel: React.FC<InventoryPanelProps> = ({ items }) => {
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {items.length > 0 ? (
                <div className="inv-grid-container">
                    {items.map((item) => {
                         const qInfo = getItemQualityInfo(item);
                         return (
                            <div
                                key={item.id}
                                className="inv-square-box"
                                style={{
                                    '--item-color': qInfo.color
                                } as React.CSSProperties}
                                onClick={() => setSelectedItem(item)}
                            >
                                <div className="inv-square-inner">
                                    {item.type === 'SECRET' && <Icons.Quest size={42} color={qInfo.color} />}
                                    {item.type === 'EQUIP' && <Icons.Combat size={42} color={qInfo.color} />}
                                    {item.type === 'ELIXIR' && <Icons.Magic size={42} color={qInfo.color} />}
                                    {item.type === 'MISC' && <Icons.Inventory size={42} color={qInfo.color} />}
                                </div>
                                <div className="inv-square-count">{item.count}</div>
                                <div className="inv-square-name">{item.name}</div>
                            </div>
                         );
                    })}
                </div>
            ) : (
                 <EmptyState message="包袱空空如也。" />
            )}

            {/* Item Detail Window */}
            {selectedItem && (
                <div className="inv-window-overlay" onClick={() => setSelectedItem(null)}>
                    <div className="inv-window-frame" onClick={e => e.stopPropagation()} style={{ borderColor: `${getItemQualityInfo(selectedItem).color}80` }}>

                         {/* Window Header */}
                         <div className="inv-win-header">
                            <h3 className="inv-win-title" style={{ color: getItemQualityInfo(selectedItem).color }}>
                                {selectedItem.name}
                            </h3>
                            <div className="inv-win-badges">
                                <span className="inv-win-badge">
                                    {getItemTypeLabel(selectedItem.type)}
                                </span>
                                <span className="inv-win-badge" style={{ color: getItemQualityInfo(selectedItem).color, borderColor: `${getItemQualityInfo(selectedItem).color}40` }}>
                                    {getItemQualityInfo(selectedItem).label}
                                </span>
                            </div>
                         </div>

                         {/* Window Content */}
                         <div className="inv-win-content">
                            <div className="inv-win-desc">
                                {selectedItem.description}
                            </div>
                         </div>

                         {/* Window Footer (Buttons) */}
                         <div className="inv-win-footer">
                            <button className="wuxia-btn primary" style={{ color: getItemQualityInfo(selectedItem).color, borderColor: `${getItemQualityInfo(selectedItem).color}60` }}>
                                {getActionLabel(selectedItem.type)}
                            </button>
                            <button className="wuxia-btn secondary">
                                丢弃
                            </button>
                         </div>

                         <button className="inv-win-close" onClick={() => setSelectedItem(null)}>
                            <Icons.Close size={20} />
                         </button>
                    </div>
                </div>
            )}
        </div>
    );
};
