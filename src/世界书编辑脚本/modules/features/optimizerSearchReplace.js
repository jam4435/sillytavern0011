export const SEARCH_REPLACE_MODES = Object.freeze({
  NORMAL: 'normal',
  EXTENDED: 'extended',
  REGEX: 'regex',
});

const HEX_PAIR_PATTERN = /^[0-9a-fA-F]{2}$/;

export function decodeExtendedSearchText(value, fieldLabel = '输入内容') {
  const text = String(value ?? '');
  let decoded = '';

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character !== '\\' || index === text.length - 1) {
      decoded += character;
      continue;
    }

    const escapeType = text[index + 1];
    const simpleEscapes = {
      n: '\n',
      r: '\r',
      t: '\t',
      0: '\0',
      '\\': '\\',
    };

    if (Object.prototype.hasOwnProperty.call(simpleEscapes, escapeType)) {
      decoded += simpleEscapes[escapeType];
      index++;
      continue;
    }

    if (escapeType === 'x') {
      const hexPair = text.slice(index + 2, index + 4);
      if (!HEX_PAIR_PATTERN.test(hexPair)) {
        throw new Error(`${fieldLabel}中的 \\x 必须紧跟两位十六进制字符（例如 \\x20）。`);
      }
      decoded += String.fromCharCode(Number.parseInt(hexPair, 16));
      index += 3;
      continue;
    }

    decoded += `\\${escapeType}`;
    index++;
  }

  return decoded;
}

export function resolveSearchReplaceInput({ searchTerm, replaceTerm, useRegex = false, useExtended = false }) {
  if (useRegex && useExtended) {
    throw new Error('“扩展查找”和“使用正则”不能同时开启。');
  }

  const mode = useRegex
    ? SEARCH_REPLACE_MODES.REGEX
    : useExtended
      ? SEARCH_REPLACE_MODES.EXTENDED
      : SEARCH_REPLACE_MODES.NORMAL;

  if (mode !== SEARCH_REPLACE_MODES.EXTENDED) {
    return {
      mode,
      searchTerm: String(searchTerm ?? ''),
      replaceTerm: String(replaceTerm ?? ''),
    };
  }

  return {
    mode,
    searchTerm: decodeExtendedSearchText(searchTerm, '查找内容'),
    replaceTerm: decodeExtendedSearchText(replaceTerm, '替换内容'),
  };
}

export function buildGlobalSearchRegex(searchTerm, mode) {
  const pattern = mode === SEARCH_REPLACE_MODES.REGEX ? searchTerm : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (mode === SEARCH_REPLACE_MODES.REGEX) new RegExp(pattern);

  try {
    return new RegExp(pattern, 'gs');
  } catch {
    return new RegExp(pattern, 'g');
  }
}

export function replaceGlobalSearchMatches(text, searchRegex, replaceTerm, mode) {
  if (mode === SEARCH_REPLACE_MODES.EXTENDED) {
    return text.replace(searchRegex, () => replaceTerm);
  }
  return text.replace(searchRegex, replaceTerm);
}
