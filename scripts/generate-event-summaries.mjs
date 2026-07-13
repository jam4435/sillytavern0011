import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_EVENT_DIR = path.resolve('世界书/金庸群侠传1/世界书');
const DEFAULT_DRAFT_PATH = path.resolve('plans/金庸群侠传1事件概要草案.json');
const DEFAULT_REPORT_PATH = path.resolve('plans/金庸群侠传1事件概要生成草案.md');
const MIN_SUMMARY_LENGTH = 20;
const MAX_SUMMARY_LENGTH = 120;

function parseArgs(argv) {
  const args = {
    mode: 'validate',
    dir: DEFAULT_EVENT_DIR,
    draft: DEFAULT_DRAFT_PATH,
    report: DEFAULT_REPORT_PATH,
    batchSize: 8,
    concurrency: 2,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--generate') args.mode = 'generate';
    else if (arg === '--apply') args.mode = 'apply';
    else if (arg === '--validate') args.mode = 'validate';
    else if (arg === '--force') args.force = true;
    else if (arg === '--dir') args.dir = path.resolve(argv[++index]);
    else if (arg === '--draft') args.draft = path.resolve(argv[++index]);
    else if (arg === '--report') args.report = path.resolve(argv[++index]);
    else if (arg === '--batch-size') args.batchSize = Number(argv[++index]);
    else if (arg === '--concurrency') args.concurrency = Number(argv[++index]);
    else throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 20) {
    throw new Error('--batch-size 必须是 1-20 的整数');
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 8) {
    throw new Error('--concurrency 必须是 1-8 的整数');
  }
  return args;
}

function isOrdinaryEventFile(filename) {
  return /事件条目-.*\.ya?ml$/i.test(filename) && !/登场事件|成长条目/.test(filename);
}

function summaryLength(value) {
  return Array.from(value).length;
}

function validateSummary(value) {
  if (typeof value !== 'string') return '不是字符串';
  if (value !== value.trim()) return '包含首尾空白';
  if (/\r|\n/.test(value)) return '必须是单段文本';
  const length = summaryLength(value);
  if (length < MIN_SUMMARY_LENGTH || length > MAX_SUMMARY_LENGTH) {
    return `长度 ${length}，要求 ${MIN_SUMMARY_LENGTH}-${MAX_SUMMARY_LENGTH}`;
  }
  return '';
}

function sourceFingerprint(data) {
  const source = Object.fromEntries(Object.entries(data).filter(([key]) => key !== '事件概要'));
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

async function loadEvents(eventDir) {
  const filenames = (await readdir(eventDir)).filter(isOrdinaryEventFile).sort((left, right) =>
    left.localeCompare(right, 'zh-CN', { numeric: true }),
  );
  const events = [];
  for (const filename of filenames) {
    const filePath = path.join(eventDir, filename);
    const raw = await readFile(filePath, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${filename} 无法解析为 JSON: ${error.message}`);
    }
    events.push({ filename, filePath, data, fingerprint: sourceFingerprint(data) });
  }
  return events;
}

function buildPrompt(batch) {
  const payload = batch.map(event => ({
    文件: event.filename,
    事件详情: event.data.事件详情,
    参与人物: event.data.参与人物,
    insert: event.data.insert ?? {},
    update: event.data.update ?? {},
    delete: event.data.delete ?? {},
    后续事件: event.data.后续事件 ?? null,
  }));

  return [
    '你正在为武侠世界事件生成原定结局概要。',
    '每条概要必须是单段一到两句、20-120个Unicode字符，描述事件完成后的持久结果。',
    '应概括关键人物状态、关系、归属或后续条件，不复述全过程，不推测，不使用“原著中”。',
    '只输出严格JSON数组，每项固定为 {"文件":"原文件名","事件概要":"文本"}，不得使用代码围栏。',
    JSON.stringify(payload),
  ].join('\n');
}

function parseResponse(text, batch) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('模型响应不是 JSON 数组');
  const expected = new Set(batch.map(event => event.filename));
  const summaries = new Map();
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || !expected.has(item.文件)) {
      throw new Error(`模型返回未知文件: ${String(item?.文件)}`);
    }
    const summary = typeof item.事件概要 === 'string' ? item.事件概要.trim() : item.事件概要;
    const error = validateSummary(summary);
    if (error) throw new Error(`${item.文件} 的事件概要无效: ${error}`);
    summaries.set(item.文件, summary);
  }
  if (summaries.size !== expected.size) throw new Error('模型响应缺少部分文件');
  return summaries;
}

async function requestBatch(batch, config) {
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: buildPrompt(batch) }],
    temperature: 0.2,
    stream: false,
  };
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.key}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const result = await response.json();
      const text = result?.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new Error('响应缺少 choices[0].message.content');
      return parseResponse(text, batch);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

async function mapConcurrent(items, concurrency, worker) {
  let nextIndex = 0;
  const results = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

async function loadDraft(draftPath) {
  try {
    const parsed = JSON.parse(await readFile(draftPath, 'utf8'));
    return Array.isArray(parsed?.entries) ? parsed : { version: 1, entries: [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, entries: [] };
    throw error;
  }
}

async function writeDraftAndReport(args, events, entries) {
  const draft = { version: 1, generatedAt: new Date().toISOString(), entries };
  await mkdir(path.dirname(args.draft), { recursive: true });
  await writeFile(args.draft, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');

  const lines = [
    '# 金庸群侠传1事件概要生成草案',
    '',
    `- 普通事件总数：${events.length}`,
    `- 草案概要数：${entries.length}`,
    `- 长度范围：${MIN_SUMMARY_LENGTH}-${MAX_SUMMARY_LENGTH} 个 Unicode 字符`,
    '- 本阶段未修改事件文件；确认后使用 `--apply` 写回。',
    '',
    '## 抽样',
    '',
    ...entries.slice(0, 20).map(entry => `- ${entry.filename}：${entry.summary}`),
    '',
  ];
  await writeFile(args.report, lines.join('\n'), 'utf8');
}

async function generate(args, events) {
  const config = {
    url: process.env.EVENT_SUMMARY_API_URL?.trim(),
    key: process.env.EVENT_SUMMARY_API_KEY?.trim(),
    model: process.env.EVENT_SUMMARY_MODEL?.trim(),
  };
  if (!config.url || !config.key || !config.model) {
    throw new Error('生成模式需要 EVENT_SUMMARY_API_URL、EVENT_SUMMARY_API_KEY、EVENT_SUMMARY_MODEL');
  }

  const previousDraft = await loadDraft(args.draft);
  const previousEntries = new Map(previousDraft.entries.map(entry => [entry.filename, entry]));
  const pending = events.filter(event => {
    if (!args.force && !validateSummary(event.data.事件概要)) return false;
    const previous = previousEntries.get(event.filename);
    return !previous || previous.sourceFingerprint !== event.fingerprint || validateSummary(previous.summary);
  });

  const batches = chunk(pending, args.batchSize);
  let checkpointQueue = Promise.resolve();
  await mapConcurrent(batches, args.concurrency, async (batch, index) => {
    const summaries = await requestBatch(batch, config);
    for (const event of batch) {
      previousEntries.set(event.filename, {
        filename: event.filename,
        sourceFingerprint: event.fingerprint,
        summary: summaries.get(event.filename),
      });
    }
    checkpointQueue = checkpointQueue.then(() => {
      const entries = events
        .map(event => previousEntries.get(event.filename))
        .filter(Boolean);
      return writeDraftAndReport(args, events, entries);
    });
    await checkpointQueue;
    console.info(`已完成批次 ${index + 1}/${batches.length}`);
  });

  const entries = events.map(event => previousEntries.get(event.filename)).filter(Boolean);
  await writeDraftAndReport(args, events, entries);
  console.info(`草案已生成：${entries.length}/${events.length}`);
}

function insertSummaryAfterDetails(data, summary) {
  const result = {};
  let inserted = false;
  for (const [key, value] of Object.entries(data)) {
    if (key === '事件概要') continue;
    result[key] = value;
    if (key === '事件详情') {
      result.事件概要 = summary;
      inserted = true;
    }
  }
  if (!inserted) throw new Error('事件缺少事件详情，无法确定事件概要字段位置');
  return result;
}

async function applyDraft(args, events) {
  const draft = await loadDraft(args.draft);
  const entries = new Map(draft.entries.map(entry => [entry.filename, entry]));
  if (entries.size !== events.length) throw new Error(`草案不完整: ${entries.size}/${events.length}`);

  for (const event of events) {
    const entry = entries.get(event.filename);
    if (entry.sourceFingerprint !== event.fingerprint) throw new Error(`${event.filename} 的源内容已变化`);
    const error = validateSummary(entry.summary);
    if (error) throw new Error(`${event.filename} 的草案概要无效: ${error}`);
  }

  for (const event of events) {
    const entry = entries.get(event.filename);
    const data = insertSummaryAfterDetails(event.data, entry.summary);
    await writeFile(event.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }
  console.info(`已写回 ${events.length} 个普通事件`);
}

function validateEvents(events) {
  const errors = [];
  for (const event of events) {
    const error = validateSummary(event.data.事件概要);
    if (error) errors.push(`${event.filename}: ${error}`);
    const keys = Object.keys(event.data);
    if (keys.indexOf('事件概要') !== keys.indexOf('事件详情') + 1) {
      errors.push(`${event.filename}: 事件概要必须紧跟在事件详情之后`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`事件概要校验失败 (${errors.length}/${events.length})\n${errors.slice(0, 30).join('\n')}`);
  }
  console.info(`校验通过：${events.length} 个普通事件均包含 ${MIN_SUMMARY_LENGTH}-${MAX_SUMMARY_LENGTH} 字的单段概要`);
}

const args = parseArgs(process.argv.slice(2));
const events = await loadEvents(args.dir);
if (args.mode === 'generate') await generate(args, events);
else if (args.mode === 'apply') await applyDraft(args, events);
else validateEvents(events);
