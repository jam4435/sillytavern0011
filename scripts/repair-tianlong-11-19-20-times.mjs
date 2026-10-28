// Explicit, detail-reviewed anchors; default is a read-only dry run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wuxiaCalendarTimeToTotalMinutes as minutes } from '../src/shared/wuxiaCalendar.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '世界书/金庸群侠传1/世界书');
const apply = process.argv.includes('--apply');
const time = (month, day, hour) => ({ 年: 1202, 月: month, 日: day, 时: hour, 分: 0 });
// Each row: start, end, reason. Gaps are intentional journeys/night waits,
// never added to a short conversation merely to fill the original chapter span.
const schedules = {
  十一: [
    [time(4, 5, 19), time(4, 13, 8), '数千里换马兼程，保留七天十三小时；清晨抵埠'],
    [time(4, 13, 8), time(4, 13, 14), '详情明示行舟半日，六小时'],
    [time(4, 13, 14), time(4, 13, 15), '荷荡闻歌初遇，一小时'],
    [time(4, 13, 15), time(4, 13, 16), '问路及允诺引路，一小时'],
    [time(4, 13, 16), time(4, 13, 18), '穿数个水岔、芦荡，登岸入堂，两小时'],
    [time(4, 13, 18), time(4, 13, 19), '奉茶问答，少女当场出现，一小时'],
  ],
  十九: [
    [time(6, 6, 8), time(6, 6, 12), '携伤者入山、运功救治及留药，四小时'],
    [time(6, 6, 12), time(6, 12, 8), '数日闭关调息，保留五天二十小时'],
    [time(6, 12, 8), time(6, 12, 12), '潜回庄边、周密打探，四小时'],
    [time(6, 12, 12), time(6, 18, 12), '详情明示数日北上奔波，六天'],
    [time(6, 18, 12), time(6, 18, 14), '攀壁良久搜寻并验看，两小时'],
    [time(6, 18, 14), time(6, 18, 15), '紧接长啸，阿朱现身相拥，一小时'],
    [time(6, 18, 15), time(6, 18, 16), '接续倾诉立誓、携手离开，一小时'],
  ],
  二十: [
    [time(7, 20, 8), time(7, 20, 9), '临终施救、毁信、圆寂，一小时'],
    [time(7, 20, 9), time(7, 22, 10), '兼程赴太行两天，加验尸与突围一小时'],
    [time(7, 24, 1), time(7, 24, 2), '另留转赴马宅及候夜间隔；四更易容潜入，一小时'],
    [time(7, 24, 2), time(7, 24, 3), '同夜连续套话、构陷，一小时'],
    [time(7, 24, 3), time(7, 24, 4), '脱身赶往城外破庙、转述立誓，一小时'],
    [time(7, 24, 20), time(7, 24, 21), '当夜客栈灯下验看信物，一小时'],
    [time(7, 26, 20), time(7, 26, 22), '留赴小镜湖行程；夜间抉择、易容及出门，两小时'],
  ],
};

let changed = 0;
const pending = [];
for (const [chapter, rows] of Object.entries(schedules)) {
  const files = fs.readdirSync(directory)
    .filter(name => name.startsWith(`天龙第${chapter}回`) && /回(?!00)\d{2}-.*\.yaml$/u.test(name)).sort();
  assert.equal(files.length, rows.length, `第${chapter}回事件数`);
  let previousEnd = -Infinity;
  for (const [index, file] of files.entries()) {
    const sourcePath = path.join(directory, file);
    const original = fs.readFileSync(sourcePath, 'utf8');
    const event = JSON.parse(original);
    const [start, end, reason] = rows[index];
    assert.ok(minutes(end) - minutes(start) >= 60, `${file}: 时长至少一小时`);
    assert.ok(minutes(start) >= previousEnd, `${file}: 无倒退或重叠`);
    previousEnd = minutes(end);
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    let next = original;
    for (const [key, value] of Object.entries({ 触发条件: { 类型: '时间', ...start }, 事件结束时间: end })) {
      const pattern = new RegExp(`("${key}": )\\{[^{}]*\\}`, 'u');
      assert.ok(pattern.test(next), `${file}: 独立时间块`);
      const block = JSON.stringify(value, null, 2).split('\n').map((line, i) => i ? `  ${line}` : line).join(eol);
      next = next.replace(pattern, (_, prefix) => prefix + block);
    }
    const parsed = JSON.parse(next);
    const withoutTimes = ({ 触发条件, 事件结束时间, ...rest }) => rest;
    assert.deepEqual(withoutTimes(parsed), withoutTimes(event), `${file}: 非时间内容不变`);
    if (next !== original) {
      changed++;
      pending.push([sourcePath, next]);
    }
    console.log(`${file}: ${start.月}/${start.日} ${start.时}:00 -> ${end.月}/${end.日} ${end.时}:00 (${(minutes(end) - minutes(start)) / 60}h) ${reason}`);
  }
  const debutPath = path.join(directory, `天龙第${chapter}回00-人物登场.yaml`);
  if (fs.existsSync(debutPath)) {
    assert.deepEqual(JSON.parse(fs.readFileSync(debutPath, 'utf8')).触发条件, { 类型: '时间', ...rows[0][0] }, '登场与本回起点一致');
  }
}
// Validate the entire batch before writing any source file.
if (apply) for (const [sourcePath, next] of pending) fs.writeFileSync(sourcePath, next);
console.log(`${apply ? 'changed' : 'would-change'} files: ${changed}; reviewed: 20; backtracks: 0; overlaps: 0; durations < 1h: 0`);
