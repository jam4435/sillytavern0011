import type { GameState, WuxiaSaveNode, WuxiaSaveTreeData } from '../types';
import { isFrontendLoaderOnlyMessage, normalizeDisplayedMessageContent } from './variableReader';

export const WUXIA_SAVE_TREE_KEY = 'wuxia_save_tree';

type ChatMessageWithSwipes = {
  message_id: number;
  role: 'system' | 'assistant' | 'user';
  message?: string;
  name?: string;
  swipes?: string[];
  swipe_id?: number;
};

export interface SaveTreeViewState {
  tree: WuxiaSaveTreeData;
  currentChatName: string;
  currentNodeId: string | null;
  latestSaveTarget: {
    messageId: number;
    preview: string;
  } | null;
}

function createEmptyTree(): WuxiaSaveTreeData {
  return {
    version: 1,
    updatedAt: Date.now(),
    nodes: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNode(value: unknown): WuxiaSaveNode | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id : '';
  const checkpointName = typeof value.checkpointName === 'string' ? value.checkpointName : '';
  const messageId = typeof value.messageId === 'number' ? value.messageId : Number(value.messageId);

  if (!id || !checkpointName || !Number.isFinite(messageId)) {
    return null;
  }

  return {
    id,
    label: typeof value.label === 'string' && value.label.trim() ? value.label : checkpointName,
    checkpointName,
    messageId,
    parentId: typeof value.parentId === 'string' ? value.parentId : null,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    playerName: typeof value.playerName === 'string' ? value.playerName : '',
    location: typeof value.location === 'string' ? value.location : '',
    worldTimeText: typeof value.worldTimeText === 'string' ? value.worldTimeText : '',
    preview: typeof value.preview === 'string' ? value.preview : '',
  };
}

function readStoredTree(): WuxiaSaveTreeData {
  try {
    const variables = getVariables({ type: 'character' });
    const rawTree = variables?.[WUXIA_SAVE_TREE_KEY];
    if (!isRecord(rawTree)) {
      return createEmptyTree();
    }

    const rawNodes = Array.isArray(rawTree.nodes) ? rawTree.nodes : [];
    const nodes = rawNodes
      .map(normalizeNode)
      .filter((node): node is WuxiaSaveNode => Boolean(node));

    return {
      version: 1,
      updatedAt: typeof rawTree.updatedAt === 'number' ? rawTree.updatedAt : Date.now(),
      nodes,
    };
  } catch (error) {
    console.warn('[墨剑录] 读取存档树失败:', error);
    return createEmptyTree();
  }
}

function writeStoredTree(tree: WuxiaSaveTreeData): WuxiaSaveTreeData {
  const nextTree: WuxiaSaveTreeData = {
    version: 1,
    updatedAt: Date.now(),
    nodes: tree.nodes,
  };

  updateVariablesWith(
    variables => ({
      ...variables,
      [WUXIA_SAVE_TREE_KEY]: nextTree,
    }),
    { type: 'character' },
  );

  return nextTree;
}

function getActiveMessageText(message: ChatMessageWithSwipes): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  return message.message || swipes[swipeIndex] || swipes[0] || '';
}

function findLatestSaveTarget(): SaveTreeViewState['latestSaveTarget'] {
  const messages = getChatMessages('0-{{lastMessageId}}', {
    role: 'assistant',
    hide_state: 'all',
    include_swipes: true,
  }) as ChatMessageWithSwipes[];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const rawText = getActiveMessageText(message);
    if (!rawText.trim() || isFrontendLoaderOnlyMessage(rawText)) {
      continue;
    }

    const cleaned = normalizeDisplayedMessageContent(rawText);
    if (!cleaned) {
      continue;
    }

    return {
      messageId: message.message_id,
      preview: createPreview(cleaned, 96),
    };
  }

  return null;
}

function createPreview(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function createCheckpointName(): string {
  return createId('wuxia_cp');
}

function getWorldTimeText(gameState: GameState): string {
  if (gameState.gameTime) {
    return gameState.gameTime;
  }

  const time = gameState.worldTime;
  if (!time) {
    return '';
  }

  return `${time.year}年${time.month}月${time.day}日${time.hour}时`;
}

function getDefaultLabel(gameState: GameState): string {
  const location = gameState.currentLocation || gameState.stats.location || '江湖途中';
  const time = getWorldTimeText(gameState);
  return time ? `${location} · ${time}` : location;
}

function parseCheckpointList(rawResult: string): Array<{ checkpointName: string; messageId?: number }> {
  if (!rawResult?.trim()) {
    return [];
  }

  let parsed: unknown = rawResult;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    parsed = rawResult
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items
    .map(item => {
      if (typeof item === 'number') {
        return null;
      }

      if (typeof item === 'string') {
        const checkpointMatch = item.match(/wuxia_cp_[A-Za-z0-9_-]+/);
        const numberMatch = item.match(/\d+/);
        const checkpointName = checkpointMatch?.[0] || item.trim();
        return {
          checkpointName,
          messageId: numberMatch ? Number(numberMatch[0]) : undefined,
        };
      }

      if (isRecord(item)) {
        const checkpointName =
          String(item.checkpointName ?? item.checkpoint ?? item.name ?? item.link ?? '').trim();
        const rawMessageId = item.messageId ?? item.message_id ?? item.mesId ?? item.mes_id;
        const messageId = typeof rawMessageId === 'number' ? rawMessageId : Number(rawMessageId);
        if (!checkpointName) {
          return null;
        }
        return {
          checkpointName,
          messageId: Number.isFinite(messageId) ? messageId : undefined,
        };
      }

      return null;
    })
    .filter((item): item is { checkpointName: string; messageId?: number } => Boolean(item?.checkpointName));
}

function mergeUntrackedCheckpoints(
  tree: WuxiaSaveTreeData,
  checkpointLinks: Array<{ checkpointName: string; messageId?: number }>,
): WuxiaSaveTreeData {
  const known = new Set(tree.nodes.map(node => node.checkpointName));
  const additions: WuxiaSaveNode[] = checkpointLinks
    .filter(link => !known.has(link.checkpointName))
    .map(link => ({
      id: createId('unfiled'),
      label: `未归档 · ${link.checkpointName}`,
      checkpointName: link.checkpointName,
      messageId: link.messageId ?? 0,
      parentId: null,
      createdAt: Date.now(),
      playerName: '',
      location: '',
      worldTimeText: '',
      preview: '此 checkpoint 由酒馆记录发现，尚未写入墨剑录存档树。',
    }));

  if (additions.length === 0) {
    return tree;
  }

  return {
    ...tree,
    nodes: [...tree.nodes, ...additions],
  };
}

export async function readSaveTreeState(gameState: GameState): Promise<SaveTreeViewState> {
  const currentChatName = (await triggerSlash('/getchatname').catch(() => '')).trim();
  const checkpointListResult = await triggerSlash('/checkpoint-list links=true').catch(() => '');
  const checkpointLinks = parseCheckpointList(checkpointListResult);
  const storedTree = readStoredTree();
  const tree = mergeUntrackedCheckpoints(storedTree, checkpointLinks);
  const currentNode =
    tree.nodes.find(node => node.checkpointName === currentChatName) ||
    tree.nodes.find(node => currentChatName.includes(node.checkpointName));

  return {
    tree,
    currentChatName,
    currentNodeId: currentNode?.id ?? null,
    latestSaveTarget: findLatestSaveTarget(),
  };
}

export async function createCurrentCheckpoint(label: string, gameState: GameState): Promise<WuxiaSaveNode> {
  const saveTarget = findLatestSaveTarget();
  if (!saveTarget) {
    throw new Error('没有找到可保存的剧情楼层。请先完成一轮回复后再保存。');
  }

  const currentState = await readSaveTreeState(gameState);
  const parentId = currentState.currentNodeId;
  const checkpointName = createCheckpointName();
  const safeLabel = label.trim() || getDefaultLabel(gameState);

  await triggerSlash(`/checkpoint-create mesId=${saveTarget.messageId} ${checkpointName}`);

  const node: WuxiaSaveNode = {
    id: createId('save'),
    label: safeLabel,
    checkpointName,
    messageId: saveTarget.messageId,
    parentId,
    createdAt: Date.now(),
    playerName: gameState.stats.name,
    location: gameState.currentLocation || gameState.stats.location,
    worldTimeText: getWorldTimeText(gameState),
    preview: saveTarget.preview,
  };

  const nextTree = writeStoredTree({
    version: 1,
    updatedAt: Date.now(),
    nodes: [...currentState.tree.nodes, node],
  });

  await triggerSlash('/forcesave').catch(() => '');
  return nextTree.nodes.find(item => item.id === node.id) || node;
}

export async function openCheckpoint(node: WuxiaSaveNode): Promise<void> {
  await triggerSlash(`/go ${node.checkpointName}`);
}

export async function createBranchFromNode(node: WuxiaSaveNode): Promise<void> {
  if (!Number.isFinite(node.messageId) || node.messageId < 0) {
    throw new Error('该节点没有有效楼层号，无法另开分叉。');
  }
  await triggerSlash(`/branch-create ${node.messageId}`);
}

export function getSuggestedSaveLabel(gameState: GameState): string {
  return getDefaultLabel(gameState);
}
