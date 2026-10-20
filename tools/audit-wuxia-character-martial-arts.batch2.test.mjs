import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const root = path.join(process.cwd(), '世界书', '金庸群侠传1', '世界书');
const dbPath = path.join(process.cwd(), 'src', '武侠', 'data', '_合并后功法.json');

function readEvent(filename) {
  return parseYaml(readFileSync(path.join(root, filename), 'utf8'));
}

describe('wuxia martial arts audit batch 2', () => {
  it('第五批第二组：补齐两个已确认的原著独立武学', () => {
    const db = JSON.parse(readFileSync(dbPath, 'utf8'));
    const byName = new Map(db.功法.map(item => [item.功法名称, item]));

    const whiteSnake = byName.get('白蟒鞭法');
    expect(whiteSnake).toBeDefined();
    expect(whiteSnake.类型).toBe('鞭法');
    expect(whiteSnake.功法品阶).toBe('上乘');
    expect(whiteSnake.来源类型).toBe('原著明示');

    const ailao = byName.get('哀牢山三十六剑');
    expect(ailao).toBeDefined();
    expect(ailao.类型).toBe('剑法');
    expect(ailao.功法品阶).toBe('上乘');
    expect(ailao.来源类型).toBe('原著明示');

    const meichao = readEvent('射雕第十回04-往事如烟.yaml');
    expect(meichao.insert.梅超风.功法.白蟒鞭法.掌握程度).toBe('炉火纯青');

    const zhuziliu = readEvent('射雕第三十回00-人物登场.yaml');
    expect(zhuziliu.insert.书生.功法.哀牢山三十六剑.掌握程度).toBe('融会贯通');
  });
});
