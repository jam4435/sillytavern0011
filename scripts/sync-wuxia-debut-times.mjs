#!/usr/bin/env node

// 将每回的 00-人物登场 同步为本回 01 事件的“上一个月”。
// 以 01 的完整触发时间为基准，这不是 -30 天：仅将其中的月字段减 1；
// 1 月则变为上一年 12 月，日、时、分沿用 01。
// 若同一个登场包包含出生年份晚于目标年份的人物，默认不写回该包，等待拆分人物后再处理。

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_EVENT_DIR = '世界书/金庸群侠传1/世界书';
const DEBUT_RE = /^(射雕|神雕)第(.+?)回00-人物登场\.ya?ml$/u;
const ORDINARY_RE = /^(射雕|神雕)第(.+?)回(\d{2})-.+\.ya?ml$/u;

function parseArgs(argv) {
  const options = { eventDir: DEFAULT_EVENT_DIR, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') options.apply = true;
    else if (value === '--event-dir') options.eventDir = argv[++index];
    else if (value === '--help' || value === '-h') options.help = true;
    else throw new Error(`未知参数: ${value}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/sync-wuxia-debut-times.mjs [options]

Options:
  --event-dir <dir>  事件目录（默认：${DEFAULT_EVENT_DIR}）
  --apply            写回；省略时仅输出 dry-run 报告
`);
}

async function collectYamlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectYamlFiles(absolutePath)));
    else if (/\.ya?ml$/iu.test(entry.name)) files.push(absolutePath);
  }
  return files;
}

function parseChineseNumber(value) {
  if (/^\d+$/u.test(value)) return Number(value);
  const digits = new Map([
    ['零', 0],
    ['一', 1],
    ['二', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5],
    ['六', 6],
    ['七', 7],
    ['八', 8],
    ['九', 9],
  ]);
  let total = 0;
  let pending = 0;
  for (const character of value) {
    if (character === '十') {
      total += (pending || 1) * 10;
      pending = 0;
      continue;
    }
    const digit = digits.get(character);
    if (digit === undefined) return Number.NaN;
    pending = digit;
  }
  return total + pending;
}

function normalizeTime(value) {
  const year = Number(value?.年);
  const month = Number(value?.月);
  const day = Number(value?.日);
  const hour = Number(value?.时);
  const minute = value?.分 === undefined ? 0 : Number(value.分);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 30 || hour < 0 || hour > 23 || minute < 0 || minute > 59)
    return null;
  return { 年: year, 月: month, 日: day, 时: hour, ...(value?.分 === undefined ? {} : { 分: minute }) };
}

function previousCalendarMonth(time) {
  return {
    ...time,
    年: time.月 === 1 ? time.年 - 1 : time.年,
    月: time.月 === 1 ? 12 : time.月 - 1,
  };
}

function formatTime(time) {
  return `${time.年}-${String(time.月).padStart(2, '0')}-${String(time.日).padStart(2, '0')} ${String(time.时).padStart(2, '0')}:${String(time.分 ?? 0).padStart(2, '0')}`;
}

function isSameTime(left, right) {
  return (
    left.年 === right.年 &&
    left.月 === right.月 &&
    left.日 === right.日 &&
    left.时 === right.时 &&
    (left.分 ?? 0) === (right.分 ?? 0)
  );
}

function replaceTriggerTime(source, target) {
  const triggerBlock = /"触发条件"\s*:\s*\{[^{}]*\}/u;
  const matched = source.match(triggerBlock);
  if (!matched) throw new Error('找不到非嵌套的触发条件对象');

  let replacement = matched[0];
  for (const [field, value] of [
    ['年', target.年],
    ['月', target.月],
    ['日', target.日],
    ['时', target.时],
  ]) {
    const fieldPattern = new RegExp(`("${field}"\\s*:\\s*)\\d+`, 'u');
    if (!fieldPattern.test(replacement)) throw new Error(`触发条件缺少 ${field}`);
    replacement = replacement.replace(fieldPattern, `$1${value}`);
  }
  return source.replace(triggerBlock, replacement);
}

async function loadEvents(eventDir, workspace) {
  const debuts = [];
  const ordinaryByChapter = new Map();
  const errors = [];

  for (const absolutePath of await collectYamlFiles(eventDir)) {
    const baseName = path.basename(absolutePath);
    const debutMatch = DEBUT_RE.exec(baseName);
    const ordinaryMatch = ORDINARY_RE.exec(baseName);
    if (!debutMatch && !ordinaryMatch) continue;

    let source;
    let data;
    try {
      source = await readFile(absolutePath, 'utf8');
      data = JSON.parse(source);
    } catch (error) {
      errors.push({
        file: path.relative(workspace, absolutePath).replaceAll(path.sep, '/'),
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const match = debutMatch || ordinaryMatch;
    const series = match[1];
    const chapter = parseChineseNumber(match[2]);
    const trigger = normalizeTime(data?.触发条件);
    if (!Number.isInteger(chapter) || !trigger || data?.触发条件?.类型 !== '时间') {
      errors.push({
        file: path.relative(workspace, absolutePath).replaceAll(path.sep, '/'),
        error: '回目或时间触发条件无效',
      });
      continue;
    }

    const record = {
      id: baseName.replace(/\.ya?ml$/iu, ''),
      file: path.relative(workspace, absolutePath).replaceAll(path.sep, '/'),
      absolutePath,
      source,
      data,
      series,
      chapter,
      trigger,
    };
    if (debutMatch) {
      debuts.push(record);
      continue;
    }

    const sequence = Number(ordinaryMatch[3]);
    if (sequence !== 1) continue;
    const key = `${series}:${chapter}`;
    if (ordinaryByChapter.has(key)) {
      errors.push({ file: record.file, error: `同回存在重复的 01 事件: ${key}` });
      continue;
    }
    ordinaryByChapter.set(key, record);
  }
  return { debuts, ordinaryByChapter, errors };
}

function findBirthYearConflicts(debut, target) {
  return Object.entries(debut.data?.insert || {})
    .filter(([, profile]) => Number.isFinite(profile?.出生年份) && profile.出生年份 > target.年)
    .map(([name, profile]) => ({ 人物: name, 出生年份: profile.出生年份 }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const workspace = process.cwd();
  const eventDir = path.resolve(workspace, options.eventDir);
  const { debuts, ordinaryByChapter, errors } = await loadEvents(eventDir, workspace);
  const planned = [];
  const blocked = [];

  for (const debut of debuts.sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'))) {
    const chapterFirst = ordinaryByChapter.get(`${debut.series}:${debut.chapter}`);
    if (!chapterFirst) {
      errors.push({ file: debut.file, error: '找不到本回 01 事件' });
      continue;
    }
    const target = previousCalendarMonth(chapterFirst.trigger);
    const birthConflicts = findBirthYearConflicts(debut, target);
    const change = {
      event: debut.id,
      file: debut.file,
      referenceEvent: chapterFirst.id,
      from: formatTime(debut.trigger),
      to: formatTime(target),
    };
    if (birthConflicts.length > 0) {
      blocked.push({
        ...change,
        reason: '目标年月早于登场包内人物的出生年份；需先拆分人物后才能同步',
        birthConflicts,
      });
      continue;
    }
    if (!isSameTime(debut.trigger, target)) {
      planned.push({ ...change, debut, target });
    }
  }

  const written = [];
  if (options.apply && errors.length === 0) {
    for (const change of planned) {
      const nextSource = replaceTriggerTime(change.debut.source, change.target);
      if (nextSource !== change.debut.source) {
        await writeFile(change.debut.absolutePath, nextSource, 'utf8');
        written.push(change.file);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        rule: '以本回 01 的完整触发时间为基准，仅将月字段 - 1；1 月回退上一年 12 月；日、时、分沿用 01',
        debutCount: debuts.length,
        plannedCount: planned.length,
        blockedCount: blocked.length,
        filesWritten: written.length,
        planned: planned.map(({ debut, target, ...change }) => change),
        blocked,
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
