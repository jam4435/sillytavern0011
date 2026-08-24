#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse as parseYaml } from 'yaml';
import { getSingleConditionTimeAnchor, isPureTimeTrigger } from '../src/事件脚本/era-event-schema.js';
import { looksLikeEventEntryName, parseCanonicalEventKey } from '../src/shared/eventKey.js';
import { totalHoursToWuxiaCalendarTime, wuxiaCalendarTimeToTotalHours } from '../src/shared/wuxiaCalendar.js';
import {
  createCompletionCandidatesDocument,
  createMartialArtsAuditDocument,
  materializeCharacterMartialArts,
} from './lib/wuxia-character-martial-arts.mjs';
import {
  createSectAssignmentCandidatesDocument,
  createSectLineageDocument,
  validateSectReviewDocuments,
} from './lib/wuxia-sect-martial-arts.mjs';

const root = process.cwd();

function parseArguments(argv) {
  const result = {
    eventDir: path.join(root, '世界书', '金庸群侠传1', '世界书'),
    databasePath: path.join(root, 'src', '武侠', 'data', '_合并后功法.json'),
    outputDir: path.join(root, 'plans', '武侠角色功法审计'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) continue;
    if (key === '--event-dir') result.eventDir = path.resolve(root, value);
    if (key === '--database') result.databasePath = path.resolve(root, value);
    if (key === '--output-dir') result.outputDir = path.resolve(root, value);
    if (['--event-dir', '--database', '--output-dir'].includes(key)) index += 1;
  }
  return result;
}

function walkYamlFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkYamlFiles(entryPath));
    else if (entry.isFile() && /\.(?:yaml|yml)$/i.test(entry.name)) result.push(entryPath);
  }
  return result;
}

function timeToHours(time) {
  if (!time || typeof time !== 'object') return null;
  const year = Number(time.年);
  const month = Number(time.月);
  const day = Number(time.日);
  if (![year, month, day].every(Number.isFinite)) return null;
  return wuxiaCalendarTimeToTotalHours(time);
}

function collectEvents(eventDir) {
  const events = [];
  const keys = new Set();
  for (const filePath of walkYamlFiles(eventDir).sort()) {
    const sourceName = path.basename(filePath);
    const descriptor = parseCanonicalEventKey(sourceName);
    if (!descriptor && looksLikeEventEntryName(sourceName)) throw new Error(`非规范事件文件名: ${sourceName}`);
    if (!descriptor) continue;
    if (keys.has(descriptor.runtimeKey)) throw new Error(`runtimeKey 冲突: ${descriptor.runtimeKey}`);
    keys.add(descriptor.runtimeKey);
    const definition = parseYaml(fs.readFileSync(filePath, 'utf8'));
    const triggerTime = getSingleConditionTimeAnchor(definition.触发条件);
    const triggerHour = timeToHours(triggerTime);
    const endTime = definition.事件结束时间 || null;
    const endHour = timeToHours(endTime);
    const conditional = !isPureTimeTrigger(definition.触发条件);
    const effectHour = endHour ?? triggerHour;
    events.push({
      runtimeKey: descriptor.runtimeKey,
      sourceName,
      kind: descriptor.kind,
      series: descriptor.series,
      chapterNumber: descriptor.chapterNumber,
      sequence: descriptor.sequence ? Number(descriptor.sequence) : 0,
      triggerTime,
      triggerHour,
      endTime,
      endHour,
      effectHour,
      effectTime: Number.isFinite(effectHour) ? totalHoursToWuxiaCalendarTime(effectHour) : null,
      conditional,
      definition,
    });
  }
  return events;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relativeFromRoot(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const events = collectEvents(options.eventDir);
  const database = JSON.parse(fs.readFileSync(options.databasePath, 'utf8'));
  const materialized = materializeCharacterMartialArts(events);
  const metadata = {
    sourceRoot: relativeFromRoot(options.eventDir),
    databasePath: relativeFromRoot(options.databasePath),
    generatedAt: new Date().toISOString(),
    eventCount: events.length,
  };
  const audit = createMartialArtsAuditDocument(materialized, database, metadata);
  const candidates = createCompletionCandidatesDocument(materialized, database, metadata);
  const sectLineages = createSectLineageDocument(materialized, database, metadata);
  const sectAssignments = createSectAssignmentCandidatesDocument(materialized, sectLineages, metadata);
  const sectValidationErrors = validateSectReviewDocuments(sectLineages, sectAssignments, database, materialized);
  if (sectValidationErrors.length > 0) {
    throw new Error(`门派功法审核稿校验失败:\n- ${sectValidationErrors.join('\n- ')}`);
  }
  fs.mkdirSync(options.outputDir, { recursive: true });
  const auditPath = path.join(options.outputDir, '角色功法总表.json');
  const candidatesPath = path.join(options.outputDir, '角色功法补全候选.json');
  const sectLineagesPath = path.join(options.outputDir, '门派功法谱系.json');
  const sectAssignmentsPath = path.join(options.outputDir, '门派角色功法分配候选.json');
  writeJson(auditPath, audit);
  writeJson(candidatesPath, candidates);
  writeJson(sectLineagesPath, sectLineages);
  writeJson(sectAssignmentsPath, sectAssignments);
  console.log(`角色功法总表: ${relativeFromRoot(auditPath)} (${audit.统计.角色数} 个角色)`);
  console.log(`功法补全候选: ${relativeFromRoot(candidatesPath)} (${candidates.统计.候选角色数} 个角色)`);
  console.log(`门派功法谱系: ${relativeFromRoot(sectLineagesPath)} (${sectLineages.统计.门派或体系数} 个体系)`);
  console.log(`门派角色分配候选: ${relativeFromRoot(sectAssignmentsPath)} (${sectAssignments.统计.候选角色数} 个角色)`);
  console.log(`确定性重放事件: ${materialized.deterministicEvents.length}/${events.length}`);
}

main();
