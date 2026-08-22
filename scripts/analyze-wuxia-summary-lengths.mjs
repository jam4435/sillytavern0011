#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_EVENT_DIR = '世界书/金庸群侠传1/世界书';
const DEFAULT_OUTPUT = 'plans/武侠总结字数审计';
const THRESHOLDS = [100, 150, 200, 256, 300, 400, 500, 600];
const EVENT_TOTAL_THRESHOLDS = [500, 800, 1000, 1500, 2000];

function parseArgs(argv) {
  const options = { eventDir: DEFAULT_EVENT_DIR, outputDir: DEFAULT_OUTPUT, snapshotDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--event-dir') options.eventDir = argv[++i];
    else if (arg === '--output-dir') options.outputDir = argv[++i];
    else if (arg === '--snapshot-dir') options.snapshotDir = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node scripts/analyze-wuxia-summary-lengths.mjs [options]',
        '',
        `  --event-dir <dir>    世界书事件目录（默认 ${DEFAULT_EVENT_DIR}）`,
        `  --snapshot-dir <dir> 可选：递归扫描 wuxia-*.json 中运行态结局`,
        `  --output-dir <dir>  输出 JSON/Markdown（默认 ${DEFAULT_OUTPUT}）`,
      ].join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function collectFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(file, predicate)));
    else if (entry.isFile() && predicate(entry.name)) files.push(file);
  }
  return files.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function parseJson(text, file) {
  try {
    return JSON.parse(text.replace(/^\uFEFF/u, ''));
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function textMetrics(text) {
  const value = String(text).trim();
  const codePoints = Array.from(value).length;
  const nonWhitespace = Array.from(value.replace(/\s/gu, '')).length;
  let estimatedTokens = 0;
  // Chinese/CJK and punctuation are close to one token each. ASCII runs are
  // amortized at roughly four characters per token. This is deliberately a
  // conservative planning estimate, not a tokenizer result.
  for (let i = 0; i < value.length;) {
    const code = value.codePointAt(i);
    const char = String.fromCodePoint(code);
    if (/\s/iu.test(char)) {
      i += char.length;
    } else if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(char)) {
      estimatedTokens += 1;
      i += char.length;
    } else if (/[\x00-\x7f]/u.test(char)) {
      let j = i;
      while (j < value.length && /[\x00-\x7f]/u.test(value[j]) && !/\s/u.test(value[j])) j += 1;
      estimatedTokens += Math.max(1, Math.ceil((j - i) / 4));
      i = j;
    } else {
      estimatedTokens += 1;
      i += char.length;
    }
  }
  return { chars: codePoints, nonWhitespace, estimatedTokens };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(records) {
  const chars = records.map(item => item.metrics.chars);
  const tokens = records.map(item => item.metrics.estimatedTokens);
  const result = {
    count: records.length,
    totalChars: chars.reduce((sum, value) => sum + value, 0),
    meanChars: chars.length ? chars.reduce((sum, value) => sum + value, 0) / chars.length : 0,
    minChars: chars.length ? Math.min(...chars) : 0,
    maxChars: chars.length ? Math.max(...chars) : 0,
    p25Chars: percentile(chars, 0.25),
    medianChars: percentile(chars, 0.5),
    p75Chars: percentile(chars, 0.75),
    p90Chars: percentile(chars, 0.9),
    p95Chars: percentile(chars, 0.95),
    p99Chars: percentile(chars, 0.99),
    meanEstimatedTokens: tokens.length ? tokens.reduce((sum, value) => sum + value, 0) / tokens.length : 0,
    maxEstimatedTokens: tokens.length ? Math.max(...tokens) : 0,
    atLeast: Object.fromEntries(THRESHOLDS.map(threshold => [threshold, records.filter(item => item.metrics.chars >= threshold).length])),
    longest: [...records].sort((a, b) => b.metrics.chars - a.metrics.chars).slice(0, 20),
  };
  return result;
}

function summarizeBy(records, keyFn) {
  const groups = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
      .map(([key, values]) => [key, summarize(values)]),
  );
}

function summarizeEventTotals(records) {
  const totals = new Map();
  for (const record of records) {
    const current = totals.get(record.eventName) || { eventName: record.eventName, chars: 0, entries: 0 };
    current.chars += record.metrics.chars;
    current.entries += 1;
    totals.set(record.eventName, current);
  }
  const values = [...totals.values()].map(item => ({ ...item, metrics: { chars: item.chars, estimatedTokens: item.chars } }));
  return {
    eventCount: values.length,
    atLeast: Object.fromEntries(EVENT_TOTAL_THRESHOLDS.map(threshold => [threshold, values.filter(item => item.chars >= threshold).length])),
    longest: values.sort((left, right) => right.chars - left.chars).slice(0, 20),
  };
}

function collectBiography(value, context, out) {
  if (!isRecord(value)) return;
  for (const [character, characterValue] of Object.entries(value)) {
    if (!isRecord(characterValue)) continue;
    const biography = characterValue.人物经历;
    if (typeof biography === 'string' && biography.trim()) {
      out.push({ ...context, character, key: null, text: biography.trim(), metrics: textMetrics(biography) });
    } else if (isRecord(biography)) {
      for (const [key, text] of Object.entries(biography)) {
        if (key.startsWith('$') || typeof text !== 'string' || !text.trim()) continue;
        out.push({ ...context, character, key, text: text.trim(), metrics: textMetrics(text) });
      }
    }
  }
}

function collectRuntimeOutcomes(value, file, out, seen) {
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '参与事件' && isRecord(child)) {
      for (const [eventName, eventValue] of Object.entries(child)) {
        if (!isRecord(eventValue) || typeof eventValue.结局 !== 'string' || !eventValue.结局.trim()) continue;
        const dedupeKey = `${eventName}\u0000${eventValue.结局.trim()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const text = eventValue.结局.trim();
        out.push({ file, eventName, text, metrics: textMetrics(text) });
      }
    }
    if (key === '世界事件' && isRecord(child)) {
      for (const [eventName, eventValue] of Object.entries(child)) {
        if (!isRecord(eventValue) || typeof eventValue.概要 !== 'string' || !eventValue.概要.trim()) continue;
        const dedupeKey = `${eventName}\u0000${eventValue.概要.trim()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const text = eventValue.概要.trim();
        out.push({ file, eventName, text, metrics: textMetrics(text) });
      }
    }
    collectRuntimeOutcomes(child, file, out, seen);
  }
}

function markdownReport(report) {
  const lines = [
    '# 武侠总结字数审计',
    '',
    `扫描时间：${report.generatedAt}`, '',
    `事件文件：${report.eventFiles} 个；解析失败：${report.parseErrors.length} 个。`, '',
    '## 结论', '',
    `- 人物经历样本 ${report.biography.count} 条，平均 ${report.biography.meanChars.toFixed(1)} 字，中位数 ${report.biography.medianChars.toFixed(1)} 字，P90 ${report.biography.p90Chars.toFixed(1)} 字，最长 ${report.biography.maxChars} 字。`,
    `- 其中 insert ${report.biographyByOperation.insert?.count ?? 0} 条，平均 ${report.biographyByOperation.insert?.meanChars?.toFixed(1) ?? '0.0'} 字；update ${report.biographyByOperation.update?.count ?? 0} 条，平均 ${report.biographyByOperation.update?.meanChars?.toFixed(1) ?? '0.0'} 字。`,
    `- 原始事件概要/结局样本 ${report.eventOutcome.count} 条，平均 ${report.eventOutcome.meanChars.toFixed(1)} 字，中位数 ${report.eventOutcome.medianChars.toFixed(1)} 字，P95 ${report.eventOutcome.p95Chars.toFixed(1)} 字，最长 ${report.eventOutcome.maxChars} 字。`,
    `- 按事件聚合人物经历（同一事件所有角色合计）${report.biographyEventTotals.eventCount} 条：≥500 字 ${report.biographyEventTotals.atLeast[500]} 条，≥1000 字 ${report.biographyEventTotals.atLeast[1000]} 条；最大 ${report.biographyEventTotals.longest[0]?.chars ?? 0} 字。`,
    '- token 为规划估算值（中文按约 1 字/token，ASCII 按约 4 字符/token），不是具体模型 tokenizer 的精确结果。', '',
    '人物经历同时报告了 insert/update 两种变量操作；insert 是主要运行时新增来源，update 是后续改写来源。事件总量统计把同一事件涉及的全部人物经历相加，用于估算一次提示词可能携带的聚合体积。', '',
    '## 阈值计数（按字符数）', '',
    '| 样本 | ≥100 | ≥150 | ≥200 | ≥256 | ≥300 | ≥400 | ≥500 | ≥600 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| 人物经历 | ${THRESHOLDS.map(t => report.biography.atLeast[t]).join(' | ')} |`,
    `| 事件概要/结局 | ${THRESHOLDS.map(t => report.eventOutcome.atLeast[t]).join(' | ')} |`, '',
    '## 建议阈值', '',
    '- 人物经历单条 `<150` 字：正常；`150–255` 字：进入关注/轻量压缩候选；`≥256` 字：应优先压缩；`≥300` 字：不可容忍，建议强制压缩；`≥500` 字：极端异常。',
    '- 事件概要目前全部在短文本范围内；运行态参与事件结局若出现 `≥200` 字，应独立进入压缩队列，不能沿用人物经历条目数阈值。',
    '- 触发条件应同时考虑单条长度、角色经历总字符/token，以及事件结局总量；仅按 10 条/50 条会漏掉少量长条目。', '',
    '## 最长人物经历', '',
    '| 字数 | 角色 | 事件 |',
    '| ---: | --- | --- |',
    ...report.biography.longest.slice(0, 10).map(item => `| ${item.metrics.chars} | ${item.character} | ${item.eventName} |`), '',
  ];
  if (report.runtimeOutcome) {
    lines.push('## 运行态结局（去重文本）', '',
      `扫描 ${report.runtimeFiles} 个快照，参与事件结局/世界事件概要共 ${report.runtimeOutcome.count} 条，平均 ${report.runtimeOutcome.meanChars.toFixed(1)} 字，P95 ${report.runtimeOutcome.p95Chars.toFixed(1)} 字，最长 ${report.runtimeOutcome.maxChars} 字。`, '');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const eventFiles = await collectFiles(options.eventDir, name => /\.(?:ya?ml|json)$/iu.test(name));
  const biography = [];
  const eventOutcome = [];
  const parseErrors = [];
  for (const file of eventFiles) {
    try {
      const data = parseJson(await readFile(file, 'utf8'), file);
      const eventName = path.basename(file, path.extname(file));
      collectBiography(data.insert, { file, eventName, operation: 'insert' }, biography);
      collectBiography(data.update, { file, eventName, operation: 'update' }, biography);
      collectBiography(data.delete, { file, eventName, operation: 'delete' }, biography);
      for (const field of ['事件概要', '事件结局']) {
        if (typeof data[field] === 'string' && data[field].trim()) {
          const text = data[field].trim();
          eventOutcome.push({ file, eventName, field, text, metrics: textMetrics(text) });
        }
      }
    } catch (error) {
      parseErrors.push(String(error));
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    eventDir: options.eventDir,
    eventFiles: eventFiles.length,
    parseErrors,
    biography: summarize(biography),
    biographyByOperation: summarizeBy(biography, item => item.operation),
    biographyBySeries: summarizeBy(biography, item => item.eventName.startsWith('射雕') ? '射雕' : item.eventName.startsWith('神雕') ? '神雕' : '其他'),
    biographyEventTotals: summarizeEventTotals(biography),
    eventOutcome: summarize(eventOutcome),
  };
  if (options.snapshotDir) {
    const snapshots = await collectFiles(options.snapshotDir, name => /^wuxia-.*\.json$/iu.test(name));
    const runtime = [];
    const seen = new Set();
    for (const file of snapshots) {
      try { collectRuntimeOutcomes(parseJson(await readFile(file, 'utf8'), file), file, runtime, seen); }
      catch (error) { parseErrors.push(String(error)); }
    }
    report.runtimeFiles = snapshots.length;
    report.runtimeOutcome = summarize(runtime);
  }
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(path.join(options.outputDir, 'summary-length-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(path.join(options.outputDir, 'summary-length-report.md'), markdownReport(report), 'utf8');
  console.log(JSON.stringify({ eventFiles: report.eventFiles, biography: report.biography, eventOutcome: report.eventOutcome, runtimeOutcome: report.runtimeOutcome ?? null }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
