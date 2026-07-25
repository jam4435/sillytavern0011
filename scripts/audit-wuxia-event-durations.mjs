#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';

const EVENT_NAME_RE = /^(.*?)事件条目-第(\d+)回-(\d+)-(.+)\.(?:ya?ml|json)$/u;

function parseArgs(argv) {
  const options = {
    eventDir: '世界书',
    outputDir: 'plans/武侠事件时长审计',
    shardCount: 3,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--event-dir') {
      options.eventDir = argv[++index];
    } else if (argument === '--output-dir') {
      options.outputDir = argv[++index];
    } else if (argument === '--shards') {
      options.shardCount = Number.parseInt(argv[++index], 10);
    } else if (argument === '--help' || argument === '-h') {
      console.log(
        [
          'Usage: node scripts/audit-wuxia-event-durations.mjs [options]',
          '',
          'Options:',
          '  --event-dir <dir>   Recursively scan this directory (default: 世界书)',
          '  --output-dir <dir>  Write extracted audit files here',
          '  --shards <count>    Split events into this many review shards (default: 3)',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(options.shardCount) || options.shardCount < 1) {
    throw new Error('--shards must be a positive integer');
  }
  return options;
}

async function collectEventFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectEventFiles(entryPath)));
    } else if (entry.isFile() && EVENT_NAME_RE.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function normalizeTime(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const year = Number(value.年);
  const month = Number(value.月);
  const day = Number(value.日);
  const hour = Number(value.时 ?? 0);
  if (![year, month, day, hour].every(Number.isFinite)) {
    return null;
  }
  return { 年: year, 月: month, 日: day, 时: hour };
}

function timeToEpochHours(time) {
  if (time === null) {
    return null;
  }
  return Date.UTC(time.年, time.月 - 1, time.日, time.时) / 3_600_000;
}

function compareEvents(left, right) {
  return (
    left.series.localeCompare(right.series, 'zh-CN') ||
    left.chapter - right.chapter ||
    left.sequence - right.sequence ||
    left.file.localeCompare(right.file, 'zh-CN')
  );
}

function durationBucket(hours) {
  if (hours === null) return 'invalid';
  if (hours <= 0) return 'nonpositive';
  if (hours <= 2) return '0-2h';
  if (hours <= 6) return '2-6h';
  if (hours <= 12) return '6-12h';
  if (hours <= 24) return '12-24h';
  if (hours <= 72) return '1-3d';
  if (hours <= 24 * 7) return '3-7d';
  if (hours <= 24 * 30) return '7-30d';
  return '>30d';
}

function splitEvenly(items, shardCount) {
  return Array.from({ length: shardCount }, (_, shardIndex) => {
    const start = Math.floor((items.length * shardIndex) / shardCount);
    const end = Math.floor((items.length * (shardIndex + 1)) / shardCount);
    return items.slice(start, end);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspace = process.cwd();
  const eventDir = path.resolve(workspace, options.eventDir);
  const outputDir = path.resolve(workspace, options.outputDir);
  const files = await collectEventFiles(eventDir);
  const events = [];
  const parseIssues = [];

  for (const file of files) {
    const match = EVENT_NAME_RE.exec(path.basename(file));
    try {
      const source = await readFile(file, 'utf8');
      const data = YAML.parse(source);
      const trigger = data?.触发条件 ?? null;
      const end = data?.事件结束时间 ?? null;
      const normalizedStart = normalizeTime(trigger);
      const normalizedEnd = normalizeTime(end);
      const startHours = timeToEpochHours(normalizedStart);
      const endHours = timeToEpochHours(normalizedEnd);
      const durationHours = startHours === null || endHours === null ? null : endHours - startHours;

      events.push({
        id: `${match[1]}第${Number(match[2])}回-${match[3]}-${match[4]}`,
        series: match[1],
        chapter: Number(match[2]),
        sequence: Number(match[3]),
        title: match[4],
        file: path.relative(workspace, file).replaceAll(path.sep, '/'),
        触发条件: trigger,
        事件结束时间: end,
        durationHours,
        durationBucket: durationBucket(durationHours),
        事件详情: data?.事件详情 ?? null,
      });
    } catch (error) {
      parseIssues.push({
        file: path.relative(workspace, file).replaceAll(path.sep, '/'),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  events.sort(compareEvents);
  const seriesCounts = {};
  const durationBuckets = {};
  for (const event of events) {
    seriesCounts[event.series] = (seriesCounts[event.series] ?? 0) + 1;
    durationBuckets[event.durationBucket] = (durationBuckets[event.durationBucket] ?? 0) + 1;
  }

  const audit = {
    generatedAt: new Date().toISOString(),
    eventDir: path.relative(workspace, eventDir).replaceAll(path.sep, '/'),
    summary: {
      filesMatched: files.length,
      eventsParsed: events.length,
      parseIssueCount: parseIssues.length,
      seriesCounts,
      durationBuckets,
    },
    parseIssues,
    events,
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'extracted-events.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

  const shards = splitEvenly(events, options.shardCount);
  await Promise.all(
    shards.map((shard, index) =>
      writeFile(
        path.join(outputDir, `review-shard-${String(index + 1).padStart(2, '0')}.json`),
        `${JSON.stringify(
          {
            shard: index + 1,
            shardCount: options.shardCount,
            eventCount: shard.length,
            reviewQuestion:
              '仅根据触发条件、事件结束时间和事件详情，判断标注时长是否明显短于叙事中必须经过的时间。不要把纯回忆或背景叙述当作当前事件持续时间。',
            events: shard,
          },
          null,
          2,
        )}\n`,
        'utf8',
      ),
    ),
  );

  console.log(
    JSON.stringify(
      {
        outputDir: path.relative(workspace, outputDir).replaceAll(path.sep, '/'),
        ...audit.summary,
        shardSizes: shards.map(shard => shard.length),
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
