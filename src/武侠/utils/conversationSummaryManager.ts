import { dataLogger } from './logger';
import {
  getLoadedPresetNameSafe,
  getPresetStorageCleanupCandidates,
  getRegexRuleContentSignature,
  loadSettings,
  normalizeConversationSummaryTag,
  stripSelectedPresetRegexMatches,
  type ConversationSummaryMode,
} from './settingsManager';

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
<% const 排序章节 = Object.entries(章节摘要).sort((左, 右) => Number(左?.[1]?.起始楼层 || 0) - Number(右?.[1]?.起始楼层 || 0));
for (const [章节键, 章节] of 排序章节) {
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

type ComparableTavernRegex = Omit<TavernRegex, 'scope'>;

function toComparableRegex(regex: TavernRegex): ComparableTavernRegex {
  return {
    id: regex.id,
    script_name: regex.script_name,
    enabled: regex.enabled,
    find_regex: regex.find_regex,
    replace_string: regex.replace_string,
    trim_strings: [...regex.trim_strings],
    source: { ...regex.source },
    destination: { ...regex.destination },
    run_on_edit: regex.run_on_edit,
    min_depth: regex.min_depth,
    max_depth: regex.max_depth,
  };
}

export function areConversationSummaryRegexesEquivalent(
  currentOwnRegexes: TavernRegex[],
  desiredRegexes: TavernRegex[],
): boolean {
  if (currentOwnRegexes.length !== desiredRegexes.length) return false;

  return currentOwnRegexes.every((regex, index) => {
    const desired = desiredRegexes[index];
    if (!desired) return false;
    return JSON.stringify(toComparableRegex(regex)) === JSON.stringify(toComparableRegex(desired));
  });
}

/**
 * 同步卡内摘要正则。
 *
 * updateTavernRegexesWith() 会让 SillyTavern 重新载入聊天消息，因此这里必须先只读比较。
 * 当前自有规则已经等于目标状态时，绝不能为了“初始化校验”再写一次角色正则；
 * 否则固定宿主 iframe 会形成 mount → 正则重载 → unmount → mount 的自激循环。
 */
export async function syncConversationSummaryRegexes(
  enabled: boolean,
  recentReplies: number,
): Promise<boolean> {
  const option: TavernRegexOption = { type: 'character', name: 'current' };
  const desired = enabled ? buildConversationSummaryRegexes(recentReplies) : [];
  const current = getTavernRegexes(option);
  const currentOwn = current.filter(regex => OWN_REGEX_IDS.has(regex.id));

  if (areConversationSummaryRegexesEquivalent(currentOwn, desired)) {
    dataLogger.log('[conversationSummary] 摘要正则已是目标状态，跳过角色正则写入。');
    return false;
  }

  await updateTavernRegexesWith(
    regexes => [...regexes.filter(regex => !OWN_REGEX_IDS.has(regex.id)), ...desired],
    option,
  );
  return true;
}

function getSendingMessageText(message: SillyTavern.SendingMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n');
}

function setSendingMessageText(message: SillyTavern.SendingMessage, text: string): void {
  if (typeof message.content === 'string') {
    message.content = text;
    return;
  }
  if (!Array.isArray(message.content)) return;

  let replaced = false;
  message.content = message.content.map(part => {
    if (part.type !== 'text') return part;
    if (replaced) return { ...part, text: '' };
    replaced = true;
    return { ...part, text };
  });
}

function escapeSummaryTagForRegex(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function createSummaryTagRegex(tagValue: string, global = true): RegExp {
  const tagName = normalizeConversationSummaryTag(tagValue);
  const escapedTag = escapeSummaryTagForRegex(tagName);
  return new RegExp('<' + escapedTag + '\\b[^>]*>[\\s\\S]*?<\\/' + escapedTag + '>', global ? 'gi' : 'i');
}

function removeSummaryTagBlocks(text: string, tagValue: string): string {
  return text.replace(createSummaryTagRegex(tagValue, true), '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractSummaryTagBlock(text: string, tagValue: string): string | null {
  const match = text.match(createSummaryTagRegex(tagValue, false));
  return match?.[0]?.trim() || null;
}

/**
 * 兼容玩家预设摘要：不负责要求模型生成摘要，只识别玩家填写的 XML 标签并压缩最终 prompt。
 * 最近 N 条 assistant 回复保留正文（去掉重复摘要块）；更早的已摘要回复仅保留摘要，并移除配对 user。
 * 未找到摘要标签的旧回复保持原样，避免因为预设偶发漏摘要而丢失上下文。
 */
export function filterPresetSummaryContextFromPrompt(
  chat: SillyTavern.SendingMessage[],
  recentReplies: number,
  presetTag: string,
): number {
  const keepReplies = clampRecentReplies(recentReplies);
  const assistantIndices = chat
    .map((message, index) => (message.role === 'assistant' ? index : -1))
    .filter(index => index >= 0);
  const recentAssistantIndices = new Set(assistantIndices.slice(-keepReplies));
  const removeUserIndices = new Set<number>();
  let changed = 0;

  for (const index of assistantIndices) {
    const message = chat[index];
    const text = getSendingMessageText(message);
    if (!text) continue;

    if (recentAssistantIndices.has(index)) {
      const withoutSummary = removeSummaryTagBlocks(text, presetTag);
      if (withoutSummary && withoutSummary !== text) {
        setSendingMessageText(message, withoutSummary);
        changed += 1;
      }
      continue;
    }

    const summaryBlock = extractSummaryTagBlock(text, presetTag);
    if (!summaryBlock) continue;

    if (text.trim() !== summaryBlock) {
      setSendingMessageText(message, summaryBlock);
      changed += 1;
    }

    for (let previous = index - 1; previous >= 0; previous -= 1) {
      if (removeUserIndices.has(previous)) continue;
      if (chat[previous].role === 'user') {
        removeUserIndices.add(previous);
        break;
      }
      if (chat[previous].role === 'assistant') {
        break;
      }
    }
  }

  if (removeUserIndices.size > 0) {
    const kept = chat.filter((_, index) => !removeUserIndices.has(index));
    chat.splice(0, chat.length, ...kept);
    changed += removeUserIndices.size;
  }

  return changed;
}

/**
 * 把玩家在“无用模块过滤”里勾选的预设显示正则，同步应用到本次最终 AI 上下文。
 * 这是非持久化过滤：不会改历史楼层，只修改即将发送的 prompt。
 */
export function filterSelectedPresetModulesFromPrompt(chat: SillyTavern.SendingMessage[]): number {
  const presetName = getLoadedPresetNameSafe();
  if (!presetName) return 0;

  const settings = loadSettings();
  const selectedSignatures = settings.presetStorageExcludedRegexSignaturesByPreset[presetName] || [];
  if (selectedSignatures.length === 0) return 0;

  const rules = getPresetStorageCleanupCandidates().filter(rule =>
    selectedSignatures.includes(getRegexRuleContentSignature(rule)),
  );
  if (rules.length === 0) return 0;

  let changed = 0;
  for (const message of chat) {
    if (message.role !== 'assistant') continue;
    const text = getSendingMessageText(message);
    if (!text) continue;
    const protectedSummaryTag =
      settings.summarySettings.conversationSummaryMode === 'preset'
        ? settings.summarySettings.conversationSummaryPresetTag
        : 'summary';
    const filtered = stripSelectedPresetRegexMatches(
      text,
      rules,
      selectedSignatures,
      protectedSummaryTag,
    );
    if (filtered !== text) {
      setSendingMessageText(message, filtered);
      changed += 1;
    }
  }
  return changed;
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
    const filteredModules = filterSelectedPresetModulesFromPrompt(eventData.chat);
    if (filteredModules > 0) {
      dataLogger.log(`[conversationFilter] 已从本次最终提示词过滤 ${filteredModules} 条 assistant 消息中的无用模块。`);
    }

    const settings = loadSettings();
    const mode = settings.summarySettings.conversationSummaryMode || activeConversationSummaryMode;
    if (mode === 'preset') {
      const changed = filterPresetSummaryContextFromPrompt(
        eventData.chat,
        settings.summarySettings.conversationSummaryRecentReplies,
        settings.summarySettings.conversationSummaryPresetTag,
      );
      if (changed > 0) {
        dataLogger.log(`[conversationSummary] 预设摘要兼容过滤调整了 ${changed} 条最终提示词消息。`);
      }
      return;
    }

    if (mode !== 'card') return;
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
  const regexChanged=await syncConversationSummaryRegexes(cardMode,recentReplies);
  activeConversationSummaryMode=mode;
  if(mode==='card'){
    if (entryChanged || regexChanged) {
      return `已同步「${CONVERSATION_SUMMARY_ENTRY_NAME}」与卡内摘要过滤；最近 ${clampRecentReplies(recentReplies)} 条回复保留全文，更早回复仅保留逐轮摘要。`;
    }
    return `「${CONVERSATION_SUMMARY_ENTRY_NAME}」与卡内摘要过滤已是目标状态，本次初始化未改写角色正则。`;
  }
  if(mode==='preset') {
    return '已禁用卡内摘要指令；由当前预设生成摘要，最终上下文按下方配置的 XML 标签执行兼容压缩。';
  }
  return '已禁用卡内摘要指令与卡内过滤。';
}
