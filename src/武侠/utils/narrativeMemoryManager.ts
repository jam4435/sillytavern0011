import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { dataLogger } from './logger';
import { requestConfiguredText, resolveConfiguredTextSettings } from './summaryApiClient';
import type { SummarySettings } from './settingsManager';

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

const SUMMARY_BLOCK_REGEX = /<summary>([\s\S]*?)<\/summary>/i;
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

export function extractTurnSummary(text: string): string {
  return text.match(SUMMARY_BLOCK_REGEX)?.[1]?.trim() || '';
}

export function selectConversationArchiveBatch(
  messages: ChatMessageWithSwipes[],
  {
    archivedThroughMessageId,
    recentReplies,
    batchSize,
  }: { archivedThroughMessageId: number; recentReplies: number; batchSize: number },
): ConversationArchiveItem[] {
  const assistantMessages = messages
    .filter(message => message.role === 'assistant' && Number.isInteger(message.message_id))
    .sort((left, right) => left.message_id - right.message_id);
  const keepRecent = Math.max(1, Math.floor(recentReplies));
  const protectedIds = new Set(assistantMessages.slice(-keepRecent).map(message => message.message_id));

  return assistantMessages
    .filter(message => message.message_id > archivedThroughMessageId && !protectedIds.has(message.message_id))
    .map(message => ({ messageId: message.message_id, summary: extractTurnSummary(getActiveMessageText(message)) }))
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
    settings.conversationSummaryMode !== 'card'
  ) {
    return { archived: false };
  }

  archiveBusy = true;
  try {
    const { statData, memory } = readCurrentState();
    const batchSize = Math.max(5, Math.min(50, Math.floor(settings.conversationArchiveBatchSize || 10)));
    const batch = selectConversationArchiveBatch(readChatMessages(), {
      archivedThroughMessageId: Number(memory.已归档至楼层) || -1,
      recentReplies: settings.conversationSummaryRecentReplies,
      batchSize,
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
