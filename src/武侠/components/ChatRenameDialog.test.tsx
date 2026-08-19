import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatRenameDialog from './ChatRenameDialog';

describe('ChatRenameDialog', () => {
  it('展示开局建议名，并允许保留酒馆当前名称', () => {
    const keepCurrent = vi.fn();
    render(
      <ChatRenameDialog
        isOpen
        mode="initial"
        value="郭靖 · 牛家村"
        error={null}
        isSubmitting={false}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onKeepCurrent={keepCurrent}
        onClose={keepCurrent}
      />,
    );

    expect(screen.getByDisplayValue('郭靖 · 牛家村')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保留当前名称' }));
    expect(keepCurrent).toHaveBeenCalledOnce();
  });

  it('手动改名失败时保留输入与错误，Enter 提交当前草稿', () => {
    const confirm = vi.fn();
    render(
      <ChatRenameDialog
        isOpen
        mode="manual"
        value="已有同名"
        error="已有同名聊天存档，请换一个名称。"
        isSubmitting={false}
        onChange={vi.fn()}
        onConfirm={confirm}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue('已有同名');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('已有同名聊天存档');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(confirm).toHaveBeenCalledOnce();
  });
});
