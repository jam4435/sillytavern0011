#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';
import { wuxiaCalendarTimeToTotalHours } from '../src/shared/wuxiaCalendar.js';

const EVENT_NAME_RE = /^(.*?)事件条目-第(\d+)回-(\d+)-(.+)\.(?:ya?ml|json)$/u;
const OPENING_TIME_MARKER_RE =
  /次日|次晨|翌日|第二天|第三日|第[四五六七八九十\d]+日|过了[一二三四五六七八九十几数\d]+(?:日|天|月|年)|[一二三四五六七八九十几数\d]+(?:日|天|月|年)(?:后|来|间|过去)|连日|多日|不数日|数月|半年|大半年|月余|十余日|七日七夜|一日一夜|六年/u;
const FUTURE_TIME_MARKER_RE =
  /明日|明早|明晨|明晚|次日|次晨|翌日|后日|来日|第二天|第三日|第[四五六七八九十\d]+日|(?:半|[一二三四五六七八九十百几数\d]+)(?:时辰|日|天|月|年)后|不数日后|月余后|半年后|一年后/u;

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
  return wuxiaCalendarTimeToTotalHours(time);
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

function gapBucket(hours) {
  if (hours === null) return 'invalid';
  if (hours < 0) return 'overlap';
  if (hours === 0) return 'no-gap';
  if (hours <= 2) return '0-2h';
  if (hours <= 6) return '2-6h';
  if (hours <= 24) return '6-24h';
  if (hours <= 72) return '1-3d';
  if (hours <= 24 * 7) return '3-7d';
  if (hours <= 24 * 30) return '7-30d';
  return '>30d';
}

function extractOpeningTimeMarkers(detail) {
  if (typeof detail !== 'string') {
    return [];
  }
  const openingExcerpt = detail.slice(0, 320);
  return [...openingExcerpt.matchAll(new RegExp(OPENING_TIME_MARKER_RE, 'gu'))].map(match => match[0]);
}

function extractFutureTimeMarkerContexts(detail) {
  if (typeof detail !== 'string') {
    return [];
  }
  return [...detail.matchAll(new RegExp(FUTURE_TIME_MARKER_RE, 'gu'))].map(match => ({
    marker: match[0],
    context: detail.slice(Math.max(0, match.index - 80), Math.min(detail.length, match.index + match[0].length + 80)),
  }));
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
        后续事件: data?.后续事件 ?? null,
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
  const gapBuckets = {};
  const gapBucketsBySeries = {};
  const previousBySeries = new Map();
  for (const event of events) {
    seriesCounts[event.series] = (seriesCounts[event.series] ?? 0) + 1;
    durationBuckets[event.durationBucket] = (durationBuckets[event.durationBucket] ?? 0) + 1;

    const previous = previousBySeries.get(event.series) ?? null;
    const startHours = timeToEpochHours(normalizeTime(event.触发条件));
    const previousStartHours = previous ? timeToEpochHours(normalizeTime(previous.触发条件)) : null;
    const previousEndHours = previous ? timeToEpochHours(normalizeTime(previous.事件结束时间)) : null;
    const gapFromPreviousEndHours =
      startHours === null || previousEndHours === null ? null : startHours - previousEndHours;
    const gapFromPreviousStartHours =
      startHours === null || previousStartHours === null ? null : startHours - previousStartHours;
    const eventGapBucket = gapBucket(gapFromPreviousEndHours);
    const openingTimeMarkers = extractOpeningTimeMarkers(event.事件详情);

    event.previousEvent = previous
      ? {
          id: previous.id,
          file: previous.file,
          触发条件: previous.触发条件,
          事件结束时间: previous.事件结束时间,
          事件详情: typeof previous.事件详情 === 'string' ? previous.事件详情.slice(-600) : previous.事件详情,
        }
      : null;
    event.gapFromPreviousEndHours = gapFromPreviousEndHours;
    event.gapFromPreviousStartHours = gapFromPreviousStartHours;
    event.gapBucket = eventGapBucket;
    event.openingTimeMarkers = openingTimeMarkers;
    event.openingExcerpt = typeof event.事件详情 === 'string' ? event.事件详情.slice(0, 320) : null;

    if (previous) {
      gapBuckets[eventGapBucket] = (gapBuckets[eventGapBucket] ?? 0) + 1;
      gapBucketsBySeries[event.series] ??= {};
      gapBucketsBySeries[event.series][eventGapBucket] = (gapBucketsBySeries[event.series][eventGapBucket] ?? 0) + 1;
    }
    previousBySeries.set(event.series, event);
  }

  const eventsBySeries = new Map();
  for (const event of events) {
    const seriesEvents = eventsBySeries.get(event.series) ?? [];
    seriesEvents.push(event);
    eventsBySeries.set(event.series, seriesEvents);
  }
  for (const seriesEvents of eventsBySeries.values()) {
    for (let index = 0; index < seriesEvents.length; index += 1) {
      const event = seriesEvents[index];
      const next = seriesEvents[index + 1] ?? null;
      const endHours = timeToEpochHours(normalizeTime(event.事件结束时间));
      const nextStartHours = next ? timeToEpochHours(normalizeTime(next.触发条件)) : null;
      const startHours = timeToEpochHours(normalizeTime(event.触发条件));
      const futureTimeMarkerContexts = extractFutureTimeMarkerContexts(event.事件详情);

      event.nextEvent = next
        ? {
            id: next.id,
            file: next.file,
            触发条件: next.触发条件,
            事件结束时间: next.事件结束时间,
            事件详情: typeof next.事件详情 === 'string' ? next.事件详情.slice(0, 600) : next.事件详情,
          }
        : null;
      event.gapToNextStartHours = endHours === null || nextStartHours === null ? null : nextStartHours - endHours;
      event.startToNextStartHours = startHours === null || nextStartHours === null ? null : nextStartHours - startHours;
      event.futureTimeMarkerContexts = futureTimeMarkerContexts;
    }
  }

  const transitionCandidates = events.filter(event => event.openingTimeMarkers.length > 0);
  const forwardPlanCandidates = events.filter(event => event.futureTimeMarkerContexts.length > 0);
  const audit = {
    generatedAt: new Date().toISOString(),
    eventDir: path.relative(workspace, eventDir).replaceAll(path.sep, '/'),
    summary: {
      filesMatched: files.length,
      eventsParsed: events.length,
      parseIssueCount: parseIssues.length,
      seriesCounts,
      durationBuckets,
      adjacentPairCount: events.length - Object.keys(seriesCounts).length,
      gapBuckets,
      gapBucketsBySeries,
      transitionCandidateCount: transitionCandidates.length,
      forwardPlanCandidateCount: forwardPlanCandidates.length,
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

  const transitionAudit = {
    generatedAt: audit.generatedAt,
    candidateCount: transitionCandidates.length,
    reviewQuestion:
      '判断详情开头的次日/数日/半年等叙事锚点，是否与上一事件结束到本事件触发之间的 gapFromPreviousEndHours 相容。区分连续承接、蒙太奇/训练/旅行、回忆转述和无关背景。',
    candidates: transitionCandidates,
  };
  await writeFile(
    path.join(outputDir, 'transition-candidates.json'),
    `${JSON.stringify(transitionAudit, null, 2)}\n`,
    'utf8',
  );

  const transitionShards = splitEvenly(transitionCandidates, options.shardCount);
  await Promise.all(
    transitionShards.map((shard, index) =>
      writeFile(
        path.join(outputDir, `transition-review-shard-${String(index + 1).padStart(2, '0')}.json`),
        `${JSON.stringify(
          {
            shard: index + 1,
            shardCount: options.shardCount,
            candidateCount: shard.length,
            reviewQuestion: transitionAudit.reviewQuestion,
            candidates: shard,
          },
          null,
          2,
        )}\n`,
        'utf8',
      ),
    ),
  );

  const forwardPlanAudit = {
    generatedAt: audit.generatedAt,
    candidateCount: forwardPlanCandidates.length,
    reviewQuestion:
      '判断事件详情中的明日/次日/数日后等时间锚点是否是尚未兑现的未来计划；若是，核对后续事件指向和下一事件触发时间是否满足该计划。区分本事件内部已发生、未来约定、取消或改变、回忆转述。',
    candidates: forwardPlanCandidates,
  };
  await writeFile(
    path.join(outputDir, 'forward-plan-candidates.json'),
    `${JSON.stringify(forwardPlanAudit, null, 2)}\n`,
    'utf8',
  );

  const forwardPlanShards = splitEvenly(forwardPlanCandidates, options.shardCount);
  await Promise.all(
    forwardPlanShards.map((shard, index) =>
      writeFile(
        path.join(outputDir, `forward-plan-review-shard-${String(index + 1).padStart(2, '0')}.json`),
        `${JSON.stringify(
          {
            shard: index + 1,
            shardCount: options.shardCount,
            candidateCount: shard.length,
            reviewQuestion: forwardPlanAudit.reviewQuestion,
            candidates: shard,
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
        transitionShardSizes: transitionShards.map(shard => shard.length),
        forwardPlanShardSizes: forwardPlanShards.map(shard => shard.length),
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
