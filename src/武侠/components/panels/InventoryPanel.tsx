import React, { CSSProperties, useMemo, useState } from 'react';
import type { ActiveStatusEffect, CurrentAttributes, InitialAttributes, InventoryItem, MartialArt } from '../../types';
import { getRankVisual, resolveInventoryIcon } from '../../utils/iconCatalog';
import { buildItemAttributePreview } from '../../utils/inventoryAttributePreview';
import { quoteMartialArtStudyEligibility } from '../../utils/martialArtStudyEligibility';
import { Icons } from '../Icons';
import { EmptyState } from './EmptyState';

type InventoryTypeFilter = 'ALL' | InventoryItem['type'];

const TYPE_FILTERS: Array<{ key: InventoryTypeFilter; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'EQUIP', label: '兵甲' },
  { key: 'SECRET', label: '秘籍' },
  { key: 'ELIXIR', label: '药品' },
  { key: 'MISC', label: '杂物' },
];

const getActionLabel = (type: InventoryItem['type']) => {
  switch (type) {
    case 'EQUIP':
      return '装备';
    case 'SECRET':
      return '参悟';
    case 'ELIXIR':
      return '服用';
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
      return '药品';
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

const getSecretMartialArtInfos = (item: InventoryItem) => {
  if (item.type !== 'SECRET') return [];
  if (item.martialArtInfos && item.martialArtInfos.length > 0) return item.martialArtInfos;
  if (!item.martialArtInfo) return [];
  return [{ name: item.name, ...item.martialArtInfo }];
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
  initialAttributes?: InitialAttributes;
  traits?: Record<string, string>;
  knownMartialArts?: Record<string, MartialArt>;
  onItemAction?: (item: InventoryItem, martialArtName?: string) => void | Promise<void>;
}

export const InventoryPanel: React.FC<InventoryPanelProps> = ({
  items,
  baseAttributes,
  attributes,
  statusEffects = [],
  initialAttributes,
  traits,
  knownMartialArts,
  onItemAction,
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<InventoryTypeFilter>('ALL');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const shouldShowFilters = items.length > 10;
  const filteredItems = useMemo(
    () => items.filter(item => !shouldShowFilters || typeFilter === 'ALL' || item.type === typeFilter),
    [items, shouldShowFilters, typeFilter],
  );

  const selectedItem = filteredItems.find(item => item.id === selectedItemId) ?? filteredItems[0] ?? null;
  const selectedItemIcon = selectedItem ? resolveInventoryIcon(selectedItem) : null;
  const selectedRank = selectedItem
    ? getRankVisual(selectedItem.rank, selectedItem.type === 'SECRET' ? 'secret' : 'item')
    : null;
  const selectedItemModifierEntries = selectedItem ? getItemModifierEntries(selectedItem) : [];
  const selectedEquipSlot = selectedItem?.type === 'EQUIP' ? selectedItem.equipInfo?.slot : undefined;
  const selectedEquipStatus = selectedItem?.type === 'EQUIP' ? selectedItem.equipInfo?.status : undefined;
  const selectedElixirEffectType = selectedItem?.type === 'ELIXIR' ? selectedItem.elixirInfo?.effectType : undefined;
  const selectedElixirDuration = selectedItem?.type === 'ELIXIR' ? selectedItem.elixirInfo?.duration : undefined;
  const selectedItemPreview =
    selectedItem && baseAttributes && attributes
      ? buildItemAttributePreview(selectedItem, items, statusEffects, baseAttributes, attributes)
      : [];
  const selectedSecretInfos = selectedItem ? getSecretMartialArtInfos(selectedItem) : [];
  const selectedSecretEntries =
    selectedItem?.type === 'SECRET'
      ? selectedSecretInfos.map(art => ({
          art,
          eligibility: quoteMartialArtStudyEligibility({
            item: { ...selectedItem, name: art.name, martialArtInfo: { description: art.description, rank: art.rank, requirements: art.requirements } },
            initialAttributes,
            traits,
            knownMartialArts,
          }),
        }))
      : [];
  const selectedActionDisabled =
    isActing ||
    !onItemAction ||
    !selectedItem ||
    !['EQUIP', 'ELIXIR', 'SECRET'].includes(selectedItem.type) ||
    (selectedItem.type === 'SECRET' && selectedSecretEntries.length > 0);

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

  const handleSecretArtAction = async (artName: string, canStudy: boolean) => {
    if (!selectedItem || selectedItem.type !== 'SECRET' || !onItemAction || isActing || !canStudy) return;
    setIsActing(true);
    try {
      if (selectedSecretEntries.length === 1) await onItemAction(selectedItem);
      else await onItemAction(selectedItem, artName);
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
        {shouldShowFilters && (
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
          </div>
        )}

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
                      {icon.category || getItemTypeLabel(item.type)} ·{' '}
                      {item.type === 'SECRET' && item.martialArtInfo?.rank ? item.martialArtInfo.rank : rank.label}
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
                  {selectedItemIcon.category && <span>{selectedItemIcon.category}</span>}
                  <span>{getItemDisplayRankLabel(selectedItem)}</span>
                  <span>数量 {selectedItem.count}</span>
                  {selectedEquipStatus && <span>{selectedEquipStatus}</span>}
                </div>
              </div>
            </header>

            <div className="workbench-detail-content">
              <p className="workbench-detail-desc">{getItemDisplayDescription(selectedItem)}</p>

              {selectedItem.type === 'SECRET' &&
                (selectedSecretEntries.length > 0 ? (
                  <DetailSection title="秘籍所载武学">
                    <div className="workbench-secret-art-list">
                      {selectedSecretEntries.map(({ art, eligibility }) => {
                        const artRank = getRankVisual(art.rank, 'secret');
                        return (
                          <div key={art.name} className="workbench-secret-art">
                            <div className="workbench-secret-art-head">
                              <strong style={{ color: artRank.color }}>{art.name}</strong>
                              <span className="workbench-chip">{art.rank}</span>
                            </div>
                            {art.description && <p className="workbench-secret-art-desc">{art.description}</p>}
                            <div className="workbench-chip-list">
                              {eligibility.requirementStatuses.length > 0 ? (
                                eligibility.requirementStatuses.map(status => (
                                  <span key={status.attribute} className="workbench-chip">
                                    {status.attribute} {status.current} / {status.required}
                                    {status.met ? '（已满足）' : `（尚缺 ${status.deficit}）`}
                                  </span>
                                ))
                              ) : (
                                <span className="workbench-chip">无属性门槛</span>
                              )}
                              {eligibility.canStudy ? (
                                <span className="workbench-chip">条件已满足</span>
                              ) : (
                                eligibility.reasons.map(reason => <span key={reason} className="workbench-chip">{reason}</span>)
                              )}
                            </div>
                            <button
                              className="wuxia-btn primary workbench-secret-art-action"
                              aria-label={eligibility.alreadyLearned ? `已习得${art.name}` : eligibility.canStudy ? `参悟${art.name}` : `${art.name}条件未满足`}
                              disabled={isActing || !onItemAction || !eligibility.canStudy}
                              onClick={() => handleSecretArtAction(art.name, eligibility.canStudy)}
                              title={eligibility.alreadyLearned ? `已习得《${art.name}》，无需重复参悟` : eligibility.canStudy ? `参悟《${art.name}》` : eligibility.reasons.join('；')}
                              style={{ color: artRank.color, borderColor: `${artRank.color}60` }}
                            >
                              {isActing ? '处理中' : eligibility.alreadyLearned ? '已习得' : eligibility.canStudy ? '参悟' : '条件未满足'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </DetailSection>
                ) : (
                  <DetailSection title="参悟方式">
                    <span className="workbench-chip">此秘籍未收录于功法谱，将作为剧情行动参悟；是否习得由本轮正文实际结果决定。</span>
                  </DetailSection>
                ))}

              {selectedItem.type === 'EQUIP' &&
                (selectedEquipSlot || selectedEquipStatus || selectedItemModifierEntries.length > 0) && (
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

              {selectedItem.type === 'ELIXIR' &&
                (selectedElixirEffectType || selectedElixirDuration || selectedItemModifierEntries.length > 0) && (
                  <DetailSection title="药品信息">
                    {selectedElixirEffectType && (
                      <span className="workbench-chip">功效：{selectedElixirEffectType}</span>
                    )}
                    {selectedElixirDuration && (
                      <span className="workbench-chip">持续时间：{selectedElixirDuration}时</span>
                    )}
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

            {(selectedItem.type !== 'SECRET' || selectedSecretEntries.length === 0) && (
              <footer className="workbench-detail-actions">
                <button
                  className="wuxia-btn primary"
                  disabled={selectedActionDisabled}
                  onClick={handleSelectedItemAction}
                  title={selectedItem.type === 'SECRET' ? '此秘籍未收录于功法谱，点击后作为正常剧情行为参悟' : undefined}
                  style={{ color: selectedRank.color, borderColor: `${selectedRank.color}60` }}
                >
                  {isActing ? '处理中' : getActionLabel(selectedItem.type)}
                </button>
              </footer>
            )}
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
