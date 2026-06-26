import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVariableChangeTracker } from './useVariableChangeTracker';

const declaredReply = '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>';
const backendOnlyReply = '<VariableEdit>{"user数据":{"属性":{"臂力":80}}}</VariableEdit>';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
});
