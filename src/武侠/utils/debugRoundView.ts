import type { ExtendedDebugStageStatus, LatestDebugRound } from '../hooks/useDebugLogs';

const normalizeDebugText = (value: string | undefined): string => (value || '').trim();

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
    || variable.error,
  );
}

export function buildMainInputDebugContent(debugRound: LatestDebugRound): string {
  const sections = ['【用户输入】', debugRound.main.userInput || '(空)', ''];
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
  const sections: string[] = [];
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
  sections.push('【ERA 同步后回读验证】', variable.syncVerification || '(未同步或未回读)');

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
