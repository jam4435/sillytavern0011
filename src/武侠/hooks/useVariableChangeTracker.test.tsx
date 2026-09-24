import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVariableChangeTracker } from './useVariableChangeTracker';

const inlineAiBlock = '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>';
const extraAiBlock = '<VariableEdit>{"user数据":{"属性":{"根骨":70}}}</VariableEdit>';
const backgroundBlock = '<VariableEdit>{"外部状态":{"标记":true}}</VariableEdit>';
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

  it('sourced event 只记录本次 writer 自己的 diff，不吸收同时存在的其他全局变化', () => {
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
    });

    currentStatData = { user数据: { 修为: 120 } };
    act(() => {
      result.current.handleVariableAssistantReply(inlineAiBlock, 2);
    });

    currentStatData = {
      user数据: { 修为: 115 },
      外部状态: { 标记: true },
    };

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'event-own-diff',
        source: 'event-script',
        operation: 'update',
        reason: 'event-cost',
        eventName: 'era:updateByObject',
        attribution: 'background',
        message_id: 2,
        actions: { apiWrite: true },
        changes: [
          {
            action: 'edit',
            path: ['user数据', '修为'],
            beforeValue: 120,
            afterValue: 115,
          },
        ],
      });
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        producer: 'event-script',
        reason: 'event-cost',
        beforeValue: 120,
        afterValue: 115,
      }),
    ]);
  });

  it('来源明确的纯派生缓存不会进入后台变量条，真实变量仍保留', () => {
    currentAssistantText = '纯正文';
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply('纯正文', 2);
    });

    currentStatData = {
      user数据: { 修为: 100, 银两: 50 },
      前端变量: {
        战力区: 'new-zone',
        当前地点信息: { 严格活动区: '大宋/终南山/重阳宫' },
      },
    };

    act(() => {
      result.current.handleDirectVariableWriteDone({
        version: 1,
        writeId: 'derived-and-real',
        source: 'frontend',
        operation: 'update',
        reason: 'frontend-derived-variable-sync',
        changes: [
          {
            action: 'insert',
            path: ['前端变量', '战力区'],
            beforeValue: undefined,
            afterValue: 'new-zone',
          },
          {
            action: 'insert',
            path: ['前端变量', '当前地点信息', '严格活动区'],
            beforeValue: undefined,
            afterValue: '大宋/终南山/重阳宫',
          },
          {
            action: 'insert',
            path: ['user数据', '银两'],
            beforeValue: undefined,
            afterValue: 50,
          },
        ],
      });
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '银两'],
        producer: 'frontend',
        afterValue: 50,
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
      result.current.handleVariableTurnStart('extra');
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
        changes: [
          {
            action: 'edit',
            path: ['user数据', '修为'],
            beforeValue: 120,
            afterValue: 115,
          },
        ],
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
      外部状态: { 标记: true },
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
        path: ['外部状态', '标记'],
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

  it('最终楼层 fallback 使用真实 AI checkpoint，而不是把 AI 声明值伪装成实际 before', () => {
    currentAssistantText = `${inlineAiBlock}\n${backgroundSamePathBlock}`;
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      // AI 声明修为 120，但当前 stat_data 仍是 baseline=100，模拟 AI 声明没有实际落地。
      result.current.handleVariableAssistantReply(inlineAiBlock, 2);
    });

    currentStatData = { user数据: { 修为: 115 } };

    act(() => {
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        producer: 'unknown',
        reason: 'assistant-background-block',
        beforeValue: 100,
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
      外部状态: { 标记: true },
    };

    act(() => {
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['外部状态', '标记'],
        producer: 'unknown',
        reason: 'assistant-background-block',
        afterValue: true,
      }),
    ]);
  });

  it('最终快照中的纯派生缓存变化也不会作为未知后台兜底', () => {
    currentAssistantText = '纯正文';
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply('纯正文', 2);
    });

    currentStatData = {
      user数据: { 修为: 100 },
      前端变量: {
        战力区: 'new-zone',
        修为变化参考: 42,
      },
    };

    act(() => {
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
    expect(result.current.variableChanges?.actualChanges).toEqual([]);
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

  it('回合 settled 后的准备性 direct 写入不会污染上一回变量条', () => {
    currentAssistantText = '纯正文';
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply('纯正文', 2);
      result.current.handleVariableTurnSettled(2);
    });

    currentStatData = {
      user数据: { 修为: 100 },
      前端变量: { 战力区: 'late-zone' },
    };

    act(() => {
      result.current.handleDirectVariableWriteDone({
        version: 1,
        writeId: 'late-prep',
        source: 'frontend',
        operation: 'update',
        reason: 'frontend-derived-variable-sync',
      });
    });

    expect(result.current.variableChanges?.status).toBe('settled');
    expect(result.current.variableChanges?.background.observedChanges).toEqual([]);
  });


  it('extra 模式即使变量模型返回 0 个动作，也不会退回把正文变量块认成 AI', () => {
    const accidentalMainBlock = '<VariableEdit>{"user数据":{"修为":130}}</VariableEdit>';
    currentAssistantText = accidentalMainBlock;
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleVariableTurnStart('extra');
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(accidentalMainBlock, 2);
      result.current.handleVariableExtraDeclaredBlocks('', 2);
    });

    currentStatData = { user数据: { 修为: 130 } };

    act(() => {
      result.current.handleVariableTurnSettled(2);
    });

    expect(result.current.variableChanges?.aiReply.declaredChanges).toEqual([]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual([
      expect.objectContaining({
        path: ['user数据', '修为'],
        producer: 'unknown',
        reason: 'assistant-background-block',
        beforeValue: 100,
        afterValue: 130,
      }),
    ]);
  });

  it('extra 模式只认额外变量模型块为 AI，正文中意外变量块按最终剩余块处理', () => {
    const accidentalMainBlock = '<VariableEdit>{"user数据":{"修为":130}}</VariableEdit>';
    currentAssistantText = `正文\n${accidentalMainBlock}\n${extraAiBlock}`;
    const { result } = renderHook(() => useVariableChangeTracker());

    act(() => {
      result.current.handleVariableTurnStart('extra');
      result.current.handleGlobalMessageSent(1);
      result.current.handleVariableAssistantReply(accidentalMainBlock, 2);
      result.current.handleVariableExtraDeclaredBlocks(extraAiBlock, 2);
    });

    currentStatData = {
      user数据: {
        修为: 130,
        属性: { 根骨: 70 },
      },
    };

    act(() => {
      result.current.handleEraVariableWriteDone({
        version: 1,
        writeId: 'extra-ai-only',
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

    expect(result.current.variableChanges?.aiReply.declaredChanges).toEqual([
      expect.objectContaining({ path: ['user数据', '属性', '根骨'], value: 70 }),
    ]);
    expect(result.current.variableChanges?.background.observedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['user数据', '修为'],
          producer: 'unknown',
          reason: 'assistant-background-block',
          afterValue: 130,
        }),
      ]),
    );
  });

});
