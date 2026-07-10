import React, { CSSProperties, useMemo, useState } from 'react';
import type { ActiveStatusEffect, CurrentAttributes, InventoryItem } from '../../types';
import { getRankVisual, resolveInventoryIcon } from '../../utils/iconCatalog';
import { buildItemAttributePreview } from '../../utils/inventoryAttributePreview';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';

type InventoryTypeFilter = 'ALL' | InventoryItem['type'];
type InventoryRankFilter = 'ALL' | 'WHITE' | 'GREEN' | 'BLUE' | 'PURPLE' | 'GOLD' | 'RED';

const TYPE_FILTERS: Array<{ key: InventoryTypeFilter; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'EQUIP', label: '兵甲' },
  { key: 'SECRET', label: '秘籍' },
  { key: 'ELIXIR', label: '丹药' },
  { key: 'MISC', label: '杂物' },
];

const RANK_FILTERS: Array<{ key: InventoryRankFilter; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'WHITE', label: '凡品' },
  { key: 'GREEN', label: '精品' },
  { key: 'BLUE', label: '珍品' },
  { key: 'PURPLE', label: '极品' },
  { key: 'GOLD', label: '绝品' },
  { key: 'RED', label: '神品' },
];

const getActionLabel = (type: InventoryItem['type']) => {
  switch (type) {
    case 'EQUIP':
      return '装备';
    case 'SECRET':
      return '参悟';
    case 'ELIXIR':
      return '吞服';
    case 'MISC':
      return '使用';
    default:
      return '使用';
  }
};

const getItemTypeLabel = (type: InventoryItem['type']) => {
  switch (type) {
    case 'EQUIP':
      return '兵甲';
    case 'SECRET':
      return '秘籍';
    case 'ELIXIR':
      return '丹药';
    case 'MISC':
      return '杂物';
    default:
      return '物品';
  }
};

const getItemDisplayDescription = (item: InventoryItem) => {
  if (item.type === 'SECRET' && item.martialArtInfo?.description) {
    return item.martialArtInfo.description;
  }
  return item.description || '此物来历尚未记入行囊。';
};

const getItemDisplayRankLabel = (item: InventoryItem) => {
  if (item.type === 'SECRET' && item.martialArtInfo?.rank) {
    return item.martialArtInfo.rank;
  }
  return getRankVisual(item.rank, item.type === 'SECRET' ? 'secret' : 'item').label;
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
  return `${attribute}${sign}${value}%`;
};

const formatPreviewLabel = (attribute: string, currentValue: number, nextValue: number, delta: number) => {
  const sign = delta >= 0 ? '+' : '';
  return `${attribute} ${currentValue} -> ${nextValue} (${sign}${delta})`;
};

interface InventoryPanelProps {
  items: InventoryItem[];
  baseAttributes?: CurrentAttributes;
  attributes?: CurrentAttributes;
  statusEffects?: ActiveStatusEffect[];
  onItemAction?: (item: InventoryItem) => void | Promise<void>;
}

export const InventoryPanel: React.FC<InventoryPanelProps> = ({
  items,
  baseAttributes,
  attributes,
  statusEffects = [],
  onItemAction,
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<InventoryTypeFilter>('ALL');
  const [rankFilter, setRankFilter] = useState<InventoryRankFilter>('ALL');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const filteredItems = useMemo(
    () =>
      items.filter(item => {
        const typeMatched = typeFilter === 'ALL' || item.type === typeFilter;
        const rankMatched = rankFilter === 'ALL' || item.rank === rankFilter;
        return typeMatched && rankMatched;
      }),
    [items, rankFilter, typeFilter],
  );

  const selectedItem = filteredItems.find(item => item.id === selectedItemId) ?? filteredItems[0] ?? null;
  const selectedItemIcon = selectedItem ? resolveInventoryIcon(selectedItem) : null;
  const selectedRank = selectedItem
    ? getRankVisual(selectedItem.rank, selectedItem.type === 'SECRET' ? 'secret' : 'item')
    : null;
  const selectedItemRequirementEntries = selectedItem ? getMartialArtRequirementEntries(selectedItem) : [];
  const selectedItemModifierEntries = selectedItem ? getItemModifierEntries(selectedItem) : [];
  const selectedEquipSlot = selectedItem?.type === 'EQUIP' ? selectedItem.equipInfo?.slot : undefined;
  const selectedEquipStatus = selectedItem?.type === 'EQUIP' ? selectedItem.equipInfo?.status : undefined;
  const selectedElixirDuration = selectedItem?.type === 'ELIXIR' ? selectedItem.elixirInfo?.duration : undefined;
  const selectedItemPreview =
    selectedItem && baseAttributes && attributes
      ? buildItemAttributePreview(selectedItem, items, statusEffects, baseAttributes, attributes)
      : [];
  const selectedActionDisabled =
    isActing ||
    !onItemAction ||
    !selectedItem ||
    (selectedItem.type !== 'EQUIP' && selectedItem.type !== 'ELIXIR');

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItemId(item.id);
    setIsDetailOpen(true);
  };

  const handleSelectedItemAction = async () => {
    if (!selectedItem || selectedActionDisabled) {
      return;
    }

    setIsActing(true);
    try {
      await onItemAction?.(selectedItem);
      setIsDetailOpen(false);
    } finally {
      setIsActing(false);
    }
  };

  if (items.length === 0) {
    return <EmptyState message="包袱空空如也。" variant="inventory" />;
  }

  return (
    <div className={`inventory-workbench ${isDetailOpen ? 'detail-open' : ''}`}>
      <section className="workbench-list-pane" aria-label="行囊列表">
        <div className="workbench-filter-block">
          <div className="workbench-filter-row" aria-label="物品类别筛选">
            {TYPE_FILTERS.map(filter => (
              <button
                key={filter.key}
                className={`workbench-filter-chip ${typeFilter === filter.key ? 'active' : ''}`}
                onClick={() => {
                  setTypeFilter(filter.key);
                  setIsDetailOpen(false);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="workbench-filter-row" aria-label="物品品阶筛选">
            {RANK_FILTERS.map(filter => (
              <button
                key={filter.key}
                className={`workbench-filter-chip compact ${rankFilter === filter.key ? 'active' : ''}`}
                onClick={() => {
                  setRankFilter(filter.key);
                  setIsDetailOpen(false);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {filteredItems.length > 0 ? (
          <div className="workbench-list" role="list">
            {filteredItems.map(item => {
              const icon = resolveInventoryIcon(item);
              const rank = getRankVisual(item.rank, item.type === 'SECRET' ? 'secret' : 'item');
              const isSelected = selectedItem?.id === item.id;
              const itemStyle = {
                '--item-color': rank.color,
                '--item-glow': rank.glow,
              } as CSSProperties;

              return (
                <button
                  key={item.id}
                  className={`workbench-list-item ${isSelected ? 'selected' : ''}`}
                  style={itemStyle}
                  onClick={() => handleSelectItem(item)}
                  aria-label={`查看${item.name}`}
                >
                  <span className="workbench-item-icon">
                    <img src={icon.src} alt="" />
                  </span>
                  <span className="workbench-item-copy">
                    <span className="workbench-item-name">{item.name}</span>
                    <span className="workbench-item-meta">
                      {getItemTypeLabel(item.type)} · {item.type === 'SECRET' && item.martialArtInfo?.rank ? item.martialArtInfo.rank : rank.label}
                    </span>
                  </span>
                  <span className="workbench-item-side">
                    <span className="workbench-rank-seal">{rank.shortLabel}</span>
                    <span className="workbench-item-count">x{item.count}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="workbench-empty">当前筛选下没有物品。</div>
        )}
      </section>

      <section className="workbench-detail-pane" aria-label="物品详情">
        <button className="workbench-mobile-back" onClick={() => setIsDetailOpen(false)} aria-label="返回行囊列表">
          <Icons.ArrowLeft size={16} />
          <span>行囊</span>
        </button>

        {selectedItem && selectedItemIcon && selectedRank ? (
          <div
            className="workbench-detail-card"
            style={
              {
                '--item-color': selectedRank.color,
                '--item-glow': selectedRank.glow,
              } as CSSProperties
            }
          >
            <header className="workbench-detail-hero">
              <div className="workbench-detail-icon">
                <img src={selectedItemIcon.src} alt={`${selectedItem.name}图标`} />
              </div>
              <div className="workbench-detail-title-group">
                <div className="workbench-detail-kicker">{getItemTypeLabel(selectedItem.type)}</div>
                <h3 className="workbench-detail-title">{selectedItem.name}</h3>
                <div className="workbench-detail-badges">
                  <span>{getItemDisplayRankLabel(selectedItem)}</span>
                  <span>数量 {selectedItem.count}</span>
                  {selectedEquipStatus && <span>{selectedEquipStatus}</span>}
                </div>
              </div>
            </header>

            <div className="workbench-detail-content">
              <p className="workbench-detail-desc">{getItemDisplayDescription(selectedItem)}</p>

              {selectedItemRequirementEntries.length > 0 && (
                <DetailSection title="参悟条件">
                  {selectedItemRequirementEntries.map(([attribute, value]) => (
                    <span key={attribute} className="workbench-chip">
                      {attribute} &gt;= {value}
                    </span>
                  ))}
                </DetailSection>
              )}

              {selectedItem.type === 'EQUIP' && (selectedEquipSlot || selectedEquipStatus || selectedItemModifierEntries.length > 0) && (
                <DetailSection title="装备信息">
                  {selectedEquipSlot && <span className="workbench-chip">部位：{selectedEquipSlot}</span>}
                  {selectedEquipStatus && <span className="workbench-chip">状态：{selectedEquipStatus}</span>}
                  {selectedItemModifierEntries.map(([attribute, value]) => (
                    <span key={attribute} className="workbench-chip">
                      {formatModifierLabel(attribute, value)}
                    </span>
                  ))}
                </DetailSection>
              )}

              {selectedItem.type === 'ELIXIR' && (selectedElixirDuration || selectedItemModifierEntries.length > 0) && (
                <DetailSection title="药效信息">
                  {selectedElixirDuration && <span className="workbench-chip">持续时间：{selectedElixirDuration}</span>}
                  {selectedItemModifierEntries.map(([attribute, value]) => (
                    <span key={attribute} className="workbench-chip">
                      {formatModifierLabel(attribute, value)}
                    </span>
                  ))}
                </DetailSection>
              )}

              {selectedItemPreview.length > 0 && (
                <DetailSection title={selectedItem.type === 'EQUIP' ? '装备后属性' : '服用后属性'}>
                  {selectedItemPreview.map(({ attribute, currentValue, nextValue, delta }) => (
                    <span key={attribute} className="workbench-chip">
                      {formatPreviewLabel(attribute, currentValue, nextValue, delta)}
                    </span>
                  ))}
                </DetailSection>
              )}
            </div>

            <footer className="workbench-detail-actions">
              <button
                className="wuxia-btn primary"
                disabled={selectedActionDisabled}
                onClick={handleSelectedItemAction}
                style={{ color: selectedRank.color, borderColor: `${selectedRank.color}60` }}
              >
                {isActing ? '处理中' : getActionLabel(selectedItem.type)}
              </button>
            </footer>
          </div>
        ) : (
          <div className="workbench-detail-placeholder">从左侧选择一件物品。</div>
        )}
      </section>
    </div>
  );
};

const DetailSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="workbench-detail-section">
    <h4>{title}</h4>
    <div className="workbench-chip-list">{children}</div>
  </section>
);
