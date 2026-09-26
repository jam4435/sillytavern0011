import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatInput from './ChatInput';

describe('ChatInput history draft', () => {
  it('把历史行动预填到输入框，允许修改且不会自动发送', () => {
    const onSend = vi.fn();
    const onMessageChange = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        prefill={{ key: 'checkout-1', message: '沿山路前往古寺调查' }}
        onMessageChange={onMessageChange}
      />,
    );

    const input = screen.getByRole('textbox', { name: '玩家行动' });
    expect(input).toHaveValue('沿山路前往古寺调查');
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '改走水路潜入古寺' } });
    expect(input).toHaveValue('改走水路潜入古寺');
    expect(onMessageChange).toHaveBeenLastCalledWith('改走水路潜入古寺');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('只有玩家点击发送后才提交预填行动', async () => {
    const onSend = vi.fn(async () => undefined);
    render(<ChatInput onSend={onSend} prefill={{ key: 'checkout-2', message: '先观察四周' }} />);

    expect(onSend).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送玩家行动' }));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('先观察四周');
  });

  it('普通模式保留一键重新生成，并把修改上一轮输入收进二级入口', async () => {
    const onRegenerate = vi.fn(async () => undefined);
    const onEditRegenerateInput = vi.fn();
    render(
      <ChatInput
        onSend={vi.fn()}
        onRegenerate={onRegenerate}
        onEditRegenerateInput={onEditRegenerateInput}
        canRegenerate
      />,
    );

    const regenerate = screen.getByRole('button', { name: '重新生成上一条回复' });
    expect(regenerate).toHaveAttribute('data-wuxia-automation', 'generation-state regenerate-last-reply');

    await act(async () => {
      fireEvent.click(regenerate);
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledWith(undefined);

    fireEvent.click(screen.getByRole('button', { name: '重新生成选项' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '修改上一轮输入后重新生成' }));
    expect(onEditRegenerateInput).toHaveBeenCalledTimes(1);
  });

  it('修改上一轮输入模式下 Enter 直接重新生成而不会误发新消息', async () => {
    const onSend = vi.fn();
    const onRegenerate = vi.fn(async () => true);
    render(
      <ChatInput
        onSend={onSend}
        onRegenerate={onRegenerate}
        canRegenerate
        regenerateDraftMode="user-input"
        prefill={{ key: 'regen-1', message: '原来的行动' }}
      />,
    );

    const input = screen.getByRole('textbox', { name: '玩家行动' });
    fireEvent.change(input, { target: { value: '  修改后的行动  ' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
      await Promise.resolve();
    });

    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledWith({
      replacementUserInput: '修改后的行动',
      previousAssistantAppendText: undefined,
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('修改上一轮输入模式下右侧唯一主按钮就是重新生成', async () => {
    const onSend = vi.fn();
    const onRegenerate = vi.fn(async () => true);
    render(
      <ChatInput
        onSend={onSend}
        onRegenerate={onRegenerate}
        canRegenerate
        regenerateDraftMode="user-input"
        prefill={{ key: 'regen-2', message: '改成走水路' }}
      />,
    );

    expect(screen.queryByRole('button', { name: '重新生成上一条回复' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发送玩家行动' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '使用修改后的上一轮输入重新生成' }));
    });

    expect(onRegenerate).toHaveBeenCalledWith({
      replacementUserInput: '改成走水路',
      previousAssistantAppendText: undefined,
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('两个编辑标签分别保留草稿，并可一次同时提交', async () => {
    const onRegenerateDraftModeChange = vi.fn();
    const onRegenerate = vi.fn(async () => true);
    const props = {
      onSend: vi.fn(),
      onRegenerate,
      onRegenerateDraftModeChange,
      canRegenerate: true,
      prefill: { key: 'regen-switch', message: '上一轮行动' },
    };
    const { rerender } = render(<ChatInput {...props} regenerateDraftMode="user-input" />);

    const input = screen.getByRole('textbox', { name: '玩家行动' });
    fireEvent.change(input, { target: { value: '修改后的上一轮行动' } });

    fireEvent.click(screen.getByRole('button', { name: '追加上一轮输出' }));
    expect(onRegenerateDraftModeChange).toHaveBeenLastCalledWith('assistant-append');
    expect(input).toHaveValue('');

    rerender(<ChatInput {...props} regenerateDraftMode="assistant-append" />);
    fireEvent.change(input, { target: { value: '补充：上一轮还有一件事' } });

    fireEvent.click(screen.getByRole('button', { name: '修改上一轮输入' }));
    expect(onRegenerateDraftModeChange).toHaveBeenLastCalledWith('user-input');
    expect(input).toHaveValue('修改后的上一轮行动');

    rerender(<ChatInput {...props} regenerateDraftMode="user-input" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '使用修改后的上一轮输入重新生成' }));
    });

    expect(onRegenerate).toHaveBeenCalledWith({
      replacementUserInput: '修改后的上一轮行动',
      previousAssistantAppendText: '补充：上一轮还有一件事',
    });
  });

  it('重新进入编辑态时可一次回填玩家输入与上一轮 AI 追加段，并在标签间保留修改', () => {
    const onRegenerateDraftModeChange = vi.fn();
    const draftPrefill = {
      key: 'regen-edit-existing-append',
      drafts: {
        'user-input': '上一轮玩家输入',
        'assistant-append': '上一轮已经追加的说明',
      },
    } as const;
    const props = {
      onSend: vi.fn(),
      onRegenerate: vi.fn(),
      onRegenerateDraftModeChange,
      canRegenerate: true,
      regenerateDraftPrefill: draftPrefill,
    };
    const { rerender } = render(<ChatInput {...props} regenerateDraftMode="user-input" />);

    const input = screen.getByRole('textbox', { name: '玩家行动' });
    expect(input).toHaveValue('上一轮玩家输入');

    fireEvent.click(screen.getByRole('button', { name: '追加上一轮输出' }));
    rerender(<ChatInput {...props} regenerateDraftMode="assistant-append" />);
    expect(input).toHaveValue('上一轮已经追加的说明');

    fireEvent.change(input, { target: { value: '修改后的追加说明' } });
    fireEvent.click(screen.getByRole('button', { name: '修改上一轮输入' }));
    rerender(<ChatInput {...props} regenerateDraftMode="user-input" />);
    expect(input).toHaveValue('上一轮玩家输入');

    fireEvent.click(screen.getByRole('button', { name: '追加上一轮输出' }));
    rerender(<ChatInput {...props} regenerateDraftMode="assistant-append" />);
    expect(input).toHaveValue('修改后的追加说明');
  });

  it('编辑态共用独立退出按钮', () => {
    const onCancelRegenerateDraft = vi.fn();
    render(
      <ChatInput
        onSend={vi.fn()}
        onRegenerate={vi.fn()}
        onCancelRegenerateDraft={onCancelRegenerateDraft}
        canRegenerate
        regenerateDraftMode="user-input"
        prefill={{ key: 'regen-exit', message: '上一轮行动' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '退出重新生成编辑模式' }));
    expect(onCancelRegenerateDraft).toHaveBeenCalledTimes(1);
  });

  it('允许显式取消修改上一轮输入模式', () => {
    const onCancelRegenerateDraft = vi.fn();
    const onMessageChange = vi.fn();
    render(
      <ChatInput
        onSend={vi.fn()}
        onRegenerate={vi.fn()}
        onCancelRegenerateDraft={onCancelRegenerateDraft}
        onMessageChange={onMessageChange}
        canRegenerate
        regenerateDraftMode="user-input"
        prefill={{ key: 'regen-3', message: '上一轮行动' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '退出重新生成编辑模式' }));

    expect(onCancelRegenerateDraft).toHaveBeenCalledTimes(1);
    expect(onMessageChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '玩家行动' })).toHaveValue('');
  });
});
