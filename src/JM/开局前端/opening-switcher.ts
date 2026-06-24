import { byId } from './dom';
import type { GenerationSettings } from './types';

type QuickOpeningFeedbackType = 'info' | 'success' | 'warning' | 'error';

interface QuickOpeningFeedback {
  type: QuickOpeningFeedbackType;
  text: string;
}

interface QuickOpeningItem {
  index: number;
  text: string;
  isCurrent: boolean;
}

interface QuickOpeningSwitchResult {
  processedStateCount: number;
  currentNames: string[];
}

type OpeningMessagePatch = {
  message_id: number;
  message?: string;
  swipes?: string[];
  swipe_id?: number;
};

type QuickOpeningLoadResult =
  | {
      ok: true;
      openings: QuickOpeningItem[];
      currentIndex: number;
      note?: string;
    }
  | {
      ok: false;
      title: string;
      detail: string;
    };

const STATE_BLOCK_REGEX = /<(state\d+)>\s*([\s\S]*?)\s*<\/\1>/g;
const TAG_OPEN = '<';
const TAG_CLOSE = '>';
const CURRENT_CHARACTER_TAG_PREFIX = '当前';
const CURRENT_CHARACTER_TAG_PRIMARY_SUFFIX = '人物';
const CURRENT_CHARACTER_TAG_COMPAT_SUFFIX = '角色';
const CURRENT_CHARACTER_TAG_SUFFIX_PATTERN = `(${CURRENT_CHARACTER_TAG_PRIMARY_SUFFIX}|${CURRENT_CHARACTER_TAG_COMPAT_SUFFIX})`;
const CURRENT_CHARACTER_TAG_PATTERN = `${TAG_OPEN}${CURRENT_CHARACTER_TAG_PREFIX}${CURRENT_CHARACTER_TAG_SUFFIX_PATTERN}${TAG_CLOSE}[\\s\\S]*?${TAG_OPEN}/${CURRENT_CHARACTER_TAG_PREFIX}\\1${TAG_CLOSE}`;
const CURRENT_CHARACTER_TAG_REGEX = new RegExp(`${CURRENT_CHARACTER_TAG_PATTERN}\\s*`, 'g');
const CURRENT_CHARACTER_TAG_DETECT_REGEX = new RegExp(CURRENT_CHARACTER_TAG_PATTERN);
const CURRENT_CHARACTER_TAG_CONTENT_REGEX = new RegExp(
  `${TAG_OPEN}${CURRENT_CHARACTER_TAG_PREFIX}${CURRENT_CHARACTER_TAG_SUFFIX_PATTERN}${TAG_CLOSE}([\\s\\S]*?)${TAG_OPEN}/${CURRENT_CHARACTER_TAG_PREFIX}\\1${TAG_CLOSE}`,
  'g',
);
const VARIABLE_INSERT_BLOCK_REGEX = /<VariableInsert>\s*([\s\S]*?)\s*<\/VariableInsert>/;
const VARIABLE_INSERT_BLOCK_GLOBAL_REGEX = /<VariableInsert>\s*[\s\S]*?\s*<\/VariableInsert>/g;
const VARIABLE_INSERT_DETECT_REGEX = /<VariableInsert>[\s\S]*?<\/VariableInsert>/;
const VARIABLE_EDIT_BLOCK_GLOBAL_REGEX = /<VariableEdit>\s*([\s\S]*?)\s*<\/VariableEdit>/g;
const STATE_BLOCK_DETECT_REGEX = /<(state\d+)>\s*[\s\S]*?\s*<\/\1>/;
const QUICK_OPENING_DEBUG_PREFIX = '[开局前端][快捷开局]';
const QUICK_OPENING_DEBUG_STORAGE_KEY = 'jm-opening-quick-debug';
const DEBUG_PREVIEW_LIMIT = 3000;

let quickOpeningBusy = false;

export async function refreshQuickOpeningScreen(feedback?: QuickOpeningFeedback) {
  if (quickOpeningBusy) return;

  setQuickOpeningBusy(true);
  setQuickOpeningFeedback({ type: 'info', text: '正在读取当前聊天第 0 楼开局分支...' });

  try {
    const result = await loadQuickOpenings();
    renderQuickOpeningLoadResult(result);

    if (feedback) {
      setQuickOpeningFeedback(feedback);
    } else if (result.ok && result.note) {
      setQuickOpeningFeedback({ type: 'warning', text: result.note });
    } else if (result.ok) {
      setQuickOpeningFeedback({
        type: 'info',
        text: `已读取 ${result.openings.length} 个开局分支，当前为第 ${result.currentIndex + 1} 个。`,
      });
    }
  } catch (error) {
    renderQuickOpeningError('无法读取当前聊天开局', getErrorMessage(error));
  } finally {
    setQuickOpeningBusy(false);
  }
}

export async function selectQuickOpening(index: number, settings: GenerationSettings) {
  if (quickOpeningBusy) return;

  setQuickOpeningBusy(true);
  setQuickOpeningFeedback({ type: 'info', text: `正在切换到第 ${index + 1} 个开局...` });

  try {
    const switchResult = await switchQuickOpening(index, settings);
    const result = await loadQuickOpenings();
    renderQuickOpeningLoadResult(result);

    if (result.ok) {
      setQuickOpeningFeedback({ type: 'success', text: getQuickOpeningSwitchSuccessText(index, switchResult) });
    }
  } catch (error) {
    setQuickOpeningFeedback({ type: 'error', text: getErrorMessage(error) });
  } finally {
    setQuickOpeningBusy(false);
  }
}

export async function loadQuickOpenings(): Promise<QuickOpeningLoadResult> {
  if (typeof getChatMessages !== 'function') {
    return {
      ok: false,
      title: '无法读取当前聊天开局',
      detail: '当前环境没有提供 getChatMessages 接口。请在酒馆助手前端界面中使用快捷开局。',
    };
  }

  const [message] = getChatMessages(0, { include_swipes: true });
  if (!message) {
    return {
      ok: false,
      title: '无法读取当前聊天开局',
      detail: '当前聊天没有第 0 楼消息，暂时没有可切换的已有开局。',
    };
  }

  const swipes = Array.isArray(message.swipes)
    ? message.swipes.filter((swipe): swipe is string => typeof swipe === 'string')
    : [];

  if (swipes.length === 0) {
    return {
      ok: false,
      title: '没有可切换的开局分支',
      detail: '第 0 楼没有记录 swipes。请先让当前聊天拥有多个开局分支后再使用快捷开局。',
    };
  }

  const currentIndex = normalizeSwipeIndex(message.swipe_id, swipes.length);
  const openings = swipes.map((text, index) => ({
    index,
    text,
    isCurrent: index === currentIndex,
  }));

  return {
    ok: true,
    openings,
    currentIndex,
    note: swipes.length === 1 ? '当前聊天第 0 楼只有一个开局分支，暂无可切换目标。' : undefined,
  };
}

export async function switchQuickOpening(
  index: number,
  settings: Pick<GenerationSettings, 'enableVariables'>,
): Promise<QuickOpeningSwitchResult> {
  debugQuickOpening('开始切换开局', {
    targetSwipeIndex: index,
    enableVariables: settings.enableVariables,
  });

  if (typeof setChatMessages !== 'function') {
    throw new Error('当前环境没有提供 setChatMessages 接口，无法切换开局。');
  }

  if (!Number.isInteger(index) || index < 0) {
    throw new Error('目标开局序号无效。');
  }

  const swipes = getCurrentOpeningSwipes();
  debugQuickOpening('已读取第 0 楼 swipes', {
    swipeCount: swipes.length,
    targetSwipeIndex: index,
    enableVariables: settings.enableVariables,
    targetSwipeBeforeProcess: summarizeOpeningText(swipes[index] ?? ''),
  });

  if (index >= swipes.length) {
    throw new Error(`目标开局不存在：第 ${index + 1} 个开局超出当前分支数量。`);
  }

  const processed = processOpeningForVariableMode(swipes[index]);
  debugQuickOpening('变量模式处理结果', {
    changed: processed.changed,
    processedStateCount: processed.stateCount,
    names: processed.names,
    enableVariables: settings.enableVariables,
    processedText: summarizeOpeningText(processed.text),
  });

  if (!processed.changed) {
    await switchOpeningSwipe(index);
    return { processedStateCount: 0, currentNames: [] };
  }

  const nextSwipes = [...swipes];
  nextSwipes[index] = processed.text;
  await setOpeningSwipesAndSwitch(nextSwipes, index, processed.text);
  debugQuickOpening('快捷开局写入第 0 楼分支完成', {
    targetSwipeIndex: index,
    processedStateCount: processed.stateCount,
    names: processed.names,
  });
  return {
    processedStateCount: processed.stateCount,
    currentNames: processed.names,
  };
}

function renderQuickOpeningLoadResult(result: QuickOpeningLoadResult) {
  if (!result.ok) {
    renderQuickOpeningError(result.title, result.detail);
    return;
  }

  const list = byId<HTMLDivElement>('quick-opening-list');
  list.innerHTML = '';

  result.openings.forEach(opening => {
    list.appendChild(createQuickOpeningElement(opening));
  });
}

function renderQuickOpeningError(title: string, detail: string) {
  const list = byId<HTMLDivElement>('quick-opening-list');
  list.innerHTML = '';

  const empty = document.createElement('div');
  empty.className = 'quick-opening-empty';

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-triangle-exclamation';
  empty.appendChild(icon);

  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  empty.appendChild(titleElement);

  const detailElement = document.createElement('p');
  detailElement.textContent = detail;
  empty.appendChild(detailElement);

  list.appendChild(empty);
  setQuickOpeningFeedback({ type: 'error', text: detail });
}

function createQuickOpeningElement(opening: QuickOpeningItem) {
  const item = document.createElement('article');
  item.className = 'quick-opening-item';
  item.classList.toggle('current', opening.isCurrent);

  const meta = document.createElement('div');
  meta.className = 'quick-opening-meta';

  const title = document.createElement('h3');
  title.textContent = `开局 ${opening.index + 1}`;
  meta.appendChild(title);

  const badge = document.createElement('span');
  badge.className = 'quick-opening-badge';
  badge.textContent = opening.isCurrent ? '当前' : '可切换';
  meta.appendChild(badge);

  item.appendChild(meta);

  const preview = document.createElement('p');
  preview.className = 'quick-opening-preview';
  preview.textContent = createOpeningPreview(opening.text);
  item.appendChild(preview);

  const action = document.createElement('button');
  action.className = 'btn quick-opening-switch';
  action.type = 'button';
  action.dataset.swipeIndex = String(opening.index);
  action.disabled = opening.isCurrent;
  action.textContent = opening.isCurrent ? '当前' : '切换';
  item.appendChild(action);

  return item;
}

function setQuickOpeningFeedback(feedback: QuickOpeningFeedback) {
  const feedbackElement = byId<HTMLDivElement>('quick-opening-feedback');
  feedbackElement.className = `quick-opening-feedback ${feedback.type}`;
  feedbackElement.textContent = feedback.text;
}

function setQuickOpeningBusy(isBusy: boolean) {
  quickOpeningBusy = isBusy;

  const refreshButton = byId<HTMLButtonElement>('refresh-quick-openings');
  refreshButton.disabled = isBusy;

  document.querySelectorAll<HTMLButtonElement>('.quick-opening-switch').forEach(button => {
    button.disabled = isBusy || button.textContent === '当前';
  });
}

function normalizeSwipeIndex(swipeIndex: number, swipeCount: number) {
  if (!Number.isInteger(swipeIndex)) {
    return 0;
  }

  if (swipeIndex < 0) {
    return 0;
  }

  if (swipeIndex >= swipeCount) {
    return swipeCount - 1;
  }

  return swipeIndex;
}

function createOpeningPreview(text: string) {
  const preview = text.trim();
  if (!preview) {
    return '（空开局内容）';
  }

  return preview;
}

function getCurrentOpeningSwipes() {
  if (typeof getChatMessages !== 'function') {
    throw new Error('当前环境没有提供 getChatMessages 接口，无法读取开局分支。');
  }

  const [message] = getChatMessages(0, { include_swipes: true });
  if (!message || !Array.isArray(message.swipes)) {
    throw new Error('当前聊天第 0 楼没有可用的开局分支。');
  }

  return message.swipes.map(swipe => (typeof swipe === 'string' ? swipe : String(swipe ?? '')));
}

function processOpeningForVariableMode(text: string) {
  const matches = [...text.matchAll(STATE_BLOCK_REGEX)];
  if (matches.length === 0) {
    return ensureCurrentCharacterTagFromVariableInsert(text);
  }

  const parsedStates = matches.map((match, index) => {
    const stateName = match[1];
    const stateJson = match[2].trim();
    const stateData = parseStateBlockJson(stateJson, stateName, index);
    const characterName = getStateCharacterName(stateData, stateName, index);
    return {
      stateName,
      characterName,
      stateData,
      stateDataWithoutName: omitNameField(stateData),
    };
  });

  const allNames = parsedStates.map(state => state.characterName);
  const names = uniqueStrings(allNames);
  const currentCharacterTag = createCurrentCharacterTag(names);
  const variableData = Object.fromEntries(parsedStates.map(state => [state.characterName, state.stateDataWithoutName]));
  const variableInsert = createVariableInsertBlock(variableData);

  debugQuickOpening('解析 state 块结果', {
    stateCount: matches.length,
    allNames,
    uniqueNames: names,
    duplicateNames: getDuplicateStrings(allNames),
    parsedStates: parsedStates.map((state, index) => ({
      index,
      stateName: state.stateName,
      characterName: state.characterName,
      originalStateBlock: previewDebugText(matches[index]?.[0] ?? ''),
      stateData: state.stateData,
      stateDataWithoutName: state.stateDataWithoutName,
    })),
    generatedCurrentCharacterTag: currentCharacterTag,
    generatedVariableInsert: variableInsert,
  });

  const textWithVariableInsert = replaceStateBlocksWithVariableContent(text, matches, variableInsert);
  const textWithCurrentCharacterTag = ensureCurrentCharacterTag(textWithVariableInsert, currentCharacterTag);
  const processedText = ensureCurrentCharacterVariableEdit(textWithCurrentCharacterTag);

  return {
    changed: processedText !== text,
    text: processedText,
    stateCount: matches.length,
    names,
  };
}

function ensureCurrentCharacterTagFromVariableInsert(text: string) {
  const textWithCurrentCharacterField = ensureCurrentCharacterFieldInVariableInsert(text);
  const names = getVariableInsertCharacterNames(textWithCurrentCharacterField);
  if (names.length === 0) {
    return {
      changed: textWithCurrentCharacterField !== text,
      text: textWithCurrentCharacterField,
      stateCount: 0,
      names: [],
    };
  }

  const textWithCurrentCharacterTag = ensureCurrentCharacterTag(
    textWithCurrentCharacterField,
    createCurrentCharacterTag(names),
  );
  const processedText = ensureCurrentCharacterVariableEdit(textWithCurrentCharacterTag);
  return {
    changed: processedText !== text,
    text: processedText,
    stateCount: 0,
    names,
  };
}

function parseStateBlockJson(stateJson: string, stateName: string, index: number) {
  try {
    const parsed = JSON.parse(stateJson) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('内容不是 JSON 对象');
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `变量模式处理失败：${stateName || `第 ${index + 1} 个 state`} 不是有效 JSON。${getErrorMessage(error)}`,
    );
  }
}

function getStateCharacterName(stateData: Record<string, unknown>, stateName: string, index: number) {
  const name = typeof stateData.Name === 'string' ? stateData.Name.trim() : '';
  if (!name) {
    throw new Error(`变量模式处理失败：${stateName || `第 ${index + 1} 个 state`} 缺少字符串字段 "Name"。`);
  }

  return name;
}

function omitNameField(stateData: Record<string, unknown>) {
  const nextData: Record<string, unknown> = {};
  Object.entries(stateData).forEach(([key, value]) => {
    if (key !== 'Name') {
      nextData[key] = value;
    }
  });
  return nextData;
}

function createCurrentCharacterTag(names: string[]) {
  const uniqueNames = uniqueStrings(names);
  const tagName = `${CURRENT_CHARACTER_TAG_PREFIX}${CURRENT_CHARACTER_TAG_PRIMARY_SUFFIX}`;
  const content = uniqueNames.join(',');
  const tag = [TAG_OPEN, tagName, TAG_CLOSE, content, TAG_OPEN, '/', tagName, TAG_CLOSE].join('');

  debugQuickOpening('构造当前人物标签', {
    inputNames: names,
    uniqueNames,
    tagName,
    content,
    tag,
    tagLength: tag.length,
  });

  return tag;
}

function createVariableInsertBlock(variableData: Record<string, Record<string, unknown>>) {
  return `<VariableInsert>\n${JSON.stringify({ 当前人物: '', 角色数据: variableData }, null, 2)}\n</VariableInsert>`;
}

function replaceStateBlocksWithVariableContent(text: string, matches: RegExpMatchArray[], variableInsert: string) {
  let nextText = '';
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + match[0].length;
    nextText += text.slice(lastIndex, startIndex);
    if (index === 0) {
      nextText += variableInsert;
    }
    lastIndex = endIndex;
  });

  nextText += text.slice(lastIndex);

  debugQuickOpening('替换 state 块为 VariableInsert', {
    removedStateBlocks: matches.map((match, index) => ({
      index,
      stateName: match[1] ?? '',
      raw: previewDebugText(match[0] ?? ''),
      jsonText: previewDebugText((match[2] ?? '').trim()),
    })),
    insertedVariableInsert: variableInsert,
    before: summarizeOpeningText(text),
    after: summarizeOpeningText(nextText),
  });

  return nextText;
}

function ensureCurrentCharacterTag(text: string, currentCharacterTag: string) {
  const removal = removeCurrentCharacterTagsOutsideVariableInsert(text);
  const variableInsertMatch = removal.text.match(VARIABLE_INSERT_BLOCK_REGEX);
  const insertionTarget = variableInsertMatch ? 'before-variable-insert' : 'document-start';
  const nextText = variableInsertMatch
    ? removal.text.replace(VARIABLE_INSERT_BLOCK_REGEX, match => `${currentCharacterTag}\n${match}`)
    : `${currentCharacterTag}\n${removal.text}`;

  debugQuickOpening('整理当前人物标签', {
    insertedCurrentCharacterTag: currentCharacterTag,
    insertedCurrentCharacterTagLength: currentCharacterTag.length,
    insertionTarget,
    removedCurrentCharacterTagsOutsideVariableInsert: removal.removedTags,
    textLengthDelta: nextText.length - text.length,
    before: summarizeOpeningText(text),
    after: summarizeOpeningText(nextText),
  });

  return nextText;
}

function removeCurrentCharacterTagsOutsideVariableInsert(text: string) {
  let nextText = '';
  let lastIndex = 0;
  const removedTags: string[] = [];

  for (const match of text.matchAll(VARIABLE_INSERT_BLOCK_GLOBAL_REGEX)) {
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + match[0].length;
    const outsideText = text.slice(lastIndex, startIndex);
    removedTags.push(...getCurrentCharacterTagTexts(outsideText));
    nextText += outsideText.replace(CURRENT_CHARACTER_TAG_REGEX, '');
    nextText += match[0];
    lastIndex = endIndex;
  }

  const trailingText = text.slice(lastIndex);
  removedTags.push(...getCurrentCharacterTagTexts(trailingText));
  nextText += trailingText.replace(CURRENT_CHARACTER_TAG_REGEX, '');

  return {
    text: nextText,
    removedTags,
  };
}

function getVariableInsertCharacterNames(text: string) {
  const match = text.match(VARIABLE_INSERT_BLOCK_REGEX);
  if (!match) {
    return [];
  }

  try {
    const parsed = JSON.parse(match[1].trim()) as unknown;
    if (!isRecord(parsed)) {
      return [];
    }

    return uniqueStrings(extractCharacterNamesFromVariableInsert(parsed));
  } catch (error) {
    console.warn('[开局前端] 无法从现有 VariableInsert 中同步当前人物标签:', error);
    return [];
  }
}

function extractCharacterNamesFromVariableInsert(variableData: Record<string, unknown>) {
  const statData = isRecord(variableData.stat_data) ? variableData.stat_data : undefined;
  const characterData = isRecord(variableData.角色数据)
    ? variableData.角色数据
    : isRecord(statData?.角色数据)
      ? statData.角色数据
      : isRecord(statData)
        ? statData
        : variableData;
  return Object.entries(characterData)
    .filter(([key, value]) => !key.startsWith('$') && isRecord(value))
    .map(([key]) => key);
}

function ensureCurrentCharacterFieldInVariableInsert(text: string) {
  const match = text.match(VARIABLE_INSERT_BLOCK_REGEX);
  if (!match) {
    return text;
  }

  try {
    const parsed = JSON.parse(match[1].trim()) as unknown;
    if (!isRecord(parsed) || typeof parsed.当前人物 === 'string') {
      return text;
    }

    const nextVariableInsert = `<VariableInsert>\n${JSON.stringify({ 当前人物: '', ...parsed }, null, 2)}\n</VariableInsert>`;
    return text.replace(VARIABLE_INSERT_BLOCK_REGEX, nextVariableInsert);
  } catch (error) {
    console.warn('[开局前端] 无法补齐 VariableInsert 的当前人物空字段:', error);
    return text;
  }
}

function ensureCurrentCharacterVariableEdit(text: string) {
  const names = getCurrentCharacterNamesFromText(text);
  const cleanedText = removeCurrentCharacterVariableEditBlocks(text);
  if (names.length === 0) {
    return cleanedText;
  }

  return `${cleanedText.trimEnd()}\n<VariableEdit>\n${JSON.stringify({ 当前人物: names.join(',') }, null, 2)}\n</VariableEdit>`;
}

function getCurrentCharacterNamesFromText(text: string) {
  return uniqueStrings(
    getCurrentCharacterTagContents(text).flatMap(tag =>
      tag.content
        .split(/[,\n\r|｜，]+/)
        .map(name => name.trim())
        .filter(Boolean),
    ),
  );
}

function removeCurrentCharacterVariableEditBlocks(text: string) {
  let nextText = '';
  let lastIndex = 0;

  for (const match of text.matchAll(VARIABLE_EDIT_BLOCK_GLOBAL_REGEX)) {
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + match[0].length;
    nextText += text.slice(lastIndex, startIndex);

    if (!shouldRemoveCurrentCharacterVariableEdit(match[1] ?? '')) {
      nextText += match[0];
    }

    lastIndex = endIndex;
  }

  nextText += text.slice(lastIndex);
  return nextText;
}

function shouldRemoveCurrentCharacterVariableEdit(jsonText: string) {
  try {
    const parsed = JSON.parse(jsonText.trim()) as unknown;
    return isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, '当前人物');
  } catch {
    return false;
  }
}

async function switchOpeningSwipe(index: number) {
  debugQuickOpening('准备切换第 0 楼 swipe_id', { targetSwipeIndex: index });
  await setChatMessages([{ message_id: 0, swipe_id: index }], { refresh: 'affected' });
  debugOpeningMessageAfterWrite({ message_id: 0, swipe_id: index });
}

async function setOpeningSwipesAndSwitch(swipes: string[], index: number, targetText: string) {
  debugQuickOpening('准备安全写回第 0 楼 swipes', summarizeOpeningPatch({ message_id: 0, swipes, swipe_id: index }));
  await setChatMessages([{ message_id: 0, swipe_id: index }], { refresh: 'none' });
  assertActiveOpeningSwipe(index, '切换目标 swipe 后');

  await setChatMessages([{ message_id: 0, swipes }], { refresh: 'none' });
  assertActiveOpeningSwipe(index, '更新 swipes 后');

  await ensureActiveOpeningMessage(index, targetText);
  debugOpeningMessageAfterWrite({ message_id: 0, swipes, swipe_id: index });
  await refreshOpeningMessageDisplay(index);
}

async function refreshOpeningMessageDisplay(index: number) {
  debugQuickOpening('准备刷新第 0 楼显示', {
    targetSwipeIndex: index,
    patch: summarizeOpeningPatch({ message_id: 0 }),
  });

  await setChatMessages([{ message_id: 0 }], { refresh: 'affected' });
}

function assertActiveOpeningSwipe(index: number, step: string) {
  const [message] = getChatMessages(0, { include_swipes: true });
  const actualSwipeIndex = message?.swipe_id;
  debugQuickOpening(`${step}确认 active swipe`, {
    expectedSwipeIndex: index,
    actualSwipeIndex,
  });

  if (actualSwipeIndex !== index) {
    throw new Error(
      `${step}失败：当前 active swipe 是 ${actualSwipeIndex}，不是目标 ${index}。已停止写入 message 以避免覆盖其他开局。`,
    );
  }
}

async function ensureActiveOpeningMessage(index: number, targetText: string) {
  const [message] = getChatMessages(0);
  if (message?.message === targetText) {
    debugQuickOpening('当前第 0 楼正文已等于目标开局，无需补写 message', {
      targetSwipeIndex: index,
      message: summarizeOpeningText(message.message),
    });
    return;
  }

  debugQuickOpening('当前第 0 楼正文未跟随目标 swipe，已确认目标 active 后补写 message', {
    targetSwipeIndex: index,
    currentMessage: summarizeOpeningText(message?.message ?? ''),
    targetText: summarizeOpeningText(targetText),
  });

  await setChatMessages([{ message_id: 0, message: targetText }], { refresh: 'none' });
}

function getQuickOpeningSwitchSuccessText(index: number, result: QuickOpeningSwitchResult) {
  if (result.processedStateCount === 0) {
    return `已切换到第 ${index + 1} 个开局。`;
  }

  return `已切换到第 ${index + 1} 个开局，并合并 ${result.processedStateCount} 个 state：${result.currentNames.join(',')}。`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function getDuplicateStrings(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach(value => {
    const normalized = value.trim();
    if (!normalized) return;

    if (seen.has(normalized)) {
      duplicates.add(normalized);
      return;
    }

    seen.add(normalized);
  });

  return [...duplicates];
}

function debugOpeningMessageAfterWrite(patch: OpeningMessagePatch) {
  try {
    const targetSwipeIndex = patch.swipe_id;
    const [openingMessage] = getChatMessages(0);
    const [openingMessageWithSwipes] = getChatMessages(0, { include_swipes: true });
    const swipes = Array.isArray(openingMessageWithSwipes?.swipes) ? openingMessageWithSwipes.swipes : [];

    debugQuickOpening('写回后重新读取第 0 楼', {
      requestedSwipeIndex: targetSwipeIndex,
      actualSwipeIndex: openingMessageWithSwipes?.swipe_id,
      message0: {
        message_id: openingMessage?.message_id,
        role: openingMessage?.role,
        message: summarizeOpeningText(openingMessage?.message ?? ''),
      },
      message0TargetSwipe:
        typeof targetSwipeIndex === 'number' && swipes[targetSwipeIndex] !== undefined
          ? summarizeOpeningText(swipes[targetSwipeIndex])
          : null,
    });
  } catch (error) {
    debugQuickOpening('写回后重新读取失败', { error: getErrorMessage(error) });
  }
}

function summarizeOpeningPatch(patch: OpeningMessagePatch) {
  return {
    message_id: patch.message_id,
    swipe_id: patch.swipe_id,
    hasMessageField: typeof patch.message === 'string',
    hasSwipesField: Array.isArray(patch.swipes),
    swipesLength: patch.swipes?.length ?? 0,
    message: summarizeOpeningText(patch.message ?? ''),
    targetSwipe:
      typeof patch.swipe_id === 'number' && patch.swipes?.[patch.swipe_id] !== undefined
        ? summarizeOpeningText(patch.swipes[patch.swipe_id])
        : null,
  };
}

function summarizeOpeningText(text: string) {
  return {
    length: text.length,
    hasCurrentCharacterTag: CURRENT_CHARACTER_TAG_DETECT_REGEX.test(text),
    currentCharacterTags: getCurrentCharacterTagContents(text),
    hasVariableInsert: VARIABLE_INSERT_DETECT_REGEX.test(text),
    hasStateBlock: STATE_BLOCK_DETECT_REGEX.test(text),
    preview: previewDebugText(text),
  };
}

function getCurrentCharacterTagContents(text: string) {
  return [...text.matchAll(CURRENT_CHARACTER_TAG_CONTENT_REGEX)].map(match => ({
    tagName: `当前${match[1]}`,
    content: match[2].trim(),
  }));
}

function getCurrentCharacterTagTexts(text: string) {
  return [...text.matchAll(CURRENT_CHARACTER_TAG_CONTENT_REGEX)].map(match => match[0]);
}

function previewDebugText(text: string) {
  if (text.length <= DEBUG_PREVIEW_LIMIT) {
    return text;
  }

  return `${text.slice(0, DEBUG_PREVIEW_LIMIT)}... [truncated, length=${text.length}]`;
}

function debugQuickOpening(message: string, details?: Record<string, unknown>) {
  if (!shouldDebugQuickOpening()) return;

  if (details === undefined) {
    console.info(`${QUICK_OPENING_DEBUG_PREFIX} ${message}`);
    return;
  }

  console.info(`${QUICK_OPENING_DEBUG_PREFIX} ${message}`, details);
}

function shouldDebugQuickOpening() {
  try {
    return localStorage.getItem(QUICK_OPENING_DEBUG_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || '未知错误');
}
