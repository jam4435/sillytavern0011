import { z } from 'zod';
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
export const WUXIA_HISTORY_PREPARE_VERIFICATION_EVENT = 'wuxia:history-checkout-prepare-verification';
export { HISTORY_CHECKOUT_COMMIT_EVENT, HISTORY_CHECKOUT_STATE_EVENT, isHistoryCheckoutPending };

export type CheckoutActionKind = 'existing_branch' | 'in_place_swipe' | 'fork_branch';

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
    status: z.enum(['active', 'available', 'recovery_failed', 'broken']),
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
      const id = getNodeId(currentParentId, messageKey, rawText, swipeId);
      const locator: HistoryLocator = {
        chatId: currentChat.id,
        chatName: currentChat.name,
        userMessageId: pendingUserMessageId,
        assistantMessageId: message.message_id,
        swipeId,
      };
      const existing = tree.nodes[id];
      // 已有节点也刷新 preview：预览受"仅格式显示"正则影响，正则配置变化后旧预览需要跟上
      const node: HistoryNode = existing
        ? { ...appendLocator(existing, locator), preview: createPreview(rawText) }
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
    status: 'active',
  };

  return buildViewState(persistHistoryTree(tree), currentChat);
}

function readCurrentVerification(): HistoryVerification {
  const variables = getVariables({ type: 'chat' });
  const statData = isRecord(variables?.stat_data) ? variables.stat_data : {};
  const metaData = isRecord(variables?.ERAMetaData) ? variables.ERAMetaData : {};
  const selectedMks = Array.isArray(metaData.SelectedMks) ? metaData.SelectedMks : [];
  return {
    selectedMksHash: stableHistoryHash(selectedMks),
    eventStateHash: stableHistoryHash({
      事件系统: statData.事件系统 ?? null,
      参与事件: statData.参与事件 ?? null,
      世界事件: statData.世界事件 ?? null,
      事件分支结果: statData.事件分支结果 ?? null,
      后续事件线索: statData.后续事件线索 ?? null,
      后续事件线索计数: statData.后续事件线索计数 ?? null,
    }),
  };
}

export async function finalizeCurrentTurn(options: FinalizeHistoryTurnOptions = {}): Promise<HistoryTreeViewState> {
  const scanned = await scanCurrentChat(options);
  if (!scanned.currentNodeId) return scanned;

  const tree = cloneTree(scanned.tree);
  const node = tree.nodes[scanned.currentNodeId];
  if (!node) return scanned;
  tree.nodes[node.id] = {
    ...node,
    location: options.location ?? node.location,
    worldTimeText: options.worldTimeText ?? node.worldTimeText,
    verification: readCurrentVerification(),
  };
  return buildViewState(persistHistoryTree(tree), scanned.currentChat);
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

async function runFullHistorySync(prepareVerification = false): Promise<void> {
  await waitForEraFullResync();
  if (prepareVerification) {
    const journal = readHistoryCheckoutJournal();
    await eventEmit(WUXIA_HISTORY_PREPARE_VERIFICATION_EVENT, {
      transactionId: journal?.transactionId ?? '',
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

class HistoryVerificationError extends Error {}

function commitVerification(
  state: HistoryTreeViewState,
  targetNodeId: string,
  baseline: HistoryVerification | null,
): HistoryTreeViewState {
  const verification = readCurrentVerification();
  if (
    baseline &&
    (baseline.selectedMksHash !== verification.selectedMksHash ||
      baseline.eventStateHash !== verification.eventStateHash)
  ) {
    markBranchStatus(state.currentBranchId, 'broken');
    const mksSame = baseline.selectedMksHash === verification.selectedMksHash;
    const eventSame = baseline.eventStateHash === verification.eventStateHash;
    throw new HistoryVerificationError(
      `历史节点校验失败：ERA 主干或事件状态与封存记录不一致（主干${mksSame ? '一致' : '不一致'}，事件状态${eventSame ? '一致' : '不一致'}）。`,
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
  try {
    const tree = loadHistoryTree();
    const node = tree.nodes[nodeId];
    if (!node) throw new Error(`历史节点不存在：${nodeId}`);

    const sourceChat = await readCurrentChatIdentity();
    const sourceBranch = tree.branches[branchIdForChat(sourceChat.id)];
    let journal = existingJournal;
    if (!journal) {
      await flushPendingGameDataCompletion('before-history-checkout');
      const selected = await selectCheckoutAction(tree, node, options.forceBranch === true);
      actionKind = selected.actionKind;
      const draftMessage =
        selected.actionKind === 'fork_branch'
          ? await readHistoryUserMessage(
              { id: selected.locator.chatId, name: selected.locator.chatName },
              selected.draftUserMessageId,
            )
          : '';
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
    } else if (journal.actionKind) {
      actionKind = journal.actionKind;
    } else if (journal.stage === 'create_branch' || journal.branchSourceLocator) {
      actionKind = 'fork_branch';
    } else {
      actionKind = (await selectCheckoutAction(tree, node, false)).actionKind;
    }

    if (actionKind === 'fork_branch' && journal.draftUserMessageId === undefined) {
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
      const branchSourceLocator = resolveBranchSourceLocator(node, journal);
      const current = await readCurrentChatIdentity();
      let branchedChat: HistoryChatIdentity;
      if (current.id !== branchSourceLocator.chatId && currentChatMatchesForkSnapshot(branchSourceLocator)) {
        // /branch-create 会切换聊天并销毁当前 iframe。新 iframe 从 create_branch
        // 恢复时，可以用截断后的末楼和 swipe 确认当前聊天就是已创建的分支。
        branchedChat = current;
      } else {
        if (current.id !== branchSourceLocator.chatId) {
          await openChat(branchSourceLocator);
        }
        const restoreInMemorySwipe = activateSwipeForBranchSnapshot(branchSourceLocator);
        try {
          await triggerSlash(`/branch-create ${branchSourceLocator.assistantMessageId}`);
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
      await openChat(journal.targetLocator);
      await activateSwipe(journal.targetLocator);
      journal = updateHistoryCheckoutJournal({ stage: 'sync_era' }) ?? journal;
    }

    if (journal.stage === 'sync_era') {
      await openChat(journal.targetLocator);
      await runFullHistorySync(true);
      journal = updateHistoryCheckoutJournal({ stage: 'verify' }) ?? journal;
    }

    if (journal.stage === 'verify') {
      state = await scanCurrentChat({
        originNodeId: actionKind === 'fork_branch' ? nodeId : undefined,
      });
      if (state.currentNodeId !== nodeId) {
        throw new HistoryVerificationError('切换后的活动叶节点不是目标节点。');
      }
      state = commitVerification(state, nodeId, node.verification);
      journal = updateHistoryCheckoutJournal({ stage: 'commit' }) ?? journal;
    }

    if (!state) {
      state = await scanCurrentChat({
        originNodeId: actionKind === 'fork_branch' ? nodeId : undefined,
      });
    }
    if (
      actionKind === 'fork_branch' &&
      journal.draftUserMessageId !== null &&
      journal.draftUserMessageId !== undefined
    ) {
      writeHistoryCheckoutDraft({
        transactionId: journal.transactionId,
        chatId: state.currentChat.id,
        message: journal.draftMessage ?? '',
      });
    }
    const resumed = Boolean(existingJournal);
    const postCommitChatName = actionKind === 'fork_branch' ? (journal.postCommitChatName ?? null) : null;
    clearHistoryCheckoutJournal();
    notifyHistoryCheckoutCommit(resumed, { postCommitChatName });
    return makeCheckoutResult('commit', actionKind, nodeId, state, null, postCommitChatName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unavailableChat = error instanceof HistoryChatUnavailableError ? error : null;
    const broken = error instanceof HistoryVerificationError || Boolean(unavailableChat);
    const journal = readHistoryCheckoutJournal();
    if (journal) {
      updateHistoryCheckoutJournal({
        failure: { stage: journal.stage, message, occurredAt: Date.now() },
      });
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
    return makeCheckoutResult(broken ? 'broken' : 'recovery_failed', actionKind, nodeId, state, message);
  }
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
  if (unresolved) {
    return makeCheckoutResult(
      'recovery_failed',
      unresolved.actionKind ??
        (unresolved.stage === 'create_branch' || unresolved.branchSourceLocator ? 'fork_branch' : 'existing_branch'),
      nodeId,
      null,
      '已有未完成的历史分叉。请先选择“重试恢复”或“返回来源聊天”，不能叠加创建另一条分叉。',
    );
  }
  return executeCheckout(nodeId, options, null);
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
    updateHistoryCheckoutJournal({
      failure: { stage: journal.stage, message, occurredAt: Date.now() },
    });
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
  return executeCheckout(journal.targetNodeId, {}, journal);
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
  clearHistoryCheckoutReturnIntent();
  const renewed = renewHistoryCheckoutJournal(journal);
  return executeCheckout(renewed.targetNodeId, {}, renewed);
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
