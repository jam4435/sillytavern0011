#!/usr/bin/env node

// 武侠事件时间线修复工具（配套 scripts/audit-wuxia-event-durations.mjs）
//
// 模式:
//   --scan-anchors                     初筛硬锚点候选，输出 anchors-candidates.json
//   --patch <file> --dry-run           内存中应用补丁并跑全部验证规则，输出违规清单
//   --patch <file> --apply             验证通过后定点写回时间字段（diff 仅时间数字）
//
// 补丁格式 (patch.json):
//   {
//     "version": 1,
//     "entries": [
//       {
//         "id": "射雕第七回03-黑松林解围",          // 规范事件键（登场事件示例："射雕第一回00-人物登场"）
//         "category": "single-duration | transition-gap | dependent-shift | forward-plan | cascade | debut-sync",
//         "newTrigger": { "年": 1219, "月": 10, "日": 20, "时": 16 },   // 可省略表示不动
//         "newEnd":     { "年": 1219, "月": 10, "日": 21, "时": 12 },   // 可省略表示不动
//         "constraints": {
//           "minDurationHours": 20,                 // 详情锚点换算出的最小时长
//           "minGapFromPreviousEndHours": 8         // 与上一事件的最小留白
//         },
//         "evidence": "详情引文……",
//         "note": "补充说明"
//       }
//     ]
//   }

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ORDINARY_NAME_RE = /^(.*?)事件条目-第(\d+)回-(\d+)-(.+)\.(?:ya?ml|json)$/u;
const DEBUT_NAME_RE = /^(.*?)登场事件-第(\d+)回(?:人物)?\.(?:ya?ml|json)$/u;

// 保守下限换算表（用户 2026-07-26 定稿）。
// 分段规划子任务据此把详情时间词换算成 constraints 数值；验证器只核对数值。
export const CONSERVATIVE_MARKER_HOURS = {
  一日一夜: 24,
  次日: 24, // 结束须跨到翌日（按最小跨日 24h 计）
  次晨: 14, // 触发/结束须落在翌日 6–8 时；最小留白按前夜 18 时起算约 14h
  连日: 4 * 24,
  数日: 3 * 24,
  不数日: 3 * 24,
  七日七夜: 7 * 24,
  十余日: 12 * 24,
  月余: 32 * 24,
  数月: 90 * 24,
  半年: 180 * 24,
  大半年: 210 * 24,
  一年: 365 * 24,
};

function parseArgs(argv) {
  const options = {
    eventDir: '世界书',
    outputDir: 'plans/武侠事件时长审计',
    patchFile: null,
    anchorsFile: null,
    mode: null, // 'scan-anchors' | 'dry-run' | 'apply'
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--event-dir') options.eventDir = argv[++index];
    else if (argument === '--output-dir') options.outputDir = argv[++index];
    else if (argument === '--patch') options.patchFile = argv[++index];
    else if (argument === '--anchors') options.anchorsFile = argv[++index];
    else if (argument === '--scan-anchors') options.mode = 'scan-anchors';
    else if (argument === '--dry-run') options.mode = 'dry-run';
    else if (argument === '--apply') options.mode = 'apply';
    else if (argument === '--help' || argument === '-h') {
      console.log('见文件头部注释');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.mode) throw new Error('必须指定 --scan-anchors、--dry-run 或 --apply');
  if ((options.mode === 'dry-run' || options.mode === 'apply') && !options.patchFile)
    throw new Error(`${options.mode} 需要 --patch <file>`);
  return options;
}

async function collectFiles(directory, patterns) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(entryPath, patterns)));
    else if (entry.isFile() && patterns.some(re => re.test(entry.name))) files.push(entryPath);
  }
  return files;
}

function normalizeTime(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const year = Number(value.年);
  const month = Number(value.月);
  const day = Number(value.日);
  const hour = Number(value.时 ?? 0);
  if (![year, month, day, hour].every(Number.isFinite)) return null;
  return { 年: year, 月: month, 日: day, 时: hour };
}

function timeToEpochHours(time) {
  if (time === null) return null;
  return Date.UTC(time.年, time.月 - 1, time.日, time.时) / 3_600_000;
}

function formatTime(time) {
  if (!time) return 'null';
  return `${time.年}-${String(time.月).padStart(2, '0')}-${String(time.日).padStart(2, '0')} ${String(time.时).padStart(2, '0')}:00`;
}

async function loadEvents(eventDir, workspace) {
  const files = await collectFiles(eventDir, [ORDINARY_NAME_RE, DEBUT_NAME_RE]);
  const ordinary = [];
  const debuts = [];
  const errors = [];
  for (const file of files) {
    const base = path.basename(file);
    const rel = path.relative(workspace, file).replaceAll(path.sep, '/');
    let data;
    let source;
    try {
      source = await readFile(file, 'utf8');
      data = JSON.parse(source);
    } catch (error) {
      errors.push({ file: rel, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const ordinaryMatch = ORDINARY_NAME_RE.exec(base);
    if (ordinaryMatch) {
      ordinary.push({
        id: `${ordinaryMatch[1]}第${Number(ordinaryMatch[2])}回-${ordinaryMatch[3]}-${ordinaryMatch[4]}`,
        kind: 'ordinary',
        series: ordinaryMatch[1],
        chapter: Number(ordinaryMatch[2]),
        sequence: Number(ordinaryMatch[3]),
        title: ordinaryMatch[4],
        file: rel,
        absolutePath: file,
        source,
        data,
        trigger: normalizeTime(data?.触发条件),
        end: normalizeTime(data?.事件结束时间),
        triggerType: data?.触发条件?.类型 ?? null,
      });
      continue;
    }
    const debutMatch = DEBUT_NAME_RE.exec(base);
    if (debutMatch) {
      debuts.push({
        id: `${debutMatch[1]}第${Number(debutMatch[2])}回-登场`,
        kind: 'debut',
        series: debutMatch[1],
        chapter: Number(debutMatch[2]),
        file: rel,
        absolutePath: file,
        source,
        data,
        trigger: normalizeTime(data?.触发条件),
        end: null,
        triggerType: data?.触发条件?.类型 ?? null,
      });
    }
  }
  ordinary.sort(
    (a, b) =>
      a.series.localeCompare(b.series, 'zh-CN') || a.chapter - b.chapter || a.sequence - b.sequence,
  );
  debuts.sort((a, b) => a.series.localeCompare(b.series, 'zh-CN') || a.chapter - b.chapter);
  return { ordinary, debuts, errors };
}

// ==================== 锚点初筛 ====================

const ANCHOR_TITLE_KEYWORDS = [
  '华山论剑',
  '华山',
  '英雄大宴',
  '襄阳',
  '蒙哥',
  '忽必烈',
  '成吉思汗',
  '大军',
  '南征',
  '十六年',
];
const ABSOLUTE_YEAR_RE = /1[12]\d{2}\s*年/gu;

function scanAnchors(ordinary) {
  const candidates = [];
  const seen = new Set();
  const add = (event, reason, freeze) => {
    if (seen.has(event.id)) {
      const existing = candidates.find(c => c.id === event.id);
      if (existing && !existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    seen.add(event.id);
    candidates.push({
      id: event.id,
      file: event.file,
      触发条件: event.trigger,
      事件结束时间: event.end,
      reasons: [reason],
      suggestedFreeze: freeze, // 'trigger' | 'both'
      confirmed: null, // 用户确认时填 true/false
    });
  };

  const bySeries = new Map();
  for (const event of ordinary) {
    const list = bySeries.get(event.series) ?? [];
    list.push(event);
    bySeries.set(event.series, list);
  }

  for (const [series, events] of bySeries) {
    add(events[0], `${series}首事件（全书时间起点）`, 'both');
    add(events[events.length - 1], `${series}末事件（全书时间终点）`, 'both');
    for (let index = 1; index < events.length; index += 1) {
      const prev = events[index - 1];
      const event = events[index];
      const gap =
        timeToEpochHours(event.trigger) !== null && timeToEpochHours(prev.end) !== null
          ? timeToEpochHours(event.trigger) - timeToEpochHours(prev.end)
          : null;
      if (gap !== null && gap >= 180 * 24) {
        add(event, `与上一事件相隔 ${(gap / 24).toFixed(0)} 日（重大时间跳跃，疑为原著既定断代）`, 'trigger');
      }
    }
  }

  for (const event of ordinary) {
    for (const keyword of ANCHOR_TITLE_KEYWORDS) {
      if (event.title.includes(keyword)) {
        add(event, `标题含关键词「${keyword}」`, 'trigger');
        break;
      }
    }
    const detail = typeof event.data?.事件详情 === 'string' ? event.data.事件详情 : '';
    const yearMentions = [...detail.matchAll(ABSOLUTE_YEAR_RE)].map(m => m[0]);
    if (yearMentions.length > 0) {
      add(event, `详情含绝对年份 ${[...new Set(yearMentions)].join('、')}`, 'trigger');
    }
  }

  return candidates;
}

// ==================== 补丁应用（内存） ====================

function applyPatchInMemory(ordinary, debuts, patch) {
  const byId = new Map();
  for (const event of [...ordinary, ...debuts]) byId.set(event.id, event);
  const issues = [];
  const patchedIds = new Set();

  for (const entry of patch.entries ?? []) {
    const event = byId.get(entry.id);
    if (!event) {
      issues.push({ rule: 'patch-integrity', id: entry.id, message: '补丁引用了不存在的事件 id' });
      continue;
    }
    if (patchedIds.has(entry.id)) {
      issues.push({ rule: 'patch-integrity', id: entry.id, message: '补丁中出现重复条目' });
      continue;
    }
    patchedIds.add(entry.id);
    const newTrigger = entry.newTrigger ? normalizeTime(entry.newTrigger) : null;
    const newEnd = entry.newEnd ? normalizeTime(entry.newEnd) : null;
    if (entry.newTrigger && !newTrigger)
      issues.push({ rule: 'patch-integrity', id: entry.id, message: 'newTrigger 不是合法时间对象' });
    if (entry.newEnd && !newEnd)
      issues.push({ rule: 'patch-integrity', id: entry.id, message: 'newEnd 不是合法时间对象' });
    event.patched = {
      trigger: newTrigger ?? event.trigger,
      end: newEnd ?? event.end,
      entry,
    };
  }
  for (const event of byId.values()) {
    if (!event.patched) event.patched = { trigger: event.trigger, end: event.end, entry: null };
  }
  return { issues, patchedIds };
}

// ==================== 验证规则 ====================

function validate(ordinary, debuts, anchors, patchedIds) {
  const violations = [];

  // R1: 单条自洽
  for (const event of ordinary) {
    const start = timeToEpochHours(event.patched.trigger);
    const end = timeToEpochHours(event.patched.end);
    if (start === null || end === null) {
      violations.push({ rule: 'R1-single', id: event.id, message: '缺少或非法的触发/结束时间' });
      continue;
    }
    if (end <= start) {
      violations.push({
        rule: 'R1-single',
        id: event.id,
        message: `结束(${formatTime(event.patched.end)})未晚于触发(${formatTime(event.patched.trigger)})`,
      });
    }
  }

  // R6: 运行时历法约束——era-utils/生成器按每月 30 天折算（月*30+日），31 号会与次月 1 号
  // 同秩甚至倒挂，且破坏真实历法与模型历法的排序一致性。所有时间的日必须 ≤30。
  for (const event of [...ordinary, ...debuts]) {
    for (const [field, value] of [
      ['触发条件', event.patched.trigger],
      ['事件结束时间', event.patched.end],
    ]) {
      if (value && value.日 > 30) {
        violations.push({
          rule: 'R6-calendar',
          id: event.id,
          message: `${field} 的日=${value.日} 超出运行时 30 天/月历法模型`,
        });
      }
    }
  }

  // R2: 补丁自带约束
  for (const event of ordinary) {
    const entry = event.patched.entry;
    if (!entry?.constraints) continue;
    const { minDurationHours, minGapFromPreviousEndHours } = entry.constraints;
    const start = timeToEpochHours(event.patched.trigger);
    const end = timeToEpochHours(event.patched.end);
    if (Number.isFinite(minDurationHours) && start !== null && end !== null && end - start < minDurationHours) {
      violations.push({
        rule: 'R2-constraint',
        id: event.id,
        message: `时长 ${end - start}h 低于约束 minDurationHours=${minDurationHours}`,
      });
    }
    if (Number.isFinite(minGapFromPreviousEndHours)) {
      const prev = event.previousInSeries;
      const prevEnd = prev ? timeToEpochHours(prev.patched.end) : null;
      if (prev && prevEnd !== null && start !== null && start - prevEnd < minGapFromPreviousEndHours) {
        violations.push({
          rule: 'R2-constraint',
          id: event.id,
          message: `与上一事件(${prev.id})留白 ${start - prevEnd}h 低于约束 minGapFromPreviousEndHours=${minGapFromPreviousEndHours}`,
        });
      }
    }
  }

  // R3: 全局顺序与不重叠（同作品按回目/序号排序后，上一条结束 ≤ 本条触发）
  const bySeries = new Map();
  for (const event of ordinary) {
    const list = bySeries.get(event.series) ?? [];
    list.push(event);
    bySeries.set(event.series, list);
  }
  for (const events of bySeries.values()) {
    for (let index = 1; index < events.length; index += 1) {
      const prev = events[index - 1];
      const event = events[index];
      const prevEnd = timeToEpochHours(prev.patched.end);
      const start = timeToEpochHours(event.patched.trigger);
      if (prevEnd === null || start === null) continue;
      if (start < prevEnd) {
        violations.push({
          rule: 'R3-order',
          id: event.id,
          message: `触发(${formatTime(event.patched.trigger)})早于上一事件 ${prev.id} 的结束(${formatTime(prev.patched.end)})`,
          involvesPatch: patchedIds.has(event.id) || patchedIds.has(prev.id),
        });
      }
    }
  }

  // R4: 硬锚点不可动
  const anchorMap = new Map((anchors ?? []).filter(a => a.confirmed === true).map(a => [a.id, a]));
  for (const event of ordinary) {
    const anchor = anchorMap.get(event.id);
    if (!anchor) continue;
    const freeze = anchor.suggestedFreeze ?? 'both';
    const triggerMoved = timeToEpochHours(event.patched.trigger) !== timeToEpochHours(event.trigger);
    const endMoved = timeToEpochHours(event.patched.end) !== timeToEpochHours(event.end);
    if (triggerMoved && (freeze === 'trigger' || freeze === 'both')) {
      violations.push({ rule: 'R4-anchor', id: event.id, message: '硬锚点触发时间被补丁移动' });
    }
    if (endMoved && freeze === 'both') {
      violations.push({ rule: 'R4-anchor', id: event.id, message: '硬锚点结束时间被补丁移动' });
    }
  }

  // R5: 登场事件联动（登场触发 ≤ 该回该作品首个事件条目触发）
  for (const debut of debuts) {
    const debutStart = timeToEpochHours(debut.patched.trigger);
    if (debutStart === null) continue;
    const chapterEvents = ordinary.filter(e => e.series === debut.series && e.chapter === debut.chapter);
    if (chapterEvents.length === 0) continue;
    const firstStart = Math.min(...chapterEvents.map(e => timeToEpochHours(e.patched.trigger) ?? Infinity));
    if (debutStart > firstStart) {
      violations.push({
        rule: 'R5-debut',
        id: debut.id,
        message: `登场事件触发(${formatTime(debut.patched.trigger)})晚于该回首事件触发，登场人物会缺席`,
        involvesPatch: chapterEvents.some(e => patchedIds.has(e.id)),
      });
    }
  }

  return violations;
}

function linkPreviousInSeries(ordinary) {
  const previousBySeries = new Map();
  for (const event of ordinary) {
    event.previousInSeries = previousBySeries.get(event.series) ?? null;
    previousBySeries.set(event.series, event);
  }
}

// ==================== 定点写回 ====================

function replaceTimeBlock(source, fieldName, newTime, file) {
  // 时间对象是平铺结构，匹配到第一个右花括号即可。
  const blockRe = new RegExp(`("${fieldName}"\\s*:\\s*\\{)([^}]*)(\\})`, 'u');
  const match = blockRe.exec(source);
  if (!match) throw new Error(`${file} 中找不到 ${fieldName} 字段`);
  let block = match[2];
  for (const key of ['年', '月', '日', '时']) {
    if (newTime[key] === undefined) continue;
    const fieldRe = new RegExp(`("${key}"\\s*:\\s*)(-?\\d+)`, 'u');
    if (!fieldRe.test(block)) throw new Error(`${file} 的 ${fieldName} 中找不到 ${key}`);
    block = block.replace(fieldRe, `$1${newTime[key]}`);
  }
  return source.slice(0, match.index) + match[1] + block + match[3] + source.slice(match.index + match[0].length);
}

async function applyPatchToFiles(events) {
  const written = [];
  for (const event of events) {
    const entry = event.patched.entry;
    if (!entry) continue;
    let source = event.source;
    if (entry.newTrigger) source = replaceTimeBlock(source, '触发条件', normalizeTime(entry.newTrigger), event.file);
    if (entry.newEnd) source = replaceTimeBlock(source, '事件结束时间', normalizeTime(entry.newEnd), event.file);
    if (source !== event.source) {
      await writeFile(event.absolutePath, source, 'utf8');
      written.push(event.file);
    }
  }
  return written;
}

// ==================== 主流程 ====================

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspace = process.cwd();
  const eventDir = path.resolve(workspace, options.eventDir);
  const outputDir = path.resolve(workspace, options.outputDir);
  const { ordinary, debuts, errors } = await loadEvents(eventDir, workspace);
  if (errors.length > 0) {
    console.error('解析失败的文件:', errors);
    process.exitCode = 1;
    return;
  }
  linkPreviousInSeries(ordinary);

  if (options.mode === 'scan-anchors') {
    const candidates = scanAnchors(ordinary);
    const output = {
      generatedAt: new Date().toISOString(),
      note: '硬锚点候选初筛结果。用户逐条确认后把 confirmed 改为 true/false；suggestedFreeze 可改为 trigger/both。',
      candidateCount: candidates.length,
      candidates,
    };
    const outputPath = path.join(outputDir, 'anchors-candidates.json');
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(
      JSON.stringify(
        { outputFile: path.relative(workspace, outputPath).replaceAll(path.sep, '/'), candidateCount: candidates.length },
        null,
        2,
      ),
    );
    return;
  }

  const patch = JSON.parse(await readFile(path.resolve(workspace, options.patchFile), 'utf8'));
  const anchors = options.anchorsFile
    ? (JSON.parse(await readFile(path.resolve(workspace, options.anchorsFile), 'utf8')).candidates ?? [])
    : [];
  const { issues, patchedIds } = applyPatchInMemory(ordinary, debuts, patch);
  const violations = [...issues, ...validate(ordinary, debuts, anchors, patchedIds)];

  const summary = {
    mode: options.mode,
    patchEntries: patch.entries?.length ?? 0,
    patchedEvents: patchedIds.size,
    violationCount: violations.length,
    violationsByRule: violations.reduce((acc, v) => {
      acc[v.rule] = (acc[v.rule] ?? 0) + 1;
      return acc;
    }, {}),
  };

  if (options.mode === 'dry-run') {
    const reportPath = path.join(outputDir, 'patch-dry-run-report.json');
    await writeFile(reportPath, `${JSON.stringify({ ...summary, violations }, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    if (violations.length > 0) {
      console.log(`违规详情见 ${path.relative(workspace, reportPath).replaceAll(path.sep, '/')}`);
      process.exitCode = 2;
    }
    return;
  }

  // apply
  if (violations.length > 0) {
    console.error('存在违规，拒绝写回。先运行 --dry-run 查看详情。');
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 2;
    return;
  }
  const written = await applyPatchToFiles([...ordinary, ...debuts]);

  // 写回后复核：重新加载并确认时间与补丁一致
  const reloaded = await loadEvents(eventDir, workspace);
  const reloadedById = new Map([...reloaded.ordinary, ...reloaded.debuts].map(e => [e.id, e]));
  const mismatches = [];
  for (const entry of patch.entries ?? []) {
    const event = reloadedById.get(entry.id);
    if (!event) continue;
    if (entry.newTrigger && timeToEpochHours(event.trigger) !== timeToEpochHours(normalizeTime(entry.newTrigger)))
      mismatches.push({ id: entry.id, field: '触发条件' });
    if (entry.newEnd && timeToEpochHours(event.end) !== timeToEpochHours(normalizeTime(entry.newEnd)))
      mismatches.push({ id: entry.id, field: '事件结束时间' });
  }
  console.log(JSON.stringify({ ...summary, filesWritten: written.length, postApplyMismatches: mismatches }, null, 2));
  if (mismatches.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
