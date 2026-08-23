#!/usr/bin/env node

/**
 * Compress oversized wuxia 人物经历 entries through a local DeepSeek Harness
 * text session. It performs all generation before changing source files and
 * refuses to write if a source file changed after it was read.
 *
 * Usage:
 *   node scripts/compress-wuxia-long-biographies.mjs --apply
 *   node scripts/compress-wuxia-long-biographies.mjs --threshold 256 --dry-run
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_EVENT_DIR = '世界书/金庸群侠传1/世界书';
const DEFAULT_OUTPUT_DIR = 'plans/武侠人物经历压缩-256';
const API_BASE = 'http://127.0.0.1:3080/api';
const MODEL = { provider: 'opencode-go', model: 'deepseek-v4-flash' };

function parseArgs(argv) {
  const options = {
    eventDir: DEFAULT_EVENT_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    threshold: 256,
    apply: false,
    limit: Infinity,
    concurrency: 3,
    resumeAudit: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--event-dir') options.eventDir = argv[++index];
    else if (arg === '--output-dir') options.outputDir = argv[++index];
    else if (arg === '--threshold') options.threshold = Number(argv[++index]);
    else if (arg === '--limit') options.limit = Number(argv[++index]);
    else if (arg === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (arg === '--resume-audit') options.resumeAudit = argv[++index];
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node scripts/compress-wuxia-long-biographies.mjs [options]',
        '',
        `  --event-dir <dir>   事件书目录（默认 ${DEFAULT_EVENT_DIR}）`,
        `  --output-dir <dir>  审计报告目录（默认 ${DEFAULT_OUTPUT_DIR}）`,
        '  --threshold <n>     原文最小字数（默认 256）',
        '  --limit <n>         最多处理条数（用于试运行）',
        '  --concurrency <n>   并行文本会话数（默认 3）',
        '  --resume-audit <f>  复用此前审计中已合格的结果，仅重跑失败条目',
        '  --apply             校验全部通过后回写事件书',
        '  --dry-run           仅生成审计报告（默认）',
      ].join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.threshold) || options.threshold < 1) throw new Error('--threshold must be a positive integer');
  if (!(options.limit === Infinity || (Number.isInteger(options.limit) && options.limit > 0))) throw new Error('--limit must be a positive integer');
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error('--concurrency must be an integer from 1 to 8');
  return options;
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(file));
    else if (entry.isFile() && /\.(?:ya?ml|json)$/iu.test(entry.name)) files.push(file);
  }
  return files.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function charCount(text) {
  return Array.from(String(text).trim()).length;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function findRecords(data, file, threshold) {
  const records = [];
  for (const operation of ['insert', 'update']) {
    const operationValue = data[operation];
    if (!isRecord(operationValue)) continue;
    for (const [character, characterValue] of Object.entries(operationValue)) {
      if (!isRecord(characterValue) || !isRecord(characterValue.人物经历)) continue;
      for (const [eventKey, text] of Object.entries(characterValue.人物经历)) {
        if (eventKey.startsWith('$') || typeof text !== 'string') continue;
        const original = text.trim();
        const originalChars = charCount(original);
        if (originalChars < threshold) continue;
        records.push({ file, operation, character, eventKey, original, originalChars, target: characterValue.人物经历 });
      }
    }
  }
  return records;
}

function recordKey(record) {
  return [path.resolve(record.file), record.operation, record.character, record.eventKey].join('\u0000');
}

async function rpc(method, payload) {
  const response = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload }),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status} ${await response.text()}`);
  const envelope = await response.json();
  if (!envelope?.result?.ok) throw new Error(`${method}: ${envelope?.result?.error?.code ?? 'unknown'} ${envelope?.result?.error?.message ?? ''}`.trim());
  return envelope.result.value;
}

function buildPrompt(record, retryNote = '') {
  return [
    '你是武侠叙事资料编辑。将下列“人物经历”压缩成单段中文。',
    '硬性规则：压缩结果必须为 55–70 个汉字/标点计数，必须少于 80 个非空白字符；不得使用标题、序号、引号、解释或“压缩后”等前缀。',
    '事实规则：只能保留原文信息，不得编造；优先保留人物身份/关键创伤或动机、关键关系与物品、以及本事件直接结果。必须舍弃次要枝节、重复与原文修辞，宁可少写细节也不能超长。',
    retryNote,
    '',
    `人物：${record.character}`,
    `事件：${record.eventKey}`,
    `原文：${record.original}`,
  ].filter(Boolean).join('\n');
}

function normalizeModelText(text) {
  let result = String(text ?? '').trim();
  result = result.replace(/^\s*(?:压缩后|摘要|改写后)\s*[:：]\s*/u, '');
  result = result.replace(/^[“”"']+|[“”"']+$/gu, '');
  return result.replace(/\s+/gu, '');
}

async function waitForAnswer(sessionId, timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const history = await rpc('session.history', { sessionId, maxMessages: 3 });
    const events = history.events.map(item => item.event);
    const chunks = events
      .filter(event => event.type === 'assistant/chunk' && event.data?.chunk?.type === 'text-delta')
      .map(event => event.data.chunk.text);
    if (events.some(event => event.type === 'turn/end')) return normalizeModelText(chunks.join(''));
    if (events.some(event => event.type === 'turn/error')) throw new Error('model turn failed');
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  throw new Error(`timed out waiting for ${sessionId}`);
}

function validateSummary(summary) {
  const chars = charCount(summary);
  if (chars < 50) return { ok: false, reason: `too short (${chars})` };
  if (chars > 150) return { ok: false, reason: `too long (${chars})` };
  if (/^(?:压缩后|摘要|改写后)[:：]/u.test(summary)) return { ok: false, reason: 'contains a label' };
  return { ok: true, chars };
}

async function compressOne(record, sequence) {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const sessionId = `wuxia-compress-${Date.now()}-${sequence}-${attempt}`;
    await rpc('session.create', { sessionId, cwd: process.cwd(), agentPreset: 'text' });
    await rpc('session.selectModel', { sessionId, ...MODEL });
    const retryNote = attempt === 1 ? '' : `上一次输出不合格（${lastError}）。本次必须严格满足字数上限。`;
    await rpc('session.prompt', {
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: buildPrompt(record, retryNote) }],
    });
    const summary = await waitForAnswer(sessionId);
    const validation = validateSummary(summary);
    if (validation.ok) return { summary, summaryChars: validation.chars, attempts: attempt };
    lastError = validation.reason;
  }
  throw new Error(`failed validation after 3 attempts: ${lastError}`);
}

function renderMarkdown(result) {
  const lines = [
    '# 武侠人物经历压缩审计',
    '',
    `生成时间：${result.generatedAt}`,
    `阈值：原文 ≥ ${result.threshold} 字；处理数：${result.records.length}；成功：${result.successes.length}；失败：${result.failures.length}。`,
    `模型：${result.model.provider} / ${result.model.model}；预设：text。`,
    `回写：${result.applied ? '已回写事件书' : '未回写事件书'}`,
    '',
    '## 条目',
    '',
    '| 原文 | 压缩后 | 角色 | 事件 | 文件 |',
    '| ---: | ---: | --- | --- | --- |',
    ...result.successes.map(item => `| ${item.originalChars} | ${item.summaryChars} | ${item.character} | ${item.eventKey} | ${item.file} |`),
  ];
  if (result.failures.length) {
    lines.push('', '## 失败', '', '| 角色 | 事件 | 原因 |', '| --- | --- | --- |',
      ...result.failures.map(item => `| ${item.character} | ${item.eventKey} | ${item.error} |`));
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = await collectFiles(options.eventDir);
  const documents = new Map();
  const records = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    let data;
    try {
      data = JSON.parse(source.trimStart());
    } catch (error) {
      console.warn('Skipping non-JSON event file:', file);
      continue;
    }
    documents.set(path.resolve(file), { source, hash: sha256(source), data });
    records.push(...findRecords(data, file, options.threshold));
  }
  const selected = records.slice(0, options.limit);
  const resumed = options.resumeAudit
    ? JSON.parse(await readFile(options.resumeAudit, 'utf8'))
    : null;
  const priorSuccesses = new Map((resumed?.successes ?? []).map(item => [recordKey(item), item]));
  console.log(`Found ${selected.length} 人物经历 entries at or above ${options.threshold} characters.`);

  const successes = [];
  const failures = [];
  await Promise.all(Array.from({ length: Math.min(options.concurrency, selected.length) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < selected.length; index += options.concurrency) {
      const record = selected[index];
    process.stdout.write(`[${index + 1}/${selected.length}] ${record.character} / ${record.eventKey} (${record.originalChars} → `);
    const prior = priorSuccesses.get(recordKey(record));
    if (prior) {
      record.target[record.eventKey] = prior.summary;
      const item = {
        ...record,
        summary: prior.summary,
        summaryChars: prior.summaryChars,
        attempts: `resumed/${prior.attempts}`,
        file: path.relative(process.cwd(), record.file).replaceAll('\\\\', '/'),
      };
      delete item.target;
      successes.push(item);
      console.log(`${prior.summaryChars}, resumed)`);
      continue;
    }
    try {
      const compressed = await compressOne(record, index + 1);
      record.target[record.eventKey] = compressed.summary;
      const item = { ...record, ...compressed, file: path.relative(process.cwd(), record.file).replaceAll('\\', '/') };
      delete item.target;
      successes.push(item);
      console.log(`${compressed.summaryChars}, attempt ${compressed.attempts})`);
    } catch (error) {
      const item = { ...record, file: path.relative(process.cwd(), record.file).replaceAll('\\', '/'), error: error instanceof Error ? error.message : String(error) };
      delete item.target;
      failures.push(item);
      console.log('FAILED)');
    }
    }
  }));

  let applied = false;
  if (options.apply && failures.length === 0) {
    for (const [file, document] of documents) {
      const current = await readFile(file, 'utf8');
      if (sha256(current) !== document.hash) throw new Error(`refusing to overwrite concurrently changed file: ${file}`);
    }
    const changedFiles = new Set(successes.map(item => path.resolve(process.cwd(), item.file)));
    for (const file of changedFiles) {
      const document = documents.get(file);
      await writeFile(file, `${JSON.stringify(document.data, null, 2)}\n`, 'utf8');
    }
    applied = true;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    threshold: options.threshold,
    model: MODEL,
    applied,
    records: selected.map(record => ({
      file: path.relative(process.cwd(), record.file).replaceAll('\\', '/'),
      operation: record.operation,
      character: record.character,
      eventKey: record.eventKey,
      originalChars: record.originalChars,
    })),
    successes,
    failures,
  };
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(path.join(options.outputDir, 'compression-audit.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(path.join(options.outputDir, 'compression-audit.md'), renderMarkdown(result), 'utf8');
  console.log(`Report: ${path.join(options.outputDir, 'compression-audit.md')}`);
  if (options.apply && failures.length) process.exitCode = 2;
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
