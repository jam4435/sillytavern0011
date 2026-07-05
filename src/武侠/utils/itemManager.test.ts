import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { decrementStatusEffectTurns, restoreItemCount, useElixirItem } from './itemManager';

vi.mock('../../shared/directVariableWrite', () => ({
  emitSourcedEraVariableWriteAndWait: vi.fn(),
}));

vi.mock('./logger', () => ({
  gameLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const emitSourcedEraVariableWriteAndWaitMock = vi.mocked(emitSourcedEraVariableWriteAndWait);

describe('itemManager', () => {
  beforeEach(() => {
    vi.stubGlobal('getAllVariables', vi.fn());
    emitSourcedEraVariableWriteAndWaitMock.mockReset();
    emitSourcedEraVariableWriteAndWaitMock.mockResolvedValue({
      version: 1,
      writeId: 'test-write',
      source: 'frontend',
      operation: 'update',
      reason: 'test',
      eventName: 'era:updateByObject',
      attribution: 'background',
      actions: { apiWrite: true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('物品不存在时会用完整快照 insert 恢复', async () => {
    vi.mocked(globalThis.getAllVariables).mockReturnValue({
      stat_data: {
        user数据: {
          包裹: {},
        },
      },
    });

    await restoreItemCount('软猬甲', {
      类型: '装备',
      品阶: '绝品',
      物品描述: '刀枪难入。',
      数量: 1,
      部位: '护甲',
      属性修正: { 根骨: 15 },
      使用状态: '装备中',
    });

    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'era:insertByObject',
      detail: {
        stat_data: {
          user数据: {
            包裹: {
              软猬甲: {
                类型: '装备',
                品阶: '绝品',
                物品描述: '刀枪难入。',
                数量: 1,
                部位: '护甲',
                属性修正: { 根骨: 15 },
                使用状态: '装备中',
              },
            },
          },
        },
      },
    }));
  });

  it('吞服丹药会扣数量并创建状态效果', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    vi.mocked(globalThis.getAllVariables).mockReturnValue({
      stat_data: {
        user数据: {
          包裹: {
            九花玉露丸: {
              类型: '丹药',
              品阶: '珍品',
              物品描述: '清香沁脾。',
              数量: 2,
              属性修正: { 气血上限: 30, 内力上限: 12 },
              持续时间: 3,
            },
          },
          状态效果: { $template: {} },
        },
      },
    });

    const result = await useElixirItem('九花玉露丸');

    expect(result).toEqual(expect.objectContaining({
      itemName: '九花玉露丸',
      newCount: 1,
      statusEffectId: expect.stringMatching(/^九花玉露丸_1000_/),
      originalItem: expect.objectContaining({ 数量: 2 }),
    }));
    const statusEffectId = result?.statusEffectId ?? '';
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventName: 'era:updateByObject',
      detail: {
        stat_data: {
          user数据: {
            包裹: {
              九花玉露丸: { 数量: 1 },
            },
          },
        },
      },
    }));
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventName: 'era:insertByObject',
      detail: {
        stat_data: {
          user数据: {
            状态效果: {
              [statusEffectId]: {
                类型: '丹药',
                来源: '九花玉露丸',
                属性修正: { 气血上限: 30, 内力上限: 12 },
                持续时间: 3,
                剩余时间: 3,
              },
            },
          },
        },
      },
    }));
  });

  it('状态效果递减会更新未过期效果并删除归零效果', async () => {
    vi.mocked(globalThis.getAllVariables).mockReturnValue({
      stat_data: {
        user数据: {
          状态效果: {
            药效甲: { 类型: '丹药', 来源: '甲', 剩余时间: 3, 持续时间: 3, 属性修正: { 臂力: 1 } },
            药效乙: { 类型: '丹药', 来源: '乙', 剩余时间: 1, 持续时间: 1, 属性修正: { 根骨: 1 } },
          },
        },
      },
    });

    await decrementStatusEffectTurns();

    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventName: 'era:updateByObject',
      detail: {
        stat_data: {
          user数据: {
            状态效果: {
              药效甲: { 剩余时间: 2 },
            },
          },
        },
      },
    }));
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventName: 'era:deleteByPath',
      detail: {
        path: 'stat_data.user数据.状态效果.药效乙',
      },
    }));
  });
});
