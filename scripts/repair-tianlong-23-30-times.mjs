// Eight-chapter timeline repair. Read-only unless --apply is supplied.
// Historical round-1 schedule; round 2 owns the current causal timeline.
if (process.argv.includes('--apply')) {
  throw new Error('旧排期已停用，请使用 scripts/repair-tianlong-causal-timeline.mjs --apply');
}
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  wuxiaCalendarTimeToTotalMinutes as minutes,
  totalMinutesToWuxiaCalendarTime as fromMinutes,
} from '../src/shared/wuxiaCalendar.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '世界书/金庸群侠传1/世界书');
const apply = process.argv.includes('--apply');
const t = (year, month, day, hour) => ({ 年: year, 月: month, 日: day, 时: hour, 分: 0 });
const row = (start, hours, reason) => [start, fromMinutes(minutes(start) + hours * 60), reason];
const schedules = [
  ['二十三', [
    row(t(1202, 8, 25, 19), 1, '夜幕潜伏、窥探幽会'),
    row(t(1202, 8, 25, 20), 1, '同场继续窃听；往事仅为对话内容'),
    row(t(1202, 8, 25, 21), 1, '全冠清潜入后当场交手'),
    row(t(1202, 8, 25, 22), 1, '黑衣人突入杀人、全冠清逃离'),
    row(t(1202, 8, 25, 23), 1, '乔峰立即破窗逼问'),
    row(t(1202, 8, 26, 0), 1, '紧接审讯施刑举镜'),
    row(t(1202, 8, 26, 1), 1, '照镜当场惊毙'),
    row(t(1202, 8, 26, 2), 1, '现场抚物哀悼；回忆不回拨日期'),
    row(t(1202, 8, 26, 3), 1, '运功护心、收拾包裹、趁夜启程'),
  ]],
  ['二十四', [
    row(t(1202, 10, 5, 8), 10, '抵达后结庐、攀岩采参、首次救治；北上长途留在章间'),
    row(t(1202, 10, 5, 18), 950, '日复一日治疗至十一月十五日八时，约四十天'),
    row(t(1202, 11, 15, 8), 1, '打猎偶遇猛虎、即刻救人'),
    row(t(1202, 11, 15, 16), 6, '留七小时赴营备宴，篝火饮酒角力结义'),
    row(t(1202, 11, 16, 6), 2162, '宴后休息至清晨；数月传阵、每日疗伤，三个月又两小时'),
    row(t(1203, 2, 16, 8), 1, '雪原清晨骑兵突袭、猎人被围'),
    row(t(1203, 2, 16, 9), 1, '当场单骑冲阵救人擒帅'),
    row(t(1203, 2, 16, 10), 4, '缴械押俘、献礼庆功'),
  ]],
  ['二十五', [
    row(t(1203, 2, 20, 8), 2, '留四天转赴辽境；雪原冬猎与二月衔接'),
    row(t(1203, 2, 20, 10), 1, '伏兵突袭，辽帝当场陷围'),
    row(t(1203, 2, 20, 11), 1, '立即破围救帝'),
    row(t(1203, 2, 20, 12), 1, '紧接救驾，夺矛击毙涅鲁古'),
    row(t(1203, 2, 20, 13), 4, '转移雪谷、拔箭逼毒、问答结义'),
    row(t(1203, 2, 20, 17), 168, '调兵联络、勤王军反击及肃清叛军，保留七天'),
    row(t(1203, 3, 5, 10), 4, '另留回城筹备行程七天十七小时；授印册封四小时'),
  ]],
  ['二十六', [
    row(t(1203, 12, 8, 8), 144, '王府任职阶段后启程；连日南下六天抵雁门关'),
    row(t(1203, 12, 14, 8), 2, '抚壁缅怀旧事，不将往事日期当触发时间'),
    row(t(1203, 12, 14, 10), 1, '惨呼打断追思、现场目睹屠戮'),
    row(t(1203, 12, 14, 11), 1, '即刻飞身冲阵'),
    row(t(1203, 12, 14, 12), 2, '喝退辽军、保护和救助难民'),
    row(t(1203, 12, 14, 14), 1, '获救后现场叩谢'),
    row(t(1203, 12, 14, 15), 1, '闻谢语而惨笑的当场反应'),
    row(t(1203, 12, 14, 16), 2, '难民离去后静思、整装再出发'),
  ]],
  ['二十七', [
    row(t(1203, 12, 20, 8), 4, '留五天十四小时南下转场；入客栈探听、候雨'),
    row(t(1203, 12, 20, 12), 1, '同一场交谈间星宿派闯入'),
    row(t(1203, 12, 20, 13), 1, '当场逼经、杀人威慑'),
    row(t(1203, 12, 20, 14), 1, '紧急催动冰蚕寒劲抵抗'),
    row(t(1203, 12, 20, 15), 1, '乔峰当场出手退敌'),
    row(t(1203, 12, 20, 16), 3, '施烟遁走、驱毒谢恩、候雨止及渡河'),
  ]],
  ['二十八', [
    row(t(1204, 1, 20, 8), 2, '孤儿身世为背景；偶遇阿紫并追随是当前节点'),
    row(t(1204, 1, 25, 8), 8, '此前数日役使以间隔表达；寻匠铸罩、烧焊及苏醒'),
    row(t(1204, 1, 25, 16), 160, '每日试毒的持续过程至二月初二清晨，末段冰蚕入体'),
    row(t(1204, 2, 2, 8), 6, '濒死后立即按图导引、化解寒毒，不跨日等待救命'),
    row(t(1204, 2, 4, 8), 72, '未过多久遭截杀、失明被救及数日背负逃亡'),
    row(t(1204, 2, 7, 17), 3, '残阳下窥探弱点、现身招揽及许诺'),
  ]],
  ['二十九', [
    row(t(1204, 2, 7, 20), 2, '承接全冠清招揽，具体许诺、交令、立誓'),
    row(t(1204, 2, 15, 8), 4, '另留赴君山行程；大会比武、拥立改名'),
    row(t(1204, 2, 15, 12), 120, '书写战帖、信使递送至少林及各派并收到回音，五天'),
    row(t(1204, 3, 20, 8), 2, '另留二十九天二十小时供各派行路集结；当日列阵对峙'),
    row(t(1204, 3, 20, 10), 1, '当场挑衅玄慈、回应约战'),
    row(t(1204, 3, 20, 11), 1, '决斗前丁春秋挟人闯入'),
    row(t(1204, 3, 20, 12), 1, '受胁立即下跪，围观当场反应'),
    row(t(1204, 3, 20, 13), 1, '混乱之际萧峰率骑兵登场'),
  ]],
  ['三十', [
    row(t(1204, 3, 20, 14), 1, '紧接上回登场，群雄合围；没有隔夜等待'),
    row(t(1204, 3, 20, 15), 1, '当场救下阿紫并交付照护'),
    row(t(1204, 3, 20, 16), 1, '三敌站位形成合围'),
    row(t(1204, 3, 20, 17), 1, '段誉虚竹立即助阵、举酒盟誓'),
    row(t(1204, 3, 20, 18), 2, '段誉对战慕容复，保留两小时交手窗口'),
    row(t(1204, 3, 20, 20), 1, '虚竹降伏丁春秋；分镜按回放顺序落时'),
    row(t(1204, 3, 20, 21), 1, '萧峰战游坦之；分镜不回拨或重叠'),
    row(t(1204, 3, 20, 22), 1, '战罢汇聚、喝问退敌及现场余波'),
  ]],
];

const pending = [];
let previousEnd = -Infinity;
let reviewed = 0;
for (const [chapter, rows] of schedules) {
  const files = fs.readdirSync(directory)
    .filter(name => name.startsWith(`天龙第${chapter}回`) && /回(?!00)\d{2}-.*\.yaml$/u.test(name)).sort();
  assert.equal(files.length, rows.length, `第${chapter}回事件数`);
  for (const [i, file] of files.entries()) {
    const [start, end, reason] = rows[i];
    assert.ok(minutes(start) >= previousEnd, `${file}: 跨章及章内不得倒退或重叠`);
    assert.ok(minutes(end) - minutes(start) >= 60, `${file}: 至少一小时`);
    previousEnd = minutes(end);
    replaceTimes(file, { 触发条件: { 类型: '时间', ...start }, 事件结束时间: end });
    reviewed++;
    console.log(`${file}: ${JSON.stringify(start)} -> ${JSON.stringify(end)}; ${reason}`);
  }
  const debut = `天龙第${chapter}回00-人物登场.yaml`;
  if (fs.existsSync(path.join(directory, debut))) {
    replaceTimes(debut, { 触发条件: { 类型: '时间', ...rows[0][0] } });
  }
}

function replaceTimes(file, times) {
  const sourcePath = path.join(directory, file);
  const original = fs.readFileSync(sourcePath, 'utf8');
  const before = JSON.parse(original);
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  let next = original;
  for (const [key, value] of Object.entries(times)) {
    const pattern = new RegExp(`("${key}": )\\{[^{}]*\\}`, 'u');
    assert.ok(pattern.test(next), `${file}: 独立时间块`);
    const block = JSON.stringify(value, null, 2).split('\n')
      .map((line, i) => i ? `  ${line}` : line).join(eol);
    next = next.replace(pattern, (_, prefix) => prefix + block);
  }
  const strip = ({ 触发条件, 事件结束时间, ...rest }) => rest;
  assert.deepEqual(strip(JSON.parse(next)), strip(before), `${file}: 非时间字段完全保留`);
  if (next !== original) pending.push([sourcePath, next]);
}

assert.equal(reviewed, 60);
// Every anchor is validated before the first write.
if (apply) for (const [sourcePath, next] of pending) fs.writeFileSync(sourcePath, next);
console.log(`${apply ? 'changed' : 'would-change'} files: ${pending.length}; reviewed: ${reviewed}; backtracks: 0; overlaps: 0; durations < 1h: 0`);
