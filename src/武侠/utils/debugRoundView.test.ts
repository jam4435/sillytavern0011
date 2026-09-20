import { describe, expect, it } from 'vitest';
import type { LatestDebugRound } from '../hooks/useDebugLogs';
import {
  buildMainInputDebugContent,
  buildVariableInputDebugContent,
  buildVariableOutputDebugContent,
  getDebugStageStatusLabel,
  shouldShowVariableDebug,
} from './debugRoundView';

function createDebugRound(): LatestDebugRound {
  return {
    id: 'debug-round',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    main: {
      status: 'success',
      userInput: '用户输入',
      combinedPrompt: '组合提示词',
      output: '正文输出',
    },
    variable: {
      status: 'idle',
      trigger: '',
      modeSnapshot: '',
      skipReason: '',
      input: '',
      output: '',
      appendedBlocks: '',
      finalMessageText: '',
      appendReadbackText: '',
      appendVerification: '',
      syncReadbackText: '',
      syncVerification: '',
    },
  };
}

describe('debugRoundView', () => {
  it('skipped 状态会生成分支决策和跳过原因文本', () => {
    const debugRound = createDebugRound();
    debugRound.variable = {
      ...debugRound.variable,
      status: 'skipped',
      trigger: 'regenerate',
      modeSnapshot: 'inline',
      skipReason: '本轮模式快照为 inline，跳过额外变量更新。',
    };

    expect(shouldShowVariableDebug(debugRound)).toBe(true);
    expect(buildVariableInputDebugContent(debugRound)).toContain('触发入口：重新生成');
    const output = buildVariableOutputDebugContent(debugRound);
    expect(output).toContain('【分支决策】');
    expect(output).toContain('执行判断：跳过额外变量更新');
    expect(output).toContain('【跳过原因】');
    expect(output).toContain('inline');
  });

  it('success 状态仍保留原始返回与合法变量块展示', () => {
    const debugRound = createDebugRound();
    debugRound.variable = {
      ...debugRound.variable,
      status: 'success',
      trigger: 'send',
      modeSnapshot: 'extra',
      input: '额外提示词',
      output: '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>',
      appendedBlocks: '<VariableEdit>\n{\n  "user数据": {\n    "修为": 120\n  }\n}\n</VariableEdit>',
      appendVerification: '写入后通过',
      syncVerification: '同步后通过',
    };

    const output = buildVariableOutputDebugContent(debugRound);
    expect(output).toContain('【原始返回】');
    expect(output).toContain('【合法变量块】');
    expect(output).toContain('【写入后回读验证】');
    expect(getDebugStageStatusLabel('skipped')).toBe('已跳过');
  });

  it('额外变量输出只展示变量模型与校验信息，不泄露楼层正文全文', () => {
    const debugRound = createDebugRound();
    debugRound.variable = {
      ...debugRound.variable,
      status: 'error',
      trigger: 'send',
      modeSnapshot: 'extra',
      output: '<VariableThink>只需更新修为</VariableThink>',
      appendedBlocks: '<VariableEdit>{"user数据":{"修为":120}}</VariableEdit>',
      appendVerification: '写入后通过',
      syncVerification: '同步后通过',
      applyStatus: 'success',
      applyVerification: '修为=120',
      appendReadbackText: '这是完整剧情正文，不应出现在额外变量输出\n<VariableEdit>{}</VariableEdit>',
      syncReadbackText: '这是 ERA 同步后的完整剧情正文，也不应展示',
      finalMessageText: '最终楼层完整正文绝不能展示',
      error: '测试错误',
    };

    const output = buildVariableOutputDebugContent(debugRound);
    expect(output).toContain('【原始返回】');
    expect(output).toContain('【合法变量块】');
    expect(output).toContain('【写入后回读验证】');
    expect(output).toContain('【ERA 楼层同步后回读验证】');
    expect(output).toContain('【变量快照验证】');
    expect(output).toContain('【错误】');
    expect(output).not.toContain('这是完整剧情正文');
    expect(output).not.toContain('这是 ERA 同步后的完整剧情正文');
    expect(output).not.toContain('最终楼层完整正文绝不能展示');
    expect(output).not.toContain('【写入后回读文本】');
    expect(output).not.toContain('【ERA 同步后回读文本】');
    expect(output).not.toContain('【最终楼层文本】');
  });

  it('正文和额外变量调试都展示 429 重试次数与最近等待', () => {
    const debugRound = createDebugRound();
    debugRound.main.retry429Count = 2;
    debugRound.main.retry429LastDelayMs = 2_000;
    debugRound.variable.retry429Count = 1;
    debugRound.variable.retry429LastDelayMs = 1_000;

    expect(buildMainInputDebugContent(debugRound)).toContain('已重试：2 次');
    expect(buildMainInputDebugContent(debugRound)).toContain('最近等待：2000ms');
    expect(buildVariableOutputDebugContent(debugRound)).toContain('已重试：1 次');
    expect(buildVariableOutputDebugContent(debugRound)).toContain('最近等待：1000ms');
  });

  it('正文和额外变量调试都展示自动推进普通失败重试', () => {
    const debugRound = createDebugRound();
    debugRound.main.retryFailureCount = 2;
    debugRound.main.retryFailureLastDelayMs = 2_000;
    debugRound.variable.retryFailureCount = 1;
    debugRound.variable.retryFailureLastDelayMs = 1_000;

    expect(buildMainInputDebugContent(debugRound)).toContain('【自动推进失败重试】');
    expect(buildMainInputDebugContent(debugRound)).toContain('最近等待：2000ms');
    expect(buildVariableOutputDebugContent(debugRound)).toContain('【自动推进失败重试】');
    expect(buildVariableOutputDebugContent(debugRound)).toContain('最近等待：1000ms');
  });

  it('变量调试展示当前等待阶段和 watchdog 次数', () => {
    const debugRound = createDebugRound();
    debugRound.variable.currentPhase = 'append-variable-blocks';
    debugRound.variable.phaseTimeline = [
      {
        name: 'append-variable-blocks',
        status: 'running',
        startedAt: 1_000,
        updatedAt: 11_000,
        durationMs: 10_000,
        watchdogTickCount: 2,
      },
    ];

    const output = buildVariableOutputDebugContent(debugRound);
    expect(output).toContain('【变量流水线耗时】');
    expect(output).toContain('当前等待：append-variable-blocks');
    expect(output).toContain('10000ms，watchdog 2 次');
  });
});
