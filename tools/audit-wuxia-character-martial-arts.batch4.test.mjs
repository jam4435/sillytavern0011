import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const root = process.cwd();
const mappings = [
  ['玉女心经口诀', '玉女心经'], ['全真入门拳法', '全真掌法'], ['丐帮心法', '叫花行气诀'],
  ['九阴真经(逆)', '九阴假经'], ['水上飘轻功', '铁掌水上飘'], ['叫化棒法', '打狗棒法'],
  ['一阳指基础', '段氏基础指法'], ['玉女心经内功', '玉女心经'], ['玉女心经外功', '玉女心经'],
  ['北冥真气', '北冥神功'],
];

function worldbookFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...worldbookFiles(full));
    else if (entry.isFile() && full.endsWith('.yaml')) out.push(full);
  }
  return out;
}

function martialArtKeys(eventData) {
  const keys = [];
  for (const operation of ['insert', 'update', 'delete']) {
    for (const change of Object.values(eventData?.[operation] ?? {})) {
      if (change && typeof change === 'object' && change.功法 && typeof change.功法 === 'object') {
        keys.push(...Object.keys(change.功法));
      }
    }
  }
  return keys;
}

describe('fifth batch fourth group canonical martial-art aliases', () => {
  const dir = path.join(root, '世界书/金庸群侠传1/世界书');
  const files = worldbookFiles(dir);
  const allKeys = new Set();
  for (const file of files) {
    // Parsing every event also detects duplicate mapping keys, which were once
    // accidentally introduced when inner/outer Jade Maiden skills were merged.
    for (const key of martialArtKeys(parseYaml(fs.readFileSync(file, 'utf8')))) allKeys.add(key);
  }

  for (const [oldName, newName] of mappings) {
    it(`removes ${oldName} martial-art key and preserves ${newName}`, () => {
      expect(allKeys.has(oldName)).toBe(false);
      expect(allKeys.has(newName)).toBe(true);
    });
  }

  it('records inner and outer Jade Maiden practice as one martial art on Yang Guo', () => {
    const eventData = parseYaml(fs.readFileSync(
      path.join(dir, '神雕第七回08-山谷搭茅屋养伤修炼一年有余.yaml'), 'utf8',
    ));
    const keys = Object.keys(eventData.update.杨过.功法);
    expect(keys.filter(key => key === '玉女心经')).toHaveLength(1);
    expect(eventData.update.杨过.功法.玉女心经.掌握程度).toContain('内外功全部练成');
  });

  const furtherAliases = [
    { file: '神雕第九回00-人物登场.yaml', operation: 'insert', actor: '耶律齐', old: '全真派掌法', canonical: '全真掌法', mastery: '炉火纯青' },
    { file: '神雕第十九回00-人物登场.yaml', operation: 'insert', actor: '裘千尺', old: '枣核吐射', canonical: '枣核钉', mastery: '出神入化' },
    { file: '神雕第三十回00-人物登场.yaml', operation: 'update', actor: '一灯大师', old: '先天气功', canonical: '先天功', mastery: '出神入化' },
  ];

  for (const item of furtherAliases) {
    it(`uses existing official skill ${item.canonical} for ${item.actor}`, () => {
      const document = parseYaml(fs.readFileSync(path.join(dir, item.file), 'utf8'));
      const arts = document[item.operation][item.actor].功法;
      const official = JSON.parse(fs.readFileSync(
        path.join(root, 'src/武侠/data/_合并后功法.json'), 'utf8',
      )).功法;
      expect(arts[item.old]).toBeUndefined();
      expect(Object.keys(arts)).toContain(item.canonical);
      expect(arts[item.canonical].掌握程度).toMatch(new RegExp(`^${item.mastery}`));
      expect(official.filter(skill => skill.功法名称 === item.canonical)).toHaveLength(1);
    });
  }
});
