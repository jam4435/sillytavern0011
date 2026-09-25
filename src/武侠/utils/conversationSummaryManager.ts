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
</对话摘要协议>`;

export const CONVERSATION_MEMORY_ENTRY_NAME = '记忆区';
export const CONVERSATION_MEMORY_ENTRY_CONTENT = `<%
const 章节摘要 = getvar('stat_data.叙事记忆.章节摘要', { scope: 'local' });
if (章节摘要 && typeof 章节摘要 === 'object' && Object.keys(章节摘要).length > 0) {
  const 排序章节 = Object.values(章节摘要)
    .filter(章节 => 章节 && typeof 章节 === 'object' && typeof 章节.摘要 === 'string' && 章节.摘要.trim())
    .sort((左, 右) => Number(左?.起始楼层 || 0) - Number(右?.起始楼层 || 0));
-%>
<长期叙事记忆>
以下内容是更早剧情压缩后的长期记忆，按真实先后顺序排列。它们用于替代已经退出上下文的旧原文，不要把其中事件当作本轮新发生。
<% for (const 章节 of 排序章节) { -%>
<%- 章节.摘要.trim() %>
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

async function findMemoryEntry(): Promise<{ worldbookName: string; entry: WorldbookEntry } | null> {
  for (const worldbookName of getCurrentCharacterWorldbookNames()) {
    try {
      const worldbook = await getWorldbook(worldbookName);
      const entry = worldbook.find(item => item.name === CONVERSATION_MEMORY_ENTRY_NAME);
      if (entry) return { worldbookName, entry };
    } catch (error) {
      dataLogger.warn(`读取世界书「${worldbookName}」失败:`, error);
    }
  }
  return null;
}

async function ensureMemoryEntryEnabled(): Promise<boolean> {
  let location = await findMemoryEntry();
  if (!location) {
    const worldbookName = getCurrentCharacterWorldbookNames()[0];
    if (!worldbookName) throw new Error('当前角色没有可写入的世界书，无法创建记忆区。');
    const created = await createWorldbookEntries(worldbookName,[{
      name: CONVERSATION_MEMORY_ENTRY_NAME,
      enabled: true,
      strategy:{ type:'constant', keys:[], keys_secondary:{logic:'and_any',keys:[]}, scan_depth:'same_as_global' },
      position:{ type:'at_depth', role:'system', depth:999, order:0 },
      content: CONVERSATION_MEMORY_ENTRY_CONTENT,
      probability:100,
      recursion:{ prevent_incoming:false, prevent_outgoing:false, delay_until:null },
      effect:{ sticky:null, cooldown:null, delay:null },
    }],{render:'debounced'});
    const entry=created.new_entries.find(item=>item.name===CONVERSATION_MEMORY_ENTRY_NAME);
    if(!entry) throw new Error('创建记忆区世界书条目后无法读回该条目。');
    location={worldbookName,entry};
  }

  const position = location.entry.position;
  const needsPositionSync =
    position?.type !== 'at_depth'
    || position?.role !== 'system'
    || Number(position?.depth) !== 999
    || Number(position?.order) !== 0;
  const needsSync =
    !location.entry.enabled
    || location.entry.content !== CONVERSATION_MEMORY_ENTRY_CONTENT
    || needsPositionSync;
  if (!needsSync) return false;

  await updateWorldbookWith(location.worldbookName,worldbook=>worldbook.map(entry=>
    entry.uid===location.entry.uid&&entry.name===CONVERSATION_MEMORY_ENTRY_NAME
      ? {
          ...entry,
          enabled:true,
          content:CONVERSATION_MEMORY_ENTRY_CONTENT,
          position:{ type:'at_depth', role:'system', depth:999, order:0 },
        }
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

function extractSummaryTagContent(text: string, tagValue: string): string {
  const tagName = normalizeConversationSummaryTag(tagValue);
  const escapedTag = escapeSummaryTagForRegex(tagName);
  const match = text.match(new RegExp('<' + escapedTag + '\\b[^>]*>([\\s\\S]*?)<\\/' + escapedTag + '>', 'i'));
  return match?.[1]?.trim() || '';
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

type PromptHistoryMessage = {
  message_id: number;
  role: 'system' | 'assistant' | 'user';
  is_hidden?: boolean;
  message?: string;
  swipes?: string[];
  swipe_id?: number;
};

export type ConversationSummaryPromptState =
  | 'full'
  | 'summary_only'
  | 'chapter_memory'
  | 'empty'
  | 'not_in_prompt';

export interface ConversationSummaryPromptTraceItem {
  messageId: number;
  hasSummary: boolean;
  summary: string;
  contextState: ConversationSummaryPromptState;
  contextPreview: string;
}

export interface ConversationSummaryPromptTraceSnapshot {
  capturedAt: number;
  mode: ConversationSummaryMode;
  summaryTag: string;
  recentReplies: number;
  items: ConversationSummaryPromptTraceItem[];
}

export const CONVERSATION_SUMMARY_TRACE_EVENT = 'wuxia:conversationSummaryTraceUpdated';

let latestConversationSummaryPromptTrace: ConversationSummaryPromptTraceSnapshot | null = null;

export function getLatestConversationSummaryPromptTrace(): ConversationSummaryPromptTraceSnapshot | null {
  if (!latestConversationSummaryPromptTrace) return null;
  return {
    ...latestConversationSummaryPromptTrace,
    items: latestConversationSummaryPromptTrace.items.map(item => ({ ...item })),
  };
}

type HistoricalBackfillChapter = {
  起始楼层?: unknown;
  结束楼层?: unknown;
  源摘要数?: unknown;
  来源?: unknown;
  源楼层?: unknown;
};

type ArchivedConversationCoverage = {
  archivedSummaryCount: number;
  historicalBackfillSummaryCount: number;
  historicalAssistantMessageIds: number[];
  history: PromptHistoryMessage[];
};

function readArchivedConversationCoverage(): ArchivedConversationCoverage {
  try {
    const variables = getVariables({ type: 'chat' }) as Record<string, unknown>;
    const statData = variables?.stat_data as Record<string, unknown> | undefined;
    const memory = statData?.叙事记忆 as Record<string, unknown> | undefined;
    const chapters =
      memory?.章节摘要 && typeof memory.章节摘要 === 'object' && !Array.isArray(memory.章节摘要)
        ? (memory.章节摘要 as Record<string, HistoricalBackfillChapter>)
        : {};
    const history = (getChatMessages('0-{{lastMessageId}}', {
      role: 'all',
      hide_state: 'unhidden',
      include_swipes: true,
    }) as PromptHistoryMessage[])
      .filter(message => Number.isInteger(message.message_id))
      .sort((left, right) => left.message_id - right.message_id);
    const assistantMessageIds = history
      .filter(message => message.role === 'assistant')
      .map(message => message.message_id);

    const historicalIds = new Set<number>();
    let historicalBackfillSummaryCount = 0;

    for (const chapter of Object.values(chapters)) {
      if (chapter?.来源 !== '历史回溯') continue;

      const sourceSummaryCount = Number(chapter.源摘要数);
      if (Number.isFinite(sourceSummaryCount) && sourceSummaryCount > 0) {
        historicalBackfillSummaryCount += Math.floor(sourceSummaryCount);
      }

      const exactFloors = Array.isArray(chapter.源楼层)
        ? chapter.源楼层.filter((value): value is number => Number.isInteger(value))
        : [];
      if (exactFloors.length > 0) {
        exactFloors.forEach(messageId => historicalIds.add(messageId));
        continue;
      }

      // 兼容今天早先已经生成、还没有“源楼层”字段的历史回溯章节。
      const start = Number(chapter.起始楼层);
      const end = Number(chapter.结束楼层);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const lower = Math.min(start, end);
      const upper = Math.max(start, end);
      assistantMessageIds
        .filter(messageId => messageId >= lower && messageId <= upper)
        .forEach(messageId => historicalIds.add(messageId));
    }

    const storedCount = Number(memory?.已归档摘要数);
    const archivedSummaryCount = Number.isFinite(storedCount) && storedCount > 0 ? Math.floor(storedCount) : 0;

    return {
      archivedSummaryCount,
      historicalBackfillSummaryCount,
      historicalAssistantMessageIds: [...historicalIds].sort((left, right) => left - right),
      history,
    };
  } catch {
    return {
      archivedSummaryCount: 0,
      historicalBackfillSummaryCount: 0,
      historicalAssistantMessageIds: [],
      history: [],
    };
  }
}


function getActiveHistoryMessageText(message: PromptHistoryMessage): string {
  const swipes = Array.isArray(message.swipes) ? message.swipes : [];
  if (swipes.length > 0) {
    const swipeIndex = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
    const safeSwipeIndex = Math.max(0, Math.min(swipeIndex, swipes.length - 1));
    return swipes[safeSwipeIndex] || message.message || '';
  }
  return message.message || '';
}

function alignPromptMessagesToHistory(
  chat: SillyTavern.SendingMessage[],
  history: PromptHistoryMessage[],
): Map<number, SillyTavern.SendingMessage> {
  const dialogueHistory = history
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .sort((left, right) => left.message_id - right.message_id);
  const promptDialogue = chat.filter(message => message.role === 'user' || message.role === 'assistant');
  const result = new Map<number, SillyTavern.SendingMessage>();

  let promptCursor = promptDialogue.length - 1;
  for (let historyCursor = dialogueHistory.length - 1; historyCursor >= 0 && promptCursor >= 0; historyCursor -= 1) {
    const historyMessage = dialogueHistory[historyCursor];
    while (promptCursor >= 0 && promptDialogue[promptCursor].role !== historyMessage.role) {
      promptCursor -= 1;
    }
    if (promptCursor < 0) break;
    result.set(historyMessage.message_id, promptDialogue[promptCursor]);
    promptCursor -= 1;
  }
  return result;
}

function collectChapterCoveredAssistantIds(
  coverage: ArchivedConversationCoverage,
  summaryTag: string,
): Set<number> {
  const covered = new Set(coverage.historicalAssistantMessageIds);
  let remaining = Math.max(0, coverage.archivedSummaryCount - coverage.historicalBackfillSummaryCount);
  if (remaining <= 0) return covered;

  for (const message of coverage.history) {
    if (remaining <= 0) break;
    if (message.role !== 'assistant' || covered.has(message.message_id)) continue;
    const rawText = getActiveHistoryMessageText(message);
    if (!extractSummaryTagContent(rawText, summaryTag) && !extractSummaryTagContent(rawText, 'summary')) continue;
    covered.add(message.message_id);
    remaining -= 1;
  }
  return covered;
}

function captureConversationSummaryPromptTrace(
  chat: SillyTavern.SendingMessage[],
  settings: ReturnType<typeof loadSettings>,
  coverage: ArchivedConversationCoverage,
  initialPromptRefs: Map<number, SillyTavern.SendingMessage>,
): void {
  const mode = settings.summarySettings.conversationSummaryMode || activeConversationSummaryMode;
  const summaryTag =
    mode === 'preset'
      ? normalizeConversationSummaryTag(settings.summarySettings.conversationSummaryPresetTag)
      : CONVERSATION_SUMMARY_TAG;
  const chapterCoveredIds = collectChapterCoveredAssistantIds(coverage, summaryTag);
  const finalPromptMessages = new Set(chat);

  const items = coverage.history
    .filter(message => message.role === 'assistant')
    .map(message => {
      const rawText = getActiveHistoryMessageText(message);
      const summary = extractSummaryTagContent(rawText, summaryTag);
      const promptMessage = initialPromptRefs.get(message.message_id);
      let contextState: ConversationSummaryPromptState = 'not_in_prompt';
      let contextPreview = '';

      if (chapterCoveredIds.has(message.message_id)) {
        contextState = 'chapter_memory';
      } else if (promptMessage && finalPromptMessages.has(promptMessage)) {
        const finalText = getSendingMessageText(promptMessage).trim();
        contextPreview = finalText.slice(0, 260);
        if (!finalText) {
          contextState = 'empty';
        } else {
          const summaryBlock = extractSummaryTagBlock(finalText, summaryTag);
          const withoutSummary = removeSummaryTagBlocks(finalText, summaryTag);
          contextState = summaryBlock && !withoutSummary ? 'summary_only' : 'full';
        }
      }

      return {
        messageId: message.message_id,
        hasSummary: Boolean(summary),
        summary,
        contextState,
        contextPreview,
      };
    });

  latestConversationSummaryPromptTrace = {
    capturedAt: Date.now(),
    mode,
    summaryTag,
    recentReplies: clampRecentReplies(settings.summarySettings.conversationSummaryRecentReplies),
    items,
  };

  try {
    window.dispatchEvent(new CustomEvent(CONVERSATION_SUMMARY_TRACE_EVENT));
  } catch {
    // 非浏览器环境下忽略通知；快照本身仍可读取。
  }
}

/**
 * 根据真实聊天楼层顺序，把“历史回溯”章节精确覆盖的 user → assistant 对从最终 prompt 删除。
 *
 * SendingMessage 本身没有 message_id，因此从 prompt 尾部反向对齐真实聊天的 user/assistant 顺序；
 * 前置 few-shot / system 注入不会挤偏映射。实际删除仍只针对章节记录过的 assistant 楼层及其配对 user。
 */
export function filterHistoricalBackfillTurnsFromPrompt(
  chat: SillyTavern.SendingMessage[],
  history: PromptHistoryMessage[],
  coveredAssistantMessageIds: number[],
): number {
  if (coveredAssistantMessageIds.length === 0 || history.length === 0 || chat.length === 0) return 0;

  const dialogueHistory = history
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .sort((left, right) => left.message_id - right.message_id);
  const promptDialogueIndices = chat
    .map((message, index) => (message.role === 'user' || message.role === 'assistant' ? index : -1))
    .filter(index => index >= 0);

  const promptIndexByMessageId = new Map<number, number>();
  let promptCursor = promptDialogueIndices.length - 1;
  for (let historyCursor = dialogueHistory.length - 1; historyCursor >= 0 && promptCursor >= 0; historyCursor -= 1) {
    const historyMessage = dialogueHistory[historyCursor];
    while (
      promptCursor >= 0 &&
      chat[promptDialogueIndices[promptCursor]].role !== historyMessage.role
    ) {
      promptCursor -= 1;
    }
    if (promptCursor < 0) break;
    promptIndexByMessageId.set(historyMessage.message_id, promptDialogueIndices[promptCursor]);
    promptCursor -= 1;
  }

  const covered = new Set(coveredAssistantMessageIds);
  const removeIndices = new Set<number>();
  for (let index = 0; index < dialogueHistory.length; index += 1) {
    const assistant = dialogueHistory[index];
    if (assistant.role !== 'assistant' || !covered.has(assistant.message_id)) continue;

    const assistantPromptIndex = promptIndexByMessageId.get(assistant.message_id);
    if (assistantPromptIndex !== undefined) {
      removeIndices.add(assistantPromptIndex);
    }

    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previous = dialogueHistory[previousIndex];
      if (previous.role === 'assistant') break;
      if (previous.role === 'user') {
        const userPromptIndex = promptIndexByMessageId.get(previous.message_id);
        if (userPromptIndex !== undefined) {
          removeIndices.add(userPromptIndex);
        }
        break;
      }
    }
  }

  if (removeIndices.size === 0) return 0;
  const kept = chat.filter((_, index) => !removeIndices.has(index));
  const removed = chat.length - kept.length;
  chat.splice(0, chat.length, ...kept);
  return removed;
}

export function filterArchivedSummariesFromPrompt(
  chat: SillyTavern.SendingMessage[],
  archivedSummaryCount: number,
  summaryTag = CONVERSATION_SUMMARY_TAG,
): number {
  let remaining = Math.max(0, Math.floor(archivedSummaryCount));
  if (remaining === 0) return 0;

  const removeIndices = new Set<number>();
  for (let index = 0; index < chat.length && remaining > 0; index += 1) {
    const message = chat[index];
    if (message.role !== 'assistant' || !extractSummaryTagBlock(getSendingMessageText(message), summaryTag)) {
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
    const settings = loadSettings();
    const mode = settings.summarySettings.conversationSummaryMode || activeConversationSummaryMode;
    const summaryTag =
      mode === 'preset'
        ? normalizeConversationSummaryTag(settings.summarySettings.conversationSummaryPresetTag)
        : CONVERSATION_SUMMARY_TAG;
    const coverage = readArchivedConversationCoverage();
    const initialPromptRefs = alignPromptMessagesToHistory(eventData.chat, coverage.history);

    const filteredModules = filterSelectedPresetModulesFromPrompt(eventData.chat);
    if (filteredModules > 0) {
      dataLogger.log(`[conversationFilter] 已从本次最终提示词过滤 ${filteredModules} 条 assistant 消息中的无用模块。`);
    }

    // 长期章节记忆与逐轮摘要来源解耦：只要旧楼层已经被章节记忆覆盖，就始终从最终 prompt 移除。
    const backfillRemoved = filterHistoricalBackfillTurnsFromPrompt(
      eventData.chat,
      coverage.history,
      coverage.historicalAssistantMessageIds,
    );
    if (backfillRemoved > 0) {
      dataLogger.log(
        `[conversationSummary] 已按历史回溯章节覆盖楼层从最终提示词裁掉 ${backfillRemoved} 条旧消息。`,
      );
    }

    // 已归档成章节的逐轮摘要也属于长期记忆覆盖范围，不随 card/preset/off 切换而重新回到 prompt。
    const archivedSummaryCount = Math.max(
      0,
      coverage.archivedSummaryCount - coverage.historicalBackfillSummaryCount,
    );
    if (archivedSummaryCount > 0) {
      const removed = filterArchivedSummariesFromPrompt(eventData.chat, archivedSummaryCount, summaryTag);
      if (removed > 0) {
        dataLogger.log(`[conversationSummary] 已从本次最终提示词裁掉 ${removed} 条已归档逐轮摘要消息。`);
      }
    }

    if (mode === 'preset') {
      const changed = filterPresetSummaryContextFromPrompt(
        eventData.chat,
        settings.summarySettings.conversationSummaryRecentReplies,
        settings.summarySettings.conversationSummaryPresetTag,
      );
      if (changed > 0) {
        dataLogger.log(`[conversationSummary] 预设摘要兼容过滤调整了 ${changed} 条最终提示词消息。`);
      }
    }

    captureConversationSummaryPromptTrace(eventData.chat, settings, coverage, initialPromptRefs);
  });
  return () => subscription.stop();
}

export async function applyConversationSummaryModeState(
  mode:ConversationSummaryMode,
  recentReplies=DEFAULT_CONVERSATION_SUMMARY_RECENT_REPLIES,
):Promise<string>{
  const memoryChanged=await ensureMemoryEntryEnabled();
  const cardMode=mode==='card';
  const entryChanged=await setSummaryEntryEnabled(cardMode);
  const regexChanged=await syncConversationSummaryRegexes(cardMode,recentReplies);
  activeConversationSummaryMode=mode;
  const memoryStatus=memoryChanged?'记忆区已同步；':'';
  if(mode==='card'){
    if (entryChanged || regexChanged || memoryChanged) {
      return `${memoryStatus}已同步「${CONVERSATION_SUMMARY_ENTRY_NAME}」与卡内摘要过滤；最近 ${clampRecentReplies(recentReplies)} 条回复保留全文，更早回复仅保留逐轮摘要。`;
    }
    return `「${CONVERSATION_SUMMARY_ENTRY_NAME}」、记忆区与卡内摘要过滤已是目标状态，本次初始化未改写角色正则。`;
  }
  if(mode==='preset') {
    return `${memoryStatus}已禁用卡内摘要指令；由当前预设生成摘要，章节记忆仍由记忆区独立注入并接管已归档旧对话。`;
  }
  return `${memoryStatus}已禁用卡内摘要指令与逐轮摘要过滤；已生成的长期章节记忆仍由记忆区独立注入。`;
}
