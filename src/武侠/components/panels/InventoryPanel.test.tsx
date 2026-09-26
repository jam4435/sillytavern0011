import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentAttributes, InitialAttributes, InventoryItem, MartialArt } from '../../types';
import { InventoryPanel } from './InventoryPanel';

const baseAttributes: CurrentAttributes = {
  hp: 100,
  mp: 80,
  臂力: 10,
  根骨: 10,
  机敏: 10,
  洞察: 10,
};

const initialAttributes: InitialAttributes = {
  臂力: 10,
  根骨: 10,
  机敏: 10,
  悟性: 10,
  洞察: 10,
  风姿: 10,
  福缘: 10,
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
  it('10件及以下隐藏筛选，超过10件只显示类型筛选', () => {
    const { rerender } = render(<InventoryPanel items={items} />);

    expect(screen.queryByLabelText('物品类别筛选')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('物品品阶筛选')).not.toBeInTheDocument();

    const manyItems: InventoryItem[] = Array.from({ length: 11 }, (_, index) => ({
      ...items[index % items.length],
      id: `item_many_${index + 1}`,
      name: `测试物品${index + 1}`,
      type: index === 10 ? 'ELIXIR' : 'EQUIP',
    }));

    rerender(<InventoryPanel items={manyItems} />);

    expect(screen.getByLabelText('物品类别筛选')).toBeInTheDocument();
    expect(screen.queryByLabelText('物品品阶筛选')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '药品' }));
    expect(screen.getByRole('button', { name: '查看测试物品11' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看测试物品1' })).not.toBeInTheDocument();
  });

  it('点击秘籍显示当前属性、要求值和明确缺口', () => {
    render(<InventoryPanel items={items} initialAttributes={initialAttributes} />);

    fireEvent.click(screen.getByRole('button', { name: '查看九阳神功' }));

    expect(screen.getByRole('heading', { name: '九阳神功' })).toBeInTheDocument();
    expect(screen.getByAltText('九阳神功图标')).toBeInTheDocument();
    expect(screen.getByText('悟性 10 / 12（尚缺 2）')).toBeInTheDocument();
    expect(screen.getByText('悟性不足：当前 10，需要 12，尚缺 2。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '条件未满足' })).toBeDisabled();
  });

  it('条件满足时参悟按钮可执行真实 item action', async () => {
    const onItemAction = vi.fn(async () => undefined);
    render(
      <InventoryPanel
        items={items}
        initialAttributes={{ ...initialAttributes, 悟性: 15 }}
        onItemAction={onItemAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看九阳神功' }));
    expect(screen.getByText('条件已满足')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '参悟' }));
    await waitFor(() => {
      expect(onItemAction).toHaveBeenCalledWith(expect.objectContaining({ name: '九阳神功', type: 'SECRET' }));
    });
  });

  it('已经习得秘籍时明确显示无需重复参悟', () => {
    const knownMartialArts: Record<string, MartialArt> = {
      九阳神功: {
        type: '内功',
        description: '至阳至刚的绝世内功。',
        rank: '绝世',
        mastery: '初窥门径',
        traits: {},
        unlockedTraits: {},
        canUpgrade: true,
        upgradeCost: 100,
        nextMastery: '略有小成',
      },
    };

    render(
      <InventoryPanel
        items={items}
        initialAttributes={{ ...initialAttributes, 悟性: 15 }}
        knownMartialArts={knownMartialArts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看九阳神功' }));

    expect(screen.getByText('已习得《九阳神功》，无需重复参悟。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已习得' })).toBeDisabled();
  });

  it('列表和详情显示按外观推断的细分类', () => {
    render(<InventoryPanel items={items} />);

    expect(screen.getByText('剑 · 珍品')).toBeInTheDocument();
    expect(screen.getByText('丹药 · 绝品')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看大还丹' }));
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
