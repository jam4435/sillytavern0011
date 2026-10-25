import { z } from 'zod';
import { recordEraDiagnostic } from '../../ERA变量框架/utils/diagnostics';
import { recordHistoryBranchMkAudit } from '../../shared/historyBranchMkAudit';
import { recordHistoryEventForensics, snapshotHistoryEventForensics } from '../../shared/historyEventForensics';
import { captureHistoryEventRoots, HISTORY_EVENT_ROOTS, loadHistoryEventSnapshot, saveHistoryEventSnapshot } from './historyEventSnapshot';
import { describeHistoryMkDifferences, loadHistoryMkSnapshot, saveHistoryMkSnapshot } from './historyMkSnapshot';
import {
  clearHistoryCheckoutJournal,
  clearHistoryCheckoutReturnIntent,
  createHistoryCheckoutJournal,
  isHistoryCheckoutJournalExpired,
  isHistoryCheckoutPending,
  notifyHistoryCheckoutCommit,
  notifyHistoryCheckoutExpired,
  notifyHistoryCheckoutFailure,
  readHistoryCheckoutJournal,
  readHistoryCheckoutReturnIntent,
  renewHistoryCheckoutJournal,
  updateHistoryCheckoutJournal,
  writeHistoryCheckoutDraft,
  writeHistoryCheckoutReturnIntent,
  HISTORY_CHECKOUT_COMMIT_EVENT,
  HISTORY_CHECKOUT_STATE_EVENT,
  type HistoryCheckoutJournal,
} from '../../shared/historyCheckoutJournal';
import { isChatRenamePending } from '../../shared/chatRenameJournal';
import type {
  GameState,
  HistoryBranch,
  HistoryLocator,
  HistoryNode,
  WuxiaHistoryTreeV2,
  WuxiaSaveNode,
  WuxiaSaveTreeData,
} from '../types';
import {
  flushPendingGameDataCompletion,
  isFrontendLoaderOnlyMessage,
  normalizeDisplayedMessageContent,
} from './variableReader';

export const WUXIA_HISTORY_TREE_V2_KEY = 'wuxia_history_tree_v2';
export const WUXIA_HISTORY_TREE_UPDATED_EVENT = 'wuxia:history-tree-updated';
export const WUXIA_HISTORY_PREPARE_VERIFICATION_EVENT = 'wuxia:history-checkout-prepare-verification';
export { HISTORY_CHECKOUT_COMMIT_EVENT, HISTORY_CHECKOUT_STATE_EVENT, isHistoryCheckoutPending };

export type CheckoutActionKind = 'existing_branch' | 'in_place_swipe' | 'fork_branch';

/**
 * 只用于故障取证，不是恢复 journal，也不参与发送/分叉锁定。
 * journal 建立前的异常同样必须有可跨 iframe 重载读取的原始诊断。
 */
export const WUXIA_HISTORY_CHECKOUT_LAST_FAILURE_KEY = 'wuxia_history_checkout_last_failure_v1';
/** 旧节点验证基准受控修复：来源证据按事务存储，审计始终保留旧指纹。 */
export const WUXIA_HISTORY_REPAIR_AUDIT_KEY = 'wuxia_history_verification_repair_audit_v1';
/** 玩家明确允许事件状态不精确时，仅记录分支级降级审计，不修改共享节点原指纹。 */
export const WUXIA_HISTORY_DEGRADED_AUDIT_KEY = 'wuxia_history_checkout_degraded_audit_v1';
const HISTORY_REPAIR_WITNESS_PREFIX = 'wuxia_history_source_mk_witness_v1_';
const WUXIA_HISTORY_IDENTITY_ALIAS_AUDIT_KEY = 'wuxia_history_identity_alias_audit_v1';

interface HistorySourceMkWitness {
  version: 1;
  transactionId: string;
  targetNodeId: string;
  sourceChatId: string;
  targetMessageId: number;
  targetSwipeId: number;
  originalSelectedMksHash: string;
  eventStateHash: string;
  alignedPrefixHash: string;
  targetMk: string | null;
  createdAt: number;
}


const HistoryCheckoutFailureDiagnosticSchema = z.object({
  occurredAt: z.number().finite(),
  nodeId: z.string(),
  actionKind: z.enum(['existing_branch', 'in_place_swipe', 'fork_branch']),
  step: z.string(),
  journalStage: z.string().nullable(),
  summary: z.string(),
  originalError: z.string(),
  details: z.string(),
}).strict();

export type HistoryCheckoutFailureDiagnostic = z.infer<typeof HistoryCheckoutFailureDiagnosticSchema>;

export function readLastHistoryCheckoutFailure(): HistoryCheckoutFailureDiagnostic | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(WUXIA_HISTORY_CHECKOUT_LAST_FAILURE_KEY);
    if (!raw) return null;
    const parsed = HistoryCheckoutFailureDiagnosticSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeLastHistoryCheckoutFailure(failure: HistoryCheckoutFailureDiagnostic): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WUXIA_HISTORY_CHECKOUT_LAST_FAILURE_KEY, JSON.stringify(failure));
    }
  } catch (error) {
    console.warn('[历史恢复] 保存最近一次错误诊断失败:', error);
  }
}

function clearLastHistoryCheckoutFailure(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(WUXIA_HISTORY_CHECKOUT_LAST_FAILURE_KEY);
  } catch (error) {
    console.warn('[历史恢复] 清理已完成的错误诊断失败:', error);
  }
}

function describeCheckoutOriginalError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!(current instanceof Error)) {
      parts.push(String(current));
      break;
    }
    parts.push(`${depth === 0 ? '原始异常' : `cause ${depth}`}：${current.name}: ${current.message}`);
    if (current.stack) parts.push(current.stack);
    if (current.cause === undefined || current.cause === current) break;
    current = current.cause;
  }
  return parts.join('\n');
}

export const HistoryLocatorSchema = z
  .object({
    chatId: z.string(),
    chatName: z.string(),
    userMessageId: z.number().int().nullable(),
    assistantMessageId: z.number().int(),
    swipeId: z.number().int().nonnegative(),
  })
  .strict();

export const HistoryNodeSchema = z
  .object({
    id: z.string(),
    parentId: z.string().nullable(),
    locators: z.array(HistoryLocatorSchema),
    messageKey: z.string().nullable(),
    messageKeyAliases: z.array(z.string()).optional(),
    label: z.string().nullable(),
    pinned: z.boolean(),
    preview: z.string(),
    location: z.string(),
    worldTimeText: z.string(),
    createdAt: z.number().finite(),
    verification: z
      .object({
        selectedMksHash: z.string(),
        eventStateHash: z.string(),
        acceptedSelectedMksHashes: z.array(z.string()).optional(),
        /** 新封存节点可用：用于定位具体哪组事件状态变化；老节点仍能读取。 */
        eventPartHashes: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const HistoryBranchSchema = z
  .object({
    id: z.string(),
    chatId: z.string(),
    chatName: z.string(),
    originNodeId: z.string().nullable(),
    headNodeId: z.string().nullable(),
    createdAt: z.number().finite(),
    status: z.enum(['active', 'available', 'recovery_failed', 'broken', 'degraded']),
  })
  .strict();

export const WuxiaHistoryTreeV2Schema = z
  .object({
    version: z.literal(2),
    updatedAt: z.number().finite(),
    nodes: z.record(z.string(), HistoryNodeSchema),
    branches: z.record(z.string(), HistoryBranchSchema),
  })
  .strict();

type TavernHistoryMessage = {
  message_id: number;
  role?: 'system' | 'assistant' | 'user';
  is_user?: boolean;
  is_system?: boolean;
  is_hidden?: boolean;
  message?: string;
  mes?: string;
  swipes?: string[];
  swipe_id?: number;
};

export interface HistoryChatIdentity {
  id: string;
  name: string;
}

export interface HistoryTreeViewState {
  tree: WuxiaHistoryTreeV2;
  currentNodeId: string | null;
  currentBranchId: string;
  currentChat: HistoryChatIdentity;
}

export interface HistoryScanOptions {
  originNodeId?: string | null;
  location?: string;
  worldTimeText?: string;
}

export interface FinalizeHistoryTurnOptions {
  location?: string;
  worldTimeText?: string;
}

export interface CheckoutHistoryOptions {
  forceBranch?: boolean;
}

export interface HistoryCheckoutResult {
  status: 'commit' | 'recovery_failed' | 'broken';
  actionKind: CheckoutActionKind;
  nodeId: string;
  currentNodeId: string | null;
  currentBranchId: string | null;
  currentChat: HistoryChatIdentity | null;
  /** 仅 fork_branch 在检出完全提交后交给独立聊天改名事务的建议名称。 */
  postCommitChatName: string | null;
  error: string | null;
}

export interface CurrentHistoryContext extends HistoryTreeViewState {
  currentBranch: HistoryBranch;
  currentNode: HistoryNode | null;
}

type HistoryVerification = NonNullable<HistoryNode['verification']>;
const HISTORY_EVENT_STATE_KEYS = [
  '事件系统', '参与事件', '世界事件', '事件分支结果', '后续事件线索', '后续事件线索计数',
] as const;

/** 对比 ERA 完整回滚完成时和事件脚本预检查完成时的真实事件根，避免旧哈希无法定位原因。 */
function readCheckoutEventRoots(): Record<string, unknown> {
  const variables = getVariables({ type: 'chat' });
  const statData = isRecord(variables?.stat_data) ? variables.stat_data : {};
  const roots = Object.fromEntries(HISTORY_EVENT_STATE_KEYS.map(key => [key, statData[key] ?? null]));
  return structuredClone(roots);
}

function describeChangedEventPaths(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const limit = 32;
  const walk = (oldValue: unknown, nextValue: unknown, path: string, depth: number) => {
    if (changes.length >= limit) return;
    if (stableHistoryHash(oldValue) === stableHistoryHash(nextValue)) return;
    if (depth < 6 && isRecord(oldValue) && isRecord(nextValue)) {
      for (const key of [...new Set([...Object.keys(oldValue), ...Object.keys(nextValue)])].sort()) {
        walk(oldValue[key], nextValue[key], `${path}.${key}`, depth + 1);
        if (changes.length >= limit) break;
      }
      return;
    }
    const typeOf = (value: unknown) =>
      value === null || value === undefined
        ? '空'
        : Array.isArray(value)
          ? `数组(${value.length})`
          : isRecord(value)
            ? `对象(${Object.keys(value).length}项)`
            : typeof value;
    changes.push(`${path}（${typeOf(oldValue)} → ${typeOf(nextValue)}）`);
  };
  for (const key of HISTORY_EVENT_STATE_KEYS) {
    walk(before[key], after[key], key, 0);
    if (changes.length >= limit) {
      changes.push('其余变化省略（最多列出 32 条路径）');
      break;
    }
  }
  return changes;
}

const ERA_MESSAGE_KEY_REGEX =
  /<era_data>[\s\S]*?["']?era-message-key["']?\s*[=:]\s*["']([^"']+)["'][\s\S]*?<\/era_data>/i;
const ERA_DATA_BLOCK_REGEX = /\s*<era_data>[\s\S]*?<\/era_data>\s*/gi;
const VARIABLE_BLOCK_REGEX =
  /\s*<Variable(?:Think|Insert|Edit|Delete)>[\s\S]*?<\/Variable(?:Think|Insert|Edit|Delete)>\s*/gi;
const PREVIEW_LENGTH = 120;

function createEmptyTree(now = Date.now()): WuxiaHistoryTreeV2 {
  return {
    version: 2,
    updatedAt: now,
    nodes: {},
    branches: {},
  };
}

function cloneTree(tree: WuxiaHistoryTreeV2): WuxiaHistoryTreeV2 {
  return WuxiaHistoryTreeV2Schema.parse(structuredClone(tree));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (value === undefined) return '"__undefined__"';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '"__nan__"';
    if (!Number.isFinite(value)) return value > 0 ? '"__infinity__"' : '"__negative_infinity__"';
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'bigint') return JSON.stringify(`${value.toString()}n`);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'symbol' || typeof value === 'function') return JSON.stringify(String(value));

  if (seen.has(value as object)) {
    throw new TypeError('无法为循环引用生成稳定哈希。');
  }
  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      return `[${value.map(item => canonicalize(item, seen)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`).join(',')}}`;
  } finally {
    seen.delete(value as object);
  }
}

export function stableHistoryHash(value: unknown): string {
  const text = canonicalize(value, new WeakSet<object>());
  let high = 0x9e3779b9;
  let low = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    low ^= code;
    low = Math.imul(low, 0x01000193) >>> 0;
    high ^= low + code + ((high << 6) >>> 0) + (high >>> 2);
    high >>>= 0;
  }
  return `${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`;
}

function createStableId(prefix: string, value: unknown): string {
  return `${prefix}_${stableHistoryHash(value)}`;
}

function branchIdForChat(chatId: string): string {
  return createStableId('history_branch', chatId);
}

function cleanStoryText(text: string): string {
  ERA_DATA_BLOCK_REGEX.lastIndex = 0;
  VARIABLE_BLOCK_REGEX.lastIndex = 0;
  return normalizeDisplayedMessageContent(text)
    .replace(ERA_DATA_BLOCK_REGEX, '\n')
    .replace(VARIABLE_BLOCK_REGEX, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Compare a source message with its branch clone while removing volatile ERA metadata
 * before display normalization. This is comparison-only: it never changes node IDs.
 */
function cleanStoryTextForIdentityComparison(text: string): string {
  ERA_DATA_BLOCK_REGEX.lastIndex = 0;
  VARIABLE_BLOCK_REGEX.lastIndex = 0;
  const withoutMetadata = text
    .replace(ERA_DATA_BLOCK_REGEX, '\n')
    .replace(VARIABLE_BLOCK_REGEX, '\n');
  return normalizeDisplayedMessageContent(withoutMetadata)
    .replace(ERA_DATA_BLOCK_REGEX, '\n')
    .replace(VARIABLE_BLOCK_REGEX, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readAllTavernRegexes(): TavernRegex[] {
  if (typeof getTavernRegexes !== 'function') return [];
  try {
    // 旧式 scope 参数一次返回按实际作用顺序排序的全集（预设 + 全局 + 角色局部）
    return getTavernRegexes({ scope: 'all' } as unknown as Parameters<typeof getTavernRegexes>[0]);
  } catch {
    try {
      return (['preset', 'global', 'character'] as const).flatMap(type => getTavernRegexes({ type }));
    } catch {
      return [];
    }
  }
}

const TAVERN_FIND_REGEX_PATTERN = /^\/([\s\S]+)\/([a-z]*)$/i;

function compileTavernFindRegex(source: string): RegExp | null {
  const raw = String(source ?? '').trim();
  if (!raw) return null;
  try {
    const match = raw.match(TAVERN_FIND_REGEX_PATTERN);
    if (match) return new RegExp(match[1], match[2].includes('g') ? match[2] : `${match[2]}g`);
    return new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  } catch {
    return null;
  }
}

/**
 * 预览要的是正文。把启用的 ai_output + 仅格式显示 酒馆正则（含预设正则）一律当"删除"
 * 使用：它们圈中的思维链、吐槽、事件附块等都不是正文；而美化类正则的替换物是 HTML/CSS，
 * 对纯文本预览只是噪音，因此忽略 replace_string，一律替换为空。
 * 安全阀：单条正则若几乎吞掉全文（例如把整条消息替换成前端加载器的"游戏页面"类全吞正则），
 * 跳过该条，避免预览被清空。
 * 注意：只用于预览展示；节点身份哈希仍基于 cleanStoryText(原文)，不受正则配置影响。
 */
function stripNonStoryContentForPreview(text: string): string {
  let result = text;
  try {
    for (const regex of readAllTavernRegexes()) {
      if (regex?.enabled !== true || regex.source?.ai_output !== true || regex.destination?.display !== true) {
        continue;
      }
      const compiled = compileTavernFindRegex(regex.find_regex);
      if (!compiled) continue;
      const next = result.replace(compiled, '');
      if (next.trim().length < 40 && result.trim().length > 200) continue;
      result = next;
    }
  } catch {
    // 正则读取或应用失败时保留当前结果：预览质量下降但不阻塞扫描
  }
  return result;
}

function createPreview(text: string): string {
  const filtered = cleanStoryText(stripNonStoryContentForPreview(text)).replace(/\s+/g, ' ').trim();
  // 过滤后为空（例如正则圈走了全部内容）时回退未过滤文本，保证预览不至于空白
  const normalized = filtered || cleanStoryText(text).replace(/\s+/g, ' ').trim();
  return normalized.length <= PREVIEW_LENGTH ? normalized : `${normalized.slice(0, PREVIEW_LENGTH)}...`;
}

function extractMessageKey(text: string): string | null {
  return text.match(ERA_MESSAGE_KEY_REGEX)?.[1]?.trim() || null;
}

function getMessageRole(message: TavernHistoryMessage): 'system' | 'assistant' | 'user' {
  if (message.role) return message.role;
  if (message.is_user) return 'user';
  if (message.is_system) return 'system';
  return 'assistant';
}

function getSwipeTexts(message: TavernHistoryMessage): { texts: string[]; activeSwipeId: number } {
  if (Array.isArray(message.swipes) && message.swipes.length > 0) {
    const requested = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
    return {
      texts: [...message.swipes],
      activeSwipeId: Math.max(0, Math.min(requested, message.swipes.length - 1)),
    };
  }
  return {
    texts: [message.message ?? message.mes ?? ''],
    activeSwipeId: 0,
  };
}

function getNodeId(parentId: string | null, messageKey: string | null, text: string, swipeId: number): string {
  return createStableId('history_node', {
    parentId,
    identity: messageKey ? `mk:${messageKey}` : `content:${stableHistoryHash(cleanStoryText(text))}`,
    swipeId,
  });
}

/**
 * A node originally identified by content can later be observed with an ERA MK after
 * /branch-create or a full sync. Keep its original ID and primary messageKey; aliases
 * record the additional identity without rewriting the historical seal.
 */
function nodeAcceptsMessageKey(node: HistoryNode, messageKey: string | null): boolean {
  return node.messageKey === messageKey ||
    (messageKey !== null && (node.messageKeyAliases ?? []).includes(messageKey));
}

function canReuseContentIdentifiedNode(node: HistoryNode, messageKey: string): boolean {
  const knownKeys = [node.messageKey, ...(node.messageKeyAliases ?? [])]
    .filter((key): key is string => key !== null);
  return knownKeys.length === 0 || knownKeys.includes(messageKey);
}

function appendMessageKeyAlias(node: HistoryNode, messageKey: string | null): HistoryNode {
  if (!messageKey || node.messageKey === messageKey || (node.messageKeyAliases ?? []).includes(messageKey)) {
    return node;
  }
  return { ...node, messageKeyAliases: [...(node.messageKeyAliases ?? []), messageKey] };
}

function locatorEquals(left: HistoryLocator, right: HistoryLocator): boolean {
  return (
    left.chatId === right.chatId &&
    left.assistantMessageId === right.assistantMessageId &&
    left.swipeId === right.swipeId
  );
}

function appendLocator(node: HistoryNode, locator: HistoryLocator): HistoryNode {
  if (node.locators.some(current => locatorEquals(current, locator))) return node;
  return { ...node, locators: [...node.locators, locator] };
}

function acceptsSelectedMksHash(
  verification: HistoryVerification | null | undefined,
  selectedMksHash: string,
): boolean {
  return Boolean(verification && (
    verification.selectedMksHash === selectedMksHash ||
    (verification.acceptedSelectedMksHashes ?? []).includes(selectedMksHash)
  ));
}

export function loadHistoryTree(): WuxiaHistoryTreeV2 {
  try {
    const variables = getVariables({ type: 'character' });
    const parsed = WuxiaHistoryTreeV2Schema.safeParse(variables?.[WUXIA_HISTORY_TREE_V2_KEY]);
    if (parsed.success) return parsed.data;
    return createEmptyTree();
  } catch (error) {
    console.warn('[金庸群侠传] 读取 v2 历史树失败，使用空树:', error);
    return createEmptyTree();
  }
}

function persistHistoryTree(tree: WuxiaHistoryTreeV2): WuxiaHistoryTreeV2 {
  const parsed = WuxiaHistoryTreeV2Schema.parse({ ...tree, updatedAt: Date.now() });
  updateVariablesWith(
    variables => ({
      ...variables,
      [WUXIA_HISTORY_TREE_V2_KEY]: parsed,
    }),
    { type: 'character' },
  );
  return parsed;
}

export async function readCurrentChatIdentity(): Promise<HistoryChatIdentity> {
  const currentId = String(SillyTavern.getCurrentChatId?.() ?? '').trim();
  const slashName = await triggerSlash('/getchatname').catch(() => '');
  const name = String(slashName ?? '').trim() || currentId;
  return { id: currentId || name, name };
}

/**
 * 新分叉总以本脉络的根卷名命名，而不是以嵌套分叉的名字继续叠加。
 * 这是纯计算；重名消解由聊天改名事务在读取实际酒馆列表后完成。
 */
export function suggestForkChatName(
  tree: WuxiaHistoryTreeV2,
  nodeId: string,
  fallbackRootName: string,
): string {
  const node = tree.nodes[nodeId];
  const related = filterTreeToRelatedComponent(tree, nodeId);
  const rootBranch = Object.values(related.branches)
    .filter(branch => branch.originNodeId === null && branch.chatName.trim())
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))[0];
  const rootName = rootBranch?.chatName.trim() || fallbackRootName.trim() || '未题名卷册';
  const explicitLabel = node?.label?.trim();
  if (explicitLabel) return `${rootName} · ${explicitLabel}`;

  let length = 0;
  let cursor: string | null = nodeId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor) && tree.nodes[cursor]) {
    seen.add(cursor);
    length += 1;
    cursor = tree.nodes[cursor].parentId;
  }
  return `${rootName} · 第${Math.max(1, length)}段`;
}

/**
 * SillyTavern 改名会把聊天 ID（文件名）一并更换。历史定位、分支索引均须同一事务迁移；
 * 对已迁移的数据再调用一次不会产生重复 locator 或第二个 branch。
 */
export function migrateHistoryChatIdentity(
  oldChat: HistoryChatIdentity,
  newChat: HistoryChatIdentity,
): WuxiaHistoryTreeV2 {
  if (!oldChat.id || !newChat.id) return loadHistoryTree();
  const tree = cloneTree(loadHistoryTree());
  let changed = false;

  for (const node of Object.values(tree.nodes)) {
    const nextLocators: HistoryLocator[] = [];
    for (const locator of node.locators) {
      const next = locator.chatId === oldChat.id ? { ...locator, chatId: newChat.id, chatName: newChat.name } : locator;
      if (next !== locator) changed = true;
      const duplicate = nextLocators.findIndex(item => locatorEquals(item, next));
      if (duplicate >= 0) {
        // 改名后的 locator 优先，保证界面不会继续显示旧聊天名。
        if (next.chatId === newChat.id) nextLocators[duplicate] = next;
        changed = true;
      } else {
        nextLocators.push(next);
      }
    }
    if (nextLocators.length !== node.locators.length || nextLocators.some((item, index) => item !== node.locators[index])) {
      node.locators = nextLocators;
    }
  }

  const oldBranchId = branchIdForChat(oldChat.id);
  const newBranchId = branchIdForChat(newChat.id);
  const nextBranches: WuxiaHistoryTreeV2['branches'] = {};
  for (const [key, branch] of Object.entries(tree.branches)) {
    if (branch.chatId !== oldChat.id && key !== oldBranchId) {
      nextBranches[key] = branch;
      continue;
    }
    const migrated = { ...branch, id: newBranchId, chatId: newChat.id, chatName: newChat.name };
    nextBranches[newBranchId] = migrated;
    changed = true;
  }
  if (changed) {
    tree.branches = nextBranches;
    return persistHistoryTree(tree);
  }
  return tree;
}

function readAllHistoryMessages(): TavernHistoryMessage[] {
  return getChatMessages('0-{{lastMessageId}}', {
    role: 'all',
    hide_state: 'all',
    include_swipes: true,
  }) as unknown as TavernHistoryMessage[];
}

/**
 * 只保留包含 anchor 节点的连通脉络（沿 parentId 无向连通）。
 * 历史树按角色累积所有历史局的节点；谱牒展示时用此函数隐藏与当前聊天无关的其他开局脉络。
 * anchor 为空或不在树中时原样返回。仅用于展示过滤，不改动持久化数据。
 */
export function filterTreeToRelatedComponent(
  tree: WuxiaHistoryTreeV2,
  anchorNodeId: string | null,
): WuxiaHistoryTreeV2 {
  if (!anchorNodeId || !tree.nodes[anchorNodeId]) return tree;
  const childrenByParent = new Map<string, string[]>();
  for (const node of Object.values(tree.nodes)) {
    if (!node.parentId) continue;
    const siblings = childrenByParent.get(node.parentId);
    if (siblings) siblings.push(node.id);
    else childrenByParent.set(node.parentId, [node.id]);
  }
  const keep = new Set<string>();
  const queue: string[] = [anchorNodeId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (keep.has(id)) continue;
    keep.add(id);
    const parentId = tree.nodes[id]?.parentId;
    if (parentId && tree.nodes[parentId] && !keep.has(parentId)) queue.push(parentId);
    for (const childId of childrenByParent.get(id) ?? []) {
      if (!keep.has(childId)) queue.push(childId);
    }
  }
  if (keep.size === Object.keys(tree.nodes).length) return tree;
  return {
    ...tree,
    nodes: Object.fromEntries(Object.entries(tree.nodes).filter(([id]) => keep.has(id))),
    branches: Object.fromEntries(
      Object.entries(tree.branches).filter(
        ([, branch]) =>
          (branch.headNodeId !== null && keep.has(branch.headNodeId)) ||
          (branch.originNodeId !== null && keep.has(branch.originNodeId)),
      ),
    ),
  };
}

function buildViewState(tree: WuxiaHistoryTreeV2, currentChat: HistoryChatIdentity): HistoryTreeViewState {
  const currentBranchId = branchIdForChat(currentChat.id);
  const currentBranch = tree.branches[currentBranchId];
  return {
    tree,
    currentNodeId: currentBranch?.headNodeId ?? null,
    currentBranchId,
    currentChat,
  };
}

export async function scanCurrentChat(options: HistoryScanOptions = {}): Promise<HistoryTreeViewState> {
  const now = Date.now();
  const currentChat = await readCurrentChatIdentity();
  const branchId = branchIdForChat(currentChat.id);
  const tree = cloneTree(loadHistoryTree());
  const previousBranch = tree.branches[branchId];

  for (const node of Object.values(tree.nodes)) {
    node.locators = node.locators.filter(locator => locator.chatId !== currentChat.id);
  }

  let currentParentId: string | null = null;
  let pendingUserMessageId: number | null = null;
  let creationOffset = 0;
  const supersededMessageKeyNodeIds = new Set<string>();

  for (const message of readAllHistoryMessages()) {
    if (!Number.isInteger(message.message_id) || message.is_hidden === true) continue;
    const role = getMessageRole(message);
    if (role === 'user') {
      pendingUserMessageId = message.message_id;
      continue;
    }
    if (role !== 'assistant') continue;

    const { texts, activeSwipeId } = getSwipeTexts(message);
    let activeNodeId: string | null = null;
    for (let swipeId = 0; swipeId < texts.length; swipeId += 1) {
      const rawText = texts[swipeId] ?? '';
      const cleaned = cleanStoryText(rawText);
      if (!rawText.trim() || !cleaned || isFrontendLoaderOnlyMessage(rawText)) {
        continue;
      }

      const messageKey = extractMessageKey(rawText);
      const messageKeyId = getNodeId(currentParentId, messageKey, rawText, swipeId);
      const keyedNode = tree.nodes[messageKeyId];
      const contentId = getNodeId(currentParentId, null, rawText, swipeId);
      const contentNode = tree.nodes[contentId];
      // A previously failed checkout may already have persisted the MK-keyed duplicate.
      // Prefer an explicitly recorded alias first, then a matching legacy content node
      // if the duplicate has no other-chat locators. Do not let an existing duplicate
      // suppress the fallback on retry.
      const aliasNode = messageKey
        ? Object.values(tree.nodes).find(node =>
            node.id !== messageKeyId &&
            node.parentId === currentParentId &&
            (node.messageKeyAliases ?? []).includes(messageKey) &&
            node.locators.some(locator => locator.swipeId === swipeId),
          )
        : undefined;
      let id = messageKeyId;
      let existing = keyedNode;
      if (aliasNode) {
        id = aliasNode.id;
        existing = aliasNode;
      } else if (
        messageKey && contentNode && contentNode.id !== messageKeyId &&
        contentNode.parentId === currentParentId &&
        canReuseContentIdentifiedNode(contentNode, messageKey) &&
        (!keyedNode || (
          keyedNode.locators.length === 0 &&
          !Object.values(tree.branches).some(branch =>
            branch.id !== branchId &&
            (branch.headNodeId === keyedNode.id || branch.originNodeId === keyedNode.id),
          )
        ))
      ) {
        id = contentId;
        existing = contentNode;
        if (keyedNode && keyedNode.locators.length === 0) {
          supersededMessageKeyNodeIds.add(keyedNode.id);
        }
      }
      const locator: HistoryLocator = {
        chatId: currentChat.id,
        chatName: currentChat.name,
        userMessageId: pendingUserMessageId,
        assistantMessageId: message.message_id,
        swipeId,
      };
      // 已有节点也刷新 preview：预览受"仅格式显示"正则影响，正则配置变化后旧预览需要跟上
      const node: HistoryNode = existing
        ? { ...appendMessageKeyAlias(appendLocator(existing, locator), messageKey), preview: createPreview(rawText) }
        : {
            id,
            parentId: currentParentId,
            locators: [locator],
            messageKey,
            label: null,
            pinned: false,
            preview: createPreview(rawText),
            location: '',
            worldTimeText: '',
            createdAt: now + creationOffset++,
            verification: null,
          };
      tree.nodes[id] = node;
      if (swipeId === activeSwipeId) activeNodeId = id;
    }

    if (activeNodeId) currentParentId = activeNodeId;
    pendingUserMessageId = null;
  }

  const currentHead = currentParentId ? tree.nodes[currentParentId] : null;
  if (currentHead && (options.location !== undefined || options.worldTimeText !== undefined)) {
    tree.nodes[currentHead.id] = {
      ...currentHead,
      location: options.location ?? currentHead.location,
      worldTimeText: options.worldTimeText ?? currentHead.worldTimeText,
    };
  }

  for (const branch of Object.values(tree.branches)) {
    if (branch.id !== branchId && branch.status === 'active') branch.status = 'available';
  }
  tree.branches[branchId] = {
    id: branchId,
    chatId: currentChat.id,
    chatName: currentChat.name,
    originNodeId: previousBranch?.originNodeId ?? options.originNodeId ?? null,
    headNodeId: currentParentId,
    createdAt: previousBranch?.createdAt ?? now,
    // 降级恢复代表此聊天的来源精确性已经让步，刷新页面不得悄悄清除标记。
    status: previousBranch?.status === 'degraded' ? 'degraded' : 'active',
  };
  // Remove duplicate MK nodes left by an earlier failed scan only when they are now
  // unreferenced and carry no independent history or user metadata.
  for (const orphanId of supersededMessageKeyNodeIds) {
    const orphan = tree.nodes[orphanId];
    if (!orphan || orphan.locators.length > 0 || orphan.pinned || orphan.label || orphan.verification) continue;
    const hasChildren = Object.values(tree.nodes).some(node => node.parentId === orphanId);
    const isReferenced = Object.values(tree.branches).some(branch =>
      branch.headNodeId === orphanId || branch.originNodeId === orphanId,
    );
    if (!hasChildren && !isReferenced) delete tree.nodes[orphanId];
  }

  return buildViewState(persistHistoryTree(tree), currentChat);
}

function readCurrentVerification(): HistoryVerification {
  const variables = getVariables({ type: 'chat' });
  const statData = isRecord(variables?.stat_data) ? variables.stat_data : {};
  const metaData = isRecord(variables?.ERAMetaData) ? variables.ERAMetaData : {};
  const selectedMks = Array.isArray(metaData.SelectedMks) ? metaData.SelectedMks : [];
  const eventState = {
    事件系统: statData.事件系统 ?? null,
    参与事件: statData.参与事件 ?? null,
    世界事件: statData.世界事件 ?? null,
    事件分支结果: statData.事件分支结果 ?? null,
    后续事件线索: statData.后续事件线索 ?? null,
    后续事件线索计数: statData.后续事件线索计数 ?? null,
  };
  return {
    selectedMksHash: stableHistoryHash(selectedMks),
    eventStateHash: stableHistoryHash(eventState),
    eventPartHashes: Object.fromEntries(
      HISTORY_EVENT_STATE_KEYS.map(key => [key, stableHistoryHash(eventState[key])]),
    ),
  };
}


/**
 * 历史节点只能封存与当前激活消息严格对齐的 MK 主干。
 * 不读备用 swipe 的 MK，也不进行任何 ERA 写入；拒绝拿尚未同步的数组做永久证据。
 */
function assertCurrentHistoryMksAligned(node?: HistoryNode): (string | null)[] {
  const messages = readAllHistoryMessages();
  const raw = getVariables({ type: 'chat' })?.ERAMetaData?.SelectedMks;
  if (!Array.isArray(raw)) throw new Error('历史封存中止：ERA SelectedMks 缺失。');
  if (raw.length !== messages.length) {
    throw new Error(`历史封存中止：SelectedMks 长度 ${raw.length}，实际消息 ${messages.length}；请先完成 ERA 同步。`);
  }
  const issues: string[] = [];
  const ids = new Set<number>();
  for (const message of messages) {
    const id = message.message_id;
    if (!Number.isInteger(id) || id < 0 || id >= raw.length || ids.has(id)) {
      issues.push(`消息楼层 ID 异常：${String(id)}`);
      continue;
    }
    ids.add(id);
    const { texts, activeSwipeId } = getSwipeTexts(message);
    const activeText = texts[activeSwipeId] ?? '';
    const mk = extractMessageKey(activeText);
    const stored = raw[id];
    if (!Object.hasOwn(raw, id) || (stored !== null && typeof stored !== 'string') || stored !== mk) {
      issues.push(`楼层 ${id}：SelectedMks=${String(stored)}；当前 swipe MK=${String(mk)}`);
    }
    // 如果酒馆的活动正文与 swipe 不一致，ERA 可能读取到另一个 MK。
    const mes = (message as TavernHistoryMessage & { mes?: string }).mes;
    if (typeof mes === 'string' && extractMessageKey(mes) !== mk) {
      issues.push(`楼层 ${id}：mes MK 与当前 swipe MK 不一致`);
    }
  }
  if (ids.size !== raw.length) issues.push(`消息 ID 数量 ${ids.size} 与 SelectedMks 长度 ${raw.length} 不符`);
  const currentId = String(SillyTavern.getCurrentChatId?.() ?? '');
  if (node) {
    const locator = node.locators.find(item => item.chatId === currentId);
    const target = messages.find(item => item.message_id === locator?.assistantMessageId);
    const targetSwipe = target ? getSwipeTexts(target) : null;
    const targetMk = targetSwipe ? extractMessageKey(targetSwipe.texts[targetSwipe.activeSwipeId] ?? '') : null;
    if (!locator || !targetSwipe || !nodeAcceptsMessageKey(node, targetMk) || targetSwipe.activeSwipeId !== locator.swipeId) {
      issues.push('目标节点的聊天、楼层、swipe 或 MK 身份不一致');
    }
  }
  if (issues.length) {
    recordEraDiagnostic('wuxia-history-checkout', 'history-seal-mk-alignment-rejected', {
      nodeId: node?.id ?? null, chatId: currentId, selectedMksLength: raw.length,
      messageCount: messages.length, issues: issues.slice(0, 12),
    });
    throw new Error(`历史封存中止：MK 主干与活动消息不一致（${issues.length} 项）。\n${issues.slice(0, 12).join('\n')}`);
  }
  return raw.slice() as (string | null)[];
}


/** 必须在来源聊天、分叉前记录；旧 journal 没有证据时不得凭当前分支自证。 */
function captureCheckoutSourceMkWitness(journal: HistoryCheckoutJournal, node: HistoryNode): void {
  try {
    const locator = journal.branchSourceLocator;
    if (journal.actionKind !== 'fork_branch' || !locator ||
        String(SillyTavern.getCurrentChatId?.() ?? '') !== locator.chatId ||
        !node.verification) return;
    // 来源可能包含目标之后的更多楼层；全量与消息对齐，证明前缀取自真实来源。
    const mks = assertCurrentHistoryMksAligned();
    const messages = readAllHistoryMessages();
    const target = messages.find(item => item.message_id === locator.assistantMessageId);
    const swipe = target ? getSwipeTexts(target) : null;
    const targetMk = swipe ? extractMessageKey(swipe.texts[swipe.activeSwipeId] ?? '') : null;
    if (!target || !swipe || swipe.activeSwipeId !== locator.swipeId ||
        !nodeAcceptsMessageKey(node, targetMk) || locator.assistantMessageId >= mks.length) {
      throw new Error('来源聊天的目标楼层、swipe 或 MK 与历史节点不符');
    }
    const witness: HistorySourceMkWitness = {
      version: 1,
      transactionId: journal.transactionId,
      targetNodeId: node.id,
      sourceChatId: locator.chatId,
      targetMessageId: locator.assistantMessageId,
      targetSwipeId: locator.swipeId,
      originalSelectedMksHash: node.verification.selectedMksHash,
      eventStateHash: node.verification.eventStateHash,
      alignedPrefixHash: stableHistoryHash(mks.slice(0, locator.assistantMessageId + 1)),
      targetMk,
      createdAt: Date.now(),
    };
    localStorage.setItem(HISTORY_REPAIR_WITNESS_PREFIX + journal.transactionId, JSON.stringify(witness));
    recordEraDiagnostic('wuxia-history-checkout', 'history-source-mk-witness-captured', {
      transactionId: journal.transactionId, nodeId: node.id,
      sourceChatId: locator.chatId, alignedPrefixHash: witness.alignedPrefixHash,
      originalSelectedMksHash: witness.originalSelectedMksHash,
    });
  } catch (error) {
    recordEraDiagnostic('wuxia-history-checkout', 'history-source-mk-witness-unavailable', {
      transactionId: journal.transactionId, nodeId: node.id,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function readCheckoutSourceMkWitness(transactionId: string): HistorySourceMkWitness | null {
  try {
    const raw = localStorage.getItem(HISTORY_REPAIR_WITNESS_PREFIX + transactionId);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved) || saved.version !== 1 || saved.transactionId !== transactionId ||
        typeof saved.alignedPrefixHash !== 'string' ||
        typeof saved.originalSelectedMksHash !== 'string' ||
        typeof saved.eventStateHash !== 'string' ||
        typeof saved.targetMessageId !== 'number' ||
        typeof saved.targetSwipeId !== 'number' ||
        typeof saved.sourceChatId !== 'string' ||
        typeof saved.targetNodeId !== 'string' ||
        (saved.targetMk !== null && typeof saved.targetMk !== 'string') ||
        typeof saved.createdAt !== 'number') return null;
    return saved as unknown as HistorySourceMkWitness;
  } catch {
    return null;
  }
}

function persistHistoryVerificationRepairAudit(entry: Record<string, unknown>): void {
  // 审计存储失败必须中止修复，避免无法追查被替换的原始指纹。
  const raw = localStorage.getItem(WUXIA_HISTORY_REPAIR_AUDIT_KEY);
  const old: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(old)) throw new Error('历史修复审计文件格式不正确');
  localStorage.setItem(WUXIA_HISTORY_REPAIR_AUDIT_KEY, JSON.stringify([...old, entry].slice(-100)));
}

function persistHistoryIdentityAliasAudit(entry: Record<string, unknown>): void {
  const raw = localStorage.getItem(WUXIA_HISTORY_IDENTITY_ALIAS_AUDIT_KEY);
  const old: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(old)) throw new Error('历史节点身份别名审计格式不正确');
  localStorage.setItem(WUXIA_HISTORY_IDENTITY_ALIAS_AUDIT_KEY, JSON.stringify([...old, entry].slice(-100)));
}

export async function finalizeCurrentTurn(options: FinalizeHistoryTurnOptions = {}): Promise<HistoryTreeViewState> {
  const scanned = await scanCurrentChat(options);
  if (!scanned.currentNodeId) return scanned;

  const tree = cloneTree(scanned.tree);
  const node = tree.nodes[scanned.currentNodeId];
  if (!node) return scanned;
  const selectedMks = assertCurrentHistoryMksAligned(node);
  const sealedVerification = readCurrentVerification();
  if (sealedVerification.selectedMksHash !== stableHistoryHash(selectedMks)) {
    throw new Error('历史封存中止：两次读取 ERA SelectedMks 期间主干发生变化。');
  }
  // 重复封存只能保持同一指纹；不能让其它聊天或迟到的异步同步静默覆盖旧证据。
  const preservesAcceptedMkVariant = Boolean(
    node.verification &&
    node.verification.selectedMksHash !== sealedVerification.selectedMksHash &&
    acceptsSelectedMksHash(node.verification, sealedVerification.selectedMksHash) &&
    node.verification.eventStateHash === sealedVerification.eventStateHash,
  );
  if (node.verification &&
      (!acceptsSelectedMksHash(node.verification, sealedVerification.selectedMksHash) ||
       node.verification.eventStateHash !== sealedVerification.eventStateHash)) {
    // 旧节点的原 verification 永久不可改写。对经用户确认的降级分支，
    // 重复保存当前楼层只重用已有节点；新一楼完成时仍按正常规则封存新节点。
    if (scanned.tree.branches[scanned.currentBranchId]?.status === 'degraded') {
      recordEraDiagnostic('wuxia-history-checkout', 'history-degraded-existing-node-preserved', {
        nodeId: node.id, branchId: scanned.currentBranchId,
        sealedMkHash: node.verification.selectedMksHash,
        currentMkHash: sealedVerification.selectedMksHash,
        sealedEventHash: node.verification.eventStateHash,
        currentEventHash: sealedVerification.eventStateHash,
      });
      return scanned;
    }
    recordEraDiagnostic('wuxia-history-checkout', 'history-seal-immutable-verification-rejected', {
      nodeId: node.id,
      original: node.verification,
      attempted: sealedVerification,
    });
    throw new Error('历史节点已经封存，当前 ERA/事件指纹与原封存不同；拒绝静默覆盖。请检查历史恢复或另建节点。');
  }
  // 保存 MK 逐楼基准只作为诊断；文件丢失不使已完成的正确封存失效。
  try {
    saveHistoryMkSnapshot(sealedVerification.selectedMksHash, selectedMks);
  } catch (error) {
    recordEraDiagnostic('wuxia-history-checkout', 'history-mk-snapshot-save-failed', {
      nodeId: node.id,
      selectedMksHash: sealedVerification.selectedMksHash,
      reason: error instanceof Error ? error.message : String(error),
    });
    console.warn('[历史节点] MK 逐楼基准封存失败，检出时将只有当前楼层对账信息', error);
  }
  // 按内容指纹只保存一份事件根；多节点若状态一致可共享快照。
  // 不把体积较大的原值塞进历史树元数据，避免每次扫描复制全部事件内容。
  try {
    const sealedStat = getVariables({ type: 'chat' })?.stat_data ?? {};
    const roots = captureHistoryEventRoots(isRecord(sealedStat) ? sealedStat : {});
    if (stableHistoryHash(roots) !== sealedVerification.eventStateHash) {
      throw new Error('事件快照与封存指纹不一致');
    }
    saveHistoryEventSnapshot(sealedVerification.eventStateHash, roots);
  } catch (error) {
    // 当前开局允许继续，但该节点将无法使用快照修复非 ERA 的事件漂移。
    recordEraDiagnostic('wuxia-history-checkout', 'history-event-snapshot-save-failed', {
      nodeId: node.id,
      eventStateHash: sealedVerification.eventStateHash,
      reason: error instanceof Error ? error.message : String(error),
    });
    console.warn('[历史节点] 事件基准快照封存失败，历史检出可能无法修复 direct 写入', error);
  }
  tree.nodes[node.id] = {
    ...node,
    location: options.location ?? node.location,
    worldTimeText: options.worldTimeText ?? node.worldTimeText,
    // Preserve the canonical source seal when the current chat is a verified MK variant
    // of the same forked node; do not replace the primary baseline with branch-local IDs.
    verification: preservesAcceptedMkVariant ? node.verification : sealedVerification,
  };
  const state = buildViewState(persistHistoryTree(tree), scanned.currentChat);

  // 必须在节点真正封存成功之后采样。仅记录指纹，不保存 stat_data 快照。
  try {
    const vars = getVariables({ type: 'chat' });
    const stat = isRecord(vars?.stat_data) ? vars.stat_data : {};
    const locator = node.locators.find(entry => entry.chatId === state.currentChat.id)
      ?? node.locators[0];
    recordHistoryEventForensics('history-node-sealed', {
      chatId: state.currentChat.id,
      nodeId: node.id,
      messageId: locator?.assistantMessageId ?? null,
      mk: node.messageKey,
      sealedSelectedMksHash: sealedVerification.selectedMksHash,
      sealedEventStateHash: sealedVerification.eventStateHash,
      sealedEventSystemHash: sealedVerification.eventPartHashes?.事件系统 ?? null,
      eventSnapshot: snapshotHistoryEventForensics(stat),
    });
  } catch (error) {
    console.warn('[事件历史取证] 历史节点封存诊断失败', error);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(WUXIA_HISTORY_TREE_UPDATED_EVENT, {
        detail: { currentNodeId: state.currentNodeId, chatId: state.currentChat.id },
      }),
    );
  }
  return state;
}

export function renameNode(nodeId: string, label: string | null): WuxiaHistoryTreeV2 {
  const tree = cloneTree(loadHistoryTree());
  const node = tree.nodes[nodeId];
  if (!node) throw new Error(`历史节点不存在：${nodeId}`);
  tree.nodes[nodeId] = { ...node, label: label?.trim() || null };
  return persistHistoryTree(tree);
}

export function setNodePinned(nodeId: string, pinned: boolean): WuxiaHistoryTreeV2 {
  const tree = cloneTree(loadHistoryTree());
  const node = tree.nodes[nodeId];
  if (!node) throw new Error(`历史节点不存在：${nodeId}`);
  tree.nodes[nodeId] = { ...node, pinned };
  return persistHistoryTree(tree);
}

export async function getCurrentContext(): Promise<CurrentHistoryContext> {
  const state = await scanCurrentChat();
  return {
    ...state,
    currentBranch: state.tree.branches[state.currentBranchId],
    currentNode: state.currentNodeId ? (state.tree.nodes[state.currentNodeId] ?? null) : null,
  };
}

function getNodeSuccessors(tree: WuxiaHistoryTreeV2, nodeId: string): HistoryNode[] {
  return Object.values(tree.nodes).filter(node => node.parentId === nodeId);
}

function getLatestAssistantMessageId(messages: TavernHistoryMessage[]): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (Number.isInteger(message.message_id) && message.is_hidden !== true && getMessageRole(message) === 'assistant') {
      const { texts } = getSwipeTexts(message);
      if (texts.some(text => cleanStoryText(text).length > 0 && !isFrontendLoaderOnlyMessage(text))) {
        return message.message_id;
      }
    }
  }
  return null;
}

function chooseLocatorForBranch(node: HistoryNode, branch: HistoryBranch): HistoryLocator | null {
  return node.locators.find(locator => locator.chatId === branch.chatId) ?? null;
}

/**
 * 按可用性挑选分叉来源 locator。历史树里的旧聊天文件随时可能被用户删除，因此：
 * 1. 优先当前聊天（无需访问旧文件，必然可用）；
 * 2. 其余 locator 逐个校验聊天文件是否仍存在，已删除的当场把对应分支标记 broken 并跳过，
 *    避免"每点一次分叉只报废一个死分支"的反复失败体验。
 */
async function chooseAvailableLocator(
  tree: WuxiaHistoryTreeV2,
  node: HistoryNode,
  preferredChatId?: string,
): Promise<HistoryLocator> {
  const rankOf = (item: { locator: HistoryLocator; branch: HistoryBranch | undefined }): number => {
    const broken = item.branch?.status === 'broken';
    if (!broken && item.locator.chatId === preferredChatId) return 0;
    if (!broken) return 1;
    return 2;
  };
  const ranked = node.locators
    .map(locator => ({
      locator,
      branch: tree.branches[branchIdForChat(locator.chatId)],
    }))
    .sort((left, right) => rankOf(left) - rankOf(right));
  let lastUnavailable: HistoryChatUnavailableError | null = null;
  for (const { locator } of ranked) {
    if (locator.chatId === preferredChatId) return locator;
    try {
      await assertHistoryChatAvailable({ id: locator.chatId, name: locator.chatName });
      return locator;
    } catch (error) {
      if (error instanceof HistoryChatUnavailableError) {
        markBranchStatus(branchIdForChat(locator.chatId), 'broken');
        lastUnavailable = error;
        continue;
      }
      throw error;
    }
  }
  if (lastUnavailable) throw lastUnavailable;
  throw new Error('目标历史节点没有可用的聊天定位信息。');
}

async function getExistingLeafTarget(
  tree: WuxiaHistoryTreeV2,
  node: HistoryNode,
): Promise<{ branch: HistoryBranch; locator: HistoryLocator } | null> {
  for (const branch of Object.values(tree.branches)) {
    if (branch.headNodeId !== node.id || branch.status === 'broken') continue;
    const locator = chooseLocatorForBranch(node, branch);
    if (!locator) continue;
    try {
      await assertHistoryChatAvailable({ id: branch.chatId, name: branch.chatName });
    } catch (error) {
      if (error instanceof HistoryChatUnavailableError) {
        // 分支聊天文件已被删除：标记后继续找其他可复用分支，而不是让本次 checkout 失败
        markBranchStatus(branch.id, 'broken');
        continue;
      }
      throw error;
    }
    return { branch, locator };
  }
  return null;
}

export async function canSwitchSwipeInPlace(nodeId: string): Promise<boolean> {
  const tree = loadHistoryTree();
  const node = tree.nodes[nodeId];
  if (!node || getNodeSuccessors(tree, nodeId).length > 0) return false;
  const current = await readCurrentChatIdentity();
  const locator = node.locators.find(item => item.chatId === current.id);
  if (!locator) return false;
  return locator.assistantMessageId === getLatestAssistantMessageId(readAllHistoryMessages());
}

export class HistoryChatUnavailableError extends Error {
  constructor(
    public readonly chatId: string,
    public readonly chatName: string,
    cause?: unknown,
  ) {
    super(`历史聊天不可用：${chatName}（${chatId}）`, { cause });
    this.name = 'HistoryChatUnavailableError';
  }
}

function normalizeChatFileName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\.jsonl$/i, '');
}

function getCurrentGroupId(): string {
  return String(SillyTavern.groupId ?? '').trim();
}

function getCurrentCharacterIdentity(): { name: string; avatarUrl: string } {
  const characterId = Number(SillyTavern.characterId);
  const character = Number.isInteger(characterId)
    ? (SillyTavern.characters?.[characterId] as { name?: unknown; avatar?: unknown } | undefined)
    : undefined;
  const name = String(character?.name ?? '').trim();
  const avatarUrl = String(character?.avatar ?? '').trim();
  if (!avatarUrl) {
    throw new Error('无法读取当前角色信息，不能安全访问历史聊天。');
  }
  return { name, avatarUrl };
}

async function assertHistoryChatAvailable(chat: HistoryChatIdentity): Promise<void> {
  const groupId = getCurrentGroupId();
  if (groupId) {
    const group = (SillyTavern.groups as Array<{ id?: unknown; chats?: unknown }>).find(
      candidate => String(candidate?.id ?? '') === groupId,
    );
    if (!group) {
      throw new Error(`无法读取当前群组（${groupId}）的聊天列表。`);
    }
    const chatIds = Array.isArray(group.chats) ? group.chats.map(normalizeChatFileName) : [];
    if (!chatIds.includes(chat.id)) {
      throw new HistoryChatUnavailableError(chat.id, chat.name);
    }
    return;
  }

  const { avatarUrl } = getCurrentCharacterIdentity();

  let response: Response;
  try {
    response = await fetch('/api/characters/chats', {
      method: 'POST',
      headers: SillyTavern.getRequestHeaders(),
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });
  } catch (error) {
    throw new Error('无法读取角色聊天列表，历史切换尚未执行。', { cause: error });
  }
  if (!response.ok) {
    throw new Error(`无法读取角色聊天列表（HTTP ${response.status}），历史切换尚未执行。`);
  }

  const payload: unknown = await response.json();
  const entries = Array.isArray(payload) ? payload : isRecord(payload) ? Object.values(payload) : [];
  const chatIds = entries.map(entry => (isRecord(entry) ? normalizeChatFileName(entry.file_name) : '')).filter(Boolean);
  if (!chatIds.includes(chat.id)) {
    throw new HistoryChatUnavailableError(chat.id, chat.name);
  }
}

/**
 * 预填草稿必须剥离原消息中的 era_data 块：旧 MK 若随草稿重新发送，会与 ERA 为新消息
 * 注入的 MK 重复，破坏主干序列。
 */
function cleanDraftUserMessage(text: string): string {
  ERA_DATA_BLOCK_REGEX.lastIndex = 0;
  return text.replace(ERA_DATA_BLOCK_REGEX, '').trim();
}

async function readHistoryUserMessage(chat: HistoryChatIdentity, messageId: number | null): Promise<string> {
  if (messageId === null) return '';
  const current = await readCurrentChatIdentity();
  if (current.id === chat.id) {
    const message = getChatMessages(messageId, {
      role: 'all',
      hide_state: 'all',
      include_swipes: false,
    })[0];
    return message?.role === 'user' ? cleanDraftUserMessage(String(message.message ?? '')) : '';
  }

  const groupId = getCurrentGroupId();
  const endpoint = groupId ? '/api/chats/group/get' : '/api/chats/get';
  const requestBody = groupId
    ? { id: chat.id }
    : (() => {
        const character = getCurrentCharacterIdentity();
        return {
          ch_name: character.name,
          file_name: chat.id,
          avatar_url: character.avatarUrl,
        };
      })();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: SillyTavern.getRequestHeaders(),
      body: JSON.stringify(requestBody),
      cache: 'no-cache',
    });
  } catch (error) {
    throw new Error(`无法读取历史分支中的玩家行动：${chat.name}（${chat.id}）`, { cause: error });
  }
  if (!response.ok) {
    if (response.status === 404) throw new HistoryChatUnavailableError(chat.id, chat.name);
    throw new Error(`无法读取历史分支中的玩家行动（HTTP ${response.status}）。`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    // 酒馆对不存在的聊天文件返回 200 + 空对象而不是 404，视同聊天不可用。
    throw new HistoryChatUnavailableError(chat.id, chat.name);
  }
  const messages = payload.filter(
    (item): item is Record<string, unknown> => isRecord(item) && ('mes' in item || 'message' in item),
  );
  const rawMessage = messages[messageId];
  if (!rawMessage || rawMessage.is_user !== true) return '';
  return cleanDraftUserMessage(String(rawMessage.mes ?? rawMessage.message ?? ''));
}

/** Read a precise assistant swipe from the source chat without navigating away from the branch. */
async function readHistoryAssistantSwipeText(
  chat: HistoryChatIdentity,
  messageId: number,
  swipeId: number,
): Promise<string> {
  const current = await readCurrentChatIdentity();
  if (current.id === chat.id) {
    const message = getChatMessages(messageId, {
      role: 'all',
      hide_state: 'all',
      include_swipes: true,
    })[0] as TavernHistoryMessage | undefined;
    if (!message || getMessageRole(message) !== 'assistant') return '';
    return getSwipeTexts(message).texts[swipeId] ?? '';
  }

  const groupId = getCurrentGroupId();
  const endpoint = groupId ? '/api/chats/group/get' : '/api/chats/get';
  const requestBody = groupId
    ? { id: chat.id }
    : (() => {
        const character = getCurrentCharacterIdentity();
        return { ch_name: character.name, file_name: chat.id, avatar_url: character.avatarUrl };
      })();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: SillyTavern.getRequestHeaders(),
      body: JSON.stringify(requestBody),
      cache: 'no-cache',
    });
  } catch (error) {
    throw new Error(`无法读取历史分支中的 assistant 消息：${chat.name}（${chat.id}）`, { cause: error });
  }
  if (!response.ok) {
    if (response.status === 404) throw new HistoryChatUnavailableError(chat.id, chat.name);
    throw new Error(`无法读取历史分支中的 assistant 消息（HTTP ${response.status}）。`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new HistoryChatUnavailableError(chat.id, chat.name);
  const messages = payload.filter(
    (item): item is Record<string, unknown> => isRecord(item) && ('mes' in item || 'message' in item),
  );
  const rawMessage = messages[messageId];
  if (!rawMessage || rawMessage.is_user === true || rawMessage.is_system === true) return '';
  if (Array.isArray(rawMessage.swipes)) {
    const swipe = rawMessage.swipes[swipeId];
    return typeof swipe === 'string' ? swipe : '';
  }
  if (swipeId !== 0 && Number(rawMessage.swipe_id ?? 0) !== swipeId) return '';
  return String(rawMessage.mes ?? rawMessage.message ?? '');
}

async function openHistoryChatById(chatId: string): Promise<void> {
  const groupId = getCurrentGroupId();
  if (groupId) {
    if (typeof SillyTavern.openGroupChat !== 'function') {
      throw new Error('当前酒馆版本未提供群聊文件切换接口。');
    }
    await SillyTavern.openGroupChat(groupId, chatId);
    return;
  }
  if (typeof SillyTavern.openCharacterChat !== 'function') {
    throw new Error('当前酒馆版本未提供角色聊天文件切换接口。');
  }
  await SillyTavern.openCharacterChat(chatId);
}

async function navigateToHistoryChat(chat: HistoryChatIdentity): Promise<void> {
  await assertHistoryChatAvailable(chat);
  let navigationError: unknown = null;
  try {
    await openHistoryChatById(chat.id);
  } catch (error) {
    navigationError = error;
  }

  const navigated = await readCurrentChatIdentity().catch(() => null);
  if (!navigated) {
    throw new Error(`打开历史聊天后无法确认当前位置：${chat.name}（${chat.id}）`, {
      cause: navigationError ?? undefined,
    });
  }
  if (navigated.id !== chat.id) {
    throw new Error(`酒馆未切换到指定历史聊天：${chat.name}（${chat.id}）`, {
      cause: navigationError ?? undefined,
    });
  }
}

async function openChat(locator: HistoryLocator): Promise<void> {
  const current = await readCurrentChatIdentity();
  if (current.id === locator.chatId) return;
  await navigateToHistoryChat({ id: locator.chatId, name: locator.chatName });
}

async function openChatByIdentity(chat: HistoryChatIdentity): Promise<void> {
  const current = await readCurrentChatIdentity();
  if (current.id === chat.id) return;
  await navigateToHistoryChat(chat);
}

async function activateSwipe(locator: HistoryLocator): Promise<void> {
  await setChatMessages([{ message_id: locator.assistantMessageId, swipe_id: locator.swipeId }], { refresh: 'none' });
}

type RawSillyTavernSwipeMessage = SillyTavern.ChatMessage & {
  send_date?: unknown;
  gen_started?: unknown;
  gen_finished?: unknown;
};

function activateSwipeForBranchSnapshot(locator: HistoryLocator): () => void {
  const message = SillyTavern.chat?.[locator.assistantMessageId] as RawSillyTavernSwipeMessage | undefined;
  if (!message) {
    throw new Error(`目标 assistant 楼层不存在：${locator.assistantMessageId}`);
  }

  const previous = {
    swipeId: message.swipe_id,
    mes: message.mes,
    sendDate: message.send_date,
    genStarted: message.gen_started,
    genFinished: message.gen_finished,
    extra: structuredClone(message.extra ?? {}),
  };
  if (locator.swipeId === 0 && !Array.isArray(message.swipes)) {
    return () => undefined;
  }
  if (!Array.isArray(message.swipes) || typeof message.swipes[locator.swipeId] !== 'string') {
    throw new Error(`目标楼层没有 swipe ${locator.swipeId}，无法创建精确分支。`);
  }
  if (!Array.isArray(message.swipe_info)) {
    message.swipe_info = message.swipes.map(() => ({
      send_date: message.send_date,
      gen_started: undefined,
      gen_finished: undefined,
      extra: {},
    }));
  }

  const swipeInfo = message.swipe_info[locator.swipeId] as
    { send_date?: unknown; gen_started?: unknown; gen_finished?: unknown; extra?: unknown } | undefined;
  message.swipe_id = locator.swipeId;
  message.mes = message.swipes[locator.swipeId];
  message.send_date = swipeInfo?.send_date;
  message.gen_started = swipeInfo?.gen_started;
  message.gen_finished = swipeInfo?.gen_finished;
  message.extra = structuredClone(isRecord(swipeInfo?.extra) ? swipeInfo.extra : {});

  return () => {
    message.swipe_id = previous.swipeId;
    message.mes = previous.mes;
    message.send_date = previous.sendDate;
    message.gen_started = previous.genStarted;
    message.gen_finished = previous.genFinished;
    message.extra = previous.extra;
  };
}

function currentChatMatchesForkSnapshot(locator: HistoryLocator): boolean {
  const messages = readAllHistoryMessages();
  const target = messages.find(message => message.message_id === locator.assistantMessageId);
  if (!target || getMessageRole(target) !== 'assistant') return false;
  const { activeSwipeId } = getSwipeTexts(target);
  const hasLaterMessage = messages.some(message => Number(message.message_id) > locator.assistantMessageId);
  return !hasLaterMessage && activeSwipeId === locator.swipeId;
}

const historyEraSyncTiming = {
  timeoutMs: 30_000,
  quietMs: 600,
};

export function configureHistoryEraSyncTiming(timing: Partial<typeof historyEraSyncTiming>): void {
  Object.assign(historyEraSyncTiming, timing);
}

function matchesHistoryFullSyncSignal(detail: unknown, syncId: string): boolean {
  if (!isRecord(detail)) return false;
  const actions = isRecord(detail.actions) ? detail.actions : null;
  if (actions?.resync !== true) return false;
  return Array.isArray(detail.syncIds) && detail.syncIds.includes(syncId);
}

/**
 * ERA 框架对 manual_full_sync 只做入队（内部合批异步处理），eventEmit 返回时重算尚未开始。
 * 而且 /branch-create 切聊天产生的 chat_changed 等普通 SYNC 也会发出 actions.resync 的
 * era:writeDone——不能把任意一次 resync 当成完成信号，否则完全重算还在中途就放行校验，
 * 事件系统会在错误状态上自动派发事件、封存哈希也对不上。因此这里给 manual_full_sync 带上
 * 唯一 syncId，只认 ERA 回传了该 syncId 的 era:writeDone，之后再等写入链静默一段时间。
 */
async function waitForEraFullResync(): Promise<void> {
  const { timeoutMs, quietMs } = historyEraSyncTiming;
  const syncId = `wuxia-history-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let sawResync = false;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let listener: { stop: () => void } | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (quietTimer) clearTimeout(quietTimer);
      clearTimeout(timeoutTimer);
      listener?.stop();
      if (error) reject(error);
      else resolve();
    };
    const timeoutTimer = setTimeout(() => {
      finish(new Error('等待 ERA 完全重算完成超时，历史校验中止；请在谱牒中重试恢复。'));
    }, timeoutMs);
    const armQuietTimer = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(), quietMs);
    };
    listener = eventOn('era:writeDone', (detail?: unknown) => {
      if (!sawResync && matchesHistoryFullSyncSignal(detail, syncId)) sawResync = true;
      if (sawResync) armQuietTimer();
    });
    void eventEmit('manual_full_sync', { syncId }).catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function readCheckoutEventSystemAudit(): Record<string, { hash: string; count: number }> {
  const variables = getVariables({ type: 'chat' });
  const stat = isRecord(variables?.stat_data) ? variables.stat_data : {};
  const system = isRecord(stat.事件系统) ? stat.事件系统 : {};
  const keys = [...new Set([
    '未发生事件', '进行中事件', '已完成事件', '已失效事件', '人物事件占用',
    ...Object.keys(system),
  ])].sort();
  return Object.fromEntries(keys.map(key => {
    const value = system[key] ?? null;
    return [key, { hash: stableHistoryHash(value), count: isRecord(value) ? Object.keys(value).length : 0 }];
  }));
}

function readCheckoutEraLogInventory(): Record<string, unknown> {
  const vars = getVariables({ type: 'chat' });
  const meta = isRecord(vars?.ERAMetaData) ? vars.ERAMetaData : {};
  const selectedMks: unknown[] = Array.isArray(meta.SelectedMks) ? meta.SelectedMks : [];
  const logs = isRecord(meta.EditLogs) ? meta.EditLogs : {};

  const parseLog = (raw: unknown): unknown[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const selected = selectedMks.map((raw, messageId) => {
    const mk = typeof raw === 'string' ? raw : '';
    const entries = mk ? parseLog(logs[mk]) : [];
    return {
      messageId,
      mk,
      logCount: entries.length,
      eventSystemLogCount: entries.filter(entry =>
        isRecord(entry) && typeof entry.path === 'string' &&
        (entry.path === '事件系统' || entry.path.startsWith('事件系统.')),
      ).length,
    };
  }).filter(item => item.mk);

  return {
    selectedMksLength: selectedMks.length,
    editLogKeysCount: Object.keys(logs).length,
    selectedMksWithLogs: selected.filter(item => item.logCount > 0).length,
    selectedMksWithEventLogs: selected.filter(item => item.eventSystemLogCount > 0).length,
    selectedMks: selected.slice(-32),
    omittedSelectedMks: Math.max(0, selected.length - 32),
  };
}

function recordCheckoutEventSystemAudit(stage: string, journal: HistoryCheckoutJournal | null): void {
  try {
    const expected = journal?.targetNodeId
      ? loadHistoryTree().nodes[journal.targetNodeId]?.verification?.eventPartHashes?.事件系统
      : undefined;
    const current = readCurrentVerification();
    recordEraDiagnostic('wuxia-history-checkout', 'history-checkout-event-system-audit', {
      transactionId: journal?.transactionId ?? '',
      nodeId: journal?.targetNodeId ?? '',
      stage,
      expectedSystemHash: expected ?? '未封存子指纹',
      actualSystemHash: current.eventPartHashes?.事件系统 ?? '',
      bucketFingerprints: readCheckoutEventSystemAudit(),
      eraLogInventory: readCheckoutEraLogInventory(),
    });
    // 恢复时也取一次同算法的事件/人物精确指纹，才能与历史节点封存当刻逐项对比。
    const restoredVars = getVariables({ type: 'chat' });
    recordHistoryEventForensics('checkout-event-verification', {
      transactionId: journal?.transactionId ?? '',
      nodeId: journal?.targetNodeId ?? '',
      checkoutStage: stage,
      chatId: String(SillyTavern.getCurrentChatId?.() ?? ''),
      expectedEventSystemHash: expected ?? null,
      actualEventSystemHash: current.eventPartHashes?.事件系统 ?? null,
      eventSnapshot: snapshotHistoryEventForensics(restoredVars?.stat_data),
    });
  } catch {
    // 采集诊断不能成为历史恢复的新失败来源。
  }
}


/**
 * ERA 历史同步后：仅当 MK 主干已正确恢复，才将无法由 ERA EditLog 回滚的
 * 初始化、历史调度 direct 写入部分校准到节点封存的事件最终状态。
 * 旧节点没有封存快照时维持原校验失败，不伪造可用历史。
 */
async function restoreSealedEventBaseline(journal: HistoryCheckoutJournal | null): Promise<void> {
  if (!journal?.targetNodeId) return;
  const node = loadHistoryTree().nodes[journal.targetNodeId];
  const baseline = node?.verification;
  if (!baseline) return;

  const current = readCurrentVerification();
  if (!acceptsSelectedMksHash(baseline, current.selectedMksHash) ||
      current.eventStateHash === baseline.eventStateHash) return;

  const roots = loadHistoryEventSnapshot(baseline.eventStateHash);
  if (!roots) {
    recordEraDiagnostic('wuxia-history-checkout', 'history-event-snapshot-missing', {
      transactionId: journal.transactionId,
      nodeId: journal.targetNodeId,
      expectedEventStateHash: baseline.eventStateHash,
    });
    return;
  }
  if (stableHistoryHash(roots) !== baseline.eventStateHash) {
    throw new Error('历史事件基准快照校验失败，拒绝载入不可信快照');
  }

  const beforeRoots = readCheckoutEventRoots();
  await updateVariablesWith(variables => {
    const stat = isRecord(variables?.stat_data) ? variables.stat_data : {};
    for (const key of HISTORY_EVENT_ROOTS) {
      const value = roots[key];
      if (value === null) delete stat[key];
      else stat[key] = structuredClone(value);
    }
    variables.stat_data = stat;
    return variables;
  }, { type: 'chat' });
  const restored = readCurrentVerification();
  recordEraDiagnostic('wuxia-history-checkout', 'history-event-snapshot-restored', {
    transactionId: journal.transactionId,
    nodeId: journal.targetNodeId,
    beforeEventStateHash: current.eventStateHash,
    afterEventStateHash: restored.eventStateHash,
    changedPaths: describeChangedEventPaths(beforeRoots, readCheckoutEventRoots()),
  });
  if (restored.eventStateHash !== baseline.eventStateHash ||
      !acceptsSelectedMksHash(baseline, restored.selectedMksHash)) {
    throw new Error('事件基准快照恢复后校验仍不一致');
  }
}

async function runFullHistorySync(prepareVerification = false): Promise<void> {
  const traceJournal = prepareVerification ? readHistoryCheckoutJournal() : null;
  if (prepareVerification) recordCheckoutEventSystemAudit('before-full-sync', traceJournal);
  try {
    await waitForEraFullResync();
  } catch (error) {
    // 只针对超时自动补做一次带全新 syncId 的全量同步。
    // ACK 仍必须真实携带匹配的 syncId；不能把固定延时或无关的 resync 当作成功。
    if (!(error instanceof Error) || !error.message.includes('等待 ERA 完全重算完成超时')) throw error;
    recordEraDiagnostic('wuxia-history-checkout', 'history-full-sync-timeout-auto-retry', {
      transactionId: traceJournal?.transactionId ?? '',
      nodeId: traceJournal?.targetNodeId ?? '',
      maxExtraAttempts: 1,
    });
    await waitForEraFullResync();
  }
  if (prepareVerification) recordCheckoutEventSystemAudit('after-full-sync', traceJournal);
  if (prepareVerification) {
    // 保留纯 ERA 重放后的证据，之后的事件基准恢复不得伪装成 ERA 自己回滚成功。
    const journal = readHistoryCheckoutJournal();
    const rawAfterEra = readCurrentVerification();
    await restoreSealedEventBaseline(journal);
    recordCheckoutEventSystemAudit('after-snapshot-restore', journal);
    const afterEra = readCurrentVerification();
    const rootsAfterEra = readCheckoutEventRoots();
    await eventEmit(WUXIA_HISTORY_PREPARE_VERIFICATION_EVENT, {
      transactionId: journal?.transactionId ?? '',
    });
    const afterPrepare = readCurrentVerification();
    recordCheckoutEventSystemAudit('after-event-prepare', journal);
    const rootsAfterPrepare = readCheckoutEventRoots();
    // 只持久化诊断哈希与变更路径，不额外保存游戏变量或污染分支状态。
    updateHistoryCheckoutJournal({
      verificationTrace: {
        eraSelectedMksHash: rawAfterEra.selectedMksHash,
        eraEventStateHash: rawAfterEra.eventStateHash,
        preparedSelectedMksHash: afterPrepare.selectedMksHash,
        preparedEventStateHash: afterPrepare.eventStateHash,
        changedPaths: describeChangedEventPaths(rootsAfterEra, rootsAfterPrepare),
      },
    });
  }
}

function getNodePath(tree: WuxiaHistoryTreeV2, headNodeId: string): HistoryNode[] {
  const path: HistoryNode[] = [];
  const seen = new Set<string>();
  let currentId: string | null = headNodeId;
  while (currentId) {
    if (seen.has(currentId)) throw new Error('历史树存在循环 parentId，无法恢复来源分支。');
    seen.add(currentId);
    const node: HistoryNode | undefined = tree.nodes[currentId];
    if (!node) throw new Error(`来源分支路径缺少节点：${currentId}`);
    path.push(node);
    currentId = node.parentId;
  }
  return path.reverse();
}

function getContinuationDraftUserMessageId(
  tree: WuxiaHistoryTreeV2,
  targetNodeId: string,
  locator: HistoryLocator,
): number | null {
  const branch = tree.branches[branchIdForChat(locator.chatId)];
  if (!branch?.headNodeId) return null;
  const path = getNodePath(tree, branch.headNodeId);
  const targetIndex = path.findIndex(node => node.id === targetNodeId);
  if (targetIndex < 0 || targetIndex >= path.length - 1) return null;
  const nextNode = path[targetIndex + 1];
  const nextLocator = nextNode.locators.find(candidate => candidate.chatId === locator.chatId);
  return nextLocator?.userMessageId ?? null;
}

function resolveBranchSourceLocator(node: HistoryNode, journal: HistoryCheckoutJournal): HistoryLocator {
  if (journal.branchSourceLocator) return journal.branchSourceLocator;
  const sourceLocator = node.locators.find(locator => locator.chatId === journal.sourceChatId);
  return sourceLocator ?? journal.targetLocator;
}

async function restoreCheckoutSourcePath(tree: WuxiaHistoryTreeV2, journal: HistoryCheckoutJournal): Promise<void> {
  await openChatByIdentity({ id: journal.sourceChatId, name: journal.sourceChatName });
  if (journal.sourceHeadNodeId) {
    const patches = getNodePath(tree, journal.sourceHeadNodeId)
      .map(node => node.locators.find(locator => locator.chatId === journal.sourceChatId))
      .filter((locator): locator is HistoryLocator => Boolean(locator))
      .sort((left, right) => left.assistantMessageId - right.assistantMessageId)
      .map(locator => ({
        message_id: locator.assistantMessageId,
        swipe_id: locator.swipeId,
      }));
    if (patches.length > 0) {
      await setChatMessages(patches, { refresh: 'none' });
    }
  }
  await runFullHistorySync();
}

function markBranchStatus(
  branchId: string | null,
  status: HistoryBranch['status'],
  fallback?: { chatId: string; chatName: string; originNodeId: string | null },
): WuxiaHistoryTreeV2 {
  const tree = cloneTree(loadHistoryTree());
  if (branchId && tree.branches[branchId]) {
    tree.branches[branchId] = { ...tree.branches[branchId], status };
  } else if (branchId && fallback) {
    tree.branches[branchId] = {
      id: branchId,
      chatId: fallback.chatId,
      chatName: fallback.chatName,
      originNodeId: fallback.originNodeId,
      headNodeId: fallback.originNodeId,
      createdAt: Date.now(),
      status,
    };
  }
  return persistHistoryTree(tree);
}

class HistoryVerificationError extends Error {
  constructor(
    message: string,
    readonly diagnostics?: string,
    readonly userMessage?: string,
  ) {
    super(message);
    this.name = 'HistoryVerificationError';
  }
}

/** 保留原始异常在技术诊断中；恢复界面只显示可理解的错误。 */
function summarizeCheckoutFailure(error: unknown): string {
  if (error instanceof HistoryVerificationError) {
    return error.userMessage ?? '历史节点校验未通过，请重试恢复。';
  }
  if (error instanceof HistoryChatUnavailableError) {
    return '历史聊天不可用，请检查原聊天文件。';
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('超时')) return '历史恢复超时，请重试恢复。';
  if (message.includes('快照')) return '历史事件快照校验未通过。';
  if (/不存在|未找到|没有找到|未切换到/.test(message)) return '未找到目标历史聊天或楼层。';
  return '历史恢复未完成，请重试或返回原聊天。';
}

function describeCheckoutNodeMismatch(
  state: HistoryTreeViewState,
  targetNodeId: string,
  journal: HistoryCheckoutJournal,
): string {
  const tree = state.tree;
  const expected = tree.nodes[targetNodeId];
  const actual = state.currentNodeId ? tree.nodes[state.currentNodeId] : null;
  const pathOf = (nodeId: string | null): HistoryNode[] => {
    if (!nodeId || !tree.nodes[nodeId]) return [];
    try {
      return getNodePath(tree, nodeId);
    } catch {
      return [];
    }
  };
  const expectedPath = pathOf(targetNodeId);
  const actualPath = pathOf(state.currentNodeId);
  let divergedAt = 0;
  while (
    divergedAt < expectedPath.length &&
    divergedAt < actualPath.length &&
    expectedPath[divergedAt].id === actualPath[divergedAt].id
  ) divergedAt += 1;
  const describeNode = (node: HistoryNode | null | undefined): string => {
    if (!node) return '无';
    const locator = node.locators.find(candidate => candidate.chatId === state.currentChat.id)
      ?? node.locators[0];
    return [
      node.id,
      `parent=${node.parentId ?? 'root'}`,
      `MK=${node.messageKey ?? '无'}`,
      `Assistant=${locator?.assistantMessageId ?? '无'}`,
      `swipe=${locator?.swipeId ?? '无'}`,
      `locatorChat=${locator?.chatId ?? '无'}`,
    ].join('；');
  };
  const displayPath = (path: HistoryNode[]): string[] =>
    path.slice(Math.max(0, divergedAt - 1), divergedAt + 5)
      .map((node, index) => `  第${Math.max(0, divergedAt - 1) + index + 1}节点：${describeNode(node)}`);

  const lines = [
    `目标节点：${targetNodeId}`,
    `实际活动叶节点：${state.currentNodeId ?? '无'}`,
    `当前聊天：${state.currentChat.id}（${state.currentChat.name}）`,
    `分叉预期楼层：Assistant ${journal.targetLocator.assistantMessageId} / swipe ${journal.targetLocator.swipeId}`,
    `目标节点当前仍存在：${Boolean(expected)}；目标节点有当前聊天 locator：${Boolean(expected?.locators.some(x => x.chatId === state.currentChat.id))}`,
    `目标节点详情：${describeNode(expected)}`,
    `实际节点详情：${describeNode(actual)}`,
    `目标链长度：${expectedPath.length}；实际链长度：${actualPath.length}；首个不同节点序号：${divergedAt + 1}`,
    '目标链（分歧附近）：',
    ...displayPath(expectedPath),
    '实际链（分歧附近）：',
    ...displayPath(actualPath),
  ];
  recordEraDiagnostic('wuxia-history-checkout', 'history-checkout-node-identity-audit', {
    transactionId: journal.transactionId,
    nodeId: targetNodeId,
    chatId: state.currentChat.id,
    actualNodeId: state.currentNodeId,
    divergenceIndex: divergedAt,
    expectedPath: expectedPath.slice(Math.max(0, divergedAt - 1), divergedAt + 5).map(node => ({
      id: node.id, parentId: node.parentId, mk: node.messageKey,
    })),
    actualPath: actualPath.slice(Math.max(0, divergedAt - 1), divergedAt + 5).map(node => ({
      id: node.id, parentId: node.parentId, mk: node.messageKey,
    })),
  });
  return lines.join('\n');
}

/** 封存值只作为证据，不修改 SelectedMks、消息或 ERA 日志。诊断失败不能遮盖原始校验异常。 */
function describeCheckoutMkMismatch(sealedHash: string, node: HistoryNode | undefined): string[] {
  try {
    const vars = getVariables({ type: 'chat' });
    const selectedMks = Array.isArray(vars?.ERAMetaData?.SelectedMks)
      ? vars.ERAMetaData.SelectedMks as unknown[] : [];
    const saved = loadHistoryMkSnapshot(sealedHash);
    const baseline = saved && stableHistoryHash(saved) === sealedHash ? saved : null;
    const messages = readAllHistoryMessages().map(message => {
      const { texts, activeSwipeId } = getSwipeTexts(message);
      const activeSwipeText = texts[activeSwipeId] ?? '';
      const activeText = typeof message.mes === 'string' ? message.mes : activeSwipeText;
      return {
        messageId: message.message_id,
        role: getMessageRole(message),
        mk: extractMessageKey(activeText),
        swipeMk: extractMessageKey(activeSwipeText),
      };
    });
    const targetMessageId = node?.locators.find(locator => locator.chatId ===
      String(SillyTavern.getCurrentChatId?.() ?? ''))?.assistantMessageId ??
      node?.locators[0]?.assistantMessageId;
    const target = messages.find(message => message.messageId === targetMessageId);
    return [
      ...describeHistoryMkDifferences(baseline, selectedMks, messages),
      '目标节点 Assistant 楼层：' + (targetMessageId ?? '未知') +
        '；节点保存的 MK：' + (node?.messageKey ?? '未记录') +
        '；当前消息 MK：' + (target?.mk ?? '未找到'),
    ];
  } catch (error) {
    return ['逐楼 MK 诊断采集失败：' + (error instanceof Error ? error.message : String(error))];
  }
}

interface AppliedAutomaticMkRepair {
  nodeId: string;
  transactionId: string;
  original: HistoryVerification;
  repaired: HistoryVerification;
}

/**
 * 对旧版不可信 MK 封存自动纠错：来源见证 + 完整逐楼对账 + 事件整体指纹必须同时成立。
 * 存在可信旧 MK 快照时绝不自动改写；不能靠分支自身的哈希证明旧记录错误。
 */
function tryApplyAutomaticLegacyMkRepair(
  journal: HistoryCheckoutJournal,
  node: HistoryNode,
  state: HistoryTreeViewState,
): AppliedAutomaticMkRepair | null {
  const original = node.verification;
  if (!original || journal.actionKind !== 'fork_branch' || journal.stage !== 'verify' ||
      state.currentNodeId !== node.id ||
      state.currentChat.id !== journal.targetLocator.chatId) return null;

  const current = readCurrentVerification();
  if (acceptsSelectedMksHash(original, current.selectedMksHash) ||
      current.eventStateHash !== original.eventStateHash) return null;

  const witness = readCheckoutSourceMkWitness(journal.transactionId);
  if (!witness ||
      witness.targetNodeId !== node.id ||
      witness.sourceChatId !== journal.sourceChatId ||
      witness.targetMessageId !== journal.targetLocator.assistantMessageId ||
      witness.targetSwipeId !== journal.targetLocator.swipeId ||
      !nodeAcceptsMessageKey(node, witness.targetMk) ||
      witness.originalSelectedMksHash !== original.selectedMksHash ||
      witness.eventStateHash !== original.eventStateHash ||
      current.selectedMksHash !== witness.alignedPrefixHash) return null;

  // 旧快照可信时可能是真实旧聊天修改，绝不能将其误认成旧封存错误。
  const originalSnapshot = loadHistoryMkSnapshot(original.selectedMksHash);
  if (originalSnapshot && stableHistoryHash(originalSnapshot) === original.selectedMksHash) return null;

  let aligned: (string | null)[];
  try {
    aligned = assertCurrentHistoryMksAligned(state.tree.nodes[node.id]);
  } catch {
    // 实际聊天 MK 未对齐时，保留严格校验失败；不将安全检查错误解释为可修复。
    return null;
  }
  if (aligned.length !== witness.targetMessageId + 1 ||
      stableHistoryHash(aligned) !== current.selectedMksHash) return null;

  // 并发保护：记录和更新之间不能换节点或静默换指纹。
  const tree = cloneTree(loadHistoryTree());
  if (tree.nodes[node.id]?.verification?.selectedMksHash !== original.selectedMksHash ||
      tree.nodes[node.id]?.verification?.eventStateHash !== original.eventStateHash) return null;
  const repaired = { ...original, selectedMksHash: current.selectedMksHash };
  // 保存审计失败则原历史树保持原样，不允许进行不可追溯的修复。
  persistHistoryVerificationRepairAudit({
    timestamp: Date.now(),
    transactionId: journal.transactionId,
    nodeId: node.id,
    sourceChatId: journal.sourceChatId,
    targetChatId: journal.targetLocator.chatId,
    sourceWitness: witness,
    oldVerification: original,
    newVerification: repaired,
    status: 'automatic-attempt',
  });
  tree.nodes[node.id] = { ...tree.nodes[node.id], verification: repaired };
  persistHistoryTree(tree);
  recordEraDiagnostic('wuxia-history-checkout', 'history-verification-auto-repair-applied', {
    transactionId: journal.transactionId, nodeId: node.id,
    oldHash: original.selectedMksHash, newHash: repaired.selectedMksHash,
  });
  return { nodeId: node.id, transactionId: journal.transactionId, original, repaired };
}

function rollbackAutomaticLegacyMkRepair(applied: AppliedAutomaticMkRepair): void {
  const tree = cloneTree(loadHistoryTree());
  if (tree.nodes[applied.nodeId]?.verification?.selectedMksHash !== applied.repaired.selectedMksHash) return;
  tree.nodes[applied.nodeId] = { ...tree.nodes[applied.nodeId], verification: applied.original };
  persistHistoryTree(tree);
  recordEraDiagnostic('wuxia-history-checkout', 'history-verification-auto-repair-rolled-back', {
    nodeId: applied.nodeId, transactionId: applied.transactionId,
  });
}

/**
 * A failed fork scan can leave an MK-keyed duplicate in the tree. Reconcile it only when
 * the checkout journal + pre-fork source witness identify the exact source locator, the
 * branch still ends at that same assistant/swipe, normalized source and branch text match,
 * all current SelectedMks align to messages, and the event-state seal is unchanged.
 * A changed branch MK is then recorded as an accepted hash variant; the original seal is
 * never overwritten.
 */
async function reconcileForkBranchMkIdentity(
  journal: HistoryCheckoutJournal,
  state: HistoryTreeViewState,
  targetNodeId: string,
): Promise<HistoryTreeViewState | null> {
  const reject = (reason: string, detail: Record<string, unknown> = {}): null => {
    recordEraDiagnostic('wuxia-history-checkout', 'history-branch-mk-identity-reconcile-skipped', {
      transactionId: journal.transactionId,
      targetNodeId,
      reason,
      ...detail,
    });
    return null;
  };
  if (journal.actionKind !== 'fork_branch' || journal.stage !== 'verify' ||
      state.currentChat.id !== journal.targetLocator.chatId) {
    return reject('transaction-or-chat-mismatch', {
      actionKind: journal.actionKind,
      stage: journal.stage,
      currentChatId: state.currentChat.id,
      targetChatId: journal.targetLocator.chatId,
    });
  }
  const sourceLocator = journal.branchSourceLocator;
  if (!sourceLocator || sourceLocator.chatId !== journal.sourceChatId ||
      sourceLocator.assistantMessageId !== journal.targetLocator.assistantMessageId ||
      sourceLocator.swipeId !== journal.targetLocator.swipeId) {
    return reject('source-locator-mismatch', {
      sourceLocator: sourceLocator ?? null,
      sourceChatId: journal.sourceChatId,
      targetLocator: journal.targetLocator,
    });
  }

  const target = state.tree.nodes[targetNodeId];
  const actual = state.currentNodeId ? state.tree.nodes[state.currentNodeId] : null;
  if (!target || !actual || actual.parentId !== target.parentId) {
    return reject('node-or-parent-mismatch', {
      actualNodeId: actual?.id ?? null,
      targetParentId: target?.parentId ?? null,
      actualParentId: actual?.parentId ?? null,
    });
  }
  const targetVerification = target.verification ?? null;
  const sourceLocatorOnTarget = target.locators.find(locator =>
    locator.chatId === sourceLocator.chatId &&
    locator.assistantMessageId === sourceLocator.assistantMessageId &&
    locator.swipeId === sourceLocator.swipeId,
  );
  const branchLocator = actual.locators.find(locator =>
    locator.chatId === state.currentChat.id &&
    locator.assistantMessageId === journal.targetLocator.assistantMessageId &&
    locator.swipeId === journal.targetLocator.swipeId,
  );
  if (!sourceLocatorOnTarget || !branchLocator) {
    return reject('source-or-branch-locator-missing', {
      hasSourceLocator: Boolean(sourceLocatorOnTarget),
      hasBranchLocator: Boolean(branchLocator),
      sourceChatId: sourceLocator.chatId,
      branchChatId: state.currentChat.id,
      sourceAssistantMessageId: sourceLocator.assistantMessageId,
      branchAssistantMessageId: journal.targetLocator.assistantMessageId,
      swipeId: journal.targetLocator.swipeId,
    });
  }

  const currentMessages = readAllHistoryMessages();
  const branchMessage = currentMessages.find(message =>
    message.message_id === journal.targetLocator.assistantMessageId,
  );
  const branchSwipe = branchMessage ? getSwipeTexts(branchMessage) : null;
  const branchText = branchSwipe?.texts[journal.targetLocator.swipeId] ?? '';
  if (!branchMessage || !branchSwipe ||
      branchSwipe.activeSwipeId !== journal.targetLocator.swipeId || !branchText.trim()) {
    return reject('branch-message-or-swipe-mismatch', {
      foundBranchMessage: Boolean(branchMessage),
      activeSwipeId: branchSwipe?.activeSwipeId ?? null,
      expectedSwipeId: journal.targetLocator.swipeId,
      hasBranchText: Boolean(branchText.trim()),
    });
  }

  let sourceText: string;
  try {
    sourceText = await readHistoryAssistantSwipeText(
      { id: sourceLocator.chatId, name: sourceLocator.chatName },
      sourceLocator.assistantMessageId,
      sourceLocator.swipeId,
    );
  } catch (error) {
    recordEraDiagnostic('wuxia-history-checkout', 'history-branch-mk-identity-source-read-failed', {
      transactionId: journal.transactionId,
      targetNodeId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return reject('source-message-read-failed');
  }
  const sourceMk = extractMessageKey(sourceText);
  const branchMk = extractMessageKey(branchText);
  const sourceContent = cleanStoryTextForIdentityComparison(sourceText);
  const branchContent = cleanStoryTextForIdentityComparison(branchText);
  if (!sourceText.trim() || !sourceContent || sourceContent !== branchContent) {
    return reject('source-and-branch-content-differ', {
      hasSourceText: Boolean(sourceText.trim()),
      hasSourceContent: Boolean(sourceContent),
      sourceContentHash: sourceContent ? stableHistoryHash(sourceContent) : null,
      branchContentHash: branchContent ? stableHistoryHash(branchContent) : null,
    });
  }

  const witness = readCheckoutSourceMkWitness(journal.transactionId);
  const witnessMatches = Boolean(
    witness &&
    witness.transactionId === journal.transactionId &&
    witness.targetNodeId === target.id &&
    witness.sourceChatId === journal.sourceChatId &&
    witness.targetMessageId === journal.targetLocator.assistantMessageId &&
    witness.targetSwipeId === journal.targetLocator.swipeId &&
    sourceMk === witness.targetMk &&
    nodeAcceptsMessageKey(target, witness.targetMk) &&
    (!targetVerification ||
      (witness.originalSelectedMksHash === targetVerification.selectedMksHash &&
       witness.eventStateHash === targetVerification.eventStateHash)),
  );
  // Older/unsealed nodes have no pre-fork witness. For those nodes, the stable content ID
  // itself is a strong source identity proof: recomputing it from the exact source locator
  // must reproduce the original node ID. Never use this fallback for an MK-keyed node.
  const sourceContentIdentityMatches = target.messageKey === null &&
    getNodeId(target.parentId, null, sourceText, sourceLocator.swipeId) === target.id;
  if (!witnessMatches && !sourceContentIdentityMatches) {
    return reject('no-trusted-source-identity-proof', {
      witnessPresent: Boolean(witness),
      witnessMatches,
      sourceContentIdentityMatches,
      sourceMk,
      targetMessageKey: target.messageKey,
      sourceContentNodeId: getNodeId(target.parentId, null, sourceText, sourceLocator.swipeId),
    });
  }
  if (branchMk && !nodeAcceptsMessageKey(actual, branchMk)) {
    return reject('branch-mk-not-accepted-by-actual-node', {
      branchMk,
      actualMessageKey: actual.messageKey,
      actualMessageKeyAliases: actual.messageKeyAliases ?? [],
    });
  }
  if (actual.id !== getNodeId(actual.parentId, branchMk, branchText, journal.targetLocator.swipeId)) {
    return reject('actual-node-id-does-not-match-branch-message', {
      actualNodeId: actual.id,
      expectedActualNodeId: getNodeId(actual.parentId, branchMk, branchText, journal.targetLocator.swipeId),
      branchMk,
    });
  }

  let alignedMks: (string | null)[];
  try {
    alignedMks = assertCurrentHistoryMksAligned();
  } catch (error) {
    recordEraDiagnostic('wuxia-history-checkout', 'history-branch-mk-identity-alignment-rejected', {
      transactionId: journal.transactionId,
      targetNodeId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return reject('selected-mks-not-aligned');
  }
  const currentVerification = readCurrentVerification();
  if (stableHistoryHash(alignedMks) !== currentVerification.selectedMksHash) {
    return reject('selected-mks-hash-changed-during-verification', {
      alignedMksHash: stableHistoryHash(alignedMks),
      currentSelectedMksHash: currentVerification.selectedMksHash,
    });
  }
  // Identity and event-seal validation are separate concerns. Reconcile the node identity
  // even if the event seal later fails, but only whitelist the branch-local MK hash when
  // the original event seal is still identical. commitVerification remains the authority
  // that accepts or rejects the sealed event state.
  const eventSealMatches = !targetVerification ||
    currentVerification.eventStateHash === targetVerification.eventStateHash;

  const latest = cloneTree(loadHistoryTree());
  const latestTarget = latest.nodes[targetNodeId];
  const latestActual = latest.nodes[actual.id];
  const branch = latest.branches[state.currentBranchId];
  if (!latestTarget || !latestActual || !branch ||
      branch.chatId !== state.currentChat.id ||
      (latestTarget.verification?.selectedMksHash ?? null) !== (targetVerification?.selectedMksHash ?? null) ||
      (latestTarget.verification?.eventStateHash ?? null) !== (targetVerification?.eventStateHash ?? null) ||
      latestActual.parentId !== latestTarget.parentId ||
      !latestTarget.locators.some(locator =>
        locator.chatId === sourceLocator.chatId &&
        locator.assistantMessageId === sourceLocator.assistantMessageId &&
        locator.swipeId === sourceLocator.swipeId,
      )) {
    return reject('history-tree-changed-during-reconciliation');
  }

  const acceptedHashes = new Set(latestTarget.verification?.acceptedSelectedMksHashes ?? []);
  if (eventSealMatches && latestTarget.verification &&
      currentVerification.selectedMksHash !== latestTarget.verification.selectedMksHash) {
    acceptedHashes.add(currentVerification.selectedMksHash);
  }
  const aliases = new Set(latestTarget.messageKeyAliases ?? []);
  if (branchMk) aliases.add(branchMk);
  const nextTarget = appendLocator({
    ...latestTarget,
    messageKeyAliases: [...aliases],
    verification: latestTarget.verification
      ? {
          ...latestTarget.verification,
          ...(acceptedHashes.size ? { acceptedSelectedMksHashes: [...acceptedHashes] } : {}),
        }
      : null,
  }, branchLocator);
  latest.nodes[targetNodeId] = nextTarget;

  if (actual.id !== targetNodeId) {
    latest.nodes[actual.id] = {
      ...latestActual,
      locators: latestActual.locators.filter(locator => !locatorEquals(locator, branchLocator)),
    };
  }
  latest.branches[state.currentBranchId] = {
    ...branch,
    originNodeId: branch.originNodeId === actual.id ? targetNodeId : branch.originNodeId,
    headNodeId: targetNodeId,
    status: eventSealMatches ? branch.status : 'recovery_failed',
  };

  if (actual.id !== targetNodeId) {
    const orphan = latest.nodes[actual.id];
    if (orphan && orphan.locators.length === 0 && !orphan.pinned && !orphan.label && !orphan.verification) {
      const hasChildren = Object.values(latest.nodes).some(node => node.parentId === orphan.id);
      const isReferenced = Object.values(latest.branches).some(candidate =>
        candidate.headNodeId === orphan.id || candidate.originNodeId === orphan.id,
      );
      if (!hasChildren && !isReferenced) delete latest.nodes[actual.id];
    }
  }

  persistHistoryIdentityAliasAudit({
    timestamp: Date.now(),
    transactionId: journal.transactionId,
    targetNodeId,
    duplicateNodeId: actual.id === targetNodeId ? null : actual.id,
    sourceChatId: journal.sourceChatId,
    targetChatId: journal.targetLocator.chatId,
    sourceMk,
    branchMk,
    sourceContentHash: stableHistoryHash(sourceContent),
    branchContentHash: stableHistoryHash(branchContent),
    originalSelectedMksHash: targetVerification?.selectedMksHash ?? null,
    currentSelectedMksHash: currentVerification.selectedMksHash,
    eventStateHash: currentVerification.eventStateHash,
    eventSealMatches,
    sourceProof: witnessMatches ? 'transaction-witness' : 'content-derived-node-id',
    status: eventSealMatches ? 'identity-reconciled' : 'identity-reconciled-event-seal-mismatch',
  });
  const persisted = persistHistoryTree(latest);
  recordEraDiagnostic('wuxia-history-checkout', 'history-branch-mk-identity-reconciled', {
    transactionId: journal.transactionId,
    targetNodeId,
    duplicateNodeId: actual.id === targetNodeId ? null : actual.id,
    sourceMk,
    branchMk,
    eventSealMatches,
    acceptedSelectedMksHash: eventSealMatches && targetVerification
      ? currentVerification.selectedMksHash
      : null,
    sourceProof: witnessMatches ? 'transaction-witness' : 'content-derived-node-id',
  });
  return buildViewState(persisted, state.currentChat);
}

function commitVerification(
  state: HistoryTreeViewState,
  targetNodeId: string,
  baseline: HistoryVerification | null,
): HistoryTreeViewState {
  const verification = readCurrentVerification();
  const mksSame = acceptsSelectedMksHash(baseline, verification.selectedMksHash);
  if (baseline && (!mksSame || baseline.eventStateHash !== verification.eventStateHash)) {
    const eventSame = baseline.eventStateHash === verification.eventStateHash;
    const eventDetails = baseline.eventPartHashes
      ? HISTORY_EVENT_STATE_KEYS.map(key => {
          const expected = baseline.eventPartHashes?.[key] ?? '未记录';
          const actual = verification.eventPartHashes?.[key] ?? '未记录';
          return `${key}：${expected === actual ? '一致' : '不一致'}（封存 ${expected}；恢复 ${actual}）`;
        })
      : ['旧封存记录没有逐组事件指纹，无法准确归因到某一组事件字段。'];
    const mismatchedEventRoots = !eventSame && baseline.eventPartHashes
      ? HISTORY_EVENT_STATE_KEYS.filter(key =>
          baseline.eventPartHashes?.[key] !== verification.eventPartHashes?.[key],
        )
      : [];
    const mismatchedNames = [
      ...(!mksSame ? ['历史记录'] : []),
      ...(!eventSame ? (mismatchedEventRoots.length ? mismatchedEventRoots : ['事件状态']) : []),
    ];
    throw new HistoryVerificationError(
      `历史节点校验失败：ERA 主干或事件状态与封存记录不一致（主干${mksSame ? '一致' : '不一致'}，事件状态${eventSame ? '一致' : '不一致'}）。`,
      [
        `ERA SelectedMks：封存 ${baseline.selectedMksHash}；恢复 ${verification.selectedMksHash}`,
        ...(!mksSame ? describeCheckoutMkMismatch(baseline.selectedMksHash, state.tree.nodes[targetNodeId]) : []),
        `事件整体：封存 ${baseline.eventStateHash}；恢复 ${verification.eventStateHash}`,
        ...eventDetails,
      ].join('\n'),
      `${mismatchedNames.join('、')}不匹配。`,
    );
  }

  const tree = cloneTree(state.tree);
  const node = tree.nodes[targetNodeId];
  if (!node) throw new HistoryVerificationError('切换后的聊天中没有找到目标历史节点。');
  tree.nodes[targetNodeId] = { ...node, verification: baseline ?? verification };
  tree.branches[state.currentBranchId] = {
    ...tree.branches[state.currentBranchId],
    status: 'active',
    headNodeId: targetNodeId,
  };
  return buildViewState(persistHistoryTree(tree), state.currentChat);
}

function makeCheckoutResult(
  status: HistoryCheckoutResult['status'],
  actionKind: CheckoutActionKind,
  nodeId: string,
  state: HistoryTreeViewState | null,
  error: string | null,
  postCommitChatName: string | null = null,
): HistoryCheckoutResult {
  return {
    status,
    actionKind,
    nodeId,
    currentNodeId: state?.currentNodeId ?? null,
    currentBranchId: state?.currentBranchId ?? null,
    currentChat: state?.currentChat ?? null,
    postCommitChatName,
    error,
  };
}

async function selectCheckoutAction(
  tree: WuxiaHistoryTreeV2,
  node: HistoryNode,
  forceBranch: boolean,
): Promise<{
  actionKind: CheckoutActionKind;
  locator: HistoryLocator;
  targetBranchId: string | null;
  draftUserMessageId: number | null;
}> {
  if (!forceBranch && (await canSwitchSwipeInPlace(node.id))) {
    const current = await readCurrentChatIdentity();
    const locator = node.locators.find(item => item.chatId === current.id);
    if (locator) {
      return {
        actionKind: 'in_place_swipe',
        locator,
        targetBranchId: branchIdForChat(current.id),
        draftUserMessageId: null,
      };
    }
  }
  if (!forceBranch) {
    const existing = await getExistingLeafTarget(tree, node);
    if (existing) {
      return {
        actionKind: 'existing_branch',
        locator: existing.locator,
        targetBranchId: existing.branch.id,
        draftUserMessageId: null,
      };
    }
  }
  const currentChatId = await readCurrentChatIdentity()
    .then(chat => chat.id)
    .catch(() => undefined);
  const locator = await chooseAvailableLocator(tree, node, currentChatId);
  return {
    actionKind: 'fork_branch',
    locator,
    targetBranchId: null,
    draftUserMessageId: getContinuationDraftUserMessageId(tree, node.id, locator),
  };
}

async function executeCheckout(
  nodeId: string,
  options: CheckoutHistoryOptions,
  existingJournal: HistoryCheckoutJournal | null,
): Promise<HistoryCheckoutResult> {
  let state: HistoryTreeViewState | null = null;
  let actionKind: CheckoutActionKind = 'fork_branch';
  let failureStep = '读取目标历史节点';
  let automaticMkRepair: AppliedAutomaticMkRepair | null = null;
  try {
    const tree = loadHistoryTree();
    let node = tree.nodes[nodeId];
    if (!node) throw new Error(`历史节点不存在：${nodeId}`);

    failureStep = '识别当前来源聊天';
    const sourceChat = await readCurrentChatIdentity();
    const sourceBranch = tree.branches[branchIdForChat(sourceChat.id)];
    let journal = existingJournal;
    if (!journal) {
      failureStep = '等待待处理的游戏数据写入';
      await flushPendingGameDataCompletion('before-history-checkout');
      failureStep = '选择节点切换或创建分支方式';
      const selected = await selectCheckoutAction(tree, node, options.forceBranch === true);
      actionKind = selected.actionKind;
      failureStep = '读取分支后续输入草稿';
      const draftMessage =
        selected.actionKind === 'fork_branch'
          ? await readHistoryUserMessage(
              { id: selected.locator.chatId, name: selected.locator.chatName },
              selected.draftUserMessageId,
            )
          : '';
      failureStep = '创建历史恢复事务记录';
      journal = createHistoryCheckoutJournal({
        targetNodeId: nodeId,
        targetLocator: selected.locator,
        actionKind,
        branchSourceLocator: selected.actionKind === 'fork_branch' ? selected.locator : null,
        draftUserMessageId: selected.draftUserMessageId,
        draftMessage,
        sourceHeadNodeId: sourceBranch?.headNodeId ?? '',
        sourceChatId: sourceChat.id,
        sourceChatName: sourceChat.name,
        postCommitChatName:
          actionKind === 'fork_branch' ? suggestForkChatName(tree, nodeId, sourceChat.name) : undefined,
      });
      // 在执行 branch-create 之前采集来源聊天的已对齐 MK 前缀。
      // repair 只信任这种同事务的来源见证，不从失败分支伪造来源证据。
      if (actionKind === 'fork_branch') captureCheckoutSourceMkWitness(journal, node);
    } else if (journal.actionKind) {
      actionKind = journal.actionKind;
    } else if (journal.stage === 'create_branch' || journal.branchSourceLocator) {
      actionKind = 'fork_branch';
    } else {
      actionKind = (await selectCheckoutAction(tree, node, false)).actionKind;
    }

    if (actionKind === 'fork_branch' && journal.draftUserMessageId === undefined) {
      failureStep = '补全旧事务的分支输入草稿';
      const branchSourceLocator = resolveBranchSourceLocator(node, journal);
      const draftUserMessageId = getContinuationDraftUserMessageId(tree, node.id, branchSourceLocator);
      const draftMessage = await readHistoryUserMessage(
        { id: branchSourceLocator.chatId, name: branchSourceLocator.chatName },
        draftUserMessageId,
      );
      journal =
        updateHistoryCheckoutJournal({
          actionKind: 'fork_branch',
          branchSourceLocator,
          draftUserMessageId,
          draftMessage,
        }) ?? journal;
    }

    if (journal.stage === 'navigate_source') {
      failureStep = '切换至历史节点所在聊天';
      if (actionKind === 'fork_branch') {
        const branchSourceLocator = resolveBranchSourceLocator(node, journal);
        await openChat(branchSourceLocator);
        journal = updateHistoryCheckoutJournal({ stage: 'create_branch' }) ?? journal;
      } else {
        await openChat(journal.targetLocator);
        journal = updateHistoryCheckoutJournal({ stage: 'activate_swipe' }) ?? journal;
      }
    }

    if (journal.stage === 'create_branch') {
      failureStep = '创建历史分支聊天';
      const branchSourceLocator = resolveBranchSourceLocator(node, journal);
      const current = await readCurrentChatIdentity();
      let branchedChat: HistoryChatIdentity;
      if (current.id !== branchSourceLocator.chatId && currentChatMatchesForkSnapshot(branchSourceLocator)) {
        // /branch-create 会切换聊天并销毁当前 iframe。新 iframe 从 create_branch
        // 恢复时，可以用截断后的末楼和 swipe 确认当前聊天就是已创建的分支。
        recordHistoryBranchMkAudit('checkout-resumed-after-branch-create');
        branchedChat = current;
      } else {
        if (current.id !== branchSourceLocator.chatId) {
          await openChat(branchSourceLocator);
        }
        const restoreInMemorySwipe = activateSwipeForBranchSnapshot(branchSourceLocator);
        try {
          // source-before 与 ERA 新 iframe 入口快照对比，可以确定未来 MK 在哪一步消失。
          recordHistoryBranchMkAudit('source-before-branch-create');
          await triggerSlash(`/branch-create ${branchSourceLocator.assistantMessageId}`);
          // 宿主有时在返回前已销毁旧 iframe，此采样属尽力而为，不能假设一定存在。
          recordHistoryBranchMkAudit('branch-create-returned');
          branchedChat = await readCurrentChatIdentity();
        } finally {
          // 这里只恢复已经脱离当前聊天数组的内存对象，不会写回来源聊天文件。
          // 若 branch-create 在切换前失败，也能避免来源聊天在内存中停在错误 swipe。
          restoreInMemorySwipe();
        }
      }
      if (branchedChat.id === branchSourceLocator.chatId) {
        throw new Error('酒馆没有切换到新分支聊天。');
      }
      journal =
        updateHistoryCheckoutJournal({
          stage: 'sync_era',
          actionKind: 'fork_branch',
          branchSourceLocator,
          targetLocator: {
            ...branchSourceLocator,
            chatId: branchedChat.id,
            chatName: branchedChat.name,
          },
        }) ?? journal;
      actionKind = 'fork_branch';
    }

    if (journal.stage === 'activate_swipe') {
      failureStep = '激活历史节点 swipe';
      await openChat(journal.targetLocator);
      await activateSwipe(journal.targetLocator);
      journal = updateHistoryCheckoutJournal({ stage: 'sync_era' }) ?? journal;
    }

    if (journal.stage === 'sync_era') {
      failureStep = 'ERA 完全同步与事件预检查';
      await openChat(journal.targetLocator);
      recordHistoryBranchMkAudit('checkout-before-explicit-full-sync');
      await runFullHistorySync(true);
      journal = updateHistoryCheckoutJournal({ stage: 'verify' }) ?? journal;
    }

    if (journal.stage === 'verify') {
      failureStep = '验证历史节点身份与封存状态';
      state = await scanCurrentChat({
        originNodeId: actionKind === 'fork_branch' ? nodeId : undefined,
      });
      if (actionKind === 'fork_branch') {
        const reconciled = await reconcileForkBranchMkIdentity(journal, state, nodeId);
        if (reconciled) state = reconciled;
      }
      node = state.tree.nodes[nodeId] ?? node;
      if (state.currentNodeId !== nodeId) {
        throw new HistoryVerificationError(
          '切换后的活动叶节点不是目标节点。',
          describeCheckoutNodeMismatch(state, nodeId, journal),
          '恢复的聊天楼层与所选节点不匹配。',
        );
      }
      automaticMkRepair = tryApplyAutomaticLegacyMkRepair(journal, node, state);
      if (automaticMkRepair) {
        // 原 scanned.state 引用旧树；改为最新树继续使用原有严格校验，不绕过 verify。
        state = buildViewState(loadHistoryTree(), state.currentChat);
      }
      state = commitVerification(
        state, nodeId,
        automaticMkRepair ? automaticMkRepair.repaired : (state.tree.nodes[nodeId]?.verification ?? node.verification),
      );
      journal = updateHistoryCheckoutJournal({ stage: 'commit' }) ?? journal;
    }

    if (!state) {
      failureStep = '扫描恢复后的聊天节点';
      state = await scanCurrentChat({
        originNodeId: actionKind === 'fork_branch' ? nodeId : undefined,
      });
    }
    if (
      actionKind === 'fork_branch' &&
      journal.draftUserMessageId !== null &&
      journal.draftUserMessageId !== undefined
    ) {
      failureStep = '保存分支后续输入草稿';
      writeHistoryCheckoutDraft({
        transactionId: journal.transactionId,
        chatId: state.currentChat.id,
        message: journal.draftMessage ?? '',
      });
    }
    failureStep = '提交历史恢复事务';
    const resumed = Boolean(existingJournal);
    const postCommitChatName = actionKind === 'fork_branch' ? (journal.postCommitChatName ?? null) : null;
    clearHistoryCheckoutJournal();
    clearLastHistoryCheckoutFailure();
    if (automaticMkRepair) {
      try {
        saveHistoryMkSnapshot(automaticMkRepair.repaired.selectedMksHash, assertCurrentHistoryMksAligned());
      } catch (error) {
        recordEraDiagnostic('wuxia-history-checkout', 'history-auto-repair-mk-snapshot-save-failed', {
          nodeId: automaticMkRepair.nodeId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      recordEraDiagnostic('wuxia-history-checkout', 'history-verification-auto-repair-committed', {
        transactionId: automaticMkRepair.transactionId,
        nodeId: automaticMkRepair.nodeId,
      });
    }
    notifyHistoryCheckoutCommit(resumed, { postCommitChatName });
    return makeCheckoutResult('commit', actionKind, nodeId, state, null, postCommitChatName);
  } catch (error) {
    // 失败时绝不遗留已经改变、却没被完整 checkout 验证的共享历史基准。
    if (automaticMkRepair) {
      try {
        rollbackAutomaticLegacyMkRepair(automaticMkRepair);
      } catch (rollbackError) {
        console.error('[历史恢复] 自动 MK 修复回滚失败，需要人工核查历史审计', rollbackError);
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    const userMessage = summarizeCheckoutFailure(error);
    const unavailableChat = error instanceof HistoryChatUnavailableError ? error : null;
    // 状态指纹不一致仍可再次完成全量同步；只有聊天本身不可访问才是不可恢复的断链。
    const broken = Boolean(unavailableChat);
    const journal = readHistoryCheckoutJournal();
    const trace = journal?.verificationTrace;
    // 失败也可能发生在 journal 创建前；诊断必须独立于它保存。
    {
      // 故障诊断只能尽力读取，不得让二次读取失败遮盖原始 checkout 异常。
      let baselineHash: string | undefined;
      let finalHash = '读取失败';
      try {
        baselineHash = loadHistoryTree().nodes[nodeId]?.verification?.eventStateHash;
        finalHash = readCurrentVerification().eventStateHash;
      } catch {
        // 聊天已被删除或变量尚未装载时，保留原始错误和已有 journal。
      }
      let causeHint: string;
      if (error instanceof HistoryVerificationError && message.includes('活动叶节点不是目标节点')) {
        causeHint = '失败于历史节点身份匹配，尚未进入事件封存指纹校验；应优先核对目标/实际节点的父链、MK 与 swipe，不应直接判断为事件变量漂移。';
      } else if (!journal) {
        causeHint = '失败发生在恢复事务创建之前；请根据失败步骤和底层异常排查。尚未开始变更历史聊天。';
      } else if (!trace) {
        causeHint = '缺少分阶段诊断：请重试恢复，以记录 ERA 同步与事件脚本检查各自的结果。';
      } else if (!baselineHash) {
        causeHint = '已记录分阶段诊断，但目标节点没有可用的封存事件指纹，无法进行封存状态比较。';
      } else if (error instanceof HistoryVerificationError && message.includes('主干不一致') && message.includes('事件状态一致')) {
        causeHint = '事件状态与封存一致，ERA SelectedMks 主干不一致；请查看逐楼 MK 差异和实际消息 MK 对账，不要归因于事件预检查。';
      } else if (trace.eraEventStateHash !== baselineHash) {
        causeHint = 'ERA 完全同步结束时就已经与历史封存不一致：优先排查未受 ERA 回滚管理的事件直接写入或原有快照缺失。';
      } else if (trace.preparedEventStateHash !== baselineHash) {
        causeHint = 'ERA 完全同步后与封存一致，但运行事件脚本预检查后发生漂移：请排查该检查期间的事件写入。';
      } else if (finalHash !== trace.preparedEventStateHash) {
        causeHint = '事件预检查完成后又发生事件变量变化：可能存在迟到的异步写入。';
      } else {
        causeHint = '分阶段校验结果一致，请检查更具体的事件差异。';
      }
      const diagnostics = [
        `恢复事务：${journal?.transactionId ?? '未建立'}`,
        `恢复动作：${actionKind}`,
        `失败步骤：${failureStep}`,
        `事务阶段：${journal?.stage ?? '尚未创建恢复 journal'}`,
        `目标节点：${nodeId}`,
        `来源聊天：${journal?.sourceChatName ?? '未记录'}（${journal?.sourceChatId ?? '未记录'}）`,
        `目标聊天：${journal?.targetLocator.chatName ?? '未记录'}（${journal?.targetLocator.chatId ?? '未记录'}）`,
        `目标楼层：User ${journal?.targetLocator.userMessageId ?? '无'} / Assistant ${journal?.targetLocator.assistantMessageId ?? '无'} / swipe ${journal?.targetLocator.swipeId ?? '无'}`,
        `异常信息：${message}`,
        '底层异常与堆栈：',
        describeCheckoutOriginalError(error),
        ...(error instanceof HistoryVerificationError && error.diagnostics
          ? ['校验诊断详情：', error.diagnostics]
          : []),
        `阶段归因：${causeHint}`,
        ...(trace
          ? [
              `ERA 完全同步后：主干 ${trace.eraSelectedMksHash}；事件 ${trace.eraEventStateHash}`,
              `事件预检查完成后：主干 ${trace.preparedSelectedMksHash}；事件 ${trace.preparedEventStateHash}`,
              `最终事件指纹：${finalHash}`,
              '事件预检查产生的路径变化：',
              ...(trace.changedPaths.length ? trace.changedPaths : ['无（这不排除 ERA 同步前已出现事件状态漂移）']),
            ]
          : []),
      ].join('\n');
      writeLastHistoryCheckoutFailure({
        occurredAt: Date.now(),
        nodeId,
        actionKind: journal?.actionKind ?? actionKind,
        step: failureStep,
        journalStage: journal?.stage ?? null,
        summary: userMessage,
        originalError: message,
        details: diagnostics,
      });
      if (journal) {
        updateHistoryCheckoutJournal({
          failure: { stage: journal.stage, message: userMessage, occurredAt: Date.now(), details: diagnostics },
        }, { touch: false });
      }
    }
    const currentChat = unavailableChat ? null : await readCurrentChatIdentity().catch(() => null);
    const branchId = unavailableChat
      ? branchIdForChat(unavailableChat.chatId)
      : (state?.currentBranchId ??
        (currentChat
          ? branchIdForChat(currentChat.id)
          : journal
            ? branchIdForChat(journal.targetLocator.chatId)
            : null));
    if (branchId) {
      const unavailableOriginNodeId =
        unavailableChat && journal?.sourceChatId === unavailableChat.chatId ? journal.sourceHeadNodeId || null : nodeId;
      markBranchStatus(
        branchId,
        broken ? 'broken' : 'recovery_failed',
        unavailableChat
          ? {
              chatId: unavailableChat.chatId,
              chatName: unavailableChat.chatName,
              originNodeId: unavailableOriginNodeId,
            }
          : currentChat
            ? { chatId: currentChat.id, chatName: currentChat.name, originNodeId: nodeId }
            : undefined,
      );
    }
    notifyHistoryCheckoutFailure();
    return makeCheckoutResult(broken ? 'broken' : 'recovery_failed', actionKind, nodeId, state, userMessage);
  }
}

// 同一 iframe 可能同时由 App 自动续接和存档页挂载发起 resumeCheckout。
 // 复用正在执行的事务，避免两个执行器交错推进同一个 journal / ERA 校验。
let activeCheckout: Promise<HistoryCheckoutResult> | null = null;

function executeCheckoutSingleFlight(
  nodeId: string,
  options: CheckoutHistoryOptions,
  journal: HistoryCheckoutJournal | null,
): Promise<HistoryCheckoutResult> {
  if (activeCheckout) return activeCheckout;
  const flight = executeCheckout(nodeId, options, journal);
  activeCheckout = flight;
  void flight.finally(() => {
    if (activeCheckout === flight) activeCheckout = null;
  }).catch(() => {});
  return flight;
}

export async function checkoutNode(
  nodeId: string,
  options: CheckoutHistoryOptions = {},
): Promise<HistoryCheckoutResult> {
  if (isChatRenamePending()) {
    return makeCheckoutResult(
      'recovery_failed',
      'fork_branch',
      nodeId,
      null,
      '聊天存档改名正在完成，暂时不能切换或创建历史分支。',
    );
  }
  const unresolved = readHistoryCheckoutJournal();
  if (unresolved && !isHistoryCheckoutJournalExpired(unresolved)) {
    return makeCheckoutResult(
      'recovery_failed',
      unresolved.actionKind ??
        (unresolved.stage === 'create_branch' || unresolved.branchSourceLocator ? 'fork_branch' : 'existing_branch'),
      nodeId,
      null,
      '已有未完成的历史分叉。请先选择“重试恢复”或“返回来源聊天”，不能叠加创建另一条分叉。',
    );
  }
  if (unresolved) {
    // 过期 journal 只代表旧事务已经失去恢复锁资格，不应继续阻止用户重新“从此处继续”。
    clearHistoryCheckoutJournal();
  }
  return executeCheckoutSingleFlight(nodeId, options, null);
}

/**
 * 用户确认后才能修复旧节点。只接受来源聊天在分叉前保存的独立 MK 见证、
 * 分支完全同步后的逐楼对账以及与旧封存完全一致的事件状态。
 * 新 MK 基准不能替代原始证据；原验证会写入持久审计。
 */
export async function repairLegacyCheckoutVerification(): Promise<HistoryCheckoutResult> {
  if (activeCheckout) throw new Error('历史恢复正在进行，不能同时修复。');
  const journal = readHistoryCheckoutJournal();
  if (!journal || journal.actionKind !== 'fork_branch' ||
      journal.stage !== 'verify' || journal.failure?.stage !== 'verify') {
    throw new Error('仅能修复当前处于 verify 失败的历史分叉事务。');
  }
  if (String(SillyTavern.getCurrentChatId?.() ?? '') !== journal.targetLocator.chatId) {
    throw new Error('当前聊天不是此次失败的目标分支，拒绝修复。');
  }
  const witness = readCheckoutSourceMkWitness(journal.transactionId);
  if (!witness) {
    throw new Error('缺少分叉前的来源 MK 见证。请返回来源聊天并重新发起历史分叉，不能直接覆盖旧指纹。');
  }
  const tree = loadHistoryTree();
  const node = tree.nodes[journal.targetNodeId];
  const sealed = node?.verification;
  if (!node || !sealed ||
      witness.targetNodeId !== node.id ||
      witness.sourceChatId !== journal.sourceChatId ||
      witness.targetMessageId !== journal.targetLocator.assistantMessageId ||
      witness.targetSwipeId !== journal.targetLocator.swipeId ||
      !nodeAcceptsMessageKey(node, witness.targetMk) ||
      witness.originalSelectedMksHash !== sealed.selectedMksHash ||
      witness.eventStateHash !== sealed.eventStateHash) {
    throw new Error('来源见证与恢复事务或节点原封存不一致，拒绝修复。');
  }
  // 新近封存的节点如果拥有有效旧 MK 快照，意味着旧内容可辨认，不能当作历史误封。
  const originalSnapshot = loadHistoryMkSnapshot(sealed.selectedMksHash);
  if (originalSnapshot && stableHistoryHash(originalSnapshot) === sealed.selectedMksHash) {
    throw new Error('旧节点有完整的原始逐楼 MK 证据，请排查真实变更，不能按旧节点误封修复。');
  }
  const state = await scanCurrentChat();
  if (state.currentNodeId !== node.id) {
    throw new Error('目标分支当前活动历史节点不是待修复的节点。');
  }
  const mks = assertCurrentHistoryMksAligned(state.tree.nodes[node.id]);
  const current = readCurrentVerification();
  if (current.eventStateHash !== sealed.eventStateHash ||
      current.selectedMksHash === sealed.selectedMksHash ||
      current.selectedMksHash !== witness.alignedPrefixHash ||
      mks.length !== witness.targetMessageId + 1 ||
      stableHistoryHash(mks) !== current.selectedMksHash) {
    throw new Error('来源 MK、目标分支 MK 或事件封存状态未同时通过验证，禁止改写历史节点。');
  }
  const original = structuredClone(sealed);
  const updated = { ...original, selectedMksHash: current.selectedMksHash };
  persistHistoryVerificationRepairAudit({
    timestamp: Date.now(),
    transactionId: journal.transactionId,
    nodeId: node.id,
    sourceChatId: journal.sourceChatId,
    targetChatId: journal.targetLocator.chatId,
    sourceWitness: witness,
    oldVerification: original,
    newVerification: updated,
    status: 'approved',
  });
  const revised = cloneTree(loadHistoryTree());
  if (revised.nodes[node.id]?.verification?.selectedMksHash !== original.selectedMksHash) {
    throw new Error('修复前历史节点发生并发更改，请重新诊断。');
  }
  revised.nodes[node.id] = { ...revised.nodes[node.id], verification: updated };
  persistHistoryTree(revised);
  try {
    // 不跳过 ERA 全量重算；再次同步和严格 verify 成功后才解除恢复锁。
    const result = await retryCheckoutRecovery();
    if (!result || result.status !== 'commit') {
      const latest = cloneTree(loadHistoryTree());
      if (latest.nodes[node.id]?.verification?.selectedMksHash === updated.selectedMksHash) {
        latest.nodes[node.id] = { ...latest.nodes[node.id], verification: original };
        persistHistoryTree(latest);
      }
      recordEraDiagnostic('wuxia-history-checkout', 'history-verification-repair-rolled-back', {
        transactionId: journal.transactionId, nodeId: node.id,
        reason: result?.error ?? '恢复尚未提交',
      });
      throw new Error(result?.error ?? '历史重新验证失败，已还原原封存指纹；恢复锁继续保留。');
    }
    recordEraDiagnostic('wuxia-history-checkout', 'history-verification-repair-committed', {
      transactionId: journal.transactionId, nodeId: node.id,
      oldHash: original.selectedMksHash, newHash: updated.selectedMksHash,
    });
    return result;
  } catch (error) {
    const latest = cloneTree(loadHistoryTree());
    if (latest.nodes[node.id]?.verification?.selectedMksHash === updated.selectedMksHash) {
      latest.nodes[node.id] = { ...latest.nodes[node.id], verification: original };
      persistHistoryTree(latest);
    }
    throw error;
  }
}


/**
 * 显式降级继续：允许分支事件状态与封存不一致，但仍硬性要求来源见证、
 * 消息/活动 swipe/MK 与来源完全相同。永不覆盖共享历史节点的原始验证。
 * 当前分支保留 degraded 标记和审计，其他聊天不会被改动。
 */
export async function continueCheckoutWithEventDrift(): Promise<HistoryCheckoutResult> {
  if (activeCheckout) throw new Error('历史恢复仍在运行，请勿并发降级继续。');
  const journal = readHistoryCheckoutJournal();
  if (!journal || journal.actionKind !== 'fork_branch' ||
      journal.stage !== 'verify' || journal.failure?.stage !== 'verify') {
    throw new Error('只有分叉后的事件验证失败才允许选择降级继续。');
  }
  const activeChatId = String(SillyTavern.getCurrentChatId?.() ?? '');
  if (activeChatId !== journal.targetLocator.chatId) {
    throw new Error('当前聊天不是此事务建立的目标分支，禁止降级继续。');
  }
  const tree = loadHistoryTree();
  const node = tree.nodes[journal.targetNodeId];
  if (!node?.verification) throw new Error('历史节点缺失或未封存，禁止降级继续。');
  const witness = readCheckoutSourceMkWitness(journal.transactionId);
  if (!witness ||
      witness.sourceChatId !== journal.sourceChatId ||
      witness.targetNodeId !== node.id ||
      witness.targetMessageId !== journal.targetLocator.assistantMessageId ||
      witness.targetSwipeId !== journal.targetLocator.swipeId ||
      !nodeAcceptsMessageKey(node, witness.targetMk) ||
      witness.originalSelectedMksHash !== node.verification.selectedMksHash ||
      witness.eventStateHash !== node.verification.eventStateHash) {
    throw new Error('缺少本次分叉前的有效来源见证，不能降级继续；请选择返回来源聊天。');
  }
  const current = readCurrentVerification();
  if (current.eventStateHash === node.verification.eventStateHash) {
    throw new Error('事件状态已与原封存一致，不应采用降级继续；请重试正常恢复。');
  }
  // 不放宽聊天真实性校验：即使允许事件偏差，也不允许混入其他楼层/swipe/MK。
  const aligned = assertCurrentHistoryMksAligned(node);
  if (aligned.length !== witness.targetMessageId + 1 ||
      stableHistoryHash(aligned) !== witness.alignedPrefixHash ||
      current.selectedMksHash !== witness.alignedPrefixHash) {
    throw new Error('来源与目标分支的完整 MK 主干不一致，禁止降级继续。');
  }
  const scanned = await scanCurrentChat({ originNodeId: node.id });
  if (scanned.currentNodeId !== node.id || scanned.currentChat.id !== journal.targetLocator.chatId) {
    throw new Error('目标活动历史节点与来源节点不同，禁止降级继续。');
  }
  const latest = cloneTree(loadHistoryTree());
  const branch = latest.branches[scanned.currentBranchId];
  if (!branch || branch.chatId !== journal.targetLocator.chatId ||
      latest.nodes[node.id]?.verification?.selectedMksHash !== node.verification.selectedMksHash) {
    throw new Error('目标分支或原始历史节点已改变，禁止降级继续。');
  }
  // 先持久化原始与当前哈希、关键事件差异；审计写入失败不能放行。
  const rawAudit = localStorage.getItem(WUXIA_HISTORY_DEGRADED_AUDIT_KEY);
  const old: unknown = rawAudit ? JSON.parse(rawAudit) : [];
  if (!Array.isArray(old)) throw new Error('降级恢复审计格式异常，禁止继续。');
  localStorage.setItem(WUXIA_HISTORY_DEGRADED_AUDIT_KEY, JSON.stringify([...old, {
    occurredAt: Date.now(),
    transactionId: journal.transactionId,
    nodeId: node.id,
    sourceChatId: journal.sourceChatId,
    targetChatId: journal.targetLocator.chatId,
    sourceWitness: witness,
    originalVerification: node.verification,
    resumedVerification: current,
    changedEventPaths: journal.verificationTrace?.changedPaths ?? [],
    status: 'user-accepted-event-drift',
  }].slice(-100)));

  latest.branches[scanned.currentBranchId] = {
    ...branch,
    headNodeId: node.id,
    status: 'degraded',
  };
  const saved = persistHistoryTree(latest);
  const postCommitChatName = journal.postCommitChatName ?? null;
  if (journal.draftUserMessageId !== null && journal.draftUserMessageId !== undefined) {
    writeHistoryCheckoutDraft({
      transactionId: journal.transactionId,
      chatId: journal.targetLocator.chatId,
      message: journal.draftMessage ?? '',
    });
  }
  clearHistoryCheckoutJournal();
  clearLastHistoryCheckoutFailure();
  recordEraDiagnostic('wuxia-history-checkout', 'history-event-drift-user-accepted', {
    nodeId: node.id,
    transactionId: journal.transactionId,
    sourceEventStateHash: node.verification.eventStateHash,
    resumedEventStateHash: current.eventStateHash,
    preservedOriginalHistoryVerification: true,
  });
  notifyHistoryCheckoutCommit(true, { postCommitChatName });
  return makeCheckoutResult(
    'commit', 'fork_branch', node.id,
    buildViewState(saved, scanned.currentChat),
    null, postCommitChatName,
  );
}

export interface CheckoutRecoveryState {
  journal: HistoryCheckoutJournal | null;
  pending: boolean;
  expired: boolean;
}

export function getCheckoutRecoveryState(now = Date.now()): CheckoutRecoveryState {
  const journal = readHistoryCheckoutJournal();
  return {
    journal,
    pending: Boolean(journal && !isHistoryCheckoutJournalExpired(journal, now)),
    expired: Boolean(journal && isHistoryCheckoutJournalExpired(journal, now)),
  };
}

export async function resumeCheckout(): Promise<HistoryCheckoutResult | null> {
  const journal = readHistoryCheckoutJournal();
  if (!journal) return null;
  if (readHistoryCheckoutReturnIntent() === journal.transactionId) {
    return returnToCheckoutSource();
  }
  if (isHistoryCheckoutJournalExpired(journal)) {
    const message = '历史切换恢复窗口已超过 120 秒。';
    updateHistoryCheckoutJournal(
      {
        failure: { stage: journal.stage, message, occurredAt: Date.now() },
      },
      { touch: false },
    );
    markBranchStatus(branchIdForChat(journal.targetLocator.chatId), 'recovery_failed', {
      chatId: journal.targetLocator.chatId,
      chatName: journal.targetLocator.chatName,
      originNodeId: journal.targetNodeId,
    });
    notifyHistoryCheckoutExpired();
    return makeCheckoutResult(
      'recovery_failed',
      journal.actionKind ??
        (journal.stage === 'create_branch' || journal.branchSourceLocator ? 'fork_branch' : 'existing_branch'),
      journal.targetNodeId,
      null,
      message,
    );
  }
  return executeCheckoutSingleFlight(journal.targetNodeId, {}, journal);
}

/** 放弃尚未完成的历史检出；保留已创建的聊天/分支，只解除恢复锁。 */
export function abandonCheckoutRecovery(): HistoryCheckoutResult | null {
  const journal = readHistoryCheckoutJournal();
  if (!journal) return null;

  const actionKind =
    journal.actionKind ??
    (journal.stage === 'create_branch' || journal.branchSourceLocator ? 'fork_branch' : 'existing_branch');
  markBranchStatus(branchIdForChat(journal.targetLocator.chatId), 'recovery_failed', {
    chatId: journal.targetLocator.chatId,
    chatName: journal.targetLocator.chatName,
    originNodeId: journal.targetNodeId,
  });
  clearHistoryCheckoutJournal();
  return makeCheckoutResult(
    'recovery_failed',
    actionKind,
    journal.targetNodeId,
    null,
    '已放弃此次历史恢复；已创建的聊天和分支会保留，现在可以重新选择历史节点。',
  );
}

export async function retryCheckoutRecovery(): Promise<HistoryCheckoutResult | null> {
  const journal = readHistoryCheckoutJournal();
  if (!journal) return null;
  if (activeCheckout) return activeCheckout;
  clearHistoryCheckoutReturnIntent();
  const renewed = renewHistoryCheckoutJournal(journal);
  // verify 失败后的重试必须重新执行 ERA 完全重算；只重比哈希不会改变事件状态。
  const retryJournal = journal.failure?.stage === 'verify'
    ? (updateHistoryCheckoutJournal({ stage: 'sync_era' }) ?? renewed)
    : renewed;
  return executeCheckoutSingleFlight(retryJournal.targetNodeId, {}, retryJournal);
}

export async function returnToCheckoutSource(): Promise<HistoryCheckoutResult | null> {
  const journal = readHistoryCheckoutJournal();
  if (!journal) return null;
  writeHistoryCheckoutReturnIntent(journal.transactionId);
  let state: HistoryTreeViewState | null = null;
  try {
    const tree = loadHistoryTree();
    await restoreCheckoutSourcePath(tree, journal);
    state = await scanCurrentChat();
    const targetBranchId = branchIdForChat(journal.targetLocator.chatId);
    if (journal.targetLocator.chatId !== journal.sourceChatId && state.tree.branches[targetBranchId]) {
      const updatedTree = markBranchStatus(targetBranchId, 'recovery_failed');
      state = buildViewState(updatedTree, state.currentChat);
    }
    clearHistoryCheckoutJournal();
    clearLastHistoryCheckoutFailure();
    notifyHistoryCheckoutCommit(true);
    return makeCheckoutResult(
      'commit',
      'existing_branch',
      journal.sourceHeadNodeId || journal.targetNodeId,
      state,
      null,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unavailableChat = error instanceof HistoryChatUnavailableError ? error : null;
    const status: HistoryBranch['status'] = unavailableChat ? 'broken' : 'recovery_failed';
    const failedChat = unavailableChat ?? {
      chatId: journal.sourceChatId,
      chatName: journal.sourceChatName,
    };
    markBranchStatus(branchIdForChat(failedChat.chatId), status, {
      chatId: failedChat.chatId,
      chatName: failedChat.chatName,
      originNodeId: journal.sourceHeadNodeId || null,
    });
    const returnFailureDetails = [
      '返回来源聊天失败',
      `事务：${journal.transactionId}`,
      `来源：${journal.sourceChatName}（${journal.sourceChatId}）`,
      `目标：${journal.targetLocator.chatName}（${journal.targetLocator.chatId}）`,
      `当前阶段：${journal.stage}`,
      `异常：${message}`,
      '底层异常与堆栈：',
      describeCheckoutOriginalError(error),
    ].join('\n');
    writeLastHistoryCheckoutFailure({
      occurredAt: Date.now(),
      nodeId: journal.targetNodeId,
      actionKind: journal.actionKind ?? 'existing_branch',
      step: '返回来源聊天并同步 ERA',
      journalStage: journal.stage,
      summary: message,
      originalError: message,
      details: returnFailureDetails,
    });
    updateHistoryCheckoutJournal({
      failure: {
        stage: journal.stage,
        message,
        occurredAt: Date.now(),
        details: returnFailureDetails,
      },
    }, { touch: false });
    notifyHistoryCheckoutFailure();
    return makeCheckoutResult(
      unavailableChat ? 'broken' : 'recovery_failed',
      'existing_branch',
      journal.sourceHeadNodeId || journal.targetNodeId,
      state,
      message,
    );
  }
}

// Compatibility projection for the current SaveLoadPanel. The v1 character
// variable is deliberately never read or written.
export interface SaveTreeViewState {
  tree: WuxiaSaveTreeData;
  currentChatName: string;
  currentNodeId: string | null;
  latestSaveTarget: { messageId: number; preview: string } | null;
}

function projectLegacyNode(node: HistoryNode): WuxiaSaveNode {
  const locator = node.locators[0];
  return {
    id: node.id,
    label: node.label || node.preview || '未命名节点',
    checkpointName: locator?.chatName ?? '',
    messageId: locator?.assistantMessageId ?? -1,
    parentId: node.parentId,
    createdAt: node.createdAt,
    playerName: '',
    location: node.location,
    worldTimeText: node.worldTimeText,
    preview: node.preview,
  };
}

export async function readSaveTreeState(gameState: GameState): Promise<SaveTreeViewState> {
  const state = await scanCurrentChat({
    location: gameState.currentLocation || gameState.stats.location,
    worldTimeText: getWorldTimeText(gameState),
  });
  const nodes = Object.values(state.tree.nodes).map(projectLegacyNode);
  const currentNode = state.currentNodeId ? state.tree.nodes[state.currentNodeId] : null;
  const currentLocator = currentNode?.locators.find(locator => locator.chatId === state.currentChat.id);
  return {
    tree: { version: 1, updatedAt: state.tree.updatedAt, nodes },
    currentChatName: state.currentChat.name,
    currentNodeId: state.currentNodeId,
    latestSaveTarget:
      currentNode && currentLocator
        ? { messageId: currentLocator.assistantMessageId, preview: currentNode.preview }
        : null,
  };
}

export async function createCurrentCheckpoint(label: string, gameState: GameState): Promise<WuxiaSaveNode> {
  let state = await finalizeCurrentTurn({
    location: gameState.currentLocation || gameState.stats.location,
    worldTimeText: getWorldTimeText(gameState),
  });
  if (!state.currentNodeId) throw new Error('没有找到可封存的剧情楼层。');
  const nodeId = state.currentNodeId;
  renameNode(nodeId, label);
  const tree = setNodePinned(nodeId, true);
  state = buildViewState(tree, state.currentChat);
  return projectLegacyNode(state.tree.nodes[nodeId]!);
}

export async function openCheckpoint(node: WuxiaSaveNode): Promise<void> {
  const result = await checkoutNode(node.id);
  if (result.status !== 'commit') throw new Error(result.error || '读取历史节点失败。');
}

export async function createBranchFromNode(node: WuxiaSaveNode): Promise<void> {
  const result = await checkoutNode(node.id, { forceBranch: true });
  if (result.status !== 'commit') throw new Error(result.error || '创建历史分支失败。');
}

function getWorldTimeText(gameState: GameState): string {
  if (gameState.gameTime) return gameState.gameTime;
  const time = gameState.worldTime;
  return time
    ? `${time.year}年${time.month}月${time.day}日${time.hour}时${String(time.minute).padStart(2, '0')}分`
    : '';
}

export function getSuggestedSaveLabel(gameState: GameState): string {
  const location = gameState.currentLocation || gameState.stats.location || '江湖途中';
  const time = getWorldTimeText(gameState);
  return time ? `${location} · ${time}` : location;
}
