import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'src', '事件脚本', 'generated', 'event-data');
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
const checkpoint = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'checkpoints', 'checkpoint-0006.json'), 'utf8'),
);

const aliasToCanonical = new Map([
  ['完颜康', '杨康'],
  ['馬光佐', '马光佐'],
  ['渔夫', '泗水渔隐'],
  ['点苍渔隐', '泗水渔隐'],
  ['农夫', '武三通'],
  ['书生', '朱子柳'],
  ['天竺僧人', '天竺僧'],
]);

const canonicalName = name => aliasToCanonical.get(name) ?? name;
const aliasesByCanonical = new Map();
for (const [alias, canonical] of aliasToCanonical) {
  if (!aliasesByCanonical.has(canonical)) aliasesByCanonical.set(canonical, []);
  aliasesByCanonical.get(canonical).push(alias);
}

const supplementalState = {};
const shardDir = path.join(dataDir, 'shards');
for (const filename of fs.readdirSync(shardDir).filter(name => name.endsWith('.json')).sort()) {
  const shard = JSON.parse(fs.readFileSync(path.join(shardDir, filename), 'utf8'));
  for (const definition of Object.values(shard.definitions ?? {})) {
    for (const diff of [definition.insert, definition.update]) {
      for (const [rawName, value] of Object.entries(diff ?? {})) {
        if (!value || typeof value !== 'object') continue;
        const name = canonicalName(rawName);
        const current = supplementalState[name] ?? {};
        supplementalState[name] = {
          ...current,
          ...(value.性别 ? { 性别: value.性别 } : {}),
          ...(value.外貌 ? { 外貌: value.外貌 } : {}),
          ...(value.状态 ? { 状态: value.状态 } : {}),
          ...(value.身份 ? { 身份: { ...(current.身份 ?? {}), ...value.身份 } } : {}),
          ...(value.关系网 ? { 关系网: { ...(current.关系网 ?? {}), ...value.关系网 } } : {}),
        };
      }
    }
  }
}

const mergedState = {};
for (const [rawName, value] of Object.entries(checkpoint.characterState ?? {})) {
  const name = canonicalName(rawName);
  const current = mergedState[name] ?? {};
  mergedState[name] = {
    ...current,
    ...value,
    身份: { ...(current.身份 ?? {}), ...(value.身份 ?? {}) },
    关系网: { ...(current.关系网 ?? {}), ...(value.关系网 ?? {}) },
  };
}
for (const [name, value] of Object.entries(supplementalState)) {
  const current = mergedState[name] ?? {};
  mergedState[name] = {
    ...value,
    ...current,
    身份: { ...(value.身份 ?? {}), ...(current.身份 ?? {}) },
    关系网: { ...(value.关系网 ?? {}), ...(current.关系网 ?? {}) },
  };
}

const stats = new Map();
function ensure(name) {
  const canonical = canonicalName(name);
  if (!stats.has(canonical)) {
    stats.set(canonical, {
      name: canonical,
      events: 0,
      chapters: new Set(),
      series: new Set(),
      firstOrder: Number.POSITIVE_INFINITY,
      lastOrder: Number.NEGATIVE_INFINITY,
    });
  }
  return stats.get(canonical);
}

for (const event of manifest.events) {
  if (event.kind !== 'ordinary') continue;
  for (const rawName of event.participants ?? []) {
    const item = ensure(rawName);
    item.events += 1;
    item.chapters.add(`${event.series}${event.chapter}`);
    item.series.add(event.series);
    item.firstOrder = Math.min(item.firstOrder, event.order);
    item.lastOrder = Math.max(item.lastOrder, event.order);
  }
}
for (const name of Object.keys(mergedState)) ensure(name);

const avatarCatalogText = fs.readFileSync(
  path.join(root, 'src', '武侠', 'utils', 'avatarCatalog.ts'),
  'utf8',
);
const presetNames = new Set();
for (const line of avatarCatalogText.split(/\r?\n/)) {
  if (!line.includes('createNpcAvatar(')) continue;
  for (const match of line.matchAll(/'([^']+)'/g)) presetNames.add(match[1]);
}

const generatedAvatarDir = path.join(os.homedir(), 'Pictures', '色图', '武侠人物图');
const generatedNames = new Set(
  fs.existsSync(generatedAvatarDir)
    ? fs.readdirSync(generatedAvatarDir).filter(name => /\.png$/i.test(name)).map(name => name.replace(/\.png$/i, ''))
    : [],
);

const coreNames = new Set([
  '郭靖', '黄蓉', '杨过', '小龙女', '杨康', '穆念慈', '郭芙', '郭襄',
  '欧阳锋', '洪七公', '黄药师', '周伯通', '一灯大师', '柯镇恶', '丘处机',
  '李莫愁', '金轮法王', '欧阳克', '完颜洪烈', '梅超风', '程英', '陆无双',
  '耶律齐', '尹志平', '赵志敬', '霍都', '公孙止', '裘千尺', '公孙绿萼',
]);

const genericNamePattern = /(客人|汉子|妇人|少年|乞丐|后生|管家|老爵爷|铁掌帮后生|之子)$/;
const leadershipPattern = /(帮主|掌门|教主|首领|可汗|王爷|王妃|公主|驸马|国师|法王|长老|将军|庄主|寨主|皇帝|大汗)/;

function eventPoints(count) {
  if (count >= 50) return 8;
  if (count >= 30) return 7;
  if (count >= 20) return 6;
  if (count >= 12) return 5;
  if (count >= 8) return 4;
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  if (count >= 2) return 1;
  return 0;
}

function chapterPoints(count) {
  if (count >= 20) return 4;
  if (count >= 12) return 3;
  if (count >= 6) return 2;
  if (count >= 3) return 1;
  return 0;
}

function relationPoints(count) {
  if (count >= 10) return 3;
  if (count >= 6) return 2;
  if (count >= 3) return 1;
  return 0;
}

function avatarStatus(name) {
  if (presetNames.has(name)) return '已有预设头像';
  if (generatedNames.has(name)) return '已生成待接入';
  return '缺失';
}

function tierFor({ name, score, eventCount, chapterCount }) {
  if (coreNames.has(name)) return 'S';
  if (!genericNamePattern.test(name) && (score >= 10 || eventCount >= 12 || chapterCount >= 7)) return 'A';
  if (!genericNamePattern.test(name) && (score >= 5 || eventCount >= 4)) return 'B';
  return 'C';
}

const rows = [...stats.values()].map(item => {
  const state = mergedState[item.name] ?? {};
  const relationCount = Object.keys(state.关系网 ?? {}).length;
  const identities = Object.keys(state.身份 ?? {});
  const identityText = Object.entries(state.身份 ?? {}).flatMap(([key, value]) => [key, String(value)]).join(' ');
  const span = Number.isFinite(item.firstOrder) ? item.lastOrder - item.firstOrder : 0;
  const appearance = String(state.外貌 ?? '').trim();
  const score =
    eventPoints(item.events) +
    chapterPoints(item.chapters.size) +
    relationPoints(relationCount) +
    (span >= 300 ? 2 : span >= 100 ? 1 : 0) +
    (leadershipPattern.test(identityText) ? 1 : 0) +
    (item.series.size > 1 ? 1 : 0) +
    (appearance ? 1 : 0);
  const base = {
    name: item.name,
    aliases: aliasesByCanonical.get(item.name) ?? [],
    score,
    eventCount: item.events,
    chapterCount: item.chapters.size,
    series: [...item.series],
    relationCount,
    span,
    gender: state.性别 ?? '',
    appearance,
    status: state.状态 ?? '',
    identities,
    avatarStatus: avatarStatus(item.name),
  };
  const tier = tierFor(base);
  return {
    ...base,
    tier,
    generateRecommendation: tier === 'S' || tier === 'A' ? '生成' : tier === 'B' ? '候补' : '不生成',
  };
});

rows.sort((a, b) => {
  const order = { S: 0, A: 1, B: 2, C: 3 };
  return order[a.tier] - order[b.tier] || b.score - a.score || b.eventCount - a.eventCount || a.name.localeCompare(b.name, 'zh-CN');
});

const grouped = Object.groupBy(rows, row => row.tier);
const output = {
  schemaVersion: 1,
  source: {
    eventManifest: 'src/事件脚本/generated/event-data/manifest.json',
    characterCheckpoint: 'src/事件脚本/generated/event-data/checkpoints/checkpoint-0006.json',
    eventCount: manifest.eventCount,
  },
  method: {
    S: '核心主角、主要同伴、主要反派及关键人物，结合事件事实人工复核',
    A: '高频或跨阶段重要角色：评分≥10、事件数≥12或章节数≥7',
    B: '常驻配角：评分≥5或事件数≥4',
    C: '一次性、低频、仅被提及、泛称或资料不足的角色',
  },
  totals: Object.fromEntries(['S', 'A', 'B', 'C'].map(tier => [tier, grouped[tier]?.length ?? 0])),
  characters: rows,
};

const generationOutput = {
  schemaVersion: output.schemaVersion,
  source: output.source,
  method: output.method,
  totals: output.totals,
  characters: rows.map(row => ({
    name: row.name,
    aliases: row.aliases,
    tier: row.tier,
    score: row.score,
    eventCount: row.eventCount,
    chapterCount: row.chapterCount,
    gender: row.gender,
    appearance: row.appearance,
    avatarStatus: row.avatarStatus,
    generateRecommendation: row.generateRecommendation,
  })),
};

const tierIndexOutput = {
  schemaVersion: output.schemaVersion,
  source: output.source,
  method: output.method,
  totals: output.totals,
  appearanceSource: '运行 scripts/analyze-wuxia-avatar-tiers.mjs 可从角色状态快照重新物化外貌变量',
  characters: rows.map(row => ({
    name: row.name,
    aliases: row.aliases,
    tier: row.tier,
    score: row.score,
    eventCount: row.eventCount,
    chapterCount: row.chapterCount,
    hasAppearance: Boolean(row.appearance),
    avatarStatus: row.avatarStatus,
    generateRecommendation: row.generateRecommendation,
  })),
};

if (process.argv.includes('--compact')) {
  console.log(`总数 ${rows.length}: ${JSON.stringify(output.totals)}`);
  for (const tier of ['S', 'A', 'B', 'C']) {
    console.log(`${tier}: ${(grouped[tier] ?? []).map(row => `${row.name}(${row.score}/${row.eventCount})`).join('、')}`);
  }
} else if (process.argv.includes('--markdown')) {
  console.log('# 武侠人物头像分档\n');
  console.log(`数据源覆盖 ${manifest.eventCount} 个事件；别名归并后共 ${rows.length} 名人物。\n`);
  for (const tier of ['S', 'A', 'B', 'C']) {
    console.log(`## ${tier} 档（${grouped[tier]?.length ?? 0} 人）\n`);
    console.log('| 人物 | 事件 | 章节 | 分数 | 外貌 | 头像状态 | 建议 |');
    console.log('| --- | ---: | ---: | ---: | --- | --- | --- |');
    for (const row of grouped[tier] ?? []) {
      console.log(`| ${row.name} | ${row.eventCount} | ${row.chapterCount} | ${row.score} | ${row.appearance ? '有' : '无'} | ${row.avatarStatus} | ${row.generateRecommendation} |`);
    }
    console.log('');
  }
} else if (process.argv.includes('--tier-index-json')) {
  console.log(JSON.stringify(tierIndexOutput));
} else if (process.argv.some(arg => arg.startsWith('--tier-json='))) {
  const tier = process.argv.find(arg => arg.startsWith('--tier-json='))?.split('=')[1]?.toUpperCase();
  if (!['S', 'A', 'B', 'C'].includes(tier)) throw new Error(`未知档位：${tier}`);
  const tierOutput = {
    ...generationOutput,
    characters: generationOutput.characters.filter(row => row.tier === tier),
  };
  console.log(JSON.stringify(tierOutput, null, process.argv.includes('--pretty') ? 2 : 0));
} else if (process.argv.includes('--generation-json')) {
  console.log(JSON.stringify(generationOutput));
} else if (process.argv.includes('--json-compact')) {
  console.log(JSON.stringify(output));
} else {
  console.log(JSON.stringify(output, null, 2));
}
