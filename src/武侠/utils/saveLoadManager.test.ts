import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORY_CHECKOUT_DRAFT_KEY,
  HISTORY_CHECKOUT_JOURNAL_KEY,
  HISTORY_CHECKOUT_RETURN_INTENT_KEY,
  createHistoryCheckoutJournal,
  readHistoryCheckoutJournal,
  updateHistoryCheckoutJournal,
  writeHistoryCheckoutDraft,
} from '../../shared/historyCheckoutJournal';
import { createChatRenameJournal, readChatRenameJournal } from '../../shared/chatRenameJournal';
import type { HistoryLocator, WuxiaHistoryTreeV2 } from '../types';
import {
  WUXIA_HISTORY_TREE_V2_KEY,
  WuxiaHistoryTreeV2Schema,
  checkoutNode,
  configureHistoryEraSyncTiming,
  finalizeCurrentTurn,
  getCheckoutRecoveryState,
  loadHistoryTree,
  migrateHistoryChatIdentity,
  renameNode,
  retryCheckoutRecovery,
  resumeCheckout,
  returnToCheckoutSource,
  scanCurrentChat,
  setNodePinned,
  filterTreeToRelatedComponent,
  stableHistoryHash,
  suggestForkChatName,
} from './saveLoadManager';
import { getAvatarSelectionStorageKey, getAvatarStorageKey } from './avatarStorage';
import {
  getUniqueChatRenameSuggestion,
  renameCurrentChatAutomatically,
  resumePendingChatRename,
  validateChatRenameTarget,
} from './chatRenameManager';

type TestMessage = {
  message_id: number;
  role: 'assistant' | 'user' | 'system';
  is_hidden?: boolean;
  message?: string;
  swipes?: string[];
  swipe_id?: number;
};

type TestChat = {
  id: string;
  name: string;
  messages: TestMessage[];
  variables: Record<string, unknown>;
};

const getVariablesMock = vi.mocked(getVariables);
const updateVariablesWithMock = vi.mocked(updateVariablesWith);
const getChatMessagesMock = vi.mocked(getChatMessages);
const eventEmitMock = vi.mocked(eventEmit);

let characterVariables: Record<string, unknown>;
let chats: Record<string, TestChat>;
let currentChatId: string;
let branchCounter: number;
let triggerSlashMock: ReturnType<typeof vi.fn>;
let setChatMessagesMock: ReturnType<typeof vi.fn>;
let openCharacterChatMock: ReturnType<typeof vi.fn>;
let openGroupChatMock: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let rawChatView: SillyTavern.ChatMessage[];
let rawChatViewChatId: string | null;
let rawChatViewSource: TestMessage[] | null;
let respondFullSyncWithResync = true;

function currentChat(): TestChat {
  return chats[currentChatId];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getRawChatView(): SillyTavern.ChatMessage[] {
  const source = currentChat().messages;
  if (rawChatViewChatId === currentChatId && rawChatViewSource === source) return rawChatView;
  rawChatViewChatId = currentChatId;
  rawChatViewSource = source;
  rawChatView = source.map(message => {
    const activeSwipe = message.swipes?.[message.swipe_id ?? 0];
    const mes = activeSwipe ?? message.message ?? '';
    return {
      name: message.role === 'user' ? '玩家' : '角色',
      is_user: message.role === 'user',
      is_system: message.role === 'system',
      mes,
      swipe_id: message.swipe_id,
      swipes: message.swipes ? [...message.swipes] : undefined,
      swipe_info: message.swipes?.map(() => ({ extra: {} })),
      extra: {},
    };
  });
  return rawChatView;
}

function rawMessageToTestMessage(message: SillyTavern.ChatMessage, messageId: number): TestMessage {
  return {
    message_id: messageId,
    role: message.is_user ? 'user' : message.is_system ? 'system' : 'assistant',
    message: message.mes,
    swipe_id: message.swipe_id,
    swipes: message.swipes ? [...message.swipes] : undefined,
  };
}

function setupChats(initialChats: TestChat[], activeId: string): void {
  chats = Object.fromEntries(initialChats.map(chat => [chat.id, deepClone(chat)]));
  currentChatId = activeId;
  rawChatView = [];
  rawChatViewChatId = null;
  rawChatViewSource = null;
}

function persistTreeDirect(tree: WuxiaHistoryTreeV2): void {
  characterVariables[WUXIA_HISTORY_TREE_V2_KEY] = WuxiaHistoryTreeV2Schema.parse(tree);
}

function findNodeByPreview(tree: WuxiaHistoryTreeV2, preview: string) {
  return Object.values(tree.nodes).find(node => node.preview.includes(preview));
}

beforeEach(() => {
  characterVariables = {
    wuxia_save_tree: {
      version: 1,
      nodes: [{ id: 'legacy-must-be-ignored' }],
    },
  };
  branchCounter = 0;
  setupChats(
    [
      {
        id: 'chat-a',
        name: '聊天 A',
        messages: [],
        variables: {
          ERAMetaData: { SelectedMks: [] },
          stat_data: {},
        },
      },
    ],
    'chat-a',
  );

  vi.mocked(SillyTavern.getCurrentChatId).mockImplementation(() => currentChatId);
  Object.defineProperties(SillyTavern, {
    characterId: { configurable: true, value: '0' },
    groupId: { configurable: true, value: '' },
    characters: { configurable: true, value: [{ name: '测试角色', avatar: 'test-character.png' }] },
    groups: { configurable: true, value: [] },
    chat: { configurable: true, get: () => getRawChatView() },
  });
  openCharacterChatMock = vi.mocked(SillyTavern.openCharacterChat);
  openCharacterChatMock.mockImplementation(async (chatId: string) => {
    if (!chats[chatId]) return;
    currentChatId = chatId;
    rawChatViewChatId = null;
  });
  openGroupChatMock = vi.mocked(SillyTavern.openGroupChat);
  openGroupChatMock.mockImplementation(async (_groupId: string, chatId: string) => {
    if (!chats[chatId]) return;
    currentChatId = chatId;
    rawChatViewChatId = null;
  });
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/chats/get' || url === '/api/chats/group/get') {
      const body = JSON.parse(String(options?.body ?? '{}')) as { file_name?: string; id?: string };
      const chat = chats[body.file_name ?? body.id ?? ''];
      if (!chat) {
        // 真实酒馆对不存在的聊天文件返回 200 + 空对象而不是 404
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => [
          { chat_metadata: {} },
          ...chat.messages.map(message => ({
            is_user: message.role === 'user',
            is_system: message.role === 'system',
            mes: message.message ?? message.swipes?.[message.swipe_id ?? 0] ?? '',
          })),
        ],
      } as Response;
    }
    const history = Object.fromEntries(
      Object.values(chats).map((chat, index) => [index, { file_name: `${chat.id}.jsonl` }]),
    );
    return {
      ok: true,
      status: 200,
      json: async () => history,
    } as Response;
  });
  Object.assign(globalThis, { fetch: fetchMock });
  getVariablesMock.mockImplementation((option: { type: string }) =>
    option.type === 'character' ? characterVariables : currentChat().variables,
  );
  updateVariablesWithMock.mockImplementation(
    (updater: (variables: Record<string, unknown>) => Record<string, unknown>, option: { type: string }) => {
      if (option.type === 'character') {
        characterVariables = updater(characterVariables);
        return characterVariables;
      }
      currentChat().variables = updater(currentChat().variables);
      return currentChat().variables;
    },
  );
  getChatMessagesMock.mockImplementation((range: string | number) => {
    if (typeof range === 'number' && range >= 0) {
      return currentChat().messages.filter(message => message.message_id === range) as never;
    }
    return currentChat().messages as never;
  });

  setChatMessagesMock = vi.fn(async (patches: Array<{ message_id: number; swipe_id?: number }>) => {
    for (const patch of patches) {
      const message = currentChat().messages.find(item => item.message_id === patch.message_id);
      if (message && Number.isInteger(patch.swipe_id)) {
        message.swipe_id = patch.swipe_id;
        if (message.swipes?.[patch.swipe_id!]) message.message = message.swipes[patch.swipe_id!];
      }
    }
  });
  Object.assign(globalThis, { setChatMessages: setChatMessagesMock });

  triggerSlashMock = vi.fn(async (command: string) => {
    if (command === '/getchatname') return currentChat().name;
    if (command.startsWith('/go ')) {
      const targetName = JSON.parse(command.slice('/go '.length)) as string;
      const target = Object.values(chats).find(chat => chat.name === targetName);
      if (!target) throw new Error(`missing chat: ${targetName}`);
      currentChatId = target.id;
      return '';
    }
    if (command.startsWith('/branch-create ')) {
      const messageId = Number(command.slice('/branch-create '.length));
      const source = currentChat();
      const branchMessages = getRawChatView()
        .slice(0, messageId + 1)
        .map((message, index) => rawMessageToTestMessage(message, index));
      const id = `fork-${++branchCounter}`;
      chats[id] = {
        id,
        name: `新分支 ${branchCounter}`,
        messages: deepClone(branchMessages),
        variables: deepClone(source.variables),
      };
      currentChatId = id;
      rawChatViewChatId = null;
      return '';
    }
    return '';
  });
  Object.assign(globalThis, { triggerSlash: triggerSlashMock });
  localStorage.clear();
  eventEmitMock.mockClear();
  // 生产环境中 manual_full_sync 由 ERA 框架异步重算后以 era:writeDone(resync) 回应，
  // 并在 syncIds 中回传请求方携带的 syncId；测试里同步回发该信号，并去掉静默等待窗口。
  respondFullSyncWithResync = true;
  configureHistoryEraSyncTiming({ timeoutMs: 500, quietMs: 0 });
  eventOn('manual_full_sync', (detail?: { syncId?: string }) => {
    if (!respondFullSyncWithResync) return;
    void eventEmit('era:writeDone', {
      message_id: 0,
      actions: { resync: true },
      syncIds: typeof detail?.syncId === 'string' ? [detail.syncId] : [],
    });
  });
});

describe('history chat rename helpers', () => {
  it('手动命名拒绝空名、非法路径字符与同名', () => {
    expect(() => validateChatRenameTarget('')).toThrow('请填写存档名称');
    expect(() => validateChatRenameTarget('天山/少林')).toThrow('路径非法字符');
    expect(() => validateChatRenameTarget('旧卷', '旧卷')).toThrow('名称相同');
  });

  it('自动分支名按实际酒馆聊天列表追加唯一序号', async () => {
    chats['根卷 · 第2段'] = { ...currentChat(), id: '根卷 · 第2段', name: '根卷 · 第2段' };
    chats['根卷 · 第2段 · 2'] = { ...currentChat(), id: '根卷 · 第2段 · 2', name: '根卷 · 第2段 · 2' };

    expect(await getUniqueChatRenameSuggestion('根卷 · 第2段')).toBe('根卷 · 第2段 · 3');
  });

  it('自动命名会清理节点题名中的路径字符，再交由酒馆改名事务提交', async () => {
    vi.mocked(SillyTavern.renameChat).mockImplementation(async (_oldName: string, newName: string) => {
      const current = currentChat();
      delete chats[currentChatId];
      chats[newName] = { ...current, id: newName, name: newName };
      currentChatId = newName;
      rawChatViewChatId = null;
    });

    const result = await renameCurrentChatAutomatically('根卷/题名');

    expect(result.status).toBe('committed');
    expect(vi.mocked(SillyTavern.renameChat)).toHaveBeenCalledWith('聊天 A', '根卷·题名');
  });

  it('以根卷名和节点题名/父链段数建议新分叉名称', () => {
    const tree: WuxiaHistoryTreeV2 = {
      version: 2,
      updatedAt: 1,
      nodes: {
        root: {
          id: 'root', parentId: null, locators: [], messageKey: null, label: null, pinned: false, preview: '', location: '', worldTimeText: '', createdAt: 1, verification: null,
        },
        child: {
          id: 'child', parentId: 'root', locators: [], messageKey: null, label: '夜探镖局', pinned: false, preview: '', location: '', worldTimeText: '', createdAt: 2, verification: null,
        },
      },
      branches: {
        rootBranch: {
          id: 'rootBranch', chatId: 'root-chat', chatName: '郭靖 · 牛家村', originNodeId: null, headNodeId: 'child', createdAt: 1, status: 'active',
        },
      },
    };

    expect(suggestForkChatName(tree, 'child', '来源聊天')).toBe('郭靖 · 牛家村 · 夜探镖局');
    tree.nodes.child.label = null;
    expect(suggestForkChatName(tree, 'child', '来源聊天')).toBe('郭靖 · 牛家村 · 第2段');
  });

  it('改名后重键分支并迁移全部 locator，重复恢复不会重复数据', () => {
    const tree: WuxiaHistoryTreeV2 = {
      version: 2,
      updatedAt: 1,
      nodes: {
        node: {
          id: 'node', parentId: null, messageKey: null, label: null, pinned: false, preview: '开场', location: '', worldTimeText: '', createdAt: 1, verification: null,
          locators: [
            { chatId: 'old-chat', chatName: '旧卷', userMessageId: null, assistantMessageId: 0, swipeId: 0 },
            { chatId: 'other-chat', chatName: '别卷', userMessageId: null, assistantMessageId: 0, swipeId: 0 },
          ],
        },
      },
      branches: {
        oldBranch: {
          id: 'oldBranch', chatId: 'old-chat', chatName: '旧卷', originNodeId: null, headNodeId: 'node', createdAt: 1, status: 'active',
        },
      },
    };
    persistTreeDirect(tree);

    const migrated = migrateHistoryChatIdentity({ id: 'old-chat', name: '旧卷' }, { id: 'new-chat', name: '新卷' });
    expect(migrated.nodes.node.locators).toContainEqual(
      expect.objectContaining({ chatId: 'new-chat', chatName: '新卷' }),
    );
    expect(migrated.nodes.node.locators.some(locator => locator.chatId === 'old-chat')).toBe(false);
    expect(Object.values(migrated.branches)).toContainEqual(
      expect.objectContaining({ chatId: 'new-chat', chatName: '新卷' }),
    );

    const repeated = migrateHistoryChatIdentity({ id: 'old-chat', name: '旧卷' }, { id: 'new-chat', name: '新卷' });
    expect(repeated.nodes.node.locators).toHaveLength(2);
    expect(Object.keys(repeated.branches)).toHaveLength(1);
  });

  it('重载后确认目标聊天才迁移历史、头像缓存和未发送草稿，重复恢复幂等', async () => {
    currentChat().messages = [{ message_id: 0, role: 'assistant', message: '改名前的开场' }];
    const scanned = await scanCurrentChat();
    const customAvatarKey = getAvatarStorageKey('player', 'chat-a');
    const selectionKey = getAvatarSelectionStorageKey('player', 'chat-a');
    localStorage.setItem(customAvatarKey, JSON.stringify({ version: 1, imageData: 'data:image/png;base64,AA==', updatedAt: 1 }));
    localStorage.setItem(selectionKey, JSON.stringify({ version: 1, avatarRef: 'preset:hero', updatedAt: 1 }));
    writeHistoryCheckoutDraft({ transactionId: 'draft', chatId: 'chat-a', message: '尚未发送的行动', createdAt: 1 });
    createChatRenameJournal({
      reason: 'manual',
      oldChatId: 'chat-a',
      oldChatName: '聊天 A',
      requestedName: '郭靖 · 牛家村',
      reopenHistoryPanel: true,
    });

    const oldChat = chats['chat-a'];
    delete chats['chat-a'];
    chats['renamed-chat'] = { ...oldChat, id: 'renamed-chat', name: '郭靖 · 牛家村' };
    currentChatId = 'renamed-chat';
    rawChatViewChatId = null;

    const resumed = await resumePendingChatRename();
    expect(resumed.status).toBe('committed');
    expect(readChatRenameJournal()).toBeNull();
    expect(loadHistoryTree().nodes[scanned.currentNodeId!]?.locators).toContainEqual(
      expect.objectContaining({ chatId: 'renamed-chat', chatName: '郭靖 · 牛家村' }),
    );
    expect(Object.values(loadHistoryTree().branches)).toContainEqual(
      expect.objectContaining({ chatId: 'renamed-chat', chatName: '郭靖 · 牛家村' }),
    );
    expect(localStorage.getItem(getAvatarStorageKey('player', 'renamed-chat'))).not.toBeNull();
    expect(localStorage.getItem(getAvatarSelectionStorageKey('player', 'renamed-chat'))).not.toBeNull();
    expect(localStorage.getItem(customAvatarKey)).toBeNull();
    expect(localStorage.getItem(selectionKey)).toBeNull();
    expect(JSON.parse(localStorage.getItem(HISTORY_CHECKOUT_DRAFT_KEY)!).chatId).toBe('renamed-chat');

    expect((await resumePendingChatRename()).status).toBe('not_pending');
    expect(loadHistoryTree().nodes[scanned.currentNodeId!]?.locators).toHaveLength(1);
  });
});

describe('history tree v2 scanning', () => {
  it('首次扫描覆盖开场、普通、多 swipe，并跳过 loader-only 与 hidden 楼层', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '【序章】江湖初醒' },
      { message_id: 1, role: 'user', message: '向东走' },
      {
        message_id: 2,
        role: 'assistant',
        swipe_id: 1,
        swipes: [
          '<era_data>{"era-message-key"="mk-a","era-message-type"="assistant"}</era_data>\n走入竹林',
          '<era_data>{"era-message-key"="mk-b","era-message-type"="assistant"}</era_data>\n留在客栈',
        ],
      },
      {
        message_id: 3,
        role: 'assistant',
        message: '<body><script>$("body").load("https://example.test/dist/武侠/index.html")</script></body>',
      },
      { message_id: 4, role: 'assistant', is_hidden: true, message: '隐藏提示，不应建节点' },
      { message_id: 5, role: 'user', message: '询问掌柜' },
      { message_id: 6, role: 'assistant', message: '掌柜递来一封信' },
    ];

    const first = await scanCurrentChat({ location: '张家口', worldTimeText: '1219年秋' });
    const opening = findNodeByPreview(first.tree, '江湖初醒')!;
    const bamboo = findNodeByPreview(first.tree, '走入竹林')!;
    const inn = findNodeByPreview(first.tree, '留在客栈')!;
    const letter = findNodeByPreview(first.tree, '掌柜递来一封信')!;

    expect(Object.keys(first.tree.nodes)).toHaveLength(4);
    expect(opening.parentId).toBeNull();
    expect(bamboo.parentId).toBe(opening.id);
    expect(inn.parentId).toBe(opening.id);
    expect(letter.parentId).toBe(inn.id);
    expect(bamboo.locators[0].userMessageId).toBe(1);
    expect(inn.locators[0].swipeId).toBe(1);
    expect(letter.locators[0].userMessageId).toBe(5);
    expect(first.currentNodeId).toBe(letter.id);
    expect(letter.location).toBe('张家口');
    expect(letter.worldTimeText).toBe('1219年秋');
    expect([opening, bamboo, inn].every(node => node.location === '' && node.worldTimeText === '')).toBe(true);
    expect(Object.values(first.tree.nodes).every(node => node.verification === null)).toBe(true);

    const second = await scanCurrentChat();
    expect(Object.keys(second.tree.nodes).sort()).toEqual(Object.keys(first.tree.nodes).sort());
    expect(Object.values(second.tree.nodes).every(node => node.locators.length === 1)).toBe(true);
  });

  it('finalizeCurrentTurn 幂等封存 verification，且事件 hash 排除前端派生结算字段', async () => {
    currentChat().messages = [{ message_id: 0, role: 'assistant', message: '开场' }];
    currentChat().variables = {
      ERAMetaData: { SelectedMks: ['mk-opening'] },
      stat_data: {
        事件系统: { 进行中事件: { a: 1 } },
        参与事件: { a: true },
        世界事件: { old: 1 },
        后续事件线索: { next: 1 },
        后续事件线索计数: { next: 2 },
        前端变量: {
          事件结局状态: { should: 'ignore' },
          事件结算进度: { should: 'ignore' },
          事件调度状态: { should: 'ignore' },
        },
      },
    };

    const first = await finalizeCurrentTurn({ location: '牛家村', worldTimeText: '正午' });
    const firstNode = first.tree.nodes[first.currentNodeId!]!;
    currentChat().variables = {
      ...currentChat().variables,
      stat_data: {
        ...(currentChat().variables.stat_data as Record<string, unknown>),
        前端变量: {
          事件结局状态: { changed: true },
          事件结算进度: null,
          事件调度状态: { changed: true },
        },
      },
    };
    const second = await finalizeCurrentTurn({ location: '牛家村', worldTimeText: '正午' });
    const secondNode = second.tree.nodes[second.currentNodeId!]!;

    expect(second.currentNodeId).toBe(first.currentNodeId);
    expect(Object.keys(second.tree.nodes)).toHaveLength(1);
    expect(secondNode.verification).toEqual(firstNode.verification);
    expect(secondNode.location).toBe('牛家村');
    expect(secondNode.worldTimeText).toBe('正午');
  });

  it('使用 zod 严格校验 v2，完全忽略旧 wuxia_save_tree，并支持 rename/pin', async () => {
    expect(loadHistoryTree().nodes).toEqual({});
    expect(() =>
      WuxiaHistoryTreeV2Schema.parse({
        version: 2,
        updatedAt: 0,
        nodes: {},
        branches: {},
        legacy: true,
      }),
    ).toThrow();

    currentChat().messages = [{ message_id: 0, role: 'assistant', message: '无名节点' }];
    const scanned = await scanCurrentChat();
    renameNode(scanned.currentNodeId!, '  客栈夜话  ');
    setNodePinned(scanned.currentNodeId!, true);
    const node = loadHistoryTree().nodes[scanned.currentNodeId!]!;
    expect(node.label).toBe('客栈夜话');
    expect(node.pinned).toBe(true);
  });

  it('预览按酒馆显示正则滤掉思维链，跳过全吞型正则，重扫刷新旧预览且节点身份不变', async () => {
    const story = '正文开场白：'.concat('少年负剑入江湖，'.repeat(30));
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: `内心盘算不该出现</think>${story}<tucao>吐槽也不该出现</tucao>` },
    ];
    const before = await scanCurrentChat();
    expect(before.tree.nodes[before.currentNodeId!]!.preview).toContain('内心盘算不该出现');

    Object.assign(globalThis, {
      getTavernRegexes: vi.fn(() => [
        // 美化思维链：真实预设里替换物是 HTML/CSS，预览侧应当作删除
        {
          enabled: true,
          source: { ai_output: true },
          destination: { display: true },
          find_regex: '/[\\s\\S]*?<\\/think>/g',
          replace_string: '<style>.thinking{}</style>',
        },
        {
          enabled: true,
          source: { ai_output: true },
          destination: { display: true },
          find_regex: '/<tucao>[\\s\\S]*?<\\/tucao>/g',
          replace_string: '',
        },
        // 仅提示词侧的正则不得影响预览
        {
          enabled: true,
          source: { ai_output: true },
          destination: { display: false, prompt: true },
          find_regex: '/正文开场白/g',
          replace_string: '',
        },
        // "游戏页面"式全吞正则：应被安全阀跳过
        {
          enabled: true,
          source: { ai_output: true },
          destination: { display: true },
          find_regex: '/.+/s',
          replace_string: '<body>loader</body>',
        },
      ]),
    });
    try {
      const after = await scanCurrentChat();
      const afterNode = after.tree.nodes[after.currentNodeId!]!;
      // 同一节点（身份哈希基于原文，不受正则影响），预览已刷新为正文
      expect(after.currentNodeId).toBe(before.currentNodeId);
      expect(afterNode.preview.startsWith('正文开场白：')).toBe(true);
      expect(afterNode.preview).not.toContain('内心盘算');
      expect(afterNode.preview).not.toContain('吐槽');
    } finally {
      delete (globalThis as Record<string, unknown>).getTavernRegexes;
    }
  });

  it('filterTreeToRelatedComponent 只保留与 anchor 连通的脉络及其分支', () => {
    const makeNode = (id: string, parentId: string | null) => ({
      id,
      parentId,
      locators: [],
      messageKey: null,
      label: null,
      pinned: false,
      preview: id,
      location: '',
      worldTimeText: '',
      createdAt: 1,
      verification: null,
    });
    const makeBranch = (id: string, headNodeId: string | null, originNodeId: string | null = null) => ({
      id,
      chatId: `chat-${id}`,
      chatName: `chat-${id}`,
      originNodeId,
      headNodeId,
      createdAt: 1,
      status: 'available' as const,
    });
    // 脉络 A：a1 → a2 → a3，a2 还有旁支 a2b；脉络 B（另一历史局）：b1 → b2
    const tree = {
      version: 2 as const,
      updatedAt: 0,
      nodes: {
        a1: makeNode('a1', null),
        a2: makeNode('a2', 'a1'),
        a2b: makeNode('a2b', 'a1'),
        a3: makeNode('a3', 'a2'),
        b1: makeNode('b1', null),
        b2: makeNode('b2', 'b1'),
      },
      branches: {
        'branch-a': makeBranch('branch-a', 'a3'),
        'branch-a-fork': makeBranch('branch-a-fork', 'a2b', 'a1'),
        'branch-b': makeBranch('branch-b', 'b2'),
      },
    };

    const filtered = filterTreeToRelatedComponent(tree, 'a3');
    expect(Object.keys(filtered.nodes).sort()).toEqual(['a1', 'a2', 'a2b', 'a3']);
    expect(Object.keys(filtered.branches).sort()).toEqual(['branch-a', 'branch-a-fork']);

    // anchor 缺失或为 null 时原样返回
    expect(filterTreeToRelatedComponent(tree, null)).toBe(tree);
    expect(filterTreeToRelatedComponent(tree, 'missing')).toBe(tree);
    // 全树连通时不做多余拷贝
    expect(filterTreeToRelatedComponent(filtered, 'a1')).toBe(filtered);
  });

  it('stableHistoryHash 不受对象键顺序影响', () => {
    expect(stableHistoryHash({ b: 2, a: { y: 2, x: 1 } })).toBe(stableHistoryHash({ a: { x: 1, y: 2 }, b: 2 }));
    expect(stableHistoryHash({ a: 1 })).not.toBe(stableHistoryHash({ a: 2 }));
  });
});

describe('history checkout', () => {
  it('最新且无后继的 sibling swipe 在原聊天切换并 commit', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', swipe_id: 0, swipes: ['路线甲', '路线乙'], message: '路线甲' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '路线乙')!;

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('commit');
    expect(result.actionKind).toBe('in_place_swipe');
    expect(currentChat().messages[0].swipe_id).toBe(1);
    expect(triggerSlashMock.mock.calls.some(([command]) => String(command).startsWith('/branch-create'))).toBe(false);
    expect(eventEmitMock).toHaveBeenCalledWith('manual_full_sync', { syncId: expect.any(String) });
    expect(localStorage.getItem(HISTORY_CHECKOUT_JOURNAL_KEY)).toBeNull();
  });

  it('节点 locator 含已删除的旧聊天时，分叉优先使用当前聊天的 locator', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '开场' },
      { message_id: 1, role: 'user', message: '前进' },
      { message_id: 2, role: 'assistant', message: '中途' },
      { message_id: 3, role: 'user', message: '继续' },
      { message_id: 4, role: 'assistant', message: '结尾' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '中途')!;
    // 模拟历史树里残留的、指向已被用户删除的旧聊天的 locator（排在最前）
    const tree = loadHistoryTree();
    tree.nodes[target.id] = {
      ...tree.nodes[target.id],
      locators: [
        { ...tree.nodes[target.id].locators[0], chatId: 'ghost-chat', chatName: '已删除聊天' },
        ...tree.nodes[target.id].locators,
      ],
    };
    persistTreeDirect(tree);

    const result = await checkoutNode(target.id, { forceBranch: true });

    expect(result.status).toBe('commit');
    expect(result.actionKind).toBe('fork_branch');
    expect(result.currentChat?.id).toMatch(/^fork-/);
    expect(result.postCommitChatName).toMatch(/^聊天 A · 第\d+段$/);
    expect(triggerSlashMock).toHaveBeenCalledWith('/branch-create 2');
  });

  it('可复用分支的聊天文件已删除时当场标记 broken 并直接分叉当前聊天', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '开场' },
      { message_id: 1, role: 'user', message: '前进' },
      { message_id: 2, role: 'assistant', message: '中途' },
      { message_id: 3, role: 'user', message: '继续' },
      { message_id: 4, role: 'assistant', message: '结尾' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '中途')!;
    // 模拟昨天创建、之后被用户删除的分支聊天：分支头仍指向目标节点
    const tree = loadHistoryTree();
    tree.branches['history_branch_ghosttest'] = {
      id: 'history_branch_ghosttest',
      chatId: 'ghost-branch-chat',
      chatName: '已删除分支',
      originNodeId: target.id,
      headNodeId: target.id,
      createdAt: 1,
      status: 'active',
    };
    tree.nodes[target.id] = {
      ...tree.nodes[target.id],
      locators: [
        { ...tree.nodes[target.id].locators[0], chatId: 'ghost-branch-chat', chatName: '已删除分支' },
        ...tree.nodes[target.id].locators,
      ],
    };
    persistTreeDirect(tree);

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('commit');
    expect(result.actionKind).toBe('fork_branch');
    expect(triggerSlashMock).toHaveBeenCalledWith('/branch-create 2');
    expect(loadHistoryTree().branches['history_branch_ghosttest'].status).toBe('broken');
  });

  it('节点唯一 locator 指向已删除聊天时报聊天不可用而不是格式错误', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '开场' },
      { message_id: 1, role: 'user', message: '前进' },
      { message_id: 2, role: 'assistant', message: '中途' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '中途')!;
    const tree = loadHistoryTree();
    tree.nodes[target.id] = {
      ...tree.nodes[target.id],
      locators: [{ ...tree.nodes[target.id].locators[0], chatId: 'ghost-chat', chatName: '已删除聊天' }],
    };
    persistTreeDirect(tree);

    const result = await checkoutNode(target.id, { forceBranch: true });

    expect(result.status).toBe('broken');
    expect(result.error).toContain('历史聊天不可用');
  });

  it('不带匹配 syncId 的 resync writeDone（如 chat_changed 同步）不会提前放行校验', async () => {
    respondFullSyncWithResync = false;
    configureHistoryEraSyncTiming({ timeoutMs: 60, quietMs: 0 });
    // 模拟 /branch-create 切聊天后 chat_changed 触发的增量同步：resync=true 但没有回传 syncIds
    eventOn('manual_full_sync', () => {
      void eventEmit('era:writeDone', { message_id: 0, actions: { resync: true } });
    });
    currentChat().messages = [
      { message_id: 0, role: 'assistant', swipe_id: 0, swipes: ['路线甲', '路线乙'], message: '路线甲' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '路线乙')!;

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('recovery_failed');
    expect(result.error).toContain('超时');
    expect(readHistoryCheckoutJournal()).not.toBeNull();
    const branches = Object.values(loadHistoryTree().branches);
    expect(branches.every(branch => branch.status !== 'broken')).toBe(true);
  });

  it('ERA 合批后以 syncIds 数组回传时同样能匹配完成信号', async () => {
    respondFullSyncWithResync = false;
    configureHistoryEraSyncTiming({ timeoutMs: 500, quietMs: 0 });
    // 模拟 manual_full_sync 与 chat_changed 在 ERA 队列里合批：detail 被并入 syncIds 数组回传
    eventOn('manual_full_sync', (detail?: { syncId?: string }) => {
      void eventEmit('era:writeDone', {
        message_id: 0,
        actions: { resync: true },
        syncIds: ['other-waiter', ...(typeof detail?.syncId === 'string' ? [detail.syncId] : [])],
      });
    });
    currentChat().messages = [
      { message_id: 0, role: 'assistant', swipe_id: 0, swipes: ['路线甲', '路线乙'], message: '路线甲' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '路线乙')!;

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('commit');
    expect(localStorage.getItem(HISTORY_CHECKOUT_JOURNAL_KEY)).toBeNull();
  });

  it('ERA 重算完成信号超时会中止校验并保留 journal 供重试', async () => {
    respondFullSyncWithResync = false;
    configureHistoryEraSyncTiming({ timeoutMs: 30, quietMs: 0 });
    currentChat().messages = [
      { message_id: 0, role: 'assistant', swipe_id: 0, swipes: ['路线甲', '路线乙'], message: '路线甲' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '路线乙')!;

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('recovery_failed');
    expect(result.error).toContain('超时');
    expect(readHistoryCheckoutJournal()).not.toBeNull();
    // 校验未执行，不应把分支判定为 broken
    const branches = Object.values(loadHistoryTree().branches);
    expect(branches.every(branch => branch.status !== 'broken')).toBe(true);
  });

  it('已有分支叶通过聊天文件 ID 精确切换，不创建重复 branch', async () => {
    const rootMessage: TestMessage = { message_id: 0, role: 'assistant', message: '共同根节点' };
    currentChat().messages = [
      rootMessage,
      { message_id: 1, role: 'user', message: '继续' },
      { message_id: 2, role: 'assistant', message: '来源分支后续' },
    ];
    const scanned = await scanCurrentChat();
    const root = findNodeByPreview(scanned.tree, '共同根节点')!;
    const specialName = '分支 "乙"\n第二行';
    chats['chat-b'] = {
      id: 'chat-b',
      name: specialName,
      messages: [deepClone(rootMessage)],
      variables: deepClone(currentChat().variables),
    };
    const tree = deepClone(scanned.tree);
    const locator: HistoryLocator = {
      chatId: 'chat-b',
      chatName: specialName,
      userMessageId: null,
      assistantMessageId: 0,
      swipeId: 0,
    };
    tree.nodes[root.id].locators.push(locator);
    const branchId = `history_branch_${stableHistoryHash('chat-b')}`;
    tree.branches[branchId] = {
      id: branchId,
      chatId: 'chat-b',
      chatName: specialName,
      originNodeId: root.id,
      headNodeId: root.id,
      createdAt: 1,
      status: 'available',
    };
    persistTreeDirect(tree);

    const result = await checkoutNode(root.id);

    expect(result.status).toBe('commit');
    expect(result.actionKind).toBe('existing_branch');
    expect(currentChatId).toBe('chat-b');
    expect(openCharacterChatMock).toHaveBeenCalledWith('chat-b');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/characters/chats',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ avatar_url: 'test-character.png' }),
      }),
    );
    expect(triggerSlashMock.mock.calls.some(([command]) => String(command).startsWith('/go '))).toBe(false);
    expect(triggerSlashMock.mock.calls.some(([command]) => String(command).startsWith('/branch-create'))).toBe(false);
  });

  it('群聊分支通过 groupId 和聊天文件 ID 精确切换', async () => {
    const rootMessage: TestMessage = { message_id: 0, role: 'assistant', message: '群聊共同根节点' };
    currentChat().messages = [
      rootMessage,
      { message_id: 1, role: 'user', message: '继续' },
      { message_id: 2, role: 'assistant', message: '群聊来源后续' },
    ];
    const scanned = await scanCurrentChat();
    const root = findNodeByPreview(scanned.tree, '群聊共同根节点')!;
    chats['chat-b'] = {
      id: 'chat-b',
      name: '群聊分支 B',
      messages: [deepClone(rootMessage)],
      variables: deepClone(currentChat().variables),
    };
    const tree = deepClone(scanned.tree);
    const locator: HistoryLocator = {
      chatId: 'chat-b',
      chatName: '群聊分支 B',
      userMessageId: null,
      assistantMessageId: 0,
      swipeId: 0,
    };
    tree.nodes[root.id].locators.push(locator);
    const branchId = `history_branch_${stableHistoryHash('chat-b')}`;
    tree.branches[branchId] = {
      id: branchId,
      chatId: 'chat-b',
      chatName: '群聊分支 B',
      originNodeId: root.id,
      headNodeId: root.id,
      createdAt: 1,
      status: 'available',
    };
    persistTreeDirect(tree);
    Object.defineProperties(SillyTavern, {
      groupId: { configurable: true, value: 'group-1' },
      groups: {
        configurable: true,
        value: [{ id: 'group-1', chats: ['chat-a', 'chat-b'] }],
      },
    });

    const result = await checkoutNode(root.id);

    expect(result.status).toBe('commit');
    expect(currentChatId).toBe('chat-b');
    expect(openGroupChatMock).toHaveBeenCalledWith('group-1', 'chat-b');
    expect(openCharacterChatMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('历史分叉只在内存快照选择 swipe，不写回来源聊天或往返导航', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '序章' },
      { message_id: 1, role: 'user', message: '选择' },
      {
        message_id: 2,
        role: 'assistant',
        swipe_id: 0,
        swipes: ['来源路线', '目标旧路线'],
        message: '来源路线',
      },
      { message_id: 3, role: 'user', message: '来源继续' },
      { message_id: 4, role: 'assistant', message: '来源叶节点' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '目标旧路线')!;

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('commit');
    expect(result.actionKind).toBe('fork_branch');
    expect(triggerSlashMock).toHaveBeenCalledWith('/branch-create 2');
    expect(openCharacterChatMock).not.toHaveBeenCalled();
    expect(setChatMessagesMock).not.toHaveBeenCalled();
    expect(chats['chat-a'].messages.find(message => message.message_id === 2)?.swipe_id).toBe(0);
    expect(chats['fork-1'].messages.find(message => message.message_id === 2)?.swipe_id).toBe(1);
    expect(currentChatId).toBe('fork-1');
    expect(localStorage.getItem(HISTORY_CHECKOUT_DRAFT_KEY)).toBeNull();
    const forkBranch = result.currentBranchId ? loadHistoryTree().branches[result.currentBranchId] : null;
    expect(forkBranch?.originNodeId).toBe(target.id);
    expect(forkBranch?.headNodeId).toBe(target.id);
  });

  it('从有后继的历史节点分叉时，把原路线下一次玩家行动预填为草稿但不发送', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '序章' },
      { message_id: 1, role: 'user', message: '接受委托' },
      { message_id: 2, role: 'assistant', message: '掌柜递来地图' },
      { message_id: 3, role: 'user', message: '沿山路前往古寺调查' },
      { message_id: 4, role: 'assistant', message: '古寺钟声忽然响起' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '掌柜递来地图')!;

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('commit');
    expect(result.actionKind).toBe('fork_branch');
    expect(chats['fork-1'].messages.map(message => message.message_id)).toEqual([0, 1, 2]);
    expect(triggerSlashMock.mock.calls.some(([command]) => command === '/trigger')).toBe(false);
    expect(JSON.parse(localStorage.getItem(HISTORY_CHECKOUT_DRAFT_KEY)!)).toEqual(
      expect.objectContaining({
        version: 1,
        chatId: 'fork-1',
        message: '沿山路前往古寺调查',
      }),
    );
  });

  it('branch-create 完成后即使来源聊天被外部删除，新分支仍可独立提交', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '序章' },
      { message_id: 1, role: 'user', message: '选择' },
      {
        message_id: 2,
        role: 'assistant',
        swipe_id: 0,
        swipes: ['来源路线', '目标旧路线'],
        message: '来源路线',
      },
      { message_id: 3, role: 'user', message: '继续' },
      { message_id: 4, role: 'assistant', message: '来源叶节点' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '目标旧路线')!;
    const baseSlash = triggerSlashMock.getMockImplementation()!;
    triggerSlashMock.mockImplementation(async (command: string) => {
      const result = await baseSlash(command);
      if (command.startsWith('/branch-create ')) delete chats['chat-a'];
      return result;
    });

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('commit');
    expect(currentChatId).toBe('fork-1');
    expect(openCharacterChatMock).not.toHaveBeenCalledWith('chat-a');
    expect(readHistoryCheckoutJournal()).toBeNull();
  });

  it('branch-create 切换 iframe 后中断时，resume 识别已有截断快照且不会重复建分支', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '序章' },
      { message_id: 1, role: 'user', message: '选择' },
      {
        message_id: 2,
        role: 'assistant',
        swipe_id: 0,
        swipes: ['来源路线', '目标旧路线'],
        message: '来源路线',
      },
      { message_id: 3, role: 'user', message: '继续' },
      { message_id: 4, role: 'assistant', message: '来源叶节点' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '目标旧路线')!;
    const baseSlash = triggerSlashMock.getMockImplementation()!;
    let interruptAfterBranch = true;
    triggerSlashMock.mockImplementation(async (command: string) => {
      const result = await baseSlash(command);
      if (command.startsWith('/branch-create ') && interruptAfterBranch) {
        interruptAfterBranch = false;
        throw new Error('模拟 branch-create 后 iframe 已卸载');
      }
      return result;
    });

    const interrupted = await checkoutNode(target.id);
    expect(interrupted.status).toBe('recovery_failed');
    expect(currentChatId).toBe('fork-1');
    expect(readHistoryCheckoutJournal()?.stage).toBe('create_branch');

    const resumed = await resumeCheckout();
    expect(resumed?.status).toBe('commit');
    expect(currentChatId).toBe('fork-1');
    expect(branchCounter).toBe(1);
    expect(
      triggerSlashMock.mock.calls.filter(([command]) => String(command).startsWith('/branch-create ')),
    ).toHaveLength(1);
    expect(readHistoryCheckoutJournal()).toBeNull();
  });

  it('旧版 create_branch journal 重试时补算原路线行动草稿并复用已创建聊天', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '序章' },
      { message_id: 1, role: 'user', message: '接受委托' },
      { message_id: 2, role: 'assistant', message: '掌柜递来地图' },
      { message_id: 3, role: 'user', message: '沿山路前往古寺调查' },
      { message_id: 4, role: 'assistant', message: '古寺钟声忽然响起' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '掌柜递来地图')!;
    chats['fork-1'] = {
      id: 'fork-1',
      name: '新分支 1',
      messages: deepClone(currentChat().messages.filter(message => message.message_id <= 2)),
      variables: deepClone(currentChat().variables),
    };
    createHistoryCheckoutJournal({
      targetNodeId: target.id,
      targetLocator: target.locators[0],
      sourceHeadNodeId: scanned.currentNodeId!,
      sourceChatId: 'chat-a',
      sourceChatName: '聊天 A',
    });
    updateHistoryCheckoutJournal({
      stage: 'create_branch',
      targetLocator: {
        ...target.locators[0],
        chatId: 'fork-1',
        chatName: '新分支 1',
      },
    });
    currentChatId = 'fork-1';
    rawChatViewChatId = null;

    const resumed = await resumeCheckout();

    expect(resumed?.status).toBe('commit');
    expect(branchCounter).toBe(0);
    expect(JSON.parse(localStorage.getItem(HISTORY_CHECKOUT_DRAFT_KEY)!)).toEqual(
      expect.objectContaining({
        chatId: 'fork-1',
        message: '沿山路前往古寺调查',
      }),
    );
  });

  it('过期 journal 保留供重试/返回来源，但 pending 锁释放', async () => {
    currentChat().messages = [{ message_id: 0, role: 'assistant', message: '来源节点' }];
    const scanned = await scanCurrentChat();
    const source = scanned.tree.nodes[scanned.currentNodeId!]!;
    const locator = source.locators[0];
    createHistoryCheckoutJournal(
      {
        targetNodeId: source.id,
        targetLocator: locator,
        sourceHeadNodeId: source.id,
        sourceChatId: 'chat-a',
        sourceChatName: '聊天 A',
      },
      0,
    );

    const expired = await resumeCheckout();
    expect(expired?.status).toBe('recovery_failed');
    expect(readHistoryCheckoutJournal()).not.toBeNull();
    expect(getCheckoutRecoveryState().expired).toBe(true);
    expect(getCheckoutRecoveryState().pending).toBe(false);

    const returned = await returnToCheckoutSource();
    expect(returned?.status).toBe('commit');
    expect(currentChatId).toBe('chat-a');
    expect(readHistoryCheckoutJournal()).toBeNull();
  });

  it('失败 journal 未处理前禁止叠加第二次 checkout', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '来源节点' },
      { message_id: 1, role: 'user', message: '旧行动' },
      { message_id: 2, role: 'assistant', message: '目标节点' },
    ];
    const scanned = await scanCurrentChat();
    const source = findNodeByPreview(scanned.tree, '来源节点')!;
    const target = findNodeByPreview(scanned.tree, '目标节点')!;
    createHistoryCheckoutJournal({
      targetNodeId: source.id,
      targetLocator: source.locators[0],
      actionKind: 'fork_branch',
      branchSourceLocator: source.locators[0],
      sourceHeadNodeId: target.id,
      sourceChatId: 'chat-a',
      sourceChatName: '聊天 A',
    });

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('recovery_failed');
    expect(result.error).toContain('不能叠加创建另一条分叉');
    expect(readHistoryCheckoutJournal()?.targetNodeId).toBe(source.id);
    expect(triggerSlashMock.mock.calls.some(([command]) => String(command).startsWith('/branch-create'))).toBe(false);
  });

  it('返回来源时来源聊天已删除会标记来源分支 broken 并保留 journal', async () => {
    currentChat().messages = [{ message_id: 0, role: 'assistant', message: '来源节点' }];
    const scanned = await scanCurrentChat();
    const source = scanned.tree.nodes[scanned.currentNodeId!]!;
    chats['chat-b'] = {
      id: 'chat-b',
      name: '聊天 B',
      messages: deepClone(currentChat().messages),
      variables: deepClone(currentChat().variables),
    };
    createHistoryCheckoutJournal({
      targetNodeId: source.id,
      targetLocator: source.locators[0],
      sourceHeadNodeId: source.id,
      sourceChatId: 'chat-a',
      sourceChatName: '聊天 A',
    });
    currentChatId = 'chat-b';
    delete chats['chat-a'];

    const returned = await returnToCheckoutSource();

    expect(returned?.status).toBe('broken');
    expect(loadHistoryTree().branches[scanned.currentBranchId].status).toBe('broken');
    expect(currentChatId).toBe('chat-b');
    expect(readHistoryCheckoutJournal()).not.toBeNull();
  });

  it('返回来源导航中断后，自动 resume 继续返回而不恢复原 checkout', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', message: '序章' },
      { message_id: 1, role: 'user', message: '选择' },
      {
        message_id: 2,
        role: 'assistant',
        swipe_id: 0,
        swipes: ['来源路线', '目标旧路线'],
        message: '来源路线',
      },
      { message_id: 3, role: 'user', message: '继续' },
      { message_id: 4, role: 'assistant', message: '来源叶节点' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '目标旧路线')!;
    chats['fork-1'] = {
      id: 'fork-1',
      name: '新分支 1',
      messages: deepClone(currentChat().messages.filter(message => message.message_id <= 2)),
      variables: deepClone(currentChat().variables),
    };
    const journal = createHistoryCheckoutJournal({
      targetNodeId: target.id,
      targetLocator: target.locators[0],
      sourceHeadNodeId: scanned.currentNodeId!,
      sourceChatId: 'chat-a',
      sourceChatName: '聊天 A',
    });
    updateHistoryCheckoutJournal({
      stage: 'create_branch',
      targetLocator: {
        ...target.locators[0],
        chatId: 'fork-1',
        chatName: '新分支 1',
      },
    });
    currentChatId = 'fork-1';

    const baseOpenCharacterChat = openCharacterChatMock.getMockImplementation()!;
    let unloadOnSourceNavigation = true;
    openCharacterChatMock.mockImplementation(async (chatId: string) => {
      if (chatId === 'chat-a' && unloadOnSourceNavigation) {
        unloadOnSourceNavigation = false;
        throw new Error('模拟来源聊天导航中断');
      }
      return baseOpenCharacterChat(chatId);
    });

    const interrupted = await returnToCheckoutSource();
    expect(interrupted?.status).toBe('recovery_failed');
    expect(localStorage.getItem(HISTORY_CHECKOUT_RETURN_INTENT_KEY)).toBe(journal.transactionId);
    expect(readHistoryCheckoutJournal()).not.toBeNull();

    currentChatId = 'chat-a';
    const resumed = await resumeCheckout();
    expect(resumed?.status).toBe('commit');
    expect(currentChatId).toBe('chat-a');
    expect(openCharacterChatMock).not.toHaveBeenCalledWith('fork-1');
    expect(triggerSlashMock.mock.calls.some(([command]) => String(command).startsWith('/branch-create'))).toBe(false);
    expect(readHistoryCheckoutJournal()).toBeNull();
    expect(localStorage.getItem(HISTORY_CHECKOUT_RETURN_INTENT_KEY)).toBeNull();
  });

  it('verification 不一致会把当前分支标为 broken，并保留 journal', async () => {
    currentChat().messages = [
      { message_id: 0, role: 'assistant', swipe_id: 0, swipes: ['路线甲', '路线乙'], message: '路线甲' },
    ];
    const scanned = await scanCurrentChat();
    const target = findNodeByPreview(scanned.tree, '路线乙')!;
    const tree = deepClone(scanned.tree);
    tree.nodes[target.id].verification = {
      selectedMksHash: 'mismatch-selected',
      eventStateHash: 'mismatch-event',
    };
    persistTreeDirect(tree);

    const result = await checkoutNode(target.id);

    expect(result.status).toBe('broken');
    expect(loadHistoryTree().branches[scanned.currentBranchId].status).toBe('broken');
    expect(readHistoryCheckoutJournal()).not.toBeNull();
  });

  it('retryCheckoutRecovery 会续期过期 journal 并继续原 stage', async () => {
    currentChat().messages = [{ message_id: 0, role: 'assistant', message: '可重试节点' }];
    const scanned = await scanCurrentChat();
    const node = scanned.tree.nodes[scanned.currentNodeId!]!;
    const journal = createHistoryCheckoutJournal(
      {
        targetNodeId: node.id,
        targetLocator: node.locators[0],
        sourceHeadNodeId: node.id,
        sourceChatId: 'chat-a',
        sourceChatName: '聊天 A',
      },
      0,
    );
    localStorage.setItem(HISTORY_CHECKOUT_RETURN_INTENT_KEY, journal.transactionId);

    const result = await retryCheckoutRecovery();
    expect(result?.status).toBe('commit');
    expect(readHistoryCheckoutJournal()).toBeNull();
    expect(localStorage.getItem(HISTORY_CHECKOUT_RETURN_INTENT_KEY)).toBeNull();
  });
});
