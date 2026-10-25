/**
 * 自动总结管理器
 * 用于检测和执行角色人物经历的自动总结
 */

import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import type { EraTransactionDetail, EraTransactionOperation } from '../../ERA变量框架/utils/constants';
import { dataLogger } from './logger';
import type {
  SummarySettings,
  SummaryThresholds,
  PendingCharacterSummary,
} from './settingsManager';
import { requestSummaryText, resolveConfiguredTextSettings } from './summaryApiClient';

// =========================================
// 类型定义
// =========================================

/**
 * 角色数据结构（简化版，仅用于总结检测）
 */
interface CharacterDataForSummary {
  人物经历?: Record<string, string> | string;
  [key: string]: unknown;
}

/**
 * 总结检测结果
 */
export interface SummaryTriggerResult {
  /** 是否应该触发总结 */
  shouldTrigger: boolean;
  /** 触发原因 */
  triggerReason: 'per_character' | 'pending_queue' | 'total_entries' | 'none';
  /** 待总结的角色列表 */
  pendingCharacters: PendingCharacterSummary[];
  /** 所有角色的总经历条目数 */
  totalEntries: number;
}

/**
 * 单个角色的总结结果
 */
export interface CharacterSummaryResult {
  characterId: string;
  displayName: string;
  success: boolean;
  originalCount: number;
  summaryContent?: string;
  error?: string;
}

/**
 * 批量总结结果
 */
export interface BatchSummaryResult {
  success: boolean;
  results: CharacterSummaryResult[];
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
}

// =========================================
// 运行时状态
// =========================================

/** 待处理队列 */
let pendingQueue: PendingCharacterSummary[] = [];

/** 是否正在执行总结 */
let isSummarizing = false;

export const BIOGRAPHY_RECENT_ENTRIES_TO_KEEP = 5;
export const BIOGRAPHY_COMPRESSION_BATCH_SIZE = 10;
const LEGACY_SUMMARY_META_KEY = '【总结】';
// 兼容旧的“阶段经历1”和带标题的新键名“阶段经历1-初入江湖”。
const COMPRESSED_BIOGRAPHY_KEY_RE = /^阶段经历(\d+)/;
const SUMMARY_STAGE_KEY_RE = /^阶段经历([1-9]\d*)(.+)$/;
const SUMMARY_DATE_PREFIX_RE =
  /^[（(](?:(?:\d{3,4}\.\d{1,2}\.\d{1,2})(?:\s*[~～—-]\s*\d{3,4}\.\d{1,2}\.\d{1,2})?|旧记录时间不详|时间不详)[）)]\s*\S/;
const SUMMARY_DATE_RANGE_RE =
  /^[（(](\d{3,4})\.(\d{1,2})\.(\d{1,2})(?:\s*[~～—-]\s*(\d{3,4})\.(\d{1,2})\.(\d{1,2}))?[）)]/;

export interface BiographyCompressionPlan {
  originalBiography: Record<string, string>;
  sourceEntries: Record<string, string>;
  sourceKeys: string[];
}

// =========================================
// 工具函数
// =========================================

export function isCompressedBiographyKey(key: string): boolean {
  return COMPRESSED_BIOGRAPHY_KEY_RE.test(key);
}

function isCountedBiographyKey(key: string): boolean {
  return !key.startsWith('$') && key !== LEGACY_SUMMARY_META_KEY && !isCompressedBiographyKey(key);
}

function getNextStageMemoryNumber(biography: Record<string, string>): number {
  const highest = Object.keys(biography).reduce((max, key) => {
    const match = key.match(COMPRESSED_BIOGRAPHY_KEY_RE);
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return highest + 1;
}

/**
 * 将模型返回的阶段经历编号调整到现有记忆之后，避免覆盖旧阶段记忆。
 * 模型输出中的编号只用于标识本次响应的顺序，持久化编号由程序统一分配。
 */
export function rebaseStageMemoryKeys(
  stageMemories: Record<string, string>,
  existingBiography: Record<string, string>,
): Record<string, string> {
  let nextNumber = getNextStageMemoryNumber(existingBiography);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(stageMemories)) {
    const match = key.match(SUMMARY_STAGE_KEY_RE);
    if (!match) {
      throw new Error(`阶段记忆键名格式错误：${key}。键名必须以“阶段经历数字+标题”开头。`);
    }

    const cleanValue = value.trim();
    if (!cleanValue) throw new Error(`阶段记忆“${key}”的内容为空。`);

    const rebasedKey = `阶段经历${nextNumber}${match[2]}`;
    if (Object.prototype.hasOwnProperty.call(existingBiography, rebasedKey) ||
        Object.prototype.hasOwnProperty.call(result, rebasedKey)) {
      throw new Error(`阶段记忆键名冲突：${rebasedKey}。`);
    }
    result[rebasedKey] = cleanValue;
    nextNumber += 1;
  }

  if (Object.keys(result).length === 0) throw new Error('总结模型没有返回任何阶段记忆。');
  return result;
}

function parseGameDateRange(value: string): { start: number; end: number } | null {
  const match = value.trim().match(SUMMARY_DATE_RANGE_RE);
  if (!match) return null;

  const toDateNumber = (year: string, month: string, day: string) =>
    Number(year) * 10000 + Number(month) * 100 + Number(day);
  const start = toDateNumber(match[1], match[2], match[3]);
  const end = match[4] && match[5] && match[6]
    ? toDateNumber(match[4], match[5], match[6])
    : start;
  if (end < start) return null;
  return { start, end };
}

function getSourceDateBounds(sourceEntries: Record<string, string>): { start: number; end: number } | null {
  const ranges = Object.values(sourceEntries)
    .map(parseGameDateRange)
    .filter((range): range is { start: number; end: number } => range !== null);
  if (ranges.length === 0) return null;

  return {
    start: Math.min(...ranges.map(range => range.start)),
    end: Math.max(...ranges.map(range => range.end)),
  };
}

export function buildBiographyCompressionPlan(
  biography: Record<string, string> | string | undefined,
): BiographyCompressionPlan | null {
  const originalBiography = normalizeBiography(biography);
  const candidates = Object.entries(originalBiography).filter(([key]) => isCountedBiographyKey(key));
  const compressibleCount = candidates.length - BIOGRAPHY_RECENT_ENTRIES_TO_KEEP;
  if (compressibleCount < 2) return null;

  const sourceEntries = Object.fromEntries(
    candidates.slice(0, Math.min(BIOGRAPHY_COMPRESSION_BATCH_SIZE, compressibleCount)),
  );

  return {
    originalBiography,
    sourceEntries,
    sourceKeys: Object.keys(sourceEntries),
  };
}

export function mergeBiographyCompression(
  plan: BiographyCompressionPlan,
  stageMemories: Record<string, string>,
): Record<string, string> {
  const rebasedStageMemories = rebaseStageMemoryKeys(stageMemories, plan.originalBiography);
  const sourceKeys = new Set(plan.sourceKeys);
  const result: Record<string, string> = {};
  let inserted = false;

  for (const [key, value] of Object.entries(plan.originalBiography)) {
    if (key === LEGACY_SUMMARY_META_KEY) continue;

    if (sourceKeys.has(key)) {
      if (!inserted) {
        Object.assign(result, rebasedStageMemories);
        inserted = true;
      }
      continue;
    }

    result[key] = value;
  }

  if (!inserted) Object.assign(result, rebasedStageMemories);
  return result;
}

/**
 * 构造总结回写的 ERA 操作。
 *
 * 正常对象结构只删除本批最旧经历和废弃的旧总结元数据，再一次性插入所有新阶段记忆；
 * 旧版字符串结构无法删除子键，因此先删除整个人物经历字段，再插入保留近期条目与新阶段记忆。
 */
export function buildBiographyCompressionOperations(
  characterId: string,
  plan: BiographyCompressionPlan,
  stageMemories: Record<string, string>,
  options: { replaceLegacyString?: boolean } = {},
): EraTransactionOperation[] {
  const characterName = characterId.startsWith('character:')
    ? characterId.slice('character:'.length)
    : characterId;

  const makePayload = (biographyEntries: Record<string, unknown>): Record<string, unknown> => {
    if (characterId === 'user') {
      return { user数据: { 人物经历: biographyEntries } };
    }
    return {
      角色数据: {
        [characterName]: { 人物经历: biographyEntries },
      },
    };
  };

  if (options.replaceLegacyString) {
    return [
      { type: 'delete', payload: makePayload({}) },
      {
        type: 'insert',
        payload: makePayload(mergeBiographyCompression(plan, stageMemories)),
      },
    ];
  }

  const keysToDelete = [...plan.sourceKeys];
  if (Object.prototype.hasOwnProperty.call(plan.originalBiography, LEGACY_SUMMARY_META_KEY)) {
    keysToDelete.push(LEGACY_SUMMARY_META_KEY);
  }
  const deleteEntries = Object.fromEntries(keysToDelete.map(key => [key, {}]));
  const rebasedStageMemories = rebaseStageMemoryKeys(stageMemories, plan.originalBiography);

  return [
    { type: 'delete', payload: makePayload(deleteEntries) },
    {
      type: 'insert',
      payload: makePayload(rebasedStageMemories),
    },
  ];
}

/**
 * 计算人物经历的条目数
 * @param biography 人物经历数据（可能是 Record 或 string）
 * @returns 条目数量
 */
export function getBiographyEntryCount(biography: Record<string, string> | string | undefined): number {
  if (!biography) return 0;

  if (typeof biography === 'string') {
    // 如果是字符串，按行计数（非空行）
    return biography.split('\n').filter(line => line.trim()).length;
  }

  // 阶段经历已经压缩过，不再计入原始经历阈值，避免摘要反复触发摘要。
  return Object.keys(biography).filter(isCountedBiographyKey).length;
}

/**
 * 将人物经历规范化为 Record 格式
 * @param biography 人物经历数据
 * @returns 规范化后的 Record 格式
 */
export function normalizeBiography(biography: Record<string, string> | string | undefined): Record<string, string> {
  if (!biography) return {};

  if (typeof biography === 'string') {
    // 将字符串按行转换为 Record
    const result: Record<string, string> = {};
    const lines = biography.split('\n').filter(line => line.trim());
    lines.forEach((line, index) => {
      result[`条目${index + 1}`] = line.trim();
    });
    return result;
  }

  // 过滤掉特殊键
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(biography)) {
    if (!key.startsWith('$')) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 将人物经历格式化为提示词中使用的文本
 * @param biography 人物经历数据
 * @returns 格式化后的文本
 */
function formatBiographyForPrompt(biography: Record<string, string>): string {
  const entries = Object.entries(biography);
  if (entries.length === 0) return '（无经历记录）';

  return entries.map(([key, value]) => `- ${key}: ${value}`).join('\n');
}

// =========================================
// 核心检测逻辑
// =========================================

/**
 * 检测是否应该触发总结
 * 遍历所有角色（包括玩家和NPC），检查人物经历条目数
 *
 * @param thresholds 阈值设置
 * @returns 检测结果
 */
export function checkSummaryTrigger(thresholds: SummaryThresholds): SummaryTriggerResult {
  dataLogger.log('[summaryManager] 开始检测总结触发条件...');

  const result: SummaryTriggerResult = {
    shouldTrigger: false,
    triggerReason: 'none',
    pendingCharacters: [],
    totalEntries: 0,
  };

  try {
    // 人物经历属于聊天持久状态，检测统一读取聊天级 stat_data 真相源。
    const rawVariables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    const statData = rawVariables?.stat_data as Record<string, unknown>;

    if (!statData) {
      dataLogger.log('[summaryManager] 变量表为空，跳过检测');
      return result;
    }

    // 1. 检查玩家人物经历
    const userData = statData.user数据 as CharacterDataForSummary | undefined;
    if (userData?.人物经历) {
      const count = getBiographyEntryCount(userData.人物经历);
      result.totalEntries += count;

      if (count >= thresholds.perCharacterEntriesThreshold) {
        result.pendingCharacters.push({
          characterId: 'user',
          displayName: (userData as Record<string, unknown>).用户名 as string || '玩家',
          entriesCount: count,
          biography: normalizeBiography(userData.人物经历),
        });
        dataLogger.log(`[summaryManager] 玩家人物经历超过阈值: ${count} >= ${thresholds.perCharacterEntriesThreshold}`);
      }
    }

    // 2. 检查角色数据中的NPC
    const characterData = statData.角色数据 as Record<string, CharacterDataForSummary> | undefined;
    if (characterData) {
      for (const [characterName, character] of Object.entries(characterData)) {
        // 跳过模板和非对象数据
        if (characterName.startsWith('$') || typeof character !== 'object' || character === null) {
          continue;
        }

        if (character.人物经历) {
          const count = getBiographyEntryCount(character.人物经历);
          result.totalEntries += count;

          if (count >= thresholds.perCharacterEntriesThreshold) {
            result.pendingCharacters.push({
              characterId: `character:${characterName}`,
              displayName: characterName,
              entriesCount: count,
              biography: normalizeBiography(character.人物经历),
            });
            dataLogger.log(`[summaryManager] 角色 ${characterName} 人物经历超过阈值: ${count} >= ${thresholds.perCharacterEntriesThreshold}`);
          }
        }
      }
    }

    // 3. 单角色达到阈值即可触发；队列/总量阈值只影响批量触发原因。
    if (result.pendingCharacters.length >= thresholds.pendingQueueThreshold) {
      result.shouldTrigger = true;
      result.triggerReason = 'pending_queue';
      dataLogger.log(`[summaryManager] 待处理角色数达到批量阈值: ${result.pendingCharacters.length} >= ${thresholds.pendingQueueThreshold}`);
    } else if (result.pendingCharacters.length > 0 && result.totalEntries >= thresholds.totalEntriesThreshold) {
      result.shouldTrigger = true;
      result.triggerReason = 'total_entries';
      dataLogger.log(`[summaryManager] 总原始经历达到批量阈值: ${result.totalEntries} >= ${thresholds.totalEntriesThreshold}`);
    } else if (result.pendingCharacters.length > 0) {
      result.shouldTrigger = true;
      result.triggerReason = 'per_character';
      dataLogger.log('[summaryManager] 单角色达到阈值，立即触发分块压缩');
    }

    dataLogger.log('[summaryManager] 检测结果:', {
      shouldTrigger: result.shouldTrigger,
      triggerReason: result.triggerReason,
      pendingCount: result.pendingCharacters.length,
      totalEntries: result.totalEntries,
    });

    return result;
  } catch (error) {
    dataLogger.error('[summaryManager] 检测总结触发条件失败:', error);
    return result;
  }
}

/**
 * 获取当前待处理队列状态
 */
export function getPendingQueueStatus(): {
  pendingCount: number;
  isSummarizing: boolean;
  characters: PendingCharacterSummary[];
} {
  return {
    pendingCount: pendingQueue.length,
    isSummarizing,
    characters: [...pendingQueue],
  };
}

// =========================================
// 提示词构建
// =========================================

/**
 * 根据模板构建角色总结提示词
 *
 * @param template 提示词模板
 * @param character 待总结的角色信息
 * @returns 构建后的提示词
 */
export function formatPromptForCharacter(
  template: string,
  character: PendingCharacterSummary,
): string {
  const biographyText = formatBiographyForPrompt(character.biography);

  return template
    .replace(/\{\{characterName\}\}/g, character.displayName)
    .replace(/\{\{biographyEntries\}\}/g, biographyText);
}

// =========================================
// 总结执行
// =========================================

/**
 * 严格解析人物经历压缩模型返回的 JSON 键值对。
 * 格式错误时直接拒绝写回，避免把解释文字或错误结构写进人物经历。
 */
export function parseSummaryResponse(response: string, maxStageMemories?: number, sourceEntries?: Record<string, string>): Record<string, string> {
  const raw = response.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('总结模型输出不是合法 JSON；已取消写回以保护原始人物经历。');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('总结模型必须返回 JSON 对象，键为阶段记忆名称，值为记忆内容。');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw new Error('总结模型返回了空 JSON 对象。');
  if (maxStageMemories !== undefined && entries.length > maxStageMemories) {
    throw new Error(`总结模型返回了 ${entries.length} 条阶段记忆，多于本批 ${maxStageMemories} 条输入经历；已取消写回。`);
  }

  // JSON.parse 会静默覆盖重复键，因此额外检查原始文本中的键数量。
  const rawKeys = [...raw.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)];
  if (rawKeys.length !== entries.length) {
    throw new Error('总结 JSON 存在重复键或非预期的嵌套结构；已取消写回。');
  }

  const sourceDateBounds = sourceEntries ? getSourceDateBounds(sourceEntries) : null;
  const result: Record<string, string> = {};
  entries.forEach(([key, value], index) => {
    const match = key.match(SUMMARY_STAGE_KEY_RE);
    if (!match) {
      throw new Error(`总结 JSON 的键名“${key}”无效；必须以“阶段经历N+标题”命名。`);
    }
    if (Number(match[1]) !== index + 1) {
      throw new Error('总结 JSON 的阶段经历编号必须从 1 开始，按输出顺序连续递增。');
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`阶段记忆“${key}”必须对应非空字符串。`);
    }

    const cleanValue = value.trim();
    if (!SUMMARY_DATE_PREFIX_RE.test(cleanValue)) {
      throw new Error(
        `阶段记忆“${key}”缺少有效的游戏内时间前缀；请使用“（1200.11.1~1200.11.5）”或“（旧记录时间不详）”。`,
      );
    }

    const outputDateRange = parseGameDateRange(cleanValue);
    if (outputDateRange && sourceEntries) {
      if (!sourceDateBounds) {
        throw new Error(`阶段记忆“${key}”使用了日期，但输入经历中没有可识别的游戏内日期。`);
      }
      if (outputDateRange.start < sourceDateBounds.start || outputDateRange.end > sourceDateBounds.end) {
        throw new Error(`阶段记忆“${key}”的日期范围超出本批原始经历，已取消写回。`);
      }
    } else if (!outputDateRange && !/^[（(](?:旧记录时间不详|时间不详)[）)]/.test(cleanValue)) {
      throw new Error(`阶段记忆“${key}”的日期范围无效或结束时间早于开始时间。`);
    }
    result[key] = cleanValue;
  });

  return result;
}

function readCurrentCharacterBiographyValue(
  characterId: string,
): Record<string, string> | string | undefined {
  const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
  const statData = variables?.stat_data as Record<string, unknown> | undefined;
  if (!statData) return undefined;

  if (characterId === 'user') {
    const userData = statData.user数据 as CharacterDataForSummary | undefined;
    return userData?.人物经历;
  }

  const characterName = characterId.replace('character:', '');
  const characters = statData.角色数据 as Record<string, CharacterDataForSummary> | undefined;
  return characters?.[characterName]?.人物经历;
}

function readCurrentCharacterBiography(characterId: string): Record<string, string> {
  return normalizeBiography(readCurrentCharacterBiographyValue(characterId));
}

function getLatestAssistantMessageId(): number | null {
  try {
    const messages = getChatMessages('0-{{lastMessageId}}', {
      role: 'assistant',
      include_swipes: true,
    });
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const messageId = messages[index]?.message_id;
      if (typeof messageId === 'number' && Number.isInteger(messageId) && messageId >= 0) return messageId;
    }
  } catch (error) {
    dataLogger.warn('[summaryManager] 无法读取当前 assistant 楼层 ID', error);
  }
  return null;
}

function createSummaryTransactionId(targetMessageId: number, characterId: string): string {
  const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `summary:${targetMessageId}:${characterId}:${randomSuffix}`;
}

/**
 * 执行单个角色的总结
 *
 * @param settings 总结设置
 * @param character 待总结的角色
 * @returns 总结结果
 */
export async function executeSummary(
  settings: SummarySettings,
  character: PendingCharacterSummary,
  targetMessageId: number,
): Promise<CharacterSummaryResult> {
  dataLogger.log(`[summaryManager] 开始总结角色: ${character.displayName}`);

  const result: CharacterSummaryResult = {
    characterId: character.characterId,
    displayName: character.displayName,
    success: false,
    originalCount: character.entriesCount,
  };

  try {
    const initialBiography = readCurrentCharacterBiography(character.characterId);
    result.originalCount = getBiographyEntryCount(initialBiography);
    const compressionPlan = buildBiographyCompressionPlan(initialBiography);
    if (!compressionPlan) {
      result.success = true;
      dataLogger.log(`[summaryManager] 角色 ${character.displayName} 没有足够旧经历可分块压缩，跳过`);
      return result;
    }

    const sourceCharacter: PendingCharacterSummary = {
      ...character,
      entriesCount: Object.keys(compressionPlan.sourceEntries).length,
      biography: compressionPlan.sourceEntries,
    };

    // 1. 只总结最旧的一批；近期经历和既有阶段经历不再次改写。
    const prompt = formatPromptForCharacter(settings.promptTemplate, sourceCharacter);
    dataLogger.log(`[summaryManager] 构建的提示词长度: ${prompt.length}`);

    // 2. 调用总结 API
    const requestSettings = resolveConfiguredTextSettings(settings, 'summary');
    dataLogger.log('[summaryManager] 调用总结 API...', {
      apiMode: requestSettings.apiMode,
      source: requestSettings.apiConfig.source,
      stream: requestSettings.stream,
    });
    const response = await requestSummaryText({ prompt, settings });
    dataLogger.log(`[summaryManager] 收到响应，长度: ${response.length}`);

    // 3. 严格解析模型返回的多条阶段记忆 JSON
    const summaryEntries = parseSummaryResponse(response, Object.keys(compressionPlan.sourceEntries).length, compressionPlan.sourceEntries);

    // 4. 回写前重新读取人物经历，防止模型请求期间新增或编辑的经历被覆盖/误删。
    const latestRawBiography = readCurrentCharacterBiographyValue(character.characterId);
    const latestBiography = normalizeBiography(latestRawBiography);
    const changedSourceKeys = compressionPlan.sourceKeys.filter(
      key => !Object.prototype.hasOwnProperty.call(latestBiography, key) ||
        latestBiography[key] !== compressionPlan.sourceEntries[key],
    );
    if (changedSourceKeys.length > 0) {
      throw new Error(
        `人物经历在总结期间已变化（${changedSourceKeys.join('、')}），已取消写回以保护最新数据。`,
      );
    }

    const writePlan: BiographyCompressionPlan = {
      ...compressionPlan,
      originalBiography: latestBiography,
    };
    const rebasedStageEntries = rebaseStageMemoryKeys(summaryEntries, latestBiography);
    result.summaryContent = JSON.stringify(rebasedStageEntries, null, 2);
    const operations = buildBiographyCompressionOperations(
      character.characterId,
      writePlan,
      summaryEntries,
      { replaceLegacyString: typeof latestRawBiography === 'string' },
    );
    const transactionId = createSummaryTransactionId(targetMessageId, character.characterId);
    const transaction: EraTransactionDetail = {
      transactionId,
      targetMessageId,
      operations,
    };

    dataLogger.log('[summaryManager] 使用固定楼层的 Delete + Insert 事务写回总结:', {
      targetMessageId,
      characterId: character.characterId,
      deletedKeys: writePlan.sourceKeys,
      insertedKeys: Object.keys(rebasedStageEntries),
      legacyStringBiography: typeof latestRawBiography === 'string',
    });

    await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'replace',
      reason: 'summary-write',
      eventName: 'era:transactionByObject',
      attribution: 'background',
      detail: transaction,
      expectedAction: 'apiWrite',
      expectedMessageId: targetMessageId,
      expectedTransactionId: transactionId,
      timeoutMs: 15000,
      timeoutMessage: `人物经历总结已写入楼层 ${targetMessageId}，但 ERA 未在时限内确认 Delete + Insert 事务。`,
    });

    result.success = true;
    dataLogger.log(`[summaryManager] 角色 ${character.displayName} 总结完成`);

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    dataLogger.error(`[summaryManager] 角色 ${character.displayName} 总结失败:`, error);
  }

  return result;
}

/**
 * 执行所有待处理角色的总结
 *
 * @param settings 总结设置
 * @param characters 待总结的角色列表（如果不提供，使用内部队列）
 * @returns 批量总结结果
 */
export async function executeAllPendingSummaries(
  settings: SummarySettings,
  characters?: PendingCharacterSummary[],
  targetMessageId?: number,
): Promise<BatchSummaryResult> {
  const result: BatchSummaryResult = {
    success: false,
    results: [],
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
  };

  // 如果正在总结中，直接返回
  if (isSummarizing) {
    dataLogger.log('[summaryManager] 已有总结任务在执行中，跳过');
    return result;
  }

  // 使用传入的角色列表或内部队列
  const targetCharacters = characters || pendingQueue;

  if (targetCharacters.length === 0) {
    dataLogger.log('[summaryManager] 没有待总结的角色');
    result.success = true;
    return result;
  }

  const resolvedTargetMessageId = targetMessageId ?? getLatestAssistantMessageId();
  if (!Number.isInteger(resolvedTargetMessageId) || (resolvedTargetMessageId as number) < 0) {
    throw new Error('无法确定总结写回的 assistant 楼层，已取消总结以避免写入错误楼层。');
  }

  isSummarizing = true;
  dataLogger.log(`[summaryManager] 开始批量总结，共 ${targetCharacters.length} 个角色`);

  try {
    // 顺序执行总结（避免 API 过载）
    for (const character of targetCharacters) {
      const summaryResult = await executeSummary(settings, character, resolvedTargetMessageId as number);
      result.results.push(summaryResult);
      result.totalProcessed++;

      if (summaryResult.success) {
        result.totalSuccess++;
      } else {
        result.totalFailed++;
      }

      // 每个角色之间稍作延迟，避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    result.success = result.totalFailed === 0;

    // 清空内部队列（如果使用的是内部队列）
    if (!characters) {
      pendingQueue = [];
    }

    dataLogger.log('[summaryManager] 批量总结完成:', {
      totalProcessed: result.totalProcessed,
      totalSuccess: result.totalSuccess,
      totalFailed: result.totalFailed,
    });

  } catch (error) {
    dataLogger.error('[summaryManager] 批量总结过程中发生错误:', error);
  } finally {
    isSummarizing = false;
  }

  return result;
}

/**
 * 手动触发总结检测和执行
 *
 * @param settings 总结设置
 * @returns 批量总结结果
 */
export async function triggerManualSummary(settings: SummarySettings): Promise<BatchSummaryResult> {
  dataLogger.log('[summaryManager] 手动触发总结');

  // 检测需要总结的角色
  const triggerResult = checkSummaryTrigger(settings.thresholds);

  if (triggerResult.pendingCharacters.length === 0) {
    dataLogger.log('[summaryManager] 没有需要总结的角色');
    return {
      success: true,
      results: [],
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
    };
  }

  // 执行总结
  return executeAllPendingSummaries(settings, triggerResult.pendingCharacters);
}

/**
 * 更新待处理队列
 * 在每回合检测后调用，将超过阈值的角色加入队列
 *
 * @param characters 待加入队列的角色
 */
export function updatePendingQueue(characters: PendingCharacterSummary[]): void {
  // 合并新角色到队列（避免重复）
  for (const character of characters) {
    const exists = pendingQueue.some(c => c.characterId === character.characterId);
    if (!exists) {
      pendingQueue.push(character);
      dataLogger.log(`[summaryManager] 角色 ${character.displayName} 加入待处理队列`);
    } else {
      // 更新已存在角色的信息
      const index = pendingQueue.findIndex(c => c.characterId === character.characterId);
      if (index >= 0) {
        pendingQueue[index] = character;
      }
    }
  }
}

/**
 * 清空待处理队列
 */
export function clearPendingQueue(): void {
  pendingQueue = [];
  dataLogger.log('[summaryManager] 待处理队列已清空');
}

/**
 * 检查是否正在执行总结
 */
export function getIsSummarizing(): boolean {
  return isSummarizing;
}
