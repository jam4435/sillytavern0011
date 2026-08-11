// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MatchState } from '../engine/types';
import { ActionPanel } from './ActionPanel';

function match(overrides: Partial<MatchState> = {}): MatchState {
  const home = ['Hero', 'H2', 'H3', 'H4', 'H5']; const away = ['A1', 'A2', 'A3', 'A4', 'A5'];
  return {
    进行中: true, 对阵: { 主队: 'GSW', 客队: 'CLE' }, 节次: 1, 剩余秒数: 700, 投篮时钟: 20,
    比分: { 主: 0, 客: 0 }, 球权: '主', 跳球胜方: '主', 战术: { 主: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' }, 客: { offense: '基础', defense: '人盯人', pace: '标准', helpIntensity: 50, rebound: '均衡' } },
    站位: { 主: home.map((球员, i) => ({ 球员, x: 20 + i * 5, y: 20 + i * 10, ...(i === 0 ? { 持球: true } : {}) })), 客: away.map((球员, i) => ({ 球员, x: 60 + i * 5, y: 20 + i * 10 })) },
    本节球队犯规: { 主: 0, 客: 0 }, 暂停: { 主: 3, 客: 3 }, 阵容: { 主: { 场上: home, 替补: ['H6'] }, 客: { 场上: away, 替补: [] } },
    回合阶段: '常规回合', 待处理情境: { type: 'none' }, 回合情境: '', 球员状态: {}, 回合摘要: '', ...overrides,
  };
}

describe('v3 ActionPanel', () => {
  it('只让主角执行持球动作', () => {
    const onChoose = vi.fn();
    render(<ActionPanel match={match()} mySide="主" protagonist="Hero" disabled={false} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: '后撤步' }));
    expect(onChoose).toHaveBeenCalledWith({ action: '后撤步', actorKey: 'Hero', partnerKey: null });
    expect(screen.queryByText('H2 · 只控制主角')).toBeNull();
  });
  it('主角无球时只显示无球动作', () => {
    const value = match(); value.站位.主[0].持球 = false; value.站位.主[1].持球 = true;
    render(<ActionPanel match={value} mySide="主" protagonist="Hero" disabled={false} onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '空切' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '后撤步' })).toBeNull();
  });
  it('篮板阶段只显示卡位与对应攻防篮板', () => {
    render(<ActionPanel match={match({ 回合阶段: '篮板争抢', 待处理情境: { type: 'rebound', shootingSide: '客', shooter: 'A1', zone: '中投正面' } })} mySide="主" protagonist="Hero" disabled={false} onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '先卡位' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '防守篮板' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '后撤步' })).toBeNull();
  });
  it('死球可以换人和提出战术建议', () => {
    const onSubstitution = vi.fn(); const onTacticRequest = vi.fn();
    render(<ActionPanel match={match({ 回合阶段: '死球', 待处理情境: { type: 'deadBall', reason: '出界', inboundSide: '主' } })} mySide="主" protagonist="Hero" disabled={false} onChoose={vi.fn()} onSubstitution={onSubstitution} onTacticRequest={onTacticRequest} />);
    fireEvent.click(screen.getByRole('button', { name: '五外' }));
    expect(onTacticRequest).toHaveBeenCalledWith({ offense: '五外' });
    fireEvent.click(screen.getByRole('button', { name: '阵容轮换' }));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onSubstitution).toHaveBeenCalledWith({ side: '主', outKey: 'Hero', inKey: 'H6' });
  });
});
