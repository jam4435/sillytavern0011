import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatestAssistantSnapshot } from '../utils/latestAssistantEditor';
import LatestReplyEditorModal from './LatestReplyEditorModal';

function createSnapshot(rawText = '正文\n<VariableThink>思考</VariableThink>\n<era_data>{"mk":"stable"}</era_data>'):
  LatestAssistantSnapshot {
  return {
    chatId: 'chat-a',
    messageId: 12,
    swipeId: 1,
    rawText,
    messageMirrorText: rawText,
    hasSwipes: true,
    metadata: {
      data: { secretMetadata: '不展示' },
      extra: { model: 'hidden' },
      swipesData: [{}, {}],
      swipesInfo: [{}, {}],
      swipeCount: 2,
    },
  };
}

describe('LatestReplyEditorModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('显示完整 AI 原文和楼层定位，但不显示聊天文件 metadata', () => {
    const snapshot = createSnapshot();
    render(
      <LatestReplyEditorModal
        isOpen
        snapshot={snapshot}
        onClose={vi.fn()}
        onReload={() => snapshot}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: '最新 AI 回复原文' })).toHaveValue(snapshot.rawText);
    expect(screen.getByText('楼层 #12 · 回复分支 2/2')).toBeInTheDocument();
    expect(screen.queryByText(/secretMetadata|hidden|不展示/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '覆写最新回复' })).toBeDisabled();
  });

  it('脏草稿关闭前确认，拒绝确认时保持打开', () => {
    const snapshot = createSnapshot();
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(
      <LatestReplyEditorModal
        isOpen
        snapshot={snapshot}
        onClose={onClose}
        onReload={() => snapshot}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '最新 AI 回复原文' }), {
      target: { value: `${snapshot.rawText}\n补充正文` },
    });
    fireEvent.click(screen.getByRole('button', { name: '关闭校订最新回复' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '关闭校订最新回复' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('保存后采用回读 snapshot，并展示非致命历史警告', async () => {
    const snapshot = createSnapshot();
    const finalText = `${snapshot.rawText}\n补充正文`;
    const committed = createSnapshot(finalText);
    const onSave = vi.fn(async () => ({ snapshot: committed, warning: '历史预览刷新失败' }));
    render(
      <LatestReplyEditorModal
        isOpen
        snapshot={snapshot}
        onClose={vi.fn()}
        onReload={() => snapshot}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '最新 AI 回复原文' }), {
      target: { value: finalText },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '覆写最新回复' }));
    });

    expect(onSave).toHaveBeenCalledWith(snapshot, finalText);
    await waitFor(() => expect(screen.getByText(/回复已覆写；历史预览刷新失败/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '覆写最新回复' })).toBeDisabled();
  });

  it('保存失败时保留草稿和编辑窗口', async () => {
    const snapshot = createSnapshot();
    const draft = `${snapshot.rawText}\n会冲突的修改`;
    const onSave = vi.fn(async () => {
      throw new Error('最新回复在编辑期间已经变化，请重新载入后再保存。');
    });
    render(
      <LatestReplyEditorModal
        isOpen
        snapshot={snapshot}
        onClose={vi.fn()}
        onReload={() => snapshot}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '最新 AI 回复原文' }), { target: { value: draft } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '覆写最新回复' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('最新回复在编辑期间已经变化');
    expect(screen.getByRole('textbox', { name: '最新 AI 回复原文' })).toHaveValue(draft);
  });
});
