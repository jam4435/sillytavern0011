/* eslint-disable import-x/no-nodejs-modules */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const defaultInputPath = path.join(repoRoot, '信息', 'jm帝国漫画的完整提取文字.txt');
const defaultOutputPath = path.join(scriptDir, 'lore-entries.comic.generated.json');

const GENERIC_HEADINGS = new Set([
  '目录',
  '前言',
  '职业',
  '芭比篇',
  '废弃选项',
  '告知圣女教',
  '职位应聘标准',
  '口袋公司职位标准',
  '女性职员着装要求',
  '帝国女警职位标准',
  '颁发条件',
  '革命军视角',
  '帝国设定书',
  '补完计划',
]);

const PROPERTY_KEYS = new Set([
  '年龄',
  '身高',
  '体重',
  '胸围',
  '腰围',
  '臀围',
  '目录',
  '前言',
  '型号',
  '颁发条件',
  '职位应聘标准',
  '口袋公司职位标准',
  '女性职员着装要求',
  '帝国女警职位标准',
  '告知圣女教',
  '说明',
  '类别',
]);

const TITLE_VALUE_KEYS = new Set(['型号', '名称', '代号', '产品名', '产品名称']);

const GENERIC_TRIGGERS = new Set([
  '帝国',
  '女性',
  '男性',
  '女体',
  '奴隶',
  '女奴',
  '公司',
  '产品',
  '设施',
  '技术',
  '组织',
  '势力',
  '人物',
  '地点',
  '制度',
  '文化',
  '职业',
  '生物',
  '概念',
  '社会',
  '法律',
  '事件',
  '军方',
  '教廷',
  '军队',
  '士兵',
  '女人',
  '男人',
  '女兵',
  '男兵',
  '女警',
  '警察',
  '空姐',
  '空中小姐',
  '教官',
  '修女',
  '勋章',
  '条例',
  '法案',
  '计划',
  '协会',
  '航空',
  '白领',
  '视角',
  '篇',
]);

const TITLE_SUFFIX_HINTS = [
  '军',
  '队',
  '教',
  '会',
  '派',
  '章',
  '法',
  '杯',
  '书',
  '图',
  '战',
  '计划',
  '公司',
  '航空',
  '警察',
  '士兵',
  '白领',
  '修女',
  '雌豚',
  '箱娘',
  '恶媚',
  '教官',
  '圣女教',
  '革命军',
  '敬国军',
  '足品会',
  '塔罗娜',
  '婉然',
  '瓦丽安娜',
  '驼鹿',
  '淑女',
  '冲锋队',
  '勋章',
  '条例',
  '法案',
  '高跟鞋',
  '脑波雷达',
  '流体软骨',
]);

const CATEGORY_RULES = [
  ['法律', /(条例|法案|法律|法规)/],
  ['人物', /(^|[·\s])(南宫婉然|利卡·塔罗娜|塔罗娜|瓦丽安娜)(?=$|[·\s])|[她他]的母亲|教皇的女人/],
  ['组织', /(姐妹会|军事组织|足品会|公司|教廷|足协|教会|圣女教|敬国军|冲锋队|航空|警察)/],
  ['势力', /(帝国势力图|帝国社会|革命军|帝国(?!美足杯)|皇室|贵族阶层)/],
  ['事件', /(计划|战争|婚礼|内选|抗争|突袭)/],
  ['职业', /(空中小姐|职场白领|女子警察|修女|教官|士兵|舞女|女警)/],
  ['文化', /(美足杯|艳舞|足球|足文化|恋足|礼仪|体育|宣言)/],
  ['制度', /(标准|限制|军功|忠诚度|洗脑|控制手段|兵役|废除|服务于|评分)/],
  ['设施', /(实验室|基地|营地|酒吧|教堂|养殖场|机场|集中营)/],
  ['技术', /(脑波雷达|流体软骨|电子锁|骨锁|改造|手术|注射|测力器|测距球|能量棒)/],
  ['生物', /(雌豚|种猪|人肉足球)/],
  ['产品', /(勋章|高跟鞋|箱娘|驼鹿|恶媚|高挑淑女|炮机|药物箱|足球|跑车)/],
  ['地点', /(西城|雨夜|楼顶|天台|赛场|绿茵场)/],
  ['社会', /(社会法则|生命周期|社会核心机构|财富分配|贫富差距|媒体认为|教育)/],
  ['概念', /(劣化人|生态威胁|男权社会|性权利|优越性能力)/],
];

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\u3000/g, ' ')
    .trim();
}

function uniq(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const item = normalizeText(value);
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function stripPageNoise(line) {
  return normalizeText(line).replace(/^\d{1,2}\s*-{3,}\s*\d{1,2}\s*/, '').trim();
}

function cleanupTitle(rawTitle) {
  return normalizeText(rawTitle)
    .replace(/^《\s*/, '')
    .replace(/\s*》$/, '')
    .replace(/^["“”'']+|["“”'']+$/g, '')
    .replace(/[：:。！？；，,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanupBody(rawBody) {
  return String(rawBody ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isLikelySentence(text) {
  return /[。！？]/.test(text) || text.length > 30;
}

function isPropertyKey(text) {
  return PROPERTY_KEYS.has(text) || /^[（(]?[一二三四五六七八九十\d]+[）).、]/.test(text);
}

function isGenericHeading(text) {
  if (!text) {
    return true;
  }
  if (GENERIC_HEADINGS.has(text) || isPropertyKey(text)) {
    return true;
  }
  if (/^\d+$/.test(text) || /^\d{1,2}\s/.test(text) || /^NO\.\d+$/.test(text)) {
    return true;
  }
  if (/篇$/.test(text) && text.length <= 6) {
    return true;
  }
  return false;
}

function isTitleLike(text, { allowGeneric = false } = {}) {
  const title = cleanupTitle(text);
  if (!title) {
    return false;
  }
  if (title.length < 2 || title.length > 24) {
    return false;
  }
  if (/[。！？]/.test(title)) {
    return false;
  }
  if (isLikelySentence(title)) {
    return false;
  }
  if (!allowGeneric && isGenericHeading(title)) {
    return false;
  }
  if (/^[A-Za-z0-9 .,'&-]+$/.test(title)) {
    return title.length <= 20;
  }
  if (/[·•\-—]/.test(title) || /[A-Za-z]/.test(title) || /\d/.test(title)) {
    return true;
  }
  if (TITLE_SUFFIX_HINTS.some(suffix => title.endsWith(suffix) || title.includes(suffix))) {
    return true;
  }
  return hasCjk(title) && title.length <= 8;
}

function extractLeadingPhrase(text) {
  const line = normalizeText(text);
  if (!line) {
    return '';
  }
  const sentence = line.split(/[。！？；]/, 1)[0] ?? line;
  const candidate = cleanupTitle(sentence.split(/[，,]/, 1)[0] ?? sentence);
  if (candidate && candidate.length <= 24 && !isLikelySentence(candidate)) {
    return candidate;
  }
  const match = sentence.match(/^[\u3400-\u9fffA-Za-z0-9·\-]{2,24}/);
  return cleanupTitle(match?.[0] ?? '');
}

function shouldCombineCompositeTitle(left, right) {
  if (!right) {
    return false;
  }
  if (/^(空中小姐|女子警察|教官|控制手段|职场白领|女体充气娃娃)$/.test(right)) {
    return true;
  }
  return /^(帝国|敬国军|口袋公司|帝国南方航空)$/.test(left);
}

function parseCompositeTitle(left, right) {
  const leftTitle = cleanupTitle(left);
  const rightTitle = cleanupTitle(right);
  if (!isTitleLike(leftTitle, { allowGeneric: true }) || !isTitleLike(rightTitle, { allowGeneric: true })) {
    return null;
  }
  if (shouldCombineCompositeTitle(leftTitle, rightTitle)) {
    return {
      title: cleanupTitle(`${leftTitle}${rightTitle}`),
      aliases: uniq([rightTitle, `${leftTitle}·${rightTitle}`]),
      bodyStart: '',
    };
  }
  return {
    title: rightTitle,
    aliases: uniq([leftTitle, `${leftTitle}${rightTitle}`]),
    bodyStart: '',
  };
}

function parseInlineCandidate(line) {
  const cleaned = stripPageNoise(line);
  if (!cleaned) {
    return null;
  }

  let match = cleaned.match(/^NO\.\d+\s*[：:]\s*([^。！？；，,]{2,24})([。！？；，,]?\s*.*)$/);
  if (match) {
    const title = cleanupTitle(match[1]);
    return isTitleLike(title, { allowGeneric: true })
      ? { title, aliases: [], bodyStart: cleanupBody(match[2]) }
      : null;
  }

  match = cleaned.match(/^《([^》]{2,24})》\s*[：:]\s*(.+)$/);
  if (match) {
    const title = cleanupTitle(match[1]);
    return isTitleLike(title, { allowGeneric: true })
      ? { title, aliases: [], bodyStart: cleanupBody(match[2]) }
      : null;
  }

  match = cleaned.match(/^([A-Za-z][A-Za-z0-9 '&./-]{1,40})\s*[—-]+\s*([\u3400-\u9fffA-Za-z0-9·\-]{2,24})(.*)$/);
  if (match) {
    const title = cleanupTitle(match[2]);
    if (isTitleLike(title, { allowGeneric: true })) {
      return {
        title,
        aliases: uniq([cleanupTitle(match[1])]),
        bodyStart: cleanupBody(match[3]),
      };
    }
  }

  match = cleaned.match(/^([A-Za-z][A-Za-z0-9 '&./-]{1,40})\s+([\u3400-\u9fff][^\n]{1,24})$/);
  if (match) {
    const title = cleanupTitle(match[2]);
    if (isTitleLike(title, { allowGeneric: true })) {
      return {
        title,
        aliases: uniq([cleanupTitle(match[1])]),
        bodyStart: '',
      };
    }
  }

  match = cleaned.match(/^([^：:]{1,16})[·•]([^：:]{1,20})$/);
  if (match) {
    return parseCompositeTitle(match[1], match[2]);
  }

  match = cleaned.match(/^([^：:]{1,24})\s*[：:]\s*(.+)$/);
  if (match) {
    const left = cleanupTitle(match[1]);
    const right = cleanupBody(match[2]);
    if (TITLE_VALUE_KEYS.has(left)) {
      const title = extractLeadingPhrase(right);
      if (isTitleLike(title, { allowGeneric: true })) {
        const aliases = [];
        const stemMatch = title.match(/^([\u3400-\u9fffA-Za-z]+?)[-A-Z]?\d{1,3}$/);
        if (stemMatch && stemMatch[1] !== title) {
          aliases.push(cleanupTitle(stemMatch[1]));
        }
        return { title, aliases: uniq(aliases), bodyStart: right };
      }
      return null;
    }
    if (isTitleLike(left)) {
      return { title: left, aliases: [], bodyStart: right };
    }
  }

  match = cleaned.match(/^(?:这本)?《([^》]{2,24})》(.{20,})$/);
  if (match) {
    const title = cleanupTitle(match[1]);
    if (isTitleLike(title, { allowGeneric: true })) {
      return { title, aliases: [], bodyStart: cleaned };
    }
  }

  return null;
}

function parseStandaloneCandidate(line) {
  const cleaned = stripPageNoise(line);
  if (!isTitleLike(cleaned)) {
    return null;
  }
  return { title: cleanupTitle(cleaned), aliases: [], bodyStart: '' };
}

function trimBodyLines(lines) {
  const items = [...lines];
  while (items.length > 0 && !normalizeText(items[0])) {
    items.shift();
  }
  while (items.length > 0 && !normalizeText(items[items.length - 1])) {
    items.pop();
  }
  return items;
}

function collectCandidateBody(lines, startIndex, bodyStart) {
  const bodyLines = [];
  if (normalizeText(bodyStart)) {
    bodyLines.push(cleanupBody(bodyStart));
  }

  let index = startIndex + 1;
  while (index < lines.length) {
    const rawLine = lines[index];
    const line = stripPageNoise(rawLine);

    if (!line) {
      if (bodyLines.length > 0) {
        bodyLines.push('');
      }
      index += 1;
      continue;
    }

    const inlineCandidate = parseInlineCandidate(line);
    const standaloneCandidate = parseStandaloneCandidate(line);
    if ((inlineCandidate || standaloneCandidate) && bodyLines.length > 0) {
      break;
    }

    bodyLines.push(line);
    index += 1;
  }

  return {
    nextIndex: index,
    body: cleanupBody(trimBodyLines(bodyLines).join('\n')),
  };
}

function splitParagraphs(text) {
  return cleanupBody(text)
    .split(/\n{2,}/)
    .map(item => cleanupBody(item))
    .filter(Boolean);
}

function summarizeFromParagraphs(paragraphs) {
  let excerpt = '';
  for (const paragraph of paragraphs) {
    const normalized = cleanupBody(paragraph);
    if (!normalized) {
      continue;
    }
    excerpt = excerpt ? `${excerpt}\n\n${normalized}` : normalized;
    if (normalizeText(excerpt).length >= 90) {
      break;
    }
  }
  excerpt = cleanupBody(excerpt);

  let summary = '';
  const flatText = normalizeText(excerpt);
  const sentences = excerpt
    .split(/(?<=[。！？；])/)
    .map(item => normalizeText(item))
    .filter(Boolean);

  for (const sentence of sentences) {
    const next = normalizeText(summary ? `${summary}${sentence}` : sentence);
    if (next.length > 180) {
      break;
    }
    summary = summary ? `${summary}${sentence}` : sentence;
    if (summary.length >= 60) {
      break;
    }
  }

  if (!summary) {
    summary = flatText.slice(0, 180);
  }
  if (summary.length < 60 && flatText.length > summary.length) {
    summary = flatText.slice(0, Math.min(180, Math.max(60, flatText.length)));
  }
  if (summary.length > 180) {
    const cut = summary.slice(0, 180).search(/[。！？；](?!.*[。！？；])/);
    summary = cut > 50 ? summary.slice(0, cut + 1) : `${summary.slice(0, 179)}…`;
  }

  return {
    summary: normalizeText(summary),
    sourceExcerpt: excerpt,
  };
}

function buildDetails(paragraphs) {
  return cleanupBody(paragraphs.slice(0, 3).join('\n\n')).slice(0, 1200);
}

function inferCategory(title, body) {
  const probe = `${title}\n${body}`;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(probe)) {
      return category;
    }
  }
  if (/图$/.test(title)) {
    return '势力';
  }
  if (/书$/.test(title)) {
    return '文化';
  }
  return '概念';
}

function splitKeywords(text) {
  return String(text ?? '')
    .split(/[、，,;；/|·•\s()（）]+/)
    .map(item => cleanupTitle(item))
    .filter(Boolean);
}

function buildAliases(title, aliases) {
  const result = [...aliases];
  const modelStem = title.match(/^([\u3400-\u9fffA-Za-z]+?)[-A-Z]?\d{1,3}$/);
  if (modelStem && modelStem[1] !== title) {
    result.push(modelStem[1]);
  }
  return uniq(
    result.filter(alias => alias && alias !== title && alias.length <= 16 && !GENERIC_TRIGGERS.has(alias)),
  );
}

function buildImageKeywords(title, aliases, category) {
  const parts = uniq([
    title,
    ...aliases,
    ...splitKeywords(title),
    ...aliases.flatMap(alias => splitKeywords(alias)),
    category,
  ]);
  return parts.filter(item => item.length <= 24);
}

function buildId(segmentIndex, title) {
  const slug = cleanupTitle(title)
    .replace(/[^\w\u3400-\u9fff-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `comic-s${String(segmentIndex).padStart(2, '0')}-${slug || 'entry'}`;
}

function isTriggerAllowed(token) {
  const trigger = cleanupTitle(token);
  if (!trigger || trigger.length < 2 || trigger.length > 16) {
    return false;
  }
  if (GENERIC_TRIGGERS.has(trigger)) {
    return false;
  }
  if (/^[A-Za-z ]+$/.test(trigger) && trigger.length < 4) {
    return false;
  }
  if (/^(第|这|那|一个|一种|一些)/.test(trigger)) {
    return false;
  }
  if (/(公司|产品|设施|技术|社会|文化|职业|组织|势力|制度|地点|事件)$/.test(trigger)) {
    return false;
  }
  return true;
}

function buildTriggers(title, aliases) {
  return uniq([title, ...aliases]).filter(isTriggerAllowed);
}

function resolveDuplicateTriggers(entries) {
  const owners = new Map();
  let duplicateTriggerCount = 0;

  function score(entry, trigger) {
    let value = 0;
    if (entry.title === trigger) {
      value += 100;
    }
    value += Math.min(entry.title.length, 20);
    value += Math.min(trigger.length, 16);
    if (/[·\-A-Za-z0-9]/.test(trigger)) {
      value += 5;
    }
    return value;
  }

  for (const entry of entries) {
    for (const trigger of entry.triggers) {
      const current = owners.get(trigger);
      if (!current || score(entry, trigger) > current.score) {
        owners.set(trigger, { id: entry.id, score: score(entry, trigger) });
      }
    }
  }

  for (const entry of entries) {
    const filtered = entry.triggers.filter(trigger => {
      const owner = owners.get(trigger);
      if (!owner) {
        return false;
      }
      const keep = owner.id === entry.id;
      if (!keep) {
        duplicateTriggerCount += 1;
      }
      return keep;
    });
    entry.triggers = filtered;
    entry.autoLink = filtered.length > 0;
  }

  return duplicateTriggerCount;
}

function scanSegment(segmentText, segmentIndex, sourceFile) {
  const lines = segmentText.split(/\r?\n/);
  const entries = [];
  let index = 0;

  while (index < lines.length) {
    const line = stripPageNoise(lines[index]);
    if (!line) {
      index += 1;
      continue;
    }

    const candidate = parseInlineCandidate(line) ?? parseStandaloneCandidate(line);
    if (!candidate) {
      index += 1;
      continue;
    }

    const { body, nextIndex } = collectCandidateBody(lines, index, candidate.bodyStart);
    index = nextIndex;

    const paragraphs = splitParagraphs(body);
    if (paragraphs.length === 0) {
      continue;
    }

    const { summary, sourceExcerpt } = summarizeFromParagraphs(paragraphs);
    if (summary.length < 45) {
      continue;
    }

    const title = cleanupTitle(candidate.title);
    const aliases = buildAliases(title, candidate.aliases);
    const details = buildDetails(paragraphs);
    const entry = {
      id: buildId(segmentIndex, title),
      title,
      category: inferCategory(title, details),
      aliases,
      triggers: buildTriggers(title, aliases),
      summary,
      details,
      sourceExcerpt,
      sourceFile,
      sourceSegmentIndex: segmentIndex,
      imageKeywords: buildImageKeywords(title, aliases, inferCategory(title, details)),
      autoLink: true,
    };
    entries.push(entry);
  }

  return entries;
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultInputPath;
  const outputPath = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : defaultOutputPath;
  const rawText = await fs.readFile(inputPath, 'utf8');
  const sourceFile = toPosix(path.relative(repoRoot, inputPath));
  const segments = rawText
    .split(/\r?\n\s*---\s*\r?\n/g)
    .map(item => item.trim())
    .filter(Boolean);

  const entries = [];
  let validSegments = 0;
  let shortSummaryCount = 0;

  segments.forEach((segment, segmentIndex) => {
    const segmentEntries = scanSegment(segment, segmentIndex, sourceFile);
    if (segmentEntries.length > 0) {
      validSegments += 1;
    }
    for (const entry of segmentEntries) {
      if (entry.summary.length < 60) {
        shortSummaryCount += 1;
      }
      entries.push(entry);
    }
  });

  const duplicateTriggerCount = resolveDuplicateTriggers(entries);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        sourceFile,
        outputFile: toPosix(path.relative(repoRoot, outputPath)),
        totalSegments: segments.length,
        validSegments,
        entryCount: entries.length,
        shortSummaryCount,
        duplicateTriggerCount,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
