import {
  DEFAULT_VARIABLE_DATA_FORMAT_TEMPLATE,
  DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE,
  applyCurrentPresetModuleFilter,
  type SummarySettings,
} from './settingsManager';
import {
  VARIABLE_PROMPT_SLOT_META,
  renderVariableConditionalTemplate,
  renderVariableDataTemplate,
  renderVariableInputTemplate,
  type VariablePromptSlotName,
  type VariablePromptSlots,
} from './variablePromptTemplateEngine';
import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { beginInternalMessageUpdate, finishInternalMessageUpdate } from '../../shared/internalMessageUpdateGuard';
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
import {
  compareWorldTime,
  isWorldTimePath,
  resolveWorldTimeCompletionTarget,
  validateWorldTimePatch,
  type WorldTimeGuardResult,
  type WorldTimeTuple,
} from './worldTimeGuard';

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
  rejectedActions?: RejectedVariableAction[];
  formatRepairAttempted?: boolean;
  timeRepairAttempted?: boolean;
};

export type RejectedVariableAction = {
  action: VariableDeclaredChange['action'];
  path: string;
  reason: string;
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
const PARTICIPATION_WRITABLE_KEYS = ['结局', 'insert', 'update', 'delete'] as const;
const TASK_WRITABLE_KEYS = ['任务执行情况'] as const;
const VARIABLE_ROOT_KEY_ALIASES: Record<string, string> = {
  玩家数据: 'user数据',
  同场景角色: '角色数据',
};

class VariableJsonSyntaxError extends Error {
  constructor(
    readonly blockTag: string,
    readonly jsonError: string,
  ) {
    super(`${blockTag} JSON 解析失败：${jsonError}`);
    this.name = 'VariableJsonSyntaxError';
  }
}

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
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, String(segment))) return false;
    current = current[String(segment)];
  }
  return true;
}

function validateDeclaredLocations(declaredChanges: VariableDeclaredChange[]): {
  accepted: VariableDeclaredChange[];
  rejected: RejectedVariableAction[];
} {
  if (declaredChanges.length === 0) return { accepted: [], rejected: [] };
  const statData = readCurrentStatDataSnapshot();
  if (!statData) {
    throw new Error('聊天级 stat_data 暂不可读，无法校验额外变量模型声明的地点。');
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

  const accepted: VariableDeclaredChange[] = [];
  const rejected: RejectedVariableAction[] = [];
  for (const change of declaredChanges) {
    let reason = '';
    if (change.action !== 'delete' && change.path.at(-1) === '所在位置') {
      const parsed = parseLocationPath(change.value);
      if (!parsed) {
        reason = `地点 ${JSON.stringify(change.value)} 无效；地点必须是三级或四级完整路径。`;
      } else {
        const currentValue = readPathValue(statData, change.path);
        if (!isSameLocationScope(currentValue, parsed.fullPath) && !allowedLocationScopes.has(parsed.scopePath)) {
          reason = `未授权活动区 ${parsed.scopePath}；跨活动区移动只能使用“周围地点”中的合法前三段。`;
        }
      }
    }

    if (reason) {
      rejected.push({ action: change.action, path: change.displayPath, reason });
    } else {
      accepted.push(change);
    }
  }

  return { accepted, rejected };
}

function setVariablePatchValue(
  patch: Record<string, unknown>,
  path: readonly (string | number)[],
  value: unknown,
): void {
  let current: Record<string, unknown> | unknown[] = patch;
  path.forEach((segment, index) => {
    const isLast = index === path.length - 1;
    if (isLast) {
      current[segment as never] = value as never;
      return;
    }
    const nextContainer: Record<string, unknown> | unknown[] = typeof path[index + 1] === 'number' ? [] : {};
    const existing = current[segment as never] as unknown;
    if (!isRecord(existing) && !Array.isArray(existing)) current[segment as never] = nextContainer as never;
    current = current[segment as never] as Record<string, unknown> | unknown[];
  });
}

function serializeVariableBlocks(
  thoughts: Array<{ text: string }>,
  changes: VariableDeclaredChange[],
): string {
  const blocks = thoughts.map(thought => `<VariableThink>\n${thought.text}\n</VariableThink>`);
  for (const blockTag of ['VariableEdit', 'VariableInsert', 'VariableDelete'] as const) {
    const grouped = changes.filter(change => change.blockTag === blockTag);
    if (!grouped?.length) continue;
    const patch: Record<string, unknown> = {};
    for (const change of grouped) {
      setVariablePatchValue(patch, change.path, change.action === 'delete' ? {} : change.value);
    }
    blocks.push(`<${blockTag}>\n${JSON.stringify(patch, null, 2)}\n</${blockTag}>`);
  }
  return blocks.join('\n').trim();
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
  const moduleFiltered = role === 'assistant' ? applyCurrentPresetModuleFilter(rawText) : rawText;
  const withoutAssistantPrefix =
    role === 'assistant'
      ? stripAssistantPrefixThroughLastMarker(moduleFiltered, settings.variablePromptBodyStartMarkers)
      : moduleFiltered;
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
): Promise<ExtraVariableUpdateReservation> {
  const reservation = reserveExtraVariableUpdate();
  try {
    const requestSettings = resolveConfiguredTextSettings(settings, 'variable');
    if (requestSettings.apiMode === 'custom') {
      const validationMessage = validateSummaryApiConfig(requestSettings.apiConfig, { requireModel: true });
      if (validationMessage) {
        throw new Error(validationMessage);
      }
    }
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
  const tasks = isRecord(statData.任务) ? statData.任务 : {};
  const writableTasks = Object.entries(tasks).reduce<Record<string, unknown>>((result, [taskName, taskValue]) => {
    if (!isRecord(taskValue)) return result;
    result[taskName] = Object.fromEntries(
      TASK_WRITABLE_KEYS.filter(key => Object.hasOwn(taskValue, key)).map(key => [key, taskValue[key]]),
    );
    return result;
  }, {});

  return sanitizeForPrompt({
    世界信息: Object.hasOwn(worldInfo, '时间') ? { 时间: worldInfo.时间 } : {},
    user数据: omitReadonlyEntityFields(userData),
    角色数据: collectRelevantCharacters(statData, playerLocation, latestAssistantBody, participationEvents),
    参与事件: writableParticipationEvents,
    任务: writableTasks,
  }) as Record<string, unknown>;
}

function formatCompactKey(value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '""';
  return /[\s,:{}\[\]"'\\|]/.test(text) ? JSON.stringify(text) : text;
}

function formatCompactScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return '""';
  if (
    /[,:{}\[\]"'\\|]/.test(text) ||
    /^(?:true|false|null|-?\d+(?:\.\d+)?)$/i.test(text)
  ) {
    return JSON.stringify(text);
  }
  return text;
}

function formatCompactObject(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => formatCompactObject(item)).join(',')}]`;
  }
  if (!isRecord(value)) {
    return formatCompactScalar(value);
  }
  return `{${Object.entries(value)
    .filter(([key]) => !key.startsWith('$'))
    .map(([key, child]) => `${formatCompactKey(key)}:${formatCompactObject(child)}`)
    .join(',')}}`;
}

function formatPlayerContext(
  projection: Record<string, unknown>,
  initialAttributes: unknown,
  talents: unknown,
): string {
  const projectedUserData = isRecord(projection.user数据) ? projection.user数据 : {};
  const userData: Record<string, unknown> = { ...projectedUserData };
  const sanitizedInitialAttributes = sanitizeForPrompt(initialAttributes);
  const sanitizedTalents = sanitizeForPrompt(talents);
  if (isRecord(sanitizedInitialAttributes) && Object.keys(sanitizedInitialAttributes).length > 0) {
    userData.初始属性 = sanitizedInitialAttributes;
  }
  if (isRecord(sanitizedTalents) && Object.keys(sanitizedTalents).length > 0) {
    userData.天赋 = sanitizedTalents;
  }
  return formatCompactObject(userData);
}

function formatParticipationEventsContext(
  projection: Record<string, unknown>,
  participationEvents: unknown,
): string {
  const writableParticipationEvents = isRecord(projection.参与事件) ? projection.参与事件 : {};
  if (!isRecord(participationEvents) || Object.keys(writableParticipationEvents).length === 0) {
    return '';
  }

  const nestedEvents: Record<string, unknown> = {};
  for (const [eventName, writableSnapshot] of Object.entries(writableParticipationEvents)) {
    const eventValue = isRecord(participationEvents[eventName]) ? participationEvents[eventName] : {};
    const eventContext: Record<string, unknown> = {};
    if (Object.hasOwn(eventValue, '描述')) eventContext.描述 = eventValue.描述;
    if (Object.hasOwn(eventValue, '地点')) eventContext.地点 = eventValue.地点;
    if (isRecord(writableSnapshot)) {
      for (const key of PARTICIPATION_WRITABLE_KEYS) {
        if (Object.hasOwn(writableSnapshot, key)) eventContext[key] = writableSnapshot[key];
      }
    }
    nestedEvents[eventName] = sanitizeForPrompt(eventContext);
  }
  return formatCompactObject(nestedEvents);
}

function formatTasksContext(projection: Record<string, unknown>, tasks: unknown): string {
  const writableTasks = isRecord(projection.任务) ? projection.任务 : {};
  if (!isRecord(tasks) || Object.keys(writableTasks).length === 0) return '';

  const nestedTasks: Record<string, unknown> = {};
  for (const taskName of Object.keys(writableTasks)) {
    const taskValue = isRecord(tasks[taskName]) ? tasks[taskName] : {};
    nestedTasks[taskName] = sanitizeForPrompt(
      Object.fromEntries(Object.entries(taskValue).filter(([key]) => !key.startsWith('$'))),
    );
  }
  return formatCompactObject(nestedTasks);
}

function formatFollowupCluesContext(followupClues: unknown): string {
  if (!isRecord(followupClues) || Object.keys(followupClues).length === 0) {
    return '';
  }
  return formatCompactObject(sanitizeForPrompt(followupClues));
}

function uniqueFullLocationPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(normalizeLocationPath).filter(Boolean)));
}

function formatLocationContext(surroundingLocations: unknown, currentLocation: unknown): string {
  const locationGroups = isRecord(surroundingLocations) ? surroundingLocations : {};
  const normalizedCurrentLocation = normalizeLocationPath(currentLocation);
  const normalPaths = uniqueFullLocationPaths(locationGroups.普通移动);
  const eventPaths = uniqueFullLocationPaths(locationGroups.事件目标);
  const instructionPaths = uniqueFullLocationPaths(locationGroups.地图指定);
  if (!normalizedCurrentLocation && normalPaths.length === 0 && eventPaths.length === 0 && instructionPaths.length === 0) {
    return '';
  }

  const locationContext: Record<string, unknown> = {};
  if (normalizedCurrentLocation) locationContext.当前地点 = normalizedCurrentLocation;
  if (normalPaths.length > 0) locationContext.普通移动 = normalPaths;
  if (eventPaths.length > 0) locationContext.事件目标 = eventPaths;
  if (instructionPaths.length > 0) locationContext.指令地点 = instructionPaths;
  return formatCompactObject(locationContext);
}

function buildVariableProjectionSnapshot(
  assistantMessageId: number,
  latestAssistantBody: string,
): {
  projection: Record<string, unknown>;
  locationContext: string;
  participationEvents: unknown;
  tasks: unknown;
  followupClues: unknown;
  cultivationReference: unknown;
  playerInitialAttributes: unknown;
  playerTalents: unknown;
} {
  const variables = readAllVariablesSnapshot(assistantMessageId);
  const statDataSource = isRecord(variables.stat_data) ? variables.stat_data : variables;
  const statData = statDataSource as Record<string, unknown>;
  const projection = buildExtraVariableProjection(variables, latestAssistantBody);
  const frontendVariables = getNestedRecord(statData, '前端变量') || {};
  const rawUserData = getNestedRecord(statData, 'user数据') || getNestedRecord(statData, '玩家数据') || {};
  const tasks = statData.任务;
  const projectedUserData = isRecord(projection.user数据) ? projection.user数据 : {};
  const locationContext = formatLocationContext(frontendVariables.周围地点, projectedUserData.所在位置);

  return {
    projection,
    locationContext,
    participationEvents: statData.参与事件,
    tasks,
    followupClues: statData.后续事件线索,
    cultivationReference: frontendVariables.修为变化参考,
    playerInitialAttributes: rawUserData.初始属性,
    playerTalents: rawUserData.天赋,
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
  latestUserBody: string;
  serializedLatestUserBody: string;
  latestAssistantBody: string;
  serializedLatestAssistantBody: string;
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

  const readonlyContextRounds = completeRounds
    .slice(-contextRounds)
    .map(([userMessage, assistantMessage]) => ['User:', userMessage.text, '正文:', assistantMessage.text].join('\n'))
    .join('\n\n');

  const latestUserMessage = pendingUser;
  const latestUserBody = latestUserMessage?.text || '';
  const renderedLatestUserBody = latestUserBody || '(无可用 user 输入)';
  const renderedLatestAssistantBody = latestAssistantBody || '(无可用正文)';

  return {
    latestUserBody,
    latestAssistantBody,
    serialized: [
      '前序只读轮次:',
      readonlyContextRounds || '(无)',
      '本轮User:',
      renderedLatestUserBody,
      '本轮正文:',
      renderedLatestAssistantBody,
    ].join('\n'),
    serializedReadonlyContextRounds: readonlyContextRounds || '(无)',
    serializedLatestUserBody: renderedLatestUserBody,
    serializedLatestAssistantBody: renderedLatestAssistantBody,
  };
}

function buildVariablePromptSlots(
  recentBodies: ReturnType<typeof getRecentBodyMessages>,
  variableProjection: ReturnType<typeof buildVariableProjectionSnapshot>,
): VariablePromptSlots {
  const relevantCharacters =
    isRecord(variableProjection.projection.角色数据) &&
    Object.keys(variableProjection.projection.角色数据).length > 0
      ? formatCompactObject(variableProjection.projection.角色数据)
      : '';
  const cultivationReference =
    typeof variableProjection.cultivationReference === 'number' &&
    Number.isFinite(variableProjection.cultivationReference)
      ? formatCompactObject({ 一天增幅: variableProjection.cultivationReference })
      : '';
  const participationEvents = formatParticipationEventsContext(
    variableProjection.projection,
    variableProjection.participationEvents,
  );
  const tasks = formatTasksContext(variableProjection.projection, variableProjection.tasks);

  return {
    readonlyContextRounds: recentBodies.serializedReadonlyContextRounds,
    variableData: '',
    latestUserBody: recentBodies.serializedLatestUserBody,
    latestAssistantBody: recentBodies.serializedLatestAssistantBody,
    worldContext: formatCompactObject(variableProjection.projection.世界信息 ?? {}),
    playerContext: formatPlayerContext(
      variableProjection.projection,
      variableProjection.playerInitialAttributes,
      variableProjection.playerTalents,
    ),
    participationEvents,
    tasks,
    followupClues: formatFollowupCluesContext(variableProjection.followupClues),
    relevantCharacters,
    locationContext: variableProjection.locationContext,
    cultivationReference,
    decisionChecklist: '',
  };
}

function renderVariablePromptTemplate(
  template: string,
  values: {
    recentBodies: string;
    readonlyContextRounds: string;
    latestUserBody: string;
    latestAssistantBody: string;
    variableContext: string;
    variableInputContext: string;
    variableTemplate: string;
    variableGuidance: string;
    locationContext: string;
    narrativeScale: string;
  },
): string {
  const sourceTemplate = template.trim() ? template : DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE;
  return sourceTemplate
    .replace(/\{\{recentBodies\}\}/g, values.recentBodies)
    .replace(/\{\{readonlyContextRounds\}\}/g, values.readonlyContextRounds)
    .replace(/\{\{latestUserBody\}\}/g, values.latestUserBody)
    .replace(/\{\{latestAssistantBody\}\}/g, values.latestAssistantBody)
    .replace(/\{\{variableContext\}\}/g, values.variableContext)
    .replace(/\{\{variableInputContext\}\}/g, values.variableInputContext)
    .replace(/\{\{variableTemplate\}\}/g, values.variableTemplate)
    .replace(/\{\{variableGuidance\}\}/g, values.variableGuidance)
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
  const worldBackground = await readWorldbookEntryContent(WORLD_BACKGROUND_ENTRY_NAME);
  const narrativeScale = extractNarrativeScale(worldBackground);
  const recentBodies = getRecentBodyMessages(
    assistantMessageId,
    latestRawReply,
    settings.variableContextRounds,
    settings,
  );
  const variableProjection = buildVariableProjectionSnapshot(assistantMessageId, recentBodies.latestAssistantBody);
  const slots = buildVariablePromptSlots(recentBodies, variableProjection);
  const variableData = renderVariableDataTemplate(DEFAULT_VARIABLE_DATA_FORMAT_TEMPLATE, slots);
  slots.variableData = variableData;
  const variableInputContext = renderVariableInputTemplate(settings.variableInputTemplate, slots);
  const variableGuidance = renderVariableConditionalTemplate(settings.variableGuidanceTemplate, slots);

  return renderVariablePromptTemplate(settings.variablePromptTemplate, {
    recentBodies: recentBodies.serialized,
    readonlyContextRounds: recentBodies.serializedReadonlyContextRounds,
    latestUserBody: recentBodies.serializedLatestUserBody,
    latestAssistantBody: recentBodies.serializedLatestAssistantBody,
    variableContext: variableData,
    variableInputContext,
    variableTemplate: settings.variableStructureTemplate,
    variableGuidance,
    locationContext: variableProjection.locationContext,
    narrativeScale,
  });
}

export type VariablePromptInspectionSnapshot = {
  assistantMessageId?: number;
  renderedInput: string;
  items: Array<{
    name: VariablePromptSlotName;
    label: string;
    description: string;
    source: string;
    emptyBehavior: string;
    value: string;
    active: boolean;
  }>;
  error?: string;
};

export function inspectVariablePromptSlots(settings: SummarySettings): VariablePromptInspectionSnapshot {
  try {
    const messages = getChatMessages('0-{{lastMessageId}}', {
      hide_state: 'unhidden',
      include_swipes: true,
    }) as ChatMessageWithSwipes[];
    const target = [...messages]
      .reverse()
      .find(message => message.role === 'assistant' && !isFrontendLoaderOnlyMessage(getActiveMessageText(message)));
    if (!target) {
      return {
        renderedInput: '',
        items: VARIABLE_PROMPT_SLOT_META.map(meta => ({ ...meta, value: '', active: false })),
        error: '当前聊天没有可用于预览的 assistant 正文。',
      };
    }

    const rawReply = getActiveMessageText(target);
    const recentBodies = getRecentBodyMessages(target.message_id, rawReply, settings.variableContextRounds, settings);
    const variableProjection = buildVariableProjectionSnapshot(target.message_id, recentBodies.latestAssistantBody);
    const slots = buildVariablePromptSlots(recentBodies, variableProjection);
    slots.variableData = renderVariableDataTemplate(DEFAULT_VARIABLE_DATA_FORMAT_TEMPLATE, slots);
    return {
      assistantMessageId: target.message_id,
      renderedInput: renderVariableInputTemplate(settings.variableInputTemplate, slots),
      items: VARIABLE_PROMPT_SLOT_META.map(meta => ({
        ...meta,
        value: slots[meta.name],
        active: Boolean(slots[meta.name].trim()),
      })),
    };
  } catch (error) {
    return {
      renderedInput: '',
      items: VARIABLE_PROMPT_SLOT_META.map(meta => ({ ...meta, value: '', active: false })),
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
        throw new VariableJsonSyntaxError(blockTag, getErrorMessage(error));
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
    blocksText: blocks.join('\n').trim(),
    actionBlockCount,
  };
}

export type WorldTimeReplyValidationResult = {
  changes: VariableDeclaredChange[];
  thoughts: Array<{ text: string }>;
  blocksText: string;
  timeRepairAttempted: boolean;
  repairRawResponse?: string;
};

function getWorldTimeGuardContext(): {
  statData: Record<string, unknown>;
  baseline: Record<string, unknown> | null;
} {
  const statData = readCurrentStatDataSnapshot();
  if (!statData) throw new Error('聊天级 stat_data 暂不可读，无法校验世界时间。');
  const worldInfo = isRecord(statData.世界信息) ? statData.世界信息 : null;
  const baseline = worldInfo && isRecord(worldInfo.时间) ? worldInfo.时间 : null;
  return { statData, baseline };
}

function createWorldTimeRepairPrompt({
  guard,
  lockedTarget,
  lockedElapsedMinutes,
  statData,
  latestAssistantBody,
  originalTimeBlocks,
  previousFailure,
  previousResponse,
}: {
  guard: Extract<WorldTimeGuardResult, { ok: false }>;
  lockedTarget: WorldTimeTuple;
  lockedElapsedMinutes: number;
  statData: Record<string, unknown>;
  latestAssistantBody: string;
  originalTimeBlocks: string;
  previousFailure: string;
  previousResponse: string;
}): string {
  const participationContext = {
    参与事件: statData.参与事件 ?? {},
    进行中事件: isRecord(statData.事件系统) ? (statData.事件系统.进行中事件 ?? {}) : {},
  };
  return `你是世界时间语义纠错器。原变量回复的时间声明未通过确定性校验。

【校验失败】
错误代码：${guard.code}
原因：${guard.reason}
当前完整时间：${JSON.stringify(guard.baseline)}
非法候选时间：${JSON.stringify(guard.candidate)}
锁定耗时：${lockedElapsedMinutes} 分钟
锁定新时间：${JSON.stringify(lockedTarget)}

【最新 assistant 正文】
${latestAssistantBody || '（空）'}

【只读事件上下文】
${JSON.stringify(sanitizeForPrompt(participationContext))}

【原时间声明】
${originalTimeBlocks || '（无可序列化声明）'}
${previousFailure ? `\n【上一次纠错仍失败】\n${previousFailure}\n上一次返回：\n${previousResponse}` : ''}

【唯一任务】
1. 原回复声明的耗时和目标时间已经由程序锁定；禁止根据正文、事件边界或自己的判断重新估算、缩短或延长耗时。
2. 你只能把“锁定新时间”原样补全为年/月/日/时/分五字段；任何字段与锁定值不同都视为纠错失败。
3. VariableThink 必须简写“旧完整时间 + 锁定耗时 = 锁定新时间”，不得换用其他耗时。
4. 只允许输出 <VariableThink> 以及路径为 世界信息.时间 的 VariableEdit/VariableInsert。不得输出正文、解释、选项或任何其他变量路径。
5. 时间字段已存在用 Edit；仅旧档缺分时，分用 Insert、其余四字段用 Edit。`;
}

export async function validateOrRepairWorldTimeDeclarations({
  settings,
  declaredChanges,
  thoughts,
  latestAssistantBody,
  forcedRepairReason = '',
}: {
  settings: SummarySettings;
  declaredChanges: VariableDeclaredChange[];
  thoughts: Array<{ text: string }>;
  latestAssistantBody: string;
  forcedRepairReason?: string;
}): Promise<WorldTimeReplyValidationResult> {
  if (!forcedRepairReason && !declaredChanges.some(change => isWorldTimePath(change.path))) {
    return {
      changes: declaredChanges,
      thoughts,
      blocksText: serializeVariableBlocks(thoughts, declaredChanges),
      timeRepairAttempted: false,
    };
  }

  const { statData, baseline } = getWorldTimeGuardContext();
  const validatedGuard = validateWorldTimePatch({ baseline, declaredChanges });
  if (validatedGuard.ok && !forcedRepairReason) {
    return {
      changes: declaredChanges,
      thoughts,
      blocksText: serializeVariableBlocks(thoughts, declaredChanges),
      timeRepairAttempted: false,
    };
  }
  const initialGuard: Extract<WorldTimeGuardResult, { ok: false }> = validatedGuard.ok
    ? {
        ok: false,
        code: 'declared-action-invalid',
        reason: forcedRepairReason,
        baseline: validatedGuard.baseline,
        candidate: validatedGuard.candidate,
        timeChanges: validatedGuard.timeChanges,
        nonTimeChanges: validatedGuard.nonTimeChanges,
      }
    : forcedRepairReason
      ? { ...validatedGuard, code: 'declared-action-invalid', reason: forcedRepairReason }
      : validatedGuard;

  variableTraceLogger.warn('[worldTimeGuard] 拒绝非法世界时间，准备定向纠错', {
    code: initialGuard.code,
    reason: initialGuard.reason,
    baseline: initialGuard.baseline,
    candidate: initialGuard.candidate,
  });

  const completionTarget = resolveWorldTimeCompletionTarget({
    baseline,
    declaredChanges: initialGuard.timeChanges,
    thoughts,
  });
  if (!completionTarget.ok) {
    throw new Error(`原时间声明无法在不改变耗时的前提下补全：${completionTarget.reason}`);
  }

  const requestSettings = resolveConfiguredTextSettings(settings, 'variable');
  if (requestSettings.apiMode === 'custom') {
    const validationMessage = validateSummaryApiConfig(requestSettings.apiConfig, { requireModel: true });
    if (validationMessage) throw new Error(validationMessage);
  }
  const originalTimeBlocks = serializeVariableBlocks([], initialGuard.timeChanges);
  let previousFailure = '';
  let previousResponse = '';
  let finalRawResponse = '';

  const requestRepair = async () => {
    const repairPrompt = createWorldTimeRepairPrompt({
      guard: initialGuard,
      lockedTarget: completionTarget.target,
      lockedElapsedMinutes: completionTarget.elapsedMinutes,
      statData,
      latestAssistantBody,
      originalTimeBlocks,
      previousFailure,
      previousResponse,
    });
    const rawResponse = await runWith429Retry(
      () =>
        requestConfiguredText({
          prompt: repairPrompt,
          settings: requestSettings,
          timeoutMs: EXTRA_VARIABLE_UPDATE_TIMEOUT_MS,
          shouldStream: false,
          generationIdPrefix: 'wuxia-world-time-repair',
          skipWorldInfoAndAuthorNote: true,
        }),
      { requestLabel: '世界时间定向纠错' },
    );
    finalRawResponse = rawResponse;
    try {
      const extracted = extractValidVariableBlocks(rawResponse);
      const repairedState = parseDeclaredVariableChanges(extracted.blocksText);
      if (repairedState.parseErrors.length > 0) {
        throw new Error(`纠错变量块无法解析：${repairedState.parseErrors.join('；')}`);
      }
      if (repairedState.omittedDeclaredCount > 0) {
        throw new Error('纠错返回超过可安全校验的声明上限。');
      }
      const forbiddenChanges = repairedState.declaredChanges.filter(change => !isWorldTimePath(change.path));
      if (forbiddenChanges.length > 0) {
        throw new Error(`纠错返回包含非时间路径：${forbiddenChanges.map(change => change.displayPath).join('、')}`);
      }
      const repairedGuard = validateWorldTimePatch({
        baseline,
        declaredChanges: repairedState.declaredChanges,
      });
      if (!repairedGuard.ok) throw new Error(repairedGuard.reason);
      if (!repairedGuard.candidate || compareWorldTime(repairedGuard.candidate, completionTarget.target) !== 0) {
        throw new Error(
          `纠错返回擅自改变了原声明时间：必须为 ${JSON.stringify(completionTarget.target)}，实际为 ${JSON.stringify(repairedGuard.candidate)}。`,
        );
      }
      return {
        changes: [...initialGuard.nonTimeChanges, ...repairedGuard.timeChanges],
        thoughts: [...thoughts, ...repairedState.thoughts],
      };
    } catch (error) {
      previousFailure = getErrorMessage(error);
      previousResponse = rawResponse;
      throw error;
    }
  };

  const repaired = await runWithAutoAdvanceFailureRetry(requestRepair, {
    requestLabel: '世界时间定向纠错',
    onRetry: ({ retryNumber, maxRetries, delayMs, error }) => {
      variableTraceLogger.warn('[worldTimeGuard] 定向纠错失败，准备重试', {
        retryNumber,
        maxRetries,
        delayMs,
        error: getErrorMessage(error),
      });
    },
  });
  const blocksText = serializeVariableBlocks(repaired.thoughts, repaired.changes);
  variableTraceLogger.log('[worldTimeGuard] 定向纠错已通过守卫校验', {
    originalError: initialGuard.reason,
    repairRawResponse: finalRawResponse,
    repairedChangeCount: repaired.changes.length,
  });
  return {
    ...repaired,
    blocksText,
    timeRepairAttempted: true,
    repairRawResponse: finalRawResponse,
  };
}

export async function validateOrRepairInlineWorldTimeReply({
  settings,
  rawReply,
}: {
  settings: SummarySettings;
  rawReply: string;
}): Promise<{ replyText: string; timeRepairAttempted: boolean; blocksText: string }> {
  const extracted = extractValidVariableBlocks(rawReply);
  const declaredState = parseDeclaredVariableChanges(extracted.blocksText);
  if (declaredState.parseErrors.length > 0) {
    throw new Error(`本回合变量动作块无法完整解析：${declaredState.parseErrors.join('；')}`);
  }
  if (declaredState.omittedDeclaredCount > 0) {
    throw new Error(`本回合变量声明超过可安全校验的上限。`);
  }
  const locationValidation = validateDeclaredLocations(declaredState.declaredChanges);
  if (locationValidation.rejected.length > 0) {
    throw new Error(
      `本回合包含非法地点修改：${locationValidation.rejected
        .map(item => `${item.path}（${item.reason}）`)
      .join('；')}`,
    );
  }
  const originalTimeChanges = declaredState.declaredChanges.filter(change => isWorldTimePath(change.path));
  if (originalTimeChanges.length === 0) {
    return { replyText: rawReply, timeRepairAttempted: false, blocksText: extracted.blocksText };
  }

  const latestAssistantBody = normalizeDisplayedMessageContent(stripEraVariableBlocksForPrompt(rawReply));
  const validated = await validateOrRepairWorldTimeDeclarations({
    settings,
    declaredChanges: declaredState.declaredChanges,
    thoughts: declaredState.thoughts,
    latestAssistantBody,
  });
  if (!validated.timeRepairAttempted) {
    return { replyText: rawReply, timeRepairAttempted: false, blocksText: extracted.blocksText };
  }
  const replyWithoutVariableBlocks = rawReply.replace(ERA_VARIABLE_BLOCK_STRIP_REGEX, '\n').trim();
  const replyText = [replyWithoutVariableBlocks, validated.blocksText].filter(Boolean).join('\n').trim();
  return { replyText, timeRepairAttempted: true, blocksText: validated.blocksText };
}

function assertVariableBlockTagsPreserved(originalResponse: string, repairedResponse: string): void {
  const changedTags = VARIABLE_BLOCK_TAGS.filter(blockTag => {
    const pattern = new RegExp(`<${blockTag}>`, 'gi');
    const originalCount = originalResponse.match(pattern)?.length ?? 0;
    const repairedCount = repairedResponse.match(pattern)?.length ?? 0;
    return originalCount !== repairedCount;
  });
  if (changedTags.length > 0) {
    throw new Error(`格式修复改变了变量块类型或数量：${changedTags.join('、')}，已拒绝修复结果。`);
  }
}

async function appendVariableBlocksToAssistantMessage(
  messageId: number,
  blocksText: string,
): Promise<MessageWriteVerification> {
  const { message: freshMessage, activeText, swipeId } = readAssistantMessageActiveText(messageId);
  const nextText = `${activeText.trimEnd()}\n${blocksText}`.trim();
  const swipes = Array.isArray(freshMessage.swipes) && freshMessage.swipes.length > 0 ? [...freshMessage.swipes] : null;

  const internalUpdateToken = beginInternalMessageUpdate(messageId);
  try {
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
  } finally {
    finishInternalMessageUpdate(internalUpdateToken);
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
      variableUpdateMode: 'extra',
      latestRawReplyLength: latestRawReply.length,
    });
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
        try {
          prevalidatedExtraction = extractValidVariableBlocks(rawResponse);
        } catch (error) {
          // JSON 语法错误不重新生成整份变量决策，留给后续专用格式修复请求处理。
          if (!(error instanceof VariableJsonSyntaxError)) throw error;
          prevalidatedExtraction = null;
        }
        if (!prevalidatedExtraction?.blocksText) {
          if (!/<Variable(?:Think|Insert|Edit|Delete)>/i.test(rawResponse)) {
            throw new Error('额外变量模型没有返回可识别的变量块');
          }
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
    let effectiveRawResponse = rawResponse;
    let formatRepairAttempted = false;
    let extracted: ReturnType<typeof extractValidVariableBlocks> | null = prevalidatedExtraction;
    if (!extracted) {
      const initialParse = await runPhase('parse-variable-response', () => {
        try {
          return { extracted: extractValidVariableBlocks(rawResponse), jsonSyntaxError: null };
        } catch (error) {
          if (error instanceof VariableJsonSyntaxError) {
            return { extracted: null, jsonSyntaxError: error };
          }
          throw error;
        }
      });
      extracted = initialParse.extracted;

      if (initialParse.jsonSyntaxError) {
        formatRepairAttempted = true;
        const repairPrompt = `你是变量块 JSON 格式修复器。下面返回中的 ${initialParse.jsonSyntaxError.blockTag} 存在 JSON 语法错误：${initialParse.jsonSyntaxError.jsonError}\n\n只修复 JSON 的括号、引号、逗号、转义或代码围栏格式；必须保持所有 VariableThink 语义、动作类型、变量路径、键名和值不变，不得新增、删除或重新判断任何变量。只输出修复后的完整变量块，不要解释。\n\n【待修复原文】\n${rawResponse}`;
        const repairedRawResponse = await runPhase('repair-variable-json-format', () =>
          requestConfiguredText({
            prompt: repairPrompt,
            settings: requestSettings,
            timeoutMs: EXTRA_VARIABLE_UPDATE_TIMEOUT_MS,
            shouldStream: false,
            generationIdPrefix: 'wuxia-variable-json-repair',
            skipWorldInfoAndAuthorNote: true,
          }),
        );
        effectiveRawResponse = repairedRawResponse;
        extracted = await runPhase('parse-repaired-variable-response', () => {
          try {
            assertVariableBlockTagsPreserved(rawResponse, repairedRawResponse);
            return extractValidVariableBlocks(repairedRawResponse);
          } catch (error) {
            throw new Error(`变量 JSON 格式修复后仍无法解析：${getErrorMessage(error)}`);
          }
        });
        variableTraceLogger.warn('[extraVariableUpdate] 已通过一次专用请求修复变量 JSON 格式', {
          assistantMessageId,
          originalRawResponse: rawResponse,
          repairedRawResponse,
        });
      }
    }

    if (!extracted) {
      throw new Error('额外变量模型没有返回可解析的变量块。');
    }
    const declaredState = parseDeclaredVariableChanges(extracted.blocksText);
    if (declaredState.parseErrors.length > 0) {
      throw new Error(`本回合变量动作块无法完整解析：${declaredState.parseErrors.join('；')}`);
    }
    if (declaredState.omittedDeclaredCount > 0) {
      throw new Error(
        `本回合变量声明超过可安全校验的上限，仍有 ${declaredState.omittedDeclaredCount} 条未纳入校验，已停止写入。`,
      );
    }
    const validation = await runPhase('validate-variable-actions', () =>
      validateDeclaredLocations(declaredState.declaredChanges),
    );
    if (validation.rejected.length > 0) {
      throw new Error(
        `本回合包含非法地点修改：${validation.rejected
          .map(item => `${item.path}（${item.reason}）`)
          .join('；')}`,
      );
    }
    const timeValidation = await runPhase('validate-or-repair-world-time', () =>
      validateOrRepairWorldTimeDeclarations({
        settings,
        declaredChanges: declaredState.declaredChanges,
        thoughts: declaredState.thoughts,
        latestAssistantBody: normalizeDisplayedMessageContent(stripEraVariableBlocksForPrompt(latestRawReply)),
      }),
    );
    const blocksText = timeValidation.blocksText;
    const actionBlockCount = timeValidation.changes.length;
    const diagnosticRawResponse = formatRepairAttempted
      ? `【原始返回（JSON 格式错误）】\n${rawResponse}\n\n【格式修复返回】\n${effectiveRawResponse}`
      : rawResponse;
    const rejectionSummary =
      validation.rejected.length > 0
        ? `已隔离 ${validation.rejected.length} 条非法动作：${validation.rejected
            .map(item => `${item.path}（${item.reason}）`)
            .join('；')}`
        : '';
    variableTraceLogger.log('[extraVariableUpdate] 变量块提取完成', {
      assistantMessageId,
      actionBlockCount,
      blocksTextLength: blocksText.length,
      blocksText,
      declaredChangeCount: declaredState.declaredChanges.length,
      declaredParseErrors: declaredState.parseErrors,
      rejectedActions: validation.rejected,
      timeRepairAttempted: timeValidation.timeRepairAttempted,
    });
    onProgress?.({
      prompt,
      rawResponse: diagnosticRawResponse,
      appendedBlocks: blocksText,
      actionBlockCount,
      rejectedActions: validation.rejected,
      formatRepairAttempted,
      timeRepairAttempted: timeValidation.timeRepairAttempted,
    });

    if (actionBlockCount === 0) {
      variableTraceLogger.log('[extraVariableUpdate] 没有可写入的合法动作块，跳过 ERA 同步', {
        assistantMessageId,
        actionBlockCount,
      });
      return {
        appended: false,
        actionBlockCount,
        prompt,
        rawResponse: diagnosticRawResponse,
        retry429Count,
        retry429LastDelayMs,
        retryFailureCount,
        retryFailureLastDelayMs,
        rejectedActions: validation.rejected,
        formatRepairAttempted,
        timeRepairAttempted: timeValidation.timeRepairAttempted,
      };
    }

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
      rawResponse: diagnosticRawResponse,
      appendedBlocks: blocksText,
      finalMessageText: appendVerification.readbackText,
      appendReadbackText: appendVerification.readbackText,
      appendVerification: appendVerification.verification,
      applyStatus: 'waiting-write-done',
      applyVerification: ['变量块已追加，正在等待匹配的 ERA 原始写入完成信号。', rejectionSummary]
        .filter(Boolean)
        .join('\n'),
      rejectedActions: validation.rejected,
      formatRepairAttempted,
      timeRepairAttempted: timeValidation.timeRepairAttempted,
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
        applyVerification: ['ERA 已返回匹配的写入完成信号，正在回读聊天级 stat_data。', rejectionSummary]
          .filter(Boolean)
          .join('\n'),
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
      verifyDeclaredChangesAfterEraWrite(timeValidation.changes),
    );
    const applyStatus: ExtraVariableApplyStatus = persistenceVerification.verified ? 'success' : 'error';
    onProgress?.({
      applyStatus,
      applyVerification: [persistenceVerification.verification, rejectionSummary].filter(Boolean).join('\n'),
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
      rawResponse: diagnosticRawResponse,
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
      applyVerification: [persistenceVerification.verification, rejectionSummary].filter(Boolean).join('\n'),
      rejectedActions: validation.rejected,
      formatRepairAttempted,
      timeRepairAttempted: timeValidation.timeRepairAttempted,
    };
  } finally {
    variableTraceLogger.log('[extraVariableUpdate] 本轮额外变量更新结束', { assistantMessageId });
    finishExtraVariableUpdate();
  }
}
