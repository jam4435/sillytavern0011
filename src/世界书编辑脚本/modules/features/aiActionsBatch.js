import {
  collectAiTargetEntries as collectAiTargetEntriesFromSingle,
  applyAiPreview as applyAiPreviewFromSingle,
} from './aiActions.js';
export {
  collectAiTargetEntries,
  applyAiPreview,
} from './aiActions.js';
import { requestLlmText } from './llmClient.js';
import { ensureNumericUID, errorCatched } from '../utils.js';

const CLEAN_COMPATIBILITY_MODEL_PREFIXES = ['流式抗截断/', '假流式/'];
const CLEAN_COMPATIBILITY_FAILURE_PATTERNS = [
  /Got response status 503/i,
  /Service Unavailable/i,
  /无可用渠道/i,
  /distributor/i,
];
const CLEAN_STOP_PREVIEW_MESSAGE = '已停止生成';

const VALID_SECONDARY_LOGIC = new Set(['and_any', 'and_all', 'not_all', 'not_any']);
const AI_BATCH_REQUEST_MAX_RETRIES = 0;
const AI_BATCH_MAX_ENTRY_TOKENS = 4000;
const AI_BATCH_TOKEN_FALLBACK_DIVISOR = 4;
const COMPATIBILITY_MODEL_PREFIXES = ['流式抗截断/', '假流式/'];
const COMPATIBILITY_FAILURE_PATTERNS = [
  /Got response status 503/i,
  /Service Unavailable/i,
  /无可用渠道/i,
  /distributor/i,
];
const STOP_PREVIEW_MESSAGE = '已停止生成';

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

function buildContentDiffSnippets(beforeText, afterText, options = {}) {
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
    snapshot.keywords = getKeywordSnapshot(entry);
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

function buildBatchPromptDuplicate(lorebookName, instruction, entries, fieldOptions, promptSettings = {}) {
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

function escapeXmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
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
    lines.push(`  <${tagName}>`);
    lines.push(escapeXmlText(entry?.content || ''));
    lines.push(`  </${tagName}>`);
  });
  lines.push(`</${sectionName}>`);
  return lines.join('\n');
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

function buildInfoSectionXmlDuplicate(readonlyEntries = [], modifiedEntries = []) {
  const usedNames = new Set();
  const sections = [
    buildInfoGroupXml('只读条目', readonlyEntries, usedNames),
    buildInfoGroupXml('已修改批次', modifiedEntries, usedNames),
  ].filter(Boolean);

  if (!sections.length) {
    return '';
  }

  return ['<信息>', ...sections, '</信息>'].join('\n');
}

function buildContextualBatchPromptDuplicate(
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
  const infoSection = buildInfoSectionXml(
    contextEntries.readonlyEntries || [],
    contextEntries.modifiedEntries || [],
  );

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

function buildContextualBatchPromptV2Duplicate(
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
  const usedNames = new Set();
  const infoSections = [
    buildPlanSectionXml(contextEntries.plan || null),
    buildInfoGroupXml('只读条目', contextEntries.readonlyEntries || [], usedNames),
    buildInfoGroupXml('已修改批次', contextEntries.modifiedEntries || [], usedNames),
  ].filter(Boolean);
  const infoSection = infoSections.length ? ['<信息>', ...infoSections, '</信息>'].join('\n') : '';

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

function buildPlanningPromptDuplicate(lorebookName, instruction, entries, promptSettings = {}) {
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

  return [
    jailbreakPromptTemplate,
    '<条目全集>',
    entriesPayload,
    '</条目全集>',
    '',
    '<用户指令>',
    instruction,
    '</用户指令>',
    '',
    '<提示词>',
    builtinPromptTemplate,
    planningPromptTemplate,
    '</提示词>',
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
        },
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join('\n');
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

async function buildBatchPlans({ lorebookName, instruction, targetEntries, fieldOptions, promptSettings }) {
  const plans = [];
  let currentEntries = [];
  let currentPrompt = '';
  let currentEntryTokenCount = 0;
  let currentEntryTokenSource = 'fallback';

  const finalizeCurrent = () => {
    if (!currentEntries.length) {
      return;
    }

    plans.push({
      entries: currentEntries,
      requestPrompt: currentPrompt,
      entryTokenCount: currentEntryTokenCount,
      tokenCountSource: currentEntryTokenSource,
      isOversized: currentEntryTokenCount > AI_BATCH_MAX_ENTRY_TOKENS,
    });
  };

  for (const entry of targetEntries) {
    const candidateEntries = [...currentEntries, entry];
    const candidateEntriesPayload = buildEntriesPayload(candidateEntries, fieldOptions);
    const candidatePrompt = buildBatchPrompt(
      lorebookName,
      instruction,
      candidateEntries,
      fieldOptions,
      promptSettings,
    );
    const candidateEntryTokenDetails = await getTokenCountDetails(candidateEntriesPayload);
    const candidateEntryTokenCount = candidateEntryTokenDetails.count;
    const shouldSplit = candidateEntryTokenCount > AI_BATCH_MAX_ENTRY_TOKENS;

    if (shouldSplit && currentEntries.length > 0) {
      finalizeCurrent();
      currentEntries = [entry];
      const currentEntriesPayload = buildEntriesPayload(currentEntries, fieldOptions);
      currentPrompt = buildBatchPrompt(
        lorebookName,
        instruction,
        currentEntries,
        fieldOptions,
        promptSettings,
      );
      const currentEntryTokenDetails = await getTokenCountDetails(currentEntriesPayload);
      currentEntryTokenCount = currentEntryTokenDetails.count;
      currentEntryTokenSource = currentEntryTokenDetails.source;
      continue;
    }

    currentEntries = candidateEntries;
    currentPrompt = candidatePrompt;
    currentEntryTokenCount = candidateEntryTokenCount;
    currentEntryTokenSource = candidateEntryTokenDetails.source;
  }

  finalizeCurrent();

  return plans.map((plan, index) => ({
    ...plan,
    batchIndex: index,
    batchNumber: index + 1,
    entryCount: plan.entries.length,
  }));
}

async function callDefaultAiClient(prompt, options = {}) {
  return requestLlmText({
    prompt,
    promptSettings: options.promptSettings,
    customApi: options.customApi,
    onGenerationStart: options.onGenerationStart,
    shouldStream: options.shouldStream,
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

function parseParsedBatchPayloadDuplicate(parsed) {
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

function parseAiBatchResponseDuplicate(rawText) {
  const candidate = extractJsonCandidate(rawText);

  try {
    const parsed = JSON.parse(candidate);
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
  } catch (error) {
    throw new Error(`AI 返回的 JSON 无法解析: ${error.message}`);
  }
}

function parseAiBatchResponseWithRepairDuplicate(rawText) {
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

function parseAiPlanResponseDuplicate(rawText, validUids = []) {
  const candidate = extractJsonCandidate(rawText);
  const parsed = JSON.parse(candidate);
  const validUidSet = new Set((validUids || []).map(uid => ensureNumericUID(uid)).filter(uid => uid >= 0));
  const readonlyUids = _.uniq((Array.isArray(parsed?.readonly_uids) ? parsed.readonly_uids : [])
    .map(uid => ensureNumericUID(uid))
    .filter(uid => validUidSet.has(uid)));
  const editableUids = _.uniq((Array.isArray(parsed?.editable_uids) ? parsed.editable_uids : [])
    .map(uid => ensureNumericUID(uid))
    .filter(uid => validUidSet.has(uid)));
  const overlap = readonlyUids.filter(uid => editableUids.includes(uid));
  if (overlap.length) {
    throw new Error(`规划结果中 readonly_uids 与 editable_uids 重叠: ${overlap.join(', ')}`);
  }

  const rawPlan = isPlainObject(parsed?.plan) ? parsed.plan : {};
  return {
    readonly_uids: readonlyUids,
    editable_uids: editableUids,
    plan: {
      goal: typeof rawPlan.goal === 'string' ? rawPlan.goal.trim() : '',
      must_keep: sanitizeStringArray(rawPlan.must_keep),
      rewrite_rules: sanitizeStringArray(rawPlan.rewrite_rules),
      consistency_notes: sanitizeStringArray(rawPlan.consistency_notes),
    },
    parsedJsonCandidate: candidate,
  };
}

function buildPlanSectionXmlDuplicate(plan = null) {
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

  if (!lines.length) {
    return '';
  }

  return ['<改造方案>', ...lines, '</改造方案>'].join('\n');
}

function buildDetailedErrorMessage(summary, details = []) {
  return [summary, ...details.filter(Boolean)].join('\n');
}

function formatErrorDetailsDuplicate(error) {
  if (!error) {
    return '未知错误';
  }

  const lines = [];
  if (error.name) lines.push(`错误类型: ${error.name}`);
  if (error.message) lines.push(`错误信息: ${error.message}`);
  if (error.stack) lines.push(`错误堆栈:\n${error.stack}`);
  return lines.join('\n');
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
    const keywordDraft = Array.isArray(draft.keywords)
      ? draft.keywords
      : isPlainObject(draft.prompts)
        ? draft.prompts.primary
        : [];
    nextEntry.strategy = _.cloneDeep(nextEntry.strategy || {});
    nextEntry.strategy.keys = sanitizeStringArray(keywordDraft, getKeywordSnapshot(entry));
    nextEntry.strategy.keys_secondary = _.cloneDeep(nextEntry.strategy.keys_secondary || {});
    nextEntry.strategy.keys_secondary.logic = entry?.strategy?.keys_secondary?.logic || 'and_any';
    nextEntry.strategy.keys_secondary.keys = Array.isArray(entry?.strategy?.keys_secondary?.keys)
      ? [...entry.strategy.keys_secondary.keys]
      : [];
  }

  return nextEntry;
}

function buildPreviewDiffsDuplicate(beforeEntry, afterEntry, fieldOptions) {
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

function stripCompatibilityModelPrefixDuplicate(model = '') {
  const normalizedModel = typeof model === 'string' ? model.trim() : '';
  for (const prefix of COMPATIBILITY_MODEL_PREFIXES) {
    if (normalizedModel.startsWith(prefix)) {
      return normalizedModel.slice(prefix.length).trim();
    }
  }
  return normalizedModel;
}

function buildCompatibilityAttemptConfigsDuplicate(customApi, shouldStream) {
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

function summarizeAttemptErrorDuplicate(errorText = '') {
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

function shouldRunCompatibilityDiagnosticsDuplicate(customApi, attemptResult) {
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

function buildAttemptErrorsDuplicate({ targetEntries, lastError, requestPrompt, rawText, parsedJsonCandidate }) {
  return targetEntries.map(entry => ({
    uid: ensureNumericUID(entry.uid),
    title: entry.name || `UID ${entry.uid}`,
    error: buildDetailedErrorMessage('本次批量请求失败', [
      formatErrorDetails(lastError),
      `完整发送内容\n${requestPrompt || '(空)'}`,
      `完整返回内容:\n${rawText || '(空)'}`,
      `提取出的 JSON:\n${parsedJsonCandidate || '(空)'}`,
    ]),
  }));
}

function buildAttemptItemsDuplicate({ targetEntries, parsedDrafts, normalizedFieldOptions, rawText }) {
  const items = [];
  const errors = [];
  const draftsByUid = new Map(
    parsedDrafts
      .map(draft => [ensureNumericUID(draft?.uid), draft])
      .filter(([uid, draft]) => uid >= 0 && isPlainObject(draft)),
  );

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
        afterEntry,
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

  return { items, errors };
}

async function executePreviewAttemptDuplicate(options = {}) {
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
  } = options;

  let parsedDrafts = [];
  let rawText = '';
  let lastError = null;
  let parsedJsonCandidate = '';
  let errorDetails = '';
  const startedAt = Date.now();

  for (let attempt = 0; attempt <= AI_BATCH_REQUEST_MAX_RETRIES; attempt++) {
    if (shouldStop?.()) {
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
        break;
      }
    }
  }

  const { items, errors } = lastError
    ? {
      items: [],
      errors: buildAttemptErrors({
        targetEntries,
        lastError,
        requestPrompt,
        rawText,
        parsedJsonCandidate,
      }),
    }
    : buildAttemptItems({
      targetEntries,
      parsedDrafts,
      normalizedFieldOptions,
      rawText,
    });

  return {
    attemptLabel,
    model: customApi?.model || '',
    shouldStream: Boolean(shouldStream),
    durationMs: Date.now() - startedAt,
    success: !lastError && errors.length === 0,
    errorSummary: errors.length ? summarizeAttemptError(errors[0]?.error || errorDetails) : '',
    requestPrompt,
    rawResponse: rawText,
    parsedJsonCandidate,
    errorDetails,
    items,
    errors,
  };
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

  const lines = [
    `本次预览按 ${plans.length} 批发送，条目 JSON 达到 ${AI_BATCH_MAX_ENTRY_TOKENS} tokens 即切分。`,
  ];

  plans.forEach(plan => {
    lines.push(
      `批次 ${plan.batchNumber}: ${plan.entryCount} 条，条目约 ${plan.entryTokenCount} tokens${plan.isOversized ? '（单条已超限，按最小批次发送）' : ''}`,
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
  const items = adoptedAttempt?.items || [];
  const changedCount = items.filter(item => item.changed).length;
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
    lorebookName,
    instruction: trimmedInstruction,
    fieldOptions: normalizedFieldOptions,
    targetCount: targetEntries.length,
    items,
    errors: adoptedAttempt?.success ? [] : (resolvedAttempt?.errors || []),
    debug: {
      requestPrompt: resolvedAttempt?.requestPrompt || '',
      rawResponse: resolvedAttempt?.rawResponse || '',
      parsedJsonCandidate: resolvedAttempt?.parsedJsonCandidate || '',
      errorDetails: resolvedAttempt?.errorDetails || '',
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
      succeeded: adoptedAttempt?.success ? items.length : 0,
      failed: adoptedAttempt?.success ? 0 : targetEntries.length,
      changed: adoptedAttempt?.success ? changedCount : 0,
      unchanged: adoptedAttempt?.success ? items.length - changedCount : 0,
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
      model: resolvedAttempt?.model || '',
      shouldStream: Boolean(resolvedAttempt?.shouldStream),
      success: Boolean(adoptedAttempt?.success),
      attemptLabel: resolvedAttempt?.attemptLabel || '',
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
  });

  const attempts = [initialAttempt];
  let stopped = Boolean(shouldStop?.());
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
      });
      attempts.push(attemptResult);

      if (!adoptedAttempt && attemptResult.success) {
        adoptedAttempt = attemptResult;
      }
      if (shouldStop?.()) {
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
    builtinPromptTemplate,
    planningPromptTemplate,
    '</提示词>',
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
  const parsed = JSON.parse(candidate);
  const validUidSet = new Set((validUids || []).map(uid => ensureNumericUID(uid)).filter(uid => uid >= 0));
  const readonlyUids = _.uniq((Array.isArray(parsed?.readonly_uids) ? parsed.readonly_uids : [])
    .map(uid => ensureNumericUID(uid))
    .filter(uid => validUidSet.has(uid)));
  const editableUids = _.uniq((Array.isArray(parsed?.editable_uids) ? parsed.editable_uids : [])
    .map(uid => ensureNumericUID(uid))
    .filter(uid => validUidSet.has(uid)));
  const overlap = readonlyUids.filter(uid => editableUids.includes(uid));
  if (overlap.length) {
    throw new Error(`规划结果中 readonly_uids 与 editable_uids 重叠: ${overlap.join(', ')}`);
  }

  const rawPlan = isPlainObject(parsed?.plan) ? parsed.plan : {};
  return {
    readonly_uids: readonlyUids,
    editable_uids: editableUids,
    plan: {
      goal: typeof rawPlan.goal === 'string' ? rawPlan.goal.trim() : '',
      must_keep: sanitizeStringArray(rawPlan.must_keep),
      rewrite_rules: sanitizeStringArray(rawPlan.rewrite_rules),
      consistency_notes: sanitizeStringArray(rawPlan.consistency_notes),
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

  if (!lines.length) {
    return '';
  }

  return ['<改造方案>', ...lines, '</改造方案>'].join('\n');
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
  for (const prefix of CLEAN_COMPATIBILITY_MODEL_PREFIXES) {
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

  return CLEAN_COMPATIBILITY_FAILURE_PATTERNS.some(pattern => pattern.test(haystack));
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

function buildAttemptItems({ targetEntries, parsedDrafts, normalizedFieldOptions, rawText }) {
  const items = [];
  const errors = [];
  const draftsByUid = new Map(
    parsedDrafts
      .map(draft => [ensureNumericUID(draft?.uid), draft])
      .filter(([uid, draft]) => uid >= 0 && isPlainObject(draft)),
  );

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
        afterEntry,
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

  return { items, errors };
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
  } = options;

  let parsedDrafts = [];
  let rawText = '';
  let lastError = null;
  let parsedJsonCandidate = '';
  let errorDetails = '';
  const startedAt = Date.now();

  for (let attempt = 0; attempt <= AI_BATCH_REQUEST_MAX_RETRIES; attempt++) {
    if (shouldStop?.()) {
      lastError = new Error(CLEAN_STOP_PREVIEW_MESSAGE);
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
        break;
      }
    }
  }

  const { items, errors } = lastError
    ? {
      items: [],
      errors: buildAttemptErrors({
        targetEntries,
        lastError,
        requestPrompt,
        rawText,
        parsedJsonCandidate,
      }),
    }
    : buildAttemptItems({
      targetEntries,
      parsedDrafts,
      normalizedFieldOptions,
      rawText,
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
    success: !lastError,
    items,
    errors,
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
  });
  const rawResponse = await requestLlmText({
    prompt: requestPrompt,
    promptSettings,
    customApi,
    onGenerationStart,
    shouldStream,
  });
  const parsed = parseAiPlanResponse(rawResponse, allEntries.map(entry => entry.uid));

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

  const invokeClient = typeof client === 'function' ? client : callDefaultAiClient;
  const batchPlans = await buildBatchPlans({
    lorebookName,
    instruction: trimmedInstruction,
    targetEntries,
    fieldOptions: normalizedFieldOptions,
    promptSettings,
  });

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

    for (const batchPlan of batchPlans) {
      emitPreviewProgress(onProgress, {
        phase: 'running',
        batchTotal: batchPlans.length,
        batchCompleted: batchPlan.batchIndex,
        totalEntries: targetEntries.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
        title: `批量预览 ${batchPlan.batchNumber}/${batchPlans.length}（${batchPlan.entryCount} 条，条目约 ${batchPlan.entryTokenCount} tokens）`,
      });

      const batchResult = await executeSingleBatch({
        batchPlan,
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
        planningResult,
        chatMessages,
        referenceMaterial,
      });
      batchResults.push(batchResult);

      totalSucceeded += batchResult.summary.succeeded;
      totalFailed += batchResult.summary.failed;
      if (Array.isArray(batchResult.items) && batchResult.items.length > 0) {
        modifiedContextEntries = modifiedContextEntries.concat(
          batchResult.items.map(item => _.cloneDeep(item.afterEntry)),
        );
      }

      if (shouldStop?.()) {
        break;
      }
    }

    const items = batchResults.flatMap(result => result.items || []);
    const errors = batchResults.flatMap(result => result.errors || []);
    const changedCount = items.filter(item => item.changed).length;
    const debug = mergeDebugOutput(batchPlans, batchResults);
    const diagnostics = mergeDiagnosticsSummary(batchResults);
    const batching = mergeBatchingSummary(batchPlans);
    const resolvedConfig = batchResults.find(result => result.resolvedConfig)?.resolvedConfig || {
      model: customApi?.model || '',
      shouldStream: Boolean(shouldStream),
      success: false,
      attemptLabel: '',
    };

    emitPreviewProgress(onProgress, {
      phase: 'running',
      batchTotal: batchPlans.length,
      batchCompleted: batchResults.length,
      totalEntries: targetEntries.length,
      succeeded: items.length,
      failed: errors.length,
      title: `批量预览完成（${batchResults.length}/${batchPlans.length} 批）`,
    });

    return {
      lorebookName,
      instruction: trimmedInstruction,
      fieldOptions: normalizedFieldOptions,
      targetCount: targetEntries.length,
      items,
      errors,
      debug,
      summary: {
        total: targetEntries.length,
        succeeded: items.length,
        failed: errors.length,
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
