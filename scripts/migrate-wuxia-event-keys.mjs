#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { formatChineseNumber, parseCanonicalEventKey, parseChineseNumber } from '../src/shared/eventKey.js';

const root = process.cwd();
const eventRoot = path.join(root, '世界书', '金庸群侠传1', '世界书');
const indexPaths = [
  path.join(root, '世界书', '金庸群侠传1', 'index.yaml'),
  path.join(root, '角色卡', '金庸群侠传', 'index.yaml'),
];
const locationMigrationPath = path.join(root, 'scripts', 'data', 'wuxia-location-migration.json');
const apply = process.argv.includes('--apply');
const TERMINAL_LABELS = new Set(['全书完', '待定', '无', '后续待续']);
const OLD_CHAPTER = '[0-9零一二三四五六七八九十百千万]+';
const OLD_ORDINARY = new RegExp(`^(.*)事件条目-第(${OLD_CHAPTER})回-(\\d+)-(.+)$`);
const OLD_DEBUT = new RegExp(`^(.*)登场事件-第(${OLD_CHAPTER})回(?:人物)?$`);

function readChapterNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  return parseChineseNumber(value);
}

function oldDescriptor(fileName) {
  const stem = fileName.replace(/\.ya?ml$/i, '');
  const ordinary = stem.match(OLD_ORDINARY);
  if (ordinary) {
    const [, series, chapterText, sequenceText, title] = ordinary;
    return {
      oldStem: stem,
      oldFile: fileName,
      series,
      chapterNumber: readChapterNumber(chapterText),
      sequence: Number(sequenceText),
      title,
      kind: 'ordinary',
    };
  }
  const debut = stem.match(OLD_DEBUT);
  if (debut) {
    const [, series, chapterText] = debut;
    return {
      oldStem: stem,
      oldFile: fileName,
      series,
      chapterNumber: readChapterNumber(chapterText),
      sequence: 0,
      title: '人物登场',
      kind: 'debut',
    };
  }
  return null;
}

function canonicalKey(descriptor) {
  const chapter = formatChineseNumber(descriptor.chapterNumber);
  if (!chapter || descriptor.sequence < 0 || descriptor.sequence > 99) {
    throw new Error(`无法生成规范事件键: ${descriptor.oldFile}`);
  }
  return `${descriptor.series}第${chapter}回${String(descriptor.sequence).padStart(2, '0')}-${descriptor.title}`;
}

const sourceFiles = fs.readdirSync(eventRoot).filter(file => /\.ya?ml$/i.test(file));
const catalog = sourceFiles.map(oldDescriptor).filter(Boolean);
const canonicalFiles = sourceFiles.filter(file => parseCanonicalEventKey(file));
if (catalog.length === 0 && canonicalFiles.length === 688) {
  console.log('事件键已经是 v3 规范格式，无需再次迁移。');
  process.exit(0);
}
if (catalog.length !== 688) throw new Error(`事件文件数应为 688，实际为 ${catalog.length}`);

const byNewKey = new Map();
const byTuple = new Map();
const oldToNew = new Map();
for (const descriptor of catalog) {
  descriptor.newKey = canonicalKey(descriptor);
  descriptor.newFile = `${descriptor.newKey}.yaml`;
  if (!parseCanonicalEventKey(descriptor.newKey)) throw new Error(`生成了非法规范键: ${descriptor.newKey}`);
  if (byNewKey.has(descriptor.newKey)) throw new Error(`规范键冲突: ${descriptor.newKey}`);
  const tuple = `${descriptor.series}|${descriptor.chapterNumber}|${descriptor.sequence}`;
  if (byTuple.has(tuple)) throw new Error(`作品/回目/序号冲突: ${tuple}`);
  byNewKey.set(descriptor.newKey, descriptor);
  byTuple.set(tuple, descriptor);
  oldToNew.set(descriptor.oldStem, descriptor.newKey);
  oldToNew.set(descriptor.oldFile, descriptor.newFile);
}

for (const descriptor of catalog) {
  const targetPath = path.join(eventRoot, descriptor.newFile);
  if (fs.existsSync(targetPath) && descriptor.oldFile !== descriptor.newFile) {
    throw new Error(`目标文件已存在: ${descriptor.newFile}`);
  }
}

function lookupTuple(series, chapterNumber, sequence, reference) {
  const target = byTuple.get(`${series}|${chapterNumber}|${sequence}`);
  if (!target) throw new Error(`找不到后续事件 ${reference}（${series} ${chapterNumber}-${sequence}）`);
  return target;
}

function resolveReference(reference, source) {
  const raw = String(reference || '').trim().replace(/\.(json|ya?ml|txt)$/i, '');
  if (!raw || TERMINAL_LABELS.has(raw)) return raw;
  if (parseCanonicalEventKey(raw)) {
    if (!byNewKey.has(raw)) throw new Error(`规范引用不存在: ${raw}`);
    return raw;
  }

  if (
    source.series === '神雕' &&
    source.chapterNumber === 11 &&
    source.sequence === 12 &&
    raw === '英雄宴次日杨过参与大宴'
  ) {
    return lookupTuple('神雕', 12, 1, raw).newKey;
  }
  if (source.series === '射雕' && source.chapterNumber === 22 && source.sequence === 13 && raw === '第35回-铁枪庙中') {
    return lookupTuple('射雕', 35, 4, raw).newKey;
  }
  if (source.series === '射雕' && source.chapterNumber === 35 && source.sequence === 4 && raw === '第36回-大军西征') {
    return lookupTuple('射雕', 36, 6, raw).newKey;
  }
  if (source.series === '射雕' && source.chapterNumber === 36 && source.sequence === 8 && raw === '第37回-从天而降') {
    return lookupTuple('射雕', 37, 1, raw).newKey;
  }

  const nextChapterPlaceholder = raw.match(new RegExp(`^第(${OLD_CHAPTER})回-(?:续|后续|相关事件|XX(?:-.*)?)$`));
  if (nextChapterPlaceholder) {
    return lookupTuple(source.series, readChapterNumber(nextChapterPlaceholder[1]), 1, raw).newKey;
  }

  const referenceForParsing = raw.replace(/-$/, '');
  const physical = referenceForParsing.match(new RegExp(`^(.*)?事件条目-第(${OLD_CHAPTER})回-(\\d+)(?:-(.+))?$`));
  const runtime = referenceForParsing.match(new RegExp(`^(.*)?第(${OLD_CHAPTER})回-?(\\d+)(?:-(.+))?$`));
  const match = physical || runtime;
  if (!match) throw new Error(`无法识别的后续事件引用: ${source.oldFile} -> ${raw}`);
  const [, explicitSeries = '', chapterText, sequenceText, referencedTitle = ''] = match;
  const series = explicitSeries || source.series;
  const target = lookupTuple(series, readChapterNumber(chapterText), Number(sequenceText), raw);
  if (referencedTitle && referencedTitle !== target.title) {
    throw new Error(`后续事件标题不匹配: ${source.oldFile} -> ${raw}，目标为 ${target.oldStem}`);
  }
  return target.newKey;
}

function rewriteExperiences(eventData, source) {
  for (const action of ['insert', 'update', 'delete']) {
    const actionData = eventData[action];
    if (!actionData || typeof actionData !== 'object' || Array.isArray(actionData)) continue;
    for (const [characterName, delta] of Object.entries(actionData)) {
      if (!delta || typeof delta !== 'object' || Array.isArray(delta)) continue;
      if (delta.经历 !== undefined) {
        if (delta.人物经历 !== undefined) {
          throw new Error(`${source.oldFile}.${action}.${characterName} 同时含 经历 与 人物经历`);
        }
        delta.人物经历 = delta.经历;
        delete delta.经历;
      }
      if (delta.人物经历 === undefined) continue;
      const experiences = delta.人物经历;
      if (!experiences || typeof experiences !== 'object' || Array.isArray(experiences)) {
        throw new Error(`${source.oldFile}.${action}.${characterName}.人物经历 不是对象`);
      }
      const entries = Object.entries(experiences);
      if (entries.some(([, experience]) => typeof experience !== 'string')) {
        throw new Error(`${source.oldFile}.${action}.${characterName}.人物经历 含非字符串内容`);
      }
      if (entries.length > 0) {
        delta.人物经历 = { [source.newKey]: entries.map(([, experience]) => experience).join('\n') };
      }
    }
  }
}

function rewriteTriggerReferences(value, source) {
  if (Array.isArray(value)) {
    value.forEach(child => rewriteTriggerReferences(child, source));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '事件完成' && typeof child === 'string') value[key] = resolveReference(child, source);
    else rewriteTriggerReferences(child, source);
  }
}

function rewriteEventData(eventData, source) {
  rewriteExperiences(eventData, source);
  rewriteTriggerReferences(eventData.触发条件, source);
  const followup = eventData.后续事件;
  if (!followup || typeof followup !== 'object' || Array.isArray(followup)) return eventData;
  if (typeof followup.事件名 === 'string') {
    followup.事件名 = resolveReference(followup.事件名, source);
    return eventData;
  }
  eventData.后续事件 = Object.fromEntries(
    Object.entries(followup).map(([reference, clue]) => [resolveReference(reference, source), clue]),
  );
  return eventData;
}

function rewriteIndex(indexPath) {
  let text = fs.readFileSync(indexPath, 'utf8');
  const beforeUidLines = text.split(/\r?\n/).filter(line => /^\s+uid:/.test(line));
  for (const descriptor of catalog) {
    text = text.split(descriptor.oldStem).join(descriptor.newKey);
  }
  const afterUidLines = text.split(/\r?\n/).filter(line => /^\s+uid:/.test(line));
  if (JSON.stringify(beforeUidLines) !== JSON.stringify(afterUidLines)) throw new Error(`UID 被意外修改: ${indexPath}`);
  const matched = catalog.filter(descriptor => text.includes(`名称: ${descriptor.newKey}`)).length;
  if (matched !== 688) throw new Error(`${indexPath} 未完整覆盖 688 个规范事件名（${matched}）`);
  return text;
}

const rewrittenEvents = new Map();
for (const descriptor of catalog) {
  const filePath = path.join(eventRoot, descriptor.oldFile);
  const eventData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const rewritten = rewriteEventData(eventData, descriptor);
  rewrittenEvents.set(descriptor.oldFile, `${JSON.stringify(rewritten, null, 2)}\n`);
}

const rewrittenIndexes = new Map(indexPaths.map(indexPath => [indexPath, rewriteIndex(indexPath)]));
const locationMigration = JSON.parse(fs.readFileSync(locationMigrationPath, 'utf8'));
locationMigration.eventLocationOverrides = Object.fromEntries(
  Object.entries(locationMigration.eventLocationOverrides || {}).map(([fileName, location]) => [
    oldToNew.get(fileName) || fileName,
    location,
  ]),
);

if (!apply) {
  console.log(`dry-run 通过: ${catalog.length} 个事件（普通 ${catalog.filter(x => x.kind === 'ordinary').length}，登场 ${catalog.filter(x => x.kind === 'debut').length}）`);
  console.log('使用 --apply 执行迁移。');
  process.exit(0);
}

for (const [fileName, content] of rewrittenEvents) fs.writeFileSync(path.join(eventRoot, fileName), content);
for (const [indexPath, content] of rewrittenIndexes) fs.writeFileSync(indexPath, content);
fs.writeFileSync(locationMigrationPath, `${JSON.stringify(locationMigration, null, 2)}\n`);

for (const [index, descriptor] of catalog.entries()) {
  const oldPath = path.join(eventRoot, descriptor.oldFile);
  const temporaryPath = path.join(eventRoot, `.event-key-migration-${String(index).padStart(4, '0')}.yaml`);
  fs.renameSync(oldPath, temporaryPath);
  descriptor.temporaryPath = temporaryPath;
}
for (const descriptor of catalog) fs.renameSync(descriptor.temporaryPath, path.join(eventRoot, descriptor.newFile));

console.log(`迁移完成: ${catalog.length} 个事件（普通 ${catalog.filter(x => x.kind === 'ordinary').length}，登场 ${catalog.filter(x => x.kind === 'debut').length}）`);
