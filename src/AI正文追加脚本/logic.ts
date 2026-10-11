/**
 * 独立追加脚本的纯文本规则。与武侠前端 messageActions.ts 的
 * findTrailingAssistantSystemBlockStart / buildAssistantTextWithAppend 保持一致。
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

/**
 * 只识别单独一行的行首标记（允许行首空白）。
 * 多条标记行按原顺序加入 AI 正文，其余行保留为正常玩家消息。
 */
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

/** 插入在正文之后、尾部系统标签之前；从不修改系统标签本身。 */
export function appendToAssistantBody(previousText: string, appendText: string): string {
  const normalized = appendText.trim();
  if (!normalized) {
    throw new Error('标记后没有可追加的文字，已取消发送。');
  }
  if (RESERVED_TAG_REGEX.test(normalized)) {
    throw new Error('追加内容不能包含 era_data 或 Variable* 系统标签。');
  }
  SYSTEM_BLOCK_REGEX.lastIndex = 0;
  const matches = Array.from(previousText.matchAll(SYSTEM_BLOCK_REGEX));
  let tailStart = previousText.length;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i];
    const start = match.index ?? -1;
    if (start < 0 || previousText.slice(start + match[0].length, tailStart).trim()) {
      break;
    }
    tailStart = start;
  }
  const body = previousText.slice(0, tailStart).trimEnd();
  const tail = previousText.slice(tailStart).trimStart();
  const joined = body ? body + '\n\n' + normalized : normalized;
  return tail ? joined + '\n\n' + tail : joined;
}
