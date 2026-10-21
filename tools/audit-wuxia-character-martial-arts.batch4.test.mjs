import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

function martialArtKeys(text) {
  const lines = text.split(/\r?\n/);
  const keys = new Set(); let inMartialArts = false; let sectionIndent = -1;
  for (const line of lines) {
    const match = line.match(/^(\s*)功法:\s*$/);
    if (match) { inMartialArts = true; sectionIndent = match[1].length; continue; }
    if (!inMartialArts) continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (line.trim() && indent <= sectionIndent) { inMartialArts = false; continue; }
    const key = line.match(/^\s+(?:["']?)([^\s"':]+)(?:["']?):\s*$/)?.[1];
    if (key) keys.add(key);
  }
  return keys;
}

describe('fifth batch fourth group canonical martial-art aliases', () => {
  const files = worldbookFiles(path.join(root, '世界书/金庸群侠传1/世界书'));
  const allKeys = new Set();
  for (const file of files) for (const key of martialArtKeys(fs.readFileSync(file, 'utf8'))) allKeys.add(key);
  for (const [oldName, newName] of mappings) {
    it(`removes ${oldName} martial-art key and preserves ${newName}`, () => {
      expect(allKeys.has(oldName)).toBe(false);
      expect(allKeys.has(newName)).toBe(true);
    });
  }
});
