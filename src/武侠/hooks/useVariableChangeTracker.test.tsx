import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVariableChangeTracker } from './useVariableChangeTracker';

const inlineAiBlock = '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>';
const extraAiBlock = '<VariableEdit>{"user数据":{"属性":{"根骨":70}}}</VariableEdit>';
const backgroundBlock = '<VariableEdit>{"前端变量":{"随机数":"随机数1: 8"}}</VariableEdit>';
const backgroundSamePathBlock = '<VariableEdit>{"user数据":{"修为":115}}</VariableEdit>';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const getVariablesMock = globalThis.getVariables as ReturnType<typeof vi.fn>;
const getChatMessagesMock = globalThis.getChatMessages as ReturnType<typeof vi.fn>;

describe('useVariableChangeTracker block/source model', () => {
  let currentStatData: Record<string, unknown>;
  let currentAssistantText: string;

  beforeEach(() => {
    currentStatData = { user数据: { 修为: 100 } };
    currentAssistantText = inlineAiBlock;
    window.sessionStorage.clear();

    getVariablesMock.mockImplementation(() => ({
      stat_data: clone(currentStatData),
    }));
    getChatMessagesMock.mockImplementation((messageId?: unknown) => {
      const assistant = {
        message_id: 2,
        role: 'assistant',
        message: currentAssistantText,
        swipes: [currentAssistantText],
        swipe_id: 0,
      };
      if (messageId === 2 || messageId === '0-{{lastMessageId}}') {
        return [clone(assistant)];
      }
      return [];
    });
  });

  it('inline 模式直接把正文模型变量块当作 AI 变量，并用 baseline/final 判定落地', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(inlineAiBlock);
    });

    currentStatData = { user数据: { 修为: 120 } };

    act(() => {
      result.current.handleVariableAssistantReply(inlineAiBlock, 2);
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toEqual([
      expect.objectContaining({ path: ['user数据', '修为'], value: 120 }),
    ]);
    expect(result.current.variableChanges?.aiReply.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        beforeValue: 100,
        afterValue: 120,
        origin: 'ai',
      }),
    ]);
    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        status: 'applied',
        expectedValue: 120,
        finalValue: 120,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
  });

  it('raw era:writeDone 不再做归因，只有统一带来源事件才记录后台变化', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
    });
    currentStatData = { user数据: { 修为: 110 } };

    act(() => {
      result.current.handleEraWriteDone({
        message_id: 2,
        actions: { apiWrite: true },
      });
    });
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'era-source-1',
        source: 'event-script',
        operation: 'update',
        reason: 'event-reward',
        eventName: 'era:updateByObject',
        attribution: 'background',
        message_id: 2,
        actions: { apiWrite: true },
      });
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        producer: 'event-script',
        reason: 'event-reward',
        beforeValue: 100,
        afterValue: 110,
      }),
    ]);
  });

  it('direct write 即使没有 assistant 变量块，也作为后台实际修改展示', () => {
    currentAssistantText = '纯正文';
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply('纯正文', 2);
    });

    currentStatData = { user数据: { 修为: 100, 银两: 50 } };

    act(() => {
      result.current.handleDirectVariableWriteDone({
        version: 1,
        writeId: 'direct-1',
        source: 'variable-editor',
        operation: 'update',
        reason: 'variable-editor-leaf-save',
      });
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '银两'],
        producer: 'variable-editor',
        reason: 'variable-editor-leaf-save',
        beforeValue: undefined,
        afterValue: 50,
      }),
    ]);
  });

  it('extra 模式把额外变量模型返回块当作 AI 变量，不因来源事件经过 frontend 而算后台', () => {
    currentAssistantText = '正文';
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply('正文', 2);
      result.current.handleVariableExtraDeclaredBlocks(extraAiBlock, 2);
    });

    currentStatData = {
      user数据: {
        修为: 100,
        属性: { 根骨: 70 },
      },
    };
    currentAssistantText = `正文\n${extraAiBlock}`;

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'extra-ai',
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        message_id: 2,
        actions: { apiWrite: true },
      });
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        path: ['user数据', '属性', '根骨'],
        status: 'applied',
        expectedValue: 70,
        finalValue: 70,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
  });

  it('最终楼层中排除 AI 块后剩余变量块属于后台，来源由包装层保留', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(inlineAiBlock);
    });

    currentStatData = { user数据: { 修为: 120 } };
    act(() => {
      result.current.handleVariableAssistantReply(inlineAiBlock, 2);
    });

    currentAssistantText = `${inlineAiBlock}\n${backgroundBlock}`;
    currentStatData = {
      user数据: { 修为: 120 },
      前端变量: { 随机数: '随机数1: 8' },
    };

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'event-bg',
        source: 'event-script',
        operation: 'update',
        reason: 'turn-event-settlement',
        eventName: 'era:updateByObject',
        attribution: 'background',
        message_id: 2,
        actions: { apiWrite: true },
      });
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.aiReply.comparisons[0]).toEqual(
      expect.objectContaining({ status: 'applied' }),
    );
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['前端变量', '随机数'],
        producer: 'event-script',
        reason: 'turn-event-settlement',
      }),
    ]);
  });

  it('同一路径在 AI 后又被后台修改：AI 看最终值判值不一致，后台保留精确 120→115', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(inlineAiBlock);
    });

    currentStatData = { user数据: { 修为: 120 } };
    act(() => {
      result.current.handleVariableAssistantReply(inlineAiBlock, 2);
    });

    currentStatData = { user数据: { 修为: 115 } };
    currentAssistantText = `${inlineAiBlock}\n${backgroundSamePathBlock}`;

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'event-same-path',
        source: 'event-script',
        operation: 'update',
        reason: 'event-cost',
        eventName: 'era:updateByObject',
        attribution: 'background',
        message_id: 2,
        actions: { apiWrite: true },
      });
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.aiReply.comparisons).toEqual([
      expect.objectContaining({
        status: 'diverged',
        baselineValue: 100,
        expectedValue: 120,
        finalValue: 115,
      }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        producer: 'event-script',
        beforeValue: 120,
        afterValue: 115,
      }),
    ]);
  });

  it('未经过来源包装但确实存在于最终楼层的剩余变量块，会以 ERA fallback 补入后台', () => {
    currentAssistantText = backgroundBlock;
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply('纯正文', 2);
    });

    currentStatData = {
      user数据: { 修为: 100 },
      前端变量: { 随机数: '随机数1: 8' },
    };

    act(() => {
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['前端变量', '随机数'],
        producer: 'unknown',
        reason: 'assistant-background-block',
        afterValue: '随机数1: 8',
      }),
    ]);
  });

  it('未经过包装且没有楼层变量块的最终实际变化，也不会丢失，会作为未知后台兜底', () => {
    currentAssistantText = '纯正文';
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply('纯正文', 2);
    });

    currentStatData = {
      user数据: { 修为: 100 },
      外部状态: { 标记: true },
    };

    act(() => {
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['外部状态', '标记'],
        producer: 'unknown',
        reason: 'unattributed-final-diff',
        afterValue: true,
      }),
    ]);
  });
});
