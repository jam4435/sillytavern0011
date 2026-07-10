import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MartialArt } from '../../types';
import { MartialArtsPanel } from './MartialArtsPanel';

vi.mock('../../utils/martialArtsDatabase', () => ({
  upgradeMartialArt: vi.fn(async () => ({
    success: true,
    newMastery: '略有小成',
    newCultivation: 120,
  })),
}));

const martialArts: Record<string, MartialArt> = {
  九阳神功: {
    type: '内功',
    description: '至阳至刚的绝世内功。',
    rank: '绝世',
    mastery: '初窥门径',
    traits: {
      初窥门径: '内息绵长',
      略有小成: '百毒不侵',
    },
    unlockedTraits: {
      初窥门径: '内息绵长',
    },
    canUpgrade: true,
    upgradeCost: 80,
    nextMastery: '略有小成',
  },
  胡家刀法: {
    type: '刀法',
    description: '开阖凌厉的刀法。',
    rank: '上乘',
    mastery: '融会贯通',
    traits: {},
    unlockedTraits: {},
    canUpgrade: false,
    upgradeCost: 200,
    nextMastery: '炉火纯青',
  },
};

describe('MartialArtsPanel', () => {
  it('可按类型和品阶筛选功法', () => {
    render(<MartialArtsPanel martialArts={martialArts} cultivation={200} comprehension={10} />);

    fireEvent.click(screen.getByRole('button', { name: '刀法' }));
    expect(screen.getByRole('button', { name: '查看胡家刀法' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看九阳神功' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '全部' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '绝世' }));
    expect(screen.getByRole('button', { name: '查看九阳神功' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看胡家刀法' })).not.toBeInTheDocument();
  });

  it('点击功法显示详情和特性', () => {
    render(<MartialArtsPanel martialArts={martialArts} cultivation={200} comprehension={10} />);

    fireEvent.click(screen.getByRole('button', { name: '查看九阳神功' }));

    expect(screen.getByRole('heading', { name: '九阳神功' })).toBeInTheDocument();
    expect(screen.getByAltText('九阳神功图标')).toBeInTheDocument();
    expect(screen.getByText('内息绵长')).toBeInTheDocument();
    expect(screen.getAllByText('略有小成').length).toBeGreaterThan(0);
  });

  it('可精进按钮调用升级回调', async () => {
    const onUpgrade = vi.fn();
    render(<MartialArtsPanel martialArts={martialArts} cultivation={200} comprehension={10} onUpgrade={onUpgrade} />);

    fireEvent.click(screen.getByRole('button', { name: '精进' }));

    await waitFor(() => {
      expect(onUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, martialArtName: '九阳神功', newMastery: '略有小成' }),
      );
    });
  });

  it('空功法仍显示空状态', () => {
    render(<MartialArtsPanel martialArts={{}} cultivation={0} comprehension={10} />);

    expect(screen.getByText('尚未修习任何武学功法。')).toBeInTheDocument();
  });
});
