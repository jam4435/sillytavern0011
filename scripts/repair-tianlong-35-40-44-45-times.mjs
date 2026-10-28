// Explicit event-detail anchors. Dry-run by default; --apply writes time blocks only.
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
  ['三十五', [
    row(t(1204, 7, 1, 8), 2, '直接接34回末的激战，数百招交锋'),
    row(t(1204, 7, 1, 10), 1, '当场舍身劝架遭双掌轰中'),
    row(t(1204, 7, 1, 11), 2, '脉门相接，连续吸取二宗内力'),
    row(t(1204, 7, 1, 13), 1, '吸力停止后二宗迅速衰老'),
    row(t(1204, 7, 1, 14), 1, '同场验画、揭晓真相'),
    row(t(1204, 7, 1, 15), 1, '濒死二宗当场相继长逝'),
    row(t(1204, 7, 1, 16), 10, '不多时融功，继而凿冰、合葬、受命'),
    row(t(1204, 7, 9, 8), 12, '另留七天六小时返峰、传讯集众；逐人化符半日'),
  ]],
  ['三十六', [
    row(t(1204, 10, 20, 8), 240, '明确日夜习武、多夜相思，保留十天'),
    row(t(1204, 10, 30, 8), 48, '传阅皇榜、各方准备出发，两天'),
    row(t(1204, 11, 2, 8), 192, '下天山后沿漫长险峻驿道西行，八天'),
    row(t(1204, 11, 10, 8), 4, '途中重逢、叙旧、合流'),
    row(t(1204, 11, 10, 12), 144, '漫长旅途中的照料、筹谋与弃情决断，六天'),
    row(t(1204, 11, 16, 18), 1, '留入夜间隔；客栈外斥责并暗算'),
    row(t(1204, 11, 16, 19), 1, '同夜追随并推人坠井'),
    row(t(1204, 11, 16, 20), 1, '救美与鸠摩智紧随坠井，立即接续'),
  ]],
  ['三十七', [
    row(t(1204, 11, 16, 21), 1, '接坠井落地，走火入魔扣脉'),
    row(t(1204, 11, 16, 22), 1, '气机相接即触发北冥吸功'),
    row(t(1204, 11, 16, 23), 3, '散功、顿悟、谢罪及出井'),
    row(t(1204, 11, 17, 2), 3, '井中相依、互诉衷肠并立誓'),
    row(t(1204, 11, 17, 5), 12, '寻人垂绳、洗漱换衣及赴皇宫'),
    row(t(1204, 11, 17, 17), 2, '群雄隔帘逐一竞答'),
    row(t(1204, 11, 17, 19), 1, '真情作答、当场相认并宣布结果'),
  ]],
  ['三十八', [
    row(t(1204, 11, 17, 20), 4, '接上回同一典礼，宣旨赐婚、败者离场'),
    row(t(1204, 12, 8, 8), 2, '另留二十天八小时自西夏返回太湖；认义父密会两小时'),
    row(t(1204, 12, 8, 10), 1, '包不同当场谏责、遭掌击身亡'),
    row(t(1204, 12, 8, 11), 2, '家臣抚尸痛哭、折兵断义'),
    row(t(1204, 12, 8, 13), 24, '谋划、调人、设伏及擒获，一天'),
    row(t(1204, 12, 9, 13), 1, '大厅内逼位、连杀四女'),
    row(t(1204, 12, 9, 14), 1, '目睹惨剧后立即自刎'),
    row(t(1204, 12, 9, 15), 1, '揭身世、刀白凤当场殉夫'),
    row(t(1204, 12, 9, 16), 2, '惊变接踵，兄弟合力破敌'),
    row(t(1204, 12, 9, 18), 2, '战败后当场陷入疯癫'),
  ]],
  ['三十九', [
    row(t(1205, 2, 10, 8), 6, '另留返大理、善后筹备期；即位册后大典六小时'),
    row(t(1205, 2, 11, 8), 1, '转辽宫视角，召见下旨'),
    row(t(1205, 2, 11, 9), 1, '同一次召见中立即抗旨'),
    row(t(1205, 2, 11, 10), 2, '密召阿紫、赠毒酒及欺瞒'),
    row(t(1205, 2, 11, 19), 1, '当夜私宴饮毒、片刻功散'),
    row(t(1205, 2, 11, 20), 1, '中毒后御林军立即破门擒人'),
    row(t(1205, 2, 11, 21), 48, '连夜打造牢笼、转押、反复逼降，保留两天'),
    row(t(1205, 2, 13, 23), 168, '趁夜脱逃、星夜兼程逃出辽境，七天'),
  ]],
  ['四十', [
    row(t(1205, 3, 5, 8), 72, '奔走中原各派传报、舆论响应，三天'),
    row(t(1205, 3, 8, 8), 336, '大理天山各部行路、会师、联军北上，两周'),
    row(t(1205, 3, 22, 20), 3, '留白日侦察待夜；夜袭宫外守军'),
    row(t(1205, 3, 22, 23), 1, '顶箭雨合力破宫门'),
    row(t(1205, 3, 23, 0), 1, '冲入地牢、断锁破笼立即救人'),
    row(t(1205, 3, 23, 1), 96, '护送重伤者撤城、日夜南撤，四天'),
    row(t(1205, 3, 27, 1), 4, '追军抵达并结阵合围；追击行程已在撤退期间展开'),
  ]],
  ['四十四', [
    row(t(1205, 4, 5, 16), 6, '少林善后后傍晚授棒法、研掌及整队启程，非全程西行'),
    row(t(1205, 4, 6, 8), 6, '草堂视角：手术已完成后的揭纱、复明、争执及弃人'),
    row(t(1205, 4, 6, 14), 1, '被弃后绝望爬崖、坠落，立即接续'),
    row(t(1205, 4, 27, 8), 6, '另留远赴大理及仪礼准备时间；大典六小时'),
    row(t(1205, 4, 27, 17), 1, '切回少室山，暮色辞别、启程归辽；不回拨顺序'),
    row(t(1205, 5, 4, 8), 24, '另留归辽行程；当殿拒旨后连夜部署合围'),
    row(t(1205, 5, 5, 8), 24, '帐内谋议、调军换防及夜间监控部署，一天'),
    row(t(1205, 5, 6, 8), 482, '跨万里荒漠赴天山，二十天奔波加两小时报信'),
  ]],
  ['四十五', [
    row(t(1205, 5, 27, 8), 1, '切换枯井叙事；醒悟、相拥倾诉一小时'),
    row(t(1205, 5, 27, 9), 1, '井底走火入魔及扣喉，连续危机'),
    row(t(1205, 5, 27, 10), 1, '受制后立即北冥吸功、救治并顿悟'),
    row(t(1205, 5, 27, 11), 6, '融合新纳内力、调息贯通绝学'),
    row(t(1205, 5, 28, 8), 4, '留一夜脱困整装与赴殿；群雄竞聘问答'),
    row(t(1205, 5, 28, 12), 1, '紧接问答、梦郎梦姑相认'),
    row(t(1205, 5, 28, 13), 2, '当殿宣旨赐婚、授印领旨'),
    row(t(1205, 5, 28, 15), 2, '大典落幕后退场；天下格局展望不按实际战争耗时'),
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
    assert.ok(minutes(start) >= previousEnd, `${file}: 章内及跨章不倒退、不重叠`);
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

// Validate the neighboring, untouched chapter boundaries too.
const boundary = (prefix, field) => {
  const file = fs.readdirSync(directory).find(name => name.startsWith(prefix) && name.endsWith('.yaml'));
  assert.ok(file, prefix);
  return minutes(JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))[field]);
};
assert.equal(minutes(schedules[0][1][0][0]), boundary('天龙第三十四回07-', '事件结束时间'));
assert.ok(minutes(schedules[5][1].at(-1)[1]) <= boundary('天龙第四十一回01-', '触发条件'));
assert.ok(minutes(schedules[6][1][0][0]) >= boundary('天龙第四十三回08-', '事件结束时间'));
assert.ok(minutes(schedules[7][1].at(-1)[1]) <= boundary('天龙第四十六回01-', '触发条件'));
assert.equal(reviewed, 64);

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
  assert.deepEqual(strip(JSON.parse(next)), strip(before), `${file}: 非时间字段不变`);
  if (next !== original) pending.push([sourcePath, next]);
}

if (apply) for (const [sourcePath, next] of pending) fs.writeFileSync(sourcePath, next);
console.log(`${apply ? 'changed' : 'would-change'} files: ${pending.length}; reviewed: ${reviewed}; backtracks: 0; overlaps: 0; durations < 1h: 0; neighboring boundaries: PASS`);
