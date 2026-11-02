#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  totalMinutesToWuxiaCalendarTime,
  wuxiaCalendarTimeToTotalMinutes,
} from '../src/shared/wuxiaCalendar.js';

const root = process.cwd();
const eventDir = path.join(root, '世界书', '金庸群侠传1', '世界书');
const reportPath = path.join(
  root,
  'plans',
  '武侠事件时长审计',
  '分批修复记录',
  '批次15-天龙第十一回双段押送行程与后续时间链更正.md',
);
const reportText = fs.readFileSync(reportPath, 'utf8');

if (reportText.includes('执行状态：已应用')) {
  console.log('Batch 15 timeline correction already applied; skipping.');
  process.exit(0);
}

const DAY_MINUTES = 24 * 60;
const DOWNSTREAM_SHIFT_DAYS = 23;

function isTimeObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ['年', '月', '日', '时'].every(key => Number.isFinite(Number(value[key]))),
  );
}

function addDays(time, days) {
  return totalMinutesToWuxiaCalendarTime(
    wuxiaCalendarTimeToTotalMinutes(time) + days * DAY_MINUTES,
  );
}

function findFirstTimeObject(value) {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findFirstTimeObject(child);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (isTimeObject(value)) return value;
  for (const child of Object.values(value)) {
    const found = findFirstTimeObject(child);
    if (found) return found;
  }
  return null;
}

function shiftTimeObjects(value, days) {
  if (Array.isArray(value)) {
    return value.reduce((count, child) => count + shiftTimeObjects(child, days), 0);
  }
  if (!value || typeof value !== 'object') return 0;
  if (isTimeObject(value)) {
    Object.assign(value, addDays(value, days));
    return 1;
  }
  return Object.values(value).reduce(
    (count, child) => count + shiftTimeObjects(child, days),
    0,
  );
}

function setFirstTimeObject(value, target) {
  if (Array.isArray(value)) {
    for (const child of value) {
      if (setFirstTimeObject(child, target)) return true;
    }
    return false;
  }
  if (!value || typeof value !== 'object') return false;
  if (isTimeObject(value)) {
    Object.assign(value, target);
    return true;
  }
  for (const child of Object.values(value)) {
    if (setFirstTimeObject(child, target)) return true;
  }
  return false;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateText(time) {
  return String(time.年) + '/' + pad2(time.月) + '/' + pad2(time.日);
}

function sameTime(actual, expected) {
  if (!actual) return false;
  return (
    Number(actual.年) === expected.年 &&
    Number(actual.月) === expected.月 &&
    Number(actual.日) === expected.日 &&
    Number(actual.时) === expected.时 &&
    Number(actual.分 || 0) === (expected.分 || 0)
  );
}

function readEvent(name) {
  const filePath = path.join(eventDir, name);
  if (!fs.existsSync(filePath)) throw new Error('Missing event file: ' + name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeEvent(name, data) {
  fs.writeFileSync(
    path.join(eventDir, name),
    JSON.stringify(data, null, 2) + '\n',
    'utf8',
  );
}

function setEventTimes(name, trigger, end, fields = {}) {
  const data = readEvent(name);
  if (trigger && !setFirstTimeObject(data.触发条件, trigger)) {
    throw new Error('No absolute trigger time found in ' + name);
  }
  if (end) data.事件结束时间 = { ...end };
  Object.assign(data, fields);
  writeEvent(name, data);
  return data;
}

function parseChineseNumber(value) {
  const digits = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  let result = 0;
  let current = 0;
  for (const character of value) {
    if (character === '十') {
      result += (current || 1) * 10;
      current = 0;
    } else if (character === '百') {
      result += (current || 1) * 100;
      current = 0;
    } else if (Object.prototype.hasOwnProperty.call(digits, character)) {
      current = digits[character];
    } else {
      return NaN;
    }
  }
  return result + current;
}

function chapterNumber(filename) {
  const match = filename.match(/^天龙第(.+?)回/);
  return match ? parseChineseNumber(match[1]) : NaN;
}

function replaceTriggerDateInNotes(data, oldTime, newTime) {
  if (!oldTime || !newTime) return;
  const oldForms = [
    dateText(oldTime),
    String(oldTime.年) + '/' + oldTime.月 + '/' + oldTime.日,
  ];
  const replacement = dateText(newTime);
  for (const key of ['触发时间说明', '事件详情']) {
    if (typeof data[key] !== 'string') continue;
    for (const oldText of oldForms) {
      data[key] = data[key].replaceAll(oldText, replacement);
    }
  }
}

function renameEvent(oldBaseName, newBaseName) {
  const oldPath = path.join(eventDir, oldBaseName + '.yaml');
  const newPath = path.join(eventDir, newBaseName + '.yaml');
  const hasOld = fs.existsSync(oldPath);
  const hasNew = fs.existsSync(newPath);
  if (hasOld && !hasNew) {
    fs.renameSync(oldPath, newPath);
    return;
  }
  if (!hasOld && hasNew) return;
  throw new Error(
    'Unexpected rename state for ' + oldBaseName + ' -> ' + newBaseName,
  );
}

function updateFollowupReferences(renameMap) {
  const filenames = fs
    .readdirSync(eventDir)
    .filter(name => name.startsWith('天龙第') && name.endsWith('.yaml'));
  let changedFiles = 0;
  for (const filename of filenames) {
    const data = readEvent(filename);
    if (!data.后续事件 || typeof data.后续事件 !== 'object' || Array.isArray(data.后续事件)) {
      continue;
    }
    const next = {};
    let changed = false;
    for (const [oldKey, oldValue] of Object.entries(data.后续事件)) {
      const newKey = renameMap[oldKey] || oldKey;
      let newValue = oldValue;
      if (typeof newValue === 'string') {
        for (const [oldName, newName] of Object.entries(renameMap)) {
          newValue = newValue.replaceAll(oldName, newName);
        }
      }
      next[newKey] = newValue;
      if (newKey !== oldKey || newValue !== oldValue) changed = true;
    }
    if (changed) {
      data.后续事件 = next;
      writeEvent(filename, data);
      changedFiles += 1;
    }
  }
  return changedFiles;
}

function prependNotice(relativePath, marker, notice) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return false;
  const current = fs.readFileSync(fullPath, 'utf8');
  if (current.includes(marker)) return false;
  fs.writeFileSync(fullPath, notice + '\n\n' + current, 'utf8');
  return true;
}

// Guard against applying the 23-day cascade to an already shifted timeline.
const sentinel = readEvent('天龙第十二回02-阿朱易容老仆瞒过番僧.yaml');
const sentinelTrigger = findFirstTimeObject(sentinel.触发条件);
if (!sameTime(sentinelTrigger, { 年: 1202, 月: 4, 日: 16, 时: 12, 分: 0 })) {
  throw new Error(
    'Unexpected Chapter 12.02 trigger date; refusing to apply a blind +23-day shift.',
  );
}

// Shift all absolute trigger and end timestamps from Chapter 12 through Chapter 50.
// Relative durations are deliberately untouched; the shared 360-day calendar is used.
const tianlongFiles = fs
  .readdirSync(eventDir)
  .filter(name => name.startsWith('天龙第') && name.endsWith('.yaml'));
let shiftedEventFiles = 0;
let shiftedTriggerObjects = 0;
let shiftedEndObjects = 0;

for (const filename of tianlongFiles) {
  const chapter = chapterNumber(filename);
  if (!Number.isFinite(chapter) || chapter < 12 || chapter > 50) continue;

  const data = readEvent(filename);
  const oldTriggerObject = findFirstTimeObject(data.触发条件);
  const oldTrigger = oldTriggerObject ? { ...oldTriggerObject } : null;
  const triggerCount = shiftTimeObjects(data.触发条件, DOWNSTREAM_SHIFT_DAYS);
  const newTriggerObject = findFirstTimeObject(data.触发条件);
  const newTrigger = newTriggerObject ? { ...newTriggerObject } : null;
  const endCount = shiftTimeObjects(data.事件结束时间, DOWNSTREAM_SHIFT_DAYS);

  if (oldTrigger && triggerCount > 0) {
    replaceTriggerDateInNotes(data, oldTrigger, newTrigger);
  }
  if (triggerCount > 0 || endCount > 0) {
    writeEvent(filename, data);
    shiftedEventFiles += 1;
    shiftedTriggerObjects += triggerCount;
    shiftedEndObjects += endCount;
  }
}

// First leg: Dali -> an unnamed Jiangnan small town. 00:00 is only the existing
// continuity anchor; the novel does not specify the exact departure hour.
const event1101 = readEvent('天龙第十一回01-鸠摩智生擒段誉疾驰赴江南.yaml');
event1101.事件结束时间 = { 年: 1202, 月: 4, 日: 15, 时: 20, 分: 0 };
event1101.事件地点 = '大宋/未知地域/未知地点';
event1101.触发时间说明 =
  '1202/03/26 00:00仅为与第十回10结束时间连续的时间轴起点。原文未明确押送起行的精确时刻；“前三个时辰”山野行进及“到得傍晚”投宿是当日行动顺序，不应把00:00理解为原文明示的午夜起行。第一段终点依据“当晚两人在一座小城客店中歇宿”估算为1202/04/15 20:00，具体日期与钟点并非原文明载。';
event1101.事件引子 =
  '段誉穴道受制，被鸠摩智交给随从带离牟尼堂。随从分路引开追兵后，鸠摩智亲自提着段誉北行，十余天后转向东北，二十余日后在江南一座未具名小城客店歇宿。';
event1101.事件概要 =
  '鸠摩智挟持段誉离开天龙寺后先令随从分路迷惑追兵，随后亲自提着段誉一路北行。先穿行荒山野岭，十余天后改向东北并沿途渡河，后来买马继续赶路。二十余日后，二人在江南一座未具名小城客店歇宿，完成第一段押送；此后仍须继续向东行二十余日，才会抵达苏州。';
event1101.事件详情 =
  '鸠摩智将段誉抛给门外九名部属后，部属分乘十匹马分路而行，以扰乱保定帝等人的追兵。奔出十余里后，各路人马分道；鸠摩智随后跃下马背，取皮带缚住段誉腰间，亲自提着他从山坳间北行。原文记载鸠摩智亲自提着段誉在荒山野岭中穿行三个时辰，到得傍晚才将段誉系在树枝上，递给他几块干粮，并解开左手小臂穴道供他取食。此后数日，鸠摩智提着段誉不停北行；十余天后，行进方向改为东北，仍避开大路，地势渐平、山渐少水渐多，一日之中往往多次渡河。后来鸠摩智买下两匹马，与段誉分乘，段誉周身大穴始终未解。第一段押送二十余日后，二人在江南一座未具名小城客店歇宿；当晚鸠摩智试图逼段誉默写六脉神剑经文，段誉据理拒绝，指出此举无异于自寻死路。此处小城并非原文点名的常熟，也不是太湖；客店歇宿之后，原文另写二人“自此一路向东，又行了二十余日”，才抵达苏州城外。';
event1101.后续事件 = {
  '天龙第十一回02-鸠摩智抵苏州城外遇崔百泉过彦之':
    '第一段押送在江南未具名小城歇宿后，二人再一路向东行二十余日，终于抵达苏州城外，遇见崔百泉与过彦之。',
};
writeEvent('天龙第十一回01-鸠摩智生擒段誉疾驰赴江南.yaml', event1101);

// Second leg: the novel explicitly says another twenty-plus days east to Suzhou.
// The absolute arrival date is not stated; this is a conservative timeline anchor.
const event1102 = readEvent('天龙第十一回02-鸠摩智携段誉抵太湖遇崔百泉过彦之.yaml');
setFirstTimeObject(event1102.触发条件, { 年: 1202, 月: 5, 日: 7, 时: 6, 分: 0 });
event1102.事件结束时间 = { 年: 1202, 月: 5, 日: 7, 时: 7, 分: 0 };
event1102.事件地点 = '大宋/苏州府/苏州郊野';
event1102.触发时间说明 =
  '原文明确写第一段小城歇宿之后“自此一路向东，又行了二十余日”，但未给出苏州抵达的绝对日期或钟点。1202/05/07 06:00是从1202/04/15夜间歇宿后按二十一日余量推定的时间轴估算锚点，不是原文明示日期。';
event1102.事件引子 =
  '在江南未具名小城客店歇宿后，鸠摩智与段誉再一路向东行了二十余日，终于抵达苏州城外，湖畔遇见崔百泉与过彦之。';
event1102.事件概要 =
  '鸠摩智与段誉在江南小城歇宿后，继续一路向东又行二十余日，终于抵达苏州城外。鸠摩智向途人打听参合庄路径，遇见崔百泉与过彦之；二人认出段誉，双方在湖岸交涉。';
event1102.事件详情 =
  '第一段北行、东北行结束后，鸠摩智与段誉曾在江南一座未具名小城客店歇宿。原文随后明确写道：“自此一路向东，又行了二十余日”，段誉听着途人口音渐觉清雅绵软，知道已到江南，这一日终于到了苏州城外。鸠摩智向途人询问参合庄路径，继而遇见崔百泉与过彦之。崔百泉与过彦之认出段誉，惊疑之下追问鸠摩智为何擒拿大理段氏小王爷。鸠摩智不肯详述，只说要去慕容氏府上，并向二人打听参合庄所在。段誉担心崔百泉与过彦之因相救自己而枉送性命，出言劝他们尽快离开。崔百泉与过彦之虽知双方武功悬殊，仍心存救人之意，双方在苏州城外湖岸交涉。原文没有点明第一段小城为常熟，也没有写鸠摩智在常熟雇舟；抵达苏州城外的确切年月日时同样未载。';
event1102.后续事件 = {
  '天龙第十一回03-太湖荷荡闻歌初逢绿衣少女':
    '苏州城外湖岸交涉之际，一叶小舟自荷荡中划来，绿衫少女阿碧唱着采莲小曲缓缓靠近。',
};
writeEvent('天龙第十一回02-鸠摩智携段誉抵太湖遇崔百泉过彦之.yaml', event1102);

// The following daytime sequence is placed backward from the explicit 未牌 arrival
// and the stated boat journey of more than two shichen (more than four hours).
setEventTimes(
  '天龙第十一回03-太湖荷荡闻歌初逢绿衣少女.yaml',
  { 年: 1202, 月: 5, 日: 7, 时: 7, 分: 0 },
  { 年: 1202, 月: 5, 日: 7, 时: 8, 分: 0 },
  {
    触发时间说明:
      '原文未明示阿碧乘舟出现的具体钟点；本事件按苏州城外会面后的同日顺序估算为07:00，后续问路、引舟及未牌抵达琴韵小筑的时段另行锚定。',
  },
);
setEventTimes(
  '天龙第十一回04-鸠摩智问路参合庄阿碧允引路.yaml',
  { 年: 1202, 月: 5, 日: 7, 时: 8, 分: 0 },
  { 年: 1202, 月: 5, 日: 7, 时: 9, 分: 0 },
  {
    触发时间说明:
      '原文只记鸠摩智与阿碧在湖边问路、应允引舟，没有明确钟点；08:00—09:00为同日事件顺序的估算窗口。',
  },
);

// Correct destination and duration: 琴韵小筑, not 听香水榭; two-plus shichen
// is more than four hours. 09:00—14:00 is a five-hour estimate ending in 未牌时分.
const event1105 = readEvent('天龙第十一回05-阿碧引舟穿芦苇荡登听香水榭.yaml');
setFirstTimeObject(event1105.触发条件, { 年: 1202, 月: 5, 日: 7, 时: 9, 分: 0 });
event1105.事件结束时间 = { 年: 1202, 月: 5, 日: 7, 时: 14, 分: 0 };
event1105.事件地点 = '大宋/太湖/琴韵小筑';
event1105.触发时间说明 =
  '原文明确记载众人曲折行船“两个多时辰”，至“未牌时分”才抵达琴韵小筑。以未牌时段中约14:00作为抵达锚点，按五小时船程回推09:00；具体钟点未由原文明确，五小时为时间轴估算。';
event1105.事件引子 =
  '阿碧的小舟在前引路，鸠摩智与段誉所乘乌篷船跟随穿过荷荡、菱塘与密布芦苇的水道，驶向太湖中的琴韵小筑。';
event1105.事件概要 =
  '阿碧引舟带领众人穿过太湖荷荡、菱塘与曲折芦苇水道，行船两个多时辰，至未牌时分抵达琴韵小筑。此处是阿碧居所，不是听香水榭；众人登岸后在小筑落脚。';
event1105.事件详情 =
  '阿碧手撑竹篙在前引路，鸠摩智与段誉所乘乌篷船紧随其后。两艘小船进入太湖水域后，先后穿过荷花荡、菱塘与密布的芦苇水道，水路曲折，岔道繁多。原文明确写众人“曲曲折折的划了两个多时辰”，至“未牌时分”才遥遥望见绿柳丛中露出屋宇飞檐。众人随后靠岸登上琴韵小筑所在的小岛或半岛，阿碧说明此处是慕容公子给她居住的小筑。这里的目的地是琴韵小筑，并非听香水榭；听香水榭要到次日一早才前往。时间轴以14:00作为未牌时分的估算抵达点，五小时船程为据此回推的模型时长，原文未明示精确钟点。';
event1105.后续事件 = {
  '天龙第十一回06-鸠摩智琴韵小筑道明来意留宿':
    '众人抵达琴韵小筑后，阿碧奉茶款待，鸠摩智道明来意；阿碧安排众人留宿一夜，次日一早再往听香水榭。',
};
writeEvent('天龙第十一回05-阿碧引舟穿芦苇荡登听香水榭.yaml', event1105);

// The red-clad girl belongs to the next morning at 听香水榭 (Chapter 12.01),
// not the afternoon tea at 琴韵小筑.
const event1106 = readEvent('天龙第十一回06-鸠摩智道明来意红裳少女现身.yaml');
setFirstTimeObject(event1106.触发条件, { 年: 1202, 月: 5, 日: 7, 时: 14, 分: 0 });
event1106.事件结束时间 = { 年: 1202, 月: 5, 日: 7, 时: 18, 分: 0 };
event1106.事件地点 = '大宋/太湖/琴韵小筑';
event1106.触发时间说明 =
  '原文写众人未牌时分抵达琴韵小筑，随后茶叙、问答并决定留宿；14:00—18:00为当日下午的估算窗口。阿碧说明次日一早送众人前往听香水榭，阿朱的红裳登场不属于本事件。';
event1106.事件引子 =
  '琴韵小筑内茶香四溢，阿碧殷勤奉茶，鸠摩智道明此行来意并询问慕容博与慕容复的消息。';
event1106.事件概要 =
  '众人抵达琴韵小筑后，阿碧奉茶与点心款待。鸠摩智说明此行要履行与慕容博的旧约，并询问慕容复下落；阿碧解释阿朱居所远在水路之外，今日来不及前往，遂安排众人留宿一夜，次日一早再送往听香水榭。';
event1106.事件详情 =
  '众人抵达琴韵小筑后，阿碧请客入厅，奉上清茶与苏州点心。段誉品茶，听着阿碧柔和的吴侬软语，暂时忘却穴道受制之苦。鸠摩智借品茗道明此行是为履行早年与慕容博的旧约，欲将《六脉神剑经》焚化于慕容先生墓前，并探问慕容复下落。阿碧说明阿朱的庄子离此处尚有四九水路，今日已来不及前往，便请众人在琴韵小筑住上一晚，明朝一早再送众人前往听香水榭。原文此处尚未写红裳少女阿朱现身；阿朱是在次日听香水榭场景中出场。';
event1106.后续事件 = {
  '天龙第十二回01-阿朱水榭迎客暗谋营救':
    '次日一早，阿碧送众人前往听香水榭，红裳少女阿朱出迎，察觉段誉受制后暗中筹划营救。',
};
writeEvent('天龙第十一回06-鸠摩智道明来意红裳少女现身.yaml', event1106);

// Character debut and the Chapter 12 water-pavilion meeting follow the corrected route.
setEventTimes(
  '天龙第十一回00-人物登场.yaml',
  { 年: 1202, 月: 5, 日: 7, 时: 6, 分: 0 },
  null,
  {
    触发时间说明:
      '崔百泉、过彦之及阿碧在第二段东行二十余日后、苏州城外及太湖水路剧情中登场；具体日期未载，06:00仅为时间轴估算锚点。',
  },
);
setEventTimes(
  '天龙第十二回00-人物登场.yaml',
  { 年: 1202, 月: 5, 日: 8, 时: 8, 分: 0 },
  null,
  {
    触发时间说明:
      '阿朱在琴韵小筑留宿后的次日一早、众人抵达听香水榭时正式出场；具体钟点未载，08:00为估算锚点。',
  },
);
setEventTimes(
  '天龙第十二回01-阿朱水榭迎客暗谋营救.yaml',
  { 年: 1202, 月: 5, 日: 8, 时: 8, 分: 0 },
  { 年: 1202, 月: 5, 日: 8, 时: 9, 分: 0 },
  {
    触发时间说明:
      '原文明确阿碧在琴韵小筑留宿后“明朝一早”送众人到听香水榭，阿朱随后出迎；08:00—09:00为“次日一早”的时间轴估算窗口。',
  },
);

// Rename event files so their canonical keys match the actual locations and sequence.
const renameMap = {
  '天龙第十一回02-鸠摩智携段誉抵太湖遇崔百泉过彦之':
    '天龙第十一回02-鸠摩智抵苏州城外遇崔百泉过彦之',
  '天龙第十一回05-阿碧引舟穿芦苇荡登听香水榭':
    '天龙第十一回05-阿碧引舟穿荷荡芦苇抵达琴韵小筑',
  '天龙第十一回06-鸠摩智道明来意红裳少女现身':
    '天龙第十一回06-鸠摩智琴韵小筑道明来意留宿',
};
for (const [oldName, newName] of Object.entries(renameMap)) {
  renameEvent(oldName, newName);
}
const updatedFollowupFiles = updateFollowupReferences(renameMap);

// Add the actual novel location to the strict location table.
const locationTablePath = path.join(root, 'src', '武侠', '武侠地点表.yaml');
let locationTable = fs.readFileSync(locationTablePath, 'utf8');
if (!locationTable.includes('  - 琴韵小筑')) {
  const marker = '  - 太湖水域\n  - 听香水榭\n  - 燕子坞';
  if (!locationTable.includes(marker)) {
    throw new Error('Could not find the 太湖 location block in 武侠地点表.yaml');
  }
  locationTable = locationTable.replace(
    marker,
    '  - 太湖水域\n  - 听香水榭\n  - 琴韵小筑\n  - 燕子坞',
  );
  fs.writeFileSync(locationTablePath, locationTable, 'utf8');
}

// The current story narration of the historical Yanmen Pass flashback moved with
// the Chapter 12+ timeline; the ~1172 historical date notes are intentionally unchanged.
const noticeBatch10 =
  '> **批次15更正**：本报告原先将“二十余日”误作从大理至苏州的整段押送时间，遗漏了江南小城歇宿后“自此一路向东，又行了二十余日”的第二段。当前时间轴以批次15为准：第十一回01于1202/04/15 20:00结束在未具名江南小城；第十一回02于1202/05/07 06:00（估算锚点）抵苏州城外；第十二回02及后续天龙事件按批次15整体顺延23天，第十二回00/01另按“次日一早”重锚。本报告原日期表为更正前基准。';
const noticeLater =
  '> **批次15日期基准更正**：本报告所列天龙第十二回以后事件日期为更正前基准。因第十一回原文明确在江南小城歇宿后还要向东行二十余日才抵苏州，现已按批次15统一顺延23天；各事件相对持续时间保持不变。请以批次15报告为当前时间基准。';
const noticeBatch14 =
  '> **批次15复核更正**：本报告第三节的初次押送裁决不完整。第十一回原文实际包含前后两段各二十余日的旅程：第一段止于江南未具名小城，第二段继续向东至苏州；本报告原先将第一段误当成全程，相关地点、时间及后续日期均以批次15为准。';
const noticeSummary =
  '> **批次15全局时间轴更正**：重新读取第十一回原文后确认，江南小城歇宿后还要继续向东行二十余日才抵达苏州。第十一回01结束时间修正为1202/04/15 20:00；第十一回02以1202/05/07 06:00作为估算到达锚点；第十二回02至第五十回的天龙事件绝对触发/结束时间统一顺延23天，第十二回00/01按次日一早重锚。各事件持续时长不变；第十六回历史闪回的当前讲述时间随之顺延，约1172年的历史发生年代不变。以下旧日期表为批次15之前的审计基准。';

prependNotice(
  'plans/武侠事件时长审计/分批修复记录/批次10-天龙第十一回至第二十回时间链审计.md',
  '批次15更正',
  noticeBatch10,
);
for (const filename of [
  '批次11-天龙第二十一回至第三十回时间链审计.md',
  '批次12-天龙第三十一回至第四十回时间链审计.md',
  '批次13-天龙第四十一回至第五十回时间链审计.md',
]) {
  prependNotice(
    'plans/武侠事件时长审计/分批修复记录/' + filename,
    '批次15日期基准更正',
    noticeLater,
  );
}
prependNotice(
  'plans/武侠事件时长审计/分批修复记录/批次14-小说原文复核与疑点裁决.md',
  '批次15复核更正',
  noticeBatch14,
);
prependNotice(
  'plans/武侠事件时长审计/天龙八部全量时间审计汇总.md',
  '批次15全局时间轴更正',
  noticeSummary,
);

const finalReport = fs.readFileSync(reportPath, 'utf8');
const appliedStatus =
  '执行状态：已应用（第十二至第五十回顺延事件文件 ' +
  shiftedEventFiles +
  ' 个；触发时间对象 ' +
  shiftedTriggerObjects +
  ' 个；结束时间对象 ' +
  shiftedEndObjects +
  ' 个；特殊事件与地点修正已完成；后续引用更新文件 ' +
  updatedFollowupFiles +
  ' 个）';
fs.writeFileSync(
  reportPath,
  finalReport.replace('执行状态：待执行', appliedStatus),
  'utf8',
);

console.log(
  JSON.stringify(
    {
      shiftedEventFiles,
      shiftedTriggerObjects,
      shiftedEndObjects,
      updatedFollowupFiles,
      downstreamShiftDays: DOWNSTREAM_SHIFT_DAYS,
      firstLegEnd: '1202/04/15 20:00',
      secondLegArrivalAnchor: '1202/05/07 06:00',
      boatTrip: '5 hours, ending at 未牌 estimate 14:00',
      nextMorningWaterPavilion: '1202/05/08 08:00',
    },
    null,
    2,
  ),
);
