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
const CURRENT_CHARACTER_TAG_REGEX = /<当前人物>[\s\S]*?<\/当前人物>/;
const QUICK_OPENING_DEBUG_PREFIX = '[开局前端][快捷开局]';
const DEBUG_PREVIEW_LIMIT = 1400;

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
  if (typeof setChatMessages !== 'function') {
    throw new Error('当前环境没有提供 setChatMessages 接口，无法切换开局。');
  }

  if (!Number.isInteger(index) || index < 0) {
    throw new Error('目标开局序号无效。');
  }

  if (!settings.enableVariables) {
    await setChatMessages([{ message_id: 0, swipe_id: index }], { refresh: 'affected' });
    return { processedStateCount: 0, currentNames: [] };
  }

  const swipes = getCurrentOpeningSwipes();
  if (index >= swipes.length) {
    throw new Error(`目标开局不存在：第 ${index + 1} 个开局超出当前分支数量。`);
  }

  const processed = processOpeningForVariableMode(swipes[index]);
  if (!processed.changed) {
    await setChatMessages([{ message_id: 0, swipe_id: index }], { refresh: 'affected' });
    return { processedStateCount: 0, currentNames: [] };
  }

  const nextSwipes = [...swipes];
  nextSwipes[index] = processed.text;
  debugQuickOpening('准备写回变量模式开局', {
    targetSwipeIndex: index,
    processedStateCount: processed.stateCount,
    names: processed.names,
    hasCurrentCharacterTagBeforeWrite: CURRENT_CHARACTER_TAG_REGEX.test(processed.text),
    processedTextPreview: previewDebugText(processed.text),
    processedText: processed.text,
  });
  await setChatMessages([{ message_id: 0, swipes: nextSwipes, swipe_id: index }], { refresh: 'affected' });
  debugWrittenQuickOpening(index, processed.text);
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
    return {
      changed: false,
      text,
      stateCount: 0,
      names: [],
    };
  }

  const parsedStates = matches.map((match, index) => {
    const stateName = match[1];
    const stateJson = match[2].trim();
    const stateData = parseStateBlockJson(stateJson, stateName, index);
    const characterName = getStateCharacterName(stateData, stateName, index);
    return {
      characterName,
      stateData,
    };
  });

  const names = parsedStates.map(state => state.characterName);
  const currentCharacterTag = createCurrentCharacterTag(names);
  const variableData = Object.fromEntries(
    parsedStates.map(state => [state.characterName, omitNameField(state.stateData)]),
  );
  const variableInsert = createVariableInsertBlock(variableData);
  const processedText = replaceStateBlocksWithVariableContent(text, matches, currentCharacterTag, variableInsert);

  debugQuickOpening('变量模式开局转换完成', {
    stateCount: matches.length,
    names,
    currentCharacterTag,
    hasCurrentCharacterTagAfterProcess: CURRENT_CHARACTER_TAG_REGEX.test(processedText),
    originalTextPreview: previewDebugText(text),
    processedTextPreview: previewDebugText(processedText),
  });

  return {
    changed: processedText !== text,
    text: processedText,
    stateCount: matches.length,
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
  return `<当前人物>${names.join(',')}</当前人物>`;
}

function createVariableInsertBlock(variableData: Record<string, Record<string, unknown>>) {
  return `<VariableInsert>\n${JSON.stringify(variableData, null, 2)}\n</VariableInsert>`;
}

function replaceStateBlocksWithVariableContent(
  text: string,
  matches: RegExpMatchArray[],
  currentCharacterTag: string,
  variableInsert: string,
) {
  let nextText = '';
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + match[0].length;
    nextText += text.slice(lastIndex, startIndex);
    if (index === 0) {
      nextText += `${currentCharacterTag}\n${variableInsert}`;
    }
    lastIndex = endIndex;
  });

  nextText += text.slice(lastIndex);
  return nextText;
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

function debugWrittenQuickOpening(index: number, expectedText: string) {
  try {
    const swipes = getCurrentOpeningSwipes();
    const writtenText = swipes[index] ?? '';
    debugQuickOpening('写回后重新读取目标开局', {
      targetSwipeIndex: index,
      hasCurrentCharacterTagAfterRead: CURRENT_CHARACTER_TAG_REGEX.test(writtenText),
      hasVariableInsertAfterRead: writtenText.includes('<VariableInsert>'),
      expectedHasCurrentCharacterTag: CURRENT_CHARACTER_TAG_REGEX.test(expectedText),
      expectedTextLength: expectedText.length,
      writtenTextLength: writtenText.length,
      writtenTextPreview: previewDebugText(writtenText),
      writtenText,
    });
  } catch (error) {
    debugQuickOpening('写回后重新读取失败', {
      error: getErrorMessage(error),
    });
  }
}

function debugQuickOpening(message: string, details?: Record<string, unknown>) {
  if (details === undefined) {
    console.log(`${QUICK_OPENING_DEBUG_PREFIX} ${message}`);
    return;
  }

  console.log(`${QUICK_OPENING_DEBUG_PREFIX} ${message}`, details);
}

function previewDebugText(text: string) {
  if (text.length <= DEBUG_PREVIEW_LIMIT) {
    return text;
  }

  return `${text.slice(0, DEBUG_PREVIEW_LIMIT)}... [truncated, length=${text.length}]`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || '未知错误');
}
