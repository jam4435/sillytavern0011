#!/usr/bin/env node

/**
 * Build the runtime event catalog from the event YAML files.
 *
 * The YAML files are the source of truth.  This script intentionally does not
 * read a Tavern worldbook: a worldbook is a runtime transport format and has
 * considerably more overhead than the source files used to build the card.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse as parseYaml } from 'yaml';
import { buildOpeningEventSummary } from './lib/wuxia-event-summary.mjs';
import {
  getSingleConditionTimeAnchor,
  isPureTimeTrigger,
  normalizeFollowupEvents,
  validateAndNormalizeEventDefinition,
} from '../src/事件脚本/era-event-schema.js';
import {
  getLocationScopePath,
  normalizeLocationPath,
  parseLocationPath,
} from '../src/shared/locationPath.js';
import {
  EVENT_KIND,
  EVENT_RUNTIME_KEY_VERSION,
  looksLikeEventEntryName,
  parseCanonicalEventKey,
  stripEventFileSuffix,
} from '../src/shared/eventKey.js';

const root = process.cwd();
const sourceRoot = path.join(root, '世界书');
const outputRoot = path.join(root, 'src', '事件脚本', 'generated', 'event-data');
const openingEventSummaryPath = path.join(root, 'src', '武侠', 'data', '事件信息汇总.json');
const locationTablePath = path.join(root, 'src', '武侠', '射雕神雕地点表.yaml');
const RUNTIME_KEY_VERSION = EVENT_RUNTIME_KEY_VERSION;
const SHARD_MAX_EVENTS = 50;
const SHARD_MAX_BYTES = 350 * 1024;
const CHECKPOINT_INTERVAL = 100;
const DISCOVERY_HOURS = 10 * 24;
const STRICT_VALIDATION = process.argv.includes('--strict');
const NON_EVENT_FOLLOWUP_LABELS = new Set(['全书完', '待定', '无', '后续待续']);
const EVENT_STATE_PATH_ROOTS = ['事件系统', '世界事件', '参与事件', '事件分支结果', '事件结局状态'];

const EVENT_KINDS = Object.freeze({
  ordinary: EVENT_KIND.ORDINARY,
  debut: EVENT_KIND.DEBUT,
  growth: EVENT_KIND.GROWTH,
});
const locationTable = parseYaml(fs.readFileSync(locationTablePath, 'utf8'));
const validLocationScopes = new Set(
  Object.entries(locationTable).flatMap(([area, regions]) =>
    Object.entries(regions).flatMap(([region, locations]) => locations.map(location => `${area}/${region}/${location}`)),
  ),
);

function stripSuffix(value) {
  return stripEventFileSuffix(value);
}

function descriptorFor(sourceName) {
  return parseCanonicalEventKey(sourceName);
}

function timeToHours(time) {
  if (!time || typeof time !== 'object') return null;
  const year = Number(time.年);
  const month = Number(time.月);
  const day = Number(time.日);
  if (![year, month, day].every(Number.isFinite)) return null;
  return (year * 365 + month * 30 + day) * 24 + Number(time.时 || 0);
}

function hoursToTime(hours) {
  const year = Math.floor(hours / (365 * 24));
  let remainder = hours % (365 * 24);
  let month = Math.floor(remainder / (30 * 24));
  remainder %= 30 * 24;
  let day = Math.floor(remainder / 24);
  const hour = remainder % 24;
  if (day === 0) {
    day = 30;
    month -= 1;
  }
  if (month === 0) {
    month = 12;
    return { 年: year - 1, 月: month, 日: day, 时: hour };
  }
  return { 年: year, 月: month, 日: day, 时: hour };
}

function normalizeLocation(location) {
  return normalizeLocationPath(location);
}

function isResolvableEventReference(reference) {
  return parseCanonicalEventKey(reference) !== null;
}

function normalizeEventData(runtimeKey, descriptor, data) {
  const shared = validateAndNormalizeEventDefinition(runtimeKey, data);
  if (!shared.valid) throw new Error(shared.errors.join('；'));
  data = shared.data;
  if (!data.触发条件) throw new Error(`事件 ${runtimeKey} 缺少有效触发条件`);
  const locationErrors = [];
  const validateNestedLocations = (value, pathSegments = []) => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => validateNestedLocations(child, [...pathSegments, index]));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...pathSegments, key];
      if (key === '所在位置') {
        const parsed = parseLocationPath(child);
        if (!parsed) locationErrors.push(`${nextPath.join('.')} 必须是三级或四级完整路径`);
        else if (!validLocationScopes.has(parsed.scopePath)) {
          locationErrors.push(`${nextPath.join('.')} 的严格活动区不在地点表中: ${parsed.scopePath}`);
        }
      } else {
        validateNestedLocations(child, nextPath);
      }
    }
  };
  validateNestedLocations(data);
  if (locationErrors.length > 0) throw new Error(`事件 ${runtimeKey} 地点无效: ${locationErrors.join('；')}`);
  if (descriptor.kind !== EVENT_KINDS.ordinary) return data;
  const location = normalizeLocation(data.事件地点);
  const hook = typeof data.事件引子 === 'string' ? data.事件引子.trim() : '';
  const summary = typeof data.事件概要 === 'string' ? data.事件概要.trim() : '';
  const participants = Array.isArray(data.参与人物)
    ? [
        ...new Set(
          data.参与人物
            .filter(value => typeof value === 'string')
            .map(value => value.trim())
            .filter(Boolean),
        ),
      ]
    : [];
  const errors = [];
  if (!parseLocationPath(location)) errors.push('事件地点必须是三级或四级完整路径');
  else if (!validLocationScopes.has(getLocationScopePath(location))) errors.push('事件地点的严格活动区不在地点表中');
  if (!hook) errors.push('事件引子不能为空');
  if (!summary) errors.push('事件概要不能为空');
  if (!Array.isArray(data.参与人物) || participants.length === 0) errors.push('参与人物必须是非空字符串数组');
  if (errors.length) throw new Error(`事件 ${runtimeKey} 无效: ${errors.join('；')}`);
  return { ...data, 事件地点: location, 事件引子: hook, 事件概要: summary, 参与人物: participants };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key])]),
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function eventSortKey(event) {
  const chapter = event.chapterNumber;
  const sequence = Number(event.sequence || 0);
  return [event.triggerHour ?? Number.MAX_SAFE_INTEGER, event.series, chapter, sequence, event.runtimeKey];
}

function compareEvents(left, right) {
  const a = eventSortKey(left);
  const b = eventSortKey(right);
  for (let index = 0; index < a.length; index++) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

function cloneJson(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function mergePlainObject(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key]) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      mergePlainObject(target[key], value);
    } else {
      target[key] = cloneJson(value);
    }
  }
  return target;
}

function normalizeCharacterDelta(delta) {
  const normalized = cloneJson(delta || {});
  if (!normalized?.人物经历 || typeof normalized.人物经历 !== 'object' || Array.isArray(normalized.人物经历)) {
    return normalized;
  }
  normalized.人物经历 = Object.fromEntries(Object.entries(normalized.人物经历));
  return normalized;
}

function validateTriggerReferences(value, event, byKey, pathSegments = ['触发条件']) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => validateTriggerReferences(child, event, byKey, [...pathSegments, index]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...pathSegments, key];
    if (key === '事件完成') {
      if (typeof child !== 'string' || !parseCanonicalEventKey(child) || !byKey.has(child)) {
        throw new Error(`事件 ${event.runtimeKey} 的 ${childPath.join('.')} 不是已存在的规范事件键: ${child}`);
      }
      continue;
    }
    if (key === '变量' && typeof child === 'string' && EVENT_STATE_PATH_ROOTS.some(rootKey => child.includes(rootKey))) {
      const referencedKeys = [...byKey.keys()].filter(runtimeKey => child.includes(runtimeKey));
      if (referencedKeys.length !== 1) {
        throw new Error(`事件 ${event.runtimeKey} 的 ${childPath.join('.')} 未唯一引用规范事件键: ${child}`);
      }
    }
    validateTriggerReferences(child, event, byKey, childPath);
  }
}

function validateMachineReferences(events, byKey) {
  for (const event of events) {
    for (const action of ['insert', 'update', 'delete']) {
      for (const [characterName, delta] of Object.entries(event.definition[action] || {})) {
        const experiences = delta?.人物经历;
        if (experiences === undefined) continue;
        if (!experiences || typeof experiences !== 'object' || Array.isArray(experiences)) {
          throw new Error(`事件 ${event.runtimeKey}.${action}.${characterName}.人物经历 必须是对象`);
        }
        for (const experienceKey of Object.keys(experiences)) {
          if (experienceKey !== event.runtimeKey) {
            throw new Error(
              `事件 ${event.runtimeKey}.${action}.${characterName}.人物经历 使用了非本事件规范键: ${experienceKey}`,
            );
          }
        }
      }
    }

    for (const reference of Object.keys(normalizeFollowupEvents(event.definition.后续事件))) {
      if (NON_EVENT_FOLLOWUP_LABELS.has(reference)) continue;
      if (!parseCanonicalEventKey(reference)) {
        throw new Error(`事件 ${event.runtimeKey} 使用了非规范后续事件引用: ${reference}`);
      }
      if (!byKey.has(reference)) throw new Error(`事件 ${event.runtimeKey} 的后续事件不存在: ${reference}`);
    }
    validateTriggerReferences(event.definition.触发条件, event, byKey);
  }
}

function deleteByObject(target, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
      if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]))
        deleteByObject(target[key], value);
      if (
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key]) &&
        Object.keys(target[key]).length === 0
      )
        delete target[key];
    } else {
      delete target[key];
    }
  }
}

function applyEventCharacterOperations(characterState, event) {
  for (const [characterName, delta] of Object.entries(event.definition.insert || {})) {
    const target = (characterState[characterName] ||= {});
    mergePlainObject(target, normalizeCharacterDelta(delta));
  }
  for (const [characterName, delta] of Object.entries(event.definition.update || {})) {
    const target = (characterState[characterName] ||= {});
    mergePlainObject(target, normalizeCharacterDelta(delta));
  }
  for (const [characterName, patch] of Object.entries(event.definition.delete || {})) {
    if (characterState[characterName]) deleteByObject(characterState[characterName], patch);
  }
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

function collectEvents() {
  const sourceFiles = walkYamlFiles(sourceRoot);
  const events = [];
  const keys = new Set();
  for (const filePath of sourceFiles.sort()) {
    const sourceName = path.basename(filePath);
    const descriptor = descriptorFor(sourceName);
    if (!descriptor && looksLikeEventEntryName(sourceName)) {
      throw new Error(`非规范事件文件名: ${sourceName}`);
    }
    if (!descriptor) continue;
    const runtimeKey = descriptor.runtimeKey;
    if (keys.has(runtimeKey)) throw new Error(`runtimeKey 冲突: ${runtimeKey} (${sourceName})`);
    const parsed = parseYaml(fs.readFileSync(filePath, 'utf8'));
    const eventData = normalizeEventData(runtimeKey, descriptor, parsed);
    const triggerCondition = eventData.触发条件;
    const triggerTime = getSingleConditionTimeAnchor(triggerCondition);
    const triggerHour = timeToHours(triggerTime);
    const conditional = !isPureTimeTrigger(triggerCondition);
    if (!conditional && triggerHour === null) throw new Error(`事件 ${runtimeKey} 缺少有效时间触发条件`);
    const endHour = timeToHours(eventData.事件结束时间);
    if (endHour !== null && triggerHour !== null && endHour < triggerHour)
      throw new Error(`事件 ${runtimeKey} 的结束时间早于触发时间`);
    const relativeDurationHours = eventData.事件持续时间
      ? Number(eventData.事件持续时间.日 || 0) * 24 + Number(eventData.事件持续时间.时 || 0)
      : null;
    const normalizedFollowups = normalizeFollowupEvents(eventData.后续事件);
    // Narrative labels such as “全书完”, “待定”, or “第3回-相关事件” are
    // intentionally not graph edges. They remain in the source definition but
    // do not participate in predecessor validation/indexing.
    const followups = Object.fromEntries(
      Object.entries(normalizedFollowups).filter(([reference]) => isResolvableEventReference(reference)),
    );
    const definition = JSON.parse(JSON.stringify(eventData));
    if (eventData.后续事件) definition.后续事件 = normalizedFollowups;
    const definitionJson = JSON.stringify(stableValue(definition));
    keys.add(runtimeKey);
    events.push({
      runtimeKey,
      sourceName: stripSuffix(sourceName),
      kind: descriptor.kind,
      series: descriptor.series,
      chapter: descriptor.chapter,
      chapterNumber: descriptor.chapterNumber,
      sequence: descriptor.sequence ? Number(descriptor.sequence) : 0,
      title: descriptor.title || null,
      triggerCondition,
      triggerTime,
      triggerHour,
      conditional,
      endTime: eventData.事件结束时间 || null,
      endHour,
      eventDuration: eventData.事件持续时间 || null,
      durationHours:
        relativeDurationHours ??
        (endHour === null || triggerHour === null ? null : Math.max(0, endHour - triggerHour)),
      discoveryHour: triggerHour === null ? null : triggerHour - DISCOVERY_HOURS,
      location: normalizeLocation(eventData.事件地点),
      intro: eventData.事件引子 || null,
      summary: eventData.事件概要 || null,
      participants: Array.isArray(eventData.参与人物) ? eventData.参与人物 : [],
      followups,
      branchMarkers: eventData.分支标记 || null,
      hash: sha256(definitionJson),
      definition,
    });
  }
  events.sort(compareEvents);
  const byKey = new Map(events.map(event => [event.runtimeKey, event]));
  validateMachineReferences(events, byKey);
  const unresolvedReferences = [];
  for (const event of events) {
    for (const targetRuntimeKey of Object.keys(event.followups)) {
      if (!byKey.has(targetRuntimeKey)) {
        unresolvedReferences.push({ sourceRuntimeKey: event.runtimeKey, targetRuntimeKey });
      }
    }
  }
  if (STRICT_VALIDATION && unresolvedReferences.length > 0) {
    throw new Error(`严格校验失败: ${unresolvedReferences.length} 条后续事件引用在当前源文件中找不到目标`);
  }
  return { events, unresolvedReferences };
}

function writeOpeningEventSummary(events) {
  const summary = buildOpeningEventSummary(events);
  fs.mkdirSync(path.dirname(openingEventSummaryPath), { recursive: true });
  fs.writeFileSync(openingEventSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function createShards(events) {
  const shards = [];
  let current = [];
  const flush = () => {
    if (current.length === 0) return;
    const id = `shard-${String(shards.length + 1).padStart(4, '0')}`;
    const definitions = Object.fromEntries(current.map(event => [event.runtimeKey, event.definition]));
    // Shards are intentionally compact: unlike the manifest, humans normally
    // do not review them, and compact output keeps the configured byte ceiling
    // meaningful for cold-start network cost.
    const content = `${JSON.stringify({ schemaVersion: 1, id, definitions })}\n`;
    shards.push({ id, content, events: current });
    current = [];
  };
  for (const event of events) {
    const candidate = [...current, event];
    const candidateDefinitions = Object.fromEntries(candidate.map(item => [item.runtimeKey, item.definition]));
    const bytes = Buffer.byteLength(JSON.stringify({ schemaVersion: 1, definitions: candidateDefinitions }));
    if (current.length > 0 && (candidate.length > SHARD_MAX_EVENTS || bytes > SHARD_MAX_BYTES)) flush();
    current.push(event);
  }
  flush();
  return shards;
}

function buildCheckpoints(events) {
  const completedEvents = events.filter(event => !event.conditional && Number.isFinite(event.triggerHour)).sort(
    (left, right) =>
      (left.endHour ?? left.triggerHour) - (right.endHour ?? right.triggerHour) || compareEvents(left, right),
  );
  const checkpoints = [];
  const characterState = {};
  let appliedCount = 0;
  for (let index = CHECKPOINT_INTERVAL; index <= completedEvents.length; index += CHECKPOINT_INTERVAL) {
    const through = completedEvents.slice(0, index);
    while (appliedCount < index) {
      applyEventCharacterOperations(characterState, completedEvents[appliedCount]);
      appliedCount += 1;
    }
    const throughHour = through.at(-1).endHour ?? through.at(-1).triggerHour;
    checkpoints.push({
      id: `checkpoint-${String(checkpoints.length + 1).padStart(4, '0')}`,
      schemaVersion: 1,
      manifestRuntimeKeyVersion: RUNTIME_KEY_VERSION,
      completedCount: index,
      throughRuntimeKey: through.at(-1).runtimeKey,
      throughTime: hoursToTime(throughHour),
      throughHour,
      completedRuntimeKeys: through.map(event => event.runtimeKey),
      characterState: cloneJson(characterState),
    });
  }
  return checkpoints;
}

function writeAssets(events, unresolvedReferences) {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(outputRoot, 'shards'), { recursive: true });
  fs.mkdirSync(path.join(outputRoot, 'checkpoints'), { recursive: true });
  const shards = createShards(events);
  const shardByKey = new Map();
  for (const shard of shards) {
    const file = `${shard.id}.json`;
    fs.writeFileSync(path.join(outputRoot, 'shards', file), shard.content);
    for (const event of shard.events) shardByKey.set(event.runtimeKey, { id: shard.id, file });
  }
  const checkpoints = buildCheckpoints(events);
  for (const checkpoint of checkpoints) {
    fs.writeFileSync(
      path.join(outputRoot, 'checkpoints', `${checkpoint.id}.json`),
      `${JSON.stringify(checkpoint, null, 2)}\n`,
    );
  }
  const manifestEvents = events.map((event, index) => {
    const shard = shardByKey.get(event.runtimeKey);
    return {
      runtimeKey: event.runtimeKey,
      sourceName: event.sourceName,
      kind: event.kind,
      series: event.series,
      chapter: event.chapter,
      order: index,
      sequence: event.sequence,
      title: event.title,
      triggerTime: event.triggerTime,
      triggerHour: event.triggerHour,
      endTime: event.endTime,
      endHour: event.endHour,
      durationHours: event.durationHours,
      discoveryHour: event.discoveryHour,
      location: event.location,
      intro: event.intro,
      summary: event.summary,
      participants: event.participants,
      ...(event.conditional ? { triggerCondition: event.triggerCondition, conditional: true } : {}),
      ...(event.eventDuration ? { eventDuration: event.eventDuration } : {}),
      ...(Object.keys(event.followups).length > 0 ? { followups: event.followups } : {}),
      ...(event.branchMarkers ? { branchMarkers: event.branchMarkers } : {}),
      hash: event.hash,
      shardId: shard.id,
    };
  });
  const byLocation = {};
  for (const event of manifestEvents) {
    const scopePath = getLocationScopePath(event.location);
    if (scopePath) (byLocation[scopePath] ||= []).push(event.runtimeKey);
  }
  const byTrigger = [...manifestEvents]
    .filter(event => !event.conditional && Number.isFinite(event.triggerHour))
    .sort((a, b) => a.triggerHour - b.triggerHour || a.order - b.order)
    .map(event => ({ hour: event.triggerHour, runtimeKey: event.runtimeKey }));
  const byDiscovery = [...manifestEvents]
    .filter(event => Number.isFinite(event.discoveryHour))
    .sort((a, b) => a.discoveryHour - b.discoveryHour || a.order - b.order)
    .map(event => ({ hour: event.discoveryHour, runtimeKey: event.runtimeKey }));
  const byEnd = [...manifestEvents]
    .filter(event => event.endHour !== null)
    .sort((a, b) => a.endHour - b.endHour || a.order - b.order)
    .map(event => ({ hour: event.endHour, runtimeKey: event.runtimeKey }));
  const manifest = {
    schemaVersion: 1,
    eventRuntimeKeyVersion: RUNTIME_KEY_VERSION,
    eventCount: manifestEvents.length,
    shardCount: shards.length,
    checkpointInterval: CHECKPOINT_INTERVAL,
    events: manifestEvents,
    shards: shards.map(shard => ({
      id: shard.id,
      file: `shards/${shard.id}.json`,
      eventCount: shard.events.length,
      firstRuntimeKey: shard.events[0].runtimeKey,
      lastRuntimeKey: shard.events.at(-1).runtimeKey,
      byteLength: Buffer.byteLength(shard.content),
    })),
    checkpoints: checkpoints.map(checkpoint => ({
      id: checkpoint.id,
      file: `checkpoints/${checkpoint.id}.json`,
      completedCount: checkpoint.completedCount,
      throughHour: checkpoint.throughHour,
    })),
    indexes: {
      byTrigger,
      byDiscovery,
      byEnd,
      byLocation,
      conditional: manifestEvents.filter(event => event.conditional).map(event => event.runtimeKey),
    },
    unresolvedReferences,
  };
  // Consumers compare this deterministic hash to detect catalog changes.
  manifest.contentHash = sha256(JSON.stringify(stableValue(manifest)));
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function main() {
  const { events, unresolvedReferences } = collectEvents();
  const manifest = writeAssets(events, unresolvedReferences);
  const openingEventSummary = writeOpeningEventSummary(events);
  console.log(
    `生成事件运行时资产: ${manifest.eventCount} 个事件, ${manifest.shardCount} 个分片, ${manifest.checkpoints.length} 个检查点`,
  );
  console.log(`同步开局事件汇总: ${openingEventSummary.length} 个普通事件`);
  console.log(`manifest hash: ${manifest.contentHash}`);
  if (unresolvedReferences.length > 0) {
    console.warn(`警告: ${unresolvedReferences.length} 条后续事件引用在当前源文件中找不到目标，已保留为非图边。`);
  }
}

main();
