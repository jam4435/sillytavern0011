import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_MEMORY_ENTRY_CONTENT,
  CONVERSATION_SUMMARY_ENTRY_CONTENT,
  applyConversationSummaryModeState,
  buildConversationSummaryRegexes,
  filterArchivedSummariesFromPrompt,
  filterEraBaseContextFromPrompt,
  filterHistoricalBackfillTurnsFromPrompt,
  filterConversationSummaryContextFromPrompt,
  filterSelectedPresetModulesFromPrompt,
  syncConversationSummaryRegexes,
} from './conversationSummaryManager';
import { getRegexRuleContentSignature } from './settingsManager';

describe('conversationSummaryManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('only installs the card display regex; prompt compression no longer depends on message depth', () => {
    const rules = buildConversationSummaryRegexes(5);
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('wuxia-card-summary-display-hide');
    expect(rules[0].destination).toEqual({ display: true, prompt: false });
    expect(rules[0].min_depth).toBeNull();
    expect(rules[0].max_depth).toBeNull();
    expect(buildConversationSummaryRegexes(1)).toEqual(buildConversationSummaryRegexes(20));
  });

  it('counts the five most recent real assistant floors across mixed system/user messages', () => {
    const history: Array<{ message_id: number; role: 'user' | 'assistant'; message: string }> = [];
    const chat: SillyTavern.SendingMessage[] = [
      { role: 'system', content: '世界书中的 <summary> 不得改动' },
      { role: 'user', content: 'few-shot 用户' },
      { role: 'assistant', content: 'few-shot 助手示例 <summary>示例摘要</summary>' },
    ];
    const refs = new Map<number, SillyTavern.SendingMessage>();
    for (let i = 1; i <= 8; i += 1) {
      const user = { role: 'user' as const, content: '用户' + i };
      const assistant = { role: 'assistant' as const, content: '第' + i + '轮原始正文\n<summary>摘要' + i + '</summary>' };
      history.push({ message_id: i * 2 - 1, role: 'user', message: user.content });
      history.push({ message_id: i * 2, role: 'assistant', message: assistant.content });
      chat.push(user);
      if (i === 4) chat.push({ role: 'system', content: '夹在 user/assistant 之间的系统消息' });
      chat.push(assistant);
      refs.set(i * 2 - 1, user);
      refs.set(i * 2, assistant);
    }

    expect(filterConversationSummaryContextFromPrompt(chat, 5, 'summary', history, refs)).toBe(11);
    expect(chat[0].content).toBe('世界书中的 <summary> 不得改动');
    expect(chat[2].content).toBe('few-shot 助手示例 <summary>示例摘要</summary>');
    for (let i = 1; i <= 3; i += 1) {
      expect(chat.some(message => message.content === '用户' + i)).toBe(false);
      expect(chat.some(message => message.content === '<summary>摘要' + i + '</summary>')).toBe(true);
      expect(chat.some(message => String(message.content).includes('第' + i + '轮原始正文'))).toBe(false);
    }
    for (let i = 4; i <= 8; i += 1) {
      expect(chat.some(message => message.content === '用户' + i)).toBe(true);
      expect(chat.some(message => message.content === '第' + i + '轮原始正文')).toBe(true);
    }
    expect(chat.some(message => message.content === '夹在 user/assistant 之间的系统消息')).toBe(true);
  });

  it('retains older full replies and paired user if no valid summary exists', () => {
    const chat = [
      { role: 'user' as const, content: '旧用户' },
      { role: 'assistant' as const, content: '旧正文没有摘要' },
      { role: 'user' as const, content: '近期用户' },
      { role: 'assistant' as const, content: '近期正文\n<memory>近期摘要</memory>' },
    ];
    expect(filterConversationSummaryContextFromPrompt(chat, 1, 'memory')).toBe(1);
    expect(chat).toEqual([
      { role: 'user', content: '旧用户' },
      { role: 'assistant', content: '旧正文没有摘要' },
      { role: 'user', content: '近期用户' },
      { role: 'assistant', content: '近期正文' },
    ]);
  });

  it('keeps an assistant which contains only summary instead of blanking its content', () => {
    const chat = [
      { role: 'user' as const, content: '输入' },
      { role: 'assistant' as const, content: '<summary>仅有摘要</summary>' },
    ];
    expect(filterConversationSummaryContextFromPrompt(chat, 5, 'summary')).toBe(0);
    expect(chat[1].content).toBe('<summary>仅有摘要</summary>');
  });

  it('does not rewrite character regexes when card rules are already identical', async () => {
    const existing = buildConversationSummaryRegexes(5);
    const unrelated: TavernRegex = {
      id: 'game-page',
      script_name: '游戏页面',
      enabled: true,
      find_regex: '/x/',
      replace_string: 'y',
      trim_strings: [],
      source: { user_input:false, ai_output:true, slash_command:false, world_info:false, reasoning:false },
      destination: { display:true, prompt:false },
      run_on_edit: true,
      min_depth: null,
      max_depth: null,
    };
    const update = vi.fn();

    vi.stubGlobal(
      'getTavernRegexes',
      vi.fn(() => [unrelated, ...existing.map(regex => ({ ...regex, scope: 'character' as const }))]),
    );
    vi.stubGlobal('updateTavernRegexesWith', update);

    await expect(syncConversationSummaryRegexes(true, 5)).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['preset', 'off'] as const)(
    'does not rewrite character regexes during %s initialization when no card rules exist',
    async mode => {
      const update = vi.fn();
      vi.stubGlobal('getCharWorldbookNames', vi.fn(() => ({ primary: null, additional: [] })));
      vi.stubGlobal('getTavernRegexes', vi.fn(() => []));
      vi.stubGlobal('updateTavernRegexesWith', update);

      await applyConversationSummaryModeState(mode, 5);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('rewrites character regexes exactly once when card rules actually differ', async () => {
    const current = buildConversationSummaryRegexes(5);
    current[1] = { ...current[1], max_depth: 7 };

    vi.stubGlobal('getTavernRegexes', vi.fn(() => current));
    const update = vi.fn(async (updater: (regexes: TavernRegex[]) => TavernRegex[]) => updater(current));
    vi.stubGlobal('updateTavernRegexesWith', update);

    await expect(syncConversationSummaryRegexes(true, 5)).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite regexes during card initialization when worldbook and regex state are correct', async () => {
    const updateRegex = vi.fn();
    const updateWorldbook = vi.fn();
    const desired = buildConversationSummaryRegexes(5);

    vi.stubGlobal('getCharWorldbookNames', vi.fn(() => ({ primary: '金庸群侠传', additional: [] })));
    vi.stubGlobal(
      'getWorldbook',
      vi.fn(async () => [
        {
          uid: 1,
          name: '对话摘要指令',
          enabled: true,
          content: CONVERSATION_SUMMARY_ENTRY_CONTENT,
        },
        {
          uid: 2,
          name: '记忆区',
          enabled: true,
          content: CONVERSATION_MEMORY_ENTRY_CONTENT,
          position: { type: 'at_depth', role: 'system', depth: 999, order: 0 },
        },
      ]),
    );
    vi.stubGlobal('updateWorldbookWith', updateWorldbook);
    vi.stubGlobal('getTavernRegexes', vi.fn(() => desired));
    vi.stubGlobal('updateTavernRegexesWith', updateRegex);

    const status = await applyConversationSummaryModeState('card', 5);
    expect(status).toContain('本次初始化未改写角色正则');
    expect(updateWorldbook).not.toHaveBeenCalled();
    expect(updateRegex).not.toHaveBeenCalled();
  });

  it('filters ERA metadata from user and assistant prompt messages while leaving system text untouched', () => {
    const chat = [
      { role: 'system' as const, content: '说明示例：<era_data>文档内容</era_data>' },
      {
        role: 'user' as const,
        content: '<era_data>{\n  "era-message-key": "user-1"\n}</era_data>\n合理融入剧情',
      },
      {
        role: 'assistant' as const,
        content:
          '正文\n<VariableEdit>{"stat_data":{"测试":1}}</VariableEdit>\n<era_data>{"era-message-key":"assistant-1"}</era_data>',
      },
    ];

    expect(filterEraBaseContextFromPrompt(chat)).toBe(2);
    expect(chat).toEqual([
      { role: 'system', content: '说明示例：<era_data>文档内容</era_data>' },
      { role: 'user', content: '合理融入剧情' },
      { role: 'assistant', content: '正文' },
    ]);
  });

  it('filters player-confirmed useless preset modules from the final chat-completion prompt', () => {
    const pattern = '/<think>[\\s\\S]*?<\\/think>/gi';
    const replacement = '<details>折叠</details>';
    const description = '思维链折叠';
    const signature = getRegexRuleContentSignature({
      pattern,
      replacement,
      description,
    });

    vi.stubGlobal('getLoadedPresetName', vi.fn(() => '测试预设'));
    vi.stubGlobal(
      'getPreset',
      vi.fn(() => ({
        extensions: {
          regex_scripts: [
            {
              id: 'thinking',
              script_name: description,
              enabled: true,
              find_regex: pattern,
              replace_string: replacement,
              trim_strings: [],
              source: { user_input: false, ai_output: true, slash_command: false, world_info: false, reasoning: false },
              destination: { display: true, prompt: false },
              run_on_edit: true,
              min_depth: null,
              max_depth: null,
            },
          ],
        },
      })),
    );
    window.localStorage.setItem(
      'wuxia_display_settings',
      JSON.stringify({
        presetStorageExcludedRegexSignaturesByPreset: {
          测试预设: [signature],
        },
      }),
    );

    const chat = [
      { role: 'system' as const, content: '设定' },
      { role: 'assistant' as const, content: '<think>不应再发送的旧思维链</think>正文保留' },
    ];

    expect(filterSelectedPresetModulesFromPrompt(chat)).toBe(1);
    expect(chat[1].content).toBe('正文保留');
    window.localStorage.clear();
  });

  it('uses the configured preset XML tag to keep recent body text and compress older rounds', () => {
    const chat = [
      { role: 'system' as const, content: '设定' },
      { role: 'user' as const, content: '旧用户1' },
      { role: 'assistant' as const, content: '旧正文1\n<memory>旧摘要1</memory>' },
      { role: 'user' as const, content: '旧用户2' },
      { role: 'system' as const, content: '深度世界书' },
      { role: 'assistant' as const, content: '旧正文2\n<memory>旧摘要2</memory>' },
      { role: 'user' as const, content: '当前用户' },
      { role: 'assistant' as const, content: '当前正文\n<memory>当前摘要</memory>' },
    ];

    expect(filterConversationSummaryContextFromPrompt(chat, 1, '<memory>')).toBe(5);
    expect(chat).toEqual([
      { role: 'system', content: '设定' },
      { role: 'assistant', content: '<memory>旧摘要1</memory>' },
      { role: 'system', content: '深度世界书' },
      { role: 'assistant', content: '<memory>旧摘要2</memory>' },
      { role: 'user', content: '当前用户' },
      { role: 'assistant', content: '当前正文' },
    ]);
  });

  it('does not delete an old preset round when that assistant reply has no configured summary tag', () => {
    const chat = [
      { role: 'user' as const, content: '旧用户' },
      { role: 'assistant' as const, content: '预设本轮漏掉了摘要标签' },
      { role: 'user' as const, content: '当前用户' },
      { role: 'assistant' as const, content: '当前正文<memory>当前摘要</memory>' },
    ];

    filterConversationSummaryContextFromPrompt(chat, 1, 'memory');
    expect(chat[0]).toEqual({ role: 'user', content: '旧用户' });
    expect(chat[1]).toEqual({ role: 'assistant', content: '预设本轮漏掉了摘要标签' });
    expect(chat.at(-1)).toEqual({ role: 'assistant', content: '当前正文' });
  });

  it('removes only the exact historical-backfill turns while preserving prefixed few-shot dialogue', () => {
    const history = [
      { message_id: 1, role: 'user' as const },
      { message_id: 2, role: 'assistant' as const },
      { message_id: 3, role: 'user' as const },
      { message_id: 4, role: 'assistant' as const },
      { message_id: 5, role: 'user' as const },
      { message_id: 6, role: 'assistant' as const },
    ];
    const chat = [
      { role: 'user' as const, content: 'few-shot user' },
      { role: 'assistant' as const, content: 'few-shot assistant' },
      { role: 'system' as const, content: '设定' },
      { role: 'user' as const, content: '' },
      { role: 'assistant' as const, content: '' },
      { role: 'system' as const, content: '深度世界书' },
      { role: 'user' as const, content: '' },
      { role: 'assistant' as const, content: '' },
      { role: 'user' as const, content: '当前用户' },
      { role: 'assistant' as const, content: '当前正文' },
    ];

    expect(filterHistoricalBackfillTurnsFromPrompt(chat, history, [2, 4])).toBe(4);
    expect(chat).toEqual([
      { role: 'user', content: 'few-shot user' },
      { role: 'assistant', content: 'few-shot assistant' },
      { role: 'system', content: '设定' },
      { role: 'system', content: '深度世界书' },
      { role: 'user', content: '当前用户' },
      { role: 'assistant', content: '当前正文' },
    ]);
  });

  it('removes already archived summary messages and their paired user messages from the final prompt', () => {
    const chat = [
      { role: 'system' as const, content: '设定' },
      { role: 'user' as const, content: '旧用户1' },
      { role: 'system' as const, content: '夹在对话之间的深度世界书' },
      { role: 'assistant' as const, content: '<summary>旧摘要1</summary>' },
      { role: 'user' as const, content: '旧用户2' },
      { role: 'assistant' as const, content: '<summary>旧摘要2</summary>' },
      { role: 'user' as const, content: '当前用户' },
    ];
    expect(filterArchivedSummariesFromPrompt(chat, 2)).toBe(4);
    expect(chat).toEqual([
      { role: 'system', content: '设定' },
      { role: 'system', content: '夹在对话之间的深度世界书' },
      { role: 'user', content: '当前用户' },
    ]);
  });

  it('removes archived preset summaries using the configured XML tag', () => {
    const chat = [
      { role: 'user' as const, content: '旧用户' },
      { role: 'assistant' as const, content: '<memory>旧摘要</memory>' },
      { role: 'user' as const, content: '当前用户' },
    ];
    expect(filterArchivedSummariesFromPrompt(chat, 1, 'memory')).toBe(2);
    expect(chat).toEqual([{ role: 'user', content: '当前用户' }]);
  });

  it('keeps the memory worldbook payload free of chapter labels and floor metadata', () => {
    expect(CONVERSATION_MEMORY_ENTRY_CONTENT).toContain('章节.摘要.trim()');
    expect(CONVERSATION_MEMORY_ENTRY_CONTENT).not.toContain('章节键');
    expect(CONVERSATION_MEMORY_ENTRY_CONTENT).not.toContain('楼层 <%-');
  });
});
