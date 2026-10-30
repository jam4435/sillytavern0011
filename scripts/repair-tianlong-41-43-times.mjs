// Historical round-1 schedule; round 2 owns the current causal timeline.
if (process.argv.includes('--apply')) {
  throw new Error('旧排期已停用，请使用 scripts/repair-tianlong-causal-timeline.mjs --apply');
}
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wuxiaCalendarTimeToTotalMinutes as minutes, totalMinutesToWuxiaCalendarTime as fromMinutes } from '../src/shared/wuxiaCalendar.js';
const directory=path.join(fileURLToPath(new URL('../',import.meta.url)),'世界书/金庸群侠传1/世界书');
const t=(年,月,日,时,分=0)=>({年,月,日,时,分});
const row=(start,hours,reason)=>[start,fromMinutes(minutes(start)+hours*60),reason];
const schedules=[
 ['四十一',[
  row(t(1205,3,30,17),1,'残阳下蒙面双老现身'),row(t(1205,3,30,18),1,'揭面认亲'),row(t(1205,3,30,19),1,'讲述潜伏与血案，往事不回拨'),row(t(1205,3,30,20),1,'另一老者揭面'),row(t(1205,3,30,21),1,'当场揭雁门案'),row(t(1205,3,30,22),1,'两家父子交战'),row(t(1205,3,30,23),1,'连续追斗进藏经阁'),row(t(1205,4,1,0),1,'阁中神僧现身'),
 ]],
 ['四十二',[
  row(t(1205,4,1,1),1,'老僧现身重复，续讲佛理'),row(t(1205,4,1,2),1,'当场道破隐疾'),row(t(1205,4,1,3),1,'偷袭及气墙化解'),row(t(1205,4,1,4),1,'慕容博求死受掌'),row(t(1205,4,1,5),1,'当场萧峰出掌、远山受掌'),row(t(1205,4,1,6),1,'二子扑尸、老僧立刻携尸飞遁'),row(t(1205,4,1,7),1,'即刻运功龟息救治'),row(t(1205,4,1,8),1,'苏醒后顿悟剃度'),
 ]],
 ['四十三',[
  row(t(1205,4,1,9),1.25,'移步大殿审案，叶二娘到场'),row(t(1205,4,1,10,15),1.25,'验疤认母'),row(t(1205,4,1,11,30),1.25,'玄慈自承生子'),row(t(1205,4,1,12,45),1.25,'追问雁门旧案'),row(t(1205,4,1,14),1.25,'当堂刑杖二百'),row(t(1205,4,1,15,15),1.25,'受刑后圆寂'),row(t(1205,4,1,16,30),1.25,'叶二娘当场自刎'),row(t(1205,4,1,17,45),1.25,'虚竹悲恸昏厥'),
 ]],
];
let last=-Infinity,count=0;const pending=[];
function validTime(time,file){for(const [key,min,max] of [['月',1,12],['日',1,30],['时',0,23],['分',0,59]])assert.ok(Number.isInteger(time[key])&&time[key]>=min&&time[key]<=max,`${file}: 无效${key}`);assert.ok(Number.isInteger(time.年),`${file}: 无效年`);}
function change(file,values){const p=path.join(directory,file),original=fs.readFileSync(p,'utf8'),before=JSON.parse(original),eol=original.includes('\r\n')?'\r\n':'\n';let next=original;for(const [key,value] of Object.entries(values)){const re=new RegExp(`("${key}": )\\{[^{}]*\\}`,'u');assert.ok(re.test(next),file);const block=JSON.stringify(value,null,2).split('\n').map((s,i)=>i?'  '+s:s).join(eol);next=next.replace(re,(_,prefix)=>prefix+block);}const strip=({触发条件,事件结束时间,...rest})=>rest;assert.deepEqual(strip(JSON.parse(next)),strip(before),file);if(next!==original)pending.push([p,next]);}
for(const [chapter,rows] of schedules){const files=fs.readdirSync(directory).filter(f=>f.startsWith(`天龙第${chapter}回`)&&/回(?!00)\d{2}-.*\.yaml$/u.test(f)).sort();assert.equal(files.length,rows.length,chapter);for(const [i,file] of files.entries()){const [start,end,reason]=rows[i];validTime(start,file);validTime(end,file);assert.deepEqual(fromMinutes(minutes(start)),start,`${file}: 有效历法日期`);assert.ok(minutes(start)>=last,file);assert.ok(minutes(end)-minutes(start)>=60,file);last=minutes(end);change(file,{触发条件:{类型:'时间',...start},事件结束时间:end});count++;console.log(`${file}: ${JSON.stringify(start)} → ${JSON.stringify(end)} ${reason}`);}const debut=`天龙第${chapter}回00-人物登场.yaml`;if(fs.existsSync(path.join(directory,debut)))change(debut,{触发条件:{类型:'时间',...rows[0][0]}});}
function boundary(prefix,field){const f=fs.readdirSync(directory).find(x=>x.startsWith(prefix));assert.ok(f,prefix);return minutes(JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))[field]);}
assert.ok(minutes(schedules[0][1][0][0])>=boundary('天龙第四十回07-','事件结束时间'));assert.ok(minutes(schedules[2][1].at(-1)[1])<=boundary('天龙第四十四回01-','触发条件'));assert.equal(count,24);
if(process.argv.includes('--apply'))for(const [p,data] of pending)fs.writeFileSync(p,data);console.log(`${process.argv.includes('--apply')?'changed':'would-change'} files: ${pending.length}; reviewed: ${count}; boundaries: PASS`);
