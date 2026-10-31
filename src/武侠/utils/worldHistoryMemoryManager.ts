import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import {
  isWorldEventRecord,
  type WorldEventRecord,
  type WorldEventTime,
} from '../../shared/worldEventContext';
import { dataLogger } from './logger';
import { getIsSummarizing } from './summaryManager';
import { requestConfiguredText, resolveConfiguredTextSettings } from './summaryApiClient';
import type { SummarySettings } from './settingsManager';

export interface WorldHistoryChapterRecord {
  起始时间: WorldEventTime;
  结束时间: WorldEventTime;
  来源事件名: string[];
  事件数量: number;
  摘要: string;
}

export interface WorldHistoryOverviewRecord {
  起始时间: WorldEventTime;
  结束时间: WorldEventTime;
  覆盖事件数: number;
  摘要: string;
}

interface WorldHistoryMemoryState {
  章节摘要?: Record<string, WorldHistoryChapterRecord>;
  总览摘要?: WorldHistoryOverviewRecord;
  已归档事件?: Record<string, number>;
}

interface WorldHistoryArchiveItem {
  eventName: string;
  record: WorldEventRecord;
  status: '原定' | '偏离' | '未知';
}

export interface WorldHistoryArchiveResult {
  archived: boolean;
  kind?: 'chapter' | 'overview';
  recordCount?: number;
  chapterKey?: string;
}

const DEFAULT_WORLD_HISTORY_THRESHOLD = 24;
const DEFAULT_WORLD_HISTORY_BATCH_SIZE = 12;
const WORLD_HISTORY_OVERVIEW_TRIGGER_CHAPTERS = 20;
const WORLD_HISTORY_OVERVIEW_BATCH_SIZE = 8;

let worldHistoryArchiveBusy = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getWorldTimeSortValue(time: WorldEventTime | undefined): number {
  const value = time && typeof time === 'object' ? time : {};
  const year = Number.isFinite(value.年) ? Number(value.年) : 0;
  const month = Number.isFinite(value.月) ? Number(value.月) : 0;
  const day = Number.isFinite(value.日) ? Number(value.日) : 0;
  const hour = Number.isFinite(value.时) ? Number(value.时) : 0;
  return year * 1_000_000 + month * 10_000 + day * 100 + hour;
}

function formatWorldTime(time: WorldEventTime | undefined): string {
  const value = time && typeof time === 'object' ? time : {};
  const year = Number(value.年);
  const month = Number(value.月);
  const day = Number(value.日);
  const hour = Number(value.时);
  if (!Number.isFinite(year)) return '日期不详';
  if (!Number.isFinite(month) || !Number.isFinite(day)) return String(year) + '年（具体日期不详）';
  return String(year) + '年' + String(month) + '月' + String(day) + '日' +
    (Number.isFinite(hour) ? ' ' + String(hour) + '时' : '');
}

function getArchivedEventNames(memory: WorldHistoryMemoryState): Set<string> {
  const names = new Set<string>();
  if (isRecord(memory.已归档事件)) {
    Object.keys(memory.已归档事件).forEach(name => names.add(name));
  }
  if (isRecord(memory.章节摘要)) {
    for (const chapter of Object.values(memory.章节摘要)) {
      if (!Array.isArray(chapter?.来源事件名)) continue;
      chapter.来源事件名.forEach(name => {
        if (typeof name === 'string' && name.trim()) names.add(name);
      });
    }
  }
  return names;
}

export function selectWorldEventsForArchive(
  worldEvents: unknown,
  archivedEvents: unknown,
  threshold = DEFAULT_WORLD_HISTORY_THRESHOLD,
  batchSize = DEFAULT_WORLD_HISTORY_BATCH_SIZE,
): WorldHistoryArchiveItem[] {
  if (!isRecord(worldEvents)) return [];

  const archivedNames = new Set<string>();
  if (isRecord(archivedEvents)) {
    Object.keys(archivedEvents).forEach(name => archivedNames.add(name));
  } else if (Array.isArray(archivedEvents)) {
    archivedEvents.forEach(name => {
      if (typeof name === 'string') archivedNames.add(name);
    });
  }

  const records = Object.entries(worldEvents)
    .filter((entry): entry is [string, WorldEventRecord] =>
      !archivedNames.has(entry[0]) && isWorldEventRecord(entry[1]),
    )
    .sort((left, right) => {
      const timeDiff = getWorldTimeSortValue(left[1].时间) - getWorldTimeSortValue(right[1].时间);
      return timeDiff || left[0].localeCompare(right[0]);
    });

  const safeThreshold = Math.max(1, Math.floor(Number(threshold) || DEFAULT_WORLD_HISTORY_THRESHOLD));
  if (records.length <= safeThreshold) return [];

  const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || DEFAULT_WORLD_HISTORY_BATCH_SIZE));
  // 每次归档后至少保留阈值的一半作为详细历史，避免把刚发生的事件全部压成摘要。
  const retainCount = Math.max(1, Math.floor(safeThreshold / 2));
  const archiveCount = Math.min(safeBatchSize, records.length - retainCount);

  return records.slice(0, Math.max(1, archiveCount)).map(([eventName, record]) => ({
    eventName,
    record,
    status: '原定',
  }));
}

export function buildWorldHistoryArchivePrompt(items: WorldHistoryArchiveItem[]): string {
  const source = items.map(item => [
    '事件名称：' + item.eventName,
    '发生时间：' + formatWorldTime(item.record.时间),
    '发生地点：' + item.record.地点,
    '结局状态：' + item.status,
    '客观概要：' + item.record.概要,
  ].join('\n')).join('\n\n');

  return [
    '你是《金庸群侠传》的世界史编纂官。请把下面已经完成的世界事件，整理成一段可长期注入后续剧情的世界史章节摘要。',
    '',
    '【待归档事件】',
    source,
    '',
    '【编纂规则】',
    '1. 只能依据输入记录，不得补写原著情节、猜测动机、推断未记载的人物行动或补造日期。',
    '2. 严格按发生时间组织，保留重要日期、地点、人物、国家与门派、事件因果及明确结果。',
    '3. 必须保留“偏离”与“未知”结局的事实，不得把偏离原定历史的结果改写成原著结果。',
    '4. 优先保留人物生死、身份揭露、关系变化、阵营变化、重要物品与武学传承、战争与势力格局变化。',
    '5. 多个独立事件可以合并叙述，但不得混淆不同日期、地点或人物；仍未解决的事项必须明确写成未解决。',
    '6. 不逐条抄录原概要，不写空泛评价；摘要要让后续模型能准确理解这段历史对当前世界的影响。',
    '7. 输出约 300～500 个中文字符，只输出一个 <world_history_summary> 块。',
    '',
    '<world_history_summary>',
    '[世界史章节摘要]',
    '</world_history_summary>',
  ].join('\n');
}

export function parseWorldHistorySummary(response: string): string {
  const tagged = response.match(/<world_history_summary>([\s\S]*?)<\/world_history_summary>/i)?.[1]?.trim();
  const summary = tagged || response.trim();
  if (!summary) throw new Error('世界历史章节摘要为空。');
  return summary;
}

function getOrderedChapters(
  chapters: Record<string, WorldHistoryChapterRecord>,
): Array<[string, WorldHistoryChapterRecord]> {
  return Object.entries(chapters)
    .filter((entry): entry is [string, WorldHistoryChapterRecord] =>
      isRecord(entry[1]) && typeof entry[1].摘要 === 'string' && entry[1].摘要.trim().length > 0,
    )
    .sort((left, right) => {
      const timeDiff = getWorldTimeSortValue(left[1].起始时间) - getWorldTimeSortValue(right[1].起始时间);
      return timeDiff || left[0].localeCompare(right[0]);
    });
}

export function selectWorldHistoryChaptersForConsolidation(
  chapters: unknown,
  maxRetained = WORLD_HISTORY_OVERVIEW_TRIGGER_CHAPTERS,
  batchSize = WORLD_HISTORY_OVERVIEW_BATCH_SIZE,
): Array<[string, WorldHistoryChapterRecord]> {
  if (!isRecord(chapters)) return [];
  const ordered = getOrderedChapters(chapters as Record<string, WorldHistoryChapterRecord>);
  if (ordered.length <= maxRetained) return [];
  const count = Math.min(Math.max(1, Math.floor(batchSize)), ordered.length - 12);
  return ordered.slice(0, Math.max(1, count));
}

export function buildWorldHistoryOverviewPrompt(
  existingOverview: WorldHistoryOverviewRecord | null,
  chapters: Array<[string, WorldHistoryChapterRecord]>,
): string {
  const previous = existingOverview?.摘要
    ? '【此前已经压缩的世界史总览】\n' + existingOverview.摘要
    : '【此前已经压缩的世界史总览】\n（暂无）';
  const source = chapters.map(([chapterName, chapter]) => [
    '章节：' + chapterName,
    '时间范围：' + formatWorldTime(chapter.起始时间) + '—' + formatWorldTime(chapter.结束时间),
    '事件数量：' + String(chapter.事件数量),
    '章节摘要：' + chapter.摘要,
  ].join('\n')).join('\n\n');

  return [
    '你是《金庸群侠传》的世界史总编。请把此前的世界史总览与新提供的旧章节摘要，整合成一份更高层级、仍可供后续剧情使用的长期世界史总览。',
    '',
    previous,
    '',
    '【本次并入的旧章节】',
    source,
    '',
    '【编纂规则】',
    '1. 只依据输入，不得补写原著或推测缺失事实。',
    '2. 保留重要人物的生死、身份、关系、阵营与传承，保留重大国家局势、战争、门派兴衰和关键因果。',
    '3. 以时间线组织，但可以合并重复背景；不可把不同人物或不同事件混为一谈。',
    '4. 优先保留会改变后续世界状态的事实；普通过场可压缩。',
    '5. 已明确发生的偏离原定历史必须保留，未知事项不得擅自补成确定结论。',
    '6. 输出约 600～900 个中文字符，只输出一个 <world_history_overview> 块。',
    '',
    '<world_history_overview>',
    '[长期世界史总览]',
    '</world_history_overview>',
  ].join('\n');
}

function parseWorldHistoryOverview(response: string): string {
  const tagged = response.match(/<world_history_overview>([\s\S]*?)<\/world_history_overview>/i)?.[1]?.trim();
  const summary = tagged || response.trim();
  if (!summary) throw new Error('长期世界史总览为空。');
  return summary;
}

function getNextChapterKey(chapters: Record<string, WorldHistoryChapterRecord>): string {
  const highest = Object.keys(chapters).reduce((max, key) => {
    const match = key.match(/^史册(\d+)$/);
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return '史册' + String(highest + 1).padStart(3, '0');
}

function readCurrentState(): { statData: Record<string, unknown>; memory: WorldHistoryMemoryState } {
  const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
  const statData = isRecord(variables?.stat_data) ? variables.stat_data : {};
  const memory = isRecord(statData.世界史记忆) ? statData.世界史记忆 as WorldHistoryMemoryState : {};
  return { statData, memory };
}

function readLatestAssistantMessageId(): number | null {
  try {
    const messages = getChatMessages('0-{{lastMessageId}}', {
      role: 'all',
      hide_state: 'unhidden',
      include_swipes: true,
    }) as Array<{ message_id?: number; role?: string }>;
    const latest = messages
      .filter(message => message.role === 'assistant' && Number.isInteger(message.message_id))
      .sort((left, right) => Number(left.message_id) - Number(right.message_id))
      .pop();
    return latest?.message_id ?? null;
  } catch {
    return null;
  }
}

function createTransactionId(): string {
  try {
    if (typeof crypto?.randomUUID === 'function') return 'world-history-' + crypto.randomUUID();
  } catch {
    // Ignore unavailable crypto APIs in older embedded browsers.
  }
  return 'world-history-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

async function isArchivePersisted(
  chapterKey: string,
  chapter: WorldHistoryChapterRecord,
): Promise<boolean> {
  const { memory } = readCurrentState();
  const chapters = isRecord(memory.章节摘要)
    ? memory.章节摘要 as Record<string, WorldHistoryChapterRecord>
    : {};
  const archivedEvents = isRecord(memory.已归档事件) ? memory.已归档事件 : {};
  return (
    chapters[chapterKey]?.摘要 === chapter.摘要 &&
    chapter.来源事件名.every(name => Object.prototype.hasOwnProperty.call(archivedEvents, name))
  );
}

async function isOverviewPersisted(
  overview: WorldHistoryOverviewRecord,
  removedChapterKeys: string[],
): Promise<boolean> {
  const { memory } = readCurrentState();
  const chapters = isRecord(memory.章节摘要) ? memory.章节摘要 : {};
  return (
    memory.总览摘要?.摘要 === overview.摘要 &&
    removedChapterKeys.every(key => !Object.prototype.hasOwnProperty.call(chapters, key))
  );
}

export async function maybeArchiveWorldHistory({
  settings,
  latestAssistantMessageId,
}: {
  settings: SummarySettings;
  latestAssistantMessageId?: number;
}): Promise<WorldHistoryArchiveResult> {
  const targetMessageId =
    Number.isInteger(latestAssistantMessageId) && Number(latestAssistantMessageId) >= 0
      ? Number(latestAssistantMessageId)
      : readLatestAssistantMessageId();
  if (!settings.worldHistoryArchiveEnabled || targetMessageId === null) {
    return { archived: false };
  }
  if (worldHistoryArchiveBusy || getIsSummarizing()) {
    dataLogger.log('[worldHistoryMemory] 另一个总结任务正在执行，延后本次世界史归档。');
    return { archived: false };
  }

  worldHistoryArchiveBusy = true;
  try {
    const { statData, memory } = readCurrentState();
    const worldEvents = isRecord(statData.世界事件) ? statData.世界事件 : {};
    const archivedNames = getArchivedEventNames(memory);
    const archivedMap = Object.fromEntries([...archivedNames].map(name => [name, 1]));
    const batch = selectWorldEventsForArchive(
      worldEvents,
      archivedMap,
      settings.worldHistoryArchiveThreshold,
      settings.worldHistoryArchiveBatchSize,
    );
    if (batch.length > 0) {
      const requestSettings = resolveConfiguredTextSettings(settings, 'summary');
      const frontendVariables = isRecord(statData.前端变量) ? statData.前端变量 : {};
      const statuses = isRecord(frontendVariables.事件结局状态)
        ? frontendVariables.事件结局状态
        : {};
      batch.forEach(item => {
        const status = statuses[item.eventName];
        item.status = status === '偏离' || status === '未知' ? status : '原定';
      });

      const response = await requestConfiguredText({
        prompt: buildWorldHistoryArchivePrompt(batch),
        settings: requestSettings,
        shouldStream: false,
        generationIdPrefix: 'wuxia-world-history-archive',
        skipWorldInfoAndAuthorNote: true,
      });
      const summary = parseWorldHistorySummary(response);
      const existingChapters = isRecord(memory.章节摘要)
        ? memory.章节摘要 as Record<string, WorldHistoryChapterRecord>
        : {};
      const chapterKey = getNextChapterKey(existingChapters);
      const chapter: WorldHistoryChapterRecord = {
        起始时间: { ...batch[0].record.时间 },
        结束时间: { ...batch[batch.length - 1].record.时间 },
        来源事件名: batch.map(item => item.eventName),
        事件数量: batch.length,
        摘要: summary,
      };
      const archivedEventPatch = Object.fromEntries(batch.map(item => [item.eventName, 1]));
      const operations = [
        { type: 'insert' as const, payload: { 世界史记忆: { 章节摘要: { [chapterKey]: chapter } } } },
        { type: 'insert' as const, payload: { 世界史记忆: { 已归档事件: archivedEventPatch } } },
      ];
      const transactionId = createTransactionId();

      try {
        await emitSourcedEraVariableWriteAndWait({
          source: 'frontend',
          operation: 'update',
          reason: 'world-history-archive',
          refreshHint: 'none',
          eventName: 'era:transactionByObject',
          attribution: 'background',
          detail: { transactionId, operations },
          expectedMessageId: targetMessageId,
          expectedAction: 'apiWrite',
          expectedTransactionId: transactionId,
          timeoutMs: 10000,
          timeoutMessage: '世界历史摘要事务已发出，但 ERA 没有确认写入完成。',
        });
      } catch (error) {
        if (!(await isArchivePersisted(chapterKey, chapter))) throw error;
      }

      if (!(await isArchivePersisted(chapterKey, chapter))) {
        throw new Error('世界历史章节摘要写后校验失败。');
      }

      dataLogger.log('[worldHistoryMemory] 世界历史章节归档完成', {
        chapterKey,
        eventCount: batch.length,
        firstEvent: batch[0].eventName,
        lastEvent: batch[batch.length - 1].eventName,
      });
      return { archived: true, kind: 'chapter', recordCount: batch.length, chapterKey };
    }

    const chapters = isRecord(memory.章节摘要) ? memory.章节摘要 as Record<string, WorldHistoryChapterRecord> : {};
    const selectedChapters = selectWorldHistoryChaptersForConsolidation(chapters);
    if (selectedChapters.length === 0) return { archived: false };

    const existingOverview = isRecord(memory.总览摘要) ? memory.总览摘要 as WorldHistoryOverviewRecord : null;
    const requestSettings = resolveConfiguredTextSettings(settings, 'summary');
    const response = await requestConfiguredText({
      prompt: buildWorldHistoryOverviewPrompt(existingOverview, selectedChapters),
      settings: requestSettings,
      shouldStream: false,
      generationIdPrefix: 'wuxia-world-history-overview',
      skipWorldInfoAndAuthorNote: true,
    });
    const summary = parseWorldHistoryOverview(response);
    const firstChapter = selectedChapters[0][1];
    const lastChapter = selectedChapters[selectedChapters.length - 1][1];
    const overview: WorldHistoryOverviewRecord = {
      起始时间: existingOverview?.起始时间 || { ...firstChapter.起始时间 },
      结束时间: { ...lastChapter.结束时间 },
      覆盖事件数:
        Math.max(0, Number(existingOverview?.覆盖事件数) || 0) +
        selectedChapters.reduce((total, [, chapter]) => total + Math.max(0, Number(chapter.事件数量) || 0), 0),
      摘要: summary,
    };
    const removedChapterKeys = selectedChapters.map(([key]) => key);
    const deletePatch = Object.fromEntries(removedChapterKeys.map(key => [key, {}]));
    const overviewOperation = {
      type: existingOverview ? 'update' as const : 'insert' as const,
      payload: { 世界史记忆: { 总览摘要: overview } },
    };
    const operations = [
      overviewOperation,
      { type: 'delete' as const, payload: { 世界史记忆: { 章节摘要: deletePatch } } },
    ];
    const transactionId = createTransactionId();

    try {
      await emitSourcedEraVariableWriteAndWait({
        source: 'frontend',
        operation: 'update',
        reason: 'world-history-overview',
        refreshHint: 'none',
        eventName: 'era:transactionByObject',
        attribution: 'background',
        detail: { transactionId, operations },
        expectedMessageId: latestAssistantMessageId,
        expectedAction: 'apiWrite',
        expectedTransactionId: transactionId,
        timeoutMs: 10000,
        timeoutMessage: '世界史总览压缩事务已发出，但 ERA 没有确认写入完成。',
      });
    } catch (error) {
      if (!(await isOverviewPersisted(overview, removedChapterKeys))) throw error;
    }

    if (!(await isOverviewPersisted(overview, removedChapterKeys))) {
      throw new Error('世界史总览压缩写后校验失败。');
    }

    dataLogger.log('[worldHistoryMemory] 世界史章节已合并为长期总览', {
      consolidatedChapterCount: removedChapterKeys.length,
      coveredEventCount: overview.覆盖事件数,
    });
    return { archived: true, kind: 'overview', recordCount: removedChapterKeys.length };
  } finally {
    worldHistoryArchiveBusy = false;
  }
}
