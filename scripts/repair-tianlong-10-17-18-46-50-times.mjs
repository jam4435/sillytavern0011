// Historical round-1 schedule; round 2 owns the current causal timeline.
if (process.argv.includes('--apply')) {
  throw new Error('旧排期已停用，请使用 scripts/repair-tianlong-causal-timeline.mjs --apply');
}
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wuxiaCalendarTimeToTotalMinutes as minutes, totalMinutesToWuxiaCalendarTime as fromMinutes } from '../src/shared/wuxiaCalendar.js';

const directory = path.join(fileURLToPath(new URL('../', import.meta.url)), '世界书/金庸群侠传1/世界书');
const t = (年, 月, 日, 时) => ({ 年, 月, 日, 时, 分: 0 });
const row = (start, hours, reason) => [start, fromMinutes(minutes(start) + hours * 60), reason];
const schedules = [
 ['十', [
  row(t(1202,3,25,8),4,'赴寺求诊'), row(t(1202,3,25,12),1,'枯荣指点'), row(t(1202,3,25,13),1,'拜帖突至'), row(t(1202,3,25,14),3,'剃度分卷练阵'), row(t(1202,3,25,17),1,'同时默记，以回放顺序接续'), row(t(1202,3,25,18),1,'国师登堂交涉'), row(t(1202,3,25,19),2,'六僧合阵激战'), row(t(1202,3,25,21),1,'当场毁谱'), row(t(1202,3,25,22),1,'紧接发剑'), row(t(1202,3,25,23),1,'当场擒人离寺；长途由第十一回展开'),
 ]],
 ['十七', [
  row(t(1202,5,23,14),2,'接辞位后放毒捆人'), row(t(1202,5,23,16),1,'同期避毒入磨坊，按回放顺序'), row(t(1202,5,23,17),1,'立足未稳即遭追兵'), row(t(1202,5,29,14),4,'千里日夜返少室山，含抵家悲哭'), row(t(1202,5,29,18),1,'巡僧闻声而至，奔寺'), row(t(1202,5,29,19),1,'夜探禅房'), row(t(1202,5,29,20),1,'众僧立刻围攻'), row(t(1202,5,29,21),1,'当场突围'), row(t(1202,5,29,22),1,'镜后发现伤者'), row(t(1202,5,29,23),1,'抱人破围启程'),
 ]],
 ['十八', [
  row(t(1202,5,30,0),96,'昼夜护送重伤阿朱，寻访神医四日'), row(t(1202,6,4,0),2,'群雄已会师，当前誓师场面'), row(t(1202,6,4,2),1,'直闯庄院'), row(t(1202,6,4,3),1,'当场托付'), row(t(1202,6,4,4),2,'多人对饮绝交酒'), row(t(1202,6,4,6),2,'群豪围攻'), row(t(1202,6,4,8),2,'碎盾交战'), row(t(1202,6,4,10),2,'数时辰鏖战后力竭'), row(t(1202,6,4,12),1,'危急中破顶救走'),
 ]],
 ['四十六', [
  row(t(1205,6,1,8),1,'阵前合围威逼'), row(t(1205,6,1,9),1,'当场拒降'), row(t(1205,6,1,10),1,'立即下令放箭'), row(t(1205,6,1,11),1,'箭阵中突袭擒帝'), row(t(1205,6,1,12),1,'逼折箭立誓'), row(t(1205,6,1,13),1,'退军之际嘲讽'), row(t(1205,6,1,14),1,'当场自戕'), row(t(1205,6,1,15),1,'阿紫悲恸跳崖'),
 ]],
 ['四十七', [
  row(t(1205,6,1,16),2,'现场悲悼辞别'), row(t(1205,6,1,18),240,'南归途中至姑苏，保留十日'), row(t(1205,6,11,18),1,'荒郊见群童'), row(t(1205,6,11,19),1,'同场见慕容复'), row(t(1205,6,11,20),1,'同场阿碧守候'), row(t(1205,6,11,21),1,'同场释怀'), row(t(1205,6,11,22),480,'姑苏至大理漫长归途及亲政二十日'), row(t(1205,7,1,22),240,'切换虚竹归天山行程，十日'),
 ]],
 ['四十八', [
  row(t(1205,7,12,8),6,'重复归国登基及整肃'), row(t(1205,7,12,14),240,'多日研药日渐消瘦'), row(t(1205,7,22,14),168,'工匠赴无量山起运玉像七日'), row(t(1205,8,1,18),1,'暮色烛下观像'), row(t(1205,8,1,19),1,'当场顿悟'), row(t(1205,8,1,20),1,'当场辞别决定'), row(t(1205,8,2,8),6,'筹备车马并饯别'), row(t(1205,8,5,8),6,'准备册封典礼'), row(t(1205,8,5,14),345600,'四十载治世及暮年禅位出家'),
 ]],
 ['四十九', [
  row(t(1245,8,5,14),6,'转至虚竹受任施政；与前回四十年跨度有正文先后冲突'), row(t(1245,8,5,20),240,'配药施治及群体痊愈十日'), row(t(1245,8,15,20),2,'伤愈集众立誓'), row(t(1245,8,16,8),4,'死后数年早已包含在前回四十年中'), row(t(1245,8,16,12),720,'密室闭门传授练成两项绝学，三十日'), row(t(1245,9,16,12),3,'拜别后登顶追思'),
 ]],
 ['五十', [
  row(t(1245,9,17,16),2,'暮色中全书风云总述'), row(t(1245,9,17,18),1,'重复四十载治世及剃度作为回放节点；正文差分重复不可由时间消除'), row(t(1245,9,18,8),6,'已完成传功后的整装归隐'), row(t(1245,9,18,16),2,'残阳荒丘现况'), row(t(1245,9,18,18),1,'深秋追述；同年六月与前述四十年冲突'), row(t(1245,9,18,19),2,'凭吊及风沙意象，数十年为背景追述'),
 ]],
];
let last = -Infinity; const pending = []; let count = 0;
function change(file, values) {
 const p = path.join(directory,file), original = fs.readFileSync(p,'utf8'), before = JSON.parse(original), eol = original.includes('\r\n') ? '\r\n' : '\n'; let next = original;
 for (const [key,value] of Object.entries(values)) { const re = new RegExp(`("${key}": )\\{[^{}]*\\}`, 'u'); assert.ok(re.test(next),file); const block = JSON.stringify(value,null,2).split('\n').map((s,i)=>i?'  '+s:s).join(eol); next = next.replace(re,(_,prefix)=>prefix+block); }
 const strip = ({触发条件,事件结束时间,...rest})=>rest; assert.deepEqual(strip(JSON.parse(next)),strip(before),file); if(next!==original) pending.push([p,next]);
}
for (const [chapter,rows] of schedules) {
 const files=fs.readdirSync(directory).filter(f=>f.startsWith(`天龙第${chapter}回`) && /回(?!00)\d{2}-.*\.yaml$/u.test(f)).sort(); assert.equal(files.length,rows.length,chapter);
 for(const [i,file] of files.entries()){const [start,end,reason]=rows[i]; assert.ok(minutes(start)>=last,file); assert.ok(minutes(end)-minutes(start)>=60,file); last=minutes(end); change(file,{触发条件:{类型:'时间',...start},事件结束时间:end}); count++; console.log(`${file}: ${JSON.stringify(start)} → ${JSON.stringify(end)} ${reason}`);}
 const debut=`天龙第${chapter}回00-人物登场.yaml`; if(fs.existsSync(path.join(directory,debut))) change(debut,{触发条件:{类型:'时间',...rows[0][0]}});
}
function boundary(prefix,field){const f=fs.readdirSync(directory).find(x=>x.startsWith(prefix)); assert.ok(f,prefix); return minutes(JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))[field]);}
assert.ok(minutes(schedules[0][1][0][0])>=boundary('天龙第九回06-','事件结束时间')); assert.ok(minutes(schedules[0][1].at(-1)[1])<=boundary('天龙第十一回01-','触发条件')); assert.equal(minutes(schedules[1][1][0][0]),boundary('天龙第十六回08-','事件结束时间')); assert.ok(minutes(schedules[2][1].at(-1)[1])<=boundary('天龙第十九回01-','触发条件')); assert.ok(minutes(schedules[3][1][0][0])>=boundary('天龙第四十五回08-','事件结束时间')); assert.equal(count,66);
if(process.argv.includes('--apply')) for(const [p,data] of pending) fs.writeFileSync(p,data);
console.log(`${process.argv.includes('--apply')?'changed':'would-change'} files: ${pending.length}; reviewed: ${count}; boundaries: PASS`);
