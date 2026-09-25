import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { dataLogger } from './logger';
import { requestConfiguredText, resolveConfiguredTextSettings } from './summaryApiClient';
import { applyCurrentPresetModuleFilter, normalizeConversationSummaryTag, type SummarySettings } from './settingsManager';
import { normalizeDisplayedMessageContent } from './variableReader';

type ChatRole = 'system' | 'assistant' | 'user';

type ChatMessageWithSwipes = {
  message_id: number;
  role: ChatRole;
  is_hidden?: boolean;
  message?: string;
  swipes?: string[];
  swipe_id?: number;
};

type NarrativeMemoryState = {
  章节摘要?: Record<string, NarrativeChapterRecord>;
  已归档至楼层?: number;
  已归档摘要数?: number;
};

export type NarrativeChapterRecord = {
  起始楼层: number;
  结束楼层: number;
  源摘要数: number;
  摘要: string;
  来源?: '逐轮摘要' | '历史回溯';
  源轮数?: number;
  /** 历史回溯章节精确覆盖的 assistant 楼层；避免只靠起止区间误删中间未参与回溯的楼层。 */
  源楼层?: number[];
};

export type ConversationArchiveItem = {
  messageId: number;
  summary: string;
};

export type ConversationArchiveResult = {
  archived: boolean;
  chapterKey?: string;
  archivedThroughMessageId?: number;
  sourceSummaryCount?: number;
};

export type HistoricalConversationBackfillProgress = {
  completedChapters: number;
  totalChapters: number;
  processedTurns: number;
  totalTurns: number;
};

export type HistoricalConversationBackfillResult = {
  archived: boolean;
  chapterCount: number;
  turnCount: number;
  archivedThroughMessageId?: number;
  sourceSummaryCount?: number;
};

type HistoricalConversationTurn = {
  userMessageId: number;
  assistantMessageId: number;
  userText: string;
  assistantText: string;
  sourceHadSummary: boolean;
};

let archiveBusy = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

function escapeSummaryTagForRegex(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function extractTurnSummary(text: string, summaryTag = 'summary'): string {
  const tagName = normalizeConversationSummaryTag(summaryTag);
  const escapedTag = escapeSummaryTagForRegex(tagName);
  return text.match(
    new RegExp('<' + escapedTag + '\\b[^>]*>([\\s\\S]*?)<\\/' + escapedTag + '>', 'i'),
  )?.[1]?.trim() || '';
}

export function selectConversationArchiveBatch(
  messages: ChatMessageWithSwipes[],
  {
    archivedThroughMessageId,
    recentReplies,
    batchSize,
    summaryTag = 'summary',
  }: { archivedThroughMessageId: number; recentReplies: number; batchSize: number; summaryTag?: string },
): ConversationArchiveItem[] {
  const assistantMessages = messages
    .filter(message => message.role === 'assistant' && Number.isInteger(message.message_id))
    .sort((left, right) => left.message_id - right.message_id);
  const keepRecent = Math.max(1, Math.floor(recentReplies));
  const protectedIds = new Set(assistantMessages.slice(-keepRecent).map(message => message.message_id));

  return assistantMessages
    .filter(message => message.message_id > archivedThroughMessageId && !protectedIds.has(message.message_id))
    .map(message => ({ messageId: message.message_id, summary: extractTurnSummary(getActiveMessageText(message), summaryTag) }))
    .filter(item => item.summary.length > 0)
    .slice(0, Math.max(1, Math.floor(batchSize)));
}

function readCurrentState(): { statData: Record<string, unknown>; memory: NarrativeMemoryState } {
  const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
  const statData = isRecord(variables?.stat_data) ? variables.stat_data : {};
  const memory = isRecord(statData.叙事记忆) ? (statData.叙事记忆 as NarrativeMemoryState) : {};
  return { statData, memory };
}

function readChatMessages(): ChatMessageWithSwipes[] {
  return getChatMessages('0-{{lastMessageId}}', {
    role: 'all',
    hide_state: 'unhidden',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];
}

function getNextChapterKey(chapters: Record<string, NarrativeChapterRecord>): string {
  const highest = Object.keys(chapters).reduce((max, key) => {
    const match = key.match(/^章节(\d+)$/);
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return `章节${String(highest + 1).padStart(3, '0')}`;
}

export function buildNarrativeArchivePrompt(items: ConversationArchiveItem[]): string {
  const source = items.map(item => `[楼层 ${item.messageId}] ${item.summary}`).join('\n');
  return `你负责把《金庸群侠传》一段已经结束的旧对话摘要压缩成长期章节记忆。输入是按真实先后排列的逐轮摘要。

【旧逐轮摘要】
${source}

【要求】
1. 只使用输入事实，不补写原著、不猜测动机、不把未发生的计划写成既成事实。
2. 精确保留输入中已有的游戏内日期、地点、关键人物、事件结果、关系阶段变化、身份/伤病/重要物品变化和仍未解决的重要事项。
3. 合并连续场景和重复信息，不逐轮复述；目标是让未来模型只读这一段就知道这段历史真正改变了什么。
4. 不写“玩家进行了若干对话”之类空话；尽量使用具体人名、地点和结果。
5. 输出约 180～320 个中文字符；只输出一个 <chapter_summary> 块。

<chapter_summary>
[长期章节摘要]
</chapter_summary>`;
}

function parseChapterSummary(response: string): string {
  const tagged = response.match(/<chapter_summary>([\s\S]*?)<\/chapter_summary>/i)?.[1]?.trim();
  const summary = tagged || response.trim();
  if (!summary) throw new Error('长期章节摘要为空。');
  return summary;
}

function createTransactionId(): string {
  try {
    if (typeof crypto?.randomUUID === 'function') return `narrative-${crypto.randomUUID()}`;
  } catch {
    // ignore
  }
  return `narrative-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildArchiveOperations(
  statData: Record<string, unknown>,
  chapterKey: string,
  chapter: NarrativeChapterRecord,
  archivedSummaryCount: number,
): Array<{ type: 'insert' | 'update'; payload: Record<string, unknown> }> {
  const memoryExists = isRecord(statData.叙事记忆);
  if (!memoryExists) {
    return [{
      type: 'insert',
      payload: {
        叙事记忆: {
          章节摘要: { [chapterKey]: chapter },
          已归档至楼层: chapter.结束楼层,
          已归档摘要数: archivedSummaryCount,
        },
      },
    }];
  }

  const memory = statData.叙事记忆 as Record<string, unknown>;
  const operations: Array<{ type: 'insert' | 'update'; payload: Record<string, unknown> }> = [{
    type: 'insert',
    payload: { 叙事记忆: { 章节摘要: { [chapterKey]: chapter } } },
  }];
  operations.push({
    type: Object.prototype.hasOwnProperty.call(memory, '已归档至楼层') ? 'update' : 'insert',
    payload: { 叙事记忆: { 已归档至楼层: chapter.结束楼层 } },
  });
  operations.push({
    type: Object.prototype.hasOwnProperty.call(memory, '已归档摘要数') ? 'update' : 'insert',
    payload: { 叙事记忆: { 已归档摘要数: archivedSummaryCount } },
  });
  return operations;
}

async function isArchivePersisted(chapterKey: string, chapter: NarrativeChapterRecord, expectedCount: number): Promise<boolean> {
  const { memory } = readCurrentState();
  const chapters = isRecord(memory.章节摘要) ? (memory.章节摘要 as Record<string, NarrativeChapterRecord>) : {};
  return (
    chapters[chapterKey]?.摘要 === chapter.摘要 &&
    Number(memory.已归档至楼层) === chapter.结束楼层 &&
    Number(memory.已归档摘要数) === expectedCount
  );
}


const HISTORICAL_BACKFILL_MAX_BATCH_CHARS = 28000;
const HISTORICAL_BACKFILL_MAX_USER_CHARS = 5000;
const HISTORICAL_BACKFILL_MAX_ASSISTANT_CHARS = 16000;

function clipHistoricalText(text: string, maxChars: number): string {
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim();
  if (normalized.length <= maxChars) return normalized;
  const tailLength = Math.max(1200, Math.floor(maxChars * 0.28));
  const headLength = Math.max(1200, maxChars - tailLength);
  return `${normalized.slice(0, headLength)}\n\n[……中段过长，回溯压缩时省略……]\n\n${normalized.slice(-tailLength)}`;
}

function getHistoricalChapterRanges(memory: NarrativeMemoryState): Array<{ start: number; end: number }> {
  const chapters = isRecord(memory.章节摘要)
    ? (memory.章节摘要 as Record<string, NarrativeChapterRecord>)
    : {};
  return Object.values(chapters)
    .filter(chapter => Number.isFinite(chapter?.起始楼层) && Number.isFinite(chapter?.结束楼层))
    .map(chapter => ({
      start: Math.min(Number(chapter.起始楼层), Number(chapter.结束楼层)),
      end: Math.max(Number(chapter.起始楼层), Number(chapter.结束楼层)),
    }));
}

function isMessageCoveredByHistoricalChapter(
  messageId: number,
  ranges: Array<{ start: number; end: number }>,
): boolean {
  return ranges.some(range => messageId >= range.start && messageId <= range.end);
}

function selectHistoricalConversationTurns(
  messages: ChatMessageWithSwipes[],
  memory: NarrativeMemoryState,
  recentReplies: number,
  summaryTag: string,
): HistoricalConversationTurn[] {
  const ordered = [...messages]
    .filter(message => !message.is_hidden && Number.isInteger(message.message_id))
    .sort((left, right) => left.message_id - right.message_id);
  const assistantMessages = ordered.filter(message => message.role === 'assistant');
  const protectedIds = new Set(
    assistantMessages
      .slice(-Math.max(1, Math.floor(recentReplies || 1)))
      .map(message => message.message_id),
  );
  const coveredRanges = getHistoricalChapterRanges(memory);
  const turns: HistoricalConversationTurn[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const assistant = ordered[index];
    if (
      assistant.role !== 'assistant' ||
      protectedIds.has(assistant.message_id) ||
      isMessageCoveredByHistoricalChapter(assistant.message_id, coveredRanges)
    ) {
      continue;
    }

    let user: ChatMessageWithSwipes | null = null;
    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previous = ordered[previousIndex];
      if (previous.role === 'assistant') break;
      if (previous.role === 'user') {
        user = previous;
        break;
      }
    }
    if (!user) continue;

    const rawAssistant = getActiveMessageText(assistant);
    const turnSummary = extractTurnSummary(rawAssistant, summaryTag);
    const assistantText = turnSummary
      ? turnSummary
      : normalizeDisplayedMessageContent(applyCurrentPresetModuleFilter(rawAssistant));
    const userText = getActiveMessageText(user).trim();
    if (!assistantText.trim()) continue;

    turns.push({
      userMessageId: user.message_id,
      assistantMessageId: assistant.message_id,
      userText: clipHistoricalText(userText, HISTORICAL_BACKFILL_MAX_USER_CHARS),
      assistantText: clipHistoricalText(assistantText, HISTORICAL_BACKFILL_MAX_ASSISTANT_CHARS),
      sourceHadSummary: Boolean(turnSummary),
    });
  }

  return turns;
}

function chunkHistoricalConversationTurns(
  turns: HistoricalConversationTurn[],
  requestedBatchSize: number,
): HistoricalConversationTurn[][] {
  const maxTurns = Math.max(2, Math.min(20, Math.floor(requestedBatchSize || 10)));
  const batches: HistoricalConversationTurn[][] = [];
  let current: HistoricalConversationTurn[] = [];
  let currentChars = 0;

  for (const turn of turns) {
    const turnChars = turn.userText.length + turn.assistantText.length + 160;
    if (
      current.length > 0 &&
      (current.length >= maxTurns || currentChars + turnChars > HISTORICAL_BACKFILL_MAX_BATCH_CHARS)
    ) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(turn);
    currentChars += turnChars;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function buildHistoricalConversationBackfillPrompt(turns: HistoricalConversationTurn[]): string {
  const source = turns
    .map(
      turn =>
        `[楼层 ${turn.userMessageId}→${turn.assistantMessageId}]\n玩家：${turn.userText || '（空）'}\n结果：${turn.assistantText}`,
    )
    .join('\n\n');

  return `你负责把《金庸群侠传》一段“过去没有逐轮摘要”的旧聊天回溯压缩成长期章节记忆。
这些原始楼层之后仍保留在聊天存档里，但未来提示词会用你的章节摘要替代它们，所以必须优先保住会影响后续剧情连续性的事实。

【旧聊天原文】
${source}

【要求】
1. 只使用输入事实，不补写原著、不猜测动机，也不要把玩家提出但正文没有落实的计划写成既成事实。
2. 保留明确的游戏内日期、地点、关键人物、关系变化、身份/伤病/重要物品、任务或事件结果，以及仍未解决的重要事项。
3. 合并重复描写与连续场景；对白修辞、逐招战斗、色情/感官细节和无长期影响的气氛描写应大幅压缩。
4. 若同一事实前后发生变化，以后出现的明确结果为准，同时保留必要的因果。
5. 输出约 260～520 个中文字符，只输出一个 <chapter_summary> 块。

<chapter_summary>
[长期章节摘要]
</chapter_summary>`;
}

function buildHistoricalBackfillOperations(
  statData: Record<string, unknown>,
  chapters: Record<string, NarrativeChapterRecord>,
  archivedThroughMessageId: number,
  archivedSummaryCount: number,
): Array<{ type: 'insert' | 'update'; payload: Record<string, unknown> }> {
  const memoryExists = isRecord(statData.叙事记忆);
  if (!memoryExists) {
    return [{
      type: 'insert',
      payload: {
        叙事记忆: {
          章节摘要: chapters,
          已归档至楼层: archivedThroughMessageId,
          已归档摘要数: archivedSummaryCount,
        },
      },
    }];
  }

  const memory = statData.叙事记忆 as Record<string, unknown>;
  return [
    { type: 'insert', payload: { 叙事记忆: { 章节摘要: chapters } } },
    {
      type: Object.prototype.hasOwnProperty.call(memory, '已归档至楼层') ? 'update' : 'insert',
      payload: { 叙事记忆: { 已归档至楼层: archivedThroughMessageId } },
    },
    {
      type: Object.prototype.hasOwnProperty.call(memory, '已归档摘要数') ? 'update' : 'insert',
      payload: { 叙事记忆: { 已归档摘要数: archivedSummaryCount } },
    },
  ];
}

async function isHistoricalBackfillPersisted(
  expectedChapters: Record<string, NarrativeChapterRecord>,
  expectedThrough: number,
  expectedSummaryCount: number,
): Promise<boolean> {
  const { memory } = readCurrentState();
  const chapters = isRecord(memory.章节摘要)
    ? (memory.章节摘要 as Record<string, NarrativeChapterRecord>)
    : {};
  return (
    Object.entries(expectedChapters).every(([key, chapter]) => chapters[key]?.摘要 === chapter.摘要) &&
    Number(memory.已归档至楼层) === expectedThrough &&
    Number(memory.已归档摘要数) === expectedSummaryCount
  );
}

/**
 * 给“以前没有开启逐轮摘要”的当前聊天补长期章节记忆。
 *
 * 关键约束：只写 stat_data.叙事记忆，不改任何历史 user / assistant / swipe 原文。
 * 最终 prompt 阶段会独立裁掉这些旧原文，并由“记忆区”中的长期章节记忆接替。
 */
export async function backfillHistoricalConversationMemory({
  settings,
  onProgress,
}: {
  settings: SummarySettings;
  onProgress?: (progress: HistoricalConversationBackfillProgress) => void;
}): Promise<HistoricalConversationBackfillResult> {
  if (archiveBusy) {
    throw new Error('长期叙事记忆正在执行其它归档任务，请稍后重试。');
  }

  archiveBusy = true;
  try {
    const messages = readChatMessages();
    const latestAssistant = [...messages]
      .filter(message => message.role === 'assistant' && Number.isInteger(message.message_id))
      .sort((left, right) => right.message_id - left.message_id)[0];
    if (!latestAssistant) {
      return { archived: false, chapterCount: 0, turnCount: 0 };
    }

    const { statData, memory } = readCurrentState();
    const summaryTag =
      settings.conversationSummaryMode === 'preset'
        ? settings.conversationSummaryPresetTag
        : 'summary';
    const turns = selectHistoricalConversationTurns(
      messages,
      memory,
      settings.conversationSummaryRecentReplies,
      summaryTag,
    );
    if (turns.length === 0) {
      return {
        archived: false,
        chapterCount: 0,
        turnCount: 0,
        archivedThroughMessageId: Number(memory.已归档至楼层) || undefined,
        sourceSummaryCount: Number(memory.已归档摘要数) || 0,
      };
    }

    const batches = chunkHistoricalConversationTurns(turns, settings.conversationArchiveBatchSize);
    const requestSettings = resolveConfiguredTextSettings(settings, 'summary');
    const existingChapters = isRecord(memory.章节摘要)
      ? (memory.章节摘要 as Record<string, NarrativeChapterRecord>)
      : {};
    const pendingChapterMap: Record<string, NarrativeChapterRecord> = {};
    let completedTurns = 0;

    onProgress?.({
      completedChapters: 0,
      totalChapters: batches.length,
      processedTurns: 0,
      totalTurns: turns.length,
    });

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const rawResponse = await requestConfiguredText({
        prompt: buildHistoricalConversationBackfillPrompt(batch),
        settings: requestSettings,
        shouldStream: false,
        generationIdPrefix: 'wuxia-narrative-backfill',
        skipWorldInfoAndAuthorNote: true,
      });
      const summary = parseChapterSummary(rawResponse);
      const chapterKey = getNextChapterKey({ ...existingChapters, ...pendingChapterMap });
      pendingChapterMap[chapterKey] = {
        起始楼层: batch[0].userMessageId,
        结束楼层: batch[batch.length - 1].assistantMessageId,
        源摘要数: batch.filter(turn => turn.sourceHadSummary).length,
        来源: '历史回溯',
        源轮数: batch.length,
        源楼层: batch.map(turn => turn.assistantMessageId),
        摘要: summary,
      };
      completedTurns += batch.length;
      onProgress?.({
        completedChapters: batchIndex + 1,
        totalChapters: batches.length,
        processedTurns: completedTurns,
        totalTurns: turns.length,
      });
    }

    const previousThrough = Number(memory.已归档至楼层) || -1;
    const archivedThroughMessageId = Math.max(
      previousThrough,
      ...turns.map(turn => turn.assistantMessageId),
    );
    const addedSummaryCount = turns.filter(turn => turn.sourceHadSummary).length;
    const archivedSummaryCount = Math.max(0, Number(memory.已归档摘要数) || 0) + addedSummaryCount;
    const operations = buildHistoricalBackfillOperations(
      statData,
      pendingChapterMap,
      archivedThroughMessageId,
      archivedSummaryCount,
    );
    const transactionId = createTransactionId();

    try {
      await emitSourcedEraVariableWriteAndWait({
        source: 'frontend',
        operation: 'update',
        reason: 'narrative-memory-backfill',
        refreshHint: 'none',
        eventName: 'era:transactionByObject',
        attribution: 'background',
        detail: { transactionId, operations },
        expectedMessageId: latestAssistant.message_id,
        expectedAction: 'apiWrite',
        expectedTransactionId: transactionId,
        timeoutMs: 10000,
        timeoutMessage: '旧聊天回溯压缩事务已发出，但 ERA 没有确认写入完成。',
      });
    } catch (error) {
      if (!(await isHistoricalBackfillPersisted(pendingChapterMap, archivedThroughMessageId, archivedSummaryCount))) {
        throw error;
      }
    }

    if (!(await isHistoricalBackfillPersisted(pendingChapterMap, archivedThroughMessageId, archivedSummaryCount))) {
      throw new Error('旧聊天回溯压缩写后校验失败。');
    }

    dataLogger.log('[narrativeMemory] 已完成旧聊天回溯压缩', {
      chapterCount: Object.keys(pendingChapterMap).length,
      turnCount: turns.length,
      archivedThroughMessageId,
      addedSummaryCount,
    });

    return {
      archived: true,
      chapterCount: Object.keys(pendingChapterMap).length,
      turnCount: turns.length,
      archivedThroughMessageId,
      sourceSummaryCount: archivedSummaryCount,
    };
  } finally {
    archiveBusy = false;
  }
}

export async function maybeArchiveConversationSummaries({
  settings,
  latestAssistantMessageId,
}: {
  settings: SummarySettings;
  latestAssistantMessageId: number;
}): Promise<ConversationArchiveResult> {
  if (
    archiveBusy ||
    !settings.conversationArchiveEnabled ||
    settings.conversationSummaryMode === 'off'
  ) {
    return { archived: false };
  }

  archiveBusy = true;
  try {
    const { statData, memory } = readCurrentState();
    const batchSize = Math.max(5, Math.min(50, Math.floor(settings.conversationArchiveBatchSize || 10)));
    const summaryTag =
      settings.conversationSummaryMode === 'preset'
        ? settings.conversationSummaryPresetTag
        : 'summary';
    const batch = selectConversationArchiveBatch(readChatMessages(), {
      archivedThroughMessageId: Number(memory.已归档至楼层) || -1,
      recentReplies: settings.conversationSummaryRecentReplies,
      batchSize,
      summaryTag,
    });
    if (batch.length < batchSize) return { archived: false };

    const requestSettings = resolveConfiguredTextSettings(settings, 'summary');
    const rawResponse = await requestConfiguredText({
      prompt: buildNarrativeArchivePrompt(batch),
      settings: requestSettings,
      shouldStream: false,
      generationIdPrefix: 'wuxia-narrative-archive',
      skipWorldInfoAndAuthorNote: true,
    });
    const summary = parseChapterSummary(rawResponse);
    const chapters = isRecord(memory.章节摘要) ? (memory.章节摘要 as Record<string, NarrativeChapterRecord>) : {};
    const chapterKey = getNextChapterKey(chapters);
    const chapter: NarrativeChapterRecord = {
      起始楼层: batch[0].messageId,
      结束楼层: batch[batch.length - 1].messageId,
      源摘要数: batch.length,
      来源: '逐轮摘要',
      源楼层: batch.map(item => item.messageId),
      摘要: summary,
    };
    const nextArchivedCount = Math.max(0, Number(memory.已归档摘要数) || 0) + batch.length;
    const transactionId = createTransactionId();
    const operations = buildArchiveOperations(statData, chapterKey, chapter, nextArchivedCount);

    try {
      await emitSourcedEraVariableWriteAndWait({
        source: 'frontend',
        operation: 'update',
        reason: 'narrative-memory-archive',
        refreshHint: 'none',
        eventName: 'era:transactionByObject',
        attribution: 'background',
        detail: { transactionId, operations },
        expectedMessageId: latestAssistantMessageId,
        expectedAction: 'apiWrite',
        expectedTransactionId: transactionId,
        timeoutMs: 10000,
        timeoutMessage: '长期叙事记忆归档事务已发出，但 ERA 没有确认写入完成。',
      });
    } catch (error) {
      if (!(await isArchivePersisted(chapterKey, chapter, nextArchivedCount))) throw error;
    }

    if (!(await isArchivePersisted(chapterKey, chapter, nextArchivedCount))) {
      throw new Error('长期叙事记忆归档写后校验失败。');
    }

    dataLogger.log('[narrativeMemory] 已归档旧逐轮摘要', {
      chapterKey,
      startMessageId: chapter.起始楼层,
      endMessageId: chapter.结束楼层,
      sourceSummaryCount: chapter.源摘要数,
    });
    return {
      archived: true,
      chapterKey,
      archivedThroughMessageId: chapter.结束楼层,
      sourceSummaryCount: chapter.源摘要数,
    };
  } finally {
    archiveBusy = false;
  }
}
