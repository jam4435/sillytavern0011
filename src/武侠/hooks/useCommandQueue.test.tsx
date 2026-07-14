import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decrementStatusEffectTurns,
  removePermanentAttributeModifier,
  removeStatusEffect,
  restoreEquipmentState,
  restoreItemCount,
  undoResourceDeltas,
} from '../utils/itemManager';
import { syncPlayerAttributesFromVariables } from '../utils/variableReader';
import { useCommandQueue } from './useCommandQueue';

vi.mock('../utils/itemManager', () => ({
  decrementStatusEffectTurns: vi.fn(),
  removePermanentAttributeModifier: vi.fn(),
  removeStatusEffect: vi.fn(),
  restoreEquipmentState: vi.fn(),
  restoreItemCount: vi.fn(),
  undoResourceDeltas: vi.fn(),
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
const removePermanentAttributeModifierMock = vi.mocked(removePermanentAttributeModifier);
const removeStatusEffectMock = vi.mocked(removeStatusEffect);
const restoreEquipmentStateMock = vi.mocked(restoreEquipmentState);
const restoreItemCountMock = vi.mocked(restoreItemCount);
const undoResourceDeltasMock = vi.mocked(undoResourceDeltas);
const syncPlayerAttributesMock = vi.mocked(syncPlayerAttributesFromVariables);

describe('useCommandQueue', () => {
  beforeEach(() => {
    decrementStatusEffectTurnsMock.mockReset();
    removePermanentAttributeModifierMock.mockReset();
    removeStatusEffectMock.mockReset();
    restoreEquipmentStateMock.mockReset();
    restoreItemCountMock.mockReset();
    undoResourceDeltasMock.mockReset();
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

  it('地图指令会把完整三级地点路径发送给正文模型', async () => {
    const { result } = renderHook(() => useCommandQueue());
    const send = vi.fn(async () => undefined);

    act(() => {
      result.current.setTravelCommand('大宋/嘉兴府/烟雨楼', '大宋/临安府/牛家村');
    });

    await act(async () => {
      await result.current.sendMessageWithCommands('出发', send);
    });

    expect(send).toHaveBeenCalledWith(
      '出发\n[地图指令]从大宋/临安府/牛家村移动到大宋/嘉兴府/烟雨楼',
    );
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

  it('取消药品指令会恢复完整物品快照并删除对应副作用', async () => {
    const { result } = renderHook(() => useCommandQueue());
    const originalItem = {
      类型: '药品',
      品阶: '珍品',
      功效类型: '临时增幅',
      物品描述: '清香沁脾。',
      数量: 2,
      属性修正: { 气血: 25 },
      持续时间: 3,
    };

    act(() => {
      result.current.addUseItemCommand('使用九花玉露丸，（属性已变化）', {
        itemName: '九花玉露丸',
        originalItem,
        statusEffectId: 'effect-1',
        permanentModifierId: 'perm-1',
        resourceDeltas: { 气血: 3 },
      });
    });

    const commandId = result.current.commands[0].id;
    await act(async () => {
      await result.current.cancelCommand(commandId);
    });

    expect(restoreItemCountMock).toHaveBeenCalledWith('九花玉露丸', originalItem);
    expect(removeStatusEffectMock).toHaveBeenCalledWith('effect-1');
    expect(removePermanentAttributeModifierMock).toHaveBeenCalledWith('perm-1');
    expect(undoResourceDeltasMock).toHaveBeenCalledWith({ 气血: 3 });
    expect(syncPlayerAttributesMock).toHaveBeenCalledTimes(1);
    expect(result.current.commands).toEqual([]);
  });

  it('取消装备指令会恢复装备栏和使用状态', async () => {
    const { result } = renderHook(() => useCommandQueue());
    const rollback = {
      slot: '兵器',
      previousItemName: '旧剑',
      previousItem: { 类型: '装备', 品阶: '精品', 物品描述: '', 数量: 1, 部位: '兵器', 使用状态: '装备中' },
      newItemName: '新剑',
      newItem: { 类型: '装备', 品阶: '珍品', 物品描述: '', 数量: 1, 部位: '兵器', 使用状态: '' },
      equipmentSlotExisted: true,
    };

    act(() => {
      result.current.addUseItemCommand('装备新剑，（属性已变化）', {
        itemName: '新剑',
        equipmentRollback: rollback,
      });
    });

    const commandId = result.current.commands[0].id;
    await act(async () => {
      await result.current.cancelCommand(commandId);
    });

    expect(restoreEquipmentStateMock).toHaveBeenCalledWith(rollback);
    expect(syncPlayerAttributesMock).toHaveBeenCalledTimes(1);
  });
});
