import React, { useState } from 'react';
import { InventoryItem } from '../../types';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';

/* --- Private Helper Types and Functions --- */
type RankKey = 'WHITE' | 'GREEN' | 'BLUE' | 'PURPLE' | 'GOLD' | 'RED';

interface RankInfo {
    color: string;
    labelGeneric: string;
    labelSecret: string;
}

const RANK_CONFIG: Record<string, RankInfo> = {
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

const getItemRankInfo = (item: InventoryItem) => {
    const config = RANK_CONFIG[item.rank] || RANK_CONFIG['WHITE'];
    const label = item.type === 'SECRET' ? config.labelSecret : config.labelGeneric;
    return { ...config, label };
};

const getItemDisplayDescription = (item: InventoryItem) => {
    if (item.type === 'SECRET' && item.martialArtInfo?.description) {
        return item.martialArtInfo.description;
    }
    return item.description;
};

const getItemDisplayRankLabel = (item: InventoryItem) => {
    if (item.type === 'SECRET' && item.martialArtInfo?.rank) {
        return item.martialArtInfo.rank;
    }
    return getItemRankInfo(item).label;
};

const getMartialArtRequirementEntries = (item: InventoryItem) => {
    if (item.type !== 'SECRET' || !item.martialArtInfo?.requirements) {
        return [];
    }
    return Object.entries(item.martialArtInfo.requirements).filter(([, value]) => typeof value === 'number');
};

const getAttributeModifierEntries = (modifiers?: Record<string, number>) => {
    if (!modifiers) {
        return [];
    }
    return Object.entries(modifiers).filter(([, value]) => typeof value === 'number');
};

const getItemModifierEntries = (item: InventoryItem) => {
    if (item.type === 'EQUIP') {
        return getAttributeModifierEntries(item.equipInfo?.modifiers);
    }
    if (item.type === 'ELIXIR') {
        return getAttributeModifierEntries(item.elixirInfo?.modifiers);
    }
    return [];
};

const formatModifierLabel = (attribute: string, value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${attribute}${sign}${value}`;
};

// Suppress unused type warning
void (undefined as unknown as RankKey);

/* --- Inventory Panel --- */
interface InventoryPanelProps {
    items: InventoryItem[];
}

export const InventoryPanel: React.FC<InventoryPanelProps> = ({ items }) => {
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const selectedItemRequirementEntries = selectedItem ? getMartialArtRequirementEntries(selectedItem) : [];
    const selectedItemModifierEntries = selectedItem ? getItemModifierEntries(selectedItem) : [];
    const selectedEquipSlot = selectedItem?.type === 'EQUIP' ? selectedItem.equipInfo?.slot : undefined;
    const selectedEquipStatus = selectedItem?.type === 'EQUIP' ? selectedItem.equipInfo?.status : undefined;
    const selectedElixirDuration = selectedItem?.type === 'ELIXIR' ? selectedItem.elixirInfo?.duration : undefined;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {items.length > 0 ? (
                <div className="inv-grid-container">
                    {items.map((item) => {
                         const rankInfo = getItemRankInfo(item);
                         return (
                            <div
                                key={item.id}
                                className="inv-square-box"
                                style={{
                                    '--item-color': rankInfo.color
                                } as React.CSSProperties}
                                onClick={() => setSelectedItem(item)}
                            >
                                <div className="inv-square-inner">
                                    {item.type === 'SECRET' && <Icons.Quest size={42} color={rankInfo.color} />}
                                    {item.type === 'EQUIP' && <Icons.Combat size={42} color={rankInfo.color} />}
                                    {item.type === 'ELIXIR' && <Icons.Magic size={42} color={rankInfo.color} />}
                                    {item.type === 'MISC' && <Icons.Inventory size={42} color={rankInfo.color} />}
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
                    <div className="inv-window-frame" onClick={e => e.stopPropagation()} style={{ borderColor: `${getItemRankInfo(selectedItem).color}80` }}>

                         {/* Window Header */}
                         <div className="inv-win-header">
                            <h3 className="inv-win-title" style={{ color: getItemRankInfo(selectedItem).color }}>
                                {selectedItem.name}
                            </h3>
                            <div className="inv-win-badges">
                                <span className="inv-win-badge">
                                    {getItemTypeLabel(selectedItem.type)}
                                </span>
                                <span className="inv-win-badge" style={{ color: getItemRankInfo(selectedItem).color, borderColor: `${getItemRankInfo(selectedItem).color}40` }}>
                                    {getItemDisplayRankLabel(selectedItem)}
                                </span>
                            </div>
                         </div>

                         {/* Window Content */}
                         <div className="inv-win-content">
                            <div className="inv-win-desc">
                                {getItemDisplayDescription(selectedItem)}
                            </div>
                            {selectedItemRequirementEntries.length > 0 && (
                                <div className="inv-win-requirements">
                                    <div className="inv-win-requirements-title">参悟条件</div>
                                    <div className="inv-win-requirements-list">
                                        {selectedItemRequirementEntries.map(([attribute, value]) => (
                                            <span key={attribute} className="inv-win-requirement-chip">
                                                {attribute}{'>='}{value}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedItem.type === 'EQUIP' && (selectedEquipSlot || selectedEquipStatus || selectedItemModifierEntries.length > 0) && (
                                <div className="inv-win-requirements">
                                    <div className="inv-win-requirements-title">装备信息</div>
                                    <div className="inv-win-requirements-list">
                                        {selectedEquipSlot && (
                                            <span className="inv-win-requirement-chip">
                                                部位：{selectedEquipSlot}
                                            </span>
                                        )}
                                        {selectedEquipStatus && (
                                            <span className="inv-win-requirement-chip">
                                                状态：{selectedEquipStatus}
                                            </span>
                                        )}
                                        {selectedItemModifierEntries.map(([attribute, value]) => (
                                            <span key={attribute} className="inv-win-requirement-chip">
                                                {formatModifierLabel(attribute, value)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedItem.type === 'ELIXIR' && (selectedElixirDuration || selectedItemModifierEntries.length > 0) && (
                                <div className="inv-win-requirements">
                                    <div className="inv-win-requirements-title">药效信息</div>
                                    <div className="inv-win-requirements-list">
                                        {selectedElixirDuration && (
                                            <span className="inv-win-requirement-chip">
                                                持续时间：{selectedElixirDuration}
                                            </span>
                                        )}
                                        {selectedItemModifierEntries.map(([attribute, value]) => (
                                            <span key={attribute} className="inv-win-requirement-chip">
                                                {formatModifierLabel(attribute, value)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                         </div>

                         {/* Window Footer (Buttons) */}
                         <div className="inv-win-footer">
                            <button className="wuxia-btn primary" style={{ color: getItemRankInfo(selectedItem).color, borderColor: `${getItemRankInfo(selectedItem).color}60` }}>
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
