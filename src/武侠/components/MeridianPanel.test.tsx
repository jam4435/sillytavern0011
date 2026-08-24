import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InitialAttributes, MeridianNodeId, MeridianUpgradeQuote } from '../types';
import { buildMeridianProjection, createEmptyMeridianProgress } from '../utils/meridianSystem';
import { MeridianPanel } from './MeridianPanel';

const initialAttributes: InitialAttributes = {
  臂力: 8,
  根骨: 9,
  机敏: 7,
  悟性: 6,
  洞察: 7,
  风姿: 5,
  福缘: 6,
};

const buildProjection = (opened: MeridianNodeId[] = []) =>
  buildMeridianProjection({
    progress: {
      ...createEmptyMeridianProgress(),
      已通穴位: opened,
    },
    realm: '三流圆满',
    cultivation: 10_000,
    initialAttributes,
  });

describe('MeridianPanel', () => {
  it('呈现四十穴与八脉，并可用键盘在铜人图上选穴', () => {
    const { container } = render(
      <MeridianPanel projection={buildProjection()} cultivation={10_000} onUpgrade={vi.fn(async () => undefined)} />,
    );

    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(40);
    expect(container.querySelectorAll('[data-wuxia-automation^="meridian-select-"]')).toHaveLength(8);

    const yinweiNode = container.querySelector('[data-wuxia-automation="meridian-node-yinwei:opening"]');
    expect(yinweiNode).not.toBeNull();
    fireEvent.keyDown(yinweiNode!, { key: 'Enter' });

    expect(screen.getByRole('heading', { name: '启脉' })).toBeInTheDocument();
    expect(container.querySelector('[data-wuxia-automation="meridian-select-yinwei"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('先展示不可逆确认，再把所选报价原样交给升级回调', async () => {
    const onUpgrade = vi.fn(async (_nodeId: MeridianNodeId, _quote: MeridianUpgradeQuote) => undefined);
    render(<MeridianPanel projection={buildProjection()} cultivation={10_000} onUpgrade={onUpgrade} />);

    fireEvent.click(screen.getByRole('button', { name: /冲击此穴/ }));
    expect(screen.getByRole('alertdialog', { name: '确认冲击启脉' })).toHaveTextContent('落子无悔');

    fireEvent.click(screen.getByRole('button', { name: '确认冲穴' }));
    await waitFor(() => expect(onUpgrade).toHaveBeenCalledTimes(1));

    expect(onUpgrade.mock.calls[0][0]).toBe('ren:opening');
    expect(onUpgrade.mock.calls[0][1]).toMatchObject({ nodeId: 'ren:opening', canUpgrade: true });
    await waitFor(() => expect(screen.getByText('冲穴请求已提交。')).toBeInTheDocument());
  });

  it('忙碌或经脉损坏时禁止冲穴且不给乐观进度', () => {
    const onUpgrade = vi.fn(async () => undefined);
    const projection = buildProjection();
    const { rerender } = render(
      <MeridianPanel projection={projection} cultivation={10_000} busy onUpgrade={onUpgrade} />,
    );

    expect(screen.getByRole('button', { name: /气机未定/ })).toBeDisabled();
    expect(screen.getAllByText('0/5')).toHaveLength(8);

    rerender(
      <MeridianPanel
        projection={{ ...projection, corrupted: true, error: '版本未知' }}
        cultivation={10_000}
        onUpgrade={onUpgrade}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('版本未知');
    expect(screen.getByRole('button', { name: /冲击此穴/ })).toBeDisabled();
    expect(onUpgrade).not.toHaveBeenCalled();
  });
});
