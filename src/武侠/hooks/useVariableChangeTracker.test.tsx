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
