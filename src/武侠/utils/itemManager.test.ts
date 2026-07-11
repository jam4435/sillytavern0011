import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { decrementStatusEffectTurns, restoreItemCount, useMedicineItem } from './itemManager';

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

  it('临时增幅药品会扣数量并创建状态效果', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    vi.mocked(globalThis.getAllVariables).mockReturnValue({
      stat_data: {
        user数据: {
          包裹: {
            九花玉露丸: {
              类型: '药品',
              品阶: '珍品',
              功效类型: '临时增幅',
              物品描述: '清香沁脾。',
              数量: 2,
              属性修正: { 气血: 30, 内力: 12 },
              持续时间: 3,
            },
          },
          状态效果: { $template: {} },
        },
      },
    });

    const result = await useMedicineItem('九花玉露丸');

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
                类型: '药品',
                功效类型: '临时增幅',
                来源: '九花玉露丸',
                品阶: '珍品',
                属性修正: { 气血: 30, 内力: 12 },
                持续时间: 3,
                剩余时间: 3,
              },
            },
          },
        },
      },
    }));
  });

  it('回复药品会扣数量并恢复当前气血', async () => {
    vi.mocked(globalThis.getAllVariables).mockReturnValue({
      stat_data: {
        user数据: {
          属性: {
            气血: '40/100',
            内力: '80/80',
          },
          包裹: {
            金疮药: {
              类型: '药品',
              品阶: '凡品',
              功效类型: '回复',
              物品描述: '普通的伤药。',
              数量: 2,
              属性修正: { 气血: 20 },
            },
          },
        },
      },
    });

    const result = await useMedicineItem('金疮药');

    expect(result?.resourceDeltas).toEqual({ 气血: 3 });
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      detail: {
        stat_data: {
          user数据: {
            包裹: {
              金疮药: { 数量: 1 },
            },
          },
        },
      },
    }));
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      detail: {
        stat_data: {
          user数据: {
            属性: {
              气血: '43/100',
            },
          },
        },
      },
    }));
  });

  it('永久增幅药品会写入前端变量永久属性修正', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    vi.spyOn(Math, 'random').mockReturnValue(0.234567);
    vi.mocked(globalThis.getAllVariables).mockReturnValue({
      stat_data: {
        前端变量: {},
        user数据: {
          包裹: {
            洗髓丹: {
              类型: '药品',
              品阶: '珍品',
              功效类型: '永久增幅',
              物品描述: '洗髓伐骨。',
              数量: 2,
              属性修正: { 根骨: 10 },
            },
          },
        },
      },
    });

    const result = await useMedicineItem('洗髓丹');
    const permanentModifierId = result?.permanentModifierId ?? '';

    expect(permanentModifierId).toMatch(/^洗髓丹_2000_/);
    expect(emitSourcedEraVariableWriteAndWaitMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventName: 'era:insertByObject',
      detail: {
        stat_data: {
          前端变量: {
            永久属性修正: {
              [permanentModifierId]: {
                类型: '药品',
                功效类型: '永久增幅',
                来源: '洗髓丹',
                品阶: '珍品',
                属性修正: { 根骨: 10 },
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
            药效甲: { 类型: '药品', 功效类型: '临时增幅', 来源: '甲', 剩余时间: 3, 持续时间: 3, 属性修正: { 臂力: 1 } },
            药效乙: { 类型: '药品', 功效类型: '临时增幅', 来源: '乙', 剩余时间: 1, 持续时间: 1, 属性修正: { 根骨: 1 } },
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
