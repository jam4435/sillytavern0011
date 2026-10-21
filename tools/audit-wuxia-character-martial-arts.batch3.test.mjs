import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const cases = [
  {
    file: '世界书/金庸群侠传1/世界书/神雕第六回00-人物登场.yaml',
    oldNames: ['古墓派剑法', '古墓派轻功'],
    newNames: ['玉女剑法', '捕雀功'],
  },
  {
    file: '世界书/金庸群侠传1/世界书/神雕第一回00-人物登场.yaml',
    oldNames: ['古墓派剑法'],
    newNames: ['玉女剑法'],
  },
  {
    file: '世界书/金庸群侠传1/世界书/神雕第三十六回07-何师我暗算击败耶律齐.yaml',
    oldNames: ['大风袖'],
    newNames: ['狂风迅雷功'],
  },
  {
    file: '世界书/金庸群侠传1/世界书/天龙第十回00-人物登场.yaml',
    oldNames: ['密宗心法'],
    newNames: ['西藏密宗内功'],
  },
];

describe('fifth batch third group canonical martial-art aliases', () => {
  for (const item of cases) {
    it(`normalizes ${item.file}`, () => {
      const text = fs.readFileSync(path.join(root, item.file), 'utf8');
      for (const oldName of item.oldNames) expect(text).not.toContain(oldName);
      for (const newName of item.newNames) expect(text).toContain(newName);
    });
  }
});
