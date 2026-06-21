#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join('角色卡', '金庸群侠传', '世界书');
const TEXT_EXTENSIONS = new Set(['.txt']);
const LOCATION_FIELD_RE = /"(所在位置|事件地点)"\s*:\s*"([^"]*)"/g;
const SUSPICIOUS_TOKEN_RE = /(未知|待定|附近|途中|船上|路上|官道|江南|中原|大漠中|（|）|\(|\))/;

function parseArgs(argv) {
  const options = {
    dir: DEFAULT_DIR,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir' && argv[i + 1]) {
      options.dir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function countLine(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

function inspectValue(value) {
  const segments = value.split('/');
  const trimmedSegments = segments.map(segment => segment.trim());
  const reasons = [];
  const suspiciousReasons = [];

  if (trimmedSegments.some(segment => segment.length === 0)) {
    reasons.push('存在空段');
  }

  if (trimmedSegments.length < 3) {
    reasons.push('不足三级');
  } else if (trimmedSegments.length > 3) {
    reasons.push('超过三级');
  }

  if (trimmedSegments.length === 3 && SUSPICIOUS_TOKEN_RE.test(value)) {
    suspiciousReasons.push('含未知/待定/附近/途中/船上/括号等可疑词');
  }

  return {
    segments: trimmedSegments,
    segmentCount: trimmedSegments.length,
    validStructure: reasons.length === 0 && trimmedSegments.length === 3,
    reasons,
    suspiciousReasons,
  };
}

function inspectFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const results = [];

  for (const match of content.matchAll(LOCATION_FIELD_RE)) {
    const key = match[1];
    const value = match[2];
    const line = countLine(content, match.index ?? 0);
    const inspection = inspectValue(value);

    results.push({
      file: filePath,
      line,
      key,
      value,
      ...inspection,
    });
  }

  return results;
}

function summarize(records) {
  const definiteViolations = records.filter(record => !record.validStructure);
  const suspiciousRecords = records.filter(
    record => record.validStructure && record.suspiciousReasons.length > 0,
  );

  const reasonCounts = new Map();
  for (const record of definiteViolations) {
    for (const reason of record.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  const suspiciousCounts = new Map();
  for (const record of suspiciousRecords) {
    for (const reason of record.suspiciousReasons) {
      suspiciousCounts.set(reason, (suspiciousCounts.get(reason) ?? 0) + 1);
    }
  }

  return {
    totalRecords: records.length,
    definiteViolations,
    suspiciousRecords,
    reasonCounts: Object.fromEntries([...reasonCounts.entries()].sort()),
    suspiciousCounts: Object.fromEntries([...suspiciousCounts.entries()].sort()),
  };
}

function printText({ dir, fileCount, totalRecords, definiteViolations, suspiciousRecords, reasonCounts, suspiciousCounts }) {
  console.log(`扫描目录: ${dir}`);
  console.log(`扫描文件: ${fileCount}`);
  console.log(`地点字段: ${totalRecords}`);
  console.log(`明确违规: ${definiteViolations.length}`);
  console.log(`结构通过但可疑: ${suspiciousRecords.length}`);

  if (Object.keys(reasonCounts).length > 0) {
    console.log('\n[明确违规分类]');
    for (const [reason, count] of Object.entries(reasonCounts)) {
      console.log(`- ${reason}: ${count}`);
    }
  }

  if (Object.keys(suspiciousCounts).length > 0) {
    console.log('\n[可疑项分类]');
    for (const [reason, count] of Object.entries(suspiciousCounts)) {
      console.log(`- ${reason}: ${count}`);
    }
  }

  if (definiteViolations.length > 0) {
    console.log('\n[明确违规条目]');
    for (const record of definiteViolations) {
      console.log(`${record.file}:${record.line} ${record.key} = ${record.value} [${record.reasons.join('，')}]`);
    }
  }

  if (suspiciousRecords.length > 0) {
    console.log('\n[结构通过但可疑的条目]');
    for (const record of suspiciousRecords) {
      console.log(`${record.file}:${record.line} ${record.key} = ${record.value} [${record.suspiciousReasons.join('，')}]`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dir = path.resolve(options.dir);

  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  const files = walk(dir);
  const records = files.flatMap(inspectFile);
  const summary = summarize(records);

  if (options.json) {
    console.log(JSON.stringify({
      dir,
      fileCount: files.length,
      ...summary,
    }, null, 2));
    return;
  }

  printText({
    dir,
    fileCount: files.length,
    ...summary,
  });
}

main();
