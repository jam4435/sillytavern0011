// Read-only audit of selected characters against the committed causal order.
import fs from 'node:fs';
import path from 'node:path';

const root = '世界书/金庸群侠传1/世界书';
const plan = JSON.parse(fs.readFileSync('scripts/data/tianlong-causal-order.json', 'utf8'));
const { order, aliases } = plan;
const targets = new Set(['虚竹', '游坦之', '慕容复', '李清露', '苏星河', '丁春秋', '乔峰', '阿紫', '阿朱', '玄慈', '叶二娘', '段正淳', '段正明', '萧远山', '慕容博', '王语嫣', '鸠摩智', '段誉']);
const files = fs.readdirSync(root).filter(x => /^天龙第.*回\d\d-.*\.yaml$/u.test(x));
const docs = new Map(files.map(f => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(root, f), 'utf8').replace(/^\uFEFF/, ''))]));
const minutes = t => (((((t.年 * 12 + t.月) * 30 + t.日) * 24 + (t.时 || 0)) * 60) + (t.分 || 0));
const nodes = order.map((key, index) => {
  if (!docs.has(key)) throw Error(`missing causal event ${key}`);
  return { key, data: docs.get(key), index, debut: false };
});
for (const [key, data] of docs) if (/回00-/u.test(key)) nodes.push({ key, data, index: -1, debut: true });
nodes.sort((a, b) => minutes(a.data.触发条件) - minutes(b.data.触发条件) || (Number(b.debut) - Number(a.debut)) || a.index - b.index || a.key.localeCompare(b.key));
const object = x => x && typeof x === 'object' && !Array.isArray(x);
function merge(dst, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (object(dst[k]) && object(v)) merge(dst[k], v);
    else dst[k] = structuredClone(v);
  }
}
function remove(dst, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (!Object.hasOwn(dst, k)) continue;
    if (object(v) && Object.keys(v).length) {
      if (object(dst[k])) remove(dst[k], v);
      if (object(dst[k]) && !Object.keys(dst[k]).length) delete dst[k];
    } else delete dst[k];
  }
}
const state = {}, initialized = new Map(), dead = new Map(), findings = [];
const report = (key, message) => findings.push(`${key}: ${message}`);
const eventKeys = [...docs.keys()].filter(key => !/回00-/u.test(key));
if (order.length !== 364 || new Set(order).size !== 364) report('order', `应有364个唯一普通事件，实际 ${order.length} 条、${new Set(order).size} 个唯一键`);
for (const key of eventKeys) if (!order.includes(key)) report(key, '普通事件未列入因果顺序');
for (const key of order) if (!eventKeys.includes(key)) report(key, '因果顺序引用了不存在的普通事件');
let previousEnd = -Infinity;
for (const key of order) {
  const event = docs.get(key), start = minutes(event.触发条件), end = minutes(event.事件结束时间);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 60) report(key, '时间无效或持续不足一小时');
  if (start < previousEnd) report(key, '开始时间早于上一事件结束');
  previousEnd = end;
}
const resolve = prefix => {
  const matches = order.filter(key => key.startsWith(prefix));
  if (matches.length !== 1) { report(prefix, `应找到唯一事件，实际 ${matches.length} 个`); return -1; }
  return order.indexOf(matches[0]);
};
for (const [before, after] of [
  ['天龙第二十八回04-', '天龙第二十七回04-'],
  ['天龙第三十二回04-', '天龙第三十四回06-'],
  ['天龙第三十四回06-', '天龙第三十回06-'],
  ['天龙第三十二回07-', '天龙第三十回06-'],
  ['天龙第三十五回07-', '天龙第三十回06-'],
  ['天龙第三十回08-', '天龙第四十一回01-'],
  ['天龙第四十三回08-', '天龙第三十六回01-'],
  ['天龙第三十七回07-', '天龙第三十八回01-'],
]) {
  const a = resolve(before), b = resolve(after);
  if (a >= 0 && b >= 0 && a >= b) report(after, `因果前置 ${before} 未先发生`);
}
// Sixteen removed duplicate events and one renamed event have aliases.
if (Object.keys(aliases).length !== 17) report('aliases', `应保留16个删并事件及1个改名事件的映射，实际 ${Object.keys(aliases).length} 个`);
for (const [oldKey, replacement] of Object.entries(aliases)) {
  if (docs.has(oldKey)) report(oldKey, '旧事件仍有源文件');
  if (!docs.has(replacement)) report(oldKey, `映射目标不存在: ${replacement}`);
  for (const [key, data] of docs) if (Object.hasOwn(data.后续事件 || {}, oldKey)) report(key, `后续事件仍引用旧键 ${oldKey}`);
}
const accessionKey = order[resolve('天龙第三十九回01-')], abdicationKey = order[resolve('天龙第四十八回09-')];
if (accessionKey && abdicationKey) {
  const start = docs.get(accessionKey).触发条件, end = docs.get(abdicationKey).事件结束时间;
  if (minutes(end) - minutes(start) !== 40 * 360 * 24 * 60) report(abdicationKey, '登基至退位并非恰好40个360天历年');
  if (minutes(start) !== minutes(plan.accession) || minutes(end) !== minutes(plan.abdication)) report(abdicationKey, '在位起止与因果计划不一致');
}
const checks = [
  ['天龙第二十七回04-', '游坦之', '功法', '冰蚕神掌'],
  ['天龙第三十回06-', '虚竹', '功法', '天山折梅手'],
  ['天龙第三十回06-', '虚竹', '功法', '生死符'],
  ['天龙第三十五回08-', '虚竹', '功法', '天山六阳掌'],
  ['天龙第三十回06-', '虚竹', '身份', '逍遥派掌门'],
  ['天龙第三十六回01-', '虚竹', '身份', '灵鹫宫尊主'],
  ['天龙第三十八回02-', '慕容复', '身份', '姑苏慕容氏家主'],
];
for (const {key, data} of nodes) {
  for (const [prefix, who, field, item] of checks) if (key.startsWith(prefix) && !state[who]?.[field]?.[item]) report(key, `${who} 使用/担任前缺少 ${field}.${item}`);
  const people = new Set([...(data.参与人物 || []), ...['insert', 'update', 'delete'].flatMap(op => Object.keys(data[op] || {}))]);
  for (const who of people) if (targets.has(who) && !initialized.has(who) && !data.insert?.[who]?.初始属性) report(key, `${who} 在完整初始化前参与或受差分`);
  for (const op of ['insert', 'update']) for (const [who, delta] of Object.entries(data[op] || {})) {
    if (!targets.has(who)) continue;
    const full = !!(delta.初始属性 && delta.出生年份);
    if (full) {
      if (initialized.has(who)) report(key, `${who} 重复完整初始化，首次 ${initialized.get(who)}`);
      else initialized.set(who, key);
    }
    if (dead.has(who) && typeof delta.状态 === 'string' && !/死亡|已死|圆寂|身亡|绝命/u.test(delta.状态)) report(key, `${who} 死后状态写为 ${delta.状态}，死亡于 ${dead.get(who)}`);
    if (typeof delta.状态 === 'string' && state[who]?.状态 !== undefined && state[who].状态 !== delta.状态) console.log(`状态 ${key}: ${who}: ${state[who].状态} -> ${delta.状态}`);
    const levels = ['初窥门径', '略有小成', '融会贯通', '炉火纯青', '出神入化'];
    for (const [name, skill] of Object.entries(delta.功法 || {})) {
      const previous = state[who]?.功法?.[name]?.掌握程度, next = skill?.掌握程度;
      const oldRank = levels.findIndex(level => typeof previous === 'string' && previous.startsWith(level));
      const newRank = levels.findIndex(level => typeof next === 'string' && next.startsWith(level));
      if (oldRank >= 0 && newRank >= 0 && newRank < oldRank) report(key, `${who}.${name} 掌握程度由 ${previous} 降为 ${next}`);
    }
    for (const field of ['身份', '关系网']) for (const [name, value] of Object.entries(delta[field] || {})) {
      const prior = state[who]?.[field]?.[name];
      if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(value)) console.log(`覆盖 ${key}: ${who}.${field}.${name}: ${JSON.stringify(prior)} -> ${JSON.stringify(value)}`);
    }
    merge(state[who] ||= {}, delta);
    if (typeof delta.状态 === 'string' && /^(死亡|已死|身亡|圆寂|绝命)/u.test(delta.状态)) dead.set(who, key);
  }
  for (const [who, delta] of Object.entries(data.delete || {})) if (targets.has(who) && state[who]) remove(state[who], delta);
  if (key.startsWith('天龙第十七回03-') && state.王语嫣?.状态 !== '健康（悲酥清风已解）') {
    report(key, '磨坊脱险后必须结算王语嫣悲酥清风解毒状态');
  }
}
for (const who of targets) console.log(`最终 ${who}: ${JSON.stringify({首登: initialized.get(who), 状态: state[who]?.状态, 身份: state[who]?.身份, 功法: state[who]?.功法})}`);
console.log(`\n审计发现 ${findings.length} 条：`);
for (const finding of findings) console.log(finding);
if (findings.length) process.exitCode = 1;
