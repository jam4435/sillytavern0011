#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse as parseYaml } from 'yaml';
import { getLocationScopePath, normalizeLocationPath, parseLocationPath } from '../src/shared/locationPath.js';

const root = process.cwd();
const sourceDirectory = path.join(root, '世界书', '金庸群侠传1', '世界书');
const mapPath = path.join(root, 'src', '武侠', '射雕神雕地点表.yaml');
const ledgerPath = path.join(root, 'scripts', 'data', 'wuxia-location-migration.json');
const shouldApply = process.argv.includes('--apply');

const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const pathMappings = new Map(Object.entries(ledger.pathMappings || {}));
const eventLocationOverrides = new Map(Object.entries(ledger.eventLocationOverrides || {}));

function normalizeMigratedLocation(value) {
  const source = typeof value === 'string'
    ? value.trim().replace(/[\\＞>›→]+/g, '/').split('/').map(segment => segment.trim()).join('/')
    : '';
  if (pathMappings.has(source)) return normalizeLocationPath(pathMappings.get(source));
  const normalized = normalizeLocationPath(value);
  if (!normalized) return '';
  if (pathMappings.has(normalized)) return normalizeLocationPath(pathMappings.get(normalized));

  const parsed = parseLocationPath(normalized);
  if (parsed?.area === '大宋' && parsed.region === '嘉兴') {
    return ['大宋', '嘉兴府', parsed.location, ...(parsed.scene ? [parsed.scene] : [])].join('/');
  }
  return normalized;
}

function migrateLocationValue(value, context) {
  if (typeof value !== 'string') return value;
  const migrated = normalizeMigratedLocation(value);
  if (!migrated) {
    context.invalid.push({ file: context.file, key: context.key, value });
    return value;
  }
  if (migrated !== value) context.changedValues.push({ file: context.file, key: context.key, from: value, to: migrated });
  return migrated;
}

function migrateLocationFields(value, context, key = '') {
  if (Array.isArray(value)) return value.map(item => migrateLocationFields(item, context, key));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => {
    if (childKey === '所在位置') {
      return [childKey, migrateLocationValue(childValue, { ...context, key: childKey })];
    }
    return [childKey, migrateLocationFields(childValue, context, childKey)];
  }));
}

function formatLocationTable(table) {
  const lines = [];
  for (const [area, regions] of Object.entries(table)) {
    lines.push(`${area}:`);
    for (const [region, scopes] of Object.entries(regions)) {
      lines.push(`  ${region}:`);
      for (const scope of scopes) lines.push(`  - ${scope}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const report = { changedValues: [], invalid: [], changedFiles: [], addedScopes: [] };
const originalMap = parseYaml(fs.readFileSync(mapPath, 'utf8'));
const nextMapSets = new Map();
const ensureScope = scopePath => {
  const parsed = parseLocationPath(scopePath);
  if (!parsed) return;
  const regionKey = `${parsed.area}/${parsed.region}`;
  if (!nextMapSets.has(regionKey)) nextMapSets.set(regionKey, new Set());
  nextMapSets.get(regionKey).add(parsed.location);
};

for (const [area, regions] of Object.entries(originalMap)) {
  for (const [region, locations] of Object.entries(regions)) {
    for (const location of locations) {
      ensureScope(getLocationScopePath(normalizeMigratedLocation(`${area}/${region}/${location}`)));
    }
  }
}

const eventFiles = fs.readdirSync(sourceDirectory)
  .filter(file => /(?:事件条目|登场事件|成长条目)-.*\.yaml$/u.test(file))
  .sort((left, right) => left.localeCompare(right, 'zh-CN'));

for (const file of eventFiles) {
  const filePath = path.join(sourceDirectory, file);
  const originalText = fs.readFileSync(filePath, 'utf8');
  const parsed = parseYaml(originalText);
  if (!parsed || typeof parsed !== 'object') continue;

  let next = migrateLocationFields(parsed, { file, key: '', ...report });
  if (Object.hasOwn(next, '事件地点')) {
    const override = eventLocationOverrides.get(file);
    const nextLocation = override || migrateLocationValue(next.事件地点, { file, key: '事件地点', ...report });
    if (override && nextLocation !== next.事件地点) {
      report.changedValues.push({ file, key: '事件地点', from: next.事件地点, to: nextLocation });
    }
    next = { ...next, 事件地点: nextLocation };
    ensureScope(getLocationScopePath(nextLocation));
  }

  const collectScopes = value => {
    if (Array.isArray(value)) return value.forEach(collectScopes);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === '所在位置' && typeof child === 'string') ensureScope(getLocationScopePath(child));
      else collectScopes(child);
    }
  };
  collectScopes(next);

  const nextText = `${JSON.stringify(next, null, 2)}\n`;
  if (JSON.stringify(next) !== JSON.stringify(parsed)) {
    report.changedFiles.push(file);
    if (shouldApply) fs.writeFileSync(filePath, nextText, 'utf8');
  }
}

const nextMap = {};
for (const regionKey of nextMapSets.keys()) {
  const [area, region] = regionKey.split('/');
  nextMap[area] ||= {};
  nextMap[area][region] = [...nextMapSets.get(regionKey)];
}
const nextMapText = formatLocationTable(nextMap);
if (shouldApply) fs.writeFileSync(mapPath, nextMapText, 'utf8');

const knownScopes = new Set([...nextMapSets.entries()].flatMap(([regionKey, scopes]) =>
  [...scopes].map(scope => `${regionKey}/${scope}`)));
for (const change of report.changedValues) {
  const scopePath = getLocationScopePath(change.to);
  if (scopePath && !knownScopes.has(scopePath)) report.addedScopes.push(scopePath);
}

const uniqueChangedValues = new Map(report.changedValues.map(item => [`${item.file}\0${item.key}\0${item.from}\0${item.to}`, item]));
const summary = {
  mode: shouldApply ? 'apply' : 'audit',
  eventFiles: eventFiles.length,
  changedFiles: report.changedFiles.length,
  changedLocationValues: uniqueChangedValues.size,
  invalidLocations: report.invalid,
  strictScopeCount: knownScopes.size,
};
console.log(JSON.stringify(summary, null, 2));

if (report.invalid.length > 0) process.exitCode = 1;
