/**
 * 通用酒馆卡的追加规则：从 User 提取标记行，再把内容插入上一条 AI 原始消息。
 * 默认位置兼容原实现：正文末尾、受保护系统尾块之前。
 */
export const DEFAULT_APPEND_MARKER = '1:';

const SYSTEM_BLOCK_REGEX =
  /<era_data>[\s\S]*?<\/era_data>|<VariableThink>[\s\S]*?<\/VariableThink>|<VariableInsert>[\s\S]*?<\/VariableInsert>|<VariableEdit>[\s\S]*?<\/VariableEdit>|<VariableDelete>[\s\S]*?<\/VariableDelete>/gi;
const RESERVED_TAG_REGEX = /<\/?(?:era_data|Variable(?:Think|Insert|Edit|Delete))\b/i;

export interface MarkedInput {
  matched: boolean;
  appendText: string;
  userText: string;
}

export type MarkerPosition = 'before' | 'after';

export interface AssistantAppendOptions {
  /** 留空表示按原方式追加到正文尾部、系统尾块之前。 */
  targetMarker?: string;
  /** 目标标记首次出现处的前面/后面，默认 before。 */
  markerPosition?: MarkerPosition;
  /** 每轮在追加文字最前面原样加上此固定文本，可包含换行。 */
  fixedPrefix?: string;
}

/** 仅识别每行行首的输入标记（可以有行首空格）。 */
export function splitMarkedInput(input: string, marker: string): MarkedInput {
  if (!marker || /[\r\n]/.test(marker)) {
    return { matched: false, appendText: '', userText: input };
  }
  const appendLines: string[] = [];
  const userLines: string[] = [];
  let matched = false;
  for (const line of input.replace(/\r\n?/g, '\n').split('\n')) {
    const leftTrimmed = line.trimStart();
    if (leftTrimmed.startsWith(marker)) {
      matched = true;
      appendLines.push(leftTrimmed.slice(marker.length).trim());
    } else {
      userLines.push(line);
    }
  }
  return {
    matched,
    appendText: appendLines.join('\n').trim(),
    userText: userLines.join('\n').trim(),
  };
}

/**
 * 把新片段放在一个精确的原文偏移处。
 * 只增加必要的换行，标记及其两边的旧文本本身绝不修改。
 */
function insertAtOffset(source: string, offset: number, content: string): string {
  const before = source.slice(0, offset);
  const after = source.slice(offset);
  const beforeBreak = before && !before.endsWith('\n') ? '\n' : '';
  const afterBreak = after && !after.startsWith('\n') ? '\n' : '';
  return before + beforeBreak + content + afterBreak + after;
}

/**
 * 原文中找目标标记的第一次精确匹配，绝不把标记当正则。
 * 如果匹配位置位于受保护系统块内部，拒绝写入，防止破坏原始结构。
 */
function insertAroundMarker(
  previousText: string,
  content: string,
  marker: string,
  position: MarkerPosition,
): string {
  const index = previousText.indexOf(marker);
  if (index < 0) {
    throw new Error('上一条 AI 回复中找不到指定定位标记：' + marker);
  }
  const offset = position === 'after' ? index + marker.length : index;
  SYSTEM_BLOCK_REGEX.lastIndex = 0;
  for (const block of previousText.matchAll(SYSTEM_BLOCK_REGEX)) {
    const blockStart = block.index;
    const blockEnd = blockStart + block[0].length;
    if (offset > blockStart && offset < blockEnd) {
      throw new Error('定位标记位于受保护的系统数据块内部，拒绝插入。');
    }
  }
  return insertAtOffset(previousText, offset, content);
}

/**
 * 默认：正文末尾、Variable* / era_data 系统尾块之前。
 * 自定义：指定文字标记的首次出现位置前/后。
 * 固定前缀只属于追加内容，不会进入 User 消息。
 */
export function appendToAssistantBody(
  previousText: string,
  appendText: string,
  options: AssistantAppendOptions = {},
): string {
  const normalizedAppend = appendText.trim();
  if (!normalizedAppend) {
    throw new Error('标记后没有可追加的文字，已取消追加。');
  }
  const content = (options.fixedPrefix ?? '') + normalizedAppend;
  if (RESERVED_TAG_REGEX.test(content)) {
    throw new Error('追加内容及固定前缀不能包含 era_data 或 Variable* 系统标签。');
  }

  if (options.targetMarker) {
    return insertAroundMarker(
      previousText,
      content,
      options.targetMarker,
      options.markerPosition === 'after' ? 'after' : 'before',
    );
  }

  SYSTEM_BLOCK_REGEX.lastIndex = 0;
  const matches = Array.from(previousText.matchAll(SYSTEM_BLOCK_REGEX));
  let tailStart = previousText.length;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i];
    const start = match.index;
    if (previousText.slice(start + match[0].length, tailStart).trim()) break;
    tailStart = start;
  }
  const body = previousText.slice(0, tailStart).trimEnd();
  const tail = previousText.slice(tailStart).trimStart();
  const joined = body ? body + '\n\n' + content : content;
  return tail ? joined + '\n\n' + tail : joined;
}
