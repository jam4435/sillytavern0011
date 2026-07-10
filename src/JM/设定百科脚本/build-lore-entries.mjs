import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const characterRoot = path.join(repoRoot, '角色卡/JM帝国');
const indexPath = path.join(characterRoot, 'index.yaml');
const outputPath = path.join(__dirname, 'lore-entries.json');

const allowedCategoryHints = [
  '世界观元数据',
  '核心规则',
  '规则详情',
  '法律详情',
  '比赛规则详情',
  '势力详情',
  '势力总览',
  '组织详情',
  '机构详情',
  '机构总览',
  '人物详情',
  '人物档案',
  '职业详情',
  '帝国职业体系',
  '产品详情',
  '产品档案',
  '产品系列详情',
  '技术详情',
  '事件详情',
  '赛事详情',
  '场所详情',
  '设施详情',
  '地点详情',
  '道具详情',
  '装备详情',
  '设备详情',
  '制度详情',
  '历史详情',
  '历史背景',
  '文化详情',
  '流程详情',
  '概念详情',
  '现象详情',
  '生物详情',
  '产业详情',
  '教学详情',
  '训练详情',
  '娱乐详情',
  '物品详情',
  '社会详情',
  '单位详情',
  '女畜详情',
  '改造单位',
  '改造单位详情',
  '达维娜系统',
  '人体改造技术',
  '女体家具',
  '女体化公共设施',
  '女性生命周期',
  '帝国仪式',
  '帝国娱乐',
];

const excludedPatterns = [
  /cot/i,
  /输出提示词/,
  /变量指导/,
  /user指导/i,
  /行动建议/,
  /状态栏/,
  /高难身份路线/,
  /文风/,
  /LLM抗/,
  /亲密度/,
  /男user规则/i,
];

const excludedContentPatterns = [
  /<%/,
  /<Variable_Format>/i,
  /<writing_style>/i,
  /<Card_CoT>/i,
  /<options>/i,
  /#user经历和遭遇的指导/,
];

const stopAutoLinkTerms = new Set([
  '帝国',
  '女性',
  '男性',
  '世界',
  '组织',
  '势力',
  '规则',
  '法律',
  '职业',
  '产品',
  '设施',
  '技术',
  '事件',
  '人物',
  '地点',
  '女体',
  '组织',
  '机构',
  '社会',
  '场所',
  '地点',
  '道具',
  '物品',
  '装备',
  '设备',
  '法则',
  '制度',
  '流程',
  '文化',
  '历史',
  '概念',
  '现象',
  '详情',
  '总览',
  '概览',
  '档案',
  '体系',
  '元数据',
  '提示词',
  '文风',
  '指导',
  '模型',
  '性奴',
  '奴隶',
  '世界信息',
  '核心设定',
  '核心规则',
]);

const yamlSummaryKeys = [
  'summary',
  '简介',
  '概述',
  'description',
  '描述',
  'core_concept',
  'core_principle',
  'core_rule',
  'core_business',
  'primary_function',
  'overview',
  'background',
  'reputation',
  'target_group',
  '核心概念',
  '核心原则',
  'type',
  '类型',
  '设计理念',
  '背景故事',
  '功能',
  'purpose',
  '用途',
  '定义',
];

const normalizeSlash = value => String(value ?? '').replace(/\\/g, '/');

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipSummary(value, maxLength = 150) {
  const text = normalizeText(value)
    .replace(/^[-*]\s*/, '')
    .replace(/^["'“”]+|["'“”]+$/g, '');
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).replace(/[，。；、,.:\s]+$/u, '')}...`;
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  values
    .map(value => normalizeText(value))
    .filter(Boolean)
    .forEach(value => {
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    });
  return result;
}

function stripKnownSuffix(value) {
  return value
    .replace(/\.(ya?ml|txt)$/i, '')
    .replace(/_省token版$/u, '')
    .replace(/_详细版$/u, '')
    .replace(/_详细$/u, '')
    .replace(/_总览$/u, '总览')
    .replace(/_$/u, '')
    .trim();
}

function splitCategoryAndTitle(entryName, fileName) {
  const candidates = [entryName, stripKnownSuffix(fileName)];
  for (const candidate of candidates) {
    const cleaned = stripKnownSuffix(candidate).replace(/_/g, ' ').trim();
    const separatorMatch = cleaned.match(/^(.+?)\s*[-:：]\s*(.+)$/u);
    if (separatorMatch) {
      return {
        category: normalizeText(separatorMatch[1]),
        title: normalizeText(separatorMatch[2]),
      };
    }

    const doubleUnderscoreMatch = stripKnownSuffix(candidate).match(/^(.+?)__([^_]+)(?:_.+)?$/u);
    if (doubleUnderscoreMatch) {
      return {
        category: normalizeText(doubleUnderscoreMatch[1].replace(/_/g, ' ')),
        title: normalizeText(doubleUnderscoreMatch[2]),
      };
    }

    const detailMatch = stripKnownSuffix(candidate).match(/^(.+?)_-_(.+)$/u);
    if (detailMatch) {
      return {
        category: normalizeText(detailMatch[1]),
        title: normalizeText(detailMatch[2]),
      };
    }
  }

  return {
    category: normalizeText(entryName.split(/\s+/u)[0] || '设定'),
    title: normalizeText(stripKnownSuffix(entryName || fileName)),
  };
}

function isAllowedEntry(entryName, sourceFile) {
  const target = `${entryName} ${sourceFile}`;
  if (excludedPatterns.some(pattern => pattern.test(target))) {
    return false;
  }
  return allowedCategoryHints.some(hint => target.includes(hint));
}

async function resolveSourceFile(sourceFile) {
  const normalized = normalizeSlash(sourceFile);
  const basePath = path.join(characterRoot, normalized);
  const candidates = [basePath, `${basePath}.yaml`, `${basePath}.yml`, `${basePath}.txt`];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next extension.
    }
  }
  return null;
}

function valueToSummary(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clipSummary(value);
  }
  if (Array.isArray(value)) {
    return clipSummary(value.map(item => valueToSummary(item)).filter(Boolean).join('；'));
  }
  if (typeof value === 'object') {
    return clipSummary(
      Object.entries(value)
        .slice(0, 4)
        .map(([key, item]) => `${key}: ${valueToSummary(item)}`)
        .filter(Boolean)
        .join('；'),
    );
  }
  return '';
}

function extractYamlSummary(text) {
  let data;
  try {
    data = YAML.parse(text);
  } catch {
    return '';
  }
  if (!data || typeof data !== 'object') {
    return '';
  }

  for (const key of yamlSummaryKeys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const summary = valueToSummary(data[key]);
      if (summary) {
        return summary;
      }
    }
  }

  const firstUsefulEntry = Object.entries(data).find(([key, value]) => {
    if (/^(name|名称|id|manufacturer|制造商)$/iu.test(key)) {
      return false;
    }
    return valueToSummary(value).length >= 12;
  });
  return firstUsefulEntry ? valueToSummary(firstUsefulEntry[1]) : '';
}

function extractTextSummary(text) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#'))
    .filter(line => !/^<\/?[^>]+>$/.test(line))
    .filter(line => !/^(<%|%>)/.test(line));

  for (const line of lines) {
    const bracketMatch = line.match(/^\[([^:：\]]+)[:：]\s*([^\]]+)\]$/u);
    if (bracketMatch) {
      return clipSummary(`${bracketMatch[1]}：${bracketMatch[2]}`);
    }
    if (line.length >= 12 && !line.includes('{{') && !line.includes('<state')) {
      return clipSummary(line.replace(/^[\s\-*]+/u, ''));
    }
  }
  return '';
}

function buildAliases({ title, entryName, keywords, fileName }) {
  const fileTitle = splitCategoryAndTitle(entryName, fileName).title;
  const baseAliases = uniqueStrings([
    title,
    fileTitle,
    entryName,
    stripKnownSuffix(fileName),
    ...keywords,
  ]);
  const normalizedAliases = baseAliases.flatMap(alias => {
    const noMiddleDot = alias.replace(/[·・\s]/gu, '');
    const noDecorators = alias.replace(/[《》“”"']/gu, '');
    const modelMatch = alias.match(/\b[A-Z]+[- ][A-Z0-9]+|\b[A-Z]-[A-Z0-9]+\b/iu);
    return [alias, noMiddleDot, noDecorators, modelMatch?.[0] ?? ''];
  });
  return uniqueStrings(normalizedAliases).filter(alias => alias.length >= 2);
}

function shouldAutoLink(entry) {
  const candidates = [entry.title, ...entry.aliases].filter(alias => alias.length >= 3);
  return candidates.some(alias => !stopAutoLinkTerms.has(alias));
}

async function main() {
  const indexText = await fs.readFile(indexPath, 'utf8');
  const indexData = YAML.parse(indexText);
  const entries = Array.isArray(indexData?.['条目']) ? indexData['条目'] : [];

  const loreEntries = [];
  const usedIds = new Set();

  for (const entry of entries) {
    const entryName = normalizeText(entry?.['名称']);
    const sourceFile = normalizeSlash(entry?.['文件']);
    if (!entryName || !sourceFile || !isAllowedEntry(entryName, sourceFile)) {
      continue;
    }

    const sourcePath = await resolveSourceFile(sourceFile);
    if (!sourcePath) {
      continue;
    }

    const fileText = await fs.readFile(sourcePath, 'utf8');
    if (excludedContentPatterns.some(pattern => pattern.test(fileText))) {
      continue;
    }
    const fileName = path.basename(sourcePath);
    const { category, title } = splitCategoryAndTitle(entryName, fileName);
    const keywords = Array.isArray(entry?.['激活策略']?.['关键字']) ? entry['激活策略']['关键字'] : [];
    const aliases = buildAliases({ title, entryName, keywords, fileName });
    const relativeSource = normalizeSlash(path.relative(repoRoot, sourcePath));
    const idBase = stripKnownSuffix(normalizeSlash(sourceFile).replace(/^世界书\//u, '')).replace(/[^\p{Letter}\p{Number}]+/gu, '_');
    let id = idBase;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${idBase}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    const isYaml = /\.ya?ml$/i.test(sourcePath);
    const summary = isYaml ? extractYamlSummary(fileText) : extractTextSummary(fileText);
    const loreEntry = {
      id,
      title,
      category,
      aliases,
      summary: summary || `${title}：来自 JM 帝国世界书的设定词条，建议后续人工补充精简摘要。`,
      sourceFile: relativeSource,
      imageKeywords: uniqueStrings([title, ...aliases]).filter(alias => alias.length >= 3 && !stopAutoLinkTerms.has(alias)).slice(0, 4),
      autoLink: true,
    };
    loreEntry.autoLink = shouldAutoLink(loreEntry);
    loreEntries.push(loreEntry);
  }

  loreEntries.sort((a, b) => a.category.localeCompare(b.category, 'zh-Hans-CN') || a.title.localeCompare(b.title, 'zh-Hans-CN'));
  await fs.writeFile(outputPath, `${JSON.stringify(loreEntries, null, 2)}\n`, 'utf8');
  console.info(`Generated ${loreEntries.length} lore entries -> ${path.relative(repoRoot, outputPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
