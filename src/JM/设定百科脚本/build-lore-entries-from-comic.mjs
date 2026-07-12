/* eslint-disable import-x/no-nodejs-modules */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const sourceRelativePath = '信息/jm帝国漫画的完整提取文字.txt';
const sourcePath = path.join(repoRoot, ...sourceRelativePath.split('/'));
const generatedPath = path.join(scriptDir, 'lore-entries.comic.generated.json');
const finalPath = path.join(scriptDir, 'lore-entries.json');
const curationPath = path.join(scriptDir, 'lore-entries.curation.json');
const applyToFinal = process.argv.includes('--apply');

const fieldLabels = new Set([
  '年龄',
  '身高',
  '体重',
  '胸围',
  '腰围',
  '臀围',
  '处女',
  '性经验',
  '婚姻',
  '孕育',
  '姓名',
  '编号',
  '电话',
  '传真',
  '生产日期',
  '生产地址',
  '产品标准号',
  '符合产品标准',
  '食签认字',
  '类型',
  '型号',
  '学名',
  '别名',
  '产地',
  '体型',
  '工作年龄',
  '床技',
  '近期月经',
  '怀孕几率',
  '受孕几率',
  '经期',
  '三围',
  '肉改',
  '班级',
  '口服药物',
  '服务人数',
  '服务时间',
  '工号',
  '证件',
  '售价',
  '制造商',
  '生产注册地址',
  '身体状态',
  '生产方式',
  '综合评级',
  '产品规格',
  '品名',
  '食用方法',
  '女性职员着装要求',
  '处女年龄',
  '堕胎次数',
  '深喉极限',
  '阴道深度',
  '阴道弹性',
  '阴道类型',
  '菊花深度',
  '菊花弹性',
  '手机号',
  '微信',
  '出生地',
  '工作单位',
  '工作地点',
  '家庭住址',
  '思想',
  '工作特性',
  '注意事项',
  '职位应聘标准',
  '职位标准',
  '身体改造与工作形态',
  '收纳方式',
  '必备证件',
  '颁发条件',
  '服务协议',
]);

const metaTitles = new Set([
  '目录',
  '引言',
  '前言',
  '后记',
  '告知圣女教',
  '职业',
  '短漫画',
  '废弃选项',
  '母狗百科',
  '注意事项',
  '颁发条件',
  '服务协议',
  '必备证件',
  '身体改造与工作形态',
  '收纳方式',
  '本作全部内容纯属虚构',
  '一部分读者或因本作中的某些场面而感到不适',
  '如下图',
  '以下都是弃稿',
]);

const blockedTriggerTerms = new Set([
  '帝国',
  '女性',
  '男性',
  '女人',
  '男人',
  '女体',
  '女奴',
  '奴隶',
  '性奴',
  '母狗',
  '组织',
  '机构',
  '社会',
  '产品',
  '职业',
  '设施',
  '场所',
  '地点',
  '道具',
  '物品',
  '装备',
  '设备',
  '技术',
  '规则',
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
  '结构',
  '设定',
  '目录',
  '引言',
  '后记',
  '标准',
  '职业标准',
  '职位标准',
  '使用说明',
  '公司',
  '家庭',
  '警察',
  '女警',
  '护士',
  '医生',
  '学生',
  '修女',
  '神父',
  '课程',
  '上课',
]);

const sectionPrefixTerms = [
  '帝国',
  '圣女教',
  '陵园',
  '地铁',
  '交通',
  '民政局',
  '女权革命家',
  '皇家医院',
  '口袋公司',
  '职业',
  '帝国集中营',
  '作战女畜',
  '圣女教',
  '教廷',
  '国母级性奴',
  '女体',
  '葬礼',
];

const preferredTitleFields = ['学名', '品名', '名称', '产品名称', '型号'];

const stats = {
  totalSegments: 0,
  headingCandidates: 0,
  inlineCandidates: 0,
  effectiveCandidates: 0,
  mergedDuplicates: 0,
  shortSummaryCount: 0,
  duplicateTriggerCount: 0,
};

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u3000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function compactText(value) {
  return normalizeText(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–－]/g, '-');
}

function unique(values) {
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

function stripWrapper(value) {
  return normalizeText(value)
    .replace(/^[-—\s]+|[-—\s]+$/g, '')
    .replace(/[:：]\s*$/u, '')
    .replace(/^《(.+)》$/u, '$1')
    .replace(/^["'“”‘’](.+)["'“”‘’]$/u, '$1')
    .replace(/^#\s*/, '')
    .trim();
}

function splitFieldLine(line) {
  const match = normalizeText(line).match(/^([^:：]{1,28})[:：]\s*(.+)$/u);
  if (!match) {
    return null;
  }
  return {
    label: stripWrapper(match[1]),
    value: stripWrapper(match[2]),
  };
}

function cleanTitle(rawTitle, sectionTitle = '') {
  let title = stripWrapper(rawTitle)
    .replace(/^NO\.\d+\s*[:：]\s*/iu, '')
    .replace(/^[-—](.+)[-—]$/u, '$1')
    .replace(/\s*Imperial\s+Society.*$/iu, '')
    .replace(/^The Uniform Fan\s*/iu, '')
    .replace(/^Career Girl\s*[一\-—]?\s*/iu, '')
    .replace(/^CareerGirl\s*/iu, '')
    .replace(/^sexy\s+nurse\s*/iu, '')
    .replace(/^Female\s+Cleaner\s*/iu, '')
    .replace(/^FemaleCleaner\s*/iu, '')
    .replace(/^FemaleMilk\s*/iu, '')
    .replace(/\s*J\.M\.?$/iu, '')
    .replace(/(?:职位应聘标准|职位标准|设定)$/u, '')
    .trim();

  const lawSentence = title.match(/^(.+?(?:法案|条例|宪法|制度|计划|规则|证明|许可))是/u);
  if (lawSentence) {
    title = lawSentence[1];
  }

  const field = splitFieldLine(title);
  if (field && !fieldLabels.has(field.label) && field.value.length <= 24) {
    title = field.value;
  }

  if (title.includes('--')) {
    title = title.split(/--+/u).at(-1) ?? title;
  }

  const separatorParts = title
    .split(/[·•\-－—]/u)
    .map(part => stripWrapper(part))
    .filter(Boolean);
  if (separatorParts.length > 1) {
    const last = separatorParts.at(-1) ?? title;
    const first = separatorParts[0];
    if (blockedTriggerTerms.has(last) && /皇家医院|帝国南方航空|口袋公司/u.test(title)) {
      title = title.replace(/[·•\s_\-－—:：]+/gu, '');
    } else
    if (
      sectionPrefixTerms.includes(first) ||
      sectionPrefixTerms.some(term => title.startsWith(`${term}`)) ||
      /^[A-Za-z ]+$/.test(first)
    ) {
      title = last;
    }
  }

  if (/^（?[一二三四五六七八九十]+[）)]/.test(title)) {
    title = title.replace(/^（?[一二三四五六七八九十]+[）)]\s*/u, '');
  }

  const sourcePrefix = stripWrapper(sectionTitle).split(/[·•\-－—\s]/u)[0];
  if (sourcePrefix && title.startsWith(sourcePrefix) && title.length > sourcePrefix.length + 2) {
    title = title.slice(sourcePrefix.length).replace(/^[:：·•\-－—\s]+/u, '');
  }

  return stripWrapper(title).replace(/^[·•\s_\-－—:：]+/u, '');
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[《》“”"'\s·•_\-－—:：。,.，、（）()]/gu, '');
}

function isBadTitle(title) {
  const cleaned = stripWrapper(title);
  if (!cleaned || cleaned.length < 2 || cleaned.length > 30) {
    return true;
  }
  if (metaTitles.has(cleaned) || blockedTriggerTerms.has(cleaned)) {
    return true;
  }
  if (/结束|职位应聘标准|职位标准|着装要求|颁发条件|服务协议|注意事项|收纳方式/u.test(cleaned)) {
    return true;
  }
  if (/^(NO\.\d+|Career ?Girl)$/iu.test(cleaned)) {
    return true;
  }
  if (/^(老主教|闲聊|如下图|以下|以上|左边|最后|谢谢)/u.test(cleaned)) {
    return true;
  }
  if (/^\d+.*(?:元|小时|岁|cm|CM|%)/u.test(cleaned)) {
    return true;
  }
  if (/\d{4,}号$/u.test(cleaned) || /市.+区.+\d+号/u.test(cleaned)) {
    return true;
  }
  if (/配重板|跪垫|真皮坐垫/u.test(cleaned)) {
    return true;
  }
  if (cleaned.length > 12 && /(是|为|需要|要求|可以|必须|不会|不是|应该|因此|因为|如果)/u.test(cleaned)) {
    return true;
  }
  if (/^[\d\s:：.\-—]+$/u.test(cleaned)) {
    return true;
  }
  if (/^\d+\s+/.test(cleaned) || /^[①②③④⑤⑥⑦⑧⑨⑩]/u.test(cleaned)) {
    return true;
  }
  if (/^(我们|我|你|他|她|它|这|那|如果|但是|然而|因为|所以|其实|为了|对于)/u.test(cleaned)) {
    return true;
  }
  if (/[。！？；，]/u.test(cleaned)) {
    return true;
  }
  if (!/[\u4e00-\u9fffA-Za-z]/u.test(cleaned)) {
    return true;
  }
  if (/[a-z]{8,}/iu.test(cleaned) && !/[A-Z]{1,4}-?\d{0,3}/u.test(cleaned)) {
    return true;
  }
  return false;
}

function isFieldOnlyLine(line) {
  const field = splitFieldLine(line);
  return Boolean(field && fieldLabels.has(field.label));
}

function isMetaLine(line) {
  const text = stripWrapper(line);
  if (!text) {
    return true;
  }
  if (metaTitles.has(text)) {
    return true;
  }
  if (/^\d{1,3}\s+\S+/u.test(text)) {
    return true;
  }
  if (/^本作全部内容|^一部分读者|禁止阅读|纯属虚构/u.test(text)) {
    return true;
  }
  if (/^[啪咚咯吱啊嗯呜哈~～…]+$/u.test(text)) {
    return true;
  }
  if (/^[“"].+[”"]$/u.test(text) && text.length < 80) {
    return true;
  }
  return false;
}

function isHeadingLine(line) {
  const text = stripWrapper(line);
  if (isMetaLine(text) || text.length < 2 || text.length > 34) {
    return false;
  }
  if (isFieldOnlyLine(text)) {
    return false;
  }
  if (/^[\d①②③④⑤⑥⑦⑧⑨⑩]+[、.．]/u.test(text)) {
    return false;
  }
  if (/^(NO\.\d+|[A-Za-z ]{4,})[:：]/u.test(text)) {
    return false;
  }
  if (/[。！？；，]/u.test(text)) {
    return false;
  }
  if (/职位应聘标准|职位标准|着装要求|颁发条件|服务协议|注意事项|收纳方式/u.test(text)) {
    return false;
  }
  if (/^Career ?Girl$/iu.test(text)) {
    return false;
  }

  const field = splitFieldLine(text);
  if (field) {
    if (fieldLabels.has(field.label)) {
      return false;
    }
    return field.value.length <= 24 && !isBadTitle(field.value);
  }

  return !isBadTitle(text);
}

function isInlineDefinition(line) {
  const field = splitFieldLine(line);
  if (!field || field.value.length < 24 || field.value.length > 520) {
    return false;
  }
  if (/^NO\.\d+$/iu.test(field.label) || /[说问想]$/u.test(field.label)) {
    return false;
  }
  if (fieldLabels.has(field.label) || isBadTitle(field.label)) {
    return false;
  }
  if (/^(革命军内部|注意事项|身体改造|女性职员着装要求|职位|工作|服务|入职证件)/u.test(field.label)) {
    return false;
  }
  return true;
}

function getHeadingTitle(line, sectionTitle) {
  const text = stripWrapper(line);
  const field = splitFieldLine(text);
  if (field && field.value.length <= 24 && !fieldLabels.has(field.label)) {
    return {
      title: cleanTitle(field.value, sectionTitle),
      aliases: unique([field.label, text]),
    };
  }
  return {
    title: cleanTitle(text, sectionTitle),
    aliases: unique([text]),
  };
}

function readPreferredTitleFromBody(bodyLines, fallbackTitle) {
  for (const line of bodyLines.slice(0, 8)) {
    const field = splitFieldLine(line);
    if (!field || !preferredTitleFields.includes(field.label) || isBadTitle(field.value)) {
      continue;
    }
    if (blockedTriggerTerms.has(fallbackTitle) || metaTitles.has(fallbackTitle) || fallbackTitle.length <= 5) {
      return field.value;
    }
  }
  if (/许可|许可证|编号|标准号|\d{4,}号$/u.test(fallbackTitle)) {
    const prose = normalizeText(bodyLines.join(' '));
    const entitySentence = prose.match(/([A-Za-z0-9\u4e00-\u9fff·\-（）()]{2,24})是/u);
    if (entitySentence && !isBadTitle(entitySentence[1])) {
      return entitySentence[1];
    }
  }
  return fallbackTitle;
}

function collectAliases(bodyLines, rawAliases, title) {
  const aliases = [...rawAliases];
  for (const line of bodyLines.slice(0, 18)) {
    const field = splitFieldLine(line);
    if (!field) {
      continue;
    }
    if (field.label === '别名') {
      aliases.push(...field.value.split(/[、，,\/|；;\s]+/u));
    }
    if (['学名', '品名', '型号', '名称', '产品名称'].includes(field.label) && field.value !== title) {
      aliases.push(field.value);
    }
  }
  return unique(aliases.filter(alias => alias !== title && !isBadTitleForAlias(alias)));
}

function isBadTitleForAlias(alias) {
  const text = stripWrapper(alias);
  return !text || text.length < 2 || text.length > 28 || metaTitles.has(text) || fieldLabels.has(text);
}

function cleanBodyLines(lines) {
  return lines
    .map(line => compactText(line))
    .filter(line => line && !isMetaLine(line))
    .filter(line => !/《制服诱惑·白领篇》结束/u.test(line))
    .filter(line => !/^Career ?Girl$/iu.test(line))
    .filter(line => !/配重板|跪垫|真皮坐垫/u.test(line))
    .filter(line => !/职位应聘标准|职位标准|着装要求/u.test(line))
    .filter(line => !/生产许可\d+号/u.test(line))
    .filter(line => !/Slave\s|letusin|ampulationchar|pey\s+nn/iu.test(line));
}

function splitSentences(text) {
  return compactText(text)
    .split(/(?<=[。！？；;.!?])\s*/u)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function sentenceLooksUseful(sentence) {
  if (sentence.length < 12) {
    return false;
  }
  if (/^[“"].+[”"]$/u.test(sentence) && sentence.length < 90) {
    return false;
  }
  if (/^(我|你|他|她|队长|士兵|女同事)[^，。]{0,10}[说问]/u.test(sentence)) {
    return false;
  }
  if (/^(年龄|身高|体重|胸围|腰围|臀围|处女|电话|传真|售价|编号|姓名)[:：]/u.test(sentence)) {
    return false;
  }
  if (/任你|随你|爽上天|小穴屁眼/u.test(sentence)) {
    return false;
  }
  return true;
}

function buildSummaryAndDetails(bodyLines) {
  const cleaned = cleanBodyLines(bodyLines);
  const proseLines = cleaned.filter(line => !isFieldOnlyLine(line));
  const fieldLines = cleaned.filter(line => isFieldOnlyLine(line)).slice(0, 6);
  const sentences = splitSentences(proseLines.join(' ')).filter(sentenceLooksUseful);

  let summary = '';
  for (const sentence of sentences) {
    if (summary.length >= 90) {
      break;
    }
    summary = normalizeText(`${summary}${summary ? ' ' : ''}${sentence}`);
  }

  if (!summary && fieldLines.length > 0) {
    summary = normalizeText(fieldLines.join('；'));
  }
  if (!summary && cleaned.length > 0) {
    summary = normalizeText(cleaned.join(' '));
  }

  summary = shorten(summary, 180);

  const details = unique([
    ...fieldLines,
    ...sentences.filter(sentence => !summary.includes(sentence)).map(sentence => shorten(sentence, 150)),
  ]).slice(0, 5);

  return { summary, details };
}

function shorten(text, maxLength) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const probe = normalized.slice(0, maxLength);
  const cut = Math.max(
    probe.lastIndexOf('。'),
    probe.lastIndexOf('；'),
    probe.lastIndexOf('，'),
    probe.lastIndexOf('.'),
    probe.lastIndexOf(';'),
    probe.lastIndexOf(','),
  );
  if (cut > 60) {
    return normalized.slice(0, cut + 1);
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function inferCategory(title, sourceText, sectionTitle) {
  const probe = `${title} ${sectionTitle} ${sourceText.slice(0, 320)}`;
  if (/南宫|阮|文素妍|安娜|莫妮卡|琳$|伊洛|夏娃|达维娜|瓦丽安娜|瑟琳西卡|达琳|帕米拉|尤里卡/u.test(title)) {
    return '人物';
  }
  if (/女子敬国军|革命军|姐妹会|阿肯托尔|圣女教|教廷|黑新娘/u.test(title)) {
    return '组织';
  }
  if (/法案|条例|宪法|许可|证明|安全条例|生育限制|超龄废除/u.test(title)) {
    return '法律';
  }
  if (/器|椅|床|球|杯|鞋|勋章|束腰|阻胎器|药|手环|肛塞|鞭|烙铁|娃娃|痰盂|沙发|尿壶|商品|产品/u.test(title)) {
    return '产品';
  }
  if (/蛇腰犬|犬|母马|马奴|女畜|雌豚|驼鹿|恶媚|箱娘|活体自慰杯|警戒犬|母体|畜牧业/u.test(probe)) {
    return '生物';
  }
  if (/女警|检察官|护士|医生|空中小姐|公务员|教师|女仆|神父|修女|妓|清洁工|教官|守墓人|安魂女|接引者|托圣者|芭比|职场白领|职员|白领/u.test(probe)) {
    return '职业';
  }
  if (/垃圾箱|闸机|红绿灯|陵园|集中营|法庭|厕所|市场|接待室|实验室|办公室/u.test(probe)) {
    return '设施';
  }
  if (/手术|改造|雕刻|共生墓葬|奸母胎|基因稳定剂|胎内截肢|脑波|雷达|系统/u.test(probe)) {
    return '技术';
  }
  if (/器|椅|床|球|杯|鞋|勋章|束腰|阻胎器|药|手环|肛塞|鞭|烙铁|娃娃|痰盂|沙发|尿壶|商品|产品/u.test(probe)) {
    return '产品';
  }
  if (/姐妹会|革命军|圣女教|教廷|阿肯托尔|公司|医院|学院|警局|航空|足协|政府|军队|女子敬国军|黑新娘/u.test(probe)) {
    if (/公司|医院|学院|警局|航空|足协/u.test(probe)) {
      return '机构';
    }
    return '组织';
  }
  if (/婚礼|葬礼|游行|赛事|美足杯|征服日|炒奴/u.test(probe)) {
    return '事件';
  }
  if (/帝国黎明|三权鼎立|奴阶|女权|畜牧业|文化|制度/u.test(probe)) {
    return '制度';
  }
  if (/势力图|势力|派系/u.test(probe)) {
    return '势力';
  }
  return '概念';
}

function sourceExcerpt(lines) {
  return shorten(cleanBodyLines(lines).join(' '), 260);
}

function makeCandidate({ rawTitle, bodyLines, rawAliases = [], sectionIndex, sectionTitle, lineStart }) {
  let title = cleanTitle(rawTitle, sectionTitle);
  title = readPreferredTitleFromBody(bodyLines, title);
  title = cleanTitle(title, sectionTitle);
  if (isBadTitle(title)) {
    return null;
  }

  const { summary, details } = buildSummaryAndDetails(bodyLines);
  if (summary.length < 24) {
    return null;
  }

  const aliases = collectAliases(bodyLines, unique([rawTitle, ...rawAliases]), title);
  const source = cleanBodyLines([rawTitle, ...bodyLines]).join(' ');
  return {
    title,
    category: inferCategory(title, source, sectionTitle),
    aliases,
    summary,
    details,
    sourceFile: sourceRelativePath,
    sourceExcerpt: sourceExcerpt([rawTitle, ...bodyLines]),
    sourceSegmentIndex: sectionIndex,
    sourceLineStart: lineStart,
  };
}

function candidatesFromSection(sectionText, sectionIndex, lineOffset) {
  const lines = sectionText
    .split(/\r?\n/u)
    .map(line => normalizeText(line))
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const sectionTitle = lines[0];
  const candidates = [];

  lines.forEach((line, index) => {
    if (!isInlineDefinition(line)) {
      return;
    }
    const field = splitFieldLine(line);
    if (!field) {
      return;
    }
    const candidate = makeCandidate({
      rawTitle: field.label,
      bodyLines: [field.value],
      sectionIndex,
      sectionTitle,
      lineStart: lineOffset + index + 1,
    });
    if (candidate) {
      stats.inlineCandidates += 1;
      candidates.push(candidate);
    }
  });

  const headingIndexes = [];
  lines.forEach((line, index) => {
    if (isHeadingLine(line)) {
      headingIndexes.push(index);
    }
  });

  headingIndexes.forEach((lineIndex, headingOrder) => {
    const nextIndex = headingIndexes[headingOrder + 1] ?? lines.length;
    const raw = getHeadingTitle(lines[lineIndex], sectionTitle);
    const bodyLines = lines.slice(lineIndex + 1, nextIndex);
    if (bodyLines.join('').length < 32) {
      return;
    }
    const candidate = makeCandidate({
      rawTitle: raw.title,
      bodyLines,
      rawAliases: raw.aliases,
      sectionIndex,
      sectionTitle,
      lineStart: lineOffset + lineIndex + 1,
    });
    if (candidate) {
      stats.headingCandidates += 1;
      candidates.push(candidate);
    }
  });

  return candidates;
}

function mergeCandidates(candidates) {
  const grouped = new Map();
  candidates.forEach(candidate => {
    const key = normalizeKey(candidate.title);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(candidate);
  });

  const merged = [];
  grouped.forEach(group => {
    if (group.length > 1) {
      stats.mergedDuplicates += group.length - 1;
    }
    const primary = [...group].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
    const aliases = unique(group.flatMap(item => [item.title, ...item.aliases]).filter(alias => alias !== primary.title));
    const details = unique(group.flatMap(item => item.details)).filter(detail => !primary.summary.includes(detail)).slice(0, 6);
    const excerpts = unique(group.map(item => item.sourceExcerpt)).filter(Boolean);
    merged.push({
      ...primary,
      aliases,
      details,
      sourceExcerpt: excerpts[0] ?? primary.sourceExcerpt,
    });
  });
  return merged;
}

function scoreCandidate(candidate) {
  let score = 0;
  score += Math.min(candidate.summary.length, 180);
  if (candidate.summary.length >= 60) {
    score += 80;
  }
  if (candidate.category !== '概念') {
    score += 20;
  }
  if (/总览|概览|篇|结构|设定/u.test(candidate.title)) {
    score -= 25;
  }
  return score;
}

function titleVariants(title) {
  const variants = [title];
  const noWrapper = stripWrapper(title);
  variants.push(noWrapper);
  variants.push(noWrapper.replace(/[·•\s_\-－—]/gu, ''));
  if (noWrapper.includes('·')) {
    variants.push(noWrapper.split('·').at(-1));
  }
  if (/^帝国/.test(noWrapper) && noWrapper.length > 4) {
    variants.push(noWrapper.slice(2).replace(/^[·•\s_\-－—:：]+/u, ''));
  }
  return unique(variants);
}

function isValidTrigger(trigger) {
  const text = stripWrapper(trigger);
  if (!text || text.length < 2 || text.length > 24) {
    return false;
  }
  if (blockedTriggerTerms.has(text) || metaTitles.has(text) || fieldLabels.has(text)) {
    return false;
  }
  if (/^[\d\s:：.\-—]+$/u.test(text)) {
    return false;
  }
  if (/[。！？；，]/u.test(text)) {
    return false;
  }
  if (/^(职位|工作|服务|身体|生产|综合|产品|注意|必备|颁发|收纳)/u.test(text)) {
    return false;
  }
  return /[\u4e00-\u9fffA-Za-z]/u.test(text);
}

function buildTriggers(entry) {
  return unique([...titleVariants(entry.title), ...entry.aliases.flatMap(titleVariants)]).filter(isValidTrigger).slice(0, 8);
}

function resolveTriggerConflicts(entries) {
  entries.forEach(entry => {
    entry.triggers = buildTriggers(entry);
  });

  const byTrigger = new Map();
  entries.forEach(entry => {
    entry.triggers.forEach(trigger => {
      if (!byTrigger.has(trigger)) {
        byTrigger.set(trigger, []);
      }
      byTrigger.get(trigger).push(entry);
    });
  });

  byTrigger.forEach((owners, trigger) => {
    if (owners.length <= 1) {
      return;
    }
    stats.duplicateTriggerCount += 1;
    const winner = [...owners].sort((a, b) => triggerScore(b, trigger) - triggerScore(a, trigger))[0];
    owners.forEach(entry => {
      if (entry !== winner) {
        entry.triggers = entry.triggers.filter(item => item !== trigger);
      }
    });
  });

  entries.forEach(entry => {
    entry.autoLink = entry.triggers.length > 0;
  });
}

function triggerScore(entry, trigger) {
  let score = 0;
  if (entry.title === trigger) {
    score += 100;
  }
  if (normalizeKey(entry.title) === normalizeKey(trigger)) {
    score += 60;
  }
  if (entry.title.includes(trigger)) {
    score += 30;
  }
  score += Math.min(entry.summary.length, 180) / 10;
  if (/总览|概览|篇|结构|设定/u.test(entry.title)) {
    score -= 20;
  }
  return score;
}

function buildOutputAliases(entry) {
  return unique([...(entry.triggers ?? []), ...(entry.aliases ?? [])])
    .filter(alias => alias !== entry.title && isValidTrigger(alias))
    .slice(0, 16);
}

async function readCuration() {
  try {
    const content = await fs.readFile(curationPath, 'utf8');
    const items = JSON.parse(content);
    if (!Array.isArray(items)) {
      return new Map();
    }
    return new Map(items.filter(item => item && item.id).map(item => [item.id, item]));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }
}

function applyCuration(entries, curation) {
  if (curation.size === 0) {
    return entries;
  }
  return entries.map(entry => {
    const curated = curation.get(entry.id);
    if (!curated) {
      return entry;
    }
    return {
      ...entry,
      title: normalizeText(curated.title) || entry.title,
      category: normalizeText(curated.category) || entry.category,
      aliases: Array.isArray(curated.aliases)
        ? unique(curated.aliases).filter(alias => alias !== curated.title)
        : entry.aliases,
      images: Array.isArray(curated.images)
        ? unique(curated.images.filter(image => typeof image === 'string').map(image => image.trim()).filter(Boolean))
        : entry.images,
    };
  });
}

function finalize(entries) {
  resolveTriggerConflicts(entries);
  return entries
    .filter(entry => entry.title && entry.summary)
    .sort((a, b) => a.sourceSegmentIndex - b.sourceSegmentIndex || a.sourceLineStart - b.sourceLineStart)
    .map((entry, index) => {
      const output = {
        id: String(index).padStart(3, '0'),
        title: entry.title,
        category: entry.category,
        aliases: buildOutputAliases(entry),
        summary: entry.summary,
        details: entry.details,
      };
      if (Array.isArray(entry.images) && entry.images.length > 0) {
        output.images = entry.images;
      }
      return output;
    });
}

async function main() {
  const sourceText = await fs.readFile(sourcePath, 'utf8');
  const sections = sourceText.split(/\r?\n\s*---\s*\r?\n/gu).map(section => section.trim()).filter(Boolean);
  stats.totalSegments = sections.length;

  const candidates = [];
  let lineOffset = 0;
  sections.forEach((section, sectionIndex) => {
    const sectionCandidates = candidatesFromSection(section, sectionIndex, lineOffset);
    candidates.push(...sectionCandidates);
    lineOffset += section.split(/\r?\n/u).length + 1;
  });

  const merged = mergeCandidates(candidates);
  const entries = applyCuration(finalize(merged), await readCuration());
  stats.effectiveCandidates = entries.length;
  stats.shortSummaryCount = entries.filter(entry => entry.summary.length < 50).length;

  await fs.writeFile(generatedPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  if (applyToFinal) {
    await fs.writeFile(finalPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        ...stats,
        generated: path.relative(repoRoot, generatedPath).replace(/\\/g, '/'),
        appliedTo: applyToFinal ? path.relative(repoRoot, finalPath).replace(/\\/g, '/') : null,
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
