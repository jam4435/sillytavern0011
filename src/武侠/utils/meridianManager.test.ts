import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventEmitMock } from '../test/setup';
import type { InitialAttributes } from '../types';
import { upgradeMeridianNode } from './meridianManager';
import { quoteMeridianUpgrade } from './meridianSystem';

const initialAttributes: InitialAttributes = {
  臂力: 10,
  根骨: 10,
  机敏: 10,
  悟性: 10,
  洞察: 10,
  风姿: 10,
  福缘: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyInsert(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in target)) {
      target[key] = structuredClone(value);
    } else if (isRecord(target[key]) && isRecord(value)) {
      applyInsert(target[key] as Record<string, unknown>, value);
    }
  }
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

describe('upgradeMeridianNode', () => {
  let variables: any;

  beforeEach(() => {
    variables = {
      stat_data: {
        user数据: {
          境界: '不入流',
          修为: 100,
          初始属性: structuredClone(initialAttributes),
        },
        前端变量: { 其他字段: { 保留: true } },
      },
    };
    vi.mocked(globalThis.getVariables).mockImplementation(() => structuredClone(variables));
    eventEmitMock.mockClear();
  });

  function installSuccessfulEraTransaction(): void {
    eventOn('era:transactionByObject', async ({ transactionId, operations }: any) => {
      for (const operation of operations) {
        if (operation.type === 'insert') applyInsert(variables.stat_data, operation.payload);
        if (operation.type === 'update') applyUpdate(variables.stat_data, operation.payload);
      }
      await eventEmit('era:writeDone', {
        transactionIds: [transactionId],
        actions: { apiWrite: true },
      });
    });
  }

  const openingQuote = () =>
    quoteMeridianUpgrade({
      progress: variables.stat_data.前端变量.奇经八脉,
      nodeId: 'ren:opening',
      realm: variables.stat_data.user数据.境界,
      cultivation: variables.stat_data.user数据.修为,
      initialAttributes,
    });

  it('旧档首次冲穴以一次 ERA 事务扣修为、插入进度且保留其他前端变量', async () => {
    installSuccessfulEraTransaction();

    const result = await upgradeMeridianNode('ren:opening', openingQuote());

    expect(result.success).toBe(true);
    expect(variables.stat_data.user数据.修为).toBe(60);
    expect(variables.stat_data.前端变量.奇经八脉).toEqual(result.progress);
    expect(variables.stat_data.前端变量.其他字段).toEqual({ 保留: true });
    const transactionCalls = eventEmitMock.mock.calls.filter(([eventName]) => eventName === 'era:transactionByObject');
    expect(transactionCalls).toHaveLength(1);
    expect(transactionCalls[0][1]).toMatchObject({
      transactionId: expect.stringMatching(/^meridian-/),
      operations: [
        { type: 'update', payload: { user数据: { 修为: 60 } } },
        { type: 'insert', payload: { 前端变量: { 奇经八脉: result.progress } } },
      ],
    });
  });

  it('同一穴位双击共享在途事务，只扣除一次', async () => {
    installSuccessfulEraTransaction();
    const quote = openingQuote();

    const first = upgradeMeridianNode('ren:opening', quote);
    const second = upgradeMeridianNode('ren:opening', quote);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    expect(variables.stat_data.user数据.修为).toBe(60);
    expect(eventEmitMock.mock.calls.filter(([eventName]) => eventName === 'era:transactionByObject')).toHaveLength(1);
  });

  it('确认后报价变化时取消提交并要求重新确认', async () => {
    const quote = openingQuote();
    variables.stat_data.user数据.修为 = 99;

    await expect(upgradeMeridianNode('ren:opening', quote)).rejects.toThrow('报价已经变化');
    expect(eventEmitMock.mock.calls.filter(([eventName]) => eventName === 'era:transactionByObject')).toHaveLength(0);
  });

  it('关窍在同一事务中同步写入初始属性与实际结算', async () => {
    variables.stat_data.user数据.修为 = 200;
    variables.stat_data.前端变量.奇经八脉 = {
      版本: 1,
      已通穴位: ['ren:opening', 'ren:circulation', 'ren:condensation', 'ren:cycle'],
      关窍结算: {},
    };
    installSuccessfulEraTransaction();
    const quote = quoteMeridianUpgrade({
      progress: variables.stat_data.前端变量.奇经八脉,
      nodeId: 'ren:confluence',
      realm: '不入流',
      cultivation: 200,
      initialAttributes,
    });

    const result = await upgradeMeridianNode('ren:confluence', quote);

    expect(variables.stat_data.user数据.修为).toBe(15);
    expect(variables.stat_data.user数据.初始属性.根骨).toBe(11);
    expect(variables.stat_data.前端变量.奇经八脉.关窍结算['ren:confluence']).toEqual({
      类型: '初始属性',
      属性: '根骨',
      增量: 1,
    });
    expect(result.settlement).toEqual({ 类型: '初始属性', 属性: '根骨', 增量: 1 });
  });

  it('完成信号超时后只刷新对账，不自动重放事务', async () => {
    vi.useFakeTimers();
    eventOn('era:transactionByObject', () => undefined);

    const upgrade = upgradeMeridianNode('ren:opening', openingQuote());
    const rejection = expect(upgrade).rejects.toThrow('结果暂时未知');
    await vi.advanceTimersByTimeAsync(10_100);

    await rejection;
    expect(eventEmitMock.mock.calls.filter(([eventName]) => eventName === 'era:transactionByObject')).toHaveLength(1);
    expect(eventEmitMock.mock.calls.some(([eventName]) => eventName === 'manual_sync')).toBe(true);
  });
});
