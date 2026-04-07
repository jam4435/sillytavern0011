/**
 * 自动总结管理器
 * 用于检测和执行角色人物经历的自动总结
 */

import { dataLogger } from './logger';
import type {
  SummarySettings,
  SummaryThresholds,
  PendingCharacterSummary,
} from './settingsManager';

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
  triggerReason: 'pending_queue' | 'total_entries' | 'none';
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

// =========================================
// 工具函数
// =========================================

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

  // 如果是对象，计算键的数量（排除 $template 等特殊键）
  return Object.keys(biography).filter(key => !key.startsWith('$')).length;
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
    // 获取游戏变量
    const rawVariables = getAllVariables() as Record<string, unknown>;
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

    // 3. 判断是否触发总结
    if (result.pendingCharacters.length >= thresholds.pendingQueueThreshold) {
      result.shouldTrigger = true;
      result.triggerReason = 'pending_queue';
      dataLogger.log(`[summaryManager] 待处理角色数达到阈值: ${result.pendingCharacters.length} >= ${thresholds.pendingQueueThreshold}`);
    } else if (result.totalEntries >= thresholds.totalEntriesThreshold) {
      result.shouldTrigger = true;
      result.triggerReason = 'total_entries';
      dataLogger.log(`[summaryManager] 总条目数达到阈值: ${result.totalEntries} >= ${thresholds.totalEntriesThreshold}`);
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
 * 解析总结结果，提取 <summary> 标签内容
 *
 * @param response AI 返回的原始文本
 * @returns 提取的总结内容，如果没有找到标签则返回整个响应
 */
function parseSummaryResponse(response: string): string {
  const match = response.match(/<summary>([\s\S]*?)<\/summary>/i);
  if (match) {
    return match[1].trim();
  }
  // 如果没有找到 summary 标签，返回整个响应（去除首尾空白）
  return response.trim();
}

/**
 * 将总结结果转换为人物经历格式
 *
 * @param summaryContent 总结内容
 * @returns 格式化后的人物经历对象
 */
function formatSummaryToBiography(summaryContent: string): Record<string, string> {
  const lines = summaryContent.split('\n').filter(line => line.trim());
  const result: Record<string, string> = {};

  // 添加总结标记
  result['【总结】'] = `以下为AI总结的精炼经历（${new Date().toLocaleDateString('zh-CN')}）`;

  // 将每行作为一个条目
  lines.forEach((line, index) => {
    // 去除可能的列表标记（如 - 或 数字.）
    const cleanLine = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
    if (cleanLine) {
      result[`经历${index + 1}`] = cleanLine;
    }
  });

  return result;
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
): Promise<CharacterSummaryResult> {
  dataLogger.log(`[summaryManager] 开始总结角色: ${character.displayName}`);

  const result: CharacterSummaryResult = {
    characterId: character.characterId,
    displayName: character.displayName,
    success: false,
    originalCount: character.entriesCount,
  };

  try {
    // 1. 构建提示词
    const prompt = formatPromptForCharacter(settings.promptTemplate, character);
    dataLogger.log(`[summaryManager] 构建的提示词长度: ${prompt.length}`);

    // 2. 调用 generate API
    const generateConfig: {
      user_input: string;
      should_silence: boolean;
      custom_api?: {
        apiurl: string;
        key: string;
        model: string;
        source?: string;
      };
    } = {
      user_input: prompt,
      should_silence: true, // 静默生成，不干扰主聊天
    };

    // 如果配置了自定义 API，使用自定义 API
    if (settings.apiConfig.apiurl && settings.apiConfig.model) {
      generateConfig.custom_api = {
        apiurl: settings.apiConfig.apiurl,
        key: settings.apiConfig.key,
        model: settings.apiConfig.model,
        source: settings.apiConfig.source || 'openai',
      };
      dataLogger.log(`[summaryManager] 使用自定义 API: ${settings.apiConfig.apiurl}`);
    }

    dataLogger.log('[summaryManager] 调用 generate API...');
    const response = await generate(generateConfig);
    dataLogger.log(`[summaryManager] 收到响应，长度: ${response.length}`);

    // 3. 解析响应
    const summaryContent = parseSummaryResponse(response);
    result.summaryContent = summaryContent;

    // 4. 将总结写回变量表
    const newBiography = formatSummaryToBiography(summaryContent);

    // 构建更新数据
    const updateData: Record<string, unknown> = {};
    if (character.characterId === 'user') {
      updateData.user数据 = { 人物经历: newBiography };
    } else {
      const characterName = character.characterId.replace('character:', '');
      updateData.角色数据 = {
        [characterName]: { 人物经历: newBiography },
      };
    }

    dataLogger.log('[summaryManager] 写入更新数据:', JSON.stringify(updateData, null, 2));

    // 使用 updateByObject 替换人物经历
    eventEmit('era:updateByObject', updateData);

    // 等待写入完成
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        dataLogger.log('[summaryManager] 等待写入超时 (500ms)');
        resolve();
      }, 500);
      eventOnce('era:writeDone', () => {
        clearTimeout(timeout);
        resolve();
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

  isSummarizing = true;
  dataLogger.log(`[summaryManager] 开始批量总结，共 ${targetCharacters.length} 个角色`);

  try {
    // 顺序执行总结（避免 API 过载）
    for (const character of targetCharacters) {
      const summaryResult = await executeSummary(settings, character);
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
