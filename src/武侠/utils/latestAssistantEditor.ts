import { emitEraEventAndWait } from './eraWriteWait';
import {
  flushPendingGameDataCompletion,
  isFrontendLoaderOnlyMessage,
  normalizeDisplayedMessageContent,
} from './variableReader';
import { parseDeclaredVariableChanges, stableStringify } from './variableChanges';

type ChatRole = 'system' | 'assistant' | 'user';

type AssistantMessageWithSwipes = {
  message_id: number;
  role: ChatRole;
  is_hidden?: boolean;
  message?: string;
  data?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  swipes?: string[];
  swipes_data?: Record<string, unknown>[];
  swipes_info?: Record<string, unknown>[];
  swipe_id?: number;
};

export interface LatestAssistantEditorMetadata {
  readonly data: Record<string, unknown>;
  readonly extra: Record<string, unknown>;
  readonly swipesData: Record<string, unknown>[];
  readonly swipesInfo: Record<string, unknown>[];
  readonly swipeCount: number;
}

/** A stable edit target captured when the editor is opened. */
export interface LatestAssistantSnapshot {
  readonly chatId: string;
  readonly messageId: number;
  readonly swipeId: number;
  readonly rawText: string;
  /** The compatibility `message` mirror must not change behind an open editor. */
  readonly messageMirrorText: string;
  readonly hasSwipes: boolean;
  readonly metadata: LatestAssistantEditorMetadata;
}

export interface LatestAssistantSaveResult {
  readonly snapshot: LatestAssistantSnapshot;
  readonly finalText: string;
  readonly variableActionsChanged: boolean;
}

export interface LatestAssistantSaveOptions {
  eraSyncTimeoutMs?: number;
}

export class LatestAssistantEditorConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LatestAssistantEditorConflictError';
  }
}

export class LatestAssistantEraDataProtectedError extends Error {
  constructor() {
    super('不能修改 <era_data> 系统元数据；请保留它的原始内容。');
    this.name = 'LatestAssistantEraDataProtectedError';
  }
}

export class LatestAssistantVariableBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LatestAssistantVariableBlockError';
  }
}

/** The attempted rollback could not be confirmed, so the current chat text is uncertain. */
export class LatestAssistantRollbackUncertainError extends Error {
  constructor(message: string, readonly causeError: unknown) {
    super(message);
    this.name = 'LatestAssistantRollbackUncertainError';
  }
}

const ERA_DATA_BLOCK_REGEX = /<era_data>[\s\S]*?<\/era_data>/gi;
const ERA_DATA_OPEN_TAG_REGEX = /<era_data>/gi;
const ERA_DATA_CLOSE_TAG_REGEX = /<\/era_data>/gi;
const VARIABLE_ACTION_OPEN_TAG_REGEX = /<Variable(?:Insert|Edit|Delete)>/gi;
const VARIABLE_ACTION_CLOSE_TAG_REGEX = /<\/Variable(?:Insert|Edit|Delete)>/gi;
const VARIABLE_ACTION_BLOCK_REGEX = /<(VariableInsert|VariableEdit|VariableDelete)>[\s\S]*?<\/\1>/gi;

function cloneForReadonly<T>(value: T, fallback: T): T {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback)) as T;
  } catch {
    return fallback;
  }
}

function readCurrentChatId(): string {
  return String(SillyTavern.getCurrentChatId?.() ?? '').trim();
}

function getSafeSwipeId(message: AssistantMessageWithSwipes): number {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length === 0) return 0;
  const requested = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return Math.max(0, Math.min(requested, swipes.length - 1));
}

/** The active swipe is authoritative; do not fall back to an inactive swipe. */
function getActiveRawText(message: AssistantMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length > 0) {
    return swipes[getSafeSwipeId(message)] ?? '';
  }
  return message.message || '';
}

function isValidLatestAssistant(message: AssistantMessageWithSwipes | undefined): message is AssistantMessageWithSwipes {
  if (!message || message.role !== 'assistant' || message.is_hidden === true) return false;
  const rawText = getActiveRawText(message);
  return Boolean(rawText.trim())
    && !isFrontendLoaderOnlyMessage(rawText)
    && normalizeDisplayedMessageContent(rawText).trim().length > 0;
}

function readVisibleMessages(): AssistantMessageWithSwipes[] {
  return getChatMessages('0-{{lastMessageId}}', {
    role: 'all',
    hide_state: 'unhidden',
    include_swipes: true,
  }) as AssistantMessageWithSwipes[];
}

function getLatestMessage(): AssistantMessageWithSwipes | null {
  const messages = readVisibleMessages().filter(message => message.is_hidden !== true);
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

function snapshotFromMessage(message: AssistantMessageWithSwipes): LatestAssistantSnapshot {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  return {
    chatId: readCurrentChatId(),
    messageId: message.message_id,
    swipeId: getSafeSwipeId(message),
    rawText: getActiveRawText(message),
    messageMirrorText: message.message || '',
    hasSwipes: swipes.length > 0,
    metadata: {
      data: cloneForReadonly(message.data, {}),
      extra: cloneForReadonly(message.extra, {}),
      swipesData: cloneForReadonly(message.swipes_data, []),
      swipesInfo: cloneForReadonly(message.swipes_info, []),
      swipeCount: swipes.length,
    },
  };
}

/**
 * Returns the only editable target: the final unhidden chat message must be a
 * non-loader assistant reply. A trailing user message intentionally disables editing.
 */
export function readLatestAssistantSnapshot(): LatestAssistantSnapshot | null {
  const latest = getLatestMessage();
  return isValidLatestAssistant(latest) ? snapshotFromMessage(latest) : null;
}

function requireCurrentSnapshot(snapshot: LatestAssistantSnapshot): AssistantMessageWithSwipes {
  if (readCurrentChatId() !== snapshot.chatId) {
    throw new LatestAssistantEditorConflictError('聊天已切换，不能覆盖另一段对话的最新回复。');
  }

  const current = readLatestAssistantSnapshot();
  if (!current) {
    throw new LatestAssistantEditorConflictError('最新楼层已不再是可编辑的 assistant 回复。');
  }

  if (
    current.messageId !== snapshot.messageId
    || current.swipeId !== snapshot.swipeId
    || current.rawText !== snapshot.rawText
    || current.messageMirrorText !== snapshot.messageMirrorText
    || current.hasSwipes !== snapshot.hasSwipes
  ) {
    throw new LatestAssistantEditorConflictError('最新回复在编辑期间已经变化，请重新载入后再保存。');
  }

  const latest = getLatestMessage();
  if (!latest) {
    throw new LatestAssistantEditorConflictError('找不到要覆盖的最新回复。');
  }
  return latest;
}

function extractEraDataBlocks(text: string): string[] {
  ERA_DATA_BLOCK_REGEX.lastIndex = 0;
  return Array.from(text.matchAll(ERA_DATA_BLOCK_REGEX), match => match[0]);
}

function assertEraDataUnchanged(before: string, after: string): void {
  const beforeOpenCount = countMatches(before, ERA_DATA_OPEN_TAG_REGEX);
  const beforeCloseCount = countMatches(before, ERA_DATA_CLOSE_TAG_REGEX);
  const afterOpenCount = countMatches(after, ERA_DATA_OPEN_TAG_REGEX);
  const afterCloseCount = countMatches(after, ERA_DATA_CLOSE_TAG_REGEX);
  if (beforeOpenCount !== beforeCloseCount || afterOpenCount !== afterCloseCount) {
    throw new LatestAssistantEraDataProtectedError();
  }
  if (stableStringify(extractEraDataBlocks(before)) !== stableStringify(extractEraDataBlocks(after))) {
    throw new LatestAssistantEraDataProtectedError();
  }
}

function countMatches(text: string, regex: RegExp): number {
  regex.lastIndex = 0;
  return Array.from(text.matchAll(regex)).length;
}

function getVariableActionSignature(text: string): string {
  const opened = countMatches(text, VARIABLE_ACTION_OPEN_TAG_REGEX);
  const closed = countMatches(text, VARIABLE_ACTION_CLOSE_TAG_REGEX);
  const paired = countMatches(text, VARIABLE_ACTION_BLOCK_REGEX);
  if (opened !== closed || opened !== paired) {
    throw new LatestAssistantVariableBlockError('变量动作标签不完整，无法保存。');
  }

  const parsed = parseDeclaredVariableChanges(text);
  if (parsed.parseErrors.length > 0) {
    throw new LatestAssistantVariableBlockError(parsed.parseErrors.join('；'));
  }

  return stableStringify(
    parsed.declaredChanges.map(change => ({
      action: change.action,
      blockTag: change.blockTag,
      path: change.path,
      value: change.value,
    })),
  );
}

function writeRawText(
  message: AssistantMessageWithSwipes,
  text: string,
  messageMirrorText: string = text,
): Promise<void> {
  const swipes = Array.isArray(message.swipes) ? [...message.swipes] : [];
  if (swipes.length === 0) {
    return setChatMessages([{ message_id: message.message_id, message: messageMirrorText }], { refresh: 'none' });
  }

  const swipeId = getSafeSwipeId(message);
  swipes[swipeId] = text;
  return setChatMessages(
    [
      {
        message_id: message.message_id,
        message: messageMirrorText,
        swipe_id: swipeId,
        swipes,
      },
    ],
    { refresh: 'none' },
  );
}

function readMessageById(messageId: number): AssistantMessageWithSwipes {
  const [message] = getChatMessages(messageId, {
    hide_state: 'all',
    include_swipes: true,
  }) as AssistantMessageWithSwipes[];
  if (!message) {
    throw new Error(`找不到最新回复 #${messageId}。`);
  }
  return message;
}

function assertWrittenText(
  messageId: number,
  swipeId: number,
  text: string,
  messageMirrorText: string = text,
): AssistantMessageWithSwipes {
  const readback = readMessageById(messageId);
  if (
    getSafeSwipeId(readback) !== swipeId
    || getActiveRawText(readback) !== text
    || readback.message !== messageMirrorText
  ) {
    throw new Error(`最新回复 #${messageId} 写入后回读不一致。`);
  }
  return readback;
}

function canSafelyRollback(snapshot: LatestAssistantSnapshot, expectedDraft: string): AssistantMessageWithSwipes | null {
  if (readCurrentChatId() !== snapshot.chatId) return null;
  try {
    const message = readMessageById(snapshot.messageId);
    return getSafeSwipeId(message) === snapshot.swipeId
      && getActiveRawText(message) === expectedDraft
      && message.message === expectedDraft
      ? message
      : null;
  } catch {
    return null;
  }
}

function isOriginalSnapshotState(message: AssistantMessageWithSwipes, snapshot: LatestAssistantSnapshot): boolean {
  const hasSwipes = Array.isArray(message.swipes) && message.swipes.length > 0;
  return getSafeSwipeId(message) === snapshot.swipeId
    && getActiveRawText(message) === snapshot.rawText
    && (message.message || '') === snapshot.messageMirrorText
    && hasSwipes === snapshot.hasSwipes;
}

async function writeDraftWithRecovery(
  currentMessage: AssistantMessageWithSwipes,
  snapshot: LatestAssistantSnapshot,
  draftText: string,
): Promise<void> {
  try {
    await writeRawText(currentMessage, draftText);
    assertWrittenText(snapshot.messageId, snapshot.swipeId, draftText);
  } catch (error) {
    let readback: AssistantMessageWithSwipes;
    try {
      readback = readMessageById(snapshot.messageId);
    } catch (readError) {
      throw new LatestAssistantRollbackUncertainError(
        `最新回复写入失败，且无法读取当前楼层状态：${readError instanceof Error ? readError.message : String(readError)}`,
        error,
      );
    }

    if (isOriginalSnapshotState(readback, snapshot)) {
      throw error;
    }

    const rollbackTarget = canSafelyRollback(snapshot, draftText);
    if (!rollbackTarget) {
      throw new LatestAssistantRollbackUncertainError(
        '最新回复写入未能确认，且楼层只完成了部分改动或已被其他操作改变，未自动覆盖当前内容。',
        error,
      );
    }

    try {
      await writeRawText(rollbackTarget, snapshot.rawText, snapshot.messageMirrorText);
      assertWrittenText(snapshot.messageId, snapshot.swipeId, snapshot.rawText, snapshot.messageMirrorText);
    } catch (rollbackError) {
      throw new LatestAssistantRollbackUncertainError(
        `最新回复写入未能确认，自动恢复也失败：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        error,
      );
    }

    throw new Error(`最新回复写入失败，已恢复保存前内容：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function rollbackAfterEraFailure(
  snapshot: LatestAssistantSnapshot,
  draftText: string,
  timeoutMs: number | undefined,
  originalError: unknown,
): Promise<never> {
  const rollbackTarget = canSafelyRollback(snapshot, draftText);
  if (!rollbackTarget) {
    throw new LatestAssistantRollbackUncertainError(
      'ERA 同步失败，且最新回复已被其他操作改变，未自动回滚以免覆盖新内容。',
      originalError,
    );
  }

  try {
    await writeRawText(rollbackTarget, snapshot.rawText, snapshot.messageMirrorText);
    assertWrittenText(snapshot.messageId, snapshot.swipeId, snapshot.rawText, snapshot.messageMirrorText);
    await emitEraEventAndWait('manual_sync', {
      timeoutMs,
      timeoutMessage: '编辑回滚已写回，但 ERA 没有确认变量恢复。',
      expectedMessageId: snapshot.messageId,
      expectedAction: 'resync',
    });
  } catch (rollbackError) {
    throw new LatestAssistantRollbackUncertainError(
      `ERA 同步失败，自动回滚也未能确认：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      originalError,
    );
  }

  throw new Error(
    `ERA 同步失败，已恢复保存前的最新回复：${originalError instanceof Error ? originalError.message : String(originalError)}`,
  );
}

/**
 * Atomically overwrite a snapshot's active swipe without rendering Tavern's
 * message shell. Variable-action changes are followed by a full ERA resync.
 */
export async function saveLatestAssistantSnapshot(
  snapshot: LatestAssistantSnapshot,
  draftText: string,
  options: LatestAssistantSaveOptions = {},
): Promise<LatestAssistantSaveResult> {
  if (!draftText.trim()) {
    throw new Error('最新回复不能为空。');
  }

  await flushPendingGameDataCompletion('before-latest-assistant-edit');
  const currentMessage = requireCurrentSnapshot(snapshot);
  assertEraDataUnchanged(snapshot.rawText, draftText);
  const beforeVariableSignature = getVariableActionSignature(snapshot.rawText);
  const afterVariableSignature = getVariableActionSignature(draftText);
  const variableActionsChanged = beforeVariableSignature !== afterVariableSignature;

  await writeDraftWithRecovery(currentMessage, snapshot, draftText);

  if (variableActionsChanged) {
    try {
      await emitEraEventAndWait('manual_sync', {
        timeoutMs: options.eraSyncTimeoutMs,
        timeoutMessage: '最新回复已写入，但 ERA 没有确认变量同步。',
        expectedMessageId: snapshot.messageId,
        expectedAction: 'resync',
      });
    } catch (error) {
      await rollbackAfterEraFailure(snapshot, draftText, options.eraSyncTimeoutMs, error);
    }
  }

  const finalText = getActiveRawText(readMessageById(snapshot.messageId));
  const result: LatestAssistantSaveResult = { snapshot, finalText, variableActionsChanged };
  return result;
}
