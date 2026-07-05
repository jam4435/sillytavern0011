import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decrementStatusEffectTurns, removeStatusEffect, restoreItemCount } from '../utils/itemManager';
import { syncPlayerAttributesFromVariables } from '../utils/variableReader';
import { useCommandQueue } from './useCommandQueue';

vi.mock('../utils/itemManager', () => ({
  decrementStatusEffectTurns: vi.fn(),
  removeStatusEffect: vi.fn(),
  restoreItemCount: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  uiLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils/variableReader', () => ({
  syncPlayerAttributesFromVariables: vi.fn(),
}));

const decrementStatusEffectTurnsMock = vi.mocked(decrementStatusEffectTurns);
const removeStatusEffectMock = vi.mocked(removeStatusEffect);
const restoreItemCountMock = vi.mocked(restoreItemCount);
const syncPlayerAttributesMock = vi.mocked(syncPlayerAttributesFromVariables);

describe('useCommandQueue', () => {
  beforeEach(() => {
    decrementStatusEffectTurnsMock.mockReset();
    removeStatusEffectMock.mockReset();
    restoreItemCountMock.mockReset();
    syncPlayerAttributesMock.mockReset();
  });

  it('玩家消息发送成功后会递减状态效果', async () => {
    const { result } = renderHook(() => useCommandQueue());
    const send = vi.fn(async () => undefined);

    await act(async () => {
      await result.current.sendMessageWithCommands('行走江湖', send);
    });

    expect(send).toHaveBeenCalledWith('行走江湖');
    expect(decrementStatusEffectTurnsMock).toHaveBeenCalledTimes(1);
    expect(syncPlayerAttributesMock).toHaveBeenCalledTimes(1);
  });

  it('玩家消息发送失败时不会递减状态效果', async () => {
    const { result } = renderHook(() => useCommandQueue());
    const send = vi.fn(async () => {
      throw new Error('send failed');
    });

    await expect(act(async () => {
      await result.current.sendMessageWithCommands('行走江湖', send);
    })).rejects.toThrow('send failed');

    expect(decrementStatusEffectTurnsMock).not.toHaveBeenCalled();
  });

  it('取消吞服指令会恢复完整物品快照并删除对应状态效果', async () => {
    const { result } = renderHook(() => useCommandQueue());
    const originalItem = {
      类型: '丹药',
      品阶: '珍品',
      物品描述: '清香沁脾。',
      数量: 2,
      属性修正: { 气血上限: 25 },
      持续时间: 3,
    };

    act(() => {
      result.current.addUseItemCommand('九花玉露丸', originalItem, 'effect-1');
    });

    const commandId = result.current.commands[0].id;
    await act(async () => {
      await result.current.cancelCommand(commandId);
    });

    expect(restoreItemCountMock).toHaveBeenCalledWith('九花玉露丸', originalItem);
    expect(removeStatusEffectMock).toHaveBeenCalledWith('effect-1');
    expect(syncPlayerAttributesMock).toHaveBeenCalledTimes(1);
    expect(result.current.commands).toEqual([]);
  });
});
