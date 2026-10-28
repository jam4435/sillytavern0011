import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wuxiaCalendarTimeToTotalMinutes as minutes, totalMinutesToWuxiaCalendarTime as fromMinutes } from '../src/shared/wuxiaCalendar.js';
const directory=path.join(fileURLToPath(new URL('../',import.meta.url)),'世界书/金庸群侠传1/世界书');
const t=(年,月,日,时,分=0)=>({年,月,日,时,分});
const row=(start,hours,reason)=>[start,fromMinutes(minutes(start)+hours*60),reason];
const schedules=[
 ['一',[
  row(t(1202,3,15,11,30),1,'比剑削髻'),row(t(1202,3,15,12,30),1,'喝彩中传笑'),row(t(1202,3,15,13,30),1,'跃下解释'),row(t(1202,3,15,14,30),1,'当场持剑发难'),row(t(1202,3,15,15,30),1,'剑至胸前纵貂救人'),row(t(1202,3,15,16,30),1,'急报围山'),row(t(1202,3,15,17,30),1,'两宗整队'),row(t(1202,3,15,18,30),1,'请缨赴险接第二回'),
 ]],
 ['三',[
  row(t(1202,3,17,6,30),1,'第二回星夜启程，留约25小时赴谷'),row(t(1202,3,17,7,30),1,'寻人时闻斗声'),row(t(1202,3,17,8,30),1,'当场击退敌人'),row(t(1202,3,17,9,30),1,'问姓扬鞭'),row(t(1202,3,17,10,30),1,'迎鞭递鞋说明'),row(t(1202,3,17,11,30),1,'商量同行'),row(t(1202,3,17,12,30),1,'徒步追马与劝骑'),row(t(1202,3,17,13,30),1,'上马出谷'),
 ]],
 ['四',[
  row(t(1202,3,17,14,30),3,'接出谷，路行一个多时辰并破阻'),row(t(1202,3,17,17,30),1,'入毒阵驱敌'),row(t(1202,3,17,18,30),1,'司空玄现身擒人'),row(t(1202,3,17,19,30),1,'木婉清负伤救人'),row(t(1202,3,17,20,30),1,'追兵逼至断崖'),row(t(1202,3,17,21,30),1,'跳崖坠台，直接接第五回'),
 ]],
 ['六',[
  row(t(1202,3,18,5,30),1,'接上回负伤逃离，破晓抵农舍疗伤'),row(t(1202,3,18,6,30),1,'农舍突遭围困'),row(t(1202,3,18,7,30),1,'护人交涉'),row(t(1202,3,18,8,30),1,'风波恶出手'),row(t(1202,3,18,9,30),1,'连续避招'),row(t(1202,3,18,10,30),1,'二将赶至'),row(t(1202,3,18,11,30),1,'合力退敌'),row(t(1202,3,18,12,30),1,'二将请罪'),row(t(1202,3,18,13,30),1,'表白与启程归府'),
 ]],
 ['七',[
  row(t(1202,3,20,14),1,'前留归大理路程，返府相迎'),row(t(1202,3,20,15),1,'内堂叙历险'),row(t(1202,3,20,16),1,'运功驱毒'),row(t(1202,3,20,17),1,'设席问身世；晚宴时段受固定边界挤压'),row(t(1202,3,20,18),1,'同席辨血缘'),row(t(1202,3,20,19),1,'真相揭晓'),row(t(1202,3,20,20),1,'当场夺刃'),row(t(1202,3,20,21),1,'夜奔昏厥，紧接第八回'),
 ]],
 ['十三',[
  row(t(1202,4,14,18),1,'接十二回初见、引荐'),row(t(1202,4,14,19),1,'湖面强敌突至'),row(t(1202,4,14,20),1,'退守水榭'),row(t(1202,4,14,21),1,'家臣赶至力战'),row(t(1202,4,14,22),1,'现场指点破鞭'),row(t(1202,4,14,23),1,'青城敌人紧接上前'),row(t(1202,4,15,0),1,'指点多派鏖战'),row(t(1202,4,15,1),1,'群豪退兵约数日后杏林'),
 ]],
 ['十五',[
  row(t(1202,5,23,0),1,'重复杏林围聚，前回留下11小时空档'),row(t(1202,5,23,1),1,'当众发难'),row(t(1202,5,23,2),1,'结阵围攻'),row(t(1202,5,23,3),1,'当场破阵'),row(t(1202,5,23,4),1,'以刀赎罪'),row(t(1202,5,23,5),1,'群长老伏罪、名宿到场'),
 ]],
 ['十六',[
  row(t(1202,5,23,6),1,'接名宿到场交遗书'),row(t(1202,5,23,7),1,'当场宣读'),row(t(1202,5,23,8),1,'智光当众讲述往事'),row(t(1202,5,23,9),1,'继续讲述关外血战'),row(t(1202,5,23,10),1,'继续讲述收养及成长'),row(t(1202,5,23,11),1,'回到杏林验刺青'),row(t(1202,5,23,12),1,'康敏当众指控'),row(t(1202,5,23,13),1,'辞位离林，直接接十七回'),
 ]],
];
let last=-Infinity,count=0;const pending=[];
function change(file,values){const p=path.join(directory,file),original=fs.readFileSync(p,'utf8'),before=JSON.parse(original),eol=original.includes('\r\n')?'\r\n':'\n';let next=original;for(const [key,value] of Object.entries(values)){const re=new RegExp(`("${key}": )\\{[^{}]*\\}`,'u');assert.ok(re.test(next),file);const block=JSON.stringify(value,null,2).split('\n').map((s,i)=>i?'  '+s:s).join(eol);next=next.replace(re,(_,prefix)=>prefix+block);}const strip=({触发条件,事件结束时间,...rest})=>rest;assert.deepEqual(strip(JSON.parse(next)),strip(before),file);if(next!==original)pending.push([p,next]);}
for(const [chapter,rows] of schedules){const files=fs.readdirSync(directory).filter(f=>f.startsWith(`天龙第${chapter}回`)&&/回(?!00)\d{2}-.*\.yaml$/u.test(f)).sort();assert.equal(files.length,rows.length,chapter);for(const [i,file] of files.entries()){const [start,end,reason]=rows[i];assert.ok(minutes(start)>=last,file);assert.ok(minutes(end)-minutes(start)>=60,file);last=minutes(end);change(file,{触发条件:{类型:'时间',...start},事件结束时间:end});count++;console.log(`${file}: ${JSON.stringify(start)} → ${JSON.stringify(end)} ${reason}`);}const debut=`天龙第${chapter}回00-人物登场.yaml`;if(fs.existsSync(path.join(directory,debut)))change(debut,{触发条件:{类型:'时间',...rows[0][0]}});}
function boundary(prefix,field){const f=fs.readdirSync(directory).find(x=>x.startsWith(prefix));assert.ok(f,prefix);return minutes(JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))[field]);}
assert.equal(minutes(schedules[0][1].at(-1)[1]),boundary('天龙第二回01-','触发条件'));
assert.ok(minutes(schedules[1][1][0][0])>=boundary('天龙第二回07-','事件结束时间'));
assert.equal(minutes(schedules[2][1].at(-1)[1]),boundary('天龙第五回01-','触发条件'));
assert.equal(minutes(schedules[3][1][0][0]),boundary('天龙第五回07-','事件结束时间'));
assert.equal(minutes(schedules[4][1].at(-1)[1]),boundary('天龙第八回01-','触发条件'));
assert.equal(minutes(schedules[5][1][0][0]),boundary('天龙第十二回06-','事件结束时间'));
assert.ok(minutes(schedules[5][1].at(-1)[1])<=boundary('天龙第十四回01-','触发条件'));
assert.ok(minutes(schedules[6][1][0][0])>=boundary('天龙第十四回06-','事件结束时间'));
assert.equal(minutes(schedules[7][1].at(-1)[1]),boundary('天龙第十七回01-','触发条件'));
assert.equal(count,61);if(process.argv.includes('--apply'))for(const [p,data] of pending)fs.writeFileSync(p,data);console.log(`${process.argv.includes('--apply')?'changed':'would-change'} files: ${pending.length}; reviewed: ${count}; boundaries: PASS`);
