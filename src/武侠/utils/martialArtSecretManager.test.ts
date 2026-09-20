import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { setMartialArtsDatabase } from './martialArtsDatabase';
import { learnMartialArtFromSecret, undoLearnMartialArtFromSecret } from './martialArtSecretManager';

vi.mock('../../shared/directVariableWrite', () => ({
  emitSourcedEraVariableWriteAndWait: vi.fn(),
}));

vi.mock('./logger', () => ({
  gameLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  dataLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const emitWriteMock = vi.mocked(emitSourcedEraVariableWriteAndWait);

const baseUserData = {
  初始属性: {
    臂力: 10,
    根骨: 15,
    机敏: 10,
    悟性: 15,
    洞察: 10,
    风姿: 10,
    福缘: 10,
  },
  天赋: {},
  功法: {},
  包裹: {
    九阳神功: {
      类型: '秘籍',
      品阶: '绝世',
      物品描述: '秘籍。',
      数量: 1,
    },
  },
};

describe('martialArtSecretManager', () => {
  beforeEach(() => {
    vi.stubGlobal('getVariables', vi.fn());
    setMartialArtsDatabase([
      {
        功法名称: '九阳神功',
        类型: '内功',
        功法品阶: '绝世',
        功法描述: '至阳至刚的绝世内功。',
        修炼限制: { 悟性: 12, 根骨: 11 },
      },
    ]);
    emitWriteMock.mockReset();
    emitWriteMock.mockResolvedValue({
      version: 1,
      writeId: 'secret-write',
      source: 'frontend',
      operation: 'update',
      reason: 'test',
      eventName: 'era:transactionByObject',
      attribution: 'background',
      actions: { apiWrite: true },
      transactionId: 'test-transaction',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('资格满足时同一事务写入初窥门径并消耗最后一本秘籍', async () => {
    vi.mocked(globalThis.getVariables).mockResolvedValue({
      stat_data: {
        user数据: structuredClone(baseUserData),
      },
    });

    const result = await learnMartialArtFromSecret('九阳神功');

    expect(result).toMatchObject({
      success: true,
      artName: '九阳神功',
      itemName: '九阳神功',
      newCount: 0,
      rollback: {
        artName: '九阳神功',
        itemName: '九阳神功',
        originalItem: expect.objectContaining({ 类型: '秘籍', 数量: 1 }),
      },
    });
    expect(emitWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'era:transactionByObject',
        expectedAction: 'apiWrite',
        expectedTransactionId: expect.any(String),
        detail: {
          transactionId: expect.any(String),
          operations: [
            {
              type: 'insert',
              payload: {
                user数据: {
                  功法: {
                    九阳神功: { 掌握程度: '初窥门径' },
                  },
                },
              },
            },
            {
              type: 'delete',
              payload: {
                user数据: {
                  包裹: {
                    九阳神功: {},
                  },
                },
              },
            },
          ],
        },
      }),
    );
  });

  it('有多本秘籍时只扣减数量，不删除条目', async () => {
    const userData = structuredClone(baseUserData);
    userData.包裹.九阳神功.数量 = 2;
    vi.mocked(globalThis.getVariables).mockResolvedValue({ stat_data: { user数据: userData } });

    const result = await learnMartialArtFromSecret('九阳神功');

    expect(result.newCount).toBe(1);
    expect(emitWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          operations: expect.arrayContaining([
            {
              type: 'update',
              payload: {
                user数据: {
                  包裹: {
                    九阳神功: { 数量: 1 },
                  },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('执行时会重新校验，属性不足则不发事务', async () => {
    const userData = structuredClone(baseUserData);
    userData.初始属性.悟性 = 8;
    vi.mocked(globalThis.getVariables).mockResolvedValue({ stat_data: { user数据: userData } });

    const result = await learnMartialArtFromSecret('九阳神功');

    expect(result.success).toBe(false);
    expect(result.error).toContain('悟性不足');
    expect(emitWriteMock).not.toHaveBeenCalled();
  });

  it('执行时发现已经习得则不重复写入', async () => {
    const userData = structuredClone(baseUserData) as typeof baseUserData & { 功法: Record<string, unknown> };
    userData.功法 = { 九阳神功: { 掌握程度: '初窥门径' } };
    vi.mocked(globalThis.getVariables).mockResolvedValue({ stat_data: { user数据: userData } });

    const result = await learnMartialArtFromSecret('九阳神功');

    expect(result.success).toBe(false);
    expect(result.error).toContain('无需重复参悟');
    expect(emitWriteMock).not.toHaveBeenCalled();
  });

  it('撤销参悟会同一事务删除功法并恢复完整秘籍快照', async () => {
    await undoLearnMartialArtFromSecret({
      artName: '九阳神功',
      itemName: '九阳神功',
      originalItem: {
        类型: '秘籍',
        品阶: '绝世',
        物品描述: '秘籍。',
        数量: 1,
      },
    });

    expect(emitWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'era:transactionByObject',
        detail: {
          transactionId: expect.any(String),
          operations: [
            {
              type: 'delete',
              payload: {
                user数据: {
                  功法: {
                    九阳神功: {},
                  },
                },
              },
            },
            {
              type: 'insert',
              payload: {
                user数据: {
                  包裹: {
                    九阳神功: {
                      类型: '秘籍',
                      品阶: '绝世',
                      物品描述: '秘籍。',
                      数量: 1,
                    },
                  },
                },
              },
            },
          ],
        },
      }),
    );
  });
});
