import type { DebugVariableApplyStatus, ExtendedDebugStageStatus, LatestDebugRound } from '../hooks/useDebugLogs';

const normalizeDebugText = (value: string | undefined): string => (value || '').trim();

const buildRetry429Lines = (stage: LatestDebugRound['main'] | LatestDebugRound['variable']): string[] => {
  const retryCount = stage.retry429Count ?? 0;
  if (retryCount <= 0) {
    return [];
  }
  return [
    '【HTTP 429 自动重试】',
    `已重试：${retryCount} 次`,
    `最近等待：${stage.retry429LastDelayMs ?? 0}ms`,
    '',
  ];
};

const getVariableTriggerLabel = (trigger: LatestDebugRound['variable']['trigger']): string => {
  if (trigger === 'send') {
    return '发送';
  }
  if (trigger === 'regenerate') {
    return '重新生成';
  }
  return '(未记录)';
};

const getVariableModeLabel = (modeSnapshot: LatestDebugRound['variable']['modeSnapshot']): string => {
  if (modeSnapshot === 'extra') {
    return 'extra';
  }
  if (modeSnapshot === 'inline') {
    return 'inline';
  }
  return '(未记录)';
};

const buildVariableDecisionLines = (debugRound: LatestDebugRound): string[] => {
  const { variable } = debugRound;
  const shouldRunExtra = variable.status !== 'skipped' && variable.modeSnapshot === 'extra';
  return [
    '【分支决策】',
    `触发入口：${getVariableTriggerLabel(variable.trigger)}`,
    `模式快照：${getVariableModeLabel(variable.modeSnapshot)}`,
    `执行判断：${shouldRunExtra ? '执行额外变量更新' : '跳过额外变量更新'}`,
  ];
};

const buildVariablePhaseLines = (debugRound: LatestDebugRound): string[] => {
  const { variable } = debugRound;
  const phases = variable.phaseTimeline ?? [];
  if (phases.length === 0) {
    return [];
  }

  return [
    '【变量流水线耗时】',
    ...(variable.currentPhase ? [`当前等待：${variable.currentPhase}`] : []),
    ...phases.map(phase => {
      const status = phase.status === 'running' ? '进行中' : phase.status === 'success' ? '完成' : '失败';
      const watchdog = phase.watchdogTickCount > 0 ? `，watchdog ${phase.watchdogTickCount} 次` : '';
      const error = phase.error ? `，错误：${phase.error}` : '';
      return `${phase.name}：${status}，${phase.durationMs}ms${watchdog}${error}`;
    }),
    '',
  ];
};

export function getDebugStageStatusLabel(status: ExtendedDebugStageStatus): string {
  if (status === 'running') {
    return '进行中';
  }
  if (status === 'success') {
    return '完成';
  }
  if (status === 'error') {
    return '失败';
  }
  if (status === 'skipped') {
    return '已跳过';
  }
  return '未运行';
}

export function getVariableApplyStatusLabel(status: DebugVariableApplyStatus): string {
  if (status === 'waiting-write-done') return '等待 ERA 写入确认';
  if (status === 'verifying') return '等待变量快照刷新';
  if (status === 'success') return '变量已持久化';
  if (status === 'pending') return '持久化仍在等待';
  if (status === 'error') return '变量应用失败';
  return '未开始应用';
}

export function shouldShowVariableDebug(debugRound: LatestDebugRound | null): boolean {
  if (!debugRound) {
    return false;
  }

  const { variable } = debugRound;
  return Boolean(
    variable.status !== 'idle'
    || variable.trigger
    || variable.modeSnapshot
    || variable.skipReason
    || variable.input
    || variable.output
    || variable.appendedBlocks
    || variable.finalMessageText
    || variable.appendReadbackText
    || variable.appendVerification
    || variable.syncReadbackText
    || variable.syncVerification
    || (variable.retry429Count ?? 0) > 0
    || variable.applyStatus !== 'idle'
    || variable.applyError
    || variable.applyVerification
    || variable.postProcessStatus !== 'idle'
    || variable.postProcessError
    || variable.error,
  );
}

export function buildMainInputDebugContent(debugRound: LatestDebugRound): string {
  const sections = [
    '【用户输入】',
    debugRound.main.userInput || '(空)',
    '',
    ...buildRetry429Lines(debugRound.main),
  ];
  const combinedPrompt = normalizeDebugText(debugRound.main.combinedPrompt);

  sections.push('【合并提示词】');
  sections.push(combinedPrompt || '(未捕获到合并提示词)');

  if (debugRound.main.error) {
    sections.push(`\n【错误】\n${debugRound.main.error}`);
  }

  return sections.filter(Boolean).join('\n');
}

export function buildVariableInputDebugContent(debugRound: LatestDebugRound): string {
  const { variable } = debugRound;
  if (normalizeDebugText(variable.input)) {
    return variable.input;
  }
  if (variable.trigger || variable.modeSnapshot || variable.skipReason || variable.status === 'skipped') {
    return [
      ...buildVariableDecisionLines(debugRound),
      ...(variable.skipReason ? ['', '【跳过原因】', variable.skipReason] : []),
      ...(variable.error ? [`\n【错误】\n${variable.error}`] : []),
    ]
      .filter(Boolean)
      .join('\n');
  }
  return '(本轮未进行额外变量更新)';
}

export function buildVariableOutputDebugContent(debugRound: LatestDebugRound): string {
  const { variable } = debugRound;
  const sections: string[] = [
    ...buildRetry429Lines(variable),
    ...buildVariablePhaseLines(debugRound),
  ];
  const rawResponse = normalizeDebugText(variable.output);
  const appendedBlocks = normalizeDebugText(variable.appendedBlocks);
  const appendReadbackText = normalizeDebugText(variable.appendReadbackText);
  const syncReadbackText = normalizeDebugText(variable.syncReadbackText);
  const finalMessageText = normalizeDebugText(variable.finalMessageText);
  const hasDecisionOnlyContext = Boolean(variable.trigger || variable.modeSnapshot || variable.skipReason);
  const hasActualVariableOutput = Boolean(
    rawResponse || appendedBlocks || appendReadbackText || syncReadbackText || finalMessageText,
  );
  const isError = variable.status === 'error' || Boolean(variable.error);

  if (!hasActualVariableOutput && hasDecisionOnlyContext) {
    sections.push(...buildVariableDecisionLines(debugRound));
    if (variable.skipReason) {
      sections.push('', '【跳过原因】', variable.skipReason);
    }
    if (variable.error) {
      sections.push(`\n【错误】\n${variable.error}`);
    }
    return sections.filter(Boolean).join('\n');
  }

  if (rawResponse && rawResponse !== appendedBlocks) {
    sections.push('【原始返回】', variable.output, '');
  }

  sections.push('【合法变量块】', variable.appendedBlocks || '(无)', '');
  sections.push('【写入后回读验证】', variable.appendVerification || '(未验证)', '');
  sections.push('【ERA 楼层同步后回读验证】', variable.syncVerification || '(未同步或未回读)');
  sections.push('【ERA 变量应用状态】', getVariableApplyStatusLabel(variable.applyStatus));
  if (variable.applyVerification) {
    sections.push('【变量快照验证】', variable.applyVerification);
  }
  if (variable.applyError) {
    sections.push('【变量应用错误】', variable.applyError);
  }
  if (variable.postProcessStatus !== 'idle' || variable.postProcessError) {
    sections.push('【后处理状态】', getDebugStageStatusLabel(variable.postProcessStatus));
    if (variable.postProcessError) sections.push(variable.postProcessError);
  }

  if (isError || (appendReadbackText && appendReadbackText !== syncReadbackText)) {
    sections.push('', '【写入后回读文本】', variable.appendReadbackText || '(未回读)');
  }

  if (isError || (syncReadbackText && syncReadbackText !== finalMessageText)) {
    sections.push('', '【ERA 同步后回读文本】', variable.syncReadbackText || '(未同步或未回读)');
  }

  if (isError && finalMessageText) {
    sections.push('', '【最终楼层文本】', variable.finalMessageText);
  }

  if (variable.error) {
    sections.push(`\n【错误】\n${variable.error}`);
  }

  return sections.filter(Boolean).join('\n');
}
