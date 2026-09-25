import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GameContent from './GameContent';

describe('GameContent assistant reply autoscroll', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it('新 assistant/swipe 提交键出现时把最新回复顶部滚入视野', () => {
    const { rerender } = render(
      <GameContent maintext="第一条正文" options={[]} scrollCommitKey={null} />,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(<GameContent maintext="第二条正文" options={[]} scrollCommitKey="12:0" />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    });
  });

  it('同一提交键的正文后续刷新不会重复抢滚动位置', () => {
    const { rerender } = render(
      <GameContent maintext="正文" options={[]} scrollCommitKey="12:0" />,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(<GameContent maintext="正文追加变量后的最终显示" options={[]} scrollCommitKey="12:0" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(<GameContent maintext="重新生成正文" options={[]} scrollCommitKey="12:1" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('把最新 AI 回复编辑入口悬浮在正文容器上，而不是塞进正文内容流', () => {
    const onEditLatestReply = vi.fn();
    render(
      <GameContent
        maintext="正文"
        options={[]}
        onEditLatestReply={onEditLatestReply}
        canEditLatestReply
      />,
    );

    const edit = screen.getByRole('button', { name: '编辑最新 AI 回复' });
    const sticky = edit.closest('.maintext-edit-sticky');
    const container = edit.closest('.maintext-container');
    expect(edit).toHaveAttribute('data-wuxia-automation', 'open-latest-reply-editor');
    expect(edit).toHaveAttribute('data-wuxia-editable', 'true');
    expect(sticky).not.toBeNull();
    expect(container).not.toBeNull();
    expect(sticky?.parentElement).toBe(container);
    expect(edit.closest('.maintext-content')).toBeNull();

    fireEvent.click(edit);
    expect(onEditLatestReply).toHaveBeenCalledTimes(1);
  });

  it('即使当前状态暂不可编辑，铅笔入口也保持可点击并交给上层显示原因', () => {
    const onEditLatestReply = vi.fn();
    render(
      <GameContent
        maintext="正文"
        options={[]}
        onEditLatestReply={onEditLatestReply}
        canEditLatestReply={false}
      />,
    );

    const edit = screen.getByRole('button', { name: '编辑最新 AI 回复' });
    expect(edit).not.toBeDisabled();
    expect(edit).toHaveAttribute('data-wuxia-editable', 'false');

    fireEvent.click(edit);
    expect(onEditLatestReply).toHaveBeenCalledTimes(1);
  });
});
