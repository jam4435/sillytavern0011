export const EVENT_KIND = Object.freeze({
  ORDINARY: 'ordinary',
  DEBUT: 'debut',
  GROWTH: 'growth',
  ENCOUNTER: 'encounter',
});

export const EVENT_RUNTIME_KEY_VERSION = 3;

const CHINESE_DIGIT_VALUES = Object.freeze({
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
});

const CHINESE_UNIT_VALUES = Object.freeze({ 十: 10, 百: 100, 千: 1000, 万: 10000 });
const CANONICAL_EVENT_KEY_PATTERN = /^(.+?)第([零一二三四五六七八九十百千万]+)回(\d{2})-(.+)$/;
const CANONICAL_ENCOUNTER_KEY_PATTERN = /^(?:奇遇事件|奇遇)-(?:([^\s-]+)-)?(.+)$/;
const EVENT_FILE_SUFFIX_PATTERN = /\.(json|ya?ml|txt)$/i;
const INVALID_FILE_TITLE_PATTERN = /[<>:"/\\|?*]/;

export function stripEventFileSuffix(value) {
  return String(value || '').trim().replace(EVENT_FILE_SUFFIX_PATTERN, '');
}

export function parseChineseNumber(value) {
  const text = String(value || '').trim();
  if (!text || !/^[零一二三四五六七八九十百千万]+$/.test(text)) return null;

  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of text) {
    if (Object.prototype.hasOwnProperty.call(CHINESE_DIGIT_VALUES, character)) {
      digit = CHINESE_DIGIT_VALUES[character];
      continue;
    }
    const unit = CHINESE_UNIT_VALUES[character];
    if (!unit) return null;
    if (unit === 10000) {
      section += digit;
      total += (section || 1) * unit;
      section = 0;
      digit = 0;
    } else {
      section += (digit || 1) * unit;
      digit = 0;
    }
  }
  return total + section + digit;
}

function formatChineseSection(value) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units = ['', '十', '百', '千'];
  let result = '';
  let zeroPending = false;
  for (let position = 3; position >= 0; position -= 1) {
    const divisor = 10 ** position;
    const digit = Math.floor(value / divisor) % 10;
    if (digit === 0) {
      if (result && value % divisor !== 0) zeroPending = true;
      continue;
    }
    if (zeroPending) {
      result += '零';
      zeroPending = false;
    }
    if (!(digit === 1 && position === 1 && !result)) result += digits[digit];
    result += units[position];
  }
  return result;
}

export function formatChineseNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 9999) return null;
  if (number < 10000) return formatChineseSection(number);
  return null;
}

export function parseCanonicalEventKey(value) {
  const sourceName = stripEventFileSuffix(value);
  const match = sourceName.match(CANONICAL_EVENT_KEY_PATTERN);
  if (!match) {
    const encounterMatch = sourceName.match(CANONICAL_ENCOUNTER_KEY_PATTERN);
    if (!encounterMatch) return null;

    const [, seriesPrefix, title] = encounterMatch;
    if (
      !title.trim() ||
      INVALID_FILE_TITLE_PATTERN.test(title) ||
      title !== title.trim()
    ) {
      return null;
    }

    const series = seriesPrefix ? `${seriesPrefix.trim()}奇遇` : '奇遇';
    return {
      runtimeKey: sourceName,
      sourceName,
      kind: EVENT_KIND.ENCOUNTER,
      series,
      chapter: '奇遇篇',
      chapterNumber: 9999,
      sequence: '00',
      title,
    };
  }

  const [, series, chapterText, sequenceText, title] = match;
  const chapterNumber = parseChineseNumber(chapterText);
  if (
    !series.trim() ||
    !chapterNumber ||
    formatChineseNumber(chapterNumber) !== chapterText ||
    !title.trim() ||
    INVALID_FILE_TITLE_PATTERN.test(title) ||
    title !== title.trim()
  ) {
    return null;
  }

  const sequence = Number(sequenceText);
  let kind = EVENT_KIND.ORDINARY;
  if (sequence === 0) {
    if (title === '人物登场') kind = EVENT_KIND.DEBUT;
    else if (/^人物成长(?:-.+)?$/.test(title)) kind = EVENT_KIND.GROWTH;
    else return null;
  } else if (title === '人物登场' || title.startsWith('人物成长')) {
    return null;
  }

  return {
    runtimeKey: sourceName,
    sourceName,
    kind,
    series,
    chapter: `第${chapterText}回`,
    chapterNumber,
    sequence: sequenceText,
    title,
  };
}

export function isCanonicalEventKey(value) {
  return parseCanonicalEventKey(value) !== null;
}

export function looksLikeEventEntryName(value) {
  const text = stripEventFileSuffix(value);
  return (
    /(?:事件条目-|登场事件-|成长条目-|奇遇事件-|奇遇-)/.test(text) ||
    /第[0-9零一二三四五六七八九十百千万]+回/.test(text)
  );
}
