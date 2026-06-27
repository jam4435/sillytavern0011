import {
  DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE,
  type SummarySettings,
  type SummaryVariableUpdateMode,
} from './settingsManager';
import { emitSourcedEraVariableWriteAndWait } from '../../shared/directVariableWrite';
import { requestConfiguredText, resolveConfiguredTextSettings, validateSummaryApiConfig } from './summaryApiClient';
import { dataLogger, variableTraceLogger } from './logger';
import { isFrontendLoaderOnlyMessage, normalizeDisplayedMessageContent } from './variableReader';
import { buildDynamicLocationConstraintPrompt } from './locationContext';

const VARIABLE_GUIDANCE_ENTRY_NAME = '变量指导';
const OUTPUT_PROMPT_ENTRY_NAME = '输出提示词';
const SNAPSHOT_STORAGE_KEY = 'wuxia_extra_variable_guidance_snapshot';
const EXTRA_VARIABLE_UPDATE_TIMEOUT_MS = 360000;
const ERA_SYNC_TIMEOUT_MS = 20000;
const MAX_CONTEXT_BODY_MESSAGES = 5;

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

type VariableGuidanceSnapshot = {
  worldbookName: string;
  uid: number;
  name: string;
  wasEnabled: boolean;
  savedAt: number;
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
};

export type ExtraVariableUpdateProgress = Partial<ExtraVariableUpdateResult>;

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
const ACTION_BLOCK_TAGS = new Set(['VariableInsert', 'VariableEdit', 'VariableDelete']);
const HIDDEN_VARIABLE_KEYS = new Set(['$meta', '$template']);
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

function normalizeBodyMessageForPrompt(rawText: string): string {
  return stripEraVariableBlocksForPrompt(normalizeDisplayedMessageContent(stripEraVariableBlocksForPrompt(rawText)))
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

function readGuidanceSnapshot(): VariableGuidanceSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<VariableGuidanceSnapshot>;
    if (
      typeof parsed.worldbookName === 'string' &&
      typeof parsed.uid === 'number' &&
      typeof parsed.name === 'string' &&
      typeof parsed.wasEnabled === 'boolean'
    ) {
      return {
        worldbookName: parsed.worldbookName,
        uid: parsed.uid,
        name: parsed.name,
        wasEnabled: parsed.wasEnabled,
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
      };
    }
  } catch (error) {
    dataLogger.warn('读取变量指导世界书快照失败:', error);
  }
  return null;
}

function writeGuidanceSnapshot(snapshot: VariableGuidanceSnapshot): void {
  localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
}

function clearGuidanceSnapshot(): void {
  localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
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

async function ensureVariableGuidanceDisabled(): Promise<VariableGuidanceSnapshot> {
  const location = await findWorldbookEntryByExactName(VARIABLE_GUIDANCE_ENTRY_NAME);
  if (!location) {
    throw new Error(`未找到当前角色世界书中的精确条目「${VARIABLE_GUIDANCE_ENTRY_NAME}」。`);
  }

  const existingSnapshot = readGuidanceSnapshot();
  const canReuseSnapshot =
    existingSnapshot?.worldbookName === location.worldbookName && existingSnapshot.name === location.entry.name;
  const snapshot = canReuseSnapshot
    ? { ...existingSnapshot, uid: location.entry.uid }
    : {
        worldbookName: location.worldbookName,
        uid: location.entry.uid,
        name: location.entry.name,
        wasEnabled: location.entry.enabled,
        savedAt: Date.now(),
      };
  if (existingSnapshot && !canReuseSnapshot) {
    dataLogger.warn('检测到不属于当前变量指导条目的旧快照，已用当前条目状态替换。', {
      oldSnapshot: existingSnapshot,
      currentWorldbookName: location.worldbookName,
      currentUid: location.entry.uid,
      currentName: location.entry.name,
    });
  }
  writeGuidanceSnapshot(snapshot);

  if (location.entry.enabled) {
    await setWorldbookEntryEnabled(location.worldbookName, location.entry.uid, location.entry.name, false);
  }

  return snapshot;
}

async function restoreVariableGuidanceFromSnapshot(): Promise<string> {
  const snapshot = readGuidanceSnapshot();
  if (!snapshot) {
    return `未找到已记录的「${VARIABLE_GUIDANCE_ENTRY_NAME}」原始状态，无需恢复。`;
  }

  const restored = await setWorldbookEntryEnabled(
    snapshot.worldbookName,
    snapshot.uid,
    snapshot.name,
    snapshot.wasEnabled,
  );
  if (!restored) {
    throw new Error(`无法在世界书「${snapshot.worldbookName}」中找到要恢复的「${snapshot.name}」条目。`);
  }
  if (restored === 'name') {
    dataLogger.warn(`变量指导条目 uid 已变化，已按名称在世界书「${snapshot.worldbookName}」中完成恢复。`, {
      snapshotUid: snapshot.uid,
      entryName: snapshot.name,
    });
  }

  clearGuidanceSnapshot();
  return snapshot.wasEnabled
    ? `已恢复「${VARIABLE_GUIDANCE_ENTRY_NAME}」为启用。`
    : `已恢复「${VARIABLE_GUIDANCE_ENTRY_NAME}」为原本的禁用状态。`;
}

export async function applyVariableUpdateModeWorldbookState(mode: SummaryVariableUpdateMode): Promise<string> {
  if (mode === 'extra') {
    await ensureVariableGuidanceDisabled();
    return `已禁用当前角色世界书中的「${VARIABLE_GUIDANCE_ENTRY_NAME}」，之后将额外调用模型更新变量。`;
  }
  return restoreVariableGuidanceFromSnapshot();
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
    await ensureVariableGuidanceDisabled();
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

function hasUnrenderedTemplateMarkup(text: string): boolean {
  return /<%|%>|{{\s*(?:ERA:|user|char|lastMessageId|lastMessage|time|date)\b/i.test(text);
}

async function renderOutputPromptContext(assistantMessageId: number): Promise<string> {
  const rawOutputPrompt = await readWorldbookEntryContent(OUTPUT_PROMPT_ENTRY_NAME);
  try {
    if (
      typeof EjsTemplate === 'undefined' ||
      typeof EjsTemplate.prepareContext !== 'function' ||
      typeof EjsTemplate.evaltemplate !== 'function'
    ) {
      throw new Error('当前环境没有可用的 EjsTemplate。');
    }

    const context = await EjsTemplate.prepareContext({}, assistantMessageId);
    let rendered = await EjsTemplate.evaltemplate(rawOutputPrompt, context);

    if (typeof substitudeMacros === 'function') {
      rendered = substitudeMacros(rendered);
    }
    if (typeof formatAsTavernRegexedString === 'function') {
      rendered = formatAsTavernRegexedString(rendered, 'world_info', 'prompt', { depth: 0 });
    }

    if (!rendered.trim() || hasUnrenderedTemplateMarkup(rendered)) {
      throw new Error('输出提示词渲染后仍包含未处理的模板标记。');
    }

    const sanitizedRendered = stripEraVariableBlocksForPrompt(rendered.trim());
    if (!sanitizedRendered) {
      throw new Error('输出提示词渲染内容清洗后为空。');
    }

    return sanitizedRendered;
  } catch (error) {
    dataLogger.warn('渲染输出提示词失败，改用前端变量快照:', error);
    return buildFallbackVariableSnapshot(assistantMessageId);
  }
}

function sanitizeForPrompt(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return '[超过最大深度]';
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeForPrompt(item, depth + 1));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>((result, [key, childValue]) => {
    if (HIDDEN_VARIABLE_KEYS.has(key)) {
      return result;
    }
    result[key] = sanitizeForPrompt(childValue, depth + 1);
    return result;
  }, {});
}

function getNestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function getFirstStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function collectSameSceneCharacters(
  statData: Record<string, unknown>,
  playerLocation: string,
): Record<string, unknown> {
  const characters = getNestedRecord(statData, '角色数据');
  if (!characters || !playerLocation) {
    return {};
  }

  return Object.entries(characters).reduce<Record<string, unknown>>((result, [name, character]) => {
    if (HIDDEN_VARIABLE_KEYS.has(name) || !isRecord(character)) {
      return result;
    }

    const characterLocation = getFirstStringValue(
      character.当前位置,
      character.所在位置,
      character.位置,
      character.地点,
    );
    if (characterLocation === playerLocation) {
      result[name] = sanitizeForPrompt(character);
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

function buildFallbackVariableSnapshot(assistantMessageId: number): string {
  const variables = readAllVariablesSnapshot(assistantMessageId);
  const statDataSource = isRecord(variables.stat_data) ? variables.stat_data : variables;
  const statData = sanitizeForPrompt(statDataSource) as Record<string, unknown>;
  const userData: Record<string, unknown> =
    getNestedRecord(statData, 'user数据') || getNestedRecord(statData, '玩家数据') || {};
  const playerLocation = getFirstStringValue(
    userData.当前位置,
    userData.所在位置,
    userData.位置,
    userData.地点,
    statData.当前位置,
    statData.地点,
  );

  const snapshot = {
    世界信息: statData.世界信息 ?? variables.世界信息 ?? null,
    user数据: userData,
    参与事件: statData.参与事件 ?? null,
    后续事件线索: statData.后续事件线索 ?? null,
    附近传闻: statData.附近传闻 ?? null,
    角色数据: collectSameSceneCharacters(statData, playerLocation),
  };

  return [
    '以下为前端构造的当前变量快照。键名为实际 ERA 根路径；角色数据仅包含同场景角色。',
    JSON.stringify(snapshot, null, 2),
  ].join('\n');
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

function containsAppendedBlocks(readbackText: string, blocksText: string): boolean {
  return normalizeNewlines(readbackText).includes(normalizeNewlines(blocksText));
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

function getRecentBodyMessages(targetMessageId: number, latestRawReply: string): string {
  const messages = getChatMessages('0-{{lastMessageId}}', {
    role: 'assistant',
    hide_state: 'unhidden',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];

  const bodies = messages
    .map(message => {
      const rawText =
        message.message_id === targetMessageId && latestRawReply.trim()
          ? latestRawReply
          : getActiveMessageText(message);
      if (!rawText.trim() || isFrontendLoaderOnlyMessage(rawText)) {
        return null;
      }
      const normalized = normalizeBodyMessageForPrompt(rawText);
      if (!normalized) {
        return null;
      }
      return {
        messageId: message.message_id,
        text: normalized,
      };
    })
    .filter((item): item is { messageId: number; text: string } => item !== null)
    .slice(-MAX_CONTEXT_BODY_MESSAGES);

  if (bodies.length === 0 && latestRawReply.trim()) {
    return `#${targetMessageId}\n${normalizeBodyMessageForPrompt(latestRawReply)}`;
  }

  return bodies.map(item => `#${item.messageId}\n${item.text}`).join('\n\n---\n\n');
}

function renderVariablePromptTemplate(
  template: string,
  values: {
    recentBodies: string;
    variableContext: string;
    variableGuidance: string;
    locationContext: string;
  },
): string {
  const sourceTemplate = template.trim() ? template : DEFAULT_VARIABLE_UPDATE_PROMPT_TEMPLATE;
  return sourceTemplate
    .replace(/\{\{recentBodies\}\}/g, values.recentBodies)
    .replace(/\{\{variableContext\}\}/g, values.variableContext)
    .replace(/\{\{variableGuidance\}\}/g, values.variableGuidance)
    .replace(/\{\{locationContext\}\}/g, values.locationContext);
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
  const [variableGuidance, renderedOutputPromptContext, locationConstraintPrompt] = await Promise.all([
    readWorldbookEntryContent(VARIABLE_GUIDANCE_ENTRY_NAME),
    renderOutputPromptContext(assistantMessageId),
    buildDynamicLocationConstraintPrompt(),
  ]);
  const recentBodies = getRecentBodyMessages(assistantMessageId, latestRawReply);

  return renderVariablePromptTemplate(settings.variablePromptTemplate, {
    recentBodies: recentBodies || '(无可用正文)',
    variableContext: renderedOutputPromptContext,
    variableGuidance,
    locationContext: locationConstraintPrompt,
  });
}

function extractValidVariableBlocks(rawResponse: string): {
  blocksText: string;
  actionBlockCount: number;
} {
  const blocks: string[] = [];
  let actionBlockCount = 0;

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
  onPromptBuilt,
  onProgress,
}: {
  settings: SummarySettings;
  assistantMessageId: number;
  latestRawReply: string;
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
  try {
    variableTraceLogger.log('[extraVariableUpdate] 开始执行额外变量更新', {
      assistantMessageId,
      variableUpdateMode: settings.variableUpdateMode,
      latestRawReplyLength: latestRawReply.length,
    });
    await ensureVariableGuidanceDisabled();
    const requestSettings = resolveConfiguredTextSettings(settings, 'variable');
    const prompt = await buildExtraVariableUpdatePrompt({ settings, assistantMessageId, latestRawReply });
    onPromptBuilt?.(prompt);
    onProgress?.({ prompt });
    variableTraceLogger.log('[extraVariableUpdate] 额外变量提示词已构建', {
      assistantMessageId,
      promptLength: prompt.length,
      prompt,
    });
    const rawResponse = await requestConfiguredText({
      prompt,
      settings: requestSettings,
      timeoutMs: EXTRA_VARIABLE_UPDATE_TIMEOUT_MS,
      shouldStream: false,
      generationIdPrefix: 'wuxia-variable-update',
      skipWorldInfoAndAuthorNote: true,
    });
    variableTraceLogger.log('[extraVariableUpdate] 额外模型已返回', {
      assistantMessageId,
      rawResponseLength: rawResponse.length,
      rawResponse,
    });
    onProgress?.({ prompt, rawResponse });
    const { blocksText, actionBlockCount } = extractValidVariableBlocks(rawResponse);
    variableTraceLogger.log('[extraVariableUpdate] 变量块提取完成', {
      assistantMessageId,
      actionBlockCount,
      blocksTextLength: blocksText.length,
      blocksText,
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
      };
    }

    const appendVerification = await appendVariableBlocksToAssistantMessage(assistantMessageId, blocksText);
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
      const eraWriteResult = await emitSourcedEraVariableWriteAndWait({
        source: 'frontend',
        operation: 'update',
        reason: 'extra-variable-api-write',
        eventName: 'era:apiWrite',
        attribution: 'ai',
        timeoutMs: ERA_SYNC_TIMEOUT_MS,
        timeoutMessage: 'ERA 没有响应 era:apiWrite，额外变量更新已停止。',
        expectedMessageId: assistantMessageId,
        expectedAction: 'apiWrite',
      });
      variableTraceLogger.log('[extraVariableUpdate] 收到匹配的 ERA 同步完成信号', {
        assistantMessageId,
        actionBlockCount,
        matchedMessageId: eraWriteResult.message_id ?? null,
        matchedActions: eraWriteResult.actions,
      });
    } catch (error) {
      variableTraceLogger.error('[extraVariableUpdate] 等待 ERA 同步失败', {
        assistantMessageId,
        actionBlockCount,
        error,
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

    const syncReadback = readAssistantMessageActiveText(assistantMessageId);
    const syncVerification = createWriteVerification({
      messageId: assistantMessageId,
      swipeId: syncReadback.swipeId,
      beforeText: appendVerification.beforeText,
      attemptedText: appendVerification.attemptedText,
      readbackText: syncReadback.activeText,
      blocksText,
      stage: 'ERA 同步后',
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
    };
  } finally {
    variableTraceLogger.log('[extraVariableUpdate] 本轮额外变量更新结束', { assistantMessageId });
    finishExtraVariableUpdate();
  }
}
