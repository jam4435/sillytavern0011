// Round 2: narrative identity stays in the canonical key; replay uses causal time.
// Source content changes are reviewed separately in the three round-2 reports.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { wuxiaCalendarTimeToTotalMinutes as minutes, totalMinutesToWuxiaCalendarTime as fromMinutes } from '../src/shared/wuxiaCalendar.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, '世界书/金庸群侠传1/世界书');
const apply = process.argv.includes('--apply');
const t = (年, 月, 日, 时 = 0, 分 = 0) => ({ 年, 月, 日, 时, 分 });
const pending = new Map();
const put = (file, content) => { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) pending.set(file, content); };
const aliases = Object.assign({}, ...['early', 'late'].map(group => JSON.parse(fs.readFileSync(path.join(root, `scripts/data/tianlong-round2-${group}-aliases.json`), 'utf8'))));
const oldPalmKey = '天龙第二十七回05-乔峰现身怒喝降龙十八掌退敌';
const newPalmKey = '天龙第二十七回05-乔峰现身怒喝降龙廿八掌退敌';
aliases[oldPalmKey] = newPalmKey;
function replace(value) {
  if (typeof value === 'string') {
    for (const [oldKey, target] of Object.entries(aliases)) value = value.replaceAll(oldKey, target);
    return value;
  }
  if (Array.isArray(value)) return value.map(replace);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const mapped = replace(key), next = replace(item);
      if (Object.hasOwn(result, mapped) && result[mapped] && next && typeof next === 'object') Object.assign(result[mapped], next);
      else result[mapped] = next;
    }
    return result;
  }
  return value;
}
const definitions = new Map();
for (const file of fs.readdirSync(dir).filter(f => /^天龙.+\.yaml$/u.test(f))) {
  let key = file.slice(0, -5);
  const data = replace(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  if (key === oldPalmKey) key = newPalmKey;
  definitions.set(key, data);
}
const ordinary = [...definitions.keys()].filter(k => /回(?!00)\d{2}-/u.test(k));
const keyFor = (chapter, sequence) => {
  const prefix = `天龙第${chapter}回${String(sequence).padStart(2, '0')}-`;
  const found = ordinary.filter(key => key.startsWith(prefix));
  assert.equal(found.length, 1, prefix);
  return found[0];
};
const order = [], assigned = new Set();
function block(chapter, start, { from = 1, to = 99, durations = {}, at = {}, endAt = {} } = {}) {
  let cursor = minutes(start);
  const keys = ordinary.filter(key => key.startsWith(`天龙第${chapter}回`))
    .filter(key => { const n = Number(key.match(/回(\d{2})-/u)[1]); return n >= from && n <= to; }).sort();
  assert.ok(keys.length, chapter);
  for (const key of keys) {
    const n = Number(key.match(/回(\d{2})-/u)[1]), data = definitions.get(key);
    if (at[n]) cursor = minutes(at[n]);
    const duration = durations[n] ?? (minutes(data.事件结束时间) - minutes(data.触发条件)) / 60;
    const end = endAt[n] ? minutes(endAt[n]) : cursor + duration * 60;
    assert.ok(end - cursor >= 60, `${key}: minimum 1h`);
    assert.ok(!assigned.has(key), key);
    data.触发条件 = { 类型: '时间', ...fromMinutes(cursor) };
    data.事件结束时间 = fromMinutes(end);
    assigned.add(key); order.push(key); cursor = end;
  }
  return fromMinutes(cursor);
}
// Keep the already-reviewed opening dates through the first meeting in Jiangnan.
for (const ch of ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三']) {
  const keys = ordinary.filter(key => key.startsWith(`天龙第${ch}回`)).sort();
  for (const key of keys) { assigned.add(key); order.push(key); }
}
block('十四', t(1202,4,18,20), { at: { 2: t(1202,4,19,8) } });
block('十五', t(1202,4,19,9));
block('十六', t(1202,4,19,15));
block('十七', t(1202,4,19,23), { at: { 4: t(1202,4,26,14) } });
block('十八', t(1202,4,27));
block('十九', t(1202,5,1,13));
block('二十', t(1202,5,16,8), { at: { 3:t(1202,5,20,1), 6:t(1202,5,20,20), 7:t(1202,5,22,20) } });
block('二十一', t(1202,5,23,8), { at: { 7:t(1202,5,23,18), 8:t(1202,5,23,22) } });
block('二十二', t(1202,5,23,23));
block('二十三', t(1202,5,28,19));
block('二十四', t(1202,6,15,8), { at: { 4:t(1202,7,25,16), 5:t(1202,7,26,6) } });
block('二十五', t(1202,11,1,8), { at: { 7:t(1202,11,16,10) } });
block('二十八', t(1203,1,1,8), { to:5, at:{ 2:t(1203,1,6,8), 5:t(1203,1,15,8) } });
block('二十六', t(1203,1,20,8));
block('二十七', t(1203,2,1,8));
block('二十八', t(1203,2,3,17), { from:6 });
block('二十九', t(1203,2,3,20), { to:2, at:{2:t(1203,2,11,8)} });
block('三十一', t(1203,2,20,8));
block('三十二', t(1203,2,20,18));
block('三十三', t(1203,2,21,4), { durations:{1:66,2:4,3:1,4:1,5:1,6:1}, endAt:{7:t(1203,3,1,8)} });
block('三十四', t(1203,3,1,8), { durations:{1:120,2:6,3:1,4:1,5:3,7:1}, at:{5:t(1203,3,6,20)}, endAt:{6:t(1203,5,24,7)} });
block('三十五', t(1203,5,24,8), { at:{8:t(1203,6,2,8)} });
block('二十九', t(1203,6,3,8), { from:3,to:3 });
block('二十九', t(1203,6,20,8), { from:4 });
block('三十', t(1203,6,20,14));
block('四十一', t(1203,6,20,23));
block('四十二', t(1203,6,21,7));
block('四十三', t(1203,6,21,15));
block('四十四', t(1203,6,24,16), { to:3, at:{2:t(1203,6,25,8)} });
block('四十四', t(1203,6,25,17), { from:5,to:5 });
block('三十六', t(1203,7,1,8), { at:{6:t(1203,7,27,18)} });
block('三十七', t(1203,7,27,21));
block('三十八', t(1203,7,28,20), { at:{2:t(1203,8,19,8)} });
block('三十九', t(1203,9,10,8), { to:1 });
block('三十九', t(1204,4,23,8), { from:2, at:{5:t(1204,4,23,19),8:t(1204,4,25,23)} });
block('四十', t(1204,5,3,8), { to:1 });
block('四十四', t(1204,5,6,8), { from:7,to:7 });
block('四十四', t(1204,5,7,8), { from:8,to:8 });
block('四十', t(1204,5,27,10), { from:2, at:{3:t(1204,6,11,20)} });
block('四十六', t(1204,6,16,8));
block('四十七', t(1204,6,16,16));
block('四十八', t(1204,7,27,8), { from:2,to:8, at:{4:t(1204,8,14,18),7:t(1204,8,15,8),8:t(1204,8,18,8)} });
block('四十九', t(1204,8,19,8), { to:3 });
block('五十', t(1204,8,30,16), { to:1 });
block('五十', t(1204,9,2,16), { from:4,to:4 });
block('五十', t(1204,10,1,18), { from:5,to:5 });
block('四十九', t(1207,6,16,8), { from:4 });
block('五十', t(1207,7,17,8), { from:3,to:3 });
const accession = definitions.get(keyFor('三十九',1)).触发条件;
const abdication = { ...accession, 年: accession.年 + 40 };
delete abdication.类型;
block('四十八', t(1207,7,17,14), { from:9, endAt:{9:abdication} });
block('五十', t(1243,9,11,16), { from:6 });
assert.equal(assigned.size, ordinary.length, 'Every retained ordinary event appears once');
let previousEnd = -Infinity;
for (const [index,key] of order.entries()) {
  const data = definitions.get(key), start = minutes(data.触发条件), end = minutes(data.事件结束时间);
  assert.ok(start >= previousEnd, `${key}: causal order overlap`);
  assert.ok(end - start >= 60, key); previousEnd = end;
  for (const stamp of [data.触发条件,data.事件结束时间]) {
    for (const [field,min,max] of [['月',1,12],['日',1,30],['时',0,23],['分',0,59]]) assert.ok(Number.isInteger(stamp[field] ?? 0) && (stamp[field] ?? 0) >= min && (stamp[field] ?? 0) <= max, `${key}: ${field}`);
  }
  const next = order[index+1];
  data.后续事件 = next ? { [next]: definitions.get(next).事件引子 } : { 全书完: '群峰依旧，往事留待后人追思。' };
}
// NPC initialization belongs before its first actual participation or delta.
const debutEntries = [...definitions.entries()].filter(([,data]) => data.事件类型 === '登场事件');
const donors = new Map();
for (const [key,data] of debutEntries) for (const [name,record] of Object.entries(data.insert || {})) {
  if (record.初始属性 || record.出生年份) {
    assert.ok(!donors.has(name), `Duplicate full debut: ${name}`);
    donors.set(name,{key,record});
  }
}
for (const [name,{key,record}] of donors) {
  const first = order.find(k => {
    const data = definitions.get(k);
    return (data.参与人物 || []).includes(name) || ['insert','update','delete'].some(action => Object.hasOwn(data[action] || {},name));
  });
  if (!first) continue;
  const data = definitions.get(first), donor = definitions.get(key);
  // Use the same minute: debut sorts before the corresponding ordinary event.
  const earliest = Math.min(minutes(donor.触发条件),minutes(data.触发条件));
  donor.触发条件 = { 类型:'时间',...fromMinutes(earliest) };
  if ((data.参与人物 || []).includes(name)) record.所在位置 = data.事件地点;
  if (name === '游坦之') { record.境界='不入流-圆满';record.状态='健康';record.功法={};record.外貌='衣衫褴褛、神色憔悴的青年，尚未遭铁面毁容。'; }
  if (name === '乔峰' && record.功法?.降龙十八掌) { record.功法.降龙廿八掌=record.功法.降龙十八掌;delete record.功法.降龙十八掌; }
}
// Partial debut updates (identity/position) also precede the chapter's first
// retained event and may never reinitialize an existing character.
for (const [key,data] of debutEntries) {
  const prefix = key.split('00-')[0];
  const first = order.find(k => k.startsWith(prefix));
  const partialNames = new Set(['insert','update','delete'].flatMap(action => Object.keys(data[action] || {}))
    .filter(name => !data.insert?.[name]?.初始属性 && !data.insert?.[name]?.出生年份));
  const partialFirst = order.find(k => k.startsWith(prefix) && [...partialNames].some(name => {
    const node = definitions.get(k);
    return (node.参与人物 || []).includes(name) || ['insert','update','delete'].some(action => Object.hasOwn(node[action] || {},name));
  }));
  const hasFull = Object.values(data.insert || {}).some(record => record.初始属性 || record.出生年份);
  if (partialFirst && !hasFull) data.触发条件 = { 类型:'时间',...fromMinutes(minutes(definitions.get(partialFirst).触发条件)) };
  else if (first) data.触发条件 = { 类型:'时间',...fromMinutes(Math.min(minutes(data.触发条件),minutes(definitions.get(first).触发条件))) };
}
// Current-scene wording follows the actual scene clock; memories stay in text.
for (const n of [1,2,3,4,5,6,7,8]) {
  const data = definitions.get(keyFor('四十一',n));
  for (const field of ['事件引子','事件详情']) if (typeof data[field] === 'string') data[field]=data[field].replaceAll('残阳如血','夜色深沉');
}
const reign = definitions.get(keyFor('四十八',9));
reign.事件详情 = reign.事件详情.replace('开启了大理国长达四十载风调雨顺的辉煌治世','延续自即位以来的宽仁之政；此前的治国岁月与其后在位年限合计四十载');
reign.事件概要 = '段誉自即位起在位合计四十载，晚年将皇位交予段正兴，剃度为僧了思；本节点接续早年政务，仅推进尚未回放的余下在位岁月，最终完成唯一一次禅位与出家。';
// Fix missing healing transition after the four-knife sacrifice.
const recovered = definitions.get(keyFor('十七',1));
recovered.update ||= {}; recovered.update.乔峰 ||= {};
recovered.update.乔峰.状态 = '四处刀伤已敷药包扎，内力仍可运转，尚待调养';

for (const [key,data] of definitions) put(path.join(dir,`${key}.yaml`),`${JSON.stringify(data,null,2)}\n`);
// Remap machine references in other source entries, preserving their contents.
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.yaml') && !f.startsWith('天龙'))) {
  const full=path.join(dir,file),old=fs.readFileSync(full,'utf8');
  let next=old;for(const [a,b]of Object.entries(aliases))next=next.replaceAll(a,b);
  if(next!==old)put(full,next);
}
for (const relative of ['世界书/金庸群侠传1/index.yaml','角色卡/金庸群侠传/index.yaml']) {
  const full=path.join(root,relative),doc=parseDocument(fs.readFileSync(full,'utf8')),seq=doc.get('条目');
  const removedUids=[];
  seq.items=seq.items.filter(item => {
    const name=item.get('名称');
    if(name===oldPalmKey){item.set('名称',newPalmKey);item.set('文件',replace(item.get('文件')));return true;}
    if(Object.hasOwn(aliases,name)){removedUids.push(String(item.get('uid')));return false;}
    return true;
  });
  const meta=seq.items.find(item=>item.get('名称')==='__WI_META_FOLDERS__');
  if(meta){const folders=JSON.parse(meta.get('内容'));for(const uid of removedUids)delete folders.entryFolderMap?.[uid];meta.set('内容',JSON.stringify(folders));}
  put(full,String(doc));
}
const migrationPath=path.join(root,'scripts/data/wuxia-location-migration.json');
const migration=JSON.parse(fs.readFileSync(migrationPath,'utf8'));
for(const oldKey of Object.keys(aliases))for(const suffix of ['.yaml','.yml']){
  const name=oldKey+suffix;if(Object.hasOwn(migration.eventLocationOverrides||{},name)){
    if(oldKey===oldPalmKey)migration.eventLocationOverrides[newPalmKey+suffix]=migration.eventLocationOverrides[name];
    delete migration.eventLocationOverrides[name];
  }
}
put(migrationPath,`${JSON.stringify(migration,null,2)}\n`);
const planPath=path.join(root,'scripts/data/tianlong-causal-order.json');
put(planPath,`${JSON.stringify({version:2,calendar:'360-day',accession,abdication,aliases,order},null,2)}\n`);
if(apply){for(const[file,content]of pending)fs.writeFileSync(file,content);const oldPath=path.join(dir,oldPalmKey+'.yaml');if(fs.existsSync(oldPath))fs.unlinkSync(oldPath);}
console.log(`${apply?'changed':'would-change'} files: ${pending.size}; retained ordinary: ${ordinary.length}; aliases: ${Object.keys(aliases).length}; order, calendar and minimum duration: PASS`);
