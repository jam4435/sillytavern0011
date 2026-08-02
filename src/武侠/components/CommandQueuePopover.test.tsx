import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingCommand } from '../types';
import CommandQueuePopover from './CommandQueuePopover';

const commands: PendingCommand[] = [
  {
    id: 'travel-1',
    type: 'TRAVEL',
    text: '[地图指令]前往烟雨楼',
    data: { location: '大宋/嘉兴府/烟雨楼' },
    timestamp: 1,
  },
];

describe('CommandQueuePopover', () => {
  it('分别展示待发送数量和最近历史，点击历史只触发回填', () => {
    const onCancel = vi.fn();
    const onHistorySelect = vi.fn();
    const onClose = vi.fn();
    const recentHistory = [
      { messageId: 12, text: '先观察四周' },
      { messageId: 10, text: '向店家打听消息' },
    ];

    render(
      <CommandQueuePopover
        commands={commands}
        recentHistory={recentHistory}
        onCancel={onCancel}
        onHistorySelect={onHistorySelect}
        onClose={onClose}
      />,
    );

    const pendingSection = screen.getByRole('region', { name: '待发送指令' });
    expect(within(pendingSection).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('[地图指令]前往烟雨楼')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /填入输入栏/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '填入输入栏：先观察四周' }));
    expect(onHistorySelect).toHaveBeenCalledWith(recentHistory[0]);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('两个区块各自显示空状态，关闭按钮保持可用', () => {
    const onClose = vi.fn();
    render(
      <CommandQueuePopover
        commands={[]}
        recentHistory={[]}
        onCancel={vi.fn()}
        onHistorySelect={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('暂无待发送指令')).toBeInTheDocument();
    expect(screen.getByText('暂无发送记录')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭指令队列' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
