/**
 * 势力差事候选池后台生成与接取。
 *
 * - 后台模型只生成未接取候选任务，落在 stat_data.前端变量.可选任务.【势力名】。
 * - 候选任务对象与正式 stat_data.任务.【任务名】完全同构。
 * - 接取由前端 ERA 原子事务完成，不调用 AI。
 * - 专用任务结构提示词只发送给后台模型，绝不进入正文 User 消息。
 */
import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import type { FactionTask, FactionTaskMap, FactionTaskReward, InventoryItemVariableData } from '../types';
import { prepareExtraVariableUpdateTurn } from './extraVariableUpdateManager';
import { getFactionCandidateLocations, getSectByName } from './factionManager';
import { gameLogger } from './logger';
import { runWith429Retry } from './rateLimitRetry';
import type { SummarySettings } from './settingsManager';
import { requestConfiguredText, resolveConfiguredTextSettings } from './summaryApiClient';

declare function getVariables(filter?: { type: 'chat' | 'character' | 'global' }): Promise<Record<string, unknown>>;

const TASK_GENERATION_TIMEOUT_MS = 360000;
const GENERATED_TASK_COUNT = 3;
type UnknownRecord = Record<string, unknown>;

export interface GenerateFactionTaskOptionsResult {
  success: boolean;
  error?: string;
  tasks?: FactionTaskMap;
  commandText?: string;
}

export interface AcceptFactionTaskOptionResult {
  success: boolean;
  error?: string;
  task?: FactionTask;
  commandText?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createTransactionId(prefix: string): string {
  try {
    if (typeof crypto?.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    // ignore
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStatData(variables: Record<string, unknown>): UnknownRecord {
  return isRecord(variables.stat_data) ? variables.stat_data : variables;
}

function normalizeNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function normalizeTaskReward(rawReward: unknown): FactionTaskReward | undefined {
  if (!isRecord(rawReward)) return undefined;
  const reward: FactionTaskReward = {};
  const contribution = normalizeNonNegativeInteger(rawReward.贡献增量);
  const cultivation = normalizeNonNegativeInteger(rawReward.修为增量);
  if (contribution !== undefined) reward.贡献增量 = contribution;
  if (cultivation !== undefined) reward.修为增量 = cultivation;

  if (isRecord(rawReward.获得物品)) {
    const items: Record<string, InventoryItemVariableData> = {};
    for (const [itemName, rawItem] of Object.entries(rawReward.获得物品)) {
      if (!itemName.trim() || !isRecord(rawItem)) continue;
      const item: InventoryItemVariableData = {};
      if (typeof rawItem.类型 === 'string') item.类型 = rawItem.类型.trim();
      if (typeof rawItem.品阶 === 'string') item.品阶 = rawItem.品阶.trim();
      if (typeof rawItem.物品描述 === 'string') item.物品描述 = rawItem.物品描述.trim();
      const count = normalizeNonNegativeInteger(rawItem.数量);
      if (count !== undefined) item.数量 = count;
      items[itemName.trim()] = item;
    }
    if (Object.keys(items).length > 0) reward.获得物品 = items;
  }
  return reward;
}

function normalizeTask(rawTask: unknown, factionName: string, allowedLocations: Set<string>): FactionTask | null {
  if (!isRecord(rawTask)) return null;
  const detail = typeof rawTask.任务详情 === 'string' ? rawTask.任务详情.trim() : '';
  const location = typeof rawTask.任务地点 === 'string' ? rawTask.任务地点.trim() : '';
  if (!detail || !location || !allowedLocations.has(location)) return null;
  return {
    所属势力: factionName,
    任务详情: detail,
    任务地点: location,
    任务执行情况: '未到达地点',
    任务奖励: normalizeTaskReward(rawTask.任务奖励),
  };
}

function extractJsonObject(rawResponse: string): UnknownRecord {
  const trimmed = rawResponse.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('后台任务模型没有返回 JSON 对象');
  const parsed = JSON.parse(trimmed.slice(first, last + 1)) as unknown;
  if (!isRecord(parsed)) throw new Error('后台任务模型返回的 JSON 根节点不是对象');
  return parsed;
}

function parseGeneratedTasks(
  rawResponse: string,
  factionName: string,
  candidateLocations: string[],
  existingTaskNames: Set<string>,
): FactionTaskMap {
  const parsed = extractJsonObject(rawResponse);
  const rawTasks = isRecord(parsed.任务) ? parsed.任务 : null;
  if (!rawTasks) throw new Error('后台任务模型返回中缺少“任务”对象');

  const allowedLocations = new Set(candidateLocations);
  const result: FactionTaskMap = {};
  for (const [rawName, rawTask] of Object.entries(rawTasks)) {
    const taskName = rawName.trim();
    if (!taskName || existingTaskNames.has(taskName) || Object.hasOwn(result, taskName)) continue;
    const task = normalizeTask(rawTask, factionName, allowedLocations);
    if (!task) continue;
    result[taskName] = task;
    if (Object.keys(result).length >= GENERATED_TASK_COUNT) break;
  }
  if (Object.keys(result).length !== GENERATED_TASK_COUNT) {
    throw new Error(`后台任务模型未生成足够的合法候选差事（需要 ${GENERATED_TASK_COUNT} 项）`);
  }
  return result;
}

function buildTaskGenerationPrompt(options: {
  factionName: string;
  applicantName: string;
  realm: string;
  factionDescription: string;
  candidateLocations: string[];
  existingTaskNames: string[];
}): string {
  const { factionName, applicantName, realm, factionDescription, candidateLocations, existingTaskNames } = options;
  return `你是武侠 RPG 的“势力差事候选任务生成器”。本请求只负责生成结构化候选任务，不负责正文叙事。

【当前信息】
势力：${factionName}
玩家：${applicantName}
玩家境界：${realm}
势力风格：${factionDescription || '依照该势力的组织风格与驻地环境生成'}
合法任务地点白名单：${JSON.stringify(candidateLocations)}
玩家已接取任务名：${JSON.stringify(existingTaskNames)}

【生成要求】
1. 一次生成恰好 ${GENERATED_TASK_COUNT} 个彼此不同、可供玩家选择的势力差事。
2. 任务符合当前势力风格与玩家境界，避免三个任务同质化。
3. “任务地点”只能逐字选自合法任务地点白名单。
4. “所属势力”必须是“${factionName}”。
5. “任务执行情况”必须固定为“未到达地点”。
6. 不得与玩家已接取任务重名。
7. 每个候选任务对象必须与正式任务完全一致，禁止增加 id、难度、生成时间、备注等额外字段。
8. 奖励使用“贡献增量 / 修为增量 / 获得物品”现有结构，数值为非负整数并与任务强度相称。
9. 只输出一个合法 JSON 对象，不要 Markdown 代码围栏，不要 VariableInsert / VariableEdit，不要解释文字。

【唯一允许的输出结构】
{
  "任务": {
    "任务名A": {
      "所属势力": "${factionName}",
      "任务详情": "……",
      "任务地点": "${candidateLocations[0] || ''}",
      "任务执行情况": "未到达地点",
      "任务奖励": {
        "贡献增量": 30,
        "修为增量": 50,
        "获得物品": {
          "铜钱": {
            "类型": "杂物",
            "品阶": "凡品",
            "物品描述": "流通铜钱。",
            "数量": 200
          }
        }
      }
    }
  }
}`;
}

function buildBrowseCommand(factionName: string, tasks: FactionTaskMap): string {
  const lines = Object.entries(tasks).map(
    ([taskName, task]) => `- 《${taskName}》：${task.任务详情}（地点：${task.任务地点}）`,
  );
  return `🏷️ [势力差事] User前往${factionName}查看当前可接差事，见到以下差事可供选择：\n${lines.join('\n')}\n这些只是当前可选差事，尚未视为User已经接取。`;
}

async function replaceFactionTaskPool(factionName: string, tasks: FactionTaskMap): Promise<void> {
  const variables = await getVariables({ type: 'chat' });
  const statData = readStatData(variables);
  const frontendVariables = isRecord(statData.前端变量) ? statData.前端变量 : {};
  const availableTaskRoot = isRecord(frontendVariables.可选任务) ? frontendVariables.可选任务 : {};
  const hadExistingPool = isRecord(availableTaskRoot[factionName]);

  const transactionId = createTransactionId('faction-task-options');
  const operations: Array<{ type: 'insert' | 'delete'; payload: Record<string, unknown> }> = [];
  if (hadExistingPool) {
    operations.push({
      type: 'delete',
      payload: { 前端变量: { 可选任务: { [factionName]: null } } },
    });
  }
  operations.push({
    type: 'insert',
    payload: { 前端变量: { 可选任务: { [factionName]: tasks } } },
  });

  await emitSourcedEraVariableWriteAndWait({
    source: 'frontend',
    operation: 'update',
    reason: 'faction-task-options-generate',
    refreshHint: 'character-data',
    eventName: 'era:transactionByObject',
    attribution: 'background',
    detail: { transactionId, operations },
    expectedAction: 'apiWrite',
    expectedTransactionId: transactionId,
    timeoutMs: 10000,
    timeoutMessage: '候选差事已生成，但 ERA 未确认候选任务池写入。',
  });
}

export async function generateFactionTaskOptions(options: {
  sectName: string;
  applicantName: string;
  realm: string;
  settings: SummarySettings;
}): Promise<GenerateFactionTaskOptionsResult> {
  const sect = getSectByName(options.sectName);
  if (!sect) return { success: false, error: `未找到势力：${options.sectName}` };

  let reservation: Awaited<ReturnType<typeof prepareExtraVariableUpdateTurn>> | null = null;
  try {
    reservation = await prepareExtraVariableUpdateTurn(options.settings);
    const variables = await getVariables({ type: 'chat' });
    const statData = readStatData(variables);
    const officialTasks = isRecord(statData.任务) ? statData.任务 : {};
    const existingTaskNames = Object.keys(officialTasks).filter(name => !name.startsWith('$'));
    const candidateLocations = getFactionCandidateLocations(sect);
    const prompt = buildTaskGenerationPrompt({
      factionName: sect.门派名称,
      applicantName: options.applicantName,
      realm: options.realm,
      factionDescription: sect.特色描述,
      candidateLocations,
      existingTaskNames,
    });
    const requestSettings = resolveConfiguredTextSettings(options.settings, 'variable');
    const rawResponse = await runWith429Retry(
      () => requestConfiguredText({
        prompt,
        settings: requestSettings,
        timeoutMs: TASK_GENERATION_TIMEOUT_MS,
        shouldStream: false,
        generationIdPrefix: 'wuxia-faction-task-options',
        skipWorldInfoAndAuthorNote: true,
      }),
      { requestLabel: '势力差事候选生成' },
    );
    const tasks = parseGeneratedTasks(rawResponse, sect.门派名称, candidateLocations, new Set(existingTaskNames));
    await replaceFactionTaskPool(sect.门派名称, tasks);
    gameLogger.log('[factionTaskGenerator] 候选差事生成完成:', { faction: sect.门派名称, taskNames: Object.keys(tasks) });
    return { success: true, tasks, commandText: buildBrowseCommand(sect.门派名称, tasks) };
  } catch (error) {
    gameLogger.error('[factionTaskGenerator] 候选差事生成失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '候选差事生成失败' };
  } finally {
    reservation?.release();
  }
}

export async function acceptFactionTaskOption(
  factionName: string,
  taskName: string,
): Promise<AcceptFactionTaskOptionResult> {
  const sect = getSectByName(factionName);
  if (!sect) return { success: false, error: `未找到势力：${factionName}` };

  try {
    const variables = await getVariables({ type: 'chat' });
    const statData = readStatData(variables);
    const frontendVariables = isRecord(statData.前端变量) ? statData.前端变量 : {};
    const availableTaskRoot = isRecord(frontendVariables.可选任务) ? frontendVariables.可选任务 : {};
    const rawPool = isRecord(availableTaskRoot[factionName]) ? availableTaskRoot[factionName] : null;
    if (!rawPool || !Object.hasOwn(rawPool, taskName)) {
      return { success: false, error: '该候选差事已不存在，请刷新差事列表后重试' };
    }

    const officialTasks = isRecord(statData.任务) ? statData.任务 : {};
    const officialTaskNames = Object.keys(officialTasks).filter(name => !name.startsWith('$'));
    if (officialTaskNames.length >= 3) return { success: false, error: '当前执行中的差事已达上限（3个）' };
    if (Object.hasOwn(officialTasks, taskName)) return { success: false, error: `已经接取过《${taskName}》` };

    const candidateLocations = new Set(getFactionCandidateLocations(sect));
    const task = normalizeTask(rawPool[taskName], factionName, candidateLocations);
    if (!task) return { success: false, error: '候选差事结构或地点不合法，请刷新差事列表' };

    const remainingPool: FactionTaskMap = {};
    for (const [name, rawTask] of Object.entries(rawPool)) {
      if (name === taskName) continue;
      const normalized = normalizeTask(rawTask, factionName, candidateLocations);
      if (normalized) remainingPool[name] = normalized;
    }

    const transactionId = createTransactionId('faction-task-accept');
    const operations: Array<{ type: 'insert' | 'delete'; payload: Record<string, unknown> }> = [
      { type: 'insert', payload: { 任务: { [taskName]: task } } },
      { type: 'delete', payload: { 前端变量: { 可选任务: { [factionName]: null } } } },
    ];
    if (Object.keys(remainingPool).length > 0) {
      operations.push({
        type: 'insert',
        payload: { 前端变量: { 可选任务: { [factionName]: remainingPool } } },
      });
    }

    await emitSourcedEraVariableWriteAndWait({
      source: 'frontend',
      operation: 'update',
      reason: 'faction-task-option-accept',
      refreshHint: 'character-data',
      eventName: 'era:transactionByObject',
      attribution: 'background',
      detail: { transactionId, operations },
      expectedAction: 'apiWrite',
      expectedTransactionId: transactionId,
      timeoutMs: 10000,
      timeoutMessage: '接取差事事务已发出，但 ERA 未确认写入。',
    });

    const commandText = `🏷️ [差事指令] User已从${factionName}正式接下《${taskName}》。差事内容：${task.任务详情}；目标地点：${task.任务地点}。后续剧情将此视为已经接取的差事。`;
    gameLogger.log('[factionTaskGenerator] 已接取候选差事:', { factionName, taskName });
    return { success: true, task, commandText };
  } catch (error) {
    gameLogger.error('[factionTaskGenerator] 接取候选差事失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '接取差事失败' };
  }
}
