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
  /** 总结模型原样写回的阶段记忆键名索引；与人物经历分开保存。 */
  $summaryStageMemoryKeys?: string;
  [key: string]: unknown;
}

/**
 * 总结检测结果
 */
export interface SummaryTriggerResult {
  /** 是否应该触发总结 */
  shouldTrigger: boolean;
  /** 触发原因：仅当符合单角色阈值的人物经历总数严格超过总量阈值时触发 */
  triggerReason: 'total_entries' | 'none';
  /** 待总结的角色列表 */
  pendingCharacters: PendingCharacterSummary[];
  /** 仅符合单角色阈值的人物的原始经历条目总数 */
  totalEntries: number;
}

/**
 * 人物总结审计只保留模型真正看到的原始经历和模型原始返回的记忆文本。
 */
export interface SummaryAuditRecord {
  sourceEntries: Record<string, string>;
  modelOutput: string;
}

export interface SummaryAuditCharacterRecord {
  characterId: string;
  displayName: string;
  sourceEntries: Record<string, string>;
  modelOutput: string;
}

/**
 * 单个角色的总结结果
 */
export interface CharacterSummaryResult {
  characterId: string;
  displayName: string;
  success: boolean;
  originalCount: number;
  error?: string;
  audit?: SummaryAuditRecord;
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

export type SummaryProgressSource = 'automatic' | 'manual';
export type SummaryCharacterPhase = 'preparing' | 'generating' | 'validating' | 'waiting-write' | 'writing';
export type SummaryProgressPhase = 'idle' | 'running' | 'completed' | 'failed';

export interface ActiveSummaryCharacter {
  characterId: string;
  displayName: string;
  index: number;
  phase: SummaryCharacterPhase;
}

export interface SummaryAuditTraceSnapshot {
  /** 当前聊天 ID；无法读取时仅保留在本次页面运行内存中。 */
  chatId: string | null;
  results: SummaryAuditCharacterRecord[];
}

export const SUMMARY_AUDIT_TRACE_EVENT = 'wuxia:summaryAuditTraceUpdated';
// 保留旧版 key，确保此前已保存的手动总结记录可以继续读取。
const SUMMARY_AUDIT_TRACE_STORAGE_PREFIX = 'wuxia.manualSummaryTrace.v1:';
let latestSummaryAuditTrace: SummaryAuditTraceSnapshot | null = null;

export interface SummaryProgressSnapshot {
  active: boolean;
  source: SummaryProgressSource | null;
  phase: SummaryProgressPhase;
  targetMessageId?: number;
  targetChatId?: string;
  total: number;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  activeCharacters: ActiveSummaryCharacter[];
  results: CharacterSummaryResult[];
  startedAt: number | null;
  updatedAt: number;
  message?: string;
}

const INITIAL_SUMMARY_PROGRESS: SummaryProgressSnapshot = {
  active: false,
  source: null,
  phase: 'idle',
  total: 0,
  totalProcessed: 0,
  totalSuccess: 0,
  totalFailed: 0,
  activeCharacters: [],
  results: [],
  startedAt: null,
  updatedAt: 0,
};

let summaryProgressSnapshot: SummaryProgressSnapshot = INITIAL_SUMMARY_PROGRESS;
const summaryProgressListeners = new Set<(snapshot: SummaryProgressSnapshot) => void>();

function toSummaryAuditCharacterRecord(
  result: CharacterSummaryResult,
): SummaryAuditCharacterRecord | null {
  if (!result.audit) return null;
  return {
    characterId: result.characterId,
    displayName: result.displayName,
    sourceEntries: { ...result.audit.sourceEntries },
    modelOutput: result.audit.modelOutput,
  };
}

function cloneSummaryProgressResult(result: CharacterSummaryResult): CharacterSummaryResult {
  const progressResult = { ...result };
  delete progressResult.audit;
  return progressResult;
}

function cloneSummaryProgressSnapshot(snapshot: SummaryProgressSnapshot): SummaryProgressSnapshot {
  return {
    ...snapshot,
    activeCharacters: snapshot.activeCharacters.map(character => ({ ...character })),
    results: snapshot.results.map(cloneSummaryProgressResult),
  };
}

function cloneSummaryAuditTrace(snapshot: SummaryAuditTraceSnapshot): SummaryAuditTraceSnapshot {
  return {
    chatId: snapshot.chatId,
    // 读取旧版 localStorage 时只提取 sourceEntries / modelOutput，丢弃提示词、
    // finalOutput、统计字段等旧审计数据。
    results: snapshot.results.map(result => {
      const legacy = result as SummaryAuditCharacterRecord & {
        audit?: SummaryAuditRecord;
      };
      return {
        characterId: result.characterId,
        displayName: result.displayName,
        sourceEntries: { ...(result.sourceEntries || legacy.audit?.sourceEntries || {}) },
        modelOutput: typeof result.modelOutput === 'string'
          ? result.modelOutput
          : legacy.audit?.modelOutput || '',
      };
    }),
  };
}

function getSummaryAuditTraceStorageKey(chatId: string): string {
  return `${SUMMARY_AUDIT_TRACE_STORAGE_PREFIX}${encodeURIComponent(chatId)}`;
}

function notifySummaryAuditTraceUpdated(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(SUMMARY_AUDIT_TRACE_EVENT));
  } catch {
    // 非浏览器环境下忽略事件通知。
  }
}

function publishSummaryAuditTrace(snapshot: SummaryAuditTraceSnapshot): void {
  latestSummaryAuditTrace = cloneSummaryAuditTrace(snapshot);
  if (snapshot.chatId && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        getSummaryAuditTraceStorageKey(snapshot.chatId),
        JSON.stringify(latestSummaryAuditTrace),
      );
    } catch (error) {
      dataLogger.warn('[summaryManager] 无法持久化人物总结输入输出记录，将仅保留在当前页面内存中:', error);
    }
  }
  notifySummaryAuditTraceUpdated();
}

export function getLatestSummaryAuditTrace(): SummaryAuditTraceSnapshot | null {
  const chatId = readCurrentSummaryChatId();
  if (chatId && typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(getSummaryAuditTraceStorageKey(chatId));
      if (stored) {
        const parsed = JSON.parse(stored) as SummaryAuditTraceSnapshot;
        if (
          parsed &&
          parsed.chatId === chatId &&
          Array.isArray(parsed.results)
        ) {
          latestSummaryAuditTrace = cloneSummaryAuditTrace(parsed);
          // 读取旧版记录时立即回存精简结构，移除历史提示词与 finalOutput 等冗余内容。
          try {
            window.localStorage.setItem(
              getSummaryAuditTraceStorageKey(chatId),
              JSON.stringify(latestSummaryAuditTrace),
            );
          } catch (error) {
            dataLogger.warn('[summaryManager] 无法精简旧版人物总结留档:', error);
          }
          return cloneSummaryAuditTrace(latestSummaryAuditTrace);
        }
      }
    } catch (error) {
      dataLogger.warn('[summaryManager] 读取人物总结输入输出记录失败:', error);
    }
  }

  if (latestSummaryAuditTrace?.chatId === chatId) {
    return cloneSummaryAuditTrace(latestSummaryAuditTrace);
  }
  return null;
}



function publishSummaryProgress(patch: Partial<SummaryProgressSnapshot>): void {
  summaryProgressSnapshot = {
    ...summaryProgressSnapshot,
    ...patch,
    activeCharacters: patch.activeCharacters
      ? patch.activeCharacters.map(character => ({ ...character }))
      : summaryProgressSnapshot.activeCharacters,
    results: patch.results ? patch.results.map(cloneSummaryProgressResult) : summaryProgressSnapshot.results,
    updatedAt: Date.now(),
  };
  const snapshot = cloneSummaryProgressSnapshot(summaryProgressSnapshot);
  for (const listener of summaryProgressListeners) {
    try {
      listener(snapshot);
    } catch (error) {
      dataLogger.warn('[summaryManager] 通知总结进度订阅者失败:', error);
    }
  }
}

export function getSummaryProgressSnapshot(): SummaryProgressSnapshot {
  return cloneSummaryProgressSnapshot(summaryProgressSnapshot);
}

export function subscribeSummaryProgress(
  listener: (snapshot: SummaryProgressSnapshot) => void,
): () => void {
  summaryProgressListeners.add(listener);
  try {
    listener(getSummaryProgressSnapshot());
  } catch (error) {
    dataLogger.warn('[summaryManager] 初始化总结进度订阅者失败:', error);
  }
  return () => {
    summaryProgressListeners.delete(listener);
  };
}

/** 有界并行执行任务；等待所有 worker 结束后再抛出意外异常。 */
export async function runWithConcurrencyLimit<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(
    items.length,
    Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : 1)),
  );
  const errors: unknown[] = [];

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
      } catch (error) {
        errors.push(error);
      }
    }
  }));

  if (errors.length > 0) {
    throw errors[0];
  }
}

// =========================================
// 运行时状态
// =========================================

/** 待处理队列 */
let pendingQueue: PendingCharacterSummary[] = [];

/** 是否正在执行总结 */
let isSummarizing = false;

/** 总结任务内部的 ERA 写回串行队列；模型请求可以并行，事务写回按队列顺序执行。 */
let summaryWriteQueue: Promise<void> = Promise.resolve();

async function withSummaryWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = summaryWriteQueue;
  let release!: () => void;
  summaryWriteQueue = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

const LEGACY_SUMMARY_META_KEY = '【总结】';
/** 人物对象上的内部索引，不属于人物经历，也不会发送给总结模型。 */
const SUMMARY_STAGE_MEMORY_KEYS_META_KEY = '$summaryStageMemoryKeys';
// 兼容历史版本已经写回的编号式阶段记忆。
const COMPRESSED_BIOGRAPHY_KEY_RE = /^阶段经历(\d+)/;

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

function isBiographyExperienceKey(key: string): boolean {
  return !key.startsWith('$') && key !== LEGACY_SUMMARY_META_KEY;
}

function getSummaryStageMemoryKeys(character: CharacterDataForSummary | undefined): Set<string> {
  const raw = character?.[SUMMARY_STAGE_MEMORY_KEYS_META_KEY];
  if (typeof raw !== 'string') return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((key): key is string => typeof key === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function isCountedBiographyKey(key: string, summaryStageMemoryKeys: ReadonlySet<string>): boolean {
  return isBiographyExperienceKey(key) &&
    !isCompressedBiographyKey(key) &&
    !summaryStageMemoryKeys.has(key);
}

/**
 * 构建本次压缩计划。已有阶段记忆也会随全部人物经历一起送模并整体替换。
 */
export function buildBiographyCompressionPlan(
  biography: Record<string, string> | string | undefined,
): BiographyCompressionPlan | null {
  const originalBiography = normalizeBiography(biography);
  const sourceEntries = Object.fromEntries(
    Object.entries(originalBiography).filter(([key]) => isBiographyExperienceKey(key)),
  );
  if (Object.keys(sourceEntries).length === 0) return null;

  return {
    originalBiography,
    sourceEntries,
    sourceKeys: Object.keys(sourceEntries),
  };
}

function getRetainedBiography(plan: BiographyCompressionPlan): Record<string, string> {
  const sourceKeys = new Set(plan.sourceKeys);
  const retained: Record<string, string> = {};
  for (const [key, value] of Object.entries(plan.originalBiography)) {
    if (!sourceKeys.has(key) && key !== LEGACY_SUMMARY_META_KEY) {
      retained[key] = value;
    }
  }
  return retained;
}

/**
 * 不改写模型返回的键和值。只拒绝与总结期间新追加的经历发生键冲突的结果，
 * 避免 ERA insert 静默保留新经历而丢弃模型输出。
 */
function createStageMemoryWriteback(
  stageMemories: Record<string, string>,
  retainedBiography: Record<string, string>,
): Record<string, string> {
  const conflicts = Object.keys(stageMemories).filter(key =>
    Object.prototype.hasOwnProperty.call(retainedBiography, key),
  );
  if (conflicts.length > 0) {
    throw new Error(
      `总结模型返回的阶段记忆键与总结期间新增的人物经历冲突（${conflicts.join('、')}），已取消写回以保护新增经历；请重新执行总结。`,
    );
  }
  return stageMemories;
}

export function mergeBiographyCompression(
  plan: BiographyCompressionPlan,
  stageMemories: Record<string, string>,
): Record<string, string> {
  const sourceKeys = new Set(plan.sourceKeys);
  const writeback = createStageMemoryWriteback(stageMemories, getRetainedBiography(plan));
  const result: Record<string, string> = {};
  let inserted = false;

  for (const [key, value] of Object.entries(plan.originalBiography)) {
    if (key === LEGACY_SUMMARY_META_KEY) continue;
    if (sourceKeys.has(key)) {
      if (!inserted) {
        Object.assign(result, writeback);
        inserted = true;
      }
      continue;
    }
    result[key] = value;
  }

  if (!inserted) Object.assign(result, writeback);
  return result;
}

/**
 * 构造总结回写的 ERA 操作。
 *
 * 模型 JSON 中的键和值直接写入人物经历，不重编号、不清理、不补日期、不二次改写。
 * 已总结键名单独保存在人物对象的内部元数据字段中，不混入人物经历或总结提示词。
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
  const writeback = createStageMemoryWriteback(stageMemories, getRetainedBiography(plan));
  const summaryStageMemoryKeys = JSON.stringify(Object.keys(stageMemories));

  const makePayload = (
    biographyEntries: Record<string, unknown>,
    summaryStageMemoryKeysPatch: unknown,
  ): Record<string, unknown> => {
    const characterPatch = {
      人物经历: biographyEntries,
      [SUMMARY_STAGE_MEMORY_KEYS_META_KEY]: summaryStageMemoryKeysPatch,
    };
    if (characterId === 'user') {
      return { user数据: characterPatch };
    }
    return {
      角色数据: {
        [characterName]: characterPatch,
      },
    };
  };

  if (options.replaceLegacyString) {
    return [
      { type: 'delete', payload: makePayload({}, {}) },
      {
        type: 'insert',
        payload: makePayload(writeback, summaryStageMemoryKeys),
      },
    ];
  }

  const keysToDelete = [...plan.sourceKeys];
  if (Object.prototype.hasOwnProperty.call(plan.originalBiography, LEGACY_SUMMARY_META_KEY)) {
    keysToDelete.push(LEGACY_SUMMARY_META_KEY);
  }
  const deleteEntries = Object.fromEntries(keysToDelete.map(key => [key, {}]));

  return [
    { type: 'delete', payload: makePayload(deleteEntries, {}) },
    {
      type: 'insert',
      payload: makePayload(writeback, summaryStageMemoryKeys),
    },
  ];
}

/**
 * 计算人物经历的条目数
 * @param biography 人物经历数据（可能是 Record 或 string）
 * @param summaryStageMemoryKeys 已由人物总结生成的键名，不计入原始经历触发阈值
 * @returns 条目数量
 */
export function getBiographyEntryCount(
  biography: Record<string, string> | string | undefined,
  summaryStageMemoryKeys: ReadonlySet<string> = new Set(),
): number {
  if (!biography) return 0;

  if (typeof biography === 'string') {
    return biography.split('\n').filter(line => line.trim()).length;
  }

  return Object.keys(biography).filter(key =>
    isCountedBiographyKey(key, summaryStageMemoryKeys),
  ).length;
}

/**
 * 将人物经历规范化为 Record 格式
 * @param biography 人物经历数据
 * @returns 规范化后的 Record 格式
 */
export function normalizeBiography(biography: Record<string, string> | string | undefined): Record<string, string> {
  if (!biography) return {};

  if (typeof biography === 'string') {
    const result: Record<string, string> = {};
    const lines = biography.split('\n').filter(line => line.trim());
    lines.forEach((line, index) => {
      result[`条目${index + 1}`] = line.trim();
    });
    return result;
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(biography)) {
    if (isBiographyExperienceKey(key)) result[key] = value;
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
 * 只把原始经历数严格超过单角色阈值的人物计入总量；总量严格超过总阈值才触发自动总结
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

    const addEligibleCharacter = (
      characterId: string,
      displayName: string,
      biography: Record<string, string> | string | undefined,
    ) => {
      if (!biography) return;
      const summaryStageMemoryKeys = characterId === 'user'
        ? getSummaryStageMemoryKeys(userData)
        : getSummaryStageMemoryKeys(
          (statData.角色数据 as Record<string, CharacterDataForSummary> | undefined)?.[
            characterId.replace('character:', '')
          ],
        );
      const count = getBiographyEntryCount(biography, summaryStageMemoryKeys);

      // 只有原始经历数严格超过单角色阈值的人物，才进入待处理名单并计入总量。
      if (count <= thresholds.perCharacterEntriesThreshold) return;

      result.totalEntries += count;
      result.pendingCharacters.push({
        characterId,
        displayName,
        entriesCount: count,
        biography: normalizeBiography(biography),
      });
      dataLogger.log(
        `[summaryManager] 角色 ${displayName} 超过单角色经历阈值: ${count} > ${thresholds.perCharacterEntriesThreshold}`,
      );
    };

    const userData = statData.user数据 as CharacterDataForSummary | undefined;
    if (userData?.人物经历) {
      addEligibleCharacter(
        'user',
        (userData as Record<string, unknown>).用户名 as string || '玩家',
        userData.人物经历,
      );
    }

    const characterData = statData.角色数据 as Record<string, CharacterDataForSummary> | undefined;
    if (characterData) {
      for (const [characterName, character] of Object.entries(characterData)) {
        // 跳过模板和非对象数据。
        if (characterName.startsWith('$') || typeof character !== 'object' || character === null) {
          continue;
        }
        addEligibleCharacter(`character:${characterName}`, characterName, character.人物经历);
      }
    }

    // 只按符合单角色条件的人物的原始经历总数触发；必须严格超过总量阈值。
    if (result.pendingCharacters.length > 0 && result.totalEntries > thresholds.totalEntriesThreshold) {
      result.shouldTrigger = true;
      result.triggerReason = 'total_entries';
      dataLogger.log(
        `[summaryManager] 符合条件的人物经历总数超过阈值: ${result.totalEntries} > ${thresholds.totalEntriesThreshold}`,
      );
    } else {
      dataLogger.log('[summaryManager] 尚未超过符合条件人物的经历总量阈值', {
        eligibleCharacters: result.pendingCharacters.length,
        eligibleEntries: result.totalEntries,
        totalEntriesThreshold: thresholds.totalEntriesThreshold,
      });
    }

    dataLogger.log('[summaryManager] 检测结果:', {
      shouldTrigger: result.shouldTrigger,
      triggerReason: result.triggerReason,
      pendingCount: result.pendingCharacters.length,
      eligibleEntries: result.totalEntries,
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
  const formattedPrompt = template
    .replace(/\{\{characterName\}\}/g, character.displayName)
    .replace(/\{\{biographyEntries\}\}/g, biographyText);

  if (
    template.includes('一次性压缩全部输入经历') &&
    template.includes('不得只总结其中一部分') &&
    template.includes('单行 JSON 字符串') &&
    template.includes('模型输出的键名和值会原样写回') &&
    template.includes('日期前缀必须由模型自行提供')
  ) {
    return formattedPrompt;
  }

  return `${formattedPrompt}

【本次压缩的强制要求】
本次输入包含该人物当前全部人物经历，包括原始经历和已有阶段记忆。写回时，这些输入条目会被整体替换。必须将全部输入条目中的重要事实整合进返回的阶段记忆，不得只总结一部分，也不得要求保留未总结的原始条目。近期经历也必须纳入总结，并保留其与当前剧情有关的关键细节、个人视角和心绪。只依据输入内容，不得编造事实。输出必须是严格合法的 JSON 对象，键为阶段总结名称，值为完整阶段记忆文本；每个值必须是单行 JSON 字符串。模型输出的键名和值会原样写回人物经历，程序不会重命名、重编号、清理、补日期或改写模型输出。若能从输入中准确识别游戏内日期，日期前缀必须由模型自行提供，只能使用输入中的日期；若无法可靠确定日期范围，值的开头写“（旧记录时间不详）”。不得把现实日期、小说章节号、回目编号或集数当作游戏内日期。日期范围分隔符直接写作 ~，不得写成反斜杠加波浪号。输出前检查整个对象能被 JSON.parse 直接解析。`;
}

// =========================================
// 总结执行
// =========================================

/**
 * 将无效模型响应压缩为有限预览，避免错误信息携带整段输出。
 */
function formatSummaryResponsePreview(response: string): string {
  const compact = response
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '（空响应）';
  if (compact.length <= 220) return compact;
  return `${compact.slice(0, 160)} … [中间内容省略] … ${compact.slice(-60)}`;
}

/**
 * 将无效模型响应压缩为有限预览，避免错误信息携带整段输出。
 */
function formatSummaryResponsePreview(response: string): string {
  const compact = response
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '（空响应）';
  if (compact.length <= 220) return compact;
  return `${compact.slice(0, 160)} … [中间内容省略] … ${compact.slice(-60)}`;
}

/**
 * 严格解析模型返回的阶段记忆 JSON。
 *
 * JSON.parse 只负责把 JSON 解码为对象；键名和值都保持模型给出的内容，
 * 不做 trim、重命名、重编号、日期补齐或内容清洗。
 */
export function parseSummaryResponse(
  response: string,
  maxStageMemories?: number,
): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch (error) {
    const parseMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      '总结模型输出不是合法 JSON。解析器错误：' + parseMessage +
      '；响应长度：' + response.length + ' 字符；响应预览：' +
      formatSummaryResponsePreview(response) +
      '。请只返回严格合法的 JSON 对象；已取消写回以保护原始人物经历。',
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('总结模型必须返回 JSON 对象，键为阶段记忆名称，值为记忆内容。');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw new Error('总结模型返回了空 JSON 对象。');
  if (maxStageMemories !== undefined && entries.length > maxStageMemories) {
    throw new Error(`总结模型返回了 ${entries.length} 条阶段记忆，多于本批 ${maxStageMemories} 条输入经历；已取消写回。`);
  }

  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!key.trim()) throw new Error('总结 JSON 的阶段记忆名称不能为空。');
    if (
      key.startsWith('$') ||
      key === LEGACY_SUMMARY_META_KEY ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      throw new Error(`总结 JSON 的键名“${key}”属于保留键，不能作为阶段记忆名称。`);
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`阶段记忆“${key}”必须对应非空字符串。`);
    }
    Object.defineProperty(result, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return result;
}

function readCurrentCharacterSummaryStageMemoryKeys(characterId: string): Set<string> {
  const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
  const statData = variables?.stat_data as Record<string, unknown> | undefined;
  if (!statData) return new Set();

  const characterData = characterId === 'user'
    ? statData.user数据 as CharacterDataForSummary | undefined
    : (statData.角色数据 as Record<string, CharacterDataForSummary> | undefined)?.[
      characterId.replace('character:', '')
    ];
  return getSummaryStageMemoryKeys(characterData);
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

function readCurrentSummaryChatId(): string | null {
  try {
    type SummaryTavernApi = { getCurrentChatId?: () => string | number | null | undefined };
    const currentWindow = globalThis as typeof globalThis & { SillyTavern?: SummaryTavernApi };
    const parentWindow = typeof window !== 'undefined'
      ? window.parent as Window & typeof globalThis & { SillyTavern?: SummaryTavernApi }
      : undefined;
    const chatId = currentWindow.SillyTavern?.getCurrentChatId?.()
      ?? parentWindow?.SillyTavern?.getCurrentChatId?.();
    if (typeof chatId === 'string') {
      const normalized = chatId.trim();
      return normalized || null;
    }
    if (typeof chatId === 'number' && Number.isFinite(chatId)) {
      return String(chatId);
    }
    return null;
  } catch {
    return null;
  }
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
  onProgress?: (phase: SummaryCharacterPhase) => void,
  expectedChatId?: string | null,
  captureAudit = false,
): Promise<CharacterSummaryResult> {
  onProgress?.('preparing');
  dataLogger.log(`[summaryManager] 开始总结角色: ${character.displayName}`);

  const result: CharacterSummaryResult = {
    characterId: character.characterId,
    displayName: character.displayName,
    success: false,
    originalCount: character.entriesCount,
  };

  try {
    const initialBiography = readCurrentCharacterBiography(character.characterId);
    const summaryStageMemoryKeys = readCurrentCharacterSummaryStageMemoryKeys(character.characterId);
    result.originalCount = getBiographyEntryCount(initialBiography, summaryStageMemoryKeys);
    const compressionPlan = buildBiographyCompressionPlan(initialBiography);
    if (!compressionPlan) {
      result.success = true;
      dataLogger.log(`[summaryManager] 角色 ${character.displayName} 没有人物经历可压缩，跳过`);
      return result;
    }

    const sourceCharacter: PendingCharacterSummary = {
      ...character,
      entriesCount: Object.keys(compressionPlan.sourceEntries).length,
      biography: compressionPlan.sourceEntries,
    };

    // 1. 将该人物的全部经历（包括已有阶段记忆）一次性发送给模型。
    const prompt = formatPromptForCharacter(settings.promptTemplate, sourceCharacter);
    if (captureAudit) {
      result.audit = {
        sourceEntries: { ...compressionPlan.sourceEntries },
        modelOutput: '',
      };
    }
    dataLogger.log(`[summaryManager] 构建的提示词长度: ${prompt.length}`);

    // 2. 调用总结 API
    onProgress?.('generating');
    const requestSettings = resolveConfiguredTextSettings(settings, 'summary');
    dataLogger.log('[summaryManager] 调用总结 API...', {
      apiMode: requestSettings.apiMode,
      source: requestSettings.apiConfig.source,
      stream: requestSettings.stream,
    });
    const response = await requestSummaryText({ prompt, settings });
    if (result.audit) result.audit.modelOutput = response;
    dataLogger.log(`[summaryManager] 收到响应，长度: ${response.length}`);

    onProgress?.('validating');
    // 3. 严格解析模型返回的多条阶段记忆 JSON
    const summaryEntries = parseSummaryResponse(response, Object.keys(compressionPlan.sourceEntries).length);

    // 模型请求并行，但每个人物的最终重读、冲突检查和 ERA 写回必须串行。
    // 在取得写回队列后再重读，确保等待队列期间新增的经历也能被保留。
    onProgress?.('waiting-write');
    await withSummaryWriteLock(async () => {
      if (expectedChatId && readCurrentSummaryChatId() !== expectedChatId) {
        throw new Error('总结期间当前聊天已切换，已取消写回，避免将人物经历写入其他聊天。');
      }
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
        insertedKeys: Object.keys(summaryEntries),
        legacyStringBiography: typeof latestRawBiography === 'string',
      });

      onProgress?.('writing');
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
  source: SummaryProgressSource = 'automatic',
  targetChatId?: string | null,
): Promise<BatchSummaryResult> {
  const result: BatchSummaryResult = {
    success: false,
    results: [],
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
  };

  if (isSummarizing) {
    dataLogger.log('[summaryManager] 已有总结任务在执行中，跳过');
    return result;
  }

  const targetCharacters = characters || pendingQueue;
  if (targetCharacters.length === 0) {
    dataLogger.log('[summaryManager] 没有待总结的角色');
    result.success = true;
    return result;
  }

  const resolvedTargetMessageId = targetMessageId ?? getLatestAssistantMessageId();
  const resolvedTargetChatId = targetChatId === undefined ? readCurrentSummaryChatId() : targetChatId;
  if (!Number.isInteger(resolvedTargetMessageId) || (resolvedTargetMessageId as number) < 0) {
    throw new Error('无法确定总结写回的 assistant 楼层，已取消总结以避免写入错误楼层。');
  }

  isSummarizing = true;
  const startedAt = Date.now();
  const resultsByIndex: Array<CharacterSummaryResult | undefined> = new Array(targetCharacters.length);
  let auditTrace: SummaryAuditTraceSnapshot = {
    chatId: resolvedTargetChatId ?? null,
    results: [],
  };
  publishSummaryAuditTrace(auditTrace);
  publishSummaryProgress({
    active: true,
    source,
    phase: 'running',
    targetMessageId: resolvedTargetMessageId as number,
    targetChatId: resolvedTargetChatId ?? undefined,
    total: targetCharacters.length,
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    activeCharacters: [],
    results: [],
    startedAt,
    message: source === 'automatic' ? '自动人物总结已启动' : '手动人物总结已启动',
  });
  dataLogger.log(`[summaryManager] 开始批量总结，共 ${targetCharacters.length} 个角色，并行数 ${settings.summaryConcurrency || 2}`);

  const concurrency = Math.max(
    1,
    Math.min(5, Math.floor(Number.isFinite(settings.summaryConcurrency) ? settings.summaryConcurrency : 2)),
  );

  const updateCharacterPhase = (characterId: string, phase: SummaryCharacterPhase) => {
    const snapshot = getSummaryProgressSnapshot();
    publishSummaryProgress({
      activeCharacters: snapshot.activeCharacters.map(activeCharacter =>
        activeCharacter.characterId === characterId
          ? { ...activeCharacter, phase }
          : activeCharacter,
      ),
      message: `正在处理人物：${snapshot.activeCharacters.find(item => item.characterId === characterId)?.displayName || characterId}`,
    });
  };

  try {
    await runWithConcurrencyLimit(targetCharacters, concurrency, async (character, index) => {
      const snapshot = getSummaryProgressSnapshot();
      publishSummaryProgress({
        activeCharacters: [
          ...snapshot.activeCharacters,
          {
            characterId: character.characterId,
            displayName: character.displayName,
            index: index + 1,
            phase: 'preparing',
          },
        ].sort((a, b) => a.index - b.index),
        message: `准备总结人物：${character.displayName}`,
      });

      let summaryResult: CharacterSummaryResult;
      try {
        summaryResult = await executeSummary(
          settings,
          character,
          resolvedTargetMessageId as number,
          phase => updateCharacterPhase(character.characterId, phase),
          resolvedTargetChatId,
          true,
        );
      } catch (error) {
        summaryResult = {
          characterId: character.characterId,
          displayName: character.displayName,
          success: false,
          originalCount: character.entriesCount,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      resultsByIndex[index] = summaryResult;
      const completedResults = resultsByIndex.filter(
        (item): item is CharacterSummaryResult => item !== undefined,
      );
      const current = getSummaryProgressSnapshot();
      if (auditTrace) {
        auditTrace = {
          ...auditTrace,
          results: completedResults
            .map(toSummaryAuditCharacterRecord)
            .filter((item): item is SummaryAuditCharacterRecord => item !== null),
        };
        publishSummaryAuditTrace(auditTrace);
      }

      publishSummaryProgress({
        totalProcessed: completedResults.length,
        totalSuccess: completedResults.filter(item => item.success).length,
        totalFailed: completedResults.filter(item => !item.success).length,
        results: completedResults,
        activeCharacters: current.activeCharacters.filter(
          activeCharacter => activeCharacter.characterId !== character.characterId,
        ),
        message: summaryResult.success
          ? `人物总结完成：${character.displayName}`
          : `人物总结失败：${character.displayName}`,
      });

      // 保留轻微节流，避免同一 worker 连续补位时瞬间发出下一批请求。
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    result.results = resultsByIndex.filter((item): item is CharacterSummaryResult => item !== undefined);
    result.totalProcessed = result.results.length;
    result.totalSuccess = result.results.filter(item => item.success).length;
    result.totalFailed = result.results.filter(item => !item.success).length;
    result.success = result.totalFailed === 0 && result.totalProcessed === targetCharacters.length;
    if (auditTrace) {
      auditTrace = {
        ...auditTrace,
        results: result.results
          .map(toSummaryAuditCharacterRecord)
          .filter((item): item is SummaryAuditCharacterRecord => item !== null),
      };
      publishSummaryAuditTrace(auditTrace);
    }

    // 本轮所有待处理人物都已尝试完成；后续回合会重新计算阈值和队列。
    pendingQueue = [];
    dataLogger.log('[summaryManager] 批量总结完成:', {
      totalProcessed: result.totalProcessed,
      totalSuccess: result.totalSuccess,
      totalFailed: result.totalFailed,
      concurrency,
    });
    publishSummaryProgress({
      active: false,
      phase: 'completed',
      totalProcessed: result.totalProcessed,
      totalSuccess: result.totalSuccess,
      totalFailed: result.totalFailed,
      results: result.results,
      activeCharacters: [],
      message: result.totalFailed > 0 ? '总结已结束，部分人物失败' : '所有人物总结完成',
    });
  } catch (error) {
    dataLogger.error('[summaryManager] 批量总结过程中发生错误:', error);
    result.results = resultsByIndex.filter((item): item is CharacterSummaryResult => item !== undefined);
    result.totalProcessed = result.results.length;
    result.totalSuccess = result.results.filter(item => item.success).length;
    result.totalFailed = result.results.filter(item => !item.success).length;
    result.success = false;
    if (auditTrace) {
      auditTrace = {
        ...auditTrace,
        results: result.results
          .map(toSummaryAuditCharacterRecord)
          .filter((item): item is SummaryAuditCharacterRecord => item !== null),
      };
      publishSummaryAuditTrace(auditTrace);
    }
    publishSummaryProgress({
      active: false,
      phase: 'failed',
      totalProcessed: result.totalProcessed,
      totalSuccess: result.totalSuccess,
      totalFailed: result.totalFailed,
      results: result.results,
      activeCharacters: [],
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isSummarizing = false;
  }

  return {
    ...result,
    // 输入与模型原始输出单独持久化；普通进度结果不携带审计正文。
    results: result.results.map(cloneSummaryProgressResult),
  };
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
  return executeAllPendingSummaries(settings, triggerResult.pendingCharacters, undefined, 'manual');
}

/**
 * 仅重试上一轮失败的人物；重新扫描当前经历，避免使用过期的失败前快照。
 */
export async function retryFailedSummaryCharacters(
  settings: SummarySettings,
  failedResults: CharacterSummaryResult[],
  targetMessageId?: number,
  targetChatId?: string,
): Promise<BatchSummaryResult> {
  if (failedResults.length === 0) {
    return { success: true, results: [], totalProcessed: 0, totalSuccess: 0, totalFailed: 0 };
  }
  if (isSummarizing) {
    throw new Error('已有总结任务在执行中，请稍后再试。');
  }
  if (targetChatId && readCurrentSummaryChatId() !== targetChatId) {
    throw new Error('当前聊天与失败总结所属聊天不同，请切回原聊天后再重试。');
  }

  const failedIds = new Set(failedResults.map(item => item.characterId));
  const currentCandidates = checkSummaryTrigger(settings.thresholds).pendingCharacters
    .filter(character => failedIds.has(character.characterId));
  const candidateIds = new Set(currentCandidates.map(character => character.characterId));
  const unavailableResults = failedResults
    .filter(item => !candidateIds.has(item.characterId))
    .map(item => ({
      ...item,
      success: false,
      error: '当前人物经历已变化或不再满足单角色总结阈值，未重新发送模型请求。',
    }));

  let retried: BatchSummaryResult = {
    success: true,
    results: [],
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
  };
  if (currentCandidates.length > 0) {
    retried = await executeAllPendingSummaries(settings, currentCandidates, targetMessageId, 'manual', targetChatId);
  }

  const retriedById = new Map(retried.results.map(item => [item.characterId, item]));
  const unavailableById = new Map(unavailableResults.map(item => [item.characterId, item]));
  const combinedResults = failedResults.map(item =>
    retriedById.get(item.characterId) || unavailableById.get(item.characterId) || item,
  );
  const combined: BatchSummaryResult = {
    success: combinedResults.every(item => item.success),
    results: combinedResults,
    totalProcessed: combinedResults.length,
    totalSuccess: combinedResults.filter(item => item.success).length,
    totalFailed: combinedResults.filter(item => !item.success).length,
  };

  publishSummaryProgress({
    active: false,
    phase: 'completed',
    source: 'manual',
    targetMessageId: targetMessageId ?? getLatestAssistantMessageId() ?? undefined,
    targetChatId: targetChatId ?? readCurrentSummaryChatId() ?? undefined,
    total: combined.totalProcessed,
    totalProcessed: combined.totalProcessed,
    totalSuccess: combined.totalSuccess,
    totalFailed: combined.totalFailed,
    activeCharacters: [],
    results: combined.results,
    message: combined.totalFailed > 0 ? '失败人物重试结束，仍有失败项' : '失败人物重试完成',
  });
  return combined;
}

/**
 * 更新待处理人物快照
 * 每回合检测后以当前符合单角色阈值的人物列表替换旧快照
 *
 * @param characters 当前符合单角色阈值的人物
 */
export function updatePendingQueue(characters: PendingCharacterSummary[]): void {
  // 以本轮重新扫描结果为准，移除已经低于阈值或已完成压缩的旧队列项目。
  pendingQueue = [...characters];
  dataLogger.log('[summaryManager] 更新待处理人物快照:', pendingQueue.map(character => ({
    characterId: character.characterId,
    entriesCount: character.entriesCount,
  })));
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
