import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MatchState } from '../engine/types';
import { ActionPanel } from './ActionPanel';

function makeMatch(phase: '常规回合' | '篮板争抢' | '死球' = '常规回合'): MatchState {
  return {
    进行中: true,
    对阵: { 主队: 'GSW', 客队: 'CLE' },
    节次: 1,
    剩余秒数: 720,
    比分: { 主: 0, 客: 0 },
    球权: '主',
    战术: { 主: '', 客: '' },
    站位: {
      主: [
        { 球员: 'A', x: 20, y: 50, 持球: true },
        { 球员: 'B', x: 35, y: 30 },
      ],
      客: [{ 球员: 'X', x: 80, y: 50 }],
    },
    球员状态: {},
    回合摘要: '',
    回合阶段: phase,
    本节球队犯规: { 主: 0, 客: 0 },
    暂停: { 主: 3, 客: 3 },
    阵容: {
      主: { 场上: ['A', 'B'], 替补: ['C'] },
      客: { 场上: ['X'], 替补: ['Y'] },
    },
    回合情境: '',
  } as MatchState;
}

describe('ActionPanel', () => {
  it('篮板阶段只暴露篮板行动', () => {
    render(<ActionPanel match={makeMatch('篮板争抢')} mySide="主" protagonist="A" disabled={false} onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '冲抢篮板' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '突破' })).toBeNull();
  });

  it('无球跑动会选择实际无球队员作为 actor', () => {
    const onChoose = vi.fn();
    render(<ActionPanel match={makeMatch()} mySide="主" protagonist="A" disabled={false} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: '无球跑动' }));
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChoose).toHaveBeenCalledWith({ action: '无球跑动', actorKey: 'B', partnerKey: null });
  });

  it('死球阶段允许提交换人回调，且不显示比赛动作', () => {
    const onSubstitution = vi.fn();
    render(
      <ActionPanel
        match={makeMatch('死球')}
        mySide="主"
        protagonist="A"
        disabled={false}
        onChoose={vi.fn()}
        onSubstitution={onSubstitution}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '阵容轮换' }));
    fireEvent.click(screen.getByRole('button', { name: '确认换人' }));
    expect(onSubstitution).toHaveBeenCalledWith({ side: '主', outKey: 'A', inKey: 'C' });
    expect(screen.queryByRole('button', { name: '突破' })).toBeNull();
  });
});
