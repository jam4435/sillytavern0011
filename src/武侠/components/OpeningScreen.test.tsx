import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OpeningScreen from './OpeningScreen';

vi.mock('./FullscreenButton', () => ({
  default: () => null,
}));

describe('OpeningScreen regeneration', () => {
  it('reuses ChatInput normal regenerate and edit-last-input actions', async () => {
    const onRegenerate = vi.fn(async () => true);
    const onEditRegenerateInput = vi.fn();

    render(
      <OpeningScreen
        welcomeLine="风起江湖"
        playerName="段誉"
        location="大理/无量山"
        onSend={vi.fn()}
        onRegenerate={onRegenerate}
        onEditRegenerateInput={onEditRegenerateInput}
        canRegenerate
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重新生成上一条回复' }));
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledWith(undefined);

    fireEvent.click(screen.getByRole('button', { name: '重新生成选项' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '修改上一轮输入后重新生成' }));
    expect(onEditRegenerateInput).toHaveBeenCalledTimes(1);
  });

  it('passes regenerate edit state and draft prefill through to ChatInput', () => {
    render(
      <OpeningScreen
        welcomeLine="风起江湖"
        onSend={vi.fn()}
        onRegenerate={vi.fn()}
        onRegenerateDraftModeChange={vi.fn()}
        onCancelRegenerateDraft={vi.fn()}
        canRegenerate
        regenerateDraftMode="user-input"
        regenerateDraftPrefill={{
          key: 'opening-regenerate',
          drafts: {
            'user-input': '修改后的开局行动',
            'assistant-append': '',
          },
        }}
      />,
    );

    expect(screen.getByRole('textbox', { name: '玩家行动' })).toHaveValue('修改后的开局行动');
    expect(screen.getByPlaceholderText('修改上一轮输入后，点击右侧重新生成...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用修改后的上一轮输入重新生成' })).toBeInTheDocument();
  });
});
