import { requestConfiguredText, resolveConfiguredTextSettings } from './summaryApiClient';
import {
  applyCurrentPresetModuleFilter,
  normalizeConversationSummaryTag,
  type SummarySettings,
} from './settingsManager';
import { dataLogger } from './logger';
import { isFrontendLoaderOnlyMessage, normalizeDisplayedMessageContent } from './variableReader';

type ChatRole = 'system' | 'assistant' | 'user';

type ChatMessageWithSwipes = {
  message_id: number;
  role: ChatRole;
  is_hidden?: boolean;
  message?: string;
  swipes?: string[];
  swipe_id?: number;
};

export type SmallSummaryBackfillAttemptStatus = 'success' | 'error';
export type SmallSummaryBackfillBatchStatus = 'running' | 'success' | 'partial' | 'error';

export interface SmallSummaryBackfillAttempt {
  status: SmallSummaryBackfillAttemptStatus;
  attemptedAt: number;
  batchId: string;
  error?: string;
}

export interface SmallSummaryBackfillItem {
  messageId: number;
  hasSummary: boolean;
  summary: string;
  summaryTag: string | null;
  body: string;
  preview: string;
  lastAttempt?: SmallSummaryBackfillAttempt;
}

export interface SmallSummaryBackfillBatch {
  id: string;
  messageIds: number[];
  items: SmallSummaryBackfillItem[];
}

export interface SmallSummaryBackfillBatchLog {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: SmallSummaryBackfillBatchStatus;
  firstMessageId: number;
  lastMessageId: number;
  requestedMessageIds: number[];
  succeededMessageIds: number[];
  failedMessageIds: number[];
  error?: string;
  responsePreview?: string;
}

export interface SmallSummaryBackfillSnapshot {
  scannedAt: number;
  summaryTag: string;
  batchSize: number;
  items: SmallSummaryBackfillItem[];
  batchLogs: SmallSummaryBackfillBatchLog[];
}

export interface SmallSummaryBackfillProgress {
  completedBatches: number;
  totalBatches: number;
  snapshot: SmallSummaryBackfillSnapshot;
}

export interface SmallSummaryBackfillResult {
  totalBatches: number;
  processedBatches: number;
  succeededMessageIds: number[];
  failedMessageIds: number[];
  snapshot: SmallSummaryBackfillSnapshot;
}

export interface ParsedSmallSummaryBatchResponse {
  summaries: Array<{ messageId: number; summary: string }>;
  missingMessageIds: number[];
  rejected: Array<{ messageId: number; error: string }>;
}

export const SMALL_SUMMARY_BACKFILL_EVENT = 'wuxia:smallSummaryBackfillUpdated';
export const DEFAULT_SMALL_SUMMARY_BACKFILL_BATCH_SIZE = 8;

const MIN_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;
const VARIABLE_BLOCK_START_REGEX = /<(?:Variable(?:Think|Insert|Edit|Delete)|era_data)\b/i;
const REFUSAL_SUMMARY_REGEX =
  /^(?:(?:抱歉|对不起|很抱歉)[，,\s]*(?:我)?(?:无法|不能)|I(?:'m| am) sorry\b|I can(?:not|'t)\b)/i;

let backfillBusy = false;
let latestSnapshot: SmallSummaryBackfillSnapshot | null = null;
const lastAttempts = new Map<number, SmallSummaryBackfillAttempt>();
let latestBatchLogs: SmallSummaryBackfillBatchLog[] = [];

function clampBatchSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SMALL_SUMMARY_BACKFILL_BATCH_SIZE;
  return Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, Math.floor(value)));
}

function escapeTagForRegex(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function createTagRegex(tagValue: string, global = true): RegExp {
  const tagName = normalizeConversationSummaryTag(tagValue);
  const escapedTag = escapeTagForRegex(tagName);
  return new RegExp('<' + escapedTag + '\\b[^>]*>[\\s\\S]*?<\\/' + escapedTag + '>', global ? 'gi' : 'i');
}

function extractTagContent(text: string, tagValue: string): string {
  const tagName = normalizeConversationSummaryTag(tagValue);
  const escapedTag = escapeTagForRegex(tagName);
  return text.match(
    new RegExp('<' + escapedTag + '\\b[^>]*>([\\s\\S]*?)<\\/' + escapedTag + '>', 'i'),
  )?.[1]?.trim() || '';
}

function removeTagBlocks(text: string, tagValue: string): string {
  return text
    .replace(createTagRegex(tagValue, true), '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length > 0) {
    const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
    const safeSwipeIndex = Math.max(0, Math.min(swipeIndex, swipes.length - 1));
    return swipes[safeSwipeIndex] || message.message || '';
  }
  return message.message || '';
}

function getConfiguredSmallSummaryTag(settings: SummarySettings): string {
  return settings.conversationSummaryMode === 'preset'
    ? normalizeConversationSummaryTag(settings.conversationSummaryPresetTag)
    : 'summary';
}

function findExistingSmallSummary(
  rawText: string,
  configuredTag: string,
): { summary: string; summaryTag: string | null } {
  const configuredSummary = extractTagContent(rawText, configuredTag);
  if (configuredSummary) {
    return { summary: configuredSummary, summaryTag: configuredTag };
  }

  if (configuredTag !== 'summary') {
    const cardSummary = extractTagContent(rawText, 'summary');
    if (cardSummary) {
      return { summary: cardSummary, summaryTag: 'summary' };
    }
  }

  return { summary: '', summaryTag: null };
}

function cleanAssistantBody(rawText: string, configuredTag: string): string {
  let cleaned = applyCurrentPresetModuleFilter(rawText);
  cleaned = removeTagBlocks(cleaned, configuredTag);
  if (configuredTag !== 'summary') {
    cleaned = removeTagBlocks(cleaned, 'summary');
  }
  return normalizeDisplayedMessageContent(cleaned).trim();
}

function readEligibleAssistantMessages(): ChatMessageWithSwipes[] {
  return (getChatMessages('0-{{lastMessageId}}', {
    role: 'assistant',
    hide_state: 'unhidden',
    include_swipes: true,
  }) as ChatMessageWithSwipes[])
    .filter(message => Number.isInteger(message.message_id))
    .filter(message => {
      const rawText = getActiveMessageText(message);
      return rawText.trim().length > 0 && !isFrontendLoaderOnlyMessage(rawText);
    })
    .sort((left, right) => left.message_id - right.message_id);
}

function dispatchSnapshot(snapshot: SmallSummaryBackfillSnapshot): SmallSummaryBackfillSnapshot {
  latestSnapshot = snapshot;
  try {
    window.dispatchEvent(new CustomEvent(SMALL_SUMMARY_BACKFILL_EVENT));
  } catch {
    // 测试或非浏览器环境只保留模块内快照。
  }
  return snapshot;
}

export function getLatestSmallSummaryBackfillSnapshot(): SmallSummaryBackfillSnapshot | null {
  if (!latestSnapshot) return null;
  return {
    ...latestSnapshot,
    items: latestSnapshot.items.map(item => ({
      ...item,
      ...(item.lastAttempt ? { lastAttempt: { ...item.lastAttempt } } : {}),
    })),
    batchLogs: latestSnapshot.batchLogs.map(log => ({
      ...log,
      requestedMessageIds: [...log.requestedMessageIds],
      succeededMessageIds: [...log.succeededMessageIds],
      failedMessageIds: [...log.failedMessageIds],
    })),
  };
}

export function scanSmallSummaryBackfill(settings: SummarySettings): SmallSummaryBackfillSnapshot {
  const summaryTag = getConfiguredSmallSummaryTag(settings);
  const items = readEligibleAssistantMessages()
    .map(message => {
      const rawText = getActiveMessageText(message);
      const existing = findExistingSmallSummary(rawText, summaryTag);
      const body = cleanAssistantBody(rawText, summaryTag);
      return {
        messageId: message.message_id,
        hasSummary: Boolean(existing.summary),
        summary: existing.summary,
        summaryTag: existing.summaryTag,
        body,
        preview: body.slice(0, 260),
        lastAttempt: lastAttempts.get(message.message_id),
      } satisfies SmallSummaryBackfillItem;
    })
    .filter(item => item.body.length > 0 || item.hasSummary);

  return dispatchSnapshot({
    scannedAt: Date.now(),
    summaryTag,
    batchSize: clampBatchSize(settings.conversationSummaryBackfillBatchSize),
    items,
    batchLogs: latestBatchLogs.map(log => ({
      ...log,
      requestedMessageIds: [...log.requestedMessageIds],
      succeededMessageIds: [...log.succeededMessageIds],
      failedMessageIds: [...log.failedMessageIds],
    })),
  });
}

export function buildSmallSummaryBackfillBatches(
  items: SmallSummaryBackfillItem[],
  batchSize: number,
  targetMessageId?: number,
): SmallSummaryBackfillBatch[] {
  const preferredSize = clampBatchSize(batchSize);
  const chunks: SmallSummaryBackfillBatch[] = [];
  let index = 0;

  while (index < items.length) {
    const remaining = items.length - index;
    let size = Math.min(preferredSize, remaining);

    // 正常历史聊天中每次请求都保持 5～10 个连续 Assistant 楼层。
    // 如果按首选大小切分会留下不足 5 层的尾批，就把若干楼层留给尾批。
    if (remaining > MAX_BATCH_SIZE && remaining - size > 0 && remaining - size < MIN_BATCH_SIZE) {
      size = Math.max(MIN_BATCH_SIZE, remaining - MIN_BATCH_SIZE);
    } else if (remaining <= MAX_BATCH_SIZE) {
      size = remaining;
    }

    const chunkItems = items.slice(index, index + size);
    index += size;
    if (chunkItems.length === 0 || !chunkItems.some(item => !item.hasSummary)) continue;

    const first = chunkItems[0].messageId;
    const last = chunkItems[chunkItems.length - 1].messageId;
    chunks.push({
      id: `${first}-${last}`,
      messageIds: chunkItems.map(item => item.messageId),
      items: chunkItems,
    });
  }

  // 极短聊天本身不足 5 个 Assistant 时无法满足 5 层下限，此时只形成唯一短批；
  // 这是唯一允许少于 5 层的情况，避免为了凑数读取不存在的楼层。
  if (targetMessageId === undefined) return chunks;
  return chunks.filter(batch => batch.messageIds.includes(targetMessageId));
}

export function buildSmallSummaryBackfillPrompt(
  batch: SmallSummaryBackfillBatch,
  summaryTag: string,
): string {
  const payload = {
    task: 'backfill_small_summaries',
    summary_tag: summaryTag,
    messages: batch.items.map(item => ({
      message_id: item.messageId,
      needs_summary: !item.hasSummary,
      ...(item.hasSummary ? { existing_summary: item.summary } : {}),
      content: item.body,
    })),
  };

  return `你负责补齐《金庸群侠传》旧聊天中缺失的“逐层小总结”。输入是一段连续的 Assistant 楼层；有些楼层已经有小总结，只作为连续剧情上下文，禁止重写。

要求：
1. 只为 needs_summary=true 的 message_id 生成小总结；needs_summary=false 的楼层不要返回。
2. 每层单独总结，绝不能把多层合并成一个总结，也不能把事实串到错误的 message_id。
3. 每层约 80～120 个中文字符，客观记录这一层实际发生且后续可能需要记住的事实。
4. 优先保留：游戏内时间、地点、关键人物、关系阶段变化、伤病/身份/重要物品/任务/事件的重要变化，以及已经明确成立的后续事项。
5. 大幅压缩对白修辞、逐招战斗、气氛、色情或感官过程；若这些内容确实造成长期关系/伤病/身份等后果，只保留后果，不复述露骨过程。
6. 不补写输入中没有发生的事实，不输出思维过程。
7. 如果某一层无法可靠总结，可以不返回该 message_id；其它楼层仍应正常返回。
8. 只输出严格 JSON，不要 Markdown 代码块、解释或额外文字。

输入 JSON：
${JSON.stringify(payload, null, 2)}

输出 JSON 必须是：
{"summaries":[{"message_id":191,"summary":"该层的小总结"},{"message_id":193,"summary":"该层的小总结"}]}`;
}

function unwrapSummaryText(value: string, summaryTag: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const wrappedCurrent = extractTagContent(trimmed, summaryTag);
  if (wrappedCurrent) return wrappedCurrent;
  const wrappedCard = summaryTag !== 'summary' ? extractTagContent(trimmed, 'summary') : '';
  return wrappedCard || trimmed;
}

function validateSummaryText(value: string): string {
  if (!value.trim()) return '小总结为空。';
  if (REFUSAL_SUMMARY_REGEX.test(value.trim())) return '模型返回了拒绝文本，没有可写入的小总结。';
  if (/<(?:Variable(?:Think|Insert|Edit|Delete)|era_data)\b/i.test(value)) {
    return '小总结混入了 ERA 变量块，拒绝写入。';
  }
  return '';
}

function parseStrictJsonResponse(rawResponse: string): unknown {
  const trimmed = rawResponse.trim();
  const fenced = trimmed.match(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i);
  const jsonText = fenced?.[1]?.trim() || trimmed;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`模型返回不是完整的严格 JSON（可能输出被截断）：${message}`);
  }
}

export function parseSmallSummaryBatchResponse(
  rawResponse: string,
  requestedMessageIds: number[],
  summaryTag: string,
): ParsedSmallSummaryBatchResponse {
  const parsed = parseStrictJsonResponse(rawResponse);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模型返回 JSON 根节点不是对象。');
  }

  const rawSummaries = (parsed as { summaries?: unknown }).summaries;
  if (!Array.isArray(rawSummaries)) {
    throw new Error('模型返回 JSON 缺少 summaries 数组。');
  }

  const requested = new Set(requestedMessageIds);
  const accepted = new Map<number, string>();
  const rejected: Array<{ messageId: number; error: string }> = [];

  for (const rawItem of rawSummaries) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const item = rawItem as { message_id?: unknown; summary?: unknown };
    const messageId = Number(item.message_id);
    if (!Number.isInteger(messageId) || !requested.has(messageId)) continue;
    if (accepted.has(messageId)) {
      rejected.push({ messageId, error: '模型对同一楼层返回了重复小总结。' });
      accepted.delete(messageId);
      continue;
    }
    if (typeof item.summary !== 'string') {
      rejected.push({ messageId, error: '模型返回的小总结不是字符串。' });
      continue;
    }

    const summary = unwrapSummaryText(item.summary, summaryTag).trim();
    const validationError = validateSummaryText(summary);
    if (validationError) {
      rejected.push({ messageId, error: validationError });
      continue;
    }
    accepted.set(messageId, summary);
  }

  const rejectedIds = new Set(rejected.map(item => item.messageId));
  const missingMessageIds = requestedMessageIds.filter(
    messageId => !accepted.has(messageId) && !rejectedIds.has(messageId),
  );

  return {
    summaries: [...accepted.entries()].map(([messageId, summary]) => ({ messageId, summary })),
    missingMessageIds,
    rejected,
  };
}

export function insertSmallSummaryIntoAssistantText(
  rawText: string,
  summaryTag: string,
  summary: string,
): string {
  if (findExistingSmallSummary(rawText, summaryTag).summary) return rawText;

  const tagName = normalizeConversationSummaryTag(summaryTag);
  const block = `<${tagName}>\n${summary.trim()}\n</${tagName}>`;
  const variableMatch = rawText.match(VARIABLE_BLOCK_START_REGEX);

  if (!variableMatch || variableMatch.index === undefined) {
    return `${rawText.trimEnd()}\n\n${block}`.trim();
  }

  const prefix = rawText.slice(0, variableMatch.index).trimEnd();
  const suffix = rawText.slice(variableMatch.index).trimStart();
  return [prefix, block, suffix].filter(Boolean).join('\n\n');
}

function readMessageWithSwipes(messageId: number): ChatMessageWithSwipes {
  const [message] = getChatMessages(messageId, {
    role: 'all',
    hide_state: 'all',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];
  if (!message) throw new Error(`找不到 Assistant #${messageId}。`);
  return message;
}

async function writeSmallSummaries(
  summaries: Array<{ messageId: number; summary: string }>,
  summaryTag: string,
): Promise<{ succeeded: number[]; failed: Array<{ messageId: number; error: string }> }> {
  if (summaries.length === 0) return { succeeded: [], failed: [] };

  const patches: Array<Record<string, unknown>> = [];
  const expected = new Map<number, string>();

  for (const item of summaries) {
    const message = readMessageWithSwipes(item.messageId);
    const rawText = getActiveMessageText(message);
    const existing = findExistingSmallSummary(rawText, summaryTag);
    if (existing.summary) {
      expected.set(item.messageId, existing.summary);
      continue;
    }

    const nextText = insertSmallSummaryIntoAssistantText(rawText, summaryTag, item.summary);
    const swipes = Array.isArray(message.swipes) ? [...message.swipes] : [];
    if (swipes.length > 0) {
      const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
      const safeSwipeIndex = Math.max(0, Math.min(swipeIndex, swipes.length - 1));
      swipes[safeSwipeIndex] = nextText;
      patches.push({
        message_id: item.messageId,
        message: nextText,
        swipe_id: safeSwipeIndex,
        swipes,
      });
    } else {
      patches.push({
        message_id: item.messageId,
        message: nextText,
      });
    }
    expected.set(item.messageId, item.summary);
  }

  let writeError = '';
  if (patches.length > 0) {
    try {
      await setChatMessages(patches, { refresh: 'none' });
    } catch (error) {
      writeError = error instanceof Error ? error.message : String(error);
    }
  }

  const succeeded: number[] = [];
  const failed: Array<{ messageId: number; error: string }> = [];
  for (const [messageId] of expected) {
    try {
      const written = readMessageWithSwipes(messageId);
      const actual = findExistingSmallSummary(getActiveMessageText(written), summaryTag).summary;
      if (actual) {
        succeeded.push(messageId);
      } else {
        failed.push({
          messageId,
          error: writeError ? `写入异常且回读未检测到小总结：${writeError}` : '写入后回读未检测到小总结。',
        });
      }
    } catch (error) {
      failed.push({
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { succeeded, failed };
}

function recordAttempt(
  messageId: number,
  status: SmallSummaryBackfillAttemptStatus,
  batchId: string,
  error?: string,
): void {
  lastAttempts.set(messageId, {
    status,
    attemptedAt: Date.now(),
    batchId,
    ...(error ? { error } : {}),
  });
}

function appendBatchLog(log: SmallSummaryBackfillBatchLog): void {
  latestBatchLogs = [...latestBatchLogs, log].slice(-24);
}

export async function backfillMissingSmallSummaries({
  settings,
  targetMessageId,
  onProgress,
}: {
  settings: SummarySettings;
  targetMessageId?: number;
  onProgress?: (progress: SmallSummaryBackfillProgress) => void;
}): Promise<SmallSummaryBackfillResult> {
  if (backfillBusy) {
    throw new Error('小总结补完正在运行，请等待当前批次完成。');
  }

  backfillBusy = true;
  try {
    const initial = scanSmallSummaryBackfill(settings);
    const batches = buildSmallSummaryBackfillBatches(
      initial.items,
      settings.conversationSummaryBackfillBatchSize,
      targetMessageId,
    );
    const requestSettings = resolveConfiguredTextSettings(settings, 'summary');
    const succeeded = new Set<number>();
    const failed = new Set<number>();

    if (batches.length === 0) {
      return {
        totalBatches: 0,
        processedBatches: 0,
        succeededMessageIds: [],
        failedMessageIds: [],
        snapshot: initial,
      };
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const requestedMessageIds = batch.items.filter(item => !item.hasSummary).map(item => item.messageId);
      const runId = `${batch.id}-${Date.now()}`;
      const log: SmallSummaryBackfillBatchLog = {
        id: runId,
        startedAt: Date.now(),
        status: 'running',
        firstMessageId: batch.items[0].messageId,
        lastMessageId: batch.items[batch.items.length - 1].messageId,
        requestedMessageIds: [...requestedMessageIds],
        succeededMessageIds: [],
        failedMessageIds: [],
      };
      appendBatchLog(log);
      scanSmallSummaryBackfill(settings);

      let rawResponse = '';
      try {
        rawResponse = await requestConfiguredText({
          prompt: buildSmallSummaryBackfillPrompt(batch, initial.summaryTag),
          settings: requestSettings,
          shouldStream: false,
          generationIdPrefix: 'wuxia-small-summary-backfill',
          skipWorldInfoAndAuthorNote: true,
        });

        const parsed = parseSmallSummaryBatchResponse(rawResponse, requestedMessageIds, initial.summaryTag);
        for (const messageId of parsed.missingMessageIds) {
          const error = '模型返回了有效 JSON，但没有返回该楼层的小总结。';
          recordAttempt(messageId, 'error', runId, error);
          failed.add(messageId);
        }
        for (const item of parsed.rejected) {
          recordAttempt(item.messageId, 'error', runId, item.error);
          failed.add(item.messageId);
        }

        const written = await writeSmallSummaries(parsed.summaries, initial.summaryTag);
        for (const messageId of written.succeeded) {
          recordAttempt(messageId, 'success', runId);
          succeeded.add(messageId);
          failed.delete(messageId);
        }
        for (const item of written.failed) {
          recordAttempt(item.messageId, 'error', runId, item.error);
          failed.add(item.messageId);
        }

        log.succeededMessageIds = requestedMessageIds.filter(messageId => succeeded.has(messageId));
        log.failedMessageIds = requestedMessageIds.filter(messageId => failed.has(messageId));
        log.responsePreview = rawResponse.slice(0, 1200);
        log.status =
          log.failedMessageIds.length === 0
            ? 'success'
            : log.succeededMessageIds.length > 0
              ? 'partial'
              : 'error';
        if (log.failedMessageIds.length > 0) {
          log.error =
            log.status === 'partial'
              ? '该批次只返回或写入了部分楼层；未成功楼层仍保持“缺少小总结”。'
              : '该批次没有成功补入任何缺失小总结。';
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const messageId of requestedMessageIds) {
          recordAttempt(messageId, 'error', runId, message);
          failed.add(messageId);
        }
        log.status = 'error';
        log.failedMessageIds = [...requestedMessageIds];
        log.error = message;
        if (rawResponse) log.responsePreview = rawResponse.slice(0, 1200);
        dataLogger.warn('[smallSummaryBackfill] 批次失败', {
          firstMessageId: log.firstMessageId,
          lastMessageId: log.lastMessageId,
          error: message,
        });
      } finally {
        log.finishedAt = Date.now();
        latestBatchLogs = latestBatchLogs.map(item => (item.id === log.id ? { ...log } : item));
      }

      const snapshot = scanSmallSummaryBackfill(settings);
      onProgress?.({
        completedBatches: batchIndex + 1,
        totalBatches: batches.length,
        snapshot,
      });
    }

    const snapshot = scanSmallSummaryBackfill(settings);
    return {
      totalBatches: batches.length,
      processedBatches: batches.length,
      succeededMessageIds: [...succeeded].sort((a, b) => a - b),
      failedMessageIds: [...failed].sort((a, b) => a - b),
      snapshot,
    };
  } finally {
    backfillBusy = false;
  }
}
