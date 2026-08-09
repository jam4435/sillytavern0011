import {
  DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE,
  type SummarySettings,
  type SummaryVariableUpdateMode,
} from './settingsManager';
import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import {
  getLocationScopePath,
  isSameLocationScope,
  normalizeLocationPath,
  parseLocationPath,
} from '../../shared/locationPath.js';
import { scheduleUnthrottledInterval, scheduleUnthrottledTimeout } from '../../shared/unthrottledTimer';
import { requestConfiguredText, resolveConfiguredTextSettings, validateSummaryApiConfig } from './summaryApiClient';
import { dataLogger, variableTraceLogger } from './logger';
import { recordIframeLifecycleEvent } from './iframeLifecycleBlackBox';
import { isFrontendLoaderOnlyMessage, normalizeDisplayedMessageContent } from './variableReader';
import { runWithAutoAdvanceFailureRetry } from './autoAdvanceRetry';
import { runWith429Retry } from './rateLimitRetry';
import {
  parseDeclaredVariableChanges,
  readCurrentStatDataSnapshot,
  stableStringify,
  type VariableDeclaredChange,
} from './variableChanges';

const VARIABLE_GUIDANCE_ENTRY_NAME = '变量指导';
const WORLD_BACKGROUND_ENTRY_NAME = '世界背景';
const NARRATIVE_SCALE_START_MARKER = '<叙事表现标尺>';
const NARRATIVE_SCALE_END_MARKER = '</叙事表现标尺>';
const EXTRA_VARIABLE_UPDATE_TIMEOUT_MS = 360000;
const ERA_SYNC_TIMEOUT_MS = 20000;
const ERA_PERSISTENCE_FOREGROUND_VERIFY_TIMEOUT_MS = 15000;
const ERA_PERSISTENCE_VERIFY_DELAYS_MS = [120, 250, 500, 1000, 2000] as const;

type ChatRole = 'system' | 'assistant' | 'user';

type ChatMessageWithSwipes = {
  message_id: number;
  role: ChatRole;
  is_hidden?: boolean;
  message?: string;
  swipes?: string[];
  swipe_id?: number;
  swipes_data?: Record<string, unknown>[];
  swipes_info?: Record<string, unknown>[];
};

type WorldbookEntryLocation = {
  worldbookName: string;
  entry: WorldbookEntry;
};

export type ExtraVariableUpdateReservation = {
  release: () => void;
};

export type ExtraVariableUpdateResult = {
  appended: boolean;
  actionBlockCount: number;
  prompt?: string;
  rawResponse: string;
  appendedBlocks?: string;
  finalMessageText?: string;
  appendReadbackText?: string;
  appendVerification?: string;
  syncReadbackText?: string;
  syncVerification?: string;
  retry429Count?: number;
  retry429LastDelayMs?: number;
  retryFailureCount?: number;
  retryFailureLastDelayMs?: number;
  applyStatus?: ExtraVariableApplyStatus;
  applyVerification?: string;
  applyError?: string;
};

export type ExtraVariablePhaseStatus = 'running' | 'success' | 'error';

export type ExtraVariablePhaseTiming = {
  name: string;
  status: ExtraVariablePhaseStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  durationMs: number;
  watchdogTickCount: number;
  error?: string;
};

export type ExtraVariableUpdateProgress = Partial<ExtraVariableUpdateResult> & {
  phaseTimeline?: ExtraVariablePhaseTiming[];
  currentPhase?: string;
};

export type ExtraVariableApplyStatus = 'idle' | 'waiting-write-done' | 'verifying' | 'success' | 'pending' | 'error';

type MessageWriteVerification = {
  messageId: number;
  swipeId: number;
  beforeText: string;
  attemptedText: string;
  readbackText: string;
  verified: boolean;
  verification: string;
};

let extraVariableUpdateBusy = false;
let extraVariableUpdateReserved = false;

const VARIABLE_BLOCK_REGEX = /<(VariableThink|VariableInsert|VariableEdit|VariableDelete)>\s*([\s\S]*?)\s*<\/\1>/gi;
const ERA_VARIABLE_BLOCK_STRIP_REGEX = /\s*<Variable(Think|Insert|Edit|Delete)>\s*[\s\S]*?<\/Variable\1>\s*/gi;
const VARIABLE_BLOCK_TAGS = ['VariableThink', 'VariableInsert', 'VariableEdit', 'VariableDelete'] as const;
const ACTION_BLOCK_TAGS = new Set(['VariableInsert', 'VariableEdit', 'VariableDelete']);
const EXTRA_VARIABLE_READONLY_ENTITY_KEYS = new Set(['头像', '出生年份', '年龄', '初始属性', '天赋']);
const PARTICIPATION_WRITABLE_KEYS = ['结局', 'insert', 'update', 'delete', '分支标记'] as const;
const NORMAL_TURN_DECISION_CHECKLIST = `【普通回合变量检查清单】
必须在 <VariableThink> 中按编号逐项给出简短结论；没有变化也要写“无”。
1. 时间：最新正文是否明确经过时间？若是，按实际行为推进；短暂反应、观察和简短交谈不得机械推进。
2. 地点：user 或 NPC 是否实际移动？只有发生移动才修改所在位置；换镜头、换说法或仍在同一场景不修改。
3. 修炼与战斗：user 是否进行了修炼、战斗或其他可能产生修为的实际行为？若正文明确产生磨炼、领悟或修为收获，按只读“每日修为变化参考”结合行为时长、强度和成果估算修为；短暂运功、展示武功或仅仅出现战斗不自动增加修为。战斗另行结算正文明确发生的消耗、伤势和长期后果。
4. user 持久变化：检查修为、气血、内力、状态、物品、功法、身份、经历和关系；只记录已经发生且值得长期保存的变化。
5. NPC 持久变化：检查相关角色的地点、状态、物品、功法、身份、经历和关系；不得把短暂情绪或一次观察写成长期关系。
6. 最终路径：先选完整绝对路径，再判断最终叶子是否存在；存在用 Edit，不存在用 Insert，删除已有叶子用 Delete。逐条列出最终动作或“无”。`;
const PARTICIPATION_TURN_DECISION_CHECKLIST = `【参与事件回合变量检查清单】
必须在 <VariableThink> 中按编号逐项给出简短结论；没有变化也要写“无”。
1. 事件与阶段：逐个检查当前参与事件，判断最新正文是否涉及该事件，以及当前处于“未涉及/开端/发展/后段/收束/已完成”中的哪个阶段。事件存在不代表本轮必然推进；不得拆分或自造固定节点。
2. 时间：只有正文把相关事件推进到更后阶段或明确经过时间时才前推。阶段与时间必须单调前进；开端处于时间窗前段，发展/后段处于开始与结束之间，只有完整收束才可到事件结束时间。
3. 地点：user 与相关 NPC 是否实际移动、是否仍在事件活动区？仅在正文明确移动时修改；离开事件地时判断是否对事件结果造成实质偏离。
4. 修炼与战斗：user 是否进行了修炼、战斗或其他可能产生修为的实际行为？若正文明确产生磨炼、领悟或修为收获，按只读“每日修为变化参考”结合行为时长、强度和成果估算修为；短暂运功、展示武功或仅仅出现战斗不自动增加修为。战斗另行结算明确消耗、伤势和长期后果，user 的变化直接写 user数据。
5. NPC 变化路由：先检查相关参与事件的 insert/update/delete 是否已有相同人物与业务字段。已有且原定结果未变则不操作；已有但最终结果改变则只修改参与事件快照；快照未覆盖的新长期变化才写角色数据。禁止把事件快照已有结果提前重复写入角色数据。
6. 结局与差分：只有人物生死、长期状态、关系、阵营、关键物品、事件目标或后续成立条件实质改变时，才修改结局及对应差分；普通对话、阶段推进和过程细节不修改结局。
7. 其他持久变化：检查事件快照未覆盖的身份、功法、物品、经历、关系、气血、内力和状态；短暂情绪、观察和原定过程不写入。
8. 最终路径：先确定变量归属和完整绝对路径，再判断最终叶子是否存在；存在用 Edit，不存在用 Insert，删除已有叶子用 Delete。逐条列出最终动作或“无”。`;
const VARIABLE_ROOT_KEY_ALIASES: Record<string, string> = {
  玩家数据: 'user数据',
  同场景角色: '角色数据',
};

export function getIsExtraVariableUpdating(): boolean {
  return extraVariableUpdateBusy || extraVariableUpdateReserved;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function delayWhilePageVisible(milliseconds: number): Promise<boolean> {
  if (isPageHidden()) return Promise.resolve(false);

  return new Promise(resolve => {
    let settled = false;
    let timer: ReturnType<typeof scheduleUnthrottledTimeout> | null = null;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      try {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      } catch {
        // 测试环境或 iframe 销毁时无需继续清理。
      }
      timer?.cancel();
      resolve(completed);
    };
    const onVisibilityChange = () => {
      if (isPageHidden()) finish(false);
    };

    try {
      document.addEventListener('visibilitychange', onVisibilityChange);
      timer = scheduleUnthrottledTimeout(() => finish(true), milliseconds);
    } catch {
      finish(false);
    }
  });
}

function delayUnthrottled(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    scheduleUnthrottledTimeout(resolve, milliseconds);
  });
}

function readPathValue(source: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[String(segment)];
  }
  return current;
}

function hasPath(source: unknown, path: readonly (string | number)[]): boolean {
  let current: unknown = source;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      if (segment < 0 || segment >= current.length) return false;
      current = current[segment];
      continue;
    }
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, String(segment))) {
      return false;
    }
    current = current[String(segment)];
  }
  return true;
}

function assertDeclaredActionPathsValid(declaredChanges: VariableDeclaredChange[]): void {
  if (declaredChanges.length === 0) return;

  const statData = readCurrentStatDataSnapshot();
  if (!statData) {
    throw new Error('聊天级 stat_data 暂不可读，无法校验额外变量模型声明的 Insert/Edit/Delete 路径。');
  }

  const insertChanges = declaredChanges.filter(change => change.action === 'insert');
  const existingInsertPaths = insertChanges
    .filter(change => hasPath(statData, change.path))
    .map(change => change.displayPath);
  if (existingInsertPaths.length > 0) {
    throw new Error(
      `额外变量模型声明了已存在的 Insert 路径：${existingInsertPaths.join('、')}。已存在的字段必须使用 VariableEdit。`,
    );
  }

  const editChanges = declaredChanges.filter(change => change.action === 'edit');
  const missingPaths = editChanges.filter(change => !hasPath(statData, change.path)).map(change => change.displayPath);
  if (missingPaths.length > 0) {
    throw new Error(
      `额外变量模型声明了不存在的 Edit 路径：${missingPaths.join('、')}。不存在的字段必须使用 VariableInsert。`,
    );
  }

  const deleteChanges = declaredChanges.filter(change => change.action === 'delete');
  const missingDeletePaths = deleteChanges
    .filter(change => !hasPath(statData, change.path))
    .map(change => change.displayPath);
  if (missingDeletePaths.length > 0) {
    throw new Error(
      `额外变量模型声明了不存在的 Delete 路径：${missingDeletePaths.join('、')}。VariableDelete 只能删除已存在的字段。`,
    );
  }

  const frontendVariables = isRecord(statData.前端变量) ? statData.前端变量 : {};
  const surroundingLocations = isRecord(frontendVariables.周围地点) ? frontendVariables.周围地点 : {};
  const allowedLocationScopes = new Set<string>();
  const addAllowedScope = (value: unknown) => {
    const scopePath = getLocationScopePath(value);
    if (scopePath) allowedLocationScopes.add(scopePath);
  };
  addAllowedScope(surroundingLocations.当前活动区);
  for (const key of ['普通移动', '事件目标', '地图指定']) {
    const paths = surroundingLocations[key];
    if (Array.isArray(paths)) paths.forEach(addAllowedScope);
  }

  for (const change of declaredChanges) {
    if (change.action === 'delete' || change.path.at(-1) !== '所在位置') continue;
    const parsed = parseLocationPath(change.value);
    if (!parsed) {
      throw new Error(
        `额外变量模型写入了无效地点 ${change.displayPath}=${JSON.stringify(change.value)}；地点必须是三级或四级完整路径。`,
      );
    }

    const currentValue = readPathValue(statData, change.path);
    if (isSameLocationScope(currentValue, parsed.fullPath)) continue;
    if (!allowedLocationScopes.has(parsed.scopePath)) {
      throw new Error(
        `额外变量模型把 ${change.displayPath} 移动到未授权活动区 ${parsed.scopePath}；跨活动区移动只能使用“周围地点”中的合法前三段。`,
      );
    }
  }
}

function collapseDeclaredChangesForPersistence(declaredChanges: VariableDeclaredChange[]): VariableDeclaredChange[] {
  const byPath = new Map<string, VariableDeclaredChange>();
  const pathKey = (path: readonly (string | number)[]) => JSON.stringify(path);
  const actionPriority: Record<VariableDeclaredChange['action'], number> = {
    insert: 1,
    edit: 2,
    delete: 3,
  };

  for (const change of declaredChanges) {
    const key = pathKey(change.path);
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, change);
      continue;
    }

    const existingPriority = actionPriority[existing.action];
    const nextPriority = actionPriority[change.action];
    if (nextPriority > existingPriority || (nextPriority === existingPriority && change.action !== 'insert')) {
      byPath.set(key, change);
    }
  }

  const collapsed = [...byPath.values()];
  const deletePaths = collapsed.filter(change => change.action === 'delete').map(change => change.path);
  return collapsed.filter(change => {
    if (change.action === 'delete') return true;
    return !deletePaths.some(
      deletePath =>
        deletePath.length <= change.path.length && deletePath.every((segment, index) => segment === change.path[index]),
    );
  });
}

export type PersistenceVerification = {
  verified: boolean;
  verification: string;
  pendingPaths: string[];
};

function isPageHidden(): boolean {
  try {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  } catch {
    return false;
  }
}

function verifyDeclaredChangesPersisted(declaredChanges: VariableDeclaredChange[]): PersistenceVerification {
  const expectedChanges = collapseDeclaredChangesForPersistence(declaredChanges);
  if (expectedChanges.length === 0) {
    return {
      verified: true,
      verification: '本轮没有可比较的变量叶子声明，无需等待聊天变量快照。',
      pendingPaths: [],
    };
  }

  const statData = readCurrentStatDataSnapshot();
  if (!statData) {
    return {
      verified: false,
      verification: '聊天级 stat_data 暂不可读，正在等待持久化快照。',
      pendingPaths: expectedChanges.map(change => change.displayPath),
    };
  }

  const pendingPaths = expectedChanges
    .filter(change => {
      return change.action === 'delete'
        ? hasPath(statData, change.path)
        : stableStringify(readPathValue(statData, change.path)) !== stableStringify(change.value);
    })
    .map(change => change.displayPath);

  return pendingPaths.length === 0
    ? {
        verified: true,
        verification: `聊天级 stat_data 已确认 ${expectedChanges.length} 条最终变量声明。`,
        pendingPaths: [],
      }
    : {
        verified: false,
        verification: `ERA 已返回写入完成信号，但聊天变量快照尚未刷新：${pendingPaths.join('、')}`,
        pendingPaths,
      };
}

async function verifyDeclaredChangesAfterEraWrite(
  declaredChanges: VariableDeclaredChange[],
): Promise<PersistenceVerification> {
  const immediateVerification = verifyDeclaredChangesPersisted(declaredChanges);
  if (immediateVerification.verified) return immediateVerification;

  // ERA writeDone 后只让出一次微任务，容纳同一任务尾部的聊天变量快照同步；
  // 第二次仍不一致即视为真实写入失败或归一化，不再做计时轮询。
  await Promise.resolve();
  return verifyDeclaredChangesPersisted(declaredChanges);
}

async function waitForDeclaredChangesPersisted(
  declaredChanges: VariableDeclaredChange[],
  timeoutMs: number,
  options: { stopWhenHidden?: boolean } = {},
): Promise<PersistenceVerification> {
  const stopWhenHidden = options.stopWhenHidden !== false;
  const startedAt = Date.now();
  let attempt = 0;
  let latest = verifyDeclaredChangesPersisted(declaredChanges);
  while (!latest.verified && Date.now() - startedAt < timeoutMs) {
    // 顶层窗口的 setTimeout 在整个酒馆标签页隐藏时同样会被 Chromium 节流。
    // 此时继续“前台等待 15 秒”可能实际占用数分钟；立即结束验证并把不一致作为本轮错误返回。
    if (stopWhenHidden && isPageHidden()) break;
    const remaining = timeoutMs - (Date.now() - startedAt);
    const delayMs = Math.min(
      ERA_PERSISTENCE_VERIFY_DELAYS_MS[Math.min(attempt, ERA_PERSISTENCE_VERIFY_DELAYS_MS.length - 1)],
      Math.max(0, remaining),
    );
    if (delayMs <= 0) break;
    if (stopWhenHidden) {
      const completedDelay = await delayWhilePageVisible(delayMs);
      if (!completedDelay) break;
    } else {
      await delayUnthrottled(delayMs);
    }
    attempt += 1;
    latest = verifyDeclaredChangesPersisted(declaredChanges);
  }
  return latest;
}

export function assertValidTurnVariableBlocks(blocksText: string): boolean {
  const hasActionOpeningTag = /<Variable(?:Insert|Edit|Delete)>/.test(blocksText);
  if (!hasActionOpeningTag) {
    return false;
  }

  for (const blockTag of VARIABLE_BLOCK_TAGS.slice(1)) {
    const openingCount = blocksText.match(new RegExp(`<${blockTag}>`, 'gi'))?.length ?? 0;
    const closingCount = blocksText.match(new RegExp(`</${blockTag}>`, 'gi'))?.length ?? 0;
    if (openingCount !== closingCount) {
      throw new Error(`本回合包含未闭合的 ${blockTag} 标签，无法确认 ERA 提交。`);
    }
  }

  const completeActionBlocks =
    blocksText.match(/<(VariableInsert|VariableEdit|VariableDelete)>\s*[\s\S]*?<\/\1>/g) ?? [];
  if (completeActionBlocks.length === 0) {
    throw new Error('本回合包含未闭合的变量动作标签，无法确认 ERA 提交。');
  }

  const declaredState = parseDeclaredVariableChanges(blocksText);
  if (declaredState.parseErrors.length > 0) {
    throw new Error(`本回合变量动作块无法完整解析：${declaredState.parseErrors.join('；')}`);
  }
  if (declaredState.declaredChanges.length === 0) {
    throw new Error('本回合变量动作块没有可验证的变量声明，无法确认 ERA 提交。');
  }

  return true;
}

export async function ensureTurnVariableBlocksCommitted({
  assistantMessageId,
  blocksText,
  timeoutMs = ERA_PERSISTENCE_FOREGROUND_VERIFY_TIMEOUT_MS,
}: {
  assistantMessageId: number;
  blocksText: string;
  timeoutMs?: number;
}): Promise<PersistenceVerification> {
  if (!assertValidTurnVariableBlocks(blocksText)) {
    return {
      verified: true,
      verification: '本回合没有变量动作块，无需等待 ERA 提交。',
      pendingPaths: [],
    };
  }
  const declaredState = parseDeclaredVariableChanges(blocksText);

  const verification = await waitForDeclaredChangesPersisted(declaredState.declaredChanges, timeoutMs, {
    stopWhenHidden: false,
  });
  if (!verification.verified) {
    throw new Error(
      `assistant 楼层 ${assistantMessageId} 的变量尚未全部落库，已停止事件结算：${
        verification.pendingPaths.join('、') || verification.verification
      }`,
    );
  }

  return verification;
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^\s*(?:```|~~~)[a-zA-Z0-9_-]*\s*\r?\n/, '')
    .replace(/\r?\n(?:```|~~~)\s*$/, '')
    .trim();
}

function stripEraVariableBlocksForPrompt(text: string): string {
  if (!text) {
    return '';
  }
  ERA_VARIABLE_BLOCK_STRIP_REGEX.lastIndex = 0;
  return text
    .replace(ERA_VARIABLE_BLOCK_STRIP_REGEX, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseConfiguredPromptItems(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  );
}

function stripAssistantPrefixThroughLastMarker(text: string, configuredMarkers: string): string {
  let lastBoundaryEnd = -1;
  for (const marker of parseConfiguredPromptItems(configuredMarkers)) {
    const markerIndex = text.lastIndexOf(marker);
    if (markerIndex >= 0) {
      lastBoundaryEnd = Math.max(lastBoundaryEnd, markerIndex + marker.length);
    }
  }
  return lastBoundaryEnd >= 0 ? text.slice(lastBoundaryEnd) : text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeConfiguredTagName(value: string): string {
  const trimmed = value.trim();
  const wrappedTagMatch = trimmed.match(/^<\/?\s*([A-Za-z_][\w:.-]*)\s*\/?\s*>$/);
  const candidate = wrappedTagMatch?.[1] || trimmed;
  return /^[A-Za-z_][\w:.-]*$/.test(candidate) ? candidate : '';
}

function stripConfiguredAssistantBlocks(text: string, configuredTags: string): string {
  return parseConfiguredPromptItems(configuredTags).reduce((result, configuredTag) => {
    const tagName = normalizeConfiguredTagName(configuredTag);
    if (!tagName) {
      return result;
    }
    const escapedTagName = escapeRegExp(tagName);
    return result
      .replace(new RegExp(`<${escapedTagName}(?:\\s[^<>]*?)?>[\\s\\S]*?<\\/${escapedTagName}\\s*>`, 'gi'), '\n')
      .replace(new RegExp(`<${escapedTagName}(?:\\s[^<>]*?)?\\s*\\/>`, 'gi'), '\n');
  }, text);
}

function applyTavernPromptRegex(text: string, role: 'user' | 'assistant', depth: number): string {
  try {
    return formatAsTavernRegexedString(text, role === 'assistant' ? 'ai_output' : 'user_input', 'prompt', {
      depth,
    });
  } catch (error) {
    dataLogger.warn('应用酒馆提示词正则失败，额外变量正文将继续使用未格式化文本:', error);
    return text;
  }
}

function normalizeBodyMessageForPrompt(
  rawText: string,
  role: 'user' | 'assistant',
  depth: number,
  settings: SummarySettings,
): string {
  const withoutAssistantPrefix =
    role === 'assistant'
      ? stripAssistantPrefixThroughLastMarker(rawText, settings.variablePromptBodyStartMarkers)
      : rawText;
  const tavernRegexed = applyTavernPromptRegex(withoutAssistantPrefix, role, depth);
  const withoutConfiguredBlocks =
    role === 'assistant'
      ? stripConfiguredAssistantBlocks(tavernRegexed, settings.variablePromptExcludedTags)
      : tavernRegexed;

  return stripEraVariableBlocksForPrompt(
    normalizeDisplayedMessageContent(stripEraVariableBlocksForPrompt(withoutConfiguredBlocks)),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mergePatchValue(previous: unknown, next: unknown): unknown {
  if (!isRecord(previous) || !isRecord(next)) {
    return next;
  }

  return Object.entries(next).reduce<Record<string, unknown>>(
    (result, [key, value]) => {
      result[key] = Object.prototype.hasOwnProperty.call(result, key) ? mergePatchValue(result[key], value) : value;
      return result;
    },
    { ...previous },
  );
}

function canonicalizeVariablePatchRootKeys(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(patch).reduce<Record<string, unknown>>((result, [key, value]) => {
    const canonicalKey = VARIABLE_ROOT_KEY_ALIASES[key] || key;
    result[canonicalKey] = Object.prototype.hasOwnProperty.call(result, canonicalKey)
      ? mergePatchValue(result[canonicalKey], value)
      : value;
    return result;
  }, {});
}

function getCurrentCharacterWorldbookNames(): string[] {
  const charWorldbooks = getCharWorldbookNames('current');
  return Array.from(
    new Set(
      [charWorldbooks.primary, ...(Array.isArray(charWorldbooks.additional) ? charWorldbooks.additional : [])].filter(
        (name): name is string => typeof name === 'string' && name.trim().length > 0,
      ),
    ),
  );
}

async function findWorldbookEntryByExactName(entryName: string): Promise<WorldbookEntryLocation | null> {
  const worldbookNames = getCurrentCharacterWorldbookNames();
  for (const worldbookName of worldbookNames) {
    try {
      const worldbook = await getWorldbook(worldbookName);
      const entry = worldbook.find(item => item.name === entryName);
      if (entry) {
        return { worldbookName, entry };
      }
    } catch (error) {
      dataLogger.warn(`读取世界书「${worldbookName}」失败:`, error);
    }
  }
  return null;
}

async function setWorldbookEntryEnabled(
  worldbookName: string,
  uid: number,
  entryName: string,
  enabled: boolean,
): Promise<'uid' | 'name' | null> {
  let matchedBy: 'uid' | 'name' | null = null;
  await updateWorldbookWith(
    worldbookName,
    worldbook => {
      const uidMatch = worldbook.find(entry => entry.uid === uid && entry.name === entryName);
      const nameMatches = uidMatch ? [] : worldbook.filter(entry => entry.name === entryName);
      if (!uidMatch && nameMatches.length > 1) {
        throw new Error(`世界书「${worldbookName}」中存在多个同名条目「${entryName}」，无法安全修改。`);
      }

      const target = uidMatch || nameMatches[0];
      if (!target) {
        return worldbook;
      }
      matchedBy = uidMatch ? 'uid' : 'name';
      return worldbook.map(entry => {
        if (entry.uid !== target.uid) {
          return entry;
        }
        return { ...entry, enabled };
      });
    },
    { render: 'debounced' },
  );
  return matchedBy;
}

async function ensureVariableGuidanceEnabled(enabled: boolean): Promise<boolean> {
  const location = await findWorldbookEntryByExactName(VARIABLE_GUIDANCE_ENTRY_NAME);
  if (!location) {
    throw new Error(`未找到当前角色世界书中的精确条目「${VARIABLE_GUIDANCE_ENTRY_NAME}」。`);
  }

  if (location.entry.enabled === enabled) {
    return false;
  }

  const matchedBy = await setWorldbookEntryEnabled(
    location.worldbookName,
    location.entry.uid,
    location.entry.name,
    enabled,
  );
  if (!matchedBy) {
    throw new Error(`无法在世界书「${location.worldbookName}」中找到「${location.entry.name}」条目。`);
  }

  return true;
}

export async function applyVariableUpdateModeWorldbookState(mode: SummaryVariableUpdateMode): Promise<string> {
  const enabled = mode === 'inline';
  const changed = await ensureVariableGuidanceEnabled(enabled);
  const stateLabel = enabled ? '启用' : '禁用';
  return changed
    ? `已${stateLabel}当前角色世界书中的「${VARIABLE_GUIDANCE_ENTRY_NAME}」。`
    : `当前角色世界书中的「${VARIABLE_GUIDANCE_ENTRY_NAME}」已经是${stateLabel}状态。`;
}

function reserveExtraVariableUpdate(): ExtraVariableUpdateReservation {
  if (getIsExtraVariableUpdating()) {
    throw new Error('已有额外变量更新正在执行，请等待当前回合完成。');
  }

  extraVariableUpdateReserved = true;
  let released = false;

  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      extraVariableUpdateReserved = false;
    },
  };
}

export async function prepareExtraVariableUpdateTurn(
  settings: SummarySettings,
): Promise<ExtraVariableUpdateReservation | null> {
  if (settings.variableUpdateMode !== 'extra') {
    return null;
  }

  const reservation = reserveExtraVariableUpdate();
  try {
    const requestSettings = resolveConfiguredTextSettings(settings, 'variable');
    if (requestSettings.apiMode === 'custom') {
      const validationMessage = validateSummaryApiConfig(requestSettings.apiConfig, { requireModel: true });
      if (validationMessage) {
        throw new Error(validationMessage);
      }
    }
    await ensureVariableGuidanceEnabled(false);
    return reservation;
  } catch (error) {
    reservation.release();
    throw error;
  }
}

function beginExtraVariableUpdate(): void {
  if (extraVariableUpdateBusy) {
    throw new Error('已有额外变量更新正在执行，请等待当前回合完成。');
  }
  extraVariableUpdateReserved = false;
  extraVariableUpdateBusy = true;
}

function finishExtraVariableUpdate(): void {
  extraVariableUpdateBusy = false;
  extraVariableUpdateReserved = false;
}

async function readWorldbookEntryContent(entryName: string): Promise<string> {
  const location = await findWorldbookEntryByExactName(entryName);
  if (!location) {
    throw new Error(`未找到当前角色世界书中的精确条目「${entryName}」。`);
  }
  return location.entry.content || '';
}

function extractNarrativeScale(worldBackground: string): string {
  const startIndex = worldBackground.indexOf(NARRATIVE_SCALE_START_MARKER);
  const endIndex = worldBackground.indexOf(NARRATIVE_SCALE_END_MARKER);
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error(`世界书条目「${WORLD_BACKGROUND_ENTRY_NAME}」缺少完整的 ${NARRATIVE_SCALE_START_MARKER} 标记段。`);
  }
  return worldBackground.slice(startIndex + NARRATIVE_SCALE_START_MARKER.length, endIndex).trim();
}

function sanitizeForPrompt(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      return '[循环引用]';
    }
    ancestors.add(value);
    const result = value.map(item => sanitizeForPrompt(item, ancestors));
    ancestors.delete(value);
    return result;
  }

  if (!isRecord(value)) {
    return value;
  }

  if (ancestors.has(value)) {
    return '[循环引用]';
  }
  ancestors.add(value);
  const result = Object.entries(value).reduce<Record<string, unknown>>((sanitized, [key, childValue]) => {
    if (!key.startsWith('$')) {
      sanitized[key] = sanitizeForPrompt(childValue, ancestors);
    }
    return sanitized;
  }, {});
  ancestors.delete(value);
  return result;
}

function getNestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function omitReadonlyEntityFields(source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !EXTRA_VARIABLE_READONLY_ENTITY_KEYS.has(key)));
}

function getFirstStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function collectRelevantCharacters(
  statData: Record<string, unknown>,
  playerLocation: string,
  latestAssistantBody: string,
  participationEvents: unknown,
): Record<string, unknown> {
  const characters = getNestedRecord(statData, '角色数据');
  if (!characters) {
    return {};
  }

  let participationText = '';
  try {
    participationText = JSON.stringify(participationEvents ?? {});
  } catch (error) {
    dataLogger.warn('序列化参与事件以筛选相关 NPC 失败:', error);
  }

  return Object.entries(characters).reduce<Record<string, unknown>>((result, [name, character]) => {
    if (name.startsWith('$') || !isRecord(character)) {
      return result;
    }

    const characterLocation = getFirstStringValue(
      character.当前位置,
      character.所在位置,
      character.位置,
      character.地点,
    );
    const isSameScene = isSameLocationScope(playerLocation, characterLocation);
    const isCurrentEventNpc = !!participationText && participationText.includes(name);
    const isMentionedInLatestBody = !!latestAssistantBody && latestAssistantBody.includes(name);
    if (isSameScene || isCurrentEventNpc || isMentionedInLatestBody) {
      result[name] = sanitizeForPrompt(omitReadonlyEntityFields(character));
    }
    return result;
  }, {});
}

function readAllVariablesSnapshot(assistantMessageId: number): Record<string, unknown> {
  try {
    if (typeof EjsTemplate !== 'undefined' && typeof EjsTemplate.allVariables === 'function') {
      return EjsTemplate.allVariables(assistantMessageId) as Record<string, unknown>;
    }
  } catch (error) {
    dataLogger.warn('读取 EjsTemplate 合并变量失败:', error);
  }

  try {
    return getVariables({ type: 'chat' }) as Record<string, unknown>;
  } catch (error) {
    dataLogger.warn('读取聊天变量失败:', error);
    return {};
  }
}

export function buildExtraVariableProjection(
  variables: Record<string, unknown>,
  latestAssistantBody: string,
): Record<string, unknown> {
  const statDataSource = isRecord(variables.stat_data) ? variables.stat_data : variables;
  const statData = statDataSource as Record<string, unknown>;
  const userData: Record<string, unknown> =
    getNestedRecord(statData, 'user数据') || getNestedRecord(statData, '玩家数据') || {};
  const worldInfo = getNestedRecord(statData, '世界信息') || {};
  const participationEvents = statData.参与事件 ?? {};
  const playerLocation = getFirstStringValue(
    userData.当前位置,
    userData.所在位置,
    userData.位置,
    userData.地点,
    statData.当前位置,
    statData.地点,
  );

  const writableParticipationEvents = isRecord(participationEvents)
    ? Object.entries(participationEvents).reduce<Record<string, unknown>>((result, [eventName, eventValue]) => {
        if (!isRecord(eventValue)) {
          return result;
        }
        result[eventName] = Object.fromEntries(
          PARTICIPATION_WRITABLE_KEYS.filter(key => Object.hasOwn(eventValue, key)).map(key => [key, eventValue[key]]),
        );
        return result;
      }, {})
    : {};

  return sanitizeForPrompt({
    世界信息: Object.hasOwn(worldInfo, '时间') ? { 时间: worldInfo.时间 } : {},
    user数据: omitReadonlyEntityFields(userData),
    角色数据: collectRelevantCharacters(statData, playerLocation, latestAssistantBody, participationEvents),
    参与事件: writableParticipationEvents,
  }) as Record<string, unknown>;
}

function formatDecisionChecklist(hasParticipationEvents: boolean, cultivationReference: unknown): string {
  const readonlyCultivationReference =
    typeof cultivationReference === 'number' && Number.isFinite(cultivationReference)
      ? String(cultivationReference)
      : '不可用';
  return [
    '<readonly_derived_context>',
    `每日修为变化参考:${readonlyCultivationReference}`,
    '该值以每日专心修炼为基准，仅供结合行为时长、强度和成果估算 user数据.修为变化；本身始终只读且不得作为写入目标，不可用时不得自行编造参考值。',
    '</readonly_derived_context>',
    '',
    '<variable_decision_checklist>',
    hasParticipationEvents ? PARTICIPATION_TURN_DECISION_CHECKLIST : NORMAL_TURN_DECISION_CHECKLIST,
    '</variable_decision_checklist>',
  ].join('\n');
}

function formatVariableContext(
  projection: Record<string, unknown>,
  participationEvents: unknown,
  cultivationReference: unknown,
): string {
  const lines = [
    '<variable>',
    '<status_current_variables>',
    '# 当前状态：以下 JSON 使用真实变量键名',
    '# 当前世界信息',
    `世界信息:${JSON.stringify(projection.世界信息 ?? {})}`,
    '',
    '# user数据',
    `user数据:${JSON.stringify(projection.user数据 ?? {})}`,
  ];
  const writableParticipationEvents = isRecord(projection.参与事件) ? projection.参与事件 : {};

  if (isRecord(participationEvents) && Object.keys(writableParticipationEvents).length > 0) {
    lines.push('', '# 当前事件上下文：方括号是只读背景，JSON中的已有字段按规则有条件可写', '<参与事件>');
    for (const [eventName, writableSnapshot] of Object.entries(writableParticipationEvents)) {
      const eventValue = isRecord(participationEvents[eventName]) ? participationEvents[eventName] : {};
      const readonlyDescription = String(eventValue.描述 ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      lines.push(
        `<${eventName}>`,
        `[只读时间、地点与事件背景：${readonlyDescription || '无'}]`,
        JSON.stringify(writableSnapshot),
        `</${eventName}>`,
      );
    }
    lines.push('</参与事件>');
  }

  lines.push(
    '',
    '# 相关角色（同一严格活动区、参与事件或最新正文提及；完整所在位置用于判断具体同场）',
    `角色数据:${JSON.stringify(projection.角色数据 ?? {})}`,
    '</status_current_variables>',
    '',
    formatDecisionChecklist(Object.keys(writableParticipationEvents).length > 0, cultivationReference),
    '</variable>',
  );
  return lines.join('\n');
}

function uniqueFullLocationPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(normalizeLocationPath).filter(Boolean)));
}

function formatLocationContext(surroundingLocations: unknown, currentLocation: unknown): string {
  const locationGroups = isRecord(surroundingLocations) ? surroundingLocations : {};
  const groups = {
    普通移动: uniqueFullLocationPaths(locationGroups.普通移动),
    事件目标: uniqueFullLocationPaths(locationGroups.事件目标),
    地图指定: uniqueFullLocationPaths(locationGroups.地图指定),
  };
  const normalizedCurrentLocation = normalizeLocationPath(currentLocation);
  const currentScopePath = getLocationScopePath(locationGroups.当前活动区) || getLocationScopePath(currentLocation);
  const allowedScopes = new Set<string>();
  if (currentScopePath) allowedScopes.add(currentScopePath);
  Object.values(groups)
    .flat()
    .forEach(path => {
      const scopePath = getLocationScopePath(path);
      if (scopePath) allowedScopes.add(scopePath);
    });
  const lines = [
    '<可用地点>',
    '[路径语义]',
    '格式为“一级/二级/三级[/四级]”：一级是世界大域或政权，二级是地图旅行区域，三级是严格活动区，第四级是可选的具体镜头场景。',
    `当前完整位置：${normalizedCurrentLocation || '（无效）'}`,
    `当前严格活动区：${currentScopePath || '（无效）'}`,
    '[合法严格活动区]',
    ...[...allowedScopes].map(path => `- ${path}`),
  ];
  for (const [groupName, paths] of Object.entries(groups)) {
    lines.push(`[${groupName}]${paths.length === 0 ? '（无）' : ''}`, ...paths.map(path => `- ${path}`));
  }
  lines.push(
    '[写入规则]',
    allowedScopes.size === 0
      ? '当前没有可用的合法严格活动区，本轮禁止修改任何“所在位置”。'
      : '任何“所在位置”的前三段必须逐字等于上方合法严格活动区；可以保留三级，也可以追加一个不含“/”的第四级具体场景。',
    '第四级不参加白名单匹配；只有正文确实发生局部移动时才修改，未移动时不得改写同义词，同一场景优先复用已有名称。',
    '事件目标的第四级是推荐初始场景而非强制字面值；同一前三段只表示处于同一事件活动区，不表示人物已经面对面同场。',
    '</可用地点>',
  );
  return lines.join('\n');
}

function buildVariableProjectionSnapshot(
  assistantMessageId: number,
  latestAssistantBody: string,
): { projection: Record<string, unknown>; variableContext: string; locationContext: string } {
  const variables = readAllVariablesSnapshot(assistantMessageId);
  const statDataSource = isRecord(variables.stat_data) ? variables.stat_data : variables;
  const statData = statDataSource as Record<string, unknown>;
  const projection = buildExtraVariableProjection(variables, latestAssistantBody);
  const frontendVariables = getNestedRecord(statData, '前端变量') || {};
  const variableContext = formatVariableContext(projection, statData.参与事件, frontendVariables.修为变化参考);
  const projectedUserData = isRecord(projection.user数据) ? projection.user数据 : {};
  const locationContext = formatLocationContext(frontendVariables.周围地点, projectedUserData.所在位置);

  return {
    projection,
    variableContext,
    locationContext,
  };
}

function getSafeSwipeIndex(message: ChatMessageWithSwipes, swipes: string[]): number {
  if (swipes.length === 0) {
    return 0;
  }
  const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return Math.max(0, Math.min(swipeIndex, swipes.length - 1));
}

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length > 0) {
    const safeSwipeIndex = getSafeSwipeIndex(message, swipes);
    return swipes[safeSwipeIndex] || swipes.find(text => text.trim().length > 0) || message.message || '';
  }
  return message.message || '';
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function getDeclaredChangeSignature(change: VariableDeclaredChange): string {
  return stableStringify({
    action: change.action,
    blockTag: change.blockTag,
    path: change.path,
    value: change.value,
  });
}

function containsSemanticallyEquivalentBlocks(readbackText: string, blocksText: string): boolean {
  const expectedChanges = parseDeclaredVariableChanges(blocksText).declaredChanges;
  if (expectedChanges.length === 0) {
    return false;
  }

  const availableCounts = new Map<string, number>();
  for (const change of parseDeclaredVariableChanges(readbackText).declaredChanges) {
    const signature = getDeclaredChangeSignature(change);
    availableCounts.set(signature, (availableCounts.get(signature) || 0) + 1);
  }

  for (const change of expectedChanges) {
    const signature = getDeclaredChangeSignature(change);
    const available = availableCounts.get(signature) || 0;
    if (available <= 0) {
      return false;
    }
    availableCounts.set(signature, available - 1);
  }
  return true;
}

function containsAppendedBlocks(readbackText: string, blocksText: string): boolean {
  if (normalizeNewlines(readbackText).includes(normalizeNewlines(blocksText))) {
    return true;
  }

  // ERA 或消息渲染链可能重排 JSON 缩进/换行。只要同一组操作、路径和值仍在当前
  // 楼层中，就不能把一次已经成功的写入误判为“变量块消失”。
  return containsSemanticallyEquivalentBlocks(readbackText, blocksText);
}

function normalizeArray<T>(value: T[] | undefined, expectedLength: number, fallback: () => T): T[] {
  const result = Array.isArray(value) ? [...value] : [];
  while (result.length < expectedLength) {
    result.push(fallback());
  }
  return result;
}

function readAssistantMessageActiveText(messageId: number): {
  message: ChatMessageWithSwipes;
  activeText: string;
  swipeId: number;
} {
  const [freshMessage] = getChatMessages(messageId, {
    hide_state: 'all',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];

  if (!freshMessage || freshMessage.role !== 'assistant') {
    throw new Error(`找不到要追加变量块的 assistant 楼层 #${messageId}。`);
  }

  const swipes = Array.isArray(freshMessage.swipes) ? freshMessage.swipes : [];
  return {
    message: freshMessage,
    activeText: getActiveMessageText(freshMessage),
    swipeId: getSafeSwipeIndex(freshMessage, swipes),
  };
}

function createWriteVerification({
  messageId,
  swipeId,
  beforeText,
  attemptedText,
  readbackText,
  blocksText,
  stage,
}: {
  messageId: number;
  swipeId: number;
  beforeText: string;
  attemptedText: string;
  readbackText: string;
  blocksText: string;
  stage: string;
}): MessageWriteVerification {
  const verified = containsAppendedBlocks(readbackText, blocksText);
  return {
    messageId,
    swipeId,
    beforeText,
    attemptedText,
    readbackText,
    verified,
    verification: verified
      ? `${stage}回读通过：assistant #${messageId} / swipe #${swipeId} 中存在刚追加的变量块。`
      : `${stage}回读失败：assistant #${messageId} / swipe #${swipeId} 中没有刚追加的变量块。`,
  };
}

type PromptBodyMessage = {
  messageId: number;
  role: 'user' | 'assistant';
  text: string;
};

function getRecentBodyMessages(
  targetMessageId: number,
  latestRawReply: string,
  contextRounds: 1 | 2,
  settings: SummarySettings,
): {
  serialized: string;
  serializedReadonlyContextRounds: string;
  serializedLatestAssistantBody: string;
  latestAssistantBody: string;
} {
  const messages = getChatMessages('0-{{lastMessageId}}', {
    hide_state: 'unhidden',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];

  const promptMessages = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .sort((left, right) => left.message_id - right.message_id);
  const lastPromptMessageIndex = promptMessages.length - 1;
  const bodies = promptMessages
    .map((message, messageIndex) => {
      const rawText =
        message.message_id === targetMessageId && latestRawReply.trim()
          ? latestRawReply
          : getActiveMessageText(message);
      if (!rawText.trim() || isFrontendLoaderOnlyMessage(rawText)) {
        return null;
      }
      const normalized = normalizeBodyMessageForPrompt(
        rawText,
        message.role as 'user' | 'assistant',
        Math.max(0, lastPromptMessageIndex - messageIndex),
        settings,
      );
      if (!normalized) {
        return null;
      }
      return {
        messageId: message.message_id,
        role: message.role as 'user' | 'assistant',
        text: normalized,
      };
    })
    .filter((item): item is PromptBodyMessage => item !== null);

  const targetMessage = bodies.find(message => message.messageId === targetMessageId && message.role === 'assistant');
  const latestAssistantBody =
    targetMessage?.text || normalizeBodyMessageForPrompt(latestRawReply, 'assistant', 0, settings) || '';
  const precedingMessages = bodies.filter(message => message.messageId < targetMessageId);
  const completeRounds: Array<[PromptBodyMessage, PromptBodyMessage]> = [];
  let pendingUser: PromptBodyMessage | null = null;

  for (const message of precedingMessages) {
    if (message.role === 'user') {
      pendingUser = message;
      continue;
    }
    if (pendingUser) {
      completeRounds.push([pendingUser, message]);
      pendingUser = null;
    }
  }

  const readonlyRounds = completeRounds.slice(-contextRounds).map(([userMessage, assistantMessage]) => ({
    user: {
      messageId: userMessage.messageId,
      content: userMessage.text,
    },
    assistant: {
      messageId: assistantMessage.messageId,
      content: assistantMessage.text,
    },
  }));

  const latestAssistantBodyPayload = {
    messageId: targetMessageId,
    content: latestAssistantBody || '(无可用正文)',
    isOnlyChangeSource: true,
  };

  return {
    latestAssistantBody,
    serialized: JSON.stringify({
      readonlyContextRounds: readonlyRounds,
      latestAssistantBody: latestAssistantBodyPayload,
    }),
    serializedReadonlyContextRounds: JSON.stringify(readonlyRounds),
    serializedLatestAssistantBody: JSON.stringify(latestAssistantBodyPayload),
  };
}

function renderVariablePromptTemplate(
  template: string,
  values: {
    recentBodies: string;
    readonlyContextRounds: string;
    latestAssistantBody: string;
    variableContext: string;
    variableGuidance: string;
    locationContext: string;
    narrativeScale: string;
  },
): string {
  const sourceTemplate = template.trim() ? template : DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE;
  const variableGuidance = sourceTemplate.includes('{{narrativeScale}}')
    ? values.variableGuidance
    : `【叙事表现标尺】\n${values.narrativeScale}\n\n【ERA 变量领域规则】\n${values.variableGuidance}`;
  return sourceTemplate
    .replace(/\{\{recentBodies\}\}/g, values.recentBodies)
    .replace(/\{\{readonlyContextRounds\}\}/g, values.readonlyContextRounds)
    .replace(/\{\{latestAssistantBody\}\}/g, values.latestAssistantBody)
    .replace(/\{\{variableContext\}\}/g, values.variableContext)
    .replace(/\{\{variableGuidance\}\}/g, variableGuidance)
    .replace(/\{\{locationContext\}\}/g, values.locationContext)
    .replace(/\{\{narrativeScale\}\}/g, values.narrativeScale);
}

async function buildExtraVariableUpdatePrompt({
  settings,
  assistantMessageId,
  latestRawReply,
}: {
  settings: SummarySettings;
  assistantMessageId: number;
  latestRawReply: string;
}): Promise<string> {
  const [variableGuidance, worldBackground] = await Promise.all([
    readWorldbookEntryContent(VARIABLE_GUIDANCE_ENTRY_NAME),
    readWorldbookEntryContent(WORLD_BACKGROUND_ENTRY_NAME),
  ]);
  const narrativeScale = extractNarrativeScale(worldBackground);
  const recentBodies = getRecentBodyMessages(
    assistantMessageId,
    latestRawReply,
    settings.variableContextRounds,
    settings,
  );
  const variableProjection = buildVariableProjectionSnapshot(assistantMessageId, recentBodies.latestAssistantBody);

  return renderVariablePromptTemplate(settings.variablePromptTemplate, {
    recentBodies: recentBodies.serialized,
    readonlyContextRounds: recentBodies.serializedReadonlyContextRounds,
    latestAssistantBody: recentBodies.serializedLatestAssistantBody,
    variableContext: variableProjection.variableContext,
    variableGuidance,
    locationContext: variableProjection.locationContext,
    narrativeScale,
  });
}

function extractValidVariableBlocks(rawResponse: string): {
  blocksText: string;
  actionBlockCount: number;
} {
  const blocks: string[] = [];
  let actionBlockCount = 0;

  for (const blockTag of VARIABLE_BLOCK_TAGS) {
    const openingCount = rawResponse.match(new RegExp(`<${blockTag}>`, 'gi'))?.length ?? 0;
    const closingCount = rawResponse.match(new RegExp(`</${blockTag}>`, 'gi'))?.length ?? 0;
    if (openingCount !== closingCount) {
      throw new Error(`额外变量模型返回未闭合的 ${blockTag} 标签。`);
    }
  }

  VARIABLE_BLOCK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_BLOCK_REGEX.exec(rawResponse)) !== null) {
    const blockTag = match[1] as 'VariableThink' | 'VariableInsert' | 'VariableEdit' | 'VariableDelete';
    let body = stripCodeFence(match[2] || '');

    if (ACTION_BLOCK_TAGS.has(blockTag)) {
      if (!body) {
        throw new Error(`${blockTag} 为空，无法写入变量。`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch (error) {
        throw new Error(`${blockTag} JSON 解析失败：${getErrorMessage(error)}`);
      }
      if (!isRecord(parsed)) {
        throw new Error(`${blockTag} 内容必须是 JSON 对象。`);
      }
      body = JSON.stringify(canonicalizeVariablePatchRootKeys(parsed), null, 2);
      actionBlockCount += 1;
    }

    blocks.push(`<${blockTag}>\n${body}\n</${blockTag}>`);
  }

  return {
    blocksText: blocks.join('\n\n').trim(),
    actionBlockCount,
  };
}

async function appendVariableBlocksToAssistantMessage(
  messageId: number,
  blocksText: string,
): Promise<MessageWriteVerification> {
  const { message: freshMessage, activeText, swipeId } = readAssistantMessageActiveText(messageId);
  const nextText = `${activeText.trimEnd()}\n\n${blocksText}`.trim();
  const swipes = Array.isArray(freshMessage.swipes) && freshMessage.swipes.length > 0 ? [...freshMessage.swipes] : null;

  if (swipes) {
    swipes[swipeId] = nextText;
    const swipesData = normalizeArray(freshMessage.swipes_data, swipes.length, () => ({}));
    const swipesInfo = normalizeArray(freshMessage.swipes_info, swipes.length, () => ({}));
    await setChatMessages(
      [
        {
          message_id: messageId,
          message: nextText,
          swipe_id: swipeId,
          swipes,
          swipes_data: swipesData,
          swipes_info: swipesInfo,
        },
      ],
      { refresh: 'none' },
    );
  } else {
    await setChatMessages(
      [
        {
          message_id: messageId,
          message: nextText,
        },
      ],
      { refresh: 'none' },
    );
  }

  const readback = readAssistantMessageActiveText(messageId);
  return createWriteVerification({
    messageId,
    swipeId: readback.swipeId,
    beforeText: activeText,
    attemptedText: nextText,
    readbackText: readback.activeText,
    blocksText,
    stage: '写入后',
  });
}

export async function executeExtraVariableUpdate({
  settings,
  assistantMessageId,
  latestRawReply,
  retryAutoAdvanceFailures = false,
  onPromptBuilt,
  onProgress,
}: {
  settings: SummarySettings;
  assistantMessageId: number;
  latestRawReply: string;
  retryAutoAdvanceFailures?: boolean;
  onPromptBuilt?: (prompt: string) => void;
  onProgress?: (progress: ExtraVariableUpdateProgress) => void;
}): Promise<ExtraVariableUpdateResult> {
  if (settings.variableUpdateMode !== 'extra') {
    return {
      appended: false,
      actionBlockCount: 0,
      rawResponse: '',
    };
  }

  beginExtraVariableUpdate();
  let retry429Count = 0;
  let retry429LastDelayMs = 0;
  let retryFailureCount = 0;
  let retryFailureLastDelayMs = 0;
  const phaseTimeline: ExtraVariablePhaseTiming[] = [];
  const publishPhaseTimeline = (currentPhase: string) => {
    onProgress?.({
      currentPhase,
      phaseTimeline: phaseTimeline.map(phase => ({ ...phase })),
    });
  };
  const runPhase = async <T>(name: string, task: () => T | Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    const phase: ExtraVariablePhaseTiming = {
      name,
      status: 'running',
      startedAt,
      updatedAt: startedAt,
      durationMs: 0,
      watchdogTickCount: 0,
    };
    phaseTimeline.push(phase);
    publishPhaseTimeline(name);
    let previousWatchdogAt = startedAt;
    const watchdog = scheduleUnthrottledInterval(() => {
      const tickedAt = Date.now();
      phase.updatedAt = tickedAt;
      phase.durationMs = phase.updatedAt - startedAt;
      phase.watchdogTickCount += 1;
      publishPhaseTimeline(name);
      if (name === 'wait-era-write-done' && phase.watchdogTickCount % 6 === 0) {
        recordIframeLifecycleEvent('extra-variable-update', 'extra-variable-phase-watchdog', {
          assistantMessageId,
          phase: name,
          tickCount: phase.watchdogTickCount,
          elapsedMs: phase.durationMs,
          tickLagMs: tickedAt - previousWatchdogAt - 5000,
          watchdogTimerSource: watchdog.source,
        });
      }
      previousWatchdogAt = tickedAt;
    }, 5000);
    recordIframeLifecycleEvent('extra-variable-update', 'extra-variable-phase-started', {
      assistantMessageId,
      phase: name,
      startedAt,
      watchdogTimerSource: watchdog.source,
    });

    try {
      const result = await task();
      const finishedAt = Date.now();
      Object.assign(phase, {
        status: 'success' as const,
        updatedAt: finishedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
      });
      recordIframeLifecycleEvent('extra-variable-update', 'extra-variable-phase-finished', {
        assistantMessageId,
        phase: name,
        status: 'success',
        durationMs: finishedAt - startedAt,
        watchdogTickCount: phase.watchdogTickCount,
      });
      publishPhaseTimeline('');
      return result;
    } catch (error) {
      const finishedAt = Date.now();
      Object.assign(phase, {
        status: 'error' as const,
        updatedAt: finishedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        error: getErrorMessage(error),
      });
      recordIframeLifecycleEvent('extra-variable-update', 'extra-variable-phase-finished', {
        assistantMessageId,
        phase: name,
        status: 'error',
        durationMs: finishedAt - startedAt,
        watchdogTickCount: phase.watchdogTickCount,
        error: getErrorMessage(error),
      });
      publishPhaseTimeline('');
      throw error;
    } finally {
      watchdog.cancel();
    }
  };
  try {
    variableTraceLogger.log('[extraVariableUpdate] 开始执行额外变量更新', {
      assistantMessageId,
      variableUpdateMode: settings.variableUpdateMode,
      latestRawReplyLength: latestRawReply.length,
    });
    await runPhase('disable-variable-guidance', () => ensureVariableGuidanceEnabled(false));
    const requestSettings = resolveConfiguredTextSettings(settings, 'variable');
    const prompt = await runPhase('build-variable-prompt', () =>
      buildExtraVariableUpdatePrompt({ settings, assistantMessageId, latestRawReply }),
    );
    onPromptBuilt?.(prompt);
    onProgress?.({ prompt });
    variableTraceLogger.log('[extraVariableUpdate] 额外变量提示词已构建', {
      assistantMessageId,
      promptLength: prompt.length,
      prompt,
    });
    let prevalidatedExtraction: ReturnType<typeof extractValidVariableBlocks> | null = null;
    const requestVariableModel = async () => {
      const rawResponse = await runWith429Retry(
        () =>
          requestConfiguredText({
            prompt,
            settings: requestSettings,
            timeoutMs: EXTRA_VARIABLE_UPDATE_TIMEOUT_MS,
            shouldStream: false,
            generationIdPrefix: 'wuxia-variable-update',
            skipWorldInfoAndAuthorNote: true,
          }),
        {
          requestLabel: '额外变量模型',
          onRetry: ({ retryNumber, maxRetries, delayMs, error }) => {
            retry429Count = retryNumber;
            retry429LastDelayMs = delayMs;
            onProgress?.({ retry429Count, retry429LastDelayMs });
            variableTraceLogger.warn('[extraVariableUpdate] 额外变量模型返回 429，准备自动重试', {
              assistantMessageId,
              retryNumber,
              maxRetries,
              delayMs,
              error,
            });
          },
        },
      );
      if (retryAutoAdvanceFailures) {
        if (!rawResponse.trim()) {
          throw new Error('额外变量模型返回空回复');
        }
        prevalidatedExtraction = extractValidVariableBlocks(rawResponse);
        if (!prevalidatedExtraction.blocksText) {
          throw new Error('额外变量模型没有返回可识别的变量块');
        }
      }
      return rawResponse;
    };
    const rawResponse = await runPhase('request-variable-model', () =>
      retryAutoAdvanceFailures
        ? runWithAutoAdvanceFailureRetry(requestVariableModel, {
            requestLabel: '额外变量模型',
            onRetry: ({ retryNumber, maxRetries, delayMs, error }) => {
              retryFailureCount = retryNumber;
              retryFailureLastDelayMs = delayMs;
              onProgress?.({ retryFailureCount, retryFailureLastDelayMs });
              variableTraceLogger.warn('[extraVariableUpdate] 额外变量模型失败，准备自动推进重试', {
                assistantMessageId,
                retryNumber,
                maxRetries,
                delayMs,
                error,
              });
            },
          })
        : requestVariableModel(),
    );
    variableTraceLogger.log('[extraVariableUpdate] 额外模型已返回', {
      assistantMessageId,
      rawResponseLength: rawResponse.length,
      rawResponse,
    });
    onProgress?.({ prompt, rawResponse });
    const { blocksText, actionBlockCount, declaredState } = await runPhase('parse-variable-response', () => {
      const extracted = prevalidatedExtraction ?? extractValidVariableBlocks(rawResponse);
      return {
        ...extracted,
        declaredState: parseDeclaredVariableChanges(extracted.blocksText),
      };
    });
    variableTraceLogger.log('[extraVariableUpdate] 变量块提取完成', {
      assistantMessageId,
      actionBlockCount,
      blocksTextLength: blocksText.length,
      blocksText,
      declaredChangeCount: declaredState.declaredChanges.length,
      declaredParseErrors: declaredState.parseErrors,
    });
    onProgress?.({ prompt, rawResponse, appendedBlocks: blocksText, actionBlockCount });

    if (actionBlockCount === 0 || !blocksText) {
      variableTraceLogger.log('[extraVariableUpdate] 没有可写入的合法动作块，跳过 ERA 同步', {
        assistantMessageId,
        actionBlockCount,
      });
      return {
        appended: false,
        actionBlockCount,
        prompt,
        rawResponse,
        retry429Count,
        retry429LastDelayMs,
        retryFailureCount,
        retryFailureLastDelayMs,
      };
    }

    await runPhase('validate-variable-actions', () => assertDeclaredActionPathsValid(declaredState.declaredChanges));

    const appendVerification = await runPhase('append-variable-blocks', () =>
      appendVariableBlocksToAssistantMessage(assistantMessageId, blocksText),
    );
    variableTraceLogger.log('[extraVariableUpdate] 变量块已追加到目标楼层', {
      assistantMessageId,
      actionBlockCount,
      appendVerified: appendVerification.verified,
      appendVerification: appendVerification.verification,
      appendReadbackText: appendVerification.readbackText,
    });
    onProgress?.({
      appended: true,
      actionBlockCount,
      prompt,
      rawResponse,
      appendedBlocks: blocksText,
      finalMessageText: appendVerification.readbackText,
      appendReadbackText: appendVerification.readbackText,
      appendVerification: appendVerification.verification,
      applyStatus: 'waiting-write-done',
      applyVerification: '变量块已追加，正在等待匹配的 ERA 原始写入完成信号。',
    });

    if (!appendVerification.verified) {
      throw new Error(`${appendVerification.verification}\n变量块没有成功写入目标楼层，已停止 ERA latest 同步。`);
    }

    try {
      variableTraceLogger.log('[extraVariableUpdate] 开始等待 ERA 同步', {
        assistantMessageId,
        actionBlockCount,
        expectedAction: 'apiWrite',
        timeoutMs: ERA_SYNC_TIMEOUT_MS,
      });
      const eraWriteResult = await runPhase('wait-era-write-done', () =>
        emitSourcedEraVariableWriteAndWait({
          source: 'frontend',
          operation: 'update',
          reason: 'extra-variable-api-write',
          eventName: 'era:apiWrite',
          attribution: 'ai',
          timeoutMs: ERA_SYNC_TIMEOUT_MS,
          timeoutMessage: 'ERA 没有响应 era:apiWrite，额外变量更新已停止。',
          expectedMessageId: assistantMessageId,
          expectedAction: 'apiWrite',
        }),
      );
      variableTraceLogger.log('[extraVariableUpdate] 收到匹配的 ERA 同步完成信号', {
        assistantMessageId,
        actionBlockCount,
        matchedMessageId: eraWriteResult.message_id ?? null,
        matchedActions: eraWriteResult.actions,
      });
      onProgress?.({
        applyStatus: 'verifying',
        applyVerification: 'ERA 已返回匹配的写入完成信号，正在回读聊天级 stat_data。',
      });
    } catch (error) {
      variableTraceLogger.error('[extraVariableUpdate] 等待 ERA 同步失败', {
        assistantMessageId,
        actionBlockCount,
        error,
      });
      onProgress?.({
        applyStatus: 'error',
        applyError: getErrorMessage(error),
      });
      try {
        const syncReadback = readAssistantMessageActiveText(assistantMessageId);
        const syncVerification = createWriteVerification({
          messageId: assistantMessageId,
          swipeId: syncReadback.swipeId,
          beforeText: appendVerification.beforeText,
          attemptedText: appendVerification.attemptedText,
          readbackText: syncReadback.activeText,
          blocksText,
          stage: '同步失败后',
        });
        onProgress?.({
          finalMessageText: syncReadback.activeText,
          syncReadbackText: syncReadback.activeText,
          syncVerification: syncVerification.verification,
        });
        throw new Error(`${getErrorMessage(error)}\n${syncVerification.verification}`);
      } catch (readbackError) {
        if (readbackError instanceof Error && readbackError.message.includes('同步失败后回读')) {
          throw readbackError;
        }
        throw new Error(`${getErrorMessage(error)}\n同步失败后回读最新楼层失败：${getErrorMessage(readbackError)}`);
      }
    }

    const { syncReadback, syncVerification } = await runPhase('readback-era-result', () => {
      const readback = readAssistantMessageActiveText(assistantMessageId);
      return {
        syncReadback: readback,
        syncVerification: createWriteVerification({
          messageId: assistantMessageId,
          swipeId: readback.swipeId,
          beforeText: appendVerification.beforeText,
          attemptedText: appendVerification.attemptedText,
          readbackText: readback.activeText,
          blocksText,
          stage: 'ERA 同步后',
        }),
      };
    });
    onProgress?.({
      finalMessageText: syncReadback.activeText,
      syncReadbackText: syncReadback.activeText,
      syncVerification: syncVerification.verification,
    });
    variableTraceLogger.log('[extraVariableUpdate] ERA 同步后回读完成', {
      assistantMessageId,
      syncVerified: syncVerification.verified,
      syncVerification: syncVerification.verification,
      syncReadbackText: syncReadback.activeText,
    });

    if (!syncVerification.verified) {
      throw new Error(
        `${syncVerification.verification}\n变量块写入后又从最新楼层消失，请检查 ERA latest 同步或楼层刷新是否覆盖了正文。`,
      );
    }

    const persistenceVerification = await runPhase('verify-variable-persistence', () =>
      verifyDeclaredChangesAfterEraWrite(declaredState.declaredChanges),
    );
    const applyStatus: ExtraVariableApplyStatus = persistenceVerification.verified ? 'success' : 'error';
    onProgress?.({
      applyStatus,
      applyVerification: persistenceVerification.verification,
    });
    if (!persistenceVerification.verified) {
      const persistenceError = `ERA 已返回写入完成，但变量声明未按原值落库：${
        persistenceVerification.pendingPaths.join('、') || persistenceVerification.verification
      }`;
      variableTraceLogger.error('[extraVariableUpdate] 原始 ERA 写入已确认，但变量声明未按原值落库', {
        assistantMessageId,
        pendingPaths: persistenceVerification.pendingPaths,
      });
      onProgress?.({
        applyStatus: 'error',
        applyVerification: persistenceVerification.verification,
        applyError: persistenceError,
      });
      throw new Error(persistenceError);
    }

    return {
      appended: true,
      actionBlockCount,
      prompt,
      rawResponse,
      appendedBlocks: blocksText,
      finalMessageText: syncReadback.activeText,
      appendReadbackText: appendVerification.readbackText,
      appendVerification: appendVerification.verification,
      syncReadbackText: syncReadback.activeText,
      syncVerification: syncVerification.verification,
      retry429Count,
      retry429LastDelayMs,
      retryFailureCount,
      retryFailureLastDelayMs,
      applyStatus,
      applyVerification: persistenceVerification.verification,
    };
  } finally {
    variableTraceLogger.log('[extraVariableUpdate] 本轮额外变量更新结束', { assistantMessageId });
    finishExtraVariableUpdate();
  }
}
