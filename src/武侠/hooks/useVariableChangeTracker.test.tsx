import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVariableChangeTracker } from './useVariableChangeTracker';

const declaredReply = '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>';
const timeDeclaredReply = '<VariableEdit>{"世界信息":{"时间":{"时":14}}}</VariableEdit>';
const extraDeclaredReply = '<VariableEdit>{"user数据":{"属性":{"根骨":70}}}</VariableEdit>';
const backendOnlyReply = '<VariableEdit>{"user数据":{"属性":{"臂力":80}}}</VariableEdit>';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const createNumberMap = (count: number, value: number): Record<string, number> =>
  Object.fromEntries(Array.from({ length: count }, (_, index) => [`attr${index}`, value]));

const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;

describe('useVariableChangeTracker', () => {
  let currentStatData: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    currentStatData = { user数据: { 修为: 100 } };

    getVariablesMock.mockImplementation(() => ({
      stat_data: clone(currentStatData),
    }));
    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === 2 || messageId === '0-{{lastMessageId}}') {
        return [{ message_id: 2, message: declaredReply, swipes: [], swipe_id: 0 }];
      }
      return [];
    });
  });

  it('直接写入始终归入后台并保留具体来源', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleDirectVariableWriteDone({
        version: 1,
        writeId: 'direct-1',
        source: 'variable-editor',
        operation: 'update',
        reason: 'variable-editor-leaf-save',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'variable-editor',
        origin: 'background',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
  });

  it('世界时间声明能从最终快照识别为已落地', () => {
    currentStatData = { 世界信息: { 时间: { 时: 13 } } };
    getVariablesMock.mockImplementation(() => clone(currentStatData));

    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(timeDeclaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = { 世界信息: { 时间: { 时: 14 } } };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        path: ['世界信息', '时间', '时'],
        beforeValue: 13,
        afterValue: 14,
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        status: 'applied',
        path: ['世界信息', '时间', '时'],
        expectedValue: 14,
        finalValue: 14,
      }),
    ]);
  });

  it('消息边界先到、ERA 后到时只保留一份差分并升级为 AI', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleVariableAssistantReply(declaredReply, 2);
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'message-boundary',
        origin: 'background',
      }),
    ]);

    act(() => {
      result.current.markVariableApiWriteAsAi(2);
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'era',
        origin: 'ai',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.actualChanges).toHaveLength(1);
  });

  it('assistant 目标在写入后才解析到时，会把消息补偿批次回提为 AI', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleVariableAssistantReply(declaredReply, 2);
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'message-boundary',
        origin: 'background',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);

    act(() => {
      result.current.markVariableApiWriteAsAi(2);
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'message-boundary',
        origin: 'ai',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
  });

  it('raw ERA 在 assistant 目标确认前先到时，会把匹配声明的 ERA 批次回提为 AI', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      // 实际 inline 时序：先拿到正文声明，但 assistant 楼层 ID 此时尚未解析出来。
      result.current.handleVariableAssistantReply(declaredReply);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      // createChatMessages 触发 ERA resync，writeDone 会早于 onVariableAiWriteTarget。
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { resync: true },
        reason: 'inline-assistant-resync',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'era',
        origin: 'background',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);

    act(() => {
      // 楼层创建完成后才确认它就是本轮 AI 写入目标。
      result.current.markVariableApiWriteAsAi(2);
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'message-boundary',
        origin: 'ai',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        status: 'applied',
        expectedValue: 120,
        finalValue: 120,
      }),
    ]);
  });

  it('声明晚于 resync 到达时会立即认领已发生的 AI 差分', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      // assistant 楼层已经确认，但 extra 变量声明还没有登记。
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = {
      user数据: { 修为: 120 },
      前端变量: { 随机数: 'old' },
    };

    act(() => {
      // 追加变量块触发的 resync 先把修为变化观察成后台。
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { resync: true },
        reason: 'append-extra-blocks-resync',
      });
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['user数据', '修为'],
          beforeValue: 100,
          afterValue: 120,
        }),
      ]),
    );

    act(() => {
      result.current.handleVariableExtraDeclaredBlocks(declaredReply, 2);
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        origin: 'ai',
        producer: 'frontend',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(
      result.current.variableChanges?.background.observedChanges
        .some(change => change.path.join('.') === 'user数据.修为'),
    ).toBe(false);
    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        status: 'applied',
        expectedValue: 120,
        finalValue: 120,
      }),
    ]);
  });

  it('sourced AI 到达时即使快照又前进，也会先跨批次认领旧 AI 差分', () => {
    currentStatData = {
      user数据: { 修为: 100 },
      前端变量: { 随机数: 'old' },
    };
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
    });

    currentStatData = {
      user数据: { 修为: 120 },
      前端变量: { 随机数: 'old' },
    };

    act(() => {
      // 目标尚未登记，因此先暂记为后台。
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { resync: true },
        reason: 'early-resync',
      });
    });

    // 在 sourced AI 通知到达前，又发生一笔无关前端变化，但 tracker 尚未捕获。
    currentStatData = {
      user数据: { 修为: 120 },
      前端变量: { 随机数: 'new' },
    };

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'late-ai-after-new-snapshot',
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        message_id: 2,
        actions: { apiWrite: true },
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        origin: 'ai',
        producer: 'frontend',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['前端变量', '随机数'],
          beforeValue: 'old',
          afterValue: 'new',
        }),
      ]),
    );
    expect(result.current.variableChanges?.aiReply.comparisons[0]).toEqual(
      expect.objectContaining({
        status: 'applied',
        expectedValue: 120,
        finalValue: 120,
      }),
    );
  });

  it('无 messageId 的 sourced background 不会把已确认 AI 批次降级成后台', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toHaveLength(1);

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'unrelated-background-without-message',
        source: 'frontend',
        operation: 'update',
        reason: 'summary-write',
        eventName: 'era:updateByObject',
        attribution: 'background',
        actions: { apiWrite: true },
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        origin: 'ai',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.aiReply.comparisons[0]).toEqual(
      expect.objectContaining({ status: 'applied' }),
    );
  });

  it('重复通知和相同快照不会重复计数', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleDirectVariableWriteDone({
        version: 1,
        writeId: 'direct-1',
        source: 'event-script',
        operation: 'update',
        reason: 'event-script-write',
      });
      result.current.handleDirectVariableWriteDone({
        version: 1,
        writeId: 'direct-1',
        source: 'event-script',
        operation: 'update',
        reason: 'event-script-write',
      });
    });

    expect(result.current.variableChanges?.background.observedChanges).toHaveLength(1);
    expect(result.current.variableChanges?.batches).toHaveLength(1);
  });

  it('AI 写入后被事件脚本覆盖时两边各保留一条', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    currentStatData = { user数据: { 修为: 80 } };

    act(() => {
      result.current.handleDirectVariableWriteDone({
        version: 1,
        writeId: 'direct-2',
        source: 'event-script',
        operation: 'update',
        reason: 'event-script-override',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toHaveLength(1);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'event-script',
        beforeValue: 120,
        afterValue: 80,
      }),
    ]);
  });

  it('AI 实际计数只包含匹配声明的叶子，不吞掉大量后台溢出 diff', () => {
    currentStatData = {
      user数据: {
        属性: createNumberMap(150, 0),
        修为: 100,
      },
    };
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = {
      user数据: {
        属性: createNumberMap(150, 1),
        修为: 120,
      },
    };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        origin: 'ai',
        producer: 'era',
        path: ['user数据', '修为'],
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.omittedObservedCount).toBe(0);
    expect(result.current.variableChanges?.background.observedChanges).toHaveLength(100);
    expect(result.current.variableChanges?.background.omittedObservedCount).toBe(50);
    expect(result.current.variableChanges?.batches).toEqual([
      expect.objectContaining({
        origin: 'ai',
        changeCount: 1,
      }),
      expect.objectContaining({
        origin: 'background',
        changeCount: 150,
      }),
    ]);
  });

  it('era:writeDone 早于聊天变量刷新时会延迟补读', async () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'delayed-era-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toHaveLength(0);

    currentStatData = { user数据: { 修为: 120 } };

    await act(async () => {
      vi.advanceTimersByTime(40);
      await Promise.resolve();
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'era',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
  });

  it('显式 AI ERA 来源会保留 AI 归因并升级为真实 producer', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'era',
        origin: 'ai',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'era-source-ai-1',
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        message_id: 2,
        actions: { apiWrite: true },
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'frontend',
        origin: 'ai',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
  });

  it('额外变量 sourced AI 可以把先到的 raw ERA 后台批次提升为 AI', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableExtraDeclaredBlocks(declaredReply, 2);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'extra-variable-api-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'era',
        origin: 'background',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        status: 'not-applied',
        expectedValue: 120,
        finalValue: 120,
      }),
    ]);

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'extra-source-ai-1',
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        message_id: 2,
        actions: { apiWrite: true },
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'frontend',
        origin: 'ai',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        status: 'applied',
        expectedValue: 120,
        finalValue: 120,
      }),
    ]);
  });

  it('sourced AI 会跨多个后台批次认领匹配声明，保留无关后台变化', () => {
    const mixedDeclaredReply = [
      '<VariableEdit>{"世界信息":{"时间":{"年":1201,"月":4,"日":2,"时":13,"分":5}},"user数据":{"关系网":{"韩小莹":69}}}</VariableEdit>',
      '<VariableInsert>{"user数据":{"人物经历":{"射雕第二回03-车厢寻凉":"记录"}}}</VariableInsert>',
    ].join('\n');

    currentStatData = {
      世界信息: { 时间: { 年: 1201, 月: 4, 日: 2, 时: 13, 分: 0 } },
      前端变量: { 随机数: '1,7,8,7,6' },
      user数据: {
        关系网: { 韩小莹: 68 },
        人物经历: {},
      },
    };

    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableExtraDeclaredBlocks(mixedDeclaredReply, 2);
    });

    // 第一批：消息边界先观察到随机数和关系网变化，都会暂记为后台。
    currentStatData = {
      世界信息: { 时间: { 年: 1201, 月: 4, 日: 2, 时: 13, 分: 0 } },
      前端变量: { 随机数: '3,7,9,5,3' },
      user数据: {
        关系网: { 韩小莹: 69 },
        人物经历: {},
      },
    };
    act(() => {
      result.current.handleVariableMessageBoundary(2);
    });

    // 第二批：raw ERA 又观察到时间与人物经历写入，仍先记作后台。
    currentStatData = {
      世界信息: { 时间: { 年: 1201, 月: 4, 日: 2, 时: 13, 分: 5 } },
      前端变量: { 随机数: '3,7,9,5,3' },
      user数据: {
        关系网: { 韩小莹: 69 },
        人物经历: { '射雕第二回03-车厢寻凉': '记录' },
      },
    };
    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'extra-variable-api-write',
      });
    });

    expect(result.current.variableChanges?.background.observedChanges).toHaveLength(4);

    // 最终 sourced AI 信号必须跨批次把所有与声明吻合的差分认领回来。
    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'extra-source-ai-mixed',
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        message_id: 2,
        actions: { apiWrite: true },
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['user数据', '关系网', '韩小莹'],
          origin: 'ai',
          producer: 'frontend',
          beforeValue: 68,
          afterValue: 69,
        }),
        expect.objectContaining({
          path: ['世界信息', '时间', '分'],
          origin: 'ai',
          producer: 'frontend',
          beforeValue: 0,
          afterValue: 5,
        }),
        expect.objectContaining({
          path: ['user数据', '人物经历', '射雕第二回03-车厢寻凉'],
          origin: 'ai',
          producer: 'frontend',
          beforeValue: undefined,
          afterValue: '记录',
        }),
      ]),
    );
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['前端变量', '随机数'],
        beforeValue: '1,7,8,7,6',
        afterValue: '3,7,9,5,3',
      }),
    ]);
    expect(
      result.current.variableChanges?.aiReply.comparisons
        .filter(item => item.declaredChange)
        .every(item => item.status === 'applied' || item.status === 'no-op'),
    ).toBe(true);
  });

  it('显式后台 ERA 来源可以把已归入 AI 的批次纠正回后台', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toHaveLength(1);

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'era-source-1',
        source: 'frontend',
        operation: 'update',
        reason: 'summary-write',
        eventName: 'era:apiWrite',
        attribution: 'background',
        message_id: 2,
        actions: { apiWrite: true },
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'frontend',
        origin: 'background',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
  });

  it('缺失 attribution 的 legacy sourced ERA 仍按后台处理并覆盖普通 era 的笼统 producer', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'extra-variable-api-write',
      });
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'era',
      }),
    ]);

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'era-source-2',
        source: 'frontend',
        operation: 'update',
        reason: 'summary-write',
        eventName: 'era:apiWrite',
        message_id: 2,
        actions: { apiWrite: true },
      });
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'frontend',
      }),
    ]);
  });

  it('普通消息边界不会把已确认的 AI 批次降级成后台', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = { user数据: { 修为: 120 } };
    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toHaveLength(1);

    act(() => {
      result.current.handleVariableMessageBoundary(2);
    });

    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        origin: 'ai',
        producer: 'era',
        beforeValue: 100,
        afterValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
  });

  it('后台写入碰巧达到 AI 目标值时比较仍标记为未落地', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
    });

    currentStatData = { user数据: { 修为: 120 } };
    act(() => {
      result.current.handleDirectVariableWriteDone({
        version: 1,
        writeId: 'background-target-match',
        source: 'event-script',
        operation: 'update',
        reason: 'event-script-write',
      });
    });

    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        status: 'not-applied',
        expectedValue: 120,
        finalValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toHaveLength(1);
  });

  it('同一路径多次声明只保留最后一次作为最终意图', () => {
    const repeatedReply = [
      '<VariableEdit>{"user数据":{"修为":110}}</VariableEdit>',
      '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>',
    ].join('\n');
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(repeatedReply, 2);
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        value: 120,
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.comparisons).toHaveLength(1);
  });

  it('切换 swipe 后以 active swipe 为准并清掉旧 swipe 的声明与差分', async () => {
    const swipeReply = '<VariableEdit>{"user数据":{"修为":90}}</VariableEdit>';
    let activeSwipe = 0;
    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === 2 || messageId === '0-{{lastMessageId}}') {
        return [{
          message_id: 2,
          message: declaredReply,
          swipes: [declaredReply, swipeReply],
          swipe_id: activeSwipe,
        }];
      }
      return [];
    });

    const { result } = renderHook(() => useVariableChangeTracker());
    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });

    currentStatData = { user数据: { 修为: 120 } };
    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });
    expect(result.current.variableChanges?.aiReply.observedChanges[0]).toEqual(
      expect.objectContaining({ afterValue: 120 }),
    );

    activeSwipe = 1;
    currentStatData = { user数据: { 修为: 90 } };
    act(() => {
      result.current.handleVariableMessageBoundary(2, { replaceAssistantReply: true });
    });
    await act(async () => {
      vi.advanceTimersByTime(40);
      await Promise.resolve();
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        value: 90,
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        beforeValue: 100,
        afterValue: 90,
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.observedChanges).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ afterValue: 120 })]),
    );
  });

  it('校订最新回复后会重建声明与净变化，不沿用保存前的声明', () => {
    const revisedReply = '<VariableEdit>{"user数据":{"修为":80}}</VariableEdit>';
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
    });
    currentStatData = { user数据: { 修为: 120 } };
    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'era-api-write',
      });
    });

    currentStatData = { user数据: { 修为: 80 } };
    act(() => {
      result.current.handleVariableAssistantRevision(revisedReply, 2);
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        value: 80,
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        beforeValue: 100,
        afterValue: 80,
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.comparisons[0]).toEqual(
      expect.objectContaining({
        status: 'applied',
        expectedValue: 80,
        finalValue: 80,
      }),
    );
  });

  it('主回复声明已记录后，消息边界不会再用最终 assistant 原文覆盖它', () => {
    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === 2 || messageId === '0-{{lastMessageId}}') {
        return [{
          message_id: 2,
          message: `${declaredReply}\n${backendOnlyReply}`,
          swipes: [],
          swipe_id: 0,
        }];
      }
      return [];
    });

    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.handleVariableMessageBoundary(2);
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toHaveLength(1);
    expect(result.current.variableChanges?.aiReply.declaredChanges[0]).toEqual(
      expect.objectContaining({
        path: ['user数据', '修为'],
      }),
    );
  });

  it('主回复声明冻结后，普通 era:writeDone 不会把后台追加块吸进 AI 声明', () => {
    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === 2 || messageId === '0-{{lastMessageId}}') {
        return [{
          message_id: 2,
          message: `${declaredReply}\n${backendOnlyReply}`,
          swipes: [],
          swipe_id: 0,
        }];
      }
      return [];
    });

    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.markVariableApiWriteAsAi(2);
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
        reason: 'martial-arts-completion',
      });
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toHaveLength(1);
    expect(result.current.variableChanges?.aiReply.declaredChanges[0]).toEqual(
      expect.objectContaining({
        path: ['user数据', '修为'],
      }),
    );
  });

  it('额外变量 blocksText 会与主回复声明合并，且最终楼层后台块不会污染 AI 声明', () => {
    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === 2 || messageId === '0-{{lastMessageId}}') {
        return [{
          message_id: 2,
          message: `${declaredReply}\n${extraDeclaredReply}\n${backendOnlyReply}`,
          swipes: [],
          swipe_id: 0,
        }];
      }
      return [];
    });

    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(declaredReply, 2);
      result.current.handleVariableExtraDeclaredBlocks(extraDeclaredReply, 2);
      result.current.handleVariableMessageBoundary(2);
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toEqual([
      expect.objectContaining({ path: ['user数据', '修为'] }),
      expect.objectContaining({ path: ['user数据', '属性', '根骨'] }),
    ]);
  });

  it('没有显式声明源时，消息边界仍允许用最终 assistant 原文做 legacy fallback', () => {
    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      if (messageId === 2 || messageId === '0-{{lastMessageId}}') {
        return [{
          message_id: 2,
          message: `${declaredReply}\n${backendOnlyReply}`,
          swipes: [],
          swipe_id: 0,
        }];
      }
      return [];
    });

    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableMessageBoundary(2);
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toEqual([
      expect.objectContaining({ path: ['user数据', '修为'] }),
      expect.objectContaining({ path: ['user数据', '属性', '臂力'] }),
    ]);
  });
});
