import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wuxiaCalendarTimeToTotalMinutes as minutes, totalMinutesToWuxiaCalendarTime as fromMinutes } from '../src/shared/wuxiaCalendar.js';
const directory = path.join(fileURLToPath(new URL('../', import.meta.url)), '世界书/金庸群侠传1/世界书');
const t = (年,月,日,时,分=0) => ({年,月,日,时,分});
const row = (start,hours,reason) => [start,fromMinutes(minutes(start)+hours*60),reason];
const schedules = [
 ['二',[
  row(t(1202,3,15,19,30),1,'接剑湖宫赴营求和'),row(t(1202,3,15,20,30),1,'挥锄与纵貂当场发生'),row(t(1202,3,15,21,30),1,'毒貂被网、钟灵受制'),row(t(1202,3,15,22,30),1,'逼药交信物并出营'),row(t(1202,3,15,23,30),2,'夜行坠崖并下至谷底'),row(t(1202,3,16,1,30),2,'月下寻洞及磕首'),row(t(1202,3,16,3,30),2,'发现卷轴阅览、启程'),
 ]],
 ['五',[
  row(t(1202,3,17,22,30),1,'接坠台后探视伤情'),row(t(1202,3,17,23,30),1,'揭纱定盟'),row(t(1202,3,18,0,30),1,'困台商量自救'),row(t(1202,3,18,1,30),1,'展卷初练'),row(t(1202,3,18,2,30),1,'指点反复演练'),row(t(1202,3,18,3,30),1,'夜间追兵搜至崖底'),row(t(1202,3,18,4,30),1,'背人脱险，接第六回破晓奔行'),
 ]],
 ['八',[
  row(t(1202,3,20,22),60,'昏迷两日后另留半日忧思、探视请命'),row(t(1202,3,23,10),2,'出府策马半途遭伏'),row(t(1202,3,23,12),1,'林道立即交锋'),row(t(1202,3,23,13),1,'当场步法避敌'),row(t(1202,3,23,14),1,'交锋中制岳老三'),row(t(1202,3,23,15),1,'援军抵达退敌'),
 ]],
 ['九',[
  row(t(1202,3,24,2),1,'阴谋擒人并燃药'),row(t(1202,3,24,3),1,'室内抗药'),row(t(1202,3,24,4),1,'救援者抵达石室破门'),row(t(1202,3,24,5),6,'掘洞换人，留至正午前'),row(t(1202,3,24,11),1,'正午揭门'),row(t(1202,3,24,12),1,'立即交战及退敌'),
 ]],
 ['十二',[
  row(t(1202,4,13,19),1,'接水榭红裳少女出场'),row(t(1202,4,14,12),1,'依正文午间易容'),row(t(1202,4,14,13),1,'席间奉茶解穴'),row(t(1202,4,14,14),2,'引舟穿太湖水路'),row(t(1202,4,14,16),1,'湖心凿舟逃生'),row(t(1202,4,14,17),1,'至曼陀山庄初见'),
 ]],
 ['十四',[
  row(t(1202,5,21,20),2,'夜中密谋聚众'),row(t(1202,5,22,8),1,'次日清晨生擒'),row(t(1202,5,22,9),1,'当场代赎'),row(t(1202,5,22,10),1,'名宿随即到场'),row(t(1202,5,22,11),1,'马夫人控诉'),row(t(1202,5,22,12),1,'现场揭示身世'),
 ]],
 ['二十一',[
  row(t(1202,7,27,8),1,'湖畔阿紫藏鼎的当前叙述'),row(t(1202,7,27,9),1,'湖畔试探劝阻'),row(t(1202,7,27,10),1,'恶人突袭'),row(t(1202,7,27,11),1,'危急时乔峰救援'),row(t(1202,7,27,12),2,'竹舍宴饮与试探'),row(t(1202,7,27,14),1,'席间定今夜三更战约'),row(t(1202,7,27,18),2,'斜阳中易容'),row(t(1202,7,27,22),1,'夜雨赴桥'),
 ]],
 ['二十二',[
  row(t(1202,7,27,23),1,'三更候敌'),row(t(1202,7,28,0),1,'当场出掌'),row(t(1202,7,28,1),1,'立即揭穿'),row(t(1202,7,28,2),1,'临终吐露'),row(t(1202,7,28,3),3,'余夜守灵至破晓'),row(t(1202,7,28,6),3,'徒手掘墓及立碑'),row(t(1202,7,28,9),1,'母女闻讯赶至'),row(t(1202,7,28,10),1,'收拾启程北上'),
 ]],
];
let last=-Infinity,count=0; const pending=[];
function change(file,values){const p=path.join(directory,file),original=fs.readFileSync(p,'utf8'),before=JSON.parse(original),eol=original.includes('\r\n')?'\r\n':'\n';let next=original;for(const [key,value] of Object.entries(values)){const re=new RegExp(`("${key}": )\\{[^{}]*\\}`,'u');assert.ok(re.test(next),file);const block=JSON.stringify(value,null,2).split('\n').map((s,i)=>i?'  '+s:s).join(eol);next=next.replace(re,(_,prefix)=>prefix+block);}const strip=({触发条件,事件结束时间,...rest})=>rest;assert.deepEqual(strip(JSON.parse(next)),strip(before),file);if(next!==original)pending.push([p,next]);}
for(const [chapter,rows] of schedules){const files=fs.readdirSync(directory).filter(f=>f.startsWith(`天龙第${chapter}回`)&&/回(?!00)\d{2}-.*\.yaml$/u.test(f)).sort();assert.equal(files.length,rows.length,chapter);for(const [i,file] of files.entries()){const [start,end,reason]=rows[i];assert.ok(minutes(start)>=last,file);assert.ok(minutes(end)-minutes(start)>=60,file);last=minutes(end);change(file,{触发条件:{类型:'时间',...start},事件结束时间:end});count++;console.log(`${file}: ${JSON.stringify(start)} → ${JSON.stringify(end)} ${reason}`);}const debut=`天龙第${chapter}回00-人物登场.yaml`;if(fs.existsSync(path.join(directory,debut)))change(debut,{触发条件:{类型:'时间',...rows[0][0]}});}
function boundary(prefix,field){const f=fs.readdirSync(directory).find(x=>x.startsWith(prefix));assert.ok(f,prefix);return minutes(JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))[field]);}
for(const [i,prior,next] of [[0,'天龙第一回08-','天龙第三回01-'],[1,'天龙第四回06-','天龙第六回01-'],[2,'天龙第七回08-',null],[3,null,'天龙第十回01-'],[4,'天龙第十一回06-','天龙第十三回01-'],[5,'天龙第十三回08-','天龙第十五回01-'],[6,'天龙第二十回07-',null],[7,null,'天龙第二十三回01-']]){if(prior)assert.ok(minutes(schedules[i][1][0][0])>=boundary(prior,'事件结束时间'),prior);if(next)assert.ok(minutes(schedules[i][1].at(-1)[1])<=boundary(next,'触发条件'),next);}
assert.equal(count,54);if(process.argv.includes('--apply'))for(const [p,data] of pending)fs.writeFileSync(p,data);console.log(`${process.argv.includes('--apply')?'changed':'would-change'} files: ${pending.length}; reviewed: ${count}; boundaries: PASS`);
