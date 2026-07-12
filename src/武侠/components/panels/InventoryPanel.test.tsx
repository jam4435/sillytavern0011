import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentAttributes, InventoryItem } from '../../types';
import { InventoryPanel } from './InventoryPanel';

const baseAttributes: CurrentAttributes = {
  hp: 100,
  mp: 80,
  臂力: 10,
  根骨: 10,
  机敏: 10,
  洞察: 10,
};

const items: InventoryItem[] = [
  {
    id: 'item_1',
    name: '玄铁剑',
    type: 'EQUIP',
    rank: 'BLUE',
    count: 1,
    description: '沉重无锋的奇剑。',
    equipInfo: {
      slot: '兵器',
      modifiers: { 臂力: 10 },
    },
  },
  {
    id: 'item_2',
    name: '大还丹',
    type: 'ELIXIR',
    rank: 'GOLD',
    count: 2,
    description: '少林疗伤圣药。',
    elixirInfo: {
      effectType: '回复',
      rank: '绝品',
      modifiers: { 气血: 20 },
    },
  },
  {
    id: 'item_3',
    name: '九阳神功',
    type: 'SECRET',
    rank: 'RED',
    count: 1,
    description: '秘籍。',
    martialArtInfo: {
      description: '至阳至刚的绝世内功。',
      rank: '绝世',
      requirements: { 悟性: 12 },
    },
  },
];

describe('InventoryPanel', () => {
  it('可按类别和品阶筛选物品', () => {
    render(<InventoryPanel items={items} />);

    fireEvent.click(screen.getByRole('button', { name: '药品' }));
    expect(screen.getByRole('button', { name: '查看大还丹' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看玄铁剑' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '全部' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '绝品' }));
    expect(screen.getByRole('button', { name: '查看大还丹' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看九阳神功' })).not.toBeInTheDocument();
  });

  it('点击条目显示详情和资源图标', () => {
    render(<InventoryPanel items={items} />);

    fireEvent.click(screen.getByRole('button', { name: '查看九阳神功' }));

    expect(screen.getByRole('heading', { name: '九阳神功' })).toBeInTheDocument();
    expect(screen.getByAltText('九阳神功图标')).toBeInTheDocument();
    expect(screen.getByText('悟性 >= 12')).toBeInTheDocument();
  });

  it('列表和详情显示按外观推断的细分类', () => {
    render(<InventoryPanel items={items} />);

    expect(screen.getByText('剑 · 珍品')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看大还丹' }));
    expect(screen.getByText('药品 · 丹药')).toBeInTheDocument();
    expect(screen.getAllByText('丹药').length).toBeGreaterThan(0);
  });

  it('装备和药品动作仍调用 onItemAction', async () => {
    const onItemAction = vi.fn();
    render(
      <InventoryPanel
        items={items}
        baseAttributes={baseAttributes}
        attributes={baseAttributes}
        onItemAction={onItemAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '装备' }));

    await waitFor(() => {
      expect(onItemAction).toHaveBeenCalledWith(expect.objectContaining({ name: '玄铁剑' }));
    });
  });

  it('空包裹仍显示空状态', () => {
    render(<InventoryPanel items={[]} />);

    expect(screen.getByText('包袱空空如也。')).toBeInTheDocument();
  });
});
