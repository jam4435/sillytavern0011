#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const files = args.filter(arg => arg !== '--json');

if (files.length === 0) {
  console.error('用法: node summarize-ui-report.mjs [--json] <report.json> [...]');
  process.exit(2);
}

function compact(text, limit = 160) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function section(debug, name) {
  const value = debug?.[name];
  return value && typeof value === 'object' ? value : {};
}

function extractVariableSignals(content) {
  const text = String(content ?? '');
  const errors = [...text.matchAll(/(?:【错误】|错误[:：])\s*([^\n]+)/g)].map(match => compact(match[1], 200));
  const labels = [...text.matchAll(/【([^】]+)】/g)].map(match => match[1]);
  const actionCount = (text.match(/<Variable(?:Insert|Edit|Delete)>/g) ?? []).length;
  const verification = text
    .split(/\r?\n/)
    .filter(line => /回读|验证|应用状态|持久化|未应用|失败/.test(line))
    .map(line => compact(line, 220))
    .slice(-6);
  return { actionCount, labels: [...new Set(labels)], errors, verification };
}

const summaries = [];
let globalTurn = 0;

for (const file of files) {
  const resolved = path.resolve(file);
  const report = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  for (const turn of Array.isArray(report.turns) ? report.turns : []) {
    globalTurn += 1;
    const debug = turn.debug ?? {};
    const mainInput = section(debug, 'main-input');
    const mainOutput = section(debug, 'main-output');
    const variableInput = section(debug, 'variable-input');
    const variableOutput = section(debug, 'variable-output');
    const reply = String(turn.reply ?? '');
    summaries.push({
      globalTurn,
      source: path.basename(resolved),
      reportTurn: turn.turn ?? null,
      prompt: compact(turn.prompt, 80),
      success: turn.success === true,
      failedSections: Array.isArray(turn.failedSections) ? turn.failedSections : [],
      statuses: {
        mainInput: mainInput.status ?? 'missing',
        mainOutput: mainOutput.status ?? 'missing',
        variableInput: variableInput.status ?? 'missing',
        variableOutput: variableOutput.status ?? 'missing',
      },
      replyLength: reply.length,
      replyStart: compact(reply.slice(0, 240), 120),
      replyEnd: compact(reply.slice(-240), 120),
      variable: extractVariableSignals(variableOutput.content),
      error: compact(turn.error, 240),
    });
  }
}

if (jsonMode) {
  console.log(JSON.stringify(summaries, null, 2));
  process.exit(0);
}

console.log('| 全局轮次 | 来源 | 正文/变量状态 | 失败区 | 正文首尾 | 变量动作/错误 |');
console.log('|---:|---|---|---|---|---|');
for (const item of summaries) {
  const statuses = `${item.statuses.mainOutput}/${item.statuses.variableOutput}`;
  const failed = item.failedSections.join(',') || '-';
  const reply = `${item.replyStart || '(空)'} / ${item.replyEnd || '(空)'}`.replace(/\|/g, '／');
  const variableErrors = item.variable.errors.join('；') || '-';
  console.log(
    `| ${item.globalTurn} | ${item.source}#${item.reportTurn ?? '-'} | ${statuses} | ${failed} | ${reply} | ${item.variable.actionCount}/${variableErrors.replace(/\|/g, '／')} |`,
  );
}
