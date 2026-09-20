import { dataLogger } from './logger';
import type { ConversationSummaryMode } from './settingsManager';

export const CONVERSATION_SUMMARY_ENTRY_NAME = '对话摘要指令';
export const CONVERSATION_SUMMARY_TAG = 'summary';
export const DEFAULT_CONVERSATION_SUMMARY_RECENT_REPLIES = 5;

let activeConversationSummaryMode: ConversationSummaryMode = 'off';

const OWN_REGEX_IDS = new Set([
  'wuxia-card-summary-display-hide',
  'wuxia-card-summary-recent-hide',
  'wuxia-card-summary-old-assistant-keep',
  'wuxia-card-summary-old-assistant-empty',
  'wuxia-card-summary-old-user-empty',
]);

export const CONVERSATION_SUMMARY_ENTRY_CONTENT = `<对话摘要协议>
每次回复都要在正文结束后输出一个且仅一个 <summary>...</summary> 摘要块。

要求：
- 约 80～120 个中文字符，客观记录本轮真正发生且后续可能需要记住的事实。
- 必须覆盖本轮 User 的关键行动/意图与 assistant 实际给出的结果；若两者冲突，以实际发生的结果为准。
- 优先保留：游戏内时间推进、地点变化、关键人物参与、关系阶段变化、伤病/身份/物品/任务/事件的重要变化，以及尚未解决但明确成立的后续事项。
- 不复述对白修辞、战斗逐招过程、气氛描写或无长期意义的短时情绪。
- 不编造正文没有发生的事实；不输出思维过程。
- <summary> 必须是独立 XML 块，不能嵌进其他 XML 标签。
- inline 变量模式下顺序为：正文 → <summary> → VariableThink/VariableInsert/Edit/Delete；extra 变量模式下 <summary> 位于正文末尾。
</对话摘要协议>

<%
const 章节摘要 = getvar('stat_data.叙事记忆.章节摘要', { scope: 'local' });
if (章节摘要 && typeof 章节摘要 === 'object' && Object.keys(章节摘要).length > 0) {
-%>
<长期叙事记忆>
以下是已经从更早逐轮摘要中一次性归档出的长期剧情记忆；它们是旧正文的替代上下文，不要把同一历史再次当作新发生的事件。
<% for (const [章节键, 章节] of Object.entries(章节摘要)) {
  if (!章节 || typeof 章节 !== 'object' || typeof 章节.摘要 !== 'string' || !章节.摘要.trim()) continue;
-%>
[<%- 章节键 %>｜楼层 <%- 章节.起始楼层 %>-<%- 章节.结束楼层 %>] <%- 章节.摘要 %>
<% } -%>
</长期叙事记忆>
<% } -%>`;

function clampRecentReplies(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONVERSATION_SUMMARY_RECENT_REPLIES;
  return Math.max(1, Math.min(20, Math.floor(value)));
}

function createRegex(
  id: string,
  scriptName: string,
  findRegex: string,
  replaceString: string,
  source: Partial<TavernRegex['source']>,
  destination: Partial<TavernRegex['destination']>,
  minDepth: number | null,
  maxDepth: number | null,
): TavernRegex {
  return {
    id,
    script_name: scriptName,
    enabled: true,
    find_regex: findRegex,
    replace_string: replaceString,
    trim_strings: [],
    source: { user_input:false, ai_output:false, slash_command:false, world_info:false, reasoning:false, ...source },
    destination: { display:false, prompt:false, ...destination },
    run_on_edit: true,
    min_depth: minDepth,
    max_depth: maxDepth,
  };
}

export function buildConversationSummaryRegexes(recentReplies: number): TavernRegex[] {
  const keepReplies = clampRecentReplies(recentReplies);
  const recentMaxDepth = keepReplies * 2 - 1;
  const oldMinDepth = recentMaxDepth + 1;
  const summaryBlock = '/<summary>[\\s\\S]*?<\\/summary>/gi';

  return [
    createRegex('wuxia-card-summary-display-hide','武侠卡-隐藏对话摘要显示',summaryBlock,'',{ai_output:true},{display:true},null,null),
    createRegex('wuxia-card-summary-recent-hide','武侠卡-最近回复正文去摘要',summaryBlock,'',{ai_output:true},{prompt:true},null,recentMaxDepth),
    createRegex('wuxia-card-summary-old-assistant-keep','武侠卡-旧回复仅保留摘要','/^[\\s\\S]*?(<summary>[\\s\\S]*?<\\/summary>)[\\s\\S]*$/i','$1',{ai_output:true},{prompt:true},oldMinDepth,null),
    createRegex('wuxia-card-summary-old-assistant-empty','武侠卡-旧回复无摘要则清空','/^(?![\\s\\S]*<summary>)[\\s\\S]*$/i','',{ai_output:true},{prompt:true},oldMinDepth,null),
    createRegex('wuxia-card-summary-old-user-empty','武侠卡-旧用户输入由摘要承接','/^[\\s\\S]*$/i','',{user_input:true},{prompt:true},oldMinDepth,null),
  ];
}

function getCurrentCharacterWorldbookNames(): string[] {
  const charWorldbooks = getCharWorldbookNames('current');
  return Array.from(new Set(
    [charWorldbooks.primary, ...(Array.isArray(charWorldbooks.additional) ? charWorldbooks.additional : [])]
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0),
  ));
}

async function findSummaryEntry(): Promise<{ worldbookName: string; entry: WorldbookEntry } | null> {
  for (const worldbookName of getCurrentCharacterWorldbookNames()) {
    try {
      const worldbook = await getWorldbook(worldbookName);
      const entry = worldbook.find(item => item.name === CONVERSATION_SUMMARY_ENTRY_NAME);
      if (entry) return { worldbookName, entry };
    } catch (error) {
      dataLogger.warn(`读取世界书「${worldbookName}」失败:`, error);
    }
  }
  return null;
}

async function ensureSummaryEntryExists(): Promise<{ worldbookName: string; entry: WorldbookEntry }> {
  const existing = await findSummaryEntry();
  if (existing) return existing;
  const worldbookName = getCurrentCharacterWorldbookNames()[0];
  if (!worldbookName) throw new Error('当前角色没有可写入的世界书，无法创建对话摘要指令。');

  const created = await createWorldbookEntries(worldbookName,[{
    name: CONVERSATION_SUMMARY_ENTRY_NAME,
    enabled: false,
    strategy:{ type:'constant', keys:[], keys_secondary:{logic:'and_any',keys:[]}, scan_depth:'same_as_global' },
    position:{ type:'at_depth', role:'system', depth:0, order:5 },
    content: CONVERSATION_SUMMARY_ENTRY_CONTENT,
    probability:100,
    recursion:{ prevent_incoming:false, prevent_outgoing:false, delay_until:null },
    effect:{ sticky:null, cooldown:null, delay:null },
  }],{render:'debounced'});
  const entry=created.new_entries.find(item=>item.name===CONVERSATION_SUMMARY_ENTRY_NAME);
  if(!entry) throw new Error('创建对话摘要世界书条目后无法读回该条目。');
  return {worldbookName,entry};
}

async function setSummaryEntryEnabled(enabled:boolean):Promise<boolean>{
  const location=enabled?await ensureSummaryEntryExists():await findSummaryEntry();
  if(!location)return false;
  const needsContentSync=enabled && location.entry.content !== CONVERSATION_SUMMARY_ENTRY_CONTENT;
  if(location.entry.enabled===enabled && !needsContentSync)return false;

  await updateWorldbookWith(location.worldbookName,worldbook=>worldbook.map(entry=>
    entry.uid===location.entry.uid&&entry.name===CONVERSATION_SUMMARY_ENTRY_NAME
      ? {...entry,enabled,...(enabled?{content:CONVERSATION_SUMMARY_ENTRY_CONTENT}:{})}
      : entry
  ),{render:'debounced'});
  return true;
}

async function applyOwnRegexes(enabled:boolean,recentReplies:number):Promise<void>{
  const desired=enabled?buildConversationSummaryRegexes(recentReplies):[];
  await updateTavernRegexesWith(
    regexes=>[...regexes.filter(regex=>!OWN_REGEX_IDS.has(regex.id)),...desired],
    {type:'character',name:'current'},
  );
}

function getSendingMessageText(message: SillyTavern.SendingMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n');
}

function readArchivedSummaryCount(): number {
  try {
    const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    const statData = variables?.stat_data as Record<string, unknown> | undefined;
    const memory = statData?.叙事记忆 as Record<string, unknown> | undefined;
    const count = Number(memory?.已归档摘要数);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}

export function filterArchivedSummariesFromPrompt(
  chat: SillyTavern.SendingMessage[],
  archivedSummaryCount: number,
): number {
  let remaining = Math.max(0, Math.floor(archivedSummaryCount));
  if (remaining === 0) return 0;

  const removeIndices = new Set<number>();
  for (let index = 0; index < chat.length && remaining > 0; index += 1) {
    const message = chat[index];
    if (message.role !== 'assistant' || !/<summary>[\s\S]*?<\/summary>/i.test(getSendingMessageText(message))) {
      continue;
    }

    removeIndices.add(index);
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      if (removeIndices.has(previous)) continue;
      if (chat[previous].role === 'user') {
        removeIndices.add(previous);
        break;
      }
      if (chat[previous].role === 'assistant') {
        break;
      }
      // 世界书/深度条目可能以 system 消息夹在一组 user→assistant 之间；继续向前找配对 user。
      // tool/system 本身不属于需要删除的历史对话楼层。
    }
    remaining -= 1;
  }

  if (removeIndices.size === 0) return 0;
  const kept = chat.filter((_, index) => !removeIndices.has(index));
  const removed = chat.length - kept.length;
  chat.splice(0, chat.length, ...kept);
  return removed;
}

export function installConversationSummaryPromptFilter(): () => void {
  const subscription = eventOn(tavern_events.CHAT_COMPLETION_PROMPT_READY, eventData => {
    if (activeConversationSummaryMode !== 'card' || eventData.dryRun) return;
    const archivedSummaryCount = readArchivedSummaryCount();
    if (archivedSummaryCount <= 0) return;
    const removed = filterArchivedSummariesFromPrompt(eventData.chat, archivedSummaryCount);
    if (removed > 0) {
      dataLogger.log(`[conversationSummary] 已从本次最终提示词裁掉 ${removed} 条已归档旧消息。`);
    }
  });
  return () => subscription.stop();
}

export async function applyConversationSummaryModeState(
  mode:ConversationSummaryMode,
  recentReplies=DEFAULT_CONVERSATION_SUMMARY_RECENT_REPLIES,
):Promise<string>{
  const cardMode=mode==='card';
  const entryChanged=await setSummaryEntryEnabled(cardMode);
  await applyOwnRegexes(cardMode,recentReplies);
  activeConversationSummaryMode=mode;
  if(mode==='card'){
    return entryChanged
      ? `已启用并同步「${CONVERSATION_SUMMARY_ENTRY_NAME}」，最近 ${clampRecentReplies(recentReplies)} 条回复保留全文，更早回复仅保留逐轮摘要；已归档摘要会在最终提示词阶段裁掉。`
      : `「${CONVERSATION_SUMMARY_ENTRY_NAME}」已启用；卡内摘要过滤已同步。`;
  }
  if(mode==='preset') return '已禁用卡内摘要指令与卡内过滤，改由当前预设自己的 XML 摘要与过滤逻辑负责。';
  return '已禁用卡内摘要指令与卡内过滤。';
}
