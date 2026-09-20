import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_SUMMARY_ENTRY_CONTENT,
  applyConversationSummaryModeState,
  buildConversationSummaryRegexes,
  filterArchivedSummariesFromPrompt,
  syncConversationSummaryRegexes,
} from './conversationSummaryManager';

describe('conversationSummaryManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps five recent assistant replies full and reduces older context to summaries', () => {
    const rules=buildConversationSummaryRegexes(5);
    expect(rules.find(r=>r.id==='wuxia-card-summary-recent-hide')?.max_depth).toBe(9);
    expect(rules.find(r=>r.id==='wuxia-card-summary-old-assistant-keep')?.min_depth).toBe(10);
    expect(rules.find(r=>r.id==='wuxia-card-summary-old-user-empty')?.min_depth).toBe(10);
  });

  it('clamps the recent reply count', () => {
    expect(buildConversationSummaryRegexes(0).find(r=>r.id==='wuxia-card-summary-recent-hide')?.max_depth).toBe(1);
    expect(buildConversationSummaryRegexes(999).find(r=>r.id==='wuxia-card-summary-recent-hide')?.max_depth).toBe(39);
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
});
