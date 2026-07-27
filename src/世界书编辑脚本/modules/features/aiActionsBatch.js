import {
  collectAiTargetEntries as collectAiTargetEntriesFromSingle,
  buildAiEntryHash,
  resolveAiPreviewOutcome,
} from './aiActions.js';
export {
  collectAiTargetEntries,
  applyAiPreview,
} from './aiActions.js';
import { requestLlmText } from './llmClient.js';
import { ensureNumericUID, errorCatched } from '../utils.js';
import {
  DIRECT_BATCH_SIZE,
  DIRECT_PLAN_RECOMMEND_THRESHOLD,
  buildDirectBatches,
  buildPlannedBatches,
} from './aiBatchPlanner.js';
export { DIRECT_BATCH_SIZE, DIRECT_PLAN_RECOMMEND_THRESHOLD } from './aiBatchPlanner.js';

const COMPATIBILITY_MODEL_PREFIXES = ['流式抗截断/', '假流式/'];
const COMPATIBILITY_FAILURE_PATTERNS = [
  /Got response status 503/i,
  /Service Unavailable/i,
  /无可用渠道/i,
  /distributor/i,
];
const STOP_PREVIEW_MESSAGE = '已停止生成';

const AI_BATCH_REQUEST_MAX_RETRIES = 0;
const AI_BATCH_TOKEN_FALLBACK_DIVISOR = 4;
const DEFAULT_CONTEXT_BUDGET = {
  enabled: true,
  maxInputTokens: 12000,
  reserveOutputTokens: 4096,
};
function getSillyTavernApi() {
  const parentWin = typeof window.parent !== 'undefined' ? window.parent : window;
  return (typeof SillyTavern !== 'undefined' ? SillyTavern : parentWin.SillyTavern) || null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function summarizeText(text, maxLength = 120) {
  if (typeof text !== 'string') {
    return '';
  }

  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}...` : singleLine;
}

function splitDiffLines(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [''];
  }
  return text.replace(/\r\n/g, '\n').split('\n');
}

function findNextLineResync(beforeLines, afterLines, startBefore, startAfter, lookahead = 12) {
  for (let totalOffset = 1; totalOffset <= lookahead * 2; totalOffset += 1) {
    const maxBeforeOffset = Math.min(totalOffset, lookahead, beforeLines.length - startBefore - 1);
    for (let beforeOffset = 0; beforeOffset <= maxBeforeOffset; beforeOffset += 1) {
      const afterOffset = totalOffset - beforeOffset;
      if (afterOffset > lookahead || startAfter + afterOffset >= afterLines.length) {
        continue;
      }
      if (beforeLines[startBefore + beforeOffset] === afterLines[startAfter + afterOffset]) {
        return { beforeOffset, afterOffset };
      }
    }
  }
  return null;
}

function formatDiffSnippet(lines, start, end) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);
  const body = lines.slice(safeStart, safeEnd).join('\n');
  const prefix = safeStart > 0 ? '...\n' : '';
  const suffix = safeEnd < lines.length ? '\n...' : '';
  return `${prefix}${body}${suffix}`.trim();
}

export function buildContentDiffSnippets(beforeText, afterText, options = {}) {
  const contextLines = Number.isInteger(options.contextLines) ? options.contextLines : 1;
  const maxSnippets = Number.isInteger(options.maxSnippets) ? options.maxSnippets : 6;
  const lookahead = Number.isInteger(options.lookahead) ? options.lookahead : 12;
  const beforeLines = splitDiffLines(beforeText);
  const afterLines = splitDiffLines(afterText);
  const snippets = [];

  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length || afterIndex < afterLines.length) {
    if (beforeIndex < beforeLines.length && afterIndex < afterLines.length && beforeLines[beforeIndex] === afterLines[afterIndex]) {
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    const startBefore = beforeIndex;
    const startAfter = afterIndex;
    const nextMatch = findNextLineResync(beforeLines, afterLines, beforeIndex, afterIndex, lookahead);
    const changedBeforeEnd = nextMatch ? beforeIndex + nextMatch.beforeOffset : beforeLines.length;
    const changedAfterEnd = nextMatch ? afterIndex + nextMatch.afterOffset : afterLines.length;

    snippets.push({
      before: formatDiffSnippet(beforeLines, startBefore - contextLines, changedBeforeEnd + contextLines),
      after: formatDiffSnippet(afterLines, startAfter - contextLines, changedAfterEnd + contextLines),
    });

    if (snippets.length >= maxSnippets) {
      break;
    }

    if (!nextMatch) {
      break;
    }

    beforeIndex = changedBeforeEnd;
    afterIndex = changedAfterEnd;
  }

  return snippets.filter(snippet => snippet.before || snippet.after);
}

function sanitizeStringArray(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeUidList(value = []) {
  if (!Array.isArray(value)) {
    return [];
  }

  return _.uniq(
    value
      .map(uid => ensureNumericUID(uid))
      .filter(uid => uid >= 0),
  );
}

function normalizeContextBudget(contextBudget = {}) {
  const maxInputTokens = Number.parseInt(`${contextBudget?.maxInputTokens ?? DEFAULT_CONTEXT_BUDGET.maxInputTokens}`, 10);
  const reserveOutputTokens = Number.parseInt(
    `${contextBudget?.reserveOutputTokens ?? DEFAULT_CONTEXT_BUDGET.reserveOutputTokens}`,
    10,
  );

  return {
    enabled: contextBudget?.enabled !== false,
    maxInputTokens: Number.isFinite(maxInputTokens)
      ? Math.min(2000000, Math.max(1000, maxInputTokens))
      : DEFAULT_CONTEXT_BUDGET.maxInputTokens,
    reserveOutputTokens: Number.isFinite(reserveOutputTokens)
      ? Math.min(64000, Math.max(256, reserveOutputTokens))
      : DEFAULT_CONTEXT_BUDGET.reserveOutputTokens,
  };
}

function normalizeFieldOptions(fieldOptions = {}) {
  return {
    title: fieldOptions.title !== false,
    content: fieldOptions.content !== false,
    prompt: fieldOptions.prompt !== false,
  };
}

function getKeywordSnapshot(entry) {
  return Array.isArray(entry?.strategy?.keys) ? [...entry.strategy.keys] : [];
}

function getPromptSnapshot(entry) {
  return {
    primary: Array.isArray(entry?.strategy?.keys) ? [...entry.strategy.keys] : [],
  };
}

function buildEditableSnapshot(entry, fieldOptions) {
  const normalizedFieldOptions = normalizeFieldOptions(fieldOptions);
  const snapshot = { uid: ensureNumericUID(entry?.uid) };

  if (normalizedFieldOptions.title) {
    snapshot.title = entry?.name || '';
  }

  if (normalizedFieldOptions.content) {
    snapshot.content = entry?.content || '';
  }

  if (normalizedFieldOptions.prompt) {
    snapshot.prompts = getPromptSnapshot(entry);
  }

  return snapshot;
}

function buildBatchResponseShape(fieldOptions) {
  return JSON.stringify(
    {
      entries: [
        buildEditableSnapshot({ uid: 123 }, fieldOptions),
      ],
    },
    null,
    2,
  );
}

function buildEntriesPayload(entries, fieldOptions) {
  return JSON.stringify(
    {
      entries: entries.map(entry => buildEditableSnapshot(entry, fieldOptions)),
    },
    null,
    2,
  );
}

function buildPlanningEntriesPayload(entries = []) {
  return JSON.stringify(
    {
      entries: entries.map(entry => ({
        uid: ensureNumericUID(entry?.uid),
        title: entry?.name || '',
        content: entry?.content || '',
        prompts: getPromptSnapshot(entry),
      })),
    },
    null,
    2,
  );
}

function getEditableFieldLabels(fieldOptions) {
  return Object.entries(normalizeFieldOptions(fieldOptions))
    .filter(([, enabled]) => enabled)
    .map(([key]) => (key === 'prompt' ? 'keywords' : key));
}

function escapeXmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXmlAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function normalizeXmlTagNameSafe(title, usedNames = new Set()) {
  const raw = typeof title === 'string' ? title.trim() : '';
  const collapsed = raw.replace(/\s+/g, '_');
  const sanitized = collapsed
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const baseName = /^[\p{L}_]/u.test(sanitized) ? sanitized : `entry_${sanitized || 'item'}`;

  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function buildInfoGroupXml(sectionName, entries = [], usedNames = new Set()) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '';
  }

  const lines = [`<${sectionName}>`];
  entries.forEach(entry => {
    const tagName = normalizeXmlTagNameSafe(entry?.name || '', usedNames);
    const prompts = getPromptSnapshot(entry);
    const role = sectionName === '已修改批次' ? 'modified' : sectionName === '只读条目' ? 'readonly' : 'context';
    lines.push(
      `  <条目 uid="${escapeXmlAttribute(ensureNumericUID(entry?.uid))}" title="${escapeXmlAttribute(entry?.name || tagName)}" role="${role}">`,
    );
    lines.push('    <标题>');
    lines.push(`    ${escapeXmlText(entry?.name || '')}`);
    lines.push('    </标题>');
    lines.push('    <内容>');
    lines.push(escapeXmlText(entry?.content || ''));
    lines.push('    </内容>');
    lines.push('    <关键词>');
    lines.push(escapeXmlText(JSON.stringify(prompts.primary || [])));
    lines.push('    </关键词>');
    lines.push('  </条目>');
  });
  lines.push(`</${sectionName}>`);
  return lines.join('\n');
}

function buildLockedSelectionXml(contextEntries = {}) {
  const lockedEditableUids = normalizeUidList(contextEntries.lockedEditableUids);
  const lockedReadonlyUids = normalizeUidList(contextEntries.lockedReadonlyUids)
    .filter(uid => !lockedEditableUids.includes(uid));
  if (!lockedEditableUids.length && !lockedReadonlyUids.length) {
    return '';
  }

  return [
    '<锁定选择>',
    `<可修改>${lockedEditableUids.join(', ')}</可修改>`,
    `<只读>${lockedReadonlyUids.join(', ')}</只读>`,
    '</锁定选择>',
  ].join('\n');
}

function buildChatContextXml(chatMessages = []) {
  const normalizedMessages = Array.isArray(chatMessages)
    ? chatMessages.filter(message => typeof message?.message === 'string' && message.message.trim())
    : [];

  if (!normalizedMessages.length) {
    return '';
  }

  const lines = ['<聊天上下文>'];
  normalizedMessages.forEach(message => {
    const role = ['system', 'assistant', 'user'].includes(message?.role) ? message.role : 'system';
    lines.push(`  <${role}>`);
    lines.push(escapeXmlText(message?.message || ''));
    lines.push(`  </${role}>`);
  });
  lines.push('</聊天上下文>');
  return lines.join('\n');
}

function buildReferenceMaterialXml(referenceMaterial = '') {
  const content = typeof referenceMaterial === 'string' ? referenceMaterial.trim() : '';
  if (!content) {
    return '';
  }

  return ['<参考资料>', escapeXmlText(content), '</参考资料>'].join('\n');
}

function buildWorkspaceInfoSectionXml(contextEntries = {}, { includePlan = false } = {}) {
  const usedNames = new Set();
  const sections = [
    includePlan ? buildPlanSectionXml(contextEntries.plan || null) : '',
    buildLockedSelectionXml(contextEntries),
    buildChatContextXml(contextEntries.chatMessages || []),
    buildReferenceMaterialXml(contextEntries.referenceMaterial || ''),
    buildInfoGroupXml('只读条目', contextEntries.readonlyEntries || [], usedNames),
    buildInfoGroupXml('已修改批次', contextEntries.modifiedEntries || [], usedNames),
  ].filter(Boolean);

  if (!sections.length) {
    return '';
  }

  return ['<信息>', ...sections, '</信息>'].join('\n');
}

async function getTokenCountDetails(text) {
  const content = typeof text === 'string' ? text : '';
  const stApi = getSillyTavernApi();

  if (stApi && typeof stApi.getTokenCountAsync === 'function') {
    try {
      const count = await stApi.getTokenCountAsync(content);
      if (Number.isFinite(count) && count >= 0) {
        return { count, source: 'tokenizer' };
      }
    } catch {
      // fallback below
    }
  }

  return {
    count: Math.max(1, Math.ceil(content.length / AI_BATCH_TOKEN_FALLBACK_DIVISOR)),
    source: 'fallback',
  };
}

async function getTokenCount(text) {
  const details = await getTokenCountDetails(text);
  return details.count;
}

async function buildBatchPlans({
  lorebookName,
  instruction,
  targetEntries,
  fieldOptions,
  promptSettings,
  contextEntries = {},
  contextBudget = {},
  sourceMode = 'direct',
  planningResult = null,
}) {
  const normalizedBudget = normalizeContextBudget(contextBudget);
  const scheduling = sourceMode === 'plan'
    ? buildPlannedBatches({
        entries: targetEntries,
        entryTasks: planningResult?.plan?.entry_tasks || [],
        readonlyUids: contextEntries.readonlyEntries?.map(entry => ensureNumericUID(entry?.uid)) || [],
        reserveOutputTokens: normalizedBudget.reserveOutputTokens,
      })
    : {
        batches: buildDirectBatches(targetEntries),
        warnings: [],
        safeOutputCapacity: null,
        totalEstimatedOutputWeight: null,
      };

  const plans = [];
  for (const batch of scheduling.batches) {
    const entries = Array.isArray(batch.entries) ? batch.entries : [];
    const requestPrompt = buildContextualBatchPromptV2(
      lorebookName,
      instruction,
      entries,
      fieldOptions,
      promptSettings,
      contextEntries,
    );
    const tokenDetails = await getTokenCountDetails(requestPrompt);
    plans.push({
      ...batch,
      entries,
      requestPrompt,
      entryTokenCount: tokenDetails.count,
      tokenCountSource: tokenDetails.source,
      isOversized: normalizedBudget.enabled && tokenDetails.count > normalizedBudget.maxInputTokens,
      maxInputTokens: normalizedBudget.maxInputTokens,
    });
  }
  return {
    plans: plans.map((plan, index) => ({
      ...plan,
      batchIndex: index,
      batchNumber: index + 1,
      entryCount: plan.entries.length,
    })),
    warnings: scheduling.warnings || [],
    strategy: sourceMode === 'plan' ? 'planned-output-graph' : 'direct-entry-count',
    safeOutputCapacity: scheduling.safeOutputCapacity,
    totalEstimatedOutputWeight: scheduling.totalEstimatedOutputWeight,
  };
}

async function callDefaultAiClient(prompt, options = {}) {
  return requestLlmText({
    prompt,
    promptSettings: options.promptSettings,
    customApi: options.customApi,
    onGenerationStart: options.onGenerationStart,
    shouldStream: options.shouldStream,
    maxOutputTokens: normalizeContextBudget(options.contextBudget).reserveOutputTokens,
  });
}

function extractJsonCandidate(rawText) {
  const text = typeof rawText === 'string' ? rawText : '';
  const fencedMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const sources = fencedMatches.length ? fencedMatches.map(match => match[1] || '') : [text];

  const collectCandidates = source => {
    const candidates = [];
    let start = -1;
    let stack = [];
    let inString = false;
    let escaped = false;

    for (let index = 0; index < source.length; index++) {
      const char = source[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (start < 0) {
        if (char === '{' || char === '[') {
          start = index;
          stack = [char];
        }
        continue;
      }

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '[';
        if (!stack.length || stack[stack.length - 1] !== expected) {
          start = -1;
          stack = [];
          continue;
        }

        stack.pop();
        if (stack.length === 0 && start >= 0) {
          const candidate = source.slice(start, index + 1).trim();
          if (candidate) {
            candidates.push(candidate);
          }
          start = -1;
        }
      }
    }

    return _.uniq(candidates);
  };

  const normalizeParsedPayload = parsed => {
    if (Array.isArray(parsed?.entries)) return parsed.entries;
    if (Array.isArray(parsed?.result?.entries)) return parsed.result.entries;
    if (Array.isArray(parsed)) return parsed;
    if (isPlainObject(parsed) && Number.isFinite(ensureNumericUID(parsed.uid))) return [parsed];
    throw new Error('JSON 根节点不是 entries 数组');
  };

  for (const source of sources) {
    const candidates = collectCandidates(source);
    for (const candidate of candidates) {
      try {
        normalizeParsedPayload(JSON.parse(candidate));
        return candidate;
      } catch {
        // try next candidate
      }
    }

    if (candidates.length) {
      return candidates[0];
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text.trim();
}

function repairJsonCandidate(candidate) {
  if (typeof candidate !== 'string' || !candidate) {
    return candidate;
  }

  let repaired = '';
  let inString = false;
  let escaped = false;

  const peekNextNonWhitespace = startIndex => {
    for (let index = startIndex; index < candidate.length; index += 1) {
      const char = candidate[index];
      if (!/\s/.test(char)) {
        return char;
      }
    }
    return '';
  };

  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (!inString) {
      repaired += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      repaired += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      const nextNonWhitespace = peekNextNonWhitespace(index + 1);
      if (!nextNonWhitespace || nextNonWhitespace === ',' || nextNonWhitespace === '}' || nextNonWhitespace === ']' || nextNonWhitespace === ':') {
        repaired += char;
        inString = false;
      } else {
        repaired += '\\"';
      }
      continue;
    }

    repaired += char;
  }

  return repaired;
}

function buildDetailedErrorMessage(summary, details = []) {
  return [summary, ...details.filter(Boolean)].join('\n');
}

function normalizeAiDraft(rawDraft, entry, fieldOptions) {
  const normalizedFieldOptions = normalizeFieldOptions(fieldOptions);
  const draft = isPlainObject(rawDraft) ? rawDraft : {};
  const nextEntry = _.cloneDeep(entry);

  if (normalizedFieldOptions.title) {
    nextEntry.name = typeof draft.title === 'string' ? draft.title.trim() || entry.name || '' : entry.name || '';
  }

  if (normalizedFieldOptions.content) {
    nextEntry.content = typeof draft.content === 'string' ? draft.content : entry.content || '';
  }

  if (normalizedFieldOptions.prompt) {
    const promptSnapshot = getPromptSnapshot(entry);
    const keywordDraft = Array.isArray(draft.keywords)
      ? draft.keywords
      : isPlainObject(draft.prompts)
        ? draft.prompts.primary
        : [];
    nextEntry.strategy = _.cloneDeep(nextEntry.strategy || {});
    nextEntry.strategy.keys = sanitizeStringArray(keywordDraft, promptSnapshot.primary);
  }

  return nextEntry;
}

function buildCompatibilityDiagnosticsReport({ attempts = [], adoptedAttempt = null, stopped = false }) {
  if (!attempts.length) {
    return '';
  }

  const successCount = attempts.filter(attempt => attempt.success).length;
  const lines = [
    `兼容诊断已执行 ${attempts.length} 组尝试，成功 ${successCount} 组，失败 ${attempts.length - successCount} 组。`,
  ];

  if (stopped) {
    lines.push('诊断已被手动停止，以下为停止前已完成的结果。');
  }

  if (adoptedAttempt?.success) {
    lines.push(`当前预览采用此组合：${adoptedAttempt.model || '(未提供模型)'} / 流式${adoptedAttempt.shouldStream ? '开' : '关'}`);
  } else {
    lines.push('未找到可用组合。');
  }

  attempts.forEach((attempt, index) => {
    lines.push('');
    lines.push(
      `[${index + 1}/${attempts.length}] ${attempt.attemptLabel} | 模型=${attempt.model || '(未提供模型)'} | 流式${attempt.shouldStream ? '开' : '关'} | ${attempt.success ? '成功' : '失败'} | ${attempt.durationMs}ms`,
    );
    if (attempt.errorSummary) {
      lines.push(`摘要: ${attempt.errorSummary}`);
    }
  });

  return lines.join('\n');
}

function buildBatchPlanReport(plans = []) {
  if (!plans.length) {
    return '';
  }

  const lines = [`本次预览按 ${plans.length} 批串行发送；输入 token 仅用于警告，不参与分批。`];

  plans.forEach(plan => {
    lines.push(
      `批次 ${plan.batchNumber}: ${plan.entryCount} 条，最终请求约 ${plan.entryTokenCount} tokens${plan.maxInputTokens ? ` / 警戒值 ${plan.maxInputTokens}` : ''}${plan.isOversized ? '（超过警戒值，仍继续发送）' : ''}`,
    );
  });

  return lines.join('\n');
}

function buildDebugSection(title, content) {
  if (!content) {
    return '';
  }
  return `===== ${title} =====\n${content}`;
}

function mergeTextSections(sections = []) {
  return sections.filter(Boolean).join('\n\n');
}

function buildSingleBatchResult({
  lorebookName,
  trimmedInstruction,
  normalizedFieldOptions,
  targetEntries,
  resolvedAttempt,
  adoptedAttempt,
  diagnosticAttempts,
  diagnosticsTriggered,
  stopped,
  batchPlan,
}) {
  const resultAttempt = adoptedAttempt?.success ? adoptedAttempt : resolvedAttempt;
  const items = resultAttempt?.items || [];
  const errors = resultAttempt?.errors || [];
  const warnings = resultAttempt?.warnings || [];
  const changedCount = items.filter(item => item.changed).length;
  const cancelledCount = stopped ? Math.max(0, targetEntries.length - items.length - errors.length) : 0;
  const outcome = resolveAiPreviewOutcome({
    total: targetEntries.length,
    succeeded: items.length,
    failed: errors.length,
    cancelled: stopped,
  });
  const attempts = diagnosticsTriggered ? diagnosticAttempts : [];
  const initialAttempt = attempts[0] || resolvedAttempt || null;
  const successAttemptCount = attempts.filter(attempt => attempt.success).length;
  const diagnosticsSummary = diagnosticsTriggered
    ? {
      triggered: true,
      totalAttempts: attempts.length,
      succeededAttempts: successAttemptCount,
      failedAttempts: attempts.length - successAttemptCount,
      foundWorkingConfig: Boolean(adoptedAttempt?.success),
      adoptedAttemptLabel: adoptedAttempt?.success ? adoptedAttempt.attemptLabel : '',
      initialErrorSummary: initialAttempt?.errorSummary || '',
      stopped: Boolean(stopped),
    }
    : null;

  return {
    outcome,
    lorebookName,
    instruction: trimmedInstruction,
    fieldOptions: normalizedFieldOptions,
    targetCount: targetEntries.length,
    items,
    errors,
    warnings,
    debug: {
      requestPrompt: resultAttempt?.requestPrompt || '',
      rawResponse: resultAttempt?.rawResponse || '',
      parsedJsonCandidate: resultAttempt?.parsedJsonCandidate || '',
      errorDetails: resultAttempt?.errorDetails || '',
      diagnosticsReport: mergeTextSections([
        buildBatchPlanReport(batchPlan ? [batchPlan] : []),
        diagnosticsTriggered
          ? buildCompatibilityDiagnosticsReport({
            attempts,
            adoptedAttempt,
            stopped,
          })
          : '',
      ]),
      diagnosticAttempts: attempts,
    },
    summary: {
      total: targetEntries.length,
      succeeded: items.length,
      failed: errors.length,
      cancelled: cancelledCount,
      changed: changedCount,
      unchanged: items.length - changedCount,
      diagnostics: diagnosticsSummary,
      batching: batchPlan
        ? {
          totalBatches: 1,
          totalEntryTokens: batchPlan.entryTokenCount,
          oversizedBatches: batchPlan.isOversized ? 1 : 0,
        }
        : null,
    },
    resolvedConfig: {
      model: resultAttempt?.model || resultAttempt?.resolvedConfig?.model || '',
      shouldStream: Boolean(resultAttempt?.shouldStream ?? resultAttempt?.resolvedConfig?.shouldStream),
      success: Boolean(resultAttempt?.success),
      attemptLabel: resultAttempt?.attemptLabel || resultAttempt?.resolvedConfig?.attemptLabel || '',
    },
  };
}

async function executeSingleBatch(options = {}) {
  const {
    batchPlan,
    lorebookName,
    trimmedInstruction,
    normalizedFieldOptions,
    promptSettings,
    customApi,
    shouldStream,
    invokeClient,
    onGenerationStart,
    shouldStop,
    readonlyEntries = [],
    modifiedEntries = [],
    planningResult = null,
    chatMessages = [],
    referenceMaterial = '',
    contextBudget = {},
    sourceMode = 'direct',
  } = options;
  const batchLabel = `批次 ${batchPlan.batchNumber}/${options.totalBatches}`;

  const requestPrompt = buildContextualBatchPromptV2(
    lorebookName,
    trimmedInstruction,
    batchPlan.entries,
    normalizedFieldOptions,
    promptSettings,
    {
      plan: planningResult?.plan || null,
      chatMessages,
      referenceMaterial,
      readonlyEntries,
      modifiedEntries,
    },
  );

  const initialAttempt = await executePreviewAttempt({
    attemptLabel: '当前配置',
    lorebookName,
    trimmedInstruction,
    targetEntries: batchPlan.entries,
    normalizedFieldOptions,
    promptSettings,
    customApi,
    shouldStream,
    invokeClient,
    onGenerationStart,
    requestPrompt,
    shouldStop,
    batchLabel,
    sourceMode,
    contextBudget,
  });

  const attempts = [initialAttempt];
  let stopped = Boolean(initialAttempt.stopped || shouldStop?.());
  const diagnosticsTriggered = shouldRunCompatibilityDiagnostics(customApi, initialAttempt);
  let adoptedAttempt = initialAttempt.success ? initialAttempt : null;
  let resolvedAttempt = adoptedAttempt || initialAttempt;

  if (diagnosticsTriggered && !stopped) {
    const diagnosticConfigs = buildCompatibilityAttemptConfigs(customApi, shouldStream);
    const totalAttempts = 1 + diagnosticConfigs.length;

    for (let index = 0; index < diagnosticConfigs.length; index++) {
      if (shouldStop?.()) {
        stopped = true;
        break;
      }

      const diagnosticConfig = diagnosticConfigs[index];
      const attemptResult = await executePreviewAttempt({
        attemptLabel: `兼容诊断 ${attempts.length + 1}/${totalAttempts}`,
        lorebookName,
        trimmedInstruction,
        targetEntries: batchPlan.entries,
        normalizedFieldOptions,
        promptSettings,
        customApi: diagnosticConfig.customApi,
        shouldStream: diagnosticConfig.shouldStream,
        invokeClient,
        onGenerationStart,
        requestPrompt,
        shouldStop,
        batchLabel,
        sourceMode,
        contextBudget,
      });
      attempts.push(attemptResult);

      if (!adoptedAttempt && attemptResult.success) {
        adoptedAttempt = attemptResult;
      }
      if (attemptResult.stopped || shouldStop?.()) {
        stopped = true;
        break;
      }
    }

    resolvedAttempt = adoptedAttempt || attempts[0];
  }

  return buildSingleBatchResult({
    lorebookName,
    trimmedInstruction,
    normalizedFieldOptions,
    targetEntries: batchPlan.entries,
    resolvedAttempt,
    adoptedAttempt,
    diagnosticAttempts: attempts,
    diagnosticsTriggered,
    stopped,
    batchPlan,
  });
}

function emitPreviewProgress(onProgress, payload = {}) {
  if (typeof onProgress !== 'function') {
    return;
  }

  onProgress({
    ...payload,
    completed: payload.batchCompleted,
    total: payload.batchTotal,
  });
}

function makeDependencyError(entry, dependencyUids, reason = '依赖条目未成功生成') {
  const uid = ensureNumericUID(entry?.uid);
  return {
    uid,
    title: entry?.name || `UID ${uid}`,
    error: `${reason}：${_.uniq(dependencyUids).join(', ')}。该条目未发送给 AI。`,
  };
}

function findBlockedPlanUids(tasks = [], availableUids = new Set(), readonlyUids = new Set()) {
  const taskUidSet = new Set(tasks.map(task => ensureNumericUID(task?.uid)));
  const blocked = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    tasks.forEach(task => {
      const uid = ensureNumericUID(task?.uid);
      if (blocked.has(uid)) return;
      const missing = (task?.depends_on_uids || []).filter(dependencyUid => {
        const normalized = ensureNumericUID(dependencyUid);
        if (readonlyUids.has(normalized) || availableUids.has(normalized)) return false;
        if (taskUidSet.has(normalized) && !blocked.has(normalized)) return false;
        return true;
      });
      if (missing.length) {
        blocked.set(uid, missing);
        changed = true;
      }
    });
  }
  return blocked;
}

function enforceBatchDependencyResults(batchResult, batchPlan) {
  if (!Array.isArray(batchPlan?.tasks) || !batchPlan.tasks.length) {
    return batchResult;
  }
  const successful = new Set((batchResult.items || []).map(item => ensureNumericUID(item?.uid)));
  const taskUidSet = new Set(batchPlan.tasks.map(task => ensureNumericUID(task?.uid)));
  const failedByDependency = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    batchPlan.tasks.forEach(task => {
      const uid = ensureNumericUID(task?.uid);
      if (!successful.has(uid) || failedByDependency.has(uid)) return;
      const failedDependencies = (task.depends_on_uids || [])
        .map(ensureNumericUID)
        .filter(dependencyUid => taskUidSet.has(dependencyUid) && !successful.has(dependencyUid));
      if (failedDependencies.length) {
        failedByDependency.set(uid, failedDependencies);
        successful.delete(uid);
        changed = true;
      }
    });
  }

  (batchPlan.cyclicGroups || []).forEach(group => {
    const normalizedGroup = group.map(ensureNumericUID);
    if (normalizedGroup.some(uid => !successful.has(uid))) {
      normalizedGroup.forEach(uid => {
        if (successful.has(uid)) {
          successful.delete(uid);
          failedByDependency.set(uid, normalizedGroup.filter(memberUid => memberUid !== uid));
        }
      });
    }
  });

  if (!failedByDependency.size) {
    return batchResult;
  }
  const entriesByUid = new Map((batchPlan.entries || []).map(entry => [ensureNumericUID(entry?.uid), entry]));
  const dependencyErrors = Array.from(failedByDependency, ([uid, dependencies]) =>
    makeDependencyError(entriesByUid.get(uid), dependencies, '同批依赖条目未成功生成'));
  const items = (batchResult.items || []).filter(item => successful.has(ensureNumericUID(item?.uid)));
  const errors = [...(batchResult.errors || []), ...dependencyErrors];
  const changedCount = items.filter(item => item.changed).length;
  return {
    ...batchResult,
    outcome: resolveAiPreviewOutcome({
      total: batchPlan.entries.length,
      succeeded: items.length,
      failed: errors.length,
      cancelled: batchResult.outcome === 'cancelled',
    }),
    items,
    errors,
    summary: {
      ...batchResult.summary,
      succeeded: items.length,
      failed: errors.length,
      changed: changedCount,
      unchanged: items.length - changedCount,
    },
  };
}

function mergeDiagnosticsSummary(results = []) {
  const diagnosticSummaries = results
    .map(result => result?.summary?.diagnostics)
    .filter(summary => summary?.triggered);

  if (!diagnosticSummaries.length) {
    return null;
  }

  return {
    triggered: true,
    totalAttempts: diagnosticSummaries.reduce((sum, summary) => sum + (summary.totalAttempts || 0), 0),
    succeededAttempts: diagnosticSummaries.reduce((sum, summary) => sum + (summary.succeededAttempts || 0), 0),
    failedAttempts: diagnosticSummaries.reduce((sum, summary) => sum + (summary.failedAttempts || 0), 0),
    foundWorkingConfig: diagnosticSummaries.some(summary => summary.foundWorkingConfig),
    adoptedAttemptLabel: diagnosticSummaries.find(summary => summary.adoptedAttemptLabel)?.adoptedAttemptLabel || '',
    initialErrorSummary: diagnosticSummaries.find(summary => summary.initialErrorSummary)?.initialErrorSummary || '',
    stopped: diagnosticSummaries.some(summary => summary.stopped),
  };
}

function mergeBatchingSummary(batchPlans = []) {
  return {
    totalBatches: batchPlans.length,
    totalEntryTokens: batchPlans.reduce((sum, plan) => sum + (plan.entryTokenCount || 0), 0),
    oversizedBatches: batchPlans.filter(plan => plan.isOversized).length,
  };
}

function mergeDebugOutput(batchPlans, batchResults) {
  const requestSections = [];
  const responseSections = [];
  const jsonSections = [];
  const errorSections = [];
  const diagnosticSections = [buildBatchPlanReport(batchPlans)];

  batchResults.forEach((result, index) => {
    const batchTitle = `批次 ${index + 1}/${batchResults.length}`;
    requestSections.push(buildDebugSection(batchTitle, result?.debug?.requestPrompt || ''));
    responseSections.push(buildDebugSection(batchTitle, result?.debug?.rawResponse || ''));
    jsonSections.push(buildDebugSection(batchTitle, result?.debug?.parsedJsonCandidate || ''));
    errorSections.push(buildDebugSection(batchTitle, result?.debug?.errorDetails || ''));
    diagnosticSections.push(buildDebugSection(batchTitle, result?.debug?.diagnosticsReport || ''));
  });

  return {
    requestPrompt: mergeTextSections(requestSections),
    rawResponse: mergeTextSections(responseSections),
    parsedJsonCandidate: mergeTextSections(jsonSections),
    errorDetails: mergeTextSections(errorSections),
    diagnosticsReport: mergeTextSections(diagnosticSections),
    diagnosticAttempts: batchResults.flatMap(result => result?.debug?.diagnosticAttempts || []),
  };
}

function buildBatchPrompt(lorebookName, instruction, entries, fieldOptions, promptSettings = {}) {
  const entriesPayload = buildEntriesPayload(entries, fieldOptions);
  const editableEntries = JSON.parse(entriesPayload).entries;
  const enabledFields = getEditableFieldLabels(fieldOptions).join('、');
  const requestedUids = editableEntries.map(entry => entry.uid).join(', ');
  const builtinPromptTemplate = typeof promptSettings?.builtinPromptTemplate === 'string'
    ? promptSettings.builtinPromptTemplate.trim()
    : '';
  const renderedBuiltinPrompt = builtinPromptTemplate.replaceAll('{{editableFields}}', enabledFields || '无');

  return [
    renderedBuiltinPrompt,
    `用户要求：${instruction}`,
    `本次必须返回的 UID：${requestedUids}`,
    '',
    '当前可编辑内容（JSON）：',
    entriesPayload,
    '',
    '请返回严格符合下面结构的 JSON：',
    buildBatchResponseShape(fieldOptions),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildInfoSectionXml(readonlyEntries = [], modifiedEntries = []) {
  return buildWorkspaceInfoSectionXml({ readonlyEntries, modifiedEntries });
}

function buildContextualBatchPrompt(
  lorebookName,
  instruction,
  entries,
  fieldOptions,
  promptSettings = {},
  contextEntries = {},
) {
  const entriesPayload = buildEntriesPayload(entries, fieldOptions);
  const editableEntries = JSON.parse(entriesPayload).entries;
  const enabledFields = getEditableFieldLabels(fieldOptions).join('、');
  const requestedUids = editableEntries.map(entry => entry.uid).join(', ');
  const builtinPromptTemplate = typeof promptSettings?.builtinPromptTemplate === 'string'
    ? promptSettings.builtinPromptTemplate.trim()
    : '';
  const renderedBuiltinPrompt = builtinPromptTemplate.replaceAll('{{editableFields}}', enabledFields || '无');
  const infoSection = buildWorkspaceInfoSectionXml(contextEntries);

  return [
    infoSection,
    '',
    '<条目>',
    entriesPayload,
    '</条目>',
    '',
    '<用户指令>',
    instruction,
    `本次必须返回的 UID：${requestedUids}`,
    '</用户指令>',
    '',
    '<提示词>',
    renderedBuiltinPrompt,
    '补充约束：只能修改<条目>中的 UID，<信息> 仅供理解上下文，不得直接输出，不得把<信息>中的条目当作返回对象。',
    `允许读取和修改的字段：${enabledFields || '无'}`,
    '</提示词>',
    '',
    '请只返回严格符合下列结构的 JSON：',
    buildBatchResponseShape(fieldOptions),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildContextualBatchPromptV2(
  lorebookName,
  instruction,
  entries,
  fieldOptions,
  promptSettings = {},
  contextEntries = {},
) {
  const entriesPayload = buildEntriesPayload(entries, fieldOptions);
  const editableEntries = JSON.parse(entriesPayload).entries;
  const enabledFields = getEditableFieldLabels(fieldOptions).join('、');
  const requestedUids = editableEntries.map(entry => entry.uid).join(', ');
  const jailbreakPromptTemplate = typeof promptSettings?.jailbreakPromptTemplate === 'string'
    ? promptSettings.jailbreakPromptTemplate.trim()
    : '';
  const builtinPromptTemplate = typeof promptSettings?.builtinPromptTemplate === 'string'
    ? promptSettings.builtinPromptTemplate.trim()
    : '';
  const renderedJailbreakPrompt = jailbreakPromptTemplate.replaceAll('{{editableFields}}', enabledFields || '无');
  const renderedBuiltinPrompt = builtinPromptTemplate.replaceAll('{{editableFields}}', enabledFields || '无');
  const infoSection = buildWorkspaceInfoSectionXml(contextEntries, { includePlan: true });

  return [
    renderedJailbreakPrompt,
    infoSection,
    '',
    '<条目>',
    entriesPayload,
    '</条目>',
    '',
    '<用户指令>',
    instruction,
    `本次必须返回的 UID：${requestedUids}`,
    '</用户指令>',
    '',
    '<提示词>',
    renderedBuiltinPrompt,
    '补充约束：只能修改<条目>中的 UID，<信息> 仅供理解上下文，不得直接输出，不得把<信息>中的条目当作返回对象。',
    `允许读取和修改的字段：${enabledFields || '无'}`,
    '</提示词>',
    '',
    '请只返回严格符合下列结构的 JSON：',
    buildBatchResponseShape(fieldOptions),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPlanningPrompt(lorebookName, instruction, entries, promptSettings = {}, contextEntries = {}) {
  const entriesPayload = buildPlanningEntriesPayload(entries);
  const jailbreakPromptTemplate = typeof promptSettings?.jailbreakPromptTemplate === 'string'
    ? promptSettings.jailbreakPromptTemplate.trim()
    : '';
  const builtinPromptTemplate = typeof promptSettings?.builtinPromptTemplate === 'string'
    ? promptSettings.builtinPromptTemplate.trim()
    : '';
  const planningPromptTemplate = typeof promptSettings?.planningPromptTemplate === 'string'
    ? promptSettings.planningPromptTemplate.trim()
    : '';
  const infoSection = buildWorkspaceInfoSectionXml(contextEntries);

  return [
    jailbreakPromptTemplate,
    infoSection,
    '<条目全集>',
    entriesPayload,
    '</条目全集>',
    '',
    '<用户指令>',
    instruction,
    '</用户指令>',
    '',
    '<提示词>',
    planningPromptTemplate,
    '</提示词>',
    '',
    '强制规划契约：plan.entry_tasks 必须逐一覆盖 editable_uids；每项必须包含 uid、objective、complexity、estimated_output_tokens、depends_on_uids、related_uids。complexity 只能是 low/medium/high，输出估算必须是 64-64000 的整数。依赖可引用修改或只读条目，关联只能引用修改条目。',
    '',
    '请只返回严格符合下列结构的 JSON：',
    JSON.stringify(
      {
        readonly_uids: [1, 2],
        editable_uids: [3, 4],
        plan: {
          goal: '',
          must_keep: [''],
          rewrite_rules: [''],
          consistency_notes: [''],
          entry_tasks: [
            {
              uid: 3,
              objective: '',
              complexity: 'medium',
              estimated_output_tokens: 1024,
              depends_on_uids: [],
              related_uids: [4],
            },
          ],
        },
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

function parseParsedBatchPayload(parsed) {
  if (Array.isArray(parsed?.entries)) {
    return parsed.entries;
  }
  if (Array.isArray(parsed?.result?.entries)) {
    return parsed.result.entries;
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isPlainObject(parsed) && Number.isFinite(ensureNumericUID(parsed.uid))) {
    return [parsed];
  }
  throw new Error('JSON 根节点不是 entries 数组');
}

function parseAiBatchResponse(rawText) {
  const candidate = extractJsonCandidate(rawText);

  try {
    return parseParsedBatchPayload(JSON.parse(candidate));
  } catch (error) {
    throw new Error(`AI 返回的 JSON 无法解析: ${error.message}`);
  }
}

function parseAiBatchResponseWithRepair(rawText) {
  const candidate = extractJsonCandidate(rawText);

  try {
    return parseParsedBatchPayload(JSON.parse(candidate));
  } catch (error) {
    const repairedCandidate = repairJsonCandidate(candidate);
    if (repairedCandidate !== candidate) {
      try {
        return parseParsedBatchPayload(JSON.parse(repairedCandidate));
      } catch {
        // fall through to the original parse error below
      }
    }
    throw new Error(`AI 返回的 JSON 无法解析: ${error.message}`);
  }
}

function parseAiPlanResponse(rawText, validUids = []) {
  const candidate = extractJsonCandidate(rawText);
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    const repairedCandidate = repairJsonCandidate(candidate);
    if (repairedCandidate !== candidate) {
      parsed = JSON.parse(repairedCandidate);
    } else {
      throw error;
    }
  }
  const validUidSet = new Set((validUids || []).map(uid => ensureNumericUID(uid)).filter(uid => uid >= 0));
  const rawReadonlyUids = Array.isArray(parsed?.readonly_uids) ? parsed.readonly_uids.map(uid => ensureNumericUID(uid)) : [];
  const rawEditableUids = Array.isArray(parsed?.editable_uids) ? parsed.editable_uids.map(uid => ensureNumericUID(uid)) : [];
  const unknownUids = [...rawReadonlyUids, ...rawEditableUids].filter(uid => !validUidSet.has(uid));
  if (unknownUids.length) {
    throw new Error(`规划结果包含不存在的 UID: ${_.uniq(unknownUids).join(', ')}`);
  }
  const duplicateReadonlyUids = rawReadonlyUids.filter((uid, index) => rawReadonlyUids.indexOf(uid) !== index);
  const duplicateEditableUids = rawEditableUids.filter((uid, index) => rawEditableUids.indexOf(uid) !== index);
  if (duplicateReadonlyUids.length || duplicateEditableUids.length) {
    throw new Error(
      `规划结果包含重复 UID: ${_.uniq([...duplicateReadonlyUids, ...duplicateEditableUids]).join(', ')}`,
    );
  }
  const readonlyUids = _.uniq(rawReadonlyUids.filter(uid => validUidSet.has(uid)));
  const editableUids = _.uniq(rawEditableUids.filter(uid => validUidSet.has(uid)));
  const overlap = readonlyUids.filter(uid => editableUids.includes(uid));
  if (overlap.length) {
    throw new Error(`规划结果中 readonly_uids 与 editable_uids 重叠: ${overlap.join(', ')}`);
  }

  const rawPlan = isPlainObject(parsed?.plan) ? parsed.plan : {};
  const rawEntryTasks = Array.isArray(rawPlan.entry_tasks) ? rawPlan.entry_tasks : [];
  const taskUids = rawEntryTasks.map(task => ensureNumericUID(task?.uid));
  const duplicateTaskUids = taskUids.filter((uid, index) => uid >= 0 && taskUids.indexOf(uid) !== index);
  if (duplicateTaskUids.length) {
    throw new Error(`规划任务包含重复 UID: ${_.uniq(duplicateTaskUids).join(', ')}`);
  }
  const normalizeTaskUidList = (value, fieldName, taskUid) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new Error(`UID ${taskUid} 的 ${fieldName} 必须是 UID 数组`);
    }
    const normalized = value.map(uid => ensureNumericUID(uid));
    const invalid = normalized.filter(uid => uid < 0 || !validUidSet.has(uid));
    if (invalid.length) {
      throw new Error(`UID ${taskUid} 的 ${fieldName} 包含不存在的 UID: ${_.uniq(invalid).join(', ')}`);
    }
    const duplicates = normalized.filter((uid, index) => normalized.indexOf(uid) !== index);
    if (duplicates.length) {
      throw new Error(`UID ${taskUid} 的 ${fieldName} 包含重复 UID: ${_.uniq(duplicates).join(', ')}`);
    }
    if (normalized.includes(taskUid)) {
      throw new Error(`UID ${taskUid} 不能依赖或关联自身`);
    }
    return normalized;
  };
  const entryTasks = rawEntryTasks.map(task => {
    if (!isPlainObject(task)) {
      throw new Error('plan.entry_tasks 中的任务必须是对象');
    }
    const uid = ensureNumericUID(task.uid);
    if (uid < 0 || !validUidSet.has(uid)) {
      throw new Error(`规划任务包含不存在的 UID: ${task.uid}`);
    }
    const complexity = task.complexity || 'medium';
    if (!['low', 'medium', 'high'].includes(complexity)) {
      throw new Error(`UID ${uid} 的 complexity 必须是 low、medium 或 high`);
    }
    const rawEstimate = task.estimated_output_tokens ?? 1024;
    const parsedEstimate = Number.parseInt(`${rawEstimate}`, 10);
    if (!Number.isFinite(parsedEstimate) || parsedEstimate <= 0) {
      throw new Error(`UID ${uid} 的 estimated_output_tokens 必须是正整数`);
    }
    return {
      uid,
      objective: typeof task.objective === 'string' && task.objective.trim()
        ? task.objective.trim()
        : '按用户指令处理该条目',
      complexity,
      estimated_output_tokens: Math.min(64000, Math.max(64, parsedEstimate)),
      depends_on_uids: normalizeTaskUidList(task.depends_on_uids, 'depends_on_uids', uid),
      related_uids: normalizeTaskUidList(task.related_uids, 'related_uids', uid),
    };
  });
  return {
    readonly_uids: readonlyUids,
    editable_uids: editableUids,
    plan: {
      goal: typeof rawPlan.goal === 'string' ? rawPlan.goal.trim() : '',
      must_keep: sanitizeStringArray(rawPlan.must_keep),
      rewrite_rules: sanitizeStringArray(rawPlan.rewrite_rules),
      consistency_notes: sanitizeStringArray(rawPlan.consistency_notes),
      entry_tasks: entryTasks,
    },
    parsedJsonCandidate: candidate,
  };
}

function buildPlanSectionXml(plan = null) {
  if (!isPlainObject(plan)) {
    return '';
  }

  const lines = [];
  if (typeof plan.goal === 'string' && plan.goal.trim()) {
    lines.push('<目标>');
    lines.push(escapeXmlText(plan.goal.trim()));
    lines.push('</目标>');
  }

  const pushRuleSection = (tagName, items = []) => {
    const normalized = sanitizeStringArray(items);
    if (!normalized.length) {
      return;
    }
    lines.push(`<${tagName}>`);
    normalized.forEach(item => {
      lines.push('  <规则>');
      lines.push(`  ${escapeXmlText(item)}`);
      lines.push('  </规则>');
    });
    lines.push(`</${tagName}>`);
  };

  pushRuleSection('必须保留', plan.must_keep);
  pushRuleSection('改写规则', plan.rewrite_rules);
  pushRuleSection('一致性说明', plan.consistency_notes);
  if (Array.isArray(plan.entry_tasks) && plan.entry_tasks.length) {
    lines.push('<执行任务>');
    lines.push(escapeXmlText(JSON.stringify(plan.entry_tasks, null, 2)));
    lines.push('</执行任务>');
  }

  if (!lines.length) {
    return '';
  }

  return ['<改造方案>', ...lines, '</改造方案>'].join('\n');
}

function mergePlanSelectionWithLocks(
  parsedPlan,
  lockedEditableUids = [],
  lockedReadonlyUids = [],
  instruction = '按用户指令处理该条目',
) {
  const lockedEditable = normalizeUidList(lockedEditableUids);
  const lockedReadonly = normalizeUidList(lockedReadonlyUids).filter(uid => !lockedEditable.includes(uid));
  const plannedReadonly = normalizeUidList(parsedPlan?.readonly_uids)
    .filter(uid => !lockedEditable.includes(uid) && !lockedReadonly.includes(uid));
  const plannedEditable = normalizeUidList(parsedPlan?.editable_uids)
    .filter(uid => !lockedEditable.includes(uid) && !lockedReadonly.includes(uid) && !plannedReadonly.includes(uid));

  const readonlyUids = _.uniq([...lockedReadonly, ...plannedReadonly]);
  const editableUids = _.uniq([...lockedEditable, ...plannedEditable]);
  const allowedContextUids = new Set([...editableUids, ...readonlyUids]);
  const taskByUid = new Map(
    (Array.isArray(parsedPlan?.plan?.entry_tasks) ? parsedPlan.plan.entry_tasks : [])
      .filter(task => editableUids.includes(ensureNumericUID(task?.uid)))
      .map(task => [ensureNumericUID(task.uid), task]),
  );
  const entryTasks = editableUids.map(uid => {
    const task = taskByUid.get(uid) || {
      uid,
      objective: instruction || '按用户指令处理该条目',
      complexity: 'medium',
      estimated_output_tokens: 1024,
      depends_on_uids: [],
      related_uids: [],
    };
    const invalidDependencies = (task.depends_on_uids || []).filter(dependencyUid => !allowedContextUids.has(dependencyUid));
    if (invalidDependencies.length) {
      throw new Error(`UID ${uid} 依赖已排除的 UID: ${_.uniq(invalidDependencies).join(', ')}`);
    }
    const invalidRelated = (task.related_uids || []).filter(relatedUid => !editableUids.includes(relatedUid));
    if (invalidRelated.length) {
      throw new Error(`UID ${uid} 关联了非修改条目 UID: ${_.uniq(invalidRelated).join(', ')}`);
    }
    return task;
  });

  return {
    ...parsedPlan,
    readonly_uids: readonlyUids,
    editable_uids: editableUids,
    locked_editable_uids: lockedEditable,
    locked_readonly_uids: lockedReadonly,
    planned_editable_uids: plannedEditable,
    planned_readonly_uids: plannedReadonly,
    plan: {
      ...(parsedPlan?.plan || {}),
      entry_tasks: entryTasks,
    },
  };
}

function formatErrorDetails(error) {
  if (!error) {
    return '未知错误';
  }

  const lines = [];
  if (error.name) lines.push(`错误类型: ${error.name}`);
  if (error.message) lines.push(`错误信息: ${error.message}`);
  if (error.stack) lines.push(`错误堆栈:\n${error.stack}`);
  return lines.join('\n');
}

function buildPreviewDiffs(beforeEntry, afterEntry, fieldOptions) {
  const normalizedFieldOptions = normalizeFieldOptions(fieldOptions);
  const diffs = [];
  const beforeKeywords = getKeywordSnapshot(beforeEntry);
  const afterKeywords = getKeywordSnapshot(afterEntry);

  const pushDiff = (label, beforeValue, afterValue) => {
    if (!_.isEqual(beforeValue, afterValue)) {
      diffs.push({ label, before: beforeValue, after: afterValue });
    }
  };

  if (normalizedFieldOptions.title) {
    pushDiff('标题', beforeEntry?.name || '', afterEntry?.name || '');
  }

  if (normalizedFieldOptions.content) {
    const beforeContent = beforeEntry?.content || '';
    const afterContent = afterEntry?.content || '';
    if (!_.isEqual(beforeContent, afterContent)) {
      diffs.push({
        label: '内容差异',
        type: 'content-snippets',
        snippets: buildContentDiffSnippets(beforeContent, afterContent),
        before: summarizeText(beforeContent),
        after: summarizeText(afterContent),
      });
    }
  }

  if (normalizedFieldOptions.prompt) {
    pushDiff('关键词', beforeKeywords, afterKeywords);
  }

  return diffs;
}

function stripCompatibilityModelPrefix(model = '') {
  const normalizedModel = typeof model === 'string' ? model.trim() : '';
  for (const prefix of COMPATIBILITY_MODEL_PREFIXES) {
    if (normalizedModel.startsWith(prefix)) {
      return normalizedModel.slice(prefix.length).trim();
    }
  }
  return normalizedModel;
}

function buildCompatibilityAttemptConfigs(customApi, shouldStream) {
  const originalModel = typeof customApi?.model === 'string' ? customApi.model.trim() : '';
  const baseModel = stripCompatibilityModelPrefix(originalModel);
  const normalizedShouldStream = shouldStream === true;
  const models = _.uniq(
    [
      originalModel,
      baseModel,
      baseModel ? `流式抗截断/${baseModel}` : '',
      baseModel ? `假流式/${baseModel}` : '',
    ].filter(Boolean),
  );
  const streamValues = _.uniq([normalizedShouldStream, !normalizedShouldStream]);

  return models
    .flatMap(model =>
      streamValues.map(streamValue => ({
        model,
        shouldStream: streamValue,
        customApi: { ...(customApi || {}), model },
      })),
    )
    .filter(
      config => !(
        config.model === originalModel
        && config.shouldStream === normalizedShouldStream
      ),
    );
}

function summarizeAttemptError(errorText = '') {
  if (typeof errorText !== 'string') {
    return '未知错误';
  }

  const lines = errorText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const summary = [];
  for (const line of lines) {
    if (
      line.startsWith('完整发送内容') ||
      line.startsWith('完整返回内容') ||
      line.startsWith('提取出的 JSON') ||
      line.startsWith('错误堆栈:')
    ) {
      break;
    }
    summary.push(line);
    if (summary.length >= 3) {
      break;
    }
  }

  return summary.join(' | ') || '未知错误';
}

function shouldRunCompatibilityDiagnostics(customApi, attemptResult) {
  if ((customApi?.source || '').trim() !== 'custom') {
    return false;
  }
  if (!attemptResult || attemptResult.success) {
    return false;
  }

  const haystack = [
    attemptResult.errorDetails,
    attemptResult.rawResponse,
    ...(Array.isArray(attemptResult.errors) ? attemptResult.errors.map(item => item.error) : []),
  ]
    .filter(Boolean)
    .join('\n');

  return COMPATIBILITY_FAILURE_PATTERNS.some(pattern => pattern.test(haystack));
}

function buildAttemptErrors({ targetEntries, lastError, requestPrompt, rawText, parsedJsonCandidate }) {
  return targetEntries.map(entry => ({
    uid: ensureNumericUID(entry.uid),
    title: entry.name || `UID ${entry.uid}`,
    error: buildDetailedErrorMessage('本次批量请求失败', [
      formatErrorDetails(lastError),
      `完整发送内容:\n${requestPrompt || '(空)'}`,
      `完整返回内容:\n${rawText || '(空)'}`,
      `提取出的 JSON:\n${parsedJsonCandidate || '(空)'}`,
    ]),
  }));
}

function buildAttemptItems({ targetEntries, parsedDrafts, normalizedFieldOptions, rawText, sourceMode = 'direct' }) {
  const items = [];
  const errors = [];
  const warnings = [];
  const draftsByUid = new Map(
    parsedDrafts
      .map(draft => [ensureNumericUID(draft?.uid), draft])
      .filter(([uid, draft]) => uid >= 0 && isPlainObject(draft)),
  );
  const targetUidSet = new Set(targetEntries.map(entry => ensureNumericUID(entry.uid)));
  const extraUids = Array.from(draftsByUid.keys()).filter(uid => !targetUidSet.has(uid));
  if (extraUids.length) {
    warnings.push({
      title: 'AI 返回额外 UID',
      warning: buildDetailedErrorMessage('AI 返回了本批目标之外的 UID，已忽略。', [
        `额外 UID: ${_.uniq(extraUids).join(', ')}`,
        `本批目标 UID: ${Array.from(targetUidSet).join(', ') || '(无)'}`,
      ]),
    });
  }

  targetEntries.forEach(entry => {
    const uid = ensureNumericUID(entry.uid);
    const draft = draftsByUid.get(uid);

    if (!draft) {
      errors.push({
        uid,
        title: entry.name || `UID ${entry.uid}`,
        error: buildDetailedErrorMessage('AI 返回中缺少该 UID 对应的结果', [
          `缺失 UID: ${uid}`,
          `实际返回 UID: ${Array.from(draftsByUid.keys()).join(', ') || '(无)'}`,
          `完整返回内容:\n${rawText || '(空)'}`,
        ]),
      });
      return;
    }

    try {
      const afterEntry = normalizeAiDraft(draft, entry, normalizedFieldOptions);
      const diffs = buildPreviewDiffs(entry, afterEntry, normalizedFieldOptions);

      items.push({
        uid,
        title: entry.name || `UID ${entry.uid}`,
        beforeEntry: _.cloneDeep(entry),
        beforeEntryHash: buildAiEntryHash(entry),
        afterEntry,
        editableFields: { ...normalizedFieldOptions },
        conflictStatus: 'none',
        sourceMode,
        diffs,
        changed: diffs.length > 0,
      });
    } catch (entryError) {
      errors.push({
        uid,
        title: entry.name || `UID ${entry.uid}`,
        error: buildDetailedErrorMessage('该条目的 AI 返回数据解析失败', [
          `UID: ${uid}`,
          `错误信息: ${entryError?.message || '未知错误'}`,
          `AI 返回的 draft: ${JSON.stringify(draft, null, 2)}`,
        ]),
      });
    }
  });

  return { items, errors, warnings };
}

async function executePreviewAttempt(options = {}) {
  const {
    attemptLabel = '',
    lorebookName,
    trimmedInstruction,
    targetEntries,
    normalizedFieldOptions,
    promptSettings,
    customApi,
    shouldStream,
    invokeClient,
    onGenerationStart,
    requestPrompt,
    shouldStop,
    batchLabel = '',
    sourceMode = 'direct',
    contextBudget = {},
  } = options;

  let parsedDrafts = [];
  let rawText = '';
  let lastError = null;
  let parsedJsonCandidate = '';
  let errorDetails = '';
  let stopped = false;
  const startedAt = Date.now();

  for (let attempt = 0; attempt <= AI_BATCH_REQUEST_MAX_RETRIES; attempt++) {
    if (shouldStop?.()) {
      stopped = true;
      lastError = new Error(STOP_PREVIEW_MESSAGE);
      errorDetails = formatErrorDetails(lastError);
      break;
    }

    try {
      console.info('[世界书 AI] 完整发送内容', { batchLabel, attemptLabel, requestPrompt });
      rawText = await invokeClient(requestPrompt, {
        lorebookName,
        entries: _.cloneDeep(targetEntries),
        instruction: trimmedInstruction,
        promptSettings,
        customApi,
        onGenerationStart,
        shouldStream,
        contextBudget,
      });
      console.info('[世界书 AI] 完整返回内容', { batchLabel, attemptLabel, rawText });

      try {
        parsedJsonCandidate = extractJsonCandidate(rawText);
        parsedDrafts = parseAiBatchResponseWithRepair(rawText);
      } catch (error) {
        throw new Error(
          buildDetailedErrorMessage(error.message, [
            `第 ${attempt + 1} 次请求`,
            `完整返回内容:\n${rawText || '(空)'}`,
            `提取出的 JSON:\n${parsedJsonCandidate || '(空)'}`,
          ]),
        );
      }

      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      errorDetails = formatErrorDetails(error);
      console.error('[世界书 AI] 本次批量请求失败', {
        batchLabel,
        第几次尝试: attempt + 1,
        attemptLabel,
        错误详情: errorDetails,
      });
      if (shouldStop?.()) {
        stopped = true;
        break;
      }
    }
  }

  const { items, errors, warnings } = stopped
    ? { items: [], errors: [], warnings: [] }
    : lastError
    ? {
      items: [],
      errors: buildAttemptErrors({
        targetEntries,
        lastError,
        requestPrompt,
        rawText,
        parsedJsonCandidate,
      }),
      warnings: [],
    }
    : buildAttemptItems({
      targetEntries,
      parsedDrafts,
      normalizedFieldOptions,
      rawText,
      sourceMode,
      contextBudget,
    });

  const diagnostics = lastError && shouldRunCompatibilityDiagnostics(customApi, {
    success: false,
    errorDetails,
    rawResponse: rawText,
    errors,
  })
    ? {
      attempted: true,
      summary: summarizeAttemptError(errorDetails || rawText || ''),
      attempts: buildCompatibilityAttemptConfigs(customApi, shouldStream),
    }
    : null;

  return {
    attemptLabel,
    model: customApi?.model || '',
    shouldStream: Boolean(shouldStream),
    stopped,
    success: !lastError,
    errorSummary: errors.length
      ? summarizeAttemptError(errors[0]?.error || errorDetails)
      : errorDetails
        ? summarizeAttemptError(errorDetails)
        : '',
    requestPrompt,
    items,
    errors,
    warnings,
    rawResponse: rawText,
    parsedJsonCandidate,
    errorDetails,
    durationMs: Date.now() - startedAt,
    diagnostics,
    resolvedConfig: {
      model: customApi?.model || '',
      shouldStream: Boolean(shouldStream),
      success: !lastError,
      attemptLabel,
    },
  };
}

export const generateAiPlan = errorCatched(async (options = {}) => {
  const {
    lorebookName,
    instruction = '',
    promptSettings = {},
    customApi = null,
    onGenerationStart,
    shouldStream = false,
    chatMessages = [],
    referenceMaterial = '',
    lockedEditableUids = [],
    lockedReadonlyUids = [],
    contextBudget = {},
  } = options;
  const trimmedInstruction = instruction.trim();

  if (!lorebookName) {
    throw new Error('缺少 lorebookName');
  }
  if (!trimmedInstruction) {
    throw new Error('请输入 AI 指令');
  }

  const allEntries = await collectAiTargetEntriesFromSingle(lorebookName, []);
  if (!allEntries.length) {
    throw new Error('没有可供规划的条目');
  }

  const requestPrompt = buildPlanningPrompt(lorebookName, trimmedInstruction, allEntries, promptSettings, {
    chatMessages,
    referenceMaterial,
    lockedEditableUids,
    lockedReadonlyUids,
  });
  const rawResponse = await requestLlmText({
    prompt: requestPrompt,
    promptSettings,
    customApi,
    onGenerationStart,
    shouldStream,
    maxOutputTokens: normalizeContextBudget(contextBudget).reserveOutputTokens,
  });
  const parsed = mergePlanSelectionWithLocks(
    parseAiPlanResponse(rawResponse, allEntries.map(entry => entry.uid)),
    lockedEditableUids,
    lockedReadonlyUids,
    trimmedInstruction,
  );

  return {
    ...parsed,
    debug: {
      requestPrompt,
      rawResponse,
      parsedJsonCandidate: parsed.parsedJsonCandidate || '',
      errorDetails: '',
    },
  };
}, 'generateAiPlan');

export const generateAiPreview = errorCatched(async (options = {}) => {
  const {
    lorebookName,
    entryUids = [],
    readonlyEntryUids = [],
    planningResult = null,
    instruction = '',
    onProgress,
    client,
    fieldOptions = {},
    promptSettings = {},
    customApi = null,
    onGenerationStart,
    shouldStream = false,
    shouldStop,
    chatMessages = [],
    referenceMaterial = '',
    contextBudget = {},
    sourceMode = 'direct',
  } = options;
  const trimmedInstruction = instruction.trim();

  if (!lorebookName) {
    throw new Error('缺少 lorebookName');
  }
  if (!trimmedInstruction) {
    throw new Error('请输入 AI 指令');
  }

  const normalizedFieldOptions = normalizeFieldOptions(fieldOptions);
  if (!normalizedFieldOptions.title && !normalizedFieldOptions.content && !normalizedFieldOptions.prompt) {
    throw new Error('请至少选择一个可发送且可修改的字段');
  }

  const targetEntries = await collectAiTargetEntriesFromSingle(lorebookName, entryUids);
  const targetUidSet = new Set(targetEntries.map(entry => ensureNumericUID(entry.uid)));
  const readonlyEntries = readonlyEntryUids.length > 0
    ? (await collectAiTargetEntriesFromSingle(lorebookName, readonlyEntryUids))
      .filter(entry => !targetUidSet.has(ensureNumericUID(entry.uid)))
    : [];
  if (targetEntries.length === 0) {
    throw new Error('没有可供 AI 处理的条目');
  }
  const effectivePlanningResult = sourceMode === 'plan'
    && !Array.isArray(planningResult?.plan?.entry_tasks)
    ? {
        ...(planningResult || {}),
        plan: {
          ...(planningResult?.plan || {}),
          entry_tasks: targetEntries.map(entry => ({
            uid: ensureNumericUID(entry?.uid),
            objective: trimmedInstruction || '按用户指令处理该条目',
            complexity: 'medium',
            estimated_output_tokens: 1024,
            depends_on_uids: [],
            related_uids: [],
          })),
        },
      }
    : planningResult;

  const invokeClient = typeof client === 'function' ? client : callDefaultAiClient;
  const batchScheduling = await buildBatchPlans({
    lorebookName,
    instruction: trimmedInstruction,
    targetEntries,
    fieldOptions: normalizedFieldOptions,
    promptSettings,
    contextBudget,
    contextEntries: {
      plan: effectivePlanningResult?.plan || null,
      chatMessages,
      referenceMaterial,
      readonlyEntries,
      modifiedEntries: [],
    },
    sourceMode,
    planningResult: effectivePlanningResult,
  });
  const batchPlans = batchScheduling.plans;
  const schedulingWarnings = [...(batchScheduling.warnings || [])];

  console.groupCollapsed('[世界书 AI] 批量预览请求');
  try {
    console.info('[世界书 AI] 目标条目', {
      世界书: lorebookName,
      条目数量: targetEntries.length,
      条目UID: targetEntries.map(entry => ensureNumericUID(entry.uid)),
      字段配置: normalizedFieldOptions,
      批次数量: batchPlans.length,
      批次详情: batchPlans.map(plan => ({
        batch: plan.batchNumber,
        entryCount: plan.entryCount,
        entryTokenCount: plan.entryTokenCount,
        isOversized: plan.isOversized,
      })),
    });

    console.info('[世界书 AI] token计数来源', {
      sources: _.uniq(batchPlans.map(plan => plan.tokenCountSource || 'fallback')),
      batches: batchPlans.map(plan => ({
        batch: plan.batchNumber,
        entryTokenCount: plan.entryTokenCount,
        tokenCountSource: plan.tokenCountSource || 'fallback',
      })),
    });

    const batchResults = [];
    let totalSucceeded = 0;
    let totalFailed = 0;
    let modifiedContextEntries = [];
    let processedBatchCount = 0;
    const successfulPlanUids = new Set();
    const readonlyUidSet = new Set(readonlyEntries.map(entry => ensureNumericUID(entry?.uid)));
    const dependencyErrors = [];

    for (let batchCursor = 0; batchCursor < batchPlans.length; batchCursor++) {
      const batchPlan = batchPlans[batchCursor];
      processedBatchCount = batchCursor + 1;
      const blockedPlanUids = findBlockedPlanUids(
        batchPlan.tasks || [],
        successfulPlanUids,
        readonlyUidSet,
      );
      const eligibleEntries = batchPlan.entries.filter(entry => !blockedPlanUids.has(ensureNumericUID(entry?.uid)));
      blockedPlanUids.forEach((dependencies, uid) => {
        const entry = batchPlan.entries.find(candidate => ensureNumericUID(candidate?.uid) === uid);
        dependencyErrors.push(makeDependencyError(entry, dependencies));
      });
      totalFailed += blockedPlanUids.size;
      if (!eligibleEntries.length) {
        emitPreviewProgress(onProgress, {
          phase: 'running',
          batchTotal: batchPlans.length,
          batchCompleted: batchPlan.batchIndex + 1,
          totalEntries: targetEntries.length,
          succeeded: totalSucceeded,
          failed: totalFailed,
          title: `批次 ${batchPlan.batchNumber}/${batchPlans.length} 因依赖失败已跳过`,
        });
        continue;
      }
      const eligibleUidSet = new Set(eligibleEntries.map(entry => ensureNumericUID(entry?.uid)));
      const executionPlan = {
        ...batchPlan,
        entries: eligibleEntries,
        entryCount: eligibleEntries.length,
        tasks: (batchPlan.tasks || []).filter(task => eligibleUidSet.has(ensureNumericUID(task?.uid))),
        cyclicGroups: (batchPlan.cyclicGroups || [])
          .map(group => group.filter(uid => eligibleUidSet.has(ensureNumericUID(uid))))
          .filter(group => group.length > 1),
      };
      const actualPrompt = buildContextualBatchPromptV2(
        lorebookName,
        trimmedInstruction,
        executionPlan.entries,
        normalizedFieldOptions,
        promptSettings,
        {
          plan: effectivePlanningResult?.plan || null,
          chatMessages,
          referenceMaterial,
          readonlyEntries,
          modifiedEntries: modifiedContextEntries,
        },
      );
      const actualPromptTokenDetails = await getTokenCountDetails(actualPrompt);
      const normalizedBudget = normalizeContextBudget(contextBudget);
      executionPlan.entryTokenCount = actualPromptTokenDetails.count;
      executionPlan.tokenCountSource = actualPromptTokenDetails.source;
      executionPlan.isOversized = normalizedBudget.enabled
        && actualPromptTokenDetails.count > normalizedBudget.maxInputTokens;
      batchPlan.entryTokenCount = executionPlan.entryTokenCount;
      batchPlan.tokenCountSource = executionPlan.tokenCountSource;
      batchPlan.isOversized = executionPlan.isOversized;
      if (executionPlan.isOversized) {
        schedulingWarnings.push(
          `批次 ${batchPlan.batchNumber} 输入约 ${actualPromptTokenDetails.count} tokens${actualPromptTokenDetails.source === 'fallback' ? '（字符估算）' : ''}，超过警戒值 ${normalizedBudget.maxInputTokens}，已按原计划继续发送。`,
        );
      }

      emitPreviewProgress(onProgress, {
        phase: 'running',
        batchTotal: batchPlans.length,
        batchCompleted: batchPlan.batchIndex,
        totalEntries: targetEntries.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
        title: `批量预览 ${batchPlan.batchNumber}/${batchPlans.length}（${executionPlan.entryCount} 条，请求约 ${executionPlan.entryTokenCount} tokens）`,
      });

      let batchResult = await executeSingleBatch({
        batchPlan: executionPlan,
        totalBatches: batchPlans.length,
        lorebookName,
        trimmedInstruction,
        normalizedFieldOptions,
        promptSettings,
        customApi,
        shouldStream,
        invokeClient,
        onGenerationStart,
        shouldStop,
        readonlyEntries,
        modifiedEntries: modifiedContextEntries,
        planningResult: effectivePlanningResult,
        chatMessages,
        referenceMaterial,
        contextBudget,
        sourceMode,
      });
      batchResult = enforceBatchDependencyResults(batchResult, executionPlan);
      batchResults.push(batchResult);

      totalSucceeded += batchResult.summary.succeeded;
      totalFailed += batchResult.summary.failed;
      if (Array.isArray(batchResult.items) && batchResult.items.length > 0) {
        batchResult.items.forEach(item => successfulPlanUids.add(ensureNumericUID(item?.uid)));
        modifiedContextEntries = modifiedContextEntries.concat(
          batchResult.items.map(item => _.cloneDeep(item.afterEntry)),
        );
      }

      if (batchResult.outcome === 'cancelled' || shouldStop?.()) {
        break;
      }
    }

    const items = batchResults.flatMap(result => result.items || []);
    const errors = [...dependencyErrors, ...batchResults.flatMap(result => result.errors || [])];
    const normalizedSchedulingWarnings = schedulingWarnings.map(warning => {
      if (typeof warning === 'string') {
        return { title: '批次警告', warning };
      }
      if (warning?.warning) {
        return warning;
      }
      return {
        ...warning,
        title: '规划排批警告',
        warning: warning?.message || '规划批次存在输出风险。',
      };
    });
    const warnings = _.uniqBy(
      [...normalizedSchedulingWarnings, ...batchResults.flatMap(result => result.warnings || [])],
      warning => `${warning?.title || ''}\n${warning?.warning || warning || ''}`,
    );
    const changedCount = items.filter(item => item.changed).length;
    const stopped = Boolean(shouldStop?.()) || batchResults.some(result => result.outcome === 'cancelled');
    const cancelledCount = stopped ? Math.max(0, targetEntries.length - items.length - errors.length) : 0;
    const outcome = resolveAiPreviewOutcome({
      total: targetEntries.length,
      succeeded: items.length,
      failed: errors.length,
      cancelled: stopped,
    });
    const debug = mergeDebugOutput(batchPlans, batchResults);
    const diagnostics = mergeDiagnosticsSummary(batchResults);
    const batching = {
      ...mergeBatchingSummary(batchPlans),
      strategy: batchScheduling.strategy,
      safeOutputCapacity: batchScheduling.safeOutputCapacity,
      totalEstimatedOutputWeight: batchScheduling.totalEstimatedOutputWeight,
    };
    const resolvedConfig = batchResults.find(result => result.resolvedConfig)?.resolvedConfig || {
      model: customApi?.model || '',
      shouldStream: Boolean(shouldStream),
      success: false,
      attemptLabel: '',
    };

    emitPreviewProgress(onProgress, {
      phase: 'running',
      batchTotal: batchPlans.length,
      batchCompleted: processedBatchCount,
      totalEntries: targetEntries.length,
      succeeded: items.length,
      failed: errors.length,
      title: `批量预览完成（${processedBatchCount}/${batchPlans.length} 批）`,
    });

    return {
      outcome,
      lorebookName,
      instruction: trimmedInstruction,
      fieldOptions: normalizedFieldOptions,
      targetCount: targetEntries.length,
      items,
      errors,
      warnings,
      debug,
      summary: {
        total: targetEntries.length,
        succeeded: items.length,
        failed: errors.length,
        cancelled: cancelledCount,
        changed: changedCount,
        unchanged: items.length - changedCount,
        diagnostics,
        batching,
      },
      resolvedConfig,
    };
  } finally {
    console.groupEnd();
  }
}, 'generateAiPreview');
