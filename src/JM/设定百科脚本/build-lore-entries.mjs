import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const indexPath = path.join(repoRoot, '角色卡', 'JM帝国', 'index.yaml');
const outputPath = path.join(scriptDir, 'lore-entries.json');

const CATEGORY_PREFIXES = [
  '人物',
  '组织',
  '职业',
  '产品',
  '设施',
  '道具',
  '物品',
  '地点',
  '事件',
  '技术',
  '规则',
  '法律',
  '概念',
  '生物',
  '机构',
  '势力',
  '改造单位',
  '女畜',
  '单位',
  '文化',
  '历史',
  '流程',
  '训练',
  '教学',
  '社会',
  '娱乐',
  '赛事',
  '制度',
  '设备',
  '系统',
];

const EXCLUDE_TOKENS = [
  'cot',
  '输出提示词',
  '变量指导',
  'user指导',
  '行动建议',
  '状态栏',
  '高难身份路线',
];

const SUMMARY_KEYS = [
  'description',
  '概述',
  'summary',
  '介绍',
  '说明',
  '背景',
  'background',
  '定位',
  '用途',
  'location',
  'primary_function',
  'purpose',
  'type',
  'product_type',
  'Product_positioning',
  'core_rule',
  'target_group',
];

const TITLE_KEYS = [
  'name',
  '名称',
  'title',
  '产品名称',
  '产品名',
  '产品型号',
  '产品系列',
  '设备名称',
];

const ALIAS_KEYS = [
  'aliases',
  '别称',
  '别名',
];

const GENERIC_NO_AUTOLINK = new Set([
  '帝国',
  '女性',
  '男性',
  '世界观',
  '世界书',
  '元数据',
]);

function toPosix(relPath) {
  return relPath.replace(/\\/g, '/');
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniq(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const text = normalizeText(value);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

function splitKeywords(text) {
  return String(text ?? '')
    .split(/[、，,;；/|·•\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function cleanLabel(label) {
  const raw = normalizeText(label);
  if (!raw) {
    return '';
  }
  const withoutWrapper = raw.replace(/^<\s*/, '').replace(/\s*>$/, '').replace(/^#\s*/, '');
  const categoryMatch = withoutWrapper.match(
    new RegExp(
      `^((?:${CATEGORY_PREFIXES.map(escapeRegExp).join('|')})(?:档案|详情|总览|概览|体系|背景)?)\\s*(?:[-－_：:]+\\s*)?(.*)$`,
    ),
  );
  if (categoryMatch && normalizeText(categoryMatch[2])) {
    return normalizeText(categoryMatch[2]);
  }
  const slashSplit = withoutWrapper.split(/\s*[-－]\s*|_{1,3}/).map(item => item.trim()).filter(Boolean);
  if (slashSplit.length > 1) {
    return slashSplit[slashSplit.length - 1];
  }
  return withoutWrapper.trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readScalarFromObject(source, keys) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return undefined;
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readAliasesFromObject(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [];
  }
  for (const key of ALIAS_KEYS) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.flatMap(item => splitKeywords(item));
    }
    if (typeof value === 'string' && value.trim()) {
      return splitKeywords(value);
    }
  }
  return [];
}

function tryParseYaml(text) {
  try {
    const parsed = YAML.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall back to line scanning for the mixed txt formats in this worldbook.
  }
  return null;
}

function extractBlockValue(lines, startIndex) {
  const startLine = lines[startIndex] ?? '';
  const baseIndent = (startLine.match(/^\s*/)?.[0].length ?? 0);
  const collected = [];
  let sawContent = false;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      if (sawContent) {
        collected.push('');
      }
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= baseIndent) {
      break;
    }
    sawContent = true;
    collected.push(line.slice(Math.min(line.length, baseIndent + 2)).trimEnd());
  }
  return normalizeText(collected.join('\n'));
}

function extractScalarFromLines(text, keys) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const key of keys) {
      const match = line.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*[:：]\\s*(.*)$`));
      if (!match) {
        continue;
      }
      const rest = match[1].trim();
      if (rest === '|' || rest === '>-'
        || rest === '|-'
        || rest === '>') {
        const block = extractBlockValue(lines, index);
        if (block) {
          return block;
        }
      }
      if (rest) {
        return normalizeText(rest.replace(/^['"]|['"]$/g, ''));
      }
    }
  }
  return undefined;
}

function extractTitleAndAliases(text) {
  const parsed = tryParseYaml(text);
  const title = normalizeText(readScalarFromObject(parsed, TITLE_KEYS));
  const aliases = readAliasesFromObject(parsed);
  return {
    title: title || undefined,
    aliases,
  };
}

function extractHeaderTitle(text) {
  const firstRelevant = text.split(/\r?\n/).find(line => normalizeText(line));
  if (!firstRelevant) {
    return undefined;
  }
  const tagMatch = firstRelevant.match(/^<\s*([^>]+?)\s*>$/);
  if (tagMatch) {
    return normalizeText(tagMatch[1]);
  }
  const headerMatch = firstRelevant.match(/^#\s*([^:：]+?)\s*[:：]\s*(.+)$/);
  if (headerMatch) {
    return normalizeText(headerMatch[2]);
  }
  return undefined;
}

function extractSummary(text) {
  const parsed = tryParseYaml(text);
  const parsedSummary = normalizeText(readScalarFromObject(parsed, SUMMARY_KEYS));
  if (parsedSummary) {
    return shortenSummary(parsedSummary);
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed)) {
      if (['name', '名称', 'title', ...ALIAS_KEYS].includes(key)) {
        continue;
      }
      if (typeof value === 'string' && value.trim()) {
        return shortenSummary(value);
      }
    }
  }

  const scalarSummary = extractScalarFromLines(text, SUMMARY_KEYS);
  if (scalarSummary) {
    return shortenSummary(scalarSummary);
  }

  const lines = text.split(/\r?\n/);
  const paragraph = [];
  let seenBody = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    if (
      trimmed.startsWith('<') ||
      trimmed.startsWith('#') ||
      /^(name|名称|title|aliases|别称|别名|type|类别|产品名称|产品名|定位|目标|制造商|price|primary_function|background|description|概述|summary|介绍|说明|用途|core_rule|target_group|requirements|modifications|special_services|components|working_principle|usage_protocol)\s*[:：]/i.test(trimmed)
    ) {
      if (!seenBody) {
        continue;
      }
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    seenBody = true;
    paragraph.push(trimmed);
  }
  return shortenSummary(normalizeText(paragraph.join(' ')));
}

function shortenSummary(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return '';
  }
  const maxLength = 100;
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const punctuation = ['。', '！', '？', '.', '!', '?', '；', ';'];
  for (const mark of punctuation) {
    const cut = normalized.slice(0, maxLength).lastIndexOf(mark);
    if (cut > 30) {
      return normalized.slice(0, cut + 1);
    }
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function inferCategoryFromText(entryName, sourceStem, sourceText, title) {
  const label = `${entryName} ${sourceStem} ${title} ${sourceText.slice(0, 200)}`;
  if (/^世界观元数据/.test(sourceStem) || /^世界观元数据/.test(entryName)) {
    return null;
  }
  if (/^人物/.test(sourceStem) || /^人物/.test(entryName)) return '人物';
  if (/^组织/.test(sourceStem) || /^组织/.test(entryName)) return '组织';
  if (/^职业/.test(sourceStem) || /^职业/.test(entryName)) return '职业';
  if (/^产品/.test(sourceStem) || /^产品/.test(entryName)) return '产品';
  if (/^设施/.test(sourceStem) || /^设施/.test(entryName)) return '设施';
  if (/^道具/.test(sourceStem) || /^道具/.test(entryName)) return '道具';
  if (/^物品/.test(sourceStem) || /^物品/.test(entryName)) return '物品';
  if (/^地点/.test(sourceStem) || /^场所/.test(entryName) || /^地点/.test(entryName)) return '地点';
  if (/^事件/.test(sourceStem) || /^事件/.test(entryName)) return '事件';
  if (/^技术/.test(sourceStem) || /^技术/.test(entryName)) return '技术';
  if (/^规则/.test(sourceStem) || /^规则/.test(entryName)) return '规则';
  if (/^法律/.test(sourceStem) || /^法律/.test(entryName)) return '法律';
  if (/^概念/.test(sourceStem) || /^概念/.test(entryName)) return '概念';
  if (/^生物/.test(sourceStem) || /^生物/.test(entryName)) return '生物';
  if (/^机构/.test(sourceStem) || /^机构/.test(entryName)) return '机构';
  if (/^势力/.test(sourceStem) || /^势力/.test(entryName)) return '势力';
  if (/^改造单位/.test(sourceStem) || /^改造单位/.test(entryName)) return '改造单位';
  if (/^女畜/.test(sourceStem) || /^女畜/.test(entryName)) return '女畜';
  if (/^单位/.test(sourceStem) || /^单位/.test(entryName)) return '单位';
  if (/^文化/.test(sourceStem) || /^文化/.test(entryName)) return '文化';
  if (/^历史/.test(sourceStem) || /^历史/.test(entryName)) return '历史';
  if (/^流程/.test(sourceStem) || /^流程/.test(entryName)) return '流程';
  if (/^训练/.test(sourceStem) || /^训练/.test(entryName)) return '训练';
  if (/^教学/.test(sourceStem) || /^教学/.test(entryName)) return '教学';
  if (/^社会/.test(sourceStem) || /^社会/.test(entryName)) return '社会';
  if (/^娱乐/.test(sourceStem) || /^娱乐/.test(entryName)) return '娱乐';
  if (/^赛事/.test(sourceStem) || /^赛事/.test(entryName)) return '赛事';
  if (/^制度/.test(sourceStem) || /^制度/.test(entryName)) return '制度';
  if (/^设备/.test(sourceStem) || /^设备/.test(entryName)) return '设备';
  if (/^系统/.test(sourceStem) || /^系统/.test(entryName)) return '系统';

  if (/革命军/.test(label)) return '势力';
  if (/军事组织|姐妹会|朝圣者|狂欢者/.test(label)) return '组织';
  if (/阿肯托尔/.test(label)) return '组织';
  if (/箱娘|军用慰安妇/.test(label)) return '单位';
  if (/帝国代表性职业体系/.test(label)) return '职业';
  if (/女性生命周期|社会法则|职业体系|生育体系|风俗总览|社会核心机构/.test(label)) {
    return '社会';
  }
  if (/^\s*<.+>\s*$/.test(sourceText.split(/\r?\n/).find(line => normalizeText(line)) ?? '')) {
    return null;
  }
  return null;
}

function shouldExclude(entryName, sourceStem, title) {
  const probe = [entryName, sourceStem, title].filter(Boolean).join(' ');
  return EXCLUDE_TOKENS.some(token => probe.includes(token));
}

function buildId(sourceRelativePath, title) {
  const stem = sourceRelativePath.replace(/\.[^.]+$/, '');
  return stem
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fff/.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || normalizeText(title);
}

function buildImageKeywords(title, aliases, category, indexLabel) {
  const keywords = [
    title,
    ...aliases,
    indexLabel && indexLabel !== title ? indexLabel : '',
    category,
  ];
  for (const item of [...aliases, title, indexLabel]) {
    for (const token of splitKeywords(item)) {
      keywords.push(token);
    }
  }
  return uniq(keywords.filter(Boolean));
}

function shouldAutoLink(title, aliases) {
  const probe = [title, ...aliases];
  if (probe.some(item => GENERIC_NO_AUTOLINK.has(item))) {
    return false;
  }
  return true;
}

function resolveWorldbookFile(relativeReference) {
  const normalized = relativeReference.replace(/\\/g, path.sep).replace(/^\/+/, '');
  const directPath = path.join(repoRoot, '角色卡', 'JM帝国', normalized);
  const candidates = path.extname(directPath)
    ? [directPath]
    : [ `${directPath}.yaml`, `${directPath}.yml`, `${directPath}.txt` ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function main() {
  const indexText = await fs.readFile(indexPath, 'utf8');
  const indexData = YAML.parse(indexText);
  const entries = Array.isArray(indexData?.条目) ? indexData.条目 : [];
  const results = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const entryName = normalizeText(entry.名称 ?? entry.name ?? '');
    const sourceReference = normalizeText(entry.文件 ?? entry.file ?? '');
    if (!entryName || !sourceReference) {
      continue;
    }
    const sourcePath = resolveWorldbookFile(sourceReference);
    if (!sourcePath) {
      continue;
    }
    const sourceText = await fs.readFile(sourcePath, 'utf8');
    const sourceStem = path.basename(sourcePath, path.extname(sourcePath));
    const parsed = extractTitleAndAliases(sourceText);
    const headerTitle = extractHeaderTitle(sourceText);
    const title = normalizeText(parsed.title || headerTitle || cleanLabel(entryName) || cleanLabel(sourceStem));
    const category = inferCategoryFromText(entryName, sourceStem, sourceText, title);
    if (!category) {
      continue;
    }
    if (shouldExclude(entryName, sourceStem, title)) {
      continue;
    }
    const rawAliases = uniq([
      ...parsed.aliases,
      cleanLabel(entryName),
      cleanLabel(sourceStem),
    ]);
    const aliases = rawAliases.filter(alias => alias && alias !== title);
    const summary = extractSummary(sourceText);
    results.push({
      id: buildId(toPosix(path.relative(repoRoot, sourcePath)), title),
      title,
      category,
      aliases,
      summary,
      sourceFile: toPosix(path.relative(repoRoot, sourcePath)),
      imageKeywords: buildImageKeywords(title, aliases, category, cleanLabel(entryName)),
      autoLink: shouldAutoLink(title, aliases),
    });
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  console.log(`Generated ${results.length} lore entries -> ${toPosix(path.relative(repoRoot, outputPath))}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
