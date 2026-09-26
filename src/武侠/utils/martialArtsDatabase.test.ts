import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../test/setup';
import { setMartialArtsDatabase, upgradeMartialArt } from './martialArtsDatabase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyUpdate(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in target)) continue;
    if (isRecord(target[key]) && isRecord(value)) {
      applyUpdate(target[key] as Record<string, unknown>, value);
    } else {
      target[key] = structuredClone(value);
    }
  }
}

describe('upgradeMartialArt', () => {
  let variables: any;

  beforeEach(() => {
    setMartialArtsDatabase([
      {
        功法名称: '九阳神功',
        类型: '内功',
        功法品阶: '绝世',
        功法描述: '至阳至刚的绝世内功。',
        特性: {},
      },
    ]);
    variables = {
      stat_data: {
        user数据: {
          修为: 6084,
          功法: {
            九阳神功: {
              掌握程度: '初窥门径',
            },
          },
        },
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => structuredClone(variables));
    eventEmitMock.mockClear();
  });

  it('九阳神功6000修为精进以stat_data内部路径提交，并在写后确认实际落库', async () => {
    eventOn('era:transactionByObject', async ({ transactionId, operations }: any) => {
      for (const operation of operations) {
        if (operation.type === 'update') {
          applyUpdate(variables.stat_data, operation.payload);
        }
      }
      await eventEmit('era:writeDone', {
        transactionIds: [transactionId],
        actions: { apiWrite: true },
      });
    });

    const result = await upgradeMartialArt('九阳神功', '初窥门径', 6084, '绝世', 6);

    expect(result).toMatchObject({
      success: true,
      previousMastery: '初窥门径',
      newMastery: '略有小成',
      spentCultivation: 6000,
      newCultivation: 84,
    });
    expect(variables.stat_data.user数据.修为).toBe(84);
    expect(variables.stat_data.user数据.功法.九阳神功.掌握程度).toBe('略有小成');

    const transactionCalls = eventEmitMock.mock.calls.filter(([eventName]) => eventName === 'era:transactionByObject');
    expect(transactionCalls).toHaveLength(1);
    expect(transactionCalls[0][1]).toMatchObject({
      transactionId: expect.stringMatching(/^martial-art-upgrade-/),
      operations: [
        {
          type: 'update',
          payload: {
            user数据: {
              修为: 84,
              功法: {
                九阳神功: {
                  掌握程度: '略有小成',
                },
              },
            },
          },
        },
      ],
    });
    expect(transactionCalls[0][1].operations[0].payload).not.toHaveProperty('stat_data');
  });

  it('ERA只发完成信号但变量没有真正改变时不得返回假成功', async () => {
    eventOn('era:transactionByObject', async ({ transactionId }: any) => {
      await eventEmit('era:writeDone', {
        transactionIds: [transactionId],
        actions: { apiWrite: true },
      });
    });

    const result = await upgradeMartialArt('九阳神功', '初窥门径', 6084, '绝世', 6);

    expect(result.success).toBe(false);
    expect(result.error).toContain('写后校验失败');
    expect(variables.stat_data.user数据.修为).toBe(6084);
    expect(variables.stat_data.user数据.功法.九阳神功.掌握程度).toBe('初窥门径');
  });

  it('点击后持久化修为已变化时拒绝使用旧UI报价提交', async () => {
    variables.stat_data.user数据.修为 = 6083;

    const result = await upgradeMartialArt('九阳神功', '初窥门径', 6084, '绝世', 6);

    expect(result.success).toBe(false);
    expect(result.error).toContain('状态已经变化');
    expect(eventEmitMock.mock.calls.filter(([eventName]) => eventName === 'era:transactionByObject')).toHaveLength(0);
  });
});
