import { getWorldbookSafe, updateWorldbookEntries } from '../api.js';
import { requestLlmText } from './llmClient.js';
import { ensureNumericUID, errorCatched } from '../utils.js';

const RESERVED_META_ENTRY_PREFIX = '__WI_META_';
const VALID_SECONDARY_LOGIC = new Set(['and_any', 'and_all', 'not_all', 'not_any']);
const AI_BATCH_CONCURRENCY = 2;
const AI_ITEM_MAX_RETRIES = 1;

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

function getPromptSnapshot(entry) {
  return {
    primary: Array.isArray(entry?.strategy?.keys) ? [...entry.strategy.keys] : [],
    secondary_logic: VALID_SECONDARY_LOGIC.has(entry?.strategy?.keys_secondary?.logic)
      ? entry.strategy.keys_secondary.logic
      : 'and_any',
    secondary: Array.isArray(entry?.strategy?.keys_secondary?.keys) ? [...entry.strategy.keys_secondary.keys] : [],
  };
}

function buildEditableSnapshot(entry, fieldOptions) {
  const normalizedFieldOptions = normalizeFieldOptions(fieldOptions);
  const snapshot = {};

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

function buildResponseShape(fieldOptions) {
  return JSON.stringify(buildEditableSnapshot({}, fieldOptions), null, 2);
}

export function isReservedMetaEntry(entry) {
  return (entry?.name || '').startsWith(RESERVED_META_ENTRY_PREFIX);
}

export async function collectAiTargetEntries(lorebookName, entryUids = []) {
  const result = await getWorldbookSafe(lorebookName);
  if (!result.success) {
    throw result.error || new Error(`获取世界书 "${lorebookName}" 失败`);
  }

  const requestedUids = new Set((entryUids || []).map(uid => ensureNumericUID(uid)).filter(uid => uid >= 0));
  const allEntries = Array.isArray(result.data) ? result.data : [];
  const normalEntries = allEntries.filter(entry => !isReservedMetaEntry(entry));

  if (requestedUids.size === 0) {
    return normalEntries;
  }

  return normalEntries.filter(entry => requestedUids.has(ensureNumericUID(entry.uid)));
}

function buildEntryPrompt(lorebookName, instruction, entry, fieldOptions) {
  const editableSnapshot = buildEditableSnapshot(entry, fieldOptions);
  const enabledFields = Object.entries(normalizeFieldOptions(fieldOptions))
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .join('、');

  return [
    '你是世界书条目修改助手。',
    '请根据用户要求，只返回一个 JSON 对象，不要输出解释，不要输出 Markdown。',
    '禁止修改 UID、按用户要求修改字段。',
    `只允许读取和修改这些字段：${enabledFields || '无'}`,
    '如果某个允许字段不需要修改，请原样返回当前值。',
    '',
    `条目 UID：${entry.uid}`,
    `用户要求：${instruction}`,
    '',
    '当前可编辑内容（JSON）：',
    JSON.stringify(editableSnapshot, null, 2),
    '',
    '请返回严格符合下面结构的 JSON：',
    buildResponseShape(fieldOptions),
  ].join('\n');
}

async function callDefaultAiClient(prompt, options = {}) {
  return requestLlmText({
    prompt,
    customApi: options.customApi,
  });
}

function extractJsonCandidate(rawText) {
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return rawText.slice(firstBrace, lastBrace + 1).trim();
  }

  return rawText.trim();
}

function parseAiResponse(rawText) {
  const candidate = extractJsonCandidate(rawText);

  try {
    const parsed = JSON.parse(candidate);
    if (isPlainObject(parsed?.entry)) {
      return parsed.entry;
    }
    if (isPlainObject(parsed?.result)) {
      return parsed.result;
    }
    if (!isPlainObject(parsed)) {
      throw new Error('JSON 根节点不是对象');
    }
    return parsed;
  } catch (error) {
    throw new Error(`AI 返回的 JSON 无法解析: ${error.message}`);
  }
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
    const promptDraft = isPlainObject(draft.prompts) ? draft.prompts : {};
    nextEntry.strategy = _.cloneDeep(nextEntry.strategy || {});
    nextEntry.strategy.keys = sanitizeStringArray(promptDraft.primary, getPromptSnapshot(entry).primary);
    nextEntry.strategy.keys_secondary = _.cloneDeep(nextEntry.strategy.keys_secondary || {});
    nextEntry.strategy.keys_secondary.logic = VALID_SECONDARY_LOGIC.has(promptDraft.secondary_logic)
      ? promptDraft.secondary_logic
      : getPromptSnapshot(entry).secondary_logic;
    nextEntry.strategy.keys_secondary.keys = sanitizeStringArray(
      promptDraft.secondary,
      getPromptSnapshot(entry).secondary,
    );
  }

  return nextEntry;
}

function buildPreviewDiffs(beforeEntry, afterEntry, fieldOptions) {
  const normalizedFieldOptions = normalizeFieldOptions(fieldOptions);
  const diffs = [];
  const beforePrompts = getPromptSnapshot(beforeEntry);
  const afterPrompts = getPromptSnapshot(afterEntry);

  const pushDiff = (label, beforeValue, afterValue) => {
    if (!_.isEqual(beforeValue, afterValue)) {
      diffs.push({ label, before: beforeValue, after: afterValue });
    }
  };

  if (normalizedFieldOptions.title) {
    pushDiff('标题', beforeEntry?.name || '', afterEntry?.name || '');
  }

  if (normalizedFieldOptions.content) {
    pushDiff('内容摘要', summarizeText(beforeEntry?.content || ''), summarizeText(afterEntry?.content || ''));
  }

  if (normalizedFieldOptions.prompt) {
    pushDiff('主提示词', beforePrompts.primary, afterPrompts.primary);
    pushDiff('次提示词逻辑', beforePrompts.secondary_logic, afterPrompts.secondary_logic);
    pushDiff('次提示词', beforePrompts.secondary, afterPrompts.secondary);
  }

  return diffs;
}

async function buildPreviewItemForEntry({ lorebookName, entry, instruction, fieldOptions, invokeClient, customApi }) {
  let lastError = null;

  for (let attempt = 0; attempt <= AI_ITEM_MAX_RETRIES; attempt++) {
    try {
      const prompt = buildEntryPrompt(lorebookName, instruction, entry, fieldOptions);
      const rawText = await invokeClient(prompt, {
        lorebookName,
        entry: _.cloneDeep(entry),
        instruction,
        customApi,
      });
      const parsedDraft = parseAiResponse(rawText);
      const afterEntry = normalizeAiDraft(parsedDraft, entry, fieldOptions);
      const diffs = buildPreviewDiffs(entry, afterEntry, fieldOptions);

      return {
        ok: true,
        item: {
          uid: ensureNumericUID(entry.uid),
          title: entry.name || `UID ${entry.uid}`,
          beforeEntry: _.cloneDeep(entry),
          afterEntry,
          diffs,
          changed: diffs.length > 0,
          rawText,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    error: {
      uid: ensureNumericUID(entry.uid),
      title: entry.name || `UID ${entry.uid}`,
      error: lastError?.message || '未知错误',
    },
  };
}

async function mapWithConcurrency(items, worker, concurrency = AI_BATCH_CONCURRENCY) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export const generateAiPreview = errorCatched(async (options = {}) => {
  const {
    lorebookName,
    entryUids = [],
    instruction = '',
    onProgress,
    client,
    fieldOptions = {},
    customApi = null,
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

  const targetEntries = await collectAiTargetEntries(lorebookName, entryUids);
  if (targetEntries.length === 0) {
    throw new Error('没有可供 AI 处理的条目');
  }

  const invokeClient = typeof client === 'function' ? client : callDefaultAiClient;
  const items = [];
  const errors = [];
  const progressState = {
    completed: 0,
    succeeded: 0,
    failed: 0,
  };

  const results = await mapWithConcurrency(
    targetEntries,
    async entry => {
      onProgress?.({
        phase: 'running',
        total: targetEntries.length,
        completed: progressState.completed,
        succeeded: progressState.succeeded,
        failed: progressState.failed,
        title: entry.name || `UID ${entry.uid}`,
      });

      const result = await buildPreviewItemForEntry({
        lorebookName,
        entry,
        instruction: trimmedInstruction,
        fieldOptions: normalizedFieldOptions,
        invokeClient,
        customApi,
      });

      progressState.completed += 1;
      if (result.ok) {
        progressState.succeeded += 1;
      } else {
        progressState.failed += 1;
      }

      onProgress?.({
        phase: 'running',
        total: targetEntries.length,
        completed: progressState.completed,
        succeeded: progressState.succeeded,
        failed: progressState.failed,
        title: entry.name || `UID ${entry.uid}`,
      });

      return result;
    },
    AI_BATCH_CONCURRENCY,
  );

  results.forEach(result => {
    if (result?.ok) {
      items.push(result.item);
    } else if (result?.error) {
      errors.push(result.error);
    }
  });

  const changedCount = items.filter(item => item.changed).length;

  return {
    lorebookName,
    instruction: trimmedInstruction,
    fieldOptions: normalizedFieldOptions,
    targetCount: targetEntries.length,
    items,
    errors,
    summary: {
      total: targetEntries.length,
      succeeded: items.length,
      failed: errors.length,
      changed: changedCount,
      unchanged: items.length - changedCount,
    },
  };
}, 'generateAiPreview');

export const applyAiPreview = errorCatched(async options => {
  const { lorebookName, previewItems = [] } = options || {};

  if (!lorebookName) {
    throw new Error('缺少 lorebookName');
  }

  const changedItems = (previewItems || []).filter(item => item?.changed && item?.afterEntry);
  if (changedItems.length === 0) {
    return {
      success: true,
      changed: false,
      appliedCount: 0,
    };
  }

  const nextEntriesByUid = new Map(changedItems.map(item => [ensureNumericUID(item.uid), _.cloneDeep(item.afterEntry)]));

  const result = await updateWorldbookEntries(
    lorebookName,
    entries => {
      let hasChanges = false;
      const updatedEntries = entries.map(entry => {
        const numericUid = ensureNumericUID(entry.uid);
        const nextEntry = nextEntriesByUid.get(numericUid);
        if (!nextEntry) {
          return entry;
        }

        hasChanges = true;
        return _.cloneDeep(nextEntry);
      });

      return hasChanges ? updatedEntries : entries;
    },
    {
      trackHistory: true,
      transactionType: changedItems.length > 1 ? 'ai-edit-selected' : 'ai-edit-entry',
      transactionMeta: {
        appliedCount: changedItems.length,
      },
    },
  );

  if (!result.success) {
    throw result.error || new Error('应用 AI 预览失败');
  }

  return {
    success: true,
    changed: result.changed,
    appliedCount: changedItems.length,
  };
}, 'applyAiPreview');
