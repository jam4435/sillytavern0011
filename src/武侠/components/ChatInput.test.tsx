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
});
